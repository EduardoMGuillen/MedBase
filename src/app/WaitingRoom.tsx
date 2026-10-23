import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Activity, BedDouble, LogIn, NotebookPen, Stethoscope, UserPlus } from 'lucide-react'
import { useStore } from '../lib/store'
import { Modal, PageHead, StatusBadge } from '../components/ui'
import { age, fullName, sameDay, time } from '../lib/format'
import type { Appointment, Patient } from '../lib/types'
import { PatientPicker } from './Inpatients'
import { IdentificationForm } from './PatientForms'

const minutesSince = (iso?: string) => (iso ? Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)) : null)

/**
 * Consulta externa del día: los que tienen cita y los que van llegando sin cita. Enfermería abre
 * la preclínica y el médico los atiende. No se muestra "por llegar": esa lista no aporta aquí.
 */
export default function WaitingRoom() {
  const { appointments, patient, staffById, can, setStatus, user, inpatientOf } = useStore()
  const nav = useNavigate()
  const [triage, setTriage] = useState<Appointment | null>(null)
  const [walkIn, setWalkIn] = useState(false)
  const [mine, setMine] = useState(user?.role === 'doctor')
  const today = appointments
    .filter((a) => sameDay(a.start, new Date()) && !['cancelled'].includes(a.status) && (!mine || a.doctorId === user?.id))
    .sort((a, b) => a.start.localeCompare(b.start))
  const lanes = [
    { title: 'En sala', hint: 'Esperan que enfermería les abra la preclínica.', list: today.filter((a) => a.status === 'arrived') },
    { title: 'Listos para consulta', hint: 'Con preclínica hecha; el médico los llamará.', list: today.filter((a) => ['triaged', 'in_consult'].includes(a.status)) },
    { title: 'Atendidos', hint: 'Consultas firmadas hoy.', list: today.filter((a) => a.status === 'done') },
  ]

  return (
    <div className="page">
      <PageHead title="Consulta externa" sub="Pacientes de hoy: con cita y los que llegan sin cita. Avanzan de izquierda a derecha."
        actions={<>
          {user?.role === 'doctor' && (
            <div className="segmented" role="radiogroup" aria-label="Qué pacientes ver">
              <button role="radio" aria-checked={mine} onClick={() => setMine(true)}>Mis pacientes</button>
              <button role="radio" aria-checked={!mine} onClick={() => setMine(false)}>Toda la clínica</button>
            </div>
          )}
          {can('checkin.manage') && <button className="btn btn--primary" onClick={() => setWalkIn(true)}><UserPlus size={17} />Paciente sin cita</button>}
        </>} />
      <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))' }}>
        {lanes.map((lane) => (
          <section key={lane.title} className="panel">
            <div className="panel__head"><div><h2>{lane.title} <span className="num" style={{ color: 'var(--faint)' }}>{lane.list.length}</span></h2><p>{lane.hint}</p></div></div>
            {lane.list.length ? lane.list.map((a) => {
              const p = patient(a.patientId)
              if (!p) return null
              const wait = a.status === 'arrived' ? minutesSince(a.arrivedAt) : null
              const own = a.doctorId === user?.id
              const hosp = inpatientOf(p.id)
              return (
                <div key={a.id} className="queue-card" style={{ gridTemplateColumns: '1fr auto' }}>
                  <div className="row__who">
                    <strong>{time(a.start)} <Link to={`/app/pacientes/${p.id}`}>{fullName(p)}</Link></strong>
                    <span>{age(p.birthDate)}, con {staffById(a.doctorId)?.name}</span>
                    <span>{a.reason}</span>
                    <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <StatusBadge status={a.status} />
                      {a.source === 'walkin' && <span className="badge badge--neutral">Sin cita</span>}
                      {a.type === 'urgent' && <span className="badge badge--red">Urgente</span>}
                      {hosp && <Link to={`/app/hospitalizados/${hosp.id}`} className="badge badge--ink"><BedDouble size={12} />Ingresado</Link>}
                      {wait !== null && <span className="wait">{wait} min esperando</span>}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gap: 6, alignContent: 'start' }}>
                    {['scheduled', 'confirmed'].includes(a.status) && can('checkin.manage') &&
                      <button className="btn btn--soft btn--sm" onClick={() => setStatus(a.id, 'arrived', `Llegada de ${p.firstName} registrada`)}><LogIn size={15} />Llegó</button>}
                    {a.status === 'arrived' && can('vitals.record') &&
                      <button className="btn btn--primary btn--sm" onClick={() => setTriage(a)}><Activity size={15} />Preclínica</button>}
                    {a.status === 'done' && a.paid === false && can('billing.manage') &&
                      <Link className="btn btn--ghost btn--sm" to="/app/caja">Cobrar</Link>}
                    {['arrived', 'triaged', 'in_consult'].includes(a.status) && own && can('consult.write') &&
                      <button className="btn btn--primary btn--sm" onClick={() => nav(`/app/consulta/${a.id}`)}><Stethoscope size={15} />{a.status === 'in_consult' ? 'Continuar' : 'Atender'}</button>}
                    {a.status === 'done' && can('chart.view') &&
                      <Link className="btn btn--ghost btn--sm" to={`/app/pacientes/${p.id}`}><NotebookPen size={15} />Expediente</Link>}
                  </div>
                </div>
              )
            }) : <div className="empty">Nadie en esta etapa.</div>}
          </section>
        ))}
      </div>
      {triage && <VitalsModal appt={triage} onClose={() => setTriage(null)} onSaved={() => setTriage(null)} />}
      {walkIn && <WalkInModal onClose={() => setWalkIn(false)} />}
    </div>
  )
}

/** Paciente que llega de pie: se busca o se registra y entra a la sala de espera. */
function WalkInModal({ onClose }: { onClose: () => void }) {
  const { staff, walkIn, addPatient, can, user } = useStore()
  const doctors = staff.filter((s) => s.role === 'doctor' && s.active)
  const [patientId, setPatientId] = useState('')
  const [doctorId, setDoctorId] = useState(user?.role === 'doctor' ? user.id : doctors[0]?.id ?? '')
  const [reason, setReason] = useState('')
  const [registering, setRegistering] = useState(false)
  const [busy, setBusy] = useState(false)
  if (registering) {
    return <IdentificationForm title="Registrar paciente nuevo" submitLabel="Registrar y continuar" withAllergies onClose={() => setRegistering(false)} onSave={async (p) => {
      const r = await addPatient(p as Omit<Patient, 'id' | 'record' | 'createdAt'>)
      if (r) { setPatientId(r.id); setRegistering(false) }
    }} />
  }
  return (
    <Modal title="Paciente sin cita" onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!patientId || !doctorId || !reason.trim() || busy} onClick={async () => {
        setBusy(true)
        const ok = await walkIn({ patientId, doctorId, reason: reason.trim() })
        setBusy(false)
        if (ok) onClose()
      }}>Pasar a sala de espera</button>
    </>}>
      <PatientPicker value={patientId} onChange={setPatientId} />
      {can('patients.manage') && <button className="btn btn--primary" style={{ justifySelf: 'start' }} onClick={() => setRegistering(true)}><UserPlus size={16} />Registrar paciente nuevo</button>}
      <label className="field"><span>Médico</span>
        <select className="select" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
          {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}{d.specialty ? `, ${d.specialty.toLowerCase()}` : ''}</option>)}
        </select></label>
      <label className="field"><span>Motivo de consulta</span>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. Fiebre y dolor de garganta" /></label>
    </Modal>
  )
}

const RANGES = {
  systolic: [90, 139], diastolic: [60, 89], heartRate: [60, 100], respRate: [12, 20], temperature: [36, 37.5], spo2: [94, 100], glucose: [70, 180],
} as const
const RANGE_LABEL: Record<keyof typeof RANGES, string> = {
  systolic: 'sistólica', diastolic: 'diastólica', heartRate: 'frecuencia cardíaca', respRate: 'frecuencia respiratoria', temperature: 'temperatura', spo2: 'saturación', glucose: 'glucometría',
}

/** Triaje: enfermería registra el motivo de consulta y los signos vitales; el médico recibe ambos. */
export function VitalsModal({ appt, onClose, onSaved }: { appt: Appointment; onClose: () => void; onSaved: () => void }) {
  const { patient, addVitals } = useStore()
  const p = patient(appt.patientId)!
  const [reason, setReason] = useState(appt.reason)
  const [v, setV] = useState({ systolic: '', diastolic: '', heartRate: '', respRate: '', temperature: '', spo2: '', glucose: '', weightKg: '', heightCm: '', painScale: '0', notes: '' })
  const [busy, setBusy] = useState(false)
  const num = (k: keyof typeof v) => Number(v[k])
  const opt = (k: keyof typeof v) => (v[k] === '' ? undefined : Number(v[k]))
  const out = (k: keyof typeof RANGES) => v[k] !== '' && (num(k) < RANGES[k][0] || num(k) > RANGES[k][1])
  // El motivo siempre se pide. Los signos no: hay pacientes a los que no les aplica peso, glucometría u otro dato.
  const ready = reason.trim().length > 0
  const F = (k: keyof typeof v, label: string, unit: string, step = '1') => (
    <label className="field">
      <span>{label} <small style={{ fontWeight: 400 }}>({unit})</small></span>
      <input className="input num" inputMode="decimal" type="number" step={step} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })}
        style={k in RANGES && out(k as keyof typeof RANGES) ? { borderColor: 'var(--red-ink)', background: 'var(--red)' } : undefined}
        aria-invalid={k in RANGES && out(k as keyof typeof RANGES)} />
    </label>
  )
  const flags = (Object.keys(RANGES) as (keyof typeof RANGES)[]).filter(out)

  return (
    <Modal title={`Preclínica de ${fullName(p)}`} onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!ready || busy} onClick={async () => {
        setBusy(true)
        const ok = await addVitals({
          patientId: p.id, appointmentId: appt.id, chiefComplaint: reason.trim(), systolic: opt('systolic'), diastolic: opt('diastolic'), heartRate: opt('heartRate'),
          respRate: opt('respRate'), temperature: opt('temperature'), spo2: opt('spo2'), glucose: opt('glucose'), weightKg: opt('weightKg'), heightCm: opt('heightCm'),
          painScale: v.painScale === '' ? undefined : num('painScale'), notes: v.notes || undefined,
        })
        setBusy(false)
        if (ok) onSaved()
      }}>Guardar preclínica</button>
    </>}>
      {p.allergies.length > 0 && <div className="alert-strip">Alergias: {p.allergies.join(', ')}</div>}
      <p className="muted" style={{ fontSize: 13.5 }}>Registra el motivo y sólo los signos que apliquen. Ningún signo es obligatorio.</p>
      <label className="field"><span>Motivo de consulta, en palabras del paciente</span>
        <textarea className="textarea textarea--sm" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. Dolor de garganta y fiebre desde hace 3 días" /></label>
      <div className="form-grid">
        {F('systolic', 'Presión sistólica', 'mmHg')}
        {F('diastolic', 'Presión diastólica', 'mmHg')}
        {F('heartRate', 'Frecuencia cardíaca', 'lpm')}
        {F('respRate', 'Frecuencia respiratoria', 'rpm')}
        {F('temperature', 'Temperatura', '°C', '0.1')}
        {F('spo2', 'Saturación O₂', '%')}
        {F('weightKg', 'Peso', 'kg', '0.1')}
        {F('heightCm', 'Talla', 'cm')}
        {F('glucose', 'Glucometría', 'mg/dL')}
        {F('painScale', 'Dolor', '0 a 10')}
      </div>
      {flags.length > 0 && <div className="alert-strip" role="status">Fuera de rango: {flags.map((f) => RANGE_LABEL[f]).join(', ')}. El médico verá la alerta.</div>}
      <label className="field"><span>Observaciones de enfermería</span><textarea className="textarea textarea--sm" rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></label>
    </Modal>
  )
}
