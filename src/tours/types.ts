import type { Permission } from '../lib/permissions.js'

/**
 * RG1: un paso de un recorrido guiado. Los textos viven en los archivos de esta carpeta (uno por rol), separados de
 * las pantallas: se corrigen sin tocar la lógica. `target` es el atributo `data-tour` del elemento que se resalta.
 */
export interface TourStep {
  title: string
  body: string
  /** `data-tour` del elemento. Sin él, el paso es una tarjeta al centro. «nav:/app/...» es una opción del menú. */
  target?: string
  /** Pantalla a la que el recorrido va antes de mostrar el paso. Con función, usa un paciente de la demo. */
  route?: string | ((c: TourCtx) => string | undefined)
  /** Sólo si el rol activo tiene este permiso. */
  perm?: Permission
  /** Sólo si la cuenta tiene hospitalización u observación. */
  feature?: 'hospital' | 'observation' | 'multiDoctor'
}

/** Rutas armadas con los datos de la clínica (los pasos que necesitan un paciente usan uno real de la demo). */
export interface TourCtx {
  /** Expediente de un hospitalizado (o de alguien en observación si no hay camas). */
  stay?: string
  /** Nota de consulta firmada (la que ingresó a un paciente). */
  consultNote?: string
}

/** El último paso de todos los recorridos: dónde volver a verlo. */
export const HELP: TourStep = {
  target: 'help', title: 'Ver el recorrido otra vez',
  body: 'Toca el ícono de ayuda cuando quieras repetir este recorrido. En las pantallas con más detalle (consulta, expediente, signos vitales y caja) también explica esa pantalla.',
}
export const SEARCH: TourStep = {
  target: 'search', perm: 'patients.view', title: 'Buscador de pacientes',
  body: 'Desde cualquier pantalla, con Ctrl K, encuentras a un paciente por nombre, expediente, teléfono o identidad.',
}
