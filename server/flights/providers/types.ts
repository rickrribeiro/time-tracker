import type { Cabin, NormalizedOffer, ProviderCapabilities } from '../../../shared/flights'
import { minorDigits } from '../../../shared/flights'

/** Uma consulta atômica a um provedor. `departDate` pode ser 'YYYY-MM' quando o provedor tem `monthRange`. */
export interface SearchQuery {
  origin: string
  destination: string
  departDate: string
  returnDate: string | null
  adults: number
  children: number
  infants: number
  cabin: Cabin
  maxStops: number | null
  currency: string
}

export interface SearchResult {
  offers: NormalizedOffer[]
  /** Observação curta para o log da tarefa (ex.: "cache vazio para essa rota"). */
  note?: string
}

export type ProviderErrorKind = 'config' | 'auth' | 'quota' | 'rate_limit' | 'timeout' | 'network' | 'bad_request' | 'upstream'

/** Erro tipado: o executor decide retry/backoff/parar o provedor pelo `kind`. */
export class ProviderError extends Error {
  constructor(
    public kind: ProviderErrorKind,
    message: string,
    public retryAfterMs: number | null = null
  ) {
    super(message)
  }
  get retryable(): boolean {
    return this.kind === 'timeout' || this.kind === 'network' || this.kind === 'rate_limit' || this.kind === 'upstream'
  }
  /** Erros que invalidam o provedor inteiro nesta execução (não adianta tentar outras combinações). */
  get fatal(): boolean {
    return this.kind === 'config' || this.kind === 'auth' || this.kind === 'quota'
  }
}

export interface ProviderContext {
  getSetting: (key: string) => Promise<string | null>
  signal: AbortSignal
  now: () => Date
}

export interface FlightProvider {
  id: string
  label: string
  kind: 'api' | 'import' | 'assisted'
  capabilities: ProviderCapabilities
  docs: string
  notes: string[]
  /** Configurado e utilizável? `reason` explica quando não. Não faz rede. */
  status: (ctx: Pick<ProviderContext, 'getSetting'>) => Promise<{ configured: boolean; available: boolean; reason: string | null }>
  search?: (q: SearchQuery, ctx: ProviderContext) => Promise<SearchResult>
  /** Teste de conexão explícito (botão nas configurações). */
  test?: (ctx: ProviderContext) => Promise<string>
}

/** "1234.56" → 123456 sem passar por float. */
export function decimalToMinor(value: string | number, currency: string): number {
  const digits = minorDigits(currency)
  const s = typeof value === 'number' ? value.toFixed(digits) : String(value).trim()
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`Valor monetário inválido: ${value}`)
  const neg = s.startsWith('-')
  const [int, frac = ''] = s.replace('-', '').split('.')
  const padded = (frac + '0'.repeat(digits)).slice(0, digits)
  // arredonda pelo dígito seguinte (meio para cima)
  let minor = Number(int) * 10 ** digits + (digits ? Number(padded) : 0)
  if (Number(frac[digits] ?? '0') >= 5) minor += 1
  return neg ? -minor : minor
}

/** Duração ISO 8601 ("PT13H05M", "P1DT2H") → minutos. */
export function isoDurationMin(s: string | null | undefined): number | null {
  if (!s) return null
  const m = s.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/)
  if (!m) return null
  return Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) + Math.round(Number(m[4] ?? 0) / 60)
}

/** fetch com timeout/abort e classificação de erro HTTP. */
export async function fetchJson(url: string, init: RequestInit & { timeoutMs?: number }, signal: AbortSignal): Promise<unknown> {
  const ctl = new AbortController()
  const onAbort = (): void => ctl.abort()
  signal.addEventListener('abort', onAbort)
  const timer = setTimeout(() => ctl.abort(), init.timeoutMs ?? 25_000)
  let res: Response
  try {
    res = await fetch(url, { ...init, signal: ctl.signal })
  } catch (e) {
    if (ctl.signal.aborted) throw new ProviderError(signal.aborted ? 'timeout' : 'timeout', signal.aborted ? 'Execução cancelada/estourou o tempo.' : 'Tempo de resposta esgotado.')
    throw new ProviderError('network', `Falha de rede: ${e instanceof Error ? e.message : String(e)}`)
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', onAbort)
  }
  const text = await res.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  if (res.ok) return body
  const detail = typeof body === 'object' && body ? JSON.stringify(body).slice(0, 240) : String(text).slice(0, 240)
  const retryAfter = Number(res.headers.get('retry-after'))
  const reset = res.headers.get('ratelimit-reset')
  const wait = retryAfter > 0 ? retryAfter * 1000 : reset ? Math.max(1000, Date.parse(reset) - Date.now()) || 60_000 : 60_000
  if (res.status === 401 || res.status === 403) throw new ProviderError('auth', `Não autorizado (${res.status}). Verifique a credencial. ${detail}`)
  if (res.status === 429) throw new ProviderError('rate_limit', 'Limite de requisições do provedor atingido.', wait)
  if (res.status === 402) throw new ProviderError('quota', `Cota/pagamento exigido (${res.status}). ${detail}`)
  if (res.status >= 500) throw new ProviderError('upstream', `Provedor indisponível (${res.status}).`)
  throw new ProviderError('bad_request', `Requisição recusada (${res.status}). ${detail}`)
}
