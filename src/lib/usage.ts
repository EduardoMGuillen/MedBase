import { GENERAL_USE_LABEL, USAGE_AREAS } from './clinicalConfig.js'
import { normalize } from './patients.js'
import { supplyLabel, type SupplyUnit } from './supplies.js'

/**
 * RU2 y RU3 (ronda 14): «Registro de uso de medicamentos y material». Tipos y cuentas que comparten el servidor, la pantalla,
 * la impresión y el Excel (así los cuatro suman igual).
 */

export type UsageArea = keyof typeof USAGE_AREAS
export const USAGE_AREA_LIST = Object.keys(USAGE_AREAS) as UsageArea[]

/** Una aplicación de un medicamento (dosis «Administrado» de la hoja o aplicación de consulta externa de ME13). */
export interface MedUse {
  id: string
  source: 'dose' | 'consult'
  patientId: string
  patientName: string
  record: string
  area: UsageArea
  /** «Consulta externa», «Observación · Cuarto 101», «Hospitalización · Cuarto 201». */
  location: string
  /** Hora en que se aplicó (ISO). */
  at: string
  /** Texto completo de la orden: nombre, presentación, dosis y vía. */
  medication: string
  drug: string
  presentation?: string
  /** Dosis aplicada («1 g»), para el total del resumen. */
  dose?: string
  appliedBy: string
  appliedByTitle?: string
  orderedBy: string
}

export interface MaterialLine { itemId: string; category: string; material: string; variant: string; unit: SupplyUnit; quantity: number }

/** Un registro de material: un paciente (o el uso general del servicio), su periodo y sus materiales. */
export interface MaterialRecord {
  id: string
  patientId?: string
  general: boolean
  patientName: string
  record: string
  area?: UsageArea
  location: string
  periodKind: 'shift' | 'day' | 'week'
  periodStart: string
  periodEnd: string
  periodLabel: string
  shiftKey?: string
  items: MaterialLine[]
  recordedBy: string
  recordedByName: string
  recordedAt: string
  version: number
  /** GE4: hasta cuándo el autor lo puede corregir. */
  graceUntil?: string
  correctedAt?: string
  voidedAt?: string
  voidedBy?: string
  voidedByName?: string
  voidReason?: string
}

/** Un bloque por paciente (nombre, expediente, ubicación); el uso general del servicio va al final. */
export interface PatientBlock<T> { key: string; patientId?: string; general: boolean; name: string; record: string; location: string; rows: T[] }

export function byPatient<T extends { patientId?: string; general?: boolean; patientName: string; record: string; location: string }>(rows: T[], sortRows?: (a: T, b: T) => number): PatientBlock<T>[] {
  const map = new Map<string, PatientBlock<T>>()
  for (const r of rows) {
    const key = r.general ? 'general' : r.patientId ?? r.patientName
    const b = map.get(key)
    if (b) { b.rows.push(r); continue }
    map.set(key, { key, patientId: r.patientId, general: !!r.general, name: r.general ? GENERAL_USE_LABEL : r.patientName, record: r.general ? '' : r.record, location: r.general ? '' : r.location, rows: [r] })
  }
  const list = [...map.values()].sort((a, b) => Number(a.general) - Number(b.general) || a.name.localeCompare(b.name, 'es'))
  if (sortRows) list.forEach((b) => b.rows.sort(sortRows))
  return list
}

// ---------- Medicamentos: resumen (modo suma, A11) ----------

const UNIT_ALIAS: Record<string, string> = { gr: 'g', grs: 'g', gramo: 'g', gramos: 'g', ml: 'mL', cc: 'mL', mcg: 'mcg', µg: 'mcg', ug: 'mcg', ui: 'UI', u: 'UI', mg: 'mg', g: 'g' }
/** «1 g» → 1 g; «500 mg» → 500 mg; «2 ampollas» → 2 ampollas. Lo que no es «número unidad» no se suma. */
export function parseDose(dose?: string): { value: number; unit: string } | null {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*([A-Za-zÁÉÍÓÚáéíóúñµ%]+(?:\/[A-Za-z]+)?)\s*$/.exec(dose ?? '')
  if (!m) return null
  const raw = m[2]
  const unit = UNIT_ALIAS[raw.toLowerCase()] ?? raw.toLowerCase().replace(/s$/, '')
  return { value: Number(m[1].replace(',', '.')), unit }
}
const num = (n: number) => String(Math.round(n * 1000) / 1000)

export interface MedSummaryRow { key: string; drug: string; presentation: string; label: string; count: number; total?: number; unit?: string }

/** Por medicamento y presentación: cuántas aplicaciones y, si todas las dosis tienen la misma unidad, el total. */
export function medSummary(rows: MedUse[]): MedSummaryRow[] {
  const map = new Map<string, { drug: string; presentation: string; doses: (string | undefined)[] }>()
  for (const r of rows) {
    const key = normalize(`${r.drug}|${r.presentation ?? ''}`)
    const g = map.get(key) ?? { drug: r.drug, presentation: r.presentation ?? '', doses: [] }
    g.doses.push(r.dose)
    map.set(key, g)
  }
  return [...map.entries()].map(([key, g]) => {
    const parsed = g.doses.map(parseDose)
    const same = parsed.every((p) => p && p.unit === parsed[0]!.unit)
    const total = same ? parsed.reduce((s, p) => s + p!.value, 0) : undefined
    return { key, drug: g.drug, presentation: g.presentation, label: g.presentation ? `${g.drug} ${g.presentation.toLowerCase()}` : g.drug, count: g.doses.length, total, unit: same ? parsed[0]!.unit : undefined }
  }).sort((a, b) => a.label.localeCompare(b.label, 'es'))
}
/** «Ceftriaxona vial 1 g · 6 aplicaciones · 6 g». */
export const summaryText = (s: MedSummaryRow) => `${s.label} · ${s.count} ${s.count === 1 ? 'aplicación' : 'aplicaciones'}${s.total != null ? ` · ${num(s.total)} ${s.unit}` : ''}`
export const totalText = (s: MedSummaryRow) => (s.total != null ? `${num(s.total)} ${s.unit}` : '—')

// ---------- Material: modo suma por paciente y total del periodo ----------

export interface MaterialSum {
  key: string
  itemId: string
  category: string
  material: string
  variant: string
  unit: SupplyUnit
  label: string
  quantity: number
  /** Los registros que lo forman (también los anulados, que no suman). */
  parts: { recordId: string; by: string; at: string; quantity: number; voided: boolean; periodLabel: string }[]
}

const sumOf = (records: MaterialRecord[], into = new Map<string, MaterialSum>()) => {
  for (const r of records) {
    for (const it of r.items) {
      const s = into.get(it.itemId) ?? { key: it.itemId, itemId: it.itemId, category: it.category, material: it.material, variant: it.variant, unit: it.unit, label: supplyLabel(it), quantity: 0, parts: [] }
      if (!r.voidedAt) s.quantity += it.quantity
      s.parts.push({ recordId: r.id, by: r.recordedByName, at: r.recordedAt, quantity: it.quantity, voided: !!r.voidedAt, periodLabel: r.periodLabel })
      into.set(it.itemId, s)
    }
  }
  return into
}
const byCatalog = (a: MaterialSum, b: MaterialSum) => a.category.localeCompare(b.category, 'es') || a.label.localeCompare(b.label, 'es')

/** Los materiales de un bloque, sumados (modo suma): «Guante estéril No. 7.5 × 2» dos veces = 4. Los anulados no suman. */
export const materialSums = (records: MaterialRecord[]) => [...sumOf(records).values()].sort(byCatalog)

/** «Total del periodo» por material y variante (todos los pacientes más el uso general), sin los que solo tienen anulados. */
export const materialTotals = (records: MaterialRecord[]) => materialSums(records).filter((s) => s.quantity > 0)

/** Una fila por paciente, periodo y material (para el Excel «Por paciente»). */
export function materialRows(records: MaterialRecord[]) {
  const blocks = byPatient(records)
  const out: { periodStart: string; periodLabel: string; patient: string; record: string; location: string; sum: MaterialSum; by: string[] }[] = []
  for (const b of blocks) {
    const periods = new Map<string, MaterialRecord[]>()
    for (const r of b.rows) periods.set(r.periodStart, [...(periods.get(r.periodStart) ?? []), r])
    for (const [start, recs] of [...periods.entries()].sort(([a], [z]) => a.localeCompare(z))) {
      for (const s of materialTotals(recs)) {
        const by = [...new Set(s.parts.filter((p) => !p.voided).map((p) => p.by))]
        out.push({ periodStart: start, periodLabel: recs[0].periodLabel, patient: b.name, record: b.record, location: b.location, sum: s, by })
      }
    }
  }
  return out
}

/** «Todas», «Consulta externa»… */
export const areaText = (a: UsageArea | 'all') => (a === 'all' ? 'Todas' : USAGE_AREAS[a])
