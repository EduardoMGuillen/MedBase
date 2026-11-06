import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb } from './db.js'
import { createSql, type Sql } from './sql.js'
import { BACKGROUND_GROUPS, RETIRED_BACKGROUND, medicationOrder } from '../src/lib/format.js'
import { doseText } from '../src/lib/doseText.js'
import { examCatalog, orderGroups, UNCATALOGUED_GROUP } from '../src/lib/exams.js'
import { LAB_CATALOG } from '../src/lib/labCatalog.js'
import { medLabel } from '../src/lib/inpatient.js'
import { PRINT_PAGE, SIGN_SPACE_CM } from '../src/lib/clinicalConfig.js'

// Ronda 13: con la base y la API (copia en memoria de la demo)
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
const mainClinic = async () => String((await sql.one(`SELECT clinic_id FROM staff WHERE email = 'rmoncada@demo.clinara'`))!.clinic_id)

describe('AP3 y AP4 (ronda 13): antecedentes', () => {
  test('la ventana ya no pide «Transfusionales»; lo escrito se ve como campo retirado', () => {
    const keys = BACKGROUND_GROUPS.flatMap((g) => g.fields.map((f) => f.key))
    assert.ok(!keys.includes('transfusions'))
    assert.ok(!keys.includes('lifestyle'))
    assert.deepEqual(RETIRED_BACKGROUND.map((r) => [r.key, r.label]), [
      ['transfusions', 'Transfusionales (campo retirado)'], ['lifestyle', 'Actividad física y alimentación (campo retirado)']])
    const hosp = BACKGROUND_GROUPS.find((g) => g.title === 'Hospitalarios, traumáticos y quirúrgicos')!
    assert.deepEqual(hosp.fields.map((f) => f.label), ['Hospitalarios', 'Traumáticos', 'Quirúrgicos'])
  })
})

describe('IM1 (ronda 13): una sola hoja para todos los documentos', () => {
  test('Carta con márgenes de 2 cm y espacio para firma y sello de 3.5 cm', () => {
    assert.deepEqual(PRINT_PAGE, { widthIn: 8.5, heightIn: 11, marginCm: 2 })
    assert.equal(SIGN_SPACE_CM, 3.5)
  })
})

describe('IM2 (ronda 13): pluralización de las formas', () => {
  test('la cantidad por toma concuerda con la forma', () => {
    assert.equal(doseText('2 cápsula'), '2 cápsulas')
    assert.equal(doseText('1 tableta'), '1 tableta')
    assert.equal(doseText('1 tabletas'), '1 tableta')
    assert.equal(doseText('1/2 tableta'), '1/2 tableta')
    assert.equal(doseText('1.5 tableta'), '1.5 tabletas')
    assert.equal(doseText('2 sobre'), '2 sobres')
    assert.equal(doseText('2 ampolla'), '2 ampollas')
    assert.equal(doseText('3 vial'), '3 viales')
    assert.equal(doseText('5 gota'), '5 gotas')
    assert.equal(doseText('1 supositorio'), '1 supositorio')
    assert.equal(doseText('2 puff'), '2 puffs')
    assert.equal(doseText('500 mg'), '500 mg', 'las unidades no cambian')
    assert.equal(doseText('1 g'), '1 g')
    assert.equal(doseText('5 mL'), '5 mL')
  })
  test('la misma función en la nota y en la hoja de medicamentos', () => {
    const it = { drug: 'Amoxicilina', presentation: 'Cápsula 500 mg', dose: '2 cápsula', route: 'Oral', frequency: 'Cada 8 horas', duration: '7 días' }
    assert.match(medicationOrder(it as never), /2 cápsulas vía oral/)
    assert.match(medLabel({ drug: 'Amoxicilina', dose: '2 cápsula', route: 'Oral', everyHours: 8 } as never), /Amoxicilina 2 cápsulas/)
  })
})

describe('IM3 (ronda 13): orden agrupada como el catálogo', () => {
  test('grupos y exámenes en el orden del catálogo; los escritos a mano al final', () => {
    const e = (name: string, uncatalogued = false) => ({ group: 'lab' as const, name, uncatalogued })
    const groups = orderGroups([e('Microalbuminuria'), e('TGO (aspartato)'), e('Glucosa en ayunas'), e('Tiempo de protrombina (TP)'), e('Hemograma'), e('Prueba rara escrita a mano', true)], examCatalog(LAB_CATALOG.map((x, i) => ({ id: String(i), group: 'lab' as const, name: x.name, subgroup: x.subgroup, active: true }))))
    const titles = groups.map((g) => g.title)
    assert.deepEqual(titles, ['Hematología', 'Coagulación', 'Química en sangre', 'Química en orina', UNCATALOGUED_GROUP])
    assert.deepEqual(groups[0].items.map((x) => x.name), ['Hemograma'])
    assert.deepEqual(groups.at(-1)!.items.map((x) => x.name), ['Prueba rara escrita a mano'])
    // Sin el catálogo de la clínica (todavía cargando) agrupa con la lista fija; lo desconocido va a «Otros exámenes»
    assert.deepEqual(orderGroups([e('Hemograma'), e('Glucosa en ayunas')], examCatalog([])).map((g) => g.title), ['Hematología', 'Química en sangre'])
  })
})

describe('IM2 (ronda 13): «Incluir diagnóstico» se guarda con la receta', () => {
  test('la base tiene las columnas nuevas y las migraciones se pueden repetir', async () => {
    const cols = async (t: string) => (await sql.query(`SELECT column_name FROM information_schema.columns WHERE table_name = ?`, [t])).map((r) => String(r.column_name))
    assert.ok((await cols('prescriptions')).includes('include_dx'))
    assert.ok((await cols('print_jobs')).includes('include_dx'))
    assert.ok((await cols('print_log')).includes('with_dx'))
    // Idempotente: correr de nuevo no falla ni cambia nada
    await sql.exec(`ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS include_dx BOOLEAN;
      ALTER TABLE prescriptions ALTER COLUMN include_dx SET DEFAULT FALSE;
      ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS include_dx BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE print_log ADD COLUMN IF NOT EXISTS with_dx BOOLEAN;`)
  })

  test('una receta nueva sale sin diagnóstico; el médico lo marca, enfermería no puede; el registro guarda si lo llevaba', async () => {
    const cid = await mainClinic()
    const doctor = await as('vsolorzano@demo.clinara')
    const nurse = await as('murbina@demo.clinara')
    const pid = String((await sql.one(`SELECT id FROM patients WHERE clinic_id = ? AND pending IS NOT TRUE AND dni IS NOT NULL ORDER BY record LIMIT 1`, [cid]))!.id)
    const issued = await doctor.post('/api/prescriptions', { patientId: pid, items: [{ drug: 'Amoxicilina', presentation: 'Cápsula 500 mg', dose: '2 cápsula', route: 'Oral', frequency: 'Cada 8 horas', duration: '7 días' }] })
    assert.equal(issued.status, 201, JSON.stringify(issued.body))
    const id = issued.body.prescriptionId ?? issued.body.id
    let got = await doctor.get(`/api/prescriptions/${id}`)
    assert.equal(got.body.prescription.includeDx, false, 'apagada por defecto')

    const denied = await nurse.post(`/api/prescriptions/${id}/include-dx`, { includeDx: true })
    assert.equal(denied.status, 403, 'enfermería no ve ni usa la casilla, tampoco por URL directa')

    const on = await doctor.post(`/api/prescriptions/${id}/include-dx`, { includeDx: true })
    assert.equal(on.status, 200)
    assert.equal(on.body.includeDx, true)
    got = await nurse.get(`/api/prescriptions/${id}`)
    assert.equal(got.body.prescription.includeDx, true, 'enfermería la reimprime como la dejó el médico')

    assert.equal((await nurse.post(`/api/prescriptions/${id}/printed`, { how: 'print' })).status, 200)
    const log = await sql.one(`SELECT with_dx FROM print_log WHERE target_kind = 'prescription' AND target_id = ? ORDER BY at DESC LIMIT 1`, [id])
    assert.equal(log!.with_dx, true)
  })

  test('una receta de antes (sin dato) conserva el diagnóstico con que se imprimía', async () => {
    const doctor = await as('vsolorzano@demo.clinara')
    const row = await sql.one(`SELECT id FROM prescriptions WHERE consultation_id IS NOT NULL AND consultation_id <> '' AND voided_at IS NULL ORDER BY issued_at LIMIT 1`)
    await sql.run('UPDATE prescriptions SET include_dx = NULL WHERE id = ?', [String(row!.id)])
    const got = await doctor.get(`/api/prescriptions/${row!.id}`)
    assert.equal(got.body.prescription.includeDx, undefined, 'el cliente la imprime con diagnóstico (A8)')
    await doctor.post(`/api/prescriptions/${row!.id}/printed`, { how: 'pdf' })
    const log = await sql.one(`SELECT with_dx FROM print_log WHERE target_kind = 'prescription' AND target_id = ? ORDER BY at DESC LIMIT 1`, [String(row!.id)])
    assert.equal(log!.with_dx, true)
  })

  test('«Generar receta» de la estancia: la casilla es del médico y la receta trae los diagnósticos de la estancia', async () => {
    const cid = await mainClinic()
    const doctor = await as('vsolorzano@demo.clinara')
    const nurse = await as('murbina@demo.clinara')
    const med = await sql.one(`SELECT m.id FROM hosp_meds m JOIN hospitalizations h ON h.id = m.hospitalization_id WHERE m.clinic_id = ? AND m.stopped_at IS NULL AND h.status = 'active' LIMIT 1`, [cid])
    const job = await doctor.post('/api/print-jobs', { kind: 'rx', medIds: [String(med!.id)], chosen: true })
    assert.equal(job.status, 201, JSON.stringify(job.body))
    let got = await doctor.get(`/api/print-jobs/${job.body.id}`)
    assert.equal(got.body.includeDx, false, 'apagada por defecto')
    assert.ok(Array.isArray(got.body.diagnoses) && got.body.diagnoses.length > 0, 'trae los diagnósticos de la estancia')
    assert.equal((await nurse.post(`/api/print-jobs/${job.body.id}/include-dx`, { includeDx: true })).status, 403)
    assert.equal((await doctor.post(`/api/print-jobs/${job.body.id}/include-dx`, { includeDx: true })).status, 200)
    got = await nurse.get(`/api/print-jobs/${job.body.id}`)
    assert.equal(got.body.includeDx, true)
    assert.equal((await nurse.post(`/api/print-jobs/${job.body.id}/printed`, { how: 'print' })).status, 200)
    const log = await sql.one(`SELECT with_dx FROM print_log WHERE target_kind = 'print_job' AND target_id = ?`, [job.body.id])
    assert.equal(log!.with_dx, true)
  })
})
