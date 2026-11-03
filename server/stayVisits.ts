import type { Row, Sql } from './sql.js'
import { localDate } from './http.js'
import { STAY_CANCEL_REASON, stayConflictText } from '../src/lib/inpatient.js'

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
  return q.one(`SELECT h.id, h.kind, h.admitted_at, h.observation_at, b.room, b.label FROM hospitalizations h LEFT JOIN beds b ON b.id = h.bed_id
    WHERE h.clinic_id = ? AND h.patient_id = ? AND h.status = 'active' ORDER BY h.admitted_at DESC LIMIT 1`, [clinicId, patientId])
}

/** CX2: mensaje para quien intenta pasarlo a la consulta externa (o agendarlo para hoy): dónde está y desde cuándo. */
export const stayConflictMessage = (stay: Row) => stayConflictText({
  kind: String(stay.kind), since: String(stay.observation_at ?? stay.admitted_at), room: stay.room ? `${stay.room}${stay.label ? `-${stay.label}` : ''}` : undefined,
})

/**
 * Cancela las citas abiertas del paciente desde `since` (la fecha local del ingreso) hasta el final de hoy. Devuelve
 * cuántas cerró.
 */
export async function closeOpenVisits(q: Sql, clinicId: string, patientId: string, since: Date | string, now = new Date()) {
  const from = localDate(new Date(since))
  const to = `${localDate(now)}T99`
  // CX2: con su motivo, autor «Sistema» y la hora; la cita no se borra y se puede reprogramar
  const rows = await q.query(`UPDATE appointments SET status = 'cancelled', cancel_reason = ?, cancelled_by = 'system', cancelled_at = ?
    WHERE clinic_id = ? AND patient_id = ? AND status IN (${OPEN_VISIT.map(() => '?').join(',')})
    AND start >= ? AND start < ? RETURNING id`, [STAY_CANCEL_REASON, now.toISOString(), clinicId, patientId, ...OPEN_VISIT, from, to])
  return rows.length
}

/**
 * Corrige lo que ya quedó incongruente (v57, y v58 con motivo y autor): para cada estancia activa, las citas del paciente
 * abiertas desde el día del ingreso hasta hoy pasan a canceladas. Idempotente: una cita cancelada ya no está abierta, así
 * que correrlo otra vez no cambia nada. Devuelve cuántas cerró en total.
 */
export async function closeVisitsOfInpatients(q: Sql, now = new Date()) {
  let n = 0
  for (const h of await q.query(`SELECT clinic_id, patient_id, COALESCE(observation_at, admitted_at) AS since FROM hospitalizations WHERE status = 'active'`)) {
    n += await closeOpenVisits(q, String(h.clinic_id), String(h.patient_id), String(h.since), now)
  }
  return n
}
