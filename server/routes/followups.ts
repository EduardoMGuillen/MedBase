import type { Express } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { type Ctx, fail, localDate, parse } from '../http.js'
import { toFollowup } from '../mappers.js'
import type { Sql } from '../sql.js'
import { addDays, FOLLOWUP_KIND } from '../../src/lib/followups.js'

/** Lo que el médico programa: control de un crónico, un recordatorio o un procedimiento. */
export const followupInput = z.object({
  kind: z.enum(['chronic', 'reminder', 'procedure']),
  title: z.string().trim().min(3, 'Escribe el motivo del seguimiento.').max(200),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elige la fecha del seguimiento.'),
  everyDays: z.number().int().min(7, 'El control debe repetirse al menos cada 7 días.').max(730).optional(),
  notes: z.string().trim().max(500).optional(),
}).refine((f) => f.kind !== 'chronic' || f.everyDays, 'Indica cada cuánto se repite el control del paciente crónico.')

/**
 * Registra los avisos que ya tocaban: una semana antes, un día antes y el día del control.
 * El día del control recepción ve al paciente en su inicio para llamarlo.
 */
export async function sweepFollowupReminders(sql: Sql, clinicId: string) {
  const today = localDate(new Date())
  const horizon = addDays(today, 7)
  const eve = addDays(today, 1)
  const now = new Date().toISOString()
  const rows = await sql.query(
    `SELECT id, due_date, reminded_week, reminded_eve, reminded_day FROM followups
     WHERE clinic_id = ? AND active AND due_date <= ? AND (reminded_week IS NULL OR reminded_eve IS NULL OR reminded_day IS NULL)`,
    [clinicId, horizon])
  for (const f of rows) {
    const due = String(f.due_date)
    const sets: string[] = []
    const vals: string[] = []
    if (!f.reminded_week) { sets.push('reminded_week = ?'); vals.push(now) }
    if (!f.reminded_eve && due <= eve) { sets.push('reminded_eve = ?'); vals.push(now) }
    if (!f.reminded_day && due <= today) { sets.push('reminded_day = ?'); vals.push(now) }
    if (sets.length) await sql.run(`UPDATE followups SET ${sets.join(', ')} WHERE id = ?`, [...vals, String(f.id)])
  }
}

export async function insertFollowup(q: Sql, clinicId: string, userId: string, f: z.infer<typeof followupInput> & { patientId: string }) {
  const id = randomUUID()
  await q.run(`INSERT INTO followups (id, clinic_id, patient_id, kind, title, due_date, every_days, notes, created_by, created_at, active) VALUES (?,?,?,?,?,?,?,?,?,?,TRUE)`,
    [id, clinicId, f.patientId, f.kind, f.title, f.dueDate, f.kind === 'chronic' ? f.everyDays ?? null : null, f.notes || null, userId, new Date().toISOString()])
  return id
}

/**
 * Pacientes crónicos, recordatorios y procedimientos programados. El envío por WhatsApp es una
 * simulación: sólo registra que se "envió" para poder probar el flujo antes de contratar la API oficial.
 */
export function registerFollowups(app: Express, { sql, auth, need, userOf, clinicOf, audit, patientRow, patientName }: Ctx) {
  const row = async (cid: string, id: string) => (await sql.one('SELECT * FROM followups WHERE id = ? AND clinic_id = ?', [id, cid])) ?? fail(404, 'El seguimiento no existe.')

  app.post('/api/followups', auth, need('followups.manage'), async (req, res) => {
    const f = parse(followupInput.and(z.object({ patientId: z.string().min(1, 'Elige un paciente.') })), req.body)
    const cid = clinicOf(req)
    ;(await patientRow(cid, f.patientId)) ?? fail(404, 'El paciente no existe.')
    const id = await insertFollowup(sql, cid, userOf(req).id, f)
    await audit(userOf(req), `Programó ${FOLLOWUP_KIND[f.kind].label.toLowerCase()} "${f.title}" para ${await patientName(f.patientId)}`)
    res.status(201).json(toFollowup((await row(cid, id))!))
  })

  app.post('/api/followups/:id/notify', auth, need('followups.view'), async (req, res) => {
    const cid = clinicOf(req)
    const f = await row(cid, String(req.params.id))
    if (!f!.active) fail(409, 'Este seguimiento ya no está activo.')
    await sql.run('UPDATE followups SET notified_at = ? WHERE id = ?', [new Date().toISOString(), String(f!.id)])
    await audit(userOf(req), `Simuló el envío por WhatsApp del seguimiento "${f!.title}" a ${await patientName(String(f!.patient_id))}`)
    res.json(toFollowup((await row(cid, String(f!.id)))!))
  })

  // El paciente volvió: un crónico pasa a su siguiente control; lo demás se cierra
  app.post('/api/followups/:id/done', auth, need('followups.view'), async (req, res) => {
    const cid = clinicOf(req)
    const f = await row(cid, String(req.params.id))
    if (!f!.active) fail(409, 'Este seguimiento ya no está activo.')
    if (f!.kind === 'chronic') {
      const today = localDate(new Date())
      const next = addDays(today, Number(f!.every_days))
      await sql.run('UPDATE followups SET due_date = ?, notified_at = NULL, reminded_week = NULL, reminded_eve = NULL, reminded_day = NULL WHERE id = ?', [next, String(f!.id)])
      await audit(userOf(req), `Registró el control de "${f!.title}" de ${await patientName(String(f!.patient_id))}; el siguiente es el ${next}`)
    } else {
      await sql.run('UPDATE followups SET done_at = ?, active = FALSE WHERE id = ?', [new Date().toISOString(), String(f!.id)])
      await audit(userOf(req), `Completó el seguimiento "${f!.title}" de ${await patientName(String(f!.patient_id))}`)
    }
    res.json(toFollowup((await row(cid, String(f!.id)))!))
  })

  app.patch('/api/followups/:id', auth, need('followups.manage'), async (req, res) => {
    const cid = clinicOf(req)
    const f = await row(cid, String(req.params.id))
    const b = parse(z.object({
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      everyDays: z.number().int().min(7).max(730).optional(),
      active: z.literal(false).optional(),
    }), req.body)
    await sql.run('UPDATE followups SET due_date = COALESCE(?, due_date), every_days = COALESCE(?, every_days), active = COALESCE(?, active) WHERE id = ?',
      [b.dueDate ?? null, b.everyDays ?? null, b.active ?? null, String(f!.id)])
    await audit(userOf(req), `${b.active === false ? 'Quitó' : 'Actualizó'} el seguimiento "${f!.title}" de ${await patientName(String(f!.patient_id))}`)
    res.json(toFollowup((await row(cid, String(f!.id)))!))
  })
}
