import express, { type NextFunction, type Request, type Response } from 'express'
import cookieParser from 'cookie-parser'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import QRCode from 'qrcode'
import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { attempts, createPatient, DEMO_PASSWORD, ensureDb, hit, nextFolio, resetDemo } from './db.js'
import type { Sql } from './sql.js'
import { type Ctx, fail, HttpError, localDate, parse, type Row } from './http.js'
import {
  clinicSettings, toAppointment, toAudit, toBed, toConsultation, toFollowup, toHospitalization, toPatient, toPrescription, toService, toStaff, toVitals,
} from './mappers.js'
import { newSecret, otpauthUrl, verifyTotp } from './totp.js'
import { registerSettings } from './routes/settings.js'
import { registerPublic } from './routes/public.js'
import { registerBilling } from './routes/billing.js'
import { registerReports } from './routes/reports.js'
import { registerFiles } from './routes/files.js'
import { registerPlatform } from './routes/platform.js'
import { registerInpatient } from './routes/inpatient.js'
import { followupInput, insertFollowup, registerFollowups, sweepFollowupReminders } from './routes/followups.js'
import { can, ROLE_PERMISSIONS, type Permission } from '../src/lib/permissions.js'
import { yearsOld } from '../src/lib/inpatient.js'
import type { ApptStatus, Staff } from '../src/lib/types.js'

export interface AppOptions {
  sql: Sql
  jwtSecret?: string
  demoMode?: boolean
  secureCookies?: boolean
  staticDir?: string
}

const COOKIE = 'clinara_session'
const SESSION_HOURS = 10

interface AuthedRequest extends Request { user: Staff }

const COLORS = ['#2335C9', '#0F8A6E', '#B4407A', '#C27A12', '#6A4BC4', '#2C7DA0', '#5B6472']
const ROLES = ['admin', 'doctor', 'nurse', 'reception'] as const

export function createApp(opts: AppOptions) {
  const { sql } = opts
  const demoMode = opts.demoMode ?? true
  let secret = opts.jwtSecret
  const app = express()

  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  // Los adjuntos traen su propio parser con un límite mayor
  const smallJson = express.json({ limit: '200kb' })
  app.use((req, res, next) => (/\/attachments$/.test(req.path) ? next() : smallJson(req, res, next)))
  app.use(cookieParser())
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'same-origin')
    next()
  })
  // Diagnóstico: dice si la base responde y, si no, por qué (sin revelar credenciales)
  app.get('/api/health', async (_req, res) => {
    try {
      await ensureDb(sql)
      const r = await sql.one<{ n: number }>('SELECT COUNT(*)::int AS n FROM staff')
      res.json({ ok: true, database: sql.kind, staff: Number(r?.n ?? 0), jwtSecret: opts.jwtSecret ? 'configurado' : 'guardado en la base', demoMode })
    } catch (e) {
      res.status(503).json({ ok: false, database: sql.kind, error: describeDbError(e) })
    }
  })

  // La primera petición de cada instancia crea o actualiza el esquema si hace falta
  app.use('/api', async (_req, _res, next) => {
    try {
      await ensureDb(sql)
      secret ??= await persistentSecret(sql)
    } catch (e) {
      console.error('Base de datos no disponible:', e)
      return next(new HttpError(503, describeDbError(e)))
    }
    next()
  })

  /** Registra una acción en la bitácora, ligada a la clínica de quien la hizo. */
  const audit = async (actor: { id: string; clinicId?: string | null }, action: string, q: Sql = sql) => {
    await q.run('INSERT INTO audit (at, user_id, action, clinic_id) VALUES (?, ?, ?, ?)', [new Date().toISOString(), actor.id, action, actor.clinicId ?? null])
  }
  const staffRow = (id: string) => sql.one('SELECT * FROM staff WHERE id = ?', [id])
  // Todo lo que pertenece a una clínica se busca siempre junto con la clínica de quien pregunta
  const clinicStaffRow = (cid: string, id: string) => sql.one('SELECT * FROM staff WHERE id = ? AND clinic_id = ?', [id, cid])
  const patientRow = (cid: string, id: string) => sql.one('SELECT * FROM patients WHERE id = ? AND clinic_id = ?', [id, cid])
  const apptRow = (cid: string, id: string) => sql.one('SELECT * FROM appointments WHERE id = ? AND clinic_id = ?', [id, cid])
  const patientName = async (id: string) => { const p = await sql.one('SELECT first_name, last_name FROM patients WHERE id = ?', [id]); return p ? `${p.first_name} ${p.last_name}` : id }
  const settings = async (cid: string) => {
    const c = await sql.one('SELECT * FROM clinics WHERE id = ?', [cid])
    return c ? clinicSettings(c) : fail(404, 'La clínica no existe.')
  }
  const clinicOf = (req: Request) => userOf(req).clinicId ?? fail(403, 'Esta acción es para el personal de una clínica.')

  // ---------- Autenticación ----------
  function issue(res: Response, row: Row) {
    const token = jwt.sign({ sub: row.id, v: Number(row.token_version) }, secret!, { expiresIn: `${SESSION_HOURS}h` })
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: !!opts.secureCookies, maxAge: SESSION_HOURS * 3600_000, path: '/' })
  }

  async function authenticate(req: Request): Promise<Staff | null> {
    const token = req.cookies?.[COOKIE]
    if (!token) return null
    let payload: { sub: string; v: number }
    try { payload = jwt.verify(token, secret!) as { sub: string; v: number } } catch { return null }
    const row = await sql.one(`SELECT s.*, c.active AS clinic_active FROM staff s LEFT JOIN clinics c ON c.id = s.clinic_id WHERE s.id = ?`, [payload.sub])
    if (!row || !row.active || Number(row.token_version) !== payload.v) return null
    if (row.clinic_id && !row.clinic_active) return null
    return toStaff(row)
  }

  const auth = (req: Request, _res: Response, next: NextFunction) => {
    authenticate(req).then((user) => {
      if (!user) return next(new HttpError(401, 'Tu sesión terminó. Vuelve a iniciar sesión.'))
      ;(req as AuthedRequest).user = user
      next()
    }, next)
  }
  const need = (...perms: Permission[]) => (req: Request, _res: Response, next: NextFunction) => {
    const { user } = req as AuthedRequest
    if (!perms.some((p) => can(user.role, p))) return next(new HttpError(403, 'Tu rol no tiene permiso para esta acción.'))
    next()
  }
  const userOf = (req: Request) => (req as AuthedRequest).user

  async function assertFree(doctorId: string, start: string, minutes: number, ignoreId?: string) {
    const s = new Date(start).getTime()
    const e = s + minutes * 60_000
    const same = await sql.query(`SELECT start, minutes FROM appointments WHERE doctor_id = ? AND start LIKE ? AND status NOT IN ('cancelled','no_show') AND id != ?`,
      [doctorId, `${start.slice(0, 10)}%`, ignoreId ?? ''])
    const clash = same.find((a) => {
      const as = new Date(String(a.start)).getTime()
      return as < e && s < as + Number(a.minutes) * 60_000
    })
    if (clash) fail(409, `${(await staffRow(doctorId))?.name} ya tiene una cita a las ${String(clash.start).slice(11, 16)}. Elige otra hora.`)
  }

  /** La receta lleva el número de identidad del paciente; en adultos es obligatorio. */
  async function assertRxIdentity(cid: string, patientId: string) {
    const p = (await patientRow(cid, patientId)) ?? fail(404, 'El paciente no existe.')
    if (!p!.dni && yearsOld(String(p!.birth_date)) >= 18) fail(400, 'Para emitir la receta registra el número de identidad del paciente.')
  }

  const ctx: Ctx = { sql, demoMode, auth, need, userOf, clinicOf, audit, patientName, staffRow, clinicStaffRow, patientRow, apptRow, assertFree, assertRxIdentity, settings }

  const session = (row: Row) => {
    const user = toStaff(row)
    return { user, permissions: ROLE_PERMISSIONS[user.role], demo: demoMode }
  }

  app.post('/api/auth/login', async (req, res) => {
    const body = parse(z.object({ email: z.string().trim().min(1), password: z.string().min(1), code: z.string().optional() }), req.body,
      'Escribe tu correo y tu contraseña.')
    const key = `login:${body.email.toLowerCase()}`
    if (await attempts(sql, key) >= 5) fail(429, 'Demasiados intentos. Espera 5 minutos e inténtalo de nuevo.')
    const row = await sql.one('SELECT * FROM staff WHERE lower(email) = lower(?)', [body.email])
    if (!row || !bcrypt.compareSync(body.password, String(row.password_hash))) {
      await hit(sql, key, 5 * 60_000)
      fail(401, 'El correo o la contraseña no coinciden.')
    }
    if (!row!.active) fail(403, 'Esta cuenta está desactivada. Pide a administración que la reactive.')
    if (row!.clinic_id && !(await sql.one('SELECT 1 FROM clinics WHERE id = ? AND active', [row!.clinic_id]))) fail(403, 'Tu clínica está desactivada en Clinara. Comunícate con administración.')
    if (row!.totp_enabled) {
      if (!body.code) return res.json({ twoFactor: true })
      if (!verifyTotp(String(row!.totp_secret), body.code)) {
        await hit(sql, key, 5 * 60_000)
        fail(401, 'El código no es válido o ya expiró. Usa el que muestra tu app ahora.')
      }
    }
    await sql.run('DELETE FROM rate_limits WHERE key = ?', [key])
    issue(res, row!)
    await audit({ id: String(row!.id), clinicId: row!.clinic_id as string | null }, 'Inició sesión')
    res.json(session(row!))
  })

  app.post('/api/auth/logout', async (req, res) => {
    const user = await authenticate(req)
    if (user) await audit(user, 'Cerró sesión')
    res.clearCookie(COOKIE, { path: '/' })
    res.json({ ok: true })
  })

  app.get('/api/auth/me', async (req, res) => {
    const user = await authenticate(req)
    res.json(user ? session((await staffRow(user.id))!) : { user: null, demo: demoMode })
  })

  app.post('/api/auth/password', auth, async (req, res) => {
    const body = parse(z.object({ current: z.string(), next: z.string().min(8, 'La nueva contraseña debe tener al menos 8 caracteres.') }), req.body)
    const user = userOf(req)
    const row = (await staffRow(user.id))!
    if (!bcrypt.compareSync(body.current, String(row.password_hash))) fail(400, 'La contraseña actual no es correcta.')
    await sql.run('UPDATE staff SET password_hash = ?, token_version = token_version + 1 WHERE id = ?', [bcrypt.hashSync(body.next, 10), user.id])
    issue(res, (await staffRow(user.id))!)
    await audit(user, 'Cambió su contraseña')
    res.json({ ok: true })
  })

  // Doble factor: configurar genera un secreto pendiente; se activa al confirmar un código válido
  app.post('/api/auth/2fa/setup', auth, async (req, res) => {
    const user = userOf(req)
    const s = newSecret()
    await sql.run('UPDATE staff SET totp_secret = ? WHERE id = ? AND NOT totp_enabled', [s, user.id])
    const url = otpauthUrl(s, user.email, user.clinicId ? (await settings(user.clinicId)).name : 'Clinara')
    res.json({ secret: s, qr: await QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#0e2233', light: '#ffffff' } }) })
  })

  app.post('/api/auth/2fa/enable', auth, async (req, res) => {
    const { code } = parse(z.object({ code: z.string() }), req.body, 'Escribe el código de 6 dígitos.')
    const user = userOf(req)
    const row = (await staffRow(user.id))!
    if (!row.totp_secret) fail(400, 'Primero genera el código QR.')
    if (!verifyTotp(String(row.totp_secret), code)) fail(400, 'El código no coincide. Revisa que la hora de tu teléfono sea correcta e inténtalo con el código actual.')
    await sql.run('UPDATE staff SET totp_enabled = TRUE WHERE id = ?', [user.id])
    await audit(user, 'Activó la verificación en dos pasos')
    res.json({ ok: true })
  })

  app.post('/api/auth/2fa/disable', auth, async (req, res) => {
    const { password } = parse(z.object({ password: z.string().min(1) }), req.body, 'Escribe tu contraseña.')
    const user = userOf(req)
    if (!bcrypt.compareSync(password, String((await staffRow(user.id))!.password_hash))) fail(400, 'La contraseña no es correcta.')
    await sql.run('UPDATE staff SET totp_enabled = FALSE, totp_secret = NULL WHERE id = ?', [user.id])
    await audit(user, 'Desactivó la verificación en dos pasos')
    res.json({ ok: true })
  })

  app.get('/api/demo-accounts', async (_req, res) => {
    if (!demoMode) return res.json({ accounts: [], password: null })
    const rows = await sql.query(`SELECT s.*, c.name AS clinic_name FROM staff s LEFT JOIN clinics c ON c.id = s.clinic_id
      WHERE s.active AND s.email LIKE '%@demo.clinara' AND (c.active IS NULL OR c.active)
      ORDER BY c.created_at NULLS FIRST, CASE s.role WHEN 'doctor' THEN 0 WHEN 'nurse' THEN 1 WHEN 'reception' THEN 2 WHEN 'admin' THEN 3 ELSE 4 END, s.name`)
    res.json({ accounts: rows.map((r) => ({ ...toStaff(r), clinicName: r.clinic_name ?? undefined })), password: DEMO_PASSWORD })
  })

  // ---------- Datos iniciales según el rol ----------
  app.get('/api/bootstrap', auth, async (req, res) => {
    const user = userOf(req)
    // La administración de la plataforma no carga datos de ninguna clínica
    if (!user.clinicId) {
      return res.json({ staff: [], patients: [], appointments: [], prescriptions: [], audit: [], vitals: [], services: [], beds: [], inpatients: [], followups: [], discharges: [],
        settings: { ...clinicSettings({ name: 'Clinara' }) } })
    }
    const cid = user.clinicId
    const clinical = can(user.role, 'chart.view')
    const billing = can(user.role, 'billing.manage')
    const since = new Date(); since.setDate(since.getDate() - 90)
    const none = Promise.resolve([] as Row[])
    if (can(user.role, 'followups.view')) await sweepFollowupReminders(sql, cid)
    const [staff, patients, appts, prescriptions, auditLog, vitals, services, cfg, beds, inpatients, followups, discharges] = await Promise.all([
      sql.query('SELECT * FROM staff WHERE clinic_id = ? ORDER BY name', [cid]),
      sql.query('SELECT * FROM patients WHERE clinic_id = ? ORDER BY last_name', [cid]),
      // Ventana de agenda: 90 días atrás y todo lo futuro
      sql.query(`SELECT a.*, EXISTS(SELECT 1 FROM payments p WHERE p.appointment_id = a.id AND NOT p.voided) AS paid
        FROM appointments a WHERE a.clinic_id = ? AND a.start >= ? ORDER BY a.start`, [cid, localDate(since)]),
      can(user.role, 'rx.view') ? sql.query('SELECT * FROM prescriptions WHERE clinic_id = ? ORDER BY issued_at DESC LIMIT 500', [cid]) : Promise.resolve([]),
      can(user.role, 'audit.view') ? sql.query('SELECT * FROM audit WHERE clinic_id = ? ORDER BY id DESC LIMIT 500', [cid]) : Promise.resolve([]),
      clinical ? sql.query(`SELECT v.* FROM vitals v JOIN appointments a ON a.id = v.appointment_id WHERE v.clinic_id = ? AND a.start LIKE ?`, [cid, `${localDate(new Date())}%`]) : Promise.resolve([]),
      sql.query('SELECT * FROM services WHERE clinic_id = ? ORDER BY name', [cid]),
      settings(cid),
      can(user.role, 'inpatient.view') || can(user.role, 'settings.manage') ? sql.query('SELECT * FROM beds WHERE clinic_id = ? ORDER BY specialty, room, label', [cid]) : none,
      can(user.role, 'inpatient.view') ? sql.query(`SELECT * FROM hospitalizations WHERE clinic_id = ? AND status = 'active' ORDER BY admitted_at`, [cid]) : none,
      can(user.role, 'followups.view') ? sql.query('SELECT * FROM followups WHERE clinic_id = ? AND active ORDER BY due_date', [cid]) : none,
      sql.query(`SELECT DISTINCT ON (patient_id) patient_id, discharged_at FROM hospitalizations
        WHERE clinic_id = ? AND status = 'discharged' AND discharged_at IS NOT NULL ORDER BY patient_id, discharged_at DESC`, [cid]),
    ])
    res.json({
      staff: staff.map(toStaff),
      patients: patients.map((r) => toPatient(r, clinical)),
      appointments: appts.map((r) => ({ ...toAppointment(r), paid: billing ? Boolean(r.paid) : undefined })),
      prescriptions: prescriptions.map(toPrescription),
      audit: auditLog.map(toAudit),
      vitals: vitals.map(toVitals),
      services: services.map(toService),
      settings: cfg,
      beds: beds.map(toBed),
      inpatients: inpatients.map(toHospitalization),
      followups: followups.map(toFollowup),
      discharges: discharges.map((r) => ({ patientId: String(r.patient_id), at: String(r.discharged_at) })),
    })
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
    dni: z.string().trim().max(30).optional(),
    civilStatus: z.string().trim().max(40).optional(),
    occupation: z.string().trim().max(80).optional(),
    education: z.string().trim().max(80).optional(),
    religion: z.string().trim().max(60).optional(),
    address: z.string().trim().max(200).optional(),
    emergencyName: z.string().trim().max(100).optional(),
    emergencyPhone: z.string().trim().max(30).optional(),
    emergencyRelation: z.string().trim().max(40).optional(),
    guardianName: z.string().trim().max(100).optional(),
    guardianDni: z.string().trim().max(30).optional(),
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

  app.patch('/api/patients/:id', auth, need('patients.manage', 'chart.view'), async (req, res) => {
    const user = userOf(req)
    const cid = clinicOf(req)
    const row = (await patientRow(cid, String(req.params.id))) ?? fail(404, 'El paciente no existe.')
    const body = parse(patientBody.partial(), req.body)
    const demographic = ['firstName', 'lastName', 'birthDate', 'sex', 'phone', 'email', 'insurance', 'dni', 'civilStatus', 'occupation', 'education',
      'religion', 'address', 'emergencyName', 'emergencyPhone', 'emergencyRelation', 'guardianName', 'guardianDni', 'guardianRelation'] as const
    const clinicalKeys = ['allergies', 'conditions', 'bloodType', 'background'] as const
    if (demographic.some((k) => k in req.body) && !can(user.role, 'patients.manage')) fail(403, 'Tu rol no puede editar los datos generales del paciente.')
    if (clinicalKeys.some((k) => k in req.body) && !can(user.role, 'chart.view')) fail(403, 'Tu rol no puede editar datos clínicos.')
    const cols: Record<string, string> = { firstName: 'first_name', lastName: 'last_name', birthDate: 'birth_date', sex: 'sex', phone: 'phone', email: 'email', insurance: 'insurance',
      bloodType: 'blood_type', allergies: 'allergies', conditions: 'conditions', background: 'background', dni: 'dni', civilStatus: 'civil_status', occupation: 'occupation',
      education: 'education', religion: 'religion', address: 'address', emergencyName: 'emergency_name', emergencyPhone: 'emergency_phone', emergencyRelation: 'emergency_relation',
      guardianName: 'guardian_name', guardianDni: 'guardian_dni', guardianRelation: 'guardian_relation' }
    const sets: string[] = []
    const vals: (string | null)[] = []
    for (const [k, col] of Object.entries(cols)) {
      if (!(k in req.body)) continue
      const v = body[k as keyof typeof body]
      sets.push(`${col} = ?`)
      vals.push(typeof v === 'object' && v !== null ? JSON.stringify(v) : v == null || v === '' ? null : String(v))
    }
    if (sets.length) await sql.run(`UPDATE patients SET ${sets.join(', ')} WHERE id = ? AND clinic_id = ?`, [...vals, String(row!.id), cid])
    await audit(user, `Actualizó la ficha de ${row!.first_name} ${row!.last_name}`)
    res.json(toPatient((await patientRow(cid, String(row!.id)))!, can(user.role, 'chart.view')))
  })

  app.get('/api/patients/:id/chart', auth, need('chart.view'), async (req, res) => {
    const id = String(req.params.id)
    const cid = clinicOf(req)
    ;(await patientRow(cid, id)) ?? fail(404, 'El paciente no existe.')
    const [vitals, consultations, prescriptions, hospitalizations] = await Promise.all([
      sql.query('SELECT * FROM vitals WHERE patient_id = ? AND clinic_id = ? ORDER BY taken_at DESC', [id, cid]),
      sql.query('SELECT * FROM consultations WHERE patient_id = ? AND clinic_id = ? ORDER BY date DESC', [id, cid]),
      sql.query('SELECT * FROM prescriptions WHERE patient_id = ? AND clinic_id = ? ORDER BY issued_at DESC', [id, cid]),
      sql.query('SELECT * FROM hospitalizations WHERE patient_id = ? AND clinic_id = ? ORDER BY admitted_at DESC', [id, cid]),
    ])
    await audit(userOf(req), `Consultó el expediente de ${await patientName(id)}`)
    res.json({ vitals: vitals.map(toVitals), consultations: consultations.map(toConsultation), prescriptions: prescriptions.map(toPrescription),
      hospitalizations: hospitalizations.map(toHospitalization) })
  })

  // ---------- Citas ----------
  const apptBody = z.object({
    patientId: z.string().min(1, 'Elige un paciente.'),
    doctorId: z.string().min(1, 'Elige un médico.'),
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/, 'La fecha u hora no es válida.'),
    minutes: z.number().int().min(10).max(240),
    reason: z.string().trim().min(1, 'Escribe el motivo de consulta.'),
    type: z.enum(['first', 'followup', 'urgent']),
  })

  app.get('/api/appointments', auth, need('agenda.view'), async (req, res) => {
    const q = parse(z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), req.query, 'Elige un rango de fechas.')
    const user = userOf(req)
    const rows = await sql.query(`SELECT a.*, EXISTS(SELECT 1 FROM payments p WHERE p.appointment_id = a.id AND NOT p.voided) AS paid
      FROM appointments a WHERE a.clinic_id = ? AND a.start >= ? AND a.start < ? ORDER BY a.start`, [clinicOf(req), q.from, `${q.to}T99`])
    const billing = can(user.role, 'billing.manage')
    res.json(rows.map((r) => ({ ...toAppointment(r), paid: billing ? Boolean(r.paid) : undefined })))
  })

  app.post('/api/appointments', auth, need('agenda.manage'), async (req, res) => {
    const a = parse(apptBody, req.body)
    const start = a.start.length === 16 ? `${a.start}:00` : a.start
    const cid = clinicOf(req)
    ;(await patientRow(cid, a.patientId)) ?? fail(400, 'El paciente no existe.')
    const doc = await clinicStaffRow(cid, a.doctorId)
    if (!doc || doc.role !== 'doctor' || !doc.active) fail(400, 'El médico elegido no está disponible.')
    await assertFree(a.doctorId, start, a.minutes)
    const id = randomUUID()
    await sql.run(`INSERT INTO appointments (id,patient_id,doctor_id,start,minutes,reason,type,status,source,clinic_id) VALUES (?,?,?,?,?,?,?, 'scheduled', 'staff', ?)`,
      [id, a.patientId, a.doctorId, start, a.minutes, a.reason, a.type, cid])
    await audit(userOf(req), `Agendó cita de ${await patientName(a.patientId)} con ${doc!.name} el ${start.slice(0, 10)} a las ${start.slice(11, 16)}`)
    res.status(201).json(toAppointment((await apptRow(cid, id))!))
  })

  app.patch('/api/appointments/:id', auth, need('agenda.manage'), async (req, res) => {
    const cid = clinicOf(req)
    const row = (await apptRow(cid, String(req.params.id))) ?? fail(404, 'La cita no existe.')
    if (!['scheduled', 'confirmed'].includes(String(row!.status))) fail(409, 'Sólo se pueden reprogramar citas que aún no empiezan.')
    const b = parse(apptBody.pick({ doctorId: true, start: true, minutes: true, reason: true }).partial(), req.body)
    const next = {
      doctorId: b.doctorId ?? String(row!.doctor_id),
      start: b.start ? (b.start.length === 16 ? `${b.start}:00` : b.start) : String(row!.start),
      minutes: b.minutes ?? Number(row!.minutes),
      reason: b.reason ?? String(row!.reason),
    }
    const doc = await clinicStaffRow(cid, next.doctorId)
    if (!doc || doc.role !== 'doctor' || !doc.active) fail(400, 'El médico elegido no está disponible.')
    await assertFree(next.doctorId, next.start, next.minutes, String(row!.id))
    await sql.run('UPDATE appointments SET doctor_id = ?, start = ?, minutes = ?, reason = ?, status = ?, reminded_at = NULL WHERE id = ?',
      [next.doctorId, next.start, next.minutes, next.reason, 'scheduled', String(row!.id)])
    await audit(userOf(req), `Reprogramó la cita de ${await patientName(String(row!.patient_id))} al ${next.start.slice(0, 10)} ${next.start.slice(11, 16)}`)
    res.json(toAppointment((await apptRow(cid, String(row!.id)))!))
  })

  /** Transiciones permitidas: estado destino → estados de origen y permiso necesario. */
  const TRANSITIONS: Partial<Record<ApptStatus, { from: ApptStatus[]; perm: Permission; label: string }>> = {
    confirmed: { from: ['scheduled'], perm: 'agenda.manage', label: 'Confirmó' },
    cancelled: { from: ['scheduled', 'confirmed'], perm: 'agenda.manage', label: 'Canceló' },
    arrived: { from: ['scheduled', 'confirmed'], perm: 'checkin.manage', label: 'Registró la llegada de' },
    no_show: { from: ['scheduled', 'confirmed'], perm: 'checkin.manage', label: 'Marcó inasistencia de' },
    in_consult: { from: ['scheduled', 'confirmed', 'arrived', 'triaged'], perm: 'consult.write', label: 'Inició la consulta de' },
  }

  app.post('/api/appointments/:id/status', auth, async (req, res) => {
    const user = userOf(req)
    const { status } = parse(z.object({ status: z.enum(['confirmed', 'cancelled', 'arrived', 'no_show', 'in_consult']) }), req.body)
    const cid = clinicOf(req)
    const row = (await apptRow(cid, String(req.params.id))) ?? fail(404, 'La cita no existe.')
    const t = TRANSITIONS[status]!
    if (!can(user.role, t.perm)) fail(403, 'Tu rol no tiene permiso para esta acción.')
    if (row!.status === status) return res.json(toAppointment(row!))
    if (!t.from.includes(row!.status as ApptStatus)) fail(409, 'La cita ya avanzó a otra etapa. Actualiza la página.')
    if (status === 'in_consult' && row!.doctor_id !== user.id) fail(403, 'Sólo el médico asignado puede atender esta cita.')
    await sql.run('UPDATE appointments SET status = ?, arrived_at = COALESCE(?, arrived_at) WHERE id = ?',
      [status, status === 'arrived' ? new Date().toISOString() : null, String(row!.id)])
    await audit(user, `${t.label} la cita de ${await patientName(String(row!.patient_id))}`)
    res.json(toAppointment((await apptRow(cid, String(row!.id)))!))
  })

  // Paciente que llega sin cita: entra directo a la consulta externa del día, ya en sala
  app.post('/api/appointments/walk-in', auth, need('checkin.manage'), async (req, res) => {
    const b = parse(z.object({
      patientId: z.string().min(1, 'Elige un paciente.'),
      doctorId: z.string().min(1, 'Elige un médico.'),
      reason: z.string().trim().min(1, 'Escribe el motivo de consulta.').max(300),
    }), req.body)
    const cid = clinicOf(req)
    ;(await patientRow(cid, b.patientId)) ?? fail(400, 'El paciente no existe.')
    const doc = await clinicStaffRow(cid, b.doctorId)
    if (!doc || doc.role !== 'doctor' || !doc.active) fail(400, 'El médico elegido no está disponible.')
    const now = new Date()
    const id = randomUUID()
    const start = `${localDate(now)}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`
    const seen = await sql.one('SELECT 1 FROM consultations WHERE patient_id = ? AND clinic_id = ? LIMIT 1', [b.patientId, cid])
    await sql.run(`INSERT INTO appointments (id,patient_id,doctor_id,start,minutes,reason,type,status,arrived_at,source,clinic_id) VALUES (?,?,?,?,30,?,?,'arrived',?,'walkin',?)`,
      [id, b.patientId, b.doctorId, start, b.reason, seen ? 'followup' : 'first', now.toISOString(), cid])
    await audit(userOf(req), `Registró a ${await patientName(b.patientId)} sin cita para consulta externa con ${doc!.name}`)
    res.status(201).json(toAppointment((await apptRow(cid, id))!))
  })

  app.post('/api/appointments/:id/reminded', auth, need('agenda.manage', 'checkin.manage'), async (req, res) => {
    const cid = clinicOf(req)
    const row = (await apptRow(cid, String(req.params.id))) ?? fail(404, 'La cita no existe.')
    await sql.run('UPDATE appointments SET reminded_at = ? WHERE id = ?', [new Date().toISOString(), String(row!.id)])
    await audit(userOf(req), `Envió recordatorio por WhatsApp a ${await patientName(String(row!.patient_id))}`)
    res.json(toAppointment((await apptRow(cid, String(row!.id)))!))
  })

  // ---------- Triaje ----------
  app.post('/api/vitals', auth, need('vitals.record'), async (req, res) => {
    const user = userOf(req)
    // Los límites son sólo de cordura: un valor improbable que enfermería confirmó se guarda (la preclínica avisa antes)
    const int = (max: number, label: string) => z.number({ error: `Revisa ${label}.` }).min(0, `Revisa ${label}.`).max(max, `Revisa ${label}.`).transform(Math.round).optional()
    const dec = (max: number, label: string) => z.number({ error: `Revisa ${label}.` }).min(0, `Revisa ${label}.`).max(max, `Revisa ${label}.`).optional()
    const v = parse(z.object({
      patientId: z.string(), appointmentId: z.string().optional(),
      systolic: int(400, 'la presión sistólica'), diastolic: int(300, 'la presión diastólica'),
      heartRate: int(400, 'la frecuencia cardíaca'), temperature: dec(50, 'la temperatura'), spo2: int(100, 'la saturación'),
      weightKg: dec(500, 'el peso'), heightCm: dec(300, 'la talla'),
      painScale: z.number().int().min(0).max(10).optional(), notes: z.string().max(2000).optional(),
      respRate: int(150, 'la frecuencia respiratoria'),
      glucose: dec(3000, 'la glucometría'),
      chiefComplaint: z.string().trim().max(500).optional(),
    }), req.body)
    const cid = clinicOf(req)
    ;(await patientRow(cid, v.patientId)) ?? fail(404, 'El paciente no existe.')
    if (v.appointmentId) {
      const a = await apptRow(cid, v.appointmentId)
      if (!a || a.patient_id !== v.patientId) fail(400, 'La cita no corresponde a este paciente.')
    }
    const id = randomUUID()
    const name = await patientName(v.patientId)
    await sql.tx(async (q) => {
      await q.run(`INSERT INTO vitals (id,patient_id,appointment_id,taken_by,taken_at,systolic,diastolic,heart_rate,temperature,spo2,weight_kg,height_cm,pain_scale,notes,resp_rate,glucose,chief_complaint,clinic_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, v.patientId, v.appointmentId ?? null, user.id, new Date().toISOString(), v.systolic ?? null, v.diastolic ?? null, v.heartRate ?? null, v.temperature ?? null, v.spo2 ?? null,
          v.weightKg ?? null, v.heightCm ?? null, v.painScale ?? null, v.notes || null, v.respRate ?? null, v.glucose ?? null, v.chiefComplaint || null, cid])
      if (v.appointmentId) await q.run(`UPDATE appointments SET status = 'triaged' WHERE id = ? AND status = 'arrived'`, [v.appointmentId])
      await audit(user, `Registró signos vitales de ${name}`, q)
    })
    res.status(201).json(toVitals((await sql.one('SELECT * FROM vitals WHERE id = ?', [id]))!))
  })

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
      diagnoses: z.array(z.object({ code: z.string(), label: z.string() })).min(1, 'Agrega al menos un diagnóstico.'),
      orders: z.array(z.string().trim().min(1)).min(1, 'Agrega al menos una orden médica en el manejo.'),
      observations: z.string().max(4000).default(''),
      followups: z.array(followupInput).max(5).default([]),
      vitalsId: z.string().optional(),
      items: z.array(z.object({
        drug: z.string().trim().min(1), presentation: z.string().default(''), dose: z.string().trim().min(1, 'Escribe la dosis.'),
        frequency: z.string().min(1), duration: z.string().trim().min(1, 'Escribe la duración.'), instructions: z.string().optional(),
      })).default([]),
    }), req.body)
    const cid = clinicOf(req)
    const appt = (await apptRow(cid, c.appointmentId)) ?? fail(404, 'La cita no existe.')
    if (appt!.doctor_id !== user.id) fail(403, 'Sólo el médico asignado puede firmar esta consulta.')
    if (['done', 'cancelled', 'no_show'].includes(String(appt!.status))) fail(409, 'Esta cita ya está cerrada.')
    const patientId = String(appt!.patient_id)
    const name = await patientName(patientId)
    const consultId = randomUUID()
    const rxId = c.items.length ? randomUUID() : null
    const now = new Date()
    let folio: string | null = null
    if (rxId) await assertRxIdentity(cid, patientId)
    await sql.tx(async (q) => {
      // El candado del folio también evita que la misma cita se firme dos veces al mismo tiempo
      if (rxId) folio = await nextFolio(q, cid, now)
      else await q.run('SELECT pg_advisory_xact_lock(hashtext(?))', [`rx:${cid}`])
      const closed = await q.one(`SELECT 1 FROM appointments WHERE id = ? AND status = 'done'`, [c.appointmentId])
      if (closed) fail(409, 'Esta cita ya está cerrada.')
      if (rxId) {
        await q.run(`INSERT INTO prescriptions (id,folio,patient_id,doctor_id,consultation_id,issued_at,items,clinic_id) VALUES (?,?,?,?,?,?,?,?)`,
          [rxId, folio, patientId, user.id, consultId, now.toISOString(), JSON.stringify(c.items), cid])
      }
      await q.run(`INSERT INTO consultations (id,patient_id,doctor_id,appointment_id,date,reason,symptoms,symptom_onset,history,exam,diagnoses,plan,vitals_id,prescription_id,orders,observations,clinic_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [consultId, patientId, user.id, c.appointmentId, now.toISOString(), c.reason, JSON.stringify(c.symptoms), c.symptomOnset ?? null,
          c.history, c.exam, JSON.stringify(c.diagnoses), c.orders.map((o, i) => `${i + 1}. ${o}`).join('\n'), c.vitalsId ?? null, rxId, JSON.stringify(c.orders), c.observations, cid])
      await q.run(`UPDATE appointments SET status = 'done' WHERE id = ?`, [c.appointmentId])
      for (const f of c.followups) await insertFollowup(q, cid, user.id, { ...f, patientId })
      await audit(user, rxId ? `Firmó consulta y receta ${folio} de ${name}` : `Firmó consulta de ${name}`, q)
    })
    res.status(201).json({ consultationId: consultId, prescriptionId: rxId, folio })
  })

  app.get('/api/consultations/:id', auth, need('chart.view'), async (req, res) => {
    const cid = clinicOf(req)
    const row = (await sql.one('SELECT * FROM consultations WHERE id = ? AND clinic_id = ?', [String(req.params.id), cid])) ?? fail(404, 'La consulta no existe.')
    const c = toConsultation(row!)
    const vitals = c.vitalsId ? await sql.one('SELECT * FROM vitals WHERE id = ? AND clinic_id = ?', [c.vitalsId, cid]) : undefined
    const what = req.query.purpose === 'certificate' ? 'Emitió constancia médica de' : 'Abrió la nota de consulta de'
    await audit(userOf(req), `${what} ${await patientName(c.patientId)}`)
    res.json({ consultation: c, patient: toPatient((await patientRow(cid, c.patientId))!, true), vitals: vitals ? toVitals(vitals) : null })
  })

  app.get('/api/prescriptions/:id', auth, need('rx.view'), async (req, res) => {
    const cid = clinicOf(req)
    const row = (await sql.one('SELECT * FROM prescriptions WHERE id = ? AND clinic_id = ?', [String(req.params.id), cid])) ?? fail(404, 'La receta no existe.')
    const rx = toPrescription(row!)
    const cons = await sql.one('SELECT * FROM consultations WHERE id = ? AND clinic_id = ?', [rx.consultationId, cid])
    const hosp = rx.hospitalizationId ? await sql.one('SELECT * FROM hospitalizations WHERE id = ? AND clinic_id = ?', [rx.hospitalizationId, cid]) : undefined
    const patient = toPatient((await patientRow(cid, rx.patientId))!, true)
    await audit(userOf(req), `Abrió la receta ${rx.folio}`)
    res.json({ prescription: rx, consultation: cons ? toConsultation(cons) : null, hospitalization: hosp ? toHospitalization(hosp) : null, patient })
  })

  // ---------- Personal ----------

  app.post('/api/staff', auth, need('staff.manage'), async (req, res) => {
    const s = parse(z.object({
      name: z.string().trim().min(3, 'Escribe el nombre completo.'),
      role: z.enum(ROLES),
      email: z.string().trim().email('El correo no es válido.'),
      specialty: z.string().trim().optional(),
      license: z.string().trim().optional(),
    }), req.body)
    const { user: created, password } = await createStaffMember(sql, clinicOf(req), s)
    await audit(userOf(req), `Creó el usuario ${s.name} (${s.role})`)
    res.status(201).json({ user: created, password })
  })

  app.patch('/api/staff/:id', auth, need('staff.manage'), async (req, res) => {
    const me = userOf(req)
    const row = (await clinicStaffRow(clinicOf(req), String(req.params.id))) ?? fail(404, 'El usuario no existe.')
    const b = parse(z.object({
      active: z.boolean().optional(),
      role: z.enum(ROLES).optional(),
      twoFactor: z.literal(false).optional(),
      specialty: z.string().trim().optional(),
      license: z.string().trim().optional(),
      serviceId: z.string().optional(),
      schedule: z.object({
        days: z.array(z.number().int().min(0).max(6)).min(1, 'Elige al menos un día de atención.'),
        start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/),
        slot: z.number().int().refine((n) => [15, 20, 30, 45, 60].includes(n), 'La duración de cita no es válida.'),
      }).refine((s) => s.start < s.end, 'La hora de salida debe ser después de la de entrada.').optional(),
    }), req.body)
    const id = String(row!.id)
    if (id === me.id && (b.active === false || (b.role && b.role !== me.role))) fail(400, 'No puedes desactivar ni cambiar el rol de tu propia cuenta.')
    const changes: string[] = []
    await sql.tx(async (q) => {
      if (b.active !== undefined) { await q.run('UPDATE staff SET active = ?, token_version = token_version + 1 WHERE id = ?', [b.active, id]); changes.push(b.active ? 'Reactivó a' : 'Desactivó a') }
      if (b.role) { await q.run('UPDATE staff SET role = ?, token_version = token_version + 1 WHERE id = ?', [b.role, id]); changes.push('Cambió el rol de') }
      if (b.twoFactor === false) { await q.run('UPDATE staff SET totp_enabled = FALSE, totp_secret = NULL WHERE id = ?', [id]); changes.push('Quitó la verificación en dos pasos de') }
      if (b.specialty !== undefined) await q.run('UPDATE staff SET specialty = ? WHERE id = ?', [b.specialty || null, id])
      if (b.license !== undefined) await q.run('UPDATE staff SET license = ? WHERE id = ?', [b.license || null, id])
      if (b.serviceId !== undefined) await q.run('UPDATE staff SET service_id = ? WHERE id = ?', [b.serviceId || null, id])
      if (b.schedule) { await q.run('UPDATE staff SET schedule = ? WHERE id = ?', [JSON.stringify(b.schedule), id]); changes.push('Actualizó el horario de') }
    })
    await audit(me, `${changes[0] ?? 'Actualizó los datos de'} ${row!.name}`)
    res.json(toStaff((await staffRow(id))!))
  })

  app.post('/api/staff/:id/reset-password', auth, need('staff.manage'), async (req, res) => {
    const row = (await clinicStaffRow(clinicOf(req), String(req.params.id))) ?? fail(404, 'El usuario no existe.')
    const password = tempPassword()
    await sql.run('UPDATE staff SET password_hash = ?, token_version = token_version + 1 WHERE id = ?', [bcrypt.hashSync(password, 10), String(row!.id)])
    await audit(userOf(req), `Restableció la contraseña de ${row!.name}`)
    res.json({ password })
  })

  app.post('/api/admin/reset-demo', auth, need('platform.manage'), async (req, res) => {
    if (!demoMode) fail(403, 'Esta acción sólo está disponible en modo demo.')
    const me = userOf(req)
    await resetDemo(sql)
    await audit(me, 'Restableció los datos de demo')
    res.json({ ok: true })
  })

  registerSettings(app, ctx)
  registerPublic(app, ctx)
  registerBilling(app, ctx)
  registerReports(app, ctx)
  registerFiles(app, ctx)
  registerPlatform(app, ctx)
  registerInpatient(app, ctx)
  registerFollowups(app, ctx)

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Ruta no encontrada.')))

  // ---------- Frontend compilado (servidor propio; en Vercel lo sirve la plataforma) ----------
  if (opts.staticDir && existsSync(opts.staticDir)) {
    app.use(express.static(opts.staticDir, { index: false, maxAge: '1h' }))
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(join(opts.staticDir!, 'index.html')))
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    void _next
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message })
    const e = err as { type?: string }
    if (e?.type === 'entity.too.large') return res.status(413).json({ error: 'El archivo es demasiado grande. El máximo es 3 MB.' })
    if (err instanceof SyntaxError) return res.status(400).json({ error: 'La solicitud no es válida.' })
    console.error(err)
    res.status(500).json({ error: 'Ocurrió un error en el servidor. Inténtalo de nuevo.' })
  })

  return app
}

export const tempPassword = () => randomBytes(6).toString('base64url')

/** Crea un usuario dentro de una clínica y devuelve su contraseña temporal. */
export async function createStaffMember(sql: Sql, clinicId: string, s: { name: string; role: (typeof ROLES)[number]; email: string; specialty?: string; license?: string }) {
  if (s.role === 'doctor' && !s.license) fail(400, 'Para un médico escribe su número de colegiación.')
  if (await sql.one('SELECT 1 FROM staff WHERE lower(email) = lower(?)', [s.email])) fail(409, 'Ya existe un usuario con ese correo.')
  const id = randomUUID()
  const password = tempPassword()
  const count = Number((await sql.one<{ n: number }>('SELECT COUNT(*)::int AS n FROM staff WHERE clinic_id = ?', [clinicId]))!.n)
  const service = s.role === 'doctor' ? await sql.one(`SELECT id FROM services WHERE clinic_id = ? AND active ORDER BY name LIMIT 1`, [clinicId]) : undefined
  const schedule = s.role === 'doctor' ? JSON.stringify({ days: [1, 2, 3, 4, 5], start: '08:00', end: '17:00', slot: 30 }) : null
  await sql.run(`INSERT INTO staff (id,name,role,specialty,email,license,color,active,password_hash,schedule,service_id,clinic_id) VALUES (?,?,?,?,?,?,?,TRUE,?,?,?,?)`,
    [id, s.name, s.role, s.specialty || null, s.email, s.license || null, COLORS[count % COLORS.length], bcrypt.hashSync(password, 10),
      schedule, service ? String(service.id) : null, clinicId])
  return { user: toStaff((await sql.one('SELECT * FROM staff WHERE id = ?', [id]))!), password }
}

export const CLINIC_ROLES = ROLES

/** Traduce los errores de conexión más comunes a un mensaje que indica qué revisar. */
export function describeDbError(e: unknown) {
  const err = e as { code?: string; message?: string }
  switch (err?.code) {
    case 'NO_DATABASE_URL': return 'Falta la variable DATABASE_URL en Vercel, o se agregó después del último deploy. Agrégala y vuelve a desplegar.'
    case '28P01': return 'Neon rechazó la contraseña de DATABASE_URL. Copia de nuevo la cadena de conexión y vuelve a desplegar.'
    case '3D000': return 'La base de datos indicada en DATABASE_URL no existe en Neon.'
    case 'ENOTFOUND': case 'EAI_AGAIN': return 'No se encontró el servidor de la base de datos. Revisa que DATABASE_URL esté completa.'
    case 'ECONNREFUSED': case 'ETIMEDOUT': return 'No se pudo conectar a la base de datos. Revisa que el proyecto de Neon esté activo.'
    case 'EROFS': case 'ENOENT': case 'EACCES': return 'No hay una base de datos configurada en este servidor. Define DATABASE_URL.'
    default: return `No se pudo usar la base de datos: ${err?.message ?? 'error desconocido'}`
  }
}

/** Sin JWT_SECRET en el entorno, genera uno y lo guarda en la base para que todas las instancias lo compartan. */
async function persistentSecret(sql: Sql) {
  const fresh = randomBytes(48).toString('hex')
  await sql.run(`INSERT INTO meta (key, value) VALUES ('jwt_secret', ?) ON CONFLICT (key) DO NOTHING`, [fresh])
  return String((await sql.one(`SELECT value FROM meta WHERE key = 'jwt_secret'`))!.value)
}
