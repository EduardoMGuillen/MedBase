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

/**
 * MC6 (ronda 6). VALIDAR: Emil. Signos vitales «Por turno»: las horas de cada toma (una por turno). Es el valor por defecto
 * de un ingreso nuevo a observación u hospitalización.
 */
export const VITALS_SHIFT_TIMES = ['07:00', '15:00', '23:00']
/** MC6 (ronda 6). VALIDAR: Emil. Frecuencias de signos vitales que se eligen de la lista (en horas); «Otra frecuencia…» pide el número. */
export const VITALS_EVERY_OPTIONS = [1, 2, 4, 6, 8, 12, 24]
/** MC6 (ronda 6). VALIDAR: Emil. Límites de «Otra frecuencia…» (horas). */
export const VITALS_OTHER_RANGE = { min: 1, max: 72 }
/** EN2 (ronda 6). VALIDAR: Emil. Una toma anotada más de estos minutos después de la hora en que se tomó es «Registro tardío». */
export const LATE_RECORD_MINUTES = 60

/**
 * CX1 (ronda 8). VALIDAR: Emil. Roles que ven la Consulta externa agrupada «Por hora | Por médico» (sólo en una clínica:
 * en un consultorio hay un solo médico). Para activarlo en otro rol, se agrega aquí ('reception', 'nurse', 'doctor').
 */
export const QUEUE_GROUP_ROLES: string[] = ['admin']

/**
 * ME1 (ronda 8). VALIDAR: Emil. Infusión: unidades de la velocidad (la primera es la de por omisión) y su máximo. El máximo
 * sólo frena un error de dedo (p. ej. 5000 en vez de 50); no es una dosis máxima de ningún medicamento.
 */
export const INFUSION_UNITS = [{ value: 'ml/h', label: 'mL/h', max: 1000 }, { value: 'ml/min', label: 'mL/min', max: 20 }] as const

/**
 * EX3 (ronda 8). VALIDAR: Emil. Estudios de Rayos X: el informe es opcional. Son los del subgrupo del catálogo y los no
 * catalogados de Imagen y gabinete cuyo nombre empieza por uno de estos prefijos (sin importar mayúsculas ni tildes).
 */
export const XRAY_SUBGROUPS = ['Rayos X']
export const XRAY_PREFIXES = ['Rayos X', 'Radiografía', 'Rx']

/** RF1 (ronda 8). VALIDAR: Emil. Pie fijo de la hoja de referencia (confidencialidad). Sin citas legales en pantalla. */
export const REFERRAL_FOOTER = 'Documento confidencial. Contiene información clínica para uso exclusivo del personal de salud del centro receptor.'

/** RF1. VALIDAR: Emil. Texto de la casilla obligatoria antes de firmar la referencia. */
export const REFERRAL_CONSENT = 'El paciente (o su representante) fue informado de la referencia y está de acuerdo en que su información clínica se comparta con el centro receptor.'

/** Un analito con su umbral crítico. Un límite vacío es «No aplica». */
export interface CriticalAnalyte { id: string; name: string; unit?: string; low?: number; high?: number; archivedAt?: string
  /** Ronda 8: la fuente del umbral que trae la app (referencia bibliográfica). Los que agrega la clínica no la tienen. */
  source?: string }
/** Grupo de analitos («Hemograma», «Química sanguínea»…), como vienen los resultados del laboratorio. */
export interface CriticalGroup { id: string; name: string; archivedAt?: string; analytes: CriticalAnalyte[] }

const an = (id: string, name: string, unit: string, low?: number, high?: number): CriticalAnalyte => ({ id, name, unit: unit || undefined, low, high })

/**
 * VALIDAR POR EMIL. Umbrales críticos de laboratorio por grupo. Son los mismos números que había antes de la ronda 5
 * (la lista plana `DEFAULT_CRITICAL`), sólo repartidos en grupos y con su unidad. Ronda 8: aquí va la lista completa del
 * catálogo con la fuente de cada umbral (`source`), cuando llegue el .md de Emil; las clínicas la reciben sola
 * (`mergeCriticalGroups`) sin perder lo que cambiaron.
 */
export const DEFAULT_CRITICAL_GROUPS: CriticalGroup[] = [
  { id: 'g-hemograma', name: 'Hemograma', analytes: [an('a-hb', 'Hemoglobina', 'g/dL', 7, 20), an('a-plaq', 'Plaquetas', '×10³/µL', 50, 1000), an('a-leu', 'Leucocitos', '×10³/µL', 2, 30)] },
  { id: 'g-quimica', name: 'Química sanguínea', analytes: [an('a-glu', 'Glucosa', 'mg/dL', 50, 400), an('a-cr', 'Creatinina', 'mg/dL', undefined, 5)] },
  { id: 'g-electrolitos', name: 'Electrolitos', analytes: [an('a-k', 'Potasio', 'mEq/L', 2.8, 6.2), an('a-na', 'Sodio', 'mEq/L', 120, 160)] },
  { id: 'g-coagulacion', name: 'Coagulación', analytes: [an('a-inr', 'INR', '', undefined, 5)] },
  { id: 'g-cardiacos', name: 'Marcadores cardíacos', analytes: [an('a-trop', 'Troponina I', 'ng/mL', undefined, 0.4)] },
  { id: 'g-otros', name: 'Otros', analytes: [an('a-ph', 'pH', '', 7.2, 7.6)] },
  // UM2 (ronda 8): los únicos valores críticos que trae la lista de Emil (docs/ronda8/valores_referencia_laboratorio.md), con
  // su fuente. La lista dice «≥100»: la pantalla dice «Crítico si es mayor de», así que va el valor anterior (99.9). VALIDAR: Emil.
  { id: 'g-farmacos', name: 'Fármacos (niveles)', analytes: [
    { ...an('a-valproico', 'Ácido valproico', 'µg/mL', undefined, 99.9), source: 'MSD-TDM (valor crítico ≥100)' },
    { ...an('a-carbamazepina', 'Carbamazepina', 'µg/mL', undefined, 14.9), source: 'MSD-TDM (valor crítico ≥15.0)' },
    { ...an('a-digoxina', 'Digoxina', 'ng/mL', undefined, 2.0), source: 'MSD-TDM (valor crítico ≥2.1)' },
    { ...an('a-fenitoina', 'Fenitoína', 'µg/mL', undefined, 24.9), source: 'MSD-TDM (valor crítico ≥25.0)' },
    { ...an('a-fenobarbital', 'Fenobarbital', 'µg/mL', undefined, 49.9), source: 'MSD-TDM (valor crítico ≥50.0)' },
    { ...an('a-litio', 'Litio', 'mmol/L', undefined, 2.0), source: 'CHI-TDM (valor de pánico >2.0)' },
  ] },
]

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** El umbral que trae la app para un analito (por su identificador), si es uno de los suyos. */
export function defaultAnalyte(id: string) {
  for (const g of DEFAULT_CRITICAL_GROUPS) { const a = g.analytes.find((x) => x.id === id); if (a) return a }
  return undefined
}

/** ¿La clínica cambió el umbral que trae la app? */
export const customized = (a: CriticalAnalyte) => {
  const d = defaultAnalyte(a.id)
  return !!d && (d.low !== a.low || d.high !== a.high || (d.unit ?? '') !== (a.unit ?? ''))
}

/**
 * Ronda 8: los umbrales vigentes de una clínica. La app ya trae los suyos (con su fuente) y la clínica cambia los que quiera:
 * lo guardado por la clínica manda; los umbrales nuevos que traiga la app (un grupo o un analito que la clínica todavía no
 * tiene, ni activo ni archivado) se agregan solos. La fuente siempre es la de la app.
 */
export function mergeCriticalGroups(saved?: CriticalGroup[] | null): CriticalGroup[] {
  if (!saved?.length) return structuredClone(DEFAULT_CRITICAL_GROUPS)
  const out: CriticalGroup[] = saved.map((g) => ({ ...g, analytes: g.analytes.map((a) => { const d = defaultAnalyte(a.id); return d?.source ? { ...a, source: d.source } : a }) }))
  const ids = new Set(out.flatMap((g) => g.analytes.map((a) => a.id)))
  const names = new Set(out.flatMap((g) => g.analytes.map((a) => norm(a.name))))
  for (const dg of DEFAULT_CRITICAL_GROUPS) {
    const missing = dg.analytes.filter((a) => !ids.has(a.id) && !names.has(norm(a.name)))
    if (!missing.length) continue
    const target = out.find((g) => g.id === dg.id) ?? out.find((g) => !g.archivedAt && norm(g.name) === norm(dg.name))
    if (target) target.analytes.push(...missing.map((a) => ({ ...a })))
    else out.push({ ...dg, analytes: missing.map((a) => ({ ...a })) })
  }
  return out
}

/**
 * Umbrales vigentes, por nombre de analito (sin distinguir mayúsculas ni tildes): los analitos activos de los grupos
 * activos de la clínica o, si la clínica todavía no tiene los suyos, los de este archivo.
 */
export function criticalLimitsOf(groups?: CriticalGroup[] | null): Map<string, { low?: number; high?: number }> {
  const out = new Map<string, { low?: number; high?: number }>()
  for (const g of mergeCriticalGroups(groups)) {
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
