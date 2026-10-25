import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, FileBadge, Printer } from 'lucide-react'
import { useStore } from '../lib/store'
import { Loading } from '../components/ui'
import { LogoMark } from '../components/Logo'
import { date, fullName, time } from '../lib/format'
import { BackgroundView, ConsultationBody, Identification } from './PatientChart'

/** Nota de consulta imprimible con el orden de la historia clínica. */
export default function ConsultNote() {
  const { id } = useParams()
  const { fetchConsultation, staffById, settings, notify, can } = useStore()
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchConsultation>> | null>(null)
  useEffect(() => { if (id) fetchConsultation(id).then(setData).catch((e: Error) => notify(e.message, 'error')) }, [id, fetchConsultation, notify])
  if (!data) return <Loading label="Preparando la nota" />
  const { consultation: c, patient: p, vitals } = data
  const doc = staffById(c.doctorId)!

  return (
    <div className="page">
      <div className="page-head no-print">
        <Link className="btn btn--ghost" to={`/app/pacientes/${p.id}`}><ChevronLeft size={16} />Expediente de {p.firstName}</Link>
        <div className="page-head__actions">
          {can('consult.write') && <Link className="btn btn--ghost" to={`/app/constancia/${c.id}`}><FileBadge size={16} />Generar constancia</Link>}
          <button className="btn btn--primary" onClick={() => window.print()}><Printer size={16} />Imprimir nota</button>
        </div>
      </div>
      <article className="rx-sheet clinical-note">
        <header className="rx-sheet__head">
          <div className="rx-sheet__doc">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}><LogoMark size={24} /><b>{settings.name}</b></div>
            <p>{settings.address}, tel. {settings.phone}</p>
          </div>
          <div className="rx-sheet__folio">Nota de consulta<b>{fullName(p)}</b>Exp. {p.record}</div>
        </header>
        <p className="cn__when">{date(c.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, {time(c.date)}. Atendió {doc.name}, {doc.specialty?.toLowerCase()}, colegiación {doc.license}.</p>

        <h3 className="cn__h">I. Ficha de identificación</h3>
        <Identification p={p} />
        <h3 className="cn__h">II. Alergias</h3>
        <p>{p.allergies.length ? p.allergies.join(', ') : 'Sin alergias conocidas.'} Tipo de sangre: {p.bloodType ?? 'sin dato'}.</p>
        <h3 className="cn__h">III. Antecedentes</h3>
        <BackgroundView p={p} compact />
        <h3 className="cn__h">IV. Consulta</h3>
        <ConsultationBody c={c} vitals={vitals} />

        <div className="rx-sheet__sign"><div><em>{doc.name.replace(/^Dra?\.\s*/, '')}</em>{doc.name}<br /><span style={{ color: 'var(--muted)' }}>{doc.license}</span></div></div>
        <footer className="rx-sheet__foot"><span>Documento del expediente clínico. Confidencial.</span><span>Emitido con Clinara</span></footer>
      </article>
    </div>
  )
}
