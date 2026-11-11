import type { FlightMonitor, NormalizedOffer, RunInfo } from '../../shared/flights'
import { formatMoney } from '../../shared/flights'
import { getSetting, setSetting } from '../database/queries'
import { broadcast } from '../events'
import { decodeSecret } from '../services/secrets'
import { notify } from '../services/notifications'
import { todayLocal } from './dates'
import { fingerprint } from './evaluate'
import { getAirport } from './geo'
import { adaptiveHours, buildUniverse, isStale, newSpecs, paxKey, planDeepen, planDiscovery, planValidate, ProviderLite } from './planner'
import { automatedProviders, getProvider } from './providers'
import { FlightProvider, ProviderContext, ProviderError, SearchQuery } from './providers/types'
import * as repo from './repo'
import { configErrors } from './validate'
import { displayTarget, loadFx, scoredOffers } from './views'
import { diversify, sortScored } from './evaluate'

/**
 * Executor de buscas. Roda dentro do servidor (sem Redis/BullMQ: app local de um usuário),
 * mas com as garantias de uma fila: tarefas persistidas, claim atômico (sem execução dupla),
 * retry com backoff, cancelamento, timeout por consulta e por execução, orçamento, cache e
 * retomada após reinício. Nenhuma IA aqui — só código.
 */

const log = (event: string, data: Record<string, unknown> = {}): void => {
  // log estruturado (uma linha JSON) — sem segredos
  console.log(JSON.stringify({ scope: 'flights', event, at: new Date().toISOString(), ...data }))
}

export async function setting(key: string): Promise<string | null> {
  return decodeSecret(await getSetting(key))
}

const CACHE_TTL: Record<string, number> = { travelpayouts: 6 * 3600_000, duffel: 20 * 60_000 }
const MAX_ATTEMPTS = 3
const PER_RUN_PARALLEL = 2

const controllers = new Map<number, AbortController>()
let activeRuns = 0
const waiting: (() => void)[] = []

async function acquire(): Promise<void> {
  const limit = Math.max(1, Number((await getSetting('flights_concurrency')) || 1))
  if (activeRuns < limit) {
    activeRuns++
    return
  }
  await new Promise<void>((res) => waiting.push(res))
  activeRuns++
}
function release(): void {
  activeRuns--
  waiting.shift()?.()
}

function changed(monitorId: number, runId?: number): void {
  broadcast('flights:updated', { monitorId, runId: runId ?? null })
}

/** Provedores automáticos utilizáveis para um monitor (configurados + habilitados nele). */
export async function usableProviders(m: FlightMonitor): Promise<{ list: FlightProvider[]; reasons: string[] }> {
  const reasons: string[] = []
  const list: FlightProvider[] = []
  for (const p of automatedProviders()) {
    if (m.config.providers.length && !m.config.providers.includes(p.id)) continue
    if ((await getSetting(`flights_provider_${p.id}_enabled`)) === '0') {
      reasons.push(`${p.label}: desativado.`)
      continue
    }
    const st = await p.status({ getSetting: setting })
    if (st.available) list.push(p)
    else reasons.push(`${p.label}: ${st.reason}`)
  }
  return { list, reasons }
}

export interface StartOptions {
  more?: number
}

/**
 * Inicia (ou devolve a já em curso — idempotente) uma execução. Retorna na hora;
 * o trabalho segue em segundo plano e o progresso chega por SSE `flights:updated`.
 */
export async function startRun(monitorId: number, trigger: RunInfo['trigger'], opts: StartOptions = {}): Promise<RunInfo> {
  const m = await repo.getMonitor(monitorId)
  if (!m) throw new Error('Monitoramento não encontrado.')
  const existing = await repo.activeRun(monitorId)
  if (existing) return existing
  const errs = configErrors(m.config, todayLocal())
  if (errs.length) throw new Error(`Configuração incompleta: ${errs[0]}`)
  if (m.status === 'paused' && trigger === 'schedule') throw new Error('Monitoramento pausado.')
  const { list, reasons } = await usableProviders(m)
  if (!list.length) {
    throw new Error(
      `Nenhuma fonte automática disponível. ${reasons.join(' ')} Configure uma fonte em "Fontes e execução" ou importe resultados.`.trim()
    )
  }
  if (opts.more) await repo.setMonitorMeta(monitorId, { extraDisplay: m.extraDisplay + opts.more })
  const runId = await repo.createRun(monitorId, trigger)
  log('run.start', { monitorId, runId, trigger, providers: list.map((p) => p.id) })
  changed(monitorId, runId)
  void (async () => {
    await acquire()
    try {
      await execute(runId, monitorId, list, trigger, opts)
    } catch (e) {
      log('run.crash', { runId, error: e instanceof Error ? e.message : String(e) })
      await repo.updateRun(runId, { status: 'failed', finishedAt: new Date().toISOString(), message: e instanceof Error ? e.message : String(e) })
      await repo.setMonitorMeta(monitorId, { lastError: e instanceof Error ? e.message : String(e) })
    } finally {
      release()
      controllers.delete(runId)
      changed(monitorId, runId)
    }
  })()
  return (await repo.getRun(runId))!
}

export function cancelRun(runId: number): boolean {
  const c = controllers.get(runId)
  if (!c) return false
  c.abort()
  return true
}

function lite(p: FlightProvider): ProviderLite {
  return { id: p.id, capabilities: p.capabilities }
}

/** Replaneja: descoberta (sempre), aprofundamento (pares com resultado), validação (top de cache). */
async function replan(m: FlightMonitor, providers: FlightProvider[], extraPairs: number): Promise<number> {
  const today = todayLocal()
  const u = buildUniverse(m.config, today)
  const pk = paxKey(m.config)
  const rt = m.config.dates.tripType === 'roundtrip'
  const lites = providers.map(lite)
  const existing = new Set((await repo.listTasks(m.id)).map((t) => t.key))
  let specs = planDiscovery(u, lites, pk, rt)

  // preços conhecidos por par e por data (das ofertas já guardadas e não excluídas)
  const fx = await loadFx()
  const { scored, rows } = await scoredOffers(m, fx)
  const pairMin = new Map<string, number>()
  const datePrices = new Map<string, Map<string, number>>()
  for (const s of scored) {
    if (s.ev.status === 'excluded' || !s.ev.cost.fareInCurrency || !rows.get(s.offer)!.available) continue
    const k = `${s.offer.slices[0].from}|${s.offer.slices[0].to}`
    const v = s.ev.cost.fareInCurrency.amountMinor
    pairMin.set(k, Math.min(pairMin.get(k) ?? Infinity, v))
    const dm = datePrices.get(k) ?? new Map<string, number>()
    const d = s.offer.slices[0].departLocal.slice(0, 10)
    dm.set(d, Math.min(dm.get(d) ?? Infinity, v))
    datePrices.set(k, dm)
  }
  // aprofunda só se houver fonte de data exata (senão a descoberta mensal já cobre tudo)
  const exact = lites.filter((p) => !p.capabilities.monthRange)
  if (exact.length && pairMin.size) specs = specs.concat(planDeepen(u, exact, pk, pairMin, datePrices, 4 + Math.ceil(Math.sqrt(u.pairs.length)) + extraPairs))
  // validação: as melhores (diversificadas) que vieram de cache/importação
  const target = displayTarget(m)
  const top = diversify(sortScored(scored.filter((s) => s.ev.status !== 'excluded' && rows.get(s.offer)!.available), m.config.preferences.strategy), target)
    .slice(0, Math.min(10, target))
    .filter((s) => s.offer.verification !== 'live')
    .map((s) => ({ origin: s.offer.slices[0].from, destination: s.offer.slices[0].to, departDate: s.offer.slices[0].departLocal.slice(0, 10), returnDate: s.offer.slices[1]?.departLocal.slice(0, 10) ?? null }))
  specs = specs.concat(planValidate(top, lites, pk))
  return repo.insertTasks(m.id, newSpecs(specs, existing))
}

function nextRunAt(m: FlightMonitor, from: Date): string | null {
  const s = m.config.schedule
  if (m.status !== 'active' || s.mode === 'manual') return null
  if (s.mode === 'hours') return new Date(from.getTime() + s.everyHours * 3600_000).toISOString()
  if (s.mode === 'adaptive') {
    const first = buildUniverse(m.config, todayLocal()).departDates[0] ?? null
    return new Date(from.getTime() + adaptiveHours(first, todayLocal()) * 3600_000).toISOString()
  }
  const n = new Date(from)
  n.setHours(s.hour, 0, 0, 0)
  if (n <= from) n.setDate(n.getDate() + 1)
  return n.toISOString()
}

/** Horas até uma consulta concluída "envelhecer" e ser refeita no recorrente. */
function refreshHours(m: FlightMonitor): number {
  const s = m.config.schedule
  if (s.mode === 'hours') return Math.max(3, s.everyHours - 1)
  if (s.mode === 'adaptive') return adaptiveHours(buildUniverse(m.config, todayLocal()).departDates[0] ?? null, todayLocal()) - 1
  return 20
}

async function execute(runId: number, monitorId: number, providers: FlightProvider[], trigger: RunInfo['trigger'], opts: StartOptions): Promise<void> {
  let m = (await repo.getMonitor(monitorId))!
  const ctl = new AbortController()
  controllers.set(runId, ctl)
  const started = Date.now()
  const deadline = started + m.config.budget.maxRunMinutes * 60_000
  const timer = setTimeout(() => ctl.abort(), m.config.budget.maxRunMinutes * 60_000 + 5000)
  const pk = paxKey(m.config)
  const day = todayLocal()
  const dayStart = new Date(`${day}T00:00:00`).toISOString()
  const stats = { planned: 0, done: 0, failed: 0, queries: 0, cacheHits: 0, offersFound: 0 }
  let retrying = 0
  const disabled = new Map<string, string>()
  let budgetHit: string | null = null
  const ctxBase: Omit<ProviderContext, 'signal'> = { getSetting: setting, now: () => new Date() }

  try {
    if (trigger === 'schedule') {
      // recorrente: refaz primeiro as consultas mais antigas (preço muda), dentro do orçamento
      const old = new Date(Date.now() - refreshHours(m) * 3600_000).toISOString()
      const tasks = await repo.listTasks(monitorId)
      if (tasks.some((t) => isStale(t, new Date(), refreshHours(m)))) await repo.requeueStale(monitorId, old, m.config.budget.maxQueriesPerRun)
    }
    stats.planned += await replan(m, providers, Math.floor((m.extraDisplay + (opts.more ?? 0)) / 5))
    const usedToday = await repo.monitorQueriesSince(monitorId, dayStart)

    let rounds = 0
    while (!ctl.signal.aborted && rounds++ < 20) {
      if (Date.now() > deadline) {
        budgetHit = 'Tempo máximo da execução atingido.'
        break
      }
      const remaining = m.config.budget.maxQueriesPerRun - stats.queries
      if (remaining <= 0) {
        budgetHit = `Limite de ${m.config.budget.maxQueriesPerRun} consultas por execução atingido.`
        break
      }
      if (usedToday + stats.queries >= m.config.budget.maxQueriesPerDay) {
        budgetHit = `Limite diário de ${m.config.budget.maxQueriesPerDay} consultas deste monitor atingido.`
        break
      }
      const ids = providers.filter((p) => !disabled.has(p.id)).map((p) => p.id)
      const batch = await repo.nextTasks(monitorId, ids, Math.min(remaining, 6))
      if (!batch.length) break
      // pool pequeno: no máx. PER_RUN_PARALLEL consultas simultâneas
      let cursor = 0
      const worker = async (): Promise<void> => {
        while (cursor < batch.length && !ctl.signal.aborted) {
          const t = batch[cursor++]
          if (disabled.has(t.provider)) continue
          if (stats.queries >= m.config.budget.maxQueriesPerRun) return
          const p = getProvider(t.provider)!
          const quota = p.capabilities.dailyQuota
          if (quota != null && (await repo.usageOn(p.id, day)) >= quota) {
            disabled.set(p.id, `Cota diária de ${quota} consultas do provedor atingida.`)
            continue
          }
          if (!(await repo.claimTask(t.id, runId))) continue // outra execução pegou
          const q: SearchQuery = {
            origin: t.origin,
            destination: t.destination,
            departDate: t.departDate,
            returnDate: t.returnDate,
            adults: m.config.passengers.adults,
            children: m.config.passengers.children,
            infants: m.config.passengers.infants,
            cabin: m.config.passengers.cabin,
            maxStops: m.config.constraints.maxStops,
            currency: m.config.currency
          }
          const cacheKey = `search:${p.id}:${JSON.stringify(q)}`
          const before = new Date().toISOString()
          try {
            let offers = await repo.cacheGet<NormalizedOffer[]>(cacheKey)
            if (offers) stats.cacheHits++
            else {
              stats.queries++
              await repo.incUsage(p.id, day)
              const r = await p.search!(q, { ...ctxBase, signal: ctl.signal })
              offers = r.offers
              await repo.cacheSet(cacheKey, offers, CACHE_TTL[p.id] ?? 3600_000)
            }
            const items = offers.map((o) => ({ offer: o, fp: fingerprint(o, pk) }))
            await repo.upsertOffers(monitorId, items, pk, runId)
            if (p.capabilities.livePrices && t.departDate.length === 10) {
              await repo.markMissing(monitorId, p.id, t.origin, t.destination, t.departDate, before, new Set(items.map((x) => x.fp)))
            }
            const min = offers.reduce<number | null>((b, o) => (o.price.currency === m.config.currency ? Math.min(b ?? Infinity, o.price.amountMinor) : b), null)
            await repo.finishTask(t.id, { status: 'done', resultCount: offers.length, minPriceMinor: min, currency: m.config.currency })
            stats.done++
            stats.offersFound += offers.length
          } catch (e) {
            const pe = e instanceof ProviderError ? e : new ProviderError('upstream', e instanceof Error ? e.message : String(e))
            const attempts = t.attempts + 1
            if (pe.fatal) disabled.set(p.id, pe.message)
            if (pe.retryable && attempts < MAX_ATTEMPTS && !ctl.signal.aborted) {
              const wait = pe.retryAfterMs ?? 2 ** attempts * 60_000
              await repo.finishTask(t.id, { status: 'pending', error: pe.message, retryAt: new Date(Date.now() + wait).toISOString() })
              retrying++
            } else if (ctl.signal.aborted) {
              await repo.finishTask(t.id, { status: 'pending', error: 'Interrompida (cancelamento/tempo).' })
            } else {
              await repo.finishTask(t.id, { status: pe.fatal ? 'pending' : 'failed', error: pe.message })
              if (!pe.fatal) stats.failed++
            }
            log('task.error', { runId, task: t.key, kind: pe.kind, message: pe.message })
          }
          await repo.updateRun(runId, stats)
          changed(monitorId, runId)
        }
      }
      await Promise.all(Array.from({ length: PER_RUN_PARALLEL }, worker))
      // a cada rodada, o que foi descoberto pode gerar aprofundamento/validação
      m = (await repo.getMonitor(monitorId))!
      stats.planned += await replan(m, providers.filter((p) => !disabled.has(p.id)), Math.floor((m.extraDisplay + (opts.more ?? 0)) / 5))
    }
  } finally {
    clearTimeout(timer)
  }

  const pendingLeft = (await repo.listTasks(monitorId)).filter((t) => t.status === 'pending').length
  const notes = [...disabled.entries()].map(([id, why]) => `${getProvider(id)?.label ?? id}: ${why}`)
  if (ctl.signal.aborted && !budgetHit) budgetHit = Date.now() > deadline ? 'Tempo máximo da execução atingido.' : 'Cancelada.'
  const troubled = stats.failed > 0 || notes.length > 0 || retrying > 0
  const status: RunInfo['status'] =
    stats.done === 0 && stats.cacheHits === 0 && troubled ? 'failed' : budgetHit && pendingLeft ? 'budget' : troubled ? 'partial' : 'done'
  const message = [
    budgetHit,
    retrying ? `${retrying} consulta(s) falharam temporariamente e serão tentadas de novo (backoff).` : null,
    pendingLeft ? `${pendingLeft} consulta(s) ainda na fila — use "Continuar busca".` : null,
    ...notes
  ]
    .filter(Boolean)
    .join(' ')
  await repo.updateRun(runId, { ...stats, status, finishedAt: new Date().toISOString(), message: message || null })
  const now = new Date()
  await repo.setMonitorMeta(monitorId, {
    lastRunAt: now.toISOString(),
    ...(stats.done > 0 || stats.cacheHits > 0 ? { lastSuccessAt: now.toISOString() } : {}),
    lastError: status === 'failed' ? message || 'Falha na busca.' : null,
    nextRunAt: nextRunAt(m, now)
  })
  log('run.end', { runId, monitorId, status, ...stats, pendingLeft, ms: Date.now() - started })
  try {
    await evaluateAlerts((await repo.getMonitor(monitorId))!, runId, new Date(started).toISOString())
  } catch (e) {
    log('alerts.error', { runId, error: e instanceof Error ? e.message : String(e) })
  }
}

// ── Alertas ───────────────────────────────────────────────────────────────────

/**
 * Regras de alerta sobre ofertas ELEGÍVEIS e comparáveis (mesma moeda e passageiros).
 * Cada alerta tem chave de deduplicação; `recordAlert` só aceita a primeira vez.
 */
export async function evaluateAlerts(m: FlightMonitor, runId: number | null, runStartIso: string): Promise<number> {
  const a = m.config.alerts
  const fx = await loadFx()
  const { scored, rows } = await scoredOffers(m, fx)
  const eligible = scored.filter((s) => s.ev.status === 'eligible' && rows.get(s.offer)!.available && s.ev.cost.fareInCurrency)
  const fired: string[] = []
  const fire = async (offerId: number | null, kind: string, key: string, msg: string): Promise<void> => {
    if (await repo.recordAlert(m.id, offerId, kind, `${m.id}:${key}`, msg)) fired.push(msg)
  }
  const label = (s: (typeof scored)[number]): string => {
    const s0 = s.offer.slices[0]
    return `${s0.from}→${s0.to} ${s0.departLocal.slice(8, 10)}/${s0.departLocal.slice(5, 7)}`
  }
  const price = (s: (typeof scored)[number]): number => s.ev.cost.fareInCurrency!.amountMinor

  if (a.priceBelow) {
    const target = fx(a.priceBelow, m.config.currency)
    if (target) for (const s of eligible.filter((x) => price(x) <= target.amountMinor).slice(0, 3)) {
      const r = rows.get(s.offer)!
      await fire(r.id, 'below', `below:${r.fingerprint}:${price(s)}`, `${label(s)} por ${formatMoney(s.ev.cost.fareInCurrency)} (abaixo de ${formatMoney(target)})`)
    }
  }
  if (a.dropPercent) {
    for (const s of eligible) {
      const r = rows.get(s.offer)!
      if (r.prevPriceMinor == null || r.prevCurrency !== r.currency || r.lastSeenAt < runStartIso) continue
      const drop = ((r.prevPriceMinor - r.priceMinor) / r.prevPriceMinor) * 100
      if (drop >= a.dropPercent) await fire(r.id, 'drop', `drop:${r.id}:${r.priceMinor}`, `${label(s)} caiu ${Math.round(drop)}%: ${formatMoney({ amountMinor: r.priceMinor, currency: r.currency })}`)
    }
  }
  if (a.newLow && eligible.length) {
    const pk = paxKey(m.config)
    const before = (await repo.listObservations(m.id, '0000')).filter((o) => o.observedAt < runStartIso && o.paxKey === pk && o.currency === m.config.currency)
    const eligibleIds = new Set(eligible.map((s) => rows.get(s.offer)!.id))
    const prevMin = Math.min(...before.filter((o) => eligibleIds.has(o.offerId)).map((o) => o.priceMinor), Infinity)
    const best = eligible.reduce((b, s) => (price(s) < price(b) ? s : b))
    // só afirma "menor histórico" se havia histórico comparável antes
    if (isFinite(prevMin) && price(best) < prevMin && best.offer.price.currency === m.config.currency)
      await fire(rows.get(best.offer)!.id, 'new_low', `low:${price(best)}`, `Novo menor preço comparável: ${label(best)} por ${formatMoney(best.ev.cost.fareInCurrency)}`)
  }
  if (a.interesting) {
    for (const s of eligible.filter((x) => x.score >= 80 && rows.get(x.offer)!.firstSeenAt >= runStartIso).slice(0, 2)) {
      const r = rows.get(s.offer)!
      await fire(r.id, 'interesting', `int:${r.fingerprint}`, `Opção interessante (nota ${s.score}): ${label(s)} ${formatMoney(s.ev.cost.fareInCurrency)}`)
    }
  }
  if (a.favoriteChanges) {
    for (const s of scored) {
      const r = rows.get(s.offer)!
      if (!r.favorite) continue
      if (!r.available) await fire(r.id, 'fav_gone', `favgone:${r.id}:${r.lastSeenAt}`, `Favorita sumiu da fonte: ${label(s)}`)
      else if (r.prevPriceMinor != null && r.lastSeenAt >= runStartIso && r.prevPriceMinor !== r.priceMinor)
        await fire(r.id, 'fav_price', `favprice:${r.id}:${r.priceMinor}`, `Favorita mudou de preço: ${label(s)} ${formatMoney({ amountMinor: r.prevPriceMinor, currency: r.currency })} → ${formatMoney({ amountMinor: r.priceMinor, currency: r.currency })}`)
    }
  }
  if (fired.length) {
    await notify({ title: `✈️ ${m.name}`, body: fired.slice(0, 3).join('\n') + (fired.length > 3 ? `\n+${fired.length - 3} alerta(s)` : ''), source: 'passagens', page: 'trip-monitoring' })
    changed(m.id, runId ?? undefined)
  }
  return fired.length
}

// ── Agendador ─────────────────────────────────────────────────────────────────

let ticking = false
let lastPromoCheck = 0
/** Chamado pelo agendador global a cada 5 min: dispara monitores vencidos. */
export async function schedulerTick(): Promise<void> {
  if (ticking) return
  ticking = true
  try {
    const now = new Date()
    for (const m of await repo.listMonitors()) {
      if (m.status !== 'active' || m.config.schedule.mode === 'manual') continue
      if (configErrors(m.config, todayLocal()).length) continue
      if (!m.nextRunAt) {
        await repo.setMonitorMeta(m.id, { nextRunAt: nextRunAt(m, m.lastRunAt ? new Date(m.lastRunAt) : new Date(now.getTime() - 1)) ?? null })
        if (m.lastRunAt) continue
      } else if (Date.parse(m.nextRunAt) > now.getTime()) continue
      try {
        await startRun(m.id, 'schedule')
      } catch (e) {
        // sem fonte/configuração: registra e empurra a próxima tentativa (sem loop a cada 5 min)
        await repo.setMonitorMeta(m.id, { lastError: e instanceof Error ? e.message : String(e), nextRunAt: new Date(now.getTime() + 6 * 3600_000).toISOString() })
        changed(m.id)
      }
    }
    // radar de promoções (RSS): a cada 2 h
    if (Date.now() - lastPromoCheck > 2 * 3600_000) {
      lastPromoCheck = Date.now()
      try {
        const { checkPromoAlerts } = await import('./promos')
        await checkPromoAlerts(await repo.listMonitors())
      } catch (e) {
        log('promos.error', { error: e instanceof Error ? e.message : String(e) })
      }
    }
  } finally {
    ticking = false
  }
}

export async function bootFlights(): Promise<void> {
  const n = await repo.recoverInterrupted()
  if (n) log('boot.recovered', { runs: n })
  const { defaultMonitorConfig } = await import('../../shared/flights')
  const { searchPlaces } = await import('./geo')
  const migrated = await repo.migrateLegacyWatches((text) => {
    if (!text?.trim()) return null
    const a = getAirport(text.trim())
    if (a) return { kind: 'airport', code: a.iata, label: `${a.city || a.name} (${a.iata})` }
    const places = searchPlaces(text, 8)
    // texto livre antigo ("osaka"): prefere a cidade inteira (todos os aeroportos) ao 1º aeroporto
    const hit = places.find((s) => s.kind === 'city') ?? places.find((s) => s.kind === 'airport')
    return hit ? { kind: hit.kind as 'airport' | 'city', code: hit.code, label: hit.label } : null
  }, defaultMonitorConfig)
  if (migrated) log('boot.migrated_legacy', { count: migrated })
  // uma vez: buscas no Skyscanner feitas antes da lista de acompanhadas existir
  if ((await getSetting('flights_tracked_backfill')) !== '1') {
    const n = await repo.backfillTrackedFromSkyscanner()
    await setSetting('flights_tracked_backfill', '1')
    if (n) log('boot.tracked_backfill', { count: n })
  }
}
