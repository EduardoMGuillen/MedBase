import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb } from './db.js'
import { createSql, type Sql } from './sql.js'
import { fileAlerts } from '../src/lib/alerts.js'
import { bandOf } from '../src/lib/vitalsSheet.js'
import { medicationLine } from '../src/lib/format.js'
import { medLabel } from '../src/lib/inpatient.js'
import { loadLabCatalog } from './catalogLoader.js'
import { EXAMS, subgroupOf } from '../src/lib/exams.js'

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
  return {
    status: res.status,
    get: (p: string) => call('GET', p), post: (p: string, b?: unknown) => call('POST', p, b), patch: (p: string, b: unknown) => call('PATCH', p, b),
    put: (p: string, b: unknown) => call('PUT', p, b), del: (p: string, b?: unknown) => call('DELETE', p, b),
  }
}

/** Una estancia activa del tipo pedido. */
async function stayOf(doc: Awaited<ReturnType<typeof as>>, kind: 'hospital' | 'observation') {
  return (await doc.get('/api/bootstrap')).body.inpatients.find((h: any) => h.kind === kind && h.status === 'active')
}

describe('MC2 PRN', () => {
  test('la receta se lee «PRN: si dolor» y la nota «PRN · si dolor»', () => {
    const it = { drug: 'Acetaminofén', presentation: 'Tableta 500 mg', dose: '1 tableta', route: 'Oral', frequency: 'PRN (si es necesario)', duration: '3 días', prnCondition: 'si dolor' }
    assert.match(medicationLine(it), /PRN: si dolor/)
    assert.equal(medLabel({ drug: 'Tramadol', dose: '50 mg', route: 'Subcutánea', everyHours: 8, prn: true, prnCondition: 'si dolor' }), 'Tramadol 50 mg SC c/8h PRN · si dolor')
    // Lo de antes no cambia
    assert.equal(medLabel({ drug: 'Ondansetrón', dose: '8 mg', route: 'Intravenosa', everyHours: 8, prn: false }), 'Ondansetrón 8 mg IV c/8h')
  })

  test('con su condición pasa a la hoja sin horas, no alerta y enfermería registra la dosis con su nombre', async () => {
    const doc = await as('lherrera@demo.clinara')
    const nurse = await as('crios@demo.clinara')
    const stay = await stayOf(doc, 'hospital')
    const med = { drug: 'Ketorolaco', dose: '30 mg', route: 'Intravenosa', everyHours: 8, prn: true }
    const ok = await doc.post(`/api/inpatient/${stay.id}/notes`, { kind: 'evolution', format: 'dx', observations: 'Dolor', meds: [{ ...med, prnCondition: 'si dolor' }], orders: [] })
    assert.equal(ok.status, 201, JSON.stringify(ok.body))
    const file = (await doc.get(`/api/inpatient/${stay.id}`)).body
    const m = file.meds.find((x: any) => x.drug === 'Ketorolaco' && !x.stoppedAt)
    assert.equal(m.prnCondition, 'si dolor')
    const alerts = fileAlerts(file, bandOf({}), new Date(Date.now() + 2 * 86_400_000))
    assert.ok(!alerts.some((a) => a.text.includes('Ketorolaco')), 'un PRN nunca alerta')
    const d = await nurse.post(`/api/inpatient/meds/${m.id}/doses`, { status: 'given' })
    assert.equal(d.status, 201, JSON.stringify(d.body))
    assert.equal(d.body.givenBy, 's-rios')
    const log = (await nurse.get('/api/audit/mine')).body
    assert.ok((log.rows ?? log).some((e: any) => /Administró Ketorolaco 30 mg IV c\/8h PRN · si dolor/.test(e.action)))
  })

  test('la receta de la consulta no acepta un PRN sin condición', async () => {
    const doc = await as('lherrera@demo.clinara')
    const r = await doc.post('/api/prescriptions', { patientId: 'p1', items: [{ drug: 'Ibuprofeno', presentation: 'Tableta 400 mg', dose: '1 tableta', frequency: 'PRN (si es necesario)', duration: '3 días' }] })
    assert.equal(r.status, 400, JSON.stringify(r.body))
  })
})

describe('CF3 subgrupos y carga del catálogo', () => {
  test('los exámenes de la lista fija tienen su subgrupo (A6) y todos los del catálogo tienen uno', async () => {
    const admin = await as('admin@demo.clinara')
    const { exams } = (await admin.get('/api/exams/catalog')).body
    const hemo = exams.find((e: any) => e.name === 'Hemograma')
    assert.equal(hemo.subgroup, 'Hematología')
    assert.ok(exams.every((e: any) => subgroupOf(e)), 'nadie sin subgrupo')
  })

  test('la carga es idempotente, respeta equivalencias y no toca los originales', async () => {
    const before = await sql.query(`SELECT name, active, subgroup FROM exam_catalog WHERE clinic_id = 'c-sb' AND base_key IS NOT NULL ORDER BY name`)
    const data = {
      catalog: [{ name: 'Dímero D', subgroup: 'Coagulación' }, { name: 'HEMOGRAMA', subgroup: 'Hematología' }, { name: 'Hemograma completo', subgroup: 'Hematología' }, { name: 'Ferritina', subgroup: 'Química en sangre' }],
      equivalences: { 'Hemograma completo': 'Hemograma', 'Orina general': 'Examen general de orina (EGO)' },
      profiles: [{ name: 'Perfil de prueba', items: ['Hemograma completo', 'Orina general', 'Ferritina', 'Examen raro de prueba'] }],
    }
    const first = await loadLabCatalog(sql, 'c-sb', data)
    assert.deepEqual(first.added.sort(), ['Dímero D', 'Ferritina'])
    assert.equal(first.skipped.length, 2)
    assert.deepEqual(first.profilesAdded, ['Perfil de prueba'])
    assert.deepEqual(first.profileExamsAdded, ['Examen raro de prueba'])
    const second = await loadLabCatalog(sql, 'c-sb', data)
    assert.deepEqual([second.added.length, second.profilesAdded.length, second.profileExamsAdded.length], [0, 0, 0])
    const profile = await sql.one<{ items: string }>(`SELECT items FROM exam_profiles WHERE clinic_id = 'c-sb' AND name = 'Perfil de prueba' AND owner_id IS NULL`)
    assert.deepEqual(JSON.parse(profile!.items).map((i: any) => i.name), ['Hemograma', 'Examen general de orina (EGO)', 'Ferritina', 'Examen raro de prueba'])
    const after = await sql.query(`SELECT name, active, subgroup FROM exam_catalog WHERE clinic_id = 'c-sb' AND base_key IS NOT NULL ORDER BY name`)
    assert.deepEqual(after, before, 'los originales no cambian')
    assert.equal(before.length, EXAMS.length)
    const dup = await sql.query(`SELECT norm_key FROM exam_catalog WHERE clinic_id = 'c-sb' GROUP BY norm_key HAVING COUNT(*) > 1`)
    assert.equal(dup.length, 0)
    // Limpieza: lo de prueba se archiva para no afectar a las otras pruebas
    await sql.run(`UPDATE exam_catalog SET active = FALSE, archived_at = 'prueba' WHERE clinic_id = 'c-sb' AND base_key IS NULL AND name IN ('Dímero D','Ferritina','Examen raro de prueba')`)
    await sql.run(`UPDATE exam_profiles SET archived_at = 'prueba' WHERE clinic_id = 'c-sb' AND name = 'Perfil de prueba'`)
  })
})

describe('MC3 estudio no catalogado', () => {
  test('una radiografía escrita a mano va a Imagen y gabinete, no catalogada y a la bandeja de imágenes (o enfermería); el de laboratorio, a Laboratorio', async () => {
    const doc = await as('lherrera@demo.clinara')
    const nurse = await as('crios@demo.clinara')
    const stay = await stayOf(doc, 'observation')
    const r = await doc.post(`/api/inpatient/${stay.id}/notes`, { kind: 'evolution', format: 'dx', observations: 'Control', orders: [], exams: [
      { group: 'imaging', name: 'Rayos X lateral de columna lumbar', priority: 'routine', place: 'clinic' },
      { group: 'lab', name: 'Cortisol sérico matutino', priority: 'routine', place: 'clinic' },
      { group: 'lab', name: 'Hemograma', priority: 'routine', place: 'clinic' },
    ] })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    const file = (await doc.get(`/api/inpatient/${stay.id}`)).body
    const rx = file.exams.find((e: any) => e.name === 'Rayos X lateral de columna lumbar')
    const cort = file.exams.find((e: any) => e.name === 'Cortisol sérico matutino')
    const hemo = file.exams.find((e: any) => e.name === 'Hemograma' && e.noteId === r.body.id)
    assert.deepEqual([rx.group, rx.uncatalogued, rx.place], ['imaging', true, 'clinic'])
    assert.deepEqual([cort.group, cort.uncatalogued], ['lab', true])
    assert.equal(hemo.uncatalogued, undefined)
    const tray = (await nurse.get('/api/exams/tray')).body
    const ids = JSON.stringify(tray)
    assert.ok(ids.includes(rx.id) && ids.includes(cort.id), 'enfermería los recibe en su bandeja')
    // Imagen no usa «Muestra tomada»: su paso es «Realizado» (done)
    assert.equal((await nurse.post(`/api/exams/${rx.id}/status`, { status: 'done' })).status, 200)
  })
})

describe('CF6 perfiles de laboratorio de la clínica', () => {
  test('administración agrega, edita y archiva; el médico los ve, no los edita y los copia a Mis sets', async () => {
    const admin = await as('admin@demo.clinara')
    const doc = await as('apaz@demo.clinara')
    const items = [{ group: 'lab', name: 'Hemograma' }, { group: 'lab', name: 'Examen general de orina (EGO)' }, { group: 'lab', name: 'Proteína C reactiva' }]
    const r = await admin.post('/api/exams/profiles', { name: 'Febril de prueba', items, clinic: true })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    const seen = (await doc.get('/api/exams/catalog')).body.profiles.find((p: any) => p.id === r.body.id)
    assert.ok(seen && !seen.ownerId, 'el médico ve el perfil de la clínica')
    assert.equal((await doc.patch(`/api/exams/profiles/${r.body.id}`, { name: 'Lo cambio yo' })).status, 403)
    assert.equal((await doc.get('/api/exams/profiles/clinic')).status, 403)
    const copy = await doc.post('/api/order-sets', { name: 'Febril de prueba', kind: 'exams', items: items.map((e) => ({ exam: { ...e, priority: 'routine', place: 'clinic' } })) })
    assert.equal(copy.status, 201, JSON.stringify(copy.body))
    assert.equal((await admin.patch(`/api/exams/profiles/${r.body.id}`, { name: 'Febril', items: items.slice(0, 2) })).status, 200)
    const after = (await admin.get('/api/exams/profiles/clinic')).body.find((p: any) => p.id === r.body.id)
    assert.equal(after.items.length, 2)
    const mine = (await doc.get('/api/order-sets?kind=exams')).body.find((s: any) => s.id === copy.body.id)
    assert.equal(mine.items.length, 3, 'la copia del médico no cambia al editar el perfil')
    assert.equal((await admin.patch(`/api/exams/profiles/${r.body.id}`, { archived: true })).status, 200)
    assert.ok(!(await doc.get('/api/exams/catalog')).body.profiles.some((p: any) => p.id === r.body.id), 'archivado ya no se ofrece')
  })
})

describe('MC5 exámenes en las órdenes de la nota', () => {
  test('2 exámenes en la consulta con ingreso a observación: la nota de ingreso los trae y su estado cambia sin tocar la nota', async () => {
    const doc = await as('lherrera@demo.clinara')
    const nurse = await as('crios@demo.clinara')
    const appt = (await doc.get('/api/bootstrap')).body.appointments.find((a: any) => a.doctorId === 's-herrera' && a.status === 'arrived')
    assert.ok(appt, 'hay un paciente en sala')
    const r = await doc.post('/api/consultations', { appointmentId: appt.id, reason: 'Dolor lumbar', symptoms: [], history: 'Caída', exam: 'Dolor a la palpación', observations: '',
      diagnoses: [{ code: 'S/C', label: 'Lumbalgia' }], orders: ['Reposo.'], indications: ['Reposo.'], plan: '', observe: true,
      exams: [{ group: 'imaging', name: 'Radiografía', region: 'columna lumbar', priority: 'routine', place: 'clinic' }, { group: 'lab', name: 'Hemograma', priority: 'routine', place: 'clinic' }] })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    const note = (await doc.get(`/api/consultations/${r.body.consultationId}`)).body
    assert.deepEqual(note.exams.map((e: any) => e.name).sort(), ['Hemograma', 'Radiografía'])
    const hemo = note.exams.find((e: any) => e.name === 'Hemograma')
    assert.equal((await nurse.post(`/api/exams/${hemo.id}/status`, { status: 'sample' })).status, 200)
    const again = (await doc.get(`/api/consultations/${r.body.consultationId}`)).body
    assert.equal(again.exams.find((e: any) => e.name === 'Hemograma').status, 'sample')
    assert.equal(again.consultation.date, note.consultation.date, 'la nota firmada no cambia')
    // En el expediente de la observación están vinculados a la consulta (nota de ingreso), no a otra nota
    const file = (await doc.get(`/api/inpatient/${r.body.hospitalizationId}`)).body
    assert.equal(file.exams.filter((e: any) => e.consultationId === r.body.consultationId && !e.noteId).length, 2)
  })
})
