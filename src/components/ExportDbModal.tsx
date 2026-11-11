import React, { useEffect, useState } from 'react'
import { ExportDbResult } from '../types'
import { openExternal } from '../api/createApi'

/** Export DB: escolher entre Google Drive, salvar no dispositivo ou cancelar. */
export function ExportDbModal({ onClose }: { onClose: () => void }): React.ReactElement {
  const [accounts, setAccounts] = useState<string[] | null>(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState<'drive' | 'device' | null>(null)
  const [result, setResult] = useState<ExportDbResult | null>(null)

  useEffect(() => {
    window.api.google
      .accounts()
      .catch(() => [] as string[])
      .then((a) => {
        setAccounts(a)
        setEmail(a[0] ?? '')
      })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  async function run(target: 'drive' | 'device'): Promise<void> {
    setBusy(target)
    setResult(null)
    try {
      const r = target === 'drive' ? await window.api.app.exportDbToDrive(email) : await window.api.app.exportDbToDevice()
      if (r.ok) setResult(r)
      else if (r.error) setResult(r)
      // ok=false sem erro = o usuário cancelou o diálogo de salvar: continua no modal
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(null)
    }
  }

  const hasDrive = !!accounts?.length

  return (
    <div className="modal-overlay" onClick={() => !busy && onClose()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>💾 Exportar backup</h2>

        {result?.ok ? (
          <>
            <p style={{ fontSize: 14 }}>✅ {result.message || 'Backup exportado.'}</p>
            <div className="modal-actions">
              {result.link && (
                <button className="btn btn-secondary" onClick={() => openExternal(result.link!)}>Abrir no Drive</button>
              )}
              <button className="btn btn-primary" onClick={onClose}>Fechar</button>
            </div>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
              Onde salvar o arquivo do banco (.sqlite)?
            </p>

            <div className="export-db-options">
              <div className="export-db-option">
                <button className="btn btn-primary" disabled={!hasDrive || !!busy} onClick={() => run('drive')}>
                  {busy === 'drive' ? 'Enviando…' : '☁️ Google Drive'}
                </button>
                {accounts == null ? (
                  <span className="export-db-hint">carregando contas…</span>
                ) : hasDrive ? (
                  accounts.length > 1 ? (
                    <select value={email} onChange={(e) => setEmail(e.target.value)} disabled={!!busy}>
                      {accounts.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  ) : (
                    <span className="export-db-hint">{accounts[0]}</span>
                  )
                ) : (
                  <span className="export-db-hint">conecte uma conta Google em Configurações</span>
                )}
              </div>

              <div className="export-db-option">
                <button className="btn btn-primary" disabled={!!busy} onClick={() => run('device')}>
                  {busy === 'device' ? 'Salvando…' : '📥 Baixar no dispositivo'}
                </button>
                <span className="export-db-hint">você escolhe a pasta</span>
              </div>
            </div>

            {result?.error && (
              <p style={{ fontSize: 13, color: 'var(--danger)', marginTop: 12 }}>Falha ao exportar: {result.error}</p>
            )}

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={onClose} disabled={!!busy}>Cancelar</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
