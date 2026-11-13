import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { MenuButton } from './Combo'

export interface RowAction { key: string; label: string; icon?: ReactNode; run: () => void; tour?: string; testid?: string }

/**
 * R18-OB1 (ronda 18): la fila de acciones del expediente (observación y hospitalización), siempre en UNA fila: la primera acción
 * es la principal y las demás, secundarias, todas del mismo tamaño. Las que no caben al ancho de la pantalla pasan a
 * «Más acciones ▾» al final de la fila, en vez de bajar a otra.
 */
export function ActionRow({ actions, label = 'Acciones' }: { actions: RowAction[]; label?: string }) {
  const box = useRef<HTMLDivElement>(null)
  const ruler = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState(actions.length)
  const signature = actions.map((a) => `${a.key}:${a.label}`).join('|')
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const calc = () => {
      const widths = [...(ruler.current?.children ?? [])].map((c) => (c as HTMLElement).offsetWidth)
      const more = widths.pop() ?? 150
      const gap = 8
      const avail = el.clientWidth
      const used = (n: number) => widths.slice(0, n).reduce((s, w) => s + w, 0) + gap * Math.max(0, n - 1)
      let n = widths.length
      if (used(n) > avail) { n--; while (n > 1 && used(n) + gap + more > avail) n-- }
      setFit(Math.max(1, n))
    }
    calc()
    const ro = new ResizeObserver(calc)
    ro.observe(el)
    return () => ro.disconnect()
  }, [signature])
  const btn = (a: RowAction, i: number, live: boolean) => (
    <button key={a.key} type="button" className={`btn ${i === 0 ? 'btn--primary' : 'btn--soft'}`} data-tour={live ? a.tour : undefined} data-testid={live ? a.testid : undefined}
      tabIndex={live ? undefined : -1} onClick={live ? a.run : undefined}>{a.icon}{a.label}</button>
  )
  const rest = actions.slice(fit)
  return (
    <div className="action-row" ref={box} role="group" aria-label={label}>
      {actions.slice(0, fit).map((a, i) => btn(a, i, true))}
      {rest.length > 0 && <MenuButton className="btn btn--soft" label="Más acciones" items={rest.map((a) => ({ key: a.key, label: a.label, icon: a.icon, run: a.run }))} />}
      {/* Regla: los mismos botones, invisibles, para saber cuánto mide cada uno */}
      <div className="action-row__ruler" ref={ruler} aria-hidden="true" inert>
        {actions.map((a, i) => btn(a, i, false))}
        <button type="button" className="btn btn--soft" tabIndex={-1}>Más acciones<span style={{ width: 15 }} /></button>
      </div>
    </div>
  )
}
