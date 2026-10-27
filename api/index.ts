import '../server/tz.js'
import { createApp } from '../server/app.js'
import { createSql } from '../server/sql.js'

/**
 * Función de Vercel: todas las rutas /api/* llegan aquí (ver vercel.json).
 * La conexión a Neon se reutiliza mientras la instancia siga activa.
 */
if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL. Agrégala en Vercel → Settings → Environment Variables.')
}

const app = createApp({
  sql: createSql(),
  jwtSecret: process.env.JWT_SECRET,
  demoMode: process.env.DEMO_MODE !== 'false',
  // Vercel siempre sirve por HTTPS; SECURE_COOKIES=false sólo sirve para simularlo en local
  secureCookies: process.env.SECURE_COOKIES !== 'false',
})

export default app
