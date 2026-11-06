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
import { currentPeriod, DEFAULT_SUPPLY_SETTINGS, localDay, parseSupplyMd, periodOf } from '../src/lib/supplies.js'
import { sortSuggestions } from '../src/lib/usage.js'
import { fromLocalValue } from '../src/lib/dateInput.js'

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

describe('RU4 (ronda 15): «Agregar material» para Administración y Enfermería; editar y archivar, solo Administración', () => {
  test('enfermería agrega «Nylon 7/0, aguja cortante» en la lista de turno; no edita ni archiva (por URL directa)', async () => {
    const nurse = await as('crios@demo.clinara')
    const r = await nurse.post('/api/supplies', { category: 'Suturas', material: 'Nylon', variant: '7/0, aguja cortante', unit: 'sobre', scope: 'patient', onShiftList: true })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    assert.deepEqual([r.body.scope, r.body.onShiftList, r.body.origin], ['patient', true, 'clinic'])
    const list = await nurse.get('/api/supplies')
    assert.ok(list.body.items.some((i: { id: string }) => i.id === r.body.id), 'aparece en el catálogo (y en el formulario, que lee el mismo)')
    assert.equal((await nurse.patch(`/api/supplies/${r.body.id}`, { category: 'Suturas', material: 'Nylon', variant: '6/0', unit: 'sobre', scope: 'patient' })).status, 403)
    assert.equal((await nurse.post(`/api/supplies/${r.body.id}/archive`)).status, 403)
    const dup = await nurse.post('/api/supplies', { category: 'Suturas', material: 'Seda', variant: '3/0, aguja cortante', unit: 'sobre' })
    assert.equal(dup.status, 409)
    assert.match(dup.body.error, /^Ya existe en el catálogo/)
    // Sin tildes ni mayúsculas también es el mismo
    assert.equal((await nurse.post('/api/supplies', { category: 'Suturas', material: 'NYLON', variant: '7/0, AGUJA CORTANTE', unit: 'sobre' })).status, 409)
  })

  test('si la que existe está archivada, lo dice y devuelve cuál (para «Restaurar»); recepción no agrega', async () => {
    const admin = await as('admin@demo.clinara')
    const cid = await clinicOfUser('admin@demo.clinara')
    const line = await lineOf(cid, 'Bata descartable')
    assert.equal((await admin.post(`/api/supplies/${line.id}/archive`)).status, 200)
    const dup = await admin.post('/api/supplies', { category: 'Ropa', material: 'Bata descartable', variant: '', unit: 'unidad' })
    assert.equal(dup.status, 409)
    assert.match(dup.body.error, /\(archivado\)/)
    assert.equal(dup.body.existing.id, line.id)
    assert.equal((await admin.post(`/api/supplies/${line.id}/restore`)).status, 200)
    const rec = await as('smejia@demo.clinara')
    assert.equal((await rec.post('/api/supplies', { category: 'Suturas', material: 'Nylon', variant: '8/0', unit: 'sobre' })).status, 403)
  })

  test('Administración edita y archiva una línea y queda en la bitácora', async () => {
    const admin = await as('admin@demo.clinara')
    const cid = await clinicOfUser('admin@demo.clinara')
    const line = await lineOf(cid, 'Baja lengua (depresor)', 'Adulto')
    const e = await admin.patch(`/api/supplies/${line.id}`, { category: String(line.category), material: 'Baja lengua (depresor)', variant: 'Adulto, de madera', unit: 'unidad', scope: 'both' })
    assert.equal(e.status, 200, JSON.stringify(e.body))
    assert.equal((await admin.post(`/api/supplies/${line.id}/archive`)).status, 200)
    const log = (await sql.query(`SELECT action FROM audit WHERE clinic_id = ? AND action LIKE '%Baja lengua%'`, [cid])).map((r) => String(r.action))
    assert.ok(log.some((a) => a.includes('editó')), log.join('\n'))
    assert.ok(log.some((a) => a.includes('archivó')), log.join('\n'))
  })

  test('en el consultorio, la titular agrega materiales', async () => {
    const doc = await as('alopez@demo.clinara')
    const r = await doc.post('/api/supplies', { category: 'Suturas', material: 'Nylon', variant: '7/0, aguja cortante', unit: 'sobre', scope: 'patient' })
    assert.equal(r.status, 201, JSON.stringify(r.body))
  })
})

describe('RU7 (ronda 15): «¿Para quién?» con los atendidos e internados del periodo', () => {
  test('una consulta externa de la tarde (guardada en UTC) sale en el turno de la tarde; agrupados y con «Ya tiene registro»', async () => {
    const cid = await clinicOfUser('crios@demo.clinara')
    const nurse = await as('crios@demo.clinara')
    const shifts = DEFAULT_SUPPLY_SETTINGS.shifts
    const tarde = shifts.find((s) => s.from === '15:00')!
    const today = localDay(new Date())
    const p = periodOf('shift', today, shifts, tarde.key)
    // Un paciente sin estancia, atendido hoy a las 17:14 de Honduras (23:14 UTC): antes quedaba «después» de las 23:00
    const pt = (await sql.one(`SELECT p.id, p.first_name, p.last_name FROM patients p WHERE p.clinic_id = ? AND NOT EXISTS (SELECT 1 FROM hospitalizations h WHERE h.patient_id = p.id)
      ORDER BY p.record DESC LIMIT 1`, [cid]))!
    const at = fromLocalValue(`${today}T17:14`).toISOString()
    assert.match(at, /Z$/)
    await sql.run(`INSERT INTO consultations (id, patient_id, doctor_id, date, reason, diagnoses, plan, orders, clinic_id) VALUES (?,?, 's-herrera', ?, 'Fiebre', '[]', '', '[]', ?)`,
      [`c-ru7-${Date.now()}`, String(pt.id), at, cid])
    const q = (x: { start: string; end: string }) => `from=${encodeURIComponent(x.start)}&to=${encodeURIComponent(x.end)}`
    const s = await nurse.get(`/api/usage/suggest?${q(p)}`)
    assert.equal(s.status, 200)
    const mine = s.body.patients.find((x: { id: string }) => x.id === String(pt.id))
    assert.ok(mine, 'el atendido en consulta externa en el periodo sale')
    assert.deepEqual([mine.area, mine.location, mine.records], ['outpatient', 'Consulta externa', 0])
    // A9: Consulta externa, Observación y Hospitalización, en ese orden
    const rank = { outpatient: 0, observation: 1, hospital: 2 } as Record<string, number>
    const areas = s.body.patients.map((x: { area: string }) => rank[x.area])
    assert.deepEqual(areas, [...areas].sort((a: number, b: number) => a - b))
    for (const x of s.body.patients.filter((y: { area: string }) => y.area !== 'outpatient')) assert.match(x.location, /^(Observación|Hospitalización)( · Cuarto .+)?$/)
    // Fuera del periodo (la mañana) no sale
    const manana = periodOf('shift', today, shifts, shifts.find((x) => x.from === '07:00')!.key)
    assert.ok(!(await nurse.get(`/api/usage/suggest?${q(manana)}`)).body.patients.some((x: { id: string }) => x.id === String(pt.id)))
    // «Ya tiene registro (n)»: el paciente y el uso general
    const gasa = await lineOf(cid, 'Gasa estéril', '10 × 10 cm')
    const alcohol = await lineOf(cid, 'Alcohol al 70 %', 'Frasco')
    assert.equal((await nurse.post('/api/usage/material', { patientId: String(pt.id), day: today, shiftKey: tarde.key, items: [{ itemId: gasa.id, quantity: 2 }] })).status, 201)
    assert.equal((await nurse.post('/api/usage/material', { general: true, day: today, shiftKey: tarde.key, items: [{ itemId: alcohol.id, quantity: 1 }] })).status, 201)
    const again = await nurse.get(`/api/usage/suggest?${q(p)}`)
    assert.equal(again.body.patients.find((x: { id: string }) => x.id === String(pt.id)).records, 1)
    assert.ok(again.body.general >= 1)
  })

  test('sortSuggestions: consulta externa por hora (la más reciente arriba), observación y hospitalización por cuarto', () => {
    const list = sortSuggestions([
      { name: 'B', area: 'hospital', bed: 'Cuarto 201' }, { name: 'A', area: 'outpatient', at: '2026-11-06T15:00:00.000Z' }, { name: 'C', area: 'observation', bed: 'Cuarto 103' },
      { name: 'D', area: 'observation', bed: 'Cuarto 101-B' }, { name: 'E', area: 'outpatient', at: '2026-11-06T18:00:00.000Z' }, { name: 'F', area: 'hospital', bed: 'Cuarto 105' },
      { name: 'G', area: 'observation', bed: 'Cuarto 101-A' },
    ] as Parameters<typeof sortSuggestions>[0])
    assert.deepEqual(list.map((x) => x.name), ['E', 'A', 'G', 'D', 'C', 'F', 'B'])
  })
})
