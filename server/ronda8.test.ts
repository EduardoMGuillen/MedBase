import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb } from './db.js'
import { createSql, type Sql } from './sql.js'
import { doseAt, medLabel } from '../src/lib/inpatient.js'
import { canReview, isPending, reportOptional } from '../src/lib/exams.js'
import { criticalLimitsOf, customized, DEFAULT_CRITICAL_GROUPS, isCritical, mergeCriticalGroups } from '../src/lib/clinicalConfig.js'

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
  return { get: (p: string) => call('GET', p), post: (p: string, b?: unknown) => call('POST', p, b), put: (p: string, b: unknown) => call('PUT', p, b) }
}

const today = () => { const d = new Date(); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }

/** Paciente libre (sin estancia, sin citas abiertas hoy). */
async function freePatient(doc: Awaited<ReturnType<typeof as>>, skip: string[] = []) {
  const boot = (await doc.get('/api/bootstrap')).body
  const busy = new Set([...boot.inpatients.filter((h: any) => h.status === 'active').map((h: any) => h.patientId), ...skip])
  const open = new Set(boot.appointments.filter((a: any) => a.start.startsWith(today()) && !['done', 'cancelled', 'no_show'].includes(a.status)).map((a: any) => a.patientId))
  return boot.patients.find((x: any) => !busy.has(x.id) && !open.has(x.id) && !x.pending && x.dni)
}

/** Consulta sin cita de la Dra. Herrera; con `observe`, ingresa a observación. */
async function consult(doc: Awaited<ReturnType<typeof as>>, patientId: string, observe: boolean, items: any[] = []) {
  const reception = await as('smejia@demo.clinara')
  const w = await reception.post('/api/appointments/walk-in', { patientId, doctorId: 's-herrera', reason: 'Ronda 8' })
  assert.equal(w.status, 201, JSON.stringify(w.body))
  const r = await doc.post('/api/consultations', { appointmentId: w.body.id, reason: 'Fiebre', symptoms: [], history: 'Fiebre de 3 días', exam: 'Febril', observations: '',
    diagnoses: [{ code: 'MG26', label: 'Fiebre' }], orders: ['Dieta blanda.'], indications: ['Dieta blanda.'], plan: '', observe, items, exams: [] })
  assert.equal(r.status, 201, JSON.stringify(r.body))
  return r.body as { consultationId: string; hospitalizationId?: string }
}

describe('Ronda 8: incongruencias de la consulta externa', () => {
  test('al internar al paciente se cancelan sus otras citas abiertas de hoy y ya no se le marca llegada ni entra sin cita', async () => {
    const doc = await as('lherrera@demo.clinara')
    const reception = await as('smejia@demo.clinara')
    const p = await freePatient(doc)
    // Llegó también con otro médico
    const other = await reception.post('/api/appointments/walk-in', { patientId: p.id, doctorId: 's-paz', reason: 'Otra cosa' })
    assert.equal(other.status, 201)
    const { hospitalizationId } = await consult(doc, p.id, true)
    assert.ok(hospitalizationId)
    const appts = (await reception.get(`/api/appointments?from=${today()}&to=${today()}`)).body.filter((a: any) => a.patientId === p.id)
    assert.equal(appts.find((a: any) => a.id === other.body.id).status, 'cancelled', 'la cita en sala con otro médico se cerró')
    assert.ok(appts.some((a: any) => a.status === 'done'), 'la que originó el ingreso queda atendida')
    const again = await reception.post('/api/appointments/walk-in', { patientId: p.id, doctorId: 's-paz', reason: 'Otra vez' })
    assert.equal(again.status, 409)
    assert.match(again.body.error, /observación/)
  })

  test('la migración cierra lo que ya estaba incongruente', async () => {
    const { closeVisitsOfInpatients } = await import('./stayVisits.js')
    const h = (await sql.query(`SELECT * FROM hospitalizations WHERE status = 'active' AND clinic_id = 'c-sb' LIMIT 1`))[0]
    const id = 'r8-incongruente'
    const now = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    await sql.run(`INSERT INTO appointments (id, patient_id, doctor_id, start, minutes, reason, type, status, arrived_at, source, clinic_id) VALUES (?,?,?,?,30,'x','followup','arrived',?,'staff','c-sb')`,
      [id, String(h.patient_id), 's-paz', `${today()}T${p(now.getHours())}:00:00`, now.toISOString()])
    assert.ok(await closeVisitsOfInpatients(sql) >= 1)
    assert.equal((await sql.one('SELECT status FROM appointments WHERE id = ?', [id]))!.status, 'cancelled')
  })
})

describe('Ronda 8: rayos X sin informe obligatorio', () => {
  test('reglas', () => {
    assert.ok(reportOptional({ group: 'imaging', name: 'Radiografía de tórax' }))
    assert.ok(reportOptional({ group: 'imaging', name: 'Rayos X lateral de columna lumbar' }))
    assert.ok(!reportOptional({ group: 'imaging', name: 'Ultrasonido abdominal' }))
    assert.ok(!reportOptional({ group: 'lab', name: 'Hemograma' }))
    assert.ok(!isPending({ status: 'done', group: 'imaging', name: 'Radiografía de tórax' }))
    assert.ok(isPending({ status: 'done', group: 'imaging', name: 'Tomografía (TAC)' }))
    assert.ok(canReview({ status: 'done', group: 'imaging', name: 'Radiografía de tórax' }))
    assert.ok(!canReview({ status: 'done', group: 'imaging', name: 'Ultrasonido abdominal' }))
  })

  test('realizada sale de la bandeja y el médico la revisa sin informe; un ultrasonido sigue esperando el suyo', async () => {
    const doc = await as('lherrera@demo.clinara')
    const nurse = await as('crios@demo.clinara')
    const stay = (await consult(doc, (await freePatient(doc)).id, true)).hospitalizationId!
    const n = await doc.post(`/api/inpatient/${stay}/notes`, { kind: 'evolution', format: 'dx', observations: 'Control', exams: [
      { group: 'imaging', name: 'Radiografía de tórax', priority: 'routine', place: 'clinic' }, { group: 'imaging', name: 'Ultrasonido abdominal', priority: 'routine', place: 'clinic' }] })
    assert.equal(n.status, 201, JSON.stringify(n.body))
    const file = (await doc.get(`/api/inpatient/${stay}`)).body
    const rx = file.exams.find((e: any) => e.name === 'Radiografía de tórax')
    const us = file.exams.find((e: any) => e.name === 'Ultrasonido abdominal')
    for (const e of [rx, us]) assert.equal((await nurse.post(`/api/exams/${e.id}/status`, { status: 'done' })).status, 200)
    const tray = (await nurse.get('/api/exams/tray')).body.map((e: any) => e.id)
    assert.ok(!tray.includes(rx.id), 'la radiografía realizada ya no está pendiente')
    assert.ok(tray.includes(us.id), 'el ultrasonido sigue esperando su informe')
    assert.equal((await doc.post(`/api/exams/${rx.id}/review`)).status, 200)
    assert.equal((await doc.post(`/api/exams/${us.id}/review`)).status, 409)
  })
})

describe('Ronda 8: nota de evolución y medicamentos', () => {
  test('la evolución se guarda entre diagnóstico y examen físico; infusión con velocidad y primera dosis distinta pasan a la hoja', async () => {
    const doc = await as('lherrera@demo.clinara')
    const stay = (await consult(doc, (await freePatient(doc)).id, true)).hospitalizationId!
    const first = new Date(Date.now() - 60_000).toISOString()
    const n = await doc.post(`/api/inpatient/${stay}/notes`, {
      kind: 'evolution', format: 'dx', diagnoses: [{ code: 'MG26', label: 'Fiebre' }], evolution: 'Afebril desde anoche, tolera la vía oral.', exam: 'Estable',
      meds: [
        { drug: 'Midazolam', dose: '50 mg en 100 ml', route: 'Intravenosa', prn: false, firstAt: first, infusionRate: 5, infusionUnit: 'ml/h' },
        { drug: 'Ceftriaxona', presentation: 'Vial 1 g', dose: '1 g', route: 'Intramuscular', everyHours: 12, prn: false, firstAt: first, loadingDose: '2 g' },
      ],
      exams: [{ group: 'imaging', name: 'Tomografía (TAC)', region: 'tórax', priority: 'routine', place: 'external' }],
    })
    assert.equal(n.status, 201, JSON.stringify(n.body))
    assert.equal(n.body.evolution, 'Afebril desde anoche, tolera la vía oral.')
    assert.ok(n.body.examBatch, 'con un examen externo vuelve la orden para imprimir')
    const order = await doc.get(`/api/exams/batch/${n.body.examBatch}`)
    assert.equal(order.status, 200)
    assert.equal(order.body.exams[0].place, 'external')
    const file = (await doc.get(`/api/inpatient/${stay}`)).body
    const mida = file.meds.find((m: any) => m.drug === 'Midazolam')
    const cef = file.meds.find((m: any) => m.drug === 'Ceftriaxona')
    assert.deepEqual([mida.infusionRate, mida.infusionUnit, mida.everyHours], [5, 'ml/h', undefined])
    assert.equal(medLabel(mida), 'Midazolam 50 mg en 100 ml IV infusión continua a 5 ml/h')
    assert.equal(cef.loadingDose, '2 g')
    assert.equal(medLabel(cef), 'Ceftriaxona 2 g IM STAT y luego 1 g IM c/12h')
    assert.equal(doseAt(cef, new Date(cef.firstAt)), '2 g')
    assert.equal(doseAt(cef, new Date(new Date(cef.firstAt).getTime() + 12 * 3_600_000)), '1 g')
    // Lo de siempre no cambia
    assert.equal(medLabel({ drug: 'Ondansetrón', dose: '8 mg', route: 'Intravenosa', everyHours: 8, prn: false }), 'Ondansetrón 8 mg IV c/8h')
    // Combinaciones sin sentido
    const bad = await doc.post(`/api/inpatient/${stay}/notes`, { kind: 'evolution', format: 'dx', observations: 'x', meds: [{ drug: 'X', dose: '1', route: 'Intravenosa', everyHours: 8, prn: false, infusionRate: 3 }] })
    assert.equal(bad.status, 400)
  })
})

describe('Ronda 8: referencia a otro centro', () => {
  test('desde la consulta externa, con diagnóstico, tratamiento y motivo; no cierra nada', async () => {
    const doc = await as('lherrera@demo.clinara')
    const { consultationId } = await consult(doc, (await freePatient(doc)).id, false,
      [{ drug: 'Acetaminofén', presentation: 'Tableta 500 mg', dose: '1 tableta', route: 'Oral', frequency: 'Cada 8 horas', duration: '3 días' }])
    const draft = await doc.get(`/api/consultations/${consultationId}/referral-draft`)
    assert.equal(draft.status, 200)
    assert.equal(draft.body.source, 'consultation')
    assert.match(draft.body.admissionDiagnosis, /Fiebre/)
    assert.match(draft.body.treatment, /Acetaminofén/)
    const r = await doc.post(`/api/consultations/${consultationId}/referral`, { ...draft.body, reason: 'Valoración por infectología', destination: 'Hospital Escuela', informed: true })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    assert.equal(r.body.consultationId, consultationId)
    assert.equal(r.body.data.reason, 'Valoración por infectología')
    const note = (await doc.get(`/api/consultations/${consultationId}`)).body
    assert.equal(note.referrals.length, 1)
  })

  test('desde la hospitalización y la observación de la clínica; si sigue internado, la estancia no se cierra', async () => {
    const doc = await as('lherrera@demo.clinara')
    const hosp = (await doc.get('/api/bootstrap')).body.inpatients.find((h: any) => h.kind === 'hospital' && h.status === 'active')
    const d1 = await doc.get(`/api/inpatient/${hosp.id}/referral-draft`)
    assert.equal(d1.status, 200)
    assert.equal(d1.body.source, 'hospital')
    const r1 = await doc.post(`/api/inpatient/${hosp.id}/referral`, { ...d1.body, reason: 'Tomografía que no hay en la clínica', closeStay: false })
    assert.equal(r1.status, 201, JSON.stringify(r1.body))
    assert.equal((await doc.get(`/api/inpatient/${hosp.id}`)).body.hospitalization.status, 'active')
    const obs = (await consult(doc, (await freePatient(doc)).id, true)).hospitalizationId!
    const d2 = await doc.get(`/api/inpatient/${obs}/referral-draft`)
    const r2 = await doc.post(`/api/inpatient/${obs}/referral`, { ...d2.body, reason: 'Requiere UCI' })
    assert.equal(r2.status, 201)
    const after2 = (await doc.get(`/api/inpatient/${obs}`)).body.hospitalization
    assert.deepEqual([after2.status, after2.outcome], ['discharged', 'referred'])
  })
})

describe('Ronda 8: umbrales críticos de la app', () => {
  test('la app trae los suyos; lo que la clínica cambió manda y se marca; los nuevos de la app llegan solos', () => {
    const merged = mergeCriticalGroups(undefined)
    assert.equal(merged.length, DEFAULT_CRITICAL_GROUPS.length)
    const saved = structuredClone(DEFAULT_CRITICAL_GROUPS).map((g) => (g.id === 'g-electrolitos' ? { ...g, analytes: g.analytes.filter((a) => a.id !== 'a-na') } : g))
    saved[0].analytes[0] = { ...saved[0].analytes[0], low: 6 }
    const m = mergeCriticalGroups(saved)
    const hb = m[0].analytes.find((a) => a.id === 'a-hb')!
    assert.equal(hb.low, 6)
    assert.ok(customized(hb))
    assert.ok(m.find((g) => g.id === 'g-electrolitos')!.analytes.some((a) => a.id === 'a-na'), 'el sodio de la app vuelve a la lista')
    assert.ok(isCritical(criticalLimitsOf(saved), 'Sodio', 110))
    // Un analito que la clínica archivó no reaparece
    const archived = structuredClone(DEFAULT_CRITICAL_GROUPS)
    archived[0].analytes[0].archivedAt = new Date().toISOString()
    assert.equal(mergeCriticalGroups(archived)[0].analytes.filter((a) => a.id === 'a-hb').length, 1)
  })
})
