import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Globe, Plus, Receipt } from 'lucide-react'
import { useStore } from '../lib/store'
import { Avatar, Modal, PageHead, StatusBadge } from '../components/ui'
import { ReminderButton } from '../components/Reminder'
import { cap, fullName, localISODate, time } from '../lib/format'
import { useIsPhone } from '../lib/hooks'
import type { Appointment, Patient, Staff } from '../lib/types'

const START_H = 7
const END_H = 19
const HOUR_PX = 96
const pad = (n: number) => String(n).padStart(2, '0')
const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

type View = 'day' | 'week' | 'month'

const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const startOfWeek = (d: Date) => addDays(d, -((d.getDay() + 6) % 7)) // semana de lunes a domingo
const sameDate = (a: Date, b: Date) => localISODate(a) === localISODate(b)

function range(view: View, cursor: Date): [Date, Date] {
  if (view === 'day') return [cursor, cursor]
  if (view === 'week') { const s = startOfWeek(cursor); return [s, addDays(s, 6)] }
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const s = startOfWeek(first)
  return [s, addDays(s, 41)] // 6 semanas completas
}

export default function Agenda() {
  const store = useStore()
  const { staff, patients, user, can, patient, fetchAppointments, notify } = store
  const navigate = useNavigate()
  const phone = useIsPhone()
  const [view, setView] = useState<View>('day')
  const [cursor, setCursor] = useState(() => new Date())
  const [doctorFilter, setDoctorFilter] = useState<string>(() => (user?.role === 'doctor' ? user.id : 'all'))
  const [loaded, setLoaded] = useState<{ key: string; list: Appointment[] } | null>(null)
  const [creating, setCreating] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null)

  const doctors = staff.filter((s) => s.role === 'doctor' && s.active)
  const shown = doctorFilter === 'all' ? doctors : doctors.filter((d) => d.id === doctorFilter)
  const [from, to] = range(view, cursor)
  const key = `${localISODate(from)}_${localISODate(to)}`

  // El rango visible se pide al servidor; así la agenda llega a cualquier mes, pasado o futuro
  useEffect(() => {
    let alive = true
    fetchAppointments(localISODate(from), localISODate(to))
      .then((list) => alive && setLoaded({ key, list }))
      .catch((e: Error) => notify(e.message, 'error'))
    return () => { alive = false }
    // Se recarga al cambiar el rango o cuando cambian las citas en el resto de la app
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, store.appointments, fetchAppointments, notify])

  const list = useMemo(() => (loaded?.list ?? []).filter((a) => a.status !== 'cancelled' && shown.some((d) => d.id === a.doctorId)), [loaded, shown])
  const onDay = (d: Date) => list.filter((a) => a.start.startsWith(localISODate(d))).sort((a, b) => a.start.localeCompare(b.start))
  const selected = (loaded?.list ?? []).find((a) => a.id === selectedId) ?? store.appointments.find((a) => a.id === selectedId)
  const colorOf = (id: string) => staff.find((s) => s.id === id)?.color ?? 'var(--ink)'

  const step = (n: number) => setCursor((c) => view === 'month' ? new Date(c.getFullYear(), c.getMonth() + n, 1) : addDays(c, view === 'week' ? 7 * n : n))
  const title = view === 'day'
    ? cap(cursor.toLocaleDateString('es-HN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))
    : view === 'week'
      ? `${from.getDate()} ${from.getMonth() !== to.getMonth() ? from.toLocaleDateString('es-HN', { month: 'short' }) : ''} al ${to.toLocaleDateString('es-HN', { day: 'numeric', month: 'long', year: 'numeric' })}`
      : cap(cursor.toLocaleDateString('es-HN', { month: 'long', year: 'numeric' }))
  const openDay = (d: Date) => { setCursor(d); setView('day') }

  return (
    <div className="page">
      <PageHead title="Agenda" sub={loaded?.key === key ? `${list.length} citas en este periodo` : 'Cargando citas…'}
        actions={can('agenda.manage') && <button className="btn btn--primary" onClick={() => setCreating(localISODate(view === 'day' ? cursor : new Date()))}><Plus size={17} />Nueva cita</button>} />

      <div className="cal-bar">
        <div className="cal-bar__nav">
          <button className="btn btn--ghost btn--sm" onClick={() => setCursor(new Date())}>Hoy</button>
          <button className="icon-btn" onClick={() => step(-1)} aria-label="Anterior"><ChevronLeft size={20} /></button>
          <button className="icon-btn" onClick={() => step(1)} aria-label="Siguiente"><ChevronRight size={20} /></button>
          <h2 className="cal-bar__title">{title}</h2>
        </div>
        <div className="cal-bar__tools">
          <input className="input cal-bar__date" type="date" value={localISODate(cursor)} aria-label="Ir a una fecha"
            onChange={(e) => e.target.value && setCursor(new Date(`${e.target.value}T12:00:00`))} />
          <select className="select cal-bar__doc" value={doctorFilter} onChange={(e) => setDoctorFilter(e.target.value)} aria-label="Médico">
            <option value="all">Todos los médicos</option>
            {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <div className="segmented" role="radiogroup" aria-label="Vista">
            {(['day', 'week', 'month'] as View[]).map((v) => <button key={v} role="radio" aria-checked={view === v} onClick={() => setView(v)}>{{ day: 'Día', week: 'Semana', month: 'Mes' }[v]}</button>)}
          </div>
        </div>
      </div>

      {view === 'day' && (phone && shown.length > 1
        ? <DayList days={[cursor]} onDay={onDay} patient={patient} staff={staff} onPick={setSelectedId} />
        : <DayGrid day={cursor} doctors={shown} list={onDay(cursor)} patient={patient} onPick={setSelectedId} />)}

      {view === 'week' && (phone
        ? <DayList days={Array.from({ length: 7 }, (_, i) => addDays(from, i))} onDay={onDay} patient={patient} staff={staff} onPick={setSelectedId} onOpenDay={openDay} />
        : <WeekGrid start={from} onDay={onDay} doctors={shown} colorOf={colorOf} patient={patient} onPick={setSelectedId} onOpenDay={openDay} />)}

      {view === 'month' && <MonthGrid cursor={cursor} start={from} onDay={onDay} colorOf={colorOf} patient={patient} phone={phone}
        onPick={setSelectedId} onOpenDay={openDay} staff={staff} />}

      {selected && (() => {
        const a = selected
        const p = patient(a.patientId)
        if (!p) return null
        const open = ['scheduled', 'confirmed'].includes(a.status)
        const act = async (fn: () => Promise<unknown>) => { if (await fn()) setSelectedId(null) }
        return (
          <Modal title={fullName(p)} onClose={() => setSelectedId(null)} footer={<>
            {can('agenda.manage') && open && <button className="btn btn--danger" onClick={() => act(() => store.setStatus(a.id, 'cancelled', 'Cita cancelada'))}>Cancelar cita</button>}
            {can('agenda.manage') && open && <button className="btn btn--ghost" onClick={() => { setRescheduling(a); setSelectedId(null) }}>Reprogramar</button>}
            {can('checkin.manage') && open && sameDate(new Date(a.start), new Date()) && <button className="btn btn--soft" onClick={() => act(() => store.setStatus(a.id, 'arrived', 'Llegada registrada'))}>Registrar llegada</button>}
            {can('consult.write') && a.doctorId === user?.id && ['arrived', 'triaged', 'in_consult'].includes(a.status) &&
              <button className="btn btn--primary" onClick={() => navigate(`/app/consulta/${a.id}`)}>Atender</button>}
            {can('billing.manage') && a.status === 'done' && a.paid === false && <button className="btn btn--primary" onClick={() => navigate('/app/caja')}><Receipt size={15} />Ir a cobrar</button>}
            <button className="btn btn--ghost" onClick={() => navigate(`/app/pacientes/${p.id}`)}>Abrir expediente</button>
          </>}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <StatusBadge status={a.status} />
              {a.type === 'urgent' && <span className="badge badge--red">Urgente</span>}
              {a.source === 'online' && <span className="badge badge--ink">Reservada en línea</span>}
              {a.remindedAt && open && <span className="badge badge--mint">Recordatorio enviado</span>}
              {a.paid === true && <span className="badge badge--mint">Cobrada</span>}
            </div>
            <div className="chart-meta" style={{ marginTop: 0 }}>
              <span>{cap(new Date(a.start).toLocaleDateString('es-HN', { weekday: 'long', day: 'numeric', month: 'long' }))}</span>
              <span>Hora <b>{time(a.start)}</b></span><span>Duración <b>{a.minutes} min</b></span>
              <span>{staff.find((s) => s.id === a.doctorId)?.name}</span>
              <span>Exp. <b>{p.record}</b></span><span>Tel. <b>{p.phone}</b></span>
            </div>
            <p><b>Motivo:</b> {a.reason}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {open && (can('agenda.manage') || can('checkin.manage')) && <ReminderButton appt={a} />}
              {a.status === 'scheduled' && can('agenda.manage') && (
                <button className="btn btn--ghost btn--sm" onClick={() => store.setStatus(a.id, 'confirmed', 'Cita confirmada')}>Marcar como confirmada</button>
              )}
              {open && can('checkin.manage') && new Date(a.start) < new Date() && (
                <button className="btn btn--ghost btn--sm" onClick={() => act(() => store.setStatus(a.id, 'no_show', 'Inasistencia registrada'))}>Marcar que no asistió</button>
              )}
            </div>
          </Modal>
        )
      })()}

      {creating && <AppointmentForm title="Nueva cita" submitLabel="Agendar cita" doctors={doctors} patients={patients}
        initial={{ date: creating, doctorId: user?.role === 'doctor' ? user.id : doctorFilter !== 'all' ? doctorFilter : doctors[0]?.id }}
        onClose={() => setCreating(null)}
        onSave={async (a) => { if (await store.addAppointment(a)) setCreating(null) }} />}

      {rescheduling && <AppointmentForm title="Reprogramar cita" submitLabel="Guardar cambios" doctors={doctors} patients={patients} lockPatient
        initial={{
          patientId: rescheduling.patientId, doctorId: rescheduling.doctorId, date: rescheduling.start.slice(0, 10), time: rescheduling.start.slice(11, 16),
          minutes: rescheduling.minutes, reason: rescheduling.reason, type: rescheduling.type,
        }}
        onClose={() => setRescheduling(null)}
        onSave={async (a) => {
          if (await store.reschedule(rescheduling.id, { doctorId: a.doctorId, start: a.start, minutes: a.minutes, reason: a.reason })) setRescheduling(null)
        }} />}
    </div>
  )
}

const top = (iso: string) => { const s = new Date(iso); return ((s.getHours() - START_H) * 60 + s.getMinutes()) * (HOUR_PX / 60) }
const shortName = (p: Patient) => `${p.firstName.split(' ')[0]} ${p.lastName.split(' ')[0]}`

function NowLine({ day }: { day: Date }) {
  const now = new Date()
  if (!sameDate(day, now)) return null
  const y = ((now.getHours() - START_H) * 60 + now.getMinutes()) * (HOUR_PX / 60)
  if (y <= 0 || y >= (END_H - START_H) * HOUR_PX) return null
  return <div className="cal__now cal__now--col" style={{ top: y }} aria-hidden="true" />
}

function Hours() {
  return <div className="cal__hours">{Array.from({ length: END_H - START_H }, (_, i) => <div key={i} className="cal__hour">{pad(START_H + i)}:00</div>)}</div>
}

function ApptBlock({ a, p, color, style, compact, onPick }: { a: Appointment; p: Patient; color: string; style: React.CSSProperties; compact?: boolean; onPick: (id: string) => void }) {
  return (
    <button className={`appt ${a.status === 'done' || a.status === 'no_show' ? 'appt--done' : ''} ${a.type === 'urgent' ? 'appt--urgent' : ''} ${compact ? 'appt--compact' : ''}`}
      style={{ ...style, ['--c' as string]: color, textAlign: 'left', border: 0, borderLeft: `3px solid ${color}` }} onClick={() => onPick(a.id)}
      title={`${time(a.start)} ${fullName(p)}: ${a.reason}`}>
      {compact ? <><strong>{time(a.start)}</strong><span className="appt__name">{shortName(p)}</span></> : <strong>{time(a.start)} {fullName(p)}</strong>}
      {!compact && <span>{a.source === 'online' && <Globe size={11} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 4 }} aria-label="Reservada en línea" />}{a.reason}</span>}
    </button>
  )
}

function DayGrid({ day, doctors, list, patient, onPick }: { day: Date; doctors: Staff[]; list: Appointment[]; patient: (id: string) => Patient | undefined; onPick: (id: string) => void }) {
  const cols = `56px repeat(${doctors.length}, minmax(180px, 1fr))`
  return (
    <section className="panel cal">
      <div className="cal__inner">
        <div className="cal__heads" style={{ gridTemplateColumns: cols }}>
          <div />
          {doctors.map((d) => <div key={d.id} className="cal__head"><Avatar name={d.name} color={d.color} /><div><strong>{d.name}</strong><small>{d.specialty}</small></div></div>)}
        </div>
        <div className="cal__body" style={{ gridTemplateColumns: cols }}>
          <Hours />
          {doctors.map((d) => (
            <div key={d.id} className="cal__col" style={{ height: (END_H - START_H) * HOUR_PX }}>
              {list.filter((a) => a.doctorId === d.id).map((a) => {
                const p = patient(a.patientId)
                return p && <ApptBlock key={a.id} a={a} p={p} color={d.color} onPick={onPick} style={{ top: top(a.start) + 2, height: a.minutes * (HOUR_PX / 60) - 4 }} />
              })}
              <NowLine day={day} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function WeekGrid({ start, onDay, doctors, colorOf, patient, onPick, onOpenDay }: {
  start: Date; onDay: (d: Date) => Appointment[]; doctors: Staff[]; colorOf: (id: string) => string
  patient: (id: string) => Patient | undefined; onPick: (id: string) => void; onOpenDay: (d: Date) => void
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const cols = '56px repeat(7, minmax(110px, 1fr))'
  return (
    <section className="panel cal">
      <div className="cal__inner cal__inner--week">
        <div className="cal__heads" style={{ gridTemplateColumns: cols }}>
          <div />
          {days.map((d, i) => (
            <button key={i} className={`cal__head cal__head--day ${sameDate(d, new Date()) ? 'is-today' : ''}`} onClick={() => onOpenDay(d)}>
              <small>{WEEKDAYS[i]}</small><strong className="num">{d.getDate()}</strong><small>{onDay(d).length || ''}</small>
            </button>
          ))}
        </div>
        <div className="cal__body" style={{ gridTemplateColumns: cols }}>
          <Hours />
          {days.map((d, i) => (
            <div key={i} className="cal__col" style={{ height: (END_H - START_H) * HOUR_PX }}>
              {layoutLanes(onDay(d)).map(({ a, lane, lanes }) => {
                const p = patient(a.patientId)
                return p && <ApptBlock key={a.id} a={a} p={p} color={colorOf(a.doctorId)} compact onPick={onPick}
                  style={{ top: top(a.start) + 2, height: a.minutes * (HOUR_PX / 60) - 4, left: `calc(${(lane / lanes) * 100}% + 3px)`, right: 'auto', width: `calc(${100 / lanes}% - 6px)` }} />
              })}
              <NowLine day={d} />
            </div>
          ))}
        </div>
      </div>
      {doctors.length > 1 && <div className="cal__legend">{doctors.map((d) => <span key={d.id}><i style={{ background: d.color }} />{d.name}</span>)}</div>}
    </section>
  )
}

/**
 * Reparte en carriles sólo las citas que se superponen; las demás usan todo el ancho del día.
 */
function layoutLanes(list: Appointment[]) {
  const span = (a: Appointment) => { const s = new Date(a.start).getTime(); return [s, s + a.minutes * 60_000] as const }
  const out: { a: Appointment; lane: number; lanes: number }[] = []
  let cluster: { a: Appointment; lane: number; lanes: number }[] = []
  let ends: number[] = []
  let clusterEnd = 0
  const close = () => { const n = Math.max(1, ends.length); cluster.forEach((c) => { c.lanes = n }); out.push(...cluster); cluster = []; ends = [] }
  for (const a of [...list].sort((x, y) => x.start.localeCompare(y.start))) {
    const [s, e] = span(a)
    if (cluster.length && s >= clusterEnd) close()
    let lane = ends.findIndex((end) => end <= s)
    if (lane === -1) { lane = ends.length; ends.push(e) } else ends[lane] = e
    cluster.push({ a, lane, lanes: 1 })
    clusterEnd = Math.max(clusterEnd, e)
  }
  close()
  return out
}

function MonthGrid({ cursor, start, onDay, colorOf, patient, phone, onPick, onOpenDay, staff }: {
  cursor: Date; start: Date; onDay: (d: Date) => Appointment[]; colorOf: (id: string) => string; patient: (id: string) => Patient | undefined
  phone: boolean; onPick: (id: string) => void; onOpenDay: (d: Date) => void; staff: Staff[]
}) {
  const [picked, setPicked] = useState<Date | null>(null)
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i))
  const max = phone ? 0 : 3
  return (
    <>
      <section className="panel month">
        <div className="month__head">{WEEKDAYS.map((w) => <span key={w}>{w}</span>)}</div>
        <div className="month__grid">
          {days.map((d) => {
            const items = onDay(d)
            const other = d.getMonth() !== cursor.getMonth()
            const isPicked = picked && sameDate(picked, d)
            return (
              <div key={d.toISOString()} className={`month__cell ${other ? 'is-other' : ''} ${sameDate(d, new Date()) ? 'is-today' : ''} ${isPicked ? 'is-picked' : ''}`}
                onClick={() => (phone ? setPicked(d) : onOpenDay(d))} role="button" tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && (phone ? setPicked(d) : onOpenDay(d))}
                aria-label={`${d.toLocaleDateString('es-HN', { weekday: 'long', day: 'numeric', month: 'long' })}: ${items.length} citas`}>
                <span className="month__day num">{d.getDate()}</span>
                {phone ? (items.length > 0 && <span className="month__count num">{items.length}</span>) : (<>
                  {items.slice(0, max).map((a) => {
                    const p = patient(a.patientId)
                    return p && (
                      <button key={a.id} className="month__chip" style={{ ['--c' as string]: colorOf(a.doctorId) }}
                        onClick={(e) => { e.stopPropagation(); onPick(a.id) }}>
                        <span className="num">{time(a.start)}</span> {shortName(p)}
                      </button>
                    )
                  })}
                  {items.length > max && <span className="month__more">{items.length - max} más</span>}
                </>)}
              </div>
            )
          })}
        </div>
      </section>
      {phone && picked && <DayList days={[picked]} onDay={onDay} patient={patient} staff={staff} onPick={onPick} />}
    </>
  )
}

function DayList({ days, onDay, patient, staff, onPick, onOpenDay }: {
  days: Date[]; onDay: (d: Date) => Appointment[]; patient: (id: string) => Patient | undefined; staff: Staff[]
  onPick: (id: string) => void; onOpenDay?: (d: Date) => void
}) {
  return (
    <div className="day-list">
      {days.map((d) => {
        const items = onDay(d)
        return (
          <section key={d.toISOString()} className="panel">
            <div className="panel__head">
              <h2 className={sameDate(d, new Date()) ? 'is-today' : ''}>{cap(d.toLocaleDateString('es-HN', { weekday: 'long', day: 'numeric', month: 'long' }))}</h2>
              {onOpenDay && items.length > 0 && <button className="btn btn--ghost btn--sm" onClick={() => onOpenDay(d)}>Ver día</button>}
            </div>
            {items.length ? <div className="rows">{items.map((a) => {
              const p = patient(a.patientId)
              const doc = staff.find((s) => s.id === a.doctorId)
              return p && (
                <button key={a.id} className="row row--btn" onClick={() => onPick(a.id)} style={{ ['--c' as string]: doc?.color }}>
                  <span className="row__time">{time(a.start)}</span>
                  <span className="row__who"><strong>{fullName(p)}</strong><span>{a.reason}, {doc?.name}</span></span>
                  <span className="row__end"><StatusBadge status={a.status} /></span>
                </button>
              )
            })}</div> : <div className="empty" style={{ padding: 18 }}>Sin citas.</div>}
          </section>
        )
      })}
    </div>
  )
}

interface FormState { patientId: string; doctorId: string; date: string; time: string; minutes: number; reason: string; type: Appointment['type'] }

function AppointmentForm({ title, submitLabel, doctors, patients, initial, lockPatient, onClose, onSave }: {
  title: string; submitLabel: string; doctors: Staff[]; patients: Patient[]; initial: Partial<FormState>; lockPatient?: boolean
  onClose: () => void; onSave: (a: Omit<Appointment, 'id' | 'status' | 'arrivedAt'>) => Promise<void>
}) {
  const [f, setF] = useState<FormState>({
    patientId: patients[0]?.id ?? '', doctorId: doctors[0]?.id ?? '', date: localISODate(new Date()), time: '10:00', minutes: 30, reason: '', type: 'followup', ...initial,
  } as FormState)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((x) => ({ ...x, [k]: v }))
  const valid = f.patientId && f.doctorId && f.reason.trim() && f.date && f.time
  return (
    <Modal title={title} onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!valid || busy} onClick={async () => {
        setBusy(true)
        await onSave({ patientId: f.patientId, doctorId: f.doctorId, start: `${f.date}T${f.time}:00`, minutes: f.minutes, reason: f.reason.trim(), type: f.type })
        setBusy(false)
      }}>{submitLabel}</button>
    </>}>
      <label className="field"><span>Paciente</span>
        <select className="select" value={f.patientId} disabled={lockPatient} onChange={(e) => set('patientId', e.target.value)}>
          {[...patients].sort((a, b) => fullName(a).localeCompare(fullName(b))).map((p) => <option key={p.id} value={p.id}>{fullName(p)} ({p.record})</option>)}
        </select>
      </label>
      <label className="field"><span>Médico</span>
        <select className="select" value={f.doctorId} onChange={(e) => set('doctorId', e.target.value)}>
          {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}, {d.specialty}</option>)}
        </select>
      </label>
      <div className="form-grid form-grid--3">
        <label className="field"><span>Fecha</span><input className="input" type="date" value={f.date} onChange={(e) => set('date', e.target.value)} /></label>
        <label className="field"><span>Hora</span><input className="input" type="time" step={900} value={f.time} onChange={(e) => set('time', e.target.value)} /></label>
        <label className="field"><span>Duración</span>
          <select className="select" value={f.minutes} onChange={(e) => set('minutes', Number(e.target.value))}>
            {[15, 30, 45, 60].map((m) => <option key={m} value={m}>{m} min</option>)}
          </select>
        </label>
      </div>
      <label className="field"><span>Motivo de consulta</span><input className="input" value={f.reason} onChange={(e) => set('reason', e.target.value)} placeholder="Ej. Control de presión arterial" /></label>
      {!lockPatient && (
        <label className="field"><span>Tipo</span>
          <select className="select" value={f.type} onChange={(e) => set('type', e.target.value as Appointment['type'])}>
            <option value="first">Primera vez</option><option value="followup">Seguimiento</option><option value="urgent">Urgente</option>
          </select>
        </label>
      )}
    </Modal>
  )
}
