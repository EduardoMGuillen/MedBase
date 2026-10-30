import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb, migrateRxValidity } from './db.js'
import { createSql, type Sql } from './sql.js'
import { filterSummary, periodRange, type Filters } from '../src/lib/patientFilters.js'

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
export async function login(baseUrl: string, email: string) {
  const res = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: DEMO_PASSWORD }) })
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
