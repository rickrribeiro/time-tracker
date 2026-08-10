import React, { useEffect, useState } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import { useGithubStore } from '../../projects/store/githubStore'
import { useCalendarStore } from '../../calendar/store/calendarStore'
import { useFinanceStore } from '../../finance/store/financeStore'
import { PluggyConnect } from 'react-pluggy-connect'

const FX_CURRENCIES = ['BRL', 'USD', 'JPY', 'EUR']

function fmtLastSync(iso?: string): string {
  if (!iso) return 'nunca'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return 'nunca'
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function SettingsPage(): React.ReactElement {
  const { values, refresh, set } = useSettingsStore()
  const { sync, syncing, error, lastCount } = useGithubStore()
  const { refresh: refreshEvents } = useCalendarStore()
  const { base, rates, refresh: refreshFinance, saveFxConfig } = useFinanceStore()
  const [fxBase, setFxBase] = useState('BRL')
  const [fxRates, setFxRates] = useState<Record<string, string>>({})
  const [fxSaved, setFxSaved] = useState(false)

  // Open Finance (Pluggy)
  const [pClientId, setPClientId] = useState('')
  const [pClientSecret, setPClientSecret] = useState('')
  const [pItemId, setPItemId] = useState('')
  const [pBusy, setPBusy] = useState(false)
  const [pMsg, setPMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [connectToken, setConnectToken] = useState<string | null>(null)

  const [token, setToken] = useState('')
  const [username, setUsername] = useState('')
  const [saved, setSaved] = useState(false)
  const [authMode, setAuthMode] = useState<'token' | 'ssh'>('token')

  async function changeAuthMode(m: 'token' | 'ssh'): Promise<void> {
    setAuthMode(m)
    await set('github_auth_mode', m)
  }

  // IA (Claude CLI)
  const [claudeCmd, setClaudeCmd] = useState('claude')
  const [claudeSaved, setClaudeSaved] = useState(false)
  const [allowedTools, setAllowedTools] = useState('')
  const [toolsSaved, setToolsSaved] = useState(false)

  // Skyscanner (RapidAPI)
  const [skyKey, setSkyKey] = useState('')
  const [skyHost, setSkyHost] = useState('')
  const [skySaved, setSkySaved] = useState(false)

  // Google Calendar
  const [gClientId, setGClientId] = useState('')
  const [gClientSecret, setGClientSecret] = useState('')
  const [gConnected, setGConnected] = useState(false)
  const [gAccounts, setGAccounts] = useState<string[]>([])
  const [gBusy, setGBusy] = useState<'connect' | 'sync' | null>(null)
  const [gMsg, setGMsg] = useState<{ text: string; ok: boolean } | null>(null)

  async function refreshGoogle(): Promise<void> {
    const [connected, accounts] = await Promise.all([
      window.api.google.status(),
      window.api.google.accounts ? window.api.google.accounts() : Promise.resolve([])
    ])
    setGConnected(connected)
    setGAccounts(accounts)
  }

  useEffect(() => {
    refresh()
    refreshFinance()
    refreshGoogle()
  }, [])

  useEffect(() => {
    setFxBase(base)
    setFxRates(Object.fromEntries(Object.entries(rates).map(([k, v]) => [k, String(v)])))
  }, [base, rates])

  async function saveFx(): Promise<void> {
    const parsed: Record<string, number> = {}
    for (const [k, v] of Object.entries(fxRates)) {
      const n = parseFloat(v)
      if (!isNaN(n) && n > 0 && k !== fxBase) parsed[k] = n
    }
    await saveFxConfig(fxBase, parsed)
    setFxSaved(true)
    setTimeout(() => setFxSaved(false), 2000)
  }

  useEffect(() => {
    setToken(values.github_token ?? '')
    setUsername(values.github_username ?? '')
    setGClientId(values.google_client_id ?? '')
    setGClientSecret(values.google_client_secret ?? '')
    setPClientId(values.pluggy_client_id ?? '')
    setPClientSecret(values.pluggy_client_secret ?? '')
    setPItemId(values.pluggy_item_id ?? '')
    setClaudeCmd(values.claude_command ?? 'claude')
    setAllowedTools(values.claude_allowed_tools ?? '')
    setSkyKey(values.skyscanner_rapidapi_key ?? '')
    setSkyHost(values.skyscanner_rapidapi_host ?? '')
    setAuthMode((values.github_auth_mode as 'token' | 'ssh') || 'token')
  }, [
    values.github_token,
    values.github_username,
    values.github_auth_mode,
    values.google_client_id,
    values.google_client_secret,
    values.pluggy_client_id,
    values.pluggy_client_secret,
    values.pluggy_item_id,
    values.claude_command,
    values.claude_allowed_tools,
    values.skyscanner_rapidapi_key,
    values.skyscanner_rapidapi_host
  ])

  async function saveSky(): Promise<void> {
    await set('skyscanner_rapidapi_key', skyKey.trim())
    await set('skyscanner_rapidapi_host', skyHost.trim())
    setSkySaved(true)
    setTimeout(() => setSkySaved(false), 2000)
  }

  async function saveClaudeCmd(): Promise<void> {
    await set('claude_command', claudeCmd.trim() || 'claude')
    setClaudeSaved(true)
    setTimeout(() => setClaudeSaved(false), 2000)
  }

  async function saveAllowedTools(): Promise<void> {
    await set('claude_allowed_tools', allowedTools.trim())
    setToolsSaved(true)
    setTimeout(() => setToolsSaved(false), 2000)
  }

  async function savePluggy(): Promise<void> {
    await set('pluggy_client_id', pClientId.trim())
    await set('pluggy_client_secret', pClientSecret.trim())
    await set('pluggy_item_id', pItemId.trim())
    setPMsg({ text: 'Credenciais salvas (criptografadas) ✓', ok: true })
  }

  async function connectBank(): Promise<void> {
    // persist creds (needed to mint the connect token) then open the widget
    await set('pluggy_client_id', pClientId.trim())
    await set('pluggy_client_secret', pClientSecret.trim())
    setPMsg(null)
    try {
      const t = await window.api.pluggy.connectToken()
      setConnectToken(t)
    } catch (e) {
      setPMsg({ text: e instanceof Error ? e.message : String(e), ok: false })
    }
  }

  async function onBankConnected(itemId: string): Promise<void> {
    setConnectToken(null)
    setPItemId(itemId)
    await set('pluggy_item_id', itemId)
    setPBusy(true)
    setPMsg(null)
    try {
      const r = await window.api.pluggy.sync()
      await refreshFinance()
      setPMsg({ text: `Banco conectado! ${r.imported} importadas, ${r.skipped} já existiam.`, ok: true })
    } catch (e) {
      setPMsg({ text: e instanceof Error ? e.message : String(e), ok: false })
    } finally {
      setPBusy(false)
    }
  }

  async function syncPluggy(): Promise<void> {
    await savePluggy()
    setPBusy(true)
    setPMsg(null)
    try {
      const r = await window.api.pluggy.sync()
      await refreshFinance()
      await refresh()
      setPMsg({ text: `${r.imported} importadas, ${r.skipped} já existiam.`, ok: true })
    } catch (e) {
      setPMsg({ text: e instanceof Error ? e.message : String(e), ok: false })
    } finally {
      setPBusy(false)
    }
  }

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
      await refreshGoogle()
      setGMsg({ text: 'Conta conectada! Clique em Sincronizar.', ok: true })
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
      await refresh()
      setGMsg({ text: `${n} eventos sincronizados.`, ok: true })
    } catch (e) {
      setGMsg({ text: e instanceof Error ? e.message : String(e), ok: false })
    } finally {
      setGBusy(null)
    }
  }

  async function disconnectGoogle(): Promise<void> {
    await window.api.google.disconnect()
    await refreshGoogle()
    setGMsg({ text: 'Todas as contas desconectadas.', ok: true })
  }

  async function disconnectGoogleAccount(email: string): Promise<void> {
    await window.api.google.disconnectAccount(email)
    await refreshGoogle()
    setGMsg({ text: `Conta ${email} removida.`, ok: true })
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

        <div className="editor-field">
          <label>Autenticação</label>
          <div className="seg-toggle">
            <button className={`seg-btn ${authMode === 'ssh' ? 'active' : ''}`} onClick={() => changeAuthMode('ssh')}>
              Máquina (gh/SSH)
            </button>
            <button className={`seg-btn ${authMode === 'token' ? 'active' : ''}`} onClick={() => changeAuthMode('token')}>
              Token (PAT)
            </button>
          </div>
        </div>

        {authMode === 'ssh' ? (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0 12px' }}>
            Usa o <strong>GitHub CLI (<code>gh</code>)</strong> autenticado na sua máquina (mesma conta do
            seu git/SSH) — sem precisar de token no app. Requer <code>gh</code> instalado e
            <code>gh auth login</code> feito. (A REST API do GitHub não autentica por chave SSH; o
            <code>gh</code> usa a credencial já configurada.)
          </p>
        ) : (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0 12px' }}>
            Crie um <strong>Personal Access Token</strong> (classic) com escopo <code>repo</code> em
            github.com → Settings → Developer settings. Usado só localmente para ler suas issues.
          </p>
        )}

        {authMode === 'token' && (
          <>
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
          </>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center' }}>
          {authMode === 'token' && (
            <button className="btn btn-primary btn-sm" onClick={handleSave}>
              {saved ? '✓ Salvo' : 'Salvar'}
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={sync} disabled={syncing || (authMode === 'token' && !token.trim())}>
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
        <div className="chart-title">📅 Google Calendar {gAccounts.length > 0 && <span style={{ color: 'var(--success)', fontSize: 12 }}>● {gAccounts.length} conta{gAccounts.length === 1 ? '' : 's'}</span>}</div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 12px' }}>
          Crie credenciais OAuth <strong>Desktop app</strong> no Google Cloud Console (API Google
          Calendar) e cole abaixo. Você pode conectar <strong>várias contas</strong> — os eventos de
          todas aparecem juntos. Leitura apenas (escopo <code>calendar.readonly</code>).
        </p>

        {gAccounts.length > 0 && (
          <div className="list-stack" style={{ marginBottom: 12 }}>
            {gAccounts.map((email) => (
              <div key={email} className="list-row">
                <span className="list-row-title">{email}</span>
                <button
                  className="btn btn-danger btn-sm"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => disconnectGoogleAccount(email)}
                  disabled={gBusy !== null}
                  title="Remover esta conta"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

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
            {gBusy === 'connect' ? 'Aguardando browser…' : gConnected ? '+ Conectar outra conta' : 'Conectar conta'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={syncGoogle} disabled={gBusy !== null || !gConnected}>
            {gBusy === 'sync' ? 'Sincronizando…' : '🔄 Sincronizar (7 dias)'}
          </button>
          {gConnected && gAccounts.length > 1 && (
            <button className="btn btn-danger btn-sm" onClick={disconnectGoogle} disabled={gBusy !== null}>
              Desconectar todas
            </button>
          )}
        </div>
        {gMsg && (
          <div style={{ fontSize: 12, color: gMsg.ok ? 'var(--success)' : 'var(--danger)', marginTop: 8 }}>{gMsg.text}</div>
        )}
        {gConnected && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            ⏱️ Sincroniza automaticamente 1×/dia (na abertura do app, se passou 24h).
            <br />Última sincronização: <strong>{fmtLastSync(values['google_last_sync'])}</strong>
          </div>
        )}
      </div>

      <div className="chart-section" style={{ maxWidth: 560, marginTop: 16 }}>
        <div className="chart-title">💱 Finanças — câmbio</div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 12px' }}>
          Moeda base e taxas manuais (valor de <strong>1 unidade</strong> da moeda na base). Usado para
          consolidar totais no Dashboard de Finanças.
        </p>
        <div className="editor-field">
          <label>Moeda base</label>
          <select value={fxBase} onChange={(e) => setFxBase(e.target.value)}>
            {FX_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="editor-row" style={{ flexWrap: 'wrap' }}>
          {FX_CURRENCIES.filter((c) => c !== fxBase).map((c) => (
            <div className="editor-field" key={c}>
              <label>1 {c} = ? {fxBase}</label>
              <input
                type="number"
                placeholder="ex: 5.20"
                value={fxRates[c] ?? ''}
                onChange={(e) => setFxRates((r) => ({ ...r, [c]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btn btn-primary btn-sm" onClick={saveFx}>{fxSaved ? '✓ Salvo' : 'Salvar câmbio'}</button>
        </div>
      </div>

      <div className="chart-section" style={{ maxWidth: 560, marginTop: 16 }}>
        <div className="chart-title">🏦 Open Finance (Pluggy)</div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 12px' }}>
          Conecte seu banco via <strong>Pluggy Connect</strong> (agregador de Open Finance). Cole o
          Client ID/Secret da sua conta Pluggy e o <strong>Item ID</strong> do banco já conectado. As
          transações são importadas (deduplicadas por data+valor+descrição). As credenciais são
          guardadas <strong>criptografadas</strong> no banco local (keychain do sistema).
        </p>
        <div className="editor-field">
          <label>Client ID</label>
          <input type="password" value={pClientId} onChange={(e) => setPClientId(e.target.value)} />
        </div>
        <div className="editor-field">
          <label>Client Secret</label>
          <input type="password" value={pClientSecret} onChange={(e) => setPClientSecret(e.target.value)} />
        </div>
        <div className="editor-field">
          <label>Item ID (banco conectado)</label>
          <input type="text" value={pItemId} onChange={(e) => setPItemId(e.target.value)} />
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary btn-sm"
            onClick={connectBank}
            disabled={pBusy || !pClientId.trim() || !pClientSecret.trim()}
          >
            🏦 Conectar banco
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={savePluggy}
            disabled={pBusy || !pClientId.trim() || !pClientSecret.trim()}
          >
            💾 Salvar credenciais
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={syncPluggy}
            disabled={pBusy || !pClientId.trim() || !pClientSecret.trim() || !pItemId.trim()}
          >
            {pBusy ? 'Importando…' : '🔄 Importar transações'}
          </button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
          <strong>Conectar banco</strong> abre o Pluggy Connect para vincular sua conta (gera o Item
          automaticamente). Depois, o Item ID fica salvo e o import roda sozinho.
        </p>
        {pMsg && (
          <div style={{ fontSize: 12, color: pMsg.ok ? 'var(--success)' : 'var(--danger)', marginTop: 8 }}>{pMsg.text}</div>
        )}
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
          Última sincronização: <strong>{fmtLastSync(values['pluggy_last_sync'])}</strong>
        </div>
      </div>

      {connectToken && (
        <PluggyConnect
          connectToken={connectToken}
          includeSandbox={true}
          onSuccess={(data) => onBankConnected(data.item.id)}
          onError={(err) => {
            setConnectToken(null)
            setPMsg({ text: `Pluggy Connect: ${err?.message || 'falha na conexão'}`, ok: false })
          }}
          onClose={() => setConnectToken(null)}
        />
      )}

      <div className="chart-section" style={{ maxWidth: 560, marginTop: 16 }}>
        <div className="chart-title">🤖 IA (Claude CLI)</div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 12px' }}>
          Comando usado para rodar o Claude Code local. Padrão <code>claude</code>. Use outro se tiver
          mais de uma assinatura (ex.: <code>claude-trabalho</code>).
        </p>
        <div className="editor-field">
          <label>Comando</label>
          <input
            type="text"
            placeholder="claude"
            value={claudeCmd}
            onChange={(e) => setClaudeCmd(e.target.value)}
          />
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btn btn-primary btn-sm" onClick={saveClaudeCmd}>{claudeSaved ? '✓ Salvo' : 'Salvar comando'}</button>
        </div>

        <div className="editor-field" style={{ marginTop: 16 }}>
          <label>Ferramentas permitidas</label>
          <input
            type="text"
            placeholder="Bash(gh:*) Bash(git:*) Read Write Edit Glob Grep"
            value={allowedTools}
            onChange={(e) => setAllowedTools(e.target.value)}
          />
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
          O que o Claude pode executar sem pedir aprovação no Prompt Runner/Assistente. Vazio = usa o
          padrão (<code>gh</code>, <code>git</code> e arquivos). Use <code>Bash</code> para liberar
          qualquer comando, ou deixe só <code>Read Grep</code> para modo leitura.
        </p>
        <div style={{ marginTop: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={saveAllowedTools}>{toolsSaved ? '✓ Salvo' : 'Salvar ferramentas'}</button>
        </div>
      </div>

      <div className="chart-section" style={{ maxWidth: 560, marginTop: 16 }}>
        <div className="chart-title">✈️ Skyscanner (RapidAPI)</div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 12px' }}>
          Busca de preços de passagens (o Skyscanner já agrega várias fontes). Assine uma API
          Skyscanner no <strong>RapidAPI</strong> e cole a chave. O host é opcional (padrão
          <code> sky-scanner3.p.rapidapi.com</code>) — ajuste se usar outro provedor.
        </p>
        <div className="editor-field">
          <label>RapidAPI Key</label>
          <input type="password" value={skyKey} onChange={(e) => setSkyKey(e.target.value)} />
        </div>
        <div className="editor-field">
          <label>Host (opcional)</label>
          <input type="text" placeholder="sky-scanner3.p.rapidapi.com" value={skyHost} onChange={(e) => setSkyHost(e.target.value)} />
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btn btn-primary btn-sm" onClick={saveSky}>{skySaved ? '✓ Salvo' : 'Salvar'}</button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
          Última busca de voos: <strong>{fmtLastSync(values['skyscanner_last_sync'])}</strong>
        </div>
      </div>
    </div>
  )
}
