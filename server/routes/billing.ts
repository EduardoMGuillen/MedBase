import type { Express } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { type Ctx, fail, parse } from '../http.js'
import { toPatient, toPayment } from '../mappers.js'

const METHOD_LABEL = { cash: 'efectivo', card: 'tarjeta', transfer: 'transferencia', insurance: 'aseguradora' } as const
const INVOICE_NO = z.string().trim().min(1, 'Escribe el número de factura.').max(40, 'El número de factura es demasiado largo.')

export function registerBilling(app: Express, { sql, auth, need, userOf, clinicOf, audit, patientRow, apptRow, patientName }: Ctx) {
  app.get('/api/payments', auth, need('billing.manage'), async (req, res) => {
    const q = parse(z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), req.query, 'Elige un rango de fechas.')
    // paid_at está en UTC: se amplía un día por cada lado y el cliente filtra por fecha local
    const from = new Date(`${q.from}T00:00:00`); from.setDate(from.getDate() - 1)
    const to = new Date(`${q.to}T23:59:59`); to.setDate(to.getDate() + 1)
    const rows = await sql.query('SELECT * FROM payments WHERE clinic_id = ? AND paid_at BETWEEN ? AND ? ORDER BY paid_at DESC', [clinicOf(req), from.toISOString(), to.toISOString()])
    res.json(rows.map(toPayment))
  })

  app.get('/api/payments/:id', auth, need('billing.manage'), async (req, res) => {
    const cid = clinicOf(req)
    const row = (await sql.one('SELECT * FROM payments WHERE id = ? AND clinic_id = ?', [String(req.params.id), cid])) ?? fail(404, 'El recibo no existe.')
    const p = toPayment(row!)
    res.json({ payment: p, patient: toPatient((await patientRow(cid, p.patientId))!, false) })
  })

  app.post('/api/payments', auth, need('billing.manage'), async (req, res) => {
    const user = userOf(req)
    const b = parse(z.object({
      appointmentId: z.string().optional(),
      patientId: z.string().min(1, 'Elige un paciente.'),
      items: z.array(z.object({
        serviceId: z.string().optional(),
        name: z.string().trim().min(1, 'Cada concepto necesita un nombre.'),
        price: z.number().min(0, 'El precio no puede ser negativo.'),
        qty: z.number().int().min(1).max(99),
      })).min(1, 'Agrega al menos un concepto.'),
      discount: z.number().min(0).default(0),
      method: z.enum(['cash', 'card', 'transfer', 'insurance'], { error: 'Elige la forma de pago.' }),
      reference: z.string().trim().max(80).optional(),
      discountReason: z.string().trim().max(120).optional(),
      invoiceNo: INVOICE_NO.optional(),
    }), req.body)
    const cid = clinicOf(req)
    ;(await patientRow(cid, b.patientId)) ?? fail(400, 'El paciente no existe.')
    if (b.appointmentId) {
      const a = await apptRow(cid, b.appointmentId)
      if (!a || a.patient_id !== b.patientId) fail(400, 'La cita no corresponde a este paciente.')
    }
    const subtotal = b.items.reduce((s, i) => s + i.price * i.qty, 0)
    if (b.discount > subtotal) fail(400, 'El descuento no puede ser mayor que el total.')
    if ((b.method === 'card' || b.method === 'transfer') && !b.reference) fail(400, 'Escribe la referencia o el número de autorización del pago.')
    const total = Math.round((subtotal - b.discount) * 100) / 100
    const id = randomUUID()
    const name = await patientName(b.patientId)
    await sql.tx(async (q) => {
      // Un solo cobro a la vez por clínica: numeración de recibos sin huecos ni duplicados
      await q.run('SELECT pg_advisory_xact_lock(hashtext(?))', [`receipt:${cid}`])
      if (b.appointmentId && await q.one('SELECT 1 FROM payments WHERE appointment_id = ? AND NOT voided', [b.appointmentId])) fail(409, 'Esta cita ya fue cobrada.')
      const last = await q.one(`SELECT receipt_no FROM payments WHERE clinic_id = ? ORDER BY receipt_no DESC LIMIT 1`, [cid])
      const receiptNo = `R-${String((last ? Number(String(last.receipt_no).slice(2)) : 0) + 1).padStart(6, '0')}`
      await q.run(`INSERT INTO payments (id,receipt_no,appointment_id,patient_id,items,discount,total,method,reference,received_by,paid_at,clinic_id,invoice_no,discount_reason)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, receiptNo, b.appointmentId ?? null, b.patientId, JSON.stringify(b.items), b.discount, total, b.method, b.reference || null, user.id, new Date().toISOString(), cid,
          b.invoiceNo || null, b.discount > 0 ? b.discountReason || null : null])
      await audit(user, `Cobró ${receiptNo} a ${name} por ${total.toFixed(2)} en ${METHOD_LABEL[b.method]}${b.invoiceNo ? `, factura ${b.invoiceNo}` : ''}`, q)
    })
    res.status(201).json(toPayment((await sql.one('SELECT * FROM payments WHERE id = ?', [id]))!))
  })

  app.post('/api/payments/:id/void', auth, need('settings.manage'), async (req, res) => {
    const { reason } = parse(z.object({ reason: z.string().trim().min(5, 'Escribe el motivo de la anulación.') }), req.body)
    const row = (await sql.one('SELECT * FROM payments WHERE id = ? AND clinic_id = ?', [String(req.params.id), clinicOf(req)])) ?? fail(404, 'El recibo no existe.')
    if (row!.voided) fail(409, 'Este recibo ya está anulado.')
    const user = userOf(req)
    await sql.run('UPDATE payments SET voided = TRUE, void_reason = ?, voided_at = ?, voided_by = ? WHERE id = ?', [reason, new Date().toISOString(), user.id, String(row!.id)])
    await audit(user, `Anuló el recibo ${row!.receipt_no}: ${reason}`)
    res.json(toPayment((await sql.one('SELECT * FROM payments WHERE id = ?', [String(row!.id)]))!))
  })

  // La factura del talonario muchas veces se llena después de cobrar: se anota (o corrige) en el recibo
  app.patch('/api/payments/:id/invoice', auth, need('billing.manage'), async (req, res) => {
    const { invoiceNo } = parse(z.object({ invoiceNo: INVOICE_NO }), req.body)
    const row = (await sql.one('SELECT * FROM payments WHERE id = ? AND clinic_id = ?', [String(req.params.id), clinicOf(req)])) ?? fail(404, 'El recibo no existe.')
    if (row!.voided) fail(409, 'El recibo está anulado.')
    await sql.run('UPDATE payments SET invoice_no = ? WHERE id = ?', [invoiceNo, String(row!.id)])
    await audit(userOf(req), row!.invoice_no
      ? `Cambió la factura del recibo ${row!.receipt_no} de ${row!.invoice_no} a ${invoiceNo}`
      : `Anotó la factura ${invoiceNo} en el recibo ${row!.receipt_no}`)
    res.json(toPayment((await sql.one('SELECT * FROM payments WHERE id = ?', [String(row!.id)]))!))
  })
}
