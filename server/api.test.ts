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
})
after(async () => { server.close(); await sql.close() })

/** Cliente mínimo que conserva la cookie de sesión. */
async function as(email: string, password = DEMO_PASSWORD) {
  const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })
  const cookie = res.headers.get('set-cookie')?.split(';')[0] ?? ''
  const call = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(`${base}${path}`, { method, headers: { cookie, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    return { status: r.status, body: await r.json() as any }
  }
  return { status: res.status, login: await res.json() as any, call, get: (p: string) => call('GET', p), post: (p: string, b?: unknown) => call('POST', p, b), patch: (p: string, b: unknown) => call('PATCH', p, b) }
}

const today = () => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

describe('autenticación', () => {
  test('rechaza una contraseña incorrecta', async () => {
    const s = await as('lherrera@demo.clinara', 'nope')
    assert.equal(s.status, 401)
  })
  test('sin sesión la API responde 401', async () => {
    const r = await fetch(`${base}/api/bootstrap`)
    assert.equal(r.status, 401)
  })
  test('el login devuelve usuario y permisos', async () => {
    const s = await as('LHERRERA@demo.clinara')
    assert.equal(s.status, 200)
    assert.equal(s.login.user.role, 'doctor')
    assert.ok(s.login.permissions.includes('rx.write'))
    assert.equal(s.login.user.password_hash, undefined)
  })
})

describe('permisos por rol', () => {
  test('recepción no recibe alergias ni expediente', async () => {
    const r = await as('smejia@demo.clinara')
    const boot = await r.get('/api/bootstrap')
    const maria = boot.body.patients.find((p: any) => p.id === 'p1')
    assert.deepEqual(maria.allergies, [])
    assert.equal(boot.body.prescriptions.length, 0)
    assert.equal((await r.get('/api/patients/p1/chart')).status, 403)
  })
  test('enfermería ve el expediente pero no firma consultas', async () => {
    const n = await as('crios@demo.clinara')
    const chart = await n.get('/api/patients/p1/chart')
    assert.equal(chart.status, 200)
    assert.ok(chart.body.consultations.length >= 1)
    const sign = await n.post('/api/consultations', { appointmentId: 'a3', reason: 'x', diagnoses: [{ code: 'J00', label: 'x' }], orders: ['Reposo'] })
    assert.equal(sign.status, 403)
  })
  test('administración no ve el expediente clínico', async () => {
    const a = await as('admin@demo.clinara')
    assert.equal((await a.get('/api/patients/p1/chart')).status, 403)
  })
  test('un médico no puede firmar la cita de otro', async () => {
    const paz = await as('apaz@demo.clinara')
    const r = await paz.post('/api/consultations', { appointmentId: 'a3', reason: 'x', diagnoses: [{ code: 'J00', label: 'x' }], orders: ['Reposo'] })
    assert.equal(r.status, 403)
  })
})

describe('flujo de la cita', () => {
  test('agenda, llegada, triaje, consulta y receta', async () => {
    const rec = await as('smejia@demo.clinara')
    // La hora debe caer en el horario del médico: para que la prueba corra cualquier día, la Dra. Herrera atiende todos los días
    const admin = await as('admin@demo.clinara')
    const all = Object.fromEntries(['0', '1', '2', '3', '4', '5', '6'].map((d) => [d, [{ start: '07:00', end: '22:00' }]]))
    assert.equal((await admin.patch('/api/staff/s-herrera/schedule', { slot: 15, week: all })).status, 200)
    const created = await rec.post('/api/appointments', { patientId: 'p4', doctorId: 's-herrera', start: `${today()}T17:00`, minutes: 30, reason: 'Dolor lumbar', type: 'followup' })
    assert.equal(created.status, 201)
    const id = created.body.id

    // Dos citas a la misma hora con el mismo médico se permiten (la agenda avisa antes de guardar)
    const clash = await rec.post('/api/appointments', { patientId: 'p7', doctorId: 's-herrera', start: `${today()}T17:15`, reason: 'x' })
    assert.equal(clash.status, 201)

    assert.equal((await rec.post(`/api/appointments/${id}/status`, { status: 'arrived' })).body.status, 'arrived')

    const nurse = await as('crios@demo.clinara')
    const v = await nurse.post('/api/vitals', { patientId: 'p4', appointmentId: id, systolic: 120, diastolic: 80, heartRate: 72, respRate: 16, temperature: 36.6, spo2: 98, weightKg: 80, heightCm: 178,
      chiefComplaint: 'Dolor lumbar de 4 días de evolución.' })
    assert.equal(v.body.chiefComplaint, 'Dolor lumbar de 4 días de evolución.')
    assert.equal(v.body.respRate, 16)
    assert.equal(v.status, 201)
    const boot = await nurse.get('/api/bootstrap')
    assert.equal(boot.body.appointments.find((a: any) => a.id === id).status, 'triaged')

    const doc = await as('lherrera@demo.clinara')
    assert.equal((await doc.post(`/api/appointments/${id}/status`, { status: 'in_consult' })).status, 200)
    const noDx = await doc.post('/api/consultations', { appointmentId: id, reason: 'Dolor lumbar', diagnoses: [] })
    assert.equal(noDx.status, 400)
    const noOrders = await doc.post('/api/consultations', { appointmentId: id, reason: 'Dolor lumbar', diagnoses: [{ code: 'M54.5', label: 'Lumbago' }], orders: [] })
    assert.equal(noOrders.status, 400)
    assert.match(noOrders.body.error, /orden médica/)
    const signed = await doc.post('/api/consultations', {
      appointmentId: id, reason: 'Dolor lumbar', symptoms: ['Lumbalgia'], diagnoses: [{ code: 'M54.5', label: 'Lumbago no especificado' }],
      orders: ['Reposo relativo.', 'Naproxeno 550 mg cada 12 horas por 5 días.'], vitalsId: v.body.id,
      items: [{ drug: 'Naproxeno', presentation: 'Tableta 550 mg', dose: '1 tableta', frequency: 'Cada 12 horas', duration: '5 días' }],
    })
    assert.equal(signed.status, 201)
    assert.match(signed.body.folio, /^RX-\d{4}-\d{4}$/)

    const rx = await doc.get(`/api/prescriptions/${signed.body.prescriptionId}`)
    assert.equal(rx.body.prescription.items[0].drug, 'Naproxeno')
    const again = await doc.post('/api/consultations', { appointmentId: id, reason: 'x', diagnoses: [{ code: 'J00', label: 'x' }], orders: ['Reposo'] })
    assert.equal(again.status, 409)
  })

  test('valida los signos vitales', async () => {
    const nurse = await as('crios@demo.clinara')
    const r = await nurse.post('/api/vitals', { patientId: 'p1', systolic: 900, diastolic: 80, heartRate: 72, temperature: 36.6, spo2: 98 })
    assert.equal(r.status, 400)
    assert.match(r.body.error, /sistólica/)
  })
})

describe('pacientes y personal', () => {
  test('recepción registra pacientes pero no edita alergias', async () => {
    const rec = await as('smejia@demo.clinara')
    const p = await rec.post('/api/patients', { firstName: 'Luis', lastName: 'Prueba', birthDate: '1990-05-05', sex: 'M', phone: '99998888' })
    assert.equal(p.status, 201)
    assert.match(p.body.record, /^EXP-\d{5}$/)
    assert.equal((await rec.patch(`/api/patients/${p.body.id}`, { allergies: ['Penicilina'] })).status, 403)
    const doc = await as('lherrera@demo.clinara')
    const upd = await doc.patch(`/api/patients/${p.body.id}`, { allergies: ['Penicilina'] })
    assert.deepEqual(upd.body.allergies, ['Penicilina'])
  })

  test('médicos y enfermería registran pacientes con el formulario completo', async () => {
    // Mismo cuerpo que arma IdentificationForm: los campos que no se llenan llegan como ''
    const form = { lastName: 'Formulario', birthDate: '1990-05-05', sex: 'F', phone: '9999-8888', email: '', dni: '', civilStatus: '', occupation: '',
      education: '', religion: '', address: '', emergencyName: '', emergencyPhone: '', emergencyRelation: '', insurance: '', allergies: [] }
    for (const email of ['lherrera@demo.clinara', 'crios@demo.clinara']) {
      const r = await (await as(email)).post('/api/patients', { ...form, firstName: email.split('@')[0] })
      assert.equal(r.status, 201, `${email}: ${JSON.stringify(r.body)}`)
    }
  })

  test('administración crea un usuario que puede iniciar sesión, y al desactivarlo pierde acceso', async () => {
    const admin = await as('admin@demo.clinara')
    const u = await admin.post('/api/staff', { name: 'Lic. Nueva Enfermera', role: 'nurse', email: 'nueva@clinica.test' })
    assert.equal(u.status, 201)
    const nueva = await as('nueva@clinica.test', u.body.password)
    assert.equal(nueva.status, 200)
    assert.equal((await nueva.get('/api/bootstrap')).status, 200)
    await admin.patch(`/api/staff/${u.body.user.id}`, { active: false })
    assert.equal((await nueva.get('/api/bootstrap')).status, 401)
  })

  test('la bitácora registra los accesos al expediente y no se puede alterar', async () => {
    const admin = await as('admin@demo.clinara')
    const boot = await admin.get('/api/bootstrap')
    assert.ok(boot.body.audit.some((e: any) => e.action.startsWith('Consultó el expediente')))
    await assert.rejects(sql.run('DELETE FROM audit'), /append-only/)
    await assert.rejects(sql.run(`UPDATE audit SET action = 'x'`), /append-only/)
  })

  test('una base anterior a la v6 se actualiza aunque la bitácora tenga registros', async () => {
    const old = createSql({ memory: true })
    try {
      await ensureDb(old)
      // Estado de una base v5: una sola clínica implícita, sin clinic_id ni hospitalización
      await old.exec(`
        TRUNCATE hosp_doses, hosp_meds, hosp_notes, hosp_procedures, hospitalizations, beds, followups;
        DELETE FROM attachments WHERE patient_id IN ('p11', 'p12', 'p13', 'p14');
        DELETE FROM patients WHERE id IN ('p11', 'p12', 'p13', 'p14');
        TRUNCATE audit;
        INSERT INTO audit (at, user_id, action) VALUES ('2026-01-01T00:00:00Z', 's-mejia', 'Inició sesión');
        UPDATE staff SET clinic_id = NULL;
        ${['patients', 'appointments', 'vitals', 'consultations', 'prescriptions', 'payments', 'attachments', 'services'].map((t) => `UPDATE ${t} SET clinic_id = NULL;`).join('\n')}
        DELETE FROM clinics;
        UPDATE meta SET value = '5' WHERE key = 'schema';
      `)
      // Copia del cliente: ensureDb recuerda por instancia que ya inicializó
      await ensureDb({ ...old })
      const row = await old.one<{ clinic_id: string | null }>('SELECT clinic_id FROM audit')
      assert.ok(row?.clinic_id)
      await assert.rejects(old.run(`UPDATE audit SET action = 'x'`), /append-only/)
      // La demo recibe las camas y los hospitalizados de la v7 sin reiniciar sus datos
      const beds = await old.one<{ n: number }>('SELECT COUNT(*)::int AS n FROM beds')
      assert.equal(Number(beds?.n), 15)
      assert.ok(await old.one(`SELECT 1 FROM hospitalizations WHERE status = 'active'`))
    } finally {
      await old.close()
    }
  })

  test('la demo trae casos completos, de la preclínica al egreso', async () => {
    const doc = await as('lherrera@demo.clinara')
    const chart = await doc.get('/api/patients/p17/chart')
    assert.equal(chart.status, 200)
    assert.equal(chart.body.consultations.length, 4)
    assert.ok(chart.body.consultations.every((c: any) => c.vitalsId && c.diagnoses.length && c.orders.length))
    assert.equal(chart.body.hospitalizations[0].status, 'discharged')
    const file = await doc.get(`/api/inpatient/${chart.body.hospitalizations[0].id}`)
    assert.ok(file.body.notes.some((n: any) => n.kind === 'discharge' && n.discharge?.summary))
    assert.ok(file.body.notes.some((n: any) => n.kind === 'evolution' && n.orders?.length))
    assert.ok(file.body.doses.some((d: any) => d.status === 'skipped'))
    assert.equal(file.body.labs.length, 3)
    const boot = await doc.get('/api/bootstrap')
    assert.ok(boot.body.discharges.some((d: any) => d.patientId === 'p17'))
    assert.ok(boot.body.followups.some((f: any) => f.patientId === 'p18' && f.kind === 'chronic'))
    // Cada consulta de los casos quedó cobrada
    const rec = await as('smejia@demo.clinara')
    const appts = (await rec.get('/api/bootstrap')).body.appointments.filter((a: any) => a.id.startsWith('ca') && a.status === 'done')
    assert.ok(appts.length >= 8 && appts.every((a: any) => a.paid))
  })

  test('una base v8 recibe los casos sin chocar con expedientes ya registrados', async () => {
    const old = createSql({ memory: true })
    try {
      await ensureDb(old)
      // Estado de una base v8: sin los casos, y con un paciente que el personal registró al probar
      await old.exec(`
        DELETE FROM followups WHERE id LIKE 'cfu%'; DELETE FROM attachments WHERE id LIKE 'cl%'; DELETE FROM hosp_doses WHERE id LIKE 'chd%';
        DELETE FROM hosp_meds WHERE id LIKE 'chm%'; DELETE FROM hosp_procedures WHERE id LIKE 'chp%'; DELETE FROM hosp_notes WHERE id LIKE 'chn%';
        DELETE FROM hospitalizations WHERE id LIKE 'chz%'; DELETE FROM payments WHERE id LIKE 'cp%'; DELETE FROM prescriptions WHERE id LIKE 'crx%';
        DELETE FROM consultations WHERE id LIKE 'cc%'; DELETE FROM vitals WHERE id LIKE 'cv%'; DELETE FROM appointments WHERE id LIKE 'ca%';
        DELETE FROM patients WHERE id IN ('p15', 'p16', 'p17', 'p18', 'p19', 'p20');
        INSERT INTO patients (id, record, first_name, last_name, birth_date, sex, phone, created_at, clinic_id)
          VALUES ('real1', 'EXP-00484', 'Registrado', 'Antes', '1990-01-01', 'F', '99990000', '2026-10-01T09:00:00', 'c-sb');
        UPDATE meta SET value = '8' WHERE key = 'schema';
      `)
      await ensureDb({ ...old })
      const cases = await old.query(`SELECT record FROM patients WHERE id IN ('p15', 'p16', 'p17', 'p18', 'p19', 'p20') ORDER BY record`)
      assert.equal(cases.length, 6)
      assert.equal(cases[0].record, 'EXP-00485')
      assert.ok(await old.one(`SELECT 1 FROM hospitalizations WHERE id = 'chz1' AND status = 'discharged'`))
    } finally {
      await old.close()
    }
  })

  test('el bloqueo por intentos fallidos se guarda en la base', async () => {
    for (let i = 0; i < 5; i++) await as('apaz@demo.clinara', 'mala')
    const blocked = await as('apaz@demo.clinara')
    assert.equal(blocked.status, 429)
    await sql.run('DELETE FROM rate_limits')
    assert.equal((await as('apaz@demo.clinara')).status, 200)
  })
})

describe('reserva en línea', () => {
  const nextWeekday = () => {
    const d = new Date(); d.setDate(d.getDate() + 1)
    while (![1, 2, 3, 4, 5].includes(d.getDay())) d.setDate(d.getDate() + 1)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }

  test('muestra médicos y horarios libres sin sesión, y la cita aparece en la agenda', async () => {
    const clinic = await (await fetch(`${base}/api/public/santa-brigida/clinic`)).json() as any
    assert.ok(clinic.doctors.some((d: any) => d.id === 's-herrera'))
    assert.equal(clinic.doctors[0].email, undefined)
    const date = nextWeekday()
    const { slots } = await (await fetch(`${base}/api/public/santa-brigida/slots?doctorId=s-herrera&date=${date}`)).json() as any
    assert.ok(slots.length > 0)
    const book = await fetch(`${base}/api/public/santa-brigida/book`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      doctorId: 's-herrera', date, time: slots[0], firstName: 'Paciente', lastName: 'En Línea', birthDate: '1985-02-02', sex: 'F', phone: '9900-1122', reason: 'Chequeo general',
    }) })
    assert.equal(book.status, 201)
    const again = await (await fetch(`${base}/api/public/santa-brigida/slots?doctorId=s-herrera&date=${date}`)).json() as any
    assert.ok(!again.slots.includes(slots[0]))
    const dup = await fetch(`${base}/api/public/santa-brigida/book`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      doctorId: 's-herrera', date, time: slots[0], firstName: 'Otra', lastName: 'Persona', birthDate: '1990-02-02', sex: 'M', phone: '9900-3344', reason: 'Chequeo general',
    }) })
    assert.equal(dup.status, 409)
    const rec = await as('smejia@demo.clinara')
    const boot = await rec.get('/api/bootstrap')
    assert.ok(boot.body.appointments.some((a: any) => a.source === 'online' && a.start.startsWith(`${date}T${slots[0]}`)))
  })
})

describe('caja', () => {
  test('recepción cobra una consulta atendida una sola vez; el médico también cobra, sin repetir el cobro', async () => {
    const rec = await as('smejia@demo.clinara')
    const boot = await rec.get('/api/bootstrap')
    const pending = boot.body.appointments.find((a: any) => a.id === 'a2')
    assert.equal(pending.paid, false)
    const body = { appointmentId: 'a2', patientId: pending.patientId, items: [{ serviceId: 'svc-mi', name: 'Consulta de medicina interna', price: 800, qty: 1 }], discount: 100, method: 'cash' }
    const pay = await rec.post('/api/payments', body)
    assert.equal(pay.status, 201)
    assert.equal(pay.body.total, 700)
    assert.match(pay.body.receiptNo, /^R-\d{6}$/)
    assert.equal((await rec.post('/api/payments', body)).status, 409)
    const card = await rec.post('/api/payments', { ...body, appointmentId: undefined, method: 'card' })
    assert.equal(card.status, 400)
    const doc = await as('lherrera@demo.clinara')
    assert.equal((await doc.post('/api/payments', body)).status, 409)
    assert.equal((await rec.post(`/api/payments/${pay.body.id}/void`, { reason: 'Cobro duplicado' })).status, 403)
    const admin = await as('admin@demo.clinara')
    assert.equal((await admin.post(`/api/payments/${pay.body.id}/void`, { reason: 'Cobro de prueba' })).body.voided, true)
  })
})

describe('reportes y configuración', () => {
  test('administración obtiene indicadores; el médico no', async () => {
    const admin = await as('admin@demo.clinara')
    const to = today()
    const d = new Date(); d.setDate(d.getDate() - 30)
    const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const r = await admin.get(`/api/reports?from=${from}&to=${to}`)
    assert.equal(r.status, 200)
    assert.equal(r.body.days.length, 31)
    assert.ok(r.body.totals.revenue > 0)
    assert.ok(r.body.topDiagnoses.length > 0)
    const doc = await as('lherrera@demo.clinara')
    assert.equal((await doc.get(`/api/reports?from=${from}&to=${to}`)).status, 403)
  })

  test('administración cambia el nombre de la clínica y el precio de un servicio', async () => {
    const admin = await as('admin@demo.clinara')
    const boot = await admin.get('/api/bootstrap')
    const s = await admin.call('PUT', '/api/settings', { ...boot.body.settings, name: 'Clínica de Prueba' })
    assert.equal(s.body.name, 'Clínica de Prueba')
    const svc = await admin.patch('/api/services/svc-gen', { price: 550 })
    assert.equal(svc.body.price, 550)
    const rec = await as('smejia@demo.clinara')
    assert.equal((await rec.patch('/api/services/svc-gen', { price: 1 })).status, 403)
  })

  test('el horario del médico limita la reserva en línea', async () => {
    const admin = await as('admin@demo.clinara')
    const r = await admin.patch('/api/staff/s-zuniga', { schedule: { days: [2], start: '10:00', end: '11:00', slot: 30 } })
    assert.deepEqual(r.body.schedule.days, [2])
    const d = new Date(); d.setDate(d.getDate() + 1)
    while (d.getDay() === 2) d.setDate(d.getDate() + 1)
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const { slots } = await (await fetch(`${base}/api/public/santa-brigida/slots?doctorId=s-zuniga&date=${date}`)).json() as any
    assert.deepEqual(slots, [])
  })
})

describe('verificación en dos pasos', () => {
  test('tras activarla, el login pide el código', async () => {
    const { totp } = await import('./totp.js')
    const nurse = await as('crios@demo.clinara')
    const setup = await nurse.post('/api/auth/2fa/setup')
    assert.match(setup.body.qr, /<svg/)
    assert.equal((await nurse.post('/api/auth/2fa/enable', { code: '000000' })).status, 400)
    assert.equal((await nurse.post('/api/auth/2fa/enable', { code: totp(setup.body.secret) })).status, 200)
    const step1 = await as('crios@demo.clinara')
    assert.equal(step1.login.twoFactor, true)
    assert.equal((await step1.get('/api/bootstrap')).status, 401)
    const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'crios@demo.clinara', password: DEMO_PASSWORD, code: totp(setup.body.secret) }) })
    assert.equal(res.status, 200)
    const admin = await as('admin@demo.clinara')
    await admin.patch('/api/staff/s-rios', { twoFactor: false })
    assert.equal((await as('crios@demo.clinara')).login.user.twoFactor, false)
  })
})

describe('archivos del expediente', () => {
  test('enfermería sube un PDF, el médico lo ve y recepción no tiene acceso', async () => {
    const nurse = await as('crios@demo.clinara')
    const pdf = Buffer.from('%PDF-1.4 resultado de laboratorio').toString('base64')
    const up = await nurse.post('/api/patients/p1/attachments', { name: 'Hemograma.pdf', mime: 'application/pdf', category: 'lab', data: pdf })
    assert.equal(up.status, 201)
    const bad = await nurse.post('/api/patients/p1/attachments', { name: 'x.exe', mime: 'application/x-msdownload', category: 'other', data: pdf })
    assert.equal(bad.status, 400)
    const doc = await as('lherrera@demo.clinara')
    const list = await doc.get('/api/patients/p1/attachments')
    assert.equal(list.body[0].name, 'Hemograma.pdf')
    const rec = await as('smejia@demo.clinara')
    assert.equal((await rec.get('/api/patients/p1/attachments')).status, 403)
  })
})

describe('formato de historia clínica', () => {
  test('la ficha de identificación y los antecedentes se guardan; recepción no ve los antecedentes', async () => {
    const rec = await as('smejia@demo.clinara')
    const p = await rec.post('/api/patients', { firstName: 'Lucía', lastName: 'Prueba', birthDate: '1980-01-01', sex: 'F', phone: '99991111',
      dni: '0801-1980-00001', civilStatus: 'Casada', occupation: 'Abogada', address: 'Tegucigalpa', emergencyName: 'Juan', emergencyPhone: '99992222', emergencyRelation: 'Esposo' })
    assert.equal(p.status, 201)
    assert.equal((await rec.patch(`/api/patients/${p.body.id}`, { background: { surgical: 'Apendicectomía' } })).status, 403)
    const doc = await as('lherrera@demo.clinara')
    const upd = await doc.patch(`/api/patients/${p.body.id}`, { background: { surgical: 'Apendicectomía (2010)', family: 'Madre con HTA' } })
    assert.equal(upd.body.background.surgical, 'Apendicectomía (2010)')
    assert.equal(upd.body.dni, '0801-1980-00001')
    const boot = await rec.get('/api/bootstrap')
    const mine = boot.body.patients.find((x: any) => x.id === p.body.id)
    assert.equal(mine.occupation, 'Abogada')
    assert.equal(mine.background, undefined)
  })

  test('las órdenes médicas se guardan numeradas y la nota de consulta trae los signos', async () => {
    const doc = await as('lherrera@demo.clinara')
    const chart = await doc.get('/api/patients/p1/chart')
    const c1 = chart.body.consultations.find((c: any) => c.id === 'c1')
    assert.ok(c1.orders.length >= 3)
    const note = await doc.get('/api/consultations/c1')
    assert.equal(note.body.vitals.respRate, 16)
    assert.equal(note.body.patient.background.surgical, 'Colecistectomía laparoscópica (2019).')
  })

  test('la agenda puede consultar cualquier rango de fechas', async () => {
    const rec = await as('smejia@demo.clinara')
    const d = new Date(); d.setDate(d.getDate() - 120)
    const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const r = await rec.get(`/api/appointments?from=${from}&to=${today()}`)
    assert.equal(r.status, 200)
    assert.ok(r.body.length > 100)
  })
})

describe('varias clínicas', () => {
  test('el personal de una clínica no ve pacientes, consultas ni citas de otra', async () => {
    const otro = await as('erosales@demo.clinara')
    assert.equal(otro.status, 200)
    const boot = await otro.get('/api/bootstrap')
    assert.ok(boot.body.patients.length > 0)
    assert.ok(boot.body.patients.every((x: any) => x.id.startsWith('q')))
    assert.ok(!boot.body.staff.some((x: any) => x.id === 's-herrera'))
    assert.equal(boot.body.settings.name, 'Centro Médico San Lucas')
    assert.equal((await otro.get('/api/patients/p1/chart')).status, 404)
    assert.equal((await otro.get('/api/consultations/c1')).status, 404)
    assert.equal((await otro.get('/api/prescriptions/rx1')).status, 404)
    const r = await otro.get(`/api/appointments?from=${today()}&to=${today()}`)
    assert.ok(r.body.every((a: any) => a.doctorId === 's2-rosales'))
    const cross = await otro.post('/api/appointments', { patientId: 'p1', doctorId: 's2-rosales', start: `${today()}T18:00`, minutes: 30, reason: 'x', type: 'followup' })
    assert.equal(cross.status, 400)
    const admin2 = await as('admin.sanlucas@demo.clinara')
    assert.equal((await admin2.patch('/api/staff/s-herrera', { active: false })).status, 404)
    const audit = (await admin2.get('/api/bootstrap')).body.audit
    assert.ok(audit.every((e: any) => !String(e.action).includes('María José')))
  })

  test('la administración de Clinara crea una clínica y su personal, sin ver expedientes', async () => {
    const sa = await as('superadmin@demo.clinara')
    assert.equal(sa.status, 200)
    assert.equal(sa.login.user.role, 'superadmin')
    const boot = await sa.get('/api/bootstrap')
    assert.equal(boot.body.patients.length, 0)
    assert.equal((await sa.get('/api/patients/p1/chart')).status, 403)
    const list = await sa.get('/api/platform/clinics')
    assert.equal(list.body.length, 2)
    assert.ok(list.body[0].stats.patients > 0)

    const created = await sa.post('/api/platform/clinics', { name: 'Clínica Nueva Esperanza', address: 'La Ceiba', phone: '2440-0000', admin: { name: 'Ana Admin', email: 'ana@esperanza.test' } })
    assert.equal(created.status, 201)
    assert.equal(created.body.clinic.slug, 'clinica-nueva-esperanza')
    const doc = await sa.post(`/api/platform/clinics/${created.body.clinic.id}/staff`, { name: 'Dr. Nuevo Médico', role: 'doctor', email: 'nuevo@esperanza.test', license: 'CMH-1' })
    assert.equal(doc.status, 201)

    const ana = await as('ana@esperanza.test', created.body.password)
    assert.equal(ana.status, 200)
    const anaBoot = await ana.get('/api/bootstrap')
    assert.equal(anaBoot.body.patients.length, 0)
    assert.equal(anaBoot.body.settings.name, 'Clínica Nueva Esperanza')
    assert.ok(anaBoot.body.services.length > 0)
    const pt = await ana.post('/api/patients', { firstName: 'Primer', lastName: 'Paciente', birthDate: '2000-01-01', sex: 'F', phone: '99990000' })
    assert.equal(pt.body.record, 'EXP-00401')
    assert.equal((await ana.get('/api/platform/clinics')).status, 403)
    assert.equal((await ana.post('/api/staff', { name: 'Intruso', role: 'superadmin', email: 'x@x.test' })).status, 400)

    // Al desactivar la clínica su personal pierde el acceso y la reserva en línea desaparece
    await sa.patch(`/api/platform/clinics/${created.body.clinic.id}`, { active: false })
    assert.equal((await ana.get('/api/bootstrap')).status, 401)
    assert.equal((await as('ana@esperanza.test', created.body.password)).status, 403)
    assert.equal((await fetch(`${base}/api/public/clinica-nueva-esperanza/clinic`)).status, 404)
    const pub = await (await fetch(`${base}/api/public/clinics`)).json() as any
    assert.ok(!pub.some((c: any) => c.slug === 'clinica-nueva-esperanza'))
  })
})
