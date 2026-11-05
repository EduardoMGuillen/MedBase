import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb } from './db.js'
import { createSql, type Sql } from './sql.js'
import { capFirst } from '../src/lib/autocap.js'
import { defaultPlace } from '../src/lib/exams.js'

// Ronda 14: con la base y la API (copia en memoria de la demo)
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

export async function as(email: string, password = DEMO_PASSWORD) {
  const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })
  const cookie = res.headers.get('set-cookie')?.split(';')[0] ?? ''
  const call = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(`${base}${path}`, { method, headers: { cookie, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const text = await r.text()
    let parsed: any = text
    try { parsed = JSON.parse(text) } catch { /* no es JSON */ }
    return { status: r.status, body: parsed }
  }
  return { get: (p: string) => call('GET', p), post: (p: string, b?: unknown) => call('POST', p, b) }
}

describe('GE10 (ronda 14): mayúscula inicial', () => {
  test('la primera letra, también con tilde o eñe; lo demás no cambia', () => {
    assert.equal(capFirst('paños con agua helada.'), 'Paños con agua helada.')
    assert.equal(capFirst('ácido fólico'), 'Ácido fólico')
    assert.equal(capFirst('ñame'), 'Ñame')
    assert.equal(capFirst('  evitar luces'), '  Evitar luces')
    assert.equal(capFirst('PH'), 'PH')
    assert.equal(capFirst('500 mg'), '500 mg', 'un número no cambia')
    assert.equal(capFirst(''), '')
  })
})

describe('EX8 (ronda 14): «Externo» o «En la clínica» por defecto', () => {
  test('consulta externa: Externo; estancia: En la clínica si hay laboratorio o imágenes; Consultorio: Externo', () => {
    const clinic = { kind: 'clinic', hasLab: true, hasImaging: true }
    assert.equal(defaultPlace('lab', false, clinic), 'external')
    assert.equal(defaultPlace('imaging', false, clinic), 'external')
    assert.equal(defaultPlace('lab', true, clinic), 'clinic')
    assert.equal(defaultPlace('imaging', true, clinic), 'clinic')
    assert.equal(defaultPlace('lab', true, { kind: 'clinic', hasLab: false, hasImaging: true }), 'external', 'sin laboratorio')
    assert.equal(defaultPlace('imaging', true, { kind: 'clinic', hasLab: true, hasImaging: false }), 'external', 'sin imágenes')
    assert.equal(defaultPlace('lab', true, { kind: 'office', hasLab: true, hasImaging: true }), 'external', 'consultorio')
  })
})
