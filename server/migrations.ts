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

export const STEPS: Step[] = [
  // NP1 (ronda 18): nota para el equipo del paciente. Una fila por versión (nada se borra): la vigente es la última y
  // «Quitar nota» es una versión con el texto vacío. Con IF NOT EXISTS: si una base vuelve a ejecutar el esquema base, los pasos
  // corren otra vez desde el primero.
  { id: 1, name: 'pacientes: nota para el equipo con historial', run: (q) => q.exec(`
    CREATE TABLE IF NOT EXISTS patient_team_notes (
      id BIGSERIAL PRIMARY KEY,
      clinic_id TEXT NOT NULL REFERENCES clinics(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      text TEXT NOT NULL,
      author_id TEXT NOT NULL REFERENCES staff(id),
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS patient_team_notes_patient ON patient_team_notes (clinic_id, patient_id, id);
  `) },
  // AN1 (ronda 18): rol «Anestesia» (cargo «Técnico(a) en anestesia»). Solo ensancha la lista de roles admitidos
  { id: 2, name: 'personal: rol de anestesia', run: async (q) => {
    await q.exec(`ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_role_check`)
    await q.exec(`ALTER TABLE staff ADD CONSTRAINT staff_role_check CHECK (role IN ('superadmin','admin','doctor','nurse','reception','assistant','lab','imaging','anesthesia'))`)
  } },
]

/** Falla al arrancar si los pasos no están numerados 1, 2, 3… sin huecos ni repetidos. */
export function checkSteps(steps: Step[]) {
  steps.forEach((s, i) => {
    if (s.id !== i + 1) throw new Error(`Pasos de migración mal numerados: en la posición ${i + 1} está el paso ${s.id} («${s.name}»).`)
  })
}
