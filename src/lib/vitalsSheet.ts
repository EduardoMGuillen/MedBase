import type { Dose, InpatientFile, InpatientMed, Vitals, VitalsMode, VitalsSegment } from './types.js'
import { DEFAULT_TEMP_BAND, VITALS_SHIFT_TIMES } from './clinicalConfig.js'

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

/** Cada cuántas horas: lo que eligió el médico, lo que dice la orden o 8. Con plan (MC6): el tramo vigente (por turno: 8). */
export const vitalsEvery = (file: Pick<InpatientFile, 'notes' | 'hospitalization' | 'consultOrders'>) => {
  const last = file.hospitalization.vitalsPlan?.at(-1)
  if (last) return last.mode === 'hours' ? last.hours : DEFAULT_VITALS_HOURS
  return file.hospitalization.vitalsEveryHours ?? frequencyFromOrders(file) ?? DEFAULT_VITALS_HOURS
}

// ---------- MC6 (ronda 6): la frecuencia la indica el médico en la nota ----------

const sameMode = (a: VitalsMode, b: VitalsMode) => a.mode === b.mode && (a.mode !== 'hours' || a.hours === b.hours)
export { sameMode as sameVitalsMode }

/**
 * La frecuencia vigente: la del último tramo del plan; si la estancia es de antes del plan, la que ya ve enfermería
 * (cada N horas). `fallback` es la de un ingreso nuevo (por turno).
 */
export function currentVitalsMode(file: Pick<InpatientFile, 'notes' | 'hospitalization' | 'consultOrders'>, fallback: VitalsMode = { mode: 'shift' }): VitalsMode {
  const last = file.hospitalization.vitalsPlan?.at(-1)
  if (last) return last.mode === 'hours' ? { mode: 'hours', hours: last.hours } : { mode: last.mode }
  const legacy = file.hospitalization.vitalsEveryHours ?? frequencyFromOrders(file)
  return legacy ? { mode: 'hours', hours: legacy } : fallback
}

/** «Signos vitales por turno (07:00, 15:00 y 23:00)», «Signos vitales cada 4 horas», «Sin control programado de signos vitales». */
export function vitalsModeText(m: VitalsMode) {
  if (m.mode === 'none') return 'Sin control programado de signos vitales'
  if (m.mode === 'shift') return `Signos vitales por turno (${VITALS_SHIFT_TIMES.slice(0, -1).join(', ')} y ${VITALS_SHIFT_TIMES.at(-1)})`
  return `Signos vitales cada ${m.hours} ${m.hours === 1 ? 'hora' : 'horas'}`
}
/** Corto, para el aviso: «por turno», «cada 4 h». */
export const vitalsModeShort = (m: VitalsMode) => (m.mode === 'none' ? 'sin control programado' : m.mode === 'shift' ? 'por turno' : `cada ${m.hours} h`)

/** La siguiente hora en punto desde `t` (si ya es en punto, esa misma). */
const nextHour = (t: number) => Math.ceil(t / HOUR) * HOUR

/** Horas de un tramo entre `from` y `to` (incluidas). Por turno: las horas de VITALS_SHIFT_TIMES de cada día. */
function segmentTakes(seg: VitalsSegment, from: number, to: number): number[] {
  if (seg.mode === 'none' || to < from) return []
  const out: number[] = []
  if (seg.mode === 'shift') {
    const day = new Date(from); day.setHours(0, 0, 0, 0)
    for (let d = day.getTime(); d <= to; d = new Date(new Date(d).setDate(new Date(d).getDate() + 1)).setHours(0, 0, 0, 0)) {
      for (const hm of VITALS_SHIFT_TIMES) {
        const [h, m] = hm.split(':').map(Number)
        const t = new Date(d).setHours(h, m, 0, 0)
        if (t >= from && t <= to) out.push(t)
      }
    }
    return out
  }
  // Cada N horas desde la siguiente hora aplicable (la hora en punto siguiente al cambio)
  const anchor = nextHour(new Date(seg.from).getTime())
  const step = seg.hours * HOUR
  for (let t = anchor + Math.max(0, Math.ceil((from - anchor) / step)) * step; t <= to; t += step) out.push(t)
  return out
}

/**
 * Tomas esperadas entre `from` y `to`. Con plan (MC6), tramo por tramo: un cambio sólo afecta desde que se indicó. Sin
 * plan, la regla de antes (cada N horas desde la primera toma).
 */
export function plannedTakes(file: Pick<InpatientFile, 'notes' | 'hospitalization' | 'vitals' | 'consultOrders'>, from: Date, to: Date): Date[] {
  const plan = file.hospitalization.vitalsPlan
  if (!plan?.length) return expectedTakes(from, to, vitalsEvery(file), vitalsAnchor(file))
  const out: number[] = []
  plan.forEach((seg, i) => {
    const s = Math.max(new Date(seg.from).getTime(), from.getTime())
    const e = Math.min(i + 1 < plan.length ? new Date(plan[i + 1].from).getTime() - 1 : Infinity, to.getTime())
    out.push(...segmentTakes(seg, s, e))
  })
  return out.sort((a, b) => a - b).map((t) => new Date(t))
}

/** La siguiente toma programada después de `now`, si hay. */
export const nextTake = (file: Pick<InpatientFile, 'notes' | 'hospitalization' | 'vitals' | 'consultOrders'>, now: Date) =>
  plannedTakes(file, now, new Date(now.getTime() + 3 * 24 * HOUR))[0]

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
  return plannedTakes(file, new Date(start.getTime() + TAKE_MARGIN_MS), end)
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

