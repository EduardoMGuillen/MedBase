import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb } from './db.js'
import { createSql, type Sql } from './sql.js'
import { loadSupplyCatalog } from './supplies.js'
import { SUPPLY_MD } from '../src/lib/supplyMd/generated.js'
import { matchesSupply, parseSupplyMd, stripLength, supplyLabel } from '../src/lib/supplies.js'

// Ronda 14, grupo RU (registro de uso de medicamentos y material): con la base y la API (copia en memoria de la demo)
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
const clinicOf = async (email: string) => String((await sql.one(`SELECT clinic_id FROM staff WHERE email = ?`, [email]))!.clinic_id)
const itemsOf = (cid: string) => sql.query('SELECT * FROM supply_items WHERE clinic_id = ? ORDER BY sort', [cid])
const byLabel = async (cid: string, material: string, variant = '') => (await sql.one('SELECT * FROM supply_items WHERE clinic_id = ? AND material = ? AND variant = ?', [cid, material, variant]))!

describe('RU1 (ronda 14): carga del catálogo desde el .md', () => {
  test('el .md se lee con su script: 73 líneas, 15 en la lista de turno, sin filas sin leer; no se carga «Cambios respecto…»', () => {
    const md = readFileSync('data/listado_material_medico_quirurgico.md', 'utf8')
    const parsed = parseSupplyMd(md)
    assert.deepEqual(parsed, SUPPLY_MD, 'src/lib/supplyMd/generated.ts está al día con el .md (npm run ru1:build)')
    assert.equal(parsed.rows.length, 73)
    assert.equal(parsed.skipped.length, 0)
    assert.equal(parsed.rows.filter((r) => r.onList).length, 15)
    // El .md trae 9 categorías (el pedido dice 10): se carga lo que dice el archivo
    assert.deepEqual([...new Set(parsed.rows.map((r) => r.category))], ['Agujas y jeringas', 'Acceso venoso', 'Curación y vendajes', 'Hojas de bisturí', 'Suturas',
      'Protección personal', 'Oxígeno y nebulización', 'Sondas y recolectores', 'Ginecología y recién nacido'])
    const changesLine = md.split(/\r?\n/).findIndex((l) => l.startsWith('## Cambios respecto')) + 1
    assert.ok(changesLine > 0 && Math.max(...parsed.rows.map((r) => r.line)) < changesLine)
    assert.ok(!parsed.rows.some((r) => /25 × 1½/.test(r.variant)), 'nada de la sección de cambios')
    assert.deepEqual(parsed.rows.filter((r) => r.onList).map(supplyLabel), ['Aguja hipodérmica 21 G', 'Jeringa descartable 3 mL, aguja 21 G', 'Jeringa descartable 5 mL, aguja 21 G',
      'Jeringa descartable 10 mL, aguja 21 G', 'Catéter IV 20 G', 'Catéter IV 22 G', 'Venoclisis Equipo de macrogoteo', 'Gasa hospitalaria Rollo 36" × 100 yd', 'Algodón Rollo',
      'Alcohol al 70 % Frasco', 'Esparadrapo Hospitalario', 'Nylon 3/0, aguja cortante', 'Guante descartable Talla M', 'Guante estéril No. 7.0', 'Guante estéril No. 7.5'])
    // Variante «—» = sin variante
    assert.equal(parsed.rows.find((r) => r.material === 'Mascarilla N95')!.variant, '')
  })

  test('cada clínica y consultorio de la demo tiene las 73 líneas y 15 en su lista de turno, con el periodo «Por turno»', async () => {
    for (const c of await sql.query('SELECT id FROM clinics')) {
      const rows = await itemsOf(String(c.id))
      assert.equal(rows.length, 73)
      assert.equal(rows.filter((r) => r.on_shift_list).length, 15)
      assert.equal(new Set(rows.map((r) => r.category)).size, 9)
      const s = (await sql.one('SELECT * FROM supply_settings WHERE clinic_id = ?', [String(c.id)]))!
      assert.equal(s.period, 'shift')
      assert.deepEqual(JSON.parse(String(s.shifts)).map((x: { label: string; from: string; to: string }) => `${x.label} ${x.from}-${x.to}`), ['Mañana 07:00-15:00', 'Tarde 15:00-23:00', 'Noche 23:00-07:00'])
    }
  })

  test('agujas, jeringas, catéteres y mariposas: solo calibre, nunca longitud', () => {
    assert.equal(stripLength('Aguja hipodérmica', '21 G × 1½"'), '21 G')
    assert.equal(stripLength('Aguja hipodérmica', '25 × 1½'), '25 G')
    assert.equal(stripLength('Aguja', '23G x 1 pulgada'), '23 G')
    assert.equal(stripLength('Catéter IV', '20 G, 32 mm'), '20 G')
    assert.equal(stripLength('Mariposa (scalp)', '21 G × 3/4"'), '21 G')
    assert.equal(stripLength('Jeringa descartable', '5 mL, aguja 21 G × 1½"'), '5 mL, aguja 21 G')
    assert.equal(stripLength('Jeringa descartable', '5 mL, aguja 21 G'), '5 mL, aguja 21 G')
    assert.equal(stripLength('Venda elástica', '4" × 5 yd'), '4" × 5 yd', 'lo que no es aguja no cambia')
    for (const r of SUPPLY_MD.rows.filter((x) => /aguja|jeringa|cat[eé]ter|mariposa/i.test(x.material))) {
      assert.ok(!/["”]|pulg|mm\b|cm\b|[½¼¾]/.test(r.variant), `${supplyLabel(r)} sin longitud`)
    }
  })

  test('buscar «seda» da las 8 variantes; «seda 4» da la 4/0', () => {
    const seda = SUPPLY_MD.rows.filter((r) => matchesSupply(r, 'seda'))
    assert.equal(seda.length, 8)
    assert.deepEqual(SUPPLY_MD.rows.filter((r) => matchesSupply(r, 'seda 4')).map(supplyLabel), ['Seda 4/0, aguja cortante'])
  })

  test('correr la carga dos veces no cambia nada', async () => {
    const cid = await clinicOf('admin@demo.clinara')
    const before = JSON.stringify(await itemsOf(cid))
    const r1 = await loadSupplyCatalog(sql, cid)
    const r2 = await loadSupplyCatalog(sql, cid)
    assert.deepEqual([r1.created, r1.updated, r2.created, r2.updated], [0, 0, 0, 0])
    assert.equal(r2.kept, 73)
    assert.equal(JSON.stringify(await itemsOf(cid)), before)
  })

  test('lo editado, archivado, marcado o desmarcado por la clínica no se pisa; lo demás se pone al día con el .md', async () => {
    const admin = await as('admin@demo.clinara')
    const cid = await clinicOf('admin@demo.clinara')
    const algodon = await byLabel(cid, 'Algodón', 'Rollo')
    const n95 = await byLabel(cid, 'Mascarilla N95')
    const bata = await byLabel(cid, 'Bata descartable')
    const s18 = await byLabel(cid, 'Aguja hipodérmica', '18 G')
    assert.equal((await admin.post(`/api/supplies/${algodon.id}/shift-list`, { on: false })).status, 200)
    assert.equal((await admin.post(`/api/supplies/${n95.id}/archive`)).status, 200)
    assert.equal((await admin.patch(`/api/supplies/${bata.id}`, { category: 'Protección personal', material: 'Bata descartable', variant: 'Talla única', unit: 'unidad' })).status, 200)
    // Una línea que nadie tocó y que quedó distinta del .md (p. ej. el .md cambió): la carga la pone al día
    await sql.run('UPDATE supply_items SET category = ? WHERE id = ?', ['Otra', String(s18.id)])
    const r = await loadSupplyCatalog(sql, cid)
    assert.equal(r.created, 0)
    assert.equal(r.updated, 1)
    assert.equal((await byLabel(cid, 'Algodón', 'Rollo')).on_shift_list, false, 'lo desmarcado sigue desmarcado')
    assert.ok((await byLabel(cid, 'Mascarilla N95')).archived_at, 'lo archivado sigue archivado')
    assert.equal((await byLabel(cid, 'Bata descartable', 'Talla única')).id, bata.id, 'lo editado sigue editado')
    assert.equal((await byLabel(cid, 'Aguja hipodérmica', '18 G')).category, 'Agujas y jeringas')
    // Restaurar para las demás pruebas
    assert.equal((await admin.post(`/api/supplies/${n95.id}/restore`)).status, 200)
    assert.equal((await admin.post(`/api/supplies/${algodon.id}/shift-list`, { on: true })).status, 200)
    const log = await sql.query(`SELECT action FROM audit WHERE action LIKE 'Configuración › Material médico quirúrgico:%' ORDER BY at`)
    assert.ok(log.some((l) => /quitó de la lista de turno «Algodón Rollo»/.test(String(l.action))))
    assert.ok(log.some((l) => /archivó «Mascarilla N95»/.test(String(l.action))))
    assert.ok(log.some((l) => /editó «Bata descartable» .* → «Bata descartable Talla única»/.test(String(l.action))))
  })

  test('una clínica y un consultorio nuevos nacen con las 73 líneas y 15 en su lista de turno', async () => {
    const sa = await as('superadmin@demo.clinara')
    const c = await sa.post('/api/platform/clinics', { name: 'Clínica Material Nuevo', admin: { name: 'Admin Material', email: 'admin@material.test' } })
    assert.equal(c.status, 201)
    const o = await sa.post('/api/platform/clinics', { name: 'Consultorio Dr. Nuevo', kind: 'office', owner: { name: 'Dr. Nuevo Titular', email: 'titular@material.test', license: 'CMH-9' } })
    assert.equal(o.status, 201)
    for (const id of [c.body.clinic.id, o.body.clinic.id]) {
      const rows = await itemsOf(String(id))
      assert.equal(rows.length, 73)
      assert.equal(rows.filter((r) => r.on_shift_list).length, 15)
    }
    // El administrador de la clínica nueva desmarca «Algodón»: sale de la lista corta pero sigue en el catálogo
    const na = await as('admin@material.test', c.body.password)
    const list = (await na.get('/api/supplies')).body.items as { id: string; material: string; onShiftList: boolean }[]
    const alg = list.find((i) => i.material === 'Algodón')!
    assert.equal((await na.post(`/api/supplies/${alg.id}/shift-list`, { on: false })).body.onShiftList, false)
    const again = (await na.get('/api/supplies')).body.items as { material: string; onShiftList: boolean }[]
    assert.equal(again.filter((i) => i.onShiftList).length, 14)
    assert.ok(again.some((i) => i.material === 'Algodón'))
    // La titular del consultorio nuevo también configura su catálogo
    const tit = await as('titular@material.test', o.body.password)
    assert.equal((await tit.post('/api/supplies', { category: 'Suturas', material: 'Nylon', variant: '4/0, aguja cortante', unit: 'sobre', onShiftList: true })).status, 201)
  })
})

describe('RU1 (ronda 14): permisos del catálogo (en el servidor)', () => {
  test('Administración agrega, edita y archiva; quita la longitud de una aguja', async () => {
    const admin = await as('admin@demo.clinara')
    const nylon = await admin.post('/api/supplies', { category: 'Suturas', material: 'Nylon', variant: '4/0, aguja cortante', unit: 'sobre', onShiftList: true })
    assert.equal(nylon.status, 201)
    assert.equal(nylon.body.onShiftList, true)
    assert.equal((await admin.post('/api/supplies', { category: 'Suturas', material: 'nylon', variant: '4/0, aguja cortante', unit: 'sobre' })).status, 409, 'no se repite')
    const aguja = await admin.post('/api/supplies', { category: 'Agujas y jeringas', material: 'Aguja hipodérmica', variant: '22 G × 1½"', unit: 'unidad' })
    assert.equal(aguja.status, 201)
    assert.equal(aguja.body.variant, '22 G')
  })

  test('Enfermería marca la lista de turno, pero no agrega, edita, archiva ni cambia el periodo', async () => {
    const nurse = await as('crios@demo.clinara')
    const cid = await clinicOf('crios@demo.clinara')
    const n95 = await byLabel(cid, 'Mascarilla N95')
    assert.equal((await nurse.get('/api/supplies')).status, 200)
    const on = await nurse.post(`/api/supplies/${n95.id}/shift-list`, { on: true })
    assert.equal(on.status, 200)
    assert.equal(on.body.onShiftList, true)
    assert.equal((await nurse.post('/api/supplies', { category: 'Suturas', material: 'Seda', variant: '6/0', unit: 'sobre' })).status, 403)
    assert.equal((await nurse.patch(`/api/supplies/${n95.id}`, { category: 'X', material: 'Mascarilla N95', variant: '', unit: 'unidad' })).status, 403)
    assert.equal((await nurse.post(`/api/supplies/${n95.id}/archive`)).status, 403)
    assert.equal((await nurse.put('/api/supplies/settings', { period: 'day', shifts: [] })).status, 403)
    await nurse.post(`/api/supplies/${n95.id}/shift-list`, { on: false })
  })

  test('Recepción y el médico no ven el catálogo', async () => {
    for (const email of ['smejia@demo.clinara', 'lherrera@demo.clinara']) {
      const u = await as(email)
      assert.equal((await u.get('/api/supplies')).status, 403, email)
      const cid = await clinicOf(email)
      const any = (await itemsOf(cid))[0]
      assert.equal((await u.post(`/api/supplies/${any.id}/shift-list`, { on: true })).status, 403, email)
    }
  })

  test('el periodo: turnos válidos y sin cruzarse; queda en la bitácora', async () => {
    const admin = await as('admin@demo.clinara')
    const bad = await admin.put('/api/supplies/settings', { period: 'shift', shifts: [{ label: 'Mañana', from: '07:00', to: '15:00' }, { label: 'Tarde', from: '14:00', to: '23:00' }] })
    assert.equal(bad.status, 400)
    assert.match(bad.body.error ?? bad.body.message ?? JSON.stringify(bad.body), /se cruza/)
    const ok = await admin.put('/api/supplies/settings', { period: 'day', shifts: [{ key: 'morning', label: 'Mañana', from: '07:00', to: '15:00' }, { key: 'afternoon', label: 'Tarde', from: '15:00', to: '23:00' }, { key: 'night', label: 'Noche', from: '23:00', to: '07:00' }] })
    assert.equal(ok.status, 200)
    assert.equal(ok.body.period, 'day')
    assert.ok(await sql.one(`SELECT 1 FROM audit WHERE action LIKE '%cambió el periodo de registro del material%Por turno%Por día%'`))
    await admin.put('/api/supplies/settings', { period: 'shift', shifts: ok.body.shifts })
  })
})
