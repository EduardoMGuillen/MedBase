/**
 * Configuración clínica: el único archivo donde se definen los valores clínicos por omisión de Clinara.
 *
 *   ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
 *   │ VALIDAR POR EMIL: todos los números de este archivo los debe revisar el responsable clínico   │
 *   │ antes de usarse con pacientes. Lo que cada clínica cambie en Configuración se guarda en la    │
 *   │ base de datos y manda sobre estos valores (umbrales críticos de laboratorio, banda térmica).  │
 *   └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Qué hay aquí:
 * - Rangos de signos vitales (`IMPOSSIBLE`, `ADULT_RANGES`, `PEDIATRIC_RANGES`): los usan la preclínica y el
 *   expediente (src/lib/vitals.ts).
 * - Banda normal de temperatura por omisión de la curva térmica (`DEFAULT_TEMP_BAND`).
 * - Umbrales críticos de laboratorio por grupo (`DEFAULT_CRITICAL_GROUPS`, AD1 de la ronda 5): fuera de ellos, un
 *   resultado avisa al médico como crítico. Los rangos de referencia de cada examen (alto/bajo) están en el
 *   catálogo base de exámenes (src/lib/exams.ts, `EXAMS`).
 */
import type { VitalKey } from './vitals.js'

/** [mínimo, máximo] aceptable; `null` es sin límite de ese lado. */
export type Range = readonly [number | null, number | null]

/** VALIDAR POR EMIL. Fuera de esto, el valor es imposible: se pide revisar y confirmar. Igual para todas las edades. */
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
 * VALIDAR POR EMIL. Rango clínico normal del adulto. Fuera de él se marca en ámbar. Los límites son inclusivos:
 * PAS ≥ 140 o < 90 queda fuera, así que el rango normal es 90 a 139.
 */
export const ADULT_RANGES: Partial<Record<VitalKey, Range>> = {
  systolic: [90, 139],
  diastolic: [60, 89],
  heartRate: [60, 100],
  respRate: [12, 20],
  temperature: [35.5, 37.9],
  spo2: [94, null],
  glucose: [70, 180],
  painScale: [null, 6],
}

/**
 * VALIDAR POR EMIL. Rangos pediátricos por edad (años cumplidos), referencias habituales (PALS). Lo que no aparece
 * usa el rango del adulto.
 */
export const PEDIATRIC_RANGES: { upTo: number; ranges: Partial<Record<VitalKey, Range>> }[] = [
  // Menores de 1 año
  { upTo: 0, ranges: { heartRate: [100, 160], respRate: [30, 60], systolic: [70, 110], diastolic: [35, 69] } },
  { upTo: 2, ranges: { heartRate: [90, 150], respRate: [24, 40], systolic: [72, 115], diastolic: [40, 74] } },
  { upTo: 5, ranges: { heartRate: [80, 140], respRate: [22, 34], systolic: [78, 119], diastolic: [45, 79] } },
  { upTo: 11, ranges: { heartRate: [70, 120], respRate: [18, 30], systolic: [85, 119], diastolic: [50, 79] } },
  { upTo: 17, ranges: { heartRate: [60, 100], respRate: [12, 20], systolic: [90, 129], diastolic: [55, 79] } },
]

/** VALIDAR POR EMIL. Banda normal de la curva térmica: desde `high` es fiebre, por debajo de `low` hipotermia. */
export const DEFAULT_TEMP_BAND = { low: 36, high: 38 }

/** Un analito con su umbral crítico. Un límite vacío es «No aplica». */
export interface CriticalAnalyte { id: string; name: string; unit?: string; low?: number; high?: number; archivedAt?: string }
/** Grupo de analitos («Hemograma», «Química sanguínea»…), como vienen los resultados del laboratorio. */
export interface CriticalGroup { id: string; name: string; archivedAt?: string; analytes: CriticalAnalyte[] }

const an = (id: string, name: string, unit: string, low?: number, high?: number): CriticalAnalyte => ({ id, name, unit: unit || undefined, low, high })

/**
 * VALIDAR POR EMIL. Umbrales críticos de laboratorio por grupo. Son los mismos números que había antes de la ronda 5
 * (la lista plana `DEFAULT_CRITICAL`), sólo repartidos en grupos y con su unidad.
 */
export const DEFAULT_CRITICAL_GROUPS: CriticalGroup[] = [
  { id: 'g-hemograma', name: 'Hemograma', analytes: [an('a-hb', 'Hemoglobina', 'g/dL', 7, 20), an('a-plaq', 'Plaquetas', '×10³/µL', 50, 1000), an('a-leu', 'Leucocitos', '×10³/µL', 2, 30)] },
  { id: 'g-quimica', name: 'Química sanguínea', analytes: [an('a-glu', 'Glucosa', 'mg/dL', 50, 400), an('a-cr', 'Creatinina', 'mg/dL', undefined, 5)] },
  { id: 'g-electrolitos', name: 'Electrolitos', analytes: [an('a-k', 'Potasio', 'mEq/L', 2.8, 6.2), an('a-na', 'Sodio', 'mEq/L', 120, 160)] },
  { id: 'g-coagulacion', name: 'Coagulación', analytes: [an('a-inr', 'INR', '', undefined, 5)] },
  { id: 'g-cardiacos', name: 'Marcadores cardíacos', analytes: [an('a-trop', 'Troponina I', 'ng/mL', undefined, 0.4)] },
  { id: 'g-otros', name: 'Otros', analytes: [an('a-ph', 'pH', '', 7.2, 7.6)] },
]

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * Umbrales vigentes, por nombre de analito (sin distinguir mayúsculas ni tildes): los analitos activos de los grupos
 * activos de la clínica o, si la clínica todavía no tiene los suyos, los de este archivo.
 */
export function criticalLimitsOf(groups?: CriticalGroup[] | null): Map<string, { low?: number; high?: number }> {
  const out = new Map<string, { low?: number; high?: number }>()
  for (const g of groups?.length ? groups : DEFAULT_CRITICAL_GROUPS) {
    if (g.archivedAt) continue
    for (const a of g.analytes) if (!a.archivedAt && (a.low != null || a.high != null)) out.set(norm(a.name), { low: a.low, high: a.high })
  }
  return out
}

/** ¿El valor cruza el umbral crítico de su analito? */
export function isCritical(limits: Map<string, { low?: number; high?: number }>, analyte: string, value: number) {
  const lim = limits.get(norm(analyte))
  return !!lim && Number.isFinite(value) && ((lim.low != null && value < lim.low) || (lim.high != null && value > lim.high))
}

/**
 * Migración (v47): los umbrales planos que la clínica ya tenía (`critical_limits`) pasan a los grupos sin cambiar
 * ningún número. Lo que no está en los grupos por omisión va a «Otros».
 */
export function groupsFromLimits(limits?: Record<string, { low?: number; high?: number }> | null): CriticalGroup[] {
  const groups: CriticalGroup[] = DEFAULT_CRITICAL_GROUPS.map((g) => ({ ...g, analytes: g.analytes.map((a) => ({ ...a })) }))
  const byName = new Map(groups.flatMap((g) => g.analytes.map((a) => [norm(a.name), a] as const)))
  const others = groups.find((g) => g.id === 'g-otros')!
  let n = 0
  for (const [name, v] of Object.entries(limits ?? {})) {
    const a = byName.get(norm(name))
    if (a) { a.low = v.low; a.high = v.high } else others.analytes.push({ id: `a-mig-${++n}`, name, low: v.low, high: v.high })
  }
  return groups
}
