import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

export type Row = Record<string, unknown>

/**
 * Acceso a Postgres. En producción (Vercel) usa Neon mediante `DATABASE_URL`;
 * en desarrollo y pruebas usa PGlite, un Postgres embebido que no requiere instalación.
 * Las consultas se escriben con `?` y se traducen a `$1, $2…`.
 */
export interface Sql {
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>
  one<T = Row>(text: string, params?: unknown[]): Promise<T | undefined>
  run(text: string, params?: unknown[]): Promise<void>
  /** Varias sentencias sin parámetros (esquema). */
  exec(text: string): Promise<void>
  /** Ejecuta `fn` dentro de una transacción; si lanza, se revierte. */
  tx<T>(fn: (q: Sql) => Promise<T>): Promise<T>
  close(): Promise<void>
  readonly kind: 'neon' | 'pglite'
}

/** Convierte los `?` de la consulta en parámetros numerados de Postgres. */
export function numbered(text: string) {
  let i = 0
  return text.replace(/\?/g, () => `$${++i}`)
}

type Querier = { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }

function wrap(q: Querier, kind: Sql['kind'], exec: (text: string) => Promise<void>, tx: Sql['tx'], close: () => Promise<void>): Sql {
  const query = async <T,>(text: string, params: unknown[] = []) => (await q.query(numbered(text), params)).rows as T[]
  return {
    kind,
    query,
    one: async <T,>(text: string, params?: unknown[]) => (await query<T>(text, params))[0],
    run: async (text, params) => { await query(text, params) },
    exec,
    tx,
    close,
  }
}

async function neon(url: string): Promise<Sql> {
  const { default: pg } = await import('pg')
  // Neon cierra conexiones inactivas; un pool pequeño por instancia de función es suficiente
  // `sslmode=require` ya se trata como verificación completa; se explicita para evitar la advertencia de pg
  const connectionString = url.replace(/sslmode=(require|prefer|verify-ca)/, 'sslmode=verify-full')
  const pool = new pg.Pool({ connectionString, max: 3, idleTimeoutMillis: 10_000 })
  const self: Sql = wrap(pool, 'neon', async (text) => { await pool.query(text) }, async (fn) => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const inner = wrap(client, 'neon', async (text) => { await client.query(text) }, (f) => f(inner), async () => {})
      const r = await fn(inner)
      await client.query('COMMIT')
      return r
    } catch (e) {
      await client.query('ROLLBACK').catch(() => null)
      throw e
    } finally {
      client.release()
    }
  }, () => pool.end())
  return self
}

async function pglite(dataDir?: string): Promise<Sql> {
  const { PGlite } = await import('@electric-sql/pglite')
  if (dataDir) mkdirSync(dataDir, { recursive: true })
  const db = new PGlite(dataDir)
  await db.waitReady
  return wrap(db, 'pglite', async (text) => { await db.exec(text) }, (fn) => db.transaction(async (t) => {
    const inner = wrap(t, 'pglite', async (text) => { await t.exec(text) }, (f) => f(inner), async () => {})
    return fn(inner)
  }), () => db.close())
}

/**
 * Extrae la URL de Postgres aunque se haya pegado con `psql '…'`, comillas o el prefijo `DATABASE_URL=`.
 */
export function cleanDatabaseUrl(raw?: string) {
  if (!raw?.trim()) return undefined
  return raw.match(/postgres(?:ql)?:\/\/[^\s'"]+/)?.[0] ?? raw.trim()
}

/**
 * Crea la conexión de forma perezosa: la primera consulta espera a que esté lista.
 * `memory: true` crea una base temporal (pruebas).
 */
export function createSql(opts: { url?: string; dataDir?: string; memory?: boolean } = {}): Sql {
  const url = cleanDatabaseUrl(opts.url ?? process.env.DATABASE_URL)
  let ready: Promise<Sql> | null = null
  const get = () => (ready ??= url ? neon(url) : process.env.VERCEL
    // En Vercel no hay disco donde guardar una base local: hace falta DATABASE_URL
    ? Promise.reject(Object.assign(new Error('Falta DATABASE_URL'), { code: 'NO_DATABASE_URL' }))
    : pglite(opts.memory ? undefined : resolve(opts.dataDir ?? process.env.PGLITE_DIR ?? 'data/pglite')))
  return {
    kind: url ? 'neon' : 'pglite',

    query: async (t, p) => (await get()).query(t, p),
    one: async (t, p) => (await get()).one(t, p),
    run: async (t, p) => (await get()).run(t, p),
    exec: async (t) => (await get()).exec(t),
    tx: async (fn) => (await get()).tx(fn),
    close: async () => { if (ready) await (await ready).close() },
  }
}
