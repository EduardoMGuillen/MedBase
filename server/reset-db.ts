import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { openDb } from './db'

const dbPath = resolve(process.env.DB_PATH ?? 'data/clinara.db')
try {
  for (const suffix of ['', '-wal', '-shm']) rmSync(dbPath + suffix, { force: true })
} catch (e) {
  const code = (e as NodeJS.ErrnoException).code
  if (code === 'EPERM' || code === 'EBUSY') {
    console.error('La base de datos está en uso. Detén el servidor (Ctrl+C en la terminal de npm run dev) y vuelve a intentarlo.')
    process.exit(1)
  }
  throw e
}
openDb(dbPath).close()
console.log(`Base de datos reiniciada con la clínica de demo: ${dbPath}`)
