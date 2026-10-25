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
    assert.equal((await her.post('/api/appointments/a3/take', { fromDoctorId: 's-herrera' })).status, 409, 'no se toma la propia cita')
    // El Dr. Paz y la Dra. Zúniga la toman al mismo tiempo: sólo uno la obtiene (el orden no está garantizado)
    const zun = await as('mzuniga@demo.clinara')
    const [r1, r2] = await Promise.all([paz.post('/api/appointments/a3/take', { fromDoctorId: 's-herrera' }), zun.post('/api/appointments/a3/take', { fromDoctorId: 's-herrera' })])
    assert.deepEqual([r1.status, r2.status].sort(), [200, 409], 'sólo uno de los dos la obtiene')
    const won = r1.status === 200 ? r1 : r2
    assert.equal(won.body.reassignedFrom, 's-herrera')
    // Para seguir la prueba, la cita queda con el Dr. Paz
    if (won.body.doctorId !== 's-paz') {
      const back = await zun.post('/api/consultations', { appointmentId: 'a3', reason: 'Faringitis', diagnoses: [{ code: 'J02.9', label: 'Faringitis aguda' }], orders: ['Líquidos abundantes.'] })
      assert.equal(back.status, 201)
      return
    }
    const nurse = await as('crios@demo.clinara')
    assert.equal((await nurse.post('/api/appointments/a3/take', { fromDoctorId: 's-paz' })).status, 403)
    // La consulta queda firmada por quien la atendió
    const signed = await paz.post('/api/consultations', { appointmentId: 'a3', reason: 'Faringitis', diagnoses: [{ code: 'J02.9', label: 'Faringitis aguda' }], orders: ['Líquidos abundantes.'] })
    assert.equal(signed.status, 201)
  })
})

describe('M2 plan y manejo', () => {
  test('se firma con sólo un medicamento o sólo una indicación; las indicaciones quedan aparte', async () => {
    const admin = await as('admin@demo.clinara')
    const all = Object.fromEntries(['0', '1', '2', '3', '4', '5', '6'].map((d) => [d, [{ start: '00:00', end: '23:45' }]]))
    await admin.patch('/api/staff/s-herrera/schedule', { slot: 15, week: all })
    const rec = await as('smejia@demo.clinara')
    const d = new Date(); const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const doc = await as('lherrera@demo.clinara')
    const sign = async (time: string, body: object) => {
      const a = await rec.post('/api/appointments', { patientId: 'p2', doctorId: 's-herrera', start: `${day}T${time}` })
      await doc.post(`/api/appointments/${a.body.id}/status`, { status: 'in_consult' })
      return doc.post('/api/consultations', { appointmentId: a.body.id, reason: 'Control', diagnoses: [{ code: 'I10', label: 'HTA' }], ...body })
    }
    const onlyMed = await sign('23:00', { items: [{ drug: 'Losartán', presentation: 'Tableta 50 mg', dose: '1 tableta', route: 'Oral', frequency: 'Cada 24 horas', duration: '30 días', quantity: '30 tabletas' }],
      orders: ['Losartán (tableta 50 mg): 1 tableta vía oral cada 24 horas por 30 días.'], indications: [] })
    assert.equal(onlyMed.status, 201)
    const rx = await doc.get(`/api/prescriptions/${onlyMed.body.prescriptionId}`)
    assert.equal(rx.body.prescription.items[0].quantity, '30 tabletas')
    const onlyIndication = await sign('23:15', { orders: ['Disminuir ingesta de sal.'], indications: ['Disminuir ingesta de sal.'] })
    assert.equal(onlyIndication.status, 201)
    const c = await doc.get(`/api/consultations/${onlyIndication.body.consultationId}`)
    assert.deepEqual(c.body.consultation.indications, ['Disminuir ingesta de sal.'])
    const none = await sign('23:30', { orders: [], indications: [] })
    assert.equal(none.status, 400)
  })
})

describe('M3 vademécum de la clínica', () => {
  test('el médico agrega, no se duplica, otro médico lo ve y administración lo desactiva', async () => {
    const doc = await as('lherrera@demo.clinara')
    const a = await doc.post('/api/drugs', { name: 'Dexametasona', presentation: 'Ampolla', concentration: '4 mg/ml', route: 'Intramuscular' })
    assert.equal(a.status, 201)
    const again = await doc.post('/api/drugs', { name: '  DEXAMETASÓNA ', presentation: 'ampolla', concentration: '4 mg/ml' })
    assert.equal(again.body.id, a.body.id, 'mismo medicamento escrito distinto')
    assert.equal((await doc.post('/api/drugs', { name: 'acetaminofen', presentation: 'Tableta', concentration: '500 mg' })).status, 409)
    const paz = await as('apaz@demo.clinara')
    assert.ok((await paz.get('/api/bootstrap')).body.clinicDrugs.some((d: any) => d.id === a.body.id))
    assert.equal((await paz.patch(`/api/drugs/${a.body.id}`, { active: false })).status, 403)
    const admin = await as('admin@demo.clinara')
    const off = await admin.patch(`/api/drugs/${a.body.id}`, { active: false })
    assert.equal(off.body.active, false)
    // Otra clínica no lo ve
    const other = await as('erosales@demo.clinara')
    assert.ok(!(await other.get('/api/drugs')).body.some((d: any) => d.id === a.body.id))
  })
})

describe('M7 recetas sin consulta', () => {
  test('el médico emite una receta sin consulta; enfermería y recepción no', async () => {
    const doc = await as('lherrera@demo.clinara')
    const item = { drug: 'Losartán', presentation: 'Tableta 50 mg', dose: '1 tableta', route: 'Oral', frequency: 'Cada 24 horas', duration: '90 días' }
    const r = await doc.post('/api/prescriptions', { patientId: 'p2', items: [item], indications: ['Control en 3 meses.'] })
    assert.equal(r.status, 201)
    const rx = await doc.get(`/api/prescriptions/${r.body.prescriptionId}`)
    assert.equal(rx.body.prescription.standalone, true)
    assert.deepEqual(rx.body.prescription.indications, ['Control en 3 meses.'])
    const chart = await doc.get('/api/patients/p2/chart')
    assert.ok(chart.body.prescriptions.some((x: any) => x.id === r.body.prescriptionId), 'queda en el expediente')
    // Adulto sin identidad: la receta la exige
    assert.equal((await doc.post('/api/prescriptions', { patientId: 'p7', items: [item] })).status, 400)
    const nurse = await as('crios@demo.clinara')
    assert.equal((await nurse.post('/api/prescriptions', { patientId: 'p2', items: [item] })).status, 403)
    const rec = await as('smejia@demo.clinara')
    assert.equal((await rec.post('/api/prescriptions', { patientId: 'p2', items: [item] })).status, 403)
  })
})

describe('M4 constancias', () => {
  test('se emiten con número correlativo, sin diagnóstico por defecto, y se anulan en vez de editarse', async () => {
    const doc = await as('lherrera@demo.clinara')
    const base = { patientId: 'p2', consultationId: 'c2', to: 'A quien corresponda', visitDate: '2026-10-20' }
    const a = await doc.post('/api/certificates', { ...base, kind: 'rest', restDays: 3, restFrom: '2026-10-20' })
    assert.equal(a.status, 201)
    assert.match(a.body.number, /^CM-\d{4}-\d{4}$/)
    assert.equal(a.body.data.restTo, '2026-10-22')
    assert.equal(a.body.data.diagnoses, undefined, 'el diagnóstico no va salvo que se marque')
    assert.equal(a.body.data.doctor.license, 'CMH-08812')
    const b = await doc.post('/api/certificates', { ...base, kind: 'attention', fromTime: '08:00', toTime: '08:40', includeDx: true })
    assert.deepEqual(b.body.data.diagnoses, ['Diabetes mellitus tipo 2 sin complicaciones'])
    assert.equal(Number(b.body.number.split('-')[2]), Number(a.body.number.split('-')[2]) + 1)
    const comp = await doc.post('/api/certificates', { ...base, kind: 'companion', companion: { name: 'Lilian Banegas', relation: 'Esposa' } })
    assert.equal(comp.status, 201)
    assert.equal((await doc.post('/api/certificates', { ...base, kind: 'free', text: 'corto' })).status, 400)
    const v = await doc.post(`/api/certificates/${a.body.id}/void`, { reason: 'Días equivocados' })
    assert.ok(v.body.voidedAt)
    assert.equal((await doc.post(`/api/certificates/${a.body.id}/void`, { reason: 'Otra vez' })).status, 409)
    const list = await doc.get('/api/patients/p2/certificates')
    assert.ok(list.body.length >= 3)
    const nurse = await as('crios@demo.clinara')
    assert.equal((await nurse.post('/api/certificates', { ...base, kind: 'rest', restDays: 1 })).status, 403)
    assert.equal((await nurse.get(`/api/certificates/${b.body.id}`)).status, 200, 'enfermería puede verla en el expediente')
    const rec = await as('smejia@demo.clinara')
    assert.equal((await rec.get(`/api/certificates/${b.body.id}`)).status, 403)
  })
})

describe('H2 nota de procedimiento', () => {
  test('fecha y hora obligatorias y no futuras; sin autorización sólo como urgencia justificada', async () => {
    const doc = await as('lherrera@demo.clinara')
    const h = (await doc.get('/api/bootstrap')).body.inpatients[0]
    const at = new Date(Date.now() - 2 * 3_600_000).toISOString()
    const base = { name: 'Sonda vesical', text: 'Se coloca sonda Foley 16 Fr sin complicaciones.' }
    assert.equal((await doc.post(`/api/inpatient/${h.id}/procedure-notes`, base)).status, 400, 'sin hora')
    assert.equal((await doc.post(`/api/inpatient/${h.id}/procedure-notes`, { ...base, performedAt: new Date(Date.now() + 3_600_000).toISOString() })).status, 400, 'futura')
    assert.equal((await doc.post(`/api/inpatient/${h.id}/procedure-notes`, { ...base, performedAt: at })).status, 409, 'sin autorización')
    const ok = await doc.post(`/api/inpatient/${h.id}/procedure-notes`, { ...base, performedAt: at, urgent: true, justification: 'Retención urinaria aguda.' })
    assert.equal(ok.status, 201)
    assert.equal(ok.body.kind, 'procedure')
    assert.equal(ok.body.procedure.performedAt, at)
    assert.notEqual(ok.body.at, at, 'la hora de la nota es la de escritura')
    const nurse = await as('crios@demo.clinara')
    assert.equal((await nurse.post(`/api/inpatient/${h.id}/procedure-notes`, { ...base, performedAt: at, urgent: true, justification: 'x'.repeat(12) })).status, 403)
  })
  test('los procedimientos registrados antes se conservan', async () => {
    const doc = await as('lherrera@demo.clinara')
    const boot = (await doc.get('/api/bootstrap')).body
    let legacy = 0
    for (const h of boot.inpatients) legacy += (await doc.get(`/api/inpatient/${h.id}`)).body.procedures.length
    assert.ok(legacy > 0)
  })
})

describe('H1 órdenes médicas como checklist', () => {
  test('enfermería marca y desmarca con motivo; las alertas bajan; el médico no marca', async () => {
    const doc = await as('lherrera@demo.clinara')
    const nurse = await as('crios@demo.clinara')
    const h = (await doc.get('/api/bootstrap')).body.inpatients[0]
    const before = (await nurse.get('/api/bootstrap')).body.pendingOrders.length
    const note = await doc.post(`/api/inpatient/${h.id}/notes`, { kind: 'evolution', subjective: 'S', objective: 'O', assessment: 'A', plan: 'P', orders: ['Dieta blanda.', 'Signos vitales cada 4 horas.'] })
    assert.equal(note.status, 201)
    assert.equal(note.body.checklist, true)
    const boot = (await nurse.get('/api/bootstrap')).body
    assert.equal(boot.pendingOrders.length, before + 1)
    assert.equal(boot.pendingOrders.find((x: any) => x.noteId === note.body.id).pending, 2)
    assert.equal((await doc.post(`/api/inpatient/notes/${note.body.id}/orders/0/review`, { checked: true })).status, 403)
    const m = await nurse.post(`/api/inpatient/notes/${note.body.id}/orders/0/review`, { checked: true })
    assert.equal(m.status, 201)
    assert.equal(m.body.by, 's-rios')
    assert.equal((await nurse.post(`/api/inpatient/notes/${note.body.id}/orders/0/review`, { checked: false })).status, 400, 'desmarcar pide motivo')
    assert.equal((await nurse.post(`/api/inpatient/notes/${note.body.id}/orders/0/review`, { checked: false, reason: 'Marcada por error' })).status, 201)
    await nurse.post(`/api/inpatient/notes/${note.body.id}/orders/0/review`, { checked: true })
    await nurse.post(`/api/inpatient/notes/${note.body.id}/orders/1/review`, { checked: true })
    assert.ok(!(await nurse.get('/api/bootstrap')).body.pendingOrders.some((x: any) => x.noteId === note.body.id), 'la alerta desaparece')
    assert.equal((await nurse.post(`/api/inpatient/notes/${note.body.id}/orders/5/review`, { checked: true })).status, 400)
    const file = (await nurse.get(`/api/inpatient/${h.id}`)).body
    assert.equal(file.marks.filter((x: any) => x.noteId === note.body.id).length, 4, 'cada marca queda guardada')
  })
})

describe('H3 autorizaciones', () => {
  test('el médico la crea; enfermería sube la hoja firmada; el procedimiento la reconoce', async () => {
    const doc = await as('lherrera@demo.clinara')
    const nurse = await as('crios@demo.clinara')
    const h = (await doc.get('/api/bootstrap')).body.inpatients[1]
    assert.equal((await nurse.post(`/api/inpatient/${h.id}/authorizations`, { template: 'general' })).status, 403, 'enfermería no la crea')
    assert.equal((await doc.post(`/api/inpatient/${h.id}/authorizations`, { template: 'procedure', procedure: 'Paracentesis' })).status, 400, 'falta explicar riesgos')
    const a = await doc.post(`/api/inpatient/${h.id}/authorizations`, { template: 'procedure', procedure: 'Paracentesis', description: 'Sacar líquido del abdomen.', risks: 'Dolor, sangrado.' })
    assert.equal(a.status, 201)
    assert.equal(a.body.status, 'pending')
    assert.ok(a.body.data.doctor.license)
    assert.equal((await nurse.post(`/api/authorizations/${a.body.id}/status`, { status: 'signed' })).status, 400, 'sin la hoja firmada')
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64').toString('base64')
    const file = await nurse.post(`/api/patients/${h.patientId}/attachments`, { name: 'firma.png', mime: 'image/png', category: 'document', data: png, title: 'Autorización', takenAt: new Date().toISOString(), hospitalizationId: h.id })
    const signed = await nurse.post(`/api/authorizations/${a.body.id}/status`, { status: 'signed', fileId: file.body.id })
    assert.equal(signed.body.status, 'signed')
    assert.equal(signed.body.statusBy, 's-rios')
    const note = await doc.post(`/api/inpatient/${h.id}/procedure-notes`, { name: 'Paracentesis', performedAt: new Date().toISOString(), text: 'Se extraen 2 litros de líquido citrino.', authorizationId: a.body.id })
    assert.equal(note.status, 201)
    const rev = await doc.post(`/api/authorizations/${a.body.id}/status`, { status: 'revoked', note: 'El paciente la revoca' })
    assert.equal(rev.body.status, 'revoked')
    const minor = (await doc.get('/api/bootstrap')).body.inpatients.find((x: any) => x.patientId === 'p19')
    if (minor) assert.equal((await doc.post(`/api/inpatient/${minor.id}/authorizations`, { template: 'general' })).status, 400, 'menor sin representante')
  })
})

describe('M6 observación', () => {
  test('la consulta ingresa a observación; sin enfermería; pasa a hospitalización con todo su expediente', async () => {
    const admin = await as('admin@demo.clinara')
    const all = Object.fromEntries(['0', '1', '2', '3', '4', '5', '6'].map((d) => [d, [{ start: '00:00', end: '23:45' }]]))
    await admin.patch('/api/staff/s-herrera/schedule', { slot: 15, week: all })
    const nurse = await as('crios@demo.clinara')
    const doc = await as('lherrera@demo.clinara')
    const w = await nurse.post('/api/appointments/walk-in', { patientId: 'p18', doctorId: 's-herrera', reason: 'Mareo' })
    await doc.post(`/api/appointments/${w.body.id}/status`, { status: 'in_consult' })
    const c = await doc.post('/api/consultations', { appointmentId: w.body.id, reason: 'Mareo', diagnoses: [{ code: 'I16.9', label: 'Crisis hipertensiva' }], orders: ['Reposo.'], observe: true })
    assert.equal(c.status, 201)
    assert.ok(c.body.observationId)
    const obs = (await doc.get(`/api/inpatient/${c.body.observationId}`)).body
    assert.equal(obs.hospitalization.kind, 'observation')
    assert.equal(obs.hospitalization.consultationId, c.body.consultationId)
    assert.equal(obs.hospitalization.bedId, undefined)
    // Primera nota: la de consulta; se evoluciona sin nota de ingreso y sin checklist
    const note = await doc.post(`/api/inpatient/${c.body.observationId}/notes`, { kind: 'evolution', subjective: 'S', objective: 'O', assessment: 'A', plan: 'P', orders: ['Signos vitales cada hora.'],
      meds: [{ drug: 'Captopril', dose: '25 mg', route: 'Sublingual', prn: false }] })
    assert.equal(note.status, 201)
    assert.equal(note.body.checklist, undefined)
    assert.equal((await nurse.post(`/api/inpatient/${c.body.observationId}/nursing`, { text: 'Paciente tranquilo.' })).status, 409)
    const med = (await nurse.get(`/api/inpatient/${c.body.observationId}`)).body.meds[0]
    assert.equal((await nurse.post(`/api/inpatient/meds/${med.id}/doses`, { scheduledAt: med.firstAt })).status, 201, 'enfermería aplica en observación')
    const rec = await as('smejia@demo.clinara')
    assert.equal((await rec.get(`/api/inpatient/${c.body.observationId}`)).status, 403)
    assert.ok((await rec.get('/api/bootstrap')).body.stays.some((x: any) => x.patientId === 'p18' && x.kind === 'observation'))
    // Pasar a hospitalización
    const boot = (await doc.get('/api/bootstrap')).body
    const used = new Set(boot.inpatients.map((h: any) => h.bedId))
    const bed = boot.beds.find((b: any) => b.active && !used.has(b.id))
    const conv = await doc.post(`/api/inpatient/${c.body.observationId}/convert`, { bedId: bed.id })
    assert.equal(conv.status, 200)
    assert.equal(conv.body.kind, 'hospital')
    assert.ok(conv.body.observationAt)
    const hosp = (await doc.get(`/api/inpatient/${c.body.observationId}`)).body
    assert.equal(hosp.notes.length, 1)
    assert.equal(hosp.doses.length, 1)
    assert.equal((await doc.post(`/api/inpatient/${c.body.observationId}/convert`, { bedId: bed.id })).status, 409)
  })
})
