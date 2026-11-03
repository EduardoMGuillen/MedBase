import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { Drug } from '../lib/catalogs'
import { searchDrugs } from '../lib/drugProvider'
import { normalize } from '../lib/patients'
import { DRUG_SEARCH_MIN_CHARS, DRUG_SEARCH_VISIBLE } from '../lib/clinicalConfig'
import { DrugOption } from './DrugSuggestion'

/** Cuántas sugerencias se calculan (se ven DRUG_SEARCH_VISIBLE; el resto, con desplazamiento). */
const MAX_RESULTS = 30

/**
 * ME8 (ronda 10): el campo «Medicamento» con sugerencias del vademécum, el mismo en TODOS los formularios de medicamento
 * (consulta externa, receta suelta, receta de salida, notas de ingreso, evolución y postquirúrgica, componentes de la
 * nebulización y Consultorio).
 * - Al tocar o enfocar el campo no se abre nada.
 * - Sugiere desde DRUG_SEARCH_MIN_CHARS letras (sin tildes ni mayúsculas, por nombre genérico, comercial y alias): primero
 *   los que empiezan con lo escrito y luego los que lo contienen. Con menos letras, la lista se cierra.
 * - Flechas para moverse, Enter para elegir, Esc o un clic afuera para cerrar.
 * - Sin coincidencias no muestra una lista vacía (`extra`, si lo hay, sí: «agregar como nuevo medicamento»).
 */
export function DrugSearch({ value, onChange, onPick, drugs, placeholder, autoFocus, ariaLabel, label = 'Medicamento', extra, clinicTag, below, className = '' }: {
  value: string
  onChange: (text: string) => void
  onPick: (d: Drug) => void
  drugs: Drug[]
  placeholder?: string
  autoFocus?: boolean
  ariaLabel?: string
  label?: ReactNode
  /** Una fila más al final de la lista (con lo escrito), p. ej. «agregar como nuevo medicamento». `close` cierra la lista. */
  extra?: (close: () => void) => ReactNode
  clinicTag?: boolean
  /** Lo que va debajo del campo (avisos del medicamento elegido). */
  below?: ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const listId = useId()
  const typed = normalize(value).length >= DRUG_SEARCH_MIN_CHARS
  const matches = typed ? searchDrugs(drugs, value, MAX_RESULTS) : []
  const more = typed ? extra?.(() => setOpen(false)) : null
  const shown = open && typed && (matches.length > 0 || !!more)
  const close = () => setOpen(false)
  // Clic afuera cierra (el blur no basta: un clic en la barra de desplazamiento de la lista no debe cerrarla)
  useEffect(() => {
    if (!open) return
    const out = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', out)
    return () => document.removeEventListener('mousedown', out)
  }, [open])
  const pick = (d: Drug) => { onPick(d); setOpen(false) }
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!shown) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, matches.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter' && matches[active]) { e.preventDefault(); pick(matches[active]) }
    // Esc cierra solo la lista, no la ventana en que está el formulario
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
  }
  return (
    <div ref={box} className={`field suggest drug-search ${className}`}>
      {label && <span>{label}</span>}
      <input className="input" value={value} autoFocus={autoFocus} autoComplete="off" placeholder={placeholder} aria-label={ariaLabel}
        role="combobox" aria-expanded={shown} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={shown && matches[active] ? `${listId}-${active}` : undefined}
        onChange={(e) => { onChange(e.target.value); setActive(0); setOpen(true) }} onKeyDown={onKey} />
      {shown && (
        <div id={listId} className="suggest__list drug-search__list" role="listbox" style={{ ['--visible' as string]: DRUG_SEARCH_VISIBLE }}>
          {matches.map((d, i) => (
            <button type="button" role="option" id={`${listId}-${i}`} aria-selected={i === active} key={`${d.name}|${d.presentation}|${d.clinicId ?? ''}`}
              className={i === active ? 'is-active' : undefined} onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => pick(d)}>
              <DrugOption d={d} query={value} clinicTag={clinicTag} />
            </button>
          ))}
          {more}
        </div>
      )}
      {below}
    </div>
  )
}
