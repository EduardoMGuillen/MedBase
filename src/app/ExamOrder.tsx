import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, MessageCircle, Printer } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { Loading } from '../components/ui'
import { DocHeader } from '../components/DocHeader'
import { MarkImage } from '../components/MarkImage'
import { age, date, fullName, identityLine, recordNumber, whatsappUrl } from '../lib/format'
import { examLine, GROUP_LABEL } from '../lib/exams'
import { yearsOld } from '../lib/inpatient'
import type { Diagnosis, ExamGroup, ExamOrder } from '../lib/types'

interface Batch { exams: ExamOrder[]; diagnoses: Diagnosis[]; doctor: { id: string; name: string; license?: string; specialty?: string; signatureId?: string; stampId?: string } }

/**
 * EX1: órdenes de exámenes impresas, separadas de la receta. Si hay exámenes de los dos grupos salen dos órdenes: una
 * de laboratorio y otra de imagen y gabinete, porque el paciente las lleva a lugares distintos. Carta, con membrete,
 * datos del paciente, diagnóstico o indicación, los exámenes, firma y sello del médico.
 */
export default function ExamOrderPage() {
  const { batch } = useParams()
  const { patient, settings, notify } = useStore()
  const nav = useNavigate()
  const [data, setData] = useState<Batch | null>(null)
  const [only, setOnly] = useState<ExamGroup | null>(null)
  useEffect(() => { if (batch) api<Batch>(`/exams/batch/${batch}`).then(setData).catch((e: Error) => notify(e.message, 'error')) }, [batch, notify])
  // Imprimir sólo una de las dos órdenes
  useEffect(() => {
    if (!only) return
    const t = setTimeout(() => { window.print(); setOnly(null) }, 100)
    return () => clearTimeout(t)
  }, [only])
  if (!data) return <Loading label="Preparando la orden" />
  const p = patient(data.exams[0].patientId)
  if (!p) return <Loading />
  const groups = (['lab', 'imaging'] as ExamGroup[]).filter((g) => data.exams.some((e) => e.group === g && e.status !== 'cancelled'))
  const minor = p.birthDate ? yearsOld(p.birthDate) < 18 : false
  const text = (g: ExamGroup) => [`${settings.name}. Orden de ${GROUP_LABEL[g].toLowerCase()} del ${date(data.exams[0].orderedAt)}.`, `Paciente: ${fullName(p)}.`, `${data.doctor.name}, colegiación ${data.doctor.license ?? ''}.`, '',
    ...data.exams.filter((e) => e.group === g && e.status !== 'cancelled').map((e, i) => `${i + 1}. ${examLine(e)}${e.priority === 'urgent' ? ' (URGENTE)' : ''}${e.indication ? `. ${e.indication}` : ''}`)].join('\n')
  return (
    <div className={`page${only ? ` print-only-${only}` : ''}`}>
      <div className="page-head no-print">
        <button className="btn btn--ghost" onClick={() => nav(-1)}><ChevronLeft size={16} />Volver</button>
        <div className="page-head__actions">
          {groups.map((g) => <button key={g} className="btn btn--primary" onClick={() => setOnly(g)}><Printer size={16} />Imprimir orden de {GROUP_LABEL[g].toLowerCase()}</button>)}
          {groups.map((g) => p.phone && <a key={`w-${g}`} className="btn btn--ghost" target="_blank" rel="noreferrer" href={whatsappUrl(p.phone, text(g))}><MessageCircle size={16} />{groups.length > 1 ? `WhatsApp: ${GROUP_LABEL[g].toLowerCase()}` : 'Enviar por WhatsApp'}</a>)}
          <Link className="btn btn--ghost" to={`/app/pacientes/${p.id}`}>Expediente</Link>
        </div>
      </div>
      {groups.length > 1 && <p className="muted no-print" style={{ fontSize: 14 }}>Son dos órdenes: el paciente lleva la de laboratorio y la de imagen y gabinete a lugares distintos.</p>}
      {groups.map((g) => {
        const list = data.exams.filter((e) => e.group === g && e.status !== 'cancelled')
        return (
          <article key={g} className={`rx-sheet exam-order exam-order--${g}`}>
            <header className="rx-sheet__head">
              <DocHeader clinic={settings} doctor={data.doctor} />
              <div className="rx-sheet__folio">Orden de<b>{GROUP_LABEL[g].toLowerCase()}</b>{date(list[0].orderedAt)}</div>
            </header>
            <div className="rx-sheet__pt">
              <div style={{ gridColumn: '1 / -1' }}><span>Paciente</span>{fullName(p)}</div>
              <div><span>Identidad</span>{identityLine(p, minor)}</div>
              <div><span>Edad</span>{age(p.birthDate)}</div>
              <div><span>Expediente</span>{recordNumber(p, settings)}</div>
              {data.diagnoses.length > 0 && <div style={{ gridColumn: '1 / -1' }}><span>Diagnóstico</span>{data.diagnoses.map((d) => d.label).join('; ')}</div>}
            </div>
            <h2 className="exam-order__title">{g === 'lab' ? 'Exámenes de laboratorio' : 'Estudios de imagen y gabinete'}</h2>
            <ol className="exam-order__list">{list.map((e) => (
              <li key={e.id}><b>{examLine(e)}</b>{e.priority === 'urgent' && <span className="exam-order__urgent">URGENTE</span>}
                {e.indication && <p>Indicación: {e.indication}</p>}
                {e.place === 'external' && <p className="muted">Se realiza fuera de la clínica.</p>}</li>
            ))}</ol>
            <div className="rx-sheet__sign">
              {data.doctor.stampId && <MarkImage id={data.doctor.stampId} alt="Sello del médico" className="doc-stamp" />}
              <div>{data.doctor.signatureId ? <MarkImage id={data.doctor.signatureId} alt={`Firma de ${data.doctor.name}`} className="doc-signature" /> : <em>&nbsp;</em>}{data.doctor.name}<br /><span style={{ color: 'var(--muted)' }}>{data.doctor.license}</span></div>
            </div>
            <footer className="rx-sheet__foot"><span>Orden de {GROUP_LABEL[g].toLowerCase()}, separada de la receta.</span><span>Emitida con Clinara</span></footer>
          </article>
        )
      })}
    </div>
  )
}
