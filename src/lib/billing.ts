import type { Payment } from './types.js'
import { normalize } from './patients.js'

const round2 = (n: number) => Math.round(n * 100) / 100

/** Descuento en dinero a partir de lo que escribió la cajera, en lempiras o en porcentaje del subtotal. */
export function discountAmount(subtotal: number, value: string, mode: 'amount' | 'percent') {
  const n = Number(value) || 0
  return round2(mode === 'percent' ? subtotal * n / 100 : n)
}

/** Montos rápidos para "Recibido": el exacto y los redondeos a 100, 500 y 1000 que sean mayores. */
export function cashSuggestions(total: number) {
  if (total <= 0) return []
  const out = [total]
  for (const step of [100, 500, 1000]) {
    const up = Math.ceil(total / step) * step
    if (!out.includes(up)) out.push(up)
  }
  return out
}

/** Días de calendario desde la consulta hasta hoy. */
export function daysWaiting(start: string, now = new Date()) {
  const d = new Date(start)
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((b - a) / 86_400_000)
}

/** Búsqueda en caja: número de recibo, factura del talonario, referencia o nombre del paciente. */
export function matchesPayment(p: Pick<Payment, 'receiptNo' | 'invoiceNo' | 'reference'>, patientName: string, query: string) {
  const q = normalize(query)
  if (!q) return true
  return [p.receiptNo, p.invoiceNo, p.reference, patientName].some((v) => v && normalize(v).includes(q))
}

/**
 * AD9: dinero recibido en un periodo (fechas locales AAAA-MM-DD): lo pagado al cobrar y los abonos, cada uno en su día
 * y con su forma de pago. Los recibos anulados no cuentan.
 */
export function receivedIn(payments: Payment[], from: string, to: string) {
  const local = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
  const inRange = (iso: string) => { const d = local(iso); return d >= from && d <= to }
  const out: { paymentId: string; amount: number; method: Payment['method']; at: string; installment: boolean }[] = []
  for (const p of payments) {
    if (p.voided) continue
    if (inRange(p.paidAt)) out.push({ paymentId: p.id, amount: p.amountPaid ?? p.total, method: p.method, at: p.paidAt, installment: false })
    for (const i of p.installments ?? []) if (inRange(i.paidAt)) out.push({ paymentId: p.id, amount: i.amount, method: i.method, at: i.paidAt, installment: true })
  }
  return out
}

/** Bancos de Honduras que más se usan para transferencias y depósitos (se puede escribir otro). */
export const BANKS = ['Banco Atlántida', 'BAC Credomatic', 'Banco Ficohsa', 'Banpaís', 'Banco de Occidente', 'Davivienda', 'Banrural', 'Banco Lafise', 'Banco Promerica', 'Banhprovi', 'Cooperativa']
