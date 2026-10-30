import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import type { TourCtx, TourStep } from '../tours'

const PAD = 6
const GAP = 14
/** Cuánto se espera a que aparezca el elemento de un paso (la pantalla carga datos) antes de saltarlo. */
const WAIT_MS = 3500

export type TourEnd = 'done' | 'skipped' | 'paused'

/** ¿La ubicación actual ya es la del paso? Ruta igual y los parámetros que pide el paso. */
function at(loc: { pathname: string; search: string }, route: string) {
  const [path, query = ''] = route.split('?')
  if (loc.pathname !== path) return false
  const want = new URLSearchParams(query)
  const have = new URLSearchParams(loc.search)
  return [...want.entries()].every(([k, v]) => have.get(k) === v)
}

/**
 * RG1: recorrido guiado. Cada paso puede ir a otra pantalla (`route`) y resalta el elemento con su `data-tour`,
 * oscureciendo lo demás. Si el elemento no aparece (permisos, la cuenta no tiene camas, no hay un paciente de la
 * demo para ese paso), el paso se salta. Siguiente, Anterior, Saltar recorrido y cerrar (×, Esc), que lo deja en
 * pausa para continuar después. `onMenu` abre el menú lateral en el teléfono cuando el paso señala una opción de él.
 */
export function Tour({ steps, ctx = {}, start = 0, title, onClose, onMenu }: {
  steps: TourStep[]; ctx?: TourCtx; start?: number; title?: string; onClose: (end: TourEnd, step: number) => void; onMenu?: (open: boolean) => void
}) {
  const nav = useNavigate()
  const loc = useLocation()
  const [i, setI] = useState(Math.min(start, steps.length - 1))
  const [ready, setReady] = useState(false)
  const [, setTick] = useState(0)
  const dir = useRef(1)
  const nextBtn = useRef<HTMLButtonElement>(null)
  const step = steps[i]
  const last = i >= steps.length - 1
  const go = (n: number) => {
    dir.current = n >= i ? 1 : -1
    if (n >= steps.length) return onClose('done', 0)
    setReady(false)
    setI(Math.max(0, n))
  }
  const route = step && (typeof step.route === 'function' ? step.route(ctx) : step.route)

  // Llegar al paso: ir a su pantalla y esperar a que su elemento esté; si no aparece, saltarlo en la misma dirección
  useEffect(() => {
    if (!step) return
    if (typeof step.route === 'function' && !route) { go(i + dir.current < 0 ? i + 1 : i + dir.current); return }
    onMenu?.(!!step.target?.startsWith('nav:'))
    if (route && !at(loc, route)) { nav(route); return }
    if (!step.target) { setReady(true); return }
    const t0 = Date.now()
    const timer = setInterval(() => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`)
      // Lo alto (un panel, la hoja) se alinea arriba; lo chico, al centro
      if (el) { clearInterval(timer); el.scrollIntoView({ block: el.getBoundingClientRect().height > window.innerHeight * 0.5 ? 'start' : 'center', behavior: 'smooth' }); setTimeout(() => setReady(true), 400) }
      else if (Date.now() - t0 > WAIT_MS) {
        clearInterval(timer)
        const n = i + dir.current
        if (n < 0 || n >= steps.length) setReady(true) // primero o último sin elemento: tarjeta al centro
        else go(n)
      }
    }, 120)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, loc.pathname, loc.search])

  // La posición se vuelve a medir cuando algo se mueve: scroll, cambio de tamaño o datos que terminan de cargar
  useEffect(() => {
    const bump = () => setTick((t) => t + 1)
    window.addEventListener('resize', bump)
    window.addEventListener('scroll', bump, true)
    window.addEventListener('transitionend', bump, true)
    const ro = new ResizeObserver(bump)
    ro.observe(document.body)
    return () => {
      window.removeEventListener('resize', bump); window.removeEventListener('scroll', bump, true); window.removeEventListener('transitionend', bump, true); ro.disconnect()
      onMenu?.(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { if (ready) nextBtn.current?.focus() }, [ready, i])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose('paused', i)
      else if (e.key === 'ArrowRight' && ready) go(i + 1)
      else if (e.key === 'ArrowLeft' && ready && i > 0) go(i - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!step) return null
  const el = ready && step.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null
  const r = el?.getBoundingClientRect()
  const vw = window.innerWidth, vh = window.innerHeight
  const onScreen = r && r.width > 0 && r.height > 0 && r.right > 0 && r.left < vw && r.bottom > 0 && r.top < vh
  // Tapado por otra cosa (en el teléfono, el menú abierto tapa el buscador): mejor la tarjeta al centro. Se prueban
  // puntos dentro de la parte visible del elemento (uno alto puede tener la cabecera fija encima)
  const vis = onScreen ? { x0: Math.max(r.left, 0), x1: Math.min(r.right, vw), y0: Math.max(r.top, 0), y1: Math.min(r.bottom, vh) } : null
  const shown = !!vis && [[0.5, 0.5], [0.2, 0.3], [0.5, 0.15], [0.5, 0.85]].some(([fx, fy]) => {
    const hit = document.elementsFromPoint(vis.x0 + (vis.x1 - vis.x0) * fx, vis.y0 + (vis.y1 - vis.y0) * fy).find((n) => !n.closest('.tour'))
    return !!hit && el!.contains(hit)
  })

  let card: React.CSSProperties | undefined
  if (shown && r) {
    const w = Math.min(340, vw - 32)
    // Al lado si cabe; si no, abajo o arriba del elemento, sin taparlo (en el teléfono, siempre arriba o abajo)
    if (vw > 700 && r.right + GAP + w <= vw - 16) card = { left: r.right + GAP, top: Math.min(Math.max(16, r.top + r.height / 2 - 70), vh - 260) }
    else {
      const left = Math.min(Math.max(16, r.left + r.width / 2 - w / 2), vw - w - 16)
      card = r.bottom + GAP + 230 < vh ? { left, top: r.bottom + GAP } : r.top - GAP - 230 > 0 ? { left, bottom: vh - r.top + GAP } : { left, bottom: 16 }
    }
  }

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {shown
        ? <div className="tour__spot" style={{ top: Math.max(r!.top, 0) - PAD, left: r!.left - PAD, width: r!.width + PAD * 2, height: Math.min(r!.bottom, vh) - Math.max(r!.top, 0) + PAD * 2 }} />
        : <div className="tour__dim" />}
      {(ready || !step.target) && (
        <div className={`tour__card${shown ? '' : ' tour__card--center'}`} style={card}>
          <button className="icon-btn tour__close" aria-label="Cerrar el recorrido (lo continúas después)" onClick={() => onClose('paused', i)}><X size={16} /></button>
          <span className="tour__count">{title ? `${title} · ` : ''}Paso {i + 1} de {steps.length}</span>
          <h2 id="tour-title">{step.title}</h2>
          <p>{step.body}</p>
          <div className="tour__bar" aria-hidden="true"><span style={{ width: `${((i + 1) / steps.length) * 100}%` }} /></div>
          <div className="tour__foot">
            {!last && <button className="btn btn--ghost btn--sm tour__skip" onClick={() => onClose('skipped', i)}>Saltar recorrido</button>}
            {i > 0 && <button className="btn btn--ghost btn--sm" onClick={() => go(i - 1)}>Anterior</button>}
            <button ref={nextBtn} className="btn btn--primary btn--sm" onClick={() => go(i + 1)}>{last ? 'Terminar' : i === 0 ? 'Empezar' : 'Siguiente'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

/** «¿Continuar donde lo dejaste?»: el recorrido quedó a la mitad. */
export function TourResume({ step, total, onContinue, onRestart, onLater }: { step: number; total: number; onContinue: () => void; onRestart: () => void; onLater: () => void }) {
  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-resume">
      <div className="tour__dim" />
      <div className="tour__card tour__card--center">
        <span className="tour__count">Recorrido guiado</span>
        <h2 id="tour-resume">¿Continuar donde lo dejaste?</h2>
        <p>Ibas en el paso {step + 1} de {total}.</p>
        <div className="tour__foot">
          <button className="btn btn--ghost btn--sm tour__skip" onClick={onLater}>Ahora no</button>
          <button className="btn btn--ghost btn--sm" onClick={onRestart}>Empezar de nuevo</button>
          <button className="btn btn--primary btn--sm" autoFocus onClick={onContinue}>Continuar</button>
        </div>
      </div>
    </div>
  )
}
