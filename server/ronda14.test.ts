import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb } from './db.js'
import { createSql, type Sql } from './sql.js'
import { capFirst } from '../src/lib/autocap.js'
import { defaultPlace } from '../src/lib/exams.js'

// Ronda 14: con la base y la API (copia en memoria de la demo)
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

export async function as(email: string, password = DEMO_PASSWORD) {
  const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })
  const cookie = res.headers.get('set-cookie')?.split(';')[0] ?? ''
  const call = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(`${base}${path}`, { method, headers: { cookie, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const text = await r.text()
    let parsed: any = text
    try { parsed = JSON.parse(text) } catch { /* no es JSON */ }
    return { status: r.status, body: parsed }
  }
  return { get: (p: string) => call('GET', p), post: (p: string, b?: unknown) => call('POST', p, b) }
}

describe('GE10 (ronda 14): mayúscula inicial', () => {
  test('la primera letra, también con tilde o eñe; lo demás no cambia', () => {
    assert.equal(capFirst('paños con agua helada.'), 'Paños con agua helada.')
    assert.equal(capFirst('ácido fólico'), 'Ácido fólico')
    assert.equal(capFirst('ñame'), 'Ñame')
    assert.equal(capFirst('  evitar luces'), '  Evitar luces')
    assert.equal(capFirst('PH'), 'PH')
    assert.equal(capFirst('500 mg'), '500 mg', 'un número no cambia')
    assert.equal(capFirst(''), '')
  })
})

describe('EX8 (ronda 14): «Externo» o «En la clínica» por defecto', () => {
  test('consulta externa: Externo; estancia: En la clínica si hay laboratorio o imágenes; Consultorio: Externo', () => {
    const clinic = { kind: 'clinic', hasLab: true, hasImaging: true }
    assert.equal(defaultPlace('lab', false, clinic), 'external')
    assert.equal(defaultPlace('imaging', false, clinic), 'external')
    assert.equal(defaultPlace('lab', true, clinic), 'clinic')
    assert.equal(defaultPlace('imaging', true, clinic), 'clinic')
    assert.equal(defaultPlace('lab', true, { kind: 'clinic', hasLab: false, hasImaging: true }), 'external', 'sin laboratorio')
    assert.equal(defaultPlace('imaging', true, { kind: 'clinic', hasLab: true, hasImaging: false }), 'external', 'sin imágenes')
    assert.equal(defaultPlace('lab', true, { kind: 'office', hasLab: true, hasImaging: true }), 'external', 'consultorio')
  })
})

describe('EX11 (ronda 14): la ventana de órdenes también desde la nota', () => {
  test('laboratorio e imagen juntos salen en un solo trabajo (un documento por tipo); enfermería sí, recepción no', async () => {
    const cid = String((await sql.one(`SELECT clinic_id FROM staff WHERE email = 'lherrera@demo.clinara'`))!.clinic_id)
    const pair = await sql.one(`SELECT a.id AS lab, b.id AS img FROM exam_orders a JOIN exam_orders b ON b.patient_id = a.patient_id AND b.grp = 'imaging' AND b.status <> 'cancelled'
      WHERE a.clinic_id = ? AND a.grp = 'lab' AND a.status <> 'cancelled' LIMIT 1`, [cid])
    assert.ok(pair, 'la demo tiene un paciente con laboratorio e imagen')
    const ids = [String(pair!.lab), String(pair!.img)]
    const doc = await as('lherrera@demo.clinara')
    const r = await doc.post('/api/print-jobs', { kind: 'exams', examIds: ids })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    const job = await doc.get(`/api/print-jobs/${r.body.id}`)
    assert.deepEqual(new Set(job.body.exams.map((e: { group: string }) => e.group)), new Set(['lab', 'imaging']))
    const nurse = await as('crios@demo.clinara')
    assert.equal((await nurse.post('/api/print-jobs', { kind: 'exams', examIds: ids })).status, 201)
    const reception = await as('smejia@demo.clinara')
    assert.equal((await reception.post('/api/print-jobs', { kind: 'exams', examIds: ids })).status, 403)
    assert.equal((await reception.get(`/api/print-jobs/${r.body.id}`)).status, 403)
  })
  test('un examen cancelado no se imprime', async () => {
    const e = await sql.one(`SELECT id FROM exam_orders WHERE status = 'cancelled' LIMIT 1`)
    if (!e) return
    const doc = await as('lherrera@demo.clinara')
    const r = await doc.post('/api/print-jobs', { kind: 'exams', examIds: [String(e.id)] })
    assert.ok(r.status === 409 || r.status === 404, String(r.status))
  })
})

/** Una cita de la Dra. Herrera en consulta, con un paciente adulto con identidad y sin estancia activa (copia de una cita suya). */
async function consultFor(n: number) {
  const cid = String((await sql.one(`SELECT clinic_id FROM staff WHERE email = 'lherrera@demo.clinara'`))!.clinic_id)
  const pts = await sql.query(`SELECT p.id FROM patients p WHERE p.clinic_id = ? AND p.dni IS NOT NULL AND p.dni <> '' AND p.birth_date < '2000-01-01'
    AND NOT EXISTS (SELECT 1 FROM hospitalizations h WHERE h.patient_id = p.id AND h.status = 'active') ORDER BY p.id`, [cid])
  const pid = String(pts[n].id)
  const base = (await sql.one(`SELECT * FROM appointments WHERE doctor_id = 's-herrera' ORDER BY start DESC LIMIT 1`))!
  const id = `r14-${n}-${Date.now()}`
  const row = { ...base, id, patient_id: pid, status: 'in_consult', start: new Date().toISOString().slice(0, 16) }
  const cols = Object.keys(row)
  await sql.run(`INSERT INTO appointments (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map((k) => (row as Record<string, unknown>)[k]))
  return { id, pid, cid }
}
const oral = (drug: string) => ({ drug, presentation: 'Tableta 500 mg', dose: '1 tableta', route: 'Oral', frequency: 'Cada 8 horas', duration: '3 días' })
const dx = [{ code: 'CA00', label: 'Rinofaringitis aguda' }]

describe('ME13 y EX10 (ronda 14): «Aplicar en la clínica» sin ingreso y la orden de los exámenes «En la clínica»', () => {
  test('no entra a observación; queda por aplicar; dos órdenes con su folio; enfermería registra', async () => {
    const { id, pid } = await consultFor(0)
    const doc = await as('lherrera@demo.clinara')
    // Con una frecuencia repetida, sin ingreso no se firma
    const bad = await doc.post('/api/consultations', { appointmentId: id, reason: 'Dolor', diagnoses: dx,
      items: [{ drug: 'Diclofenaco', presentation: 'Ampolla 75 mg', dose: '75 mg', route: 'Intramuscular', frequency: 'Cada 12 horas', duration: '', applyInClinic: true }] })
    assert.equal(bad.status, 400)
    assert.match(bad.body.error, /sin ingreso solo se permite dosis STAT/)
    const r = await doc.post('/api/consultations', { appointmentId: id, reason: 'Dolor', diagnoses: dx,
      items: [{ drug: 'Diclofenaco', presentation: 'Ampolla 75 mg', dose: '75 mg', route: 'Intramuscular', frequency: 'Dosis única', duration: '', applyInClinic: true }, oral('Acetaminofén'), oral('Ibuprofeno')],
      exams: [{ group: 'lab', name: 'Perfil lipídico', priority: 'routine', place: 'external' }, { group: 'lab', name: 'Hemograma', priority: 'routine', place: 'clinic' }] })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    assert.equal(r.body.hospitalizationId, null, 'no crea estancia')
    assert.ok(!(await sql.one(`SELECT 1 FROM hospitalizations WHERE patient_id = ? AND status = 'active'`, [pid])))
    assert.ok(r.body.prescriptionId)
    const rx = await sql.one('SELECT items FROM prescriptions WHERE id = ?', [r.body.prescriptionId])
    assert.deepEqual(JSON.parse(String(rx!.items)).map((x: { drug: string }) => x.drug), ['Acetaminofén', 'Ibuprofeno'], 'lo aplicado en la clínica no va a la receta')
    // EX10: dos lotes con folio propio; el de la clínica llega a la bandeja del laboratorio
    assert.ok(r.body.examBatch && r.body.clinicBatch && r.body.examBatch !== r.body.clinicBatch)
    const ext = await sql.one('SELECT order_no, place FROM exam_orders WHERE batch_id = ?', [r.body.examBatch])
    const inn = await sql.one('SELECT order_no, place, area FROM exam_orders WHERE batch_id = ?', [r.body.clinicBatch])
    assert.equal(ext!.place, 'external'); assert.equal(inn!.place, 'clinic')
    assert.notEqual(ext!.order_no, inn!.order_no)
    assert.notEqual(inn!.area, 'none', 'el de la clínica va a una bandeja')
    // ME13: por aplicar
    const apps = await sql.query('SELECT * FROM consult_applications WHERE consultation_id = ?', [r.body.consultationId])
    assert.equal(apps.length, 1)
    assert.equal(apps[0].status, 'pending')
    assert.match(String(apps[0].order_text), /Diclofenaco/)
    const appId = String(apps[0].id)
    assert.equal((await (await as('smejia@demo.clinara')).post(`/api/applications/${appId}`, { status: 'applied' })).status, 403, 'recepción no')
    const nurse = await as('crios@demo.clinara')
    assert.equal((await nurse.post(`/api/applications/${appId}`, { status: 'not_applied' })).status, 400, 'sin motivo no')
    const ok = await nurse.post(`/api/applications/${appId}`, { status: 'applied' })
    assert.equal(ok.status, 200, JSON.stringify(ok.body))
    assert.equal(ok.body.status, 'applied')
    assert.ok(ok.body.appliedAt && ok.body.recordedBy)
    assert.equal((await doc.post(`/api/applications/${appId}`, { status: 'applied' })).status, 409, 'una sola vez')
    const day = new Date(); day.setHours(0, 0, 0, 0)
    const list = await nurse.get(`/api/applications?from=${encodeURIComponent(new Date(day.getTime() - 86_400_000).toISOString())}&to=${encodeURIComponent(new Date(day.getTime() + 2 * 86_400_000).toISOString())}`)
    assert.ok(list.body.some((a: { id: string; appointmentId: string }) => a.id === appId && a.appointmentId === id))
    const consult = await doc.get(`/api/consultations/${r.body.consultationId}`)
    assert.equal(consult.body.applications[0].status, 'applied')
  })
})

describe('ME14 (ronda 14): receta al firmar con ingreso y desde la nota', () => {
  test('con «Ingreso a observación»: receta de lo que no se aplica en la clínica, hoja con lo demás y «Generar receta» con los tres', async () => {
    const { id } = await consultFor(1)
    const doc = await as('lherrera@demo.clinara')
    const r = await doc.post('/api/consultations', { appointmentId: id, reason: 'Dolor', diagnoses: dx, observe: true,
      // Con ingreso, lo que va a la receta se desmarca a propósito (sin la casilla, se aplica en la clínica, como antes)
      items: [{ ...oral('Acetaminofén'), applyInClinic: false }, { ...oral('Ibuprofeno'), applyInClinic: false }, { drug: 'Ceftriaxona', presentation: 'Vial 1 g', dose: '1 g', route: 'Intravenosa', frequency: 'Cada 12 horas', duration: '', applyInClinic: true }],
      exams: [{ group: 'lab', name: 'Hemograma', priority: 'routine', place: 'external' }] })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    assert.equal(r.body.stayKind, 'observation')
    assert.ok(r.body.prescriptionId, 'con ingreso también sale la receta')
    const rx = await sql.one('SELECT items FROM prescriptions WHERE id = ?', [r.body.prescriptionId])
    assert.deepEqual(JSON.parse(String(rx!.items)).map((x: { drug: string }) => x.drug), ['Acetaminofén', 'Ibuprofeno'])
    const sheet = await sql.query('SELECT drug FROM hosp_meds WHERE hospitalization_id = ?', [r.body.hospitalizationId])
    assert.deepEqual(sheet.map((m) => m.drug), ['Ceftriaxona'], 'a la hoja solo lo que se aplica en la clínica')
    assert.equal(await sql.one('SELECT 1 FROM consult_applications WHERE consultation_id = ?', [r.body.consultationId]), undefined, 'con ingreso no hay «por aplicar»')
    const file = await doc.get(`/api/inpatient/${r.body.hospitalizationId}`)
    assert.equal(file.status, 200, JSON.stringify(file.body).slice(0, 200))
    const extra = file.body.consultRxMeds as { id: string; drug: string }[]
    assert.deepEqual(extra.map((m) => m.drug), ['Acetaminofén', 'Ibuprofeno'])
    const all = [...file.body.meds.map((m: { id: string }) => m.id), ...extra.map((m) => m.id)]
    assert.equal(all.length, 3, 'los tres medicamentos, sin repetidos')
    const job = await doc.post('/api/print-jobs', { kind: 'rx', chosen: true, medIds: all, extras: { [extra[0].id]: { days: 3 } } })
    assert.equal(job.status, 201, JSON.stringify(job.body))
    const j = await doc.get(`/api/print-jobs/${job.body.id}`)
    assert.deepEqual(j.body.meds.map((m: { drug: string }) => m.drug).sort(), ['Acetaminofén', 'Ceftriaxona', 'Ibuprofeno'])
    // Enfermería no elige otros medicamentos (tampoco por URL directa)
    const nurse = await as('crios@demo.clinara')
    assert.equal((await nurse.post('/api/print-jobs', { kind: 'rx', chosen: true, medIds: [extra[0].id] })).status, 403)
    assert.equal((await nurse.post('/api/print-jobs', { kind: 'rx', medIds: [extra[0].id] })).status, 400)
  })
})
