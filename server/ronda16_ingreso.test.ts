import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { type Sql } from './sql.js'
import { fileAlerts, myPendingAdmissions } from '../src/lib/alerts.js'
import { admissionOrdersPending, attendingText } from '../src/lib/inpatient.js'
import { permissionsFor } from '../src/lib/permissions.js'
import { fluidBalance, fluidPeriods, fluidsTag, fluidTotals, parseVolumeMl, signedMl } from '../src/lib/fluids.js'
import { fromLocalValue } from '../src/lib/dateInput.js'
import type { Dose, FluidEntry, InpatientMed } from '../src/lib/types.js'
import { bootApp } from './test/helpers.js'

// Ronda 16 (rama ingreso): HO2 (ingreso directo con nota de ingreso, médico tratante, recepción ingresa) e IE1 (ingestas y excretas)
let sql: Sql
const booted = bootApp(() => { sql = booted.sql })

const as = booted.as

const dx = [{ code: 'DC10', label: 'Colecistitis aguda' }]
const staffId = async (email: string) => String((await sql.one('SELECT id FROM staff WHERE email = ?', [email]))!.id)

/** Una cama libre y un paciente adulto sin estancia activa ni consulta con ingreso reciente, de la clínica del Dr. Nolasco. */
async function freeBedAndPatient(n: number) {
  const doc = await as('hnolasco@demo.clinara')
  const boot = (await doc.get('/api/bootstrap')).body
  const used = new Set(boot.bedStays.map((x: any) => x.bedId))
  const bed = boot.beds.filter((b: any) => b.active && !used.has(b.id))[0]
  const busy = new Set(boot.stays.map((x: any) => x.patientId))
  const pts = await sql.query(`SELECT p.id FROM patients p WHERE p.clinic_id = (SELECT clinic_id FROM staff WHERE id = 's-nolasco') AND p.dni IS NOT NULL AND p.dni <> ''
    AND p.birth_date < '2000-01-01' AND NOT EXISTS (SELECT 1 FROM consultations c WHERE c.patient_id = p.id AND c.admit_kind IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM hospitalizations h WHERE h.patient_id = p.id AND h.status = 'discharged' AND h.consultation_id IS NOT NULL) ORDER BY p.id`)
  const free = pts.map((r) => String(r.id)).filter((id) => !busy.has(id))
  return { bedId: String(bed.id), patientId: free[n] }
}

describe('HO2 (ronda 16): permisos del ingreso', () => {
  test('ingresan médico, recepción y administración; enfermería, laboratorio e imágenes no', () => {
    for (const r of ['doctor', 'reception', 'admin'] as const) assert.ok(permissionsFor(r).includes('inpatient.admit'), r)
    for (const r of ['nurse', 'lab', 'imaging', 'assistant'] as const) assert.ok(!permissionsFor(r).includes('inpatient.admit'), r)
    assert.ok(!permissionsFor('admin', 'office').includes('inpatient.admit'), 'un consultorio no hospitaliza')
    assert.ok(!permissionsFor('reception').includes('inpatient.orders') && !permissionsFor('reception').includes('inpatient.view'), 'recepción no escribe órdenes ni ve el expediente')
  })

  test('laboratorio no puede ingresar (403); enfermería tampoco', async () => {
    const { bedId, patientId } = await freeBedAndPatient(0)
    const body = { patientId, bedId, reason: 'Programada para cirugía', attendingIds: ['s-nolasco'] }
    assert.equal((await (await as('psuazo@demo.clinara')).post('/api/inpatient', body)).status, 403)
    assert.equal((await (await as('murbina@demo.clinara')).post('/api/inpatient', body)).status, 403)
  })
})

describe('HO2 (ronda 16): ingreso directo con médico tratante y órdenes pendientes', () => {
  test('el médico ingresa: es el médico tratante por defecto; queda con órdenes pendientes hasta firmar la nota de ingreso', async () => {
    const { bedId, patientId } = await freeBedAndPatient(1)
    const doc = await as('hnolasco@demo.clinara')
    const noDx = await doc.post('/api/inpatient', { patientId, bedId, reason: 'Dolor abdominal' })
    assert.equal(noDx.status, 400, 'el médico sí pone el diagnóstico')
    const r = await doc.post('/api/inpatient', { patientId, bedId, reason: 'Dolor abdominal', diagnoses: dx })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    assert.deepEqual(r.body.attendingIds, ['s-nolasco'])
    assert.ok(r.body.authorizationId, 'la autorización de hospitalización se genera como siempre')
    const boot = (await doc.get('/api/bootstrap')).body
    const h = boot.inpatients.find((x: any) => x.id === r.body.id)
    assert.equal(h.ordersPending, true)
    assert.ok(myPendingAdmissions(boot.inpatients, 's-nolasco').some((x) => x.id === h.id), 'el pendiente en su Inicio')
    const file = (await doc.get(`/api/inpatient/${r.body.id}`)).body
    assert.ok(admissionOrdersPending(file.hospitalization, file.notes))
    assert.ok(fileAlerts(file, { fever: 38, hypo: 35.5 } as any, new Date()).some((a) => a.key === 'admission-orders' && /Ingreso con órdenes pendientes/.test(a.text)))
    const log = await sql.query(`SELECT action FROM audit WHERE action LIKE 'Ingresó a %' ORDER BY id DESC LIMIT 1`)
    assert.match(String(log[0].action), /médico tratante: Dr\. Hugo Nolasco; ingreso con órdenes pendientes/)
    // La nota de ingreso (formato estándar) lo resuelve
    const note = await doc.post(`/api/inpatient/${r.body.id}/notes`, { kind: 'admission', format: 'dx', chiefComplaint: 'Dolor abdominal', diagnoses: dx, orders: ['Dieta líquida.'] })
    assert.equal(note.status, 201, JSON.stringify(note.body))
    const after = (await doc.get('/api/bootstrap')).body.inpatients.find((x: any) => x.id === r.body.id)
    assert.equal(after.ordersPending, false, 'la alerta desaparece sola')
    assert.ok((await sql.one(`SELECT 1 FROM audit WHERE action LIKE 'Firmó la nota de ingreso de %'`)), 'bitácora: cuándo se firmó la nota de ingreso')
  })

  test('recepción ingresa con médico tratante obligatorio y sin diagnóstico; el médico tratante ve la alerta y la resuelve', async () => {
    const { bedId, patientId } = await freeBedAndPatient(2)
    const rec = await as('aquiroz@demo.clinara')
    const nurseId = await staffId('murbina@demo.clinara')
    assert.equal((await rec.post('/api/inpatient', { patientId, bedId, reason: 'Programada para colecistectomía' })).status, 400, 'sin médico tratante')
    assert.equal((await rec.post('/api/inpatient', { patientId, bedId, reason: 'Programada para colecistectomía', attendingIds: [nurseId] })).status, 400, 'el tratante es un médico')
    const r = await rec.post('/api/inpatient', { patientId, bedId, reason: 'Programada para colecistectomía', attendingIds: ['s-nolasco'] })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    assert.deepEqual(r.body.diagnoses, [])
    assert.equal(r.body.admittedBy, await staffId('aquiroz@demo.clinara'))
    // Recepción no ve el expediente ni escribe notas u órdenes (403 por URL directa)
    assert.equal((await rec.get(`/api/inpatient/${r.body.id}`)).status, 403)
    assert.equal((await rec.post(`/api/inpatient/${r.body.id}/notes`, { kind: 'admission', format: 'dx', chiefComplaint: 'x', diagnoses: dx })).status, 403)
    assert.equal((await rec.post(`/api/inpatient/${r.body.id}/nursing`, { text: 'Nota de prueba' })).status, 403)
    // Ve e imprime la autorización de hospitalización (no la firma: «Firmar ahora» no le aparece)
    const a = await rec.get(`/api/authorizations/${r.body.authorizationId}`)
    assert.equal(a.status, 200)
    assert.equal(a.body.data.doctor.name, 'Dr. Hugo Nolasco', 'firma el médico tratante, no recepción')
    assert.equal((await rec.post(`/api/authorizations/${r.body.authorizationId}/sign`, {})).status, 403)
    // El tablero de camas (sin datos clínicos) dice quién es el médico tratante
    const recBoot = (await rec.get('/api/bootstrap')).body
    assert.equal(recBoot.inpatients.length, 0)
    assert.deepEqual(recBoot.bedStays.find((x: any) => x.id === r.body.id).attendingIds, ['s-nolasco'])
    // El Dr. Nolasco la ve en su Inicio; la Lic. Urbina, «Sin órdenes de ingreso» en la cama
    const doc = await as('hnolasco@demo.clinara')
    assert.ok(myPendingAdmissions((await doc.get('/api/bootstrap')).body.inpatients, 's-nolasco').some((x) => x.id === r.body.id))
    assert.equal((await (await as('murbina@demo.clinara')).get('/api/bootstrap')).body.inpatients.find((x: any) => x.id === r.body.id).ordersPending, true)
    const log = await sql.query(`SELECT action FROM audit WHERE action LIKE 'Ingresó a %' ORDER BY id DESC LIMIT 1`)
    assert.match(String(log[0].action), /médico tratante: Dr\. Hugo Nolasco \(ingreso por recepción, sin diagnóstico\)/)
    // Al firmar la nota de ingreso, la alerta desaparece y los diagnósticos pasan al ingreso (y a la autorización pendiente)
    const note = await doc.post(`/api/inpatient/${r.body.id}/notes`, { kind: 'admission', format: 'dx', chiefComplaint: 'Programada', diagnoses: dx, orders: ['NPO.'] })
    assert.equal(note.status, 201, JSON.stringify(note.body))
    const h = (await doc.get('/api/bootstrap')).body.inpatients.find((x: any) => x.id === r.body.id)
    assert.equal(h.ordersPending, false)
    assert.deepEqual(h.diagnoses, dx)
    assert.equal((await rec.get(`/api/authorizations/${r.body.authorizationId}`)).body.data.admission.diagnosis, 'Colecistitis aguda')
  })

  test('administración también ingresa; varios médicos tratantes, el primero es el principal; el médico los cambia', async () => {
    const { bedId, patientId } = await freeBedAndPatient(3)
    const admin = await as('rmoncada@demo.clinara')
    const other = String((await sql.one(`SELECT id FROM staff WHERE clinic_id = (SELECT clinic_id FROM staff WHERE id = 's-nolasco') AND role = 'doctor' AND active AND id <> 's-nolasco' ORDER BY id LIMIT 1`))!.id)
    const r = await admin.post('/api/inpatient', { patientId, bedId, reason: 'Ingreso programado', attendingIds: [other, 's-nolasco'] })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    assert.deepEqual(r.body.attendingIds, [other, 's-nolasco'])
    assert.equal(attendingText(r.body.attendingIds, (x) => ({ [other]: 'Dr. A', 's-nolasco': 'Dr. B' } as Record<string, string>)[x]), 'Dr. A (principal), Dr. B')
    // Recepción y administración no cambian al médico tratante; el médico sí (queda en la bitácora)
    assert.equal((await admin.patch(`/api/inpatient/${r.body.id}`, { attendingIds: ['s-nolasco'] })).status, 403)
    const doc = await as('hnolasco@demo.clinara')
    const p = await doc.patch(`/api/inpatient/${r.body.id}`, { attendingIds: ['s-nolasco', other] })
    assert.equal(p.status, 200, JSON.stringify(p.body))
    assert.deepEqual(p.body.attendingIds, ['s-nolasco', other])
    assert.ok(await sql.one(`SELECT 1 FROM audit WHERE action LIKE '%médico tratante:%→%'`))
  })

  test('el ingreso desde la consulta (y las estancias de antes) no quedan con órdenes pendientes', async () => {
    const doc = await as('hnolasco@demo.clinara')
    const boot = (await doc.get('/api/bootstrap')).body
    for (const h of boot.inpatients.filter((x: any) => x.consultationId || x.kind === 'observation' || x.observationAt)) assert.equal(h.ordersPending, false, h.id)
    assert.ok(boot.inpatients.every((h: any) => Array.isArray(h.attendingIds) && h.attendingIds.length), 'toda estancia tiene médico tratante (las de antes: quien ingresó)')
  })
})

// ---------------------------------------------------------------- IE1 ----------------------------------------------------------------
const L = (v: string) => fromLocalValue(v).getTime()
const med = (x: Partial<InpatientMed>): InpatientMed => ({ id: 'm1', hospitalizationId: 'h', drug: 'Hartmann', dose: '1000 ml', route: 'Intravenosa', prn: false, firstAt: '2026-11-02T14:00:00.000Z',
  orderedBy: 's', orderedAt: new Date(L('2026-11-02T07:30')).toISOString(), ...x } as InpatientMed)
const dose = (medId: string, at: string, extra: Partial<Dose> = {}): Dose => ({ id: `d-${medId}-${at}`, medId, givenAt: new Date(L(at)).toISOString(), givenBy: 's', status: 'given', ...extra })
const entry = (x: Partial<FluidEntry>): FluidEntry => ({ id: Math.random().toString(36), hospitalizationId: 'h', kind: 'out', item: 'urine', ml: 300, at: new Date(L('2026-11-02T10:00')).toISOString(), createdBy: 's', createdAt: '', ...x })

describe('IE1 (ronda 16): cálculo de ingestas y excretas (función pura)', () => {
  const shift = [L('2026-11-02T07:00'), L('2026-11-02T15:00')] as const
  test('una infusión de 100 mL/h desde las 08:00 da 700 mL en el turno de 07:00 a 15:00; suspendida a las 12:00, 400 mL', () => {
    const inf = med({ drug: 'Solución salina 0.9 %', dose: '1000 ml', infusionRate: 100, infusionUnit: 'ml/h' })
    const doses = [dose('m1', '2026-11-02T08:00')]
    assert.equal(fluidTotals({ meds: [inf], doses, entries: [] }, ...shift, L('2026-11-02T18:00')).iv, 700)
    assert.equal(fluidTotals({ meds: [{ ...inf, infusionStoppedAt: new Date(L('2026-11-02T12:00')).toISOString() }], doses, entries: [] }, ...shift, L('2026-11-02T18:00')).iv, 400)
    assert.equal(fluidTotals({ meds: [{ ...inf, stoppedAt: new Date(L('2026-11-02T12:00')).toISOString() }], doses, entries: [] }, ...shift, L('2026-11-02T18:00')).iv, 400, 'cambiada u omitida: hasta ahí')
    assert.equal(fluidTotals({ meds: [{ ...inf, infusionRate: 2, infusionUnit: 'ml/min' }], doses, entries: [] }, ...shift, L('2026-11-02T18:00')).iv, 840, 'mL/min × 60')
    assert.equal(fluidTotals({ meds: [inf], doses, entries: [] }, ...shift, L('2026-11-02T10:00')).iv, 200, 'la que sigue corriendo cuenta hasta ahora')
    const none = fluidTotals({ meds: [inf], doses: [], entries: [] }, ...shift, L('2026-11-02T18:00'))
    assert.equal(none.iv, 0); assert.equal(none.noStart.length, 1, 'sin inicio registrado no suma: se avisa')
    const src = fluidTotals({ meds: [inf], doses, entries: [] }, ...shift, L('2026-11-02T18:00')).ivSources
    assert.deepEqual(src.map((s) => s.ml), [700]); assert.match(src[0].label, /Solución salina/, 'de qué medicamento sale')
  })

  test('una dosis «1000 ml IV cada 8 h» suma 1000 mL al marcarse aplicada, y no antes; sin volumen no se inventa', () => {
    const m = med({ everyHours: 8 })
    assert.equal(fluidTotals({ meds: [m], doses: [], entries: [] }, ...shift, L('2026-11-02T18:00')).iv, 0)
    assert.equal(fluidTotals({ meds: [m], doses: [dose('m1', '2026-11-02T09:00', { status: 'skipped' })], entries: [] }, ...shift, L('2026-11-02T18:00')).iv, 0, 'no aplicada no suma')
    assert.equal(fluidTotals({ meds: [m], doses: [dose('m1', '2026-11-02T09:00')], entries: [] }, ...shift, L('2026-11-02T18:00')).iv, 1000)
    const cef = med({ id: 'm2', drug: 'Ceftriaxona', dose: '1 g', presentation: 'Vial 1 g', everyHours: 12 })
    const t = fluidTotals({ meds: [cef], doses: [dose('m2', '2026-11-02T09:00')], entries: [] }, ...shift, L('2026-11-02T18:00'))
    assert.equal(t.iv, 0); assert.equal(t.noVolume.length, 1, '«Sin volumen: agrégalo a mano»')
    const oral = med({ id: 'm3', route: 'Oral', dose: '500 ml' })
    assert.equal(fluidTotals({ meds: [oral], doses: [dose('m3', '2026-11-02T09:00')], entries: [] }, ...shift, L('2026-11-02T18:00')).iv, 0, 'solo IV')
    assert.equal(parseVolumeMl('Hartmann 1000 ml'), 1000)
    assert.equal(parseVolumeMl('Bolsa 500 mL'), 500)
    assert.equal(parseVolumeMl('1 L'), 1000)
    assert.equal(parseVolumeMl('Vial 40 mg/10 mL'), undefined, 'un mL de concentración no cuenta')
    assert.equal(parseVolumeMl('2 g'), undefined)
  })

  test('registros manuales, anulados sin sumar, totales y balance con signo; cortes por turno, 12 y 24 h', () => {
    const entries = [entry({}), entry({ kind: 'in', item: 'oral', ml: 200 }), entry({ ml: 999, voidedAt: '2026-11-02T17:00:00.000Z' })]
    const t = fluidTotals({ meds: [], doses: [], entries }, ...shift, L('2026-11-02T18:00'))
    assert.equal(t.out.urine, 300, 'el anulado no suma')
    assert.equal(t.totalIn, 200); assert.equal(t.totalOut, 300); assert.equal(t.balance, -100)
    assert.equal(signedMl(-100), '−100 mL'); assert.equal(signedMl(250), '+250 mL')
    assert.deepEqual(fluidPeriods('shift', L('2026-11-02T08:00'), L('2026-11-03T08:00')).map((p) => p.label), ['07:00–15:00', '15:00–23:00', '23:00–07:00', '07:00–15:00'])
    assert.deepEqual(fluidPeriods('shift', L('2026-11-02T08:00'), L('2026-11-03T08:00')).map((p) => p.day), ['2026-11-02', '2026-11-02', '2026-11-02', '2026-11-03'], 'el día clínico va de 07:00 a 07:00')
    assert.deepEqual(fluidPeriods('h12', L('2026-11-02T08:00'), L('2026-11-02T20:00')).map((p) => p.label), ['07:00–19:00', '19:00–07:00'])
    assert.deepEqual(fluidPeriods('h24', L('2026-11-02T08:00'), L('2026-11-02T20:00')).map((p) => p.label), ['07:00–07:00'])
    const plan = [{ mode: 'shift' as const, from: new Date(L('2026-11-02T08:00')).toISOString(), by: 's' }]
    const days = fluidBalance({ plan, meds: [], doses: [], entries, now: L('2026-11-02T18:00') })
    assert.equal(days.length, 1); assert.equal(days[0].periods.length, 2); assert.equal(days[0].balance, -100)
    assert.deepEqual(fluidBalance({ plan: undefined, meds: [], doses: [], entries, now: L('2026-11-02T18:00') }), [], 'sin la orden no hay tabla')
    assert.equal(fluidsTag(undefined, 'shift'), 'new'); assert.equal(fluidsTag(plan, 'shift'), 'continue'); assert.equal(fluidsTag(plan, 'h12'), 'modified'); assert.equal(fluidsTag(plan, 'off'), 'omitted'); assert.equal(fluidsTag(undefined, 'off'), null)
  })
})

describe('IE1 (ronda 16): la orden en las notas y el registro en el expediente', () => {
  let stayId = ''
  test('la nota de ingreso con «Ingestas y excretas», «Por turno», activa el registro y la indicación', async () => {
    const { bedId, patientId } = await freeBedAndPatient(4)
    const doc = await as('hnolasco@demo.clinara')
    const r = await doc.post('/api/inpatient', { patientId, bedId, reason: 'Diarrea con deshidratación', diagnoses: dx })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    stayId = r.body.id
    const nurse = await as('murbina@demo.clinara')
    assert.equal((await nurse.post(`/api/inpatient/${stayId}/fluids`, { kind: 'out', item: 'urine', ml: 300 })).status, 409, 'sin la orden no se registra')
    const note = await doc.post(`/api/inpatient/${stayId}/notes`, { kind: 'admission', format: 'dx', chiefComplaint: 'Diarrea', diagnoses: dx, orders: ['Dieta blanda.'], fluids: { mode: 'shift' } })
    assert.equal(note.status, 201, JSON.stringify(note.body))
    assert.deepEqual(note.body.fluids, { mode: 'shift', tag: 'new' })
    const file = (await doc.get(`/api/inpatient/${stayId}`)).body
    assert.equal(file.hospitalization.fluidsPlan.at(-1).mode, 'shift')
    assert.ok(await sql.one(`SELECT 1 FROM audit WHERE action LIKE 'Indicó «Cuantificar ingestas y excretas · Por turno%'`))
  })

  test('enfermería registra (con su nombre), corrige en el periodo de gracia y anula con motivo; los demás roles no (403)', async () => {
    const nurse = await as('murbina@demo.clinara')
    const at = new Date(Date.now() - 30 * 60_000).toISOString()
    const r = await nurse.post(`/api/inpatient/${stayId}/fluids`, { kind: 'out', item: 'urine', ml: 300, at })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    assert.equal(r.body.createdBy, await staffId('murbina@demo.clinara'))
    assert.equal((await nurse.post(`/api/inpatient/${stayId}/fluids`, { kind: 'out', item: 'oral', ml: 100 })).status, 400, 'rubro de la lista')
    assert.equal((await nurse.post(`/api/inpatient/${stayId}/fluids`, { kind: 'in', item: 'oral', ml: 100, at: new Date(Date.now() + 3_600_000).toISOString() })).status, 400, 'no en el futuro')
    assert.equal((await (await as('aquiroz@demo.clinara')).post(`/api/inpatient/${stayId}/fluids`, { kind: 'out', item: 'urine', ml: 100 })).status, 403, 'recepción')
    assert.equal((await (await as('rmoncada@demo.clinara')).post(`/api/inpatient/${stayId}/fluids`, { kind: 'out', item: 'urine', ml: 100 })).status, 403, 'administración')
    assert.equal((await (await as('psuazo@demo.clinara')).post(`/api/inpatient/${stayId}/fluids`, { kind: 'out', item: 'urine', ml: 100 })).status, 403, 'laboratorio')
    const aux = await as('rvallecillo@demo.clinara')
    const a = await aux.post(`/api/inpatient/${stayId}/fluids`, { kind: 'in', item: 'oral', ml: 250 })
    assert.equal(a.status, 201, 'la auxiliar también registra')
    const doc = await as('hnolasco@demo.clinara')
    assert.equal((await doc.post(`/api/inpatient/${stayId}/fluids`, { kind: 'out', item: 'vomit', ml: 50 })).status, 201, 'y el médico')
    // Corrección: solo la autora, en el periodo de gracia
    assert.equal((await aux.patch(`/api/fluids/${r.body.id}`, { kind: 'out', item: 'urine', ml: 350, at })).status, 403)
    const c = await nurse.patch(`/api/fluids/${r.body.id}`, { kind: 'out', item: 'urine', ml: 350, at })
    assert.equal(c.status, 200, JSON.stringify(c.body)); assert.equal(c.body.ml, 350); assert.equal(c.body.version, 2)
    // Anular: la autora o el médico; otra enfermera no
    assert.equal((await aux.post(`/api/fluids/${r.body.id}/void`, { reason: 'Registro duplicado' })).status, 403)
    assert.equal((await nurse.post(`/api/fluids/${r.body.id}/void`, { reason: 'no' })).status, 400, 'con motivo')
    const v = await nurse.post(`/api/fluids/${r.body.id}/void`, { reason: 'Registro duplicado' })
    assert.equal(v.status, 200); assert.ok(v.body.voidedAt)
    assert.equal((await nurse.patch(`/api/fluids/${r.body.id}`, { kind: 'out', item: 'urine', ml: 300, at })).status, 409, 'anulado no se corrige')
    const file = (await doc.get(`/api/inpatient/${stayId}`)).body
    assert.equal(file.fluids.length, 3)
    const days = fluidBalance({ plan: file.hospitalization.fluidsPlan, meds: file.meds, doses: file.doses, entries: file.fluids, now: Date.now() })
    assert.equal(days.reduce((s, d) => s + d.totalOut, 0), 50, 'el anulado deja de sumar')
    assert.ok(await sql.one(`SELECT 1 FROM audit WHERE action LIKE 'Ingestas y excretas: anuló Diuresis 350 mL%'`))
  })

  test('solo el médico ordena: enfermería y el radiólogo no (403); una evolución la cambia y la suspende', async () => {
    const doc = await as('hnolasco@demo.clinara')
    assert.equal((await (await as('murbina@demo.clinara')).post(`/api/inpatient/${stayId}/notes`, { kind: 'evolution', format: 'dx', evolution: 'Bien', fluids: { mode: 'h12' } })).status, 403)
    assert.equal((await (await as('rzepeda@demo.clinara')).post(`/api/inpatient/${stayId}/notes`, { kind: 'evolution', format: 'dx', evolution: 'Bien', fluids: { mode: 'h12' } })).status, 403)
    const m = await doc.post(`/api/inpatient/${stayId}/notes`, { kind: 'evolution', format: 'dx', evolution: 'Mejor', fluids: { mode: 'h12' } })
    assert.equal(m.status, 201, JSON.stringify(m.body)); assert.deepEqual(m.body.fluids, { mode: 'h12', tag: 'modified' })
    const off = await doc.post(`/api/inpatient/${stayId}/notes`, { kind: 'evolution', format: 'dx', evolution: 'Tolera la vía oral', fluids: { mode: 'off' } })
    assert.equal(off.status, 201, JSON.stringify(off.body)); assert.deepEqual(off.body.fluids, { mode: 'h12', tag: 'omitted' })
    const file = (await doc.get(`/api/inpatient/${stayId}`)).body
    assert.equal(file.hospitalization.fluidsPlan.at(-1).mode, 'off')
    assert.equal((await (await as('murbina@demo.clinara')).post(`/api/inpatient/${stayId}/fluids`, { kind: 'out', item: 'urine', ml: 100 })).status, 409, 'suspendida: ya no se registra')
  })

  test('la consulta externa con ingreso activa el registro de la estancia', async () => {
    const cid = String((await sql.one(`SELECT clinic_id FROM staff WHERE id = 's-nolasco'`))!.clinic_id)
    const { patientId } = await freeBedAndPatient(5)
    const appt = (await sql.one(`SELECT * FROM appointments WHERE clinic_id = ? ORDER BY start DESC LIMIT 1`, [cid]))!
    const id = `r16i-${Date.now()}`
    const row = { ...appt, id, patient_id: patientId, doctor_id: 's-nolasco', status: 'in_consult', start: new Date().toISOString().slice(0, 16) }
    const cols = Object.keys(row)
    await sql.run(`INSERT INTO appointments (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map((k) => (row as Record<string, unknown>)[k]))
    const doc = await as('hnolasco@demo.clinara')
    const r = await doc.post('/api/consultations', { appointmentId: id, reason: 'Diarrea', diagnoses: dx, admit: true, orders: ['Ingreso a hospitalización', 'Dieta blanda.'],
      indications: ['Ingreso a hospitalización', 'Dieta blanda.'], fluids: { mode: 'shift' } })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    const h = (await sql.one('SELECT fluids_plan, attending_ids FROM hospitalizations WHERE id = ?', [r.body.hospitalizationId]))!
    assert.equal(JSON.parse(String(h.fluids_plan))[0].mode, 'shift')
    assert.equal(JSON.parse(String(h.fluids_plan))[0].noteId, r.body.consultationId)
    assert.deepEqual(JSON.parse(String(h.attending_ids)), ['s-nolasco'], 'HO2: el médico que ingresa desde la consulta es el tratante')
    const boot = (await doc.get('/api/bootstrap')).body
    assert.equal(boot.inpatients.find((x: any) => x.id === r.body.hospitalizationId).ordersPending, false, 'la consulta es la nota de ingreso')
  })
})
