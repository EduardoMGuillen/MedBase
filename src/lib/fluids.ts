import { FLUID_FREQUENCIES, FLUID_IN_ITEMS, FLUID_IV_RULE, FLUID_OUT_ITEMS, VITALS_SHIFT_TIMES } from './clinicalConfig.js'
import { fromLocalValue, toLocalDate, toLocalValue } from './dateInput.js'
import { canonicalRoute } from './format.js'
import { medLabel } from './inpatient.js'
import type { Dose, FluidEntry, FluidsMode, FluidsSegment, InpatientMed } from './types.js'

/**
 * IE1 (ronda 16): ingestas y excretas. Todo el cálculo está aquí (funciones puras, sin red ni pantalla): los cortes por turno o
 * cada 12/24 horas, los líquidos IV calculados de las infusiones y de las dosis intermitentes aplicadas, los registros manuales,
 * los totales y el balance. Las reglas clínicas (rubros, regla de las dosis IV) están en clinicalConfig.ts (VALIDAR: Emil).
 */

export const FLUIDS_ORDER = 'Cuantificar ingestas y excretas'
const HOUR = 3_600_000

export const fluidsModeLabel = (m: FluidsMode) => FLUID_FREQUENCIES.find((f) => f.value === m)?.label ?? 'Por turno'
/** «Cuantificar ingestas y excretas · Por turno (07:00, 15:00 y 23:00)». */
export function fluidsOrderText(m: FluidsMode | 'off') {
  if (m === 'off') return FLUIDS_ORDER
  const detail = m === 'shift' ? ` (${VITALS_SHIFT_TIMES.slice(0, -1).join(', ')} y ${VITALS_SHIFT_TIMES.at(-1)})` : ''
  return `${FLUIDS_ORDER} · ${fluidsModeLabel(m)}${detail}`
}

/** La orden vigente (el último tramo), o undefined si nunca se indicó o está suspendida. */
export function currentFluidsMode(plan?: FluidsSegment[]): FluidsMode | undefined {
  const last = plan?.at(-1)
  return last && last.mode !== 'off' ? last.mode : undefined
}

/**
 * Qué cambia una nota que trae la orden: 'new' (no había), 'modified' (otra frecuencia), 'omitted' (la suspende) o
 * 'continue' (igual). `null` si la nota no la toca (no había y no la indica).
 */
export function fluidsTag(plan: FluidsSegment[] | undefined, next: FluidsMode | 'off'): 'new' | 'modified' | 'omitted' | 'continue' | null {
  const cur = currentFluidsMode(plan)
  if (next === 'off') return cur ? 'omitted' : null
  if (!cur) return 'new'
  return cur === next ? 'continue' : 'modified'
}

/** Horas de corte de cada frecuencia (hora de Honduras). */
const CUTS: Record<FluidsMode, number[]> = {
  shift: VITALS_SHIFT_TIMES.map((t) => Number(t.split(':')[0])),
  h12: [Number(VITALS_SHIFT_TIMES[0].split(':')[0]), Number(VITALS_SHIFT_TIMES[0].split(':')[0]) + 12],
  h24: [Number(VITALS_SHIFT_TIMES[0].split(':')[0])],
}
/** El día clínico empieza en el primer turno (07:00). */
const DAY_START_H = Number(VITALS_SHIFT_TIMES[0].split(':')[0])
const pad = (n: number) => String(n).padStart(2, '0')

export interface FluidPeriod { start: number; end: number; label: string; /** Día clínico (07:00 a 07:00), «aaaa-mm-dd». */ day: string }

/** Los cortes que tocan [from, to): cada uno con su inicio, fin, etiqueta «07:00–15:00» y día clínico. */
export function fluidPeriods(mode: FluidsMode, from: number, to: number): FluidPeriod[] {
  if (!(to > from)) return []
  const cuts: number[] = []
  const first = fromLocalValue(toLocalDate(new Date(from - 24 * HOUR))).getTime()
  for (let d = first; d <= to + 24 * HOUR; d += 24 * HOUR) {
    const ymd = toLocalDate(new Date(d + 12 * HOUR))
    for (const h of CUTS[mode]) cuts.push(fromLocalValue(`${ymd}T${pad(h % 24)}:00`).getTime() + (h >= 24 ? 24 * HOUR : 0))
  }
  cuts.sort((a, b) => a - b)
  const out: FluidPeriod[] = []
  for (let i = 0; i < cuts.length - 1; i++) {
    const [start, end] = [cuts[i], cuts[i + 1]]
    if (end <= from || start >= to) continue
    const hm = (t: number) => toLocalValue(new Date(t)).slice(11, 16)
    out.push({ start, end, label: `${hm(start)}–${hm(end)}`, day: toLocalDate(new Date(start - DAY_START_H * HOUR)) })
  }
  return out
}

/** Volumen en mL de un texto («1000 ml», «Bolsa 500 mL», «1 L»). No cuenta un mL de concentración («40 mg/10 mL»). */
export function parseVolumeMl(text?: string): number | undefined {
  if (!text) return undefined
  const re = /(\d+(?:[.,]\d+)?)\s*(ml|cc|l|litros?)(?![a-záéíóú])/gi
  for (const m of text.matchAll(re)) {
    const before = text.slice(0, m.index).trimEnd()
    if (before.endsWith('/')) continue
    const n = Number(m[1].replace(',', '.'))
    const ml = /^l/i.test(m[2]) ? n * 1000 : n
    if (ml > 0 && ml <= FLUID_IV_RULE.maxDoseMl) return ml
  }
  return undefined
}

const isIv = (route: string) => FLUID_IV_RULE.routes.includes(canonicalRoute(route))
const given = (doses: Dose[], medId: string) => doses.filter((d) => d.medId === medId && d.status === FLUID_IV_RULE.countWhen)

export interface IvSource { medId: string; label: string; ml: number }
export interface FluidTotals {
  iv: number
  ivSources: IvSource[]
  /** Medicamentos IV aplicados en el corte sin volumen reconocible: no se inventa, se agregan a mano. */
  noVolume: string[]
  /** Infusiones indicadas sin hora de inicio registrada (no suman hasta que enfermería registre el inicio). */
  noStart: string[]
  in: Record<string, number>
  out: Record<string, number>
  totalIn: number
  totalOut: number
  balance: number
}
export interface FluidRow extends FluidPeriod, FluidTotals {}
export interface FluidDay extends FluidTotals { day: string; periods: FluidRow[] }

const round = (n: number) => Math.round(n * 10) / 10

/** Lo calculado y lo registrado entre `start` y `end` (fin abierto). `now` corta las infusiones que siguen corriendo. */
export function fluidTotals(x: { meds: InpatientMed[]; doses: Dose[]; entries: FluidEntry[] }, start: number, end: number, now: number): FluidTotals {
  const ivSources: IvSource[] = []
  const noVolume: string[] = []
  const noStart: string[] = []
  for (const m of x.meds.filter((y) => isIv(y.route))) {
    const ds = given(x.doses, m.id)
    if (m.infusionRate) {
      const first = ds.map((d) => new Date(d.givenAt).getTime()).sort((a, b) => a - b)[0]
      const stops = [m.infusionStoppedAt, m.stoppedAt].filter((t): t is string => !!t).map((t) => new Date(t).getTime())
      if (first === undefined) { if (new Date(m.orderedAt).getTime() < end && !stops.some((t) => t <= start)) noStart.push(medLabel(m)); continue }
      const until = Math.min(now, ...stops)
      const h = Math.max(0, Math.min(end, until) - Math.max(start, first)) / HOUR
      const perH = m.infusionUnit === 'ml/min' ? m.infusionRate * 60 : m.infusionRate
      if (h > 0) ivSources.push({ medId: m.id, label: medLabel(m), ml: round(perH * h) })
      continue
    }
    const inPeriod = ds.filter((d) => { const t = new Date(d.givenAt).getTime(); return t >= start && t < end })
    if (!inPeriod.length) continue
    let ml = 0
    let missing = false
    for (const d of inPeriod) {
      const v = parseVolumeMl(d.dose ?? m.dose) ?? parseVolumeMl(m.dose) ?? parseVolumeMl(m.presentation)
      if (v === undefined) missing = true; else ml += v
    }
    if (ml > 0) ivSources.push({ medId: m.id, label: medLabel(m), ml })
    if (missing) noVolume.push(medLabel(m))
  }
  const live = x.entries.filter((e) => !e.voidedAt && new Date(e.at).getTime() >= start && new Date(e.at).getTime() < end)
  const sum = (kind: 'in' | 'out', key: string) => live.filter((e) => e.kind === kind && e.item === key).reduce((s, e) => s + e.ml, 0)
  const inn = Object.fromEntries(FLUID_IN_ITEMS.map((i) => [i.key, sum('in', i.key)]))
  const out = Object.fromEntries(FLUID_OUT_ITEMS.map((i) => [i.key, sum('out', i.key)]))
  const iv = round(ivSources.reduce((s, y) => s + y.ml, 0))
  const totalIn = round(iv + Object.values(inn).reduce((s, n) => s + n, 0))
  const totalOut = round(Object.values(out).reduce((s, n) => s + n, 0))
  return { iv, ivSources, noVolume, noStart, in: inn, out, totalIn, totalOut, balance: round(totalIn - totalOut) }
}

/** Desde cuándo y hasta cuándo se lleva el registro: desde que se indicó la orden hasta ahora (o la suspensión o el egreso). */
export function fluidRange(plan: FluidsSegment[] | undefined, now: number, dischargedAt?: string): { from: number; to: number; mode: FluidsMode } | undefined {
  const firstOn = plan?.find((s) => s.mode !== 'off')
  if (!plan || !firstOn) return undefined
  const last = plan.at(-1)!
  const lastMode = [...plan].reverse().find((s) => s.mode !== 'off')!.mode as FluidsMode
  const to = Math.min(now, dischargedAt ? new Date(dischargedAt).getTime() : Infinity, last.mode === 'off' ? new Date(last.from).getTime() : Infinity)
  return { from: new Date(firstOn.from).getTime(), to, mode: lastMode }
}

/** La tabla completa: cada día clínico (el más reciente primero) con sus cortes y su total de 24 horas. */
export function fluidBalance(x: { plan?: FluidsSegment[]; meds: InpatientMed[]; doses: Dose[]; entries: FluidEntry[]; now: number; dischargedAt?: string }): FluidDay[] {
  const range = fluidRange(x.plan, x.now, x.dischargedAt)
  if (!range) return []
  // Lo registrado antes de la orden (o después de suspenderla) también cuenta en su corte: el rango se amplía a esos registros
  const times = x.entries.filter((e) => !e.voidedAt).map((e) => new Date(e.at).getTime())
  const from = Math.min(range.from, ...times)
  const to = Math.max(range.to, ...times.map((t) => t + 1))
  const rows: FluidRow[] = fluidPeriods(range.mode, from, to).map((p) => ({ ...p, ...fluidTotals(x, p.start, p.end, x.now) }))
  const days = new Map<string, FluidRow[]>()
  for (const r of rows) days.set(r.day, [...(days.get(r.day) ?? []), r])
  return [...days.entries()].map(([day, periods]) => {
    const t = fluidTotals(x, periods[0].start, periods.at(-1)!.end, x.now)
    return { day, periods, ...t }
  }).reverse()
}

/** «+300 mL», «−250 mL», «0 mL»: el balance siempre con su signo. */
export const signedMl = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtMl(Math.abs(n))}`
export const fmtMl = (n: number) => `${Number.isInteger(n) ? n.toLocaleString('es-HN') : n.toLocaleString('es-HN', { maximumFractionDigits: 1 })} mL`
export const fluidItemLabel = (kind: 'in' | 'out', key: string) => (kind === 'in' ? FLUID_IN_ITEMS : FLUID_OUT_ITEMS).find((i) => i.key === key)?.label ?? key
