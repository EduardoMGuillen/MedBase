import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, Printer } from 'lucide-react'
import { useStore } from '../lib/store'
import { Loading } from '../components/ui'
import { LogoMark } from '../components/Logo'
import { age, date, fullName } from '../lib/format'

/** Constancia médica de atención, con reposo opcional. Se arma al momento y no se guarda. */
export default function Certificate() {
  const { id } = useParams()
  const { fetchConsultation, staffById, settings, notify } = useStore()
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchConsultation>> | null>(null)
  const [rest, setRest] = useState(0)
  const [showDx, setShowDx] = useState(true)
  const [to, setTo] = useState('A quien corresponda')
  const [notes, setNotes] = useState('')

  useEffect(() => { if (id) fetchConsultation(id, 'certificate').then(setData).catch((e: Error) => notify(e.message, 'error')) }, [id, fetchConsultation, notify])
  if (!data) return <Loading label="Preparando constancia" />
  const { consultation: c, patient: p } = data
  const doc = staffById(c.doctorId)!
  const female = doc.name.startsWith('Dra')
  const start = new Date(c.date)
  const end = new Date(start); end.setDate(end.getDate() + Math.max(0, rest - 1))
  const long = (d: Date) => d.toLocaleDateString('es-HN', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="page">
      <div className="page-head no-print">
        <Link className="btn btn--ghost" to={`/app/pacientes/${p.id}`}><ChevronLeft size={16} />Expediente de {p.firstName}</Link>
        <button className="btn btn--primary" onClick={() => window.print()}><Printer size={16} />Imprimir constancia</button>
      </div>
      <section className="panel panel__body no-print form-grid form-grid--4">
        <label className="field span-2"><span>Dirigida a</span><input className="input" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="field"><span>Días de reposo</span><input className="input num" type="number" min={0} max={60} value={rest} onChange={(e) => setRest(Math.max(0, Number(e.target.value) || 0))} /></label>
        <label className="field" style={{ alignContent: 'end' }}><span>Diagnóstico</span>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', height: 42 }}><input type="checkbox" checked={showDx} onChange={(e) => setShowDx(e.target.checked)} />Incluirlo</label>
        </label>
        <label className="field span-all"><span>Indicaciones adicionales (opcional)</span><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. Puede reincorporarse a sus labores con restricción de esfuerzo físico" /></label>
      </section>

      <article className="rx-sheet cert">
        <header className="rx-sheet__head">
          <div className="rx-sheet__doc">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}><LogoMark size={26} /><b>{settings.name}</b></div>
            <h2>{doc.name}</h2>
            <p>{doc.specialty}, colegiación {doc.license}</p>
            <p>{settings.address}, tel. {settings.phone}</p>
          </div>
          <div className="rx-sheet__folio">Fecha<b>{date(new Date().toISOString())}</b></div>
        </header>
        <h1 className="cert__title">Constancia médica</h1>
        <p className="cert__to">{to}:</p>
        <p className="cert__body">
          {female ? 'La suscrita' : 'El suscrito'}, {doc.name}, {doc.specialty?.toLowerCase()}, hace constar que {p.sex === 'F' ? 'la paciente' : 'el paciente'} <b>{fullName(p)}</b>,
          de {age(p.birthDate)}, con expediente {p.record}, fue {p.sex === 'F' ? 'atendida' : 'atendido'} en esta clínica el día {long(start)}
          {showDx && c.diagnoses.length > 0 ? <> con diagnóstico de <b>{c.diagnoses.map((d) => `${d.label.toLowerCase()} (${d.code})`).join(' y ')}</b></> : null}.
        </p>
        {rest > 0 && (
          <p className="cert__body">
            Se indica reposo por <b>{rest} {rest === 1 ? 'día' : 'días'}</b>, del {long(start)}{rest > 1 ? <> al {long(end)}</> : null}.
          </p>
        )}
        {notes.trim() && <p className="cert__body">{notes.trim()}.</p>}
        <p className="cert__body">Se extiende la presente a solicitud {p.sex === 'F' ? 'de la interesada' : 'del interesado'} para los fines que estime convenientes.</p>
        <div className="rx-sheet__sign"><div><em>{doc.name.replace(/^Dra?\.\s*/, '')}</em>{doc.name}<br /><span style={{ color: 'var(--muted)' }}>{doc.license}</span></div></div>
        <footer className="rx-sheet__foot"><span>{settings.name}</span><span>Emitida con Clinara</span></footer>
      </article>
    </div>
  )
}
