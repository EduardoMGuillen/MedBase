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

describe('CA6 (ronda 11): Imagen y gabinete con estudios genéricos', () => {
  test('el texto de la orden se arma: [Estudio] [contraste] de [de qué] [proyecciones] · Lado', async () => {
    const { examLine } = await import('../src/lib/exams.js')
    const L = (e: any) => examLine({ detailed: true, ...e })
    assert.equal(L({ name: 'Rayos X', subject: 'tórax', projections: ['PA', 'Lateral'] }), 'Rayos X de tórax PA y lateral')
    assert.equal(L({ name: 'Rayos X', subject: 'rodilla', projections: ['AP', 'Lateral', 'axial de rótula'], side: 'right' }), 'Rayos X de rodilla AP, lateral y axial de rótula · Lado derecho')
    assert.equal(L({ name: 'Rayos X', subject: 'de tórax', projections: ['PA'] }), 'Rayos X de tórax PA', 'no repite «de»')
    assert.equal(L({ name: 'Ultrasonido', subject: 'tiroides' }), 'Ultrasonido de tiroides')
    assert.equal(L({ name: 'Ultrasonido', subject: 'mama', side: 'left' }), 'Ultrasonido de mama · Lado izquierdo')
    assert.equal(L({ name: 'Tomografía', subject: 'cráneo', contrast: 'Simple' }), 'Tomografía simple de cráneo')
    assert.equal(L({ name: 'Tomografía', subject: 'abdomen y pelvis', contrast: 'Contrastada' }), 'Tomografía contrastada de abdomen y pelvis')
    assert.equal(L({ name: 'Tomografía', subject: 'abdomen', contrast: 'doble contraste' }), 'Tomografía con doble contraste de abdomen')
    assert.equal(L({ name: 'Angiotomografía', subject: 'aorta' }), 'Angiotomografía de aorta')
    assert.equal(L({ name: 'Resonancia magnética', subject: 'rodilla', contrast: 'Con contraste', side: 'right' }), 'Resonancia magnética con contraste de rodilla · Lado derecho')
    assert.equal(examLine({ name: 'Perfil biofísico fetal' }), 'Perfil biofísico fetal')
    // Órdenes de antes, igual que siempre (CA5 y antes de CA5)
    assert.equal(examLine({ name: 'Rayos X de rodilla', projections: ['AP', 'Lateral'], side: 'right', detailed: true }), 'Rayos X de rodilla AP y lateral · Lado derecho')
    assert.equal(examLine({ name: 'Radiografía de tórax' }), 'Radiografía de tórax')
  })
  test('qué pide cada estudio y qué falta; «¿De qué?» es texto libre; botones o escrito', async () => {
    const { EXAMS, missingDetail, contrastOptions, hasDetails } = await import('../src/lib/exams.js')
    const d = (name: string) => EXAMS.find((e) => e.name === name)?.details
    assert.equal(missingDetail({}, d('Rayos X')), 'Falta escribir de qué')
    assert.equal(missingDetail({ subject: 'cualquier cosa que escriba' }, d('Rayos X')), 'Falta la proyección')
    assert.equal(missingDetail({ subject: 'rodilla', projections: ['Towne'] }, d('Rayos X')), undefined, 'una proyección escrita basta; el lado es opcional')
    assert.equal(missingDetail({ subject: 'abdomen' }, d('Tomografía')), 'Falta el contraste')
    assert.equal(missingDetail({ subject: 'abdomen', contrast: 'triple contraste' }, d('Tomografía')), undefined)
    assert.equal(missingDetail({ subject: 'aorta' }, d('Angiotomografía')), undefined, 'sin contraste')
    assert.equal(missingDetail({}, d('Ultrasonido')), 'Falta escribir de qué')
    assert.equal(missingDetail({ subject: 'rodilla' }, d('Resonancia magnética')), 'Falta el contraste')
    assert.deepEqual(contrastOptions(d('Tomografía')), ['Simple', 'Contrastada'])
    assert.deepEqual(contrastOptions(d('Resonancia magnética')), ['Simple', 'Con contraste'])
    for (const n of ['Perfil biofísico fetal', 'Colangiorresonancia', 'Angiorresonancia magnética cerebral', 'Ultrasonido FAST (trauma)']) assert.ok(!hasDetails(d(n)), n)
  })
  test('búsqueda: «rx torax», «tac», «angiotac», «usg», «rmn», «placa» llevan a los genéricos', async () => {
    const { EXAMS, examMatches } = await import('../src/lib/exams.js')
    const find = (q: string) => EXAMS.filter((e) => examMatches(e.name, q, !!e.details?.what)).map((e) => e.name)
    assert.ok(find('rx torax').includes('Rayos X'))
    assert.ok(find('placa').includes('Rayos X'))
    assert.ok(find('tac').includes('Tomografía'))
    assert.ok(find('angiotac').includes('Angiotomografía'))
    assert.ok(find('usg').includes('Ultrasonido'))
    assert.ok(find('rmn').includes('Resonancia magnética'))
    assert.ok(!find('rx torax').includes('Tomografía'))
  })
  test('cada clínica y consultorio: Rayos X 1, Ultrasonido 5, Tomografía 2, Resonancia 3; nada de lo borrado ni archivado', async () => {
    const { IMAGING_REMOVED_CA6 } = await import('../src/lib/imagingCatalog.js')
    const { examKey } = await import('../src/lib/exams.js')
    for (const c of await sql.query('SELECT id FROM clinics')) {
      const rows = await sql.query(`SELECT name, subgroup FROM exam_catalog WHERE clinic_id = ? AND grp = 'imaging'`, [String(c.id)])
      const count = (sg: string) => rows.filter((r) => r.subgroup === sg).length
      assert.deepEqual([count('Rayos X'), count('Ultrasonido'), count('Tomografía'), count('Resonancia'), count('Ultrasonido Doppler'), count('Estudios contrastados')], [1, 5, 2, 3, 9, 8], String(c.id))
      for (const n of IMAGING_REMOVED_CA6) assert.ok(!rows.some((r) => examKey(String(r.name)) === examKey(n)), `${c.id}: ${n}`)
      assert.ok(rows.some((r) => r.name === 'Angiorresonancia magnética cerebral'))
    }
  })
  test('la carga sobre una base con CA5: borra con copia, renombra, crea los genéricos, quita de los sets; órdenes intactas; dos veces = una', async () => {
    const { loadImagingCa6 } = await import('./ronda11.js')
    const id = await mainClinic()
    const now = new Date().toISOString()
    // Como quedó tras la ronda 10: estudios por región y la angiorresonancia con su nombre de antes, sin los genéricos
    await sql.run(`DELETE FROM exam_catalog WHERE clinic_id = ? AND name IN ('Rayos X', 'Tomografía', 'Angiotomografía', 'Resonancia magnética', 'Ultrasonido', 'Angiorresonancia magnética cerebral')`, [id])
    for (const [name, sg] of [['Rayos X de tórax', 'Rayos X'], ['Tomografía de cráneo', 'Tomografía'], ['Ultrasonido de tiroides', 'Ultrasonido'], ['Angiorresonancia cerebral', 'Resonancia']]) {
      const key = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      await sql.run('INSERT INTO exam_catalog (id, clinic_id, grp, name, norm_key, base_key, subgroup, active, created_by, created_at) VALUES (?,?,?,?,?,?,?,TRUE,NULL,?)', [`ca6-${key}`, id, 'imaging', name, key, key, sg, now])
    }
    await sql.run('INSERT INTO order_sets (id, clinic_id, owner_id, name, items, created_at) VALUES (?,?,?,?,?,?)',
      ['set-ca6', id, 's-herrera', 'Mi set CA6', JSON.stringify([{ exam: { group: 'imaging', name: 'Rayos X de tórax', projections: ['PA'] } }, { exam: { group: 'lab', name: 'Hemograma' } }]), now])
    const ex = (await sql.one(`SELECT id, name, projections, side, detailed FROM exam_orders WHERE clinic_id = ? LIMIT 1`, [id]))!
    await sql.run(`UPDATE exam_orders SET name = 'Rayos X de rodilla', projections = '["AP","Lateral"]', side = 'right', detailed = TRUE WHERE id = ?`, [String(ex.id)])
    await sql.run('DELETE FROM meta WHERE key = ?', [`ca6:${id}`])
    const r = (await loadImagingCa6(sql, id))!
    assert.deepEqual([...r.deleted].sort(), ['Rayos X de tórax', 'Tomografía de cráneo', 'Ultrasonido de tiroides'])
    assert.deepEqual(r.renamed, ['Angiorresonancia cerebral → Angiorresonancia magnética cerebral'])
    for (const n of ['Rayos X', 'Ultrasonido', 'Tomografía', 'Angiotomografía', 'Resonancia magnética']) assert.ok(r.created.includes(n), n)
    assert.deepEqual(r.sets.map((x) => [x.name, x.owner, x.removed]), [['Mi set CA6', 'Dra. Lucía Herrera', ['Rayos X de tórax']]])
    assert.ok(await sql.one(`SELECT 1 FROM config_backups WHERE clinic_id = ? AND kind = 'ca6-imaging-removed'`, [id]))
    assert.ok(await sql.one(`SELECT 1 FROM exam_catalog_removed WHERE clinic_id = ? AND name = 'Rayos X de tórax'`, [id]))
    const { examLine } = await import('../src/lib/exams.js')
    const { toExamOrder } = await import('./routes/exams.js')
    assert.equal(examLine(toExamOrder((await sql.one('SELECT * FROM exam_orders WHERE id = ?', [String(ex.id)]))!)), 'Rayos X de rodilla AP y lateral · Lado derecho')
    assert.equal(await loadImagingCa6(sql, id), null, 'la segunda vez no hace nada')
    await sql.run('UPDATE exam_orders SET name = ?, projections = ?, side = ?, detailed = ? WHERE id = ?', [String(ex.name), ex.projections ?? null, ex.side ?? null, Boolean(ex.detailed), String(ex.id)])
  })
  test('al ordenar: el servidor exige de qué y proyección; guarda lo escrito; un set guarda los campos; el Rayos X realizado queda terminado', async () => {
    const doc = await as('lherrera@demo.clinara')
    const nurse = await as('crios@demo.clinara')
    const stay = String((await sql.one(`SELECT id FROM hospitalizations WHERE status = 'active' AND clinic_id = ? ORDER BY admitted_at LIMIT 1`, [await mainClinic()]))!.id)
    const noWhat = await doc.post(`/api/inpatient/${stay}/notes`, { kind: 'evolution', format: 'dx', observations: 'CA6', exams: [{ group: 'imaging', name: 'Rayos X', projections: ['PA'], priority: 'routine', place: 'clinic' }] })
    assert.equal(noWhat.status, 400)
    assert.match(String(noWhat.body.error), /falta escribir de qué/)
    const ok = await doc.post(`/api/inpatient/${stay}/notes`, { kind: 'evolution', format: 'dx', observations: 'CA6', exams: [
      { group: 'imaging', name: 'Rayos X', subject: 'tórax', projections: ['PA', 'Lateral'], priority: 'routine', place: 'clinic' },
      { group: 'imaging', name: 'Rayos X', subject: 'rodilla', projections: ['AP', 'Lateral'], side: 'right', priority: 'routine', place: 'clinic' }] })
    assert.equal(ok.status, 201, JSON.stringify(ok.body))
    const { examLine } = await import('../src/lib/exams.js')
    const list = (await doc.get(`/api/inpatient/${stay}`)).body.exams.filter((e: any) => e.noteId === ok.body.id)
    assert.deepEqual(list.map(examLine).sort(), ['Rayos X de rodilla AP y lateral · Lado derecho', 'Rayos X de tórax PA y lateral'])
    const set = await doc.post('/api/order-sets', { name: 'Tórax de control', kind: 'exams', items: [{ exam: { group: 'imaging', name: 'Rayos X', subject: 'tórax', projections: ['PA'], priority: 'routine', place: 'clinic', detailed: true } }] })
    assert.equal(set.status, 201, JSON.stringify(set.body))
    assert.equal(set.body.items[0].exam.subject, 'tórax')
    assert.equal((await nurse.post(`/api/exams/${list[0].id}/status`, { status: 'done' })).status, 200)
    assert.ok(!(await nurse.get('/api/exams/tray')).body.some((e: any) => e.id === list[0].id), 'EX3: realizado = terminado')
  })
})

describe('ME11 (ronda 11): agregar al vademécum desde el aviso', () => {
  test('el médico agrega (queda en la bitácora); en Clínica no edita ni archiva (también por URL); Administración sí; en Consultorio la titular sí', async () => {
    const doc = await as('lherrera@demo.clinara')
    const admin = await as('admin@demo.clinara')
    const add = await doc.post('/api/drugs', { name: 'Medicamento de prueba ME11', presentation: '0.5 mg/2 ml', route: 'Nebulización' })
    assert.equal(add.status, 201, JSON.stringify(add.body))
    assert.ok(await sql.one(`SELECT 1 FROM audit WHERE action LIKE 'Agregó al vademécum de la clínica: Medicamento de prueba ME11%' AND user_id = 's-herrera'`))
    assert.equal((await doc.patch(`/api/drugs/${add.body.id}`, { active: false })).status, 403)
    assert.equal((await doc.patch(`/api/drugs/${add.body.id}`, { name: 'Otro nombre' })).status, 403)
    assert.equal((await admin.patch(`/api/drugs/${add.body.id}`, { active: false })).status, 200)
    const office = await as('alopez@demo.clinara')
    const own = await office.post('/api/drugs', { name: 'Medicamento de consultorio ME11' })
    assert.equal(own.status, 201)
    assert.equal((await office.patch(`/api/drugs/${own.body.id}`, { brand: 'Marca' })).status, 200)
  })
})

describe('ME12 (ronda 11): «Generar receta» con cualquier medicamento activo y días', () => {
  test('el médico elige uno no marcado, pone días y cantidad: sale con sus datos; la orden no cambia; queda registrada; enfermería solo los marcados', async () => {
    const doc = await as('lherrera@demo.clinara')
    const nurse = await as('crios@demo.clinara')
    const rec = await as('smejia@demo.clinara')
    const id = await mainClinic()
    const med = (await sql.one(`SELECT * FROM hosp_meds WHERE clinic_id = ? AND stopped_at IS NULL AND buy_outside = FALSE AND hospitalization_id IN (SELECT id FROM hospitalizations WHERE status = 'active') LIMIT 1`, [id]))!
    const body = { kind: 'rx', chosen: true, medIds: [String(med.id)], extras: { [String(med.id)]: { days: 3, quantity: '9 tabletas' } } }
    assert.equal((await nurse.post('/api/print-jobs', body)).status, 403, 'enfermería no elige ni pone días')
    assert.equal((await nurse.post('/api/print-jobs', { kind: 'rx', medIds: [String(med.id)] })).status, 400, 'enfermería: solo lo marcado')
    assert.equal((await rec.post('/api/print-jobs', body)).status, 403)
    const job = await doc.post('/api/print-jobs', body)
    assert.equal(job.status, 201, JSON.stringify(job.body))
    const got = (await doc.get(`/api/print-jobs/${job.body.id}`)).body
    assert.equal(got.doctors.length, 1)
    assert.equal(got.doctors[0].doctor.id, 's-herrera')
    assert.deepEqual(got.extras[String(med.id)], { days: 3, quantity: '9 tabletas' })
    assert.equal((await doc.post(`/api/print-jobs/${job.body.id}/printed`, { how: 'pdf' })).status, 200)
    assert.ok(await sql.one(`SELECT 1 FROM print_log WHERE target_kind = 'hosp_med' AND target_id = ?`, [String(med.id)]), 'cuenta para GE4')
    const after = (await sql.one('SELECT days, buy_quantity FROM hosp_meds WHERE id = ?', [String(med.id)]))!
    assert.equal(after.days ?? null, med.days ?? null, 'la orden no cambia')
    // Recetas emitidas: la ve y la reimprime enfermería
    const pid = String((await sql.one('SELECT patient_id FROM hospitalizations WHERE id = ?', [String(med.hospitalization_id)]))!.patient_id)
    const list = (await nurse.get(`/api/patients/${pid}/print-jobs`)).body
    const r = list.find((x: any) => x.id === job.body.id)
    assert.deepEqual(r.doctorIds, ['s-herrera'])
    assert.equal(r.meds[0].days, 3)
    assert.equal((await nurse.get(`/api/print-jobs/${job.body.id}`)).status, 200)
    assert.equal((await nurse.post(`/api/print-jobs/${job.body.id}/printed`, { how: 'print' })).status, 200)
    assert.equal((await rec.get(`/api/print-jobs/${job.body.id}`)).status, 403)
  })
})

describe('EX6 (ronda 11): «Ver PDF» e «Imprimir» en los resultados', () => {
  test('un resultado se imprime en PDF; queda registrado; ya no se corrige (GE4); recepción no; sin resultado no', async () => {
    const doc = await as('lherrera@demo.clinara')
    const nurse = await as('crios@demo.clinara')
    const rec = await as('smejia@demo.clinara')
    const stay = String((await sql.one(`SELECT id FROM hospitalizations WHERE status = 'active' AND clinic_id = ? ORDER BY admitted_at LIMIT 1`, [await mainClinic()]))!.id)
    const n = await doc.post(`/api/inpatient/${stay}/notes`, { kind: 'evolution', format: 'dx', observations: 'EX6', exams: [{ group: 'lab', name: 'Electrolitos', priority: 'routine', place: 'clinic' }] })
    assert.equal(n.status, 201)
    const ex = (await doc.get(`/api/inpatient/${stay}`)).body.exams.find((e: any) => e.noteId === n.body.id)
    assert.equal((await nurse.post('/api/print-jobs', { kind: 'results', examIds: [ex.id] })).status, 409, 'sin resultado')
    await nurse.post(`/api/exams/${ex.id}/status`, { status: 'sample' })
    const resp = (await nurse.get('/api/dept/responsible')).body
    const body: any = { values: [{ analyte: 'Sodio', value: '140' }] }
    if (resp.needsChoice) {
      assert.equal((await nurse.post(`/api/exams/${ex.id}/result`, body)).status, 400, 'sin microbiólogo de turno se elige')
      body.responsibleId = 's-ordonez'
    }
    assert.equal((await nurse.post(`/api/exams/${ex.id}/result`, body)).status, 200)
    assert.equal((await rec.post('/api/print-jobs', { kind: 'results', examIds: [ex.id] })).status, 403)
    const job = await nurse.post('/api/print-jobs', { kind: 'results', examIds: [ex.id] })
    assert.equal(job.status, 201)
    assert.equal((await rec.get(`/api/print-jobs/${job.body.id}`)).status, 403, 'también por URL directa')
    const got = (await doc.get(`/api/print-jobs/${job.body.id}`)).body
    assert.equal(got.kind, 'results')
    assert.equal(got.exams[0].result.values[0].analyte, 'Sodio')
    assert.equal((await doc.post(`/api/print-jobs/${job.body.id}/printed`, { how: 'view' })).status, 200)
    assert.ok(await sql.one(`SELECT 1 FROM print_log WHERE target_kind = 'exam_result' AND target_id = ? AND how = 'view' AND by_id = 's-herrera'`, [ex.id]))
    assert.ok(await sql.one(`SELECT 1 FROM audit WHERE action LIKE 'Vio en PDF el resultado de Electrolitos%' AND user_id = 's-herrera'`))
    const fix = await nurse.post(`/api/exams/${ex.id}/result`, { values: [{ analyte: 'Sodio', value: '141' }], correct: true, version: 1 })
    assert.equal(fix.status, 409)
    assert.match(String(fix.body.error), /Ya se imprimió/)
  })
})

describe('DP (ronda 11): departamentos de Laboratorio clínico e Imágenes', () => {
  const stayOf = async (kind = 'hospital') => String((await sql.one(`SELECT id FROM hospitalizations WHERE status = 'active' AND clinic_id = ? AND kind = ? ORDER BY admitted_at LIMIT 1`, [await mainClinic(), kind]))!.id)
  test('DM2 y DP1: los cuatro usuarios con su rol y cargo; cada uno entra y ve su menú (permisos); los demás demos siguen', async () => {
    for (const [email, role, position] of [['gordonez@demo.clinara', 'lab', 'microbiologist'], ['krivera@demo.clinara', 'lab', 'lab_tech'], ['mcastellanos@demo.clinara', 'imaging', 'radiologist'], ['pandino@demo.clinara', 'imaging', 'imaging_tech']]) {
      const me = (await (await as(email)).get('/api/auth/me')).body
      assert.equal(me.user.role, role, email)
      assert.equal(me.user.position, position, email)
      assert.ok(me.permissions.includes('dept.work'))
      assert.equal(me.permissions.includes('dept.config'), position === 'microbiologist' || position === 'radiologist', email)
      assert.equal(me.permissions.includes('chart.view'), position === 'radiologist', email)
    }
    for (const email of ['admin@demo.clinara', 'smejia@demo.clinara', 'crios@demo.clinara', 'lherrera@demo.clinara', 'alopez@demo.clinara']) assert.equal((await (await as(email)).get('/api/auth/me')).status, 200)
  })
  test('DP1: el cargo es obligatorio y la colegiación del microbiólogo también; el cambio de cargo queda en la bitácora', async () => {
    const admin = await as('admin@demo.clinara')
    assert.equal((await admin.post('/api/staff', { name: 'Persona Lab', role: 'lab', email: 'plab@ejemplo.hn' })).status, 400)
    assert.equal((await admin.post('/api/staff', { name: 'Persona Lab', role: 'lab', email: 'plab@ejemplo.hn', position: 'microbiologist' })).status, 400)
    assert.equal((await admin.post('/api/staff', { name: 'Persona Lab', role: 'lab', email: 'plab@ejemplo.hn', position: 'radiologist', license: 'X' })).status, 400, 'cargo de otro departamento')
    const ok = await admin.post('/api/staff', { name: 'Persona Lab', role: 'lab', email: 'plab@ejemplo.hn', position: 'lab_tech' })
    assert.equal(ok.status, 201, JSON.stringify(ok.body))
    const ch = await admin.patch(`/api/staff/${ok.body.user.id}`, { roles: ['lab'], position: 'microbiologist', license: 'DEMO-0099' })
    assert.equal(ch.status, 200, JSON.stringify(ch.body))
    assert.ok(await sql.one(`SELECT 1 FROM audit WHERE action LIKE 'Cambió el cargo (Técnico(a) de laboratorio → Microbiólogo(a)) de Persona Lab%'`))
  })
  test('DP2: en la bandeja lo «En la clínica» de su tipo (no lo externo); la muestra la toma el primero; el otro ve quién', async () => {
    const doc = await as('lherrera@demo.clinara')
    const tech = await as('krivera@demo.clinara')
    const nurse = await as('crios@demo.clinara')
    const img = await as('pandino@demo.clinara')
    const stay = await stayOf()
    const n = await doc.post(`/api/inpatient/${stay}/notes`, { kind: 'evolution', format: 'dx', observations: 'DP2', exams: [
      { group: 'lab', name: 'Hemograma', priority: 'routine', place: 'clinic', indication: 'Fiebre' },
      { group: 'lab', name: 'TSH', priority: 'routine', place: 'external' },
      { group: 'imaging', name: 'Rayos X', subject: 'tórax', projections: ['PA', 'Lateral'], priority: 'urgent', place: 'clinic' },
      { group: 'imaging', name: 'Tomografía', subject: 'abdomen y pelvis', contrast: 'Contrastada', priority: 'routine', place: 'clinic' }] })
    assert.equal(n.status, 201)
    const labTray = (await tech.get('/api/dept/tray')).body
    const mine = labTray.items.filter((e: any) => e.noteId === n.body.id)
    assert.deepEqual(mine.map((e: any) => e.name), ['Hemograma'], 'lo externo no entra; imagen tampoco')
    assert.match(mine[0].locationText, /^Hospitalización/)
    assert.equal(mine[0].indication, 'Fiebre')
    assert.equal((await tech.get('/api/dept/tray?group=imaging')).status, 403, 'la bandeja de imágenes no')
    const hemo = mine[0]
    assert.equal((await nurse.post(`/api/exams/${hemo.id}/status`, { status: 'sample' })).status, 200, 'enfermería la toma')
    const second = await tech.post(`/api/exams/${hemo.id}/status`, { status: 'sample' })
    assert.equal(second.status, 409)
    assert.match(String(second.body.error), /Muestra tomada por Lic\. Carmen Ríos \d\d:\d\d/)
    // Imágenes: el Rayos X realizado queda terminado (EX3); la tomografía pasa a «Por informar»; el técnico no informa
    const it = (await img.get('/api/dept/tray')).body.items.filter((e: any) => e.noteId === n.body.id)
    const rx = it.find((e: any) => e.name === 'Rayos X'), ct = it.find((e: any) => e.name === 'Tomografía')
    assert.equal((await img.post(`/api/exams/${rx.id}/status`, { status: 'done' })).status, 200)
    assert.equal((await img.post(`/api/exams/${ct.id}/status`, { status: 'done' })).status, 200)
    assert.equal((await img.post(`/api/exams/${ct.id}/result`, { report: 'Informe' })).status, 403, 'el informe es del radiólogo')
    const rad = await as('mcastellanos@demo.clinara')
    assert.equal((await rad.post(`/api/exams/${ct.id}/result`, { report: 'Sin alteraciones agudas.' })).status, 200)
    assert.equal((await rad.post(`/api/exams/${hemo.id}/result`, { values: [{ analyte: 'Hemoglobina', value: '12' }] })).status, 403, 'el laboratorio es de laboratorio')
  })
  test('DP2: nadie del departamento cancela; «No se realizó» avisa al médico y sigue pendiente; «Reintentar» lo devuelve', async () => {
    const doc = await as('lherrera@demo.clinara')
    const tech = await as('krivera@demo.clinara')
    const stay = await stayOf()
    const n = await doc.post(`/api/inpatient/${stay}/notes`, { kind: 'evolution', format: 'dx', observations: 'DP2b', exams: [{ group: 'lab', name: 'Perfil lipídico', priority: 'routine', place: 'clinic' }] })
    const ex = (await doc.get(`/api/inpatient/${stay}`)).body.exams.find((e: any) => e.noteId === n.body.id)
    assert.equal((await tech.post(`/api/exams/${ex.id}/cancel`, { reason: 'No hay reactivo' })).status, 403)
    assert.equal((await tech.post(`/api/exams/${ex.id}/not-done`, { reason: 'No hay reactivo' })).status, 200)
    const news = (await doc.get('/api/exams/new-results')).body
    assert.ok(news.some((e: any) => e.id === ex.id && e.notDone?.reason === 'No hay reactivo'), 'el médico recibe el aviso')
    const tray = (await tech.get('/api/dept/tray')).body.items.find((e: any) => e.id === ex.id)
    assert.equal(tray.status, 'ordered', 'sigue pendiente')
    assert.equal((await tech.post(`/api/exams/${ex.id}/retry`)).status, 200)
    assert.equal((await tech.get('/api/dept/tray')).body.items.find((e: any) => e.id === ex.id).notDone, undefined)
    assert.equal((await doc.post(`/api/exams/${ex.id}/cancel`, { reason: 'Ya no hace falta' })).status, 200, 'el médico sí cancela')
  })
  test('DP3: ambulatorio con solicitante y foto de la orden; entra a la bandeja y queda en el expediente; recepción también; enfermería no', async () => {
    const tech = await as('krivera@demo.clinara')
    const rec = await as('smejia@demo.clinara')
    const nurse = await as('crios@demo.clinara')
    const p = (await tech.post('/api/patients', { firstName: 'Ambulatorio', lastName: 'De Prueba', birthDate: '1990-05-01', sex: 'F', phone: '9999-0000' }))
    assert.equal(p.status, 201, JSON.stringify(p.body))
    const file = await tech.post(`/api/patients/${p.body.id}/attachments`, { name: 'orden.png', mime: 'image/png', category: 'lab', data: Buffer.from('x').toString('base64') })
    assert.equal(file.status, 201, JSON.stringify(file.body))
    const r = await tech.post('/api/dept/ambulatory', { patientId: p.body.id, group: 'lab', exams: [{ group: 'lab', name: 'Perfil lipídico', priority: 'routine', place: 'clinic' }], requestedByName: 'Dr. Carlos Medina', fileId: file.body.id })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    assert.equal(r.body.exams[0].location, 'ambulatory')
    const tray = (await tech.get('/api/dept/tray')).body.items.find((e: any) => e.id === r.body.exams[0].id)
    assert.equal(tray.locationText, 'Ambulatorio')
    assert.equal(tray.requestedByName, 'Dr. Carlos Medina')
    assert.equal((await tech.post('/api/dept/ambulatory', { patientId: p.body.id, group: 'imaging', exams: [{ group: 'imaging', name: 'Ultrasonido', subject: 'abdomen', priority: 'routine', place: 'clinic' }] })).status, 403, 'solo su tipo')
    const us = await rec.post('/api/dept/ambulatory', { patientId: p.body.id, group: 'imaging', exams: [{ group: 'imaging', name: 'Ultrasonido', subject: 'abdomen', priority: 'routine', place: 'clinic' }] })
    assert.equal(us.status, 201, JSON.stringify(us.body))
    assert.equal((await nurse.post('/api/dept/ambulatory', { patientId: p.body.id, group: 'lab', exams: [{ group: 'lab', name: 'Hemograma', priority: 'routine', place: 'clinic' }] })).status, 403)
    const docExams = (await (await as('lherrera@demo.clinara')).get(`/api/patients/${p.body.id}/exams`)).body
    assert.equal(docExams.length, 2, 'en el expediente, para cualquier médico')
  })
  test('DP4: los técnicos ven datos, alergias y su tipo (imágenes, la creatinina); no notas, diagnósticos ni medicamentos (también por URL); el radiólogo ve todo sin escribir', async () => {
    const tech = await as('krivera@demo.clinara')
    const img = await as('pandino@demo.clinara')
    const rad = await as('mcastellanos@demo.clinara')
    const stay = await stayOf()
    const pid = String((await sql.one('SELECT patient_id FROM hospitalizations WHERE id = ?', [stay]))!.patient_id)
    const v = (await tech.get(`/api/dept/patients/${pid}`)).body
    assert.ok(Array.isArray(v.patient.allergies))
    assert.ok(v.exams.every((e: any) => e.group === 'lab'))
    assert.equal(v.diagnoses, undefined)
    assert.match(v.location, /^Hospitalización/)
    assert.ok(await sql.one(`SELECT 1 FROM audit WHERE user_id = 's-rivera' AND action LIKE 'Abrió el expediente%'`))
    for (const path of [`/api/inpatient/${stay}`, `/api/patients/${pid}/exams`, `/api/patients/${pid}/attachments`]) assert.equal((await tech.get(path)).status, 403, path)
    const iv = (await img.get(`/api/dept/patients/${pid}`)).body
    assert.ok(iv.exams.every((e: any) => e.group === 'imaging'))
    assert.ok(iv.creatinine === undefined || typeof iv.creatinine.value === 'string')
    const boot = (await tech.get('/api/bootstrap')).body
    assert.ok(boot.patients.every((p: any) => !p.conditions?.length && !p.allergies?.length), 'sin diagnósticos en la búsqueda')
    assert.equal((await rad.get(`/api/inpatient/${stay}`)).status, 200, 'el radiólogo ve el expediente')
    assert.equal((await rad.post(`/api/inpatient/${stay}/notes`, { kind: 'evolution', format: 'dx', observations: 'x' })).status, 403, 'no escribe notas')
  })
  test('DP5: el microbiólogo agrega un examen con rango y cambia un umbral (bitácora); el radiólogo agrega un estudio con «¿De qué?»; los técnicos no editan', async () => {
    const micro = await as('gordonez@demo.clinara')
    const tech = await as('krivera@demo.clinara')
    const rad = await as('mcastellanos@demo.clinara')
    const add = await micro.post('/api/exams/catalog', { group: 'lab', name: 'Prueba de laboratorio DP5', subgroup: 'Otros' })
    assert.equal(add.status, 201, JSON.stringify(add.body))
    assert.equal((await micro.put(`/api/exams/catalog/${add.body.id}/refs`, { rows: [{ analyte: 'Valor', sex: 'all', unit: 'mg/dL', low: 1, high: 5 }] })).status, 200)
    assert.equal((await micro.post('/api/exams/catalog', { group: 'imaging', name: 'Estudio de otro departamento' })).status, 403)
    assert.equal((await tech.post('/api/exams/catalog', { group: 'lab', name: 'Prueba del técnico' })).status, 403)
    assert.equal((await tech.del(`/api/exams/catalog/${add.body.id}`)).status, 403)
    const settings = (await micro.get('/api/bootstrap')).body.settings
    const groups = structuredClone(settings.criticalGroups)
    const k = groups.flatMap((g: any) => g.analytes).find((a: any) => a.name === 'Potasio')
    const before = k.low
    k.low = 3
    assert.equal((await micro.put('/api/settings/critical-groups', { groups })).status, 200)
    assert.ok(await sql.one(`SELECT 1 FROM audit WHERE user_id = 's-ordonez' AND action LIKE ?`, [`%Potasio: crítico si es menor de ${before} → 3%`]))
    assert.equal((await tech.put('/api/settings/critical-groups', { groups })).status, 403)
    assert.equal((await rad.put('/api/settings/critical-groups', { groups })).status, 403)
    const st = await rad.post('/api/exams/catalog', { group: 'imaging', name: 'Fluoroscopia especial', subgroup: 'Otros', details: { what: true } })
    assert.equal(st.status, 201, JSON.stringify(st.body))
    const doc = await as('lherrera@demo.clinara')
    const stay = await stayOf()
    const bad = await doc.post(`/api/inpatient/${stay}/notes`, { kind: 'evolution', format: 'dx', observations: 'DP5', exams: [{ group: 'imaging', name: 'Fluoroscopia especial', priority: 'routine', place: 'clinic' }] })
    assert.equal(bad.status, 400, 'pide de qué')
    assert.equal((await doc.post(`/api/inpatient/${stay}/notes`, { kind: 'evolution', format: 'dx', observations: 'DP5', exams: [{ group: 'imaging', name: 'Fluoroscopia especial', subject: 'esófago', priority: 'routine', place: 'clinic' }] })).status, 201)
  })
  test('DP6: el microbiólogo asigna la Mañana de lunes a viernes en una operación; el técnico ve sin editar y no ve Imágenes; enfermería no se asigna en Laboratorio', async () => {
    const micro = await as('gordonez@demo.clinara')
    const tech = await as('krivera@demo.clinara')
    const admin = await as('admin@demo.clinara')
    const today = new Date(); const y = today.getFullYear(), m = today.getMonth()
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const from = iso(today), to = iso(new Date(y, m + 1, 0))
    const r = await micro.post('/api/roster/bulk', { staffId: 's-rivera', dept: 'lab', shift: 'morning', from, to, weekdays: [1, 2, 3, 4, 5] })
    assert.equal(r.status, 200, JSON.stringify(r.body))
    const list = (await tech.get(`/api/roster?from=${from}&to=${to}&dept=lab`)).body
    assert.ok(list.some((x: any) => x.staffId === 's-rivera' && x.shift === 'morning'))
    assert.equal((await tech.post('/api/roster', { day: to, staffId: 's-rivera', dept: 'lab', shift: 'night' })).status, 403)
    assert.equal((await tech.get(`/api/roster?from=${from}&to=${to}&dept=imaging`)).status, 403)
    assert.equal((await admin.post('/api/roster', { day: to, staffId: 's-rios', dept: 'lab', shift: 'night' })).status, 400, 'enfermería no va en Laboratorio')
    assert.equal((await admin.get(`/api/roster?from=${from}&to=${to}&dept=imaging`)).status, 200)
    assert.ok(await sql.one(`SELECT 1 FROM audit WHERE user_id = 's-ordonez' AND action LIKE 'Rol de turnos (Laboratorio): asignó a Téc. Kevin Rivera%'`))
  })
  test('DP: en Consultorio no existen los roles nuevos', async () => {
    const { ROLES_BY_KIND } = await import('../src/lib/permissions.js')
    assert.ok(!ROLES_BY_KIND.office.includes('lab' as never))
    const office = await as('alopez@demo.clinara')
    const pid = String((await sql.one(`SELECT p.id FROM patients p JOIN staff s ON s.clinic_id = p.clinic_id WHERE s.email = 'alopez@demo.clinara' LIMIT 1`))!.id)
    assert.equal((await office.post('/api/dept/ambulatory', { patientId: pid, group: 'lab', exams: [{ group: 'lab', name: 'Hemograma', priority: 'routine', place: 'clinic' }] })).status, 403)
  })
})
