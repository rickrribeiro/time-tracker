import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useStayStore } from '../store/stayStore'
import { StayMap } from '../components/StayMap'
import {
  AccommodationType,
  ACCOMMODATION_LABELS,
  Amenity,
  AMENITY_LABELS,
  ProviderName,
  StayResult,
  StayWatch,
  StayPricePoint
} from '../types'
import { SortMode } from '../services/searchStays'
import { formatMoney } from '../../finance/util'
import { renderMarkdown } from '../../estudos/markdown'

const CURRENCIES = ['BRL', 'JPY', 'USD', 'EUR']
const SORTS: { key: SortMode; label: string }[] = [
  { key: 'best', label: 'Melhor custo-benefício' },
  { key: 'cheapest', label: 'Menor preço/noite' },
  { key: 'cheapestTotal', label: 'Menor preço total' },
  { key: 'rating', label: 'Melhor avaliação' },
  { key: 'closest', label: 'Mais próximo' }
]

function ChipsInput({ label, values, onChange, placeholder }: { label: string; values: string[]; onChange: (v: string[]) => void; placeholder: string }): React.ReactElement {
  const [draft, setDraft] = useState('')
  return (
    <div className="editor-field">
      <label>{label}</label>
      <div className="tag-input">
        {values.map((v) => (
          <span key={v} className="project-chip" style={{ cursor: 'pointer' }} onClick={() => onChange(values.filter((x) => x !== v))}>
            {v} ✕
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ',') && draft.trim()) {
              e.preventDefault()
              if (!values.includes(draft.trim())) onChange([...values, draft.trim()])
              setDraft('')
            }
          }}
          placeholder={placeholder}
          style={{ flex: 1, minWidth: 100, border: 'none', background: 'transparent', padding: 4 }}
        />
      </div>
    </div>
  )
}

function ResultCard({ r, isFav, onFav, onDetail }: { r: StayResult; isFav: boolean; onFav: () => void; onDetail: () => void }): React.ReactElement {
  return (
    <div className="stay-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{r.title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {ACCOMMODATION_LABELS[r.roomType]} · {r.neighborhood ?? '—'} {r.distanceKm != null && `· ${r.distanceKm.toFixed(1)}km`}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <span className="stay-score" title="Pontuação">{r.score}</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6, fontSize: 12 }}>
        <span className="project-chip">{r.provider}</span>
        {r.rating != null && <span className="project-chip">⭐ {r.rating} ({r.reviewCount ?? 0})</span>}
        {r.cancellationFree && <span className="project-chip">cancelamento grátis</span>}
        {(r.alsoOn ?? []).map((p) => <span key={p} className="project-chip">também em {p}</span>)}
        {r.badges?.map((b) => <span key={b} className="project-chip">🏅 {b}</span>)}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <div>
          <strong>{formatMoney(r.pricePerNight, r.currency)}</strong>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}> /noite · total {formatMoney(r.totalPrice, r.currency)}</span>
          {r.bestDates && <div style={{ fontSize: 11, color: 'var(--success)' }}>melhor: {r.bestDates.checkIn} → {r.bestDates.checkOut}</div>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-secondary btn-sm" onClick={onDetail}>Detalhes</button>
          <button className="btn btn-secondary btn-sm" onClick={() => window.api.app.openExternal(r.listingUrl)}>Abrir</button>
          <button className={`btn btn-sm ${isFav ? 'btn-primary' : 'btn-secondary'}`} onClick={onFav} title="Favoritar">{isFav ? '★' : '☆'}</button>
        </div>
      </div>
    </div>
  )
}

function Sparkline({ points }: { points: StayPricePoint[] }): React.ReactElement | null {
  if (points.length < 2) return null
  const vals = points.map((p) => p.price)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const w = 120
  const h = 28
  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w
      const y = max > min ? h - ((p.price - min) / (max - min)) * h : h / 2
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg width={w} height={h} style={{ overflow: 'visible' }}>
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
    </svg>
  )
}

export function StayFinderPage(): React.ReactElement {
  const store = useStayStore()
  const { input, results, sort, loading, error, providersFailed, favorites } = store
  const [tab, setTab] = useState<'search' | 'favorites' | 'watches'>('search')
  const [detail, setDetail] = useState<StayResult | null>(null)
  const [selectedPin, setSelectedPin] = useState<string>()

  // AI recommendation
  const [profile, setProfile] = useState('')
  const [aiOut, setAiOut] = useState('')
  const [aiRunning, setAiRunning] = useState(false)
  const aiRun = useRef<string | null>(null)

  // watches / history
  const [history, setHistory] = useState<{ id: number; filters: string; createdAt: string }[]>([])
  const [watchHist, setWatchHist] = useState<Record<string, StayPricePoint[]>>({})

  useEffect(() => {
    store.refreshFavorites()
    store.refreshWatches()
    window.api.settings.get('travel_profile').then((p) => setProfile(p ?? 'Prefiro apartamento inteiro; evito hostel; trabalho remotamente; valorizo academia e bairros caminháveis.'))
    window.api.stays.searchHistory().then(setHistory)
    const offChunk = window.api.ai.onChunk((rid, t) => {
      if (rid && rid === aiRun.current) setAiOut((o) => o + t)
    })
    const offDone = window.api.ai.onDone(({ runId, ok, output, error: err }) => {
      if (runId !== aiRun.current) return
      aiRun.current = null
      setAiRunning(false)
      setAiOut(ok ? output : err || 'Falha.')
    })
    return () => {
      offChunk()
      offDone()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const best = results[0]

  async function runAi(): Promise<void> {
    if (!results.length) return
    setAiRunning(true)
    setAiOut('')
    await window.api.settings.set('travel_profile', profile)
    const top = results.slice(0, 8).map((r, i) => `${i + 1}. ${r.title} — ${formatMoney(r.pricePerNight, r.currency)}/noite, ${r.neighborhood ?? '—'}, ⭐${r.rating ?? '?'}, ${r.roomType}, score ${r.score}`).join('\n')
    const model = (await window.api.settings.get('claude_model')) ?? ''
    const prompt = `Meu perfil de viagem:\n${profile}\n\nResultados de hospedagem em ${input.city}:\n${top}\n\nAnalise e explique em português quais são as 3 MELHORES opções para o meu perfil e por quê. Seja direto.`
    aiRun.current = await window.api.ai.start({ prompt, model, save: false })
  }

  async function refreshWatch(w: StayWatch): Promise<void> {
    setWatchHist((h) => ({ ...h, [w.id]: h[w.id] ?? [] }))
    const pts = await window.api.stays.priceHistory(w.id)
    setWatchHist((h) => ({ ...h, [w.id]: pts }))
  }

  const failedNote = providersFailed.length ? ` · falharam: ${providersFailed.join(', ')}` : ''

  // ── amenity / type toggle helpers ──
  const toggle = <T,>(arr: T[], v: T): T[] => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>🏨 Hospedagens</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Busca multi-plataforma (mock) · ranqueada por custo-benefício.</p>
        </div>
        <div className="runner-tabs" style={{ border: 'none', margin: 0, padding: 0 }}>
          {(['search', 'favorites', 'watches'] as const).map((t) => (
            <div key={t} className={`runner-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {t === 'search' ? 'Buscar' : t === 'favorites' ? `Favoritos (${favorites.length})` : `Monitorar (${store.watches.length})`}
            </div>
          ))}
        </div>
      </div>

      {tab === 'search' && (
        <>
          <div className="chart-section" style={{ marginBottom: 12 }}>
            <div className="editor-row">
              <div className="editor-field"><label>Cidade *</label><input value={input.city} onChange={(e) => store.setInput({ city: e.target.value })} placeholder="ex: Osaka" /></div>
              <div className="editor-field"><label>País</label><input value={input.country ?? ''} onChange={(e) => store.setInput({ country: e.target.value })} /></div>
              <div className="editor-field" style={{ maxWidth: 120 }}><label>Raio (km)</label><input type="number" min={0} value={input.maxDistanceKm ?? ''} onChange={(e) => store.setInput({ maxDistanceKm: e.target.value ? Number(e.target.value) : undefined })} /></div>
            </div>
            <ChipsInput label="Bairros preferidos" values={input.neighborhoods} onChange={(v) => store.setInput({ neighborhoods: v })} placeholder="bairro + Enter" />
            <ChipsInput label="Bairros a evitar" values={input.excludedNeighborhoods} onChange={(v) => store.setInput({ excludedNeighborhoods: v })} placeholder="bairro + Enter" />
            <div className="editor-row">
              <div className="editor-field"><label>Check-in *</label><input type="date" value={input.checkIn} onChange={(e) => store.setInput({ checkIn: e.target.value })} /></div>
              <div className="editor-field"><label>Check-out *</label><input type="date" value={input.checkOut} onChange={(e) => store.setInput({ checkOut: e.target.value })} /></div>
              <div className="editor-field" style={{ maxWidth: 120 }}><label>Flexível ±dias</label><input type="number" min={0} max={7} value={input.flexibleDays} onChange={(e) => store.setInput({ flexibleDays: Number(e.target.value) || 0 })} /></div>
            </div>
            <div className="editor-row">
              <div className="editor-field" style={{ maxWidth: 160 }}><label>Máx/noite</label><input type="number" min={0} value={input.maxPricePerNight ?? ''} onChange={(e) => store.setInput({ maxPricePerNight: e.target.value ? Number(e.target.value) : undefined })} /></div>
              <div className="editor-field" style={{ maxWidth: 160 }}><label>Máx total</label><input type="number" min={0} value={input.maxTotalPrice ?? ''} onChange={(e) => store.setInput({ maxTotalPrice: e.target.value ? Number(e.target.value) : undefined })} /></div>
              <div className="editor-field" style={{ maxWidth: 120 }}><label>Moeda</label><select value={input.currency} onChange={(e) => store.setInput({ currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
              <div className="editor-field" style={{ maxWidth: 120 }}><label>Nota mín.</label><input type="number" min={0} max={10} step={0.5} value={input.minRating ?? ''} onChange={(e) => store.setInput({ minRating: e.target.value ? Number(e.target.value) : undefined })} /></div>
            </div>

            <div className="editor-field">
              <label>Tipo de acomodação</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(Object.keys(ACCOMMODATION_LABELS) as AccommodationType[]).map((t) => (
                  <button key={t} className={`btn btn-sm ${input.accommodationTypes.includes(t) ? 'btn-primary' : 'btn-secondary'}`} onClick={() => store.setInput({ accommodationTypes: toggle(input.accommodationTypes, t) })}>{ACCOMMODATION_LABELS[t]}</button>
                ))}
              </div>
            </div>
            <div className="editor-field">
              <label>Comodidades obrigatórias</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(Object.keys(AMENITY_LABELS) as Amenity[]).map((a) => (
                  <button key={a} className={`btn btn-sm ${input.requiredAmenities.includes(a) ? 'btn-primary' : 'btn-secondary'}`} onClick={() => store.setInput({ requiredAmenities: toggle(input.requiredAmenities, a) })}>{AMENITY_LABELS[a]}</button>
                ))}
              </div>
            </div>
            <div className="editor-field">
              <label>Comodidades desejáveis (pontuam)</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(Object.keys(AMENITY_LABELS) as Amenity[]).map((a) => (
                  <button key={a} className={`btn btn-sm ${input.preferredAmenities.includes(a) ? 'btn-primary' : 'btn-secondary'}`} onClick={() => store.setInput({ preferredAmenities: toggle(input.preferredAmenities, a) })}>{AMENITY_LABELS[a]}</button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input type="checkbox" checked={input.excludeSharedRoom} onChange={(e) => store.setInput({ excludeSharedRoom: e.target.checked })} /> Excluir quarto compartilhado
              </label>
              <button className="btn btn-primary" onClick={() => store.search()} disabled={loading}>{loading ? 'Buscando…' : '🔎 Buscar hospedagens'}</button>
            </div>
            {error && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 6 }}>{error}</div>}
            {history.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Recentes:</span>
                {history.slice(0, 8).map((h) => {
                  let f: { city?: string } = {}
                  try { f = JSON.parse(h.filters) } catch { /* ignore */ }
                  return <button key={h.id} className="btn btn-secondary btn-sm" onClick={() => { try { store.setInput(JSON.parse(h.filters)) } catch { /* ignore */ } }}>{f.city || '?'}</button>
                })}
              </div>
            )}
          </div>

          {results.length > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{results.length} resultados{failedNote}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select value={sort} onChange={(e) => store.setSort(e.target.value as SortMode)}>{SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
                  <button className="btn btn-secondary btn-sm" onClick={() => store.createWatch().then(() => store.refreshWatches())}>🔔 Monitorar</button>
                </div>
              </div>

              <StayMap results={results} input={input} selectedId={selectedPin} onSelect={setSelectedPin} />

              <div className="chart-section" style={{ margin: '12px 0' }}>
                <div className="chart-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>🤖 Recomendação IA</span>
                  <button className="btn btn-primary btn-sm" onClick={runAi} disabled={aiRunning}>{aiRunning ? 'Analisando…' : 'Analisar melhores'}</button>
                </div>
                <textarea rows={2} value={profile} onChange={(e) => setProfile(e.target.value)} placeholder="Seu perfil de viagem…" style={{ width: '100%', marginTop: 8, fontSize: 12 }} />
                {(aiRunning || aiOut) && <div className="md-preview-pane" style={{ marginTop: 8, minHeight: 0 }}>{aiOut ? renderMarkdown(aiOut) : <div className="empty-hint">…</div>}</div>}
              </div>

              <div className="list-stack">
                {results.map((r, i) => (
                  <div key={r.id}>
                    {i === 0 && <div style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600, marginBottom: 2 }}>★ Melhor opção</div>}
                    <ResultCard r={r} isFav={store.isFavorite(r.id)} onFav={() => store.toggleFavorite(r)} onDetail={() => setDetail(r)} />
                  </div>
                ))}
              </div>
            </>
          )}
          {!loading && results.length === 0 && !error && <div className="empty-hint">Preencha os filtros e busque.</div>}
        </>
      )}

      {tab === 'favorites' && (
        <div className="list-stack">
          {favorites.length === 0 && <div className="empty-hint">Nenhum favorito.</div>}
          {favorites.map((f) => {
            let r: StayResult | null = null
            try { r = JSON.parse(f.data) } catch { /* ignore */ }
            return r ? <ResultCard key={f.id} r={r} isFav onFav={() => store.toggleFavorite(r as StayResult)} onDetail={() => setDetail(r)} /> : null
          })}
        </div>
      )}

      {tab === 'watches' && (
        <div className="list-stack">
          {store.watches.length === 0 && <div className="empty-hint">Nenhum monitoramento. Faça uma busca e clique em 🔔 Monitorar.</div>}
          {store.watches.map((w) => (
            <div key={w.id} className="list-row" style={{ alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div className="list-row-title">{w.city}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  atual {formatMoney(w.currentPrice, w.currency)} · melhor {formatMoney(w.bestPrice, w.currency)}
                </div>
              </div>
              {watchHist[w.id] ? <Sparkline points={watchHist[w.id]} /> : <button className="btn btn-secondary btn-sm" onClick={() => refreshWatch(w)}>histórico</button>}
              <button className="btn btn-danger btn-sm" onClick={() => store.removeWatch(w.id)}>✕</button>
            </div>
          ))}
        </div>
      )}

      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: 460, maxWidth: 620 }}>
            <h2>{detail.title}</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {ACCOMMODATION_LABELS[detail.roomType]} · {detail.neighborhood ?? '—'} · {detail.provider}
              {detail.distanceKm != null && ` · ${detail.distanceKm.toFixed(1)}km do ponto de referência`}
            </p>
            <div style={{ margin: '8px 0' }}>
              <strong style={{ fontSize: 18 }}>{formatMoney(detail.pricePerNight, detail.currency)}</strong>
              <span style={{ color: 'var(--text-muted)' }}> /noite · total {formatMoney(detail.totalPrice, detail.currency)}</span>
            </div>
            <div style={{ fontSize: 13, marginBottom: 8 }}>⭐ {detail.rating ?? '?'} ({detail.reviewCount ?? 0} avaliações) · score {detail.score}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {detail.amenities.map((a) => <span key={a} className="project-chip">{AMENITY_LABELS[a]}</span>)}
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => window.api.app.openExternal(detail.listingUrl)}>Abrir anúncio</button>
              <button className="btn btn-primary btn-sm" onClick={() => setDetail(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
