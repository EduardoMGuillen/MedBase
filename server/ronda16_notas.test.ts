import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb } from './db.js'
import { createSql, type Sql } from './sql.js'
import { canonicalRoute, medicationLine, medicationOrder, routeLabel, routeMatches } from '../src/lib/format.js'
import { canInfuse, consultItemIssue, draftFromItem, draftFromStay, frequencyOf, rateIssue } from '../src/lib/medForm.js'
import { loadingAllowed } from '../src/lib/medExtras.js'
import { medLabel } from '../src/lib/inpatient.js'

// Ronda 16 (rama notas): ME17, ME16, NO1, NO3 y NO2, con la base y la API (copia en memoria de la demo)
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

async function as(email: string, password = DEMO_PASSWORD) {
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

describe('ME17 (ronda 16): «Vía» escrita o elegida, con abreviaturas', () => {
  test('busca por nombre o abreviatura y guarda el nombre de la lista', () => {
    assert.equal(routeMatches('iv')[0].name, 'Intravenosa')
    assert.equal(routeMatches('vo')[0].name, 'Oral')
    assert.equal(routeMatches('sc')[0].name, 'Subcutánea')
    assert.equal(routeMatches('intra')[0].name, 'Intramuscular')
    assert.ok(routeMatches('intra').some((r) => r.name === 'Intravenosa'))
    assert.equal(routeMatches('').length, 13, 'sin escribir, la lista completa')
    assert.equal(canonicalRoute('iv'), 'Intravenosa')
    assert.equal(canonicalRoute('IV'), 'Intravenosa')
    assert.equal(canonicalRoute('Intravenosa (IV)'), 'Intravenosa')
    assert.equal(canonicalRoute('subcutanea'), 'Subcutánea')
    assert.equal(canonicalRoute('ot'), 'Ótica')
    assert.equal(canonicalRoute(' Intraósea  '), 'Intraósea', 'texto libre, tal cual')
    assert.equal(routeLabel('Intravenosa'), 'Intravenosa (IV)')
    assert.equal(routeLabel('Intraósea'), 'Intraósea')
  })

  test('una vía escrita a mano sale tal cual en la receta y en la nota; la dosis de carga sigue solo con IV', () => {
    const it = { drug: 'Adrenalina', presentation: 'Ampolla 1 mg/mL', dose: '1 mg', route: 'Intraósea', frequency: 'Dosis única', duration: '' }
    assert.match(medicationLine(it), /1 mg Intraósea dosis única/)
    assert.equal(medLabel({ drug: 'Adrenalina', dose: '1 mg', route: 'Intraósea', prn: false }), 'Adrenalina 1 mg Intraósea dosis única')
    assert.equal(medLabel({ drug: 'Gentamicina', dose: '80 mg', route: 'Oftálmica', everyHours: 8, prn: false }), 'Gentamicina 80 mg oftálmica c/8h', 'las de la lista, como antes')
    assert.equal(loadingAllowed({ everyHours: 8, prn: false, route: 'Intravenosa' }), true)
    assert.equal(loadingAllowed({ everyHours: 8, prn: false, route: 'Intraósea' }), false)
  })

  test('la consulta acepta la vía escrita a mano y la receta la conserva', async () => {
    const { id } = await consultFor(0)
    const doc = await as('hnolasco@demo.clinara')
    const r = await doc.post('/api/consultations', { appointmentId: id, reason: 'Dolor', diagnoses: dx,
      items: [{ drug: 'Lidocaína', presentation: 'Vial 2 %', dose: '2 mL', route: 'Infiltración local', frequency: 'Dosis única', duration: '' }] })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    const items = JSON.parse(String((await sql.one('SELECT items FROM prescriptions WHERE id = ?', [r.body.prescriptionId]))!.items))
    assert.equal(items[0].route, 'Infiltración local')
  })
})

const dx = [{ code: 'CA00', label: 'Rinofaringitis aguda' }]

/** Una cita del Dr. Nolasco en consulta, con un paciente adulto con identidad y sin estancia activa (copia de una cita de la clínica). */
async function consultFor(n: number, doctorId = 's-nolasco') {
  const cid = String((await sql.one('SELECT clinic_id FROM staff WHERE id = ?', [doctorId]))!.clinic_id)
  const pts = await sql.query(`SELECT p.id FROM patients p WHERE p.clinic_id = ? AND p.dni IS NOT NULL AND p.dni <> '' AND p.birth_date < '2000-01-01'
    AND NOT EXISTS (SELECT 1 FROM hospitalizations h WHERE h.patient_id = p.id AND h.status = 'active') ORDER BY p.id DESC`, [cid])
  const pid = String(pts[n].id)
  const appt = (await sql.one(`SELECT * FROM appointments WHERE clinic_id = ? ORDER BY start DESC LIMIT 1`, [cid]))!
  const id = `r16n-${n}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const row = { ...appt, id, patient_id: pid, doctor_id: doctorId, status: 'in_consult', start: new Date().toISOString().slice(0, 16) }
  const cols = Object.keys(row)
  await sql.run(`INSERT INTO appointments (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map((k) => (row as Record<string, unknown>)[k]))
  return { id, pid, cid }
}

describe('NO1 (ronda 16): el ingreso es la primera indicación y todos los medicamentos pasan a la hoja', () => {
  test('con ingreso a hospitalización: «Ingreso a hospitalización» es la indicación 1 y lo desmarcado también va a la hoja', async () => {
    const { id } = await consultFor(3)
    const doc = await as('hnolasco@demo.clinara')
    const r = await doc.post('/api/consultations', { appointmentId: id, reason: 'Dolor abdominal', diagnoses: dx, admit: true,
      orders: ['Ingreso a hospitalización', 'Dieta blanda.'], indications: ['Ingreso a hospitalización', 'Dieta blanda.'],
      items: [{ drug: 'Omeprazol', presentation: 'Vial 40 mg', dose: '40 mg', route: 'Intravenosa', frequency: 'Cada 24 horas', duration: '', applyInClinic: false }] })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    const c = (await sql.one('SELECT * FROM consultations WHERE id = ?', [r.body.consultationId]))!
    assert.deepEqual(JSON.parse(String(c.indications)), ['Ingreso a hospitalización', 'Dieta blanda.'])
    assert.equal(JSON.parse(String(c.orders))[0], 'Ingreso a hospitalización')
    const meds = await sql.query('SELECT drug FROM hosp_meds WHERE hospitalization_id = ?', [r.body.hospitalizationId])
    assert.deepEqual(meds.map((m) => m.drug), ['Omeprazol'], 'con ingreso, todos pasan a la hoja (NO1)')
    const rx = JSON.parse(String((await sql.one('SELECT items FROM prescriptions WHERE id = ?', [r.body.prescriptionId]))!.items))
    assert.equal(rx.length, 1, 'y a la receta (ME15)')
  })

  test('el servidor la pone (o la corrige) si no viene: una sola vez y en el número 1', async () => {
    const { id } = await consultFor(4)
    const doc = await as('hnolasco@demo.clinara')
    const r = await doc.post('/api/consultations', { appointmentId: id, reason: 'Crisis asmática', diagnoses: dx, observe: true,
      orders: ['Oxígeno por cánula.', 'Ingreso a hospitalización'], indications: ['Oxígeno por cánula.', 'Ingreso a hospitalización'] })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    const c = (await sql.one('SELECT indications FROM consultations WHERE id = ?', [r.body.consultationId]))!
    assert.deepEqual(JSON.parse(String(c.indications)), ['Ingreso a observación', 'Oxígeno por cánula.'])
  })

  test('sin ingreso, como ME13: lo que se aplica en la clínica es STAT y no hay indicación de ingreso', async () => {
    const { id } = await consultFor(5)
    const doc = await as('hnolasco@demo.clinara')
    const bad = await doc.post('/api/consultations', { appointmentId: id, reason: 'Dolor', diagnoses: dx,
      items: [{ drug: 'Ketorolaco', presentation: 'Ampolla 30 mg', dose: '30 mg', route: 'Intramuscular', frequency: 'Cada 8 horas', duration: '', applyInClinic: true }] })
    assert.equal(bad.status, 400)
    const ok = await doc.post('/api/consultations', { appointmentId: id, reason: 'Dolor', diagnoses: dx, orders: ['Reposo.'], indications: ['Reposo.'],
      items: [{ drug: 'Ketorolaco', presentation: 'Ampolla 30 mg', dose: '30 mg', route: 'Intramuscular', frequency: 'Dosis única', duration: '', applyInClinic: true }] })
    assert.equal(ok.status, 201, JSON.stringify(ok.body))
    assert.equal(ok.body.hospitalizationId, null)
    assert.deepEqual(JSON.parse(String((await sql.one('SELECT indications FROM consultations WHERE id = ?', [ok.body.consultationId]))!.indications)), ['Reposo.'])
  })
})

describe('ME16 (ronda 16): un solo formulario de medicamentos, con infusión donde hay ingreso', () => {
  test('el borrador del formulario va y vuelve igual entre la receta y la hoja', () => {
    const consult = { where: 'consult', admitting: true } as const
    const d = draftFromItem({ drug: 'Tramadol', presentation: 'Ampolla 50 mg', dose: '50 mg', route: 'Intravenosa', frequency: 'Cada 8 horas si es necesario', duration: '', prnCondition: 'si dolor' }, consult)
    assert.equal(d.freq, '8'); assert.equal(d.prn, true)
    assert.equal(frequencyOf(d), 'Cada 8 horas si es necesario')
    assert.equal(frequencyOf({ freq: 'once', prn: true }), 'PRN (si es necesario)')
    assert.equal(frequencyOf({ freq: 'once', prn: false }), 'Dosis única')
    const inf = draftFromItem({ drug: 'Solución salina 0.9 %', dose: '1000 mL', route: 'Intravenosa', frequency: 'Infusión', duration: '', infusionRate: 125, infusionUnit: 'ml/h' }, consult)
    assert.equal(inf.freq, 'infusion'); assert.equal(inf.rate, '125')
    const custom = draftFromItem({ drug: 'X', dose: '1', frequency: 'Cada noche', duration: '3 días' }, { where: 'rx' })
    assert.equal(custom.freq, 'custom'); assert.equal(frequencyOf(custom), 'Cada noche', 'una frecuencia escrita se conserva')
    const stay = draftFromStay({ drug: 'Ondansetrón', dose: '8 mg', route: 'Intravenosa', everyHours: 8, prn: false, days: 3, quantity: '6 ampollas' }, { where: 'stay' })
    assert.equal(stay.freq, '8'); assert.equal(stay.duration, '3 días'); assert.equal(stay.quantity, '6 ampollas')
    assert.equal(canInfuse({ where: 'consult', admitting: false }), false, 'sin ingreso no hay infusión (ME13)')
    assert.equal(canInfuse(consult), true)
    assert.equal(canInfuse({ where: 'stay' }), true)
    assert.equal(canInfuse({ where: 'rx' }), false)
  })

  test('la receta escribe la infusión legible y valida la velocidad como la nota', () => {
    const it = { drug: 'Solución salina 0.9 %', presentation: 'Bolsa 1000 mL', dose: '1000 mL', route: 'Intravenosa', frequency: 'Infusión', duration: '', infusionRate: 125, infusionUnit: 'ml/h' as const }
    assert.equal(medicationLine(it), 'Solución salina 0.9 % 1000 mL bolsa — 1000 mL IV en infusión a 125 mL/h hasta nueva orden')
    assert.match(medicationOrder(it), /IV en infusión a 125 mL\/h/)
    assert.equal(consultItemIssue(it, { admitting: true }), '')
    assert.match(consultItemIssue(it, { admitting: false }), /va con ingreso/)
    assert.match(consultItemIssue({ ...it, infusionRate: 5000 }, { admitting: true }), /no puede pasar de 1000/)
    assert.match(consultItemIssue({ ...it, infusionRate: undefined }, { admitting: true }), /velocidad/)
    assert.equal(rateIssue('2.555'), 'Hasta dos decimales.')
    assert.equal(medicationLine({ drug: 'Ketorolaco', presentation: 'Ampolla 30 mg', dose: '30 mg', route: 'Intravenosa', frequency: 'Cada 8 horas si es necesario', duration: '2 días', prnCondition: 'si dolor' }),
      'Ketorolaco 30 mg ampolla — 30 mg IV PRN: si dolor, máximo cada 8 h por 2 días', 'el PRN conserva su intervalo mínimo')
  })

  test('consulta con ingreso: la infusión de 125 mL/h llega a la hoja como infusión con su velocidad', async () => {
    const { id } = await consultFor(1)
    const doc = await as('hnolasco@demo.clinara')
    const start = new Date(Date.now() + 30 * 60_000).toISOString()
    const r = await doc.post('/api/consultations', { appointmentId: id, reason: 'Diarrea con deshidratación', diagnoses: dx, admit: true,
      items: [{ drug: 'Solución salina 0.9 %', presentation: 'Bolsa 1000 mL', dose: '1000 mL', route: 'Intravenosa', frequency: 'Infusión', duration: '', infusionRate: 125, infusionUnit: 'ml/h', firstAt: start, quantity: '3 bolsas' },
        { drug: 'Ondansetrón', presentation: 'Ampolla 8 mg', dose: '8 mg', route: 'Intravenosa', frequency: 'Cada 8 horas', duration: '' }] })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    const meds = await sql.query('SELECT * FROM hosp_meds WHERE hospitalization_id = ? ORDER BY source_index', [r.body.hospitalizationId])
    assert.equal(meds.length, 2)
    assert.equal(Number(meds[0].infusion_rate), 125)
    assert.equal(meds[0].infusion_unit, 'ml/h')
    assert.equal(meds[0].every_hours, null)
    assert.equal(meds[0].quantity, '3 bolsas')
    assert.equal(new Date(String(meds[0].first_at)).toISOString(), start, 'con su hora de inicio')
    assert.equal(Number(meds[1].every_hours), 8)
    const file = await doc.get(`/api/inpatient/${r.body.hospitalizationId}`)
    assert.equal(file.status, 200)
    assert.match(medLabel(file.body.meds.find((m: { infusionRate?: number }) => m.infusionRate)), /Infusión a 125 mL\/h/)
    const rx = JSON.parse(String((await sql.one('SELECT items FROM prescriptions WHERE id = ?', [r.body.prescriptionId]))!.items))
    assert.match(medicationLine(rx[0]), /en infusión a 125 mL\/h/, 'la receta la escribe legible')
  })

  test('sin ingreso no hay infusión (400), ni en la receta suelta', async () => {
    const { id, pid } = await consultFor(2)
    const doc = await as('hnolasco@demo.clinara')
    const item = { drug: 'Solución salina 0.9 %', presentation: 'Bolsa 1000 mL', dose: '1000 mL', route: 'Intravenosa', frequency: 'Infusión', duration: '', infusionRate: 125, infusionUnit: 'ml/h' }
    const r = await doc.post('/api/consultations', { appointmentId: id, reason: 'Dolor', diagnoses: dx, items: [item] })
    assert.equal(r.status, 400)
    assert.match(r.body.error, /va con ingreso/)
    const rx = await doc.post('/api/prescriptions', { patientId: pid, items: [item] })
    assert.equal(rx.status, 400)
  })

  test('la nota de la estancia guarda la presentación y la cantidad total', async () => {
    const h = (await sql.one(`SELECT h.id FROM hospitalizations h WHERE h.status = 'active' AND h.kind = 'hospital' AND h.clinic_id = (SELECT clinic_id FROM staff WHERE id = 's-nolasco')
      AND (EXISTS (SELECT 1 FROM hosp_notes n WHERE n.hospitalization_id = h.id AND n.kind = 'admission') OR h.consultation_id IS NOT NULL) LIMIT 1`))!
    const doc = await as('hnolasco@demo.clinara')
    const file = await doc.get(`/api/inpatient/${h.id}`)
    const last = [...file.body.notes].filter((n: { kind: string }) => n.kind === 'admission' || n.kind === 'evolution').sort((a: { at: string }, b: { at: string }) => b.at.localeCompare(a.at))[0]
    const r = await doc.post(`/api/inpatient/${h.id}/notes`, { kind: 'evolution', format: 'dx', evolution: 'Estable.', diagnoses: [],
      meds: [{ drug: 'Metamizol', presentation: 'Ampolla 1 g', dose: '1 g', route: 'Intravenosa', everyHours: 8, prn: false, days: 2, quantity: '6 ampollas' }], chain: { basedOn: last?.id ?? null, decisions: [] } })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    const m = (await sql.one('SELECT * FROM hosp_meds WHERE note_id = ?', [r.body.id]))!
    assert.equal(m.presentation, 'Ampolla 1 g')
    assert.equal(m.quantity, '6 ampollas')
  })
})
