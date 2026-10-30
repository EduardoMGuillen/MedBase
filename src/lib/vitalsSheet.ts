import type { Dose, InpatientFile, InpatientMed, Vitals } from './types.js'
import { DEFAULT_TEMP_BAND } from './clinicalConfig.js'

/**
 * Hoja de signos vitales (S1): frecuencia de toma, tomas esperadas, fiebre e hipotermia y antipiréticos. La usan la
 * pantalla, las alertas del expediente, la impresión y el servidor.
 */

/** "Toma cada": las opciones que pidió Emil. */
export const VITALS_FREQUENCIES = [1, 2, 4, 6, 8, 12, 24]
/** Si nadie indicó otra cosa: cada 8 horas. */
export const DEFAULT_VITALS_HOURS = 8
/** Una toma cuenta para la hora esperada si cae a menos de una hora de ella. */
export const TAKE_MARGIN_MS = 3_600_000
const HOUR = 3_600_000

/** Banda normal de la clínica (36.0 a 38.0 °C por defecto): desde `high` es fiebre, por debajo de `low` hipotermia. */
export type TempBand = { low: number; high: number }
export const bandOf = (s: { tempLow?: number; tempHigh?: number }): TempBand => ({ low: s.tempLow ?? DEFAULT_TEMP_BAND.low, high: s.tempHigh ?? DEFAULT_TEMP_BAND.high })
export const tempClass = (t: number, b: TempBand) => (t >= b.high ? 'fever' : t < b.low ? 'hypo' : 'normal') as 'fever' | 'hypo' | 'normal'

/**
 * Frecuencia que indica la orden médica, si se puede leer: "Signos vitales cada 4 horas", "SV c/6h". Se busca en la
 * nota más reciente que hable de signos vitales y, al final, en la consulta que lo ingresó.
 */
export function frequencyFromOrders(file: Pick<InpatientFile, 'notes' | 'consultOrders'>): number | undefined {
  const lists = [...[...file.notes].filter((n) => n.orders?.length).sort((a, b) => b.at.localeCompare(a.at)).map((n) => n.orders ?? []), file.consultOrders ?? []]
  for (const orders of lists) {
    for (const o of orders) {
      const m = /(signos\s+vitales|\bsv\b)[^.]*?(?:cada|c\/)\s*(\d{1,2})\s*(?:h|hr|hrs|horas?)\b/i.exec(o)
      if (m && VITALS_FREQUENCIES.includes(Number(m[2]))) return Number(m[2])
    }
  }
  return undefined
}

/** Cada cuántas horas: lo que eligió el médico, lo que dice la orden o 8. */
export const vitalsEvery = (file: Pick<InpatientFile, 'notes' | 'hospitalization' | 'consultOrders'>) =>
  file.hospitalization.vitalsEveryHours ?? frequencyFromOrders(file) ?? DEFAULT_VITALS_HOURS

/**
 * Horas esperadas de toma entre `from` y `to`: `anchor` más múltiplos de la frecuencia. Sin ancla, desde la medianoche
 * (cada 8 h: 00:00, 08:00 y 16:00). La cuadrícula de la curva usa las mismas horas.
 */
export function expectedTakes(from: Date, to: Date, every: number, anchor?: number): Date[] {
  const step = every * HOUR
  const base = anchor ?? new Date(from).setHours(0, 0, 0, 0)
  const out: Date[] = []
  for (let t = base + Math.ceil((from.getTime() - base) / step) * step; t <= to.getTime(); t += step) out.push(new Date(t))
  return out
}

/** Las tomas válidas (no anuladas) de la hoja, en orden. */
export const activeVitals = (vitals: Vitals[]) => vitals.filter((v) => !v.voidedAt).sort((a, b) => a.takenAt.localeCompare(b.takenAt))

/**
 * El horario de toma lo marca la primera toma registrada en la hoja (redondeada a la hora): si enfermería tomó a las
 * 14:05 y es cada 8 h, se esperan a las 22:00, 06:00, 14:00… Sin tomas todavía, la hora del ingreso.
 */
export function vitalsAnchor(file: Pick<InpatientFile, 'hospitalization' | 'vitals'>) {
  const all = activeVitals(file.vitals ?? [])
  const first = all.find((v) => v.source !== 'preclinic') ?? all[0]
  const t = new Date(first?.takenAt ?? file.hospitalization.observationAt ?? file.hospitalization.admittedAt).getTime()
  return Math.round(t / HOUR) * HOUR
}

/**
 * Tomas esperadas que no se registraron: ya pasó la hora más una hora de margen y no hay ninguna toma a menos de una
 * hora. Desde el ingreso (o desde que entró a observación) hasta ahora o el egreso.
 */
export function missedTakes(file: Pick<InpatientFile, 'notes' | 'hospitalization' | 'vitals' | 'consultOrders'>, now: Date) {
  const h = file.hospitalization
  const start = new Date(h.observationAt ?? h.admittedAt)
  const end = new Date(Math.min(now.getTime() - TAKE_MARGIN_MS, h.dischargedAt ? new Date(h.dischargedAt).getTime() : Infinity))
  if (end <= start) return []
  const takes = activeVitals(file.vitals ?? []).map((v) => new Date(v.takenAt).getTime())
  // La primera hora esperada es la siguiente al ingreso (la toma del ingreso es la preclínica o la primera de la hoja)
  return expectedTakes(new Date(start.getTime() + TAKE_MARGIN_MS), end, vitalsEvery(file), vitalsAnchor(file))
    .filter((slot) => !takes.some((t) => Math.abs(t - slot.getTime()) <= TAKE_MARGIN_MS))
}

/** Antipiréticos aplicados (de la hoja de medicamentos), para marcarlos en la curva. */
const ANTIPYRETIC = /acetaminof|paracetamol|metamizol|dipirona|ibuprofen/i
export function antipyreticDoses(file: Pick<InpatientFile, 'meds' | 'doses'>): { at: string; med: InpatientMed; dose: Dose }[] {
  return file.doses.filter((d) => d.status === 'given').flatMap((d) => {
    const med = file.meds.find((m) => m.id === d.medId)
    return med && ANTIPYRETIC.test(med.drug) ? [{ at: d.givenAt, med, dose: d }] : []
  })
}

