import type { Express } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { type Ctx, fail, parse, type Row } from '../http.js'
import { nextFolio } from '../db.js'
import { toAttachment, toBed, toDose, toHospitalization, toInpatientMed, toInpatientNote, toProcedure } from '../mappers.js'
import type { Sql } from '../sql.js'
import { isScheduled, medLabel } from '../../src/lib/inpatient.js'

const dx = z.array(z.object({ code: z.string().trim().min(1), label: z.string().trim().min(1) }))
const when = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'La fecha u hora no es válida.')
const ATTACH_META = 'id, patient_id, name, mime, size, category, uploaded_by, uploaded_at, title, taken_at, hospitalization_id'

const medInput = z.object({
  drug: z.string().trim().min(1, 'Escribe el medicamento.').max(120),
  presentation: z.string().trim().max(120).optional(),
  dose: z.string().trim().min(1, 'Escribe la dosis.').max(60),
  route: z.string().trim().min(1, 'Elige la vía.').max(40),
  everyHours: z.number().int().min(1).max(72).optional(),
  prn: z.boolean().default(false),
  firstAt: when.optional(),
  instructions: z.string().trim().max(300).optional(),
})

/**
 * Hospitalización: camas por especialidad, ingreso, notas médicas SOAP con indicaciones de
 * medicamentos, hoja de medicamentos que enfermería va marcando, laboratorios, procedimientos y egreso.
 * Cualquier médico o enfermera de la clínica ve a los hospitalizados: de noche los atiende quien esté de turno.
 */
export function registerInpatient(app: Express, ctx: Ctx) {
  const { sql, auth, need, userOf, clinicOf, audit, patientRow, patientName, assertRxIdentity } = ctx

  const hospRow = async (cid: string, id: string) =>
    (await sql.one('SELECT * FROM hospitalizations WHERE id = ? AND clinic_id = ?', [id, cid])) ?? fail(404, 'La hospitalización no existe.')
  const activeHosp = async (cid: string, id: string) => {
    const h = (await hospRow(cid, id))!
    if (h.status !== 'active') fail(409, 'Este paciente ya fue dado de alta; el expediente de hospitalización está cerrado.')
    return h
  }
  const bedName = (b: Row) => `cama ${b.room}${b.label ? `-${b.label}` : ''}`

  /** Inserta los medicamentos que indica una nota y omite los que la nota suspende. */
  async function applyMeds(q: Sql, cid: string, hospId: string, noteId: string, userId: string, at: string, meds: z.infer<typeof medInput>[], stop: string[]) {
    for (const m of meds) {
      await q.run(`INSERT INTO hosp_meds (id, clinic_id, hospitalization_id, note_id, drug, presentation, dose, route, every_hours, prn, first_at, instructions, ordered_by, ordered_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [randomUUID(), cid, hospId, noteId, m.drug, m.presentation || null, m.dose, m.route, m.everyHours ?? null, m.prn,
          new Date(m.firstAt ?? at).toISOString(), m.instructions || null, userId, at])
    }
    for (const id of stop) {
      const m = await q.one('SELECT * FROM hosp_meds WHERE id = ? AND hospitalization_id = ? AND clinic_id = ?', [id, hospId, cid])
      if (!m) fail(400, 'El medicamento que quieres omitir no pertenece a este paciente.')
      if (m!.stopped_at) continue
      await q.run('UPDATE hosp_meds SET stopped_at = ?, stopped_by = ? WHERE id = ?', [at, userId, id])
    }
  }

  // ---------- Camas (las configura administración) ----------
  const bedBody = z.object({
    room: z.string().trim().min(1, 'Escribe el número de cuarto.').max(20),
    label: z.string().trim().max(10).default(''),
    specialty: z.string().trim().min(2, 'Escribe la especialidad de la cama.').max(60),
    active: z.boolean().default(true),
  })

  app.post('/api/beds', auth, need('settings.manage'), async (req, res) => {
    const b = parse(bedBody, req.body)
    const cid = clinicOf(req)
    if (await sql.one('SELECT 1 FROM beds WHERE clinic_id = ? AND room = ? AND label = ?', [cid, b.room, b.label])) fail(409, 'Ya existe esa cama en ese cuarto.')
    const id = randomUUID()
    await sql.run('INSERT INTO beds (id, clinic_id, room, label, specialty, active) VALUES (?,?,?,?,?,?)', [id, cid, b.room, b.label, b.specialty, b.active])
    await audit(userOf(req), `Agregó la ${bedName(b)} (${b.specialty})`)
    res.status(201).json(toBed((await sql.one('SELECT * FROM beds WHERE id = ?', [id]))!))
  })

  app.patch('/api/beds/:id', auth, need('settings.manage'), async (req, res) => {
    const cid = clinicOf(req)
    const row = (await sql.one('SELECT * FROM beds WHERE id = ? AND clinic_id = ?', [String(req.params.id), cid])) ?? fail(404, 'La cama no existe.')
    const b = parse(bedBody.partial(), req.body)
    if (b.active === false && await sql.one(`SELECT 1 FROM hospitalizations WHERE bed_id = ? AND status = 'active'`, [String(row!.id)])) {
      fail(409, 'La cama tiene un paciente hospitalizado. Trasládalo o dale de alta antes de desactivarla.')
    }
    await sql.run('UPDATE beds SET room = ?, label = ?, specialty = ?, active = ? WHERE id = ?',
      [b.room ?? row!.room, b.label ?? row!.label, b.specialty ?? row!.specialty, b.active ?? row!.active, String(row!.id)])
    await audit(userOf(req), `Actualizó la ${bedName(row!)}`)
    res.json(toBed((await sql.one('SELECT * FROM beds WHERE id = ?', [String(row!.id)]))!))
  })

  // ---------- Ingreso ----------
  app.post('/api/inpatient', auth, need('inpatient.orders'), async (req, res) => {
    const b = parse(z.object({
      patientId: z.string().min(1, 'Elige al paciente.'),
      bedId: z.string().min(1, 'Elige la cama.'),
      admittedAt: when.optional(),
      reason: z.string().trim().min(3, 'Escribe el motivo del ingreso.').max(1000),
      diagnoses: dx.min(1, 'Agrega al menos un diagnóstico de ingreso.'),
      consultationId: z.string().optional(),
      companionName: z.string().trim().max(100).optional(),
      companionRelation: z.string().trim().max(40).optional(),
      companionPhone: z.string().trim().max(30).optional(),
      patientPhone: z.string().trim().max(30).optional(),
    }), req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    ;(await patientRow(cid, b.patientId)) ?? fail(404, 'El paciente no existe.')
    const bed = await sql.one('SELECT * FROM beds WHERE id = ? AND clinic_id = ? AND active', [b.bedId, cid])
    if (!bed) fail(400, 'La cama elegida no existe o está desactivada.')
    if (b.consultationId && !(await sql.one('SELECT 1 FROM consultations WHERE id = ? AND patient_id = ? AND clinic_id = ?', [b.consultationId, b.patientId, cid]))) {
      fail(400, 'La consulta no corresponde a este paciente.')
    }
    const admittedAt = new Date(b.admittedAt ?? Date.now())
    if (admittedAt.getTime() > Date.now() + 5 * 60_000) fail(400, 'La hora de ingreso no puede ser en el futuro.')
    const id = randomUUID()
    // Fuera de la transacción: con una sola conexión, consultar por fuera de ella la bloquearía
    const name = await patientName(b.patientId)
    await sql.tx(async (q) => {
      // El candado evita que dos médicos ocupen la misma cama al mismo tiempo
      await q.run('SELECT pg_advisory_xact_lock(hashtext(?))', [`beds:${cid}`])
      if (await q.one(`SELECT 1 FROM hospitalizations WHERE bed_id = ? AND status = 'active'`, [b.bedId])) fail(409, 'Esa cama ya está ocupada. Elige otra.')
      if (await q.one(`SELECT 1 FROM hospitalizations WHERE patient_id = ? AND status = 'active'`, [b.patientId])) fail(409, 'Este paciente ya está hospitalizado.')
      await q.run(`INSERT INTO hospitalizations (id, clinic_id, patient_id, bed_id, consultation_id, admitted_at, admitted_by, reason, diagnoses, companion_name, companion_relation,
          companion_phone, patient_phone, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'active')`,
        [id, cid, b.patientId, b.bedId, b.consultationId ?? null, admittedAt.toISOString(), user.id, b.reason, JSON.stringify(b.diagnoses),
          b.companionName || null, b.companionRelation || null, b.companionPhone || null, b.patientPhone || null])
      await audit(user, `Ingresó a ${name} en la ${bedName(bed!)} (${bed!.specialty})`, q)
    })
    res.status(201).json(toHospitalization((await hospRow(cid, id))!))
  })

  // ---------- Expediente de hospitalización ----------
  app.get('/api/inpatient/:id', auth, need('inpatient.view'), async (req, res) => {
    const cid = clinicOf(req)
    const h = (await hospRow(cid, String(req.params.id)))!
    const id = String(h.id)
    const [notes, meds, doses, procedures, labs] = await Promise.all([
      sql.query('SELECT * FROM hosp_notes WHERE hospitalization_id = ? ORDER BY at, id', [id]),
      sql.query('SELECT * FROM hosp_meds WHERE hospitalization_id = ? ORDER BY ordered_at, id', [id]),
      sql.query('SELECT d.* FROM hosp_doses d JOIN hosp_meds m ON m.id = d.med_id WHERE m.hospitalization_id = ? ORDER BY d.given_at', [id]),
      sql.query('SELECT * FROM hosp_procedures WHERE hospitalization_id = ? ORDER BY created_at', [id]),
      sql.query(`SELECT ${ATTACH_META} FROM attachments WHERE clinic_id = ? AND patient_id = ? AND category = 'lab' AND (hospitalization_id = ? OR (taken_at >= ? AND taken_at <= ?))
        ORDER BY COALESCE(taken_at, uploaded_at) DESC`, [cid, String(h.patient_id), id, String(h.admitted_at), String(h.discharged_at ?? '9999')]),
    ])
    await audit(userOf(req), `Consultó el expediente de hospitalización de ${await patientName(String(h.patient_id))}`)
    res.json({
      hospitalization: toHospitalization(h), notes: notes.map(toInpatientNote), meds: meds.map(toInpatientMed), doses: doses.map(toDose),
      procedures: procedures.map(toProcedure), labs: labs.map(toAttachment),
    })
  })

  // Nota de ingreso o de evolución (SOAP). Sus indicaciones de medicamentos van a la hoja de enfermería.
  app.post('/api/inpatient/:id/notes', auth, need('inpatient.orders'), async (req, res) => {
    const soap = (label: string) => z.string().trim().min(1, `Escribe ${label}.`).max(6000)
    const b = parse(z.object({
      kind: z.enum(['admission', 'evolution']),
      subjective: soap('el subjetivo (S)'), objective: soap('el objetivo (O)'), assessment: soap('el análisis (A)'), plan: soap('el plan (P)'),
      meds: z.array(medInput).max(20).default([]),
      stopMedIds: z.array(z.string()).max(30).default([]),
      orders: z.array(z.string().trim().min(1).max(500)).max(40).default([]),
    }), req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    const h = await activeHosp(cid, String(req.params.id))
    const id = String(h.id)
    const hasAdmission = await sql.one(`SELECT 1 FROM hosp_notes WHERE hospitalization_id = ? AND kind = 'admission'`, [id])
    if (b.kind === 'admission' && hasAdmission) fail(409, 'Este paciente ya tiene nota de ingreso. Escribe una nota de evolución.')
    if (b.kind === 'evolution' && !hasAdmission) fail(409, 'Primero va la nota de ingreso.')
    const noteId = randomUUID()
    const at = new Date().toISOString()
    const name = await patientName(String(h.patient_id))
    await sql.tx(async (q) => {
      await q.run(`INSERT INTO hosp_notes (id, clinic_id, hospitalization_id, kind, author_id, at, subjective, objective, assessment, plan, data) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [noteId, cid, id, b.kind, user.id, at, b.subjective, b.objective, b.assessment, b.plan, JSON.stringify({ orders: b.orders })])
      await applyMeds(q, cid, id, noteId, user.id, at, b.meds, b.stopMedIds)
      const what = b.kind === 'admission' ? 'nota de ingreso' : 'nota de evolución'
      const changes = [b.meds.length && `${b.meds.length} medicamento(s) indicado(s)`, b.stopMedIds.length && `${b.stopMedIds.length} omitido(s)`].filter(Boolean).join(', ')
      await audit(user, `Escribió ${what} de ${name}${changes ? `: ${changes}` : ''}`, q)
    })
    res.status(201).json(toInpatientNote((await sql.one('SELECT * FROM hosp_notes WHERE id = ?', [noteId]))!))
  })

  app.post('/api/inpatient/:id/nursing', auth, need('inpatient.care'), async (req, res) => {
    const { text } = parse(z.object({ text: z.string().trim().min(3, 'Escribe la nota de enfermería.').max(4000) }), req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    const h = await activeHosp(cid, String(req.params.id))
    const noteId = randomUUID()
    await sql.run(`INSERT INTO hosp_notes (id, clinic_id, hospitalization_id, kind, author_id, at, text) VALUES (?,?,?,'nursing',?,?,?)`,
      [noteId, cid, String(h.id), user.id, new Date().toISOString(), text])
    await audit(user, `Escribió nota de enfermería de ${await patientName(String(h.patient_id))}`)
    res.status(201).json(toInpatientNote((await sql.one('SELECT * FROM hosp_notes WHERE id = ?', [noteId]))!))
  })

  // Enfermería (o el médico, en guardia u observación) marca la dosis de una hora indicada o una dosis PRN
  app.post('/api/inpatient/meds/:medId/doses', auth, need('inpatient.care', 'inpatient.orders'), async (req, res) => {
    const b = parse(z.object({
      scheduledAt: when.optional(),
      givenAt: when.optional(),
      status: z.enum(['given', 'skipped']).default('given'),
      note: z.string().trim().max(300).optional(),
    }), req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    const m = (await sql.one('SELECT * FROM hosp_meds WHERE id = ? AND clinic_id = ?', [String(req.params.medId), cid])) ?? fail(404, 'El medicamento no existe.')
    const h = await activeHosp(cid, String(m!.hospitalization_id))
    const med = toInpatientMed(m!)
    const givenAt = new Date(b.givenAt ?? Date.now())
    if (givenAt.getTime() > Date.now() + 60_000) fail(400, 'La hora de administración no puede ser en el futuro.')
    let scheduledAt: string | null = null
    if (med.prn) {
      if (b.scheduledAt) fail(400, 'Un medicamento PRN no tiene horario fijo.')
      if (med.stoppedAt && givenAt >= new Date(med.stoppedAt)) fail(409, `${med.drug} fue omitido por el médico; ya no se administra.`)
      if (b.status === 'skipped') fail(400, 'Una dosis PRN sólo se registra cuando se aplica.')
    } else {
      if (!b.scheduledAt) fail(400, 'Indica la hora de la dosis que estás marcando.')
      const slot = new Date(b.scheduledAt!)
      if (med.stoppedAt && slot >= new Date(med.stoppedAt)) fail(409, `${med.drug} fue omitido por el médico; esa dosis ya no se aplica.`)
      if (!isScheduled(med, slot)) fail(400, 'Esa hora no corresponde al horario indicado del medicamento.')
      if (b.status === 'skipped' && !b.note) fail(400, 'Escribe por qué no se administró la dosis.')
      scheduledAt = slot.toISOString()
    }
    const id = randomUUID()
    try {
      await sql.run('INSERT INTO hosp_doses (id, clinic_id, med_id, scheduled_at, given_at, given_by, status, note) VALUES (?,?,?,?,?,?,?,?)',
        [id, cid, med.id, scheduledAt, givenAt.toISOString(), user.id, b.status, b.note || null])
    } catch (e) {
      if ((e as { code?: string }).code === '23505') fail(409, 'Esa dosis ya fue registrada. Actualiza la página.')
      throw e
    }
    await audit(user, `${b.status === 'given' ? 'Administró' : 'Registró como no administrado'} ${medLabel(med)} a ${await patientName(String(h.patient_id))} (${user.role === 'doctor' ? 'médico' : 'enfermería'})`)
    res.status(201).json(toDose((await sql.one('SELECT * FROM hosp_doses WHERE id = ?', [id]))!))
  })

  /** ¿Hay una autorización firmada para esta estancia en las 24 horas anteriores al procedimiento? */
  async function signedAuthorization(hospId: string, performedAt: Date) {
    const since = new Date(performedAt.getTime() - 24 * 3_600_000).toISOString()
    // Registros anteriores: autorización marcada como "autorizada"
    return sql.one(`SELECT id FROM hosp_procedures WHERE hospitalization_id = ? AND kind = 'authorization' AND status = 'authorized' AND COALESCE(updated_at, created_at) >= ? LIMIT 1`, [hospId, since])
  }

  /** La autorización elegida, si es de esta estancia y está firmada. */
  async function authorizationFor(hospId: string, id: string) {
    return sql.one(`SELECT id FROM hosp_procedures WHERE id = ? AND hospitalization_id = ? AND kind = 'authorization' AND status = 'authorized'`, [id, hospId])
  }

  /**
   * Nota de procedimiento: el procedimiento ya se hizo. Un solo texto (técnica, hallazgos, complicaciones),
   * con la fecha y hora del procedimiento (obligatoria, no futura) y la hora en que se escribe la nota.
   * Sin autorización firmada en las últimas 24 h, sólo se acepta como urgencia con justificación.
   */
  app.post('/api/inpatient/:id/procedure-notes', auth, need('inpatient.orders'), async (req, res) => {
    const b = parse(z.object({
      name: z.string().trim().min(3, 'Escribe el nombre del procedimiento.').max(200),
      performedAt: when,
      text: z.string().trim().min(10, 'Describe el procedimiento: técnica, hallazgos y complicaciones.').max(8000),
      authorizationId: z.string().optional(),
      urgent: z.boolean().default(false),
      justification: z.string().trim().max(1000).optional(),
    }), req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    const h = await activeHosp(cid, String(req.params.id))
    const performedAt = new Date(b.performedAt)
    if (performedAt.getTime() > Date.now() + 2 * 60_000) fail(400, 'La hora del procedimiento no puede ser en el futuro.')
    if (performedAt.getTime() < new Date(String(h.admitted_at)).getTime() - 24 * 3_600_000) fail(400, 'La hora del procedimiento es anterior al ingreso. Revísala.')
    const hasAuth = b.authorizationId ? await authorizationFor(String(h.id), b.authorizationId) : await signedAuthorization(String(h.id), performedAt)
    if (!hasAuth && !(b.urgent && (b.justification ?? '').length >= 10)) {
      fail(409, 'No hay autorización firmada registrada para este procedimiento. Regístrala o marca "Urgencia, sin autorización previa" con la justificación.')
    }
    const noteId = randomUUID()
    const data = { name: b.name, performedAt: performedAt.toISOString(), authorizationId: b.authorizationId, urgent: !hasAuth && b.urgent ? true : undefined, justification: !hasAuth && b.urgent ? b.justification : undefined }
    await sql.run(`INSERT INTO hosp_notes (id, clinic_id, hospitalization_id, kind, author_id, at, text, data) VALUES (?,?,?,'procedure',?,?,?,?)`,
      [noteId, cid, String(h.id), user.id, new Date().toISOString(), b.text, JSON.stringify(data)])
    await audit(user, `Escribió la nota del procedimiento "${b.name}" de ${await patientName(String(h.patient_id))} (realizado ${performedAt.toISOString()})${data.urgent ? ', urgencia sin autorización previa' : ''}`)
    res.status(201).json(toInpatientNote((await sql.one('SELECT * FROM hosp_notes WHERE id = ?', [noteId]))!))
  })

  // ---------- Procedimientos y autorizaciones (registros anteriores) ----------
  app.post('/api/inpatient/:id/procedures', auth, need('inpatient.view'), async (req, res) => {
    const b = parse(z.object({
      kind: z.enum(['procedure', 'authorization']),
      name: z.string().trim().min(3, 'Escribe el procedimiento o la autorización.').max(200),
      scheduledAt: when.optional(),
      notes: z.string().trim().max(1000).optional(),
    }), req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    const h = await activeHosp(cid, String(req.params.id))
    const id = randomUUID()
    await sql.run(`INSERT INTO hosp_procedures (id, clinic_id, hospitalization_id, kind, name, scheduled_at, status, notes, created_by, created_at) VALUES (?,?,?,?,?,?,'pending',?,?,?)`,
      [id, cid, String(h.id), b.kind, b.name, b.scheduledAt ? new Date(b.scheduledAt).toISOString() : null, b.notes || null, user.id, new Date().toISOString()])
    await audit(user, `Registró ${b.kind === 'procedure' ? 'el procedimiento' : 'la autorización'} "${b.name}" de ${await patientName(String(h.patient_id))}`)
    res.status(201).json(toProcedure((await sql.one('SELECT * FROM hosp_procedures WHERE id = ?', [id]))!))
  })

  app.patch('/api/inpatient/procedures/:pid', auth, need('inpatient.view'), async (req, res) => {
    const b = parse(z.object({ status: z.enum(['pending', 'authorized', 'done', 'denied']), notes: z.string().trim().max(1000).optional() }), req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    const p = (await sql.one('SELECT * FROM hosp_procedures WHERE id = ? AND clinic_id = ?', [String(req.params.pid), cid])) ?? fail(404, 'El registro no existe.')
    const h = await activeHosp(cid, String(p!.hospitalization_id))
    await sql.run('UPDATE hosp_procedures SET status = ?, notes = COALESCE(?, notes), updated_by = ?, updated_at = ? WHERE id = ?',
      [b.status, b.notes || null, user.id, new Date().toISOString(), String(p!.id)])
    await audit(user, `Cambió "${p!.name}" de ${await patientName(String(h.patient_id))} a ${b.status}`)
    res.json(toProcedure((await sql.one('SELECT * FROM hosp_procedures WHERE id = ?', [String(p!.id)]))!))
  })

  // ---------- Egreso ----------
  app.post('/api/inpatient/:id/discharge', auth, need('inpatient.orders'), async (req, res) => {
    const b = parse(z.object({
      diagnoses: dx.min(1, 'Agrega el diagnóstico de egreso.'),
      summary: z.string().trim().min(10, 'Resume por qué ingresó y qué se le hizo.').max(6000),
      condition: z.string().trim().min(2, 'Indica la condición al egreso.').max(200),
      instructions: z.string().trim().max(3000).default(''),
      followUp: z.string().trim().max(300).optional(),
      items: z.array(z.object({
        drug: z.string().trim().min(1), presentation: z.string().default(''), dose: z.string().trim().min(1, 'Escribe la dosis.'), route: z.string().optional(),
        frequency: z.string().min(1), duration: z.string().trim().min(1, 'Escribe la duración.'), instructions: z.string().optional(),
      })).default([]),
    }), req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    const h = await activeHosp(cid, String(req.params.id))
    const id = String(h.id)
    const patientId = String(h.patient_id)
    if (b.items.length) await assertRxIdentity(cid, patientId)
    const now = new Date()
    const noteId = randomUUID()
    const rxId = b.items.length ? randomUUID() : null
    let folio: string | null = null
    const name = await patientName(patientId)
    await sql.tx(async (q) => {
      if (rxId) {
        folio = await nextFolio(q, cid, now)
        await q.run(`INSERT INTO prescriptions (id, folio, patient_id, doctor_id, consultation_id, hospitalization_id, issued_at, items, clinic_id) VALUES (?,?,?,?,?,?,?,?,?)`,
          [rxId, folio, patientId, user.id, noteId, id, now.toISOString(), JSON.stringify(b.items), cid])
      }
      const data = { diagnoses: b.diagnoses, summary: b.summary, condition: b.condition, instructions: b.instructions, followUp: b.followUp }
      await q.run(`INSERT INTO hosp_notes (id, clinic_id, hospitalization_id, kind, author_id, at, plan, data) VALUES (?,?,?,'discharge',?,?,?,?)`,
        [noteId, cid, id, user.id, now.toISOString(), b.instructions, JSON.stringify(data)])
      // Al cerrar el expediente, las indicaciones que seguían activas dejan de generar dosis
      await q.run('UPDATE hosp_meds SET stopped_at = ?, stopped_by = ? WHERE hospitalization_id = ? AND stopped_at IS NULL', [now.toISOString(), user.id, id])
      await q.run(`UPDATE hospitalizations SET status = 'discharged', discharged_at = ?, discharged_by = ?, prescription_id = ? WHERE id = ?`,
        [now.toISOString(), user.id, rxId, id])
      await audit(user, `Dio de alta a ${name}${folio ? ` con receta ${folio}` : ''}`, q)
    })
    res.status(201).json({ hospitalization: toHospitalization((await hospRow(cid, id))!), prescriptionId: rxId, folio })
  })
}
