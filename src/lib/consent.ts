import type { Authorization } from './types'

/**
 * Plantillas de autorización (consentimiento informado).
 *
 * VALIDACIÓN PENDIENTE: este texto es una propuesta. Emil (responsable clínico) y el asesor legal de la
 * clínica deben revisarlo y aprobarlo antes de usarlo con pacientes reales; la clínica puede reemplazarlo
 * por su propio formato. Tampoco sustituye la conversación del médico con el paciente.
 *
 * Base que se verificó en el texto original (no se citan otras normas):
 * - Código de Ética del Colegio Médico de Honduras, capítulo VIII "Relación médico paciente",
 *   artículos 26 y 30 a 33 (derecho del paciente a participar en las decisiones, información en palabras
 *   comprensibles sobre riesgos, beneficios y alternativas, consentimiento o rechazo, y decisión de
 *   familiares o responsables legales cuando el paciente no puede decidir). Así lo resume también
 *   Rev Med Hondur 2016;84(3-4).
 * - Código de la Niñez y de la Adolescencia (Decreto 73-96, reformado por el Decreto 35-2013), art. 1:
 *   es niño o niña toda persona hasta los 18 años; por eso decide su representante.
 * No se encontró una norma de la Secretaría de Salud sobre el formato del consentimiento ni sobre la
 * huella digital de quien no sabe firmar: la casilla de huella sigue la práctica habitual y debe validarse.
 */

export interface ConsentProcedure {
  name: string
  description: string // en qué consiste, en lenguaje sencillo
  benefits: string
  risks: string // frecuentes y graves
  alternatives: string
  notDoing: string // riesgo de no realizarlo
  anesthesia: string
}

/** Biblioteca de procedimientos frecuentes. Todo se precarga y el médico lo edita en cada autorización. */
export const CONSENT_LIBRARY: ConsentProcedure[] = [
  {
    name: 'Canalización venosa central',
    description: 'Colocar un tubo delgado (catéter) en una vena grande del cuello, del pecho o de la ingle para pasar medicamentos, sueros o medir presiones.',
    benefits: 'Permite dar tratamientos que no se pueden pasar por una vena del brazo y vigilar mejor al paciente.',
    risks: 'Frecuentes: dolor, moretón o sangrado en el sitio. Poco frecuentes pero graves: infección del catéter, entrada de aire al pulmón (neumotórax), punción de una arteria, coágulos o alteraciones del ritmo del corazón.',
    alternatives: 'Venas del brazo (vía periférica) o catéter de inserción periférica, si son suficientes para el tratamiento.',
    notDoing: 'Puede no ser posible dar el tratamiento necesario o vigilar adecuadamente al paciente.',
    anesthesia: 'Anestesia local',
  },
  {
    name: 'Sonda vesical',
    description: 'Pasar un tubo delgado y flexible por la uretra hasta la vejiga para sacar la orina.',
    benefits: 'Vacía la vejiga, permite medir la orina y alivia la retención.',
    risks: 'Frecuentes: molestia, ardor o sangrado leve. Poco frecuentes pero graves: infección urinaria o lesión de la uretra.',
    alternatives: 'Sondeo intermitente, pañal o recolector externo, según el caso.',
    notDoing: 'Retención de orina con dolor y posible daño de la vejiga o de los riñones; no se podrá medir la orina con exactitud.',
    anesthesia: 'Gel anestésico local',
  },
  {
    name: 'Sonda nasogástrica',
    description: 'Pasar un tubo delgado por la nariz hasta el estómago para vaciarlo o para dar alimento o medicamentos.',
    benefits: 'Descomprime el estómago, evita vómitos o permite alimentar al paciente que no puede tragar.',
    risks: 'Frecuentes: molestia en nariz y garganta, náuseas, sangrado nasal leve. Poco frecuentes pero graves: paso del tubo a la vía respiratoria o lesión del esófago.',
    alternatives: 'Ayuno con sueros, alimentación por otra vía, según el caso.',
    notDoing: 'Vómitos, riesgo de que el contenido del estómago pase a los pulmones o falta de alimentación.',
    anesthesia: 'Gel anestésico local',
  },
  {
    name: 'Toracocentesis',
    description: 'Introducir una aguja entre las costillas para sacar líquido acumulado alrededor del pulmón.',
    benefits: 'Mejora la respiración y permite estudiar el líquido para saber la causa.',
    risks: 'Frecuentes: dolor, tos o mareo. Poco frecuentes pero graves: entrada de aire al pulmón (neumotórax), sangrado, infección o lesión del hígado o del bazo.',
    alternatives: 'Tratamiento con medicamentos y vigilancia, o colocación de un tubo de drenaje, según el caso.',
    notDoing: 'Persistencia de la falta de aire y falta de diagnóstico de la causa del líquido.',
    anesthesia: 'Anestesia local',
  },
  {
    name: 'Paracentesis',
    description: 'Introducir una aguja en el abdomen para sacar líquido acumulado (ascitis).',
    benefits: 'Alivia la distensión y la falta de aire, y permite estudiar el líquido.',
    risks: 'Frecuentes: dolor o salida de líquido por el sitio. Poco frecuentes pero graves: sangrado, infección, lesión del intestino o baja de la presión.',
    alternatives: 'Medicamentos para eliminar líquido (diuréticos) y dieta, según el caso.',
    notDoing: 'Persistencia de las molestias y falta de diagnóstico de la causa del líquido.',
    anesthesia: 'Anestesia local',
  },
  {
    name: 'Punción lumbar',
    description: 'Introducir una aguja fina en la parte baja de la espalda para sacar una pequeña cantidad del líquido que rodea la médula.',
    benefits: 'Permite diagnosticar infecciones como la meningitis y otras enfermedades del sistema nervioso.',
    risks: 'Frecuentes: dolor de cabeza o de espalda. Poco frecuentes pero graves: infección, sangrado o lesión de nervios.',
    alternatives: 'Estudios de imagen o tratamiento sin confirmar el diagnóstico, según el caso.',
    notDoing: 'Puede retrasarse el diagnóstico y el tratamiento correcto.',
    anesthesia: 'Anestesia local',
  },
  {
    name: 'Sutura de herida',
    description: 'Limpiar la herida y cerrarla con puntos.',
    benefits: 'Favorece la cicatrización, disminuye el sangrado y el riesgo de infección.',
    risks: 'Frecuentes: dolor, cicatriz. Poco frecuentes pero graves: infección, apertura de la herida o reacción a la anestesia.',
    alternatives: 'Cierre con cintas adhesivas o pegamento, o dejar cerrar sola, según la herida.',
    notDoing: 'Sangrado, infección y cicatriz de peor aspecto.',
    anesthesia: 'Anestesia local',
  },
  {
    name: 'Drenaje de absceso',
    description: 'Abrir con un corte pequeño una acumulación de pus para vaciarla y limpiarla.',
    benefits: 'Quita la infección acumulada y alivia el dolor.',
    risks: 'Frecuentes: dolor, sangrado leve, cicatriz. Poco frecuentes pero graves: extensión de la infección o lesión de estructuras cercanas.',
    alternatives: 'Antibióticos solos en abscesos muy pequeños, según el caso.',
    notDoing: 'La infección puede crecer y pasar a la sangre.',
    anesthesia: 'Anestesia local',
  },
  {
    name: 'Transfusión de hemoderivados',
    description: 'Pasar por la vena sangre o componentes de la sangre (glóbulos rojos, plasma o plaquetas) de donantes.',
    benefits: 'Corrige la anemia o el sangrado y mejora la oxigenación.',
    risks: 'Frecuentes: fiebre o ronchas. Poco frecuentes pero graves: reacción alérgica grave, sobrecarga de líquido, lesión pulmonar o, muy rara vez, transmisión de infecciones.',
    alternatives: 'Hierro, medicamentos que estimulan la producción de sangre o vigilancia, según el caso.',
    notDoing: 'Empeoramiento de la anemia o del sangrado, que puede poner en riesgo la vida.',
    anesthesia: 'No aplica',
  },
]

/** Lo que el paciente declara, en primera persona y lenguaje sencillo. */
export function consentStatements(general: boolean): string[] {
  return [
    general
      ? 'Autorizo a los médicos y al personal de esta clínica a atenderme durante mi estancia: examinarme, tomarme muestras y hacerme los exámenes y tratamientos habituales del servicio.'
      : 'Autorizo a que se me realice el procedimiento descrito en esta hoja.',
    'El médico me explicó con palabras que entiendo en qué consiste, para qué sirve, sus riesgos frecuentes y graves, las alternativas y lo que puede pasar si no se hace.',
    'Pude hacer todas las preguntas que quise y me las respondieron. Entendí la información.',
    'Tomo esta decisión libre y voluntariamente. Sé que puedo revocar esta autorización en cualquier momento antes del procedimiento, sin que eso afecte el resto de mi atención.',
    'Autorizo los cambios necesarios si durante la atención surge una situación imprevista de urgencia que ponga en riesgo mi vida o mi salud.',
  ]
}

export const AUTH_STATUS: Record<Authorization['status'], { label: string; tone: string }> = {
  pending: { label: 'Pendiente de firma', tone: 'amber' },
  signed: { label: 'Firmada', tone: 'mint' },
  refused: { label: 'Rechazada (no autoriza)', tone: 'red' },
  revoked: { label: 'Revocada', tone: 'red' },
}

export const authTitle = (a: Pick<Authorization, 'template' | 'data'>) =>
  a.template === 'general' ? 'Autorización general de ingreso y atención' : `Consentimiento informado: ${a.data.procedure}`

