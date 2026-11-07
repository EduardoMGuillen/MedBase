import type { InfusionUnit, PrescriptionItem } from './types.js'
import type { Nebulization } from './medExtras.js'
import { INFUSION_UNITS } from './clinicalConfig.js'
import { durationDays, formatRate, frequencyHours, twoDecimals } from './inpatient.js'
import { isPrnFrequency, PRN_FREQUENCY, STAT_FREQUENCY } from './catalogs.js'

/**
 * ME16 (ronda 16): un solo formulario de medicamento para la consulta externa (sin y con ingreso), las notas de observación y
 * hospitalización y la receta. El formulario trabaja con un borrador único (`MedDraft`) y lo convierte, al guardar, en lo que
 * guarda cada lugar: un renglón de la receta (`PrescriptionItem`) o una orden de la hoja (`NewMed`). Las diferencias por lugar
 * son solo de qué se muestra (`medFormShows`), según la tabla de ME16 del pedido.
 */

/** Dónde se usa el formulario. */
export type MedPlace =
  /** Consulta externa: `admitting` = «Ingreso a observación» o «Ingreso a hospitalización» marcado. */
  | { where: 'consult'; admitting: boolean; canApply?: boolean }
  /** Notas de ingreso, evolución y postquirúrgica de una estancia (observación u hospitalización). */
  | { where: 'stay' }
  /** Receta suelta, receta de egreso y corrección de la receta de una consulta. */
  | { where: 'rx' }

/** ME16: la frecuencia de una infusión continua en la receta de la consulta (la velocidad va aparte). */
export const INFUSION_FREQUENCY = 'Infusión'
export const STANDARD_HOURS = [4, 6, 8, 12, 24]

export interface MedDraft {
  drug: string
  presentation: string
  dose: string
  route: string
  /** '8' (cada 8 horas), 'once' (dosis única; con PRN: sin intervalo fijo), 'infusion' o 'custom' (texto que trajo la receta). */
  freq: string
  customFreq?: string
  prn: boolean
  prnCondition: string
  /** Total de días como se escribe («3 días», «1 semana»); vacío: hasta nueva orden. */
  duration: string
  quantity: string
  instructions: string
  /** Consulta: «Aplicar en la clínica» (undefined: sin elegir). */
  applyInClinic?: boolean
  buyOutside: boolean
  loading: boolean
  loadingDose: string
  /** ME2: la dosis inicial es «Ahora (STAT)» (o a la hora `firstAt`). */
  loadingNow: boolean
  /** Hora de la dosis o de inicio de la infusión, como valor de DateTimeField («aaaa-mm-ddTHH:mm»); vacío: no se eligió. */
  firstAt: string
  rate: string
  infusionUnit: InfusionUnit
  nebulization?: Nebulization
}

/** Una orden de medicamento de una estancia (lo que se manda en la nota). Misma forma que `NewMed` del store. */
export interface StayMed {
  drug: string; presentation?: string; dose: string; route: string; everyHours?: number; prn: boolean; prnCondition?: string
  instructions?: string; days?: number; replacesId?: string; infusionRate?: number; infusionUnit?: InfusionUnit
  loadingDose?: string; loadingStat?: boolean; nebulization?: Nebulization; buyOutside?: boolean; buyQuantity?: string
  /** ME16 (ronda 16): cantidad total, como en la receta. */
  quantity?: string
  firstAt?: string
}

export const blankDraft = (place: MedPlace): MedDraft => ({
  drug: '', presentation: '', dose: '', route: place.where === 'stay' ? 'Intravenosa' : 'Oral', freq: '8', prn: false, prnCondition: '', duration: '', quantity: '',
  instructions: '', buyOutside: false, loading: false, loadingDose: '', loadingNow: true, firstAt: '', rate: '', infusionUnit: 'ml/h',
})

/** ¿En este lugar se puede indicar una infusión? Solo con ingreso o en una estancia (ME13: sin ingreso, solo dosis STAT). */
export const canInfuse = (place: MedPlace) => place.where === 'stay' || (place.where === 'consult' && place.admitting)

/** La frecuencia del borrador como texto de la receta («Cada 8 horas», «Cada 8 horas si es necesario», «PRN (si es necesario)»). */
export function frequencyOf(d: Pick<MedDraft, 'freq' | 'prn' | 'customFreq'>) {
  if (d.freq === 'infusion') return INFUSION_FREQUENCY
  if (d.freq === 'custom') return d.customFreq ?? ''
  if (d.freq === 'once') return d.prn ? PRN_FREQUENCY : STAT_FREQUENCY
  return d.prn ? `Cada ${d.freq} horas si es necesario` : `Cada ${d.freq} horas`
}

/** Un renglón de la receta como borrador del formulario. */
export function draftFromItem(it: Partial<PrescriptionItem>, place: MedPlace): MedDraft {
  const f = it.frequency ?? 'Cada 8 horas'
  const hours = frequencyHours(f)
  const prn = isPrnFrequency(f)
  const freq = it.infusionRate || f === INFUSION_FREQUENCY ? 'infusion' : hours ? String(hours) : /única/i.test(f) || prn ? 'once' : 'custom'
  return {
    ...blankDraft(place), drug: it.drug ?? '', presentation: it.presentation ?? '', dose: it.dose ?? '', route: it.route ?? (place.where === 'stay' ? 'Intravenosa' : 'Oral'),
    freq, customFreq: freq === 'custom' ? f : undefined, prn: prn && freq !== 'infusion', prnCondition: it.prnCondition ?? '', duration: it.duration ?? '', quantity: it.quantity ?? '',
    instructions: it.instructions ?? '', applyInClinic: it.applyInClinic, buyOutside: !!it.buyOutside, loading: !!it.loadingDose, loadingDose: it.loadingDose ?? '',
    rate: it.infusionRate ? formatRate(it.infusionRate) : '', infusionUnit: it.infusionUnit ?? 'ml/h', firstAt: it.firstAt ?? '',
    nebulization: it.nebulization ? structuredClone(it.nebulization) : undefined,
  }
}

/** Una orden de la estancia como borrador (`firstAt` ya viene como valor del campo de fecha y hora). */
export function draftFromStay(m: Partial<StayMed>, place: MedPlace): MedDraft {
  return {
    ...blankDraft(place), drug: m.drug ?? '', presentation: m.presentation ?? '', dose: m.dose ?? '', route: m.route ?? 'Intravenosa',
    freq: m.infusionRate ? 'infusion' : m.everyHours ? String(m.everyHours) : 'once', prn: !!m.prn && !m.infusionRate, prnCondition: m.prnCondition ?? '',
    duration: m.days ? `${m.days} día${m.days === 1 ? '' : 's'}` : '', quantity: m.quantity ?? m.buyQuantity ?? '', instructions: m.instructions ?? '',
    buyOutside: !!m.buyOutside, loading: !!m.loadingDose, loadingDose: m.loadingDose ?? '', loadingNow: m.loadingStat !== false, firstAt: m.firstAt ?? '',
    rate: m.infusionRate ? formatRate(m.infusionRate) : '', infusionUnit: m.infusionUnit ?? 'ml/h', nebulization: m.nebulization ? structuredClone(m.nebulization) : undefined,
  }
}

/** ME1 y ME16: qué le falta a la velocidad de infusión (vacío: está bien). Mismo texto en la consulta, las notas y el servidor. */
export function rateIssue(rate: string | number | undefined, unit: string = 'ml/h') {
  const u = INFUSION_UNITS.find((x) => x.value === unit) ?? INFUSION_UNITS[0]
  const raw = typeof rate === 'number' ? String(rate) : (rate ?? '').trim()
  if (!raw) return 'Escribe la velocidad de infusión.'
  const n = Number(raw.replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return 'La velocidad debe ser un número mayor que 0.'
  if (!twoDecimals(n)) return 'Hasta dos decimales.'
  if (n > u.max) return `No puede pasar de ${u.max} ${u.label}.`
  return ''
}

/** Los días de una orden de la estancia (1 a 365); `null`: lo escrito no es un número de días. */
export function stayDays(duration: string): number | undefined | null {
  if (!duration.trim()) return undefined
  const n = durationDays(duration)
  return n && n >= 1 && n <= 365 ? n : null
}

/**
 * ME16 (ronda 16): qué valida el servidor en un renglón de la receta de la consulta. La infusión solo con ingreso (ME13: sin
 * ingreso, solo dosis STAT) y con su velocidad; la misma regla que el formulario. Devuelve el mensaje o vacío.
 */
export function consultItemIssue(it: Pick<PrescriptionItem, 'drug' | 'frequency' | 'infusionRate' | 'infusionUnit' | 'loadingDose' | 'nebulization'>, o: { admitting: boolean }) {
  const infusion = it.frequency === INFUSION_FREQUENCY || !!it.infusionRate
  if (!infusion) return ''
  if (!o.admitting) return `${it.drug}: la infusión va con ingreso a observación u hospitalización. Sin ingreso solo se aplica una dosis STAT.`
  if (it.frequency !== INFUSION_FREQUENCY) return `${it.drug}: una infusión continua no lleva otra frecuencia.`
  if (it.loadingDose || it.nebulization) return `${it.drug}: una infusión no lleva primera dosis distinta ni nebulización.`
  const r = rateIssue(it.infusionRate, it.infusionUnit)
  return r ? `${it.drug}: ${r.charAt(0).toLowerCase()}${r.slice(1)}` : ''
}
