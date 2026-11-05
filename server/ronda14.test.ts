import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb } from './db.js'
import { createSql, type Sql } from './sql.js'
import { capFirst } from '../src/lib/autocap.js'
import { defaultPlace } from '../src/lib/exams.js'

// Ronda 14: con la base y la API (copia en memoria de la demo)
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

export async function as(email: string, password = DEMO_PASSWORD) {
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

describe('GE10 (ronda 14): mayúscula inicial', () => {
  test('la primera letra, también con tilde o eñe; lo demás no cambia', () => {
    assert.equal(capFirst('paños con agua helada.'), 'Paños con agua helada.')
    assert.equal(capFirst('ácido fólico'), 'Ácido fólico')
    assert.equal(capFirst('ñame'), 'Ñame')
    assert.equal(capFirst('  evitar luces'), '  Evitar luces')
    assert.equal(capFirst('PH'), 'PH')
    assert.equal(capFirst('500 mg'), '500 mg', 'un número no cambia')
    assert.equal(capFirst(''), '')
  })
})

describe('EX8 (ronda 14): «Externo» o «En la clínica» por defecto', () => {
  test('consulta externa: Externo; estancia: En la clínica si hay laboratorio o imágenes; Consultorio: Externo', () => {
    const clinic = { kind: 'clinic', hasLab: true, hasImaging: true }
    assert.equal(defaultPlace('lab', false, clinic), 'external')
    assert.equal(defaultPlace('imaging', false, clinic), 'external')
    assert.equal(defaultPlace('lab', true, clinic), 'clinic')
    assert.equal(defaultPlace('imaging', true, clinic), 'clinic')
    assert.equal(defaultPlace('lab', true, { kind: 'clinic', hasLab: false, hasImaging: true }), 'external', 'sin laboratorio')
    assert.equal(defaultPlace('imaging', true, { kind: 'clinic', hasLab: true, hasImaging: false }), 'external', 'sin imágenes')
    assert.equal(defaultPlace('lab', true, { kind: 'office', hasLab: true, hasImaging: true }), 'external', 'consultorio')
  })
})

describe('EX11 (ronda 14): la ventana de órdenes también desde la nota', () => {
  test('laboratorio e imagen juntos salen en un solo trabajo (un documento por tipo); enfermería sí, recepción no', async () => {
    const cid = String((await sql.one(`SELECT clinic_id FROM staff WHERE email = 'lherrera@demo.clinara'`))!.clinic_id)
    const pair = await sql.one(`SELECT a.id AS lab, b.id AS img FROM exam_orders a JOIN exam_orders b ON b.patient_id = a.patient_id AND b.grp = 'imaging' AND b.status <> 'cancelled'
      WHERE a.clinic_id = ? AND a.grp = 'lab' AND a.status <> 'cancelled' LIMIT 1`, [cid])
    assert.ok(pair, 'la demo tiene un paciente con laboratorio e imagen')
    const ids = [String(pair!.lab), String(pair!.img)]
    const doc = await as('lherrera@demo.clinara')
    const r = await doc.post('/api/print-jobs', { kind: 'exams', examIds: ids })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    const job = await doc.get(`/api/print-jobs/${r.body.id}`)
    assert.deepEqual(new Set(job.body.exams.map((e: { group: string }) => e.group)), new Set(['lab', 'imaging']))
    const nurse = await as('crios@demo.clinara')
    assert.equal((await nurse.post('/api/print-jobs', { kind: 'exams', examIds: ids })).status, 201)
    const reception = await as('smejia@demo.clinara')
    assert.equal((await reception.post('/api/print-jobs', { kind: 'exams', examIds: ids })).status, 403)
    assert.equal((await reception.get(`/api/print-jobs/${r.body.id}`)).status, 403)
  })
  test('un examen cancelado no se imprime', async () => {
    const e = await sql.one(`SELECT id FROM exam_orders WHERE status = 'cancelled' LIMIT 1`)
    if (!e) return
    const doc = await as('lherrera@demo.clinara')
    const r = await doc.post('/api/print-jobs', { kind: 'exams', examIds: [String(e.id)] })
    assert.ok(r.status === 409 || r.status === 404, String(r.status))
  })
})
