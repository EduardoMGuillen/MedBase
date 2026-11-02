import { useEffect, useLayoutEffect, useRef, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { ChevronRight, X } from 'lucide-react'
import { initials, STATUS } from '../lib/format'
import type { ApptStatus } from '../lib/types'
import { useStore } from '../lib/store'

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

/** `top` (NE1, ronda 7): lo que queda fijo bajo el título (p. ej. «Alergias») mientras el cuerpo se desplaza. */
export function Modal({ title, onClose, children, footer, top, wide = false, className = '' }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; top?: ReactNode; wide?: boolean; className?: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal--wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal__head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>
        {top && <div className="modal__top">{top}</div>}
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </div>
  )
}

/**
 * Encabezado de un grupo plegable (MC4, CF4, AD1/RE1 de la ronda 6): flecha, nombre, cuántos tiene y, si aplica, cuántos
 * van marcados. Es un botón: se abre y se cierra con el dedo, con Enter o con Espacio.
 */
export function FoldHead({ open, onToggle, title, count, marked, sub, level = 1, id }: {
  open: boolean; onToggle: () => void; title: ReactNode; count: number; marked?: number; sub?: ReactNode; level?: 1 | 2; id?: string
}) {
  return (
    <button type="button" className={`fold-head fold-head--l${level}${open ? ' is-open' : ''}`} aria-expanded={open} aria-controls={id} onClick={onToggle}>
      <ChevronRight size={16} className="fold-head__chev" aria-hidden="true" />
      <span className="fold-head__title">{title}{sub && <small className="fold-head__sub">{sub}</small>}</span>
      <span className="fold-head__count num">{count}</span>
      {!!marked && <span className="fold-head__marked">{marked} marcado{marked === 1 ? '' : 's'}</span>}
    </button>
  )
}

/**
 * CF1/CF5 (ronda 6): encabezado de una pestaña de Configuración con lista: título, una línea de descripción y, a la derecha,
 * el botón azul de alta («Agregar …»), como en el Catálogo de exámenes. A 390 px el botón va arriba, a todo lo ancho.
 */
export function SectionHead({ title, sub, action }: { title: ReactNode; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="panel__head section-head">
      <div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>
      {action && <div className="section-head__action">{action}</div>}
    </div>
  )
}

/** Aviso global: confirma acciones y muestra errores del servidor. */
export function Toaster() {
  const { toast, clearToast } = useStore()
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(clearToast, toast.tone === 'error' ? 5000 : 2800)
    return () => clearTimeout(t)
  }, [toast, clearToast])
  if (!toast) return null
  return <div className={`toast ${toast.tone === 'error' ? 'toast--error' : ''}`} role={toast.tone === 'error' ? 'alert' : 'status'}>{toast.msg}</div>
}

export function Loading({ label = 'Cargando' }: { label?: string }) {
  return <div className="loading" role="status"><span className="loading__dot" />{label}</div>
}

export function PageHead({ title, sub, actions, tour }: { title: string; sub?: ReactNode; actions?: ReactNode; tour?: string }) {
  return (
    <div className="page-head" data-tour={tour}>
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="page-head__actions">{actions}</div>}
    </div>
  )
}

/**
 * NE2 (ronda 7): área de texto que empieza con unas 4 líneas y crece sola al escribir (también al dictar o restaurar un
 * borrador) hasta un máximo (CSS `.textarea--auto`); pasado el máximo se desplaza por dentro.
 */
export function AutoTextarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [props.value])
  return <textarea ref={ref} rows={4} className={`textarea textarea--auto ${className}`} {...props} />
}
