import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb } from './db.js'
import { createSql, type Sql } from './sql.js'
import { createIcdClient, icdConfigFromEnv, icdConfigured, plainTitle, toHits, type IcdConfig } from './icd.js'
import { searchLocal } from './icdLocal.js'

/** Respuesta de búsqueda como la de la OMS (sólo los campos que usamos). */
const WHO_SEARCH = {
  error: false, errorMessage: null,
  destinationEntities: [
    { id: 'http://id.who.int/icd/entity/1', title: 'Faringitis <em class=\'found\'>aguda</em>', theCode: 'CA02', chapter: '12' },
    { id: 'http://id.who.int/icd/entity/2', title: 'Un bloque sin código', theCode: null, chapter: '12' },
  ],
}

/** Una OMS falsa: cuenta las peticiones y responde token y búsqueda. */
function fakeWho(opts: { failSearch?: boolean } = {}) {
  const calls: { url: string; headers: Record<string, string> }[] = []
  const f = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url)
    calls.push({ url: u, headers: (init?.headers ?? {}) as Record<string, string> })
    if (u.includes('/connect/token')) return new Response(JSON.stringify({ access_token: 'tok-1', expires_in: 3600 }), { status: 200 })
    if (opts.failSearch) throw new Error('sin red')
    return new Response(JSON.stringify(WHO_SEARCH), { status: 200 })
  }) as typeof fetch
  return { calls, fetch: f }
}
const config = (f: typeof fetch, extra: Partial<IcdConfig> = {}): IcdConfig => ({ ...icdConfigFromEnv({}), clientId: 'id', clientSecret: 'secreto', fetch: f, ...extra })

describe('K1 CIE-11 de la OMS', () => {
  test('la respuesta se convierte en diagnósticos con código y sin marcas', () => {
    assert.equal(plainTitle('Faringitis <em class=\'found\'>aguda</em>'), 'Faringitis aguda')
    assert.deepEqual(toHits(WHO_SEARCH), [{ code: 'CA02', label: 'Faringitis aguda', uri: 'http://id.who.int/icd/entity/1', chapter: '12' }])
    assert.throws(() => toHits({ error: true, errorMessage: 'Falla' }), /Falla/)
  })
  test('pide el token una vez, busca en español en la edición configurada y guarda en caché', async () => {
    const who = fakeWho()
    const icd = createIcdClient(config(who.fetch))
    assert.equal(icd.configured(), true)
    const r = await icd.search('faringitis')
    assert.equal(r[0].code, 'CA02')
    await icd.search('Faringitis ')
    await icd.search('amigdalitis')
    assert.equal(who.calls.filter((c) => c.url.includes('/connect/token')).length, 1)
    const search = who.calls.filter((c) => c.url.includes('/search'))
    assert.equal(search.length, 2, 'la segunda búsqueda igual sale de la caché')
    assert.match(search[0].url, /\/icd\/release\/11\/2026-01\/mms\/search\?q=faringitis/)
    assert.equal(search[0].headers['Accept-Language'], 'es')
    assert.equal(search[0].headers['API-Version'], 'v2')
    assert.equal(search[0].headers.Authorization, 'Bearer tok-1')
  })
  test('sin credenciales no está configurada; con una copia local sí, y no pide token', async () => {
    assert.equal(icdConfigured({ ...icdConfigFromEnv({}) }), false)
    const who = fakeWho()
    const local = createIcdClient(config(who.fetch, { apiUrl: 'http://localhost:8382', clientId: undefined, clientSecret: undefined }))
    assert.equal(local.configured(), true)
    await local.search('faringitis')
    assert.equal(who.calls.length, 1)
    assert.match(who.calls[0].url, /^http:\/\/localhost:8382\/icd\/release\/11\//)
  })
  test('si la OMS no responde, el error es un mensaje para el usuario', async () => {
    const icd = createIcdClient(config(fakeWho({ failSearch: true }).fetch))
    await assert.rejects(icd.search('faringitis'), /No se pudo conectar con la CIE-11/)
  })
})

describe('CIE-11 sin conexión: archivo oficial de la OMS', () => {
  test('encuentra por palabras sin tildes y por código, con los títulos oficiales en español', () => {
    assert.equal(searchLocal('diabetes tipo 2')[0].code, '5A11')
    assert.equal(searchLocal('hipertension esencial')[0].label, 'Hipertensión esencial')
    assert.deepEqual(searchLocal('ca02', 3).map((h) => h.code), ['CA02', 'CA02.0', 'CA02.1'])
    const z = searchLocal('1A40.Z')[0]
    assert.equal(z.label, 'Gastroenteritis o colitis infecciosa sin especificación del agente infeccioso')
    assert.match(z.uri!, /^http:\/\/id\.who\.int\/icd\//)
    assert.deepEqual(searchLocal('zzzzqx'), [])
  })
})

describe('K1 rutas de la CIE-11', () => {
  let server: Server
  let sql: Sql
  let base = ''
  let online = true
  before(async () => {
    sql = createSql({ memory: true })
    await ensureDb(sql)
    const icd = { configured: () => online, release: '2026-01', search: async (q: string) => (q.includes('error') ? Promise.reject(new Error('La OMS no respondió.')) : toHits(WHO_SEARCH)) }
    const app = createApp({ sql, jwtSecret: 'test-secret', demoMode: true, icd })
    await new Promise<void>((r) => { server = app.listen(0, () => r()) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  after(async () => { server.close(); await sql.close() })
  const as = async (email: string) => {
    const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: DEMO_PASSWORD }) })
    const cookie = res.headers.get('set-cookie')?.split(';')[0] ?? ''
    return async (method: string, path: string, body?: unknown) => {
      const r = await fetch(`${base}${path}`, { method, headers: { cookie, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      return { status: r.status, body: await r.json() as any }
    }
  }

  test('busca en la API de la OMS si está configurada; si no, o si falla, en el archivo oficial', async () => {
    const doc = await as('lherrera@demo.clinara')
    const r = await doc('GET', '/api/icd/search?q=faringitis')
    assert.equal(r.status, 200)
    assert.equal(r.body.source, 'api')
    assert.deepEqual(r.body.results.map((x: any) => x.code), ['CA02'])
    const failed = await doc('GET', '/api/icd/search?q=error faringitis')
    assert.equal(failed.body.source, 'file')
    assert.equal((await (await as('smejia@demo.clinara'))('GET', '/api/icd/search?q=faringitis')).status, 403)
    online = false
    const off = await doc('GET', '/api/icd/search?q=faringitis aguda')
    assert.equal(off.body.source, 'file')
    assert.equal(off.body.release, '2026-01')
    assert.equal(off.body.results[0].code, 'CA02')
    assert.equal(off.body.results[0].label, 'Faringitis aguda')
    online = true
  })
  test('el diagnóstico CIE-11 se guarda con su clasificación y queda en los frecuentes de la clínica', async () => {
    const admin = await as('admin@demo.clinara')
    const all = Object.fromEntries(['0', '1', '2', '3', '4', '5', '6'].map((d) => [d, [{ start: '00:00', end: '23:45' }]]))
    await admin('PATCH', '/api/staff/s-herrera/schedule', { slot: 15, week: all })
    const nurse = await as('crios@demo.clinara')
    const doc = await as('lherrera@demo.clinara')
    const w = await nurse('POST', '/api/appointments/walk-in', { patientId: 'p18', doctorId: 's-herrera', reason: 'Dolor de garganta' })
    await doc('POST', `/api/appointments/${w.body.id}/status`, { status: 'in_consult' })
    const dx = { code: 'CA02', label: 'Faringitis aguda', system: 'icd11', uri: 'http://id.who.int/icd/entity/1' }
    const c = await doc('POST', '/api/consultations', { appointmentId: w.body.id, reason: 'Dolor de garganta', diagnoses: [dx], orders: ['Abundantes líquidos.'] })
    assert.equal(c.status, 201, JSON.stringify(c.body))
    assert.deepEqual((await doc('GET', `/api/consultations/${c.body.consultationId}`)).body.consultation.diagnoses, [dx])
    const freq = (await doc('GET', '/api/icd/frequent')).body
    assert.ok(freq.some((x: any) => x.code === 'CA02' && x.system === 'icd11'))
    // Los de otras clínicas no aparecen
    assert.ok(!(await (await as('erosales@demo.clinara'))('GET', '/api/icd/frequent')).body.some((x: any) => x.code === 'CA02'))
  })
  test('K3: los reportes cuentan aparte CIE-11, CIE-10 de antes y los escritos sin código', async () => {
    const d = new Date(); const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const r = await (await as('admin@demo.clinara'))('GET', `/api/reports?from=${day}&to=${day}`)
    const top = r.body.topDiagnoses as { code: string; system?: string }[]
    assert.ok(top.some((x) => x.code === 'CA02' && x.system === 'icd11'))
    assert.ok(top.every((x) => x.system === 'icd11' || x.system === undefined))
  })
})
