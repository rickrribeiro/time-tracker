/**
 * Tipos do monitoramento de passagens, compartilhados entre servidor (`server/flights/`)
 * e front (`src/modules/flights/`). Só tipos e constantes puras — nada de Node nem DOM.
 *
 * Dinheiro: sempre `amountMinor` inteiro (centavos) + moeda ISO 4217. Nunca float.
 * Datas de calendário: 'YYYY-MM-DD'. Horários de voo: hora LOCAL do aeroporto,
 * 'YYYY-MM-DDTHH:MM' (sem offset), mais o fuso IANA do aeroporto quando conhecido.
 */

// ── Localidades ──────────────────────────────────────────────────────────────

/** airport=IATA · city=`<país>:<município>` ou código metropolitano (TYO) · state=ISO 3166-2 (BR-BA) · country=ISO2 · region=id de `REGIONS`. */
export type LocationKind = 'airport' | 'city' | 'state' | 'country' | 'region'

export interface LocationRef {
  kind: LocationKind
  code: string
  label: string
}

export interface LocationSet {
  include: LocationRef[]
  /** IATAs removidos mesmo quando um país/região os incluiria. */
  exclude: string[]
  /** País/região: inclui também aeroportos pequenos (por padrão só grandes/médios com voo regular). */
  includeSmall?: boolean
}

export interface AirportInfo {
  iata: string
  name: string
  city: string
  country: string
  countryName: string
  region: string
  regionName: string
  lat: number
  lon: number
  tz: string | null
  size: 'L' | 'M' | 'S'
  /** Serviço comercial regular conhecido (OurAirports `scheduled_service`). */
  scheduled: boolean
}

export interface PlaceSuggestion extends LocationRef {
  sub: string
  airports: number
}

export interface NearbyAirport extends AirportInfo {
  distanceKm: number
  ground: GroundEstimate | null
}

export interface GroundEstimate {
  km: number
  minutes: number
  /** osrm = rota rodoviária calculada; straight = linha reta × fator (aproximação grosseira). */
  source: 'osrm' | 'straight'
  costMinor: number | null
  currency: string | null
}

// ── Datas ────────────────────────────────────────────────────────────────────

export type DateWindowMode = 'exact' | 'range' | 'flex' | 'month'

export interface DateWindow {
  mode: DateWindowMode
  /** exact / flex */
  date?: string
  /** flex: ±N dias */
  flexDays?: number
  /** range */
  from?: string
  to?: string
  /** month: 'YYYY-MM' */
  month?: string
}

export interface TripDates {
  tripType: 'oneway' | 'roundtrip'
  /** Janelas de ida (pode haver várias). */
  windows: DateWindow[]
  /** Ida e volta: janelas de volta. Sem elas, a volta sai de minStay/maxStay. */
  returnWindows: DateWindow[]
  minStayDays: number | null
  maxStayDays: number | null
}

// ── Passageiros / bagagem ────────────────────────────────────────────────────

export type Cabin = 'economy' | 'premium_economy' | 'business' | 'first'
export type Need = 'required' | 'preferred' | 'any'

export interface Passengers {
  adults: number
  children: number
  infants: number
  cabin: Cabin
}

export interface BaggageNeeds {
  carryOn: Need
  checked: Need
  checkedCount: number
  refundable: Need
}

// ── Restrições (obrigatórias) e preferências (pontuação) ─────────────────────

export interface Money {
  amountMinor: number
  currency: string
}

export interface Constraints {
  maxStops: number | null
  maxTotalDurationHours: number | null
  forbiddenConnectionCountries: string[]
  forbiddenConnectionAirports: string[]
  forbiddenCarriers: string[]
  forbidSelfTransfer: boolean
  forbidAirportChange: boolean
  forbidOvernightConnections: boolean
  minConnectionMinutes: number | null
  maxConnectionMinutes: number | null
  maxPrice: Money | null
}

export type SortStrategy = 'value' | 'price' | 'total_cost' | 'duration' | 'door_to_door' | 'stops'

export interface ScoreWeights {
  price: number
  duration: number
  stops: number
  connections: number
  schedule: number
  carriers: number
}

export interface Preferences {
  strategy: SortStrategy
  weights: ScoreWeights
  preferredCarriers: string[]
  /** 'HH:MM'–'HH:MM' de chegada conveniente (hora local do destino). */
  arrivalWindow: { from: string; to: string } | null
  preferNightFlights: boolean
  connectionStyle: 'short' | 'comfortable' | 'long_ok' | 'any'
  /** Conexões entre 6h e X horas viram "stopover interessante". */
  stopoverMaxHours: number | null
  avoidAirportChange: boolean
  avoidSeparateTickets: boolean
}

/** Custo/tempo terrestre do aeroporto de chegada até o destino final. */
export interface GroundOption {
  airport: string
  toLabel: string
  minutes: number | null
  costMinor: number | null
  currency: string
  source: 'manual' | 'osrm' | 'straight'
}

// ── Execução ─────────────────────────────────────────────────────────────────

export interface RunBudget {
  maxQueriesPerRun: number
  maxQueriesPerDay: number
  maxAiCallsPerRun: number
  maxTokensPerRun: number | null
  maxRunMinutes: number
}

export interface Schedule {
  mode: 'manual' | 'daily' | 'hours' | 'adaptive'
  everyHours: number
  /** daily: hora local do disparo */
  hour: number
}

export interface AlertRules {
  priceBelow: Money | null
  dropPercent: number | null
  newLow: boolean
  interesting: boolean
  favoriteChanges: boolean
  /** Post novo em blog de promoções que menciona origens/destinos do monitor. */
  promoPosts: boolean
}

export interface MonitorConfig {
  version: 1
  origins: LocationSet
  destinations: LocationSet
  dates: TripDates
  passengers: Passengers
  baggage: BaggageNeeds
  constraints: Constraints
  preferences: Preferences
  ground: GroundOption[]
  /** Moeda de exibição/comparação. */
  currency: string
  /** Provedores habilitados neste monitor (vazio = todos os automáticos configurados). */
  providers: string[]
  budget: RunBudget
  schedule: Schedule
  alerts: AlertRules
  /** Quantas opções exibir (0 = automático pela amplitude). */
  displayTarget: number
  notes: string
}

export type MonitorStatus = 'active' | 'paused' | 'draft'

export interface FlightMonitor {
  id: number
  name: string
  status: MonitorStatus
  tripId: number | null
  config: MonitorConfig
  createdAt: string
  updatedAt: string
  lastRunAt: string | null
  lastSuccessAt: string | null
  nextRunAt: string | null
  lastError: string | null
  extraDisplay: number
  legacy: { origin: string | null; destination: string | null; price: number | null; currency: string; checkedAt: string | null } | null
}

export type MonitorState = 'active' | 'paused' | 'running' | 'error' | 'needs_config'

export interface Coverage {
  /** Combinações possíveis (aeroporto×aeroporto×data) do universo da pesquisa. */
  universe: number
  /** Combinações já cobertas por alguma consulta bem-sucedida. */
  covered: number
  pending: number
  failed: number
  done: number
  percent: number
}

export interface MonitorSummary extends FlightMonitor {
  state: MonitorState
  stateDetail: string | null
  originSummary: string
  destinationSummary: string
  dateSummary: string
  minPrice: Money | null
  minVerifiedPrice: Money | null
  eligibleCount: number
  pendingCount: number
  offerCount: number
  trend: { direction: 'up' | 'down' | 'flat'; deltaPercent: number } | null
  coverage: Coverage
  activeRun: RunInfo | null
}

// ── Provedores ───────────────────────────────────────────────────────────────

export interface ProviderCapabilities {
  oneWay: boolean
  roundTrip: boolean
  /** Uma consulta cobre um mês inteiro (calendário de preços em cache). */
  monthRange: boolean
  /** Aceita código de cidade/metrópole (vários aeroportos) numa consulta. */
  multiAirport: boolean
  livePrices: boolean
  baggage: boolean
  segments: boolean
  deepLink: 'offer' | 'search' | 'none'
  passengersMix: boolean
  /** Pode rodar sem supervisão (agendador). */
  automated: boolean
  dailyQuota: number | null
}

export interface ProviderStatus {
  id: string
  label: string
  kind: 'api' | 'import' | 'assisted'
  configured: boolean
  enabled: boolean
  available: boolean
  reason: string | null
  capabilities: ProviderCapabilities
  usedToday: number
  docs: string
  notes: string[]
}

// ── Ofertas ──────────────────────────────────────────────────────────────────

export type Verification = 'live' | 'cached' | 'imported' | 'assisted'

export interface Segment {
  from: string
  to: string
  departLocal: string
  arriveLocal: string
  durationMin: number | null
  marketingCarrier: string | null
  operatingCarrier: string | null
  flightNumber: string | null
  terminalFrom: string | null
  terminalTo: string | null
  aircraft: string | null
}

export interface Slice {
  from: string
  to: string
  departLocal: string
  arriveLocal: string | null
  durationMin: number | null
  /** Conhecido sem detalhes de trechos (ex.: cache que só informa nº de conexões). */
  stops: number
  /** Companhias conhecidas da perna (mesmo sem trechos detalhados). */
  carriers: string[]
  /** Nº do primeiro voo (quando a fonte só informa um resumo). */
  firstFlightNumber: string | null
  /** Aeroportos de escala conhecidos sem horários (ex.: lidos de um resumo de busca). */
  via?: string[]
  segments: Segment[]
}

export interface BaggageInfo {
  /** null = desconhecido. */
  carryOn: number | null
  checked: number | null
  note: string | null
}

export interface NormalizedOffer {
  provider: string
  sourceLabel: string
  externalId: string | null
  slices: Slice[]
  price: Money
  baggage: BaggageInfo
  refundable: boolean | null
  selfTransfer: boolean | null
  separateTickets: boolean | null
  deepLink: string | null
  linkKind: 'offer' | 'search' | null
  verification: Verification
  observedAt: string
  expiresAt: string | null
}

export type EligibilityStatus = 'eligible' | 'pending' | 'excluded'

export interface CheckResult {
  code: string
  level: 'fail' | 'unknown' | 'warn' | 'info'
  message: string
}

export interface CostBreakdown {
  fare: Money
  /** Preço convertido para a moeda do monitor; null se não há câmbio configurado. */
  fareInCurrency: Money | null
  baggage: { status: 'included' | 'unknown' | 'not_needed' | 'extra'; amount: Money | null }
  ground: { status: 'none' | 'manual' | 'estimated' | 'unknown'; amount: Money | null; minutes: number | null; label: string | null }
  total: Money | null
  totalStatus: 'verified' | 'estimated' | 'unknown'
  doorToDoorMinutes: number | null
}

export interface ConnectionInfo {
  airport: string
  arriveAirport: string
  departAirport: string
  minutes: number | null
  airportChange: boolean
  overnight: boolean
  stopover: boolean
  country: string
}

export interface OfferView extends NormalizedOffer {
  id: number
  monitorId: number
  fingerprint: string
  firstSeenAt: string
  lastSeenAt: string
  available: boolean
  favorite: boolean
  previousPrice: Money | null
  origin: string
  destination: string
  originCountry: string
  destinationCountry: string
  departDate: string
  returnDate: string | null
  totalDurationMin: number | null
  stops: number
  carriers: string[]
  connections: ConnectionInfo[]
  status: EligibilityStatus
  checks: CheckResult[]
  cost: CostBreakdown
  score: number
  scoreParts: Record<string, number>
  highlights: string[]
  stale: boolean
  /** Links de PESQUISA equivalente (não abrem exatamente esta oferta). */
  searchLinks: { label: string; url: string }[]
  /** Fontes que já observaram este itinerário. */
  sources: string[]
}

export interface OfferQuery {
  status?: EligibilityStatus | 'all'
  search?: string
  origins?: string[]
  destinations?: string[]
  maxStops?: number | null
  carriers?: string[]
  providers?: string[]
  verification?: Verification[]
  favoritesOnly?: boolean
  includeUnavailable?: boolean
  sort?: SortStrategy | 'depart' | 'recent'
  diversify?: boolean
  page?: number
  pageSize?: number
}

export interface OfferPage {
  items: OfferView[]
  total: number
  page: number
  pageSize: number
  counts: Record<EligibilityStatus, number>
  displayTarget: number
  facets: { origins: string[]; destinations: string[]; carriers: string[]; providers: string[] }
  coverageNote: string | null
}

// ── Execuções / plano ────────────────────────────────────────────────────────

export type TaskStage = 'discovery' | 'deepen' | 'validate'
export type TaskStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped'

export interface RunInfo {
  id: number
  monitorId: number
  trigger: 'manual' | 'schedule' | 'more' | 'assisted'
  status: 'running' | 'done' | 'partial' | 'failed' | 'interrupted' | 'budget'
  startedAt: string
  finishedAt: string | null
  planned: number
  done: number
  failed: number
  queries: number
  cacheHits: number
  offersFound: number
  aiCalls: number
  tokens: number
  message: string | null
}

export interface PlanTaskView {
  id: number
  provider: string
  stage: TaskStage
  origin: string
  destination: string
  departDate: string
  returnDate: string | null
  status: TaskStatus
  attempts: number
  resultCount: number
  minPrice: Money | null
  lastError: string | null
  finishedAt: string | null
  priority: number
}

export interface PlanView {
  coverage: Coverage
  byStage: Record<TaskStage, Record<TaskStatus, number>>
  byProvider: Record<string, Record<TaskStatus, number>>
  tasks: PlanTaskView[]
  runs: RunInfo[]
  airports: { origins: string[]; destinations: string[] }
  warnings: string[]
}

// ── Calendário / histórico / alertas ─────────────────────────────────────────

export interface CalendarDay {
  date: string
  minPrice: Money | null
  /** searched=consultado com sucesso · failed=só falhas · none=nunca consultado */
  coverage: 'searched' | 'failed' | 'none'
  offers: number
}

export interface HistoryPoint {
  day: string
  minor: number
}

export interface HistoryView {
  currency: string
  overall: HistoryPoint[]
  byOrigin: Record<string, HistoryPoint[]>
  byDestination: Record<string, HistoryPoint[]>
  changes: { offerId: number; label: string; from: Money; to: Money; at: string }[]
  note: string | null
}

export interface AlertEvent {
  id: number
  monitorId: number
  offerId: number | null
  kind: string
  message: string
  createdAt: string
}

// ── Promoções (RSS de blogs) ─────────────────────────────────────────────────

export interface PromoPost {
  title: string
  link: string
  source: string
  publishedAt: string | null
  summary: string
  /** Preços citados no texto (ex.: "R$ 4.009"), sem interpretar a que se referem. */
  prices: string[]
  /** Localidades do monitor mencionadas (motivo do casamento). */
  matches: string[]
  /** Casou com destino E origem (mais relevante). */
  both: boolean
}

export interface PromoFeedView {
  posts: PromoPost[]
  feeds: { url: string; ok: boolean; items: number; error: string | null; fetchedAt: string | null }[]
  keywords: string[]
}

// ── Skyscanner via Claude + Chrome ───────────────────────────────────────────

/** Uma combinação rota × datas escolhida para pesquisar no Skyscanner. */
export interface SkyPick {
  origin: string
  destination: string
  depart: string
  ret: string | null
}

export interface SkyCombo extends SkyPick {
  url: string
}

export interface SkyPlace {
  iata: string
  /** "Bangkok, Tailândia" quando o lado tem vários países; senão só a cidade. */
  label: string
  country: string
  countryName: string
  city: string
}

export interface SkyPreview {
  origins: SkyPlace[]
  destinations: SkyPlace[]
  /** Pares válidos "ORIG|DEST" (exclui mesmo aeroporto / muito próximos). */
  pairs: string[]
  /** Todas as datas do intervalo (ida, ou ida+volta), até `datesTotal`. */
  dates: { depart: string; ret: string | null }[]
  datesTotal: number
  /** Sugestões já intercaladas: preços conhecidos primeiro, depois pares × datas espalhadas. */
  recommended: SkyCombo[]
  /** Melhor tarifa já vista por combinação ("O|D|ida|volta-ou-'-'"), em unidades mínimas de `currency`. */
  known: Record<string, number>
  /** Consultadas no Skyscanner nas últimas 12 h (mesma chave) → ISO de quando. */
  recent: Record<string, string>
  currency: string
  busy: { monitorId: number; runId: number } | null
  /** Combinações acompanhadas ainda futuras (para pesquisar de novo de uma vez). */
  tracked: SkyPick[]
  maxPerRun: number
  perSession: number
}

/** Uma combinação acompanhada: preço por dia de observação (todas as fontes, sem excluídas). */
export interface TrackedCombo extends SkyPick {
  originLabel: string
  destinationLabel: string
  url: string
  addedAt: string
  /** Menor preço observado em cada dia (dia da leitura, não do voo). */
  points: HistoryPoint[]
  latest: Money | null
  latestDay: string | null
  /** Menor preço do dia de leitura anterior ao último. */
  previous: Money | null
  best: Money | null
  /** Última vez que o Skyscanner pesquisou esta combinação. */
  lastCheckedAt: string | null
  /** Ofertas disponíveis (não excluídas) desta combinação. */
  offers: number
  /** Datas já passaram. */
  past: boolean
}

export interface TrackedView {
  currency: string
  /** Últimos dias com leitura (colunas da comparação). */
  days: string[]
  combos: TrackedCombo[]
}

export const skyKey = (p: SkyPick): string => `${p.origin}|${p.destination}|${p.depart}|${p.ret ?? '-'}`

// ── IA ───────────────────────────────────────────────────────────────────────

export interface AiDraft {
  name: string
  config: MonitorConfig
  explanations: string[]
  warnings: string[]
  questions: string[]
  cached: boolean
}

export interface ImportPreview {
  offers: NormalizedOffer[]
  errors: string[]
}

// ── Regiões geográficas (curadas; países ISO2) ───────────────────────────────

export const REGIONS: { id: string; label: string; countries: string[] }[] = [
  { id: 'southeast_asia', label: 'Sudeste Asiático', countries: ['VN', 'TH', 'MY', 'SG', 'LA', 'KH', 'ID', 'PH', 'MM', 'BN', 'TL'] },
  { id: 'east_asia', label: 'Leste Asiático', countries: ['JP', 'KR', 'CN', 'TW', 'HK', 'MO', 'MN'] },
  { id: 'south_asia', label: 'Sul da Ásia', countries: ['IN', 'LK', 'NP', 'BD', 'PK', 'MV', 'BT'] },
  { id: 'middle_east', label: 'Oriente Médio', countries: ['AE', 'QA', 'SA', 'OM', 'BH', 'KW', 'JO', 'IL', 'TR', 'LB'] },
  { id: 'western_europe', label: 'Europa Ocidental', countries: ['PT', 'ES', 'FR', 'IT', 'DE', 'NL', 'BE', 'LU', 'CH', 'AT', 'GB', 'IE'] },
  { id: 'europe', label: 'Europa', countries: ['PT', 'ES', 'FR', 'IT', 'DE', 'NL', 'BE', 'LU', 'CH', 'AT', 'GB', 'IE', 'DK', 'NO', 'SE', 'FI', 'IS', 'PL', 'CZ', 'SK', 'HU', 'RO', 'BG', 'GR', 'HR', 'SI', 'RS', 'EE', 'LV', 'LT', 'MT', 'CY'] },
  { id: 'south_america', label: 'América do Sul', countries: ['BR', 'AR', 'CL', 'UY', 'PY', 'BO', 'PE', 'EC', 'CO', 'VE', 'GY', 'SR'] },
  { id: 'north_america', label: 'América do Norte', countries: ['US', 'CA', 'MX'] },
  { id: 'central_america_caribbean', label: 'América Central e Caribe', countries: ['PA', 'CR', 'GT', 'SV', 'HN', 'NI', 'BZ', 'CU', 'DO', 'PR', 'JM', 'BS', 'AW', 'CW', 'TT', 'BB'] },
  { id: 'oceania', label: 'Oceania', countries: ['AU', 'NZ', 'FJ', 'PF', 'NC'] },
  { id: 'north_africa', label: 'Norte da África', countries: ['MA', 'DZ', 'TN', 'EG'] },
  { id: 'sub_saharan_africa', label: 'África Subsaariana', countries: ['ZA', 'KE', 'ET', 'NG', 'GH', 'SN', 'TZ', 'MZ', 'AO', 'CV', 'MU'] },
  { id: 'br_northeast', label: 'Nordeste do Brasil', countries: [] }
]

/** Estados que compõem regiões sub-nacionais (ex.: Nordeste). */
export const REGION_STATES: Record<string, string[]> = {
  br_northeast: ['BR-BA', 'BR-SE', 'BR-AL', 'BR-PE', 'BR-PB', 'BR-RN', 'BR-CE', 'BR-PI', 'BR-MA']
}

export const CABIN_LABEL: Record<Cabin, string> = {
  economy: 'Econômica',
  premium_economy: 'Premium economy',
  business: 'Executiva',
  first: 'Primeira'
}

export const STRATEGY_LABEL: Record<SortStrategy, string> = {
  value: 'Melhor custo-benefício',
  price: 'Menor tarifa aérea',
  total_cost: 'Menor custo total',
  duration: 'Menor duração de voo',
  door_to_door: 'Menor tempo porta a porta',
  stops: 'Menos conexões'
}

export const VERIFICATION_LABEL: Record<Verification, string> = {
  live: 'Preço ao vivo',
  cached: 'Cache do provedor',
  imported: 'Importado',
  assisted: 'Busca assistida'
}

export const DEFAULT_WEIGHTS: ScoreWeights = { price: 5, duration: 3, stops: 2, connections: 2, schedule: 1, carriers: 1 }

export function defaultMonitorConfig(): MonitorConfig {
  return {
    version: 1,
    origins: { include: [], exclude: [] },
    destinations: { include: [], exclude: [] },
    dates: { tripType: 'oneway', windows: [], returnWindows: [], minStayDays: null, maxStayDays: null },
    passengers: { adults: 1, children: 0, infants: 0, cabin: 'economy' },
    baggage: { carryOn: 'any', checked: 'any', checkedCount: 1, refundable: 'any' },
    constraints: {
      maxStops: null,
      maxTotalDurationHours: null,
      forbiddenConnectionCountries: [],
      forbiddenConnectionAirports: [],
      forbiddenCarriers: [],
      forbidSelfTransfer: false,
      forbidAirportChange: false,
      forbidOvernightConnections: false,
      minConnectionMinutes: null,
      maxConnectionMinutes: null,
      maxPrice: null
    },
    preferences: {
      strategy: 'value',
      weights: { ...DEFAULT_WEIGHTS },
      preferredCarriers: [],
      arrivalWindow: null,
      preferNightFlights: false,
      connectionStyle: 'comfortable',
      stopoverMaxHours: null,
      avoidAirportChange: true,
      avoidSeparateTickets: true
    },
    ground: [],
    currency: 'BRL',
    providers: [],
    budget: { maxQueriesPerRun: 40, maxQueriesPerDay: 150, maxAiCallsPerRun: 2, maxTokensPerRun: null, maxRunMinutes: 10 },
    schedule: { mode: 'manual', everyHours: 12, hour: 8 },
    alerts: { priceBelow: null, dropPercent: 10, newLow: true, interesting: false, favoriteChanges: true, promoPosts: true },
    displayTarget: 0,
    notes: ''
  }
}

/** Formata centavos numa moeda (pt-BR). */
export function formatMoney(m: Money | null | undefined): string {
  if (!m) return '—'
  const digits = minorDigits(m.currency)
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: m.currency, maximumFractionDigits: digits, minimumFractionDigits: digits }).format(
      m.amountMinor / 10 ** digits
    )
  } catch {
    return `${(m.amountMinor / 10 ** digits).toFixed(digits)} ${m.currency}`
  }
}

/** Casas decimais da moeda (JPY/KRW/VND = 0). */
export function minorDigits(currency: string): number {
  return ['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'IDR', 'PYG', 'UGX', 'XOF', 'XAF'].includes(currency.toUpperCase()) ? 0 : 2
}

export function toMinor(major: number, currency: string): number {
  return Math.round(major * 10 ** minorDigits(currency))
}

export function fromMinor(minor: number, currency: string): number {
  return minor / 10 ** minorDigits(currency)
}

export function fmtMinutes(min: number | null | undefined): string {
  if (min == null) return '—'
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h ? `${h}h${m ? String(m).padStart(2, '0') : ''}` : `${m}min`
}
