import type { Express } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { type Ctx, fail, parse, type Row } from '../http.js'
import { clinicSettings, toAttachment, toConsultation, toDose, toInpatientMed, toInpatientNote, toReferral, toVitals } from '../mappers.js'
import { age as ageText, dxCode, examText } from '../../src/lib/format.js'
import { medLabel } from '../../src/lib/inpatient.js'
import { splitOrders } from '../../src/lib/inpatient.js'
import type { ReferralData } from '../../src/lib/types.js'

/** "26/10 15:11" en la hora de la clínica. */
const dm = (iso: string) => new Intl.DateTimeFormat('es-HN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: process.env.TZ || 'America/Tegucigalpa' })
  .format(new Date(iso)).replace(',', '')

/**
 * Referencia del consultorio de un médico independiente: refiere al paciente en observación a un hospital u otro
 * centro. El borrador se arma sólo con lo que hay en el expediente (nada se inventa; lo que falta queda en blanco
 * para llenarlo a mano): datos del paciente y del médico, motivo, HEA, examen físico con los signos de la
 * preclínica, impresión diagnóstica y manejo (indicaciones, medicamentos aplicados con dosis y hora, evolución y
 * laboratorios). El médico lo revisa y lo emite: queda en Anexos y la observación se cierra como "Referido". No
 * se edita después; si hay un error, se anula y se emite otra.
 */
export function registerReferrals(app: Express, { sql, auth, need, userOf, clinicOf, audit, patientName }: Ctx) {
  const stayRow = async (cid: string, id: string) => (await sql.one('SELECT * FROM hospitalizations WHERE id = ? AND clinic_id = ?', [id, cid])) ?? fail(404, 'La observación no existe.')

  async function draft(cid: string, h: Row, doctorId: string): Promise<ReferralData> {
    const p = (await sql.one('SELECT * FROM patients WHERE id = ?', [String(h.patient_id)]))!
    const c = h.consultation_id ? await sql.one('SELECT * FROM consultations WHERE id = ?', [String(h.consultation_id)]) : undefined
    const consult = c ? toConsultation(c) : undefined
    const vitals = consult?.vitalsId ? await sql.one('SELECT * FROM vitals WHERE id = ?', [consult.vitalsId]) : undefined
    const v = vitals ? toVitals(vitals) : undefined
    const notes = (await sql.query(`SELECT * FROM hosp_notes WHERE hospitalization_id = ? ORDER BY at`, [String(h.id)])).map(toInpatientNote)
    const meds = (await sql.query('SELECT * FROM hosp_meds WHERE hospitalization_id = ? ORDER BY ordered_at', [String(h.id)])).map(toInpatientMed)
    const doses = (await sql.query(`SELECT d.* FROM hosp_doses d JOIN hosp_meds m ON m.id = d.med_id WHERE m.hospitalization_id = ? AND d.status = 'given' ORDER BY d.given_at`, [String(h.id)])).map(toDose)
    const labs = (await sql.query(`SELECT id, patient_id, name, mime, size, category, uploaded_by, uploaded_at, title, taken_at, hospitalization_id FROM attachments
      WHERE hospitalization_id = ? AND category = 'lab' ORDER BY COALESCE(taken_at, uploaded_at)`, [String(h.id)])).map(toAttachment)
    const doc = (await sql.one('SELECT name, license, specialty FROM staff WHERE id = ?', [doctorId]))!
    const cfg = clinicSettings((await sql.one('SELECT * FROM clinics WHERE id = ?', [cid]))!)
    const evolution = notes.filter((n) => n.kind === 'evolution')
    const last = evolution.at(-1)
    const vitalsLine = v ? [v.systolic != null && v.diastolic != null && `PA ${v.systolic}/${v.diastolic} mmHg`, v.heartRate != null && `FC ${v.heartRate} lpm`,
      v.respRate != null && `FR ${v.respRate} rpm`, v.temperature != null && `T ${v.temperature.toFixed(1)} °C`, v.spo2 != null && `SpO₂ ${v.spo2}%`,
      v.weightKg != null && `Peso ${v.weightKg} kg`, v.glucose != null && `Glucometría ${v.glucose} mg/dL`].filter(Boolean).join(', ') : ''
    const lastExam = last ? (last.format === 'dx' ? examText(last.exam) : last.objective) : ''
    const diagnoses = (last?.format === 'dx' && last.diagnoses?.length ? last.diagnoses : consult?.diagnoses ?? JSON.parse(String(h.diagnoses ?? '[]')) as { code: string; label: string }[])
    const indications = [...(consult?.indications ?? []), ...evolution.flatMap((n) => splitOrders(n, { meds }).indications.map((o) => o.text))]
    return {
      patient: { name: `${p.first_name} ${p.last_name}`, dni: p.dni ? String(p.dni) : undefined, age: ageText(String(p.birth_date ?? '')), sex: (p.sex ?? undefined) as 'F' | 'M' | undefined,
        record: cfg.recordUsesDni && p.dni ? String(p.dni) : String(p.record) },
      doctor: { name: String(doc.name), license: doc.license ? String(doc.license) : undefined, specialty: doc.specialty ? String(doc.specialty) : undefined },
      place: { name: cfg.name, address: cfg.address, phone: cfg.phone, logo: cfg.logo, office: cfg.kind === 'office' || undefined },
      admittedAt: String(h.admitted_at),
      reason: diagnoses.map((d) => d.label).join('; '),
      history: consult?.history ?? '',
      exam: [vitalsLine && `Signos de la preclínica: ${vitalsLine}.`, examText(consult?.exam), lastExam && `Última evaluación (${dm(last!.at)}): ${lastExam}`].filter(Boolean).join('\n'),
      diagnosis: diagnoses.map((d) => `${d.label} (${dxCode(d)})`).join('; '),
      indications: indications.join('\n'),
      medications: doses.map((d) => { const m = meds.find((x) => x.id === d.medId); return m ? `${medLabel(m)} — aplicado ${dm(d.givenAt)}` : '' }).filter(Boolean).join('\n'),
      evolution: evolution.map((n) => `${dm(n.at)}: ${n.format === 'dx' ? [n.observations, examText(n.exam)].filter(Boolean).join(' ') : [n.assessment, n.plan].filter(Boolean).join(' ')}`).join('\n'),
      labs: labs.map((l) => `${l.title ?? l.name} (${dm(l.takenAt ?? l.uploadedAt)})`).join('\n'),
      condition: '', destination: '',
    }
  }

  app.get('/api/inpatient/:id/referral-draft', auth, need('inpatient.orders'), async (req, res) => {
    const cid = clinicOf(req)
    const h = (await stayRow(cid, String(req.params.id)))!
    if (h.kind !== 'observation') fail(409, 'La referencia es para pacientes en observación.')
    res.json(await draft(cid, h, userOf(req).id))
  })

  const text = (max: number) => z.string().trim().max(max).default('')
  app.post('/api/inpatient/:id/referral', auth, need('inpatient.orders'), async (req, res) => {
    const b = parse(z.object({
      reason: text(1000), history: text(6000), exam: text(6000), diagnosis: text(1000), indications: text(4000), medications: text(4000),
      evolution: text(6000), labs: text(2000), condition: text(300), destination: text(200),
    }), req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    const h = (await stayRow(cid, String(req.params.id)))!
    if (h.kind !== 'observation') fail(409, 'La referencia es para pacientes en observación.')
    // Se emite con la observación abierta, o otra vez si la anterior se anuló
    const active = await sql.one('SELECT 1 FROM referrals WHERE hospitalization_id = ? AND voided_at IS NULL', [String(h.id)])
    if (active) fail(409, 'Este paciente ya tiene una referencia emitida. Si hay un error, anúlala y emite otra.')
    if (h.status !== 'active' && h.outcome !== 'referred') fail(409, 'La observación ya se cerró con el egreso.')
    const base = await draft(cid, h, user.id)
    const data: ReferralData = { ...base, ...b }
    const id = randomUUID()
    const now = new Date()
    let number = ''
    const name = await patientName(String(h.patient_id))
    await sql.tx(async (q) => {
      await q.run('SELECT pg_advisory_xact_lock(hashtext(?))', [`ref:${cid}`])
      const lastNo = await q.one<{ n: number | null }>(`SELECT MAX(CAST(split_part(number, '-', 3) AS INTEGER))::int AS n FROM referrals WHERE clinic_id = ? AND number LIKE ?`, [cid, `REF-${now.getFullYear()}-%`])
      number = `REF-${now.getFullYear()}-${String((lastNo?.n ?? 0) + 1).padStart(4, '0')}`
      await q.run(`INSERT INTO referrals (id, clinic_id, hospitalization_id, patient_id, number, data, destination, issued_by, issued_at) VALUES (?,?,?,?,?,?,?,?,?)`,
        [id, cid, String(h.id), String(h.patient_id), number, JSON.stringify(data), b.destination || null, user.id, now.toISOString()])
      if (h.status === 'active') {
        // La observación se cierra como "Referido": sale de la lista y sus órdenes dejan de generar dosis
        await q.run(`UPDATE hospitalizations SET status = 'discharged', discharged_at = ?, discharged_by = ?, outcome = 'referred', outcome_note = ? WHERE id = ?`,
          [now.toISOString(), user.id, b.destination || null, String(h.id)])
        await q.run(`UPDATE hosp_meds SET stopped_at = ?, stopped_by = ?, stop_reason = 'Referido' WHERE hospitalization_id = ? AND stopped_at IS NULL`, [now.toISOString(), user.id, String(h.id)])
      }
      await audit(user, `Emitió la referencia ${number} de ${name}${b.destination ? ` a ${b.destination}` : ''}`, q)
    })
    res.status(201).json(toReferral((await sql.one('SELECT * FROM referrals WHERE id = ?', [id]))!))
  })

  app.get('/api/referrals/:rid', auth, need('inpatient.view'), async (req, res) => {
    const row = (await sql.one('SELECT * FROM referrals WHERE id = ? AND clinic_id = ?', [String(req.params.rid), clinicOf(req)])) ?? fail(404, 'La referencia no existe.')
    await audit(userOf(req), `Abrió la referencia ${row!.number}`)
    res.json(toReferral(row!))
  })

  app.post('/api/referrals/:rid/void', auth, need('inpatient.orders'), async (req, res) => {
    const { reason } = parse(z.object({ reason: z.string().trim().min(5, 'Escribe por qué se anula.').max(300) }), req.body)
    const user = userOf(req)
    const row = (await sql.one('SELECT * FROM referrals WHERE id = ? AND clinic_id = ?', [String(req.params.rid), clinicOf(req)])) ?? fail(404, 'La referencia no existe.')
    if (row!.voided_at) fail(409, 'Esta referencia ya estaba anulada.')
    await sql.run('UPDATE referrals SET voided_at = ?, voided_by = ?, void_reason = ? WHERE id = ?', [new Date().toISOString(), user.id, reason, String(row!.id)])
    await audit(user, `Anuló la referencia ${row!.number}: ${reason}`)
    res.json(toReferral((await sql.one('SELECT * FROM referrals WHERE id = ?', [String(row!.id)]))!))
  })
}
