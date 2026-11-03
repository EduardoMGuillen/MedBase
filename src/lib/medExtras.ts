/**
 * ME3 y ME4 (ronda 9): la lógica compartida de la «primera dosis distinta» (STAT) y de la nebulización, para TODOS los
 * formularios de medicamento (nota de ingreso, evolución, postquirúrgica, observación, hospitalización, consulta externa,
 * receta de salida del egreso, Consultorio). Un solo generador de texto: la nota, la hoja de enfermería, «Medicamentos
 * activos», la receta y la impresión dicen lo mismo.
 */
import { LOADING_DOSE_ROUTES, NEB_DILUENTS } from './clinicalConfig.js'

export const NEB_ROUTE = 'Nebulización'

/** Un componente de la nebulización: «Salbutamol» + «3 mL». */
export interface NebComponent { drug: string; amount: string }
/** La nebulización: los componentes y, opcional, en qué se diluye («3 mL» de «SSN 0.9%»). */
export interface Nebulization { components: NebComponent[]; diluentVolume?: string; diluent?: string }

export const isNebulization = (route?: string) => route === NEB_ROUTE

/** «Salbutamol 3 mL + Bromuro de ipratropio 1 mL, diluido en 3 mL de SSN 0.9%». */
export function nebulizationBody(n: Nebulization) {
  const parts = n.components.filter((c) => c.drug.trim()).map((c) => `${c.drug.trim()}${c.amount.trim() ? ` ${c.amount.trim()}` : ''}`)
  const diluent = n.diluent?.trim() && n.diluentVolume?.trim() ? `, diluido en ${n.diluentVolume.trim()} de ${n.diluent.trim()}` : n.diluent?.trim() ? `, diluido en ${n.diluent.trim()}` : ''
  return `${parts.join(' + ')}${diluent}`
}

/** «Nebulizar con: Salbutamol 3 mL + Bromuro de ipratropio 1 mL, diluido en 3 mL de SSN 0.9% · c/6h». */
export const nebulizationLine = (n: Nebulization, freq: string) => `Nebulizar con: ${nebulizationBody(n)}${freq ? ` · ${freq}` : ''}`

/** ¿La nebulización está completa? Al menos un componente con nombre y cantidad, y el diluyente «Otro» escrito. */
export const nebulizationReady = (n?: Nebulization) => !!n && n.components.some((c) => c.drug.trim() && c.amount.trim())
  && n.components.every((c) => (!c.drug.trim() && !c.amount.trim()) || (c.drug.trim() && c.amount.trim()))

/** «Ceftriaxona IM · 2 g STAT y luego 1 g c/12h» (ME2). `when`: «STAT» o «el 02/11/2026 14:00». */
export const loadingLine = (drug: string, route: string, loading: string, dose: string, freq: string, when = 'STAT') =>
  `${drug} ${route} · ${loading.trim()} ${when} y luego ${dose} ${freq}`.replace(/\s+/g, ' ').trim()

/** ¿La frecuencia admite una primera dosis distinta? Una que se repite (cada X horas): no dosis única, infusión, PRN ni nebulización. */
const repeatingOrder = (o: { everyHours?: number; prn?: boolean; infusion?: boolean; route?: string }) =>
  !!o.everyHours && !o.prn && !o.infusion && !isNebulization(o.route)

/**
 * ¿Se ofrece «Primera dosis diferente (STAT)»? Con una frecuencia que se repite y, desde ME9 (ronda 10), solo por vía
 * intravenosa (LOADING_DOSE_ROUTES, VALIDAR: Emil). Reemplaza ME2 y ME3, que la permitían con cualquier vía; las órdenes ya
 * emitidas con otra vía no cambian (se siguen mostrando y administrando igual).
 */
export const loadingAllowed = (o: { everyHours?: number; prn?: boolean; infusion?: boolean; route?: string }) =>
  repeatingOrder(o) && LOADING_DOSE_ROUTES.includes(o.route ?? '')

/** ME9: la casilla estaba marcada y la vía dejó de ser intravenosa: al agregar no se guarda la dosis inicial (se avisa). */
export const loadingDroppedByRoute = (checked: boolean, o: { everyHours?: number; prn?: boolean; infusion?: boolean; route?: string }) =>
  checked && repeatingOrder(o) && !LOADING_DOSE_ROUTES.includes(o.route ?? '')

export const DILUENT_OPTIONS = NEB_DILUENTS
