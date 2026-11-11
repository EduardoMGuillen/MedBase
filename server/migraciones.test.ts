import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { ensureDb } from './db.js'
import { checkSteps, type Step } from './migrations.js'
import { BASELINE_VERSION } from './schema.js'
import { createSql, type Sql } from './sql.js'

let sql: Sql
before(async () => { sql = createSql({ memory: true }); await ensureDb(sql) })
after(async () => { await sql.close() })

/** La misma base como si fuera otra instancia que arranca (ensureDb recuerda por objeto), contando lo que ejecuta. */
function instance() {
  const log = { exec: 0, tx: 0 }
  const same: Sql = { ...sql, exec: (t) => { log.exec++; return sql.exec(t) }, tx: (fn) => { log.tx++; return sql.tx(fn) } }
  return { same, log }
}
const meta = async (key: string) => (await sql.one<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key]))?.value

describe('migraciones: versión base y pasos numerados', () => {
  test('una base al día no ejecuta nada: ni esquema ni transacción', async () => {
    const { same, log } = instance()
    await ensureDb(same)
    assert.deepEqual(log, { exec: 0, tx: 0 })
    assert.equal(await meta('schema'), BASELINE_VERSION)
  })

  test('un paso nuevo corre una sola vez, en orden, y queda anotado', async () => {
    const ran: number[] = []
    const steps: Step[] = [
      { id: 1, name: 'tabla de prueba', run: async (q) => { ran.push(1); await q.exec('CREATE TABLE paso_uno (id TEXT PRIMARY KEY)') } },
      { id: 2, name: 'columna de prueba', run: async (q) => { ran.push(2); await q.exec('ALTER TABLE paso_uno ADD COLUMN nota TEXT') } },
    ]
    await ensureDb(instance().same, steps)
    assert.deepEqual(ran, [1, 2])
    assert.equal(await meta('schema_step'), '2')
    // Otra instancia con los mismos pasos: nada (CREATE TABLE sin IF NOT EXISTS fallaría si se repitiera)
    const again = instance()
    await ensureDb(again.same, steps)
    assert.deepEqual(ran, [1, 2])
    assert.deepEqual(again.log, { exec: 0, tx: 0 })
    // Con un paso más, solo corre el nuevo
    await ensureDb(instance().same, [...steps, { id: 3, name: 'otro', run: async () => { ran.push(3) } }])
    assert.deepEqual(ran, [1, 2, 3])
    assert.equal(await meta('schema_step'), '3')
  })

  test('si un paso falla, no queda a medias: se revierte y el siguiente arranque lo reintenta', async () => {
    const steps = (ok: boolean): Step[] => [
      ...[1, 2, 3].map((id): Step => ({ id, name: `p${id}`, run: async () => {} })),
      { id: 4, name: 'falla', run: async (q) => { await q.exec('CREATE TABLE paso_cuatro (id TEXT)'); if (!ok) throw new Error('paso roto') } },
    ]
    await assert.rejects(ensureDb(instance().same, steps(false)), /paso roto/)
    assert.equal(await meta('schema_step'), '3')
    assert.equal(await sql.one(`SELECT 1 FROM information_schema.tables WHERE table_name = 'paso_cuatro'`), undefined)
    await ensureDb(instance().same, steps(true))
    assert.equal(await meta('schema_step'), '4')
  })

  test('una base que dejó más adelante un despliegue más nuevo no se toca (vuelta atrás de un despliegue)', async () => {
    await sql.run(`UPDATE meta SET value = ? WHERE key = 'schema'`, [String(Number(BASELINE_VERSION) + 1)])
    const { same, log } = instance()
    await ensureDb(same)
    assert.deepEqual(log, { exec: 0, tx: 0 })
    assert.equal(await meta('schema'), String(Number(BASELINE_VERSION) + 1))
    await sql.run(`UPDATE meta SET value = ? WHERE key = 'schema'`, [BASELINE_VERSION])
  })

  test('volver a ejecutar el esquema base no falla con adendas de anestesia, valoración o recuento', async () => {
    // El esquema base se repite entero en una base anterior a la versión base. Antes volvía a poner una lista corta de
    // tipos de adenda y fallaba con estas filas: la aplicación quedaba sin servicio para todas las clínicas.
    const at = new Date().toISOString()
    for (const kind of ['anesthesia', 'preanesthesia', 'surgical_count']) {
      await sql.run(`INSERT INTO addenda (id, clinic_id, target_kind, target_id, kind, text, author_id, author_role, at) VALUES (?, 'c-sl', ?, 'x', 'info', 'Aclaración', 's2-lobo', 'doctor', ?)`, [`ad-${kind}`, kind, at])
    }
    await sql.run(`UPDATE meta SET value = ? WHERE key = 'schema'`, [String(Number(BASELINE_VERSION) - 1)])
    const { same, log } = instance()
    await ensureDb(same)
    assert.equal(log.tx, 1)
    assert.equal(await meta('schema'), BASELINE_VERSION)
    assert.equal(Number((await sql.one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM addenda WHERE id LIKE 'ad-%'`))!.n), 3)
  })

  test('los pasos mal numerados se rechazan al arrancar', () => {
    assert.throws(() => checkSteps([{ id: 2, name: 'x', run: async () => {} }]), /mal numerados/)
    assert.throws(() => checkSteps([{ id: 1, name: 'a', run: async () => {} }, { id: 1, name: 'b', run: async () => {} }]), /mal numerados/)
    assert.doesNotThrow(() => checkSteps([]))
  })
})
