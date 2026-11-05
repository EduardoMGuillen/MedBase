import express, { type Express, type Request } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { type Ctx, fail, parse, type Row } from '../http.js'
import { assertGrace, graceUntil, saveVersion } from '../grace.js'
import { can } from '../../src/lib/permissions.js'
import { ANESTHESIA_SHEET } from '../../src/lib/clinicalConfig.js'
import type { AnesthesiaPrefill, AnesthesiaSheet, AnesthesiaSigner } from '../../src/lib/anesthesia.js'
import type { PostopData, Staff } from '../../src/lib/types.js'
import { currentMarks } from './me.js'
import { specialtyOf } from '../prefs.js'
import { positionOf, signedName } from '../../src/lib/positions.js'

/**
 * PQ3 (ronda 14): hoja de anestesia de la nota postquirúrgica.
 * - Ver, imprimir en blanco y subir en papel: quien atiende al paciente en la estancia (médico, enfermería, el radiólogo que
 *   escribe notas, DP11; en el consultorio, la titular). Recepción, administración y laboratorio no.
 * - Llenar y firmar en el sistema: solo el anestesiólogo de esa nota, si es una persona del sistema con rol de médico (o el
 *   radiólogo). Si fue un médico sin usuario, se sube la hoja en papel.
 * - No es obligatoria: no genera avisos en el paciente ni en el egreso; solo el anestesiólogo con usuario la ve como pendiente.
 * - Nada se borra: reemplazar una subida la deja anulada con motivo; la llenada se corrige en el periodo de gracia o con adenda.
 */
export const canSheet = (u: Staff) => can(u, 'chart.view') && (can(u, 'inpatient.orders') || can(u, 'inpatient.care') || can(u, 'inpatient.notes'))
const writesNotes = (u: Staff) => can(u, 'inpatient.orders') || can(u, 'inpatient.notes')
const postopOf = (n: Row) => { try { const d = JSON.parse(String(n.data ?? '{}')); return d.format === 'postop' ? d.postop as PostopData : undefined } catch { return undefined } }
const anesthesiologistOf = (pq?: PostopData) => pq?.team.anesthesiologist?.name.trim() ? { name: pq.team.anesthesiologist.name.trim(), staffId: pq.team.anesthesiologist.staffId } : undefined
/** ¿Puede esta persona llenar y firmar la hoja de esta nota? */
export const canFill = (u: Staff, pq?: PostopData) => writesNotes(u) && !!anesthesiologistOf(pq)?.staffId && anesthesiologistOf(pq)!.staffId === u.id

const text = (max = 200) => z.string().trim().max(max).default('')
const hhmm = z.string().trim().regex(/^(([01]\d|2[0-3]):[0-5]\d)?$/, 'Revisa las horas (HH:mm).').default('')
const pick = <T extends readonly string[]>(list: T) => z.string().refine((x) => x === '' || list.includes(x), 'Elige una opción de la lista.').default('')
const marks = <T extends readonly string[]>(list: T) => z.array(z.string().refine((x) => list.includes(x), 'Elige una opción de la lista.')).max(list.length).default([])
const aldrete = z.string().refine((x) => ['', '0', '1', '2'].includes(x), 'El Aldrete va de 0 a 2 por parámetro.').default('')

/** Anexo B. Ningún campo es obligatorio salvo la técnica (y quien firma, que es «Anestesia realizada por»). */
export const anesthesiaInput = z.object({
  date: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Revisa la fecha.').default(''),
  room: text(60), weightKg: text(10), heightCm: text(10), scheduled: pick(ANESTHESIA_SHEET.scheduled),
  preDiagnosis: text(600), proposedSurgery: text(300), surgeon: text(120), assistant1: text(120), assistant2: text(120), anesthesiologist: text(120),
  asa: pick(ANESTHESIA_SHEET.asa), asaE: z.boolean().default(false), mallampati: pick(ANESTHESIA_SHEET.mallampati), difficultAirway: pick(['Sí', 'No'] as const),
  allergies: text(300), fastingSolids: text(10), fastingLiquids: text(10), history: text(2000),
  labs: z.object({ hb: text(12), hto: text(12), plt: text(12), inr: text(20), glucose: text(12), bloodType: text(12) }).default({ hb: '', hto: '', plt: '', inr: '', glucose: '', bloodType: '' }),
  who: marks(ANESTHESIA_SHEET.who), checks: marks(ANESTHESIA_SHEET.checks),
  techniques: marks(ANESTHESIA_SHEET.techniques),
  times: z.object(Object.fromEntries(ANESTHESIA_SHEET.times.map((t) => [t.key, hhmm])) as Record<(typeof ANESTHESIA_SHEET.times)[number]['key'], typeof hhmm>),
  monitoring: z.array(z.object({ id: z.string().max(60), time: hhmm, sys: text(6), dia: text(6), hr: text(6), spo2: text(6), etco2: text(6), temp: text(6) })).max(300).default([]),
  drugs: z.array(z.object({ id: z.string().max(60), category: pick(ANESTHESIA_SHEET.drugCategories), drug: text(120), dose: text(60), route: text(40), time: hhmm })).max(80).default([]),
  maintenance: text(300),
  airway: marks(ANESTHESIA_SHEET.airway), tubeSize: text(10), cormack: pick(ANESTHESIA_SHEET.cormack), attempts: text(6), etco2Confirms: z.boolean().default(false),
  ventilation: pick(ANESTHESIA_SHEET.ventilation), vt: text(10), rr: text(10), peep: text(10),
  regionalLevel: text(120), regionalDrug: text(160), monitors: marks(ANESTHESIA_SHEET.monitors), ivLines: text(200), position: text(80),
  fluids: z.object({ crystalloids: text(10), colloids: text(10), bleeding: text(10), diuresis: text(10) }),
  operation: text(300), incidents: text(2000), extubated: z.boolean().default(false), tof09: z.boolean().default(false), destination: pick(ANESTHESIA_SHEET.destinations),
  exit: z.object({ bp: text(12), hr: text(6), rr: text(6), spo2: text(6) }),
  aldrete: z.object({ activity: aldrete, respiration: aldrete, circulation: aldrete, consciousness: aldrete, saturation: aldrete }),
  scrubNurse: text(120), circulatingNurse: text(120),
}).superRefine((d, ctx) => { if (!d.techniques.length) ctx.addIssue({ code: 'custom', message: 'Marca la técnica anestésica.' }) })

const j = <T>(v: unknown, d: T): T => { try { return v ? JSON.parse(String(v)) as T : d } catch { return d } }
export const toSheet = (r: Row): AnesthesiaSheet => ({
  id: String(r.id), noteId: String(r.note_id), hospitalizationId: String(r.hospitalization_id), patientId: String(r.patient_id), mode: r.mode as AnesthesiaSheet['mode'],
  performedBy: { name: String(r.performed_by_name), staffId: r.performed_by_id ? String(r.performed_by_id) : undefined },
  observation: r.observation ? String(r.observation) : undefined, fileId: r.file_id ? String(r.file_id) : undefined,
  data: r.mode === 'system' ? j(r.data, undefined) : undefined, signer: j<AnesthesiaSigner | undefined>(r.signer, undefined),
  createdBy: String(r.created_by), createdAt: String(r.created_at), version: Number(r.version ?? 1),
  graceUntil: r.mode === 'system' && !r.voided_at ? graceUntil(r.created_at) : undefined,
  voidedAt: r.voided_at ? String(r.voided_at) : undefined, voidedBy: r.voided_by ? String(r.voided_by) : undefined, voidReason: r.void_reason ? String(r.void_reason) : undefined,
  replacedBy: r.replaced_by ? String(r.replaced_by) : undefined,
  ...(r.note_data ? (() => { const pq = postopOf({ data: r.note_data }); return pq ? { procedure: pq.procedureName, surgeryAt: pq.startAt } : {} })() : {}),
})

export function registerAnesthesia(app: Express, { sql, auth, userOf, clinicOf, audit, patientName }: Ctx) {
  const guard = (req: Request) => { const u = userOf(req); if (!canSheet(u)) fail(403, 'Sin permiso para la hoja de anestesia.'); return u }

  /** La nota postquirúrgica con su estancia. */
  async function noteOf(cid: string, noteId: string) {
    const n = (await sql.one(`SELECT n.*, h.patient_id, h.kind AS stay_kind, h.status AS stay_status, h.diagnoses AS stay_dx FROM hosp_notes n JOIN hospitalizations h ON h.id = n.hospitalization_id
      WHERE n.id = ? AND n.clinic_id = ?`, [noteId, cid])) ?? fail(404, 'La nota no existe.')
    const pq = postopOf(n!) ?? fail(409, 'Solo la nota postquirúrgica lleva hoja de anestesia.')
    return { n: n!, pq: pq! }
  }
  const sheetsOf = async (noteId: string) => (await sql.query('SELECT * FROM anesthesia_sheets WHERE note_id = ? ORDER BY created_at, id', [noteId])).map(toSheet)
  const activeOf = (noteId: string) => sql.one('SELECT * FROM anesthesia_sheets WHERE note_id = ? AND voided_at IS NULL', [noteId])
  const what = (pq: PostopData) => `la hoja de anestesia de «${pq.procedureName}»`

  /** Datos de la hoja que ya existen: paciente, alergias, peso y talla, diagnóstico y cirugía (de la nota o de la autorización). */
  async function prefillOf(cid: string, patientId: string, from: { pq?: PostopData; authorization?: Row; stayDx?: unknown }): Promise<AnesthesiaPrefill> {
    const p = (await sql.one('SELECT * FROM patients WHERE id = ? AND clinic_id = ?', [patientId, cid]))!
    const vit = await sql.query(`SELECT weight_kg, height_cm FROM vitals WHERE patient_id = ? AND voided_at IS NULL AND (weight_kg IS NOT NULL OR height_cm IS NOT NULL) ORDER BY taken_at DESC LIMIT 20`, [patientId])
    const first = (k: string) => { const r = vit.find((v) => v[k] != null); return r ? Number(r[k]) : undefined }
    const auth = from.authorization ? j<{ procedure?: string; diagnosis?: string }>(from.authorization.data, {}) : {}
    let proposed = auth.procedure
    if (!proposed && from.pq?.authorizationId) proposed = j<{ procedure?: string }>((await sql.one('SELECT data FROM authorizations WHERE id = ?', [from.pq.authorizationId]))?.data, {}).procedure
    return {
      patient: { id: String(p.id), firstName: String(p.first_name), lastName: String(p.last_name ?? ''), record: String(p.record), dni: p.dni ? String(p.dni) : undefined, birthDate: p.birth_date ? String(p.birth_date) : undefined,
        sex: p.sex ? String(p.sex) : undefined, allergies: j<string[]>(p.allergies, []), guardianName: p.guardian_name ? String(p.guardian_name) : undefined,
        guardianDni: p.guardian_dni ? String(p.guardian_dni) : undefined, guardianRelation: p.guardian_relation ? String(p.guardian_relation) : undefined },
      weightKg: first('weight_kg'), heightCm: first('height_cm'),
      diagnosis: auth.diagnosis || j<{ label: string }[]>(from.stayDx, []).map((d) => d.label).join('; ') || undefined,
      procedure: auth.procedure, postop: from.pq, surgeryProposed: proposed,
    }
  }

  /** La hoja (vigente y anteriores) de una nota postquirúrgica, y si quien pregunta puede llenarla. */
  app.get('/api/anesthesia/notes/:noteId', auth, async (req, res) => {
    const u = guard(req)
    const cid = clinicOf(req)
    const { n, pq } = await noteOf(cid, String(req.params.noteId))
    res.json({ noteId: String(n.id), hospitalizationId: String(n.hospitalization_id), stayKind: String(n.stay_kind), patientId: String(n.patient_id),
      anesthesiologist: anesthesiologistOf(pq) ?? null, canFill: canFill(u, pq), sheets: await sheetsOf(String(n.id)) })
  })

  /** Las hojas de la estancia (Anexos), con la cirugía de cada una. */
  app.get('/api/inpatient/:id/anesthesia', auth, async (req, res) => {
    guard(req)
    const rows = await sql.query(`SELECT s.*, n.data AS note_data FROM anesthesia_sheets s JOIN hosp_notes n ON n.id = s.note_id WHERE s.clinic_id = ? AND s.hospitalization_id = ? ORDER BY s.created_at, s.id`,
      [clinicOf(req), String(req.params.id)])
    res.json(rows.map(toSheet))
  })

  /** Ver o imprimir una hoja: la hoja y los datos del paciente. */
  app.get('/api/anesthesia/sheets/:id', auth, async (req, res) => {
    const u = guard(req)
    const cid = clinicOf(req)
    const r = (await sql.one('SELECT s.*, n.data AS note_data FROM anesthesia_sheets s JOIN hosp_notes n ON n.id = s.note_id WHERE s.id = ? AND s.clinic_id = ?', [String(req.params.id), cid])) ?? fail(404, 'La hoja no existe.')
    const { n, pq } = await noteOf(cid, String(r!.note_id))
    await audit(u, `Abrió ${what(pq)} de ${await patientName(String(r!.patient_id))}`, sql, String(r!.patient_id))
    res.json({ sheet: toSheet(r!), stayKind: String(n.stay_kind), prefill: await prefillOf(cid, String(r!.patient_id), { pq, stayDx: n.stay_dx }) })
  })

  /** «Llenar en el sistema»: lo que la hoja trae lleno. Solo el anestesiólogo de la nota (también por URL directa). */
  app.get('/api/anesthesia/notes/:noteId/prefill', auth, async (req, res) => {
    const u = guard(req)
    const cid = clinicOf(req)
    const { n, pq } = await noteOf(cid, String(req.params.noteId))
    if (!canFill(u, pq)) fail(403, `Solo la llena y la firma quien hizo la anestesia${anesthesiologistOf(pq) ? ` (${anesthesiologistOf(pq)!.name})` : ''}. Para esta cirugía, sube la hoja en papel.`)
    if (await activeOf(String(n.id))) fail(409, 'Esta cirugía ya tiene su hoja de anestesia.')
    res.json({ prefill: await prefillOf(cid, String(n.patient_id), { pq, stayDx: n.stay_dx }), hospitalizationId: String(n.hospitalization_id), stayKind: String(n.stay_kind) })
  })

  /** IM1: hoja en blanco para llenarla a mano en sala, con los datos que ya existen (de la autorización quirúrgica, si se elige). */
  app.get('/api/inpatient/:id/anesthesia/blank', auth, async (req, res) => {
    const u = guard(req)
    const cid = clinicOf(req)
    const h = (await sql.one('SELECT * FROM hospitalizations WHERE id = ? AND clinic_id = ?', [String(req.params.id), cid])) ?? fail(404, 'La estancia no existe.')
    const authId = typeof req.query.autorizacion === 'string' ? req.query.autorizacion : ''
    const a = authId
      ? (await sql.one('SELECT * FROM authorizations WHERE id = ? AND hospitalization_id = ?', [authId, String(h!.id)])) ?? fail(404, 'La autorización no existe.')
      : await sql.one(`SELECT * FROM authorizations WHERE hospitalization_id = ? AND template IN ('surgical','procedure') AND archived_at IS NULL AND status IN ('pending','signed') ORDER BY created_at DESC LIMIT 1`, [String(h!.id)])
    const pre = await prefillOf(cid, String(h!.patient_id), { authorization: a ?? undefined, stayDx: h!.diagnoses })
    await audit(u, `Imprimió la hoja de anestesia en blanco de ${await patientName(String(h!.patient_id))}${pre.procedure ? ` («${pre.procedure}»)` : ''}`, sql, String(h!.patient_id))
    res.json({ prefill: pre, hospitalizationId: String(h!.id), stayKind: String(h!.kind) })
  })

  /**
   * «Subir hoja en papel»: el PDF (fotos unidas o escaneo) ya se subió por partes como archivo del expediente; aquí queda como la
   * hoja de la nota, con «Anestesia realizada por» y la observación. `replaces`: la hoja subida que reemplaza, con motivo.
   */
  app.post('/api/anesthesia/notes/:noteId/upload', auth, async (req, res) => {
    const u = guard(req)
    const cid = clinicOf(req)
    const b = parse(z.object({
      fileId: z.string().min(1),
      performedBy: z.object({ name: z.string().trim().min(3, 'Escribe quién hizo la anestesia.').max(120), staffId: z.string().optional() }),
      observation: z.string().trim().max(1000).optional(),
      replaces: z.object({ sheetId: z.string(), reason: z.string().trim().min(5, 'Escribe por qué se reemplaza la hoja.').max(500) }).optional(),
    }), req.body)
    const { n, pq } = await noteOf(cid, String(req.params.noteId))
    const file = (await sql.one('SELECT id, patient_id, uploaded_by, category, mime FROM attachments WHERE id = ? AND clinic_id = ?', [b.fileId, cid])) ?? fail(404, 'El archivo no existe.')
    if (String(file!.patient_id) !== String(n.patient_id) || String(file!.uploaded_by) !== u.id || !['document', 'anesthesia'].includes(String(file!.category))) fail(400, 'El archivo no corresponde a esta hoja.')
    if (await sql.one('SELECT 1 FROM anesthesia_sheets WHERE file_id = ?', [b.fileId])) fail(409, 'Ese archivo ya es una hoja de anestesia.')
    if (b.performedBy.staffId && !(await sql.one('SELECT 1 FROM staff WHERE id = ? AND clinic_id = ?', [b.performedBy.staffId, cid]))) b.performedBy.staffId = undefined
    const current = await activeOf(String(n.id))
    if (current && !b.replaces) fail(409, current.mode === 'system' ? 'Esta cirugía ya tiene su hoja firmada en el sistema: se corrige con adenda.' : 'Esta cirugía ya tiene su hoja de anestesia. Para cambiarla, usa «Reemplazar» con el motivo.')
    if (b.replaces) {
      if (!current || String(current.id) !== b.replaces.sheetId) fail(409, 'La hoja que querías reemplazar ya no es la vigente. Actualiza la página.')
      if (current!.mode !== 'upload') fail(409, 'La hoja llenada en el sistema no se reemplaza: se corrige con adenda.')
    }
    const id = randomUUID()
    const at = new Date().toISOString()
    const name = await patientName(String(n.patient_id))
    await sql.tx(async (q) => {
      if (b.replaces) {
        await q.run('UPDATE anesthesia_sheets SET voided_at = ?, voided_by = ?, void_reason = ?, replaced_by = ? WHERE id = ?', [at, u.id, b.replaces.reason, id, b.replaces.sheetId])
        if (current!.file_id) await q.run('UPDATE attachments SET voided_at = ?, void_reason = ? WHERE id = ?', [at, `Reemplazada: ${b.replaces.reason}`, String(current!.file_id)])
      }
      await q.run(`UPDATE attachments SET category = 'anesthesia', title = ?, hospitalization_id = ? WHERE id = ?`, [`Hoja de anestesia: ${pq.procedureName}`.slice(0, 120), String(n.hospitalization_id), b.fileId])
      await q.run(`INSERT INTO anesthesia_sheets (id, clinic_id, hospitalization_id, note_id, patient_id, mode, performed_by_name, performed_by_id, observation, file_id, created_by, created_at)
        VALUES (?,?,?,?,?,'upload',?,?,?,?,?,?)`, [id, cid, String(n.hospitalization_id), String(n.id), String(n.patient_id), b.performedBy.name, b.performedBy.staffId ?? null, b.observation || null, b.fileId, u.id, at])
      await audit(u, b.replaces ? `Reemplazó ${what(pq)} de ${name} (subida en papel; anestesia de ${b.performedBy.name}). Motivo: ${b.replaces.reason}`
        : `Subió ${what(pq)} de ${name} (en papel; anestesia de ${b.performedBy.name})`, q, String(n.patient_id))
    })
    res.status(201).json(toSheet((await sql.one('SELECT * FROM anesthesia_sheets WHERE id = ?', [id]))!))
  })

  /** «Llenar en el sistema» y firmar: solo el anestesiólogo de la nota. Su nombre, especialidad, colegiado y firma quedan en la hoja. */
  app.post('/api/anesthesia/notes/:noteId/sign', express.json({ limit: '1mb' }), auth, async (req, res) => {
    const u = guard(req)
    const cid = clinicOf(req)
    const { n, pq } = await noteOf(cid, String(req.params.noteId))
    if (!canFill(u, pq)) {
      await audit(u, `Intentó firmar ${what(pq)} de ${await patientName(String(n.patient_id))} sin ser el anestesiólogo de la nota; se rechazó`, sql, String(n.patient_id))
      fail(403, 'Solo la firma quien hizo la anestesia (el anestesiólogo de la nota postquirúrgica).')
    }
    const b = parse(z.object({ data: anesthesiaInput }), req.body)
    if (await activeOf(String(n.id))) fail(409, 'Esta cirugía ya tiene su hoja de anestesia.')
    const me = (await sql.one('SELECT * FROM staff WHERE id = ?', [u.id]))!
    const id = randomUUID()
    const at = new Date().toISOString()
    const name = await patientName(String(n.patient_id))
    await sql.tx(async (q) => {
      const m = await currentMarks(q, u.id)
      const pos = me.position ? String(me.position) : undefined
      const signer: AnesthesiaSigner = { name: signedName({ name: String(me.name), docName: me.doc_name ? String(me.doc_name) : undefined, position: pos }), title: positionOf(pos)?.label ?? specialtyOf({ specialty: me.specialty ? String(me.specialty) : undefined }),
        license: me.license ? String(me.license) : undefined, signatureId: m.signatureId ?? undefined, stampId: m.stampId ?? undefined }
      await q.run(`INSERT INTO anesthesia_sheets (id, clinic_id, hospitalization_id, note_id, patient_id, mode, performed_by_name, performed_by_id, data, signer, created_by, created_at)
        VALUES (?,?,?,?,?,'system',?,?,?,?,?,?)`, [id, cid, String(n.hospitalization_id), String(n.id), String(n.patient_id), signer.name, u.id, JSON.stringify(b.data), JSON.stringify(signer), u.id, at])
      await q.run(`DELETE FROM note_drafts WHERE user_id = ? AND scope = 'anestesia' AND ref_id = ?`, [u.id, String(n.id)])
      await audit(u, `Llenó y firmó ${what(pq)} de ${name} en el sistema (técnica: ${b.data.techniques.join(', ')}; ${b.data.monitoring.length} registro(s) de monitoreo)`, q, String(n.patient_id))
    })
    res.status(201).json(toSheet((await sql.one('SELECT * FROM anesthesia_sheets WHERE id = ?', [id]))!))
  })

  /** GE4: quien la firmó la corrige dentro del periodo de gracia; la versión anterior queda guardada. Después, adenda. */
  app.post('/api/anesthesia/sheets/:id/correct', auth, async (req, res) => {
    const u = guard(req)
    const cid = clinicOf(req)
    const b = parse(z.object({ data: anesthesiaInput, version: z.number().int().min(1), why: z.string().trim().max(300).optional() }), req.body)
    const r = (await sql.one('SELECT * FROM anesthesia_sheets WHERE id = ? AND clinic_id = ?', [String(req.params.id), cid])) ?? fail(404, 'La hoja no existe.')
    if (r!.mode !== 'system' || r!.voided_at) fail(409, 'Solo se corrige la hoja llenada en el sistema.')
    assertGrace(u.id, r!.created_by, r!.created_at, 'firmó la hoja')
    if (Number(r!.version) !== b.version) fail(409, 'La hoja cambió mientras la corregías. Actualiza la página.')
    const { pq } = await noteOf(cid, String(r!.note_id))
    const name = await patientName(String(r!.patient_id))
    await sql.tx(async (q) => {
      const next = await saveVersion(q, { clinicId: cid, kind: 'anesthesia', id: String(r!.id), version: Number(r!.version), data: { data: j(r!.data, {}) }, authorId: String(r!.created_by), at: String(r!.created_at), by: u.id, reason: b.why })
      await q.run('UPDATE anesthesia_sheets SET data = ?, version = ? WHERE id = ?', [JSON.stringify(b.data), next, String(r!.id)])
      await audit(u, `Corrigió ${what(pq)} de ${name} en el periodo de gracia (versión ${next})${b.why ? `: ${b.why}` : ''}`, q, String(r!.patient_id))
    })
    res.json(toSheet((await sql.one('SELECT * FROM anesthesia_sheets WHERE id = ?', [String(r!.id)]))!))
  })

  /**
   * Pendientes del anestesiólogo con usuario (Inicio): sus notas postquirúrgicas sin hoja vigente. No es un aviso del paciente
   * ni del egreso; a nadie más le aparece.
   */
  app.get('/api/anesthesia/pending', auth, async (req, res) => {
    const u = userOf(req)
    if (!canSheet(u) || !writesNotes(u)) return res.json([])
    const rows = await sql.query(`SELECT n.id, n.data, n.hospitalization_id, h.kind AS stay_kind, h.patient_id, p.first_name, p.last_name FROM hosp_notes n
      JOIN hospitalizations h ON h.id = n.hospitalization_id JOIN patients p ON p.id = h.patient_id
      WHERE n.clinic_id = ? AND n.kind = 'evolution' AND n.data LIKE '%"format":"postop"%' AND n.data LIKE ?
        AND NOT EXISTS (SELECT 1 FROM anesthesia_sheets s WHERE s.note_id = n.id AND s.voided_at IS NULL) ORDER BY n.at DESC LIMIT 50`, [clinicOf(req), `%${u.id}%`])
    res.json(rows.map((r) => ({ r, pq: postopOf(r) })).filter((x) => canFill(u, x.pq)).map(({ r, pq }) => ({
      noteId: String(r.id), hospitalizationId: String(r.hospitalization_id), stayKind: String(r.stay_kind), patient: `${r.first_name} ${r.last_name ?? ''}`.trim(),
      procedure: pq!.procedureName, at: pq!.startAt,
    })))
  })
}
