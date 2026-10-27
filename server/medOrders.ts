import { randomUUID } from 'node:crypto'
import type { Row, Sql } from './sql.js'
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

/**
 * Medicamentos de la consulta de origen que van a la hoja de una estancia. En una hospitalización van todos
 * (incluidos los que se escribieron "por 3 días" como para la casa); en una observación que salió de una
 * consulta ambulatoria, sólo los marcados "Aplicar en la clínica" (con "Ingreso a observación" quedan todos
 * marcados al firmar). Las consultas anteriores a la v22 no guardaban la marca: van todos los de su receta.
 * La posición se conserva (null en los que no van) para que el origen de cada orden sea estable.
 */
export function stayItemsOf(c: { meds?: unknown }, rxItems: PrescriptionItem[], stayKind: string): (PrescriptionItem | null)[] {
  if (!c.meds) return rxItems
  const items = JSON.parse(String(c.meds)) as PrescriptionItem[]
  return items.map((it) => (stayKind === 'hospital' || it.applyInClinic ? it : null))
}

/** Lo que falta en la hoja de una estancia respecto de su consulta de origen (para sincronizar, rellenar o comprobar). */
export async function missingStayOrders(q: Sql, h: Row) {
  if (!h.consultation_id) return { consult: undefined, missing: [] as { index: number; item: PrescriptionItem }[] }
  const c = await q.one('SELECT * FROM consultations WHERE id = ? AND clinic_id = ?', [String(h.consultation_id), String(h.clinic_id)])
  if (!c) return { consult: undefined, missing: [] }
  const rx = c.prescription_id ? await q.one('SELECT items FROM prescriptions WHERE id = ?', [String(c.prescription_id)]) : undefined
  const items = stayItemsOf(c, rx ? JSON.parse(String(rx.items)) as PrescriptionItem[] : [], String(h.kind ?? 'hospital'))
  const have = await q.query('SELECT source_id, source_index, drug, stopped_at FROM hosp_meds WHERE hospitalization_id = ?', [String(h.id)])
  const fromConsult = new Set(have.filter((m) => m.source_id === c.id).map((m) => Number(m.source_index)))
  // Un mismo fármaco ya activo (por ejemplo, indicado otra vez en una nota) tampoco se duplica
  const active = new Set(have.filter((m) => !m.stopped_at).map((m) => normalize(String(m.drug))))
  const missing = items.flatMap((item, index) => (item && !fromConsult.has(index) && !active.has(normalize(item.drug)) ? [{ index, item }] : []))
  return { consult: c, missing }
}

/**
 * La función única que crea (o completa) las órdenes de medicamento de una estancia a partir de la consulta
 * externa que la originó. La usan todas las rutas que crean o mueven una estancia: firmar la consulta con ingreso
 * a observación u hospitalización, "Pasar a hospitalización", el ingreso hecho a mano y el relleno de datos.
 * Es idempotente: lo que ya está no se vuelve a crear. La primera dosis no es anterior a `firstNotBefore` (por
 * defecto, la llegada a la unidad): no hay dosis "atrasadas" de antes de que el paciente llegara.
 */
export async function syncStayOrders(q: Sql, o: { clinicId: string; hospitalizationId: string; firstNotBefore?: string }) {
  const h = await q.one('SELECT * FROM hospitalizations WHERE id = ? AND clinic_id = ?', [o.hospitalizationId, o.clinicId])
  if (!h) return 0
  const { consult: c, missing } = await missingStayOrders(q, h)
  if (!c || !missing.length) return 0
  const first = [String(c.date), String(h.admitted_at), o.firstNotBefore ?? ''].sort().at(-1)!
  const items: (OrderInput | null)[] = []
  for (const { index, item } of missing) items[index] = orderFromItem(item, first)
  return createMedOrders(q, {
    clinicId: o.clinicId, hospitalizationId: String(h.id), patientId: String(h.patient_id), source: 'consultation', sourceId: String(c.id),
    orderedBy: String(c.doctor_id), orderedAt: String(c.date), items: Array.from(items, (x) => x ?? null),
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

export interface BackfillLine { clinicId: string; hospitalizationId: string; patientId: string; patient: string; kind: string; drug: string; consultationId: string }

/**
 * Relleno de órdenes faltantes en las estancias activas (observación y hospitalización): las que su consulta de
 * origen indicó y no están en la hoja. Con `dryRun` sólo lista lo que haría. Nunca modifica órdenes existentes.
 * La primera dosis de lo que se crea es "ahora": no se marcan como atrasadas dosis que nadie pudo ver.
 */
export async function backfillMissingOrders(q: Sql, o: { dryRun: boolean; now?: string }) {
  const stays = await q.query(`SELECT h.*, p.first_name, p.last_name FROM hospitalizations h JOIN patients p ON p.id = h.patient_id WHERE h.status = 'active' ORDER BY h.admitted_at`)
  const lines: BackfillLine[] = []
  for (const h of stays) {
    const { consult, missing } = await missingStayOrders(q, h)
    if (!consult || !missing.length) continue
    for (const { item } of missing) {
      lines.push({ clinicId: String(h.clinic_id), hospitalizationId: String(h.id), patientId: String(h.patient_id), patient: `${h.first_name} ${h.last_name}`,
        kind: String(h.kind), drug: item.drug, consultationId: String(consult.id) })
    }
    if (!o.dryRun) await syncStayOrders(q, { clinicId: String(h.clinic_id), hospitalizationId: String(h.id), firstNotBefore: o.now ?? new Date().toISOString() })
  }
  return lines
}

/** Comprobación: para cada estancia activa, los medicamentos de su consulta de origen que no están en la hoja. Vacío = todo en orden. */
export const checkStayOrders = (q: Sql) => backfillMissingOrders(q, { dryRun: true })
