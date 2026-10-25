import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb } from './db.js'
import { createSql, type Sql } from './sql.js'
import { doseTimes, HOUR, isScheduled, medLabel, slotState } from '../src/lib/inpatient.js'

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

async function as(email: string) {
  const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: DEMO_PASSWORD }) })
  const cookie = res.headers.get('set-cookie')?.split(';')[0] ?? ''
  const call = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(`${base}${path}`, { method, headers: { cookie, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    return { status: r.status, body: await r.json() as any }
  }
  return { get: (p: string) => call('GET', p), post: (p: string, b?: unknown) => call('POST', p, b), patch: (p: string, b: unknown) => call('PATCH', p, b) }
}

const soap = { subjective: 'Dolor abdominal.', objective: 'Abdomen doloroso.', assessment: 'Dolor abdominal en estudio.', plan: 'Observación.' }

describe('horario de medicamentos', () => {
  const first = '2026-10-20T07:00:00.000Z'
  test('una indicación cada 8 horas genera sus horas y omite las posteriores a la suspensión', () => {
    const m = { firstAt: first, everyHours: 8, prn: false, stoppedAt: '2026-10-20T20:00:00.000Z' }
    const slots = doseTimes(m, new Date('2026-10-20T00:00:00Z'), new Date('2026-10-21T00:00:00Z'))
    assert.deepEqual(slots.map((s) => [s.at.toISOString().slice(11, 16), s.omitted]), [['07:00', false], ['15:00', false], ['23:00', true]])
    assert.ok(isScheduled(m, new Date('2026-10-20T15:00:00Z')))
    assert.ok(!isScheduled(m, new Date('2026-10-20T16:00:00Z')))
    assert.ok(!isScheduled(m, new Date('2026-10-20T23:00:00Z')))
  })
  test('PRN no tiene horario y la dosis única tiene una sola hora', () => {
    assert.equal(doseTimes({ firstAt: first, everyHours: 6, prn: true }, new Date(0), new Date(Date.now() + 1e10)).length, 0)
    assert.equal(doseTimes({ firstAt: first, prn: false }, new Date(0), new Date(Date.now() + 1e10)).length, 1)
  })
  test('se escribe como en la nota médica', () => {
    assert.equal(medLabel({ drug: 'Ondansetrón', dose: '8 mg', route: 'Intravenosa', everyHours: 8, prn: false }), 'Ondansetrón 8 mg IV c/8h')
    assert.equal(medLabel({ drug: 'Tramadol', dose: '50 mg', route: 'Subcutánea', everyHours: 12, prn: true }), 'Tramadol 50 mg SC c/12h PRN')
  })
  test('una dosis sin marcar se vuelve atrasada después de una hora', () => {
    const at = new Date('2026-10-20T07:00:00Z')
    assert.equal(slotState(at, false, undefined, new Date(at.getTime() + 30 * 60_000)), 'due')
    assert.equal(slotState(at, false, undefined, new Date(at.getTime() + 2 * HOUR)), 'late')
    assert.equal(slotState(at, true, undefined, new Date(at.getTime() + 2 * HOUR)), 'omitted')
  })
})

describe('hospitalización', () => {
  test('la demo trae camas por especialidad y hospitalizados que ve el personal clínico', async () => {
    const nurse = await as('crios@demo.clinara')
    const boot = (await nurse.get('/api/bootstrap')).body
    assert.equal(boot.beds.length, 15)
    assert.equal(boot.beds.filter((b: any) => b.specialty === 'Cirugía').length, 10)
    assert.ok(boot.inpatients.length >= 4)
    const rec = await as('smejia@demo.clinara')
    assert.equal((await rec.get('/api/bootstrap')).body.inpatients.length, 0)
    assert.equal((await rec.get('/api/inpatient/hz1')).status, 403)
    // Otra clínica no ve los hospitalizados de ésta
    const other = await as('erosales@demo.clinara')
    assert.equal((await other.get('/api/inpatient/hz1')).status, 404)
  })

  test('ingreso, nota con medicamentos, dosis de enfermería, laboratorio y egreso con receta', async () => {
    const doc = await as('lherrera@demo.clinara')
    const nurse = await as('crios@demo.clinara')

    const bad = await nurse.post('/api/inpatient', { patientId: 'p10', bedId: 'bed-205', reason: 'x', diagnoses: [{ code: 'R10.4', label: 'Dolor abdominal' }] })
    assert.equal(bad.status, 403)
    const taken = await doc.post('/api/inpatient', { patientId: 'p10', bedId: 'bed-203', reason: 'Dolor abdominal', diagnoses: [{ code: 'R10.4', label: 'Dolor abdominal' }] })
    assert.equal(taken.status, 409)

    const admittedAt = new Date(Date.now() - 4 * HOUR).toISOString()
    const h = await doc.post('/api/inpatient', {
      patientId: 'p10', bedId: 'bed-205', admittedAt, reason: 'Dolor abdominal intenso', diagnoses: [{ code: 'R10.4', label: 'Dolor abdominal' }],
      companionName: 'Laura Alvarado', companionRelation: 'Esposa', companionPhone: '8890-0000',
    })
    assert.equal(h.status, 201)
    const id = h.body.id
    assert.equal((await doc.post('/api/inpatient', { patientId: 'p10', bedId: 'bed-206', reason: 'Otro ingreso', diagnoses: [{ code: 'R10.4', label: 'x' }] })).status, 409)

    // Primero va la nota de ingreso
    assert.equal((await doc.post(`/api/inpatient/${id}/notes`, { kind: 'evolution', ...soap })).status, 409)
    const first = new Date(Date.now() - 3 * HOUR); first.setMinutes(0, 0, 0)
    const note = await doc.post(`/api/inpatient/${id}/notes`, {
      kind: 'admission', ...soap,
      meds: [
        { drug: 'Ondansetrón', dose: '8 mg', route: 'Intravenosa', everyHours: 8, firstAt: first.toISOString() },
        { drug: 'Acetaminofén', dose: '1 g', route: 'Intravenosa', everyHours: 6, prn: true },
      ],
    })
    assert.equal(note.status, 201)
    let file = (await nurse.get(`/api/inpatient/${id}`)).body
    const ond = file.meds.find((m: any) => m.drug === 'Ondansetrón')
    const ace = file.meds.find((m: any) => m.drug === 'Acetaminofén')

    // Enfermería marca la dosis de la hora indicada (el médico también puede, ver corrections.test.ts)
    const wrong = await nurse.post(`/api/inpatient/meds/${ond.id}/doses`, { scheduledAt: new Date(first.getTime() + HOUR).toISOString() })
    assert.equal(wrong.status, 400)
    assert.equal((await nurse.post(`/api/inpatient/meds/${ond.id}/doses`, { scheduledAt: ond.firstAt })).status, 201)
    assert.equal((await nurse.post(`/api/inpatient/meds/${ond.id}/doses`, { scheduledAt: ond.firstAt })).status, 409)
    assert.equal((await nurse.post(`/api/inpatient/meds/${ace.id}/doses`, { note: 'Dolor 6/10' })).status, 201)
    const noReason = await nurse.post(`/api/inpatient/meds/${ond.id}/doses`, { scheduledAt: new Date(first.getTime() + 8 * HOUR).toISOString(), status: 'skipped' })
    assert.equal(noReason.status, 400)

    // El médico omite el ondansetrón: las dosis siguientes ya no se pueden marcar
    const evo = await doc.post(`/api/inpatient/${id}/notes`, { kind: 'evolution', ...soap, plan: 'OMITIR ondansetrón.', stopMedIds: [ond.id] })
    assert.equal(evo.status, 201)
    const after8 = await nurse.post(`/api/inpatient/meds/${ond.id}/doses`, { scheduledAt: new Date(first.getTime() + 8 * HOUR).toISOString() })
    assert.equal(after8.status, 409)

    assert.equal((await nurse.post(`/api/inpatient/${id}/nursing`, { text: 'Paciente tranquilo, sin dolor.' })).status, 201)
    assert.equal((await doc.post(`/api/inpatient/${id}/nursing`, { text: 'Nota' })).status, 403)

    // Laboratorio subido a mano: hay que decir qué es y cuándo se tomó
    const pdf = Buffer.from('%PDF-1.4\n%demo\n').toString('base64')
    const noTitle = await nurse.post('/api/patients/p10/attachments', { name: 'lab.pdf', mime: 'application/pdf', category: 'lab', data: pdf, hospitalizationId: id })
    assert.equal(noTitle.status, 400)
    const lab = await nurse.post('/api/patients/p10/attachments', { name: 'lab.pdf', mime: 'application/pdf', category: 'lab', data: pdf, hospitalizationId: id,
      title: 'Hemograma', takenAt: new Date().toISOString() })
    assert.equal(lab.status, 201)

    assert.equal((await nurse.post(`/api/inpatient/${id}/procedures`, { kind: 'authorization', name: 'Autorización de la aseguradora' })).status, 201)

    file = (await doc.get(`/api/inpatient/${id}`)).body
    assert.equal(file.notes.filter((n: any) => n.kind !== 'nursing').length, 2)
    assert.equal(file.doses.length, 2)
    assert.equal(file.labs[0].title, 'Hemograma')
    assert.ok(file.meds.find((m: any) => m.id === ond.id).stoppedAt)

    // Egreso: cierra el expediente, libera la cama y emite la receta
    const out = await doc.post(`/api/inpatient/${id}/discharge`, {
      diagnoses: [{ code: 'R10.4', label: 'Dolor abdominal' }], summary: 'Ingresó por dolor abdominal; mejoró con analgesia.', condition: 'Estable',
      instructions: 'Dieta blanda.', followUp: 'Control en consulta externa en 1 semana.',
      items: [{ drug: 'Paracetamol', presentation: 'Tableta 500 mg', dose: '1 tableta', frequency: 'Cada 8 horas', duration: '3 días' }],
    })
    assert.equal(out.status, 201)
    assert.match(out.body.folio, /^RX-\d{4}-\d{4}$/)
    assert.equal(out.body.hospitalization.status, 'discharged')
    const rx = await doc.get(`/api/prescriptions/${out.body.prescriptionId}`)
    assert.equal(rx.body.hospitalization.id, id)
    assert.equal((await doc.post(`/api/inpatient/${id}/notes`, { kind: 'evolution', ...soap })).status, 409)
    const again = await doc.post('/api/inpatient', { patientId: 'p10', bedId: 'bed-205', reason: 'Reingreso', diagnoses: [{ code: 'R10.4', label: 'x' }] })
    assert.equal(again.status, 201)
    const chart = await doc.get('/api/patients/p10/chart')
    assert.equal(chart.body.hospitalizations.length, 2)
  })

  test('administración configura camas y no puede desactivar una ocupada', async () => {
    const admin = await as('admin@demo.clinara')
    assert.equal((await admin.patch('/api/beds/bed-203', { active: false })).status, 409)
    const created = await admin.post('/api/beds', { room: '211', specialty: 'Cirugía' })
    assert.equal(created.status, 201)
    assert.equal((await admin.post('/api/beds', { room: '211', specialty: 'Cirugía' })).status, 409)
    assert.equal((await admin.get('/api/inpatient/hz1')).status, 403)
  })
})

describe('consulta externa y seguimientos', () => {
  test('enfermería registra a un paciente sin cita y queda en sala', async () => {
    const nurse = await as('crios@demo.clinara')
    const r = await nurse.post('/api/appointments/walk-in', { patientId: 'p7', doctorId: 's-herrera', reason: 'Fiebre' })
    assert.equal(r.status, 201)
    assert.equal(r.body.status, 'arrived')
    assert.equal(r.body.source, 'walkin')
  })

  test('la receta exige la identidad de un adulto; la consulta guarda observaciones y seguimientos', async () => {
    const rec = await as('smejia@demo.clinara')
    const doc = await as('lherrera@demo.clinara')
    const appt = (await rec.post('/api/appointments/walk-in', { patientId: 'p7', doctorId: 's-herrera', reason: 'Cefalea' })).body
    const body = {
      appointmentId: appt.id, reason: 'Cefalea', diagnoses: [{ code: 'R51', label: 'Cefalea' }], orders: ['Paracetamol.'], observations: 'Acude sola.',
      items: [{ drug: 'Paracetamol', presentation: 'Tableta 500 mg', dose: '1 tableta', frequency: 'Cada 8 horas', duration: '3 días' }],
      followups: [{ kind: 'reminder', title: 'Traer resultados de tomografía', dueDate: '2030-01-10' }],
    }
    const noId = await doc.post('/api/consultations', body)
    assert.equal(noId.status, 400)
    assert.match(noId.body.error, /identidad/)
    assert.equal((await rec.patch('/api/patients/p7', { dni: '0801-2002-11111' })).status, 200)
    const ok = await doc.post('/api/consultations', body)
    assert.equal(ok.status, 201)
    const note = await doc.get(`/api/consultations/${ok.body.consultationId}`)
    assert.equal(note.body.consultation.observations, 'Acude sola.')
    const boot = (await rec.get('/api/bootstrap')).body
    assert.ok(boot.followups.some((f: any) => f.patientId === 'p7' && f.title === 'Traer resultados de tomografía'))
  })

  test('el médico programa un crónico; recepción simula el aviso y registra el control', async () => {
    const doc = await as('lherrera@demo.clinara')
    const rec = await as('smejia@demo.clinara')
    assert.equal((await rec.post('/api/followups', { patientId: 'p4', kind: 'chronic', title: 'Hipertensión arterial', dueDate: '2030-01-01', everyDays: 90 })).status, 403)
    assert.equal((await doc.post('/api/followups', { patientId: 'p4', kind: 'chronic', title: 'Hipertensión arterial', dueDate: '2030-01-01' })).status, 400)
    const f = await doc.post('/api/followups', { patientId: 'p4', kind: 'chronic', title: 'Hipertensión arterial', dueDate: '2030-01-01', everyDays: 90 })
    assert.equal(f.status, 201)
    const sent = await rec.post(`/api/followups/${f.body.id}/notify`)
    assert.ok(sent.body.notifiedAt)
    const done = await rec.post(`/api/followups/${f.body.id}/done`)
    assert.equal(done.body.active, true)
    assert.equal(done.body.notifiedAt, undefined)
    assert.notEqual(done.body.dueDate, '2030-01-01')
    const audit = (await (await as('admin@demo.clinara')).get('/api/bootstrap')).body.audit
    assert.ok(audit.some((e: any) => /Simuló el envío por WhatsApp/.test(e.action)))
  })
})
