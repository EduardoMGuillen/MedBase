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
