import { useState } from 'react'
import { Modal } from '../components/ui'
import { BACKGROUND_GROUPS, CIVIL_STATUS, EDUCATION, formatDni, formatPhone } from '../lib/format'
import { yearsOld } from '../lib/inpatient'
import type { Background, Patient } from '../lib/types'

type Identification = Pick<Patient, 'firstName' | 'lastName' | 'birthDate' | 'sex' | 'phone' | 'email' | 'dni' | 'civilStatus' | 'occupation' | 'education'
  | 'religion' | 'address' | 'emergencyName' | 'emergencyPhone' | 'emergencyRelation' | 'insurance' | 'guardianName' | 'guardianDni' | 'guardianRelation'>

/** Ficha de identificación: el primer bloque de la historia clínica. */
export function IdentificationForm({ title, submitLabel, initial, withAllergies = false, onClose, onSave }: {
  title: string; submitLabel: string; initial?: Partial<Patient>; withAllergies?: boolean
  onClose: () => void; onSave: (p: Partial<Patient>) => Promise<void>
}) {
  const [f, setF] = useState<Record<keyof Identification, string>>({
    firstName: initial?.firstName ?? '', lastName: initial?.lastName ?? '', birthDate: initial?.birthDate ?? '', sex: initial?.sex ?? 'F',
    phone: initial?.phone ?? '', email: initial?.email ?? '', dni: initial?.dni ?? '', civilStatus: initial?.civilStatus ?? '', occupation: initial?.occupation ?? '',
    education: initial?.education ?? '', religion: initial?.religion ?? '', address: initial?.address ?? '', emergencyName: initial?.emergencyName ?? '',
    emergencyPhone: initial?.emergencyPhone ?? '', emergencyRelation: initial?.emergencyRelation ?? '', insurance: initial?.insurance ?? '',
    guardianName: initial?.guardianName ?? '', guardianDni: initial?.guardianDni ?? '', guardianRelation: initial?.guardianRelation ?? '',
  })
  const [allergies, setAllergies] = useState('')
  const [busy, setBusy] = useState(false)
  // La identidad y los teléfonos se formatean mientras se escriben: 0000-0000-00000 y 0000-0000
  const MASK: Partial<Record<keyof Identification, (v: string) => string>> = { dni: formatDni, guardianDni: formatDni, phone: formatPhone, emergencyPhone: formatPhone }
  const set = (k: keyof Identification) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: MASK[k] ? MASK[k](e.target.value) : e.target.value })
  const minor = !!f.birthDate && yearsOld(f.birthDate) < 18
  const valid = f.firstName.trim() && f.lastName.trim() && f.birthDate && f.phone.trim().length >= 7
  const field = (k: keyof Identification, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, cls = '') => (
    <label className={`field ${cls}`}><span>{label}</span><input className="input" value={f[k]} onChange={set(k)} {...props} /></label>
  )
  return (
    <Modal title={title} onClose={onClose} wide footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!valid || busy} onClick={async () => {
        setBusy(true)
        const data = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])) as Partial<Patient>
        if (withAllergies) data.allergies = allergies.split(',').map((x) => x.trim()).filter(Boolean)
        await onSave(data)
        setBusy(false)
      }}>{submitLabel}</button>
    </>}>
      <fieldset className="fs"><legend>Identificación</legend>
        <div className="form-grid">
          {field('firstName', 'Nombres', { autoComplete: 'given-name' })}
          {field('lastName', 'Apellidos', { autoComplete: 'family-name' })}
          {field('dni', minor ? 'Número de identidad (si ya tiene)' : 'Número de identidad', { placeholder: '0000-0000-00000', inputMode: 'numeric' })}
          {field('birthDate', 'Fecha de nacimiento', { type: 'date' })}
          <label className="field"><span>Sexo</span><select className="select" value={f.sex} onChange={set('sex')}><option value="F">Femenino</option><option value="M">Masculino</option></select></label>
          <label className="field"><span>Estado civil</span><select className="select" value={f.civilStatus} onChange={set('civilStatus')}>
            <option value="">Sin dato</option>{[...new Set([...CIVIL_STATUS, f.civilStatus].filter(Boolean))].map((x) => <option key={x}>{x}</option>)}</select></label>
          {field('occupation', 'Ocupación')}
          <label className="field"><span>Escolaridad</span><select className="select" value={f.education} onChange={set('education')}>
            <option value="">Sin dato</option>{[...new Set([...EDUCATION, f.education].filter(Boolean))].map((x) => <option key={x}>{x}</option>)}</select></label>
          {field('religion', 'Religión (opcional)')}
          {field('insurance', 'Aseguradora (opcional)')}
          {field('address', 'Procedencia y dirección', {}, 'span-2')}
        </div>
      </fieldset>
      <fieldset className="fs"><legend>Contacto</legend>
        <div className="form-grid">
          {field('phone', 'Teléfono', { inputMode: 'tel', autoComplete: 'tel', placeholder: '0000-0000' })}
          {field('email', 'Correo (opcional)', { type: 'email', autoComplete: 'email' })}
          {field('emergencyName', 'Contacto de emergencia')}
          {field('emergencyRelation', 'Parentesco')}
          {field('emergencyPhone', 'Teléfono de emergencia', { inputMode: 'tel', placeholder: '0000-0000' })}
        </div>
      </fieldset>
      {minor && !f.dni && (
        <fieldset className="fs"><legend>Menor sin identidad: responsable</legend>
          <p className="muted" style={{ fontSize: 13.5 }}>La receta y las constancias llevarán los datos del padre, la madre o el responsable.</p>
          <div className="form-grid">
            {field('guardianName', 'Nombre del responsable')}
            {field('guardianRelation', 'Parentesco', { placeholder: 'Ej. Madre' })}
            {field('guardianDni', 'Identidad del responsable', { placeholder: '0000-0000-00000', inputMode: 'numeric' })}
          </div>
        </fieldset>
      )}
      {withAllergies && (
        <label className="field"><span>Alergias conocidas, separadas por coma</span>
          <input className="input" value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="Ej. Penicilina, AINEs" /></label>
      )}
    </Modal>
  )
}

/** Alergias, enfermedades crónicas y tipo de sangre. */
export function AllergiesForm({ initial, onClose, onSave }: { initial: Patient; onClose: () => void; onSave: (p: Partial<Patient>) => Promise<void> }) {
  const [allergies, setAllergies] = useState(initial.allergies.join(', '))
  const [conditions, setConditions] = useState(initial.conditions.join(', '))
  const [blood, setBlood] = useState(initial.bloodType ?? '')
  const [busy, setBusy] = useState(false)
  const list = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean)
  return (
    <Modal title="Alergias y enfermedades crónicas" onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={busy} onClick={async () => {
        setBusy(true); await onSave({ allergies: list(allergies), conditions: list(conditions), bloodType: blood || undefined }); setBusy(false)
      }}>Guardar cambios</button>
    </>}>
      <label className="field"><span>Alergias, separadas por coma. Déjalo vacío si no tiene.</span><input className="input" value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="Ej. Penicilina, AINEs" /></label>
      <label className="field"><span>Enfermedades crónicas, separadas por coma</span><input className="input" value={conditions} onChange={(e) => setConditions(e.target.value)} placeholder="Ej. Hipertensión arterial, Diabetes tipo 2" /></label>
      <label className="field"><span>Tipo de sangre</span><select className="select" value={blood} onChange={(e) => setBlood(e.target.value)}>
        <option value="">Sin dato</option>{['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map((b) => <option key={b}>{b}</option>)}</select></label>
    </Modal>
  )
}

/** Antecedentes en el orden de la historia clínica. */
export function BackgroundForm({ initial, onClose, onSave }: { initial: Patient; onClose: () => void; onSave: (p: Partial<Patient>) => Promise<void> }) {
  const [b, setB] = useState<Background>(initial.background ?? {})
  const [busy, setBusy] = useState(false)
  return (
    <Modal title="Antecedentes" onClose={onClose} wide footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={busy} onClick={async () => {
        setBusy(true)
        const clean = Object.fromEntries(Object.entries(b).map(([k, v]) => [k, (v ?? '').trim()]).filter(([, v]) => v))
        await onSave({ background: clean as Background })
        setBusy(false)
      }}>Guardar antecedentes</button>
    </>}>
      <p style={{ fontSize: 13.5, color: 'var(--muted)' }}>Escribe <i>Negados</i> cuando el paciente no tenga antecedentes de ese tipo; así queda constancia de que se interrogó.</p>
      {BACKGROUND_GROUPS.filter((g) => !g.female || initial.sex === 'F').map((g) => (
        <fieldset key={g.title} className="fs"><legend>{g.title}</legend>
          <div className="form-grid">
            {g.fields.map((fl) => (
              <label key={fl.key} className={`field ${g.fields.length === 1 ? 'span-2' : ''}`}><span>{fl.label}</span>
                {fl.date
                  ? <input className="input" type="date" value={b[fl.key] ?? ''} onChange={(e) => setB({ ...b, [fl.key]: e.target.value })} />
                  : <textarea className="textarea textarea--sm" rows={2} value={b[fl.key] ?? ''} onChange={(e) => setB({ ...b, [fl.key]: e.target.value })} />}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </Modal>
  )
}
