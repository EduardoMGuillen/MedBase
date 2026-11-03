import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { loadingAllowed, loadingDroppedByRoute } from '../src/lib/medExtras.js'
import { searchDrugs } from '../src/lib/drugProvider.js'
import type { Drug } from '../src/lib/catalogs.js'

describe('ME9 (ronda 10): «Primera dosis diferente (STAT)» solo con vía intravenosa', () => {
  test('con Intravenosa y «Cada 6 horas» sí; con Oral, Intramuscular o Subcutánea no', () => {
    assert.equal(loadingAllowed({ everyHours: 6, route: 'Intravenosa' }), true)
    for (const route of ['Oral', 'Intramuscular', 'Subcutánea', 'Sublingual']) assert.equal(loadingAllowed({ everyHours: 6, route }), false, route)
  })
  test('siguen sin ofrecerse con dosis única, infusión, PRN ni nebulización', () => {
    assert.equal(loadingAllowed({ route: 'Intravenosa' }), false)
    assert.equal(loadingAllowed({ everyHours: 8, infusion: true, route: 'Intravenosa' }), false)
    assert.equal(loadingAllowed({ everyHours: 8, prn: true, route: 'Intravenosa' }), false)
    assert.equal(loadingAllowed({ everyHours: 8, route: 'Nebulización' }), false)
  })
  test('marcada y la vía cambia a otra: se avisa que se quitó (solo por la vía)', () => {
    assert.equal(loadingDroppedByRoute(true, { everyHours: 12, route: 'Oral' }), true)
    assert.equal(loadingDroppedByRoute(true, { everyHours: 12, route: 'Intravenosa' }), false)
    assert.equal(loadingDroppedByRoute(false, { everyHours: 12, route: 'Oral' }), false)
    // Si lo que la apaga es la frecuencia (dosis única), no es por la vía
    assert.equal(loadingDroppedByRoute(true, { route: 'Oral' }), false)
  })
})

describe('ME8 (ronda 10): búsqueda del vademécum', () => {
  const d = (name: string, presentation = 'Tableta', aliases?: string[]): Drug => ({ name, presentation, group: 'x', aliases })
  const list = [d('Ambroxol'), d('Amoxicilina'), d('Clindamicina'), d('Acetaminofén', 'Tableta 500 mg', ['Paracetamol'])]
  test('primero los que empiezan con lo escrito, luego los que lo contienen; sin tildes ni mayúsculas', () => {
    assert.deepEqual(searchDrugs(list, 'am', 8).map((x) => x.name), ['Ambroxol', 'Amoxicilina', 'Clindamicina', 'Acetaminofén'])
    assert.deepEqual(searchDrugs(list, 'ACETAMINOFEN', 8).map((x) => x.name), ['Acetaminofén'])
    assert.deepEqual(searchDrugs(list, 'paracet', 8).map((x) => x.name), ['Acetaminofén'])
  })
})

// ───────────────────────── Con la base y la API (copia en memoria de la demo) ─────────────────────────
import { after, before } from 'node:test'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { DEMO_PASSWORD, ensureDb } from './db.js'
import { createSql, type Sql } from './sql.js'
import { cleanArchivedThresholds } from './ronda10.js'
import { DEFAULT_CRITICAL_GROUPS, mergeCriticalGroups, type CriticalGroup } from '../src/lib/clinicalConfig.js'

let server: Server
let sql: Sql
let base = ''
before(async () => {
  sql = createSql({ memory: true })
  await ensureDb(sql)
  const app = createApp({ sql, jwtSecret: 'test-secret', demoMode: true })
  await new Promise<void>((r) => { server = app.listen(0, () => r()) })
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
after(async () => { server.close(); await sql.close() })

async function as(email: string, password = DEMO_PASSWORD) {
  const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })
  const cookie = res.headers.get('set-cookie')?.split(';')[0] ?? ''
  const call = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(`${base}${path}`, { method, headers: { cookie, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const text = await r.text()
    let parsed: any = text
    try { parsed = JSON.parse(text) } catch { /* no es JSON */ }
    return { status: r.status, body: parsed }
  }
  return { get: (p: string) => call('GET', p), post: (p: string, b?: unknown) => call('POST', p, b), put: (p: string, b: unknown) => call('PUT', p, b), patch: (p: string, b: unknown) => call('PATCH', p, b) }
}
const groupsOf = async (cid: string) => JSON.parse(String((await sql.one('SELECT critical_groups FROM clinics WHERE id = ?', [cid]))!.critical_groups)) as CriticalGroup[]
const mainClinic = async () => String((await sql.one(`SELECT clinic_id FROM staff WHERE email = 'admin@demo.clinara'`))!.clinic_id)

describe('UM3 (ronda 10): limpieza de los umbrales archivados', () => {
  test('en una demo nueva no hay archivados: la limpieza ya corrió y no cambió nada', async () => {
    assert.ok(await sql.one(`SELECT 1 FROM meta WHERE key = 'um3:done'`))
    for (const c of await sql.query('SELECT id FROM clinics')) {
      const gs = await groupsOf(String(c.id))
      assert.equal(gs.length, DEFAULT_CRITICAL_GROUPS.length, 'una demo nueva tiene los 16 grupos de la app')
      assert.ok(gs.every((g) => !g.archivedAt))
    }
  })

  test('borra lo propio sin dependencias, retira lo que citan resultados, no toca los predeterminados; dos veces = una', async () => {
    const id = await mainClinic()
    const before = await groupsOf(id)
    const at = '2026-10-01T10:00:00.000Z'
    // Como en la captura 2: grupos predeterminados archivados (aquí 2), más lo propio de la clínica
    const gs: CriticalGroup[] = structuredClone(before)
    gs[0].archivedAt = at
    gs[1].archivedAt = at
    gs.push({ id: 'g-prueba', name: 'Grupo de prueba', archivedAt: at, analytes: [{ id: 'a-prueba-1', name: 'Analito de prueba', low: 1 }] })
    gs.push({ id: 'g-citado', name: 'Grupo citado', archivedAt: '2026-10-20T10:00:00.000Z', analytes: [{ id: 'a-citado', name: 'Lactato de prueba', high: 4 }] })
    gs[3].analytes.push({ id: 'a-suelto', name: 'Suelto archivado', high: 9, archivedAt: at })
    await sql.run('UPDATE clinics SET critical_groups = ? WHERE id = ?', [JSON.stringify(gs), id])
    // Un resultado crítico antiguo calculado con «Lactato de prueba» cuando estaba activo
    const exam = await sql.one('SELECT id, result, critical FROM exam_orders WHERE clinic_id = ? LIMIT 1', [id])
    await sql.run('UPDATE exam_orders SET result = ?, critical = TRUE WHERE id = ?',
      [JSON.stringify({ at: '2026-10-10T10:00:00.000Z', by: 's-rios', values: [{ analyte: 'Lactato de prueba', value: '9', critical: true }] }), String(exam!.id)])
    await sql.run(`DELETE FROM meta WHERE key LIKE 'um3:%'`)
    const r = await cleanArchivedThresholds(sql)
    const after1 = await groupsOf(id)
    assert.deepEqual([...r[id].deleted].sort(), [`Suelto archivado («${gs[3].name}»)`, 'grupo «Grupo de prueba» (1 analito)'].sort())
    assert.equal(r[id].retired.length, 1)
    assert.match(r[id].retired[0], /Grupo citado/)
    assert.equal(r[id].defaults.length, 2, 'los predeterminados archivados se reportan, no se borran')
    assert.ok(after1.find((g) => g.id === gs[0].id)?.archivedAt, 'el predeterminado sigue archivado')
    assert.ok(!after1.some((g) => g.id === 'g-prueba'))
    assert.ok(after1.find((g) => g.id === 'g-citado')?.retiredAt)
    // Los activos no se tocaron
    assert.deepEqual(after1.filter((g) => !g.archivedAt).map((g) => JSON.stringify(g)), gs.filter((g) => !g.archivedAt).map((g) => JSON.stringify({ ...g, analytes: g.analytes.filter((a) => a.id !== 'a-suelto') })))
    // Exportación previa y bitácora
    assert.ok(await sql.one(`SELECT 1 FROM config_backups WHERE clinic_id = ? AND kind = 'um3-archived-thresholds'`, [id]))
    assert.ok(await sql.one(`SELECT 1 FROM audit WHERE clinic_id = ? AND action LIKE 'Limpieza de umbrales críticos archivados%'`, [id]))
    // Idempotente: la segunda vez no cambia nada
    assert.deepEqual(await cleanArchivedThresholds(sql), {})
    assert.deepEqual(await groupsOf(id), after1)
    // El resultado crítico antiguo sigue crítico
    assert.equal((await sql.one('SELECT critical FROM exam_orders WHERE id = ?', [String(exam!.id)]))!.critical, true)
    // Lo retirado no vuelve aunque administración guarde la lista sin él; archivar otro umbral sí cuenta como archivado
    const admin = await as('admin@demo.clinara')
    const visible = mergeCriticalGroups(after1).filter((g) => !g.retiredAt).map((g) => ({ ...g, analytes: g.analytes.filter((a) => !a.retiredAt) }))
    const target = visible.find((g) => !g.archivedAt)!
    target.analytes[0].archivedAt = new Date().toISOString()
    const saved = await admin.put('/api/settings/critical-groups', { groups: visible })
    assert.equal(saved.status, 200, JSON.stringify(saved.body))
    const after2 = await groupsOf(id)
    assert.ok(after2.find((g) => g.id === 'g-citado')?.retiredAt, 'sigue retirado')
    assert.ok(after2.find((g) => g.id === target.id)!.analytes[0].archivedAt, 'el umbral de prueba quedó archivado («Ver archivados (N)» vuelve)')
    // Deja la base como estaba para las demás pruebas
    await sql.run('UPDATE exam_orders SET result = ?, critical = ? WHERE id = ?', [exam!.result ?? null, exam!.critical, String(exam!.id)])
    await sql.run('UPDATE clinics SET critical_groups = ? WHERE id = ?', [JSON.stringify(before), id])
  })
})

describe('GE5 (ronda 10): paginación', () => {
  test('números de página con puntos suspensivos', async () => {
    const { pageNumbers, paginate } = await import('../src/lib/pagination.js')
    assert.deepEqual(pageNumbers(1, 3), [1, 2, 3])
    assert.deepEqual(pageNumbers(1, 21), [1, 2, 3, 4, null, 21])
    assert.deepEqual(pageNumbers(10, 21), [1, null, 9, 10, 11, null, 21])
    assert.deepEqual(pageNumbers(21, 21), [1, null, 18, 19, 20, 21])
    const p = paginate(Array.from({ length: 530 }, (_, i) => i), 22)
    assert.equal(p.page, 22, 'una página que no existe se ajusta a la última')
    assert.deepEqual([p.rows[0], p.rows.at(-1), p.pages], [525, 529, 22])
  })
  test('recetas y bitácora: páginas de la lista completa en el servidor', async () => {
    const doc = await as('lherrera@demo.clinara')
    const all = await doc.get('/api/prescriptions?page=1&size=5')
    assert.equal(all.status, 200)
    assert.ok(all.body.total >= all.body.rows.length && all.body.rows.length <= 5)
    if (all.body.total > 5) {
      const p2 = await doc.get('/api/prescriptions?page=2&size=5')
      assert.ok(!p2.body.rows.some((r: any) => all.body.rows.some((x: any) => x.id === r.id)), 'la página 2 no repite la 1')
    }
    const reception = await as('smejia@demo.clinara')
    assert.equal((await reception.get('/api/prescriptions?page=1')).status, 403, 'recepción no ve recetas')
    const admin = await as('admin@demo.clinara')
    const log = await admin.get('/api/audit?page=1&size=10')
    assert.equal(log.status, 200)
    assert.ok(Array.isArray(log.body.rows) && log.body.rows.length <= 10 && log.body.total >= log.body.rows.length)
    assert.ok(Array.isArray((await admin.get('/api/audit')).body), 'sin página, todo (exportar a Excel)')
  })
})

describe('EN4 (ronda 10): «Día N de M» de un tratamiento', () => {
  test('una orden de 1 día que empezó a las 22:30 sigue en «Día 1 de 1» a la mañana siguiente (no «Día 2 de 1»)', async () => {
    const { treatmentDay } = await import('../src/lib/inpatient.js')
    const first = '2026-11-03T04:30:00.000Z' // 2/11 22:30 en Honduras
    assert.equal(treatmentDay({ firstAt: first, days: 1 }, new Date('2026-11-03T12:30:00.000Z')), 'Día 1 de 1') // 3/11 06:30
    assert.equal(treatmentDay({ firstAt: first, days: 1 }, new Date('2026-11-04T04:30:00.000Z')), 'Completó 1 día')
    assert.equal(treatmentDay({ firstAt: first, days: 7 }, new Date('2026-11-05T05:00:00.000Z')), 'Día 3 de 7')
  })
})

describe('ME6 (ronda 10): el vademécum con las 530 filas del .md', () => {
  test('cada cuenta tiene los 530 números (0 faltantes) y la carga forzada ya corrió una vez', async () => {
    const { compareLnme } = await import('./lnmeLoader.js')
    const list = await compareLnme(sql)
    assert.ok(list.length >= 3)
    for (const c of list) assert.deepEqual(c.missing, [], c.name)
    assert.ok(await sql.one(`SELECT 1 FROM meta WHERE key = 'me6:done'`))
    // Los 21 que faltaban (filas que eran del catálogo base) ahora están en la base
    const id = await mainClinic()
    for (const no of [26, 27, 49, 78, 88, 90, 91, 96, 105, 117, 125, 297, 302, 398, 399, 401, 433, 435, 524, 539, 549]) {
      assert.ok(await sql.one('SELECT 1 FROM clinic_drugs WHERE clinic_id = ? AND lnme_no = ?', [id, no]), `#${no}`)
    }
  })

  test('la vía del .md queda guardada y se muestra con palabras completas', async () => {
    const { routeWords } = await import('../src/lib/lnme/route.js')
    const id = await mainClinic()
    const via = async (no: number) => routeWords(String((await sql.one('SELECT lnme_routes FROM clinic_drugs WHERE clinic_id = ? AND lnme_no = ?', [id, no]))!.lnme_routes ?? ''))
    assert.equal(await via(403), 'Intravenosa, intramuscular') // Ondansetrón
    assert.equal(await via(96), 'Intravenosa, intramuscular') // Ceftriaxona
    assert.equal(await via(91), 'Intravenosa, intramuscular') // Cefazolina
    assert.equal(await via(302), 'Subcutánea') // Enoxaparina
    assert.equal(await via(433), 'Intravenosa, intramuscular, subcutánea') // Insulina cristalina
    assert.equal(await via(390), '') // Glutaraldehído: sin vía
    assert.equal(await via(430), '') // Condón masculino: sin vía
  })

  test('Aciclovir: sus tres presentaciones; Ondansetrón y Tramadol toman los datos del .md; los de la base que no están siguen', async () => {
    const doc = await as('lherrera@demo.clinara')
    const { localDrugProvider } = await import('../src/lib/drugProvider.js')
    const drugs = localDrugProvider.catalog((await doc.get('/api/bootstrap')).body.clinicDrugs)
    assert.equal(searchDrugs(drugs, 'Aciclovir', 8).length, 3)
    const ond = searchDrugs(drugs, 'Ondansetrón', 8)
    assert.deepEqual(ond.map((d) => d.lnme?.no), [403], 'una sola fila: la del .md')
    assert.equal(ond[0].presentation, 'Ampolla 4 mg/2 ml y 8 mg/4 ml')
    assert.deepEqual(searchDrugs(drugs, 'Tramadol', 8).map((d) => d.lnme?.no), [32])
    for (const name of ['Ambroxol', 'Metamizol', 'Ketorolaco']) assert.ok(drugs.some((d) => d.name === name && !d.clinicId), `${name} sigue en el catálogo base`)
    // Sin duplicados: cada número una vez
    const nos = drugs.flatMap((d) => (d.lnme ? [d.lnme.no] : []))
    assert.equal(nos.length, new Set(nos).size)
  })

  test('la carga forzada: lo editado por la clínica demo toma los datos del .md sin duplicarse; dos veces = una', async () => {
    const { forceLnmeOnce, loadLnme } = await import('./lnmeLoader.js')
    const id = await mainClinic()
    const row = (await sql.one('SELECT * FROM clinic_drugs WHERE clinic_id = ? AND lnme_no = 169', [id]))!
    // Como lo dejaría una edición de la clínica (ME5): otro nombre y presentación, archivado, origen «clinic»
    await sql.run(`UPDATE clinic_drugs SET name = 'Aciclovir genérico', presentation = 'Tableta 400 mg (caja)', norm_key = 'aciclovir generico|tableta 400 mg (caja)', active = FALSE, origin = 'clinic', origin_label = 'Editado por la clínica' WHERE id = ?`, [String(row.id)])
    // Una carga normal (futura) respeta la edición
    await loadLnme(sql, id)
    assert.equal((await sql.one('SELECT name FROM clinic_drugs WHERE id = ?', [String(row.id)]))!.name, 'Aciclovir genérico')
    // La carga de ME6 (forzada, una vez por base) no la respeta
    await sql.run(`DELETE FROM meta WHERE key = 'me6:done'`)
    const rep = await forceLnmeOnce(sql)
    assert.equal(rep[id].replaced, 1)
    const after1 = (await sql.one('SELECT * FROM clinic_drugs WHERE id = ?', [String(row.id)]))!
    assert.equal(after1.name, 'Aciclovir')
    assert.equal(after1.presentation, 'Tableta 400 mg')
    assert.equal(after1.active, true)
    assert.equal(after1.origin, 'lnme')
    assert.ok(JSON.parse(String(after1.aliases)).includes('Aciclovir genérico'), 'el nombre anterior queda como alias')
    assert.equal(Number((await sql.one('SELECT count(*) AS n FROM clinic_drugs WHERE clinic_id = ? AND lnme_no = 169', [id]))!.n), 1)
    assert.ok(await sql.one(`SELECT 1 FROM config_backups WHERE clinic_id = ? AND kind = 'me6-vademecum-before'`, [id]))
    // Idempotente: otra corrida no cambia nada
    const snap = JSON.stringify(await sql.query('SELECT * FROM clinic_drugs WHERE clinic_id = ? ORDER BY id', [id]))
    assert.deepEqual(await forceLnmeOnce(sql), {})
    const again = await loadLnme(sql, id, { force: true })
    assert.equal(again.created + again.replaced + again.updated, 0)
    assert.equal(JSON.stringify(await sql.query('SELECT * FROM clinic_drugs WHERE clinic_id = ? ORDER BY id', [id])), snap)
  })
})
