import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { migrateNursePositions, resetQueueViewOnce } from './db.js'
import { type Sql } from './sql.js'
import { currentPeriod, DEFAULT_SUPPLY_SETTINGS } from '../src/lib/supplies.js'
import type { MaterialRecord } from '../src/lib/usage.js'
import type { Appointment } from '../src/lib/types.js'
import { QUEUE_DEFAULT_VIEW, QUEUE_GROUP_ROLES } from '../src/lib/clinicalConfig.js'
import { byArrival } from '../src/lib/arrivals.js'
import { permissionsFor } from '../src/lib/permissions.js'
import { localISODate } from '../src/lib/format.js'
import { bootApp } from './test/helpers.js'

// Ronda 16, recepción, administración y enfermería (RU10, RE2, RE1, EN1): con la base y la API (copia en memoria de la demo)
let sql: Sql
const booted = bootApp(() => { sql = booted.sql })

const as = booted.as
const clinicOfUser = async (email: string) => String((await sql.one(`SELECT clinic_id FROM staff WHERE email = ?`, [email]))!.clinic_id)
const lineOf = async (cid: string, material: string, variant = '') => (await sql.one('SELECT * FROM supply_items WHERE clinic_id = ? AND material = ? AND variant = ?', [cid, material, variant]))!
const firstPatient = async (cid: string) => String((await sql.one('SELECT id FROM patients WHERE clinic_id = ? ORDER BY record LIMIT 1', [cid]))!.id)

describe('RU10 (ronda 16): administración y recepción también registran material', () => {
  const materialBody = async () => {
    const cid = await clinicOfUser('rmoncada@demo.clinara')
    const gasa = await lineOf(cid, 'Gasa estéril', '10 × 10 cm')
    const p = currentPeriod({ period: 'shift', shifts: DEFAULT_SUPPLY_SETTINGS.shifts })
    return { gasa: String(gasa.id), body: { patientId: await firstPatient(cid), day: p.day, shiftKey: p.shiftKey, items: [{ itemId: String(gasa.id), quantity: 1 }] } }
  }

  test('Ricardo Moncada y Andrea Quiroz registran material de un paciente y queda con su nombre; laboratorio e imágenes siguen en 403', async () => {
    const { gasa, body } = await materialBody()
    const win = `from=${encodeURIComponent(new Date(Date.now() - 86_400_000).toISOString())}&to=${encodeURIComponent(new Date(Date.now() + 60_000).toISOString())}`
    for (const [email, name] of [['rmoncada@demo.clinara', 'Ricardo Moncada'], ['aquiroz@demo.clinara', 'Andrea Quiroz']]) {
      const u = await as(email)
      assert.equal((await u.get(`/api/usage/suggest?${win}`)).status, 200, email)
      assert.equal((await u.get('/api/supplies')).status, 200, email)
      const r = await u.post('/api/usage/material', body)
      assert.equal(r.status, 201, `${email}: ${JSON.stringify(r.body)}`)
      const rec = r.body as MaterialRecord
      assert.ok(rec.recordedByName?.includes(name), `${email}: ${rec.recordedByName}`)
      // Corrige su propio registro en el periodo de gracia
      assert.equal((await u.patch(`/api/usage/material/${rec.id}`, { ...body, items: [{ itemId: gasa, quantity: 2 }] })).status, 200, email)
      const list = (await u.get(`/api/usage/material?${win}`)).body.records as MaterialRecord[]
      assert.ok(list.some((x) => x.id === rec.id), email)
    }
    for (const email of ['psuazo@demo.clinara', 'rzepeda@demo.clinara']) assert.equal((await (await as(email)).post('/api/usage/material', body)).status, 403, email)
  })

  test('recepción no anula lo que registró otra persona (usage.void sigue siendo de administración)', async () => {
    const { body } = await materialBody()
    const r = await (await as('murbina@demo.clinara')).post('/api/usage/material', body)
    assert.equal(r.status, 201)
    assert.equal((await (await as('aquiroz@demo.clinara')).post(`/api/usage/material/${r.body.id}/void`, { reason: 'Registro duplicado' })).status, 403)
    assert.equal((await (await as('rmoncada@demo.clinara')).post(`/api/usage/material/${r.body.id}/void`, { reason: 'Registro duplicado' })).status, 200)
  })
})

describe('RE2 (ronda 16): Consulta externa «Por médico» para administración y recepción; el médico, por orden de llegada', () => {
  test('el selector es de administración y recepción, y abre «Por médico»', () => {
    assert.deepEqual([...QUEUE_GROUP_ROLES].sort(), ['admin', 'reception'])
    assert.equal(QUEUE_DEFAULT_VIEW, 'doctor')
  })

  test('la migración borra una sola vez la vista guardada de administración y recepción (no la de otros roles ni otras preferencias)', async () => {
    const idOf = async (email: string) => String((await sql.one('SELECT id FROM staff WHERE email = ?', [email]))!.id)
    const set = async (email: string, prefs: object) => sql.run('UPDATE staff SET prefs = ? WHERE id = ?', [JSON.stringify(prefs), await idOf(email)])
    const prefsOf = async (email: string) => JSON.parse(String((await sql.one('SELECT prefs FROM staff WHERE email = ?', [email]))!.prefs || '{}'))
    await set('rmoncada@demo.clinara', { queueView: 'hour', agendaView: 'week' })
    await set('aquiroz@demo.clinara', { queueView: 'hour' })
    await set('gyanes@demo.clinara', { queueView: 'hour' })
    await set('murbina@demo.clinara', { queueView: 'hour' })
    await sql.run(`DELETE FROM meta WHERE key = 're2_queue_view'`)
    await resetQueueViewOnce(sql)
    assert.deepEqual(await prefsOf('rmoncada@demo.clinara'), { agendaView: 'week' })
    assert.deepEqual(await prefsOf('aquiroz@demo.clinara'), {})
    assert.deepEqual(await prefsOf('gyanes@demo.clinara'), {}, 'recepción y enfermería')
    assert.deepEqual(await prefsOf('murbina@demo.clinara'), { queueView: 'hour' }, 'enfermería no cambia')
    // Lo que elijan después se respeta: la segunda vez no borra nada
    assert.equal((await (await as('aquiroz@demo.clinara')).patch('/api/me', { queueView: 'hour' })).status, 200)
    await resetQueueViewOnce(sql)
    assert.equal((await (await as('aquiroz@demo.clinara')).get('/api/auth/me')).body.user.prefs.queueView, 'hour')
  })

  test('orden de llegada: el primero en llegar arriba; los que no han llegado, después y por hora de cita', () => {
    const a = (id: string, start: string, arrivedAt?: string) => ({ id, start, arrivedAt }) as Appointment
    const list = [a('cita-8', '2026-11-07T08:00', '2026-11-07T14:40:00.000Z'), a('sin-cita', '2026-11-07T08:10', '2026-11-07T14:10:00.000Z'),
      a('cita-9', '2026-11-07T09:00', '2026-11-07T14:30:00.000Z'), a('falta', '2026-11-07T07:30')]
    assert.deepEqual(list.sort(byArrival).map((x) => x.id), ['sin-cita', 'cita-9', 'cita-8', 'falta'])
  })
})

describe('RE1 (ronda 16): «Paciente sin cita» también desde Inicio de administración y de recepción', () => {
  test('administración y recepción registran a un paciente sin cita y queda «En sala»; laboratorio e imágenes, 403', async () => {
    const cid = await clinicOfUser('rmoncada@demo.clinara')
    const free = await sql.query(`SELECT p.id FROM patients p WHERE p.clinic_id = ? AND NOT p.pending
      AND NOT EXISTS (SELECT 1 FROM hospitalizations h WHERE h.patient_id = p.id AND h.discharged_at IS NULL) ORDER BY p.record DESC LIMIT 3`, [cid])
    const doctorId = String((await sql.one(`SELECT id FROM staff WHERE clinic_id = ? AND role = 'doctor' AND active ORDER BY id LIMIT 1`, [cid]))!.id)
    for (const [i, email] of ['rmoncada@demo.clinara', 'aquiroz@demo.clinara'].entries()) {
      const r = await (await as(email)).post('/api/appointments/walk-in', { patientId: String(free[i].id), doctorId, reason: 'Dolor de cabeza' })
      assert.equal(r.status, 201, `${email}: ${JSON.stringify(r.body)}`)
      assert.equal(r.body.status, 'arrived', 'queda en Consulta externa › «En sala»')
      assert.equal(r.body.source, 'walkin')
      assert.ok(r.body.arrivedAt)
    }
    for (const email of ['psuazo@demo.clinara', 'rzepeda@demo.clinara']) {
      assert.equal((await (await as(email)).post('/api/appointments/walk-in', { patientId: String(free[2].id), doctorId, reason: 'Dolor de cabeza' })).status, 403, email)
    }
  })
})

describe('EN1 (ronda 16): las licenciadas en enfermería editan el rol de turnos de enfermería', () => {
  const positionOfEmail = async (email: string) => (await sql.one('SELECT position FROM staff WHERE email = ?', [email]))?.position
  const dayAt = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return localISODate(d) }

  test('la migración dejó el puesto por el prefijo: «Lic.» licenciada; «Aux.» y sin prefijo, auxiliar', async () => {
    assert.equal(await positionOfEmail('murbina@demo.clinara'), 'nurse_lic')
    assert.equal(await positionOfEmail('rvallecillo@demo.clinara'), 'nurse_aux')
    assert.equal(await positionOfEmail('gyanes@demo.clinara'), 'nurse_aux', 'recepción y enfermería, sin prefijo')
    // Idempotente y solo para quien no tiene puesto
    await sql.run(`UPDATE staff SET position = NULL WHERE email = 'murbina@demo.clinara'`)
    await sql.run(`UPDATE staff SET position = 'nurse_lic' WHERE email = 'rvallecillo@demo.clinara'`)
    await migrateNursePositions(sql)
    await migrateNursePositions(sql)
    assert.equal(await positionOfEmail('murbina@demo.clinara'), 'nurse_lic')
    assert.equal(await positionOfEmail('rvallecillo@demo.clinara'), 'nurse_lic', 'lo que Administración puso se respeta')
    await sql.run(`UPDATE staff SET position = 'nurse_aux' WHERE email = 'rvallecillo@demo.clinara'`)
    assert.equal(await positionOfEmail('psuazo@demo.clinara'), 'microbiologist', 'Laboratorio no cambia')
  })

  test('permisos: la licenciada edita, la auxiliar solo ve; en el consultorio no hay rol de turnos', () => {
    assert.ok(permissionsFor('nurse', 'clinic', 'nurse_lic').includes('roster.edit'))
    assert.ok(permissionsFor('nurse', 'clinic', 'nurse_aux').includes('roster.view'))
    assert.ok(!permissionsFor('nurse', 'clinic', 'nurse_aux').includes('roster.edit'))
    assert.ok(!permissionsFor('nurse', 'office', 'nurse_lic').includes('roster.view'))
    assert.ok(!permissionsFor('lab', 'clinic', 'nurse_lic').includes('roster.edit'), 'el puesto de enfermería no suma en otra vista')
    assert.ok(!permissionsFor('nurse', 'clinic', 'microbiologist').includes('dept.config'), 'ni el de Laboratorio en la de enfermería')
    for (const r of ['reception', 'doctor', 'lab', 'imaging'] as const) assert.ok(!permissionsFor(r, 'clinic').includes('roster.view'), r)
  })

  test('Lic. Marta Urbina asigna a Aux. Rosa Vallecillo a la Noche de mañana; queda en la bitácora; no edita días pasados ni otros departamentos', async () => {
    const marta = await as('murbina@demo.clinara')
    const win = `from=${dayAt(-3)}&to=${dayAt(7)}`
    assert.equal((await marta.get(`/api/roster?${win}&dept=nursing`)).status, 200)
    const r = await marta.post('/api/roster', { day: dayAt(1), staffId: 's-vallecillo', dept: 'nursing', shift: 'night' })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    assert.ok((await marta.get(`/api/roster?${win}&dept=nursing`)).body.some((x: { id: string }) => x.id === r.body.id))
    assert.ok(await sql.one(`SELECT 1 FROM audit WHERE user_id = 's-urbina' AND action LIKE 'Rol de turnos (Enfermería): asignó a Aux. Rosa Vallecillo%turno Noche'`))
    // Hoy sí; un día pasado, no (403)
    assert.equal((await marta.post('/api/roster', { day: dayAt(0), staffId: 's-vallecillo', dept: 'nursing', shift: 'morning' })).status, 201)
    const past = await marta.post('/api/roster', { day: dayAt(-1), staffId: 's-vallecillo', dept: 'nursing', shift: 'morning' })
    assert.equal(past.status, 403)
    assert.match(past.body.error ?? JSON.stringify(past.body), /hoy en adelante/)
    // «Repetir turno» no toca los días pasados
    const bulk = await marta.post('/api/roster/bulk', { staffId: 's-vallecillo', dept: 'nursing', shift: 'afternoon', from: dayAt(-2), to: dayAt(2), weekdays: [0, 1, 2, 3, 4, 5, 6] })
    assert.equal(bulk.status, 200)
    assert.equal(bulk.body.added, 3)
    // Quita la asignación (queda en la bitácora)
    assert.equal((await marta.del(`/api/roster/${r.body.id}`)).status, 200)
    assert.ok(await sql.one(`SELECT 1 FROM audit WHERE user_id = 's-urbina' AND action LIKE 'Rol de turnos (Enfermería): quitó a Aux. Rosa Vallecillo%'`))
    // Laboratorio, Imágenes y Médicos: ni ver ni editar
    for (const dept of ['lab', 'imaging', 'doctors']) {
      assert.equal((await marta.get(`/api/roster?${win}&dept=${dept}`)).status, 403, dept)
      assert.equal((await marta.post('/api/roster', { day: dayAt(1), staffId: 's-erazo', dept, shift: 'night' })).status, 403, dept)
    }
  })

  test('Aux. Rosa Vallecillo ve el rol de enfermería pero no lo edita (403 por URL directa); recepción y laboratorio no lo ven', async () => {
    const rosa = await as('rvallecillo@demo.clinara')
    const win = `from=${dayAt(-3)}&to=${dayAt(7)}`
    assert.equal((await rosa.get(`/api/roster?${win}&dept=nursing`)).status, 200)
    assert.equal((await rosa.post('/api/roster', { day: dayAt(2), staffId: 's-vallecillo', dept: 'nursing', shift: 'night' })).status, 403)
    assert.equal((await rosa.post('/api/roster/bulk', { staffId: 's-vallecillo', dept: 'nursing', shift: 'night', from: dayAt(1), to: dayAt(3), weekdays: [0, 1, 2, 3, 4, 5, 6] })).body.added, 0)
    const any = (await sql.one(`SELECT id FROM duty_roster WHERE dept = 'nursing' AND removed_at IS NULL LIMIT 1`))!
    assert.equal((await rosa.del(`/api/roster/${any.id}`)).status, 403)
    for (const email of ['aquiroz@demo.clinara', 'psuazo@demo.clinara', 'vsolorzano@demo.clinara']) assert.equal((await (await as(email)).get(`/api/roster?${win}&dept=nursing`)).status, 403, email)
    // Administración edita cualquier día, como hoy
    assert.equal((await (await as('rmoncada@demo.clinara')).post('/api/roster', { day: dayAt(-1), staffId: 's-vallecillo', dept: 'nursing', shift: 'night' })).status, 201)
  })

  test('Personal y roles: el puesto se elige al crear o editar a una enfermera, y el cambio queda en la bitácora', async () => {
    const admin = await as('rmoncada@demo.clinara')
    const created = await admin.post('/api/staff', { name: 'Lic. Karla Mejía', role: 'nurse', email: 'kmejia@en1.test', position: 'nurse_lic' })
    assert.equal(created.status, 201, JSON.stringify(created.body))
    assert.equal(created.body.user.position, 'nurse_lic')
    const plain = await admin.post('/api/staff', { name: 'Sonia Paz', role: 'nurse', email: 'spaz@en1.test' })
    assert.equal(plain.body.user.position, 'nurse_aux', 'sin elegir: auxiliar')
    assert.equal((await admin.post('/api/staff', { name: 'Otra Persona', role: 'nurse', email: 'otra@en1.test', position: 'microbiologist' })).status, 400)
    const up = await admin.patch(`/api/staff/${plain.body.user.id}`, { position: 'nurse_lic' })
    assert.equal(up.status, 200, JSON.stringify(up.body))
    assert.equal(up.body.position, 'nurse_lic')
    assert.ok(await sql.one(`SELECT 1 FROM audit WHERE action LIKE 'Cambió el cargo (Auxiliar de enfermería → Licenciado(a) en enfermería) de Sonia Paz'`))
    // Pasa de Enfermería a Laboratorio: el cargo es el de Laboratorio
    const lab = await admin.patch(`/api/staff/${plain.body.user.id}`, { roles: ['lab'], position: 'lab_tech' })
    assert.equal(lab.status, 200, JSON.stringify(lab.body))
    assert.equal(lab.body.position, 'lab_tech')
    // Y de vuelta a Enfermería sin elegir puesto: auxiliar
    const back = await admin.patch(`/api/staff/${plain.body.user.id}`, { roles: ['nurse'], position: null })
    assert.equal(back.status, 200, JSON.stringify(back.body))
    assert.equal(back.body.position, 'nurse_aux')
    assert.equal((await (await as('murbina@demo.clinara')).patch(`/api/staff/${plain.body.user.id}`, { position: 'nurse_lic' })).status, 403, 'solo Administración')
  })
})
