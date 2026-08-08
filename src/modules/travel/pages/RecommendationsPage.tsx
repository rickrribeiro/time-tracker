import React from 'react'
import profileRaw from '../user-profile.md?raw'

interface Rec {
  keyword: string
  items: string[]
}

// Curated (mock) recommendations keyed to profile interests. Real AI-generated
// suggestions (Claude CLI) entram no módulo de IA (#8).
const CATALOG: Rec[] = [
  { keyword: 'café', items: ['% Arabica (Osaka)', 'Blue Bottle Kyoto', 'Cafés de especialidade em Nakameguro'] },
  { keyword: 'anime', items: ['Nakano Broadway', 'Akihabara', 'Ghibli Museum (reserve antes)'] },
  { keyword: 'vida noturna', items: ['Golden Gai (Shinjuku)', 'Bares em Namba', 'Izakayas em Ura-Namba'] },
  { keyword: 'ramen', items: ['Ichiran', 'Ramen de tonkotsu em Hakata', 'Menya Inoichi (Kyoto)'] },
  { keyword: 'izakaya', items: ['Ura-Namba (Osaka)', 'Omoide Yokocho (Tóquio)'] },
  { keyword: 'caminháveis', items: ['Fique em Nakameguro / Shimokitazawa', 'Bairros de Kyoto a pé'] },
  { keyword: 'remotamente', items: ['Cafés com boa Wi-Fi', 'Coworkings em Shibuya'] }
]

function profileBullets(md: string): string[] {
  return md
    .split(/\r?\n/)
    .filter((l) => l.trim().startsWith('-'))
    .map((l) => l.replace(/^-\s*/, '').trim())
}

export function RecommendationsPage(): React.ReactElement {
  const bullets = profileBullets(profileRaw)
  const matched = CATALOG.filter((c) => bullets.some((b) => b.toLowerCase().includes(c.keyword)))

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>⭐ Recomendações</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Baseadas no seu perfil (<code>user-profile.md</code>). Geração por IA entra no módulo de IA.
          </p>
        </div>
      </div>

      <div className="chart-section" style={{ marginBottom: 12 }}>
        <div className="chart-title">Seu perfil</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {bullets.map((b) => (
            <span key={b} className="project-chip">{b}</span>
          ))}
        </div>
      </div>

      <div className="cards-grid">
        {matched.map((c) => (
          <div key={c.keyword} className="stat-card">
            <div className="stat-card-label" style={{ textTransform: 'capitalize' }}>{c.keyword}</div>
            <ul style={{ margin: '8px 0 0', paddingLeft: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
              {c.items.map((it) => <li key={it}>{it}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
