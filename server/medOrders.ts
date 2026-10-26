import { randomUUID } from 'node:crypto'
import type { Sql } from './sql.js'
import { durationDays, frequencyHours } from '../src/lib/inpatient.js'
import { normalize } from '../src/lib/patients.js'
import type { PrescriptionItem } from '../src/lib/types.js'

/**
 * Órdenes de medicamento de una estancia (hospitalización u observación).
 *
 * `hosp_meds` es la única fuente de verdad de la hoja de medicamentos: la hoja sólo lee de ahí y las notas no
 * copian medicamentos por su cuenta. Toda orden se crea con `createMedOrders`, venga de la nota de consulta
 * externa que ingresó al paciente, de un ingreso rehecho o de una nota de evolución u observación. Cada orden
 * guarda su origen (`source`, `source_id`, `source_index`) y un índice único sobre ese origen hace que firmar o
 * guardar dos veces la misma nota, o volver a jalar la misma consulta, no la duplique.
 */

export interface OrderInput {
  drug: string
  presentation?: string
  dose: string
  route: string
  everyHours?: number
  prn: boolean
  firstAt: string
  instructions?: string
  /** Vacío: hasta nueva orden. */
  days?: number
  replacesId?: string
}

/** Un medicamento de la consulta externa como orden de la hoja: "Cada 8 horas" → cada 8 h; "3 días" → 3. */
export function orderFromItem(it: PrescriptionItem, firstAt: string): OrderInput {
  return {
    drug: it.drug, presentation: it.presentation || undefined, dose: it.dose, route: it.route || 'Oral',
    everyHours: frequencyHours(it.frequency), prn: /necesidad|prn/i.test(it.frequency), firstAt,
    instructions: it.instructions || undefined, days: durationDays(it.duration),
  }
}

/**
 * Crea las órdenes de una nota en la hoja. `source_index` es la posición del medicamento en su nota, así que
 * repetir la llamada no crea nada nuevo. Con `skipActive` tampoco se agrega un fármaco que ya está activo en
 * la estancia (al jalar una consulta hacia una estancia que ya tiene sus medicamentos). Devuelve cuántas creó.
 */
export async function createMedOrders(q: Sql, o: {
  clinicId: string; hospitalizationId: string; patientId: string; source: 'consultation' | 'note'; sourceId: string
  orderedBy: string; orderedAt: string; items: (OrderInput | null)[]; skipActive?: boolean
}) {
  const active = o.skipActive
    ? new Set((await q.query('SELECT drug FROM hosp_meds WHERE hospitalization_id = ? AND stopped_at IS NULL', [o.hospitalizationId])).map((r) => normalize(String(r.drug))))
    : new Set<string>()
  let created = 0
  for (const [index, m] of o.items.entries()) {
    if (!m || active.has(normalize(m.drug))) continue
    const row = await q.one(`INSERT INTO hosp_meds (id, clinic_id, hospitalization_id, patient_id, note_id, source, source_id, source_index, drug, presentation, dose, route,
        every_hours, prn, first_at, instructions, days, replaces_id, ordered_by, ordered_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT (hospitalization_id, source_id, source_index) WHERE source_id IS NOT NULL AND source_index IS NOT NULL DO NOTHING RETURNING id`,
      [randomUUID(), o.clinicId, o.hospitalizationId, o.patientId, o.source === 'note' ? o.sourceId : null, o.source, o.sourceId, index, m.drug, m.presentation || null,
        m.dose, m.route, m.everyHours ?? null, m.prn, new Date(m.firstAt).toISOString(), m.instructions || null, m.days ?? null, m.replacesId ?? null, o.orderedBy, o.orderedAt])
    if (row) created++
  }
  return created
}

/** Medicamentos de una consulta que se aplican en la clínica. Las consultas anteriores a la v22 no los separaban: todos. */
export function clinicItemsOf(c: { meds?: unknown; admit_kind?: unknown }, rxItems: PrescriptionItem[]): (PrescriptionItem | null)[] {
  if (c.meds) {
    // La posición se conserva (null en los que van a la receta) para que el origen de cada orden sea estable
    return (JSON.parse(String(c.meds)) as PrescriptionItem[]).map((it) => (it.applyInClinic ? it : null))
  }
  return rxItems
}

/**
 * Jala a una estancia las órdenes de la consulta externa que la originó: al ingresar desde la consulta, al
 * rehacer un ingreso o al vincular uno que quedó sin su consulta. No duplica lo que ya está.
 */
export async function pullConsultationOrders(q: Sql, o: { clinicId: string; hospitalizationId: string; consultationId: string; orderedBy?: string }) {
  const c = await q.one('SELECT * FROM consultations WHERE id = ? AND clinic_id = ?', [o.consultationId, o.clinicId])
  const h = await q.one('SELECT * FROM hospitalizations WHERE id = ? AND clinic_id = ?', [o.hospitalizationId, o.clinicId])
  if (!c || !h) return 0
  const rx = c.prescription_id ? await q.one('SELECT items FROM prescriptions WHERE id = ?', [String(c.prescription_id)]) : undefined
  const items = clinicItemsOf(c, rx ? JSON.parse(String(rx.items)) as PrescriptionItem[] : [])
  // La primera dosis no puede ser antes de que empiece esta estancia
  const first = [String(c.date), String(h.admitted_at)].sort().at(-1)!
  return createMedOrders(q, {
    clinicId: o.clinicId, hospitalizationId: o.hospitalizationId, patientId: String(h.patient_id), source: 'consultation', sourceId: String(c.id),
    orderedBy: String(c.doctor_id), orderedAt: String(c.date), items: items.map((it) => (it ? orderFromItem(it, first) : null)), skipActive: true,
  })
}

/**
 * Consulta externa que dio el ingreso, para un ingreso hecho a mano (rehecho porque el primero estaba mal, o
 * hecho desde el tablero): la más reciente de las últimas 48 horas que marcó ingreso, o la que originó una
 * estancia del paciente cerrada en ese tiempo.
 */
export async function findAdmissionConsult(q: Sql, clinicId: string, patientId: string, now = new Date()) {
  const since = new Date(now.getTime() - 48 * 3_600_000).toISOString()
  const marked = await q.one(`SELECT id, date FROM consultations WHERE clinic_id = ? AND patient_id = ? AND admit_kind IS NOT NULL AND date >= ? ORDER BY date DESC LIMIT 1`,
    [clinicId, patientId, since])
  const previous = await q.one(`SELECT c.id, c.date FROM hospitalizations h JOIN consultations c ON c.id = h.consultation_id
    WHERE h.clinic_id = ? AND h.patient_id = ? AND h.status = 'discharged' AND h.discharged_at >= ? ORDER BY h.discharged_at DESC LIMIT 1`, [clinicId, patientId, since])
  const pick = [marked, previous].filter(Boolean).sort((a, b) => String(b!.date).localeCompare(String(a!.date)))[0]
  return pick ? String(pick.id) : undefined
}
