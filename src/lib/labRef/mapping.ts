/**
 * UM1 (ronda 8): emparejamiento de cada fila del .md con un examen y un analito del catálogo de Clinara (nombres finales de
 * la ronda 7) y la regla para leer su valor. AQUÍ NO HAY NÚMEROS: los saca build.ts del texto de la fila del .md. Los
 * nombres de analito reutilizan los que ya existían (Neutrófilos, Cloro, TGO (AST), HDL, VES…) para no duplicar sinónimos.
 * VALIDAR: Emil.
 *
 * Reglas (`how`):
 *  - range:   intervalo «a–b» o un solo límite («<0.5», «≤0.04», «≥10»); si dice «Mujeres … · Hombres …», por sexo.
 *  - sexcols: columnas Mujeres / Hombres.
 *  - rel/abs: columnas Relativo (%) / Absoluto (/µL) de la serie blanca.
 *  - min:     «Límite inferior» (espermograma): el valor es el mínimo.
 *  - cat:     categorías: el primer nivel «Normal / Deseable / Óptimo / Bajo» es el rango; todas las categorías van como nota.
 *  - low-sex: «Bajo: mujeres <50 · hombres <40» (HDL): el límite es el mínimo por sexo.
 *  - cut:     puntos de corte por toma (curvas gestacionales): cada toma es un analito «<x».
 *  - drug:    rango terapéutico (y el valor crítico va a UM2).
 *  - expected: resultado esperado (texto), sin comparar números.
 *  - note:    por edad, fase del ciclo o probabilidad: sólo texto, sin Alto/Bajo.
 *  - append:  se agrega como nota al analito de otra fila (categorías KDIGO G2–G5).
 *  - cutoff:  punto de corte del tamizaje («negativo si está por debajo»): el valor es el máximo, sin incluirlo («<x»).
 *  - skip:    no se carga (con su motivo).
 */
export type How = 'cutoff' | 'range' | 'sexcols' | 'rel' | 'abs' | 'min' | 'cat' | 'low-sex' | 'cut' | 'drug' | 'expected' | 'note' | 'append' | 'skip'

/** [examen, analito]; sin analito, el valor es del examen (resultado esperado). */
export type Target = [string, string?]

export interface Rule {
  /** «Subsección › Nombre» de la fila (subsección «-» si la tabla no tiene). */
  row: string
  how: How
  to?: Target[]
  /** Parte de «a · b» o «a / b» que toca (0, 1…). */
  part?: number
  /** Separador de las partes (por omisión « · »). */
  sep?: string
  /** Unidad cuando el .md la escribe dentro del valor («<200 unidades Todd»). */
  unit?: string
  /** Conversión de unidad segura a la unidad del analito en Clinara (/µL → ×10³/µL). */
  scale?: number
  toUnit?: string
  /** cut: etiqueta de cada toma → analito. */
  cuts?: [RegExp, string][]
  /** append: analito que recibe la nota. */
  into?: Target
  why?: string
}

const H = 'Hemograma'
const QS = 'Química sanguínea'
const PR = 'Perfil renal'
const PH = 'Perfil hepático'
const PL = 'Perfil lipídico'
const EL = 'Electrolitos'
const TC = 'Tiempos de coagulación (TP, TPT, INR)'
const PATH = 'Negativo / no reactivo / no detectado'
const GA = 'Gases arteriales'
const EGO = 'Examen general de orina (EGO)'
/** Ronda 12 (LB2): exámenes de orina de 24 horas; el volumen de la muestra va como analito de cada uno. */
const URINE_24H = ['17 Cetosteroides en orina de 24 horas', '17 Hidroxiesteroides en orina de 24 horas', 'Ácido úrico / 24 horas', 'Ácido vanilmandélico en orina de 24 horas',
  'Calcio / 24 horas', 'Creatinina / 24 horas', 'Depuración de creatinina / 24 horas', 'Fósforo / 24 horas', 'Magnesio / 24 horas', 'Proteínas totales / 24 horas',
  'Cortisol libre en orina / 24 horas', 'Microalbuminuria en 24 horas']

export const RULES: Rule[] = [
  // 1. Hematología
  { row: 'Serie roja › Eritrocitos', how: 'sexcols', to: [[H, 'Eritrocitos']] },
  { row: 'Serie roja › Hemoglobina', how: 'sexcols', to: [[H, 'Hemoglobina']] },
  { row: 'Serie roja › Hematocrito', how: 'sexcols', to: [[H, 'Hematocrito']] },
  { row: 'Índices eritrocitarios › VCM', how: 'range', to: [[H, 'VCM']] },
  { row: 'Índices eritrocitarios › HCM', how: 'range', to: [[H, 'HCM']] },
  { row: 'Índices eritrocitarios › CHCM', how: 'range', to: [[H, 'CHCM']] },
  { row: 'Índices eritrocitarios › ADE / RDW', how: 'range', to: [[H, 'ADE / RDW']] },
  { row: 'Serie blanca › Leucocitos totales', how: 'abs', to: [[H, 'Leucocitos']], scale: 0.001, toUnit: '×10³/µL' },
  { row: 'Serie blanca › Neutrófilos segmentados', how: 'rel', to: [[H, 'Neutrófilos']] },
  { row: 'Serie blanca › Bandas', how: 'rel', to: [[H, 'Bandas']] },
  { row: 'Serie blanca › Linfocitos', how: 'rel', to: [[H, 'Linfocitos']] },
  { row: 'Serie blanca › Monocitos', how: 'rel', to: [[H, 'Monocitos']] },
  { row: 'Serie blanca › Eosinófilos', how: 'rel', to: [[H, 'Eosinófilos']] },
  { row: 'Serie blanca › Basófilos', how: 'rel', to: [[H, 'Basófilos']] },
  { row: 'Plaquetas › Plaquetas', how: 'range', to: [[H, 'Plaquetas']], scale: 0.001, toUnit: '×10³/µL' },
  { row: 'Plaquetas › VPM', how: 'range', to: [[H, 'VPM']] },
  { row: 'Otras pruebas de hematología › Células falciformes (drepanocitos)', how: 'expected', to: [['Células falciformes (drepanocitos)']] },
  { row: 'Otras pruebas de hematología › Coombs directo', how: 'expected', to: [['Coombs directo']] },
  { row: 'Otras pruebas de hematología › Coombs indirecto', how: 'expected', to: [['Coombs indirecto']] },
  { row: 'Otras pruebas de hematología › Crioaglutininas', how: 'expected', to: [['Crioaglutininas']] },
  { row: 'Otras pruebas de hematología › Eritrosedimentación (Westergren)', how: 'range', to: [['Velocidad de eritrosedimentación', 'VES']] },
  { row: 'Otras pruebas de hematología › Frotis de sangre periférica', how: 'expected', to: [['Frotis de sangre periférica']] },
  { row: 'Otras pruebas de hematología › Grupo sanguíneo y Rh', how: 'expected', to: [['Tipo y Rh']] },
  { row: 'Otras pruebas de hematología › Hematozoario (Plasmodium spp.)', how: 'expected', to: [['Hematozoario (Plasmodium spp.)'], ['Gota gruesa']] },
  { row: 'Otras pruebas de hematología › Reticulocitos', how: 'range', to: [['Reticulocitos', 'Reticulocitos']] },
  { row: 'Otras pruebas de hematología › Reticulocitos (absoluto)', how: 'range', to: [['Reticulocitos', 'Reticulocitos (absoluto)']] },
  { row: 'Otras pruebas de hematología › Eosinófilos (recuento absoluto)', how: 'range', to: [['Eosinófilos', 'Eosinófilos (recuento absoluto)']] },
  { row: 'Electroforesis de hemoglobina (adulto) › Hb A', how: 'range', to: [['Electroforesis de hemoglobina', 'Hb A']] },
  { row: 'Electroforesis de hemoglobina (adulto) › Hb A2', how: 'range', to: [['Electroforesis de hemoglobina', 'Hb A2']] },
  { row: 'Electroforesis de hemoglobina (adulto) › Hb F', how: 'range', to: [['Electroforesis de hemoglobina', 'Hb F']] },
  { row: 'Electroforesis de hemoglobina (adulto) › Hb S y otras variantes', how: 'expected', to: [['Electroforesis de hemoglobina', 'Hb S y otras variantes']] },

  // 2. Coagulación
  { row: '- › Anticoagulante lúpico (dRVVT, tiempo de veneno de víbora de Russell diluido)', how: 'range', to: [['Anticoagulante lúpico', 'dRVVT']] },
  { row: '- › Dímero-D', how: 'range', to: [['Dímero-D', 'Dímero-D']] },
  { row: '- › Fibrinógeno', how: 'range', to: [['Fibrinógeno', 'Fibrinógeno']] },
  { row: '- › Proteína C (actividad)', how: 'range', to: [['Proteína C', 'Proteína C (actividad)']] },
  { row: '- › Proteína C (antígeno)', how: 'range', to: [['Proteína C', 'Proteína C (antígeno)']] },
  { row: '- › Proteína S (actividad)', how: 'range', to: [['Proteína S', 'Proteína S (actividad)']] },
  { row: '- › Proteína S antígeno total / libre', how: 'range', part: 0, sep: ' / ', to: [['Proteína S', 'Proteína S antígeno total']] },
  { row: '- › Proteína S antígeno total / libre#libre', how: 'range', part: 1, sep: ' / ', to: [['Proteína S', 'Proteína S libre']] },
  { row: '- › Antitrombina III (actividad)', how: 'range', to: [['Antitrombina III', 'Antitrombina III (actividad)']] },
  { row: '- › Retracción del coágulo', how: 'expected', to: [['Retracción del coágulo']] },
  { row: '- › Tiempo de coagulación (Lee-White)', how: 'range', to: [['Tiempo de coagulación', 'Tiempo de coagulación (Lee-White)']] },
  { row: '- › Tiempo de protrombina (TP)', how: 'range', to: [['Tiempo de protrombina (TP)', 'TP'], [TC, 'TP']] },
  { row: '- › INR (sin anticoagulante)', how: 'range', to: [['Tiempo de protrombina (TP)', 'INR'], [TC, 'INR']] },
  { row: '- › INR (meta con warfarina)', how: 'append', into: ['Tiempo de protrombina (TP)', 'INR'], to: [[TC, 'INR']] },
  { row: '- › Tiempo de sangrado (plantilla)', how: 'range', to: [['Tiempo de sangrado', 'Tiempo de sangrado (plantilla)']] },
  { row: '- › TPT activado (TTPa)', how: 'range', to: [['Tiempo de tromboplastina parcial (TPT)', 'TPT'], [TC, 'TPT']] },

  // 3. Química en sangre
  { row: 'Metabolismo de la glucosa › Glucosa en ayunas', how: 'cat', to: [['Glucosa en ayunas', 'Glucosa'], [QS, 'Glucosa']] },
  { row: 'Metabolismo de la glucosa › Glucosa posprandial', how: 'note', to: [['Glucosa posprandial', 'Glucosa']] },
  { row: 'Metabolismo de la glucosa › Tolerancia oral a la glucosa 2 h (75 g) / Curva de tolerancia 2 h', how: 'cat',
    to: [['Tolerancia oral a la glucosa 2 horas', 'Glucosa 2 h'], ['Curva de tolerancia de glucosa 2 horas', 'Glucosa 2 h']] },
  { row: 'Metabolismo de la glucosa › Curvas de tolerancia 3, 4 y 5 h (no gestacionales)', how: 'note',
    to: [['Curva de tolerancia de glucosa 3 horas'], ['Curva de tolerancia de glucosa 4 horas'], ['Curva de tolerancia de glucosa 5 horas']] },
  { row: 'Metabolismo de la glucosa › HbA1c', how: 'cat', to: [['Hemoglobina glicosilada (HbA1c)', 'HbA1c']] },
  { row: 'Diabetes gestacional › Sullivan 50 g (1 h, sin ayuno)', how: 'note', to: [['Sullivan 50 g (2 muestras)']] },
  { row: 'Diabetes gestacional › Curva 2 h, 75 g (un paso, IADPSG)', how: 'cut', to: [['Curva de tolerancia 2 h glucosa gestacional 75 g']],
    cuts: [[/^Ayuno/, 'Glucosa en ayunas'], [/^1 h/, 'Glucosa 1 h'], [/^2 h/, 'Glucosa 2 h']] },
  { row: 'Diabetes gestacional › Curva 3 h, 100 g (Carpenter-Coustan)', how: 'cut', to: [['Curva de tolerancia 3 h glucosa gestacional 100 g']],
    cuts: [[/^Ayuno/, 'Glucosa en ayunas'], [/^1 h/, 'Glucosa 1 h'], [/^2 h/, 'Glucosa 2 h'], [/^3 h/, 'Glucosa 3 h']] },
  // Ronda 12 (LB2): gases arteriales del adulto (los nombres de analito son los que ya tenía la app)
  { row: 'Gases arteriales (adulto) › pH', how: 'range', to: [[GA, 'pH']] },
  { row: 'Gases arteriales (adulto) › pCO₂', how: 'range', to: [[GA, 'pCO2']] },
  { row: 'Gases arteriales (adulto) › pO₂', how: 'range', to: [[GA, 'pO2']] },
  { row: 'Gases arteriales (adulto) › Bicarbonato (HCO₃⁻)', how: 'range', to: [[GA, 'HCO3']] },
  { row: 'Gases arteriales (adulto) › Exceso de base', how: 'range', to: [[GA, 'Exceso de base']] },
  { row: 'Gases arteriales (adulto) › Saturación de O₂', how: 'range', to: [[GA, 'Saturación de O₂']] },
  { row: 'Función renal, electrolitos y minerales › Creatinina', how: 'range', to: [['Creatinina', 'Creatinina'], [QS, 'Creatinina'], [PR, 'Creatinina']] },
  { row: 'Función renal, electrolitos y minerales › Nitrógeno ureico (BUN)', how: 'range', to: [['Urea nitrogenada (BUN)', 'Nitrógeno ureico (BUN)'], [QS, 'Nitrógeno ureico (BUN)'], [PR, 'Nitrógeno ureico (BUN)']] },
  { row: 'Función renal, electrolitos y minerales › Ácido úrico', how: 'range', to: [['Ácido úrico', 'Ácido úrico'], [QS, 'Ácido úrico'], [PR, 'Ácido úrico']] },
  { row: 'Función renal, electrolitos y minerales › Sodio', how: 'range', to: [['Sodio (Na)', 'Sodio'], [EL, 'Sodio']] },
  { row: 'Función renal, electrolitos y minerales › Potasio', how: 'range', to: [['Potasio (K)', 'Potasio'], [EL, 'Potasio']] },
  { row: 'Función renal, electrolitos y minerales › Cloruro', how: 'range', to: [['Cloruro (Cl)', 'Cloro'], [EL, 'Cloro']] },
  { row: 'Función renal, electrolitos y minerales › CO₂ (sérico)', how: 'range', to: [['CO2', 'CO₂ (sérico)']] },
  { row: 'Función renal, electrolitos y minerales › Calcio', how: 'range', to: [['Calcio', 'Calcio']] },
  { row: 'Función renal, electrolitos y minerales › Fósforo', how: 'range', to: [['Fósforo', 'Fósforo']] },
  { row: 'Función renal, electrolitos y minerales › Magnesio', how: 'range', to: [['Magnesio (Mg)', 'Magnesio']] },
  { row: 'Función renal, electrolitos y minerales › Osmolaridad plasmática (osmolalidad sérica)', how: 'range', to: [['Osmolaridad plasmática', 'Osmolalidad sérica']] },
  { row: 'Perfil hepático y enzimas › TGO / AST', how: 'range', to: [['TGO (aspartato)', 'TGO (AST)'], [PH, 'TGO (AST)']] },
  { row: 'Perfil hepático y enzimas › TGP / ALT', how: 'range', to: [['TGP (alanino)', 'TGP (ALT)'], [PH, 'TGP (ALT)']] },
  { row: 'Perfil hepático y enzimas › Fosfatasa alcalina', how: 'range', to: [['Fosfatasa alcalina', 'Fosfatasa alcalina'], [PH, 'Fosfatasa alcalina']] },
  { row: 'Perfil hepático y enzimas › GGT', how: 'range', to: [['Gamma glutamil transpeptidasa (GGT)', 'GGT']] },
  { row: 'Perfil hepático y enzimas › Bilirrubina total', how: 'range', to: [['Bilirrubinas totales y fraccionadas', 'Bilirrubina total'], [PH, 'Bilirrubina total']] },
  { row: 'Perfil hepático y enzimas › Bilirrubina directa', how: 'range', to: [['Bilirrubinas totales y fraccionadas', 'Bilirrubina directa']] },
  { row: 'Perfil hepático y enzimas › Bilirrubina indirecta', how: 'range', to: [['Bilirrubinas totales y fraccionadas', 'Bilirrubina indirecta']] },
  { row: 'Perfil hepático y enzimas › Deshidrogenasa láctica (LDH)', how: 'range', to: [['Deshidrogenasa láctica (LDH)', 'LDH']] },
  { row: 'Perfil hepático y enzimas › Amilasa', how: 'range', to: [['Amilasa', 'Amilasa'], ['Amilasa y lipasa', 'Amilasa']] },
  { row: 'Perfil hepático y enzimas › Lipasa', how: 'range', to: [['Lipasa', 'Lipasa'], ['Amilasa y lipasa', 'Lipasa']] },
  { row: 'Perfil hepático y enzimas › Amonio sérico', how: 'range', to: [['Amonio sérico', 'Amonio']] },
  { row: 'Perfil hepático y enzimas › Aldolasa', how: 'range', to: [['Aldolasa', 'Aldolasa']] },
  { row: 'Perfil hepático y enzimas › Colinesterasa (seudocolinesterasa)', how: 'range', part: 0, to: [['Colinesterasa', 'Colinesterasa sérica']] },
  { row: 'Perfil hepático y enzimas › Colinesterasa (seudocolinesterasa)#eritrocitos', how: 'range', part: 1, to: [['Colinesterasa', 'Colinesterasa eritrocitaria']] },
  { row: 'Perfil hepático y enzimas › CPK total', how: 'range', to: [['CPK (creatin fosfoquinasa)', 'CPK total']] },
  { row: 'Perfil hepático y enzimas › CPK-MB', how: 'range', to: [['CPK-MB', 'CPK-MB']] },
  { row: 'Proteínas › Proteínas totales', how: 'range', to: [['Proteínas totales y fraccionadas', 'Proteínas totales']] },
  { row: 'Proteínas › Albúmina', how: 'range', to: [['Proteínas totales y fraccionadas', 'Albúmina'], ['Albúmina', 'Albúmina'], [PH, 'Albúmina']] },
  { row: 'Proteínas › Globulinas', how: 'range', to: [['Proteínas totales y fraccionadas', 'Globulinas']] },
  { row: 'Electroforesis de proteínas › Albúmina', how: 'range', to: [['Electroforesis de proteínas', 'Albúmina']] },
  { row: 'Electroforesis de proteínas › Alfa-1', how: 'range', to: [['Electroforesis de proteínas', 'Alfa-1']] },
  { row: 'Electroforesis de proteínas › Alfa-2', how: 'range', to: [['Electroforesis de proteínas', 'Alfa-2']] },
  { row: 'Electroforesis de proteínas › Beta', how: 'range', to: [['Electroforesis de proteínas', 'Beta']] },
  { row: 'Electroforesis de proteínas › Gamma', how: 'range', to: [['Electroforesis de proteínas', 'Gamma']] },
  { row: 'Perfil lipídico › Colesterol total', how: 'cat', to: [['Colesterol total', 'Colesterol total'], [PL, 'Colesterol total']] },
  { row: 'Perfil lipídico › Colesterol HDL', how: 'low-sex', to: [['Colesterol HDL', 'HDL'], [PL, 'HDL']] },
  { row: 'Perfil lipídico › Colesterol LDL', how: 'cat', to: [['Colesterol LDL', 'LDL'], [PL, 'LDL']] },
  { row: 'Perfil lipídico › Triglicéridos (ayuno)', how: 'cat', to: [['Triglicéridos', 'Triglicéridos'], [PL, 'Triglicéridos']] },
  { row: 'Hierro y metabolismo › Hierro sérico', how: 'range', to: [['Hierro sérico', 'Hierro sérico']] },
  { row: 'Hierro y metabolismo › Capacidad total de fijación de hierro (TIBC)', how: 'range', to: [['Capacidad de captación de hierro', 'TIBC']] },
  { row: 'Hierro y metabolismo › Saturación de transferrina', how: 'range', to: [['Capacidad de captación de hierro', 'Saturación de transferrina']] },
  { row: 'Hierro y metabolismo › Homocisteína', how: 'range', to: [['Homocisteína', 'Homocisteína']] },
  { row: 'Inflamación y marcadores cardíacos › Proteína C reactiva (PCR)', how: 'range', to: [['Proteína C reactiva', 'PCR']] },
  { row: 'Inflamación y marcadores cardíacos › PCR ultrasensible (riesgo CV)', how: 'cat', to: [['PCR ultrasensible (PCR-us)', 'PCR ultrasensible']] },
  { row: 'Inflamación y marcadores cardíacos › Troponina I (convencional)', how: 'range', to: [['Troponina I', 'Troponina I']] },
  { row: 'Inflamación y marcadores cardíacos › Troponina I alta sensibilidad', how: 'range', to: [['Troponina I', 'Troponina I alta sensibilidad']] },
  { row: 'Otras › Litio (rango terapéutico)', how: 'drug', to: [['Litio', 'Litio']] },
  { row: 'Otras › Investigación de hemoglobina S (HPLC)', how: 'expected', to: [['Investigación de hemoglobina S (HPLC)']] },

  // 4. Química en orina
  { row: '- › Volumen de orina (24 h)', how: 'range', unit: 'mL/24 h', to: URINE_24H.map((e): Target => [e, 'Volumen de orina (24 h)']) },
  { row: '- › 17-cetosteroides (24 h)', how: 'range', to: [['17 Cetosteroides en orina de 24 horas', '17-cetosteroides']] },
  { row: '- › 17-hidroxiesteroides (24 h)', how: 'range', to: [['17 Hidroxiesteroides en orina de 24 horas', '17-hidroxiesteroides']] },
  { row: '- › Ácido úrico (24 h)', how: 'range', to: [['Ácido úrico / 24 horas', 'Ácido úrico (24 h)']] },
  { row: '- › Ácido vanililmandélico (24 h)', how: 'range', to: [['Ácido vanilmandélico en orina de 24 horas', 'Ácido vanililmandélico (24 h)']] },
  { row: '- › Calcio (24 h)', how: 'range', to: [['Calcio / 24 horas', 'Calcio (24 h)']] },
  { row: '- › Creatinina (24 h)', how: 'range', to: [['Creatinina / 24 horas', 'Creatinina (24 h)']] },
  { row: '- › Depuración de creatinina (24 h)', how: 'range', to: [['Depuración de creatinina / 24 horas', 'Depuración de creatinina'], ['Aclaramiento de creatinina', 'Depuración de creatinina']] },
  { row: '- › Fósforo (24 h)', how: 'range', to: [['Fósforo / 24 horas', 'Fósforo (24 h)']] },
  { row: '- › Magnesio (24 h)', how: 'range', to: [['Magnesio / 24 horas', 'Magnesio (24 h)']] },
  { row: '- › Proteínas totales (24 h)', how: 'range', to: [['Proteínas totales / 24 horas', 'Proteínas totales (24 h)']] },
  { row: '- › Índice proteína/creatinina', how: 'range', to: [['Índice proteína-creatinina en orina', 'Índice proteína/creatinina']] },
  { row: '- › Cociente albúmina/creatinina', how: 'cat', to: [['Cociente albúmina-creatinina en orina', 'Cociente albúmina/creatinina']] },
  { row: '- › Microalbuminuria (24 h)', how: 'cat', to: [['Microalbuminuria en 24 horas', 'Microalbuminuria (24 h)']] },
  { row: '- › Cortisol libre urinario (24 h)', how: 'range', to: [['Cortisol libre en orina / 24 horas', 'Cortisol libre urinario (24 h)']] },
  { row: 'Tasa de filtración glomerular (categorías KDIGO) › G1', how: 'cat', to: [['Tasa de filtrado glomerular', 'TFG']] },
  ...['G2', 'G3a', 'G3b', 'G4', 'G5'].map((g): Rule => ({ row: `Tasa de filtración glomerular (categorías KDIGO) › ${g}`, how: 'append', into: ['Tasa de filtrado glomerular', 'TFG'] })),

  // 5. Hormonas
  { row: 'Hormonas reproductivas › 17-OH-progesterona', how: 'note', to: [['17 OH-Progesterona', '17-OH-progesterona']] },
  { row: 'Hormonas reproductivas › β-hCG sérica (no embarazo)', how: 'note', to: [['BHCG (gonadotropina coriónica humana, fracción beta)', 'β-hCG'], ['Prueba de embarazo en sangre (β-hCG)', 'β-hCG']] },
  { row: 'Hormonas reproductivas › Examen de embarazo en sangre', how: 'expected', to: [['Prueba de embarazo en sangre (β-hCG)']] },
  { row: 'Hormonas reproductivas › DHEA-S', how: 'range', to: [['DHEA-S', 'DHEA-S']] },
  { row: 'Hormonas reproductivas › Estradiol', how: 'note', to: [['Estradiol', 'Estradiol']] },
  { row: 'Hormonas reproductivas › FSH', how: 'note', to: [['FSH (hormona folículo estimulante)', 'FSH']] },
  { row: 'Hormonas reproductivas › LH', how: 'note', to: [['LH (hormona luteinizante)', 'LH']] },
  { row: 'Hormonas reproductivas › Progesterona', how: 'note', to: [['Progesterona', 'Progesterona']] },
  { row: 'Hormonas reproductivas › Prolactina', how: 'range', to: [['Prolactina (PRL)', 'Prolactina']] },
  { row: 'Hormonas reproductivas › SHBG', how: 'range', to: [['SHBG', 'SHBG']] },
  { row: 'Hormonas reproductivas › Testosterona total', how: 'range', to: [['Testosterona', 'Testosterona total']] },
  { row: 'Hormonas reproductivas › Testosterona libre', how: 'range', to: [['Testosterona', 'Testosterona libre']] },
  { row: 'Hormonas reproductivas › Índice de testosterona libre (FAI)', how: 'note', to: [['Índice de testosterona libre', 'Índice de testosterona libre (FAI)']] },
  { row: 'Hormonas reproductivas › Hormona antimülleriana (mujeres)', how: 'note', to: [['Hormona antimülleriana', 'Hormona antimülleriana (mujeres)']] },
  { row: 'Hormonas reproductivas › Hormona antimülleriana (hombres >12 años)', how: 'note', to: [['Hormona antimülleriana', 'Hormona antimülleriana (hombres)']] },
  { row: 'Hormonas reproductivas › Androstenediona', how: 'range', to: [['Androstenediona', 'Androstenediona']] },
  { row: 'Tiroides › TSH', how: 'range', to: [['TSH', 'TSH']] },
  { row: 'Tiroides › T4 libre', how: 'range', to: [['T4 libre', 'T4 libre']] },
  { row: 'Tiroides › T4 total', how: 'range', to: [['T4 tiroxina total', 'T4 total']] },
  { row: 'Tiroides › T3 libre', how: 'range', to: [['T3 libre', 'T3 libre']] },
  { row: 'Tiroides › T3 total', how: 'range', to: [['T3 triyodotironina total', 'T3 total']] },
  { row: 'Tiroides › T4-Uptake (captación de T3 por resina)', how: 'range', to: [['T4-Uptake', 'T4-Uptake']] },
  { row: 'Tiroides › Tiroglobulina', how: 'range', to: [['Tiroglobulina', 'Tiroglobulina']] },
  { row: 'Tiroides › Anti-TPO', how: 'range', to: [['Ac. antiperoxidasa (anti-TPO)', 'Anti-TPO'], ['Anticuerpos antitiroideos (anti-TPO / anti-TG)', 'Anti-TPO']] },
  { row: 'Tiroides › Anti-tiroglobulina', how: 'range', to: [['Ac. antitiroglobulina (TG)', 'Anti-tiroglobulina'], ['Anticuerpos antitiroideos (anti-TPO / anti-TG)', 'Anti-tiroglobulina']] },
  { row: 'Tiroides › Anticuerpos antitiroideos (panel TPO/TG)', how: 'skip', why: 'Remite a las filas de anti-TPO y anti-TG, que se cargan en este examen.' },
  { row: 'Endocrinas › ACTH', how: 'range', to: [['ACTH', 'ACTH']] },
  { row: 'Endocrinas › Cortisol a.m. (8 h)', how: 'range', to: [['Cortisol a.m.', 'Cortisol a.m.']] },
  { row: 'Endocrinas › Cortisol p.m. (16 h)', how: 'range', to: [['Cortisol p.m.', 'Cortisol p.m.']] },
  { row: 'Endocrinas › Insulina (ayuno)', how: 'range', to: [['Insulina', 'Insulina (ayuno)']] },
  { row: 'Endocrinas › Insulina posprandial', how: 'note', to: [['Insulina post prandial', 'Insulina posprandial']] },
  { row: 'Endocrinas › Curva de insulina', how: 'note', to: [['Curva de insulina (especificar horas)']] },
  { row: 'Otras › Hormona del crecimiento (en reposo)', how: 'range', to: [['Hormona del crecimiento', 'Hormona del crecimiento (en reposo)']] },
  { row: 'Otras › IGF-1', how: 'note', to: [['IGF-1', 'IGF-1']] },
  { row: 'Otras › IGFBP-3', how: 'note', to: [['IGFBP3', 'IGFBP-3']] },
  { row: 'Otras › PTH intacta', how: 'range', to: [['PTH (paratohormona)', 'PTH intacta']] },

  // 6. Drogas de abuso y fármacos
  { row: 'Drogas de abuso (orina, tamizaje inicial) › Anfetaminas (d-metanfetamina/d-anfetamina)', how: 'cutoff', to: [['Anfetaminas', 'Anfetaminas']] },
  { row: 'Drogas de abuso (orina, tamizaje inicial) › Cocaína (benzoilecgonina)', how: 'cutoff', to: [['Cocaína', 'Cocaína (benzoilecgonina)']] },
  { row: 'Drogas de abuso (orina, tamizaje inicial) › Marihuana (THCA)', how: 'cutoff', to: [['Marihuana', 'Marihuana (THCA)']] },
  { row: 'Drogas de abuso (orina, tamizaje inicial) › Etanol (sangre)', how: 'range', to: [['Etanol', 'Etanol (sangre)']] },
  { row: 'Drogas de abuso (orina, tamizaje inicial) › Nicotina (suero)', how: 'range', to: [['Nicotina', 'Nicotina (suero)']] },
  { row: 'Drogas de abuso (orina, tamizaje inicial) › Cotinina (suero)', how: 'note', to: [['Nicotina', 'Cotinina (suero)']] },
  { row: 'Drogas de abuso (orina, tamizaje inicial) › Sets de 2, 4, 7 y 12 drogas', how: 'note', to: [['Set de 2 drogas'], ['Set de 4 drogas'], ['Set de 7 drogas'], ['Set de 12 drogas']] },
  { row: 'Fármacos (rango terapéutico) › Ácido valproico', how: 'drug', to: [['Ácido valproico', 'Ácido valproico']] },
  { row: 'Fármacos (rango terapéutico) › Carbamazepina', how: 'drug', to: [['Carbamazepina', 'Carbamazepina']] },
  { row: 'Fármacos (rango terapéutico) › Digoxina', how: 'drug', to: [['Digoxina', 'Digoxina']] },
  { row: 'Fármacos (rango terapéutico) › Fenitoína', how: 'drug', to: [['Fenitoína', 'Fenitoína']] },
  { row: 'Fármacos (rango terapéutico) › Fenobarbital', how: 'drug', to: [['Fenobarbital', 'Fenobarbital']] },

  // 7. Inmunología
  { row: 'General › Ácido fólico (sérico)', how: 'range', to: [['Ácido fólico', 'Ácido fólico (sérico)']] },
  { row: 'General › Anti-CCP', how: 'range', to: [['Anti CCP (péptido citrulinado)', 'Anti-CCP']] },
  { row: 'General › Células LE', how: 'expected', to: [['Células LE']] },
  { row: 'General › Complemento C3', how: 'range', to: [['Complemento sérico C3', 'C3']] },
  { row: 'General › Complemento C4', how: 'range', to: [['Complemento sérico C4', 'C4']] },
  { row: 'General › Factor reumatoideo (nefelometría)', how: 'range', to: [['Factor reumatoideo', 'Factor reumatoideo']] },
  { row: 'General › Ferritina', how: 'range', to: [['Ferritina', 'Ferritina']] },
  { row: 'General › IgA', how: 'range', to: [['Inmunoglobulina A', 'IgA']] },
  { row: 'General › IgG', how: 'range', to: [['Inmunoglobulina G', 'IgG']] },
  { row: 'General › IgM', how: 'range', to: [['Inmunoglobulina M', 'IgM']] },
  { row: 'General › IgE total', how: 'range', to: [['Inmunoglobulina E', 'IgE total']] },
  { row: 'General › Interleucina 6', how: 'range', to: [['Interleucina 6 (IL-6)', 'Interleucina 6']] },
  { row: 'General › NT-proBNP (TFG >60)', how: 'note', to: [['NT Pro BNP', 'NT-proBNP']] },
  { row: 'General › NT-proBNP (TFG <60)', how: 'append', into: ['NT Pro BNP', 'NT-proBNP'] },
  { row: 'General › Panel de alergia (alimentos / inhalantes), IgE específica', how: 'note', to: [['Panel de alergia a alimentos', 'IgE específica'], ['Panel de alergia a inhalantes', 'IgE específica']] },
  { row: 'General › Procalcitonina', how: 'range', to: [['Procalcitonina', 'Procalcitonina']] },
  { row: 'General › QuantiFERON-TB Gold', how: 'expected', to: [['Quantiferon TB-Gold']] },
  { row: 'General › Troponina T ultrasensible', how: 'range', to: [['Troponina T ultrasensible', 'Troponina T ultrasensible']] },
  { row: 'General › Vitamina B12', how: 'range', to: [['Vitamina B12', 'Vitamina B12']] },
  { row: 'General › Vitamina D (25-OH)', how: 'range', to: [['Vitamina D', 'Vitamina D (25-OH)']] },
  { row: 'Enfermedades autoinmunes › Anti-centrómero B', how: 'range', to: [['Anti Centrómero B', 'Anti-centrómero B']] },
  { row: 'Enfermedades autoinmunes › Anti-gliadina IgA (deamidada)', how: 'range', to: [['Anti Gliadina IgA', 'Anti-gliadina IgA']] },
  { row: 'Enfermedades autoinmunes › Anti-gliadina IgG (deamidada)', how: 'range', to: [['Anti Gliadina IgG', 'Anti-gliadina IgG']] },
  { row: 'Enfermedades autoinmunes › Anti-Jo-1', how: 'range', to: [['Anti Jo-1', 'Anti-Jo-1']] },
  { row: 'Enfermedades autoinmunes › Anti-La / SSB', how: 'expected', to: [['Anti La / SSB']] },
  { row: 'Enfermedades autoinmunes › Anti-músculo liso', how: 'expected', to: [['Anti músculo liso']] },
  { row: 'Enfermedades autoinmunes › Anti-RNP', how: 'expected', to: [['Anti RNP / Sm', 'Anti-RNP']] },
  { row: 'Enfermedades autoinmunes › Anti-Sm', how: 'range', to: [['Anti RNP / Sm', 'Anti-Sm']] },
  { row: 'Enfermedades autoinmunes › Anti-Ro / SSA', how: 'expected', to: [['Anti RO / SSA']] },
  { row: 'Enfermedades autoinmunes › Anti-Scl-70', how: 'range', to: [['Anti Scl-70', 'Anti-Scl-70']] },
  { row: 'Enfermedades autoinmunes › Anti-DNA de doble cadena (ELISA)', how: 'range', to: [['Anticuerpos anti DNA / ELISA', 'Anti-DNA de doble cadena']] },
  { row: 'Enfermedades autoinmunes › Anti-DNA (IFI, Crithidia)', how: 'expected', to: [['Anticuerpos anti DNA / IFI']] },
  { row: 'Enfermedades autoinmunes › ANCA-P (anti-MPO, ELISA)', how: 'range', to: [['Anticuerpos ANCA P ELISA', 'ANCA-P (anti-MPO)'], ['Anticuerpos anti neutrófilos totales (ANCA) - ELISA', 'ANCA-P (anti-MPO)']] },
  { row: 'Enfermedades autoinmunes › ANCA-C (anti-PR3, ELISA)', how: 'range', to: [['Anticuerpos ANCA C ELISA', 'ANCA-C (anti-PR3)'], ['Anticuerpos anti neutrófilos totales (ANCA) - ELISA', 'ANCA-C (anti-PR3)']] },
  { row: 'Enfermedades autoinmunes › ANCA totales (IFI)', how: 'expected', to: [['Anticuerpos anti neutrófilos totales (ANCA) - IFI']] },
  { row: 'Enfermedades autoinmunes › ANCA totales (ELISA)', how: 'skip', why: 'Remite a anti-MPO y anti-PR3, que se cargan en este examen.' },
  { row: 'Enfermedades autoinmunes › ANA (IFI)', how: 'expected', to: [['Anticuerpos antinucleares (ANA) - IFI']] },
  { row: 'Enfermedades autoinmunes › ANA (ELISA)', how: 'range', to: [['Anticuerpos antinucleares (ANA) - ELISA', 'ANA (ELISA)']] },
  { row: 'Enfermedades autoinmunes › ANA 9 líneas / ANA 18max / ENA / Panel de miositis (inmunoblot)', how: 'expected', to: [['Anticuerpos ANA 9 Line'], ['ANA 18 max.'], ['Anticuerpos ENA'], ['Panel de miositis']] },
  { row: 'Enfermedades autoinmunes › Anti-mitocondriales (AMA)', how: 'expected', to: [['Anticuerpos antimitocondriales (AMA)']] },
  { row: 'Enfermedades autoinmunes › Anti-membrana basal glomerular IgG', how: 'expected', to: [['Anticuerpos anti membrana basal glomerular IgG']] },
  { row: 'Enfermedades autoinmunes › Anticardiolipinas IgG', how: 'range', to: [['Anticuerpos anticardiolipinas IgG', 'Anticardiolipinas IgG'], ['Anticuerpos antifosfolípidos IgG', 'Anticardiolipinas IgG']] },
  { row: 'Enfermedades autoinmunes › Anticardiolipinas IgM', how: 'range', to: [['Anticuerpos anticardiolipinas IgM', 'Anticardiolipinas IgM'], ['Anticuerpos antifosfolípidos IgM', 'Anticardiolipinas IgM']] },
  { row: 'Enfermedades autoinmunes › Antifosfolípidos IgG / IgM', how: 'skip', why: 'Remite a anticardiolipinas y anti-β2 glicoproteína I, que se cargan en los exámenes de antifosfolípidos.' },
  { row: 'Enfermedades autoinmunes › Anti-β2 glicoproteína I IgG', how: 'range', to: [['Anti Beta 2 glicoproteína I IgG', 'Anti-β2 glicoproteína I IgG'], ['Anticuerpos antifosfolípidos IgG', 'Anti-β2 glicoproteína I IgG']] },
  { row: 'Enfermedades autoinmunes › Anti-β2 glicoproteína I IgM', how: 'range', to: [['Anti Beta 2 glicoproteína I IgM', 'Anti-β2 glicoproteína I IgM'], ['Anticuerpos antifosfolípidos IgM', 'Anti-β2 glicoproteína I IgM']] },
  { row: 'Enfermedades autoinmunes › Antitransglutaminasa IgA', how: 'expected', to: [['Anticuerpos antitransglutaminasa IgA']] },
  { row: 'Enfermedades autoinmunes › Antitransglutaminasa IgG', how: 'expected', to: [['Anticuerpos antitransglutaminasa IgG']] },

  // 8. Enfermedades infecciosas
  { row: 'Serologías con interpretación verificada › Anticuerpos VIH 1 y 2, p24 (4.ª generación)', how: 'expected', to: [['Anticuerpos VIH 1 y 2, P24']] },
  { row: 'Serologías con interpretación verificada › Antígeno de superficie HBsAg', how: 'expected', to: [['Antígeno de superficie de hepatitis B']] },
  { row: 'Serologías con interpretación verificada › Anticuerpos anti-HBs', how: 'note', to: [['Anticuerpos contra el antígeno de superficie (HBs Ac.)', 'Anti-HBs']] },
  { row: 'Serologías con interpretación verificada › Anti-HBc totales', how: 'expected', to: [['Anticuerpos hepatitis "B" Core totales']] },
  { row: 'Serologías con interpretación verificada › Anti-HBc IgM', how: 'expected', to: [['Anticuerpos hepatitis "B" Core IgM']] },
  { row: 'Serologías con interpretación verificada › Anticuerpos hepatitis C', how: 'expected', to: [['Anticuerpos hepatitis "C"']] },
  { row: 'Serologías con interpretación verificada › Anticuerpos hepatitis A IgG', how: 'expected', to: [['Anticuerpos hepatitis "A" IgG']] },
  { row: 'Serologías con interpretación verificada › Anticuerpos hepatitis A IgM', how: 'expected', to: [['Anticuerpos hepatitis "A" IgM']] },
  { row: 'Serologías con interpretación verificada › R.P.R.', how: 'expected', to: [['R.P.R.']] },
  { row: 'Serologías con interpretación verificada › R.P.R. / V.D.R.L. reactivo: título', how: 'append', into: ['R.P.R.'], to: [['VDRL']] },
  { row: 'Serologías con interpretación verificada › V.D.R.L.', how: 'expected', to: [['VDRL']] },
  { row: 'Serologías con interpretación verificada › Anticuerpos Treponema (sífilis TP)', how: 'expected', to: [['Anticuerpos Treponema (sífilis TP)']] },
  { row: 'Serologías con interpretación verificada › Anticuerpos dengue (IgM) y antígeno NS1', how: 'expected', to: [['Serología para dengue (NS1, IgM, IgG)', 'IgM y antígeno NS1']] },
  { row: 'Serologías con interpretación verificada › Anticuerpos dengue IgG', how: 'expected', to: [['Serología para dengue (NS1, IgM, IgG)', 'IgG']] },
  { row: 'Serologías con interpretación verificada › Herpes simple tipo 1 y tipo 2, IgG específica', how: 'expected', to: [['Herpes II IgM, IgG', 'IgG (tipo 1 y tipo 2)']] },
  { row: 'Serologías con interpretación verificada › Herpes simple IgM', how: 'expected', to: [['Herpes II IgM, IgG', 'IgM']] },
  { row: 'Serologías con interpretación verificada › Toxoplasma IgG, avidez (índice, método VIDAS)', how: 'note', to: [['Toxo avidez', 'Índice de avidez IgG']] },
  { row: 'Serologías con interpretación verificada › Anticuerpos Zika IgG / IgM', how: 'expected', to: [['Anticuerpos Zika IgG'], ['Anticuerpos Zika IgM']] },
  { row: 'Serologías con interpretación verificada › Anticuerpos estreptolisina O (ASO)', how: 'range', unit: 'unidades Todd', to: [['Anticuerpos estreptolisina "O" (ASO)', 'ASO']] },
  { row: 'Serologías con interpretación verificada › Anticuerpos rubéola IgG', how: 'note', to: [['Anticuerpos rubéola IgG', 'Rubéola IgG']] },
  { row: 'Serologías con interpretación verificada › Anticuerpos rubéola IgM', how: 'expected', to: [['Anticuerpos rubéola IgM']] },
  { row: 'Serologías con interpretación verificada › Anticuerpos toxoplasmosis IgG / IgM', how: 'expected', to: [['Anticuerpos toxoplasmosis IgG'], ['Anticuerpos toxoplasmosis IgM']] },
  { row: 'Serologías con interpretación verificada › Citomegalovirus IgG / IgM', how: 'expected', to: [['Citomegalovirus IgG, IgM']] },
  { row: 'Serologías con interpretación verificada › Epstein-Barr VCA IgG / VCA IgM / EBNA', how: 'expected', to: [['Epstein Barr virus IgG (cápside)'], ['Epstein Barr virus IgM (cápside)'], ['Epstein Barr virus nuclear (EBNA)']] },
  { row: 'Serologías con interpretación verificada › Anticuerpos mononucleosis (Monotest)', how: 'expected', to: [['Anticuerpos mononucleosis (Monotest)']] },
  { row: 'Serologías con interpretación verificada › Anticuerpos H. pylori (serología)', how: 'expected', to: [['Anticuerpos Helicobacter pylori totales IgG, IgM, IgA']] },
  { row: 'Serologías con interpretación verificada › Linfocitos CD4', how: 'range', unit: 'células/µL', to: [['Linfocitos CD4', 'Linfocitos CD4']] },
  { row: 'Serologías con interpretación verificada › Prueba de tuberculina (PPD)', how: 'expected', to: [['Prueba de tuberculina']] },
  { row: 'Serologías con interpretación verificada › Antígenos febriles (Widal)', how: 'expected', to: [['Antígenos febriles']] },
  { row: 'Pruebas de detección de patógeno (antígeno, anticuerpo o PCR) › Adenovirus respiratorio', how: 'expected', to: [['Adenovirus respiratorio']] },
  { row: 'Pruebas de detección de patógeno (antígeno, anticuerpo o PCR) › Anticuerpos Chlamydia trachomatis IgG / IgM', how: 'expected', to: [['Anticuerpos Chlamydia trachomatis IgG'], ['Anticuerpos Chlamydia trachomatis IgM']] },
  { row: 'Pruebas de detección de patógeno (antígeno, anticuerpo o PCR) › Anticuerpos cisticercosis IgG / IgM', how: 'expected', to: [['Anticuerpos cisticercosis IgG, IgM']] },
  { row: 'Pruebas de detección de patógeno (antígeno, anticuerpo o PCR) › Antígeno Cryptococcus neoformans', how: 'expected', to: [['Ag. Cryptococcus neoformans']] },
  { row: 'Pruebas de detección de patógeno (antígeno, anticuerpo o PCR) › Antígeno Streptococcus A', how: 'expected', to: [['Ag. Strepto A']] },
  { row: 'Pruebas de detección de patógeno (antígeno, anticuerpo o PCR) › Anticuerpos chikungunya IgG / IgM', how: 'expected', to: [['Anticuerpos chikungunya IgG'], ['Anticuerpos chikungunya IgM']] },
  { row: 'Pruebas de detección de patógeno (antígeno, anticuerpo o PCR) › Antígeno influenza A y B', how: 'expected', to: [['Antígeno influenza A y B']] },
  { row: 'Pruebas de detección de patógeno (antígeno, anticuerpo o PCR) › Virus sincitial respiratorio', how: 'expected', to: [['Virus sincitial respiratorio']] },

  // 9. Marcadores tumorales
  { row: '- › PSA total', how: 'note', to: [['PSA total', 'PSA total']] },
  { row: '- › PSA libre (% del total)', how: 'note', to: [['PSA libre', 'PSA libre (% del total)'], ['Relación PSA / PSA libre', 'PSA libre (% del total)']] },
  { row: '- › AFP', how: 'range', to: [['AFP', 'AFP']] },
  { row: '- › CEA', how: 'range', to: [['CEA', 'CEA']] },
  { row: '- › CA 19-9', how: 'range', to: [['Ca 19-9 (páncreas, vesícula)', 'CA 19-9']] },
  { row: '- › CA 15-3', how: 'range', to: [['Ca 15-3 (mama)', 'CA 15-3']] },
  { row: '- › CA 125', how: 'range', to: [['Ca 125 (ovario)', 'CA 125']] },
  { row: '- › HE4', how: 'note', to: [['HE4 (proteína epididimal humana 4, ovario)', 'HE4']] },
  { row: '- › Algoritmo ROMA', how: 'note', to: [['Algoritmo ROMA (ovario)', 'ROMA']] },

  // 10. COVID-19
  { row: '- › Anticuerpos COVID-19 (prueba rápida)', how: 'expected', to: [['Anticuerpo COVID-19 (prueba rápida)']] },
  { row: '- › Antígeno SARS-CoV-2', how: 'expected', to: [['Antígeno SARS-CoV-2']] },
  { row: '- › Panel respiratorio + COVID-19', how: 'expected', to: [['Panel respiratorio + COVID-19']] },
  { row: '- › PCR SARS-CoV-2', how: 'expected', to: [['PCR SARS-CoV-2']] },
  { row: '- › Xpert SARS-CoV-2 / Flu / RSV (PCR)', how: 'expected', to: [['XPERT SARS CoV2/FLU/RSV (PCR)']] },
  { row: '- › Antígeno COVID-19 + influenza A y B', how: 'expected', to: [['Ag. Covid 19 + influenza A y B']] },
  { row: '- › LIAT SARS-CoV-2 / Flu (PCR)', how: 'expected', to: [['LIAT SARS Cov2/FLU (PCR)']] },

  // 11. Microbiología
  { row: 'Líquido cefalorraquídeo (LCR) › Leucocitos', how: 'range', to: [['Líquido cefalorraquídeo (LCR)', 'Leucocitos (LCR)']] },
  { row: 'Líquido cefalorraquídeo (LCR) › Eritrocitos', how: 'range', to: [['Líquido cefalorraquídeo (LCR)', 'Eritrocitos (LCR)']] },
  { row: 'Líquido cefalorraquídeo (LCR) › Glucosa', how: 'range', to: [['Líquido cefalorraquídeo (LCR)', 'Glucosa (LCR)']] },
  { row: 'Líquido cefalorraquídeo (LCR) › Proteínas totales', how: 'range', to: [['Líquido cefalorraquídeo (LCR)', 'Proteínas totales (LCR)']] },
  { row: 'Líquido cefalorraquídeo (LCR) › Cloruro', how: 'range', to: [['Líquido cefalorraquídeo (LCR)', 'Cloruro (LCR)']] },
  { row: 'Líquido cefalorraquídeo (LCR) › Presión de apertura', how: 'range', to: [['Líquido cefalorraquídeo (LCR)', 'Presión de apertura']] },
  { row: 'Líquido cefalorraquídeo (LCR) › Gram, cultivo', how: 'expected', to: [['Líquido cefalorraquídeo (LCR)']] },
  ...['Proteína pleural / proteína sérica', 'LDH pleural / LDH sérica', 'LDH pleural', 'ADA (en exudado linfocítico)'].map((n): Rule => ({ row: `Líquido pleural (criterios de Light: exudado si cumple ≥1) › ${n}`, how: 'expected', to: [['Líquido pleural']] })),
  ...['Neutrófilos (PMN)', 'Gradiente albúmina suero-ascitis (GASA)'].map((n): Rule => ({ row: `Líquido peritoneal (ascítico) › ${n}`, how: 'expected', to: [['Líquido peritoneal (ascítico)']] })),
  { row: 'Líquido articular (sinovial) › Leucocitos', how: 'range', unit: 'células/µL', to: [['Líquido articular (sinovial)', 'Leucocitos (líquido sinovial)']] },
  ...['Aspecto', 'Coágulo', 'Volumen'].map((n): Rule => ({ row: `Líquido articular (sinovial) › ${n}`, how: 'expected', to: [['Líquido articular (sinovial)']] })),
  { row: 'Tinciones › KOH', how: 'expected', to: [['KOH']] },
  { row: 'Tinciones › Giemsa', how: 'expected', to: [['Giemsa']] },
  { row: 'Tinciones › Tinta china', how: 'expected', to: [['Tinta china']] },
  { row: 'Tinciones › Gram', how: 'expected', to: [['Coloración de Gram']] },
  { row: 'Tinciones › Wright', how: 'expected', to: [['Coloración de Wright']] },
  { row: 'Tinciones › Ziehl-Neelsen', how: 'expected', to: [['Coloración de Ziehl-Neelsen']] },
  { row: 'Tinciones › Examen en fresco (solución salina)', how: 'expected', to: [['Examen en fresco con solución salina']] },
  { row: 'Tinciones › Citología de moco nasal', how: 'expected', to: [['Citología de moco nasal']] },
  { row: 'Cultivos › Urocultivo', how: 'expected', to: [['Urocultivo']] },
  { row: 'Cultivos › Cultivo bacteriológico, coprocultivo, espermocultivo, exudado faríngeo, expectoración, hongos, N. gonorrhoeae, micobacterias', how: 'expected',
    to: [['Cultivo bacteriológico'], ['Coprocultivo'], ['Espermocultivo (líquido seminal)'], ['Exudado faríngeo'], ['Cultivo de expectoración'], ['Cultivo por hongos'], ['Cultivo Neisseria gonorrhoeae'], ['Cultivo por micobacterias']] },
  { row: 'Cultivos › Cribado de Streptococcus agalactiae', how: 'expected', to: [['Cribado Streptococcus agalactiae (betahemolítico)']] },
  { row: 'Cultivos › Leishmaniasis', how: 'expected', to: [['Leishmaniasis']] },
  ...([['Volumen', 'Volumen'], ['Concentración', 'Concentración'], ['Número total', 'Número total'], ['Motilidad progresiva', 'Motilidad progresiva'], ['Morfología normal', 'Morfología normal'], ['Vitalidad', 'Vitalidad'], ['pH', 'pH seminal']] as const)
    .map(([n, a]): Rule => ({ row: `Espermograma (límites inferiores de referencia, OMS 2021) › ${n}`, how: n === 'pH' ? 'range' : 'min', to: [['Espermograma', a]] })),

  // 12. Orina
  // Ronda 12 (LB2): cada parámetro del EGO es un analito (físico, químico y microscópico), en el orden del examen
  { row: 'Examen físico › Color', how: 'expected', to: [[EGO, 'Color']] },
  { row: 'Examen físico › Aspecto', how: 'expected', to: [[EGO, 'Aspecto']] },
  { row: 'Examen físico › Densidad (gravedad específica)', how: 'range', to: [[EGO, 'Densidad']] },
  { row: 'Examen químico › pH', how: 'range', to: [[EGO, 'pH urinario']] },
  ...['Glucosa', 'Cetonas', 'Proteínas', 'Bilirrubina', 'Nitritos', 'Hemoglobina (sangre)'].map((n): Rule => ({ row: `Examen químico › ${n}`, how: 'expected', to: [[EGO, n]] })),
  { row: 'Examen químico › Urobilinógeno', how: 'range', unit: 'mg/dL', to: [[EGO, 'Urobilinógeno']] },
  { row: 'Examen microscópico › Eritrocitos', how: 'range', to: [[EGO, 'Eritrocitos']] },
  { row: 'Examen microscópico › Leucocitos', how: 'range', to: [[EGO, 'Leucocitos']] },
  ...['Cilindros', 'Células epiteliales escamosas', 'Cristales', 'Bacterias', 'Levaduras', 'Moco'].map((n): Rule => ({ row: `Examen microscópico › ${n}`, how: 'expected', to: [[EGO, n]] })),
  { row: 'Otras pruebas en orina › Porfobilinógeno', how: 'expected', to: [['Porfobilinógeno / urobilinógeno']] },
  { row: 'Otras pruebas en orina › Prueba de embarazo en orina', how: 'expected', to: [['Prueba de embarazo en orina']] },

  // 13. Heces
  { row: '- › Calprotectina fecal', how: 'cat', unit: 'µg/g', to: [['Calprotectina fecal', 'Calprotectina fecal']] },
  { row: '- › General de heces', how: 'expected', to: [['Examen general de heces']] },
  { row: '- › Sangre oculta en heces', how: 'expected', to: [['Sangre oculta en heces']] },
  { row: '- › Wright en heces (leucocitos fecales)', how: 'expected', to: [['Wright en heces']] },
  { row: '- › Citología de moco fecal', how: 'expected', to: [['Citología de moco fecal']] },
  { row: '- › H. pylori (antígeno, cualitativo)', how: 'expected', to: [['Helicobacter pylori (cualitativo)']] },
  { row: '- › H. pylori (cuantitativo)', how: 'expected', to: [['Helicobacter pylori (cuantitativo)']] },
  { row: '- › Cripto-Giardia', how: 'expected', to: [['Cripto-Giardia']] },
  { row: '- › Rotavirus', how: 'expected', to: [['Rotavirus en heces']] },
  { row: '- › Clostridioides difficile toxina A+B', how: 'expected', to: [['Clostridium difficile toxina A+B']] },
  { row: '- › Coloración para Cryptosporidium', how: 'expected', to: [['Coloración de Cryptosporidium (Apicomplexa)']] },
  { row: '- › Adenovirus en heces', how: 'expected', to: [['Adenovirus en heces']] },
  { row: '- › Sudán III / Sudán IV (grasa fecal cualitativa)', how: 'expected', to: [['Sudán III'], ['Sudán IV']] },

  // 14. Biología molecular y 15. PCR
  { row: '- › Prueba de paternidad', how: 'expected', to: [['Prueba de paternidad (consultar previamente al laboratorio)']] },
  { row: '- › BRCA 1 y 2', how: 'expected', to: [['BRCA 1 y 2 (consultar previamente al laboratorio)']] },
  { row: '- › Carga viral VIH-1 (ARN, plasma)', how: 'expected', to: [['Carga viral VIH']] },
  { row: '- › PCR VIH cualitativa', how: 'expected', to: [['PCR HIV']] },
  { row: '- › Carga viral hepatitis B (ADN, suero)', how: 'expected', to: [['Carga viral hepatitis B']] },
  { row: '- › Carga viral hepatitis C (ARN, suero)', how: 'expected', to: [['Carga viral hepatitis C']] },
  { row: '- › Carga viral citomegalovirus (ADN, plasma)', how: 'expected', to: [['Carga viral citomegalovirus'], ['PCR para citomegalovirus']] },
  { row: '- › PCR Epstein-Barr', how: 'expected', to: [['PCR para Epstein Barr']] },
  { row: '- › PCR herpes I y II', how: 'expected', to: [['PCR para herpes I y II']] },
  { row: '- › PCR Toxoplasma', how: 'expected', to: [['PCR para Toxoplasma']] },
  { row: '- › Panel meningitis/encefalitis', how: 'expected', to: [['Panel de meningitis / encefalitis']] },
  { row: '- › PCR varicela zóster', how: 'expected', to: [['PCR para varicela zóster']] },
  { row: '- › Panel dengue-Zika-chikungunya', how: 'expected', to: [['Panel dengue-zika-chikungunya']] },
  { row: '- › PCR complejo M. tuberculosis / resistencia a rifampicina', how: 'expected', to: [['PCR para complejo Mycobacterium tuberculosis'], ['PCR para Mycobacterium tuberculosis resistente a RIF']] },
  { row: '- › PCR VPH (14 y 24 genotipos)', how: 'expected', to: [['PCR virus papiloma humano (VPH) 14 genotipos'], ['PCR virus papiloma humano (VPH) 24 genotipos']] },
  { row: '- › PCR Chlamydia trachomatis / Neisseria gonorrhoeae', how: 'expected', to: [['PCR para Chlamydia trachomatis / Neisseria gonorrhoeae']] },
  { row: '- › Panel neumonía', how: 'expected', to: [['Panel de neumonía']] },
  { row: '- › Panel ITS', how: 'expected', to: [['Panel ITS (enfermedades de transmisión sexual)']] },
  { row: '- › Xpert Carba-R', how: 'expected', to: [['Xpert Carba R']] },
]

void PATH
