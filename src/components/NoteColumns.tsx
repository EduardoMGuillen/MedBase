import type { ReactNode } from 'react'
import { Pill } from 'lucide-react'
import type { InpatientNote } from '../lib/types'
import { dxCode, examText } from '../lib/format'

/**
 * Una nota como en papel: a la izquierda el texto clínico; a la derecha las indicaciones (órdenes que no son
 * medicamento) numeradas y, debajo, el bloque «Medicamentos» con un guion por línea. En el celular se apilan en
 * ese orden: texto, indicaciones, medicamentos. Lo usan la nota de evolución, la de observación, la nota de
 * consulta que hace de nota de ingreso, «Ver nota completa» y el expediente impreso.
 */
export function NoteColumns({ left, indicationsTitle = 'Indicaciones', indications, meds }: {
  left: ReactNode; indicationsTitle?: string; indications: ReactNode; meds?: ReactNode
}) {
  return (
    <div className="note-2col">
      <div className="note">{left}</div>
      <aside className="note-orders" aria-label={indicationsTitle}>
        <h4>{indicationsTitle}</h4>
        {indications}
        {meds !== undefined && <div className="note-meds"><h4>Medicamentos</h4>{meds}</div>}
      </aside>
    </div>
  )
}

/** Indicaciones numeradas (texto simple). */
export function IndicationList({ items, empty = 'Sin indicaciones.' }: { items: string[]; empty?: string }) {
  return items.length ? <ol className="note__list">{items.map((o, i) => <li key={i}>{o}</li>)}</ol> : <p className="muted">{empty}</p>
}

/** Medicamentos: un guion por línea, en el orden en que se indicaron. */
export function MedLines({ items, empty = 'Sin medicamentos.' }: { items: string[]; empty?: string }) {
  return items.length
    ? <ul className="med-lines">{items.map((m, i) => <li key={i}><Pill size={12} className="orders__pill" aria-hidden="true" />{m}</li>)}</ul>
    : <p className="muted">{empty}</p>
}

const SOAP_TEXT = [['subjective', 'S. Subjetivo'], ['objective', 'O. Objetivo'], ['assessment', 'A. Análisis'], ['plan', 'P. Plan']] as const

/**
 * Texto clínico de una nota de evolución u observación (columna izquierda), según su formato: S, O, A y P, o
 * Diagnósticos, Examen físico y Observaciones.
 */
export function NoteText({ n }: { n: Pick<InpatientNote, 'subjective' | 'objective' | 'assessment' | 'plan' | 'format' | 'diagnoses' | 'exam' | 'observations'> }) {
  const empty = <span className="muted">Sin datos.</span>
  if (n.format === 'dx') {
    return <>
      <div className="note__sec"><h4>Diagnósticos</h4>
        {n.diagnoses?.length ? <ol className="note__list">{n.diagnoses.map((d) => <li key={d.code + d.label}>{d.label} <span className="muted">({dxCode(d)})</span></li>)}</ol> : <p>{empty}</p>}</div>
      <div className="note__sec"><h4>Examen físico</h4><p>{examText(n.exam) || empty}</p></div>
      <div className="note__sec"><h4>Observaciones</h4><p>{n.observations || empty}</p></div>
    </>
  }
  return <>{SOAP_TEXT.map(([k, label]) => <div key={k} className="note__sec"><h4>{label}</h4><p>{n[k] || empty}</p></div>)}</>
}
