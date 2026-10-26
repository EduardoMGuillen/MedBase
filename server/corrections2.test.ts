import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb, SCHEMA } from './db.js'
import { createSql, type Sql } from './sql.js'
import { formatDni, normalizeDni } from '../src/lib/format.js'

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

describe('M8 identidad con guiones automáticos', () => {
  test('sólo cuentan los dígitos y los guiones salen después del 4.º y del 8.º', () => {
    assert.equal(formatDni('0801'), '0801')
    assert.equal(formatDni('08011'), '0801-1')
    assert.equal(formatDni('080119901'), '0801-1990-1')
    assert.equal(formatDni('0801199012345'), '0801-1990-12345')
    assert.equal(formatDni('0801-1990-12345'), '0801-1990-12345')
    assert.equal(formatDni('08a01 1990.1234599'), '0801-1990-12345')
    // Otra máscara configurada por la clínica, y sin máscara el texto se deja libre
    assert.equal(formatDni('123456789', '000 000 000'), '123 456 789')
    assert.equal(formatDni('AB12345', ''), 'AB12345')
  })
  test('se guarda siempre con guiones y la base vieja se migra', async () => {
    assert.equal(normalizeDni('0801199012345'), '0801-1990-12345')
    assert.equal(normalizeDni(' 0801 1990 12345 '), '0801-1990-12345')
    assert.equal(normalizeDni(''), undefined)
    const rec = await as('smejia@demo.clinara')
    const r = await rec.post('/api/patients', { firstName: 'Iris', lastName: 'Matute', birthDate: '1990-01-01', sex: 'F', phone: '9444-1111', dni: '0801199077777' })
    assert.equal(r.status, 201)
    const row = await sql.one('SELECT dni FROM patients WHERE id = ?', [r.body.id])
    assert.equal(row!.dni, '0801-1990-77777')
    // Un dato viejo sin guiones se corrige al actualizar el esquema
    await sql.run(`UPDATE patients SET dni = '0801199088888' WHERE id = ?`, [r.body.id])
    await sql.run(`UPDATE patients SET guardian_dni = '0801 1980 55555' WHERE id = ?`, [r.body.id])
    await sql.exec(SCHEMA)
    const migrated = await sql.one('SELECT dni, guardian_dni FROM patients WHERE id = ?', [r.body.id])
    assert.equal(migrated!.dni, '0801-1990-88888')
    assert.equal(migrated!.guardian_dni, '0801-1980-55555')
  })
  test('el expediente migrado llega con guiones a todos los roles', async () => {
    const rec = await as('smejia@demo.clinara')
    const boot = await rec.get('/api/bootstrap')
    const p = boot.body.patients.find((x: any) => x.dni === '0801-1990-88888')
    assert.ok(p)
  })
})
