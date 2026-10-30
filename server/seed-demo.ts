import './tz.js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createSql } from './sql.js'
import { ensureDb } from './db.js'
import { seedDemo } from './demoData.js'

/**
 * DM1: `npm run seed:demo` borra los pacientes de las clínicas demo (con respaldo) y genera los nuevos, relativos a
 * hoy. Sin DATABASE_URL usa la base local (detén `npm run dev` antes: PGlite admite un solo proceso). Con
 * `npm run seed:demo -- .env.neon.local`, la base remota. El respaldo queda en la tabla demo_backups y en data/backups.
 */
try { process.loadEnvFile(process.argv[2] ?? '.env') } catch { /* opcional */ }
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
console.log(`Datos demo listos en ${((Date.now() - t) / 1000).toFixed(1)} s: ${s.patients} pacientes, ${s.appointments} citas, ${s.consultations} consultas, ` +
  `${s.observation} en observación, ${s.hospital} hospitalizados, ${s.discharged} egresados y ${s.followups} seguimientos (clínicas ${s.clinics.join(', ')}).`)
