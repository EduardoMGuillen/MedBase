import type { ReactNode } from 'react'
import { Pill } from 'lucide-react'
import type { InpatientNote } from '../lib/types'

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

/** Texto clínico de una nota de evolución u observación (columna izquierda): S, O, A y P. */
export function NoteText({ n }: { n: Pick<InpatientNote, 'subjective' | 'objective' | 'assessment' | 'plan'> }) {
  return <>{SOAP_TEXT.map(([k, label]) => <div key={k} className="note__sec"><h4>{label}</h4><p>{n[k] || <span className="muted">Sin datos.</span>}</p></div>)}</>
}
