import { useState } from 'react'
import { Combo, asChange } from '../components/Combo'
import { DateField } from '../components/DateTimeField'
import { AutoTextarea, Modal } from '../components/ui'
import { useStore } from '../lib/store'
import { BACKGROUND_GROUPS, CIVIL_STATUS, toxicOf, dniDigits, dniLength, EDUCATION, formatPhone } from '../lib/format'
import { DniInput } from '../components/DniInput'
import { yearsOld } from '../lib/inpatient'
import type { Background, Patient } from '../lib/types'

type Identification = Pick<Patient, 'firstName' | 'lastName' | 'birthDate' | 'sex' | 'phone' | 'email' | 'dni' | 'civilStatus' | 'occupation' | 'education'
  | 'religion' | 'address' | 'emergencyName' | 'emergencyPhone' | 'emergencyRelation' | 'insurance' | 'guardianName' | 'guardianDni' | 'guardianRelation'>

/** Ficha de identificación: el primer bloque de la historia clínica. */
export function IdentificationForm({ title, submitLabel, initial, withAllergies = false, onClose, onSave, children }: {
  title: string; submitLabel: string; initial?: Partial<Patient>; withAllergies?: boolean
  onClose: () => void; onSave: (p: Partial<Patient>) => Promise<void>
  /** Campos que van antes de la ficha (p. ej. los datos de la estancia en "Editar datos generales"). */
  children?: React.ReactNode
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
  // Los teléfonos se formatean mientras se escriben (0000-0000); la identidad usa su propio campo
  const MASK: Partial<Record<keyof Identification, (v: string) => string>> = { phone: formatPhone, emergencyPhone: formatPhone }
  const set = (k: keyof Identification) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: MASK[k] ? MASK[k](e.target.value) : e.target.value })
  const minor = !!f.birthDate && yearsOld(f.birthDate) < 18
  const valid = f.firstName.trim() && f.lastName.trim() && f.birthDate && f.phone.trim().length >= 7
  const field = (k: keyof Identification, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, cls = '') => (
    <label className={`field ${cls}`}><span>{label}</span><input className="input" value={f[k]} onChange={set(k)} {...props} /></label>
  )
  const dniField = (k: 'dni' | 'guardianDni', label: string) => (
    <label className="field"><span>{label}</span><DniInput value={f[k]} onChange={(v) => setF((x) => ({ ...x, [k]: v }))} /></label>
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
      {children}
      <fieldset className="fs"><legend>Identificación</legend>
        <div className="form-grid">
          {field('firstName', 'Nombres', { autoComplete: 'given-name' })}
          {field('lastName', 'Apellidos', { autoComplete: 'family-name' })}
          {dniField('dni', minor ? 'Número de identidad (si ya tiene)' : 'Número de identidad')}
          {field('birthDate', 'Fecha de nacimiento', { type: 'date' })}
          <label className="field"><span>Sexo</span><Combo value={f.sex} onChange={(v) => set('sex')(asChange(v))} options={[{ value: 'F', label: 'Femenino' }, { value: 'M', label: 'Masculino' }]} /></label>
          <label className="field"><span>Estado civil</span><Combo value={f.civilStatus} onChange={(v) => set('civilStatus')(asChange(v))} options={[{ value: '', label: 'Sin dato' }, ...[...new Set([...CIVIL_STATUS, f.civilStatus].filter(Boolean))].map((x) => ({ value: x, label: x }))]} /></label>
          {field('occupation', 'Ocupación')}
          <label className="field"><span>Escolaridad</span><Combo value={f.education} onChange={(v) => set('education')(asChange(v))} options={[{ value: '', label: 'Sin dato' }, ...[...new Set([...EDUCATION, f.education].filter(Boolean))].map((x) => ({ value: x, label: x }))]} /></label>
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
          <p className="c-muted fs-md">La receta y las constancias llevarán los datos del padre, la madre o el responsable.</p>
          <div className="form-grid">
            {field('guardianName', 'Nombre del responsable')}
            {field('guardianRelation', 'Parentesco', { placeholder: 'Ej. Madre' })}
            {dniField('guardianDni', 'Identidad del responsable')}
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


/**
 * La receta lleva la identidad del paciente. Sólo se pide si el expediente realmente no la tiene y el
 * paciente es adulto; al guardarla queda en el expediente y no se vuelve a pedir.
 */
export function IdentityPrompt({ p }: { p: Patient }) {
  const { updatePatient, settings } = useStore()
  const [dni, setDni] = useState('')
  if (p.dni || !p.birthDate || yearsOld(p.birthDate) < 18) return null
  // Completa con la máscara de la clínica; sin máscara basta con algo escrito
  const validDni = (v: string) => (settings.dniMask === '' ? v.trim().length >= 6 : dniDigits(v).length === dniLength(settings.dniMask))
  return (
    <form className="dni-ask" onSubmit={async (e) => { e.preventDefault(); if (validDni(dni)) await updatePatient(p.id, { dni }) }}>
      <label className="field"><span>{p.firstName} no tiene número de identidad en su expediente y la receta lo lleva. Se guarda en el expediente y no se vuelve a pedir.</span>
        <DniInput value={dni} onChange={setDni} optional={false} /></label>
      <button className="btn btn--soft" disabled={!validDni(dni)}>Guardar identidad</button>
    </form>
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
      <label className="field"><span>Tipo de sangre</span><Combo value={blood} onChange={setBlood} options={[{ value: '', label: 'Sin dato' }, 'O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-']} /></label>
    </Modal>
  )
}

/** Antecedentes en el orden de la historia clínica. */
export function BackgroundForm({ initial, onClose, onSave }: { initial: Patient; onClose: () => void; onSave: (p: Partial<Patient>) => Promise<void> }) {
  // AN2 (ronda 12): Toxicomanías empieza con lo que había en tabaquismo, alcoholismo y otras sustancias
  const [b, setB] = useState<Background>(() => ({ ...(initial.background ?? {}), toxic: toxicOf(initial.background ?? {}) || undefined }))
  const [busy, setBusy] = useState(false)
  return (
    <Modal title="Antecedentes" onClose={onClose} wide footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={busy} onClick={async () => {
        setBusy(true)
        // Toxicomanías ya reúne los tres campos de antes: se quitan para no mostrar dos veces lo mismo
        const { smoking: _s, alcohol: _a, drugs: _d, ...rest } = b
        void _s; void _a; void _d
        const clean = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, (v ?? '').trim()]).filter(([, v]) => v))
        await onSave({ background: clean as Background })
        setBusy(false)
      }}>Guardar antecedentes</button>
    </>}>
      <p className="fs-md c-muted">Escribe <i>Negados</i> cuando el paciente no tenga antecedentes de ese tipo; así queda constancia de que se interrogó.</p>
      {BACKGROUND_GROUPS.filter((g) => !g.female || initial.sex === 'F').map((g) => (
        <fieldset key={g.title} className="fs"><legend>{g.title}</legend>
          {/* AP4 (ronda 13): un apartado de tres campos (hospitalarios, traumáticos y quirúrgicos) va uno debajo del otro a todo el
              ancho; los de dos, lado a lado y alineados arriba. Todos empiezan del mismo alto y crecen solos, sin barra interna. */}
          <div className="form-grid bg-form">
            {g.fields.map((fl) => (
              <label key={fl.key} className={`field ${g.fields.length === 1 || g.fields.length === 3 ? 'span-2' : ''}`}><span>{fl.label}</span>
                {fl.date
                  ? <DateField value={b[fl.key] ?? ''} onChange={(v) => setB({ ...b, [fl.key]: v })} label={fl.label} />
                  : <AutoTextarea rows={3} value={b[fl.key] ?? ''} placeholder={fl.hint} onChange={(e) => setB({ ...b, [fl.key]: e.target.value })} />}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </Modal>
  )
}
