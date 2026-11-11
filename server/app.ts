import express, { type NextFunction, type Request, type Response } from 'express'
import cookieParser from 'cookie-parser'
import jwt from 'jsonwebtoken'
import { randomBytes } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { ensureDb } from './db.js'
import type { Sql } from './sql.js'
import { SESSION_COOKIE, type Ctx, fail, HttpError, type Row } from './http.js'
import { clinicSettings, toStaff } from './mappers.js'
import { registerSettings } from './routes/settings.js'
import { registerAuth } from './routes/auth.js'
import { registerDemo } from './routes/demo.js'
import { registerStaff } from './routes/staff.js'
import { registerConsultations } from './routes/consultations.js'
import { registerIcd } from './routes/icd.js'
import { registerTriage } from './routes/triage.js'
import { registerAppointments } from './routes/appointments.js'
import { registerPatients } from './routes/patients.js'
import { registerBootstrap } from './routes/bootstrap.js'
import { registerAudit } from './routes/audit.js'
import { registerMe } from './routes/me.js'
import { registerNotes } from './routes/notes.js'
import { registerExams } from './routes/exams.js'
import { registerPublic } from './routes/public.js'
import { registerBilling } from './routes/billing.js'
import { registerReports } from './routes/reports.js'
import { registerFiles } from './routes/files.js'
import { registerPlatform } from './routes/platform.js'
import { registerInpatient } from './routes/inpatient.js'
import { createIcdClient, icdConfigFromEnv, type IcdClient } from './icd.js'
import { registerDrugs } from './routes/drugs.js'
import { registerCertificates } from './routes/certificates.js'
import { registerReferrals } from './routes/referrals.js'
import { registerConsent } from './routes/consent.js'
import { registerAnesthesia } from './routes/anesthesia.js'
import { registerPreanesthesia } from './routes/preanesthesia.js'
import { registerSurgicalCount } from './routes/surgicalCount.js'
import { registerOrderSets } from './routes/orderSets.js'
import { registerRoster } from './routes/roster.js'
import { registerApplications } from './routes/applications.js'
import { registerEpicrisis } from './routes/epicrisis.js'
import { registerFollowups } from './routes/followups.js'
import { registerPrintJobs } from './routes/printJobs.js'
import { registerDept } from './routes/dept.js'
import { registerSupplies } from './routes/supplies.js'
import { registerUsage } from './routes/usage.js'
import { registerSupplySets } from './routes/supplySets.js'
import { can, type Permission } from '../src/lib/permissions.js'
import { yearsOld } from '../src/lib/inpatient.js'
import { auditKind } from '../src/lib/audit.js'
import type { Staff } from '../src/lib/types.js'

export interface AppOptions {
  sql: Sql
  jwtSecret?: string
  demoMode?: boolean
  secureCookies?: boolean
  staticDir?: string
  /** Búsqueda CIE-11 de la OMS; en las pruebas se pasa una falsa. */
  icd?: IcdClient
}

const SESSION_HOURS = 10

interface AuthedRequest extends Request { user: Staff }

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
    res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: !!opts.secureCookies, maxAge: SESSION_HOURS * 3600_000, path: '/' })
  }

  async function authenticate(req: Request): Promise<Staff | null> {
    const token = req.cookies?.[SESSION_COOKIE]
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

  /** La receta lleva el número de identidad del paciente; en adultos es obligatorio. */
  async function assertRxIdentity(cid: string, patientId: string) {
    const p = (await patientRow(cid, patientId)) ?? fail(404, 'El paciente no existe.')
    if (!p!.dni && yearsOld(String(p!.birth_date)) >= 18) fail(400, 'Para emitir la receta registra el número de identidad del paciente.')
  }

  const ctx: Ctx = { sql, demoMode, auth, need, userOf, clinicOf, audit, patientName, staffRow, clinicStaffRow, patientRow, apptRow, assertRxIdentity, settings }

  // Las rutas viven en server/routes/, un archivo por dominio. El orden de registro importa donde dos rutas se solapan.
  registerAuth(app, ctx, { issue, authenticate })
  registerAudit(app, ctx)

  registerBootstrap(app, ctx)
  registerPatients(app, ctx)

  registerAppointments(app, ctx)
  registerTriage(app, ctx)

  registerIcd(app, ctx, opts.icd ?? createIcdClient(icdConfigFromEnv()))
  registerConsultations(app, ctx)

  registerStaff(app, ctx)
  registerDemo(app, ctx)

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
  registerRoster(app, ctx)
  registerEpicrisis(app, ctx)
  registerFollowups(app, ctx)
  registerPrintJobs(app, ctx)
  registerApplications(app, ctx)
  registerDept(app, ctx)
  registerSupplies(app, ctx)
  registerUsage(app, ctx)
  registerSupplySets(app, ctx)
  registerAnesthesia(app, ctx)
  // PQ4 y PQ5 (ronda 16): valoración preanestésica (ligada a la estancia) y recuento quirúrgico (de la nota postquirúrgica)
  registerPreanesthesia(app, ctx)
  registerSurgicalCount(app, ctx)

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
