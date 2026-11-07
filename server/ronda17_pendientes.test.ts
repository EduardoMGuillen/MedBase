import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb } from './db.js'
import { createSql, type Sql } from './sql.js'
import { placeOf } from './http.js'
import { contactLine, docPhone } from '../src/lib/format.js'

// Ronda 17, pendientes de las rondas de corrección (PE): con la base y la API (copia en memoria de la demo)
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
  return {
    get: (p: string) => call('GET', p), post: (p: string, b?: unknown) => call('POST', p, b), put: (p: string, b?: unknown) => call('PUT', p, b),
    patch: (p: string, b?: unknown) => call('PATCH', p, b),
  }
}

describe('R13 IM1 (pendiente): el teléfono de los documentos va sin «+504»', () => {
  test('docPhone quita el prefijo y contactLine lo usa', () => {
    assert.equal(docPhone('+504 2232-7710'), '2232-7710')
    assert.equal(docPhone('+5042232-7710'), '2232-7710')
    assert.equal(docPhone('  + 504  9988-7766'), '9988-7766')
    assert.equal(docPhone('2232-7710'), '2232-7710')
    assert.equal(docPhone('+1 305 555 0100'), '+1 305 555 0100')
    assert.equal(contactLine({ phone: '+504 2232-7710' }), '2232-7710')
    assert.equal(contactLine({ phone: '+504 2232-7710', docsWhatsapp: true, contacts: [{ id: 'w', number: '+504 9988-7766', label: 'WhatsApp', type: 'whatsapp', whatsapp: true }] }),
      '2232-7710 · WhatsApp 9988-7766')
  })

  test('la demo guarda los teléfonos de las clínicas en formato local', async () => {
    const rows = await sql.query('SELECT phone FROM clinics')
    assert.ok(rows.length > 0)
    for (const r of rows) assert.ok(!String(r.phone ?? '').includes('+504'), String(r.phone))
  })
})

describe('Consultorio (pendiente): los mensajes del servidor dicen «consultorio» en una cuenta de consultorio', () => {
  test('placeOf según el tipo de cuenta', () => {
    assert.deepEqual(placeOf('office'), { word: 'consultorio', the: 'el consultorio', The: 'El consultorio', of: 'del consultorio' })
    assert.deepEqual(placeOf('clinic'), { word: 'clínica', the: 'la clínica', The: 'La clínica', of: 'de la clínica' })
    assert.equal(placeOf(undefined).word, 'clínica')
  })

  test('Configuración: dos números de WhatsApp, en el consultorio y en la clínica', async () => {
    const twoWa = [
      { id: 'principal', number: '2239-4410', label: 'Principal', type: 'call', primary: true },
      { id: 'a', number: '9988-7766', label: 'A', type: 'whatsapp', whatsapp: true },
      { id: 'b', number: '9988-7767', label: 'B', type: 'whatsapp', whatsapp: true },
    ]
    const office = await as('ipacheco@demo.clinara')
    await office.post('/api/me/view', { role: 'admin' })
    const s1 = (await office.get('/api/bootstrap')).body.settings
    const r1 = await office.put('/api/settings', { ...s1, contacts: twoWa })
    await office.post('/api/me/view', { role: 'doctor' })
    assert.equal(r1.status, 400)
    assert.match(r1.body.error, /WhatsApp del consultorio/)
    assert.doesNotMatch(r1.body.error, /clínica/)
    const clinic = await as('rmoncada@demo.clinara')
    const s2 = (await clinic.get('/api/bootstrap')).body.settings
    const r2 = await clinic.put('/api/settings', { ...s2, contacts: twoWa })
    assert.equal(r2.status, 400)
    assert.match(r2.body.error, /WhatsApp de la clínica/)
  })

  test('Vademécum: un medicamento repetido en el consultorio', async () => {
    const office = await as('ipacheco@demo.clinara')
    const a = await office.post('/api/drugs', { name: 'Zetaprueba PE uno', presentation: 'Tableta 10 mg' })
    const b = await office.post('/api/drugs', { name: 'Zetaprueba PE dos', presentation: 'Tableta 10 mg' })
    assert.ok(a.status < 300 && b.status < 300, JSON.stringify([a.body, b.body]))
    const r = await office.patch(`/api/drugs/${b.body.id}`, { name: 'Zetaprueba PE uno' })
    assert.equal(r.status, 409)
    assert.match(r.body.error, /vademécum del consultorio/)
  })
})
