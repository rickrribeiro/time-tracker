import React, { useEffect, useState } from 'react'
import { DEFAULT_KNOWLEDGE } from '../constants'

export function KnowledgePage(): React.ReactElement {
  const [text, setText] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.api.settings.get('knowledge_base').then((v) => {
      setText(v && v.trim() ? v : DEFAULT_KNOWLEDGE)
      setLoaded(true)
    })
  }, [])

  async function save(): Promise<void> {
    await window.api.settings.set('knowledge_base', text)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>📚 Base de Conhecimento</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Contexto pessoal usado pela IA e pelas recomendações de viagem. Markdown livre; linhas
            começando com <code>-</code> viram tópicos de perfil.
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={!loaded}>
          {saved ? '✓ Salvo' : 'Salvar'}
        </button>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={!loaded}
        spellCheck={false}
        style={{ width: '100%', minHeight: 380, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
      />
    </div>
  )
}
