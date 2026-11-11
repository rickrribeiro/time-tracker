import type { Database } from 'sql.js'
import type {
  AlertEvent,
  FlightMonitor,
  MonitorConfig,
  MonitorStatus,
  NormalizedOffer,
  RunInfo,
  TaskStage,
  TaskStatus
} from '../../shared/flights'
import { getDb, saveDb } from '../database/db'
import { VERIFICATION_RANK } from './evaluate'
import type { TaskLite, TaskSpec } from './planner'
import { normalizeConfig } from './validate'

/**
 * Acesso ao banco do monitoramento de passagens. Diferente dos helpers de queries.ts
 * (que exportam o arquivo a cada instrução), aqui as escritas em lote rodam numa
 * transação e o arquivo é salvo UMA vez — uma busca pode gravar centenas de ofertas.
 */
type P = (string | number | null)[]

function all<T>(db: Database, sql: string, params: P = []): T[] {
  const st = db.prepare(sql)
  if (params.length) st.bind(params)
  const out: T[] = []
  while (st.step()) out.push(st.getAsObject() as T)
  st.free()
  return out
}
function one<T>(db: Database, sql: string, params: P = []): T | null {
  return all<T>(db, sql, params)[0] ?? null
}
function exec(db: Database, sql: string, params: P = []): number {
  const st = db.prepare(sql)
  st.run(params)
  st.free()
  return db.getRowsModified()
}
function lastId(db: Database): number {
  return Number(one<{ id: number }>(db, 'SELECT last_insert_rowid() AS id')?.id ?? 0)
}

/** Executa `fn` numa transação e salva o arquivo uma vez no fim. */
export async function tx<T>(fn: (db: Database) => T): Promise<T> {
  const db = await getDb()
  db.run('BEGIN')
  try {
    const r = fn(db)
    db.run('COMMIT')
    saveDb()
    return r
  } catch (e) {
    try {
      db.run('ROLLBACK')
    } catch {
      // nada a desfazer
    }
    throw e
  }
}
export async function read<T>(fn: (db: Database) => T): Promise<T> {
  return fn(await getDb())
}

const nowIso = (): string => new Date().toISOString()

// ── Monitores ─────────────────────────────────────────────────────────────────

interface MonitorRow {
  id: number
  name: string
  status: MonitorStatus
  tripId: number | null
  config: string
  createdAt: string
  updatedAt: string
  lastRunAt: string | null
  lastSuccessAt: string | null
  nextRunAt: string | null
  lastError: string | null
  extraDisplay: number
  legacy: string | null
}

function toMonitor(r: MonitorRow): FlightMonitor {
  let raw: unknown = {}
  try {
    raw = JSON.parse(r.config)
  } catch {
    raw = {}
  }
  let legacy: FlightMonitor['legacy'] = null
  try {
    legacy = r.legacy ? JSON.parse(r.legacy) : null
  } catch {
    legacy = null
  }
  return { ...r, config: normalizeConfig(raw), extraDisplay: r.extraDisplay ?? 0, legacy }
}

export async function listMonitors(): Promise<FlightMonitor[]> {
  return read((db) => all<MonitorRow>(db, 'SELECT * FROM flight_monitors ORDER BY status = \'paused\', updatedAt DESC').map(toMonitor))
}

export async function getMonitor(id: number): Promise<FlightMonitor | null> {
  return read((db) => {
    const r = one<MonitorRow>(db, 'SELECT * FROM flight_monitors WHERE id = ?', [id])
    return r ? toMonitor(r) : null
  })
}

export async function createMonitor(name: string, status: MonitorStatus, config: MonitorConfig, tripId: number | null): Promise<number> {
  return tx((db) => {
    const t = nowIso()
    exec(db, 'INSERT INTO flight_monitors (name, status, tripId, config, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)', [
      name,
      status,
      tripId,
      JSON.stringify(config),
      t,
      t
    ])
    return lastId(db)
  })
}

/** Salva config; descarta tarefas pendentes (o plano é refeito) e preserva o histórico. */
export async function updateMonitor(id: number, patch: { name?: string; status?: MonitorStatus; config?: MonitorConfig; tripId?: number | null }): Promise<void> {
  await tx((db) => {
    const cur = one<MonitorRow>(db, 'SELECT * FROM flight_monitors WHERE id = ?', [id])
    if (!cur) throw new Error('Monitoramento não encontrado.')
    exec(db, 'UPDATE flight_monitors SET name = ?, status = ?, tripId = ?, config = ?, updatedAt = ? WHERE id = ?', [
      patch.name ?? cur.name,
      patch.status ?? cur.status,
      patch.tripId !== undefined ? patch.tripId : cur.tripId,
      patch.config ? JSON.stringify(patch.config) : cur.config,
      nowIso(),
      id
    ])
    if (patch.config) exec(db, "DELETE FROM flight_search_tasks WHERE monitorId = ? AND status IN ('pending', 'failed')", [id])
  })
}

export async function setMonitorMeta(id: number, meta: Partial<Pick<FlightMonitor, 'lastRunAt' | 'lastSuccessAt' | 'nextRunAt' | 'lastError' | 'extraDisplay'>>): Promise<void> {
  const keys = Object.keys(meta) as (keyof typeof meta)[]
  if (!keys.length) return
  await tx((db) => {
    exec(db, `UPDATE flight_monitors SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => (meta[k] ?? null) as string | number | null), id])
  })
}

export async function deleteMonitor(id: number): Promise<void> {
  await tx((db) => {
    // sql.js nem sempre tem foreign_keys ativo numa conexão reaberta: apaga explicitamente
    exec(db, 'DELETE FROM flight_price_observations WHERE monitorId = ?', [id])
    for (const t of ['flight_offers', 'flight_search_tasks', 'flight_runs', 'flight_alert_events']) exec(db, `DELETE FROM ${t} WHERE monitorId = ?`, [id])
    exec(db, 'DELETE FROM flight_monitors WHERE id = ?', [id])
  })
}

/**
 * Migra os registros antigos de `flight_watches` (texto livre + um preço) para monitores
 * em "aguardando configuração". Idempotente (legacyWatchId UNIQUE). Não apaga a tabela antiga.
 */
export async function migrateLegacyWatches(resolve: (text: string | null) => { kind: 'airport' | 'city'; code: string; label: string } | null, base: () => MonitorConfig): Promise<number> {
  return tx((db) => {
    let n = 0
    let rows: { id: number; tripId: number | null; origin: string | null; destination: string | null; price: number | null; currency: string; lastChecked: string | null }[] = []
    try {
      rows = all(db, 'SELECT * FROM flight_watches WHERE id NOT IN (SELECT legacyWatchId FROM flight_monitors WHERE legacyWatchId IS NOT NULL)')
    } catch {
      return 0 // tabela antiga não existe
    }
    for (const w of rows) {
      const cfg = base()
      const o = resolve(w.origin)
      const d = resolve(w.destination)
      if (o) cfg.origins.include.push(o)
      if (d) cfg.destinations.include.push(d)
      cfg.currency = (w.currency || 'BRL').toUpperCase()
      cfg.notes = 'Migrado do monitoramento antigo: defina datas e revise origens/destinos.'
      const t = nowIso()
      exec(
        db,
        'INSERT INTO flight_monitors (name, status, tripId, config, createdAt, updatedAt, legacyWatchId, legacy) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          `${w.origin ?? '?'} → ${w.destination ?? '?'}`,
          'draft',
          w.tripId,
          JSON.stringify(cfg),
          t,
          t,
          w.id,
          JSON.stringify({ origin: w.origin, destination: w.destination, price: w.price, currency: w.currency, checkedAt: w.lastChecked })
        ]
      )
      n++
    }
    return n
  })
}

// ── Execuções ─────────────────────────────────────────────────────────────────

export async function createRun(monitorId: number, trigger: RunInfo['trigger']): Promise<number> {
  return tx((db) => {
    exec(db, "INSERT INTO flight_runs (monitorId, trigger, status, startedAt) VALUES (?, ?, 'running', ?)", [monitorId, trigger, nowIso()])
    return lastId(db)
  })
}

export async function updateRun(id: number, patch: Partial<Omit<RunInfo, 'id' | 'monitorId' | 'trigger' | 'startedAt'>>): Promise<void> {
  const keys = Object.keys(patch) as (keyof typeof patch)[]
  if (!keys.length) return
  await tx((db) => exec(db, `UPDATE flight_runs SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => (patch[k] ?? null) as string | number | null), id]))
}

export async function getRun(id: number): Promise<RunInfo | null> {
  return read((db) => one<RunInfo>(db, 'SELECT * FROM flight_runs WHERE id = ?', [id]))
}

export async function activeRun(monitorId: number): Promise<RunInfo | null> {
  return read((db) => one<RunInfo>(db, "SELECT * FROM flight_runs WHERE monitorId = ? AND status = 'running' ORDER BY id DESC LIMIT 1", [monitorId]))
}

export async function listRuns(monitorId: number, limit = 15): Promise<RunInfo[]> {
  return read((db) => all<RunInfo>(db, 'SELECT * FROM flight_runs WHERE monitorId = ? ORDER BY id DESC LIMIT ?', [monitorId, limit]))
}

/** Boot: execuções/tarefas que estavam rodando quando o servidor caiu voltam a ser retomáveis. */
export async function recoverInterrupted(): Promise<number> {
  return tx((db) => {
    exec(db, "UPDATE flight_search_tasks SET status = 'pending' WHERE status = 'running'")
    return exec(db, "UPDATE flight_runs SET status = 'interrupted', finishedAt = ?, message = 'Servidor reiniciado durante a busca; continue quando quiser.' WHERE status = 'running'", [nowIso()])
  })
}

// ── Tarefas (plano) ───────────────────────────────────────────────────────────

export interface TaskRow extends TaskLite {
  id: number
  monitorId: number
  stage: TaskStage
  priority: number
  attempts: number
  nextAttemptAt: string | null
  lastError: string | null
  resultCount: number
  currency: string | null
  runId: number | null
}

export async function insertTasks(monitorId: number, specs: TaskSpec[]): Promise<number> {
  if (!specs.length) return 0
  return tx((db) => {
    let n = 0
    const t = nowIso()
    for (const s of specs) {
      n += exec(
        db,
        'INSERT OR IGNORE INTO flight_search_tasks (monitorId, key, provider, stage, origin, destination, departDate, returnDate, priority, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [monitorId, s.key, s.provider, s.stage, s.origin, s.destination, s.departDate, s.returnDate, s.priority, t]
      )
    }
    return n
  })
}

export async function listTasks(monitorId: number): Promise<TaskRow[]> {
  return read((db) => all<TaskRow>(db, 'SELECT * FROM flight_search_tasks WHERE monitorId = ? ORDER BY priority DESC, id', [monitorId]))
}

/** Próximas tarefas executáveis (pendentes, fora de backoff), maior prioridade primeiro. */
export async function nextTasks(monitorId: number, providers: string[], limit: number): Promise<TaskRow[]> {
  if (!providers.length) return []
  return read((db) =>
    all<TaskRow>(
      db,
      `SELECT * FROM flight_search_tasks WHERE monitorId = ? AND status = 'pending' AND provider IN (${providers.map(() => '?').join(',')})
       AND (nextAttemptAt IS NULL OR nextAttemptAt <= ?) ORDER BY priority DESC, id LIMIT ?`,
      [monitorId, ...providers, nowIso(), limit]
    )
  )
}

/** Marca como 'running' só se ainda estiver 'pending' (claim atômico → sem execução dupla). */
export async function claimTask(id: number, runId: number): Promise<boolean> {
  return tx((db) => exec(db, "UPDATE flight_search_tasks SET status = 'running', runId = ? WHERE id = ? AND status = 'pending'", [runId, id]) === 1)
}

export async function finishTask(id: number, r: { status: TaskStatus; resultCount?: number; minPriceMinor?: number | null; currency?: string | null; error?: string | null; retryAt?: string | null }): Promise<void> {
  await tx((db) =>
    exec(
      db,
      `UPDATE flight_search_tasks SET status = ?, resultCount = COALESCE(?, resultCount), minPriceMinor = ?, currency = COALESCE(?, currency),
       lastError = ?, nextAttemptAt = ?, attempts = attempts + 1, finishedAt = ? WHERE id = ?`,
      [r.status, r.resultCount ?? null, r.minPriceMinor ?? null, r.currency ?? null, r.error ?? null, r.retryAt ?? null, nowIso(), id]
    )
  )
}

/** Volta uma tarefa para a fila (reexecução explícita). */
export async function resetTask(id: number): Promise<void> {
  await tx((db) => exec(db, "UPDATE flight_search_tasks SET status = 'pending', attempts = 0, nextAttemptAt = NULL, lastError = NULL WHERE id = ? AND status != 'running'", [id]))
}

/** Recoloca na fila tarefas concluídas antigas (monitoramento recorrente). */
export async function requeueStale(monitorId: number, olderThanIso: string, limit: number): Promise<number> {
  return tx((db) =>
    exec(
      db,
      `UPDATE flight_search_tasks SET status = 'pending', attempts = 0, nextAttemptAt = NULL WHERE id IN (
         SELECT id FROM flight_search_tasks WHERE monitorId = ? AND status = 'done' AND finishedAt < ? ORDER BY priority DESC LIMIT ?)`,
      [monitorId, olderThanIso, limit]
    )
  )
}

/** "Tentar de novo": falhas voltam para a fila. */
export async function retryFailed(monitorId: number): Promise<number> {
  return tx((db) => exec(db, "UPDATE flight_search_tasks SET status = 'pending', attempts = 0, nextAttemptAt = NULL WHERE monitorId = ? AND status = 'failed'", [monitorId]))
}

// ── Ofertas / histórico ───────────────────────────────────────────────────────

export interface OfferRow {
  id: number
  monitorId: number
  fingerprint: string
  provider: string
  origin: string
  destination: string
  departDate: string
  returnDate: string | null
  priceMinor: number
  currency: string
  prevPriceMinor: number | null
  prevCurrency: string | null
  verification: string
  data: string
  sources: string
  firstSeenAt: string
  lastSeenAt: string
  available: number
  favorite: number
}

export interface UpsertResult {
  id: number
  isNew: boolean
  priceChanged: boolean
  prevMinor: number | null
}

/**
 * Grava/mescla ofertas. Mesmo itinerário (fingerprint) de outra fonte: os dados de maior
 * confiança vencem (ao vivo > assistido > importado > cache), salvo se os dados atuais
 * forem velhos (> 24h). Toda observação vai para o histórico.
 */
export async function upsertOffers(monitorId: number, items: { offer: NormalizedOffer; fp: string }[], paxKey: string, runId: number | null): Promise<UpsertResult[]> {
  if (!items.length) return []
  return tx((db) => {
    const out: UpsertResult[] = []
    for (const { offer, fp } of items) {
      const s0 = offer.slices[0]
      const s1 = offer.slices[1]
      const cur = one<OfferRow>(db, 'SELECT * FROM flight_offers WHERE monitorId = ? AND fingerprint = ?', [monitorId, fp])
      let id: number
      let isNew = false
      let priceChanged = false
      let prevMinor: number | null = null
      if (!cur) {
        exec(
          db,
          `INSERT INTO flight_offers (monitorId, fingerprint, provider, origin, destination, departDate, returnDate, priceMinor, currency, verification, data, sources, firstSeenAt, lastSeenAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [monitorId, fp, offer.provider, s0.from, s0.to, s0.departLocal.slice(0, 10), s1 ? s1.departLocal.slice(0, 10) : null, offer.price.amountMinor, offer.price.currency, offer.verification, JSON.stringify(offer), JSON.stringify([offer.provider]), offer.observedAt, offer.observedAt]
        )
        id = lastId(db)
        isNew = true
      } else {
        id = cur.id
        const curRank = VERIFICATION_RANK[cur.verification] ?? 0
        const newRank = VERIFICATION_RANK[offer.verification] ?? 0
        const curOld = Date.parse(offer.observedAt) - Date.parse(cur.lastSeenAt) > 24 * 3600_000
        // mesma leitura viu o mesmo voo duas vezes (ex.: "mais barato" e "melhor"): fica o menor preço
        const sameReading = cur.lastSeenAt === offer.observedAt && cur.currency === offer.price.currency
        const replace = sameReading ? offer.price.amountMinor < cur.priceMinor : newRank >= curRank || curOld
        const sources = new Set<string>(JSON.parse(cur.sources || '[]'))
        sources.add(offer.provider)
        if (replace) {
          priceChanged = !sameReading && (cur.priceMinor !== offer.price.amountMinor || cur.currency !== offer.price.currency)
          prevMinor = sameReading ? cur.prevPriceMinor : cur.priceMinor
          exec(
            db,
            `UPDATE flight_offers SET provider = ?, priceMinor = ?, currency = ?, prevPriceMinor = ?, prevCurrency = ?, verification = ?, data = ?, sources = ?, lastSeenAt = ?, available = 1 WHERE id = ?`,
            [
              offer.provider,
              offer.price.amountMinor,
              offer.price.currency,
              priceChanged ? cur.priceMinor : cur.prevPriceMinor,
              priceChanged ? cur.currency : cur.prevCurrency,
              offer.verification,
              JSON.stringify(offer),
              JSON.stringify([...sources]),
              offer.observedAt,
              id
            ]
          )
        } else {
          exec(db, 'UPDATE flight_offers SET sources = ?, available = 1 WHERE id = ?', [JSON.stringify([...sources]), id])
        }
      }
      exec(
        db,
        `INSERT INTO flight_price_observations (offerId, monitorId, observedAt, priceMinor, currency, provider, verification, paxKey, runId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (offerId, provider, observedAt) DO UPDATE SET priceMinor = MIN(priceMinor, excluded.priceMinor)`,
        [id, monitorId, offer.observedAt, offer.price.amountMinor, offer.price.currency, offer.provider, offer.verification, paxKey, runId]
      )
      out.push({ id, isNew, priceChanged, prevMinor })
    }
    return out
  })
}

/** Ofertas ao vivo que a mesma consulta não devolveu mais → indisponíveis (histórico fica). */
export async function markMissing(monitorId: number, provider: string, origin: string, destination: string, departDate: string, seenBefore: string, keep: Set<string>): Promise<number[]> {
  return tx((db) => {
    const rows = all<{ id: number; fingerprint: string }>(
      db,
      'SELECT id, fingerprint FROM flight_offers WHERE monitorId = ? AND provider = ? AND origin = ? AND destination = ? AND departDate = ? AND available = 1 AND lastSeenAt < ?',
      [monitorId, provider, origin, destination, departDate, seenBefore]
    )
    const gone = rows.filter((r) => !keep.has(r.fingerprint)).map((r) => r.id)
    for (const id of gone) exec(db, 'UPDATE flight_offers SET available = 0 WHERE id = ?', [id])
    return gone
  })
}

export async function listOffers(monitorId: number): Promise<OfferRow[]> {
  return read((db) => all<OfferRow>(db, 'SELECT * FROM flight_offers WHERE monitorId = ?', [monitorId]))
}

export async function getOffer(id: number): Promise<OfferRow | null> {
  return read((db) => one<OfferRow>(db, 'SELECT * FROM flight_offers WHERE id = ?', [id]))
}

export async function setFavorite(id: number, fav: boolean): Promise<void> {
  await tx((db) => exec(db, 'UPDATE flight_offers SET favorite = ? WHERE id = ?', [fav ? 1 : 0, id]))
}

export interface ObservationRow {
  offerId: number
  observedAt: string
  priceMinor: number
  currency: string
  provider: string
  verification: string
  paxKey: string
}

export async function listObservations(monitorId: number, sinceIso: string): Promise<ObservationRow[]> {
  return read((db) => all<ObservationRow>(db, 'SELECT offerId, observedAt, priceMinor, currency, provider, verification, paxKey FROM flight_price_observations WHERE monitorId = ? AND observedAt >= ? ORDER BY observedAt', [monitorId, sinceIso]))
}

// ── Combinações acompanhadas ──────────────────────────────────────────────────

export interface TrackedRow {
  origin: string
  destination: string
  departDate: string
  returnDate: string
  createdAt: string
}

export async function listTracked(monitorId: number): Promise<TrackedRow[]> {
  return read((db) => all<TrackedRow>(db, 'SELECT origin, destination, departDate, returnDate, createdAt FROM flight_tracked_combos WHERE monitorId = ? ORDER BY id', [monitorId]))
}

export async function addTracked(monitorId: number, picks: { origin: string; destination: string; depart: string; ret: string | null }[]): Promise<number> {
  if (!picks.length) return 0
  return tx((db) => {
    let n = 0
    for (const p of picks)
      n += exec(db, 'INSERT OR IGNORE INTO flight_tracked_combos (monitorId, origin, destination, departDate, returnDate, createdAt) VALUES (?, ?, ?, ?, ?, ?)', [monitorId, p.origin, p.destination, p.depart, p.ret ?? '', nowIso()])
    return n
  })
}

export async function backfillTrackedFromSkyscanner(): Promise<number> {
  return tx((db) =>
    exec(
      db,
      `INSERT OR IGNORE INTO flight_tracked_combos (monitorId, origin, destination, departDate, returnDate, createdAt)
       SELECT monitorId, origin, destination, departDate, COALESCE(returnDate, ''), COALESCE(finishedAt, ?) FROM flight_search_tasks WHERE provider = 'skyscanner_chrome'`,
      [nowIso()]
    )
  )
}

export async function removeTracked(monitorId: number, p: { origin: string; destination: string; depart: string; ret: string | null }): Promise<void> {
  await tx((db) => exec(db, 'DELETE FROM flight_tracked_combos WHERE monitorId = ? AND origin = ? AND destination = ? AND departDate = ? AND returnDate = ?', [monitorId, p.origin, p.destination, p.depart, p.ret ?? '']))
}

// ── Alertas ───────────────────────────────────────────────────────────────────

/** Registra o alerta; devolve false se a mesma chave já disparou (deduplicação). */
export async function recordAlert(monitorId: number, offerId: number | null, kind: string, dedupeKey: string, message: string): Promise<boolean> {
  return tx((db) => exec(db, 'INSERT OR IGNORE INTO flight_alert_events (monitorId, offerId, kind, dedupeKey, message, createdAt) VALUES (?, ?, ?, ?, ?, ?)', [monitorId, offerId, kind, dedupeKey, message, nowIso()]) === 1)
}

export async function listAlerts(monitorId: number, limit = 50): Promise<AlertEvent[]> {
  return read((db) => all<AlertEvent>(db, 'SELECT id, monitorId, offerId, kind, message, createdAt FROM flight_alert_events WHERE monitorId = ? ORDER BY id DESC LIMIT ?', [monitorId, limit]))
}

// ── Cache / uso ───────────────────────────────────────────────────────────────

export async function cacheGet<T>(key: string): Promise<T | null> {
  return read((db) => {
    const r = one<{ value: string; expiresAt: string }>(db, 'SELECT value, expiresAt FROM flight_cache WHERE key = ?', [key])
    if (!r || r.expiresAt < nowIso()) return null
    try {
      return JSON.parse(r.value) as T
    } catch {
      return null
    }
  })
}

export async function cacheSet(key: string, value: unknown, ttlMs: number): Promise<void> {
  await tx((db) => {
    exec(db, 'INSERT OR REPLACE INTO flight_cache (key, value, expiresAt) VALUES (?, ?, ?)', [key, JSON.stringify(value), new Date(Date.now() + ttlMs).toISOString()])
    exec(db, 'DELETE FROM flight_cache WHERE expiresAt < ?', [nowIso()])
  })
}

export async function incUsage(provider: string, day: string): Promise<void> {
  await tx((db) => {
    exec(db, 'INSERT OR IGNORE INTO flight_provider_usage (provider, day, queries) VALUES (?, ?, 0)', [provider, day])
    exec(db, 'UPDATE flight_provider_usage SET queries = queries + 1 WHERE provider = ? AND day = ?', [provider, day])
  })
}

export async function usageOn(provider: string, day: string): Promise<number> {
  return read((db) => Number(one<{ q: number }>(db, 'SELECT queries AS q FROM flight_provider_usage WHERE provider = ? AND day = ?', [provider, day])?.q ?? 0))
}

/** Consultas feitas por um monitor hoje (orçamento diário do monitor). */
export async function monitorQueriesSince(monitorId: number, sinceIso: string): Promise<number> {
  return read((db) => Number(one<{ q: number }>(db, 'SELECT COALESCE(SUM(queries), 0) AS q FROM flight_runs WHERE monitorId = ? AND startedAt >= ?', [monitorId, sinceIso])?.q ?? 0))
}
