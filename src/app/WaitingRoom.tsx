import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Activity, BedDouble, LogIn, NotebookPen, Stethoscope, Syringe } from 'lucide-react'
import { WalkInButton } from './WalkIn'
import { useStore } from '../lib/store'
import { features } from '../lib/permissions'
import { Modal, PageHead, StatusBadge } from '../components/ui'
import { age, fullName, sameDay, time } from '../lib/format'
import type { Appointment, ConsultApplication, Vitals } from '../lib/types'
import { ApplyModal, applyBadge, canApply } from '../components/ApplyMeds'
import { api, ApiError } from '../lib/api'
import { GRACE_EXPIRED_TEXT } from '../lib/grace'
import { CorrectionReason, GraceButton } from '../components/Grace'
import { parseDecimal, VITALS, type VitalKey } from '../lib/vitals'
import { EMPTY_VITALS, FIELDS, fieldIssue, vitalNumber, type VitalsForm } from '../lib/vitalsForm'
import { VitalsFields } from '../components/VitalsFields'
import { ApptGroupList, GroupTools, groupAppointments, useFold, type ApptGroupView } from '../components/ApptGroups'
import { QUEUE_DEFAULT_VIEW, QUEUE_GROUP_ROLES } from '../lib/clinicalConfig'
import { byArrival } from '../lib/arrivals'
import { stayConflictText, stayPath, yearsOld } from '../lib/inpatient'
import { CompleteRegistration } from './NewPatient'

const minutesSince = (iso?: string) => (iso ? Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)) : null)

/**
 * Consulta externa del día: los que tienen cita y los que van llegando sin cita. Enfermería abre
 * la preclínica y el médico los atiende. No se muestra "por llegar": esa lista no aporta aquí.
 */
export default function WaitingRoom() {
  const { appointments, vitals, patient, staffById, can, setStatus, user, activeStayOf, inpatientOf, takeAppointment, settings, saveMyProfile } = useStore()
  // Un consultorio tiene un solo médico: no hay "Mis pacientes / Toda la clínica" ni atender al de otro médico
  const multiDoctor = features(settings).multiDoctor
  const nav = useNavigate()
  const [taking, setTaking] = useState<Appointment | null>(null)
  const [busy, setBusy] = useState(false)
  const [triage, setTriage] = useState<Appointment | null>(null)
  // GE4 (ronda 9): quien hizo la preclínica la corrige en el periodo de gracia, con el mismo formulario
  const [fixing, setFixing] = useState<{ appt: Appointment; vitals: Vitals } | null>(null)
  // ME13 (ronda 14): los medicamentos «Aplicar en la clínica» de las consultas de hoy sin ingreso; enfermería (o el médico) los aplica
  const mayApply = canApply(can)
  const [apps, setApps] = useState<ConsultApplication[]>([])
  const [applying, setApplying] = useState<ConsultApplication[] | null>(null)
  const doneToday = appointments.filter((a) => a.status === 'done' && sameDay(a.start, new Date())).length
  const loadApps = useCallback(() => {
    const from = new Date(); from.setHours(0, 0, 0, 0)
    const to = new Date(from); to.setDate(to.getDate() + 1)
    api<ConsultApplication[]>(`/applications?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`).then(setApps).catch(() => null)
  }, [])
  useEffect(() => {
    if (!mayApply) return
    loadApps()
    const t = setInterval(loadApps, 60_000)
    return () => clearInterval(t)
  }, [mayApply, loadApps, doneToday])
  const [completing, setCompleting] = useState<Appointment | null>(null)
  // El médico ve "Mis pacientes" por defecto y se recuerda su última elección en este navegador
  const viewKey = `clinara.ce.${user?.id}`
  const [mine, setMineState] = useState(() => {
    if (user?.role !== 'doctor' || !features(settings).multiDoctor) return false
    try { return localStorage.getItem(viewKey) !== 'clinica' } catch { return true }
  })
  const setMine = (v: boolean) => { setMineState(v); try { localStorage.setItem(viewKey, v ? 'mios' : 'clinica') } catch { /* sin almacenamiento */ } }
  const ofToday = appointments.filter((a) => sameDay(a.start, new Date()) && !['cancelled'].includes(a.status))
  // RE2 (ronda 16): en una clínica, el médico ve a sus pacientes por orden de llegada (el primero en llegar arriba); los demás,
  // por la hora de la cita, como antes
  const arrivalOrder = multiDoctor && user?.role === 'doctor'
  const today = ofToday
    // En "Mis pacientes" también sale el que otro médico tomó, para que se vea quién lo atiende
    .filter((a) => !mine || a.doctorId === user?.id || a.reassignedFrom === user?.id)
    .sort(arrivalOrder ? byArrival : (a, b) => a.start.localeCompare(b.start))
  // CX1 (ronda 8): en una clínica, Administración agrupa las tres columnas «Por hora | Por médico» (el mismo componente de
  // «Por llegar hoy»). Recordado por usuario y entre sesiones. Los roles que lo ven están en clinicalConfig (QUEUE_GROUP_ROLES).
  // RE2 (ronda 16): también recepción; por defecto «Por médico» con los grupos de médico contraídos
  const grouped = multiDoctor && !!user && QUEUE_GROUP_ROLES.includes(user.role)
  const [view, setViewState] = useState<ApptGroupView>(user?.prefs?.queueView ?? QUEUE_DEFAULT_VIEW)
  const setView = (v: ApptGroupView) => { setViewState(v); if (v !== (user?.prefs?.queueView ?? QUEUE_DEFAULT_VIEW)) void saveMyProfile({ queueView: v }) }
  const fold = useFold((k) => !k.includes(':d:'))
  const lanes = [
    { title: 'En sala', hint: multiDoctor ? 'Esperan que enfermería les abra la preclínica.' : 'Esperan la preclínica (signos vitales).', list: today.filter((a) => a.status === 'arrived') },
    { title: 'Listos para consulta', hint: 'Con preclínica hecha; el médico los llamará.', list: today.filter((a) => ['triaged', 'in_consult'].includes(a.status)) },
    { title: 'Atendidos', hint: 'Consultas firmadas hoy.', list: today.filter((a) => a.status === 'done') },
  ].map((l) => ({ ...l, groups: grouped ? groupAppointments(l.list, view, staffById, true) : [] }))
  const groupKeys = lanes.flatMap((l) => l.groups.map((g) => `${l.title}:${g.key}`))
  const card = (a: Appointment) => {
    const p = patient(a.patientId)
    if (!p) return null
    const wait = a.status === 'arrived' ? minutesSince(a.arrivedAt) : null
    const own = a.doctorId === user?.id
    const hosp = inpatientOf(p.id)
    const stay = activeStayOf(p.id)
    const takenFromMe = a.reassignedFrom === user?.id && !own
    // CX2 (ronda 8): con una estancia activa no sigue en la consulta externa. Si aun así quedó en la cola (no debería: el
    // servidor lo impide y la migración las cancela), la tarjeta lo marca y no deja hacer la preclínica ni atender.
    const interned = !!stay && a.status !== 'done'
    // Auditoría (nov. 2026), punto 6: para el médico la acción principal es «Atender»; «Preclínica» queda como secundaria.
    // Enfermería (y quien hace la preclínica sin atender) la sigue viendo como principal.
    const triageBtn = `btn btn--${user?.role === 'doctor' ? 'soft' : 'primary'} btn--sm`
    return (
      <div key={a.id} className="queue-card" style={{ gridTemplateColumns: '1fr auto' }}>
        <div className="row__who">
          <strong>{time(a.start)} <Link to={`/app/pacientes/${p.id}`}>{fullName(p)}</Link></strong>
          <span>{[age(p.birthDate), `con ${staffById(a.doctorId)?.name}`, a.reason].filter(Boolean).join(' · ')}</span>
          <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <StatusBadge status={a.status} />
            {a.source === 'walkin' && <span className="badge badge--neutral">Sin cita</span>}
            {a.type === 'urgent' && <span className="badge badge--red">Urgente</span>}
            {interned ? <span className="badge badge--red"><BedDouble size={12} />Conflicto: hospitalizado</span>
              : hosp ? <Link to={stayPath(hosp)} className="badge badge--ink"><BedDouble size={12} />{hosp.kind === 'observation' ? 'En observación' : 'Hospitalizado'}</Link>
                : stay && <span className="badge badge--ink"><BedDouble size={12} />{stay.kind === 'observation' ? 'En observación' : 'Hospitalizado'}</span>}
            {a.reassignedFrom && <span className="badge badge--amber">{takenFromMe ? `Lo atiende ${staffById(a.doctorId)?.name}` : `Atendido por ${staffById(a.doctorId)?.name}, estaba con ${staffById(a.reassignedFrom)?.name}`}</span>}
            {wait !== null && <span className="wait">{wait} min esperando</span>}
            {(() => { const b = a.status === 'done' && applyBadge(apps.filter((x) => x.appointmentId === a.id)); return b && <span className={`badge badge--${b.tone}`}><Syringe size={12} />{b.text}</span> })()}
          </div>
        </div>
        <div style={{ display: 'grid', gap: 6, alignContent: 'start' }}>
          {['scheduled', 'confirmed'].includes(a.status) && !interned && can('checkin.manage') &&
            <button className="btn btn--soft btn--sm" onClick={() => p.pending ? setCompleting(a) : setStatus(a.id, 'arrived', `Llegada de ${p.firstName} registrada`)}><LogIn size={15} />Llegó</button>}
          {a.status === 'arrived' && can('vitals.record') && (interned
            ? <button className={triageBtn} disabled aria-describedby={`cx2-${a.id}`}><Activity size={15} />Preclínica</button>
            : <button className={triageBtn} onClick={() => setTriage(a)}><Activity size={15} />Preclínica</button>)}
          {(() => {
            const pv = ['triaged', 'in_consult'].includes(a.status) ? vitals.find((x) => x.appointmentId === a.id) : undefined
            return pv && <GraceButton record={pv} authorId={pv.takenBy} onCorrect={() => setFixing({ appt: a, vitals: pv })} />
          })()}
          {interned && <small id={`cx2-${a.id}`} className="muted" style={{ fontSize: 12.5, maxWidth: 190 }}>{stayConflictText(stay)}</small>}
          {/* CE1 (ronda 6): el cobro no va en Atendidos: se registra en Caja (o «Cobrar» del médico y del consultorio) */}
          {['arrived', 'triaged', 'in_consult'].includes(a.status) && !interned && own && can('consult.write') &&
            <button className="btn btn--primary btn--sm" onClick={() => nav(`/app/consulta/${a.id}`)}><Stethoscope size={15} />{a.status === 'in_consult' ? 'Continuar' : 'Atender'}</button>}
          {a.status === 'triaged' && !interned && !own && multiDoctor && user?.role === 'doctor' && can('consult.write') &&
            <button className="btn btn--ghost btn--sm" onClick={() => setTaking(a)}><Stethoscope size={15} />Atender</button>}
          {a.status === 'done' && mayApply && apps.some((x) => x.appointmentId === a.id && x.status === 'pending') &&
            <button className="btn btn--primary btn--sm" onClick={() => setApplying(apps.filter((x) => x.appointmentId === a.id))}><Syringe size={15} />Aplicar</button>}
          {a.status === 'done' && can('chart.view') &&
            <Link className="btn btn--ghost btn--sm" to={`/app/pacientes/${p.id}`}><NotebookPen size={15} />Expediente</Link>}
        </div>
      </div>
    )
  }


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
          {/* PF1 (ronda 17): también el médico de la clínica (cualquier especialidad) */}
          {can('checkin.manage') && <WalkInButton tour="sin-cita" />}
          {/* AD1 (ronda 17): «Paciente ambulatorio» ya no va aquí: está en Laboratorio e imágenes › Pacientes ambulatorios */}
        </>} />
      {applying && <ApplyModal list={applying} onClose={() => setApplying(null)} onSaved={() => { setApplying(null); loadApps() }} />}
      {grouped && (
        <div className="ce-arrange" role="group" aria-label="Organizar la consulta externa">
          <GroupTools view={view} onView={setView} onExpand={() => fold.setAll(groupKeys, true)} onCollapse={() => fold.setAll(groupKeys, false)} />
        </div>
      )}
      <div className="grid-2" data-tour="sala-espera" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))' }}>
        {lanes.map((lane) => (
          <section key={lane.title} className="panel">
            <div className="panel__head"><div><h2>{lane.title} <span className="num faint">{lane.list.length}</span></h2><p>{lane.hint}</p></div></div>
            {!lane.list.length ? <div className="empty">Nadie en esta etapa.</div>
              : grouped ? <ApptGroupList groups={lane.groups} prefix={`${lane.title}:`} isOpen={fold.isOpen} toggle={fold.toggle} render={card} className="queue-group-body" />
                : lane.list.map(card)}
          </section>
        ))}
      </div>
      {triage && <VitalsModal appt={triage} onClose={() => setTriage(null)} onSaved={() => setTriage(null)} />}
      {fixing && <VitalsModal appt={fixing.appt} correct={fixing.vitals} onClose={() => setFixing(null)} onSaved={() => setFixing(null)} />}
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
          <p className="c-muted fs-md">La consulta quedará a su nombre y la bitácora registrará que usted lo tomó y a quién estaba asignado.</p>
        </Modal>
      )}
      {completing && patient(completing.patientId) && <CompleteRegistration patient={patient(completing.patientId)!} onClose={() => setCompleting(null)}
        onDone={async () => { setCompleting(null); await setStatus(completing.id, 'arrived', 'Registro completado y llegada registrada') }} />}
    </div>
  )
}

// RE1 (ronda 16): «Paciente sin cita» y el aviso de estancia activa viven en WalkIn.tsx (los usan también Inicio y «Paciente ambulatorio»)
export { StayConflict } from './WalkIn'

/**
 * Triaje: enfermería registra el motivo de consulta y los signos vitales; el médico recibe ambos.
 * Cada campo se revisa al salir de él (nunca mientras se escribe) y otra vez al guardar.
 */
export function VitalsModal({ appt, onClose, onSaved, correct }: { appt: Appointment; onClose: () => void; onSaved: () => void
  /** GE4 (ronda 9): «Corregir» la preclínica ya guardada (mismo formulario, ya llenado, con «Guardar corrección»). */
  correct?: Vitals }) {
  const { patient, addVitals, notify, refresh } = useStore()
  const p = patient(appt.patientId)!
  const ageYears = p.birthDate ? yearsOld(p.birthDate) : undefined
  const [reason, setReason] = useState(correct?.chiefComplaint ?? appt.reason)
  const [v, setV] = useState<VitalsForm>(() => correct
    ? { ...EMPTY_VITALS, ...Object.fromEntries(FIELDS.map((k) => [k, correct[k] == null ? '' : String(correct[k]).replace('.', ',')])), notes: correct.notes ?? '' } : EMPTY_VITALS)
  const [why, setWhy] = useState('')
  const [expired, setExpired] = useState(false)
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
    if (correct) {
      try {
        await api(`/vitals/${correct.id}/correct`, { body: { version: correct.version ?? 1, why: why.trim() || undefined, chiefComplaint: reason.trim(),
          ...Object.fromEntries(FIELDS.map((k) => [k, num(k)])), notes: v.notes.trim() || undefined } })
        notify('Corrección guardada'); await refresh(); onSaved()
      } catch (e) {
        if (e instanceof ApiError && e.status === 409 && /minutos/.test(e.message)) setExpired(true)
        else notify(e instanceof Error ? e.message : 'No se pudo guardar la corrección.', 'error')
      } finally { setBusy(false) }
      return
    }
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
    <Modal title={`${correct ? 'Corregir: ' : ''}Preclínica de ${fullName(p)}`} onClose={onClose} footer={confirming ? <>
      <span className="field__msg field__msg--error mr-auto">Revise: {errors.map((k) => `${VITALS[k].label.toLowerCase()} ${v[k]}`).join(', ')}.</span>
      <button className="btn btn--ghost" onClick={() => setConfirming(false)}>Corregir</button>
      <button className="btn btn--danger" disabled={busy} onClick={save}>Guardar de todos modos</button>
    </> : <>
      {correct && (expired ? <span className="field__msg field__msg--error mr-auto" role="alert">{GRACE_EXPIRED_TEXT.replace(/ Lo que escribiste.*$/, '')}</span>
        : <span className="mr-auto"><CorrectionReason value={why} onChange={setWhy} /></span>)}
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!ready || busy || expired} onClick={trySave}>{correct ? 'Guardar corrección' : 'Guardar preclínica'}</button>
    </>}>
      {p.allergies.length > 0 && <div className="alert-strip">Alergias: {p.allergies.join(', ')}</div>}
      <p className="c-muted fs-md">Registra el motivo y sólo los signos que apliquen. Ningún signo es obligatorio. Puedes usar punto o coma para los decimales.</p>
      <label className="field"><span>Motivo de consulta, en palabras del paciente</span>
        <textarea className="textarea textarea--sm" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. Dolor de garganta y fiebre desde hace 3 días" />
        {!ready && <small className="field__msg field__msg--warn">Escribe el motivo para poder guardar la preclínica.</small>}</label>
      <VitalsFields v={v} setV={setV} checked={checked} setChecked={setChecked} ageYears={ageYears} onEdit={() => setConfirming(false)} />
      {shownWarn.length > 0 && <div className="alert-strip alert-strip--amber" role="status">Fuera de rango: {shownWarn.map((k) => VITALS[k].label.toLowerCase()).join(', ')}. El médico verá la alerta.</div>}
      <label className="field"><span>Observaciones de enfermería</span><textarea className="textarea textarea--sm" rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></label>
    </Modal>
  )
}
