import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb } from './db.js'
import { createSql, type Sql } from './sql.js'
import { consultRxItems, statQuantity } from '../src/lib/format.js'
import { RX_LEGEND_BUY_AND_BRING, RX_LEGEND_IN_CLINIC } from '../src/lib/clinicalConfig.js'

// Ronda 15: con la base y la API (copia en memoria de la demo)
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
  return { get: (p: string) => call('GET', p), post: (p: string, b?: unknown) => call('POST', p, b), patch: (p: string, b?: unknown) => call('PATCH', p, b), put: (p: string, b?: unknown) => call('PUT', p, b) }
}

/** Una cita de la Dra. Solórzano en consulta, con un paciente adulto con identidad y sin estancia activa (copia de una cita suya). */
async function consultFor(n: number) {
  const cid = String((await sql.one(`SELECT clinic_id FROM staff WHERE email = 'vsolorzano@demo.clinara'`))!.clinic_id)
  const pts = await sql.query(`SELECT p.id FROM patients p WHERE p.clinic_id = ? AND p.dni IS NOT NULL AND p.dni <> '' AND p.birth_date < '2000-01-01'
    AND NOT EXISTS (SELECT 1 FROM hospitalizations h WHERE h.patient_id = p.id AND h.status = 'active') ORDER BY p.id DESC`, [cid])
  const pid = String(pts[n].id)
  const appt = (await sql.one(`SELECT * FROM appointments WHERE doctor_id = 's-solorzano' ORDER BY start DESC LIMIT 1`))!
  const id = `r15-${n}-${Date.now()}`
  const row = { ...appt, id, patient_id: pid, status: 'in_consult', start: new Date().toISOString().slice(0, 16) }
  const cols = Object.keys(row)
  await sql.run(`INSERT INTO appointments (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map((k) => (row as Record<string, unknown>)[k]))
  return { id, pid, cid }
}
const oral = (drug: string) => ({ drug, presentation: 'Tableta 500 mg', dose: '1 tableta', route: 'Oral', frequency: 'Cada 8 horas', duration: '3 días' })
const ceftriaxona = { drug: 'Ceftriaxona', presentation: 'Vial 1 g', dose: '1 g', route: 'Intramuscular', frequency: 'Dosis única', duration: '', applyInClinic: true }
const dx = [{ code: 'CA00', label: 'Rinofaringitis aguda' }]
const rxItems = async (id: string) => JSON.parse(String((await sql.one('SELECT items FROM prescriptions WHERE id = ?', [id]))!.items)) as Record<string, string>[]

describe('ME15 (ronda 15): los medicamentos «Aplicar en la clínica» también salen en la receta', () => {
  test('cantidad de una dosis STAT en unidades de la presentación (A2)', () => {
    assert.equal(statQuantity({ dose: '1 g', presentation: 'Vial 1 g' }), '1 vial')
    assert.equal(statQuantity({ dose: '2 g', presentation: 'Vial 1 g' }), '2 viales')
    assert.equal(statQuantity({ dose: '1gr', presentation: 'Vial 1 g' }), '1 vial')
    assert.equal(statQuantity({ dose: '500 mg', presentation: 'Vial 1 g' }), '1 vial')
    assert.equal(statQuantity({ dose: '75 mg', presentation: 'Ampolla 75 mg/3 mL' }), '1 ampolla')
    assert.equal(statQuantity({ dose: '1 ampolla', presentation: 'Ampolla 50 mg/ml' }), '1 ampolla')
    assert.equal(statQuantity({ dose: '50 mg', presentation: 'Ampolla 50 mg/ml' }), undefined, 'concentración sin volumen: sin cantidad')
    assert.equal(statQuantity({ dose: '2 puff', presentation: 'Inhalador 100 mcg' }), undefined)
    // «Cantidad a comprar» manda; una frecuencia repetida sin días (con ingreso) sale sin cantidad
    const [a, b, c] = consultRxItems([{ ...ceftriaxona, quantity: '2 viales' }, { ...ceftriaxona, frequency: 'Cada 12 horas' }, { ...ceftriaxona, buyOutside: true }])
    assert.equal(a.quantity, '2 viales')
    assert.equal(b.quantity, undefined)
    assert.equal(c.quantity, '1 vial')
    assert.equal(a.legend, RX_LEGEND_IN_CLINIC)
    assert.equal(c.legend, RX_LEGEND_BUY_AND_BRING)
    assert.equal(consultRxItems([oral('Acetaminofén')])[0].legend, undefined, 'lo que no se aplica en la clínica, sin leyenda')
  })

  test('sin ingreso: la receta trae los tres, la Ceftriaxona con su leyenda y su cantidad; no entra a observación y queda «Por aplicar»', async () => {
    const { id, pid } = await consultFor(0)
    const doc = await as('vsolorzano@demo.clinara')
    const r = await doc.post('/api/consultations', { appointmentId: id, reason: 'Dolor', diagnoses: dx, items: [oral('Acetaminofén'), oral('Ibuprofeno'), ceftriaxona],
      exams: [{ group: 'lab', name: 'Perfil lipídico', priority: 'routine', place: 'external' }, { group: 'lab', name: 'Hemograma', priority: 'routine', place: 'clinic' }] })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    assert.equal(r.body.hospitalizationId, null)
    assert.ok(!(await sql.one(`SELECT 1 FROM hospitalizations WHERE patient_id = ? AND status = 'active'`, [pid])), 'no entra a observación')
    const items = await rxItems(r.body.prescriptionId)
    assert.deepEqual(items.map((x) => x.drug), ['Acetaminofén', 'Ibuprofeno', 'Ceftriaxona'])
    assert.equal(items[2].legend, 'Se aplica en la clínica.')
    assert.equal(items[2].quantity, '1 vial')
    assert.equal(items[0].legend, undefined)
    // EX10: las dos órdenes siguen saliendo
    assert.ok(r.body.examBatch && r.body.clinicBatch)
    const apps = await sql.query('SELECT status FROM consult_applications WHERE consultation_id = ?', [r.body.consultationId])
    assert.deepEqual(apps.map((a) => a.status), ['pending'], 'el botón «Aplicar» sigue igual')
    // La consulta guarda los medicamentos como se indicaron (sin la leyenda)
    const meds = JSON.parse(String((await sql.one('SELECT meds FROM consultations WHERE id = ?', [r.body.consultationId]))!.meds))
    assert.equal(meds[2].legend, undefined)
  })

  test('con «No hay en la clínica (va a receta)»: «Comprar y traer a la clínica para su aplicación.» y la cantidad a comprar', async () => {
    const { id } = await consultFor(1)
    const doc = await as('vsolorzano@demo.clinara')
    const r = await doc.post('/api/consultations', { appointmentId: id, reason: 'Dolor', diagnoses: dx, items: [oral('Acetaminofén'), { ...ceftriaxona, buyOutside: true, quantity: '1 vial y 1 jeringa' }] })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    const items = await rxItems(r.body.prescriptionId)
    assert.equal(items[1].legend, 'Comprar y traer a la clínica para su aplicación.')
    assert.equal(items[1].quantity, '1 vial y 1 jeringa')
  })

  test('con «Ingreso a observación»: la receta también trae los tres; a la hoja, lo que se aplica en la clínica', async () => {
    const { id } = await consultFor(2)
    const doc = await as('vsolorzano@demo.clinara')
    const r = await doc.post('/api/consultations', { appointmentId: id, reason: 'Dolor', diagnoses: dx, observe: true,
      items: [{ ...oral('Acetaminofén'), applyInClinic: false }, { ...oral('Ibuprofeno'), applyInClinic: false }, { ...ceftriaxona, frequency: 'Cada 12 horas' }],
      exams: [{ group: 'lab', name: 'Hemograma', priority: 'routine', place: 'external' }] })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    assert.equal(r.body.stayKind, 'observation')
    const items = await rxItems(r.body.prescriptionId)
    assert.deepEqual(items.map((x) => x.drug), ['Acetaminofén', 'Ibuprofeno', 'Ceftriaxona'])
    assert.equal(items[2].legend, 'Se aplica en la clínica.')
    assert.equal(items[2].quantity, undefined, 'cada 12 horas sin días: sin cantidad (A2)')
    assert.ok(r.body.examBatch)
    const sheet = await sql.query('SELECT drug FROM hosp_meds WHERE hospitalization_id = ?', [r.body.hospitalizationId])
    assert.deepEqual(sheet.map((m) => m.drug), ['Ceftriaxona'])
  })

  test('adulto sin identidad y todo se aplica en la clínica: se firma sin receta, como antes (no se bloquea la atención)', async () => {
    const { id, pid } = await consultFor(4)
    await sql.run('UPDATE patients SET dni = NULL WHERE id = ?', [pid])
    const doc = await as('vsolorzano@demo.clinara')
    const r = await doc.post('/api/consultations', { appointmentId: id, reason: 'Dolor', diagnoses: dx, items: [ceftriaxona] })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    assert.equal(r.body.prescriptionId, null)
    // Con un medicamento para la casa, la receta exige la identidad (como siempre)
    const other = await consultFor(5)
    await sql.run('UPDATE patients SET dni = NULL WHERE id = ?', [other.pid])
    const bad = await doc.post('/api/consultations', { appointmentId: other.id, reason: 'Dolor', diagnoses: dx, items: [oral('Acetaminofén'), ceftriaxona] })
    assert.equal(bad.status, 400)
  })

  test('una receta de antes (sin el «Aplicar en la clínica»): no cambia; el médico genera la completa desde «Receta»', async () => {
    const { id } = await consultFor(3)
    const doc = await as('vsolorzano@demo.clinara')
    const r = await doc.post('/api/consultations', { appointmentId: id, reason: 'Dolor', diagnoses: dx, items: [oral('Acetaminofén'), oral('Ibuprofeno'), ceftriaxona] })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    // Como se emitía antes de esta ronda: sin la Ceftriaxona
    const old = (await rxItems(r.body.prescriptionId)).slice(0, 2)
    await sql.run('UPDATE prescriptions SET items = ? WHERE id = ?', [JSON.stringify(old), r.body.prescriptionId])
    const before = await doc.get(`/api/prescriptions/${r.body.prescriptionId}`)
    assert.deepEqual(before.body.missingFromConsult.map((m: { drug: string }) => m.drug), ['Ceftriaxona'])
    assert.equal((await (await as('murbina@demo.clinara')).post(`/api/consultations/${r.body.consultationId}/full-rx`)).status, 403, 'enfermería no emite recetas')
    assert.equal((await (await as('aquiroz@demo.clinara')).post(`/api/consultations/${r.body.consultationId}/full-rx`)).status, 403)
    const full = await doc.post(`/api/consultations/${r.body.consultationId}/full-rx`)
    assert.equal(full.status, 201, JSON.stringify(full.body))
    assert.notEqual(full.body.prescriptionId, r.body.prescriptionId)
    assert.deepEqual((await rxItems(full.body.prescriptionId)).map((x) => x.drug), ['Acetaminofén', 'Ibuprofeno', 'Ceftriaxona'])
    assert.deepEqual((await rxItems(r.body.prescriptionId)).map((x) => x.drug), ['Acetaminofén', 'Ibuprofeno'], 'la emitida no cambia')
    const after = await doc.get(`/api/prescriptions/${r.body.prescriptionId}`)
    assert.deepEqual(after.body.missingFromConsult, [])
    assert.equal(after.body.completeRx.id, full.body.prescriptionId)
    assert.equal((await doc.post(`/api/consultations/${r.body.consultationId}/full-rx`)).status, 409, 'ya está completa')
    assert.ok(await sql.one(`SELECT 1 FROM audit WHERE action LIKE 'Generó la receta completa%'`))
  })
})
