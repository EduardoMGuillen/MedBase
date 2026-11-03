import { useEffect, useRef, useState } from 'react'
import { CalendarDays, Clock } from 'lucide-react'
import {
  clinicParts, dateFromDisplay, dateToDisplay, fromDisplay, maskDate, maskDateTime, maskTime, MONTHS, timeFromDisplay, toDisplay, toLocalValue, WEEKDAYS_SHORT,
} from '../lib/dateInput'

/**
 * GE3 (ronda 9): fecha y hora propias de la app, en dd/mm/aaaa y HH:mm (24 horas). No usa los campos nativos del
 * navegador (`datetime-local`, `date`, `time`), que muestran mes/día y AM/PM según el idioma del navegador y no se pueden
 * forzar a 24 horas: por eso la ronda 8 no lo resolvió del todo (quedaban campos nativos en otras pantallas). Se escribe con
 * números (las barras y los dos puntos se ponen solos) o se elige en el calendario en español, con la hora en dos listas
 * 00–23 y 00–59 y el botón «Ahora». Hora de Honduras (America/Tegucigalpa). Objetivos táctiles de 44 px.
 */
const pad = (n: number) => String(n).padStart(2, '0')
const HOURS = Array.from({ length: 24 }, (_, i) => pad(i))
const MINUTES = Array.from({ length: 60 }, (_, i) => pad(i))

function usePopover() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [open])
  return { open, setOpen, ref }
}

/** Calendario de un mes en español (semanas de lunes a domingo). */
function Calendar({ value, onPick, min, max }: { value: string; onPick: (ymd: string) => void; min?: string; max?: string }) {
  const today = toLocalValue(new Date()).slice(0, 10)
  const base = /^\d{4}-\d{2}/.test(value) ? value : today
  const [ym, setYm] = useState({ y: Number(base.slice(0, 4)), m: Number(base.slice(5, 7)) })
  const first = new Date(Date.UTC(ym.y, ym.m - 1, 1))
  const lead = (first.getUTCDay() + 6) % 7
  const days = new Date(Date.UTC(ym.y, ym.m, 0)).getUTCDate()
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  const move = (n: number) => setYm(({ y, m }) => { const t = m - 1 + n; return { y: y + Math.floor(t / 12), m: ((t % 12) + 12) % 12 + 1 } })
  return (
    <div className="dtf__cal">
      <div className="dtf__calhead">
        <button type="button" className="icon-btn" aria-label="Mes anterior" onClick={() => move(-1)}>‹</button>
        <b>{MONTHS[ym.m - 1]} {ym.y}</b>
        <button type="button" className="icon-btn" aria-label="Mes siguiente" onClick={() => move(1)}>›</button>
      </div>
      <div className="dtf__grid" role="grid">
        {WEEKDAYS_SHORT.map((w, i) => <span key={i} className="dtf__wd">{w}</span>)}
        {cells.map((d, i) => {
          if (!d) return <span key={i} />
          const ymd = `${ym.y}-${pad(ym.m)}-${pad(d)}`
          const off = (!!min && ymd < min.slice(0, 10)) || (!!max && ymd > max.slice(0, 10))
          return <button key={i} type="button" disabled={off} className={`dtf__day${ymd === value.slice(0, 10) ? ' is-on' : ''}${ymd === today ? ' is-today' : ''}`} onClick={() => onPick(ymd)}>{d}</button>
        })}
      </div>
    </div>
  )
}

/** Hora y minutos en dos listas (sin AM/PM). */
function TimePicker({ value, onPick }: { value: string; onPick: (hm: string) => void }) {
  const [h, m] = /^\d{2}:\d{2}$/.test(value) ? value.split(':') : ['', '']
  return (
    <div className="dtf__time">
      <label><small>Hora</small><select className="select" value={h} onChange={(e) => onPick(`${e.target.value}:${m || '00'}`)} aria-label="Hora (00 a 23)">
        {!h && <option value="">--</option>}{HOURS.map((x) => <option key={x}>{x}</option>)}</select></label>
      <b>:</b>
      <label><small>Minutos</small><select className="select" value={m} onChange={(e) => onPick(`${h || '00'}:${e.target.value}`)} aria-label="Minutos">
        {!m && <option value="">--</option>}{MINUTES.map((x) => <option key={x}>{x}</option>)}</select></label>
    </div>
  )
}

/** Fecha y hora: valor «aaaa-mm-ddTHH:mm» en hora de Honduras. */
export function DateTimeField({ value, onChange, max, min, invalid, id, label = 'Fecha y hora', now = true }: {
  value: string; onChange: (v: string) => void; max?: string; min?: string; invalid?: boolean; id?: string; label?: string; now?: boolean
}) {
  const [text, setText] = useState(() => toDisplay(value))
  const [seen, setSeen] = useState(value)
  const pop = usePopover()
  // Si el valor cambia desde fuera (p. ej. «Ahora» o el calendario), se muestra el nuevo
  if (value !== seen) { setSeen(value); setText(toDisplay(value)) }
  const parsed = fromDisplay(text)
  const out = !!parsed && ((!!max && parsed > max) || (!!min && parsed < min))
  const bad = (text.length >= 16 && !parsed) || out || invalid
  const set = (v: string) => { setSeen(v); setText(toDisplay(v)); onChange(v) }
  return (
    <span className="dtf" ref={pop.ref}>
      <input id={id} className={`input num dtf__input${bad ? ' input--error' : ''}`} inputMode="numeric" autoComplete="off" placeholder="dd/mm/aaaa HH:mm" aria-label={label}
        aria-invalid={bad || undefined} value={text}
        onChange={(e) => {
          const t = maskDateTime(e.target.value)
          setText(t)
          const v = fromDisplay(t)
          if (v && (!max || v <= max) && (!min || v >= min)) { setSeen(v); onChange(v) }
        }}
        onBlur={() => { if (!fromDisplay(text)) setText(toDisplay(value)) }} />
      <button type="button" className="icon-btn dtf__btn" aria-label={`Elegir ${label.toLowerCase()}`} aria-expanded={pop.open} onClick={() => pop.setOpen(!pop.open)}><CalendarDays size={17} /></button>
      {now && <button type="button" className="btn btn--ghost btn--sm dtf__now" onClick={() => set(toLocalValue(new Date()))}>Ahora</button>}
      {text.length >= 16 && !parsed && <small className="field__msg field__msg--error dtf__msg">No es una fecha y hora válida.</small>}
      {pop.open && (
        <span className="dtf__pop" role="dialog" aria-label={label}>
          <Calendar value={value} min={min} max={max} onPick={(ymd) => set(`${ymd}T${value.slice(11, 16) || pad(clinicParts(new Date()).h) + ':' + pad(clinicParts(new Date()).mi)}`)} />
          <TimePicker value={value.slice(11, 16)} onPick={(hm) => set(`${value.slice(0, 10) || toLocalValue(new Date()).slice(0, 10)}T${hm}`)} />
          <span className="dtf__popfoot">
            {now && <button type="button" className="btn btn--ghost btn--sm" onClick={() => set(toLocalValue(new Date()))}>Ahora</button>}
            <button type="button" className="btn btn--primary btn--sm" onClick={() => pop.setOpen(false)}>Listo</button>
          </span>
        </span>
      )}
    </span>
  )
}

/** Sólo fecha: valor «aaaa-mm-dd». */
export function DateField({ value, onChange, max, min, invalid, id, label = 'Fecha', required, className }: {
  value: string; onChange: (v: string) => void; max?: string; min?: string; invalid?: boolean; id?: string; label?: string; required?: boolean; className?: string
}) {
  const [text, setText] = useState(() => dateToDisplay(value))
  const [seen, setSeen] = useState(value)
  const pop = usePopover()
  if (value !== seen) { setSeen(value); setText(dateToDisplay(value)) }
  const parsed = dateFromDisplay(text)
  const out = !!parsed && ((!!max && parsed > max) || (!!min && parsed < min))
  const bad = (text.length >= 10 && !parsed) || out || invalid
  const set = (v: string) => { setSeen(v); setText(dateToDisplay(v)); onChange(v) }
  return (
    <span className={`dtf dtf--date${className ? ` ${className}` : ''}`} ref={pop.ref}>
      <input id={id} className={`input num dtf__input${bad ? ' input--error' : ''}`} inputMode="numeric" autoComplete="off" placeholder="dd/mm/aaaa" aria-label={label}
        aria-invalid={bad || undefined} aria-required={required || undefined} value={text}
        onChange={(e) => {
          const t = maskDate(e.target.value)
          setText(t)
          const v = dateFromDisplay(t)
          if (v && (!max || v <= max) && (!min || v >= min)) { setSeen(v); onChange(v) }
          if (!t && !required) { setSeen(''); onChange('') }
        }}
        onBlur={() => { if (text && !dateFromDisplay(text)) setText(dateToDisplay(value)) }} />
      <button type="button" className="icon-btn dtf__btn" aria-label={`Elegir ${label.toLowerCase()}`} aria-expanded={pop.open} onClick={() => pop.setOpen(!pop.open)}><CalendarDays size={17} /></button>
      {text.length >= 10 && !parsed && <small className="field__msg field__msg--error dtf__msg">No es una fecha válida.</small>}
      {pop.open && (
        <span className="dtf__pop" role="dialog" aria-label={label}>
          <Calendar value={value} min={min} max={max} onPick={(ymd) => { set(ymd); pop.setOpen(false) }} />
          <span className="dtf__popfoot"><button type="button" className="btn btn--ghost btn--sm" onClick={() => { set(toLocalValue(new Date()).slice(0, 10)); pop.setOpen(false) }}>Hoy</button></span>
        </span>
      )}
    </span>
  )
}

/** Sólo hora: valor «HH:mm» (24 horas). */
export function TimeField({ value, onChange, invalid, id, label = 'Hora', step }: {
  value: string; onChange: (v: string) => void; invalid?: boolean; id?: string; label?: string; step?: number
}) {
  const [text, setText] = useState(value)
  const [seen, setSeen] = useState(value)
  const pop = usePopover()
  if (value !== seen) { setSeen(value); setText(value) }
  const parsed = timeFromDisplay(text)
  const bad = (text.length >= 5 && !parsed) || invalid
  const set = (v: string) => { setSeen(v); setText(v); onChange(v) }
  void step
  return (
    <span className="dtf dtf--time" ref={pop.ref}>
      <input id={id} className={`input num dtf__input${bad ? ' input--error' : ''}`} inputMode="numeric" autoComplete="off" placeholder="HH:mm" aria-label={label} aria-invalid={bad || undefined} value={text}
        onChange={(e) => { const t = maskTime(e.target.value); setText(t); const v = timeFromDisplay(t); if (v) { setSeen(v); onChange(v) } }}
        onBlur={() => { if (!timeFromDisplay(text)) setText(value) }} />
      <button type="button" className="icon-btn dtf__btn" aria-label={`Elegir ${label.toLowerCase()}`} aria-expanded={pop.open} onClick={() => pop.setOpen(!pop.open)}><Clock size={17} /></button>
      {pop.open && (
        <span className="dtf__pop dtf__pop--time" role="dialog" aria-label={label}>
          <TimePicker value={value} onPick={set} />
          <span className="dtf__popfoot"><button type="button" className="btn btn--primary btn--sm" onClick={() => pop.setOpen(false)}>Listo</button></span>
        </span>
      )}
    </span>
  )
}
