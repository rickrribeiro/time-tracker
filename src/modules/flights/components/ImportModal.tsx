import React, { useState } from 'react'
import type { ImportPreview, MonitorSummary } from '../../../../shared/flights'
import { formatMoney } from '../../../../shared/flights'
import { errMsg } from '../store/flightStore'
import { Modal } from './Modal'
import { fmtLocal } from './ui'

const EXAMPLE = `[{"origin":"BKK","destination":"SSA","depart":"2026-12-12T08:05","arrive":"2026-12-13T06:40","price":5230.90,"currency":"BRL","stops":2,"carrier":"QR","flight":"833","checked_bags":1,"link":"https://…","link_kind":"search","source":"Alerta do site X","observed_at":"2026-11-10"}]`

/**
 * Importação de resultados reais de fontes legítimas. Modos:
 *  estruturado — JSON/CSV (inclusive a saída da busca assistida com Claude + Chrome);
 *  texto (IA)  — e-mail/alerta colado; a IA só estrutura, o servidor valida.
 */
export function ImportModal(props: { m: MonitorSummary; onClose: () => void; onDone: () => void; initialText?: string; initialMode?: 'structured' | 'ai' }): React.ReactElement {
  const [mode, setMode] = useState<'structured' | 'ai'>(props.initialMode ?? 'structured')
  const [assisted, setAssisted] = useState(false)
  const [text, setText] = useState(props.initialText ?? '')
  const [source, setSource] = useState('')
  const [observed, setObserved] = useState('')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState('')

  async function doPreview(): Promise<void> {
    setBusy(true)
    setErr('')
    setDone('')
    try {
      setPreview(await window.api.flightMon.importPreview(props.m.id, text, mode, source, observed || undefined, assisted))
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setBusy(false)
    }
  }
  async function commit(): Promise<void> {
    setBusy(true)
    try {
      const r = await window.api.flightMon.importCommit(props.m.id, text, mode, source, observed || undefined, assisted)
      setDone(`${r.imported} oferta(s) gravada(s) (${r.created} nova(s)).`)
      setPreview(null)
      setText('')
      props.onDone()
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title="Importar resultados"
      onClose={props.onClose}
      footer={
        <>
          <span className="fm-grow fm-small">Fica marcado como "{assisted ? 'Busca assistida' : 'Importado'}", com a fonte e a data da observação. Nada vira "ao vivo".</span>
          <button className="btn btn-secondary btn-sm" onClick={doPreview} disabled={busy || !text.trim()} type="button">
            {busy && !preview ? 'Lendo…' : 'Pré-visualizar'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={commit} disabled={busy || !preview?.offers.length} type="button">
            Gravar {preview?.offers.length ?? ''}
          </button>
        </>
      }
    >
      <div className="fm-row" style={{ marginBottom: 8 }}>
        <div className="fm-seg">
          <button className={mode === 'structured' ? 'active' : ''} onClick={() => setMode('structured')} type="button">
            JSON / CSV
          </button>
          <button className={mode === 'ai' ? 'active' : ''} onClick={() => setMode('ai')} type="button">
            Texto de alerta/e-mail (IA)
          </button>
        </div>
        <label className="fm-check fm-small">
          <input type="checkbox" checked={assisted} onChange={(e) => setAssisted(e.target.checked)} /> veio da busca assistida
        </label>
      </div>
      {mode === 'structured' && (
        <div className="fm-cols" style={{ marginBottom: 8 }}>
          <label className="fm-field">
            <span className="fm-label">Fonte (se não vier no arquivo)</span>
            <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="ex.: alerta da cia X" />
          </label>
          <label className="fm-field">
            <span className="fm-label">Data da observação (se não vier)</span>
            <input type="date" value={observed} onChange={(e) => setObserved(e.target.value)} />
          </label>
        </div>
      )}
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setPreview(null)
        }}
        rows={8}
        style={{ width: '100%' }}
        className="fm-mono"
        placeholder={mode === 'structured' ? EXAMPLE : 'Cole aqui o texto do alerta de preço / e-mail. A IA extrai só o que estiver escrito; o resto fica como desconhecido.'}
      />
      {mode === 'structured' && (
        <div className="fm-small">
          CSV: cabeçalho com origin,destination,depart,arrive,price,currency,stops,carrier,flight,checked_bags,carry_on,link,source,observed_at. Formato completo em docs/passagens.md.
        </div>
      )}
      {err && <div className="fm-error">{err}</div>}
      {done && <div className="fm-ok">{done}</div>}
      {preview && (
        <div style={{ marginTop: 8 }}>
          {preview.errors.length > 0 && (
            <div className="fm-note warn" style={{ marginBottom: 6 }}>
              <ul>
                {preview.errors.slice(0, 12).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="fm-table-wrap">
            <table className="fm-table" style={{ minWidth: 600 }}>
              <thead>
                <tr>
                  <th>Rota</th>
                  <th>Partida</th>
                  <th>Preço</th>
                  <th>Conex.</th>
                  <th>Mala</th>
                  <th>Fonte</th>
                </tr>
              </thead>
              <tbody>
                {preview.offers.map((o, i) => (
                  <tr key={i}>
                    <td>
                      {o.slices[0].from} → {o.slices[0].to}
                      {o.slices[1] ? ' (ida e volta)' : ''}
                    </td>
                    <td>{fmtLocal(o.slices[0].departLocal)}</td>
                    <td>{formatMoney(o.price)}</td>
                    <td>{o.slices[0].stops}</td>
                    <td>{o.baggage.checked ?? '?'}</td>
                    <td>
                      {o.sourceLabel} · {o.observedAt.slice(0, 10)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!preview.offers.length && <div className="fm-muted">Nenhuma oferta válida.</div>}
        </div>
      )}
    </Modal>
  )
}
