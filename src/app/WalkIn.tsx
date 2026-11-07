import { useState } from 'react'
import { Link } from 'react-router-dom'
import { UserPlus } from 'lucide-react'
import { useStore } from '../lib/store'
import { hasRole } from '../lib/permissions'
import { Modal } from '../components/ui'
import { stayConflictText, stayPath } from '../lib/inpatient'
import type { ActiveStay, Patient } from '../lib/types'
import { PatientPicker } from './Inpatients'
import { IdentificationForm } from './PatientForms'

/**
 * CX2 (ronda 8): el paciente tiene una estancia activa: no pasa a la consulta externa. Dice dónde está y, a quien puede
 * verlo, lleva a su expediente de la estancia.
 */
export function StayConflict({ stay }: { stay: ActiveStay }) {
  const { can } = useStore()
  return (
    <div className="alert-strip" role="alert">
      <span>{stayConflictText(stay)}</span>
      {can('inpatient.view') && <> <Link to={stayPath(stay)}>Ver paciente hospitalizado</Link></>}
    </div>
  )
}

/**
 * Paciente que llega de pie: se busca o se registra y entra a la sala de espera (Consulta externa › «En sala»). RE1 (ronda 16):
 * una sola ventana para Consulta externa, el Inicio de administración y de recepción y el enlace de «Paciente ambulatorio»
 * (que le pasa el paciente ya elegido).
 */
export function WalkInModal({ onClose, initialPatientId = '' }: { onClose: () => void; initialPatientId?: string }) {
  const { staff, walkIn, addPatient, can, user, activeStayOf } = useStore()
  const doctors = staff.filter((s) => hasRole(s, 'doctor') && s.active)
  const [patientId, setPatientId] = useState(initialPatientId)
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
      <button className="btn btn--primary" disabled={!patientId || !doctorId || !reason.trim() || busy || !!activeStayOf(patientId)} onClick={async () => {
        setBusy(true)
        const ok = await walkIn({ patientId, doctorId, reason: reason.trim(), urgent })
        setBusy(false)
        if (ok) onClose()
      }}>Pasar a sala de espera</button>
    </>}>
      <PatientPicker value={patientId} onChange={setPatientId} />
      {patientId && activeStayOf(patientId) && <StayConflict stay={activeStayOf(patientId)!} />}
      {can('patients.manage') && <button className="btn btn--primary self-start" onClick={() => setRegistering(true)}><UserPlus size={16} />Registrar paciente nuevo</button>}
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

/** RE1 (ronda 16): el botón «Paciente sin cita» con su ventana (Consulta externa e Inicio de administración y de recepción). */
export function WalkInButton({ primary = true, tour }: { primary?: boolean; tour?: string }) {
  const [open, setOpen] = useState(false)
  return <>
    <button className={`btn ${primary ? 'btn--primary' : 'btn--soft'}`} data-tour={tour} onClick={() => setOpen(true)}><UserPlus size={17} />Paciente sin cita</button>
    {open && <WalkInModal onClose={() => setOpen(false)} />}
  </>
}
