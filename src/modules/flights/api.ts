import type {
  AiDraft,
  AirportInfo,
  AlertEvent,
  CalendarDay,
  GroundEstimate,
  HistoryView,
  ImportPreview,
  LocationRef,
  MonitorConfig,
  MonitorStatus,
  MonitorSummary,
  NearbyAirport,
  OfferPage,
  OfferQuery,
  PlaceSuggestion,
  PlanView,
  PromoFeedView,
  ProviderStatus,
  RunInfo,
  SkyCombo,
  SkyPick,
  SkyPreview,
  TrackedView
} from '../../../shared/flights'


export interface MonitorInput {
  name: string
  status?: MonitorStatus
  tripId?: number | null
  config: MonitorConfig
}

export interface ValidationResult {
  config: MonitorConfig
  errors: string[]
  warnings: string[]
  origins: string[]
  destinations: string[]
  pairs: number
  dates: number
  universe: number
  discoveryQueries: number
  providers: string[]
}

/** `window.api.flightMon` — canais `flightMon:*` de server/flights/rpc.ts. */
export interface FlightMonApi {
  list: () => Promise<MonitorSummary[]>
  get: (id: number) => Promise<MonitorSummary>
  validate: (config: MonitorConfig) => Promise<ValidationResult>
  create: (input: MonitorInput) => Promise<{ id: number; status: MonitorStatus; errors: string[] }>
  update: (id: number, input: MonitorInput) => Promise<{ id: number; status: MonitorStatus; errors: string[] }>
  setStatus: (id: number, status: MonitorStatus) => Promise<void>
  duplicate: (id: number) => Promise<number>
  delete: (id: number) => Promise<void>
  run: (id: number, opts?: { more?: number }) => Promise<RunInfo>
  cancel: (runId: number) => Promise<boolean>
  retryFailed: (id: number) => Promise<number>
  offers: (id: number, q: OfferQuery) => Promise<OfferPage>
  favorite: (offerId: number, fav: boolean) => Promise<void>
  calendar: (id: number) => Promise<CalendarDay[]>
  history: (id: number, days?: number) => Promise<HistoryView>
  plan: (id: number) => Promise<PlanView>
  alerts: (id: number) => Promise<AlertEvent[]>
  checkAlerts: (id: number) => Promise<number>
  places: (q: string) => Promise<PlaceSuggestion[]>
  airport: (iata: string) => Promise<AirportInfo | null>
  nearby: (ref: LocationRef, radiusKm: number, withGround: boolean) => Promise<{ center: { lat: number; lon: number; label: string } | null; airports: NearbyAirport[] }>
  ground: (iata: string, to: LocationRef) => Promise<GroundEstimate | null>
  aiDraft: (text: string, currency?: string) => Promise<AiDraft>
  insights: (id: number) => Promise<{ text: string; cached: boolean }>
  skyscanner: (id: number, picks: SkyPick[]) => Promise<{ runId: number; combos: SkyCombo[] }>
  skyscannerPreview: (id: number) => Promise<SkyPreview>
  tracked: (id: number, days?: number) => Promise<TrackedView>
  track: (id: number, picks: SkyPick[]) => Promise<number>
  untrack: (id: number, pick: SkyPick) => Promise<void>
  promos: (id: number, force?: boolean) => Promise<PromoFeedView>
  importPreview: (id: number, text: string, mode: 'structured' | 'ai', source?: string, observedAt?: string, assisted?: boolean) => Promise<ImportPreview>
  importCommit: (id: number, text: string, mode: 'structured' | 'ai', source?: string, observedAt?: string, assisted?: boolean) => Promise<{ imported: number; created: number; errors: string[] }>
  providers: () => Promise<ProviderStatus[]>
  testProvider: (id: string) => Promise<string>
  onChanged: (cb: (p: { monitorId: number | null; runId: number | null }) => void) => () => void
}
