import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb, migrateObservationAuthorizations } from './db.js'
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
async function as(email: string) {
  const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: DEMO_PASSWORD }) })
  const cookie = res.headers.get('set-cookie')?.split(';')[0] ?? ''
  const call = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(`${base}${path}`, { method, headers: { cookie, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
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

const DX = [{ code: 'CA40', label: 'Neumonía', system: 'icd11' }]
const freeBed = async () => {
  const boot = (await (await as('lherrera@demo.clinara')).get('/api/bootstrap')).body
  const used = new Set(boot.inpatients.map((h: any) => h.bedId))
  return boot.beds.find((b: any) => b.active && !used.has(b.id)).id as string
}
/** Un paciente nuevo en observación, ingresado desde una consulta de la Dra. Herrera. */
async function observation(name = 'Prueba') {
  const nurse = await as('crios@demo.clinara')
  const doc = await as('lherrera@demo.clinara')
  const p = await nurse.post('/api/patients', { firstName: name, lastName: 'Ronda Dos', birthDate: '1980-01-01', sex: 'M', phone: '9999-1111', dni: `0801-1980-${String(Math.floor(Math.random() * 99999)).padStart(5, '0')}` })
  assert.equal(p.status, 201, JSON.stringify(p.body))
  const w = await nurse.post('/api/appointments/walk-in', { patientId: p.body.id, doctorId: 's-herrera', reason: 'Fiebre' })
  await doc.post(`/api/appointments/${w.body.id}/status`, { status: 'in_consult' })
  const c = await doc.post('/api/consultations', { appointmentId: w.body.id, reason: 'Fiebre y tos', history: 'Tres días con fiebre y tos productiva.', diagnoses: DX, orders: ['Signos vitales cada 8 horas.'], observe: true })
  assert.equal(c.status, 201, JSON.stringify(c.body))
  return { doc, nurse, stayId: String(c.body.hospitalizationId), patientId: String(p.body.id) }
}

describe('A3 la autorización de hospitalización no va en observación', () => {
  test('observación sin autorización de hospitalización; al pasar a hospitalización se crea pendiente', async () => {
    const { doc, stayId } = await observation('Luis')
    let file = (await doc.get(`/api/inpatient/${stayId}`)).body
    assert.equal(file.authorizations.length, 0)
    await doc.post(`/api/inpatient/${stayId}/convert`, { bedId: await freeBed() })
    file = (await doc.get(`/api/inpatient/${stayId}`)).body
    assert.deepEqual(file.authorizations.map((a: any) => [a.template, a.status]), [['hospital', 'pending']])
  })

  test('migración: las "No aplica" se archivan sin borrarse y a la estancia convertida sin autorización se le crea una', async () => {
    const { doc, stayId } = await observation('Mario')
    // Como quedaron los datos de la ronda 3: una "No aplica" en observación y luego la conversión sin autorización
    const old = 'auth-legacy-na'
    const h = (await sql.one('SELECT * FROM hospitalizations WHERE id = ?', [stayId]))!
    await sql.run(`INSERT INTO authorizations (id, clinic_id, hospitalization_id, patient_id, template, data, status, created_by, created_at, status_note)
      VALUES (?,?,?,?,'hospital','{}','not_applicable','s-herrera',?, 'La observación no lleva autorización de hospitalización.')`,
    [old, String(h.clinic_id), stayId, String(h.patient_id), new Date().toISOString()])
    await sql.run(`UPDATE hospitalizations SET kind = 'hospital', bed_id = ?, observation_at = admitted_at, converted_by = 's-herrera' WHERE id = ?`, [await freeBed(), stayId])
    // Antes de migrar, la tarjeta "No aplica" se vería
    assert.equal((await sql.query(`SELECT * FROM authorizations WHERE hospitalization_id = ?`, [stayId])).length, 1)

    await sql.tx((q) => migrateObservationAuthorizations(q))
    const rows = await sql.query(`SELECT * FROM authorizations WHERE hospitalization_id = ? ORDER BY created_at`, [stayId])
    assert.equal(rows.length, 2, 'no se borró nada')
    assert.ok(rows.find((r) => r.id === old)!.archived_at, 'la "No aplica" quedó archivada')
    const file = (await doc.get(`/api/inpatient/${stayId}`)).body
    assert.deepEqual(file.authorizations.map((a: any) => [a.template, a.status]), [['hospital', 'pending']], 'sólo se ve la nueva, pendiente')
    // Correr la migración otra vez no duplica
    await sql.tx((q) => migrateObservationAuthorizations(q))
    assert.equal((await sql.query(`SELECT * FROM authorizations WHERE hospitalization_id = ?`, [stayId])).length, 2)
  })
})
