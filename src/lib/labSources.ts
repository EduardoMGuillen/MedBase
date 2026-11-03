import { GENERATED } from './labRef/generated.js'

/**
 * UM1 y UM2 (ronda 8): las 59 fuentes de «Valores de referencia de laboratorio — Catálogo completo», tal como vienen en el
 * archivo (código, cita completa, enlace). Las lee el script del .md; también quedan en la base (tabla lab_sources).
 */
export interface LabSource { title: string; urls: string[] }

export const LAB_SOURCES: Record<string, LabSource> = Object.fromEntries(GENERATED.sources.map((s) => [s.code, { title: s.citation, urls: s.urls }]))

/** «‡»: resultado esperado por definición, sin fuente específica verificada (no se inventó ninguna cita). */
export const NO_SOURCE = '‡'

/** Cómo se rotula cada fuente en pantalla: «ABIM 2026», «Sin fuente específica verificada», «Definido por la clínica»… */
export function sourceLabel(code: string) {
  if (code === NO_SOURCE) return 'Sin fuente específica verificada'
  if (code === 'clinic') return 'Definido por la clínica'
  if (code === 'initial') return 'Valor inicial de Clinara (sin fuente) · VALIDAR: Emil'
  return code.replace(/-(\d{4})$/, ' $1').replace(/-/g, ' ')
}
