import type { Express } from 'express'
import { z } from 'zod'
import { completePendingPatient, createPatient } from '../db.js'
import { type Ctx, fail, localDate, parse, type Row } from '../http.js'
import { toConsultation, toHospitalization, toPatient, toPrescription, toVitals } from '../mappers.js'
import { addendaFor } from './notes.js'
import { refreshPendingAuthorizationsForPatient } from '../authorizations.js'
import { applicationsOf } from './applications.js'
import { can } from '../../src/lib/permissions.js'
import { normalizeDni } from '../../src/lib/format.js'

/** Tipo de estancia: hospitalización u observación. */
const STAY_KIND = 'kind'

/** Nombre de cada dato del paciente en la bitácora. */
const PATIENT_FIELD: Record<string, string> = {
  firstName: 'nombres', lastName: 'apellidos', birthDate: 'fecha de nacimiento', sex: 'sexo', phone: 'teléfono', email: 'correo', insurance: 'aseguradora',
  bloodType: 'tipo de sangre', allergies: 'alergias', conditions: 'enfermedades crónicas', background: 'antecedentes', dni: 'identidad', civilStatus: 'estado civil',
  occupation: 'ocupación', education: 'escolaridad', religion: 'religión', address: 'procedencia y dirección', emergencyName: 'contacto de emergencia',
  emergencyPhone: 'teléfono de emergencia', emergencyRelation: 'parentesco de emergencia', guardianName: 'responsable', guardianDni: 'identidad del responsable',
  guardianRelation: 'parentesco del responsable',
}

/** Pacientes: alta, edición, búsqueda y ficha. */
export function registerPatients(app: Express, ctx: Ctx) {
  const { sql, auth, need, userOf, clinicOf, audit, patientName, patientRow } = ctx
  // ---------- Pacientes ----------
  const patientBody = z.object({
    firstName: z.string().trim().min(1, 'Escribe los nombres.'),
    lastName: z.string().trim().min(1, 'Escribe los apellidos.'),
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha de nacimiento no es válida.'),
    sex: z.enum(['F', 'M']),
    phone: z.string().trim().min(7, 'El teléfono debe tener al menos 7 dígitos.'),
    email: z.string().trim().email('El correo no es válido.').optional().or(z.literal('').transform(() => undefined)),
    bloodType: z.string().optional(),
    insurance: z.string().trim().optional(),
    allergies: z.array(z.string().trim().min(1)).default([]),
    conditions: z.array(z.string().trim().min(1)).default([]),
    dni: z.string().trim().max(30).optional().transform(normalizeDni),
    civilStatus: z.string().trim().max(40).optional(),
    occupation: z.string().trim().max(80).optional(),
    education: z.string().trim().max(80).optional(),
    religion: z.string().trim().max(60).optional(),
    address: z.string().trim().max(200).optional(),
    emergencyName: z.string().trim().max(100).optional(),
    emergencyPhone: z.string().trim().max(30).optional(),
    emergencyRelation: z.string().trim().max(40).optional(),
    guardianName: z.string().trim().max(100).optional(),
    guardianDni: z.string().trim().max(30).optional().transform(normalizeDni),
    guardianRelation: z.string().trim().max(40).optional(),
    background: z.record(z.string(), z.string().max(2000)).optional(),
  })

  app.post('/api/patients', auth, need('patients.manage'), async (req, res) => {
    const p = parse(patientBody, req.body)
    const cid = clinicOf(req)
    const id = await sql.tx((q) => createPatient(q, cid, p))
    const record = String((await patientRow(cid, id))!.record)
    await audit(userOf(req), `Registró al paciente ${p.firstName} ${p.lastName} (${record})`)
    res.status(201).json({ id, record })
  })

  /**
   * Paciente nuevo que llega: se completa su registro con los datos de siempre y recibe su número de
   * expediente. Si resulta que ya tenía expediente, sus citas pasan a ese y el pendiente queda unido a él.
   */
  app.post('/api/patients/:id/complete', auth, need('patients.manage'), async (req, res) => {
    const cid = clinicOf(req)
    const user = userOf(req)
    const row = (await patientRow(cid, String(req.params.id))) ?? fail(404, 'El paciente no existe.')
    if (!row!.pending) fail(409, 'Este paciente ya tiene su registro completo.')
    const id = String(row!.id)
    const { mergeInto } = parse(z.object({ mergeInto: z.string().optional() }), { mergeInto: req.body?.mergeInto })
    if (mergeInto) {
      const target = await patientRow(cid, mergeInto)
      if (!target || target.pending || target.id === id) fail(400, 'Elige un expediente registrado.')
      await sql.tx(async (q) => {
        await q.run('UPDATE appointments SET patient_id = ? WHERE patient_id = ? AND clinic_id = ?', [mergeInto, id, cid])
        await q.run('UPDATE patients SET merged_into = ? WHERE id = ?', [mergeInto, id])
        await audit(user, `Unió la cita de ${row!.first_name} ${row!.last_name} (pendiente de registro) al expediente ${target!.record} de ${target!.first_name} ${target!.last_name}`, q)
      })
      return res.json({ id: mergeInto, record: String(target!.record) })
    }
    const p = parse(patientBody, req.body)
    const cols = ['first_name', 'last_name', 'birth_date', 'sex', 'phone', 'email', 'blood_type', 'allergies', 'conditions', 'insurance', 'dni', 'civil_status', 'occupation',
      'education', 'religion', 'address', 'emergency_name', 'emergency_phone', 'emergency_relation', 'guardian_name', 'guardian_dni', 'guardian_relation']
    const vals = [p.firstName, p.lastName, p.birthDate, p.sex, p.phone, p.email || null, p.bloodType || null, JSON.stringify(p.allergies), JSON.stringify(p.conditions),
      p.insurance || null, p.dni || null, p.civilStatus || null, p.occupation || null, p.education || null, p.religion || null, p.address || null,
      p.emergencyName || null, p.emergencyPhone || null, p.emergencyRelation || null, p.guardianName || null, p.guardianDni || null, p.guardianRelation || null]
    await sql.tx(async (q) => {
      await q.run(`UPDATE patients SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ? AND clinic_id = ?`, [...vals, id, cid])
      await completePendingPatient(q, cid, id)
    })
    const done = (await patientRow(cid, id))!
    await audit(user, `Completó el registro de ${p.firstName} ${p.lastName} (${done.record})`)
    res.json({ id, record: String(done.record) })
  })

  app.patch('/api/patients/:id', auth, need('patients.manage', 'chart.view'), async (req, res) => {
    const user = userOf(req)
    const cid = clinicOf(req)
    const row = (await patientRow(cid, String(req.params.id))) ?? fail(404, 'El paciente no existe.')
    const body = parse(patientBody.partial(), req.body)
    const demographic = ['firstName', 'lastName', 'birthDate', 'sex', 'phone', 'email', 'insurance', 'dni', 'civilStatus', 'occupation', 'education',
      'religion', 'address', 'emergencyName', 'emergencyPhone', 'emergencyRelation', 'guardianName', 'guardianDni', 'guardianRelation'] as const
    const clinicalKeys = ['allergies', 'conditions', 'bloodType', 'background'] as const
    if (demographic.some((k) => k in req.body) && !can(user, 'patients.manage')) fail(403, 'Tu rol no puede editar los datos generales del paciente.')
    if (clinicalKeys.some((k) => k in req.body) && !can(user, 'chart.view')) fail(403, 'Tu rol no puede editar datos clínicos.')
    const cols: Record<string, string> = { firstName: 'first_name', lastName: 'last_name', birthDate: 'birth_date', sex: 'sex', phone: 'phone', email: 'email', insurance: 'insurance',
      bloodType: 'blood_type', allergies: 'allergies', conditions: 'conditions', background: 'background', dni: 'dni', civilStatus: 'civil_status', occupation: 'occupation',
      education: 'education', religion: 'religion', address: 'address', emergencyName: 'emergency_name', emergencyPhone: 'emergency_phone', emergencyRelation: 'emergency_relation',
      guardianName: 'guardian_name', guardianDni: 'guardian_dni', guardianRelation: 'guardian_relation' }
    const sets: string[] = []
    const vals: (string | null)[] = []
    // Bitácora campo por campo: valor anterior y valor nuevo (los datos clínicos en JSON sólo se nombran)
    const changes: string[] = []
    for (const [k, col] of Object.entries(cols)) {
      if (!(k in req.body)) continue
      const v = body[k as keyof typeof body]
      const next = typeof v === 'object' && v !== null ? JSON.stringify(v) : v == null || v === '' ? null : String(v)
      sets.push(`${col} = ?`)
      vals.push(next)
      const prev = row![col] == null ? null : String(row![col])
      if (prev !== next) changes.push(['allergies', 'conditions', 'background'].includes(k) ? PATIENT_FIELD[k] : `${PATIENT_FIELD[k] ?? k}: ${prev ? `"${prev}"` : 'vacío'} → ${next ? `"${next}"` : 'vacío'}`)
    }
    if (sets.length) {
      await sql.tx(async (q) => {
        await q.run(`UPDATE patients SET ${sets.join(', ')} WHERE id = ? AND clinic_id = ?`, [...vals, String(row!.id), cid])
        await refreshPendingAuthorizationsForPatient(q, String(row!.id))
      })
    }
    await audit(user, changes.length ? `Actualizó la ficha de ${row!.first_name} ${row!.last_name}: ${changes.join('; ')}` : `Revisó la ficha de ${row!.first_name} ${row!.last_name} sin cambios`)
    res.json(toPatient((await patientRow(cid, String(row!.id)))!, can(user, 'chart.view')))
  })

  /**
   * Índice de la biblioteca de pacientes para los filtros: última consulta y su médico, próxima cita,
   * seguimientos activos y estado. Se calcula sobre todo el historial, no sólo los 90 días que carga la app.
   */
  app.get('/api/patients/index', auth, need('patients.view'), async (req, res) => {
    const cid = clinicOf(req)
    const now = new Date()
    const nowLocal = `${localDate(now)}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const [last, next, follow, stays] = await Promise.all([
      sql.query(`SELECT DISTINCT ON (patient_id) patient_id, date, doctor_id FROM consultations WHERE clinic_id = ? ORDER BY patient_id, date DESC`, [cid]),
      sql.query(`SELECT DISTINCT ON (patient_id) patient_id, start, doctor_id FROM appointments
        WHERE clinic_id = ? AND status IN ('scheduled','confirmed') AND start >= ? ORDER BY patient_id, start`, [cid, nowLocal]),
      sql.query(`SELECT patient_id, kind, title, reminder_type FROM followups WHERE clinic_id = ? AND active`, [cid]),
      sql.query(`SELECT patient_id, ${STAY_KIND} AS kind FROM hospitalizations WHERE clinic_id = ? AND status = 'active'`, [cid]),
    ])
    const by = <T,>(rows: Row[], f: (r: Row) => T) => new Map(rows.map((r) => [String(r.patient_id), f(r)]))
    const lastBy = by(last, (r) => ({ at: String(r.date), doctorId: String(r.doctor_id) }))
    const nextBy = by(next, (r) => ({ at: String(r.start), doctorId: String(r.doctor_id) }))
    const stayBy = by(stays, (r) => (r.kind === 'observation' ? 'observation' : 'hospital'))
    const followBy = new Map<string, { kind: string; title: string; reminderType?: string }[]>()
    for (const f of follow) followBy.set(String(f.patient_id), [...(followBy.get(String(f.patient_id)) ?? []), { kind: String(f.kind), title: String(f.title), reminderType: f.reminder_type ? String(f.reminder_type) : undefined }])
    const ids = new Set([...lastBy.keys(), ...nextBy.keys(), ...stayBy.keys(), ...followBy.keys()])
    res.json([...ids].map((id) => ({
      patientId: id, lastConsultAt: lastBy.get(id)?.at, lastDoctorId: lastBy.get(id)?.doctorId, nextApptAt: nextBy.get(id)?.at, nextDoctorId: nextBy.get(id)?.doctorId,
      followups: followBy.get(id) ?? [], status: stayBy.get(id) ?? 'active',
    })))
  })

  app.get('/api/patients/:id/chart', auth, need('chart.view'), async (req, res) => {
    const id = String(req.params.id)
    const cid = clinicOf(req)
    ;(await patientRow(cid, id)) ?? fail(404, 'El paciente no existe.')
    const [vitals, consultations, prescriptions, hospitalizations] = await Promise.all([
      sql.query('SELECT * FROM vitals WHERE patient_id = ? AND clinic_id = ? AND voided_at IS NULL ORDER BY taken_at DESC', [id, cid]),
      sql.query('SELECT * FROM consultations WHERE patient_id = ? AND clinic_id = ? ORDER BY date DESC', [id, cid]),
      sql.query('SELECT * FROM prescriptions WHERE patient_id = ? AND clinic_id = ? ORDER BY issued_at DESC', [id, cid]),
      sql.query('SELECT * FROM hospitalizations WHERE patient_id = ? AND clinic_id = ? ORDER BY admitted_at DESC', [id, cid]),
    ])
    await audit(userOf(req), `Consultó el expediente de ${await patientName(id)}`)
    res.json({ vitals: vitals.map(toVitals), consultations: consultations.map(toConsultation), prescriptions: prescriptions.map(toPrescription),
      hospitalizations: hospitalizations.map(toHospitalization), addenda: await addendaFor(sql, cid, consultations.map((c) => String(c.id))),
      // ME13 (ronda 14): lo que se aplicó en la clínica en cada consulta (quién y cuándo)
      applications: await applicationsOf(sql, cid, consultations.map((c) => String(c.id))) })
  })
}
