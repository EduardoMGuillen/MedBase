import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useStore } from '../lib/store'
import { Avatar, Modal, PageHead, StatusBadge, Toast } from '../components/ui'
import { cap, fullName, sameDay, time } from '../lib/format'
import type { Appointment } from '../lib/types'

const START_H = 7
const END_H = 18
const HOUR_PX = 96

const toLocalISO = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function Agenda() {
  const store = useStore()
  const { staff, appointments, patients, user, can, patient } = store
  const navigate = useNavigate()
  const [day, setDay] = useState(() => new Date())
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<Appointment | null>(null)
  const [toast, setToast] = useState('')

  const doctors = staff.filter((s) => s.role === 'doctor' && s.active)
  // El médico ve primero su propia columna
  const cols = user?.role === 'doctor' ? [...doctors].sort((a) => (a.id === user.id ? -1 : 1)) : doctors
  const dayAppts = appointments.filter((a) => sameDay(a.start, day))
  const shift = (n: number) => setDay((d) => { const x = new Date(d); x.setDate(x.getDate() + n); return x })
  const isToday = sameDay(day.toISOString(), new Date())
  const now = new Date()
  const nowTop = ((now.getHours() - START_H) * 60 + now.getMinutes()) * (HOUR_PX / 60)
  const gridCols = `56px repeat(${cols.length}, minmax(180px, 1fr))`

  return (
    <div className="page">
      <PageHead title="Agenda" sub={`${dayAppts.filter((a) => a.status !== 'cancelled').length} citas en ${cols.length} consultorios`}
        actions={can('agenda.manage') && <button className="btn btn--primary" onClick={() => setCreating(true)}><Plus size={17} />Nueva cita</button>} />

      <div className="cal-toolbar">
        <button className="icon-btn" onClick={() => shift(-1)} aria-label="Día anterior"><ChevronLeft size={20} /></button>
        <button className="icon-btn" onClick={() => shift(1)} aria-label="Día siguiente"><ChevronRight size={20} /></button>
        <h2>{cap(day.toLocaleDateString('es-HN', { weekday: 'long', day: 'numeric', month: 'long' }))}</h2>
        {!isToday && <button className="btn btn--ghost btn--sm" onClick={() => setDay(new Date())}>Volver a hoy</button>}
      </div>

      <section className="panel cal">
        <div className="cal__inner">
          <div className="cal__heads" style={{ gridTemplateColumns: gridCols }}>
            <div />
            {cols.map((d) => (
              <div key={d.id} className="cal__head">
                <Avatar name={d.name} color={d.color} />
                <div><strong>{d.name}</strong><small>{d.specialty}</small></div>
              </div>
            ))}
          </div>
          <div className="cal__body" style={{ gridTemplateColumns: gridCols }}>
            <div className="cal__hours">
              {Array.from({ length: END_H - START_H }, (_, i) => <div key={i} className="cal__hour">{String(START_H + i).padStart(2, '0')}:00</div>)}
            </div>
            {cols.map((d) => (
              <div key={d.id} className="cal__col" style={{ height: (END_H - START_H) * HOUR_PX }}>
                {dayAppts.filter((a) => a.doctorId === d.id && a.status !== 'cancelled').map((a) => {
                  const s = new Date(a.start)
                  const top = ((s.getHours() - START_H) * 60 + s.getMinutes()) * (HOUR_PX / 60)
                  const p = patient(a.patientId)!
                  return (
                    <button key={a.id} className={`appt ${a.status === 'done' || a.status === 'no_show' ? 'appt--done' : ''} ${a.type === 'urgent' ? 'appt--urgent' : ''}`}
                      style={{ top: top + 2, height: a.minutes * (HOUR_PX / 60) - 4, ['--c' as string]: d.color, textAlign: 'left', border: 0, borderLeft: `3px solid ${d.color}` }}
                      onClick={() => setSelected(a)}>
                      <strong>{time(a.start)} {fullName(p)}</strong>
                      <span>{a.reason}</span>
                    </button>
                  )
                })}
              </div>
            ))}
            {isToday && nowTop > 0 && nowTop < (END_H - START_H) * HOUR_PX && <div className="cal__now" style={{ top: nowTop }} aria-hidden="true" />}
          </div>
        </div>
      </section>

      {selected && (() => {
        const a = appointments.find((x) => x.id === selected.id)!
        const p = patient(a.patientId)!
        const open = ['scheduled', 'confirmed'].includes(a.status)
        return (
          <Modal title={fullName(p)} onClose={() => setSelected(null)} footer={<>
            {can('agenda.manage') && open && <button className="btn btn--danger" onClick={() => { store.setStatus(a.id, 'cancelled'); setSelected(null); setToast('Cita cancelada') }}>Cancelar cita</button>}
            {can('checkin.manage') && open && <button className="btn btn--soft" onClick={() => { store.setStatus(a.id, 'arrived'); setSelected(null); setToast('Llegada registrada') }}>Registrar llegada</button>}
            {can('consult.write') && a.doctorId === user?.id && ['arrived', 'triaged', 'in_consult'].includes(a.status) &&
              <button className="btn btn--primary" onClick={() => navigate(`/app/consulta/${a.id}`)}>Atender</button>}
            {!open && <button className="btn btn--ghost" onClick={() => navigate(`/app/pacientes/${p.id}`)}>Abrir ficha</button>}
          </>}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><StatusBadge status={a.status} />{a.type === 'urgent' && <span className="badge badge--red">Urgente</span>}</div>
            <div className="chart-meta" style={{ marginTop: 0 }}>
              <span>Hora <b>{time(a.start)}</b></span><span>Duración <b>{a.minutes} min</b></span>
              <span>Expediente <b>{p.record}</b></span><span>Teléfono <b>{p.phone}</b></span>
            </div>
            <p><b>Motivo:</b> {a.reason}</p>
            {open && a.status === 'scheduled' && can('agenda.manage') && (
              <button className="btn btn--ghost btn--sm" style={{ justifySelf: 'start' }} onClick={() => { store.setStatus(a.id, 'confirmed'); setToast('Cita confirmada') }}>Marcar como confirmada</button>
            )}
          </Modal>
        )
      })()}

      {creating && <NewAppointment day={day} doctors={doctors} patients={patients} defaultDoctor={user?.role === 'doctor' ? user.id : doctors[0]?.id}
        onClose={() => setCreating(false)}
        onSave={(a) => { store.addAppointment(a); setCreating(false); setToast('Cita agendada') }} />}
      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </div>
  )
}

function NewAppointment({ day, doctors, patients, defaultDoctor, onClose, onSave }: {
  day: Date; doctors: ReturnType<typeof useStore>['staff']; patients: ReturnType<typeof useStore>['patients']; defaultDoctor?: string
  onClose: () => void; onSave: (a: Omit<Appointment, 'id'>) => void
}) {
  const [f, setF] = useState({ patientId: patients[0]?.id ?? '', doctorId: defaultDoctor ?? '', date: toLocalISO(day), time: '10:00', minutes: 30, reason: '', type: 'followup' as Appointment['type'] })
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  const valid = f.patientId && f.doctorId && f.reason.trim()
  return (
    <Modal title="Nueva cita" onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!valid} onClick={() => onSave({
        patientId: f.patientId, doctorId: f.doctorId, start: `${f.date}T${f.time}:00`, minutes: f.minutes, reason: f.reason.trim(), type: f.type, status: 'scheduled',
      })}>Agendar cita</button>
    </>}>
      <label className="field"><span>Paciente</span>
        <select className="select" value={f.patientId} onChange={(e) => set('patientId', e.target.value)}>
          {patients.map((p) => <option key={p.id} value={p.id}>{fullName(p)} ({p.record})</option>)}
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
      <label className="field"><span>Tipo</span>
        <select className="select" value={f.type} onChange={(e) => set('type', e.target.value as Appointment['type'])}>
          <option value="first">Primera vez</option><option value="followup">Seguimiento</option><option value="urgent">Urgente</option>
        </select>
      </label>
    </Modal>
  )
}
