import type { Express } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { assertGrace, graceUntil, saveVersion } from '../grace.js'
import { type Ctx, fail, parse, placeOf, type Row } from '../http.js'
import type { Sql } from '../sql.js'
import { can, deptAllows } from '../../src/lib/permissions.js'
import { microbiologistsFor, onDutyNow } from '../roster.js'
import { areaFor, canReview, EXAMS, examKey, findExam, flagOf, FLOW, GROUP_LABEL, isPending, STATUS_LABEL, examLine, missingDetail, hasDetails } from '../../src/lib/exams.js'
import type { ImagingDetails } from '../../src/lib/imagingCatalog.js'
import { ensureExamCatalog } from '../db.js'
import { removeCatalogExams, setChangesText } from '../ronda11.js'
import { defaultAnalyte, defaultValues, mergeCriticalGroups, type CriticalAnalyte, type CriticalGroup } from '../../src/lib/clinicalConfig.js'
import { rangeFor, referenceFromRows } from '../../src/lib/labReference.js'
import { refRowsFor, toRefRow } from '../refLoader.js'
import type { ClinicExam, ExamGroup, ExamInput, ExamOrder, ExamProfile, ExamResultValue, ExamStatus } from '../../src/lib/types.js'

/** Un examen que se ordena (en la consulta, en una nota o en un set). */
export const examInput = z.object({
  group: z.enum(['lab', 'imaging']),
  name: z.string().trim().min(2, 'Escribe el nombre del examen.').max(160),
  region: z.string().trim().max(80).optional(),
  side: z.enum(['right', 'left', 'both']).optional(),
  indication: z.string().trim().max(300).optional(),
  priority: z.enum(['routine', 'urgent']).default('routine'),
  place: z.enum(['clinic', 'external']).default('clinic'),
  // CA5 (ronda 10): lo elegido al ordenar un estudio de imagen
  projections: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
  contrast: z.string().trim().max(40).optional(),
  detailed: z.boolean().optional(),
  // CA6 (ronda 11): «¿De qué?» de un estudio genérico (Rayos X, Ultrasonido, Tomografía…)
  subject: z.string().trim().max(120).optional(),
})

const j = <T>(v: unknown, fallback: T): T => { try { return v ? JSON.parse(String(v)) as T : fallback } catch { return fallback } }

const toClinicExam = (r: Row): ClinicExam => ({
  id: String(r.id), group: r.grp as ClinicExam['group'], name: String(r.name), active: Boolean(r.active), baseKey: r.base_key ? String(r.base_key) : undefined,
  createdBy: r.created_by ? String(r.created_by) : undefined, createdAt: String(r.created_at), archivedAt: r.archived_at ? String(r.archived_at) : undefined,
  subgroup: r.subgroup ? String(r.subgroup) : undefined,
  details: j<ClinicExam['details']>(r.details, undefined),
})

export const toExamOrder = (r: Row, events: Row[] = []): ExamOrder => ({
  id: String(r.id), patientId: String(r.patient_id), consultationId: r.consultation_id ? String(r.consultation_id) : undefined,
  hospitalizationId: r.hospitalization_id ? String(r.hospitalization_id) : undefined, noteId: r.note_id ? String(r.note_id) : undefined, batchId: String(r.batch_id),
  orderNo: r.order_no ? String(r.order_no) : undefined,
  group: r.grp as ExamOrder['group'], name: String(r.name), region: r.region ? String(r.region) : undefined, side: (r.side ? String(r.side) : undefined) as ExamOrder['side'],
  indication: r.indication ? String(r.indication) : undefined, priority: r.priority as ExamOrder['priority'], place: r.place as ExamOrder['place'], area: r.area as ExamOrder['area'],
  status: r.status as ExamStatus, orderedBy: String(r.ordered_by), orderedAt: String(r.ordered_at), statusAt: r.status_at ? String(r.status_at) : undefined,
  statusBy: r.status_by ? String(r.status_by) : undefined, cancelReason: r.cancel_reason ? String(r.cancel_reason) : undefined,
  result: j<ExamOrder['result']>(r.result, undefined), critical: Boolean(r.critical) || undefined,
  // GE4 (ronda 9): quien cargó el resultado lo puede corregir unos minutos, mientras el médico no lo revise
  resultVersion: Number(r.result_version ?? 1) > 1 ? Number(r.result_version) : undefined,
  resultGraceUntil: r.status === 'result' ? graceUntil(j<{ at?: string }>(r.result, {}).at) : undefined,
  reviewedBy: r.reviewed_by ? String(r.reviewed_by) : undefined, reviewedAt: r.reviewed_at ? String(r.reviewed_at) : undefined,
  uncatalogued: Boolean(r.uncatalogued) || undefined,
  projections: j<string[] | undefined>(r.projections, undefined), contrast: r.contrast ? String(r.contrast) : undefined, detailed: Boolean(r.detailed) || undefined,
  subject: r.subject ? String(r.subject) : undefined,
  // DP2/DP3 (ronda 11): ambulatorio, quién lo solicita, la orden en papel y «No se realizó»
  location: r.location ? String(r.location) as ExamOrder['location'] : undefined,
  requestedById: r.requested_by_id ? String(r.requested_by_id) : undefined, requestedByName: r.requested_by_name ? String(r.requested_by_name) : undefined,
  orderFileId: r.order_file_id ? String(r.order_file_id) : undefined,
  notDone: r.not_done_at ? { reason: String(r.not_done_reason ?? ''), at: String(r.not_done_at), by: String(r.not_done_by ?? '') } : undefined,
  events: events.filter((e) => e.exam_id === r.id).map((e) => ({ status: e.status as ExamStatus, by: String(e.by_id), at: String(e.at), note: e.note ? String(e.note) : undefined })),
})

/** Exámenes con sus eventos, ordenados: urgentes y pendientes primero no; aquí sólo por fecha (la pantalla ordena). */
export async function examsWhere(q: Sql, where: string, args: unknown[]) {
  const rows = await q.query(`SELECT * FROM exam_orders WHERE ${where} ORDER BY ordered_at, id`, args)
  const ids = rows.map((r) => String(r.id))
  const events = ids.length ? await q.query(`SELECT * FROM exam_events WHERE exam_id IN (${ids.map(() => '?').join(',')}) ORDER BY at`, ids) : []
  return rows.map((r) => toExamOrder(r, events))
}

/**
 * Inserta los exámenes pedidos juntos (un lote: se imprimen en una orden por grupo). El área destino se guarda desde ya:
 * laboratorio o imágenes si la clínica los tiene; si no, enfermería; externo, nadie (sólo va en la orden impresa).
 */
export async function insertExams(q: Sql, c: { clinicId: string; patientId: string; consultationId?: string; hospitalizationId?: string; noteId?: string; by: string; at: string; inStay?: boolean },
  list: ExamInput[]) {
  if (!list.length) return null
  const clinic = (await q.one('SELECT has_lab, has_imaging FROM clinics WHERE id = ?', [c.clinicId]))!
  // MC3 (ronda 6): un estudio que no está en el catálogo activo de la clínica queda «No catalogado» con el tipo que eligió el
  // médico, y va a la bandeja de su tipo como cualquier otro (antes, ronda 5, se volvía externo)
  await ensureExamCatalog(q, c.clinicId)
  const rows = await q.query('SELECT norm_key, base_key, details FROM exam_catalog WHERE clinic_id = ? AND active', [c.clinicId])
  const known = new Set(rows.map((r) => String(r.norm_key)))
  // CA5 (ronda 10): un estudio que pide proyección, contraste, lado o región no se ordena sin ellos
  for (const e of list) {
    const r = rows.find((x) => String(x.norm_key) === examKey(e.name))
    if (!r) continue
    const details = r.details ? JSON.parse(String(r.details)) as ImagingDetails : EXAMS.find((b) => examKey(b.name) === (r.base_key ?? r.norm_key))?.details
    const missing = missingDetail(e, details)
    if (missing) fail(400, `${e.name}: ${missing.charAt(0).toLowerCase()}${missing.slice(1)}.`)
    if (hasDetails(details)) e.detailed = true
  }
  const batch = randomUUID()
  // EX2 (ronda 8): número de orden correlativo por clínica y año (OE-2026-0001), el mismo para todo el lote
  await q.run('SELECT pg_advisory_xact_lock(hashtext(?))', [`oe:${c.clinicId}`])
  const year = new Date(c.at).getFullYear()
  const last = await q.one<{ n: number | null }>(`SELECT MAX(CAST(split_part(order_no, '-', 3) AS INTEGER))::int AS n FROM exam_orders WHERE clinic_id = ? AND order_no ~ ?`, [c.clinicId, `^OE-${year}-[0-9]+$`])
  const orderNo = `OE-${year}-${String((last?.n ? Number(last.n) : 0) + 1).padStart(4, '0')}`
  for (const raw of list) {
    const e = raw
    const uncatalogued = !known.has(examKey(raw.name))
    const id = randomUUID()
    const area = areaFor(e.group, e.place, c.inStay ?? !!c.hospitalizationId, { hasLab: Boolean(clinic.has_lab), hasImaging: Boolean(clinic.has_imaging) })
    await q.run(`INSERT INTO exam_orders (id, clinic_id, patient_id, consultation_id, hospitalization_id, note_id, batch_id, grp, name, region, side, indication, priority, place, area, status, ordered_by, ordered_at, uncatalogued, order_no,
        projections, contrast, detailed, subject)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'ordered',?,?,?,?,?,?,?,?)`,
    [id, c.clinicId, c.patientId, c.consultationId ?? null, c.hospitalizationId ?? null, c.noteId ?? null, batch, e.group, e.name, e.region || null, e.side ?? null, e.indication || null,
      e.priority, e.place, area, c.by, c.at, uncatalogued, orderNo, e.projections?.length ? JSON.stringify(e.projections.map((p) => p.trim()).filter(Boolean)) : null, e.contrast?.trim() || null, !!e.detailed, e.subject?.trim() || null])
    await q.run('INSERT INTO exam_events (id, clinic_id, exam_id, status, by_id, at) VALUES (?,?,?,?,?,?)', [randomUUID(), c.clinicId, id, 'ordered', c.by, c.at])
  }
  return batch
}

/**
 * Qué áreas atiende quien mira la bandeja. Mientras la clínica no tenga personas con rol de laboratorio o de imágenes,
 * todo lo que no es externo de consulta lo atiende enfermería (y el médico, si no hay enfermería en un consultorio).
 * Cuando existan esos roles, bastará con asignarlos: sus exámenes saldrán de la bandeja de enfermería.
 */
async function trayAreas(q: Sql, clinicId: string, role: string) {
  if (role === 'lab') return ['lab']
  if (role === 'imaging') return ['imaging']
  const staffed = async (r: string) => !!(await q.one(`SELECT 1 FROM staff WHERE clinic_id = ? AND active AND COALESCE(roles, '') LIKE ? LIMIT 1`, [clinicId, `%"${r}"%`]))
  // DP2 (ronda 11): enfermería sigue recibiendo las órdenes de laboratorio (las muestras las toman los dos)
  return ['nursing', 'lab', ...(await staffed('imaging') ? [] : ['imaging'])]
}

/**
 * EX1. Exámenes: Laboratorio e Imagen y gabinete. Los ordena el médico; los procesa el área que los realiza (hoy
 * enfermería); el resultado (valores por analito con rango, o archivo, o informe) avisa al médico que lo pidió, que lo
 * marca como revisado. Un valor fuera del umbral crítico de la clínica es una alerta crítica.
 */
export function registerExams(app: Express, { sql, auth, need, userOf, clinicOf, audit, patientName, patientRow, settings }: Ctx) {
  const examRow = async (cid: string, id: string) => (await sql.one('SELECT * FROM exam_orders WHERE id = ? AND clinic_id = ?', [id, cid])) ?? fail(404, 'El examen no existe.')
  const event = (q: Sql, cid: string, examId: string, status: ExamStatus, by: string, at: string, note?: string) =>
    q.run('INSERT INTO exam_events (id, clinic_id, exam_id, status, by_id, at, note) VALUES (?,?,?,?,?,?,?)', [randomUUID(), cid, examId, status, by, at, note ?? null])
  const label = (r: Row) => `${GROUP_LABEL[r.grp as 'lab']}: ${examLine(toExamOrder(r))}`
  // DP2 (ronda 11): «Muestra tomada por Lic. Urbina 08:15» (lo vio el otro primero)
  const alreadyText = async (r: Row, q: Sql = sql) => {
    if (r.status === 'sample' || r.status === 'done') {
      const by = r.status_by ? await q.one('SELECT name FROM staff WHERE id = ?', [String(r.status_by)]) : undefined
      const t = r.status_at ? new Date(String(r.status_at)).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Tegucigalpa' }) : ''
      return `${STATUS_LABEL[r.grp as ExamGroup][r.status as ExamStatus]} por ${by?.name ?? '—'} ${t}`.trim()
    }
    return 'Este examen ya avanzó a otra etapa. Actualiza la página.'
  }

  // AD4 (ronda 5): el catálogo de la clínica es la batería completa (activos y archivados) y los perfiles del médico
  app.get('/api/exams/catalog', auth, async (req, res) => {
    const cid = clinicOf(req)
    const user = userOf(req)
    await ensureExamCatalog(sql, cid)
    const [catalog, profiles] = await Promise.all([
      sql.query('SELECT * FROM exam_catalog WHERE clinic_id = ? ORDER BY name', [cid]),
      sql.query('SELECT * FROM exam_profiles WHERE clinic_id = ? AND archived_at IS NULL AND (owner_id IS NULL OR owner_id = ?) ORDER BY name', [cid, user.id]),
    ])
    // UM1 (ronda 8): cada examen con sus valores de referencia vigentes (por su nombre o el de la lista fija)
    const refs = (await sql.query('SELECT * FROM exam_ref_values WHERE clinic_id = ? AND archived_at IS NULL ORDER BY created_at, id', [cid])).map(toRefRow)
    const byKey = new Map<string, ReturnType<typeof toRefRow>[]>()
    for (const r of refs) byKey.set(r.examKey, [...(byKey.get(r.examKey) ?? []), r])
    res.json({
      exams: catalog.map((r) => { const e = toClinicExam(r); return { ...e, refs: byKey.get(String(r.norm_key)) ?? (r.base_key ? byKey.get(String(r.base_key)) : undefined) } }),
      profiles: profiles.map((r): ExamProfile => ({ id: String(r.id), name: String(r.name), ownerId: r.owner_id ? String(r.owner_id) : undefined, items: j(r.items, []), note: r.note ? String(r.note) : undefined })),
    })
  })

  // AD4 (ronda 5): sólo administración (en el consultorio, el titular en su vista de administrador) arma el catálogo.
  // Quitar es archivar: lo ya ordenado en notas anteriores no cambia.
  const catalogBody = z.object({ group: z.enum(['lab', 'imaging']), name: z.string().trim().min(2, 'Escribe el nombre del examen.').max(160),
    // CF3 (ronda 6): subgrupo; vacío se lee como «Otros»
    subgroup: z.string().trim().max(60).optional(),
    // CA5 (ronda 10): qué pide al ordenarlo (vacío: lo de la lista fija)
    details: z.object({ projections: z.array(z.string().trim().min(1).max(60)).max(15).optional(), contrast: z.enum(['ct', 'ct-multi', 'mr', 'ct2', 'mr2']).optional(),
      side: z.boolean().optional(), region: z.boolean().optional(),
      // CA6 (ronda 11): «¿De qué?», su ejemplo, lado opcional, escribir otra proyección o contraste y «+ Otro…»
      what: z.boolean().optional(), whatHint: z.string().trim().max(80).optional(), sideOptional: z.boolean().optional(), free: z.boolean().optional(),
      again: z.string().trim().max(60).optional() }).nullable().optional() })
  const catalogRow = async (cid: string, id: string) => (await sql.one('SELECT * FROM exam_catalog WHERE id = ? AND clinic_id = ?', [id, cid])) ?? fail(404, 'El examen no está en el catálogo.')
  app.post('/api/exams/catalog', auth, need('settings.manage', 'dept.config'), async (req, res) => {
    const b = parse(catalogBody, req.body)
    const cid = clinicOf(req)
    catalogEditor(userOf(req), b.group)
    await ensureExamCatalog(sql, cid)
    const key = examKey(b.name)
    const existing = await sql.one('SELECT * FROM exam_catalog WHERE clinic_id = ? AND norm_key = ?', [cid, key])
    if (existing?.active) fail(409, `${existing.name} ya está en el catálogo (${GROUP_LABEL[existing.grp as 'lab']}).`)
    const now = new Date().toISOString()
    if (existing) {
      await sql.run('UPDATE exam_catalog SET active = TRUE, archived_at = NULL, archived_by = NULL, grp = ?, subgroup = COALESCE(?, subgroup), updated_at = ?, updated_by = ? WHERE id = ?', [b.group, b.subgroup || null, now, userOf(req).id, String(existing.id)])
      await audit(userOf(req), `Volvió a agregar al catálogo de exámenes (${GROUP_LABEL[b.group]}): ${existing.name}`)
      return res.json(toClinicExam((await catalogRow(cid, String(existing.id)))!))
    }
    const id = randomUUID()
    await sql.run('INSERT INTO exam_catalog (id, clinic_id, grp, name, norm_key, subgroup, created_by, created_at, details) VALUES (?,?,?,?,?,?,?,?,?)',
      [id, cid, b.group, b.name, key, b.subgroup || null, userOf(req).id, now, b.group === 'imaging' && b.details ? JSON.stringify(b.details) : null])
    await audit(userOf(req), `Agregó al catálogo de exámenes (${GROUP_LABEL[b.group]}${b.subgroup ? ` · ${b.subgroup}` : ''}): ${b.name}${b.group === 'imaging' && b.details ? ` (pide al ordenar: ${detailsText(b.details)})` : ''}`)
    res.status(201).json(toClinicExam((await catalogRow(cid, id))!))
  })
  app.patch('/api/exams/catalog/:id', auth, need('settings.manage', 'dept.config'), async (req, res) => {
    const b = parse(catalogBody.partial().extend({ active: z.boolean().optional() }), req.body)
    const cid = clinicOf(req)
    const user = userOf(req)
    const r = (await catalogRow(cid, String(req.params.id)))!
    catalogEditor(user, r.grp as ExamGroup)
    if (b.group) catalogEditor(user, b.group)
    // CA7 (ronda 11): en el catálogo ya no se archiva; se quita (DELETE)
    if (b.active === false) fail(400, 'En el catálogo de exámenes ya no se archiva: usa «Quitar».')
    const name = b.name ?? String(r.name)
    const key = examKey(name)
    if (key !== r.norm_key && await sql.one('SELECT 1 FROM exam_catalog WHERE clinic_id = ? AND norm_key = ? AND id <> ?', [cid, key, String(r.id)])) fail(409, `Ya hay un examen «${name}» en el catálogo.`)
    const now = new Date().toISOString()
    const active = b.active ?? Boolean(r.active)
    await sql.run(`UPDATE exam_catalog SET name = ?, norm_key = ?, grp = ?, subgroup = ?, active = ?, archived_at = ?, archived_by = ?, updated_at = ?, updated_by = ?, details = ? WHERE id = ?`,
      [name, key, b.group ?? r.grp, b.subgroup === undefined ? r.subgroup ?? null : b.subgroup || null, active, active ? null : r.archived_at ?? now, active ? null : r.archived_by ?? user.id, now, user.id,
        b.details === undefined ? r.details ?? null : b.details ? JSON.stringify(b.details) : null, String(r.id)])
    const what = [
      b.name && b.name !== r.name && `«${r.name}» → «${b.name}»`,
      b.group && b.group !== r.grp && `${GROUP_LABEL[r.grp as 'lab']} → ${GROUP_LABEL[b.group]}`,
      b.subgroup !== undefined && (b.subgroup || null) !== (r.subgroup ?? null) && `subgrupo de ${name}: ${r.subgroup ?? 'sin subgrupo'} → ${b.subgroup || 'sin subgrupo'}`,
      b.details !== undefined && JSON.stringify(b.details ?? null) !== String(r.details ?? 'null') && `detalles al ordenar ${name}: ${detailsText(b.details ?? undefined)}`,
    ].filter(Boolean)
    if (what.length) await audit(user, `Editó en el catálogo de exámenes: ${what.join('; ')}`)
    if (b.active === false && r.active) await audit(user, `Archivó del catálogo de exámenes: ${name}`)
    if (b.active === true && !r.active) await audit(user, `Restauró en el catálogo de exámenes: ${name}`)
    res.json(toClinicExam((await catalogRow(cid, String(r.id)))!))
  })

  // CA7 (ronda 11): «Quitar» borra el examen del catálogo (con copia previa y la marca de quitado). Las órdenes que ya lo usan
  // guardan su nombre y no cambian; se quita de los sets y perfiles. Queda en la bitácora.
  app.delete('/api/exams/catalog/:id', auth, need('settings.manage', 'dept.config'), async (req, res) => {
    const cid = clinicOf(req)
    const user = userOf(req)
    const r = (await catalogRow(cid, String(req.params.id)))!
    catalogEditor(user, r.grp as ExamGroup)
    const out = await sql.tx((q) => removeCatalogExams(q, cid, [r], user.id, 'ca7-removed', `Quitado por ${user.name}`))
    await audit(user, `Quitó del catálogo de exámenes (${GROUP_LABEL[r.grp as 'lab']}): ${r.name}. Las órdenes que ya lo usan no cambian${out.sets.length ? `; se quitó de ${setChangesText(out.sets)}` : ''}`)
    res.json({ ok: true, sets: out.sets })
  })

  // Perfiles: el médico los suyos; administración los de la clínica
  app.post('/api/exams/profiles', auth, need('exams.order', 'settings.manage', 'dept.config'), async (req, res) => {
    const b = parse(z.object({ name: z.string().trim().min(3, 'Ponle un nombre al perfil.').max(100), items: z.array(z.object({ group: z.enum(['lab', 'imaging']), name: z.string().trim().min(2).max(160) })).min(2, 'Un perfil tiene al menos dos exámenes.').max(30), clinic: z.boolean().default(false) }), req.body)
    const user = userOf(req)
    const clinicWide = b.clinic && (can(user, 'settings.manage') || (can(user, 'dept.config') && user.role === 'lab'))
    if (!clinicWide && !can(user, 'exams.order')) fail(403, 'Sólo los médicos crean perfiles propios.')
    if (b.clinic && !clinicWide) fail(403, `Los perfiles ${placeOf(user.clinicKind).of} los editan Administración y el microbiólogo.`)
    const id = randomUUID()
    await sql.run('INSERT INTO exam_profiles (id, clinic_id, owner_id, name, items, created_by, created_at) VALUES (?,?,?,?,?,?,?)',
      [id, clinicOf(req), clinicWide ? null : user.id, b.name, JSON.stringify(b.items), user.id, new Date().toISOString()])
    await audit(user, `Creó el perfil de exámenes «${b.name}»${clinicWide ? ' de la clínica' : ''}`)
    res.status(201).json({ id, name: b.name, ownerId: clinicWide ? undefined : user.id, items: b.items })
  })
  // CF6 (ronda 6): perfiles de laboratorio de la clínica. Administración los ve todos (también los archivados), los edita, los
  // archiva y los restaura. El médico no los edita (403): los copia a «Mis sets».
  const profileItems = z.array(z.object({ group: z.enum(['lab', 'imaging']), name: z.string().trim().min(2).max(160) })).min(2, 'Un perfil tiene al menos dos exámenes.').max(40)
  app.get('/api/exams/profiles/clinic', auth, need('settings.manage', 'dept.work'), async (req, res) => {
    if (!can(userOf(req), 'settings.manage') && userOf(req).role !== 'lab') fail(403, 'Los perfiles de laboratorio son de Laboratorio.')
    const rows = await sql.query('SELECT * FROM exam_profiles WHERE clinic_id = ? AND owner_id IS NULL ORDER BY name', [clinicOf(req)])
    res.json(rows.map((r) => ({ id: String(r.id), name: String(r.name), items: j(r.items, []), note: r.note ? String(r.note) : undefined, archivedAt: r.archived_at ? String(r.archived_at) : undefined })))
  })
  app.patch('/api/exams/profiles/:id', auth, need('settings.manage', 'dept.config'), async (req, res) => {
    catalogEditor(userOf(req), 'lab')
    const b = parse(z.object({ name: z.string().trim().min(3, 'Ponle un nombre al perfil.').max(100).optional(), items: profileItems.optional(), archived: z.boolean().optional() }), req.body)
    const user = userOf(req)
    const r = (await sql.one('SELECT * FROM exam_profiles WHERE id = ? AND clinic_id = ? AND owner_id IS NULL', [String(req.params.id), clinicOf(req)])) ?? fail(404, 'El perfil no existe.')
    const archivedAt = b.archived === undefined ? r!.archived_at ?? null : b.archived ? r!.archived_at ?? new Date().toISOString() : null
    await sql.run('UPDATE exam_profiles SET name = ?, items = ?, archived_at = ? WHERE id = ?', [b.name ?? r!.name, b.items ? JSON.stringify(b.items) : r!.items, archivedAt, String(r!.id)])
    const what = [b.name && b.name !== r!.name && `nombre «${r!.name}» → «${b.name}»`, b.items && `${b.items.length} exámenes`,
      b.archived === true && !r!.archived_at && 'archivado', b.archived === false && r!.archived_at && 'restaurado'].filter(Boolean)
    await audit(user, `Editó el perfil de laboratorio de la clínica «${b.name ?? r!.name}»${what.length ? `: ${what.join('; ')}` : ''}`)
    res.json({ ok: true })
  })
  app.delete('/api/exams/profiles/:id', auth, need('exams.order', 'settings.manage'), async (req, res) => {
    const user = userOf(req)
    const r = (await sql.one('SELECT * FROM exam_profiles WHERE id = ? AND clinic_id = ? AND archived_at IS NULL', [String(req.params.id), clinicOf(req)])) ?? fail(404, 'El perfil no existe.')
    if (r!.owner_id ? r!.owner_id !== user.id : !can(user, 'settings.manage')) fail(403, 'Sólo quien lo creó lo quita.')
    await sql.run('UPDATE exam_profiles SET archived_at = ? WHERE id = ?', [new Date().toISOString(), String(r!.id)])
    await audit(user, `Quitó el perfil de exámenes «${r!.name}»`)
    res.json({ ok: true })
  })

  /**
   * UM1 (ronda 8): editar los valores de referencia de un examen (Administración; en un consultorio, la médica titular en su
   * vista de administración). Cada fila que cambia queda archivada (no se borra) y la nueva pasa a «Editado por la clínica»,
   * con la nota opcional: una carga futura del .md ya no la pisa. Todo queda en la bitácora.
   */
  const refInput = z.object({ id: z.string().optional(), analyte: z.string().trim().max(80).optional(), sex: z.enum(['all', 'F', 'M']).default('all'), unit: z.string().trim().max(40).default(''),
    low: z.number().finite().optional(), high: z.number().finite().optional(), highOpen: z.boolean().optional(), expected: z.string().trim().max(1000).optional(), note: z.string().trim().max(2000).optional(),
    archive: z.boolean().optional() })
  app.put('/api/exams/catalog/:id/refs', auth, need('settings.manage', 'dept.config'), async (req, res) => {
    catalogEditor(userOf(req), 'lab')
    const b = parse(z.object({ rows: z.array(refInput).max(80), comment: z.string().trim().max(500).optional() }), req.body)
    const cid = clinicOf(req)
    const user = userOf(req)
    const ex = (await sql.one('SELECT * FROM exam_catalog WHERE id = ? AND clinic_id = ?', [String(req.params.id), cid])) ?? fail(404, 'El examen no existe.')
    const current = await refRowsFor(sql, cid, String(ex!.name))
    const now = new Date().toISOString()
    const changes: string[] = []
    const show = (x: { low?: number; high?: number; highOpen?: boolean; expected?: string }) => x.expected ?? ([x.low, x.high != null ? `${x.highOpen ? '<' : ''}${x.high}` : undefined].filter((v) => v != null).join('–') || '—')
    for (const row of b.rows) {
      if (row.low != null && row.high != null && row.low > row.high) fail(400, `${row.analyte || ex!.name}: el mínimo no puede ser mayor que el máximo.`)
      const cur = row.id ? current.find((c) => c.id === row.id) : undefined
      if (row.id && !cur) fail(409, 'Ese valor ya cambió. Actualiza la página.')
      const label = `${row.analyte || 'resultado esperado'}${row.sex === 'F' ? ' (mujeres)' : row.sex === 'M' ? ' (hombres)' : ''}`
      if (cur && row.archive) {
        await sql.run('UPDATE exam_ref_values SET archived_at = ?, archived_by = ?, archive_reason = ? WHERE id = ?', [now, user.id, `Archivado por la clínica${b.comment ? `: ${b.comment}` : ''}`, cur.id])
        changes.push(`archivó ${label}`)
        continue
      }
      const same = cur && cur.low === row.low && cur.high === row.high && !!cur.highOpen === !!row.highOpen && (cur.expected ?? '') === (row.expected ?? '') && (cur.note ?? '') === (row.note ?? '') && cur.unit === row.unit
      if (same) continue
      if (cur) await sql.run('UPDATE exam_ref_values SET archived_at = ?, archived_by = ?, archive_reason = ? WHERE id = ?', [now, user.id, `Editado por la clínica${b.comment ? `: ${b.comment}` : ''}`, cur.id])
      await sql.run(`INSERT INTO exam_ref_values (id, clinic_id, exam_key, exam_name, analyte, sex, unit, low, high, high_open, expected, note, warn, sources, origin, origin_label, edit_note, created_at, created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'clinic', 'Editado por la clínica', ?,?,?)`,
      [randomUUID(), cid, cur?.examKey ?? String(ex!.norm_key), String(ex!.name), row.analyte ?? '', row.sex, row.unit, row.low ?? null, row.high ?? null, !!row.highOpen, row.expected || null, row.note || null,
        !!cur?.warn, JSON.stringify(['clinic']), b.comment || null, now, user.id])
      changes.push(cur ? `${label}: ${show(cur)} → ${show(row)}` : `agregó ${label}: ${show(row)}`)
    }
    if (changes.length) await audit(user, `Valores de referencia de ${ex!.name}: ${changes.join('; ')}${b.comment ? ` (nota: ${b.comment})` : ''}`)
    res.json(await refRowsFor(sql, cid, String(ex!.name)))
  })

  // UM1: historial de los valores de referencia de un examen (lo vigente y lo archivado, con quién y cuándo)
  app.get('/api/exams/catalog/:id/refs/history', auth, need('settings.manage', 'dept.work'), async (req, res) => {
    const cid = clinicOf(req)
    const ex = (await sql.one('SELECT * FROM exam_catalog WHERE id = ? AND clinic_id = ?', [String(req.params.id), cid])) ?? fail(404, 'El examen no existe.')
    const keys = [String(ex!.norm_key), ...(ex!.base_key ? [String(ex!.base_key)] : [])]
    const rows = await sql.query(`SELECT * FROM exam_ref_values WHERE clinic_id = ? AND exam_key IN (${keys.map(() => '?').join(',')}) ORDER BY created_at DESC, id`, [cid, ...keys])
    res.json(rows.map((r) => ({ ...toRefRow(r), archivedAt: r.archived_at ? String(r.archived_at) : undefined, archivedBy: r.archived_by ? String(r.archived_by) : undefined, archiveReason: r.archive_reason ? String(r.archive_reason) : undefined })))
  })

  // UM1 y UM2: la tabla de fuentes (código, cita completa, enlace)
  app.get('/api/lab-sources', auth, async (_req, res) => {
    res.json((await sql.query('SELECT * FROM lab_sources ORDER BY code')).map((r) => ({ code: String(r.code), citation: String(r.citation), urls: JSON.parse(String(r.urls ?? '[]')) })))
  })

  /**
   * AD1 (ronda 5): umbrales críticos por grupo. Se guarda la lista completa (los archivados se conservan) y cada cambio
   * queda en la bitácora con el valor anterior y el nuevo.
   */
  const limitsInput = z.object({ low: z.number().finite().optional(), high: z.number().finite().optional() })
  const analyteInput = z.object({ id: z.string().min(1).max(60), name: z.string().trim().min(1, 'Escribe el nombre del analito.').max(80), unit: z.string().trim().max(30).optional(),
    low: z.number().finite().optional(), high: z.number().finite().optional(), archivedAt: z.string().optional(), source: z.string().max(400).optional(),
    // UM2 (ronda 8): por sexo, y «Restablecer» (vuelve al valor predeterminado de la app)
    f: limitsInput.optional(), m: limitsInput.optional(), reset: z.boolean().optional() }).passthrough()
  const groupInput = z.object({ id: z.string().min(1).max(60), name: z.string().trim().min(2, 'Escribe el nombre del grupo.').max(60), archivedAt: z.string().optional(), analytes: z.array(analyteInput).max(80) })
  app.put('/api/settings/critical-groups', auth, need('settings.manage', 'dept.config'), async (req, res) => {
    catalogEditor(userOf(req), 'lab')
    const { groups: input } = parse(z.object({ groups: z.array(groupInput).max(60) }), req.body)
    const cid = clinicOf(req)
    const user = userOf(req)
    const before: CriticalGroup[] = mergeCriticalGroups((await settings(cid)).criticalGroups)
    const stamp = new Date().toISOString()
    const sameL = (a?: { low?: number; high?: number }, b?: { low?: number; high?: number }) => (a?.low ?? null) === (b?.low ?? null) && (a?.high ?? null) === (b?.high ?? null)
    // UM2: un analito que cambia queda «Personalizado» (quién y cuándo) y su valor anterior en el historial; «Restablecer» lo
    // devuelve al valor predeterminado de la app. El predeterminado se guarda aparte (en el código), nunca se pisa.
    const groups: CriticalGroup[] = input.map((g) => ({ ...g, analytes: g.analytes.map((raw) => {
      const { reset, ...a } = raw as typeof raw & { history?: CriticalAnalyte['history']; editedAt?: string; editedBy?: string }
      const o = before.flatMap((x) => x.analytes).find((x) => x.id === a.id)
      const d = defaultAnalyte(a.id)
      const history = [...(o?.history ?? [])]
      const prev = o ? { at: stamp, by: user.id, low: o.low, high: o.high, f: o.f, m: o.m } : undefined
      if (reset && d) {
        if (prev && !(sameL(o, d) && sameL(o?.f, d.f) && sameL(o?.m, d.m))) history.push({ ...prev, reason: 'Restablecido al valor predeterminado de la app' })
        return { ...a, ...defaultValues(d), history, editedAt: undefined, editedBy: undefined }
      }
      const changed = !o || !sameL(o, a) || !sameL(o.f, a.f) || !sameL(o.m, a.m)
      if (o && changed) history.push({ ...prev!, reason: 'Editado por la clínica' })
      return { ...a, history: history.length ? history : undefined, editedAt: changed && d ? stamp : o?.editedAt, editedBy: changed && d ? user.id : o?.editedBy }
    }) }))
    // UM3 (ronda 10): lo retirado sigue retirado (no se muestra ni vuelve a la lista de archivados)
    for (const g of groups) {
      const old = before.find((x) => x.id === g.id)
      if (old?.retiredAt) Object.assign(g, { archivedAt: old.archivedAt ?? stamp, retiredAt: old.retiredAt })
      for (const a of g.analytes) {
        const o = before.flatMap((x) => x.analytes).find((x) => x.id === a.id)
        if (o?.retiredAt) Object.assign(a, { archivedAt: o.archivedAt ?? stamp, retiredAt: o.retiredAt })
      }
    }
    for (const g of groups) for (const a of g.analytes) {
      for (const [l, sx] of [[a, ''], [a.f, ' (mujeres)'], [a.m, ' (hombres)']] as const) {
        if (l?.low != null && l?.high != null && l.low > l.high) fail(400, `${a.name}${sx}: el límite inferior no puede ser mayor que el superior.`)
      }
    }
    const active = groups.filter((g) => !g.archivedAt)
    if (new Set(active.map((g) => g.name.toLowerCase())).size !== active.length) fail(400, 'Hay dos grupos con el mismo nombre.')
    // Un analito tiene un solo umbral: no se repite entre los activos
    const names = active.flatMap((g) => g.analytes.filter((a) => !a.archivedAt).map((a) => examKey(a.name)))
    const twice = names.find((n, i) => names.indexOf(n) !== i)
    if (twice) fail(400, `${active.flatMap((g) => g.analytes).find((a) => examKey(a.name) === twice)!.name} está dos veces: un analito tiene un solo umbral.`)
    const lim = (x?: number) => (x == null ? 'no aplica' : String(x))
    const changes: string[] = []
    for (const g of groups) {
      const old = before.find((x) => x.id === g.id)
      if (!old) changes.push(`agregó el grupo «${g.name}»`)
      else {
        if (old.name !== g.name) changes.push(`renombró el grupo «${old.name}» a «${g.name}»`)
        if (!old.archivedAt && g.archivedAt) changes.push(`archivó el grupo «${g.name}»`)
        if (old.archivedAt && !g.archivedAt) changes.push(`restauró el grupo «${g.name}»`)
      }
      for (const a of g.analytes) {
        const o = old?.analytes.find((x) => x.id === a.id) ?? before.flatMap((x) => x.analytes).find((x) => x.id === a.id)
        if (!o) { changes.push(`agregó ${a.name}${a.unit ? ` (${a.unit})` : ''} a «${g.name}»: menor de ${lim(a.low)}, mayor de ${lim(a.high)}`); continue }
        const d: string[] = []
        if (o.name !== a.name) d.push(`nombre «${o.name}» → «${a.name}»`)
        if ((o.unit ?? '') !== (a.unit ?? '')) d.push(`unidad ${o.unit || 'sin unidad'} → ${a.unit || 'sin unidad'}`)
        if (o.low !== a.low) d.push(`crítico si es menor de ${lim(o.low)} → ${lim(a.low)}`)
        if (o.high !== a.high) d.push(`crítico si es mayor de ${lim(o.high)} → ${lim(a.high)}`)
        for (const [k, label] of [['f', 'mujeres'], ['m', 'hombres']] as const) {
          if ((o[k]?.low ?? null) !== (a[k]?.low ?? null)) d.push(`${label}: crítico si es menor de ${lim(o[k]?.low)} → ${lim(a[k]?.low)}`)
          if ((o[k]?.high ?? null) !== (a[k]?.high ?? null)) d.push(`${label}: crítico si es mayor de ${lim(o[k]?.high)} → ${lim(a[k]?.high)}`)
        }
        if (!a.editedAt && o.editedAt && defaultAnalyte(a.id)) d.push('restablecido al valor de la app')
        if (d.length) changes.push(`${a.name}: ${d.join('; ')}`)
        if (!o.archivedAt && a.archivedAt) changes.push(`archivó ${a.name} de «${g.name}»`)
        if (o.archivedAt && !a.archivedAt) changes.push(`restauró ${a.name} en «${g.name}»`)
      }
    }
    // Nada se borra: un grupo o analito que ya no viene se conserva archivado
    const now = new Date().toISOString()
    const kept: CriticalGroup[] = groups.map((g) => ({ ...g, analytes: [...g.analytes] }))
    for (const g of before) {
      const same = kept.find((x) => x.id === g.id)
      if (!same) { kept.push({ ...g, archivedAt: g.archivedAt ?? now }); if (!g.archivedAt) changes.push(`archivó el grupo «${g.name}»`); continue }
      for (const a of g.analytes) if (!same.analytes.some((x) => x.id === a.id)) {
        same.analytes.push({ ...a, archivedAt: a.archivedAt ?? now })
        if (!a.archivedAt) changes.push(`archivó ${a.name} de «${g.name}»`)
      }
    }
    await sql.run('UPDATE clinics SET critical_groups = ? WHERE id = ?', [JSON.stringify(kept), cid])
    for (const c of changes) await audit(user, `Umbrales críticos de laboratorio: ${c}`)
    res.json(await settings(cid))
  })

  // Áreas de servicio y umbrales críticos (administración)
  app.put('/api/settings/exam-areas', auth, need('settings.manage'), async (req, res) => {
    const b = parse(z.object({ hasLab: z.boolean(), hasImaging: z.boolean(), criticalLimits: z.record(z.string().max(60), z.object({ low: z.number().optional(), high: z.number().optional() })).optional() }), req.body)
    const cid = clinicOf(req)
    await sql.run('UPDATE clinics SET has_lab = ?, has_imaging = ?, critical_limits = COALESCE(?, critical_limits) WHERE id = ?', [b.hasLab, b.hasImaging, b.criticalLimits ? JSON.stringify(b.criticalLimits) : null, cid])
    await audit(userOf(req), `Áreas de servicio: laboratorio propio ${b.hasLab ? 'sí' : 'no'}, imágenes propias ${b.hasImaging ? 'sí' : 'no'}${b.criticalLimits ? '; actualizó los umbrales críticos' : ''}`)
    res.json(await settings(cid))
  })

  app.get('/api/patients/:id/exams', auth, need('chart.view'), async (req, res) => {
    const cid = clinicOf(req)
    if (!(await patientRow(cid, String(req.params.id)))) fail(404, 'El paciente no existe.')
    res.json(await examsWhere(sql, 'clinic_id = ? AND patient_id = ?', [cid, String(req.params.id)]))
  })

  // Orden impresa de un lote (una por grupo)
  app.get('/api/exams/batch/:batch', auth, need('chart.view'), async (req, res) => {
    const cid = clinicOf(req)
    const list = await examsWhere(sql, 'clinic_id = ? AND batch_id = ?', [cid, String(req.params.batch)])
    if (!list.length) fail(404, 'La orden no existe.')
    const first = list[0]
    const consult = first.consultationId ? await sql.one('SELECT diagnoses FROM consultations WHERE id = ? AND clinic_id = ?', [first.consultationId, cid]) : undefined
    const stay = first.hospitalizationId ? await sql.one('SELECT diagnoses FROM hospitalizations WHERE id = ? AND clinic_id = ?', [first.hospitalizationId, cid]) : undefined
    const doc = (await sql.one('SELECT id, name, doc_name, license, specialty, signature_id, stamp_id FROM staff WHERE id = ?', [first.orderedBy]))!
    res.json({ exams: list, diagnoses: j(consult?.diagnoses ?? stay?.diagnoses, []),
      doctor: { id: String(doc.id), name: String(doc.doc_name || doc.name), license: doc.license ? String(doc.license) : undefined, specialty: doc.specialty ? String(doc.specialty) : undefined,
        signatureId: doc.signature_id ? String(doc.signature_id) : undefined, stampId: doc.stamp_id ? String(doc.stamp_id) : undefined } })
  })

  // EX2 (ronda 8): cada impresión o descarga de una orden queda en la bitácora (quién, cuándo, qué orden)
  app.post('/api/exams/batch/:batch/printed', auth, need('chart.view'), async (req, res) => {
    const b = parse(z.object({ group: z.enum(['lab', 'imaging']), how: z.enum(['print', 'pdf']) }), req.body)
    const cid = clinicOf(req)
    const list = await examsWhere(sql, 'clinic_id = ? AND batch_id = ? AND grp = ?', [cid, String(req.params.batch), b.group])
    if (!list.length) fail(404, 'La orden no existe.')
    // GE4 (ronda 9): una orden impresa o descargada ya no se corrige en el periodo de gracia
    await sql.run('INSERT INTO print_log (id, clinic_id, target_kind, target_id, how, by_id, at) VALUES (?,?,?,?,?,?,?)',
      [randomUUID(), cid, `exam_${b.group}`, String(req.params.batch), b.how, userOf(req).id, new Date().toISOString()])
    await audit(userOf(req), `${b.how === 'pdf' ? 'Descargó en PDF' : 'Imprimió'} la orden de ${GROUP_LABEL[b.group].toLowerCase()}${list[0].orderNo ? ` ${list[0].orderNo}` : ''} de ${await patientName(list[0].patientId)}`)
    res.json({ ok: true })
  })

  // Bandeja de exámenes pendientes del área de quien mira (urgentes primero)
  app.get('/api/exams/tray', auth, need('exams.process'), async (req, res) => {
    const cid = clinicOf(req)
    const areas = await trayAreas(sql, cid, userOf(req).role)
    const list = await examsWhere(sql, `clinic_id = ? AND status IN ('ordered','sample','done') AND area IN (${areas.map(() => '?').join(',')})
      AND (hospitalization_id IS NULL OR hospitalization_id IN (SELECT id FROM hospitalizations WHERE status = 'active'))`, [cid, ...areas])
    // Ronda 8: una radiografía realizada ya salió de la bandeja (su informe es opcional)
    res.json(list.filter(isPending).sort((a, b) => (a.priority === 'urgent' ? 0 : 1) - (b.priority === 'urgent' ? 0 : 1) || a.orderedAt.localeCompare(b.orderedAt)))
  })

  // Resultados nuevos sin revisar del médico que los pidió
  app.get('/api/exams/new-results', auth, need('exams.order'), async (req, res) => {
    // DP2 (ronda 11): también lo que el departamento marcó «No se realizó» (el médico decide si lo cancela)
    const list = await examsWhere(sql, `clinic_id = ? AND ordered_by = ? AND (status = 'result' OR (not_done_at IS NOT NULL AND status IN ('ordered','sample','done')))`, [clinicOf(req), userOf(req).id])
    res.json(list.sort((a, b) => Number(!!b.critical) - Number(!!a.critical) || (b.result?.at ?? '').localeCompare(a.result?.at ?? '')))
  })

  // Muestra tomada (laboratorio) o realizado (imagen y gabinete)
  app.post('/api/exams/:id/status', auth, need('exams.process'), async (req, res) => {
    const b = parse(z.object({ status: z.enum(['sample', 'done']), note: z.string().trim().max(300).optional() }), req.body)
    const cid = clinicOf(req)
    const user = userOf(req)
    const r = await examRow(cid, String(req.params.id))
    if (!deptAllows(user, r!.grp as ExamGroup)) fail(403, 'Ese examen es de otro departamento.')
    const flow = FLOW[r!.grp as 'lab']
    if (!flow.includes(b.status)) fail(400, `Un examen de ${GROUP_LABEL[r!.grp as 'lab'].toLowerCase()} no pasa a «${STATUS_LABEL[r!.grp as 'lab'][b.status]}».`)
    if (r!.status !== 'ordered') fail(409, await alreadyText(r!))
    const at = new Date().toISOString()
    // Fuera de la transacción: con una sola conexión, consultar por fuera de ella la bloquearía
    const who = await patientName(String(r!.patient_id))
    await sql.tx(async (q) => {
      // DP2 (ronda 11): si dos lo marcan casi a la vez (laboratorio y enfermería), solo el primero queda
      const locked = await q.one(`SELECT status FROM exam_orders WHERE id = ? FOR UPDATE`, [String(r!.id)])
      if (locked?.status !== 'ordered') fail(409, await alreadyText((await q.one('SELECT * FROM exam_orders WHERE id = ?', [String(r!.id)]))!, q))
      await q.run('UPDATE exam_orders SET status = ?, status_at = ?, status_by = ?, not_done_reason = NULL, not_done_at = NULL, not_done_by = NULL WHERE id = ?', [b.status, at, user.id, String(r!.id)])
      await event(q, cid, String(r!.id), b.status, user.id, at, b.note)
      await audit(user, `${STATUS_LABEL[r!.grp as 'lab'][b.status]}: ${label(r!)} de ${who}`, q, String(r!.patient_id))
    })
    res.json((await examsWhere(sql, 'id = ?', [String(r!.id)]))[0])
  })

  /** Resultado: valores por analito (con rango y alto/bajo), informe de texto y archivos (foto o PDF). */
  app.post('/api/exams/:id/result', auth, need('exams.process'), async (req, res) => {
    const b = parse(z.object({
      values: z.array(z.object({ analyte: z.string().trim().min(1).max(80), value: z.string().trim().min(1).max(40), unit: z.string().trim().max(30).optional(), low: z.number().optional(), high: z.number().optional(),
        highOpen: z.boolean().optional() })).max(60).optional(),
      report: z.string().trim().max(6000).optional(),
      fileIds: z.array(z.string()).max(10).optional(),
      // GE4 (ronda 9): corregir el resultado recién cargado (quien lo cargó, en el periodo de gracia, sin revisar todavía)
      correct: z.boolean().optional(), version: z.number().int().optional(), why: z.string().trim().max(300).optional(),
      // EX6/DP6 (ronda 11): el microbiólogo responsable (si no hay uno solo de turno, se elige)
      responsibleId: z.string().optional(),
      // DP2 (A25): el técnico en imágenes sube las imágenes del estudio realizado; el informe lo escribe el radiólogo o un médico
      imagesOnly: z.boolean().optional(),
    }), req.body)
    if (!b.values?.length && !b.report && !b.fileIds?.length) fail(400, 'Escribe los valores o el informe, o sube el archivo del resultado.')
    const cid = clinicOf(req)
    const user = userOf(req)
    const r = await examRow(cid, String(req.params.id))
    if (!deptAllows(user, r!.grp as ExamGroup)) fail(403, 'Ese examen es de otro departamento.')
    const imagingTech = user.role === 'imaging' && user.position !== 'radiologist'
    if (imagingTech && (b.report || b.values?.length)) fail(403, 'El informe lo escribe el radiólogo o un médico. Puedes subir las imágenes del estudio.')
    if (b.imagesOnly || imagingTech) {
      if (r!.grp !== 'imaging' || r!.status !== 'done') fail(409, 'Las imágenes se suben a un estudio ya realizado.')
      for (const f of b.fileIds ?? []) if (!(await sql.one('SELECT 1 FROM attachments WHERE id = ? AND clinic_id = ? AND patient_id = ?', [f, cid, String(r!.patient_id)]))) fail(400, 'El archivo no corresponde a este paciente.')
      const prev = r!.result ? JSON.parse(String(r!.result)) as { fileIds?: string[] } : {}
      const files = [...new Set([...(prev.fileIds ?? []), ...(b.fileIds ?? [])])]
      const at = new Date().toISOString()
      const who = await patientName(String(r!.patient_id))
      await sql.tx(async (q) => {
        await q.run('UPDATE exam_orders SET result = ? WHERE id = ?', [JSON.stringify({ ...prev, fileIds: files, at, by: user.id, imagesOnly: true }), String(r!.id)])
        await event(q, cid, String(r!.id), 'done', user.id, at, `Subió ${b.fileIds?.length ?? 0} imagen(es)`)
        await audit(user, `Subió imágenes de ${label(r!)} de ${who}`, q, String(r!.patient_id))
      })
      return res.json((await examsWhere(sql, 'id = ?', [String(r!.id)]))[0])
    }
    // Laboratorio: el microbiólogo responsable (A24). Si lo carga él mismo, es él; si hay uno solo de turno, ese; si no,
    // se elige de la lista (obligatorio). Sin microbiólogos en la clínica, no aplica.
    let responsibleId: string | undefined
    if (r!.grp === 'lab' && !b.correct) {
      const micros = await microbiologistsFor(sql, cid)
      if (micros.some((m) => m.id === user.id)) responsibleId = user.id
      else if (micros.length) {
        const duty = (await onDutyNow(sql, cid, 'lab')).filter((id) => micros.some((m) => m.id === id))
        if (b.responsibleId) { if (!micros.some((m) => m.id === b.responsibleId)) fail(400, 'Elige un microbiólogo de la lista.'); responsibleId = b.responsibleId }
        else if (duty.length === 1) responsibleId = duty[0]
        // Obligatorio solo para el personal de Laboratorio; enfermería y el médico cargan como hoy (sin departamento)
        else if (user.role === 'lab') fail(400, 'Elige el microbiólogo responsable.')
      }
    }
    const before = r!.result ? JSON.parse(String(r!.result)) as { at?: string; by?: string } : undefined
    if (b.correct) {
      if (r!.status !== 'result') fail(409, r!.status === 'reviewed' ? 'El médico ya revisó este resultado: corrígelo con una adenda.' : 'Este examen no tiene resultado que corregir.')
      assertGrace(user.id, before?.by, before?.at, 'cargó el resultado')
      // EX6 (ronda 11): un resultado que ya se vio en PDF, se descargó o se imprimió no se corrige (GE4): se corrige con adenda
      if (await sql.one(`SELECT 1 FROM print_log WHERE target_kind = 'exam_result' AND target_id = ? LIMIT 1`, [String(r!.id)])) fail(409, 'Ya se imprimió o se descargó este resultado: no se corrige en el periodo de gracia.')
      if (Number(r!.result_version ?? 1) !== (b.version ?? 1)) fail(409, 'El resultado cambió mientras lo corregías. Actualiza la página.')
    } else if (['result', 'reviewed', 'cancelled'].includes(String(r!.status))) fail(409, 'Este examen ya tiene resultado o está cancelado.')
    for (const f of b.fileIds ?? []) if (!(await sql.one('SELECT 1 FROM attachments WHERE id = ? AND clinic_id = ? AND patient_id = ?', [f, cid, String(r!.patient_id)]))) fail(400, 'El archivo no corresponde a este paciente.')
    // AD4: si la clínica renombró un examen de la lista fija, sus analitos siguen viniendo de él
    const linked = await sql.one('SELECT base_key FROM exam_catalog WHERE clinic_id = ? AND norm_key = ?', [cid, examKey(String(r!.name))])
    // UM1 (ronda 8): los valores de referencia de la clínica (su base); si el examen no tiene, los del archivo o la lista fija
    const own = referenceFromRows(await refRowsFor(sql, cid, String(r!.name)))
    const base = own ? { analytes: own.analytes } : findExam(String(r!.name)) ?? (linked?.base_key ? findExam(EXAMS.find((e) => examKey(e.name) === linked.base_key)?.name ?? '') : undefined)
    // UM1 (ronda 8): el rango del documento de valores de referencia, por el sexo del paciente cuando los separa
    const sex = (await sql.one('SELECT sex FROM patients WHERE id = ?', [String(r!.patient_id)]))?.sex as 'F' | 'M' | undefined
    const values: ExamResultValue[] = (b.values ?? []).map((v) => {
      const num = Number(v.value.replace(',', '.'))
      const ref = base?.analytes?.find((x) => x.name === v.analyte)
      const range = ref ? rangeFor(ref, sex) : {}
      // El rango que trae el resultado (el del laboratorio que lo emite) manda sobre el de la app
      const own = v.low != null || v.high != null
      const low = own ? v.low : range.low
      const high = own ? v.high : range.high
      const highOpen = own ? v.highOpen : range.highOpen
      // Ronda 12 (LB3): sin umbrales críticos; solo Alto o Bajo frente al valor de referencia
      return { ...v, unit: v.unit ?? ref?.unit, low, high, highOpen: highOpen || undefined, reference: ref?.text, flag: Number.isFinite(num) && v.value.trim() !== '' ? flagOf(num, low, high, highOpen) : undefined }
    })
    // GE4: al corregir, la hora del primer registro se conserva (de ahí cuentan los minutos) y la versión anterior se guarda
    const at = b.correct && before?.at ? before.at : new Date().toISOString()
    const critical = false
    const who = await patientName(String(r!.patient_id))
    await sql.tx(async (q) => {
      if (b.correct) {
        const next = await saveVersion(q, { clinicId: cid, kind: 'exam_result', id: String(r!.id), version: Number(r!.result_version ?? 1), authorId: String(before!.by), at: String(before!.at), by: user.id, reason: b.why, data: before })
        await q.run('UPDATE exam_orders SET result_version = ? WHERE id = ?', [next, String(r!.id)])
        await audit(user, `Corrigió el resultado de ${label(r!)} de ${who} en el periodo de gracia (versión ${next})${b.why ? `: ${b.why}` : ''}`, q, String(r!.patient_id))
      }
      await q.run('UPDATE exam_orders SET status = ?, status_at = ?, status_by = ?, result = ?, critical = ? WHERE id = ?',
        ['result', b.correct ? r!.status_at : at, user.id, JSON.stringify({ values: values.length ? values : undefined, report: b.report || undefined,
          // DP2: las imágenes que subió el técnico se conservan con el informe
          fileIds: [...new Set([...(before && (before as { imagesOnly?: boolean }).imagesOnly ? (before as { fileIds?: string[] }).fileIds ?? [] : []), ...(b.fileIds ?? [])])].filter(Boolean).length
            ? [...new Set([...(before && (before as { imagesOnly?: boolean }).imagesOnly ? (before as { fileIds?: string[] }).fileIds ?? [] : []), ...(b.fileIds ?? [])])] : undefined,
          at, by: user.id, responsibleId: responsibleId ?? (b.correct ? (before as { responsibleId?: string } | undefined)?.responsibleId : undefined), correctedAt: b.correct ? new Date().toISOString() : undefined }), critical, String(r!.id)])
      await event(q, cid, String(r!.id), 'result', user.id, at, critical ? 'Valor crítico' : undefined)
      const flagged = values.filter((v) => v.flag).map((v) => `${v.analyte} ${v.value} (${v.flag === 'high' ? 'alto' : 'bajo'})`)
      await audit(user, `Cargó el resultado de ${label(r!)} de ${who}${flagged.length ? `: ${flagged.join(', ')}` : ''}${critical ? '; VALOR CRÍTICO' : ''}`, q, String(r!.patient_id))
    })
    res.json((await examsWhere(sql, 'id = ?', [String(r!.id)]))[0])
  })

  app.post('/api/exams/:id/review', auth, need('exams.order'), async (req, res) => {
    const cid = clinicOf(req)
    const user = userOf(req)
    const r = await examRow(cid, String(req.params.id))
    // Ronda 8: una radiografía (informe opcional) se revisa ya realizada
    if (!canReview({ status: r!.status as ExamOrder['status'], group: r!.grp as ExamOrder['group'], name: String(r!.name) })) fail(409, 'Sólo se revisa un examen con resultado.')
    const at = new Date().toISOString()
    // Fuera de la transacción: con una sola conexión, consultar por fuera de ella la bloquearía
    const who = await patientName(String(r!.patient_id))
    await sql.tx(async (q) => {
      await q.run(`UPDATE exam_orders SET status = 'reviewed', reviewed_by = ?, reviewed_at = ?, status_at = ?, status_by = ? WHERE id = ?`, [user.id, at, at, user.id, String(r!.id)])
      await event(q, cid, String(r!.id), 'reviewed', user.id, at)
      await audit(user, `Revisó el resultado de ${label(r!)} de ${who}`, q, String(r!.patient_id))
    })
    res.json((await examsWhere(sql, 'id = ?', [String(r!.id)]))[0])
  })

  app.post('/api/exams/:id/cancel', auth, need('exams.process', 'exams.order'), async (req, res) => {
    const { reason } = parse(z.object({ reason: z.string().trim().min(3, 'Escribe por qué se cancela.').max(300) }), req.body)
    const cid = clinicOf(req)
    const user = userOf(req)
    // DP2 (A21): Laboratorio e Imágenes no cancelan órdenes del médico; usan «No se realizó»
    if (user.role === 'lab' || user.role === 'imaging') fail(403, 'El departamento no cancela órdenes del médico: usa «No se realizó».')
    const r = await examRow(cid, String(req.params.id))
    if (['result', 'reviewed', 'cancelled'].includes(String(r!.status))) fail(409, 'Este examen ya tiene resultado o ya está cancelado.')
    const at = new Date().toISOString()
    // Fuera de la transacción: con una sola conexión, consultar por fuera de ella la bloquearía
    const who = await patientName(String(r!.patient_id))
    await sql.tx(async (q) => {
      await q.run(`UPDATE exam_orders SET status = 'cancelled', cancel_reason = ?, status_at = ?, status_by = ? WHERE id = ?`, [reason, at, user.id, String(r!.id)])
      await event(q, cid, String(r!.id), 'cancelled', user.id, at, reason)
      await audit(user, `Canceló ${label(r!)} de ${who}: ${reason}`, q, String(r!.patient_id))
    })
    res.json((await examsWhere(sql, 'id = ?', [String(r!.id)]))[0])
  })

  // Resultado que llega sin orden en el sistema (laboratorio externo): queda como examen con su archivo
  app.post('/api/exams/external-result', auth, need('exams.process'), async (req, res) => {
    const b = parse(z.object({ patientId: z.string(), hospitalizationId: z.string().optional(), group: z.enum(['lab', 'imaging']), name: z.string().trim().min(2).max(160),
      takenAt: z.string().optional(), fileIds: z.array(z.string()).min(1).max(10), report: z.string().trim().max(6000).optional() }), req.body)
    const cid = clinicOf(req)
    const user = userOf(req)
    if (!deptAllows(user, b.group)) fail(403, 'Ese tipo de examen es de otro departamento.')
    if (!(await patientRow(cid, b.patientId))) fail(404, 'El paciente no existe.')
    if (b.hospitalizationId && !(await sql.one('SELECT 1 FROM hospitalizations WHERE id = ? AND clinic_id = ? AND patient_id = ?', [b.hospitalizationId, cid, b.patientId]))) fail(404, 'La estancia no existe o es de otro paciente.')
    const at = b.takenAt ?? new Date().toISOString()
    const id = randomUUID()
    const who = await patientName(b.patientId)
    await sql.tx(async (q) => {
      await q.run(`INSERT INTO exam_orders (id, clinic_id, patient_id, hospitalization_id, batch_id, grp, name, priority, place, area, status, ordered_by, ordered_at, status_at, status_by, result)
        VALUES (?,?,?,?,?,?,?,'routine','external','none','result',?,?,?,?,?)`,
      [id, cid, b.patientId, b.hospitalizationId ?? null, randomUUID(), b.group, b.name, user.id, at, new Date().toISOString(), user.id,
        JSON.stringify({ fileIds: b.fileIds, report: b.report || undefined, at: new Date().toISOString(), by: user.id })])
      await event(q, cid, id, 'result', user.id, new Date().toISOString(), 'Resultado externo, sin orden en el sistema')
      await audit(user, `Subió el resultado externo de ${GROUP_LABEL[b.group]}: ${b.name} de ${who}`, q, b.patientId)
    })
    res.status(201).json((await examsWhere(sql, 'id = ?', [id]))[0])
  })
}

/** CA5 (ronda 10): los detalles de un estudio en palabras, para la bitácora. */
function detailsText(d?: ImagingDetails) {
  if (!d) return 'los de la lista fija'
  return [d.what && 'de qué', d.projections?.length && `proyecciones ${d.projections.join(', ')}${d.free ? ' (o escrita)' : ''}`,
    d.contrast && `contraste ${d.contrast.startsWith('mr') ? 'de resonancia' : d.contrast === 'ct-multi' ? 'de tomografía (con doble y triple)' : 'de tomografía'}${d.free ? ' (o escrito)' : ''}`,
    d.side && (d.sideOptional ? 'lado (opcional)' : 'lado'), d.region && 'región'].filter(Boolean).join('; ') || 'sin detalles'
}

/**
 * DP5 (ronda 11): el catálogo, los rangos, los perfiles y los umbrales los edita Administración (todo) y, en su departamento, el
 * Microbiólogo (Laboratorio) y el Radiólogo (Imagen y gabinete). Los técnicos solo ven (también por URL directa).
 */
function catalogEditor(u: Parameters<typeof can>[0] & { role: string }, group: ExamGroup) {
  if (can(u, 'settings.manage')) return
  if (!can(u, 'dept.config') || !deptAllows(u as { role: never }, group)) fail(403, 'Solo puedes editar la configuración de tu departamento.')
}
