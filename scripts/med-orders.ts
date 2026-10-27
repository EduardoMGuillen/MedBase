/**
 * Órdenes de medicamento de las estancias activas. Usa la base de DATABASE_URL (o la local, PGLITE_DIR).
 *   npx tsx scripts/med-orders.ts --dry-run   lista las órdenes que faltan y que se crearían (no cambia nada)
 *   npx tsx scripts/med-orders.ts --apply     las crea (idempotente: correrlo dos veces no duplica)
 *   npx tsx scripts/med-orders.ts --check     comprobación de consistencia: sale con código 1 si falta alguna
 * Lo ejecuta el desarrollador; no se expone en la aplicación. Al desplegar, la actualización v24 hace lo mismo que
 * --apply; este script sirve para ver antes (--dry-run) qué va a crear y para comprobar después (--check).
 */
import { createSql } from '../server/sql.js'
import { backfillMissingOrders, checkStayOrders } from '../server/medOrders.js'

try { process.loadEnvFile('.env') } catch { /* sin .env */ }
const mode = process.argv[2]
if (!['--dry-run', '--apply', '--check'].includes(mode)) { console.error('Usa --dry-run, --apply o --check.'); process.exit(2) }
const sql = createSql()
// No se actualiza el esquema aquí (la actualización v24 ya corre el relleno real): sólo hace falta la v22 o posterior
const version = Number((await sql.one(`SELECT value FROM meta WHERE key = 'schema'`))?.value ?? 0)
if (version < 22) { console.error(`La base está en la versión ${version}; hace falta la 22 o posterior.`); process.exit(2) }
const lines = mode === '--check' ? await checkStayOrders(sql) : await sql.tx((q) => backfillMissingOrders(q, { dryRun: mode === '--dry-run' }))
if (!lines.length) console.log(mode === '--check' ? 'Todo en orden: cada estancia activa tiene en la hoja los medicamentos de su consulta.' : 'No falta ninguna orden.')
for (const l of lines) console.log(`${mode === '--apply' ? 'CREADA' : 'FALTA '}  ${l.patient} (${l.kind === 'observation' ? 'observación' : 'hospitalización'} ${l.hospitalizationId})  ${l.drug}  · consulta ${l.consultationId}`)
await sql.close()
process.exit(mode === '--check' && lines.length ? 1 : 0)
