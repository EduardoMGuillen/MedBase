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
import { currentPeriod, DEFAULT_SUPPLY_SETTINGS, parseSupplyMd } from '../src/lib/supplies.js'

// Ronda 15, grupo RU (catálogo v2, formulario, sets y vista del registro): con la base y la API (copia en memoria de la demo)
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
const nowPeriod = () => currentPeriod({ period: 'shift', shifts: DEFAULT_SUPPLY_SETTINGS.shifts })
const ROLLO = 'Rollo 36" × 100 yd'

describe('RU5 (ronda 15): catálogo v2 con «Registro»', () => {
  test('el .md v2: 208 líneas en 15 categorías, 73 de la ronda 14 y 135 nuevas, 17 en la lista de turno, 6 sets; nada sin leer', () => {
    const md = readFileSync('data/listado_material_medico_quirurgico.md', 'utf8')
    const parsed = parseSupplyMd(md)
    assert.deepEqual(parsed, SUPPLY_MD, 'src/lib/supplyMd/generated.ts está al día (npm run ru1:build)')
    assert.equal(parsed.rows.length, 208)
    assert.equal(new Set(parsed.rows.map((r) => r.category)).size, 15)
    assert.equal(parsed.rows.filter((r) => r.origin.startsWith('R14-')).length, 73)
    assert.equal(parsed.rows.filter((r) => r.origin === 'Nueva').length, 135)
    assert.equal(parsed.rows.filter((r) => r.onList).length, 17)
    assert.equal(parsed.skipped.length, 0)
    assert.deepEqual(parsed.sets.map((s) => s.name), ['Parto vaginal', 'Canalización de vía periférica', 'Sutura de herida simple', 'Curación de herida', 'Sondaje vesical', 'Toma de muestra venosa'])
    assert.equal(parsed.sets[0].items.length, 17)
    const row = (m: string, v = '') => parsed.rows.find((r) => r.material === m && r.variant === v)!
    assert.equal(row('Baja lengua (depresor)', 'Adulto').category, 'Exploración y monitoreo')
    for (const [m, v] of [['Gasa hospitalaria', ROLLO], ['Algodón', 'Rollo'], ['Esparadrapo', 'Hospitalario'], ['Esparadrapo', 'Antialérgico'], ['Alcohol al 70 %', 'Frasco']]) assert.equal(row(m, v).scope, 'general', m)
    const gasa = row('Gasa estéril', '10 × 10 cm')
    assert.deepEqual([gasa.scope, gasa.unit, gasa.onList], ['patient', 'unidad', true])
    assert.ok(!parsed.rows.some((r) => r.material === 'Nylon' && r.variant === '7/0, aguja cortante'), 'enfermería lo agrega en la prueba de RU4')
    assert.equal(parsed.rows.filter((r) => r.category === 'Suturas').length, 26)
  })

  test('cada clínica y consultorio tiene las 208 líneas en 15 categorías y los 6 sets; correr la carga dos veces no cambia nada', async () => {
    for (const c of await sql.query('SELECT id FROM clinics')) {
      const rows = await sql.query('SELECT * FROM supply_items WHERE clinic_id = ? AND archived_at IS NULL', [String(c.id)])
      assert.equal(rows.length, 208)
      assert.equal(new Set(rows.map((r) => r.category)).size, 15)
      assert.equal(rows.filter((r) => r.on_shift_list).length, 17)
      assert.equal((await sql.query('SELECT 1 FROM supply_sets WHERE clinic_id = ?', [String(c.id)])).length, 6)
    }
    const cid = await clinicOfUser('admin@demo.clinara')
    const before = JSON.stringify(await sql.query('SELECT * FROM supply_items WHERE clinic_id = ? ORDER BY id', [cid]))
    const sets = JSON.stringify(await sql.query('SELECT * FROM supply_sets WHERE clinic_id = ? ORDER BY id', [cid]))
    const r = await loadSupplyCatalog(sql, cid)
    assert.deepEqual([r.created, r.updated, r.sets.created, r.sets.updated], [0, 0, 0, 0])
    assert.equal(JSON.stringify(await sql.query('SELECT * FROM supply_items WHERE clinic_id = ? ORDER BY id', [cid])), before)
    assert.equal(JSON.stringify(await sql.query('SELECT * FROM supply_sets WHERE clinic_id = ? ORDER BY id', [cid])), sets)
  })

  test('una clínica de la ronda 14: Categoría y Registro al día en lo no editado; lo editado, archivado y lo propio no se toca; se agregan las nuevas', async () => {
    // Una clínica nueva que se deja como quedó con la ronda 14: sin las 135 nuevas ni sets, las de la ronda 14 en «Ambos»
    const sa = await as('superadmin@demo.clinara')
    const c = await sa.post('/api/platform/clinics', { name: 'Clínica Ronda 14', admin: { name: 'Admin R14', email: 'admin@r14.test' } })
    assert.equal(c.status, 201, JSON.stringify(c.body))
    const cid = String(c.body.clinic.id)
    const fresh = SUPPLY_MD.rows.filter((r) => r.origin === 'Nueva').map((r) => r.key)
    await sql.run(`DELETE FROM supply_sets WHERE clinic_id = ?`, [cid])
    await sql.run(`DELETE FROM supply_items WHERE clinic_id = ? AND md_key IN (${fresh.map(() => '?').join(',')})`, [cid, ...fresh])
    await sql.run(`UPDATE supply_items SET category = 'Curación y vendajes', scope = 'both' WHERE clinic_id = ?`, [cid])
    // La clínica editó una, archivó otra y creó por su cuenta una que en la v2 es nueva
    const bata = await lineOf(cid, 'Bata descartable')
    await sql.run(`UPDATE supply_items SET variant = 'Talla única', category = 'Mi categoría', edited_at = ? WHERE id = ?`, [new Date().toISOString(), String(bata.id)])
    const algodon = await lineOf(cid, 'Algodón', 'Rollo')
    await sql.run(`UPDATE supply_items SET archived_at = ? WHERE id = ?`, [new Date().toISOString(), String(algodon.id)])
    await sql.run(`INSERT INTO supply_items (id, clinic_id, category, material, variant, unit, on_shift_list, sort, origin, created_at) VALUES (?,?,?,?,?,?,FALSE,999,'clinic',?)`,
      [`own-${Date.now()}`, cid, 'Suturas', 'Nylon', '4/0, aguja cortante', 'sobre', new Date().toISOString()])
    assert.equal((await sql.query('SELECT 1 FROM supply_items WHERE clinic_id = ?', [cid])).length, 74)
    const r = await loadSupplyCatalog(sql, cid)
    assert.equal(r.created, 134, 'las nuevas menos la que la clínica ya tenía')
    assert.equal(r.clinicOwn, 1)
    assert.equal(r.protected, 2, 'la editada y la archivada')
    assert.equal(r.updated, 71)
    assert.equal(r.sets.created, 6)
    assert.equal((await lineOf(cid, 'Baja lengua (depresor)', 'Adulto')).category, 'Exploración y monitoreo')
    assert.equal((await lineOf(cid, 'Gasa hospitalaria', ROLLO)).scope, 'general')
    assert.equal((await lineOf(cid, 'Bata descartable', 'Talla única')).category, 'Mi categoría', 'la editada conserva su texto y su categoría')
    const alg = await lineOf(cid, 'Algodón', 'Rollo')
    assert.ok(alg.archived_at)
    assert.equal(alg.scope, 'both', 'la archivada no se toca')
    assert.equal((await sql.query(`SELECT 1 FROM supply_items WHERE clinic_id = ? AND material = 'Nylon' AND variant = '4/0, aguja cortante'`, [cid])).length, 1, 'no hay dos iguales')
    const again = await loadSupplyCatalog(sql, cid)
    assert.deepEqual([again.created, again.updated, again.sets.created, again.sets.updated], [0, 0, 0, 0])
  })

  test('a un paciente no se le suma un rollo ni un frasco; al uso general sí; la gasa estéril va por unidad a un paciente', async () => {
    const cid = await clinicOfUser('crios@demo.clinara')
    const nurse = await as('crios@demo.clinara')
    const p = nowPeriod()
    const pt = String((await sql.one('SELECT id FROM patients WHERE clinic_id = ? ORDER BY record LIMIT 1', [cid]))!.id)
    for (const [m, v] of [['Gasa hospitalaria', ROLLO], ['Algodón', 'Rollo'], ['Esparadrapo', 'Hospitalario'], ['Alcohol al 70 %', 'Frasco']]) {
      const item = await lineOf(cid, m, v)
      const bad = await nurse.post('/api/usage/material', { patientId: pt, day: p.day, shiftKey: p.shiftKey, items: [{ itemId: item.id, quantity: 1 }] })
      assert.equal(bad.status, 400, m)
      assert.match(bad.body.error, /se registra en Uso general del servicio/)
      assert.equal((await nurse.post('/api/usage/material', { general: true, day: p.day, shiftKey: p.shiftKey, items: [{ itemId: item.id, quantity: 1 }] })).status, 201, m)
    }
    const gasa = await lineOf(cid, 'Gasa estéril', '10 × 10 cm')
    assert.equal(gasa.on_shift_list, true)
    const ok = await nurse.post('/api/usage/material', { patientId: pt, day: p.day, shiftKey: p.shiftKey, items: [{ itemId: gasa.id, quantity: 4 }] })
    assert.equal(ok.status, 201, JSON.stringify(ok.body))
    assert.equal(ok.body.items[0].unit, 'unidad')
    const guante = await lineOf(cid, 'Guante estéril', 'No. 7.5')
    const gen = await nurse.post('/api/usage/material', { general: true, day: p.day, shiftKey: p.shiftKey, items: [{ itemId: guante.id, quantity: 1 }] })
    assert.equal(gen.status, 400)
    assert.match(gen.body.error, /se registra por paciente/)
  })

  test('un registro viejo de un rollo de gasa a un paciente se sigue viendo igual', async () => {
    const cid = await clinicOfUser('crios@demo.clinara')
    const nurseId = String((await sql.one(`SELECT id FROM staff WHERE email = 'crios@demo.clinara'`))!.id)
    const pt = String((await sql.one('SELECT id FROM patients WHERE clinic_id = ? ORDER BY record LIMIT 1 OFFSET 1', [cid]))!.id)
    const gasa = await lineOf(cid, 'Gasa hospitalaria', ROLLO)
    const p = nowPeriod()
    const items = [{ itemId: gasa.id, category: 'Curación y vendajes', material: 'Gasa hospitalaria', variant: ROLLO, unit: 'rollo', quantity: 1 }]
    const id = `old-${Date.now()}`
    await sql.run(`INSERT INTO material_uses (id, clinic_id, patient_id, general, area, location, period_kind, period_start, period_end, period_label, shift_key, items, recorded_by, recorded_at)
      VALUES (?,?,?,FALSE,'outpatient','Consulta externa','shift',?,?,?,?,?,?,?)`, [id, cid, pt, p.start, p.end, p.label, p.shiftKey, JSON.stringify(items), nurseId, new Date().toISOString()])
    const nurse = await as('crios@demo.clinara')
    const list = await nurse.get(`/api/usage/material?from=${encodeURIComponent(p.start)}&to=${encodeURIComponent(p.end)}`)
    const rec = list.body.records.find((r: { id: string }) => r.id === id)
    assert.deepEqual(rec.items.map((i: { material: string; variant: string; unit: string; quantity: number }) => [i.material, i.variant, i.unit, i.quantity]), [['Gasa hospitalaria', ROLLO, 'rollo', 1]])
  })
})
