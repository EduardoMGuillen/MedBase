import './tz.js'
import { createSql, type Sql } from './sql.js'
import { localDate } from './http.js'

/**
 * CX2 (ronda 8): busca combinaciones imposibles en los datos. Sólo reporta: no corrige nada (Emil decide qué se hace).
 *
 *   npx tsx server/incongruencias.ts            → la base local (PGlite)
 *   npx tsx server/incongruencias.ts .env.prod  → la base de ese archivo (DATABASE_URL), sólo lectura
 */
const QUEUE = `('arrived','triaged','in_consult')`
const OPEN = `('scheduled','confirmed','arrived','triaged','in_consult')`

export async function findIncongruities(sql: Sql, today = localDate(new Date())) {
  const checks: { title: string; query: string; params?: unknown[] }[] = [
    { title: 'Paciente con dos o más estancias activas a la vez',
      query: `SELECT clinic_id, patient_id, COUNT(*) AS n FROM hospitalizations WHERE status = 'active' GROUP BY clinic_id, patient_id HAVING COUNT(*) > 1` },
    { title: 'Cita abierta hoy de un paciente con estancia activa (Por llegar, En sala o Lista para consulta)',
      query: `SELECT a.clinic_id, a.id, a.patient_id, a.status FROM appointments a JOIN hospitalizations h ON h.patient_id = a.patient_id AND h.clinic_id = a.clinic_id AND h.status = 'active'
        WHERE a.status IN ${OPEN} AND a.start >= ? AND a.start < ?`, params: [today, `${today}T99`] },
    { title: 'Paciente con más de una cita en la cola de hoy a la vez (En sala, Lista para consulta o En consulta)',
      query: `SELECT clinic_id, patient_id, COUNT(*) AS n, string_agg(status, ', ') AS estados FROM appointments WHERE status IN ${QUEUE} AND start >= ? AND start < ?
        GROUP BY clinic_id, patient_id HAVING COUNT(*) > 1`, params: [today, `${today}T99`] },
    { title: 'Cita de un día anterior que quedó en la cola (En sala, Lista para consulta o En consulta)',
      query: `SELECT clinic_id, id, patient_id, status, start FROM appointments WHERE status IN ${QUEUE} AND start < ?`, params: [today] },
    { title: 'Cita en cola de un paciente cuyo último egreso fue por traslado a otro centro, el mismo día',
      query: `SELECT a.clinic_id, a.id, a.patient_id, a.status FROM appointments a JOIN hospitalizations h ON h.patient_id = a.patient_id AND h.clinic_id = a.clinic_id
        WHERE h.status = 'discharged' AND h.outcome = 'referred' AND substr(h.discharged_at, 1, 10) = substr(a.start, 1, 10) AND a.status IN ${QUEUE} AND a.start >= COALESCE(h.discharged_at, '')` },
    { title: 'Estancia activa con fecha de egreso, o egresada sin fecha de egreso',
      query: `SELECT clinic_id, id, patient_id, status FROM hospitalizations WHERE (status = 'active' AND discharged_at IS NOT NULL) OR (status = 'discharged' AND discharged_at IS NULL)` },
    { title: 'Hospitalizado (no observación) sin cama, o en una cama fuera de servicio',
      query: `SELECT h.clinic_id, h.id, h.patient_id FROM hospitalizations h LEFT JOIN beds b ON b.id = h.bed_id
        WHERE h.status = 'active' AND h.kind = 'hospital' AND (h.bed_id IS NULL OR b.active = FALSE)` },
    { title: 'Cita «Atendida» sin consulta firmada',
      query: `SELECT a.clinic_id, a.id, a.patient_id FROM appointments a WHERE a.status = 'done' AND NOT EXISTS (SELECT 1 FROM consultations c WHERE c.appointment_id = a.id)` },
  ]
  const out: { title: string; count: number; sample: Record<string, unknown>[] }[] = []
  for (const c of checks) {
    const rows = await sql.query(c.query, c.params ?? []).catch((e) => [{ error: (e as Error).message }])
    out.push({ title: c.title, count: rows.length, sample: rows.slice(0, 5) })
  }
  return out
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const env = process.argv[2]
  if (env) process.loadEnvFile(env)
  else delete process.env.DATABASE_URL
  const sql = createSql()
  for (const r of await findIncongruities(sql)) {
    console.log(`${r.count ? '✗' : '✓'} ${r.title}: ${r.count}`)
    for (const s of r.sample) console.log('   ', JSON.stringify(s))
  }
  await sql.close()
}
