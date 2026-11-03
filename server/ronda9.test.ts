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

describe('GE4: periodo de gracia con versiones', () => {
  test('nota de evolución: v2 y v3 del autor; otro médico 403; vencido 409 con la adenda; versiones intactas', async () => {
    const doc = await as('lherrera@demo.clinara')
    const stay = (await doc.get('/api/bootstrap')).body.inpatients.find((h: any) => h.kind === 'hospital' && h.status === 'active')
    const n = await doc.post(`/api/inpatient/${stay.id}/notes`, { kind: 'evolution', format: 'dx', diagnoses: [{ code: 'CA40', label: 'Neumonía' }], observations: 'Afebril desde ayer.' })
    assert.equal(n.status, 201, JSON.stringify(n.body))
    assert.ok(n.body.graceUntil)
    const c1 = await doc.post(`/api/inpatient/notes/${n.body.id}/correct`, { version: 1, diagnoses: [{ code: 'CA40', label: 'Neumonía' }], observations: 'Afebril desde anteayer.', reason: 'Error de dedo' })
    assert.equal(c1.status, 200, JSON.stringify(c1.body)); assert.equal(c1.body.version, 2); assert.equal(c1.body.observations, 'Afebril desde anteayer.')
    const stale = await doc.post(`/api/inpatient/notes/${n.body.id}/correct`, { version: 1, diagnoses: [], observations: 'x' })
    assert.equal(stale.status, 409)
    const c2 = await doc.post(`/api/inpatient/notes/${n.body.id}/correct`, { version: 2, diagnoses: [{ code: 'CA40', label: 'Neumonía' }], observations: 'Afebril.' })
    assert.equal(c2.body.version, 3)
    assert.equal(c2.body.graceUntil, n.body.graceUntil, 'el plazo no se reinicia')
    const other = await as('apaz@demo.clinara')
    const o = await other.post(`/api/inpatient/notes/${n.body.id}/correct`, { version: 3, diagnoses: [], observations: 'x' })
    assert.equal(o.status, 403)
    const admin = await as('admin@demo.clinara')
    assert.equal((await admin.post(`/api/inpatient/notes/${n.body.id}/correct`, { version: 3, diagnoses: [], observations: 'x' })).status, 403)
    const v = await doc.get(`/api/versions/note/${n.body.id}`)
    assert.deepEqual(v.body.map((x: any) => x.version), [1, 2])
    assert.equal(v.body[0].data.data.observations, 'Afebril desde ayer.')
    // Vence: el servidor manda
    await sql.tx(async (q) => {
      await q.run("SELECT set_config('clinara.note_maintenance', 'on', true)")
      await q.run('UPDATE hosp_notes SET at = ? WHERE id = ?', [new Date(Date.now() - 6 * 60_000).toISOString(), n.body.id])
    })
    const late = await doc.post(`/api/inpatient/notes/${n.body.id}/correct`, { version: 3, diagnoses: [{ code: 'CA40', label: 'Neumonía' }], observations: 'Tarde.' })
    assert.equal(late.status, 409); assert.match(late.body.error, /adenda/)
    // Una nota firmada sigue sin editarse por la vía de siempre
    assert.equal((await doc.patch(`/api/inpatient/notes/${n.body.id}`, { observations: 'x' })).status, 409)
  })

  test('administración: enfermería corrige la hora de su registro; otra persona no; la versión anterior queda', async () => {
    const doc = await as('lherrera@demo.clinara')
    const nurse = await as('crios@demo.clinara')
    const stay = (await doc.get('/api/bootstrap')).body.inpatients.find((h: any) => h.kind === 'hospital' && h.status === 'active')
    const first = new Date(Date.now() - 30 * 60_000).toISOString()
    await doc.post(`/api/inpatient/${stay.id}/notes`, { kind: 'evolution', format: 'dx', observations: 'x', meds: [{ drug: 'Omeprazol', dose: '40 mg', route: 'Intravenosa', everyHours: 24, prn: false, firstAt: first }] })
    const med = (await doc.get(`/api/inpatient/${stay.id}`)).body.meds.find((m: any) => m.drug === 'Omeprazol' && !m.stoppedAt)
    const d = await nurse.post(`/api/inpatient/meds/${med.id}/doses`, { scheduledAt: med.firstAt, status: 'given' })
    assert.equal(d.status, 201, JSON.stringify(d.body)); assert.ok(d.body.graceUntil)
    const right = new Date(Date.now() - 25 * 60_000).toISOString()
    const c = await nurse.patch(`/api/inpatient/doses/${d.body.id}`, { givenAt: right, grace: true })
    assert.equal(c.status, 200, JSON.stringify(c.body)); assert.equal(c.body.version, 2); assert.equal(c.body.givenAt, right)
    assert.equal((await doc.patch(`/api/inpatient/doses/${d.body.id}`, { givenAt: right, grace: true })).status, 403, 'sólo quien la registró')
    assert.equal((await doc.get(`/api/versions/dose/${d.body.id}`)).body.length, 1)
  })

  test('consulta: receta sin imprimir se corrige; impresa, sus medicamentos quedan bloqueados', async () => {
    const doc = await as('lherrera@demo.clinara')
    const reception = await as('smejia@demo.clinara')
    const p = await freePatient(doc)
    const w = await reception.post('/api/appointments/walk-in', { patientId: p.id, doctorId: 's-herrera', reason: 'Dolor' })
    const item = { drug: 'Ibuprofeno', presentation: 'Tableta 400 mg', dose: '400 mg', route: 'Oral', frequency: 'Cada 8 horas', duration: '3 días' }
    const r = await doc.post('/api/consultations', { appointmentId: w.body.id, reason: 'Dolor', history: 'Dolor lumbar', exam: 'Normal', diagnoses: [{ code: 'ME84', label: 'Lumbago' }], orders: ['Reposo.'], items: [item] })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    const base = { reason: 'Dolor lumbar', history: 'Dolor lumbar de 3 días', exam: 'Normal', diagnoses: [{ code: 'ME84', label: 'Lumbago' }] }
    const c = await doc.post(`/api/consultations/${r.body.consultationId}/correct`, { ...base, version: 1, items: [{ ...item, dose: '600 mg' }] })
    assert.equal(c.status, 200, JSON.stringify(c.body)); assert.equal(c.body.version, 2)
    const rx = (await doc.get(`/api/prescriptions/${r.body.prescriptionId}`)).body
    assert.equal((rx.items ?? rx.prescription.items)[0].dose, '600 mg')
    await doc.post(`/api/prescriptions/${r.body.prescriptionId}/printed`, { how: 'print' })
    const locked = await doc.post(`/api/consultations/${r.body.consultationId}/correct`, { ...base, version: 2, items: [{ ...item, dose: '800 mg' }] })
    assert.equal(locked.status, 409); assert.equal(locked.body.error, 'Ya se imprimió la receta. Corrígelo con una adenda.')
    // Lo demás de la nota sí
    assert.equal((await doc.post(`/api/consultations/${r.body.consultationId}/correct`, { ...base, version: 2, exam: 'Dolor a la palpación' })).body.version, 3)
  })

  test('órdenes de la nota: lo no cumplido se corrige en la hoja y en Exámenes; lo cumplido o impreso queda bloqueado', async () => {
    const doc = await as('lherrera@demo.clinara')
    const nurse = await as('crios@demo.clinara')
    const stay = (await doc.get('/api/bootstrap')).body.inpatients.find((h: any) => h.kind === 'hospital' && h.status === 'active')
    const file0 = (await doc.get(`/api/inpatient/${stay.id}`)).body
    const last = [...file0.notes].filter((x: any) => x.kind === 'admission' || x.kind === 'evolution').sort((a: any, b: any) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)).at(-1)
    const first = new Date(Date.now() - 10 * 60_000).toISOString()
    const meds = [
      { drug: 'Ceftriaxona', dose: '1 g', route: 'Intravenosa', everyHours: 12, prn: false, firstAt: first },
      { drug: 'Metoclopramida', dose: '10 mg', route: 'Intravenosa', everyHours: 8, prn: false, firstAt: first },
      { drug: 'Ketorolaco', dose: '30 mg', route: 'Intravenosa', everyHours: 8, prn: false, firstAt: first },
    ]
    const n = await doc.post(`/api/inpatient/${stay.id}/notes`, { kind: 'evolution', format: 'dx', observations: 'Estable.', meds, orders: ['Dieta blanda.'],
      exams: [{ group: 'lab', name: 'Hemograma', priority: 'routine', place: 'clinic' }, { group: 'lab', name: 'Glucosa', priority: 'routine', place: 'clinic' }],
      chain: { basedOn: last?.id ?? null, decisions: [] } })
    assert.equal(n.status, 201, JSON.stringify(n.body))
    const file = (await doc.get(`/api/inpatient/${stay.id}`)).body
    const mine = file.meds.filter((m: any) => m.noteId === n.body.id)
    const byDrug = (d: string) => mine.find((m: any) => m.drug === d)
    const exams = (file.exams ?? []).filter((e: any) => e.noteId === n.body.id)
    // Enfermería administra la ceftriaxona y toma la muestra del hemograma
    assert.equal((await nurse.post(`/api/inpatient/meds/${byDrug('Ceftriaxona').id}/doses`, { scheduledAt: byDrug('Ceftriaxona').firstAt, status: 'given' })).status, 201)
    const hemo = exams.find((e: any) => e.name === 'Hemograma')
    const glu = exams.find((e: any) => e.name === 'Glucosa')
    const s1 = await nurse.post(`/api/exams/${hemo.id}/status`, { status: 'sample' })
    assert.equal(s1.status, 200, JSON.stringify(s1.body))
    const locks = (await doc.get(`/api/inpatient/notes/${n.body.id}/correct`)).body
    assert.equal(locks.all, undefined, JSON.stringify(locks))
    assert.match(locks.meds[byDrug('Ceftriaxona').id], /^Ya fue administrado por .+ a las \d\d:\d\d\. Corrígelo con una adenda\.$/)
    assert.match(locks.exams[hemo.id], /muestra/)
    const ind = n.body.lines.filter((l: any) => l.kind === 'ind' && l.tag === 'new')
    const keepAll = { indications: ind.map((l: any) => ({ id: l.id, text: l.text })), meds: mine.map((m: any) => ({ id: m.id, med: { drug: m.drug, dose: m.dose, route: m.route, everyHours: m.everyHours, prn: m.prn, firstAt: m.firstAt } })), keepExams: exams.map((e: any) => e.id), exams: [] }
    const body = { version: 1, observations: 'Estable.', diagnoses: [] }
    // Lo administrado no se quita ni se cambia
    const bad = await doc.post(`/api/inpatient/notes/${n.body.id}/correct`, { ...body, orders: { ...keepAll, meds: keepAll.meds.filter((m: any) => m.med.drug !== 'Ceftriaxona') } })
    assert.equal(bad.status, 409); assert.match(bad.body.error, /Ya fue administrado/)
    const bad2 = await doc.post(`/api/inpatient/notes/${n.body.id}/correct`, { ...body, orders: { ...keepAll, keepExams: [glu.id] } })
    assert.equal(bad2.status, 409); assert.match(bad2.body.error, /muestra/)
    // Lo no cumplido sí: cambia la metoclopramida, quita el ketorolaco, quita la glucosa, cambia la dieta y agrega omeprazol
    const ok = await doc.post(`/api/inpatient/notes/${n.body.id}/correct`, { ...body, orders: {
      indications: [{ id: ind[0].id, text: 'Dieta líquida' }, { text: 'Control de diuresis' }],
      meds: [...keepAll.meds.filter((m: any) => m.med.drug === 'Ceftriaxona'), { id: byDrug('Metoclopramida').id, med: { ...keepAll.meds.find((m: any) => m.med.drug === 'Metoclopramida').med, dose: '5 mg' } },
        { med: { drug: 'Omeprazol', dose: '40 mg', route: 'Intravenosa', everyHours: 24, prn: false } }],
      keepExams: [hemo.id], exams: [] } })
    assert.equal(ok.status, 200, JSON.stringify(ok.body)); assert.equal(ok.body.version, 2)
    const after = (await doc.get(`/api/inpatient/${stay.id}`)).body
    const now = after.meds.filter((m: any) => m.noteId === n.body.id)
    assert.equal(now.find((m: any) => m.drug === 'Metoclopramida').dose, '5 mg', 'la hoja se actualiza')
    assert.ok(now.find((m: any) => m.drug === 'Ketorolaco').stoppedAt, 'el quitado queda suspendido, no se borra')
    assert.ok(now.find((m: any) => m.drug === 'Omeprazol' && !m.stoppedAt))
    assert.equal(after.exams.find((e: any) => e.id === glu.id).status, 'cancelled')
    assert.equal(after.exams.find((e: any) => e.id === hemo.id).status, 'sample')
    const lines = ok.body.lines.map((l: any) => l.text)
    assert.ok(lines.includes('Dieta líquida.') && lines.includes('Control de diuresis.') && !lines.includes('Dieta blanda.'))
    assert.ok(!lines.some((t: string) => /Ketorolaco/.test(t)) && lines.some((t: string) => /Metoclopramida 5 mg/.test(t)) && lines.some((t: string) => /Omeprazol/.test(t)))
    assert.equal(ok.body.indicationCount, ok.body.lines.filter((l: any) => l.kind === 'ind').length)
    assert.equal(ok.body.lines.filter((l: any) => l.kind === 'ind' && l.tag === 'new').length, 2)
    // La versión 1 guarda cómo estaban la hoja y los exámenes
    const v = (await doc.get(`/api/versions/note/${n.body.id}`)).body
    assert.equal(v[0].data.meds.find((m: any) => m.drug === 'Metoclopramida').dose, '10 mg')
    // Con una revisión de enfermería, la columna de órdenes queda como se firmó
    assert.equal((await nurse.post(`/api/inpatient/notes/${n.body.id}/orders/0/review`, { checked: true })).status, 201)
    const marked = await doc.post(`/api/inpatient/notes/${n.body.id}/correct`, { ...body, version: 2, orders: { ...keepAll, indications: [] } })
    assert.equal(marked.status, 409); assert.match(marked.body.error, /Ya las revisó/)
    // Lo escrito sí se sigue corrigiendo
    assert.equal((await doc.post(`/api/inpatient/notes/${n.body.id}/correct`, { ...body, version: 2, observations: 'Estable, afebril.' })).body.version, 3)
  })

  test('consulta: los exámenes sin muestra se cancelan y los seguimientos sin aviso enviado se ajustan', async () => {
    const doc = await as('lherrera@demo.clinara')
    const reception = await as('smejia@demo.clinara')
    const p = await freePatient(doc)
    const w = await reception.post('/api/appointments/walk-in', { patientId: p.id, doctorId: 's-herrera', reason: 'Control' })
    const due = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10)
    const r = await doc.post('/api/consultations', { appointmentId: w.body.id, reason: 'Control', history: 'Control', exam: 'Normal', diagnoses: [{ code: 'BA00', label: 'Hipertensión' }], orders: [],
      exams: [{ group: 'lab', name: 'Perfil lipídico', priority: 'routine', place: 'clinic' }, { group: 'lab', name: 'Creatinina', priority: 'routine', place: 'clinic' }],
      followups: [{ kind: 'reminder', reminderType: 'exam', title: 'Traer resultados', dueDate: due }] })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    const locks = (await doc.get(`/api/consultations/${r.body.consultationId}/correct`)).body
    assert.equal(locks.exams.length, 2); assert.equal(locks.followups.length, 1); assert.equal(locks.followups[0].lock, undefined)
    const keep = locks.exams.find((e: any) => e.name === 'Creatinina').id
    const base = { version: 1, reason: 'Control', history: 'Control', exam: 'Normal', diagnoses: [{ code: 'BA00', label: 'Hipertensión' }] }
    const later = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10)
    const c = await doc.post(`/api/consultations/${r.body.consultationId}/correct`, { ...base, keepExams: [keep], followups: [{ id: locks.followups[0].id, title: 'Traer resultados de laboratorio', dueDate: later }] })
    assert.equal(c.status, 200, JSON.stringify(c.body))
    const again = (await doc.get(`/api/consultations/${r.body.consultationId}/correct`)).body
    assert.deepEqual(again.exams.map((e: any) => e.name), ['Creatinina'])
    assert.equal(again.followups[0].dueDate, later); assert.equal(again.followups[0].title, 'Traer resultados de laboratorio')
    // Con el aviso enviado, el seguimiento ya no se ajusta aquí
    await sql.run('UPDATE followups SET reminded_week = ? WHERE id = ?', [new Date().toISOString(), locks.followups[0].id])
    const sent = await doc.post(`/api/consultations/${r.body.consultationId}/correct`, { ...base, version: 2, followups: [] })
    assert.equal(sent.status, 409); assert.match(sent.body.error, /Ya se envió un aviso/)
  })

  test('signos vitales: sólo quien los registró', async () => {
    const doc = await as('lherrera@demo.clinara')
    const nurse = await as('crios@demo.clinara')
    const stay = (await doc.get('/api/bootstrap')).body.inpatients.find((h: any) => h.kind === 'hospital' && h.status === 'active')
    const v = await nurse.post(`/api/inpatient/${stay.id}/vitals`, { systolic: 120, diastolic: 80, heartRate: 80, temperature: 37, spo2: 97 })
    assert.equal(v.status, 201, JSON.stringify(v.body))
    const c = await nurse.post(`/api/vitals/${v.body.id}/correct`, { version: 1, systolic: 112, diastolic: 80, heartRate: 80, temperature: 37, spo2: 97 })
    assert.equal(c.status, 200, JSON.stringify(c.body)); assert.equal(c.body.systolic, 112); assert.equal(c.body.version, 2)
    assert.equal((await doc.post(`/api/vitals/${v.body.id}/correct`, { version: 2, systolic: 1 })).status, 403)
  })
})
