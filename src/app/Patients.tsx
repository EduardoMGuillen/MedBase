import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, UserPlus } from 'lucide-react'
import { useStore } from '../lib/store'
import { Avatar, Modal, PageHead, Toast } from '../components/ui'
import { age, date, fullName } from '../lib/format'
import type { Patient } from '../lib/types'

const PALETTE = ['#2335C9', '#0F8A6E', '#B4407A', '#C27A12', '#6A4BC4', '#2C7DA0']
export const patientColor = (id: string) => PALETTE[[...id].reduce((s, c) => s + c.charCodeAt(0), 0) % PALETTE.length]

export default function Patients() {
  const { patients, consultations, appointments, can, addPatient } = useStore()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [toast, setToast] = useState('')

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return patients
      .filter((p) => !s || fullName(p).toLowerCase().includes(s) || p.record.toLowerCase().includes(s) || p.phone.includes(s))
      .sort((a, b) => a.lastName.localeCompare(b.lastName))
  }, [patients, q])

  const lastVisit = (id: string) => {
    const c = consultations.filter((x) => x.patientId === id).sort((a, b) => b.date.localeCompare(a.date))[0]
    return c?.date
  }
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

      {adding && <NewPatient onClose={() => setAdding(false)} onSave={(p) => {
        const id = addPatient(p); setAdding(false); setToast('Paciente registrado'); nav(`/app/pacientes/${id}`)
      }} />}
      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </div>
  )
}

function NewPatient({ onClose, onSave }: { onClose: () => void; onSave: (p: Omit<Patient, 'id' | 'record' | 'createdAt'>) => void }) {
  const [f, setF] = useState({ firstName: '', lastName: '', birthDate: '', sex: 'F' as 'F' | 'M', phone: '', email: '', bloodType: '', allergies: '', insurance: '' })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  const valid = f.firstName.trim() && f.lastName.trim() && f.birthDate && f.phone.trim()
  return (
    <Modal title="Registrar paciente" onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!valid} onClick={() => onSave({
        firstName: f.firstName.trim(), lastName: f.lastName.trim(), birthDate: f.birthDate, sex: f.sex, phone: f.phone.trim(),
        email: f.email || undefined, bloodType: f.bloodType || undefined, insurance: f.insurance || undefined,
        allergies: f.allergies.split(',').map((s) => s.trim()).filter(Boolean), conditions: [],
      })}>Registrar paciente</button>
    </>}>
      <div className="form-grid">
        <label className="field"><span>Nombres</span><input className="input" value={f.firstName} onChange={set('firstName')} /></label>
        <label className="field"><span>Apellidos</span><input className="input" value={f.lastName} onChange={set('lastName')} /></label>
        <label className="field"><span>Fecha de nacimiento</span><input className="input" type="date" value={f.birthDate} onChange={set('birthDate')} /></label>
        <label className="field"><span>Sexo</span><select className="select" value={f.sex} onChange={set('sex')}><option value="F">Femenino</option><option value="M">Masculino</option></select></label>
        <label className="field"><span>Teléfono</span><input className="input" inputMode="tel" value={f.phone} onChange={set('phone')} /></label>
        <label className="field"><span>Correo (opcional)</span><input className="input" type="email" value={f.email} onChange={set('email')} /></label>
        <label className="field"><span>Tipo de sangre</span><select className="select" value={f.bloodType} onChange={set('bloodType')}><option value="">Sin dato</option>{['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map((b) => <option key={b}>{b}</option>)}</select></label>
        <label className="field"><span>Aseguradora (opcional)</span><input className="input" value={f.insurance} onChange={set('insurance')} /></label>
        <label className="field span-2"><span>Alergias conocidas, separadas por coma</span><input className="input" value={f.allergies} onChange={set('allergies')} placeholder="Ej. Penicilina, AINEs" /></label>
      </div>
    </Modal>
  )
}
