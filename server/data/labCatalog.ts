/**
 * CF3 y CF6 (ronda 6): exámenes de laboratorio y perfiles que se cargan en el catálogo de cada clínica y consultorio.
 *
 * FUENTE: Anexo A (exámenes y tabla de equivalencias) y Anexo B (perfiles) del pedido de la ronda 6, tomados de la lista
 * de exámenes de un laboratorio comercial (sólo los nombres). Esos anexos NO llegaron con el pedido (el texto se cortó y
 * el PDF no se adjuntó): las tres listas están vacías a propósito, para no inventar exámenes ni perfiles.
 *
 * Para cargarlos: pegar aquí los nombres tal cual, con su subgrupo, subir `SCHEMA_VERSION` en `server/db.ts` y desplegar.
 * La carga (`loadLabCatalog` en `server/catalogLoader.ts`) es idempotente: compara por nombre normalizado (sin mayúsculas,
 * tildes ni signos) y por la tabla de equivalencias, así que correrla dos veces no duplica nada.
 */

/** Un examen del Anexo A: nombre tal cual y subgrupo (los de `LAB_SUBGROUPS`; si no se sabe, «Otros»). */
export interface LabCatalogEntry { name: string; subgroup: string }

/** Anexo A: exámenes de laboratorio (páginas 1 y 3 del PDF y los que sólo aparecen dentro de los perfiles). */
export const LAB_CATALOG: LabCatalogEntry[] = [
  // Pendiente: Anexo A
]

/**
 * Tabla de equivalencias del Anexo A: nombre del PDF → nombre del examen que ya existe en el catálogo. Lo que está aquí
 * no se agrega (ya existe) y sirve para enlazar los componentes de los perfiles. Ejemplos que da el pedido (CF6).
 */
export const LAB_EQUIVALENCES: Record<string, string> = {
  'Orina general': 'Examen general de orina (EGO)',
  'Heces general': 'Examen general de heces',
  'Hemograma completo': 'Hemograma',
  'Grupo sanguíneo y Rh': 'Tipo y Rh',
}

/** Anexo B: perfiles de laboratorio de la clínica (sólo nombres del perfil y de sus exámenes). */
export interface LabProfileEntry { name: string; items: string[] }
export const LAB_PROFILES: LabProfileEntry[] = [
  // Pendiente: Anexo B
]
