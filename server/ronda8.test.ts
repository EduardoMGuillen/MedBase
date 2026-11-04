import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb } from './db.js'
import { createSql, type Sql } from './sql.js'
import { doseAt, medLabel } from '../src/lib/inpatient.js'
import { canReview, examStatusLabel, isPending, reportOptional } from '../src/lib/exams.js'
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
  return { get: (p: string) => call('GET', p), post: (p: string, b?: unknown) => call('POST', p, b), put: (p: string, b: unknown) => call('PUT', p, b), patch: (p: string, b: unknown) => call('PATCH', p, b) }
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
    assert.match(again.body.error, /^Este paciente está en observación \(desde \d{2}\/\d{2}\/\d{4}\)\. No puede pasar a consulta externa hasta su egreso\.$/)
    // CX2: la cita cerrada lleva motivo, autor «Sistema» y hora, y se puede reprogramar
    const closed = appts.find((a: any) => a.id === other.body.id)
    assert.equal(closed.cancelReason, 'Paciente con estancia activa (hospitalizado/observación)')
    assert.equal(closed.cancelledBy, 'system')
    assert.ok(closed.cancelledAt)
    // CX2: no se agenda para hoy; a futuro sí
    const d = new Date(); const pad = (n: number) => String(n).padStart(2, '0')
    let future = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate())
    // el Dr. Paz no atiende domingos
    while (future.getDay() === 0 || future.getDay() === 6) future = new Date(future.getFullYear(), future.getMonth(), future.getDate() + 1)
    const fut = `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}T09:00:00`
    const todayAppt = await reception.post('/api/appointments', { patientId: p.id, doctorId: 's-paz', start: `${today()}T${pad(Math.min(16, d.getHours() + 1))}:00:00`, reason: 'Control' })
    assert.equal(todayAppt.status, 409, JSON.stringify(todayAppt.body))
    assert.match(todayAppt.body.error, /No puede pasar a consulta externa hasta su egreso/)
    assert.equal((await reception.post('/api/appointments', { patientId: p.id, doctorId: 's-paz', start: fut, reason: 'Control' })).status, 201)
    const moved = await reception.patch(`/api/appointments/${other.body.id}`, { start: fut.replace('09:00', '10:00') })
    assert.equal(moved.status, 200, JSON.stringify(moved.body))
    assert.equal(moved.body.status, 'scheduled')
    assert.equal(moved.body.cancelReason, undefined)
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
    const row = (await sql.one('SELECT status, cancel_reason, cancelled_by FROM appointments WHERE id = ?', [id]))!
    assert.equal(row.status, 'cancelled')
    assert.equal(row.cancelled_by, 'system')
    // CX2: idempotente: la segunda vez no cambia nada
    assert.equal(await closeVisitsOfInpatients(sql), 0)
  })
})

describe('Ronda 8: rayos X sin informe obligatorio', () => {
  test('reglas', () => {
    assert.ok(reportOptional({ group: 'imaging', name: 'Radiografía de tórax' }))
    assert.ok(reportOptional({ group: 'imaging', name: 'Rayos X lateral de columna lumbar' }))
    assert.ok(!reportOptional({ group: 'imaging', name: 'Ultrasonido abdominal' }))
    // EX3: por prefijo, sin importar mayúsculas ni tildes; no basta con que aparezca en medio del nombre
    assert.ok(reportOptional({ group: 'imaging', name: 'RX de tórax PA' }))
    assert.ok(reportOptional({ group: 'imaging', name: 'radiografia de mano' }))
    assert.ok(!reportOptional({ group: 'imaging', name: 'Tomografía con rayos x previos' }))
    assert.equal(examStatusLabel({ group: 'imaging', name: 'Radiografía de tórax', status: 'done' }), 'Realizado · sin informe')
    assert.equal(examStatusLabel({ group: 'imaging', name: 'Radiografía de tórax', status: 'result' }), 'Con informe')
    assert.equal(examStatusLabel({ group: 'imaging', name: 'Tomografía (TAC)', status: 'done' }), 'Realizado')
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
    // DM2 (ronda 11): con personal de Imágenes en la demo, los estudios de imagen se trabajan en su bandeja
    const tray = (await nurse.get('/api/exams/tray')).body.map((e: any) => e.id)
    assert.ok(!tray.includes(rx.id), 'la radiografía realizada ya no está pendiente')
    const items = (await (await as('pandino@demo.clinara')).get('/api/dept/tray')).body.items
    assert.equal(items.find((e: any) => e.id === us.id)?.status, 'done', 'el ultrasonido sigue esperando su informe')
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
    // EX2: número de orden correlativo y registro de cada impresión
    assert.match(order.body.exams[0].orderNo, /^OE-\d{4}-\d{4}$/)
    assert.equal((await doc.post(`/api/exams/batch/${n.body.examBatch}/printed`, { group: 'imaging', how: 'pdf' })).status, 200)
    const log = (await (await as('admin@demo.clinara')).get('/api/audit?limit=20')).body
    assert.ok((Array.isArray(log) ? log : log.items ?? []).some((a: any) => /Descargó en PDF la orden de imagen y gabinete OE-/.test(a.action ?? a.text ?? '')))
    const file = (await doc.get(`/api/inpatient/${stay}`)).body
    const mida = file.meds.find((m: any) => m.drug === 'Midazolam')
    const cef = file.meds.find((m: any) => m.drug === 'Ceftriaxona')
    assert.deepEqual([mida.infusionRate, mida.infusionUnit, mida.everyHours], [5, 'ml/h', undefined])
    assert.equal(medLabel(mida), 'Midazolam 50 mg en 100 ml IV · Infusión a 5 mL/h')
    assert.equal(cef.loadingDose, '2 g')
    assert.equal(cef.loadingStat, true)
    assert.equal(medLabel(cef), 'Ceftriaxona IM · 2 g STAT y luego 1 g c/12h')
    assert.equal(medLabel({ ...cef, loadingStat: false, firstAt: new Date(2026, 10, 2, 14, 0).toISOString() }), 'Ceftriaxona IM · 2 g el 02/11/2026 14:00 y luego 1 g c/12h')
    assert.equal(doseAt(cef, new Date(cef.firstAt)), '2 g')
    assert.equal(doseAt(cef, new Date(new Date(cef.firstAt).getTime() + 12 * 3_600_000)), '1 g')
    // ME2: cada dosis registrada guarda la cantidad que le tocaba
    const nurse = await as('crios@demo.clinara')
    const d1 = await nurse.post(`/api/inpatient/meds/${cef.id}/doses`, { scheduledAt: cef.firstAt, status: 'given' })
    assert.equal(d1.status, 201, JSON.stringify(d1.body))
    assert.equal(d1.body.dose, '2 g')
    // ME1: la infusión tiene un evento de inicio; después se suspende con hora, quién y motivo
    assert.equal((await nurse.post(`/api/inpatient/meds/${mida.id}/infusion-stop`, {})).status, 409, 'sin inicio no se suspende')
    assert.equal((await nurse.post(`/api/inpatient/meds/${mida.id}/doses`, { scheduledAt: mida.firstAt, status: 'given' })).status, 201)
    const stopped = await nurse.post(`/api/inpatient/meds/${mida.id}/infusion-stop`, { note: 'Se terminó la mezcla' })
    assert.equal(stopped.status, 200, JSON.stringify(stopped.body))
    assert.ok(stopped.body.infusionStoppedAt)
    assert.equal(stopped.body.infusionStopNote, 'Se terminó la mezcla')
    // ME1: velocidad con más de dos decimales o fuera del límite no pasa
    for (const infusionRate of [2.555, 5000]) {
      const r = await doc.post(`/api/inpatient/${stay}/notes`, { kind: 'evolution', format: 'dx', observations: 'x', meds: [{ drug: 'Y', dose: '1', route: 'Intravenosa', prn: false, infusionRate }] })
      assert.equal(r.status, 400, String(infusionRate))
    }
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
    const r = await doc.post(`/api/consultations/${consultationId}/referral`, { ...draft.body, reason: 'Valoración por infectología', destination: 'Hospital Escuela', priority: 'urgent', consent: true })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    assert.equal(r.body.consultationId, consultationId)
    assert.equal(r.body.data.reason, 'Valoración por infectología')
    assert.equal(r.body.data.priority, 'urgent')
    assert.ok(Array.isArray(r.body.data.patient.allergies), 'la hoja lleva las alergias')
    const note = (await doc.get(`/api/consultations/${consultationId}`)).body
    assert.equal(note.referrals.length, 1)
    // RF1: firmada se corrige con adenda (sólo el médico); recepción no la ve, ni por URL directa
    const ad = await doc.post('/api/addenda', { targetKind: 'referral', targetId: r.body.id, kind: 'correction', corrects: 'Servicio', text: 'El servicio es infectología pediátrica.' })
    assert.equal(ad.status, 201, JSON.stringify(ad.body))
    assert.equal((await doc.get(`/api/referrals/${r.body.id}`)).body.addenda.length, 1)
    assert.equal((await (await as('crios@demo.clinara')).post('/api/addenda', { targetKind: 'referral', targetId: r.body.id, kind: 'info', text: 'Nota de enfermería' })).status, 403)
    assert.equal((await (await as('crios@demo.clinara')).get(`/api/referrals/${r.body.id}`)).status, 200, 'enfermería la ve e imprime')
    assert.equal((await (await as('smejia@demo.clinara')).get(`/api/referrals/${r.body.id}`)).status, 403, 'recepción no la ve')
    // RF1: la impresión queda en la bitácora; la lista del paciente la trae
    assert.equal((await doc.post(`/api/referrals/${r.body.id}/printed`, { how: 'print' })).status, 200)
    assert.ok((await doc.get(`/api/patients/${draft.body.patient ? r.body.patientId : ''}/referrals`)).body.some((x: any) => x.id === r.body.id))
  })

  test('RF1: desde la consulta en borrador (por su cita); al firmar la nota se enlaza a la consulta', async () => {
    const doc = await as('lherrera@demo.clinara')
    const reception = await as('smejia@demo.clinara')
    const p = await freePatient(doc)
    const w = await reception.post('/api/appointments/walk-in', { patientId: p.id, doctorId: 's-herrera', reason: 'Dolor torácico' })
    const draft = await doc.get(`/api/appointments/${w.body.id}/referral-draft`)
    assert.equal(draft.status, 200)
    const r = await doc.post(`/api/appointments/${w.body.id}/referral`, { ...draft.body, history: 'Dolor opresivo', admissionDiagnosis: 'Dolor torácico', reason: 'Valoración por cardiología', destination: 'Hospital Escuela', consent: true })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    assert.equal(r.body.consultationId, undefined)
    const c = await doc.post('/api/consultations', { appointmentId: w.body.id, reason: 'Dolor torácico', symptoms: [], history: 'Dolor opresivo', exam: 'Estable', observations: '',
      diagnoses: [{ code: 'MD30', label: 'Dolor torácico' }], orders: ['Reposo.'], indications: ['Reposo.'], plan: '', items: [], exams: [] })
    assert.equal(c.status, 201, JSON.stringify(c.body))
    assert.equal((await doc.get(`/api/referrals/${r.body.id}`)).body.consultationId, c.body.consultationId)
  })

  test('desde la hospitalización y la observación de la clínica; RF1: firmarla nunca cierra la estancia', async () => {
    const doc = await as('lherrera@demo.clinara')
    const hosp = (await doc.get('/api/bootstrap')).body.inpatients.find((h: any) => h.kind === 'hospital' && h.status === 'active')
    const d1 = await doc.get(`/api/inpatient/${hosp.id}/referral-draft`)
    assert.equal(d1.status, 200)
    assert.equal(d1.body.source, 'hospital')
    const r1 = await doc.post(`/api/inpatient/${hosp.id}/referral`, { ...d1.body, reason: 'Tomografía que no hay en la clínica', destination: 'Centro de imágenes', consent: true })
    assert.equal(r1.status, 201, JSON.stringify(r1.body))
    assert.equal((await doc.get(`/api/inpatient/${hosp.id}`)).body.hospitalization.status, 'active')
    const obs = (await consult(doc, (await freePatient(doc)).id, true)).hospitalizationId!
    const d2 = await doc.get(`/api/inpatient/${obs}/referral-draft`)
    const r2 = await doc.post(`/api/inpatient/${obs}/referral`, { ...d2.body, reason: 'Requiere UCI', destination: 'Hospital Escuela', consent: true, closeStay: true })
    assert.equal(r2.status, 201)
    assert.equal((await doc.get(`/api/inpatient/${obs}`)).body.hospitalization.status, 'active')
    // Enfermería no firma referencias
    assert.equal((await (await as('crios@demo.clinara')).post(`/api/inpatient/${obs}/referral`, { ...d2.body, reason: 'x x x', destination: 'H', consent: true })).status, 403)
  })
})

describe('Ronda 8: umbrales críticos de la app', () => {
  test('la app trae los suyos; lo que la clínica cambió manda y se marca; los nuevos de la app llegan solos', () => {
    const merged = mergeCriticalGroups(undefined)
    assert.equal(merged.length, DEFAULT_CRITICAL_GROUPS.length)
    const saved = structuredClone(DEFAULT_CRITICAL_GROUPS).map((g) => (g.id === 'g-electrolitos' ? { ...g, analytes: g.analytes.filter((a) => a.id !== 'a-na') } : g))
    // UM2: sin personalizar manda el de la app (aunque lo guardado diga otra cosa); personalizado, el de la clínica
    saved[0].analytes[0] = { ...saved[0].analytes[0], low: 6, f: undefined, m: undefined }
    assert.deepEqual(mergeCriticalGroups(saved)[0].analytes.find((a) => a.id === 'a-hb')!.f, { low: 12, high: 16 })
    saved[0].analytes[0] = { ...saved[0].analytes[0], editedAt: new Date().toISOString(), editedBy: 's-admin' }
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

describe('CX1: Consulta externa por hora o por médico', () => {
  test('Administración guarda su vista y la recupera al volver a entrar; no toca la de «Por llegar hoy»', async () => {
    const admin = await as('admin@demo.clinara')
    assert.equal((await admin.patch('/api/me', { queueView: 'doctor' })).status, 200)
    const again = await as('admin@demo.clinara')
    const prefs = (await again.get('/api/auth/me')).body.user.prefs
    assert.equal(prefs.queueView, 'doctor')
    assert.notEqual(prefs.arrivalsView, 'doctor')
    assert.equal((await again.patch('/api/me', { queueView: 'hour' })).status, 200)
  })
})

describe('NE4: los diagnósticos bajan de nota en nota', () => {
  test('la evolución guarda la lista vigente (también en SOAP) y la bitácora dice qué se quitó y qué se agregó', async () => {
    const doc = await as('lherrera@demo.clinara')
    const stay = (await consult(doc, (await freePatient(doc)).id, true)).hospitalizationId!
    // Del ingreso viene «Fiebre (MG26)»: se quita y se agrega otro
    const n1 = await doc.post(`/api/inpatient/${stay}/notes`, { kind: 'evolution', format: 'dx', diagnoses: [{ code: 'CB41', label: 'Insuficiencia respiratoria' }], exam: 'Disneico' })
    assert.equal(n1.status, 201, JSON.stringify(n1.body))
    const soap = await doc.post(`/api/inpatient/${stay}/notes`, { kind: 'evolution', format: 'soap', subjective: 'Mejor', objective: 'Estable', assessment: 'Mejoría', plan: 'Igual',
      diagnoses: [{ code: 'CB41', label: 'Insuficiencia respiratoria' }, { code: 'CA00', label: 'Rinofaringitis aguda' }] })
    assert.equal(soap.status, 201, JSON.stringify(soap.body))
    const file = (await doc.get(`/api/inpatient/${stay}`)).body
    const last = file.notes.find((x: any) => x.id === soap.body.id)
    assert.deepEqual(last.diagnoses.map((d: any) => d.code), ['CB41', 'CA00'])
    const admin = await as('admin@demo.clinara')
    const log = (await admin.get('/api/audit?limit=50')).body
    const lines = (Array.isArray(log) ? log : log.items ?? []).map((a: any) => a.action ?? a.text ?? '')
    assert.ok(lines.some((t: string) => /agregó Insuficiencia respiratoria \(CB41\); quitó Fiebre \(MG26\)/.test(t)), lines.slice(0, 5).join('\n'))
    assert.ok(lines.some((t: string) => /agregó Rinofaringitis aguda \(CA00\)$/.test(t)))
  })
})

describe('NE5: fecha y hora dd/mm/aaaa HH:mm', () => {
  test('se lee y se escribe sin depender del idioma del navegador', async () => {
    const { fromDisplay, toDisplay } = await import('../src/lib/dateInput.js')
    assert.equal(toDisplay('2026-11-02T12:52'), '02/11/2026 12:52')
    assert.equal(fromDisplay('02/11/2026 12:52'), '2026-11-02T12:52')
    assert.equal(fromDisplay('31/02/2026 10:00'), null)
    assert.equal(fromDisplay('02/11/2026 24:00'), null)
  })
})

describe('UM1: valores de referencia del documento de Emil', () => {
  test('por sexo, «<X» y texto; el rango viaja con el resultado y se marca por el sexo del paciente', async () => {
    const { referenceOf, rangeFor, rangeText } = await import('../src/lib/labReference.js')
    const { flagOf, findExam } = await import('../src/lib/exams.js')
    const hb = referenceOf('Hemograma')!.analytes!.find((a) => a.name === 'Hemoglobina')!
    assert.deepEqual(rangeFor(hb, 'F'), { low: 12, high: 16, highOpen: undefined })
    assert.deepEqual(rangeFor(hb, 'M'), { low: 14, high: 18, highOpen: undefined })
    assert.equal(rangeText(hb), 'Mujeres 12–16 · Hombres 14–18')
    const ct = referenceOf('Colesterol total')!.analytes![0]
    assert.equal(flagOf(200, ct.low, ct.high, ct.highOpen), 'high', '«<200»: 200 ya es alto')
    assert.equal(flagOf(199, ct.low, ct.high, ct.highOpen), undefined)
    assert.deepEqual(referenceOf('Coombs directo')!.src, ['MLP-Coombs'])
    // Reemplaza el rango que el examen ya tenía (TSH 0.4–4 → 0.5–4.0)
    assert.equal(findExam('TSH')!.analytes![0].low, 0.5)
    // Un examen del Anexo A sin analitos en la lista fija ahora los trae
    assert.equal(findExam('Fibrinógeno')!.analytes![0].high, 400)

    const doc = await as('lherrera@demo.clinara')
    const nurse = await as('crios@demo.clinara')
    const pid = (await freePatient(doc)).id
    await sql.run(`UPDATE patients SET sex = 'M' WHERE id = ?`, [pid])
    const stay = (await consult(doc, pid, true)).hospitalizationId!
    const note = await doc.post(`/api/inpatient/${stay}/notes`, { kind: 'evolution', format: 'dx', observations: 'Control', exams: [{ group: 'lab', name: 'Hemograma', priority: 'routine', place: 'clinic' }] })
    assert.equal(note.status, 201, JSON.stringify(note.body))
    const e = (await doc.get(`/api/inpatient/${stay}`)).body.exams.find((x: any) => x.name === 'Hemograma')
    const r = await nurse.post(`/api/exams/${e.id}/result`, { values: [{ analyte: 'Hemoglobina', value: '13' }] })
    assert.equal(r.status, 200, JSON.stringify(r.body))
    assert.equal(r.body.result.values[0].flag, 'low', 'hombre con 13 g/dL: bajo')
  })
})

describe('UM2: umbrales críticos con fuente', () => {
  test('los del .md son los de la app, por sexo, con fuente; los fármacos con su número y el operador anotado', () => {
    const groups = mergeCriticalGroups([{ id: 'g-hemograma', name: 'Hemograma', analytes: [{ id: 'a-hb', name: 'Hemoglobina', low: 7, high: 20 }] }])
    const hb = groups.find((g) => g.id === 'g-hemograma')!.analytes.find((a) => a.id === 'a-hb')!
    assert.deepEqual([hb.f, hb.m, hb.sources], [{ low: 12, high: 16 }, { low: 14, high: 18 }, ['ABIM-2026']])
    const lim = criticalLimitsOf(groups)
    assert.ok(isCritical(lim, 'Hemoglobina', 11, 'F'), 'una paciente con Hb 11 es crítica')
    assert.ok(!isCritical(lim, 'Hemoglobina', 13, 'F'))
    assert.ok(isCritical(lim, 'Hemoglobina', 13, 'M'))
    const drugs = groups.find((g) => g.id === 'g-farmacos')!
    assert.equal(drugs.name, 'Fármacos (niveles séricos)')
    assert.deepEqual(drugs.analytes.map((a) => [a.name, a.high, a.op]).sort(), [['Carbamazepina', 15, '≥15.0'], ['Digoxina', 2.1, '≥2.1'], ['Fenitoína', 25, '≥25.0'], ['Fenobarbital', 50, '≥50.0'], ['Litio', 2, '>2.0'], ['Ácido valproico', 100, '≥100']].sort())
    assert.ok(isCritical(lim, 'Digoxina', 2.5) && !isCritical(lim, 'Digoxina', 1.2))
    const plaq = groups.flatMap((g) => g.analytes).find((a) => a.name === 'Plaquetas')!
    assert.deepEqual([plaq.low, plaq.high, plaq.unit], [150, 450, '×10³/µL'])
    // La glucosa (categorías) no es umbral del .md: queda el inicial sin fuente
    assert.deepEqual(groups.flatMap((g) => g.analytes).find((a) => a.name === 'Glucosa')!.sources, ['initial'])
  })

  test('la migración reemplaza lo de la clínica (queda en el historial) y es idempotente; personalizar y restablecer', async () => {
    const { migrateCriticalDefaults } = await import('./db.js')
    await sql.run(`UPDATE clinics SET critical_groups = ? WHERE id = 'c-sb'`, [JSON.stringify([{ id: 'g-hemograma', name: 'Hemograma', analytes: [{ id: 'a-hb', name: 'Hemoglobina', unit: 'g/dL', low: 7, high: 20 }] }])])
    await sql.run(`DELETE FROM meta WHERE key LIKE 'um2:%:c-sb'`)
    await migrateCriticalDefaults(sql)
    const after = JSON.parse(String((await sql.one(`SELECT critical_groups FROM clinics WHERE id = 'c-sb'`))!.critical_groups))
    const hb = after.find((g: any) => g.id === 'g-hemograma').analytes.find((a: any) => a.id === 'a-hb')
    assert.deepEqual(hb.f, { low: 12, high: 16 })
    assert.equal(hb.history[0].low, 7)
    const again = String((await sql.one(`SELECT critical_groups FROM clinics WHERE id = 'c-sb'`))!.critical_groups)
    await migrateCriticalDefaults(sql)
    assert.equal(String((await sql.one(`SELECT critical_groups FROM clinics WHERE id = 'c-sb'`))!.critical_groups), again, 'la segunda vez no cambia nada')
    // Personalizar la digoxina: queda con quién y cuándo; «Restablecer» la devuelve
    const admin = await as('admin@demo.clinara')
    const groups = (await admin.get('/api/bootstrap')).body.settings.criticalGroups ?? mergeCriticalGroups(after)
    const set = (high: number, reset?: boolean) => mergeCriticalGroups(groups).map((g: any) => ({ ...g, analytes: g.analytes.map((a: any) => (a.id === 'a-digoxina' ? { ...a, high, reset } : a)) }))
    const r1 = await admin.put('/api/settings/critical-groups', { groups: set(3) })
    assert.equal(r1.status, 200, JSON.stringify(r1.body))
    const dig = mergeCriticalGroups(r1.body.criticalGroups).flatMap((g: any) => g.analytes).find((a: any) => a.id === 'a-digoxina')!
    assert.equal(dig.high, 3)
    assert.ok(dig.editedAt && dig.editedBy)
    const r2 = await admin.put('/api/settings/critical-groups', { groups: set(3, true) })
    const dig2 = mergeCriticalGroups(r2.body.criticalGroups).flatMap((g: any) => g.analytes).find((a: any) => a.id === 'a-digoxina')!
    assert.equal(dig2.high, 2.1)
    assert.equal(dig2.editedAt, undefined)
    // Un médico de la clínica que no es Administración no puede (por URL directa)
    assert.equal((await (await as('lherrera@demo.clinara')).put('/api/settings/critical-groups', { groups: set(3) })).status, 403)
  })
})

describe('UM1: carga en la base', () => {
  test('cada clínica tiene los valores del .md con su fuente; la carga es idempotente y no pisa lo editado', async () => {
    const { loadRefValues } = await import('./refLoader.js')
    const hb = await sql.query(`SELECT * FROM exam_ref_values WHERE clinic_id = 'c-sb' AND exam_key = 'hemograma' AND analyte = 'Hemoglobina' AND archived_at IS NULL ORDER BY sex`)
    assert.deepEqual(hb.map((r) => [r.sex, Number(r.low), Number(r.high), JSON.parse(String(r.sources))[0]]), [['F', 12, 16, 'ABIM-2026'], ['M', 14, 18, 'ABIM-2026']])
    // La creatinina que traía la app queda en el historial
    const old = await sql.one(`SELECT * FROM exam_ref_values WHERE clinic_id = 'c-sb' AND exam_key = 'creatinina' AND origin = 'initial'`)
    assert.ok(old?.archived_at)
    assert.equal(Number(old!.low), 0.6)
    const count = async () => Number((await sql.one(`SELECT COUNT(*)::int AS n FROM exam_ref_values WHERE clinic_id = 'c-sb'`))!.n)
    const before = await count()
    const rep = await loadRefValues(sql, 'c-sb')
    assert.equal(rep.inserted, 0, 'la segunda vez no inserta nada')
    assert.equal(await count(), before)
    // La clínica edita la TSH; una carga futura no la pisa
    const admin = await as('admin@demo.clinara')
    const cat = (await admin.get('/api/exams/catalog')).body.exams.find((e: any) => e.name === 'TSH')
    const row = cat.refs.find((r: any) => r.analyte === 'TSH')
    const ed = await admin.put(`/api/exams/catalog/${cat.id}/refs`, { comment: 'Rango del laboratorio', rows: [{ ...row, low: 0.4, high: 4.5 }] })
    assert.equal(ed.status, 200, JSON.stringify(ed.body))
    assert.deepEqual(ed.body.map((r: any) => [r.low, r.origin, r.sources[0]]), [[0.4, 'clinic', 'clinic']])
    await sql.run(`DELETE FROM exam_ref_values WHERE clinic_id = 'c-sb' AND exam_key = 'hemograma' AND analyte = 'Hemoglobina' AND sex = 'F'`)
    await loadRefValues(sql, 'c-sb')
    const tsh = await sql.query(`SELECT * FROM exam_ref_values WHERE clinic_id = 'c-sb' AND exam_key = 'tsh' AND archived_at IS NULL`)
    assert.deepEqual(tsh.map((r) => [Number(r.low), r.origin]), [[0.4, 'clinic']])
    // Las fuentes están en su tabla
    // Ronda 12: el .md del 04/11/2026 agregó 17 fuentes (60 a 76)
    assert.equal(Number((await sql.one('SELECT COUNT(*)::int AS n FROM lab_sources'))!.n), 76)
    // Un médico que no es Administración no edita
    assert.equal((await (await as('lherrera@demo.clinara')).put(`/api/exams/catalog/${cat.id}/refs`, { rows: [] })).status, 403)
  })
})

describe('DM1: datos demo sin citas imposibles', () => {
  test('nadie internado está en la cola de hoy; hay un hospitalizado y uno en observación sin cita hoy; los perfiles demo siguen', async () => {
    const t = today()
    const conflict = await sql.query(`SELECT a.id FROM appointments a JOIN hospitalizations h ON h.patient_id = a.patient_id AND h.clinic_id = a.clinic_id AND h.status = 'active'
      WHERE a.status IN ('scheduled','confirmed','arrived','triaged','in_consult') AND a.start >= ? AND a.start < ?`, [t, `${t}T99`])
    assert.equal(conflict.length, 0)
    const free = async (kind: string) => Number((await sql.one(`SELECT COUNT(*)::int AS n FROM hospitalizations h WHERE h.status = 'active' AND h.kind = ?
      AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.patient_id = h.patient_id AND a.start >= ? AND a.start < ? AND a.status <> 'cancelled' AND a.status <> 'done')`, [kind, t, `${t}T99`]))!.n)
    assert.ok(await free('hospital') >= 1)
    assert.ok(await free('observation') >= 1)
    const names = (await sql.query('SELECT name FROM staff')).map((r) => String(r.name))
    for (const n of ['Roberto Aguilar', 'Sofía Mejía', 'Carmen Ríos', 'Karla Mendoza', 'Lucía Herrera', 'Andrés Paz', 'Mariela Zúñiga', 'Ana López'])
      assert.ok(names.some((x) => x.includes(n)), n)
  })
})
