import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Download, MessageCircle, Printer } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { Loading, BackButton, PageHead } from '../components/ui'
import { ClinicalDoc, guardianRow, patientOf, placeOf } from '../components/ClinicalDoc'
import { dmyTime, fullName, whatsappUrl } from '../lib/format'
import { examCatalog, examLine, orderGroups } from '../lib/exams'
import { useExamCatalog } from '../lib/useExamCatalog'
import type { Diagnosis, ExamGroup, ExamOrder, Patient } from '../lib/types'
import { SIGN_AND_STAMP_LEGEND } from '../lib/clinicalConfig'

interface Batch { exams: ExamOrder[]; diagnoses: Diagnosis[]; doctor: { id: string; name: string; license?: string; specialty?: string; signatureId?: string; stampId?: string } }

export const TITLE: Record<ExamGroup, string> = { lab: 'Orden de laboratorio', imaging: 'Orden de imagen y gabinete' }

/**
 * EX1 (ronda 5) y EX2 (ronda 8): orden de exámenes impresa, separada de la receta. Dos documentos, «Orden de laboratorio» y
 * «Orden de imagen y gabinete», porque el paciente los lleva a lugares distintos. Si en el lote hay estudios «Externo»,
 * la orden lista sólo esos (son los que el paciente lleva en la mano); los de la clínica siguen su flujo de siempre.
 * Tamaño carta: membrete, número de orden, fecha y hora, datos del paciente, cada estudio tal como se ordenó con «Urgente»
 * y su indicación, médico con especialidad y colegiación, y espacio para firma y sello. No dice «Externo» y no lleva los
 * diagnósticos (privacidad, A8) salvo que el médico lo marque. Cada impresión o descarga queda en la bitácora.
 */
export default function ExamOrderPage() {
  const { batch } = useParams()
  const [params, setParams] = useSearchParams()
  const { patient, settings, notify } = useStore()
  const nav = useNavigate()
  const [data, setData] = useState<Batch | null>(null)
  const [only, setOnly] = useState<{ g: ExamGroup; how: 'print' | 'pdf' } | null>(null)
  useEffect(() => { if (batch) api<Batch>(`/exams/batch/${batch}`).then(setData).catch((e: Error) => notify(e.message, 'error')) }, [batch, notify])
  // Imprimir (o guardar en PDF) sólo una de las dos órdenes; queda registrado
  useEffect(() => {
    if (!only || !batch) return
    void api(`/exams/batch/${batch}/printed`, { body: { group: only.g, how: only.how } }).catch(() => { /* la impresión no depende del registro */ })
    if (only.how === 'pdf') notify('En la ventana de impresión elige «Guardar como PDF».')
    const t = setTimeout(() => { window.print(); setOnly(null) }, 150)
    return () => clearTimeout(t)
  }, [only, batch, notify])
  const live = data ? data.exams.filter((e) => e.status !== 'cancelled') : []
  const shown = live.some((e) => e.place === 'external') ? live.filter((e) => e.place === 'external') : live
  const groups = (['lab', 'imaging'] as ExamGroup[]).filter((g) => shown.some((e) => e.group === g))
  // Al firmar la nota se ofrece «Imprimir / Descargar PDF»: llega aquí con la acción elegida (una sola vez)
  const action = params.get('accion')
  const clinicBatch = params.get('clinica')
  useEffect(() => {
    if (!data || !groups.length || (action !== 'imprimir' && action !== 'pdf')) return
    const q = new URLSearchParams(params); q.delete('accion'); setParams(q, { replace: true })
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (groups.length === 1) setOnly({ g: groups[0], how: action === 'pdf' ? 'pdf' : 'print' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, action])
  if (!data) return <Loading label="Preparando la orden" />
  const p = patient(data.exams[0].patientId)
  if (!p) return <Loading />
  const first = data.exams[0]
  const number = first.orderNo ?? first.batchId.slice(0, 8).toUpperCase()
  // El mismo envío por WhatsApp que ya tenía la orden: sin diagnóstico (privacidad) y sin la palabra «Externo»
  const text = (g: ExamGroup) => [`${settings.name}. ${TITLE[g]} ${number} del ${dmyTime(first.orderedAt)}.`, `Paciente: ${fullName(p)}.`, `${data.doctor.name}${data.doctor.license ? `, colegiación ${data.doctor.license}` : ''}.`, '',
    ...shown.filter((e) => e.group === g).map((e) => `• ${examLine(e)}${e.priority === 'urgent' ? ' (URGENTE)' : ''}${e.indication ? `. ${e.indication}` : ''}`)].join('\n')
  return (
    <div className={`page${only ? ` print-only-${only.g}` : ''}`}>
      <PageHead noPrint back={<BackButton onClick={() => nav(-1)}>Volver</BackButton>} actions={<>
          <Link className="btn btn--ghost" to={`/app/pacientes/${p.id}`}>Expediente</Link>
      </>} />
      <div className="exam-order__bar no-print">
        {groups.map((g) => (
          <div key={g} className="exam-order__acts">
            <b>{TITLE[g]}</b>
            <button className="btn btn--primary btn--sm" onClick={() => setOnly({ g, how: 'print' })}><Printer size={15} />Imprimir</button>
            <button className="btn btn--soft btn--sm" onClick={() => setOnly({ g, how: 'pdf' })}><Download size={15} />Descargar PDF</button>
            {p.phone && <a className="btn btn--ghost btn--sm" target="_blank" rel="noreferrer" href={whatsappUrl(p.phone, text(g))}><MessageCircle size={15} />Enviar por WhatsApp</a>}
          </div>
        ))}
      </div>
      {groups.length > 1 && <p className="muted no-print" style={{ fontSize: 14 }}>Son dos órdenes: el paciente lleva la de laboratorio y la de imagen y gabinete a lugares distintos.</p>}
      {/* EX10 (ronda 14): la orden de los «En la clínica» de una consulta externa: ya le llegó al departamento */}
      {shown.length > 0 && shown.every((e) => e.place !== 'external' && !e.hospitalizationId && e.consultationId) && <div className="alert-strip alert-strip--calm no-print">{clinicNotice(shown, settings)}</div>}
      {groups.map((g) => (
        <ExamOrderSheet key={g} group={g} exams={shown.filter((e) => e.group === g)} doctor={data.doctor} number={number} patient={p} />
      ))}
      {clinicBatch && clinicBatch !== batch && <ClinicOrderBlock batch={clinicBatch} />}
    </div>
  )
}

type Doctor = Batch['doctor']

/**
 * CE1 (ronda 12): las órdenes de un lote debajo de otro documento (la receta), para imprimir todo junto. Mismas reglas que la
 * página de la orden: si hay estudios «Externo», solo esos. Cada orden empieza en su propia hoja (carta).
 */
export function ExamBatchSheets({ batch, onGroups }: { batch: string; onGroups?: (g: ExamGroup[]) => void }) {
  const { patient } = useStore()
  const [data, setData] = useState<Batch | null>(null)
  useEffect(() => { api<Batch>(`/exams/batch/${batch}`).then(setData).catch(() => setData(null)) }, [batch])
  const live = data ? data.exams.filter((e) => e.status !== 'cancelled') : []
  const shown = live.some((e) => e.place === 'external') ? live.filter((e) => e.place === 'external') : live
  const groups = (['lab', 'imaging'] as ExamGroup[]).filter((g) => shown.some((e) => e.group === g))
  const key = groups.join(',')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onGroups?.(groups) }, [key])
  const p = data && data.exams[0] ? patient(data.exams[0].patientId) : undefined
  if (!data || !p || !shown.length) return null
  const number = data.exams[0].orderNo ?? data.exams[0].batchId.slice(0, 8).toUpperCase()
  return <div className="batch-sheets">{groups.map((g) => <ExamOrderSheet key={g} group={g} exams={shown.filter((e) => e.group === g)} doctor={data.doctor} number={number} patient={p} />)}</div>
}

/** EX10 (ronda 14): el aviso de la orden de los exámenes «En la clínica»: ya le llegó al departamento que los hace. */
export function clinicNotice(list: Pick<ExamOrder, 'group'>[], s: { hasLab?: boolean; hasImaging?: boolean }) {
  const who = [...new Set(list.map((e) => (e.group === 'lab' ? (s.hasLab ? 'al laboratorio' : 'a enfermería') : (s.hasImaging ? 'a imágenes' : 'a enfermería'))))]
  return `Esta orden ya le llegó ${who.join(' y ')} de la clínica. Imprímala solo si el paciente la quiere llevar.`
}

/**
 * EX10 (ronda 14): al terminar la consulta externa, la orden de los exámenes «En la clínica» va aparte, debajo de lo demás: con
 * la misma plantilla (IM1, IM3), el mismo título y su propio folio, su aviso y su botón «Imprimir esta orden» (y «Descargar
 * PDF»). No sale con el botón principal. Se imprima o no, los exámenes ya están en la bandeja del laboratorio o de imágenes.
 */
export function ClinicOrderBlock({ batch }: { batch: string }) {
  const { patient, settings, notify } = useStore()
  const [data, setData] = useState<Batch | null>(null)
  useEffect(() => { api<Batch>(`/exams/batch/${batch}`).then(setData).catch(() => setData(null)) }, [batch])
  const live = data ? data.exams.filter((e) => e.status !== 'cancelled') : []
  const groups = (['lab', 'imaging'] as ExamGroup[]).filter((g) => live.some((e) => e.group === g))
  const p = data && data.exams[0] ? patient(data.exams[0].patientId) : undefined
  if (!data || !p || !live.length) return null
  const number = data.exams[0].orderNo ?? data.exams[0].batchId.slice(0, 8).toUpperCase()
  const print = (how: 'print' | 'pdf') => {
    void markBatchPrinted(batch, groups, how)
    if (how === 'pdf') notify('En la ventana de impresión elige «Guardar como PDF».')
    // Solo esta orden: lo demás de la página se oculta al imprimir mientras dure
    document.body.classList.add('print-clinic-only')
    const done = () => { document.body.classList.remove('print-clinic-only'); window.removeEventListener('afterprint', done) }
    window.addEventListener('afterprint', done)
    setTimeout(() => window.print(), 60)
  }
  return (
    <div className="clinic-order">
      <div className="alert-strip alert-strip--calm no-print clinic-order__bar">
        <span>{clinicNotice(live, settings)}</span>
        <span className="clinic-order__btns">
          <button className="btn btn--primary btn--sm" onClick={() => print('print')}><Printer size={15} />Imprimir esta orden</button>
          <button className="btn btn--soft btn--sm" onClick={() => print('pdf')}><Download size={15} />Descargar PDF</button>
        </span>
      </div>
      {groups.map((g) => <ExamOrderSheet key={g} group={g} exams={live.filter((e) => e.group === g)} doctor={data.doctor} number={number} patient={p} />)}
    </div>
  )
}

/** CE1: deja en la bitácora que se imprimieron las órdenes del lote (la impresión no depende del registro). */
export const markBatchPrinted = (batch: string, groups: ExamGroup[], how: 'print' | 'pdf' = 'print') =>
  Promise.all(groups.map((g) => api(`/exams/batch/${batch}/printed`, { body: { group: g, how } }).catch(() => null)))

/**
 * EX2 (ronda 8) y EX5 (ronda 10): la hoja de una orden de exámenes (laboratorio o imagen y gabinete) con los datos del médico
 * que la pidió, «Urgente» y la indicación clínica por estudio, y la leyenda «Válida solo con firma y sello del médico». Sin
 * CIE-11 ni la palabra «Externo» (salvo el diagnóstico si el médico lo marca). La usan la orden del lote, la de los pendientes
 * de la pestaña Exámenes, la receta con sus órdenes y «Órdenes impresas».
 * IM1 (ronda 13): con la plantilla única. IM3 (ronda 13): agrupada como el catálogo, compacta, con la numeración por grupo.
 */
export function ExamOrderSheet({ group: g, exams: list, doctor, number, patient: p, diagnoses, at }: {
  group: ExamGroup; exams: ExamOrder[]; doctor: Doctor; number: string; patient: Patient; diagnoses?: Diagnosis[]; at?: string
}) {
  const { settings } = useStore()
  const { exams: clinicExams } = useExamCatalog()
  const groups = orderGroups(list, examCatalog(clinicExams))
  return (
    <ClinicalDoc kind={TITLE[g]} folio={number} at={at ?? list[0].orderedAt} place={placeOf(settings)} patient={patientOf(p, settings)}
      className={`exam-order exam-order--${g}`}
      rows={[!!diagnoses?.length && { label: 'Diagnóstico', value: diagnoses.map((d) => d.label).join('; ') }, guardianRow(p)]}
      signers={[{ name: doctor.name, title: doctor.specialty, license: doctor.license, signatureId: doctor.signatureId, stampId: doctor.stampId }]}
      legends={[SIGN_AND_STAMP_LEGEND, `${TITLE[g]} ${number}, separada de la receta.`]}>
      <div className="order-groups">{groups.map((grp) => (
        <section key={grp.title} className="order-group"><h3>{grp.title}</h3>
          {/* IM4 (ronda 16): viñetas, no números (la numeración volvía a empezar en 1 en cada grupo); la receta sigue numerada */}
          <ul>{grp.items.map((e) => (
            <li key={e.id}><b>{examLine(e)}</b>{e.priority === 'urgent' && <span className="exam-order__urgent">Urgente</span>}
              {e.indication && <small>Indicación clínica: {e.indication}</small>}</li>
          ))}</ul>
        </section>
      ))}</div>
    </ClinicalDoc>
  )
}
