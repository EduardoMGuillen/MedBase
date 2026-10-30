import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb } from './db.js'
import { createSql, type Sql } from './sql.js'
import { fileAlerts } from '../src/lib/alerts.js'
import { bandOf } from '../src/lib/vitalsSheet.js'

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

describe('AD5 crónicos y seguimientos para administración', () => {
  test('Roberto Aguilar ve los mismos seguimientos que el médico, los opera y queda en la bitácora con su nombre', async () => {
    const admin = await as('admin@demo.clinara')
    const doc = await as('lherrera@demo.clinara')
    const mine = (await admin.get('/api/bootstrap')).body.followups
    const theirs = (await doc.get('/api/bootstrap')).body.followups
    assert.ok(mine.length > 0, 'la demo trae seguimientos')
    assert.deepEqual(mine.map((f: any) => f.id).sort(), theirs.map((f: any) => f.id).sort())
    const r = await admin.post(`/api/followups/${mine[0].id}/notify`)
    assert.equal(r.status, 200, JSON.stringify(r.body))
    const log = (await admin.get('/api/audit/mine')).body
    assert.ok((log.rows ?? log).some((e: any) => e.userId === 's-admin' && /WhatsApp del seguimiento/.test(e.action)), JSON.stringify((log.rows ?? log).slice(0, 3)))
    // Programar uno nuevo sigue siendo del médico
    assert.equal((await admin.post('/api/followups', { patientId: mine[0].patientId, kind: 'control', title: 'Control', dueDate: '2030-01-01' })).status, 403)
  })
})

describe('MC6 eliminar una autorización sin firmar', () => {
  test('el médico elimina la pendiente (queda en la bitácora); la firmada, la de «No autoriza» y la que tiene hoja en papel no se eliminan', async () => {
    const doc = await as('lherrera@demo.clinara')
    const nurse = await as('crios@demo.clinara')
    const reception = await as('smejia@demo.clinara')
    const stay = (await doc.get('/api/bootstrap')).body.inpatients.find((h: any) => h.kind === 'hospital' && h.status === 'active')
    const make = async (procedure: string) => {
      const r = await doc.post(`/api/inpatient/${stay.id}/authorizations`, { template: 'surgical', procedure })
      assert.equal(r.status, 201, JSON.stringify(r.body))
      return String(r.body.id)
    }
    const listed = async () => (await doc.get(`/api/inpatient/${stay.id}`)).body.authorizations.map((a: any) => a.id)
    const wrong = await make('Colecistectomía laparoscópica')
    assert.equal((await nurse.del(`/api/authorizations/${wrong}`)).status, 403)
    assert.equal((await reception.del(`/api/authorizations/${wrong}`)).status, 403)
    const r = await doc.del(`/api/authorizations/${wrong}`, { reason: 'Generada por error' })
    assert.equal(r.status, 200, JSON.stringify(r.body))
    assert.ok(!(await listed()).includes(wrong), 'sale de la lista')
    const row = await sql.one('SELECT archived_at, archived_by, archived_reason FROM authorizations WHERE id = ?', [wrong])
    assert.ok(row?.archived_at, 'no se borra: queda archivada')
    assert.equal(row?.archived_by, 's-herrera')
    const log = (await doc.get('/api/audit/mine')).body
    assert.ok((log.rows ?? log).some((e: any) => /Eliminó la autorización quirúrgica "Colecistectomía laparoscópica"/.test(e.action)))
    // «No autoriza» y la hospitalaria no se eliminan
    const refused = await make('Apendicectomía')
    assert.equal((await doc.post(`/api/authorizations/${refused}/status`, { status: 'refused', note: 'El paciente no autoriza' })).status, 200)
    assert.equal((await doc.del(`/api/authorizations/${refused}`)).status, 409)
    const hospital = (await doc.get(`/api/inpatient/${stay.id}`)).body.authorizations.find((a: any) => a.template === 'hospital')
    if (hospital) assert.equal((await doc.del(`/api/authorizations/${hospital.id}`)).status, 409)
    // La que tiene hoja en papel tampoco
    const paper = await make('Herniorrafia inguinal')
    await sql.run(`UPDATE authorizations SET status = 'signed', file_id = 'archivo-de-prueba', method = 'paper' WHERE id = ?`, [paper])
    assert.equal((await doc.del(`/api/authorizations/${paper}`)).status, 409)
  })
})

describe('RE1 Mi configuración de recepción', () => {
  test('Sofía Mejía guarda su nombre en documentos y su preferencia de agenda (queda en la bitácora); lo clínico y la configuración de la clínica le siguen cerrados', async () => {
    const rec = await as('smejia@demo.clinara')
    assert.equal((await rec.patch('/api/me', { agendaView: 'week', docName: 'Sofía Mejía Ruiz' })).status, 200)
    const me = (await rec.get('/api/auth/me')).body.user
    assert.equal(me.prefs.agendaView, 'week')
    assert.equal(me.docName, 'Sofía Mejía Ruiz')
    const log = (await rec.get('/api/audit/mine')).body
    assert.ok((log.rows ?? log).some((e: any) => /vista de la agenda/.test(e.action)))
    assert.equal((await rec.patch('/api/me', { license: 'CMH-1' })).status, 403)
    assert.equal((await rec.patch('/api/me', { noteFormat: 'soap' })).status, 403)
    assert.equal((await rec.put('/api/me/signature', { signature: 'data:image/png;base64,AAAA', password: DEMO_PASSWORD })).status, 403)
    assert.equal((await rec.put('/api/settings', { name: 'Otra' })).status, 403)
  })
})

describe('OB1 pendientes que se resuelven al registrar la dosis', () => {
  test('la dosis atrasada de ayer se registra desde su alerta (administrada con retraso u omitida con motivo), sale del panel y el aviso se va con la siguiente nota', async () => {
    const doc = await as('lherrera@demo.clinara')
    const nurse = await as('crios@demo.clinara')
    const stay = (await doc.get('/api/bootstrap')).body.inpatients.find((h: any) => h.kind === 'hospital' && h.status === 'active')
    // Solución c/8h que empezó hace 30 h: sus dosis de hace 30, 22, 14 y 6 h están atrasadas
    const first = new Date(Date.now() - 30 * 3_600_000)
    first.setSeconds(0, 0)
    const n = await doc.post(`/api/inpatient/${stay.id}/notes`, { kind: 'evolution', format: 'dx', exam: 'Estable.',
      meds: [{ drug: 'Solución Hartmann', dose: '1000 mL', route: 'IV', everyHours: 8, firstAt: first.toISOString() }] })
    assert.equal(n.status, 201, JSON.stringify(n.body))
    const band = bandOf({})
    const file = async () => (await nurse.get(`/api/inpatient/${stay.id}`)).body
    let f = await file()
    const med = f.meds.find((m: any) => m.drug === 'Solución Hartmann')
    const late = () => fileAlerts(f, band, new Date()).find((a) => a.key === `late-${med.id}`)
    assert.equal(late()?.count, 4)
    // La de ayer (hace 30 h), administrada tarde: pide el motivo del registro tardío y queda «con retraso» en la bitácora
    const slot = (h: number) => new Date(first.getTime() + h * 3_600_000).toISOString()
    assert.equal((await nurse.post(`/api/inpatient/meds/${med.id}/doses`, { scheduledAt: slot(0), givenAt: slot(1.5), status: 'given' })).status, 400)
    const given = await nurse.post(`/api/inpatient/meds/${med.id}/doses`, { scheduledAt: slot(0), givenAt: slot(1.5), status: 'given', reason: 'Se aplicó en el turno de noche' })
    assert.equal(given.status, 201, JSON.stringify(given.body))
    f = await file()
    assert.equal(late()?.count, 3, 'sale del panel')
    // Omitida: pide motivo
    assert.equal((await nurse.post(`/api/inpatient/meds/${med.id}/doses`, { scheduledAt: slot(8), status: 'omitted' })).status, 400)
    assert.equal((await nurse.post(`/api/inpatient/meds/${med.id}/doses`, { scheduledAt: slot(8), status: 'omitted', note: 'Suspendida por el médico' })).status, 201)
    f = await file()
    assert.equal(late()?.count, 2)
    assert.match(fileAlerts(f, band, new Date()).find((a) => a.key === `skip-${med.id}`)!.text, /1 dosis omitida .*Suspendida por el médico/)
    // Nada se borra: queda en la hoja con autor y hora
    const recorded = f.doses.filter((d: any) => d.medId === med.id)
    assert.deepEqual(recorded.map((d: any) => d.status).sort(), ['given', 'omitted'])
    assert.ok(recorded.every((d: any) => d.givenBy === 's-rios' && d.givenAt))
    const log = (await nurse.get('/api/audit/mine')).body
    assert.ok((log.rows ?? log).some((e: any) => /Administró Solución Hartmann.*con retraso/.test(e.action)))
    assert.ok((log.rows ?? log).some((e: any) => /Marcó como omitida Solución Hartmann/.test(e.action)))
    // El aviso de la omitida es para el médico: se va con su siguiente nota
    await doc.post(`/api/inpatient/${stay.id}/notes`, { kind: 'evolution', format: 'dx', exam: 'Revisado.' })
    f = await file()
    assert.equal(fileAlerts(f, band, new Date()).find((a) => a.key === `skip-${med.id}`), undefined)
  })
})
