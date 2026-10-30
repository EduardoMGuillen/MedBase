import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import type { Row, Sql } from './sql.js'
import { DEMO_PASSWORD, textPdf } from './db.js'
import { giveDoses, naive, openStay, plusMin, signedSheet, signVisit, type Visit } from './demoScenarios.js'
import { ensureHospitalAuthorization } from './authorizations.js'
import { createEpicrisisDraft } from './epicrisis.js'
import { medicationOrder } from '../src/lib/format.js'
import { scheduleFromWeek, slotsOn, weekOf, type Week } from '../src/lib/schedule.js'
import type { Diagnosis, PrescriptionItem, Schedule } from '../src/lib/types.js'

/**
 * DM1: datos de demostración relativos a hoy (30 días atrás y 60 adelante), para que cualquier día de la semana,
 * incluido el domingo, haya citas, sala de espera, preclínicas, consultas, observados y hospitalizados.
 *
 * Sólo trabaja sobre las clínicas marcadas con `clinics.is_demo` (Clínica Santa Brígida y Consultorio Dra. Ana López).
 * Antes de borrar guarda un respaldo de todo lo que va a quitar (tabla `demo_backups`). Borra únicamente los pacientes
 * de esas clínicas y lo que cuelga de ellos; no toca usuarios, configuración, camas, servicios, horarios ni catálogos.
 * Es idempotente: correrlo dos veces deja lo mismo (borra lo anterior y vuelve a generar con la misma semilla).
 *
 * Todos los nombres, identidades y teléfonos son inventados al combinar listas; no corresponden a personas reales.
 */

const HOUR = 3_600_000
const MAIN = 'c-sb'
export const FUNEZ = { id: 's-funez', name: 'Dr. Daniel Fúnez Castillo', email: 'dfunez@demo.clinara', license: 'CMH-10457', specialty: 'Medicina general' }

/** Generador pseudoaleatorio con semilla: el mismo día da los mismos datos. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
type Rand = ReturnType<typeof rng>
const pick = <T>(r: Rand, xs: readonly T[]) => xs[Math.floor(r() * xs.length)]
const int = (r: Rand, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1))
const pad = (n: number, w = 2) => String(n).padStart(w, '0')
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const dayAt = (now: Date, offset: number, hhmm = '00:00') => { const d = new Date(now); d.setDate(d.getDate() + offset); d.setHours(Number(hhmm.slice(0, 2)), Number(hhmm.slice(3, 5)), 0, 0); return d }
const hoursAgo = (now: Date, h: number) => { const d = new Date(now.getTime() - h * HOUR); d.setSeconds(0, 0); d.setMinutes(Math.floor(d.getMinutes() / 5) * 5); return d }

async function insertRows(q: Sql, table: string, columns: string[], rows: unknown[][]) {
  const per = Math.max(1, Math.floor(1000 / columns.length))
  for (let i = 0; i < rows.length; i += per) {
    const chunk = rows.slice(i, i + per)
    await q.run(`INSERT INTO ${table} (${columns.join(',')}) VALUES ${chunk.map(() => `(${columns.map(() => '?').join(',')})`).join(',')}`, chunk.flat())
  }
}

// ---------- Personas ficticias ----------

const NAMES_F = ['María José', 'Ana Gabriela', 'Karla Patricia', 'Lourdes Elena', 'Dania Marisol', 'Sandra Yamileth', 'Iris Carolina', 'Fátima Alejandra', 'Gloria Esperanza', 'Wendy Suyapa',
  'Cinthia Maribel', 'Paola Andrea', 'Rosa Amalia', 'Xiomara Isabel', 'Nancy Lorena', 'Belkis Johana', 'Ingrid Melissa', 'Yesenia Lizeth', 'Delmy Waleska', 'Gissela Nohemí',
  'Merary Abigail', 'Olga Marina', 'Telma Argentina', 'Norma Leticia', 'Evelyn Saraí', 'Keyla Michelle', 'Dilcia Margarita', 'Reina Isabel', 'Ruth Noemí', 'Angie Daniela']
const NAMES_M = ['José Luis', 'Carlos Roberto', 'Mario Alberto', 'Óscar Danilo', 'Kevin Josué', 'Marvin Geovany', 'Nelson Omar', 'Wilmer Antonio', 'Edwin Rolando', 'Javier Enrique',
  'Héctor Manuel', 'Luis Fernando', 'Selvin Adonay', 'Denis Arnaldo', 'Juan Pablo', 'Allan Gustavo', 'Ronald Eduardo', 'Cristian Joel', 'Elvin Francisco', 'Walter Ismael',
  'Rigoberto', 'Franklin Ariel', 'Darwin Alexander', 'Jorge Arturo', 'Lester Osmín', 'Fredy Alexis', 'Bayron Isaí', 'Ángel David', 'Osman Rafael', 'Nery Josué']
const LASTS = ['Martínez', 'López', 'Hernández', 'Flores', 'Zelaya', 'Aguilar', 'Rodríguez', 'Mejía', 'Cruz', 'Ramos', 'Ortiz', 'Murillo', 'Espinoza', 'Valladares', 'Canales',
  'Bonilla', 'Sosa', 'Maradiaga', 'Banegas', 'Euceda', 'Matamoros', 'Cáceres', 'Turcios', 'Discua', 'Ordóñez', 'Pineda', 'Midence', 'Rivera', 'Amador', 'Castellanos',
  'Lagos', 'Funes', 'Padilla', 'Andino', 'Barahona', 'Velásquez', 'Irías', 'Reyes', 'Ponce', 'Galeas', 'Mendoza', 'Alvarado', 'Lanza', 'Ávila', 'Carías']
const TGU = ['Col. Kennedy', 'Col. Palmira', 'Res. Plaza', 'Col. Miraflores', 'Col. Las Colinas', 'Col. El Hogar', 'Col. Tepeyac', 'Barrio La Hoya', 'Col. Los Robles', 'Res. El Trapiche',
  'Col. Hato de Enmedio', 'Col. Villa Olímpica', 'Col. San Ignacio', 'Col. Lomas del Mayab', 'Col. Alameda', 'Col. Torocagua', 'Col. Cerro Grande', 'Col. Loarque', 'Barrio Abajo', 'Col. Florencia Norte']
const SPS = ['Col. Trejo', 'Col. Jardines del Valle', 'Barrio Guamilito', 'Col. Los Andes', 'Res. Villas del Sol', 'Col. Satélite', 'Barrio Río de Piedras', 'Col. Universidad', 'Col. Rivera Hernández', 'Col. Moderna']
const OCCUPATIONS = ['Comerciante', 'Docente', 'Contador', 'Ama de casa', 'Estudiante', 'Albañil', 'Enfermera', 'Motorista', 'Secretaria', 'Ingeniero civil', 'Agricultor', 'Mecánico', 'Cajera', 'Abogado', 'Jubilado']
const ALLERGIES = [['Penicilina'], ['Sulfas'], ['AINES'], ['Ibuprofeno'], ['Látex'], ['Penicilina', 'Mariscos'], ['Metamizol']]

type Kind = 'child' | 'teen' | 'adult' | 'older' | 'pregnant'
type Chronic = 'hta' | 'dm2' | 'hipo' | 'asma' | 'dislip' | 'epoc'
const CHRONIC: Record<Chronic, { condition: string; dx: Diagnosis; title: string; every: number; drug: PrescriptionItem }> = {
  hta: { condition: 'Hipertensión arterial', dx: { code: 'BA00', label: 'Hipertensión esencial', system: 'icd11' }, title: 'Control de hipertensión arterial', every: 30,
    drug: { drug: 'Losartán', presentation: 'Tableta 50 mg', dose: '1 tableta', route: 'Oral', frequency: 'Cada 12 horas', duration: '30 días' } },
  dm2: { condition: 'Diabetes mellitus tipo 2', dx: { code: '5A11', label: 'Diabetes mellitus tipo 2', system: 'icd11' }, title: 'Control de diabetes (HbA1c y glucosa)', every: 90,
    drug: { drug: 'Metformina', presentation: 'Tableta 850 mg', dose: '1 tableta', route: 'Oral', frequency: 'Cada 12 horas', duration: '30 días', instructions: 'Con los alimentos.' } },
  hipo: { condition: 'Hipotiroidismo', dx: { code: '5A00', label: 'Hipotiroidismo', system: 'icd11' }, title: 'Control de TSH', every: 90,
    drug: { drug: 'Levotiroxina', presentation: 'Tableta 100 mcg', dose: '1 tableta', route: 'Oral', frequency: 'Cada 24 horas', duration: '30 días', instructions: 'En ayunas.' } },
  asma: { condition: 'Asma', dx: { code: 'CA23', label: 'Asma', system: 'icd11' }, title: 'Control de asma', every: 60,
    drug: { drug: 'Salbutamol', presentation: 'Inhalador 100 mcg/dosis', dose: '2 inhalaciones', route: 'Inhalada', frequency: 'Por razón necesaria (PRN)', duration: '30 días' } },
  dislip: { condition: 'Dislipidemia', dx: { code: '5C80', label: 'Hipercolesterolemia', system: 'icd11' }, title: 'Perfil lipídico de control', every: 90,
    drug: { drug: 'Atorvastatina', presentation: 'Tableta 20 mg', dose: '1 tableta', route: 'Oral', frequency: 'Cada 24 horas', duration: '30 días', instructions: 'En la noche.' } },
  epoc: { condition: 'EPOC', dx: { code: 'CA22', label: 'Enfermedad pulmonar obstructiva crónica', system: 'icd11' }, title: 'Control de EPOC y espirometría', every: 90,
    drug: { drug: 'Bromuro de ipratropio', presentation: 'Inhalador 20 mcg/dosis', dose: '2 inhalaciones', route: 'Inhalada', frequency: 'Cada 8 horas', duration: '30 días' } },
}

interface Person {
  id: string; clinicId: string; first: string; last: string; birth: string; sex: 'F' | 'M'; kind: Kind; age: number; phone: string; dni?: string; address: string
  allergies: string[]; chronic: Chronic[]; occupation?: string; civil?: string; guardian?: string; weeks?: number; created: string
}

function phone(r: Rand) { return `${pick(r, ['3', '8', '9'])}${int(r, 100, 999)}-${int(r, 1000, 9999)}` }

function makePeople(r: Rand, clinicId: string, n: number, now: Date, prefix: string): Person[] {
  const out: Person[] = []
  const seen = new Set<string>()
  for (let i = 0; i < n; i++) {
    const roll = r()
    const kind: Kind = roll < 0.18 ? 'child' : roll < 0.26 ? 'teen' : roll < 0.33 ? 'pregnant' : roll < 0.8 ? 'adult' : 'older'
    const sex: 'F' | 'M' = kind === 'pregnant' ? 'F' : r() < 0.55 ? 'F' : 'M'
    const age = kind === 'child' ? int(r, 0, 11) : kind === 'teen' ? int(r, 12, 17) : kind === 'pregnant' ? int(r, 19, 38) : kind === 'adult' ? int(r, 18, 64) : int(r, 65, 88)
    let first = pick(r, sex === 'F' ? NAMES_F : NAMES_M)
    let last = `${pick(r, LASTS)} ${pick(r, LASTS)}`
    while (seen.has(`${first} ${last}`)) { first = pick(r, sex === 'F' ? NAMES_F : NAMES_M); last = `${pick(r, LASTS)} ${pick(r, LASTS)}` }
    seen.add(`${first} ${last}`)
    const year = now.getFullYear() - age - (r() < 0.5 ? 1 : 0)
    const birth = `${year}-${pad(int(r, 1, 12))}-${pad(int(r, 1, 28))}`
    const sps = r() < 0.25
    const chronic: Chronic[] = []
    if (kind === 'older' || (kind === 'adult' && age > 40)) {
      if (r() < 0.5) chronic.push('hta')
      if (r() < 0.35) chronic.push('dm2')
      if (r() < 0.15) chronic.push(sex === 'F' ? 'hipo' : 'dislip')
      if (kind === 'older' && r() < 0.15) chronic.push('epoc')
    } else if ((kind === 'adult' || kind === 'teen' || kind === 'child') && r() < 0.1) chronic.push('asma')
    out.push({
      id: `${prefix}${pad(i + 1, 3)}`, clinicId, first, last, birth, sex, kind, age, phone: phone(r),
      // Identidad ficticia con el año de nacimiento: 0801-AAAA-XXXXX (los menores no la tienen; firma quien los acompaña)
      dni: age >= 18 ? `0801-${year}-${pad(int(r, 1, 99999), 5)}` : undefined,
      address: sps ? `San Pedro Sula, ${pick(r, SPS)}` : `Tegucigalpa, ${pick(r, TGU)}`,
      allergies: r() < 0.15 ? pick(r, ALLERGIES) : [], chronic,
      occupation: age >= 18 ? pick(r, OCCUPATIONS) : age >= 6 ? 'Estudiante' : undefined,
      civil: age >= 18 ? pick(r, ['Soltero(a)', 'Casado(a)', 'Unión libre', 'Casado(a)']) : undefined,
      guardian: age < 18 ? `${pick(r, NAMES_F)} ${last.split(' ')[0]} ${pick(r, LASTS)}` : undefined,
      weeks: kind === 'pregnant' ? int(r, 8, 36) : undefined,
      created: dayAt(now, -int(r, 40, 900), '09:00').toISOString(),
    })
  }
  return out
}

// ---------- Casos de consulta externa (clínicamente coherentes) ----------

interface Case {
  reason: string; complaint: string; history: string; exam: string; dx: Diagnosis[]; indications: string[]; items: PrescriptionItem[]
  vit?: Partial<{ sys: number; dia: number; hr: number; rr: number; temp: number; spo2: number; glucose: number }>
  exams?: { group: 'lab' | 'imaging'; name: string; values?: [string, string, string, number?, number?][] }[]
}
const icd = (code: string, label: string): Diagnosis => ({ code, label, system: 'icd11' })
const ADULT_CASES: Case[] = [
  { reason: 'Dolor de garganta y fiebre', complaint: 'Dolor de garganta desde hace 2 días', history: 'Odinofagia de 2 días con fiebre no cuantificada y malestar general. Sin tos.',
    exam: 'Orofaringe: Amígdalas hipertróficas, eritematosas, con exudado blanquecino.\nCuello: Adenopatías cervicales anteriores dolorosas.', dx: [icd('CA03', 'Amigdalitis aguda')],
    indications: ['Abundantes líquidos.', 'Gárgaras con agua tibia y sal cada 8 horas.'], vit: { temp: 38.3, hr: 96 },
    items: [{ drug: 'Amoxicilina', presentation: 'Cápsula 500 mg', dose: '1 cápsula', route: 'Oral', frequency: 'Cada 8 horas', duration: '10 días' },
      { drug: 'Acetaminofén', presentation: 'Tableta 500 mg', dose: '1 g', route: 'Oral', frequency: 'Cada 8 horas', duration: '3 días', instructions: 'Si dolor o fiebre.' }] },
  { reason: 'Ardor al orinar', complaint: 'Ardor y ganas frecuentes de orinar', history: 'Disuria, polaquiuria y urgencia urinaria de 3 días. Niega fiebre y dolor lumbar.',
    exam: 'Abdomen: Dolor leve en hipogastrio. Puño percusión lumbar negativa bilateral.', dx: [icd('GC08.Z', 'Infección de las vías urinarias, sitio no especificado')],
    indications: ['Tomar 2 litros de agua al día.', 'Regresar si hay fiebre o dolor en la espalda.'],
    items: [{ drug: 'Nitrofurantoína', presentation: 'Cápsula 100 mg', dose: '1 cápsula', route: 'Oral', frequency: 'Cada 12 horas', duration: '5 días' }],
    exams: [{ group: 'lab', name: 'Examen general de orina (EGO)', values: [['Leucocitos', '25-30', '/campo'], ['Nitritos', 'Positivo', ''], ['Bacterias', 'Abundantes', '']] }] },
  { reason: 'Dolor de estómago', complaint: 'Ardor en la boca del estómago', history: 'Epigastralgia urente de 2 semanas que empeora con el ayuno y con comidas condimentadas. Sin vómitos ni melena.',
    exam: 'Abdomen: Blando, dolor leve a la palpación en epigastrio, sin signos de irritación peritoneal.', dx: [icd('DA42.Z', 'Gastritis, sin especificación')],
    indications: ['Comidas pequeñas y frecuentes.', 'Evitar café, picante, alcohol y AINES.'],
    items: [{ drug: 'Omeprazol', presentation: 'Cápsula 20 mg', dose: '1 cápsula', route: 'Oral', frequency: 'Cada 24 horas', duration: '30 días', instructions: 'En ayunas, 30 minutos antes del desayuno.' }] },
  { reason: 'Dolor de espalda', complaint: 'Dolor en la parte baja de la espalda', history: 'Lumbalgia mecánica de 4 días después de cargar peso, sin irradiación ni alteraciones de la sensibilidad.',
    exam: 'Columna: Contractura paravertebral lumbar, Lasègue negativo bilateral, fuerza y reflejos conservados.', dx: [icd('ME84.2', 'Dolor lumbar')],
    indications: ['Calor local 20 minutos cada 8 horas.', 'Evitar cargar peso por una semana.'], vit: { sys: 128, dia: 80 },
    items: [{ drug: 'Naproxeno', presentation: 'Tableta 550 mg', dose: '1 tableta', route: 'Oral', frequency: 'Cada 12 horas', duration: '5 días', instructions: 'Con alimentos.' },
      { drug: 'Orfenadrina', presentation: 'Tableta 100 mg', dose: '1 tableta', route: 'Oral', frequency: 'Cada 12 horas', duration: '5 días' }] },
  { reason: 'Dolor de cabeza', complaint: 'Dolor de cabeza en las tardes', history: 'Cefalea opresiva bilateral vespertina de una semana, relacionada con estrés laboral. Sin signos de alarma.',
    exam: 'Neurológico: Sin déficit focal, pares craneales normales, fondo de ojo sin papiledema.', dx: [icd('8A81', 'Cefalea de tipo tensional')],
    indications: ['Higiene del sueño.', 'Pausas activas en el trabajo.'],
    items: [{ drug: 'Acetaminofén', presentation: 'Tableta 500 mg', dose: '1 g', route: 'Oral', frequency: 'Cada 8 horas', duration: '3 días', instructions: 'Sólo si dolor.' }] },
  { reason: 'Resfriado y tos', complaint: 'Congestión nasal y tos seca', history: 'Rinorrea hialina, estornudos y tos seca de 3 días. Febrícula el primer día.',
    exam: 'Nariz: Mucosa congestiva.\nTórax: Murmullo vesicular normal, sin estertores.', dx: [icd('CA00', 'Rinofaringitis aguda')], vit: { temp: 37.4 },
    indications: ['Lavados nasales con solución salina.', 'Abundantes líquidos.'],
    items: [{ drug: 'Loratadina', presentation: 'Tableta 10 mg', dose: '1 tableta', route: 'Oral', frequency: 'Cada 24 horas', duration: '5 días' }] },
  { reason: 'Chequeo general', complaint: 'Viene a chequeo anual', history: 'Asintomático. Solicita evaluación general y exámenes de rutina.',
    exam: 'Sin hallazgos patológicos.', dx: [icd('QA00.0', 'Examen médico general')], indications: ['Actividad física 30 minutos al día.', 'Dieta baja en sal y azúcar.'], items: [],
    exams: [{ group: 'lab', name: 'Hemograma', values: [['Hemoglobina', '14.1', 'g/dL', 12, 16], ['Leucocitos', '7 200', '/mm³', 4500, 11000]] },
      { group: 'lab', name: 'Glucosa en ayunas', values: [['Glucosa', '92', 'mg/dL', 70, 100]] }] },
]
const CHRONIC_CASE = (c: Chronic): Case => {
  const x = CHRONIC[c]
  return {
    reason: x.title.replace(' (HbA1c y glucosa)', ''), complaint: `Control de ${x.condition.toLowerCase()}`, history: `Paciente con ${x.condition.toLowerCase()} en tratamiento. Refiere buen apego; sin síntomas nuevos.`,
    exam: c === 'asma' || c === 'epoc' ? 'Tórax: Murmullo vesicular disminuido leve, sin sibilancias al momento.' : 'Cardiopulmonar: Ruidos cardíacos rítmicos, campos pulmonares limpios.',
    dx: [x.dx], indications: ['Continuar el tratamiento sin suspenderlo.', 'Traer el registro de controles a la próxima cita.'], items: [x.drug],
    vit: c === 'hta' ? { sys: 142, dia: 88 } : c === 'dm2' ? { glucose: 168 } : c === 'epoc' ? { spo2: 93, rr: 20 } : {},
    exams: c === 'dm2' ? [{ group: 'lab', name: 'Hemoglobina glicosilada (HbA1c)', values: [['HbA1c', '7.4', '%', 4, 5.6]] }] : c === 'hipo' ? [{ group: 'lab', name: 'TSH', values: [['TSH', '3.1', 'µUI/mL', 0.4, 4]] }] : undefined,
  }
}
const CHILD_CASES: Case[] = [
  { reason: 'Fiebre y tos', complaint: 'Fiebre y tos desde ayer', history: 'Fiebre de 38.5 °C y tos húmeda de 2 días, come menos. Sin dificultad para respirar.',
    exam: 'Tórax: Roncus transmitidos, sin tiraje ni estertores. Orofaringe hiperémica.', dx: [icd('CA00', 'Rinofaringitis aguda')], vit: { temp: 38.2, hr: 124, rr: 28 },
    indications: ['Lavados nasales con solución salina.', 'Ofrecer líquidos con frecuencia.', 'Volver si respira rápido o no come.'],
    items: [{ drug: 'Acetaminofén', presentation: 'Jarabe 160 mg/5 mL', dose: '5 mL', route: 'Oral', frequency: 'Cada 6 horas', duration: '3 días', instructions: 'Si fiebre.' }] },
  { reason: 'Diarrea', complaint: 'Evacuaciones líquidas', history: 'Cinco evacuaciones líquidas al día por 2 días, sin sangre. Tolera la vía oral.',
    exam: 'Abdomen: Ruidos aumentados, blando. Mucosas húmedas, llenado capilar menor de 2 segundos.', dx: [icd('1A40.Z', 'Gastroenteritis o colitis infecciosa sin especificación del agente infeccioso')],
    indications: ['Suero oral después de cada evacuación.', 'Continuar la alimentación habitual.'],
    items: [{ drug: 'Sales de rehidratación oral', presentation: 'Sobre 20.5 g', dose: '1 sobre en 1 litro de agua', route: 'Oral', frequency: 'Por razón necesaria (PRN)', duration: '3 días' },
      { drug: 'Zinc', presentation: 'Jarabe 20 mg/5 mL', dose: '5 mL', route: 'Oral', frequency: 'Cada 24 horas', duration: '10 días' }] },
  { reason: 'Dolor de oído', complaint: 'Llora y se toca el oído', history: 'Otalgia derecha de un día con fiebre de 38 °C después de un resfriado.',
    exam: 'Otoscopia: Membrana timpánica derecha abombada e hiperémica.', dx: [icd('AB00', 'Otitis media aguda')], vit: { temp: 38.1 },
    indications: ['No introducir objetos en el oído.'],
    items: [{ drug: 'Amoxicilina', presentation: 'Suspensión 250 mg/5 mL', dose: '7.5 mL', route: 'Oral', frequency: 'Cada 8 horas', duration: '7 días' }] },
  { reason: 'Control de niño sano', complaint: 'Control de crecimiento y desarrollo', history: 'Asintomático. Esquema de vacunas al día. Buen desarrollo psicomotor.',
    exam: 'Peso y talla en percentil 50. Sin hallazgos patológicos.', dx: [icd('QA00.1', 'Examen de rutina de la salud del niño')],
    indications: ['Continuar lactancia o alimentación complementaria según la edad.', 'Próxima vacuna según el esquema.'], items: [] },
]
const PREGNANT_CASE = (w: number): Case => ({
  reason: 'Control prenatal', complaint: `Control prenatal, ${w} semanas`, history: `Embarazo de ${w} semanas por fecha de última regla, sin sangrado ni pérdida de líquido. Movimientos fetales presentes${w > 20 ? '' : ' (aún no los percibe)'}.`,
  exam: `Altura uterina acorde a la edad gestacional.${w > 20 ? ' Frecuencia cardíaca fetal de 144 lpm.' : ''} Sin edema.`, dx: [icd('JA60', 'Supervisión de embarazo normal')], vit: { sys: 108, dia: 68 },
  indications: ['Signos de alarma: sangrado, dolor de cabeza intenso, visión borrosa, pérdida de líquido.', 'Dieta balanceada.'],
  items: [{ drug: 'Ácido fólico + hierro', presentation: 'Tableta', dose: '1 tableta', route: 'Oral', frequency: 'Cada 24 horas', duration: '30 días' }],
  exams: w < 14 ? [{ group: 'lab', name: 'Hemograma', values: [['Hemoglobina', '11.8', 'g/dL', 11, 15]] }, { group: 'imaging', name: 'Ultrasonido obstétrico' }] : undefined,
})
const GYN_CASES: Case[] = [
  { reason: 'Flujo vaginal', complaint: 'Flujo con mal olor', history: 'Flujo vaginal grisáceo con olor fétido de una semana, sin prurito.', exam: 'Especuloscopía: Flujo homogéneo grisáceo, cérvix sin lesiones.',
    dx: [icd('GA02.0', 'Vaginitis aguda')], indications: ['Evitar duchas vaginales.'],
    items: [{ drug: 'Metronidazol', presentation: 'Tableta 500 mg', dose: '1 tableta', route: 'Oral', frequency: 'Cada 12 horas', duration: '7 días', instructions: 'No tomar alcohol.' }] },
  { reason: 'Citología de control', complaint: 'Viene por su citología anual', history: 'Asintomática. Última citología hace un año, normal.', exam: 'Especuloscopía: Cérvix sano. Se toma muestra para citología.',
    dx: [icd('QA00.0', 'Examen médico general')], indications: ['Recoger el resultado en 2 semanas.'], items: [] },
]

function vitalsFor(r: Rand, age: number, c: Case) {
  const kid = age < 12
  const v = c.vit ?? {}
  const weight = kid ? Math.round((3.5 + age * 2.6 + r() * 2) * 10) / 10 : Math.round(52 + r() * 40)
  const height = kid ? Math.round(52 + age * 6.5 + r() * 4) : Math.round(150 + r() * 30)
  return {
    systolic: kid ? null : v.sys ?? int(r, 108, 132), diastolic: kid ? null : v.dia ?? int(r, 68, 84), heartRate: v.hr ?? (kid ? int(r, 90, 120) : int(r, 64, 88)),
    respRate: v.rr ?? (kid ? int(r, 20, 28) : int(r, 14, 18)), temperature: v.temp ?? Math.round((36.4 + r() * 0.6) * 10) / 10, spo2: v.spo2 ?? int(r, 96, 99),
    weightKg: weight, heightCm: height, glucose: v.glucose ?? null,
  }
}

// ---------- Respaldo y borrado ----------

/** Tablas con datos de pacientes, en el orden en que se pueden borrar (lo que depende de otra va antes). */
const PATIENT_TABLES = ['exam_events', 'exam_orders', 'addenda', 'note_drafts', 'epicrises', 'referrals', 'authorizations', 'order_marks', 'hosp_doses', 'hosp_meds', 'hosp_procedures',
  'hosp_notes', 'order_set_uses', 'certificates', 'payment_installments', 'payments', 'prescriptions', 'followups', 'attachments', 'hospitalizations', 'consultations', 'vitals',
  'appointments', 'patients'] as const
/** Tablas que no se pueden borrar por sus reglas de sólo agregar: se apaga la regla dentro de la transacción. */
const APPEND_ONLY: [string, string][] = [['order_marks', 'order_marks_no_change'], ['addenda', 'addenda_no_change'], ['exam_events', 'exam_events_no_change']]

/** Respaldo de todo lo que se va a borrar, en JSON (se guarda en `demo_backups`; se conservan los 3 últimos). */
export async function backupDemo(q: Sql, clinicIds: string[]) {
  const marks = clinicIds.map(() => '?').join(',')
  const data: Record<string, unknown> = {}
  for (const t of PATIENT_TABLES) {
    const where = t === 'order_set_uses' ? `clinic_id IN (${marks}) AND patient_id IS NOT NULL` : `clinic_id IN (${marks})`
    const r = await q.one<{ rows: unknown }>(`SELECT COALESCE(json_agg(t), '[]'::json)::text AS rows FROM ${t} t WHERE ${where}`, clinicIds)
    data[t] = JSON.parse(String(r?.rows ?? '[]'))
  }
  const json = JSON.stringify({ at: new Date().toISOString(), clinics: clinicIds, data })
  await q.run('INSERT INTO demo_backups (id, created_at, clinic_ids, data) VALUES (?,?,?,?)', [randomUUID(), new Date().toISOString(), clinicIds.join(','), json])
  await q.run(`DELETE FROM demo_backups WHERE id NOT IN (SELECT id FROM demo_backups ORDER BY created_at DESC LIMIT 3)`)
  return json
}

async function wipeDemoPatients(q: Sql, clinicIds: string[]) {
  const marks = clinicIds.map(() => '?').join(',')
  // Consultas y notas firmadas son inmutables: el borrado de la demo es la única excepción (AN1)
  await q.run(`SELECT set_config('clinara.note_maintenance', 'on', true)`)
  for (const [t, trg] of APPEND_ONLY) await q.exec(`ALTER TABLE ${t} DISABLE TRIGGER ${trg}`)
  for (const t of PATIENT_TABLES) {
    await q.run(`DELETE FROM ${t} WHERE clinic_id IN (${marks})${t === 'order_set_uses' ? ' AND patient_id IS NOT NULL' : ''}`, clinicIds)
  }
  for (const [t, trg] of APPEND_ONLY) await q.exec(`ALTER TABLE ${t} ENABLE TRIGGER ${trg}`)
}

// ---------- Personal y horarios ----------

/** Dr. Daniel Fúnez (Medicina general) y horario de fin de semana para los médicos demo que no lo tienen. */
async function ensureDemoStaff(q: Sql, clinicIds: string[]) {
  if (clinicIds.includes(MAIN) && !(await q.one('SELECT 1 FROM staff WHERE lower(email) = ?', [FUNEZ.email]))) {
    const week: Week = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, d === 0 || d === 6 ? [{ start: '08:00', end: '14:00' }] : [{ start: '07:00', end: '12:00' }, { start: '13:00', end: '16:00' }]]))
    const svc = await q.one(`SELECT id FROM services WHERE clinic_id = ? AND id = 'svc-gen'`, [MAIN]) ?? await q.one(`SELECT id FROM services WHERE clinic_id = ? AND active ORDER BY name LIMIT 1`, [MAIN])
    await q.run(`INSERT INTO staff (id, name, role, roles, specialty, email, license, color, active, password_hash, schedule, service_id, clinic_id, prefs) VALUES (?,?,'doctor',?,?,?,?,?,TRUE,?,?,?,?,?)`,
      [FUNEZ.id, FUNEZ.name, JSON.stringify(['doctor']), FUNEZ.specialty, FUNEZ.email, FUNEZ.license, '#9A5B13', bcrypt.hashSync(DEMO_PASSWORD, 10),
        JSON.stringify(scheduleFromWeek(week, 30)), svc ? String(svc.id) : null, MAIN, JSON.stringify({ rxValidityDays: 30, noteFormat: 'dx' })])
  }
  // Fines de semana con citas: a quien no tiene sábado o domingo se le agrega una mañana (lo demás de su horario no cambia)
  const doctors = await q.query(`SELECT id, schedule FROM staff WHERE clinic_id IN (${clinicIds.map(() => '?').join(',')}) AND active AND roles LIKE '%doctor%' AND email LIKE '%@demo.clinara'`, clinicIds)
  for (const d of doctors) {
    const s = d.schedule ? JSON.parse(String(d.schedule)) as Schedule : undefined
    const week = weekOf(s)
    let changed = false
    for (const day of [6, 0]) if (!week[day]?.length) { week[day] = [{ start: day === 6 ? '08:00' : '09:00', end: '12:00' }]; changed = true }
    if (changed) await q.run('UPDATE staff SET schedule = ? WHERE id = ?', [JSON.stringify(scheduleFromWeek(week, s?.slot || 30)), String(d.id)])
  }
}

// ---------- Generación ----------

export interface DemoSummary { clinics: string[]; patients: number; appointments: number; consultations: number; observation: number; hospital: number; discharged: number; followups: number; backupBytes: number }

export async function seedDemo(sql: Sql, opts: { now?: Date; onBackup?: (json: string) => void | Promise<void> } = {}): Promise<DemoSummary> {
  const now = opts.now ?? new Date()
  const clinics = (await sql.query(`SELECT id, kind FROM clinics WHERE is_demo ORDER BY id`)).map((c) => ({ id: String(c.id), kind: String(c.kind) }))
  if (!clinics.length) throw new Error('No hay clínicas marcadas como demo (clinics.is_demo). No se borra ni se genera nada.')
  const ids = clinics.map((c) => c.id)
  let backup = ''
  const summary: DemoSummary = { clinics: ids, patients: 0, appointments: 0, consultations: 0, observation: 0, hospital: 0, discharged: 0, followups: 0, backupBytes: 0 }
  await sql.tx(async (q) => {
    await q.run('SELECT pg_advisory_xact_lock(7272742)')
    backup = await backupDemo(q, ids)
    await wipeDemoPatients(q, ids)
    await ensureDemoStaff(q, ids)
    for (const c of clinics) {
      const s = await generateClinic(q, c.id, c.kind === 'office', now)
      summary.patients += s.patients; summary.appointments += s.appointments; summary.consultations += s.consultations
      summary.observation += s.observation; summary.hospital += s.hospital; summary.discharged += s.discharged; summary.followups += s.followups
    }
    await q.run(`INSERT INTO meta (key, value) VALUES ('demo_seeded_on', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`, [isoDate(now)])
    await q.run('INSERT INTO audit (at, user_id, action, clinic_id) VALUES (?,?,?,?)', [new Date().toISOString(), 'sistema', `Datos de demostración regenerados para el ${isoDate(now)} (respaldo previo guardado)`, MAIN])
  })
  summary.backupBytes = backup.length
  await opts.onBackup?.(backup)
  return summary
}

interface Doc { id: string; name: string; specialty: string; schedule: Schedule; serviceId?: string; price: number; serviceName: string }

async function generateClinic(q: Sql, clinicId: string, office: boolean, now: Date) {
  const r = rng(office ? 4111 : 2027)
  const docs: Doc[] = (await q.query(`SELECT s.id, s.name, s.specialty, s.schedule, s.service_id, v.price, v.name AS svc FROM staff s LEFT JOIN services v ON v.id = s.service_id
    WHERE s.clinic_id = ? AND s.active AND s.roles LIKE '%doctor%' AND s.email LIKE '%@demo.clinara' ORDER BY s.id`, [clinicId]))
    .map((d) => ({ id: String(d.id), name: String(d.name), specialty: String(d.specialty ?? 'Medicina general'), schedule: JSON.parse(String(d.schedule ?? '{}')) as Schedule,
      serviceId: d.service_id ? String(d.service_id) : undefined, price: Number(d.price ?? 500), serviceName: String(d.svc ?? 'Consulta') }))
  if (!docs.length) return { patients: 0, appointments: 0, consultations: 0, observation: 0, hospital: 0, discharged: 0, followups: 0 }
  const nurse = String((await q.one(`SELECT id FROM staff WHERE clinic_id = ? AND active AND (roles LIKE '%nurse%' OR roles LIKE '%assistant%') AND email LIKE '%@demo.clinara' ORDER BY id LIMIT 1`, [clinicId]))?.id ?? docs[0].id)
  const cashier = String((await q.one(`SELECT id FROM staff WHERE clinic_id = ? AND active AND (roles LIKE '%reception%' OR roles LIKE '%assistant%') AND email LIKE '%@demo.clinara' ORDER BY id LIMIT 1`, [clinicId]))?.id ?? nurse)
  const people = makePeople(r, clinicId, office ? 32 : 120, now, office ? 'dm-o-' : 'dm-c-')

  // Pacientes
  await insertRows(q, 'patients', ['id', 'record', 'first_name', 'last_name', 'birth_date', 'sex', 'phone', 'allergies', 'conditions', 'created_at', 'dni', 'civil_status', 'occupation',
    'address', 'emergency_name', 'emergency_phone', 'emergency_relation', 'background', 'clinic_id', 'guardian_name', 'guardian_relation'],
  people.map((p, i) => {
    const conditions = [...p.chronic.map((c) => CHRONIC[c].condition), ...(p.weeks ? [`Embarazo de ${p.weeks} semanas`] : [])]
    const background = { pathological: conditions.join(', ') || 'Niega', allergies: p.allergies.join(', ') || 'Niega', surgical: p.age > 30 && r() < 0.2 ? 'Apendicectomía' : 'Niega',
      ...(p.sex === 'F' && p.age >= 15 ? { gynecological: p.weeks ? `G${int(r, 1, 3)}, embarazo actual de ${p.weeks} semanas` : 'Ciclos regulares' } : {}) }
    return [p.id, `EXP-${pad(i + 1, 5)}`, p.first, p.last, p.birth, p.sex, p.phone, JSON.stringify(p.allergies), JSON.stringify(conditions), p.created, p.dni ?? null, p.civil ?? null,
      p.occupation ?? null, p.address, p.guardian ?? `${pick(r, NAMES_F)} ${p.last.split(' ')[1]}`, phone(r), p.guardian ? 'Madre' : pick(r, ['Esposa', 'Esposo', 'Hija', 'Hijo', 'Hermana']),
      JSON.stringify(background), clinicId, p.guardian ?? null, p.guardian ? 'Madre' : null]
  }))

  // A quién ve cada médico: niños a pediatría, embarazadas a ginecología, crónicos a medicina interna; el resto a todos
  const forDoc = (d: Doc) => people.filter((p) => {
    if (office) return true
    if (/pediatr/i.test(d.specialty)) return p.age < 18
    if (/gineco/i.test(d.specialty)) return p.sex === 'F' && p.age >= 15
    if (/interna/i.test(d.specialty)) return p.age >= 18
    return true
  })
  const caseFor = (d: Doc, p: Person): Case => {
    if (p.weeks && (office || /gineco|general/i.test(d.specialty))) return PREGNANT_CASE(p.weeks)
    if (p.age < 12) return pick(r, CHILD_CASES)
    if (/gineco/i.test(d.specialty)) return pick(r, GYN_CASES)
    if (p.chronic.length && r() < 0.6) return CHRONIC_CASE(p.chronic[0])
    return pick(r, ADULT_CASES)
  }

  const appts: unknown[][] = []; const vitals: unknown[][] = []; const consults: unknown[][] = []; const rxs: unknown[][] = []; const pays: unknown[][] = []
  const exams: unknown[][] = []; const events: unknown[][] = []
  let receipt = 0; let folio = 0
  const year = now.getFullYear()
  const busy = new Set<string>() // pacientes con algo hoy (sala, consulta, internados) para no repetirlos
  const signConsult = (a: { id: string; doc: Doc; p: Person; at: Date; c: Case; status: 'done' | 'in_consult' | 'triaged' }, v: ReturnType<typeof vitalsFor>) => {
    const vid = `${a.id}-v`
    vitals.push([vid, a.p.id, a.id, nurse, plusMin(a.at, -12).toISOString(), v.systolic, v.diastolic, v.heartRate, v.temperature, v.spo2, v.weightKg, v.heightCm, null, null, v.respRate, v.glucose,
      a.c.complaint, clinicId])
    if (a.status !== 'done') return
    const items = a.c.items
    const orders = [...a.c.indications, ...items.map(medicationOrder)]
    const rx = items.length ? `${a.id}-rx` : null
    const date = plusMin(a.at, 20)
    consults.push([`${a.id}-c`, a.p.id, a.doc.id, a.id, date.toISOString(), a.c.reason, '[]', a.c.history, a.c.exam, JSON.stringify(a.c.dx), orders.map((o, i) => `${i + 1}. ${o}`).join('\n'), vid, rx,
      JSON.stringify(orders), '', clinicId, JSON.stringify(a.c.indications), JSON.stringify(items)])
    if (rx) rxs.push([rx, `RX-${year}-${pad(++folio + 1000, 4)}`, a.p.id, a.doc.id, `${a.id}-c`, date.toISOString(), JSON.stringify(items), clinicId, 30])
    // Exámenes de la consulta: ya con resultado revisado (los de días pasados) o pendientes (los de hoy)
    const batch = `${a.id}-ex`
    for (const [k, e] of (a.c.exams ?? []).entries()) {
      const eid = `${batch}-${k}`
      const past = date.getTime() < now.getTime() - 24 * HOUR
      const resAt = plusMin(date, 60 * 26).toISOString()
      const result = past && e.values ? { values: e.values.map(([analyte, value, unit, low, high]) => ({ analyte, value, unit: unit || undefined, low, high,
        flag: low != null && high != null && Number.isFinite(Number(value.replace(/\s/g, ''))) ? (Number(value.replace(/\s/g, '')) < low ? 'low' : Number(value.replace(/\s/g, '')) > high ? 'high' : undefined) : undefined })), at: resAt, by: nurse }
        : past ? { report: 'Estudio dentro de límites normales.', at: resAt, by: nurse } : undefined
      exams.push([eid, clinicId, a.p.id, `${a.id}-c`, null, batch, e.group, e.name, null, null, null, 'routine', 'clinic', office ? 'none' : 'nursing', past ? 'reviewed' : 'ordered', a.doc.id,
        date.toISOString(), past ? resAt : null, past ? nurse : null, result ? JSON.stringify(result) : null, false, past ? a.doc.id : null, past ? plusMin(date, 60 * 30).toISOString() : null])
      events.push([`${eid}-e0`, clinicId, eid, 'ordered', a.doc.id, date.toISOString(), null])
      if (past) { events.push([`${eid}-e1`, clinicId, eid, 'result', nurse, resAt, null]); events.push([`${eid}-e2`, clinicId, eid, 'reviewed', a.doc.id, plusMin(date, 60 * 30).toISOString(), null]) }
    }
    // Cobro: efectivo o transferencia (las formas de pago por defecto)
    if (r() < 0.92) {
      const transfer = r() < 0.35
      pays.push([`${a.id}-pay`, `R-${pad(++receipt, 6)}`, a.id, a.p.id, JSON.stringify([{ serviceId: a.doc.serviceId, name: a.doc.serviceName, price: a.doc.price, qty: 1 }]), 0, a.doc.price,
        transfer ? 'transfer' : 'cash', transfer ? `TRF-${int(r, 100000, 999999)}` : null, transfer ? pick(r, ['BAC Credomatic', 'Banco Atlántida', 'Ficohsa', 'Banpaís']) : null, cashier,
        plusMin(date, 15).toISOString(), clinicId, a.doc.price])
    }
  }

  // Citas de 30 días atrás a 60 adelante, todos los días, dentro del horario de cada médico
  for (let off = -30; off <= 60; off++) {
    const day = dayAt(now, off)
    const date = isoDate(day)
    for (const d of docs) {
      const slots = slotsOn(d.schedule, date)
      if (!slots.length) continue
      const pool = forDoc(d)
      const weekend = [0, 6].includes(day.getDay())
      const fill = off === 0 ? 0.85 : weekend ? 0.45 : 0.6
      const chosen = slots.filter(() => r() < fill)
      // Hoy: atendidos, uno en consulta, listos (con preclínica), en sala y por llegar, en ese orden
      const nToday = chosen.length
      chosen.forEach((hhmm, k) => {
        let p = pick(r, pool)
        if (off === 0) { let tries = 0; while (busy.has(p.id) && tries++ < 20) p = pick(r, pool); busy.add(p.id) }
        const at = dayAt(now, off, hhmm)
        const id = `dm-a-${clinicId}-${d.id}-${off + 30}-${hhmm.replace(':', '')}`
        const c = caseFor(d, p)
        let status: string
        if (off < 0) status = r() < 0.86 ? 'done' : r() < 0.6 ? 'no_show' : 'cancelled'
        else if (off === 0) {
          // Por posición: al menos uno en cada estado si el médico tiene 5 citas o más hoy
          const done = Math.max(1, Math.floor(nToday * 0.35))
          status = k < done ? 'done' : k === done ? 'in_consult' : k <= done + Math.max(1, Math.round(nToday * 0.15)) ? 'triaged'
            : k <= done + 1 + Math.max(2, Math.round(nToday * 0.3)) && k < nToday - 1 ? 'arrived' : 'scheduled'
        } else status = off <= 2 && r() < 0.5 ? 'confirmed' : 'scheduled'
        const arrivedAt = ['done', 'in_consult', 'triaged', 'arrived'].includes(status)
          ? new Date(Math.min(at.getTime(), now.getTime()) - int(r, 8, 35) * 60_000).toISOString() : null
        appts.push([id, p.id, d.id, naive(at), 30, c.reason, p.chronic.length || p.weeks ? 'followup' : r() < 0.3 ? 'first' : 'followup', status, arrivedAt,
          off > 0 && r() < 0.2 ? 'online' : 'staff', clinicId])
        if (status === 'done' || status === 'in_consult' || status === 'triaged') signConsult({ id, doc: d, p, at, c, status }, vitalsFor(r, p.age, c))
      })
    }
  }
  // Sala de espera sin cita: uno por médico que atiende hoy
  for (const d of docs.filter((x) => slotsOn(x.schedule, isoDate(now)).length)) {
    const pool = forDoc(d).filter((p) => !busy.has(p.id))
    if (!pool.length) continue
    const p = pick(r, pool)
    busy.add(p.id)
    const at = hoursAgo(now, 0.3)
    appts.push([`dm-a-${clinicId}-${d.id}-walkin`, p.id, d.id, naive(at), 30, p.age < 12 ? 'Fiebre desde anoche' : 'Dolor abdominal desde la mañana', 'urgent', 'arrived', plusMin(now, -12).toISOString(), 'walkin', clinicId])
  }
  await insertRows(q, 'appointments', ['id', 'patient_id', 'doctor_id', 'start', 'minutes', 'reason', 'type', 'status', 'arrived_at', 'source', 'clinic_id'], appts)
  await insertRows(q, 'vitals', ['id', 'patient_id', 'appointment_id', 'taken_by', 'taken_at', 'systolic', 'diastolic', 'heart_rate', 'temperature', 'spo2', 'weight_kg', 'height_cm', 'pain_scale', 'notes',
    'resp_rate', 'glucose', 'chief_complaint', 'clinic_id'], vitals)
  await insertRows(q, 'consultations', ['id', 'patient_id', 'doctor_id', 'appointment_id', 'date', 'reason', 'symptoms', 'history', 'exam', 'diagnoses', 'plan', 'vitals_id', 'prescription_id',
    'orders', 'observations', 'clinic_id', 'indications', 'meds'], consults)
  await insertRows(q, 'prescriptions', ['id', 'folio', 'patient_id', 'doctor_id', 'consultation_id', 'issued_at', 'items', 'clinic_id', 'validity_days'], rxs)
  await insertRows(q, 'payments', ['id', 'receipt_no', 'appointment_id', 'patient_id', 'items', 'discount', 'total', 'method', 'reference', 'bank', 'received_by', 'paid_at', 'clinic_id', 'amount_paid'], pays)
  await insertRows(q, 'exam_orders', ['id', 'clinic_id', 'patient_id', 'consultation_id', 'hospitalization_id', 'batch_id', 'grp', 'name', 'region', 'side', 'indication', 'priority', 'place', 'area',
    'status', 'ordered_by', 'ordered_at', 'status_at', 'status_by', 'result', 'critical', 'reviewed_by', 'reviewed_at'], exams)
  await insertRows(q, 'exam_events', ['id', 'clinic_id', 'exam_id', 'status', 'by_id', 'at', 'note'], events)

  // Crónicos y seguimientos: unos al día, otros atrasados, algunos con el recordatorio ya enviado
  const chronic = people.filter((p) => p.chronic.length).slice(0, office ? 6 : 20)
  const followups: unknown[][] = []
  chronic.forEach((p, i) => {
    const c = CHRONIC[p.chronic[0]]
    const doc = office ? docs[0] : docs.find((d) => /interna/i.test(d.specialty)) ?? docs[0]
    const due = i % 3 === 0 ? dayAt(now, -int(r, 3, 25)) : i % 3 === 1 ? dayAt(now, int(r, 0, 6)) : dayAt(now, int(r, 10, 60))
    const notified = i % 3 === 0 && r() < 0.6 ? plusMin(due, -24 * 60).toISOString() : null
    followups.push([`dm-f-${p.id}`, clinicId, p.id, 'chronic', c.title, isoDate(due), c.every, `${c.condition}. Traer el registro de controles y los exámenes.`, doc.id,
      dayAt(now, -120).toISOString(), notified, true])
  })
  // Recordatorios de procedimientos o resultados
  people.filter((p) => p.weeks).slice(0, 3).forEach((p, i) => followups.push([`dm-f-us-${p.id}`, clinicId, p.id, 'reminder', 'Ultrasonido obstétrico de control', isoDate(dayAt(now, 3 + i * 7)), null,
    `Embarazo de ${p.weeks} semanas.`, docs[0].id, dayAt(now, -10).toISOString(), null, true]))
  await insertRows(q, 'followups', ['id', 'clinic_id', 'patient_id', 'kind', 'title', 'due_date', 'every_days', 'notes', 'created_by', 'created_at', 'notified_at', 'active'], followups)

  // Observación, hospitalización y egresados
  const free = people.filter((p) => !busy.has(p.id))
  const stays = await generateStays(q, clinicId, office, docs, nurse, free, now, r)
  return { patients: people.length, appointments: appts.length, consultations: consults.length, followups: followups.length, ...stays }
}

// ---------- Estancias ----------

interface StayCase {
  spec: RegExp; reason: string; history: string; exam: string; dx: Diagnosis[]; indications: string[]; items: PrescriptionItem[]; ageMin: number; ageMax: number; sex?: 'F'
  vit: Visit['vitals']; temps: number[]; every: number; days: number; weeks?: number
  notes: { soap?: { s: string; o: string; a: string; p: string }; dx?: { exam: string; observations: string }; indications: string[] }[]
  nursing: string[]; labs: { name: string; values: [string, string, string, number, number][]; critical?: boolean }[]; pendingExam?: string
}
const MED = (drug: string, presentation: string, dose: string, route: string, frequency: string, duration = '', instructions?: string): PrescriptionItem => ({ drug, presentation, dose, route, frequency, duration, instructions })
const HOSPITAL: StayCase[] = [
  { spec: /interna/i, reason: 'Fiebre, tos con flema y falta de aire', ageMin: 55, ageMax: 85, days: 4, every: 8,
    history: 'Cuatro días de fiebre, tos productiva amarillenta y disnea progresiva hasta de reposo. Diabético en tratamiento con metformina.',
    exam: 'Tórax: Estertores crepitantes en base derecha, matidez a la percusión.\nGeneral: Taquipneico, hidratado.', dx: [icd('CA40.0', 'Neumonía bacteriana'), icd('5A11', 'Diabetes mellitus tipo 2')],
    indications: ['Oxígeno por cánula nasal para SpO₂ mayor de 92 %.', 'Glucometría antes de cada comida.', 'Cabecera a 30 grados.'],
    items: [MED('Ceftriaxona', 'Vial 1 g', '1 g', 'Intravenosa', 'Cada 12 horas', '7 días'), MED('Azitromicina', 'Tableta 500 mg', '500 mg', 'Oral', 'Cada 24 horas', '5 días'),
      MED('Acetaminofén', 'Tableta 500 mg', '1 g', 'Oral', 'Por razón necesaria (PRN)', '', 'Si temperatura de 38 °C o más.')],
    vit: { by: '', systolic: 134, diastolic: 82, heartRate: 106, respRate: 26, temperature: 38.7, spo2: 89, weightKg: 76, glucose: 224, complaint: 'Fiebre y falta de aire.' },
    temps: [38.7, 38.4, 37.9, 38.2, 37.6, 37.3, 37.0, 36.9, 36.8, 36.7, 36.9, 36.6],
    notes: [{ soap: { s: 'Menos disnea, tos persistente.', o: 'T 37.9 °C, SpO₂ 92 % con oxígeno, estertores en base derecha.', a: 'Neumonía en evolución favorable.', p: 'Continuar antibiótico.' }, indications: ['Fisioterapia respiratoria cada 8 horas.'] },
      { dx: { exam: 'Tórax: Menos estertores. SpO₂ 95 % con oxígeno a 1 L/min.', observations: 'Afebril desde ayer, tolera la dieta.' }, indications: ['Retirar el oxígeno si SpO₂ mayor de 93 %.'] },
      { soap: { s: 'Se siente mejor, camina en el cuarto.', o: 'T 36.8 °C, SpO₂ 95 % aire ambiente.', a: 'Neumonía resolviendo.', p: 'Valorar egreso mañana.' }, indications: ['Deambulación.'] }],
    nursing: ['Paciente pasa la noche tranquilo, tos productiva. Glucometría nocturna 186 mg/dL.', 'Se retira oxígeno, SpO₂ 94 % al aire ambiente.'],
    labs: [{ name: 'Hemograma', values: [['Leucocitos', '16 800', '/mm³', 4500, 11000], ['Neutrófilos', '84', '%', 40, 70], ['Hemoglobina', '13.1', 'g/dL', 12, 16]] }] },
  { spec: /interna/i, reason: 'Herida en el pie que no sana y glucosa alta', ageMin: 50, ageMax: 75, days: 6, every: 8,
    history: 'Diabético de 12 años de evolución con úlcera en el pie derecho de 3 semanas, ahora con enrojecimiento y secreción. Glucometrías de 300 mg/dL.',
    exam: 'Pie derecho: Úlcera de 3 cm en cabeza del primer metatarsiano con celulitis perilesional, pulsos pedios presentes.', dx: [icd('5A11', 'Diabetes mellitus tipo 2'), icd('1B70', 'Celulitis')],
    indications: ['Curación diaria de la herida.', 'Dieta para diabético de 1800 kcal.', 'Pie elevado.'],
    items: [MED('Clindamicina', 'Ampolla 600 mg', '600 mg', 'Intravenosa', 'Cada 8 horas', '10 días'), MED('Insulina NPH', 'Vial 100 UI/mL', '20 UI', 'Subcutánea', 'Cada 12 horas', ''),
      MED('Enoxaparina', 'Jeringa 40 mg', '40 mg', 'Subcutánea', 'Cada 24 horas', '')],
    vit: { by: '', systolic: 146, diastolic: 88, heartRate: 94, respRate: 18, temperature: 38.1, spo2: 97, weightKg: 84, glucose: 312, complaint: 'Herida en el pie y glucosa alta.' },
    temps: [38.1, 37.8, 37.4, 37.2, 37.0, 36.9, 36.8, 36.7, 36.8, 36.6, 36.7, 36.6, 36.8, 36.5, 36.7, 36.6, 36.8, 36.6],
    notes: [{ dx: { exam: 'Pie: Menos eritema. Glucometrías 180-240.', observations: 'Buena respuesta al antibiótico.' }, indications: ['Ajustar insulina según glucometría.'] },
      { soap: { s: 'Menos dolor en el pie.', o: 'Herida con tejido de granulación, sin secreción.', a: 'Celulitis en resolución.', p: 'Completar antibiótico.' }, indications: [] },
      { dx: { exam: 'Glucometrías 140-180 mg/dL.', observations: 'Control glucémico adecuado.' }, indications: ['Educación sobre cuidado de los pies.'] }],
    nursing: ['Curación de herida: tejido de granulación, sin secreción.', 'Glucometría 22:00: 176 mg/dL.'],
    labs: [{ name: 'Glucosa', values: [['Glucosa', '312', 'mg/dL', 70, 100]] }, { name: 'Química sanguínea', values: [['Creatinina', '1.1', 'mg/dL', 0.6, 1.2], ['Potasio', '4.2', 'mmol/L', 3.5, 5.1]] }] },
  { spec: /pediatr/i, reason: 'Dificultad para respirar y fiebre', ageMin: 1, ageMax: 3, days: 2, every: 4,
    history: 'Tres días de tos, fiebre y respiración rápida; hoy con tiraje y menor ingesta de líquidos.',
    exam: 'Tórax: Tiraje subcostal, sibilancias y crepitantes bilaterales.\nFR 48 rpm.', dx: [icd('CA41', 'Bronquiolitis aguda')],
    indications: ['Oxígeno para SpO₂ mayor de 92 %.', 'Aspiración de secreciones nasales.', 'Lactancia o líquidos fraccionados.'],
    items: [MED('Salbutamol', 'Solución para nebulizar 5 mg/mL', '0.15 mL', 'Inhalada', 'Cada 6 horas', '2 días', 'En 3 mL de solución salina.'),
      MED('Acetaminofén', 'Jarabe 160 mg/5 mL', '4 mL', 'Oral', 'Cada 6 horas', '3 días', 'Si fiebre.')],
    vit: { by: '', systolic: 96, diastolic: 60, heartRate: 148, respRate: 48, temperature: 38.6, spo2: 90, weightKg: 12, complaint: 'Respira rápido y tiene fiebre.' },
    temps: [38.6, 38.9, 38.2, 37.8, 37.6, 37.4, 37.2, 37.0, 36.9, 37.1, 36.9, 36.8],
    notes: [{ soap: { s: 'Madre refiere que come mejor.', o: 'FR 38, SpO₂ 94 % con oxígeno, sibilancias escasas.', a: 'Bronquiolitis en mejoría.', p: 'Continuar nebulizaciones.' }, indications: ['Destetar oxígeno.'] }],
    nursing: ['Niño irritable en la noche, se aspiran secreciones con mejoría.'], labs: [], pendingExam: 'Radiografía de tórax' },
  { spec: /gineco/i, reason: 'Fiebre y dolor de espalda en el embarazo', ageMin: 20, ageMax: 32, sex: 'F', weeks: 28, days: 3, every: 6,
    history: 'Embarazo de 28 semanas con 2 días de fiebre, escalofríos, disuria y dolor lumbar derecho.',
    exam: 'Puño percusión lumbar derecha positiva. Altura uterina de 27 cm, frecuencia cardíaca fetal 152 lpm.', dx: [icd('JA62', 'Infección del tracto genitourinario en el embarazo')],
    indications: ['Monitoreo de frecuencia cardíaca fetal cada 6 horas.', 'Reposo en decúbito lateral izquierdo.', 'Urocultivo.'],
    items: [MED('Ceftriaxona', 'Vial 1 g', '1 g', 'Intravenosa', 'Cada 24 horas', '7 días'), MED('Acetaminofén', 'Tableta 500 mg', '1 g', 'Oral', 'Por razón necesaria (PRN)', '', 'Si temperatura de 38 °C o más.')],
    vit: { by: '', systolic: 112, diastolic: 70, heartRate: 112, respRate: 20, temperature: 39.1, spo2: 98, weightKg: 68, complaint: 'Fiebre y dolor en la espalda.' },
    temps: [39.1, 38.6, 38.2, 37.8, 37.4, 37.2, 37.0, 36.9, 36.8, 36.9, 36.7, 36.8],
    notes: [{ dx: { exam: 'Puño percusión derecha levemente positiva. FCF 146 lpm.', observations: 'Afebril desde la mañana.' }, indications: ['Continuar monitoreo fetal.'] },
      { soap: { s: 'Sin dolor lumbar.', o: 'T 36.8 °C, FCF 148 lpm.', a: 'Pielonefritis en el embarazo, mejorando.', p: 'Completar 48 h afebril y pasar a vía oral.' }, indications: [] }],
    nursing: ['FCF 150 lpm, movimientos fetales presentes.'], labs: [{ name: 'Examen general de orina (EGO)', values: [['Leucocitos', '40', '/campo', 0, 5]] }], pendingExam: 'Urocultivo' },
  { spec: /general/i, reason: 'Fiebre alta, dolor de cuerpo y dolor abdominal', ageMin: 18, ageMax: 45, days: 2, every: 4,
    history: 'Cuatro días de fiebre alta, mialgias, cefalea retroocular; hoy dolor abdominal y vómitos. Brote de dengue en su colonia.',
    exam: 'Abdomen: Dolor en hipocondrio derecho, hepatomegalia leve.\nPiel: Petequias en antebrazos.', dx: [icd('1D21', 'Dengue con signos de alarma')],
    indications: ['Líquidos intravenosos según peso.', 'Hematocrito y plaquetas cada 12 horas.', 'Vigilar sangrado y diuresis.'],
    items: [MED('Solución Hartmann', 'Bolsa 1000 mL', '1000 mL', 'Intravenosa', 'Cada 8 horas', ''), MED('Acetaminofén', 'Tableta 500 mg', '1 g', 'Oral', 'Cada 8 horas', '3 días', 'No dar AINES.')],
    vit: { by: '', systolic: 104, diastolic: 66, heartRate: 108, respRate: 20, temperature: 39.2, spo2: 98, weightKg: 70, complaint: 'Fiebre, dolor de cuerpo y vómitos.' },
    temps: [39.2, 38.8, 38.4, 37.9, 38.3, 37.6, 37.2, 37.0, 36.8, 36.9, 36.8, 36.7],
    notes: [{ soap: { s: 'Menos dolor abdominal, sin vómitos.', o: 'T 37.6 °C, plaquetas 68 000.', a: 'Dengue con signos de alarma, fase crítica.', p: 'Continuar líquidos y vigilancia.' }, indications: ['Plaquetas en 12 horas.'] }],
    nursing: ['Diuresis adecuada. Sin sangrado activo.'], labs: [{ name: 'Hemograma', values: [['Plaquetas', '68 000', '/mm³', 150000, 450000], ['Hematocrito', '46', '%', 36, 46]] }], pendingExam: 'Hemograma' },
  { spec: /general/i, reason: 'Diarrea y vómitos en adulto mayor', ageMin: 70, ageMax: 88, days: 1, every: 6,
    history: 'Diez evacuaciones líquidas y vómitos en las últimas 24 horas, con debilidad y mareo al ponerse de pie.',
    exam: 'Mucosas secas, llenado capilar de 3 segundos. Abdomen blando, ruidos aumentados.', dx: [icd('1A40.Z', 'Gastroenteritis o colitis infecciosa sin especificación del agente infeccioso'), icd('5C70.0', 'Deshidratación')],
    indications: ['Líquidos claros a tolerancia.', 'Control de ingesta y excreta.'],
    items: [MED('Solución salina 0.9 %', 'Bolsa 1000 mL', '1000 mL', 'Intravenosa', 'Cada 8 horas', ''), MED('Ondansetrón', 'Ampolla 8 mg/4 mL', '8 mg', 'Intravenosa', 'Cada 8 horas', '2 días')],
    vit: { by: '', systolic: 96, diastolic: 58, heartRate: 104, respRate: 18, temperature: 37.4, spo2: 97, weightKg: 58, complaint: 'Diarrea, vómitos y mareo.' },
    temps: [37.4, 37.2, 37.0, 36.8, 36.9, 36.7], notes: [], nursing: ['Dos evacuaciones líquidas en el turno, tolera líquidos claros.'],
    labs: [{ name: 'Electrolitos', values: [['Sodio', '133', 'mmol/L', 135, 145], ['Potasio', '3.1', 'mmol/L', 3.5, 5.1]] }] },
]
const OBSERVATION: StayCase[] = [
  { spec: /./, reason: 'Crisis asmática', ageMin: 18, ageMax: 50, days: 0, every: 2, history: 'Asmática conocida con disnea y sibilancias desde la madrugada, sin respuesta a su inhalador.',
    exam: 'Tórax: Sibilancias espiratorias difusas, uso leve de músculos accesorios.', dx: [icd('CA23', 'Asma')], indications: ['Oxígeno para SpO₂ mayor de 92 %.', 'Signos vitales cada 2 horas.'],
    items: [MED('Salbutamol', 'Solución para nebulizar 5 mg/mL', '0.5 mL', 'Inhalada', 'Cada 4 horas', '1 día', 'En 3 mL de solución salina.'), MED('Hidrocortisona', 'Vial 100 mg', '100 mg', 'Intravenosa', 'Cada 8 horas', '1 día')],
    vit: { by: '', systolic: 128, diastolic: 78, heartRate: 112, respRate: 26, temperature: 36.8, spo2: 91, weightKg: 66, complaint: 'Falta de aire y silbido en el pecho.' }, temps: [36.8, 36.9, 36.7],
    notes: [{ dx: { exam: 'Sibilancias escasas. SpO₂ 95 %.', observations: 'Buena respuesta a la segunda nebulización.' }, indications: ['Valorar egreso en 2 horas.'] }], nursing: [], labs: [] },
  { spec: /./, reason: 'Vómitos y diarrea', ageMin: 20, ageMax: 60, days: 0, every: 2, history: 'Ocho evacuaciones líquidas y cinco vómitos desde ayer. No tolera la vía oral.',
    exam: 'Mucosas secas, abdomen blando con ruidos aumentados.', dx: [icd('1A40.Z', 'Gastroenteritis o colitis infecciosa sin especificación del agente infeccioso'), icd('5C70.0', 'Deshidratación')],
    indications: ['Nada por vía oral por 2 horas; luego líquidos claros.', 'Control de ingesta y excreta.'],
    items: [MED('Solución Hartmann', 'Bolsa 1000 mL', '1000 mL', 'Intravenosa', 'Cada 8 horas', ''), MED('Ondansetrón', 'Ampolla 8 mg/4 mL', '8 mg', 'Intravenosa', 'Cada 8 horas', '1 día')],
    vit: { by: '', systolic: 100, diastolic: 62, heartRate: 106, respRate: 20, temperature: 37.3, spo2: 98, weightKg: 62, complaint: 'Vómitos y diarrea.' }, temps: [37.3, 37.1, 36.9],
    notes: [{ dx: { exam: 'Mucosas semihúmedas. FC 90 lpm.', observations: 'Sin vómitos desde el suero.' }, indications: ['Iniciar líquidos claros.'] }], nursing: [], labs: [] },
  { spec: /./, reason: 'Presión alta y dolor de cabeza', ageMin: 50, ageMax: 75, days: 0, every: 2, history: 'Hipertensa con mal apego, cefalea occipital intensa desde la mañana. Sin déficit neurológico.',
    exam: 'Neurológico: Sin focalización. Fondo de ojo sin papiledema.', dx: [icd('BA03', 'Crisis hipertensiva')], indications: ['Reposo, luz tenue.', 'Presión arterial cada 30 minutos.'],
    items: [MED('Captopril', 'Tableta 25 mg', '25 mg', 'Sublingual', 'Dosis única', ''), MED('Losartán', 'Tableta 50 mg', '50 mg', 'Oral', 'Cada 12 horas', '')],
    vit: { by: '', systolic: 186, diastolic: 112, heartRate: 88, respRate: 18, temperature: 36.6, spo2: 97, weightKg: 80, complaint: 'Dolor de cabeza y presión alta.' }, temps: [36.6, 36.7],
    notes: [{ dx: { exam: 'PA 158/96. Cefalea 3/10.', observations: 'Descenso progresivo de la presión.' }, indications: ['Presión cada hora.'] }], nursing: [], labs: [] },
]

/** Toma de signos de la estancia con la temperatura de la curva y lo demás coherente con ella. */
function stayVitals(clinicId: string, stayId: string, patientId: string, by: string, start: Date, until: Date, every: number, temps: number[], base: Visit['vitals'], r: Rand, skipLast: boolean) {
  const rows: unknown[][] = []
  let t = new Date(start.getTime() + every * HOUR)
  let i = 1
  while (t.getTime() <= until.getTime()) {
    const next = t.getTime() + every * HOUR
    if (skipLast && next > until.getTime()) break
    const temp = temps[Math.min(i, temps.length - 1)]
    const kid = base.heartRate > 120
    rows.push([`${stayId}-sv-${i}`, patientId, null, by, plusMin(t, int(r, 0, 15)).toISOString(), kid ? null : base.systolic - int(r, 0, 14), kid ? null : base.diastolic - int(r, 0, 8),
      Math.round((kid ? 120 : 76) + (temp - 37) * (kid ? 12 : 10) + r() * 6), temp, Math.min(99, base.spo2 + Math.min(i, 6)), null, null, int(r, 0, 4), null,
      Math.max(kid ? 24 : 14, base.respRate - Math.min(i, 8)), base.glucose ? Math.max(120, base.glucose - i * 12) : null, null, clinicId, stayId])
    t = new Date(next)
    i++
  }
  return rows
}

async function noteRow(q: Sql, clinicId: string, stayId: string, author: string, at: Date, n: StayCase['notes'][number], dx: Diagnosis[]) {
  const id = randomUUID()
  await q.run(`INSERT INTO hosp_notes (id, clinic_id, hospitalization_id, kind, author_id, at, subjective, objective, assessment, plan, data) VALUES (?,?,?,'evolution',?,?,?,?,?,?,?)`,
    [id, clinicId, stayId, author, at.toISOString(), n.soap?.s ?? '', n.soap?.o ?? '', n.soap?.a ?? '', n.soap?.p ?? '',
      JSON.stringify({ orders: n.indications, checklist: n.indications.length > 0, indicationCount: n.indications.length, ...(n.dx ? { format: 'dx', diagnoses: dx, ...n.dx } : { format: 'soap' }) })])
  return id
}

async function generateStays(q: Sql, clinicId: string, office: boolean, docs: Doc[], nurse: string, free: Person[], now: Date, r: Rand) {
  const used = new Set<string>()
  const pickPatient = (c: StayCase) => {
    const ok = free.filter((p) => !used.has(p.id) && p.age >= c.ageMin && p.age <= c.ageMax && (!c.sex || p.sex === c.sex) && (!c.weeks || !!p.weeks))
    const p = ok[0] ?? free.find((x) => !used.has(x.id) && x.age >= 18 && (!c.sex || x.sex === c.sex))
    if (p) used.add(p.id)
    return p
  }
  const docFor = (c: StayCase) => docs.find((d) => c.spec.test(d.specialty)) ?? docs[0]
  const counts = { observation: 0, hospital: 0, discharged: 0 }
  let n = 0
  const visit = (c: StayCase, p: Person, d: Doc, at: Date, kind: 'observation' | 'hospital'): Visit => ({
    id: `dm-k-${clinicId}-${++n}`, clinicId, patientId: p.id, doctorId: d.id, at, stayKind: kind, reason: c.reason, history: c.history, exam: c.exam, diagnoses: c.dx,
    indications: c.indications, items: c.items, vitals: { ...c.vit, by: nurse },
  })

  // Observación: 3 en la clínica, 1 en el consultorio
  for (const c of OBSERVATION.slice(0, office ? 1 : 3)) {
    const p = pickPatient(c)
    if (!p) continue
    const d = office ? docs[0] : docs.find((x) => /general/i.test(x.specialty)) ?? docs[0]
    const at = hoursAgo(now, 2 + counts.observation * 1.5)
    const v = visit(c, p, d, at, 'observation')
    await signVisit(q, v)
    const stay = `dm-h-${clinicId}-o${counts.observation + 1}`
    await openStay(q, v, stay, p.phone)
    await q.run('UPDATE hospitalizations SET vitals_every_hours = ? WHERE id = ?', [c.every, stay])
    await giveDoses(q, clinicId, stay, office ? nurse : nurse, hoursAgo(now, 0.5))
    if (c.notes[0]) await noteRow(q, clinicId, stay, d.id, hoursAgo(now, 0.75), c.notes[0], c.dx)
    await insertRows(q, 'vitals', ['id', 'patient_id', 'appointment_id', 'taken_by', 'taken_at', 'systolic', 'diastolic', 'heart_rate', 'temperature', 'spo2', 'weight_kg', 'height_cm', 'pain_scale',
      'notes', 'resp_rate', 'glucose', 'chief_complaint', 'clinic_id', 'hospitalization_id'], stayVitals(clinicId, stay, p.id, nurse, at, hoursAgo(now, 0.2), c.every, c.temps, c.vit, r, false))
    counts.observation++
  }
  if (office) return counts

  const beds = (await q.query(`SELECT b.id FROM beds b WHERE b.clinic_id = ? AND b.active AND NOT EXISTS (SELECT 1 FROM hospitalizations h WHERE h.bed_id = b.id AND h.status = 'active') ORDER BY b.room`, [clinicId]))
    .map((b) => String(b.id))
  const companions = ['Esposa', 'Hijo', 'Hija', 'Madre', 'Esposo', 'Hermana']

  // Hospitalizados: 6 de distintas especialidades, en camas distintas, con días de estancia variados
  for (const [i, c] of HOSPITAL.entries()) {
    const p = pickPatient(c)
    const bed = beds.shift()
    if (!p || !bed) continue
    const d = docFor(c)
    const admitted = hoursAgo(now, c.days * 24 + 5 + i)
    const v = visit(c, p, d, admitted, 'hospital')
    await signVisit(q, v)
    const stay = `dm-h-${clinicId}-h${i + 1}`
    await openStay(q, v, stay, p.phone, { bedId: bed, companion: [`${pick(r, NAMES_F)} ${p.last.split(' ')[0]}`, pick(r, companions), phone(r)] })
    await q.run('UPDATE hospitalizations SET specialty = ?, vitals_every_hours = ? WHERE id = ?', [d.specialty, c.every, stay])
    // Autorización de hospitalización: firmada (hoja en papel subida) salvo la del ingreso más reciente
    const h = (await q.one('SELECT * FROM hospitalizations WHERE id = ?', [stay]))!
    const { authorization } = await ensureHospitalAuthorization(q, h, { id: d.id, role: 'doctor' })
    await q.run('UPDATE authorizations SET created_at = ? WHERE id = ?', [plusMin(admitted, 5).toISOString(), authorization.id])
    if (c.days > 1) {
      const signedAt = plusMin(admitted, 35)
      const file = await signedSheet(q, clinicId, p.id, stay, 'Autorizacion de hospitalizacion', signedAt, nurse, textPdf)
      await q.run(`UPDATE authorizations SET status = 'signed', file_id = ?, status_at = ?, status_by = ?, method = 'paper' WHERE id = ?`, [file, signedAt.toISOString(), nurse, authorization.id])
    }
    // Notas de evolución (una por día, Estándar y SOAP), revisadas por enfermería salvo la última de algunas estancias
    for (const [k, note] of c.notes.entries()) {
      const at = hoursAgo(now, Math.max(1.5, (c.days - k - 1) * 24 + 10 - k))
      if (at <= admitted) continue
      const id = await noteRow(q, clinicId, stay, d.id, at, note, c.dx)
      const last = k === c.notes.length - 1
      if (!last || i % 2 === 1) for (let o = 0; o < note.indications.length; o++) await q.run(`INSERT INTO order_marks (id, clinic_id, hospitalization_id, note_id, order_index, action, by_id, at) VALUES (?,?,?,?,?,'check',?,?)`,
        [randomUUID(), clinicId, stay, id, o, nurse, plusMin(at, 20).toISOString()])
    }
    for (const [k, text] of c.nursing.entries()) await q.run(`INSERT INTO hosp_notes (id, clinic_id, hospitalization_id, kind, author_id, at, text) VALUES (?,?,?,'nursing',?,?,?)`,
      [randomUUID(), clinicId, stay, nurse, hoursAgo(now, Math.max(2, c.days * 24 - 8 - k * 12)).toISOString(), text])
    // Curva térmica (con fiebre al inicio) y dosis aplicadas hasta hace hora y media; la toma más reciente queda pendiente en algunas
    await insertRows(q, 'vitals', ['id', 'patient_id', 'appointment_id', 'taken_by', 'taken_at', 'systolic', 'diastolic', 'heart_rate', 'temperature', 'spo2', 'weight_kg', 'height_cm', 'pain_scale',
      'notes', 'resp_rate', 'glucose', 'chief_complaint', 'clinic_id', 'hospitalization_id'], stayVitals(clinicId, stay, p.id, nurse, admitted, hoursAgo(now, 0.5), c.every, c.temps, c.vit, r, i % 3 === 0))
    await giveDoses(q, clinicId, stay, nurse, hoursAgo(now, 1.5), c.items.some((x) => /necesaria/i.test(x.frequency)) ? [{ drug: 'Acetaminofén', at: plusMin(admitted, 90), note: `T ${c.vit.temperature} °C.` }] : [])
    // Exámenes: resultados de la estancia y, en algunas, uno pendiente (bandeja de enfermería)
    for (const [k, lab] of c.labs.entries()) {
      const eid = `${stay}-ex-${k}`
      const ordered = plusMin(admitted, 30)
      const resAt = plusMin(admitted, 240)
      const values = lab.values.map(([analyte, value, unit, low, high]) => { const x = Number(value.replace(/\s/g, '')); return { analyte, value, unit, low, high, flag: x < low ? 'low' : x > high ? 'high' : undefined } })
      await q.run(`INSERT INTO exam_orders (id, clinic_id, patient_id, hospitalization_id, batch_id, grp, name, priority, place, area, status, ordered_by, ordered_at, status_at, status_by, result, critical, reviewed_by, reviewed_at)
        VALUES (?,?,?,?,?,'lab',?,'urgent','clinic','nursing','reviewed',?,?,?,?,?,FALSE,?,?)`,
      [eid, clinicId, p.id, stay, `${stay}-ex`, lab.name, d.id, ordered.toISOString(), resAt.toISOString(), nurse, JSON.stringify({ values, at: resAt.toISOString(), by: nurse }), d.id, plusMin(resAt, 40).toISOString()])
      await insertRows(q, 'exam_events', ['id', 'clinic_id', 'exam_id', 'status', 'by_id', 'at'], [[`${eid}-0`, clinicId, eid, 'ordered', d.id, ordered.toISOString()],
        [`${eid}-1`, clinicId, eid, 'sample', nurse, plusMin(ordered, 15).toISOString()], [`${eid}-2`, clinicId, eid, 'result', nurse, resAt.toISOString()], [`${eid}-3`, clinicId, eid, 'reviewed', d.id, plusMin(resAt, 40).toISOString()]])
    }
    if (c.pendingExam) {
      const eid = `${stay}-ex-p`
      const at = hoursAgo(now, 1)
      const imaging = /radiograf|ultrason/i.test(c.pendingExam)
      await q.run(`INSERT INTO exam_orders (id, clinic_id, patient_id, hospitalization_id, batch_id, grp, name, indication, priority, place, area, status, ordered_by, ordered_at, critical)
        VALUES (?,?,?,?,?,?,?,?,'urgent','clinic','nursing','ordered',?,?,FALSE)`, [eid, clinicId, p.id, stay, `${stay}-exp`, imaging ? 'imaging' : 'lab', c.pendingExam, c.reason, d.id, at.toISOString()])
      await q.run(`INSERT INTO exam_events (id, clinic_id, exam_id, status, by_id, at) VALUES (?,?,?,'ordered',?,?)`, [`${eid}-0`, clinicId, eid, d.id, at.toISOString()])
    }
    counts.hospital++
  }

  // Egresados: 3 con nota de egreso, receta de salida y epicrisis emitida
  const DISCHARGED: [number, number][] = [[0, 9], [3, 6], [5, 4]]
  for (const [ci, ago] of DISCHARGED) {
    const c = HOSPITAL[ci]
    const p = pickPatient(c)
    const bed = beds.shift()
    if (!p || !bed) continue
    const d = docFor(c)
    const admitted = dayAt(now, -ago, '10:00')
    const discharged = dayAt(now, -ago + Math.max(2, c.days), '11:30')
    const v = visit(c, p, d, admitted, 'hospital')
    await signVisit(q, v)
    const stay = `dm-h-${clinicId}-e${ci}`
    await openStay(q, v, stay, p.phone, { bedId: bed, companion: [`${pick(r, NAMES_F)} ${p.last.split(' ')[0]}`, pick(r, companions), phone(r)] })
    await q.run('UPDATE hospitalizations SET specialty = ? WHERE id = ?', [d.specialty, stay])
    const h = (await q.one('SELECT * FROM hospitalizations WHERE id = ?', [stay]))!
    const { authorization } = await ensureHospitalAuthorization(q, h, { id: d.id, role: 'doctor' })
    const file = await signedSheet(q, clinicId, p.id, stay, 'Autorizacion de hospitalizacion', plusMin(admitted, 30), nurse, textPdf)
    await q.run(`UPDATE authorizations SET status = 'signed', file_id = ?, status_at = ?, status_by = ?, created_at = ?, method = 'paper' WHERE id = ?`,
      [file, plusMin(admitted, 30).toISOString(), nurse, plusMin(admitted, 5).toISOString(), authorization.id])
    if (c.notes[0]) await noteRow(q, clinicId, stay, d.id, plusMin(admitted, 60 * 22), c.notes[0], c.dx)
    await giveDoses(q, clinicId, stay, nurse, plusMin(discharged, -60))
    await insertRows(q, 'vitals', ['id', 'patient_id', 'appointment_id', 'taken_by', 'taken_at', 'systolic', 'diastolic', 'heart_rate', 'temperature', 'spo2', 'weight_kg', 'height_cm', 'pain_scale',
      'notes', 'resp_rate', 'glucose', 'chief_complaint', 'clinic_id', 'hospitalization_id'], stayVitals(clinicId, stay, p.id, nurse, admitted, plusMin(discharged, -30), 8, c.temps, c.vit, r, false))
    await dischargeStay(q, h, d, p, c, discharged)
    counts.discharged++
  }
  return counts
}

/** Egreso como lo guarda la app (MC5): nota en el orden de la epicrisis, receta de salida, cama libre y epicrisis emitida. */
async function dischargeStay(q: Sql, h: Row, d: Doc, p: Person, c: StayCase, at: Date) {
  const clinicId = String(h.clinic_id)
  const items = c.items.filter((x) => /oral/i.test(x.route ?? '') && !/necesaria/i.test(x.frequency)).map((x) => ({ ...x, duration: x.duration || '5 días' }))
  if (!items.length) items.push(MED('Acetaminofén', 'Tableta 500 mg', '1 g', 'Oral', 'Cada 8 horas', '3 días', 'Si dolor o fiebre.'))
  const noteId = randomUUID()
  const rxId = randomUUID()
  const n = await q.one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM prescriptions WHERE clinic_id = ? AND folio LIKE 'RX-%-9%'`, [clinicId])
  const folio = `RX-${at.getFullYear()}-${9001 + Number(n?.n ?? 0)}`
  const staff = (await q.one('SELECT * FROM staff WHERE id = ?', [d.id]))!
  await q.run(`INSERT INTO prescriptions (id, folio, patient_id, doctor_id, consultation_id, hospitalization_id, issued_at, items, clinic_id, validity_days) VALUES (?,?,?,?,?,?,?,?,?,30)`,
    [rxId, folio, p.id, d.id, noteId, String(h.id), at.toISOString(), JSON.stringify(items), clinicId])
  const data = { diagnoses: c.dx, summary: `${c.notes.map((x) => x.dx?.observations ?? x.soap?.a ?? '').filter(Boolean).join(' ')} Evolución favorable; se da de alta en condición estable.`.trim(),
    condition: 'Mejorado', instructions: 'Dieta habitual. Regresar si hay fiebre, dificultad para respirar o empeoramiento.', followUp: 'Cita de control en consulta externa en 1 semana.', hea: c.history }
  await q.run(`INSERT INTO hosp_notes (id, clinic_id, hospitalization_id, kind, author_id, at, plan, data) VALUES (?,?,?,'discharge',?,?,?,?)`,
    [noteId, clinicId, String(h.id), d.id, at.toISOString(), data.instructions, JSON.stringify(data)])
  await q.run(`UPDATE hosp_meds SET stopped_at = ?, stopped_by = ?, stop_reason = 'Egreso' WHERE hospitalization_id = ? AND stopped_at IS NULL`, [at.toISOString(), d.id, String(h.id)])
  await q.run(`UPDATE hospitalizations SET status = 'discharged', discharged_at = ?, discharged_by = ?, prescription_id = ? WHERE id = ?`, [at.toISOString(), d.id, rxId, String(h.id)])
  const epi = await createEpicrisisDraft(q, (await q.one('SELECT * FROM hospitalizations WHERE id = ?', [String(h.id)]))!, d.id)
  const signed = { ...epi.data, doctor: { name: String(staff.doc_name || staff.name), license: staff.license ? String(staff.license) : undefined } }
  await q.run(`UPDATE epicrises SET status = 'issued', data = ?, issued_by = ?, issued_at = ?, created_at = ? WHERE id = ?`, [JSON.stringify(signed), d.id, plusMin(at, 20).toISOString(), at.toISOString(), epi.id])
}
