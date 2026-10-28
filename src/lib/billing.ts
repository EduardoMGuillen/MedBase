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
