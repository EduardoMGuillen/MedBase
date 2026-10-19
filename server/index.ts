import { resolve } from 'node:path'
import { createApp } from './app.js'
import { createSql } from './sql.js'
import { ensureDb } from './db.js'

// Variables opcionales desde .env (ver .env.example)
try { process.loadEnvFile('.env') } catch { /* sin .env: se usan los valores por defecto */ }

const production = process.env.NODE_ENV === 'production' || process.argv.includes('--production')
const port = Number(process.env.PORT ?? 3001)
const sql = createSql()

const app = createApp({
  sql,
  jwtSecret: process.env.JWT_SECRET,
  demoMode: process.env.DEMO_MODE !== 'false',
  secureCookies: process.env.SECURE_COOKIES === 'true',
  staticDir: production ? resolve('dist') : undefined,
})

console.log(sql.kind === 'neon' ? 'Conectando a Postgres (DATABASE_URL)…' : 'Preparando la base local (PGlite)…')
ensureDb(sql).then(() => {
  app.listen(port, () => {
    console.log(`Clinara API escuchando en http://localhost:${port}`)
    console.log(sql.kind === 'neon' ? 'Base de datos: Postgres remoto' : `Base de datos local: ${resolve(process.env.PGLITE_DIR ?? 'data/pglite')}`)
    if (production) console.log(`Abre http://localhost:${port} en tu navegador.`)
  })
}, (e) => {
  console.error('No se pudo preparar la base de datos:', e.message)
  process.exit(1)
})
