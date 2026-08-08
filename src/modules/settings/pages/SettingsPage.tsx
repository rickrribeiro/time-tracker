import React, { useEffect, useState } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import { useGithubStore } from '../../projects/store/githubStore'

export function SettingsPage(): React.ReactElement {
  const { values, refresh, set } = useSettingsStore()
  const { sync, syncing, error, lastCount } = useGithubStore()
  const [token, setToken] = useState('')
  const [username, setUsername] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    refresh()
  }, [])

  useEffect(() => {
    setToken(values.github_token ?? '')
    setUsername(values.github_username ?? '')
  }, [values.github_token, values.github_username])

  async function handleSave(): Promise<void> {
    await set('github_token', token.trim())
    await set('github_username', username.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>⚙️ Configurações</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Integrações e preferências. Tokens ficam no banco local (userData).
          </p>
        </div>
      </div>

      <div className="chart-section" style={{ maxWidth: 560 }}>
        <div className="chart-title">🐙 GitHub</div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 12px' }}>
          Crie um <strong>Personal Access Token</strong> (classic) com escopo <code>repo</code> em
          github.com → Settings → Developer settings. Ele é usado só localmente para ler suas issues
          atribuídas.
        </p>

        <div className="editor-field">
          <label>Personal Access Token</label>
          <input
            type="password"
            placeholder="ghp_…"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </div>
        <div className="editor-field">
          <label>Username (opcional)</label>
          <input
            type="text"
            placeholder="seu-usuario"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center' }}>
          <button className="btn btn-primary btn-sm" onClick={handleSave}>
            {saved ? '✓ Salvo' : 'Salvar'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={sync} disabled={syncing || !token.trim()}>
            {syncing ? 'Sincronizando…' : '🔄 Testar / Sincronizar Issues'}
          </button>
          {lastCount !== null && !error && (
            <span style={{ fontSize: 12, color: 'var(--success)' }}>{lastCount} issues sincronizadas</span>
          )}
        </div>
        {error && (
          <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 8 }}>{error}</div>
        )}
      </div>
    </div>
  )
}
