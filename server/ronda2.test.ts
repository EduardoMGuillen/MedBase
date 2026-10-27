import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import zlib from 'node:zlib'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb, migrateObservationAuthorizations } from './db.js'
import { createSql, type Sql } from './sql.js'

let server: Server
let sql: Sql
let base = ''

before(async () => {
  sql = createSql({ memory: true })
  await ensureDb(sql)
  const app = createApp({ sql, jwtSecret: 'test-secret', demoMode: true })
  await new Promise<void>((r) => { server = app.listen(0, () => r()) })
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const admin = await as('admin@demo.clinara')
  const all = Object.fromEntries(['0', '1', '2', '3', '4', '5', '6'].map((d) => [d, [{ start: '00:00', end: '23:45' }]]))
  await admin.patch('/api/staff/s-herrera/schedule', { slot: 15, week: all })
})
after(async () => { server.close(); await sql.close() })

/** Cliente mínimo que conserva la cookie de sesión. */
async function as(email: string) {
  const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: DEMO_PASSWORD }) })
  const cookie = res.headers.get('set-cookie')?.split(';')[0] ?? ''
  const call = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(`${base}${path}`, { method, headers: { cookie, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const text = await r.text()
    let parsed: any = text
    try { parsed = JSON.parse(text) } catch { /* no es JSON */ }
    return { status: r.status, body: parsed }
  }
  return {
    get: (p: string) => call('GET', p), post: (p: string, b?: unknown) => call('POST', p, b), patch: (p: string, b: unknown) => call('PATCH', p, b),
    put: (p: string, b: unknown) => call('PUT', p, b), del: (p: string) => call('DELETE', p),
    /** El archivo tal cual (sin JSON). */
    raw: async (p: string) => Buffer.from(await (await fetch(`${base}${p}`, { headers: { cookie } })).arrayBuffer()),
    range: (p: string, range: string) => fetch(`${base}${p}`, { headers: { cookie, range } }),
  }
}

const DX = [{ code: 'CA40', label: 'Neumonía', system: 'icd11' }]
const freeBed = async () => {
  const boot = (await (await as('lherrera@demo.clinara')).get('/api/bootstrap')).body
  const used = new Set(boot.inpatients.map((h: any) => h.bedId))
  return boot.beds.find((b: any) => b.active && !used.has(b.id)).id as string
}
/** Un paciente nuevo en observación, ingresado desde una consulta de la Dra. Herrera. */
async function observation(name = 'Prueba') {
  const nurse = await as('crios@demo.clinara')
  const doc = await as('lherrera@demo.clinara')
  const p = await nurse.post('/api/patients', { firstName: name, lastName: 'Ronda Dos', birthDate: '1980-01-01', sex: 'M', phone: '9999-1111', dni: `0801-1980-${String(Math.floor(Math.random() * 99999)).padStart(5, '0')}` })
  assert.equal(p.status, 201, JSON.stringify(p.body))
  const w = await nurse.post('/api/appointments/walk-in', { patientId: p.body.id, doctorId: 's-herrera', reason: 'Fiebre' })
  await doc.post(`/api/appointments/${w.body.id}/status`, { status: 'in_consult' })
  const c = await doc.post('/api/consultations', { appointmentId: w.body.id, reason: 'Fiebre y tos', history: 'Tres días con fiebre y tos productiva.', diagnoses: DX, orders: ['Signos vitales cada 8 horas.'], observe: true })
  assert.equal(c.status, 201, JSON.stringify(c.body))
  return { doc, nurse, stayId: String(c.body.hospitalizationId), patientId: String(p.body.id) }
}

describe('A3 la autorización de hospitalización no va en observación', () => {
  test('observación sin autorización de hospitalización; al pasar a hospitalización se crea pendiente', async () => {
    const { doc, stayId } = await observation('Luis')
    let file = (await doc.get(`/api/inpatient/${stayId}`)).body
    assert.equal(file.authorizations.length, 0)
    await doc.post(`/api/inpatient/${stayId}/convert`, { bedId: await freeBed() })
    file = (await doc.get(`/api/inpatient/${stayId}`)).body
    assert.deepEqual(file.authorizations.map((a: any) => [a.template, a.status]), [['hospital', 'pending']])
  })

  test('migración: las "No aplica" se archivan sin borrarse y a la estancia convertida sin autorización se le crea una', async () => {
    const { doc, stayId } = await observation('Mario')
    // Como quedaron los datos de la ronda 3: una "No aplica" en observación y luego la conversión sin autorización
    const old = 'auth-legacy-na'
    const h = (await sql.one('SELECT * FROM hospitalizations WHERE id = ?', [stayId]))!
    await sql.run(`INSERT INTO authorizations (id, clinic_id, hospitalization_id, patient_id, template, data, status, created_by, created_at, status_note)
      VALUES (?,?,?,?,'hospital','{}','not_applicable','s-herrera',?, 'La observación no lleva autorización de hospitalización.')`,
    [old, String(h.clinic_id), stayId, String(h.patient_id), new Date().toISOString()])
    await sql.run(`UPDATE hospitalizations SET kind = 'hospital', bed_id = ?, observation_at = admitted_at, converted_by = 's-herrera' WHERE id = ?`, [await freeBed(), stayId])
    // Antes de migrar, la tarjeta "No aplica" se vería
    assert.equal((await sql.query(`SELECT * FROM authorizations WHERE hospitalization_id = ?`, [stayId])).length, 1)

    await sql.tx((q) => migrateObservationAuthorizations(q))
    const rows = await sql.query(`SELECT * FROM authorizations WHERE hospitalization_id = ? ORDER BY created_at`, [stayId])
    assert.equal(rows.length, 2, 'no se borró nada')
    assert.ok(rows.find((r) => r.id === old)!.archived_at, 'la "No aplica" quedó archivada')
    const file = (await doc.get(`/api/inpatient/${stayId}`)).body
    assert.deepEqual(file.authorizations.map((a: any) => [a.template, a.status]), [['hospital', 'pending']], 'sólo se ve la nueva, pendiente')
    // Correr la migración otra vez no duplica
    await sql.tx((q) => migrateObservationAuthorizations(q))
    assert.equal((await sql.query(`SELECT * FROM authorizations WHERE hospitalization_id = ?`, [stayId])).length, 2)
  })
})

/** Un PNG de verdad (una raya diagonal), como el que deja el recuadro de firma. */
function signaturePng(seed = 1) {
  const w = 120, h = 40
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0
    for (let x = 0; x < w; x++) {
      const on = Math.abs(y - Math.round((x * h) / w)) <= 1 || (seed > 1 && Math.abs(y - h / 2) < 1)
      const o = y * (w * 4 + 1) + 1 + x * 4
      raw[o] = raw[o + 1] = raw[o + 2] = on ? 20 : 255
      raw[o + 3] = 255
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0)
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 0 })), chunk('IEND', Buffer.alloc(0))])
  return `data:image/png;base64,${png.toString('base64')}`
}

describe('A1 y A2 firma en pantalla y escaneo', () => {
  test('enfermería toma la firma del paciente, el médico firma con su contraseña y se genera el PDF con su huella', async () => {
    const { doc, nurse, stayId } = await observation('Firma')
    await doc.post(`/api/inpatient/${stayId}/convert`, { bedId: await freeBed() })
    const auth = (await doc.get(`/api/inpatient/${stayId}`)).body.authorizations[0]
    // Sin la casilla de lectura no se acepta
    assert.equal((await nurse.post(`/api/authorizations/${auth.id}/sign`, { action: 'accept', patient: { signer: 'patient', signature: signaturePng() } })).status, 400)
    // Representante sin identidad ni parentesco: no
    assert.equal((await nurse.post(`/api/authorizations/${auth.id}/sign`, { action: 'accept', patient: { signer: 'representative', representative: { name: 'Ana Ruiz' }, signature: signaturePng(), readConfirmed: true } })).status, 400)
    // Recuadro vacío: no
    assert.equal((await nurse.post(`/api/authorizations/${auth.id}/sign`, { action: 'accept', patient: { signer: 'patient', readConfirmed: true } })).status, 400)
    const rep = { name: 'Ana Ruiz de Velásquez', dni: '0801198012345', relation: 'Esposa' }
    let r = await nurse.post(`/api/authorizations/${auth.id}/sign`, { action: 'accept', patient: { signer: 'representative', representative: rep, signature: signaturePng(), readConfirmed: true,
      witness: { name: 'Pedro Gómez', dni: '0801-1990-11111', signature: signaturePng(2) } } })
    assert.equal(r.status, 200, JSON.stringify(r.body))
    assert.equal(r.body.status, 'pending', 'falta el médico: sigue pendiente')
    assert.equal(r.body.signing.representative.dni, '0801-1980-12345')
    assert.equal(r.body.signing.signature, 'guardada', 'la imagen no viaja al cliente')
    // Enfermería no firma como médico
    assert.equal((await nurse.post(`/api/authorizations/${auth.id}/sign`, { action: 'accept', doctor: { password: 'demo1234', signature: signaturePng() } })).status, 403)
    assert.equal((await doc.post(`/api/authorizations/${auth.id}/sign`, { action: 'accept', doctor: { password: 'otra', signature: signaturePng() } })).status, 401)
    r = await doc.post(`/api/authorizations/${auth.id}/sign`, { action: 'accept', doctor: { password: DEMO_PASSWORD, signature: signaturePng(), save: true } })
    assert.equal(r.status, 200, JSON.stringify(r.body))
    assert.equal(r.body.status, 'signed')
    assert.equal(r.body.method, 'virtual')
    assert.ok(r.body.pdfId && /^[0-9a-f]{64}$/.test(r.body.pdfSha256))
    const pdf = await doc.raw(`/api/attachments/${r.body.pdfId}`)
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
    assert.equal(createHash('sha256').update(pdf).digest('hex'), r.body.pdfSha256, 'la huella guardada es la del PDF')
    // La firma del médico quedó guardada en su perfil
    assert.ok((await doc.get('/api/me/signature')).body.signature?.startsWith('data:image/png'))
    // Firmada: ya no se firma otra vez
    assert.equal((await doc.post(`/api/authorizations/${auth.id}/sign`, { action: 'accept', patient: { signer: 'patient', signature: signaturePng(), readConfirmed: true } })).status, 409)
    // Revocación en pantalla, sin firma del médico
    r = await nurse.post(`/api/authorizations/${auth.id}/sign`, { action: 'revoke', patient: { signer: 'patient', signature: signaturePng(), readConfirmed: true } })
    assert.equal(r.status, 200, JSON.stringify(r.body))
    assert.equal(r.body.status, 'revoked')
    assert.equal(r.body.revocation.method, 'virtual')
    assert.ok(r.body.revocation.pdfId && r.body.pdfId, 'se conservan los dos PDF')
  })

  test('el paciente que no puede firmar: firma un testigo con su identidad; el rechazo no pide al médico', async () => {
    const { doc, nurse, stayId } = await observation('Testigo')
    const a = (await doc.post(`/api/inpatient/${stayId}/authorizations`, { template: 'surgical', procedure: 'Drenaje de absceso' })).body
    assert.equal((await nurse.post(`/api/authorizations/${a.id}/sign`, { action: 'refuse', patient: { signer: 'patient', unableReason: 'No sabe escribir', readConfirmed: true } })).status, 400, 'sin testigo no')
    const r = await nurse.post(`/api/authorizations/${a.id}/sign`, { action: 'refuse', patient: { signer: 'patient', unableReason: 'No sabe escribir', readConfirmed: true,
      witness: { name: 'Marta Lagos', dni: '0801-1970-22222', signature: signaturePng(2) } } })
    assert.equal(r.status, 200, JSON.stringify(r.body))
    assert.equal(r.body.status, 'refused')
    assert.equal(r.body.signing.unableReason, 'No sabe escribir')
    assert.equal(r.body.signing.signature, undefined)
  })

  test('escaneo de hasta 15 MB por partes, lectura por rangos y reemplazo que conserva el anterior', async () => {
    const { doc, nurse, stayId, patientId } = await observation('Escaneo')
    const a = (await doc.post(`/api/inpatient/${stayId}/authorizations`, { template: 'surgical', procedure: 'Apendicectomía' })).body
    const upload = async (bytes: Buffer, name: string) => {
      const uploadId = crypto.randomUUID()
      const parts = Math.ceil(bytes.length / (3 * 1024 * 1024))
      for (let i = 0; i < parts; i++) {
        const r = await nurse.post(`/api/uploads/${uploadId}/parts`, { index: i, data: bytes.subarray(i * 3 * 1024 * 1024, (i + 1) * 3 * 1024 * 1024).toString('base64') })
        assert.equal(r.status, 201, JSON.stringify(r.body))
      }
      return nurse.post(`/api/patients/${patientId}/attachments/assemble`, { uploadId, parts, name, mime: 'application/pdf', category: 'document', title: 'Autorización firmada', hospitalizationId: stayId })
    }
    const big = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(7 * 1024 * 1024, 7)])
    const att = await upload(big, 'escaneo.pdf')
    assert.equal(att.status, 201, JSON.stringify(att.body))
    assert.equal(att.body.size, big.length)
    // Se lee en rangos de 3 MB
    const first = await nurse.range(`/api/attachments/${att.body.id}`, 'bytes=0-')
    assert.equal(first.status, 206)
    assert.equal(first.headers.get('content-range'), `bytes 0-${3 * 1024 * 1024 - 1}/${big.length}`)
    // Más de 15 MB: no
    assert.equal((await upload(Buffer.alloc(15 * 1024 * 1024 + 10), 'enorme.pdf')).status, 413)
    let r = await nurse.post(`/api/authorizations/${a.id}/status`, { status: 'signed', fileId: att.body.id })
    assert.equal(r.status, 200, JSON.stringify(r.body))
    assert.equal(r.body.method, 'paper')
    const second = await upload(Buffer.from('%PDF-1.7\nbien'), 'correcto.pdf')
    assert.equal((await nurse.post(`/api/authorizations/${a.id}/replace-scan`, { fileId: second.body.id })).status, 400, 'pide motivo')
    r = await nurse.post(`/api/authorizations/${a.id}/replace-scan`, { fileId: second.body.id, reason: 'Se subió la hoja de otro paciente' })
    assert.equal(r.status, 200, JSON.stringify(r.body))
    assert.equal(r.body.fileId, second.body.id)
    assert.deepEqual(r.body.fileHistory.map((x: any) => x.fileId), [att.body.id])
    assert.equal((await nurse.raw(`/api/attachments/${att.body.id}`)).subarray(0, 5).toString(), '%PDF-', 'el anterior no se borró')
  })
})

describe('O1 sets de órdenes', () => {
  const SET = {
    name: 'Neumonía no complicada',
    items: [
      { text: 'Dieta blanda.' }, { text: 'Signos vitales cada 8 horas.' }, { text: 'Oxígeno por cánula nasal a ___ L/min si SatO2 < 92 %.' },
      { text: 'Hemograma y química sanguínea.' }, { text: 'Radiografía de tórax PA.' }, { text: 'Ayuno de ___ a ___.' },
      { med: { drug: 'Ceftriaxona', presentation: 'Vial 1 g', dose: '1 g', route: 'Intravenosa', everyHours: 12, prn: false } },
      { med: { drug: 'Acetaminofén', presentation: 'Tableta 500 mg', dose: '1 g', route: 'Oral', everyHours: 8, prn: true, instructions: 'Si hay fiebre' } },
    ],
  }

  test('crear un set de 8 órdenes, aplicarlo en otro paciente, editar 2, borrar 1 y firmar: enfermería las ve en su checklist', async () => {
    const { doc, nurse, stayId } = await observation('Sets')
    await doc.post(`/api/inpatient/${stayId}/convert`, { bedId: await freeBed() })
    const created = await doc.post('/api/order-sets', SET)
    assert.equal(created.status, 201, JSON.stringify(created.body))
    assert.equal(created.body.items.length, 8)
    assert.equal((await doc.post('/api/order-sets', SET)).status, 409, 'el mismo nombre no se repite')
    assert.equal((await nurse.get('/api/order-sets')).status, 403, 'enfermería no tiene sets')
    // Aplicarlo (el cliente inserta las órdenes) queda en la bitácora y nunca firma
    assert.equal((await doc.post(`/api/order-sets/${created.body.id}/use`, { where: 'hospital' })).status, 201)
    const texts = SET.items.flatMap((it) => (it.text ? [it.text] : []))
    // Con los huecos sin llenar no se guarda
    const blank = await doc.post(`/api/inpatient/${stayId}/notes`, { kind: 'evolution', format: 'dx', exam: 'Estable.', orders: texts, indicationCount: texts.length })
    assert.equal(blank.status, 400)
    // Se llenan los huecos (2 editadas) y se borra una (la radiografía)
    const edited = texts.map((t) => t.replace('___ L/min', '2 L/min').replace('Ayuno de ___ a ___.', 'Ayuno de 00:00 a 08:00.')).filter((t) => !t.startsWith('Radiografía'))
    const meds = SET.items.flatMap((it) => (it.med ? [{ ...it.med, firstAt: new Date().toISOString() }] : []))
    const note = await doc.post(`/api/inpatient/${stayId}/notes`, { kind: 'evolution', format: 'dx', exam: 'Estable.', orders: [...edited, 'Ceftriaxona 1 g IV c/12h', 'Acetaminofén 1 g VO c/8h PRN'], indicationCount: edited.length, meds })
    assert.equal(note.status, 201, JSON.stringify(note.body))
    assert.deepEqual(note.body.orders.slice(0, edited.length), edited)
    const file = (await nurse.get(`/api/inpatient/${stayId}`)).body
    assert.deepEqual(file.meds.map((m: any) => m.drug).sort(), ['Acetaminofén', 'Ceftriaxona'], 'los medicamentos del set pasan a la hoja')
    const pending = (await nurse.get('/api/bootstrap')).body.pendingOrders.find((x: any) => x.noteId === note.body.id)
    assert.equal(pending.pending, edited.length + 2, 'enfermería las ve en su checklist como cualquier otra orden')
    // Contado como usado
    assert.equal((await doc.get('/api/order-sets')).body.find((s: any) => s.id === created.body.id).uses, 1)
  })

  test('personales por defecto; compartido: los demás lo aplican o lo duplican, sólo el autor lo edita; eliminar archiva', async () => {
    const herrera = await as('lherrera@demo.clinara')
    const paz = await as('apaz@demo.clinara')
    const own = (await herrera.post('/api/order-sets', { name: 'Fractura cerrada sin complicaciones', items: [{ text: 'Reposo.' }, { text: 'Elevar el miembro.' }] })).body
    assert.ok(!(await paz.get('/api/order-sets')).body.some((s: any) => s.id === own.id), 'personal: el otro médico no lo ve')
    assert.equal((await herrera.patch(`/api/order-sets/${own.id}`, { shared: true })).status, 200)
    assert.ok((await paz.get('/api/order-sets')).body.some((s: any) => s.id === own.id), 'compartido: lo ve')
    assert.equal((await paz.patch(`/api/order-sets/${own.id}`, { name: 'Otro nombre' })).status, 403, 'sólo el autor lo edita')
    assert.equal((await paz.del(`/api/order-sets/${own.id}`)).status, 403)
    const copy = await paz.post(`/api/order-sets/${own.id}/duplicate`)
    assert.equal(copy.status, 201)
    assert.equal(copy.body.ownerId, 's-paz')
    assert.equal(copy.body.shared, false)
    assert.equal((await paz.patch(`/api/order-sets/${copy.body.id}`, { items: [{ text: 'Reposo absoluto.' }] })).status, 200, 'la copia es suya')
    assert.equal((await herrera.del(`/api/order-sets/${own.id}`)).status, 200)
    assert.ok(!(await herrera.get('/api/order-sets')).body.some((s: any) => s.id === own.id), 'archivado: ya no aparece')
    assert.ok(await sql.one('SELECT 1 FROM order_sets WHERE id = ? AND archived_at IS NOT NULL', [own.id]), 'pero no se borró')
  })

  test('en un consultorio no se comparte; los más usados van primero', async () => {
    const lopez = await as('alopez@demo.clinara')
    assert.equal((await lopez.post('/api/order-sets', { name: 'Compartido', items: [{ text: 'Reposo.' }], shared: true })).status, 400)
    const a = (await lopez.post('/api/order-sets', { name: 'A poco usado', items: [{ text: 'Reposo.' }] })).body
    const b = (await lopez.post('/api/order-sets', { name: 'B muy usado', items: [{ text: 'Líquidos.' }] })).body
    for (let i = 0; i < 3; i++) await lopez.post(`/api/order-sets/${b.id}/use`, { where: 'consultation' })
    await lopez.post(`/api/order-sets/${a.id}/use`, { where: 'observation' })
    const list = (await lopez.get('/api/order-sets')).body.map((s: any) => s.name)
    assert.ok(list.indexOf('B muy usado') < list.indexOf('A poco usado'))
  })
})
