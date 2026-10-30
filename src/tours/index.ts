import type { ClinicKind, Role } from '../lib/types.js'
import { features, permissionsFor } from '../lib/permissions.js'
import type { TourStep } from './types.js'
import { recepcion } from './recepcion.js'
import { enfermeria } from './enfermeria.js'
import { medico } from './medico.js'
import { administracion } from './administracion.js'
import { asistente, consultorio, plataforma } from './consultorio.js'

export type { TourCtx, TourStep } from './types.js'
export { miniTourFor, PANTALLAS } from './pantallas.js'

/**
 * Recorrido del rol activo. En un consultorio, el titular (médico y administrador) tiene uno combinado para sus dos
 * vistas. La clave sirve para recordar si lo terminó, lo saltó o en qué paso iba.
 */
export function tourKey(role: Role, kind: ClinicKind = 'clinic'): string {
  if (role === 'superadmin') return 'plataforma'
  if (kind === 'office' && (role === 'doctor' || role === 'admin')) return 'consultorio'
  return ({ reception: 'recepcion', nurse: 'enfermeria', doctor: 'medico', admin: 'administracion', assistant: 'asistente' } as Record<string, string>)[role] ?? role
}

const TOURS: Record<string, TourStep[]> = { recepcion, enfermeria, medico, administracion, consultorio, asistente, plataforma }

/** Pasos del recorrido sin los de pantallas o permisos que esta cuenta y este rol no tienen. */
export function tourFor(role: Role, kind: ClinicKind = 'clinic', opts: { observationEnabled?: boolean } = {}): TourStep[] {
  const perms = permissionsFor(role, kind)
  const f = features({ kind, observationEnabled: opts.observationEnabled })
  return TOURS[tourKey(role, kind)].filter((s) => (!s.perm || perms.includes(s.perm)) && (!s.feature || f[s.feature]))
}
