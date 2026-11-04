import { useRef, useState } from 'react'
import { Camera, Plus, UserPlus, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { Modal } from '../components/ui'
import { ExamPicker } from '../components/Exams'
import { PatientPicker } from './Inpatients'
import { IdentificationForm } from './PatientForms'
import { uploadLarge } from '../lib/files'
import { examLine, GROUP_LABEL } from '../lib/exams'
import { hasRole } from '../lib/permissions'
import type { ExamGroup, ExamInput, Patient } from '../lib/types'

/**
 * DP3 (ronda 11): paciente que viene solo a hacerse exámenes. Tres pasos en una ventana: el paciente (buscar en la Biblioteca o
 * «Registrar paciente nuevo» con el formulario de alta de siempre), los estudios (la ventana «Ordenar exámenes» con solo la
 * pestaña del departamento; en imágenes, con los campos de CA6) y quién lo solicita (médico del sistema o nombre escrito,
 * opcional) con la foto de la orden en papel (opcional). Recepción y Administración eligen Laboratorio o Imagen y gabinete.
 */
export function AmbulatoryModal({ group: fixed, onClose, onDone }: { group?: ExamGroup; onClose: () => void; onDone: () => void }) {
  const { staff, addPatient, can, notify, patient } = useStore()
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
  const input = useRef<HTMLInputElement>(null)
  const doctors = staff.filter((s) => s.active && hasRole(s, 'doctor')).sort((a, b) => a.name.localeCompare(b.name, 'es'))
  if (registering) {
    return <IdentificationForm title="Registrar paciente nuevo" submitLabel="Registrar y continuar" withAllergies onClose={() => setRegistering(false)} onSave={async (p) => {
      const r = await addPatient(p as Omit<Patient, 'id' | 'record' | 'createdAt'>)
      if (r) { setPatientId(r.id); setRegistering(false) }
    }} />
  }
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
    <Modal title="Paciente ambulatorio" wide onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!patientId || !group || !exams.length || busy} onClick={save}>Enviar a la bandeja</button>
    </>}>
      <fieldset className="fs"><legend>1. Paciente</legend>
        <PatientPicker value={patientId} onChange={setPatientId} />
        {can('patients.manage') && <button type="button" className="btn btn--soft btn--sm" style={{ justifySelf: 'start' }} onClick={() => setRegistering(true)}><UserPlus size={15} />Registrar paciente nuevo</button>}
      </fieldset>
      <fieldset className="fs"><legend>2. Estudios</legend>
        {!fixed && <div className="segmented" role="radiogroup" aria-label="Departamento">
          {(['lab', 'imaging'] as ExamGroup[]).map((g) => <button key={g} type="button" role="radio" aria-checked={group === g} onClick={() => { if (g !== group) { setGroup(g); setExams([]) } }}>{GROUP_LABEL[g]}</button>)}
        </div>}
        {exams.length > 0 && <div className="chips">{exams.map((e, i) => <span key={i} className="chip">{examLine(e)}<button type="button" className="icon-btn" aria-label={`Quitar ${examLine(e)}`} onClick={() => setExams(exams.filter((_, j) => j !== i))}><X size={12} /></button></span>)}</div>}
        <button type="button" className="btn btn--soft btn--sm" style={{ justifySelf: 'start' }} disabled={!group} onClick={() => setPicking(true)}><Plus size={15} />Elegir estudios</button>
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
            <button type="button" className="btn btn--soft btn--sm" disabled={!patientId || !group} onClick={() => input.current?.click()}><Camera size={15} />{file ? 'Cambiar archivo' : 'Tomar foto o elegir archivo'}</button>
            {file && <span className="muted">{file.name}</span>}
          </div>
          <input ref={input} type="file" accept="image/*,application/pdf" hidden onChange={(x) => setFile(x.target.files?.[0] ?? null)} /></div>
      </fieldset>
      {picking && group && <ExamPicker only={group} current={exams} title={`Estudios de ${GROUP_LABEL[group].toLowerCase()}`} onClose={() => setPicking(false)} onAdd={(list) => { setExams([...exams, ...list]); setPicking(false) }} />}
    </Modal>
  )
}
