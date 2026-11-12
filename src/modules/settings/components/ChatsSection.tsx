import React, { useEffect, useState } from 'react'
import type { ChatAccount, ChatsConfig, ChatsStatus, ChatTemplate } from '../../../../shared/chats'
import { networkInfo, PROVIDERS_INFO } from '../../../../shared/chats'
import type { AgentDetails } from '../../chats/api'
import { StatusBadge } from '../../chats/components/StatusBadge'
import '../../chats/chats.css'

const INTERVALS = [
  { v: 60, l: '1 min' },
  { v: 120, l: '2 min' },
  { v: 300, l: '5 min' },
  { v: 900, l: '15 min' },
  { v: 3600, l: '1 h' }
]

const ALERTS: { id: string; label: string }[] = [
  { id: 'vip_waiting', label: 'Pessoas importantes esperando resposta' },
  { id: 'mentions', label: 'Menções em grupos' },
  { id: 'reminder_due', label: 'Lembretes vencidos' },
  { id: 'professional', label: 'Pendências profissionais' },
  { id: 'forgotten', label: 'Conversas esquecidas (+7 dias)' },
  { id: 'old_unread', label: 'Não lidas antigas' },
  { id: 'no_contact', label: 'Pessoas importantes sem contato recente' },
  { id: 'reopened', label: 'Adiadas com mensagem nova' }
]

/** Configurações → Integrações → Mensagens (Central de Mensagens). */
export function ChatsSection(): React.ReactElement {
  const [cfg, setCfg] = useState<ChatsConfig | null>(null)
  const [agent, setAgent] = useState<AgentDetails | null>(null)
  const [status, setStatus] = useState<ChatsStatus | null>(null)
  const [accounts, setAccounts] = useState<ChatAccount[]>([])
  const [token, setToken] = useState('')
  const [url, setUrl] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [agentKey, setAgentKey] = useState<string | null>(null)
  const [templatesOpen, setTemplatesOpen] = useState(false)

  async function load(): Promise<void> {
    const r = await window.api.chats.config()
    setCfg(r.config)
    setAgent(r.agent)
    setUrl(r.config.beeperUrl)
    setStatus(await window.api.chats.status())
    setAccounts(await window.api.chats.accounts().catch(() => []))
  }

  useEffect(() => {
    void load()
    const off1 = window.api.chats.onStatus((s) => setStatus(s))
    const off2 = window.api.chats.onUpdated(() => {
      window.api.chats.accounts().then(setAccounts).catch(() => undefined)
    })
    const t = setInterval(() => window.api.chats.agentStatus().then(setAgent).catch(() => undefined), 15000)
    return () => {
      off1()
      off2()
      clearInterval(t)
    }
  }, [])

  async function save(patch: Parameters<typeof window.api.chats.saveConfig>[0], okText?: string): Promise<void> {
    setBusy(true)
    setMsg(null)
    try {
      const r = await window.api.chats.saveConfig(patch)
      setCfg(r.config)
      setStatus(r.status)
      if (okText) setMsg({ ok: true, text: okText })
      setAccounts(await window.api.chats.accounts().catch(() => []))
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  async function test(): Promise<void> {
    setBusy(true)
    setMsg(null)
    try {
      const r = await window.api.chats.test()
      setMsg({ ok: r.ok, text: r.message })
      if (r.ok) {
        await window.api.chats.syncNow().catch(() => undefined)
        setAccounts(await window.api.chats.accounts())
      }
    } finally {
      setBusy(false)
    }
  }

  async function sync(full = false): Promise<void> {
    setBusy(true)
    setMsg(null)
    try {
      setStatus(await window.api.chats.syncNow(full))
      setAccounts(await window.api.chats.accounts())
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  async function toggleAccount(a: ChatAccount): Promise<void> {
    await window.api.chats.setAccountSync(a.key, !a.syncEnabled)
    setAccounts(await window.api.chats.accounts())
  }

  async function genAgentKey(): Promise<void> {
    if (cfg?.hasAgentKey && !window.confirm('Gerar uma chave nova invalida a anterior (o agente atual para de funcionar). Continuar?')) return
    const r = await window.api.chats.agentKey()
    setAgentKey(r.key)
    await load()
  }

  async function clearCache(): Promise<void> {
    if (!window.confirm('Limpar o cache local de conversas? Pessoas, tags, lembretes e demais organização são preservados.')) return
    const r = await window.api.chats.clearCache()
    setMsg({ ok: true, text: `Cache limpo: ${r.removed} conversa(s) removida(s), ${r.kept} mantida(s) por terem organização.` })
    setAccounts(await window.api.chats.accounts())
  }

  async function disconnect(): Promise<void> {
    if (!window.confirm('Desconectar? O token é apagado e a sincronização para. Pessoas, tags, lembretes e notas continuam salvos.')) return
    setStatus(await window.api.chats.disconnect())
    setToken('')
    await load()
  }

  if (!cfg) return <div className="chart-section" style={{ maxWidth: 560, marginTop: 16 }}><div className="chart-title">💬 Mensagens</div></div>

  const isBeeper = cfg.providerId === 'beeper'
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <div className="chart-section" style={{ maxWidth: 560, marginTop: 16 }}>
      <div className="chart-title" style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span>💬 Mensagens (Central de Mensagens)</span>
        {status && <StatusBadge status={status} />}
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 10px' }}>
        Junta WhatsApp, Instagram, LinkedIn e outras redes num só lugar para triagem, lembretes e respostas com IA. O
        conteúdo das mensagens não é gravado no banco: só metadados e uma prévia curta (opcional).
      </p>

      <label className="chats-switch">
        <input type="checkbox" checked={cfg.enabled} disabled={busy} onChange={(e) => void save({ enabled: e.target.checked })} />
        <span>Ativar a Central de Mensagens</span>
      </label>

      <div className="editor-field">
        <label>Provedor</label>
        <select value={cfg.providerId} onChange={(e) => void save({ providerId: e.target.value })} disabled={busy}>
          {PROVIDERS_INFO.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </div>
      {cfg.providerId === 'mock' && (
        <div className="chats-demo-banner" style={{ marginTop: 8 }}>
          ⚠️ Modo demonstração: conversas e pessoas são <strong>fictícias</strong>, só para conhecer a interface. Nada é enviado de verdade.
        </div>
      )}

      {isBeeper && (
        <>
          <div className="editor-field">
            <label>Conexão com o Beeper</label>
            <div className="seg-toggle">
              <button className={`seg-btn ${cfg.beeperMode === 'direct' ? 'active' : ''}`} onClick={() => void save({ beeperMode: 'direct' })}>
                Direta (mesma máquina/rede)
              </button>
              <button className={`seg-btn ${cfg.beeperMode === 'agent' ? 'active' : ''}`} onClick={() => void save({ beeperMode: 'agent' })}>
                Agente local (rickOS remoto)
              </button>
            </div>
          </div>

          {cfg.beeperMode === 'direct' ? (
            <>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0 0' }}>
                No Beeper Desktop: <strong>Settings → Integrations</strong>, ative a Desktop API e crie um token em
                “Approved connections” (+). Use quando o servidor do rickOS roda na mesma máquina do Beeper, ou numa rede
                privada/Tailscale que alcance o Mac.
              </p>
              <div className="editor-field">
                <label>Endpoint da Desktop API</label>
                <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://127.0.0.1:23373" />
              </div>
              <div className="editor-field">
                <label>Token {cfg.hasBeeperToken && <span style={{ color: 'var(--success)', textTransform: 'none' }}>· salvo</span>}</label>
                <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={cfg.hasBeeperToken ? '•••••• (deixe em branco para manter)' : 'cole o token do Beeper'} autoComplete="off" />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={busy}
                  onClick={() => void save({ beeperUrl: url, ...(token ? { beeperToken: token } : {}) }, 'Configuração salva.').then(() => setToken(''))}
                >
                  Salvar
                </button>
                <button className="btn btn-secondary btn-sm" disabled={busy || !cfg.enabled} onClick={() => void test()}>Testar conexão</button>
              </div>
            </>
          ) : (
            <>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0 0' }}>
                Para quando o rickOS roda num servidor e o Beeper no seu Mac. O agente roda no Mac, conversa com o Beeper
                localmente e abre só uma conexão de <strong>saída</strong> autenticada até o rickOS. A API do Beeper não fica
                exposta e o token dele nunca sai do Mac.
              </p>
              <div className="chats-agent-box">
                <div>
                  Agente: {agent?.online ? <strong style={{ color: 'var(--success)' }}>● online</strong> : <strong style={{ color: 'var(--text-muted)' }}>○ offline</strong>}
                  {agent?.lastSeen && <span style={{ color: 'var(--text-muted)' }}> · visto {new Date(agent.lastSeen).toLocaleString('pt-BR')}</span>}
                  {agent?.beeper && <span style={{ color: 'var(--text-muted)' }}> · Beeper {agent.beeper}</span>}
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => void genAgentKey()}>{cfg.hasAgentKey ? 'Gerar nova chave' : 'Gerar chave do agente'}</button>
              </div>
              {agentKey && (
                <div className="chats-code">
                  <div style={{ fontSize: 11, color: 'var(--warning)', marginBottom: 4 }}>Copie agora: a chave não será mostrada de novo.</div>
                  <code>
                    RICKOS_URL={origin} \<br />
                    RICKOS_TOKEN=&lt;token do rickOS, se houver&gt; \<br />
                    RICKOS_AGENT_KEY={agentKey} \<br />
                    BEEPER_TOKEN=&lt;token do Beeper&gt; \<br />
                    node bin/rickos-chat-agent.mjs
                  </code>
                  <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={() => navigator.clipboard?.writeText(agentKey)}>Copiar chave</button>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="btn btn-secondary btn-sm" disabled={busy || !cfg.enabled} onClick={() => void test()}>Testar conexão</button>
              </div>
            </>
          )}
        </>
      )}
      {cfg.providerId === 'mock' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button className="btn btn-secondary btn-sm" disabled={busy || !cfg.enabled} onClick={() => void test()}>Testar conexão</button>
        </div>
      )}

      {msg && <div className={`chats-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}

      {status && cfg.enabled && (
        <div className="chats-status-line">
          {status.lastSyncAt ? `Última sincronização: ${new Date(status.lastSyncAt).toLocaleString('pt-BR')}` : 'Ainda não sincronizado'}
          {' · '}Tempo real: {status.realtime === 'on' ? 'ativo' : status.realtime === 'connecting' ? 'conectando…' : status.realtime === 'unsupported' ? 'indisponível (polling)' : 'desligado (polling)'}
          {status.progress && ` · ${status.progress.done} conversas lidas…`}
          {status.lastError && <div style={{ color: 'var(--danger)' }}>Erro: {status.lastError}</div>}
          {status.message && !status.lastError && <div>{status.message}</div>}
        </div>
      )}

      {cfg.enabled && accounts.length > 0 && (
        <div className="editor-field">
          <label>Contas a sincronizar</label>
          <div className="chats-accounts">
            {accounts.map((a) => (
              <label key={a.key} className="chats-account">
                <input type="checkbox" checked={a.syncEnabled} onChange={() => void toggleAccount(a)} />
                <span>{networkInfo(a.network).icon}</span>
                <span className="chats-account-name">{a.displayName}</span>
                <span className="chats-account-meta">{a.chatCount} conversas · {a.status === 'removed' ? 'removida do provedor (conversas inativas)' : a.status}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {cfg.enabled && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void sync(false)}>↻ Sincronizar agora</button>
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void sync(true)} title="Relê todas as conversas até o limite inicial">Sincronização completa</button>
        </div>
      )}

      <details className="chats-details">
        <summary>Sincronização e armazenamento</summary>
        <label className="chats-switch">
          <input type="checkbox" checked={cfg.syncAuto} onChange={(e) => void save({ syncAuto: e.target.checked })} />
          <span>Sincronizar automaticamente</span>
        </label>
        <label className="chats-switch">
          <input type="checkbox" checked={cfg.realtime} onChange={(e) => void save({ realtime: e.target.checked })} />
          <span>Eventos em tempo real (WebSocket experimental do Beeper; polling como reserva)</span>
        </label>
        <div className="editor-row">
          <div className="editor-field">
            <label>Polling a cada</label>
            <select value={cfg.syncIntervalSec} onChange={(e) => void save({ syncIntervalSec: Number(e.target.value) })}>
              {INTERVALS.map((i) => (
                <option key={i.v} value={i.v}>{i.l}</option>
              ))}
            </select>
          </div>
          <div className="editor-field">
            <label>Máx. conversas na 1ª carga</label>
            <input type="number" min={50} max={20000} defaultValue={cfg.initialLimit} onBlur={(e) => void save({ initialLimit: Number(e.target.value) })} />
          </div>
        </div>
        <label className="chats-switch">
          <input type="checkbox" checked={cfg.storePreviews} onChange={(e) => void save({ storePreviews: e.target.checked })} />
          <span>Guardar prévia curta da última mensagem (para a lista funcionar offline)</span>
        </label>
        <label className="chats-switch">
          <input type="checkbox" checked={cfg.markReadOnOpen} onChange={(e) => void save({ markReadOnOpen: e.target.checked })} />
          <span>Marcar como lida ao abrir a conversa (desligado = só pelo botão)</span>
        </label>
        <div className="editor-field">
          <label>Retenção do cache (dias sem atividade; 0 = sem limite)</label>
          <input type="number" min={0} max={3650} defaultValue={cfg.retentionDays} onBlur={(e) => void save({ retentionDays: Number(e.target.value) })} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => void clearCache()}>Limpar cache local</button>
          {isBeeper && cfg.hasBeeperToken && <button className="btn btn-danger btn-sm" onClick={() => void disconnect()}>Desconectar provedor</button>}
        </div>
      </details>

      <details className="chats-details">
        <summary>IA (sugestões e resumos)</summary>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0' }}>
          Só as mensagens que você selecionar são enviadas ao Claude, que roda sem ferramentas. Nenhuma resposta é enviada
          sem a sua confirmação.
        </p>
        <div className="editor-field">
          <label>Modelo (vazio = padrão do CLI)</label>
          <input defaultValue={cfg.aiModel} placeholder="sonnet" onBlur={(e) => void save({ aiModel: e.target.value })} />
        </div>
        <div className="editor-field">
          <label>Como você escreve (instruções gerais de estilo)</label>
          <textarea
            rows={3}
            defaultValue={cfg.aiStyleInstructions}
            placeholder="Ex.: escrevo curto, sem ponto final, uso 'vc' e 'tb' com amigos; com recrutadores sou cordial e objetivo."
            onBlur={(e) => void save({ aiStyleInstructions: e.target.value })}
          />
        </div>
        <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => setTemplatesOpen(true)}>⚡ Respostas rápidas</button>
      </details>

      <details className="chats-details">
        <summary>Radar, Home e notificações</summary>
        <label className="chats-switch">
          <input type="checkbox" checked={cfg.homeWidget} onChange={(e) => void save({ homeWidget: e.target.checked })} />
          <span>Mostrar o widget “Central de Mensagens” na Home</span>
        </label>
        <div className="editor-field">
          <label>Alertas que aparecem na Home</label>
          <div className="chats-accounts">
            {ALERTS.map((a) => (
              <label key={a.id} className="chats-account">
                <input
                  type="checkbox"
                  checked={cfg.homeAlerts.includes(a.id)}
                  onChange={(e) => void save({ homeAlerts: e.target.checked ? [...cfg.homeAlerts, a.id] : cfg.homeAlerts.filter((x) => x !== a.id) })}
                />
                <span>{a.label}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="editor-field">
          <label>Notificações</label>
          <label className="chats-switch">
            <input type="checkbox" checked={cfg.notifyReminders} onChange={(e) => void save({ notifyReminders: e.target.checked })} />
            <span>Lembretes de responder</span>
          </label>
          <label className="chats-switch">
            <input type="checkbox" checked={cfg.notifyVipWaiting} onChange={(e) => void save({ notifyVipWaiting: e.target.checked })} />
            <span>Mensagem de pessoa importante (VIP / prioridade alta)</span>
          </label>
          <label className="chats-switch">
            <input type="checkbox" checked={cfg.notifyMentions} onChange={(e) => void save({ notifyMentions: e.target.checked })} />
            <span>Menções em grupos</span>
          </label>
        </div>
        <div className="editor-row">
          <div className="editor-field">
            <label>Revisão diária (conversas)</label>
            <input type="number" min={1} max={50} defaultValue={cfg.dailyReviewSize} onBlur={(e) => void save({ dailyReviewSize: Number(e.target.value) })} />
          </div>
          <div className="editor-field">
            <label>“Sem contato” após (dias)</label>
            <input type="number" min={7} max={365} defaultValue={cfg.noContactDays} onBlur={(e) => void save({ noContactDays: Number(e.target.value) })} />
          </div>
        </div>
        <div className="editor-field">
          <label>Tags profissionais (priorizam e entram no radar)</label>
          <input defaultValue={cfg.professionalLabels.join(', ')} onBlur={(e) => void save({ professionalLabels: e.target.value.split(',') })} />
        </div>
        <div className="editor-field">
          <label>Pesos da prioridade</label>
          <div className="chats-weights">
            {(Object.keys(cfg.priorityWeights) as (keyof ChatsConfig['priorityWeights'])[]).map((k) => (
              <label key={k}>
                <span>{WEIGHT_LABELS[k]}</span>
                <input type="number" defaultValue={cfg.priorityWeights[k]} onBlur={(e) => void save({ priorityWeights: { ...cfg.priorityWeights, [k]: Number(e.target.value) } })} />
              </label>
            ))}
          </div>
        </div>
      </details>

      {templatesOpen && <TemplatesModal onClose={() => setTemplatesOpen(false)} />}
    </div>
  )
}

const WEIGHT_LABELS: Record<keyof ChatsConfig['priorityWeights'], string> = {
  mention: 'Menção a mim',
  vip: 'Pessoa VIP/alta',
  manualHigh: 'Conversa prioridade alta',
  manualLow: 'Conversa prioridade baixa',
  question: 'Pergunta pendente',
  professional: 'Tag profissional',
  recency: 'Recência',
  agePerDay: 'Por dia esperando',
  bigGroupPenalty: 'Grupo grande (penalidade)',
  mutedPenalty: 'Silenciada (penalidade)'
}

export function TemplatesModal({ onClose }: { onClose: () => void }): React.ReactElement {
  const [list, setList] = useState<ChatTemplate[]>([])
  const [editing, setEditing] = useState<{ id: number | null; title: string; body: string } | null>(null)
  const load = (): void => void window.api.chats.templates().then(setList)
  useEffect(load, [])
  async function save(): Promise<void> {
    if (!editing) return
    await window.api.chats.saveTemplate(editing.id, editing.title, editing.body)
    setEditing(null)
    load()
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560, width: '100%' }}>
        <h2>⚡ Respostas rápidas</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Modelos seus para inserir na conversa. A IA pode adaptá-los ao contexto.</p>
        {editing ? (
          <>
            <div className="editor-field">
              <label>Título</label>
              <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Ex.: Recusar vaga com educação" />
            </div>
            <div className="editor-field">
              <label>Texto</label>
              <textarea rows={5} value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => setEditing(null)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" onClick={() => void save()}>Salvar</button>
            </div>
          </>
        ) : (
          <>
            <div className="list-stack" style={{ maxHeight: 320, overflow: 'auto' }}>
              {list.length === 0 && <div className="empty-hint">Nenhum modelo ainda.</div>}
              {list.map((t) => (
                <div key={t.id} className="list-row">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="list-row-title">{t.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.body}</div>
                  </div>
                  <div className="list-row-actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditing({ id: t.id, title: t.title, body: t.body })}>Editar</button>
                    <button className="btn btn-danger btn-sm" onClick={() => window.confirm('Excluir modelo?') && void window.api.chats.deleteTemplate(t.id).then(load)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => setEditing({ id: null, title: '', body: '' })}>＋ Novo modelo</button>
              <button className="btn btn-primary btn-sm" onClick={onClose}>Fechar</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
