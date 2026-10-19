import { Link } from 'react-router-dom'
import { TriangleAlert } from 'lucide-react'
import { Avatar } from './ui'
import { age, fullName } from '../lib/format'
import { patientColor } from '../app/Patients'
import type { Patient } from '../lib/types'

/**
 * Datos generales del paciente, fijos en la parte superior mientras se desplaza la pantalla,
 * para que el médico sepa siempre a quién le está escribiendo.
 */
export function PatientHeader({ p, clinical, link = false, children }: { p: Patient; clinical: boolean; link?: boolean; children?: React.ReactNode }) {
  const name = <h1 className="ph__name">{fullName(p)}</h1>
  return (
    <header className="ph" aria-label="Datos generales del paciente">
      <div className="ph__main">
        <Avatar name={fullName(p)} color={patientColor(p.id)} />
        <div className="ph__id">
          {link ? <Link to={`/app/pacientes/${p.id}`} style={{ textDecoration: 'none' }}>{name}</Link> : name}
          <div className="ph__meta">
            <span><b>{age(p.birthDate)}</b>, {p.sex === 'F' ? 'femenino' : 'masculino'}</span>
            <span>Exp. <b>{p.record}</b></span>
            {p.dni && <span>ID <b>{p.dni}</b></span>}
            {clinical && p.bloodType && <span>Sangre <b>{p.bloodType}</b></span>}
            {p.insurance && <span>{p.insurance}</span>}
          </div>
        </div>
        {children && <div className="ph__actions">{children}</div>}
      </div>
      {clinical && (
        <div className="ph__clinical">
          {p.allergies.length
            ? <span className="ph__allergy"><TriangleAlert size={14} />Alergias: {p.allergies.join(', ')}</span>
            : <span className="ph__ok">Sin alergias conocidas</span>}
          {p.conditions.map((c) => <span key={c} className="chip">{c}</span>)}
        </div>
      )}
    </header>
  )
}
