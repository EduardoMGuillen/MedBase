import type { Express } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { type Ctx, fail, parse, type Row } from '../http.js'
import { clinicSettings, toAttachment, toConsultation, toDose, toHospitalization, toInpatientMed, toInpatientNote, toReferral, toVitals } from '../mappers.js'
import { age as ageText, contactLine, dxCode, examText, medicationLine } from '../../src/lib/format.js'
import { currentDiagnoses, medLabel, splitOrders } from '../../src/lib/inpatient.js'
import { examLine, STATUS_LABEL } from '../../src/lib/exams.js'
import type { PrescriptionItem, ReferralData } from '../../src/lib/types.js'
import { examsWhere } from './exams.js'
import { addendaFor } from './notes.js'
import type { Sql } from '../sql.js'

/** "26/10 15:11" en la hora de la clínica. */
const dm = (iso: string) => new Intl.DateTimeFormat('es-HN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: process.env.TZ || 'America/Tegucigalpa' })
  .format(new Date(iso)).replace(',', '')

/** Datos del paciente en la hoja: nombre, identidad, edad, sexo, expediente y alergias (RF1). */
function patientOf(p: Row, cfg: ReturnType<typeof clinicSettings>): ReferralData['patient'] {
  let allergies: string[] = []
  try { allergies = JSON.parse(String(p.allergies ?? '[]')) } catch { /* sin alergias */ }
  return { name: `${p.first_name} ${p.last_name}`, dni: p.dni ? String(p.dni) : undefined, age: ageText(String(p.birth_date ?? '')), sex: (p.sex ?? undefined) as 'F' | 'M' | undefined,
    record: cfg.recordUsesDni && p.dni ? String(p.dni) : String(p.record), allergies }
}

/** El borrador de la referencia, armado sólo con lo que hay en el expediente (también lo usan los casos de la demo). */
export async function referralDraft(q: Sql, cid: string, h: Row, doctorId: string): Promise<ReferralData> {
  const p = (await q.one('SELECT * FROM patients WHERE id = ?', [String(h.patient_id)]))!
  const c = h.consultation_id ? await q.one('SELECT * FROM consultations WHERE id = ?', [String(h.consultation_id)]) : undefined
  const consult = c ? toConsultation(c) : undefined
  const vitals = consult?.vitalsId ? await q.one('SELECT * FROM vitals WHERE id = ?', [consult.vitalsId]) : undefined
  const v = vitals ? toVitals(vitals) : undefined
  const notes = (await q.query(`SELECT * FROM hosp_notes WHERE hospitalization_id = ? ORDER BY at`, [String(h.id)])).map(toInpatientNote)
  const meds = (await q.query('SELECT * FROM hosp_meds WHERE hospitalization_id = ? ORDER BY ordered_at', [String(h.id)])).map(toInpatientMed)
  const doses = (await q.query(`SELECT d.* FROM hosp_doses d JOIN hosp_meds m ON m.id = d.med_id WHERE m.hospitalization_id = ? AND d.status = 'given' ORDER BY d.given_at`, [String(h.id)])).map(toDose)
  const labs = (await q.query(`SELECT id, patient_id, name, mime, size, category, uploaded_by, uploaded_at, title, taken_at, hospitalization_id FROM attachments
    WHERE hospitalization_id = ? AND category = 'lab' ORDER BY COALESCE(taken_at, uploaded_at)`, [String(h.id)])).map(toAttachment)
  const doc = (await q.one('SELECT name, license, specialty FROM staff WHERE id = ?', [doctorId]))!
  const cfg = clinicSettings((await q.one('SELECT * FROM clinics WHERE id = ?', [cid]))!)
  const evolution = notes.filter((n) => n.kind === 'evolution')
  const last = evolution.at(-1)
  const vitalsLine = v ? [v.systolic != null && v.diastolic != null && `PA ${v.systolic}/${v.diastolic} mmHg`, v.heartRate != null && `FC ${v.heartRate} lpm`,
    v.respRate != null && `FR ${v.respRate} rpm`, v.temperature != null && `T ${v.temperature.toFixed(1)} °C`, v.spo2 != null && `SpO₂ ${v.spo2}%`,
    v.weightKg != null && `Peso ${v.weightKg} kg`, v.glucose != null && `Glucometría ${v.glucose} mg/dL`].filter(Boolean).join(', ') : ''
  const lastExam = last ? (last.format === 'dx' ? examText(last.exam) : last.objective) : ''
  const diagnoses = (last?.format === 'dx' && last.diagnoses?.length ? last.diagnoses : consult?.diagnoses ?? JSON.parse(String(h.diagnoses ?? '[]')) as { code: string; label: string }[])
  const indications = [...(consult?.indications ?? []), ...evolution.flatMap((n) => splitOrders(n, { meds }).indications.map((o) => o.text))]
  return {
    patient: patientOf(p, cfg),
    doctor: { name: String(doc.doc_name || doc.name), license: doc.license ? String(doc.license) : undefined, specialty: doc.specialty ? String(doc.specialty) : undefined },
    place: { name: cfg.name, address: cfg.address, phone: contactLine(cfg), logo: cfg.logo, office: cfg.kind === 'office' || undefined },
    admittedAt: String(h.admitted_at),
    reason: diagnoses.map((d) => d.label).join('; '),
    history: consult?.history ?? '',
    exam: [vitalsLine && `Signos de la preclínica: ${vitalsLine}.`, examText(consult?.exam), lastExam && `Última evaluación (${dm(last!.at)}): ${lastExam}`].filter(Boolean).join('\n'),
    diagnosis: diagnoses.map((d) => `${d.label} (${dxCode(d)})`).join('; '),
    indications: indications.join('\n'),
    medications: doses.map((d) => { const m = meds.find((x) => x.id === d.medId); return m ? `${medLabel(m)} — aplicado ${dm(d.givenAt)}` : '' }).filter(Boolean).join('\n'),
    evolution: evolution.map((n) => `${dm(n.at)}: ${n.format === 'dx' ? [n.evolution, n.observations, examText(n.exam)].filter(Boolean).join(' ') : [n.assessment, n.plan].filter(Boolean).join(' ')}`).join('\n'),
    labs: labs.map((l) => `${l.title ?? l.name} (${dm(l.takenAt ?? l.uploadedAt)})`).join('\n'),
    condition: '', destination: '',
  }
}

/** Las líneas de los signos de una toma: «PA 120/80 mmHg, FC 88 lpm…». */
function vitalsText(v?: ReturnType<typeof toVitals>) {
  if (!v) return ''
  return [v.systolic != null && v.diastolic != null && `PA ${v.systolic}/${v.diastolic} mmHg`, v.heartRate != null && `FC ${v.heartRate} lpm`,
    v.respRate != null && `FR ${v.respRate} rpm`, v.temperature != null && `T ${v.temperature.toFixed(1)} °C`, v.spo2 != null && `SpO₂ ${v.spo2}%`,
    v.weightKg != null && `Peso ${v.weightKg} kg`, v.glucose != null && `Glucometría ${v.glucose} mg/dL`].filter(Boolean).join(', ')
}

const dxLine = (list: { code: string; label: string; system?: 'icd11' }[]) => list.map((d) => `${d.label} (${dxCode(d)})`).join('; ')

/** Los exámenes de la estancia o de la consulta con su estado o su resultado resumido. */
async function examLines(q: Sql, cid: string, where: string, args: unknown[]) {
  const list = (await examsWhere(q, `clinic_id = ? AND ${where} AND status <> 'cancelled'`, [cid, ...args])).sort((a, b) => a.orderedAt.localeCompare(b.orderedAt))
  return list.map((e) => {
    const vals = e.result?.values?.map((v) => `${v.analyte} ${v.value}${v.unit ? ` ${v.unit}` : ''}${v.flag ? (v.flag === 'high' ? ' (alto)' : ' (bajo)') : ''}`).join(', ')
    const res = vals || e.result?.report || (e.result?.fileIds?.length ? 'resultado adjunto' : '')
    return `${examLine(e)} (${dm(e.orderedAt)})${res ? `: ${res}` : ` — ${STATUS_LABEL[e.group][e.status].toLowerCase()}`}`
  })
}

/**
 * Ronda 8: borrador de la referencia de una estancia (observación u hospitalización), con lo que pide el Sistema Nacional
 * de Referencia y Respuesta: diagnóstico de ingreso y de egreso (el vigente), HEA, examen físico y signos al referir,
 * evolución, tratamiento recibido (cada medicamento con lo aplicado, y las indicaciones) y exámenes. El motivo, el destino
 * y los datos del traslado los escribe el médico. Nada se inventa: lo que falta sale con líneas para llenarlo a mano.
 */
export async function stayReferralDraft(q: Sql, cid: string, h: Row, doctorId: string): Promise<ReferralData> {
  const base = await referralDraft(q, cid, h, doctorId)
  const notes = (await q.query(`SELECT * FROM hosp_notes WHERE hospitalization_id = ? ORDER BY at`, [String(h.id)])).map(toInpatientNote)
  const meds = (await q.query('SELECT * FROM hosp_meds WHERE hospitalization_id = ? ORDER BY ordered_at', [String(h.id)])).map(toInpatientMed)
  const doses = (await q.query(`SELECT d.* FROM hosp_doses d JOIN hosp_meds m ON m.id = d.med_id WHERE m.hospitalization_id = ? AND d.status = 'given' ORDER BY d.given_at`, [String(h.id)])).map(toDose)
  const lastVitals = await q.one('SELECT * FROM vitals WHERE hospitalization_id = ? ORDER BY taken_at DESC LIMIT 1', [String(h.id)])
  const admission = JSON.parse(String(h.diagnoses ?? '[]')) as { code: string; label: string; system?: 'icd11' }[]
  const current = currentDiagnoses({ notes, hospitalization: toHospitalization(h) })
  const treatment = [
    ...meds.map((m) => {
      const given = doses.filter((d) => d.medId === m.id)
      const span = `desde ${dm(m.firstAt)}${m.stoppedAt ? ` hasta ${dm(m.stoppedAt)}` : ''}`
      return `${medLabel(m)}, ${span}${given.length ? `; ${given.length} dosis aplicada${given.length === 1 ? '' : 's'}, la última ${dm(given.at(-1)!.givenAt)}` : '; sin dosis aplicadas'}`
    }),
    ...(base.indications ? [`Indicaciones: ${base.indications.split('\n').filter(Boolean).join('; ')}`] : []),
  ].join('\n')
  const exams = await examLines(q, cid, 'hospitalization_id = ?', [String(h.id)])
  return {
    ...base,
    source: h.kind === 'observation' ? 'observation' : 'hospital',
    reason: '',
    admissionDiagnosis: dxLine(admission),
    dischargeDiagnosis: dxLine(current),
    diagnosis: dxLine(current),
    vitals: lastVitals ? `${vitalsText(toVitals(lastVitals))} (${dm(String(lastVitals.taken_at))})` : '',
    treatment,
    labs: [...exams, ...base.labs.split('\n').filter(Boolean)].join('\n'),
    service: '', priority: 'routine', informed: false,
  }
}

/** Ronda 8: borrador de la referencia de una consulta externa (a un especialista, a otro centro o a emergencia). */
export async function consultReferralDraft(q: Sql, cid: string, row: Row, doctorId: string): Promise<ReferralData> {
  const c = toConsultation(row)
  const p = (await q.one('SELECT * FROM patients WHERE id = ?', [c.patientId]))!
  const v = c.vitalsId ? await q.one('SELECT * FROM vitals WHERE id = ?', [c.vitalsId]) : undefined
  const doc = (await q.one('SELECT name, doc_name, license, specialty FROM staff WHERE id = ?', [doctorId]))!
  const cfg = clinicSettings((await q.one('SELECT * FROM clinics WHERE id = ?', [cid]))!)
  const rx = c.prescriptionId ? await q.one('SELECT items FROM prescriptions WHERE id = ?', [c.prescriptionId]) : undefined
  const items = (row.meds ? JSON.parse(String(row.meds)) : rx ? JSON.parse(String(rx.items)) : []) as PrescriptionItem[]
  const exams = await examLines(q, cid, 'consultation_id = ?', [c.id])
  const vit = vitalsText(v ? toVitals(v) : undefined)
  return {
    patient: patientOf(p, cfg),
    doctor: { name: String(doc.doc_name || doc.name), license: doc.license ? String(doc.license) : undefined, specialty: doc.specialty ? String(doc.specialty) : undefined },
    place: { name: cfg.name, address: cfg.address, phone: contactLine(cfg), logo: cfg.logo, office: cfg.kind === 'office' || undefined },
    admittedAt: c.date,
    source: 'consultation',
    reason: '',
    history: c.history ?? '',
    exam: examText(c.exam),
    vitals: vit,
    admissionDiagnosis: dxLine(c.diagnoses),
    dischargeDiagnosis: dxLine(c.diagnoses),
    diagnosis: dxLine(c.diagnoses),
    treatment: [...items.map((it) => `${medicationLine(it)}${it.applyInClinic ? ' (aplicado en la clínica)' : ''}`), ...(c.indications?.length ? [`Indicaciones: ${c.indications.join('; ')}`] : [])].join('\n'),
    indications: '', medications: '', evolution: '',
    labs: exams.join('\n'),
    condition: '', destination: '', service: '', priority: 'routine', informed: false,
  }
}

/**
 * RF1 (ronda 8): referencia desde una consulta todavía en borrador (por su cita). La consulta no existe aún: lo clínico
 * (HEA, diagnósticos, tratamiento) lo trae el formulario desde el borrador del médico; aquí sólo paciente, médico, lugar y
 * los signos de la preclínica de hoy.
 */
export async function apptReferralDraft(q: Sql, cid: string, a: Row, doctorId: string): Promise<ReferralData> {
  const p = (await q.one('SELECT * FROM patients WHERE id = ?', [String(a.patient_id)]))!
  const v = await q.one('SELECT * FROM vitals WHERE appointment_id = ? AND voided_at IS NULL ORDER BY taken_at DESC LIMIT 1', [String(a.id)])
  const doc = (await q.one('SELECT name, doc_name, license, specialty FROM staff WHERE id = ?', [doctorId]))!
  const cfg = clinicSettings((await q.one('SELECT * FROM clinics WHERE id = ?', [cid]))!)
  return {
    patient: patientOf(p, cfg),
    doctor: { name: String(doc.doc_name || doc.name), license: doc.license ? String(doc.license) : undefined, specialty: doc.specialty ? String(doc.specialty) : undefined },
    place: { name: cfg.name, address: cfg.address, phone: contactLine(cfg), logo: cfg.logo, office: cfg.kind === 'office' || undefined },
    admittedAt: String(a.arrived_at ?? a.start), source: 'consultation', reason: '', history: '', exam: '', vitals: vitalsText(v ? toVitals(v) : undefined),
    admissionDiagnosis: '', dischargeDiagnosis: '', diagnosis: '', treatment: '', indications: '', medications: '', evolution: '', labs: '',
    condition: '', destination: '', service: '', priority: 'routine', informed: false,
  }
}

const text = (max: number) => z.string().trim().max(max).default('')
const referralBody = z.object({
  // RF1 (ronda 8): no se firma sin motivo, sin centro de destino ni sin la casilla de consentimiento
  reason: z.string().trim().min(3, 'Escribe el motivo de referencia.').max(1000),
  history: text(6000), exam: text(6000), diagnosis: text(1000), indications: text(4000), medications: text(4000),
  evolution: text(6000), labs: text(4000), condition: text(300),
  destination: z.string().trim().min(2, 'Escribe el centro o establecimiento al que se refiere.').max(200),
  service: text(160), priority: z.enum(['routine', 'urgent']).default('routine'), admissionDiagnosis: text(1000), dischargeDiagnosis: text(1000),
  treatment: text(6000), vitals: text(400),
  consent: z.literal(true, { message: 'Marca que el paciente (o su representante) fue informado y está de acuerdo.' }),
})

/** Número correlativo de la clínica por año: REF-2026-0001. */
async function nextNumber(q: Sql, cid: string, now: Date) {
  await q.run('SELECT pg_advisory_xact_lock(hashtext(?))', [`ref:${cid}`])
  const lastNo = await q.one<{ n: number | null }>(`SELECT MAX(CAST(split_part(number, '-', 3) AS INTEGER))::int AS n FROM referrals WHERE clinic_id = ? AND number LIKE ?`, [cid, `REF-${now.getFullYear()}-%`])
  return `REF-${now.getFullYear()}-${String((lastNo?.n ?? 0) + 1).padStart(4, '0')}`
}

/**
 * Referencia a otro centro. RF1 (ronda 8): sale de una observación, de una hospitalización o de la consulta externa (en
 * borrador o firmada). El borrador se arma con el expediente y se autoguarda en el formulario; el médico lo revisa y lo
 * firma. Firmada no se edita: si hay un error se anula (con motivo, quién y cuándo; conserva su número) y se emite otra.
 * Firmar una referencia no da de alta ni hace el egreso: después se ofrece «¿Registrar el egreso?». No se envía por ningún
 * canal automático: se imprime o se descarga en PDF, y cada impresión queda en la bitácora.
 */
export function registerReferrals(app: Express, { sql, auth, need, userOf, clinicOf, audit, patientName }: Ctx) {
  const stayRow = async (cid: string, id: string) => (await sql.one('SELECT * FROM hospitalizations WHERE id = ? AND clinic_id = ?', [id, cid])) ?? fail(404, 'La estancia no existe.')
  const consultRow = async (cid: string, id: string) => (await sql.one('SELECT * FROM consultations WHERE id = ? AND clinic_id = ?', [id, cid])) ?? fail(404, 'La consulta no existe.')
  const apptRow = async (cid: string, id: string) => (await sql.one('SELECT * FROM appointments WHERE id = ? AND clinic_id = ?', [id, cid])) ?? fail(404, 'La cita no existe.')
  // Sólo el médico crea, firma y anula; enfermería y administración la ven e imprimen
  const doctorOnly = (role: string) => { if (role !== 'doctor') fail(403, 'Sólo el médico emite o anula una referencia.') }

  /** Guarda la referencia firmada con su número correlativo de la clínica. */
  async function sign(o: { cid: string; user: ReturnType<typeof userOf>; patientId: string; data: ReferralData; link: { hospitalization_id?: string; consultation_id?: string; appointment_id?: string }; where: string }) {
    const id = randomUUID()
    const now = new Date()
    const name = await patientName(o.patientId)
    await sql.tx(async (q) => {
      const number = await nextNumber(q, o.cid, now)
      await q.run(`INSERT INTO referrals (id, clinic_id, hospitalization_id, consultation_id, appointment_id, patient_id, number, data, destination, issued_by, issued_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [id, o.cid, o.link.hospitalization_id ?? null, o.link.consultation_id ?? null, o.link.appointment_id ?? null, o.patientId, number, JSON.stringify({ ...o.data, consentAt: now.toISOString(), informed: true }),
          o.data.destination || null, o.user.id, now.toISOString()])
      await audit(o.user, `Firmó la referencia ${number} de ${name} desde ${o.where} a ${o.data.destination}${o.data.service ? ` (${o.data.service})` : ''}${o.data.priority === 'urgent' ? ', urgente' : ''}; el paciente fue informado y dio su consentimiento`, q)
    })
    return toReferral((await sql.one('SELECT * FROM referrals WHERE id = ?', [id]))!)
  }
  const fieldsOf = (b: z.infer<typeof referralBody>) => { const { consent: _c, ...rest } = b; void _c; return rest }

  app.get('/api/inpatient/:id/referral-draft', auth, need('inpatient.orders'), async (req, res) => {
    const cid = clinicOf(req)
    const h = (await stayRow(cid, String(req.params.id)))!
    res.json(await stayReferralDraft(sql, cid, h, userOf(req).id))
  })

  app.get('/api/consultations/:id/referral-draft', auth, need('consult.write'), async (req, res) => {
    const cid = clinicOf(req)
    const c = (await consultRow(cid, String(req.params.id)))!
    res.json(await consultReferralDraft(sql, cid, c, userOf(req).id))
  })

  app.get('/api/appointments/:id/referral-draft', auth, need('consult.write'), async (req, res) => {
    const cid = clinicOf(req)
    const a = (await apptRow(cid, String(req.params.id)))!
    res.json(await apptReferralDraft(sql, cid, a, userOf(req).id))
  })

  app.post('/api/inpatient/:id/referral', auth, need('inpatient.orders'), async (req, res) => {
    const user = userOf(req)
    doctorOnly(user.role)
    const b = parse(referralBody, req.body)
    const cid = clinicOf(req)
    const h = (await stayRow(cid, String(req.params.id)))!
    if (h.status !== 'active') fail(409, 'La estancia ya se cerró con el egreso.')
    const data: ReferralData = { ...(await stayReferralDraft(sql, cid, h, user.id)), ...fieldsOf(b) }
    res.status(201).json(await sign({ cid, user, patientId: String(h.patient_id), data, link: { hospitalization_id: String(h.id) }, where: h.kind === 'observation' ? 'la observación' : 'la hospitalización' }))
  })

  app.post('/api/consultations/:id/referral', auth, need('consult.write'), async (req, res) => {
    const user = userOf(req)
    doctorOnly(user.role)
    const b = parse(referralBody, req.body)
    const cid = clinicOf(req)
    const c = (await consultRow(cid, String(req.params.id)))!
    const data: ReferralData = { ...(await consultReferralDraft(sql, cid, c, user.id)), ...fieldsOf(b) }
    res.status(201).json(await sign({ cid, user, patientId: String(c.patient_id), data, link: { consultation_id: String(c.id), appointment_id: c.appointment_id ? String(c.appointment_id) : undefined }, where: 'la consulta externa' }))
  })

  // RF1: desde una consulta en borrador (la nota todavía no se firma)
  app.post('/api/appointments/:id/referral', auth, need('consult.write'), async (req, res) => {
    const user = userOf(req)
    doctorOnly(user.role)
    const b = parse(referralBody, req.body)
    const cid = clinicOf(req)
    const a = (await apptRow(cid, String(req.params.id)))!
    if (a!.doctor_id !== user.id) fail(403, 'Sólo el médico que atiende la consulta emite la referencia.')
    const signed = await sql.one('SELECT id FROM consultations WHERE appointment_id = ?', [String(a!.id)])
    const data: ReferralData = { ...(await apptReferralDraft(sql, cid, a!, user.id)), ...fieldsOf(b) }
    res.status(201).json(await sign({ cid, user, patientId: String(a!.patient_id), data, link: { appointment_id: String(a!.id), consultation_id: signed ? String(signed.id) : undefined }, where: 'la consulta externa' }))
  })

  app.get('/api/patients/:id/referrals', auth, need('chart.view'), async (req, res) => {
    const rows = await sql.query('SELECT * FROM referrals WHERE clinic_id = ? AND patient_id = ? ORDER BY issued_at DESC', [clinicOf(req), String(req.params.id)])
    res.json(rows.map(toReferral))
  })

  app.get('/api/referrals/:rid', auth, need('chart.view'), async (req, res) => {
    const row = (await sql.one('SELECT * FROM referrals WHERE id = ? AND clinic_id = ?', [String(req.params.rid), clinicOf(req)])) ?? fail(404, 'La referencia no existe.')
    await audit(userOf(req), `Abrió la referencia ${row!.number}`)
    // RF1: con sus adendas (la firmada no se edita)
    res.json({ ...toReferral(row!), addenda: await addendaFor(sql, clinicOf(req), [String(row!.id)]) })
  })

  // RF1: cada impresión o descarga en PDF queda en la bitácora
  app.post('/api/referrals/:rid/printed', auth, need('chart.view'), async (req, res) => {
    const { how } = parse(z.object({ how: z.enum(['print', 'pdf']) }), req.body)
    const row = (await sql.one('SELECT number, patient_id FROM referrals WHERE id = ? AND clinic_id = ?', [String(req.params.rid), clinicOf(req)])) ?? fail(404, 'La referencia no existe.')
    await audit(userOf(req), `${how === 'pdf' ? 'Descargó en PDF' : 'Imprimió'} la referencia ${row!.number} de ${await patientName(String(row!.patient_id))}`)
    res.json({ ok: true })
  })

  app.post('/api/referrals/:rid/void', auth, need('inpatient.orders', 'consult.write'), async (req, res) => {
    const user = userOf(req)
    doctorOnly(user.role)
    const { reason } = parse(z.object({ reason: z.string().trim().min(5, 'Escribe por qué se anula.').max(300) }), req.body)
    const row = (await sql.one('SELECT * FROM referrals WHERE id = ? AND clinic_id = ?', [String(req.params.rid), clinicOf(req)])) ?? fail(404, 'La referencia no existe.')
    if (row!.voided_at) fail(409, 'Esta referencia ya estaba anulada.')
    await sql.run('UPDATE referrals SET voided_at = ?, voided_by = ?, void_reason = ? WHERE id = ?', [new Date().toISOString(), user.id, reason, String(row!.id)])
    await audit(user, `Anuló la referencia ${row!.number}: ${reason}`)
    res.json(toReferral((await sql.one('SELECT * FROM referrals WHERE id = ?', [String(row!.id)]))!))
  })
}
