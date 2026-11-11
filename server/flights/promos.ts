import type { FlightMonitor, PromoFeedView, PromoPost } from '../../shared/flights'
import { REGIONS } from '../../shared/flights'
import { getSetting } from '../database/queries'
import { notify } from '../services/notifications'
import { broadcast } from '../events'
import { countryName, expandSet } from './geo'
import * as repo from './repo'

/**
 * Radar de promoções: RSS de blogs de passagens (feito para ser lido por programas).
 * Casamento 100% determinístico por palavras: cidades/estados/países/regiões e IATA das
 * origens e destinos do monitor. Não vira "oferta" (o post não tem itinerário estruturado);
 * dá para estruturar um post com a IA pela importação, se valer a pena.
 */
export const DEFAULT_FEEDS = ['https://www.melhoresdestinos.com.br/feed', 'https://passageirodeprimeira.com/feed/']
const UA = 'Mozilla/5.0 (rickOS; leitor RSS pessoal)'
const FEED_TTL = 2 * 3600_000
const MAX_AGE_DAYS = 21

interface FeedItem {
  title: string
  link: string
  source: string
  publishedAt: string | null
  summary: string
}

interface FeedCache {
  items: FeedItem[]
  fetchedAt: string
  error: string | null
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…' }
function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
}
const tag = (xml: string, name: string): string => decode(xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'))?.[1] ?? '')

export function parseRss(xml: string, fallbackSource: string): FeedItem[] {
  const channel = tag(xml.split(/<item[\s>]/i)[0] ?? '', 'title') || fallbackSource
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? []
  return blocks.slice(0, 60).map((b) => {
    const atomLink = b.match(/<link[^>]+href="([^"]+)"/i)?.[1]
    const date = tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated')
    const t = Date.parse(date)
    return {
      title: tag(b, 'title'),
      link: (tag(b, 'link') || atomLink || '').trim(),
      source: channel,
      publishedAt: Number.isNaN(t) ? null : new Date(t).toISOString(),
      summary: (tag(b, 'description') || tag(b, 'summary')).slice(0, 600)
    }
  }).filter((i) => i.title && /^https?:\/\//.test(i.link))
}

export async function feedUrls(): Promise<string[]> {
  const raw = await getSetting('flights_promo_feeds')
  if (raw == null || !raw.trim()) return DEFAULT_FEEDS
  return raw.split(/\s+/).map((x) => x.trim()).filter((x) => /^https?:\/\//.test(x)).slice(0, 15)
}

async function fetchFeed(url: string, force = false): Promise<FeedCache> {
  const key = `rss:${url}`
  if (!force) {
    const hit = await repo.cacheGet<FeedCache>(key)
    if (hit) return hit
  }
  let out: FeedCache
  const get = async (): Promise<Response> => {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 15_000)
    try {
      return await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml' }, signal: ctl.signal })
    } finally {
      clearTimeout(timer)
    }
  }
  try {
    // falha de rede transitória: 1 nova tentativa antes de registrar erro
    const res = await get().catch(async () => {
      await new Promise((r) => setTimeout(r, 1500))
      return get()
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const items = parseRss(await res.text(), new URL(url).hostname)
    out = { items, fetchedAt: new Date().toISOString(), error: items.length ? null : 'Feed sem itens (formato não reconhecido?)' }
  } catch (e) {
    out = { items: [], fetchedAt: new Date().toISOString(), error: e instanceof Error ? e.message : String(e) }
  }
  await repo.cacheSet(key, out, out.error ? 20 * 60_000 : FEED_TTL)
  return out
}

const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Nomes em inglês que os blogs também usam (Intl dá o nome em pt-BR). */
const EN_ALIASES: Record<string, string[]> = { 'Tóquio': ['Tokyo'], Bangkok: ['Bancoc'], Seul: ['Seoul'], 'Singapura': ['Singapore'], 'Ho Chi Minh City': ['Ho Chi Minh', 'Saigon', 'Saigão'], Hanoi: ['Hanói'], 'Kuala Lumpur': ['KL'] }

/** Lugar do país de residência (padrão BR) — casa com quase todo post de blog brasileiro. */
const HOME = 'BR'

interface Kw {
  word: string
  side: 'origin' | 'dest'
  home: boolean
}

/**
 * Palavras-chave do monitor (cidades, estados, países, regiões, IATA) marcadas por lado e
 * se são do país de residência. Nomes curtos e o próprio "Brasil" ficam de fora.
 */
export function keywordsFor(m: FlightMonitor): Kw[] {
  const out = new Map<string, Kw>()
  const add = (word: string, side: Kw['side'], home: boolean): void => {
    if (!word || (word.length < 4 && !/^[A-Z]{3}$/.test(word))) return
    if (!out.has(`${side}:${word}`)) out.set(`${side}:${word}`, { word, side, home })
    for (const al of EN_ALIASES[word] ?? []) out.set(`${side}:${al}`, { word: al, side, home })
  }
  for (const [side, set] of [['origin', m.config.origins], ['dest', m.config.destinations]] as const) {
    for (const r of set.include) {
      if (r.kind === 'region') add(REGIONS.find((x) => x.id === r.code)?.label ?? r.label, side, r.code === 'br_northeast')
      if (r.kind === 'country' && r.code !== HOME) add(countryName(r.code), side, false)
    }
    for (const a of expandSet(set).slice(0, 40)) {
      const home = a.country === HOME
      add(a.city.replace(/\s*\(.*\)$/, ''), side, home)
      if (home && a.regionName.length >= 4) add(a.regionName, side, true)
      if (!home) add(a.countryName, side, false)
      add(a.iata, side, home)
    }
  }
  return [...out.values()]
}

function mentions(text: string, kw: string): boolean {
  if (/^[A-Z]{3}$/.test(kw)) return new RegExp(`(^|[^A-Za-z])${kw}([^A-Za-z]|$)`).test(text) // IATA: maiúsculo, palavra inteira
  return new RegExp(`(^|[^a-z])${norm(kw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(norm(text))
}

/**
 * Casa posts com o monitor. Monitor internacional: só lugares FORA do país de residência
 * disparam o casamento (senão "São Paulo"/"Salvador" casariam todo post nacional); os de
 * casa só reforçam. Monitor doméstico: todos contam.
 */
export function matchPosts(m: FlightMonitor, items: FeedItem[], now = Date.now()): PromoPost[] {
  const kws = keywordsFor(m)
  const domestic = kws.every((k) => k.home)
  const out: PromoPost[] = []
  for (const it of items) {
    if (it.publishedAt && now - Date.parse(it.publishedAt) > MAX_AGE_DAYS * 86400_000) continue
    const text = `${it.title} ${it.summary}`
    const hit = kws.filter((k) => mentions(text, k.word))
    const trigger = domestic ? hit : hit.filter((k) => !k.home)
    if (!trigger.length) continue
    const sides = new Set(hit.map((k) => k.side))
    out.push({
      ...it,
      prices: [...new Set(text.match(/R\$\s?\d{1,3}(?:\.\d{3})*(?:,\d{2})?/g) ?? [])].slice(0, 4),
      matches: [...new Set(hit.map((k) => k.word))].slice(0, 6),
      both: sides.size === 2
    })
  }
  return out.sort((a, b) => Number(b.both) - Number(a.both) || (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
}

export async function promosFor(m: FlightMonitor, force = false): Promise<PromoFeedView> {
  const urls = await feedUrls()
  const feeds = await Promise.all(urls.map(async (url) => ({ url, data: await fetchFeed(url, force) })))
  const seen = new Set<string>()
  const items = feeds.flatMap((f) => f.data.items).filter((i) => !seen.has(i.link) && seen.add(i.link))
  const kws = keywordsFor(m)
  const domestic = kws.every((k) => k.home)
  return {
    posts: matchPosts(m, items),
    feeds: feeds.map((f) => ({ url: f.url, ok: !f.data.error, items: f.data.items.length, error: f.data.error, fetchedAt: f.data.fetchedAt })),
    keywords: [...new Set(kws.filter((k) => (domestic || !k.home) && !/^[A-Z]{3}$/.test(k.word)).map((k) => k.word))].slice(0, 30)
  }
}

/** Agendador: avisa posts novos que casam com monitores ativos (1x por post por monitor). */
export async function checkPromoAlerts(monitors: FlightMonitor[]): Promise<number> {
  const due = monitors.filter((m) => m.status === 'active' && m.config.alerts.promoPosts && (m.config.origins.include.length || m.config.destinations.include.length))
  if (!due.length) return 0
  let fired = 0
  for (const m of due) {
    const { posts } = await promosFor(m)
    for (const p of posts.filter((x) => !x.publishedAt || x.publishedAt >= m.createdAt).slice(0, 5)) {
      const msg = `${p.title}${p.prices.length ? ` (${p.prices[0]})` : ''} — ${p.source}`
      if (await repo.recordAlert(m.id, null, 'promo_post', `${m.id}:promo:${p.link}`, msg)) {
        fired++
        await notify({ title: `🏷️ Promoção: ${m.name}`, body: `${msg}\nMenciona: ${p.matches.join(', ')}`, source: 'passagens', page: 'trip-monitoring' })
      }
    }
    if (fired) broadcast('flights:updated', { monitorId: m.id, runId: null })
  }
  return fired
}
