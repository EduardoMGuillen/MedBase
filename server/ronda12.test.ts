import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { type Sql } from './sql.js'
import { GENERATED } from '../src/lib/labRef/generated.js'
import { analyteSection, isQualitative, referenceOf } from '../src/lib/labReference.js'
import { backgroundValue, BACKGROUND_GROUPS, toxicOf } from '../src/lib/format.js'
import { fileAlerts } from '../src/lib/alerts.js'
import { can, permissionsFor } from '../src/lib/permissions.js'
import { bootApp } from './test/helpers.js'

// Ronda 12: con la base y la API (copia en memoria de la demo)
let sql: Sql
const booted = bootApp(() => { sql = booted.sql })

const as = booted.as
const mainClinic = async () => String((await sql.one(`SELECT clinic_id FROM staff WHERE email = 'rmoncada@demo.clinara'`))!.clinic_id)
const EGO = 'Examen general de orina (EGO)'

describe('LB2 (ronda 12): todos los exámenes del documento tienen sus analitos', () => {
  test('el EGO trae sus 19 parámetros, en orden y por parte del examen', () => {
    const ego = referenceOf(EGO)!
    const names = ego.analytes!.map((a) => a.name)
    assert.deepEqual(names, ['Color', 'Aspecto', 'Densidad', 'pH urinario', 'Glucosa', 'Cetonas', 'Proteínas', 'Bilirrubina', 'Nitritos', 'Hemoglobina (sangre)', 'Urobilinógeno',
      'Eritrocitos', 'Leucocitos', 'Cilindros', 'Células epiteliales escamosas', 'Cristales', 'Bacterias', 'Levaduras', 'Moco'])
    assert.equal(ego.text, undefined, 'ya no hay un «resultado esperado» del examen entero')
    assert.equal(analyteSection(EGO, 'Color'), 'Examen físico')
    assert.equal(analyteSection(EGO, 'Nitritos'), 'Examen químico')
    assert.equal(analyteSection(EGO, 'Moco'), 'Examen microscópico')
    const leu = ego.analytes!.find((a) => a.name === 'Leucocitos')!
    assert.equal(leu.high, 5); assert.equal(leu.highOpen, true, '<5 por campo: se escribe un número')
    assert.equal(ego.analytes!.find((a) => a.name === 'Urobilinógeno')!.high, 1)
    assert.ok(isQualitative(ego.analytes!.find((a) => a.name === 'Nitritos')!))
  })
  test('ningún valor del archivo queda sin analito; los de una sola fila se llaman «Resultado»', () => {
    assert.deepEqual(GENERATED.values.filter((v) => !v.analyte).map((v) => v.exam), [])
    assert.deepEqual(GENERATED.unmatched, [])
    assert.deepEqual(GENERATED.orphanRules, [])
    assert.deepEqual(referenceOf('Urocultivo')!.analytes!.map((a) => a.name), ['Resultado'])
    assert.ok(referenceOf('Líquido cefalorraquídeo (LCR)')!.analytes!.some((a) => a.name === 'Gram, cultivo'))
  })
  test('lo nuevo del 04/11/2026: gases arteriales, volumen de 24 h, nicotina, CA 15-3', () => {
    const gas = referenceOf('Gases arteriales')!.analytes!
    assert.deepEqual(gas.map((a) => a.name), ['pH', 'pCO2', 'pO2', 'HCO3', 'Exceso de base', 'Saturación de O₂'])
    assert.deepEqual([gas[4].low, gas[4].high], [-2, 3])
    assert.deepEqual(gas[1].f, [32, 45]); assert.deepEqual(gas[1].m, [35, 48])
    assert.ok(referenceOf('Creatinina / 24 horas')!.analytes!.some((a) => a.name === 'Volumen de orina (24 h)' && a.low === 800 && a.high === 2000))
    assert.equal(referenceOf('Nicotina')!.analytes!.find((a) => a.name === 'Nicotina (suero)')!.high, 3)
    assert.equal(referenceOf('Ca 15-3 (mama)')!.analytes![0].high, 30)
  })
  test('la base de la clínica: el EGO viejo (sin analitos) quedó archivado y los 19 parámetros vigentes', async () => {
    const id = await mainClinic()
    const rows = await sql.query(`SELECT analyte FROM exam_ref_values WHERE clinic_id = ? AND exam_key = ? AND archived_at IS NULL`, [id, 'examen general de orina (ego)'])
    assert.equal(rows.length, 19)
    assert.equal(rows.filter((r) => !r.analyte).length, 0)
    const loose = await sql.query(`SELECT exam_name FROM exam_ref_values WHERE clinic_id = ? AND archived_at IS NULL AND origin = 'catalog' AND (analyte IS NULL OR analyte = '')`, [id])
    assert.deepEqual(loose, [])
    // Los rangos iniciales de los gases (pO2 80–100) quedaron como historial: manda el documento (83–108)
    const po2 = await sql.query(`SELECT low, high, origin FROM exam_ref_values WHERE clinic_id = ? AND exam_key = 'gases arteriales' AND analyte = 'pO2' AND archived_at IS NULL`, [id])
    assert.deepEqual(po2.map((r) => [Number(r.low), Number(r.high), r.origin]), [[83, 108, 'catalog']])
  })
  test('migración: el «resultado esperado» viejo del EGO (sin analito) se archiva; correr la carga otra vez no cambia nada', async () => {
    const { loadRefValues } = await import('./refLoader.js')
    const id = await mainClinic()
    await sql.run(`INSERT INTO exam_ref_values (id, clinic_id, exam_key, exam_name, analyte, sex, unit, expected, sources, origin, origin_label, version, md_row, created_at)
      VALUES ('r12-old', ?, 'examen general de orina (ego)', ?, '', 'all', '', 'Color: Casi incoloro a amarillo oscuro', '[]', 'catalog', 'Catálogo Clinara 2026-11-02', '2026-11-02', 'ORINA › Examen físico › Color', ?)`, [id, EGO, new Date().toISOString()])
    const r = await loadRefValues(sql, id)
    assert.equal(r.inserted, 0)
    assert.ok((await sql.one(`SELECT archived_at FROM exam_ref_values WHERE id = 'r12-old'`))!.archived_at)
    const again = await loadRefValues(sql, id)
    assert.deepEqual([again.inserted, again.replaced.length], [0, 0])
  })
  test('cargar un EGO por parámetro: texto en los cualitativos, Alto en el numérico; sin «crítico»', async () => {
    const id = await mainClinic()
    const doc = await as('vsolorzano@demo.clinara')
    const p = String((await sql.one(`SELECT id FROM patients WHERE clinic_id = ? ORDER BY record LIMIT 1`, [id]))!.id)
    const at = new Date().toISOString()
    await sql.run(`INSERT INTO exam_orders (id, clinic_id, patient_id, batch_id, grp, name, priority, place, area, status, ordered_by, ordered_at, critical) VALUES ('r12-ego', ?, ?, 'r12-b', 'lab', ?, 'routine', 'clinic', 'lab', 'sample', 's-solorzano', ?, FALSE)`, [id, p, EGO, at])
    const lab = await as('psuazo@demo.clinara')
    const r = await lab.post('/api/exams/r12-ego/result', { values: [{ analyte: 'Color', value: 'Amarillo' }, { analyte: 'Nitritos', value: 'Positivos' }, { analyte: 'Leucocitos', value: '12' }, { analyte: 'Densidad', value: '1.020' }] })
    assert.equal(r.status, 200, JSON.stringify(r.body))
    const v = Object.fromEntries((r.body.result.values as { analyte: string; flag?: string; critical?: boolean }[]).map((x) => [x.analyte, x]))
    assert.equal(v.Leucocitos.flag, 'high')
    assert.equal(v.Color.flag, undefined)
    assert.equal(v.Densidad.flag, undefined)
    assert.ok(!Object.values(v).some((x) => x.critical))
    assert.ok(!r.body.critical)
    void doc
  })
})

describe('LB3 (ronda 12): sin umbrales críticos', () => {
  test('ninguna orden queda marcada crítica y un potasio de 7 solo sale Alto', async () => {
    assert.equal((await sql.query('SELECT 1 FROM exam_orders WHERE critical = TRUE')).length, 0)
    const id = await mainClinic()
    const p = String((await sql.one(`SELECT id FROM patients WHERE clinic_id = ? ORDER BY record LIMIT 1`, [id]))!.id)
    await sql.run(`INSERT INTO exam_orders (id, clinic_id, patient_id, batch_id, grp, name, priority, place, area, status, ordered_by, ordered_at, critical) VALUES ('r12-k', ?, ?, 'r12-bk', 'lab', 'Potasio (K)', 'routine', 'clinic', 'lab', 'sample', 's-solorzano', ?, FALSE)`, [id, p, new Date().toISOString()])
    const lab = await as('psuazo@demo.clinara')
    const r = await lab.post('/api/exams/r12-k/result', { values: [{ analyte: 'Potasio', value: '7' }] })
    assert.equal(r.status, 200, JSON.stringify(r.body))
    assert.equal(r.body.result.values[0].flag, 'high')
    assert.ok(!r.body.critical)
  })
})

describe('AN2 (ronda 12): antecedentes', () => {
  test('hospitalarios, traumáticos y quirúrgicos aparte; toxicomanías; sin actividad física', () => {
    const titles = BACKGROUND_GROUPS.map((g) => g.title)
    assert.deepEqual(titles.slice(0, 3), ['Personales patológicos', 'Hospitalarios, traumáticos y quirúrgicos', 'Personales no patológicos'])
    const fields = BACKGROUND_GROUPS.flatMap((g) => g.fields.map((f) => f.key))
    for (const k of ['smoking', 'alcohol', 'drugs', 'lifestyle']) assert.ok(!fields.includes(k as never), k)
    assert.deepEqual(BACKGROUND_GROUPS[2].fields.map((f) => f.label), ['Toxicomanías', 'Inmunizaciones'])
  })
  test('toxicomanías reúne lo que ya estaba escrito; si se escribe, manda', () => {
    assert.equal(toxicOf({ smoking: 'Negado.', alcohol: 'Social, ocasional', drugs: '' }), 'Tabaquismo: Negado. Alcoholismo: Social, ocasional.')
    assert.equal(toxicOf({ toxic: 'Fuma 5 cigarrillos al día', smoking: 'Negado' }), 'Fuma 5 cigarrillos al día')
    assert.equal(backgroundValue({}, 'toxic'), undefined)
  })
})

describe('IM2 (ronda 12): el radiólogo', () => {
  test('escribe notas de evolución sin medicamentos; no la de ingreso', async () => {
    assert.ok(can({ role: 'imaging', position: 'radiologist' }, 'inpatient.notes'))
    assert.ok(!can({ role: 'imaging', position: 'radiologist' }, 'inpatient.orders'))
    assert.ok(!permissionsFor('imaging', 'clinic', 'imaging_tech').includes('inpatient.notes'))
    const stay = String((await sql.one(`SELECT id FROM hospitalizations WHERE status = 'active' AND clinic_id = ? AND kind = 'hospital' ORDER BY admitted_at LIMIT 1`, [await mainClinic()]))!.id)
    const rad = await as('rzepeda@demo.clinara')
    const soap = { subjective: 'Paciente tolera el procedimiento', objective: 'Sin hematoma en el sitio de punción', assessment: 'Drenaje guiado por ultrasonido sin complicaciones', plan: 'Control de imagen en 48 horas' }
    const ok = await rad.post(`/api/inpatient/${stay}/notes`, { kind: 'evolution', format: 'soap', ...soap })
    assert.equal(ok.status, 201, JSON.stringify(ok.body))
    const meds = await rad.post(`/api/inpatient/${stay}/notes`, { kind: 'evolution', format: 'soap', ...soap, meds: [{ drug: 'Ketorolaco', dose: '30 mg', route: 'Intravenosa', everyHours: 8, prn: false }] })
    assert.equal(meds.status, 403)
    const adm = await rad.post(`/api/inpatient/${stay}/notes`, { kind: 'admission', format: 'soap', ...soap })
    assert.equal(adm.status, 403)
    const tech = await as('echinchilla@demo.clinara')
    assert.equal((await tech.post(`/api/inpatient/${stay}/notes`, { kind: 'evolution', format: 'soap', ...soap })).status, 403)
  })
  test('en el expediente solo ve los avisos de sus estudios', () => {
    const now = new Date()
    const file = {
      hospitalization: { id: 'h', status: 'active', admittedAt: new Date(now.getTime() - 86_400_000).toISOString(), kind: 'hospital' },
      notes: [], marks: [], meds: [], doses: [], consultOrders: [], authorizations: [{ id: 'a', status: 'pending', template: 'hospital' }],
      vitals: [{ id: 'v', takenAt: now.toISOString(), temperature: 39.5 }],
      exams: [{ id: 'x1', group: 'imaging', name: 'Radiografía de tórax', status: 'ordered', area: 'imaging', priority: 'urgent', orderedAt: now.toISOString() },
        { id: 'x2', group: 'lab', name: 'Hemograma', status: 'ordered', area: 'lab', priority: 'routine', orderedAt: now.toISOString() }],
    } as never
    const all = fileAlerts(file, { low: 36, high: 37.5 } as never, now)
    const rad = fileAlerts(file, { low: 36, high: 37.5 } as never, now, { groups: ['imaging'] })
    assert.ok(all.some((a) => a.tab === 'vitals'))
    assert.ok(rad.length > 0 && rad.every((a) => a.tab === 'labs'))
    assert.ok(rad.every((a) => !/Laboratorio/.test(a.text)))
  })
})

describe('LB5–LB7 (ronda 12): Laboratorio e Imágenes', () => {
  test('el conteo del menú viene por área', async () => {
    const tech = await as('berazo@demo.clinara')
    const r = await tech.get('/api/dept/count')
    assert.equal(r.status, 200)
    assert.deepEqual(Object.keys(r.body.areas).sort(), ['hospital', 'observation', 'outpatient'])
    assert.equal(r.body.n, r.body.areas.outpatient.n + r.body.areas.observation.n + r.body.areas.hospital.n)
  })
  test('paciente ambulatorio con lo mínimo: nombre, edad, sexo, teléfono o correo e identidad', async () => {
    const tech = await as('berazo@demo.clinara')
    const none = await tech.post('/api/dept/quick-patient', { firstName: 'Ana', lastName: 'Ruiz', age: 30, sex: 'F' })
    assert.equal(none.status, 400, 'sin teléfono ni correo no se registra')
    const r = await tech.post('/api/dept/quick-patient', { firstName: 'Ana', lastName: 'Ruiz Flores', age: 30, sex: 'F', email: 'ana@correo.com', dni: '0801-1996-55555' })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    const row = (await sql.one('SELECT birth_date, phone, email FROM patients WHERE id = ?', [r.body.id]))!
    assert.equal(String(row.birth_date).slice(0, 4), String(new Date().getFullYear() - 30))
    assert.equal(row.email, 'ana@correo.com')
    const again = await tech.post('/api/dept/quick-patient', { firstName: 'Ana', lastName: 'Ruiz', age: 30, sex: 'F', phone: '9999-0000', dni: '0801199655555' })
    assert.equal(again.body.id, r.body.id, 'la misma identidad usa el mismo expediente')
    const baby = await tech.post('/api/dept/quick-patient', { firstName: 'Luis', lastName: 'Mejía', age: 8, ageUnit: 'months', sex: 'M', phone: '3333-4444' })
    assert.equal(baby.status, 201)
    const nurse = await as('murbina@demo.clinara')
    assert.equal((await nurse.post('/api/dept/quick-patient', { firstName: 'X', lastName: 'Y', age: 1, sex: 'M', phone: '12345678' })).status, 403)
  })
})
