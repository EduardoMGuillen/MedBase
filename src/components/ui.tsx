import { useEffect, useLayoutEffect, useRef, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Link } from 'react-router-dom'
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
/**
 * `steady` (EN4, ronda 10): la ventana no se encoge de golpe cuando cambia su contenido (p. ej. al pasar de una pestaña a
 * otra): guarda el alto mayor que tuvo, sin pasar del máximo de la ventana.
 */
/**
 * Ventana sobre la página. HO1 (ronda 12): con `inline` se dibuja como una sección más de la página (sin fondo oscuro ni
 * Escape), para escribir una nota sin perder de vista el expediente; el pie con los botones queda fijo abajo.
 */
export function Modal({ title, onClose, children, footer, top, wide = false, className = '', steady = false, inline = false }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; top?: ReactNode; wide?: boolean; className?: string; steady?: boolean; inline?: boolean }) {
  useEffect(() => {
    if (inline) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const box = useRef<HTMLDivElement>(null)
  const tallest = useRef(0)
  useLayoutEffect(() => {
    const el = box.current
    if (!steady || !el) return
    const h = Math.min(el.offsetHeight, window.innerHeight * 0.9)
    if (h > tallest.current) { tallest.current = h; el.style.minHeight = `${h}px` }
  })
  // HO1: al abrirse en la página, se lleva a la vista
  useEffect(() => { if (inline) box.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, [inline])
  if (inline) return (
    <section ref={box} className={`panel modal-inline ${className}`} aria-label={title}>
      <div className="modal__head">
        <h2>{title}</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
      </div>
      {top && <div className="modal__top">{top}</div>}
      <div className="modal__body">{children}</div>
      {footer && <div className="modal__foot">{footer}</div>}
    </section>
  )
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} className={`modal ${wide ? 'modal--wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title}>
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
  open: boolean; onToggle: () => void; title: ReactNode; count: number; marked?: number; sub?: ReactNode; level?: 1 | 2 | 3; id?: string
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

/**
 * Cabecera de cada pantalla: volver (opcional), título, subtítulo y acciones a la derecha. ES (ronda 17): también la usan los
 * documentos (receta, constancia, nota, recibo…), que solo llevan «volver» y acciones, y los formularios de anestesia, con
 * «volver» encima del título. `noPrint` la oculta al imprimir.
 */
export function PageHead({ title, sub, actions, tour, back, noPrint }: {
  title?: ReactNode; sub?: ReactNode; actions?: ReactNode; tour?: string; back?: ReactNode; noPrint?: boolean
}) {
  return (
    <div className={`page-head${noPrint ? ' no-print' : ''}`} data-tour={tour}>
      {(back || title || sub) && <div className="page-head__main">
        {back}
        {title && <h1>{title}</h1>}
        {sub && <p>{sub}</p>}
      </div>}
      {actions && <div className="page-head__actions">{actions}</div>}
    </div>
  )
}

/** ES (ronda 17): «volver» de toda la app: botón fantasma con la flecha a la izquierda; con `to` es un enlace. */
export function BackButton({ to, onClick, children }: { to?: string; onClick?: () => void; children: ReactNode }) {
  const body = <><ChevronLeft size={16} />{children}</>
  return to ? <Link className="btn btn--ghost page-head__back" to={to}>{body}</Link>
    : <button type="button" className="btn btn--ghost page-head__back" onClick={onClick}>{body}</button>
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
