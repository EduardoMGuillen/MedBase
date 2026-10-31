import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LogIn, MessageCircle, Phone } from 'lucide-react'
import { useStore } from '../lib/store'
import { fullName, time, whatsappUrl } from '../lib/format'
import { lateLabel, pendingArrivals } from '../lib/arrivals'
import { useNow } from '../lib/hooks'
import { features } from '../lib/permissions'
import { FoldHead } from '../components/ui'
import type { Appointment } from '../lib/types'

/**
 * Pacientes con cita hoy que todavía no llegan, en orden de hora. AD1/RE1 (ronda 6): en una clínica, agrupados por hora o por
 * médico (un solo componente para Administración y Recepción); las filas no cambian. Recepción y administración marcan la
 * llegada desde aquí; el médico (sólo sus pacientes) y enfermería la ven sin acciones.
 * `onArrive` permite que la pantalla decida qué hacer antes de marcar la llegada (p. ej. completar el registro).
 */
export function ArrivalsPanel({ doctorId, onArrive, id }: { doctorId?: string; onArrive?: (a: Appointment) => void; id?: string }) {
  const { appointments, patient, staffById, settings, can, user, saveMyProfile } = useStore()
  const now = useNow()
  const list = pendingArrivals(appointments, now, doctorId)
  const checkIn = can('checkin.manage') && !!onArrive
  // AD1/RE1 (ronda 6): «Por hora | Por médico», recordado por usuario y entre sesiones. Por defecto, por hora
  const grouped = features(settings).multiDoctor && !doctorId
  const [view, setViewState] = useState<'hour' | 'doctor'>(user?.prefs?.arrivalsView ?? 'hour')
  const setView = (v: 'hour' | 'doctor') => { setViewState(v); if (v !== (user?.prefs?.arrivalsView ?? 'hour')) void saveMyProfile({ arrivalsView: v }) }
  const [fold, setFold] = useState<Record<string, boolean>>({})
  const groups = !grouped ? [] : view === 'hour'
    ? [...new Map(list.map((a) => [time(a.start), [] as Appointment[]])).keys()].map((h) => ({ key: `h:${h}`, title: <>{h}</>, items: list.filter((a) => time(a.start) === h) }))
    : [...new Set(list.map((a) => a.doctorId))].map((d) => ({ key: `d:${d}`, doctor: staffById(d), items: list.filter((a) => a.doctorId === d) }))
      .sort((a, b) => (a.doctor?.name ?? '').localeCompare(b.doctor?.name ?? '', 'es'))
      .map((g) => ({ key: g.key, title: <><i className="arrival-group__dot" style={{ background: g.doctor?.color }} aria-hidden="true" />{g.doctor?.name ?? 'Médico'}{g.doctor?.specialty && <small className="fold-head__sub">{g.doctor.specialty}</small>}</>, items: g.items }))
  const isOpen = (k: string) => fold[k] ?? true
  const row = (a: Appointment) => {
    const p = patient(a.patientId)
    if (!p) return null
    const doc = staffById(a.doctorId)
    const late = Math.floor((now.getTime() - new Date(a.start).getTime()) / 60_000)
    const msg = `Hola ${p.firstName}, le escribimos de ${settings.name} por su cita de hoy a las ${time(a.start)}${doc ? ` con ${doc.name}` : ''}.`
    return (
      <div key={a.id} className={`arrival ${late > 0 ? 'arrival--late' : ''}`} style={{ ['--c' as string]: doc?.color }}>
        <span className="arrival__time num">{time(a.start)}</span>
        <div className="arrival__who">
          <strong>
            {p.pending ? fullName(p) : <Link to={`/app/pacientes/${p.id}`}>{fullName(p)}</Link>}
            {p.pending && <span className="badge badge--amber">Nuevo</span>}
            {late > 0 && <span className="badge badge--red">{lateLabel(late)}</span>}
          </strong>
          <span>{doc?.name}{a.reason ? ` · ${a.reason}` : ''}</span>
          {p.phone && (
            <span className="arrival__phone">
              <a href={`tel:${p.phone.replace(/[^\d+]/g, '')}`} aria-label={`Llamar a ${p.firstName}`}><Phone size={14} />{p.phone}</a>
              <a href={whatsappUrl(p.phone, msg)} target="_blank" rel="noreferrer" aria-label={`Escribir por WhatsApp a ${p.firstName}`}><MessageCircle size={14} />WhatsApp</a>
            </span>
          )}
        </div>
        {checkIn && <button className="btn btn--soft btn--sm" onClick={() => onArrive!(a)}><LogIn size={15} />Llegó</button>}
      </div>
    )
  }
  return (
    <section className="panel" id={id} data-tour="por-llegar">
      <div className="panel__head arrivals__head">
        <div><h2>Por llegar hoy <span className="num" style={{ color: 'var(--faint)' }}>{list.length}</span></h2>
          <p>{list.length ? `${doctorId ? 'Tus pacientes' : 'Pacientes'} con cita hoy que todavía no llegan.` : 'Todos los pacientes con cita hoy ya llegaron.'}</p></div>
        {grouped && list.length > 0 && (
          <div className="arrivals__tools">
            <div className="segmented segmented--sm" role="radiogroup" aria-label="Agrupar por">
              <button type="button" role="radio" aria-checked={view === 'hour'} onClick={() => setView('hour')}>Por hora</button>
              <button type="button" role="radio" aria-checked={view === 'doctor'} onClick={() => setView('doctor')}>Por médico</button>
            </div>
            <span className="fold-tools">
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setFold(Object.fromEntries(groups.map((g) => [g.key, true])))}>Expandir todo</button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setFold(Object.fromEntries(groups.map((g) => [g.key, false])))}>Contraer todo</button>
            </span>
          </div>
        )}
      </div>
      {!list.length ? <div className="empty">Nadie pendiente de llegar.</div>
        : !grouped ? <div className="rows">{list.map(row)}</div>
          : <div className="arrival-groups">{groups.map((g) => (
            <div key={g.key} className="arrival-group">
              <FoldHead id={`arr-${g.key}`} open={isOpen(g.key)} onToggle={() => setFold({ ...fold, [g.key]: !isOpen(g.key) })} title={g.title} count={g.items.length} />
              {isOpen(g.key) && <div id={`arr-${g.key}`} className="rows">{g.items.map(row)}</div>}
            </div>
          ))}</div>}
    </section>
  )
}
