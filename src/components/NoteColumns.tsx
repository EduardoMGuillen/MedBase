import type { ReactNode } from 'react'
import { Pill, Printer } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ExamOrder, InpatientNote, Vitals } from '../lib/types'
import { vitalLevel, type VitalKey } from '../lib/vitals'
import { examLine, GROUP_LABEL } from '../lib/exams'
import { dxCode, examText } from '../lib/format'

/**
 * Una nota como en papel: a la izquierda el texto clínico; a la derecha las indicaciones (órdenes que no son
 * medicamento) numeradas, el bloque «Exámenes» y, debajo, el bloque «Medicamentos» con un guion por línea. En el celular se apilan en
 * ese orden: texto, indicaciones, medicamentos. Lo usan la nota de evolución, la de observación, la nota de
 * consulta que hace de nota de ingreso, «Ver nota completa» y el expediente impreso.
 */
export function NoteColumns({ left, indicationsTitle = 'Indicaciones', indications, exams, meds }: {
  left: ReactNode; indicationsTitle?: string; indications: ReactNode; exams?: ReactNode; meds?: ReactNode
}) {
  return (
    <div className="note-2col">
      <div className="note">{left}</div>
      <aside className="note-orders" aria-label={indicationsTitle}>
        <h4>{indicationsTitle}</h4>
        {indications}
        {/* MC1 (ronda 6): Indicaciones y plan → Exámenes → Medicamentos, en todas las vistas */}
        {exams !== undefined && <div className="note-exams"><h4>Exámenes</h4>{exams}</div>}
        {meds !== undefined && <div className="note-meds"><h4>Medicamentos</h4>{meds}</div>}
      </aside>
    </div>
  )
}

/** Indicaciones numeradas (texto simple). */
export function IndicationList({ items, empty = 'Sin indicaciones.' }: { items: string[]; empty?: string }) {
  if (!items.length && !empty) return null
  return items.length ? <ol className="note__list">{items.map((o, i) => <li key={i}>{o}</li>)}</ol> : <p className="muted">{empty}</p>
}

/** Medicamentos: un guion por línea, en el orden en que se indicaron. */
export function MedLines({ items, empty = 'Sin medicamentos.' }: { items: string[]; empty?: string }) {
  return items.length
    ? <ul className="med-lines">{items.map((m, i) => <li key={i}><Pill size={12} className="orders__pill" aria-hidden="true" />{m}</li>)}</ul>
    : <p className="muted">{empty}</p>
}

/** MC5 (ronda 6): estado de un examen como se lee en la nota (es el de ahora: cambia sin tocar la nota firmada). */
export function noteExamStatus(e: Pick<ExamOrder, 'group' | 'status'>) {
  if (e.status === 'cancelled') return 'Cancelado'
  if (e.status === 'result' || e.status === 'reviewed') return 'Con resultado'
  if (e.status === 'sample') return 'Muestra tomada'
  if (e.status === 'done') return e.group === 'imaging' ? 'Realizado' : 'Muestra tomada'
  return 'Ordenado'
}

/**
 * MC5 (ronda 6): los exámenes que pidió una nota, con su tipo, «Externo» o «No catalogado» si aplica y su estado actual.
 * Pertenecen a la nota donde se pidieron: no bajan a la siguiente.
 */
export function NoteExams({ list, empty = 'Sin exámenes.' }: { list: ExamOrder[]; empty?: string }) {
  if (!list.length) return <p className="muted">{empty}</p>
  // Ronda 8: la orden de los exámenes de la nota se imprime desde aquí (sobre todo los externos: el paciente la lleva)
  const batches = [...new Set(list.filter((e) => e.status !== 'cancelled').map((e) => e.batchId))]
  const external = list.some((e) => e.place === 'external' && e.status !== 'cancelled')
  return (<>
    <ul className="note-exam-list">{list.map((e) => (
      <li key={e.id} className={e.status === 'cancelled' ? 'is-cancelled' : ''}>
        <span>{examLine(e)}{e.priority === 'urgent' && <span className="badge badge--red">Urgente</span>}</span>
        <small>{GROUP_LABEL[e.group]}{e.place === 'external' ? ' · Externo' : ''}{e.uncatalogued ? ' · No catalogado' : ''} · <b>{noteExamStatus(e)}</b></small>
      </li>
    ))}</ul>
    {batches.map((b) => (
      <Link key={b} to={`/app/examenes/orden/${b}`} className={`btn ${external ? 'btn--soft' : 'btn--ghost'} btn--sm no-print`} style={{ justifySelf: 'start', marginTop: 6 }}>
        <Printer size={14} />{external ? 'Imprimir orden (externos)' : 'Imprimir orden'}</Link>
    ))}
  </>)
}

/**
 * MC8 (ronda 6): la franja de signos vitales de una nota («PA 120/80 mmHg, FC 88 lpm…»), la misma de la nota de ingreso. Lo
 * fuera de rango se marca como en la preclínica.
 */
export function VitalsStrip({ v, ageYears, empty }: { v: Vitals; ageYears?: number; empty?: string }) {
  const off = (k: VitalKey) => v[k] != null && vitalLevel(k, v[k]!, ageYears) !== 'ok'
  const parts: [string, boolean][] = ([
    [v.systolic != null && v.diastolic != null && `PA ${v.systolic}/${v.diastolic} mmHg`, off('systolic') || off('diastolic')],
    [v.heartRate != null && `FC ${v.heartRate} lpm`, off('heartRate')],
    [v.respRate != null && `FR ${v.respRate} rpm`, off('respRate')],
    [v.temperature != null && `T ${v.temperature.toFixed(1)} °C`, off('temperature')],
    [v.spo2 != null && `SpO₂ ${v.spo2}%`, off('spo2')],
    [v.weightKg != null && `Peso ${v.weightKg} kg`, false],
    [v.glucose != null && `Glucometría ${v.glucose} mg/dL`, off('glucose')],
    [v.painScale != null && `Dolor ${v.painScale}/10`, off('painScale')],
  ] as [string | false, boolean][]).filter((x): x is [string, boolean] => !!x[0])
  if (!parts.length) return <p className="note__vitals">{empty ?? 'Sin signos.'}</p>
  return <p className="note__vitals">{parts.map(([t, out], i) => <span key={t}>{i > 0 && ', '}<span className={out ? 'vital-out' : undefined}>{t}</span></span>)}</p>
}

const SOAP_TEXT = [['subjective', 'S. Subjetivo'], ['objective', 'O. Objetivo'], ['assessment', 'A. Análisis'], ['plan', 'P. Plan']] as const

/**
 * Texto clínico de una nota de evolución u observación (columna izquierda), según su formato: S, O, A y P, o
 * Diagnósticos, Examen físico y Observaciones.
 */
export function NoteText({ n, vitals, ageYears }: { n: Pick<InpatientNote, 'subjective' | 'objective' | 'assessment' | 'plan' | 'format' | 'diagnoses' | 'exam' | 'observations'> & { evolution?: string }; vitals?: Vitals; ageYears?: number }) {
  const empty = <span className="muted">Sin datos.</span>
  // MC8 (ronda 6): los signos vitales anotados en la nota, en la franja de siempre, encima del examen físico (o del objetivo)
  const strip = vitals && <div className="note__sec"><h4>Signos vitales</h4><VitalsStrip v={vitals} ageYears={ageYears} />{vitals.takenAt && <small className="muted">Tomados a las {new Date(vitals.takenAt).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit', hour12: false })}</small>}</div>
  if (n.format === 'dx') {
    return <>
      <div className="note__sec"><h4>Diagnósticos</h4>
        {n.diagnoses?.length ? <ol className="note__list">{n.diagnoses.map((d) => <li key={d.code + d.label}>{d.label} <span className="muted">({dxCode(d)})</span></li>)}</ol> : <p>{empty}</p>}</div>
      {/* Ronda 8: las notas de antes no lo tienen */}
      {n.evolution && <div className="note__sec"><h4>Evolución</h4><p>{n.evolution}</p></div>}
      {strip}
      <div className="note__sec"><h4>Examen físico</h4><p>{examText(n.exam) || empty}</p></div>
      <div className="note__sec"><h4>Observaciones</h4><p>{n.observations || empty}</p></div>
    </>
  }
  // NE4 (ronda 8): una evolución SOAP también lleva los diagnósticos vigentes (las de antes no)
  return <>
    {!!n.diagnoses?.length && <div className="note__sec"><h4>Diagnósticos</h4><ol className="note__list">{n.diagnoses.map((d) => <li key={d.code + d.label}>{d.label} <span className="muted">({dxCode(d)})</span></li>)}</ol></div>}
    {SOAP_TEXT.map(([k, label]) => <div key={k}>{k === 'objective' && strip}<div className="note__sec"><h4>{label}</h4><p>{n[k] || empty}</p></div></div>)}
  </>
}
