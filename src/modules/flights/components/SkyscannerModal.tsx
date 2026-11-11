import React, { useEffect, useState } from 'react'
import type { MonitorSummary } from '../../../../shared/flights'
import { openExternal } from '../../../api/createApi'
import type { SkyCombo } from '../api'
import { errMsg } from '../store/flightStore'
import { Modal } from './Modal'

/**
 * Confirma a busca no Skyscanner pelo Chrome: mostra QUAIS combinações o Claude vai abrir
 * (escolhidas pelo plano: datas/pares mais baratos primeiro, sem repetir as das últimas 12 h).
 */
export function SkyscannerModal(props: { m: MonitorSummary; onClose: () => void; onStarted: () => void }): React.ReactElement {
  const [count, setCount] = useState(4)
  const [combos, setCombos] = useState<SkyCombo[] | null>(null)
  const [busy, setBusy] = useState<{ monitorId: number; runId: number } | null>(null)
  const [err, setErr] = useState('')
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    setCombos(null)
    window.api.flightMon
      .skyscannerPreview(props.m.id, count)
      .then((r) => {
        setCombos(r.combos)
        setBusy(r.busy)
      })
      .catch((e) => setErr(errMsg(e)))
  }, [count])

  async function start(): Promise<void> {
    setStarting(true)
    setErr('')
    try {
      await window.api.flightMon.skyscanner(props.m.id, count)
      props.onStarted()
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setStarting(false)
    }
  }

  return (
    <Modal
      title="Buscar no Skyscanner (Claude + Chrome)"
      size="narrow"
      onClose={props.onClose}
      footer={
        <>
          <span className="fm-grow fm-small">O Claude abre uma aba no seu Chrome; acompanhe por lá. Leva alguns minutos.</span>
          <button className="btn btn-primary btn-sm" disabled={starting || !combos?.length || !!busy} onClick={start} type="button">
            {starting ? 'Iniciando…' : `Pesquisar ${combos?.length ?? ''} combinação(ões)`}
          </button>
        </>
      }
    >
      <ol className="fm-small" style={{ margin: '0 0 8px 16px', padding: 0 }}>
        <li>Deixe o Chrome aberto com a extensão <b>Claude in Chrome</b> conectada (o `claude` precisa estar logado num plano pago).</li>
        <li>Se o Skyscanner pedir verificação ("pressione e segure"), o Claude para — resolva você no Chrome e rode de novo.</li>
        <li>Os resultados entram como "Busca assistida", com link para a pesquisa. Escalas lidas na página contam para as restrições de país.</li>
      </ol>
      <div className="fm-row" style={{ marginBottom: 8 }}>
        <span className="fm-muted">Combinações nesta sessão:</span>
        <div className="fm-seg">
          {[2, 4, 6, 8].map((n) => (
            <button key={n} className={count === n ? 'active' : ''} onClick={() => setCount(n)} type="button">
              {n}
            </button>
          ))}
        </div>
      </div>
      <div className="fm-small" style={{ marginBottom: 6 }}>
        Uma sessão só para várias combinações sai mais barato: só abrir a sessão com as ferramentas do Chrome custa ~US$ 0,10–0,20 (equivalente API), mesmo se o Chrome não estiver conectado — confira a extensão antes. O total aparece no plano.
      </div>
      {busy && <div className="fm-note warn">Já há uma busca no Chrome em andamento (uma por vez).</div>}
      {err && <div className="fm-error">{err}</div>}
      {!combos ? (
        <div className="fm-muted">Escolhendo combinações…</div>
      ) : combos.length === 0 ? (
        <div className="fm-note">Tudo já foi consultado no Skyscanner nas últimas 12 h.</div>
      ) : (
        <div className="fm-nearby-list">
          {combos.map((c) => (
            <div className="fm-row" key={c.url} style={{ fontSize: 12, padding: '3px 0' }}>
              <b>
                {c.origin} → {c.destination}
              </b>
              <span>
                {c.depart.slice(8, 10)}/{c.depart.slice(5, 7)}
                {c.ret ? ` · volta ${c.ret.slice(8, 10)}/${c.ret.slice(5, 7)}` : ''}
              </span>
              <span className="fm-spacer" />
              <button className="fm-linkbtn" onClick={() => openExternal(c.url)} type="button" title="Abrir você mesmo">
                abrir ↗
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
