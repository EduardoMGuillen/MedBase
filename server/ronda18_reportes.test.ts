import './tz.js'
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { type Sql } from './sql.js'
import { bootApp, DEMO } from './test/helpers.js'
import { previousRange } from './routes/reports.js'
import { formatDelta, vsLabel } from '../src/lib/reportDelta.js'
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

describe('RP1 (ronda 18): variación contra el periodo anterior', () => {
  test('el texto de la variación: flecha, un decimal y contra qué se compara', () => {
    assert.deepEqual(formatDelta(112.5, 100, 'mes anterior'), { dir: 'up', text: '▲ 12.5 % vs. mes anterior' })
    assert.deepEqual(formatDelta(97, 100, '7 días anteriores'), { dir: 'down', text: '▼ 3.0 % vs. 7 días anteriores' })
    assert.deepEqual(formatDelta(100, 100, '30 días anteriores'), { dir: 'same', text: '= 0 % vs. 30 días anteriores' })
    // Asistencia: cambio relativo (A1), de 88 % a 91 %
    assert.equal(formatDelta(0.91, 0.88, '1–12 oct')!.text, '▲ 3.4 % vs. 1–12 oct')
    // Anterior en 0 y actual no: sin datos (ni «∞ %» ni «100 %»); los dos en 0: sin cambio
    assert.deepEqual(formatDelta(5, 0, 'mes anterior'), { dir: 'none', text: 'Sin datos del periodo anterior' })
    assert.deepEqual(formatDelta(0.9, null, 'mes anterior'), { dir: 'none', text: 'Sin datos del periodo anterior' })
    assert.deepEqual(formatDelta(0, 0, 'mes anterior'), { dir: 'same', text: '= 0 % vs. mes anterior' })
    assert.deepEqual(formatDelta(null, null, 'mes anterior'), { dir: 'same', text: '= 0 % vs. mes anterior' })
    assert.deepEqual(formatDelta(0, 40, 'mes anterior'), { dir: 'down', text: '▼ 100.0 % vs. mes anterior' })
    // Un cambio que no llega a una décima se lee como igual; sin dato actual no hay línea
    assert.equal(formatDelta(1000.2, 1000, 'mes anterior')!.text, '= 0 % vs. mes anterior')
    assert.equal(formatDelta(null, 0.88, 'mes anterior'), null)
  })
  test('contra qué se compara: días anteriores, mes anterior o los mismos días del mes anterior', () => {
    assert.equal(vsLabel(false, { from: '2026-10-30', to: '2026-11-05' }), '7 días anteriores')
    assert.equal(vsLabel(false, { from: '2026-09-14', to: '2026-10-13' }), '30 días anteriores')
    assert.equal(vsLabel(true, { from: '2026-09-01', to: '2026-09-30' }), 'mes anterior')
    assert.equal(vsLabel(true, { from: '2026-10-01', to: '2026-10-12' }), '1–12 oct')
  })
  test('el periodo anterior: los N días de antes; con «Mes», el mes anterior completo o sus mismos días', () => {
    assert.deepEqual(previousRange('2026-11-06', '2026-11-12'), { from: '2026-10-30', to: '2026-11-05' })
    assert.deepEqual(previousRange('2026-10-14', '2026-11-12'), { from: '2026-09-14', to: '2026-10-13' })
    assert.deepEqual(previousRange('2026-08-15', '2026-11-12'), { from: '2026-05-17', to: '2026-08-14' })
    assert.deepEqual(previousRange('2026-10-01', '2026-10-31', 'month'), { from: '2026-09-01', to: '2026-09-30' })
    assert.deepEqual(previousRange('2026-11-01', '2026-11-12', 'month'), { from: '2026-10-01', to: '2026-10-12' })
    assert.deepEqual(previousRange('2026-01-01', '2026-01-31', 'month'), { from: '2025-12-01', to: '2025-12-31' })
    // Mes en curso más largo que el anterior: hasta el último día de este
    assert.deepEqual(previousRange('2026-03-01', '2026-03-30', 'month'), { from: '2026-02-01', to: '2026-02-28' })
    // Sin «Mes», del 1 al 7 se compara con los 7 días de antes, no con el mes anterior
    assert.deepEqual(previousRange('2026-11-01', '2026-11-07'), { from: '2026-10-25', to: '2026-10-31' })
  })
  test('un mes cerrado se compara con el mes anterior completo, con las mismas reglas', async () => {
    const admin = await as(ADMIN)
    const oct = (await admin.get('/api/reports?from=2019-10-01&to=2019-10-31&period=month')).body
    assert.deepEqual(oct.range, { from: '2019-10-01', to: '2019-10-31' })
    assert.deepEqual(oct.previous.range, { from: '2019-09-01', to: '2019-09-30' })
    // Septiembre: L 1,000 (el cobro anulado no cuenta), 1 atendida de 2 (la cancelada no cuenta), 0 en línea
    assert.equal(oct.previous.totals.revenue, 1000)
    assert.equal(oct.previous.totals.done, 1)
    assert.equal(oct.previous.totals.appointments, 2)
    assert.equal(oct.previous.totals.attendance, 0.5)
    assert.equal(oct.previous.totals.online, 0)
    // Lo «anterior» de octubre es exactamente el reporte de septiembre
    const sep = (await admin.get('/api/reports?from=2019-09-01&to=2019-09-30&period=month')).body
    assert.deepEqual(oct.previous.totals, sep.totals)
    // Y en pantalla: ingresos de 1,000 a 1,250; asistencia de 50 % a 75 %; en línea de 0 a 1
    const vs = vsLabel(true, oct.previous.range)
    assert.equal(formatDelta(oct.totals.revenue, oct.previous.totals.revenue, vs)!.text, '▲ 25.0 % vs. mes anterior')
    assert.equal(formatDelta(oct.totals.done, oct.previous.totals.done, vs)!.text, '▲ 200.0 % vs. mes anterior')
    assert.equal(formatDelta(oct.totals.attendance, oct.previous.totals.attendance, vs)!.text, '▲ 50.0 % vs. mes anterior')
    assert.equal(formatDelta(oct.totals.online, oct.previous.totals.online, vs)!.text, 'Sin datos del periodo anterior')
    // Septiembre contra agosto (sin nada): sin datos; agosto contra julio (los dos en 0): sin cambio
    assert.equal(sep.previous.totals.revenue, 0)
    assert.equal(sep.previous.totals.attendance, null)
    assert.equal(formatDelta(sep.totals.revenue, sep.previous.totals.revenue, vs)!.text, 'Sin datos del periodo anterior')
    const aug = (await admin.get('/api/reports?from=2019-08-01&to=2019-08-31&period=month')).body
    assert.equal(formatDelta(aug.totals.revenue, aug.previous.totals.revenue, vs)!.text, '= 0 % vs. mes anterior')
  })
  test('un mes en curso se compara con los mismos días del mes anterior', async () => {
    const admin = await as(ADMIN)
    // Como si hoy fuera 15 de octubre de 2019: del 1 al 15 de octubre contra del 1 al 15 de septiembre
    const r = (await admin.get('/api/reports?from=2019-10-01&to=2019-10-15&period=month')).body
    assert.deepEqual(r.previous.range, { from: '2019-09-01', to: '2019-09-15' })
    assert.equal(r.totals.revenue, 750)
    assert.equal(r.previous.totals.revenue, 600) // el cobro del 30 de septiembre queda fuera
    assert.equal(vsLabel(true, r.previous.range), '1–15 sep')
  })
  test('los periodos de días se comparan con los días de antes; el reporte de siempre no cambia', async () => {
    const admin = await as(ADMIN)
    // 7 días (25 al 31 de octubre) contra los 7 de antes (18 al 24)
    const r = (await admin.get('/api/reports?from=2019-10-25&to=2019-10-31')).body
    assert.deepEqual(r.previous.range, { from: '2019-10-18', to: '2019-10-24' })
    assert.equal(r.totals.revenue, 500)
    assert.equal(r.totals.done, 1)
    assert.equal(r.previous.totals.revenue, 0)
    assert.equal(r.previous.totals.noShow, 1)
    assert.equal(r.previous.totals.attendance, 0)
    assert.equal(r.days.length, 7)
    for (const k of ['range', 'totals', 'days', 'byDoctor', 'byMethod', 'byService', 'topDiagnoses', 'previous']) assert.ok(k in r, k)
    // Con los datos de la demo: lo anterior de los últimos 30 días es el reporte de los 30 de antes
    const today = new Date().toLocaleDateString('en-CA')
    const cur = daysRange(30, today)
    const now = (await admin.get(`/api/reports?from=${cur.from}&to=${cur.to}`)).body
    const before = (await admin.get(`/api/reports?from=${now.previous.range.from}&to=${now.previous.range.to}`)).body
    assert.equal(before.days.length, 30)
    assert.deepEqual(now.previous.totals, before.totals)
  })
  test('«Mes» pide un mes: del día 1 y dentro del mismo mes; lo anterior también exige `reports.view`', async () => {
    const admin = await as(ADMIN)
    assert.equal((await admin.get('/api/reports?from=2019-10-02&to=2019-10-31&period=month')).status, 400)
    assert.equal((await admin.get('/api/reports?from=2019-10-01&to=2019-11-30&period=month')).status, 400)
    assert.equal((await admin.get('/api/reports?from=2019-10-01&to=2019-10-31&period=semana')).status, 400)
    assert.equal((await (await as(DEMO.doctor)).get('/api/reports?from=2019-10-01&to=2019-10-31&period=month')).status, 403)
  })
})
