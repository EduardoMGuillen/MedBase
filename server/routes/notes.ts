import type { Express, Request, Response } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { type Ctx, fail, parse, type Row } from '../http.js'
import { can } from '../../src/lib/permissions.js'
import type { Addendum } from '../../src/lib/types.js'

/** Qué se guarda como borrador mientras se escribe (una consulta, una nota de evolución, de procedimiento, de egreso o de enfermería). */
const SCOPES = ['consulta', 'evolucion', 'procedimiento', 'egreso', 'enfermeria'] as const
const KIND_LABEL = { correction: 'corrección', info: 'información adicional', result: 'resultado posterior' } as const

export const toAddendum = (r: Row): Addendum => ({
  id: String(r.id), targetKind: r.target_kind as Addendum['targetKind'], targetId: String(r.target_id), kind: r.kind as Addendum['kind'],
  corrects: r.corrects ? String(r.corrects) : undefined, text: String(r.text), authorId: String(r.author_id), authorRole: r.author_role ? String(r.author_role) : undefined, at: String(r.at),
})

/** Adendas de varias notas o consultas, en orden cronológico. */
export async function addendaFor(sql: Ctx['sql'], clinicId: string, ids: string[]) {
  if (!ids.length) return []
  const rows = await sql.query(`SELECT * FROM addenda WHERE clinic_id = ? AND target_id IN (${ids.map(() => '?').join(',')}) ORDER BY at`, [clinicId, ...ids])
  return rows.map(toAddendum)
}

/**
 * AN1. Borrador: mientras el médico (o enfermería) escribe, la nota se guarda sola en el servidor cada pocos segundos
 * (y en el navegador al instante); sobrevive a recargar y a cerrar el navegador. Firmada: inmutable (lo garantiza la
 * base con un trigger). Una corrección o un dato nuevo va como adenda, firmada e inmutable, debajo de la original.
 */
export function registerNotes(app: Express, { sql, auth, need, userOf, clinicOf, audit, patientName }: Ctx) {
  const scope = z.enum(SCOPES)

  app.get('/api/drafts/:scope/:ref', auth, async (req, res) => {
    const s = parse(scope, req.params.scope, 'Borrador no válido.')
    const r = await sql.one('SELECT data, updated_at FROM note_drafts WHERE user_id = ? AND scope = ? AND ref_id = ?', [userOf(req).id, s, String(req.params.ref)])
    res.json(r ? { data: JSON.parse(String(r.data)), updatedAt: String(r.updated_at) } : null)
  })

  app.put('/api/drafts/:scope/:ref', auth, async (req, res) => {
    const s = parse(scope, req.params.scope, 'Borrador no válido.')
    const user = userOf(req)
    const data = JSON.stringify(req.body?.data ?? {})
    if (data.length > 150_000) fail(413, 'El borrador es demasiado grande.')
    const at = new Date().toISOString()
    await sql.run(`INSERT INTO note_drafts (id, clinic_id, user_id, scope, ref_id, data, updated_at) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT (user_id, scope, ref_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`, [randomUUID(), clinicOf(req), user.id, s, String(req.params.ref), data, at])
    res.json({ updatedAt: at })
  })

  app.delete('/api/drafts/:scope/:ref', auth, async (req, res) => {
    const s = parse(scope, req.params.scope, 'Borrador no válido.')
    await sql.run('DELETE FROM note_drafts WHERE user_id = ? AND scope = ? AND ref_id = ?', [userOf(req).id, s, String(req.params.ref)])
    res.json({ ok: true })
  })

  // Una nota firmada no se edita: el intento queda en la bitácora
  const refuse = (what: string) => async (req: Request, res: Response) => {
    const user = userOf(req)
    const cid = clinicOf(req)
    const row = what === 'consulta'
      ? await sql.one('SELECT patient_id FROM consultations WHERE id = ? AND clinic_id = ?', [String(req.params.id), cid])
      : await sql.one('SELECT h.patient_id FROM hosp_notes n JOIN hospitalizations h ON h.id = n.hospitalization_id WHERE n.id = ? AND n.clinic_id = ?', [String(req.params.id), cid])
    if (!row) fail(404, 'La nota no existe.')
    await audit(user, `Intentó editar una ${what === 'consulta' ? 'consulta' : 'nota'} firmada de ${await patientName(String(row!.patient_id))}; se rechazó (la nota firmada no se edita)`)
    res.status(409).json({ error: 'La nota está firmada y no se puede editar. Para corregir o agregar algo, escribe una adenda.' })
  }
  app.patch('/api/consultations/:id', auth, refuse('consulta'))
  app.put('/api/consultations/:id', auth, refuse('consulta'))
  app.patch('/api/inpatient/notes/:id', auth, refuse('nota'))
  app.put('/api/inpatient/notes/:id', auth, refuse('nota'))

  /**
   * Adenda. Notas médicas (consulta, ingreso, evolución, procedimiento, egreso): cualquier médico de la clínica (queda su
   * nombre). Notas de enfermería: enfermería (cualquier enfermera); un médico sólo como «Información adicional».
   */
  app.post('/api/addenda', auth, need('consult.write', 'inpatient.orders', 'inpatient.care'), async (req, res) => {
    const b = parse(z.object({
      targetKind: z.enum(['consultation', 'note']),
      targetId: z.string().min(1),
      kind: z.enum(['correction', 'info', 'result'], { error: 'Elige el tipo de adenda.' }),
      corrects: z.string().trim().max(200).optional(),
      text: z.string().trim().min(3, 'Escribe el texto de la adenda.').max(6000),
    }), req.body)
    if (b.kind === 'correction' && !(b.corrects && b.corrects.length >= 3)) fail(400, 'Escribe brevemente qué se corrige.')
    const user = userOf(req)
    const cid = clinicOf(req)
    let patientId = ''
    let what = ''
    if (b.targetKind === 'consultation') {
      const c = (await sql.one('SELECT patient_id FROM consultations WHERE id = ? AND clinic_id = ?', [b.targetId, cid])) ?? fail(404, 'La consulta no existe.')
      if (user.role !== 'doctor' || !can(user, 'consult.write')) fail(403, 'Sólo un médico agrega adendas a una consulta.')
      patientId = String(c!.patient_id); what = 'la consulta'
    } else {
      const n = (await sql.one('SELECT n.kind, h.patient_id FROM hosp_notes n JOIN hospitalizations h ON h.id = n.hospitalization_id WHERE n.id = ? AND n.clinic_id = ?', [b.targetId, cid])) ?? fail(404, 'La nota no existe.')
      patientId = String(n!.patient_id)
      if (n!.kind === 'nursing') {
        const nurse = can(user, 'inpatient.care') && user.role !== 'doctor'
        if (!nurse && !(user.role === 'doctor' && b.kind === 'info')) fail(403, 'A una nota de enfermería, el médico sólo agrega información adicional.')
        what = 'la nota de enfermería'
      } else {
        if (user.role !== 'doctor' || !can(user, 'inpatient.orders')) fail(403, 'Sólo un médico agrega adendas a una nota médica.')
        what = { admission: 'la nota de ingreso', evolution: 'la nota de evolución', procedure: 'la nota de procedimiento', discharge: 'la nota de egreso' }[String(n!.kind)] ?? 'la nota'
      }
    }
    const id = randomUUID()
    const at = new Date().toISOString()
    await sql.run('INSERT INTO addenda (id, clinic_id, target_kind, target_id, kind, corrects, text, author_id, author_role, at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [id, cid, b.targetKind, b.targetId, b.kind, b.kind === 'correction' ? b.corrects : null, b.text, user.id, user.role, at])
    await audit(user, `Agregó una adenda (${KIND_LABEL[b.kind]}) a ${what} de ${await patientName(patientId)}${b.corrects ? `: ${b.corrects}` : ''}`, sql, patientId)
    res.status(201).json(toAddendum((await sql.one('SELECT * FROM addenda WHERE id = ?', [id]))!))
  })

  app.get('/api/addenda', auth, need('chart.view'), async (req, res) => {
    const ids = String(req.query.ids ?? '').split(',').filter(Boolean).slice(0, 200)
    res.json(await addendaFor(sql, clinicOf(req), ids))
  })
}
