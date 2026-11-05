import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb } from './db.js'
import { createSql, type Sql } from './sql.js'
import bcrypt from 'bcryptjs'
import { FUNEZ } from './demoData.js'
import { aldreteTotal, blankAnesthesia, fluidBalance, gridPoints, prefillAnesthesia } from '../src/lib/anesthesia.js'

// PQ3 (ronda 14): hoja de anestesia ligada a la nota postquirúrgica (copia en memoria de la demo)
let server: Server
let sql: Sql
let base = ''
before(async () => {
  sql = createSql({ memory: true })
  await ensureDb(sql)
  const app = createApp({ sql, jwtSecret: 'test-secret', demoMode: true })
  await new Promise<void>((r) => { server = app.listen(0, () => r()) })
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  // Dr. Daniel Fúnez (lo agrega la demo diaria): médico de la clínica principal
  if (!(await sql.one('SELECT 1 FROM staff WHERE id = ?', [FUNEZ.id]))) {
    await sql.run(`INSERT INTO staff (id, name, role, roles, specialty, email, license, color, active, password_hash, clinic_id) VALUES (?,?,'doctor',?,?,?,?,?,TRUE,?,?)`,
      [FUNEZ.id, FUNEZ.name, JSON.stringify(['doctor']), FUNEZ.specialty, FUNEZ.email, FUNEZ.license, '#9A5B13', bcrypt.hashSync(DEMO_PASSWORD, 10), 'c-sb'])
  }
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
  return { get: (p: string) => call('GET', p), post: (p: string, b?: unknown) => call('POST', p, b), put: (p: string, b?: unknown) => call('PUT', p, b), del: (p: string) => call('DELETE', p) }
}
type Client = Awaited<ReturnType<typeof as>>

const pre = [{ code: 'DB10', label: 'Apendicitis aguda' }]
const postop = (team: Record<string, { name: string; staffId?: string }>, anesthesia = 'Raquídea') => ({
  preDiagnoses: pre, startAt: new Date(Date.now() - 90 * 60_000).toISOString(), endAt: new Date(Date.now() - 20 * 60_000).toISOString(), anesthesia,
  procedureName: 'Apendicectomía', description: 'Sin complicaciones, sangrado mínimo.', team: { surgeon: { staffId: 's-zuniga', name: 'Dra. Mariela Zúñiga' }, ...team },
  urgent: true, justification: 'Abdomen agudo, sin familiar presente',
})
async function postopNote(doc: Client, stayId: string, team: Record<string, { name: string; staffId?: string }>, anesthesia?: string) {
  const r = await doc.post(`/api/inpatient/${stayId}/notes`, { kind: 'evolution', format: 'postop', diagnoses: [{ code: 'DB10.0', label: 'Apendicitis perforada' }], postop: postop(team, anesthesia) })
  assert.equal(r.status, 201, JSON.stringify(r.body))
  return String(r.body.id)
}
/** La subida de Anexos: el PDF por partes, unido como archivo del expediente; luego queda como la hoja de la nota. */
async function uploadPdf(who: Client, patientId: string, stayId: string) {
  const uploadId = randomUUID()
  const data = Buffer.from('%PDF-1.4\n% hoja de anestesia escaneada (2 fotos)\n%%EOF').toString('base64')
  assert.equal((await who.post(`/api/uploads/${uploadId}/parts`, { index: 0, data })).status, 201)
  const att = await who.post(`/api/patients/${patientId}/attachments/assemble`, { uploadId, parts: 1, name: 'Hoja de anestesia.pdf', mime: 'application/pdf', category: 'document', title: 'Hoja de anestesia (papel)', hospitalizationId: stayId })
  assert.equal(att.status, 201, JSON.stringify(att.body))
  return String(att.body.id)
}
const signData = (rows = 3) => {
  const d = blankAnesthesia()
  d.techniques = ['Sedación']; d.asa = 'II'; d.times.anesthesiaStart = '08:00'
  d.monitoring = Array.from({ length: rows }, (_, i) => ({ id: `m${i}`, time: `08:${String(i * 5).padStart(2, '0')}`, sys: '120', dia: '70', hr: '80', spo2: '98', etco2: '35', temp: '36.5' }))
  d.fluids = { crystalloids: '1000', colloids: '', bleeding: '200', diuresis: '300' }
  return d
}

describe('PQ3 (ronda 14): hoja de anestesia', () => {
  let stay: { id: string; patientId: string }
  let zuniga: Client; let rios: Client; let mejia: Client; let herrera: Client; let funez: Client
  before(async () => {
    zuniga = await as('mzuniga@demo.clinara'); rios = await as('crios@demo.clinara'); mejia = await as('smejia@demo.clinara')
    herrera = await as('lherrera@demo.clinara'); funez = await as('dfunez@demo.clinara')
    stay = (await zuniga.get('/api/bootstrap')).body.inpatients.find((h: any) => h.kind === 'hospital' && h.status === 'active')
    assert.ok(stay)
  })

  test('hoja en blanco: médico y enfermería sí (con los datos del paciente), recepción no (también por URL directa)', async () => {
    const a = await zuniga.get(`/api/inpatient/${stay.id}/anesthesia/blank`)
    assert.equal(a.status, 200, JSON.stringify(a.body))
    assert.equal(a.body.prefill.patient.id, stay.patientId)
    assert.ok(Array.isArray(a.body.prefill.patient.allergies))
    assert.equal((await rios.get(`/api/inpatient/${stay.id}/anesthesia/blank`)).status, 200)
    assert.equal((await mejia.get(`/api/inpatient/${stay.id}/anesthesia/blank`)).status, 403)
    const audit = JSON.stringify((await (await as('admin@demo.clinara')).get('/api/audit')).body)
    assert.ok(audit.includes('Imprimió la hoja de anestesia en blanco'))
  })

  test('nota con anestesiólogo escrito a mano: «Sin agregar»; Carmen Ríos sube la hoja en papel; no se borra; se reemplaza con motivo', async () => {
    const noteId = await postopNote(zuniga, stay.id, { anesthesiologist: { name: 'Dr. Visitante Externo' } })
    const card = await zuniga.get(`/api/anesthesia/notes/${noteId}`)
    assert.equal(card.status, 200)
    assert.deepEqual(card.body.sheets, [])
    assert.equal(card.body.canFill, false, 'nadie la llena en el sistema: el anestesiólogo no tiene usuario')
    assert.equal(card.body.anesthesiologist.name, 'Dr. Visitante Externo')
    // Sofía Mejía (recepción): nada, también por URL directa
    assert.equal((await mejia.get(`/api/anesthesia/notes/${noteId}`)).status, 403)
    assert.equal((await mejia.post(`/api/anesthesia/notes/${noteId}/upload`, { fileId: 'x', performedBy: { name: 'Dr. Visitante Externo' } })).status, 403)
    // Lic. Carmen Ríos sube la hoja (dos fotos unidas en un PDF)
    const fileId = await uploadPdf(rios, stay.patientId, stay.id)
    const up = await rios.post(`/api/anesthesia/notes/${noteId}/upload`, { fileId, performedBy: { name: 'Dr. Visitante Externo' }, observation: 'La trajo la circulante' })
    assert.equal(up.status, 201, JSON.stringify(up.body))
    assert.equal(up.body.mode, 'upload'); assert.equal(up.body.createdBy, 's-rios'); assert.ok(up.body.createdAt)
    const files = (await zuniga.get(`/api/patients/${stay.patientId}/attachments`)).body
    assert.equal(files.find((f: any) => f.id === fileId).category, 'anesthesia', 'se ve en Anexos con la categoría «Hoja de anestesia»')
    // Nada se borra
    assert.equal((await zuniga.del(`/api/attachments/${fileId}`)).status, 409)
    // Una segunda subida sin reemplazar: no; reemplazar pide motivo
    const f2 = await uploadPdf(zuniga, stay.patientId, stay.id)
    assert.equal((await zuniga.post(`/api/anesthesia/notes/${noteId}/upload`, { fileId: f2, performedBy: { name: 'Dr. Visitante Externo' } })).status, 409)
    assert.equal((await zuniga.post(`/api/anesthesia/notes/${noteId}/upload`, { fileId: f2, performedBy: { name: 'Dr. Visitante Externo' }, replaces: { sheetId: up.body.id, reason: '' } })).status, 400)
    const rep = await zuniga.post(`/api/anesthesia/notes/${noteId}/upload`, { fileId: f2, performedBy: { name: 'Dr. Visitante Externo' }, replaces: { sheetId: up.body.id, reason: 'Faltaba la segunda página' } })
    assert.equal(rep.status, 201, JSON.stringify(rep.body))
    const after = (await zuniga.get(`/api/anesthesia/notes/${noteId}`)).body.sheets
    assert.equal(after.length, 2, 'la anterior sigue visible')
    const old = after.find((s: any) => s.id === up.body.id)
    assert.ok(old.voidedAt); assert.equal(old.voidReason, 'Faltaba la segunda página'); assert.equal(old.replacedBy, rep.body.id)
    const oldFile = (await zuniga.get(`/api/patients/${stay.patientId}/attachments`)).body.find((f: any) => f.id === fileId)
    assert.ok(oldFile.voidedAt, 'el archivo anterior queda anulado, sin borrarse')
    assert.equal((await sql.one('SELECT COUNT(*)::int AS n FROM anesthesia_sheets WHERE note_id = ?', [noteId]))!.n, 2)
    await assert.rejects(sql.run('DELETE FROM anesthesia_sheets WHERE id = ?', [up.body.id]), /no se borra/)
    const audit = JSON.stringify((await (await as('admin@demo.clinara')).get('/api/audit')).body)
    assert.ok(audit.includes('Subió la hoja de anestesia de «Apendicectomía»'))
    assert.ok(audit.includes('Motivo: Faltaba la segunda página'))
  })

  test('anestesióloga del sistema (Dra. Herrera): ve el pendiente, su borrador sigue, firma con tres registros; Fúnez no firma pero sí sube', async () => {
    const noteId = await postopNote(zuniga, stay.id, { anesthesiologist: { staffId: 's-herrera', name: 'Dra. Lucía Herrera' } }, 'Sedación')
    const pending = (await herrera.get('/api/anesthesia/pending')).body
    const mine = pending.find((x: any) => x.noteId === noteId)
    assert.ok(mine, 'le aparece el pendiente')
    assert.equal(mine.procedure, 'Apendicectomía'); assert.ok(mine.patient); assert.equal(mine.hospitalizationId, stay.id)
    assert.ok(!(await zuniga.get('/api/anesthesia/pending')).body.some((x: any) => x.noteId === noteId), 'a la cirujana no')
    assert.ok(!(await rios.get('/api/anesthesia/pending')).body.length, 'a enfermería no')
    // Fúnez: no la llena ni la firma (tampoco por URL directa)
    assert.equal((await funez.get(`/api/anesthesia/notes/${noteId}`)).body.canFill, false)
    assert.equal((await funez.get(`/api/anesthesia/notes/${noteId}/prefill`)).status, 403)
    assert.equal((await funez.post(`/api/anesthesia/notes/${noteId}/sign`, { data: signData() })).status, 403)
    assert.equal((await rios.post(`/api/anesthesia/notes/${noteId}/sign`, { data: signData() })).status, 403)
    // Herrera: lo que trae lleno, su borrador «Se guarda solo»
    const pf = await herrera.get(`/api/anesthesia/notes/${noteId}/prefill`)
    assert.equal(pf.status, 200, JSON.stringify(pf.body))
    const filled = prefillAnesthesia(pf.body.prefill)
    assert.deepEqual(filled.techniques, ['Sedación'])
    assert.equal(filled.anesthesiologist, 'Dra. Lucía Herrera'); assert.equal(filled.operation, 'Apendicectomía'); assert.equal(filled.preDiagnosis, 'Apendicitis aguda')
    assert.equal((await herrera.put(`/api/drafts/anestesia/${noteId}`, { data: { d: { ...filled, room: 'Sala 2' } } })).status, 200)
    assert.equal((await herrera.get(`/api/drafts/anestesia/${noteId}`)).body.data.d.room, 'Sala 2', 'el borrador sigue al volver')
    // Sin técnica no se firma
    assert.equal((await herrera.post(`/api/anesthesia/notes/${noteId}/sign`, { data: { ...signData(), techniques: [] } })).status, 400)
    const s = await herrera.post(`/api/anesthesia/notes/${noteId}/sign`, { data: signData(3) })
    assert.equal(s.status, 201, JSON.stringify(s.body))
    assert.equal(s.body.mode, 'system'); assert.equal(s.body.data.monitoring.length, 3)
    assert.equal(s.body.signer.license, 'CMH-08812'); assert.equal(s.body.signer.title, 'Medicina interna'); assert.match(s.body.signer.name, /Herrera/)
    assert.equal((await herrera.get(`/api/drafts/anestesia/${noteId}`)).body, null, 'al firmar, el borrador ya no hace falta')
    assert.ok(!(await herrera.get('/api/anesthesia/pending')).body.some((x: any) => x.noteId === noteId), 'ya no está pendiente')
    assert.equal((await herrera.post(`/api/anesthesia/notes/${noteId}/sign`, { data: signData() })).status, 409)
    // Lo firmado no se edita: corrección en el periodo de gracia (solo ella) o adenda
    const fix = await herrera.post(`/api/anesthesia/sheets/${s.body.id}/correct`, { data: signData(4), version: 1, why: 'Faltaba un registro' })
    assert.equal(fix.status, 200, JSON.stringify(fix.body)); assert.equal(fix.body.version, 2)
    assert.equal((await zuniga.post(`/api/anesthesia/sheets/${s.body.id}/correct`, { data: signData(4), version: 2 })).status, 403)
    assert.equal((await herrera.get(`/api/versions/anesthesia/${s.body.id}`)).body.length, 1)
    assert.equal((await herrera.post('/api/addenda', { targetKind: 'anesthesia', targetId: s.body.id, kind: 'info', text: 'Náusea leve en recuperación.' })).status, 201)
    assert.equal((await zuniga.post('/api/addenda', { targetKind: 'anesthesia', targetId: s.body.id, kind: 'info', text: 'Otra cosa.' })).status, 403)
    // La llenada en el sistema no se reemplaza por una en papel
    const f = await uploadPdf(funez, stay.patientId, stay.id)
    assert.equal((await funez.post(`/api/anesthesia/notes/${noteId}/upload`, { fileId: f, performedBy: { name: 'Dra. Lucía Herrera' }, replaces: { sheetId: s.body.id, reason: 'Probar reemplazo' } })).status, 409)
    // Ver la hoja queda en la bitácora
    assert.equal((await rios.get(`/api/anesthesia/sheets/${s.body.id}`)).status, 200)
    assert.equal((await mejia.get(`/api/anesthesia/sheets/${s.body.id}`)).status, 403)
  })

  test('Fúnez sube la hoja en papel de una cirugía donde no fue anestesiólogo; el radiólogo también ve la hoja', async () => {
    const noteId = await postopNote(zuniga, stay.id, { anesthesiologist: { staffId: 's-herrera', name: 'Dra. Lucía Herrera' } }, 'General')
    const f = await uploadPdf(funez, stay.patientId, stay.id)
    const up = await funez.post(`/api/anesthesia/notes/${noteId}/upload`, { fileId: f, performedBy: { staffId: 's-herrera', name: 'Dra. Lucía Herrera' } })
    assert.equal(up.status, 201, JSON.stringify(up.body))
    assert.equal(up.body.performedBy.staffId, 's-herrera')
    assert.ok(!(await herrera.get('/api/anesthesia/pending')).body.some((x: any) => x.noteId === noteId), 'con la hoja subida ya no está pendiente')
    const radiologist = await as('mcastellanos@demo.clinara')
    assert.equal((await radiologist.get(`/api/anesthesia/notes/${noteId}`)).status, 200)
    assert.equal((await (await as('admin@demo.clinara')).get(`/api/anesthesia/notes/${noteId}`)).status, 403, 'administración no')
  })

  test('egreso sin hoja de anestesia: ningún aviso ni bloqueo', async () => {
    const other = (await herrera.get('/api/bootstrap')).body.inpatients.find((h: any) => h.status === 'active' && h.id !== stay.id && h.kind === 'hospital')
    assert.ok(other)
    const noteId = await postopNote(herrera, other.id, { anesthesiologist: { name: 'Dr. Sin Usuario' } })
    assert.deepEqual((await herrera.get(`/api/anesthesia/notes/${noteId}`)).body.sheets, [])
    const out = await herrera.post(`/api/inpatient/${other.id}/discharge`, { diagnoses: pre, summary: 'Apendicectomía sin complicaciones; tolera la vía oral.', condition: 'Mejorado' })
    assert.equal(out.status, 201, JSON.stringify(out.body))
    // Después del egreso se puede subir (la hoja llega después de la nota)
    const f = await uploadPdf(rios, other.patientId, other.id)
    assert.equal((await rios.post(`/api/anesthesia/notes/${noteId}/upload`, { fileId: f, performedBy: { name: 'Dr. Sin Usuario' } })).status, 201)
  })

  test('Consultorio: la titular (Dra. Ana López) sube la hoja en papel en observación', async () => {
    const lopez = await as('alopez@demo.clinara')
    const obs = (await lopez.get('/api/bootstrap')).body.inpatients.find((h: any) => h.kind === 'observation' && h.status === 'active')
    assert.ok(obs)
    const n = await lopez.post(`/api/inpatient/${obs.id}/notes`, { kind: 'evolution', format: 'postop', diagnoses: pre,
      postop: { ...postop({ anesthesiologist: { name: 'Dr. Visitante' } }), team: { surgeon: { name: 'Dra. Ana López' }, anesthesiologist: { name: 'Dr. Visitante' } } } })
    assert.equal(n.status, 201, JSON.stringify(n.body))
    const f = await uploadPdf(lopez, obs.patientId, obs.id)
    assert.equal((await lopez.post(`/api/anesthesia/notes/${n.body.id}/upload`, { fileId: f, performedBy: { name: 'Dr. Visitante' } })).status, 201)
    assert.equal((await lopez.get(`/api/inpatient/${obs.id}/anesthesia`)).body.length, 1)
  })

  test('la nota que no es postquirúrgica no lleva hoja', async () => {
    const n = await herrera.post(`/api/inpatient/${stay.id}/notes`, { kind: 'evolution', format: 'dx', observations: 'Estable' })
    assert.equal(n.status, 201, JSON.stringify(n.body))
    assert.equal((await herrera.get(`/api/anesthesia/notes/${n.body.id}`)).status, 409)
  })
})

describe('PQ3: balance, Aldrete y cuadrícula', () => {
  test('balance = ingresos − egresos; Aldrete suma solo', () => {
    assert.deepEqual(fluidBalance({ crystalloids: '1500', colloids: '500', bleeding: '300', diuresis: '400' }), { any: true, inflow: 2000, outflow: 700, balance: 1300 })
    assert.equal(fluidBalance({ crystalloids: '', colloids: '', bleeding: '', diuresis: '' }).any, false)
    assert.deepEqual(aldreteTotal({ activity: '2', respiration: '2', circulation: '1', consciousness: '2', saturation: '2' }), { total: 9, complete: true, any: true })
    assert.equal(aldreteTotal({ activity: '2', respiration: '', circulation: '', consciousness: '', saturation: '' }).complete, false)
  })
  test('los registros se ubican en minutos desde el inicio de la anestesia, también al pasar la medianoche', () => {
    const d = blankAnesthesia()
    d.times.anesthesiaStart = '23:50'; d.times.surgeryStart = '00:05'
    d.monitoring = [{ id: 'a', time: '23:50', sys: '120', dia: '80', hr: '90', spo2: '99', etco2: '', temp: '' }, { id: 'b', time: '00:10', sys: '110', dia: '70', hr: '85', spo2: '98', etco2: '', temp: '' }]
    const g = gridPoints(d)
    assert.deepEqual(g.points.map((p) => p.min), [0, 20])
    assert.equal(g.marks.surgeryStart, 15)
  })
})
