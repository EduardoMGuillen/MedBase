import { features, permissionsFor, type Permission } from './permissions.js'
import type { ClinicKind, Role } from './types.js'

/**
 * PF2 (ronda 17): la barra lateral, ordenada por flujo de trabajo y con los mismos grupos para todos los roles:
 *   1. Inicio, Agenda, Recetas y Caja (o Cobrar);
 *   2. Pacientes: Consulta externa, Observación, Hospitalizados, Biblioteca de pacientes, Crónicos y seguimientos;
 *   3. Laboratorio e imágenes: lo de los departamentos y los pacientes ambulatorios (para Laboratorio se llama «Laboratorio» y para
 *      Imágenes, «Imágenes»: solo ven lo suyo);
 *   4. Registros: uso de medicamentos y material, rol de turnos (también el de Laboratorio e Imágenes);
 *   5. Administración (o «Mi consultorio»): reportes, personal y configuración.
 * Vive aquí (sin íconos ni React) para que la pantalla y las pruebas usen la misma regla. Los íconos los pone AppShell por ruta.
 */
export const NAV_GROUPS = ['Pacientes', 'Laboratorio e imágenes', 'Registros', 'Administración'] as const
export type NavGroupName = (typeof NAV_GROUPS)[number]

export interface NavEntry { to: string; label: string; perm?: Permission; anyPerm?: Permission[]; end?: boolean; group?: NavGroupName; roles?: Role[] }

export const NAV: NavEntry[] = [
  { to: '/app', label: 'Inicio', end: true },
  { to: '/app/agenda', label: 'Agenda', perm: 'agenda.view' },
  // MC7: el médico ve Recetas y Cobrar debajo de Agenda. Recetas sin consulta: renovar un tratamiento sin abrir una consulta completa
  { to: '/app/recetas', label: 'Recetas', perm: 'rx.write' },
  { to: '/app/caja', label: 'Caja', perm: 'billing.manage' },
  // Pacientes se divide en las tres áreas que pidió el médico, más la biblioteca y los crónicos
  { to: '/app/consulta-externa', label: 'Consulta externa', perm: 'agenda.view', group: 'Pacientes' },
  // AD1 (ronda 17): administración y recepción ven la lista de Observación en solo lectura (sin expediente)
  { to: '/app/observacion', label: 'Observación', perm: 'inpatient.view', anyPerm: ['observation.board'], group: 'Pacientes' },
  // HO2 (ronda 16): recepción y administración entran al tablero de camas para ingresar (sin ver el expediente)
  { to: '/app/hospitalizados', label: 'Hospitalizados', perm: 'inpatient.view', anyPerm: ['inpatient.admit'], group: 'Pacientes' },
  { to: '/app/pacientes', label: 'Biblioteca de pacientes', perm: 'patients.view', group: 'Pacientes' },
  { to: '/app/seguimientos', label: 'Crónicos y seguimientos', perm: 'followups.view', group: 'Pacientes' },
  // AD1 (ronda 17): administración y recepción: los pacientes ambulatorios (registrar y ver el estado, sin resultados) y,
  // administración, las dos bandejas en solo lectura
  { to: '/app/pacientes-ambulatorios', label: 'Pacientes ambulatorios', perm: 'ambulatory.register', roles: ['admin', 'reception'], group: 'Laboratorio e imágenes' },
  { to: '/app/laboratorio', label: 'Laboratorio', perm: 'dept.view', roles: ['admin'], group: 'Laboratorio e imágenes' },
  { to: '/app/imagenes', label: 'Imágenes', perm: 'dept.view', roles: ['admin'], group: 'Laboratorio e imágenes' },
  // LB5 e IM1 (ronda 12): Laboratorio e Imágenes trabajan por área. PF2 (ronda 17): sus áreas y su configuración, en su grupo
  { to: '/app/laboratorio/ambulatorio', label: 'Ambulatorio', perm: 'dept.work', roles: ['lab'], group: 'Laboratorio e imágenes' },
  { to: '/app/laboratorio/observacion', label: 'Observación', perm: 'dept.work', roles: ['lab'], group: 'Laboratorio e imágenes' },
  { to: '/app/laboratorio/hospitalizacion', label: 'Hospitalización', perm: 'dept.work', roles: ['lab'], group: 'Laboratorio e imágenes' },
  { to: '/app/imagenes/ambulatorio', label: 'Ambulatorio', perm: 'dept.work', roles: ['imaging'], group: 'Laboratorio e imágenes' },
  { to: '/app/imagenes/observacion', label: 'Observación', perm: 'dept.work', roles: ['imaging'], group: 'Laboratorio e imágenes' },
  { to: '/app/imagenes/hospitalizacion', label: 'Hospitalización', perm: 'dept.work', roles: ['imaging'], group: 'Laboratorio e imágenes' },
  { to: '/app/configuracion-laboratorio', label: 'Configuración de laboratorio', perm: 'dept.work', roles: ['lab'], group: 'Laboratorio e imágenes' },
  { to: '/app/configuracion-imagenes', label: 'Configuración de imágenes', perm: 'dept.work', roles: ['imaging'], group: 'Laboratorio e imágenes' },
  // RU6 (ronda 15): registro administrativo de material bajo el encabezado «Registros»
  { to: '/app/uso-medicamentos-material', label: 'Uso de medicamentos y material', perm: 'usage.view', group: 'Registros' },
  // EN1 (ronda 16): el rol de turnos de enfermería. PF2 (ronda 17): el de Laboratorio e Imágenes también va en «Registros»
  { to: '/app/rol-de-turnos-enfermeria', label: 'Rol de turnos', perm: 'roster.view', roles: ['nurse'], group: 'Registros' },
  { to: '/app/rol-de-turnos', label: 'Rol de turnos', perm: 'dept.work', roles: ['lab', 'imaging'], group: 'Registros' },
  { to: '/app/reportes', label: 'Reportes', perm: 'reports.view', group: 'Administración' },
  { to: '/app/personal', label: 'Personal y roles', perm: 'staff.manage', group: 'Administración' },
  // Ronda 8: «Configuración» (la de cada persona) va abajo, sobre el perfil; la de la clínica se nombra completa para no repetirla
  { to: '/app/configuracion', label: 'Configuración de la clínica', perm: 'settings.manage', group: 'Administración' },
]

/** Lo que la barra muestra: la entrada con su nombre y el título del grupo para este rol y esta cuenta. */
export interface NavItem { to: string; label: string; end?: boolean; group?: string }

export interface NavWho { role: Role; kind?: ClinicKind; position?: string; observationEnabled?: boolean; permissions?: Permission[] }

const RANK: Record<NavGroupName, number> = { Pacientes: 20, 'Laboratorio e imágenes': 25, Registros: 30, Administración: 40 }

/** El título del grupo según el rol y la cuenta. */
export function groupTitle(g: NavGroupName, role: Role, office: boolean): string {
  if (g === 'Administración' && office) return 'Mi consultorio'
  if (g === 'Laboratorio e imágenes' && role === 'lab') return 'Laboratorio'
  if (g === 'Laboratorio e imágenes' && role === 'imaging') return 'Imágenes'
  return g
}

/** PF2 (ronda 17): las entradas de la barra lateral de un rol, en orden. `permissions` (los de la sesión) manda si viene. */
export function sidebarFor(who: NavWho): NavItem[] {
  if (who.role === 'superadmin') return [{ to: '/app', label: 'Clínicas y consultorios', end: true }]
  const kind = who.kind ?? 'clinic'
  const perms = who.permissions ?? permissionsFor(who.role, kind, who.position)
  const f = features({ kind, observationEnabled: who.observationEnabled })
  const dept = who.role === 'lab' || who.role === 'imaging'
  return NAV.filter((n) => {
    if (n.perm && !perms.includes(n.perm) && !n.anyPerm?.some((p) => perms.includes(p))) return false
    if (n.roles && !n.roles.includes(who.role)) return false
    if (n.to === '/app/hospitalizados' && !f.hospital) return false
    if (n.to === '/app/observacion' && !f.observation) return false
    // AD1 (ronda 17): los ambulatorios de laboratorio e imágenes son de las clínicas (un consultorio no tiene departamentos)
    if (n.to === '/app/pacientes-ambulatorios' && !f.hospital) return false
    // Enfermería entra al paciente: no usa la agenda
    if (who.role === 'nurse' && n.to === '/app/agenda') return false
    // MI1: el titular de un consultorio en su vista de administrador ve sólo lo administrativo (lo clínico, en la de médico)
    if (f.office && who.role === 'admin' && n.group === 'Pacientes') return false
    // LB5 e IM1 (ronda 12): Laboratorio e Imágenes ven sus áreas, no las listas de Observación y Hospitalizados de enfermería
    if (dept && (n.to === '/app/observacion' || n.to === '/app/hospitalizados')) return false
    return true
  }).map((n) => ({
    to: n.to, end: n.end,
    label: f.office && n.to === '/app/personal' ? 'Personal' : f.office && n.to === '/app/configuracion' ? 'Configuración del consultorio'
      : who.role === 'doctor' && n.to === '/app/caja' ? 'Cobrar' : n.label,
    group: n.group ? groupTitle(n.group, who.role, f.office) : undefined,
    rank: n.group ? RANK[n.group] : 10,
  })).sort((a, b) => a.rank - b.rank).map(({ rank: _r, ...x }) => { void _r; return x })
}
