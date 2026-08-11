import React from 'react'
import { StayResult, SearchInput } from '../types'

/** Lightweight pin scatter (no map lib): normalizes lat/long to a box. */
export function StayMap({ results, input, selectedId, onSelect }: { results: StayResult[]; input: SearchInput; selectedId?: string; onSelect?: (id: string) => void }): React.ReactElement | null {
  const pts = results.filter((r) => r.latitude != null && r.longitude != null)
  if (pts.length === 0) return null
  const lats = pts.map((r) => r.latitude as number)
  const lngs = pts.map((r) => r.longitude as number)
  if (input.lat != null && input.lng != null) {
    lats.push(input.lat)
    lngs.push(input.lng)
  }
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const W = 100
  const H = 60
  const pad = 6
  const x = (lng: number): number => (maxLng > minLng ? pad + ((lng - minLng) / (maxLng - minLng)) * (W - 2 * pad) : W / 2)
  const y = (lat: number): number => (maxLat > minLat ? H - pad - ((lat - minLat) / (maxLat - minLat)) * (H - 2 * pad) : H / 2)
  const color = (s: number): string => (s >= 75 ? '#22c55e' : s >= 50 ? '#f59e0b' : '#94a3b8')

  return (
    <div className="stay-map">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 180 }}>
        {input.lat != null && input.lng != null && (
          <text x={x(input.lng)} y={y(input.lat) + 1} fontSize={4} textAnchor="middle">⭐</text>
        )}
        {pts.map((r) => (
          <g key={r.id} onClick={() => onSelect?.(r.id)} style={{ cursor: 'pointer' }}>
            <circle
              cx={x(r.longitude as number)}
              cy={y(r.latitude as number)}
              r={r.id === selectedId ? 2.6 : 1.8}
              fill={color(r.score)}
              stroke={r.id === selectedId ? '#fff' : 'none'}
              strokeWidth={0.4}
            >
              <title>{`${r.title} · ${r.score}pts`}</title>
            </circle>
          </g>
        ))}
      </svg>
    </div>
  )
}
