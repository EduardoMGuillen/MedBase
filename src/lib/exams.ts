import type { ExamGroup, ExamOrder, ExamStatus } from './types'
import { toLocalDate } from './dateInput.js'
import { EXISTING_SUBGROUP, LAB_AREAS, LAB_ORDER, SECTION_SEP } from './labCatalog.js'
import { CONTRAST_PHRASE, CT_CONTRAST_BUTTONS, CT_CONTRASTS, CT_MULTI_CONTRASTS, IMAGING_SEARCH_SYNONYMS, IMAGING_SIDES, MR_CONTRAST_BUTTONS, MR_CONTRASTS, PROJECTION_KEEP_CASE, XRAY_PREFIXES, XRAY_SUBGROUPS } from './clinicalConfig.js'
import { IMAGING_REMOVED_CA6, IMAGING_SAME, IMAGING_STUDIES, IMAGING_SUBGROUPS as IMAGING_AREAS, type ImagingDetails } from './imagingCatalog.js'
import { referenceFromRows, referenceOf, type LabReference, type RefAnalyte, type RefRow } from './labReference.js'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
export const examKey = (name: string) => norm(name)

/** EX1: nombre de los dos grupos de la sección «Exámenes». Un hemograma y un ultrasonido los hace gente distinta. */
export const GROUP_LABEL: Record<ExamGroup, string> = { lab: 'Laboratorio', imaging: 'Imagen y gabinete' }

/**
 * Analito de un examen de laboratorio con su unidad y su rango de referencia (adulto). UM1 (ronda 8): también por sexo
 * (`f`, `m`), «<X» (`highOpen`) y el texto del documento de valores de referencia (src/lib/labReference.ts).
 */
export type Analyte = RefAnalyte

export interface CatalogExam {
  group: ExamGroup
  name: string
  /** Imagen: se indica la región o el lado (radiografía de rodilla derecha). */
  region?: boolean
  side?: boolean
  /** Laboratorio: analitos para cargar el resultado valor por valor. */
  analytes?: Analyte[]
  /** Agregado por la clínica (no es del catálogo base). */
  clinicId?: string
  /** CF3 (ronda 6): subgrupo (Hematología, Rayos X…). */
  subgroup?: string
  /** UM1 (ronda 8): valores de referencia con su fuente (resultado esperado, notas). */
  reference?: LabReference
  /** CA5 (ronda 10): lo que se elige al ordenar un estudio de imagen (proyección, contraste, lado, región). */
  details?: ImagingDetails
}

/** UM1 (ronda 8): los valores de referencia del documento de Emil reemplazan los analitos que el examen ya tuviera. */
export function withReference<T extends CatalogExam>(e: T, rows?: RefRow[]): T {
  if (e.group !== 'lab') return e
  // Las filas de la clínica (su base) mandan; si no llegaron, las del archivo
  const ref = rows?.length ? referenceFromRows(rows) : referenceOf(e.name)
  return ref ? { ...e, reference: ref, analytes: ref.analytes ?? e.analytes } : e
}

const a = (name: string, unit: string, low?: number, high?: number): Analyte => ({ name, unit, low, high })

/** Catálogo base. Lo que no está se escribe y se puede guardar en el catálogo de la clínica. */
export const EXAMS: CatalogExam[] = [
  // Laboratorio
  { group: 'lab', name: 'Hemograma', analytes: [a('Hemoglobina', 'g/dL', 12, 16), a('Hematocrito', '%', 36, 48), a('Leucocitos', '×10³/µL', 4.5, 11), a('Neutrófilos', '%', 40, 70), a('Linfocitos', '%', 20, 40), a('Plaquetas', '×10³/µL', 150, 450)] },
  { group: 'lab', name: 'Química sanguínea', analytes: [a('Glucosa', 'mg/dL', 70, 100), a('Nitrógeno ureico (BUN)', 'mg/dL', 7, 20), a('Creatinina', 'mg/dL', 0.6, 1.2), a('Ácido úrico', 'mg/dL', 2.5, 7)] },
  { group: 'lab', name: 'Glucosa en ayunas', analytes: [a('Glucosa', 'mg/dL', 70, 100)] },
  { group: 'lab', name: 'Glucosa posprandial', analytes: [a('Glucosa', 'mg/dL', 70, 140)] },
  { group: 'lab', name: 'Hemoglobina glicosilada (HbA1c)', analytes: [a('HbA1c', '%', 4, 5.6)] },
  { group: 'lab', name: 'Perfil lipídico', analytes: [a('Colesterol total', 'mg/dL', undefined, 200), a('Triglicéridos', 'mg/dL', undefined, 150), a('HDL', 'mg/dL', 40), a('LDL', 'mg/dL', undefined, 130)] },
  { group: 'lab', name: 'Creatinina', analytes: [a('Creatinina', 'mg/dL', 0.6, 1.2)] },
  { group: 'lab', name: 'Perfil renal', analytes: [a('Nitrógeno ureico (BUN)', 'mg/dL', 7, 20), a('Creatinina', 'mg/dL', 0.6, 1.2), a('Ácido úrico', 'mg/dL', 2.5, 7)] },
  { group: 'lab', name: 'Perfil hepático', analytes: [a('TGO (AST)', 'U/L', 0, 40), a('TGP (ALT)', 'U/L', 0, 41), a('Fosfatasa alcalina', 'U/L', 40, 129), a('Bilirrubina total', 'mg/dL', 0.2, 1.2), a('Albúmina', 'g/dL', 3.5, 5)] },
  { group: 'lab', name: 'Electrolitos', analytes: [a('Sodio', 'mEq/L', 135, 145), a('Potasio', 'mEq/L', 3.5, 5.1), a('Cloro', 'mEq/L', 98, 107)] },
  { group: 'lab', name: 'Examen general de orina (EGO)' },
  { group: 'lab', name: 'Examen general de heces' },
  { group: 'lab', name: 'Urocultivo' },
  { group: 'lab', name: 'Hemocultivo' },
  { group: 'lab', name: 'Coprocultivo' },
  { group: 'lab', name: 'Prueba de embarazo en orina' },
  { group: 'lab', name: 'Prueba de embarazo en sangre (β-hCG)', analytes: [a('β-hCG', 'mUI/mL')] },
  { group: 'lab', name: 'Tipo y Rh' },
  { group: 'lab', name: 'VDRL' },
  { group: 'lab', name: 'VIH (prueba rápida)' },
  { group: 'lab', name: 'Antígeno de superficie de hepatitis B' },
  { group: 'lab', name: 'Serología para dengue (NS1, IgM, IgG)' },
  { group: 'lab', name: 'Gases arteriales', analytes: [a('pH', '', 7.35, 7.45), a('pCO2', 'mmHg', 35, 45), a('pO2', 'mmHg', 80, 100), a('HCO3', 'mEq/L', 22, 26)] },
  { group: 'lab', name: 'Tiempos de coagulación (TP, TPT, INR)', analytes: [a('TP', 's', 11, 13.5), a('TPT', 's', 25, 35), a('INR', '', 0.8, 1.2)] },
  { group: 'lab', name: 'TSH', analytes: [a('TSH', 'µUI/mL', 0.4, 4)] },
  { group: 'lab', name: 'T4 libre', analytes: [a('T4 libre', 'ng/dL', 0.8, 1.8)] },
  { group: 'lab', name: 'Proteína C reactiva', analytes: [a('PCR', 'mg/L', undefined, 5)] },
  { group: 'lab', name: 'Velocidad de eritrosedimentación', analytes: [a('VES', 'mm/h', 0, 20)] },
  { group: 'lab', name: 'Troponina I', analytes: [a('Troponina I', 'ng/mL', undefined, 0.04)] },
  { group: 'lab', name: 'Amilasa y lipasa', analytes: [a('Amilasa', 'U/L', 28, 100), a('Lipasa', 'U/L', 13, 60)] },
  { group: 'lab', name: 'Frotis de sangre periférica' },
  { group: 'lab', name: 'Gota gruesa' },
  // Imagen y gabinete: CA5 (ronda 10), el Anexo A (src/lib/imagingCatalog.ts); los que ya existían con otro nombre lo conservan
  ...IMAGING_STUDIES.map((st): CatalogExam => ({ group: 'imaging', name: IMAGING_SAME[st.name] ?? st.name, subgroup: st.subgroup, ...(st.details ? { details: st.details } : {}) })),
]

/**
 * CF3 (ronda 6) y CA1 (ronda 7): subgrupos del catálogo. En Laboratorio son las áreas del formulario (Anexo A) y, en las
 * que tienen secciones, «Área › Sección» (un solo campo de texto). Lo que no se sabe ubicar va a «Otros». VALIDAR: Emil.
 */
export const LAB_SUBGROUPS = LAB_AREAS.flatMap((a) => (a.sections ? a.sections.map((s) => `${a.area}${SECTION_SEP}${s}`) : [a.area]))
export const IMAGING_SUBGROUPS = IMAGING_AREAS
export const SUBGROUPS: Record<ExamGroup, string[]> = { lab: LAB_SUBGROUPS, imaging: IMAGING_SUBGROUPS }
export const OTHER_SUBGROUP = 'Otros'

/** Subgrupo de cada examen de la lista fija: Laboratorio según B3 (ronda 7), Imagen y gabinete según A6 (ronda 6). VALIDAR: Emil. */
export const BASE_SUBGROUP: Record<string, string> = {
  ...EXISTING_SUBGROUP,
  // Imagen y gabinete: CA5 (ronda 10), los del Anexo A
  ...Object.fromEntries(IMAGING_STUDIES.map((st) => [IMAGING_SAME[st.name] ?? st.name, st.subgroup])),
  // Los de antes de CA5 (órdenes ya emitidas): su subgrupo de siempre (EX3 los sigue reconociendo como Rayos X)
  'Radiografía de tórax': 'Rayos X', 'Radiografía': 'Rayos X', 'Radiografía de abdomen': 'Rayos X',
  // CA6 (ronda 11): los de CA5 que se borraron (órdenes ya emitidas) conservan su subgrupo
  ...Object.fromEntries(IMAGING_REMOVED_CA6.map((n) => [n, n.startsWith('Rayos X') || n === 'Serie de abdomen agudo' ? 'Rayos X' : n.startsWith('Ultrasonido') ? 'Ultrasonido'
    : /^(Tomograf|Angiotomograf|Urotomograf)/.test(n) ? 'Tomografía' : 'Resonancia'])),
  'Angiorresonancia cerebral': 'Resonancia',
}
const BASE_SUBGROUP_BY_KEY = new Map(Object.entries(BASE_SUBGROUP).map(([n, sg]) => [examKey(n), sg]))
/** Nombres de la ronda 6 que cambiaron (un examen que la clínica agregó con ellos se ve en el área nueva). */
const LEGACY_AREA: Record<string, string> = { 'Microbiología': 'Microbiología / Bacteriología' }

/** Subgrupo de un examen: el guardado; si no, el de la lista fija; si no, «Otros». */
export function subgroupOf(e: { name: string; subgroup?: string; baseKey?: string }) {
  const saved = e.subgroup?.trim()
  if (saved) return LEGACY_AREA[saved] ?? saved
  return BASE_SUBGROUP_BY_KEY.get(e.baseKey ?? examKey(e.name)) ?? OTHER_SUBGROUP
}

/** CA4 (ronda 7): orden dentro de un área o sección, el del formulario; lo que no está en él, por nombre al final. */
const ORDER = new Map(LAB_ORDER.map((n, i) => [examKey(n), i]))
const byFormOrder = (x: { name: string }, y: { name: string }) =>
  (ORDER.get(examKey(x.name)) ?? 1e6) - (ORDER.get(examKey(y.name)) ?? 1e6) || x.name.localeCompare(y.name, 'es')

/** Los exámenes de una lista agrupados por subgrupo, en el orden de SUBGROUPS (los subgrupos propios, antes de «Otros»). */
export function bySubgroup<T extends { group: ExamGroup; name: string; subgroup?: string; baseKey?: string }>(list: T[], group: ExamGroup) {
  const map = new Map<string, T[]>()
  for (const e of list.filter((x) => x.group === group)) {
    const sg = subgroupOf(e)
    map.set(sg, [...(map.get(sg) ?? []), e])
  }
  const order = SUBGROUPS[group]
  const rank = (s: string) => (s === OTHER_SUBGROUP ? 1000 : order.includes(s) ? order.indexOf(s) : 500)
  return [...map.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0], 'es'))
    .map(([subgroup, items]) => ({ subgroup, items: items.sort(byFormOrder) }))
}

export interface ExamArea<T> { key: string; title: string; items: T[]; sections: { key: string; title: string; items: T[] }[]; count: number }

/**
 * CA4 (ronda 7): árbol de un grupo para los menús plegables: área y, si el área tiene secciones, sección (Laboratorio ›
 * Hormonas › Tiroides). Áreas en el orden del Anexo A (Imagen y gabinete: el de siempre), secciones en el suyo y los
 * exámenes en el orden del formulario. Un examen con sólo el área (o una sección que no es del área) queda en el área.
 */
export function byArea<T extends { group: ExamGroup; name: string; subgroup?: string; baseKey?: string }>(list: T[], group: ExamGroup): ExamArea<T>[] {
  const areas = new Map<string, ExamArea<T>>()
  for (const e of list) {
    if (e.group !== group) continue
    const sg = subgroupOf(e)
    const [area, section] = sg.includes(SECTION_SEP) ? [sg.slice(0, sg.indexOf(SECTION_SEP)), sg.slice(sg.indexOf(SECTION_SEP) + SECTION_SEP.length)] : [sg, '']
    const a = areas.get(area) ?? { key: area, title: area, items: [], sections: [], count: 0 }
    areas.set(area, a)
    a.count++
    const known = group === 'lab' && LAB_AREAS.find((x) => x.area === area)?.sections?.includes(section)
    if (!known) { a.items.push(e); continue }
    let s = a.sections.find((x) => x.title === section)
    if (!s) { s = { key: `${area}${SECTION_SEP}${section}`, title: section, items: [] }; a.sections.push(s) }
    s.items.push(e)
  }
  const areaOrder = group === 'lab' ? LAB_AREAS.map((x) => x.area) : IMAGING_SUBGROUPS
  const rank = (s: string) => (s === OTHER_SUBGROUP ? 1000 : areaOrder.includes(s) ? areaOrder.indexOf(s) : 500)
  return [...areas.values()].sort((a, b) => rank(a.key) - rank(b.key) || a.key.localeCompare(b.key, 'es')).map((a) => {
    const secs = LAB_AREAS.find((x) => x.area === a.key)?.sections ?? []
    return { ...a, items: a.items.sort(byFormOrder), sections: a.sections.sort((x, y) => secs.indexOf(x.title) - secs.indexOf(y.title)).map((x) => ({ ...x, items: x.items.sort(byFormOrder) })) }
  })
}

/** Perfiles o paquetes base: varios exámenes de un toque. La clínica y cada médico agregan los suyos. */
export const BASE_PROFILES: { id: string; name: string; items: { group: ExamGroup; name: string }[] }[] = [
  { id: 'base-dm', name: 'Control de diabetes', items: ['Glucosa en ayunas', 'Hemoglobina glicosilada (HbA1c)', 'Creatinina', 'Perfil lipídico', 'Examen general de orina (EGO)'].map((name) => ({ group: 'lab' as const, name })) },
  { id: 'base-prenatal', name: 'Prenatal del primer trimestre', items: [
    ...['Hemograma', 'Tipo y Rh', 'Glucosa en ayunas', 'Examen general de orina (EGO)', 'Urocultivo', 'VDRL', 'VIH (prueba rápida)', 'Antígeno de superficie de hepatitis B'].map((name) => ({ group: 'lab' as const, name })),
    { group: 'imaging', name: 'Ultrasonido obstétrico' }] },
  { id: 'base-preop', name: 'Preoperatorio', items: [
    ...['Hemograma', 'Tiempos de coagulación (TP, TPT, INR)', 'Química sanguínea', 'Tipo y Rh', 'Examen general de orina (EGO)'].map((name) => ({ group: 'lab' as const, name })),
    // CA5 (ronda 10): la radiografía de tórax ahora pide proyección: se elige al ordenar (no va en el perfil)
    { group: 'imaging', name: 'Electrocardiograma (EKG)' }] },
  { id: 'base-hep', name: 'Perfil hepático', items: [{ group: 'lab', name: 'Perfil hepático' }, { group: 'lab', name: 'Tiempos de coagulación (TP, TPT, INR)' }] },
  { id: 'base-renal', name: 'Perfil renal', items: [{ group: 'lab', name: 'Perfil renal' }, { group: 'lab', name: 'Electrolitos' }, { group: 'lab', name: 'Examen general de orina (EGO)' }] },
]

/** Estados de cada grupo, en orden. «Cancelado» va aparte. */
export const FLOW: Record<ExamGroup, ExamStatus[]> = {
  lab: ['ordered', 'sample', 'result', 'reviewed'],
  imaging: ['ordered', 'done', 'result', 'reviewed'],
}
export const STATUS_LABEL: Record<ExamGroup, Record<ExamStatus, string>> = {
  lab: { ordered: 'Ordenado', sample: 'Muestra tomada', done: 'Muestra tomada', result: 'Resultado listo', reviewed: 'Revisado por el médico', cancelled: 'Cancelado' },
  imaging: { ordered: 'Ordenado', sample: 'Realizado', done: 'Realizado', result: 'Informe listo', reviewed: 'Revisado por el médico', cancelled: 'Cancelado' },
}
/** Lo que hace el área que lo realiza en cada paso. */
export const NEXT_ACTION: Record<ExamGroup, Partial<Record<ExamStatus, string>>> = {
  lab: { ordered: 'Muestra tomada', sample: 'Cargar resultado' },
  imaging: { ordered: 'Realizado', done: 'Cargar informe' },
}

/**
 * Ronda 8: a una radiografía no siempre se le hace lectura. En los de Rayos X el informe es opcional: «Realizado» ya lo
 * cierra para el área (sale de pendientes y de la bandeja) y el médico la puede marcar revisada; si llega la lectura, se
 * agrega igual. Se reconoce por el subgrupo del catálogo o por el nombre (radiografía, rayos X, RX).
 */
export function reportOptional(e: { group: ExamGroup; name: string; subgroup?: string }) {
  if (e.group !== 'imaging') return false
  // EX3 (ronda 8): el subgrupo del catálogo o, escrito a mano, un nombre que empiece por «Rayos X», «Radiografía» o «Rx»
  // (sin importar mayúsculas ni tildes). La lista está en clinicalConfig (VALIDAR: Emil).
  const sub = subgroupOf(e)
  if (XRAY_SUBGROUPS.some((g) => sub === g || sub.endsWith(`${SECTION_SEP}${g}`))) return true
  const name = fold(e.name)
  return XRAY_PREFIXES.some((p) => { const f = fold(p); return name === f || name.startsWith(`${f} `) || name.startsWith(`${f}.`) || name.startsWith(`${f}-`) || name.startsWith(`${f}:`) })
}

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** EX3 (ronda 8): estado que se muestra. En Rayos X, «Realizado · sin informe» (terminado) y «Con informe». */
export function examStatusLabel(e: Pick<ExamOrder, 'group' | 'status' | 'name'> & { subgroup?: string }) {
  if (reportOptional(e)) {
    if (e.status === 'done') return 'Realizado · sin informe'
    if (e.status === 'result') return 'Con informe'
  }
  return STATUS_LABEL[e.group][e.status]
}

/** ¿Sigue pendiente para el área que lo realiza (todavía sin resultado)? Una radiografía realizada ya no lo está. */
export const isPending = (e: Pick<ExamOrder, 'status'> & Partial<Pick<ExamOrder, 'group' | 'name'>>) =>
  ['ordered', 'sample'].includes(e.status) || (e.status === 'done' && !(e.group && e.name && reportOptional({ group: e.group, name: e.name })))

/** ¿Lo puede marcar revisado el médico? Con resultado o, si el informe es opcional (Rayos X), ya realizado. */
/**
 * RX1 (ronda 16): ¿lo terminó (informó, cargó el resultado o realizó) el día `day` (aaaa-mm-dd, fecha local)? Las fechas se
 * guardan en UTC: se compara por la fecha local para que lo terminado después de las 18:00 (UTC−6) quede en el mismo día.
 */
export const finishedOn = (e: Pick<ExamOrder, 'statusAt'> & { result?: { at?: string } }, day: string) => {
  const at = e.result?.at ?? e.statusAt
  return !!at && toLocalDate(new Date(at)) === day
}
/**
 * EX12 (ronda 16): el resultado en el mismo renglón del examen, sin abrirlo: los valores fuera de rango (con su valor) y, si no
 * hay ninguno, los primeros valores o el inicio del informe. No interpreta nada: solo copia lo que se cargó.
 */
export function resultBrief(r?: ExamOrder['result']): { flags: string[]; text?: string } {
  if (!r) return { flags: [] }
  const vals = r.values ?? []
  const fmt = (v: { analyte: string; value: string; unit?: string }) => `${v.analyte} ${v.value}${v.unit ? ` ${v.unit}` : ''}`
  // PX1 (ronda 18): la misma etiqueta que con el examen abierto («Alto» / «Bajo», en ámbar)
  const flags = vals.filter((v) => v.flag).map((v) => `${fmt(v)} · ${v.flag === 'high' ? 'Alto' : 'Bajo'}`)
  if (flags.length) return { flags }
  if (vals.length) return { flags, text: vals.slice(0, 3).map(fmt).join(' · ') + (vals.length > 3 ? ` · y ${vals.length - 3} más` : '') }
  if (r.report) return { flags, text: r.report.length > 110 ? `${r.report.slice(0, 110).trimEnd()}…` : r.report }
  if (r.fileIds?.length) return { flags, text: r.fileIds.length === 1 ? 'Imagen adjunta' : `${r.fileIds.length} imágenes adjuntas` }
  return { flags }
}
export const canReview = (e: Pick<ExamOrder, 'status' | 'group' | 'name'>) => e.status === 'result' || (e.status === 'done' && reportOptional(e))

/**
 * Área que recibe el examen. Laboratorio va al laboratorio de la clínica y, si no tiene, a enfermería (toma de muestra);
 * imagen y gabinete, a imágenes o a enfermería (coordinar o realizar, como el EKG). MC5 (ronda 5): lo externo no va a
 * ninguna bandeja de la clínica (ni en consulta externa ni en una estancia): sólo sale en la orden que se lleva el paciente.
 */
export function areaFor(group: ExamGroup, place: 'clinic' | 'external', _inStay: boolean, s: { hasLab?: boolean; hasImaging?: boolean }): ExamOrder['area'] {
  if (place === 'external') return 'none'
  if (group === 'lab') return s.hasLab ? 'lab' : 'nursing'
  return s.hasImaging ? 'imaging' : 'nursing'
}

/**
 * EX8 (ronda 14): valor inicial de «En la clínica | Externo» al agregar un examen. En consulta externa el paciente se va a su
 * casa: «Externo». En observación y hospitalización (y en la nota de consulta que lleva el ingreso marcado) lo hace la
 * clínica, si tiene ese departamento («Áreas de servicio» de Configuración: laboratorio propio, imágenes propias). Sin ese
 * departamento, y en Consultorio, «Externo» en todos lados (A1). El médico lo cambia por examen.
 */
export function defaultPlace(group: ExamGroup, inStay: boolean, s: { kind?: string; hasLab?: boolean; hasImaging?: boolean }): 'clinic' | 'external' {
  if (!inStay || s.kind === 'office') return 'external'
  return (group === 'lab' ? s.hasLab : s.hasImaging) ? 'clinic' : 'external'
}

/** Alto, bajo o normal según el rango de referencia. */
export function flagOf(value: number, low?: number, high?: number, highOpen?: boolean): 'high' | 'low' | undefined {
  if (low != null && value < low) return 'low'
  // UM1: «<200» deja fuera el 200
  if (high != null && (highOpen ? value >= high : value > high)) return 'high'
  return undefined
}



/**
 * AD4 (ronda 5): catálogo que se ofrece al ordenar: los exámenes activos de la clínica, con los analitos, la región y el
 * lado del examen de la lista fija del que vienen (aunque se haya renombrado). Mientras el catálogo no ha llegado del
 * servidor, la lista fija. Favoritos primero.
 */
export function examCatalog(clinicExams: { group: ExamGroup; name: string; id: string; active: boolean; baseKey?: string; subgroup?: string; details?: ImagingDetails }[], favs: string[] = []): CatalogExam[] {
  const all: CatalogExam[] = !clinicExams.length ? EXAMS.map((e) => withReference({ ...e, subgroup: subgroupOf(e) })) : clinicExams.filter((e) => e.active).map((e) => {
    const base = e.baseKey ? EXAMS.find((b) => examKey(b.name) === e.baseKey) : undefined
    // CA5 (ronda 10): los detalles que guardó la clínica mandan sobre los de la lista fija
    const details = (e as { details?: ImagingDetails }).details ?? base?.details
    // UM1: por su nombre o, si la clínica lo renombró, por el de la lista fija
    const own = withReference({ ...(base ?? {}), group: e.group, name: e.name, clinicId: base ? undefined : e.id, subgroup: subgroupOf(e), details }, (e as { refs?: RefRow[] }).refs)
    return own.reference || !base ? own : { ...withReference({ ...base }), group: e.group, name: e.name, clinicId: undefined, subgroup: subgroupOf(e), details }
  }).sort((a, b) => a.name.localeCompare(b.name, 'es'))
  const f = new Set(favs.map(examKey))
  return [...all.filter((e) => f.has(examKey(e.name))), ...all.filter((e) => !f.has(examKey(e.name)))]
}

/** Un examen por su nombre: en el catálogo dado (con lo de la lista fija) o en la lista fija. */
export const findExam = (name: string, catalog: CatalogExam[] = EXAMS): CatalogExam | undefined => {
  const hit = catalog.find((e) => examKey(e.name) === examKey(name)) ?? EXAMS.find((e) => examKey(e.name) === examKey(name))
  if (hit) return withReference(hit)
  // UM1: un examen del catálogo cargado (Anexo A) que la clínica todavía no tiene en su lista
  const ref = referenceOf(name)
  return ref ? { group: 'lab', name, reference: ref, analytes: ref.analytes } : undefined
}

/**
 * Texto de un examen en una orden: «Radiografía de rodilla, derecha» con su indicación.
 * CA5 (ronda 10): un estudio con detalles (`detailed`) se arma completo, igual en la nota, la pestaña Exámenes, las órdenes
 * impresas y la bandeja: «Rayos X de tórax PA y lateral», «Rayos X de rodilla AP y lateral · Lado derecho», «Tomografía de
 * abdomen y pelvis con triple contraste», «Ultrasonido de partes blandas · Región: cara anterior del muslo derecho». Las
 * órdenes de antes (sin `detailed`) siguen con su texto de siempre.
 */
export function examLine(e: Pick<ExamOrder, 'name' | 'region' | 'side'> & { projections?: string[]; contrast?: string; detailed?: boolean; subject?: string }) {
  // CA6 (ronda 11): estudio genérico: «[Estudio] [contraste] de [de qué] [proyecciones] · Lado [lado]»
  if (e.subject?.trim()) {
    const what = e.subject.trim()
    const de = /^(de|del)\s/i.test(what) ? what : `de ${what}`
    const contrast = e.contrast?.trim() ? ` ${contrastText(e.contrast)}` : ''
    const projs = (e.projections ?? []).map((p) => p.trim()).filter(Boolean)
    const proj = projs.length ? ` ${joinY(projs.map(projectionText))}` : ''
    const side = e.side ? ` · ${IMAGING_SIDES.find((x) => x.value === e.side)?.phrase ?? ''}` : ''
    return `${e.name}${contrast} ${de}${proj}${side}`
  }
  if (e.detailed) {
    const proj = e.projections?.length ? ` ${joinY(e.projections.map(projectionText))}` : ''
    const contrast = e.contrast ? ` ${CONTRAST_PHRASE[e.contrast] ?? e.contrast.toLowerCase()}` : ''
    const side = e.side ? ` · ${IMAGING_SIDES.find((x) => x.value === e.side)?.phrase ?? ''}` : ''
    const region = e.region?.trim() ? ` · Región: ${e.region.trim()}` : ''
    return `${e.name}${proj}${contrast}${side}${region}`
  }
  return [e.name + (e.region ? ` de ${e.region}` : ''), e.side ? (e.side === 'right' ? 'derecha' : e.side === 'left' ? 'izquierda' : 'bilateral') : ''].filter(Boolean).join(', ')
}

/** «AP, lateral y oblicua». */
const joinY = (list: string[]) => (list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} y ${list.at(-1)}`)
/** «Lateral» → «lateral»; «AP», «Towne» quedan igual. */
const projectionText = (p: string) => (PROJECTION_KEEP_CASE.includes(p) || /^[A-ZÁÉÍÓÚÑ]{2}/.test(p) ? p : p.charAt(0).toLocaleLowerCase('es') + p.slice(1))

/** CA6: el contraste en la orden: el de un botón («contrastada», «con contraste») o el escrito («doble contraste» → «con doble contraste»). */
export function contrastText(c: string) {
  const t = c.trim()
  if (CONTRAST_PHRASE[t]) return CONTRAST_PHRASE[t]
  const low = t.charAt(0).toLocaleLowerCase('es') + t.slice(1)
  return /^(con|sin)\s/i.test(low) || !/contrast/i.test(low) ? low : `con ${low}`
}

/** CA5: las opciones de contraste de un estudio. */
export function contrastOptions(d?: ImagingDetails): string[] {
  if (d?.contrast === 'ct2') return CT_CONTRAST_BUTTONS
  if (d?.contrast === 'mr2') return MR_CONTRAST_BUTTONS
  if (d?.contrast === 'mr') return MR_CONTRASTS
  if (d?.contrast === 'ct-multi') return CT_CONTRASTS
  if (d?.contrast === 'ct') return CT_CONTRASTS.filter((c) => !CT_MULTI_CONTRASTS.includes(c))
  return []
}

/**
 * CA5 y CA6: lo que falta para poder ordenar el estudio, como se lee en la fila («Falta escribir de qué», «Falta la
 * proyección», «Falta el contraste», «Falta elegir el lado», «Falta escribir la región»), o nada. El lado opcional de CA6 no falta.
 */
export function missingDetail(e: { projections?: string[]; contrast?: string; side?: string; region?: string; subject?: string }, d?: ImagingDetails) {
  if (!d) return undefined
  if (d.what && !e.subject?.trim()) return 'Falta escribir de qué'
  if (d.projections?.length && !e.projections?.some((p) => p.trim())) return 'Falta la proyección'
  if (d.contrast && !e.contrast?.trim()) return 'Falta el contraste'
  if (d.side && !d.sideOptional && !e.side) return 'Falta elegir el lado'
  if (d.region && !e.region?.trim()) return 'Falta escribir la región'
  return undefined
}

/** ¿El estudio pide algún detalle al ordenarlo? */
export const hasDetails = (d?: ImagingDetails) => !!d && (!!d.projections?.length || !!d.contrast || !!d.side || !!d.region || !!d.what)

/**
 * CA5: búsqueda de «Ordenar exámenes» sin tildes ni mayúsculas, palabra por palabra («tac abdomen», «rx torax»): cada palabra
 * debe estar en el nombre, o uno de sus sinónimos (IMAGING_SEARCH_SYNONYMS: «rx» → «rayos x», «usg» → «ultrasonido»…).
 */
export function examMatches(name: string, query: string, free = false) {
  const n = norm(name)
  const words = norm(query).split(' ').filter(Boolean)
  // Una abreviatura con sinónimo («tac», «rx») solo cuenta al inicio de una palabra (no «eritrosedimentación») o por su sinónimo
  const starts = (w: string) => n.split(/[^a-z0-9]+/).some((x) => x.startsWith(w))
  const hit = (w: string) => (IMAGING_SEARCH_SYNONYMS[w] ? starts(w) || IMAGING_SEARCH_SYNONYMS[w].some((x) => n.includes(x)) : n.includes(w))
  // CA6 (ronda 11): en un genérico con «¿De qué?» el resto es de qué («rx torax» → Rayos X): basta con que una palabra sea el estudio
  return free ? words.some(hit) : words.every(hit)
}

/**
 * Si una indicación escrita es un examen del catálogo («hemograma»), para sugerir pasarlo a Exámenes. Con `catalog`
 * (examCatalog) también reconoce los que agregó la clínica.
 */
export function typedExam(text: string, catalog: Pick<CatalogExam, 'group' | 'name'>[] = EXAMS) {
  const t = norm(text).replace(/[.]$/, '')
  if (t.length < 3) return undefined
  return catalog.find((e) => { const k = examKey(e.name); return t === k || t.startsWith(`${k} `) || k.startsWith(t) && t.length >= 5 }) ??
    catalog.find((e) => t.includes(examKey(e.name.replace(/\s*\(.*\)$/, ''))) && examKey(e.name).length >= 5)
}

/** IM3 (ronda 13): grupo de los exámenes escritos a mano (no catalogados), al final de la orden impresa. */
export const UNCATALOGUED_GROUP = 'Otros exámenes'

/**
 * IM3 (ronda 13): la orden impresa agrupada como el catálogo que ve el médico en «Ordenar exámenes» y en Configuración ›
 * Catálogo: por área del subgrupo (Hematología, Coagulación, Química en sangre…; en imagen, Rayos X, Ultrasonido…), las áreas
 * en el orden del catálogo y los exámenes también (sección por sección y en el orden del formulario). El subgrupo es el que
 * la clínica tiene guardado en su catálogo. Los escritos a mano o que ya no están en el catálogo van al final, en «Otros
 * exámenes». IM4 (ronda 16): en la orden impresa van con viñetas, no numerados.
 */
export function orderGroups<T extends Pick<ExamOrder, 'group' | 'name'> & { uncatalogued?: boolean }>(list: T[], catalog: Pick<CatalogExam, 'group' | 'name' | 'subgroup'>[]) {
  const known = new Map(catalog.map((c) => [`${c.group}:${examKey(c.name)}`, c]))
  const inCat: (T & { subgroup?: string })[] = []
  const loose: T[] = []
  for (const e of list) {
    const c = e.uncatalogued ? undefined : known.get(`${e.group}:${examKey(e.name)}`)
    // Sin el catálogo de la clínica (todavía cargando, o quitado después), el subgrupo de la lista fija
    const sg = c ? c.subgroup ?? subgroupOf(c) : e.uncatalogued ? OTHER_SUBGROUP : subgroupOf(e)
    if (c || sg !== OTHER_SUBGROUP) inCat.push({ ...e, subgroup: sg })
    else loose.push(e)
  }
  const out: { title: string; items: T[] }[] = []
  for (const g of ['lab', 'imaging'] as ExamGroup[]) {
    for (const a of byArea(inCat, g)) out.push({ title: a.title, items: [...a.items, ...a.sections.flatMap((s) => s.items)] as T[] })
  }
  if (loose.length) out.push({ title: UNCATALOGUED_GROUP, items: loose })
  return out
}

/**
 * LB9 (ronda 17): las tarjetas de la bandeja de Laboratorio y de Imágenes, iguales en las tres áreas (Ambulatorio, Observación y
 * Hospitalización): una por paciente y ubicación, en el orden de la lista (los urgentes arriba), con sus exámenes por categoría
 * del catálogo. La regla de los botones es una sola: un botón general con todo lo que se puede marcar ahora y uno por cada
 * categoría que tenga pendientes, aunque sea una sola categoría.
 */
export function trayCards<T extends Pick<ExamOrder, 'group' | 'name' | 'patientId' | 'priority' | 'orderedAt'> & { uncatalogued?: boolean; locationText: string }>(
  list: T[], catalog: Pick<CatalogExam, 'group' | 'name' | 'subgroup'>[], canTake: (e: T) => boolean) {
  const cards = new Map<string, T[]>()
  for (const e of list) { const k = `${e.patientId}|${e.locationText}`; cards.set(k, [...(cards.get(k) ?? []), e]) }
  return [...cards.entries()].map(([key, items]) => ({
    key, items,
    urgent: items.some((x) => x.priority === 'urgent'),
    oldest: items.reduce((a, x) => (x.orderedAt < a ? x.orderedAt : a), items[0].orderedAt),
    takeable: items.filter(canTake),
    cats: orderGroups(items, catalog).map((c) => ({ ...c, takeable: c.items.filter(canTake) })),
  }))
}
