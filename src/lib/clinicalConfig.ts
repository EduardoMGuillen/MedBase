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
import { GENERATED } from './labRef/generated.js'
import type { RefThreshold } from './labRef/build.js'

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

/** PQ1 (ronda 9). VALIDAR: Emil. «Tipo de anestesia» de la nota postquirúrgica («Otra» pide especificar). */
export const ANESTHESIA_TYPES = ['General', 'Raquídea', 'Epidural', 'Bloqueo regional', 'Local', 'Sedación', 'Otra']

/** PQ2 (ronda 9). Equipo quirúrgico: cargos y orden (formulario, tarjeta, nota completa e impresión). Sólo el primero es obligatorio. */
export const SURGICAL_TEAM = [
  { key: 'surgeon', label: 'Cirujano principal' }, { key: 'assistant1', label: 'Ayudante 1' }, { key: 'assistant2', label: 'Ayudante 2' },
  { key: 'circulating', label: 'Circular' }, { key: 'scrub', label: 'Instrumentista' }, { key: 'anesthesiologist', label: 'Anestesiólogo' },
] as const
export type SurgicalRole = (typeof SURGICAL_TEAM)[number]['key']

/** ME4 (ronda 9). VALIDAR: Emil. Nebulización: máximo de componentes por orden y diluyentes que se ofrecen («Otro» pide escribirlo). */
export const NEB_MAX_COMPONENTS = 5
export const NEB_DILUENTS = ['SSN 0.9%', 'Agua estéril', 'Otro']

/** RF1 (ronda 8). VALIDAR: Emil. Pie fijo de la hoja de referencia (confidencialidad). Sin citas legales en pantalla. */
export const REFERRAL_FOOTER = 'Documento confidencial. Contiene información clínica para uso exclusivo del personal de salud del centro receptor.'

/** RF1. VALIDAR: Emil. Texto de la casilla obligatoria antes de firmar la referencia. */
export const REFERRAL_CONSENT = 'El paciente (o su representante) fue informado de la referencia y está de acuerdo en que su información clínica se comparta con el centro receptor.'

/** Un límite crítico: «Crítico si es menor de» (`low`) y «Crítico si es mayor de» (`high`). */
export interface Limits { low?: number; high?: number }

/** Un analito con su umbral crítico. Un límite vacío es «No aplica»; sin ninguno, «Sin umbral crítico definido». */
export interface CriticalAnalyte {
  id: string; name: string; unit?: string; low?: number; high?: number; archivedAt?: string
  /** UM3 (ronda 10): archivado del que dependen resultados: queda en la base pero no aparece en ninguna pantalla. */
  retiredAt?: string
  /** UM2 (ronda 8): por sexo, cuando el valor de la fuente lo distingue (se compara con el sexo del paciente). */
  f?: Limits; m?: Limits
  /** UM2: fuentes del valor que trae la app (códigos de LAB_SOURCES), «initial» o ninguna (lo agregó la clínica). */
  sources?: string[]
  /** Texto de la fuente (compatibilidad con la ronda 8 v1). */
  source?: string
  /** UM2: operador original de la fuente cuando no es el de la pantalla («≥100»; la app compara «mayor de», >). */
  op?: string
  /** UM2: personalizado por la clínica (quién y cuándo). Sin esto, manda el valor predeterminado de la app. */
  editedBy?: string; editedAt?: string
  /** UM2: valores anteriores (no se borran). */
  history?: { at: string; by: string; low?: number; high?: number; f?: Limits; m?: Limits; reason: string }[]
}
/** Grupo de analitos («Hemograma», «Química sanguínea»…), como vienen los resultados del laboratorio. */
/** UM3 (ronda 10): `retiredAt`, retirado (invisible en toda pantalla; ver CriticalAnalyte). */
export interface CriticalGroup { id: string; name: string; archivedAt?: string; retiredAt?: string; analytes: CriticalAnalyte[] }

const an = (id: string, name: string, unit: string, low?: number, high?: number): CriticalAnalyte => ({ id, name, unit: unit || undefined, low, high, sources: ['initial'] })
const slug = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)

/** Los umbrales que la app traía antes de la ronda 8 (ids estables: las clínicas los tienen guardados). */
const INITIAL_GROUPS: CriticalGroup[] = [
  { id: 'g-hemograma', name: 'Hemograma', analytes: [an('a-hb', 'Hemoglobina', 'g/dL', 7, 20), an('a-plaq', 'Plaquetas', '×10³/µL', 50, 1000), an('a-leu', 'Leucocitos', '×10³/µL', 2, 30)] },
  { id: 'g-quimica', name: 'Química sanguínea', analytes: [an('a-glu', 'Glucosa', 'mg/dL', 50, 400), an('a-cr', 'Creatinina', 'mg/dL', undefined, 5)] },
  { id: 'g-electrolitos', name: 'Electrolitos', analytes: [an('a-k', 'Potasio', 'mEq/L', 2.8, 6.2), an('a-na', 'Sodio', 'mEq/L', 120, 160)] },
  { id: 'g-coagulacion', name: 'Coagulación', analytes: [an('a-inr', 'INR', '', undefined, 5)] },
  { id: 'g-cardiacos', name: 'Marcadores cardíacos', analytes: [an('a-trop', 'Troponina I', 'ng/mL', undefined, 0.4)] },
  { id: 'g-otros', name: 'Otros', analytes: [an('a-ph', 'pH', '', 7.2, 7.6)] },
]

/** Los fármacos que la ronda 8 (primera versión) ya había puesto: conservan su identificador. */
const LEGACY_IDS: Record<string, string> = { 'Ácido valproico': 'a-valproico', 'Carbamazepina': 'a-carbamazepina', 'Digoxina': 'a-digoxina', 'Fenitoína': 'a-fenitoina', 'Fenobarbital': 'a-fenobarbital', 'Litio': 'a-litio' }

/** Los umbrales iniciales que el .md reemplaza (para el historial «antes → ahora» de la carga). */
export const INITIAL_CRITICAL: Record<string, Limits & { name: string; unit?: string }> = Object.fromEntries(INITIAL_GROUPS.flatMap((g) => g.analytes.map((a) => [a.id, { name: a.name, unit: a.unit, low: a.low, high: a.high }])))

/**
 * UM2 (ronda 8). VALIDAR: Emil. Umbrales críticos de la app: por decisión de Emil (A9), el rango normal de cada analito
 * numérico del .md de valores de referencia (por sexo cuando lo distingue) y los 6 valores críticos de fármacos (Anexo A),
 * con su fuente. Salen del archivo por el script (src/lib/labRef/generated.ts). RIESGO CLÍNICO: todo valor fuera del rango
 * normal sale como crítico. Los iniciales que el .md no trae (Glucosa 50/400, pH 7.2/7.6) quedan como «Valor inicial de
 * Clinara (sin fuente)». Una clínica nueva nace con todos.
 */
export const DEFAULT_CRITICAL_GROUPS: CriticalGroup[] = (() => {
  const groups: CriticalGroup[] = structuredClone(INITIAL_GROUPS)
  const byName = new Map(groups.flatMap((g) => g.analytes.map((a) => [a.name, a] as const)))
  const fromFile = new Map<string, RefThreshold[]>()
  for (const t of GENERATED.thresholds as RefThreshold[]) fromFile.set(t.analyte, [...(fromFile.get(t.analyte) ?? []), t])
  for (const [name, list] of fromFile) {
    const base = list[0]
    const f = list.find((t) => t.sex === 'F')
    const m = list.find((t) => t.sex === 'M')
    const all = list.find((t) => t.sex === 'all')
    const values: Partial<CriticalAnalyte> = { unit: base.unit || undefined, low: all?.low, high: all?.high, f: f && { low: f.low, high: f.high }, m: m && { low: m.low, high: m.high },
      sources: [...new Set(list.flatMap((t) => t.sources))], op: base.op }
    const existing = byName.get(name)
    if (existing) { Object.assign(existing, values); continue }
    const gid = base.group.startsWith('Fármacos') ? 'g-farmacos' : `g-um2-${slug(base.group)}`
    let g = groups.find((x) => x.id === gid) ?? groups.find((x) => x.name.toLowerCase() === base.group.toLowerCase())
    if (!g) { g = { id: gid, name: base.group, analytes: [] }; groups.push(g) }
    g.analytes.push({ id: LEGACY_IDS[name] ?? `a-um2-${slug(name)}`, name, ...values })
  }
  return groups
})()

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** El umbral que trae la app para un analito (por su identificador), si es uno de los suyos. */
export function defaultAnalyte(id: string) {
  for (const g of DEFAULT_CRITICAL_GROUPS) { const a = g.analytes.find((x) => x.id === id); if (a) return a }
  return undefined
}

/** ¿La clínica lo personalizó? (UM2: «Personalizado», con quién y cuándo). */
export const customized = (a: CriticalAnalyte) => !!a.editedAt && !!defaultAnalyte(a.id)

/** Los valores (límites, sexo, unidad, fuente) que trae la app para aplicarlos a un analito guardado. */
export const defaultValues = (d: CriticalAnalyte): Partial<CriticalAnalyte> => ({ unit: d.unit, low: d.low, high: d.high, f: d.f, m: d.m, sources: d.sources, op: d.op, source: undefined })

/**
 * Ronda 8: los umbrales vigentes de una clínica. Un analito de la app que la clínica no personalizó toma siempre el valor
 * predeterminado (si la app lo actualiza, le llega solo); uno personalizado conserva el suyo (A9). Los grupos y analitos
 * nuevos de la app que la clínica todavía no tiene (ni activos ni archivados) se agregan solos.
 */
export function mergeCriticalGroups(saved?: CriticalGroup[] | null): CriticalGroup[] {
  if (!saved?.length) return structuredClone(DEFAULT_CRITICAL_GROUPS)
  const out: CriticalGroup[] = saved.map((g) => ({ ...g, analytes: g.analytes.map((a) => {
    const d = defaultAnalyte(a.id)
    if (!d) return a
    return a.editedAt ? { ...a, sources: d.sources, op: d.op } : { ...a, ...defaultValues(d) }
  }) }))
  const ids = new Set(out.flatMap((g) => g.analytes.map((a) => a.id)))
  const names = new Set(out.flatMap((g) => g.analytes.map((a) => norm(a.name))))
  for (const dg of DEFAULT_CRITICAL_GROUPS) {
    const missing = dg.analytes.filter((a) => !ids.has(a.id) && !names.has(norm(a.name)))
    if (!missing.length) continue
    const target = out.find((g) => g.id === dg.id) ?? out.find((g) => !g.archivedAt && norm(g.name) === norm(dg.name))
    if (target) target.analytes.push(...missing.map((a) => structuredClone(a)))
    else out.push({ ...dg, analytes: missing.map((a) => structuredClone(a)) })
  }
  return out
}

/** Límites vigentes de un analito: los generales y, si los tiene, por sexo. */
export interface CriticalLimit extends Limits { f?: Limits; m?: Limits }

/**
 * Umbrales vigentes, por nombre de analito (sin distinguir mayúsculas ni tildes): los analitos activos de los grupos
 * activos de la clínica o, si la clínica todavía no tiene los suyos, los de este archivo.
 */
export function criticalLimitsOf(groups?: CriticalGroup[] | null): Map<string, CriticalLimit> {
  const out = new Map<string, CriticalLimit>()
  for (const g of mergeCriticalGroups(groups)) {
    if (g.archivedAt || g.retiredAt) continue
    for (const a of g.analytes) {
      if (a.archivedAt || a.retiredAt) continue
      if (a.low == null && a.high == null && !a.f && !a.m) continue
      out.set(norm(a.name), { low: a.low, high: a.high, f: a.f, m: a.m })
    }
  }
  return out
}

/** Los límites que aplican al sexo del paciente; sin sexo, los más amplios de los dos (no avisa de más). */
export function limitsFor(lim: CriticalLimit, sex?: 'F' | 'M'): Limits {
  if (!lim.f && !lim.m) return { low: lim.low, high: lim.high }
  const pick = sex === 'F' ? lim.f : sex === 'M' ? lim.m : undefined
  if (pick) return pick
  if (sex) return { low: lim.low, high: lim.high }
  const lows = [lim.f?.low, lim.m?.low]
  const highs = [lim.f?.high, lim.m?.high]
  return { low: lows.some((x) => x == null) ? undefined : Math.min(...(lows as number[])), high: highs.some((x) => x == null) ? undefined : Math.max(...(highs as number[])) }
}

/**
 * ¿El valor cruza el umbral crítico de su analito? UM2 (ronda 8): la comparación no cambió: «menor de» es <, «mayor de»
 * es > (estrictos). El operador de la fuente («≥100») queda anotado en el umbral.
 */
export function isCritical(limits: Map<string, CriticalLimit>, analyte: string, value: number, sex?: 'F' | 'M') {
  const lim = limits.get(norm(analyte))
  if (!lim || !Number.isFinite(value)) return false
  const l = limitsFor(lim, sex)
  return (l.low != null && value < l.low) || (l.high != null && value > l.high)
}

/**
 * Migración (v47): los umbrales planos que la clínica ya tenía (`critical_limits`) pasan a los grupos sin cambiar
 * ningún número. Lo que no está en los grupos por omisión va a «Otros».
 */
export function groupsFromLimits(limits?: Record<string, { low?: number; high?: number }> | null): CriticalGroup[] {
  // UM2 (ronda 8): una clínica sin umbrales propios nace con los de la app
  if (!limits || !Object.keys(limits).length) return structuredClone(DEFAULT_CRITICAL_GROUPS)
  const groups: CriticalGroup[] = INITIAL_GROUPS.map((g) => ({ ...g, analytes: g.analytes.map((a) => ({ ...a })) }))
  const byName = new Map(groups.flatMap((g) => g.analytes.map((a) => [norm(a.name), a] as const)))
  const others = groups.find((g) => g.id === 'g-otros')!
  let n = 0
  for (const [name, v] of Object.entries(limits ?? {})) {
    const a = byName.get(norm(name))
    if (a) { a.low = v.low; a.high = v.high } else others.analytes.push({ id: `a-mig-${++n}`, name, low: v.low, high: v.high })
  }
  return groups
}

/**
 * GE4 (ronda 9). VALIDAR: Emil. Minutos que tiene el autor para «Corregir» lo que firmó o registró (desde la primera firma;
 * no se reinicia con cada versión). Pasado el plazo se corrige con adenda o anulación, como siempre.
 */
export const GRACE_MINUTES = 5

/* ───────────────────────────── Ronda 10 ───────────────────────────── */

/**
 * ME8 (ronda 10). VALIDAR: Emil. El buscador de medicamentos no se abre al tocar el campo: sugiere desde esta cantidad de
 * letras, hasta DRUG_SEARCH_VISIBLE filas a la vista (con desplazamiento si hay más).
 */
export const DRUG_SEARCH_MIN_CHARS = 2
export const DRUG_SEARCH_VISIBLE = 8

/**
 * ME9 (ronda 10). VALIDAR: Emil. «Primera dosis diferente (STAT)» solo se ofrece con estas vías (reemplaza ME2 y ME3, que
 * la permitían con cualquiera). Las órdenes ya emitidas con otra vía no cambian.
 */
export const LOADING_DOSE_ROUTES = ['Intravenosa']

/** GE5 (ronda 10). VALIDAR: Emil. Filas por página en las listas largas (vademécum, pacientes, recetas, caja, bitácora…). */
export const PAGE_SIZE = 25

/**
 * ME10 y EX5 (ronda 10). VALIDAR: Emil. Leyenda de las recetas y órdenes que imprime la clínica (también enfermería): sin
 * la firma y el sello del médico en papel no valen (la firma dibujada no es firma electrónica avanzada).
 */
export const SIGN_AND_STAMP_LEGEND = 'Válida solo con firma y sello del médico'

/**
 * CA5 (ronda 10). VALIDAR: Emil. Detalles que se eligen al ordenar un estudio de imagen. Cada estudio del catálogo guarda
 * cuáles usa (src/lib/imagingCatalog.ts y, si administración lo cambió, la base). Doble contraste = oral + intravenoso;
 * triple = oral + intravenoso + rectal (uso habitual en la región); solo en abdomen, pelvis y abdomen y pelvis.
 */
export const CT_CONTRASTS = ['Simple', 'Contrastada', 'Simple y contrastada', 'Doble contraste', 'Triple contraste']
export const CT_MULTI_CONTRASTS = ['Doble contraste', 'Triple contraste']
export const MR_CONTRASTS = ['Simple', 'Con gadolinio']
/** Cómo se lee cada contraste en la orden: «Tomografía de tórax contrastada», «… con triple contraste». */
export const CONTRAST_PHRASE: Record<string, string> = {
  Simple: 'simple', Contrastada: 'contrastada', 'Simple y contrastada': 'simple y contrastada', 'Doble contraste': 'con doble contraste',
  'Triple contraste': 'con triple contraste', 'Con gadolinio': 'con gadolinio', 'Con contraste': 'con contraste',
}
/**
 * CA6 (ronda 11, corrige CA5). VALIDAR: Emil. Estudios genéricos de imagen («Rayos X», «Ultrasonido», «Tomografía»,
 * «Angiotomografía», «Resonancia magnética»): al ordenarlos se escribe «¿De qué?» y, según el estudio, la proyección o el
 * contraste (botones y, además, un cuadro para escribir otro). Reemplazan los cinco contrastes y el «Con gadolinio» de CA5.
 */
export const XRAY_PROJECTION_BUTTONS = ['AP', 'PA', 'Lateral', 'Oblicua', 'Axial']
export const CT_CONTRAST_BUTTONS = ['Simple', 'Contrastada']
export const MR_CONTRAST_BUTTONS = ['Simple', 'Con contraste']
/** Ejemplo gris de «¿De qué?» por estudio. */
export const WHAT_HINTS: Record<string, string> = {
  'Rayos X': 'Ej. tórax, rodilla', Ultrasonido: 'Ej. tiroides, abdomen, venoso de miembros inferiores', 'Tomografía': 'Ej. cráneo, abdomen y pelvis',
  'Angiotomografía': 'Ej. aorta, cerebral', 'Resonancia magnética': 'Ej. rodilla, columna lumbosacra',
}
/** Lado: «· Lado derecho», «· Lado izquierdo», «· Bilateral». */
export const IMAGING_SIDES = [{ value: 'right', label: 'Derecho', phrase: 'Lado derecho' }, { value: 'left', label: 'Izquierdo', phrase: 'Lado izquierdo' }, { value: 'both', label: 'Bilateral', phrase: 'Bilateral' }] as const
/** Proyecciones que se escriben tal cual (siglas y nombres propios); las demás van en minúscula dentro de la orden. */
export const PROJECTION_KEEP_CASE = ['AP', 'PA', 'Towne', 'Caldwell', 'Waters']
/**
 * CA5. VALIDAR: Emil. Sinónimos al buscar en «Ordenar exámenes» (sin tildes ni mayúsculas): la palabra escrita también
 * encuentra lo de la derecha.
 */
export const IMAGING_SEARCH_SYNONYMS: Record<string, string[]> = {
  rx: ['rayos x'], radiografia: ['rayos x'], placa: ['rayos x'],
  tac: ['tomografia'], tc: ['tomografia'], tomo: ['tomografia'],
  rm: ['resonancia'], rmn: ['resonancia'],
  usg: ['ultrasonido'], eco: ['ultrasonido'], ecografia: ['ultrasonido'],
  // CA6 (ronda 11)
  angiotac: ['angiotomografia'], angiotc: ['angiotomografia'],
  ekg: ['electrocardiograma'], ecg: ['electrocardiograma'],
}

/**
 * DP1 (ronda 11). VALIDAR: Emil. Cargos de los roles Laboratorio e Imágenes (un rol con cargos, como PE1), con el prefijo que
 * llevan en las firmas y si piden número de colegiación (y de qué colegio).
 */
export const DEPT_POSITIONS = {
  lab: [
    { key: 'microbiologist', label: 'Microbiólogo(a)', prefix: 'Lic.', license: true, licenseBody: 'Colegio de Microbiólogos y Químicos Clínicos de Honduras', lead: true },
    { key: 'lab_tech', label: 'Técnico(a) de laboratorio', prefix: 'Téc.', license: false, licenseBody: '', lead: false },
  ],
  imaging: [
    { key: 'radiologist', label: 'Médico(a) radiólogo(a)', prefix: 'Dr./Dra.', license: true, licenseBody: 'Colegio Médico de Honduras', lead: true },
    { key: 'imaging_tech', label: 'Técnico(a) en imágenes (radiotecnología)', prefix: 'Téc.', license: false, licenseBody: '', lead: false },
  ],
} as const
/** Prefijos que ya puede traer el nombre (no se repiten en la firma). */
export const NAME_PREFIXES = ['Dr.', 'Dra.', 'Lic.', 'Téc.', 'Aux.', 'Ing.']
/**
 * DP6 (ronda 11). VALIDAR: Emil. Turnos de cada departamento en el rol de turnos (por defecto, las de enfermería).
 */
export const DEPT_SHIFTS: Record<'nursing' | 'lab' | 'imaging', { key: 'morning' | 'afternoon' | 'night'; label: string; from: string; to: string }[]> = {
  nursing: [{ key: 'morning', label: 'Mañana', from: '07:00', to: '15:00' }, { key: 'afternoon', label: 'Tarde', from: '15:00', to: '23:00' }, { key: 'night', label: 'Noche', from: '23:00', to: '07:00' }],
  lab: [{ key: 'morning', label: 'Mañana', from: '07:00', to: '15:00' }, { key: 'afternoon', label: 'Tarde', from: '15:00', to: '23:00' }, { key: 'night', label: 'Noche', from: '23:00', to: '07:00' }],
  imaging: [{ key: 'morning', label: 'Mañana', from: '07:00', to: '15:00' }, { key: 'afternoon', label: 'Tarde', from: '15:00', to: '23:00' }, { key: 'night', label: 'Noche', from: '23:00', to: '07:00' }],
}
/**
 * DP2 (ronda 11). VALIDAR: Emil. Motivos de «No se realizó» (más «Otro», escrito).
 */
/**
 * EX10 (ronda 14). VALIDAR: Emil. Motivo nuevo de «No se realizó» para cuando el paciente cambia de opinión y se hace el examen
 * afuera (se avisa al médico, que decide si lo cancela: regla de DP2).
 */
export const NOT_DONE_ELSEWHERE: Record<'lab' | 'imaging', string> = { lab: 'El paciente se lo hará en otro laboratorio', imaging: 'El paciente se lo hará en otro centro' }
/** ME13 (ronda 14). VALIDAR: Emil. Motivos de «No aplicado» de un medicamento de consulta externa (más «Otro» escrito). */
/**
 * ME15 (ronda 15): leyendas de la receta para un medicamento «Aplicar en la clínica» (la receta lleva todos los medicamentos
 * de la consulta). Con «No hay en la clínica (va a receta)» (ME10), la segunda. VALIDAR: Emil
 */
export const RX_LEGEND_IN_CLINIC = 'Se aplica en la clínica.'
export const RX_LEGEND_BUY_AND_BRING = 'Comprar y traer a la clínica para su aplicación.'

export const NOT_APPLIED_REASONS = ['El paciente se retiró', 'El paciente lo rechazó', 'No hay en la clínica']
export const NOT_DONE_REASONS =['No hay reactivo', 'El paciente no llegó', 'El paciente se fue', 'Equipo dañado', 'Muestra insuficiente', 'Muestra hemolizada o inadecuada']
/**
 * DP4 (ronda 11). VALIDAR: Emil. Exámenes que cuentan como «función renal» para el técnico en imágenes (contraste): el último
 * resultado de creatinina del paciente.
 */
export const RENAL_FUNCTION_ANALYTES = ['Creatinina']

/**
 * IM1 (ronda 13). VALIDAR: Emil. Hoja de todos los documentos impresos (recetas, órdenes, resultados, constancias, referencias,
 * epicrisis, autorizaciones, nota de consulta y recibo): Carta, 8.5 × 11 pulgadas, con márgenes de 2 cm. La vista previa en
 * pantalla tiene la misma proporción.
 */
export const PRINT_PAGE = { widthIn: 8.5, heightIn: 11, marginCm: 2 } as const
/** IM1 (ronda 13). VALIDAR: Emil. Alto del espacio en blanco para firmar y sellar en papel (sin raya, sin texto: cabe un sello). */
export const SIGN_SPACE_CM = 3.5
/** IM1 (ronda 13). VALIDAR: Emil. Alto del espacio para las firmas de paciente, representante o testigo en las autorizaciones. */
export const OTHER_SIGN_SPACE_CM = 1.6
/** IM1 (ronda 13). VALIDAR: Emil. Leyenda fija al pie de todos los documentos. */
export const DOC_BRAND_LEGEND = 'Emitida con Clinara'

/**
 * RU1 (ronda 14). VALIDAR: Emil. Unidades en que se cuenta el material médico quirúrgico (singular → plural).
 */
export const SUPPLY_UNITS = { unidad: 'unidades', par: 'pares', sobre: 'sobres', rollo: 'rollos', frasco: 'frascos', hoja: 'hojas' } as const
/**
 * RU1 (ronda 14). VALIDAR: Emil. Materiales que se distinguen solo por calibre (G), nunca por longitud: agujas, jeringas,
 * catéteres y mariposas. Si al agregar o editar uno se escribe una longitud, se quita.
 */
export const SUPPLY_GAUGE_ONLY = /aguja|jeringa|cat[eé]ter|mariposa|scalp/i
/** RU1 (ronda 14). VALIDAR: Emil. Cómo agrupa la clínica el registro de material (A10). «Por turno» por defecto. */
export const SUPPLY_PERIODS = { shift: 'Por turno', day: 'Por día', week: 'Por semana' } as const
/**
 * RU1 (ronda 14). VALIDAR: Emil. Turnos por defecto del «Periodo de registro del material»: los de enfermería que ya existen
 * (DP6, `DEPT_SHIFTS.nursing`: Mañana 07–15, Tarde 15–23, Noche 23–07). Cada clínica los edita en su configuración.
 */
export const SUPPLY_DEFAULT_SHIFTS = DEPT_SHIFTS.nursing.map((s) => ({ key: s.key as string, label: s.label, from: s.from, to: s.to }))
/** RU1 (ronda 14). Hasta cuántos turnos puede tener la clínica. */
export const SUPPLY_MAX_SHIFTS = 6
/** RU2 (ronda 14). VALIDAR: Emil. Áreas del registro de uso (A9). */
export const USAGE_AREAS = { outpatient: 'Consulta externa', observation: 'Observación', hospital: 'Hospitalización' } as const
/** RU2 (ronda 14). VALIDAR: Emil. Lo que no se gasta en un paciente concreto (alcohol, gorros), A13. */
export const GENERAL_USE_LABEL = 'Uso general del servicio'
/**
 * PQ3 (ronda 14). VALIDAR: Emil. Listas de la hoja de anestesia (Anexo B del pedido): formulario «Llenar en el sistema», hoja
 * en blanco e impresión. Ningún campo es obligatorio salvo «Anestesia realizada por» y la técnica.
 */
export const ANESTHESIA_SHEET = {
  asa: ['I', 'II', 'III', 'IV', 'V'],
  mallampati: ['I', 'II', 'III', 'IV'],
  cormack: ['I', 'II', 'III', 'IV'],
  /** Lista de verificación quirúrgica de la OMS. */
  who: ['Entrada', 'Pausa', 'Salida'],
  checks: ['Consentimiento', 'Máquina verificada', 'Succión', 'Equipo de vía aérea difícil'],
  techniques: ['General balanceada', 'TIVA', 'Sedación', 'Subaracnoidea', 'Epidural', 'Bloqueo periférico', 'Combinada'],
  times: [
    { key: 'roomIn', label: 'Entrada a sala' }, { key: 'anesthesiaStart', label: 'Inicio de anestesia' }, { key: 'surgeryStart', label: 'Inicio de cirugía' },
    { key: 'surgeryEnd', label: 'Fin de cirugía' }, { key: 'anesthesiaEnd', label: 'Fin de anestesia' }, { key: 'roomOut', label: 'Salida de sala' },
  ],
  drugCategories: ['Premedicación', 'Inductor', 'Opioide', 'Relajante neuromuscular', 'Antibiótico', 'Antiemético', 'Analgésico', 'Reversión', 'Otro'],
  airway: ['Mascarilla', 'Mascarilla laríngea', 'Tubo endotraqueal oral', 'Tubo endotraqueal nasal'],
  ventilation: ['Espontánea', 'Controlada'],
  monitors: ['ECG', 'PANI', 'SpO₂', 'EtCO₂', 'Temperatura', 'TOF', 'Sonda vesical'],
  destinations: ['Recuperación', 'UCI', 'Sala'],
  scheduled: ['Programada', 'Urgencia'],
  /** Escala de Aldrete: cada parámetro de 0 a 2; el total suma solo (máximo 10). */
  aldrete: [
    { key: 'activity', label: 'Actividad', options: ['Ninguna extremidad', 'Mueve 2 extremidades', 'Mueve 4 extremidades'] },
    { key: 'respiration', label: 'Respiración', options: ['Apnea', 'Disnea o respiración limitada', 'Respira y tose sin dificultad'] },
    { key: 'circulation', label: 'Circulación', options: ['PA ± 50 % de la basal', 'PA ± 20–50 % de la basal', 'PA ± 20 % de la basal'] },
    { key: 'consciousness', label: 'Conciencia', options: ['No responde', 'Responde al llamado', 'Despierto'] },
    { key: 'saturation', label: 'Saturación', options: ['SpO₂ < 90 % con O₂', 'SpO₂ > 90 % con O₂', 'SpO₂ > 92 % al aire'] },
  ],
  /** Bandas debajo de la cuadrícula del monitoreo (se llenan a mano en la hoja impresa; SpO₂, EtCO₂ y temperatura salen de la tabla). */
  bands: ['SpO₂ %', 'EtCO₂', 'Temperatura °C', 'O₂ L/min', 'N₂O L/min', 'Sevoflurano / Isoflurano %', 'Diuresis', 'Sangrado'],
} as const
/** PQ3 (ronda 14). VALIDAR: Emil. Técnica que se marca sola en la hoja según el tipo de anestesia de la nota postquirúrgica (PQ1). */
export const ANESTHESIA_TECHNIQUE_OF: Record<string, string> = {
  General: 'General balanceada', Raquídea: 'Subaracnoidea', Epidural: 'Epidural', 'Bloqueo regional': 'Bloqueo periférico', Sedación: 'Sedación',
}
/**
 * PQ3 (ronda 14). VALIDAR: Emil. Cuadrícula del monitoreo transanestésico al imprimir: de 0 a 240 minutos con una columna cada
 * 5 minutos; escala de 0 a 220 para PA y FC. Si el registro pasa de 240 minutos se dibuja otra cuadrícula a continuación.
 */
export const ANESTHESIA_GRID = { minutes: 240, step: 5, max: 220, lines: 20 } as const
