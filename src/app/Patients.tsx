import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, UserPlus } from 'lucide-react'
import { useStore } from '../lib/store'
import { Avatar, Modal, PageHead } from '../components/ui'
import { age, date, fullName } from '../lib/format'
import type { Patient } from '../lib/types'

const PALETTE = ['#2335C9', '#0F8A6E', '#B4407A', '#C27A12', '#6A4BC4', '#2C7DA0']
export const patientColor = (id: string) => PALETTE[[...id].reduce((s, c) => s + c.charCodeAt(0), 0) % PALETTE.length]

export default function Patients() {
  const { patients, appointments, can, addPatient } = useStore()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return patients
      .filter((p) => !s || fullName(p).toLowerCase().includes(s) || p.record.toLowerCase().includes(s) || p.phone.includes(s))
      .sort((a, b) => a.lastName.localeCompare(b.lastName))
  }, [patients, q])

  const lastVisit = (id: string) => appointments
    .filter((a) => a.patientId === id && a.status === 'done')
    .sort((a, b) => b.start.localeCompare(a.start))[0]?.start
  const nextAppt = (id: string) => appointments
    .filter((a) => a.patientId === id && new Date(a.start) > new Date() && ['scheduled', 'confirmed'].includes(a.status))
    .sort((a, b) => a.start.localeCompare(b.start))[0]

  return (
    <div className="page">
      <PageHead title="Pacientes" sub={`${patients.length} expedientes en la clínica`}
        actions={can('patients.manage') && <button className="btn btn--primary" onClick={() => setAdding(true)}><UserPlus size={17} />Registrar paciente</button>} />

      <label className="suggest" style={{ maxWidth: 420 }}>
        <Search size={17} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--faint)' }} />
        <input className="input" style={{ paddingLeft: 38 }} placeholder="Buscar por nombre, expediente o teléfono" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar pacientes" />
      </label>

      <section className="panel table-wrap">
        <table className="table">
          <thead><tr><th>Paciente</th><th>Edad</th><th>Teléfono</th>{can('chart.view') && <th>Alergias</th>}<th>Última consulta</th><th>Próxima cita</th></tr></thead>
          <tbody>
            {list.map((p) => {
              const nx = nextAppt(p.id)
              const lv = lastVisit(p.id)
              return (
                <tr key={p.id}>
                  <td>
                    <div className="cell-person">
                      <Avatar name={fullName(p)} color={patientColor(p.id)} />
                      <Link to={`/app/pacientes/${p.id}`}>{fullName(p)}<small>{p.record}</small></Link>
                    </div>
                  </td>
                  <td className="num">{age(p.birthDate)}</td>
                  <td className="num">{p.phone}</td>
                  {can('chart.view') && <td>{p.allergies.length ? <div className="chips">{p.allergies.map((a) => <span key={a} className="chip chip--red">{a}</span>)}</div> : <span style={{ color: 'var(--faint)' }}>Ninguna conocida</span>}</td>}
                  <td>{lv ? date(lv) : <span style={{ color: 'var(--faint)' }}>Sin consultas</span>}</td>
                  <td>{nx ? date(nx.start, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : <span style={{ color: 'var(--faint)' }}>Sin agendar</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!list.length && <div className="empty">Ningún paciente coincide con “{q}”. Revisa la ortografía o registra al paciente.</div>}
      </section>

      {adding && <PatientForm title="Registrar paciente" submitLabel="Registrar paciente" onClose={() => setAdding(false)} onSave={async (p) => {
        const r = await addPatient(p)
        if (r) { setAdding(false); nav(`/app/pacientes/${r.id}`) }
      }} />}
    </div>
  )
}

export function PatientForm({ title, submitLabel, initial, clinicalOnly, demographicOnly, onClose, onSave }: {
  title: string; submitLabel: string; initial?: Patient; clinicalOnly?: boolean; demographicOnly?: boolean
  onClose: () => void; onSave: (p: Omit<Patient, 'id' | 'record' | 'createdAt'>) => Promise<void>
}) {
  const [f, setF] = useState({
    firstName: initial?.firstName ?? '', lastName: initial?.lastName ?? '', birthDate: initial?.birthDate ?? '', sex: (initial?.sex ?? 'F') as 'F' | 'M',
    phone: initial?.phone ?? '', email: initial?.email ?? '', bloodType: initial?.bloodType ?? '', insurance: initial?.insurance ?? '',
    allergies: initial?.allergies.join(', ') ?? '', conditions: initial?.conditions.join(', ') ?? '',
  })
  const [busy, setBusy] = useState(false)
  const list = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  const valid = clinicalOnly || (f.firstName.trim() && f.lastName.trim() && f.birthDate && f.phone.trim().length >= 7)
  const showDemo = !clinicalOnly
  const showClinical = !demographicOnly
  return (
    <Modal title={title} onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!valid || busy} onClick={async () => {
        setBusy(true)
        const demo = { firstName: f.firstName.trim(), lastName: f.lastName.trim(), birthDate: f.birthDate, sex: f.sex, phone: f.phone.trim(), email: f.email || undefined, insurance: f.insurance || undefined }
        const clinical = { bloodType: f.bloodType || undefined, allergies: list(f.allergies), conditions: list(f.conditions) }
        await onSave((clinicalOnly ? clinical : demographicOnly ? demo : { ...demo, ...clinical }) as Omit<Patient, 'id' | 'record' | 'createdAt'>)
        setBusy(false)
      }}>{submitLabel}</button>
    </>}>
      <div className="form-grid">
        {showDemo && <>
        <label className="field"><span>Nombres</span><input className="input" value={f.firstName} onChange={set('firstName')} /></label>
        <label className="field"><span>Apellidos</span><input className="input" value={f.lastName} onChange={set('lastName')} /></label>
        <label className="field"><span>Fecha de nacimiento</span><input className="input" type="date" value={f.birthDate} onChange={set('birthDate')} /></label>
        <label className="field"><span>Sexo</span><select className="select" value={f.sex} onChange={set('sex')}><option value="F">Femenino</option><option value="M">Masculino</option></select></label>
        <label className="field"><span>Teléfono</span><input className="input" inputMode="tel" value={f.phone} onChange={set('phone')} /></label>
        <label className="field"><span>Correo (opcional)</span><input className="input" type="email" value={f.email} onChange={set('email')} /></label>
        <label className="field span-2"><span>Aseguradora (opcional)</span><input className="input" value={f.insurance} onChange={set('insurance')} /></label>
        </>}
        {showClinical && <>
        <label className="field"><span>Tipo de sangre</span><select className="select" value={f.bloodType} onChange={set('bloodType')}><option value="">Sin dato</option>{['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map((b) => <option key={b}>{b}</option>)}</select></label>
        <div />
        <label className="field span-2"><span>Alergias conocidas, separadas por coma</span><input className="input" value={f.allergies} onChange={set('allergies')} placeholder="Ej. Penicilina, AINEs" /></label>
        <label className="field span-2"><span>Problemas activos, separados por coma</span><input className="input" value={f.conditions} onChange={set('conditions')} placeholder="Ej. Hipertensión arterial, Asma" /></label>
        </>}
      </div>
    </Modal>
  )
}
