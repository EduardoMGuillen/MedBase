import bcrypt from 'bcryptjs'
import type { Sql } from './sql.js'
import { DEMO_PASSWORD } from './db.js'
import { scheduleFromWeek, type Week } from '../src/lib/schedule.js'

/**
 * Usuarios demo para probar casos que el personal base no cubre: varios roles en una persona, estados de cuenta
 * (desactivada, con verificación en dos pasos), médicos sin horario, especialidades quirúrgicas, un consultorio con el
 * máximo de asistentes, una clínica suspendida y un consultorio recién creado que todavía no termina su configuración.
 *
 * Los ID se eligieron para ordenar después del personal base de cada clínica: la demo diaria toma «la enfermera»,
 * «la cajera» y «la administración» por orden de ID, y así siguen siendo las mismas.
 *
 * Todos los nombres, correos y colegiaciones son inventados.
 */

/** Secreto TOTP fijo de la Dra. Gálvez, para agregarlo a Google o Microsoft Authenticator al probar el login con código. */
export const DEMO_TOTP_SECRET = 'CLINARADEMO2FA7Q'

export const SUSPENDED_CLINIC = 'c-sm'
export const PENDING_OFFICE = 'c-lt'

const MAIN = 'c-sb'
const SECOND = 'c-sl'
const OFFICE = 'c-al'

const days = (list: number[], ...slots: [string, string][]): Week => Object.fromEntries(list.map((d) => [d, slots.map(([start, end]) => ({ start, end }))]))

export interface ExtraDemoUser {
  id: string; clinicId: string; name: string; email: string; role: string; roles: string[]; specialty?: string; license?: string; color: string
  active?: boolean; week?: Week; serviceId?: string; totp?: boolean
  /** Para qué sirve en las pruebas (README). */
  caso: string
}

export const EXTRA_DEMO_USERS: ExtraDemoUser[] = [
  // Clínica Santa Brígida
  { id: 's-villeda', clinicId: MAIN, name: 'Dr. Mauricio Villeda', email: 'mvilleda@demo.clinara', role: 'doctor', roles: ['doctor', 'admin'], specialty: 'Medicina interna',
    license: 'CMH-20905', color: '#3D5A80', week: days([1, 3], ['08:00', '12:00']), serviceId: 'svc-mi', caso: 'Director médico: médico y administración, cambia de vista' },
  { id: 's-nolasco', clinicId: MAIN, name: 'Dr. Hugo Nolasco', email: 'hnolasco@demo.clinara', role: 'doctor', roles: ['doctor'], specialty: 'Cirugía general',
    license: 'CMH-20784', color: '#7A3E9D', week: days([2, 4], ['13:00', '17:00']), serviceId: 'svc-cir', caso: 'Cirujano: consulta de cirugía y hoja de anestesia' },
  { id: 's-arita', clinicId: MAIN, name: 'Dra. Silvia Arita', email: 'sarita@demo.clinara', role: 'doctor', roles: ['doctor'], specialty: 'Anestesiología',
    license: 'CMH-20891', color: '#1F7A8C', caso: 'Anestesióloga sin horario: no da consulta externa ni ofrece horas en la reserva en línea; llena y firma la hoja de anestesia' },
  { id: 's-galvez', clinicId: MAIN, name: 'Dra. Teresa Gálvez', email: 'tgalvez@demo.clinara', role: 'doctor', roles: ['doctor'], specialty: 'Dermatología',
    license: 'CMH-21010', color: '#C0392B', week: days([5], ['08:00', '12:00']), serviceId: 'svc-der', totp: true,
    caso: `Verificación en dos pasos activa: pide el código de 6 dígitos (secreto ${DEMO_TOTP_SECRET})` },
  { id: 's-oseguera', clinicId: MAIN, name: 'Dr. Julio Oseguera', email: 'joseguera@demo.clinara', role: 'doctor', roles: ['doctor'], specialty: 'Medicina general',
    license: 'CMH-19876', color: '#7F8C8D', active: false, caso: 'Cuenta desactivada: el login la rechaza y no aparece en agenda ni reserva' },
  { id: 's-vallecillo', clinicId: MAIN, name: 'Aux. Rosa Vallecillo', email: 'rvallecillo@demo.clinara', role: 'nurse', roles: ['nurse'], color: '#D35400',
    caso: 'Auxiliar de enfermería: firma con «Aux.»' },
  { id: 's-yanes', clinicId: MAIN, name: 'Gabriel Yanes', email: 'gyanes@demo.clinara', role: 'reception', roles: ['reception', 'nurse'], color: '#8E44AD',
    caso: 'Recepción y enfermería en la misma persona (turno de fin de semana)' },
  // Centro Médico San Lucas
  { id: 's2-ochoa', clinicId: SECOND, name: 'Dra. Carolina Ochoa', email: 'cochoa@demo.clinara', role: 'doctor', roles: ['doctor'], specialty: 'Pediatría',
    license: 'CMH-21122', color: '#16A085', week: days([1, 2, 3, 4, 5], ['07:00', '13:00']), serviceId: 'sl-svc-gen', caso: 'Segundo médico de la otra clínica' },
  // Consultorio: la segunda asistente (el máximo de la cuenta)
  { id: 's3-rodas', clinicId: OFFICE, name: 'Ana Rodas', email: 'arodas@demo.clinara', role: 'assistant', roles: ['assistant'], color: '#B9770E',
    caso: 'Segunda asistente: el consultorio queda en su máximo de 2' },
  // Clínica suspendida
  { id: 's4-rodezno', clinicId: SUSPENDED_CLINIC, name: 'Pablo Rodezno', email: 'prodezno@demo.clinara', role: 'admin', roles: ['admin'], color: '#5B6472',
    caso: 'Su clínica está suspendida: el login avisa que la clínica está desactivada' },
  // Consultorio nuevo, sin configurar
  { id: 's5-trochez', clinicId: PENDING_OFFICE, name: 'Dr. Luis Trochez', email: 'ltrochez@demo.clinara', role: 'admin', roles: ['doctor', 'admin'], specialty: 'Medicina familiar',
    license: 'CMH-21233', color: '#2335C9', caso: 'Consultorio recién creado: al entrar abre el asistente de configuración de 3 pasos' },
]

const EXTRA_CLINICS = [
  { id: SUSPENDED_CLINIC, slug: 'san-miguel', name: 'Clínica San Miguel', kind: 'clinic', active: false, address: 'Choluteca, Barrio El Centro, 3.ª avenida',
    phone: '+504 2782-4410', email: 'info@clinicasanmiguel.hn', services: [['Consulta general', 500], ['Curación', 300]] as const },
  { id: PENDING_OFFICE, slug: 'luis-trochez', name: 'Consultorio Dr. Luis Trochez', kind: 'office', active: true, owner: 's5-trochez', specialty: 'Medicina familiar', license: 'CMH-21233',
    address: '', phone: '', email: '', services: [['Consulta', 500], ['Control o reconsulta', 300], ['Aplicación de inyección', 150], ['Curación', 300]] as const },
]

const EXTRA_SERVICES = [
  { id: 'svc-cir', clinicId: MAIN, name: 'Consulta de cirugía general', price: 1000 },
  { id: 'svc-der', clinicId: MAIN, name: 'Consulta de dermatología', price: 900 },
]

const REMINDER = 'Hola {paciente}, le recordamos su cita con {medico} el {fecha} a las {hora}. Responda SÍ para confirmar o llame al {telefono} si necesita cambiarla.'

/**
 * Inserta las clínicas, servicios y usuarios de `EXTRA_DEMO_USERS` que falten. Idempotente; solo corre en una base de
 * demostración (con la Dra. Solórzano de la demo en Santa Brígida) y nunca toca a quien ya exista con ese ID o correo.
 */
export async function insertExtraDemoUsers(q: Sql) {
  if (!(await q.one(`SELECT 1 FROM staff WHERE id = 's-solorzano' AND clinic_id = ? AND email LIKE '%@demo.clinara'`, [MAIN]))) return
  const now = new Date().toISOString()
  for (const c of EXTRA_CLINICS) {
    if (await q.one('SELECT 1 FROM clinics WHERE id = ? OR slug = ?', [c.id, c.slug])) continue
    // El consultorio queda sin setup_done_at: su titular ve el asistente de configuración al entrar
    await q.run(`INSERT INTO clinics (id, slug, name, address, phone, email, currency, rx_validity_days, reminder_template, active, created_at, kind, specialty, license)
      VALUES (?,?,?,?,?,?,'L',30,?,?,?,?,?,?)`,
    [c.id, c.slug, c.name, c.address, c.phone, c.email, REMINDER, c.active, now, c.kind, 'specialty' in c ? c.specialty : null, 'license' in c ? c.license : null])
    for (const [i, [name, price]] of c.services.entries()) {
      await q.run('INSERT INTO services (id, name, price, active, clinic_id) VALUES (?,?,?,TRUE,?) ON CONFLICT DO NOTHING', [`${c.id}-svc-${i + 1}`, name, price, c.id])
    }
  }
  const clinics = new Set((await q.query('SELECT id FROM clinics')).map((r) => String(r.id)))
  for (const s of EXTRA_SERVICES) {
    if (clinics.has(s.clinicId)) await q.run('INSERT INTO services (id, name, price, active, clinic_id) VALUES (?,?,?,TRUE,?) ON CONFLICT DO NOTHING', [s.id, s.name, s.price, s.clinicId])
  }
  const hash = bcrypt.hashSync(DEMO_PASSWORD, 10)
  for (const u of EXTRA_DEMO_USERS) {
    if (!clinics.has(u.clinicId)) continue
    if (await q.one('SELECT 1 FROM staff WHERE id = ? OR lower(email) = ?', [u.id, u.email])) continue
    const doctor = u.roles.includes('doctor')
    const service = u.serviceId ? await q.one('SELECT id FROM services WHERE id = ? AND clinic_id = ?', [u.serviceId, u.clinicId]) : undefined
    await q.run(`INSERT INTO staff (id, name, role, roles, specialty, email, license, color, active, password_hash, schedule, service_id, clinic_id, totp_secret, totp_enabled, prefs)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [u.id, u.name, u.role, JSON.stringify(u.roles), u.specialty ?? null, u.email, u.license ?? null, u.color, u.active ?? true, hash,
      u.week ? JSON.stringify(scheduleFromWeek(u.week, 30)) : null, service ? String(service.id) : null, u.clinicId,
      u.totp ? DEMO_TOTP_SECRET : null, !!u.totp, doctor ? JSON.stringify({ rxValidityDays: 30 }) : null])
  }
  await q.run('UPDATE clinics SET owner_id = ? WHERE id = ? AND owner_id IS NULL', ['s5-trochez', PENDING_OFFICE])
}
