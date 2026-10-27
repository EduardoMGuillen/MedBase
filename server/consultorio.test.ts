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
