/**
 * ME13 (ronda 14): diagnóstico de SOLO LECTURA. Cuenta las observaciones que nacieron de un medicamento «Aplicar en la clínica»
 * sin que el médico marcara «Ingreso a observación» (el error que corrige ME13). No cambia nada: el médico les da egreso.
 *
 * Cómo se reconocen: hasta la ronda 13, al marcar «Ingreso a observación» el servidor marcaba TODOS los medicamentos de la
 * consulta como «Aplicar en la clínica». Si la consulta que originó la observación tiene algún medicamento SIN esa marca, el
 * ingreso vino del error (seguro). Si todos la tienen, pudo ser cualquiera de los dos casos (se cuentan aparte, «dudosos»).
 *
 *   npx tsx scripts/me13-diagnose.ts                     # base local (data/pglite o PGLITE_DIR)
 *   npx tsx scripts/me13-diagnose.ts .env.neon.local     # la base de Neon (producción)
 */
import { createSql } from '../server/sql.js'
import type { PrescriptionItem } from '../src/lib/types.js'

try { if (process.argv[2]) process.loadEnvFile(process.argv[2]) } catch { /* opcional */ }
const sql = createSql()
try {
  const rows = await sql.query(`SELECT h.id, h.status, h.admitted_at, h.discharged_at, c.meds, cl.name AS clinic, p.first_name, p.last_name
    FROM hospitalizations h JOIN consultations c ON c.id = h.consultation_id JOIN clinics cl ON cl.id = h.clinic_id JOIN patients p ON p.id = h.patient_id
    WHERE h.kind = 'observation' AND c.meds IS NOT NULL ORDER BY cl.name, h.admitted_at`)
  let sure = 0, unsure = 0, active = 0
  for (const r of rows) {
    const items = JSON.parse(String(r.meds)) as PrescriptionItem[]
    if (!items.some((it) => it.applyInClinic)) continue
    // Desde la ronda 14 la casilla se guarda explícita (false): esas consultas ya no crean observación por un medicamento
    if (items.some((it) => it.applyInClinic === false)) continue
    const fromError = items.some((it) => it.applyInClinic === undefined)
    if (fromError) sure++
    else unsure++
    if (fromError && r.status === 'active') active++
    if (fromError) console.log(`${r.clinic} · ${r.first_name} ${r.last_name} · desde ${String(r.admitted_at).slice(0, 16)} · ${r.status === 'active' ? 'SIGUE EN OBSERVACIÓN' : `egreso ${String(r.discharged_at ?? '').slice(0, 16)}`}`)
  }
  console.log(`\nObservaciones creadas por «Aplicar en la clínica» sin «Ingreso a observación»: ${sure} (${active} siguen activas).`)
  console.log(`Dudosas (todos los medicamentos marcados: pudo ser el error o el ingreso marcado): ${unsure}.`)
} finally {
  await sql.close()
}
