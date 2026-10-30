import type { Vitals } from './types.js'
import { ADULT_RANGES as ADULT, IMPOSSIBLE, PEDIATRIC_RANGES as PEDIATRIC, type Range } from './clinicalConfig.js'

/**
 * Rangos de signos vitales. Los usan la preclínica (para avisar a
 * enfermería) y el expediente (para resaltar al médico).
 *
 * Dos niveles:
 * - `impossible`: casi seguro es un error de digitación (borde rojo y confirmación antes de guardar).
 * - `adult` / `pediatric`: fuera de rango clínico pero posible (ámbar; se guarda sin trabas).
 *
 * Los números están en src/lib/clinicalConfig.ts, el archivo único de configuración clínica (VALIDAR POR EMIL):
 * los de adultos los propuso el responsable clínico; los pediátricos son referencias habituales (PALS).
 */

export type VitalKey = 'systolic' | 'diastolic' | 'heartRate' | 'respRate' | 'temperature' | 'spo2' | 'weightKg' | 'heightCm' | 'glucose' | 'painScale'

export const VITALS: Record<VitalKey, { label: string; unit: string; decimals: boolean }> = {
  systolic: { label: 'Presión sistólica', unit: 'mmHg', decimals: false },
  diastolic: { label: 'Presión diastólica', unit: 'mmHg', decimals: false },
  heartRate: { label: 'Frecuencia cardíaca', unit: 'lpm', decimals: false },
  respRate: { label: 'Frecuencia respiratoria', unit: 'rpm', decimals: false },
  temperature: { label: 'Temperatura', unit: '°C', decimals: true },
  spo2: { label: 'Saturación O₂', unit: '%', decimals: false },
  weightKg: { label: 'Peso', unit: 'kg', decimals: true },
  heightCm: { label: 'Talla', unit: 'cm', decimals: true },
  glucose: { label: 'Glucometría', unit: 'mg/dL', decimals: true },
  painScale: { label: 'Dolor', unit: '0 a 10', decimals: false },
}

export { IMPOSSIBLE }

/** Rango clínico según la edad. Sin edad conocida se usa el del adulto. */
export function clinicalRange(key: VitalKey, ageYears?: number): Range | undefined {
  if (ageYears != null && ageYears < 18) {
    const band = PEDIATRIC.find((b) => ageYears <= b.upTo)
    if (band?.ranges[key]) return band.ranges[key]
  }
  return ADULT[key]
}

export type VitalLevel = 'ok' | 'warn' | 'error'

const outside = ([min, max]: Range, v: number) => (min != null && v < min) || (max != null && v > max)

/** Nivel de alerta de un valor ya escrito. */
export function vitalLevel(key: VitalKey, value: number, ageYears?: number): VitalLevel {
  if (outside(IMPOSSIBLE[key], value)) return 'error'
  const r = clinicalRange(key, ageYears)
  return r && outside(r, value) ? 'warn' : 'ok'
}

/** Acepta "37,5" y "37.5". Devuelve `undefined` si está vacío y `NaN` si no es un número. */
export function parseDecimal(raw: string): number | undefined {
  const t = raw.trim().replace(',', '.')
  if (!t) return undefined
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN
}

/** Signos de una preclínica que quedan fuera del rango clínico (para el expediente). */
export function vitalWarnings(v: Partial<Pick<Vitals, VitalKey>>, ageYears?: number): VitalKey[] {
  return (Object.keys(VITALS) as VitalKey[]).filter((k) => {
    const x = v[k]
    return x != null && vitalLevel(k, x, ageYears) !== 'ok'
  })
}
