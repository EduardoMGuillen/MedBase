import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb } from './db.js'
import { createSql, type Sql } from './sql.js'
import { miniTourFor, tourFor, tourKey } from '../src/lib/tours.js'
import { PANTALLAS } from '../src/tours/index.js'

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

describe('RG1 recorridos por rol', () => {
  test('recepción: por llegar, agendar, sala de espera, registrar, filtros, cobrar y recordatorios; nada clínico', () => {
    const t = targets('reception', 'clinic')
    for (const x of ['por-llegar', 'nueva-cita', 'sala-espera', 'nuevo-paciente', 'filtros', 'nuevo-cobro', 'recordatorios']) assert.ok(t.includes(x), x)
    assert.ok(t.length >= 8 && t.length <= 12, String(t.length))
    assert.ok(!t.includes('hoja-medicamentos'))
  })

  test('enfermería: pendientes, preclínica, alertas, órdenes, medicamentos, signos, exámenes y notas; sin cobrar ni agendar', () => {
    const t = targets('nurse', 'clinic')
    for (const x of ['pendientes', 'sala-espera', 'alertas', 'checklist', 'hoja-medicamentos', 'signos-registrar', 'bandeja-examenes', 'nota-enfermeria']) assert.ok(t.includes(x), x)
    assert.ok(t.length >= 8 && t.length <= 10, String(t.length))
    assert.ok(!t.includes('nueva-cita') && !t.includes('nuevo-cobro'))
  })

  test('médico de clínica: de la sala de espera al egreso y Mi configuración; no configura la clínica', () => {
    const t = targets('doctor', 'clinic')
    for (const x of ['alcance', 'sala-espera', 'nota-consulta', 'constancia', 'adenda', 'ingresar', 'nueva-evolucion', 'egreso', 'mi-config']) assert.ok(t.includes(x), x)
    assert.ok(t.length >= 12 && t.length <= 15, String(t.length))
    assert.ok(!t.includes('tab:servicios'))
  })

  test('administración: configuración, contactos, servicios, pagos, horarios, camas, áreas, personal, bitácora y reportes', () => {
    const t = targets('admin', 'clinic')
    for (const x of ['contactos', 'tab:servicios', 'tab:pagos', 'tab:horarios', 'tab:camas', 'tab:areas', 'tab:personal', 'tab:bitacora', 'reportes']) assert.ok(t.includes(x), x)
    assert.ok(!t.includes('sala-espera') && !t.includes('nota-consulta'))
  })

  test('consultorio: uno combinado para las dos vistas del titular, con el cambio de vista; sin camas', () => {
    assert.equal(tourKey('doctor', 'office'), 'consultorio')
    assert.equal(tourKey('admin', 'office'), 'consultorio')
    assert.equal(tourKey('admin', 'clinic'), 'administracion')
    const doc = targets('doctor', 'office')
    const adm = targets('admin', 'office')
    assert.ok(doc.includes('vista') && adm.includes('vista'))
    assert.ok(doc.includes('sala-espera') && !doc.includes('tab:personal'), 'vista de médico: lo clínico')
    assert.ok(adm.includes('tab:personal') && adm.includes('reportes') && !adm.includes('sala-espera'), 'vista de administrador: lo administrativo')
    assert.ok(new Set([...doc, ...adm]).size >= 10)
    assert.ok(!doc.includes('ingresar') && !targets('doctor', 'office', { observationEnabled: false }).includes('nav:/app/observacion'))
  })

  test('cada recorrido empieza con una bienvenida y termina en el botón de ayuda (Ver el recorrido)', () => {
    for (const [role, kind] of [['reception', 'clinic'], ['nurse', 'clinic'], ['doctor', 'clinic'], ['admin', 'clinic'], ['doctor', 'office'], ['admin', 'office'], ['assistant', 'office']] as const) {
      const t = tourFor(role, kind)
      assert.equal(t[0].target, undefined, role)
      assert.equal(t.at(-1)!.target, 'help', role)
      assert.ok(t.every((s) => s.title && s.body), `${role}: pasos con texto`)
    }
  })

  test('mini-recorridos de 3 a 5 pasos en consulta, expediente, signos vitales y caja', () => {
    for (const k of ['consulta', 'expediente', 'signos', 'cobro'] as const) assert.ok(PANTALLAS[k].steps.length >= 3 && PANTALLAS[k].steps.length <= 5, k)
    assert.equal(miniTourFor('/app/consulta/abc', () => false), PANTALLAS.consulta)
    assert.equal(miniTourFor('/app/hospitalizados/x', () => false), PANTALLAS.expediente)
    assert.equal(miniTourFor('/app/observacion/x', (t) => t === 'signos-ultimo'), PANTALLAS.signos)
    assert.equal(miniTourFor('/app/caja', () => false), PANTALLAS.cobro)
    assert.equal(miniTourFor('/app/agenda', () => false), undefined)
  })

  test('el servidor recuerda por recorrido si lo terminó, lo saltó o en qué paso lo pausó', async () => {
    const nurse = await as('crios@demo.clinara')
    assert.equal((await nurse.post('/api/me/tour', { key: 'enfermeria', state: 'paused', step: 4 })).status, 200)
    assert.deepEqual(pick((await nurse.get('/api/auth/me')).body.user.prefs.tours.enfermeria), { state: 'paused', step: 4 })
    await nurse.post('/api/me/tour', { key: 'medico', state: 'skipped', step: 2 })
    await nurse.post('/api/me/tour', { key: 'enfermeria', state: 'done', step: 9 })
    const tours = (await nurse.get('/api/auth/me')).body.user.prefs.tours
    assert.deepEqual(pick(tours.enfermeria), { state: 'done', step: 0 })
    assert.deepEqual(pick(tours.medico), { state: 'skipped', step: 0 })
    assert.equal((await nurse.post('/api/me/tour', { key: 'Mal Nombre', state: 'done' })).status, 400)
  })
})

const pick = (x: { state: string; step: number }) => ({ state: x.state, step: x.step })
