import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { dateFromDisplay, fromDisplay, fromLocalValue, localValueToIso, timeFromDisplay, toLocalValue } from '../src/lib/dateInput.js'
import { dmyTime, time } from '../src/lib/format.js'

describe('GE3: fecha y hora en 24 horas, hora de Honduras', () => {
  test('se escribe y se lee dd/mm/aaaa HH:mm; fechas imposibles se rechazan', () => {
    assert.equal(fromDisplay('31/10/2026 23:05'), '2026-10-31T23:05')
    assert.equal(fromDisplay('31/02/2026 10:00'), null)
    assert.equal(dateFromDisplay('31/02/2026'), null)
    assert.equal(timeFromDisplay('24:00'), null)
    assert.equal(timeFromDisplay('20:14'), '20:14')
  })
  test('sin corrimientos: guardar y reabrir da la misma hora, en cualquier zona del navegador', () => {
    const iso = localValueToIso('2026-11-02T20:14')
    assert.equal(iso, '2026-11-03T02:14:00.000Z')
    assert.equal(toLocalValue(fromLocalValue('2026-11-02T20:14')), '2026-11-02T20:14')
    assert.equal(time(iso), '20:14')
    assert.equal(dmyTime(iso), '02/11/2026 20:14')
    // En otra zona horaria (un navegador en Nueva York), lo mismo
    const out = execFileSync('npx', ['tsx', '-e', "import('./src/lib/format.ts').then((f) => console.log(f.dmyTime('2026-11-03T02:14:00.000Z'), f.inputDateTime(new Date('2026-11-03T02:14:00.000Z'))))"],
      { env: { ...process.env, TZ: 'America/New_York' }, encoding: 'utf8' }).trim()
    assert.equal(out, '02/11/2026 20:14 2026-11-02T20:14')
  })
  test('no quedan campos nativos de fecha u hora ni formatos de 12 horas en el código', () => {
    execFileSync('node', ['scripts/check-dates.mjs'], { encoding: 'utf8' })
  })
})

import { after, before } from 'node:test'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb } from './db.js'
import { createSql, type Sql } from './sql.js'
import { medicationLine } from '../src/lib/format.js'
import { medLabel } from '../src/lib/inpatient.js'

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
  return { get: (p: string) => call('GET', p), post: (p: string, b?: unknown) => call('POST', p, b), put: (p: string, b: unknown) => call('PUT', p, b), patch: (p: string, b: unknown) => call('PATCH', p, b) }
}
const day = () => { const d = new Date(); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }
async function freePatient(doc: Awaited<ReturnType<typeof as>>) {
  const boot = (await doc.get('/api/bootstrap')).body
  const busy = new Set(boot.inpatients.filter((h: any) => h.status === 'active').map((h: any) => h.patientId))
  const open = new Set(boot.appointments.filter((a: any) => a.start.startsWith(day()) && !['done', 'cancelled', 'no_show'].includes(a.status)).map((a: any) => a.patientId))
  return boot.patients.find((x: any) => !busy.has(x.id) && !open.has(x.id) && !x.pending && x.dni && !(x.allergies ?? []).length)
}
const NEB = { components: [{ drug: 'Salbutamol', amount: '3 mL' }, { drug: 'Bromuro de ipratropio', amount: '1 mL' }], diluentVolume: '3 mL', diluent: 'SSN 0.9%' }

describe('ME3 y ME4: primera dosis distinta y nebulización en todos los formularios', () => {
  test('el mismo texto en la receta y en la nota', () => {
    assert.equal(medicationLine({ drug: 'Ceftriaxona', presentation: 'Vial 1 g', dose: '1 g', route: 'Intramuscular', frequency: 'Cada 12 horas', duration: '5 días', loadingDose: '2 g' }),
      'Ceftriaxona IM · 2 g STAT y luego 1 g c/12h por 5 días')
    assert.equal(medLabel({ drug: 'Ceftriaxona', dose: '1 g', route: 'Intramuscular', everyHours: 12, prn: false, loadingDose: '2 g' }), 'Ceftriaxona IM · 2 g STAT y luego 1 g c/12h')
    assert.equal(medLabel({ drug: 'Nebulización', dose: '', route: 'Nebulización', everyHours: 6, prn: false, nebulization: NEB }),
      'Nebulizar con: Salbutamol 3 mL + Bromuro de ipratropio 1 mL, diluido en 3 mL de SSN 0.9% · c/6h')
    assert.equal(medicationLine({ drug: 'Nebulización', presentation: '', dose: '', route: 'Nebulización', frequency: 'Cada 6 horas', duration: '3 días', nebulization: NEB }),
      'Nebulizar con: Salbutamol 3 mL + Bromuro de ipratropio 1 mL, diluido en 3 mL de SSN 0.9% · cada 6 h por 3 días')
  })

  test('consulta externa: receta con STAT y nebulización; «Aplicar en la clínica» pasa a la hoja con la dosis inicial', async () => {
    const doc = await as('lherrera@demo.clinara')
    const reception = await as('smejia@demo.clinara')
    const p = await freePatient(doc)
    const w = await reception.post('/api/appointments/walk-in', { patientId: p.id, doctorId: 's-herrera', reason: 'Neumonía' })
    const items = [
      { drug: 'Ceftriaxona', presentation: 'Vial 1 g', dose: '1 g', route: 'Intramuscular', frequency: 'Cada 12 horas', duration: '5 días', loadingDose: '2 g', applyInClinic: true },
      { drug: 'Nebulización', presentation: '', dose: 'Salbutamol 3 mL + Bromuro de ipratropio 1 mL', route: 'Nebulización', frequency: 'Cada 6 horas', duration: '3 días', nebulization: NEB },
    ]
    const r = await doc.post('/api/consultations', { appointmentId: w.body.id, reason: 'Tos', symptoms: [], history: 'Tos', exam: 'Crépitos', observations: '',
      diagnoses: [{ code: 'CA40', label: 'Neumonía' }], orders: ['Reposo.'], indications: ['Reposo.'], plan: '', items, exams: [] })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    const rx = (await doc.get(`/api/prescriptions/${r.body.prescriptionId}`)).body
    const neb = (rx.items ?? rx.prescription?.items).find((x: any) => x.route === 'Nebulización')
    assert.deepEqual(neb.nebulization.components.map((c: any) => c.drug), ['Salbutamol', 'Bromuro de ipratropio'])
    const stay = r.body.hospitalizationId
    assert.ok(stay, 'aplicar en la clínica deja al paciente en observación')
    const cef = (await doc.get(`/api/inpatient/${stay}`)).body.meds.find((m: any) => m.drug === 'Ceftriaxona')
    assert.equal(cef.loadingDose, '2 g')
    // Validaciones
    const bad = await doc.post('/api/consultations', { appointmentId: w.body.id, reason: 'x', diagnoses: [{ code: 'CA40', label: 'N' }], orders: ['x'], items: [{ ...items[1], route: 'Oral' }] })
    assert.equal(bad.status, 400)
  })

  test('nota de evolución: una nebulización es una orden; la sesión se registra una vez con su composición', async () => {
    const doc = await as('lherrera@demo.clinara')
    const nurse = await as('crios@demo.clinara')
    const stay = (await doc.get('/api/bootstrap')).body.inpatients.find((h: any) => h.kind === 'hospital' && h.status === 'active')
    const first = new Date(Date.now() - 60_000).toISOString()
    const n = await doc.post(`/api/inpatient/${stay.id}/notes`, { kind: 'evolution', format: 'dx', observations: 'Sibilancias', meds: [
      { drug: 'Nebulización', dose: 'Salbutamol 3 mL + Bromuro de ipratropio 1 mL', route: 'Nebulización', everyHours: 6, prn: false, firstAt: first, nebulization: NEB }] })
    assert.equal(n.status, 201, JSON.stringify(n.body))
    const med = (await doc.get(`/api/inpatient/${stay.id}`)).body.meds.find((m: any) => m.route === 'Nebulización')
    assert.equal(med.nebulization.components.length, 2)
    const d = await nurse.post(`/api/inpatient/meds/${med.id}/doses`, { scheduledAt: med.firstAt, status: 'given' })
    assert.equal(d.status, 201, JSON.stringify(d.body))
    assert.equal(d.body.dose, 'Salbutamol 3 mL + Bromuro de ipratropio 1 mL, diluido en 3 mL de SSN 0.9%')
    const bad = await doc.post(`/api/inpatient/${stay.id}/notes`, { kind: 'evolution', format: 'dx', observations: 'x', meds: [
      { drug: 'Nebulización', dose: 'x', route: 'Nebulización', everyHours: 6, prn: false, firstAt: first, nebulization: NEB, loadingDose: '2 mL' }] })
    assert.equal(bad.status, 400, 'una nebulización no lleva primera dosis distinta')
  })
})

describe('PQ1 y PQ2: nota postquirúrgica con equipo quirúrgico', () => {
  const pre = [{ code: 'DB10', label: 'Apendicitis aguda' }]
  const postop = (x: Record<string, unknown> = {}) => {
    const start = new Date(Date.now() - 90 * 60_000).toISOString(); const end = new Date(Date.now() - 20 * 60_000).toISOString()
    return { preDiagnoses: pre, startAt: start, endAt: end, anesthesia: 'General', procedureName: 'Apendicectomía', description: 'Sin complicaciones, sangrado mínimo.',
      team: { surgeon: { staffId: 's-herrera', name: 'Dra. Lucía Herrera' }, scrub: { name: 'Enf. Externa' } }, ...x }
  }
  test('sin autorización ni urgencia: 409 con el mismo mensaje del procedimiento mayor; con urgencia se firma y entra en la cadena', async () => {
    const doc = await as('lherrera@demo.clinara')
    const stay = (await doc.get('/api/bootstrap')).body.inpatients.find((h: any) => h.kind === 'hospital' && h.status === 'active')
    const body = { kind: 'evolution', format: 'postop', diagnoses: [{ code: 'DB10.0', label: 'Apendicitis perforada' }] }
    const no = await doc.post(`/api/inpatient/${stay.id}/notes`, { ...body, postop: postop() })
    assert.equal(no.status, 409)
    assert.match(no.body.error, /No hay autorización firmada/)
    const ok = await doc.post(`/api/inpatient/${stay.id}/notes`, { ...body, postop: postop({ urgent: true, justification: 'Abdomen agudo, sin familiar' }) })
    assert.equal(ok.status, 201, JSON.stringify(ok.body))
    const file = (await doc.get(`/api/inpatient/${stay.id}`)).body
    const n = file.notes.find((x: any) => x.id === ok.body.id)
    assert.equal(n.kind, 'evolution'); assert.equal(n.format, 'postop')
    assert.deepEqual(n.diagnoses.map((d: any) => d.code), ['DB10.0'])
    assert.equal(n.postop.team.scrub.name, 'Enf. Externa'); assert.equal(n.postop.urgent, true)
    const audit = (await (await as('admin@demo.clinara')).get('/api/audit')).body
    assert.ok(JSON.stringify(audit).includes('Equipo quirúrgico de «Apendicectomía»'))
  })
  test('validaciones: cirujano obligatorio, cierre después del inicio, nada en el futuro, «Otra» se especifica', async () => {
    const doc = await as('lherrera@demo.clinara')
    const stay = (await doc.get('/api/bootstrap')).body.inpatients.find((h: any) => h.kind === 'hospital' && h.status === 'active')
    const post = (x: Record<string, unknown>) => doc.post(`/api/inpatient/${stay.id}/notes`, { kind: 'evolution', format: 'postop', diagnoses: pre, postop: postop({ urgent: true, justification: 'Abdomen agudo, sin familiar', ...x }) })
    assert.equal((await post({ team: { assistant1: { name: 'Dr. X' } } })).status, 400)
    assert.equal((await post({ endAt: new Date(Date.now() - 120 * 60_000).toISOString() })).status, 400)
    assert.equal((await post({ endAt: new Date(Date.now() + 60 * 60_000).toISOString() })).status, 400)
    assert.equal((await post({ anesthesia: 'Otra' })).status, 400)
    assert.equal((await post({ anesthesia: 'Otra', anesthesiaOther: 'Hipnosis' })).status, 201)
    assert.equal((await post({ preDiagnoses: [] })).status, 400)
  })
})
