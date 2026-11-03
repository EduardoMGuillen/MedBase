import '../server/tz.js'
import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * Función de Vercel: todas las rutas /api/* llegan aquí (ver vercel.json).
 * La conexión a Neon se reutiliza mientras la instancia siga activa.
 * La app se carga al primer request: si falla al cargar, se responde con el motivo en vez de tumbar la función.
 */
if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL. Agrégala en Vercel → Settings → Environment Variables.')
}

let app: Promise<(req: IncomingMessage, res: ServerResponse) => void> | undefined
const load = () => (app ??= Promise.all([import('../server/app.js'), import('../server/sql.js')]).then(([{ createApp }, { createSql }]) => createApp({
  sql: createSql(),
  jwtSecret: process.env.JWT_SECRET,
  demoMode: process.env.DEMO_MODE !== 'false',
  // Vercel siempre sirve por HTTPS; SECURE_COOKIES=false sólo sirve para simularlo en local
  secureCookies: process.env.SECURE_COOKIES !== 'false',
}) as unknown as (req: IncomingMessage, res: ServerResponse) => void))

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const run = await load()
    run(req, res)
  } catch (e) {
    app = undefined
    console.error('No se pudo cargar la API:', e)
    res.statusCode = 500
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ error: 'No se pudo cargar la API.', detail: String((e as Error)?.message ?? e).slice(0, 500) }))
  }
}
