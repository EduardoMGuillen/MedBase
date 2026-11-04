import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Download, Printer } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { Loading } from '../components/ui'
import { DocHeader } from '../components/DocHeader'
import { MarkImage } from '../components/MarkImage'
import { age, dmyTime, fullName, identityLine, recordNumber } from '../lib/format'
import { medLabel, yearsOld } from '../lib/inpatient'
import { SIGN_AND_STAMP_LEGEND } from '../lib/clinicalConfig'
import { ExamOrderSheet } from './ExamOrder'
import type { ExamGroup, ExamOrder, InpatientMed, Patient } from '../lib/types'

type Doctor = { id: string; name: string; license?: string; specialty?: string; signatureId?: string; stampId?: string }
interface Job {
  id: string; kind: 'exams' | 'rx'; patientId: string; hospitalizationId?: string; createdBy: string; createdAt: string
  exams: ExamOrder[]; meds: InpatientMed[]; doctors: { doctor: Doctor; items: string[] }[]; printed: { how: string; by: string; at: string }[]
  /** ME12 (ronda 11): días y cantidad a comprar de cada medicamento, solo para esta receta. */
  extras?: Record<string, { days?: number; quantity?: string }>
}

/**
 * EX5 y ME10 (ronda 10): lo que se imprime desde la pestaña Exámenes («Imprimir orden» de los pendientes) y desde la hoja o la
 * nota («Receta» de lo que no hay en la clínica). Un documento por médico que indicó, con sus datos (nunca los de quien
 * imprime), espacio para firma y sello y la leyenda. Cada impresión o descarga queda registrada (GE4, bitácora).
 */
export default function PrintJobPage() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const { patient, staffById, notify } = useStore()
  const nav = useNavigate()
  const [job, setJob] = useState<Job | null>(null)
  const [how, setHow] = useState<'print' | 'pdf' | null>(null)
  useEffect(() => { if (id) api<Job>(`/print-jobs/${id}`).then(setJob).catch((e: Error) => notify(e.message, 'error')) }, [id, notify])
  useEffect(() => {
    if (!how || !id) return
    void api(`/print-jobs/${id}/printed`, { body: { how } }).then(() => api<Job>(`/print-jobs/${id}`).then(setJob)).catch(() => { /* la impresión no depende del registro */ })
    if (how === 'pdf') notify('En la ventana de impresión elige «Guardar como PDF».')
    const t = setTimeout(() => { window.print(); setHow(null) }, 150)
    return () => clearTimeout(t)
  }, [how, id, notify])
  // Desde la ventana de elegir: llega con la acción («imprimir» o «pdf») una sola vez
  const action = params.get('accion')
  useEffect(() => {
    if (!job || (action !== 'imprimir' && action !== 'pdf')) return
    const q = new URLSearchParams(params); q.delete('accion'); setParams(q, { replace: true })
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHow(action === 'pdf' ? 'pdf' : 'print')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job, action])
  if (!job) return <Loading label="Preparando el documento" />
  const p = patient(job.patientId)
  if (!p) return <Loading />
  const number = job.id.slice(0, 8).toUpperCase()
  const title = job.kind === 'rx' ? 'Receta' : job.exams[0]?.group === 'imaging' ? 'Orden de imagen y gabinete' : 'Orden de laboratorio'
  const docs = job.doctors.length
  return (
    <div className="page">
      <div className="page-head no-print">
        <button className="btn btn--ghost" onClick={() => nav(-1)}><ChevronLeft size={16} />Volver</button>
        <div className="page-head__actions"><Link className="btn btn--ghost" to={`/app/pacientes/${p.id}`}>Expediente</Link></div>
      </div>
      <div className="exam-order__bar no-print">
        <div className="exam-order__acts">
          <b>{title}{docs > 1 ? ` (${docs}: una por médico)` : ''}</b>
          <button className="btn btn--primary btn--sm" onClick={() => setHow('print')}><Printer size={15} />Imprimir</button>
          <button className="btn btn--soft btn--sm" onClick={() => setHow('pdf')}><Download size={15} />Descargar PDF</button>
        </div>
        {job.printed.length > 0 && <small className="muted">{job.printed.map((x) => `${x.how === 'pdf' ? 'Descargada' : 'Impresa'} por ${staffById(x.by)?.name ?? '—'}, ${dmyTime(x.at)}`).join(' · ')}</small>}
        <small className="muted">Sin la firma y el sello del médico en papel no vale.</small>
      </div>
      {job.kind === 'exams'
        ? job.doctors.map((d) => {
          const list = job.exams.filter((e) => d.items.includes(e.id))
          return <ExamOrderSheet key={d.doctor.id} group={list[0].group as ExamGroup} exams={list} doctor={d.doctor} number={`${number}${docs > 1 ? `-${job.doctors.indexOf(d) + 1}` : ''}`} patient={p} at={job.createdAt} />
        })
        : job.doctors.map((d) => <HospRxSheet key={d.doctor.id} meds={job.meds.filter((m) => d.items.includes(m.id))} extras={job.extras ?? {}} doctor={d.doctor} number={`${number}${docs > 1 ? `-${job.doctors.indexOf(d) + 1}` : ''}`} patient={p} at={job.createdAt} />)}
    </div>
  )
}

/**
 * ME10 (ronda 10): receta de lo que la clínica no tiene, con la plantilla de la receta de consulta externa: membrete, paciente,
 * fecha y hora, número, cada medicamento con presentación, dosis, vía, frecuencia, duración y «Cantidad a comprar», el
 * médico que lo indicó con especialidad y colegiado, firma y sello y la leyenda. Sin diagnósticos (privacidad).
 */
function HospRxSheet({ meds, extras = {}, doctor, number, patient: p, at }: { meds: InpatientMed[]; extras?: Job['extras'] & object; doctor: Doctor; number: string; patient: Patient; at: string }) {
  const { settings } = useStore()
  const minor = p.birthDate ? yearsOld(p.birthDate) < 18 : false
  return (
    <article className="rx-sheet rx-sheet--half hosp-rx" style={{ position: 'relative' }}>
      <header className="rx-sheet__head">
        <DocHeader clinic={{ ...settings, office: settings.kind === 'office' }} doctor={{ name: doctor.name, specialty: doctor.specialty, license: doctor.license }} />
        <div className="rx-sheet__folio">Receta<b>{number}</b>{dmyTime(at)}<br />Medicamentos para comprar</div>
      </header>
      <div className="rx-sheet__pt">
        <div style={{ gridColumn: '1 / -1' }}><span>Nombre completo</span>{fullName(p)}</div>
        <div><span>Identidad</span>{identityLine(p, minor)}</div>
        <div><span>Edad</span>{age(p.birthDate)}</div>
        <div><span>Expediente</span>{recordNumber(p, settings)}</div>
        {p.allergies.length > 0 && <div><span>Alergias</span>{p.allergies.join(', ')}</div>}
      </div>
      <div className="rx-sheet__rx" aria-hidden="true">Rx</div>
      <ol>
        {meds.map((m) => { const x = extras[m.id] ?? {}; const qty = x.quantity || m.buyQuantity; return (
          <li key={m.id}>
            <strong>{m.nebulization || m.loadingDose || m.infusionRate ? medLabel(m) : m.drug}</strong> {!m.nebulization && <span style={{ color: 'var(--muted)' }}>{m.presentation}</span>}
            {/* ME12 (ronda 11): «por 3 días» de esta receta (la orden sigue sin días) */}
            <p>{m.nebulization || m.loadingDose || m.infusionRate ? (x.days ? `Por ${x.days} ${x.days === 1 ? 'día' : 'días'}. ` : '') : `${medLabel(m).replace(m.drug, '').trim()}${x.days ? ` por ${x.days} ${x.days === 1 ? 'día' : 'días'}` : ''}. `}
              {!x.days && m.days ? `Durante ${m.days} ${m.days === 1 ? 'día' : 'días'}. ` : ''}{m.instructions ? `${m.instructions}. ` : ''}
              {qty ? <b>Cantidad a comprar: {qty}.</b> : null}</p>
          </li>
        ) })}
      </ol>
      <div className="rx-sheet__sign">
        {doctor.stampId ? <MarkImage id={doctor.stampId} alt="Sello del médico" className="doc-stamp" /> : <div className="exam-sign-box">Sello</div>}
        <div>{doctor.signatureId ? <MarkImage id={doctor.signatureId} alt={`Firma de ${doctor.name}`} className="doc-signature" /> : <em>&nbsp;</em>}{doctor.name}<br />
          <span style={{ color: 'var(--muted)' }}>{[doctor.specialty, doctor.license && `Colegiación ${doctor.license}`].filter(Boolean).join(' · ')}</span><br /><span style={{ color: 'var(--muted)' }}>Firma y sello</span></div>
      </div>
      <p className="sign-legend">{SIGN_AND_STAMP_LEGEND}</p>
      <footer className="rx-sheet__foot"><span>Receta {number}: medicamentos indicados en la estancia.</span><span>Emitida con Clinara</span></footer>
    </article>
  )
}
