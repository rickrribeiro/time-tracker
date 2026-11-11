import type { AirportInfo, FlightMonitor, Money, NormalizedOffer, RunInfo, SkyCombo, SkyPick, SkyPlace, SkyPreview, TrackedCombo, TrackedView } from '../../shared/flights'
import { skyKey } from '../../shared/flights'
import { getSetting, recordAiUsage } from '../database/queries'
import { broadcast } from '../events'
import { runClaude } from '../services/claude'
import { todayLocal } from './dates'
import { fingerprint } from './evaluate'
import { displayCity, getAirport } from './geo'
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

let busy: { monitorId: number; runId: number; kill: (() => void) | null; cancelled: boolean } | null = null

export function assistedBusy(): { monitorId: number; runId: number } | null {
  return busy ? { monitorId: busy.monitorId, runId: busy.runId } : null
}

export function cancelAssisted(runId: number): boolean {
  if (!busy || busy.runId !== runId) return false
  busy.cancelled = true
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

type Combo = SkyCombo

export const MAX_PER_RUN = 30
/** Combinações por sessão do Claude: sessões curtas mantêm o contexto (texto das páginas) pequeno. */
export const PER_SESSION = 5
const FRESH_HOURS = 12

/** Ordem que preenche lacunas: extremos, meio, quartos… (as primeiras datas já cobrem o intervalo todo). */
export function spreadOrder(n: number): number[] {
  const out: number[] = []
  const seen = new Set<number>()
  const push = (i: number): void => {
    if (i >= 0 && i < n && !seen.has(i)) (seen.add(i), out.push(i))
  }
  push(0)
  push(n - 1)
  for (let parts = 2; out.length < n && parts <= 2 * n; parts *= 2) for (let k = 1; k < parts; k += 2) push(Math.round((k * (n - 1)) / parts))
  for (let i = 0; i < n; i++) push(i)
  return out
}

function placeLabel(a: AirportInfo, multiCountry: boolean): string {
  const city = displayCity(a)
  return multiCountry ? `${city}, ${a.countryName}` : city
}

const sortPlaces = (list: SkyPlace[]): SkyPlace[] =>
  list.sort((a, b) => a.countryName.localeCompare(b.countryName, 'pt-BR') || a.city.localeCompare(b.city, 'pt-BR') || a.iata.localeCompare(b.iata))

/**
 * Tudo que o seletor precisa: aeroportos (com cidade/país), pares válidos, TODAS as datas do
 * intervalo, preços já conhecidos, o que foi consultado nas últimas 12 h e uma lista de
 * sugestões que varia par E data (antes, a 1ª rodada repetia a mesma data para todos os pares).
 */
export async function buildPreview(m: FlightMonitor, recommendCount = 24): Promise<SkyPreview> {
  const u = buildUniverse(m.config, todayLocal())
  const today = todayLocal()
  const tasks = await repo.listTasks(m.id)
  const recent: Record<string, string> = {}
  for (const t of tasks) {
    if (t.provider !== PROVIDER_ID) continue
    const at = t.status === 'running' ? new Date().toISOString() : t.status === 'done' ? t.finishedAt : null
    if (at && Date.now() - Date.parse(at) < FRESH_HOURS * 3600_000) recent[skyKey({ origin: t.origin, destination: t.destination, depart: t.departDate, ret: t.returnDate })] = at
  }
  const known: Record<string, number> = {}
  const { scored, rows } = await scoredOffers(m)
  for (const s of scored) {
    const fare = s.ev.cost.fareInCurrency
    if (s.ev.status === 'excluded' || !rows.get(s.offer)!.available || !fare || fare.currency !== m.config.currency) continue
    const s0 = s.offer.slices[0]
    const k = skyKey({ origin: s0.from, destination: s0.to, depart: s0.departLocal.slice(0, 10), ret: s.offer.slices[1]?.departLocal.slice(0, 10) ?? null })
    known[k] = Math.min(known[k] ?? Infinity, fare.amountMinor)
  }
  const pairs = interleavePairs(u.pairs)
  const pairSet = new Set(pairs.map((p) => `${p.o.iata}|${p.d.iata}`))
  const dates = u.dates.filter((d) => d.depart >= today)
  const multiO = new Set(u.origins.map((a) => a.country)).size > 1
  const multiD = new Set(u.destinations.map((a) => a.country)).size > 1

  const rec: SkyCombo[] = []
  const seen = new Set<string>()
  const add = (p: SkyPick): boolean => {
    const k = skyKey(p)
    if (seen.has(k) || recent[k] || p.depart < today || !pairSet.has(`${p.origin}|${p.destination}`)) return false
    seen.add(k)
    rec.push({ ...p, url: skyscannerUrl(p.origin, p.destination, p.depart, p.ret, m) })
    return true
  }
  // 1) até um terço: combinações com melhor preço já visto (promoções aparecem perto delas)
  for (const [k] of Object.entries(known).sort((a, b) => a[1] - b[1])) {
    if (rec.length >= Math.ceil(recommendCount / 3)) break
    const [origin, destination, depart, ret] = k.split('|')
    add({ origin, destination, depart, ret: ret === '-' ? null : ret })
  }
  // 2) rodízio de pares (países intercalados) com a data deslocada a cada par e a cada rodada
  const order = spreadOrder(dates.length)
  const maxRounds = Math.min(order.length, 400)
  for (let r = 0; r < maxRounds && rec.length < recommendCount; r++)
    for (let i = 0; i < pairs.length && rec.length < recommendCount; i++) {
      const d = dates[order[(r + i) % order.length]]
      add({ origin: pairs[i].o.iata, destination: pairs[i].d.iata, depart: d.depart, ret: d.ret })
    }

  const DATE_CAP = 240
  return {
    origins: sortPlaces(u.origins.map((a) => ({ iata: a.iata, label: placeLabel(a, multiO), country: a.country, countryName: a.countryName, city: displayCity(a) }))),
    destinations: sortPlaces(u.destinations.map((a) => ({ iata: a.iata, label: placeLabel(a, multiD), country: a.country, countryName: a.countryName, city: displayCity(a) }))),
    pairs: [...pairSet],
    dates: dates.slice(0, DATE_CAP),
    datesTotal: dates.length,
    recommended: rec,
    known,
    recent,
    currency: m.config.currency,
    busy: assistedBusy(),
    tracked: (await repo.listTracked(m.id))
      .filter((t) => t.departDate >= today && pairSet.has(`${t.origin}|${t.destination}`))
      .map((t) => ({ origin: t.origin, destination: t.destination, depart: t.departDate, ret: t.returnDate || null })),
    maxPerRun: MAX_PER_RUN,
    perSession: PER_SESSION
  }
}

/** Compat./testes: as N primeiras sugestões. */
export async function pickCombos(m: FlightMonitor, count: number): Promise<Combo[]> {
  return (await buildPreview(m, count)).recommended.slice(0, count)
}

/** Valida as escolhas do usuário contra o universo do monitor (pares e datas) e remonta as URLs no servidor. */
export function validatePicks(m: FlightMonitor, picks: unknown): Combo[] {
  if (!Array.isArray(picks)) throw new Error('Nenhuma combinação escolhida.')
  const u = buildUniverse(m.config, todayLocal())
  const today = todayLocal()
  const pairSet = new Set(u.pairs.map((p) => `${p.o.iata}|${p.d.iata}`))
  const dateSet = new Set(u.dates.map((d) => `${d.depart}|${d.ret ?? '-'}`))
  const out: Combo[] = []
  const seen = new Set<string>()
  for (const raw of picks as Record<string, unknown>[]) {
    const p: SkyPick = { origin: String(raw?.origin ?? '').toUpperCase(), destination: String(raw?.destination ?? '').toUpperCase(), depart: String(raw?.depart ?? ''), ret: raw?.ret ? String(raw.ret) : null }
    const k = skyKey(p)
    if (seen.has(k) || !pairSet.has(`${p.origin}|${p.destination}`) || !dateSet.has(`${p.depart}|${p.ret ?? '-'}`) || p.depart < today) continue
    seen.add(k)
    out.push({ ...p, url: skyscannerUrl(p.origin, p.destination, p.depart, p.ret, m) })
  }
  if (!out.length) throw new Error('Nenhuma combinação válida para este monitoramento.')
  if (out.length > MAX_PER_RUN) throw new Error(`No máximo ${MAX_PER_RUN} combinações por execução (escolhidas: ${out.length}).`)
  return out
}

export function buildPrompt(m: FlightMonitor, combos: Combo[]): string {
  const bag = m.config.baggage.checked !== 'any'
  return [
    'Você vai consultar o Skyscanner no Chrome do usuário (ele está presente acompanhando). Seja econômico em tokens.',
    'REGRAS:',
    '1. Primeiro chame mcp__claude-in-chrome__list_connected_browsers. Se não houver navegador conectado, responda só {"status":"no_browser"}.',
    '2. Abra UMA aba nova (tabs_create_mcp) e use navigate nela para cada URL, uma de cada vez. Não mexa nas outras abas do usuário.',
    '3. Espere os resultados TERMINAREM de carregar: o Skyscanner mostra o progresso (ex.: "2 de 13 fornecedores"/barra de carregamento) e os preços mais baratos costumam chegar por último. Verifique com find (~6 s entre tentativas, no máximo 8) até não haver mais carregamento; só então leia com get_page_text/find. Se no limite ainda estiver incompleto, leia assim mesmo e cite a combinação em "message". NÃO tire screenshots repetidos nem leia HTML/acessibilidade inteira.',
    '4. Se aparecer verificação de robô / CAPTCHA / "pressione e segure" / login: NÃO tente resolver nem contornar. Pare tudo e responda com status "blocked" (inclua o que já coletou).',
    '5. Para cada combinação, colete até 6 opções: as mais baratas e, se diferentes, a "Melhor" e a "Mais rápida". Não invente: campo que não estiver visível = null.',
    '6. No fim, feche a aba que você abriu.',
    `Contexto: ${m.config.passengers.adults} adulto(s), moeda ${m.config.currency}.${bag ? ' Se a página indicar bagagem incluída/não incluída, informe checked_bags (0 ou nº).' : ''}`,
    'Horários: hora local mostrada na página. Chegada "+1"/"+2" = somar dias à data de partida. Se mostrar "Transferência por conta própria"/"self-transfer", self_transfer=true. Conexões: códigos IATA dos aeroportos de escala, se visíveis (senão só stops).',
    'Combinações:',
    ...combos.map((c, i) => `${i}: ${c.origin}→${c.destination} ida ${c.depart}${c.ret ? ` volta ${c.ret}` : ''} — ${c.url}`),
    'Logo depois de ler CADA combinação, escreva numa linha só (texto curto, sem markdown): RESULT {"combo":N,"status":"ok|empty|blocked|error","offers":[...]} — mesmo formato de "results" abaixo. O app grava na hora, enquanto você segue para a próxima.',
    'No fim, responda com o JSON completo (pode repetir os results), sem texto fora dele:',
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
  combos: Combo[]
}

interface Tally {
  done: number
  failed: number
  found: number
  errors: string[]
  blocked: boolean
}

/** Grava o resultado de UMA combinação (ofertas + tarefa). */
async function applyOne(m: FlightMonitor, runId: number, c: Combo, taskId: number, r: Record<string, unknown> | undefined, fallback: string, started: string, tot: Tally): Promise<void> {
  const pk = paxKey(m.config)
  const st = String(r?.status ?? fallback)
  if (st === 'ok' || st === 'empty') {
    const parsed = toOffers(c, Array.isArray(r?.offers) ? (r!.offers as Record<string, unknown>[]) : [], started)
    tot.errors.push(...parsed.errors.map((e) => `${c.origin}→${c.destination}: ${e}`))
    await repo.upsertOffers(m.id, parsed.offers.map((o) => ({ offer: o, fp: fingerprint(o, pk) })), pk, runId)
    const min = parsed.offers.reduce<number | null>((b, o) => (o.price.currency === m.config.currency ? Math.min(b ?? Infinity, o.price.amountMinor) : b), null)
    await repo.finishTask(taskId, { status: 'done', resultCount: parsed.offers.length, minPriceMinor: min, currency: m.config.currency })
    tot.done++
    tot.found += parsed.offers.length
  } else if (st === 'blocked') {
    tot.blocked = true
    await repo.finishTask(taskId, { status: 'pending', error: 'Skyscanner pediu verificação; não foi contornada.' })
  } else {
    await repo.finishTask(taskId, { status: 'failed', error: 'Não foi possível ler os resultados.' })
    tot.failed++
  }
}

/** Extrai as linhas `RESULT {...}` completas de um buffer de texto em streaming. */
export function takeResultLines(buf: string): { results: Record<string, unknown>[]; rest: string } {
  const results: Record<string, unknown>[] = []
  const lines = buf.split('\n')
  const rest = lines.pop() ?? ''
  for (const line of lines) {
    const mm = line.match(/RESULT\s*(\{.*\})\s*$/)
    if (!mm) continue
    try {
      const j = JSON.parse(mm[1])
      if (j && typeof j === 'object' && Number.isInteger(Number(j.combo))) results.push(j)
    } catch {
      // linha malformada: o JSON final cobre
    }
  }
  return { results, rest }
}

/** Desligamento do servidor: mata a sessão do Chrome sem gravar mais nada (o boot devolve tudo para a fila). */
let stopping = false
export function stopAssisted(): void {
  stopping = true
  if (busy) {
    busy.cancelled = true
    busy.kill?.()
  }
}

/**
 * Dispara a busca no Chrome (assíncrona) e devolve na hora as combinações aceitas.
 * Roda em sessões de até PER_SESSION combinações, uma depois da outra. Cada combinação é
 * gravada assim que o Claude a lê (linhas RESULT no streaming) — a tela atualiza em tempo
 * real. Para tudo se o Chrome não estiver conectado, se o Skyscanner pedir verificação ou
 * se o usuário cancelar.
 */
export async function startSkyscanner(monitorId: number, picks: SkyPick[] | number): Promise<AssistedStart> {
  if ((await getSetting('flights_chrome_assisted')) !== '1') throw new Error('Ative "Skyscanner via Claude + Chrome" em Fontes e execução.')
  if (busy) throw new Error('Já há uma busca no Chrome em andamento (uma por vez — é o seu navegador).')
  const m = await repo.getMonitor(monitorId)
  if (!m) throw new Error('Monitoramento não encontrado.')
  const errs = configErrors(m.config, todayLocal())
  if (errs.length) throw new Error(`Configuração incompleta: ${errs[0]}`)
  const combos = typeof picks === 'number' ? await pickCombos(m, Math.max(1, Math.min(MAX_PER_RUN, picks))) : validatePicks(m, picks)
  if (!combos.length) throw new Error('Todas as combinações sugeridas já foram consultadas no Skyscanner nas últimas 12 h.')

  const runId = await repo.createRun(monitorId, 'assisted')
  // o que você pesquisa passa a ser acompanhado (aba "Acompanhadas": preço dia a dia)
  await repo.addTracked(monitorId, combos)
  const pk = paxKey(m.config)
  const specs: TaskSpec[] = combos.map((c, i) => ({
    key: `${PROVIDER_ID}|${skyKey(c)}|${pk}`,
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
  const sessions = Math.ceil(combos.length / PER_SESSION)
  await repo.updateRun(runId, { planned: combos.length, message: `Claude está pesquisando no seu Chrome… (sessão 1 de ${sessions})` })
  busy = { monitorId, runId, kill: null, cancelled: false }
  broadcast('flights:updated', { monitorId, runId })

  void (async () => {
    let tokens = 0
    let calls = 0
    const tot: Tally = { done: 0, failed: 0, found: 0, errors: [], blocked: false }
    const settled = new Set<number>() // índices (em combos) já gravados
    let fatal: string | null = null
    let cancelled = false
    let lastMsg: string | null = null
    let session = 0
    const progress = (): string => `Claude está pesquisando no seu Chrome… (sessão ${session} de ${sessions} · ${settled.size}/${combos.length} combinações lidas)`
    try {
      const command = (await getSetting('claude_command')) || 'claude'
      const model = ((await getSetting('flights_chrome_model')) ?? 'sonnet').trim()
      for (let start = 0; start < combos.length; start += PER_SESSION) {
        if (busy?.cancelled) {
          cancelled = true
          break
        }
        const chunk = combos.slice(start, start + PER_SESSION)
        const started = new Date().toISOString()
        session++
        calls++
        await repo.updateRun(runId, { done: tot.done, failed: tot.failed, offersFound: tot.found, message: progress() })
        broadcast('flights:updated', { monitorId, runId })

        // gravação ao vivo: uma combinação por vez, em ordem (sql.js é síncrono, mas as escritas são async)
        let queue = Promise.resolve()
        let buf = ''
        const live = (r: Record<string, unknown>): void => {
          const i = start + Number(r.combo)
          if (Number(r.combo) < 0 || Number(r.combo) >= chunk.length || settled.has(i)) return
          settled.add(i)
          queue = queue
            .then(async () => {
              if (stopping) return
              await applyOne(m, runId, combos[i], taskIds[i], r, 'error', started, tot)
              await repo.updateRun(runId, { done: tot.done, failed: tot.failed, offersFound: tot.found, message: progress() })
              broadcast('flights:updated', { monitorId, runId })
            })
            .catch(() => undefined)
        }
        let sessionTokens = 0
        let raw: string
        try {
          raw = await runClaude(buildPrompt(m, chunk), command, {
            model,
            streamJson: true,
            extraArgs: ['--chrome', '--allowedTools', 'mcp__claude-in-chrome'],
            timeoutMs: (4 + 2 * chunk.length) * 60_000,
            registerChild: (kill) => busy && (busy.kill = kill),
            onChunk: (t) => {
              const r = takeResultLines(buf + t)
              buf = r.rest.slice(-20_000)
              r.results.forEach(live)
            },
            onUsage: (u) => {
              sessionTokens = u.inputTokens + u.outputTokens + u.cacheCreationTokens + u.cacheReadTokens
              recordAiUsage({ ...u, source: 'passagens-chrome', projectId: null, model: u.model || model || null }).catch(() => undefined)
            }
          })
        } finally {
          tokens += sessionTokens
          takeResultLines(buf + '\n').results.forEach(live)
          await queue
        }
        if (stopping) return
        const j = firstJson(raw)
        const status = String(j.status ?? 'error')
        if (status === 'no_browser' && !settled.size) throw new Error('Chrome não conectado: abra o Chrome com a extensão Claude in Chrome ativa (e logada) e tente de novo.')
        const results = Array.isArray(j.results) ? (j.results as Record<string, unknown>[]) : []
        // o JSON final completa o que não veio nas linhas RESULT
        for (const [k, c] of chunk.entries()) {
          const i = start + k
          if (settled.has(i)) continue
          settled.add(i)
          await applyOne(m, runId, c, taskIds[i], results.find((x) => Number(x.combo) === k), status === 'blocked' ? 'blocked' : 'error', started, tot)
        }
        if (j.message) lastMsg = String(j.message).slice(0, 200)
        if (status === 'blocked' || tot.blocked) {
          tot.blocked = true
          break
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (busy?.cancelled) cancelled = true
      else fatal = msg
    } finally {
      if (!stopping) {
        // o que não rodou (bloqueio, cancelamento, erro) volta para a fila
        const left = taskIds.filter((_, i) => !settled.has(i))
        for (const id of left) await repo.finishTask(id, { status: 'pending', error: fatal ? fatal.slice(0, 200) : cancelled ? 'Cancelado.' : 'Não pesquisado (sessão interrompida).' })
        const message = [
          fatal,
          cancelled ? 'Cancelado por você.' : null,
          tot.blocked ? 'O Skyscanner pediu verificação humana — resolva no Chrome, se quiser, e rode de novo; o app não contorna.' : null,
          left.length && !fatal && !cancelled ? `${left.length} combinação(ões) voltaram para a fila.` : null,
          lastMsg,
          tot.errors.length ? `${tot.errors.length} linha(s) descartadas na validação.` : null
        ]
          .filter(Boolean)
          .join(' ')
        await repo.updateRun(runId, {
          status: tot.done === 0 ? 'failed' : tot.blocked || tot.failed || fatal || cancelled || tot.done < combos.length ? 'partial' : 'done',
          done: tot.done,
          failed: tot.failed,
          queries: combos.length,
          offersFound: tot.found,
          aiCalls: calls,
          tokens,
          finishedAt: new Date().toISOString(),
          message: message.slice(0, 400) || null
        })
        if (tot.done) await repo.setMonitorMeta(monitorId, { lastSuccessAt: new Date().toISOString(), lastError: null })
        broadcast('flights:updated', { monitorId, runId })
      }
      busy = null
    }
  })()
  return { runId, combos }
}

/** Aba "Acompanhadas": preço de cada combinação dia a dia, para comparar entre elas. */
export async function trackedView(m: FlightMonitor, days = 60): Promise<TrackedView> {
  const tracked = await repo.listTracked(m.id)
  const pk = paxKey(m.config)
  const cur = m.config.currency
  const today = todayLocal()
  const { scored, rows } = await scoredOffers(m)
  const excluded = new Set<number>()
  const availableBy = new Map<string, number>()
  const comboOf = new Map<number, string>()
  for (const s of scored) {
    const r = rows.get(s.offer)!
    comboOf.set(r.id, skyKey({ origin: r.origin, destination: r.destination, depart: r.departDate, ret: r.returnDate }))
    if (s.ev.status === 'excluded') excluded.add(r.id)
    else if (r.available) availableBy.set(comboOf.get(r.id)!, (availableBy.get(comboOf.get(r.id)!) ?? 0) + 1)
  }
  const since = new Date(Date.now() - days * 86400_000).toISOString()
  const perCombo = new Map<string, Map<string, number>>()
  for (const o of await repo.listObservations(m.id, since)) {
    if (o.paxKey !== pk || o.currency !== cur || excluded.has(o.offerId)) continue
    const k = comboOf.get(o.offerId)
    if (!k) continue
    const day = todayLocal(new Date(o.observedAt)) // dia local da leitura
    const map = perCombo.get(k) ?? new Map<string, number>()
    map.set(day, Math.min(map.get(day) ?? Infinity, o.priceMinor))
    perCombo.set(k, map)
  }
  const checked = new Map<string, string>()
  for (const t of await repo.listTasks(m.id))
    if (t.provider === PROVIDER_ID && t.status === 'done' && t.finishedAt) {
      const k = skyKey({ origin: t.origin, destination: t.destination, depart: t.departDate, ret: t.returnDate })
      if ((checked.get(k) ?? '') < t.finishedAt) checked.set(k, t.finishedAt)
    }
  const all = tracked.map((t) => getAirport(t.origin)?.country)
  const allD = tracked.map((t) => getAirport(t.destination)?.country)
  const multiO = new Set(all).size > 1
  const multiD = new Set(allD).size > 1
  const label = (iata: string, multi: boolean): string => {
    const a = getAirport(iata)
    return a ? `${placeLabel(a, multi)} (${iata})` : iata
  }
  const money = (minor: number | undefined): Money | null => (minor == null || !Number.isFinite(minor) ? null : { amountMinor: minor, currency: cur })
  const combos: TrackedCombo[] = tracked.map((t) => {
    const p: SkyPick = { origin: t.origin, destination: t.destination, depart: t.departDate, ret: t.returnDate || null }
    const k = skyKey(p)
    const points = [...(perCombo.get(k) ?? new Map()).entries()].sort().map(([day, minor]) => ({ day, minor }))
    const last = points[points.length - 1]
    return {
      ...p,
      originLabel: label(p.origin, multiO),
      destinationLabel: label(p.destination, multiD),
      url: skyscannerUrl(p.origin, p.destination, p.depart, p.ret, m),
      addedAt: t.createdAt,
      points,
      latest: money(last?.minor),
      latestDay: last?.day ?? null,
      previous: money(points[points.length - 2]?.minor),
      best: money(points.length ? Math.min(...points.map((x) => x.minor)) : undefined),
      lastCheckedAt: checked.get(k) ?? null,
      offers: availableBy.get(k) ?? 0,
      past: p.depart < today
    }
  })
  combos.sort((a, b) => Number(a.past) - Number(b.past) || (a.latest?.amountMinor ?? Infinity) - (b.latest?.amountMinor ?? Infinity) || a.depart.localeCompare(b.depart))
  const dayset = [...new Set(combos.flatMap((c) => c.points.map((x) => x.day)))].sort().slice(-10)
  return { currency: cur, days: dayset, combos }
}

export type { RunInfo }
