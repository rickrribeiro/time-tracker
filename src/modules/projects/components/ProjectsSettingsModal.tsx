import React, { useEffect, useState } from 'react'
import type { ClaudeHookStatus } from '../../../types'
import { timeAgo } from '../../../utils/dates'
import { shortPath } from '../git'

/** Automações da Central de Projetos: hook do Claude Code que preenche o "onde parei". */
export function ProjectsSettingsModal({ onClose }: { onClose: () => void }): React.ReactElement {
  const [st, setSt] = useState<ClaudeHookStatus | null>(null)
  const [model, setModel] = useState('haiku')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    window.api.projects.hookStatus().then((s) => {
      setSt(s)
      setModel(s.model)
    }).catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  async function run(fn: () => Promise<ClaudeHookStatus>): Promise<void> {
    setBusy(true)
    setError('')
    try {
      setSt(await fn())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal ph-modal ph-modal-wide" onClick={(e) => e.stopPropagation()}>
        <h2>⚙️ Automações dos projetos</h2>

        <div className="ph-panel">
          <div className="ph-panel-title">📍 “Onde parei” automático (Claude Code)</div>
          <p className="ph-muted">
            Um hook <code>SessionEnd</code> global avisa o rickOS quando uma sessão do Claude Code termina. Se a pasta pertence a um projeto (ou a um
            worktree dele), o rickOS lê a conversa e os commits e escreve o “onde parei” — e a próxima ação, se estiver vazia.
          </p>
          {st && (
            <div className="ph-hook-status">
              <span className={`ph-deleg-status ${st.installed ? 'ok' : 'off'}`}>{st.installed ? '● instalado' : '○ não instalado'}</span>
              {st.installed && <span className="ph-muted">em {shortPath(st.settingsPath)}</span>}
            </div>
          )}
          {st?.last && (
            <div className="ph-muted">
              Última sessão: {st.last.project ?? '—'} · {st.last.status} · há {timeAgo(st.last.at)}
            </div>
          )}
          {st?.installed && (
            <>
              <label className="ph-check">
                <input type="checkbox" checked={st.enabled} onChange={() => run(() => window.api.projects.hookConfig(!st.enabled, null))} />
                <span>Ativo (desligue para pausar sem desinstalar)</span>
              </label>
              <div className="ph-row">
                <label className="ph-muted" style={{ flex: 1 }}>
                  Modelo do resumo
                  <input value={model} onChange={(e) => setModel(e.target.value)} onBlur={() => model !== st.model && run(() => window.api.projects.hookConfig(st.enabled, model))} placeholder="haiku" />
                </label>
              </div>
            </>
          )}
          <div className="ph-btnrow">
            {!st?.installed ? (
              <button className="btn btn-primary btn-sm" onClick={() => run(() => window.api.projects.hookInstall())} disabled={busy}>Instalar hook</button>
            ) : (
              <>
                <button className="btn btn-secondary btn-sm" onClick={() => run(() => window.api.projects.hookInstall())} disabled={busy} title="Regrava o script (ex.: mudou a porta/token)">↻ Reinstalar</button>
                <button className="btn btn-danger btn-sm" onClick={() => run(() => window.api.projects.hookUninstall())} disabled={busy}>Desinstalar</button>
              </>
            )}
          </div>
          <p className="ph-muted">
            Instalar edita <code>~/.claude/settings.json</code> (backup em <code>settings.json.rickos-backup</code>) no computador que roda o rickOS. Vale para
            sessões novas do Claude Code. Cada resumo é uma chamada curta ao modelo escolhido.
          </p>
        </div>
        {error && <div className="ph-error">{error}</div>}
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  )
}
