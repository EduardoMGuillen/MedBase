import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb } from './db.js'
import { createSql, type Sql } from './sql.js'
import { parseDecimal, vitalLevel } from '../src/lib/vitals.js'

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
async function as(email: string) {
  const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: DEMO_PASSWORD }) })
  const cookie = res.headers.get('set-cookie')?.split(';')[0] ?? ''
  const call = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(`${base}${path}`, { method, headers: { cookie, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    return { status: r.status, body: await r.json() as any }
  }
  return { get: (p: string) => call('GET', p), post: (p: string, b?: unknown) => call('POST', p, b), patch: (p: string, b: unknown) => call('PATCH', p, b) }
}


describe('E1 preclínica', () => {
  test('rangos: 120 no alerta, 170 fuera de rango, 10 imposible', () => {
    assert.equal(vitalLevel('systolic', 120, 40), 'ok')
    assert.equal(vitalLevel('systolic', 170, 40), 'warn')
    assert.equal(vitalLevel('systolic', 10, 40), 'error')
    assert.equal(vitalLevel('temperature', 38, 40), 'warn')
    assert.equal(vitalLevel('temperature', 37.9, 40), 'ok')
    assert.equal(vitalLevel('spo2', 89, 40), 'warn')
    assert.equal(vitalLevel('heartRate', 900, 40), 'error')
    // Un lactante con 140 lpm está en rango; un adulto no
    assert.equal(vitalLevel('heartRate', 140, 0), 'ok')
    assert.equal(vitalLevel('heartRate', 140, 30), 'warn')
  })
  test('decimales con punto o coma', () => {
    assert.equal(parseDecimal('37,5'), 37.5)
    assert.equal(parseDecimal('37.5'), 37.5)
    assert.equal(parseDecimal(''), undefined)
    assert.ok(Number.isNaN(parseDecimal('3a')!))
  })
  test('un valor improbable confirmado se guarda y la glucometría acepta decimales', async () => {
    const n = await as('crios@demo.clinara')
    const r = await n.post('/api/vitals', { patientId: 'p6', appointmentId: 'a4', systolic: 10, diastolic: 80, glucose: 98.6, temperature: 37.5 })
    assert.equal(r.status, 201)
    assert.equal(r.body.glucose, 98.6)
    assert.equal(r.body.painScale, undefined)
  })
})

describe('M5 identidad', () => {
  test('la reserva en línea guarda la identidad y la receta la toma del expediente', async () => {
    const d = new Date(); d.setDate(d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const slots = await (await fetch(`${base}/api/public/santa-brigida/slots?doctorId=s-herrera&date=${date}`)).json() as { slots: string[] }
    const r = await fetch(`${base}/api/public/santa-brigida/book`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ doctorId: 's-herrera', date, time: slots.slots.at(-1), firstName: 'Lesbia', lastName: 'Ponce', birthDate: '1980-02-02', sex: 'F', phone: '9555-1212', dni: '0801-1980-55555', reason: 'Control general' }) })
    assert.equal(r.status, 201)
    const doc = await as('lherrera@demo.clinara')
    const boot = await doc.get('/api/bootstrap')
    assert.equal(boot.body.patients.find((p: any) => p.lastName === 'Ponce')?.dni, '0801-1980-55555')
  })
  test('un menor sin identidad guarda los datos del responsable', async () => {
    const rec = await as('smejia@demo.clinara')
    const r = await rec.post('/api/patients', { firstName: 'Luis', lastName: 'Ponce', birthDate: '2021-03-03', sex: 'M', phone: '9555-1212', guardianName: 'Lesbia Ponce', guardianDni: '0801-1980-55555', guardianRelation: 'Madre' })
    assert.equal(r.status, 201)
    const boot = await rec.get('/api/bootstrap')
    assert.equal(boot.body.patients.find((p: any) => p.id === r.body.id)?.guardianDni, '0801-1980-55555')
  })
})
