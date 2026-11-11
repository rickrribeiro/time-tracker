import React, { useEffect, useState } from 'react'
import { DEFAULT_KNOWLEDGE, knowledgeBullets } from '../../knowledge/constants'

interface Rec {
  keyword: string
  items: string[]
}

// Curated (mock) recommendations keyed to profile interests. Real AI-generated
// suggestions (Claude CLI) entram no módulo de IA.
const CATALOG: Rec[] = [
  { keyword: 'café', items: ['% Arabica (Osaka)', 'Blue Bottle Kyoto', 'Cafés de especialidade em Nakameguro'] },
  { keyword: 'anime', items: ['Nakano Broadway', 'Akihabara', 'Ghibli Museum (reserve antes)'] },
  { keyword: 'vida noturna', items: ['Golden Gai (Shinjuku)', 'Bares em Namba', 'Izakayas em Ura-Namba'] },
  { keyword: 'ramen', items: ['Ichiran', 'Ramen de tonkotsu em Hakata', 'Menya Inoichi (Kyoto)'] },
  { keyword: 'izakaya', items: ['Ura-Namba (Osaka)', 'Omoide Yokocho (Tóquio)'] },
  { keyword: 'caminháveis', items: ['Fique em Nakameguro / Shimokitazawa', 'Bairros de Kyoto a pé'] },
  { keyword: 'remotamente', items: ['Cafés com boa Wi-Fi', 'Coworkings em Shibuya'] }
]

/** Recomendações a partir da Base de Conhecimento (perfil do usuário). */
export function Recommendations(): React.ReactElement {
  const [kb, setKb] = useState(DEFAULT_KNOWLEDGE)

  useEffect(() => {
    window.api.settings.get('knowledge_base').then((v) => setKb(v && v.trim() ? v : DEFAULT_KNOWLEDGE))
  }, [])

  const bullets = knowledgeBullets(kb)
  const matched = CATALOG.filter((c) => bullets.some((b) => b.toLowerCase().includes(c.keyword)))

  return (
    <div className="chart-section">
      <div className="chart-title">⭐ Recomendações</div>
      <p className="travel-muted" style={{ fontSize: 12, margin: '4px 0 10px' }}>
        Baseadas na sua <strong>Base de Conhecimento</strong> (edite em Organização). Geração por IA na página IA.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {bullets.map((b) => (
          <span key={b} className="project-chip">{b}</span>
        ))}
      </div>
      {matched.length === 0 ? (
        <div className="empty-hint">Nenhuma recomendação para o seu perfil ainda.</div>
      ) : (
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
      )}
    </div>
  )
}
