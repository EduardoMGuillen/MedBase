/**
 * CA1–CA3 (ronda 7, reemplaza a CF3 y CF6 de la ronda 6): exámenes de laboratorio y perfiles que se cargan en el catálogo
 * de cada clínica y consultorio (migración v56, `server/catalogLoader.ts`).
 *
 * FUENTE: Anexo A (exámenes, por área › sección y en el orden del formulario), tabla de equivalencias, Anexo B (perfiles)
 * y B6 (los paquetes que pasan a perfil) del pedido de la ronda 7. Sólo nombres de exámenes y de perfiles: nada del
 * laboratorio comercial del que salió la lista. VALIDAR: Emil (sinónimos de B5 y composición de los paquetes de B6).
 */

/** Áreas de Laboratorio en el orden del Anexo A; las que tienen secciones llevan un nivel más (Laboratorio › área › sección). */
export const LAB_AREAS: { area: string; sections?: string[] }[] = [
  { area: 'Hematología' },
  { area: 'Coagulación' },
  { area: 'Química en sangre' },
  { area: 'Química en orina' },
  { area: 'Hormonas', sections: ['Hormona reproductiva', 'Tiroides', 'Endocrinas', 'Otras'] },
  { area: 'Drogas de abuso y fármacos', sections: ['Drogas de abuso', 'Fármacos'] },
  { area: 'Inmunología', sections: ['General', 'Enfermedades autoinmunes'] },
  { area: 'Enfermedades infecciosas' },
  { area: 'Marcadores tumorales' },
  { area: 'COVID-19' },
  { area: 'Microbiología / Bacteriología', sections: ['Líquidos (BAC líquidos)', 'Tinciones', 'Cultivos'] },
  { area: 'Orina' },
  { area: 'Heces' },
  { area: 'Biología molecular' },
  { area: 'PCR / cargas virales / paneles moleculares' },
  { area: 'Otros' },
]

/** Separador del subgrupo de dos niveles que se guarda en `exam_catalog.subgroup`: «Hormonas › Tiroides». */
export const SECTION_SEP = ' › '

/** Un examen del Anexo A: nombre tal cual y su subgrupo («Área» o «Área › Sección»). */
export interface LabCatalogEntry { name: string; subgroup: string }

const sec = (area: string, section: string | null, names: string[]): LabCatalogEntry[] =>
  names.map((name) => ({ name, subgroup: section ? `${area}${SECTION_SEP}${section}` : area }))

/** Anexo A: 289 exámenes nuevos (partes 1 y 2 del formulario y los seis que sólo aparecen en perfiles, marcados ◆). */
export const LAB_CATALOG: LabCatalogEntry[] = [
  ...sec('Hematología', null, ['Células falciformes (drepanocitos)', 'Coombs directo', 'Coombs indirecto', 'Crioaglutininas', 'Electroforesis de hemoglobina',
    'Hematozoario (Plasmodium spp.)', 'Reticulocitos', 'Eosinófilos']),
  ...sec('Coagulación', null, ['Anticoagulante lúpico', 'Dímero-D', 'Fibrinógeno', 'Proteína C', 'Proteína S', 'Retracción del coágulo', 'Tiempo de coagulación',
    'Tiempo de protrombina (TP)', 'Tiempo de sangrado', 'Tiempo de tromboplastina parcial (TPT)', 'Antitrombina III']),
  ...sec('Química en sangre', null, ['Ácido úrico', 'Albúmina', 'Aldolasa', 'Amilasa', 'Amonio sérico', 'Bilirrubinas totales y fraccionadas', 'Calcio',
    'Capacidad de captación de hierro', 'Cloruro (Cl)', 'CO2', 'Colesterol HDL', 'Colesterol LDL', 'Colesterol total', 'Colinesterasa', 'CPK (creatin fosfoquinasa)',
    'CPK-MB', 'Tolerancia oral a la glucosa 2 horas', 'Curva de tolerancia 2 h glucosa gestacional 75 g', 'Curva de tolerancia 3 h glucosa gestacional 100 g',
    'Curva de tolerancia de glucosa 2 horas', 'Curva de tolerancia de glucosa 3 horas', 'Curva de tolerancia de glucosa 4 horas', 'Curva de tolerancia de glucosa 5 horas',
    'Deshidrogenasa láctica (LDH)', 'Electroforesis de proteínas', 'Fosfatasa alcalina', 'Fósforo', 'Gamma glutamil transpeptidasa (GGT)', 'Hierro sérico',
    'Homocisteína', 'Lipasa', 'Litio', 'Magnesio (Mg)', 'PCR ultrasensible (PCR-us)', 'Potasio (K)', 'Proteínas totales y fraccionadas', 'Sodio (Na)',
    'Sullivan 50 g (2 muestras)', 'TGO (aspartato)', 'TGP (alanino)', 'Triglicéridos', 'Urea nitrogenada (BUN)', 'Investigación de hemoglobina S (HPLC)',
    'Osmolaridad plasmática']),
  ...sec('Química en orina', null, ['17 Cetosteroides en orina de 24 horas', '17 Hidroxiesteroides en orina de 24 horas', 'Ácido úrico / 24 horas',
    'Ácido vanilmandélico en orina de 24 horas', 'Calcio / 24 horas', 'Creatinina / 24 horas', 'Índice proteína-creatinina en orina',
    'Cociente albúmina-creatinina en orina', 'Depuración de creatinina / 24 horas', 'Fósforo / 24 horas', 'Magnesio / 24 horas', 'Microalbuminuria',
    'Proteínas totales / 24 horas', 'Tasa de filtrado glomerular', 'Cortisol libre en orina / 24 horas', 'Microalbuminuria en 24 horas', 'Aclaramiento de creatinina']),
  ...sec('Hormonas', 'Hormona reproductiva', ['17 OH-Progesterona', 'BHCG (gonadotropina coriónica humana, fracción beta)', 'DHEA-S', 'Estradiol',
    'FSH (hormona folículo estimulante)', 'LH (hormona luteinizante)', 'Progesterona', 'Prolactina (PRL)', 'SHBG', 'Testosterona', 'Índice de testosterona libre',
    'Hormona antimülleriana', 'Androstenediona']),
  ...sec('Hormonas', 'Tiroides', ['Anticuerpos antitiroideos (anti-TPO / anti-TG)', 'Ac. antiperoxidasa (anti-TPO)', 'Ac. antitiroglobulina (TG)', 'T3 libre',
    'T3 triyodotironina total', 'T4 tiroxina total', 'T4-Uptake', 'Tiroglobulina']),
  ...sec('Hormonas', 'Endocrinas', ['ACTH', 'Cortisol a.m.', 'Cortisol p.m.', 'Curva de insulina (especificar horas)', 'Insulina', 'Insulina post prandial']),
  ...sec('Hormonas', 'Otras', ['Hormona del crecimiento', 'IGF-1', 'IGFBP3', 'PTH (paratohormona)']),
  ...sec('Drogas de abuso y fármacos', 'Drogas de abuso', ['Anfetaminas', 'Cocaína', 'Etanol', 'Marihuana', 'Nicotina', 'Set de 2 drogas', 'Set de 4 drogas',
    'Set de 7 drogas', 'Set de 12 drogas']),
  ...sec('Drogas de abuso y fármacos', 'Fármacos', ['Ácido valproico', 'Carbamazepina', 'Digoxina', 'Fenitoína', 'Fenobarbital']),
  ...sec('Inmunología', 'General', ['Ácido fólico', 'Anti CCP (péptido citrulinado)', 'Células LE', 'Complemento sérico C3', 'Complemento sérico C4',
    'Factor reumatoideo', 'Ferritina', 'Inmunoglobulina A', 'Inmunoglobulina G', 'Inmunoglobulina M', 'Inmunoglobulina E', 'Interleucina 6 (IL-6)', 'NT Pro BNP',
    'Panel de alergia a alimentos', 'Panel de alergia a inhalantes', 'Procalcitonina', 'Quantiferon TB-Gold', 'Troponina T ultrasensible', 'Vitamina B12', 'Vitamina D']),
  ...sec('Inmunología', 'Enfermedades autoinmunes', ['Anti Centrómero B', 'Anti Gliadina IgA', 'Anti Gliadina IgG', 'Anti Jo-1', 'Anti La / SSB',
    'Anti músculo liso', 'Anti RNP / Sm', 'Anti RO / SSA', 'Anti Scl-70', 'Anticuerpos anti DNA / IFI', 'Anticuerpos anti DNA / ELISA', 'Anticuerpos ANCA P ELISA',
    'Anticuerpos ANCA C ELISA', 'ANA 18 max.', 'Panel de miositis', 'Anticuerpos antimitocondriales (AMA)', 'Anticuerpos anti membrana basal glomerular IgG',
    'Anticuerpos anti neutrófilos totales (ANCA) - IFI', 'Anticuerpos anti neutrófilos totales (ANCA) - ELISA', 'Anticuerpos ANA 9 Line', 'Anticuerpos ENA',
    'Anticuerpos antifosfolípidos IgG', 'Anticuerpos antifosfolípidos IgM', 'Anticuerpos antinucleares (ANA) - IFI', 'Anticuerpos antinucleares (ANA) - ELISA',
    'Anticuerpos antitransglutaminasa IgA', 'Anticuerpos antitransglutaminasa IgG', 'Anticuerpos anticardiolipinas IgG', 'Anticuerpos anticardiolipinas IgM',
    'Anti Beta 2 glicoproteína I IgG', 'Anti Beta 2 glicoproteína I IgM']),
  ...sec('Enfermedades infecciosas', null, ['Adenovirus respiratorio', 'Anticuerpos VIH 1 y 2, P24', 'Anticuerpos Chlamydia trachomatis IgG',
    'Anticuerpos Chlamydia trachomatis IgM', 'Anticuerpos cisticercosis IgG, IgM', 'Anticuerpos contra el antígeno de superficie (HBs Ac.)',
    'Ag. Cryptococcus neoformans', 'Ag. Strepto A', 'Anticuerpos estreptolisina "O" (ASO)', 'Anticuerpos Helicobacter pylori totales IgG, IgM, IgA',
    'Anticuerpos hepatitis "A" IgG', 'Anticuerpos hepatitis "A" IgM', 'Anticuerpos hepatitis "B" Core totales', 'Anticuerpos hepatitis "B" Core IgM',
    'Anticuerpos hepatitis "C"', 'Anticuerpos mononucleosis (Monotest)', 'Anticuerpos rubéola IgG', 'Anticuerpos rubéola IgM', 'Anticuerpos Zika IgG',
    'Anticuerpos Zika IgM', 'Anticuerpos chikungunya IgG', 'Anticuerpos chikungunya IgM', 'Anticuerpos toxoplasmosis IgG', 'Anticuerpos toxoplasmosis IgM',
    'Anticuerpos Treponema (sífilis TP)', 'Antígeno influenza A y B', 'Antígenos febriles', 'Citomegalovirus IgG, IgM', 'Epstein Barr virus IgG (cápside)',
    'Epstein Barr virus IgM (cápside)', 'Epstein Barr virus nuclear (EBNA)', 'Linfocitos CD4', 'Prueba de tuberculina', 'R.P.R.', 'Virus sincitial respiratorio',
    'Herpes II IgM, IgG', 'Toxo avidez']),
  ...sec('Marcadores tumorales', null, ['PSA libre', 'PSA total', 'AFP', 'CEA', 'Ca 19-9 (páncreas, vesícula)', 'Ca 15-3 (mama)', 'Ca 125 (ovario)',
    'HE4 (proteína epididimal humana 4, ovario)', 'Algoritmo ROMA (ovario)', 'Relación PSA / PSA libre']),
  ...sec('COVID-19', null, ['Anticuerpo COVID-19 (prueba rápida)', 'Antígeno SARS-CoV-2', 'Panel respiratorio + COVID-19', 'PCR SARS-CoV-2',
    'XPERT SARS CoV2/FLU/RSV (PCR)', 'Ag. Covid 19 + influenza A y B', 'LIAT SARS Cov2/FLU (PCR)']),
  ...sec('Microbiología / Bacteriología', 'Líquidos (BAC líquidos)', ['Líquido articular (sinovial)', 'Líquido cefalorraquídeo (LCR)',
    'Líquido peritoneal (ascítico)', 'Líquido pleural', 'Otros líquidos (especificar; incluye solo citoquímica)']),
  ...sec('Microbiología / Bacteriología', 'Tinciones', ['KOH', 'Giemsa', 'Tinta china', 'Coloración de Gram', 'Coloración de Wright', 'Coloración de Ziehl-Neelsen',
    'Examen en fresco con solución salina', 'Citología de moco nasal']),
  ...sec('Microbiología / Bacteriología', 'Cultivos', ['Cultivo bacteriológico', 'Espermocultivo (líquido seminal)', 'Exudado faríngeo',
    'Cribado Streptococcus agalactiae (betahemolítico)', 'Cultivo de expectoración', 'Cultivo por hongos', 'Cultivo Neisseria gonorrhoeae', 'Cultivo por micobacterias',
    'Espermograma', 'Leishmaniasis']),
  ...sec('Orina', null, ['Porfobilinógeno / urobilinógeno']),
  ...sec('Heces', null, ['Calprotectina fecal', 'Citología de moco fecal', 'Sangre oculta en heces', 'Wright en heces', 'Helicobacter pylori (cualitativo)',
    'Helicobacter pylori (cuantitativo)', 'Cripto-Giardia', 'Rotavirus en heces', 'Clostridium difficile toxina A+B', 'Coloración de Cryptosporidium (Apicomplexa)',
    'Adenovirus en heces', 'Sudán III', 'Sudán IV']),
  ...sec('Biología molecular', null, ['Prueba de paternidad (consultar previamente al laboratorio)', 'BRCA 1 y 2 (consultar previamente al laboratorio)']),
  ...sec('PCR / cargas virales / paneles moleculares', null, ['PCR HIV', 'Carga viral VIH', 'Carga viral hepatitis B', 'Carga viral hepatitis C',
    'Carga viral citomegalovirus', 'PCR para citomegalovirus', 'PCR para Epstein Barr', 'PCR para herpes I y II', 'PCR para Toxoplasma',
    'Panel de meningitis / encefalitis', 'PCR para varicela zóster', 'Panel dengue-zika-chikungunya', 'PCR para complejo Mycobacterium tuberculosis',
    'PCR para Mycobacterium tuberculosis resistente a RIF', 'PCR virus papiloma humano (VPH) 14 genotipos', 'PCR virus papiloma humano (VPH) 24 genotipos',
    'PCR para Chlamydia trachomatis / Neisseria gonorrhoeae', 'Panel de neumonía', 'Panel ITS (enfermedades de transmisión sexual)', 'Xpert Carba R']),
]

/**
 * Tabla de equivalencias del Anexo A (nombre del formulario → examen que ya existe: no se agrega) y sinónimos de B5
 * (nombre dentro de un perfil → examen del catálogo). VALIDAR: Emil (B5).
 */
export const LAB_EQUIVALENCES: Record<string, string> = {
  'Hemograma completo': 'Hemograma',
  'Eritrosedimentación (VES)': 'Velocidad de eritrosedimentación',
  'Frotis de sangre periférica (FSP)': 'Frotis de sangre periférica',
  'Grupo sanguíneo y Rh': 'Tipo y Rh',
  'Creatinina': 'Creatinina',
  'Glucosa en ayunas': 'Glucosa en ayunas',
  'Glucosa post-prandial': 'Glucosa posprandial',
  'Hemoglobina glicosilada (HbA1c)': 'Hemoglobina glicosilada (HbA1c)',
  'Proteína C reactiva (PCR)': 'Proteína C reactiva',
  'Troponina I': 'Troponina I',
  'Examen de embarazo en sangre': 'Prueba de embarazo en sangre (β-hCG)',
  'Prueba de embarazo en orina': 'Prueba de embarazo en orina',
  'General de orina': 'Examen general de orina (EGO)',
  'General de heces': 'Examen general de heces',
  'Coprocultivo': 'Coprocultivo',
  'Urocultivo': 'Urocultivo',
  'Antígeno de superficie (Australia) HBs Ag.': 'Antígeno de superficie de hepatitis B',
  'Anticuerpos dengue y antígeno NS1': 'Serología para dengue (NS1, IgM, IgG)',
  'V.D.R.L.': 'VDRL',
  'T4 libre / Tiroxina libre': 'T4 libre',
  'TSH': 'TSH',
  // Ronda 6 (ejemplos de CF6)
  'Orina general': 'Examen general de orina (EGO)',
  'Heces general': 'Examen general de heces',
  // B5: sinónimos entre perfiles y catálogo
  'Glucosa': 'Glucosa en ayunas',
  'Cloro': 'Cloruro (Cl)',
  'Folato': 'Ácido fólico',
  'Capacidad de hierro': 'Capacidad de captación de hierro',
  'Creatinina en orina 24 h': 'Creatinina / 24 horas',
  'Proteínas en orina 24 h': 'Proteínas totales / 24 horas',
  'Ac. citomegalovirus IgM, IgG': 'Citomegalovirus IgG, IgM',
}

/** B3: subgrupo de los exámenes de la lista fija que ya existían (los paquetes de CA2 se archivan). VALIDAR: Emil. */
export const EXISTING_SUBGROUP: Record<string, string> = {
  'Hemograma': 'Hematología', 'Frotis de sangre periférica': 'Hematología', 'Velocidad de eritrosedimentación': 'Hematología', 'Tipo y Rh': 'Hematología',
  'Gota gruesa': 'Hematología',
  'Creatinina': 'Química en sangre', 'Gases arteriales': 'Química en sangre', 'Glucosa en ayunas': 'Química en sangre', 'Glucosa posprandial': 'Química en sangre',
  'Hemoglobina glicosilada (HbA1c)': 'Química en sangre', 'Proteína C reactiva': 'Química en sangre', 'Troponina I': 'Química en sangre',
  'Química sanguínea': 'Química en sangre',
  'T4 libre': `Hormonas${SECTION_SEP}Tiroides`, 'TSH': `Hormonas${SECTION_SEP}Tiroides`,
  'Prueba de embarazo en sangre (β-hCG)': `Hormonas${SECTION_SEP}Hormona reproductiva`,
  'Examen general de orina (EGO)': 'Orina', 'Prueba de embarazo en orina': 'Orina', 'Examen general de heces': 'Heces',
  'Coprocultivo': `Microbiología / Bacteriología${SECTION_SEP}Cultivos`, 'Hemocultivo': `Microbiología / Bacteriología${SECTION_SEP}Cultivos`,
  'Urocultivo': `Microbiología / Bacteriología${SECTION_SEP}Cultivos`,
  'Antígeno de superficie de hepatitis B': 'Enfermedades infecciosas', 'Serología para dengue (NS1, IgM, IgG)': 'Enfermedades infecciosas',
  'VDRL': 'Enfermedades infecciosas', 'VIH (prueba rápida)': 'Enfermedades infecciosas',
  // Paquetes (CA2): se archivan, pero conservan un lugar por si la clínica los restaura
  'Perfil lipídico': 'Química en sangre', 'Perfil renal': 'Química en sangre', 'Perfil hepático': 'Química en sangre', 'Electrolitos': 'Química en sangre',
  'Amilasa y lipasa': 'Química en sangre', 'Tiempos de coagulación (TP, TPT, INR)': 'Coagulación',
}

/**
 * Subgrupo que les puso la ronda 6 (A6) a los existentes que ahora cambian (B3). La migración sólo cambia el de los que
 * todavía tienen éste: lo que la clínica haya editado se respeta.
 */
export const R6_SUBGROUP: Record<string, string> = {
  'T4 libre': 'Hormonas', 'TSH': 'Hormonas', 'Prueba de embarazo en sangre (β-hCG)': 'Hormonas',
  'Coprocultivo': 'Microbiología', 'Hemocultivo': 'Microbiología', 'Urocultivo': 'Microbiología',
  'Gota gruesa': 'Enfermedades infecciosas',
}

/**
 * Orden dentro de cada área o sección: el del formulario. Los existentes que el formulario lista (tabla de equivalencias)
 * van primero, en el orden de la tabla; después los nuevos en el orden del Anexo A. Lo demás, por nombre, al final.
 */
export const LAB_ORDER: string[] = [
  ...new Set([...Object.values(LAB_EQUIVALENCES), ...LAB_CATALOG.map((e) => e.name)]),
]

/** Un perfil de laboratorio de la clínica: nombre, exámenes (nombres finales del catálogo) y una nota opcional. */
export interface LabProfileEntry { name: string; items: string[]; note?: string }

/** Anexo B (parte 3 del formulario, 24 perfiles) y los 3 paquetes de CA2 que no están en él (Anexo C / B6). */
export const LAB_PROFILES: LabProfileEntry[] = [
  { name: 'Perfil recién nacido <1 mes', items: ['Hemograma', 'Tipo y Rh', 'TSH', 'T4 libre'] },
  { name: 'Perfil niño sano 1', items: ['Hemograma', 'Examen general de orina (EGO)', 'Examen general de heces', 'Glucosa en ayunas'] },
  { name: 'Perfil niño sano 2', items: ['Hemograma', 'Examen general de orina (EGO)', 'Examen general de heces', 'Tipo y Rh', 'Frotis de sangre periférica', 'Ácido úrico',
    'Proteínas totales y fraccionadas', 'Colesterol total', 'Triglicéridos', 'Creatinina', 'Urea nitrogenada (BUN)', 'Glucosa en ayunas', 'TGO (aspartato)', 'TGP (alanino)',
    'Fosfatasa alcalina', 'Bilirrubinas totales y fraccionadas', 'Calcio'] },
  { name: 'Perfil febril', items: ['Proteína C reactiva', 'Anticuerpos estreptolisina "O" (ASO)', 'Examen general de heces', 'Velocidad de eritrosedimentación',
    'Examen general de orina (EGO)', 'Urocultivo', 'Hemograma', 'Hematozoario (Plasmodium spp.)', 'Antígenos febriles'] },
  { name: 'Perfil menores de 35 años', items: ['Hemograma', 'Velocidad de eritrosedimentación', 'Glucosa en ayunas', 'Ácido úrico', 'Examen general de orina (EGO)',
    'Examen general de heces', 'Tiempo de protrombina (TP)', 'Tiempo de tromboplastina parcial (TPT)', 'TGO (aspartato)', 'TGP (alanino)', 'Triglicéridos',
    'Colesterol total', 'Colesterol LDL', 'Colesterol HDL', 'Creatinina', 'Urea nitrogenada (BUN)'] },
  { name: 'Perfil reumático', items: ['Anti CCP (péptido citrulinado)', 'Hemograma', 'Velocidad de eritrosedimentación', 'Ácido úrico',
    'Anticuerpos estreptolisina "O" (ASO)', 'Proteína C reactiva', 'Factor reumatoideo'] },
  { name: 'Perfil mayores de 35 años', note: 'PSA total: solo en pacientes masculinos', items: ['Hemograma', 'Velocidad de eritrosedimentación', 'Glucosa en ayunas',
    'Glucosa posprandial', 'Ácido úrico', 'Examen general de orina (EGO)', 'Examen general de heces', 'R.P.R.', 'Tiempo de protrombina (TP)',
    'Tiempo de tromboplastina parcial (TPT)', 'Calcio', 'TGO (aspartato)', 'TGP (alanino)', 'Urea nitrogenada (BUN)', 'Creatinina', 'Colesterol total', 'Colesterol LDL',
    'Colesterol HDL', 'Triglicéridos', 'PCR ultrasensible (PCR-us)', 'PSA total', 'TSH'] },
  { name: 'Perfil hormonal mujeres >40', items: ['TSH', 'T3 triyodotironina total', 'T4 tiroxina total', 'LH (hormona luteinizante)', 'FSH (hormona folículo estimulante)',
    'Estradiol', 'Prolactina (PRL)', 'Insulina', 'Progesterona'] },
  { name: 'Perfil bioquímico (metabólico)', items: ['Glucosa en ayunas', 'Calcio', 'Proteínas totales y fraccionadas', 'Sodio (Na)', 'Potasio (K)', 'CO2', 'Cloruro (Cl)',
    'Urea nitrogenada (BUN)', 'Creatinina', 'TGO (aspartato)', 'TGP (alanino)', 'Fosfatasa alcalina', 'Bilirrubinas totales y fraccionadas'] },
  { name: 'Perfil tiroideo 1', items: ['TSH', 'T4 libre'] },
  { name: 'Perfil tiroideo 2', items: ['TSH', 'T3 triyodotironina total', 'T4-Uptake', 'T4 tiroxina total', 'T4 libre', 'Ac. antiperoxidasa (anti-TPO)',
    'Ac. antitiroglobulina (TG)'] },
  { name: 'Perfil preoperatorio (mayores)', items: ['Hemograma', 'Examen general de orina (EGO)', 'Examen general de heces', 'Tipo y Rh', 'Tiempo de protrombina (TP)',
    'Tiempo de tromboplastina parcial (TPT)', 'Tiempo de sangrado', 'Tiempo de coagulación', 'Glucosa en ayunas', 'Urea nitrogenada (BUN)', 'Creatinina',
    'TGO (aspartato)', 'TGP (alanino)', 'Fosfatasa alcalina', 'R.P.R.', 'Anticuerpos VIH 1 y 2, P24'] },
  { name: 'Perfil obstétrico 1', items: ['Hemograma', 'Tipo y Rh', 'Examen general de orina (EGO)', 'Glucosa en ayunas', 'R.P.R.', 'Anticuerpos VIH 1 y 2, P24'] },
  { name: 'Perfil obstétrico 2', items: ['Coombs indirecto', 'Tiempo de protrombina (TP)', 'Tiempo de tromboplastina parcial (TPT)', 'Fibrinógeno', 'Toxo avidez',
    'Anticuerpos antifosfolípidos IgG', 'Anticuerpos antifosfolípidos IgM', 'Hemograma', 'Examen general de orina (EGO)', 'Examen general de heces', 'Glucosa en ayunas',
    'R.P.R.', 'Anticuerpos VIH 1 y 2, P24', 'Tipo y Rh', 'Herpes II IgM, IgG', 'Anticuerpos anticardiolipinas IgG', 'Anticuerpos anticardiolipinas IgM',
    'Anticuerpos rubéola IgG', 'Anticuerpos rubéola IgM', 'Citomegalovirus IgG, IgM', 'Anticuerpos toxoplasmosis IgG', 'Anticuerpos toxoplasmosis IgM'] },
  { name: 'Perfil lipídico', items: ['Colesterol total', 'Colesterol HDL', 'Colesterol LDL', 'Triglicéridos'] },
  { name: 'Perfil diabético', items: ['Hemograma', 'Glucosa en ayunas', 'Hemoglobina glicosilada (HbA1c)', 'Microalbuminuria'] },
  { name: 'Perfil óseo', items: ['PTH (paratohormona)', 'Vitamina D', 'Calcio', 'Fósforo'] },
  { name: 'Perfil COVID-19', items: ['Hemograma', 'Velocidad de eritrosedimentación', 'Ferritina', 'Proteína C reactiva', 'Deshidrogenasa láctica (LDH)', 'TGO (aspartato)',
    'TGP (alanino)'] },
  { name: 'Perfil cardiovascular', items: ['TGP (alanino)', 'TGO (aspartato)', 'CPK (creatin fosfoquinasa)', 'CPK-MB', 'Deshidrogenasa láctica (LDH)', 'NT Pro BNP', 'Hemograma',
    'Glucosa en ayunas', 'Hemoglobina glicosilada (HbA1c)', 'Colesterol total', 'Colesterol HDL', 'Colesterol LDL', 'Triglicéridos', 'Creatinina', 'Urea nitrogenada (BUN)',
    'PCR ultrasensible (PCR-us)'] },
  { name: 'Perfil renal 1', items: ['Cociente albúmina-creatinina en orina', 'Examen general de orina (EGO)', 'Creatinina', 'Urea nitrogenada (BUN)'] },
  { name: 'Perfil renal 2', items: ['Examen general de orina (EGO)', 'Urea nitrogenada (BUN)', 'Creatinina / 24 horas', 'Aclaramiento de creatinina',
    'Proteínas totales / 24 horas', 'Microalbuminuria en 24 horas', 'Sodio (Na)', 'Potasio (K)', 'Cloruro (Cl)', 'Calcio', 'Fósforo', 'CO2'] },
  { name: 'Perfil prostático', items: ['PSA total', 'PSA libre', 'Relación PSA / PSA libre'] },
  { name: 'Perfil hepático', items: ['Deshidrogenasa láctica (LDH)', 'Albúmina', 'Proteínas totales y fraccionadas', 'Tiempo de tromboplastina parcial (TPT)',
    'TGO (aspartato)', 'TGP (alanino)', 'Fosfatasa alcalina', 'Gamma glutamil transpeptidasa (GGT)', 'Tiempo de protrombina (TP)', 'Bilirrubinas totales y fraccionadas'] },
  { name: 'Perfil anemias', items: ['Hemograma', 'Frotis de sangre periférica', 'Ferritina', 'Vitamina B12', 'Ácido fólico', 'Capacidad de captación de hierro'] },
  // CA2 (Anexo C / B6): paquetes que eran casillas y no están en el formulario como perfil. Conservan su nombre (B4). VALIDAR: Emil.
  { name: 'Amilasa y lipasa', items: ['Amilasa', 'Lipasa'] },
  { name: 'Electrolitos', items: ['Sodio (Na)', 'Potasio (K)', 'Cloruro (Cl)'] },
  { name: 'Tiempos de coagulación (TP, TPT, INR)', note: 'El INR se informa con el TP.', items: ['Tiempo de protrombina (TP)', 'Tiempo de tromboplastina parcial (TPT)'] },
]

/**
 * CA2: los paquetes de la lista fija que dejan de ser exámenes (se archivan) y los exámenes que los reemplazan en «Mis
 * sets». «Perfil renal» se reemplaza por lo que contenía en el catálogo (BUN, creatinina y ácido úrico), porque en los
 * perfiles se partió en dos. «Química sanguínea» no está: queda activa hasta que Emil la defina (B7, B8). VALIDAR: Emil.
 */
export const PACKAGE_REPLACEMENTS: Record<string, string[]> = {
  'Perfil lipídico': ['Colesterol total', 'Colesterol HDL', 'Colesterol LDL', 'Triglicéridos'],
  'Perfil hepático': LAB_PROFILES.find((p) => p.name === 'Perfil hepático')!.items,
  'Perfil renal': ['Urea nitrogenada (BUN)', 'Creatinina', 'Ácido úrico'],
  'Electrolitos': ['Sodio (Na)', 'Potasio (K)', 'Cloruro (Cl)'],
  'Amilasa y lipasa': ['Amilasa', 'Lipasa'],
  'Tiempos de coagulación (TP, TPT, INR)': ['Tiempo de protrombina (TP)', 'Tiempo de tromboplastina parcial (TPT)'],
}

/** B7/B8: paquete que se queda como está (contenido por definir); los sets que lo tienen no se tocan y se listan. */
export const PENDING_PACKAGES = ['Química sanguínea']
