import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { DEMO_PASSWORD } from './db.js'
import { type Sql } from './sql.js'
import bcrypt from 'bcryptjs'
import { MEMBRENO } from './demoData.js'
import { can, permissionsFor } from '../src/lib/permissions.js'
import { tourFor } from '../src/lib/tours.js'
import { NAV, sidebarFor } from '../src/lib/nav.js'
import type { ClinicKind, Role } from '../src/lib/types.js'
import { bootApp } from './test/helpers.js'

// Ronda 17, perfiles (PF1, AD1, PF2): con la base y la API (copia en memoria de la demo)
let sql: Sql
const booted = bootApp(async () => {
  sql = booted.sql
  // Dr. Joaquín Membreño (Medicina general; lo agrega la demo diaria): médico de la clínica principal
  if (!(await sql.one('SELECT 1 FROM staff WHERE id = ?', [MEMBRENO.id]))) {
    await sql.run(`INSERT INTO staff (id, name, role, roles, specialty, email, license, color, active, password_hash, clinic_id) VALUES (?,?,'doctor',?,?,?,?,?,TRUE,?,?)`,
      [MEMBRENO.id, MEMBRENO.name, JSON.stringify(['doctor']), MEMBRENO.specialty, MEMBRENO.email, MEMBRENO.license, '#9A5B13', bcrypt.hashSync(DEMO_PASSWORD, 10), 'c-sb'])
  }
})

const as = booted.as
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

  test('cualquier médico de la clínica (Dermatología, Medicina general, médico y administración en su vista de médico) registra un paciente sin cita consigo', async () => {
    const cid = await clinicOfUser('tgalvez@demo.clinara')
    const free = await freePatients(cid, 6)
    let i = 0
    for (const [email, id] of [['tgalvez@demo.clinara', 's-galvez'], ['jmembreno@demo.clinara', MEMBRENO.id], ['mvilleda@demo.clinara', 's-villeda'], ['hnolasco@demo.clinara', 's-nolasco']]) {
      const doc = await as(email)
      const me = await doc.get('/api/auth/me')
      assert.equal(me.status, 200, `${email} entra sin código`)
      if (me.body.user.role !== 'doctor') assert.equal((await doc.post('/api/me/view', { role: 'doctor' })).status, 200)
      // Paciente nuevo desde la misma ventana («Registrar paciente nuevo»: patients.manage)
      const p = await doc.post('/api/patients', { firstName: `Sin cita ${i}`, lastName: 'Ronda Diecisiete', birthDate: '1990-05-05', sex: 'F', phone: '9999-0000' })
      assert.equal(p.status, 201, `${email}: ${JSON.stringify(p.body)}`)
      for (const pid of [free[i], String(p.body.id)]) {
        const r = await doc.post('/api/appointments/walk-in', { patientId: pid, doctorId: id, reason: 'Consulta sin cita' })
        assert.equal(r.status, 201, `${email}: ${JSON.stringify(r.body)}`)
        assert.equal(r.body.doctorId, id)
        assert.equal(r.body.status, 'arrived')
      }
      i++
    }
  })

  test('el recorrido del médico de la clínica señala «Paciente sin cita»', () => {
    assert.ok(tourFor('doctor', 'clinic').some((s) => s.target === 'sin-cita'))
  })
})

describe('AD1 (ronda 17): administración y recepción, Observación y Laboratorio e imágenes', () => {
  test('permisos: Observación en solo lectura y bandejas en solo lectura, solo administración de la clínica', () => {
    const adm = permissionsFor('admin', 'clinic')
    assert.ok(adm.includes('observation.board') && adm.includes('dept.view') && adm.includes('ambulatory.register'))
    assert.ok(!adm.includes('inpatient.view') && !adm.includes('chart.view') && !adm.includes('dept.work') && !adm.includes('exams.process'), 'sin expediente ni trabajo de bandeja')
    const office = permissionsFor('admin', 'office')
    assert.ok(!office.includes('observation.board') && !office.includes('dept.view'), 'consultorio: no aplica (MI1)')
    const rec = permissionsFor('reception', 'clinic')
    assert.ok(rec.includes('ambulatory.register') && rec.includes('observation.board') && !rec.includes('dept.view'))
    assert.ok(!rec.includes('inpatient.view') && !rec.includes('chart.view'), 'recepción sin expediente')
  })

  test('administración y recepción ven la lista de Observación sin diagnósticos y no abren el expediente', async () => {
    const cid = await clinicOfUser('rmoncada@demo.clinara')
    const obs = await sql.query(`SELECT id FROM hospitalizations WHERE clinic_id = ? AND status = 'active' AND kind = 'observation'`, [cid])
    assert.ok(obs.length > 0, 'la demo trae pacientes en observación')
    for (const email of ['rmoncada@demo.clinara', 'aquiroz@demo.clinara']) {
      const u = await as(email)
      const r = await u.get('/api/observation/board')
      assert.equal(r.status, 200, email)
      assert.equal(r.body.length, obs.length, email)
      for (const row of r.body) {
        assert.ok(row.patientId && row.since && row.doctorIds.length, JSON.stringify(row))
        for (const k of ['diagnoses', 'reason', 'notes', 'meds', 'vitals']) assert.equal(row[k], undefined, k)
      }
      assert.equal((await u.get(`/api/inpatient/${String(obs[0].id)}`)).status, 403, `${email}: no abre el expediente`)
      assert.equal((await u.get('/api/inpatient/alerts')).status, 403, email)
    }
    for (const email of ['psuazo@demo.clinara', 'echinchilla@demo.clinara']) assert.equal((await (await as(email)).get('/api/observation/board')).status, 403, email)
    assert.equal((await (await as('murbina@demo.clinara')).get('/api/observation/board')).status, 200, 'enfermería (inpatient.view)')
  })

  test('«Pacientes ambulatorios»: nombre del examen y estado, nunca los valores; prohibido sin ambulatory.register', async () => {
    const cid = await clinicOfUser('aquiroz@demo.clinara')
    const [pid] = await freePatients(cid, 1)
    const rec = await as('aquiroz@demo.clinara')
    const reg = await rec.post('/api/dept/ambulatory', { patientId: pid, group: 'lab', exams: [{ group: 'lab', name: 'Glucosa', priority: 'routine', place: 'clinic' }], requestedByName: 'Dr. Externo' })
    assert.equal(reg.status, 201, JSON.stringify(reg.body))
    const examId = String(reg.body.exams[0].id)
    const lab = await as('psuazo@demo.clinara')
    const res = await lab.post(`/api/exams/${examId}/result`, { values: [{ analyte: 'Glucosa', value: 'VALSECRETO', unit: 'mg/dL' }], report: 'INFORME-SECRETO' })
    assert.equal(res.status, 200, JSON.stringify(res.body))
    for (const email of ['aquiroz@demo.clinara', 'rmoncada@demo.clinara']) {
      const r = await (await as(email)).get('/api/dept/ambulatory')
      assert.equal(r.status, 200, email)
      const mine = r.body.patients.find((x: any) => x.patient.id === pid)
      assert.ok(mine, email)
      const e = mine.exams.find((x: any) => x.id === examId)
      assert.equal(e.name, 'Glucosa')
      assert.equal(e.stage, 'ready')
      const text = JSON.stringify(r.body)
      assert.ok(!text.includes('VALSECRETO') && !text.includes('INFORME-SECRETO') && !text.includes('"result"') && !text.includes('"values"'), `${email}: sin resultados`)
    }
    for (const email of ['vsolorzano@demo.clinara', 'murbina@demo.clinara']) assert.equal((await (await as(email)).get('/api/dept/ambulatory')).status, 403, email)
    // Las bandejas en solo lectura: administración ve el estudio pero no el resultado; no toma muestras, no carga resultados
    const adm = await as('rmoncada@demo.clinara')
    const tray = await adm.get('/api/dept/tray?group=lab')
    assert.equal(tray.status, 200)
    const item = tray.body.items.find((x: any) => x.id === examId)
    assert.ok(item, 'el estudio está en la bandeja')
    assert.equal(item.result, undefined)
    assert.ok(!JSON.stringify(tray.body).includes('VALSECRETO'))
    assert.equal((await adm.get('/api/dept/tray?group=imaging')).status, 200)
    assert.equal((await adm.post(`/api/exams/${examId}/status`, { status: 'sample' })).status, 403)
    assert.equal((await adm.post(`/api/exams/${examId}/result`, { values: [{ analyte: 'Glucosa', value: '1' }] })).status, 403)
    assert.equal((await adm.post(`/api/exams/${examId}/not-done`, { reason: 'No vino' })).status, 403)
    assert.equal((await (await as('aquiroz@demo.clinara')).get('/api/dept/tray?group=lab')).status, 403, 'recepción no ve las bandejas')
    // Laboratorio sí ve el resultado en su bandeja
    assert.ok(JSON.stringify((await lab.get('/api/dept/tray?group=lab')).body).includes('VALSECRETO'))
  })
})

describe('PF2 (ronda 17): la barra lateral de cada perfil, por flujo de trabajo', () => {
  const PROFILES: [string, Role, ClinicKind, string?][] = [
    ['admin', 'admin', 'clinic'], ['doctor', 'doctor', 'clinic'], ['nurse_lic', 'nurse', 'clinic', 'nurse_lic'], ['nurse_aux', 'nurse', 'clinic', 'nurse_aux'],
    ['reception', 'reception', 'clinic'], ['microbiologist', 'lab', 'clinic', 'microbiologist'], ['lab_tech', 'lab', 'clinic', 'lab_tech'],
    ['radiologist', 'imaging', 'clinic', 'radiologist'], ['imaging_tech', 'imaging', 'clinic', 'imaging_tech'],
    ['office doctor', 'doctor', 'office'], ['office admin', 'admin', 'office'], ['office nurse', 'nurse', 'office'], ['office assistant', 'assistant', 'office'],
  ]
  // MN1 (ronda 18): antes de «Pacientes» va «Agenda y cobros» (o «Agenda», sin cobro)
  const ORDER = ['', 'Agenda y cobros', 'Agenda', 'Pacientes', 'Laboratorio e imágenes', 'Laboratorio', 'Imágenes', 'Registros', 'Administración', 'Mi consultorio']

  test('los grupos van en el orden del pedido y cada entrada la puede usar su rol', () => {
    for (const [name, role, kind, pos] of PROFILES) {
      const items = sidebarFor({ role, kind, position: pos })
      const ranks = items.map((i) => ORDER.indexOf(i.group ?? ''))
      assert.ok(ranks.every((r) => r >= 0), `${name}: grupo desconocido ${JSON.stringify(items.map((i) => i.group))}`)
      assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), `${name}: orden de los grupos`)
      assert.equal(items[0].to, '/app', name)
      assert.ok(!items.some((i) => i.group === 'Departamento'), `${name}: ya no hay grupo «Departamento»`)
      const perms = permissionsFor(role, kind, pos)
      for (const i of items) {
        const n = NAV.find((x) => x.to === i.to)!
        assert.ok(!n.perm || perms.includes(n.perm) || n.anyPerm?.some((p) => perms.includes(p)), `${name}: ${i.to}`)
      }
    }
  })

  test('cada rol ve lo suyo en cada grupo', () => {
    const to = (role: Role, kind: ClinicKind, pos?: string) => sidebarFor({ role, kind, position: pos }).map((i) => i.to)
    const lab = (role: Role, kind: ClinicKind, pos?: string) => sidebarFor({ role, kind, position: pos }).filter((i) => /^Laboratorio|^Imágenes/.test(i.group ?? '')).map((i) => i.to)
    assert.deepEqual(lab('admin', 'clinic'), ['/app/pacientes-ambulatorios', '/app/laboratorio', '/app/imagenes'])
    assert.deepEqual(lab('reception', 'clinic'), ['/app/pacientes-ambulatorios'])
    assert.deepEqual(lab('doctor', 'clinic'), [])
    assert.deepEqual(lab('admin', 'office'), [], 'un consultorio no tiene Laboratorio ni Imágenes')
    assert.ok(!permissionsFor('admin', 'office').includes('ambulatory.register'))
    assert.deepEqual(lab('lab', 'clinic', 'lab_tech'), ['/app/laboratorio/ambulatorio', '/app/laboratorio/observacion', '/app/laboratorio/hospitalizacion', '/app/configuracion-laboratorio'])
    assert.equal(sidebarFor({ role: 'lab', kind: 'clinic' }).find((i) => i.to === '/app/rol-de-turnos')?.group, 'Registros')
    assert.ok(to('admin', 'clinic').includes('/app/observacion') && to('reception', 'clinic').includes('/app/observacion'))
    assert.ok(!to('admin', 'office').includes('/app/observacion'), 'MI1: en el consultorio lo clínico va en la vista de médico')
    assert.ok(!to('nurse', 'office').includes('/app/rol-de-turnos-enfermeria'), 'un consultorio no tiene rol de turnos')
    assert.equal(sidebarFor({ role: 'admin', kind: 'office' }).find((i) => i.to === '/app/configuracion')?.label, 'Configuración del consultorio')
  })
})
