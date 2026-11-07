import { useEffect, useId, useRef, useState } from 'react'
import { canonicalRoute, isKnownRoute, routeLabel, routeMatches } from '../lib/format'

/**
 * ME17 (ronda 16): «Vía»: se escribe o se elige, con abreviaturas. El mismo patrón de lista que DrugSearch (flechas, Enter,
 * Esc, clic afuera), con la lista corta de ROUTE_OPTIONS (clinicalConfig, VALIDAR: Emil):
 * - Al escribir filtra por nombre o abreviatura («iv» → «Intravenosa (IV)»). Al tocar el campo (o con la flecha abajo) se ve
 *   la lista completa, como el select de antes.
 * - Se guarda el nombre de la lista («Intravenosa»): `onChange` recibe siempre el valor canónico (canonicalRoute), también
 *   mientras se escribe, así la lógica que depende de la vía (dosis de carga, nebulización, infusión) responde al momento.
 * - Una vía que no está en la lista se acepta tal cual, con el aviso «No está en la lista».
 */
export function RouteField({ value, onChange, label = 'Vía', className = '' }: { value: string; onChange: (route: string) => void; label?: string; className?: string }) {
  const [text, setText] = useState(() => routeLabel(value))
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  // Si la vía cambia desde afuera (al elegir un medicamento del vademécum), el campo la muestra
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    if (canonicalRoute(text) !== value) setText(routeLabel(value))
  }
  const box = useRef<HTMLDivElement>(null)
  const listId = useId()
  // Con el texto de la vía elegida, la lista completa; si se escribe, lo que coincide
  const typing = text !== routeLabel(value) || !value
  const matches = typing ? routeMatches(text) : routeMatches('')
  const shown = open && matches.length > 0
  useEffect(() => {
    if (!open) return
    const out = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', out)
    return () => document.removeEventListener('mousedown', out)
  }, [open])
  const pick = (name: string) => { onChange(name); setText(routeLabel(name)); setSeen(name); setOpen(false) }
  const openAll = () => { setActive(Math.max(0, routeMatches('').findIndex((r) => r.name === value))); setOpen(true) }
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!shown) {
      if (e.key === 'ArrowDown') { e.preventDefault(); openAll() }
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, matches.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter' && matches[active]) { e.preventDefault(); pick(matches[active].name) }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false) }
    else if (e.key === 'Tab' && typing && matches[active] && text.trim()) pick(matches[active].name)
  }
  const free = !!value.trim() && !isKnownRoute(value)
  return (
    <div ref={box} className={`field suggest route-field ${className}`}>
      {label && <span>{label}</span>}
      <input className="input" value={text} autoComplete="off" autoCapitalize="off" data-nocap aria-label={label || 'Vía'} placeholder="Escribe o elige: VO, IV, IM…"
        role="combobox" aria-expanded={shown} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={shown && matches[active] ? `${listId}-${active}` : undefined}
        onMouseDown={() => { if (!open) openAll() }}
        onChange={(e) => { setText(e.target.value); const c = canonicalRoute(e.target.value); setSeen(c); onChange(c); setActive(0); setOpen(true) }}
        onBlur={() => setText(routeLabel(value))}
        onKeyDown={onKey} />
      {shown && (
        <div id={listId} className="suggest__list" role="listbox">
          {matches.map((r, i) => (
            <button type="button" role="option" id={`${listId}-${i}`} aria-selected={i === active} key={r.name} className={i === active ? 'is-active' : undefined}
              onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => pick(r.name)}>
              {r.name} <span className="muted">({r.abbr})</span>
            </button>
          ))}
        </div>
      )}
      {free && <small className="field__msg field__msg--warn">No está en la lista: se guarda como la escribiste.</small>}
    </div>
  )
}
