import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Globe, Receipt, Stethoscope } from 'lucide-react'
import { useStore } from '../lib/store'
import { PageHead, StatusBadge } from '../components/ui'
import { ReminderButton } from '../components/Reminder'
import { HBars } from '../components/Charts'
import { date, fullName, localISODate, money, sameDay, time } from '../lib/format'
import type { Appointment } from '../lib/types'
import Platform from './Platform'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
}

export function ApptRows({ list, showDoctor = false, action, empty = 'No hay citas en esta lista.' }: {
  list: Appointment[]; showDoctor?: boolean; action?: (a: Appointment) => React.ReactNode; empty?: string
}) {
  const { patient, staffById } = useStore()
  if (!list.length) return <div className="empty">{empty}</div>
  const nowMs = Date.now()
  return (
    <div className="rows">
      {list.map((a) => {
        const p = patient(a.patientId)
        if (!p) return null
        const start = new Date(a.start).getTime()
        const isNow = nowMs >= start && nowMs < start + a.minutes * 60000
        return (
          <div key={a.id} className={`row ${isNow ? 'row--now' : ''}`}>
            <span className="row__time">{time(a.start)}</span>
            <Link to={`/app/pacientes/${p.id}`} style={{ textDecoration: 'none' }} className="row__who">
              <strong>{fullName(p)}</strong>
              <span>{a.source === 'online' && <Globe size={12} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 4 }} aria-label="Reservada en línea" />}
                {a.reason}{showDoctor ? `, con ${staffById(a.doctorId)?.name}` : ''}{a.type === 'urgent' ? ', urgente' : ''}</span>
            </Link>
            <div className="row__end">
              <StatusBadge status={a.status} />
              {action?.(a)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function Dashboard() {
  const { user, appointments, patients, staff, audit, staffById, settings, can, fetchPayments } = useStore()
  const [todayRevenue, setTodayRevenue] = useState<number | null>(null)
  useEffect(() => {
    if (!can('billing.manage')) return
    const k = localISODate(new Date())
    fetchPayments(k, k).then((ps) => setTodayRevenue(ps.filter((p) => !p.voided && localISODate(new Date(p.paidAt)) === k).reduce((s, p) => s + p.total, 0))).catch(() => null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointments.length, fetchPayments])
  if (!user) return null
  // La administración de la plataforma no pertenece a una clínica: su inicio es la lista de clínicas
  if (user.role === 'superadmin') return <Platform />

  const now = new Date()
  const today = appointments.filter((a) => sameDay(a.start, now)).sort((a, b) => a.start.localeCompare(b.start))
  const first = user.name.split(' ').slice(0, 2).join(' ')

  if (user.role === 'doctor') {
    const mine = today.filter((a) => a.doctorId === user.id)
    const ready = mine.filter((a) => a.status === 'triaged')
    const next = mine.find((a) => ['scheduled', 'confirmed', 'arrived', 'triaged'].includes(a.status))
    return (
      <div className="page">
        <PageHead title={`${greeting()}, ${first}`} sub={next ? `Tu próxima cita es a las ${time(next.start)}.` : 'No tienes más citas pendientes hoy.'} />
        <div className="stats">
          <div className="stat"><b>{mine.filter((a) => a.status !== 'cancelled').length}</b><span>Citas hoy</span></div>
          <div className="stat"><b>{mine.filter((a) => a.status === 'done').length}</b><span>Atendidas</span></div>
          <div className="stat"><b>{ready.length}</b><span>Listas para consulta</span>{ready.length > 0 && <small>Con signos vitales tomados</small>}</div>
          <div className="stat"><b>{mine.filter((a) => a.status === 'arrived').length}</b><span>En sala de espera</span></div>
        </div>
        <div className="grid-2">
          <section className="panel">
            <div className="panel__head"><h2>Tu agenda de hoy</h2><Link className="btn btn--ghost btn--sm" to="/app/agenda">Ver agenda</Link></div>
            <ApptRows list={mine.filter((a) => a.status !== 'cancelled')} empty="No tienes citas hoy." action={(a) => ['triaged', 'arrived', 'in_consult'].includes(a.status) && (
              <Link className="btn btn--primary btn--sm" to={`/app/consulta/${a.id}`}><Stethoscope size={15} />{a.status === 'in_consult' ? 'Continuar' : 'Atender'}</Link>
            )} />
          </section>
          <section className="panel">
            <div className="panel__head"><h2>Listos para consulta</h2></div>
            {ready.length ? ready.map((a) => {
              const p = patients.find((x) => x.id === a.patientId)!
              return (
                <div key={a.id} className="queue-card" style={{ gridTemplateColumns: '1fr auto' }}>
                  <div className="row__who"><strong>{fullName(p)}</strong><span>{a.reason}</span>
                    {p.allergies.length > 0 && <div className="chips" style={{ marginTop: 6 }}>{p.allergies.map((x) => <span key={x} className="chip chip--red">Alergia: {x}</span>)}</div>}
                  </div>
                  <Link className="btn btn--soft btn--sm" to={`/app/consulta/${a.id}`}>Atender</Link>
                </div>
              )
            }) : <div className="empty">Cuando enfermería termine el triaje, el paciente aparecerá aquí.</div>}
          </section>
        </div>
      </div>
    )
  }

  if (user.role === 'nurse') {
    const arrived = today.filter((a) => a.status === 'arrived')
    return (
      <div className="page">
        <PageHead title={`${greeting()}, ${first}`} sub={arrived.length ? `${arrived.length} pacientes esperan triaje.` : 'Nadie espera triaje en este momento.'}
          actions={<Link className="btn btn--primary" to="/app/sala">Abrir sala de espera</Link>} />
        <div className="stats">
          <div className="stat"><b>{today.filter((a) => a.status !== 'cancelled').length}</b><span>Citas hoy</span></div>
          <div className="stat"><b>{today.filter((a) => ['scheduled', 'confirmed'].includes(a.status)).length}</b><span>Por llegar</span></div>
          <div className="stat"><b>{arrived.length}</b><span>Esperan triaje</span></div>
          <div className="stat"><b>{today.filter((a) => a.status === 'done').length}</b><span>Atendidas</span></div>
        </div>
        <section className="panel">
          <div className="panel__head"><h2>Agenda de la clínica hoy</h2></div>
          <ApptRows list={today.filter((a) => a.status !== 'cancelled')} showDoctor />
        </section>
      </div>
    )
  }

  if (user.role === 'reception') {
    const pending = today.filter((a) => ['scheduled', 'confirmed'].includes(a.status))
    const toCharge = appointments.filter((a) => a.status === 'done' && a.paid === false)
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
    const reminders = appointments.filter((a) => sameDay(a.start, tomorrow) && ['scheduled', 'confirmed'].includes(a.status)).sort((a, b) => a.start.localeCompare(b.start))
    const online = appointments.filter((a) => a.source === 'online' && a.status === 'scheduled' && new Date(a.start) >= now).sort((a, b) => a.start.localeCompare(b.start))
    return (
      <div className="page">
        <PageHead title={`${greeting()}, ${first}`} sub={`${pending.length} pacientes aún no llegan hoy.`}
          actions={<Link className="btn btn--primary" to="/app/sala">Abrir sala de espera</Link>} />
        <div className="stats">
          <div className="stat"><b>{today.filter((a) => a.status !== 'cancelled').length}</b><span>Citas hoy</span></div>
          <div className="stat"><b>{pending.length}</b><span>Por llegar</span></div>
          <div className="stat"><b>{toCharge.length}</b><span>Por cobrar</span>{toCharge.length > 0 && <small><Link to="/app/caja">Ir a caja</Link></small>}</div>
          <div className="stat"><b className="num">{todayRevenue == null ? '—' : money(todayRevenue, settings.currency)}</b><span>Cobrado hoy</span></div>
        </div>
        <div className="grid-2">
          <section className="panel">
            <div className="panel__head"><h2>Agenda de la clínica hoy</h2></div>
            <ApptRows list={today.filter((a) => a.status !== 'cancelled')} showDoctor action={(a) => a.status === 'done' && a.paid === false && (
              <Link className="btn btn--soft btn--sm" to="/app/caja"><Receipt size={14} />Cobrar</Link>
            )} />
          </section>
          <div style={{ display: 'grid', gap: 24 }}>
            <section className="panel">
              <div className="panel__head"><div><h2>Recordatorios para mañana</h2><p>{reminders.filter((a) => !a.remindedAt).length} sin enviar</p></div></div>
              {reminders.length ? <div className="rows">{reminders.map((a) => {
                const p = patients.find((x) => x.id === a.patientId)!
                return (
                  <div key={a.id} className="row" style={{ gridTemplateColumns: '52px 1fr auto' }}>
                    <span className="row__time" style={{ fontSize: 15 }}>{time(a.start)}</span>
                    <div className="row__who"><strong>{fullName(p)}</strong><span>{staffById(a.doctorId)?.name}</span></div>
                    <ReminderButton appt={a} compact />
                  </div>
                )
              })}</div> : <div className="empty">No hay citas mañana.</div>}
            </section>
            <section className="panel">
              <div className="panel__head"><div><h2>Reservas en línea</h2><p>Confírmalas desde la agenda</p></div><Link className="btn btn--ghost btn--sm" to="/app/agenda">Agenda</Link></div>
              {online.length ? <div className="rows">{online.slice(0, 6).map((a) => {
                const p = patients.find((x) => x.id === a.patientId)!
                return (
                  <div key={a.id} className="row" style={{ gridTemplateColumns: '1fr auto' }}>
                    <div className="row__who"><strong>{fullName(p)}</strong><span>{date(a.start, { weekday: 'short', day: 'numeric', month: 'short' })} {time(a.start)}, {staffById(a.doctorId)?.name}</span></div>
                    <ReminderButton appt={a} compact />
                  </div>
                )
              })}</div> : <div className="empty">No hay reservas nuevas por confirmar.</div>}
            </section>
          </div>
        </div>
      </div>
    )
  }

  // Administración: indicadores sin información clínica
  const doctors = staff.filter((s) => s.role === 'doctor' && s.active)
  const since = new Date(); since.setDate(since.getDate() - 30)
  const closed = appointments.filter((a) => ['done', 'no_show'].includes(a.status) && new Date(a.start) >= since)
  const attendance = closed.length ? Math.round((closed.filter((a) => a.status === 'done').length / closed.length) * 100) : null
  return (
    <div className="page">
      <PageHead title={`${greeting()}, ${first}`} sub="Resumen operativo de la clínica."
        actions={<Link className="btn btn--primary" to="/app/reportes">Ver reportes</Link>} />
      <div className="stats">
        <div className="stat"><b>{today.filter((a) => a.status !== 'cancelled').length}</b><span>Citas hoy</span></div>
        <div className="stat"><b className="num">{todayRevenue == null ? '—' : money(todayRevenue, settings.currency)}</b><span>Cobrado hoy</span></div>
        <div className="stat"><b className="num">{attendance == null ? '—' : `${attendance}%`}</b><span>Asistencia, últimos 30 días</span></div>
        <div className="stat"><b>{patients.length}</b><span>Pacientes registrados</span></div>
      </div>
      <div className="grid-2">
        <section className="panel">
          <div className="panel__head"><h2>Citas por médico hoy</h2></div>
          <div className="panel__body">
            <HBars rows={doctors.map((d) => {
              const n = today.filter((a) => a.doctorId === d.id && a.status !== 'cancelled').length
              return { key: d.id, label: d.name, value: n, display: String(n) }
            })} />
          </div>
        </section>
        <section className="panel">
          <div className="panel__head"><h2>Actividad reciente</h2><Link className="btn btn--ghost btn--sm" to="/app/personal">Ver bitácora</Link></div>
          {audit.length ? (
            <div className="rows">
              {audit.slice(0, 7).map((e) => (
                <div key={e.id} className="row" style={{ gridTemplateColumns: '54px 1fr' }}>
                  <span className="num" style={{ color: 'var(--muted)', fontSize: 13 }}>{time(e.at)}</span>
                  <div className="row__who"><strong>{e.userId === 'online' ? 'Reserva en línea' : staffById(e.userId)?.name}</strong><span>{e.action}</span></div>
                </div>
              ))}
            </div>
          ) : <div className="empty">Todavía no hay actividad registrada.</div>}
        </section>
      </div>
    </div>
  )
}
