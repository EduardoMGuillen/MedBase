import bcrypt from 'bcryptjs'
import { randomBytes, randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Sql } from './sql.js'
import { fail, hasRoleSql } from './http.js'
import { toStaff } from './mappers.js'
import { ROLES_BY_KIND } from '../src/lib/permissions.js'
import { positionOf } from '../src/lib/positions.js'
import { NURSE_DEFAULT_POSITION } from '../src/lib/clinicalConfig.js'
import { scheduleFromWeek, scheduleProblems, SLOT_OPTIONS, weekOf } from '../src/lib/schedule.js'

/**
 * Personal de una clínica: alta, roles, cargos y horarios. Sin Express: lo usan las rutas de personal, de configuración
 * y de la plataforma (antes vivía al final de server/app.ts y esas rutas lo importaban de vuelta).
 */
const COLORS = ['#2335C9', '#0F8A6E', '#B4407A', '#C27A12', '#6A4BC4', '#2C7DA0', '#5B6472']
export const CLINIC_ROLES = ['admin', 'doctor', 'nurse', 'reception', 'assistant', 'lab', 'imaging'] as const
const ROLES = CLINIC_ROLES

export const tempPassword = () => randomBytes(6).toString('base64url')

export const hhmm = z.string().regex(/^\d{2}:\d{2}$/, 'Escribe la hora como 08:00.')
/** Horario de un médico: el formato anterior (una franja para todos los días) o franjas por día. */
export const scheduleInput = z.object({
  days: z.array(z.number().int().min(0).max(6)).optional(),
  start: hhmm.optional(), end: hhmm.optional(),
  slot: z.number().int().refine((n) => SLOT_OPTIONS.includes(n), 'El intervalo de la agenda no es válido.'),
  week: z.record(z.string().regex(/^[0-6]$/), z.array(z.object({ start: hhmm, end: hhmm })).max(4)).optional(),
}).superRefine((s, ctx) => {
  const problems = scheduleProblems(weekOf({ days: s.days ?? [], start: s.start ?? '', end: s.end ?? '', slot: s.slot, week: s.week }))
  if (problems.length) ctx.addIssue({ code: 'custom', message: problems[0] })
})
/** Se guarda siempre con las franjas por día y los campos anteriores derivados de ellas. */
export const cleanSchedule = (s: z.infer<typeof scheduleInput>) => scheduleFromWeek(weekOf({ days: s.days ?? [], start: s.start ?? '', end: s.end ?? '', slot: s.slot, week: s.week }), s.slot)

/** Crea un usuario dentro de una clínica y devuelve su contraseña temporal. */
export async function createStaffMember(sql: Sql, clinicId: string, s: { name: string; role: (typeof ROLES)[number]; email: string; specialty?: string; license?: string; position?: string }) {
  if (s.role === 'doctor' && !s.license) fail(400, 'Para un médico escribe su número de colegiación.')
  await assertRoleFits(sql, clinicId, s.role)
  if (await sql.one('SELECT 1 FROM staff WHERE lower(email) = lower(?)', [s.email])) fail(409, 'Ya existe un usuario con ese correo.')
  const id = randomUUID()
  const password = tempPassword()
  const count = Number((await sql.one<{ n: number }>('SELECT COUNT(*)::int AS n FROM staff WHERE clinic_id = ?', [clinicId]))!.n)
  const service = s.role === 'doctor' ? await sql.one(`SELECT id FROM services WHERE clinic_id = ? AND active ORDER BY name LIMIT 1`, [clinicId]) : undefined
  const schedule = s.role === 'doctor' ? JSON.stringify(scheduleFromWeek({ 1: [{ start: '08:00', end: '17:00' }], 2: [{ start: '08:00', end: '17:00' }], 3: [{ start: '08:00', end: '17:00' }], 4: [{ start: '08:00', end: '17:00' }], 5: [{ start: '08:00', end: '17:00' }] }, 30)) : null
  await sql.run(`INSERT INTO staff (id,name,role,specialty,email,license,color,active,password_hash,schedule,service_id,clinic_id,roles,position) VALUES (?,?,?,?,?,?,?,TRUE,?,?,?,?,?,?)`,
    [id, s.name, s.role, s.specialty || null, s.email, s.license || null, COLORS[count % COLORS.length], bcrypt.hashSync(password, 10),
      schedule, service ? String(service.id) : null, clinicId, JSON.stringify([s.role]), s.role === 'lab' || s.role === 'imaging' || s.role === 'nurse' ? s.position ?? null : null])
  return { user: toStaff((await sql.one('SELECT * FROM staff WHERE id = ?', [id]))!), password }
}


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
export async function giveDoctorDefaults(q: Sql, clinicId: string, staffId: string) {
  const service = await q.one(`SELECT id FROM services WHERE clinic_id = ? AND active ORDER BY name LIMIT 1`, [clinicId])
  const week = Object.fromEntries([1, 2, 3, 4, 5].map((d) => [d, [{ start: '08:00', end: '17:00' }]]))
  await q.run('UPDATE staff SET schedule = COALESCE(schedule, ?), service_id = COALESCE(service_id, ?) WHERE id = ?',
    [JSON.stringify(scheduleFromWeek(week, 30)), service ? String(service.id) : null, staffId])
}

/**
 * DP1 (ronda 11): Laboratorio e Imágenes llevan cargo obligatorio, del departamento que corresponde (una persona trabaja en
 * uno solo), y Microbiólogo o Radiólogo, número de colegiación.
 */
/** EN1 (ronda 16): el puesto de enfermería elegido (debe ser de enfermería) o, si no se eligió, el de auxiliar. */
export function nursePosition(position: string | undefined, name: string) {
  if (!position) return NURSE_DEFAULT_POSITION
  if (positionOf(position)?.dept !== 'nursing') fail(400, `Elige el puesto de ${name} en Enfermería: Licenciado(a) o Auxiliar.`)
  return position
}

export function checkPosition(roles: string[], position: string | undefined, license: string | undefined, name: string) {
  const depts = roles.filter((r) => r === 'lab' || r === 'imaging')
  if (!depts.length) return
  if (depts.length > 1) fail(400, 'Una persona trabaja en Laboratorio o en Imágenes, no en los dos.')
  const pos = positionOf(position)
  if (!pos) fail(400, `Elige el cargo de ${name} en ${depts[0] === 'lab' ? 'Laboratorio' : 'Imágenes'}.`)
  if (pos!.dept !== depts[0]) fail(400, `«${pos!.label}» no es un cargo de ${depts[0] === 'lab' ? 'Laboratorio' : 'Imágenes'}.`)
  if (pos!.license && !license?.trim()) fail(400, `Escribe el número de colegiación de ${name} (${pos!.licenseBody}).`)
}
