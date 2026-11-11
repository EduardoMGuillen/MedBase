import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { DEMO_PASSWORD, resetDemo } from './db.js'
import { seedDemo } from './demoData.js'
import { EXTRA_DEMO_USERS, PENDING_OFFICE, SUSPENDED_CLINIC } from './demoUsers.js'
import { type Sql } from './sql.js'
import { bootApp } from './test/helpers.js'

let sql: Sql
let base = ''

const booted = bootApp(() => { sql = booted.sql; base = booted.base })

async function as(email: string, extra: Record<string, string> = {}) {
  const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: DEMO_PASSWORD, ...extra }) })
  const cookie = res.headers.get('set-cookie')?.split(';')[0] ?? ''
  const call = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(`${base}${path}`, { method, headers: { cookie, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    return { status: r.status, body: await r.json() as any }
  }
  return { status: res.status, login: await res.json() as any, get: (p: string) => call('GET', p), post: (p: string, b?: unknown) => call('POST', p, b) }
}

/** Los 18 usuarios demo anteriores: ninguno debe quedar en la base. */
const OLD_EMAILS = ['superadmin', 'admin', 'lherrera', 'apaz', 'mzuniga', 'crios', 'smejia', 'admin.sanlucas', 'erosales', 'penamorado', 'icalix', 'alopez',
  'asistente', 'dfunez', 'gordonez', 'krivera', 'mcastellanos', 'pandino'].map((e) => `${e}@demo.clinara`)
const OLD_IDS = ['s-super', 's-admin', 's-herrera', 's-paz', 's-zuniga', 's-rios', 's-mejia', 's2-admin', 's2-rosales', 's2-enamorado', 's2-calix', 's3-lopez',
  's3-asistente', 's-funez', 's-ordonez', 's-rivera', 's-castellanos', 's-andino']

describe('usuarios demo v2', () => {
  test('no queda ninguno de los usuarios demo anteriores', async () => {
    const rows = await sql.query(`SELECT id FROM staff WHERE id IN (${OLD_IDS.map(() => '?').join(',')}) OR lower(email) IN (${OLD_EMAILS.map(() => '?').join(',')})`, [...OLD_IDS, ...OLD_EMAILS])
    assert.deepEqual(rows, [])
    for (const e of OLD_EMAILS) assert.equal((await as(e)).status, 401, e)
  })

  test('cada usuario de los casos nuevos existe en su clínica con sus roles', async () => {
    for (const u of EXTRA_DEMO_USERS) {
      const r = await sql.one('SELECT clinic_id, roles, active FROM staff WHERE id = ? AND lower(email) = ?', [u.id, u.email])
      assert.ok(r, u.email)
      assert.equal(r!.clinic_id, u.clinicId, u.email)
      assert.deepEqual(JSON.parse(String(r!.roles)), u.roles, u.email)
      assert.equal(r!.active, u.active ?? true, u.email)
    }
  })

  test('todas las cuentas activas entran con demo1234 (sin contar las que prueban un rechazo o piden código)', async () => {
    const rows = await sql.query(`SELECT s.email FROM staff s LEFT JOIN clinics c ON c.id = s.clinic_id
      WHERE s.email LIKE '%@demo.clinara' AND s.active AND NOT s.totp_enabled AND (c.id IS NULL OR c.active)`)
    assert.ok(rows.length >= 25, `solo ${rows.length} cuentas`)
    for (const r of rows) assert.equal((await as(String(r.email))).status, 200, String(r.email))
  })

  test('cuenta desactivada: el login la rechaza y no aparece en la reserva en línea', async () => {
    const s = await as('joseguera@demo.clinara')
    assert.equal(s.status, 403)
    assert.match(s.login.error, /desactivada/)
    const clinic = await (await fetch(`${base}/api/public/santa-brigida/clinic`)).json() as any
    assert.ok(!clinic.doctors.some((d: any) => d.id === 's-oseguera'))
  })

  test('clínica suspendida: su personal no entra', async () => {
    assert.equal((await sql.one('SELECT active FROM clinics WHERE id = ?', [SUSPENDED_CLINIC]))!.active, false)
    const s = await as('prodezno@demo.clinara')
    assert.equal(s.status, 403)
    assert.match(s.login.error, /clínica está desactivada/)
  })

  test('ronda 17: la Dra. Gálvez (Dermatología) entra sin código de verificación', async () => {
    const r = await as('tgalvez@demo.clinara')
    assert.equal(r.status, 200)
    assert.equal(r.login.twoFactor, undefined)
    assert.equal(r.login.user.name, 'Dra. Teresa Gálvez')
  })

  test('el director médico tiene médico y administración; recepción y enfermería en una sola persona', async () => {
    const v = await as('mvilleda@demo.clinara')
    assert.deepEqual([...v.login.user.roles].sort(), ['admin', 'doctor'])
    const y = await as('gyanes@demo.clinara')
    assert.deepEqual([...y.login.user.roles].sort(), ['nurse', 'reception'])
  })

  test('la anestesióloga no tiene horario ni horas en la reserva, y la demo diaria no le agenda citas', async () => {
    assert.equal((await sql.one(`SELECT schedule FROM staff WHERE id = 's-arita'`))!.schedule, null)
    const { slots } = await (await fetch(`${base}/api/public/santa-brigida/slots?doctorId=s-arita&date=${new Date().toISOString().slice(0, 10)}`)).json() as any
    assert.deepEqual(slots ?? [], [])
    await seedDemo(sql)
    assert.equal((await sql.one(`SELECT schedule FROM staff WHERE id = 's-arita'`))!.schedule, null)
    assert.equal(Number((await sql.one(`SELECT COUNT(*)::int AS n FROM appointments WHERE doctor_id = 's-arita'`))!.n), 0)
    // Los médicos nuevos con horario sí reciben citas de hoy
    for (const id of ['s-villeda', 's-nolasco', 's-galvez']) {
      assert.ok(Number((await sql.one(`SELECT COUNT(*)::int AS n FROM appointments WHERE doctor_id = ?`, [id]))!.n) > 0, id)
    }
    assert.equal(Number((await sql.one(`SELECT COUNT(*)::int AS n FROM appointments WHERE doctor_id = 's-oseguera'`))!.n), 0)
  })

  test('el consultorio está en su máximo de 2 asistentes: una tercera da error', async () => {
    const doc = await as('ipacheco@demo.clinara')
    // La titular entra como médica; para dar de alta personal cambia a la vista de administración
    assert.equal((await doc.post('/api/me/view', { role: 'admin' })).status, 200)
    const r = await doc.post('/api/staff', { name: 'Tercera Asistente', role: 'assistant', email: 'tercera@demo.clinara' })
    assert.equal(r.status, 400)
    assert.match(r.body.error, /2 asistentes/)
    await doc.post('/api/me/view', { role: 'doctor' })
  })

  test('el consultorio sin configurar abre el asistente; su titular es médico y administración', async () => {
    const c = await sql.one('SELECT kind, owner_id, setup_done_at, is_demo FROM clinics WHERE id = ?', [PENDING_OFFICE])
    assert.equal(c!.kind, 'office'); assert.equal(c!.owner_id, 's5-trochez'); assert.equal(c!.setup_done_at, null)
    const t = await as('ltrochez@demo.clinara')
    assert.equal(t.status, 200)
    const boot = await t.get('/api/bootstrap')
    assert.equal(boot.body.settings.setupDoneAt, undefined)
    assert.deepEqual([...t.login.user.roles].sort(), ['admin', 'doctor'])
  })

  test('el login muestra las cuentas demo nuevas y no las que prueban un rechazo', async () => {
    const { accounts } = await (await fetch(`${base}/api/demo-accounts`)).json() as any
    const emails = accounts.map((a: any) => a.email)
    for (const e of ['mvilleda', 'hnolasco', 'sarita', 'tgalvez', 'rvallecillo', 'gyanes', 'arodas']) assert.ok(emails.includes(`${e}@demo.clinara`), e)
    for (const e of ['joseguera', 'prodezno']) assert.ok(!emails.includes(`${e}@demo.clinara`), e)
  })

  test('restablecer la demo vuelve a crear los mismos usuarios (idempotente)', async () => {
    // El Dr. Membreño y el personal de Laboratorio e Imágenes los agrega la demo diaria (seedDemo), que corre después del reinicio
    const count = async () => Number((await sql.one(`SELECT COUNT(*)::int AS n FROM staff`))!.n)
    const before = await count()
    await resetDemo(sql)
    await seedDemo(sql)
    assert.equal(await count(), before)
    for (const u of EXTRA_DEMO_USERS) assert.ok(await sql.one('SELECT 1 FROM staff WHERE id = ?', [u.id]), u.id)
  })
})
