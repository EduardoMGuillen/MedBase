import './tz.js'
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { bootApp, DEMO } from './test/helpers.js'
import { OBS_NO_SURGERY } from '../src/lib/clinicalConfig.js'
import { permissionsFor } from '../src/lib/permissions.js'
import { isAnesthesiaStaff, signerOf } from '../src/lib/positions.js'

// Ronda 18: CO1 (cobro en el consultorio), R18-OB1 (sin cirugía en observación) y AN1 (técnico en anestesia)
const app = bootApp()
const as = (email: string, password?: string) => app.as(email, password)

describe('CO1 (ronda 18): el cobro del consultorio va en la vista Administración', () => {
  test('la titular (médica y administradora) no cobra en la vista Médico, ni por dirección directa; en Administración sí', async () => {
    const doc = await as('ipacheco@demo.clinara')
    assert.equal(doc.login.user.role, 'doctor')
    assert.ok(!doc.login.permissions.includes('billing.manage'))
    assert.equal((await doc.get('/api/payments?from=2026-01-01&to=2026-12-31')).status, 403)
    const view = await doc.post('/api/me/view', { role: 'admin' })
    assert.ok(view.body.permissions.includes('billing.manage'))
    assert.equal((await doc.get('/api/payments?from=2026-01-01&to=2026-12-31')).status, 200)
    await doc.post('/api/me/view', { role: 'doctor' })
  })
  test('A7: un médico de consultorio sin rol de Administración conserva «Cobrar»; en una clínica no cambia nada', () => {
    assert.ok(permissionsFor('doctor', 'office', undefined, ['doctor']).includes('billing.manage'))
    assert.ok(!permissionsFor('doctor', 'office', undefined, ['doctor', 'admin']).includes('billing.manage'))
    assert.ok(permissionsFor('doctor', 'clinic', undefined, ['doctor', 'admin']).includes('billing.manage'))
  })
  test('A8: en la vista Médico del consultorio, la médica marca la llegada de su paciente', async () => {
    const doc = await as('ipacheco@demo.clinara')
    const appt = await app.sql.one(`SELECT id FROM appointments WHERE clinic_id = ? AND status IN ('scheduled','confirmed') ORDER BY start DESC LIMIT 1`, [DEMO.office])
    assert.ok(appt, 'la demo del consultorio tiene citas por llegar')
    const r = await doc.post(`/api/appointments/${appt!.id}/status`, { status: 'arrived' })
    assert.equal(r.status, 200, JSON.stringify(r.body))
  })
})

describe('R18-OB1 (ronda 18): en observación no se crean documentos de cirugía', () => {
  const obsStay = async () => String((await app.sql.one(`SELECT id FROM hospitalizations WHERE clinic_id = ? AND status = 'active' AND kind = 'observation' LIMIT 1`, [DEMO.clinic]))!.id)
  test('autorización quirúrgica, valoración preanestésica y nota postquirúrgica nuevas se rechazan (también para enfermería)', async () => {
    const doc = await as(DEMO.doctor)
    const stay = await obsStay()
    const auth = await doc.post(`/api/inpatient/${stay}/authorizations`, { template: 'surgical', procedure: 'Apendicectomía', diagnosis: 'Apendicitis aguda' })
    assert.equal(auth.status, 403); assert.equal(auth.body.error, OBS_NO_SURGERY)
    assert.equal((await (await as(DEMO.nurse)).post(`/api/inpatient/${stay}/authorizations`, { template: 'surgical', procedure: 'Apendicectomía', diagnosis: 'Apendicitis aguda' })).status, 403)
    const pre = await doc.post(`/api/inpatient/${stay}/preanesthesia/upload`, { fileId: 'x', performedBy: { name: 'Dra. Silvia Arita' } })
    assert.equal(pre.status, 403); assert.equal(pre.body.error, OBS_NO_SURGERY)
    assert.equal((await doc.post(`/api/inpatient/${stay}/preanesthesia/sign`, { data: {} })).status, 403)
    const now = new Date().toISOString()
    const note = await doc.post(`/api/inpatient/${stay}/notes`, { kind: 'evolution', format: 'postop', diagnoses: [{ code: 'S/C', label: 'Apendicitis' }],
      postop: { preDiagnoses: [{ code: 'S/C', label: 'Apendicitis' }], startAt: now, endAt: now, anesthesia: 'General', procedureName: 'Apendicectomía', description: 'Técnica habitual, sin complicaciones.',
        team: { surgeon: { name: 'Dra. Valeria Solórzano' } }, urgent: true, justification: 'Urgencia vital, sin tiempo para la autorización' } })
    assert.equal(note.status, 403, JSON.stringify(note.body)); assert.equal(note.body.error, OBS_NO_SURGERY)
  })
  test('en hospitalización se siguen creando', async () => {
    const doc = await as(DEMO.doctor)
    const stay = String((await app.sql.one(`SELECT id FROM hospitalizations WHERE clinic_id = ? AND status = 'active' AND kind <> 'observation' LIMIT 1`, [DEMO.clinic]))!.id)
    const auth = await doc.post(`/api/inpatient/${stay}/authorizations`, { template: 'surgical', procedure: 'Apendicectomía', diagnosis: 'Apendicitis aguda' })
    assert.equal(auth.status, 201, JSON.stringify(auth.body))
  })
})

describe('AN1 (ronda 18): cargo «Técnico(a) en anestesia»', () => {
  let tech: { id: string; email: string; password: string }
  test('administración crea a la persona con el rol Anestesia: queda con el cargo; recepción no puede', async () => {
    const adm = await as('rmoncada@demo.clinara')
    const r = await adm.post('/api/staff', { name: 'Téc. Óscar Paz', role: 'anesthesia', email: 'opaz@prueba.clinara' })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    assert.equal(r.body.user.position, 'anesthesia_tech')
    tech = { id: r.body.user.id, email: 'opaz@prueba.clinara', password: r.body.password }
    assert.equal((await (await as('aquiroz@demo.clinara')).post('/api/staff', { name: 'Otra Persona', role: 'anesthesia', email: 'otra@prueba.clinara' })).status, 403)
    assert.deepEqual(signerOf({ name: 'Óscar Paz', position: 'anesthesia_tech', role: 'anesthesia', license: 'TA-123' }), { name: 'Téc. Óscar Paz', title: 'Técnico(a) en anestesia · N.º de colegiación TA-123' })
  })
  test('«Valoración realizada por» ofrece solo anestesiólogos y técnicos en anestesia', () => {
    assert.ok(isAnesthesiaStaff({ role: 'doctor', specialty: 'Anestesiología' }))
    assert.ok(isAnesthesiaStaff({ role: 'anesthesia', position: 'anesthesia_tech' }))
    assert.ok(!isAnesthesiaStaff({ role: 'doctor', specialty: 'Medicina interna' }))
    assert.ok(!isAnesthesiaStaff({ role: 'nurse', position: 'nurse_aux' }))
    assert.ok(!isAnesthesiaStaff({ role: 'lab', position: 'lab_tech' }))
  })
  test('el técnico ve el expediente en lectura y sus documentos, pero no escribe notas, no ordena ni indica (también por URL directa)', async () => {
    const t = await as(tech.email, tech.password)
    assert.equal(t.status, 200)
    assert.deepEqual([...t.login.permissions].sort(), ['anesthesia.sheet', 'chart.view', 'inpatient.view', 'patients.view'])
    const stay = String((await app.sql.one(`SELECT id FROM hospitalizations WHERE clinic_id = ? AND status = 'active' AND kind <> 'observation' LIMIT 1`, [DEMO.clinic]))!.id)
    assert.equal((await t.get(`/api/inpatient/${stay}`)).status, 200)
    assert.equal((await t.get(`/api/inpatient/${stay}/preanesthesia`)).status, 200)
    assert.equal((await t.post(`/api/inpatient/${stay}/notes`, { kind: 'evolution', format: 'dx', observations: 'No debe poder' })).status, 403)
    assert.equal((await t.post(`/api/inpatient/${stay}/authorizations`, { template: 'surgical', procedure: 'Apendicectomía' })).status, 403)
    assert.equal((await t.post(`/api/inpatient/${stay}/preanesthesia/sign`, { data: {} })).status, 403, 'la valoración en el sistema la escribe un médico')
    assert.equal((await t.get('/api/reports?from=2026-01-01&to=2026-12-31')).status, 403)
    assert.equal((await t.get('/api/anesthesia/pending')).status, 200)
  })
  test('el técnico como anestesiólogo de la nota postquirúrgica: le sale el pendiente y puede llenar la hoja; otro técnico o un médico ajeno, no', async () => {
    const doc = await as(DEMO.doctor)
    const stay = String((await app.sql.one(`SELECT id FROM hospitalizations WHERE clinic_id = ? AND status = 'active' AND kind <> 'observation' AND EXISTS (SELECT 1 FROM hosp_notes n WHERE n.hospitalization_id = hospitalizations.id AND n.kind = 'admission') LIMIT 1`, [DEMO.clinic])
      ?? await app.sql.one(`SELECT id FROM hospitalizations WHERE clinic_id = ? AND status = 'active' AND kind <> 'observation' AND (consultation_id IS NOT NULL OR observation_at IS NOT NULL) LIMIT 1`, [DEMO.clinic]))!.id)
    const now = new Date().toISOString()
    const note = await doc.post(`/api/inpatient/${stay}/notes`, { kind: 'evolution', format: 'postop', diagnoses: [{ code: 'S/C', label: 'Apendicitis' }],
      postop: { preDiagnoses: [{ code: 'S/C', label: 'Apendicitis' }], startAt: now, endAt: now, anesthesia: 'General', procedureName: 'Apendicectomía AN1', description: 'Técnica habitual, sin complicaciones.',
        team: { surgeon: { name: 'Dra. Valeria Solórzano' }, anesthesiologist: { name: 'Téc. Óscar Paz', staffId: tech.id } }, urgent: true, justification: 'Urgencia vital, sin tiempo para la autorización' } })
    assert.equal(note.status, 201, JSON.stringify(note.body))
    const noteId = note.body.note?.id ?? note.body.id
    const t = await as(tech.email, tech.password)
    const pending = await t.get('/api/anesthesia/pending')
    assert.ok(pending.body.some((x: { procedure: string }) => x.procedure === 'Apendicectomía AN1'), JSON.stringify(pending.body))
    const info = await t.get(`/api/anesthesia/notes/${noteId}`)
    assert.equal(info.status, 200); assert.equal(info.body.canFill, true)
    const other = await (await as(DEMO.otherDoctor)).get(`/api/anesthesia/notes/${noteId}`)
    assert.ok(other.status === 404 || other.body.canFill === false)
    assert.equal((await doc.get(`/api/anesthesia/notes/${noteId}`)).body.canFill, false, 'quien no hizo la anestesia no la llena')
  })
})
