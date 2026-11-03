import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb } from './db.js'
import { createSql, type Sql } from './sql.js'
import { loadLnme } from './lnmeLoader.js'
import { buildLnme, LNME_ORIGIN } from '../src/lib/lnme/build.js'
import { LNME_BASE, LNME_ITEMS } from '../src/lib/lnme/generated.js'
import { formRoute } from '../src/lib/lnme/route.js'
import { DRUGS } from '../src/lib/catalogs.js'
import { ROUTES } from '../src/lib/format.js'
import { lnmeRoute, localDrugProvider, searchDrugs } from '../src/lib/drugProvider.js'
import type { ClinicDrug } from '../src/lib/types.js'

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
  return { get: (p: string) => call('GET', p), post: (p: string, b?: unknown) => call('POST', p, b), patch: (p: string, b: unknown) => call('PATCH', p, b) }
}

/** ME6 (ronda 10): la carga crea las 530 filas, también las que son del catálogo base (antes 509: ver ronda10.test.ts). */
const EXPECTED_CREATED = LNME_ITEMS.length
void LNME_BASE
const countLnme = async (clinicId: string) => Number((await sql.one(`SELECT count(DISTINCT lnme_no) AS n FROM clinic_drugs WHERE clinic_id = ? AND lnme_no IS NOT NULL`, [clinicId]))!.n)
const snapshot = async (clinicId: string) => JSON.stringify(await sql.query('SELECT * FROM clinic_drugs WHERE clinic_id = ? ORDER BY id', [clinicId]))
const catalogOf = (drugs: ClinicDrug[]) => localDrugProvider.catalog(drugs)

describe('ME5: el archivo del LNME', () => {
  test('530 filas únicas de 6 columnas; sin anotaciones en el nombre ni en la presentación', () => {
    const out = buildLnme(readFileSync('data/presentaciones_medicamentos_lnme.md', 'utf8'), DRUGS, {})
    assert.deepEqual(out.problems, [])
    assert.equal(out.items.length, 530)
    assert.equal(new Set(out.items.map((i) => i.no)).size, 530)
    assert.equal(LNME_ITEMS.length, 530, 'el generado está al día con el .md (npm run me5:build)')
    for (const i of LNME_ITEMS) {
      assert.doesNotMatch(`${i.name} ${i.presentation} ${i.presentationFull}`, /\*|✔|⚠|Lista compl|uso exclusivo/u, `#${i.no}`)
      assert.ok(i.group && i.routes !== undefined && i.form !== undefined && i.package !== undefined)
    }
    const dexa = LNME_ITEMS.find((i) => i.no === 35)!
    assert.equal(dexa.name, 'Dexametasona')
    assert.equal(dexa.restriction, 'uso exclusivo oncología')
    const levo = LNME_ITEMS.find((i) => i.no === 120)!
    assert.equal(levo.complementary, true)
    assert.equal(levo.restriction, 'solo TB-MDR')
    assert.equal(LNME_ITEMS.filter((i) => i.certainty === 'unconfirmed').length, 10)
    assert.equal(LNME_ITEMS.find((i) => i.no === 6)!.group, '1. Anestésicos')
    assert.equal(LNME_ITEMS.find((i) => i.no === 6)!.subgroup, '1.3 Anestésicos locales')
    // «(también …)» con el patrón exacto se divide; si no, queda entero
    const drops = LNME_ITEMS.find((i) => i.no === 24)!
    assert.equal(drops.presentation, 'Frasco gotero 15 ml (100 mg/ml)')
    assert.deepEqual(drops.alternatives, ['30 ml'])
    assert.equal(drops.presentationFull, 'Frasco gotero 15 ml (100 mg/ml) (también 30 ml)')
    const succ = LNME_ITEMS.find((i) => i.no === 470)!
    assert.deepEqual(succ.alternatives, [])
    assert.equal(succ.presentation, succ.presentationFull)
  })

  test('vía: una sola equivalente se precarga; varias o sin equivalente, no; nebulizar → Nebulización', () => {
    assert.equal(formRoute('IV'), 'Intravenosa')
    assert.equal(formRoute('IM'), 'Intramuscular')
    assert.equal(formRoute('SC'), 'Subcutánea')
    assert.equal(formRoute('Oral'), 'Oral')
    assert.equal(formRoute('IV, IM'), undefined)
    assert.equal(formRoute('Epidural, infiltración'), undefined)
    assert.equal(formRoute('Inhalación oral', 'Salbutamol inhalador', 'Aerosol para inhalación'), 'Inhalada')
    const neb = (ROUTES as readonly string[]).includes('Nebulización') ? 'Nebulización' : undefined
    assert.equal(formRoute('Inhalación oral', 'Salbutamol solución para nebulizar', 'Solución para inhalación'), neb)
    assert.equal(formRoute('Inhalación oral', 'Ipratropio solución para nebulizar', 'Solución para inhalación'), neb)
  })
})

describe('ME5: carga en la base de cada clínica', () => {
  test('cada clínica y consultorio tiene el listado; la segunda corrida no cambia nada', async () => {
    for (const c of await sql.query('SELECT id FROM clinics')) assert.equal(await countLnme(String(c.id)), EXPECTED_CREATED, String(c.id))
    const before = await snapshot('c-sb')
    const audits = Number((await sql.one('SELECT count(*) AS n FROM audit'))!.n)
    const rep = await loadLnme(sql, 'c-sb')
    assert.equal(rep.created, 0)
    assert.equal(rep.updated, 0)
    assert.equal(rep.matched.length, 0)
    assert.equal(rep.kept, EXPECTED_CREATED)
    assert.equal(await snapshot('c-sb'), before)
    assert.equal(Number((await sql.one('SELECT count(*) AS n FROM audit'))!.n), audits, 'sin cambios no se escribe en la bitácora')
    const row = (await sql.one(`SELECT * FROM clinic_drugs WHERE clinic_id = 'c-sb' AND lnme_no = 168`))!
    assert.equal(row.origin, 'lnme')
    assert.equal(row.origin_label, LNME_ORIGIN)
    assert.equal(row.created_by, null)
  })

  test('una clínica y un consultorio nuevos nacen con el listado', async () => {
    const sa = await as('superadmin@demo.clinara')
    const clinic = await sa.post('/api/platform/clinics', { kind: 'clinic', name: 'Clínica ME5', admin: { name: 'Admin ME5', email: 'admin-me5@test.hn' } })
    assert.equal(clinic.status, 201, JSON.stringify(clinic.body))
    assert.equal(await countLnme(clinic.body.clinic.id), EXPECTED_CREATED)
    const office = await sa.post('/api/platform/clinics', { kind: 'office', name: 'Consultorio ME5', owner: { name: 'Dra. Me Cinco', email: 'me5@test.hn', license: 'CMH-555' } })
    assert.equal(office.status, 201, JSON.stringify(office.body))
    assert.equal(await countLnme(office.body.clinic.id), EXPECTED_CREATED)
    // La titular lo ve en su vademécum
    const doc = await as('me5@test.hn', office.body.password)
    const boot = (await doc.get('/api/bootstrap')).body
    assert.equal(boot.clinicDrugs.filter((d: ClinicDrug) => d.lnme).length, EXPECTED_CREATED)
  })

  test('lo que la clínica ya tenía conserva sus datos y gana la etiqueta; con duda no se une', async () => {
    const id = `c-me5-${randomUUID().slice(0, 8)}`
    await sql.run(`INSERT INTO clinics (id, slug, name, address, phone, email, currency, rx_validity_days, reminder_template, active, created_at, kind) VALUES (?,?,?,?,?,?,?,?,?,TRUE,?,?)`,
      [id, id, 'Clínica con vademécum propio', '', '', '', 'HNL', 30, 'Recordatorio', new Date().toISOString(), 'clinic'])
    const add = (name: string, presentation: string, extra: Record<string, string> = {}) => sql.run(
      `INSERT INTO clinic_drugs (id, clinic_id, name, brand, presentation, route, usual_dose, norm_key, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [randomUUID(), id, name, extra.brand ?? null, presentation, extra.route ?? null, extra.dose ?? null, `${name}|${presentation}`.toLowerCase(), 's-herrera', '2026-01-01T00:00:00Z'])
    await add('Aciclovir', 'Tableta 400 mg', { brand: 'Zovirax', route: 'Oral', dose: '1 tableta cada 4 horas' })
    await add('Paracetamol', 'Frasco 120 ml (120 mg/5 ml)', { route: 'Oral', dose: '5 ml' })
    await add('Ondansetrón', 'Ampolla 4 mg/2 ml')
    const rep = await loadLnme(sql, id)
    assert.deepEqual(rep.matched.map((m) => [m.no, m.kind]).sort(), [[169, 'exact'], [25, 'synonym']].sort())
    assert.ok(rep.doubts.some((d) => d.no === 403 && /Ondansetrón/.test(d.drug)), JSON.stringify(rep.doubts))
    assert.equal(rep.created, EXPECTED_CREATED - 2)
    const acic = (await sql.one(`SELECT * FROM clinic_drugs WHERE clinic_id = ? AND name = 'Aciclovir' AND presentation = 'Tableta 400 mg'`, [id]))!
    assert.equal(acic.brand, 'Zovirax')
    assert.equal(acic.usual_dose, '1 tableta cada 4 horas')
    assert.equal(acic.route, 'Oral')
    assert.equal(acic.created_by, 's-herrera')
    assert.equal(acic.origin, 'clinic')
    assert.equal(Number(acic.lnme_no), 169)
    const para = (await sql.one(`SELECT * FROM clinic_drugs WHERE clinic_id = ? AND name = 'Paracetamol'`, [id]))!
    assert.equal(para.presentation, 'Frasco 120 ml (120 mg/5 ml)')
    assert.equal(Number(para.lnme_no), 25)
    assert.ok(JSON.parse(String(para.aliases)).includes('Acetaminofén jarabe'))
    // Sin duplicados: una sola fila de Aciclovir tableta y ninguna creada para el #25
    assert.equal(Number((await sql.one(`SELECT count(*) AS n FROM clinic_drugs WHERE clinic_id = ? AND lnme_no IN (169, 25)`, [id]))!.n), 2)
    // El de la duda queda aparte, sin etiqueta, y el #403 se crea
    assert.equal((await sql.one(`SELECT lnme_no FROM clinic_drugs WHERE clinic_id = ? AND name = 'Ondansetrón'`, [id]))!.lnme_no, null)
    assert.ok(await sql.one(`SELECT 1 FROM clinic_drugs WHERE clinic_id = ? AND lnme_no = 403`, [id]))
    // Idempotente también aquí
    const again = await loadLnme(sql, id)
    assert.equal(again.created + again.matched.length + again.updated, 0)
  })
})

describe('ME5: lo que ve el médico', () => {
  test('Aciclovir: las tres presentaciones; Paracetamol y Acetaminofén encuentran el mismo, sin duplicados', async () => {
    const doc = await as('lherrera@demo.clinara')
    const drugs = catalogOf((await doc.get('/api/bootstrap')).body.clinicDrugs)
    const acic = searchDrugs(drugs, 'Aciclovir', 8)
    assert.deepEqual(acic.map((d) => d.presentation).sort(), ['Frasco 125 ml (200 mg/5 ml)', 'Tableta 400 mg', 'Vial 250 mg'])
    assert.ok(acic.every((d) => d.lnme))
    const para = searchDrugs(drugs, 'Paracetamol', 20)
    const acet = searchDrugs(drugs, 'Acetaminofén', 20)
    const keys = (l: typeof para) => l.map((d) => `${d.name}|${d.presentation}`).sort()
    assert.deepEqual(keys(para), keys(acet))
    assert.equal(para.filter((d) => d.presentation === 'Tableta 500 mg').length, 1, 'el paracetamol y el acetaminofén de 500 mg son uno')
    assert.equal(para.find((d) => d.presentation === 'Tableta 500 mg')!.name, 'Acetaminofén')
    assert.equal(para.find((d) => d.presentation === 'Tableta 500 mg')!.lnme?.no, 26, 'ME6: es la fila #26 del listado')
    // ME6: el del catálogo base ya no se ofrece aparte; su nombre es alias de la fila («Paracetamol»)
    assert.ok(drugs.some((d) => d.lnme?.no === 26 && d.aliases?.includes('Paracetamol')))
    // Epinefrina encuentra la adrenalina
    assert.ok(searchDrugs(drugs, 'epinefrina', 20).some((d) => d.name === 'Adrenalina (epinefrina)'))
  })

  test('⚠️ y Lista complementaria; la restricción es ayuda; «También: …»; la vía del listado', async () => {
    const doc = await as('lherrera@demo.clinara')
    const drugs = catalogOf((await doc.get('/api/bootstrap')).body.clinicDrugs)
    const lido = drugs.find((d) => d.lnme?.no === 9)!
    assert.equal(lido.lnme!.unconfirmed, true)
    assert.equal(drugs.find((d) => d.lnme?.no === 30)!.lnme!.complementary, true)
    // El acetaminofén IV del catálogo base es el #27 (Lista complementaria); ME6: con los datos del .md
    const iv = drugs.find((d) => d.lnme?.no === 27)!
    assert.equal(iv.name, 'Acetaminofén IV')
    assert.equal(iv.lnme?.no, 27)
    assert.equal(iv.lnme?.complementary, true)
    assert.equal(drugs.find((d) => d.lnme?.no === 35)!.lnme!.restriction, 'uso exclusivo oncología')
    const drops = drugs.find((d) => d.lnme?.no === 24)!
    assert.equal(drops.presentation, 'Frasco gotero 15 ml (100 mg/ml)')
    assert.deepEqual(drops.lnme!.alternatives, ['30 ml'])
    // Vía: IV sola → Intravenosa; «IV, IM» → se deja la que estaba; del catálogo base → la regla de siempre
    assert.equal(lnmeRoute(drugs.find((d) => d.lnme?.no === 168)!, 'Oral'), 'Intravenosa')
    assert.equal(lnmeRoute(drugs.find((d) => d.lnme?.no === 20)!, 'Oral'), 'Oral')
    // ME6: Ceftriaxona es la fila #96 (vía «IV, IM»: no se precarga una sola)
    assert.equal(lnmeRoute(drugs.find((d) => d.name === 'Ceftriaxona')!, 'Oral'), 'Oral')
    assert.equal(drugs.find((d) => d.name === 'Ceftriaxona')!.lnme?.no, 96)
    // Salbutamol e ipratropio para nebulizar se encuentran (componentes de una nebulización, ME4)
    assert.ok(searchDrugs(drugs, 'Salbutamol solución para nebulizar', 5).length)
    assert.ok(searchDrugs(drugs, 'Ipratropio solución para nebulizar', 5).length)
  })

  test('Administración archiva uno del listado: deja de salir, no se borra y la carga no lo reactiva; el médico no puede (URL)', async () => {
    const admin = await as('admin@demo.clinara')
    const doc = await as('lherrera@demo.clinara')
    const row = (await sql.one(`SELECT id FROM clinic_drugs WHERE clinic_id = 'c-sb' AND lnme_no = 22`))!
    const denied = await doc.patch(`/api/drugs/${row.id}`, { active: false })
    assert.equal(denied.status, 403)
    const r = await admin.patch(`/api/drugs/${row.id}`, { active: false })
    assert.equal(r.status, 200, JSON.stringify(r.body))
    assert.equal(r.body.active, false)
    assert.equal(r.body.origin, 'clinic')
    assert.equal(r.body.originLabel, 'Editado por la clínica')
    await loadLnme(sql, 'c-sb')
    const after = (await sql.one('SELECT * FROM clinic_drugs WHERE id = ?', [String(row.id)]))!
    assert.equal(after.active, false, 'la carga no lo reactiva')
    assert.equal(Number(after.lnme_no), 22)
    const drugs = catalogOf((await doc.get('/api/bootstrap')).body.clinicDrugs)
    assert.ok(!searchDrugs(drugs, 'Ibuprofeno', 20).some((d) => d.lnme?.no === 22))
    // Editar la presentación también la deja como de la clínica
    const other = (await sql.one(`SELECT id FROM clinic_drugs WHERE clinic_id = 'c-sb' AND lnme_no = 168`))!
    const e = await admin.patch(`/api/drugs/${other.id}`, { presentation: 'Vial 250 mg (polvo)' })
    assert.equal(e.status, 200, JSON.stringify(e.body))
    await loadLnme(sql, 'c-sb')
    assert.equal((await sql.one('SELECT presentation FROM clinic_drugs WHERE id = ?', [String(other.id)]))!.presentation, 'Vial 250 mg (polvo)')
    const audit = await sql.query(`SELECT action FROM audit WHERE action LIKE 'Archivó en el vademécum%'`)
    assert.ok(audit.some((a) => /LNME #22/.test(String(a.action))))
  })
})
