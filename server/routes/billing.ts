import type { Express } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { type Ctx, fail, parse, type Row } from '../http.js'
import { toPatient, toPayment, toService } from '../mappers.js'
import type { Sql } from '../sql.js'
import { normalize } from '../../src/lib/patients.js'
import type { Payment } from '../../src/lib/types.js'

const METHOD_LABEL = { cash: 'efectivo', card: 'tarjeta', transfer: 'transferencia', insurance: 'aseguradora', deposit: 'depósito', other: 'otra forma de pago' } as const
const METHODS = ['cash', 'card', 'transfer', 'insurance', 'deposit', 'other'] as const
const INVOICE_NO = z.string().trim().min(1, 'Escribe el número de factura.').max(40, 'El número de factura es demasiado largo.')
const round2 = (n: number) => Math.round(n * 100) / 100

/** Los abonos y el saldo de cada cobro (AD9). */
export async function withInstallments(q: Sql, rows: Row[]): Promise<Payment[]> {
  const ids = rows.map((r) => String(r.id))
  const inst = ids.length ? await q.query(`SELECT * FROM payment_installments WHERE payment_id IN (${ids.map(() => '?').join(',')}) ORDER BY paid_at`, ids) : []
  return rows.map((r) => {
    const p = toPayment(r)
    p.installments = inst.filter((i) => i.payment_id === r.id).map((i) => ({
      id: String(i.id), amount: Number(i.amount), method: i.method as Payment['method'], reference: i.reference ? String(i.reference) : undefined,
      bank: i.bank ? String(i.bank) : undefined, receivedBy: String(i.received_by), paidAt: String(i.paid_at),
    }))
    p.balance = p.voided ? 0 : round2(p.total - (p.amountPaid ?? p.total) - p.installments.reduce((s, i) => s + i.amount, 0))
    return p
  })
}

/**
 * Caja (AD9). Los cobros los genera quien cobra (recepción, el médico o administración) en el momento, antes o después
 * de la atención: ya no se generan solos por cita. Un servicio que no está en la lista se escribe con su precio y, si se
 * marca, queda guardado. Sólo se ofrecen las formas de pago que acepta la clínica. Se puede pagar una parte (abono) y el
 * saldo queda pendiente en el paciente.
 */
export function registerBilling(app: Express, { sql, auth, need, userOf, clinicOf, audit, patientRow, apptRow, patientName, settings }: Ctx) {
  const paymentRow = async (cid: string, id: string) => (await sql.one('SELECT * FROM payments WHERE id = ? AND clinic_id = ?', [id, cid])) ?? fail(404, 'El recibo no existe.')

  app.get('/api/payments', auth, need('billing.manage'), async (req, res) => {
    const q = parse(z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), req.query, 'Elige un rango de fechas.')
    // paid_at está en UTC: se amplía un día por cada lado y el cliente filtra por fecha local. También los cobros de antes
    // con un abono en el periodo (cuentan en la caja del día del abono).
    const from = new Date(`${q.from}T00:00:00`); from.setDate(from.getDate() - 1)
    const to = new Date(`${q.to}T23:59:59`); to.setDate(to.getDate() + 1)
    const rows = await sql.query(`SELECT * FROM payments p WHERE p.clinic_id = ? AND (p.paid_at BETWEEN ? AND ?
      OR EXISTS (SELECT 1 FROM payment_installments i WHERE i.payment_id = p.id AND i.paid_at BETWEEN ? AND ?)) ORDER BY p.paid_at DESC`,
    [clinicOf(req), from.toISOString(), to.toISOString(), from.toISOString(), to.toISOString()])
    res.json(await withInstallments(sql, rows))
  })

  // Saldos pendientes de la clínica (o de un paciente)
  app.get('/api/payments/balances', auth, need('billing.manage'), async (req, res) => {
    const patientId = typeof req.query.patientId === 'string' ? req.query.patientId : undefined
    const rows = await sql.query(`SELECT p.* FROM payments p WHERE p.clinic_id = ? AND NOT p.voided ${patientId ? 'AND p.patient_id = ?' : ''}
      AND p.total - COALESCE(p.amount_paid, p.total) - COALESCE((SELECT SUM(amount) FROM payment_installments i WHERE i.payment_id = p.id), 0) > 0.004
      ORDER BY p.paid_at`, patientId ? [clinicOf(req), patientId] : [clinicOf(req)])
    res.json(await withInstallments(sql, rows))
  })

  app.get('/api/payments/:id', auth, need('billing.manage'), async (req, res) => {
    const cid = clinicOf(req)
    const [p] = await withInstallments(sql, [await paymentRow(cid, String(req.params.id))])
    res.json({ payment: p, patient: toPatient((await patientRow(cid, p.patientId))!, false) })
  })

  const payBody = z.object({
    appointmentId: z.string().optional(),
    patientId: z.string().min(1, 'Elige un paciente.'),
    items: z.array(z.object({
      serviceId: z.string().optional(),
      name: z.string().trim().min(1, 'Cada concepto necesita un nombre.').max(120),
      price: z.number().min(0, 'El precio no puede ser negativo.').max(1_000_000),
      qty: z.number().int().min(1).max(99),
      // "+ Servicio nuevo": se guarda en la lista de servicios (marcado por defecto en la pantalla)
      save: z.boolean().optional(),
    })).min(1, 'Agrega al menos un servicio.'),
    discount: z.number().min(0).default(0),
    method: z.enum(METHODS, { error: 'Elige la forma de pago.' }),
    reference: z.string().trim().max(80).optional(),
    bank: z.string().trim().max(60).optional(),
    discountReason: z.string().trim().max(120).optional(),
    invoiceNo: INVOICE_NO.optional(),
    // Abono: lo que paga ahora; el resto queda como saldo pendiente
    amountPaid: z.number().min(0).optional(),
  })

  /** La forma de pago tiene que estar habilitada en la clínica; la tarjeta pide su número de autorización. */
  async function assertMethod(cid: string, method: Payment['method'], reference?: string) {
    const enabled = (await settings(cid)).paymentMethods ?? ['cash', 'transfer']
    if (!enabled.includes(method)) fail(400, `La clínica no acepta pagos con ${METHOD_LABEL[method]}. Elige otra forma de pago o habilítala en Configuración.`)
    if (method === 'card' && !reference) fail(400, 'Escribe el número de autorización del pago con tarjeta.')
  }

  app.post('/api/payments', auth, need('billing.manage'), async (req, res) => {
    const user = userOf(req)
    const b = parse(payBody, req.body)
    const cid = clinicOf(req)
    ;(await patientRow(cid, b.patientId)) ?? fail(400, 'El paciente no existe.')
    if (b.appointmentId) {
      const a = await apptRow(cid, b.appointmentId)
      if (!a || a.patient_id !== b.patientId) fail(400, 'La visita no corresponde a este paciente.')
    }
    await assertMethod(cid, b.method, b.reference)
    const subtotal = round2(b.items.reduce((s, i) => s + i.price * i.qty, 0))
    if (b.discount > subtotal) fail(400, 'El descuento no puede ser mayor que el total.')
    if (b.discount > 0 && !b.discountReason) fail(400, 'Escribe el motivo del descuento.')
    const total = round2(subtotal - b.discount)
    const paid = b.amountPaid === undefined ? total : round2(b.amountPaid)
    if (paid > total) fail(400, 'Lo que paga no puede ser mayor que el total.')
    if (total > 0 && paid <= 0) fail(400, 'Escribe cuánto paga ahora.')
    const id = randomUUID()
    const name = await patientName(b.patientId)
    const created: string[] = []
    await sql.tx(async (q) => {
      // Un solo cobro a la vez por clínica: numeración de recibos sin huecos ni duplicados
      await q.run('SELECT pg_advisory_xact_lock(hashtext(?))', [`receipt:${cid}`])
      if (b.appointmentId && await q.one('SELECT 1 FROM payments WHERE appointment_id = ? AND NOT voided', [b.appointmentId])) fail(409, 'Esta visita ya tiene un cobro. Ábrelo desde el historial para registrar un abono.')
      // Servicios nuevos que se guardan en la lista (si ya existe uno con ese nombre, se usa ése)
      const items = []
      for (const it of b.items) {
        let serviceId = it.serviceId
        if (!serviceId && it.save) {
          const same = (await q.query('SELECT id, name FROM services WHERE clinic_id = ?', [cid])).find((s) => normalize(String(s.name)) === normalize(it.name))
          if (same) serviceId = String(same.id)
          else {
            serviceId = randomUUID()
            await q.run('INSERT INTO services (id, name, price, active, clinic_id, created_by, created_at) VALUES (?,?,?,TRUE,?,?,?)', [serviceId, it.name, it.price, cid, user.id, new Date().toISOString()])
            created.push(it.name)
          }
        }
        items.push({ serviceId, name: it.name, price: it.price, qty: it.qty })
      }
      const last = await q.one(`SELECT receipt_no FROM payments WHERE clinic_id = ? ORDER BY receipt_no DESC LIMIT 1`, [cid])
      const receiptNo = `R-${String((last ? Number(String(last.receipt_no).slice(2)) : 0) + 1).padStart(6, '0')}`
      await q.run(`INSERT INTO payments (id,receipt_no,appointment_id,patient_id,items,discount,total,method,reference,received_by,paid_at,clinic_id,invoice_no,discount_reason,bank,amount_paid)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, receiptNo, b.appointmentId ?? null, b.patientId, JSON.stringify(items), b.discount, total, b.method, b.reference || null, user.id, new Date().toISOString(), cid,
          b.invoiceNo || null, b.discount > 0 ? b.discountReason || null : null, b.bank || null, paid])
      for (const s of created) await audit(user, `Agregó el servicio ${s} a la lista desde la caja`, q)
      await audit(user, `Cobró ${receiptNo} a ${name} por ${total.toFixed(2)} en ${METHOD_LABEL[b.method]}${paid < total ? `; pagó ${paid.toFixed(2)} y queda un saldo de ${(total - paid).toFixed(2)}` : ''}${b.invoiceNo ? `, factura ${b.invoiceNo}` : ''}`, q)
    })
    const [p] = await withInstallments(sql, [(await sql.one('SELECT * FROM payments WHERE id = ?', [id]))!])
    res.status(201).json(p)
  })

  // Abono a un cobro con saldo pendiente
  app.post('/api/payments/:id/installments', auth, need('billing.manage'), async (req, res) => {
    const b = parse(z.object({ amount: z.number().positive('Escribe cuánto abona.'), method: z.enum(METHODS), reference: z.string().trim().max(80).optional(), bank: z.string().trim().max(60).optional() }), req.body)
    const cid = clinicOf(req)
    const user = userOf(req)
    await assertMethod(cid, b.method, b.reference)
    // Fuera de la transacción: con una sola conexión, consultar por fuera de ella la bloquearía
    const before = await paymentRow(cid, String(req.params.id))
    const name = await patientName(String(before!.patient_id))
    await sql.tx(async (q) => {
      await q.run('SELECT pg_advisory_xact_lock(hashtext(?))', [`receipt:${cid}`])
      const row = (await q.one('SELECT * FROM payments WHERE id = ? AND clinic_id = ?', [String(req.params.id), cid])) ?? fail(404, 'El recibo no existe.')
      if (row!.voided) fail(409, 'El recibo está anulado.')
      const [p] = await withInstallments(q, [row!])
      if (round2(b.amount) > (p.balance ?? 0)) fail(400, `El abono no puede ser mayor que el saldo (${(p.balance ?? 0).toFixed(2)}).`)
      await q.run('INSERT INTO payment_installments (id, clinic_id, payment_id, amount, method, reference, bank, received_by, paid_at) VALUES (?,?,?,?,?,?,?,?,?)',
        [randomUUID(), cid, p.id, round2(b.amount), b.method, b.reference || null, b.bank || null, user.id, new Date().toISOString()])
      await audit(user, `Registró un abono de ${round2(b.amount).toFixed(2)} en ${METHOD_LABEL[b.method]} al recibo ${p.receiptNo} de ${name}; saldo ${round2((p.balance ?? 0) - b.amount).toFixed(2)}`, q, p.patientId)
    })
    const [p] = await withInstallments(sql, [await paymentRow(cid, String(req.params.id))])
    res.status(201).json(p)
  })

  app.post('/api/payments/:id/void', auth, need('settings.manage'), async (req, res) => {
    const { reason } = parse(z.object({ reason: z.string().trim().min(5, 'Escribe el motivo de la anulación.') }), req.body)
    const row = await paymentRow(clinicOf(req), String(req.params.id))
    if (row!.voided) fail(409, 'Este recibo ya está anulado.')
    const user = userOf(req)
    await sql.run('UPDATE payments SET voided = TRUE, void_reason = ?, voided_at = ?, voided_by = ? WHERE id = ?', [reason, new Date().toISOString(), user.id, String(row!.id)])
    await audit(user, `Anuló el recibo ${row!.receipt_no}: ${reason}`, sql, String(row!.patient_id))
    const [p] = await withInstallments(sql, [(await sql.one('SELECT * FROM payments WHERE id = ?', [String(row!.id)]))!])
    res.json(p)
  })

  // La factura del talonario muchas veces se llena después de cobrar: se anota (o corrige) en el recibo
  app.patch('/api/payments/:id/invoice', auth, need('billing.manage'), async (req, res) => {
    const { invoiceNo } = parse(z.object({ invoiceNo: INVOICE_NO }), req.body)
    const row = await paymentRow(clinicOf(req), String(req.params.id))
    if (row!.voided) fail(409, 'El recibo está anulado.')
    await sql.run('UPDATE payments SET invoice_no = ? WHERE id = ?', [invoiceNo, String(row!.id)])
    await audit(userOf(req), row!.invoice_no
      ? `Cambió la factura del recibo ${row!.receipt_no} de ${row!.invoice_no} a ${invoiceNo}`
      : `Anotó la factura ${invoiceNo} en el recibo ${row!.receipt_no}`, sql, String(row!.patient_id))
    const [p] = await withInstallments(sql, [(await sql.one('SELECT * FROM payments WHERE id = ?', [String(row!.id)]))!])
    res.json(p)
  })

  // Configuración → Formas de pago: casillas; al menos una activa
  app.put('/api/settings/payment-methods', auth, need('settings.manage'), async (req, res) => {
    const { methods } = parse(z.object({ methods: z.array(z.enum(METHODS)).min(1, 'Deja al menos una forma de pago activa.') }), req.body)
    const cid = clinicOf(req)
    const list = METHODS.filter((m) => methods.includes(m))
    await sql.run('UPDATE clinics SET payment_methods = ? WHERE id = ?', [JSON.stringify(list), cid])
    await audit(userOf(req), `Cambió las formas de pago que acepta: ${list.map((m) => METHOD_LABEL[m]).join(', ')}`)
    res.json(await settings(cid))
  })

  // Servicios de la clínica (para el buscador del cobro, también para quien no configura)
  app.get('/api/services', auth, need('billing.manage'), async (req, res) => {
    res.json((await sql.query('SELECT * FROM services WHERE clinic_id = ? ORDER BY name', [clinicOf(req)])).map(toService))
  })
}
