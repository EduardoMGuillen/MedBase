import '../tz.js'
import { createSql } from '../sql.js'
import { ensureDb } from '../db.js'
import { closeVisitsOfInpatients } from '../stayVisits.js'
const snap = async (sql: any) => JSON.stringify(await sql.query(`SELECT id, status, cancel_reason, cancelled_by FROM appointments ORDER BY id`).catch(() => []))
const sql = createSql()
console.log('schema antes', (await sql.one(`SELECT value FROM meta WHERE key='schema'`))?.value)
await ensureDb(sql)
console.log('schema después', (await sql.one(`SELECT value FROM meta WHERE key='schema'`))?.value)
const a = await snap(sql)
console.log('segunda corrida cierra', await closeVisitsOfInpatients(sql))
const b = await snap(sql)
console.log('sin cambios la segunda vez:', a === b)
await sql.close()
