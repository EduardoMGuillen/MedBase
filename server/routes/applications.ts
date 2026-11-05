import type { Express } from 'express'
import { z } from 'zod'
import { type Ctx, fail, parse, type Row } from '../http.js'
import type { ConsultApplication } from '../../src/lib/types.js'

export const toApplication = (r: Row): ConsultApplication => ({
  id: String(r.id), consultationId: String(r.consultation_id), patientId: String(r.patient_id), itemIndex: Number(r.item_index),
  drug: String(r.drug), orderText: String(r.order_text), orderedBy: String(r.ordered_by), orderedAt: String(r.ordered_at),
  status: String(r.status) as ConsultApplication['status'], appliedAt: r.applied_at ? String(r.applied_at) : undefined,
  reason: r.reason ? String(r.reason) : undefined, recordedBy: r.recorded_by ? String(r.recorded_by) : undefined, recordedAt: r.recorded_at ? String(r.recorded_at) : undefined,
  appointmentId: r.appointment_id ? String(r.appointment_id) : undefined,
})

/** Las aplicaciones de una o varias consultas (para la tarjeta de la consulta y el expediente). */
export async function applicationsOf(sql: Ctx['sql'], clinicId: string, consultationIds: string[]) {
  if (!consultationIds.length) return []
  return (await sql.query(`SELECT * FROM consult_applications WHERE clinic_id = ? AND consultation_id IN (${consultationIds.map(() => '?').join(',')}) ORDER BY item_index`,
    [clinicId, ...consultationIds])).map(toApplication)
}

/**
 * ME13 (ronda 14): «Aplicar en la clínica» de la consulta externa sin ingreso. Al firmar, cada medicamento queda «Por aplicar»
 * (consult_applications). Enfermería o el médico (en Consultorio, la titular o su asistente) registran «Aplicado» con la hora
 * y quién, o «No aplicado» con un motivo. Una vez registrado no se cambia aquí. Todo queda en la bitácora.
 */
export function registerApplications(app: Express, { sql, auth, need, userOf, clinicOf, audit, patientName }: Ctx) {
  // Consulta externa: las de un rango (el día de hoy en la pantalla), con la cita de su consulta
  app.get('/api/applications', auth, need('inpatient.care', 'inpatient.orders'), async (req, res) => {
    const q = parse(z.object({ from: z.string().min(10), to: z.string().min(10) }), req.query, 'Elige un rango de fechas.')
    const rows = await sql.query(`SELECT a.*, c.appointment_id FROM consult_applications a JOIN consultations c ON c.id = a.consultation_id
      WHERE a.clinic_id = ? AND a.ordered_at >= ? AND a.ordered_at < ? ORDER BY a.ordered_at, a.item_index`, [clinicOf(req), q.from, q.to])
    res.json(rows.map(toApplication))
  })

  app.post('/api/applications/:id', auth, need('inpatient.care', 'inpatient.orders'), async (req, res) => {
    const b = parse(z.object({
      status: z.enum(['applied', 'not_applied']),
      appliedAt: z.string().optional(),
      reason: z.string().trim().max(300).optional(),
    }), req.body)
    const cid = clinicOf(req)
    const user = userOf(req)
    const row = (await sql.one('SELECT * FROM consult_applications WHERE id = ? AND clinic_id = ?', [String(req.params.id), cid])) ?? fail(404, 'El medicamento no existe.')
    if (row!.status !== 'pending') fail(409, `${row!.drug} ya está registrado como ${row!.status === 'applied' ? 'aplicado' : 'no aplicado'}.`)
    const now = new Date()
    let at: string | null = null
    if (b.status === 'applied') {
      const t = b.appliedAt ? new Date(b.appliedAt) : now
      if (Number.isNaN(t.getTime())) fail(400, 'La hora no es válida.')
      if (t.getTime() > now.getTime() + 5 * 60_000) fail(400, 'La hora de aplicación no puede ser futura.')
      if (t.getTime() < new Date(String(row!.ordered_at)).getTime() - 60_000) fail(400, 'La hora de aplicación es anterior a la indicación.')
      at = t.toISOString()
    } else if (!b.reason || b.reason.length < 3) fail(400, 'Escribe o elige el motivo por el que no se aplicó.')
    const who = await patientName(String(row!.patient_id))
    await sql.tx(async (q) => {
      const done = await q.one(`UPDATE consult_applications SET status = ?, applied_at = ?, reason = ?, recorded_by = ?, recorded_at = ? WHERE id = ? AND status = 'pending' RETURNING id`,
        [b.status, at, b.status === 'not_applied' ? b.reason! : null, user.id, now.toISOString(), String(row!.id)])
      if (!done) fail(409, 'Alguien más ya lo registró.')
      await audit(user, b.status === 'applied' ? `Registró aplicado ${String(row!.order_text)} a ${who}` : `Registró no aplicado ${String(row!.drug)} a ${who}: ${b.reason}`,
        q, String(row!.patient_id))
    })
    res.json(toApplication((await sql.one('SELECT * FROM consult_applications WHERE id = ?', [String(row!.id)]))!))
  })
}
