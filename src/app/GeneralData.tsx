import { useState } from 'react'
import { useStore } from '../lib/store'
import { formatPhone } from '../lib/format'
import type { Hospitalization, Patient } from '../lib/types'
import { IdentificationForm } from './PatientForms'
import { BedFields } from '../components/BedFields'
import { defaultSpecialty } from '../lib/inpatient'

const PATIENT_KEYS = ['firstName', 'lastName', 'birthDate', 'sex', 'phone', 'email', 'dni', 'civilStatus', 'occupation', 'education', 'religion', 'address',
  'emergencyName', 'emergencyPhone', 'emergencyRelation', 'insurance', 'guardianName', 'guardianDni', 'guardianRelation'] as const

/**
 * "Editar datos generales" de una estancia: la cama (en hospitalización), quién acompaña y los teléfonos, y la
 * ficha de identificación del paciente, que se guarda en su expediente. El ingreso (nota, diagnósticos, órdenes,
 * medicamentos, fecha y hora) no se edita aquí: un error clínico se corrige con una nota u orden nueva.
 */
export function GeneralDataModal({ h, p, onClose, onDone }: { h: Hospitalization; p: Patient; onClose: () => void; onDone: () => void }) {
  const { updateAdmission, updatePatient, staffById } = useStore()
  const obs = h.kind === 'observation'
  const [stay, setStay] = useState({ bedId: h.bedId ?? '', specialty: h.specialty ?? defaultSpecialty(staffById(h.admittedBy)), companionName: h.companionName ?? '', companionRelation: h.companionRelation ?? '',
    companionPhone: h.companionPhone ?? '', patientPhone: h.patientPhone ?? '' })
  const set = (k: keyof typeof stay) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setStay({ ...stay, [k]: k.endsWith('Phone') ? formatPhone(e.target.value) : e.target.value })
  return (
    <IdentificationForm title="Editar datos generales" submitLabel="Guardar" initial={p} onClose={onClose} onSave={async (data) => {
      // Sólo se envía lo que cambió: la bitácora registra campo, valor anterior y valor nuevo
      const stayChanges = Object.fromEntries(Object.entries(stay).filter(([k, v]) => v.trim() !== String(h[k as keyof Hospitalization] ?? '')).map(([k, v]) => [k, v.trim()]))
      if (obs) { delete stayChanges.bedId; delete stayChanges.specialty }
      const patientChanges = Object.fromEntries(PATIENT_KEYS.filter((k) => (data[k] ?? '') !== (p[k] ?? '')).map((k) => [k, data[k]]))
      if (Object.keys(stayChanges).length && !(await updateAdmission(h.id, stayChanges))) return
      if (Object.keys(patientChanges).length && !(await updatePatient(p.id, patientChanges))) return
      onDone()
    }}>
      <fieldset className="fs"><legend>{obs ? 'Observación' : 'Estancia'}</legend>
        <p className="muted" style={{ fontSize: 13.5 }}>La nota de ingreso, los diagnósticos, las órdenes y la fecha y hora del ingreso no se editan. Si hay un error clínico, escribe una nota nueva o cambia la orden.</p>
        <div className="form-grid">
          {!obs && <div className="span-2"><BedFields bedId={stay.bedId} specialty={stay.specialty} currentBedId={h.bedId} onChange={(v) => setStay({ ...stay, ...v })} /></div>}
          <label className="field"><span>Quién lo acompaña</span><input className="input" value={stay.companionName} onChange={set('companionName')} /></label>
          <label className="field"><span>Parentesco</span><input className="input" value={stay.companionRelation} onChange={set('companionRelation')} /></label>
          <label className="field"><span>Teléfono del acompañante</span><input className="input" inputMode="tel" value={stay.companionPhone} onChange={set('companionPhone')} placeholder="0000-0000" /></label>
          <label className="field"><span>Teléfono del paciente durante la estancia</span><input className="input" inputMode="tel" value={stay.patientPhone} onChange={set('patientPhone')} placeholder="0000-0000" /></label>
        </div>
      </fieldset>
    </IdentificationForm>
  )
}
