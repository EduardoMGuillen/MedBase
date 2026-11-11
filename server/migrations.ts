import type { Sql } from './sql.js'

/**
 * Cambios de esquema y de datos posteriores a la versión base (`server/schema.ts`).
 *
 * Cada paso corre UNA sola vez por base, en orden, dentro de la transacción de `ensureDb`; el último paso aplicado
 * queda en `meta.schema_step`. Una base nueva ejecuta el esquema base y después todos los pasos.
 *
 * Reglas:
 * - Los pasos solo se agregan al final, con el número siguiente. Un paso ya publicado no se edita ni se reordena:
 *   las bases que ya lo aplicaron no lo vuelven a correr.
 * - Un paso puede ser destructivo o estrechar una restricción sin peligro: a diferencia del esquema base, no se repite.
 * - Si el paso crea una tabla con datos de pacientes, agrégala a PATIENT_TABLES (`server/demoData.ts`); la prueba
 *   «la lista de borrado sale del esquema» falla si se olvida.
 *
 * Ejemplo:
 *   { id: 1, name: 'citas: columna de sala', run: (q) => q.exec(`ALTER TABLE appointments ADD COLUMN room TEXT`) },
 */
export interface Step {
  id: number
  name: string
  run: (q: Sql) => Promise<void>
}

export const STEPS: Step[] = []

/** Falla al arrancar si los pasos no están numerados 1, 2, 3… sin huecos ni repetidos. */
export function checkSteps(steps: Step[]) {
  steps.forEach((s, i) => {
    if (s.id !== i + 1) throw new Error(`Pasos de migración mal numerados: en la posición ${i + 1} está el paso ${s.id} («${s.name}»).`)
  })
}
