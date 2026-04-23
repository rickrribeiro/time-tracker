import React, { useEffect, useState } from 'react'
import { DailyStats, TagStats } from '../../types'
import { localDateStr, localDayStartISO, localDayEndISO } from '../../utils/dates'

type Period = 'day' | 'week' | 'month'

function getRange(period: Period): { start: string; end: string; label: string } {
  const now = new Date()
  const today = localDateStr(now)

  if (period === 'day') {
    return { start: localDayStartISO(today), end: localDayEndISO(today), label: 'Today' }
  }

  if (period === 'week') {
    const day = now.getDay()
    const monday = new Date(now)
    monday.setDate(now.getDate() - day + (day === 0 ? -6 : 1))
    monday.setHours(0, 0, 0, 0)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 7)
    sunday.setHours(23, 59, 59, 999)
    return { start: monday.toISOString(), end: sunday.toISOString(), label: 'This Week' }
  }

  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  last.setMilliseconds(last.getMilliseconds() - 1)
  return { start: first.toISOString(), end: last.toISOString(), label: 'This Month' }
}

function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}h ${m}m`
}

function formatHoursShort(minutes: number): string {
  return (minutes / 60).toFixed(1)
}

export function Dashboard(): React.ReactElement {
  const [period, setPeriod] = useState<Period>('week')
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([])
  const [tagStats, setTagStats] = useState<TagStats[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const { start, end } = getRange(period)
    setLoading(true)
    Promise.all([
      window.api.stats.daily(start, end),
      window.api.stats.byTag(start, end)
    ]).then(([daily, tags]) => {
      setDailyStats(daily)
      setTagStats(tags)
      setLoading(false)
    })
  }, [period])

  const totalMinutes = dailyStats.reduce((a, b) => a + b.totalMinutes, 0)
  const productiveMinutes = dailyStats.reduce((a, b) => a + b.productiveMinutes, 0)
  const productiveErosMinutes = dailyStats.reduce((a, b) => a + (b.productiveErosMinutes || 0), 0)
  const semiProductiveMinutes = dailyStats.reduce((a, b) => a + (b.semiProductiveMinutes || 0), 0)
  const prodPlusSemiMinutes = productiveMinutes + semiProductiveMinutes + productiveErosMinutes
  const productivePercent =
    totalMinutes > 0 ? Math.round((productiveMinutes / totalMinutes) * 100) : 0
  const prodPlusSemiPercent =
    totalMinutes > 0 ? Math.round((prodPlusSemiMinutes / totalMinutes) * 100) : 0

  const maxDayMinutes = Math.max(...dailyStats.map((d) => d.totalMinutes), 1)
  const maxTagMinutes = Math.max(...tagStats.map((t) => t.totalMinutes), 1)

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <h2 className="dashboard-title">Statistics</h2>
        <div className="period-selector">
          {(['day', 'week', 'month'] as Period[]).map((p) => (
            <button
              key={p}
              className={`period-btn ${period === p ? 'active' : ''}`}
              onClick={() => setPeriod(p)}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
          Loading...
        </div>
      ) : (
        <>
          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <div className="stat-card">
              <div className="stat-card-label">Total Tracked</div>
              <div className="stat-card-value">{formatHoursShort(totalMinutes)}<span style={{ fontSize: 18, color: 'var(--text-muted)' }}>h</span></div>
              <div className="stat-card-sub">{formatHours(totalMinutes)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Productive</div>
              <div className="stat-card-value">{formatHoursShort(productiveMinutes)}<span style={{ fontSize: 18, color: 'var(--text-muted)' }}>h</span></div>
              <div className="stat-card-sub">{productivePercent}% of tracked time</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Prod + Semi</div>
              <div className="stat-card-value">{formatHoursShort(prodPlusSemiMinutes)}<span style={{ fontSize: 18, color: 'var(--text-muted)' }}>h</span></div>
              <div className="stat-card-sub">{prodPlusSemiPercent}% of tracked time</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Active Days</div>
              <div className="stat-card-value">{dailyStats.filter((d) => d.totalMinutes > 0).length}</div>
              <div className="stat-card-sub">{dailyStats.length} days in period</div>
            </div>
          </div>

          {dailyStats.length > 0 && (
            <div className="chart-section">
              <div className="chart-title">Daily Breakdown</div>
              <div style={{ position: 'relative' }}>
                <div className="bar-chart">
                  {dailyStats.map((d) => {
                    const heightPct = (d.totalMinutes / maxDayMinutes) * 100
                    const prodPct = d.totalMinutes > 0
                      ? (d.productiveMinutes / d.totalMinutes) * 100
                      : 0
                    const erosPct = d.totalMinutes > 0
                      ? ((d.productiveErosMinutes || 0) / d.totalMinutes) * 100
                      : 0
                    const semiPct = d.totalMinutes > 0
                      ? ((d.semiProductiveMinutes || 0) / d.totalMinutes) * 100
                      : 0
                    const dateLabel = d.date.slice(5) // MM-DD
                    return (
                      <div
                        key={d.date}
                        className="bar-chart-bar"
                        style={{ height: `${Math.max(2, heightPct)}%`, background: '#6366f1', position: 'relative' }}
                        title={`${d.date}: ${formatHours(d.totalMinutes)} (${Math.round(prodPct)}% prod, ${Math.round(erosPct)}% eros, ${Math.round(semiPct)}% semi)`}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            height: `${prodPct}%`,
                            background: '#22c55e',
                            borderRadius: 'inherit',
                            zIndex: 3
                          }}
                        />
                        <div
                          style={{
                            position: 'absolute',
                            bottom: `${prodPct}%`,
                            left: 0,
                            right: 0,
                            height: `${erosPct}%`,
                            background: '#fb7185',
                            zIndex: 2
                          }}
                        />
                        <div
                          style={{
                            position: 'absolute',
                            bottom: `${prodPct + erosPct}%`,
                            left: 0,
                            right: 0,
                            height: `${semiPct}%`,
                            background: '#a855f7',
                            zIndex: 1
                          }}
                        />
                        <div className="bar-chart-label">{dateLabel}</div>
                      </div>
                    )
                  })}
                </div>
                <div style={{ marginTop: 28, display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-muted)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: '#6366f1', display: 'inline-block' }} />
                    Total
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: '#22c55e', display: 'inline-block' }} />
                    Productive
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: '#fb7185', display: 'inline-block' }} />
                    ProductiveEros
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: '#a855f7', display: 'inline-block' }} />
                    Semi-productive
                  </span>
                </div>
              </div>
            </div>
          )}

          {tagStats.length > 0 && (
            <div className="chart-section">
              <div className="chart-title">By Tag</div>
              <div className="tag-stats-list">
                {tagStats.map((ts) => (
                  <div key={ts.tagId ?? 'null'} className="tag-stat-row">
                    <div
                      className="tag-stat-color"
                      style={{ background: ts.tagColor || '#6b7280' }}
                    />
                    <span className="tag-stat-name">{ts.tagName || 'No tag'}</span>
                    <div className="tag-stat-bar-wrap">
                      <div
                        className="tag-stat-bar"
                        style={{
                          width: `${(ts.totalMinutes / maxTagMinutes) * 100}%`,
                          background: ts.tagColor || '#6b7280'
                        }}
                      />
                    </div>
                    <span className="tag-stat-hours">{formatHoursShort(ts.totalMinutes)}h</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tagStats.length === 0 && dailyStats.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 60 }}>
              No data for this period. Start tracking tasks!
            </div>
          )}
        </>
      )}
    </div>
  )
}
