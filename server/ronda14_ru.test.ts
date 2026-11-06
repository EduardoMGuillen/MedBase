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
import { addDays, currentPeriod, DEFAULT_SUPPLY_SETTINGS, matchesSupply, parseSupplyMd, stripLength, supplyLabel, usageFileName } from '../src/lib/supplies.js'
import { byPatient, materialSums, materialTotals, medSummary, summaryText, type MaterialRecord, type MedUse } from '../src/lib/usage.js'
import { buildMaterialWorkbook, buildMedsWorkbook } from '../src/lib/usageExcel.js'
import ExcelJS from 'exceljs'

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
  // RU5 (ronda 15): el .md v2 reemplaza al de la ronda 14 (208 líneas, 15 categorías, 17 en la lista de turno; ver ronda15.test.ts)
  test('el .md se lee con su script: sin filas sin leer; no se carga «Cambios respecto…» ni el Anexo como líneas', () => {
    const md = readFileSync('data/listado_material_medico_quirurgico.md', 'utf8')
    const parsed = parseSupplyMd(md)
    assert.deepEqual(parsed, SUPPLY_MD, 'src/lib/supplyMd/generated.ts está al día con el .md (npm run ru1:build)')
    assert.equal(parsed.rows.length, 208)
    assert.equal(parsed.skipped.length, 0)
    assert.equal(parsed.rows.filter((r) => r.onList).length, 17)
    const annexLine = md.split(/\r?\n/).findIndex((l) => l.startsWith('## Anexo')) + 1
    assert.ok(annexLine > 0 && Math.max(...parsed.rows.map((r) => r.line)) < annexLine)
    assert.ok(!parsed.rows.some((r) => /25 × 1½/.test(r.variant)), 'nada de la sección de cambios')
    // Variante «—» = sin variante
    assert.equal(parsed.rows.find((r) => r.material === 'Mascarilla N95')!.variant, '')
  })

  test('cada clínica y consultorio de la demo tiene el catálogo (v2: 208 líneas, 17 en su lista de turno), con el periodo «Por turno»', async () => {
    for (const c of await sql.query('SELECT id FROM clinics')) {
      const rows = await itemsOf(String(c.id))
      assert.equal(rows.length, 208)
      assert.equal(rows.filter((r) => r.on_shift_list).length, 17)
      assert.equal(new Set(rows.map((r) => r.category)).size, 15)
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
    assert.equal(seda.length, 8, 'v2: las mismas 8 sedas')
    assert.deepEqual(SUPPLY_MD.rows.filter((r) => matchesSupply(r, 'seda 4')).map(supplyLabel), ['Seda 4/0, aguja cortante'])
  })

  test('correr la carga dos veces no cambia nada', async () => {
    const cid = await clinicOf('admin@demo.clinara')
    const before = JSON.stringify(await itemsOf(cid))
    const r1 = await loadSupplyCatalog(sql, cid)
    const r2 = await loadSupplyCatalog(sql, cid)
    assert.deepEqual([r1.created, r1.updated, r2.created, r2.updated], [0, 0, 0, 0])
    assert.equal(r2.unchanged, SUPPLY_MD.rows.length)
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

  test('una clínica y un consultorio nuevos nacen con el catálogo (v2: 208 líneas, 17 en su lista de turno)', async () => {
    const sa = await as('superadmin@demo.clinara')
    const c = await sa.post('/api/platform/clinics', { name: 'Clínica Material Nuevo', admin: { name: 'Admin Material', email: 'admin@material.test' } })
    assert.equal(c.status, 201)
    const o = await sa.post('/api/platform/clinics', { name: 'Consultorio Dr. Nuevo', kind: 'office', owner: { name: 'Dr. Nuevo Titular', email: 'titular@material.test', license: 'CMH-9' } })
    assert.equal(o.status, 201)
    for (const id of [c.body.clinic.id, o.body.clinic.id]) {
      const rows = await itemsOf(String(id))
      assert.equal(rows.length, 208)
      assert.equal(rows.filter((r) => r.on_shift_list).length, 17)
    }
    // El administrador de la clínica nueva desmarca «Algodón»: sale de la lista corta pero sigue en el catálogo
    const na = await as('admin@material.test', c.body.password)
    const list = (await na.get('/api/supplies')).body.items as { id: string; material: string; onShiftList: boolean }[]
    const alg = list.find((i) => i.material === 'Algodón')!
    assert.equal((await na.post(`/api/supplies/${alg.id}/shift-list`, { on: false })).body.onShiftList, false)
    const again = (await na.get('/api/supplies')).body.items as { material: string; onShiftList: boolean }[]
    assert.equal(again.filter((i) => i.onShiftList).length, 16)
    assert.ok(again.some((i) => i.material === 'Algodón'))
    // La titular del consultorio nuevo también configura su catálogo
    const tit = await as('titular@material.test', o.body.password)
    assert.equal((await tit.post('/api/supplies', { category: 'Suturas', material: 'Nylon', variant: '8/0, aguja cortante', unit: 'sobre', onShiftList: true })).status, 201)
  })
})

describe('RU1 (ronda 14): permisos del catálogo (en el servidor)', () => {
  test('Administración agrega, edita y archiva; quita la longitud de una aguja', async () => {
    const admin = await as('admin@demo.clinara')
    const nylon = await admin.post('/api/supplies', { category: 'Suturas', material: 'Nylon', variant: '8/0, aguja cortante', unit: 'sobre', onShiftList: true })
    assert.equal(nylon.status, 201)
    assert.equal(nylon.body.onShiftList, true)
    assert.equal((await admin.post('/api/supplies', { category: 'Suturas', material: 'nylon', variant: '8/0, aguja cortante', unit: 'sobre' })).status, 409, 'no se repite')
    const aguja = await admin.post('/api/supplies', { category: 'Agujas y jeringas', material: 'Aguja hipodérmica', variant: '19 G × 1½"', unit: 'unidad' })
    assert.equal(aguja.status, 201, JSON.stringify(aguja.body))
    assert.equal(aguja.body.variant, '19 G')
  })

  test('Enfermería marca la lista de turno y agrega (RU4, ronda 15), pero no edita, archiva ni cambia el periodo', async () => {
    const nurse = await as('crios@demo.clinara')
    const cid = await clinicOf('crios@demo.clinara')
    const n95 = await byLabel(cid, 'Mascarilla N95')
    assert.equal((await nurse.get('/api/supplies')).status, 200)
    const on = await nurse.post(`/api/supplies/${n95.id}/shift-list`, { on: true })
    assert.equal(on.status, 200)
    assert.equal(on.body.onShiftList, true)
    // RU4 (ronda 15, A4): Enfermería ya agrega; aquí uno que ya existe, para no cambiar el catálogo de las demás pruebas
    assert.equal((await nurse.post('/api/supplies', { category: 'Suturas', material: 'Seda', variant: '3/0, aguja cortante', unit: 'sobre' })).status, 409)
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

// ---------- RU2 ----------
const MAIN = 'c-sb'
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
/** Ventana de las últimas 6 horas (para no depender del turno en que corren las pruebas). */
const win = () => `from=${encodeURIComponent(ago(360))}&to=${encodeURIComponent(new Date(Date.now() + 60_000).toISOString())}`
async function insertMed(hospId: string, patientId: string, m: Record<string, unknown>) {
  const id = `ru-med-${Math.random().toString(36).slice(2, 8)}`
  await sql.run(`INSERT INTO hosp_meds (id, clinic_id, hospitalization_id, patient_id, drug, presentation, dose, route, every_hours, prn, first_at, ordered_by, ordered_at, infusion_rate, infusion_unit, nebulization)
    VALUES (?,?,?,?,?,?,?,?,?,FALSE,?,?,?,?,?,?)`, [id, MAIN, hospId, patientId, m.drug, m.presentation ?? null, m.dose, m.route, m.every ?? null, ago(400), 's-herrera', ago(400),
    m.rate ?? null, m.rate ? 'ml/h' : null, m.neb ? JSON.stringify(m.neb) : null])
  return id
}
async function insertDose(medId: string, minAgo: number, status = 'given', dose?: string) {
  await sql.run(`INSERT INTO hosp_doses (id, clinic_id, med_id, scheduled_at, given_at, given_by, status, note, dose, recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [`ru-dose-${Math.random().toString(36).slice(2, 10)}`, MAIN, medId, ago(minAgo), ago(minAgo), 's-rios', status, status === 'given' ? null : 'Paciente en ayuno', dose ?? null, ago(minAgo)])
}

describe('RU2 (ronda 14): pestaña «Medicamentos»', () => {
  let hosp: { id: string; patient_id: string }
  let outpatient = ''
  before(async () => {
    hosp = (await sql.one(`SELECT id, patient_id FROM hospitalizations WHERE clinic_id = ? AND status = 'active' AND kind = 'hospital' LIMIT 1`, [MAIN])) as typeof hosp
    const ceftri = await insertMed(hosp.id, hosp.patient_id, { drug: 'Ceftriaxona RU', presentation: 'Vial 1 g', dose: '1 g', route: 'Intravenosa', every: 12 })
    await insertDose(ceftri, 120, 'given', '1 g')
    await insertDose(ceftri, 60, 'given', '1 g')
    await insertDose(ceftri, 30, 'skipped')
    await insertDose(ceftri, 20, 'omitted')
    const neb = await insertMed(hosp.id, hosp.patient_id, { drug: 'Nebulización', dose: '1 sesión', route: 'Nebulización', every: 6, neb: { components: [{ drug: 'Salbutamol RU', amount: '0.5 mL' }, { drug: 'Bromuro de ipratropio RU', amount: '1 mL' }], diluent: 'SSN 0.9%', diluentVolume: '3 mL' } })
    await insertDose(neb, 90)
    const inf = await insertMed(hosp.id, hosp.patient_id, { drug: 'Oxitocina RU', dose: '20 UI', route: 'Intravenosa', rate: 20 })
    await insertDose(inf, 100)
    await insertDose(inf, 50)
    outpatient = String((await sql.one(`SELECT id FROM patients WHERE clinic_id = ? AND id <> ? AND id NOT IN (SELECT patient_id FROM hospitalizations WHERE status = 'active') LIMIT 1`, [MAIN, hosp.patient_id]))!.id)
    const app = (i: number, status: string, at: string | null, drug: string) => sql.run(`INSERT INTO consult_applications (id, clinic_id, patient_id, consultation_id, item_index, drug, order_text, ordered_by, ordered_at, status, applied_at, reason, recorded_by, recorded_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [`ru-app-${i}`, MAIN, outpatient, 'ru-consulta', i, drug, `${drug} (ampolla 75 mg/3 mL): 1 ampolla vía intramuscular dosis única.`, 's-paz', ago(200), status, at,
      status === 'not_applied' ? 'El paciente se retiró' : null, status === 'pending' ? null : 's-rios', at])
    await app(0, 'applied', ago(45), 'Diclofenaco RU')
    await app(1, 'not_applied', null, 'Ketorolaco RU')
    await app(2, 'pending', null, 'Dexametasona RU')
  })

  test('Enfermería ve cada aplicación por paciente con hora, quién la aplicó y el médico que la indicó', async () => {
    const nurse = await as('crios@demo.clinara')
    const r = await nurse.get(`/api/usage/meds?${win()}`)
    assert.equal(r.status, 200)
    const mine = (r.body.rows as any[]).filter((x) => / RU/.test(x.drug))
    const ceftri = mine.filter((x) => x.drug === 'Ceftriaxona RU')
    assert.equal(ceftri.length, 2, '«No aplicada» y «Omitida» no salen')
    assert.equal(ceftri[0].appliedBy, 'Lic. Carmen Ríos')
    assert.equal(ceftri[0].appliedByTitle, 'Enfermería')
    assert.equal(ceftri[0].orderedBy, 'Dra. Lucía Herrera')
    assert.match(ceftri[0].medication, /^Ceftriaxona RU \(vial 1 g\) 1 g vía intravenosa$/)
    assert.match(ceftri[0].location, /^Hospitalización · Cuarto /)
    // Nebulización: una línea por componente; infusión: una línea al iniciar
    assert.deepEqual(mine.filter((x) => /Salbutamol|ipratropio/.test(x.drug)).map((x) => x.medication).sort(), ['Bromuro de ipratropio RU 1 mL · nebulización', 'Salbutamol RU 0.5 mL · nebulización'])
    assert.equal(mine.filter((x) => x.drug === 'Oxitocina RU').length, 1)
    // Consulta externa (ME13): solo «Aplicado»
    const diclo = mine.filter((x) => x.source === 'consult')
    assert.deepEqual(diclo.map((x) => [x.drug, x.location, x.appliedBy, x.orderedBy]), [['Diclofenaco RU', 'Consulta externa', 'Lic. Carmen Ríos', 'Dr. Andrés Paz']])
    // Área y búsqueda
    const out = await nurse.get(`/api/usage/meds?${win()}&area=outpatient`)
    assert.ok((out.body.rows as any[]).every((x) => x.area === 'outpatient'))
    const q = await nurse.get(`/api/usage/meds?${win()}&q=${encodeURIComponent('ceftriaxona ru')}`)
    assert.deepEqual([...new Set((q.body.rows as any[]).map((x) => x.drug))], ['Ceftriaxona RU'])
  })

  test('el resumen cuenta aplicaciones y suma solo con la misma unidad', async () => {
    const nurse = await as('crios@demo.clinara')
    const rows = ((await nurse.get(`/api/usage/meds?${win()}`)).body.rows as any[]).filter((x) => / RU/.test(x.drug))
    const s = medSummary(rows)
    assert.equal(summaryText(s.find((x) => x.drug === 'Ceftriaxona RU')!), 'Ceftriaxona RU vial 1 g · 2 aplicaciones · 2 g')
    const mixed = medSummary([{ ...rows[0], dose: '1 g' }, { ...rows[0], dose: '500 mg' }])
    assert.equal(mixed[0].total, undefined, 'unidades distintas: sin total')
  })

  test('Recepción y Administración ven; el médico no (también por URL directa)', async () => {
    for (const email of ['smejia@demo.clinara', 'admin@demo.clinara']) assert.equal((await (await as(email)).get(`/api/usage/meds?${win()}`)).status, 200, email)
    const doc = await as('lherrera@demo.clinara')
    assert.equal((await doc.get(`/api/usage/meds?${win()}`)).status, 403)
    assert.equal((await doc.get(`/api/usage/material?${win()}`)).status, 403)
  })
})

describe('RU2 (ronda 14): pestaña «Material»', () => {
  let p1 = ''
  let p2 = ''
  const ids: Record<string, string> = {}
  let today = ''
  let shift = ''
  before(async () => {
    const [a, b] = await sql.query(`SELECT id FROM patients WHERE clinic_id = ? ORDER BY record LIMIT 2`, [MAIN])
    p1 = String(a.id); p2 = String(b.id)
    for (const [k, m, v] of [['gasa', 'Gasa estéril', '10 × 10 cm'], ['guante', 'Guante estéril', 'No. 7.5'], ['seda', 'Seda', '4/0, aguja cortante'], ['jeringa', 'Jeringa descartable', '5 mL, aguja 21 G'],
      ['alcohol', 'Alcohol al 70 %', 'Frasco'], ['n95', 'Mascarilla N95', '']]) ids[k] = String((await byLabel(MAIN, m, v)).id)
    const p = currentPeriod({ period: 'shift', shifts: DEFAULT_SUPPLY_SETTINGS.shifts })
    today = p.day; shift = p.shiftKey!
  })
  const body = (patientId: string | undefined, items: [string, number][]) =>
    ({ patientId, general: !patientId, day: today, shiftKey: shift, items: items.map(([k, quantity]) => ({ itemId: ids[k], quantity })) })
  const material = async (u: Awaited<ReturnType<typeof as>>) =>
    (await u.get(`/api/usage/material?from=${encodeURIComponent(ago(60 * 30))}&to=${encodeURIComponent(new Date(Date.now() + 86_400_000).toISOString())}`)).body.records as MaterialRecord[]

  test('modo suma por paciente, uso general y total del periodo; sin paciente no se guarda', async () => {
    const nurse = await as('crios@demo.clinara')
    const r1 = await nurse.post('/api/usage/material', body(p1, [['gasa', 1], ['guante', 2], ['seda', 1], ['jeringa', 3]]))
    assert.equal(r1.status, 201)
    assert.equal(r1.body.periodKind, 'shift')
    assert.equal((await nurse.post('/api/usage/material', body(p1, [['guante', 2]]))).status, 201)
    assert.equal((await nurse.post('/api/usage/material', body(p2, [['jeringa', 2]]))).status, 201)
    const gen = await nurse.post('/api/usage/material', body(undefined, [['alcohol', 1]]))
    assert.equal(gen.status, 201)
    assert.equal(gen.body.general, true)
    const none = await nurse.post('/api/usage/material', { general: false, day: today, shiftKey: shift, items: [{ itemId: ids.gasa, quantity: 1 }] })
    assert.equal(none.status, 400)
    assert.equal((await nurse.post('/api/usage/material', body(p1, []))).status, 400, 'sin cantidades no se guarda')
    assert.equal((await nurse.post('/api/usage/material', body(p1, [['gasa', 0]]))).status, 400)
    const recs = await material(nurse)
    const blocks = byPatient(recs)
    const b1 = blocks.find((b) => b.patientId === p1)!
    assert.equal(materialSums(b1.rows).find((s) => s.itemId === ids.guante)!.quantity, 4, 'Guante estéril 7.5 = 4')
    assert.equal(blocks[blocks.length - 1].name, 'Uso general del servicio', 'el uso general va al final')
    assert.equal(materialTotals(recs).find((s) => s.itemId === ids.jeringa)!.quantity, 5, 'Jeringa 5 mL = 5')
  })

  test('anular con motivo: deja de sumar y queda tachado; Administración anula, Recepción y Administración no registran', async () => {
    const nurse = await as('crios@demo.clinara')
    const admin = await as('admin@demo.clinara')
    const recep = await as('smejia@demo.clinara')
    const r = await nurse.post('/api/usage/material', body(p2, [['jeringa', 10]]))
    assert.equal(r.status, 201)
    assert.equal((await admin.post(`/api/usage/material/${r.body.id}/void`, { reason: '' })).status, 400, 'el motivo es obligatorio')
    assert.equal((await recep.post(`/api/usage/material/${r.body.id}/void`, { reason: 'Registro duplicado' })).status, 403)
    const v = await admin.post(`/api/usage/material/${r.body.id}/void`, { reason: 'Registro duplicado' })
    assert.equal(v.status, 200)
    assert.ok(v.body.voidedAt)
    assert.equal(materialTotals(await material(nurse)).find((s) => s.itemId === ids.jeringa)!.quantity, 5, 'el anulado no suma')
    for (const u of [admin, recep]) {
      assert.equal((await u.get(`/api/usage/material?${win()}`)).status, 200)
      assert.equal((await u.post('/api/usage/material', body(p1, [['gasa', 1]]))).status, 403)
    }
    assert.ok(await sql.one(`SELECT 1 FROM audit WHERE action LIKE 'Registro de uso de material: anuló%Motivo: Registro duplicado'`))
  })

  test('el autor corrige en el periodo de gracia; otro no; el archivado ya no se registra pero los registros viejos lo muestran', async () => {
    const nurse = await as('crios@demo.clinara')
    const admin = await as('admin@demo.clinara')
    const r = await nurse.post('/api/usage/material', body(p1, [['n95', 1]]))
    assert.equal(r.status, 201)
    const fix = await nurse.patch(`/api/usage/material/${r.body.id}`, body(p1, [['n95', 2]]))
    assert.equal(fix.status, 200)
    assert.equal(fix.body.version, 2)
    assert.equal(fix.body.items[0].quantity, 2)
    assert.ok(await sql.one(`SELECT 1 FROM record_versions WHERE target_kind = 'material_use' AND target_id = ?`, [r.body.id]))
    assert.equal((await admin.patch(`/api/usage/material/${r.body.id}`, body(p1, [['n95', 3]]))).status, 403)
    // Pasado el periodo de gracia, ya no
    await sql.run('UPDATE material_uses SET recorded_at = ? WHERE id = ?', [ago(60), r.body.id])
    assert.equal((await nurse.patch(`/api/usage/material/${r.body.id}`, body(p1, [['n95', 3]]))).status, 409)
    // Archivar «Mascarilla N95»: no se registra más; el registro viejo la sigue mostrando
    assert.equal((await admin.post(`/api/supplies/${ids.n95}/archive`)).status, 200)
    assert.equal((await nurse.post('/api/usage/material', body(p1, [['n95', 1]]))).status, 409)
    assert.ok((await material(nurse)).some((x) => x.id === r.body.id && x.items[0].material === 'Mascarilla N95'))
    await admin.post(`/api/supplies/${ids.n95}/restore`)
  })

  test('«Por día» deja de pedir turno; «Por semana» agrupa de lunes a domingo', async () => {
    const admin = await as('admin@demo.clinara')
    const nurse = await as('crios@demo.clinara')
    const shifts = (await admin.get('/api/supplies/settings')).body.shifts
    await admin.put('/api/supplies/settings', { period: 'day', shifts })
    const d = await nurse.post('/api/usage/material', { patientId: p2, day: today, items: [{ itemId: ids.gasa, quantity: 1 }] })
    assert.equal(d.status, 201)
    assert.equal(d.body.periodKind, 'day')
    assert.equal(d.body.shiftKey, undefined)
    await admin.put('/api/supplies/settings', { period: 'week', shifts })
    const w = await nurse.post('/api/usage/material', { patientId: p2, day: today, items: [{ itemId: ids.gasa, quantity: 1 }] })
    assert.equal(w.body.periodKind, 'week')
    assert.match(w.body.periodLabel, /^Semana del \d{2}\/\d{2}\/\d{4} al \d{2}\/\d{2}\/\d{4}$/)
    assert.equal(new Date(w.body.periodStart).getUTCDay(), 1, 'empieza el lunes (00:00 en Honduras = 06:00 UTC del lunes)')
    await admin.put('/api/supplies/settings', { period: 'shift', shifts })
    assert.equal((await nurse.post('/api/usage/material', { patientId: p2, day: addDays(today, 2), items: [{ itemId: ids.gasa, quantity: 1 }] })).status, 400, 'fecha en el futuro')
  })

  test('el material no aparece en el expediente ni en la estancia (hoja de medicamentos, notas, recetas)', async () => {
    const doc = await as('lherrera@demo.clinara')
    const chart = await doc.get(`/api/patients/${p1}/chart`)
    assert.equal(chart.status, 200)
    assert.ok(!/Guante estéril|Mascarilla N95|Uso general del servicio/.test(JSON.stringify(chart.body)))
    const hosp = await sql.one(`SELECT id FROM hospitalizations WHERE status = 'active' LIMIT 1`)
    const file = await doc.get(`/api/inpatient/${hosp!.id}`)
    assert.equal(file.status, 200)
    assert.ok(!/Guante estéril|Uso general del servicio/.test(JSON.stringify(file.body)))
  })

  test('sugerencias de pacientes: solo quien registra', async () => {
    const s = await (await as('crios@demo.clinara')).get(`/api/usage/suggest?${win()}`)
    assert.equal(s.status, 200)
    assert.ok(Array.isArray(s.body))
    assert.equal((await (await as('smejia@demo.clinara')).get(`/api/usage/suggest?${win()}`)).status, 403)
  })
})

describe('RU2 (ronda 14): Consultorio', () => {
  test('la titular registra material, ve el registro y marca su lista de turno; la asistente registra', async () => {
    const ana = await as('alopez@demo.clinara')
    const cid = await clinicOf('alopez@demo.clinara')
    const pt = await sql.one('SELECT id FROM patients WHERE clinic_id = ? LIMIT 1', [cid])
    const gasa = await byLabel(cid, 'Gasa estéril', '10 × 10 cm')
    const p = currentPeriod({ period: 'shift', shifts: DEFAULT_SUPPLY_SETTINGS.shifts })
    assert.equal((await ana.post('/api/usage/material', { patientId: pt!.id, day: p.day, shiftKey: p.shiftKey, items: [{ itemId: gasa.id, quantity: 1 }] })).status, 201)
    assert.equal((await ana.get(`/api/usage/material?${win()}`)).status, 200)
    assert.equal((await ana.post(`/api/supplies/${gasa.id}/shift-list`, { on: false })).status, 200)
    const asis = await as('asistente@demo.clinara')
    // RU5 (ronda 15): al uso general del servicio, lo de «Uso general» o «Ambos» (el alcohol)
    const alcohol = await byLabel(cid, 'Alcohol al 70 %', 'Frasco')
    assert.equal((await asis.post('/api/usage/material', { general: true, day: p.day, shiftKey: p.shiftKey, items: [{ itemId: alcohol.id, quantity: 1 }] })).status, 201)
  })
})

// ---------- RU3 ----------
describe('RU3 (ronda 14): Excel e impresión del registro de uso', () => {
  const info = { title: 'Registro de uso de material', periodLabel: 'Del 30/10/2026 al 05/11/2026', areaLabel: 'Todas', by: 'Lic. Carmen Ríos', at: new Date('2026-11-05T20:00:00Z'), clinic: 'Clínica Santa Brígida' }
  const reread = async (wb: { xlsx: { writeBuffer: () => Promise<unknown> } }) => {
    const back = new ExcelJS.Workbook()
    await back.xlsx.load((await wb.xlsx.writeBuffer()) as ArrayBuffer)
    return back
  }
  const dataRows = (ws: ExcelJS.Worksheet) => { const out: ExcelJS.Row[] = []; ws.eachRow((r, n) => { if (n > 5) out.push(r) }); return out }

  test('Material: dos hojas, encabezado en negrita con fondo, fijo y con filtros; fechas de Excel y cantidades numéricas; trae todas las filas', async () => {
    // 7 días y más de 25 filas (la pantalla muestra 25 por página; el Excel, todas)
    const records: MaterialRecord[] = []
    for (let d = 0; d < 7; d++) {
      for (let p = 0; p < 5; p++) {
        const start = new Date(Date.UTC(2026, 9, 30 + d, 13)).toISOString()
        records.push({ id: `r${d}-${p}`, patientId: `p${p}`, general: false, patientName: `Paciente ${p}`, record: `EXP-0${p}`, location: 'Consulta externa', periodKind: 'shift', periodStart: start, periodEnd: start,
          periodLabel: `Mañana ${d}`, items: [{ itemId: 'g', category: 'Protección personal', material: 'Guante estéril', variant: 'No. 7.5', unit: 'par', quantity: 2 }, { itemId: 'j', category: 'Agujas y jeringas', material: 'Jeringa descartable', variant: '5 mL, aguja 21 G', unit: 'unidad', quantity: 1 }],
          recordedBy: 's-rios', recordedByName: 'Lic. Carmen Ríos', recordedAt: start, version: 1 })
      }
    }
    records.push({ ...records[0], id: 'void', voidedAt: records[0].recordedAt, items: [{ ...records[0].items[0], quantity: 50 }] })
    const wb = await reread(buildMaterialWorkbook(ExcelJS, info, records))
    assert.deepEqual(wb.worksheets.map((w) => w.name), ['Por paciente', 'Total del periodo'])
    const ws = wb.getWorksheet('Por paciente')!
    assert.match(String(ws.getCell('A1').value), /Registro de uso de material/)
    assert.equal(ws.getCell('A1').font?.bold, true)
    assert.match(String(ws.getCell('A2').value), /Periodo: Del 30\/10\/2026 al 05\/11\/2026/)
    const head = ws.getRow(5)
    assert.deepEqual((head.values as unknown[]).slice(1), ['Fecha', 'Periodo', 'Paciente', 'Expediente', 'Categoría', 'Material', 'Variante', 'Unidad', 'Cantidad', 'Registrado por'])
    assert.equal(head.getCell(1).font?.bold, true)
    assert.equal((head.getCell(1).fill as ExcelJS.FillPattern).pattern, 'solid')
    assert.equal(ws.views[0].state, 'frozen')
    assert.equal((ws.views[0] as ExcelJS.WorksheetViewFrozen).ySplit, 5)
    assert.ok(ws.autoFilter)
    assert.ok((ws.getColumn(3).width ?? 0) >= 10)
    const rows = dataRows(ws)
    assert.equal(rows.length, 70, '35 registros × 2 materiales: todas las filas, no solo una página')
    const first = rows[0]
    assert.ok(first.getCell(1).value instanceof Date)
    assert.equal(first.getCell(1).numFmt, 'dd/mm/yyyy')
    assert.equal(typeof first.getCell(9).value, 'number')
    const sumRows = rows.reduce((s, r) => s + Number(r.getCell(9).value), 0)
    const totals = dataRows(wb.getWorksheet('Total del periodo')!)
    const sumTotal = totals.reduce((s, r) => s + Number(r.getCell(5).value), 0)
    assert.equal(sumRows, sumTotal, 'la suma en Excel coincide con el «Total del periodo»')
    assert.equal(sumTotal, 35 * 3, 'el anulado no suma')
  })

  test('Medicamentos: «Aplicaciones» y «Resumen», fecha y hora como valores de Excel', async () => {
    const at = '2026-11-05T14:30:00.000Z'
    const rows: MedUse[] = [1, 2, 3].map((n) => ({ id: `m${n}`, source: 'dose', patientId: 'p1', patientName: 'Paciente 1', record: 'EXP-1', area: 'hospital', location: 'Hospitalización · Cuarto 201', at,
      medication: 'Ceftriaxona (vial 1 g) 1 g vía intravenosa', drug: 'Ceftriaxona', presentation: 'Vial 1 g', dose: '1 g', appliedBy: 'Lic. Carmen Ríos', appliedByTitle: 'Enfermería', orderedBy: 'Dra. Lucía Herrera' }))
    const wb = await reread(buildMedsWorkbook(ExcelJS, { ...info, title: 'Registro de uso de medicamentos' }, rows))
    assert.deepEqual(wb.worksheets.map((w) => w.name), ['Aplicaciones', 'Resumen'])
    const ws = wb.getWorksheet('Aplicaciones')!
    const r = ws.getRow(6)
    const date = r.getCell(1).value as Date
    assert.equal(date.toISOString().slice(0, 10), '2026-11-05')
    assert.equal(r.getCell(2).numFmt, 'hh:mm')
    assert.equal((r.getCell(2).value as Date).getUTCHours(), 8, '14:30 UTC = 08:30 en Honduras')
    const s = wb.getWorksheet('Resumen')!.getRow(6)
    assert.deepEqual([s.getCell(1).value, s.getCell(3).value, s.getCell(4).value, s.getCell(5).value], ['Ceftriaxona', 3, 3, 'g'])
  })

  test('nombres de archivo', () => {
    const shift = { kind: 'shift' as const, start: '', end: '', label: '', day: '2026-11-05', shiftKey: 'morning', shiftLabel: 'Mañana' }
    assert.equal(usageFileName('material', shift), 'Uso_material_2026-11-05_Mañana.xlsx')
    assert.equal(usageFileName('meds', shift), 'Uso_medicamentos_2026-11-05.xlsx')
    assert.equal(usageFileName('material', { ...shift, kind: 'range', shiftKey: undefined, shiftLabel: undefined, day: '2026-10-30' }, '2026-11-05'), 'Uso_material_2026-10-30_a_2026-11-05.xlsx')
  })

  test('imprimir y exportar: Enfermería, Recepción y Administración (queda en la bitácora); el médico no', async () => {
    const body = { tab: 'material', how: 'excel', period: 'Mañana 05/11/2026 (07:00–15:00)', area: 'Todas', rows: 12, file: 'Uso_material_2026-11-05_Mañana.xlsx' }
    for (const email of ['crios@demo.clinara', 'smejia@demo.clinara', 'admin@demo.clinara']) assert.equal((await (await as(email)).post('/api/usage/log', body)).status, 200, email)
    assert.equal((await (await as('crios@demo.clinara')).post('/api/usage/log', { ...body, tab: 'meds', how: 'print' })).status, 200)
    assert.equal((await (await as('lherrera@demo.clinara')).post('/api/usage/log', body)).status, 403)
    const log = await sql.query(`SELECT a.action, s.email FROM audit a JOIN staff s ON s.id = a.user_id WHERE a.action LIKE 'Exportó a Excel el registro de uso de material%' OR a.action LIKE 'Imprimió el registro de uso de medicamentos%'`)
    assert.ok(log.some((l) => l.email === 'smejia@demo.clinara' && /periodo Mañana 05\/11\/2026 \(07:00–15:00\); área Todas; 12 filas\): Uso_material_2026-11-05_Mañana\.xlsx/.test(String(l.action))))
    assert.ok(log.some((l) => /^Imprimió el registro de uso de medicamentos/.test(String(l.action))))
  })
})
