import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb, linkPendingAdmissions, SCHEMA } from './db.js'
import { createSql, type Sql } from './sql.js'
import { autoQuantity, formatDni, normalizeDni } from '../src/lib/format.js'
import { durationDays, frequencyHours, splitOrders, treatmentDay } from '../src/lib/inpatient.js'

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

describe('M8 identidad con guiones automáticos', () => {
  test('sólo cuentan los dígitos y los guiones salen después del 4.º y del 8.º', () => {
    assert.equal(formatDni('0801'), '0801')
    assert.equal(formatDni('08011'), '0801-1')
    assert.equal(formatDni('080119901'), '0801-1990-1')
    assert.equal(formatDni('0801199012345'), '0801-1990-12345')
    assert.equal(formatDni('0801-1990-12345'), '0801-1990-12345')
    assert.equal(formatDni('08a01 1990.1234599'), '0801-1990-12345')
    // Otra máscara configurada por la clínica, y sin máscara el texto se deja libre
    assert.equal(formatDni('123456789', '000 000 000'), '123 456 789')
    assert.equal(formatDni('AB12345', ''), 'AB12345')
  })
  test('se guarda siempre con guiones y la base vieja se migra', async () => {
    assert.equal(normalizeDni('0801199012345'), '0801-1990-12345')
    assert.equal(normalizeDni(' 0801 1990 12345 '), '0801-1990-12345')
    assert.equal(normalizeDni(''), undefined)
    const rec = await as('smejia@demo.clinara')
    const r = await rec.post('/api/patients', { firstName: 'Iris', lastName: 'Matute', birthDate: '1990-01-01', sex: 'F', phone: '9444-1111', dni: '0801199077777' })
    assert.equal(r.status, 201)
    const row = await sql.one('SELECT dni FROM patients WHERE id = ?', [r.body.id])
    assert.equal(row!.dni, '0801-1990-77777')
    // Un dato viejo sin guiones se corrige al actualizar el esquema
    await sql.run(`UPDATE patients SET dni = '0801199088888' WHERE id = ?`, [r.body.id])
    await sql.run(`UPDATE patients SET guardian_dni = '0801 1980 55555' WHERE id = ?`, [r.body.id])
    await sql.exec(SCHEMA)
    const migrated = await sql.one('SELECT dni, guardian_dni FROM patients WHERE id = ?', [r.body.id])
    assert.equal(migrated!.dni, '0801-1990-88888')
    assert.equal(migrated!.guardian_dni, '0801-1980-55555')
  })
  test('el expediente migrado llega con guiones a todos los roles', async () => {
    const rec = await as('smejia@demo.clinara')
    const boot = await rec.get('/api/bootstrap')
    const p = boot.body.patients.find((x: any) => x.dni === '0801-1990-88888')
    assert.ok(p)
  })
})

/** Consulta externa de hoy de la Dra. Herrera para un paciente que llega sin cita, lista para firmar. */
async function openConsult(patientId: string) {
  const nurse = await as('crios@demo.clinara')
  const doc = await as('lherrera@demo.clinara')
  const w = await nurse.post('/api/appointments/walk-in', { patientId, doctorId: 's-herrera', reason: 'Consulta' })
  assert.equal(w.status, 201, JSON.stringify(w.body))
  await doc.post(`/api/appointments/${w.body.id}/status`, { status: 'in_consult' })
  return { doc, nurse, apptId: String(w.body.id) }
}
const DX = [{ code: 'A09', label: 'Gastroenteritis aguda' }]
const ONDANSETRON = { drug: 'Ondansetrón', presentation: 'Ampolla 8 mg/4 ml', dose: '8 mg', route: 'Intravenosa', frequency: 'Cada 8 horas', duration: '' }
const SALINA = { drug: 'Solución salina 0.9 %', presentation: 'Bolsa 1000 ml', dose: '1000 ml', route: 'Intravenosa', frequency: 'Dosis única', duration: '' }
const freeBed = async (doc: Awaited<ReturnType<typeof as>>) => {
  const boot = (await doc.get('/api/bootstrap')).body
  const used = new Set(boot.inpatients.map((h: any) => h.bedId))
  return boot.beds.find((b: any) => b.active && !used.has(b.id)).id as string
}

describe('M1 orden médica → hoja de medicamentos (regresión)', () => {
  before(async () => {
    const admin = await as('admin@demo.clinara')
    const all = Object.fromEntries(['0', '1', '2', '3', '4', '5', '6'].map((d) => [d, [{ start: '00:00', end: '23:45' }]]))
    await admin.patch('/api/staff/s-herrera/schedule', { slot: 15, week: all })
  })

  test('caso 1: ondansetrón en la consulta con ingreso a hospitalización llega a la hoja, sin receta', async () => {
    const { doc, nurse, apptId } = await openConsult('p15')
    const c = await doc.post('/api/consultations', { appointmentId: apptId, reason: 'Vómitos', diagnoses: DX, orders: ['Dieta líquida.'], indications: ['Dieta líquida.'], admit: true, items: [ONDANSETRON] })
    assert.equal(c.status, 201, JSON.stringify(c.body))
    assert.equal(c.body.stayKind, 'hospital')
    assert.equal(c.body.medOrders, 1)
    assert.equal(c.body.prescriptionId, null, 'con ingreso no se emite receta')
    const file = (await nurse.get(`/api/inpatient/${c.body.hospitalizationId}`)).body
    assert.equal(file.hospitalization.consultationId, c.body.consultationId)
    assert.equal(file.meds.length, 1)
    const m = file.meds[0]
    assert.equal(m.drug, 'Ondansetrón')
    assert.equal(m.everyHours, 8)
    assert.equal(m.days, undefined, 'sin días: hasta nueva orden')
    assert.equal(m.source, 'consultation')
    assert.equal(m.sourceId, c.body.consultationId)
    assert.equal(m.orderedBy, 's-herrera')
    // Enfermería la puede aplicar
    assert.equal((await nurse.post(`/api/inpatient/meds/${m.id}/doses`, { scheduledAt: m.firstAt })).status, 201)
    // Firmar dos veces la misma consulta no duplica
    assert.equal((await doc.post('/api/consultations', { appointmentId: apptId, reason: 'Vómitos', diagnoses: DX, orders: ['x'], admit: true, items: [ONDANSETRON] })).status, 409)
    assert.equal((await doc.get(`/api/inpatient/${c.body.hospitalizationId}`)).body.meds.length, 1)
  })

  test('caso 2: el ingreso rehecho jala la orden y el medicamento de la consulta sin duplicarlos', async () => {
    const { doc, apptId } = await openConsult('p16')
    const c = await doc.post('/api/consultations', { appointmentId: apptId, reason: 'Vómitos', diagnoses: DX, orders: ['Dieta líquida.'], indications: ['Dieta líquida.'], admit: true, items: [ONDANSETRON] })
    const first = c.body.hospitalizationId
    // El primer ingreso estaba mal: se cierra y se vuelve a ingresar desde el tablero, sin decir de qué consulta viene
    assert.equal((await doc.post(`/api/inpatient/${first}/discharge`, { diagnoses: DX, summary: 'Ingreso registrado por error.', condition: 'Estable' })).status, 201)
    const again = await doc.post('/api/inpatient', { patientId: 'p16', bedId: await freeBed(doc), reason: 'Vómitos', diagnoses: DX })
    assert.equal(again.status, 201, JSON.stringify(again.body))
    assert.equal(again.body.consultationId, c.body.consultationId, 'se vincula a su consulta externa')
    assert.equal(again.body.medOrders, 1)
    const file = (await doc.get(`/api/inpatient/${again.body.id}`)).body
    assert.deepEqual(file.meds.map((m: any) => m.drug), ['Ondansetrón'])
    // Ronda 3 (P1): ya no se corrige el ingreso; se editan los datos generales, y eso tampoco duplica
    assert.equal((await doc.patch(`/api/inpatient/${again.body.id}`, { companionName: 'Rosa Pérez' })).status, 200)
    assert.equal((await doc.get(`/api/inpatient/${again.body.id}`)).body.meds.length, 1)
  })

  test('caso 3: consulta a observación con solución salina; enfermería la ve; al hospitalizar no se duplica', async () => {
    const { doc, nurse, apptId } = await openConsult('p17')
    const c = await doc.post('/api/consultations', { appointmentId: apptId, reason: 'Deshidratación', diagnoses: DX, orders: ['Signos vitales cada hora.'], observe: true, items: [SALINA] })
    assert.equal(c.status, 201, JSON.stringify(c.body))
    assert.equal(c.body.stayKind, 'observation')
    const file = (await nurse.get(`/api/inpatient/${c.body.hospitalizationId}`)).body
    assert.deepEqual(file.meds.map((m: any) => m.drug), ['Solución salina 0.9 %'])
    assert.equal((await nurse.post(`/api/inpatient/meds/${file.meds[0].id}/doses`, { scheduledAt: file.meds[0].firstAt })).status, 201)
    // Nota de observación con otro medicamento: también llega a la hoja
    const note = await doc.post(`/api/inpatient/${c.body.hospitalizationId}/notes`, { kind: 'evolution', subjective: 'S', objective: 'O', assessment: 'A', plan: 'P',
      meds: [{ drug: 'Metoclopramida', dose: '10 mg', route: 'Intravenosa', everyHours: 8, prn: false }] })
    assert.equal(note.status, 201)
    assert.equal((await doc.post(`/api/inpatient/${c.body.hospitalizationId}/convert`, { bedId: await freeBed(doc) })).status, 200)
    const hosp = (await nurse.get(`/api/inpatient/${c.body.hospitalizationId}`)).body
    assert.deepEqual(hosp.meds.map((m: any) => m.drug).sort(), ['Metoclopramida', 'Solución salina 0.9 %'])
    assert.equal(hosp.doses.length, 1)
  })

  test('ambulatorio: sólo lo marcado "Aplicar en la clínica" va a la hoja; lo demás a la receta', async () => {
    const { doc, apptId } = await openConsult('p9')
    const home = { drug: 'Acetaminofén', presentation: 'Tableta 500 mg', dose: '1 tableta', route: 'Oral', frequency: 'Cada 8 horas', duration: '3 días' }
    const c = await doc.post('/api/consultations', { appointmentId: apptId, reason: 'Fiebre', diagnoses: DX, orders: [], items: [home, { ...SALINA, applyInClinic: true }] })
    assert.equal(c.status, 201, JSON.stringify(c.body))
    assert.equal(c.body.stayKind, 'observation')
    const rx = (await doc.get(`/api/prescriptions/${c.body.prescriptionId}`)).body
    assert.deepEqual(rx.prescription.items.map((i: any) => i.drug), ['Acetaminofén'])
    assert.deepEqual((await doc.get(`/api/inpatient/${c.body.hospitalizationId}`)).body.meds.map((m: any) => m.drug), ['Solución salina 0.9 %'])
  })

  test('suspender desde la hoja deja motivo y autor; la orden no se borra', async () => {
    const { doc, nurse, apptId } = await openConsult('p8')
    const c = await doc.post('/api/consultations', { appointmentId: apptId, reason: 'Vómitos', diagnoses: DX, orders: [], observe: true, items: [ONDANSETRON] })
    const med = (await doc.get(`/api/inpatient/${c.body.hospitalizationId}`)).body.meds[0]
    assert.equal((await nurse.post(`/api/inpatient/meds/${med.id}/stop`, { reason: 'Ya no vomita' })).status, 403)
    const s = await doc.post(`/api/inpatient/meds/${med.id}/stop`, { reason: 'Ya no vomita' })
    assert.equal(s.status, 200)
    assert.equal(s.body.stopReason, 'Ya no vomita')
    assert.equal(s.body.stoppedBy, 's-herrera')
    assert.equal((await doc.get(`/api/inpatient/${c.body.hospitalizationId}`)).body.meds.length, 1)
  })
})

describe('M4 la consulta con ingreso es la nota de ingreso (regresión)', () => {
  test('no se pide otra nota de ingreso; se evoluciona directo y se completa la cama después', async () => {
    const { doc, apptId } = await openConsult('p7')
    const c = await doc.post('/api/consultations', { appointmentId: apptId, reason: 'Dolor abdominal', diagnoses: DX, orders: ['Nada por boca.'], indications: ['Nada por boca.'], admit: true })
    assert.equal(c.status, 201)
    const id = c.body.hospitalizationId
    const h = (await doc.get(`/api/inpatient/${id}`)).body.hospitalization
    assert.equal(h.kind, 'hospital')
    assert.equal(h.consultationId, c.body.consultationId)
    assert.equal(h.reason, 'Dolor abdominal')
    assert.deepEqual(h.diagnoses, DX)
    assert.equal(h.admittedBy, 's-herrera')
    // Una segunda nota de ingreso no se pide ni se acepta; la de evolución sí
    assert.equal((await doc.post(`/api/inpatient/${id}/notes`, { kind: 'admission', subjective: 'S', objective: 'O', assessment: 'A', plan: 'P' })).status, 409)
    assert.equal((await doc.post(`/api/inpatient/${id}/notes`, { kind: 'evolution', subjective: 'S', objective: 'O', assessment: 'A', plan: 'P' })).status, 201)
    const bed = await freeBed(doc)
    const done = await doc.patch(`/api/inpatient/${id}`, { bedId: bed, companionName: 'Rosa Pérez', companionPhone: '9888-1234' })
    assert.equal(done.status, 200)
    assert.equal(done.body.bedId, bed)
    assert.equal(done.body.companionPhone, '9888-1234')
  })
})

describe('M3 días según el tipo de atención (regresión)', () => {
  test('ambulatorio exige los días de la receta; con ingreso son opcionales', async () => {
    const a = await openConsult('p6')
    const noDays = { drug: 'Amoxicilina', presentation: 'Cápsula 500 mg', dose: '1 cápsula', route: 'Oral', frequency: 'Cada 8 horas', duration: '' }
    const bad = await a.doc.post('/api/consultations', { appointmentId: a.apptId, reason: 'Faringitis', diagnoses: DX, orders: [], items: [noDays] })
    assert.equal(bad.status, 400)
    assert.match(bad.body.error, /total de días de Amoxicilina/)
    const ok = await a.doc.post('/api/consultations', { appointmentId: a.apptId, reason: 'Faringitis', diagnoses: DX, orders: [], items: [noDays], observe: true })
    assert.equal(ok.status, 201)
    const withDays = await openConsult('p10')
    const r = await withDays.doc.post('/api/consultations', { appointmentId: withDays.apptId, reason: 'Faringitis', diagnoses: DX, orders: [], items: [{ ...noDays, duration: '7 días' }], admit: true })
    assert.equal((await withDays.doc.get(`/api/inpatient/${r.body.hospitalizationId}`)).body.meds[0].days, 7)
  })
  test('frecuencia, días y cantidad se leen de la receta', () => {
    assert.equal(frequencyHours('Cada 8 horas'), 8)
    assert.equal(frequencyHours('Dosis única'), undefined)
    assert.equal(durationDays('5 días'), 5)
    assert.equal(durationDays('1 semana'), 7)
    assert.equal(durationDays(''), undefined)
    assert.equal(autoQuantity({ dose: '1 tableta', frequency: 'Cada 8 horas', duration: '3 días' }), '9 tabletas')
    assert.equal(autoQuantity({ dose: '1 g', frequency: 'Cada 8 horas', duration: '3 días' }), undefined)
    assert.equal(treatmentDay({ firstAt: new Date().toISOString() }), 'Día 1 · Hasta nueva orden')
    assert.equal(treatmentDay({ firstAt: new Date(Date.now() - 86_400_000).toISOString(), days: 5 }), 'Día 2 de 5')
  })
})

describe('M4 ingresos que quedaron pendientes de nota de ingreso', () => {
  test('la actualización los vincula a su consulta y jala sus medicamentos sin duplicar', async () => {
    const { doc, apptId } = await openConsult('p5')
    const c = await doc.post('/api/consultations', { appointmentId: apptId, reason: 'Neumonía', diagnoses: DX, orders: [], observe: true, items: [ONDANSETRON] })
    // Así quedaba antes: la consulta sin marca de ingreso y una hospitalización hecha a mano, sin su consulta
    await sql.run('UPDATE hospitalizations SET consultation_id = NULL, kind = ? WHERE id = ?', ['hospital', c.body.hospitalizationId])
    await sql.run('UPDATE hosp_meds SET source_id = NULL, source_index = NULL WHERE hospitalization_id = ?', [c.body.hospitalizationId])
    await linkPendingAdmissions(sql)
    const file = (await doc.get(`/api/inpatient/${c.body.hospitalizationId}`)).body
    assert.equal(file.hospitalization.consultationId, c.body.consultationId)
    assert.equal(file.meds.length, 1, 'el ondansetrón ya estaba activo: no se duplica')
    await linkPendingAdmissions(sql)
    assert.equal((await doc.get(`/api/inpatient/${c.body.hospitalizationId}`)).body.meds.length, 1)
  })
})

describe('M2 nota de observación en dos columnas', () => {
  test('el medicamento va con la nota y las indicaciones a la derecha; el checklist conserva su índice', async () => {
    const { doc, apptId } = await openConsult('p4')
    const c = await doc.post('/api/consultations', { appointmentId: apptId, reason: 'Deshidratación', diagnoses: DX, orders: [], observe: true, items: [SALINA] })
    const id = c.body.hospitalizationId
    const r = await doc.post(`/api/inpatient/${id}/notes`, { kind: 'evolution', subjective: 'S', objective: 'O', assessment: 'A', plan: 'P', indicationCount: 2,
      orders: ['Signos vitales cada hora.', 'Dieta líquida.', 'Solución salina 0.9 % 1000 ml IV dosis única'] })
    assert.equal(r.status, 201)
    assert.equal(r.body.indicationCount, 2)
    const file = (await doc.get(`/api/inpatient/${id}`)).body
    const split = splitOrders(file.notes.at(-1), file)
    assert.deepEqual(split.indications.map((o) => o.index), [0, 1])
    assert.deepEqual(split.meds.map((o) => o.text), ['Solución salina 0.9 % 1000 ml IV dosis única'])
    assert.equal(split.meds[0].index, 2)
    // Una nota anterior, sin el dato, se reparte reconociendo el medicamento por su nombre
    const legacy = { ...file.notes.at(-1), indicationCount: undefined, orders: ['Solución salina 0.9 % 1000 ml IV', 'Reposo.', 'OMITIR Ondansetrón'] }
    assert.deepEqual(splitOrders(legacy, file).indications.map((o) => o.text), ['Reposo.'])
  })
})

describe('M7 receta para paciente no registrado', () => {
  test('se emite sin expediente, queda en el historial y se vincula al registrarlo', async () => {
    const doc = await as('lherrera@demo.clinara')
    const item = { drug: 'Amoxicilina', presentation: 'Cápsula 500 mg', dose: '1 cápsula', route: 'Oral', frequency: 'Cada 8 horas', duration: '7 días' }
    const before = Number((await sql.one<{ n: number }>('SELECT COUNT(*)::int AS n FROM patients'))!.n)
    const r = await doc.post('/api/prescriptions', { guest: { name: 'Marvin Osorto', age: '34 años', sex: 'M', dni: '0801199012345', phone: '9555-0000' }, items: [item] })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    assert.equal(Number((await sql.one<{ n: number }>('SELECT COUNT(*)::int AS n FROM patients'))!.n), before, 'no crea expediente')
    const rx = (await doc.get(`/api/prescriptions/${r.body.prescriptionId}`)).body
    assert.equal(rx.patient, null)
    assert.equal(rx.prescription.guest.name, 'Marvin Osorto')
    assert.equal(rx.prescription.guest.dni, '0801-1990-12345')
    assert.match(rx.prescription.folio, /^RX-/)
    assert.ok((await doc.get('/api/bootstrap')).body.prescriptions.some((x: any) => x.id === r.body.prescriptionId && x.patientId === '' && x.guest.name === 'Marvin Osorto'))
    // Sin nombre o sin días no se emite; enfermería no emite recetas
    assert.equal((await doc.post('/api/prescriptions', { guest: { name: 'M' }, items: [item] })).status, 400)
    assert.equal((await doc.post('/api/prescriptions', { guest: { name: 'Marvin Osorto' }, items: [{ ...item, duration: '' }] })).status, 400)
    assert.equal((await (await as('crios@demo.clinara')).post('/api/prescriptions', { guest: { name: 'Marvin Osorto' }, items: [item] })).status, 403)
    // Se registra después y la receta pasa a su expediente
    const p = await doc.post('/api/patients', { firstName: 'Marvin', lastName: 'Osorto', birthDate: '1991-04-04', sex: 'M', phone: '9555-0000', dni: '0801199012345' })
    const link = await doc.post(`/api/prescriptions/${r.body.prescriptionId}/link`, { patientId: p.body.id })
    assert.equal(link.status, 200)
    assert.equal(link.body.patientId, p.body.id)
    assert.equal((await doc.post(`/api/prescriptions/${r.body.prescriptionId}/link`, { patientId: p.body.id })).status, 409)
    assert.ok((await doc.get(`/api/patients/${p.body.id}/chart`)).body.prescriptions.some((x: any) => x.id === r.body.prescriptionId))
  })
})

describe('E1 hoja de medicamentos: días pasados', () => {
  test('registrar tarde o corregir una dosis de un día pasado pide motivo y guarda el registro anterior', async () => {
    const doc = await as('lherrera@demo.clinara')
    const nurse = await as('crios@demo.clinara')
    const boot = (await doc.get('/api/bootstrap')).body
    // Un hospitalizado de la demo con una orden diaria que empezó hace dos días
    const h = boot.inpatients.find((x: any) => x.kind === 'hospital' && x.bedId)
    const first = new Date(Date.now() - 2 * 86_400_000); first.setMinutes(0, 0, 0)
    const note = await doc.post(`/api/inpatient/${h.id}/notes`, { kind: 'evolution', subjective: 'S', objective: 'O', assessment: 'A', plan: 'P',
      meds: [{ drug: 'Ceftriaxona', dose: '1 g', route: 'Intravenosa', everyHours: 24, prn: false, firstAt: first.toISOString() }] })
    assert.equal(note.status, 201)
    const med = (await nurse.get(`/api/inpatient/${h.id}`)).body.meds.find((m: any) => m.drug === 'Ceftriaxona')
    assert.equal((await nurse.post(`/api/inpatient/meds/${med.id}/doses`, { scheduledAt: med.firstAt, givenAt: med.firstAt })).status, 400, 'sin motivo no')
    const late = await nurse.post(`/api/inpatient/meds/${med.id}/doses`, { scheduledAt: med.firstAt, givenAt: med.firstAt, reason: 'No se registró en el turno de noche' })
    assert.equal(late.status, 201)
    assert.match(late.body.correctionReason, /Registro tardío/)
    // Corregir: sin motivo no; con motivo cambia y deja rastro
    assert.equal((await nurse.patch(`/api/inpatient/doses/${late.body.id}`, { givenAt: first.toISOString() })).status, 400)
    const fixed = await nurse.patch(`/api/inpatient/doses/${late.body.id}`, { status: 'skipped', note: 'Paciente en ayuno', reason: 'Se registró como aplicada por error' })
    assert.equal(fixed.status, 200)
    assert.equal(fixed.body.status, 'skipped')
    assert.equal(fixed.body.correctedBy, 's-rios')
    const row = await sql.one('SELECT previous FROM hosp_doses WHERE id = ?', [late.body.id])
    assert.equal(JSON.parse(String(row!.previous)).status, 'given')
    assert.equal((await (await as('smejia@demo.clinara')).patch(`/api/inpatient/doses/${late.body.id}`, { reason: 'Intento de recepción' })).status, 403)
  })
})

describe('M6 nota de procedimiento', () => {
  test('el médico la registra en observación con dos horas; enfermería no puede', async () => {
    const { doc, nurse, apptId } = await openConsult('p3')
    const c = await doc.post('/api/consultations', { appointmentId: apptId, reason: 'Herida', diagnoses: DX, orders: ['Curación diaria.'], observe: true })
    const id = c.body.hospitalizationId
    const performedAt = new Date(Date.now() - 40 * 60_000).toISOString()
    const body = { name: 'Sutura de herida', performedAt, text: 'Sutura con nylon 3-0, cinco puntos simples, sin complicaciones.', urgent: true, justification: 'Herida sangrante, no se pudo esperar la firma.' }
    assert.equal((await nurse.post(`/api/inpatient/${id}/procedure-notes`, body)).status, 403)
    assert.equal((await doc.post(`/api/inpatient/${id}/procedure-notes`, { ...body, performedAt: new Date(Date.now() + 3_600_000).toISOString() })).status, 400, 'no puede ser futura')
    const r = await doc.post(`/api/inpatient/${id}/procedure-notes`, body)
    assert.equal(r.status, 201)
    assert.equal(r.body.kind, 'procedure')
    assert.equal(r.body.procedure.performedAt, performedAt)
    assert.ok(r.body.at > performedAt, 'la hora de la nota se guarda aparte')
  })
})

describe('M5 autorizaciones: de hospitalización y quirúrgica', () => {
  test('la de hospitalización se genera al ingresar, una por estancia, y se reutiliza al hospitalizar', async () => {
    const { doc, nurse, apptId } = await openConsult('p2')
    const c = await doc.post('/api/consultations', { appointmentId: apptId, reason: 'Dolor', diagnoses: DX, orders: ['Reposo.'], observe: true })
    const id = c.body.hospitalizationId
    let file = (await nurse.get(`/api/inpatient/${id}`)).body
    assert.equal(file.authorizations.length, 1)
    const a = file.authorizations[0]
    assert.equal(a.template, 'hospital')
    assert.equal(a.status, 'pending')
    assert.deepEqual(a.data.admission.diagnosis, 'Gastroenteritis aguda')
    assert.ok((await nurse.get('/api/bootstrap')).body.inpatients.find((h: any) => h.id === id).authPending)
    // Enfermería anota al acompañante: se reabre la misma hoja, actualizada, sin duplicar
    const again = await nurse.post(`/api/inpatient/${id}/authorizations`, { template: 'hospital', companion: { name: 'Rosa Pérez', phone: '9888-1234', relation: 'Hija' } })
    assert.equal(again.status, 200)
    assert.equal(again.body.id, a.id)
    assert.equal(again.body.data.companion.phone, '9888-1234')
    assert.equal((await (await as('smejia@demo.clinara')).post(`/api/inpatient/${id}/authorizations`, { template: 'hospital' })).status, 403)
    // Firmada con la foto: queda en Anexos; al pasar a hospitalización no se crea otra
    const up = await nurse.post(`/api/patients/p2/attachments`, { name: 'firmada.png', mime: 'image/png', category: 'document', data: 'iVBORw0KGgo=', hospitalizationId: id, title: 'Autorización firmada', takenAt: new Date().toISOString() })
    assert.equal(up.status, 201, JSON.stringify(up.body))
    assert.equal((await nurse.post(`/api/authorizations/${a.id}/status`, { status: 'signed', fileId: up.body.id })).status, 200)
    assert.equal((await doc.post(`/api/inpatient/${id}/convert`, { bedId: await freeBed(doc) })).status, 200)
    file = (await doc.get(`/api/inpatient/${id}`)).body
    assert.equal(file.authorizations.filter((x: any) => x.template === 'hospital').length, 1)
    assert.equal(file.authorizations[0].status, 'signed')
  })
  test('la quirúrgica la generan enfermería o el médico y la nota de procedimiento la reconoce', async () => {
    const { doc, nurse, apptId } = await openConsult('p1')
    const c = await doc.post('/api/consultations', { appointmentId: apptId, reason: 'Dolor en fosa ilíaca derecha', diagnoses: [{ code: 'K35.8', label: 'Apendicitis aguda' }], orders: ['Nada por boca.'], admit: true })
    assert.equal(c.status, 201, JSON.stringify(c.body))
    const id = c.body.hospitalizationId
    assert.equal((await nurse.post(`/api/inpatient/${id}/authorizations`, { template: 'surgical', diagnosis: 'Apendicitis aguda' })).status, 400, 'pide el procedimiento')
    const s = await nurse.post(`/api/inpatient/${id}/authorizations`, { template: 'surgical', procedure: 'Apendicectomía o laparotomía exploradora', diagnosis: 'Apendicitis aguda', anesthesia: 'General',
      witness: { name: 'Carlos Mejía', dni: '0801198011111' } })
    assert.equal(s.status, 201, JSON.stringify(s.body))
    assert.equal(s.body.template, 'surgical')
    assert.equal(s.body.data.doctor.name, 'Dra. Lucía Herrera', 'la firma el médico que ingresó al paciente')
    // Ronda 3 (P5): el testigo se escribe a mano en la hoja; el formulario ya no lo pide
    assert.equal(s.body.data.witness, undefined)
    const up = await doc.post(`/api/patients/p1/attachments`, { name: 'firmada.pdf', mime: 'application/pdf', category: 'document', data: 'JVBERi0=', hospitalizationId: id, title: 'Autorización firmada', takenAt: new Date().toISOString() })
    await doc.post(`/api/authorizations/${s.body.id}/status`, { status: 'signed', fileId: up.body.id })
    const note = await doc.post(`/api/inpatient/${id}/procedure-notes`, { name: 'Apendicectomía', performedAt: new Date().toISOString(), text: 'Apendicectomía abierta sin complicaciones.', authorizationId: s.body.id })
    assert.equal(note.status, 201)
    assert.equal(note.body.procedure.authorizationId, s.body.id)
  })
})

describe('folio de recetas', () => {
  test('después de RX-AAAA-9999 sigue RX-AAAA-10000 y luego 10001', async () => {
    const year = new Date().getFullYear()
    const cid = String((await sql.one(`SELECT clinic_id FROM staff WHERE id = 's-herrera'`))!.clinic_id)
    await sql.run(`INSERT INTO prescriptions (id, folio, patient_id, doctor_id, consultation_id, issued_at, items, clinic_id) VALUES ('rx-9999', ?, 'p1', 's-herrera', '', ?, '[]', ?)`, [`RX-${year}-9999`, new Date().toISOString(), cid])
    const doc = await as('lherrera@demo.clinara')
    const item = { drug: 'Loratadina', presentation: 'Tableta 10 mg', dose: '1 tableta', route: 'Oral', frequency: 'Cada 24 horas', duration: '5 días' }
    const a = await doc.post('/api/prescriptions', { guest: { name: 'Ana Prueba' }, items: [item] })
    const b = await doc.post('/api/prescriptions', { guest: { name: 'Ana Prueba' }, items: [item] })
    assert.equal(a.body.folio, `RX-${year}-10000`)
    assert.equal(b.body.folio, `RX-${year}-10001`)
  })
})
