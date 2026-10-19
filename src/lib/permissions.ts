import type { Role } from './types'

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
  'staff.manage': 'Gestionar personal y roles',
  'reports.view': 'Ver indicadores de la clínica',
  'audit.view': 'Ver bitácora de accesos',
} as const

export type Permission = keyof typeof PERMISSIONS

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    'agenda.view', 'agenda.manage', 'checkin.manage', 'patients.view', 'patients.manage',
    'staff.manage', 'reports.view', 'audit.view',
  ],
  doctor: [
    'agenda.view', 'agenda.manage', 'patients.view', 'chart.view', 'vitals.record',
    'consult.write', 'rx.write', 'rx.view',
  ],
  nurse: ['agenda.view', 'checkin.manage', 'patients.view', 'chart.view', 'vitals.record', 'rx.view'],
  reception: ['agenda.view', 'agenda.manage', 'checkin.manage', 'patients.view', 'patients.manage'],
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administración',
  doctor: 'Médico',
  nurse: 'Enfermería',
  reception: 'Recepción',
}

export const ROLE_SUMMARY: Record<Role, string> = {
  admin: 'Configura la clínica, el personal y revisa indicadores. Sin acceso a notas clínicas.',
  doctor: 'Atiende su agenda, escribe consultas, diagnostica y emite recetas firmadas.',
  nurse: 'Recibe al paciente, toma signos vitales y lo deja listo para consulta.',
  reception: 'Agenda citas, registra pacientes y controla la sala de espera.',
}

export const can = (role: Role, p: Permission) => ROLE_PERMISSIONS[role].includes(p)
