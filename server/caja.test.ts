import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { type Sql } from './sql.js'
import { cashSuggestions, daysWaiting, discountAmount, matchesPayment } from '../src/lib/billing.js'
import { bootApp } from './test/helpers.js'

let sql: Sql

const booted = bootApp(() => { sql = booted.sql })

const as = booted.as

const item = { serviceId: 'svc-mi', name: 'Consulta de medicina interna', price: 800, qty: 1 }

describe('caja', () => {
  test('el cobro guarda el número de factura del talonario y el motivo del descuento', async () => {
    const rec = await as('aquiroz@demo.clinara')
    const pay = await rec.post('/api/payments', { patientId: 'p1', items: [item], discount: 80, discountReason: 'Tercera edad', method: 'cash', invoiceNo: '000-001-01-00000123' })
    assert.equal(pay.status, 201)
    assert.equal(pay.body.invoiceNo, '000-001-01-00000123')
    assert.equal(pay.body.discountReason, 'Tercera edad')
    assert.equal((await rec.get(`/api/payments/${pay.body.id}`)).body.payment.invoiceNo, '000-001-01-00000123')
  })

  test('la factura del talonario se puede anotar después del cobro, pero no en un recibo anulado', async () => {
    const rec = await as('aquiroz@demo.clinara')
    const pay = await rec.post('/api/payments', { patientId: 'p1', items: [item], discount: 0, method: 'cash' })
    assert.equal(pay.body.invoiceNo, undefined)
    const set = await rec.patch(`/api/payments/${pay.body.id}/invoice`, { invoiceNo: ' 000-001-01-00000124 ' })
    assert.equal(set.status, 200)
    assert.equal(set.body.invoiceNo, '000-001-01-00000124')
    const audit = await sql.one(`SELECT action FROM audit WHERE action LIKE ? AND action LIKE ?`, [`%${pay.body.receiptNo}%`, '%000-001-01-00000124%'])
    assert.ok(audit, 'queda en la bitácora')
    const admin = await as('rmoncada@demo.clinara')
    await admin.post(`/api/payments/${pay.body.id}/void`, { reason: 'Cobro duplicado' })
    assert.equal((await rec.patch(`/api/payments/${pay.body.id}/invoice`, { invoiceNo: '000-001-01-00000125' })).status, 409)
  })

  test('la anulación guarda el motivo, quién y cuándo', async () => {
    const rec = await as('aquiroz@demo.clinara')
    const pay = await rec.post('/api/payments', { patientId: 'p1', items: [item], discount: 0, method: 'cash' })
    const admin = await as('rmoncada@demo.clinara')
    const voided = await admin.post(`/api/payments/${pay.body.id}/void`, { reason: 'Se cobró al paciente equivocado' })
    assert.equal(voided.body.voidReason, 'Se cobró al paciente equivocado')
    assert.ok(voided.body.voidedBy)
    assert.ok(voided.body.voidedAt)
  })
})

describe('cálculos de caja', () => {
  test('el descuento en porcentaje se convierte a lempiras con dos decimales', () => {
    assert.equal(discountAmount(850, '10', 'percent'), 85)
    assert.equal(discountAmount(333.33, '15', 'percent'), 50)
    assert.equal(discountAmount(850, '120', 'amount'), 120)
    assert.equal(discountAmount(850, '', 'percent'), 0)
  })

  test('los montos rápidos de efectivo son el exacto y billetes redondos mayores, sin repetir', () => {
    assert.deepEqual(cashSuggestions(700), [700, 1000])
    assert.deepEqual(cashSuggestions(850), [850, 900, 1000])
    assert.deepEqual(cashSuggestions(1240), [1240, 1300, 1500, 2000])
    assert.deepEqual(cashSuggestions(0), [])
  })

  test('cuenta los días que una consulta lleva esperando cobro, por fecha y no por horas', () => {
    const now = new Date(2026, 9, 28, 8, 0)
    assert.equal(daysWaiting('2026-10-28T07:30:00', now), 0)
    assert.equal(daysWaiting('2026-10-27T17:00:00', now), 1)
    assert.equal(daysWaiting('2026-10-01T09:00:00', now), 27)
  })

  test('busca cobros por recibo, factura o paciente sin importar tildes ni mayúsculas', () => {
    const p = { receiptNo: 'R-000123', invoiceNo: '000-001-01-00000456', reference: 'Visa 4421' }
    assert.ok(matchesPayment(p, 'José Pérez', 'jose'))
    assert.ok(matchesPayment(p, 'José Pérez', '000123'))
    assert.ok(matchesPayment(p, 'José Pérez', '00000456'))
    assert.ok(matchesPayment(p, 'José Pérez', '4421'))
    assert.ok(matchesPayment(p, 'José Pérez', ''))
    assert.ok(!matchesPayment(p, 'José Pérez', 'maria'))
  })
})
