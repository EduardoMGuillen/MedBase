import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb } from './db.js'
import { createSql, type Sql } from './sql.js'
import { parseDecimal, vitalLevel } from '../src/lib/vitals.js'
import { age } from '../src/lib/format.js'

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
async function as(email: string) {
  const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: DEMO_PASSWORD }) })
  const cookie = res.headers.get('set-cookie')?.split(';')[0] ?? ''
  const call = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(`${base}${path}`, { method, headers: { cookie, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    return { status: r.status, body: await r.json() as any }
  }
  return { get: (p: string) => call('GET', p), post: (p: string, b?: unknown) => call('POST', p, b), patch: (p: string, b: unknown) => call('PATCH', p, b) }
}


describe('E1 preclínica', () => {
  test('rangos: 120 no alerta, 170 fuera de rango, 10 imposible', () => {
    assert.equal(vitalLevel('systolic', 120, 40), 'ok')
    assert.equal(vitalLevel('systolic', 170, 40), 'warn')
    assert.equal(vitalLevel('systolic', 10, 40), 'error')
    assert.equal(vitalLevel('temperature', 38, 40), 'warn')
    assert.equal(vitalLevel('temperature', 37.9, 40), 'ok')
    assert.equal(vitalLevel('spo2', 89, 40), 'warn')
    assert.equal(vitalLevel('heartRate', 900, 40), 'error')
    // Un lactante con 140 lpm está en rango; un adulto no
    assert.equal(vitalLevel('heartRate', 140, 0), 'ok')
    assert.equal(vitalLevel('heartRate', 140, 30), 'warn')
  })
  test('decimales con punto o coma', () => {
    assert.equal(parseDecimal('37,5'), 37.5)
    assert.equal(parseDecimal('37.5'), 37.5)
    assert.equal(parseDecimal(''), undefined)
    assert.ok(Number.isNaN(parseDecimal('3a')!))
  })
  test('un valor improbable confirmado se guarda y la glucometría acepta decimales', async () => {
    const n = await as('crios@demo.clinara')
    const r = await n.post('/api/vitals', { patientId: 'p6', appointmentId: 'a4', systolic: 10, diastolic: 80, glucose: 98.6, temperature: 37.5 })
    assert.equal(r.status, 201)
    assert.equal(r.body.glucose, 98.6)
    assert.equal(r.body.painScale, undefined)
  })
})

describe('M5 identidad', () => {
  test('la reserva en línea guarda la identidad y la receta la toma del expediente', async () => {
    const d = new Date(); d.setDate(d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const slots = await (await fetch(`${base}/api/public/santa-brigida/slots?doctorId=s-herrera&date=${date}`)).json() as { slots: string[] }
    const r = await fetch(`${base}/api/public/santa-brigida/book`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ doctorId: 's-herrera', date, time: slots.slots.at(-1), firstName: 'Lesbia', lastName: 'Ponce', birthDate: '1980-02-02', sex: 'F', phone: '9555-1212', dni: '0801-1980-55555', reason: 'Control general' }) })
    assert.equal(r.status, 201)
    const doc = await as('lherrera@demo.clinara')
    const boot = await doc.get('/api/bootstrap')
    assert.equal(boot.body.patients.find((p: any) => p.lastName === 'Ponce')?.dni, '0801-1980-55555')
  })
  test('un menor sin identidad guarda los datos del responsable', async () => {
    const rec = await as('smejia@demo.clinara')
    const r = await rec.post('/api/patients', { firstName: 'Luis', lastName: 'Ponce', birthDate: '2021-03-03', sex: 'M', phone: '9555-1212', guardianName: 'Lesbia Ponce', guardianDni: '0801-1980-55555', guardianRelation: 'Madre' })
    assert.equal(r.status, 201)
    const boot = await rec.get('/api/bootstrap')
    assert.equal(boot.body.patients.find((p: any) => p.id === r.body.id)?.guardianDni, '0801-1980-55555')
  })
})

describe('M1 tarjeta de consulta externa', () => {
  test('la edad se escribe en singular o plural y en días antes del mes', () => {
    const now = new Date('2026-10-25T10:00:00')
    assert.equal(age('2026-09-20', now), '1 mes')
    assert.equal(age('2026-07-01', now), '3 meses')
    assert.equal(age('2026-10-13', now), '12 días')
    assert.equal(age('2026-10-24', now), '1 día')
    assert.equal(age('2024-10-01', now), '2 años')
    assert.equal(age('', now), '')
  })
})

describe('H5 el médico aplica medicamentos', () => {
  test('el médico registra una dosis y queda a su nombre', async () => {
    const doc = await as('lherrera@demo.clinara')
    const boot = await doc.get('/api/bootstrap')
    let prn: any
    for (const h of boot.body.inpatients) {
      prn ??= (await doc.get(`/api/inpatient/${h.id}`)).body.meds.find((m: any) => m.prn && !m.stoppedAt)
    }
    assert.ok(prn, 'la demo tiene un PRN activo')
    const r = await doc.post(`/api/inpatient/meds/${prn.id}/doses`, { status: 'given' })
    assert.equal(r.status, 201)
    assert.equal(r.body.givenBy, 's-herrera')
    // Recepción sigue sin poder
    const rec = await as('smejia@demo.clinara')
    assert.equal((await rec.post(`/api/inpatient/meds/${prn.id}/doses`, { status: 'given' })).status, 403)
  })
})

describe('R3 filtros de la biblioteca', () => {
  test('el índice trae última consulta, próxima cita, seguimientos y estado para todos los roles', async () => {
    const rec = await as('smejia@demo.clinara')
    const r = await rec.get('/api/patients/index')
    assert.equal(r.status, 200)
    const maria = r.body.find((x: any) => x.patientId === 'p1')
    assert.ok(maria.lastConsultAt, 'María José tiene consultas')
    assert.equal(maria.lastDoctorId, 's-herrera')
    assert.ok(r.body.some((x: any) => x.status === 'hospital'), 'hay hospitalizados en la demo')
    assert.ok(r.body.some((x: any) => x.followups.some((f: any) => f.kind === 'chronic')))
    const admin = await as('admin@demo.clinara')
    assert.equal((await admin.get('/api/patients/index')).status, 200)
  })
})

describe('R2 agendar sin que el paciente exista', () => {
  const nextWeekday = (dow: number) => {
    const d = new Date(); d.setDate(d.getDate() + 1)
    while (d.getDay() !== dow) d.setDate(d.getDate() + 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  test('paciente nuevo con nombre y teléfono, sin motivo ni tipo; dos citas a la misma hora', async () => {
    const rec = await as('smejia@demo.clinara')
    const date = nextWeekday(2)
    const a = await rec.post('/api/appointments', { newPatient: { firstName: 'Pedro', lastName: 'Nuevo', phone: '9111-2222' }, doctorId: 's-herrera', start: `${date}T09:00` })
    assert.equal(a.status, 201)
    assert.equal(a.body.reason, '')
    assert.equal(a.body.type, 'first')
    const b = await rec.post('/api/appointments', { patientId: 'p2', doctorId: 's-herrera', start: `${date}T09:00` })
    assert.equal(b.status, 201, 'se permite otra cita a la misma hora')
    const boot = await rec.get('/api/bootstrap')
    const pedro = boot.body.patients.find((p: any) => p.id === a.body.patientId)
    assert.equal(pedro.pending, true)
    assert.match(pedro.record, /^PEND-/)
  })
  test('la hora debe estar dentro del horario del médico', async () => {
    const rec = await as('smejia@demo.clinara')
    const r = await rec.post('/api/appointments', { patientId: 'p2', doctorId: 's-zuniga', start: `${nextWeekday(2)}T10:00` })
    assert.equal(r.status, 409)
    assert.match(r.body.error, /no atiende los martes/)
    const late = await rec.post('/api/appointments', { patientId: 'p2', doctorId: 's-paz', start: `${nextWeekday(1)}T16:00` })
    assert.equal(late.status, 409)
    assert.match(late.body.error, /fuera del horario/)
  })
  test('al llegar se completa el registro (o se une a un expediente existente) y no se duplica', async () => {
    const rec = await as('smejia@demo.clinara')
    const d = new Date()
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    // Un médico que atiende todos los días, para poder probar la llegada hoy
    const admin = await as('admin@demo.clinara')
    const all = Object.fromEntries(['0', '1', '2', '3', '4', '5', '6'].map((x) => [x, [{ start: '00:00', end: '23:45' }]]))
    assert.equal((await admin.patch('/api/staff/s-zuniga/schedule', { slot: 15, week: all })).status, 200)
    const a = await rec.post('/api/appointments', { newPatient: { firstName: 'Rosa', lastName: 'Duplicada', phone: '9433-5532' }, doctorId: 's-zuniga', start: `${today}T00:15` })
    assert.equal(a.status, 201)
    assert.equal((await rec.post(`/api/appointments/${a.body.id}/status`, { status: 'arrived' })).status, 409, 'primero el registro')
    // Era Rosa Elena (p9): la cita pasa a su expediente y el pendiente no se borra
    const m = await rec.post(`/api/patients/${a.body.patientId}/complete`, { mergeInto: 'p9' })
    assert.equal(m.status, 200)
    assert.equal(m.body.id, 'p9')
    const boot = await rec.get('/api/bootstrap')
    assert.equal(boot.body.appointments.find((x: any) => x.id === a.body.id).patientId, 'p9')
    assert.ok(!boot.body.patients.some((p: any) => p.id === a.body.patientId), 'el pendiente unido ya no aparece')
    assert.equal((await rec.post(`/api/appointments/${a.body.id}/status`, { status: 'arrived' })).status, 200)
    // Paciente realmente nuevo: recibe número de expediente
    const n = await rec.post('/api/appointments', { newPatient: { firstName: 'Tomás', lastName: 'Primera Vez', phone: '9000-0001' }, doctorId: 's-zuniga', start: `${today}T00:30` })
    const c = await rec.post(`/api/patients/${n.body.patientId}/complete`, { firstName: 'Tomás', lastName: 'Primera Vez', birthDate: '1990-01-01', sex: 'M', phone: '9000-0001' })
    assert.equal(c.status, 200)
    assert.match(c.body.record, /^EXP-\d+$/)
  })
  test('cada médico edita su horario; otro rol no', async () => {
    const paz = await as('apaz@demo.clinara')
    assert.equal((await paz.patch('/api/staff/s-paz/schedule', { slot: 30, week: { '1': [{ start: '08:00', end: '12:00' }, { start: '14:00', end: '17:00' }] } })).status, 200)
    assert.equal((await paz.patch('/api/staff/s-herrera/schedule', { slot: 30, week: { '1': [{ start: '08:00', end: '12:00' }] } })).status, 403)
    assert.equal((await paz.patch('/api/staff/s-paz/schedule', { slot: 30, week: { '1': [{ start: '08:00', end: '12:00' }, { start: '11:00', end: '17:00' }] } })).status, 400, 'franjas cruzadas')
    const nurse = await as('crios@demo.clinara')
    assert.equal((await nurse.patch('/api/staff/s-paz/schedule', { slot: 30, week: { '1': [{ start: '08:00', end: '12:00' }] } })).status, 403)
  })
})

describe('M1 atender al paciente de otro médico', () => {
  test('sólo uno lo obtiene y queda registrado a quién estaba asignado', async () => {
    const paz = await as('apaz@demo.clinara')
    const her = await as('lherrera@demo.clinara')
    // a3: María José, lista para consulta con la Dra. Herrera en la demo
    const before = (await paz.get('/api/bootstrap')).body.appointments.find((a: any) => a.id === 'a3')
    assert.equal(before.status, 'triaged')
    assert.equal((await paz.post('/api/appointments/a3/take', { fromDoctorId: 's-zuniga' })).status, 409, 'el médico que vio no coincide')
    const [r1, r2] = await Promise.all([paz.post('/api/appointments/a3/take', { fromDoctorId: 's-herrera' }), her.post('/api/appointments/a3/take', { fromDoctorId: 's-herrera' })])
    assert.equal(r1.status, 200)
    assert.equal(r2.status, 409)
    assert.equal(r1.body.doctorId, 's-paz')
    assert.equal(r1.body.reassignedFrom, 's-herrera')
    const nurse = await as('crios@demo.clinara')
    assert.equal((await nurse.post('/api/appointments/a3/take', { fromDoctorId: 's-paz' })).status, 403)
    // La consulta queda firmada por quien la atendió
    const signed = await paz.post('/api/consultations', { appointmentId: 'a3', reason: 'Faringitis', diagnoses: [{ code: 'J02.9', label: 'Faringitis aguda' }], orders: ['Líquidos abundantes.'] })
    assert.equal(signed.status, 201)
  })
})
