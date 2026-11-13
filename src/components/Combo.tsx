import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

/**
 * LD1 (ronda 18): LA lista desplegable de toda la app. Un solo componente con el patrón combobox editable de WAI-ARIA
 * (`role="combobox"`, `aria-expanded`, `aria-autocomplete="list"`, flechas, Enter y Esc): se escribe y se elige.
 *
 * - Al tocar el campo o la flecha se abre la lista completa y el cursor queda listo para escribir.
 * - Al escribir se filtra mientras se escribe, sin importar tildes ni mayúsculas y por cualquier parte del texto; primero las
 *   opciones que EMPIEZAN con lo escrito. Lo escrito se resalta. Sin resultados: «Ninguna opción coincide».
 * - Lista cerrada (por defecto): el valor final siempre es una opción elegida. Si se sale del campo con un texto que no es una
 *   opción, vuelve al valor anterior y avisa «Elige una opción de la lista». El texto de ayuda («Elige…») nunca es una opción.
 * - Lista abierta (`free`): acepta un texto escrito; la última fila dice «Usar «lo escrito»».
 * - La lista se dibuja en un portal, pegada al campo y por encima de todo (como el calendario de GE3): ninguna ventana la
 *   recorta ni queda tapada; si abajo no cabe, sube. Fondo claro, misma superficie que los demás menús.
 *
 * No hay `<select>` nativo ni `<datalist>` en la app: `server/ronda18_ui.test.ts` falla si alguien vuelve a usar uno.
 */
export interface ComboOption {
  value: string
  label: string
  /** Texto gris a la derecha (p. ej. una abreviatura o un cargo); también se busca en él. */
  hint?: string
  icon?: ReactNode
  disabled?: boolean
}
type Opt = ComboOption | string

export interface ComboProps {
  value: string
  /** `option` viene cuando se eligió de la lista; en lista abierta, sin él es un texto escrito. */
  onChange: (value: string, option?: ComboOption) => void
  options: readonly Opt[]
  /** Lista abierta: se acepta un texto que no está en la lista. */
  free?: boolean
  placeholder?: string
  /** Nombre accesible cuando el campo no está dentro de un `<label>` con texto. */
  label?: string
  id?: string
  required?: boolean
  disabled?: boolean
  invalid?: boolean
  warn?: boolean
  /** Fila compacta (tablas editables, barras de filtros). */
  size?: 'sm'
  /** Ancho según la opción más larga, en vez de todo el ancho. */
  auto?: boolean
  className?: string
  /** Lista abierta sin opciones que ofrecer (p. ej. «No hay anestesiólogos ni técnicos en anestesia registrados»). */
  emptyText?: string
  autoFocus?: boolean
}

/** Sin tildes ni mayúsculas, carácter por carácter (los índices coinciden con el texto original para resaltar). */
export const foldText = (t: string) => Array.from(t, (c) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() || c).join('')

/** Para los formularios que guardan con `(e) => … e.target.value`: el valor elegido, con la forma de ese evento. */
export const asChange = (value: string) => ({ target: { value } }) as ChangeEvent<HTMLInputElement>

const toOption = (o: Opt): ComboOption => (typeof o === 'string' ? { value: o, label: o } : o)

/** Las opciones que coinciden con lo escrito: primero las que empiezan con ello; el resto, en su orden. */
export function comboMatches(options: ComboOption[], typed: string) {
  const q = foldText(typed.trim())
  if (!q) return options
  const hit = options.map((o) => ({ o, at: foldText(o.label).indexOf(q), hint: !!o.hint && foldText(o.hint).includes(q) })).filter((x) => x.at >= 0 || x.hint)
  return [...hit.filter((x) => x.at === 0), ...hit.filter((x) => x.at !== 0)].map((x) => x.o)
}

function Highlight({ text, typed }: { text: string; typed: string }) {
  const q = foldText(typed.trim())
  const at = q ? foldText(text).indexOf(q) : -1
  if (at < 0) return <>{text}</>
  return <>{text.slice(0, at)}<mark>{text.slice(at, at + q.length)}</mark>{text.slice(at + q.length)}</>
}

/** Dónde va un panel emergente respecto a su campo: debajo o, si no cabe, arriba; nunca fuera de la pantalla. */
function useFloating(anchor: RefObject<HTMLElement | null>, pop: RefObject<HTMLElement | null>, open: boolean, opts: { matchWidth?: boolean; align?: 'left' | 'right'; rows?: number } = {}) {
  const [pos, setPos] = useState<{ top: number; left: number; width?: number; maxHeight: number } | null>(null)
  const { matchWidth, align, rows } = opts
  // Se vuelve a colocar al abrirse y cada vez que cambia cuántas filas tiene (al filtrar)
  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!open) { setPos(null); return }
    const place = () => {
      const a = anchor.current?.getBoundingClientRect()
      const el = pop.current
      if (!a || !el) return
      const gap = 4, margin = 8, cap = 320
      const below = window.innerHeight - a.bottom - gap - margin
      const above = a.top - gap - margin
      const h = Math.min(el.scrollHeight + 2, cap)
      const up = h > below && above > below
      const maxHeight = Math.max(120, Math.min(cap, up ? above : below))
      const top = up ? Math.max(margin, a.top - gap - Math.min(h, maxHeight)) : a.bottom + gap
      const width = matchWidth ? Math.max(a.width, 160) : undefined
      const w = width ?? el.offsetWidth
      const wanted = align === 'right' ? a.right - w : a.left
      const left = Math.max(margin, Math.min(wanted, window.innerWidth - w - margin))
      setPos((p) => (p && p.top === top && p.left === left && p.width === width && p.maxHeight === maxHeight ? p : { top, left, width, maxHeight }))
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [anchor, pop, open, matchWidth, align, rows])
  return pos
}

export function Combo({ value, onChange, options, free = false, placeholder, label, id, required, disabled, invalid, warn, size, auto, className = '', emptyText, autoFocus }: ComboProps) {
  const opts = useMemo(() => options.map(toOption), [options])
  const selected = opts.find((o) => o.value === value)
  const shownValue = free ? value : selected?.label ?? ''
  const [open, setOpen] = useState(false)
  /** Lo que se está escribiendo; null = el campo muestra el valor. */
  const [typed, setTyped] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const [msg, setMsg] = useState(false)
  const box = useRef<HTMLSpanElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const listId = useId()
  const text = typed ?? shownValue
  // Con el valor a la vista (sin escribir) se ofrece la lista completa; al escribir, lo que coincide
  const matches = typed === null ? opts : comboMatches(opts, text)
  const exact = opts.find((o) => foldText(o.label) === foldText(text.trim()))
  const useRow = free && typed !== null && !!text.trim() && !exact
  const rows = matches.length + (useRow ? 1 : 0)
  const pos = useFloating(box, pop, open, { matchWidth: true, rows })

  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(false), 5000); return () => clearTimeout(t) }, [msg])
  // La opción activa siempre a la vista
  useEffect(() => { if (open) pop.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }) }, [open, active])

  const openAll = () => {
    if (disabled) return
    setActive(Math.max(0, matches.findIndex((o) => o.value === value)))
    setOpen(true)
    setMsg(false)
  }
  const close = () => { setOpen(false); setTyped(null) }
  const pick = (o: ComboOption) => {
    if (o.disabled) return
    close()
    if (o.value !== value || free) onChange(free ? o.label : o.value, o)
  }
  const acceptTyped = () => { close(); onChange(text.trim()) }
  const pickActive = () => { if (active < matches.length) { if (matches[active]) pick(matches[active]) } else if (useRow) acceptTyped() }
  const move = (d: number) => {
    if (!rows) return
    let i = active
    for (let n = 0; n < rows; n++) { i = (i + d + rows) % rows; if (i >= matches.length || !matches[i].disabled) break }
    setActive(i)
  }
  /** Al salir del campo: en lista cerrada, lo escrito tiene que ser una opción; si no, vuelve al valor anterior. */
  const leave = () => {
    if (typed === null || free) { close(); return }
    const t = typed.trim()
    if (exact && !exact.disabled) { pick(exact); return }
    const blank = opts.find((o) => o.value === '')
    // Campo vacío: la opción «en blanco» si la lista la tiene; si no, se queda el valor que había
    if (!t) { if (blank) pick(blank); else close(); return }
    close()
    setMsg(true)
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) openAll(); else move(e.key === 'ArrowDown' ? 1 : -1)
    } else if (e.key === 'Enter') {
      if (!open) return
      e.preventDefault()
      pickActive()
    } else if (e.key === 'Escape') {
      if (!open) return
      // Esc cierra solo la lista, no la ventana en que está
      e.preventDefault(); e.stopPropagation(); e.nativeEvent.stopImmediatePropagation()
      close()
    } else if (e.key === 'Tab' && open && typed !== null && typed.trim() && !free && matches[active] && !matches[active].disabled) {
      // Como en un autocompletado: Tab acepta la opción resaltada
      pick(matches[active])
    } else if (e.key === 'Home' && open) { e.preventDefault(); setActive(0) }
    else if (e.key === 'End' && open) { e.preventDefault(); setActive(Math.max(0, rows - 1)) }
  }
  const longest = auto ? Math.min(34, Math.max(...opts.map((o) => o.label.length), (placeholder ?? '').length, 4)) : 0
  const optionId = (i: number) => `${listId}-${i}`

  return (
    <span ref={box} className={`combo${size === 'sm' ? ' combo--sm' : ''}${auto ? ' combo--auto' : ''}${open ? ' is-open' : ''} ${className}`} style={auto ? { width: `calc(${longest + 1}ch + 52px)` } : undefined}>
      <input ref={input} id={id} className={`input combo__input${invalid || msg ? ' input--error' : warn ? ' input--warn' : ''}`} value={text} disabled={disabled} autoFocus={autoFocus}
        placeholder={placeholder ?? (free ? 'Elige o escribe' : 'Elige…')} autoComplete="off" autoCapitalize="off" spellCheck={false} data-nocap
        role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-haspopup="listbox" aria-label={label}
        aria-required={required || undefined} aria-invalid={invalid || msg || undefined}
        aria-activedescendant={open && rows ? optionId(active) : undefined}
        onMouseDown={() => { if (!open) openAll() }}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const t = e.target.value
          setTyped(t); setActive(0); setOpen(true); setMsg(false)
          if (free) { const hit = opts.find((o) => o.label === t.trim()); onChange(t, hit) }
        }}
        onBlur={leave} onKeyDown={onKey} />
      <button type="button" className="combo__chev" tabIndex={-1} aria-hidden="true" disabled={disabled}
        onMouseDown={(e) => { e.preventDefault(); input.current?.focus(); if (open) close(); else openAll() }}><ChevronDown size={size === 'sm' ? 14 : 16} /></button>
      {msg && <small className="field__msg field__msg--error combo__msg" role="alert">Elige una opción de la lista</small>}
      {open && createPortal(
        <div ref={pop} id={listId} role="listbox" aria-label={label} className="combo__pop"
          style={pos ? { top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight } : { top: -9999, left: -9999 }}
          onMouseDown={(e) => e.preventDefault()}>
          {matches.map((o, i) => (
            <div key={o.value} id={optionId(i)} role="option" aria-selected={i === active} aria-disabled={o.disabled || undefined}
              className={`combo__opt${o.value === value && !free ? ' is-chosen' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => pick(o)}>
              {o.icon}
              <span className="combo__label"><Highlight text={o.label} typed={typed ?? ''} /></span>
              {o.hint && <span className="combo__hint"><Highlight text={o.hint} typed={typed ?? ''} /></span>}
              {o.value === value && !free && <Check size={15} className="combo__check" aria-hidden="true" />}
            </div>
          ))}
          {!matches.length && <div className="combo__none" role="presentation">{free ? (opts.length ? 'Nadie de la lista coincide' : emptyText ?? 'No hay opciones en la lista') : 'Ninguna opción coincide'}</div>}
          {useRow && <div id={optionId(matches.length)} role="option" aria-selected={active === matches.length} className="combo__opt combo__opt--use"
            onMouseEnter={() => setActive(matches.length)} onClick={acceptTyped}>Usar «{text.trim()}»</div>}
        </div>,
        document.body,
      )}
    </span>
  )
}

/**
 * R18-OB1 (ronda 18): «Más acciones ▾»: las acciones que no caben en una fila, en un menú con la misma superficie y el mismo
 * portal que la lista de LD1. Flechas para moverse, Enter para elegir, Esc para cerrar.
 */
export function MenuButton({ label, items, className = 'btn btn--ghost', align = 'right' }: {
  label: ReactNode; items: { key: string; label: ReactNode; icon?: ReactNode; run: () => void }[]; className?: string; align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const pos = useFloating(btn, pop, open, { align })
  useEffect(() => {
    if (!open) return
    const out = (e: MouseEvent) => { const t = e.target as Node; if (!btn.current?.contains(t) && !pop.current?.contains(t)) setOpen(false) }
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); setOpen(false); btn.current?.focus() } }
    document.addEventListener('mousedown', out)
    window.addEventListener('keydown', esc, true)
    return () => { document.removeEventListener('mousedown', out); window.removeEventListener('keydown', esc, true) }
  }, [open])
  const placed = pos !== null
  useEffect(() => { if (open && placed) pop.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus() }, [open, placed])
  if (!items.length) return null
  const step = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const all = [...(pop.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const i = all.indexOf(document.activeElement as HTMLElement)
    all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]?.focus()
  }
  return (<>
    <button ref={btn} type="button" className={`${className} menu-btn`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>{label}<ChevronDown size={15} aria-hidden="true" /></button>
    {open && createPortal(
      <div ref={pop} role="menu" className="combo__pop combo__pop--menu" style={pos ? { top: pos.top, left: pos.left, maxHeight: pos.maxHeight } : { top: -9999, left: -9999 }} onKeyDown={step}>
        {items.map((it) => <button key={it.key} type="button" role="menuitem" className="combo__opt" onClick={() => { setOpen(false); it.run() }}>{it.icon}{it.label}</button>)}
      </div>,
      document.body,
    )}
  </>)
}
