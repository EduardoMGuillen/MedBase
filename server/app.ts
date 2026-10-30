import express, { type NextFunction, type Request, type Response } from 'express'
import cookieParser from 'cookie-parser'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import QRCode from 'qrcode'
import { randomBytes, randomUUID } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { attempts, completePendingPatient, createPatient, createPendingPatient, DEMO_PASSWORD, ensureDb, hit, nextFolio, resetDemo } from './db.js'
import type { Sql } from './sql.js'
import { type Ctx, fail, hasRoleSql, HttpError, localDate, parse, type Row } from './http.js'
import {
  clinicSettings, rolesOf, toAppointment, toAudit, toBed, toClinicDrug, toConsultation, toFollowup, toHospitalization, toPatient, toPrescription, toService, toStaff, toVitals,
} from './mappers.js'
import { newSecret, otpauthUrl, verifyTotp } from './totp.js'
import { rxValidityOf, specialtyOf, validityInput } from './prefs.js'
import { registerSettings } from './routes/settings.js'
import { currentMarks, registerMe } from './routes/me.js'
import { addendaFor, registerNotes } from './routes/notes.js'
import { examInput, insertExams, registerExams } from './routes/exams.js'
import { registerPublic } from './routes/public.js'
import { registerBilling } from './routes/billing.js'
import { registerReports } from './routes/reports.js'
import { registerFiles } from './routes/files.js'
import { registerPlatform } from './routes/platform.js'
import { pendingOrders, registerInpatient } from './routes/inpatient.js'
import { syncStayOrders } from './medOrders.js'
import { ensureHospitalAuthorization, refreshPendingAuthorizationsForPatient } from './authorizations.js'
import { createIcdClient, icdConfigFromEnv, type IcdClient } from './icd.js'
import { localRelease, searchLocal } from './icdLocal.js'
import { diagnosisInput } from './http.js'
import { registerDrugs } from './routes/drugs.js'
import { registerCertificates } from './routes/certificates.js'
import { registerReferrals } from './routes/referrals.js'
import { registerConsent } from './routes/consent.js'
import { registerOrderSets } from './routes/orderSets.js'
import { registerEpicrisis } from './routes/epicrisis.js'
import { followupInput, insertFollowup, registerFollowups, sweepFollowupReminders } from './routes/followups.js'
import { can, permissionsFor, ROLE_LABEL, ROLES_BY_KIND, VIEW_LABEL, type Permission } from '../src/lib/permissions.js'
import { yearsOld } from '../src/lib/inpatient.js'
import { normalizeDni } from '../src/lib/format.js'
import { AUDIT_KINDS, auditKind, type AuditKind } from '../src/lib/audit.js'
import { hasBlank, medHasBlank } from '../src/lib/orderSets.js'
import { DAY_NAMES_PLURAL, rangesOn, scheduleFromWeek, scheduleProblems, SLOT_OPTIONS, weekday, weekOf, withinSchedule } from '../src/lib/schedule.js'
import type { ApptStatus, Staff } from '../src/lib/types.js'

export interface AppOptions {
  sql: Sql
  jwtSecret?: string
  demoMode?: boolean
  secureCookies?: boolean
  staticDir?: string
  /** Búsqueda CIE-11 de la OMS; en las pruebas se pasa una falsa. */
  icd?: IcdClient
}

const COOKIE = 'clinara_session'
const SESSION_HOURS = 10

interface AuthedRequest extends Request { user: Staff }

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

const COLORS = ['#2335C9', '#0F8A6E', '#B4407A', '#C27A12', '#6A4BC4', '#2C7DA0', '#5B6472']
const ROLES = ['admin', 'doctor', 'nurse', 'reception', 'assistant'] as const

export function createApp(opts: AppOptions) {
  const { sql } = opts
  const demoMode = opts.demoMode ?? true
  let secret = opts.jwtSecret
  const app = express()

  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  // Los adjuntos traen su propio parser con un límite mayor
  const smallJson = express.json({ limit: '200kb' })
  // También la firma en pantalla (imágenes de las firmas) y las partes de un archivo grande
  app.use((req, res, next) => (/\/(attachments|sign|signature|parts|import)$/.test(req.path) ? next() : smallJson(req, res, next)))
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

  /**
   * AD7: cada petición recuerda el último paciente que consultó (por su nombre o su ficha), y la bitácora lo guarda con
   * la acción. Así cada registro sabe de qué paciente fue sin repetirlo en cada ruta.
   */
  const reqPatient = new AsyncLocalStorage<{ patientId?: string }>()
  app.use('/api', (_req, _res, next) => reqPatient.run({}, next))
  const seen = (id: unknown) => { const s = reqPatient.getStore(); if (s && id) s.patientId = String(id) }

  /** Registra una acción en la bitácora, ligada a la clínica de quien la hizo, con su rol (AD5), su paciente y su tipo (AD7). */
  const audit = async (actor: { id: string; clinicId?: string | null; role?: string }, action: string, q: Sql = sql, patientId?: string) => {
    await q.run('INSERT INTO audit (at, user_id, action, clinic_id, role, patient_id, kind) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [new Date().toISOString(), actor.id, action, actor.clinicId ?? null, actor.role ?? null, patientId ?? reqPatient.getStore()?.patientId ?? null, auditKind(action)])
  }
  const staffRow = (id: string) => sql.one('SELECT * FROM staff WHERE id = ?', [id])
  // Todo lo que pertenece a una clínica se busca siempre junto con la clínica de quien pregunta
  const clinicStaffRow = (cid: string, id: string) => sql.one('SELECT * FROM staff WHERE id = ? AND clinic_id = ?', [id, cid])
  const patientRow = async (cid: string, id: string) => { const r = await sql.one('SELECT * FROM patients WHERE id = ? AND clinic_id = ?', [id, cid]); if (r) seen(r.id); return r }
  const apptRow = async (cid: string, id: string) => { const r = await sql.one('SELECT * FROM appointments WHERE id = ? AND clinic_id = ?', [id, cid]); if (r) seen(r.patient_id); return r }
  const patientName = async (id: string) => { const p = await sql.one('SELECT first_name, last_name FROM patients WHERE id = ?', [id]); if (p) seen(id); return p ? `${p.first_name} ${p.last_name}` : id }
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
    const row = await sql.one(`SELECT s.*, c.active AS clinic_active, c.kind AS clinic_kind FROM staff s LEFT JOIN clinics c ON c.id = s.clinic_id WHERE s.id = ?`, [payload.sub])
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
    if (!perms.some((p) => can(user, p))) return next(new HttpError(403, 'Tu rol no tiene permiso para esta acción.'))
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
    return { user, permissions: permissionsFor(user.role, user.clinicKind), demo: demoMode }
  }

  app.post('/api/auth/login', async (req, res) => {
    const body = parse(z.object({ email: z.string().trim().min(1), password: z.string().min(1), code: z.string().optional() }), req.body,
      'Escribe tu correo y tu contraseña.')
    const key = `login:${body.email.toLowerCase()}`
    if (await attempts(sql, key) >= 5) fail(429, 'Demasiados intentos. Espera 5 minutos e inténtalo de nuevo.')
    const row = await sql.one('SELECT s.*, c.kind AS clinic_kind FROM staff s LEFT JOIN clinics c ON c.id = s.clinic_id WHERE lower(s.email) = lower(?)', [body.email])
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
    await audit({ id: String(row!.id), clinicId: row!.clinic_id as string | null, role: String(row!.role) }, 'Inició sesión')
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
    // Con el tipo de cuenta: de él dependen los permisos (un consultorio da al médico permisos de administración)
    res.json(user ? session((await sql.one('SELECT s.*, c.kind AS clinic_kind FROM staff s LEFT JOIN clinics c ON c.id = s.clinic_id WHERE s.id = ?', [user.id]))!) : { user: null, demo: demoMode })
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

  /**
   * AD5: quien tiene varios roles elige con cuál trabaja ("Vista de administrador", "Vista de médico"). El rol activo se
   * guarda en la base: se recuerda en todos sus equipos y de él salen sus permisos (también en el servidor).
   */
  app.post('/api/me/view', auth, async (req, res) => {
    const { role } = parse(z.object({ role: z.enum(ROLES) }), req.body, 'Elige una vista.')
    const user = userOf(req)
    if (!(user.roles ?? [user.role]).includes(role)) fail(403, 'No tienes ese rol.')
    if (role !== user.role) {
      await sql.run('UPDATE staff SET role = ? WHERE id = ?', [role, user.id])
      await audit({ ...user, role }, `Cambió a la ${VIEW_LABEL[role].toLowerCase()} (antes: ${VIEW_LABEL[user.role].toLowerCase()})`)
    }
    res.json(session((await sql.one('SELECT s.*, c.kind AS clinic_kind FROM staff s LEFT JOIN clinics c ON c.id = s.clinic_id WHERE s.id = ?', [user.id]))!))
  })

  // MC6: cerrar la sesión en los demás equipos (esta sigue abierta con un pase nuevo)
  app.post('/api/me/sessions/close', auth, async (req, res) => {
    const user = userOf(req)
    await sql.run('UPDATE staff SET token_version = token_version + 1 WHERE id = ?', [user.id])
    issue(res, (await staffRow(user.id))!)
    await audit(user, 'Cerró su sesión en los demás equipos')
    res.json({ ok: true })
  })

  // Recorrido de primer ingreso: terminado o saltado, no vuelve a aparecer en ningún equipo
  app.post('/api/me/tour', auth, async (req, res) => {
    await sql.run(`UPDATE staff SET prefs = jsonb_set(COALESCE(NULLIF(prefs, ''), '{}')::jsonb, '{tourDoneAt}', to_jsonb(?::text))::text WHERE id = ?`,
      [new Date().toISOString(), userOf(req).id])
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

  // ---------- Bitácora (AD7) ----------
  /**
   * Cada persona ve su propia actividad; administración ve la de todos, con filtros por persona, rol, tipo de acción,
   * paciente y fechas. Nadie la edita ni la borra (la tabla no lo permite).
   */
  const auditFilters = z.object({
    userId: z.string().optional(), role: z.string().optional(), kind: z.string().optional(), patientId: z.string().optional(),
    q: z.string().trim().max(80).optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  async function auditRows(cid: string, f: z.infer<typeof auditFilters>) {
    const where = ['a.clinic_id = ?']
    const args: unknown[] = [cid]
    if (f.userId) { where.push('a.user_id = ?'); args.push(f.userId) }
    if (f.role) { where.push('a.role = ?'); args.push(f.role) }
    if (f.patientId) {
      // Las filas de antes de la v38 no tienen paciente: se buscan también por su nombre en el texto
      const p = await sql.one('SELECT first_name, last_name FROM patients WHERE id = ? AND clinic_id = ?', [f.patientId, cid])
      where.push('(a.patient_id = ? OR (a.patient_id IS NULL AND a.action ILIKE ?))'); args.push(f.patientId, p ? `%${p.first_name} ${p.last_name}%` : '-')
    }
    if (f.q) { where.push('a.action ILIKE ?'); args.push(`%${f.q.replace(/[%_]/g, '')}%`) }
    // Las fechas se comparan en hora de Honduras (UTC-6)
    if (f.from) { where.push('a.at >= ?'); args.push(new Date(`${f.from}T00:00:00-06:00`).toISOString()) }
    if (f.to) { where.push('a.at < ?'); const d = new Date(`${f.to}T00:00:00-06:00`); d.setUTCDate(d.getUTCDate() + 1); args.push(d.toISOString()) }
    const rows = await sql.query(`SELECT a.*, p.first_name, p.last_name FROM audit a LEFT JOIN patients p ON p.id = a.patient_id
      WHERE ${where.join(' AND ')} ORDER BY a.id DESC LIMIT 3000`, args)
    const list = rows.map((r) => ({ ...toAudit(r), role: r.role ? String(r.role) : undefined, kind: (r.kind ? String(r.kind) : auditKind(String(r.action))) as AuditKind,
      patientId: r.patient_id ? String(r.patient_id) : undefined, patientName: r.first_name ? `${r.first_name} ${r.last_name}` : undefined }))
    return (f.kind && f.kind in AUDIT_KINDS ? list.filter((x) => x.kind === f.kind) : list).slice(0, 2000)
  }

  app.get('/api/audit/mine', auth, async (req, res) => {
    const user = userOf(req)
    res.json(await auditRows(clinicOf(req), { ...parse(auditFilters, req.query), userId: user.id }))
  })

  app.get('/api/audit', auth, need('audit.view'), async (req, res) => {
    res.json(await auditRows(clinicOf(req), parse(auditFilters, req.query)))
  })

  // ---------- Datos iniciales según el rol ----------
  app.get('/api/bootstrap', auth, async (req, res) => {
    const user = userOf(req)
    // La administración de la plataforma no carga datos de ninguna clínica
    if (!user.clinicId) {
      return res.json({ staff: [], patients: [], appointments: [], prescriptions: [], audit: [], vitals: [], services: [], beds: [], inpatients: [], followups: [], discharges: [], clinicDrugs: [], pendingOrders: [], stays: [], bedStays: [],
        settings: { ...clinicSettings({ name: 'Clinara' }) } })
    }
    const cid = user.clinicId
    const clinical = can(user, 'chart.view')
    const billing = can(user, 'billing.manage')
    const since = new Date(); since.setDate(since.getDate() - 90)
    const none = Promise.resolve([] as Row[])
    if (can(user, 'followups.view')) await sweepFollowupReminders(sql, cid)
    const [staff, patients, appts, prescriptions, auditLog, vitals, services, cfg, beds, inpatients, followups, discharges, clinicDrugs, pending, stays, bedStays] = await Promise.all([
      sql.query('SELECT * FROM staff WHERE clinic_id = ? ORDER BY name', [cid]),
      // Los pendientes de registro sí viajan (agenda y 'Por llegar'); los que se unieron a otro expediente no
      sql.query('SELECT * FROM patients WHERE clinic_id = ? AND merged_into IS NULL ORDER BY last_name', [cid]),
      // Ventana de agenda: 90 días atrás y todo lo futuro
      sql.query(`SELECT a.*, EXISTS(SELECT 1 FROM payments p WHERE p.appointment_id = a.id AND NOT p.voided) AS paid
        FROM appointments a WHERE a.clinic_id = ? AND a.start >= ? ORDER BY a.start`, [cid, localDate(since)]),
      can(user, 'rx.view') ? sql.query('SELECT * FROM prescriptions WHERE clinic_id = ? ORDER BY issued_at DESC LIMIT 500', [cid]) : Promise.resolve([]),
      can(user, 'audit.view') ? sql.query('SELECT * FROM audit WHERE clinic_id = ? ORDER BY id DESC LIMIT 500', [cid]) : Promise.resolve([]),
      clinical ? sql.query(`SELECT v.* FROM vitals v JOIN appointments a ON a.id = v.appointment_id WHERE v.clinic_id = ? AND a.start LIKE ?`, [cid, `${localDate(new Date())}%`]) : Promise.resolve([]),
      sql.query('SELECT * FROM services WHERE clinic_id = ? ORDER BY name', [cid]),
      settings(cid),
      // AD3: todos los roles ven el estado de las camas (libre u ocupada); sólo administración las edita
      sql.query('SELECT * FROM beds WHERE clinic_id = ? ORDER BY room, label', [cid]),
      // Con aviso de la autorización de hospitalización pendiente de firma, para enfermería y el médico
      can(user, 'inpatient.view') ? sql.query(`SELECT h.*, EXISTS(SELECT 1 FROM authorizations a WHERE a.hospitalization_id = h.id AND a.template = 'hospital' AND a.status = 'pending') AS auth_pending
        FROM hospitalizations h WHERE h.clinic_id = ? AND h.status = 'active' ORDER BY h.admitted_at`, [cid]) : none,
      can(user, 'followups.view') ? sql.query('SELECT * FROM followups WHERE clinic_id = ? AND active ORDER BY due_date', [cid]) : none,
      sql.query(`SELECT DISTINCT ON (patient_id) patient_id, discharged_at FROM hospitalizations
        WHERE clinic_id = ? AND status = 'discharged' AND discharged_at IS NOT NULL ORDER BY patient_id, discharged_at DESC`, [cid]),
      can(user, 'rx.write') || can(user, 'drugs.manage') ? sql.query('SELECT * FROM clinic_drugs WHERE clinic_id = ? ORDER BY name', [cid]) : none,
      can(user, 'orders.review') ? pendingOrders(sql, cid) : Promise.resolve([]),
      // Estado del paciente (hospitalizado o en observación) para todos los roles, sin datos clínicos
      sql.query(`SELECT patient_id, kind FROM hospitalizations WHERE clinic_id = ? AND status = 'active'`, [cid]),
      // AD3: estado de cada cama (quién la ocupa y la especialidad del ingreso), sin datos clínicos, para todos los roles
      sql.query(`SELECT id, bed_id, patient_id, specialty FROM hospitalizations WHERE clinic_id = ? AND status = 'active' AND bed_id IS NOT NULL AND kind = 'hospital'`, [cid]),
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
      clinicDrugs: clinicDrugs.map(toClinicDrug),
      pendingOrders: pending,
      stays: stays.map((r) => ({ patientId: String(r.patient_id), kind: String(r.kind) })),
      bedStays: bedStays.map((r) => ({ id: String(r.id), bedId: String(r.bed_id), patientId: String(r.patient_id), specialty: r.specialty ? String(r.specialty) : undefined })),
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
      sql.query(`SELECT patient_id, kind, title FROM followups WHERE clinic_id = ? AND active`, [cid]),
      sql.query(`SELECT patient_id, ${STAY_KIND} AS kind FROM hospitalizations WHERE clinic_id = ? AND status = 'active'`, [cid]),
    ])
    const by = <T,>(rows: Row[], f: (r: Row) => T) => new Map(rows.map((r) => [String(r.patient_id), f(r)]))
    const lastBy = by(last, (r) => ({ at: String(r.date), doctorId: String(r.doctor_id) }))
    const nextBy = by(next, (r) => ({ at: String(r.start), doctorId: String(r.doctor_id) }))
    const stayBy = by(stays, (r) => (r.kind === 'observation' ? 'observation' : 'hospital'))
    const followBy = new Map<string, { kind: string; title: string }[]>()
    for (const f of follow) followBy.set(String(f.patient_id), [...(followBy.get(String(f.patient_id)) ?? []), { kind: String(f.kind), title: String(f.title) }])
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
      hospitalizations: hospitalizations.map(toHospitalization), addenda: await addendaFor(sql, cid, consultations.map((c) => String(c.id))) })
  })

  // ---------- Citas ----------
  // La duración ya no se fija: una consulta dura de 30 minutos a 2 horas. Se guarda 30 sólo para dibujarla.
  const VISUAL_MINUTES = 30
  const apptBody = z.object({
    patientId: z.string().optional(),
    // Paciente que llama por primera vez: basta nombre y teléfono; completa su registro al llegar
    newPatient: z.object({
      firstName: z.string().trim().min(2, 'Escribe el nombre del paciente nuevo.').max(60),
      lastName: z.string().trim().max(60).default(''),
      phone: z.string().trim().regex(/^[\d\s+()-]{7,20}$/, 'Escribe el teléfono del paciente nuevo.'),
      dni: z.string().trim().max(30).optional().transform(normalizeDni),
    }).optional(),
    doctorId: z.string().min(1, 'Elige un médico.'),
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/, 'La fecha u hora no es válida.'),
    minutes: z.number().int().min(10).max(240).optional(),
    reason: z.string().trim().max(300).default(''),
    type: z.enum(['first', 'followup', 'urgent']).optional(),
  })

  /** La hora debe caer dentro del horario de atención del médico ese día. */
  const assertInSchedule = (doc: Row, start: string) => {
    const staff = toStaff(doc)
    const date = start.slice(0, 10)
    if (!rangesOn(staff.schedule, date).length) fail(409, `${staff.name} no atiende los ${DAY_NAMES_PLURAL[weekday(date)]}. Elige otro día.`)
    if (!withinSchedule(staff.schedule, date, start.slice(11, 16))) fail(409, `${start.slice(11, 16)} está fuera del horario de ${staff.name}. Elige una hora de su horario.`)
  }

  app.get('/api/appointments', auth, need('agenda.view'), async (req, res) => {
    const q = parse(z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), req.query, 'Elige un rango de fechas.')
    const user = userOf(req)
    const rows = await sql.query(`SELECT a.*, EXISTS(SELECT 1 FROM payments p WHERE p.appointment_id = a.id AND NOT p.voided) AS paid
      FROM appointments a WHERE a.clinic_id = ? AND a.start >= ? AND a.start < ? ORDER BY a.start`, [clinicOf(req), q.from, `${q.to}T99`])
    const billing = can(user, 'billing.manage')
    res.json(rows.map((r) => ({ ...toAppointment(r), paid: billing ? Boolean(r.paid) : undefined })))
  })

  app.post('/api/appointments', auth, need('agenda.manage'), async (req, res) => {
    const a = parse(apptBody, req.body)
    if (!a.patientId && !a.newPatient) fail(400, 'Elige un paciente o escribe los datos del paciente nuevo.')
    const start = a.start.length === 16 ? `${a.start}:00` : a.start
    const cid = clinicOf(req)
    if (a.patientId) (await patientRow(cid, a.patientId)) ?? fail(400, 'El paciente no existe.')
    const doc = await clinicStaffRow(cid, a.doctorId)
    if (!doc || !rolesOf(doc).includes('doctor') || !doc.active) fail(400, 'El médico elegido no está disponible.')
    assertInSchedule(doc!, start)
    // Se permiten dos citas a la misma hora con el mismo médico (pasa en la vida real); la agenda avisa antes
    const id = randomUUID()
    const seen = a.patientId ? await sql.one('SELECT 1 FROM consultations WHERE patient_id = ? AND clinic_id = ? LIMIT 1', [a.patientId, cid]) : undefined
    const type = a.type ?? (seen ? 'followup' : 'first')
    let patientId = a.patientId ?? ''
    await sql.tx(async (q) => {
      if (a.newPatient) patientId = await createPendingPatient(q, cid, a.newPatient)
      await q.run(`INSERT INTO appointments (id,patient_id,doctor_id,start,minutes,reason,type,status,source,clinic_id) VALUES (?,?,?,?,?,?,?, 'scheduled', 'staff', ?)`,
        [id, patientId, a.doctorId, start, a.minutes ?? VISUAL_MINUTES, a.reason, type, cid])
    })
    const who = a.newPatient ? `${a.newPatient.firstName} ${a.newPatient.lastName}`.trim() + ' (paciente nuevo, pendiente de registro)' : await patientName(patientId)
    await audit(userOf(req), `Agendó cita de ${who} con ${doc!.name} el ${start.slice(0, 10)} a las ${start.slice(11, 16)}`)
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
      reason: 'reason' in req.body ? b.reason ?? '' : String(row!.reason),
    }
    const doc = await clinicStaffRow(cid, next.doctorId)
    if (!doc || !rolesOf(doc).includes('doctor') || !doc.active) fail(400, 'El médico elegido no está disponible.')
    if (next.doctorId !== row!.doctor_id || next.start !== row!.start) assertInSchedule(doc!, next.start)
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
    if (!can(user, t.perm)) fail(403, 'Tu rol no tiene permiso para esta acción.')
    if (row!.status === status) return res.json(toAppointment(row!))
    if (!t.from.includes(row!.status as ApptStatus)) fail(409, 'La cita ya avanzó a otra etapa. Actualiza la página.')
    if (status === 'in_consult' && row!.doctor_id !== user.id) fail(403, 'Sólo el médico asignado puede atender esta cita.')
    if (status === 'arrived' && (await patientRow(cid, String(row!.patient_id)))?.pending) fail(409, 'Completa el registro del paciente nuevo antes de marcar su llegada.')
    await sql.run('UPDATE appointments SET status = ?, arrived_at = COALESCE(?, arrived_at) WHERE id = ?',
      [status, status === 'arrived' ? new Date().toISOString() : null, String(row!.id)])
    await audit(user, `${t.label} la cita de ${await patientName(String(row!.patient_id))}`)
    res.json(toAppointment((await apptRow(cid, String(row!.id)))!))
  })

  /**
   * Un médico atiende al paciente listo para consulta de otro médico. Sólo uno lo obtiene: la
   * actualización exige que la cita siga asignada al médico que se vio en pantalla y lista para consulta.
   */
  app.post('/api/appointments/:id/take', auth, need('consult.write'), async (req, res) => {
    const user = userOf(req)
    if (user.role !== 'doctor') fail(403, 'Sólo un médico puede atender al paciente.')
    const { fromDoctorId } = parse(z.object({ fromDoctorId: z.string().min(1) }), req.body, 'Falta el médico asignado.')
    const cid = clinicOf(req)
    const row = (await apptRow(cid, String(req.params.id))) ?? fail(404, 'La cita no existe.')
    if (row!.doctor_id === user.id) fail(409, 'Este paciente ya está asignado a ti.')
    const now = new Date().toISOString()
    const taken = await sql.one(`UPDATE appointments SET doctor_id = ?, status = 'in_consult', reassigned_from = doctor_id, reassigned_by = ?, reassigned_at = ?
      WHERE id = ? AND clinic_id = ? AND doctor_id = ? AND status = 'triaged' RETURNING id`, [user.id, user.id, now, String(row!.id), cid, fromDoctorId])
    if (!taken) {
      const fresh = (await apptRow(cid, String(row!.id)))!
      const who = (await staffRow(String(fresh.doctor_id)))?.name ?? 'otro médico'
      fail(409, fresh.doctor_id !== fromDoctorId ? `${who} ya está atendiendo a este paciente.` : 'Este paciente ya no está listo para consulta. Actualiza la página.')
    }
    const from = (await staffRow(fromDoctorId))?.name ?? fromDoctorId
    await audit(user, `Tomó a ${await patientName(String(row!.patient_id))} para atenderlo; estaba asignado a ${from}`)
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
    if (!doc || !rolesOf(doc).includes('doctor') || !doc.active) fail(400, 'El médico elegido no está disponible.')
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

  // ---------- Diagnósticos CIE-11 ----------
  const icd = opts.icd ?? createIcdClient(icdConfigFromEnv())
  /**
   * Busca en la CIE-11. Con la API de la OMS configurada se consulta en línea; si no lo está, o si la OMS no
   * responde, se busca en el archivo oficial en español que trae Clinara, así que la búsqueda siempre funciona.
   */
  app.get('/api/icd/search', auth, need('chart.view', 'consult.write'), async (req, res) => {
    const q = String(req.query.q ?? '').trim()
    if (q.length < 2) return res.json({ source: 'file', release: '', results: [] })
    if (icd.configured()) {
      try { return res.json({ source: 'api', release: icd.release, results: await icd.search(q) }) } catch { /* se busca en el archivo */ }
    }
    try {
      res.json({ source: 'file', release: await localRelease(), results: await searchLocal(q) })
    } catch (e) {
      // Sin el archivo no se rompe la consulta: se avisa y se puede escribir el diagnóstico sin código
      console.error(e)
      res.json({ source: 'file', release: '', results: [], error: 'No se pudo buscar en la CIE-11 en este momento. Escribe el diagnóstico sin código.',
        // En la demo se muestra la causa, para diagnosticar el despliegue
        ...(demoMode ? { detail: String((e as Error).message).slice(0, 300) } : {}) })
    }
  })

  /** Diagnósticos CIE-11 que la clínica ya usó, los más frecuentes primero: sirven aun sin conexión con la OMS. */
  app.get('/api/icd/frequent', auth, need('chart.view', 'consult.write'), async (req, res) => {
    const cid = clinicOf(req)
    const rows = await sql.query(`SELECT d->>'code' AS code, d->>'label' AS label, MAX(d->>'uri') AS uri, COUNT(*)::int AS n FROM (
        SELECT jsonb_array_elements(diagnoses::jsonb) AS d FROM consultations WHERE clinic_id = ?
        UNION ALL SELECT jsonb_array_elements(diagnoses::jsonb) AS d FROM hospitalizations WHERE clinic_id = ?) x
      WHERE d->>'system' = 'icd11' GROUP BY 1, 2 ORDER BY n DESC, label LIMIT 40`, [cid, cid])
    res.json(rows.map((r) => ({ code: String(r.code), label: String(r.label), uri: r.uri ? String(r.uri) : undefined, system: 'icd11' })))
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
    }), req.body)
    // Basta una indicación, un medicamento o un examen; no se exigen todos
    if (!c.orders.length && !c.items.length && !c.exams.length) fail(400, 'Agrega al menos una indicación, un medicamento o un examen en el plan y manejo.')
    // Un set de órdenes puede traer espacios "___": se llenan antes de firmar
    if (c.orders.some(hasBlank) || c.items.some(medHasBlank)) fail(400, 'Completa los espacios ___ de las órdenes antes de firmar.')
    if (c.admit && c.observe) fail(400, 'Elige ingreso a hospitalización o a observación, no los dos.')
    // Con ingreso, todos los medicamentos se aplican en la clínica (van a la hoja, sin receta). Ambulatorio: van a la
    // receta, salvo los marcados "Aplicar en la clínica", que dejan al paciente en observación mientras se aplican.
    const admitted = c.admit || c.observe
    const items = admitted ? c.items.map((it) => ({ ...it, applyInClinic: true })) : c.items
    const rxItems = items.filter((it) => !it.applyInClinic)
    const stayKind = c.admit ? 'hospital' : c.observe || items.some((it) => it.applyInClinic) ? 'observation' : null
    // La receta necesita el total de días; con ingreso el medicamento queda "hasta nueva orden"
    const noDays = rxItems.find((it) => !it.duration && !/única/i.test(it.frequency))
    if (noDays) fail(400, `Escribe el total de días de ${noDays.drug}: va a la receta.`)
    const cid = clinicOf(req)
    // Un consultorio no hospitaliza; la observación la puede tener apagada
    const place = (await sql.one('SELECT kind, observation_enabled FROM clinics WHERE id = ?', [cid]))!
    if (place.kind === 'office' && c.admit) fail(400, 'Un consultorio no tiene hospitalización. Usa observación o refiere al paciente.')
    if (place.kind === 'office' && stayKind === 'observation' && !place.observation_enabled) {
      fail(400, 'Este consultorio no usa observación. Actívala en Configuración o quita «Aplicar en la clínica».')
    }
    const appt = (await apptRow(cid, c.appointmentId)) ?? fail(404, 'La cita no existe.')
    if (appt!.doctor_id !== user.id) fail(403, 'Sólo el médico asignado puede firmar esta consulta.')
    if (['done', 'cancelled', 'no_show'].includes(String(appt!.status))) fail(409, 'Esta cita ya está cerrada.')
    const patientId = String(appt!.patient_id)
    const name = await patientName(patientId)
    const consultId = randomUUID()
    const stayId = stayKind ? randomUUID() : null
    const patientPhone = stayKind ? String((await patientRow(cid, patientId))?.phone ?? '') : ''
    if (stayKind && await sql.one(`SELECT 1 FROM hospitalizations WHERE patient_id = ? AND clinic_id = ? AND status = 'active'`, [patientId, cid])) {
      fail(409, `${name} ya está en observación u hospitalizado.`)
    }
    const rxId = rxItems.length ? randomUUID() : null
    let medOrders = 0
    const now = new Date()
    let folio: string | null = null
    let examBatch: string | null = null
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
          admit_kind, meds)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [consultId, patientId, user.id, c.appointmentId, now.toISOString(), c.reason, JSON.stringify(c.symptoms), c.symptomOnset ?? null,
          c.history, c.exam, JSON.stringify(c.diagnoses), c.orders.map((o, i) => `${i + 1}. ${o}`).join('\n'), c.vitalsId ?? null, rxId, JSON.stringify(c.orders), c.observations, cid,
          c.indications ? JSON.stringify(c.indications) : null, stayKind, items.length ? JSON.stringify(items) : null])
      await q.run(`UPDATE appointments SET status = 'done' WHERE id = ?`, [c.appointmentId])
      for (const f of c.followups) await insertFollowup(q, cid, user.id, { ...f, patientId })
      // Con ingreso, los exámenes son de la estancia (enfermería los gestiona); si no, de la consulta externa
      examBatch = await insertExams(q, { clinicId: cid, patientId, consultationId: consultId, hospitalizationId: stayId ?? undefined, by: user.id, at: now.toISOString() }, c.exams)
      await audit(user, rxId ? `Firmó consulta y receta ${folio} de ${name}` : `Firmó consulta de ${name}`, q)
      if (stayId) {
        // La hospitalización se crea sin cama: el médico la elige al terminar de firmar (o la corrige después)
        await q.run(`INSERT INTO hospitalizations (id, clinic_id, patient_id, bed_id, consultation_id, admitted_at, admitted_by, reason, diagnoses, patient_phone, status, kind, specialty)
          VALUES (?,?,?,NULL,?,?,?,?,?,?,'active',?,?)`,
          [stayId, cid, patientId, consultId, now.toISOString(), user.id, c.reason, JSON.stringify(c.diagnoses), patientPhone || null, stayKind, specialtyOf(user)])
        medOrders = await syncStayOrders(q, { clinicId: cid, hospitalizationId: stayId })
        // La autorización de hospitalización queda generada, pendiente de firma, desde el ingreso. La observación
        // no lleva autorización (ronda 3, P6): se genera si después pasa a hospitalización.
        if (stayKind === 'hospital') await ensureHospitalAuthorization(q, (await q.one('SELECT * FROM hospitalizations WHERE id = ?', [stayId]))!, user)
        await audit(user, `Ingresó a ${name} a ${stayKind === 'hospital' ? 'hospitalización' : 'observación'} desde la consulta externa${medOrders ? ` (${medOrders} medicamento(s) a la hoja)` : ''}`, q)
      }
    })
    res.status(201).json({ consultationId: consultId, prescriptionId: rxId, folio, hospitalizationId: stayId, stayKind, medOrders, examBatch,
      observationId: stayKind === 'observation' ? stayId : null })
  })

  app.get('/api/consultations/:id', auth, need('chart.view'), async (req, res) => {
    const cid = clinicOf(req)
    const row = (await sql.one('SELECT * FROM consultations WHERE id = ? AND clinic_id = ?', [String(req.params.id), cid])) ?? fail(404, 'La consulta no existe.')
    const c = toConsultation(row!)
    const vitals = c.vitalsId ? await sql.one('SELECT * FROM vitals WHERE id = ? AND clinic_id = ?', [c.vitalsId, cid]) : undefined
    const what = req.query.purpose === 'certificate' ? 'Emitió constancia médica de' : 'Abrió la nota de consulta de'
    await audit(userOf(req), `${what} ${await patientName(c.patientId)}`)
    res.json({ consultation: c, patient: toPatient((await patientRow(cid, c.patientId))!, true), vitals: vitals ? toVitals(vitals) : null, addenda: await addendaFor(sql, cid, [c.id]) })
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
    const noDays = b.items.find((it) => !it.duration && !/única/i.test(it.frequency))
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

  app.get('/api/prescriptions/:id', auth, need('rx.view'), async (req, res) => {
    const cid = clinicOf(req)
    const row = (await sql.one('SELECT * FROM prescriptions WHERE id = ? AND clinic_id = ?', [String(req.params.id), cid])) ?? fail(404, 'La receta no existe.')
    const rx = toPrescription(row!)
    const cons = await sql.one('SELECT * FROM consultations WHERE id = ? AND clinic_id = ?', [rx.consultationId, cid])
    const hosp = rx.hospitalizationId ? await sql.one('SELECT * FROM hospitalizations WHERE id = ? AND clinic_id = ?', [rx.hospitalizationId, cid]) : undefined
    const patient = rx.patientId ? toPatient((await patientRow(cid, rx.patientId))!, true) : null
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
      // AD5: uno o varios roles
      roles: z.array(z.enum(ROLES)).min(1, 'Asigna al menos un rol.').max(ROLES.length).optional(),
      twoFactor: z.literal(false).optional(),
      specialty: z.string().trim().optional(),
      license: z.string().trim().optional(),
      serviceId: z.string().optional(),
      schedule: scheduleInput.optional(),
    }), req.body)
    const id = String(row!.id)
    const cid = clinicOf(req)
    const prev = rolesOf(row!)
    const nextRoles = b.roles ? [...new Set(b.roles)] : b.role ? [b.role] : undefined
    if (id === me.id && b.active === false) fail(400, 'No puedes desactivar tu propia cuenta.')
    if (id === me.id && nextRoles && prev.includes('admin') && !nextRoles.includes('admin')) fail(400, 'No puedes quitarte a ti mismo el rol de Administración.')
    // Cada rol nuevo (o reactivar a alguien) tiene que caber en el tipo de cuenta
    if (nextRoles) for (const r of nextRoles.filter((x) => !prev.includes(x))) await assertRoleFits(sql, cid, r, id)
    if (b.active === true && !row!.active) for (const r of prev) await assertRoleFits(sql, cid, r, id)
    // Siempre queda al menos una persona activa con Administración en la clínica
    if ((nextRoles && prev.includes('admin') && !nextRoles.includes('admin')) || (b.active === false && prev.includes('admin'))) await assertNotLastAdmin(sql, cid, id)
    const addsDoctor = nextRoles?.includes('doctor') && !prev.includes('doctor')
    if (addsDoctor && !row!.license && !b.license) fail(400, `Para darle el rol de médico a ${row!.name} escribe su número de colegiación.`)
    const changes: string[] = []
    await sql.tx(async (q) => {
      if (b.active !== undefined) { await q.run('UPDATE staff SET active = ?, token_version = token_version + 1 WHERE id = ?', [b.active, id]); changes.push(b.active ? 'Reactivó a' : 'Desactivó a') }
      if (nextRoles && nextRoles.join() !== prev.join()) {
        // El rol activo se conserva si lo sigue teniendo; si no, pasa al primero de los nuevos
        const active = nextRoles.includes(row!.role as (typeof ROLES)[number]) ? String(row!.role) : nextRoles[0]
        await q.run('UPDATE staff SET roles = ?, role = ? WHERE id = ?', [JSON.stringify(nextRoles), active, id])
        if (addsDoctor) await giveDoctorDefaults(q, cid, id)
        changes.push(`Cambió los roles (${nextRoles.map((r) => ROLE_LABEL[r]).join(', ')}) de`)
      }
      if (b.twoFactor === false) { await q.run('UPDATE staff SET totp_enabled = FALSE, totp_secret = NULL WHERE id = ?', [id]); changes.push('Quitó la verificación en dos pasos de') }
      if (b.specialty !== undefined) await q.run('UPDATE staff SET specialty = ? WHERE id = ?', [b.specialty || null, id])
      if (b.license !== undefined) await q.run('UPDATE staff SET license = ? WHERE id = ?', [b.license || null, id])
      if (b.serviceId !== undefined) await q.run('UPDATE staff SET service_id = ? WHERE id = ?', [b.serviceId || null, id])
      if (b.schedule) { await q.run('UPDATE staff SET schedule = ? WHERE id = ?', [JSON.stringify(cleanSchedule(b.schedule)), id]); changes.push('Actualizó el horario de') }
    })
    await audit(me, `${changes[0] ?? 'Actualizó los datos de'} ${row!.name}`)
    res.json(toStaff((await staffRow(id))!))
  })

  /** Horario de atención: administración edita el de cualquier médico y cada médico el suyo. */
  app.patch('/api/staff/:id/schedule', auth, async (req, res) => {
    const me = userOf(req)
    const row = (await clinicStaffRow(clinicOf(req), String(req.params.id))) ?? fail(404, 'El usuario no existe.')
    if (!rolesOf(row!).includes('doctor')) fail(400, 'Sólo los médicos tienen horario de atención.')
    if (!can(me, 'schedule.manage') && me.id !== row!.id) fail(403, 'Sólo puedes cambiar tu propio horario.')
    const schedule = cleanSchedule(parse(scheduleInput, req.body))
    await sql.run('UPDATE staff SET schedule = ? WHERE id = ?', [JSON.stringify(schedule), String(row!.id)])
    await audit(me, me.id === row!.id ? 'Actualizó su horario de atención' : `Actualizó el horario de ${row!.name}`)
    res.json(toStaff((await staffRow(String(row!.id)))!))
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
  registerMe(app, ctx)
  registerNotes(app, ctx)
  registerExams(app, ctx)
  registerPublic(app, ctx)
  registerBilling(app, ctx)
  registerReports(app, ctx)
  registerFiles(app, ctx)
  registerPlatform(app, ctx)
  registerInpatient(app, ctx)
  registerDrugs(app, ctx)
  registerCertificates(app, ctx)
  registerReferrals(app, ctx)
  registerConsent(app, ctx)
  registerOrderSets(app, ctx)
  registerEpicrisis(app, ctx)
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

/** Un medicamento de la receta. */
const rxItem = z.object({
  drug: z.string().trim().min(1, 'Escribe el medicamento.').max(160), presentation: z.string().max(160).default(''), dose: z.string().trim().min(1, 'Escribe la dosis.').max(80),
  route: z.string().max(40).optional(), frequency: z.string().min(1).max(80), duration: z.string().trim().max(80).default(''),
  instructions: z.string().max(300).optional(), quantity: z.string().trim().max(80).optional(),
  applyInClinic: z.boolean().optional(),
})

const hhmm = z.string().regex(/^\d{2}:\d{2}$/, 'Escribe la hora como 08:00.')
/** Horario de un médico: el formato anterior (una franja para todos los días) o franjas por día. */
const scheduleInput = z.object({
  days: z.array(z.number().int().min(0).max(6)).optional(),
  start: hhmm.optional(), end: hhmm.optional(),
  slot: z.number().int().refine((n) => SLOT_OPTIONS.includes(n), 'El intervalo de la agenda no es válido.'),
  week: z.record(z.string().regex(/^[0-6]$/), z.array(z.object({ start: hhmm, end: hhmm })).max(4)).optional(),
}).superRefine((s, ctx) => {
  const problems = scheduleProblems(weekOf({ days: s.days ?? [], start: s.start ?? '', end: s.end ?? '', slot: s.slot, week: s.week }))
  if (problems.length) ctx.addIssue({ code: 'custom', message: problems[0] })
})
/** Se guarda siempre con las franjas por día y los campos anteriores derivados de ellas. */
const cleanSchedule = (s: z.infer<typeof scheduleInput>) => scheduleFromWeek(weekOf({ days: s.days ?? [], start: s.start ?? '', end: s.end ?? '', slot: s.slot, week: s.week }), s.slot)

/** Crea un usuario dentro de una clínica y devuelve su contraseña temporal. */
export async function createStaffMember(sql: Sql, clinicId: string, s: { name: string; role: (typeof ROLES)[number]; email: string; specialty?: string; license?: string }) {
  if (s.role === 'doctor' && !s.license) fail(400, 'Para un médico escribe su número de colegiación.')
  await assertRoleFits(sql, clinicId, s.role)
  if (await sql.one('SELECT 1 FROM staff WHERE lower(email) = lower(?)', [s.email])) fail(409, 'Ya existe un usuario con ese correo.')
  const id = randomUUID()
  const password = tempPassword()
  const count = Number((await sql.one<{ n: number }>('SELECT COUNT(*)::int AS n FROM staff WHERE clinic_id = ?', [clinicId]))!.n)
  const service = s.role === 'doctor' ? await sql.one(`SELECT id FROM services WHERE clinic_id = ? AND active ORDER BY name LIMIT 1`, [clinicId]) : undefined
  const schedule = s.role === 'doctor' ? JSON.stringify(scheduleFromWeek({ 1: [{ start: '08:00', end: '17:00' }], 2: [{ start: '08:00', end: '17:00' }], 3: [{ start: '08:00', end: '17:00' }], 4: [{ start: '08:00', end: '17:00' }], 5: [{ start: '08:00', end: '17:00' }] }, 30)) : null
  await sql.run(`INSERT INTO staff (id,name,role,specialty,email,license,color,active,password_hash,schedule,service_id,clinic_id,roles) VALUES (?,?,?,?,?,?,?,TRUE,?,?,?,?,?)`,
    [id, s.name, s.role, s.specialty || null, s.email, s.license || null, COLORS[count % COLORS.length], bcrypt.hashSync(password, 10),
      schedule, service ? String(service.id) : null, clinicId, JSON.stringify([s.role])])
  return { user: toStaff((await sql.one('SELECT * FROM staff WHERE id = ?', [id]))!), password }
}

export const CLINIC_ROLES = ROLES

/**
 * Cada tipo de cuenta tiene sus roles. Un consultorio tiene un solo médico (el titular) y hasta
 * `max_assistants` asistentes activos; para sumar otro médico se convierte en clínica.
 */
export async function assertRoleFits(sql: Sql, clinicId: string, role: string, ignoreStaffId = '') {
  const c = (await sql.one('SELECT kind, max_assistants FROM clinics WHERE id = ?', [clinicId])) ?? fail(404, 'La clínica no existe.')
  const kind = String(c!.kind ?? 'clinic') as 'clinic' | 'office'
  if (!(ROLES_BY_KIND[kind] as string[]).includes(role)) {
    fail(400, kind === 'office' ? 'En un consultorio se agregan asistentes y enfermería. Para sumar otro médico o recepción, convierte el consultorio en clínica.' : 'El rol de asistente es para consultorios; en una clínica usa recepción o enfermería.')
  }
  if (kind !== 'office') return
  const count = async (r: string) => Number((await sql.one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM staff WHERE clinic_id = ? AND ${hasRoleSql(r)} AND active AND id <> ?`, [clinicId, ignoreStaffId]))!.n)
  if (role === 'doctor' && await count('doctor') >= 1) fail(400, 'El consultorio ya tiene su médico titular. Para sumar otro médico, convierte el consultorio en clínica.')
  if (role === 'assistant' && await count('assistant') >= Number(c!.max_assistants ?? 2)) fail(400, `El consultorio ya tiene ${Number(c!.max_assistants ?? 2)} asistentes activos, el máximo de su cuenta.`)
}

/** AD5: una clínica nunca se queda sin nadie activo con el rol de Administración. */
export async function assertNotLastAdmin(sql: Sql, clinicId: string, staffId: string) {
  // MI1: también en un consultorio (el titular es su administrador)
  const others = await sql.one(`SELECT 1 FROM staff WHERE clinic_id = ? AND id <> ? AND active AND ${hasRoleSql('admin')}`, [clinicId, staffId])
  if (!others) fail(400, 'Es la única persona con el rol de Administración. Dale ese rol a otra persona antes de quitárselo.')
}

/** Quien recibe el rol de médico sin haberlo tenido: horario de lunes a viernes y el servicio que se cobra por defecto. */
async function giveDoctorDefaults(q: Sql, clinicId: string, staffId: string) {
  const service = await q.one(`SELECT id FROM services WHERE clinic_id = ? AND active ORDER BY name LIMIT 1`, [clinicId])
  const week = Object.fromEntries([1, 2, 3, 4, 5].map((d) => [d, [{ start: '08:00', end: '17:00' }]]))
  await q.run('UPDATE staff SET schedule = COALESCE(schedule, ?), service_id = COALESCE(service_id, ?) WHERE id = ?',
    [JSON.stringify(scheduleFromWeek(week, 30)), service ? String(service.id) : null, staffId])
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
