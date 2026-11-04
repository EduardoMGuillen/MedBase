import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * GE7 (ronda 11): la fila de pestañas de toda la app. Si las pestañas no caben, la fila se desplaza a lo ancho (rueda del
 * ratón, dedo o teclado), con flechas «‹» y «›» que salen solo cuando hay pestañas ocultas de ese lado y un degradado que
 * indica que hay más. La pestaña activa (aria-selected) siempre queda a la vista: al abrir la página y al cambiar de pestaña
 * la fila se desplaza sola hasta ella. La página nunca gana barra horizontal.
 */
export function TabRow({ children, className = '', label, ...rest }: { children: ReactNode; className?: string; label?: string; 'data-tour'?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })
  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    const left = el.scrollLeft > 1
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    setEdges((e) => (e.left === left && e.right === right ? e : { left, right }))
  }, [])
  // La activa, a la vista (sin mover la página hacia arriba o abajo)
  const showActive = useCallback((smooth: boolean) => {
    const el = ref.current
    const tab = el?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
    if (!el || !tab) return
    const pad = 36
    const l = tab.offsetLeft - el.offsetLeft
    const r = l + tab.offsetWidth
    if (l < el.scrollLeft + pad) el.scrollTo({ left: Math.max(0, l - pad), behavior: smooth ? 'smooth' : 'auto' })
    else if (r > el.scrollLeft + el.clientWidth - pad) el.scrollTo({ left: r - el.clientWidth + pad, behavior: smooth ? 'smooth' : 'auto' })
  }, [])
  useLayoutEffect(() => { showActive(false); measure() }, [showActive, measure])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Solo si cambió el ancho de la ventana o de la fila (no por las flechas, que cambian el relleno)
    let width = el.getBoundingClientRect().width
    const ro = new ResizeObserver(() => {
      measure()
      const w = el.getBoundingClientRect().width
      if (Math.abs(w - width) > 1) { width = w; showActive(false) }
    })
    ro.observe(el)
    for (const c of Array.from(el.children)) ro.observe(c)
    // Al cambiar la pestaña activa (o las pestañas), la activa vuelve a la vista
    const mo = new MutationObserver((list) => { measure(); if (list.some((m) => (m.target as HTMLElement).getAttribute('aria-selected') === 'true')) showActive(true) })
    mo.observe(el, { attributes: true, attributeFilter: ['aria-selected'], subtree: true })
    // La rueda vertical del ratón también recorre la fila (si hay qué recorrer)
    const wheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      e.preventDefault()
      el.scrollBy({ left: e.deltaY })
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => { ro.disconnect(); mo.disconnect(); el.removeEventListener('wheel', wheel) }
  }, [measure, showActive])
  const page = (dir: -1 | 1) => { const el = ref.current; if (el) el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.7), behavior: 'smooth' }) }
  // Flechas del teclado entre pestañas (patrón de pestañas de WAI-ARIA)
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const tabs = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [])
    const i = tabs.indexOf(document.activeElement as HTMLElement)
    if (i < 0) return
    e.preventDefault()
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]
    next.focus()
    next.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }
  return (
    <div className={`tabrow ${className}${edges.left ? ' tabrow--l' : ''}${edges.right ? ' tabrow--r' : ''}`}>
      {edges.left && <button type="button" className="tabrow__arrow tabrow__arrow--l" aria-label="Ver pestañas anteriores" tabIndex={-1} onClick={() => page(-1)}><ChevronLeft size={18} /></button>}
      <div ref={ref} className="tabs tabs--scroll" role="tablist" aria-label={label} onScroll={measure} onKeyDown={onKey} {...rest}>{children}</div>
      {edges.right && <button type="button" className="tabrow__arrow tabrow__arrow--r" aria-label="Ver más pestañas" tabIndex={-1} onClick={() => page(1)}><ChevronRight size={18} /></button>}
    </div>
  )
}
