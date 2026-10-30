/**
 * AD7: tipo de cada acción de la bitácora, para filtrarla. Se deduce del texto de la acción (así también se clasifican
 * las filas anteriores a esta versión). El orden importa: la primera regla que coincide gana.
 */
export const AUDIT_KINDS = {
  session: 'Sesión y cuenta',
  patients: 'Pacientes',
  agenda: 'Citas y llegadas',
  clinical: 'Consultas y notas',
  documents: 'Recetas y documentos',
  inpatient: 'Hospitalización y observación',
  exams: 'Exámenes',
  billing: 'Caja y cobros',
  config: 'Configuración',
  staff: 'Personal y roles',
  other: 'Otras',
} as const

export type AuditKind = keyof typeof AUDIT_KINDS

const RULES: [AuditKind, RegExp][] = [
  ['session', /sesi[oó]n|contraseña|verificaci[oó]n en dos pasos|PIN|vista de|recorrido/i],
  ['staff', /usuario|roles? |horario|colegiaci[oó]n|firma electr|su firma|su sello|Mi configuraci/i],
  ['billing', /cobr|recibo|factura|abono|saldo|caja/i],
  ['exams', /examen|ex[aá]menes|resultado|muestra|laboratorio|imagen/i],
  ['documents', /receta|constancia|autorizaci[oó]n|epicrisis|referencia|orden de ex/i],
  ['agenda', /cita|llegada|recordatorio|sin cita|inasistencia|atenderlo/i],
  ['inpatient', /hospitaliz|observaci[oó]n|ingres[oó]|alta |dosis|orden|signos vitales de la estancia|cama|nota de enfermer|egreso/i],
  ['clinical', /consulta|nota|expediente|signos vitales|adenda|diagn[oó]stico|preclínica/i],
  ['patients', /paciente|ficha|registro de|expediente /i],
  ['config', /configuraci[oó]n|servicio|vadem[eé]cum|contacto|forma de pago|consultorio en cl[ií]nica/i],
]

export function auditKind(action: string): AuditKind {
  return RULES.find(([, re]) => re.test(action))?.[0] ?? 'other'
}
