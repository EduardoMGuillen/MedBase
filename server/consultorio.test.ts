import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import bcrypt from 'bcryptjs'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb } from './db.js'
import { createSql, type Sql } from './sql.js'
import { permissionsFor, ROLE_PERMISSIONS } from '../src/lib/permissions.js'
import type { Role } from '../src/lib/types.js'

let server: Server
let sql: Sql
let base = ''

before(async () => {
  sql = createSql({ memory: true })
  await ensureDb(sql)
  const app = createApp({ sql, jwtSecret: 'test-secret', demoMode: true })
  await new Promise<void>((r) => { server = app.listen(0, () => r()) })
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
after(async () => { server.close(); await sql.close() })

/** Cliente mínimo que conserva la cookie de sesión. */
async function as(email: string, password = DEMO_PASSWORD) {
  const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })
  const login = await res.json() as any
  const cookie = res.headers.get('set-cookie')?.split(';')[0] ?? ''
  const call = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(`${base}${path}`, { method, headers: { cookie, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    return { status: r.status, body: await r.json() as any }
  }
  return { login, get: (p: string) => call('GET', p), post: (p: string, b?: unknown) => call('POST', p, b), patch: (p: string, b: unknown) => call('PATCH', p, b), put: (p: string, b: unknown) => call('PUT', p, b) }
}

/** Consultorio de prueba con su médico titular y una asistente, creado directo en la base. */
async function office(slug: string) {
  const hash = bcrypt.hashSync(DEMO_PASSWORD, 4)
  const id = `of-${slug}`
  await sql.run(`INSERT INTO clinics (id, slug, name, address, phone, email, currency, rx_validity_days, reminder_template, active, created_at, kind, owner_id)
    VALUES (?,?,?,?,?,?, 'L', 30, '', TRUE, ?, 'office', ?)`, [id, slug, `Consultorio ${slug}`, 'Col. Kennedy', '2222-0000', '', new Date().toISOString(), `${id}-doc`])
  await sql.run(`INSERT INTO staff (id, name, role, email, license, color, active, password_hash, clinic_id) VALUES (?,?,?,?,?,?,TRUE,?,?)`, [`${id}-doc`, 'Dra. Prueba', 'doctor', `${slug}-doc@test.hn`, 'CMH-1', '#2335C9', hash, id])
  await sql.run(`INSERT INTO staff (id, name, role, email, color, active, password_hash, clinic_id) VALUES (?,?,?,?,?,TRUE,?,?)`, [`${id}-asi`, 'Asistente Prueba', 'assistant', `${slug}-asi@test.hn`, '#0F8A6E', hash, id])
  return { id, doc: await as(`${slug}-doc@test.hn`), asi: await as(`${slug}-asi@test.hn`) }
}

describe('C1 permisos por tipo de cuenta', () => {
  test('en una clínica cada rol conserva exactamente sus permisos', async () => {
    for (const role of ['admin', 'doctor', 'nurse', 'reception'] as Role[]) assert.deepEqual(permissionsFor(role, 'clinic'), ROLE_PERMISSIONS[role])
    const nurse = await as('crios@demo.clinara')
    assert.deepEqual(nurse.login.permissions, ROLE_PERMISSIONS.nurse)
    assert.equal(nurse.login.user.clinicKind, 'clinic')
  })
  test('el médico titular administra su consultorio; la asistente no', async () => {
    const o = await office('c1')
    for (const p of ['consult.write', 'rx.write', 'settings.manage', 'reports.view', 'audit.view', 'staff.manage', 'billing.manage', 'checkin.manage']) assert.ok(o.doc.login.permissions.includes(p), p)
    for (const p of ['agenda.manage', 'checkin.manage', 'vitals.record', 'billing.manage', 'inpatient.care']) assert.ok(o.asi.login.permissions.includes(p), p)
    for (const p of ['consult.write', 'rx.write', 'settings.manage', 'reports.view', 'inpatient.orders']) assert.ok(!o.asi.login.permissions.includes(p), p)
    // El servidor valida, no sólo el menú
    assert.equal((await o.doc.get('/api/reports?from=2026-01-01&to=2026-12-31')).status, 200)
    assert.equal((await o.asi.get('/api/reports?from=2026-01-01&to=2026-12-31')).status, 403)
    assert.equal((await o.asi.post('/api/prescriptions', { guest: { name: 'Ana Prueba' }, items: [{ drug: 'X', dose: '1', frequency: 'Dosis única' }] })).status, 403)
  })
  test('un consultorio no tiene camas ni hospitalización; sólo agrega asistentes', async () => {
    const o = await office('c1b')
    assert.equal((await o.doc.post('/api/beds', { room: '1', specialty: 'General' })).status, 409)
    const p = await o.doc.post('/api/patients', { firstName: 'Luis', lastName: 'Mora', birthDate: '1980-01-01', sex: 'M', phone: '9999-0000' })
    assert.equal((await o.doc.post('/api/inpatient', { patientId: p.body.id, bedId: 'x', reason: 'Prueba', diagnoses: [{ code: 'A', label: 'B' }] })).status, 409)
    assert.equal((await o.doc.post('/api/staff', { name: 'Otro Médico', role: 'doctor', email: 'otro@test.hn', license: 'CMH-2' })).status, 400)
    assert.equal((await o.doc.post('/api/staff', { name: 'Recepción X', role: 'reception', email: 'rx@test.hn' })).status, 400)
    assert.equal((await o.doc.post('/api/staff', { name: 'Segunda Asistente', role: 'assistant', email: 'a2@test.hn' })).status, 201)
    assert.equal((await o.doc.post('/api/staff', { name: 'Tercera Asistente', role: 'assistant', email: 'a3@test.hn' })).status, 400, 'máximo 2')
    // Una clínica no recibe asistentes
    assert.equal((await (await as('admin@demo.clinara')).post('/api/staff', { name: 'Asistente X', role: 'assistant', email: 'ax@test.hn' })).status, 400)
  })
})

describe('C2 crear un consultorio', () => {
  test('Administración de Clinara lo crea con su médico titular, que entra y lo administra', async () => {
    const sa = await as('superadmin@demo.clinara')
    const r = await sa.post('/api/platform/clinics', { kind: 'office', name: 'Consultorio Dra. Ana Rivera', address: 'Col. Palmira', phone: '2232-0000',
      owner: { name: 'Dra. Ana Rivera', email: 'arivera@test.hn', license: 'CMH-777', specialty: 'Medicina general' } })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    assert.equal(r.body.clinic.kind, 'office')
    assert.equal(r.body.clinic.slug, 'ana-rivera')
    assert.equal(r.body.admin.role, 'doctor')
    assert.equal(r.body.clinic.ownerId, r.body.admin.id)
    const doc = await as('arivera@test.hn', r.body.password)
    assert.equal(doc.login.user.clinicKind, 'office')
    assert.ok(doc.login.permissions.includes('settings.manage'))
    const boot = (await doc.get('/api/bootstrap')).body
    assert.deepEqual(boot.services.map((s: any) => s.name).sort(), ['Aplicación de inyección', 'Consulta', 'Control o reconsulta', 'Curación'])
    // Sin datos del médico no se crea; el correo de alguien de una clínica no se repite
    assert.equal((await sa.post('/api/platform/clinics', { kind: 'office', name: 'Consultorio X' })).status, 400)
    assert.equal((await sa.post('/api/platform/clinics', { kind: 'office', name: 'Consultorio Y', owner: { name: 'Dra. Lucía Herrera', email: 'lherrera@demo.clinara', license: 'CMH-1' } })).status, 409)
    // Desde la plataforma tampoco se le agrega un segundo médico
    assert.equal((await sa.post(`/api/platform/clinics/${r.body.clinic.id}/staff`, { name: 'Otro Médico', role: 'doctor', email: 'om@test.hn', license: 'CMH-9' })).status, 400)
    assert.equal((await sa.post(`/api/platform/clinics/${r.body.clinic.id}/staff`, { name: 'Asistente Rivera', role: 'assistant', email: 'asr@test.hn' })).status, 201)
  })
})

describe('C3 primer ingreso', () => {
  test('el titular guarda sus datos y marca la configuración como hecha una sola vez', async () => {
    const o = await office('c3')
    let s = (await o.doc.get('/api/bootstrap')).body.settings
    assert.equal(s.kind, 'office')
    assert.equal(s.setupDoneAt, undefined)
    const saved = await o.doc.put('/api/settings', { ...s, address: 'Col. Kennedy, bloque 5', phone: '2230-1111', specialty: 'Pediatría', license: 'CMH-555' })
    assert.equal(saved.status, 200, JSON.stringify(saved.body))
    assert.equal(saved.body.specialty, 'Pediatría')
    const done = await o.doc.post('/api/settings/setup-done')
    assert.ok(done.body.setupDoneAt)
    assert.equal((await o.doc.post('/api/settings/setup-done')).body.setupDoneAt, done.body.setupDoneAt)
    assert.equal((await o.asi.post('/api/settings/setup-done')).status, 403)
    s = (await o.doc.get('/api/bootstrap')).body.settings
    assert.equal(s.license, 'CMH-555')
  })
})

describe('C4 un solo médico', () => {
  test('la reserva en línea del consultorio trae su único médico y el tipo de cuenta', async () => {
    await office('c4')
    const c = await (await fetch(`${base}/api/public/c4/clinic`)).json() as any
    assert.equal(c.kind, 'office')
    assert.equal(c.doctors.length, 1)
    assert.equal(c.doctors[0].name, 'Dra. Prueba')
  })
  test('la consulta de un consultorio no hospitaliza', async () => {
    const o = await office('c4b')
    const p = await o.asi.post('/api/patients', { firstName: 'Ana', lastName: 'Ruiz', birthDate: '1990-01-01', sex: 'F', phone: '9999-1111', dni: '0801199011111' })
    const w = await o.asi.post('/api/appointments/walk-in', { patientId: p.body.id, doctorId: 'of-c4b-doc', reason: 'Dolor' })
    assert.equal(w.status, 201, JSON.stringify(w.body))
    await o.doc.post(`/api/appointments/${w.body.id}/status`, { status: 'in_consult' })
    const dx = [{ code: 'R10', label: 'Dolor abdominal' }]
    assert.equal((await o.doc.post('/api/consultations', { appointmentId: w.body.id, reason: 'Dolor', diagnoses: dx, orders: ['Reposo.'], admit: true })).status, 400)
    assert.equal((await o.doc.post('/api/consultations', { appointmentId: w.body.id, reason: 'Dolor', diagnoses: dx, orders: ['Reposo.'] })).status, 201)
  })
})

describe('C5 documentos con el nombre del médico', () => {
  test('la constancia y la autorización de un consultorio quedan marcadas para el encabezado del médico', async () => {
    const o = await office('c5')
    const p = await o.doc.post('/api/patients', { firstName: 'Rosa', lastName: 'Paz', birthDate: '1985-01-01', sex: 'F', phone: '9999-2222', dni: '0801198522222' })
    const c = await o.doc.post('/api/certificates', { patientId: p.body.id, kind: 'attention', to: 'A quien corresponda', visitDate: '2026-10-26', fromTime: '08:00', toTime: '09:00' })
    assert.equal(c.status, 201, JSON.stringify(c.body))
    assert.equal(c.body.data.clinic.office, true)
    const clinic = await (await as('lherrera@demo.clinara')).post('/api/certificates', { patientId: 'p2', kind: 'attention', to: 'A quien corresponda', visitDate: '2026-10-26', fromTime: '08:00', toTime: '09:00' })
    assert.equal(clinic.body.data.clinic.office, undefined, 'una clínica no cambia')
  })
})

describe('C6 asistentes y paso a clínica', () => {
  test('el consultorio se convierte en clínica sin perder datos y con los permisos de clínica', async () => {
    const o = await office('c6')
    const p = await o.asi.post('/api/patients', { firstName: 'Mario', lastName: 'Cruz', birthDate: '1970-05-05', sex: 'M', phone: '9999-3333' })
    assert.equal(p.status, 201)
    const count = async () => Number((await sql.one<{ n: number }>('SELECT COUNT(*)::int AS n FROM patients WHERE clinic_id = ?', [o.id]))!.n)
    const before = await count()
    assert.equal((await o.asi.post('/api/settings/convert-to-clinic', { admin: { name: 'Admin Uno', email: 'admin-c6@test.hn' } })).status, 403)
    assert.equal((await o.doc.post('/api/settings/convert-to-clinic', { admin: { name: 'Admin Uno', email: 'c6-doc@test.hn' } })).status, 409, 'otro correo')
    const r = await o.doc.post('/api/settings/convert-to-clinic', { admin: { name: 'Admin Uno', email: 'admin-c6@test.hn' }, assistants: { 'of-c6-asi': 'nurse' } })
    assert.equal(r.status, 200, JSON.stringify(r.body))
    assert.equal(r.body.settings.kind, 'clinic')
    assert.equal(r.body.admin.role, 'admin')
    assert.equal(await count(), before)
    assert.equal((await sql.one(`SELECT role FROM staff WHERE id = 'of-c6-asi'`))!.role, 'nurse')
    // El médico ya no administra; la administración sí, y ahora la clínica puede sumar médicos
    assert.equal((await o.doc.get('/api/reports?from=2026-01-01&to=2026-12-31')).status, 403)
    const admin = await as('admin-c6@test.hn', r.body.password)
    assert.equal((await admin.post('/api/staff', { name: 'Dr. Nuevo', role: 'doctor', email: 'nuevo-c6@test.hn', license: 'CMH-3' })).status, 201)
    assert.equal((await o.doc.post('/api/settings/convert-to-clinic', { admin: { name: 'X', email: 'x@test.hn' } })).status, 403)
  })
})

describe('C7 observación opcional en el consultorio', () => {
  test('con observación, la asistente aplica la dosis; sin ella, la consulta sólo emite receta', async () => {
    const o = await office('c7')
    const p = await o.asi.post('/api/patients', { firstName: 'Lía', lastName: 'Soto', birthDate: '1992-02-02', sex: 'F', phone: '9999-4444', dni: '0801199244444' })
    const visit = async () => {
      const w = await o.asi.post('/api/appointments/walk-in', { patientId: p.body.id, doctorId: 'of-c7-doc', reason: 'Vómitos' })
      await o.doc.post(`/api/appointments/${w.body.id}/status`, { status: 'in_consult' })
      return String(w.body.id)
    }
    const dx = [{ code: 'DD90.1', label: 'Gastroenteritis' }]
    const shot = { drug: 'Dimenhidrinato', presentation: 'Ampolla 50 mg', dose: '50 mg', route: 'Intramuscular', frequency: 'Dosis única', duration: '', applyInClinic: true }
    const c = await o.doc.post('/api/consultations', { appointmentId: await visit(), reason: 'Vómitos', diagnoses: dx, orders: [], items: [shot] })
    assert.equal(c.status, 201, JSON.stringify(c.body))
    assert.equal(c.body.stayKind, 'observation')
    const med = (await o.asi.get(`/api/inpatient/${c.body.hospitalizationId}`)).body.meds[0]
    assert.equal((await o.asi.post(`/api/inpatient/meds/${med.id}/doses`, { scheduledAt: med.firstAt })).status, 201, 'la asistente aplica')
    assert.equal((await o.asi.post(`/api/inpatient/${c.body.hospitalizationId}/notes`, { kind: 'evolution', subjective: 'S', objective: 'O', assessment: 'A', plan: 'P' })).status, 403, 'la asistente no escribe notas')
    await o.doc.post(`/api/inpatient/${c.body.hospitalizationId}/discharge`, { diagnoses: dx, summary: 'Mejoró tras la aplicación.', condition: 'Mejorado' })
    // Sin observación
    const s = (await o.doc.get('/api/bootstrap')).body.settings
    assert.equal((await o.doc.put('/api/settings', { ...s, address: 'Col. Kennedy', phone: '2222-0000', observationEnabled: false })).status, 200)
    const appt = await visit()
    assert.equal((await o.doc.post('/api/consultations', { appointmentId: appt, reason: 'Vómitos', diagnoses: dx, orders: [], items: [shot] })).status, 400)
    assert.equal((await o.doc.post('/api/consultations', { appointmentId: appt, reason: 'Vómitos', diagnoses: dx, orders: ['Reposo.'], observe: true })).status, 400)
    assert.equal((await o.doc.post('/api/consultations', { appointmentId: appt, reason: 'Vómitos', diagnoses: dx, orders: ['Reposo.'] })).status, 201)
  })
})

describe('C8 consultorio de demostración', () => {
  test('la demo trae el consultorio con su médico, su asistente, agenda, recetas y una paciente en observación', async () => {
    const accounts = (await (await fetch(`${base}/api/demo-accounts`)).json() as any).accounts
    assert.ok(accounts.some((a: any) => a.email === 'alopez@demo.clinara' && a.clinicName === 'Consultorio Dra. Ana López'))
    assert.ok(accounts.some((a: any) => a.email === 'asistente@demo.clinara' && a.role === 'assistant'))
    const doc = await as('alopez@demo.clinara')
    assert.equal(doc.login.user.clinicKind, 'office')
    const boot = (await doc.get('/api/bootstrap')).body
    assert.ok(boot.settings.setupDoneAt, 'sin asistente de primer ingreso en la demo')
    assert.equal(boot.patients.length, 8)
    assert.ok(boot.appointments.some((a: any) => a.status === 'triaged'))
    const obs = boot.inpatients.find((h: any) => h.kind === 'observation')
    assert.ok(obs)
    const file = (await doc.get(`/api/inpatient/${obs.id}`)).body
    assert.deepEqual(file.meds.map((m: any) => m.drug), ['Dimenhidrinato'])
    assert.equal(file.authorizations[0].template, 'hospital')
    // No ve nada de la clínica Santa Brígida
    assert.equal((await doc.get('/api/patients/p1/chart')).status, 404)
  })
})
