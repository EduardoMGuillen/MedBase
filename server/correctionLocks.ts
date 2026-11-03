import { time } from '../src/lib/format.js'
import type { Row } from './http.js'
import type { Sql } from './sql.js'
import { REMOVED_IN_GRACE } from '../src/lib/grace.js'

/**
 * GE4 (ronda 9): al corregir una nota en el periodo de gracia, lo que ya tuvo consecuencias no se toca. Esto calcula, renglón
 * por renglón, qué está bloqueado y por qué. El servidor lo usa al guardar y la ventana de corrección lo muestra.
 */
export { REMOVED_IN_GRACE }
export const PRINTED_EXAMS = 'Ya se imprimió la orden de exámenes. Corrígelo con una adenda.'

export interface OrderLocks {
  /** Toda la columna de órdenes queda como se firmó (con el motivo). */
  all?: string
  /** Medicamento → por qué no se cambia ni se quita. */
  meds: Record<string, string>
  /** Medicamentos que sí se corrigen pero no se quitan (cambian a otro: «Cambiar»). */
  keep: string[]
  /** Examen → por qué no se quita. */
  exams: Record<string, string>
}

const staffName = async (q: Sql, id: unknown) => (id ? String((await q.one('SELECT name FROM staff WHERE id = ?', [String(id)]))?.name ?? '—') : '—')

/** Medicamentos de la nota (los quitados al corregir ya no cuentan). */
export const noteMedRows = (q: Sql, noteId: string) =>
  q.query(`SELECT * FROM hosp_meds WHERE source = 'note' AND source_id = ? AND COALESCE(stop_reason, '') <> ? ORDER BY source_index`, [noteId, REMOVED_IN_GRACE])

/** Por qué no se toca un medicamento: ya tiene una dosis registrada o ya se suspendió. */
async function medLock(q: Sql, m: Row) {
  const d = await q.one('SELECT status, given_at, given_by FROM hosp_doses WHERE med_id = ? ORDER BY given_at LIMIT 1', [String(m.id)])
  if (d) {
    const who = await staffName(q, d.given_by)
    if (d.status === 'given') return `Ya fue administrado por ${who} a las ${time(String(d.given_at))}. Corrígelo con una adenda.`
    return `Ya lo marcó como ${d.status === 'omitted' ? 'omitido' : 'no aplicado'} ${who} a las ${time(String(d.given_at))}. Corrígelo con una adenda.`
  }
  if (m.stopped_at) return `Ya se suspendió a las ${time(String(m.stopped_at))}. Corrígelo con una adenda.`
  return undefined
}

/** Por qué no se quita un examen: ya se tomó la muestra (o se hizo el estudio) o su orden ya se imprimió. */
export async function examLock(q: Sql, e: Row) {
  if (e.status !== 'ordered') {
    const who = await staffName(q, e.status_by)
    const at = e.status_at ? ` a las ${time(String(e.status_at))}` : ''
    if (e.status === 'sample') return `Ya se tomó la muestra (${who}${at}). Corrígelo con una adenda.`
    return `Ya se realizó o tiene resultado (${who}${at}). Corrígelo con una adenda.`
  }
  if (await q.one('SELECT 1 FROM print_log WHERE target_kind = ? AND target_id = ? LIMIT 1', [`exam_${String(e.grp)}`, String(e.batch_id)])) return PRINTED_EXAMS
  return undefined
}

export async function noteOrderLocks(q: Sql, n: Row): Promise<OrderLocks> {
  const out: OrderLocks = { meds: {}, keep: [], exams: {} }
  const data = JSON.parse(String(n.data ?? '{}')) as { lines?: unknown[] }
  if (n.kind !== 'admission' && n.kind !== 'evolution') out.all = 'Esta nota no lleva órdenes.'
  else if (!Array.isArray(data.lines)) out.all = 'Las órdenes de esta nota no se corrigen aquí. Corrígelas con una adenda.'
  else {
    // La cadena (MC7) ya siguió desde otra nota: las órdenes se cambian en la siguiente
    const later = await q.one(`SELECT author_id FROM hosp_notes WHERE hospitalization_id = ? AND kind IN ('admission','evolution') AND id <> ? AND (at > ? OR (at = ? AND id > ?)) LIMIT 1`,
      [String(n.hospitalization_id), String(n.id), String(n.at), String(n.at), String(n.id)])
    if (later) out.all = `Ya se firmó otra nota después de esta (${await staffName(q, later.author_id)}). Cambia las órdenes en una nota nueva.`
    // Las marcas de enfermería van por número de renglón y no se reescriben: si hay alguna, la columna queda como se firmó
    const mark = await q.one('SELECT by_id, at FROM order_marks WHERE note_id = ? ORDER BY at LIMIT 1', [String(n.id)])
    if (!out.all && mark) out.all = `Ya las revisó ${await staffName(q, mark.by_id)} a las ${time(String(mark.at))}. Corrígelas con una adenda.`
  }
  for (const m of await noteMedRows(q, String(n.id))) {
    const why = await medLock(q, m)
    if (why) out.meds[String(m.id)] = why
    if (m.replaces_id) out.keep.push(String(m.id))
  }
  for (const e of await q.query(`SELECT * FROM exam_orders WHERE note_id = ? AND status <> 'cancelled'`, [String(n.id)])) {
    const why = await examLock(q, e)
    if (why) out.exams[String(e.id)] = why
  }
  return out
}
