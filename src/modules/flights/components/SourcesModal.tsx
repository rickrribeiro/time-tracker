import React, { useEffect, useState } from 'react'
import type { ProviderStatus } from '../../../../shared/flights'
import { openExternal } from '../../../api/createApi'
import { errMsg, useFlightStore } from '../store/flightStore'
import { Modal } from './Modal'

/** Credenciais por provedor (chaves em SENSITIVE_KEYS são criptografadas no servidor). */
const SECRET: Record<string, { key: string; label: string; placeholder: string }> = {
  travelpayouts: { key: 'flights_travelpayouts_token', label: 'Token da API (Travelpayouts)', placeholder: 'token pessoal' },
  duffel: { key: 'flights_duffel_token', label: 'Access token (live)', placeholder: 'duffel_live_…' }
}

const CAPS: [keyof ProviderStatus['capabilities'], string][] = [
  ['livePrices', 'preço ao vivo'],
  ['monthRange', 'mês inteiro por consulta'],
  ['baggage', 'bagagem'],
  ['segments', 'trechos/conexões'],
  ['automated', 'execução automática']
]

function ProviderCard(props: { p: ProviderStatus; values: Record<string, string>; onSaved: () => void }): React.ReactElement {
  const { p } = props
  const sec = SECRET[p.id]
  const [secret, setSecret] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  async function saveSecret(): Promise<void> {
    await window.api.settings.set(sec.key, secret.trim())
    setSecret('')
    setMsg({ ok: true, text: 'Salvo (criptografado).' })
    props.onSaved()
  }
  async function test(): Promise<void> {
    setBusy(true)
    setMsg(null)
    try {
      setMsg({ ok: true, text: await window.api.flightMon.testProvider(p.id) })
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e) })
    } finally {
      setBusy(false)
    }
  }
  async function toggle(on: boolean): Promise<void> {
    await window.api.settings.set(p.id === 'skyscanner_chrome' ? 'flights_chrome_assisted' : `flights_provider_${p.id}_enabled`, on ? '1' : '0')
    props.onSaved()
  }
  const enabled = p.id === 'skyscanner_chrome' ? p.configured : p.enabled
  return (
    <div className="fm-section">
      <div className="fm-section-title">
        <span className={`fm-dot ${p.available ? 'active' : p.configured ? 'needs_config' : 'paused'}`} />
        <span className="fm-grow">{p.label}</span>
        {p.available ? <span className="fm-pill ok">disponível</span> : <span className="fm-pill warn">{p.reason ?? 'indisponível'}</span>}
      </div>
      <div className="fm-row" style={{ gap: 4, marginBottom: 6 }}>
        {CAPS.map(([k, l]) => (
          <span key={k} className={`fm-pill ${p.capabilities[k] ? 'accent' : 'outline'}`}>
            {p.capabilities[k] ? '✓' : '✕'} {l}
          </span>
        ))}
        {p.capabilities.deepLink !== 'none' && <span className="fm-pill outline">link: {p.capabilities.deepLink === 'offer' ? 'oferta' : 'pesquisa'}</span>}
        {p.kind === 'api' && <span className="fm-small">· {p.usedToday} consulta(s) hoje</span>}
      </div>
      <ul className="fm-small" style={{ margin: '0 0 6px 16px', padding: 0 }}>
        {p.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      <div className="fm-row">
        {sec && (
          <>
            <input
              type="password"
              autoComplete="off"
              placeholder={props.values[sec.key] ? '•••••••• (configurado — digite para trocar)' : sec.placeholder}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              className="fm-grow"
              aria-label={sec.label}
            />
            <button className="btn btn-primary btn-sm" disabled={!secret.trim()} onClick={saveSecret} type="button">
              Salvar
            </button>
          </>
        )}
        {(p.kind === 'api' || p.kind === 'assisted') && (
          <label className="fm-check fm-small">
            <input type="checkbox" checked={enabled} onChange={(e) => toggle(e.target.checked)} /> {p.kind === 'assisted' ? 'ativar (opt-in)' : 'habilitado'}
          </label>
        )}
        {sec && (
          <button className="btn btn-secondary btn-sm" onClick={test} disabled={busy || !props.values[sec.key]} type="button">
            {busy ? 'Testando…' : 'Testar conexão'}
          </button>
        )}
        {p.docs.startsWith('http') && (
          <button className="fm-linkbtn" type="button" onClick={() => openExternal(p.docs)}>
            documentação ↗
          </button>
        )}
      </div>
      {msg && <div className={msg.ok ? 'fm-ok' : 'fm-error'}>{msg.text}</div>}
    </div>
  )
}

export function SourcesModal(props: { onClose: () => void }): React.ReactElement {
  const { providers, refreshProviders } = useFlightStore()
  const [values, setValues] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const load = async (): Promise<void> => {
    setValues(await window.api.settings.getAll())
    await refreshProviders()
  }
  useEffect(() => {
    void load()
  }, [])
  const set = (k: string, v: string): void => setValues((x) => ({ ...x, [k]: v }))
  async function saveExec(): Promise<void> {
    for (const k of ['flights_concurrency', 'flights_ai_model', 'flights_chrome_model', 'flights_promo_feeds', 'flights_osrm_url', 'flights_osrm_enabled', 'flights_ground_cost_per_km_minor', 'flights_ground_cost_currency', 'flights_travelpayouts_market'])
      if (values[k] != null) await window.api.settings.set(k, String(values[k]).trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }
  const automated = providers.filter((p) => p.kind === 'api' && p.available)
  return (
    <Modal title="Fontes, execução e IA" onClose={props.onClose}>
      {automated.length === 0 && (
        <div className="fm-note warn" style={{ marginBottom: 10 }}>
          Nenhuma fonte automática configurada. Os monitoramentos podem ser criados e editados normalmente, mas buscas automáticas ficam indisponíveis até você configurar
          uma fonte. A importação de resultados funciona sempre.
        </div>
      )}
      <div className="fm-note" style={{ marginBottom: 10 }}>
        <b>Skyscanner</b> não tem API aberta: aqui ele é pesquisado pelo seu Chrome (Claude Code + extensão), sob demanda e com você acompanhando — é o que pega
        promoções relâmpago. A Aviasales é cache (≤ 48 h) e serve para mapear rotas/datas; os blogs de promoção entram pelo radar de RSS. Google Flights não tem
        API e proíbe coleta automatizada; Amadeus Self-Service foi desativado e o Kiwi fechou cadastros.
      </div>
      {providers.map((p) => (
        <ProviderCard key={p.id} p={p} values={values} onSaved={load} />
      ))}
      <div className="fm-section">
        <div className="fm-section-title">⚙️ Execução e IA</div>
        <div className="fm-cols3">
          <label className="fm-field">
            <span className="fm-label">Buscas simultâneas (monitores)</span>
            <input type="number" min={1} max={4} value={values.flights_concurrency ?? '1'} onChange={(e) => set('flights_concurrency', e.target.value)} />
          </label>
          <label className="fm-field">
            <span className="fm-label">Modelo da IA (passagens)</span>
            <input value={values.flights_ai_model ?? 'haiku'} onChange={(e) => set('flights_ai_model', e.target.value)} placeholder="haiku" />
          </label>
          <label className="fm-field">
            <span className="fm-label">Modelo do Skyscanner/Chrome</span>
            <input value={values.flights_chrome_model ?? 'sonnet'} onChange={(e) => set('flights_chrome_model', e.target.value)} placeholder="sonnet" />
          </label>
          <label className="fm-field">
            <span className="fm-label">Mercado Aviasales</span>
            <input value={values.flights_travelpayouts_market ?? 'br'} onChange={(e) => set('flights_travelpayouts_market', e.target.value)} placeholder="br" />
          </label>
          <label className="fm-field">
            <span className="fm-label">Rotas terrestres (OSRM)</span>
            <select value={values.flights_osrm_enabled ?? '1'} onChange={(e) => set('flights_osrm_enabled', e.target.value)}>
              <option value="1">Ativado (sob demanda, com cache)</option>
              <option value="0">Desativado (só aproximação)</option>
            </select>
          </label>
          <label className="fm-field">
            <span className="fm-label">Servidor OSRM</span>
            <input value={values.flights_osrm_url ?? ''} onChange={(e) => set('flights_osrm_url', e.target.value)} placeholder="https://router.project-osrm.org" />
          </label>
          <label className="fm-field">
            <span className="fm-label">Custo terrestre estimado por km</span>
            <span className="fm-row" style={{ flexWrap: 'nowrap' }}>
              <input
                type="number"
                min={0}
                step="0.01"
                placeholder="desconhecido"
                value={values.flights_ground_cost_per_km_minor ? Number(values.flights_ground_cost_per_km_minor) / 100 : ''}
                onChange={(e) => set('flights_ground_cost_per_km_minor', e.target.value === '' ? '' : String(Math.round(Number(e.target.value) * 100)))}
              />
              <input value={values.flights_ground_cost_currency ?? 'BRL'} onChange={(e) => set('flights_ground_cost_currency', e.target.value.toUpperCase())} style={{ width: 64 }} maxLength={3} />
            </span>
          </label>
        </div>
        <label className="fm-field" style={{ marginTop: 8 }}>
          <span className="fm-label">Feeds RSS de promoções (um por linha; vazio = padrão)</span>
          <textarea
            rows={3}
            className="fm-mono"
            value={values.flights_promo_feeds ?? ''}
            placeholder={'https://www.melhoresdestinos.com.br/feed\nhttps://passageirodeprimeira.com/feed/'}
            onChange={(e) => set('flights_promo_feeds', e.target.value)}
          />
        </label>
        <div className="fm-small" style={{ marginTop: 6 }}>
          Consumo de IA aparece em Configurações → uso de IA (fonte "passagens"). Câmbio para comparar moedas: Configurações → Finanças (sem taxa, a conversão fica "desconhecida",
          nunca 1:1).
        </div>
        <div className="fm-row" style={{ marginTop: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={saveExec} type="button">
            Salvar execução
          </button>
          {saved && <span className="fm-ok">Salvo ✓</span>}
        </div>
      </div>
    </Modal>
  )
}
