import express, { type NextFunction, type Request, type Response } from 'express'
import cookieParser from 'cookie-parser'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { type DB, DEMO_PASSWORD, resetDemo, tx } from './db'
import { toAppointment, toAudit, toConsultation, toPatient, toPrescription, toStaff, toVitals } from './mappers'
import { can, ROLE_PERMISSIONS, type Permission } from '../src/lib/permissions'
import type { ApptStatus, Role, Staff } from '../src/lib/types'

export interface AppOptions {
  db: DB
  jwtSecret?: string
  demoMode?: boolean
  secureCookies?: boolean
  staticDir?: string
}

const COOKIE = 'clinara_session'
const SESSION_HOURS = 10

/** Error con código HTTP y mensaje listo para mostrar en la interfaz. */
class HttpError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}
const fail = (status: number, message: string): never => { throw new HttpError(status, message) }

type Row = Record<string, unknown>
interface AuthedRequest extends Request { user: Staff }

const COLORS = ['#2335C9', '#0F8A6E', '#B4407A', '#C27A12', '#6A4BC4', '#2C7DA0', '#5B6472']

export function createApp(opts: AppOptions) {
  const { db } = opts
  const demoMode = opts.demoMode ?? true
  const secret = opts.jwtSecret ?? persistentSecret(db)
  const app = express()

  app.disable('x-powered-by')
  app.use(express.json({ limit: '200kb' }))
  app.use(cookieParser())
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'same-origin')
    next()
  })

  const audit = (userId: string, action: string) =>
    db.prepare('INSERT INTO audit (at, user_id, action) VALUES (?, ?, ?)').run(new Date().toISOString(), userId, action)

  const staffRow = (id: string) => db.prepare('SELECT * FROM staff WHERE id = ?').get(id) as Row | undefined
  const patientRow = (id: string) => db.prepare('SELECT * FROM patients WHERE id = ?').get(id) as Row | undefined
  const apptRow = (id: string) => db.prepare('SELECT * FROM appointments WHERE id = ?').get(id) as Row | undefined
  const patientName = (id: string) => { const p = patientRow(id); return p ? `${p.first_name} ${p.last_name}` : id }

  // ---------- Autenticación ----------
  const failures = new Map<string, { n: number; until: number }>()

  function issue(res: Response, row: Row) {
    const token = jwt.sign({ sub: row.id, v: row.token_version }, secret, { expiresIn: `${SESSION_HOURS}h` })
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: !!opts.secureCookies, maxAge: SESSION_HOURS * 3600_000, path: '/' })
  }

  function authenticate(req: Request): Staff | null {
    const token = req.cookies?.[COOKIE]
    if (!token) return null
    try {
      const payload = jwt.verify(token, secret) as { sub: string; v: number }
      const row = staffRow(payload.sub)
      if (!row || !row.active || Number(row.token_version) !== payload.v) return null
      return toStaff(row)
    } catch { return null }
  }

  const auth = (req: Request, _res: Response, next: NextFunction) => {
    const user = authenticate(req)
    if (!user) return next(new HttpError(401, 'Tu sesión terminó. Vuelve a iniciar sesión.'))
    ;(req as AuthedRequest).user = user
    next()
  }
  const need = (...perms: Permission[]) => (req: Request, _res: Response, next: NextFunction) => {
    const { user } = req as AuthedRequest
    if (!perms.some((p) => can(user.role, p))) return next(new HttpError(403, 'Tu rol no tiene permiso para esta acción.'))
    next()
  }
  const userOf = (req: Request) => (req as AuthedRequest).user

  app.post('/api/auth/login', (req, res) => {
    const body = parse(z.object({ email: z.string().trim().min(1), password: z.string().min(1) }), req.body,
      'Escribe tu correo y tu contraseña.')
    const key = body.email.toLowerCase()
    const f = failures.get(key)
    if (f && f.until > Date.now()) fail(429, 'Demasiados intentos. Espera 5 minutos e inténtalo de nuevo.')
    const row = db.prepare('SELECT * FROM staff WHERE email = ?').get(body.email) as Row | undefined
    if (!row || !bcrypt.compareSync(body.password, String(row.password_hash))) {
      const n = (f?.n ?? 0) + 1
      failures.set(key, { n, until: n >= 5 ? Date.now() + 5 * 60_000 : 0 })
      fail(401, 'El correo o la contraseña no coinciden.')
    }
    if (!row!.active) fail(403, 'Esta cuenta está desactivada. Pide a administración que la reactive.')
    failures.delete(key)
    issue(res, row!)
    audit(String(row!.id), 'Inició sesión')
    res.json({ user: toStaff(row!), permissions: ROLE_PERMISSIONS[row!.role as Role], demo: demoMode })
  })

  app.post('/api/auth/logout', (req, res) => {
    const user = authenticate(req)
    if (user) audit(user.id, 'Cerró sesión')
    res.clearCookie(COOKIE, { path: '/' })
    res.json({ ok: true })
  })

  app.get('/api/auth/me', (req, res) => {
    const user = authenticate(req)
    res.json(user ? { user, permissions: ROLE_PERMISSIONS[user.role], demo: demoMode } : { user: null, demo: demoMode })
  })

  app.post('/api/auth/password', auth, (req, res) => {
    const body = parse(z.object({ current: z.string(), next: z.string().min(8, 'La nueva contraseña debe tener al menos 8 caracteres.') }), req.body)
    const user = userOf(req)
    const row = staffRow(user.id)!
    if (!bcrypt.compareSync(body.current, String(row.password_hash))) fail(400, 'La contraseña actual no es correcta.')
    db.prepare('UPDATE staff SET password_hash = ?, token_version = token_version + 1 WHERE id = ?').run(bcrypt.hashSync(body.next, 10), user.id)
    issue(res, staffRow(user.id)!)
    audit(user.id, 'Cambió su contraseña')
    res.json({ ok: true })
  })

  app.get('/api/demo-accounts', (_req, res) => {
    if (!demoMode) return res.json({ accounts: [], password: null })
    const rows = db.prepare(`SELECT * FROM staff WHERE active = 1 AND email LIKE '%@demo.clinara' ORDER BY CASE role WHEN 'doctor' THEN 0 WHEN 'nurse' THEN 1 WHEN 'reception' THEN 2 ELSE 3 END, name`).all() as Row[]
    res.json({ accounts: rows.map(toStaff), password: DEMO_PASSWORD })
  })

  // ---------- Datos iniciales según el rol ----------
  app.get('/api/bootstrap', auth, (req, res) => {
    const user = userOf(req)
    const clinical = can(user.role, 'chart.view')
    const staff = (db.prepare('SELECT * FROM staff ORDER BY name').all() as Row[]).map(toStaff)
    const patients = (db.prepare('SELECT * FROM patients ORDER BY last_name').all() as Row[]).map((r) => toPatient(r, clinical))
    const appointments = (db.prepare('SELECT * FROM appointments ORDER BY start').all() as Row[]).map(toAppointment)
    const prescriptions = can(user.role, 'rx.view')
      ? (db.prepare('SELECT * FROM prescriptions ORDER BY issued_at DESC').all() as Row[]).map(toPrescription) : []
    const auditLog = can(user.role, 'audit.view')
      ? (db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 300').all() as Row[]).map(toAudit) : []
    // Signos del día para que el médico vea quién está listo sin abrir cada expediente
    const todaysVitals = clinical
      ? (db.prepare(`SELECT v.* FROM vitals v JOIN appointments a ON a.id = v.appointment_id WHERE a.start LIKE ?`).all(`${localDate(new Date())}%`) as Row[]).map(toVitals)
      : []
    res.json({ staff, patients, appointments, prescriptions, audit: auditLog, vitals: todaysVitals })
  })

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
  })

  app.post('/api/patients', auth, need('patients.manage'), (req, res) => {
    const p = parse(patientBody, req.body)
    const id = randomUUID()
    const n = Number((db.prepare(`SELECT COALESCE(MAX(CAST(SUBSTR(record, 5) AS INTEGER)), 400) AS n FROM patients`).get() as Row).n) + 1
    const record = `EXP-${String(n).padStart(5, '0')}`
    db.prepare(`INSERT INTO patients (id,record,first_name,last_name,birth_date,sex,phone,email,blood_type,allergies,conditions,insurance,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, record, p.firstName, p.lastName, p.birthDate, p.sex, p.phone, p.email ?? null, p.bloodType || null,
        JSON.stringify(p.allergies), JSON.stringify(p.conditions), p.insurance || null, new Date().toISOString())
    audit(userOf(req).id, `Registró al paciente ${p.firstName} ${p.lastName} (${record})`)
    res.status(201).json({ id, record })
  })

  app.patch('/api/patients/:id', auth, need('patients.manage', 'chart.view'), (req, res) => {
    const user = userOf(req)
    const row = patientRow(String(req.params.id)) ?? fail(404, 'El paciente no existe.')
    const body = parse(patientBody.partial(), req.body)
    const demographic = ['firstName', 'lastName', 'birthDate', 'sex', 'phone', 'email', 'insurance'] as const
    const clinicalKeys = ['allergies', 'conditions', 'bloodType'] as const
    if (demographic.some((k) => k in req.body) && !can(user.role, 'patients.manage')) fail(403, 'Tu rol no puede editar los datos generales del paciente.')
    if (clinicalKeys.some((k) => k in req.body) && !can(user.role, 'chart.view')) fail(403, 'Tu rol no puede editar datos clínicos.')
    const cols: Record<string, string> = { firstName: 'first_name', lastName: 'last_name', birthDate: 'birth_date', sex: 'sex', phone: 'phone', email: 'email', insurance: 'insurance', bloodType: 'blood_type', allergies: 'allergies', conditions: 'conditions' }
    const sets: string[] = []
    const vals: (string | null)[] = []
    for (const [k, col] of Object.entries(cols)) {
      if (!(k in req.body)) continue
      const v = body[k as keyof typeof body]
      sets.push(`${col} = ?`)
      vals.push(Array.isArray(v) ? JSON.stringify(v) : v == null || v === '' ? null : String(v))
    }
    if (sets.length) db.prepare(`UPDATE patients SET ${sets.join(', ')} WHERE id = ?`).run(...vals, String(row!.id))
    audit(user.id, `Actualizó la ficha de ${row!.first_name} ${row!.last_name}`)
    res.json(toPatient(patientRow(String(row!.id))!, can(user.role, 'chart.view')))
  })

  app.get('/api/patients/:id/chart', auth, need('chart.view'), (req, res) => {
    const id = String(req.params.id)
    patientRow(id) ?? fail(404, 'El paciente no existe.')
    const vitals = (db.prepare('SELECT * FROM vitals WHERE patient_id = ? ORDER BY taken_at DESC').all(id) as Row[]).map(toVitals)
    const consultations = (db.prepare('SELECT * FROM consultations WHERE patient_id = ? ORDER BY date DESC').all(id) as Row[]).map(toConsultation)
    const prescriptions = (db.prepare('SELECT * FROM prescriptions WHERE patient_id = ? ORDER BY issued_at DESC').all(id) as Row[]).map(toPrescription)
    audit(userOf(req).id, `Consultó el expediente de ${patientName(id)}`)
    res.json({ vitals, consultations, prescriptions })
  })

  // ---------- Citas ----------
  function assertFree(doctorId: string, start: string, minutes: number, ignoreId?: string) {
    const s = new Date(start).getTime()
    const e = s + minutes * 60_000
    const same = db.prepare(`SELECT * FROM appointments WHERE doctor_id = ? AND start LIKE ? AND status NOT IN ('cancelled','no_show') AND id != ?`)
      .all(doctorId, `${start.slice(0, 10)}%`, ignoreId ?? '') as Row[]
    const clash = same.find((a) => {
      const as = new Date(String(a.start)).getTime()
      return as < e && s < as + Number(a.minutes) * 60_000
    })
    if (clash) fail(409, `${staffRow(doctorId)?.name} ya tiene una cita a las ${String(clash.start).slice(11, 16)}. Elige otra hora.`)
  }

  const apptBody = z.object({
    patientId: z.string().min(1, 'Elige un paciente.'),
    doctorId: z.string().min(1, 'Elige un médico.'),
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/, 'La fecha u hora no es válida.'),
    minutes: z.number().int().min(10).max(240),
    reason: z.string().trim().min(1, 'Escribe el motivo de consulta.'),
    type: z.enum(['first', 'followup', 'urgent']),
  })

  app.post('/api/appointments', auth, need('agenda.manage'), (req, res) => {
    const a = parse(apptBody, req.body)
    const start = a.start.length === 16 ? `${a.start}:00` : a.start
    patientRow(a.patientId) ?? fail(400, 'El paciente no existe.')
    const doc = staffRow(a.doctorId)
    if (!doc || doc.role !== 'doctor' || !doc.active) fail(400, 'El médico elegido no está disponible.')
    assertFree(a.doctorId, start, a.minutes)
    const id = randomUUID()
    db.prepare(`INSERT INTO appointments (id,patient_id,doctor_id,start,minutes,reason,type,status) VALUES (?,?,?,?,?,?,?, 'scheduled')`)
      .run(id, a.patientId, a.doctorId, start, a.minutes, a.reason, a.type)
    audit(userOf(req).id, `Agendó cita de ${patientName(a.patientId)} con ${doc!.name} el ${start.slice(0, 10)} a las ${start.slice(11, 16)}`)
    res.status(201).json(toAppointment(apptRow(id)!))
  })

  app.patch('/api/appointments/:id', auth, need('agenda.manage'), (req, res) => {
    const row = apptRow(String(req.params.id)) ?? fail(404, 'La cita no existe.')
    if (!['scheduled', 'confirmed'].includes(String(row!.status))) fail(409, 'Sólo se pueden reprogramar citas que aún no empiezan.')
    const b = parse(apptBody.pick({ doctorId: true, start: true, minutes: true, reason: true }).partial(), req.body)
    const next = {
      doctorId: b.doctorId ?? String(row!.doctor_id),
      start: b.start ? (b.start.length === 16 ? `${b.start}:00` : b.start) : String(row!.start),
      minutes: b.minutes ?? Number(row!.minutes),
      reason: b.reason ?? String(row!.reason),
    }
    assertFree(next.doctorId, next.start, next.minutes, String(row!.id))
    db.prepare('UPDATE appointments SET doctor_id = ?, start = ?, minutes = ?, reason = ?, status = ? WHERE id = ?')
      .run(next.doctorId, next.start, next.minutes, next.reason, 'scheduled', String(row!.id))
    audit(userOf(req).id, `Reprogramó la cita de ${patientName(String(row!.patient_id))} al ${next.start.slice(0, 10)} ${next.start.slice(11, 16)}`)
    res.json(toAppointment(apptRow(String(row!.id))!))
  })

  /** Transiciones permitidas: estado destino → estados de origen y permiso necesario. */
  const TRANSITIONS: Partial<Record<ApptStatus, { from: ApptStatus[]; perm: Permission; label: string }>> = {
    confirmed: { from: ['scheduled'], perm: 'agenda.manage', label: 'Confirmó' },
    cancelled: { from: ['scheduled', 'confirmed'], perm: 'agenda.manage', label: 'Canceló' },
    arrived: { from: ['scheduled', 'confirmed'], perm: 'checkin.manage', label: 'Registró la llegada de' },
    no_show: { from: ['scheduled', 'confirmed'], perm: 'checkin.manage', label: 'Marcó inasistencia de' },
    in_consult: { from: ['scheduled', 'confirmed', 'arrived', 'triaged'], perm: 'consult.write', label: 'Inició la consulta de' },
  }

  app.post('/api/appointments/:id/status', auth, (req, res) => {
    const user = userOf(req)
    const { status } = parse(z.object({ status: z.enum(['confirmed', 'cancelled', 'arrived', 'no_show', 'in_consult']) }), req.body)
    const row = apptRow(String(req.params.id)) ?? fail(404, 'La cita no existe.')
    const t = TRANSITIONS[status]!
    if (!can(user.role, t.perm)) fail(403, 'Tu rol no tiene permiso para esta acción.')
    if (row!.status === status) return res.json(toAppointment(row!))
    if (!t.from.includes(row!.status as ApptStatus)) fail(409, 'La cita ya avanzó a otra etapa. Actualiza la página.')
    if (status === 'in_consult' && row!.doctor_id !== user.id) fail(403, 'Sólo el médico asignado puede atender esta cita.')
    db.prepare('UPDATE appointments SET status = ?, arrived_at = COALESCE(?, arrived_at) WHERE id = ?')
      .run(status, status === 'arrived' ? new Date().toISOString() : null, String(row!.id))
    audit(user.id, `${t.label} la cita de ${patientName(String(row!.patient_id))}`)
    res.json(toAppointment(apptRow(String(row!.id))!))
  })

  // ---------- Triaje ----------
  app.post('/api/vitals', auth, need('vitals.record'), (req, res) => {
    const user = userOf(req)
    const n = (min: number, max: number, label: string) => z.number({ error: `Escribe ${label}.` }).min(min, `Revisa ${label}.`).max(max, `Revisa ${label}.`)
    const v = parse(z.object({
      patientId: z.string(), appointmentId: z.string().optional(),
      systolic: n(50, 260, 'la presión sistólica'), diastolic: n(30, 160, 'la presión diastólica'),
      heartRate: n(25, 250, 'la frecuencia cardíaca'), temperature: n(32, 43, 'la temperatura'), spo2: n(50, 100, 'la saturación'),
      weightKg: z.number().min(0).max(400).default(0), heightCm: z.number().min(0).max(250).default(0),
      painScale: z.number().int().min(0).max(10).optional(), notes: z.string().max(2000).optional(),
    }), req.body)
    patientRow(v.patientId) ?? fail(404, 'El paciente no existe.')
    if (v.appointmentId) {
      const a = apptRow(v.appointmentId)
      if (!a || a.patient_id !== v.patientId) fail(400, 'La cita no corresponde a este paciente.')
    }
    const id = randomUUID()
    tx(db, () => {
      db.prepare(`INSERT INTO vitals (id,patient_id,appointment_id,taken_by,taken_at,systolic,diastolic,heart_rate,temperature,spo2,weight_kg,height_cm,pain_scale,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, v.patientId, v.appointmentId ?? null, user.id, new Date().toISOString(), v.systolic, v.diastolic, v.heartRate, v.temperature, v.spo2,
          v.weightKg, v.heightCm, v.painScale ?? null, v.notes || null)
      if (v.appointmentId) db.prepare(`UPDATE appointments SET status = 'triaged' WHERE id = ? AND status = 'arrived'`).run(v.appointmentId)
      audit(user.id, `Registró signos vitales de ${patientName(v.patientId)}`)
    })
    res.status(201).json(toVitals(db.prepare('SELECT * FROM vitals WHERE id = ?').get(id) as Row))
  })

  // ---------- Consulta y receta ----------
  app.post('/api/consultations', auth, need('consult.write'), (req, res) => {
    const user = userOf(req)
    const c = parse(z.object({
      appointmentId: z.string(),
      reason: z.string().trim().min(1, 'Escribe el motivo de consulta.'),
      symptoms: z.array(z.string()).default([]),
      symptomOnset: z.string().optional(),
      history: z.string().default(''),
      exam: z.string().default(''),
      diagnoses: z.array(z.object({ code: z.string(), label: z.string() })).min(1, 'Agrega al menos un diagnóstico.'),
      plan: z.string().default(''),
      vitalsId: z.string().optional(),
      items: z.array(z.object({
        drug: z.string().trim().min(1), presentation: z.string().default(''), dose: z.string().trim().min(1, 'Escribe la dosis.'),
        frequency: z.string().min(1), duration: z.string().trim().min(1, 'Escribe la duración.'), instructions: z.string().optional(),
      })).default([]),
    }), req.body)
    const appt = apptRow(c.appointmentId) ?? fail(404, 'La cita no existe.')
    if (appt!.doctor_id !== user.id) fail(403, 'Sólo el médico asignado puede firmar esta consulta.')
    if (['done', 'cancelled', 'no_show'].includes(String(appt!.status))) fail(409, 'Esta cita ya está cerrada.')
    const patientId = String(appt!.patient_id)
    const cid = randomUUID()
    const rxId = c.items.length ? randomUUID() : null
    const now = new Date()
    let folio: string | null = null
    tx(db, () => {
      if (rxId) {
        const year = now.getFullYear()
        const last = db.prepare(`SELECT folio FROM prescriptions WHERE folio LIKE ? ORDER BY folio DESC LIMIT 1`).get(`RX-${year}-%`) as Row | undefined
        const seq = last ? Number(String(last.folio).split('-')[2]) + 1 : 1001
        folio = `RX-${year}-${String(seq).padStart(4, '0')}`
        db.prepare(`INSERT INTO prescriptions (id,folio,patient_id,doctor_id,consultation_id,issued_at,items) VALUES (?,?,?,?,?,?,?)`)
          .run(rxId, folio, patientId, user.id, cid, now.toISOString(), JSON.stringify(c.items))
      }
      db.prepare(`INSERT INTO consultations (id,patient_id,doctor_id,appointment_id,date,reason,symptoms,symptom_onset,history,exam,diagnoses,plan,vitals_id,prescription_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(cid, patientId, user.id, c.appointmentId, now.toISOString(), c.reason, JSON.stringify(c.symptoms), c.symptomOnset ?? null,
          c.history, c.exam, JSON.stringify(c.diagnoses), c.plan, c.vitalsId ?? null, rxId)
      db.prepare(`UPDATE appointments SET status = 'done' WHERE id = ?`).run(c.appointmentId)
      audit(user.id, rxId ? `Firmó consulta y receta ${folio} de ${patientName(patientId)}` : `Firmó consulta de ${patientName(patientId)}`)
    })
    res.status(201).json({ consultationId: cid, prescriptionId: rxId, folio })
  })

  app.get('/api/prescriptions/:id', auth, need('rx.view'), (req, res) => {
    const row = db.prepare('SELECT * FROM prescriptions WHERE id = ?').get(String(req.params.id)) as Row | undefined ?? fail(404, 'La receta no existe.')
    const rx = toPrescription(row!)
    const cons = db.prepare('SELECT * FROM consultations WHERE id = ?').get(rx.consultationId) as Row | undefined
    const patient = toPatient(patientRow(rx.patientId)!, true)
    audit(userOf(req).id, `Abrió la receta ${rx.folio}`)
    res.json({ prescription: rx, consultation: cons ? toConsultation(cons) : null, patient })
  })

  // ---------- Personal ----------
  const tempPassword = () => randomBytes(6).toString('base64url')

  app.post('/api/staff', auth, need('staff.manage'), (req, res) => {
    const s = parse(z.object({
      name: z.string().trim().min(3, 'Escribe el nombre completo.'),
      role: z.enum(['admin', 'doctor', 'nurse', 'reception']),
      email: z.string().trim().email('El correo no es válido.'),
      specialty: z.string().trim().optional(),
      license: z.string().trim().optional(),
    }), req.body)
    if (s.role === 'doctor' && !s.license) fail(400, 'Para un médico escribe su número de colegiación.')
    if (db.prepare('SELECT 1 FROM staff WHERE email = ?').get(s.email)) fail(409, 'Ya existe un usuario con ese correo.')
    const id = randomUUID()
    const password = tempPassword()
    const count = Number((db.prepare('SELECT COUNT(*) AS n FROM staff').get() as Row).n)
    db.prepare(`INSERT INTO staff (id,name,role,specialty,email,license,color,active,password_hash) VALUES (?,?,?,?,?,?,?,1,?)`)
      .run(id, s.name, s.role, s.specialty || null, s.email, s.license || null, COLORS[count % COLORS.length], bcrypt.hashSync(password, 10))
    audit(userOf(req).id, `Creó el usuario ${s.name} (${s.role})`)
    res.status(201).json({ user: toStaff(staffRow(id)!), password })
  })

  app.patch('/api/staff/:id', auth, need('staff.manage'), (req, res) => {
    const me = userOf(req)
    const row = staffRow(String(req.params.id)) ?? fail(404, 'El usuario no existe.')
    const b = parse(z.object({ active: z.boolean().optional(), role: z.enum(['admin', 'doctor', 'nurse', 'reception']).optional() }), req.body)
    if (row!.id === me.id && (b.active === false || (b.role && b.role !== me.role))) fail(400, 'No puedes desactivar ni cambiar el rol de tu propia cuenta.')
    if (b.active !== undefined) db.prepare('UPDATE staff SET active = ?, token_version = token_version + 1 WHERE id = ?').run(b.active ? 1 : 0, String(row!.id))
    if (b.role) db.prepare('UPDATE staff SET role = ?, token_version = token_version + 1 WHERE id = ?').run(b.role, String(row!.id))
    audit(me.id, `${b.active === false ? 'Desactivó' : b.active ? 'Reactivó' : 'Cambió el rol de'} a ${row!.name}`)
    res.json(toStaff(staffRow(String(row!.id))!))
  })

  app.post('/api/staff/:id/reset-password', auth, need('staff.manage'), (req, res) => {
    const row = staffRow(String(req.params.id)) ?? fail(404, 'El usuario no existe.')
    const password = tempPassword()
    db.prepare('UPDATE staff SET password_hash = ?, token_version = token_version + 1 WHERE id = ?').run(bcrypt.hashSync(password, 10), String(row!.id))
    audit(userOf(req).id, `Restableció la contraseña de ${row!.name}`)
    res.json({ password })
  })

  app.post('/api/admin/reset-demo', auth, need('staff.manage'), (req, res) => {
    if (!demoMode) fail(403, 'Esta acción sólo está disponible en modo demo.')
    const me = userOf(req)
    resetDemo(db)
    audit(me.id, 'Restableció los datos de demo')
    res.json({ ok: true })
  })

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Ruta no encontrada.')))

  // ---------- Frontend compilado ----------
  if (opts.staticDir && existsSync(opts.staticDir)) {
    app.use(express.static(opts.staticDir, { index: false, maxAge: '1h' }))
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(join(opts.staticDir!, 'index.html')))
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    void _next
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message })
    if (err instanceof SyntaxError) return res.status(400).json({ error: 'La solicitud no es válida.' })
    console.error(err)
    res.status(500).json({ error: 'Ocurrió un error en el servidor. Inténtalo de nuevo.' })
  })

  return app
}

function parse<T extends z.ZodType>(schema: T, data: unknown, message?: string): z.infer<T> {
  const r = schema.safeParse(data)
  if (!r.success) fail(400, message ?? r.error.issues[0]?.message ?? 'Revisa los datos enviados.')
  return r.data as z.infer<T>
}

function localDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Sin JWT_SECRET en el entorno, genera uno y lo guarda en la base para que las sesiones sobrevivan reinicios. */
function persistentSecret(db: DB) {
  const row = db.prepare(`SELECT value FROM meta WHERE key = 'jwt_secret'`).get() as Row | undefined
  if (row) return String(row.value)
  const s = randomBytes(48).toString('hex')
  db.prepare(`INSERT INTO meta (key, value) VALUES ('jwt_secret', ?)`).run(s)
  return s
}
