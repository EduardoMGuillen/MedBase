import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb } from './db.js'
import { createSql, type Sql } from './sql.js'

let server: Server
let sql: Sql
let base = ''

before(async () => {
  sql = createSql({ memory: true })
  await ensureDb(sql)
  const app = createApp({ sql, jwtSecret: 'test-secret', demoMode: true })
  await new Promise<void>((r) => { server = app.listen(0, () => r()) })
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const admin = await as('admin@demo.clinara')
  const all = Object.fromEntries(['0', '1', '2', '3', '4', '5', '6'].map((d) => [d, [{ start: '00:00', end: '23:45' }]]))
  await admin.patch('/api/staff/s-herrera/schedule', { slot: 15, week: all })
})
after(async () => { server.close(); await sql.close() })

/** Cliente mínimo que conserva la cookie de sesión. */
async function as(email: string) {
  const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: DEMO_PASSWORD }) })
  const cookie = res.headers.get('set-cookie')?.split(';')[0] ?? ''
  const call = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(`${base}${path}`, { method, headers: { cookie, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    return { status: r.status, body: await r.json() as any }
  }
  return { get: (p: string) => call('GET', p), post: (p: string, b?: unknown) => call('POST', p, b), patch: (p: string, b: unknown) => call('PATCH', p, b) }
}

const DX = [{ code: 'CA02', label: 'Faringitis aguda', system: 'icd11' }]
const ACETAMINOFEN = { drug: 'Acetaminofén', presentation: 'Tableta 500 mg', dose: '1 g', route: 'Oral', frequency: 'Cada 8 horas', duration: '3 días' }
const freeBed = async () => {
  const boot = (await (await as('lherrera@demo.clinara')).get('/api/bootstrap')).body
  const used = new Set(boot.inpatients.map((h: any) => h.bedId))
  return boot.beds.find((b: any) => b.active && !used.has(b.id)).id as string
}
export async function openConsult(patientId: string) {
  const nurse = await as('crios@demo.clinara')
  const doc = await as('lherrera@demo.clinara')
  const w = await nurse.post('/api/appointments/walk-in', { patientId, doctorId: 's-herrera', reason: 'Consulta' })
  assert.equal(w.status, 201, JSON.stringify(w.body))
  await doc.post(`/api/appointments/${w.body.id}/status`, { status: 'in_consult' })
  return { doc, nurse, apptId: String(w.body.id) }
}

/**
 * El caso de José Aguilar: la consulta se firmó con "Ingreso a observación" con la versión anterior a la ronda 2.
 * Esa versión dejaba el medicamento sólo en la receta (sin columna meds ni órdenes) y creaba la observación vacía.
 * Después, ya con la versión nueva, se usó "Pasar a hospitalización".
 */
async function legacyObservation(patientId: string) {
  const cid = String((await sql.one(`SELECT clinic_id FROM patients WHERE id = ?`, [patientId]))!.clinic_id)
  const at = new Date(Date.now() - 4 * 3_600_000).toISOString()
  const k = `k-legacy-${patientId}`
  await sql.run(`INSERT INTO prescriptions (id, folio, patient_id, doctor_id, consultation_id, issued_at, items, clinic_id) VALUES (?, ?, ?, 's-herrera', ?, ?, ?, ?)`,
    [`rx-${k}`, `RX-LEG-${patientId}`, patientId, k, at, JSON.stringify([ACETAMINOFEN]), cid])
  await sql.run(`INSERT INTO consultations (id, patient_id, doctor_id, date, reason, diagnoses, plan, prescription_id, orders, clinic_id) VALUES (?,?, 's-herrera', ?, 'Fiebre', ?, '', ?, '[]', ?)`,
    [k, patientId, at, JSON.stringify(DX), `rx-${k}`, cid])
  await sql.run(`INSERT INTO hospitalizations (id, clinic_id, patient_id, bed_id, consultation_id, admitted_at, admitted_by, reason, diagnoses, status, kind)
    VALUES (?, ?, ?, NULL, ?, ?, 's-herrera', 'Fiebre', ?, 'active', 'observation')`, [`h-${k}`, cid, patientId, k, at, JSON.stringify(DX)])
  return { stayId: `h-${k}`, consultId: k }
}

describe('P3 medicamentos a la hoja por todas las rutas', () => {
  test('reproducción (José Aguilar): observación de antes + "Pasar a hospitalización" deja el acetaminofén en la hoja', async () => {
    const { stayId, consultId } = await legacyObservation('p18')
    const doc = await as('lherrera@demo.clinara')
    const conv = await doc.post(`/api/inpatient/${stayId}/convert`, { bedId: await freeBed() })
    assert.equal(conv.status, 200, JSON.stringify(conv.body))
    const file = (await doc.get(`/api/inpatient/${stayId}`)).body
    assert.deepEqual(file.meds.map((m: any) => m.drug), ['Acetaminofén'], 'el medicamento de la nota de ingreso debe estar en la hoja')
    const m = file.meds[0]
    assert.equal(m.source, 'consultation')
    assert.equal(m.sourceId, consultId)
    assert.equal(m.days, 3)
    assert.equal(m.everyHours, 8)
    assert.ok(new Date(m.firstAt).getTime() >= new Date(file.hospitalization.admittedAt).getTime() - 1000, 'sin dosis retroactivas antes de llegar a la unidad')
  })
})

describe('P3 cada ruta de la tabla', () => {
  test('consulta con medicamento "por 3 días" + ingreso a observación → hoja; luego a hospitalización: una sola orden con sus dosis', async () => {
    const { doc, nurse, apptId } = await openConsult('p17')
    const c = await doc.post('/api/consultations', { appointmentId: apptId, reason: 'Fiebre', diagnoses: DX, orders: ['Signos vitales cada 4 horas.'], observe: true, items: [ACETAMINOFEN] })
    assert.equal(c.status, 201, JSON.stringify(c.body))
    assert.equal(c.body.medOrders, 1)
    let file = (await nurse.get(`/api/inpatient/${c.body.hospitalizationId}`)).body
    assert.deepEqual(file.meds.map((m: any) => m.drug), ['Acetaminofén'])
    const med = file.meds[0]
    assert.equal(med.days, 3)
    assert.equal((await nurse.post(`/api/inpatient/meds/${med.id}/doses`, { scheduledAt: med.firstAt })).status, 201, 'enfermería aplica')
    const conv = await doc.post(`/api/inpatient/${c.body.hospitalizationId}/convert`, { bedId: await freeBed() })
    assert.equal(conv.status, 200)
    assert.equal(conv.body.medOrders, 0, 'la orden continúa: no se vuelve a crear')
    file = (await doc.get(`/api/inpatient/${c.body.hospitalizationId}`)).body
    assert.equal(file.meds.length, 1)
    assert.equal(file.meds[0].id, med.id)
    assert.equal(file.doses.length, 1, 'conserva la dosis ya aplicada')
  })
  test('consulta ambulatoria con "Aplicar en la clínica" → observación sólo con ese; al hospitalizar pasan todos', async () => {
    const { doc, apptId } = await openConsult('p16')
    const shot = { drug: 'Metoclopramida', presentation: 'Ampolla 10 mg', dose: '10 mg', route: 'Intramuscular', frequency: 'Dosis única', duration: '', applyInClinic: true }
    const c = await doc.post('/api/consultations', { appointmentId: apptId, reason: 'Vómitos', diagnoses: DX, orders: [], items: [ACETAMINOFEN, shot] })
    assert.equal(c.body.stayKind, 'observation')
    assert.deepEqual((await doc.get(`/api/inpatient/${c.body.hospitalizationId}`)).body.meds.map((m: any) => m.drug), ['Metoclopramida'])
    const conv = await doc.post(`/api/inpatient/${c.body.hospitalizationId}/convert`, { bedId: await freeBed() })
    assert.equal(conv.body.medOrders, 1)
    assert.deepEqual((await doc.get(`/api/inpatient/${c.body.hospitalizationId}`)).body.meds.map((m: any) => m.drug).sort(), ['Acetaminofén', 'Metoclopramida'])
  })
  test('consulta con medicamento + ingreso directo a hospitalización → hoja', async () => {
    const { doc, apptId } = await openConsult('p10')
    const c = await doc.post('/api/consultations', { appointmentId: apptId, reason: 'Fiebre', diagnoses: DX, orders: [], admit: true, items: [ACETAMINOFEN] })
    assert.equal(c.body.medOrders, 1)
    assert.deepEqual((await doc.get(`/api/inpatient/${c.body.hospitalizationId}`)).body.meds.map((m: any) => m.drug), ['Acetaminofén'])
  })
  test('nota de evolución con 3 medicamentos → los 3; guardarla dos veces no duplica', async () => {
    const { doc, apptId } = await openConsult('p9')
    const c = await doc.post('/api/consultations', { appointmentId: apptId, reason: 'ECV', diagnoses: DX, orders: ['Reposo.'], admit: true })
    const id = c.body.hospitalizationId
    const note = { kind: 'evolution', subjective: 'S', objective: 'O', assessment: 'A', plan: 'Control de HTA, realizar TAC, y valorar trombólisis o trombectomía', clientId: '6f1d2c3e-1111-4a2b-9c3d-000000000001',
      orders: ['Dieta blanda.'], indicationCount: 1,
      meds: [{ drug: 'Ondansetrón', dose: '8 mg', route: 'Intravenosa', everyHours: 8, prn: false }, { drug: 'Acetaminofén', dose: '1 g', route: 'Intravenosa', everyHours: 6, prn: true },
        { drug: 'Dexmedetomidina', dose: '10', route: 'Intravenosa', prn: false }] }
    assert.equal((await doc.post(`/api/inpatient/${id}/notes`, note)).status, 201)
    assert.equal((await doc.post(`/api/inpatient/${id}/notes`, note)).status, 200, 'la segunda vez devuelve la misma nota')
    const file = (await doc.get(`/api/inpatient/${id}`)).body
    assert.equal(file.notes.filter((n: any) => n.kind === 'evolution').length, 1)
    assert.deepEqual(file.meds.map((m: any) => m.drug).sort(), ['Acetaminofén', 'Dexmedetomidina', 'Ondansetrón'])
  })
  test('consultorio: consulta con medicamento + ingreso a observación → hoja de observación', async () => {
    const doc = await as('alopez@demo.clinara')
    const asi = await as('asistente@demo.clinara')
    const w = await asi.post('/api/appointments/walk-in', { patientId: 'r8', doctorId: 's3-lopez', reason: 'Fiebre' })
    await doc.post(`/api/appointments/${w.body.id}/status`, { status: 'in_consult' })
    const c = await doc.post('/api/consultations', { appointmentId: w.body.id, reason: 'Fiebre', diagnoses: DX, orders: [], observe: true, items: [ACETAMINOFEN] })
    assert.equal(c.status, 201, JSON.stringify(c.body))
    const file = (await asi.get(`/api/inpatient/${c.body.hospitalizationId}`)).body
    assert.deepEqual(file.meds.map((m: any) => m.drug), ['Acetaminofén'])
    assert.equal((await doc.post(`/api/inpatient/meds/${file.meds[0].id}/doses`, { scheduledAt: file.meds[0].firstAt })).status, 201, 'el médico también aplica')
  })
  test('relleno: la simulación lista lo que falta, la corrida real lo crea una sola vez y la comprobación queda limpia', async () => {
    const { backfillMissingOrders, checkStayOrders } = await import('./medOrders.js')
    const { stayId } = await legacyObservation('p8')
    const dry = await sql.tx((q) => backfillMissingOrders(q, { dryRun: true }))
    assert.ok(dry.some((l) => l.hospitalizationId === stayId && l.drug === 'Acetaminofén'))
    assert.equal((await sql.query('SELECT 1 FROM hosp_meds WHERE hospitalization_id = ?', [stayId])).length, 0, 'la simulación no crea nada')
    await sql.tx((q) => backfillMissingOrders(q, { dryRun: false }))
    await sql.tx((q) => backfillMissingOrders(q, { dryRun: false }))
    const meds = await sql.query('SELECT drug, first_at FROM hosp_meds WHERE hospitalization_id = ?', [stayId])
    assert.deepEqual(meds.map((m) => m.drug), ['Acetaminofén'])
    assert.ok(Date.now() - new Date(String(meds[0].first_at)).getTime() < 60_000, 'empieza ahora: sin dosis atrasadas que nadie pudo ver')
    assert.deepEqual(await checkStayOrders(sql), [])
  })
  test('con días la orden vence sola; sin días sigue hasta nueva orden', async () => {
    const { doseTimes, courseDone } = await import('../src/lib/inpatient.js')
    const first = new Date('2026-10-26T08:00:00Z')
    const m = { firstAt: first.toISOString(), everyHours: 8, prn: false, days: 3 }
    const all = doseTimes(m, new Date('2026-10-20T00:00:00Z'), new Date('2026-11-05T00:00:00Z'))
    assert.equal(all.length, 9, '3 días cada 8 horas')
    assert.ok(courseDone(m, new Date('2026-10-29T08:00:00Z')))
    assert.ok(!courseDone({ ...m, days: undefined }, new Date('2027-01-01T00:00:00Z')))
  })
})
