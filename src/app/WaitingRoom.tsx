import { Fragment, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Activity, BedDouble, LogIn, NotebookPen, Stethoscope, UserPlus } from 'lucide-react'
import { useStore } from '../lib/store'
import { features, hasRole } from '../lib/permissions'
import { Modal, PageHead, StatusBadge } from '../components/ui'
import { age, fullName, sameDay, time } from '../lib/format'
import type { Appointment, Patient } from '../lib/types'
import { parseDecimal, VITALS, type VitalKey } from '../lib/vitals'
import { EMPTY_VITALS, FIELDS, fieldIssue, vitalNumber, type VitalsForm } from '../lib/vitalsForm'
import { VitalsFields } from '../components/VitalsFields'
import { stayPath, yearsOld } from '../lib/inpatient'
import { PatientPicker } from './Inpatients'
import { IdentificationForm } from './PatientForms'
import { CompleteRegistration } from './NewPatient'

type WaitOrder = 'time' | 'wait' | 'doctor'
const WAIT_ORDERS: { key: WaitOrder; label: string }[] = [
  { key: 'time', label: 'Hora de la cita' }, { key: 'wait', label: 'Tiempo de espera (llegó primero)' }, { key: 'doctor', label: 'Médico' },
]

const minutesSince = (iso?: string) => (iso ? Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)) : null)

/**
 * Consulta externa del día: los que tienen cita y los que van llegando sin cita. Enfermería abre
 * la preclínica y el médico los atiende. No se muestra "por llegar": esa lista no aporta aquí.
 */
export default function WaitingRoom() {
  const { appointments, patient, staffById, can, setStatus, user, stayOf, inpatientOf, takeAppointment, settings } = useStore()
  // Un consultorio tiene un solo médico: no hay "Mis pacientes / Toda la clínica" ni atender al de otro médico
  const multiDoctor = features(settings).multiDoctor
  const nav = useNavigate()
  const [taking, setTaking] = useState<Appointment | null>(null)
  const [busy, setBusy] = useState(false)
  const [triage, setTriage] = useState<Appointment | null>(null)
  const [walkIn, setWalkIn] = useState(false)
  const [completing, setCompleting] = useState<Appointment | null>(null)
  // El médico ve "Mis pacientes" por defecto y se recuerda su última elección en este navegador
  const viewKey = `clinara.ce.${user?.id}`
  const [mine, setMineState] = useState(() => {
    if (user?.role !== 'doctor' || !features(settings).multiDoctor) return false
    try { return localStorage.getItem(viewKey) !== 'clinica' } catch { return true }
  })
  const setMine = (v: boolean) => { setMineState(v); try { localStorage.setItem(viewKey, v ? 'mios' : 'clinica') } catch { /* sin almacenamiento */ } }
  // Ronda 8: cada quien ordena su vista (por hora de la cita, por tiempo de espera o por médico) y filtra por médico. Se
  // recuerda en este navegador.
  const arrangeKey = `clinara.ce.vista.${user?.id}`
  const [arrange, setArrangeState] = useState<{ doctor: string; order: WaitOrder }>(() => {
    try { const v = JSON.parse(localStorage.getItem(arrangeKey) ?? 'null'); if (v && typeof v.doctor === 'string' && WAIT_ORDERS.some((o) => o.key === v.order)) return v } catch { /* sin almacenamiento */ }
    return { doctor: '', order: 'time' }
  })
  const setArrange = (v: Partial<typeof arrange>) => { const next = { ...arrange, ...v }; setArrangeState(next); try { localStorage.setItem(arrangeKey, JSON.stringify(next)) } catch { /* sin almacenamiento */ } }
  const ofToday = appointments.filter((a) => sameDay(a.start, new Date()) && !['cancelled'].includes(a.status))
  const todayDoctors = [...new Set(ofToday.map((a) => a.doctorId))].map((id) => staffById(id)).filter((d) => !!d).sort((a, b) => a!.name.localeCompare(b!.name, 'es'))
  // Un médico que ya no tiene pacientes hoy deja de filtrar (si no, la vista quedaría vacía sin explicación)
  const byDoctor = !mine && arrange.doctor && todayDoctors.some((d) => d!.id === arrange.doctor) ? arrange.doctor : ''
  const doctorName = (id: string) => staffById(id)?.name ?? ''
  const today = ofToday
    // En "Mis pacientes" también sale el que otro médico tomó, para que se vea quién lo atiende
    .filter((a) => (!mine || a.doctorId === user?.id || a.reassignedFrom === user?.id) && (!byDoctor || a.doctorId === byDoctor))
    .sort((a, b) => (arrange.order === 'doctor' ? doctorName(a.doctorId).localeCompare(doctorName(b.doctorId), 'es') : 0)
      || (arrange.order === 'wait' ? (a.arrivedAt ?? a.start).localeCompare(b.arrivedAt ?? b.start) : 0)
      || a.start.localeCompare(b.start))
  const lanes = [
    { title: 'En sala', hint: multiDoctor ? 'Esperan que enfermería les abra la preclínica.' : 'Esperan la preclínica (signos vitales).', list: today.filter((a) => a.status === 'arrived') },
    { title: 'Listos para consulta', hint: 'Con preclínica hecha; el médico los llamará.', list: today.filter((a) => ['triaged', 'in_consult'].includes(a.status)) },
    { title: 'Atendidos', hint: 'Consultas firmadas hoy.', list: today.filter((a) => a.status === 'done') },
  ]

  return (
    <div className="page">
      <PageHead title="Consulta externa" sub="Pacientes de hoy: con cita y los que llegan sin cita. Avanzan de izquierda a derecha."
        actions={<>
          {user?.role === 'doctor' && multiDoctor && (
            <div className="segmented" role="radiogroup" aria-label="Qué pacientes ver" data-tour="alcance">
              <button role="radio" aria-checked={mine} onClick={() => setMine(true)}>Mis pacientes</button>
              <button role="radio" aria-checked={!mine} onClick={() => setMine(false)}>Toda la clínica</button>
            </div>
          )}
          {can('checkin.manage') && <button className="btn btn--primary" data-tour="sin-cita" onClick={() => setWalkIn(true)}><UserPlus size={17} />Paciente sin cita</button>}
        </>} />
      <div className="ce-arrange" role="group" aria-label="Ordenar la consulta externa">
        {multiDoctor && !mine && todayDoctors.length > 1 && (
          <label className="field field--inline"><span>Médico</span>
            <select className="select" value={byDoctor} onChange={(e) => setArrange({ doctor: e.target.value })}>
              <option value="">Todos los médicos</option>
              {todayDoctors.map((d) => <option key={d!.id} value={d!.id}>{d!.name}</option>)}
            </select></label>
        )}
        <label className="field field--inline"><span>Ordenar por</span>
          <select className="select" value={arrange.order} onChange={(e) => setArrange({ order: e.target.value as WaitOrder })}>
            {WAIT_ORDERS.filter((o) => multiDoctor || o.key !== 'doctor').map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select></label>
        {byDoctor && <button type="button" className="btn btn--ghost btn--sm" onClick={() => setArrange({ doctor: '' })}>Ver todos los médicos</button>}
      </div>
      <div className="grid-2" data-tour="sala-espera" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))' }}>
        {lanes.map((lane) => (
          <section key={lane.title} className="panel">
            <div className="panel__head"><div><h2>{lane.title} <span className="num" style={{ color: 'var(--faint)' }}>{lane.list.length}</span></h2><p>{lane.hint}</p></div></div>
            {lane.list.length ? lane.list.map((a, i) => {
              const p = patient(a.patientId)
              if (!p) return null
              // Ordenado por médico: un rótulo al empezar los pacientes de cada uno
              const head = arrange.order === 'doctor' && multiDoctor && (i === 0 || lane.list[i - 1].doctorId !== a.doctorId)
                ? <div key={`h-${a.doctorId}`} className="queue-group">{doctorName(a.doctorId)}</div> : null
              const wait = a.status === 'arrived' ? minutesSince(a.arrivedAt) : null
              const own = a.doctorId === user?.id
              const hosp = inpatientOf(p.id)
              const stay = stayOf(p.id)
              const takenFromMe = a.reassignedFrom === user?.id && !own
              // Ronda 8: internado (en observación u hospitalizado) no sigue en la consulta externa: sin preclínica ni consulta
              const interned = !!hosp && a.status !== 'done'
              return (
                <Fragment key={a.id}>{head}
                <div className="queue-card" style={{ gridTemplateColumns: '1fr auto' }}>
                  <div className="row__who">
                    <strong>{time(a.start)} <Link to={`/app/pacientes/${p.id}`}>{fullName(p)}</Link></strong>
                    <span>{[age(p.birthDate), `con ${staffById(a.doctorId)?.name}`, a.reason].filter(Boolean).join(' · ')}</span>
                    <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <StatusBadge status={a.status} />
                      {a.source === 'walkin' && <span className="badge badge--neutral">Sin cita</span>}
                      {a.type === 'urgent' && <span className="badge badge--red">Urgente</span>}
                      {hosp ? <Link to={stayPath(hosp)} className="badge badge--ink"><BedDouble size={12} />{hosp.kind === 'observation' ? 'En observación' : 'Hospitalizado'}</Link>
                        : stay && <span className="badge badge--ink"><BedDouble size={12} />{stay === 'observation' ? 'En observación' : 'Hospitalizado'}</span>}
                      {a.reassignedFrom && <span className="badge badge--amber">{takenFromMe ? `Lo atiende ${staffById(a.doctorId)?.name}` : `Atendido por ${staffById(a.doctorId)?.name}, estaba con ${staffById(a.reassignedFrom)?.name}`}</span>}
                      {wait !== null && <span className="wait">{wait} min esperando</span>}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gap: 6, alignContent: 'start' }}>
                    {['scheduled', 'confirmed'].includes(a.status) && !interned && can('checkin.manage') &&
                      <button className="btn btn--soft btn--sm" onClick={() => p.pending ? setCompleting(a) : setStatus(a.id, 'arrived', `Llegada de ${p.firstName} registrada`)}><LogIn size={15} />Llegó</button>}
                    {interned && <span className="muted" style={{ fontSize: 12.5, maxWidth: 170 }}>Está internado: se atiende desde su expediente.</span>}
                    {a.status === 'arrived' && !interned && can('vitals.record') &&
                      <button className="btn btn--primary btn--sm" onClick={() => setTriage(a)}><Activity size={15} />Preclínica</button>}
                    {/* CE1 (ronda 6): el cobro no va en Atendidos: se registra en Caja (o «Cobrar» del médico y del consultorio) */}
                    {['arrived', 'triaged', 'in_consult'].includes(a.status) && !interned && own && can('consult.write') &&
                      <button className="btn btn--primary btn--sm" onClick={() => nav(`/app/consulta/${a.id}`)}><Stethoscope size={15} />{a.status === 'in_consult' ? 'Continuar' : 'Atender'}</button>}
                    {a.status === 'triaged' && !interned && !own && multiDoctor && user?.role === 'doctor' && can('consult.write') &&
                      <button className="btn btn--ghost btn--sm" onClick={() => setTaking(a)}><Stethoscope size={15} />Atender</button>}
                    {a.status === 'done' && can('chart.view') &&
                      <Link className="btn btn--ghost btn--sm" to={`/app/pacientes/${p.id}`}><NotebookPen size={15} />Expediente</Link>}
                  </div>
                </div>
                </Fragment>
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
  const doctors = staff.filter((s) => hasRole(s, 'doctor') && s.active)
  const [patientId, setPatientId] = useState('')
  const [doctorId, setDoctorId] = useState(user?.role === 'doctor' ? user.id : doctors[0]?.id ?? '')
  const [reason, setReason] = useState('')
  // EN1 (ronda 6): apagado por defecto
  const [urgent, setUrgent] = useState(false)
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
        const ok = await walkIn({ patientId, doctorId, reason: reason.trim(), urgent })
        setBusy(false)
        if (ok) onClose()
      }}>Pasar a sala de espera</button>
    </>}>
      <PatientPicker value={patientId} onChange={setPatientId} />
      {can('patients.manage') && <button className="btn btn--primary" style={{ justifySelf: 'start' }} onClick={() => setRegistering(true)}><UserPlus size={16} />Registrar paciente nuevo</button>}
      {doctors.length > 1 && <label className="field"><span>Médico</span>
        <select className="select" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
          {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}{d.specialty ? `, ${d.specialty.toLowerCase()}` : ''}</option>)}
        </select></label>}
      <label className="field"><span>Motivo de consulta</span>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. Fiebre y dolor de garganta" /></label>
      <label className="switch-line"><input type="checkbox" role="switch" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} aria-checked={urgent} />
        <span><b>Urgente</b><small>La tarjeta sale con la etiqueta «Urgente». Queda en la bitácora con tu nombre.</small></span></label>
    </Modal>
  )
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
    const num = (k: VitalKey) => vitalNumber(v, k)
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
        <textarea className="textarea textarea--sm" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. Dolor de garganta y fiebre desde hace 3 días" />
        {!ready && <small className="field__msg field__msg--warn">Escribe el motivo para poder guardar la preclínica.</small>}</label>
      <VitalsFields v={v} setV={setV} checked={checked} setChecked={setChecked} ageYears={ageYears} onEdit={() => setConfirming(false)} />
      {shownWarn.length > 0 && <div className="alert-strip alert-strip--amber" role="status">Fuera de rango: {shownWarn.map((k) => VITALS[k].label.toLowerCase()).join(', ')}. El médico verá la alerta.</div>}
      <label className="field"><span>Observaciones de enfermería</span><textarea className="textarea textarea--sm" rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></label>
    </Modal>
  )
}
