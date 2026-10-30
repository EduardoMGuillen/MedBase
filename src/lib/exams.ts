import type { ExamGroup, ExamOrder, ExamStatus } from './types'

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

/** ¿Sigue pendiente para el área que lo realiza (todavía sin resultado)? */
export const isPending = (e: Pick<ExamOrder, 'status'>) => ['ordered', 'sample', 'done'].includes(e.status)

/**
 * Área que recibe el examen. Laboratorio va al laboratorio de la clínica y, si no tiene, a enfermería (toma de muestra);
 * imagen y gabinete, a imágenes o a enfermería (coordinar o realizar, como el EKG). Externo: en hospitalización y
 * observación enfermería lo coordina; en consulta externa sólo se imprime la orden.
 */
export function areaFor(group: ExamGroup, place: 'clinic' | 'external', inStay: boolean, s: { hasLab?: boolean; hasImaging?: boolean }): ExamOrder['area'] {
  if (place === 'external') return inStay ? 'nursing' : 'none'
  if (group === 'lab') return s.hasLab ? 'lab' : 'nursing'
  return s.hasImaging ? 'imaging' : 'nursing'
}

/** Alto, bajo o normal según el rango de referencia. */
export function flagOf(value: number, low?: number, high?: number): 'high' | 'low' | undefined {
  if (low != null && value < low) return 'low'
  if (high != null && value > high) return 'high'
  return undefined
}

/** Umbrales críticos por omisión (configurables por clínica en Áreas de servicio). Fuera de ellos: alerta crítica. */
export const DEFAULT_CRITICAL: Record<string, { low?: number; high?: number }> = {
  Hemoglobina: { low: 7, high: 20 },
  Plaquetas: { low: 50, high: 1000 },
  Leucocitos: { low: 2, high: 30 },
  Glucosa: { low: 50, high: 400 },
  Potasio: { low: 2.8, high: 6.2 },
  Sodio: { low: 120, high: 160 },
  Creatinina: { high: 5 },
  INR: { high: 5 },
  'Troponina I': { high: 0.4 },
  pH: { low: 7.2, high: 7.6 },
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
export const examKey = (name: string) => norm(name)

/** Catálogo que ve el médico: el base y lo agregado por la clínica; favoritos primero. */
export function examCatalog(clinicExams: { group: ExamGroup; name: string; id: string; active: boolean }[], favs: string[] = []): CatalogExam[] {
  const all = [...EXAMS, ...clinicExams.filter((e) => e.active && !EXAMS.some((b) => examKey(b.name) === examKey(e.name))).map((e) => ({ group: e.group, name: e.name, clinicId: e.id }))]
  const f = new Set(favs.map(examKey))
  return [...all.filter((e) => f.has(examKey(e.name))), ...all.filter((e) => !f.has(examKey(e.name)))]
}

export const findExam = (name: string) => EXAMS.find((e) => examKey(e.name) === examKey(name))

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
