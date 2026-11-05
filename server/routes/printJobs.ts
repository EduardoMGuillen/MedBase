import type { Express } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { type Ctx, fail, parse, type Row } from '../http.js'
import { examsWhere } from './exams.js'
import { toInpatientMed, toInpatientNote } from '../mappers.js'
import { CONSULT_MED_PREFIX, consultRxRows } from '../medOrders.js'
import { can } from '../../src/lib/permissions.js'
import { examLine, GROUP_LABEL } from '../../src/lib/exams.js'
import { deptAllows } from '../../src/lib/permissions.js'
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
  type Kind = 'exams' | 'rx' | 'results'
  const allowed = (req: Parameters<Ctx['userOf']>[0], kind: Kind, group?: ExamGroup) => {
    const u = userOf(req)
    // EX6 (ronda 11): el resultado lo imprimen quien ordena o procesa exámenes (enfermería, médico y los departamentos de
    // laboratorio e imágenes, cada uno solo los de su tipo); Recepción no
    if (kind === 'results') return (can(u, 'exams.order') || can(u, 'exams.process')) && (!group || deptAllows(u, group))
    if (!can(u, 'chart.view')) return false
    return kind === 'exams' ? can(u, 'exams.order') || can(u, 'exams.process') : can(u, 'inpatient.orders') || can(u, 'inpatient.care')
  }
  // El paciente sale de la estancia: las órdenes sembradas por la demo no traen patient_id (lo arregla la ronda 11)
  const sheetOf = (cid: string, ids: string[]) => (ids.length ? sql.query(`SELECT m.*, COALESCE(m.patient_id, h.patient_id) AS patient_id FROM hosp_meds m JOIN hospitalizations h ON h.id = m.hospitalization_id
    WHERE m.clinic_id = ? AND m.id IN (${ids.map(() => '?').join(',')})`, [cid, ...ids]) : Promise.resolve([] as Row[]))
  // ME14 (ronda 14): también los medicamentos de la consulta de ingreso que fueron a la receta y no están en la hoja
  const medsOf = async (cid: string, ids: string[]) => {
    const virtual = ids.filter((x) => x.startsWith(CONSULT_MED_PREFIX))
    const rows = await sheetOf(cid, ids.filter((x) => !x.startsWith(CONSULT_MED_PREFIX)))
    for (const consultId of new Set(virtual.map((x) => x.split(':')[1]))) {
      const h = await sql.one('SELECT * FROM hospitalizations WHERE clinic_id = ? AND consultation_id = ? ORDER BY admitted_at DESC LIMIT 1', [cid, consultId])
      if (h) rows.push(...(await consultRxRows(sql, h)).filter((r) => virtual.includes(String(r.id))))
    }
    const order = new Map(ids.map((x, i) => [x, i]))
    return rows.sort((a, b) => (order.get(String(a.id)) ?? 0) - (order.get(String(b.id)) ?? 0))
  }

  const body = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('exams'), examIds: z.array(z.string()).min(1, 'Elige al menos un examen.').max(60) }),
    // EX6 (ronda 11): resultados (uno o varios) en un solo documento
    z.object({ kind: z.literal('results'), examIds: z.array(z.string()).min(1, 'Elige al menos un examen.').max(60) }),
    // Receta: los medicamentos elegidos o, al firmar una nota, los de esa nota marcados «va a receta»
    z.object({ kind: z.literal('rx'), medIds: z.array(z.string()).max(60).optional(), noteId: z.string().optional(),
      // ME12 (ronda 11): «Generar receta» del médico: cualquier medicamento activo, con días y cantidad solo para esta receta
      chosen: z.boolean().optional(),
      extras: z.record(z.string(), z.object({ days: z.number().int().min(1, 'Los días son al menos 1.').max(365).optional(), quantity: z.string().trim().max(80).optional() })).optional() }),
  ])
  app.post('/api/print-jobs', auth, need('exams.order', 'exams.process', 'inpatient.orders', 'inpatient.care'), async (req, res) => {
    const b = parse(body, req.body)
    if (!allowed(req, b.kind)) fail(403, 'No tienes permiso para imprimir esto.')
    const cid = clinicOf(req)
    if (b.kind === 'results') {
      const list = await examsWhere(sql, `clinic_id = ? AND id IN (${b.examIds.map(() => '?').join(',')})`, [cid, ...b.examIds])
      if (list.length !== new Set(b.examIds).size) fail(404, 'Algún examen no existe.')
      if (new Set(list.map((e) => e.patientId)).size > 1) fail(400, 'Los exámenes son de pacientes distintos.')
      const none = list.find((e) => !e.result)
      if (none) fail(409, `${none.name} todavía no tiene resultado.`)
      for (const g of new Set(list.map((e) => e.group))) if (!allowed(req, 'results', g)) fail(403, 'No tienes permiso para imprimir esos resultados.')
      const id = randomUUID()
      await sql.run('INSERT INTO print_jobs (id, clinic_id, patient_id, hospitalization_id, kind, items, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)',
        [id, cid, list[0].patientId, list[0].hospitalizationId ?? null, 'results', JSON.stringify(list.map((e) => e.id)), userOf(req).id, new Date().toISOString()])
      return res.status(201).json({ id })
    }
    let patientId = ''
    let stayId: string | null = null
    let items: string[] = []
    let doctorId: string | null = null
    let data: Record<string, { days?: number; quantity?: string }> | null = null
    if (b.kind === 'exams') {
      const list = await examsWhere(sql, `clinic_id = ? AND id IN (${b.examIds.map(() => '?').join(',')})`, [cid, ...b.examIds])
      if (list.length !== new Set(b.examIds).size) fail(404, 'Algún examen no existe.')
      if (new Set(list.map((e) => e.patientId)).size > 1) fail(400, 'Los exámenes son de pacientes distintos.')
      // EX11 (ronda 14): desde la nota pueden ir laboratorio e imagen juntos (sale un documento por tipo) y también los que ya
      // tienen resultado (vienen sin marcar); los cancelados no
      const cancelled = list.find((e) => e.status === 'cancelled')
      if (cancelled) fail(409, `${cancelled.name} está cancelado.`)
      patientId = list[0].patientId
      stayId = list[0].hospitalizationId ?? null
      items = list.map((e) => e.id)
    } else {
      let rows: Row[]
      if (b.noteId) rows = await sql.query(`SELECT m.*, COALESCE(m.patient_id, h.patient_id) AS patient_id FROM hosp_meds m JOIN hospitalizations h ON h.id = m.hospitalization_id
        WHERE m.clinic_id = ? AND m.source = 'note' AND m.source_id = ? AND m.buy_outside = TRUE AND m.stopped_at IS NULL ORDER BY m.source_index`, [cid, b.noteId])
      else rows = await medsOf(cid, b.medIds ?? [])
      if (!rows.length) fail(400, b.chosen ? 'Elige al menos un medicamento.' : 'No hay medicamentos marcados «No hay en la clínica (va a receta)».')
      if (b.medIds && rows.length !== new Set(b.medIds).size) fail(404, 'Algún medicamento no existe.')
      // ME12 (ronda 11): el médico elige cualquier medicamento activo y pone días; enfermería solo imprime los marcados
      // «No hay en la clínica» (con los datos del médico que indicó) y reimprime las emitidas
      const user = userOf(req)
      const extras = Object.entries(b.extras ?? {}).filter(([id, x]) => b.medIds?.includes(id) && (x.days || x.quantity))
      if ((b.chosen || extras.length) && !can(user, 'inpatient.orders')) fail(403, 'Elegir otros medicamentos o poner días en la receta es del médico.')
      if (b.chosen) {
        const stopped = rows.find((r) => r.stopped_at)
        if (stopped) fail(409, `${stopped.drug} ya no está activo.`)
        doctorId = user.id
        data = extras.length ? Object.fromEntries(extras) : null
      } else {
        const off = rows.find((r) => !r.buy_outside)
        if (off) fail(400, `${off.drug} no está marcado «No hay en la clínica (va a receta)».`)
      }
      if (new Set(rows.map((r) => String(r.patient_id))).size > 1) fail(400, 'Los medicamentos son de pacientes distintos.')
      patientId = String(rows[0].patient_id)
      stayId = String(rows[0].hospitalization_id)
      items = rows.map((r) => String(r.id))
    }
    const id = randomUUID()
    await sql.run('INSERT INTO print_jobs (id, clinic_id, patient_id, hospitalization_id, kind, items, created_by, created_at, doctor_id, data) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [id, cid, patientId, stayId, b.kind, JSON.stringify(items), userOf(req).id, new Date().toISOString(), doctorId, data ? JSON.stringify(data) : null])
    res.status(201).json({ id })
  })

  /** El trabajo con sus documentos: uno por médico que indicó (y, en exámenes, por grupo). */
  app.get('/api/print-jobs/:id', auth, need('exams.order', 'exams.process', 'inpatient.orders', 'inpatient.care'), async (req, res) => {
    const cid = clinicOf(req)
    const job = (await sql.one('SELECT * FROM print_jobs WHERE id = ? AND clinic_id = ?', [String(req.params.id), cid])) ?? fail(404, 'La impresión no existe.')
    const kind = String(job!.kind) as Kind
    if (!allowed(req, kind)) fail(403, 'No tienes permiso para ver esto.')
    const ids = JSON.parse(String(job!.items)) as string[]
    const by = new Map<string, string[]>()
    let exams: Awaited<ReturnType<typeof examsWhere>> = []
    let meds: ReturnType<typeof toInpatientMed>[] = []
    if (kind === 'results') {
      exams = await examsWhere(sql, `clinic_id = ? AND id IN (${ids.map(() => '?').join(',')})`, [cid, ...ids])
      for (const g of new Set(exams.map((e) => e.group))) if (!allowed(req, 'results', g)) fail(403, 'No tienes permiso para ver esto.')
    } else if (kind === 'exams') {
      exams = await examsWhere(sql, `clinic_id = ? AND id IN (${ids.map(() => '?').join(',')})`, [cid, ...ids])
      for (const e of exams) by.set(e.orderedBy, [...(by.get(e.orderedBy) ?? []), e.id])
    } else {
      meds = (await medsOf(cid, ids)).map(toInpatientMed)
      // ME12: la receta que generó un médico lleva SUS datos (una sola); la de los marcados, la del médico que indicó
      for (const m of meds) { const doc = job!.doctor_id ? String(job!.doctor_id) : m.orderedBy; by.set(doc, [...(by.get(doc) ?? []), m.id]) }
    }
    const doctors = await Promise.all([...by.entries()].map(async ([doctorId, items]) => ({ doctor: await doctorOf(doctorId), items })))
    const printed = await sql.query('SELECT how, by_id, at FROM print_log WHERE target_kind = ? AND target_id = ? ORDER BY at', ['print_job', String(job!.id)])
    res.json({ id: String(job!.id), kind, patientId: String(job!.patient_id), hospitalizationId: job!.hospitalization_id ? String(job!.hospitalization_id) : undefined,
      createdBy: String(job!.created_by), createdAt: String(job!.created_at), exams, meds, doctors, printed: printed.map((p) => ({ how: String(p.how), by: String(p.by_id), at: String(p.at) })),
      extras: job!.data ? JSON.parse(String(job!.data)) : undefined,
      // IM2 (ronda 13): la receta de la estancia lleva el diagnóstico solo si el médico lo marcó
      ...(kind === 'rx' ? { includeDx: Boolean(job!.include_dx), diagnoses: await stayDiagnoses(cid, job!) } : {}) })
  })

  /**
   * IM2 (ronda 13): los diagnósticos de la receta de la estancia, tal como estaban cuando se generó: los de la última nota con
   * diagnósticos hasta ese momento o, si no hay, los del ingreso. Al reimprimirla salen igual.
   */
  async function stayDiagnoses(cid: string, job: Row): Promise<string[]> {
    if (!job.hospitalization_id) return []
    const h = await sql.one('SELECT diagnoses FROM hospitalizations WHERE id = ? AND clinic_id = ?', [String(job.hospitalization_id), cid])
    const notes = (await sql.query('SELECT * FROM hosp_notes WHERE hospitalization_id = ? AND clinic_id = ? AND at <= ? ORDER BY at DESC', [String(job.hospitalization_id), cid, String(job.created_at)]))
      .map(toInpatientNote).filter((n) => n.diagnoses?.length)
    const list = (notes[0]?.diagnoses ?? (h ? JSON.parse(String(h.diagnoses ?? '[]')) : [])) as { label: string }[]
    return list.map((d) => d.label)
  }

  /** IM2 (ronda 13): «Incluir diagnóstico» en la receta de la estancia; solo el médico (inpatient.orders). */
  app.post('/api/print-jobs/:id/include-dx', auth, need('inpatient.orders'), async (req, res) => {
    const { includeDx } = parse(z.object({ includeDx: z.boolean() }), req.body ?? {})
    const cid = clinicOf(req)
    const job = (await sql.one('SELECT * FROM print_jobs WHERE id = ? AND clinic_id = ?', [String(req.params.id), cid])) ?? fail(404, 'La receta no existe.')
    if (String(job!.kind) !== 'rx') fail(400, 'Solo la receta lleva el diagnóstico.')
    await sql.run('UPDATE print_jobs SET include_dx = ? WHERE id = ?', [includeDx, String(job!.id)])
    await audit(userOf(req), `${includeDx ? 'Incluyó' : 'Quitó'} el diagnóstico en la receta de ${await patientName(String(job!.patient_id))}`, undefined, String(job!.patient_id))
    res.json({ ok: true, includeDx })
  })

  /** Imprimir o descargar: queda por renglón (GE4) y en la bitácora, con quién lo hizo y de qué médico es. */
  app.post('/api/print-jobs/:id/printed', auth, need('exams.order', 'exams.process', 'inpatient.orders', 'inpatient.care'), async (req, res) => {
    // EX6 (ronda 11): también «view» (se abrió «Ver PDF»): cada vista, impresión o descarga queda registrada
    const b = parse(z.object({ how: z.enum(['print', 'pdf', 'view']) }), req.body)
    const cid = clinicOf(req)
    const job = (await sql.one('SELECT * FROM print_jobs WHERE id = ? AND clinic_id = ?', [String(req.params.id), cid])) ?? fail(404, 'La impresión no existe.')
    const kind = String(job!.kind) as Kind
    if (!allowed(req, kind)) fail(403, 'No tienes permiso para imprimir esto.')
    const ids = JSON.parse(String(job!.items)) as string[]
    const user = userOf(req)
    const at = new Date().toISOString()
    // Lo que dice la bitácora se arma antes (dentro de la transacción solo se usa su conexión: PGlite tiene una sola)
    let what = ''
    if (kind === 'results') {
      const list = await examsWhere(sql, `clinic_id = ? AND id IN (${ids.map(() => '?').join(',')})`, [cid, ...ids])
      what = `el resultado de ${list.map((e) => examLine(e)).join(', ')}`
    } else if (kind === 'exams') {
      const list = await examsWhere(sql, `clinic_id = ? AND id IN (${ids.map(() => '?').join(',')})`, [cid, ...ids])
      what = [...new Set(list.map((e) => e.group))].map((g) => `la orden de ${GROUP_LABEL[g as ExamGroup].toLowerCase()} (${list.filter((e) => e.group === g).map((e) => e.name).join(', ')})`).join(' y ')
    } else {
      const extras = job!.data ? JSON.parse(String(job!.data)) as Record<string, { days?: number; quantity?: string }> : {}
      const meds = (await medsOf(cid, ids)).map((r) => `${String(r.drug)}${extras[String(r.id)]?.days ? ` por ${extras[String(r.id)].days} días` : ''}${extras[String(r.id)]?.quantity ? `, comprar ${extras[String(r.id)].quantity}` : ''}`)
      what = `${job!.doctor_id ? `la receta (${meds.join('; ')})` : `la receta de lo que no hay en la clínica (${meds.join('; ')})`}${job!.include_dx ? ' con diagnóstico' : ''}`
    }
    const who = await patientName(String(job!.patient_id))
    await sql.tx(async (q) => {
      await q.run('INSERT INTO print_log (id, clinic_id, target_kind, target_id, how, by_id, at, with_dx) VALUES (?,?,?,?,?,?,?,?)', [randomUUID(), cid, 'print_job', String(job!.id), b.how, user.id, at, kind === 'rx' ? Boolean(job!.include_dx) : null])
      for (const id of ids) await q.run('INSERT INTO print_log (id, clinic_id, target_kind, target_id, how, by_id, at) VALUES (?,?,?,?,?,?,?)', [randomUUID(), cid, kind === 'exams' ? 'exam_item' : kind === 'results' ? 'exam_result' : 'hosp_med', id, b.how, user.id, at])
      await audit(user, `${b.how === 'pdf' ? 'Descargó en PDF' : b.how === 'view' ? 'Vio en PDF' : 'Imprimió'} ${what} de ${who}`, q, String(job!.patient_id))
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
    // ME12 (ronda 11): «Recetas emitidas» de Anexos: de quién es la receta (el médico que la generó o el que indicó) y qué lleva
    const out = []
    for (const r of rows.filter((x) => x.printed_at)) {
      const items = JSON.parse(String(r.items)) as string[]
      const meds = r.kind === 'rx' ? (await medsOf(cid, items)).map(toInpatientMed) : []
      const extras = r.data ? JSON.parse(String(r.data)) as Record<string, { days?: number; quantity?: string }> : {}
      out.push({ id: String(r.id), kind: String(r.kind), hospitalizationId: r.hospitalization_id ? String(r.hospitalization_id) : undefined,
        items, printedAt: String(r.printed_at), printedBy: String(r.printed_by), createdAt: String(r.created_at),
        doctorIds: r.kind === 'rx' ? [...new Set(r.doctor_id ? [String(r.doctor_id)] : meds.map((m) => m.orderedBy))] : undefined,
        meds: r.kind === 'rx' ? meds.map((m) => ({ id: m.id, label: m.drug, days: extras[m.id]?.days })) : undefined })
    }
    res.json(out)
  })
}
