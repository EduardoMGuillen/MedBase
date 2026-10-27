/**
 * Búsqueda de diagnósticos en la CIE-11 de la OMS (ICD API), en español. Es el único lugar que habla con la
 * OMS: el navegador busca en /api/icd/search y nunca ve las credenciales.
 *
 * Dos formas de conectarse (variables de entorno):
 * - API de la OMS en la nube: ICD_CLIENT_ID e ICD_CLIENT_SECRET (cuenta gratuita en https://icd.who.int/icdapi).
 *   El token (OAuth2, client credentials, scope icdapi_access) dura cerca de una hora y se renueva solo.
 * - Copia local de la API (contenedor o servicio que distribuye la OMS): ICD_API_URL, p. ej. http://localhost:8382.
 *   No pide credenciales.
 * ICD_RELEASE elige la edición de la CIE-11 MMS (por defecto 2026-01).
 */

export interface IcdHit { code: string; label: string; uri?: string; chapter?: string }

export interface IcdConfig {
  apiUrl: string
  tokenUrl: string
  clientId?: string
  clientSecret?: string
  release: string
  language: string
  timeoutMs: number
  fetch: typeof fetch
}

export const icdConfigFromEnv = (env: NodeJS.ProcessEnv = process.env): IcdConfig => ({
  apiUrl: (env.ICD_API_URL || 'https://id.who.int').replace(/\/$/, ''),
  tokenUrl: env.ICD_TOKEN_URL || 'https://icdaccessmanagement.who.int/connect/token',
  clientId: env.ICD_CLIENT_ID || undefined,
  clientSecret: env.ICD_CLIENT_SECRET || undefined,
  release: env.ICD_RELEASE || '2026-01',
  language: 'es',
  timeoutMs: 6000,
  fetch: globalThis.fetch,
})

/** ¿Hay con qué buscar? La nube necesita credenciales; una copia local (otra URL) no. */
export const icdConfigured = (c: IcdConfig) => !!(c.clientId && c.clientSecret) || !/id\.who\.int$/.test(new URL(c.apiUrl).host)

/** "Faringitis <em class='found'>aguda</em>" → "Faringitis aguda". */
export const plainTitle = (t = '') => t.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

/** Convierte la respuesta de búsqueda de la OMS en diagnósticos con código (los capítulos y bloques sin código se omiten). */
export function toHits(body: { destinationEntities?: { theCode?: string | null; title?: string | null; id?: string | null; chapter?: string | null }[] | null; error?: boolean; errorMessage?: string | null }): IcdHit[] {
  if (body.error) throw new Error(body.errorMessage || 'La OMS no pudo hacer la búsqueda.')
  return (body.destinationEntities ?? [])
    .filter((e) => e.theCode && e.title)
    .map((e) => ({ code: String(e.theCode), label: plainTitle(String(e.title)), uri: e.id ?? undefined, chapter: e.chapter ?? undefined }))
}

export function createIcdClient(config: IcdConfig) {
  let token: { value: string; until: number } | null = null
  const cache = new Map<string, { at: number; hits: IcdHit[] }>()
  const CACHE_MS = 60 * 60_000

  const withTimeout = async (url: string, init: RequestInit) => {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), config.timeoutMs)
    try { return await config.fetch(url, { ...init, signal: ctrl.signal }) } finally { clearTimeout(t) }
  }

  async function bearer() {
    if (!config.clientId || !config.clientSecret) return undefined
    if (token && token.until > Date.now() + 60_000) return token.value
    const res = await withTimeout(config.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, scope: 'icdapi_access', grant_type: 'client_credentials' }).toString(),
    })
    if (!res.ok) throw new Error(`La OMS rechazó las credenciales de la CIE-11 (${res.status}). Revisa ICD_CLIENT_ID e ICD_CLIENT_SECRET.`)
    const body = await res.json() as { access_token: string; expires_in?: number }
    token = { value: body.access_token, until: Date.now() + (body.expires_in ?? 3600) * 1000 }
    return token.value
  }

  return {
    configured: () => icdConfigured(config),
    release: config.release,
    /** Busca en la CIE-11 MMS. Lanza un error con un mensaje para el usuario si la OMS no responde. */
    async search(q: string): Promise<IcdHit[]> {
      const key = q.trim().toLowerCase()
      const hit = cache.get(key)
      if (hit && Date.now() - hit.at < CACHE_MS) return hit.hits
      const auth = await bearer()
      const url = `${config.apiUrl}/icd/release/11/${encodeURIComponent(config.release)}/mms/search?` +
        new URLSearchParams({ q: q.trim(), flatResults: 'true', highlightingEnabled: 'false', useFlexisearch: 'false', medicalCodingMode: 'true' })
      let res: Response
      try {
        res = await withTimeout(url, { headers: { Accept: 'application/json', 'API-Version': 'v2', 'Accept-Language': config.language, ...(auth ? { Authorization: `Bearer ${auth}` } : {}) } })
      } catch {
        throw new Error('No se pudo conectar con la CIE-11 de la OMS. Revisa la conexión o escribe el diagnóstico sin código.')
      }
      if (res.status === 401) { token = null; throw new Error('La OMS no aceptó el acceso a la CIE-11. Revisa las credenciales.') }
      if (!res.ok) throw new Error(`La CIE-11 de la OMS respondió con un error (${res.status}).`)
      const hits = toHits(await res.json()).slice(0, 15)
      if (cache.size > 500) cache.delete(cache.keys().next().value!)
      cache.set(key, { at: Date.now(), hits })
      return hits
    },
  }
}

export type IcdClient = ReturnType<typeof createIcdClient>
