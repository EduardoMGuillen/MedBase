import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb } from './db.js'
import { createSql, type Sql } from './sql.js'
import { FUNEZ, seedDemo } from './demoData.js'
import { fileAlerts } from '../src/lib/alerts.js'
import { bandOf } from '../src/lib/vitalsSheet.js'
import { slotsOn } from '../src/lib/schedule.js'

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
    // Ronda 5: al menos 3 en observación en la clínica, con médicos distintos (y uno en el consultorio)
    const obs = await sql.query(`SELECT admitted_by FROM hospitalizations WHERE kind = 'observation' AND status = 'active' AND clinic_id = 'c-sb'`)
    assert.ok(obs.length >= 3, `observación ${obs.length}`)
    assert.ok(new Set(obs.map((h) => h.admitted_by)).size >= 3, 'médicos distintos')
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

describe('DM1 ronda 5: los mínimos del pedido', () => {
  test('conteos de la clínica y del consultorio, casos de OB1, OB2 y MC6, Dr. Fúnez, expedientes desde EXP-00001 y la bitácora', async () => {
    const now = new Date()
    const sum = await seedDemo(sql, { now })
    const today = day(now)
    const counts: Record<string, unknown> = {}
    // Clínica Santa Brígida
    const docs = (await sql.query(`SELECT id, name FROM staff WHERE clinic_id = 'c-sb' AND roles LIKE '%doctor%' AND active ORDER BY name`)).map((r) => ({ id: String(r.id), name: String(r.name) }))
    assert.ok(await n(`SELECT COUNT(*)::int AS n FROM patients WHERE clinic_id = 'c-sb'`) >= 60)
    for (const d of docs) {
      const own = await n(`SELECT COUNT(DISTINCT patient_id)::int AS n FROM appointments WHERE doctor_id = ?`, [d.id])
      const todayN = await n(`SELECT COUNT(*)::int AS n FROM appointments WHERE doctor_id = ? AND start LIKE ? AND status <> 'cancelled'`, [d.id, `${today}%`])
      const waiting = await n(`SELECT COUNT(*)::int AS n FROM appointments WHERE doctor_id = ? AND start LIKE ? AND status = 'arrived'`, [d.id, `${today}%`])
      counts[d.name] = { pacientes: own, citasHoy: todayN, enSala: waiting }
      assert.ok(own >= 8, `${d.name}: ${own} pacientes propios`)
      assert.ok(todayN >= 6, `${d.name}: ${todayN} citas hoy`)
      assert.ok(waiting >= 1, `${d.name}: nadie en sala`)
      // En los próximos 14 días, al menos 3 citas cada día que el médico atiende (su horario no se toca)
      const schedule = JSON.parse(String((await sql.one('SELECT schedule FROM staff WHERE id = ?', [d.id]))!.schedule))
      for (let off = 1; off <= 14; off++) {
        const x = new Date(now); x.setDate(x.getDate() + off)
        if (slotsOn(schedule, day(x)).length < 3) continue
        assert.ok(await n(`SELECT COUNT(*)::int AS n FROM appointments WHERE doctor_id = ? AND start LIKE ?`, [d.id, `${day(x)}%`]) >= 3, `${d.name}: menos de 3 citas el ${day(x)}`)
      }
    }
    const statuses = (await sql.query(`SELECT DISTINCT status FROM appointments WHERE clinic_id = 'c-sb' AND start LIKE ?`, [`${today}%`])).map((r) => String(r.status)).sort()
    assert.deepEqual(statuses, ['arrived', 'confirmed', 'done', 'in_consult', 'no_show', 'scheduled', 'triaged'])
    assert.ok(await n(`SELECT COUNT(*)::int AS n FROM appointments WHERE clinic_id = 'c-sb' AND start LIKE ? AND status = 'arrived'`, [`${today}%`]) >= 6, 'sala de espera')
    assert.ok(await n(`SELECT COUNT(*)::int AS n FROM payments WHERE clinic_id = 'c-sb' AND method = 'cash'`) > 0)
    assert.ok(await n(`SELECT COUNT(*)::int AS n FROM payments WHERE clinic_id = 'c-sb' AND method = 'transfer'`) > 0)
    assert.ok(await n(`SELECT COUNT(*)::int AS n FROM followups WHERE clinic_id = 'c-sb' AND kind = 'chronic'`) >= 12)
    assert.ok(await n(`SELECT COUNT(*)::int AS n FROM followups WHERE clinic_id = 'c-sb' AND notified_at IS NULL`) > 0, 'recordatorios pendientes sin enviar')
    // OB1: una observación con dosis atrasada de ayer y una no aplicada con aviso; otra con todo al día; las dos con tomas pendientes
    const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'crios@demo.clinara', password: DEMO_PASSWORD }) })
    const cookie = login.headers.get('set-cookie')!.split(';')[0]
    const file = async (id: string) => (await (await fetch(`${base}/api/inpatient/${id}`, { headers: { cookie } })).json()) as any
    const startToday = new Date(now); startToday.setHours(0, 0, 0, 0)
    const obsFiles = await Promise.all((await sql.query(`SELECT id FROM hospitalizations WHERE kind = 'observation' AND status = 'active' AND clinic_id = 'c-sb'`)).map((r) => file(String(r.id))))
    const alertsOf = (f: any) => fileAlerts(f, bandOf({}), now)
    const ob1 = obsFiles.find((f) => alertsOf(f).some((a) => a.key.startsWith('late-') && a.since < startToday.getTime()))
    assert.ok(ob1, 'una dosis atrasada de ayer')
    assert.ok(alertsOf(ob1).some((a) => a.key.startsWith('skip-') && /no aplicada/.test(a.text)), 'una no aplicada con aviso')
    assert.ok(alertsOf(ob1).some((a) => a.key === 'vitals-missed'), 'tomas pendientes')
    const upToDate = obsFiles.find((f) => f !== ob1 && !alertsOf(f).some((a) => a.key.startsWith('late-')) && alertsOf(f).some((a) => a.key === 'vitals-missed'))
    assert.ok(upToDate, 'otra con las dosis al día y una toma pendiente')
    // OB2 y MC6: hospitalizados con signos de 3 días o más; un resultado crítico; autorizaciones en todos los estados
    const hosp = await sql.query(`SELECT id, admitted_at FROM hospitalizations WHERE kind = 'hospital' AND status = 'active' AND clinic_id = 'c-sb'`)
    let longVitals = 0
    for (const h of hosp) {
      const v = await n(`SELECT COUNT(*)::int AS n FROM vitals WHERE hospitalization_id = ?`, [String(h.id)])
      if (now.getTime() - new Date(String(h.admitted_at)).getTime() >= 3 * 864e5 && v >= 4) longVitals++
    }
    assert.ok(longVitals >= 3, `${longVitals} hospitalizados con 3 días o más de signos`)
    assert.ok(await n(`SELECT COUNT(*)::int AS n FROM exam_orders WHERE clinic_id = 'c-sb' AND critical AND status = 'result'`) >= 1, 'resultado crítico')
    const auth = async (where: string) => n(`SELECT COUNT(*)::int AS n FROM authorizations a JOIN hospitalizations h ON h.id = a.hospitalization_id WHERE h.clinic_id = 'c-sb' AND h.status = 'active' AND a.archived_at IS NULL AND ${where}`)
    assert.ok(await auth(`a.status = 'signed' AND a.method = 'virtual' AND a.pdf_id IS NOT NULL`) >= 1, 'firmada en pantalla')
    assert.ok(await auth(`a.status = 'pending'`) >= 2, 'pendientes de firma')
    assert.equal(await auth(`a.status = 'refused'`), 1, 'No autoriza')
    assert.ok(await auth(`a.file_id IS NOT NULL`) >= 1, 'con hoja de papel')
    // Camas: una por hospitalizado
    assert.equal(await n(`SELECT COUNT(DISTINCT bed_id)::int AS n FROM hospitalizations WHERE clinic_id = 'c-sb' AND kind = 'hospital' AND status = 'active'`), hosp.length)
    // Dr. Fúnez: una vez, de lunes a domingo 08 a 12 y 13 a 17, con turno todos los días del mes
    assert.equal(await n(`SELECT COUNT(*)::int AS n FROM staff WHERE email = ?`, [FUNEZ.email]), 1)
    const sched = JSON.parse(String((await sql.one('SELECT schedule FROM staff WHERE id = ?', [FUNEZ.id]))!.schedule))
    for (const d of ['0', '1', '2', '3', '4', '5', '6']) assert.deepEqual(sched.week[d], [{ start: '08:00', end: '12:00' }, { start: '13:00', end: '17:00' }], `día ${d}`)
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    assert.equal(await n(`SELECT COUNT(DISTINCT day)::int AS n FROM duty_roster WHERE staff_id = ? AND removed_at IS NULL AND day LIKE ?`, [FUNEZ.id, `${day(now).slice(0, 7)}%`]), daysInMonth)
    // Expedientes desde EXP-00001, sin duplicados
    for (const c of ['c-sb', 'c-al']) {
      assert.equal(await n(`SELECT COUNT(*)::int AS n FROM patients WHERE clinic_id = ? AND record = 'EXP-00001'`, [c]), 1)
      assert.equal(await n(`SELECT COUNT(*)::int AS n FROM (SELECT record FROM patients WHERE clinic_id = ? GROUP BY record HAVING COUNT(*) > 1) x`, [c]), 0)
    }
    // Filtros de la biblioteca: mujeres, hombres, niños, adultos mayores y crónicos
    const born = (years: number) => { const x = new Date(now); x.setFullYear(x.getFullYear() - years); return day(x) }
    assert.ok(await n(`SELECT COUNT(*)::int AS n FROM patients WHERE clinic_id = 'c-sb' AND sex = 'F'`) > 0)
    assert.ok(await n(`SELECT COUNT(*)::int AS n FROM patients WHERE clinic_id = 'c-sb' AND sex = 'M'`) > 0)
    assert.ok(await n(`SELECT COUNT(*)::int AS n FROM patients WHERE clinic_id = 'c-sb' AND birth_date > ?`, [born(18)]) > 0)
    assert.ok(await n(`SELECT COUNT(*)::int AS n FROM patients WHERE clinic_id = 'c-sb' AND birth_date <= ?`, [born(60)]) > 0)
    assert.ok(await n(`SELECT COUNT(*)::int AS n FROM patients WHERE clinic_id = 'c-sb' AND conditions <> '[]'`) > 0)
    // Consultorio
    assert.ok(await n(`SELECT COUNT(*)::int AS n FROM patients WHERE clinic_id = 'c-al'`) >= 25)
    assert.ok(await n(`SELECT COUNT(*)::int AS n FROM appointments WHERE clinic_id = 'c-al' AND start LIKE ? AND status <> 'cancelled'`, [`${today}%`]) >= 6)
    assert.ok(await n(`SELECT COUNT(*)::int AS n FROM appointments WHERE clinic_id = 'c-al' AND start LIKE ? AND status = 'arrived'`, [`${today}%`]) >= 3)
    assert.ok(await n(`SELECT COUNT(*)::int AS n FROM followups WHERE clinic_id = 'c-al' AND kind = 'chronic'`) >= 6)
    assert.equal(await n(`SELECT COUNT(*)::int AS n FROM hospitalizations WHERE clinic_id = 'c-al' AND kind = 'hospital'`), 0, 'el consultorio no hospitaliza')
    // Bitácora: un evento por reinicio con los conteos; nada de los pacientes borrados
    const last = await sql.one(`SELECT action FROM audit WHERE action LIKE 'Reinicio de datos demo%' ORDER BY id DESC LIMIT 1`)
    assert.match(String(last!.action), /Antes: \d+ pacientes.*Después: \d+ pacientes/)
    assert.equal(await n(`SELECT COUNT(*)::int AS n FROM audit WHERE clinic_id IN ('c-sb', 'c-al') AND patient_id IS NOT NULL AND patient_id NOT IN (SELECT id FROM patients)`), 0)
    console.log(JSON.stringify({ antes: sum.before, despues: sum.after, porMedico: counts }))
  })
})
