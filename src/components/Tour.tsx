import { useEffect, useRef, useState } from 'react'
import type { TourStep } from '../lib/tours'

const PAD = 6
const GAP = 14

/**
 * Recorrido guiado: resalta el elemento con `data-tour` de cada paso y pone la explicación al lado. Si el elemento
 * no está en pantalla (o el paso no señala nada) la explicación va al centro. Esc lo cierra; las flechas avanzan.
 */
export function Tour({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const [i, setI] = useState(0)
  const [, setTick] = useState(0)
  const nextBtn = useRef<HTMLButtonElement>(null)
  const step = steps[Math.min(i, steps.length - 1)]
  const last = i >= steps.length - 1
  const go = (n: number) => (n >= steps.length ? onClose() : setI(Math.max(0, n)))

  // La posición se vuelve a medir cuando algo se mueve: scroll del menú, cambio de tamaño, datos que terminan de
  // cargar o el menú del teléfono que termina de deslizarse
  useEffect(() => {
    const bump = () => setTick((t) => t + 1)
    window.addEventListener('resize', bump)
    window.addEventListener('scroll', bump, true)
    window.addEventListener('transitionend', bump, true)
    const ro = new ResizeObserver(bump)
    ro.observe(document.body)
    return () => {
      window.removeEventListener('resize', bump); window.removeEventListener('scroll', bump, true); window.removeEventListener('transitionend', bump, true); ro.disconnect()
    }
  }, [])

  useEffect(() => {
    if (step?.target) document.querySelector(`[data-tour="${step.target}"]`)?.scrollIntoView({ block: 'nearest' })
    nextBtn.current?.focus()
  }, [step?.target, i])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') go(i + 1)
      else if (e.key === 'ArrowLeft') go(i - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!step) return null
  const el = step.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null
  const r = el?.getBoundingClientRect()
  const vw = window.innerWidth, vh = window.innerHeight
  const onScreen = r && r.width > 0 && r.height > 0 && r.right > 0 && r.left < vw && r.bottom > 0 && r.top < vh
  // Tapado por otra cosa (en el teléfono, el menú abierto tapa el buscador): mejor la tarjeta al centro
  const top = onScreen ? document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2).find((n) => !n.closest('.tour')) : null
  const shown = onScreen && !!top && el!.contains(top)

  let card: React.CSSProperties | undefined
  if (shown) {
    const w = Math.min(340, vw - 32)
    if (r.right + GAP + w <= vw - 16) card = { left: r.right + GAP, top: Math.min(Math.max(16, r.top + r.height / 2 - 70), vh - 240) }
    else {
      const left = Math.min(Math.max(16, r.left + r.width / 2 - w / 2), vw - w - 16)
      card = r.bottom + GAP + 220 < vh ? { left, top: r.bottom + GAP } : { left, bottom: vh - r.top + GAP }
    }
  }

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {shown
        ? <div className="tour__spot" style={{ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 }} />
        : <div className="tour__dim" />}
      <div className={`tour__card${shown ? '' : ' tour__card--center'}`} style={card}>
        <span className="tour__count">{i + 1} de {steps.length}</span>
        <h2 id="tour-title">{step.title}</h2>
        <p>{step.body}</p>
        <div className="tour__bar" aria-hidden="true"><span style={{ width: `${((i + 1) / steps.length) * 100}%` }} /></div>
        <div className="tour__foot">
          {!last && <button className="btn btn--ghost btn--sm tour__skip" onClick={onClose}>Saltar recorrido</button>}
          {i > 0 && <button className="btn btn--ghost btn--sm" onClick={() => go(i - 1)}>Atrás</button>}
          <button ref={nextBtn} className="btn btn--primary btn--sm" onClick={() => go(i + 1)}>{last ? 'Terminar' : i === 0 ? 'Empezar' : 'Siguiente'}</button>
        </div>
      </div>
    </div>
  )
}
