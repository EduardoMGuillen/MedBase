import type { ClinicKind, Role } from './types.js'

/**
 * Matriz de permisos por rol (principio de mínimo privilegio).
 * Recepción nunca ve notas clínicas ni recetas; enfermería ve el expediente
 * pero no prescribe; sólo el médico firma consultas y recetas.
 */
export const PERMISSIONS = {
  'agenda.view': 'Ver agenda',
  'agenda.manage': 'Crear y reprogramar citas',
  'checkin.manage': 'Registrar llegada de pacientes',
  'patients.view': 'Ver ficha de pacientes',
  'patients.manage': 'Registrar y editar pacientes',
  'chart.view': 'Ver expediente clínico',
  'vitals.record': 'Tomar signos vitales y triaje',
  'consult.write': 'Escribir y firmar consultas',
  'rx.write': 'Emitir recetas',
  'rx.view': 'Ver e imprimir recetas',
  'billing.manage': 'Cobrar y emitir recibos',
  'staff.manage': 'Gestionar personal y roles',
  'settings.manage': 'Configurar la clínica y servicios',
  'schedule.manage': 'Editar el horario de cualquier médico',
  'drugs.manage': 'Editar y desactivar medicamentos del vademécum de la clínica',
  'reports.view': 'Ver indicadores de la clínica',
  'audit.view': 'Ver bitácora de accesos',
  'inpatient.view': 'Ver pacientes hospitalizados',
  'inpatient.orders': 'Ingresar, evolucionar y dar de alta',
  'inpatient.care': 'Administrar medicamentos y escribir notas de enfermería',
  'orders.review': 'Marcar como revisadas las órdenes médicas',
  'followups.view': 'Ver crónicos y recordatorios',
  'followups.manage': 'Programar seguimientos de pacientes',
  'exams.order': 'Ordenar exámenes y revisar sus resultados',
  'exams.process': 'Tomar muestras, marcar exámenes realizados y cargar resultados',
  'platform.manage': 'Administrar clínicas y usuarios de la plataforma',
  // DP (ronda 11): departamentos de Laboratorio e Imágenes
  'dept.work': 'Bandeja del departamento: muestras, estudios y resultados de su tipo',
  'dept.config': 'Configurar su departamento (catálogo, rangos, umbrales) y editar su rol de turnos',
  'ambulatory.register': 'Registrar pacientes que vienen solo a hacerse exámenes',
  // IM2 (ronda 12): notas de evolución y de procedimiento sin órdenes de medicamentos (radiólogo intervencionista)
  'inpatient.notes': 'Escribir notas de evolución y de procedimiento (sin indicaciones ni medicamentos)',
} as const

export type Permission = keyof typeof PERMISSIONS

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  // Administra la plataforma; no tiene acceso a datos clínicos de ninguna clínica
  superadmin: ['platform.manage'],
  admin: [
    'agenda.view', 'agenda.manage', 'checkin.manage', 'patients.view', 'patients.manage', 'billing.manage',
    'staff.manage', 'settings.manage', 'reports.view', 'audit.view', 'schedule.manage', 'drugs.manage',
    // AD5 (ronda 5): ve los crónicos y sus recordatorios, avisa y marca hechos (programar uno nuevo sigue siendo del médico)
    'followups.view',
    // DP3 (ronda 11): registra pacientes ambulatorios para exámenes
    'ambulatory.register',
  ],
  doctor: [
    'agenda.view', 'agenda.manage', 'patients.view', 'patients.manage', 'chart.view', 'vitals.record',
    'consult.write', 'rx.write', 'rx.view', 'billing.manage', 'inpatient.view', 'inpatient.orders', 'followups.view', 'followups.manage',
    'exams.order', 'exams.process',
  ],
  // AD9: enfermería ya no cobra (los cobros los generan recepción, el médico o administración)
  nurse: ['agenda.view', 'checkin.manage', 'patients.view', 'patients.manage', 'chart.view', 'vitals.record', 'rx.view', 'inpatient.view', 'inpatient.care', 'orders.review', 'followups.view',
    'exams.process'],
  reception: ['agenda.view', 'agenda.manage', 'checkin.manage', 'patients.view', 'patients.manage', 'billing.manage', 'followups.view', 'ambulatory.register'],
  // Asistente de consultorio (secretaria o enfermera): recepción, preclínica, caja y aplicar dosis en observación
  assistant: ['agenda.view', 'agenda.manage', 'checkin.manage', 'patients.view', 'patients.manage', 'chart.view', 'vitals.record', 'rx.view', 'billing.manage',
    'inpatient.view', 'inpatient.care', 'followups.view', 'exams.process'],
  // DP1 (ronda 11): Laboratorio e Imágenes. Buscan pacientes y registran ambulatorios (DP3); su bandeja y resultados (solo su
  // tipo, deptAllows); el expediente parcial (DP4). El cargo agrega: Microbiólogo y Radiólogo configuran su departamento; el
  // Radiólogo además ve todo el expediente en solo lectura (positionPermissions).
  lab: ['patients.view', 'patients.manage', 'exams.process', 'dept.work', 'ambulatory.register'],
  imaging: ['patients.view', 'patients.manage', 'exams.process', 'dept.work', 'ambulatory.register'],
}

/** DP1 y DP4 (ronda 11): lo que el cargo suma a su rol. */
const POSITION_PERMISSIONS: Record<string, Permission[]> = {
  microbiologist: ['dept.config'],
  radiologist: ['dept.config', 'chart.view', 'inpatient.view', 'inpatient.notes'],
}

/**
 * MI1: en un consultorio el médico titular es médico y administrador (dos roles, AD5) y cambia de vista: en la de
 * médico, lo clínico (y registrar llegadas y aplicar dosis en observación, porque puede no tener personal); en la de
 * administrador, reportes, personal, configuración, servicios y formas de pago. Puede sumar asistentes y enfermería.
 */
const OFFICE_PERMISSIONS: Partial<Record<Role, Permission[]>> = {
  doctor: [...new Set<Permission>([...ROLE_PERMISSIONS.doctor, 'checkin.manage', 'inpatient.care'])],
  admin: ROLE_PERMISSIONS.admin,
  nurse: ROLE_PERMISSIONS.nurse,
  assistant: ROLE_PERMISSIONS.assistant,
}

/** Permisos de un rol según el tipo de cuenta (y, en Laboratorio e Imágenes, el cargo). En una clínica son los de siempre. */
export function permissionsFor(role: Role, kind: ClinicKind = 'clinic', position?: string): Permission[] {
  if (kind === 'office') return OFFICE_PERMISSIONS[role] ?? []
  const base = ROLE_PERMISSIONS[role] ?? []
  const extra = (role === 'lab' || role === 'imaging') && position ? POSITION_PERMISSIONS[position] ?? [] : []
  return extra.length ? [...new Set([...base, ...extra])] : base
}

/** Roles que se pueden dar a alguien en cada tipo de cuenta. */
export const ROLES_BY_KIND: Record<ClinicKind, Exclude<Role, 'superadmin'>[]> = {
  clinic: ['admin', 'doctor', 'nurse', 'reception', 'lab', 'imaging'],
  office: ['admin', 'doctor', 'nurse', 'assistant'],
}

export const ROLE_LABEL: Record<Role, string> = {
  superadmin: 'Administración de Clinara',
  admin: 'Administración',
  doctor: 'Médico',
  nurse: 'Enfermería',
  reception: 'Recepción',
  assistant: 'Asistente',
  lab: 'Laboratorio',
  imaging: 'Imágenes',
}

export const ROLE_SUMMARY: Record<Role, string> = {
  superadmin: 'Crea y administra clínicas y sus usuarios. No ve expedientes de pacientes.',
  admin: 'Configura la clínica, el personal y los precios, y revisa indicadores. Sin acceso a notas clínicas.',
  doctor: 'Atiende su agenda, registra pacientes nuevos, escribe consultas, diagnostica, emite recetas, cobra cuando hace falta e ingresa y evoluciona a pacientes hospitalizados.',
  nurse: 'Recibe al paciente, lo registra si llega sin expediente, toma la preclínica y, en hospitalización, administra medicamentos y escribe notas de enfermería.',
  reception: 'Agenda citas, registra pacientes, controla la sala de espera y cobra.',
  assistant: 'En el consultorio: agenda citas, recibe y registra al paciente, toma la preclínica, cobra y aplica los medicamentos que el médico indica en observación.',
  lab: 'Laboratorio clínico: bandeja de órdenes, toma de muestras, resultados, pacientes ambulatorios y, el microbiólogo, la configuración y el rol de turnos del laboratorio.',
  imaging: 'Imágenes: bandeja de estudios, realizados, informes (el radiólogo), pacientes ambulatorios y, el radiólogo, la configuración y el rol de turnos de imágenes.',
}

/** ¿Puede este usuario (rol y tipo de cuenta) hacer esto? Con sólo el rol, se asume una clínica. */
export const can = (who: Role | { role: Role; clinicKind?: ClinicKind; position?: string }, p: Permission) =>
  (typeof who === 'string' ? ROLE_PERMISSIONS[who] : permissionsFor(who.role, who.clinicKind, who.position)).includes(p)

/** AD5: ¿la persona tiene este rol (aunque ahora trabaje con otra vista)? */
export const hasRole = (s: { role: Role; roles?: Role[] }, r: Role) => (s.roles ?? [s.role]).includes(r)

/** El rol con que se firma una nota: el clínico de la persona (médico antes que administración), no su vista activa. */
export function mainRole(s: { role: Role; roles?: Role[] }): Role {
  return (['doctor', 'nurse', 'lab', 'imaging', 'assistant', 'reception', 'admin', 'superadmin'] as Role[]).find((r) => hasRole(s, r)) ?? s.role
}

/**
 * AD5: nombre de cada vista en el selector de rol. GE1 (ronda 6) y GE2 (ronda 8): sólo el nombre del rol, sin «Vista de».
 */
export const VIEW_LABEL: Record<Role, string> = { ...ROLE_LABEL, superadmin: 'Plataforma' }

/** Vistas que puede elegir: sus roles, en el orden del menú (administración primero). */
export function viewsOf(s: { role: Role; roles?: Role[] }): Role[] {
  const order: Role[] = ['admin', 'doctor', 'nurse', 'lab', 'imaging', 'reception', 'assistant', 'superadmin']
  return order.filter((r) => hasRole(s, r))
}

/** Otro de sus roles que sí tiene este permiso (para ofrecer cambiar de vista), o undefined. */
export function roleWith(s: { role: Role; roles?: Role[]; position?: string }, p: Permission, kind: ClinicKind = 'clinic') {
  return viewsOf(s).find((r) => r !== s.role && permissionsFor(r, kind, s.position).includes(p))
}

/** Permisos que se muestran en la matriz de una clínica (sin los de plataforma). */
export const CLINIC_PERMISSIONS = (Object.keys(PERMISSIONS) as Permission[]).filter((p) => p !== 'platform.manage')

/** Qué módulos tiene la cuenta. Las pantallas preguntan por esto, no por el tipo de cuenta. */
export function features(s: { kind?: ClinicKind; observationEnabled?: boolean }) {
  const office = s.kind === 'office'
  return {
    office,
    /** Hospitalización con camas: sólo en clínicas. */
    hospital: !office,
    /** Observación corta: en clínicas siempre; en consultorios si está activada. */
    observation: !office || s.observationEnabled !== false,
    /** Varios médicos: filtros por médico, "Toda la clínica", atender al paciente de otro médico. */
    multiDoctor: !office,
  }
}

/** "la clínica" o "el consultorio", para los textos. */
export const placeWord = (s: { kind?: ClinicKind }) => (s.kind === 'office' ? 'consultorio' : 'clínica')

/**
 * DP (ronda 11): ¿puede esta persona trabajar los exámenes de este tipo? Los roles de Laboratorio e Imágenes solo los de su
 * departamento; los demás (enfermería, médico), los dos tipos.
 */
export function deptAllows(u: { role: Role }, group: 'lab' | 'imaging') {
  if ((u.role as string) === 'lab') return group === 'lab'
  if ((u.role as string) === 'imaging') return group === 'imaging'
  return true
}
