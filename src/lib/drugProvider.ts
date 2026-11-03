import { DRUGS, type Drug, type DrugLnme } from './catalogs'
import type { ClinicDrug } from './types'
import { LNME_BASE } from './lnme/generated'
import { formRoute } from './lnme/route'

/**
 * AD4: capa intermedia del vademécum ("proveedor de medicamentos"). Las pantallas (recetar, Mi vademécum,
 * Configuración) piden los medicamentos a un proveedor, no al catálogo directamente. Hoy el único proveedor es el
 * local: el catálogo base de Clinara más lo que agregó la clínica. Para conectar una API externa (por ejemplo VIDAL
 * Vademecum Integrated) se agrega otro proveedor con esta misma forma, que consulta por medio del servidor (las
 * credenciales nunca viajan al navegador). Ver docs/VADEMECUM_EXTERNO.md.
 */
export interface DrugProvider {
  id: string
  /** Nombre que se muestra ("Catálogo de Clinara", "VIDAL"). */
  label: string
  /** Medicamentos disponibles para la clínica (los inactivos no). */
  catalog(clinicDrugs: ClinicDrug[]): Drug[]
  /** Búsqueda por nombre genérico, comercial o presentación. Un proveedor externo la resuelve en el servidor. */
  search(query: string, clinicDrugs: ClinicDrug[], limit?: number): Promise<Drug[]>
  /**
   * Revisión de la receta (interacciones, alergias, dosis, duplicidad). El local sólo cruza alergias por grupo
   * (`allergyConflict` en catalogs.ts); un proveedor externo devolvería aquí sus alertas.
   */
  checks?(items: { drug: string; dose?: string }[], patient: { allergies: string[] }): Promise<{ level: 'info' | 'warning' | 'critical'; text: string }[]>
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Un medicamento agregado por la clínica, con la forma del catálogo. */
export const fromClinicDrug = (d: ClinicDrug): Drug => ({
  name: d.name, presentation: [d.presentation, d.concentration].filter(Boolean).join(' '), group: 'clínica', brand: d.brand, clinicId: d.id,
  usual: d.route ? { dose: d.usualDose ?? '', route: d.route, frequency: 'Cada 8 horas', duration: '' } : undefined,
  ...(d.lnme ? {
    aliases: d.lnme.aliases,
    lnme: lnmeTag({ no: d.lnme.no, complementary: d.lnme.complementary, certainty: d.lnme.certainty, restriction: d.lnme.restriction,
      // Si la clínica cambió la presentación, «También: …» ya no corresponde
      alternatives: d.presentation === undefined || d.lnme.presentationFull?.startsWith(d.presentation) ? d.lnme.alternatives : [],
      own: d.lnme.match === 'created', routes: d.lnme.routes ?? '', name: d.lnme.name, form: d.lnme.form ?? '' }),
  } : {}),
})

/** ME5: la etiqueta LNME de un medicamento (la que lee el buscador). */
function lnmeTag(x: { no: number; complementary: boolean; certainty: string; restriction?: string; alternatives: string[]; own: boolean; routes: string; name: string; form: string }): DrugLnme {
  return {
    no: x.no, complementary: x.complementary || undefined, unconfirmed: x.certainty === 'unconfirmed' || undefined, restriction: x.restriction,
    alternatives: x.alternatives.length ? x.alternatives : undefined, own: x.own || undefined, route: x.own ? formRoute(x.routes, x.name, x.form) : undefined,
  }
}

/** ME5: el catálogo base, con la etiqueta del LNME en los que son una fila del listado (los datos de Clinara no cambian). */
const BASE: Drug[] = DRUGS.map((d) => {
  const link = LNME_BASE.find((l) => l.base === `${d.name}|${d.presentation}`)
  if (!link) return d
  const it = link.item
  return {
    ...d, aliases: [...new Set([...(it.name !== d.name ? [it.name] : []), ...it.aliases])].filter((a) => norm(a) !== norm(d.name)),
    lnme: lnmeTag({ ...it, alternatives: [], own: false }), ...(link.foldedInto ? { foldedInto: link.foldedInto } : {}),
  }
})

/**
 * ME5: búsqueda del vademécum por nombre genérico, comercial o alias (sin tildes ni mayúsculas). Primero los que empiezan
 * con lo escrito; los repetidos por sinónimo del catálogo base no salen dos veces. La usan los dos formularios de medicamento.
 */
export function searchDrugs(drugs: Drug[], query: string, limit: number): Drug[] {
  const q = norm(query)
  const list = drugs.filter((d) => !d.foldedInto)
  if (!q) return list.slice(0, limit)
  const names = (d: Drug) => [d.name, d.brand ?? '', ...(d.aliases ?? [])].map(norm)
  const hits = list.filter((d) => names(d).some((n) => n.includes(q)))
  const starts = hits.filter((d) => names(d).some((n) => n.startsWith(q)))
  return [...starts, ...hits.filter((d) => !starts.includes(d))].slice(0, limit)
}

/**
 * ME5: la vía al elegir un medicamento. Los del LNME creados por la carga toman la del listado si hay una sola
 * equivalente; si no, se deja la que estaba (no se precarga). `undefined`: no es del listado, sigue la regla de siempre.
 */
export const lnmeRoute = (d: Drug, current?: string): string | undefined => (d.lnme?.own ? d.lnme.route ?? current : undefined)

export const localDrugProvider: DrugProvider = {
  id: 'local',
  label: 'Catálogo de Clinara y vademécum de la clínica',
  catalog: (clinicDrugs) => [...BASE, ...clinicDrugs.filter((d) => d.active).map(fromClinicDrug)],
  async search(query, clinicDrugs, limit = 20) {
    return searchDrugs(this.catalog(clinicDrugs), query, limit)
  },
}

/** El proveedor con que trabaja la app. Cambiarlo aquí cambia todas las pantallas. */
export const drugProvider: DrugProvider = localDrugProvider

/** ¿Es del catálogo base (no se edita) o lo agregó la clínica? */
export const isBaseDrug = (d: Drug) => !d.clinicId
