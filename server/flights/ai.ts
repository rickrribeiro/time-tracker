import crypto from 'crypto'
import type { AiDraft, FlightMonitor, MonitorConfig } from '../../shared/flights'
import { defaultMonitorConfig, formatMoney, REGIONS, toMinor } from '../../shared/flights'
import { getSetting } from '../database/queries'
import { runClaude } from '../services/claude'
import { todayLocal } from './dates'
import { estimateGround } from './ground'
import { getAirport, refCenter, resolveRef, searchPlaces } from './geo'
import { parseImport } from './importer'
import * as repo from './repo'
import { configErrors, normalizeConfig } from './validate'
import { fmtMinutes } from '../../shared/flights'

/**
 * IA só onde agrega: interpretar linguagem natural, recomendar regiões/aeroportos,
 * estruturar texto livre de alertas e comentar trade-offs. Regras:
 *  • 1 chamada por pedido, resposta JSON pequena, modelo econômico (configurável);
 *  • cache por hash do texto (pedido igual → zero tokens);
 *  • TODO código/IATA/país que a IA devolve é revalidado na base (`normalizeConfig`);
 *  • distâncias/tempos vêm de geo/OSRM, nunca da IA; nada é salvo sem revisão do usuário.
 */
const hash = (s: string): string => crypto.createHash('sha256').update(s).digest('hex').slice(0, 24)

async function model(): Promise<string> {
  return ((await getSetting('flights_ai_model')) ?? 'haiku').trim()
}

async function ask(prompt: string): Promise<string> {
  const command = (await getSetting('claude_command')) || 'claude'
  return runClaude(prompt, command, { model: await model(), timeoutMs: 120_000, usage: { source: 'passagens' } })
}

function firstJson(text: string): unknown {
  const start = text.search(/[[{]/)
  if (start < 0) throw new Error('A IA não devolveu JSON.')
  const close = text[start] === '{' ? '}' : ']'
  const end = text.lastIndexOf(close)
  if (end <= start) throw new Error('JSON incompleto na resposta da IA.')
  return JSON.parse(text.slice(start, end + 1))
}

/** Orçamento de chamadas de IA por monitor por dia (monitor null = assistente de criação). */
async function spendAi(monitorId: number | null, limit: number): Promise<void> {
  const key = `ai:count:${monitorId ?? 'new'}:${todayLocal()}`
  const n = (await repo.cacheGet<number>(key)) ?? 0
  if (n >= limit) throw new Error(`Limite de ${limit} chamada(s) de IA por dia atingido${monitorId ? ' para este monitor' : ''}. Ajuste em "Fontes e execução".`)
  await repo.cacheSet(key, n + 1, 36 * 3600_000)
}

const DRAFT_SCHEMA = `{
 "name": "nome curto",
 "origins": [{"kind":"region|country|state|city|airport","code":"..."}],
 "destinations": [{"kind":"...","code":"..."}],
 "originExclude": ["IATA"], "destinationExclude": ["IATA"],
 "tripType": "oneway|roundtrip",
 "windows": [{"mode":"range","from":"YYYY-MM-DD","to":"YYYY-MM-DD"} | {"mode":"exact","date":"YYYY-MM-DD"} | {"mode":"flex","date":"YYYY-MM-DD","flexDays":3} | {"mode":"month","month":"YYYY-MM"}],
 "returnWindows": [], "minStayDays": null, "maxStayDays": null,
 "adults": 1, "children": 0, "infants": 0, "cabin": "economy|premium_economy|business|first",
 "checkedBag": "required|preferred|any", "checkedCount": 1, "carryOn": "required|preferred|any",
 "maxStops": null, "maxDurationHours": null,
 "forbiddenConnectionCountries": ["ISO2"], "forbidSelfTransfer": false, "forbidAirportChange": false,
 "maxPrice": null | {"amount": 4000, "currency": "BRL"},
 "strategy": "value|price|total_cost|duration|door_to_door|stops",
 "currency": "BRL",
 "groundAlternatives": [{"airport":"IATA alternativo","toCity":"cidade final"}],
 "explanations": ["≤ 6 frases curtas: por que cada origem/destino/alternativa"],
 "questions": ["o que ficou indefinido e vale perguntar"]
}`

type Obj = Record<string, unknown>

export async function draftFromText(text: string, currentCurrency = 'BRL'): Promise<AiDraft> {
  const clean = text.trim().slice(0, 3000)
  if (clean.length < 8) throw new Error('Descreva a viagem com um pouco mais de detalhe.')
  const today = todayLocal()
  const cacheKey = `ai:draft:${hash(`${today.slice(0, 7)}|${clean}`)}`
  let raw = await repo.cacheGet<Obj>(cacheKey)
  const cached = !!raw
  if (!raw) {
    await spendAi(null, 10)
    const prompt = [
      'Você converte um pedido de monitoramento de passagens aéreas em JSON estruturado.',
      `Hoje é ${today}. Datas sem ano = próxima ocorrência futura. Moeda padrão: ${currentCurrency}.`,
      `Regiões disponíveis (use kind "region" e este code): ${REGIONS.map((r) => `${r.id}=${r.label}`).join('; ')}.`,
      'Países: ISO 3166-1 alpha-2 (kind "country"). Estados: ISO 3166-2, ex. BR-BA (kind "state"). Aeroportos: só códigos IATA REAIS de aeroportos com voos comerciais.',
      'Se o usuário não definiu países, recomende os de maior oferta de voos (hubs) e explique. Para destino com aeroportos alternativos razoáveis por terra, liste em groundAlternatives.',
      'Não invente distâncias, preços nem regras de visto. Responda APENAS o JSON, sem cercas de código, neste formato:',
      DRAFT_SCHEMA,
      `Pedido: """${clean}"""`
    ].join('\n')
    raw = firstJson(await ask(prompt)) as Obj
    await repo.cacheSet(cacheKey, raw, 7 * 86400_000)
  }
  return buildDraft(raw, cached)
}

/** Converte a resposta da IA em configuração validada (exportado para teste). */
export async function buildDraft(raw: Obj, cached: boolean, withGround = true): Promise<AiDraft> {
  const warnings: string[] = []
  const today = todayLocal()
  const asRefs = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : [])
  const maxPrice = raw.maxPrice && typeof raw.maxPrice === 'object' ? (raw.maxPrice as Obj) : null
  const cur = typeof raw.currency === 'string' ? raw.currency.toUpperCase() : 'BRL'
  const shaped: Obj = {
    ...defaultMonitorConfig(),
    origins: { include: asRefs(raw.origins), exclude: raw.originExclude ?? [] },
    destinations: { include: asRefs(raw.destinations), exclude: raw.destinationExclude ?? [] },
    dates: { tripType: raw.tripType, windows: raw.windows, returnWindows: raw.returnWindows ?? [], minStayDays: raw.minStayDays, maxStayDays: raw.maxStayDays },
    passengers: { adults: raw.adults ?? 1, children: raw.children ?? 0, infants: raw.infants ?? 0, cabin: raw.cabin },
    baggage: { checked: raw.checkedBag, checkedCount: raw.checkedCount ?? 1, carryOn: raw.carryOn, refundable: 'any' },
    constraints: {
      ...defaultMonitorConfig().constraints,
      maxStops: raw.maxStops,
      maxTotalDurationHours: raw.maxDurationHours,
      forbiddenConnectionCountries: raw.forbiddenConnectionCountries ?? [],
      forbidSelfTransfer: raw.forbidSelfTransfer,
      forbidAirportChange: raw.forbidAirportChange,
      maxPrice: maxPrice && Number(maxPrice.amount) > 0 ? { amountMinor: toMinor(Number(maxPrice.amount), String(maxPrice.currency || cur).toUpperCase()), currency: String(maxPrice.currency || cur).toUpperCase() } : null
    },
    preferences: { ...defaultMonitorConfig().preferences, strategy: raw.strategy },
    currency: cur
  }
  const dropped: string[] = []
  const config: MonitorConfig = normalizeConfig(shaped, dropped)
  if (dropped.length) warnings.push(`Descartei sugestões que não existem na base de aeroportos: ${dropped.join(', ')}.`)

  // alternativas terrestres: aeroporto validado + cidade resolvida pela base; tempo/distância calculados aqui
  const explanations = (Array.isArray(raw.explanations) ? raw.explanations : []).map(String).slice(0, 8)
  for (const g of (Array.isArray(raw.groundAlternatives) ? raw.groundAlternatives : []).slice(0, 5) as Obj[]) {
    const ap = getAirport(String(g.airport ?? ''))
    const city = searchPlaces(String(g.toCity ?? ''), 5).find((s) => s.kind === 'city' || s.kind === 'airport')
    const center = city ? refCenter(city) : null
    if (!ap || !center) {
      warnings.push(`Alternativa terrestre ignorada (não validada): ${String(g.airport)} → ${String(g.toCity)}.`)
      continue
    }
    if (!config.destinations.include.some((r) => r.kind === 'airport' && r.code === ap.iata)) {
      const ref = resolveRef({ kind: 'airport', code: ap.iata })
      if (ref) config.destinations.include.push(ref)
    }
    const est = withGround ? await estimateGround(ap.iata, center) : null
    config.ground.push({
      airport: ap.iata,
      toLabel: String(g.toCity),
      minutes: est?.minutes ?? null,
      costMinor: est?.costMinor ?? null,
      currency: est?.currency ?? config.currency,
      source: est?.source ?? 'manual'
    })
    if (est) explanations.push(`${ap.iata} → ${String(g.toCity)}: ~${est.km} km, ${fmtMinutes(est.minutes)} por estrada (${est.source === 'osrm' ? 'rota calculada' : 'aproximação em linha reta'}); custo ${est.costMinor != null ? formatMoney({ amountMinor: est.costMinor, currency: est.currency! }) : 'desconhecido — preencha'}.`)
  }
  warnings.push(...configErrors(config, today))
  return {
    name: String(raw.name ?? '').slice(0, 80) || 'Monitoramento criado com IA',
    config,
    explanations,
    warnings,
    questions: (Array.isArray(raw.questions) ? raw.questions : []).map(String).slice(0, 5),
    cached
  }
}

/** Texto de alerta/e-mail → formato de importação (a IA só estrutura; o importador valida). */
export async function structureImportText(text: string, monitorId: number, aiLimit: number): Promise<ReturnType<typeof parseImport>> {
  const clean = text.trim().slice(0, 6000)
  const cacheKey = `ai:import:${hash(clean)}`
  let json = await repo.cacheGet<unknown>(cacheKey)
  if (!json) {
    await spendAi(monitorId, aiLimit)
    const prompt = [
      'Extraia as ofertas de passagem do texto abaixo (alerta de preço / e-mail / anotação). NÃO invente dados ausentes: omita o campo.',
      'Responda APENAS um array JSON: [{"origin":"IATA","destination":"IATA","depart":"YYYY-MM-DDTHH:MM","arrive":"...","price":123.45,"currency":"BRL","stops":0,"carrier":"IATA","flight":"123","checked_bags":null,"link":"https://...","source":"nome da fonte","observed_at":"YYYY-MM-DD"}]',
      `Hoje é ${todayLocal()}.`,
      `Texto: """${clean}"""`
    ].join('\n')
    json = firstJson(await ask(prompt))
    await repo.cacheSet(cacheKey, json, 30 * 86400_000)
  }
  return parseImport(JSON.stringify(json), { source: 'Alerta importado (IA)', verification: 'imported' })
}

/** Comentário curto sobre trade-offs das melhores opções — dados já normalizados, 1 linha por oferta. */
export async function insights(m: FlightMonitor, rows: string[]): Promise<{ text: string; cached: boolean }> {
  if (!rows.length) throw new Error('Sem ofertas elegíveis para analisar.')
  const compact = rows.slice(0, 12).join('\n')
  const cacheKey = `ai:insights:${m.id}:${hash(compact)}`
  const hit = await repo.cacheGet<string>(cacheKey)
  if (hit) return { text: hit, cached: true }
  await spendAi(m.id, m.config.budget.maxAiCallsPerRun)
  const prompt = [
    `Monitoramento "${m.name}". Abaixo, as melhores opções JÁ filtradas e ordenadas pelo sistema (não reordene nem recalcule números).`,
    'Em até 6 bullets curtos em pt-BR: trade-offs relevantes (preço × duração × conexões × aeroporto de chegada), riscos (self-transfer, conexões curtas, dados não verificados) e o que vale revalidar. Não afirme regras de visto/trânsito; diga "verifique" quando relevante.',
    'Formato das linhas: id | rota | partida | preço | custo total (status) | duração | conexões | bagagem | fonte',
    compact
  ].join('\n')
  const text = (await ask(prompt)).trim()
  await repo.cacheSet(cacheKey, text, 3 * 86400_000)
  return { text, cached: false }
}
