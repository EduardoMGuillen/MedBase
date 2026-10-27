import type { Express } from 'express'
import { z } from 'zod'
import { type Ctx, fail, parse } from '../http.js'
import { toEpicrisis } from '../mappers.js'
import { createEpicrisisDraft, missingForIssue } from '../epicrisis.js'
import type { EpicrisisData } from '../../src/lib/types.js'

/**
 * Epicrisis (P1). Al dar el alta en hospitalización se genera el borrador sola (routes/inpatient.ts, egreso); en
 * observación y en las altas anteriores se genera con el botón "Generar epicrisis". El médico revisa y corrige el texto
 * en la vista previa y la emite; emitida queda bloqueada. Para corregirla: anular con motivo, y se abre la versión
 * siguiente como borrador. Enfermería la ve y la reimprime; recepción no (tiene diagnósticos).
 */
export function registerEpicrisis(app: Express, { sql, auth, need, userOf, clinicOf, audit, patientName, staffRow }: Ctx) {
  const row = async (cid: string, id: string) =>
    (await sql.one('SELECT * FROM epicrises WHERE id = ? AND clinic_id = ?', [id, cid])) ?? fail(404, 'La epicrisis no existe.')

  app.post('/api/inpatient/:id/epicrisis', auth, need('inpatient.orders'), async (req, res) => {
    const user = userOf(req)
    const cid = clinicOf(req)
    const h = (await sql.one('SELECT * FROM hospitalizations WHERE id = ? AND clinic_id = ?', [String(req.params.id), cid])) ?? fail(404, 'La estancia no existe.')
    if (h!.status !== 'discharged') fail(409, 'La epicrisis se genera al dar el alta.')
    const current = await sql.one(`SELECT * FROM epicrises WHERE hospitalization_id = ? AND status <> 'voided' ORDER BY version DESC LIMIT 1`, [String(h!.id)])
    if (current) return res.json(toEpicrisis(current))
    const name = await patientName(String(h!.patient_id))
    let created
    await sql.tx(async (q) => {
      created = await createEpicrisisDraft(q, h!, user.id)
      await audit(user, `Generó la epicrisis (borrador) de ${name}`, q)
    })
    res.status(201).json(created)
  })

  app.get('/api/epicrisis/:id', auth, need('inpatient.view'), async (req, res) => {
    const r = await row(clinicOf(req), String(req.params.id))
    await audit(userOf(req), `Consultó la epicrisis de ${await patientName(String(r.patient_id))}`)
    res.json(toEpicrisis(r))
  })

  /** Las epicrisis del paciente (todas sus estancias), para su historial en la Biblioteca. */
  app.get('/api/patients/:id/epicrises', auth, need('inpatient.view'), async (req, res) => {
    const rows = await sql.query('SELECT * FROM epicrises WHERE patient_id = ? AND clinic_id = ? ORDER BY created_at DESC', [String(req.params.id), clinicOf(req)])
    res.json(rows.map(toEpicrisis))
  })

  /** Corregir el borrador antes de emitir: textos, secciones agregadas que se quitan y laboratorios a incluir. */
  app.patch('/api/epicrisis/:id', auth, need('inpatient.orders'), async (req, res) => {
    const text = (max: number) => z.string().max(max).optional()
    const b = parse(z.object({
      hea: text(6000), evolution: text(8000), instructions: text(4000), followUp: text(500), condition: text(200),
      hidden: z.array(z.enum(['procedures', 'dischargeDx', 'labs', 'condition'])).optional(),
      labIds: z.array(z.string()).max(60).optional(),
    }).strict(), req.body, 'Sólo se corrigen los textos, las secciones agregadas y los laboratorios.')
    const user = userOf(req)
    const cid = clinicOf(req)
    const r = await row(cid, String(req.params.id))
    if (r.status !== 'draft') fail(409, 'La epicrisis ya se emitió: no se edita. Para corregirla, anúlala con el motivo y se abre una versión nueva.')
    const data = JSON.parse(String(r.data)) as EpicrisisData
    if (b.labIds && b.labIds.some((x) => !data.labs.some((l) => l.id === x))) fail(400, 'Ese laboratorio no es de esta estancia.')
    const next: EpicrisisData = { ...data, ...b, condition: b.condition === undefined ? data.condition : b.condition.trim() || undefined, followUp: b.followUp === undefined ? data.followUp : b.followUp.trim() || undefined }
    await sql.run('UPDATE epicrises SET data = ?, updated_by = ?, updated_at = ? WHERE id = ?', [JSON.stringify(next), user.id, new Date().toISOString(), String(r.id)])
    res.json(toEpicrisis((await row(cid, String(r.id)))))
  })

  /** Emitir: se estampan el nombre, la colegiación y la firma guardada del médico, y queda bloqueada. */
  app.post('/api/epicrisis/:id/issue', auth, need('inpatient.orders'), async (req, res) => {
    const user = userOf(req)
    const cid = clinicOf(req)
    const r = await row(cid, String(req.params.id))
    if (r.status !== 'draft') fail(409, 'Esta epicrisis ya se emitió o se anuló.')
    const data = JSON.parse(String(r.data)) as EpicrisisData
    const missing = missingForIssue(data)
    if (missing.length) fail(400, `Antes de emitir, escribe ${missing.join(', ')}.`)
    const me = (await staffRow(user.id))!
    data.doctor = { name: String(me.name), license: me.license ? String(me.license) : undefined, signature: me.signature ? String(me.signature) : undefined }
    const now = new Date().toISOString()
    await sql.run(`UPDATE epicrises SET status = 'issued', data = ?, issued_by = ?, issued_at = ? WHERE id = ?`, [JSON.stringify(data), user.id, now, String(r.id)])
    await audit(user, `Emitió la epicrisis${Number(r.version) > 1 ? ` (versión ${r.version})` : ''} de ${await patientName(String(r.patient_id))}`)
    res.json(toEpicrisis((await row(cid, String(r.id)))))
  })

  /** Anular una emitida (con motivo): se abre la versión siguiente como borrador, con el mismo contenido para corregirlo. */
  app.post('/api/epicrisis/:id/void', auth, need('inpatient.orders'), async (req, res) => {
    const { reason } = parse(z.object({ reason: z.string().trim().min(5, 'Escribe el motivo de la anulación.').max(300) }), req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    const r = await row(cid, String(req.params.id))
    if (r.status !== 'issued') fail(409, 'Sólo se anula una epicrisis emitida. El borrador se corrige directamente.')
    const h = (await sql.one('SELECT * FROM hospitalizations WHERE id = ?', [String(r.hospitalization_id)]))!
    const name = await patientName(String(r.patient_id))
    const { doctor: _doctor, ...data } = JSON.parse(String(r.data)) as EpicrisisData
    void _doctor
    let next
    await sql.tx(async (q) => {
      await q.run(`UPDATE epicrises SET status = 'voided', voided_by = ?, voided_at = ?, void_reason = ? WHERE id = ?`, [user.id, new Date().toISOString(), reason, String(r.id)])
      next = await createEpicrisisDraft(q, h, user.id, String(r.id), data)
      await audit(user, `Anuló la epicrisis (versión ${r.version}) de ${name}: ${reason}`, q)
    })
    res.json(next)
  })
}
