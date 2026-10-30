import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb, migrateRxValidity } from './db.js'
import { createSql, type Sql } from './sql.js'

let server: Server
let sql: Sql
let base = ''

before(async () => {
  sql = createSql({ memory: true })
  await ensureDb(sql)
  const app = createApp({ sql, jwtSecret: 'test-secret', demoMode: true })
  await new Promise<void>((r) => { server = app.listen(0, () => r()) })
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const admin = await as('admin@demo.clinara')
  const all = Object.fromEntries(['0', '1', '2', '3', '4', '5', '6'].map((d) => [d, [{ start: '00:00', end: '23:45' }]]))
  await admin.patch('/api/staff/s-herrera/schedule', { slot: 15, week: all })
})
after(async () => { server.close(); await sql.close() })

/** Cliente mínimo que conserva la cookie de sesión. */
export async function login(baseUrl: string, email: string) {
  const res = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: DEMO_PASSWORD }) })
  const cookie = res.headers.get('set-cookie')?.split(';')[0] ?? ''
  const call = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(`${baseUrl}${path}`, { method, headers: { cookie, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const text = await r.text()
    let parsed: any = text
    try { parsed = JSON.parse(text) } catch { /* no es JSON */ }
    return { status: r.status, body: parsed }
  }
  return {
    get: (p: string) => call('GET', p), post: (p: string, b?: unknown) => call('POST', p, b), patch: (p: string, b: unknown) => call('PATCH', p, b),
    put: (p: string, b: unknown) => call('PUT', p, b), del: (p: string) => call('DELETE', p),
  }
}
const as = (email: string) => login(base, email)

const DX = [{ code: 'CA40', label: 'Neumonía', system: 'icd11' }]
let seq = 0
/** Paciente nuevo, con identidad, en la consulta externa de hoy de la Dra. Herrera y ya en consulta. */
async function walkIn(name = 'Prueba') {
  const nurse = await as('crios@demo.clinara')
  const doc = await as('lherrera@demo.clinara')
  const p = await nurse.post('/api/patients', { firstName: name, lastName: 'Ronda Tres', birthDate: '1980-01-01', sex: 'M', phone: '9999-1111',
    dni: `0801-1980-${String(++seq * 37 + 1000).padStart(5, '0')}` })
  assert.equal(p.status, 201, JSON.stringify(p.body))
  const w = await nurse.post('/api/appointments/walk-in', { patientId: p.body.id, doctorId: 's-herrera', reason: 'Control' })
  await doc.post(`/api/appointments/${w.body.id}/status`, { status: 'in_consult' })
  return { doc, nurse, apptId: String(w.body.id), patientId: String(p.body.id) }
}
const RX = [{ drug: 'Amoxicilina', presentation: 'Cápsulas 500 mg', dose: '1 cápsula', route: 'Oral', frequency: 'Cada 8 horas', duration: '7 días' }]

describe('AD2 vigencia de recetas por médico', () => {
  test('la configuración de la clínica ya no la cambia; cada médico tiene la suya y cada receta la guarda', async () => {
    const admin = await as('admin@demo.clinara')
    const cfg = (await admin.get('/api/bootstrap')).body.settings
    const saved = await admin.put('/api/settings', { ...cfg, rxValidityDays: 90 })
    assert.equal(saved.status, 200, JSON.stringify(saved.body))
    assert.equal(saved.body.rxValidityDays, cfg.rxValidityDays)

    const { doc, apptId } = await walkIn('Vigencia')
    assert.equal((await doc.get('/api/auth/me')).body.user.prefs.rxValidityDays, 30)
    assert.equal((await doc.patch('/api/me', { rxValidityDays: 15 })).status, 200)
    assert.equal((await doc.get('/api/auth/me')).body.user.prefs.rxValidityDays, 15)
    const c = await doc.post('/api/consultations', { appointmentId: apptId, reason: 'Faringitis', diagnoses: DX, items: RX })
    assert.equal(c.status, 201, JSON.stringify(c.body))
    assert.equal((await doc.get(`/api/prescriptions/${c.body.prescriptionId}`)).body.prescription.validityDays, 15)
    // Sólo para esta receta
    const p2 = (await walkIn('Otra')).patientId
    const r = await doc.post('/api/prescriptions', { patientId: p2, items: RX, validityDays: 60 })
    assert.equal((await doc.get(`/api/prescriptions/${r.body.prescriptionId}`)).body.prescription.validityDays, 60)
    // Enfermería no tiene vigencia propia
    assert.equal((await (await as('crios@demo.clinara')).patch('/api/me', { rxValidityDays: 10 })).status, 403)
  })

  test('migración: las recetas viejas guardan la vigencia de su clínica y no se pisa la del médico', async () => {
    await sql.run(`UPDATE prescriptions SET validity_days = NULL WHERE id IN (SELECT id FROM prescriptions LIMIT 3)`)
    await migrateRxValidity(sql)
    assert.equal(Number((await sql.one('SELECT COUNT(*)::int AS n FROM prescriptions WHERE validity_days IS NULL'))!.n), 0)
    const prefs = JSON.parse(String((await sql.one(`SELECT prefs FROM staff WHERE id = 's-herrera'`))!.prefs))
    assert.equal(prefs.rxValidityDays, 15)
  })
})

/** Paciente nuevo ingresado a hospitalización desde una consulta de la Dra. Herrera (sin cama todavía). */
async function admitted(name = 'Ingreso') {
  const w = await walkIn(name)
  const c = await w.doc.post('/api/consultations', { appointmentId: w.apptId, reason: 'Dolor abdominal', history: 'Dos días con dolor en fosa ilíaca derecha.', diagnoses: DX,
    orders: ['Signos vitales cada 8 horas.'], admit: true })
  assert.equal(c.status, 201, JSON.stringify(c.body))
  return { ...w, stayId: String(c.body.hospitalizationId) }
}

describe('MC3 nota de procedimiento', () => {
  test('un procedimiento menor se guarda sin autorización; uno mayor la pide (o la urgencia)', async () => {
    const { doc, stayId } = await admitted('Procedimiento')
    const base = { name: 'Infiltración de rodilla derecha', performedAt: new Date(Date.now() - 60_000).toISOString(), text: 'Se infiltra rodilla derecha con técnica estéril, sin complicaciones.' }
    const minor = await doc.post(`/api/inpatient/${stayId}/procedure-notes`, { ...base, major: false })
    assert.equal(minor.status, 201, JSON.stringify(minor.body))
    assert.equal(minor.body.procedure.major, false)
    assert.equal((await doc.post(`/api/inpatient/${stayId}/procedure-notes`, { ...base, name: 'Laparotomía exploradora', major: true })).status, 409)
    const urgent = await doc.post(`/api/inpatient/${stayId}/procedure-notes`, { ...base, name: 'Laparotomía exploradora', major: true, urgent: true, justification: 'Abdomen agudo con choque.' })
    assert.equal(urgent.status, 201)
    assert.equal(urgent.body.procedure.urgent, true)
  })
})
