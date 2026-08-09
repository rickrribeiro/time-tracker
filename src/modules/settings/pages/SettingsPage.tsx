import React, { useEffect, useState } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import { useGithubStore } from '../../projects/store/githubStore'
import { useCalendarStore } from '../../calendar/store/calendarStore'

export function SettingsPage(): React.ReactElement {
  const { values, refresh, set } = useSettingsStore()
  const { sync, syncing, error, lastCount } = useGithubStore()
  const { refresh: refreshEvents } = useCalendarStore()
  const [token, setToken] = useState('')
  const [username, setUsername] = useState('')
  const [saved, setSaved] = useState(false)

  // Google Calendar
  const [gClientId, setGClientId] = useState('')
  const [gClientSecret, setGClientSecret] = useState('')
  const [gConnected, setGConnected] = useState(false)
  const [gBusy, setGBusy] = useState<'connect' | 'sync' | null>(null)
  const [gMsg, setGMsg] = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => {
    refresh()
    window.api.google.status().then(setGConnected)
  }, [])

  useEffect(() => {
    setToken(values.github_token ?? '')
    setUsername(values.github_username ?? '')
    setGClientId(values.google_client_id ?? '')
    setGClientSecret(values.google_client_secret ?? '')
  }, [values.github_token, values.github_username, values.google_client_id, values.google_client_secret])

  async function handleSave(): Promise<void> {
    await set('github_token', token.trim())
    await set('github_username', username.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function saveGoogleCreds(): Promise<void> {
    await set('google_client_id', gClientId.trim())
    await set('google_client_secret', gClientSecret.trim())
    setGMsg({ text: 'Credenciais salvas.', ok: true })
  }

  async function connectGoogle(): Promise<void> {
    await saveGoogleCreds()
    setGBusy('connect')
    setGMsg(null)
    try {
      await window.api.google.connect()
      setGConnected(true)
      setGMsg({ text: 'Conectado! Clique em Sincronizar.', ok: true })
    } catch (e) {
      setGMsg({ text: e instanceof Error ? e.message : String(e), ok: false })
    } finally {
      setGBusy(null)
    }
  }

  async function syncGoogle(): Promise<void> {
    setGBusy('sync')
    setGMsg(null)
    try {
      const n = await window.api.google.sync()
      await refreshEvents()
      setGMsg({ text: `${n} eventos sincronizados.`, ok: true })
    } catch (e) {
      setGMsg({ text: e instanceof Error ? e.message : String(e), ok: false })
    } finally {
      setGBusy(null)
    }
  }

  async function disconnectGoogle(): Promise<void> {
    await window.api.google.disconnect()
    setGConnected(false)
    setGMsg({ text: 'Desconectado.', ok: true })
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

      <div className="chart-section" style={{ maxWidth: 560, marginTop: 16 }}>
        <div className="chart-title">📅 Google Calendar {gConnected && <span style={{ color: 'var(--success)', fontSize: 12 }}>● conectado</span>}</div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 12px' }}>
          Crie credenciais OAuth <strong>Desktop app</strong> no Google Cloud Console (API Google
          Calendar) e cole abaixo. O redirect de loopback é tratado automaticamente. Leitura apenas
          (escopo <code>calendar.readonly</code>).
        </p>

        <div className="editor-field">
          <label>Client ID</label>
          <input type="text" placeholder="...apps.googleusercontent.com" value={gClientId} onChange={(e) => setGClientId(e.target.value)} />
        </div>
        <div className="editor-field">
          <label>Client Secret</label>
          <input type="password" placeholder="GOCSPX-…" value={gClientSecret} onChange={(e) => setGClientSecret(e.target.value)} />
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary btn-sm" onClick={connectGoogle} disabled={gBusy !== null || !gClientId.trim() || !gClientSecret.trim()}>
            {gBusy === 'connect' ? 'Aguardando browser…' : gConnected ? 'Reconectar' : 'Conectar'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={syncGoogle} disabled={gBusy !== null || !gConnected}>
            {gBusy === 'sync' ? 'Sincronizando…' : '🔄 Sincronizar (7 dias)'}
          </button>
          {gConnected && (
            <button className="btn btn-danger btn-sm" onClick={disconnectGoogle} disabled={gBusy !== null}>
              Desconectar
            </button>
          )}
        </div>
        {gMsg && (
          <div style={{ fontSize: 12, color: gMsg.ok ? 'var(--success)' : 'var(--danger)', marginTop: 8 }}>{gMsg.text}</div>
        )}
      </div>
    </div>
  )
}
