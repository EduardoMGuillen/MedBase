import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb } from './db.js'
import { createSql, type Sql } from './sql.js'
import { fileAlerts } from '../src/lib/alerts.js'
import { bandOf } from '../src/lib/vitalsSheet.js'
import { groupsFromLimits } from '../src/lib/clinicalConfig.js'
import { BASE_PROFILES, EXAMS } from '../src/lib/exams.js'

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

describe('AD3 rol de turnos', () => {
  test('administración asigna un médico por día (o dos), quita uno, cambia de mes sin perder nada y todo queda en la bitácora; los demás no entran', async () => {
    const admin = await as('admin@demo.clinara')
    const y = new Date().getFullYear() + 1
    const d = (n: number) => `${y}-11-${String(n).padStart(2, '0')}`
    for (const [day, id] of [[3, 's-herrera'], [4, 's-paz'], [5, 's-zuniga'], [5, 's-herrera']] as const) {
      const r = await admin.post('/api/roster', { day: d(day), staffId: id })
      assert.equal(r.status, 201, JSON.stringify(r.body))
    }
    assert.equal((await admin.post('/api/roster', { day: d(3), staffId: 's-herrera' })).status, 409, 'no se repite')
    assert.equal((await admin.post('/api/roster', { day: d(6), staffId: 's-rios' })).status, 400, 'sólo médicos')
    let month = (await admin.get(`/api/roster?from=${d(1)}&to=${d(30)}`)).body
    assert.deepEqual(month.map((s: any) => `${s.day.slice(8)}:${s.staffId}`), ['03:s-herrera', '04:s-paz', '05:s-zuniga', '05:s-herrera'])
    const del = await admin.del(`/api/roster/${month.find((s: any) => s.day === d(5) && s.staffId === 's-herrera').id}`)
    assert.equal(del.status, 200)
    // Otro mes y de vuelta: lo guardado sigue ahí
    assert.equal((await admin.get(`/api/roster?from=${y}-12-01&to=${y}-12-31`)).body.length, 0)
    month = (await admin.get(`/api/roster?from=${d(1)}&to=${d(30)}`)).body
    assert.equal(month.length, 3)
    assert.equal((await sql.one(`SELECT COUNT(*)::int AS n FROM duty_roster WHERE removed_at IS NOT NULL`))!.n, 1, 'quitar no borra la fila')
    const log = ((await admin.get('/api/audit/mine')).body.rows ?? (await admin.get('/api/audit/mine')).body) as any[]
    assert.ok(log.some((e) => /Rol de turnos: asignó a Dra\. Lucía Herrera/.test(e.action)))
    assert.ok(log.some((e) => /Rol de turnos: quitó a Dra\. Lucía Herrera/.test(e.action)))
    for (const email of ['lherrera@demo.clinara', 'smejia@demo.clinara', 'crios@demo.clinara']) {
      const u = await as(email)
      assert.equal((await u.get(`/api/roster?from=${d(1)}&to=${d(30)}`)).status, 403, email)
      assert.equal((await u.post('/api/roster', { day: d(7), staffId: 's-paz' })).status, 403, email)
    }
    // En el consultorio no aplica
    const owner = await as('alopez@demo.clinara')
    await owner.post('/api/me/view', { role: 'admin' })
    assert.equal((await owner.post('/api/roster', { day: d(7), staffId: 's-alopez' })).status, 400)
  })
})

describe('AD1 umbrales críticos por grupo', () => {
  test('los umbrales de antes quedan en grupos con sus mismos números (lo desconocido va a «Otros»)', () => {
    const groups = groupsFromLimits({ Hemoglobina: { low: 6.5, high: 20 }, Lactato: { high: 4 } })
    const all = groups.flatMap((g) => g.analytes.map((a) => [g.name, a.name, a.low, a.high]))
    assert.deepEqual(all.find((x) => x[1] === 'Hemoglobina'), ['Hemograma', 'Hemoglobina', 6.5, 20])
    assert.deepEqual(all.find((x) => x[1] === 'Potasio'), ['Electrolitos', 'Potasio', 2.8, 6.2])
    assert.deepEqual(all.find((x) => x[1] === 'Lactato'), ['Otros', 'Lactato', undefined, 4])
  })

  test('Roberto agrega Hematocrito (20 y 60), uno con sólo límite superior y otro con sólo inferior; se archiva sin perderse; la bitácora guarda el antes y el después; un resultado nuevo dispara el aviso crítico', async () => {
    const admin = await as('admin@demo.clinara')
    let s = (await admin.get('/api/bootstrap')).body.settings
    const groups = structuredClone(s.criticalGroups)
    assert.equal(groups.find((g: any) => g.name === 'Hemograma').analytes.find((a: any) => a.name === 'Hemoglobina').low, 7, 'los valores de antes, intactos')
    const hemo = groups.find((g: any) => g.name === 'Hemograma')
    hemo.analytes.push({ id: 'a-hto', name: 'Hematocrito', unit: '%', low: 20, high: 60 })
    groups.push({ id: 'g-gases', name: 'Gases arteriales', analytes: [{ id: 'a-lact', name: 'Lactato', unit: 'mmol/L', high: 4 }, { id: 'a-po2', name: 'pO2', unit: 'mmHg', low: 50 }] })
    groups.find((g: any) => g.name === 'Electrolitos').analytes.find((a: any) => a.name === 'Potasio').high = 6.5
    assert.equal((await admin.put('/api/settings/critical-groups', { groups: [...groups, { id: 'g-x', name: 'Malo', analytes: [{ id: 'a-x', name: 'X', low: 5, high: 2 }] }] })).status, 400)
    assert.equal((await admin.put('/api/settings/critical-groups', { groups: [...groups, { id: 'g-y', name: 'Repetido', analytes: [{ id: 'a-y', name: 'hematocrito', high: 70 }] }] })).status, 400, 'un analito, un umbral')
    const r = await admin.put('/api/settings/critical-groups', { groups })
    assert.equal(r.status, 200, JSON.stringify(r.body))
    s = (await admin.get('/api/bootstrap')).body.settings
    const hto = s.criticalGroups.find((g: any) => g.name === 'Hemograma').analytes.find((a: any) => a.name === 'Hematocrito')
    assert.deepEqual([hto.low, hto.high, hto.unit], [20, 60, '%'])
    // Archivar: deja de contar pero no se pierde
    const next = structuredClone(s.criticalGroups)
    next.find((g: any) => g.id === 'g-gases').analytes.find((a: any) => a.id === 'a-po2').archivedAt = new Date().toISOString()
    assert.equal((await admin.put('/api/settings/critical-groups', { groups: next.filter((g: any) => g.id !== 'g-otros') })).status, 200)
    s = (await admin.get('/api/bootstrap')).body.settings
    assert.ok(s.criticalGroups.find((g: any) => g.id === 'g-gases').analytes.find((a: any) => a.id === 'a-po2').archivedAt)
    assert.ok(s.criticalGroups.find((g: any) => g.id === 'g-otros').archivedAt, 'un grupo que no se mandó queda archivado, no borrado')
    const log = ((await admin.get('/api/audit/mine')).body.rows ?? (await admin.get('/api/audit/mine')).body) as any[]
    assert.ok(log.some((e) => /agregó Hematocrito \(%\) a «Hemograma»: menor de 20, mayor de 60/.test(e.action)))
    assert.ok(log.some((e) => /Potasio: crítico si es mayor de 6\.2 → 6\.5/.test(e.action)))
    assert.ok(log.some((e) => /archivó pO2 de «Gases arteriales»/.test(e.action)))
    // Por URL o API, sólo administración
    assert.equal((await (await as('lherrera@demo.clinara')).put('/api/settings/critical-groups', { groups })).status, 403)
    // Un hematocrito de 18 en un hemograma es crítico, igual que un analito de antes
    const doc = await as('lherrera@demo.clinara')
    const nurse = await as('crios@demo.clinara')
    const stay = (await doc.get('/api/bootstrap')).body.inpatients.find((h: any) => h.kind === 'hospital' && h.status === 'active')
    const n = await doc.post(`/api/inpatient/${stay.id}/notes`, { kind: 'evolution', format: 'dx', exam: 'Palidez.', exams: [{ group: 'lab', name: 'Hemograma', priority: 'urgent', place: 'clinic' }] })
    assert.equal(n.status, 201, JSON.stringify(n.body))
    const exam = (await doc.get(`/api/inpatient/${stay.id}`)).body.exams.filter((e: any) => e.name === 'Hemograma' && e.status === 'ordered').at(-1)
    const res = await nurse.post(`/api/exams/${exam.id}/result`, { values: [{ analyte: 'Hematocrito', value: '18' }, { analyte: 'Hemoglobina', value: '9' }] })
    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.equal(res.body.critical, true)
    assert.deepEqual(res.body.result.values.filter((v: any) => v.critical).map((v: any) => v.analyte), ['Hematocrito'])
  })
})

describe('AD4 catálogo de exámenes de la clínica', () => {
  test('empieza con la lista de antes; Roberto agrega, edita y archiva (en la bitácora); el médico no lo edita; en el consultorio el titular sí', async () => {
    const admin = await as('admin@demo.clinara')
    let cat = (await admin.get('/api/exams/catalog')).body.exams
    for (const e of EXAMS) assert.ok(cat.some((c: any) => c.name === e.name && c.group === e.group && c.active), `falta ${e.name}`)
    const add = await admin.post('/api/exams/catalog', { group: 'lab', name: 'Dímero D' })
    assert.equal(add.status, 201, JSON.stringify(add.body))
    assert.equal((await admin.post('/api/exams/catalog', { group: 'lab', name: 'dimero d' })).status, 409, 'sin duplicados')
    assert.equal((await admin.patch(`/api/exams/catalog/${add.body.id}`, { name: 'Dímero D cuantitativo' })).status, 200)
    assert.equal((await admin.patch(`/api/exams/catalog/${add.body.id}`, { active: false })).status, 200)
    cat = (await admin.get('/api/exams/catalog')).body.exams
    const d = cat.find((c: any) => c.id === add.body.id)
    assert.equal(d.name, 'Dímero D cuantitativo')
    assert.equal(d.active, false, 'archivado, no borrado')
    assert.ok(d.archivedAt)
    const log = ((await admin.get('/api/audit/mine')).body.rows ?? (await admin.get('/api/audit/mine')).body) as any[]
    assert.ok(log.some((e) => /Agregó al catálogo de exámenes \(Laboratorio\): Dímero D$/.test(e.action)))
    assert.ok(log.some((e) => /«Dímero D» → «Dímero D cuantitativo»/.test(e.action)))
    assert.ok(log.some((e) => /Archivó del catálogo de exámenes: Dímero D cuantitativo/.test(e.action)))
    // Archivar el hemograma no cambia los ya ordenados; un examen renombrado conserva sus valores de referencia
    const hemo = cat.find((c: any) => c.name === 'Hemograma')
    assert.equal((await admin.patch(`/api/exams/catalog/${hemo.id}`, { name: 'Hemograma completo' })).status, 200)
    const doc = await as('lherrera@demo.clinara')
    const nurse = await as('crios@demo.clinara')
    const stay = (await doc.get('/api/bootstrap')).body.inpatients.find((h: any) => h.kind === 'hospital' && h.status === 'active')
    await doc.post(`/api/inpatient/${stay.id}/notes`, { kind: 'evolution', format: 'dx', exam: 'Control.', exams: [{ group: 'lab', name: 'Hemograma completo', priority: 'routine', place: 'clinic' }] })
    const order = (await doc.get(`/api/inpatient/${stay.id}`)).body.exams.find((e: any) => e.name === 'Hemograma completo' && e.status === 'ordered')
    const res = await nurse.post(`/api/exams/${order.id}/result`, { values: [{ analyte: 'Hemoglobina', value: '10' }] })
    assert.equal(res.body.result.values[0].flag, 'low', 'el rango del hemograma sigue aplicando')
    assert.equal((await admin.patch(`/api/exams/catalog/${hemo.id}`, { name: 'Hemograma' })).status, 200)
    // El médico usa el catálogo pero no lo edita, ni por la API
    assert.equal((await doc.get('/api/exams/catalog')).status, 200)
    assert.equal((await doc.post('/api/exams/catalog', { group: 'lab', name: 'Ferritina' })).status, 403)
    assert.equal((await doc.patch(`/api/exams/catalog/${hemo.id}`, { active: false })).status, 403)
    const owner = await as('alopez@demo.clinara')
    await owner.post('/api/me/view', { role: 'admin' })
    assert.equal((await owner.post('/api/exams/catalog', { group: 'lab', name: 'Ferritina' })).status, 201)
  })
})

describe('MC2 mis sets de exámenes', () => {
  test('cada médico recibe los cinco perfiles como sets suyos; crea, edita, duplica y archiva los suyos; otro médico no los ve', async () => {
    const herrera = await as('lherrera@demo.clinara')
    const paz = await as('apaz@demo.clinara')
    let mine = (await herrera.get('/api/order-sets?kind=exams')).body
    for (const p of BASE_PROFILES) assert.ok(mine.some((s: any) => s.name === p.name && s.kind === 'exams'), `falta ${p.name}`)
    assert.equal((await herrera.get('/api/order-sets?kind=exams')).body.length, mine.length, 'se entregan una sola vez')
    const exam = (name: string, group = 'lab') => ({ exam: { group, name, priority: 'routine', place: 'clinic' } })
    const items = ['Hemograma', 'Tipo y Rh', 'Glucosa en ayunas', 'Examen general de orina (EGO)', 'VDRL'].map((n) => exam(n))
    const created = await herrera.post('/api/order-sets', { name: 'Mi control prenatal', kind: 'exams', items: [...items, exam('Ultrasonido obstétrico', 'imaging')] })
    assert.equal(created.status, 201, JSON.stringify(created.body))
    assert.equal(created.body.items.length, 6)
    assert.equal((await herrera.post('/api/order-sets', { name: 'Con texto', kind: 'exams', items: [{ text: 'Dieta blanda.' }] })).status, 400, 'sólo exámenes')
    assert.equal((await herrera.post('/api/order-sets', { name: 'Compartido', kind: 'exams', shared: true, items })).status, 400, 'no se comparten')
    assert.ok(!(await paz.get('/api/order-sets?kind=exams')).body.some((s: any) => s.name === 'Mi control prenatal'), 'otro médico no lo ve')
    assert.ok(!(await herrera.get('/api/order-sets')).body.some((s: any) => s.kind === 'exams'), 'no se mezclan con los sets de órdenes')
    assert.equal((await paz.patch(`/api/order-sets/${created.body.id}`, { name: 'Robado' })).status, 403)
    assert.equal((await herrera.patch(`/api/order-sets/${created.body.id}`, { name: 'Mi control prenatal (1.er trimestre)' })).status, 200)
    const dup = await herrera.post(`/api/order-sets/${created.body.id}/duplicate`)
    assert.equal(dup.status, 201)
    assert.equal(dup.body.kind, 'exams')
    assert.equal((await herrera.del(`/api/order-sets/${dup.body.id}`)).status, 200)
    mine = (await herrera.get('/api/order-sets?kind=exams')).body
    assert.ok(mine.some((s: any) => s.name === 'Mi control prenatal (1.er trimestre)'))
    assert.ok(!mine.some((s: any) => s.id === dup.body.id), 'archivado')
    const log = ((await herrera.get('/api/audit/mine')).body.rows ?? (await herrera.get('/api/audit/mine')).body) as any[]
    assert.ok(log.some((e) => /Creó el set de exámenes "Mi control prenatal" \(6 exámenes\)/.test(e.action)))
    assert.ok(log.some((e) => /Archivó el set de exámenes/.test(e.action)))
  })
})
