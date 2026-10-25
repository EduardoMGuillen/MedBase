import type { Vitals } from './types.js'

/**
 * Rangos de signos vitales: el único lugar donde se definen. Los usan la preclínica (para avisar a
 * enfermería) y el expediente (para resaltar al médico).
 *
 * Dos niveles:
 * - `impossible`: casi seguro es un error de digitación (borde rojo y confirmación antes de guardar).
 * - `adult` / `pediatric`: fuera de rango clínico pero posible (ámbar; se guarda sin trabas).
 *
 * VALIDAR: los valores los propuso el médico responsable de la parte clínica (Emil) para adultos;
 * los pediátricos son referencias habituales (PALS) y deben revisarse antes de usarse con pacientes.
 * Por ahora se ajustan aquí; si la clínica necesita cambiarlos sin programador, convendría moverlos
 * a la configuración de la clínica.
 */

export type VitalKey = 'systolic' | 'diastolic' | 'heartRate' | 'respRate' | 'temperature' | 'spo2' | 'weightKg' | 'heightCm' | 'glucose' | 'painScale'

/** [mínimo, máximo] aceptable; `null` es sin límite de ese lado. */
type Range = readonly [number | null, number | null]

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

/** Fuera de esto, el valor es imposible: se pide revisar y confirmar. Igual para todas las edades. */
export const IMPOSSIBLE: Record<VitalKey, Range> = {
  systolic: [50, 300],
  diastolic: [20, 200],
  heartRate: [20, 300],
  respRate: [4, 80],
  temperature: [30, 45],
  spo2: [40, 100],
  weightKg: [0.3, 350],
  heightCm: [30, 250],
  glucose: [10, 1500],
  painScale: [0, 10],
}

/**
 * Rango clínico normal del adulto. Fuera de él se marca en ámbar. Los límites son inclusivos:
 * PAS ≥ 140 o < 90 queda fuera, así que el rango normal es 90 a 139.
 */
const ADULT: Partial<Record<VitalKey, Range>> = {
  systolic: [90, 139],
  diastolic: [60, 89],
  heartRate: [60, 100],
  respRate: [12, 20],
  temperature: [35.5, 37.9],
  spo2: [94, null],
  glucose: [70, 180],
  painScale: [null, 6],
}

/** Rangos pediátricos por edad (años cumplidos). Lo que no aparece usa el rango del adulto. */
const PEDIATRIC: { upTo: number; ranges: Partial<Record<VitalKey, Range>> }[] = [
  // Menores de 1 año
  { upTo: 0, ranges: { heartRate: [100, 160], respRate: [30, 60], systolic: [70, 110], diastolic: [35, 69] } },
  { upTo: 2, ranges: { heartRate: [90, 150], respRate: [24, 40], systolic: [72, 115], diastolic: [40, 74] } },
  { upTo: 5, ranges: { heartRate: [80, 140], respRate: [22, 34], systolic: [78, 119], diastolic: [45, 79] } },
  { upTo: 11, ranges: { heartRate: [70, 120], respRate: [18, 30], systolic: [85, 119], diastolic: [50, 79] } },
  { upTo: 17, ranges: { heartRate: [60, 100], respRate: [12, 20], systolic: [90, 129], diastolic: [55, 79] } },
]

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
