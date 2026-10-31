import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb } from './db.js'
import { createSql, type Sql } from './sql.js'
import { fileAlerts } from '../src/lib/alerts.js'
import { bandOf } from '../src/lib/vitalsSheet.js'
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

/** Cliente mínimo que conserva la cookie de sesión. */
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
  return {
    status: res.status,
    get: (p: string) => call('GET', p), post: (p: string, b?: unknown) => call('POST', p, b), patch: (p: string, b: unknown) => call('PATCH', p, b),
    put: (p: string, b: unknown) => call('PUT', p, b), del: (p: string, b?: unknown) => call('DELETE', p, b),
  }
}

/** Una estancia activa del tipo pedido. */
async function stayOf(doc: Awaited<ReturnType<typeof as>>, kind: 'hospital' | 'observation') {
  return (await doc.get('/api/bootstrap')).body.inpatients.find((h: any) => h.kind === kind && h.status === 'active')
}

describe('MC2 PRN', () => {
  test('la receta se lee «PRN: si dolor» y la nota «PRN · si dolor»', () => {
    const it = { drug: 'Acetaminofén', presentation: 'Tableta 500 mg', dose: '1 tableta', route: 'Oral', frequency: 'PRN (si es necesario)', duration: '3 días', prnCondition: 'si dolor' }
    assert.match(medicationLine(it), /PRN: si dolor/)
    assert.equal(medLabel({ drug: 'Tramadol', dose: '50 mg', route: 'Subcutánea', everyHours: 8, prn: true, prnCondition: 'si dolor' }), 'Tramadol 50 mg SC c/8h PRN · si dolor')
    // Lo de antes no cambia
    assert.equal(medLabel({ drug: 'Ondansetrón', dose: '8 mg', route: 'Intravenosa', everyHours: 8, prn: false }), 'Ondansetrón 8 mg IV c/8h')
  })

  test('con su condición pasa a la hoja sin horas, no alerta y enfermería registra la dosis con su nombre', async () => {
    const doc = await as('lherrera@demo.clinara')
    const nurse = await as('crios@demo.clinara')
    const stay = await stayOf(doc, 'hospital')
    const med = { drug: 'Ketorolaco', dose: '30 mg', route: 'Intravenosa', everyHours: 8, prn: true }
    const ok = await doc.post(`/api/inpatient/${stay.id}/notes`, { kind: 'evolution', format: 'dx', observations: 'Dolor', meds: [{ ...med, prnCondition: 'si dolor' }], orders: [] })
    assert.equal(ok.status, 201, JSON.stringify(ok.body))
    const file = (await doc.get(`/api/inpatient/${stay.id}`)).body
    const m = file.meds.find((x: any) => x.drug === 'Ketorolaco' && !x.stoppedAt)
    assert.equal(m.prnCondition, 'si dolor')
    const alerts = fileAlerts(file, bandOf({}), new Date(Date.now() + 2 * 86_400_000))
    assert.ok(!alerts.some((a) => a.text.includes('Ketorolaco')), 'un PRN nunca alerta')
    const d = await nurse.post(`/api/inpatient/meds/${m.id}/doses`, { status: 'given' })
    assert.equal(d.status, 201, JSON.stringify(d.body))
    assert.equal(d.body.givenBy, 's-rios')
    const log = (await nurse.get('/api/audit/mine')).body
    assert.ok((log.rows ?? log).some((e: any) => /Administró Ketorolaco 30 mg IV c\/8h PRN · si dolor/.test(e.action)))
  })

  test('la receta de la consulta no acepta un PRN sin condición', async () => {
    const doc = await as('lherrera@demo.clinara')
    const r = await doc.post('/api/prescriptions', { patientId: 'p1', items: [{ drug: 'Ibuprofeno', presentation: 'Tableta 400 mg', dose: '1 tableta', frequency: 'PRN (si es necesario)', duration: '3 días' }] })
    assert.equal(r.status, 400, JSON.stringify(r.body))
  })
})
