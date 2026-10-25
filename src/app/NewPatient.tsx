import { useState } from 'react'
import { UserCheck, UserPlus } from 'lucide-react'
import { useStore } from '../lib/store'
import { Modal } from '../components/ui'
import { age, fullName } from '../lib/format'
import { similarPatients } from '../lib/patients'
import type { Patient } from '../lib/types'
import { IdentificationForm } from './PatientForms'

/** Lista "¿Es esta persona?" con un botón para usar el expediente que ya existe. */
export function SimilarPatients({ list, onPick, pickLabel = 'Es esta persona' }: { list: Patient[]; onPick: (p: Patient) => void; pickLabel?: string }) {
  if (!list.length) return null
  return (
    <div className="similar" role="status">
      <b>¿Es esta persona? Ya hay {list.length === 1 ? 'un expediente parecido' : 'expedientes parecidos'}:</b>
      {list.map((p) => (
        <div key={p.id} className="similar__row">
          <span><strong>{fullName(p)}</strong> <span className="muted">{[p.record, p.birthDate && age(p.birthDate), p.phone, p.dni].filter(Boolean).join(' · ')}</span></span>
          <button type="button" className="btn btn--soft btn--sm" onClick={() => onPick(p)}><UserCheck size={14} />{pickLabel}</button>
        </div>
      ))}
    </div>
  )
}

/**
 * El paciente nuevo que se agendó por teléfono llega: se completa su registro con la pantalla de siempre,
 * precargada con lo que se anotó al agendar. Antes se revisa si ya tenía expediente para no duplicarlo.
 * `onDone` recibe el expediente con el que queda la cita.
 */
export function CompleteRegistration({ patient: p, onClose, onDone }: { patient: Patient; onClose: () => void; onDone: (patientId: string) => void }) {
  const { patients, completeRegistration } = useStore()
  const similar = similarPatients(patients, p).filter((x) => x.id !== p.id)
  const [step, setStep] = useState<'check' | 'form'>(similar.length ? 'check' : 'form')
  const [busy, setBusy] = useState(false)

  if (step === 'check') {
    return (
      <Modal title={`Llegó ${fullName(p)}`} onClose={onClose} footer={<>
        <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn--primary" onClick={() => setStep('form')}><UserPlus size={16} />No, es un paciente nuevo</button>
      </>}>
        <p>Se agendó como paciente nuevo. Antes de crear su expediente, revisa que no lo tenga ya:</p>
        <SimilarPatients list={similar} pickLabel="Sí, usar este expediente" onPick={async (x) => {
          if (busy) return
          setBusy(true)
          const r = await completeRegistration(p.id, { mergeInto: x.id })
          setBusy(false)
          if (r) onDone(r.id)
        }} />
      </Modal>
    )
  }
  return (
    <IdentificationForm title={`Completar registro de ${fullName(p)}`} submitLabel="Completar registro" withAllergies initial={{ ...p, birthDate: '' }}
      onClose={onClose} onSave={async (data) => {
        const r = await completeRegistration(p.id, data as Omit<Patient, 'id' | 'record' | 'createdAt'>)
        if (r) onDone(r.id)
      }} />
  )
}
