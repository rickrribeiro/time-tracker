import React, { useEffect } from 'react'

/** Modal do módulo: fecha com Esc e clique fora; rolagem interna; rodapé fixo opcional. */
export function Modal(props: {
  title: React.ReactNode
  onClose: () => void
  size?: 'narrow' | 'wide' | 'normal'
  children: React.ReactNode
  footer?: React.ReactNode
  headExtra?: React.ReactNode
}): React.ReactElement {
  const { onClose } = props
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal fm-modal ${props.size && props.size !== 'normal' ? props.size : ''}`} role="dialog" aria-modal="true">
        <div className="fm-modal-head">
          <h3>{props.title}</h3>
          {props.headExtra}
          <button className="btn btn-secondary btn-sm" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>
        {props.children}
        {props.footer && <div className="fm-modal-foot">{props.footer}</div>}
      </div>
    </div>
  )
}
