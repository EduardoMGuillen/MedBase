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

describe('P4 dos formatos de nota', () => {
  test('formato Diagnóstico · Examen físico · Observaciones: se guarda con su formato, valida lo mínimo y se recuerda', async () => {
    const { doc, apptId } = await openConsult('p7')
    const c = await doc.post('/api/consultations', { appointmentId: apptId, reason: 'ECV', diagnoses: DX, orders: ['Reposo.'], admit: true })
    const id = c.body.hospitalizationId
    const empty = await doc.post(`/api/inpatient/${id}/notes`, { kind: 'evolution', format: 'dx' })
    assert.equal(empty.status, 400)
    const dx = [{ code: '8B11', label: 'Infarto cerebral', system: 'icd11' }]
    const r = await doc.post(`/api/inpatient/${id}/notes`, { kind: 'evolution', format: 'dx', diagnoses: dx, exam: 'Hemiparesia derecha.', observations: '', orders: ['Signos vitales cada hora.'], indicationCount: 1,
      meds: [{ drug: 'Enalapril', dose: '10 mg', route: 'Oral', everyHours: 12, prn: false }] })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    assert.equal(r.body.format, 'dx')
    assert.deepEqual(r.body.diagnoses, dx)
    assert.equal(r.body.exam, 'Hemiparesia derecha.')
    assert.equal(r.body.subjective, '')
    // Sólo una indicación también basta
    assert.equal((await doc.post(`/api/inpatient/${id}/notes`, { kind: 'evolution', format: 'dx', orders: ['Dieta blanda.'], indicationCount: 1 })).status, 201)
    // SOAP sigue pidiendo sus cuatro campos
    assert.equal((await doc.post(`/api/inpatient/${id}/notes`, { kind: 'evolution', subjective: 'S', objective: 'O', assessment: 'A' })).status, 400)
    const file = (await doc.get(`/api/inpatient/${id}`)).body
    assert.ok(file.meds.some((m: any) => m.drug === 'Enalapril'))
    // Ronda 3 de Emil (MC4): el formato por defecto lo elige el médico en Mi configuración; escribir una nota no lo cambia
    const me = (await doc.get('/api/bootstrap')).body.staff.find((s: any) => s.id === 's-herrera')
    assert.notEqual(me.prefs?.noteFormat, 'soap')
    // Las notas anteriores siguen siendo SOAP
    // Una estancia de la demo original (los casos de la v25 ya traen notas en el formato 2)
    const old = (await doc.get('/api/bootstrap')).body.inpatients.find((h: any) => h.id !== id && h.kind === 'hospital' && /^hz\d/.test(h.id))
    const oldFile = (await doc.get(`/api/inpatient/${old.id}`)).body
    assert.ok(oldFile.notes.filter((n: any) => n.kind === 'evolution').every((n: any) => n.format === undefined))
  })
})

describe('P1 editar datos generales', () => {
  test('sólo cama, acompañante y teléfonos; el ingreso no se reescribe; bitácora con antes y después', async () => {
    const { doc, nurse, apptId } = await openConsult('p6')
    const c = await doc.post('/api/consultations', { appointmentId: apptId, reason: 'Dolor', diagnoses: DX, orders: ['Reposo.'], admit: true })
    const id = c.body.hospitalizationId
    assert.equal((await doc.patch(`/api/inpatient/${id}`, { reason: 'Otro motivo' })).status, 400, 'el motivo del ingreso no se edita')
    assert.equal((await doc.patch(`/api/inpatient/${id}`, { admittedAt: new Date().toISOString() })).status, 400, 'la hora del ingreso no se edita')
    assert.equal((await doc.patch(`/api/inpatient/${id}`, { diagnoses: DX })).status, 400)
    const r = await nurse.patch(`/api/inpatient/${id}`, { companionName: 'Rosa Pérez', companionPhone: '9888-1234' })
    assert.equal(r.status, 200, 'enfermería también edita')
    assert.equal(r.body.companionName, 'Rosa Pérez')
    assert.equal(r.body.reason, 'Dolor')
    const auth = (await doc.get(`/api/inpatient/${id}`)).body.authorizations.find((a: any) => a.template === 'hospital')
    assert.equal(auth.data.companion.phone, '9888-1234', 'la autorización pendiente toma los datos nuevos')
    assert.equal((await (await as('smejia@demo.clinara')).patch(`/api/inpatient/${id}`, { companionName: 'X' })).status, 403, 'recepción no')
    const log = (await (await as('admin@demo.clinara')).get('/api/bootstrap')).body.audit as { action: string }[]
    assert.ok(log.some((e) => e.action.includes('acompañante: vacío → "Rosa Pérez"')))
  })
  test('los datos del paciente se guardan en su expediente, con bitácora y en las autorizaciones pendientes', async () => {
    const doc = await as('lherrera@demo.clinara')
    const h = (await doc.get('/api/bootstrap')).body.inpatients.find((x: any) => x.patientId === 'p6')
    const r = await doc.patch('/api/patients/p6', { occupation: 'Maestra', dni: '0801198099999' })
    assert.equal(r.status, 200)
    assert.equal(r.body.dni, '0801-1980-99999')
    const auth = (await doc.get(`/api/inpatient/${h.id}`)).body.authorizations.find((a: any) => a.template === 'hospital')
    assert.equal(auth.data.patient.dni, '0801-1980-99999')
    const log = (await (await as('admin@demo.clinara')).get('/api/bootstrap')).body.audit as { action: string }[]
    assert.ok(log.some((e) => e.action.includes('ocupación:') && e.action.includes('"Maestra"')))
  })
})

describe('P5 autorización quirúrgica mínima', () => {
  test('sólo el procedimiento: el diagnóstico y lo demás lo pone el sistema, con el texto genérico', async () => {
    const nurse = await as('crios@demo.clinara')
    const doc = await as('lherrera@demo.clinara')
    const h = (await doc.get('/api/bootstrap')).body.inpatients.find((x: any) => x.patientId === 'p6')
    const r = await nurse.post(`/api/inpatient/${h.id}/authorizations`, { template: 'surgical', procedure: 'Apendicectomía o laparotomía exploradora' })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    assert.equal(r.body.data.generic, true)
    assert.equal(r.body.data.diagnosis, 'Faringitis aguda', 'el diagnóstico sale del expediente')
    assert.equal(r.body.data.companion.name, 'Rosa Pérez')
    assert.equal(r.body.data.risks, undefined)
    assert.equal((await nurse.post(`/api/inpatient/${h.id}/authorizations`, { template: 'surgical' })).status, 400, 'el procedimiento es obligatorio')
  })
})

describe('P6 referencia en el consultorio y observación sin autorización', () => {
  test('la observación no genera autorización de hospitalización; al hospitalizar sí; las viejas pendientes pasan a "No aplica"', async () => {
    const { doc, apptId } = await openConsult('p5')
    const c = await doc.post('/api/consultations', { appointmentId: apptId, reason: 'Fiebre', diagnoses: DX, orders: ['Reposo.'], observe: true })
    let file = (await doc.get(`/api/inpatient/${c.body.hospitalizationId}`)).body
    assert.equal(file.authorizations.length, 0)
    assert.equal((await doc.post(`/api/inpatient/${c.body.hospitalizationId}/authorizations`, { template: 'hospital', companion: { name: 'Ana Ruiz', phone: '9999-0000' } })).status, 409)
    assert.equal((await doc.post(`/api/inpatient/${c.body.hospitalizationId}/authorizations`, { template: 'surgical', procedure: 'Sutura de herida' })).status, 201, 'la quirúrgica sí')
    await doc.post(`/api/inpatient/${c.body.hospitalizationId}/convert`, { bedId: await freeBed() })
    file = (await doc.get(`/api/inpatient/${c.body.hospitalizationId}`)).body
    assert.equal(file.authorizations.filter((a: any) => a.template === 'hospital' && a.status === 'pending').length, 1)
    // Una autorización de hospitalización pendiente en una observación (de antes) pasa a "No aplica"; la firmada no se toca
    const { SCHEMA } = await import('./db.js')
    const obs = (await (await as('alopez@demo.clinara')).get('/api/bootstrap')).body.inpatients.find((h: any) => h.kind === 'observation')
    await sql.run(`INSERT INTO authorizations (id, clinic_id, hospitalization_id, patient_id, template, data, status, created_by, created_at) VALUES ('au-old', 'c-al', ?, ?, 'hospital', '{}', 'pending', 's3-lopez', ?)`,
      [obs.id, obs.patientId, new Date().toISOString()])
    await sql.run(`INSERT INTO authorizations (id, clinic_id, hospitalization_id, patient_id, template, data, status, created_by, created_at) VALUES ('au-signed', 'c-al', ?, ?, 'hospital', '{}', 'signed', 's3-lopez', ?)`,
      [obs.id, obs.patientId, new Date().toISOString()])
    await sql.exec(SCHEMA)
    assert.equal((await sql.one(`SELECT status FROM authorizations WHERE id = 'au-old'`))!.status, 'not_applicable')
    assert.equal((await sql.one(`SELECT status FROM authorizations WHERE id = 'au-signed'`))!.status, 'signed')
    assert.ok(!(await (await as('alopez@demo.clinara')).get('/api/bootstrap')).body.inpatients.find((h: any) => h.id === obs.id).authPending)
  })
  test('el consultorio emite la referencia con lo del expediente; la observación se cierra como "Referido"', async () => {
    const doc = await as('alopez@demo.clinara')
    const asi = await as('asistente@demo.clinara')
    const obs = (await doc.get('/api/bootstrap')).body.inpatients.find((h: any) => h.id === 'h-k-r5-1')
    const draft = await doc.get(`/api/inpatient/${obs.id}/referral-draft`)
    assert.equal(draft.status, 200)
    assert.match(draft.body.diagnosis, /1A40\.Z/)
    assert.equal(draft.body.history, '', 'sin HEA en el expediente: queda vacía, no se inventa')
    assert.equal(draft.body.condition, '')
    assert.equal((await asi.get(`/api/inpatient/${obs.id}/referral-draft`)).status, 403, 'la asistente no emite')
    const r = await doc.post(`/api/inpatient/${obs.id}/referral`, { ...draft.body, destination: 'Hospital Escuela', condition: 'Estable' })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    // La demo ya trae REF-AAAA-0001 (la observación referida ayer)
    assert.match(r.body.number, /^REF-\d{4}-0002$/)
    assert.equal(r.body.data.destination, 'Hospital Escuela')
    const file = (await asi.get(`/api/inpatient/${obs.id}`)).body
    assert.equal(file.hospitalization.status, 'discharged')
    assert.equal(file.hospitalization.outcome, 'referred')
    assert.equal(file.referrals.length, 1)
    assert.ok(!(await doc.get('/api/bootstrap')).body.inpatients.some((h: any) => h.id === obs.id), 'sale de la lista de observación')
    assert.equal((await asi.get(`/api/referrals/${r.body.id}`)).status, 200, 'la asistente la ve e imprime')
    assert.equal((await doc.post(`/api/inpatient/${obs.id}/referral`, draft.body)).status, 409, 'no se emite otra mientras siga vigente')
    assert.equal((await doc.post(`/api/referrals/${r.body.id}/void`, { reason: 'Destino equivocado' })).status, 200)
    const again = await doc.post(`/api/inpatient/${obs.id}/referral`, { ...draft.body, destination: 'Hospital San Felipe' })
    assert.equal(again.status, 201)
    assert.match(again.body.number, /-0003$/)
  })
})

describe('P7 zona horaria', () => {
  test('el servidor usa la hora de Honduras aunque la máquina esté en UTC', async () => {
    const before = process.env.TZ
    process.env.TZ = 'UTC'
    await import(`./tz.js?${Date.now()}`)
    assert.equal(process.env.TZ, 'America/Tegucigalpa')
    assert.equal(new Date('2026-10-27T00:30:00Z').getHours(), 18, '00:30 UTC del 27 son las 18:30 del 26 en Honduras')
    process.env.TZ = before
  })
  test('la demo del consultorio cargada en UTC se corrige: la observación queda a las 08:30 del día en que se cargó', async () => {
    const { fixOfficeDemoTimes } = await import('./db.js')
    const loaded = new Date('2026-10-27T00:35:00.000Z') // 18:35 del 26 en Honduras
    // Estado en producción: "hoy" fue el 27 (UTC) y 08:30 se leyó como UTC
    await sql.run(`UPDATE clinics SET created_at = ? WHERE id = 'c-al'`, [loaded.toISOString()])
    await sql.run(`UPDATE appointments SET start = '2026-10-27T08:00:00' WHERE id = 'c201'`)
    await sql.run(`UPDATE appointments SET start = '2026-10-27T08:30:00' WHERE id = 'c202'`)
    await sql.run(`UPDATE consultations SET date = '2026-10-27T08:30:00.000Z' WHERE id = 'k-r5-1'`)
    await sql.run(`UPDATE hospitalizations SET admitted_at = '2026-10-27T08:30:00.000Z' WHERE id = 'h-k-r5-1'`)
    await sql.tx((q) => fixOfficeDemoTimes(q))
    assert.equal((await sql.one(`SELECT start FROM appointments WHERE id = 'c202'`))!.start, '2026-10-26T08:30:00')
    assert.equal((await sql.one(`SELECT date FROM consultations WHERE id = 'k-r5-1'`))!.date, '2026-10-26T14:30:00.000Z', '08:30 de Honduras')
    assert.equal((await sql.one(`SELECT admitted_at FROM hospitalizations WHERE id = 'h-k-r5-1'`))!.admitted_at, '2026-10-26T14:30:00.000Z')
    // Idempotente
    await sql.tx((q) => fixOfficeDemoTimes(q))
    assert.equal((await sql.one(`SELECT date FROM consultations WHERE id = 'k-r5-1'`))!.date, '2026-10-26T14:30:00.000Z')
  })
})
