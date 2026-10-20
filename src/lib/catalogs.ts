export const SYMPTOMS = [
  'Fiebre', 'Tos seca', 'Tos productiva', 'Dolor de garganta', 'Congestión nasal', 'Cefalea',
  'Mareo', 'Náuseas', 'Vómito', 'Diarrea', 'Dolor abdominal', 'Dolor torácico', 'Disnea',
  'Fatiga', 'Mialgias', 'Artralgias', 'Lumbalgia', 'Erupción cutánea', 'Prurito', 'Disuria',
  'Palpitaciones', 'Insomnio', 'Pérdida de apetito', 'Visión borrosa', 'Otalgia',
]

export const ICD10 = [
  { code: 'J00', label: 'Rinofaringitis aguda (resfriado común)' },
  { code: 'J02.9', label: 'Faringitis aguda, no especificada' },
  { code: 'J03.9', label: 'Amigdalitis aguda, no especificada' },
  { code: 'J20.9', label: 'Bronquitis aguda, no especificada' },
  { code: 'J45.9', label: 'Asma, no especificada' },
  { code: 'A09', label: 'Diarrea y gastroenteritis de presunto origen infeccioso' },
  { code: 'K29.7', label: 'Gastritis, no especificada' },
  { code: 'K21.9', label: 'Enfermedad por reflujo gastroesofágico' },
  { code: 'I10', label: 'Hipertensión esencial (primaria)' },
  { code: 'E11.9', label: 'Diabetes mellitus tipo 2 sin complicaciones' },
  { code: 'E78.5', label: 'Hiperlipidemia, no especificada' },
  { code: 'N39.0', label: 'Infección de vías urinarias, sitio no especificado' },
  { code: 'M54.5', label: 'Lumbago no especificado' },
  { code: 'G43.9', label: 'Migraña, no especificada' },
  { code: 'L30.9', label: 'Dermatitis, no especificada' },
  { code: 'H66.9', label: 'Otitis media, no especificada' },
  { code: 'F41.1', label: 'Trastorno de ansiedad generalizada' },
  { code: 'Z00.0', label: 'Examen médico general' },
  { code: 'O26.9', label: 'Control prenatal, afección no especificada' },
  { code: 'R51', label: 'Cefalea' },
  { code: 'K35.8', label: 'Apendicitis aguda, otra y la no especificada' },
  { code: 'K81.0', label: 'Colecistitis aguda' },
  { code: 'K80.2', label: 'Cálculo de la vesícula biliar sin colecistitis' },
  { code: 'J18.9', label: 'Neumonía, no especificada' },
  { code: 'J44.1', label: 'EPOC con exacerbación aguda' },
  { code: 'I16.9', label: 'Crisis hipertensiva, no especificada' },
  { code: 'E11.6', label: 'Diabetes mellitus tipo 2 con otras complicaciones especificadas' },
  { code: 'N18.9', label: 'Enfermedad renal crónica, no especificada' },
  { code: 'E03.9', label: 'Hipotiroidismo, no especificado' },
  { code: 'E05.9', label: 'Tirotoxicosis, no especificada' },
  { code: 'K40.9', label: 'Hernia inguinal unilateral, sin obstrucción ni gangrena' },
  { code: 'R10.4', label: 'Otros dolores abdominales y los no especificados' },
]

/** Vademécum reducido. `group` permite cruzar contra alergias del paciente. */
export const DRUGS = [
  { name: 'Paracetamol', presentation: 'Tableta 500 mg', group: 'analgésico' },
  { name: 'Ibuprofeno', presentation: 'Tableta 400 mg', group: 'aine' },
  { name: 'Naproxeno', presentation: 'Tableta 550 mg', group: 'aine' },
  { name: 'Diclofenaco', presentation: 'Tableta 50 mg', group: 'aine' },
  { name: 'Amoxicilina', presentation: 'Cápsula 500 mg', group: 'penicilina' },
  { name: 'Amoxicilina / Ácido clavulánico', presentation: 'Tableta 875/125 mg', group: 'penicilina' },
  { name: 'Azitromicina', presentation: 'Tableta 500 mg', group: 'macrólido' },
  { name: 'Ciprofloxacino', presentation: 'Tableta 500 mg', group: 'quinolona' },
  { name: 'Nitrofurantoína', presentation: 'Cápsula 100 mg', group: 'antibiótico' },
  { name: 'Cefalexina', presentation: 'Cápsula 500 mg', group: 'cefalosporina' },
  { name: 'Loratadina', presentation: 'Tableta 10 mg', group: 'antihistamínico' },
  { name: 'Cetirizina', presentation: 'Tableta 10 mg', group: 'antihistamínico' },
  { name: 'Omeprazol', presentation: 'Cápsula 20 mg', group: 'ibp' },
  { name: 'Metformina', presentation: 'Tableta 850 mg', group: 'antidiabético' },
  { name: 'Losartán', presentation: 'Tableta 50 mg', group: 'antihipertensivo' },
  { name: 'Amlodipino', presentation: 'Tableta 5 mg', group: 'antihipertensivo' },
  { name: 'Atorvastatina', presentation: 'Tableta 20 mg', group: 'estatina' },
  { name: 'Salbutamol', presentation: 'Inhalador 100 mcg/dosis', group: 'broncodilatador' },
  { name: 'Ácido fólico', presentation: 'Tableta 5 mg', group: 'vitamina' },
  { name: 'Sulfato ferroso', presentation: 'Tableta 200 mg', group: 'hierro' },
  { name: 'Ambroxol', presentation: 'Jarabe 30 mg/5 ml', group: 'mucolítico' },
  { name: 'Metamizol', presentation: 'Tableta 500 mg', group: 'pirazolona' },
  // Uso hospitalario
  { name: 'Acetaminofén', presentation: 'Frasco 1 g/100 ml', group: 'analgésico' },
  { name: 'Ondansetrón', presentation: 'Ampolla 8 mg/4 ml', group: 'antiemético' },
  { name: 'Metoclopramida', presentation: 'Ampolla 10 mg/2 ml', group: 'antiemético' },
  { name: 'Tramadol', presentation: 'Ampolla 50 mg/ml', group: 'opioide' },
  { name: 'Ketorolaco', presentation: 'Ampolla 30 mg/ml', group: 'aine' },
  { name: 'Ceftriaxona', presentation: 'Vial 1 g', group: 'cefalosporina' },
  { name: 'Cefazolina', presentation: 'Vial 1 g', group: 'cefalosporina' },
  { name: 'Omeprazol IV', presentation: 'Vial 40 mg', group: 'ibp' },
  { name: 'Enoxaparina', presentation: 'Jeringa 40 mg/0,4 ml', group: 'anticoagulante' },
  { name: 'Solución salina 0,9 %', presentation: 'Bolsa 1000 ml', group: 'solución' },
  { name: 'Lactato de Ringer', presentation: 'Bolsa 1000 ml', group: 'solución' },
  { name: 'Insulina cristalina', presentation: 'Vial 100 UI/ml', group: 'insulina' },
]

/** Relaciona el texto libre de alergias con grupos farmacológicos. */
export const ALLERGY_GROUPS: Record<string, string[]> = {
  penicilina: ['penicilina'],
  aines: ['aine'],
  sulfas: ['sulfonamida'],
  'dipirona': ['pirazolona'],
  metamizol: ['pirazolona'],
  quinolonas: ['quinolona'],
  cefalosporinas: ['cefalosporina'],
}

export function allergyConflict(allergies: string[], drugName: string): string | null {
  const drug = DRUGS.find((d) => d.name === drugName)
  if (!drug) return null
  for (const a of allergies) {
    const groups = ALLERGY_GROUPS[a.toLowerCase()] ?? [a.toLowerCase()]
    if (groups.includes(drug.group) || drug.name.toLowerCase().includes(a.toLowerCase())) return a
  }
  return null
}

export const FREQUENCIES = ['Cada 4 horas', 'Cada 6 horas', 'Cada 8 horas', 'Cada 12 horas', 'Cada 24 horas', 'Dosis única', 'Según necesidad']
