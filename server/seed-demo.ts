import './tz.js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createSql } from './sql.js'
import { ensureDb } from './db.js'
import { seedDemo } from './demoData.js'

/**
 * DM1: `npm run seed:demo -- --confirmar` borra los pacientes de las clínicas demo (con respaldo) y genera los nuevos,
 * relativos a hoy. Sin `--confirmar` (o `CONFIRMAR_DEMO=si`) no hace nada: así no se corre por accidente. Sólo toca las
 * clínicas marcadas con `clinics.is_demo`, nunca una clínica real.
 *
 * Sin DATABASE_URL usa la base local (detén `npm run dev` antes: PGlite admite un solo proceso). Con
 * `npm run seed:demo -- .env.neon.local --confirmar`, la base remota. El respaldo queda en la tabla demo_backups y en
 * data/backups.
 */
const args = process.argv.slice(2)
const envFile = args.find((a) => !a.startsWith('--'))
const confirmed = args.includes('--confirmar') || process.env.CONFIRMAR_DEMO === 'si'
try { process.loadEnvFile(envFile ?? '.env') } catch { /* opcional */ }
if (!confirmed) {
  console.error('Esto borra los pacientes de las clínicas demo y genera otros. Para hacerlo: npm run seed:demo -- --confirmar')
  process.exit(1)
}
const sql = createSql()
const t = Date.now()
await ensureDb(sql)
const s = await seedDemo(sql, {
  onBackup: (json) => {
    const dir = resolve('data/backups')
    mkdirSync(dir, { recursive: true })
    const file = resolve(dir, `demo-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
    writeFileSync(file, json)
    console.log(`Respaldo: ${file}`)
  },
})
await sql.close()
console.log(`Datos demo listos en ${((Date.now() - t) / 1000).toFixed(1)} s (clínicas ${s.clinics.join(', ')}).`)
console.table({ antes: s.before, después: s.after })
console.log(`${s.observation} en observación, ${s.hospital} hospitalizados, ${s.discharged} egresados.`)
