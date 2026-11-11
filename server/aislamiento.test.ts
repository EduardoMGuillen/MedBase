import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { resetDemo } from './db.js'
import { closeVisitsOfInpatients } from './stayVisits.js'
import { DEMO, bootApp } from './test/helpers.js'

const app = bootApp()
const n = async (q: string, p: unknown[] = []) => Number((await app.sql.one<{ n: number }>(q, p))!.n)

describe('aislamiento entre clínicas: ids ajenos en el cuerpo de la petición', () => {
  test('un resultado externo no se puede colgar de la estancia de otra clínica', async () => {
    const foreign = (await app.sql.one(`SELECT id FROM hospitalizations WHERE clinic_id = ? LIMIT 1`, [DEMO.clinic]))!
    const mine = (await app.sql.one(`SELECT id FROM patients WHERE clinic_id = ? LIMIT 1`, [DEMO.otherClinic]))!
    const nurse = await app.as(DEMO.otherNurse)
    const body = { patientId: String(mine.id), group: 'lab', name: 'Hemograma externo', fileIds: ['x'] }
    const bad = await nurse.post('/api/exams/external-result', { ...body, hospitalizationId: String(foreign.id) })
    assert.equal(bad.status, 404)
    assert.equal(await n(`SELECT COUNT(*)::int AS n FROM exam_orders WHERE clinic_id = ? AND hospitalization_id = ?`, [DEMO.otherClinic, String(foreign.id)]), 0)
    // Sin estancia sigue funcionando
    assert.equal((await nurse.post('/api/exams/external-result', body)).status, 201)
  })
  test('una estancia de la misma clínica pero de otro paciente tampoco', async () => {
    const stay = (await app.sql.one(`SELECT id, patient_id FROM hospitalizations WHERE clinic_id = ? LIMIT 1`, [DEMO.clinic]))!
    const other = (await app.sql.one(`SELECT id FROM patients WHERE clinic_id = ? AND id <> ? LIMIT 1`, [DEMO.clinic, String(stay.patient_id)]))!
    const nurse = await app.as(DEMO.nurse)
    const r = await nurse.post('/api/exams/external-result', { patientId: String(other.id), hospitalizationId: String(stay.id), group: 'lab', name: 'Hemograma externo', fileIds: ['x'] })
    assert.equal(r.status, 404)
  })
  test('la consulta no se firma con signos vitales de otra clínica', async () => {
    const at = new Date().toISOString()
    const pt = (await app.sql.one(`SELECT id FROM patients WHERE clinic_id = ? LIMIT 1`, [DEMO.otherClinic]))!
    await app.sql.run(`INSERT INTO vitals (id, patient_id, taken_at, taken_by, clinic_id) VALUES ('v-ajeno', ?, ?, 's2-montes', ?)`, [String(pt.id), at, DEMO.otherClinic])
    const doctor = await app.as(DEMO.doctor)
    const appt = await app.sql.one(`SELECT id FROM appointments WHERE clinic_id = ? AND doctor_id = 's-solorzano' AND status IN ('scheduled', 'arrived') ORDER BY start LIMIT 1`, [DEMO.clinic])
    assert.ok(appt, 'hay una cita abierta de la doctora en la demo')
    const body = { appointmentId: String(appt.id), reason: 'Control', diagnoses: [{ code: 'J00', label: 'Control' }], orders: ['Reposo'] }
    const r = await doctor.post('/api/consultations', { ...body, vitalsId: 'v-ajeno' })
    assert.equal(r.status, 404, JSON.stringify(r.body))
    assert.equal(await n(`SELECT COUNT(*)::int AS n FROM consultations WHERE vitals_id = 'v-ajeno'`), 0)
    // La misma consulta sin esos signos sí se firma: el 404 es por los signos, no por otra cosa
    assert.equal((await doctor.post('/api/consultations', body)).status, 201)
  })
})

describe('el mantenimiento de la demo no toca a las demás clínicas', () => {
  test('cerrar visitas de internados, limitado a unas clínicas, no cancela citas de otra', async () => {
    const sql = app.sql
    const pt = String((await sql.one(`SELECT id FROM patients WHERE clinic_id = ? LIMIT 1`, [DEMO.otherClinic]))!.id)
    const since = new Date(Date.now() - 3_600_000).toISOString()
    await sql.run(`INSERT INTO hospitalizations (id, clinic_id, patient_id, admitted_at, admitted_by, reason, diagnoses, status, kind) VALUES ('h-ajena', ?, ?, ?, 's2-lobo', 'Prueba', '[]', 'active', 'observation')`,
      [DEMO.otherClinic, pt, since])
    const d = new Date(Date.now() + 3_600_000)
    const pad = (x: number) => String(x).padStart(2, '0')
    const start = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`
    await sql.run(`INSERT INTO appointments (id, patient_id, doctor_id, start, minutes, type, status, reason, clinic_id) VALUES ('a-ajena', ?, 's2-lobo', ?, 30, 'consulta', 'scheduled', 'Prueba', ?)`, [pt, start, DEMO.otherClinic])
    await closeVisitsOfInpatients(sql, new Date(), [DEMO.clinic, DEMO.office])
    assert.equal(String((await sql.one(`SELECT status FROM appointments WHERE id = 'a-ajena'`))!.status), 'scheduled')
    assert.equal(await closeVisitsOfInpatients(sql, new Date(), []), 0)
    // Sin límite (lo que hace la migración) sí la cierra: la prueba de arriba no pasa por casualidad
    assert.ok(await closeVisitsOfInpatients(sql) >= 1)
    assert.notEqual(String((await sql.one(`SELECT status FROM appointments WHERE id = 'a-ajena'`))!.status), 'scheduled')
  })
  test('resetDemo se niega si hay una cuenta de clínica que no es de la demo', async () => {
    const sql = app.sql
    await sql.run(`UPDATE staff SET email = 'recepcion@clinicareal.hn' WHERE id = 's2-sevilla'`)
    const before = await n('SELECT COUNT(*)::int AS n FROM patients')
    await assert.rejects(resetDemo(sql), /no son de la demo/)
    assert.equal(await n('SELECT COUNT(*)::int AS n FROM patients'), before)
    await sql.run(`UPDATE staff SET email = 'bsevilla@demo.clinara' WHERE id = 's2-sevilla'`)
  })
})
