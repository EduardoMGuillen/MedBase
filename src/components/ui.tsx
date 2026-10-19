import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { initials, STATUS } from '../lib/format'
import type { ApptStatus } from '../lib/types'

export function Avatar({ name, color, size }: { name: string; color: string; size?: number }) {
  return (
    <span className="avatar" style={{ background: color, ...(size ? { width: size, height: size } : {}) }} aria-hidden="true">
      {initials(name)}
    </span>
  )
}

export function StatusBadge({ status }: { status: ApptStatus }) {
  const s = STATUS[status]
  return <span className={`badge badge--${s.tone}`}>{s.label}</span>
}

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal__head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2800)
    return () => clearTimeout(t)
  }, [onDone])
  return <div className="toast" role="status">{message}</div>
}

export function PageHead({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="page-head__actions">{actions}</div>}
    </div>
  )
}
