import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, UserPlus } from 'lucide-react'
import { useStore } from '../lib/store'
import { Avatar, PageHead } from '../components/ui'
import { IdentificationForm } from './PatientForms'
import { age, date, fullName } from '../lib/format'
import type { Patient } from '../lib/types'

const PALETTE = ['#2335C9', '#0F8A6E', '#B4407A', '#C27A12', '#6A4BC4', '#2C7DA0']
export const patientColor = (id: string) => PALETTE[[...id].reduce((s, c) => s + c.charCodeAt(0), 0) % PALETTE.length]

type SortKey = 'name' | 'age' | 'last' | 'next'

export default function Patients() {
  const { patients, appointments, discharges = [], can, addPatient } = useStore()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 })

  const lastVisit = (id: string) => appointments
    .filter((a) => a.patientId === id && a.status === 'done')
    .sort((a, b) => b.start.localeCompare(a.start))[0]?.start
  const dischargeOf = (id: string) => discharges.find((d) => d.patientId === id)?.at
  const nextAppt = (id: string) => appointments
    .filter((a) => a.patientId === id && new Date(a.start) > new Date() && ['scheduled', 'confirmed'].includes(a.status))
    .sort((a, b) => a.start.localeCompare(b.start))[0]
  const lastStamp = (id: string) => [lastVisit(id), dischargeOf(id)].filter(Boolean).sort().at(-1) ?? ''

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    const filtered = patients.filter((p) => !s || fullName(p).toLowerCase().includes(s) || p.record.toLowerCase().includes(s) || p.phone.includes(s))
    const cmp = (a: Patient, b: Patient) => {
      if (sort.key === 'name') return fullName(a).localeCompare(fullName(b), 'es') * sort.dir
      if (sort.key === 'age') return a.birthDate.localeCompare(b.birthDate) * -sort.dir
      const emptyLast = (av: string, bv: string) => {
        if (!av && !bv) return 0
        if (!av) return 1
        if (!bv) return -1
        return av.localeCompare(bv) * sort.dir
      }
      if (sort.key === 'last') return emptyLast(lastStamp(a.id), lastStamp(b.id))
      return emptyLast(nextAppt(a.id)?.start ?? '', nextAppt(b.id)?.start ?? '')
    }
    return [...filtered].sort(cmp)
  }, [patients, q, sort, appointments, discharges])

  const toggle = (key: SortKey) => setSort((s) => s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: 1 })
  const mark = (key: SortKey) => sort.key === key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''

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
          <thead><tr>
            <th><button className="th-sort" onClick={() => toggle('name')}>Paciente{mark('name')}</button></th>
            <th><button className="th-sort" onClick={() => toggle('age')}>Edad{mark('age')}</button></th>
            <th>Teléfono</th>
            <th><button className="th-sort" onClick={() => toggle('last')}>Última consulta{mark('last')}</button></th>
            <th><button className="th-sort" onClick={() => toggle('next')}>Próxima cita{mark('next')}</button></th>
          </tr></thead>
          <tbody>
            {list.map((p) => {
              const nx = nextAppt(p.id)
              const lv = lastVisit(p.id)
              const eg = dischargeOf(p.id)
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
                  <td>
                    {lv && <div>Consulta {date(lv)}</div>}
                    {eg && <div>Egreso {date(eg)}</div>}
                    {!lv && !eg && <span style={{ color: 'var(--faint)' }}>Sin consultas</span>}
                  </td>
                  <td>{nx ? date(nx.start, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : <span style={{ color: 'var(--faint)' }}>Sin agendar</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!list.length && <div className="empty">Ningún paciente coincide con “{q}”. Revisa la ortografía o registra al paciente.</div>}
      </section>

      {adding && <IdentificationForm title="Registrar paciente" submitLabel="Registrar paciente" withAllergies onClose={() => setAdding(false)} onSave={async (p) => {
        const r = await addPatient(p as Omit<Patient, 'id' | 'record' | 'createdAt'>)
        if (r) { setAdding(false); nav(`/app/pacientes/${r.id}`) }
      }} />}
    </div>
  )
}
