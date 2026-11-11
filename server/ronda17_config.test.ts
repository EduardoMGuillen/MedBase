import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { enableObsChecklistOnce, ensureDb } from './db.js'
import { type Sql } from './sql.js'
import { bootApp } from './test/helpers.js'

// Ronda 17, configuración (OB1): con la base y la API (copia en memoria de la demo)
let sql: Sql
const booted = bootApp(() => { sql = booted.sql })

const as = booted.as
const checklistOf = async (cid: string) => Boolean((await sql.one('SELECT obs_order_checklist FROM clinics WHERE id = ?', [cid]))!.obs_order_checklist)
const clinicOfUser = async (email: string) => String((await sql.one('SELECT clinic_id FROM staff WHERE email = ?', [email]))!.clinic_id)

describe('OB1 (ronda 17): «Enfermería las revisa como checklist» viene activado', () => {
  test('la demo y una clínica nueva creada por la plataforma lo traen activado', async () => {
    assert.equal(await checklistOf(await clinicOfUser('rmoncada@demo.clinara')), true)
    const sa = await as('dcerrato@demo.clinara')
    const r = await sa.post('/api/platform/clinics', { kind: 'clinic', name: 'Clínica Nueva OB1', address: 'Col. Palmira', phone: '2232-1717',
      admin: { name: 'Admin Nueva OB1', email: 'admin-ob1@test.hn' } })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    assert.equal(await checklistOf(r.body.clinic.id), true)
    const admin = await as('admin-ob1@test.hn', r.body.password)
    const boot = (await admin.get('/api/bootstrap')).body
    assert.equal(boot.settings.obsOrderChecklist, true)
    // Si un cliente viejo no manda el campo, queda activado (no se apaga sin querer)
    const { obsOrderChecklist: _omit, ...rest } = boot.settings
    assert.equal((await admin.put('/api/settings', rest)).status, 200)
    assert.equal(await checklistOf(r.body.clinic.id), true)
  })

  test('la migración lo activa una vez (con copia en config_backups) y no vuelve a encenderlo si alguien lo apaga después', async () => {
    const cid = await clinicOfUser('rmoncada@demo.clinara')
    // Como una base anterior a OB1: apagado y sin la marca de la migración
    await sql.run('UPDATE clinics SET obs_order_checklist = FALSE WHERE id = ?', [cid])
    await sql.run(`DELETE FROM meta WHERE key = 'ob1_obs_checklist'`)
    const before = Number((await sql.one(`SELECT count(*) AS n FROM config_backups WHERE kind = 'obs_order_checklist' AND clinic_id = ?`, [cid]))!.n)
    await enableObsChecklistOnce(sql)
    assert.equal(await checklistOf(cid), true)
    assert.equal(Number((await sql.one(`SELECT count(*) AS n FROM config_backups WHERE kind = 'obs_order_checklist' AND clinic_id = ?`, [cid]))!.n), before + 1)
    assert.ok(await sql.one(`SELECT 1 FROM audit WHERE clinic_id = ? AND user_id = 'sistema' AND action LIKE '%OB1%'`, [cid]))

    // Administración lo apaga a propósito desde Configuración
    const admin = await as('rmoncada@demo.clinara')
    const s = (await admin.get('/api/bootstrap')).body.settings
    assert.equal((await admin.put('/api/settings', { ...s, obsOrderChecklist: false })).status, 200)
    assert.equal(await checklistOf(cid), false)

    // La migración otra vez (misma versión): no cambia nada
    await enableObsChecklistOnce(sql)
    assert.equal(await checklistOf(cid), false)
    // ensureDb otra vez con la misma versión: tampoco
    await ensureDb(createSqlSame())
    assert.equal(await checklistOf(cid), false)
    // Aunque el esquema completo vuelva a correr (otra subida de versión), sigue apagado
    await sql.run(`UPDATE meta SET value = '89' WHERE key = 'schema'`)
    await ensureDbFresh()
    assert.equal(await checklistOf(cid), false)
    assert.equal((await sql.one(`SELECT value FROM meta WHERE key = 'schema'`))!.value, '90')
  })
})

/** ensureDb recuerda por conexión que ya corrió; para volver a correrlo sobre la misma base se usa un envoltorio nuevo. */
function createSqlSame(): Sql {
  return Object.create(sql) as Sql
}
async function ensureDbFresh() {
  await ensureDb(createSqlSame())
}
