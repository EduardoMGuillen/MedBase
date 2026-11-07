import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb, resetQueueViewOnce } from './db.js'
import { createSql, type Sql } from './sql.js'
import { currentPeriod, DEFAULT_SUPPLY_SETTINGS } from '../src/lib/supplies.js'
import type { MaterialRecord } from '../src/lib/usage.js'
import type { Appointment } from '../src/lib/types.js'
import { QUEUE_DEFAULT_VIEW, QUEUE_GROUP_ROLES } from '../src/lib/clinicalConfig.js'
import { byArrival } from '../src/lib/arrivals.js'

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

describe('RE2 (ronda 16): Consulta externa «Por médico» para administración y recepción; el médico, por orden de llegada', () => {
  test('el selector es de administración y recepción, y abre «Por médico»', () => {
    assert.deepEqual([...QUEUE_GROUP_ROLES].sort(), ['admin', 'reception'])
    assert.equal(QUEUE_DEFAULT_VIEW, 'doctor')
  })

  test('la migración borra una sola vez la vista guardada de administración y recepción (no la de otros roles ni otras preferencias)', async () => {
    const idOf = async (email: string) => String((await sql.one('SELECT id FROM staff WHERE email = ?', [email]))!.id)
    const set = async (email: string, prefs: object) => sql.run('UPDATE staff SET prefs = ? WHERE id = ?', [JSON.stringify(prefs), await idOf(email)])
    const prefsOf = async (email: string) => JSON.parse(String((await sql.one('SELECT prefs FROM staff WHERE email = ?', [email]))!.prefs || '{}'))
    await set('rmoncada@demo.clinara', { queueView: 'hour', agendaView: 'week' })
    await set('aquiroz@demo.clinara', { queueView: 'hour' })
    await set('gyanes@demo.clinara', { queueView: 'hour' })
    await set('murbina@demo.clinara', { queueView: 'hour' })
    await sql.run(`DELETE FROM meta WHERE key = 're2_queue_view'`)
    await resetQueueViewOnce(sql)
    assert.deepEqual(await prefsOf('rmoncada@demo.clinara'), { agendaView: 'week' })
    assert.deepEqual(await prefsOf('aquiroz@demo.clinara'), {})
    assert.deepEqual(await prefsOf('gyanes@demo.clinara'), {}, 'recepción y enfermería')
    assert.deepEqual(await prefsOf('murbina@demo.clinara'), { queueView: 'hour' }, 'enfermería no cambia')
    // Lo que elijan después se respeta: la segunda vez no borra nada
    assert.equal((await (await as('aquiroz@demo.clinara')).patch('/api/me', { queueView: 'hour' })).status, 200)
    await resetQueueViewOnce(sql)
    assert.equal((await (await as('aquiroz@demo.clinara')).get('/api/auth/me')).body.user.prefs.queueView, 'hour')
  })

  test('orden de llegada: el primero en llegar arriba; los que no han llegado, después y por hora de cita', () => {
    const a = (id: string, start: string, arrivedAt?: string) => ({ id, start, arrivedAt }) as Appointment
    const list = [a('cita-8', '2026-11-07T08:00', '2026-11-07T14:40:00.000Z'), a('sin-cita', '2026-11-07T08:10', '2026-11-07T14:10:00.000Z'),
      a('cita-9', '2026-11-07T09:00', '2026-11-07T14:30:00.000Z'), a('falta', '2026-11-07T07:30')]
    assert.deepEqual(list.sort(byArrival).map((x) => x.id), ['sin-cita', 'cita-9', 'cita-8', 'falta'])
  })
})
