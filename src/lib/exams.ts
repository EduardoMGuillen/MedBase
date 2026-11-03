import type { ExamGroup, ExamOrder, ExamStatus } from './types'
import { EXISTING_SUBGROUP, LAB_AREAS, LAB_ORDER, SECTION_SEP } from './labCatalog.js'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
export const examKey = (name: string) => norm(name)

/** EX1: nombre de los dos grupos de la sección «Exámenes». Un hemograma y un ultrasonido los hace gente distinta. */
export const GROUP_LABEL: Record<ExamGroup, string> = { lab: 'Laboratorio', imaging: 'Imagen y gabinete' }

/** Analito de un examen de laboratorio con su unidad y su rango de referencia (adulto). */
export interface Analyte { name: string; unit: string; low?: number; high?: number }

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
  // Imagen y gabinete
  { group: 'imaging', name: 'Radiografía de tórax' },
  { group: 'imaging', name: 'Radiografía', region: true, side: true },
  { group: 'imaging', name: 'Radiografía de abdomen' },
  { group: 'imaging', name: 'Ultrasonido abdominal' },
  { group: 'imaging', name: 'Ultrasonido pélvico' },
  { group: 'imaging', name: 'Ultrasonido obstétrico' },
  { group: 'imaging', name: 'Ultrasonido renal' },
  { group: 'imaging', name: 'Ultrasonido de tiroides' },
  { group: 'imaging', name: 'Ultrasonido de partes blandas', region: true, side: true },
  { group: 'imaging', name: 'Ultrasonido Doppler', region: true, side: true },
  { group: 'imaging', name: 'Tomografía (TAC)', region: true },
  { group: 'imaging', name: 'Resonancia magnética', region: true },
  { group: 'imaging', name: 'Mamografía', side: true },
  { group: 'imaging', name: 'Electrocardiograma (EKG)' },
  { group: 'imaging', name: 'Ecocardiograma' },
  { group: 'imaging', name: 'Espirometría' },
  { group: 'imaging', name: 'Endoscopia digestiva alta' },
  { group: 'imaging', name: 'Colonoscopia' },
  { group: 'imaging', name: 'Holter de 24 horas' },
]

/**
 * CF3 (ronda 6) y CA1 (ronda 7): subgrupos del catálogo. En Laboratorio son las áreas del formulario (Anexo A) y, en las
 * que tienen secciones, «Área › Sección» (un solo campo de texto). Lo que no se sabe ubicar va a «Otros». VALIDAR: Emil.
 */
export const LAB_SUBGROUPS = LAB_AREAS.flatMap((a) => (a.sections ? a.sections.map((s) => `${a.area}${SECTION_SEP}${s}`) : [a.area]))
export const IMAGING_SUBGROUPS = ['Rayos X', 'Ultrasonido', 'Tomografía', 'Resonancia', 'Cardiología', 'Endoscopia', 'Otros']
export const SUBGROUPS: Record<ExamGroup, string[]> = { lab: LAB_SUBGROUPS, imaging: IMAGING_SUBGROUPS }
export const OTHER_SUBGROUP = 'Otros'

/** Subgrupo de cada examen de la lista fija: Laboratorio según B3 (ronda 7), Imagen y gabinete según A6 (ronda 6). VALIDAR: Emil. */
export const BASE_SUBGROUP: Record<string, string> = {
  ...EXISTING_SUBGROUP,
  // Imagen y gabinete
  'Radiografía de tórax': 'Rayos X', 'Radiografía': 'Rayos X', 'Radiografía de abdomen': 'Rayos X',
  'Ultrasonido abdominal': 'Ultrasonido', 'Ultrasonido pélvico': 'Ultrasonido', 'Ultrasonido obstétrico': 'Ultrasonido', 'Ultrasonido renal': 'Ultrasonido',
  'Ultrasonido de tiroides': 'Ultrasonido', 'Ultrasonido de partes blandas': 'Ultrasonido', 'Ultrasonido Doppler': 'Ultrasonido',
  'Tomografía (TAC)': 'Tomografía', 'Resonancia magnética': 'Resonancia',
  'Electrocardiograma (EKG)': 'Cardiología', 'Ecocardiograma': 'Cardiología', 'Holter de 24 horas': 'Cardiología',
  'Endoscopia digestiva alta': 'Endoscopia', 'Colonoscopia': 'Endoscopia',
  'Mamografía': 'Otros', 'Espirometría': 'Otros',
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
    { group: 'imaging', name: 'Radiografía de tórax' }, { group: 'imaging', name: 'Electrocardiograma (EKG)' }] },
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
  return subgroupOf(e) === 'Rayos X' || /\b(radiograf[ií]a|rayos\s*x|rx)\b/i.test(e.name.normalize('NFC'))
}

/** ¿Sigue pendiente para el área que lo realiza (todavía sin resultado)? Una radiografía realizada ya no lo está. */
export const isPending = (e: Pick<ExamOrder, 'status'> & Partial<Pick<ExamOrder, 'group' | 'name'>>) =>
  ['ordered', 'sample'].includes(e.status) || (e.status === 'done' && !(e.group && e.name && reportOptional({ group: e.group, name: e.name })))

/** ¿Lo puede marcar revisado el médico? Con resultado o, si el informe es opcional (Rayos X), ya realizado. */
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

/** Alto, bajo o normal según el rango de referencia. */
export function flagOf(value: number, low?: number, high?: number): 'high' | 'low' | undefined {
  if (low != null && value < low) return 'low'
  if (high != null && value > high) return 'high'
  return undefined
}



/**
 * AD4 (ronda 5): catálogo que se ofrece al ordenar: los exámenes activos de la clínica, con los analitos, la región y el
 * lado del examen de la lista fija del que vienen (aunque se haya renombrado). Mientras el catálogo no ha llegado del
 * servidor, la lista fija. Favoritos primero.
 */
export function examCatalog(clinicExams: { group: ExamGroup; name: string; id: string; active: boolean; baseKey?: string; subgroup?: string }[], favs: string[] = []): CatalogExam[] {
  const all: CatalogExam[] = !clinicExams.length ? EXAMS.map((e) => ({ ...e, subgroup: subgroupOf(e) })) : clinicExams.filter((e) => e.active).map((e) => {
    const base = e.baseKey ? EXAMS.find((b) => examKey(b.name) === e.baseKey) : undefined
    return { ...(base ?? {}), group: e.group, name: e.name, clinicId: base ? undefined : e.id, subgroup: subgroupOf(e) }
  }).sort((a, b) => a.name.localeCompare(b.name, 'es'))
  const f = new Set(favs.map(examKey))
  return [...all.filter((e) => f.has(examKey(e.name))), ...all.filter((e) => !f.has(examKey(e.name)))]
}

/** Un examen por su nombre: en el catálogo dado (con lo de la lista fija) o en la lista fija. */
export const findExam = (name: string, catalog: CatalogExam[] = EXAMS) => catalog.find((e) => examKey(e.name) === examKey(name)) ?? EXAMS.find((e) => examKey(e.name) === examKey(name))

/** Texto de un examen en una orden: «Radiografía de rodilla, derecha» con su indicación. */
export function examLine(e: Pick<ExamOrder, 'name' | 'region' | 'side'>) {
  return [e.name + (e.region ? ` de ${e.region}` : ''), e.side ? (e.side === 'right' ? 'derecha' : e.side === 'left' ? 'izquierda' : 'bilateral') : ''].filter(Boolean).join(', ')
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
