import './tz.js'
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { type Sql } from './sql.js'
import { bootApp, DEMO } from './test/helpers.js'
import { daysRange, monthLabel, monthRange, periodFromParams, shiftMonth } from '../src/lib/reportPeriod.js'

// Ronda 18, Reportes (RP2 y RP1): con la base y la API (copia en memoria de la demo)
let sql: Sql
const booted = bootApp(async () => { sql = booted.sql; await seed() })
const as = booted.as
const ADMIN = 'rmoncada@demo.clinara'

/** Copia una fila de la demo con otros valores: así la prueba no depende de las columnas de la tabla. */
async function clone(table: string, where: string, over: Record<string, unknown>) {
  const row = { ...(await sql.one(`SELECT * FROM ${table} WHERE ${where} LIMIT 1`))!, ...over }
  const cols = Object.keys(row)
  await sql.run(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, cols.map((c) => row[c]))
}
let n = 0
const appt = (day: string, status: string, source = 'staff') =>
  clone('appointments', `clinic_id = '${DEMO.clinic}'`, { id: `r18-a${++n}`, start: `${day}T09:00`, status, source, arrived_at: null, reminded_at: null })
const pay = (paidAt: string, total: number, over: Record<string, unknown> = {}) =>
  clone('payments', `clinic_id = '${DEMO.clinic}' AND NOT voided`, { id: `r18-p${++n}`, receipt_no: `R18-${n}`, appointment_id: null, total, amount_paid: total, discount: 0,
    items: JSON.stringify([{ name: 'Consulta R18', price: total, qty: 1 }]), method: 'cash', paid_at: paidAt, voided: false, ...over })

/**
 * Tres meses cerrados de 2019, lejos de los datos de la demo:
 * agosto, nada; septiembre, L 1,000 y 1 de 2 citas atendidas; octubre, L 1,250 y 3 de 4 atendidas (1 en línea).
 */
async function seed() {
  await pay('2019-09-10T18:00:00.000Z', 600)
  await pay('2019-09-30T18:00:00.000Z', 400)
  await pay('2019-09-12T18:00:00.000Z', 999, { voided: true })
  await appt('2019-09-10', 'done'); await appt('2019-09-11', 'no_show'); await appt('2019-09-12', 'cancelled')
  await pay('2019-10-01T06:00:00.000Z', 250) // 00:00 del 1 de octubre en Honduras
  await pay('2019-10-15T18:00:00.000Z', 500)
  await pay('2019-11-01T03:00:00.000Z', 500) // 21:00 del 31 de octubre en Honduras: todavía es octubre
  await pay('2019-11-01T06:00:00.000Z', 70) // ya es noviembre
  await appt('2019-10-01', 'done'); await appt('2019-10-15', 'done', 'online'); await appt('2019-10-31', 'done'); await appt('2019-10-20', 'no_show')
}

describe('RP2 (ronda 18): periodos de Reportes', () => {
  test('el mes va del 1 al último día; el mes en curso llega hasta hoy', () => {
    assert.deepEqual(monthRange('2026-10', '2026-11-12'), { from: '2026-10-01', to: '2026-10-31' })
    assert.deepEqual(monthRange('2026-11', '2026-11-12'), { from: '2026-11-01', to: '2026-11-12' })
    assert.deepEqual(monthRange('2024-02', '2026-11-12'), { from: '2024-02-01', to: '2024-02-29' })
    assert.deepEqual(daysRange(7, '2026-11-03'), { from: '2026-10-28', to: '2026-11-03' })
    assert.equal(monthLabel('2026-11'), 'Noviembre 2026')
    assert.equal(shiftMonth('2026-01', -1), '2025-12')
    assert.equal(shiftMonth('2026-12', 1), '2027-01')
  })
  test('el periodo sale de la dirección; sin nada son 30 días y un mes futuro cae en el actual', () => {
    const at = (q: string) => periodFromParams(new URLSearchParams(q), '2026-11-12')
    assert.deepEqual(at(''), { kind: 'days', days: 30 })
    assert.deepEqual(at('periodo=7'), { kind: 'days', days: 7 })
    assert.deepEqual(at('periodo=90'), { kind: 'days', days: 90 })
    assert.deepEqual(at('periodo=15'), { kind: 'days', days: 30 })
    assert.deepEqual(at('periodo=mes'), { kind: 'month', month: '2026-11' })
    assert.deepEqual(at('periodo=mes&mes=2026-10'), { kind: 'month', month: '2026-10' })
    assert.deepEqual(at('periodo=mes&mes=2026-12'), { kind: 'month', month: '2026-11' })
    assert.deepEqual(at('periodo=mes&mes=2026-13'), { kind: 'month', month: '2026-11' })
  })
  test('el reporte de un mes trae sus días del 1 al último y solo lo de ese mes (hora de Honduras)', async () => {
    const admin = await as(ADMIN)
    const { from, to } = monthRange('2019-10', '2026-11-12')
    const r = await admin.get(`/api/reports?from=${from}&to=${to}`)
    assert.equal(r.status, 200, JSON.stringify(r.body))
    assert.equal(r.body.days.length, 31)
    assert.equal(r.body.days[0].date, '2019-10-01')
    assert.equal(r.body.days[30].date, '2019-10-31')
    assert.equal(r.body.totals.revenue, 1250)
    assert.equal(r.body.days[0].revenue, 250)
    assert.equal(r.body.days[30].revenue, 500)
    assert.equal(r.body.totals.done, 3)
    assert.equal(r.body.totals.online, 1)
    assert.equal(r.body.totals.attendance, 0.75)
    assert.deepEqual(r.body.byService.map((s: { name: string; total: number }) => [s.name, s.total]), [['Consulta R18', 1250]])
  })
  test('solo quien tiene `reports.view` ve el reporte, y cada clínica ve lo suyo', async () => {
    const url = '/api/reports?from=2019-10-01&to=2019-10-31'
    for (const email of [DEMO.doctor, DEMO.nurse]) assert.equal((await (await as(email)).get(url)).status, 403, email)
    assert.equal((await fetch(`${booted.base}${url}`)).status, 401)
    const other = await sql.one(`SELECT email FROM staff WHERE clinic_id = ? AND role = 'admin' LIMIT 1`, [DEMO.otherClinic])
    assert.ok(other, 'la otra clínica tiene administración')
    const r = await (await as(String(other.email))).get(url)
    assert.equal(r.status, 200)
    assert.equal(r.body.totals.revenue, 0)
  })
})
