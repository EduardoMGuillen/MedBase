import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb } from './db.js'
import { createSql, type Sql } from './sql.js'

// Ronda 11: con la base y la API (copia en memoria de la demo)
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
  return { get: (p: string) => call('GET', p), post: (p: string, b?: unknown) => call('POST', p, b), put: (p: string, b: unknown) => call('PUT', p, b), patch: (p: string, b: unknown) => call('PATCH', p, b), del: (p: string) => call('DELETE', p) }
}
const mainClinic = async () => String((await sql.one(`SELECT clinic_id FROM staff WHERE email = 'admin@demo.clinara'`))!.clinic_id)

describe('CA7 (ronda 11): sin «Ver archivados» ni «Archivar» en el catálogo de exámenes', () => {
  test('en una demo nueva no queda ningún archivado; la limpieza dos veces = una', async () => {
    const { cleanArchivedCatalog } = await import('./ronda11.js')
    const id = await mainClinic()
    assert.equal((await sql.query('SELECT 1 FROM exam_catalog WHERE active = FALSE')).length, 0)
    // Los 6 paquetes que archivó la ronda 7 (CA3) ya se borraron y quedaron marcados como quitados
    const gone = (await sql.query('SELECT name FROM exam_catalog_removed WHERE clinic_id = ? ORDER BY name', [id])).map((r) => String(r.name))
    for (const n of ['Electrolitos', 'Perfil lipídico', 'Perfil renal']) assert.ok(gone.includes(n), n)
    assert.equal(await cleanArchivedCatalog(sql, id), null)
  })
  test('un archivado de antes se borra con copia, se quita de los sets y la orden antigua conserva su nombre', async () => {
    const { cleanArchivedCatalog } = await import('./ronda11.js')
    const id = await mainClinic()
    const now = new Date().toISOString()
    await sql.run(`INSERT INTO exam_catalog (id, clinic_id, grp, name, norm_key, active, created_by, created_at) VALUES ('ca7-x', ?, 'lab', 'Prueba archivada', 'prueba archivada', FALSE, NULL, ?)`, [id, now])
    await sql.run('INSERT INTO order_sets (id, clinic_id, owner_id, name, items, created_at) VALUES (?,?,?,?,?,?)',
      ['set-ca7', id, 's-herrera', 'Set CA7', JSON.stringify([{ exam: { group: 'lab', name: 'Prueba archivada' } }, { exam: { group: 'lab', name: 'Hemograma' } }]), now])
    const r = (await cleanArchivedCatalog(sql, id))!
    assert.deepEqual(r.removed, ['Prueba archivada'])
    assert.deepEqual(r.sets.map((x) => [x.name, x.removed]), [['Set CA7', ['Prueba archivada']]])
    assert.ok(await sql.one(`SELECT 1 FROM config_backups WHERE clinic_id = ? AND kind = 'ca7-archived-removed'`, [id]))
    assert.equal(await cleanArchivedCatalog(sql, id), null, 'la segunda vez no hace nada')
  })
  test('«Quitar» borra (Administración); médico y enfermería no pueden; ya no se archiva; una orden antigua conserva su nombre', async () => {
    const admin = await as('admin@demo.clinara')
    const doc = await as('lherrera@demo.clinara')
    const nurse = await as('crios@demo.clinara')
    const cat = (await admin.get('/api/exams/catalog')).body.exams
    const ex = cat.find((e: any) => e.name === 'Gota gruesa')
    assert.equal((await admin.patch(`/api/exams/catalog/${ex.id}`, { active: false })).status, 400)
    assert.equal((await doc.del(`/api/exams/catalog/${ex.id}`)).status, 403)
    assert.equal((await nurse.del(`/api/exams/catalog/${ex.id}`)).status, 403)
    const id = await mainClinic()
    const order = (await sql.one('SELECT id, name FROM exam_orders WHERE clinic_id = ? LIMIT 1', [id]))!
    await sql.run(`UPDATE exam_orders SET name = 'Gota gruesa' WHERE id = ?`, [String(order.id)])
    assert.equal((await admin.del(`/api/exams/catalog/${ex.id}`)).status, 200)
    assert.ok(!(await admin.get('/api/exams/catalog')).body.exams.some((e: any) => e.name === 'Gota gruesa'))
    assert.equal((await sql.one('SELECT name FROM exam_orders WHERE id = ?', [String(order.id)]))!.name, 'Gota gruesa')
    // Ninguna carga lo vuelve a poner
    const { loadRonda7 } = await import('./catalogLoader.js')
    await loadRonda7(sql, id)
    assert.ok(!(await sql.one(`SELECT 1 FROM exam_catalog WHERE clinic_id = ? AND norm_key = 'gota gruesa'`, [id])))
    await sql.run('UPDATE exam_orders SET name = ? WHERE id = ?', [String(order.name), String(order.id)])
  })
})
