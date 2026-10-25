import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Activity, BedDouble, LogIn, NotebookPen, Stethoscope, UserPlus } from 'lucide-react'
import { useStore } from '../lib/store'
import { Modal, PageHead, StatusBadge } from '../components/ui'
import { age, fullName, sameDay, time } from '../lib/format'
import type { Appointment, Patient } from '../lib/types'
import { parseDecimal, VITALS, vitalLevel, type VitalKey } from '../lib/vitals'
import { yearsOld } from '../lib/inpatient'
import { PatientPicker } from './Inpatients'
import { IdentificationForm } from './PatientForms'
import { CompleteRegistration } from './NewPatient'

const minutesSince = (iso?: string) => (iso ? Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)) : null)

/**
 * Consulta externa del día: los que tienen cita y los que van llegando sin cita. Enfermería abre
 * la preclínica y el médico los atiende. No se muestra "por llegar": esa lista no aporta aquí.
 */
export default function WaitingRoom() {
  const { appointments, patient, staffById, can, setStatus, user, inpatientOf, takeAppointment } = useStore()
  const nav = useNavigate()
  const [taking, setTaking] = useState<Appointment | null>(null)
  const [busy, setBusy] = useState(false)
  const [triage, setTriage] = useState<Appointment | null>(null)
  const [walkIn, setWalkIn] = useState(false)
  const [completing, setCompleting] = useState<Appointment | null>(null)
  // El médico ve "Mis pacientes" por defecto y se recuerda su última elección en este navegador
  const viewKey = `clinara.ce.${user?.id}`
  const [mine, setMineState] = useState(() => {
    if (user?.role !== 'doctor') return false
    try { return localStorage.getItem(viewKey) !== 'clinica' } catch { return true }
  })
  const setMine = (v: boolean) => { setMineState(v); try { localStorage.setItem(viewKey, v ? 'mios' : 'clinica') } catch { /* sin almacenamiento */ } }
  const today = appointments
    // En "Mis pacientes" también sale el que otro médico tomó, para que se vea quién lo atiende
    .filter((a) => sameDay(a.start, new Date()) && !['cancelled'].includes(a.status) && (!mine || a.doctorId === user?.id || a.reassignedFrom === user?.id))
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
              const takenFromMe = a.reassignedFrom === user?.id && !own
              return (
                <div key={a.id} className="queue-card" style={{ gridTemplateColumns: '1fr auto' }}>
                  <div className="row__who">
                    <strong>{time(a.start)} <Link to={`/app/pacientes/${p.id}`}>{fullName(p)}</Link></strong>
                    <span>{[age(p.birthDate), `con ${staffById(a.doctorId)?.name}`, a.reason].filter(Boolean).join(' · ')}</span>
                    <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <StatusBadge status={a.status} />
                      {a.source === 'walkin' && <span className="badge badge--neutral">Sin cita</span>}
                      {a.type === 'urgent' && <span className="badge badge--red">Urgente</span>}
                      {hosp && <Link to={`/app/hospitalizados/${hosp.id}`} className="badge badge--ink"><BedDouble size={12} />Ingresado</Link>}
                      {a.reassignedFrom && <span className="badge badge--amber">{takenFromMe ? `Lo atiende ${staffById(a.doctorId)?.name}` : `Atendido por ${staffById(a.doctorId)?.name}, estaba con ${staffById(a.reassignedFrom)?.name}`}</span>}
                      {wait !== null && <span className="wait">{wait} min esperando</span>}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gap: 6, alignContent: 'start' }}>
                    {['scheduled', 'confirmed'].includes(a.status) && can('checkin.manage') &&
                      <button className="btn btn--soft btn--sm" onClick={() => p.pending ? setCompleting(a) : setStatus(a.id, 'arrived', `Llegada de ${p.firstName} registrada`)}><LogIn size={15} />Llegó</button>}
                    {a.status === 'arrived' && can('vitals.record') &&
                      <button className="btn btn--primary btn--sm" onClick={() => setTriage(a)}><Activity size={15} />Preclínica</button>}
                    {a.status === 'done' && a.paid === false && can('billing.manage') &&
                      <Link className="btn btn--ghost btn--sm" to="/app/caja">Cobrar</Link>}
                    {['arrived', 'triaged', 'in_consult'].includes(a.status) && own && can('consult.write') &&
                      <button className="btn btn--primary btn--sm" onClick={() => nav(`/app/consulta/${a.id}`)}><Stethoscope size={15} />{a.status === 'in_consult' ? 'Continuar' : 'Atender'}</button>}
                    {a.status === 'triaged' && !own && user?.role === 'doctor' && can('consult.write') &&
                      <button className="btn btn--ghost btn--sm" onClick={() => setTaking(a)}><Stethoscope size={15} />Atender</button>}
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
      {taking && (
        <Modal title="Atender paciente de otro médico" onClose={() => setTaking(null)} footer={<>
          <button className="btn btn--ghost" onClick={() => setTaking(null)}>Cancelar</button>
          <button className="btn btn--primary" disabled={busy} onClick={async () => {
            setBusy(true)
            const r = await takeAppointment(taking.id, taking.doctorId)
            setBusy(false)
            setTaking(null)
            if (r) nav(`/app/consulta/${taking.id}`)
          }}><Stethoscope size={16} />Sí, lo atiendo yo</button>
        </>}>
          <p>Este paciente está asignado {staffById(taking.doctorId)?.name.startsWith('Dra') ? 'a la' : 'al'} <b>{staffById(taking.doctorId)?.name}</b>. ¿Desea atenderlo usted?</p>
          <p className="muted" style={{ fontSize: 13.5 }}>La consulta quedará a su nombre y la bitácora registrará que usted lo tomó y a quién estaba asignado.</p>
        </Modal>
      )}
      {completing && patient(completing.patientId) && <CompleteRegistration patient={patient(completing.patientId)!} onClose={() => setCompleting(null)}
        onDone={async () => { setCompleting(null); await setStatus(completing.id, 'arrived', 'Registro completado y llegada registrada') }} />}
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

const FIELDS: VitalKey[] = ['systolic', 'diastolic', 'heartRate', 'respRate', 'temperature', 'spo2', 'weightKg', 'heightCm', 'glucose', 'painScale']
/** La presión se revisa en pareja: al escribir una, se vuelve a revisar la otra al salir. */
const PAIR: VitalKey[] = ['systolic', 'diastolic']
type VitalsForm = Record<VitalKey, string> & { notes: string }
const EMPTY_VITALS: VitalsForm = { systolic: '', diastolic: '', heartRate: '', respRate: '', temperature: '', spo2: '', weightKg: '', heightCm: '', glucose: '', painScale: '', notes: '' }

/** Problema de un campo ya revisado: `error` pide confirmar antes de guardar; `warn` sólo avisa al médico. */
function fieldIssue(k: VitalKey, v: VitalsForm, ageYears?: number): { level: 'error' | 'warn'; text: string } | null {
  const x = parseDecimal(v[k])
  if (x === undefined) return null
  if (Number.isNaN(x)) return { level: 'error', text: 'Revise el valor: no es un número.' }
  if (k === 'painScale' && !Number.isInteger(x)) return { level: 'error', text: 'Revise el valor: el dolor va de 0 a 10, sin decimales.' }
  const level = vitalLevel(k, x, ageYears)
  if (level === 'error') return { level, text: 'Revise el valor.' }
  // La sistólica menor que la diastólica casi siempre es un error de digitación; se avisa en la sistólica
  const d = parseDecimal(v.diastolic)
  if (k === 'systolic' && d != null && !Number.isNaN(d) && vitalLevel('diastolic', d, ageYears) !== 'error' && x <= d) {
    return { level: 'error', text: 'La sistólica es menor o igual que la diastólica: posible error.' }
  }
  if (level === 'warn') return { level, text: 'Fuera de rango, el médico verá la alerta.' }
  return null
}

/**
 * Triaje: enfermería registra el motivo de consulta y los signos vitales; el médico recibe ambos.
 * Cada campo se revisa al salir de él (nunca mientras se escribe) y otra vez al guardar.
 */
export function VitalsModal({ appt, onClose, onSaved }: { appt: Appointment; onClose: () => void; onSaved: () => void }) {
  const { patient, addVitals } = useStore()
  const p = patient(appt.patientId)!
  const ageYears = p.birthDate ? yearsOld(p.birthDate) : undefined
  const [reason, setReason] = useState(appt.reason)
  const [v, setV] = useState<VitalsForm>(EMPTY_VITALS)
  // Campos que ya se revisaron (al salir de ellos o al intentar guardar)
  const [checked, setChecked] = useState<Set<VitalKey>>(new Set())
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  // El motivo siempre se pide. Los signos no: hay pacientes a los que no les aplica peso, glucometría u otro dato.
  const ready = reason.trim().length > 0
  const issue = (k: VitalKey) => (checked.has(k) ? fieldIssue(k, v, ageYears) : null)
  const check = (...keys: VitalKey[]) => setChecked((c) => new Set([...c, ...keys]))
  const allIssues = FIELDS.map((k) => [k, fieldIssue(k, v, ageYears)] as const)
  const errors = allIssues.filter(([, i]) => i?.level === 'error').map(([k]) => k)
  const shownWarn = FIELDS.filter((k) => issue(k)?.level === 'warn')

  const save = async () => {
    const num = (k: VitalKey) => {
      const x = parseDecimal(v[k])
      return x === undefined || Number.isNaN(x) ? undefined : VITALS[k].decimals ? x : Math.round(x)
    }
    setBusy(true)
    const ok = await addVitals({
      patientId: p.id, appointmentId: appt.id, chiefComplaint: reason.trim(), systolic: num('systolic'), diastolic: num('diastolic'), heartRate: num('heartRate'),
      respRate: num('respRate'), temperature: num('temperature'), spo2: num('spo2'), glucose: num('glucose'), weightKg: num('weightKg'), heightCm: num('heightCm'),
      painScale: num('painScale'), notes: v.notes.trim() || undefined,
    })
    setBusy(false)
    if (ok) onSaved()
  }
  const trySave = () => {
    check(...FIELDS)
    // Lo que no es un número no se puede guardar; lo improbable se guarda si enfermería lo confirma
    if (FIELDS.some((k) => Number.isNaN(parseDecimal(v[k])))) return
    if (errors.length) { setConfirming(true); return }
    void save()
  }

  const F = (k: VitalKey) => {
    const i = issue(k)
    return (
      <label className="field" key={k}>
        <span>{VITALS[k].label} <small style={{ fontWeight: 400 }}>({VITALS[k].unit})</small></span>
        <input className={`input num ${i ? `input--${i.level}` : ''}`} inputMode="decimal" type="text" autoComplete="off" value={v[k]}
          onChange={(e) => { setV({ ...v, [k]: e.target.value }); setConfirming(false); setChecked((c) => { const n = new Set(c); for (const x of PAIR.includes(k) ? PAIR : [k]) n.delete(x); return n }) }}
          onBlur={() => check(...(PAIR.includes(k) ? PAIR : [k]).filter((x) => v[x] !== ''))}
          aria-invalid={i?.level === 'error'} aria-describedby={i ? `vital-${k}` : undefined} />
        {i && <small id={`vital-${k}`} className={`field__msg field__msg--${i.level}`}>{i.text}</small>}
      </label>
    )
  }

  return (
    <Modal title={`Preclínica de ${fullName(p)}`} onClose={onClose} footer={confirming ? <>
      <span className="field__msg field__msg--error" style={{ marginRight: 'auto' }}>Revise: {errors.map((k) => `${VITALS[k].label.toLowerCase()} ${v[k]}`).join(', ')}.</span>
      <button className="btn btn--ghost" onClick={() => setConfirming(false)}>Corregir</button>
      <button className="btn btn--danger" disabled={busy} onClick={save}>Guardar de todos modos</button>
    </> : <>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!ready || busy} onClick={trySave}>Guardar preclínica</button>
    </>}>
      {p.allergies.length > 0 && <div className="alert-strip">Alergias: {p.allergies.join(', ')}</div>}
      <p className="muted" style={{ fontSize: 13.5 }}>Registra el motivo y sólo los signos que apliquen. Ningún signo es obligatorio. Puedes usar punto o coma para los decimales.</p>
      <label className="field"><span>Motivo de consulta, en palabras del paciente</span>
        <textarea className="textarea textarea--sm" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. Dolor de garganta y fiebre desde hace 3 días" /></label>
      <div className="form-grid form-grid--top">{FIELDS.map(F)}</div>
      {shownWarn.length > 0 && <div className="alert-strip alert-strip--amber" role="status">Fuera de rango: {shownWarn.map((k) => VITALS[k].label.toLowerCase()).join(', ')}. El médico verá la alerta.</div>}
      <label className="field"><span>Observaciones de enfermería</span><textarea className="textarea textarea--sm" rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></label>
    </Modal>
  )
}
