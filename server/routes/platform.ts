import type { Express } from 'express'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { type Ctx, fail, parse } from '../http.js'
import { slugify } from '../db.js'
import { toAudit, toClinic, toStaff } from '../mappers.js'
import { CLINIC_ROLES, createStaffMember, tempPassword } from '../app.js'
import { DEFAULT_SETTINGS } from '../../src/lib/seed.js'

const CLINIC_STATS = `
  (SELECT COUNT(*)::int FROM staff s WHERE s.clinic_id = c.id) AS staff_count,
  (SELECT COUNT(*)::int FROM patients p WHERE p.clinic_id = c.id AND NOT p.pending) AS patient_count,
  (SELECT COUNT(*)::int FROM appointments a WHERE a.clinic_id = c.id AND a.start >= ? AND a.status <> 'cancelled') AS appt30,
  (SELECT COUNT(*)::int FROM consultations k WHERE k.clinic_id = c.id AND k.date >= ?) AS cons30,
  (SELECT MAX(at) FROM audit l WHERE l.clinic_id = c.id) AS last_activity`

/** Servicios con los que arranca una clínica nueva; cada clínica los ajusta después. */
const STARTER_SERVICES = [['Consulta general', 500], ['Consulta de especialidad', 800], ['Curación', 300], ['Aplicación de inyección', 150]] as const

/**
 * Administración de la plataforma: clínicas y sus usuarios.
 * No da acceso a pacientes, consultas ni cobros de ninguna clínica.
 */
export function registerPlatform(app: Express, { sql, auth, need, userOf, audit }: Ctx) {
  const guard = [auth, need('platform.manage')]
  const since = () => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10) }
  const clinicRow = async (id: string) => (await sql.one('SELECT * FROM clinics WHERE id = ?', [id])) ?? fail(404, 'La clínica no existe.')
  const clinicBody = z.object({
    name: z.string().trim().min(3, 'Escribe el nombre de la clínica.').max(100),
    slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{3,40}$/, 'La dirección de reserva sólo puede tener letras sin acentos, números y guiones.').optional().or(z.literal('').transform(() => undefined)),
    address: z.string().trim().max(200).default(''),
    phone: z.string().trim().max(30).default(''),
    email: z.string().trim().email('El correo de la clínica no es válido.').or(z.literal('')).default(''),
    currency: z.string().trim().min(1).max(4).default('L'),
  })

  app.get('/api/platform/clinics', ...guard, async (_req, res) => {
    const d = since()
    const rows = await sql.query(`SELECT c.*, ${CLINIC_STATS} FROM clinics c ORDER BY c.active DESC, c.name`, [d, d])
    res.json(rows.map(toClinic))
  })

  app.post('/api/platform/clinics', ...guard, async (req, res) => {
    const b = parse(clinicBody.extend({
      admin: z.object({
        name: z.string().trim().min(3, 'Escribe el nombre de quien administrará la clínica.'),
        email: z.string().trim().email('El correo de administración no es válido.'),
      }),
    }), req.body)
    const slug = b.slug ?? slugify(b.name)
    if (await sql.one('SELECT 1 FROM clinics WHERE slug = ?', [slug])) fail(409, `Ya existe una clínica con la dirección de reserva "${slug}". Elige otra.`)
    if (await sql.one('SELECT 1 FROM staff WHERE lower(email) = lower(?)', [b.admin.email])) fail(409, 'Ya existe un usuario con el correo de administración.')
    const id = randomUUID()
    await sql.tx(async (q) => {
      await q.run(`INSERT INTO clinics (id, slug, name, address, phone, email, currency, rx_validity_days, reminder_template, active, created_at) VALUES (?,?,?,?,?,?,?,?,?,TRUE,?)`,
        [id, slug, b.name, b.address, b.phone, b.email, b.currency, DEFAULT_SETTINGS.rxValidityDays, DEFAULT_SETTINGS.reminderTemplate, new Date().toISOString()])
      for (const [name, price] of STARTER_SERVICES) await q.run('INSERT INTO services (id, name, price, active, clinic_id) VALUES (?,?,?,TRUE,?)', [randomUUID(), name, price, id])
    })
    const { user, password } = await createStaffMember(sql, id, { name: b.admin.name, role: 'admin', email: b.admin.email })
    await audit({ id: userOf(req).id, clinicId: id }, `Creó la clínica ${b.name} y su usuario de administración ${b.admin.name}`)
    const d = since()
    res.status(201).json({ clinic: toClinic((await sql.one(`SELECT c.*, ${CLINIC_STATS} FROM clinics c WHERE c.id = ?`, [d, d, id]))!), admin: user, password })
  })

  app.patch('/api/platform/clinics/:id', ...guard, async (req, res) => {
    const row = await clinicRow(String(req.params.id))
    const b = parse(clinicBody.partial().extend({ active: z.boolean().optional() }), req.body)
    if (b.slug && b.slug !== row!.slug && await sql.one('SELECT 1 FROM clinics WHERE slug = ? AND id <> ?', [b.slug, row!.id])) fail(409, `Ya existe una clínica con la dirección de reserva "${b.slug}".`)
    await sql.run('UPDATE clinics SET name = ?, slug = ?, address = ?, phone = ?, email = ?, currency = ?, active = ? WHERE id = ?', [
      b.name ?? row!.name, b.slug ?? row!.slug, 'address' in req.body ? b.address : row!.address, 'phone' in req.body ? b.phone : row!.phone,
      'email' in req.body ? b.email : row!.email, b.currency ?? row!.currency, b.active ?? row!.active, row!.id])
    // Al desactivar una clínica se cierran las sesiones abiertas de su personal
    if (b.active === false) await sql.run('UPDATE staff SET token_version = token_version + 1 WHERE clinic_id = ?', [row!.id])
    const what = b.active === false ? 'Desactivó la clínica' : b.active === true && !row!.active ? 'Reactivó la clínica' : 'Actualizó los datos de la clínica'
    await audit({ id: userOf(req).id, clinicId: String(row!.id) }, `${what} ${b.name ?? row!.name}`)
    const d = since()
    res.json(toClinic((await sql.one(`SELECT c.*, ${CLINIC_STATS} FROM clinics c WHERE c.id = ?`, [d, d, row!.id]))!))
  })

  app.get('/api/platform/clinics/:id/staff', ...guard, async (req, res) => {
    const row = await clinicRow(String(req.params.id))
    res.json((await sql.query('SELECT * FROM staff WHERE clinic_id = ? ORDER BY active DESC, role, name', [row!.id])).map(toStaff))
  })

  app.post('/api/platform/clinics/:id/staff', ...guard, async (req, res) => {
    const row = await clinicRow(String(req.params.id))
    const s = parse(z.object({
      name: z.string().trim().min(3, 'Escribe el nombre completo.'),
      role: z.enum(CLINIC_ROLES),
      email: z.string().trim().email('El correo no es válido.'),
      specialty: z.string().trim().optional(),
      license: z.string().trim().optional(),
    }), req.body)
    const r = await createStaffMember(sql, String(row!.id), s)
    await audit({ id: userOf(req).id, clinicId: String(row!.id) }, `Creó el usuario ${s.name} (${s.role})`)
    res.status(201).json(r)
  })

  const platformStaff = async (id: string) => {
    const row = (await sql.one('SELECT * FROM staff WHERE id = ?', [id])) ?? fail(404, 'El usuario no existe.')
    if (!row!.clinic_id) fail(403, 'Las cuentas de administración de la plataforma se gestionan desde el servidor.')
    return row!
  }

  app.patch('/api/platform/staff/:id', ...guard, async (req, res) => {
    const row = await platformStaff(String(req.params.id))
    const b = parse(z.object({ active: z.boolean().optional(), role: z.enum(CLINIC_ROLES).optional(), twoFactor: z.literal(false).optional() }), req.body)
    if (b.active !== undefined) await sql.run('UPDATE staff SET active = ?, token_version = token_version + 1 WHERE id = ?', [b.active, row.id])
    if (b.role) await sql.run('UPDATE staff SET role = ?, token_version = token_version + 1 WHERE id = ?', [b.role, row.id])
    if (b.twoFactor === false) await sql.run('UPDATE staff SET totp_enabled = FALSE, totp_secret = NULL WHERE id = ?', [row.id])
    const what = b.active === false ? 'Desactivó a' : b.active ? 'Reactivó a' : b.role ? 'Cambió el rol de' : 'Quitó la verificación en dos pasos de'
    await audit({ id: userOf(req).id, clinicId: String(row.clinic_id) }, `${what} ${row.name}`)
    res.json(toStaff((await sql.one('SELECT * FROM staff WHERE id = ?', [row.id]))!))
  })

  app.post('/api/platform/staff/:id/reset-password', ...guard, async (req, res) => {
    const row = await platformStaff(String(req.params.id))
    const password = tempPassword()
    await sql.run('UPDATE staff SET password_hash = ?, token_version = token_version + 1 WHERE id = ?', [bcrypt.hashSync(password, 10), row.id])
    await audit({ id: userOf(req).id, clinicId: String(row.clinic_id) }, `Restableció la contraseña de ${row.name}`)
    res.json({ password })
  })

  /** Bitácora de la plataforma: sólo acciones de la administración de Clinara, sin datos de pacientes. */
  app.get('/api/platform/activity', ...guard, async (_req, res) => {
    const rows = await sql.query(`SELECT l.*, c.name AS clinic_name FROM audit l JOIN staff s ON s.id = l.user_id AND s.role = 'superadmin'
      LEFT JOIN clinics c ON c.id = l.clinic_id ORDER BY l.id DESC LIMIT 200`)
    res.json(rows.map((r) => ({ ...toAudit(r), clinicName: r.clinic_name ?? undefined })))
  })
}
