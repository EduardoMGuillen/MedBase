import type { Express } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { type Ctx, fail, parse, type Row } from '../http'
import { tx } from '../db'
import { toPatient, toPayment } from '../mappers'

const METHOD_LABEL = { cash: 'efectivo', card: 'tarjeta', transfer: 'transferencia', insurance: 'aseguradora' } as const

export function registerBilling(app: Express, { db, auth, need, userOf, audit, patientRow, apptRow, patientName }: Ctx) {
  app.get('/api/payments', auth, need('billing.manage'), (req, res) => {
    const q = parse(z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), req.query, 'Elige un rango de fechas.')
    // paid_at está en UTC: se amplía un día por cada lado y el cliente filtra por fecha local
    const from = new Date(`${q.from}T00:00:00`); from.setDate(from.getDate() - 1)
    const to = new Date(`${q.to}T23:59:59`); to.setDate(to.getDate() + 1)
    const rows = db.prepare('SELECT * FROM payments WHERE paid_at BETWEEN ? AND ? ORDER BY paid_at DESC').all(from.toISOString(), to.toISOString()) as Row[]
    res.json(rows.map(toPayment))
  })

  app.get('/api/payments/:id', auth, need('billing.manage'), (req, res) => {
    const row = db.prepare('SELECT * FROM payments WHERE id = ?').get(String(req.params.id)) as Row | undefined ?? fail(404, 'El recibo no existe.')
    const p = toPayment(row!)
    res.json({ payment: p, patient: toPatient(patientRow(p.patientId)!, false) })
  })

  app.post('/api/payments', auth, need('billing.manage'), (req, res) => {
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
    patientRow(b.patientId) ?? fail(400, 'El paciente no existe.')
    if (b.appointmentId) {
      const a = apptRow(b.appointmentId)
      if (!a || a.patient_id !== b.patientId) fail(400, 'La cita no corresponde a este paciente.')
      if (db.prepare('SELECT 1 FROM payments WHERE appointment_id = ? AND voided = 0').get(b.appointmentId)) fail(409, 'Esta cita ya fue cobrada.')
    }
    const subtotal = b.items.reduce((s, i) => s + i.price * i.qty, 0)
    if (b.discount > subtotal) fail(400, 'El descuento no puede ser mayor que el total.')
    if ((b.method === 'card' || b.method === 'transfer') && !b.reference) fail(400, 'Escribe la referencia o el número de autorización del pago.')
    const total = Math.round((subtotal - b.discount) * 100) / 100
    const id = randomUUID()
    let receiptNo = ''
    tx(db, () => {
      const last = db.prepare(`SELECT receipt_no FROM payments ORDER BY receipt_no DESC LIMIT 1`).get() as Row | undefined
      receiptNo = `R-${String((last ? Number(String(last.receipt_no).slice(2)) : 0) + 1).padStart(6, '0')}`
      db.prepare(`INSERT INTO payments (id,receipt_no,appointment_id,patient_id,items,discount,total,method,reference,received_by,paid_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, receiptNo, b.appointmentId ?? null, b.patientId, JSON.stringify(b.items), b.discount, total, b.method, b.reference || null, user.id, new Date().toISOString())
      audit(user.id, `Cobró ${receiptNo} a ${patientName(b.patientId)} por ${total.toFixed(2)} en ${METHOD_LABEL[b.method]}`)
    })
    res.status(201).json(toPayment(db.prepare('SELECT * FROM payments WHERE id = ?').get(id) as Row))
  })

  app.post('/api/payments/:id/void', auth, need('settings.manage'), (req, res) => {
    const { reason } = parse(z.object({ reason: z.string().trim().min(5, 'Escribe el motivo de la anulación.') }), req.body)
    const row = db.prepare('SELECT * FROM payments WHERE id = ?').get(String(req.params.id)) as Row | undefined ?? fail(404, 'El recibo no existe.')
    if (row!.voided) fail(409, 'Este recibo ya está anulado.')
    db.prepare('UPDATE payments SET voided = 1 WHERE id = ?').run(String(row!.id))
    audit(userOf(req).id, `Anuló el recibo ${row!.receipt_no}: ${reason}`)
    res.json(toPayment(db.prepare('SELECT * FROM payments WHERE id = ?').get(String(row!.id)) as Row))
  })
}
