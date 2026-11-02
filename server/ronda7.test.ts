import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb } from './db.js'
import { createSql, type Sql } from './sql.js'
import { convertPackages, expandPackages, loadLabCatalog, loadRonda7, looseKey } from './catalogLoader.js'
import { EXAMS, byArea, examCatalog, subgroupOf } from '../src/lib/exams.js'
import { LAB_CATALOG, LAB_EQUIVALENCES, LAB_PROFILES, PACKAGE_REPLACEMENTS } from '../src/lib/labCatalog.js'
import { normalize } from '../src/lib/patients.js'

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
  return { get: (p: string) => call('GET', p), post: (p: string, b?: unknown) => call('POST', p, b), patch: (p: string, b?: unknown) => call('PATCH', p, b) }
}

const CLINICS = ['c-sb', 'c-al']
const PACKAGES = Object.keys(PACKAGE_REPLACEMENTS)
const labActive = (cid: string) => sql.query(`SELECT name, subgroup, base_key FROM exam_catalog WHERE clinic_id = ? AND grp = 'lab' AND active`, [cid])
const snapshot = async (cid: string) => ({
  catalog: await sql.query(`SELECT name, active, subgroup FROM exam_catalog WHERE clinic_id = ? ORDER BY norm_key`, [cid]),
  profiles: await sql.query(`SELECT name, items, note, archived_at FROM exam_profiles WHERE clinic_id = ? ORDER BY name`, [cid]),
  sets: await sql.query(`SELECT id, items FROM order_sets WHERE clinic_id = ? ORDER BY id`, [cid]),
})

describe('CA1 catálogo de exámenes individuales', () => {
  test('el Anexo A tiene 289 exámenes, sin nombres repetidos y ninguno es de la tabla de equivalencias', () => {
    assert.equal(LAB_CATALOG.length, 289)
    assert.equal(new Set(LAB_CATALOG.map((e) => looseKey(e.name))).size, 289)
    const equiv = new Set(Object.keys(LAB_EQUIVALENCES).map(looseKey))
    assert.deepEqual(LAB_CATALOG.filter((e) => equiv.has(looseKey(e.name))).map((e) => e.name), [])
  })

  for (const cid of CLINICS) {
    test(`${cid}: Laboratorio con todos los exámenes activos, sin duplicados y todos con subgrupo`, async () => {
      const rows = await labActive(cid)
      const keys = new Set(rows.map((r) => looseKey(String(r.name))))
      // Cada línea del Anexo A y de la tabla de equivalencias está en el catálogo
      const missing = [...LAB_CATALOG.map((e) => e.name), ...Object.values(LAB_EQUIVALENCES)].filter((n) => !keys.has(looseKey(n)))
      assert.deepEqual(missing, [])
      assert.equal(keys.size, rows.length, 'no hay dos exámenes con el mismo nombre normalizado')
      // 32 de la lista fija − 6 paquetes archivados + 289 nuevos
      assert.equal(rows.length, 32 - 6 + 289)
      assert.ok(rows.every((r) => subgroupOf({ name: String(r.name), subgroup: r.subgroup ? String(r.subgroup) : undefined })), 'todos con subgrupo')
      const nuevos = await sql.query(`SELECT COUNT(*)::int AS n FROM exam_catalog WHERE clinic_id = ? AND base_key IS NULL AND created_by IS NULL AND grp = 'lab'`, [cid])
      assert.equal(nuevos[0].n, 289)
    })
  }

  test('los existentes conservan nombre y cambian de subgrupo según B3', async () => {
    const sg = async (name: string) => String((await sql.one(`SELECT subgroup FROM exam_catalog WHERE clinic_id = 'c-sb' AND name = ?`, [name]))?.subgroup)
    assert.equal(await sg('TSH'), 'Hormonas › Tiroides')
    assert.equal(await sg('T4 libre'), 'Hormonas › Tiroides')
    assert.equal(await sg('Prueba de embarazo en sangre (β-hCG)'), 'Hormonas › Hormona reproductiva')
    assert.equal(await sg('Urocultivo'), 'Microbiología / Bacteriología › Cultivos')
    assert.equal(await sg('Hemograma'), 'Hematología')
    const base = await sql.query(`SELECT name FROM exam_catalog WHERE clinic_id = 'c-sb' AND base_key IS NOT NULL`)
    assert.equal(base.length, EXAMS.length, 'ningún examen de la lista fija se borró')
  })

  test('buscar hepatitis, colesterol, TGO, PCR, dengue y VPH encuentra exámenes', async () => {
    const doc = await as('lherrera@demo.clinara')
    const { exams } = (await doc.get('/api/exams/catalog')).body
    const catalog = examCatalog(exams)
    for (const q of ['hepatitis', 'colesterol', 'TGO', 'PCR', 'dengue', 'VPH']) {
      const hits = catalog.filter((e) => normalize(e.name).includes(normalize(q)))
      assert.ok(hits.length > 0, q)
    }
    assert.ok(!catalog.some((e) => PACKAGES.includes(e.name)), 'los paquetes ya no son casillas')
    for (const n of ['Colesterol total', 'Colesterol HDL', 'Colesterol LDL', 'Triglicéridos', 'Amilasa', 'Lipasa', 'Sodio (Na)', 'Potasio (K)', 'Cloruro (Cl)', 'Tiempo de protrombina (TP)', 'Tiempo de tromboplastina parcial (TPT)']) {
      assert.ok(catalog.some((e) => e.name === n), n)
    }
    // Química sanguínea queda activa (B7)
    assert.ok(catalog.some((e) => e.name === 'Química sanguínea'))
  })

  test('el árbol sigue el orden del formulario: áreas, secciones y exámenes', async () => {
    const { exams } = (await (await as('lherrera@demo.clinara')).get('/api/exams/catalog')).body
    const tree = byArea(examCatalog(exams), 'lab')
    assert.deepEqual(tree.slice(0, 5).map((a) => a.title), ['Hematología', 'Coagulación', 'Química en sangre', 'Química en orina', 'Hormonas'])
    const horm = tree.find((a) => a.title === 'Hormonas')!
    assert.deepEqual(horm.sections.map((s) => s.title), ['Hormona reproductiva', 'Tiroides', 'Endocrinas', 'Otras'])
    assert.equal(horm.items.length, 0)
    assert.equal(tree.find((a) => a.title === 'Hematología')!.items[0].name, 'Hemograma')
    assert.equal(tree.find((a) => a.title === 'Coagulación')!.items[0].name, 'Anticoagulante lúpico')
  })
})

describe('CA2 y CA3 paquetes y perfiles', () => {
  for (const cid of CLINICS) {
    test(`${cid}: 27 perfiles de la clínica, todos sus exámenes enlazados a un examen activo`, async () => {
      const rows = await sql.query(`SELECT name, items, note FROM exam_profiles WHERE clinic_id = ? AND owner_id IS NULL AND archived_at IS NULL`, [cid])
      assert.equal(rows.length, 27)
      const active = new Set((await labActive(cid)).map((r) => String(r.name)))
      const unlinked = rows.flatMap((r) => (JSON.parse(String(r.items)) as { name: string }[]).filter((i) => !active.has(i.name)).map((i) => `${r.name}: ${i.name}`))
      assert.deepEqual(unlinked, [])
      const count = (n: string) => JSON.parse(String(rows.find((r) => r.name === n)!.items)).length
      assert.equal(count('Perfil febril'), 9)
      assert.equal(count('Perfil obstétrico 2'), 22)
      assert.equal(count('Perfil lipídico'), 4)
      assert.equal(String(rows.find((r) => r.name === 'Perfil mayores de 35 años')!.note), 'PSA total: solo en pacientes masculinos')
      for (const p of LAB_PROFILES) assert.equal(count(p.name), p.items.length, p.name)
      const archived = await sql.query(`SELECT name FROM exam_catalog WHERE clinic_id = ? AND NOT active AND archived_by = 'sistema'`, [cid])
      assert.deepEqual(archived.map((r) => String(r.name)).sort(), [...PACKAGES].sort())
    })
  }

  test('correr la carga otra vez (y la carga sin marca) no cambia nada', async () => {
    for (const cid of CLINICS) {
      const before = await snapshot(cid)
      await loadRonda7(sql, cid)
      const again = await loadLabCatalog(sql, cid)
      assert.deepEqual([again.added.length, again.profilesAdded.length, again.profileExamsAdded.length], [0, 0, 0])
      const conv = await convertPackages(sql, cid)
      assert.deepEqual([conv.archived.length, conv.setsUpdated.length], [0, 0])
      assert.deepEqual(await snapshot(cid), before)
    }
  })

  test('un set con paquetes se actualiza con sus exámenes sueltos, sin duplicar, con bitácora; Química sanguínea no se toca', async () => {
    const id = randomUUID()
    const exam = (name: string) => ({ exam: { group: 'lab', name, priority: 'routine', place: 'clinic' } })
    await sql.run(`INSERT INTO order_sets (id, clinic_id, owner_id, name, items, shared, created_at, kind) VALUES (?, 'c-sb', 's-herrera', 'Set viejo de prueba', ?, FALSE, ?, 'exams')`,
      [id, JSON.stringify([exam('Hemograma'), exam('Perfil lipídico'), exam('Triglicéridos'), exam('Electrolitos'), exam('Química sanguínea')]), new Date().toISOString()])
    const orders = await sql.query(`SELECT id, name FROM exam_orders ORDER BY id`)
    const r = await convertPackages(sql, 'c-sb')
    const names = (JSON.parse(String((await sql.one(`SELECT items FROM order_sets WHERE id = ?`, [id]))!.items)) as { exam: { name: string } }[]).map((i) => i.exam.name)
    assert.deepEqual(names, ['Hemograma', 'Colesterol total', 'Colesterol HDL', 'Colesterol LDL', 'Triglicéridos', 'Sodio (Na)', 'Potasio (K)', 'Cloruro (Cl)', 'Química sanguínea'])
    assert.ok(r.setsUpdated.some((s) => s.set === 'Set viejo de prueba'))
    assert.ok(r.setsPending.some((s) => s.set === 'Set viejo de prueba' && s.pkg === 'Química sanguínea'))
    const audit = await sql.one(`SELECT action FROM audit WHERE user_id = 'sistema' AND action LIKE '%Set viejo de prueba%'`)
    assert.match(String(audit?.action), /Perfil lipídico/)
    assert.deepEqual(await sql.query(`SELECT id, name FROM exam_orders ORDER BY id`), orders, 'las órdenes no cambian')
    // Otra vez: nada
    const again = await convertPackages(sql, 'c-sb')
    assert.equal(again.setsUpdated.length, 0)
    await sql.run(`UPDATE order_sets SET archived_at = 'prueba' WHERE id = ?`, [id])
  })

  test('expandPackages no duplica lo que ya estaba', () => {
    const exam = (name: string) => ({ exam: { group: 'lab', name } })
    const r = expandPackages([exam('Perfil hepático'), exam('Tiempos de coagulación (TP, TPT, INR)')])
    assert.equal(r.items.length, 10)
    assert.deepEqual(r.replaced[1].by, [])
  })

  test('los sets iniciales de un médico ya traen los exámenes sueltos', async () => {
    const doc = await as('lherrera@demo.clinara')
    const sets = (await doc.get('/api/order-sets?kind=exams')).body as { name: string; items: { exam?: { name: string } }[] }[]
    const dm = sets.find((s) => s.name === 'Control de diabetes')!
    const names = dm.items.map((i) => i.exam?.name)
    assert.ok(names.includes('Colesterol total') && !names.includes('Perfil lipídico'))
    assert.ok(sets.every((s) => s.items.every((i) => !PACKAGES.includes(i.exam?.name ?? ''))))
  })

  test('permisos: el médico usa los perfiles pero no los edita (también por URL directa); Administración sí', async () => {
    const doc = await as('lherrera@demo.clinara')
    const { profiles } = (await doc.get('/api/exams/catalog')).body
    const clinic = profiles.filter((p: any) => !p.ownerId)
    assert.equal(clinic.length, 27)
    assert.equal((await doc.get('/api/exams/profiles/clinic')).status, 403)
    assert.equal((await doc.patch(`/api/exams/profiles/${clinic[0].id}`, { name: 'Cambio no permitido' })).status, 403)
    assert.equal((await doc.post('/api/exams/catalog', { group: 'lab', name: 'Examen no permitido' })).status, 403)
    const admin = await as('admin@demo.clinara')
    const list = (await admin.get('/api/exams/profiles/clinic')).body
    assert.equal(list.length, 27)
    assert.equal((await admin.patch(`/api/exams/profiles/${list[0].id}`, { name: list[0].name })).status, 200)
    // La titular del consultorio también, en su vista de administradora (CF6)
    const titular = await as('alopez@demo.clinara')
    assert.equal((await titular.post('/api/me/view', { role: 'admin' })).status, 200)
    const t = await as('alopez@demo.clinara')
    const own = (await t.get('/api/exams/profiles/clinic')).body
    assert.equal(own.length, 27)
    assert.equal((await t.patch(`/api/exams/profiles/${own[0].id}`, { name: own[0].name })).status, 200)
    await titular.post('/api/me/view', { role: 'doctor' })
  })
})
