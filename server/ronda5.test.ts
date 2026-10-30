import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb } from './db.js'
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
})
after(async () => { server.close(); await sql.close() })

/** Cliente mínimo que conserva la cookie de sesión. */
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
  return {
    status: res.status,
    get: (p: string) => call('GET', p), post: (p: string, b?: unknown) => call('POST', p, b), patch: (p: string, b: unknown) => call('PATCH', p, b),
    put: (p: string, b: unknown) => call('PUT', p, b), del: (p: string, b?: unknown) => call('DELETE', p, b),
  }
}

describe('AD5 crónicos y seguimientos para administración', () => {
  test('Roberto Aguilar ve los mismos seguimientos que el médico, los opera y queda en la bitácora con su nombre', async () => {
    const admin = await as('admin@demo.clinara')
    const doc = await as('lherrera@demo.clinara')
    const mine = (await admin.get('/api/bootstrap')).body.followups
    const theirs = (await doc.get('/api/bootstrap')).body.followups
    assert.ok(mine.length > 0, 'la demo trae seguimientos')
    assert.deepEqual(mine.map((f: any) => f.id).sort(), theirs.map((f: any) => f.id).sort())
    const r = await admin.post(`/api/followups/${mine[0].id}/notify`)
    assert.equal(r.status, 200, JSON.stringify(r.body))
    const log = (await admin.get('/api/audit/mine')).body
    assert.ok((log.rows ?? log).some((e: any) => e.userId === 's-admin' && /WhatsApp del seguimiento/.test(e.action)), JSON.stringify((log.rows ?? log).slice(0, 3)))
    // Programar uno nuevo sigue siendo del médico
    assert.equal((await admin.post('/api/followups', { patientId: mine[0].patientId, kind: 'control', title: 'Control', dueDate: '2030-01-01' })).status, 403)
  })
})
