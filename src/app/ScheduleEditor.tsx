import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { DAY_NAMES } from '../lib/format'
import { DEFAULT_SLOT, scheduleFromWeek, scheduleProblems, SLOT_OPTIONS, weekOf, type Week } from '../lib/schedule'
import type { Staff } from '../lib/types'

const ORDER = [1, 2, 3, 4, 5, 6, 0] // lunes a domingo

/**
 * Horario de atención de un médico: cada día con una o más franjas (ej. lunes 08:00–12:00 y 14:00–17:00).
 * La agenda sólo ofrece horas dentro de estas franjas, y la reserva en línea también.
 */
export function ScheduleEditor({ d, extra, onSaved, onDirty }: {
  d: Staff; extra?: React.ReactNode; onSaved?: () => void
  /** AD2 (ronda 5): avisa si hay cambios sin guardar y entrega cómo guardarlos (para preguntar antes de cambiar de médico). */
  onDirty?: (save: (() => Promise<boolean>) | null) => void
}) {
  const { updateSchedule } = useStore()
  const initialWeek = weekOf(d.schedule)
  const [week, setWeek] = useState<Week>(initialWeek)
  const [slot, setSlot] = useState(d.schedule?.slot || DEFAULT_SLOT)
  const [busy, setBusy] = useState(false)
  const problems = scheduleProblems(week)
  const dirty = JSON.stringify(scheduleFromWeek(week, slot)) !== JSON.stringify(scheduleFromWeek(initialWeek, d.schedule?.slot || DEFAULT_SLOT))
  const save = async () => {
    setBusy(true)
    const ok = !!(await updateSchedule(d.id, scheduleFromWeek(week, slot)))
    setBusy(false)
    if (ok) onSaved?.()
    return ok
  }
  const pending = dirty && !problems.length
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onDirty?.(dirty ? save : null) }, [dirty, pending, week, slot])
  const setDay = (day: number, ranges: Week[number]) => setWeek((w) => {
    const next = { ...w }
    if (ranges.length) next[day] = ranges; else delete next[day]
    return next
  })
  return (
    <div className="sched">
      <div className="sched__days">
        {ORDER.map((day) => {
          const ranges = week[day] ?? []
          const on = ranges.length > 0
          return (
            <div key={day} className={`sched__day ${on ? '' : 'is-off'}`}>
              <label className="sched__name"><input type="checkbox" checked={on} onChange={(e) => setDay(day, e.target.checked ? [{ start: '08:00', end: '12:00' }] : [])} />{DAY_NAMES[day]}</label>
              <div className="sched__ranges">
                {on ? ranges.map((r, i) => (
                  <span key={i} className="sched__range">
                    <input className="input" type="time" step={900} value={r.start} aria-label={`${DAY_NAMES[day]}, entrada de la franja ${i + 1}`}
                      onChange={(e) => setDay(day, ranges.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
                    <span className="muted">a</span>
                    <input className="input" type="time" step={900} value={r.end} aria-label={`${DAY_NAMES[day]}, salida de la franja ${i + 1}`}
                      onChange={(e) => setDay(day, ranges.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
                    <button type="button" className="icon-btn" aria-label={`Quitar franja ${i + 1} del ${DAY_NAMES[day].toLowerCase()}`} onClick={() => setDay(day, ranges.filter((_, j) => j !== i))}><X size={15} /></button>
                  </span>
                )) : <span className="muted">No atiende</span>}
                {on && ranges.length < 4 && (
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setDay(day, [...ranges, { start: ranges.at(-1)?.end && ranges.at(-1)!.end < '14:00' ? '14:00' : '17:00', end: '18:00' }])}>
                    <Plus size={14} />Otra franja</button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div className="sched__foot">
        <label className="field"><span>La agenda ofrece horas cada</span>
          <select className="select" value={slot} onChange={(e) => setSlot(Number(e.target.value))}>{SLOT_OPTIONS.map((m) => <option key={m} value={m}>{m} minutos</option>)}</select>
        </label>
        {extra}
      </div>
      {problems.length > 0 && <ul className="sched__problems">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      <button className="btn btn--primary" style={{ justifySelf: 'start' }} disabled={!dirty || problems.length > 0 || busy} onClick={save}>Guardar horario</button>
    </div>
  )
}
