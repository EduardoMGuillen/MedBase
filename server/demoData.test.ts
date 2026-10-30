import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb } from './db.js'
import { createSql, type Sql } from './sql.js'
import { FUNEZ, seedDemo } from './demoData.js'

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

const n = async (q: string, p: unknown[] = []) => Number((await sql.one<{ n: number }>(q, p))!.n)
/** Un domingo a media mañana: el peor caso para «hay actividad todos los días». */
const SUNDAY = (() => { const d = new Date(); d.setDate(d.getDate() + ((7 - d.getDay()) % 7)); d.setHours(10, 30, 0, 0); return d })()
const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

describe('DM1 datos demo', () => {
  test('sólo las clínicas demo quedan marcadas; las demás no se tocan', async () => {
    const flagged = (await sql.query('SELECT id FROM clinics WHERE is_demo ORDER BY id')).map((r) => String(r.id))
    assert.deepEqual(flagged, ['c-al', 'c-sb'])
    const other = await n(`SELECT COUNT(*)::int AS n FROM patients WHERE clinic_id = 'c-sl'`)
    const otherAppts = await n(`SELECT COUNT(*)::int AS n FROM appointments WHERE clinic_id = 'c-sl'`)
    await seedDemo(sql, { now: SUNDAY })
    assert.equal(await n(`SELECT COUNT(*)::int AS n FROM patients WHERE clinic_id = 'c-sl'`), other)
    assert.equal(await n(`SELECT COUNT(*)::int AS n FROM appointments WHERE clinic_id = 'c-sl'`), otherAppts)
    // Usuarios, camas, servicios y vademécum siguen
    assert.ok(await n(`SELECT COUNT(*)::int AS n FROM staff WHERE email = 'lherrera@demo.clinara'`))
    assert.equal(await n(`SELECT COUNT(*)::int AS n FROM beds WHERE clinic_id = 'c-sb'`), 15)
    assert.ok(await n(`SELECT COUNT(*)::int AS n FROM demo_backups`) >= 1, 'respaldo antes de borrar')
  })

  test('un domingo hay citas, sala de espera, listos, en consulta, atendidos, observados, hospitalizados y egresados', async () => {
    const today = day(SUNDAY)
    const status = async (clinic: string, s: string) => n(`SELECT COUNT(*)::int AS n FROM appointments WHERE clinic_id = ? AND start LIKE ? AND status = ?`, [clinic, `${today}%`, s])
    for (const clinic of ['c-sb', 'c-al']) {
      for (const s of ['done', 'in_consult', 'triaged', 'arrived', 'scheduled']) assert.ok(await status(clinic, s) > 0, `${clinic} ${s}`)
      assert.ok(await n(`SELECT COUNT(*)::int AS n FROM appointments WHERE clinic_id = ? AND start LIKE ? AND source = 'walkin' AND status = 'arrived'`, [clinic, `${today}%`]) > 0, 'en sala sin cita')
    }
    assert.ok(await n(`SELECT COUNT(*)::int AS n FROM patients WHERE clinic_id IN ('c-sb', 'c-al')`) >= 150)
    const obs = await n(`SELECT COUNT(*)::int AS n FROM hospitalizations WHERE kind = 'observation' AND status = 'active' AND clinic_id IN ('c-sb', 'c-al')`)
    assert.ok(obs >= 3 && obs <= 4, `observación ${obs}`)
    const hosp = await sql.query(`SELECT specialty, bed_id FROM hospitalizations WHERE kind = 'hospital' AND status = 'active' AND clinic_id = 'c-sb'`)
    assert.ok(hosp.length >= 5 && hosp.length <= 6, `hospitalizados ${hosp.length}`)
    assert.ok(new Set(hosp.map((h) => h.specialty)).size >= 3, 'distintas especialidades')
    assert.equal(new Set(hosp.map((h) => h.bed_id)).size, hosp.length, 'camas distintas')
    // Fiebre en la curva, notas en los dos formatos, órdenes revisadas y pendientes, autorización pendiente
    assert.ok(await n(`SELECT COUNT(*)::int AS n FROM vitals WHERE clinic_id = 'c-sb' AND hospitalization_id IS NOT NULL AND temperature >= 38`) > 0)
    assert.ok(await n(`SELECT COUNT(*)::int AS n FROM hosp_notes WHERE clinic_id = 'c-sb' AND data LIKE '%"format":"dx"%'`) > 0)
    assert.ok(await n(`SELECT COUNT(*)::int AS n FROM hosp_notes WHERE clinic_id = 'c-sb' AND data LIKE '%"format":"soap"%'`) > 0)
    assert.ok(await n(`SELECT COUNT(*)::int AS n FROM order_marks WHERE clinic_id = 'c-sb'`) > 0)
    assert.equal(await n(`SELECT COUNT(*)::int AS n FROM authorizations a JOIN hospitalizations h ON h.id = a.hospitalization_id
      WHERE h.clinic_id = 'c-sb' AND h.status = 'active' AND a.status = 'pending' AND a.template = 'hospital'`), 1)
    assert.ok(await n(`SELECT COUNT(*)::int AS n FROM hosp_notes WHERE clinic_id = 'c-sb' AND kind = 'nursing'`) > 0)
    assert.equal(await n(`SELECT COUNT(*)::int AS n FROM epicrises e JOIN hospitalizations h ON h.id = e.hospitalization_id WHERE h.clinic_id = 'c-sb' AND e.status = 'issued'`), 3)
    const chronic = await n(`SELECT COUNT(DISTINCT patient_id)::int AS n FROM followups WHERE kind = 'chronic' AND clinic_id IN ('c-sb', 'c-al')`)
    assert.ok(chronic >= 20 && chronic <= 30, `crónicos ${chronic}`)
    assert.ok(await n(`SELECT COUNT(*)::int AS n FROM followups WHERE clinic_id = 'c-sb' AND due_date < ?`, [today]) > 0, 'atrasados')
    // 60 días adelante
    const last = new Date(SUNDAY); last.setDate(last.getDate() + 60)
    assert.ok(await n(`SELECT COUNT(*)::int AS n FROM appointments WHERE clinic_id = 'c-sb' AND start LIKE ?`, [`${day(last)}%`]) > 0)
  })

  test('el Dr. Daniel Fúnez entra con su correo y tiene agenda, pacientes y horario de fin de semana', async () => {
    const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: FUNEZ.email, password: DEMO_PASSWORD }) })
    assert.equal(res.status, 200)
    const login = await res.json() as any
    assert.equal(login.user.name, FUNEZ.name)
    assert.equal(login.user.license, 'CMH-10457')
    assert.ok(login.user.schedule.week['0']?.length && login.user.schedule.week['6']?.length)
    assert.ok(await n(`SELECT COUNT(*)::int AS n FROM appointments WHERE doctor_id = ? AND start LIKE ?`, [FUNEZ.id, `${day(SUNDAY)}%`]) > 0)
  })

  test('correrlo dos veces no duplica nada', async () => {
    const count = async () => Promise.all(['patients', 'appointments', 'consultations', 'hospitalizations', 'followups', 'staff'].map((t) => n(`SELECT COUNT(*)::int AS n FROM ${t}`)))
    const first = await count()
    await seedDemo(sql, { now: SUNDAY })
    assert.deepEqual(await count(), first)
    assert.equal(await n(`SELECT COUNT(*)::int AS n FROM staff WHERE email = ?`, [FUNEZ.email]), 1)
  })

  test('la tarea diaria pide el secreto', async () => {
    assert.equal((await fetch(`${base}/api/cron/demo`)).status, 401)
  })
})
