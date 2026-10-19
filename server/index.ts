import { resolve } from 'node:path'
import { createApp } from './app'
import { openDb } from './db'

const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(`Clinara necesita Node 22.13 o superior (tienes ${process.versions.node}). Descárgalo en https://nodejs.org`)
  process.exit(1)
}

// Variables opcionales desde .env (ver .env.example)
try { process.loadEnvFile('.env') } catch { /* sin .env: se usan los valores por defecto */ }

const production =process.env.NODE_ENV === 'production' || process.argv.includes('--production')
const port = Number(process.env.PORT ?? 3001)
const dbPath = resolve(process.env.DB_PATH ?? 'data/clinara.db')
const db = openDb(dbPath)

const app = createApp({
  db,
  jwtSecret: process.env.JWT_SECRET,
  demoMode: process.env.DEMO_MODE !== 'false',
  secureCookies: process.env.SECURE_COOKIES === 'true',
  staticDir: production ? resolve('dist') : undefined,
})

app.listen(port, () => {
  console.log(`Clinara API escuchando en http://localhost:${port}`)
  console.log(`Base de datos: ${dbPath}`)
  if (production) console.log(`Abre http://localhost:${port} en tu navegador.`)
})
