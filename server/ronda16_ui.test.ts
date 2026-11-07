import './tz.js'
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb } from './db.js'
import { createSql, type Sql } from './sql.js'
import { finishedOn } from '../src/lib/exams.js'

// Ronda 16 (rama ronda16-ui): con la base y la API (copia en memoria de la demo)
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
const mainClinic = async () => String((await sql.one(`SELECT clinic_id FROM staff WHERE email = 'vsolorzano@demo.clinara'`))!.clinic_id)
const stayOf = async (kind = 'hospital') => String((await sql.one(`SELECT id FROM hospitalizations WHERE status = 'active' AND clinic_id = ? AND kind = ? ORDER BY admitted_at LIMIT 1`, [await mainClinic(), kind]))!.id)

describe('RX1 (ronda 16): «Terminados hoy» por fecha local (Honduras, UTC−6)', () => {
  test('un estudio informado a las 19:00 de Honduras es de ese día, no del siguiente', () => {
    // 6 nov 19:00 en Honduras = 7 nov 01:00 UTC
    const at = new Date('2026-11-06T19:00:00-06:00').toISOString()
    assert.equal(at, '2026-11-07T01:00:00.000Z')
    assert.equal(finishedOn({ statusAt: at, result: { at } }, '2026-11-06'), true)
    assert.equal(finishedOn({ statusAt: at, result: { at } }, '2026-11-07'), false)
    // Sin resultado (Rayos X realizado, sin informe): por la hora del estado
    assert.equal(finishedOn({ statusAt: at }, '2026-11-06'), true)
    // 05:59 de Honduras sigue siendo ese día
    assert.equal(finishedOn({ statusAt: new Date('2026-11-06T00:30:00-06:00').toISOString() }, '2026-11-06'), true)
    assert.equal(finishedOn({ statusAt: undefined }, '2026-11-06'), false)
  })

  test('la bandeja del radiólogo trae el estudio de observación informado a las 19:00, en su área, solo en su día', async () => {
    const doc = await as('vsolorzano@demo.clinara')
    const rad = await as('rzepeda@demo.clinara')
    const stay = await stayOf('observation')
    const n = await doc.post(`/api/inpatient/${stay}/notes`, { kind: 'evolution', format: 'dx', observations: 'RX1', exams: [
      { group: 'imaging', name: 'Tomografía', subject: 'cráneo', contrast: 'Simple', priority: 'routine', place: 'clinic' }] })
    assert.equal(n.status, 201, JSON.stringify(n.body))
    const ct = (await rad.get('/api/dept/tray')).body.items.find((e: any) => e.noteId === n.body.id)
    assert.ok(ct, 'el estudio pendiente está en la bandeja')
    assert.match(ct.locationText, /^Observación/)
    assert.equal((await rad.post(`/api/exams/${ct.id}/status`, { status: 'done' })).status, 200)
    assert.equal((await rad.post(`/api/exams/${ct.id}/result`, { report: 'Sin alteraciones agudas.' })).status, 200)
    // Lo informó el 6 nov a las 19:00 de Honduras (01:00 UTC del 7)
    const at = '2026-11-07T01:00:00.000Z'
    const row = (await sql.one('SELECT result FROM exam_orders WHERE id = ?', [ct.id]))!
    await sql.run('UPDATE exam_orders SET status_at = ?, result = ? WHERE id = ?', [at, JSON.stringify({ ...JSON.parse(String(row.result)), at }), ct.id])
    const day6 = (await rad.get('/api/dept/tray?day=2026-11-06')).body.items.find((e: any) => e.id === ct.id)
    assert.ok(day6, 'el 6 nov lo trae el servidor')
    assert.match(day6.locationText, /^Observación/, 'queda en el área donde estaba el paciente')
    assert.equal(finishedOn(day6, '2026-11-06'), true, 'y va en «Terminados hoy» del 6')
    // El día anterior ya no lo trae (antes el margen de un día lo mezclaba)
    const day5 = (await rad.get('/api/dept/tray?day=2026-11-05')).body.items.find((e: any) => e.id === ct.id)
    assert.ok(!day5 || !finishedOn(day5, '2026-11-05'))
  })
})
