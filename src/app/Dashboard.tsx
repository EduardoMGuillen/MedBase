import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, Globe, Phone, Receipt, Stethoscope } from 'lucide-react'
import { useStore } from '../lib/store'
import { PageHead, StatusBadge } from '../components/ui'
import { ReminderButton } from '../components/Reminder'
import { HBars } from '../components/Charts'
import { date, fullName, localISODate, money, sameDay, time } from '../lib/format'
import type { Appointment } from '../lib/types'
import Platform from './Platform'
import { features } from '../lib/permissions'
import { VitalsModal } from './WaitingRoom'
import { ArrivalsPanel } from './Arrivals'
import { CompleteRegistration } from './NewPatient'
import { pendingArrivals } from '../lib/arrivals'

/** Recepción llama el día del control. Los avisos de la semana y de la víspera ya salieron solos. */
function FollowupCalls() {
  const { followups, patient } = useStore()
  const today = localISODate(new Date())
  const due = followups.filter((f) => f.dueDate <= today).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  return (
    <section className="panel">
      <div className="panel__head">
        <div><h2>Llamar hoy: crónicos y seguimientos</h2>
          <p>{due.length ? 'Conviene llamar a estos pacientes para confirmar que vienen a su control.' : 'Hoy no hay controles que avisar. Los mensajes salen solos una semana antes, un día antes y el mismo día.'}</p></div>
        <Link className="btn btn--ghost btn--sm" to="/app/seguimientos">Ver seguimientos</Link>
      </div>
      {due.length ? <div className="rows">{due.map((f) => {
        const p = patient(f.patientId)
        if (!p) return null
        const late = f.dueDate < today
        return (
          <div key={f.id} className="row" style={{ gridTemplateColumns: '1fr auto' }}>
            <div className="row__who">
              <strong>{fullName(p)}</strong>
              <span>{f.title} · {p.phone} · {late ? `venció el ${date(`${f.dueDate}T12:00:00`)}` : 'hoy'}</span>
            </div>
            <a className="btn btn--soft btn--sm" href={`tel:${p.phone.replace(/\s/g, '')}`}><Phone size={14} />Llamar</a>
          </div>
        )
      })}</div> : <div className="empty">Nadie pendiente de llamada.</div>}
    </section>
  )
}

/** Enfermería: notas con órdenes médicas sin revisar. Desaparece cuando todas las órdenes de la nota están marcadas. */
function NewOrders() {
  const { pendingOrders = [], patient, bed, staffById } = useStore()
  if (!pendingOrders.length) return null
  return (
    <section className="panel pending-orders">
      <div className="panel__head"><div><h2>Órdenes nuevas</h2><p>Revisa y marca cada orden en la nota del paciente.</p></div></div>
      <div className="rows">{pendingOrders.map((x) => {
        const p = patient(x.patientId)
        const b = x.bedId ? bed(x.bedId) : undefined
        return (
          <Link key={x.noteId} className="row" to={`/app/hospitalizados/${x.hospitalizationId}?tab=notas`} style={{ gridTemplateColumns: '1fr auto' }}>
            <div className="row__who"><strong>{x.pending} {x.pending === 1 ? 'orden nueva' : 'órdenes nuevas'} — {p ? fullName(p) : ''}{b ? `, cuarto ${b.room}${b.label ? `-${b.label}` : ''}` : ''}</strong>
              <span>{staffById(x.authorId)?.name}, {time(x.at)}</span></div>
            <span className="btn btn--soft btn--sm">Revisar</span>
          </Link>
        )
      })}</div>
    </section>
  )
}

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
        const isNow = nowMs >= start && nowMs < start + 30 * 60000
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
  const { user, appointments, patients, staff, audit, staffById, settings, can, fetchPayments, setStatus } = useStore()
  const [todayRevenue, setTodayRevenue] = useState<number | null>(null)
  const [triage, setTriage] = useState<Appointment | null>(null)
  const [completing, setCompleting] = useState<Appointment | null>(null)
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

  // Recepción, administración, la asistente y el médico de un consultorio marcan la llegada desde la lista "Por llegar"
  const arrive = (a: Appointment) => {
    const p = patients.find((x) => x.id === a.patientId)
    // El paciente nuevo agendado por teléfono completa su registro antes de pasar a sala
    if (p?.pending) setCompleting(a)
    else setStatus(a.id, 'arrived', `Llegada de ${p?.firstName ?? 'paciente'} registrada`)
  }
  const completingPatient = completing ? patients.find((x) => x.id === completing.patientId) : undefined
  const completion = completing && completingPatient && (
    <CompleteRegistration patient={completingPatient} onClose={() => setCompleting(null)}
      onDone={async () => { setCompleting(null); await setStatus(completing.id, 'arrived', 'Registro completado y llegada registrada') }} />
  )
  const office = features(settings).office

  if (user.role === 'doctor') {
    const mine = today.filter((a) => a.doctorId === user.id && a.status !== 'cancelled')
    const waiting = mine.filter((a) => a.status === 'arrived')
    const ready = mine.filter((a) => a.status === 'triaged')
    const done = mine.filter((a) => a.status === 'done')
    const next = mine.find((a) => ['scheduled', 'confirmed', 'arrived', 'triaged', 'in_consult'].includes(a.status))
    const nextPatient = next && patients.find((x) => x.id === next.patientId)
    return (
      <div className="page">
        <PageHead title={`${greeting()}, ${first}`} sub={next ? `Tu próxima cita es a las ${time(next.start)}.` : 'No tienes más citas pendientes hoy.'}
          actions={<Link className="btn btn--primary" to="/app/consulta-externa">Ir a consulta externa</Link>} />
        <div className="stats">
          <Link className="stat" to="/app/consulta-externa"><b>{mine.length}</b><span>Citas hoy</span></Link>
          <Link className="stat" to="/app/consulta-externa"><b>{waiting.length}</b><span>En sala de espera</span></Link>
          <Link className="stat" to="/app/consulta-externa"><b>{ready.length}</b><span>Listos para consulta</span>{ready.length > 0 && <small>Con preclínica hecha</small>}</Link>
          <Link className="stat" to="/app/consulta-externa"><b>{done.length}</b><span>Atendidos</span></Link>
          {/* En su consultorio el médico también cobra */}
          {office && <Link className="stat" to="/app/caja"><b className="num">{todayRevenue == null ? '—' : money(todayRevenue, settings.currency)}</b><span>Cobrado hoy</span>
            {mine.some((a) => a.status === 'done' && a.paid === false) && <small>{mine.filter((a) => a.status === 'done' && a.paid === false).length} por cobrar</small>}</Link>}
        </div>
        {next && nextPatient && (
          <section className="panel">
            <div className="panel__head">
              <div><h2>Siguiente paciente</h2><p>{time(next.start)} · {next.reason}</p></div>
              {['triaged', 'arrived', 'in_consult'].includes(next.status)
                ? <Link className="btn btn--primary" to={`/app/consulta/${next.id}`}><Stethoscope size={16} />{next.status === 'in_consult' ? 'Continuar' : 'Atender'}</Link>
                : <Link className="btn btn--ghost" to="/app/agenda">Ver en la agenda</Link>}
            </div>
            <div className="panel__body"><strong>{fullName(nextPatient)}</strong><p className="muted" style={{ marginTop: 4 }}>{nextPatient.record}</p></div>
          </section>
        )}
        <ArrivalsPanel doctorId={user.id} onArrive={office ? arrive : undefined} />
        {office && completion}
        {office && <FollowupCalls />}
      </div>
    )
  }

  if (user.role === 'nurse') {
    const active = today.filter((a) => a.status !== 'cancelled')
    const inRoom = active.filter((a) => ['arrived', 'triaged', 'in_consult'].includes(a.status))
    const triageQueue = active.filter((a) => a.status === 'arrived')
    const done = active.filter((a) => a.status === 'done')
    return (
      <div className="page">
        <PageHead title={`${greeting()}, ${first}`} sub={triageQueue.length ? `${triageQueue.length} pacientes esperan preclínica.` : 'Nadie espera preclínica en este momento.'}
          actions={<Link className="btn btn--primary" to="/app/consulta-externa">Abrir consulta externa</Link>} />
        <div className="stats">
          <Link className="stat" to="/app/consulta-externa"><b>{active.length}</b><span>Citas hoy</span></Link>
          <Link className="stat" to="/app/consulta-externa"><b>{inRoom.length}</b><span>En sala de espera</span></Link>
          <Link className="stat" to="/app/consulta-externa"><b>{triageQueue.length}</b><span>Espera de triaje</span></Link>
          <Link className="stat" to="/app/consulta-externa"><b>{done.length}</b><span>Atendidas</span></Link>
        </div>
        <section className="panel">
          <div className="panel__head"><h2>Espera de triaje</h2><p>Abre la preclínica de quien ya llegó.</p></div>
          {triageQueue.length ? triageQueue.map((a) => {
            const p = patients.find((x) => x.id === a.patientId)
            if (!p) return null
            return (
              <div key={a.id} className="queue-card" style={{ gridTemplateColumns: '1fr auto' }}>
                <div className="row__who"><strong>{time(a.start)} {fullName(p)}</strong><span>{a.reason}</span></div>
                <button className="btn btn--primary btn--sm" onClick={() => setTriage(a)}><Activity size={15} />Preclínica</button>
              </div>
            )
          }) : <div className="empty">Cuando un paciente llegue a sala, aparecerá aquí.</div>}
        </section>
        <NewOrders />
        <ArrivalsPanel />
        {triage && <VitalsModal appt={triage} onClose={() => setTriage(null)} onSaved={() => setTriage(null)} />}
      </div>
    )
  }

  const toArrivals = () => document.getElementById('por-llegar')?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  // La asistente del consultorio hace lo de recepción y además la preclínica
  if (user.role === 'reception' || user.role === 'assistant') {
    const triageQueue = today.filter((a) => a.status === 'arrived')
    const pending = pendingArrivals(appointments, now)
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
          <button className="stat stat--btn" onClick={toArrivals}><b>{pending.length}</b><span>Por llegar</span>{pending.length > 0 && <small>Ver quiénes son</small>}</button>
          <div className="stat"><b>{toCharge.length}</b><span>Por cobrar</span>{toCharge.length > 0 && <small><Link to="/app/caja">Ir a caja</Link></small>}</div>
          <div className="stat"><b className="num">{todayRevenue == null ? '—' : money(todayRevenue, settings.currency)}</b><span>Cobrado hoy</span></div>
        </div>
        {can('vitals.record') && triageQueue.length > 0 && (
          <section className="panel">
            <div className="panel__head"><h2>Espera de preclínica</h2><p>Toma los signos de quien ya llegó.</p></div>
            {triageQueue.map((a) => {
              const p = patients.find((x) => x.id === a.patientId)
              return p && (
                <div key={a.id} className="queue-card" style={{ gridTemplateColumns: '1fr auto' }}>
                  <div className="row__who"><strong>{time(a.start)} {fullName(p)}</strong><span>{a.reason}</span></div>
                  <button className="btn btn--primary btn--sm" onClick={() => setTriage(a)}><Activity size={15} />Preclínica</button>
                </div>
              )
            })}
          </section>
        )}
        {triage && <VitalsModal appt={triage} onClose={() => setTriage(null)} onSaved={() => setTriage(null)} />}
        <ArrivalsPanel id="por-llegar" onArrive={arrive} />
        {completion}
        <FollowupCalls />
        <div className="grid-2">
          <section className="panel">
            <div className="panel__head"><h2>Agenda {office ? 'del consultorio' : 'de la clínica'} hoy</h2></div>
            <ApptRows list={today.filter((a) => a.status !== 'cancelled')} showDoctor={!office} action={(a) => a.status === 'done' && a.paid === false && (
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
        <div className="stat"><b>{patients.filter((p) => !p.pending).length}</b><span>Pacientes registrados</span></div>
      </div>
      <ArrivalsPanel id="por-llegar" onArrive={arrive} />
      {completion}
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
