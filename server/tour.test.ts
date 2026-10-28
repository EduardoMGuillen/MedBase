import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb } from './db.js'
import { createSql, type Sql } from './sql.js'
import { tourFor } from '../src/lib/tours.js'

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
  return { get: (p: string) => call('GET', p), post: (p: string, b?: unknown) => call('POST', p, b) }
}

const targets = (...a: Parameters<typeof tourFor>) => tourFor(...a).map((s) => s.target)

describe('recorrido de primer ingreso', () => {
  test('al terminarlo queda guardado en el usuario y no borra sus otras preferencias', async () => {
    await sql.run(`UPDATE staff SET prefs = '{"noteFormat":"dx"}' WHERE email = 'lherrera@demo.clinara'`)
    const doc = await as('lherrera@demo.clinara')
    assert.equal((await doc.get('/api/auth/me')).body.user.prefs?.tourDoneAt, undefined)
    assert.equal((await doc.post('/api/me/tour')).status, 200)
    const prefs = (await doc.get('/api/auth/me')).body.user.prefs
    assert.ok(prefs.tourDoneAt)
    assert.equal(prefs.noteFormat, 'dx')
  })

  test('también lo guarda quien no tiene preferencias ni clínica', async () => {
    const sa = await as('superadmin@demo.clinara')
    assert.equal((await sa.post('/api/me/tour')).status, 200)
    assert.ok((await sa.get('/api/auth/me')).body.user.prefs.tourDoneAt)
  })
})

describe('pasos de cada perfil', () => {
  test('recepción: agenda, llegadas, pacientes y caja; nada de hospitalización', () => {
    const t = targets('reception', 'clinic')
    for (const x of ['nav:/app/agenda', 'nav:/app/consulta-externa', 'nav:/app/pacientes', 'nav:/app/caja', 'search']) assert.ok(t.includes(x), x)
    assert.ok(!t.includes('nav:/app/hospitalizados'))
  })

  test('enfermería: preclínica y hospitalizados, sin agenda', () => {
    const t = targets('nurse', 'clinic')
    assert.ok(t.includes('nav:/app/consulta-externa'))
    assert.ok(t.includes('nav:/app/hospitalizados'))
    assert.ok(!t.includes('nav:/app/agenda'))
  })

  test('administración: configuración, personal y reportes, sin pantallas clínicas', () => {
    const t = targets('admin', 'clinic')
    for (const x of ['nav:/app/configuracion', 'nav:/app/personal', 'nav:/app/reportes']) assert.ok(t.includes(x), x)
    assert.ok(!t.includes('nav:/app/hospitalizados'))
    assert.ok(!t.includes('nav:/app/seguimientos'))
  })

  test('el médico de consultorio cobra y administra; sin hospitalización ni observación si la apagó', () => {
    const t = targets('doctor', 'office', { observationEnabled: false })
    for (const x of ['nav:/app/caja', 'nav:/app/configuracion', 'nav:/app/personal']) assert.ok(t.includes(x), x)
    assert.ok(!t.includes('nav:/app/hospitalizados'))
    assert.ok(!t.includes('nav:/app/observacion'))
    assert.ok(targets('doctor', 'office').includes('nav:/app/observacion'))
  })

  test('el médico de clínica atiende y evoluciona, pero no configura', () => {
    const t = targets('doctor', 'clinic')
    for (const x of ['nav:/app/consulta-externa', 'nav:/app/hospitalizados', 'nav:/app/seguimientos', 'nav:/app/recetas']) assert.ok(t.includes(x), x)
    assert.ok(!t.includes('nav:/app/configuracion'))
  })

  test('la administración de la plataforma sólo ve clínicas y su cuenta', () => {
    assert.deepEqual(targets('superadmin', 'clinic').filter(Boolean), ['nav:/app', 'me'])
  })

  test('cada perfil empieza con una bienvenida sin señalar nada y termina en su cuenta', () => {
    for (const [role, kind] of [['reception', 'clinic'], ['nurse', 'clinic'], ['doctor', 'clinic'], ['admin', 'clinic'], ['doctor', 'office'], ['assistant', 'office'], ['superadmin', 'clinic']] as const) {
      const t = tourFor(role, kind)
      assert.equal(t[0].target, undefined, role)
      assert.equal(t.at(-1)!.target, 'me', role)
    }
  })
})
