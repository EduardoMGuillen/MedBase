import type { Row, Sql } from './sql.js'
import { localDate } from './http.js'

/**
 * Ronda 8 (incongruencias): un paciente internado (en observación o hospitalizado) no está a la vez en la consulta
 * externa. Mientras tenga una estancia activa no se le marca la llegada ni entra sin cita; al ingresarlo, las citas de
 * consulta externa que tenía abiertas ese día (agendada, confirmada, en sala o con preclínica) se cancelan. La cita que
 * originó el ingreso ya quedó «Atendida» y no se toca.
 */

/** Estados de una cita que todavía no se atiende. */
export const OPEN_VISIT = ['scheduled', 'confirmed', 'arrived', 'triaged'] as const

/** La estancia activa del paciente, si tiene. */
export async function activeStayOf(q: Sql, clinicId: string, patientId: string): Promise<Row | undefined> {
  return q.one(`SELECT id, kind, admitted_at, observation_at FROM hospitalizations WHERE clinic_id = ? AND patient_id = ? AND status = 'active' ORDER BY admitted_at DESC LIMIT 1`,
    [clinicId, patientId])
}

/** Mensaje para quien intenta pasarlo a la consulta externa. */
export const stayConflictMessage = (name: string, kind: unknown) =>
  `${name} está ${kind === 'observation' ? 'en observación' : 'hospitalizado'}. Mientras esté internado no pasa a la consulta externa: se atiende desde su expediente.`

/**
 * Cancela las citas abiertas del paciente desde `since` (la fecha local del ingreso) hasta el final de hoy. Devuelve
 * cuántas cerró.
 */
export async function closeOpenVisits(q: Sql, clinicId: string, patientId: string, since: Date | string, now = new Date()) {
  const from = localDate(new Date(since))
  const to = `${localDate(now)}T99`
  const rows = await q.query(`UPDATE appointments SET status = 'cancelled' WHERE clinic_id = ? AND patient_id = ? AND status IN (${OPEN_VISIT.map(() => '?').join(',')})
    AND start >= ? AND start < ? RETURNING id`, [clinicId, patientId, ...OPEN_VISIT, from, to])
  return rows.length
}

/**
 * Corrige lo que ya quedó incongruente (v57): para cada estancia activa, las citas del paciente abiertas desde el día del
 * ingreso hasta hoy pasan a canceladas. Idempotente. Devuelve cuántas cerró en total.
 */
export async function closeVisitsOfInpatients(q: Sql, now = new Date()) {
  let n = 0
  for (const h of await q.query(`SELECT clinic_id, patient_id, COALESCE(observation_at, admitted_at) AS since FROM hospitalizations WHERE status = 'active'`)) {
    n += await closeOpenVisits(q, String(h.clinic_id), String(h.patient_id), String(h.since), now)
  }
  return n
}
