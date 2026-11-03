/**
 * UM1 (ronda 8): valores de referencia de los exámenes de laboratorio del catálogo, tomados TAL CUAL de «Valores de
 * referencia de laboratorio — Catálogo completo» (docs/ronda8/valores_referencia_laboratorio.md, 02/11/2026). Adultos no
 * embarazadas (≥18 años), unidades convencionales. Cada valor lleva su fuente (src/lib/labSources.ts) y «‡» cuando el
 * documento dice que no hay una fuente específica verificada. Reemplazan los rangos que el examen ya tuviera.
 *
 *   VALIDAR: Emil. No se completó ni se corrigió ningún valor de memoria. Únicas adaptaciones, para que funcionen los
 *   umbrales críticos que ya usan las clínicas (todos en ×10³/µL): leucocitos 4,000–11,000 /µL se escribe 4.0–11.0 ×10³/µL
 *   y plaquetas 150,000–450,000 /µL, 150–450 ×10³/µL (la misma cifra). Los analitos de líquidos y de orina llevan el
 *   líquido en el nombre («Glucosa (LCR)», «pH urinario») para que no los tome el umbral crítico de la sangre.
 *
 * El rango oficial de un resultado es siempre el del laboratorio que lo emite: el que se carga con el resultado manda.
 */

/** Un límite: [mínimo, máximo]; `undefined` es sin límite de ese lado. */
type Pair = [number | undefined, number | undefined]

export interface RefAnalyte {
  name: string
  unit: string
  low?: number
  high?: number
  /** «<200»: 200 ya queda fuera (alto). Sin esto, el máximo es inclusivo («≤0.8»). */
  highOpen?: boolean
  /** Por sexo, cuando el documento los separa. */
  f?: Pair
  m?: Pair
  /** Lo que el documento dice además del número (categorías, puntos de corte, resultado esperado). */
  text?: string
}

export interface LabReference {
  /** Fuentes (claves de LAB_SOURCES) o «‡». */
  src: string[]
  /** Analitos con número: se cargan valor por valor y se marcan Alto/Bajo. */
  analytes?: RefAnalyte[]
  /** Resultado esperado o interpretación, cuando no es un número (o además de él). */
  text?: string
  /** ⚠️ y demás notas del documento. */
  note?: string
}

const X = '‡'
const n = (name: string, unit: string, low?: number, high?: number, text?: string): RefAnalyte => ({ name, unit, low, high, text })
const lt = (name: string, unit: string, high: number, text?: string): RefAnalyte => ({ name, unit, high, highOpen: true, text })
const le = (name: string, unit: string, high: number, text?: string): RefAnalyte => ({ name, unit, high, text })
const ge = (name: string, unit: string, low: number, text?: string): RefAnalyte => ({ name, unit, low, text })
const sx = (name: string, unit: string, f: Pair | undefined, m: Pair | undefined, text?: string, highOpen?: boolean): RefAnalyte => ({ name, unit, f, m, text, highOpen })
const txt = (name: string, unit: string, text: string): RefAnalyte => ({ name, unit, text })
const q = (text: string, src: string[] = [X], note?: string): LabReference => ({ src, text, note })
const A = 'ABIM-2026'

// Bloques que se repiten en varios exámenes (perfiles y paquetes)
const CREAT = sx('Creatinina', 'mg/dL', [0.5, 1.1], [0.7, 1.3])
const BUN = n('Nitrógeno ureico (BUN)', 'mg/dL', 8, 20)
const URIC = n('Ácido úrico', 'mg/dL', 3.0, 7.0)
const GLU = n('Glucosa', 'mg/dL', 70, 99, 'Normal 70–99 · Prediabetes 100–125 · Diabetes ≥126 (ADA-2026)')
const NA = n('Sodio', 'mEq/L', 136, 145)
const K = n('Potasio', 'mEq/L', 3.5, 5.0)
const CL = n('Cloruro', 'mEq/L', 98, 106)
const AST = n('TGO (AST)', 'U/L', 10, 40)
const ALT = n('TGP (ALT)', 'U/L', 10, 40)
const FA = n('Fosfatasa alcalina', 'U/L', 30, 120)
const BILT = n('Bilirrubina total', 'mg/dL', 0.3, 1.0)
const ALB = n('Albúmina', 'g/dL', 3.5, 5.5)
const CT = lt('Colesterol total', 'mg/dL', 200, 'Deseable <200 · Limítrofe 200–239 · Alto >239')
const HDL = sx('Colesterol HDL', 'mg/dL', [50, undefined], [40, undefined], 'Bajo: mujeres <50 · hombres <40')
const LDL = lt('Colesterol LDL', 'mg/dL', 100, 'Óptimo <100 · Casi óptimo 100–129 · Limítrofe 130–159 · Alto 160–189 · Muy alto >189')
const TG = lt('Triglicéridos', 'mg/dL', 150, 'Ayuno. Óptimo <100 · Normal <150 · Limítrofe 150–199 · Alto 200–499 · Muy alto >499')
const TP = n('TP', 's', 11, 13)
const TPT = n('TPT', 's', 25, 35, 'TPT activado (TTPa)')
const INR = n('INR', '', 0.8, 1.1, 'Sin anticoagulante 0.8–1.1 · Meta con warfarina 2.0–3.0 [MLP-TP]')
const PATHOGEN = 'Negativo / no reactivo / no detectado en persona no infectada.'
const NOT_DETECTED = 'No detectado.'
const DRUG_CUTOFF = 'Punto de corte del tamizaje inicial en orina: negativo si está por debajo.'

/** Por nombre del examen tal como está en el catálogo (Anexo A de la ronda 7 y la lista fija). */
export const LAB_REFERENCE: Record<string, LabReference> = {
  // 1. Hematología
  'Hemograma': { src: [A], analytes: [
    n('Eritrocitos', 'millones/µL', 4.2, 5.9, 'Sin separar por sexo'),
    sx('Hemoglobina', 'g/dL', [12, 16], [14, 18]), sx('Hematocrito', '%', [37, 47], [42, 50]),
    n('VCM', 'fL', 80, 98), n('HCM', 'pg', 28, 32), n('CHCM', 'g/dL', 33, 36), n('ADE / RDW', '%', 9.0, 14.5),
    n('Leucocitos', '×10³/µL', 4.0, 11.0, '4,000–11,000 /µL'),
    n('Neutrófilos segmentados', '%', 50, 70, 'Absoluto 2,000–8,250 /µL'), n('Bandas', '%', 0, 5), n('Linfocitos', '%', 30, 45, 'Absoluto 1,200–4,950 /µL'),
    n('Monocitos', '%', 0, 6, 'Absoluto 0–660 /µL'), n('Eosinófilos', '%', 0, 3, 'Absoluto 0–330 /µL'), n('Basófilos', '%', 0, 1, 'Absoluto 0–110 /µL'),
    n('Plaquetas', '×10³/µL', 150, 450, '150,000–450,000 /µL'), n('VPM', 'fL', 7, 9),
  ] },
  'Células falciformes (drepanocitos)': q('Negativo.', ['MLP-Falciformes'], 'La ferropenia o una transfusión en los 3 meses previos puede dar un falso negativo; la prueba no distingue rasgo de enfermedad.'),
  'Coombs directo': q('Negativo (sin aglutinación).', ['MLP-Coombs']),
  'Coombs indirecto': q('Negativo (sin aglutinación).', ['MLP-Coombs']),
  'Crioaglutininas': { src: [A], analytes: [txt('Crioaglutininas', 'título', '≤1:64')] },
  'Velocidad de eritrosedimentación': { src: [A], analytes: [sx('VES', 'mm/h', [0, 20], [0, 15], 'Westergren')] },
  'Frotis de sangre periférica': q('Eritrocitos uniformes con palidez central; morfología y diferencial normales; sin parásitos.', ['MLP-Frotis']),
  'Tipo y Rh': q('Sin valor «normal»: A, B, AB u O; Rh positivo o negativo.', ['MLP-Grupo']),
  'Hematozoario (Plasmodium spp.)': q('Negativo en gota gruesa y extendido fino.', ['CDC-Malaria'], 'Un frotis negativo hace improbable el diagnóstico, pero ante sospecha clínica el CDC recomienda repetir la gota gruesa cada 12–24 h hasta completar 3 muestras.'),
  'Gota gruesa': q('Negativo en gota gruesa y extendido fino.', ['CDC-Malaria'], 'Un frotis negativo hace improbable el diagnóstico, pero ante sospecha clínica el CDC recomienda repetir la gota gruesa cada 12–24 h hasta completar 3 muestras.'),
  'Reticulocitos': { src: [A], analytes: [n('Reticulocitos', '%', 0.5, 1.5), n('Reticulocitos (absoluto)', '/µL', 25000, 100000)] },
  'Eosinófilos': { src: [A], analytes: [n('Eosinófilos (recuento absoluto)', '/µL', 0, 330)] },
  'Electroforesis de hemoglobina': { src: [A, 'MLP-Falciformes'], analytes: [n('Hb A', '%', 96, 98), n('Hb A2', '%', 1.5, 3.5), lt('Hb F', '%', 1), txt('Hb S y otras variantes', '', 'Ausentes [MLP-Falciformes]')] },

  // 2. Coagulación
  'Anticoagulante lúpico': { src: [A], analytes: [n('dRVVT', 's', 33, 44, 'Tiempo de veneno de víbora de Russell diluido')] },
  'Dímero-D': { src: [A], analytes: [lt('Dímero-D', 'µg/mL', 0.5)] },
  'Fibrinógeno': { src: [A], analytes: [n('Fibrinógeno', 'mg/dL', 200, 400)] },
  'Proteína C': { src: [A], analytes: [n('Proteína C (actividad)', '%', 65, 150), n('Proteína C (antígeno)', '%', 70, 140)] },
  'Proteína S': { src: [A], analytes: [n('Proteína S (actividad)', '%', 57, 131), n('Proteína S antígeno total', '%', 60, 140), n('Proteína S libre', '%', 60, 130)] },
  'Antitrombina III': { src: [A], analytes: [n('Antitrombina III (actividad)', '%', 80, 120)] },
  'Retracción del coágulo': q('Retracción dentro de 4 h; el coágulo ocupa el 40–60% del volumen original.', ['MGH-Retracción']),
  'Tiempo de coagulación': { src: ['FPN-Coag'], analytes: [n('Tiempo de coagulación (Lee-White)', 'min', 9, 15)] },
  'Tiempo de protrombina (TP)': { src: [A, 'MLP-TP'], analytes: [TP, INR] },
  'Tiempo de sangrado': { src: [A], analytes: [lt('Tiempo de sangrado (plantilla)', 'min', 8)] },
  'Tiempo de tromboplastina parcial (TPT)': { src: [A], analytes: [TPT] },
  'Tiempos de coagulación (TP, TPT, INR)': { src: [A, 'MLP-TP'], analytes: [TP, TPT, INR] },

  // 3. Química en sangre
  'Glucosa en ayunas': { src: [A, 'ADA-2026'], analytes: [GLU], note: 'Salvo hiperglucemia inequívoca, el diagnóstico requiere confirmar con una segunda prueba.' },
  'Glucosa posprandial': { src: [X], analytes: [txt('Glucosa', 'mg/dL', 'Sin intervalo estandarizado (el criterio diagnóstico usa la glucosa a las 2 h de una carga de 75 g).')] },
  'Tolerancia oral a la glucosa 2 horas': { src: ['ADA-2026'], analytes: [lt('Glucosa 2 h', 'mg/dL', 140, 'Normal <140 · Intolerancia 140–199 · Diabetes ≥200')] },
  'Curva de tolerancia de glucosa 2 horas': { src: ['ADA-2026'], analytes: [lt('Glucosa 2 h', 'mg/dL', 140, 'Normal <140 · Intolerancia 140–199 · Diabetes ≥200')] },
  'Curva de tolerancia de glucosa 3 horas': q('Sin puntos de corte estandarizados (no gestacional). En estudio de hipoglucemia: glucosa <55 mg/dL con síntomas (tríada de Whipple).', ['EndoSoc-Hipoglucemia']),
  'Curva de tolerancia de glucosa 4 horas': q('Sin puntos de corte estandarizados (no gestacional). En estudio de hipoglucemia: glucosa <55 mg/dL con síntomas (tríada de Whipple).', ['EndoSoc-Hipoglucemia']),
  'Curva de tolerancia de glucosa 5 horas': q('Sin puntos de corte estandarizados (no gestacional). En estudio de hipoglucemia: glucosa <55 mg/dL con síntomas (tríada de Whipple).', ['EndoSoc-Hipoglucemia']),
  'Hemoglobina glicosilada (HbA1c)': { src: [A, 'ADA-2026'], analytes: [n('HbA1c', '%', 4.0, 5.6, 'Normal 4.0–5.6 · Prediabetes 5.7–6.4 · Diabetes ≥6.5')], note: 'ADA no recomienda usarla para diagnóstico en embarazo, hemoglobinopatías, transfusión reciente o anemia marcada.' },
  'Sullivan 50 g (2 muestras)': { src: ['ADA-2023-GDM'], analytes: [txt('Glucosa 1 h (sin ayuno)', 'mg/dL', 'Positivo (pasar a curva de 100 g) si ≥130, ≥135 o ≥140, según el umbral que adopte la institución.')] },
  'Curva de tolerancia 2 h glucosa gestacional 75 g': { src: ['ADA-2026'], text: 'Diabetes gestacional (un paso, IADPSG): basta UN valor.', analytes: [lt('Glucosa en ayunas', 'mg/dL', 92), lt('Glucosa 1 h', 'mg/dL', 180), lt('Glucosa 2 h', 'mg/dL', 153)] },
  'Curva de tolerancia 3 h glucosa gestacional 100 g': { src: ['ADA-2026'], text: 'Diabetes gestacional (Carpenter-Coustan): se requieren DOS valores.', analytes: [lt('Glucosa en ayunas', 'mg/dL', 95), lt('Glucosa 1 h', 'mg/dL', 180), lt('Glucosa 2 h', 'mg/dL', 155), lt('Glucosa 3 h', 'mg/dL', 140)] },
  'Creatinina': { src: [A], analytes: [CREAT] },
  'Urea nitrogenada (BUN)': { src: [A], analytes: [BUN] },
  'Ácido úrico': { src: [A], analytes: [URIC] },
  'Sodio (Na)': { src: [A], analytes: [NA] },
  'Potasio (K)': { src: [A], analytes: [K] },
  'Cloruro (Cl)': { src: [A], analytes: [CL] },
  'CO2': { src: [A], analytes: [n('CO₂ (sérico)', 'mEq/L', 23, 30)] },
  'Calcio': { src: [A], analytes: [n('Calcio', 'mg/dL', 8.6, 10.2)] },
  'Fósforo': { src: [A], analytes: [n('Fósforo', 'mg/dL', 3.0, 4.5)] },
  'Magnesio (Mg)': { src: [A], analytes: [n('Magnesio', 'mg/dL', 1.6, 2.6)] },
  'Osmolaridad plasmática': { src: [A], analytes: [n('Osmolalidad sérica', 'mOsm/kg H₂O', 275, 295)] },
  'Electrolitos': { src: [A], analytes: [NA, K, CL] },
  'TGO (aspartato)': { src: [A], analytes: [AST] },
  'TGP (alanino)': { src: [A], analytes: [ALT] },
  'Fosfatasa alcalina': { src: [A], analytes: [FA] },
  'Gamma glutamil transpeptidasa (GGT)': { src: [A], analytes: [sx('GGT', 'U/L', [8, 40], [9, 50])] },
  'Bilirrubinas totales y fraccionadas': { src: [A], analytes: [BILT, n('Bilirrubina directa', 'mg/dL', 0.1, 0.3), n('Bilirrubina indirecta', 'mg/dL', 0.2, 0.7)] },
  'Deshidrogenasa láctica (LDH)': { src: [A], analytes: [n('LDH', 'U/L', 80, 225)] },
  'Amilasa': { src: [A], analytes: [n('Amilasa', 'U/L', 25, 125)] },
  'Lipasa': { src: [A], analytes: [n('Lipasa', 'U/L', 10, 140)] },
  'Amilasa y lipasa': { src: [A], analytes: [n('Amilasa', 'U/L', 25, 125), n('Lipasa', 'U/L', 10, 140)] },
  'Amonio sérico': { src: [A], analytes: [n('Amonio', 'µg/dL', 40, 70)] },
  'Aldolasa': { src: [A], analytes: [n('Aldolasa', 'IU/mL', 0.8, 3.0)], note: '⚠️ ABIM la expresa en IU/mL, una unidad poco habitual. Verifica la unidad que usa tu laboratorio antes de comparar.' },
  'Colinesterasa': { src: [A], analytes: [ge('Colinesterasa sérica', 'unidad de pH/h', 0.5), ge('Colinesterasa eritrocitaria', 'unidad de pH/h', 0.7)], note: '⚠️ ABIM usa un método antiguo (unidades de pH/h). Verifica la unidad que usa tu laboratorio antes de comparar.' },
  'CPK (creatin fosfoquinasa)': { src: [A], analytes: [sx('CPK total', 'U/L', [30, 135], [55, 170])] },
  'CPK-MB': { src: [A], analytes: [lt('CPK-MB', '% del CPK total', 5)] },
  'Proteínas totales y fraccionadas': { src: [A], analytes: [n('Proteínas totales', 'g/dL', 5.5, 9.0), ALB, n('Globulinas', 'g/dL', 2.0, 3.5)] },
  'Albúmina': { src: [A], analytes: [ALB] },
  'Electroforesis de proteínas': { src: [A], analytes: [ALB, n('Alfa-1', 'g/dL', 0.2, 0.4), n('Alfa-2', 'g/dL', 0.5, 0.9), n('Beta', 'g/dL', 0.6, 1.1), n('Gamma', 'g/dL', 0.7, 1.7)] },
  'Colesterol total': { src: [A], analytes: [CT] },
  'Colesterol HDL': { src: [A], analytes: [HDL] },
  'Colesterol LDL': { src: [A], analytes: [LDL] },
  'Triglicéridos': { src: [A], analytes: [TG] },
  'Perfil lipídico': { src: [A], analytes: [CT, HDL, LDL, TG] },
  'Hierro sérico': { src: [A], analytes: [n('Hierro sérico', 'µg/dL', 50, 150)] },
  'Capacidad de captación de hierro': { src: [A], analytes: [n('Capacidad total de fijación de hierro (TIBC)', 'µg/dL', 250, 310), n('Saturación de transferrina', '%', 20, 50)] },
  'Homocisteína': { src: [A], analytes: [n('Homocisteína', 'µmol/L', 5, 15)] },
  'Proteína C reactiva': { src: [A], analytes: [le('PCR', 'mg/dL', 0.8)] },
  'PCR ultrasensible (PCR-us)': { src: [A], analytes: [le('PCR ultrasensible', 'mg/L', 3.0, 'Riesgo cardiovascular: Bajo <1.0 · Promedio 1.0–3.0 · Alto >3.0')] },
  'Troponina I': { src: [A], analytes: [le('Troponina I', 'ng/mL', 0.04, 'Convencional'), sx('Troponina I alta sensibilidad', 'ng/L', [undefined, 15], [undefined, 20])] },
  'Litio': { src: ['CHI-TDM'], analytes: [n('Litio', 'mmol/L', 0.6, 1.2, 'Rango terapéutico (= mEq/L). Valor de pánico >2.0')] },
  'Investigación de hemoglobina S (HPLC)': q('Hb S ausente.', ['MLP-Falciformes']),
  'Química sanguínea': { src: [A, 'ADA-2026'], analytes: [GLU, BUN, CREAT, URIC] },
  'Perfil renal': { src: [A], analytes: [BUN, CREAT, URIC] },
  'Perfil hepático': { src: [A], analytes: [AST, ALT, FA, BILT, ALB] },

  // 4. Química en orina
  '17 Cetosteroides en orina de 24 horas': { src: ['MLP-17KS'], analytes: [sx('17-cetosteroides', 'mg/24 h', [5, 15], [7, 20])] },
  '17 Hidroxiesteroides en orina de 24 horas': { src: [A], analytes: [sx('17-hidroxiesteroides', 'mg/24 h', [2, 8], [3, 10])] },
  'Ácido úrico / 24 horas': { src: [A], analytes: [n('Ácido úrico (24 h)', 'mg/24 h', 250, 750)] },
  'Ácido vanilmandélico en orina de 24 horas': { src: [A], analytes: [lt('Ácido vanililmandélico (24 h)', 'mg/24 h', 9)] },
  'Calcio / 24 horas': { src: [A], analytes: [sx('Calcio (24 h)', 'mg/24 h', [undefined, 250], [undefined, 300], undefined, true)] },
  'Creatinina / 24 horas': { src: [A], analytes: [n('Creatinina (24 h)', 'mg/kg/24 h', 15, 25)] },
  'Depuración de creatinina / 24 horas': { src: [A], analytes: [n('Depuración de creatinina', 'mL/min/1.73 m²', 90, 140)] },
  'Aclaramiento de creatinina': { src: [A], analytes: [n('Depuración de creatinina', 'mL/min/1.73 m²', 90, 140)] },
  'Fósforo / 24 horas': { src: [A], analytes: [n('Fósforo (24 h)', 'mg/24 h', 500, 1200)] },
  'Magnesio / 24 horas': { src: [A], analytes: [n('Magnesio (24 h)', 'mg/24 h', 14, 290)] },
  'Proteínas totales / 24 horas': { src: [A], analytes: [lt('Proteínas totales (24 h)', 'mg/24 h', 100)] },
  'Índice proteína-creatinina en orina': { src: [A], analytes: [lt('Índice proteína/creatinina', 'mg/mg', 0.2)] },
  'Cociente albúmina-creatinina en orina': { src: [A, 'KDIGO'], analytes: [lt('Cociente albúmina/creatinina', 'mg/g', 30, 'Normal <30 [ABIM-2026] · Punto de corte clínico: A2 30–300 · A3 >300 [KDIGO]')] },
  'Microalbuminuria en 24 horas': { src: [A, 'KDIGO'], analytes: [lt('Microalbuminuria (24 h)', 'mg/24 h', 25, 'Normal <25 [ABIM-2026] · Punto de corte clínico: A2 30–300 · A3 >300 [KDIGO]')] },
  'Cortisol libre en orina / 24 horas': { src: [A], analytes: [n('Cortisol libre urinario (24 h)', 'µg/24 h', 4, 50)] },
  'Tasa de filtrado glomerular': { src: ['KDIGO'], analytes: [ge('TFG', 'mL/min/1.73 m²', 90, 'G1 ≥90 normal o alta · G2 60–89 levemente disminuida · G3a 45–59 · G3b 30–44 · G4 15–29 gravemente disminuida · G5 <15 falla renal')],
    note: 'G1 y G2 no cumplen criterios de enfermedad renal crónica si no hay otro marcador de daño renal [KDIGO].' },

  // 5. Hormonas
  '17 OH-Progesterona': { src: [A], analytes: [txt('17-OH-progesterona', 'ng/dL', 'Mujer folicular <80 · lútea <285 · posmenopausia <51 · Hombre <220')] },
  'BHCG (gonadotropina coriónica humana, fracción beta)': { src: [A], analytes: [txt('β-hCG', 'U/L', 'No embarazo: mujer premenopáusica <1.0 · posmenopáusica <7.0 · hombre <1.4')] },
  'Prueba de embarazo en sangre (β-hCG)': { src: [A], text: 'Negativo en mujer no embarazada.', analytes: [txt('β-hCG', 'U/L', 'No embarazo: mujer premenopáusica <1.0 · posmenopáusica <7.0 · hombre <1.4')] },
  'DHEA-S': { src: [A], analytes: [sx('DHEA-S', 'µg/dL', [44, 332], [89, 457])] },
  'Estradiol': { src: [A], analytes: [txt('Estradiol', 'pg/mL', 'Folicular 10–180 · Pico 100–300 · Lútea 40–200 · Posmenopausia <10 · Hombre 20–50')] },
  'FSH (hormona folículo estimulante)': { src: [A], analytes: [txt('FSH', 'mUI/mL', 'Mujer folicular/lútea 2–9 · Pico 4–22 · Posmenopausia >30 · Hombre 1–7')] },
  'LH (hormona luteinizante)': { src: [A], analytes: [txt('LH', 'mUI/mL', 'Mujer folicular/lútea 1–12 · Pico 9–80 · Posmenopausia >30 · Hombre 2–9')] },
  'Progesterona': { src: [A], analytes: [txt('Progesterona', 'ng/mL', 'Mujer folicular 0.02–0.9 · lútea 2–30 · Hombre 0.12–0.3')] },
  'Prolactina (PRL)': { src: [A], analytes: [lt('Prolactina', 'ng/mL', 20)] },
  'SHBG': { src: [A], analytes: [sx('SHBG', 'nmol/L', [18, 144], [10, 57], 'Mujeres no embarazadas 18–144 · Hombres 10–57')] },
  'Testosterona': { src: [A], analytes: [sx('Testosterona total', 'ng/dL', [18, 54], [291, 1100]), sx('Testosterona libre', 'pg/mL', undefined, [70, 300], 'Hombres 70–300')] },
  'Índice de testosterona libre': { src: [X], analytes: [txt('Índice de testosterona libre (FAI)', '%', 'Sin intervalo verificado; depende del laboratorio.')] },
  'Hormona antimülleriana': { src: ['Mayo-AMH'], analytes: [txt('Hormona antimülleriana', 'ng/mL', 'Mujeres: 20–24 a 1.2–12 · 25–29 a 0.89–9.9 · 30–34 a 0.58–8.1 · 35–39 a 0.15–7.5 · 40–44 a 0.03–5.5 · 45–50 a <2.6 · 51–55 a <0.88 · >55 a <0.03. Hombres >12 años: <13')] },
  'Androstenediona': { src: [A], analytes: [sx('Androstenediona', 'ng/dL', [30, 200], [40, 150])] },
  'TSH': { src: [A], analytes: [n('TSH', 'µU/mL', 0.5, 4.0)] },
  'T4 libre': { src: [A], analytes: [n('T4 libre', 'ng/dL', 0.8, 1.8)] },
  'T4 tiroxina total': { src: [A], analytes: [n('T4 total', 'µg/dL', 5, 12)] },
  'T3 libre': { src: [A], analytes: [n('T3 libre', 'pg/mL', 2.3, 4.2)] },
  'T3 triyodotironina total': { src: [A], analytes: [n('T3 total', 'ng/dL', 80, 180)] },
  'T4-Uptake': { src: [A], analytes: [n('T4-Uptake (captación de T3 por resina)', '%', 25, 35)] },
  'Tiroglobulina': { src: [A], analytes: [lt('Tiroglobulina', 'ng/mL', 20)] },
  'Ac. antiperoxidasa (anti-TPO)': { src: [A], analytes: [lt('Anti-TPO', 'U/mL', 2.0)] },
  'Ac. antitiroglobulina (TG)': { src: [A], analytes: [lt('Anti-tiroglobulina', 'U/mL', 20)] },
  'Anticuerpos antitiroideos (anti-TPO / anti-TG)': { src: [A], analytes: [lt('Anti-TPO', 'U/mL', 2.0), lt('Anti-tiroglobulina', 'U/mL', 20)] },
  'ACTH': { src: [A], analytes: [n('ACTH', 'pg/mL', 10, 60)] },
  'Cortisol a.m.': { src: [A], analytes: [n('Cortisol a.m. (8 h)', 'µg/dL', 5, 25)] },
  'Cortisol p.m.': { src: [A], analytes: [lt('Cortisol p.m. (16 h)', 'µg/dL', 10)] },
  'Insulina': { src: [A], analytes: [lt('Insulina (ayuno)', 'µU/mL', 20)] },
  'Insulina post prandial': { src: [X], analytes: [txt('Insulina posprandial', 'µU/mL', 'Sin intervalo estandarizado.')] },
  'Curva de insulina (especificar horas)': q('Sin intervalo estandarizado; se interpreta junto con la curva de glucosa (µU/mL).'),
  'Hormona del crecimiento': { src: [A], analytes: [lt('Hormona del crecimiento (en reposo)', 'ng/mL', 5, 'Respuesta a estímulo >7')] },
  'IGF-1': { src: [A], analytes: [txt('IGF-1', 'ng/mL', '16–24 a: 182–780 · 25–39 a: 114–492 · 40–54 a: 90–360 · ≥55 a: 71–290')] },
  'IGFBP3': { src: ['Mayo-IGFBP3'], analytes: [txt('IGFBP-3', 'µg/mL', '21–25 a: 3.4–7.8 · 26–30 a: 3.5–7.6 · 31–35 a: 3.5–7.0 · 36–40 a: 3.4–6.7 · 41–45 a: 3.3–6.6 · 46–50 a: 3.3–6.7 · 51–55 a: 3.4–6.8 · 56–60 a: 3.4–6.9 · 61–65 a: 3.2–6.6 · 66–70 a: 3.0–6.2')] },
  'PTH (paratohormona)': { src: [A], analytes: [n('PTH intacta', 'pg/mL', 10, 65)] },

  // 6. Drogas de abuso y fármacos
  'Anfetaminas': { src: ['SAMHSA'], analytes: [lt('Anfetaminas (d-metanfetamina/d-anfetamina)', 'ng/mL', 500, DRUG_CUTOFF)] },
  'Cocaína': { src: ['SAMHSA'], analytes: [lt('Cocaína (benzoilecgonina)', 'ng/mL', 150, DRUG_CUTOFF)] },
  'Marihuana': { src: ['SAMHSA'], analytes: [lt('Marihuana (THCA)', 'ng/mL', 50, DRUG_CUTOFF)] },
  'Etanol': { src: [A], analytes: [lt('Etanol (sangre)', 'mg/dL', 5, 'Intoxicación ≥80–100')] },
  'Nicotina': q('Cotinina: negativo en no fumador; el punto de corte depende del kit (ng/mL).'),
  'Set de 2 drogas': q('Usa los puntos de corte de cada sustancia (anfetaminas 500, cocaína 150, marihuana 50 ng/mL); las no listadas dependen del kit (‡).', ['SAMHSA', X]),
  'Set de 4 drogas': q('Usa los puntos de corte de cada sustancia (anfetaminas 500, cocaína 150, marihuana 50 ng/mL); las no listadas dependen del kit (‡).', ['SAMHSA', X]),
  'Set de 7 drogas': q('Usa los puntos de corte de cada sustancia (anfetaminas 500, cocaína 150, marihuana 50 ng/mL); las no listadas dependen del kit (‡).', ['SAMHSA', X]),
  'Set de 12 drogas': q('Usa los puntos de corte de cada sustancia (anfetaminas 500, cocaína 150, marihuana 50 ng/mL); las no listadas dependen del kit (‡).', ['SAMHSA', X]),
  'Ácido valproico': { src: ['MSD-TDM'], analytes: [n('Ácido valproico', 'µg/mL', 50, 99, 'Rango terapéutico. Valor crítico ≥100')] },
  'Carbamazepina': { src: ['MSD-TDM'], analytes: [n('Carbamazepina', 'µg/mL', 4.0, 12.0, 'Rango terapéutico. Valor crítico ≥15.0')] },
  'Digoxina': { src: ['MSD-TDM'], analytes: [n('Digoxina', 'ng/mL', 0.8, 2.0, 'Rango terapéutico. Valor crítico ≥2.1')], note: '⚠️ La tabla de MSD escribe «mg/dL», lo que parece un error de unidad; el rango terapéutico de digoxina se expresa en ng/mL.' },
  'Fenitoína': { src: ['MSD-TDM'], analytes: [n('Fenitoína', 'µg/mL', 10.0, 20.0, 'Rango terapéutico. Valor crítico ≥25.0')] },
  'Fenobarbital': { src: ['MSD-TDM'], analytes: [n('Fenobarbital', 'µg/mL', 10.0, 30.0, 'Rango terapéutico. Valor crítico ≥50.0')] },

  // 7. Inmunología
  'Ácido fólico': { src: [A], analytes: [n('Ácido fólico (sérico)', 'ng/mL', 1.8, 9.0)] },
  'Anti CCP (péptido citrulinado)': { src: [A], analytes: [lt('Anti-CCP', 'unidades', 20)] },
  'Células LE': q('Negativo (prueba en desuso).'),
  'Complemento sérico C3': { src: [A], analytes: [n('C3', 'mg/dL', 100, 233)] },
  'Complemento sérico C4': { src: [A], analytes: [n('C4', 'mg/dL', 14, 48)] },
  'Factor reumatoideo': { src: [A], analytes: [lt('Factor reumatoideo (nefelometría)', 'UI/mL', 24)] },
  'Ferritina': { src: [A], analytes: [sx('Ferritina', 'ng/mL', [24, 307], [24, 336])] },
  'Inmunoglobulina A': { src: [A], analytes: [n('IgA', 'mg/dL', 90, 325)] },
  'Inmunoglobulina G': { src: [A], analytes: [n('IgG', 'mg/dL', 800, 1500)] },
  'Inmunoglobulina M': { src: [A], analytes: [n('IgM', 'mg/dL', 45, 150)] },
  'Inmunoglobulina E': { src: [A], analytes: [lt('IgE total', 'UI/mL', 380)] },
  'Interleucina 6 (IL-6)': { src: ['Mayo-IL6'], analytes: [lt('Interleucina 6', 'pg/mL', 6.4)] },
  'NT Pro BNP': { src: [A], analytes: [txt('NT-proBNP', 'pg/mL', 'TFG >60: IC improbable ≤300 a cualquier edad · IC probable ≥450 (18–49 a), ≥900 (50–75 a), ≥1800 (>75 a). TFG <60: IC probable ≥1200')] },
  'Panel de alergia a alimentos': { src: ['ARUP-IgE'], analytes: [le('IgE específica', 'kU/L', 0.34, '<0.10 sin nivel significativo · 0.10–0.34 relevancia indeterminada · ≥0.35 positivo (clase 1 o mayor)')] },
  'Panel de alergia a inhalantes': { src: ['ARUP-IgE'], analytes: [le('IgE específica', 'kU/L', 0.34, '<0.10 sin nivel significativo · 0.10–0.34 relevancia indeterminada · ≥0.35 positivo (clase 1 o mayor)')] },
  'Procalcitonina': { src: [A], analytes: [le('Procalcitonina', 'ng/mL', 0.10)] },
  'Quantiferon TB-Gold': q('Negativo (TB1-Nil y TB2-Nil ≤0.34 UI/mL).', ['CDC-IGRA', 'ARUP-QFT']),
  'Troponina T ultrasensible': { src: [A], analytes: [sx('Troponina T ultrasensible', 'ng/L', [undefined, 10], [undefined, 15])] },
  'Vitamina B12': { src: [A], analytes: [n('Vitamina B12', 'pg/mL', 200, 800)] },
  'Vitamina D': { src: [A], analytes: [n('Vitamina D (25-OH)', 'ng/mL', 30, 60)] },
  // Autoinmunes. Los puntos de corte dependen del método y del kit: un «<20» en una técnica no equivale a «<20» en otra.
  'Anti Centrómero B': { src: ['Mayo-Centrómero'], analytes: [lt('Anti-centrómero B', 'U', 1.0)] },
  'Anti Gliadina IgA': { src: ['Mayo-Gliadina'], analytes: [lt('Anti-gliadina IgA (deamidada)', 'U', 20)] },
  'Anti Gliadina IgG': { src: ['Mayo-Gliadina'], analytes: [lt('Anti-gliadina IgG (deamidada)', 'U', 20)] },
  'Anti Jo-1': { src: ['ARUP-CTD'], analytes: [le('Anti-Jo-1', 'AU/mL', 29)] },
  'Anti La / SSB': { src: [A], analytes: [txt('Anti-La / SSB', '', '<20 CU (quimioluminiscencia) o <1.0 AI (multiplex)')] },
  'Anti músculo liso': { src: [A], analytes: [txt('Anti-músculo liso', 'título', '≤1:80')] },
  'Anti RNP / Sm': { src: [A, 'ARUP-CTD'], analytes: [txt('Anti-RNP', '', '<20 CU (quimioluminiscencia) o <1.0 AI (multiplex) [ABIM-2026]'), le('Anti-Sm', 'AU/mL', 29, '[ARUP-CTD]')] },
  'Anti RO / SSA': { src: [A], analytes: [txt('Anti-Ro / SSA', '', '<20 CU (quimioluminiscencia) o <1.0 AI (multiplex)')] },
  'Anti Scl-70': { src: [A], analytes: [lt('Anti-Scl-70', 'U', 1.0)] },
  'Anticuerpos anti DNA / ELISA': { src: [A], analytes: [n('Anti-DNA de doble cadena (ELISA)', 'UI/mL', 0, 7)] },
  'Anticuerpos anti DNA / IFI': q('Negativo (IFI, Crithidia).'),
  'Anticuerpos ANCA P ELISA': { src: [A], analytes: [lt('ANCA-P (anti-MPO, ELISA)', 'U', 1.0)] },
  'Anticuerpos ANCA C ELISA': { src: ['ARUP-ANCA'], analytes: [le('ANCA-C (anti-PR3, ELISA)', 'AU/mL', 19)] },
  'Anticuerpos anti neutrófilos totales (ANCA) - IFI': { src: ['ARUP-ANCA'], analytes: [txt('ANCA totales (IFI)', 'título', '<1:20 (no se detecta patrón)')] },
  'Anticuerpos anti neutrófilos totales (ANCA) - ELISA': { src: [A, 'ARUP-ANCA'], analytes: [lt('ANCA-P (anti-MPO, ELISA)', 'U', 1.0, '[ABIM-2026]'), le('ANCA-C (anti-PR3, ELISA)', 'AU/mL', 19, '[ARUP-ANCA]')] },
  'Anticuerpos antinucleares (ANA) - IFI': { src: [A], analytes: [txt('ANA (IFI)', 'título', '≤1:40')] },
  'Anticuerpos antinucleares (ANA) - ELISA': { src: ['RespirRes-2017'], analytes: [le('ANA (ELISA)', 'U', 1.0)] },
  'ANA 18 max.': q('Negativo para cada antígeno (inmunoblot).'),
  'Panel de miositis': q('Negativo para cada antígeno (inmunoblot).'),
  'Anticuerpos ANA 9 Line': q('Negativo para cada antígeno (inmunoblot).'),
  'Anticuerpos ENA': q('Negativo para cada antígeno (inmunoblot).'),
  'Anticuerpos antimitocondriales (AMA)': { src: [A], analytes: [txt('Anti-mitocondriales (AMA)', 'título', '≤1:5')] },
  'Anticuerpos anti membrana basal glomerular IgG': q('Negativo; el punto de corte depende del kit.'),
  'Anticuerpos anticardiolipinas IgG': { src: [A], analytes: [lt('Anticardiolipinas IgG', 'GPL', 20)] },
  'Anticuerpos anticardiolipinas IgM': { src: [A], analytes: [lt('Anticardiolipinas IgM', 'MPL', 20)] },
  'Anticuerpos antifosfolípidos IgG': { src: [A], text: 'Ver anticardiolipinas y anti-β2 glicoproteína I.', analytes: [lt('Anticardiolipinas IgG', 'GPL', 20), lt('Anti-β2 glicoproteína I IgG', 'SGU', 21)] },
  'Anticuerpos antifosfolípidos IgM': { src: [A], text: 'Ver anticardiolipinas y anti-β2 glicoproteína I.', analytes: [lt('Anticardiolipinas IgM', 'MPL', 20), lt('Anti-β2 glicoproteína I IgM', 'SMU', 21)] },
  'Anti Beta 2 glicoproteína I IgG': { src: [A], analytes: [lt('Anti-β2 glicoproteína I IgG', 'SGU', 21)] },
  'Anti Beta 2 glicoproteína I IgM': { src: [A], analytes: [lt('Anti-β2 glicoproteína I IgM', 'SMU', 21)] },
  'Anticuerpos antitransglutaminasa IgA': { src: [A], analytes: [txt('Antitransglutaminasa IgA', '', '<20 AU (quimioluminiscencia) · <4.0 U/mL (ELISA)')] },
  'Anticuerpos antitransglutaminasa IgG': { src: [A], analytes: [txt('Antitransglutaminasa IgG', '', '<20 AU (quimioluminiscencia) · <6.0 U/mL (ELISA)')] },

  // 8. Enfermedades infecciosas
  'Anticuerpos VIH 1 y 2, P24': q('No reactivo = sin evidencia de VIH (salvo infección aguda reciente). 4.ª generación.', ['CDC-VIH']),
  'Antígeno de superficie de hepatitis B': q('Negativo (no reactivo).', ['CDC-VHB']),
  'Anticuerpos contra el antígeno de superficie (HBs Ac.)': { src: ['CDC-VHB'], analytes: [ge('Anti-HBs', 'mUI/mL', 10, '≥10 = inmune (tras vacunación); <10 = no protegido')] },
  'Anticuerpos hepatitis "B" Core totales': q('Negativo (positivo = infección actual o pasada).', ['CDC-VHB']),
  'Anticuerpos hepatitis "B" Core IgM': q('Negativo (positivo = infección aguda).', ['CDC-VHB']),
  'Anticuerpos hepatitis "C"': q('No reactivo = no se detectan anticuerpos.', ['CDC-VHC']),
  'Anticuerpos hepatitis "A" IgG': q('No reactivo = sin inmunidad; reactivo = inmunidad por infección o vacuna.', ['SD-Hepatitis']),
  'Anticuerpos hepatitis "A" IgM': q('No reactivo (reactivo = infección aguda o inmunización reciente).', ['SD-Hepatitis']),
  'R.P.R.': q('No reactivo = sin evidencia de sífilis (puede ser negativo en sífilis primaria temprana).', ['CDC-Sífilis']),
  'VDRL': q('No reactivo (igual que RPR; los títulos no son intercambiables entre sí).', ['CDC-Sífilis']),
  'Anticuerpos Treponema (sífilis TP)': q('No reactivo; si es reactivo, suele persistir de por vida.', ['CDC-Sífilis']),
  'Serología para dengue (NS1, IgM, IgG)': q('Anticuerpos (IgM) y antígeno NS1 negativos; un NS1 negativo no descarta infección.', ['CDC-Dengue']),
  'Anticuerpos Zika IgG': q('Negativo; reacción cruzada con otros flavivirus.', ['CDC-Zika']),
  'Anticuerpos Zika IgM': q('Negativo; reacción cruzada con otros flavivirus.', ['CDC-Zika']),
  'Anticuerpos estreptolisina "O" (ASO)': { src: [A], analytes: [lt('ASO', 'unidades Todd', 200)] },
  'Anticuerpos rubéola IgG': { src: ['UIowa-Rubéola'], analytes: [txt('Rubéola IgG', 'UI/mL', '≤7 negativo (no inmune) · 8–9 equívoco · ≥10 positivo (inmune)')] },
  'Anticuerpos rubéola IgM': q('Negativo (positivo sugiere infección reciente; requiere confirmación).'),
  'Anticuerpos toxoplasmosis IgG': q('Título <1:16 = probablemente sin infección previa.', ['MLP-Toxo']),
  'Anticuerpos toxoplasmosis IgM': q('Título <1:16 = probablemente sin infección previa.', ['MLP-Toxo']),
  'Citomegalovirus IgG, IgM': q('Sin anticuerpos detectables en quien nunca se infectó; IgG positiva = infección actual o pasada.', ['MLP-CMV']),
  'Epstein Barr virus IgG (cápside)': q('VCA IgG, VCA IgM y EBNA negativos = sin exposición previa; más del 90% de los adultos tienen VCA IgG y EBNA positivos.', ['Mayo-EBV', 'UIowa-EBV']),
  'Epstein Barr virus IgM (cápside)': q('VCA IgG, VCA IgM y EBNA negativos = sin exposición previa; más del 90% de los adultos tienen VCA IgG y EBNA positivos.', ['Mayo-EBV', 'UIowa-EBV']),
  'Epstein Barr virus nuclear (EBNA)': q('VCA IgG, VCA IgM y EBNA negativos = sin exposición previa; más del 90% de los adultos tienen VCA IgG y EBNA positivos.', ['Mayo-EBV', 'UIowa-EBV']),
  'Anticuerpos mononucleosis (Monotest)': q('Negativo (sin anticuerpos heterófilos).', ['MLP-Mono']),
  'Anticuerpos Helicobacter pylori totales IgG, IgM, IgA': q('Negativo; si es positivo no distingue infección actual de pasada.', ['MLP-HP']),
  'Linfocitos CD4': { src: [A], analytes: [n('Linfocitos CD4', 'células/µL', 530, 1570)] },
  'Prueba de tuberculina': q('Positiva si la induración es ≥5 mm (VIH, contactos), ≥10 mm (grupos de riesgo) o ≥15 mm (sin factores de riesgo).', ['CDC-TST'], 'En personas de bajo riesgo evaluadas al ingresar a un empleo, se considera positiva una induración ≥15 mm.'),
  'Antígenos febriles': q('Widal. Título significativo: ≥1:160 para O y H de S. Typhi · ≥1:80 para AH y BH (paratíficos).', ['Shetty-Widal-2017'], 'El título significativo proviene de un estudio de 2017 en población de la India; depende de la endemicidad local.'),
  'Adenovirus respiratorio': q(NOT_DETECTED),
  'Anticuerpos Chlamydia trachomatis IgG': q('Negativo.'),
  'Anticuerpos Chlamydia trachomatis IgM': q('Negativo.'),
  'Anticuerpos cisticercosis IgG, IgM': q('Negativo.'),
  'Ag. Cryptococcus neoformans': q('Negativo.'),
  'Ag. Strepto A': q('Negativo.'),
  'Anticuerpos chikungunya IgG': q('Negativo.'),
  'Anticuerpos chikungunya IgM': q('Negativo.'),
  'Antígeno influenza A y B': q('Negativo.'),
  'Virus sincitial respiratorio': q(NOT_DETECTED),

  // 9. Marcadores tumorales
  'PSA total': { src: [A], analytes: [txt('PSA total', 'ng/mL', 'Sin nivel normal o anormal específico; se interpreta junto con la edad, el tacto rectal y el % de PSA libre.')] },
  'PSA libre': { src: ['Catalona-1998'], analytes: [txt('PSA libre (% del total)', '%', 'Con PSA total 4–10: ≤25% = biopsia recomendada; más bajo = mayor riesgo.')] },
  'Relación PSA / PSA libre': { src: ['Catalona-1998'], analytes: [txt('PSA libre (% del total)', '%', 'Con PSA total 4–10: ≤25% = biopsia recomendada; más bajo = mayor riesgo.')] },
  'AFP': { src: [A], analytes: [lt('AFP', 'ng/mL', 10)] },
  'CEA': { src: [A], analytes: [lt('CEA', 'ng/mL', 2.5)] },
  'Ca 19-9 (páncreas, vesícula)': { src: [A], analytes: [n('CA 19-9', 'U/mL', 0, 37)] },
  'Ca 15-3 (mama)': { src: [X], analytes: [txt('CA 15-3', 'U/mL', 'Sin intervalo verificado (ABIM sólo incluye CA 27-29 <38 U/mL).')] },
  'Ca 125 (ovario)': { src: [A], analytes: [lt('CA 125', 'U/mL', 35)] },
  'HE4 (proteína epididimal humana 4, ovario)': { src: ['Bumrungrad-ROMA'], analytes: [txt('HE4', 'pmol/L', 'Premenopausia 0–70 · Posmenopausia 0–140')], note: 'Los puntos de corte corresponden al método Abbott (CMIA).' },
  'Algoritmo ROMA (ovario)': { src: ['Bumrungrad-ROMA'], analytes: [txt('ROMA', '%', 'Alto riesgo: premenopausia ≥7.4% · posmenopausia ≥25.3%')], note: 'Los puntos de corte corresponden al método Abbott (CMIA).' },

  // 10. COVID-19
  'Anticuerpo COVID-19 (prueba rápida)': q('Negativo; puede ser positivo tras vacunación o infección previa.'),
  'Antígeno SARS-CoV-2': q('Negativo.'),
  'Panel respiratorio + COVID-19': q(NOT_DETECTED),
  'PCR SARS-CoV-2': q(NOT_DETECTED),
  'XPERT SARS CoV2/FLU/RSV (PCR)': q(NOT_DETECTED),
  'Ag. Covid 19 + influenza A y B': q('Negativo.'),
  'LIAT SARS Cov2/FLU (PCR)': q(NOT_DETECTED),

  // 11. Microbiología / Bacteriología
  'Líquido cefalorraquídeo (LCR)': { src: [A], text: 'Gram y cultivo: sin microorganismos / sin crecimiento (‡).', analytes: [
    n('Leucocitos (LCR)', 'células/µL', 0, 5), n('Eritrocitos (LCR)', '/µL', 0, 0), n('Glucosa (LCR)', 'mg/dL', 50, 75), n('Proteínas totales (LCR)', 'mg/dL', 15, 45),
    n('Cloruro (LCR)', 'mEq/L', 120, 130), n('Presión de apertura', 'mm H₂O', 70, 180)] },
  'Líquido pleural': q('Criterios de Light (exudado si cumple ≥1): proteína pleural/sérica >0.5 · LDH pleural/sérica >0.6 · LDH pleural >2/3 del límite superior normal de la LDH sérica. ADA >40 U/L en exudado linfocítico sugiere tuberculosis.', ['Light-AAFP']),
  'Líquido peritoneal (ascítico)': q('Neutrófilos (PMN) ≥250 células/mm³ = peritonitis bacteriana espontánea · Gradiente albúmina suero-ascitis (GASA) ≥1.1 g/dL = hipertensión portal.', ['AASLD-Ascitis']),
  'Líquido articular (sinovial)': { src: ['Strasinger-Sinovial'], text: 'Aspecto incoloro a amarillo pálido, claro · No coagula · Volumen 0.1–3.5 mL.', analytes: [lt('Leucocitos (líquido sinovial)', 'células/µL', 200)] },
  'Otros líquidos (especificar; incluye solo citoquímica)': q('Citoquímica sin intervalos de referencia estandarizados; se interpreta según el tipo de líquido.'),
  'KOH': q('No se observan hongos.'),
  'Giemsa': q('No se observan parásitos.'),
  'Tinta china': q('No se observan levaduras encapsuladas.'),
  'Coloración de Gram': q('Sin microorganismos (o flora habitual según el espécimen).'),
  'Coloración de Wright': q('Celularidad normal para el espécimen.'),
  'Coloración de Ziehl-Neelsen': q('No se observan bacilos ácido-alcohol resistentes.'),
  'Examen en fresco con solución salina': q('Sin parásitos ni levaduras.'),
  'Citología de moco nasal': q('Sin predominio de eosinófilos.'),
  'Urocultivo': q('Bacteriuria significativa ≥10⁵ UFC/mL.', ['IDSA-ASB-2019']),
  'Cultivo bacteriológico': q('Sin crecimiento de patógenos (o flora habitual según el sitio).'),
  'Coprocultivo': q('Sin crecimiento de patógenos (o flora habitual según el sitio).'),
  'Espermocultivo (líquido seminal)': q('Sin crecimiento de patógenos (o flora habitual según el sitio).'),
  'Exudado faríngeo': q('Sin crecimiento de patógenos (o flora habitual según el sitio).'),
  'Cultivo de expectoración': q('Sin crecimiento de patógenos (o flora habitual según el sitio).'),
  'Cultivo por hongos': q('Sin crecimiento de patógenos (o flora habitual según el sitio).'),
  'Cultivo Neisseria gonorrhoeae': q('Sin crecimiento de patógenos (o flora habitual según el sitio).'),
  'Cultivo por micobacterias': q('Sin crecimiento de patógenos (o flora habitual según el sitio).'),
  'Cribado Streptococcus agalactiae (betahemolítico)': q('Negativo.'),
  'Leishmaniasis': q('Negativo (no se observan amastigotes).'),
  'Espermograma': { src: ['OMS-Semen-2021'], text: 'Límites inferiores de referencia (OMS 2021).', analytes: [
    ge('Volumen', 'mL', 1.4), ge('Concentración', 'millones/mL', 16), ge('Número total', 'millones/eyaculado', 39), ge('Motilidad progresiva', '%', 30),
    ge('Morfología normal', '%', 4), ge('Vitalidad', '%', 54), ge('pH seminal', '', 7.2)] },

  // 12. Orina
  'Examen general de orina (EGO)': { src: [A, 'MLP-EGO', 'MLP-Eritrocitos-orina', 'MLP-Cilindros', 'MLP-Epiteliales'],
    text: 'Color casi incoloro a amarillo oscuro. Glucosa, cetonas, proteínas y bilirrubina no detectables; nitritos y hemoglobina ausentes; urobilinógeno en cantidades pequeñas (‡). Eritrocitos ≤4 por campo de alto poder; leucocitos no se encuentran normalmente; algunos cilindros hialinos son normales (otros tipos son anormales); pocas células epiteliales escamosas (abundantes sugieren contaminación).',
    analytes: [n('Densidad', '', 1.002, 1.030), n('pH urinario', '', 4.5, 8.0)] },
  'Porfobilinógeno / urobilinógeno': q('Porfobilinógeno: muestra aleatoria negativo · 24 h <4 mg/24 h [MLP-PBG]. Urobilinógeno: cantidades pequeñas; intervalo no verificado (‡).', ['MLP-PBG', X]),
  'Prueba de embarazo en orina': q('Negativa en mujer no embarazada.'),

  // 13. Heces
  'Calprotectina fecal': { src: ['Mayo-Calprotectina'], analytes: [lt('Calprotectina fecal', 'µg/g', 50, '<50 normal · 50–120 limítrofe · >120 anormal')] },
  'Examen general de heces': q('Formadas, marrones; leucocitos negativos; sangre oculta negativa; sin parásitos, huevos ni larvas.', ['Davis-Heces']),
  'Sangre oculta en heces': q('Negativa.', ['Davis-Heces']),
  'Wright en heces': q('Negativo (leucocitos fecales).', ['Davis-Heces']),
  'Citología de moco fecal': q('Sin leucocitos.', ['Davis-Heces']),
  'Helicobacter pylori (cualitativo)': q('Negativo (antígeno).', ['MLP-HP']),
  'Helicobacter pylori (cuantitativo)': q('Negativo; el punto de corte depende del kit.'),
  'Cripto-Giardia': q('Negativo.'),
  'Rotavirus en heces': q('Negativo.', ['Davis-Heces']),
  'Clostridium difficile toxina A+B': q('No detectada.', ['Davis-Heces']),
  'Coloración de Cryptosporidium (Apicomplexa)': q('No se observan ooquistes.'),
  'Adenovirus en heces': q('Negativo.'),
  'Sudán III': q('Sin aumento de glóbulos de grasa neutra (grasa fecal cuantitativa: 2–7 g/día).', ['Strasinger-Heces']),
  'Sudán IV': q('Sin aumento de glóbulos de grasa neutra (grasa fecal cuantitativa: 2–7 g/día).', ['Strasinger-Heces']),

  // 14. Biología molecular (el documento no da fuente: no aplica intervalo)
  'Prueba de paternidad (consultar previamente al laboratorio)': q('No aplica intervalo de referencia (informa probabilidad de paternidad).', []),
  'BRCA 1 y 2 (consultar previamente al laboratorio)': q('No aplica intervalo de referencia (informa variantes detectadas y su clasificación).', []),

  // 15. PCR / cargas virales / paneles moleculares
  'PCR HIV': q(NOT_DETECTED),
  'Carga viral VIH': q(NOT_DETECTED),
  'Carga viral hepatitis B': q(NOT_DETECTED),
  'Carga viral hepatitis C': q(NOT_DETECTED),
  'Carga viral citomegalovirus': q(NOT_DETECTED),
  'PCR para citomegalovirus': q(NOT_DETECTED),
  'PCR para Epstein Barr': q(NOT_DETECTED),
  'PCR para herpes I y II': q(NOT_DETECTED),
  'PCR para Toxoplasma': q(NOT_DETECTED),
  'Panel de meningitis / encefalitis': q(NOT_DETECTED),
  'PCR para varicela zóster': q(NOT_DETECTED),
  'Panel dengue-zika-chikungunya': q('No detectado; una RT-PCR negativa no descarta infección.', ['CDC-Dengue', 'CDC-Zika']),
  'PCR para complejo Mycobacterium tuberculosis': q(NOT_DETECTED),
  'PCR para Mycobacterium tuberculosis resistente a RIF': q(NOT_DETECTED),
  'PCR virus papiloma humano (VPH) 14 genotipos': q(NOT_DETECTED),
  'PCR virus papiloma humano (VPH) 24 genotipos': q(NOT_DETECTED),
  'PCR para Chlamydia trachomatis / Neisseria gonorrhoeae': q(NOT_DETECTED),
  'Panel de neumonía': q(NOT_DETECTED),
  'Panel ITS (enfermedades de transmisión sexual)': q(NOT_DETECTED),
  'Xpert Carba R': q('No se detectan genes de carbapenemasa.'),
}

void PATHOGEN

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const BY_KEY = new Map(Object.entries(LAB_REFERENCE).map(([k, v]) => [fold(k), v]))

/** Los valores de referencia de un examen por su nombre (sin importar mayúsculas ni tildes). */
export const referenceOf = (name: string) => BY_KEY.get(fold(name))

/** El rango de un analito para el sexo del paciente. Sin sexo, el más amplio de los dos (no marca de más). */
export function rangeFor(a: RefAnalyte, sex?: 'F' | 'M'): { low?: number; high?: number; highOpen?: boolean } {
  if (!a.f && !a.m) return { low: a.low, high: a.high, highOpen: a.highOpen }
  const pick = sex === 'F' ? a.f : sex === 'M' ? a.m : undefined
  if (pick) return { low: pick[0], high: pick[1], highOpen: a.highOpen }
  const lows = [a.f?.[0], a.m?.[0]]
  const highs = [a.f?.[1], a.m?.[1]]
  // Si uno de los dos sexos no tiene límite de ese lado, no se pone límite
  return { low: lows.some((x) => x == null) ? undefined : Math.min(...(lows as number[])), high: highs.some((x) => x == null) ? undefined : Math.max(...(highs as number[])), highOpen: a.highOpen }
}

/** «70–99», «<200», «≤0.8», «≥10», «Mujeres 12–16 · Hombres 14–18». */
export function rangeText(a: { low?: number; high?: number; highOpen?: boolean; f?: Pair; m?: Pair }) {
  const one = (low?: number, high?: number) => low != null && high != null ? `${low}–${high}` : high != null ? `${a.highOpen ? '<' : '≤'}${high}` : low != null ? `≥${low}` : ''
  if (a.f || a.m) return [a.f && `Mujeres ${one(a.f[0], a.f[1])}`, a.m && `Hombres ${one(a.m[0], a.m[1])}`].filter(Boolean).join(' · ')
  return one(a.low, a.high)
}
