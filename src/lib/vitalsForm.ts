import { parseDecimal, VITALS, vitalLevel, type VitalKey } from './vitals'

/**
 * Formulario de signos vitales: el mismo en la preclínica y en la hoja de signos de la estancia. Cada campo se revisa
 * al salir de él (nunca mientras se escribe): rojo si el valor es imposible (pide confirmar) y ámbar si está fuera de
 * rango. Los rangos están en `vitals.ts`.
 */
export const FIELDS: VitalKey[] = ['systolic', 'diastolic', 'heartRate', 'respRate', 'temperature', 'spo2', 'weightKg', 'heightCm', 'glucose', 'painScale']
/** La presión se revisa en pareja: al escribir una, se vuelve a revisar la otra al salir. */
export const PAIR: VitalKey[] = ['systolic', 'diastolic']
export type VitalsForm = Record<VitalKey, string> & { notes: string }
export const EMPTY_VITALS: VitalsForm = { systolic: '', diastolic: '', heartRate: '', respRate: '', temperature: '', spo2: '', weightKg: '', heightCm: '', glucose: '', painScale: '', notes: '' }

/** Problema de un campo ya revisado: `error` pide confirmar antes de guardar; `warn` sólo avisa al médico. */
export function fieldIssue(k: VitalKey, v: VitalsForm, ageYears?: number): { level: 'error' | 'warn'; text: string } | null {
  const x = parseDecimal(v[k])
  if (x === undefined) return null
  if (Number.isNaN(x)) return { level: 'error', text: 'Revise el valor: no es un número.' }
  if (k === 'painScale' && !Number.isInteger(x)) return { level: 'error', text: 'Revise el valor: el dolor va de 0 a 10, sin decimales.' }
  const level = vitalLevel(k, x, ageYears)
  if (level === 'error') return { level, text: 'Revise el valor.' }
  // La sistólica menor que la diastólica casi siempre es un error de digitación; se avisa en la sistólica
  const d = parseDecimal(v.diastolic)
  if (k === 'systolic' && d != null && !Number.isNaN(d) && vitalLevel('diastolic', d, ageYears) !== 'error' && x <= d) {
    return { level: 'error', text: 'La sistólica es menor o igual que la diastólica: posible error.' }
  }
  if (level === 'warn') return { level, text: 'Fuera de rango, el médico verá la alerta.' }
  return null
}

/** Valor numérico de un campo (entero o con decimales, según el signo); vacío o inválido: undefined. */
export function vitalNumber(v: VitalsForm, k: VitalKey) {
  const x = parseDecimal(v[k])
  return x === undefined || Number.isNaN(x) ? undefined : VITALS[k].decimals ? x : Math.round(x)
}
