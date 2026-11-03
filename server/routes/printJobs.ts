import type { Express } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { type Ctx, fail, parse, type Row } from '../http.js'
import { examsWhere } from './exams.js'
import { toInpatientMed } from '../mappers.js'
import { can } from '../../src/lib/permissions.js'
import { GROUP_LABEL, isPending } from '../../src/lib/exams.js'
import type { ExamGroup } from '../../src/lib/types.js'

/**
 * EX5 y ME10 (ronda 10): impresiones desde la pestaña Exámenes («Imprimir orden» de los pendientes) y desde la hoja de
 * medicamentos o la nota («Receta» de lo que la clínica no tiene). Cada pedido queda como un trabajo de impresión (qué
 * renglones, quién y cuándo); el documento sale con los datos del MÉDICO QUE INDICÓ (uno por médico), nunca de quien imprime.
 * Cada impresión o descarga queda en print_log por renglón, así que cuenta para el bloqueo de GE4, y en la bitácora.
 * Pueden imprimir Médico y Enfermería (y en Consultorio, la médica y su asistente); Recepción no (tampoco por URL).
 */
export function registerPrintJobs(app: Express, { sql, auth, need, userOf, clinicOf, audit, patientName }: Ctx) {
  const doctorOf = async (id: string) => {
    const d = await sql.one('SELECT id, name, doc_name, license, specialty, signature_id, stamp_id FROM staff WHERE id = ?', [id])
    return d ? { id: String(d.id), name: String(d.doc_name || d.name), license: d.license ? String(d.license) : undefined, specialty: d.specialty ? String(d.specialty) : undefined,
      signatureId: d.signature_id ? String(d.signature_id) : undefined, stampId: d.stamp_id ? String(d.stamp_id) : undefined } : { id, name: '—' }
  }
  // Quién puede: el expediente y, para exámenes, quien los ordena o los procesa; para recetas, quien indica o aplica
  const allowed = (req: Parameters<Ctx['userOf']>[0], kind: 'exams' | 'rx') => {
    const u = userOf(req)
    if (!can(u, 'chart.view')) return false
    return kind === 'exams' ? can(u, 'exams.order') || can(u, 'exams.process') : can(u, 'inpatient.orders') || can(u, 'inpatient.care')
  }
  const medsOf = (cid: string, ids: string[]) => (ids.length ? sql.query(`SELECT * FROM hosp_meds WHERE clinic_id = ? AND id IN (${ids.map(() => '?').join(',')})`, [cid, ...ids]) : Promise.resolve([] as Row[]))

  const body = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('exams'), examIds: z.array(z.string()).min(1, 'Elige al menos un examen.').max(60) }),
    // Receta: los medicamentos elegidos o, al firmar una nota, los de esa nota marcados «va a receta»
    z.object({ kind: z.literal('rx'), medIds: z.array(z.string()).max(60).optional(), noteId: z.string().optional() }),
  ])
  app.post('/api/print-jobs', auth, need('exams.order', 'exams.process', 'inpatient.orders', 'inpatient.care'), async (req, res) => {
    const b = parse(body, req.body)
    if (!allowed(req, b.kind)) fail(403, 'No tienes permiso para imprimir esto.')
    const cid = clinicOf(req)
    let patientId = ''
    let stayId: string | null = null
    let items: string[] = []
    if (b.kind === 'exams') {
      const list = await examsWhere(sql, `clinic_id = ? AND id IN (${b.examIds.map(() => '?').join(',')})`, [cid, ...b.examIds])
      if (list.length !== new Set(b.examIds).size) fail(404, 'Algún examen no existe.')
      if (new Set(list.map((e) => e.patientId)).size > 1) fail(400, 'Los exámenes son de pacientes distintos.')
      if (new Set(list.map((e) => e.group)).size > 1) fail(400, 'La orden es de laboratorio o de imagen y gabinete, no de los dos.')
      // Solo los pendientes (sin resultado ni cancelados)
      const done = list.find((e) => e.status === 'cancelled' || !isPending(e))
      if (done) fail(409, `${done.name} ya no está pendiente.`)
      patientId = list[0].patientId
      stayId = list[0].hospitalizationId ?? null
      items = list.map((e) => e.id)
    } else {
      let rows: Row[]
      if (b.noteId) rows = await sql.query(`SELECT * FROM hosp_meds WHERE clinic_id = ? AND source = 'note' AND source_id = ? AND buy_outside = TRUE AND stopped_at IS NULL ORDER BY source_index`, [cid, b.noteId])
      else rows = await medsOf(cid, b.medIds ?? [])
      if (!rows.length) fail(400, 'No hay medicamentos marcados «No hay en la clínica (va a receta)».')
      if (b.medIds && rows.length !== new Set(b.medIds).size) fail(404, 'Algún medicamento no existe.')
      const off = rows.find((r) => !r.buy_outside)
      if (off) fail(400, `${off.drug} no está marcado «No hay en la clínica (va a receta)».`)
      if (new Set(rows.map((r) => String(r.patient_id))).size > 1) fail(400, 'Los medicamentos son de pacientes distintos.')
      patientId = String(rows[0].patient_id)
      stayId = String(rows[0].hospitalization_id)
      items = rows.map((r) => String(r.id))
    }
    const id = randomUUID()
    await sql.run('INSERT INTO print_jobs (id, clinic_id, patient_id, hospitalization_id, kind, items, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)',
      [id, cid, patientId, stayId, b.kind, JSON.stringify(items), userOf(req).id, new Date().toISOString()])
    res.status(201).json({ id })
  })

  /** El trabajo con sus documentos: uno por médico que indicó (y, en exámenes, por grupo). */
  app.get('/api/print-jobs/:id', auth, need('exams.order', 'exams.process', 'inpatient.orders', 'inpatient.care'), async (req, res) => {
    const cid = clinicOf(req)
    const job = (await sql.one('SELECT * FROM print_jobs WHERE id = ? AND clinic_id = ?', [String(req.params.id), cid])) ?? fail(404, 'La impresión no existe.')
    const kind = String(job!.kind) as 'exams' | 'rx'
    if (!allowed(req, kind)) fail(403, 'No tienes permiso para ver esto.')
    const ids = JSON.parse(String(job!.items)) as string[]
    const by = new Map<string, string[]>()
    let exams: Awaited<ReturnType<typeof examsWhere>> = []
    let meds: ReturnType<typeof toInpatientMed>[] = []
    if (kind === 'exams') {
      exams = await examsWhere(sql, `clinic_id = ? AND id IN (${ids.map(() => '?').join(',')})`, [cid, ...ids])
      for (const e of exams) by.set(e.orderedBy, [...(by.get(e.orderedBy) ?? []), e.id])
    } else {
      meds = (await medsOf(cid, ids)).map(toInpatientMed)
      for (const m of meds) by.set(m.orderedBy, [...(by.get(m.orderedBy) ?? []), m.id])
    }
    const doctors = await Promise.all([...by.entries()].map(async ([doctorId, items]) => ({ doctor: await doctorOf(doctorId), items })))
    const printed = await sql.query('SELECT how, by_id, at FROM print_log WHERE target_kind = ? AND target_id = ? ORDER BY at', ['print_job', String(job!.id)])
    res.json({ id: String(job!.id), kind, patientId: String(job!.patient_id), hospitalizationId: job!.hospitalization_id ? String(job!.hospitalization_id) : undefined,
      createdBy: String(job!.created_by), createdAt: String(job!.created_at), exams, meds, doctors, printed: printed.map((p) => ({ how: String(p.how), by: String(p.by_id), at: String(p.at) })) })
  })

  /** Imprimir o descargar: queda por renglón (GE4) y en la bitácora, con quién lo hizo y de qué médico es. */
  app.post('/api/print-jobs/:id/printed', auth, need('exams.order', 'exams.process', 'inpatient.orders', 'inpatient.care'), async (req, res) => {
    const b = parse(z.object({ how: z.enum(['print', 'pdf']) }), req.body)
    const cid = clinicOf(req)
    const job = (await sql.one('SELECT * FROM print_jobs WHERE id = ? AND clinic_id = ?', [String(req.params.id), cid])) ?? fail(404, 'La impresión no existe.')
    const kind = String(job!.kind) as 'exams' | 'rx'
    if (!allowed(req, kind)) fail(403, 'No tienes permiso para imprimir esto.')
    const ids = JSON.parse(String(job!.items)) as string[]
    const user = userOf(req)
    const at = new Date().toISOString()
    // Lo que dice la bitácora se arma antes (dentro de la transacción solo se usa su conexión: PGlite tiene una sola)
    let what = ''
    if (kind === 'exams') {
      const list = await examsWhere(sql, `clinic_id = ? AND id IN (${ids.map(() => '?').join(',')})`, [cid, ...ids])
      what = `la orden de ${GROUP_LABEL[(list[0]?.group ?? 'lab') as ExamGroup].toLowerCase()} (${list.map((e) => e.name).join(', ')})`
    } else what = `la receta de lo que no hay en la clínica (${(await medsOf(cid, ids)).map((r) => String(r.drug)).join(', ')})`
    const who = await patientName(String(job!.patient_id))
    await sql.tx(async (q) => {
      await q.run('INSERT INTO print_log (id, clinic_id, target_kind, target_id, how, by_id, at) VALUES (?,?,?,?,?,?,?)', [randomUUID(), cid, 'print_job', String(job!.id), b.how, user.id, at])
      for (const id of ids) await q.run('INSERT INTO print_log (id, clinic_id, target_kind, target_id, how, by_id, at) VALUES (?,?,?,?,?,?,?)', [randomUUID(), cid, kind === 'exams' ? 'exam_item' : 'hosp_med', id, b.how, user.id, at])
      await audit(user, `${b.how === 'pdf' ? 'Descargó en PDF' : 'Imprimió'} ${what} de ${who}`, q, String(job!.patient_id))
    })
    res.json({ ok: true })
  })

  /** «Órdenes impresas» de la pestaña Exámenes y de la hoja: lo que se imprimió desde ahí, con quién y cuándo. */
  app.get('/api/patients/:id/print-jobs', auth, need('exams.order', 'exams.process', 'inpatient.orders', 'inpatient.care'), async (req, res) => {
    if (!can(userOf(req), 'chart.view')) fail(403, 'No tienes permiso para ver esto.')
    const cid = clinicOf(req)
    const rows = await sql.query(`SELECT j.*, (SELECT MAX(l.at) FROM print_log l WHERE l.target_kind = 'print_job' AND l.target_id = j.id) AS printed_at,
      (SELECT l.by_id FROM print_log l WHERE l.target_kind = 'print_job' AND l.target_id = j.id ORDER BY l.at DESC LIMIT 1) AS printed_by
      FROM print_jobs j WHERE j.clinic_id = ? AND j.patient_id = ? ORDER BY j.created_at DESC`, [cid, String(req.params.id)])
    res.json(rows.filter((r) => r.printed_at).map((r) => ({ id: String(r.id), kind: String(r.kind), hospitalizationId: r.hospitalization_id ? String(r.hospitalization_id) : undefined,
      items: JSON.parse(String(r.items)) as string[], printedAt: String(r.printed_at), printedBy: String(r.printed_by) })))
  })
}
