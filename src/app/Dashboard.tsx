import { Link } from 'react-router-dom'
import { Stethoscope } from 'lucide-react'
import { useStore } from '../lib/store'
import { PageHead, StatusBadge } from '../components/ui'
import { fullName, sameDay, time } from '../lib/format'
import type { Appointment } from '../lib/types'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
}

export function ApptRows({ list, showDoctor = false, action }: {
  list: Appointment[]; showDoctor?: boolean; action?: (a: Appointment) => React.ReactNode
}) {
  const { patient, staffById, can } = useStore()
  if (!list.length) return <div className="empty">No hay citas en esta lista.</div>
  const nowMs = Date.now()
  return (
    <div className="rows">
      {list.map((a) => {
        const p = patient(a.patientId)!
        const start = new Date(a.start).getTime()
        const isNow = nowMs >= start && nowMs < start + a.minutes * 60000
        const who = (
          <div className="row__who">
            <strong>{fullName(p)}</strong>
            <span>{a.reason}{showDoctor ? `, con ${staffById(a.doctorId)?.name}` : ''}{a.type === 'urgent' ? ', urgente' : ''}</span>
          </div>
        )
        return (
          <div key={a.id} className={`row ${isNow ? 'row--now' : ''}`}>
            <span className="row__time">{time(a.start)}</span>
            {can('chart.view') || can('patients.view') ? <Link to={`/app/pacientes/${p.id}`} style={{ textDecoration: 'none' }}>{who}</Link> : who}
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
  const { user, appointments, patients, staff, audit, staffById } = useStore()
  if (!user) return null
  const today = appointments.filter((a) => sameDay(a.start, new Date())).sort((a, b) => a.start.localeCompare(b.start))
  const first = user.name.split(' ').slice(0, 2).join(' ')

  if (user.role === 'doctor') {
    const mine = today.filter((a) => a.doctorId === user.id)
    const ready = mine.filter((a) => a.status === 'triaged')
    const next = mine.find((a) => ['scheduled', 'confirmed', 'arrived', 'triaged'].includes(a.status))
    return (
      <div className="page">
        <PageHead title={`${greeting()}, ${first}`} sub={next ? `Tu próxima cita es a las ${time(next.start)}.` : 'No tienes más citas pendientes hoy.'} />
        <div className="stats">
          <div className="stat"><b>{mine.length}</b><span>Citas hoy</span></div>
          <div className="stat"><b>{mine.filter((a) => a.status === 'done').length}</b><span>Atendidas</span></div>
          <div className="stat"><b>{ready.length}</b><span>Listas para consulta</span>{ready.length > 0 && <small>Con signos vitales tomados</small>}</div>
          <div className="stat"><b>{mine.filter((a) => a.status === 'arrived').length}</b><span>En sala de espera</span></div>
        </div>
        <div className="grid-2">
          <section className="panel">
            <div className="panel__head"><h2>Tu agenda de hoy</h2><Link className="btn btn--ghost btn--sm" to="/app/agenda">Ver agenda</Link></div>
            <ApptRows list={mine} action={(a) => ['triaged', 'arrived', 'in_consult'].includes(a.status) && (
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

  if (user.role === 'nurse' || user.role === 'reception') {
    const arrived = today.filter((a) => a.status === 'arrived')
    const pending = today.filter((a) => ['scheduled', 'confirmed'].includes(a.status))
    return (
      <div className="page">
        <PageHead title={`${greeting()}, ${first}`}
          sub={user.role === 'nurse' ? `${arrived.length} pacientes esperan triaje.` : `${pending.length} pacientes aún no llegan hoy.`}
          actions={<Link className="btn btn--primary" to="/app/sala">Abrir sala de espera</Link>} />
        <div className="stats">
          <div className="stat"><b>{today.length}</b><span>Citas hoy</span></div>
          <div className="stat"><b>{pending.length}</b><span>Por llegar</span></div>
          <div className="stat"><b>{arrived.length}</b><span>Esperan triaje</span></div>
          <div className="stat"><b>{today.filter((a) => a.status === 'done').length}</b><span>Atendidas</span></div>
        </div>
        <section className="panel">
          <div className="panel__head"><h2>Agenda de la clínica hoy</h2></div>
          <ApptRows list={today} showDoctor />
        </section>
      </div>
    )
  }

  // Administración: indicadores sin información clínica
  const doctors = staff.filter((s) => s.role === 'doctor')
  const closed = appointments.filter((a) => ['done', 'no_show'].includes(a.status))
  const attendance = closed.length ? Math.round((closed.filter((a) => a.status === 'done').length / closed.length) * 100) : 100
  const max = Math.max(1, ...doctors.map((d) => today.filter((a) => a.doctorId === d.id).length))
  return (
    <div className="page">
      <PageHead title={`${greeting()}, ${first}`} sub="Resumen operativo de la clínica." />
      <div className="stats">
        <div className="stat"><b>{today.length}</b><span>Citas hoy</span></div>
        <div className="stat"><b className="num">{attendance}%</b><span>Asistencia</span></div>
        <div className="stat"><b>{patients.length}</b><span>Pacientes registrados</span></div>
        <div className="stat"><b>{staff.filter((s) => s.active).length}</b><span>Personal activo</span></div>
      </div>
      <div className="grid-2">
        <section className="panel">
          <div className="panel__head"><h2>Carga por médico hoy</h2></div>
          <div className="panel__body bars">
            {doctors.map((d) => {
              const n = today.filter((a) => a.doctorId === d.id).length
              return (
                <div key={d.id} className="bar">
                  <span>{d.name}</span>
                  <div className="bar__track"><div className="bar__fill" style={{ width: `${(n / max) * 100}%`, background: d.color }} /></div>
                  <b className="num">{n}</b>
                </div>
              )
            })}
          </div>
        </section>
        <section className="panel">
          <div className="panel__head"><h2>Actividad reciente</h2><Link className="btn btn--ghost btn--sm" to="/app/personal">Ver bitácora</Link></div>
          {audit.length ? (
            <div className="rows">
              {audit.slice(0, 6).map((e) => (
                <div key={e.id} className="row" style={{ gridTemplateColumns: '54px 1fr' }}>
                  <span className="num" style={{ color: 'var(--muted)', fontSize: 13 }}>{time(e.at)}</span>
                  <div className="row__who"><strong>{staffById(e.userId)?.name}</strong><span>{e.action}</span></div>
                </div>
              ))}
            </div>
          ) : <div className="empty">Todavía no hay actividad registrada.</div>}
        </section>
      </div>
    </div>
  )
}
