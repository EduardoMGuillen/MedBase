import type { Express } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { type Ctx, fail, parse, placeOf, type Row } from '../http.js'
import { examInput, examsWhere, insertExams } from './exams.js'
import { can } from '../../src/lib/permissions.js'
import { isDeptLead } from '../../src/lib/positions.js'
import { examKey, GROUP_LABEL } from '../../src/lib/exams.js'
import { RENAL_FUNCTION_ANALYTES } from '../../src/lib/clinicalConfig.js'
import { localISODate, normalizeDni } from '../../src/lib/format.js'
import { localValueToIso } from '../../src/lib/dateInput.js'
import { createPatient } from '../db.js'
import { microbiologistsFor, onDutyNow } from '../roster.js'
import type { ExamGroup, ExamOrder, ExamStatus, Staff } from '../../src/lib/types.js'
import { ambulatoryStage } from '../../src/lib/ambulatory.js'

/** AD1 (ronda 17): la orden sin su resultado ni datos clínicos (indicación, notas de los eventos), para quien solo ve el estado. */
export const withoutResult = (e: ExamOrder): ExamOrder => {
  const { result: _r, resultVersion: _v, resultGraceUntil: _g, indication: _i, orderFileId: _f, ...rest } = e
  void _r; void _v; void _g; void _i; void _f
  return { ...rest, notDone: e.notDone ? { ...e.notDone, reason: '' } : undefined, events: (e.events ?? []).map((x) => ({ status: x.status, by: x.by, at: x.at })) }
}

/** El departamento de quien mira: Laboratorio o Imágenes (los demás eligen). */
export const deptOf = (u: Staff): ExamGroup | undefined => (u.role === 'lab' ? 'lab' : u.role === 'imaging' ? 'imaging' : undefined)

/** Dónde está el paciente de una orden: «Hospitalización · Cuarto 201», «Observación · Cama 3», «Consulta externa», «Ambulatorio». */
function locationText(e: Row) {
  if (e.location === 'ambulatory') return 'Ambulatorio'
  if (e.h_kind) {
    // Como bedLabel de la pantalla: «Cuarto 201» o «Cuarto 201-B»
    const bed = e.room ? `Cuarto ${e.room}${e.bed_label ? `-${e.bed_label}` : ''}` : ''
    return e.h_kind === 'observation' ? `Observación${bed ? ` · ${bed}` : ''}` : `Hospitalización${bed ? ` · ${bed}` : ''}`
  }
  return 'Consulta externa'
}

/**
 * DP2–DP4 (ronda 11): departamentos de Laboratorio clínico e Imágenes. Una sola fuente de verdad: la bandeja trabaja las
 * mismas órdenes (exam_orders) que la pestaña Exámenes, con las mismas acciones del servidor (muestra tomada, realizado,
 * resultado); aquí solo se agregan la bandeja, «No se realizó» / «Reintentar», los pacientes ambulatorios y la vista
 * parcial del expediente. Solo modo Clínica.
 */
export function registerDept(app: Express, { sql, auth, need, userOf, clinicOf, audit, patientName, patientRow }: Ctx) {
  // Qué departamento: el del rol; Administración puede mirar los dos (solo lectura)
  const groupFor = (u: Staff, asked?: string): ExamGroup => {
    const own = deptOf(u)
    if (own) { if (asked && asked !== own) fail(403, 'Esa bandeja es de otro departamento.'); return own }
    // AD1 (ronda 17): administración de la clínica mira las dos bandejas en solo lectura (dept.view)
    if (!can(u, 'settings.manage') && !can(u, 'dept.view')) fail(403, 'Tu rol no tiene bandeja de departamento.')
    return asked === 'imaging' ? 'imaging' : 'lab'
  }

  /** Bandeja: las órdenes «En la clínica» del tipo del departamento, de donde vengan, con paciente, ubicación y espera. */
  app.get('/api/dept/tray', auth, need('dept.work', 'dept.view', 'settings.manage'), async (req, res) => {
    const q = parse(z.object({ group: z.enum(['lab', 'imaging']).optional(), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }), req.query)
    const cid = clinicOf(req)
    const group = groupFor(userOf(req), q.group)
    const day = q.day ?? localISODate(new Date())
    // Pendientes (de estancias activas o sin estancia) y lo terminado del día elegido. RX1 (ronda 16): el día es local (zona de
    // la clínica, server/tz.ts) y las fechas se guardan en UTC: se compara contra el inicio del día local en UTC. El estado puede
    // cambiar después (el médico lo revisa), por eso solo el límite inferior; el cliente filtra el día exacto (finishedOn).
    const dayStart = localValueToIso(day)
    const rows = await sql.query(`SELECT e.id, e.location, h.kind AS h_kind, b.room, b.label AS bed_label, p.first_name, p.last_name, p.birth_date, p.sex, p.record
      FROM exam_orders e JOIN patients p ON p.id = e.patient_id LEFT JOIN hospitalizations h ON h.id = e.hospitalization_id LEFT JOIN beds b ON b.id = h.bed_id
      WHERE e.clinic_id = ? AND e.grp = ? AND e.place = 'clinic' AND (
        (e.status IN ('ordered','sample','done') AND (e.hospitalization_id IS NULL OR h.status = 'active'))
        OR (e.status IN ('done','result','reviewed') AND COALESCE(e.status_at, e.ordered_at) >= ?))`, [cid, group, dayStart])
    const ids = rows.map((r) => String(r.id))
    const exams = ids.length ? await examsWhere(sql, `id IN (${ids.map(() => '?').join(',')})`, ids) : []
    const byId = new Map(rows.map((r) => [String(r.id), r]))
    // AD1 (ronda 17): quien no trabaja la bandeja ni ve el expediente (administración) ve el estudio y su estado, nunca el resultado
    const clinical = can(userOf(req), 'dept.work') || can(userOf(req), 'chart.view')
    res.json({ group, day, items: exams.map((e) => {
      const r = byId.get(e.id)!
      return { ...(clinical ? e : withoutResult(e)), patient: { id: e.patientId, name: `${r.first_name} ${r.last_name}`, birthDate: String(r.birth_date ?? ''), sex: String(r.sex ?? ''), record: String(r.record) }, locationText: locationText(r) }
    }) })
  })

  /**
   * EX6 (A24): al cargar un resultado de laboratorio, quién es el microbiólogo responsable: si lo carga uno, él; si hay uno solo
   * de turno (DP6), ese; si no hay ninguno de turno o hay varios, se elige de la lista (obligatorio).
   */
  app.get('/api/dept/responsible', auth, need('exams.process'), async (req, res) => {
    const cid = clinicOf(req)
    const user = userOf(req)
    const micros = await microbiologistsFor(sql, cid)
    const duty = (await onDutyNow(sql, cid, 'lab')).filter((id) => micros.some((m) => m.id === id))
    const self = micros.some((m) => m.id === user.id)
    res.json({ microbiologists: micros, onDuty: duty, needsChoice: micros.length > 0 && !self && duty.length !== 1 && user.role === 'lab', optional: micros.length > 0 && !self && duty.length !== 1 && user.role !== 'lab', auto: self ? user.id : duty.length === 1 ? duty[0] : undefined })
  })

  /**
   * Conteo para el menú (pendientes del departamento). LB5/IM1 (ronda 12): también por área: ambulatorio (consulta externa y
   * pacientes que vienen solo a hacerse exámenes), observación y hospitalización, y cuántos urgentes hay en cada una.
   */
  app.get('/api/dept/count', auth, need('dept.work'), async (req, res) => {
    const group = groupFor(userOf(req))
    const rows = await sql.query(`SELECT COALESCE(h.kind, 'outpatient') AS area, COUNT(*)::int AS n, SUM(CASE WHEN e.priority = 'urgent' THEN 1 ELSE 0 END)::int AS urgent
      FROM exam_orders e LEFT JOIN hospitalizations h ON h.id = e.hospitalization_id
      WHERE e.clinic_id = ? AND e.grp = ? AND e.place = 'clinic' AND e.status IN ('ordered','sample') AND e.not_done_at IS NULL AND (e.hospitalization_id IS NULL OR h.status = 'active')
      GROUP BY COALESCE(h.kind, 'outpatient')`, [clinicOf(req), group])
    const by = (k: string) => rows.find((r) => r.area === k)
    const area = (k: string) => ({ n: Number(by(k)?.n ?? 0), urgent: Number(by(k)?.urgent ?? 0) })
    const areas = { outpatient: area('outpatient'), observation: area('observation'), hospital: area('hospital') }
    res.json({ n: areas.outpatient.n + areas.observation.n + areas.hospital.n, areas })
  })

  /**
   * LB6 (ronda 12): paciente que viene solo a hacerse exámenes y no está registrado en la clínica: con lo mínimo para tomar la
   * muestra y enviarle el resultado (nombres, apellidos, edad, sexo, teléfono o correo e identidad). Si la identidad ya está
   * registrada, se usa ese expediente. La edad se guarda como fecha de nacimiento aproximada (hoy menos la edad).
   */
  app.post('/api/dept/quick-patient', auth, need('ambulatory.register'), async (req, res) => {
    const b = parse(z.object({
      firstName: z.string().trim().min(1, 'Escribe los nombres.').max(80), lastName: z.string().trim().min(1, 'Escribe los apellidos.').max(80),
      age: z.number().int().min(0).max(120), ageUnit: z.enum(['years', 'months']).default('years'), sex: z.enum(['F', 'M']),
      phone: z.string().trim().max(30).optional(), email: z.string().trim().email('El correo no es válido.').optional().or(z.literal('').transform(() => undefined)),
      dni: z.string().trim().max(30).optional().transform(normalizeDni),
    }).refine((x) => (x.phone && x.phone.replace(/\D/g, '').length >= 7) || x.email, { message: 'Escribe un teléfono (al menos 7 dígitos) o un correo para enviarle el resultado.' }), req.body)
    const cid = clinicOf(req)
    const user = userOf(req)
    if (b.dni) {
      const same = await sql.one('SELECT id, record, first_name, last_name FROM patients WHERE clinic_id = ? AND dni = ? AND merged_into IS NULL', [cid, b.dni])
      if (same) return res.json({ id: String(same.id), record: String(same.record), existing: `${same.first_name} ${same.last_name}` })
    }
    const born = new Date()
    if (b.ageUnit === 'months') born.setMonth(born.getMonth() - b.age)
    else born.setFullYear(born.getFullYear() - b.age)
    const id = await sql.tx((q) => createPatient(q, cid, { firstName: b.firstName, lastName: b.lastName, birthDate: localISODate(born), sex: b.sex, phone: b.phone ?? '', email: b.email, dni: b.dni, allergies: [], conditions: [] }))
    const record = String((await patientRow(cid, id))!.record)
    await audit(user, `Registró al paciente ambulatorio ${b.firstName} ${b.lastName} (${record}) con los datos mínimos para sus exámenes`, undefined, id)
    res.status(201).json({ id, record })
  })

  const pendingRow = async (cid: string, id: string) => {
    const r = (await sql.one('SELECT * FROM exam_orders WHERE id = ? AND clinic_id = ?', [id, cid])) ?? fail(404, 'El examen no existe.')
    return r!
  }

  /**
   * «No se realizó» (A21): el departamento no cancela órdenes del médico. Queda marcada con motivo, se avisa al médico que la
   * pidió (en sus avisos de resultados) y sigue pendiente: el médico la cancela si quiere, o el departamento «Reintentar».
   */
  app.post('/api/exams/:id/not-done', auth, need('dept.work'), async (req, res) => {
    const b = parse(z.object({ reason: z.string().trim().min(3, 'Escribe el motivo.').max(200) }), req.body)
    const cid = clinicOf(req)
    const user = userOf(req)
    const r = await pendingRow(cid, String(req.params.id))
    groupFor(user, String(r.grp))
    if (!['ordered', 'sample', 'done'].includes(String(r.status))) fail(409, 'Este examen ya tiene resultado o está cancelado.')
    const at = new Date().toISOString()
    const who = await patientName(String(r.patient_id))
    await sql.tx(async (q) => {
      await q.run('UPDATE exam_orders SET not_done_reason = ?, not_done_at = ?, not_done_by = ? WHERE id = ?', [b.reason, at, user.id, String(r.id)])
      await q.run('INSERT INTO exam_events (id, clinic_id, exam_id, status, by_id, at, note) VALUES (?,?,?,?,?,?,?)', [randomUUID(), cid, String(r.id), 'not_done', user.id, at, b.reason])
      await audit(user, `No se realizó ${GROUP_LABEL[r.grp as ExamGroup].toLowerCase()}: ${r.name} de ${who}. Motivo: ${b.reason}. Se avisó al médico que lo pidió`, q, String(r.patient_id))
    })
    res.json((await examsWhere(sql, 'id = ?', [String(r.id)]))[0])
  })

  app.post('/api/exams/:id/retry', auth, need('dept.work'), async (req, res) => {
    const cid = clinicOf(req)
    const user = userOf(req)
    const r = await pendingRow(cid, String(req.params.id))
    groupFor(user, String(r.grp))
    if (!r.not_done_at) fail(409, 'Este examen no está marcado «No se realizó».')
    if (r.status === 'cancelled') fail(409, 'El médico ya canceló este examen.')
    const at = new Date().toISOString()
    const who = await patientName(String(r.patient_id))
    await sql.tx(async (q) => {
      await q.run('UPDATE exam_orders SET not_done_reason = NULL, not_done_at = NULL, not_done_by = NULL WHERE id = ?', [String(r.id)])
      await q.run('INSERT INTO exam_events (id, clinic_id, exam_id, status, by_id, at, note) VALUES (?,?,?,?,?,?,?)', [randomUUID(), cid, String(r.id), 'retry', user.id, at, 'Vuelve a la bandeja'])
      await audit(user, `Reintentar: ${r.name} de ${who} vuelve a la bandeja de ${GROUP_LABEL[r.grp as ExamGroup].toLowerCase()}`, q, String(r.patient_id))
    })
    res.json((await examsWhere(sql, 'id = ?', [String(r.id)]))[0])
  })

  /**
   * DP3: paciente que viene solo a hacerse exámenes. Lo registran Laboratorio e Imágenes (de su tipo), Recepción y
   * Administración. La orden queda «Ambulatorio», con quien la registró como autor y «Solicitado por» (persona del sistema o
   * nombre escrito) y la foto de la orden en papel, si se adjuntó. Entra a la bandeja y queda en el expediente.
   */
  app.post('/api/dept/ambulatory', auth, need('ambulatory.register'), async (req, res) => {
    const b = parse(z.object({ patientId: z.string().min(1), group: z.enum(['lab', 'imaging']), exams: z.array(examInput).min(1, 'Elige al menos un estudio.').max(30),
      requestedById: z.string().optional(), requestedByName: z.string().trim().max(120).optional(), fileId: z.string().optional() }), req.body)
    const cid = clinicOf(req)
    const user = userOf(req)
    const own = deptOf(user)
    if (own && own !== b.group) fail(403, `Solo registras estudios de ${GROUP_LABEL[own].toLowerCase()}.`)
    if ((await sql.one('SELECT kind FROM clinics WHERE id = ?', [cid]))?.kind === 'office') fail(400, 'Los pacientes ambulatorios de laboratorio e imágenes son de las clínicas.')
    if (!(await patientRow(cid, b.patientId))) fail(404, 'El paciente no existe.')
    if (b.exams.some((e) => e.group !== b.group)) fail(400, `Todos los estudios deben ser de ${GROUP_LABEL[b.group].toLowerCase()}.`)
    if (b.fileId && !(await sql.one('SELECT 1 FROM attachments WHERE id = ? AND clinic_id = ? AND patient_id = ?', [b.fileId, cid, b.patientId]))) fail(400, 'El archivo no corresponde a este paciente.')
    let requester: Row | undefined
    if (b.requestedById) requester = (await sql.one('SELECT id, name FROM staff WHERE id = ? AND clinic_id = ?', [b.requestedById, cid])) ?? fail(400, `Ese médico no es ${placeOf(user.clinicKind).of}.`)
    const at = new Date().toISOString()
    // Siempre en la clínica (las órdenes externas no entran a la bandeja)
    const list = b.exams.map((e) => ({ ...e, place: 'clinic' as const }))
    const batch = await sql.tx(async (q) => {
      const id = await insertExams(q, { clinicId: cid, patientId: b.patientId, by: user.id, at }, list)
      await q.run('UPDATE exam_orders SET location = ?, requested_by_id = ?, requested_by_name = ?, order_file_id = ? WHERE batch_id = ?',
        ['ambulatory', requester ? String(requester.id) : null, requester ? null : b.requestedByName || null, b.fileId ?? null, id])
      return id
    })
    const who = await patientName(b.patientId)
    await audit(user, `Registró paciente ambulatorio para ${GROUP_LABEL[b.group].toLowerCase()}: ${who}; ${list.map((e) => e.name).join(', ')}${requester ? `; solicitado por ${requester.name}` : b.requestedByName ? `; solicitado por ${b.requestedByName}` : ''}`, undefined, b.patientId)
    res.status(201).json({ batchId: batch, exams: await examsWhere(sql, 'batch_id = ?', [batch!]) })
  })

  /**
   * AD1 (ronda 17): «Pacientes ambulatorios» de administración y recepción: los que vinieron solo a hacerse exámenes en el día
   * (local), con el nombre de cada estudio y su etapa (ordenado, muestra tomada, en proceso, resultado listo). Nunca los valores
   * ni el informe: solo lo que hace falta para avisar al paciente. Laboratorio e Imágenes, solo los de su tipo.
   */
  app.get('/api/dept/ambulatory', auth, need('ambulatory.register'), async (req, res) => {
    const q = parse(z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }), req.query)
    const cid = clinicOf(req)
    const own = deptOf(userOf(req))
    const day = q.day ?? localISODate(new Date())
    const next = new Date(`${day}T12:00:00`); next.setDate(next.getDate() + 1)
    const rows = await sql.query(`SELECT e.id, e.patient_id, e.grp, e.name, e.status, e.priority, e.ordered_at, e.not_done_at, e.requested_by_id, e.requested_by_name,
      p.first_name, p.last_name, p.record, p.phone
      FROM exam_orders e JOIN patients p ON p.id = e.patient_id
      WHERE e.clinic_id = ? AND e.location = 'ambulatory' AND e.status <> 'cancelled' AND e.ordered_at >= ? AND e.ordered_at < ?${own ? ' AND e.grp = ?' : ''}
      ORDER BY e.ordered_at, e.id`, [cid, localValueToIso(day), localValueToIso(localISODate(next)), ...(own ? [own] : [])])
    const byPatient = new Map<string, { patient: { id: string; name: string; record: string; phone: string }; firstAt: string; exams: unknown[] }>()
    for (const r of rows) {
      const pid = String(r.patient_id)
      const entry = byPatient.get(pid) ?? { patient: { id: pid, name: `${r.first_name} ${r.last_name}`, record: String(r.record), phone: String(r.phone ?? '') }, firstAt: String(r.ordered_at), exams: [] }
      entry.exams.push({ id: String(r.id), group: String(r.grp), name: String(r.name), priority: String(r.priority), orderedAt: String(r.ordered_at),
        stage: ambulatoryStage({ group: r.grp as ExamGroup, name: String(r.name), status: r.status as ExamStatus, notDone: !!r.not_done_at }),
        requestedBy: r.requested_by_id ? undefined : r.requested_by_name ? String(r.requested_by_name) : undefined, requestedById: r.requested_by_id ? String(r.requested_by_id) : undefined })
      byPatient.set(pid, entry)
    }
    res.json({ day, patients: [...byPatient.values()] })
  })

  /**
   * DP4: vista parcial del expediente para Microbiólogo, Técnico de laboratorio y Técnico en imágenes: datos generales,
   * alergias, ubicación y las órdenes de su departamento (y, para Imágenes, la última creatinina). Sin notas, diagnósticos,
   * medicamentos, signos vitales, anexos ni Caja. Cada vez que se abre queda en la bitácora.
   */
  app.get('/api/dept/patients/:id', auth, need('dept.work'), async (req, res) => {
    const cid = clinicOf(req)
    const user = userOf(req)
    const group = groupFor(user)
    const p = (await patientRow(cid, String(req.params.id))) ?? fail(404, 'El paciente no existe.')
    const stay = await sql.one(`SELECT h.kind AS h_kind, b.room, b.label AS bed_label FROM hospitalizations h LEFT JOIN beds b ON b.id = h.bed_id WHERE h.clinic_id = ? AND h.patient_id = ? AND h.status = 'active' LIMIT 1`, [cid, String(p!.id)])
    const exams = await examsWhere(sql, 'clinic_id = ? AND patient_id = ? AND grp = ?', [cid, String(p!.id), group])
    // Técnico en imágenes (contraste): el último resultado de función renal (VALIDAR: Emil, RENAL_FUNCTION_ANALYTES)
    let creatinine: { value: string; unit?: string; at: string; flag?: string; exam: string } | undefined
    if (group === 'imaging') {
      const labs = await examsWhere(sql, `clinic_id = ? AND patient_id = ? AND grp = 'lab' AND status IN ('result','reviewed')`, [cid, String(p!.id)])
      const keys = new Set(RENAL_FUNCTION_ANALYTES.map(examKey))
      for (const e of labs.sort((a, b) => (b.result?.at ?? '').localeCompare(a.result?.at ?? ''))) {
        const v = e.result?.values?.find((x) => keys.has(examKey(x.analyte)))
        if (v) { creatinine = { value: v.value, unit: v.unit, at: e.result!.at, flag: v.flag, exam: e.name }; break }
      }
    }
    await audit(user, `Abrió el expediente de ${p!.first_name} ${p!.last_name} (vista de ${group === 'lab' ? 'laboratorio' : 'imágenes'})`, undefined, String(p!.id))
    res.json({
      patient: { id: String(p!.id), name: `${p!.first_name} ${p!.last_name}`, record: String(p!.record), birthDate: String(p!.birth_date ?? ''), sex: String(p!.sex ?? ''),
        dni: p!.dni ? String(p!.dni) : undefined, phone: String(p!.phone ?? ''), allergies: JSON.parse(String(p!.allergies ?? '[]')) as string[] },
      location: stay ? locationText(stay) : undefined, group, exams, creatinine, lead: isDeptLead(user),
    })
  })
}


export type DeptTrayItem = ExamOrder & { patient: { id: string; name: string; birthDate: string; sex: string; record: string }; locationText: string }
