import { DRUGS, type Drug } from './catalogs'
import type { ClinicDrug } from './types'

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
})

export const localDrugProvider: DrugProvider = {
  id: 'local',
  label: 'Catálogo de Clinara y vademécum de la clínica',
  catalog: (clinicDrugs) => [...DRUGS, ...clinicDrugs.filter((d) => d.active).map(fromClinicDrug)],
  async search(query, clinicDrugs, limit = 20) {
    const q = norm(query)
    return this.catalog(clinicDrugs).filter((d) => norm(`${d.name} ${d.brand ?? ''} ${d.presentation}`).includes(q)).slice(0, limit)
  },
}

/** El proveedor con que trabaja la app. Cambiarlo aquí cambia todas las pantallas. */
export const drugProvider: DrugProvider = localDrugProvider

/** ¿Es del catálogo base (no se edita) o lo agregó la clínica? */
export const isBaseDrug = (d: Drug) => !d.clinicId
