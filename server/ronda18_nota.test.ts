import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { type Sql } from './sql.js'
import { can, permissionsFor, ROLES_BY_KIND } from '../src/lib/permissions.js'
import { TEAM_NOTE_MAX } from '../src/lib/clinicalConfig.js'
import { bootApp, DEMO } from './test/helpers.js'

// NP1 (ronda 18): nota para el equipo del paciente, con la base y la API (copia en memoria de la demo)
let sql: Sql
let pid = ''
let rxId = ''
const booted = bootApp(async () => {
  sql = booted.sql
  // Un paciente de la clínica principal que ya tiene una receta (para probar que la nota no viaja con ella)
  const rx = (await sql.one(`SELECT id, patient_id FROM prescriptions WHERE clinic_id = ? AND patient_id IS NOT NULL ORDER BY id LIMIT 1`, [DEMO.clinic]))!
  pid = String(rx.patient_id)
  rxId = String(rx.id)
})
const as = booted.as

const NOTE = 'Debe ser atendido con su madre'
const url = () => `/api/patients/${pid}/team-note`
const bootNote = async (email: string) => {
  const b = await (await as(email)).get('/api/bootstrap')
  assert.equal(b.status, 200)
  return (b.body.patients as { id: string; teamNote?: { text: string; authorName: string; versions: number } }[]).find((p) => p.id === pid)?.teamNote
}

describe('NP1 (ronda 18): permisos de la nota para el equipo', () => {
  test('la cambian médicos, enfermería y administración; en el consultorio, la titular y su enfermera', () => {
    for (const role of ['admin', 'doctor', 'nurse'] as const) {
      assert.ok(can(role, 'patients.teamnote'), role)
      assert.ok(permissionsFor(role, 'office').includes('patients.teamnote'), `${role} en consultorio`)
    }
    for (const role of ['reception', 'lab', 'imaging', 'assistant', 'superadmin'] as const) assert.ok(!can(role, 'patients.teamnote'), role)
    assert.ok(!permissionsFor('assistant', 'office').includes('patients.teamnote'))
    // El cargo no la suma (radiólogo, microbiólogo)
    assert.ok(!permissionsFor('imaging', 'clinic', 'radiologist').includes('patients.teamnote'))
    assert.ok(!permissionsFor('lab', 'clinic', 'microbiologist').includes('patients.teamnote'))
  })
  test('todo rol que cambia la nota también puede abrir al paciente', () => {
    for (const kind of ['clinic', 'office'] as const) for (const role of ROLES_BY_KIND[kind]) {
      const perms = permissionsFor(role, kind)
      if (perms.includes('patients.teamnote')) assert.ok(perms.includes('patients.view'), `${role} (${kind})`)
      // Verla: todo el personal de la clínica
      assert.ok(perms.includes('patients.view'), `${role} (${kind}) ve al paciente`)
    }
  })
})

describe('NP1 (ronda 18): agregar, cambiar y quitar, con historial', () => {
  test('sin nota: el paciente llega sin ella y no hay nada que quitar', async () => {
    assert.equal(await bootNote(DEMO.doctor), undefined)
    const doc = await as(DEMO.doctor)
    assert.deepEqual((await doc.get(`${url()}/history`)).body, [])
    assert.equal((await doc.put(url(), { text: '   ' })).status, 400)
  })

  test('una médica la agrega: llega con el paciente, con su nombre y la fecha', async () => {
    const doc = await as(DEMO.doctor)
    const r = await doc.put(url(), { text: `  ${NOTE}  ` })
    assert.equal(r.status, 200, JSON.stringify(r.body))
    assert.equal(r.body.text, NOTE)
    assert.equal(r.body.authorId, 's-solorzano')
    assert.equal(r.body.authorName, 'Dra. Valeria Solórzano')
    assert.equal(r.body.versions, 1)
    assert.ok(!Number.isNaN(Date.parse(r.body.at)))
    // La ve todo el personal en su sincronización: recepción, laboratorio e imágenes también
    for (const email of ['aquiroz@demo.clinara', 'berazo@demo.clinara', 'echinchilla@demo.clinara', DEMO.nurse, 'rmoncada@demo.clinara']) {
      const n = await bootNote(email)
      assert.equal(n?.text, NOTE, email)
      assert.equal(n?.authorName, 'Dra. Valeria Solórzano')
    }
    const log = await sql.one(`SELECT action, user_id FROM audit WHERE patient_id = ? AND action LIKE '%nota para el equipo%' ORDER BY id DESC LIMIT 1`, [pid])
    assert.match(String(log?.action), /^Agregó la nota para el equipo de /)
    assert.equal(log?.user_id, 's-solorzano')
  })

  test('guardar el mismo texto no crea otra versión', async () => {
    const r = await (await as(DEMO.doctor)).put(url(), { text: NOTE })
    assert.equal(r.status, 200)
    assert.equal(r.body.versions, 1)
  })

  test('otro médico la cambia: el historial tiene las dos versiones, la nueva primero', async () => {
    const doc = await as('hnolasco@demo.clinara')
    const r = await doc.put(url(), { text: 'Debe ser atendido con su madre o su hermana' })
    assert.equal(r.status, 200, JSON.stringify(r.body))
    assert.equal(r.body.authorName, 'Dr. Hugo Nolasco')
    assert.equal(r.body.versions, 2)
    const h = await doc.get(`${url()}/history`)
    assert.equal(h.status, 200)
    assert.deepEqual(h.body.map((v: { text: string; authorName: string }) => [v.text, v.authorName]),
      [['Debe ser atendido con su madre o su hermana', 'Dr. Hugo Nolasco'], [NOTE, 'Dra. Valeria Solórzano']])
    for (const v of h.body) assert.ok(v.id && !Number.isNaN(Date.parse(v.at)))
  })

  test('enfermería y administración también la cambian', async () => {
    const nurse = await (await as(DEMO.nurse)).put(url(), { text: 'Viene con su madre. Hablarle despacio.' })
    assert.equal(nurse.status, 200, JSON.stringify(nurse.body))
    assert.equal(nurse.body.authorName, 'Lic. Marta Urbina')
    const aux = await (await as('rvallecillo@demo.clinara')).put(url(), { text: 'Viene con su madre.' })
    assert.equal(aux.status, 200, JSON.stringify(aux.body))
    const adm = await (await as('rmoncada@demo.clinara')).put(url(), { text: 'Viene con su madre. Avisar a recepción al llegar.' })
    assert.equal(adm.status, 200, JSON.stringify(adm.body))
    assert.equal(adm.body.authorName, 'Ricardo Moncada')
    assert.equal(adm.body.versions, 5)
  })

  test('recepción, laboratorio e imágenes la leen con su historial, pero no la cambian (403)', async () => {
    for (const email of ['aquiroz@demo.clinara', 'berazo@demo.clinara', 'psuazo@demo.clinara', 'echinchilla@demo.clinara', 'rzepeda@demo.clinara']) {
      const c = await as(email)
      const h = await c.get(`${url()}/history`)
      assert.equal(h.status, 200, email)
      assert.equal(h.body.length, 5, email)
      assert.equal((await c.put(url(), { text: 'Cambio sin permiso' })).status, 403, email)
      assert.equal((await c.put(url(), { text: '' })).status, 403, email)
    }
    assert.equal((await bootNote(DEMO.doctor))?.text, 'Viene con su madre. Avisar a recepción al llegar.')
  })

  test(`máximo ${TEAM_NOTE_MAX} caracteres`, async () => {
    const doc = await as(DEMO.doctor)
    const long = await doc.put(url(), { text: 'x'.repeat(TEAM_NOTE_MAX + 1) })
    assert.equal(long.status, 400)
    assert.match(long.body.error ?? long.body.message ?? JSON.stringify(long.body), /200 caracteres/)
    assert.equal((await doc.put(url(), {})).status, 400)
    const exact = await doc.put(url(), { text: 'x'.repeat(TEAM_NOTE_MAX) })
    assert.equal(exact.status, 200, JSON.stringify(exact.body))
    assert.equal(exact.body.text.length, TEAM_NOTE_MAX)
    // Es una sola línea: los saltos se juntan
    const lines = await doc.put(url(), { text: 'Sorda del oído derecho.\n\nHablarle de frente.' })
    assert.equal(lines.body.text, 'Sorda del oído derecho. Hablarle de frente.')
  })

  test('quitarla deja el historial: la vigente queda vacía, con quién la quitó', async () => {
    const nurse = await as(DEMO.nurse)
    const before = (await nurse.get(`${url()}/history`)).body.length
    const r = await nurse.put(url(), { text: '' })
    assert.equal(r.status, 200, JSON.stringify(r.body))
    assert.equal(r.body.text, '')
    assert.equal(r.body.authorName, 'Lic. Marta Urbina')
    const h = (await nurse.get(`${url()}/history`)).body
    assert.equal(h.length, before + 1)
    assert.equal(h[0].text, '')
    assert.equal(h[1].text, 'Sorda del oído derecho. Hablarle de frente.')
    // Nada se borró ni se editó
    assert.equal(Number((await sql.one(`SELECT COUNT(*)::int AS n FROM patient_team_notes WHERE patient_id = ?`, [pid]))!.n), before + 1)
    assert.match(String((await sql.one(`SELECT action FROM audit WHERE patient_id = ? AND action LIKE '%nota para el equipo%' ORDER BY id DESC LIMIT 1`, [pid]))!.action), /^Quitó la nota para el equipo de /)
    const n = await bootNote('aquiroz@demo.clinara')
    assert.equal(n?.text, '')
    assert.equal(n?.versions, before + 1)
    // Ya está quitada: no se quita dos veces; se puede volver a agregar
    assert.equal((await nurse.put(url(), { text: '' })).status, 400)
    const again = await (await as(DEMO.doctor)).put(url(), { text: NOTE })
    assert.equal(again.body.versions, before + 2)
    assert.match(String((await sql.one(`SELECT action FROM audit WHERE patient_id = ? AND action LIKE '%nota para el equipo%' ORDER BY id DESC LIMIT 1`, [pid]))!.action), /^Agregó la nota para el equipo de /)
  })
})

describe('NP1 (ronda 18): aislamiento y privacidad', () => {
  test('el paciente de otra clínica no existe (404) y su nota no viaja a otra clínica', async () => {
    for (const email of [DEMO.otherDoctor, DEMO.otherNurse, 'ipacheco@demo.clinara']) {
      const c = await as(email)
      assert.equal((await c.put(url(), { text: 'Desde otra clínica' })).status, 404, email)
      assert.equal((await c.get(`${url()}/history`)).status, 404, email)
      const b = await c.get('/api/bootstrap')
      assert.ok(!JSON.stringify(b.body).includes(NOTE), email)
    }
    assert.equal((await (await as(DEMO.doctor)).put('/api/patients/no-existe/team-note', { text: 'x' })).status, 404)
    assert.equal(Number((await sql.one(`SELECT COUNT(*)::int AS n FROM patient_team_notes WHERE clinic_id <> ?`, [DEMO.clinic]))!.n), 0)
  })

  test('sin sesión no se lee ni se cambia', async () => {
    const r = await fetch(`${booted.base}${url()}/history`)
    assert.equal(r.status, 401)
    const w = await fetch(`${booted.base}${url()}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'x' }) })
    assert.equal(w.status, 401)
  })

  test('consultorio: la titular la agrega (en sus dos vistas); la asistente la lee y no la cambia', async () => {
    const p = String((await sql.one(`SELECT id FROM patients WHERE clinic_id = ? AND NOT pending AND merged_into IS NULL ORDER BY id LIMIT 1`, [DEMO.office]))!.id)
    const doc = await as('ipacheco@demo.clinara')
    const r = await doc.put(`/api/patients/${p}/team-note`, { text: 'Prefiere que la llamen por la tarde' })
    assert.equal(r.status, 200, JSON.stringify(r.body))
    assert.equal(r.body.authorName, 'Dra. Isabel Pacheco')
    assert.equal((await doc.post('/api/me/view', { role: 'admin' })).status, 200)
    assert.equal((await doc.put(`/api/patients/${p}/team-note`, { text: 'Prefiere que la llamen por la tarde, al celular' })).status, 200)
    const asst = await as('lcardona@demo.clinara')
    assert.equal((await asst.get(`/api/patients/${p}/team-note/history`)).body.length, 2)
    assert.equal((await asst.put(`/api/patients/${p}/team-note`, { text: 'x' })).status, 403)
  })

  test('no aparece en lo que arma una receta ni una constancia', async () => {
    const doc = await as(DEMO.doctor)
    assert.equal((await bootNote(DEMO.doctor))?.text, NOTE)
    const rx = await doc.get(`/api/prescriptions/${rxId}`)
    assert.equal(rx.status, 200, JSON.stringify(rx.body))
    assert.equal(rx.body.patient.id, pid)
    assert.ok(!JSON.stringify(rx.body).includes(NOTE), 'la receta no trae la nota')
    assert.ok(!('teamNote' in rx.body.patient))
    const cert = await doc.post('/api/certificates', { patientId: pid, kind: 'attention', to: 'A quien interese', visitDate: '2026-11-10' })
    assert.equal(cert.status, 201, JSON.stringify(cert.body))
    const open = await doc.get(`/api/certificates/${cert.body.id}`)
    assert.equal(open.status, 200)
    for (const body of [cert.body, open.body]) assert.ok(!JSON.stringify(body).includes(NOTE), 'la constancia no trae la nota')
    // Tampoco con el expediente: la nota solo llega con la sincronización
    const chart = await doc.get(`/api/patients/${pid}/chart`)
    assert.ok(!JSON.stringify(chart.body).includes(NOTE))
  })
})
