import { useRef, useState } from 'react'
import { Camera, FlaskConical, Plus, UserPlus, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { Modal } from '../components/ui'
import { ExamPicker } from '../components/Exams'
import { PatientPicker } from './Inpatients'
import { uploadLarge } from '../lib/files'
import { examLine, GROUP_LABEL } from '../lib/exams'
import { hasRole } from '../lib/permissions'
import type { ExamGroup, ExamInput } from '../lib/types'
import { WalkInModal } from './WalkIn'

/**
 * DP3 (ronda 11): paciente que viene solo a hacerse exámenes. Tres pasos en una ventana: el paciente (buscar en la Biblioteca o
 * «Registrar paciente nuevo» con el formulario de alta de siempre), los estudios (la ventana «Ordenar exámenes» con solo la
 * pestaña del departamento; en imágenes, con los campos de CA6) y quién lo solicita (médico del sistema o nombre escrito,
 * opcional) con la foto de la orden en papel (opcional). Recepción y Administración eligen Laboratorio o Imagen y gabinete.
 */
/**
 * LB6 (ronda 12): quien viene solo a hacerse exámenes y no está registrado: lo mínimo para tomar la muestra y enviarle el
 * resultado (nombres, apellidos, edad, sexo, teléfono o correo e identidad). Nada de la ficha completa.
 */
function QuickPatient({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { notify, refresh } = useStore()
  const [f, setF] = useState({ firstName: '', lastName: '', age: '', ageUnit: 'years' as 'years' | 'months', sex: '' as '' | 'F' | 'M', phone: '', email: '', dni: '' })
  const [busy, setBusy] = useState(false)
  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch })
  const phoneOk = f.phone.replace(/\D/g, '').length >= 7
  const ready = f.firstName.trim() && f.lastName.trim() && f.age.trim() !== '' && Number(f.age) >= 0 && f.sex && (phoneOk || /\S+@\S+\.\S+/.test(f.email))
  const save = async () => {
    setBusy(true)
    try {
      const r = await api<{ id: string; record: string; existing?: string }>('/dept/quick-patient', { body: { firstName: f.firstName.trim(), lastName: f.lastName.trim(), age: Number(f.age), ageUnit: f.ageUnit,
        sex: f.sex, phone: f.phone.trim() || undefined, email: f.email.trim() || undefined, dni: f.dni.trim() || undefined } })
      await refresh()
      notify(r.existing ? `Esa identidad ya estaba registrada: se usa el expediente de ${r.existing} (${r.record}).` : `Registrado con el expediente ${r.record}.`)
      onCreated(r.id)
    } catch (x) { notify((x as Error).message, 'error'); setBusy(false) }
  }
  return (
    <Modal title="Paciente nuevo (solo exámenes)" onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Volver</button>
      <button className="btn btn--primary" disabled={!ready || busy} onClick={save}>Registrar y continuar</button>
    </>}>
      <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>Solo lo necesario para tomar la muestra y enviarle el resultado. Si después pasa a consulta, la ficha se completa en su expediente.</p>
      <div className="form-grid">
        <label className="field"><span>Nombres</span><input className="input" autoFocus value={f.firstName} onChange={(e) => set({ firstName: e.target.value })} /></label>
        <label className="field"><span>Apellidos</span><input className="input" value={f.lastName} onChange={(e) => set({ lastName: e.target.value })} /></label>
        <div className="field"><span>Edad</span><span style={{ display: 'flex', gap: 6 }}>
          <input className="input num" inputMode="numeric" value={f.age} onChange={(e) => set({ age: e.target.value.replace(/\D/g, '').slice(0, 3) })} aria-label="Edad" style={{ maxWidth: 90 }} />
          <select className="select" value={f.ageUnit} onChange={(e) => set({ ageUnit: e.target.value as 'years' | 'months' })} aria-label="Años o meses"><option value="years">años</option><option value="months">meses</option></select></span></div>
        <div className="field"><span>Sexo</span>
          <div className="segmented" role="radiogroup" aria-label="Sexo">
            {(['F', 'M'] as const).map((s) => <button key={s} type="button" role="radio" aria-checked={f.sex === s} onClick={() => set({ sex: s })}>{s === 'F' ? 'Femenino' : 'Masculino'}</button>)}
          </div></div>
        <label className="field"><span>Teléfono</span><input className="input" inputMode="tel" value={f.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="Para enviarle el resultado" /></label>
        <label className="field"><span>o correo</span><input className="input" type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} placeholder="nombre@correo.com" /></label>
        <label className="field span-2"><span>Número de identidad</span><input className="input" value={f.dni} onChange={(e) => set({ dni: e.target.value })} placeholder="0801-1990-12345" /></label>
      </div>
      {!phoneOk && !f.email.trim() && <small className="muted">Falta un teléfono o un correo para enviarle el resultado.</small>}
    </Modal>
  )
}

export function AmbulatoryModal({ group: fixed, onClose, onDone }: { group?: ExamGroup; onClose: () => void; onDone: () => void }) {
  const { staff, can, notify, patient } = useStore()
  const [patientId, setPatientId] = useState('')
  const [registering, setRegistering] = useState(false)
  const [group, setGroup] = useState<ExamGroup | null>(fixed ?? null)
  const [exams, setExams] = useState<ExamInput[]>([])
  const [picking, setPicking] = useState(false)
  const [urgent, setUrgent] = useState(false)
  const [doctorId, setDoctorId] = useState('')
  const [doctorName, setDoctorName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  // RE1 (ronda 16): «Paciente sin cita» desde esta ventana: se cierra esta y se abre la otra con el mismo paciente
  const [toWalkIn, setToWalkIn] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const doctors = staff.filter((s) => s.active && hasRole(s, 'doctor')).sort((a, b) => a.name.localeCompare(b.name, 'es'))
  if (toWalkIn) return <WalkInModal initialPatientId={patientId} onClose={onClose} />
  if (registering) return <QuickPatient onClose={() => setRegistering(false)} onCreated={(id) => { setPatientId(id); setRegistering(false) }} />
  const save = async () => {
    if (!group) return
    setBusy(true)
    try {
      const fileId = file ? (await uploadLarge(patientId, file, { name: file.name, mime: file.type || 'application/pdf', category: group, title: 'Orden del médico (papel)' })).id : undefined
      await api('/dept/ambulatory', { body: { patientId, group, exams: exams.map((e) => ({ ...e, priority: urgent ? 'urgent' : 'routine', place: 'clinic' })),
        requestedById: doctorId || undefined, requestedByName: !doctorId && doctorName.trim() ? doctorName.trim() : undefined, fileId } })
      notify(`${patient(patientId)?.firstName ?? 'El paciente'} quedó en la bandeja de ${GROUP_LABEL[group].toLowerCase()} como ambulatorio.`)
      onDone()
    } catch (x) { notify((x as Error).message, 'error'); setBusy(false) }
  }
  return (
    <Modal title="Paciente ambulatorio · laboratorio o imágenes" wide onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!patientId || !group || !exams.length || busy} onClick={save}>Enviar a la bandeja</button>
    </>}>
      {/* RE1 (ronda 16): deja claro que es solo para estudios; quien viene a consulta va por «Paciente sin cita» */}
      {!fixed && <p className="amb-intro">Para el paciente que viene solo a hacerse exámenes o estudios. Si viene a consulta, usa {can('checkin.manage')
        ? <button type="button" className="link-btn" onClick={() => setToWalkIn(true)}>«Paciente sin cita»</button> : '«Paciente sin cita»'}.</p>}
      <fieldset className="fs"><legend>1. Paciente</legend>
        <PatientPicker value={patientId} onChange={setPatientId} />
        {can('patients.manage') && <button type="button" className="btn btn--soft btn--sm" style={{ justifySelf: 'start' }} onClick={() => setRegistering(true)}><UserPlus size={15} />No está registrado: registrarlo</button>}
      </fieldset>
      <fieldset className="fs"><legend>2. Estudios</legend>
        {!fixed && <div className="segmented segmented--strong" role="radiogroup" aria-label="Departamento">
          {(['lab', 'imaging'] as ExamGroup[]).map((g) => <button key={g} type="button" role="radio" aria-checked={group === g} onClick={() => { if (g !== group) { setGroup(g); setExams([]) } }}>{GROUP_LABEL[g]}</button>)}
        </div>}
        {exams.length > 0 && <div className="chips">{exams.map((e, i) => <span key={i} className="chip">{examLine(e)}<button type="button" className="icon-btn" aria-label={`Quitar ${examLine(e)}`} onClick={() => setExams(exams.filter((_, j) => j !== i))}><X size={12} /></button></span>)}</div>}
        <div className="amb-pick">
          <button type="button" className="btn btn--soft btn--sm" disabled={!group} aria-describedby={group ? undefined : 'amb-pick-hint'} onClick={() => setPicking(true)}><Plus size={15} />Elegir estudios</button>
          {!group && <small id="amb-pick-hint" className="muted">Elige primero Laboratorio o Imagen y gabinete</small>}
        </div>
        <div className="segmented segmented--sm" role="radiogroup" aria-label="Prioridad" style={{ justifySelf: 'start' }}>
          <button type="button" role="radio" aria-checked={!urgent} onClick={() => setUrgent(false)}>Rutina</button>
          <button type="button" role="radio" aria-checked={urgent} onClick={() => setUrgent(true)}>Urgente</button>
        </div>
      </fieldset>
      <fieldset className="fs"><legend>3. Quién lo solicita</legend>
        <label className="field"><span>Médico que solicita (opcional)</span>
          <select className="select" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
            <option value="">Médico de afuera o viene por su cuenta</option>{doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        {!doctorId && <label className="field"><span>Nombre del médico (si es de afuera)</span><input className="input" value={doctorName} onChange={(e) => setDoctorName(e.target.value)} placeholder="Ej. Dr. Carlos Medina" /></label>}
        <div className="field"><span>Foto o archivo de la orden (opcional)</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* RE1 (ronda 16): siempre activo (el archivo se sube al enviar, cuando ya hay paciente y departamento) */}
            <button type="button" className="btn btn--soft btn--sm" onClick={() => input.current?.click()}><Camera size={15} />{file ? 'Cambiar archivo' : 'Tomar foto o elegir archivo'}</button>
            {file && <span className="muted">{file.name}</span>}
          </div>
          <input ref={input} type="file" accept="image/*,application/pdf" hidden onChange={(x) => setFile(x.target.files?.[0] ?? null)} /></div>
      </fieldset>
      {picking && group && <ExamPicker only={group} current={exams} title={`Estudios de ${GROUP_LABEL[group].toLowerCase()}`} onClose={() => setPicking(false)} onAdd={(list) => { setExams([...exams, ...list]); setPicking(false) }} />}
    </Modal>
  )
}

/**
 * DP3 (ronda 11) y RE1 (ronda 16): el botón «Paciente ambulatorio» de Consulta externa y del Inicio, con la línea que aclara que
 * es solo para estudios, sin consulta.
 */
export function AmbulatoryButton() {
  const [open, setOpen] = useState(false)
  const hint = 'Solo laboratorio o imágenes, sin consulta'
  return <>
    <button className="btn btn--soft btn--twoline" title={hint} onClick={() => setOpen(true)}>
      <FlaskConical size={17} /><span>Paciente ambulatorio<small>{hint}</small></span>
    </button>
    {open && <AmbulatoryModal onClose={() => setOpen(false)} onDone={() => setOpen(false)} />}
  </>
}
