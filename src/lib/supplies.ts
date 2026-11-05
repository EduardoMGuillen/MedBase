import { GENERAL_USE_LABEL, SUPPLY_DEFAULT_SHIFTS, SUPPLY_GAUGE_ONLY, SUPPLY_MAX_SHIFTS, SUPPLY_PERIODS, SUPPLY_UNITS } from './clinicalConfig.js'
import { clinicParts, fromLocalValue } from './dateInput.js'
import { normalize } from './patients.js'

/**
 * RU1 y RU2 (ronda 14): catálogo de material médico quirúrgico y periodo de registro. Lo comparten el servidor (carga del
 * .md, validación, periodos) y las pantallas (Configuración › Material médico quirúrgico, «Registrar material»).
 */

export type SupplyUnit = keyof typeof SUPPLY_UNITS
export const SUPPLY_UNIT_LIST = Object.keys(SUPPLY_UNITS) as SupplyUnit[]
export type SupplyPeriod = keyof typeof SUPPLY_PERIODS
export interface SupplyShift { key: string; label: string; from: string; to: string }
export interface SupplySettings { period: SupplyPeriod; shifts: SupplyShift[]; updatedAt?: string; updatedBy?: string }
export const DEFAULT_SUPPLY_SETTINGS: SupplySettings = { period: 'shift', shifts: SUPPLY_DEFAULT_SHIFTS }

export interface SupplyItem {
  id: string
  category: string
  material: string
  /** Calibre, tipo de aguja, talla o tamaño; vacío si no tiene. */
  variant: string
  unit: SupplyUnit
  onShiftList: boolean
  /** «catalog»: vino del .md; «clinic»: lo agregó la clínica. */
  origin: 'catalog' | 'clinic'
  /** Número de la fila del .md. */
  mdNo?: number
  /** La clínica lo editó: ninguna carga lo vuelve a tocar. */
  editedAt?: string
  /** La clínica marcó o desmarcó la lista de turno: la carga no la cambia. */
  listSetAt?: string
  archivedAt?: string
  archivedBy?: string
}

/** «Aguja hipodérmica 21 G», «Seda 4/0, aguja cortante», «Gorro descartable». */
export const supplyLabel = (i: Pick<SupplyItem, 'material' | 'variant'>) => (i.variant ? `${i.material} ${i.variant}` : i.material)

/** «1 par», «3 pares». */
export const unitText = (n: number, unit: string) => `${n} ${n === 1 ? unit : SUPPLY_UNITS[unit as SupplyUnit] ?? unit}`

/** ¿Se distingue solo por calibre (agujas, jeringas, catéteres, mariposas)? */
export const gaugeOnly = (material: string) => SUPPLY_GAUGE_ONLY.test(material)

const LENGTH_UNIT = String.raw`(?:"|”|''|pulgadas?\b|pulg\b\.?|in\b|mm\b|cm\b)`
const NUM = String.raw`\d+\s+\d\/\d|\d+\/\d+|\d+(?:[.,]\d+)?(?:\s*[½¼¾])?|[½¼¾]`

/**
 * RU1: agujas, jeringas, catéteres y mariposas se distinguen solo por calibre (G), nunca por longitud. Quita la longitud que
 * se haya escrito en la variante: «21 G × 1½"» → «21 G»; «25 × 1½» → «25 G»; «20 G, 32 mm» → «20 G». Lo demás no cambia
 * («5 mL, aguja 21 G»).
 */
export function stripLength(material: string, variant: string) {
  let v = variant.replace(/\s+/g, ' ').trim()
  if (!gaugeOnly(material)) return v
  v = v.replace(/\blongitud\b:?/gi, '')
  // «× 1½"», «x 1 pulgada», «× 32 mm», «x 1½»
  v = v.replace(new RegExp(String.raw`\s*[x×]\s*(?:${NUM})\s*${LENGTH_UNIT}?`, 'gi'), '')
  // «1 pulgada», «32 mm», «1½"» sueltos
  v = v.replace(new RegExp(String.raw`(?:^|[\s,;])(?:${NUM})\s*${LENGTH_UNIT}`, 'gi'), '')
  v = v.replace(/(\d{2})\s*G\b/gi, '$1 G')
  // Un calibre sin la G («25», «aguja 25»)
  v = v.replace(/(^|aguja\s+)(\d{2})(?=\s*(?:$|,))/i, '$1$2 G')
  return v.replace(/\s+/g, ' ').replace(/^[\s,;–-]+|[\s,;–-]+$/g, '').trim()
}

/** Clave de una línea: material y variante, sin tildes ni mayúsculas. */
export const supplyKey = (material: string, variant: string) => normalize(`${material}|${variant}`)

/** Las palabras de lo buscado están en el material, la variante o la categoría («seda 4» → «Seda 4/0, aguja cortante»). */
export const matchesSupply = (i: Pick<SupplyItem, 'material' | 'variant' | 'category'>, q: string) => {
  const words = normalize(q).split(' ').filter(Boolean)
  const text = normalize(`${i.material} ${i.variant} ${i.category}`)
  return words.every((w) => text.includes(w))
}

/** Agrupa por categoría en el orden de la lista (la primera línea de cada categoría manda). */
export function byCategory<T extends { category: string }>(list: T[]) {
  const out: { category: string; rows: T[] }[] = []
  for (const r of list) {
    const g = out.find((x) => x.category === r.category)
    if (g) g.rows.push(r)
    else out.push({ category: r.category, rows: [r] })
  }
  return out
}

// ---------- Lector del .md (RU1, carga inicial) ----------

export interface SupplyMdRow { no: number; category: string; material: string; variant: string; unit: SupplyUnit; onList: boolean; key: string; line: number }
export interface SupplyMdResult { rows: SupplyMdRow[]; skipped: { line: number; text: string; reason: string }[] }

const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
const plain = (s: string) => s.replace(/\*\*?([^*]+)\*\*?/g, '$1').replace(/\s+/g, ' ').trim()

/**
 * Lee la tabla de data/listado_material_medico_quirurgico.md: «# | Categoría | Material | Variante | Unidad | En la lista de
 * turno inicial». Se detiene en el primer título «##» después de la tabla: la sección «Cambios respecto al listado original»
 * no se carga. Variante «—» = sin variante. Las filas que no se pueden leer se devuelven en `skipped` con el motivo.
 */
export function parseSupplyMd(md: string): SupplyMdResult {
  const out: SupplyMdResult = { rows: [], skipped: [] }
  const seen = new Set<string>()
  let inTable = false
  const lines = md.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (/^#{1,3}\s/.test(l) && (inTable || out.rows.length)) break
    if (!l.trim().startsWith('|')) { if (inTable && l.trim()) inTable = false; continue }
    const c = cells(l)
    if (!inTable) {
      if (c[0] === '#' && normalize(c[1] ?? '') === 'categoria') inTable = true
      continue
    }
    if (c.every((x) => /^:?-{2,}:?$/.test(x))) continue
    const skip = (reason: string) => out.skipped.push({ line: i + 1, text: l.trim(), reason })
    if (c.length !== 6) { skip(`tiene ${c.length} columnas (se esperaban 6)`); continue }
    const [noText, category, material, variantRaw, unitRaw, listRaw] = c.map(plain)
    const no = Number(noText)
    const unit = normalize(unitRaw) as SupplyUnit
    if (!Number.isInteger(no) || no < 1) { skip('el número de línea no es válido'); continue }
    if (!category || !material) { skip('falta la categoría o el material'); continue }
    if (!SUPPLY_UNIT_LIST.includes(unit)) { skip(`unidad desconocida «${unitRaw}»`); continue }
    const variant = stripLength(material, /^[—–-]$/.test(variantRaw) ? '' : variantRaw)
    const key = supplyKey(material, variant)
    if (seen.has(key)) { skip('línea repetida (mismo material y variante)'); continue }
    seen.add(key)
    out.rows.push({ no, category, material, variant, unit, onList: /^s[ií]$/i.test(listRaw), key, line: i + 1 })
  }
  return out
}

// ---------- Periodo de registro (RU1 punto 7, RU2) ----------

const pad = (n: number) => String(n).padStart(2, '0')
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
export const validTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s)

/** «aaaa-mm-dd» más n días. */
export function addDays(ymd: string, n: number) {
  const [y, m, d] = ymd.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}
/** Lunes de la semana (lunes a domingo) de un día. */
export function mondayOf(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number)
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return addDays(ymd, -((wd + 6) % 7))
}
/** «05/11/2026». */
export const ymdText = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`
/** Día local (Honduras) de un instante. */
export const localDay = (d: Date) => { const p = clinicParts(d); return `${p.y}-${pad(p.mo)}-${pad(p.d)}` }

/** Problemas de una lista de turnos (vacía si está bien): nombres, horas válidas, sin repetir ni encimarse. */
export function shiftProblems(shifts: SupplyShift[]): string[] {
  const out: string[] = []
  if (!shifts.length) out.push('Agrega al menos un turno.')
  if (shifts.length > SUPPLY_MAX_SHIFTS) out.push(`Una clínica tiene hasta ${SUPPLY_MAX_SHIFTS} turnos.`)
  const names = new Set<string>()
  const used = new Array<string | undefined>(24 * 60)
  for (const s of shifts) {
    const name = s.label.trim()
    if (!name) { out.push('Cada turno lleva su nombre.'); continue }
    if (names.has(normalize(name))) out.push(`El turno «${name}» está repetido.`)
    names.add(normalize(name))
    if (!validTime(s.from) || !validTime(s.to)) { out.push(`${name}: escribe la hora de inicio y de fin en HH:mm.`); continue }
    if (s.from === s.to) { out.push(`${name}: la hora de fin debe ser distinta de la de inicio.`); continue }
    for (let t = toMin(s.from); t !== toMin(s.to); t = (t + 1) % (24 * 60)) {
      if (used[t]) { out.push(`${name} se cruza con ${used[t]}.`); break }
      used[t] = name
    }
  }
  return [...new Set(out)]
}

/** Inicio y fin (ISO) de un turno que empieza el día `ymd` (el de la noche termina al día siguiente). */
export function shiftBounds(ymd: string, s: SupplyShift) {
  const start = fromLocalValue(`${ymd}T${s.from}`)
  const end = fromLocalValue(`${toMin(s.to) > toMin(s.from) ? ymd : addDays(ymd, 1)}T${s.to}`)
  return { start: start.toISOString(), end: end.toISOString() }
}

/** El turno en que cae un instante y el día en que ese turno empezó (la Noche de las 03:00 empezó el día anterior). */
export function shiftAt(at: Date, shifts: SupplyShift[]): { shift: SupplyShift; day: string } | undefined {
  const p = clinicParts(at)
  const t = p.h * 60 + p.mi
  const today = `${p.y}-${pad(p.mo)}-${pad(p.d)}`
  for (const s of shifts) {
    const f = toMin(s.from)
    const e = toMin(s.to)
    if (f < e ? t >= f && t < e : t >= f) return { shift: s, day: today }
    if (f > e && t < e) return { shift: s, day: addDays(today, -1) }
  }
  return undefined
}

/** Un periodo del registro: de qué tipo, desde y hasta cuándo (ISO), y cómo se lee. */
export interface UsagePeriod {
  kind: SupplyPeriod | 'range'
  start: string
  end: string
  /** «Mañana 05/11/2026 (07:00–15:00)», «05/11/2026», «Semana del 02/11/2026 al 08/11/2026», «Del 01/11/2026 al 07/11/2026». */
  label: string
  /** Día con que empieza (para el nombre del archivo y la fecha de Excel). */
  day: string
  shiftKey?: string
  shiftLabel?: string
}

/** El periodo de un tipo que contiene el día (y el turno). */
export function periodOf(kind: SupplyPeriod, ymd: string, shifts: SupplyShift[], shiftKey?: string): UsagePeriod {
  if (kind === 'shift') {
    const s = shifts.find((x) => x.key === shiftKey) ?? shifts[0]
    if (s) {
      const b = shiftBounds(ymd, s)
      return { kind, ...b, label: `${s.label} ${ymdText(ymd)} (${s.from}–${s.to})`, day: ymd, shiftKey: s.key, shiftLabel: s.label }
    }
    kind = 'day'
  }
  if (kind === 'week') {
    const mon = mondayOf(ymd)
    return { kind, start: fromLocalValue(mon).toISOString(), end: fromLocalValue(addDays(mon, 7)).toISOString(), label: `Semana del ${ymdText(mon)} al ${ymdText(addDays(mon, 6))}`, day: mon }
  }
  return { kind: 'day', start: fromLocalValue(ymd).toISOString(), end: fromLocalValue(addDays(ymd, 1)).toISOString(), label: ymdText(ymd), day: ymd }
}

/** Rango de días (los dos incluidos). */
export function rangeOf(from: string, to: string): UsagePeriod {
  const [a, b] = from <= to ? [from, to] : [to, from]
  return { kind: 'range', start: fromLocalValue(a).toISOString(), end: fromLocalValue(addDays(b, 1)).toISOString(), label: a === b ? ymdText(a) : `Del ${ymdText(a)} al ${ymdText(b)}`, day: a }
}

/** El periodo actual de la clínica (el turno en curso, hoy o esta semana). */
export function currentPeriod(cfg: Pick<SupplySettings, 'period' | 'shifts'>, now = new Date()): UsagePeriod {
  if (cfg.period === 'shift') {
    const s = shiftAt(now, cfg.shifts)
    if (s) return periodOf('shift', s.day, cfg.shifts, s.shift.key)
  }
  return periodOf(cfg.period === 'week' ? 'week' : 'day', localDay(now), cfg.shifts)
}

/** Nombre del archivo de Excel: «Uso_material_2026-11-05_Mañana.xlsx» (con el turno), «Uso_medicamentos_2026-11-05.xlsx». */
export function usageFileName(tab: 'meds' | 'material', p: UsagePeriod, endDay?: string) {
  const base = tab === 'meds' ? 'Uso_medicamentos' : 'Uso_material'
  const range = p.kind === 'range' && endDay && endDay !== p.day ? `_a_${endDay}` : ''
  const shift = tab === 'material' && p.shiftLabel ? `_${p.shiftLabel.replace(/[\\/:*?"<>|\s]+/g, '_')}` : ''
  return `${base}_${p.day}${range}${shift}.xlsx`
}

export { GENERAL_USE_LABEL }
