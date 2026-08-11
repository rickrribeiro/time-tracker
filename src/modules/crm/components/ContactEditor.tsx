import React, { useState } from 'react'
import { Contact } from '../../../types'
import { useContactStore } from '../store/contactStore'

/** Create (contact=null) or edit a personal-CRM contact. */
export function ContactEditor({ contact, onClose }: { contact: Contact | null; onClose: () => void }): React.ReactElement {
  const { create, update } = useContactStore()
  const [name, setName] = useState(contact?.name ?? '')
  const [location, setLocation] = useState(contact?.location ?? '')
  const [birthday, setBirthday] = useState(contact?.birthday ?? '')
  const [interests, setInterests] = useState(contact?.interests ?? '')
  const [context, setContext] = useState(contact?.context ?? '')
  const [nextFollowUp, setNextFollowUp] = useState(contact?.nextFollowUp ?? '')

  async function save(): Promise<void> {
    if (!name.trim()) return
    const fields = {
      name: name.trim(),
      location: location.trim() || null,
      birthday: birthday.trim() || null,
      interests: interests.trim() || null,
      context: context.trim() || null,
      nextFollowUp: nextFollowUp || null
    }
    if (contact) await update({ ...contact, ...fields })
    else await create(fields)
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
            <label>Cidade / país</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="ex: Lisboa, PT" />
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
