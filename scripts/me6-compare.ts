/**
 * ME6 (ronda 10): compara, por número del listado, las 530 filas del .md con el vademécum de cada clínica y consultorio.
 * Solo lee. Sale con error si a alguna le falta un número.
 *
 *   npx tsx scripts/me6-compare.ts                     # base local (data/pglite o PGLITE_DIR)
 *   npx tsx scripts/me6-compare.ts .env.neon.local     # la base de Neon (producción)
 */
import { createSql } from '../server/sql.js'
import { compareLnme } from '../server/lnmeLoader.js'
import { LNME_ITEMS } from '../src/lib/lnme/generated.js'

try { if (process.argv[2]) process.loadEnvFile(process.argv[2]) } catch { /* opcional */ }
const sql = createSql()
try {
  const list = await compareLnme(sql)
  for (const c of list) console.log(`${c.name}: ${c.rows} de ${LNME_ITEMS.length} números del .md; faltan ${c.missing.length}${c.missing.length ? ` (#${c.missing.join(', #')})` : ''}`)
  const bad = list.filter((c) => c.missing.length)
  console.log(bad.length ? `\n${bad.length} cuenta(s) incompleta(s).` : '\nTodas las cuentas tienen las 530 filas: 0 faltantes.')
  process.exitCode = bad.length ? 1 : 0
} finally {
  await sql.close()
}
