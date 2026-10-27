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
  'platform.manage': 'Administrar clínicas y usuarios de la plataforma',
} as const

export type Permission = keyof typeof PERMISSIONS

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  // Administra la plataforma; no tiene acceso a datos clínicos de ninguna clínica
  superadmin: ['platform.manage'],
  admin: [
    'agenda.view', 'agenda.manage', 'checkin.manage', 'patients.view', 'patients.manage', 'billing.manage',
    'staff.manage', 'settings.manage', 'reports.view', 'audit.view', 'schedule.manage', 'drugs.manage',
  ],
  doctor: [
    'agenda.view', 'agenda.manage', 'patients.view', 'patients.manage', 'chart.view', 'vitals.record',
    'consult.write', 'rx.write', 'rx.view', 'billing.manage', 'inpatient.view', 'inpatient.orders', 'followups.view', 'followups.manage',
  ],
  nurse: ['agenda.view', 'checkin.manage', 'patients.view', 'patients.manage', 'chart.view', 'vitals.record', 'rx.view', 'billing.manage', 'inpatient.view', 'inpatient.care', 'orders.review', 'followups.view'],
  reception: ['agenda.view', 'agenda.manage', 'checkin.manage', 'patients.view', 'patients.manage', 'billing.manage', 'followups.view'],
  // Asistente de consultorio (secretaria o enfermera): recepción, preclínica, caja y aplicar dosis en observación
  assistant: ['agenda.view', 'agenda.manage', 'checkin.manage', 'patients.view', 'patients.manage', 'chart.view', 'vitals.record', 'rx.view', 'billing.manage',
    'inpatient.view', 'inpatient.care', 'followups.view'],
}

/**
 * En un consultorio el médico es también el dueño de la cuenta: además de lo del médico, configura, cobra,
 * registra llegadas, ve reportes y bitácora y agrega a su asistente. Los demás roles no existen en un consultorio.
 */
const OFFICE_PERMISSIONS: Partial<Record<Role, Permission[]>> = {
  doctor: [...new Set<Permission>([...ROLE_PERMISSIONS.doctor, 'checkin.manage', 'inpatient.care', 'staff.manage', 'settings.manage', 'schedule.manage',
    'drugs.manage', 'reports.view', 'audit.view'])],
  assistant: ROLE_PERMISSIONS.assistant,
}

/** Permisos de un rol según el tipo de cuenta. En una clínica son exactamente los de siempre. */
export function permissionsFor(role: Role, kind: ClinicKind = 'clinic'): Permission[] {
  return kind === 'office' ? OFFICE_PERMISSIONS[role] ?? [] : ROLE_PERMISSIONS[role]
}

/** Roles que se pueden dar a alguien en cada tipo de cuenta. */
export const ROLES_BY_KIND: Record<ClinicKind, Exclude<Role, 'superadmin'>[]> = {
  clinic: ['admin', 'doctor', 'nurse', 'reception'],
  office: ['doctor', 'assistant'],
}

export const ROLE_LABEL: Record<Role, string> = {
  superadmin: 'Administración de Clinara',
  admin: 'Administración',
  doctor: 'Médico',
  nurse: 'Enfermería',
  reception: 'Recepción',
  assistant: 'Asistente',
}

export const ROLE_SUMMARY: Record<Role, string> = {
  superadmin: 'Crea y administra clínicas y sus usuarios. No ve expedientes de pacientes.',
  admin: 'Configura la clínica, el personal y los precios, y revisa indicadores. Sin acceso a notas clínicas.',
  doctor: 'Atiende su agenda, registra pacientes nuevos, escribe consultas, diagnostica, emite recetas, cobra cuando hace falta e ingresa y evoluciona a pacientes hospitalizados.',
  nurse: 'Recibe al paciente, lo registra si llega sin expediente, toma la preclínica y, en hospitalización, administra medicamentos y escribe notas de enfermería. También puede cobrar.',
  reception: 'Agenda citas, registra pacientes, controla la sala de espera y cobra.',
  assistant: 'En el consultorio: agenda citas, recibe y registra al paciente, toma la preclínica, cobra y aplica los medicamentos que el médico indica en observación.',
}

/** ¿Puede este usuario (rol y tipo de cuenta) hacer esto? Con sólo el rol, se asume una clínica. */
export const can = (who: Role | { role: Role; clinicKind?: ClinicKind }, p: Permission) =>
  (typeof who === 'string' ? ROLE_PERMISSIONS[who] : permissionsFor(who.role, who.clinicKind)).includes(p)

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
