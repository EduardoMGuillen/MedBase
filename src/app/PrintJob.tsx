import { useEffect, useRef, useState } from 'react'
import { ResultSheet } from './ResultSheet'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Download, Printer } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { Loading } from '../components/ui'
import { ClinicalDoc, guardianRow, patientOf, placeOf } from '../components/ClinicalDoc'
import { dmyTime } from '../lib/format'
import { medLabel } from '../lib/inpatient'
import { SIGN_AND_STAMP_LEGEND } from '../lib/clinicalConfig'
import { ExamOrderSheet } from './ExamOrder'
import type { ExamGroup, ExamOrder, InpatientMed, Patient } from '../lib/types'

type Doctor = { id: string; name: string; license?: string; specialty?: string; signatureId?: string; stampId?: string }
interface Job {
  id: string; kind: 'exams' | 'rx' | 'results'; patientId: string; hospitalizationId?: string; createdBy: string; createdAt: string
  exams: ExamOrder[]; meds: InpatientMed[]; doctors: { doctor: Doctor; items: string[] }[]; printed: { how: string; by: string; at: string }[]
  /** ME12 (ronda 11): días y cantidad a comprar de cada medicamento, solo para esta receta. */
  extras?: Record<string, { days?: number; quantity?: string }>
  /** IM2 (ronda 13): receta: «Incluir diagnóstico» y los diagnósticos de la estancia cuando se generó. */
  includeDx?: boolean
  diagnoses?: string[]
}

/**
 * EX5 y ME10 (ronda 10): lo que se imprime desde la pestaña Exámenes («Imprimir orden» de los pendientes) y desde la hoja o la
 * nota («Receta» de lo que no hay en la clínica). Un documento por médico que indicó, con sus datos (nunca los de quien
 * imprime), espacio para firma y sello y la leyenda. Cada impresión o descarga queda registrada (GE4, bitácora).
 */
export default function PrintJobPage() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const { patient, staffById, notify, can } = useStore()
  const nav = useNavigate()
  const [job, setJob] = useState<Job | null>(null)
  const [savingDx, setSavingDx] = useState(false)
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
  // EX6 (ronda 11): abrir el resultado («Ver PDF») también queda registrado, una vez por visita
  const viewed = useRef(false)
  useEffect(() => {
    if (!job || job.kind !== 'results' || action || viewed.current) return
    viewed.current = true
    void api(`/print-jobs/${job.id}/printed`, { body: { how: 'view' } }).catch(() => {})
  }, [job, action])
  if (!job) return <Loading label="Preparando el documento" />
  const p = patient(job.patientId)
  if (!p) return <Loading />
  const number = job.id.slice(0, 8).toUpperCase()
  const groups = new Set(job.exams.map((e) => e.group))
  const title = job.kind === 'rx' ? 'Receta' : job.kind === 'results' ? (groups.size > 1 ? 'Resultados de exámenes' : groups.has('imaging') ? 'Resultado de imagen y gabinete' : 'Resultado de laboratorio')
    : groups.size > 1 ? 'Órdenes de exámenes' : job.exams[0]?.group === 'imaging' ? 'Orden de imagen y gabinete' : 'Orden de laboratorio'
  const docs = job.doctors.length
  const sheets = job.kind === 'exams' ? job.doctors.flatMap((d) => (['lab', 'imaging'] as ExamGroup[]).map((g) => ({ d, g, list: job.exams.filter((e) => d.items.includes(e.id) && e.group === g) })).filter((x) => x.list.length)) : []
  return (
    <div className="page">
      <div className="page-head no-print">
        <button className="btn btn--ghost" onClick={() => nav(-1)}><ChevronLeft size={16} />Volver</button>
        <div className="page-head__actions"><Link className="btn btn--ghost" to={`/app/pacientes/${p.id}`}>Expediente</Link></div>
      </div>
      <div className="exam-order__bar no-print">
        <div className="exam-order__acts">
          <b>{title}{job.kind === 'exams' ? (sheets.length > 1 ? ` (${sheets.length} documentos${docs > 1 ? ': uno por médico' : ''}${groups.size > 1 ? ' y por tipo' : ''})` : '') : docs > 1 ? ` (${docs}: una por médico)` : ''}</b>
          <button className="btn btn--primary btn--sm" onClick={() => setHow('print')}><Printer size={15} />Imprimir</button>
          <button className="btn btn--soft btn--sm" onClick={() => setHow('pdf')}><Download size={15} />Descargar PDF</button>
        </div>
        {job.printed.filter((x) => x.how !== 'view').length > 0 && <small className="muted">{job.printed.filter((x) => x.how !== 'view').map((x) => `${x.how === 'pdf' ? 'Descargado' : 'Impreso'} por ${staffById(x.by)?.name ?? '—'}, ${dmyTime(x.at)}`).join(' · ')}</small>}
        <small className="muted">{job.kind === 'results' ? 'Sin la firma y el sello de los responsables en papel no vale.' : 'Sin la firma y el sello del médico en papel no vale.'}</small>
        {/* IM2 (ronda 13): solo el médico decide si la receta lleva el diagnóstico; enfermería la imprime como él la dejó */}
        {job.kind === 'rx' && can('inpatient.orders') && !!job.diagnoses?.length && <label className="check-line" style={{ margin: 0 }}>
          <input type="checkbox" checked={!!job.includeDx} disabled={savingDx} onChange={async (e) => {
            const v = e.target.checked
            setSavingDx(true)
            try { await api(`/print-jobs/${job.id}/include-dx`, { body: { includeDx: v } }); setJob({ ...job, includeDx: v }) } catch (err) { notify((err as Error).message, 'error') }
            setSavingDx(false)
          }} />
          <span><b>Incluir diagnóstico</b><small>Por privacidad la receta sale sin diagnóstico, salvo que lo decidas. Se guarda con la receta.</small></span></label>}
      </div>
      {job.kind === 'results' ? <ResultSheet exams={job.exams} patient={p} number={number} at={job.printed.filter((x) => x.how !== 'view').at(-1)?.at ?? new Date().toISOString()} />
        : job.kind === 'exams'
        // EX11 (ronda 14): un documento por médico y, si van laboratorio e imagen juntos, uno por tipo
        ? sheets.map(({ d, g, list }, n) => <ExamOrderSheet key={`${d.doctor.id}-${g}`} group={g} exams={list} doctor={d.doctor} number={`${number}${sheets.length > 1 ? `-${n + 1}` : ''}`} patient={p} at={job.createdAt} />)
        : job.doctors.map((d) => <HospRxSheet key={d.doctor.id} meds={job.meds.filter((m) => d.items.includes(m.id))} extras={job.extras ?? {}} doctor={d.doctor} number={`${number}${docs > 1 ? `-${job.doctors.indexOf(d) + 1}` : ''}`} patient={p} at={job.createdAt} diagnoses={job.includeDx ? job.diagnoses : undefined} />)}
    </div>
  )
}

/**
 * ME10 (ronda 10): receta de lo que la clínica no tiene y ME12 (ronda 11): «Generar receta». Cada medicamento con
 * presentación, dosis, vía, frecuencia, duración y «Cantidad a comprar», el médico que lo indicó, firma y sello y la leyenda.
 * IM1 (ronda 13): con la plantilla única. IM2 (ronda 13): el diagnóstico solo si el médico marcó «Incluir diagnóstico».
 */
function HospRxSheet({ meds, extras = {}, doctor, number, patient: p, at, diagnoses }: { meds: InpatientMed[]; extras?: Job['extras'] & object; doctor: Doctor; number: string; patient: Patient; at: string; diagnoses?: string[] }) {
  const { settings } = useStore()
  return (
    <ClinicalDoc kind="Receta" folio={number} at={at} folioNote="Medicamentos para comprar" place={placeOf(settings)} patient={patientOf(p, settings)} className="hosp-rx"
      rows={[{ label: 'Alergias', value: p.allergies.length ? p.allergies.join(', ') : 'Ninguna conocida' },
        !!diagnoses?.length && { label: 'Diagnóstico', value: diagnoses.join('; ') }, guardianRow(p)]}
      signers={[{ name: doctor.name, title: doctor.specialty, license: doctor.license, signatureId: doctor.signatureId, stampId: doctor.stampId }]}
      legends={[SIGN_AND_STAMP_LEGEND, `Receta ${number}: medicamentos indicados en la estancia.`]}>
      <div className="rx-sheet__rx" aria-hidden="true">Rx</div>
      <ol className="rx-items">
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
    </ClinicalDoc>
  )
}
