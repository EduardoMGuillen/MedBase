import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Download, MessageCircle, Printer } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { Loading } from '../components/ui'
import { DocHeader } from '../components/DocHeader'
import { MarkImage } from '../components/MarkImage'
import { age, dmyTime, fullName, identityLine, recordNumber, whatsappUrl } from '../lib/format'
import { examLine } from '../lib/exams'
import { yearsOld } from '../lib/inpatient'
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
  const [withDx, setWithDx] = useState(false)
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
    ...shown.filter((e) => e.group === g).map((e, i) => `${i + 1}. ${examLine(e)}${e.priority === 'urgent' ? ' (URGENTE)' : ''}${e.indication ? `. ${e.indication}` : ''}`)].join('\n')
  return (
    <div className={`page${only ? ` print-only-${only.g}` : ''}`}>
      <div className="page-head no-print">
        <button className="btn btn--ghost" onClick={() => nav(-1)}><ChevronLeft size={16} />Volver</button>
        <div className="page-head__actions">
          <Link className="btn btn--ghost" to={`/app/pacientes/${p.id}`}>Expediente</Link>
        </div>
      </div>
      <div className="exam-order__bar no-print">
        {groups.map((g) => (
          <div key={g} className="exam-order__acts">
            <b>{TITLE[g]}</b>
            <button className="btn btn--primary btn--sm" onClick={() => setOnly({ g, how: 'print' })}><Printer size={15} />Imprimir</button>
            <button className="btn btn--soft btn--sm" onClick={() => setOnly({ g, how: 'pdf' })}><Download size={15} />Descargar PDF</button>
            {p.phone && <a className="btn btn--ghost btn--sm" target="_blank" rel="noreferrer" href={whatsappUrl(p.phone, text(g))}><MessageCircle size={15} />Enviar por WhatsApp</a>}
          </div>
        ))}
        {data.diagnoses.length > 0 && <label className="check-line" style={{ margin: 0 }}><input type="checkbox" checked={withDx} onChange={(e) => setWithDx(e.target.checked)} />
          <span><b>Incluir el diagnóstico en la orden</b><small>Por privacidad no sale, salvo que lo decidas.</small></span></label>}
      </div>
      {groups.length > 1 && <p className="muted no-print" style={{ fontSize: 14 }}>Son dos órdenes: el paciente lleva la de laboratorio y la de imagen y gabinete a lugares distintos.</p>}
      {live.length > shown.length && <p className="muted no-print" style={{ fontSize: 14 }}>Los estudios que se hacen en la clínica no van en esta orden: siguen su flujo de siempre en la pestaña Exámenes.</p>}
      {groups.map((g) => (
        <ExamOrderSheet key={g} group={g} exams={shown.filter((e) => e.group === g)} doctor={data.doctor} number={number} patient={p} diagnoses={withDx ? data.diagnoses : undefined} />
      ))}
    </div>
  )
}

type Doctor = Batch['doctor']

/**
 * EX2 (ronda 8) y EX5 (ronda 10): la hoja de una orden de exámenes (laboratorio o imagen y gabinete), carta: membrete, número,
 * fecha y hora, paciente, cada estudio como se ordenó (con «Urgente» y su indicación), el médico que lo pidió con especialidad y
 * colegiación, espacio para firma y sello y la leyenda «Válida solo con firma y sello del médico». Sin CIE-11 ni la palabra
 * «Externo» (salvo el diagnóstico si el médico lo marca). La usan la orden del lote y la de los pendientes de la pestaña Exámenes.
 */
export function ExamOrderSheet({ group: g, exams: list, doctor, number, patient: p, diagnoses, at }: {
  group: ExamGroup; exams: ExamOrder[]; doctor: Doctor; number: string; patient: Patient; diagnoses?: Diagnosis[]; at?: string
}) {
  const { settings } = useStore()
  const minor = p.birthDate ? yearsOld(p.birthDate) < 18 : false
  const doctorLine = [doctor.specialty, doctor.license && `Colegiación ${doctor.license}`].filter(Boolean).join(' · ')
  return (
    <article className={`rx-sheet exam-order exam-order--${g}`}>
      <header className="rx-sheet__head">
        <DocHeader clinic={settings} doctor={doctor} />
        <div className="rx-sheet__folio">{TITLE[g]}<b>{number}</b>{dmyTime(at ?? list[0].orderedAt)}</div>
      </header>
      <div className="rx-sheet__pt">
        <div style={{ gridColumn: '1 / -1' }}><span>Paciente</span>{fullName(p)}</div>
        <div><span>Edad</span>{age(p.birthDate)}</div>
        <div><span>Sexo</span>{p.sex === 'F' ? 'Femenino' : 'Masculino'}</div>
        <div><span>Expediente</span>{recordNumber(p, settings)}</div>
        <div><span>Identidad</span>{identityLine(p, minor)}</div>
        {!!diagnoses?.length && <div style={{ gridColumn: '1 / -1' }}><span>Diagnóstico</span>{diagnoses.map((d) => d.label).join('; ')}</div>}
      </div>
      <h2 className="exam-order__title">{g === 'lab' ? 'Exámenes de laboratorio' : 'Estudios de imagen y gabinete'}</h2>
      <ol className="exam-order__list">{list.map((e) => (
        <li key={e.id}><b>{examLine(e)}</b>{e.priority === 'urgent' && <span className="exam-order__urgent">Urgente</span>}
          {e.indication && <p>Indicación clínica: {e.indication}</p>}</li>
      ))}</ol>
      <div className="rx-sheet__sign">
        {doctor.stampId ? <MarkImage id={doctor.stampId} alt="Sello del médico" className="doc-stamp" /> : <div className="exam-sign-box">Sello</div>}
        <div>{doctor.signatureId ? <MarkImage id={doctor.signatureId} alt={`Firma de ${doctor.name}`} className="doc-signature" /> : <em>&nbsp;</em>}
          {doctor.name}<br /><span style={{ color: 'var(--muted)' }}>{doctorLine}</span><br /><span style={{ color: 'var(--muted)' }}>Firma y sello</span></div>
      </div>
      {/* EX5 y ME10 (ronda 10): también en las órdenes de EX2 */}
      <p className="sign-legend">{SIGN_AND_STAMP_LEGEND}</p>
      <footer className="rx-sheet__foot"><span>{TITLE[g]} {number}, separada de la receta.</span><span>Emitida con Clinara</span></footer>
    </article>
  )
}
