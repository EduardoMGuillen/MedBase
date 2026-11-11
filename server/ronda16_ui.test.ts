import './tz.js'
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { type Sql } from './sql.js'
import { EXAMS, finishedOn, orderGroups, resultBrief } from '../src/lib/exams.js'
import { bootApp } from './test/helpers.js'

// Ronda 16 (rama ronda16-ui): con la base y la API (copia en memoria de la demo)
let sql: Sql
const booted = bootApp(() => { sql = booted.sql })

const as = booted.as
const mainClinic = async () => String((await sql.one(`SELECT clinic_id FROM staff WHERE email = 'vsolorzano@demo.clinara'`))!.clinic_id)
const stayOf = async (kind = 'hospital') => String((await sql.one(`SELECT id FROM hospitalizations WHERE status = 'active' AND clinic_id = ? AND kind = ? ORDER BY admitted_at LIMIT 1`, [await mainClinic(), kind]))!.id)

describe('RX1 (ronda 16): «Terminados hoy» por fecha local (Honduras, UTC−6)', () => {
  test('un estudio informado a las 19:00 de Honduras es de ese día, no del siguiente', () => {
    // 6 nov 19:00 en Honduras = 7 nov 01:00 UTC
    const at = new Date('2026-11-06T19:00:00-06:00').toISOString()
    assert.equal(at, '2026-11-07T01:00:00.000Z')
    assert.equal(finishedOn({ statusAt: at, result: { at } }, '2026-11-06'), true)
    assert.equal(finishedOn({ statusAt: at, result: { at } }, '2026-11-07'), false)
    // Sin resultado (Rayos X realizado, sin informe): por la hora del estado
    assert.equal(finishedOn({ statusAt: at }, '2026-11-06'), true)
    // 05:59 de Honduras sigue siendo ese día
    assert.equal(finishedOn({ statusAt: new Date('2026-11-06T00:30:00-06:00').toISOString() }, '2026-11-06'), true)
    assert.equal(finishedOn({ statusAt: undefined }, '2026-11-06'), false)
  })

  test('la bandeja del radiólogo trae el estudio de observación informado a las 19:00, en su área, solo en su día', async () => {
    const doc = await as('vsolorzano@demo.clinara')
    const rad = await as('rzepeda@demo.clinara')
    const stay = await stayOf('observation')
    const n = await doc.post(`/api/inpatient/${stay}/notes`, { kind: 'evolution', format: 'dx', observations: 'RX1', exams: [
      { group: 'imaging', name: 'Tomografía', subject: 'cráneo', contrast: 'Simple', priority: 'routine', place: 'clinic' }] })
    assert.equal(n.status, 201, JSON.stringify(n.body))
    const ct = (await rad.get('/api/dept/tray')).body.items.find((e: any) => e.noteId === n.body.id)
    assert.ok(ct, 'el estudio pendiente está en la bandeja')
    assert.match(ct.locationText, /^Observación/)
    assert.equal((await rad.post(`/api/exams/${ct.id}/status`, { status: 'done' })).status, 200)
    assert.equal((await rad.post(`/api/exams/${ct.id}/result`, { report: 'Sin alteraciones agudas.' })).status, 200)
    // Lo informó el 6 nov a las 19:00 de Honduras (01:00 UTC del 7)
    const at = '2026-11-07T01:00:00.000Z'
    const row = (await sql.one('SELECT result FROM exam_orders WHERE id = ?', [ct.id]))!
    await sql.run('UPDATE exam_orders SET status_at = ?, result = ? WHERE id = ?', [at, JSON.stringify({ ...JSON.parse(String(row.result)), at }), ct.id])
    const day6 = (await rad.get('/api/dept/tray?day=2026-11-06')).body.items.find((e: any) => e.id === ct.id)
    assert.ok(day6, 'el 6 nov lo trae el servidor')
    assert.match(day6.locationText, /^Observación/, 'queda en el área donde estaba el paciente')
    assert.equal(finishedOn(day6, '2026-11-06'), true, 'y va en «Terminados hoy» del 6')
    // El día anterior ya no lo trae (antes el margen de un día lo mezclaba)
    const day5 = (await rad.get('/api/dept/tray?day=2026-11-05')).body.items.find((e: any) => e.id === ct.id)
    assert.ok(!day5 || !finishedOn(day5, '2026-11-05'))
  })
})

describe('LB8 y EX12 (ronda 16): exámenes agrupados por categoría del catálogo, con el resultado en el renglón', () => {
  const names = ['Hemograma', 'Coprocultivo', 'Procalcitonina', 'Urea nitrogenada (BUN)', 'Sodio (Na)', 'Proteína C reactiva', 'Potasio (K)', 'Examen general de heces', 'Cloruro (Cl)', 'Creatinina']
  test('10 exámenes de laboratorio quedan en sus categorías, en el orden del catálogo, sin perder ninguno', () => {
    const xs = names.map((name, i) => ({ id: String(i), group: 'lab' as const, name }))
    const groups = orderGroups(xs, EXAMS)
    assert.equal(groups.flatMap((g) => g.items).length, 10)
    assert.ok(groups.length >= 4, 'varias categorías')
    assert.equal(groups[0].title, 'Hematología')
    const titles = groups.map((g) => g.title)
    assert.equal(new Set(titles).size, titles.length, 'cada categoría una sola vez')
  })
  test('el resumen del resultado: los valores fuera de rango primero; si no hay, los valores o el inicio del informe', () => {
    assert.deepEqual(resultBrief({ at: '', by: '', values: [{ analyte: 'Sodio', value: '128', unit: 'mmol/L', flag: 'low' }, { analyte: 'Potasio', value: '4', unit: 'mmol/L' }] }).flags, ['Sodio 128 mmol/L (bajo)'])
    assert.equal(resultBrief({ at: '', by: '', values: [{ analyte: 'Hemoglobina', value: '12', unit: 'g/dL' }] }).text, 'Hemoglobina 12 g/dL')
    assert.equal(resultBrief({ at: '', by: '', report: 'Sin alteraciones agudas.' }).text, 'Sin alteraciones agudas.')
    assert.deepEqual(resultBrief(undefined), { flags: [] })
  })
})
