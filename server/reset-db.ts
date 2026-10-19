import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { createSql } from './sql.js'
import { ensureDb, resetDemo } from './db.js'

/**
 * Sin DATABASE_URL: borra la base local y la recrea con la demo.
 * Con DATABASE_URL (Neon): crea el esquema y recarga la demo en la base remota.
 */
try { process.loadEnvFile(process.argv[2] ?? '.env') } catch { /* opcional */ }

const remote = !!process.env.DATABASE_URL
if (!remote) {
  const dir = resolve(process.env.PGLITE_DIR ?? 'data/pglite')
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'EPERM' || code === 'EBUSY') {
      console.error('La base de datos está en uso. Detén el servidor (Ctrl+C en la terminal de npm run dev) y vuelve a intentarlo.')
      process.exit(1)
    }
    throw e
  }
}

const sql = createSql()
const t = Date.now()
await ensureDb(sql)
if (remote) await resetDemo(sql)
await sql.close()
console.log(`Base de datos ${remote ? 'remota' : 'local'} lista con la clínica de demo (${((Date.now() - t) / 1000).toFixed(1)} s).`)
