import type { Sql } from './sql.js'
import { DEPT_SHIFTS } from '../src/lib/clinicalConfig.js'
import { localISODate } from '../src/lib/format.js'

/** EX6/DP1 (ronda 11): los microbiólogos activos de la clínica. */
export async function microbiologistsFor(q: Sql, clinicId: string) {
  return (await q.query(`SELECT id, name FROM staff WHERE clinic_id = ? AND active AND position = 'microbiologist' AND COALESCE(roles, '') LIKE '%"lab"%' ORDER BY name`, [clinicId]))
    .map((r) => ({ id: String(r.id), name: String(r.name) }))
}

const minutes = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }

/**
 * DP6 (ronda 11): quién está de turno ahora en un departamento según el rol de turnos (informativo). La Noche (23:00–07:00)
 * empieza un día y termina el siguiente: de madrugada cuenta la del día anterior.
 */
export async function onDutyNow(q: Sql, clinicId: string, dept: 'lab' | 'imaging' | 'nursing', now = new Date()) {
  const today = localISODate(now)
  const y = new Date(now); y.setDate(y.getDate() - 1)
  const yesterday = localISODate(y)
  const hm = Number(now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Tegucigalpa' }).split(':').reduce((a, b, i) => (i ? a + Number(b) : Number(b) * 60), 0))
  const rows = await q.query(`SELECT staff_id, day, shift FROM duty_roster WHERE clinic_id = ? AND dept = ? AND removed_at IS NULL AND day IN (?, ?)`, [clinicId, dept, today, yesterday])
  const ids = new Set<string>()
  for (const r of rows) {
    const s = DEPT_SHIFTS[dept].find((x) => x.key === r.shift)
    if (!s) continue
    const from = minutes(s.from), to = minutes(s.to)
    const overnight = to <= from
    if (r.day === today && (overnight ? hm >= from : hm >= from && hm < to)) ids.add(String(r.staff_id))
    if (r.day === yesterday && overnight && hm < to) ids.add(String(r.staff_id))
  }
  return [...ids]
}
