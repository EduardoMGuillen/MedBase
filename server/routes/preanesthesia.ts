import express, { type Express, type Request } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { type Ctx, fail, parse, type Row } from '../http.js'
import { assertGrace, graceUntil, saveVersion } from '../grace.js'
import { can } from '../../src/lib/permissions.js'
import { ANESTHESIA_SHEET } from '../../src/lib/clinicalConfig.js'
import type { PreEval, PreEvalPrefill } from '../../src/lib/preanesthesia.js'
import type { AnesthesiaSigner } from '../../src/lib/anesthesia.js'
import type { Staff } from '../../src/lib/types.js'
import { canSheet, prefillOf } from './anesthesia.js'
import { assertPaperFile, j, paperBody, patientLabs, signerOf, staffIdIn } from '../surgicalDocs.js'

/**
 * PQ4 (ronda 16): «Valoración preanestésica», ligada a la estancia (no a la nota postquirúrgica), para escribirla ANTES de la
 * cirugía. Sección 4 del pedido:
 * - Ver, imprimir en blanco y subir en papel: quien atiende al paciente (médico y enfermería, como la hoja de PQ3).
 * - Escribir y firmar en el sistema: cualquier médico (sin exigir la especialidad); queda como anestesiólogo quien firma.
 * - Varias por estancia (se reprograma la cirugía): la vigente es la última firmada o subida sin anular.
 * - Nada se borra: la subida se reemplaza con motivo; la llenada se corrige en el periodo de gracia o con adenda.
 */
export const canWritePreEval = (u: Staff) => can(u, 'chart.view') && can(u, 'inpatient.orders')

const text = (max = 200) => z.string().trim().max(max).default('')
const pick = <T extends readonly string[]>(list: T) => z.string().refine((x) => x === '' || list.includes(x), 'Elige una opción de la lista.').default('')
export const preEvalInput = z.object({
  date: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Revisa la fecha.').default(''),
  weightKg: text(10), heightCm: text(10), scheduled: pick(ANESTHESIA_SHEET.scheduled), preDiagnosis: text(600), proposedSurgery: text(300),
  asa: pick(ANESTHESIA_SHEET.asa), asaE: z.boolean().default(false), mallampati: pick(ANESTHESIA_SHEET.mallampati), difficultAirway: pick(['Sí', 'No'] as const),
  allergies: text(300), fastingSolids: text(10), fastingLiquids: text(10), history: text(2000),
  labs: z.object({ hb: text(20), hto: text(20), plt: text(20), inr: text(20), glucose: text(20), bloodType: text(20) }).default({ hb: '', hto: '', plt: '', inr: '', glucose: '', bloodType: '' }),
  techniques: z.array(z.string().refine((x) => (ANESTHESIA_SHEET.techniques as readonly string[]).includes(x), 'Elige una opción de la lista.')).max(ANESTHESIA_SHEET.techniques.length).default([]),
  plan: text(3000),
}).superRefine((d, ctx) => { if (!d.asa) ctx.addIssue({ code: 'custom', message: 'Marca la clasificación ASA.' }) })

export const toPreEval = (r: Row): PreEval => ({
  id: String(r.id), hospitalizationId: String(r.hospitalization_id), patientId: String(r.patient_id), authorizationId: r.authorization_id ? String(r.authorization_id) : undefined,
  mode: r.mode as PreEval['mode'], performedBy: { name: String(r.performed_by_name), staffId: r.performed_by_id ? String(r.performed_by_id) : undefined },
  observation: r.observation ? String(r.observation) : undefined, fileId: r.file_id ? String(r.file_id) : undefined,
  data: r.mode === 'system' ? j(r.data, undefined) : undefined, signer: j<AnesthesiaSigner | undefined>(r.signer, undefined),
  createdBy: String(r.created_by), createdAt: String(r.created_at), version: Number(r.version ?? 1),
  graceUntil: r.mode === 'system' && !r.voided_at ? graceUntil(r.created_at) : undefined,
  voidedAt: r.voided_at ? String(r.voided_at) : undefined, voidedBy: r.voided_by ? String(r.voided_by) : undefined, voidReason: r.void_reason ? String(r.void_reason) : undefined,
  replacedBy: r.replaced_by ? String(r.replaced_by) : undefined,
})

/** La valoración vigente de la estancia: la última firmada o subida sin anular. */
export async function currentPreEval(sql: Ctx['sql'], stayId: string) {
  const r = await sql.one('SELECT * FROM preanesthesia_evals WHERE hospitalization_id = ? AND voided_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 1', [stayId])
  return r ? toPreEval(r) : null
}

export function registerPreanesthesia(app: Express, { sql, auth, userOf, clinicOf, audit, patientName }: Ctx) {
  const guard = (req: Request) => { const u = userOf(req); if (!canSheet(u)) fail(403, 'Sin permiso para la valoración preanestésica.'); return u }
  const stayOf = async (cid: string, id: string) => (await sql.one('SELECT * FROM hospitalizations WHERE id = ? AND clinic_id = ?', [id, cid])) ?? fail(404, 'La estancia no existe.')

  /** Lo que la valoración trae lleno: de la autorización quirúrgica elegida o la última de la estancia, y los laboratorios. */
  async function prefill(cid: string, h: Row, authId?: string): Promise<PreEvalPrefill & { authorizationId?: string }> {
    const a = authId
      ? (await sql.one('SELECT * FROM authorizations WHERE id = ? AND hospitalization_id = ?', [authId, String(h.id)])) ?? fail(404, 'La autorización no existe.')
      : await sql.one(`SELECT * FROM authorizations WHERE hospitalization_id = ? AND template IN ('surgical','procedure') AND archived_at IS NULL AND status IN ('pending','signed') ORDER BY created_at DESC LIMIT 1`, [String(h.id)])
    const base = await prefillOf(sql, cid, String(h.patient_id), { authorization: a ?? undefined, stayDx: h.diagnoses })
    return { ...base, labs: await patientLabs(sql, String(h.patient_id)), authorizationId: a ? String(a.id) : undefined }
  }
  const query = (req: Request) => (typeof req.query.autorizacion === 'string' && req.query.autorizacion ? req.query.autorizacion : undefined)

  /** Las valoraciones de la estancia (también las anuladas), de la más antigua a la más reciente, y si quien pregunta escribe. */
  app.get('/api/inpatient/:id/preanesthesia', auth, async (req, res) => {
    const u = guard(req)
    const h = await stayOf(clinicOf(req), String(req.params.id))
    const rows = await sql.query('SELECT * FROM preanesthesia_evals WHERE clinic_id = ? AND hospitalization_id = ? ORDER BY created_at, id', [clinicOf(req), String(h!.id)])
    res.json({ evals: rows.map(toPreEval), canWrite: canWritePreEval(u), open: h!.status === 'active', stayKind: String(h!.kind), patientId: String(h!.patient_id) })
  })

  /** «Escribir en el sistema»: lo que trae lleno. Solo un médico (también por URL directa). */
  app.get('/api/inpatient/:id/preanesthesia/prefill', auth, async (req, res) => {
    const u = guard(req)
    if (!canWritePreEval(u)) fail(403, 'La valoración preanestésica la escribe y la firma un médico. Puedes subirla en papel.')
    const cid = clinicOf(req)
    const h = await stayOf(cid, String(req.params.id))
    if (h!.status !== 'active') fail(409, 'La estancia ya terminó.')
    res.json({ prefill: await prefill(cid, h!, query(req)), hospitalizationId: String(h!.id), stayKind: String(h!.kind) })
  })

  /** IM1: la valoración en blanco (una hoja Carta) con los datos que ya hay. */
  app.get('/api/inpatient/:id/preanesthesia/blank', auth, async (req, res) => {
    const u = guard(req)
    const cid = clinicOf(req)
    const h = await stayOf(cid, String(req.params.id))
    const pre = await prefill(cid, h!, query(req))
    await audit(u, `Imprimió la valoración preanestésica en blanco de ${await patientName(String(h!.patient_id))}${pre.surgeryProposed ? ` («${pre.surgeryProposed}»)` : ''}`, sql, String(h!.patient_id))
    res.json({ prefill: pre, hospitalizationId: String(h!.id), stayKind: String(h!.kind) })
  })

  /** Ver o imprimir una valoración. */
  app.get('/api/preanesthesia/:id', auth, async (req, res) => {
    const u = guard(req)
    const cid = clinicOf(req)
    const r = (await sql.one('SELECT * FROM preanesthesia_evals WHERE id = ? AND clinic_id = ?', [String(req.params.id), cid])) ?? fail(404, 'La valoración no existe.')
    const h = await stayOf(cid, String(r!.hospitalization_id))
    await audit(u, `Abrió la valoración preanestésica de ${await patientName(String(r!.patient_id))}`, sql, String(r!.patient_id))
    res.json({ eval: toPreEval(r!), stayKind: String(h!.kind), prefill: await prefillOf(sql, cid, String(r!.patient_id), { stayDx: h!.diagnoses }) })
  })

  /** Escribir y firmar: cualquier médico, con la estancia activa. Su nombre, especialidad, colegiado y firma quedan en ella. */
  app.post('/api/inpatient/:id/preanesthesia/sign', express.json({ limit: '1mb' }), auth, async (req, res) => {
    const u = guard(req)
    const cid = clinicOf(req)
    const h = await stayOf(cid, String(req.params.id))
    if (!canWritePreEval(u)) {
      await audit(u, `Intentó firmar una valoración preanestésica de ${await patientName(String(h!.patient_id))} sin ser médico; se rechazó`, sql, String(h!.patient_id))
      fail(403, 'La valoración preanestésica la escribe y la firma un médico.')
    }
    if (h!.status !== 'active') fail(409, 'La estancia ya terminó.')
    const b = parse(z.object({ data: preEvalInput, authorizationId: z.string().optional() }), req.body)
    const authId = b.authorizationId && (await sql.one('SELECT 1 FROM authorizations WHERE id = ? AND hospitalization_id = ?', [b.authorizationId, String(h!.id)])) ? b.authorizationId : null
    const id = randomUUID()
    const at = new Date().toISOString()
    const name = await patientName(String(h!.patient_id))
    await sql.tx(async (q) => {
      const signer = await signerOf(q, u.id)
      await q.run(`INSERT INTO preanesthesia_evals (id, clinic_id, hospitalization_id, patient_id, authorization_id, mode, performed_by_name, performed_by_id, data, signer, created_by, created_at)
        VALUES (?,?,?,?,?,'system',?,?,?,?,?,?)`, [id, cid, String(h!.id), String(h!.patient_id), authId, signer.name, u.id, JSON.stringify(b.data), JSON.stringify(signer), u.id, at])
      await q.run(`DELETE FROM note_drafts WHERE user_id = ? AND scope = 'valoracion' AND ref_id = ?`, [u.id, String(h!.id)])
      await audit(u, `Escribió y firmó la valoración preanestésica de ${name}${b.data.proposedSurgery ? ` («${b.data.proposedSurgery}»)` : ''} (ASA ${b.data.asa}${b.data.asaE ? ' E' : ''})`, q, String(h!.patient_id))
    })
    res.status(201).json(toPreEval((await sql.one('SELECT * FROM preanesthesia_evals WHERE id = ?', [id]))!))
  })

  /** «Subir en papel»: médico o enfermería. `replaces`: la valoración subida que reemplaza (queda anulada con el motivo). */
  app.post('/api/inpatient/:id/preanesthesia/upload', auth, async (req, res) => {
    const u = guard(req)
    const cid = clinicOf(req)
    const b = parse(paperBody('hizo la valoración').extend({ authorizationId: z.string().optional() }), req.body)
    const h = await stayOf(cid, String(req.params.id))
    if (!b.performedBy) fail(400, 'Escribe quién hizo la valoración.')
    await assertPaperFile(sql, cid, b.fileId, String(h!.patient_id), u.id)
    const staffId = await staffIdIn(sql, cid, b.performedBy!.staffId)
    let current: Row | undefined
    if (b.replaces) {
      current = (await sql.one('SELECT * FROM preanesthesia_evals WHERE id = ? AND hospitalization_id = ?', [b.replaces.sheetId, String(h!.id)])) ?? fail(404, 'La valoración no existe.')
      if (current!.voided_at) fail(409, 'La valoración que querías reemplazar ya está anulada. Actualiza la página.')
      if (current!.mode !== 'upload') fail(409, 'La valoración llenada en el sistema no se reemplaza: se corrige con adenda.')
    }
    const authId = b.authorizationId && (await sql.one('SELECT 1 FROM authorizations WHERE id = ? AND hospitalization_id = ?', [b.authorizationId, String(h!.id)])) ? b.authorizationId : null
    const id = randomUUID()
    const at = new Date().toISOString()
    const name = await patientName(String(h!.patient_id))
    await sql.tx(async (q) => {
      if (current) {
        await q.run('UPDATE preanesthesia_evals SET voided_at = ?, voided_by = ?, void_reason = ?, replaced_by = ? WHERE id = ?', [at, u.id, b.replaces!.reason, id, String(current.id)])
        if (current.file_id) await q.run('UPDATE attachments SET voided_at = ?, void_reason = ? WHERE id = ?', [at, `Reemplazada: ${b.replaces!.reason}`, String(current.file_id)])
      }
      await q.run(`UPDATE attachments SET category = 'preanesthesia', title = 'Valoración preanestésica', hospitalization_id = ? WHERE id = ?`, [String(h!.id), b.fileId])
      await q.run(`INSERT INTO preanesthesia_evals (id, clinic_id, hospitalization_id, patient_id, authorization_id, mode, performed_by_name, performed_by_id, observation, file_id, created_by, created_at)
        VALUES (?,?,?,?,?,'upload',?,?,?,?,?,?)`, [id, cid, String(h!.id), String(h!.patient_id), authId, b.performedBy!.name, staffId ?? null, b.observation || null, b.fileId, u.id, at])
      await audit(u, current ? `Reemplazó la valoración preanestésica de ${name} (subida en papel; valoración de ${b.performedBy!.name}). Motivo: ${b.replaces!.reason}`
        : `Subió la valoración preanestésica de ${name} (en papel; valoración de ${b.performedBy!.name})`, q, String(h!.patient_id))
    })
    res.status(201).json(toPreEval((await sql.one('SELECT * FROM preanesthesia_evals WHERE id = ?', [id]))!))
  })

  /** GE4: quien la firmó la corrige dentro del periodo de gracia; la versión anterior queda guardada. Después, adenda. */
  app.post('/api/preanesthesia/:id/correct', express.json({ limit: '1mb' }), auth, async (req, res) => {
    const u = guard(req)
    const cid = clinicOf(req)
    const b = parse(z.object({ data: preEvalInput, version: z.number().int().min(1), why: z.string().trim().max(300).optional() }), req.body)
    const r = (await sql.one('SELECT * FROM preanesthesia_evals WHERE id = ? AND clinic_id = ?', [String(req.params.id), cid])) ?? fail(404, 'La valoración no existe.')
    if (r!.mode !== 'system' || r!.voided_at) fail(409, 'Solo se corrige la valoración llenada en el sistema.')
    assertGrace(u.id, r!.created_by, r!.created_at, 'firmó la valoración')
    if (Number(r!.version) !== b.version) fail(409, 'La valoración cambió mientras la corregías. Actualiza la página.')
    const name = await patientName(String(r!.patient_id))
    await sql.tx(async (q) => {
      const next = await saveVersion(q, { clinicId: cid, kind: 'preanesthesia', id: String(r!.id), version: Number(r!.version), data: { data: j(r!.data, {}) }, authorId: String(r!.created_by), at: String(r!.created_at), by: u.id, reason: b.why })
      await q.run('UPDATE preanesthesia_evals SET data = ?, version = ? WHERE id = ?', [JSON.stringify(b.data), next, String(r!.id)])
      await audit(u, `Corrigió la valoración preanestésica de ${name} en el periodo de gracia (versión ${next})${b.why ? `: ${b.why}` : ''}`, q, String(r!.patient_id))
    })
    res.json(toPreEval((await sql.one('SELECT * FROM preanesthesia_evals WHERE id = ?', [String(r!.id)]))!))
  })
}
