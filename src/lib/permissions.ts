import type { Role } from './types.js'

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
}

export const ROLE_LABEL: Record<Role, string> = {
  superadmin: 'Administración de Clinara',
  admin: 'Administración',
  doctor: 'Médico',
  nurse: 'Enfermería',
  reception: 'Recepción',
}

export const ROLE_SUMMARY: Record<Role, string> = {
  superadmin: 'Crea y administra clínicas y sus usuarios. No ve expedientes de pacientes.',
  admin: 'Configura la clínica, el personal y los precios, y revisa indicadores. Sin acceso a notas clínicas.',
  doctor: 'Atiende su agenda, registra pacientes nuevos, escribe consultas, diagnostica, emite recetas, cobra cuando hace falta e ingresa y evoluciona a pacientes hospitalizados.',
  nurse: 'Recibe al paciente, lo registra si llega sin expediente, toma la preclínica y, en hospitalización, administra medicamentos y escribe notas de enfermería. También puede cobrar.',
  reception: 'Agenda citas, registra pacientes, controla la sala de espera y cobra.',
}

export const can = (role: Role, p: Permission) => ROLE_PERMISSIONS[role].includes(p)

/** Permisos que se muestran en la matriz de una clínica (sin los de plataforma). */
export const CLINIC_PERMISSIONS = (Object.keys(PERMISSIONS) as Permission[]).filter((p) => p !== 'platform.manage')
