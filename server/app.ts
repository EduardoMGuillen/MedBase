import express, { type NextFunction, type Request, type Response } from 'express'
import cookieParser from 'cookie-parser'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import QRCode from 'qrcode'
import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { attempts, createPatient, DEMO_PASSWORD, ensureDb, hit, resetDemo } from './db.js'
import type { Sql } from './sql.js'
import { type Ctx, fail, HttpError, localDate, parse, type Row } from './http.js'
import { toAppointment, toAudit, toConsultation, toPatient, toPrescription, toService, toStaff, toVitals } from './mappers.js'
import { newSecret, otpauthUrl, verifyTotp } from './totp.js'
import { registerSettings } from './routes/settings.js'
import { registerPublic } from './routes/public.js'
import { registerBilling } from './routes/billing.js'
import { registerReports } from './routes/reports.js'
import { registerFiles } from './routes/files.js'
import { can, ROLE_PERMISSIONS, type Permission } from '../src/lib/permissions.js'
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

  const audit = async (userId: string, action: string, q: Sql = sql) => {
    await q.run('INSERT INTO audit (at, user_id, action) VALUES (?, ?, ?)', [new Date().toISOString(), userId, action])
  }
  const staffRow = (id: string) => sql.one('SELECT * FROM staff WHERE id = ?', [id])
  const patientRow = (id: string) => sql.one('SELECT * FROM patients WHERE id = ?', [id])
  const apptRow = (id: string) => sql.one('SELECT * FROM appointments WHERE id = ?', [id])
  const patientName = async (id: string) => { const p = await patientRow(id); return p ? `${p.first_name} ${p.last_name}` : id }
  const settings = async () => Object.fromEntries((await sql.query('SELECT key, value FROM settings'))
    .map((r) => [String(r.key), JSON.parse(String(r.value))]))

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
    const row = await staffRow(payload.sub)
    if (!row || !row.active || Number(row.token_version) !== payload.v) return null
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

  const ctx: Ctx = { sql, demoMode, auth, need, userOf, audit, patientName, staffRow, patientRow, apptRow, assertFree, settings }

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
    if (row!.totp_enabled) {
      if (!body.code) return res.json({ twoFactor: true })
      if (!verifyTotp(String(row!.totp_secret), body.code)) {
        await hit(sql, key, 5 * 60_000)
        fail(401, 'El código no es válido o ya expiró. Usa el que muestra tu app ahora.')
      }
    }
    await sql.run('DELETE FROM rate_limits WHERE key = ?', [key])
    issue(res, row!)
    await audit(String(row!.id), 'Inició sesión')
    res.json(session(row!))
  })

  app.post('/api/auth/logout', async (req, res) => {
    const user = await authenticate(req)
    if (user) await audit(user.id, 'Cerró sesión')
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
    await audit(user.id, 'Cambió su contraseña')
    res.json({ ok: true })
  })

  // Doble factor: configurar genera un secreto pendiente; se activa al confirmar un código válido
  app.post('/api/auth/2fa/setup', auth, async (req, res) => {
    const user = userOf(req)
    const s = newSecret()
    await sql.run('UPDATE staff SET totp_secret = ? WHERE id = ? AND NOT totp_enabled', [s, user.id])
    const url = otpauthUrl(s, user.email, String((await settings()).name ?? 'Clinara'))
    res.json({ secret: s, qr: await QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#0e2233', light: '#ffffff' } }) })
  })

  app.post('/api/auth/2fa/enable', auth, async (req, res) => {
    const { code } = parse(z.object({ code: z.string() }), req.body, 'Escribe el código de 6 dígitos.')
    const user = userOf(req)
    const row = (await staffRow(user.id))!
    if (!row.totp_secret) fail(400, 'Primero genera el código QR.')
    if (!verifyTotp(String(row.totp_secret), code)) fail(400, 'El código no coincide. Revisa que la hora de tu teléfono sea correcta e inténtalo con el código actual.')
    await sql.run('UPDATE staff SET totp_enabled = TRUE WHERE id = ?', [user.id])
    await audit(user.id, 'Activó la verificación en dos pasos')
    res.json({ ok: true })
  })

  app.post('/api/auth/2fa/disable', auth, async (req, res) => {
    const { password } = parse(z.object({ password: z.string().min(1) }), req.body, 'Escribe tu contraseña.')
    const user = userOf(req)
    if (!bcrypt.compareSync(password, String((await staffRow(user.id))!.password_hash))) fail(400, 'La contraseña no es correcta.')
    await sql.run('UPDATE staff SET totp_enabled = FALSE, totp_secret = NULL WHERE id = ?', [user.id])
    await audit(user.id, 'Desactivó la verificación en dos pasos')
    res.json({ ok: true })
  })

  app.get('/api/demo-accounts', async (_req, res) => {
    if (!demoMode) return res.json({ accounts: [], password: null })
    const rows = await sql.query(`SELECT * FROM staff WHERE active AND email LIKE '%@demo.clinara' ORDER BY CASE role WHEN 'doctor' THEN 0 WHEN 'nurse' THEN 1 WHEN 'reception' THEN 2 ELSE 3 END, name`)
    res.json({ accounts: rows.map(toStaff), password: DEMO_PASSWORD })
  })

  // ---------- Datos iniciales según el rol ----------
  app.get('/api/bootstrap', auth, async (req, res) => {
    const user = userOf(req)
    const clinical = can(user.role, 'chart.view')
    const billing = can(user.role, 'billing.manage')
    const since = new Date(); since.setDate(since.getDate() - 90)
    const [staff, patients, appts, prescriptions, auditLog, vitals, services, cfg] = await Promise.all([
      sql.query('SELECT * FROM staff ORDER BY name'),
      sql.query('SELECT * FROM patients ORDER BY last_name'),
      // Ventana de agenda: 90 días atrás y todo lo futuro
      sql.query(`SELECT a.*, EXISTS(SELECT 1 FROM payments p WHERE p.appointment_id = a.id AND NOT p.voided) AS paid
        FROM appointments a WHERE a.start >= ? ORDER BY a.start`, [localDate(since)]),
      can(user.role, 'rx.view') ? sql.query('SELECT * FROM prescriptions ORDER BY issued_at DESC LIMIT 500') : Promise.resolve([]),
      can(user.role, 'audit.view') ? sql.query('SELECT * FROM audit ORDER BY id DESC LIMIT 500') : Promise.resolve([]),
      clinical ? sql.query(`SELECT v.* FROM vitals v JOIN appointments a ON a.id = v.appointment_id WHERE a.start LIKE ?`, [`${localDate(new Date())}%`]) : Promise.resolve([]),
      sql.query('SELECT * FROM services ORDER BY name'),
      settings(),
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
  })

  app.post('/api/patients', auth, need('patients.manage'), async (req, res) => {
    const p = parse(patientBody, req.body)
    const id = await createPatient(sql, p)
    const record = String((await patientRow(id))!.record)
    await audit(userOf(req).id, `Registró al paciente ${p.firstName} ${p.lastName} (${record})`)
    res.status(201).json({ id, record })
  })

  app.patch('/api/patients/:id', auth, need('patients.manage', 'chart.view'), async (req, res) => {
    const user = userOf(req)
    const row = (await patientRow(String(req.params.id))) ?? fail(404, 'El paciente no existe.')
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
    if (sets.length) await sql.run(`UPDATE patients SET ${sets.join(', ')} WHERE id = ?`, [...vals, String(row!.id)])
    await audit(user.id, `Actualizó la ficha de ${row!.first_name} ${row!.last_name}`)
    res.json(toPatient((await patientRow(String(row!.id)))!, can(user.role, 'chart.view')))
  })

  app.get('/api/patients/:id/chart', auth, need('chart.view'), async (req, res) => {
    const id = String(req.params.id)
    ;(await patientRow(id)) ?? fail(404, 'El paciente no existe.')
    const [vitals, consultations, prescriptions] = await Promise.all([
      sql.query('SELECT * FROM vitals WHERE patient_id = ? ORDER BY taken_at DESC', [id]),
      sql.query('SELECT * FROM consultations WHERE patient_id = ? ORDER BY date DESC', [id]),
      sql.query('SELECT * FROM prescriptions WHERE patient_id = ? ORDER BY issued_at DESC', [id]),
    ])
    await audit(userOf(req).id, `Consultó el expediente de ${await patientName(id)}`)
    res.json({ vitals: vitals.map(toVitals), consultations: consultations.map(toConsultation), prescriptions: prescriptions.map(toPrescription) })
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

  app.post('/api/appointments', auth, need('agenda.manage'), async (req, res) => {
    const a = parse(apptBody, req.body)
    const start = a.start.length === 16 ? `${a.start}:00` : a.start
    ;(await patientRow(a.patientId)) ?? fail(400, 'El paciente no existe.')
    const doc = await staffRow(a.doctorId)
    if (!doc || doc.role !== 'doctor' || !doc.active) fail(400, 'El médico elegido no está disponible.')
    await assertFree(a.doctorId, start, a.minutes)
    const id = randomUUID()
    await sql.run(`INSERT INTO appointments (id,patient_id,doctor_id,start,minutes,reason,type,status,source) VALUES (?,?,?,?,?,?,?, 'scheduled', 'staff')`,
      [id, a.patientId, a.doctorId, start, a.minutes, a.reason, a.type])
    await audit(userOf(req).id, `Agendó cita de ${await patientName(a.patientId)} con ${doc!.name} el ${start.slice(0, 10)} a las ${start.slice(11, 16)}`)
    res.status(201).json(toAppointment((await apptRow(id))!))
  })

  app.patch('/api/appointments/:id', auth, need('agenda.manage'), async (req, res) => {
    const row = (await apptRow(String(req.params.id))) ?? fail(404, 'La cita no existe.')
    if (!['scheduled', 'confirmed'].includes(String(row!.status))) fail(409, 'Sólo se pueden reprogramar citas que aún no empiezan.')
    const b = parse(apptBody.pick({ doctorId: true, start: true, minutes: true, reason: true }).partial(), req.body)
    const next = {
      doctorId: b.doctorId ?? String(row!.doctor_id),
      start: b.start ? (b.start.length === 16 ? `${b.start}:00` : b.start) : String(row!.start),
      minutes: b.minutes ?? Number(row!.minutes),
      reason: b.reason ?? String(row!.reason),
    }
    await assertFree(next.doctorId, next.start, next.minutes, String(row!.id))
    await sql.run('UPDATE appointments SET doctor_id = ?, start = ?, minutes = ?, reason = ?, status = ?, reminded_at = NULL WHERE id = ?',
      [next.doctorId, next.start, next.minutes, next.reason, 'scheduled', String(row!.id)])
    await audit(userOf(req).id, `Reprogramó la cita de ${await patientName(String(row!.patient_id))} al ${next.start.slice(0, 10)} ${next.start.slice(11, 16)}`)
    res.json(toAppointment((await apptRow(String(row!.id)))!))
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
    const row = (await apptRow(String(req.params.id))) ?? fail(404, 'La cita no existe.')
    const t = TRANSITIONS[status]!
    if (!can(user.role, t.perm)) fail(403, 'Tu rol no tiene permiso para esta acción.')
    if (row!.status === status) return res.json(toAppointment(row!))
    if (!t.from.includes(row!.status as ApptStatus)) fail(409, 'La cita ya avanzó a otra etapa. Actualiza la página.')
    if (status === 'in_consult' && row!.doctor_id !== user.id) fail(403, 'Sólo el médico asignado puede atender esta cita.')
    await sql.run('UPDATE appointments SET status = ?, arrived_at = COALESCE(?, arrived_at) WHERE id = ?',
      [status, status === 'arrived' ? new Date().toISOString() : null, String(row!.id)])
    await audit(user.id, `${t.label} la cita de ${await patientName(String(row!.patient_id))}`)
    res.json(toAppointment((await apptRow(String(row!.id)))!))
  })

  app.post('/api/appointments/:id/reminded', auth, need('agenda.manage', 'checkin.manage'), async (req, res) => {
    const row = (await apptRow(String(req.params.id))) ?? fail(404, 'La cita no existe.')
    await sql.run('UPDATE appointments SET reminded_at = ? WHERE id = ?', [new Date().toISOString(), String(row!.id)])
    await audit(userOf(req).id, `Envió recordatorio por WhatsApp a ${await patientName(String(row!.patient_id))}`)
    res.json(toAppointment((await apptRow(String(row!.id)))!))
  })

  // ---------- Triaje ----------
  app.post('/api/vitals', auth, need('vitals.record'), async (req, res) => {
    const user = userOf(req)
    const n = (min: number, max: number, label: string) => z.number({ error: `Escribe ${label}.` }).min(min, `Revisa ${label}.`).max(max, `Revisa ${label}.`)
    const v = parse(z.object({
      patientId: z.string(), appointmentId: z.string().optional(),
      systolic: n(50, 260, 'la presión sistólica'), diastolic: n(30, 160, 'la presión diastólica'),
      heartRate: n(25, 250, 'la frecuencia cardíaca'), temperature: n(32, 43, 'la temperatura'), spo2: n(50, 100, 'la saturación'),
      weightKg: z.number().min(0).max(400).default(0), heightCm: z.number().min(0).max(250).default(0),
      painScale: z.number().int().min(0).max(10).optional(), notes: z.string().max(2000).optional(),
    }), req.body)
    ;(await patientRow(v.patientId)) ?? fail(404, 'El paciente no existe.')
    if (v.appointmentId) {
      const a = await apptRow(v.appointmentId)
      if (!a || a.patient_id !== v.patientId) fail(400, 'La cita no corresponde a este paciente.')
    }
    const id = randomUUID()
    const name = await patientName(v.patientId)
    await sql.tx(async (q) => {
      await q.run(`INSERT INTO vitals (id,patient_id,appointment_id,taken_by,taken_at,systolic,diastolic,heart_rate,temperature,spo2,weight_kg,height_cm,pain_scale,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, v.patientId, v.appointmentId ?? null, user.id, new Date().toISOString(), v.systolic, v.diastolic, v.heartRate, v.temperature, v.spo2,
          v.weightKg, v.heightCm, v.painScale ?? null, v.notes || null])
      if (v.appointmentId) await q.run(`UPDATE appointments SET status = 'triaged' WHERE id = ? AND status = 'arrived'`, [v.appointmentId])
      await audit(user.id, `Registró signos vitales de ${name}`, q)
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
      plan: z.string().default(''),
      vitalsId: z.string().optional(),
      items: z.array(z.object({
        drug: z.string().trim().min(1), presentation: z.string().default(''), dose: z.string().trim().min(1, 'Escribe la dosis.'),
        frequency: z.string().min(1), duration: z.string().trim().min(1, 'Escribe la duración.'), instructions: z.string().optional(),
      })).default([]),
    }), req.body)
    const appt = (await apptRow(c.appointmentId)) ?? fail(404, 'La cita no existe.')
    if (appt!.doctor_id !== user.id) fail(403, 'Sólo el médico asignado puede firmar esta consulta.')
    if (['done', 'cancelled', 'no_show'].includes(String(appt!.status))) fail(409, 'Esta cita ya está cerrada.')
    const patientId = String(appt!.patient_id)
    const name = await patientName(patientId)
    const cid = randomUUID()
    const rxId = c.items.length ? randomUUID() : null
    const now = new Date()
    let folio: string | null = null
    await sql.tx(async (q) => {
      // Evita que dos médicos tomen el mismo folio al mismo tiempo
      await q.run('SELECT pg_advisory_xact_lock(7272742)')
      const closed = await q.one(`SELECT 1 FROM appointments WHERE id = ? AND status = 'done'`, [c.appointmentId])
      if (closed) fail(409, 'Esta cita ya está cerrada.')
      if (rxId) {
        const year = now.getFullYear()
        const last = await q.one(`SELECT folio FROM prescriptions WHERE folio LIKE ? ORDER BY folio DESC LIMIT 1`, [`RX-${year}-%`])
        const seq = last ? Number(String(last.folio).split('-')[2]) + 1 : 1001
        folio = `RX-${year}-${String(seq).padStart(4, '0')}`
        await q.run(`INSERT INTO prescriptions (id,folio,patient_id,doctor_id,consultation_id,issued_at,items) VALUES (?,?,?,?,?,?,?)`,
          [rxId, folio, patientId, user.id, cid, now.toISOString(), JSON.stringify(c.items)])
      }
      await q.run(`INSERT INTO consultations (id,patient_id,doctor_id,appointment_id,date,reason,symptoms,symptom_onset,history,exam,diagnoses,plan,vitals_id,prescription_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [cid, patientId, user.id, c.appointmentId, now.toISOString(), c.reason, JSON.stringify(c.symptoms), c.symptomOnset ?? null,
          c.history, c.exam, JSON.stringify(c.diagnoses), c.plan, c.vitalsId ?? null, rxId])
      await q.run(`UPDATE appointments SET status = 'done' WHERE id = ?`, [c.appointmentId])
      await audit(user.id, rxId ? `Firmó consulta y receta ${folio} de ${name}` : `Firmó consulta de ${name}`, q)
    })
    res.status(201).json({ consultationId: cid, prescriptionId: rxId, folio })
  })

  app.get('/api/consultations/:id', auth, need('consult.write'), async (req, res) => {
    const row = (await sql.one('SELECT * FROM consultations WHERE id = ?', [String(req.params.id)])) ?? fail(404, 'La consulta no existe.')
    const c = toConsultation(row!)
    await audit(userOf(req).id, `Emitió constancia médica de ${await patientName(c.patientId)}`)
    res.json({ consultation: c, patient: toPatient((await patientRow(c.patientId))!, true) })
  })

  app.get('/api/prescriptions/:id', auth, need('rx.view'), async (req, res) => {
    const row = (await sql.one('SELECT * FROM prescriptions WHERE id = ?', [String(req.params.id)])) ?? fail(404, 'La receta no existe.')
    const rx = toPrescription(row!)
    const cons = await sql.one('SELECT * FROM consultations WHERE id = ?', [rx.consultationId])
    const patient = toPatient((await patientRow(rx.patientId))!, true)
    await audit(userOf(req).id, `Abrió la receta ${rx.folio}`)
    res.json({ prescription: rx, consultation: cons ? toConsultation(cons) : null, patient })
  })

  // ---------- Personal ----------
  const tempPassword = () => randomBytes(6).toString('base64url')

  app.post('/api/staff', auth, need('staff.manage'), async (req, res) => {
    const s = parse(z.object({
      name: z.string().trim().min(3, 'Escribe el nombre completo.'),
      role: z.enum(ROLES),
      email: z.string().trim().email('El correo no es válido.'),
      specialty: z.string().trim().optional(),
      license: z.string().trim().optional(),
    }), req.body)
    if (s.role === 'doctor' && !s.license) fail(400, 'Para un médico escribe su número de colegiación.')
    if (await sql.one('SELECT 1 FROM staff WHERE lower(email) = lower(?)', [s.email])) fail(409, 'Ya existe un usuario con ese correo.')
    const id = randomUUID()
    const password = tempPassword()
    const count = Number((await sql.one<{ n: number }>('SELECT COUNT(*)::int AS n FROM staff'))!.n)
    const schedule = s.role === 'doctor' ? JSON.stringify({ days: [1, 2, 3, 4, 5], start: '08:00', end: '17:00', slot: 30 }) : null
    await sql.run(`INSERT INTO staff (id,name,role,specialty,email,license,color,active,password_hash,schedule,service_id) VALUES (?,?,?,?,?,?,?,TRUE,?,?,?)`,
      [id, s.name, s.role, s.specialty || null, s.email, s.license || null, COLORS[count % COLORS.length], bcrypt.hashSync(password, 10),
        schedule, s.role === 'doctor' ? 'svc-gen' : null])
    await audit(userOf(req).id, `Creó el usuario ${s.name} (${s.role})`)
    res.status(201).json({ user: toStaff((await staffRow(id))!), password })
  })

  app.patch('/api/staff/:id', auth, need('staff.manage'), async (req, res) => {
    const me = userOf(req)
    const row = (await staffRow(String(req.params.id))) ?? fail(404, 'El usuario no existe.')
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
    await audit(me.id, `${changes[0] ?? 'Actualizó los datos de'} ${row!.name}`)
    res.json(toStaff((await staffRow(id))!))
  })

  app.post('/api/staff/:id/reset-password', auth, need('staff.manage'), async (req, res) => {
    const row = (await staffRow(String(req.params.id))) ?? fail(404, 'El usuario no existe.')
    const password = tempPassword()
    await sql.run('UPDATE staff SET password_hash = ?, token_version = token_version + 1 WHERE id = ?', [bcrypt.hashSync(password, 10), String(row!.id)])
    await audit(userOf(req).id, `Restableció la contraseña de ${row!.name}`)
    res.json({ password })
  })

  app.post('/api/admin/reset-demo', auth, need('staff.manage'), async (req, res) => {
    if (!demoMode) fail(403, 'Esta acción sólo está disponible en modo demo.')
    const me = userOf(req)
    await resetDemo(sql)
    await audit(me.id, 'Restableció los datos de demo')
    res.json({ ok: true })
  })

  registerSettings(app, ctx)
  registerPublic(app, ctx)
  registerBilling(app, ctx)
  registerReports(app, ctx)
  registerFiles(app, ctx)

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
