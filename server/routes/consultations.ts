import type { Express } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { nextFolio } from '../db.js'
import { closeOpenVisits } from '../stayVisits.js'
import { type Ctx, fail, parse, type Row, dayRange } from '../http.js'
import { toConsultation, toFollowup, toHospitalization, toPatient, toPrescription, toVitals, toReferral } from '../mappers.js'
import { rxValidityOf, specialtyOf, validityInput } from '../prefs.js'
import { currentMarks } from './me.js'
import { addendaFor } from './notes.js'
import { examInput, examsWhere, insertExams, toExamOrder } from './exams.js'
import { fluidsInput, vitalsBody, vitalsModeInput } from './inpatient.js'
import { fluidsOrderText } from '../../src/lib/fluids.js'
import { syncStayOrders } from '../medOrders.js'
import { ensureHospitalAuthorization } from '../authorizations.js'
import { diagnosisInput } from '../http.js'
import { applicationsOf } from './applications.js'
import { followupInput, insertFollowup } from './followups.js'
import { NEB_MAX_COMPONENTS, PAGE_SIZE } from '../../src/lib/clinicalConfig.js'
import { ADMIT_ORDER, yearsOld } from '../../src/lib/inpatient.js'
import { consultRxItems, dmy, medicationLine, normalizeDni } from '../../src/lib/format.js'
import { consultItemIssue } from '../../src/lib/medForm.js'
import { normalize } from '../../src/lib/patients.js'
import { hasBlank, medHasBlank } from '../../src/lib/orderSets.js'
import { assertGrace, printedAt, saveVersion, toVersion } from '../grace.js'
import { examLock, REMOVED_IN_GRACE } from '../correctionLocks.js'
import type { PrescriptionItem } from '../../src/lib/types.js'

/** Un medicamento de la receta. */
const rxItem = z.object({
  drug: z.string().trim().min(1, 'Escribe el medicamento.').max(160), presentation: z.string().max(160).default(''), dose: z.string().trim().min(1, 'Escribe la dosis.').max(80),
  route: z.string().max(40).optional(), frequency: z.string().min(1).max(80), duration: z.string().trim().max(80).default(''),
  instructions: z.string().max(300).optional(), quantity: z.string().trim().max(80).optional(),
  applyInClinic: z.boolean().optional(),
  // ME10 (ronda 10): con «Aplicar en la clínica», la clínica no lo tiene: va a una receta (cantidad: la cantidad total)
  buyOutside: z.boolean().optional(),
  // MC2 (ronda 6): un PRN lleva su condición («si dolor»)
  prnCondition: z.string().trim().max(120).optional(),
  // ME3 (ronda 9): primera dosis distinta (STAT); ME4: nebulización con varios medicamentos
  loadingDose: z.string().trim().max(60).optional(),
  nebulization: z.object({ components: z.array(z.object({ drug: z.string().trim().min(1, 'Escribe el medicamento de la nebulización.').max(160), amount: z.string().trim().min(1, 'Escribe la cantidad de cada medicamento de la nebulización.').max(40) })).min(1).max(NEB_MAX_COMPONENTS, `Una nebulización lleva hasta ${NEB_MAX_COMPONENTS} medicamentos.`),
    diluentVolume: z.string().trim().max(40).optional(), diluent: z.string().trim().max(80).optional() }).optional(),
  // ME16 (ronda 16): infusión continua (frecuencia «Infusión») de la consulta con ingreso: velocidad, unidad y hora de inicio.
  // Si va con ingreso y con su velocidad lo revisa cada ruta (consultItemIssue, la misma regla que el formulario)
  infusionRate: z.number().positive('La velocidad de infusión debe ser mayor que 0.').optional(),
  infusionUnit: z.enum(['ml/h', 'ml/min']).optional(),
  firstAt: z.string().max(40).refine((x) => !Number.isNaN(Date.parse(x)), 'La hora de inicio no es válida.').optional(),
}).refine((it) => !/^PRN\b/i.test(it.frequency) || !!it.prnCondition, 'Escribe la condición del medicamento PRN (ej. si dolor).')
  .refine((it) => !it.nebulization || it.route === 'Nebulización', 'La nebulización va con la vía «Nebulización».')
  .refine((it) => !it.loadingDose || (/cada\s+\d+\s*h/i.test(it.frequency) && !it.nebulization), 'La primera dosis distinta va con una frecuencia cada tantas horas.')

/** Consulta y receta: firma, corrección en el periodo de gracia, versiones y recetas. */
export function registerConsultations(app: Express, ctx: Ctx) {
  const { sql, auth, need, userOf, clinicOf, audit, patientName, patientRow, apptRow, assertRxIdentity } = ctx
  // ---------- Consulta y receta ----------
  app.post('/api/consultations', auth, need('consult.write'), async (req, res) => {
    const user = userOf(req)
    const c = parse(z.object({
      appointmentId: z.string(),
      reason: z.string().trim().min(1, 'Escribe el motivo de consulta.'),
      symptoms: z.array(z.string()).default([]),
      symptomOnset: z.string().optional(),
      history: z.string().default(''),
      exam: z.string().default(''),
      diagnoses: z.array(diagnosisInput).min(1, 'Agrega al menos un diagnóstico.'),
      orders: z.array(z.string().trim().min(1)).default([]),
      indications: z.array(z.string().trim().min(1).max(500)).max(40).optional(),
      observations: z.string().max(4000).default(''),
      followups: z.array(followupInput).max(5).default([]),
      // Ingreso a observación o a hospitalización: la estancia se crea en la misma transacción y esta nota es su
      // nota de ingreso. Son excluyentes.
      observe: z.boolean().default(false),
      admit: z.boolean().default(false),
      vitalsId: z.string().optional(),
      items: z.array(rxItem).default([]),
      validityDays: validityInput,
      // EX1: exámenes de laboratorio e imagen y gabinete; se imprimen en una orden por grupo, aparte de la receta
      exams: z.array(examInput).max(40).default([]),
      // MC6 (ronda 6): frecuencia de signos vitales del ingreso (por turno por defecto)
      vitalsPlan: vitalsModeInput.optional(),
      // IE1 (ronda 16): «Ingestas y excretas» con el ingreso (activa el registro durante la estancia)
      fluids: fluidsInput.optional(),
    }), req.body)
    // Basta una indicación, un medicamento o un examen; no se exigen todos
    if (!c.orders.length && !c.items.length && !c.exams.length) fail(400, 'Agrega al menos una indicación, un medicamento o un examen en el plan y manejo.')
    // Un set de órdenes puede traer espacios "___": se llenan antes de firmar
    if (c.orders.some(hasBlank) || c.items.some(medHasBlank)) fail(400, 'Completa los espacios ___ de las órdenes antes de firmar.')
    if (c.admit && c.observe) fail(400, 'Elige ingreso a hospitalización o a observación, no los dos.')
    // ME13 y ME14 (ronda 14): solo las casillas «Ingreso a observación» e «Ingreso a hospitalización» ingresan al paciente;
    // un medicamento «Aplicar en la clínica» nunca crea una estancia (antes, ME3 de la ronda 9, sí: bastaba uno marcado).
    // La casilla decide, con o sin ingreso: marcado, se aplica aquí (con ingreso, a la hoja; sin ingreso, queda «Por
    // aplicar» para enfermería); sin marcar, va a la receta. Los «No hay en la clínica» van a los dos lados (ME10).
    // Se guarda explícita (true/false): así se distinguen de las consultas de antes, que con ingreso iban todas a la hoja.
    // Con ingreso, lo que no trae la casilla se aplica en la clínica (como hasta ahora: va a la hoja); solo lo desmarcado a
    // propósito (false) va a la receta. Sin ingreso, solo lo marcado se aplica aquí.
    const stayKind = c.admit ? 'hospital' : c.observe ? 'observation' : null
    // NO1 (ronda 16): con ingreso ya no hay casilla: todos los medicamentos pasan a la hoja (y a la receta, ME15). Antes (ME14,
    // ronda 14) lo desmarcado a propósito (false) iba solo a la receta: `stayKind ? it.applyInClinic !== false : …`
    const items = c.items.map((it) => ({ ...it, applyInClinic: stayKind ? true : !!it.applyInClinic }))
    // NO1 (ronda 16): con ingreso, la primera indicación es «Ingreso a hospitalización» u «Ingreso a observación» (la pone el
    // formulario; si no viene, o viene la del otro ingreso, se corrige aquí: va una sola vez y en el número 1)
    if (stayKind) {
      const line = ADMIT_ORDER[stayKind]
      const isAdmit = (o: string) => (Object.values(ADMIT_ORDER) as string[]).includes(o.replace(/\.$/, ''))
      c.orders = [line, ...c.orders.filter((o) => !isAdmit(o))]
      c.indications = [line, ...(c.indications ?? []).filter((o) => !isAdmit(o))]
    }
    // ME15 (ronda 15): la receta lleva TODOS los medicamentos, también los «Aplicar en la clínica» (con su leyenda y su
    // cantidad), con o sin ingreso: el paciente puede comprarlo y traerlo, y la receta es la constancia de lo indicado. Antes
    // (ME13, ronda 14) aquí se quitaban: `items.filter((it) => !it.applyInClinic || it.buyOutside)`.
    const rxItems = consultRxItems(items)
    // ME16 (ronda 16): la infusión lleva su velocidad. Desde IF1 (ronda 17) se indica en cualquier paciente, con o sin ingreso
    // (antes: «la infusión solo con ingreso y con su velocidad (como el formulario: sin ingreso no aparece)»)
    for (const it of c.items) { const issue = consultItemIssue(it, { admitting: !!stayKind }); if (issue) fail(400, issue) }
    // ME13: sin ingreso, lo que se aplica en la clínica es una sola dosis (STAT): no se programan dosis siguientes (A6)
    if (!stayKind) {
      const repeat = items.find((it) => it.applyInClinic && (!/única/i.test(it.frequency) || it.loadingDose))
      if (repeat) fail(400, `${repeat.drug}: sin ingreso solo se permite dosis STAT. Cámbiala o marca el ingreso.`)
    }
    // La receta necesita el total de días; lo que se aplica en la clínica (con ingreso, «hasta nueva orden») no
    const noDays = rxItems.find((it) => !it.applyInClinic && !it.duration && !/única/i.test(it.frequency) && !it.infusionRate)
    if (noDays) fail(400, `Escribe el total de días de ${noDays.drug}: va a la receta.`)
    const cid = clinicOf(req)
    // Un consultorio no hospitaliza; la observación la puede tener apagada
    const place = (await sql.one('SELECT kind, observation_enabled FROM clinics WHERE id = ?', [cid]))!
    if (place.kind === 'office' && c.admit) fail(400, 'Un consultorio no tiene hospitalización. Usa observación o refiere al paciente.')
    if (place.kind === 'office' && stayKind === 'observation' && !place.observation_enabled) {
      fail(400, 'Este consultorio no usa observación. Actívala en Configuración.')
    }
    const appt = (await apptRow(cid, c.appointmentId)) ?? fail(404, 'La cita no existe.')
    if (appt!.doctor_id !== user.id) fail(403, 'Sólo el médico asignado puede firmar esta consulta.')
    if (['done', 'cancelled', 'no_show'].includes(String(appt!.status))) fail(409, 'Esta cita ya está cerrada.')
    const patientId = String(appt!.patient_id)
    if (c.vitalsId && !(await sql.one('SELECT 1 FROM vitals WHERE id = ? AND clinic_id = ? AND patient_id = ?', [c.vitalsId, cid, patientId]))) fail(404, 'Los signos vitales no existen o son de otro paciente.')
    const name = await patientName(patientId)
    const consultId = randomUUID()
    const stayId = stayKind ? randomUUID() : null
    const patientPhone = stayKind ? String((await patientRow(cid, patientId))?.phone ?? '') : ''
    if (stayKind && await sql.one(`SELECT 1 FROM hospitalizations WHERE patient_id = ? AND clinic_id = ? AND status = 'active'`, [patientId, cid])) {
      fail(409, `${name} ya está en observación u hospitalizado.`)
    }
    // ME15: si todo se aplica en la clínica y el adulto no tiene identidad, se firma sin receta como antes (no se bloquea la
    // atención); la receta se genera después desde «Receta» de la tarjeta, ya con la identidad
    const onlyInClinic = !items.some((it) => !it.applyInClinic || it.buyOutside)
    const pRow = await patientRow(cid, String(appt!.patient_id))
    const noIdentity = !!pRow && !pRow.dni && yearsOld(String(pRow.birth_date)) >= 18
    const rxId = rxItems.length && !(onlyInClinic && noIdentity) ? randomUUID() : null
    let medOrders = 0
    const now = new Date()
    let folio: string | null = null
    let examBatch: string | null = null
    let clinicBatch: string | null = null
    let applications = 0
    if (rxId) await assertRxIdentity(cid, patientId)
    await sql.tx(async (q) => {
      // El candado del folio también evita que la misma cita se firme dos veces al mismo tiempo
      if (rxId) folio = await nextFolio(q, cid, now)
      else await q.run('SELECT pg_advisory_xact_lock(hashtext(?))', [`rx:${cid}`])
      const closed = await q.one(`SELECT 1 FROM appointments WHERE id = ? AND status = 'done'`, [c.appointmentId])
      if (closed) fail(409, 'Esta cita ya está cerrada.')
      if (rxId) {
        const marks = await currentMarks(q, user.id)
        await q.run(`INSERT INTO prescriptions (id,folio,patient_id,doctor_id,consultation_id,issued_at,items,clinic_id,validity_days,signature_id,stamp_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [rxId, folio, patientId, user.id, consultId, now.toISOString(), JSON.stringify(rxItems), cid, await rxValidityOf(q, user.id, c.validityDays), marks.signatureId, marks.stampId])
      }
      await q.run(`INSERT INTO consultations (id,patient_id,doctor_id,appointment_id,date,reason,symptoms,symptom_onset,history,exam,diagnoses,plan,vitals_id,prescription_id,orders,observations,clinic_id,indications,
          admit_kind, meds, recorded_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [consultId, patientId, user.id, c.appointmentId, now.toISOString(), c.reason, JSON.stringify(c.symptoms), c.symptomOnset ?? null,
          c.history, c.exam, JSON.stringify(c.diagnoses), c.orders.map((o, i) => `${i + 1}. ${o}`).join('\n'), c.vitalsId ?? null, rxId, JSON.stringify(c.orders), c.observations, cid,
          c.indications ? JSON.stringify(c.indications) : null, stayKind, items.length ? JSON.stringify(items) : null, now.toISOString()])
      await q.run(`UPDATE appointments SET status = 'done' WHERE id = ?`, [c.appointmentId])
      // RF1 (ronda 8): las referencias firmadas con la nota en borrador quedan en esta consulta
      await q.run('UPDATE referrals SET consultation_id = ? WHERE appointment_id = ? AND consultation_id IS NULL AND clinic_id = ?', [consultId, c.appointmentId, cid])
      for (const f of c.followups) await insertFollowup(q, cid, user.id, { ...f, patientId }, consultId)
      // Con ingreso, los exámenes son de la estancia (enfermería los gestiona); si no, de la consulta externa
      const examCtx = { clinicId: cid, patientId, consultationId: consultId, hospitalizationId: stayId ?? undefined, by: user.id, at: now.toISOString() }
      if (stayKind) examBatch = await insertExams(q, examCtx, c.exams)
      else {
        // EX10 (ronda 14): sin ingreso, dos órdenes, cada una con su folio: la de los «Externo» (se imprime con la receta) y la
        // de los «En la clínica» (le llega al laboratorio o a imágenes; se imprime aparte solo si el paciente la quiere llevar)
        examBatch = await insertExams(q, examCtx, c.exams.filter((e) => e.place === 'external'))
        clinicBatch = await insertExams(q, examCtx, c.exams.filter((e) => e.place !== 'external'))
      }
      // ME13 (ronda 14): sin ingreso, cada «Aplicar en la clínica» queda «Por aplicar» para enfermería o el médico
      if (!stayKind) {
        for (const [index, it] of items.entries()) {
          if (!it.applyInClinic) continue
          await q.run(`INSERT INTO consult_applications (id, clinic_id, patient_id, consultation_id, item_index, drug, order_text, ordered_by, ordered_at, status)
            VALUES (?,?,?,?,?,?,?,?,?,'pending') ON CONFLICT DO NOTHING`, [randomUUID(), cid, patientId, consultId, index, it.drug, medicationLine(it), user.id, now.toISOString()])
          applications++
        }
        if (applications) await audit(user, `Indicó ${applications} medicamento(s) para aplicar en la clínica a ${name}, sin ingreso`, q)
      }
      await audit(user, rxId ? `Firmó consulta y receta ${folio} de ${name}` : `Firmó consulta de ${name}`, q)
      if (stayId) {
        // La hospitalización se crea sin cama: el médico la elige al terminar de firmar (o la corrige después)
        // HO2 (ronda 16): el médico que ingresa desde la consulta es el médico tratante
        await q.run(`INSERT INTO hospitalizations (id, clinic_id, patient_id, bed_id, consultation_id, admitted_at, admitted_by, reason, diagnoses, patient_phone, status, kind, specialty, vitals_plan, attending_ids)
          VALUES (?,?,?,NULL,?,?,?,?,?,?,'active',?,?,?,?)`,
          [stayId, cid, patientId, consultId, now.toISOString(), user.id, c.reason, JSON.stringify(c.diagnoses), patientPhone || null, stayKind, specialtyOf(user),
            c.vitalsPlan ? JSON.stringify([{ ...c.vitalsPlan, from: now.toISOString(), by: user.id, noteId: consultId }]) : null, JSON.stringify([user.id])])
        // IE1 (ronda 16): la orden de ingestas y excretas de la consulta empieza el registro de la estancia
        if (c.fluids && c.fluids.mode !== 'off') {
          await q.run('UPDATE hospitalizations SET fluids_plan = ? WHERE id = ?', [JSON.stringify([{ mode: c.fluids.mode, from: now.toISOString(), by: user.id, noteId: consultId }]), stayId])
          await audit(user, `Indicó «${fluidsOrderText(c.fluids.mode)}» a ${name} con el ingreso`, q)
        }
        medOrders = await syncStayOrders(q, { clinicId: cid, hospitalizationId: stayId })
        // Ronda 8: las otras citas abiertas de hoy (por ejemplo, otra en sala con otro médico) se cancelan
        await closeOpenVisits(q, cid, patientId, now, now)
        // La autorización de hospitalización queda generada, pendiente de firma, desde el ingreso. La observación
        // no lleva autorización (ronda 3, P6): se genera si después pasa a hospitalización.
        if (stayKind === 'hospital') await ensureHospitalAuthorization(q, (await q.one('SELECT * FROM hospitalizations WHERE id = ?', [stayId]))!, user)
        await audit(user, `Ingresó a ${name} a ${stayKind === 'hospital' ? 'hospitalización' : 'observación'} desde la consulta externa${medOrders ? ` (${medOrders} medicamento(s) a la hoja)` : ''}`, q)
      }
    })
    res.status(201).json({ consultationId: consultId, prescriptionId: rxId, folio, hospitalizationId: stayId, stayKind, medOrders, examBatch, clinicBatch, applications,
      observationId: stayKind === 'observation' ? stayId : null })
  })

  app.get('/api/consultations/:id', auth, need('chart.view'), async (req, res) => {
    const cid = clinicOf(req)
    const row = (await sql.one('SELECT * FROM consultations WHERE id = ? AND clinic_id = ?', [String(req.params.id), cid])) ?? fail(404, 'La consulta no existe.')
    const c = toConsultation(row!)
    const vitals = c.vitalsId ? await sql.one('SELECT * FROM vitals WHERE id = ? AND clinic_id = ?', [c.vitalsId, cid]) : undefined
    const what = req.query.purpose === 'certificate' ? 'Emitió constancia médica de' : 'Abrió la nota de consulta de'
    await audit(userOf(req), `${what} ${await patientName(c.patientId)}`)
    // MC5 (ronda 6): los exámenes que pidió la consulta, con su estado de ahora
    const exams = await examsWhere(sql, 'clinic_id = ? AND consultation_id = ? AND note_id IS NULL', [cid, c.id])
    // Ronda 8: las referencias emitidas desde esta consulta
    const referrals = (await sql.query('SELECT * FROM referrals WHERE clinic_id = ? AND consultation_id = ? ORDER BY issued_at', [cid, c.id])).map(toReferral)
    res.json({ consultation: c, patient: toPatient((await patientRow(cid, c.patientId))!, true), vitals: vitals ? toVitals(vitals) : null, addenda: await addendaFor(sql, cid, [c.id]), exams, referrals,
      applications: await applicationsOf(sql, cid, [c.id]) })
  })

  /**
   * Receta sin consulta: el médico renueva un tratamiento sin abrir una consulta completa. También para una
   * persona que no está en la biblioteca: se escriben sus datos y no se le crea expediente.
   */
  app.post('/api/prescriptions', auth, need('rx.write'), async (req, res) => {
    const user = userOf(req)
    const b = parse(z.object({
      patientId: z.string().optional(),
      guest: z.object({
        name: z.string().trim().min(3, 'Escribe el nombre completo.').max(120),
        birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha de nacimiento no es válida.').optional().or(z.literal('').transform(() => undefined)),
        age: z.string().trim().max(30).optional(),
        sex: z.enum(['F', 'M']).optional(),
        dni: z.string().trim().max(30).optional().transform(normalizeDni),
        phone: z.string().trim().max(30).optional(),
      }).optional(),
      items: z.array(rxItem).min(1, 'Agrega al menos un medicamento.').max(20),
      indications: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
      validityDays: validityInput,
    }), req.body)
    if (!b.patientId === !b.guest) fail(400, 'Elige al paciente o escribe sus datos.')
    // IF1 (ronda 17): la receta suelta también lleva infusión continua (con su velocidad; «hasta nueva orden», sin total de días)
    for (const it of b.items) { const issue = consultItemIssue(it, { admitting: false }); if (issue) fail(400, issue) }
    const noDays = b.items.find((it) => !it.duration && !/única/i.test(it.frequency) && !it.infusionRate)
    if (noDays) fail(400, `Escribe el total de días de ${noDays.drug}.`)
    const cid = clinicOf(req)
    const p = b.patientId ? (await patientRow(cid, b.patientId)) ?? fail(404, 'El paciente no existe.') : undefined
    if (p?.pending) fail(409, 'Completa el registro del paciente antes de emitirle una receta.')
    if (b.patientId) await assertRxIdentity(cid, b.patientId)
    const guest = b.guest ? Object.fromEntries(Object.entries(b.guest).filter(([, v]) => v)) : null
    const who = p ? `${p.first_name} ${p.last_name}` : `${b.guest!.name} (paciente no registrado)`
    const id = randomUUID()
    const now = new Date()
    let folio = ''
    await sql.tx(async (q) => {
      folio = await nextFolio(q, cid, now)
      const marks = await currentMarks(q, user.id)
      await q.run(`INSERT INTO prescriptions (id, folio, patient_id, doctor_id, consultation_id, issued_at, items, clinic_id, standalone, indications, guest, validity_days, signature_id, stamp_id)
        VALUES (?,?,?,?,?,?,?,?,TRUE,?,?,?,?,?)`,
        [id, folio, b.patientId ?? null, user.id, '', now.toISOString(), JSON.stringify(b.items), cid, JSON.stringify(b.indications), guest ? JSON.stringify(guest) : null,
          await rxValidityOf(q, user.id, b.validityDays), marks.signatureId, marks.stampId])
      await audit(user, `Emitió la receta sin consulta ${folio} de ${who}`, q)
    })
    res.status(201).json({ prescriptionId: id, folio })
  })

  /** La persona de una receta sin expediente se registró (o ya tenía expediente): la receta pasa a su expediente. */
  app.post('/api/prescriptions/:id/link', auth, need('rx.write'), async (req, res) => {
    const { patientId } = parse(z.object({ patientId: z.string().min(1, 'Elige al paciente.') }), req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    const row = (await sql.one('SELECT * FROM prescriptions WHERE id = ? AND clinic_id = ?', [String(req.params.id), cid])) ?? fail(404, 'La receta no existe.')
    if (row!.patient_id) fail(409, 'Esta receta ya está en el expediente de un paciente.')
    const p = (await patientRow(cid, patientId)) ?? fail(404, 'El paciente no existe.')
    if (p!.pending) fail(409, 'Completa el registro del paciente antes de vincularle la receta.')
    await sql.run('UPDATE prescriptions SET patient_id = ?, linked_at = ?, linked_by = ? WHERE id = ?', [patientId, new Date().toISOString(), user.id, String(row!.id)])
    await audit(user, `Vinculó la receta ${row!.folio} (paciente no registrado) al expediente ${p!.record} de ${p!.first_name} ${p!.last_name}`)
    res.json(toPrescription((await sql.one('SELECT * FROM prescriptions WHERE id = ?', [String(row!.id)]))!))
  })

  /** Anular una receta emitida (con motivo). Queda en el historial marcada como anulada; se emite otra si hace falta. */
  // GE4 (ronda 9): cada impresión o descarga de la receta queda registrada (y en la bitácora); una receta impresa ya no se corrige
  app.post('/api/prescriptions/:id/printed', auth, need('rx.view'), async (req, res) => {
    const { how } = parse(z.object({ how: z.enum(['print', 'pdf', 'whatsapp']).default('print') }), req.body ?? {})
    const user = userOf(req)
    const cid = clinicOf(req)
    const row = (await sql.one('SELECT id, folio, patient_id, include_dx FROM prescriptions WHERE id = ? AND clinic_id = ?', [String(req.params.id), cid])) ?? fail(404, 'La receta no existe.')
    // IM2 (ronda 13): el registro guarda si la receta llevaba el diagnóstico (las de antes de la v81, sí)
    const withDx = row!.include_dx == null ? true : Boolean(row!.include_dx)
    await sql.run('INSERT INTO print_log (id, clinic_id, target_kind, target_id, how, by_id, at, with_dx) VALUES (?,?,?,?,?,?,?,?)', [randomUUID(), cid, 'prescription', String(row!.id), how, user.id, new Date().toISOString(), withDx])
    await audit(user, `${how === 'pdf' ? 'Descargó en PDF' : how === 'whatsapp' ? 'Envió por WhatsApp' : 'Imprimió'} la receta ${row!.folio}${withDx && how !== 'whatsapp' ? ' (con diagnóstico)' : ''}${row!.patient_id ? ` de ${await patientName(String(row!.patient_id))}` : ''}`)
    res.json({ ok: true })
  })

  /**
   * IM2 (ronda 13): «Incluir diagnóstico» en la receta. Lo decide el médico (rx.write); se guarda con la receta, así que al
   * reimprimirla (también enfermería) sale igual. Una receta anulada no cambia.
   */
  app.post('/api/prescriptions/:id/include-dx', auth, need('rx.write'), async (req, res) => {
    const { includeDx } = parse(z.object({ includeDx: z.boolean() }), req.body ?? {})
    const user = userOf(req)
    const cid = clinicOf(req)
    const row = (await sql.one('SELECT id, folio, patient_id, voided_at FROM prescriptions WHERE id = ? AND clinic_id = ?', [String(req.params.id), cid])) ?? fail(404, 'La receta no existe.')
    if (row!.voided_at) fail(409, 'La receta está anulada.')
    await sql.run('UPDATE prescriptions SET include_dx = ? WHERE id = ?', [includeDx, String(row!.id)])
    await audit(user, `${includeDx ? 'Incluyó' : 'Quitó'} el diagnóstico en la receta ${row!.folio}${row!.patient_id ? ` de ${await patientName(String(row!.patient_id))}` : ''}`)
    res.json(toPrescription((await sql.one('SELECT * FROM prescriptions WHERE id = ?', [String(row!.id)]))!))
  })

  /**
   * GE4 (ronda 9): «Corregir» la nota de consulta externa en el periodo de gracia (sólo quien la firmó). Se corrige lo
   * escrito y los diagnósticos; los medicamentos de la receta, sólo si la receta no se imprimió, descargó ni anuló.
   */
  /**
   * GE4: lo que la corrección de una consulta puede tocar además de lo escrito: los exámenes (se cancelan si no tienen
   * muestra ni orden impresa) y los seguimientos que salieron de ella (se ajustan mientras su aviso no se haya enviado).
   */
  const followupLock = (f: Row) => (!f.active || f.done_at ? 'Este seguimiento ya se cerró. Cámbialo en Seguimientos.'
    : f.notified_at || f.reminded_week || f.reminded_eve || f.reminded_day ? 'Ya se envió un aviso de este seguimiento. Cámbialo en Seguimientos.' : undefined)
  async function consultLocks(q: typeof sql, c: Row) {
    const rx = c.prescription_id ? await q.one('SELECT * FROM prescriptions WHERE id = ?', [String(c.prescription_id)]) : undefined
    const stay = await q.one('SELECT 1 FROM hospitalizations WHERE consultation_id = ? LIMIT 1', [String(c.id)])
    const rxLock = !rx ? undefined : rx.voided_at ? 'La receta está anulada.' : (await printedAt(q, 'prescription', String(rx.id))) ? 'Ya se imprimió la receta. Corrígelo con una adenda.'
      : stay ? 'Los medicamentos ya pasaron a la hoja de la estancia. Corrígelos con una adenda.' : undefined
    const exams = await q.query(`SELECT * FROM exam_orders WHERE consultation_id = ? AND status <> 'cancelled' ORDER BY ordered_at, id`, [String(c.id)])
    const followups = await q.query('SELECT * FROM followups WHERE source_id = ? AND clinic_id = ? ORDER BY due_date', [String(c.id), String(c.clinic_id)])
    return {
      rxLock, exams: await Promise.all(exams.map(async (e) => ({ ...toExamOrder(e), lock: await examLock(q, e) }))),
      followups: followups.filter((f) => f.active).map((f) => ({ ...toFollowup(f), lock: followupLock(f) })),
    }
  }
  app.get('/api/consultations/:id/correct', auth, need('consult.write'), async (req, res) => {
    const c = (await sql.one('SELECT * FROM consultations WHERE id = ? AND clinic_id = ?', [String(req.params.id), clinicOf(req)])) ?? fail(404, 'La consulta no existe.')
    res.json(await consultLocks(sql, c!))
  })

  app.post('/api/consultations/:id/correct', auth, need('consult.write'), async (req, res) => {
    const b = parse(z.object({
      version: z.number().int().min(1),
      why: z.string().trim().max(300).optional(),
      reason: z.string().trim().min(1, 'Escribe el motivo de consulta.'),
      history: z.string().default(''), exam: z.string().default(''), observations: z.string().max(4000).default(''),
      diagnoses: z.array(diagnosisInput).min(1, 'Agrega al menos un diagnóstico.'),
      items: z.array(rxItem).optional(),
      // Los exámenes que quedan (los demás se cancelan) y los seguimientos de la consulta como quedan (los que faltan se quitan)
      keepExams: z.array(z.string()).max(40).optional(),
      followups: z.array(z.object({ id: z.string(), title: z.string().trim().min(3, 'Escribe el motivo del seguimiento.').max(200),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elige la fecha del seguimiento.'), notes: z.string().trim().max(500).optional() })).max(20).optional(),
    }), req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    const c = (await sql.one('SELECT * FROM consultations WHERE id = ? AND clinic_id = ?', [String(req.params.id), cid])) ?? fail(404, 'La consulta no existe.')
    assertGrace(user.id, c!.doctor_id, c!.recorded_at, 'firmó la nota')
    if (Number(c!.version ?? 1) !== b.version) fail(409, 'La nota cambió mientras la corregías. Actualiza la página.')
    const rx = c!.prescription_id ? await sql.one('SELECT * FROM prescriptions WHERE id = ?', [String(c!.prescription_id)]) : undefined
    if (b.items) {
      if (!rx) fail(409, 'Esta consulta no tiene receta.')
      const { rxLock } = await consultLocks(sql, c!)
      if (rxLock) fail(409, rxLock)
      if (!b.items.length) fail(400, 'La receta necesita al menos un medicamento; para quitarla, anúlala.')
      if (b.items.some((it) => it.applyInClinic)) fail(400, '«Aplicar en la clínica» no se agrega en una corrección.')
      if (b.items.some(medHasBlank)) fail(400, 'Completa los espacios ___ de los medicamentos.')
      // ME16 (ronda 16): una infusión solo en la consulta que dio el ingreso
      for (const it of b.items) { const issue = consultItemIssue(it, { admitting: !!c!.admit_kind }); if (issue) fail(400, issue) }
    }
    const version = Number(c!.version ?? 1)
    const who = await patientName(String(c!.patient_id))
    await sql.tx(async (q) => {
      // Exámenes y seguimientos primero: si algo ya se cumplió o ya se avisó, nada se guarda
      const locks = b.keepExams || b.followups ? await consultLocks(q, c!) : undefined
      const changes: string[] = []
      const at = new Date().toISOString()
      if (b.keepExams && locks) {
        if (b.keepExams.some((id) => !locks.exams.some((e) => e.id === id))) fail(400, 'Ese examen no es de esta consulta.')
        for (const e of locks.exams.filter((x) => !b.keepExams!.includes(x.id))) {
          if (e.lock) fail(409, `${e.name}: ${e.lock}`)
          await q.run(`UPDATE exam_orders SET status = 'cancelled', cancel_reason = ?, status_at = ?, status_by = ? WHERE id = ?`, [REMOVED_IN_GRACE, at, user.id, e.id])
          await q.run('INSERT INTO exam_events (id, clinic_id, exam_id, status, by_id, at, note) VALUES (?,?,?,?,?,?,?)', [randomUUID(), cid, e.id, 'cancelled', user.id, at, REMOVED_IN_GRACE])
          changes.push(`canceló el examen ${e.name}`)
        }
      }
      if (b.followups && locks) {
        if (b.followups.some((f) => !locks.followups.some((x) => x.id === f.id))) fail(400, 'Ese seguimiento no es de esta consulta.')
        for (const f of locks.followups) {
          const p = b.followups.find((x) => x.id === f.id)
          const same = p && p.title === f.title && p.dueDate === f.dueDate && (p.notes || undefined) === f.notes
          if (same) continue
          if (f.lock) fail(409, `${f.title}: ${f.lock}`)
          if (!p) {
            await q.run('UPDATE followups SET active = FALSE WHERE id = ?', [f.id])
            changes.push(`quitó el seguimiento «${f.title}» del ${f.dueDate}`)
          } else {
            await q.run('UPDATE followups SET title = ?, due_date = ?, notes = ? WHERE id = ?', [p.title, p.dueDate, p.notes || null, f.id])
            changes.push(`cambió el seguimiento «${f.title}» del ${f.dueDate} por «${p.title}» del ${p.dueDate}`)
          }
        }
      }
      const next = await saveVersion(q, { clinicId: cid, kind: 'consultation', id: String(c!.id), version, authorId: String(c!.doctor_id), at: String(c!.recorded_at), by: user.id, reason: b.why,
        data: { reason: c!.reason, history: c!.history, exam: c!.exam, observations: c!.observations, diagnoses: JSON.parse(String(c!.diagnoses ?? '[]')), items: rx ? JSON.parse(String(rx.items)) : undefined,
          ...(locks ? { exams: locks.exams.map((e) => ({ id: e.id, name: e.name, status: e.status })), followups: locks.followups.map((f) => ({ id: f.id, title: f.title, dueDate: f.dueDate, notes: f.notes })) } : {}) } })
      await q.run('UPDATE consultations SET reason = ?, history = ?, exam = ?, observations = ?, diagnoses = ?, version = ? WHERE id = ?',
        [b.reason, b.history, b.exam, b.observations, JSON.stringify(b.diagnoses), next, String(c!.id)])
      if (b.items) await q.run('UPDATE prescriptions SET items = ? WHERE id = ?', [JSON.stringify(b.items), String(rx!.id)])
      await audit(user, `Corrigió su nota de consulta de ${who} en el periodo de gracia (versión ${next})${b.items ? `, con la receta ${rx!.folio}` : ''}${changes.length ? `; ${changes.join('; ')}` : ''}${b.why ? `: ${b.why}` : ''}`, q, String(c!.patient_id))
    })
    res.json(toConsultation((await sql.one('SELECT * FROM consultations WHERE id = ?', [String(c!.id)]))!))
  })

  /** GE4 (ronda 9): «Ver versiones»: las anteriores, en solo lectura, para quien ya ve ese registro (clínico). */
  const VERSION_TABLE = { note: 'hosp_notes', dose: 'hosp_doses', vitals: 'vitals', consultation: 'consultations', exam_result: 'exam_orders', anesthesia: 'anesthesia_sheets', preanesthesia: 'preanesthesia_evals', surgical_count: 'surgical_counts', fluid_entry: 'fluid_entries' } as const
  app.get('/api/versions/:kind/:id', auth, need('chart.view'), async (req, res) => {
    const kind = String(req.params.kind) as keyof typeof VERSION_TABLE
    if (!VERSION_TABLE[kind]) fail(404, 'No hay versiones de ese registro.')
    const cid = clinicOf(req)
    if (!(await sql.one(`SELECT 1 FROM ${VERSION_TABLE[kind]} WHERE id = ? AND clinic_id = ?`, [String(req.params.id), cid]))) fail(404, 'El registro no existe.')
    const rows = await sql.query('SELECT * FROM record_versions WHERE clinic_id = ? AND target_kind = ? AND target_id = ? ORDER BY version', [cid, kind, String(req.params.id)])
    res.json(rows.map(toVersion))
  })

  /** GE4 (ronda 9): «Corregir» una toma de signos vitales (preclínica u hoja de la estancia) en el periodo de gracia. */
  app.post('/api/vitals/:vid/correct', auth, need('vitals.record'), async (req, res) => {
    const b = parse(vitalsBody.extend({ version: z.number().int().min(1), why: z.string().trim().max(300).optional(),
      // Preclínica: el motivo de consulta que escribió enfermería
      chiefComplaint: z.string().trim().min(1, 'Escribe el motivo de consulta.').max(500).optional() }), req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    const v = (await sql.one('SELECT * FROM vitals WHERE id = ? AND clinic_id = ?', [String(req.params.vid), cid])) ?? fail(404, 'La toma no existe.')
    if (v!.voided_at) fail(409, 'Esa toma está anulada.')
    assertGrace(user.id, v!.taken_by, v!.recorded_at ?? (v!.hospitalization_id ? undefined : v!.taken_at), 'registró la toma')
    if (Number(v!.version ?? 1) !== b.version) fail(409, 'La toma cambió mientras la corregías. Actualiza la página.')
    if (v!.hospitalization_id) {
      const h = await sql.one('SELECT status FROM hospitalizations WHERE id = ?', [String(v!.hospitalization_id)])
      if (h?.status !== 'active') fail(409, 'La estancia ya terminó.')
    }
    const takenAt = b.takenAt && v!.hospitalization_id ? new Date(b.takenAt) : new Date(String(v!.taken_at))
    if (takenAt.getTime() > Date.now() + 60_000) fail(400, 'La hora de la toma no puede ser en el futuro.')
    const cols = ['systolic', 'diastolic', 'heart_rate', 'temperature', 'spo2', 'weight_kg', 'height_cm', 'pain_scale', 'resp_rate', 'glucose', 'notes', 'taken_at', 'chief_complaint'] as const
    const complaint = b.chiefComplaint && !v!.hospitalization_id ? b.chiefComplaint : v!.chief_complaint ?? null
    const next = Number(v!.version ?? 1)
    const who = await patientName(String(v!.patient_id))
    await sql.tx(async (q) => {
      const n = await saveVersion(q, { clinicId: cid, kind: 'vitals', id: String(v!.id), version: next, authorId: String(v!.taken_by), at: String(v!.recorded_at ?? v!.taken_at), by: user.id, reason: b.why,
        data: Object.fromEntries(cols.map((c) => [c, v![c] ?? null])) })
      await q.run(`UPDATE vitals SET systolic = ?, diastolic = ?, heart_rate = ?, temperature = ?, spo2 = ?, weight_kg = ?, height_cm = ?, pain_scale = ?, resp_rate = ?, glucose = ?, notes = ?, taken_at = ?, chief_complaint = ?, version = ? WHERE id = ?`,
        [b.systolic ?? null, b.diastolic ?? null, b.heartRate ?? null, b.temperature ?? null, b.spo2 ?? null, b.weightKg ?? null, b.heightCm ?? null, b.painScale ?? null, b.respRate ?? null, b.glucose ?? null, b.notes || null,
          takenAt.toISOString(), complaint, n, String(v!.id)])
      await audit(user, `Corrigió la toma de signos vitales de ${who} en el periodo de gracia (versión ${n})${b.why ? `: ${b.why}` : ''}`, q, String(v!.patient_id))
    })
    res.json(toVitals((await sql.one('SELECT * FROM vitals WHERE id = ?', [String(v!.id)]))!))
  })

  app.post('/api/prescriptions/:id/void', auth, need('rx.write'), async (req, res) => {
    const { reason } = parse(z.object({ reason: z.string().trim().min(5, 'Escribe por qué se anula la receta.').max(300) }), req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    const row = (await sql.one('SELECT * FROM prescriptions WHERE id = ? AND clinic_id = ?', [String(req.params.id), cid])) ?? fail(404, 'La receta no existe.')
    if (row!.voided_at) fail(409, 'Esta receta ya está anulada.')
    await sql.run('UPDATE prescriptions SET voided_at = ?, voided_by = ?, void_reason = ? WHERE id = ?', [new Date().toISOString(), user.id, reason, String(row!.id)])
    await audit(user, `Anuló la receta ${row!.folio}${row!.patient_id ? ` de ${await patientName(String(row!.patient_id))}` : ''}: ${reason}`)
    res.json(toPrescription((await sql.one('SELECT * FROM prescriptions WHERE id = ?', [String(row!.id)]))!))
  })

  /**
   * GE5 (ronda 10): historial de recetas por páginas, sobre TODAS las de la clínica (la carga inicial trae solo las 500 más
   * recientes). Busca por paciente (nombre, expediente), persona no registrada (nombre, teléfono) y fechas, sin tildes.
   */
  app.get('/api/prescriptions', auth, need('rx.view'), async (req, res) => {
    const cid = clinicOf(req)
    const f = parse(z.object({ q: z.string().max(120).optional(), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      mine: z.enum(['1']).optional(), page: z.coerce.number().int().min(1).max(100000).default(1), size: z.coerce.number().int().min(5).max(100).default(PAGE_SIZE) }), req.query)
    const where = ['r.clinic_id = ?']
    const args: unknown[] = [cid]
    if (f.mine) { where.push('r.doctor_id = ?'); args.push(userOf(req).id) }
    // Fechas del día local (Honduras, UTC−6): issued_at se guarda en UTC
    const range = dayRange(f.from, f.to)
    if (range.since) { where.push('r.issued_at >= ?'); args.push(range.since) }
    if (range.before) { where.push('r.issued_at < ?'); args.push(range.before) }
    const fold = (x: string) => `translate(lower(${x}), 'áéíóúüñ', 'aeiouun')`
    const q = f.q?.trim() ? normalize(f.q) : ''
    if (q) {
      where.push(`(${fold(`COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '') || ' ' || COALESCE(p.record, '')`)} LIKE ? OR ${fold(`COALESCE(r.guest, '')`)} LIKE ?)`)
      args.push(`%${q}%`, `%${q}%`)
    }
    const from = `FROM prescriptions r LEFT JOIN patients p ON p.id = r.patient_id WHERE ${where.join(' AND ')}`
    const total = Number((await sql.one<{ n: number }>(`SELECT COUNT(*)::int AS n ${from}`, args))?.n ?? 0)
    const rows = await sql.query(`SELECT r.* ${from} ORDER BY r.issued_at DESC, r.id DESC LIMIT ? OFFSET ?`, [...args, f.size, (f.page - 1) * f.size])
    res.json({ rows: rows.map(toPrescription), total, page: f.page, size: f.size })
  })

  app.get('/api/prescriptions/:id', auth, need('rx.view'), async (req, res) => {
    const cid = clinicOf(req)
    const row = (await sql.one('SELECT * FROM prescriptions WHERE id = ? AND clinic_id = ?', [String(req.params.id), cid])) ?? fail(404, 'La receta no existe.')
    const rx = toPrescription(row!)
    const cons = await sql.one('SELECT * FROM consultations WHERE id = ? AND clinic_id = ?', [rx.consultationId, cid])
    const hosp = rx.hospitalizationId ? await sql.one('SELECT * FROM hospitalizations WHERE id = ? AND clinic_id = ?', [rx.hospitalizationId, cid]) : undefined
    const patient = rx.patientId ? toPatient((await patientRow(cid, rx.patientId))!, true) : null
    await audit(userOf(req), `Abrió la receta ${rx.folio}`)
    // ME15 (ronda 15): lo que la consulta indicó y esta receta no trae (las de antes no llevaban los «Aplicar en la clínica») y
    // la receta completa que ya se generó después, si la hay
    const full = cons && !rx.hospitalizationId && !cons.admit_kind ? await fullRxState(cid, cons) : undefined
    res.json({ prescription: { ...rx, printedAt: await printedAt(sql, 'prescription', rx.id) }, consultation: cons ? toConsultation(cons) : null, hospitalization: hosp ? toHospitalization(hosp) : null, patient,
      missingFromConsult: full?.latest?.id === rx.id ? full.missing : [],
      completeRx: full?.latest && full.latest.id !== rx.id && !full.missing.length ? { id: String(full.latest.id), folio: String(full.latest.folio) } : undefined })
  })

  /**
   * ME15 (ronda 15): estado de la receta de una consulta externa: los medicamentos de la consulta que no trae ninguna receta
   * vigente de esa consulta y la receta más reciente. Una consulta sin la lista de medicamentos guardada (anterior a la v22)
   * no se puede completar.
   */
  async function fullRxState(cid: string, cons: Row) {
    if (!cons.meds) return { missing: [] as PrescriptionItem[], latest: undefined as Row | undefined }
    const meds = JSON.parse(String(cons.meds)) as PrescriptionItem[]
    const issued = await sql.query(`SELECT id, folio, items FROM prescriptions WHERE clinic_id = ? AND consultation_id = ? AND hospitalization_id IS NULL AND voided_at IS NULL ORDER BY issued_at DESC`, [cid, String(cons.id)])
    const has = (rx: Row, it: PrescriptionItem) => (JSON.parse(String(rx.items)) as PrescriptionItem[]).some((x) => normalize(x.drug) === normalize(it.drug) && x.dose === it.dose)
    const latest = issued[0]
    return { missing: latest ? meds.filter((it) => !has(latest, it)) : meds, latest }
  }

  // ME15 (ronda 15): «Receta» de una consulta vieja: una receta nueva con todos sus medicamentos (la emitida no cambia)
  app.post('/api/consultations/:id/full-rx', auth, need('rx.write'), async (req, res) => {
    const user = userOf(req)
    const cid = clinicOf(req)
    const cons = (await sql.one('SELECT * FROM consultations WHERE id = ? AND clinic_id = ?', [String(req.params.id), cid])) ?? fail(404, 'La consulta no existe.')
    if (cons!.admit_kind) fail(409, 'Esta consulta ingresó al paciente: la receta se genera desde su estancia («Receta» en la tarjeta de la nota).')
    if (!cons!.meds) fail(409, 'Esta consulta no guardó la lista de sus medicamentos: emite una receta sin consulta.')
    const { missing } = await fullRxState(cid, cons!)
    if (!missing.length) fail(409, 'La receta de esta consulta ya trae todos sus medicamentos.')
    const items = consultRxItems(JSON.parse(String(cons!.meds)) as PrescriptionItem[])
    const patientId = String(cons!.patient_id)
    await assertRxIdentity(cid, patientId)
    const who = await patientName(patientId)
    const id = randomUUID()
    const now = new Date()
    let folio = ''
    await sql.tx(async (q) => {
      folio = await nextFolio(q, cid, now)
      const marks = await currentMarks(q, user.id)
      await q.run(`INSERT INTO prescriptions (id,folio,patient_id,doctor_id,consultation_id,issued_at,items,clinic_id,validity_days,signature_id,stamp_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [id, folio, patientId, user.id, String(cons!.id), now.toISOString(), JSON.stringify(items), cid, await rxValidityOf(q, user.id, undefined), marks.signatureId, marks.stampId])
      await audit(user, `Generó la receta completa ${folio} de la consulta del ${dmy(String(cons!.date))} de ${who} (con ${missing.map((m) => m.drug).join(', ')})`, q, patientId)
    })
    res.status(201).json({ prescriptionId: id, folio })
  })
}
