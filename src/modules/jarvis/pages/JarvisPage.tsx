import React from 'react'

export function JarvisPage(): React.ReactElement {
  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>🧞 Jarvis</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Assistente pessoal</p>
        </div>
      </div>

      <div className="chart-section" style={{ textAlign: 'center', padding: 60 }}>
        <div style={{ fontSize: 48 }}>🚧</div>
        <div style={{ marginTop: 12, fontSize: 16, fontWeight: 600 }}>Em desenvolvimento</div>
      </div>
    </div>
  )
}
