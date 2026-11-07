import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb } from './db.js'
import { createSql, type Sql } from './sql.js'
import { fileAlerts, myPendingAdmissions } from '../src/lib/alerts.js'
import { admissionOrdersPending, attendingText } from '../src/lib/inpatient.js'
import { permissionsFor } from '../src/lib/permissions.js'

// Ronda 16 (rama ingreso): HO2 (ingreso directo con nota de ingreso, médico tratante, recepción ingresa) e IE1 (ingestas y excretas)
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

const dx = [{ code: 'DC10', label: 'Colecistitis aguda' }]
const staffId = async (email: string) => String((await sql.one('SELECT id FROM staff WHERE email = ?', [email]))!.id)

/** Una cama libre y un paciente adulto sin estancia activa ni consulta con ingreso reciente, de la clínica del Dr. Nolasco. */
async function freeBedAndPatient(n: number) {
  const doc = await as('hnolasco@demo.clinara')
  const boot = (await doc.get('/api/bootstrap')).body
  const used = new Set(boot.bedStays.map((x: any) => x.bedId))
  const bed = boot.beds.filter((b: any) => b.active && !used.has(b.id))[0]
  const busy = new Set(boot.stays.map((x: any) => x.patientId))
  const pts = await sql.query(`SELECT p.id FROM patients p WHERE p.clinic_id = (SELECT clinic_id FROM staff WHERE id = 's-nolasco') AND p.dni IS NOT NULL AND p.dni <> ''
    AND p.birth_date < '2000-01-01' AND NOT EXISTS (SELECT 1 FROM consultations c WHERE c.patient_id = p.id AND c.admit_kind IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM hospitalizations h WHERE h.patient_id = p.id AND h.status = 'discharged' AND h.consultation_id IS NOT NULL) ORDER BY p.id`)
  const free = pts.map((r) => String(r.id)).filter((id) => !busy.has(id))
  return { bedId: String(bed.id), patientId: free[n] }
}

describe('HO2 (ronda 16): permisos del ingreso', () => {
  test('ingresan médico, recepción y administración; enfermería, laboratorio e imágenes no', () => {
    for (const r of ['doctor', 'reception', 'admin'] as const) assert.ok(permissionsFor(r).includes('inpatient.admit'), r)
    for (const r of ['nurse', 'lab', 'imaging', 'assistant'] as const) assert.ok(!permissionsFor(r).includes('inpatient.admit'), r)
    assert.ok(!permissionsFor('admin', 'office').includes('inpatient.admit'), 'un consultorio no hospitaliza')
    assert.ok(!permissionsFor('reception').includes('inpatient.orders') && !permissionsFor('reception').includes('inpatient.view'), 'recepción no escribe órdenes ni ve el expediente')
  })

  test('laboratorio no puede ingresar (403); enfermería tampoco', async () => {
    const { bedId, patientId } = await freeBedAndPatient(0)
    const body = { patientId, bedId, reason: 'Programada para cirugía', attendingIds: ['s-nolasco'] }
    assert.equal((await (await as('psuazo@demo.clinara')).post('/api/inpatient', body)).status, 403)
    assert.equal((await (await as('murbina@demo.clinara')).post('/api/inpatient', body)).status, 403)
  })
})

describe('HO2 (ronda 16): ingreso directo con médico tratante y órdenes pendientes', () => {
  test('el médico ingresa: es el médico tratante por defecto; queda con órdenes pendientes hasta firmar la nota de ingreso', async () => {
    const { bedId, patientId } = await freeBedAndPatient(1)
    const doc = await as('hnolasco@demo.clinara')
    const noDx = await doc.post('/api/inpatient', { patientId, bedId, reason: 'Dolor abdominal' })
    assert.equal(noDx.status, 400, 'el médico sí pone el diagnóstico')
    const r = await doc.post('/api/inpatient', { patientId, bedId, reason: 'Dolor abdominal', diagnoses: dx })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    assert.deepEqual(r.body.attendingIds, ['s-nolasco'])
    assert.ok(r.body.authorizationId, 'la autorización de hospitalización se genera como siempre')
    const boot = (await doc.get('/api/bootstrap')).body
    const h = boot.inpatients.find((x: any) => x.id === r.body.id)
    assert.equal(h.ordersPending, true)
    assert.ok(myPendingAdmissions(boot.inpatients, 's-nolasco').some((x) => x.id === h.id), 'el pendiente en su Inicio')
    const file = (await doc.get(`/api/inpatient/${r.body.id}`)).body
    assert.ok(admissionOrdersPending(file.hospitalization, file.notes))
    assert.ok(fileAlerts(file, { fever: 38, hypo: 35.5 } as any, new Date()).some((a) => a.key === 'admission-orders' && /Ingreso con órdenes pendientes/.test(a.text)))
    const log = await sql.query(`SELECT action FROM audit WHERE action LIKE 'Ingresó a %' ORDER BY id DESC LIMIT 1`)
    assert.match(String(log[0].action), /médico tratante: Dr\. Hugo Nolasco; ingreso con órdenes pendientes/)
    // La nota de ingreso (formato estándar) lo resuelve
    const note = await doc.post(`/api/inpatient/${r.body.id}/notes`, { kind: 'admission', format: 'dx', chiefComplaint: 'Dolor abdominal', diagnoses: dx, orders: ['Dieta líquida.'] })
    assert.equal(note.status, 201, JSON.stringify(note.body))
    const after = (await doc.get('/api/bootstrap')).body.inpatients.find((x: any) => x.id === r.body.id)
    assert.equal(after.ordersPending, false, 'la alerta desaparece sola')
    assert.ok((await sql.one(`SELECT 1 FROM audit WHERE action LIKE 'Firmó la nota de ingreso de %'`)), 'bitácora: cuándo se firmó la nota de ingreso')
  })

  test('recepción ingresa con médico tratante obligatorio y sin diagnóstico; el médico tratante ve la alerta y la resuelve', async () => {
    const { bedId, patientId } = await freeBedAndPatient(2)
    const rec = await as('aquiroz@demo.clinara')
    const nurseId = await staffId('murbina@demo.clinara')
    assert.equal((await rec.post('/api/inpatient', { patientId, bedId, reason: 'Programada para colecistectomía' })).status, 400, 'sin médico tratante')
    assert.equal((await rec.post('/api/inpatient', { patientId, bedId, reason: 'Programada para colecistectomía', attendingIds: [nurseId] })).status, 400, 'el tratante es un médico')
    const r = await rec.post('/api/inpatient', { patientId, bedId, reason: 'Programada para colecistectomía', attendingIds: ['s-nolasco'] })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    assert.deepEqual(r.body.diagnoses, [])
    assert.equal(r.body.admittedBy, await staffId('aquiroz@demo.clinara'))
    // Recepción no ve el expediente ni escribe notas u órdenes (403 por URL directa)
    assert.equal((await rec.get(`/api/inpatient/${r.body.id}`)).status, 403)
    assert.equal((await rec.post(`/api/inpatient/${r.body.id}/notes`, { kind: 'admission', format: 'dx', chiefComplaint: 'x', diagnoses: dx })).status, 403)
    assert.equal((await rec.post(`/api/inpatient/${r.body.id}/nursing`, { text: 'Nota de prueba' })).status, 403)
    // Ve e imprime la autorización de hospitalización (no la firma: «Firmar ahora» no le aparece)
    const a = await rec.get(`/api/authorizations/${r.body.authorizationId}`)
    assert.equal(a.status, 200)
    assert.equal(a.body.data.doctor.name, 'Dr. Hugo Nolasco', 'firma el médico tratante, no recepción')
    assert.equal((await rec.post(`/api/authorizations/${r.body.authorizationId}/sign`, {})).status, 403)
    // El tablero de camas (sin datos clínicos) dice quién es el médico tratante
    const recBoot = (await rec.get('/api/bootstrap')).body
    assert.equal(recBoot.inpatients.length, 0)
    assert.deepEqual(recBoot.bedStays.find((x: any) => x.id === r.body.id).attendingIds, ['s-nolasco'])
    // El Dr. Nolasco la ve en su Inicio; la Lic. Urbina, «Sin órdenes de ingreso» en la cama
    const doc = await as('hnolasco@demo.clinara')
    assert.ok(myPendingAdmissions((await doc.get('/api/bootstrap')).body.inpatients, 's-nolasco').some((x) => x.id === r.body.id))
    assert.equal((await (await as('murbina@demo.clinara')).get('/api/bootstrap')).body.inpatients.find((x: any) => x.id === r.body.id).ordersPending, true)
    const log = await sql.query(`SELECT action FROM audit WHERE action LIKE 'Ingresó a %' ORDER BY id DESC LIMIT 1`)
    assert.match(String(log[0].action), /médico tratante: Dr\. Hugo Nolasco \(ingreso por recepción, sin diagnóstico\)/)
    // Al firmar la nota de ingreso, la alerta desaparece y los diagnósticos pasan al ingreso (y a la autorización pendiente)
    const note = await doc.post(`/api/inpatient/${r.body.id}/notes`, { kind: 'admission', format: 'dx', chiefComplaint: 'Programada', diagnoses: dx, orders: ['NPO.'] })
    assert.equal(note.status, 201, JSON.stringify(note.body))
    const h = (await doc.get('/api/bootstrap')).body.inpatients.find((x: any) => x.id === r.body.id)
    assert.equal(h.ordersPending, false)
    assert.deepEqual(h.diagnoses, dx)
    assert.equal((await rec.get(`/api/authorizations/${r.body.authorizationId}`)).body.data.admission.diagnosis, 'Colecistitis aguda')
  })

  test('administración también ingresa; varios médicos tratantes, el primero es el principal; el médico los cambia', async () => {
    const { bedId, patientId } = await freeBedAndPatient(3)
    const admin = await as('rmoncada@demo.clinara')
    const other = String((await sql.one(`SELECT id FROM staff WHERE clinic_id = (SELECT clinic_id FROM staff WHERE id = 's-nolasco') AND role = 'doctor' AND active AND id <> 's-nolasco' ORDER BY id LIMIT 1`))!.id)
    const r = await admin.post('/api/inpatient', { patientId, bedId, reason: 'Ingreso programado', attendingIds: [other, 's-nolasco'] })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    assert.deepEqual(r.body.attendingIds, [other, 's-nolasco'])
    assert.equal(attendingText(r.body.attendingIds, (x) => ({ [other]: 'Dr. A', 's-nolasco': 'Dr. B' } as Record<string, string>)[x]), 'Dr. A (principal), Dr. B')
    // Recepción y administración no cambian al médico tratante; el médico sí (queda en la bitácora)
    assert.equal((await admin.patch(`/api/inpatient/${r.body.id}`, { attendingIds: ['s-nolasco'] })).status, 403)
    const doc = await as('hnolasco@demo.clinara')
    const p = await doc.patch(`/api/inpatient/${r.body.id}`, { attendingIds: ['s-nolasco', other] })
    assert.equal(p.status, 200, JSON.stringify(p.body))
    assert.deepEqual(p.body.attendingIds, ['s-nolasco', other])
    assert.ok(await sql.one(`SELECT 1 FROM audit WHERE action LIKE '%médico tratante:%→%'`))
  })

  test('el ingreso desde la consulta (y las estancias de antes) no quedan con órdenes pendientes', async () => {
    const doc = await as('hnolasco@demo.clinara')
    const boot = (await doc.get('/api/bootstrap')).body
    for (const h of boot.inpatients.filter((x: any) => x.consultationId || x.kind === 'observation' || x.observationAt)) assert.equal(h.ordersPending, false, h.id)
    assert.ok(boot.inpatients.every((h: any) => Array.isArray(h.attendingIds) && h.attendingIds.length), 'toda estancia tiene médico tratante (las de antes: quien ingresó)')
  })
})
