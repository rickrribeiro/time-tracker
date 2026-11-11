import type { FlightMonitor, NormalizedOffer, RunInfo } from '../../shared/flights'
import { getSetting, recordAiUsage } from '../database/queries'
import { broadcast } from '../events'
import { runClaude } from '../services/claude'
import { todayLocal } from './dates'
import { fingerprint } from './evaluate'
import { parseImport } from './importer'
import { buildUniverse, interleavePairs, newSpecs, paxKey, TaskSpec } from './planner'
import * as repo from './repo'
import { configErrors } from './validate'
import { scoredOffers } from './views'

/**
 * Skyscanner via Claude Code + Chrome — SOB DEMANDA, com o usuário presente.
 *
 * O app dispara `claude --chrome -p` (as ferramentas `mcp__claude-in-chrome__*` funcionam
 * no modo -p quando a extensão está conectada) e libera SÓ essas ferramentas. Uma sessão
 * cobre várias combinações (o contexto das ferramentas é caro: ~US$ 0,10 equivalente API
 * só para abrir a sessão). Regras do prompt: ler texto da página (get_page_text/find), nada
 * de screenshots repetidos; parar em verificação/CAPTCHA (não contorna); saída JSON pequena.
 * Nunca entra no agendador: quem chama é o botão da UI.
 */
export const PROVIDER_ID = 'skyscanner_chrome'
const SOURCE = 'Skyscanner (via Claude + Chrome)'

let busy: { monitorId: number; runId: number; kill: (() => void) | null } | null = null

export function assistedBusy(): { monitorId: number; runId: number } | null {
  return busy ? { monitorId: busy.monitorId, runId: busy.runId } : null
}

export function cancelAssisted(runId: number): boolean {
  if (!busy || busy.runId !== runId) return false
  busy.kill?.()
  return true
}

/** Link de busca do Skyscanner (formato público de URL de pesquisa). */
export function skyscannerUrl(o: string, d: string, dep: string, ret: string | null, m: FlightMonitor): string {
  const yymmdd = (s: string): string => s.slice(2).replace(/-/g, '')
  const p = m.config.passengers
  const cabin = { economy: 'economy', premium_economy: 'premiumeconomy', business: 'business', first: 'first' }[p.cabin]
  const q = new URLSearchParams({ adultsv2: String(p.adults), cabinclass: cabin, currency: m.config.currency, locale: 'pt-BR', market: 'BR' })
  if (p.children + p.infants > 0) q.set('childrenv2', [...Array(p.children).fill('8'), ...Array(p.infants).fill('0')].join('|'))
  if (m.config.constraints.maxStops === 0) q.set('preferdirects', 'true')
  return `https://www.skyscanner.com.br/transporte/passagens-aereas/${o.toLowerCase()}/${d.toLowerCase()}/${yymmdd(dep)}/${ret ? `${yymmdd(ret)}/` : ''}?${q}`
}

interface Combo {
  origin: string
  destination: string
  depart: string
  ret: string | null
  url: string
}

/**
 * Escolhe as próximas combinações: primeiro datas/pares com melhor preço já conhecido
 * (promoções costumam aparecer perto deles), depois a ordem do planejador (países
 * intercalados). Pula o que o Skyscanner já consultou nas últimas `freshHours`.
 */
export async function pickCombos(m: FlightMonitor, count: number, freshHours = 12): Promise<Combo[]> {
  const u = buildUniverse(m.config, todayLocal())
  const pk = paxKey(m.config)
  const tasks = await repo.listTasks(m.id)
  const recent = new Set(
    tasks
      .filter((t) => t.provider === PROVIDER_ID && (t.status === 'running' || (t.status === 'done' && t.finishedAt && Date.now() - Date.parse(t.finishedAt) < freshHours * 3600_000)))
      .map((t) => t.key)
  )
  const key = (o: string, d: string, dep: string, ret: string | null): string => `${PROVIDER_ID}|${o}|${d}|${dep}|${ret ?? '-'}|${pk}`
  const ranked: { o: string; d: string; dep: string; ret: string | null; score: number }[] = []
  const { scored, rows } = await scoredOffers(m)
  const best = new Map<string, number>()
  for (const s of scored) {
    if (s.ev.status === 'excluded' || !rows.get(s.offer)!.available || !s.ev.cost.fareInCurrency) continue
    const s0 = s.offer.slices[0]
    const k = `${s0.from}|${s0.to}|${s0.departLocal.slice(0, 10)}|${s.offer.slices[1]?.departLocal.slice(0, 10) ?? ''}`
    best.set(k, Math.min(best.get(k) ?? Infinity, s.ev.cost.fareInCurrency.amountMinor))
  }
  const sortedKnown = [...best.entries()].sort((a, b) => a[1] - b[1])
  sortedKnown.forEach(([k], i) => {
    const [o, d, dep, ret] = k.split('|')
    ranked.push({ o, d, dep, ret: ret || null, score: 2000 - i })
  })
  // ordem do planejador: pares intercalados × datas espaçadas
  const pairs = interleavePairs(u.pairs)
  const dates = u.dates
  const step = Math.max(1, Math.floor(dates.length / 4))
  // rodízio: 1ª data de cada par, depois a 2ª… (cobre pares/países diferentes antes de repetir rota)
  pairs.forEach((p, i) => {
    let round = 0
    for (let j = 0; j < dates.length; j += step, round++)
      ranked.push({ o: p.o.iata, d: p.d.iata, dep: dates[j].depart, ret: dates[j].ret, score: 1000 - (round * pairs.length + i) * 0.001 })
  })
  const out: Combo[] = []
  const seen = new Set<string>()
  for (const r of ranked.sort((a, b) => b.score - a.score)) {
    const k = key(r.o, r.d, r.dep, r.ret)
    if (recent.has(k) || seen.has(k) || r.dep < todayLocal()) continue
    seen.add(k)
    out.push({ origin: r.o, destination: r.d, depart: r.dep, ret: r.ret, url: skyscannerUrl(r.o, r.d, r.dep, r.ret, m) })
    if (out.length >= count) break
  }
  return out
}

export function buildPrompt(m: FlightMonitor, combos: Combo[]): string {
  const bag = m.config.baggage.checked !== 'any'
  return [
    'Você vai consultar o Skyscanner no Chrome do usuário (ele está presente acompanhando). Seja econômico em tokens.',
    'REGRAS:',
    '1. Primeiro chame mcp__claude-in-chrome__list_connected_browsers. Se não houver navegador conectado, responda só {"status":"no_browser"}.',
    '2. Abra UMA aba nova (tabs_create_mcp) e use navigate nela para cada URL, uma de cada vez. Não mexa nas outras abas do usuário.',
    '3. Espere os resultados carregarem (use find por preços "R$" — no máximo 3 tentativas, ~5 s entre elas). Use get_page_text/find para ler. NÃO tire screenshots repetidos nem leia HTML/acessibilidade inteira.',
    '4. Se aparecer verificação de robô / CAPTCHA / "pressione e segure" / login: NÃO tente resolver nem contornar. Pare tudo e responda com status "blocked" (inclua o que já coletou).',
    '5. Para cada combinação, colete até 6 opções: as mais baratas e, se diferentes, a "Melhor" e a "Mais rápida". Não invente: campo que não estiver visível = null.',
    '6. No fim, feche a aba que você abriu.',
    `Contexto: ${m.config.passengers.adults} adulto(s), moeda ${m.config.currency}.${bag ? ' Se a página indicar bagagem incluída/não incluída, informe checked_bags (0 ou nº).' : ''}`,
    'Horários: hora local mostrada na página. Chegada "+1"/"+2" = somar dias à data de partida. Se mostrar "Transferência por conta própria"/"self-transfer", self_transfer=true. Conexões: códigos IATA dos aeroportos de escala, se visíveis (senão só stops).',
    'Combinações:',
    ...combos.map((c, i) => `${i}: ${c.origin}→${c.destination} ida ${c.depart}${c.ret ? ` volta ${c.ret}` : ''} — ${c.url}`),
    'Responda APENAS JSON, sem texto fora dele:',
    '{"status":"ok|blocked|no_browser|error","message":"curto","results":[{"combo":0,"status":"ok|empty|blocked|error","offers":[{"depart":"YYYY-MM-DDTHH:MM","arrive":"YYYY-MM-DDTHH:MM","price":1234.56,"currency":"BRL","stops":1,"via":["DOH"],"carrier":"nome ou IATA","self_transfer":false,"checked_bags":null,"label":"mais barato|melhor|mais rápido|null"}]}]}'
  ].join('\n')
}

function firstJson(text: string): Record<string, unknown> {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('O Claude não devolveu JSON.')
  return JSON.parse(text.slice(start, end + 1))
}

/** Converte "Qatar Airways" → "QR" só quando o nome já veio como código; senão guarda o nome em `carrier` do resumo. */
function carrierCode(c: unknown): string {
  const s = String(c ?? '').trim()
  return /^[A-Z0-9]{2}$/.test(s) ? s : ''
}

/** JSON do Claude → ofertas validadas pelo importador (mesmas regras da importação manual). */
export function toOffers(combo: Combo, offers: Record<string, unknown>[], observedAt: string): { offers: NormalizedOffer[]; errors: string[] } {
  const rows = offers.slice(0, 8).map((o) => {
    const via = Array.isArray(o.via) ? (o.via as unknown[]).map((x) => String(x).toUpperCase()).filter((x) => /^[A-Z]{3}$/.test(x)) : []
    return {
      origin: combo.origin,
      destination: combo.destination,
      depart: o.depart,
      arrive: o.arrive,
      price: o.price,
      currency: o.currency,
      stops: o.stops,
      carrier: carrierCode(o.carrier),
      checked_bags: o.checked_bags,
      self_transfer: o.self_transfer,
      link: combo.url,
      link_kind: 'search',
      source: `${SOURCE}${o.carrier && !carrierCode(o.carrier) ? ` · ${String(o.carrier).slice(0, 40)}` : ''}`,
      observed_at: observedAt,
      via
    }
  })
  const parsed = parseImport(JSON.stringify(rows), { source: SOURCE, verification: 'assisted', observedAt })
  for (const o of parsed.offers) o.provider = PROVIDER_ID
  return parsed
}

export interface AssistedStart {
  runId: number
  combos: { origin: string; destination: string; depart: string; ret: string | null; url: string }[]
}

/** Dispara a sessão no Chrome (assíncrono) e devolve na hora as combinações escolhidas. */
export async function startSkyscanner(monitorId: number, count: number): Promise<AssistedStart> {
  if ((await getSetting('flights_chrome_assisted')) !== '1') throw new Error('Ative "Skyscanner via Claude + Chrome" em Fontes e execução.')
  if (busy) throw new Error('Já há uma busca no Chrome em andamento (uma por vez — é o seu navegador).')
  const m = await repo.getMonitor(monitorId)
  if (!m) throw new Error('Monitoramento não encontrado.')
  const errs = configErrors(m.config, todayLocal())
  if (errs.length) throw new Error(`Configuração incompleta: ${errs[0]}`)
  const n = Math.max(1, Math.min(8, count))
  const combos = await pickCombos(m, n)
  if (!combos.length) throw new Error('Todas as combinações já foram consultadas no Skyscanner nas últimas 12 h.')

  const runId = await repo.createRun(monitorId, 'assisted')
  const pk = paxKey(m.config)
  const specs: TaskSpec[] = combos.map((c, i) => ({
    key: `${PROVIDER_ID}|${c.origin}|${c.destination}|${c.depart}|${c.ret ?? '-'}|${pk}`,
    provider: PROVIDER_ID,
    stage: 'validate',
    origin: c.origin,
    destination: c.destination,
    departDate: c.depart,
    returnDate: c.ret,
    priority: 900 - i
  }))
  const existing = new Set((await repo.listTasks(monitorId)).map((t) => t.key))
  await repo.insertTasks(monitorId, newSpecs(specs, existing))
  // tarefas antigas (já feitas) desta mesma chave voltam a rodar
  const byKey = new Map((await repo.listTasks(monitorId)).map((t) => [t.key, t]))
  const taskIds = specs.map((s) => byKey.get(s.key)!.id)
  for (const id of taskIds) {
    await repo.resetTask(id)
    await repo.claimTask(id, runId)
  }
  await repo.updateRun(runId, { planned: combos.length, message: 'Claude está pesquisando no seu Chrome…' })
  busy = { monitorId, runId, kill: null }
  broadcast('flights:updated', { monitorId, runId })

  void (async () => {
    const started = new Date().toISOString()
    let tokens = 0
    try {
      const command = (await getSetting('claude_command')) || 'claude'
      const model = ((await getSetting('flights_chrome_model')) ?? 'sonnet').trim()
      const raw = await runClaude(buildPrompt(m, combos), command, {
        model,
        extraArgs: ['--chrome', '--allowedTools', 'mcp__claude-in-chrome'],
        timeoutMs: 12 * 60_000,
        registerChild: (kill) => busy && (busy.kill = kill),
        onUsage: (u) => {
          tokens = u.inputTokens + u.outputTokens + u.cacheCreationTokens + u.cacheReadTokens
          recordAiUsage({ ...u, source: 'passagens-chrome', projectId: null, model: u.model || model || null }).catch(() => undefined)
        }
      })
      const j = firstJson(raw)
      const status = String(j.status ?? 'error')
      if (status === 'no_browser') throw new Error('Chrome não conectado: abra o Chrome com a extensão Claude in Chrome ativa (e logada) e tente de novo.')
      const results = Array.isArray(j.results) ? (j.results as Record<string, unknown>[]) : []
      let done = 0
      let failed = 0
      let found = 0
      const errors: string[] = []
      for (const [i, c] of combos.entries()) {
        const r = results.find((x) => Number(x.combo) === i)
        const st = String(r?.status ?? (status === 'blocked' ? 'blocked' : 'error'))
        if (st === 'ok' || st === 'empty') {
          const parsed = toOffers(c, Array.isArray(r?.offers) ? (r!.offers as Record<string, unknown>[]) : [], started)
          errors.push(...parsed.errors.map((e) => `${c.origin}→${c.destination}: ${e}`))
          await repo.upsertOffers(monitorId, parsed.offers.map((o) => ({ offer: o, fp: fingerprint(o, pk) })), pk, runId)
          const min = parsed.offers.reduce<number | null>((b, o) => (o.price.currency === m.config.currency ? Math.min(b ?? Infinity, o.price.amountMinor) : b), null)
          await repo.finishTask(taskIds[i], { status: 'done', resultCount: parsed.offers.length, minPriceMinor: min, currency: m.config.currency })
          done++
          found += parsed.offers.length
        } else if (st === 'blocked') {
          await repo.finishTask(taskIds[i], { status: 'pending', error: 'Skyscanner pediu verificação; não foi contornada.' })
        } else {
          await repo.finishTask(taskIds[i], { status: 'failed', error: 'Não foi possível ler os resultados.' })
          failed++
        }
      }
      const blocked = status === 'blocked' || results.some((x) => x.status === 'blocked')
      const message = [
        blocked ? 'O Skyscanner pediu verificação humana — resolva no Chrome, se quiser, e rode de novo; o app não contorna.' : null,
        j.message ? String(j.message).slice(0, 200) : null,
        errors.length ? `${errors.length} linha(s) descartadas na validação.` : null
      ]
        .filter(Boolean)
        .join(' ')
      await repo.updateRun(runId, {
        status: done === 0 ? 'failed' : blocked || failed ? 'partial' : 'done',
        done,
        failed,
        queries: combos.length,
        offersFound: found,
        aiCalls: 1,
        tokens,
        finishedAt: new Date().toISOString(),
        message: message || null
      })
      if (done) await repo.setMonitorMeta(monitorId, { lastSuccessAt: new Date().toISOString(), lastError: null })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      for (const id of taskIds) await repo.finishTask(id, { status: 'pending', error: msg.slice(0, 200) })
      await repo.updateRun(runId, { status: 'failed', aiCalls: 1, tokens, finishedAt: new Date().toISOString(), message: msg.slice(0, 300) })
    } finally {
      busy = null
      broadcast('flights:updated', { monitorId, runId })
    }
  })()
  return { runId, combos }
}

export type { RunInfo }
