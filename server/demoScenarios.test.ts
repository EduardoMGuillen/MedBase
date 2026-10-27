import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb } from './db.js'
import { checkStayOrders } from './medOrders.js'
import { createSql, type Sql } from './sql.js'
import { courseDone } from '../src/lib/inpatient.js'

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

async function as(email: string) {
  const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: DEMO_PASSWORD }) })
  const cookie = res.headers.get('set-cookie')?.split(';')[0] ?? ''
  const call = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(`${base}${path}`, { method, headers: { cookie, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    return { status: r.status, body: await r.json() as any }
  }
  return { get: (p: string) => call('GET', p), post: (p: string, b?: unknown) => call('POST', p, b) }
}

describe('Casos de demostración para probar cada estado', () => {
  test('todas las estancias de la demo tienen en la hoja los medicamentos de su consulta', async () => {
    assert.deepEqual(await checkStayOrders(sql), [])
  })

  test('observación de la clínica: sin autorización, con nota en el segundo formato, y pasa a hospitalización', async () => {
    const doc = await as('lherrera@demo.clinara')
    const file = (await doc.get('/api/inpatient/he-pe1')).body
    assert.equal(file.hospitalization.kind, 'observation')
    assert.equal(file.authorizations.length, 0)
    assert.deepEqual(file.meds.map((m: any) => m.drug).sort(), ['Acetaminofén', 'Ondansetrón', 'Solución Hartmann'])
    assert.equal(file.notes[0].format, 'dx')
    const bed = (await sql.one(`SELECT b.id FROM beds b WHERE b.clinic_id = 'c-sb' AND b.active AND NOT EXISTS (SELECT 1 FROM hospitalizations h WHERE h.bed_id = b.id AND h.status = 'active') LIMIT 1`))!
    const r = await doc.post('/api/inpatient/he-pe1/convert', { bedId: String(bed.id) })
    assert.equal(r.status, 200, JSON.stringify(r.body))
    const after = (await doc.get('/api/inpatient/he-pe1')).body
    assert.deepEqual(after.authorizations.map((a: any) => `${a.template}:${a.status}`), ['hospital:pending'])
    assert.equal(after.meds.length, 3, 'no se duplican las órdenes al pasar a hospitalización')
  })

  test('hospitalizado que vino de observación: SOAP y segundo formato, tratamiento de 1 día completado', async () => {
    const file = (await (await as('lherrera@demo.clinara')).get('/api/inpatient/he-pe2')).body
    assert.ok(file.hospitalization.observationAt)
    assert.deepEqual(file.authorizations.map((a: any) => `${a.template}:${a.status}`), ['hospital:pending'])
    const evo = file.notes.filter((n: any) => n.kind === 'evolution')
    assert.deepEqual(evo.map((n: any) => n.format ?? 'soap'), ['soap', 'dx'])
    assert.equal(evo[0].indicationCount, 3)
    assert.equal(evo[0].orders.length, 5, '3 indicaciones y 2 medicamentos')
    const salbutamol = file.meds.find((m: any) => m.drug === 'Salbutamol')
    assert.ok(courseDone(salbutamol), 'el salbutamol de 1 día ya terminó')
    assert.ok(!courseDone(file.meds.find((m: any) => m.drug === 'Ceftriaxona')))
    assert.ok(file.doses.length > 5)
    assert.equal(file.labs.length, 1)
    // La nota de ingreso (la consulta) muestra sus medicamentos a la derecha, igual que una firmada en la aplicación
    const c = (await (await as('lherrera@demo.clinara')).get('/api/consultations/ke-pe2')).body
    const consult = c.consultation ?? c
    assert.equal(consult.indications.length, 3)
    assert.match(consult.orders.slice(3).join(' '), /Ceftriaxona.*Salbutamol.*Acetaminofén/)
  })

  test('ingreso directo: hospitalización firmada y quirúrgica genérica pendiente', async () => {
    const file = (await (await as('lherrera@demo.clinara')).get('/api/inpatient/he-pe3')).body
    const auth = Object.fromEntries(file.authorizations.map((a: any) => [a.template, a]))
    assert.equal(auth.hospital.status, 'signed')
    assert.ok(auth.hospital.fileId)
    assert.equal(auth.surgical.status, 'pending')
    assert.equal(auth.surgical.data.generic, true)
    assert.equal(file.procedures[0].status, 'pending')
  })

  test('consultorio: la observación lista se refiere y la de ayer ya tiene su referencia', async () => {
    const doc = await as('alopez@demo.clinara')
    const draft = (await doc.get('/api/inpatient/he-re1/referral-draft')).body
    assert.match(draft.diagnosis, /Crisis hipertensiva \(BA03\)/)
    assert.match(draft.medications, /Captopril/)
    assert.match(draft.evolution, /se refiere al hospital/)
    const r = await doc.post('/api/inpatient/he-re1/referral', { ...draft, condition: 'Estable', destination: 'Hospital Escuela' })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    assert.equal(r.body.number, `REF-${new Date().getFullYear()}-0002`)

    const old = (await doc.get('/api/inpatient/he-re2')).body
    assert.equal(old.hospitalization.status, 'discharged')
    assert.equal(old.referrals.length, 1)
    assert.ok(old.meds.every((m: any) => m.stoppedAt))
    assert.match(old.referrals[0].data.medications, /Ondansetrón/)
  })
})
