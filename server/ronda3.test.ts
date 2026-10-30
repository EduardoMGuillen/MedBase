import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import zlib from 'node:zlib'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb, migrateLabsToExams, migrateRxValidity } from './db.js'
import { createSql, type Sql } from './sql.js'
import { filterSummary, periodRange, type Filters } from '../src/lib/patientFilters.js'
import { alertQuery, alertSummary, fileAlerts, tabCounts } from '../src/lib/alerts.js'
import { bandOf } from '../src/lib/vitalsSheet.js'
import { typedExam } from '../src/lib/exams.js'

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
export async function login(baseUrl: string, email: string, password = DEMO_PASSWORD) {
  const res = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })
  const cookie = res.headers.get('set-cookie')?.split(';')[0] ?? ''
  const call = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(`${baseUrl}${path}`, { method, headers: { cookie, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const text = await r.text()
    let parsed: any = text
    try { parsed = JSON.parse(text) } catch { /* no es JSON */ }
    return { status: r.status, body: parsed }
  }
  return {
    get: (p: string) => call('GET', p), post: (p: string, b?: unknown) => call('POST', p, b), patch: (p: string, b: unknown) => call('PATCH', p, b),
    put: (p: string, b: unknown) => call('PUT', p, b), del: (p: string) => call('DELETE', p),
  }
}
const as = (email: string) => login(base, email)

const DX = [{ code: 'CA40', label: 'Neumonía', system: 'icd11' }]
let seq = 0
/** Paciente nuevo, con identidad, en la consulta externa de hoy de la Dra. Herrera y ya en consulta. */
async function walkIn(name = 'Prueba') {
  const nurse = await as('crios@demo.clinara')
  const doc = await as('lherrera@demo.clinara')
  const p = await nurse.post('/api/patients', { firstName: name, lastName: 'Ronda Tres', birthDate: '1980-01-01', sex: 'M', phone: '9999-1111',
    dni: `0801-1980-${String(++seq * 37 + 1000).padStart(5, '0')}` })
  assert.equal(p.status, 201, JSON.stringify(p.body))
  const w = await nurse.post('/api/appointments/walk-in', { patientId: p.body.id, doctorId: 's-herrera', reason: 'Control' })
  await doc.post(`/api/appointments/${w.body.id}/status`, { status: 'in_consult' })
  return { doc, nurse, apptId: String(w.body.id), patientId: String(p.body.id) }
}
const RX = [{ drug: 'Amoxicilina', presentation: 'Cápsulas 500 mg', dose: '1 cápsula', route: 'Oral', frequency: 'Cada 8 horas', duration: '7 días' }]

describe('AD2 vigencia de recetas por médico', () => {
  test('la configuración de la clínica ya no la cambia; cada médico tiene la suya y cada receta la guarda', async () => {
    const admin = await as('admin@demo.clinara')
    const cfg = (await admin.get('/api/bootstrap')).body.settings
    const saved = await admin.put('/api/settings', { ...cfg, rxValidityDays: 90 })
    assert.equal(saved.status, 200, JSON.stringify(saved.body))
    assert.equal(saved.body.rxValidityDays, cfg.rxValidityDays)

    const { doc, apptId } = await walkIn('Vigencia')
    assert.equal((await doc.get('/api/auth/me')).body.user.prefs.rxValidityDays, 30)
    assert.equal((await doc.patch('/api/me', { rxValidityDays: 15 })).status, 200)
    assert.equal((await doc.get('/api/auth/me')).body.user.prefs.rxValidityDays, 15)
    const c = await doc.post('/api/consultations', { appointmentId: apptId, reason: 'Faringitis', diagnoses: DX, items: RX })
    assert.equal(c.status, 201, JSON.stringify(c.body))
    assert.equal((await doc.get(`/api/prescriptions/${c.body.prescriptionId}`)).body.prescription.validityDays, 15)
    // Sólo para esta receta
    const p2 = (await walkIn('Otra')).patientId
    const r = await doc.post('/api/prescriptions', { patientId: p2, items: RX, validityDays: 60 })
    assert.equal((await doc.get(`/api/prescriptions/${r.body.prescriptionId}`)).body.prescription.validityDays, 60)
    // Enfermería no tiene vigencia propia
    assert.equal((await (await as('crios@demo.clinara')).patch('/api/me', { rxValidityDays: 10 })).status, 403)
  })

  test('migración: las recetas viejas guardan la vigencia de su clínica y no se pisa la del médico', async () => {
    await sql.run(`UPDATE prescriptions SET validity_days = NULL WHERE id IN (SELECT id FROM prescriptions LIMIT 3)`)
    await migrateRxValidity(sql)
    assert.equal(Number((await sql.one('SELECT COUNT(*)::int AS n FROM prescriptions WHERE validity_days IS NULL'))!.n), 0)
    const prefs = JSON.parse(String((await sql.one(`SELECT prefs FROM staff WHERE id = 's-herrera'`))!.prefs))
    assert.equal(prefs.rxValidityDays, 15)
  })
})

/** Paciente nuevo ingresado a hospitalización desde una consulta de la Dra. Herrera (sin cama todavía). */
async function admitted(name = 'Ingreso') {
  const w = await walkIn(name)
  const c = await w.doc.post('/api/consultations', { appointmentId: w.apptId, reason: 'Dolor abdominal', history: 'Dos días con dolor en fosa ilíaca derecha.', diagnoses: DX,
    orders: ['Signos vitales cada 8 horas.'], admit: true })
  assert.equal(c.status, 201, JSON.stringify(c.body))
  return { ...w, stayId: String(c.body.hospitalizationId) }
}

describe('MC3 nota de procedimiento', () => {
  test('un procedimiento menor se guarda sin autorización; uno mayor la pide (o la urgencia)', async () => {
    const { doc, stayId } = await admitted('Procedimiento')
    const base = { name: 'Infiltración de rodilla derecha', performedAt: new Date(Date.now() - 60_000).toISOString(), text: 'Se infiltra rodilla derecha con técnica estéril, sin complicaciones.' }
    const minor = await doc.post(`/api/inpatient/${stayId}/procedure-notes`, { ...base, major: false })
    assert.equal(minor.status, 201, JSON.stringify(minor.body))
    assert.equal(minor.body.procedure.major, false)
    assert.equal((await doc.post(`/api/inpatient/${stayId}/procedure-notes`, { ...base, name: 'Laparotomía exploradora', major: true })).status, 409)
    const urgent = await doc.post(`/api/inpatient/${stayId}/procedure-notes`, { ...base, name: 'Laparotomía exploradora', major: true, urgent: true, justification: 'Abdomen agudo con choque.' })
    assert.equal(urgent.status, 201)
    assert.equal(urgent.body.procedure.urgent, true)
  })
})

describe('AD5 varios roles y vista activa', () => {
  test('la Dra. Herrera recibe Administración y cambia de vista; los permisos son los de la vista activa', async () => {
    const admin = await as('admin@demo.clinara')
    const r = await admin.patch('/api/staff/s-herrera', { roles: ['doctor', 'admin'] })
    assert.equal(r.status, 200, JSON.stringify(r.body))
    assert.deepEqual(r.body.roles, ['doctor', 'admin'])
    assert.equal(r.body.role, 'doctor')
    const doc = await as('lherrera@demo.clinara')
    let me = (await doc.get('/api/auth/me')).body
    assert.ok(!me.permissions.includes('staff.manage'))
    assert.equal((await doc.get('/api/reports?from=2026-01-01&to=2026-01-31')).status, 403)
    me = (await doc.post('/api/me/view', { role: 'admin' })).body
    assert.equal(me.user.role, 'admin')
    assert.ok(me.permissions.includes('staff.manage') && !me.permissions.includes('consult.write'))
    assert.equal((await doc.get('/api/reports?from=2026-01-01&to=2026-01-31')).status, 200)
    // La vista se recuerda en la cuenta: una sesión nueva entra en la misma vista
    assert.equal((await (await as('lherrera@demo.clinara')).get('/api/auth/me')).body.user.role, 'admin')
    // La bitácora guarda el cambio y el rol de cada acción
    const row = await sql.one(`SELECT role FROM audit WHERE user_id = 's-herrera' AND action LIKE 'Cambió a la vista de administrador%' ORDER BY id DESC LIMIT 1`)
    assert.equal(row?.role, 'admin')
    // No puede elegir un rol que no tiene
    assert.equal((await doc.post('/api/me/view', { role: 'nurse' })).status, 403)
    // Sigue en la lista de médicos aunque esté en la vista de administrador (agenda pública)
    const slug = (await sql.one(`SELECT slug FROM clinics WHERE id = 'c-sb'`))!.slug
    const pub = (await fetch(`${base}/api/public/${slug}/clinic`).then((x) => x.json())) as { doctors: { id: string }[] }
    assert.ok(pub.doctors.some((d) => d.id === 's-herrera'))
    await doc.post('/api/me/view', { role: 'doctor' })
  })

  test('siempre queda al menos una persona con Administración; nadie se quita a sí mismo ese rol', async () => {
    const admin = await as('admin@demo.clinara')
    const self = (await admin.get('/api/auth/me')).body.user
    assert.equal((await admin.patch(`/api/staff/${self.id}`, { roles: ['reception'] })).status, 400)
    // Con la Dra. Herrera como segunda administradora, a Roberto se le puede quitar; luego a ella ya no
    const doc = await as('lherrera@demo.clinara')
    await doc.post('/api/me/view', { role: 'admin' })
    assert.equal((await doc.patch(`/api/staff/${self.id}`, { roles: ['reception'] })).status, 200)
    assert.equal((await doc.patch('/api/staff/s-herrera', { roles: ['doctor'] })).status, 400)
    assert.equal((await doc.patch(`/api/staff/${self.id}`, { roles: ['admin'] })).status, 200)
    assert.equal((await admin.patch('/api/staff/s-herrera', { roles: ['doctor'] })).status, 200)
    // Dar el rol de médico pide la colegiación
    const nurse = (await sql.one(`SELECT id FROM staff WHERE email = 'crios@demo.clinara'`))!.id
    assert.equal((await admin.patch(`/api/staff/${nurse}`, { roles: ['nurse', 'doctor'] })).status, 400)
  })
})

const PNG = (c: string) => `data:image/png;base64,iVBORw0KGgo${c}AAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk`

describe('MC6 Mi configuración', () => {
  test('datos profesionales, sello y preferencias se guardan por separado; enfermería no los tiene', async () => {
    const doc = await as('lherrera@demo.clinara')
    assert.equal((await doc.patch('/api/me', { docName: 'Dra. Lucía Herrera Mejía', specialty: 'Medicina interna', stamp: PNG('s1') })).status, 200)
    assert.equal((await doc.patch('/api/me', { noteFormat: 'soap' })).status, 200)
    const me = (await doc.get('/api/auth/me')).body.user
    assert.equal(me.docName, 'Dra. Lucía Herrera Mejía')
    assert.equal(me.hasStamp, true)
    assert.equal(me.prefs.noteFormat, 'soap')
    assert.equal((await doc.get('/api/me/marks')).body.stamp, PNG('s1'))
    assert.equal((await (await as('crios@demo.clinara')).patch('/api/me', { docName: 'X' })).status, 403)
    await doc.patch('/api/me', { noteFormat: 'dx' })
  })

  test('cambiar la firma no altera la receta ya emitida (guardó su versión)', async () => {
    const doc = await as('lherrera@demo.clinara')
    assert.equal((await doc.put('/api/me/signature', { signature: PNG('a'), password: 'mala' })).status, 400)
    assert.equal((await doc.put('/api/me/signature', { signature: PNG('a'), password: DEMO_PASSWORD })).status, 200)
    const p = (await walkIn('Firma')).patientId
    const r1 = await doc.post('/api/prescriptions', { patientId: p, items: RX })
    const rx1 = (await doc.get(`/api/prescriptions/${r1.body.prescriptionId}`)).body.prescription
    assert.ok(rx1.signatureId && rx1.stampId)
    await doc.put('/api/me/signature', { signature: PNG('b'), password: DEMO_PASSWORD })
    const r2 = await doc.post('/api/prescriptions', { patientId: p, items: RX })
    const rx2 = (await doc.get(`/api/prescriptions/${r2.body.prescriptionId}`)).body.prescription
    assert.notEqual(rx1.signatureId, rx2.signatureId)
    assert.equal((await doc.get(`/api/marks/${rx1.signatureId}`)).body.image, PNG('a'))
    assert.equal((await doc.get(`/api/marks/${rx2.signatureId}`)).body.image, PNG('b'))
    // Otra clínica no la ve
    assert.equal((await (await as('erosales@demo.clinara')).get(`/api/marks/${rx1.signatureId}`)).status, 404)
  })

  test('PIN para confirmar firmas y cerrar las demás sesiones', async () => {
    const doc = await as('lherrera@demo.clinara')
    assert.equal((await doc.put('/api/me/pin', { password: DEMO_PASSWORD, pin: '12' })).status, 400)
    assert.equal((await doc.put('/api/me/pin', { password: DEMO_PASSWORD, pin: '4321' })).status, 200)
    assert.equal((await doc.get('/api/auth/me')).body.user.hasPin, true)
    const other = await as('lherrera@demo.clinara')
    assert.equal((await doc.post('/api/me/sessions/close')).status, 200)
    assert.equal((await other.get('/api/bootstrap')).status, 401)
    await doc.put('/api/me/pin', { password: DEMO_PASSWORD, pin: '' })
  })
})

describe('AD1 teléfonos y WhatsApp de la clínica', () => {
  test('varios contactos: uno principal (el de los documentos) y uno de WhatsApp; el paciente los ve en la reserva', async () => {
    const admin = await as('admin@demo.clinara')
    const cfg = (await admin.get('/api/bootstrap')).body.settings
    // Migración: el teléfono que tenía es el contacto principal
    assert.deepEqual(cfg.contacts.map((c: any) => [c.number, !!c.primary]), [[cfg.phone, true]])
    const contacts = [
      { id: 'a', number: '2232-7710', label: 'Recepción', type: 'call', primary: true },
      { id: 'b', number: '9876-5432', label: 'Citas por WhatsApp', type: 'whatsapp', whatsapp: true },
    ]
    assert.equal((await admin.put('/api/settings', { ...cfg, contacts: contacts.map((c) => ({ ...c, primary: false })) })).status, 400)
    assert.equal((await admin.put('/api/settings', { ...cfg, contacts: [contacts[0], { ...contacts[1], type: 'call' }] })).status, 400)
    const r = await admin.put('/api/settings', { ...cfg, contacts, docsWhatsapp: true })
    assert.equal(r.status, 200, JSON.stringify(r.body))
    assert.equal(r.body.phone, '2232-7710')
    assert.equal(r.body.docsWhatsapp, true)
    const pub = await fetch(`${base}/api/public/${(await sql.one(`SELECT slug FROM clinics WHERE id = 'c-sb'`))!.slug}/clinic`).then((x) => x.json()) as { contacts: { number: string }[] }
    assert.deepEqual(pub.contacts.map((c) => c.number), ['2232-7710', '9876-5432'])
    // Recepción ve los contactos pero no los edita
    const rec = await as('smejia@demo.clinara')
    assert.equal((await rec.get('/api/bootstrap')).body.settings.contacts.length, 2)
    assert.equal((await rec.put('/api/settings', { ...cfg, contacts })).status, 403)
  })
})

describe('AD3 camas libres u ocupadas; la especialidad es del ingreso', () => {
  test('el ingreso toma la especialidad del médico (editable); la cama no tiene especialidad y se libera al alta', async () => {
    const admin = await as('admin@demo.clinara')
    const bed = await admin.post('/api/beds', { room: '301', label: 'A' })
    assert.equal(bed.status, 201, JSON.stringify(bed.body))
    assert.equal(bed.body.specialty, undefined)
    const { doc, stayId } = await admitted('Cama')
    let h = (await doc.get(`/api/inpatient/${stayId}`)).body.hospitalization
    assert.equal(h.specialty, 'Medicina interna')
    const r = await doc.patch(`/api/inpatient/${stayId}`, { bedId: bed.body.id, specialty: 'Cirugía general' })
    assert.equal(r.status, 200, JSON.stringify(r.body))
    h = r.body
    assert.equal(h.specialty, 'Cirugía general')
    // Ocupada: no se puede poner fuera de servicio
    assert.equal((await admin.patch(`/api/beds/${bed.body.id}`, { active: false, outOfServiceNote: 'Mantenimiento' })).status, 409)
    const d = await doc.post(`/api/inpatient/${stayId}/discharge`, { diagnoses: DX, summary: 'Evolucionó bien, sin complicaciones.', condition: 'Mejorado' })
    assert.equal(d.status, 201, JSON.stringify(d.body))
    // Libre otra vez: ahora sí, fuera de servicio con su motivo; se renombra
    const off = await admin.patch(`/api/beds/${bed.body.id}`, { active: false, outOfServiceNote: 'Mantenimiento' })
    assert.equal(off.status, 200)
    assert.equal(off.body.outOfServiceNote, 'Mantenimiento')
    assert.equal((await admin.patch(`/api/beds/${bed.body.id}`, { room: '302' })).body.room, '302')
    // Recepción ve el estado de las camas, pero no las edita
    const rec = await as('smejia@demo.clinara')
    assert.ok((await rec.get('/api/bootstrap')).body.beds.some((b: any) => b.id === bed.body.id))
    assert.equal((await rec.patch(`/api/beds/${bed.body.id}`, { active: true })).status, 403)
  })
})

describe('AD4 vademécum', () => {
  test('administración y médicos agregan; lo edita su autor o administración; enfermería no', async () => {
    const admin = await as('admin@demo.clinara')
    const doc = await as('apaz@demo.clinara')
    const a = await doc.post('/api/drugs', { name: 'Ademetionina', brand: 'Heptral', presentation: 'Tabletas', concentration: '400 mg', route: 'Oral', usualDose: '1 tableta cada 12 horas', usualUse: 'Colestasis' })
    assert.equal(a.status, 201, JSON.stringify(a.body))
    assert.equal(a.body.usualDose, '1 tableta cada 12 horas')
    assert.equal((await (await as('mzuniga@demo.clinara')).patch(`/api/drugs/${a.body.id}`, { brand: 'X' })).status, 403)
    assert.equal((await doc.patch(`/api/drugs/${a.body.id}`, { usualUse: 'Colestasis intrahepática' })).body.usualUse, 'Colestasis intrahepática')
    assert.equal((await admin.patch(`/api/drugs/${a.body.id}`, { active: false })).body.active, false)
    assert.equal((await admin.post('/api/drugs', { name: 'Silimarina', presentation: 'Cápsulas', concentration: '140 mg' })).status, 201)
    assert.equal((await (await as('crios@demo.clinara')).post('/api/drugs', { name: 'Otra cosa' })).status, 403)
  })

  test('importar una lista salta duplicados por nombre normalizado y lo que ya está en el catálogo base', async () => {
    const admin = await as('admin@demo.clinara')
    const r = await admin.post('/api/drugs/import', { rows: [
      { name: 'Ácido ursodesoxicólico', presentation: 'Tabletas', concentration: '250 mg', route: 'Oral' },
      { name: 'ACIDO URSODESOXICOLICO ', presentation: 'tabletas', concentration: '250 mg' },
      { name: 'Acetaminofén' },
      { name: 'Silimarina', presentation: 'Cápsulas', concentration: '140 mg' },
      { name: '' },
    ] })
    assert.equal(r.status, 200, JSON.stringify(r.body))
    assert.equal(r.body.added, 1)
    assert.deepEqual(r.body.skipped.map((x: any) => x.row), [3, 4, 5, 6])
  })
})

describe('AD7 bitácora propia y de todos', () => {
  test('cada quien ve la suya (con rol y paciente); administración ve la de todos y la filtra; nadie la cambia', async () => {
    const { nurse, patientId } = await walkIn('Bitácora')
    const mine = (await nurse.get('/api/audit/mine')).body
    const nurseId = (await nurse.get('/api/auth/me')).body.user.id
    assert.ok(mine.length > 0 && mine.every((r: any) => r.userId === nurseId))
    const reg = mine.find((r: any) => r.action.startsWith('Registró al paciente Bitácora'))
    assert.equal(reg.patientId, patientId)
    assert.equal(reg.role, 'nurse')
    assert.equal(reg.kind, 'patients')
    assert.equal((await nurse.get('/api/audit')).status, 403)
    const admin = await as('admin@demo.clinara')
    const byPatient = (await admin.get(`/api/audit?patientId=${patientId}`)).body
    assert.ok(byPatient.length >= 2 && byPatient.every((r: any) => r.patientId === patientId || r.action.includes('Bitácora')))
    const byPerson = (await admin.get(`/api/audit?userId=${nurseId}&kind=agenda`)).body
    assert.ok(byPerson.length > 0 && byPerson.every((r: any) => r.userId === nurseId && r.kind === 'agenda'))
    await assert.rejects(sql.run('UPDATE audit SET action = ? WHERE id = (SELECT MAX(id) FROM audit)', ['cambiado']))
    await assert.rejects(sql.run('DELETE FROM audit WHERE id = (SELECT MAX(id) FROM audit)'))
  })
})

describe('AD8 filtros de la biblioteca', () => {
  const none: Filters = { q: '', sexo: '', edadMin: '', edadMax: '', periodo: '', fecha: '', desde: '', hasta: '', medico: '', seguimiento: '', cita: '', estado: '' }
  test('la frase dice en palabras lo filtrado', () => {
    assert.equal(filterSummary(12, { ...none, sexo: 'F', edadMin: '18', edadMax: '40', periodo: 'mes' }, { total: 150 }), 'Mostrando 12 mujeres de 18 a 40 años atendidas este mes')
    assert.equal(filterSummary(3, { ...none, edadMax: '17', cita: 'sin' }, { total: 150 }), 'Mostrando 3 niños y niñas menores de 18 años sin cita de control')
    assert.equal(filterSummary(1, { ...none, sexo: 'M', estado: 'hospitalizado' }, { total: 150 }), 'Mostrando 1 hombre hospitalizado')
    assert.equal(filterSummary(150, none, { total: 150 }), '150 expedientes en la biblioteca')
  })
  test('las fechas rápidas se cuentan desde hoy', () => {
    const now = new Date(2026, 9, 30, 10) // jueves 30 de octubre de 2026
    assert.deepEqual(periodRange('hoy', '', '', now), ['2026-10-30', '2026-10-30'])
    assert.deepEqual(periodRange('semana', '', '', now), ['2026-10-26', '2026-10-30'])
    assert.deepEqual(periodRange('mes', '', '', now), ['2026-10-01', '2026-10-30'])
    assert.deepEqual(periodRange('anio', '', '', now), ['2026-01-01', '2026-10-30'])
    assert.deepEqual(periodRange('personalizado', '2026-01-05', '', now), ['2026-01-05', '9999-12-31'])
    assert.equal(periodRange('', '', '', now), null)
  })
})

describe('AD9 cobros en el momento', () => {
  test('recepción cobra un servicio nuevo con transferencia; queda guardado; sólo formas de pago habilitadas', async () => {
    const admin = await as('admin@demo.clinara')
    const set = await admin.put('/api/settings/payment-methods', { methods: ['cash', 'transfer'] })
    assert.equal(set.status, 200, JSON.stringify(set.body))
    assert.deepEqual(set.body.paymentMethods, ['cash', 'transfer'])
    assert.equal((await admin.put('/api/settings/payment-methods', { methods: [] })).status, 400)
    const rec = await as('smejia@demo.clinara')
    const { patientId } = await walkIn('Sutura')
    assert.equal((await rec.post('/api/payments', { patientId, items: [{ name: 'Consulta', price: 100, qty: 1 }], method: 'card', reference: '1234' })).status, 400)
    const r = await rec.post('/api/payments', { patientId, items: [{ name: 'Sutura', price: 400, qty: 1, save: true }], method: 'transfer', bank: 'Banco Atlántida', reference: 'TR-889' })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    assert.equal(r.body.bank, 'Banco Atlántida')
    assert.equal(r.body.balance, 0)
    const svc = (await rec.get('/api/services')).body.find((s: any) => s.name === 'Sutura')
    assert.ok(svc && svc.price === 400 && svc.createdBy)
    assert.equal(r.body.items[0].serviceId, svc.id)
    // Enfermería ya no cobra
    assert.equal((await (await as('crios@demo.clinara')).post('/api/payments', { patientId, items: [{ name: 'Consulta', price: 1, qty: 1 }], method: 'cash' })).status, 403)
  })

  test('abono: queda saldo pendiente visible y se completa después; el reporte cuenta lo recibido por forma de pago y servicio', async () => {
    const rec = await as('smejia@demo.clinara')
    const { patientId } = await walkIn('Abono')
    const r = await rec.post('/api/payments', { patientId, items: [{ name: 'Curación', price: 300, qty: 1, save: true }], method: 'cash', amountPaid: 100 })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    assert.equal(r.body.balance, 200)
    const bal = (await rec.get(`/api/payments/balances?patientId=${patientId}`)).body
    assert.deepEqual(bal.map((p: any) => p.balance), [200])
    assert.equal((await rec.post(`/api/payments/${r.body.id}/installments`, { amount: 250, method: 'cash' })).status, 400)
    const a = await rec.post(`/api/payments/${r.body.id}/installments`, { amount: 200, method: 'transfer', bank: 'BAC Credomatic' })
    assert.equal(a.status, 201, JSON.stringify(a.body))
    assert.equal(a.body.balance, 0)
    assert.equal((await rec.get(`/api/payments/balances?patientId=${patientId}`)).body.length, 0)
    const today = new Date().toLocaleDateString('en-CA')
    const rep = (await (await as('admin@demo.clinara')).get(`/api/reports?from=${today}&to=${today}`)).body
    assert.ok(rep.byService.some((s: any) => s.name === 'Curación' && s.total === 300))
    assert.ok(rep.byMethod.find((m: any) => m.method === 'transfer').total >= 200)
  })
})

/** Firma de prueba: PNG real con un trazo diagonal (la firma en pantalla rechaza recuadros vacíos). */
function signaturePng() {
  const w = 120, h = 40
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = y * (w * 4 + 1) + 1 + x * 4
    raw[o] = raw[o + 1] = raw[o + 2] = Math.abs(y - Math.round((x * h) / w)) <= 1 ? 20 : 255
    raw[o + 3] = 255
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0)
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6
  return `data:image/png;base64,${Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 0 })), chunk('IEND', Buffer.alloc(0))]).toString('base64')}`
}

describe('MC1 y MC2 firma inmediata', () => {
  test('al hospitalizar, la autorización ya está llena y se firma de una vez (paciente y médico con su PIN); luego se puede adjuntar la hoja en papel', async () => {
    const { doc, stayId, patientId } = await admitted('Firma Inmediata')
    const boot = (await doc.get('/api/bootstrap')).body
    const free = boot.beds.find((b: any) => b.active && !boot.bedStays.some((s: any) => s.bedId === b.id))
    assert.equal((await doc.patch(`/api/inpatient/${stayId}`, { bedId: free.id, companionName: 'Rosa Ramírez', companionPhone: '9876-1111' })).status, 200)
    const file = (await doc.get(`/api/inpatient/${stayId}`)).body
    const auth = file.authorizations.find((a: any) => a.template === 'hospital')
    assert.equal(auth.status, 'pending')
    assert.equal(auth.data.companion.name, 'Rosa Ramírez')
    await doc.put('/api/me/pin', { password: DEMO_PASSWORD, pin: '2468' })
    const r = await doc.post(`/api/authorizations/${auth.id}/sign`, { action: 'accept', patient: { signer: 'patient', signature: signaturePng(), readConfirmed: true },
      doctor: { pin: '2468', signature: signaturePng() } })
    assert.equal(r.status, 200, JSON.stringify(r.body))
    assert.equal(r.body.status, 'signed')
    assert.equal(r.body.method, 'virtual')
    const pdf = (await doc.post(`/api/patients/${patientId}/attachments`, { name: 'hoja.pdf', mime: 'application/pdf', category: 'document', data: Buffer.from('%PDF-1.4').toString('base64') })).body
    const att = await doc.post(`/api/authorizations/${auth.id}/attach-paper`, { fileId: pdf.id })
    assert.equal(att.status, 200, JSON.stringify(att.body))
    assert.equal(att.body.method, 'virtual')
    assert.equal(att.body.fileId, pdf.id)
    await doc.put('/api/me/pin', { password: DEMO_PASSWORD, pin: '' })
  })

  test('la quirúrgica toma el procedimiento y el diagnóstico que se le dan', async () => {
    const { doc, stayId } = await admitted('Quirúrgica')
    const a = await doc.post(`/api/inpatient/${stayId}/authorizations`, { template: 'surgical', procedure: 'Apendicectomía abierta', diagnosis: 'Apendicitis aguda' })
    assert.equal(a.status, 201, JSON.stringify(a.body))
    assert.equal(a.body.data.procedure, 'Apendicectomía abierta')
    assert.equal(a.body.data.diagnosis, 'Apendicitis aguda')
  })
})

describe('AN1 (ronda 4) borrador, nota firmada inmutable y adenda', () => {
  test('el borrador se guarda en el servidor por persona y se borra al firmar', async () => {
    const { doc, apptId } = await walkIn('Borrador')
    assert.equal((await doc.get(`/api/drafts/consulta/${apptId}`)).body, null)
    const put = await doc.put(`/api/drafts/consulta/${apptId}`, { data: { reason: 'Tos', history: 'Tres días con tos seca.' } })
    assert.equal(put.status, 200)
    assert.equal((await doc.get(`/api/drafts/consulta/${apptId}`)).body.data.history, 'Tres días con tos seca.')
    // Otra persona no ve ese borrador
    assert.equal((await (await as('apaz@demo.clinara')).get(`/api/drafts/consulta/${apptId}`)).body, null)
    assert.equal((await doc.del(`/api/drafts/consulta/${apptId}`)).status, 200)
    assert.equal((await doc.get(`/api/drafts/consulta/${apptId}`)).body, null)
  })

  test('la consulta firmada no se edita ni por la API ni en la base; el intento queda en la bitácora; la adenda va debajo', async () => {
    const { doc, apptId } = await walkIn('Inmutable')
    const c = await doc.post('/api/consultations', { appointmentId: apptId, reason: 'Faringitis', diagnoses: DX, items: RX })
    const id = c.body.consultationId
    const tryEdit = await doc.patch(`/api/consultations/${id}`, { history: 'Cambiado' })
    assert.equal(tryEdit.status, 409)
    assert.ok((await sql.one(`SELECT 1 FROM audit WHERE user_id = 's-herrera' AND action LIKE 'Intentó editar una consulta firmada%' LIMIT 1`)))
    await assert.rejects(sql.run('UPDATE consultations SET history = ? WHERE id = ?', ['Cambiado', id]))
    await assert.rejects(sql.run('DELETE FROM consultations WHERE id = ?', [id]))
    // Adenda: la corrección pide qué se corrige; enfermería no agrega adendas a una consulta
    assert.equal((await doc.post('/api/addenda', { targetKind: 'consultation', targetId: id, kind: 'correction', text: 'Era amoxicilina 875 mg.' })).status, 400)
    const a = await doc.post('/api/addenda', { targetKind: 'consultation', targetId: id, kind: 'correction', corrects: 'Dosis de amoxicilina mal escrita', text: 'La dosis correcta es 875 mg cada 12 horas.' })
    assert.equal(a.status, 201, JSON.stringify(a.body))
    assert.equal((await (await as('crios@demo.clinara')).post('/api/addenda', { targetKind: 'consultation', targetId: id, kind: 'info', text: 'Nada' })).status, 403)
    const note = (await doc.get(`/api/consultations/${id}`)).body
    assert.equal(note.consultation.history, '')
    assert.deepEqual(note.addenda.map((x: any) => x.corrects), ['Dosis de amoxicilina mal escrita'])
    await assert.rejects(sql.run('UPDATE addenda SET text = ? WHERE id = ?', ['x', a.body.id]))
  })

  test('notas de enfermería: adenda de enfermería; el médico sólo agrega información adicional', async () => {
    const { doc, nurse, stayId } = await admitted('Adenda Enfermería')
    const n = await nurse.post(`/api/inpatient/${stayId}/nursing`, { text: 'Paciente tranquilo, afebril.' })
    assert.equal(n.status, 201, JSON.stringify(n.body))
    assert.equal((await nurse.post('/api/addenda', { targetKind: 'note', targetId: n.body.id, kind: 'correction', corrects: 'Hora', text: 'Fue a las 10:00, no a las 11:00.' })).status, 201)
    assert.equal((await doc.post('/api/addenda', { targetKind: 'note', targetId: n.body.id, kind: 'correction', corrects: 'Algo', text: 'Corrección del médico.' })).status, 403)
    assert.equal((await doc.post('/api/addenda', { targetKind: 'note', targetId: n.body.id, kind: 'info', text: 'Se indicó vigilar la diuresis.' })).status, 201)
    assert.equal((await doc.patch(`/api/inpatient/notes/${n.body.id}`, { text: 'otra' })).status, 409)
    const file = (await doc.get(`/api/inpatient/${stayId}`)).body
    assert.equal(file.addenda.filter((x: any) => x.targetId === n.body.id).length, 2)
  })

  test('la epicrisis toma las adendas de la nota de egreso al emitirse', async () => {
    const { doc, stayId } = await admitted('Epicrisis Adenda')
    const d = await doc.post(`/api/inpatient/${stayId}/discharge`, { diagnoses: DX, summary: 'Evolucionó bien con antibiótico intravenoso.', condition: 'Mejorado', instructions: 'Dieta blanda.' })
    assert.equal(d.status, 201, JSON.stringify(d.body))
    const noteId = (await doc.get(`/api/inpatient/${stayId}`)).body.notes.find((x: any) => x.kind === 'discharge').id
    await doc.post('/api/addenda', { targetKind: 'note', targetId: noteId, kind: 'result', text: 'El hemocultivo salió negativo.' })
    const epi = await doc.post(`/api/epicrisis/${d.body.epicrisisId}/issue`)
    assert.equal(epi.status, 200, JSON.stringify(epi.body))
    assert.equal(epi.body.data.dischargeAddenda[0].text, 'El hemocultivo salió negativo.')
  })
})

const EXAMS3 = [
  { group: 'lab', name: 'Hemograma', priority: 'urgent', place: 'clinic' },
  { group: 'lab', name: 'Perfil lipídico', priority: 'routine', place: 'clinic' },
  { group: 'imaging', name: 'Radiografía de tórax', indication: 'Tos de tres semanas', priority: 'routine', place: 'clinic' },
]

describe('EX1 (ronda 4) exámenes: Laboratorio e Imagen y gabinete', () => {
  test('en una consulta: dos grupos en el mismo lote (dos órdenes impresas), área enfermería si no hay laboratorio propio', async () => {
    const { doc, apptId } = await walkIn('Exámenes')
    const c = await doc.post('/api/consultations', { appointmentId: apptId, reason: 'Control', diagnoses: DX, exams: EXAMS3 })
    assert.equal(c.status, 201, JSON.stringify(c.body))
    const batch = (await doc.get(`/api/exams/batch/${c.body.examBatch}`)).body
    assert.equal(batch.exams.length, 3)
    assert.deepEqual([...new Set(batch.exams.map((e: any) => e.group))].sort(), ['imaging', 'lab'])
    assert.ok(batch.exams.every((e: any) => e.area === 'nursing' && e.status === 'ordered'))
    // Recepción no ordena exámenes
    assert.equal((await (await as('smejia@demo.clinara')).get(`/api/exams/batch/${c.body.examBatch}`)).status, 403)
  })

  test('con laboratorio propio, el área destino es Laboratorio; los externos de consulta no van a ninguna bandeja', async () => {
    const admin = await as('admin@demo.clinara')
    assert.equal((await admin.put('/api/settings/exam-areas', { hasLab: true, hasImaging: false })).status, 200)
    const { doc, apptId } = await walkIn('Laboratorio Propio')
    const c = await doc.post('/api/consultations', { appointmentId: apptId, reason: 'Control', diagnoses: DX,
      exams: [{ group: 'lab', name: 'Hemograma', priority: 'routine', place: 'clinic' }, { group: 'imaging', name: 'Ultrasonido abdominal', priority: 'routine', place: 'external' }] })
    const exams = (await doc.get(`/api/exams/batch/${c.body.examBatch}`)).body.exams
    assert.equal(exams.find((e: any) => e.group === 'lab').area, 'lab')
    assert.equal(exams.find((e: any) => e.group === 'imaging').area, 'none')
    await admin.put('/api/settings/exam-areas', { hasLab: false, hasImaging: false })
  })

  test('en hospitalización: enfermería los ve en su bandeja (urgente arriba), toma la muestra y carga el resultado; el médico recibe «Resultado nuevo» y lo revisa', async () => {
    const { doc, nurse, stayId } = await admitted('Bandeja')
    const n = await doc.post(`/api/inpatient/${stayId}/notes`, { kind: 'evolution', format: 'dx', exam: 'Estable.', exams: [EXAMS3[1], EXAMS3[2], EXAMS3[0]] })
    assert.equal(n.status, 201, JSON.stringify(n.body))
    const tray = (await nurse.get('/api/exams/tray')).body.filter((e: any) => e.hospitalizationId === stayId)
    assert.equal(tray.length, 3)
    assert.equal(tray[0].name, 'Hemograma')
    assert.equal(tray[0].priority, 'urgent')
    const hemo = tray[0]
    assert.equal((await nurse.post(`/api/exams/${hemo.id}/status`, { status: 'done' })).status, 400)
    assert.equal((await nurse.post(`/api/exams/${hemo.id}/status`, { status: 'sample' })).body.status, 'sample')
    const r = await nurse.post(`/api/exams/${hemo.id}/result`, { values: [{ analyte: 'Hemoglobina', value: '9.1' }, { analyte: 'Plaquetas', value: '250' }] })
    assert.equal(r.status, 200, JSON.stringify(r.body))
    assert.equal(r.body.status, 'result')
    assert.equal(r.body.result.values[0].flag, 'low')
    assert.equal(r.body.result.values[0].unit, 'g/dL')
    assert.equal(r.body.result.values[1].flag, undefined)
    assert.equal(r.body.critical, undefined)
    const fresh = (await doc.get('/api/exams/new-results')).body
    assert.ok(fresh.some((e: any) => e.id === hemo.id))
    assert.equal((await nurse.post(`/api/exams/${hemo.id}/review`)).status, 403)
    assert.equal((await doc.post(`/api/exams/${hemo.id}/review`)).body.status, 'reviewed')
    assert.ok(!(await doc.get('/api/exams/new-results')).body.some((e: any) => e.id === hemo.id))
    // Cada cambio de estado quedó con quién y cuándo
    const file = (await doc.get(`/api/inpatient/${stayId}`)).body
    assert.deepEqual(file.exams.find((e: any) => e.id === hemo.id).events.map((e: any) => e.status), ['ordered', 'sample', 'result', 'reviewed'])
  })

  test('un valor fuera del umbral crítico es una alerta crítica; cancelar pide motivo', async () => {
    const { doc, nurse, stayId } = await admitted('Crítico')
    await doc.post(`/api/inpatient/${stayId}/notes`, { kind: 'evolution', format: 'dx', exam: 'Pálido.', exams: [EXAMS3[0], EXAMS3[2]] })
    const tray = (await nurse.get('/api/exams/tray')).body.filter((e: any) => e.hospitalizationId === stayId)
    const r = await nurse.post(`/api/exams/${tray[0].id}/result`, { values: [{ analyte: 'Hemoglobina', value: '5.8' }] })
    assert.equal(r.body.critical, true)
    assert.equal((await nurse.post(`/api/exams/${tray[1].id}/cancel`, { reason: '' })).status, 400)
    assert.equal((await nurse.post(`/api/exams/${tray[1].id}/cancel`, { reason: 'El paciente se trasladó a otro centro.' })).body.status, 'cancelled')
  })

  test('un set con exámenes los guarda como exámenes; los resultados que se subían como archivos se migran a exámenes', async () => {
    const doc = await as('lherrera@demo.clinara')
    const s = await doc.post('/api/order-sets', { name: 'Neumonía', items: [{ text: 'Oxígeno por cánula a 2 L/min.' }, { exam: EXAMS3[0] }, { exam: EXAMS3[2] }] })
    assert.equal(s.status, 201, JSON.stringify(s.body))
    assert.equal(s.body.items.filter((i: any) => i.exam).length, 2)
    const { stayId, patientId } = await admitted('Migración')
    const att = await doc.post(`/api/patients/${patientId}/attachments`, { name: 'hemo.pdf', mime: 'application/pdf', category: 'lab', data: Buffer.from('%PDF-1.4').toString('base64'), title: 'Hemograma', takenAt: new Date().toISOString(), hospitalizationId: stayId })
    assert.equal(att.status, 201, JSON.stringify(att.body))
    await migrateLabsToExams(sql)
    await migrateLabsToExams(sql)
    const file = (await doc.get(`/api/inpatient/${stayId}`)).body
    const migrated = file.exams.filter((e: any) => e.result?.fileIds?.includes(att.body.id))
    assert.equal(migrated.length, 1)
    assert.equal(migrated[0].name, 'Hemograma')
    assert.equal(migrated[0].status, 'result')
  })
})

describe('EN2 alertas agrupadas por nivel', () => {
  test('las dosis atrasadas de un medicamento van en una línea con conteo; «No aplicada» con motivo deja de alertar', async () => {
    const { doc, nurse, stayId } = await admitted('Alertas')
    const firstAt = new Date(Date.now() - 9 * 3_600_000).toISOString()
    const n = await doc.post(`/api/inpatient/${stayId}/notes`, { kind: 'evolution', format: 'dx', exam: 'Estable.',
      meds: [{ drug: 'Acetaminofén', dose: '1 g', route: 'VO', everyHours: 4, firstAt }] })
    assert.equal(n.status, 201, JSON.stringify(n.body))
    const band = bandOf({})
    let file = (await nurse.get(`/api/inpatient/${stayId}`)).body
    const late = fileAlerts(file, band, new Date()).filter((a) => a.key.startsWith('late-'))
    assert.equal(late.length, 1, 'una sola línea por medicamento')
    assert.equal(late[0].level, 'pending')
    assert.ok(late[0].count >= 2 && /2 dosis atrasadas|3 dosis atrasadas/.test(late[0].text), late[0].text)
    assert.equal(late[0].action.label, 'Registrar dosis')
    // La acción lleva a la dosis exacta
    assert.match(alertQuery(late[0].action.go), /tab=medicamentos&dosis=.+&hora=/)
    const med = file.meds[0]
    assert.equal((await nurse.post(`/api/inpatient/meds/${med.id}/doses`, { scheduledAt: firstAt, givenAt: new Date().toISOString(), status: 'skipped' })).status, 400)
    const skip = await nurse.post(`/api/inpatient/meds/${med.id}/doses`, { scheduledAt: firstAt, givenAt: new Date().toISOString(), status: 'skipped', note: 'Paciente en ayuno' })
    assert.equal(skip.status, 201, JSON.stringify(skip.body))
    file = (await nurse.get(`/api/inpatient/${stayId}`)).body
    const after = fileAlerts(file, band, new Date())
    assert.equal(after.find((a) => a.key.startsWith('late-'))!.count, late[0].count - 1)
    const info = after.find((a) => a.key.startsWith('skip-'))!
    assert.equal(info.level, 'info')
    assert.match(info.text, /1 dosis no aplicada .*Paciente en ayuno/)
    // Contador de la pestaña: sólo lo crítico y lo pendiente
    assert.equal(tabCounts(after).meds?.n, late[0].count - 1)
    assert.match(alertSummary(after), /pendiente/)
  })

  test('el inicio de enfermería recibe los pendientes de todos los internados; recepción no', async () => {
    const { nurse, stayId } = await admitted('Pendientes')
    const list = await nurse.get('/api/inpatient/alerts')
    assert.equal(list.status, 200)
    const f = list.body.find((x: any) => x.hospitalization.id === stayId)
    assert.ok(f && Array.isArray(f.meds) && Array.isArray(f.vitals) && Array.isArray(f.exams))
    // La autorización de hospitalización pendiente es «pendiente» con su acción de firmar
    const auth = fileAlerts(f, bandOf({}), new Date()).find((a) => a.key.startsWith('auth-'))
    assert.equal(auth?.level, 'pending')
    assert.equal(auth?.action.label, 'Firmar ahora')
    assert.equal((await (await as('smejia@demo.clinara')).get('/api/inpatient/alerts')).status, 403)
  })
})

describe('MC5 nota de egreso en la hoja de la epicrisis', () => {
  test('la vista previa trae la HEA de la consulta; al guardar sale la epicrisis emitida con el mismo contenido', async () => {
    const { doc, nurse, stayId } = await admitted('Egreso')
    const pre = await doc.get(`/api/inpatient/${stayId}/discharge-preview`)
    assert.equal(pre.status, 200, JSON.stringify(pre.body))
    assert.match(pre.body.hea, /fosa ilíaca derecha/)
    assert.equal((await nurse.get(`/api/inpatient/${stayId}/discharge-preview`)).status, 403)
    const r = await doc.post(`/api/inpatient/${stayId}/discharge`, {
      diagnoses: DX, summary: 'Evolucionó afebril, tolera la vía oral; se da de alta.', condition: 'Mejorado', instructions: 'Dieta blanda.', followUp: 'Control en 1 semana.',
      hea: 'Dos días con dolor en fosa ilíaca derecha y fiebre. (corregida)', items: RX, validityDays: 10,
      exams: [{ group: 'lab', name: 'Hemograma', priority: 'routine', place: 'external' }], issueEpicrisis: true,
    })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    assert.equal(r.body.epicrisisIssued, true)
    assert.ok(r.body.examBatch)
    const epi = (await doc.get(`/api/epicrisis/${r.body.epicrisisId}`)).body
    assert.equal(epi.status, 'issued')
    assert.match(epi.data.hea, /\(corregida\)/)
    assert.equal(epi.data.evolution, 'Evolucionó afebril, tolera la vía oral; se da de alta.')
    assert.ok(epi.data.pendingExams.includes('Hemograma'))
    assert.equal(epi.data.dischargeRx.length, 1)
    assert.equal((await doc.get(`/api/prescriptions/${r.body.prescriptionId}`)).body.prescription.validityDays, 10)
    // El examen al alta externo no cae en la bandeja de enfermería
    assert.ok(!(await nurse.get('/api/exams/tray')).body.some((e: any) => e.hospitalizationId === stayId && e.name === 'Hemograma'))
    // La cama queda libre
    const file = (await doc.get(`/api/inpatient/${stayId}`)).body
    assert.equal(file.hospitalization.status, 'discharged')
  })
})

describe('Correcciones de la revisión contra el pedido', () => {
  test('AD5: la plataforma no deja a una clínica sin Administración y, al cambiar el rol activo, conserva los demás', async () => {
    const sa = await as('superadmin@demo.clinara')
    const created = await sa.post('/api/platform/clinics', { name: 'Clínica Último Admin', address: 'Choluteca', phone: '2780-0000', admin: { name: 'Única Admin', email: 'unica@ultimo.test' } })
    assert.equal(created.status, 201, JSON.stringify(created.body))
    const cid = created.body.clinic.id
    const admin = (await sa.get(`/api/platform/clinics/${cid}/staff`)).body.find((s: any) => s.email === 'unica@ultimo.test')
    assert.equal((await sa.patch(`/api/platform/staff/${admin.id}`, { active: false })).status, 400)
    assert.equal((await sa.patch(`/api/platform/staff/${admin.id}`, { role: 'nurse' })).status, 400)
    // Una médica que también es administración: la plataforma le cambia el rol activo y conserva Administración
    const doc = await sa.post(`/api/platform/clinics/${cid}/staff`, { name: 'Dra. Doble Rol', role: 'doctor', email: 'doble@ultimo.test', license: 'CMH-2' })
    assert.equal(doc.status, 201, JSON.stringify(doc.body))
    const unica = await login(base, 'unica@ultimo.test', created.body.password)
    assert.equal((await unica.patch(`/api/staff/${doc.body.user.id}`, { roles: ['doctor', 'admin'] })).status, 200)
    const changed = await sa.patch(`/api/platform/staff/${doc.body.user.id}`, { role: 'nurse' })
    assert.equal(changed.status, 200, JSON.stringify(changed.body))
    assert.equal(changed.body.role, 'nurse')
    assert.deepEqual([...changed.body.roles].sort(), ['admin', 'nurse'])
    // Ya hay otra persona con Administración: ahora sí se puede desactivar a la primera
    assert.equal((await sa.patch(`/api/platform/staff/${admin.id}`, { active: false })).status, 200)
  })

  test('EN2: las dosis atrasadas y las tomas de signos sin registrar no caducan a las 24 horas', async () => {
    const { doc, nurse, stayId } = await admitted('Sin caducar')
    const firstAt = new Date().toISOString()
    const n = await doc.post(`/api/inpatient/${stayId}/notes`, { kind: 'evolution', format: 'dx', exam: 'Estable.',
      meds: [{ drug: 'Ceftriaxona', dose: '1 g', route: 'IV', everyHours: 8, firstAt }] })
    assert.equal(n.status, 201, JSON.stringify(n.body))
    const file = (await nurse.get(`/api/inpatient/${stayId}`)).body
    // 40 horas después sin registrar nada: dosis de las 0, 8, 16, 24 y 32 h atrasadas (la de las 40 h apenas toca)
    const later = new Date(Date.now() + 40 * 3_600_000)
    const alerts = fileAlerts(file, bandOf({}), later)
    const late = alerts.find((a) => a.key.startsWith('late-'))!
    assert.equal(late.count, 5, late.text)
    assert.ok(late.since <= later.getTime() - 24 * 3_600_000, 'la dosis de hace más de 24 h sigue alertando')
    const missed = alerts.find((a) => a.key === 'vitals-missed')!
    assert.ok(missed.since <= later.getTime() - 24 * 3_600_000, 'la toma de hace más de 24 h sigue alertando')
  })

  test('MC4: un examen que agregó la clínica también se sugiere al escribirlo como indicación', () => {
    const catalog = [{ group: 'lab' as const, name: 'Panel viral respiratorio' }]
    assert.equal(typedExam('Panel viral respiratorio', catalog)?.name, 'Panel viral respiratorio')
    assert.equal(typedExam('Panel viral respiratorio'), undefined)
    assert.equal(typedExam('Hemograma.')?.group, 'lab')
  })

  test('DM1: el inicio de sesión sólo ofrece cuentas de las clínicas demo que se regeneran cada día', async () => {
    const accounts = (await (await fetch(`${base}/api/demo-accounts`)).json() as any).accounts
    assert.ok(accounts.some((a: any) => a.email === 'lherrera@demo.clinara'))
    assert.ok(accounts.some((a: any) => a.email === 'alopez@demo.clinara'))
    assert.ok(accounts.some((a: any) => a.email === 'superadmin@demo.clinara'))
    assert.ok(!accounts.some((a: any) => a.email.endsWith('sanlucas@demo.clinara') || a.email === 'erosales@demo.clinara'))
    // Las cuentas de San Lucas siguen entrando (sirven para probar el aislamiento entre clínicas)
    const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'erosales@demo.clinara', password: DEMO_PASSWORD }) })
    assert.equal(res.status, 200)
  })
})
