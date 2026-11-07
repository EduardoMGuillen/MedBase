import express, { type Express, type Request } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { type Ctx, fail, parse, type Row } from '../http.js'
import { assertGrace, graceUntil, saveVersion } from '../grace.js'
import { SURGICAL_COUNT } from '../../src/lib/clinicalConfig.js'
import { countMissing, type SurgicalCount, type SurgicalCountData } from '../../src/lib/surgicalCount.js'
import type { AnesthesiaSigner } from '../../src/lib/anesthesia.js'
import type { PostopData } from '../../src/lib/types.js'
import { canSheet, prefillOf } from './anesthesia.js'
import { assertPaperFile, j, paperBody, signerOf } from '../surgicalDocs.js'

/**
 * PQ5 (ronda 16): «Recuento quirúrgico» de la nota postquirúrgica. Mismo patrón que la hoja de anestesia (PQ3):
 * - Ver, imprimir en blanco, llenar y firmar en el sistema o subir en papel: médico, enfermería y quien entró a la cirugía
 *   con usuario (permisos de orders o care, como la subida en papel de PQ3). Recepción, administración y laboratorio no.
 * - Uno vigente por nota. Nada se borra: la subida se reemplaza con motivo; el llenado se corrige en el periodo de gracia o
 *   con adenda. Opcional: no genera avisos ni bloquea el egreso.
 */
const postopOf = (n: Row) => { try { const d = JSON.parse(String(n.data ?? '{}')); return d.format === 'postop' ? d.postop as PostopData : undefined } catch { return undefined } }

const text = (max = 120) => z.string().trim().max(max).default('')
const hhmm = z.string().trim().regex(/^(([01]\d|2[0-3]):[0-5]\d)?$/, 'Revisa las horas (HH:mm).').default('')
const yesNo = z.string().refine((x) => ['', 'Sí', 'No'].includes(x), 'Responde Sí o No.').default('')
const fixed = SURGICAL_COUNT.rows.map((r) => r.key) as string[]
const cellsInput = z.object(Object.fromEntries(SURGICAL_COUNT.columns.map((c) => [c.key, text(20)])) as Record<(typeof SURGICAL_COUNT.columns)[number]['key'], ReturnType<typeof text>>)
export const countInput = z.object({
  date: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Revisa la fecha.').default(''),
  procedure: text(300), surgeon: text(), scrubNurse: text(), circulatingNurse: text(),
  rows: z.array(z.object({
    key: z.string().refine((k) => fixed.includes(k) || /^other:[\w-]{1,60}$/.test(k), 'Fila no válida.'), label: text(80), cells: cellsInput,
    result: z.string().refine((x) => x === '' || (SURGICAL_COUNT.results as readonly string[]).includes(x), 'Elige Correcto o Incorrecto.').default(''),
  })).max(fixed.length + SURGICAL_COUNT.maxOther),
  handoffs: z.array(z.object({ id: z.string().max(60), time: hhmm, role: text(40), from: text(), to: text(), count: text(200) })).max(SURGICAL_COUNT.maxHandoffs).default([]),
  incorrect: z.object({ surgeonInformed: yesNo, searched: yesNo, xray: yesNo, found: yesNo, note: text(2000) }),
  confirmed: z.boolean().default(false),
}).superRefine((d, ctx) => {
  // Las filas fijas, una vez cada una y con su nombre de la configuración; «Otros» con nombre propio
  const keys = d.rows.map((r) => r.key)
  if (new Set(keys).size !== keys.length || fixed.some((k) => !keys.includes(k))) ctx.addIssue({ code: 'custom', message: 'Faltan filas del recuento. Actualiza la página.' })
  if (d.rows.filter((r) => r.key.startsWith('other:')).length > SURGICAL_COUNT.maxOther) ctx.addIssue({ code: 'custom', message: 'Demasiadas filas de «Otros».' })
  const missing = countMissing(d as SurgicalCountData)
  if (missing.length) ctx.addIssue({ code: 'custom', message: `Para firmar, ${missing.join('; ')}.` })
}).transform((d) => ({ ...d, rows: d.rows.map((r) => (fixed.includes(r.key) ? { ...r, label: SURGICAL_COUNT.rows.find((x) => x.key === r.key)!.label } : r)) }))

export const toCount = (r: Row): SurgicalCount => ({
  id: String(r.id), noteId: String(r.note_id), hospitalizationId: String(r.hospitalization_id), patientId: String(r.patient_id), mode: r.mode as SurgicalCount['mode'],
  observation: r.observation ? String(r.observation) : undefined, fileId: r.file_id ? String(r.file_id) : undefined,
  data: r.mode === 'system' ? j(r.data, undefined) : undefined, signer: j<AnesthesiaSigner | undefined>(r.signer, undefined),
  createdBy: String(r.created_by), createdAt: String(r.created_at), version: Number(r.version ?? 1),
  graceUntil: r.mode === 'system' && !r.voided_at ? graceUntil(r.created_at) : undefined,
  voidedAt: r.voided_at ? String(r.voided_at) : undefined, voidedBy: r.voided_by ? String(r.voided_by) : undefined, voidReason: r.void_reason ? String(r.void_reason) : undefined,
  replacedBy: r.replaced_by ? String(r.replaced_by) : undefined,
  ...(r.note_data ? (() => { const pq = postopOf({ data: r.note_data }); return pq ? { procedure: pq.procedureName, surgeryAt: pq.startAt } : {} })() : {}),
})

export function registerSurgicalCount(app: Express, { sql, auth, userOf, clinicOf, audit, patientName }: Ctx) {
  const guard = (req: Request) => { const u = userOf(req); if (!canSheet(u)) fail(403, 'Sin permiso para el recuento quirúrgico.'); return u }
  async function noteOf(cid: string, noteId: string) {
    const n = (await sql.one(`SELECT n.*, h.patient_id, h.kind AS stay_kind, h.status AS stay_status, h.diagnoses AS stay_dx FROM hosp_notes n JOIN hospitalizations h ON h.id = n.hospitalization_id
      WHERE n.id = ? AND n.clinic_id = ?`, [noteId, cid])) ?? fail(404, 'La nota no existe.')
    const pq = postopOf(n!) ?? fail(409, 'Solo la nota postquirúrgica lleva recuento quirúrgico.')
    return { n: n!, pq: pq! }
  }
  const activeOf = (noteId: string) => sql.one('SELECT * FROM surgical_counts WHERE note_id = ? AND voided_at IS NULL', [noteId])
  const what = (pq: PostopData) => `el recuento quirúrgico de «${pq.procedureName}»`

  /** El recuento (vigente y anteriores) de una nota postquirúrgica. */
  app.get('/api/surgical-count/notes/:noteId', auth, async (req, res) => {
    guard(req)
    const { n } = await noteOf(clinicOf(req), String(req.params.noteId))
    const rows = await sql.query('SELECT * FROM surgical_counts WHERE note_id = ? ORDER BY created_at, id', [String(n.id)])
    res.json({ noteId: String(n.id), hospitalizationId: String(n.hospitalization_id), stayKind: String(n.stay_kind), patientId: String(n.patient_id), counts: rows.map(toCount) })
  })

  /** Los recuentos de la estancia (Anexos), con la cirugía de cada uno. */
  app.get('/api/inpatient/:id/surgical-counts', auth, async (req, res) => {
    guard(req)
    const rows = await sql.query(`SELECT s.*, n.data AS note_data FROM surgical_counts s JOIN hosp_notes n ON n.id = s.note_id WHERE s.clinic_id = ? AND s.hospitalization_id = ? ORDER BY s.created_at, s.id`,
      [clinicOf(req), String(req.params.id)])
    res.json(rows.map(toCount))
  })

  /** Ver o imprimir un recuento. */
  app.get('/api/surgical-counts/:id', auth, async (req, res) => {
    const u = guard(req)
    const cid = clinicOf(req)
    const r = (await sql.one('SELECT s.*, n.data AS note_data FROM surgical_counts s JOIN hosp_notes n ON n.id = s.note_id WHERE s.id = ? AND s.clinic_id = ?', [String(req.params.id), cid])) ?? fail(404, 'El recuento no existe.')
    const { n, pq } = await noteOf(cid, String(r!.note_id))
    await audit(u, `Abrió ${what(pq)} de ${await patientName(String(r!.patient_id))}`, sql, String(r!.patient_id))
    res.json({ count: toCount(r!), stayKind: String(n.stay_kind), prefill: await prefillOf(sql, cid, String(r!.patient_id), { pq, stayDx: n.stay_dx }) })
  })

  /** «Llenar en el sistema»: el encabezado lleno desde la nota (paciente, fecha, procedimiento y equipo). */
  app.get('/api/surgical-count/notes/:noteId/prefill', auth, async (req, res) => {
    guard(req)
    const cid = clinicOf(req)
    const { n, pq } = await noteOf(cid, String(req.params.noteId))
    if (await activeOf(String(n.id))) fail(409, 'Esta cirugía ya tiene su recuento quirúrgico.')
    res.json({ prefill: await prefillOf(sql, cid, String(n.patient_id), { pq, stayDx: n.stay_dx }), hospitalizationId: String(n.hospitalization_id), stayKind: String(n.stay_kind) })
  })

  /** IM1: la hoja en blanco para llenarla a mano en sala (de una nota postquirúrgica o solo con el paciente, desde Anexos). */
  app.get('/api/inpatient/:id/surgical-count/blank', auth, async (req, res) => {
    const u = guard(req)
    const cid = clinicOf(req)
    const h = (await sql.one('SELECT * FROM hospitalizations WHERE id = ? AND clinic_id = ?', [String(req.params.id), cid])) ?? fail(404, 'La estancia no existe.')
    const noteId = typeof req.query.nota === 'string' ? req.query.nota : ''
    const pq = noteId ? (await noteOf(cid, noteId)).pq : undefined
    await audit(u, `Imprimió el recuento quirúrgico en blanco de ${await patientName(String(h!.patient_id))}${pq ? ` («${pq.procedureName}»)` : ''}`, sql, String(h!.patient_id))
    res.json({ prefill: await prefillOf(sql, cid, String(h!.patient_id), { pq, stayDx: h!.diagnoses }), hospitalizationId: String(h!.id), stayKind: String(h!.kind) })
  })

  /** «Subir hoja en papel» (o reemplazar la subida, con motivo). */
  app.post('/api/surgical-count/notes/:noteId/upload', auth, async (req, res) => {
    const u = guard(req)
    const cid = clinicOf(req)
    const b = parse(paperBody('llenó el recuento'), req.body)
    const { n, pq } = await noteOf(cid, String(req.params.noteId))
    await assertPaperFile(sql, cid, b.fileId, String(n.patient_id), u.id)
    const current = await activeOf(String(n.id))
    if (current && !b.replaces) fail(409, current.mode === 'system' ? 'Esta cirugía ya tiene su recuento firmado en el sistema: se corrige con adenda.' : 'Esta cirugía ya tiene su recuento. Para cambiarlo, usa «Reemplazar» con el motivo.')
    if (b.replaces) {
      if (!current || String(current.id) !== b.replaces.sheetId) fail(409, 'El recuento que querías reemplazar ya no es el vigente. Actualiza la página.')
      if (current!.mode !== 'upload') fail(409, 'El recuento llenado en el sistema no se reemplaza: se corrige con adenda.')
    }
    const id = randomUUID()
    const at = new Date().toISOString()
    const name = await patientName(String(n.patient_id))
    await sql.tx(async (q) => {
      if (b.replaces) {
        await q.run('UPDATE surgical_counts SET voided_at = ?, voided_by = ?, void_reason = ?, replaced_by = ? WHERE id = ?', [at, u.id, b.replaces.reason, id, b.replaces.sheetId])
        if (current!.file_id) await q.run('UPDATE attachments SET voided_at = ?, void_reason = ? WHERE id = ?', [at, `Reemplazado: ${b.replaces.reason}`, String(current!.file_id)])
      }
      await q.run(`UPDATE attachments SET category = 'surgical_count', title = ?, hospitalization_id = ? WHERE id = ?`, [`Recuento quirúrgico: ${pq.procedureName}`.slice(0, 120), String(n.hospitalization_id), b.fileId])
      await q.run(`INSERT INTO surgical_counts (id, clinic_id, hospitalization_id, note_id, patient_id, mode, observation, file_id, created_by, created_at) VALUES (?,?,?,?,?,'upload',?,?,?,?)`,
        [id, cid, String(n.hospitalization_id), String(n.id), String(n.patient_id), b.observation || null, b.fileId, u.id, at])
      await audit(u, b.replaces ? `Reemplazó ${what(pq)} de ${name} (subido en papel). Motivo: ${b.replaces.reason}` : `Subió ${what(pq)} de ${name} (en papel)`, q, String(n.patient_id))
    })
    res.status(201).json(toCount((await sql.one('SELECT * FROM surgical_counts WHERE id = ?', [id]))!))
  })

  /** «Llenar en el sistema» y firmar: queda con el nombre, el cargo y la hora de quien lo firma. */
  app.post('/api/surgical-count/notes/:noteId/sign', express.json({ limit: '1mb' }), auth, async (req, res) => {
    const u = guard(req)
    const cid = clinicOf(req)
    const { n, pq } = await noteOf(cid, String(req.params.noteId))
    const b = parse(z.object({ data: countInput }), req.body)
    if (await activeOf(String(n.id))) fail(409, 'Esta cirugía ya tiene su recuento quirúrgico.')
    const id = randomUUID()
    const at = new Date().toISOString()
    const name = await patientName(String(n.patient_id))
    const wrong = b.data.rows.filter((r) => r.result === 'Incorrecto').map((r) => r.label)
    await sql.tx(async (q) => {
      const signer = await signerOf(q, u.id)
      await q.run(`INSERT INTO surgical_counts (id, clinic_id, hospitalization_id, note_id, patient_id, mode, data, signer, created_by, created_at) VALUES (?,?,?,?,?,'system',?,?,?,?)`,
        [id, cid, String(n.hospitalization_id), String(n.id), String(n.patient_id), JSON.stringify(b.data), JSON.stringify(signer), u.id, at])
      await q.run(`DELETE FROM note_drafts WHERE user_id = ? AND scope = 'recuento' AND ref_id = ?`, [u.id, String(n.id)])
      await audit(u, `Llenó y firmó ${what(pq)} de ${name} en el sistema (${wrong.length ? `resultado incorrecto en ${wrong.join(', ')}; se encontró: ${b.data.incorrect.found}` : 'sin resultados incorrectos'}${b.data.confirmed ? '; confirmado en voz alta' : ''})`, q, String(n.patient_id))
    })
    res.status(201).json(toCount((await sql.one('SELECT * FROM surgical_counts WHERE id = ?', [id]))!))
  })

  /** GE4: quien lo firmó lo corrige en el periodo de gracia; la versión anterior queda guardada. Después, adenda. */
  app.post('/api/surgical-counts/:id/correct', express.json({ limit: '1mb' }), auth, async (req, res) => {
    const u = guard(req)
    const cid = clinicOf(req)
    const b = parse(z.object({ data: countInput, version: z.number().int().min(1), why: z.string().trim().max(300).optional() }), req.body)
    const r = (await sql.one('SELECT * FROM surgical_counts WHERE id = ? AND clinic_id = ?', [String(req.params.id), cid])) ?? fail(404, 'El recuento no existe.')
    if (r!.mode !== 'system' || r!.voided_at) fail(409, 'Solo se corrige el recuento llenado en el sistema.')
    assertGrace(u.id, r!.created_by, r!.created_at, 'firmó el recuento')
    if (Number(r!.version) !== b.version) fail(409, 'El recuento cambió mientras lo corregías. Actualiza la página.')
    const { pq } = await noteOf(cid, String(r!.note_id))
    const name = await patientName(String(r!.patient_id))
    await sql.tx(async (q) => {
      const next = await saveVersion(q, { clinicId: cid, kind: 'surgical_count', id: String(r!.id), version: Number(r!.version), data: { data: j(r!.data, {}) }, authorId: String(r!.created_by), at: String(r!.created_at), by: u.id, reason: b.why })
      await q.run('UPDATE surgical_counts SET data = ?, version = ? WHERE id = ?', [JSON.stringify(b.data), next, String(r!.id)])
      await audit(u, `Corrigió ${what(pq)} de ${name} en el periodo de gracia (versión ${next})${b.why ? `: ${b.why}` : ''}`, q, String(r!.patient_id))
    })
    res.json(toCount((await sql.one('SELECT * FROM surgical_counts WHERE id = ?', [String(r!.id)]))!))
  })
}
