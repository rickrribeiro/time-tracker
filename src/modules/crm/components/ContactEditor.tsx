import React, { useRef, useState } from 'react'
import { Contact } from '../../../types'
import { useContactStore } from '../store/contactStore'
import { COUNTRIES, BRAZIL_STATES, BRAZIL, norm } from '../geo'

/** Campo de país com busca por texto (sem acentos): digita, filtra a lista e escolhe. */
function CountryPicker({ value, onChange }: { value: string; onChange: (v: string) => void }): React.ReactElement {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const q = norm(query.trim())
  // com o país já escolhido no campo, mostra a lista inteira; senão, filtra (prefixo primeiro)
  const showAll = !q || query === value
  const options = showAll
    ? COUNTRIES
    : [...COUNTRIES.filter((c) => norm(c).startsWith(q)), ...COUNTRIES.filter((c) => !norm(c).startsWith(q) && norm(c).includes(q))]

  function pick(c: string): void {
    onChange(c)
    setQuery(c)
    setOpen(false)
  }

  function onBlur(): void {
    setOpen(false)
    // texto que não é um país: volta para o valor atual (ou limpa, se apagou tudo)
    if (!query.trim()) { if (value) onChange(''); return }
    const exact = COUNTRIES.find((c) => norm(c) === q)
    if (exact) pick(exact)
    else setQuery(value)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setOpen(true)
      const next = Math.max(0, Math.min(options.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1)))
      setActive(next)
      listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'Enter' && open && options[active]) {
      e.preventDefault()
      pick(options[active])
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation()
      setOpen(false)
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={query}
        placeholder="Digite para buscar…"
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0) }}
        onFocus={(e) => { e.target.select(); setOpen(true); setActive(Math.max(0, COUNTRIES.indexOf(value))) }}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
      />
      {open && (
        <div
          ref={listRef}
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 2,
            maxHeight: 220, overflowY: 'auto', background: 'var(--bg-secondary)',
            border: '1px solid var(--border)', borderRadius: 6, boxShadow: '0 6px 18px rgba(0,0,0,0.25)'
          }}
        >
          {options.length === 0 && <div style={{ padding: '6px 10px', fontSize: 13, color: 'var(--text-secondary)' }}>Nenhum país encontrado</div>}
          {options.map((c, i) => (
            <div
              key={c}
              // mousedown (não click) para escolher antes do blur do input
              onMouseDown={(e) => { e.preventDefault(); pick(c) }}
              onMouseEnter={() => setActive(i)}
              style={{
                padding: '6px 10px', fontSize: 13, cursor: 'pointer',
                background: i === active ? 'var(--bg-tertiary)' : undefined,
                color: c === value ? 'var(--accent)' : 'var(--text-primary)'
              }}
            >
              {c}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Create (contact=null) or edit a personal-CRM contact. */
export function ContactEditor({ contact, onClose }: { contact: Contact | null; onClose: () => void }): React.ReactElement {
  const { create, update } = useContactStore()
  const [name, setName] = useState(contact?.name ?? '')
  const [location, setLocation] = useState(contact?.location ?? '')
  const [country, setCountry] = useState(contact?.country ?? '')
  const [state, setState] = useState(contact?.state ?? '')
  const [birthday, setBirthday] = useState(contact?.birthday ?? '')
  const [interests, setInterests] = useState(contact?.interests ?? '')
  const [context, setContext] = useState(contact?.context ?? '')
  const [nextFollowUp, setNextFollowUp] = useState(contact?.nextFollowUp ?? '')
  const [priority, setPriority] = useState<'alta' | 'normal' | 'baixa'>(contact?.priority ?? 'normal')
  const [vip, setVip] = useState(!!contact?.vip)

  const isBrazil = country === BRAZIL

  function onCountryChange(value: string): void {
    setCountry(value)
    if (value !== BRAZIL) setState('') // limpa a UF se não for mais Brasil
  }

  async function save(): Promise<void> {
    if (!name.trim()) return
    const fields = {
      name: name.trim(),
      location: location.trim() || null,
      country: country || null,
      state: state.trim() || null,
      birthday: birthday.trim() || null,
      interests: interests.trim() || null,
      context: context.trim() || null,
      nextFollowUp: nextFollowUp || null
    }
    let id = contact?.id
    if (contact) await update({ ...contact, ...fields })
    else id = (await create(fields)).id
    // prioridade/VIP alimentam a priorização da Central de Mensagens e o radar
    if (id && (priority !== (contact?.priority ?? 'normal') || vip !== !!contact?.vip)) {
      await window.api.chats.setContactPriority(id, priority, vip)
      await useContactStore.getState().refresh()
    }
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: 420, maxWidth: 560 }}>
        <h2>{contact ? 'Editar contato' : 'Nova pessoa'}</h2>
        <div className="editor-row">
          <div className="editor-field">
            <label>Nome</label>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="editor-field">
            <label>Cidade</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="ex: Lisboa" />
          </div>
        </div>
        <div className="editor-row">
          <div className="editor-field">
            <label>País</label>
            <CountryPicker value={country} onChange={onCountryChange} />
          </div>
          <div className="editor-field">
            <label>Estado {isBrazil ? '(UF)' : ''}</label>
            {isBrazil ? (
              <select value={state} onChange={(e) => setState(e.target.value)}>
                <option value="">— Selecione —</option>
                {BRAZIL_STATES.map((s) => (
                  <option key={s.uf} value={s.uf}>{s.uf} — {s.name}</option>
                ))}
              </select>
            ) : (
              <input value={state} onChange={(e) => setState(e.target.value)} placeholder="ex: Califórnia" />
            )}
          </div>
        </div>
        <div className="editor-row">
          <div className="editor-field">
            <label>Aniversário</label>
            <input value={birthday} onChange={(e) => setBirthday(e.target.value)} placeholder="MM-DD ou AAAA-MM-DD" />
          </div>
          <div className="editor-field">
            <label>Próximo follow-up</label>
            <input type="date" value={nextFollowUp} onChange={(e) => setNextFollowUp(e.target.value)} />
          </div>
        </div>
        <div className="editor-row">
          <div className="editor-field">
            <label>Prioridade do relacionamento</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value as 'alta' | 'normal' | 'baixa')}>
              <option value="alta">Alta</option>
              <option value="normal">Normal</option>
              <option value="baixa">Baixa</option>
            </select>
          </div>
          <div className="editor-field" style={{ justifyContent: 'flex-end' }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', textTransform: 'none', letterSpacing: 0, fontSize: 13, color: 'var(--text-primary)' }}>
              <input type="checkbox" checked={vip} onChange={(e) => setVip(e.target.checked)} style={{ width: 'auto' }} /> ⭐ VIP (não deixar esquecer)
            </label>
          </div>
        </div>
        <div className="editor-field">
          <label>Interesses</label>
          <input value={interests} onChange={(e) => setInterests(e.target.value)} placeholder="ex: escalada, vinho natural, IA" />
        </div>
        <div className="editor-field">
          <label>Contexto (o que está rolando na vida dela)</label>
          <textarea rows={4} value={context} onChange={(e) => setContext(e.target.value)} placeholder="ex: faria um exame semana passada; mudou de emprego; procurando apê em Berlim…" />
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary btn-sm" onClick={save}>Salvar</button>
        </div>
      </div>
    </div>
  )
}
