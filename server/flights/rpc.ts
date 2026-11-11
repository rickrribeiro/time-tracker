import type { FlightMonitor, ImportPreview, LocationRef, MonitorConfig, MonitorStatus, OfferQuery, ProviderStatus, SkyPick } from '../../shared/flights'
import { fmtMinutes, formatMoney } from '../../shared/flights'
import { broadcast } from '../events'
import { draftFromText, insights, structureImportText } from './ai'
import { buildPreview, cancelAssisted, startSkyscanner, trackedView, validatePicks } from './assisted'
import { promosFor } from './promos'
import { todayLocal } from './dates'
import { fingerprint } from './evaluate'
import { getAirport, refCenter, resolveRef, searchPlaces } from './geo'
import { estimateGround, nearbyAirports } from './ground'
import { parseImport } from './importer'
import { buildUniverse, paxKey, planDiscovery } from './planner'
import { PROVIDERS, getProvider } from './providers'
import * as repo from './repo'
import { cancelRun, evaluateAlerts, setting, startRun, usableProviders } from './runner'
import { configErrors, normalizeConfig } from './validate'
import * as views from './views'
import { getSetting } from '../database/queries'

/**
 * Canais RPC `flightMon:*`. Nada de busca externa síncrona: `run` só enfileira e devolve
 * o estado; o progresso chega por SSE (`flights:updated`).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handle = (channel: string, fn: (event: unknown, ...args: any[]) => unknown) => void

const changed = (monitorId: number | null): void => broadcast('flights:updated', { monitorId, runId: null })

async function mustGet(id: number): Promise<FlightMonitor> {
  const m = await repo.getMonitor(Number(id))
  if (!m) throw new Error('Monitoramento não encontrado.')
  return m
}

interface MonitorInput {
  name?: string
  status?: MonitorStatus
  tripId?: number | null
  config?: unknown
}

/** Config validada + status efetivo: sem configuração completa, "ativo" vira rascunho. */
function prepare(input: MonitorInput): { name: string; status: MonitorStatus; config: MonitorConfig; errors: string[] } {
  const dropped: string[] = []
  const config = normalizeConfig(input.config, dropped)
  const errors = [...configErrors(config, todayLocal()), ...dropped.map((d) => `Localidade inválida descartada: ${d}`)]
  const blocking = configErrors(config, todayLocal())
  const wanted = input.status ?? 'active'
  const status: MonitorStatus = wanted === 'active' && blocking.length ? 'draft' : wanted
  return { name: (input.name ?? '').trim().slice(0, 80) || 'Monitoramento', status, config, errors }
}

export function registerFlightRpc(handle: Handle): void {
  handle('flightMon:list', async () => {
    const fx = await views.loadFx()
    return Promise.all((await repo.listMonitors()).map((m) => views.summarize(m, fx)))
  })
  handle('flightMon:get', async (_, id: number) => views.summarize(await mustGet(id), await views.loadFx()))

  handle('flightMon:validate', async (_, config: unknown) => {
    const dropped: string[] = []
    const cfg = normalizeConfig(config, dropped)
    const u = buildUniverse(cfg, todayLocal())
    const m = { config: cfg, providers: [] } as unknown as FlightMonitor
    const { list } = await usableProviders({ ...m, config: cfg })
    const discovery = planDiscovery(u, list.map((p) => ({ id: p.id, capabilities: p.capabilities })), paxKey(cfg), cfg.dates.tripType === 'roundtrip').length
    return {
      config: cfg,
      errors: configErrors(cfg, todayLocal()),
      warnings: [...u.warnings, ...dropped.map((d) => `Descartado (não existe na base): ${d}`)],
      origins: u.origins.map((a) => a.iata),
      destinations: u.destinations.map((a) => a.iata),
      pairs: u.pairs.length,
      dates: u.dates.length,
      universe: u.size,
      discoveryQueries: discovery,
      providers: list.map((p) => p.id)
    }
  })

  handle('flightMon:create', async (_, input: MonitorInput) => {
    const p = prepare(input)
    const id = await repo.createMonitor(p.name, p.status, p.config, input.tripId ?? null)
    changed(id)
    return { id, status: p.status, errors: p.errors }
  })
  handle('flightMon:update', async (_, id: number, input: MonitorInput) => {
    const cur = await mustGet(id)
    const p = prepare({ ...input, status: input.status ?? (cur.status === 'draft' ? 'active' : cur.status) })
    await repo.updateMonitor(cur.id, { name: p.name, status: p.status, config: p.config, tripId: input.tripId !== undefined ? input.tripId : cur.tripId })
    await repo.setMonitorMeta(cur.id, { nextRunAt: null, lastError: null })
    changed(cur.id)
    return { id: cur.id, status: p.status, errors: p.errors }
  })
  handle('flightMon:setStatus', async (_, id: number, status: MonitorStatus) => {
    const m = await mustGet(id)
    if (status === 'active' && configErrors(m.config, todayLocal()).length) throw new Error(`Complete a configuração: ${configErrors(m.config, todayLocal())[0]}`)
    await repo.updateMonitor(m.id, { status })
    await repo.setMonitorMeta(m.id, { nextRunAt: null })
    changed(m.id)
  })
  handle('flightMon:duplicate', async (_, id: number) => {
    const m = await mustGet(id)
    const newId = await repo.createMonitor(`${m.name} (cópia)`, 'paused', m.config, m.tripId)
    changed(newId)
    return newId
  })
  handle('flightMon:delete', async (_, id: number) => {
    await repo.deleteMonitor(Number(id))
    changed(null)
  })

  // ── execução ──
  handle('flightMon:run', (_, id: number, opts?: { more?: number }) => startRun(Number(id), opts?.more ? 'more' : 'manual', { more: opts?.more }))
  handle('flightMon:cancel', (_, runId: number) => cancelAssisted(Number(runId)) || cancelRun(Number(runId)))
  handle('flightMon:retryFailed', async (_, id: number) => {
    const n = await repo.retryFailed(Number(id))
    changed(Number(id))
    return n
  })

  // ── resultados ──
  handle('flightMon:offers', async (_, id: number, q: OfferQuery) => views.queryOffers(await mustGet(id), q ?? {}))
  handle('flightMon:favorite', async (_, offerId: number, fav: boolean) => {
    await repo.setFavorite(Number(offerId), !!fav)
    const o = await repo.getOffer(Number(offerId))
    changed(o?.monitorId ?? null)
  })
  handle('flightMon:calendar', async (_, id: number) => views.calendar(await mustGet(id)))
  handle('flightMon:history', async (_, id: number, days?: number) => views.history(await mustGet(id), days ?? 60))
  handle('flightMon:plan', async (_, id: number) => views.plan(await mustGet(id)))
  handle('flightMon:alerts', async (_, id: number) => repo.listAlerts(Number(id)))
  handle('flightMon:checkAlerts', async (_, id: number) => evaluateAlerts(await mustGet(id), null, new Date(Date.now() - 86400_000).toISOString()))

  // ── localidades ──
  handle('flightMon:places', (_, query: string) => searchPlaces(String(query ?? ''), 12))
  handle('flightMon:airport', (_, iata: string) => getAirport(iata))
  handle('flightMon:resolve', (_, ref: LocationRef) => resolveRef(ref))
  handle('flightMon:nearby', (_, ref: LocationRef, radiusKm: number, withGround: boolean) => nearbyAirports(ref, Number(radiusKm) || 300, !!withGround))
  handle('flightMon:ground', async (_, iata: string, to: LocationRef) => {
    const c = refCenter(to)
    if (!c) throw new Error('Destino final sem coordenadas (escolha uma cidade ou aeroporto).')
    return estimateGround(iata, c)
  })

  // ── IA ──
  handle('flightMon:aiDraft', (_, text: string, currency?: string) => draftFromText(String(text ?? ''), currency))
  handle('flightMon:insights', async (_, id: number) => {
    const m = await mustGet(id)
    const page = await views.queryOffers(m, { status: 'eligible', pageSize: 12 })
    const rows = page.items.map(
      (o) =>
        `${o.id} | ${o.origin}→${o.destination}${o.connections.length ? ` via ${o.connections.map((c) => c.airport).join('/')}` : ''} | ${o.slices[0].departLocal} | ${formatMoney(o.cost.fareInCurrency ?? o.price)} | ${formatMoney(o.cost.total)} (${o.cost.totalStatus}) | ${fmtMinutes(o.totalDurationMin)} | ${o.stops} | ${o.baggage.checked == null ? 'mala ?' : `${o.baggage.checked} mala`} | ${o.verification}`
    )
    return insights(m, rows)
  })
  // ── Skyscanner via Claude + Chrome (sob demanda, usuário presente) ──
  handle('flightMon:skyscanner', (_, id: number, picks: SkyPick[] | number) => startSkyscanner(Number(id), Array.isArray(picks) ? picks : Number(picks) || 4))
  handle('flightMon:skyscannerPreview', async (_, id: number) => buildPreview(await mustGet(id)))
  handle('flightMon:tracked', async (_, id: number, days?: number) => trackedView(await mustGet(id), Math.max(7, Math.min(365, Number(days) || 60))))
  handle('flightMon:track', async (_, id: number, picks: SkyPick[]) => repo.addTracked(Number(id), validatePicks(await mustGet(id), picks)))
  handle('flightMon:untrack', async (_, id: number, pick: SkyPick) => {
    await repo.removeTracked(Number(id), { origin: String(pick?.origin ?? ''), destination: String(pick?.destination ?? ''), depart: String(pick?.depart ?? ''), ret: pick?.ret ? String(pick.ret) : null })
  })

  // ── radar de promoções (RSS) ──
  handle('flightMon:promos', async (_, id: number, force?: boolean) => promosFor(await mustGet(id), !!force))

  // ── importação ──
  /** Prévia e gravação usam o MESMO parser no servidor; no modo IA o resultado vem do cache (sem nova chamada). */
  const parseFor = async (m: FlightMonitor, text: string, mode: 'structured' | 'ai', source?: string, observedAt?: string, assisted?: boolean): Promise<ImportPreview> => {
    if (mode === 'ai') return structureImportText(String(text ?? ''), m.id, m.config.budget.maxAiCallsPerRun)
    const obs = observedAt && !Number.isNaN(Date.parse(observedAt)) ? new Date(observedAt).toISOString() : undefined
    return parseImport(String(text ?? ''), { source: source?.trim() || (assisted ? 'Busca assistida (Claude + Chrome)' : 'Importação manual'), observedAt: obs, verification: assisted ? 'assisted' : 'imported' })
  }
  handle('flightMon:importPreview', async (_, id: number, text: string, mode: 'structured' | 'ai', source?: string, observedAt?: string, assisted?: boolean) =>
    parseFor(await mustGet(id), text, mode, source, observedAt, assisted)
  )
  handle('flightMon:importCommit', async (_, id: number, text: string, mode: 'structured' | 'ai', source?: string, observedAt?: string, assisted?: boolean) => {
    const m = await mustGet(id)
    const parsed = await parseFor(m, text, mode, source, observedAt, assisted)
    const pk = paxKey(m.config)
    const res = await repo.upsertOffers(m.id, parsed.offers.map((o) => ({ offer: o, fp: fingerprint(o, pk) })), pk, null)
    if (res.length) await repo.setMonitorMeta(m.id, { lastSuccessAt: new Date().toISOString() })
    changed(m.id)
    return { imported: res.length, created: res.filter((r) => r.isNew).length, errors: parsed.errors }
  })

  // ── provedores ──
  handle('flightMon:providers', async (): Promise<ProviderStatus[]> => {
    const day = todayLocal()
    return Promise.all(
      PROVIDERS.map(async (p) => {
        const st = await p.status({ getSetting: setting })
        const enabled = (await getSetting(`flights_provider_${p.id}_enabled`)) !== '0'
        return {
          id: p.id,
          label: p.label,
          kind: p.kind,
          configured: st.configured,
          enabled,
          available: st.available && enabled,
          reason: enabled ? st.reason : 'Desativado.',
          capabilities: p.capabilities,
          usedToday: await repo.usageOn(p.id, day),
          docs: p.docs,
          notes: p.notes
        }
      })
    )
  })
  handle('flightMon:testProvider', async (_, id: string) => {
    const p = getProvider(id)
    if (!p?.test) throw new Error('Este provedor não tem teste de conexão.')
    const ctl = new AbortController()
    return p.test({ getSetting: setting, signal: ctl.signal, now: () => new Date() })
  })
}
