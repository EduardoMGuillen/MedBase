import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, FileText, Printer } from 'lucide-react'
import { useStore } from '../lib/store'
import { Loading, PageHead } from '../components/ui'
import { age, date, fullName, time } from '../lib/format'
import { CLINIC } from '../lib/seed'
import { LogoMark } from '../components/Logo'

export default function Prescriptions() {
  const { prescriptions, patient, staffById, user } = useStore()
  const [mine, setMine] = useState(user?.role === 'doctor')
  const list = prescriptions
    .filter((r) => !mine || r.doctorId === user?.id)
    .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
  return (
    <div className="page">
      <PageHead title="Recetas" sub={`${list.length} recetas emitidas`}
        actions={user?.role === 'doctor' && (
          <div className="tabs" role="tablist" style={{ border: 0 }}>
            <button className="tab" role="tab" aria-selected={mine} onClick={() => setMine(true)}>Mías</button>
            <button className="tab" role="tab" aria-selected={!mine} onClick={() => setMine(false)}>Toda la clínica</button>
          </div>
        )} />
      <section className="panel">
        {list.length ? <div className="rows">{list.map((r) => {
          const p = patient(r.patientId)!
          return (
            <Link key={r.id} to={`/app/recetas/${r.id}`} className="row" style={{ gridTemplateColumns: '120px 1fr auto' }}>
              <span className="num" style={{ fontSize: 13.5 }}>{date(r.issuedAt)}<br /><span style={{ color: 'var(--muted)' }}>{r.folio}</span></span>
              <div className="row__who"><strong>{fullName(p)}</strong><span>{r.items.map((i) => i.drug).join(', ')}, por {staffById(r.doctorId)?.name}</span></div>
              <FileText size={18} color="var(--faint)" />
            </Link>
          )
        })}</div> : <div className="empty">Las recetas que firmes desde una consulta aparecerán aquí.</div>}
      </section>
    </div>
  )
}

export function PrescriptionSheet() {
  const { id } = useParams()
  const { staffById, fetchPrescription } = useStore()
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchPrescription>> | null>(null)
  const [missing, setMissing] = useState(false)
  useEffect(() => {
    if (id) fetchPrescription(id).then(setData).catch(() => setMissing(true))
  }, [id, fetchPrescription])
  if (missing) return <div className="page"><div className="empty">Esta receta no existe. Vuelve a <Link to="/app/recetas">Recetas</Link>.</div></div>
  if (!data) return <Loading label="Cargando receta" />
  const { prescription: rx, consultation: c, patient: p } = data
  const doc = staffById(rx.doctorId)!

  return (
    <div className="page">
      <div className="page-head no-print">
        <Link className="btn btn--ghost" to={`/app/pacientes/${p.id}`}><ChevronLeft size={16} />Expediente de {p.firstName}</Link>
        <button className="btn btn--primary" onClick={() => window.print()}><Printer size={16} />Imprimir receta</button>
      </div>
      <article className="rx-sheet">
        <header className="rx-sheet__head">
          <div className="rx-sheet__doc">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}><LogoMark size={26} /><b>{CLINIC.name}</b></div>
            <h2>{doc.name}</h2>
            <p>{doc.specialty}, colegiación {doc.license}</p>
            <p>{CLINIC.address}, tel. {CLINIC.phone}</p>
          </div>
          <div className="rx-sheet__folio">Folio<b>{rx.folio}</b>{date(rx.issuedAt)}, {time(rx.issuedAt)}</div>
        </header>
        <div className="rx-sheet__pt">
          <div><span>Paciente</span>{fullName(p)}</div>
          <div><span>Edad</span>{age(p.birthDate)}</div>
          <div><span>Expediente</span>{p.record}</div>
          <div><span>Alergias</span>{p.allergies.join(', ') || 'Ninguna conocida'}</div>
          {c && <div style={{ gridColumn: '1 / -1' }}><span>Diagnóstico</span>{c.diagnoses.map((d) => `${d.label} (${d.code})`).join('; ')}</div>}
        </div>
        <div className="rx-sheet__rx" aria-hidden="true">Rx</div>
        <ol>
          {rx.items.map((it, i) => (
            <li key={i}>
              <strong>{it.drug}</strong> <span style={{ color: 'var(--muted)' }}>{it.presentation}</span>
              <p>{it.dose}, {it.frequency.toLowerCase()}, durante {it.duration}.{it.instructions ? ` ${it.instructions}` : ''}</p>
            </li>
          ))}
        </ol>
        {c?.plan && <p style={{ marginTop: 24, fontSize: 14 }}><b>Indicaciones generales:</b> {c.plan}</p>}
        <div className="rx-sheet__sign"><div><em>{doc.name.replace(/^Dra?\.\s*/, '')}</em>{doc.name}<br /><span style={{ color: 'var(--muted)' }}>{doc.license}</span></div></div>
        <footer className="rx-sheet__foot"><span>Receta válida por 30 días a partir de su emisión.</span><span>Emitida con Clinara</span></footer>
      </article>
    </div>
  )
}
