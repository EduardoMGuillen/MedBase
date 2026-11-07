import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb } from './db.js'
import { createSql, type Sql } from './sql.js'
import { blankAnesthesia, gridPoints } from '../src/lib/anesthesia.js'
import { blankPreEval, latestLabs, prefillPreEval } from '../src/lib/preanesthesia.js'
import { ANESTHESIA_GRID } from '../src/lib/clinicalConfig.js'

// PQ4 y PQ5 (ronda 16): valoración preanestésica ligada a la estancia, registro de anestesia y recuento quirúrgico
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
  assert.equal(res.status, 200, `login ${email}`)
  const cookie = res.headers.get('set-cookie')?.split(';')[0] ?? ''
  const call = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(`${base}${path}`, { method, headers: { cookie, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const text = await r.text()
    let parsed: any = text
    try { parsed = JSON.parse(text) } catch { /* no es JSON */ }
    return { status: r.status, body: parsed }
  }
  return { get: (p: string) => call('GET', p), post: (p: string, b?: unknown) => call('POST', p, b), put: (p: string, b?: unknown) => call('PUT', p, b), del: (p: string) => call('DELETE', p) }
}
type Client = Awaited<ReturnType<typeof as>>

const pre = [{ code: 'DB10', label: 'Apendicitis aguda' }]
async function postopNote(doc: Client, stayId: string, team: Record<string, { name: string; staffId?: string }>) {
  const r = await doc.post(`/api/inpatient/${stayId}/notes`, { kind: 'evolution', format: 'postop', diagnoses: [{ code: 'DB10.0', label: 'Apendicitis perforada' }], postop: {
    preDiagnoses: pre, startAt: new Date(Date.now() - 150 * 60_000).toISOString(), endAt: new Date(Date.now() - 10 * 60_000).toISOString(), anesthesia: 'General',
    procedureName: 'Apendicectomía', description: 'Sin complicaciones.', urgent: true, justification: 'Abdomen agudo, sin familiar presente', team: { surgeon: { staffId: 's-nolasco', name: 'Dr. Hugo Nolasco' }, ...team },
  } })
  assert.equal(r.status, 201, JSON.stringify(r.body))
  return String(r.body.id)
}
async function uploadPdf(who: Client, patientId: string, stayId: string) {
  const uploadId = randomUUID()
  const data = Buffer.from('%PDF-1.4\n% hoja escaneada\n%%EOF').toString('base64')
  assert.equal((await who.post(`/api/uploads/${uploadId}/parts`, { index: 0, data })).status, 201)
  const att = await who.post(`/api/patients/${patientId}/attachments/assemble`, { uploadId, parts: 1, name: 'Hoja.pdf', mime: 'application/pdf', category: 'document', title: 'Hoja (papel)', hospitalizationId: stayId })
  assert.equal(att.status, 201, JSON.stringify(att.body))
  return String(att.body.id)
}
const evalData = (asa = 'II') => ({ ...blankPreEval(), asa, mallampati: 'I', difficultAirway: 'No', fastingSolids: '8', fastingLiquids: '6', allergies: 'Niega', proposedSurgery: 'Apendicectomía',
  labs: { hb: '12.5 g/dL', hto: '38 %', plt: '250000', inr: '1.0', glucose: '95', bloodType: 'O+' }, techniques: ['General balanceada'], plan: 'Ayuno, profilaxis antibiótica.' })
const audits = async () => JSON.stringify((await (await as('rmoncada@demo.clinara')).get('/api/audit')).body)

describe('PQ4 (ronda 16): valoración preanestésica antes de la cirugía y registro de anestesia después', () => {
  let stay: { id: string; patientId: string }
  let arita: Client; let nolasco: Client; let urbina: Client; let vallecillo: Client; let quiroz: Client; let moncada: Client; let escoto: Client
  before(async () => {
    arita = await as('sarita@demo.clinara'); nolasco = await as('hnolasco@demo.clinara'); urbina = await as('murbina@demo.clinara')
    vallecillo = await as('rvallecillo@demo.clinara'); quiroz = await as('aquiroz@demo.clinara'); moncada = await as('rmoncada@demo.clinara'); escoto = await as('nescoto@demo.clinara')
    stay = (await arita.get('/api/bootstrap')).body.inpatients.find((h: any) => h.kind === 'hospital' && h.status === 'active')
    assert.ok(stay)
  })

  test('sección 4: recepción y administración nada (403 por URL directa); enfermería sube en papel pero no escribe', async () => {
    for (const who of [quiroz, moncada]) {
      assert.equal((await who.get(`/api/inpatient/${stay.id}/preanesthesia`)).status, 403)
      assert.equal((await who.get(`/api/inpatient/${stay.id}/preanesthesia/blank`)).status, 403)
      assert.equal((await who.get(`/api/inpatient/${stay.id}/preanesthesia/prefill`)).status, 403)
      assert.equal((await who.post(`/api/inpatient/${stay.id}/preanesthesia/sign`, { data: evalData() })).status, 403)
      assert.equal((await who.post(`/api/inpatient/${stay.id}/preanesthesia/upload`, { fileId: 'x', performedBy: { name: 'Dra. Silvia Arita' } })).status, 403)
    }
    const list = await urbina.get(`/api/inpatient/${stay.id}/preanesthesia`)
    assert.equal(list.status, 200); assert.equal(list.body.canWrite, false)
    assert.equal((await urbina.get(`/api/inpatient/${stay.id}/preanesthesia/prefill`)).status, 403)
    assert.equal((await urbina.post(`/api/inpatient/${stay.id}/preanesthesia/sign`, { data: evalData() })).status, 403)
    assert.ok((await audits()).includes('Intentó firmar una valoración preanestésica'))
    const blank = await urbina.get(`/api/inpatient/${stay.id}/preanesthesia/blank`)
    assert.equal(blank.status, 200); assert.equal(blank.body.prefill.patient.id, stay.patientId)
  })

  test('Dra. Arita, sin nota postquirúrgica: lo que trae lleno (laboratorios del paciente), borrador, firma; puede haber varias', async () => {
    // Un resultado con valores para el prellenado de los laboratorios
    await sql.run(`INSERT INTO exam_orders (id, clinic_id, patient_id, hospitalization_id, batch_id, grp, name, area, status, ordered_by, ordered_at, status_at, result)
      VALUES (?, 'c-sb', ?, ?, ?, 'lab', 'Hemograma', 'lab', 'result', 's-nolasco', ?, ?, ?)`, [randomUUID(), stay.patientId, stay.id, randomUUID(), new Date().toISOString(), new Date().toISOString(),
      JSON.stringify({ at: new Date().toISOString(), by: 's-suazo', values: [{ analyte: 'Hemoglobina', value: '11.8', unit: 'g/dL' }, { analyte: 'Plaquetas', value: '210000' }] })])
    const list = await arita.get(`/api/inpatient/${stay.id}/preanesthesia`)
    assert.equal(list.status, 200, JSON.stringify(list.body)); assert.equal(list.body.canWrite, true); assert.deepEqual(list.body.evals, [])
    const pf = await arita.get(`/api/inpatient/${stay.id}/preanesthesia/prefill`)
    assert.equal(pf.status, 200, JSON.stringify(pf.body))
    assert.equal(pf.body.prefill.labs.hb, '11.8 g/dL'); assert.equal(pf.body.prefill.labs.plt, '210000')
    const filled = prefillPreEval(pf.body.prefill)
    assert.equal(filled.labs.hb, '11.8 g/dL'); assert.ok(filled.date)
    assert.equal((await arita.put(`/api/drafts/valoracion/${stay.id}`, { data: { d: { ...filled, plan: 'Borrador' } } })).status, 200)
    assert.equal((await arita.get(`/api/drafts/valoracion/${stay.id}`)).body.data.d.plan, 'Borrador')
    // Sin ASA no se firma
    assert.equal((await arita.post(`/api/inpatient/${stay.id}/preanesthesia/sign`, { data: { ...evalData(), asa: '' } })).status, 400)
    const s = await arita.post(`/api/inpatient/${stay.id}/preanesthesia/sign`, { data: evalData('II') })
    assert.equal(s.status, 201, JSON.stringify(s.body))
    assert.equal(s.body.mode, 'system'); assert.match(s.body.signer.name, /Arita/); assert.equal(s.body.signer.title, 'Anestesiología'); assert.equal(s.body.createdBy, 's-arita')
    assert.equal((await arita.get(`/api/drafts/valoracion/${stay.id}`)).body, null, 'al firmar, el borrador ya no hace falta')
    // Cualquier médico (sin exigir anestesiología): la Dra. Escoto también; la vigente es la última
    const s2 = await escoto.post(`/api/inpatient/${stay.id}/preanesthesia/sign`, { data: evalData('III') })
    assert.equal(s2.status, 201, JSON.stringify(s2.body))
    const all = (await urbina.get(`/api/inpatient/${stay.id}/preanesthesia`)).body.evals
    assert.equal(all.length, 2)
    // Ver: queda en la bitácora
    assert.equal((await urbina.get(`/api/preanesthesia/${s.body.id}`)).status, 200)
    assert.equal((await quiroz.get(`/api/preanesthesia/${s.body.id}`)).status, 403)
    const a = await audits()
    assert.ok(a.includes('Escribió y firmó la valoración preanestésica')); assert.ok(a.includes('Abrió la valoración preanestésica'))
    // Corrección en el periodo de gracia (solo quien la firmó) y adenda
    const fix = await escoto.post(`/api/preanesthesia/${s2.body.id}/correct`, { data: evalData('II'), version: 1, why: 'ASA mal marcado' })
    assert.equal(fix.status, 200, JSON.stringify(fix.body)); assert.equal(fix.body.version, 2); assert.equal(fix.body.data.asa, 'II')
    assert.equal((await arita.post(`/api/preanesthesia/${s2.body.id}/correct`, { data: evalData('I'), version: 2 })).status, 403)
    assert.equal((await escoto.get(`/api/versions/preanesthesia/${s2.body.id}`)).body.length, 1)
    assert.equal((await escoto.post('/api/addenda', { targetKind: 'preanesthesia', targetId: s2.body.id, kind: 'info', text: 'Se reprograma para mañana.' })).status, 201)
    assert.equal((await arita.post('/api/addenda', { targetKind: 'preanesthesia', targetId: s2.body.id, kind: 'info', text: 'Otra cosa.' })).status, 403)
    // Nada se borra
    await assert.rejects(sql.run('DELETE FROM preanesthesia_evals WHERE id = ?', [s.body.id]), /no se borra/)
  })

  test('en papel: la auxiliar sube la valoración; reemplazar pide motivo y deja la anterior anulada; el archivo no se borra', async () => {
    const other = (await arita.get('/api/bootstrap')).body.inpatients.find((h: any) => h.status === 'active' && h.id !== stay.id)
    assert.ok(other)
    const f = await uploadPdf(vallecillo, other.patientId, other.id)
    const up = await vallecillo.post(`/api/inpatient/${other.id}/preanesthesia/upload`, { fileId: f, performedBy: { name: 'Dra. Silvia Arita', staffId: 's-arita' }, observation: 'La trajo la anestesióloga' })
    assert.equal(up.status, 201, JSON.stringify(up.body))
    assert.equal(up.body.mode, 'upload'); assert.equal(up.body.performedBy.staffId, 's-arita')
    assert.equal((await nolasco.del(`/api/attachments/${f}`)).status, 409)
    const f2 = await uploadPdf(urbina, other.patientId, other.id)
    assert.equal((await urbina.post(`/api/inpatient/${other.id}/preanesthesia/upload`, { fileId: f2, performedBy: { name: 'Dra. Silvia Arita' }, replaces: { sheetId: up.body.id, reason: '' } })).status, 400)
    const rep = await urbina.post(`/api/inpatient/${other.id}/preanesthesia/upload`, { fileId: f2, performedBy: { name: 'Dra. Silvia Arita' }, replaces: { sheetId: up.body.id, reason: 'Faltaba la segunda página' } })
    assert.equal(rep.status, 201, JSON.stringify(rep.body))
    const evals = (await urbina.get(`/api/inpatient/${other.id}/preanesthesia`)).body.evals
    const old = evals.find((x: any) => x.id === up.body.id)
    assert.ok(old.voidedAt); assert.equal(old.voidReason, 'Faltaba la segunda página'); assert.equal(old.replacedBy, rep.body.id)
    const files = (await urbina.get(`/api/patients/${other.patientId}/attachments`)).body
    assert.equal(files.find((x: any) => x.id === f2).category, 'preanesthesia')
    assert.ok(files.find((x: any) => x.id === f).voidedAt)
    assert.ok((await audits()).includes('Reemplazó la valoración preanestésica'))
  })

  test('después: el Dr. Nolasco firma la nota postquirúrgica con la Dra. Arita; ella ve el resumen y lo firma; la valoración manda', async () => {
    const noteId = await postopNote(nolasco, stay.id, { anesthesiologist: { staffId: 's-arita', name: 'Dra. Silvia Arita' }, scrub: { name: 'Lic. Marta Urbina', staffId: 's-urbina' } })
    assert.equal((await nolasco.get(`/api/anesthesia/notes/${noteId}/prefill`)).status, 403, 'el cirujano no llena el registro')
    const pf = await arita.get(`/api/anesthesia/notes/${noteId}/prefill`)
    assert.equal(pf.status, 200, JSON.stringify(pf.body))
    const current = pf.body.preEval
    assert.ok(current, 'trae la valoración vigente de la estancia')
    assert.equal(current.data.asa, 'II', 'la última firmada (la corregida de la Dra. Escoto)')
    const d = { ...blankAnesthesia(), techniques: ['General balanceada'], asa: 'V', mallampati: 'IV', times: { ...blankAnesthesia().times, anesthesiaStart: '08:00' },
      monitoring: Array.from({ length: 30 }, (_, i) => ({ id: `m${i}`, time: `${String(8 + Math.floor(i * 5 / 60)).padStart(2, '0')}:${String((i * 5) % 60).padStart(2, '0')}`, sys: '120', dia: '70', hr: '80', spo2: '98', etco2: '', temp: '' })) }
    // Una valoración de otra estancia no sirve
    const otherEval = await sql.one(`SELECT id FROM preanesthesia_evals WHERE hospitalization_id <> ? LIMIT 1`, [stay.id])
    assert.equal((await arita.post(`/api/anesthesia/notes/${noteId}/sign`, { data: d, preEvalId: otherEval!.id })).status, 409)
    const s = await arita.post(`/api/anesthesia/notes/${noteId}/sign`, { data: d, preEvalId: current.id })
    assert.equal(s.status, 201, JSON.stringify(s.body))
    assert.equal(s.body.preEvalId, current.id)
    assert.equal(s.body.data.asa, 'II', 'los datos de la valoración salen de ella, no del formulario')
    assert.equal(s.body.data.mallampati, 'I'); assert.equal(s.body.data.labs.hb, '12.5 g/dL')
    const view = await urbina.get(`/api/anesthesia/sheets/${s.body.id}`)
    assert.equal(view.status, 200); assert.equal(view.body.preEval.id, current.id)
    // 150 minutos de monitoreo: dos hojas de 120 minutos
    assert.equal(ANESTHESIA_GRID.minutes, 120)
    const g = gridPoints(s.body.data)
    assert.equal(Math.max(1, ...g.points.map((p) => Math.floor(p.min / ANESTHESIA_GRID.minutes) + 1)), 2)
  })

  test('una hoja de PQ3 (sin valoración aparte) se sigue viendo, con su valoración adentro', async () => {
    const noteId = await postopNote(nolasco, stay.id, { anesthesiologist: { staffId: 's-arita', name: 'Dra. Silvia Arita' } })
    const s = await arita.post(`/api/anesthesia/notes/${noteId}/sign`, { data: { ...blankAnesthesia(), techniques: ['Sedación'], asa: 'I' } })
    assert.equal(s.status, 201, JSON.stringify(s.body))
    assert.equal(s.body.preEvalId, undefined); assert.equal(s.body.data.asa, 'I')
    const view = await arita.get(`/api/anesthesia/sheets/${s.body.id}`)
    assert.equal(view.status, 200); assert.equal(view.body.preEval, null)
  })

  test('laboratorios: el último valor de cada uno, por nombre', () => {
    const labs = latestLabs([
      { at: '2026-11-01T10:00:00Z', values: [{ analyte: 'Hemoglobina', value: '10', unit: 'g/dL' }, { analyte: 'Glucosa', value: '110' }] },
      { at: '2026-11-05T10:00:00Z', values: [{ analyte: 'Hemoglobina', value: '12', unit: 'g/dL' }, { analyte: 'Hematocrito', value: '36', unit: '%' }, { analyte: 'INR', value: '1.1' }] },
    ])
    assert.deepEqual(labs, { hb: '12 g/dL', hto: '36 %', inr: '1.1', glucose: '110' })
  })
})
