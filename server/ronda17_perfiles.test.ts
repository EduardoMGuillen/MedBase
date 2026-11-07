import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb } from './db.js'
import { createSql, type Sql } from './sql.js'
import { can, permissionsFor } from '../src/lib/permissions.js'
import { tourFor } from '../src/lib/tours.js'

// Ronda 17, perfiles (PF1, AD1, PF2): con la base y la API (copia en memoria de la demo)
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
const clinicOfUser = async (email: string) => String((await sql.one(`SELECT clinic_id FROM staff WHERE email = ?`, [email]))!.clinic_id)
/** Pacientes de la clínica sin estancia activa ni cita abierta hoy (para registrarlos sin cita). */
const freePatients = async (cid: string, n: number) => (await sql.query(`SELECT p.id FROM patients p WHERE p.clinic_id = ? AND NOT p.pending AND p.merged_into IS NULL
  AND NOT EXISTS (SELECT 1 FROM hospitalizations h WHERE h.patient_id = p.id AND h.status = 'active') ORDER BY p.record DESC LIMIT ?`, [cid, n])).map((r) => String(r.id))

describe('PF1 (ronda 17): el médico de la clínica registra pacientes sin cita', () => {
  test('el médico tiene checkin.manage en la clínica y en el consultorio', () => {
    assert.ok(permissionsFor('doctor', 'clinic').includes('checkin.manage'))
    assert.ok(permissionsFor('doctor', 'office').includes('checkin.manage'))
    assert.ok(can('doctor', 'checkin.manage'))
    // No le suma permisos administrativos ni de laboratorio
    for (const p of ['ambulatory.register', 'staff.manage', 'settings.manage', 'dept.work'] as const) assert.ok(!permissionsFor('doctor', 'clinic').includes(p), p)
  })

  test('/api/appointments/walk-in como médico de la clínica: 201, «En sala» y con él como médico', async () => {
    const cid = await clinicOfUser('vsolorzano@demo.clinara')
    const [pid] = await freePatients(cid, 1)
    const doc = await as('vsolorzano@demo.clinara')
    const r = await doc.post('/api/appointments/walk-in', { patientId: pid, doctorId: 's-solorzano', reason: 'Dolor abdominal' })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    assert.equal(r.body.status, 'arrived')
    assert.equal(r.body.source, 'walkin')
    assert.equal(r.body.doctorId, 's-solorzano')
  })

  test('el recorrido del médico de la clínica señala «Paciente sin cita»', () => {
    assert.ok(tourFor('doctor', 'clinic').some((s) => s.target === 'sin-cita'))
  })
})
