/**
 * UM3 (ronda 10): diagnóstico de SOLO LECTURA de los umbrales críticos archivados de cada clínica, sin migrar ni escribir nada.
 * Dice qué grupos y analitos están archivados, si son predeterminados de la app (UM2), quién los archivó y cuándo (según la
 * bitácora) y qué hizo o hará la limpieza de UM3.
 *
 *   npx tsx scripts/um3-diagnose.ts                     # base local (data/pglite o PGLITE_DIR)
 *   npx tsx scripts/um3-diagnose.ts .env.neon.local     # la base de Neon (producción)
 */
import { createSql } from '../server/sql.js'
import { DEFAULT_CRITICAL_GROUPS, defaultAnalyte, type CriticalGroup } from '../src/lib/clinicalConfig.js'

try { if (process.argv[2]) process.loadEnvFile(process.argv[2]) } catch { /* opcional */ }
const sql = createSql()
const defaults = new Set(DEFAULT_CRITICAL_GROUPS.map((g) => g.id))
try {
  const done = await sql.one(`SELECT value FROM meta WHERE key = 'um3:done'`).catch(() => undefined)
  console.log(`Base: ${sql.kind}. Limpieza UM3: ${done ? `ya corrió (${done.value})` : 'todavía no corre en esta base'}\n`)
  for (const c of await sql.query('SELECT id, name, critical_groups FROM clinics ORDER BY name')) {
    const groups = (c.critical_groups ? JSON.parse(String(c.critical_groups)) : []) as CriticalGroup[]
    const archivedGroups = groups.filter((g) => g.archivedAt && !g.retiredAt)
    const archivedAnalytes = groups.flatMap((g) => g.analytes.filter((a) => a.archivedAt && !a.retiredAt).map((a) => ({ g, a })))
    const retired = groups.filter((g) => g.retiredAt).length + groups.reduce((n, g) => n + g.analytes.filter((a) => a.retiredAt).length, 0)
    console.log(`== ${c.name}: ${groups.length} grupos (${groups.filter((g) => !g.archivedAt).length} activos). «Ver archivados (${archivedGroups.length + archivedAnalytes.length})». Retirados: ${retired}`)
    for (const g of archivedGroups) console.log(`   grupo «${g.name}» (${g.id}) archivado ${g.archivedAt} · ${defaults.has(g.id) ? 'PREDETERMINADO de la app' : 'propio de la clínica'} · ${g.analytes.length} analitos`)
    for (const { g, a } of archivedAnalytes) console.log(`   analito ${a.name} de «${g.name}» archivado ${a.archivedAt} · ${defaultAnalyte(a.id) ? 'PREDETERMINADO' : 'propio'}`)
    const log = await sql.query(`SELECT at, user_id, action FROM audit WHERE clinic_id = ? AND (action LIKE 'Umbrales críticos de laboratorio: archivó%' OR action LIKE 'Limpieza de umbrales%') ORDER BY at`, [String(c.id)])
    for (const l of log) {
      const who = await sql.one('SELECT name FROM staff WHERE id = ?', [String(l.user_id)])
      console.log(`   bitácora ${l.at} · ${who?.name ?? l.user_id}: ${l.action}`)
    }
    console.log('')
  }
} finally {
  await sql.close()
}
