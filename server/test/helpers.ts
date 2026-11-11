import { after, before } from 'node:test'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp, type AppOptions } from '../app.js'
import { DEMO_PASSWORD, ensureDb } from '../db.js'
import { createSql, type Sql } from '../sql.js'

/** Lo que devuelve cada llamada del cliente de pruebas. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Reply = { status: number; body: any }

/** Cuentas y clínicas de la demo que usan las pruebas: si cambian los datos demo, se cambian aquí. */
export const DEMO = {
  clinic: 'c-sb',
  office: 'c-al',
  /** Clínica que no es demo: sirve para probar el aislamiento entre clínicas. */
  otherClinic: 'c-sl',
  doctor: 'vsolorzano@demo.clinara',
  nurse: 'murbina@demo.clinara',
  otherDoctor: 'slobo@demo.clinara',
  otherNurse: 'amontes@demo.clinara',
} as const

export interface TestClient {
  status: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  login: any
  cookie: string
  call: (method: string, path: string, body?: unknown) => Promise<Reply>
  get: (path: string) => Promise<Reply>
  post: (path: string, body?: unknown) => Promise<Reply>
  patch: (path: string, body?: unknown) => Promise<Reply>
  put: (path: string, body?: unknown) => Promise<Reply>
  del: (path: string, body?: unknown) => Promise<Reply>
}

export interface TestApp {
  sql: Sql
  base: string
  /** Inicia sesión y devuelve un cliente que conserva la cookie. */
  as: (email: string, password?: string) => Promise<TestClient>
}

/**
 * Base en memoria con la demo, la aplicación escuchando en un puerto libre y el cierre al terminar el archivo.
 * Se llama una vez por archivo, fuera de los `describe`; `app.sql` y `app.base` valen desde el primer `test`.
 *
 * `ready` corre al final del arranque, ya con la aplicación arriba: ahí va la preparación propia del archivo. No uses
 * otro `before` para eso: los `before` de un mismo nivel no esperan unos a otros.
 */
export function bootApp(ready?: () => void | Promise<void>, opts: Partial<Omit<AppOptions, 'sql'>> = {}): TestApp {
  let server: Server
  const app: TestApp = { sql: undefined as unknown as Sql, base: '', as: (email, password) => login(app.base, email, password) }
  before(async () => {
    app.sql = createSql({ memory: true })
    await ensureDb(app.sql)
    const express = createApp({ sql: app.sql, jwtSecret: 'test-secret', demoMode: true, ...opts })
    await new Promise<void>((r) => { server = express.listen(0, () => r()) })
    app.base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    await ready?.()
  })
  after(async () => { server.close(); await app.sql.close() })
  return app
}

export async function login(base: string, email: string, password: string = DEMO_PASSWORD): Promise<TestClient> {
  const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })
  const cookie = res.headers.get('set-cookie')?.split(';')[0] ?? ''
  const call = async (method: string, path: string, body?: unknown): Promise<Reply> => {
    const r = await fetch(`${base}${path}`, { method, headers: { cookie, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const text = await r.text()
    let parsed: unknown = text
    try { parsed = JSON.parse(text) } catch { /* no es JSON: queda el texto */ }
    return { status: r.status, body: parsed }
  }
  return {
    status: res.status, login: await res.json().catch(() => null), cookie, call,
    get: (p) => call('GET', p), post: (p, b) => call('POST', p, b), patch: (p, b) => call('PATCH', p, b), put: (p, b) => call('PUT', p, b), del: (p, b) => call('DELETE', p, b),
  }
}
