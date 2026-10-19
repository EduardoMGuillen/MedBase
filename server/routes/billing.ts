import type { Express } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { type Ctx, fail, parse } from '../http.js'
import { toPatient, toPayment } from '../mappers.js'

const METHOD_LABEL = { cash: 'efectivo', card: 'tarjeta', transfer: 'transferencia', insurance: 'aseguradora' } as const

export function registerBilling(app: Express, { sql, auth, need, userOf, audit, patientRow, apptRow, patientName }: Ctx) {
  app.get('/api/payments', auth, need('billing.manage'), async (req, res) => {
    const q = parse(z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), req.query, 'Elige un rango de fechas.')
    // paid_at está en UTC: se amplía un día por cada lado y el cliente filtra por fecha local
    const from = new Date(`${q.from}T00:00:00`); from.setDate(from.getDate() - 1)
    const to = new Date(`${q.to}T23:59:59`); to.setDate(to.getDate() + 1)
    const rows = await sql.query('SELECT * FROM payments WHERE paid_at BETWEEN ? AND ? ORDER BY paid_at DESC', [from.toISOString(), to.toISOString()])
    res.json(rows.map(toPayment))
  })

  app.get('/api/payments/:id', auth, need('billing.manage'), async (req, res) => {
    const row = (await sql.one('SELECT * FROM payments WHERE id = ?', [String(req.params.id)])) ?? fail(404, 'El recibo no existe.')
    const p = toPayment(row!)
    res.json({ payment: p, patient: toPatient((await patientRow(p.patientId))!, false) })
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
    }), req.body)
    ;(await patientRow(b.patientId)) ?? fail(400, 'El paciente no existe.')
    if (b.appointmentId) {
      const a = await apptRow(b.appointmentId)
      if (!a || a.patient_id !== b.patientId) fail(400, 'La cita no corresponde a este paciente.')
    }
    const subtotal = b.items.reduce((s, i) => s + i.price * i.qty, 0)
    if (b.discount > subtotal) fail(400, 'El descuento no puede ser mayor que el total.')
    if ((b.method === 'card' || b.method === 'transfer') && !b.reference) fail(400, 'Escribe la referencia o el número de autorización del pago.')
    const total = Math.round((subtotal - b.discount) * 100) / 100
    const id = randomUUID()
    const name = await patientName(b.patientId)
    await sql.tx(async (q) => {
      // Un solo cobro a la vez: numeración de recibos sin huecos ni duplicados
      await q.run('SELECT pg_advisory_xact_lock(7272743)')
      if (b.appointmentId && await q.one('SELECT 1 FROM payments WHERE appointment_id = ? AND NOT voided', [b.appointmentId])) fail(409, 'Esta cita ya fue cobrada.')
      const last = await q.one(`SELECT receipt_no FROM payments ORDER BY receipt_no DESC LIMIT 1`)
      const receiptNo = `R-${String((last ? Number(String(last.receipt_no).slice(2)) : 0) + 1).padStart(6, '0')}`
      await q.run(`INSERT INTO payments (id,receipt_no,appointment_id,patient_id,items,discount,total,method,reference,received_by,paid_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [id, receiptNo, b.appointmentId ?? null, b.patientId, JSON.stringify(b.items), b.discount, total, b.method, b.reference || null, user.id, new Date().toISOString()])
      await audit(user.id, `Cobró ${receiptNo} a ${name} por ${total.toFixed(2)} en ${METHOD_LABEL[b.method]}`, q)
    })
    res.status(201).json(toPayment((await sql.one('SELECT * FROM payments WHERE id = ?', [id]))!))
  })

  app.post('/api/payments/:id/void', auth, need('settings.manage'), async (req, res) => {
    const { reason } = parse(z.object({ reason: z.string().trim().min(5, 'Escribe el motivo de la anulación.') }), req.body)
    const row = (await sql.one('SELECT * FROM payments WHERE id = ?', [String(req.params.id)])) ?? fail(404, 'El recibo no existe.')
    if (row!.voided) fail(409, 'Este recibo ya está anulado.')
    await sql.run('UPDATE payments SET voided = TRUE WHERE id = ?', [String(row!.id)])
    await audit(userOf(req).id, `Anuló el recibo ${row!.receipt_no}: ${reason}`)
    res.json(toPayment((await sql.one('SELECT * FROM payments WHERE id = ?', [String(row!.id)]))!))
  })
}
