import type { Authorization, AuthorizationData, ConsentPerson } from './types.js'
import { date, time } from './format.js'

/**
 * Plantillas de autorización (consentimiento informado). Son dos documentos:
 * - Autorización de hospitalización: una por estancia, igual para todos los pacientes que se ingresan
 *   (hospitalización u observación). Autoriza el ingreso y la atención, los medicamentos y los procedimientos menores.
 * - Autorización quirúrgica: una por cirugía, con el procedimiento, el diagnóstico y la información del
 *   consentimiento informado quirúrgico, rechazo informado ("No autorizo"), representante, testigo y médico.
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
/**
 * Procedimientos frecuentes para la nota de procedimiento: los de la biblioteca de autorizaciones y los
 * menores del día a día. El médico elige uno o escribe otro.
 */
export const FREQUENT_PROCEDURES = [...new Set([
  'Canalización venosa periférica', 'Toma de muestras de laboratorio', 'Curación de herida', 'Retiro de puntos', 'Nebulización',
  'Lavado gástrico', 'Inmovilización con férula', 'Extracción de cuerpo extraño', 'Lavado de oídos', 'Reducción de luxación',
  ...CONSENT_LIBRARY.map((x) => x.name),
])].sort((a, b) => a.localeCompare(b, 'es'))

/** Lo que el paciente (o su representante) autoriza en la hoja de hospitalización. */
export const HOSPITAL_CONSENT = [
  'Mi ingreso y la atención médica y de enfermería que necesite durante la estancia: examinarme, vigilarme y hacerme los exámenes que indique el médico.',
  'La aplicación de los medicamentos que indique el médico, por la vía que corresponda (oral, en la vena, en el músculo u otra).',
  'Los procedimientos menores que requiera mi atención, como canalizar una vena, tomar muestras de sangre, orina u otras, hacer curaciones y colocar sondas.',
]

/** Declaración de la hoja de hospitalización, después de lo que se autoriza. */
export const HOSPITAL_DECLARATION = 'Me explicaron con palabras que entiendo por qué debo quedar ingresado y en qué consiste la atención; pude preguntar y me respondieron. ' +
  'Sé que para una cirugía u otro procedimiento mayor se me pedirá una autorización aparte, y que puedo retirar esta autorización en cualquier momento.'

/**
 * Texto genérico de la autorización quirúrgica (ronda 3): el mismo para toda cirugía, sin riesgos ni alternativas
 * por procedimiento. VALIDACIÓN PENDIENTE: un consentimiento genérico tiene límites legales; Emil y el asesor
 * legal de la clínica deben aprobarlo antes de usarlo con pacientes reales, y la clínica puede reemplazarlo por su
 * propio formato. No se citan artículos que no se hayan verificado.
 */
export const SURGICAL_GENERIC = [
  'Autorizo al equipo médico de este establecimiento a realizarme el procedimiento indicado en esta hoja, como tratamiento del diagnóstico indicado.',
  'Recibí información, con palabras que entiendo, sobre el procedimiento, sus beneficios, sus riesgos y las alternativas. Pude hacer preguntas y me las respondieron.',
  'Tomo esta decisión de forma libre y voluntaria.',
  'Autorizo la anestesia y las medidas médicas necesarias, así como los cambios que hagan falta si durante el procedimiento hay hallazgos o urgencias que no se esperaban.',
  'Sé que puedo revocar esta autorización antes del procedimiento sin que eso afecte el resto de mi atención.',
]

/** Cirugías frecuentes: sólo sugieren el nombre; siempre se puede escribir cualquier otro. */
export const FREQUENT_SURGERIES = [
  'Apendicectomía', 'Colecistectomía laparoscópica', 'Colecistectomía abierta', 'Laparotomía exploradora', 'Hernioplastia inguinal', 'Hernioplastia umbilical',
  'Cesárea', 'Legrado uterino', 'Salpingectomía bilateral (esterilización)', 'Histerectomía abdominal', 'Circuncisión', 'Drenaje de absceso', 'Desbridamiento de herida',
  'Exéresis de lipoma', 'Amigdalectomía', 'Reducción abierta y fijación de fractura',
]

/** Declaración del consentimiento quirúrgico emitido antes de la ronda 3 (se sigue imprimiendo igual). */
export function consentStatements(kind: 'surgical' | 'general' = 'surgical'): string[] {
  if (kind === 'general') return [
    'Autorizo a los médicos y al personal de esta clínica a atenderme durante mi estancia: examinarme, tomarme muestras y hacerme los exámenes y tratamientos habituales del servicio.',
    'El médico me explicó con palabras que entiendo en qué consiste, para qué sirve, sus riesgos frecuentes y graves, las alternativas y lo que puede pasar si no se hace.',
    'Pude hacer todas las preguntas que quise y me las respondieron. Entendí la información.',
    'Tomo esta decisión libre y voluntariamente. Sé que puedo revocar esta autorización en cualquier momento antes del procedimiento, sin que eso afecte el resto de mi atención.',
    'Autorizo los cambios necesarios si durante la atención surge una situación imprevista de urgencia que ponga en riesgo mi vida o mi salud.',
  ]
  return [
    'Acepto ser sometido al procedimiento quirúrgico indicado en esta hoja, que realizará el médico tratante con su equipo.',
    'El médico me explicó con palabras que entiendo en qué consiste, para qué sirve y qué beneficios se esperan; sus riesgos frecuentes y sus riesgos graves; las alternativas que existen; lo que puede pasar si no me opero, y el tipo de anestesia que se usará y sus riesgos.',
    'Pude hacer todas las preguntas que quise, me las respondieron y entendí la información. Sé que ningún procedimiento tiene resultados garantizados.',
    'Autorizo la anestesia indicada y, si durante el procedimiento surge una situación imprevista que ponga en riesgo mi vida o mi salud, los cambios o procedimientos adicionales necesarios para atenderla.',
    'Tomo esta decisión de forma libre y voluntaria, sin presiones. Sé que puedo revocar esta autorización en cualquier momento antes del procedimiento, sin que eso afecte el resto de mi atención.',
  ]
}

export const AUTH_STATUS: Record<Authorization['status'], { label: string; tone: string }> = {
  pending: { label: 'Pendiente de firma', tone: 'amber' },
  signed: { label: 'Firmada', tone: 'mint' },
  refused: { label: 'No autoriza', tone: 'red' },
  revoked: { label: 'Revocada', tone: 'red' },
  not_applicable: { label: 'No aplica (observación)', tone: 'ink' },
}

/** La quirúrgica (y la de procedimiento de antes de la v22, que es la misma). */
export const isSurgical = (a: Pick<Authorization, 'template'>) => a.template === 'surgical' || a.template === 'procedure'

export const authTitle = (a: Pick<Authorization, 'template' | 'data'>) =>
  a.template === 'hospital' ? 'Autorización de hospitalización'
    : a.template === 'general' ? 'Autorización general de ingreso y atención (formato anterior)'
    : `Autorización quirúrgica: ${a.data.procedure}`

/** Tipos de anestesia para elegir o escribir. */
export const ANESTHESIA = ['Local', 'Local con sedación', 'Regional (raquídea o epidural)', 'General', 'No requiere']


/**
 * Estado que se ve: Pendiente de firma (o firmada por el paciente y falta el médico), Firmada (virtual), Firmada
 * (papel escaneado), No autoriza o Revocada.
 */
export function authStatus(a: Pick<Authorization, 'status' | 'method' | 'signing' | 'fileId'>) {
  if (a.status === 'pending' && a.signing?.action === 'accept' && !a.signing.doctor) return { label: 'Firmó el paciente · falta el médico', tone: 'amber' }
  if (a.status === 'signed') return { label: a.method === 'virtual' ? 'Firmada (virtual)' : 'Firmada (papel escaneado)', tone: 'mint' }
  if (a.status === 'refused') return { label: `No autoriza${a.method === 'virtual' ? ' (virtual)' : a.fileId ? ' (papel)' : ''}`, tone: 'red' }
  return AUTH_STATUS[a.status]
}

/** "Celular · Chrome en Android": tipo de dispositivo y navegador, para la constancia de la firma. */
export function deviceLabel(ua: string) {
  const kind = /iPad|Tablet|(Android(?!.*Mobile))/i.test(ua) ? 'Tableta' : /Mobi|iPhone|Android/i.test(ua) ? 'Celular' : 'Computadora'
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'navegador desconocido'
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : ''
  return `${kind} · ${browser}${os ? ` en ${os}` : ''}`
}

/** dd/mm/aaaa */
export const shortDate = (iso: string) => date(iso, { day: '2-digit', month: '2-digit', year: 'numeric' })

/** Texto de un documento de autorización, igual en la vista de lectura del paciente y en el PDF firmado. */
export interface ConsentDocument {
  title: string
  facts: [string, string][]
  intro: string
  items: string[]
  closing?: string
}

const BLANK = '__________'

/** Quién declara: el paciente o su representante, con su identidad y parentesco. */
export function signerText(d: AuthorizationData, rep?: ConsentPerson) {
  if (!rep) return d.patient.name
  return `${rep.name}${rep.dni ? `, identidad ${rep.dni}` : ''}${rep.relation ? `, ${rep.relation.toLowerCase()}` : ''}, en representación de ${d.patient.name}`
}

/**
 * Lo que dice el documento según lo que se firma: la autorización, el rechazo informado ("No autorizo") o la
 * revocación. `rep` es el representante legal, si firma uno.
 */
export function consentDocument(a: Pick<Authorization, 'template' | 'data' | 'statusAt'>, action: 'accept' | 'refuse' | 'revoke', rep?: ConsentPerson): ConsentDocument {
  const d = a.data
  const hospital = a.template === 'hospital'
  const facts: [string, string][] = [
    ['Paciente', d.patient.name], ['Identidad', d.patient.dni ?? (d.patient.minor ? 'Menor de edad' : 'Sin dato')], ['Edad', d.patient.age],
    ['Sexo', d.patient.sex === 'F' ? 'Femenino' : 'Masculino'], ['Expediente', d.patient.record],
    ['Médico', `${d.doctor.name}${d.doctor.license ? `, colegiación ${d.doctor.license}` : ''}`],
  ]
  if (hospital) {
    facts.push(['Ingreso', d.admission ? `${shortDate(d.admission.at)}, ${time(d.admission.at)}` : 'Sin dato'],
      ['Diagnóstico de ingreso', d.admission?.diagnosis ?? d.diagnosis ?? 'Sin dato'])
    if (d.companion) facts.push(['Acompañante', `${d.companion.name}${d.companion.relation ? ` (${d.companion.relation})` : ''}${d.companion.phone ? `, tel. ${d.companion.phone}` : ''}`])
  } else {
    facts.push(['Procedimiento', d.procedure ?? BLANK], ['Diagnóstico', d.diagnosis || BLANK])
    if (!d.generic) {
      for (const [k, v] of [['En qué consiste', d.description], ['Beneficios esperados', d.benefits], ['Riesgos frecuentes y graves', d.risks], ['Alternativas', d.alternatives],
        ['Riesgo de no operarse', d.notDoing], ['Tipo de anestesia', d.anesthesia]] as const) if (v) facts.push([k, v])
    }
  }
  const who = signerText(d, rep)
  const what = hospital ? 'la hospitalización y la atención descritas en este documento' : `el procedimiento "${d.procedure}"`
  if (action === 'refuse') {
    return {
      title: hospital ? 'Rechazo informado: no autorizo la hospitalización' : 'Rechazo informado: no autorizo el procedimiento',
      facts, intro: `Yo, ${who}, declaro:`,
      items: [
        `Recibí la información sobre ${what}, con palabras que entiendo: para qué sirve, sus beneficios, sus riesgos y las alternativas. Pude hacer preguntas y me las respondieron.`,
        `Decido no autorizar ${hospital ? 'la hospitalización' : 'el procedimiento'}. Entiendo los riesgos de no hacerlo.`,
        'Tomo esta decisión de forma libre y voluntaria. Sé que puedo cambiar de opinión y pedir de nuevo la atención.',
      ],
    }
  }
  if (action === 'revoke') {
    return {
      title: `Revocación de la ${hospital ? 'autorización de hospitalización' : 'autorización quirúrgica'}`,
      facts, intro: `Yo, ${who}, declaro:`,
      items: [
        `Revoco la autorización que di${a.statusAt ? ` el ${shortDate(a.statusAt)} a las ${time(a.statusAt)}` : ''} para ${what}.`,
        'Me explicaron los riesgos de revocarla y tomo esta decisión de forma libre y voluntaria.',
      ],
    }
  }
  if (hospital) {
    return { title: 'Autorización de hospitalización', facts, intro: `Yo, ${who}, autorizo a los médicos y al personal de ${d.clinic.name}:`, items: HOSPITAL_CONSENT, closing: HOSPITAL_DECLARATION }
  }
  return {
    title: a.template === 'general' ? 'Autorización general de ingreso y atención' : 'Autorización quirúrgica (consentimiento informado)',
    facts, intro: `Yo, ${who}, declaro:`,
    items: d.generic ? SURGICAL_GENERIC : consentStatements(a.template === 'general' ? 'general' : 'surgical'),
  }
}

/** Casilla que marca quien firma: la misma en la pantalla y en el PDF. */
export const READ_CONFIRMATION = 'He leído este documento, me lo explicaron y pude hacer preguntas.'

/** Constancia al pie del PDF firmado en pantalla. No dice que tenga validez legal plena: es una firma electrónica simple. */
export const SIGNATURE_NOTICE = 'Firma electrónica simple: las firmas se dibujaron en pantalla. No es una firma electrónica avanzada con certificado digital ' +
  '(Ley sobre Firmas Electrónicas, Decreto 149-2013). La huella SHA-256 de este PDF queda registrada en el expediente para comprobar que no se alteró.'
