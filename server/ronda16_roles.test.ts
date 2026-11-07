import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb } from './db.js'
import { createSql, type Sql } from './sql.js'
import { currentPeriod, DEFAULT_SUPPLY_SETTINGS } from '../src/lib/supplies.js'
import type { MaterialRecord } from '../src/lib/usage.js'

// Ronda 16, recepción, administración y enfermería (RU10, RE2, RE1, EN1): con la base y la API (copia en memoria de la demo)
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

async function as(email: string, password = DEMO_PASSWORD) {
  const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })
  const cookie = res.headers.get('set-cookie')?.split(';')[0] ?? ''
  const call = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(`${base}${path}`, { method, headers: { cookie, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const text = await r.text()
    let parsed: any = text
    try { parsed = JSON.parse(text) } catch { /* no es JSON */ }
    return { status: r.status, body: parsed }
  }
  return { get: (p: string) => call('GET', p), post: (p: string, b?: unknown) => call('POST', p, b), patch: (p: string, b?: unknown) => call('PATCH', p, b), put: (p: string, b?: unknown) => call('PUT', p, b) }
}
const clinicOfUser = async (email: string) => String((await sql.one(`SELECT clinic_id FROM staff WHERE email = ?`, [email]))!.clinic_id)
const lineOf = async (cid: string, material: string, variant = '') => (await sql.one('SELECT * FROM supply_items WHERE clinic_id = ? AND material = ? AND variant = ?', [cid, material, variant]))!
const firstPatient = async (cid: string) => String((await sql.one('SELECT id FROM patients WHERE clinic_id = ? ORDER BY record LIMIT 1', [cid]))!.id)

describe('RU10 (ronda 16): administración y recepción también registran material', () => {
  const materialBody = async () => {
    const cid = await clinicOfUser('rmoncada@demo.clinara')
    const gasa = await lineOf(cid, 'Gasa estéril', '10 × 10 cm')
    const p = currentPeriod({ period: 'shift', shifts: DEFAULT_SUPPLY_SETTINGS.shifts })
    return { gasa: String(gasa.id), body: { patientId: await firstPatient(cid), day: p.day, shiftKey: p.shiftKey, items: [{ itemId: String(gasa.id), quantity: 1 }] } }
  }

  test('Ricardo Moncada y Andrea Quiroz registran material de un paciente y queda con su nombre; laboratorio e imágenes siguen en 403', async () => {
    const { gasa, body } = await materialBody()
    const win = `from=${encodeURIComponent(new Date(Date.now() - 86_400_000).toISOString())}&to=${encodeURIComponent(new Date(Date.now() + 60_000).toISOString())}`
    for (const [email, name] of [['rmoncada@demo.clinara', 'Ricardo Moncada'], ['aquiroz@demo.clinara', 'Andrea Quiroz']]) {
      const u = await as(email)
      assert.equal((await u.get(`/api/usage/suggest?${win}`)).status, 200, email)
      assert.equal((await u.get('/api/supplies')).status, 200, email)
      const r = await u.post('/api/usage/material', body)
      assert.equal(r.status, 201, `${email}: ${JSON.stringify(r.body)}`)
      const rec = r.body as MaterialRecord
      assert.ok(rec.recordedByName?.includes(name), `${email}: ${rec.recordedByName}`)
      // Corrige su propio registro en el periodo de gracia
      assert.equal((await u.patch(`/api/usage/material/${rec.id}`, { ...body, items: [{ itemId: gasa, quantity: 2 }] })).status, 200, email)
      const list = (await u.get(`/api/usage/material?${win}`)).body.records as MaterialRecord[]
      assert.ok(list.some((x) => x.id === rec.id), email)
    }
    for (const email of ['psuazo@demo.clinara', 'rzepeda@demo.clinara']) assert.equal((await (await as(email)).post('/api/usage/material', body)).status, 403, email)
  })

  test('recepción no anula lo que registró otra persona (usage.void sigue siendo de administración)', async () => {
    const { body } = await materialBody()
    const r = await (await as('murbina@demo.clinara')).post('/api/usage/material', body)
    assert.equal(r.status, 201)
    assert.equal((await (await as('aquiroz@demo.clinara')).post(`/api/usage/material/${r.body.id}/void`, { reason: 'Registro duplicado' })).status, 403)
    assert.equal((await (await as('rmoncada@demo.clinara')).post(`/api/usage/material/${r.body.id}/void`, { reason: 'Registro duplicado' })).status, 200)
  })
})
