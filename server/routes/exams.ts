import type { Express } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { type Ctx, fail, parse, type Row } from '../http.js'
import type { Sql } from '../sql.js'
import { can } from '../../src/lib/permissions.js'
import { areaFor, DEFAULT_CRITICAL, EXAMS, examKey, findExam, flagOf, FLOW, GROUP_LABEL, STATUS_LABEL } from '../../src/lib/exams.js'
import type { ClinicExam, ExamInput, ExamOrder, ExamProfile, ExamResultValue, ExamStatus } from '../../src/lib/types.js'

/** Un examen que se ordena (en la consulta, en una nota o en un set). */
export const examInput = z.object({
  group: z.enum(['lab', 'imaging']),
  name: z.string().trim().min(2, 'Escribe el nombre del examen.').max(160),
  region: z.string().trim().max(80).optional(),
  side: z.enum(['right', 'left', 'both']).optional(),
  indication: z.string().trim().max(300).optional(),
  priority: z.enum(['routine', 'urgent']).default('routine'),
  place: z.enum(['clinic', 'external']).default('clinic'),
})

const j = <T>(v: unknown, fallback: T): T => { try { return v ? JSON.parse(String(v)) as T : fallback } catch { return fallback } }

export const toExamOrder = (r: Row, events: Row[] = []): ExamOrder => ({
  id: String(r.id), patientId: String(r.patient_id), consultationId: r.consultation_id ? String(r.consultation_id) : undefined,
  hospitalizationId: r.hospitalization_id ? String(r.hospitalization_id) : undefined, noteId: r.note_id ? String(r.note_id) : undefined, batchId: String(r.batch_id),
  group: r.grp as ExamOrder['group'], name: String(r.name), region: r.region ? String(r.region) : undefined, side: (r.side ? String(r.side) : undefined) as ExamOrder['side'],
  indication: r.indication ? String(r.indication) : undefined, priority: r.priority as ExamOrder['priority'], place: r.place as ExamOrder['place'], area: r.area as ExamOrder['area'],
  status: r.status as ExamStatus, orderedBy: String(r.ordered_by), orderedAt: String(r.ordered_at), statusAt: r.status_at ? String(r.status_at) : undefined,
  statusBy: r.status_by ? String(r.status_by) : undefined, cancelReason: r.cancel_reason ? String(r.cancel_reason) : undefined,
  result: j<ExamOrder['result']>(r.result, undefined), critical: Boolean(r.critical) || undefined,
  reviewedBy: r.reviewed_by ? String(r.reviewed_by) : undefined, reviewedAt: r.reviewed_at ? String(r.reviewed_at) : undefined,
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
 * laboratorio o imágenes si la clínica los tiene; si no, enfermería; externo, enfermería en una estancia o nadie.
 */
export async function insertExams(q: Sql, c: { clinicId: string; patientId: string; consultationId?: string; hospitalizationId?: string; noteId?: string; by: string; at: string },
  list: ExamInput[]) {
  if (!list.length) return null
  const clinic = (await q.one('SELECT has_lab, has_imaging FROM clinics WHERE id = ?', [c.clinicId]))!
  const batch = randomUUID()
  for (const e of list) {
    const id = randomUUID()
    const area = areaFor(e.group, e.place, !!c.hospitalizationId, { hasLab: Boolean(clinic.has_lab), hasImaging: Boolean(clinic.has_imaging) })
    await q.run(`INSERT INTO exam_orders (id, clinic_id, patient_id, consultation_id, hospitalization_id, note_id, batch_id, grp, name, region, side, indication, priority, place, area, status, ordered_by, ordered_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'ordered',?,?)`,
    [id, c.clinicId, c.patientId, c.consultationId ?? null, c.hospitalizationId ?? null, c.noteId ?? null, batch, e.group, e.name, e.region || null, e.side ?? null, e.indication || null,
      e.priority, e.place, area, c.by, c.at])
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
  return ['nursing', ...(await staffed('lab') ? [] : ['lab']), ...(await staffed('imaging') ? [] : ['imaging'])]
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
  const label = (r: Row) => `${GROUP_LABEL[r.grp as 'lab']}: ${r.name}${r.region ? ` de ${r.region}` : ''}`

  // Catálogo de la clínica y perfiles (los base están en el código)
  app.get('/api/exams/catalog', auth, async (req, res) => {
    const cid = clinicOf(req)
    const user = userOf(req)
    const [catalog, profiles] = await Promise.all([
      sql.query('SELECT * FROM exam_catalog WHERE clinic_id = ? ORDER BY name', [cid]),
      sql.query('SELECT * FROM exam_profiles WHERE clinic_id = ? AND archived_at IS NULL AND (owner_id IS NULL OR owner_id = ?) ORDER BY name', [cid, user.id]),
    ])
    res.json({
      exams: catalog.map((r): ClinicExam => ({ id: String(r.id), group: r.grp as ClinicExam['group'], name: String(r.name), active: Boolean(r.active), createdBy: String(r.created_by), createdAt: String(r.created_at) })),
      profiles: profiles.map((r): ExamProfile => ({ id: String(r.id), name: String(r.name), ownerId: r.owner_id ? String(r.owner_id) : undefined, items: j(r.items, []) })),
    })
  })

  app.post('/api/exams/catalog', auth, need('exams.order', 'settings.manage'), async (req, res) => {
    const b = parse(z.object({ group: z.enum(['lab', 'imaging']), name: z.string().trim().min(2, 'Escribe el nombre del examen.').max(160) }), req.body)
    const cid = clinicOf(req)
    const key = examKey(b.name)
    const base = EXAMS.find((e) => examKey(e.name) === key)
    if (base) fail(409, `${base.name} ya está en el catálogo (${GROUP_LABEL[base.group]}).`)
    const existing = await sql.one('SELECT * FROM exam_catalog WHERE clinic_id = ? AND norm_key = ?', [cid, key])
    if (existing) {
      if (!existing.active) await sql.run('UPDATE exam_catalog SET active = TRUE WHERE id = ?', [String(existing.id)])
      return res.json({ id: String(existing.id), group: existing.grp, name: existing.name, active: true })
    }
    const id = randomUUID()
    await sql.run('INSERT INTO exam_catalog (id, clinic_id, grp, name, norm_key, created_by, created_at) VALUES (?,?,?,?,?,?,?)', [id, cid, b.group, b.name, key, userOf(req).id, new Date().toISOString()])
    await audit(userOf(req), `Agregó al catálogo de exámenes (${GROUP_LABEL[b.group]}): ${b.name}`)
    res.status(201).json({ id, group: b.group, name: b.name, active: true })
  })

  // Perfiles: el médico los suyos; administración los de la clínica
  app.post('/api/exams/profiles', auth, need('exams.order', 'settings.manage'), async (req, res) => {
    const b = parse(z.object({ name: z.string().trim().min(3, 'Ponle un nombre al perfil.').max(100), items: z.array(z.object({ group: z.enum(['lab', 'imaging']), name: z.string().trim().min(2).max(160) })).min(2, 'Un perfil tiene al menos dos exámenes.').max(30), clinic: z.boolean().default(false) }), req.body)
    const user = userOf(req)
    const clinicWide = b.clinic && can(user, 'settings.manage')
    if (!clinicWide && !can(user, 'exams.order')) fail(403, 'Sólo los médicos crean perfiles propios.')
    const id = randomUUID()
    await sql.run('INSERT INTO exam_profiles (id, clinic_id, owner_id, name, items, created_by, created_at) VALUES (?,?,?,?,?,?,?)',
      [id, clinicOf(req), clinicWide ? null : user.id, b.name, JSON.stringify(b.items), user.id, new Date().toISOString()])
    await audit(user, `Creó el perfil de exámenes «${b.name}»${clinicWide ? ' de la clínica' : ''}`)
    res.status(201).json({ id, name: b.name, ownerId: clinicWide ? undefined : user.id, items: b.items })
  })
  app.delete('/api/exams/profiles/:id', auth, need('exams.order', 'settings.manage'), async (req, res) => {
    const user = userOf(req)
    const r = (await sql.one('SELECT * FROM exam_profiles WHERE id = ? AND clinic_id = ? AND archived_at IS NULL', [String(req.params.id), clinicOf(req)])) ?? fail(404, 'El perfil no existe.')
    if (r!.owner_id ? r!.owner_id !== user.id : !can(user, 'settings.manage')) fail(403, 'Sólo quien lo creó lo quita.')
    await sql.run('UPDATE exam_profiles SET archived_at = ? WHERE id = ?', [new Date().toISOString(), String(r!.id)])
    await audit(user, `Quitó el perfil de exámenes «${r!.name}»`)
    res.json({ ok: true })
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
    ;(await patientRow(cid, String(req.params.id))) ?? fail(404, 'El paciente no existe.')
    res.json(await examsWhere(sql, 'clinic_id = ? AND patient_id = ?', [cid, String(req.params.id)]))
  })

  // Orden impresa de un lote (una por grupo)
  app.get('/api/exams/batch/:batch', auth, need('chart.view'), async (req, res) => {
    const cid = clinicOf(req)
    const list = await examsWhere(sql, 'clinic_id = ? AND batch_id = ?', [cid, String(req.params.batch)])
    if (!list.length) fail(404, 'La orden no existe.')
    const first = list[0]
    const consult = first.consultationId ? await sql.one('SELECT diagnoses FROM consultations WHERE id = ?', [first.consultationId]) : undefined
    const stay = first.hospitalizationId ? await sql.one('SELECT diagnoses FROM hospitalizations WHERE id = ?', [first.hospitalizationId]) : undefined
    const doc = (await sql.one('SELECT id, name, doc_name, license, specialty, signature_id, stamp_id FROM staff WHERE id = ?', [first.orderedBy]))!
    res.json({ exams: list, diagnoses: j(consult?.diagnoses ?? stay?.diagnoses, []),
      doctor: { id: String(doc.id), name: String(doc.doc_name || doc.name), license: doc.license ? String(doc.license) : undefined, specialty: doc.specialty ? String(doc.specialty) : undefined,
        signatureId: doc.signature_id ? String(doc.signature_id) : undefined, stampId: doc.stamp_id ? String(doc.stamp_id) : undefined } })
  })

  // Bandeja de exámenes pendientes del área de quien mira (urgentes primero)
  app.get('/api/exams/tray', auth, need('exams.process'), async (req, res) => {
    const cid = clinicOf(req)
    const areas = await trayAreas(sql, cid, userOf(req).role)
    const list = await examsWhere(sql, `clinic_id = ? AND status IN ('ordered','sample','done') AND area IN (${areas.map(() => '?').join(',')})
      AND (hospitalization_id IS NULL OR hospitalization_id IN (SELECT id FROM hospitalizations WHERE status = 'active'))`, [cid, ...areas])
    res.json(list.sort((a, b) => (a.priority === 'urgent' ? 0 : 1) - (b.priority === 'urgent' ? 0 : 1) || a.orderedAt.localeCompare(b.orderedAt)))
  })

  // Resultados nuevos sin revisar del médico que los pidió
  app.get('/api/exams/new-results', auth, need('exams.order'), async (req, res) => {
    const list = await examsWhere(sql, `clinic_id = ? AND ordered_by = ? AND status = 'result'`, [clinicOf(req), userOf(req).id])
    res.json(list.sort((a, b) => Number(!!b.critical) - Number(!!a.critical) || (b.result?.at ?? '').localeCompare(a.result?.at ?? '')))
  })

  // Muestra tomada (laboratorio) o realizado (imagen y gabinete)
  app.post('/api/exams/:id/status', auth, need('exams.process'), async (req, res) => {
    const b = parse(z.object({ status: z.enum(['sample', 'done']), note: z.string().trim().max(300).optional() }), req.body)
    const cid = clinicOf(req)
    const user = userOf(req)
    const r = await examRow(cid, String(req.params.id))
    const flow = FLOW[r!.grp as 'lab']
    if (!flow.includes(b.status)) fail(400, `Un examen de ${GROUP_LABEL[r!.grp as 'lab'].toLowerCase()} no pasa a «${STATUS_LABEL[r!.grp as 'lab'][b.status]}».`)
    if (r!.status !== 'ordered') fail(409, 'Este examen ya avanzó a otra etapa. Actualiza la página.')
    const at = new Date().toISOString()
    // Fuera de la transacción: con una sola conexión, consultar por fuera de ella la bloquearía
    const who = await patientName(String(r!.patient_id))
    await sql.tx(async (q) => {
      await q.run('UPDATE exam_orders SET status = ?, status_at = ?, status_by = ? WHERE id = ?', [b.status, at, user.id, String(r!.id)])
      await event(q, cid, String(r!.id), b.status, user.id, at, b.note)
      await audit(user, `${STATUS_LABEL[r!.grp as 'lab'][b.status]}: ${label(r!)} de ${who}`, q, String(r!.patient_id))
    })
    res.json((await examsWhere(sql, 'id = ?', [String(r!.id)]))[0])
  })

  /** Resultado: valores por analito (con rango y alto/bajo), informe de texto y archivos (foto o PDF). */
  app.post('/api/exams/:id/result', auth, need('exams.process'), async (req, res) => {
    const b = parse(z.object({
      values: z.array(z.object({ analyte: z.string().trim().min(1).max(80), value: z.string().trim().min(1).max(40), unit: z.string().trim().max(20).optional(), low: z.number().optional(), high: z.number().optional() })).max(40).optional(),
      report: z.string().trim().max(6000).optional(),
      fileIds: z.array(z.string()).max(10).optional(),
    }), req.body)
    if (!b.values?.length && !b.report && !b.fileIds?.length) fail(400, 'Escribe los valores o el informe, o sube el archivo del resultado.')
    const cid = clinicOf(req)
    const user = userOf(req)
    const r = await examRow(cid, String(req.params.id))
    if (['result', 'reviewed', 'cancelled'].includes(String(r!.status))) fail(409, 'Este examen ya tiene resultado o está cancelado.')
    for (const f of b.fileIds ?? []) if (!(await sql.one('SELECT 1 FROM attachments WHERE id = ? AND clinic_id = ? AND patient_id = ?', [f, cid, String(r!.patient_id)]))) fail(400, 'El archivo no corresponde a este paciente.')
    const limits = { ...DEFAULT_CRITICAL, ...((await settings(cid)).criticalLimits ?? {}) }
    const values: ExamResultValue[] = (b.values ?? []).map((v) => {
      const num = Number(v.value.replace(',', '.'))
      const ref = findExam(String(r!.name))?.analytes?.find((x) => x.name === v.analyte)
      const low = v.low ?? ref?.low
      const high = v.high ?? ref?.high
      const lim = limits[v.analyte]
      const critical = Number.isFinite(num) && !!lim && ((lim.low != null && num < lim.low) || (lim.high != null && num > lim.high))
      return { ...v, unit: v.unit ?? ref?.unit, low, high, flag: Number.isFinite(num) ? flagOf(num, low, high) : undefined, critical: critical || undefined }
    })
    const at = new Date().toISOString()
    const critical = values.some((v) => v.critical)
    const who = await patientName(String(r!.patient_id))
    await sql.tx(async (q) => {
      await q.run('UPDATE exam_orders SET status = ?, status_at = ?, status_by = ?, result = ?, critical = ? WHERE id = ?',
        ['result', at, user.id, JSON.stringify({ values: values.length ? values : undefined, report: b.report || undefined, fileIds: b.fileIds?.length ? b.fileIds : undefined, at, by: user.id }), critical, String(r!.id)])
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
    if (r!.status !== 'result') fail(409, 'Sólo se revisa un examen con resultado.')
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
    ;(await patientRow(cid, b.patientId)) ?? fail(404, 'El paciente no existe.')
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
