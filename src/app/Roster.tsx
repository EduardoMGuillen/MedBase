import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { Modal } from '../components/ui'
import { cap, localISODate, shortStaff } from '../lib/format'
import { hasRole } from '../lib/permissions'
import { useNow } from '../lib/hooks'

interface Shift { id: string; day: string; staffId: string }
const DOW = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

/**
 * AD3 (ronda 5): rol de turnos. Un mes en cuadrícula; al tocar un día se marcan los médicos que trabajan ese día (uno o
 * varios) y se quita a alguien desmarcándolo. Es informativo: la agenda se sigue rigiendo por «Horarios de médicos».
 * Cada cambio queda en la bitácora, también si el día ya pasó.
 */
export function Roster() {
  const { staff, notify } = useStore()
  const now = useNow()
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [shifts, setShifts] = useState<Shift[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const doctors = staff.filter((s) => s.active && hasRole(s, 'doctor')).sort((a, b) => a.name.localeCompare(b.name, 'es'))
  // La cuadrícula empieza el lunes de la semana del día 1 y termina el domingo de la semana del último día
  const first = new Date(month)
  first.setDate(1 - ((month.getDay() + 6) % 7))
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0)
  last.setDate(last.getDate() + (6 - ((last.getDay() + 6) % 7)))
  const days: Date[] = []
  for (const d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) days.push(new Date(d))
  const from = localISODate(first)
  const to = localISODate(last)
  const load = useCallback(() => {
    api<Shift[]>(`/roster?from=${from}&to=${to}`).then(setShifts).catch((e: Error) => notify(e.message, 'error'))
  }, [from, to, notify])
  useEffect(load, [load])
  const today = localISODate(now)
  const of = (day: string) => (shifts ?? []).filter((s) => s.day === day)
  const name = (id: string) => staff.find((s) => s.id === id)?.name ?? 'Médico'
  const toggle = async (day: string, staffId: string) => {
    setBusy(true)
    try {
      const on = of(day).find((s) => s.staffId === staffId)
      if (on) await api(`/roster/${on.id}`, { method: 'DELETE' })
      else await api('/roster', { body: { day, staffId } })
      load()
    } catch (e) { notify((e as Error).message, 'error') } finally { setBusy(false) }
  }
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1))
  const title = cap(month.toLocaleDateString('es-HN', { month: 'long', year: 'numeric' }))
  const openDate = open ? new Date(`${open}T00:00:00`) : null

  return (
    <section className="panel" data-tour="rol-turnos">
      <div className="panel__head" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div><h2>Rol de turnos</h2><p>Qué médico trabaja cada día. Es informativo: la agenda sigue los horarios de cada médico. Toca un día para asignar o quitar médicos.</p></div>
        <div className="roster__nav">
          <button className="icon-btn" aria-label="Mes anterior" onClick={() => shift(-1)}><ChevronLeft size={18} /></button>
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Mes siguiente" onClick={() => shift(1)}><ChevronRight size={18} /></button>
          <button className="btn btn--soft btn--sm" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)) }}>Hoy</button>
        </div>
      </div>
      <div className="panel__body">
        {!doctors.length ? <div className="empty">No hay médicos activos en la clínica.</div> : (
          <div className="roster__grid" aria-busy={!shifts}>
            {DOW.map((d) => <div key={d} className="roster__dow">{d}</div>)}
            {days.map((d) => {
              const iso = localISODate(d)
              const list = of(iso)
              const out = d.getMonth() !== month.getMonth()
              return (
                <button key={iso} type="button" className={`roster__day${out ? ' is-out' : ''}${iso === today ? ' is-today' : ''}`} onClick={() => setOpen(iso)}
                  aria-label={`${d.toLocaleDateString('es-HN', { weekday: 'long', day: 'numeric', month: 'long' })}: ${list.length ? list.map((s) => name(s.staffId)).join(', ') : 'sin médicos asignados'}`}>
                  <span className="roster__wd">{d.toLocaleDateString('es-HN', { weekday: 'long' })}</span>
                  <span className="roster__n">{d.getDate()}</span>
                  {list.map((s) => <span key={s.id} className="roster__doc" title={name(s.staffId)}>{shortStaff(name(s.staffId))}</span>)}
                  {!list.length && !out && <span className="roster__empty">Sin asignar</span>}
                </button>
              )
            })}
          </div>
        )}
      </div>
      {open && openDate && (
        <Modal title={`Turno del ${openDate.toLocaleDateString('es-HN', { weekday: 'long', day: 'numeric', month: 'long' })}`} onClose={() => setOpen(null)}
          footer={<button className="btn btn--primary" onClick={() => setOpen(null)}>Listo</button>}>
          {open < today && <p className="alert-strip alert-strip--amber">Es un día que ya pasó: el cambio queda en la bitácora.</p>}
          <p className="muted" style={{ fontSize: 14 }}>Marca los médicos que trabajan este día. Cada cambio se guarda al momento.</p>
          <div className="roster__pick">
            {doctors.map((d) => (
              <label key={d.id} className="check-line"><input type="checkbox" disabled={busy} checked={of(open).some((s) => s.staffId === d.id)} onChange={() => toggle(open, d.id)} />
                <span><b>{d.name}</b><small>{d.specialty ?? 'Médico'}</small></span></label>
            ))}
          </div>
        </Modal>
      )}
    </section>
  )
}
