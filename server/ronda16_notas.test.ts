import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb } from './db.js'
import { createSql, type Sql } from './sql.js'
import { canonicalRoute, medicationLine, routeLabel, routeMatches } from '../src/lib/format.js'
import { loadingAllowed } from '../src/lib/medExtras.js'
import { medLabel } from '../src/lib/inpatient.js'

// Ronda 16 (rama notas): ME17, ME16, NO1, NO3 y NO2, con la base y la API (copia en memoria de la demo)
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

describe('ME17 (ronda 16): «Vía» escrita o elegida, con abreviaturas', () => {
  test('busca por nombre o abreviatura y guarda el nombre de la lista', () => {
    assert.equal(routeMatches('iv')[0].name, 'Intravenosa')
    assert.equal(routeMatches('vo')[0].name, 'Oral')
    assert.equal(routeMatches('sc')[0].name, 'Subcutánea')
    assert.equal(routeMatches('intra')[0].name, 'Intramuscular')
    assert.ok(routeMatches('intra').some((r) => r.name === 'Intravenosa'))
    assert.equal(routeMatches('').length, 13, 'sin escribir, la lista completa')
    assert.equal(canonicalRoute('iv'), 'Intravenosa')
    assert.equal(canonicalRoute('IV'), 'Intravenosa')
    assert.equal(canonicalRoute('Intravenosa (IV)'), 'Intravenosa')
    assert.equal(canonicalRoute('subcutanea'), 'Subcutánea')
    assert.equal(canonicalRoute('ot'), 'Ótica')
    assert.equal(canonicalRoute(' Intraósea  '), 'Intraósea', 'texto libre, tal cual')
    assert.equal(routeLabel('Intravenosa'), 'Intravenosa (IV)')
    assert.equal(routeLabel('Intraósea'), 'Intraósea')
  })

  test('una vía escrita a mano sale tal cual en la receta y en la nota; la dosis de carga sigue solo con IV', () => {
    const it = { drug: 'Adrenalina', presentation: 'Ampolla 1 mg/mL', dose: '1 mg', route: 'Intraósea', frequency: 'Dosis única', duration: '' }
    assert.match(medicationLine(it), /1 mg Intraósea dosis única/)
    assert.equal(medLabel({ drug: 'Adrenalina', dose: '1 mg', route: 'Intraósea', prn: false }), 'Adrenalina 1 mg Intraósea dosis única')
    assert.equal(medLabel({ drug: 'Gentamicina', dose: '80 mg', route: 'Oftálmica', everyHours: 8, prn: false }), 'Gentamicina 80 mg oftálmica c/8h', 'las de la lista, como antes')
    assert.equal(loadingAllowed({ everyHours: 8, prn: false, route: 'Intravenosa' }), true)
    assert.equal(loadingAllowed({ everyHours: 8, prn: false, route: 'Intraósea' }), false)
  })

  test('la consulta acepta la vía escrita a mano y la receta la conserva', async () => {
    const { id } = await consultFor(0)
    const doc = await as('hnolasco@demo.clinara')
    const r = await doc.post('/api/consultations', { appointmentId: id, reason: 'Dolor', diagnoses: dx,
      items: [{ drug: 'Lidocaína', presentation: 'Vial 2 %', dose: '2 mL', route: 'Infiltración local', frequency: 'Dosis única', duration: '' }] })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    const items = JSON.parse(String((await sql.one('SELECT items FROM prescriptions WHERE id = ?', [r.body.prescriptionId]))!.items))
    assert.equal(items[0].route, 'Infiltración local')
  })
})

const dx = [{ code: 'CA00', label: 'Rinofaringitis aguda' }]

/** Una cita del Dr. Nolasco en consulta, con un paciente adulto con identidad y sin estancia activa (copia de una cita de la clínica). */
async function consultFor(n: number, doctorId = 's-nolasco') {
  const cid = String((await sql.one('SELECT clinic_id FROM staff WHERE id = ?', [doctorId]))!.clinic_id)
  const pts = await sql.query(`SELECT p.id FROM patients p WHERE p.clinic_id = ? AND p.dni IS NOT NULL AND p.dni <> '' AND p.birth_date < '2000-01-01'
    AND NOT EXISTS (SELECT 1 FROM hospitalizations h WHERE h.patient_id = p.id AND h.status = 'active') ORDER BY p.id DESC`, [cid])
  const pid = String(pts[n].id)
  const appt = (await sql.one(`SELECT * FROM appointments WHERE clinic_id = ? ORDER BY start DESC LIMIT 1`, [cid]))!
  const id = `r16n-${n}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const row = { ...appt, id, patient_id: pid, doctor_id: doctorId, status: 'in_consult', start: new Date().toISOString().slice(0, 16) }
  const cols = Object.keys(row)
  await sql.run(`INSERT INTO appointments (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map((k) => (row as Record<string, unknown>)[k]))
  return { id, pid, cid }
}
