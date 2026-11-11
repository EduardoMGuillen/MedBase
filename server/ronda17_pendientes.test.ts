import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { type Sql } from './sql.js'
import { placeOf } from './http.js'
import { contactLine, docPhone } from '../src/lib/format.js'
import { rxToSetMed, setMedToRx } from '../src/lib/orderSets.js'
import { consultItemIssue, INFUSION_FREQUENCY } from '../src/lib/medForm.js'
import { bootApp } from './test/helpers.js'

// Ronda 17, pendientes de las rondas de corrección (PE): con la base y la API (copia en memoria de la demo)
let sql: Sql
const booted = bootApp(() => { sql = booted.sql })

const as = booted.as

describe('R13 IM1 (pendiente): el teléfono de los documentos va sin «+504»', () => {
  test('docPhone quita el prefijo y contactLine lo usa', () => {
    assert.equal(docPhone('+504 2232-7710'), '2232-7710')
    assert.equal(docPhone('+5042232-7710'), '2232-7710')
    assert.equal(docPhone('  + 504  9988-7766'), '9988-7766')
    assert.equal(docPhone('2232-7710'), '2232-7710')
    assert.equal(docPhone('+1 305 555 0100'), '+1 305 555 0100')
    assert.equal(contactLine({ phone: '+504 2232-7710' }), '2232-7710')
    assert.equal(contactLine({ phone: '+504 2232-7710', docsWhatsapp: true, contacts: [{ id: 'w', number: '+504 9988-7766', label: 'WhatsApp', type: 'whatsapp', whatsapp: true }] }),
      '2232-7710 · WhatsApp 9988-7766')
  })

  test('la demo guarda los teléfonos de las clínicas en formato local', async () => {
    const rows = await sql.query('SELECT phone FROM clinics')
    assert.ok(rows.length > 0)
    for (const r of rows) assert.ok(!String(r.phone ?? '').includes('+504'), String(r.phone))
  })
})

describe('Consultorio (pendiente): los mensajes del servidor dicen «consultorio» en una cuenta de consultorio', () => {
  test('placeOf según el tipo de cuenta', () => {
    assert.deepEqual(placeOf('office'), { word: 'consultorio', the: 'el consultorio', The: 'El consultorio', of: 'del consultorio' })
    assert.deepEqual(placeOf('clinic'), { word: 'clínica', the: 'la clínica', The: 'La clínica', of: 'de la clínica' })
    assert.equal(placeOf(undefined).word, 'clínica')
  })

  test('Configuración: dos números de WhatsApp, en el consultorio y en la clínica', async () => {
    const twoWa = [
      { id: 'principal', number: '2239-4410', label: 'Principal', type: 'call', primary: true },
      { id: 'a', number: '9988-7766', label: 'A', type: 'whatsapp', whatsapp: true },
      { id: 'b', number: '9988-7767', label: 'B', type: 'whatsapp', whatsapp: true },
    ]
    const office = await as('ipacheco@demo.clinara')
    await office.post('/api/me/view', { role: 'admin' })
    const s1 = (await office.get('/api/bootstrap')).body.settings
    const r1 = await office.put('/api/settings', { ...s1, contacts: twoWa })
    await office.post('/api/me/view', { role: 'doctor' })
    assert.equal(r1.status, 400)
    assert.match(r1.body.error, /WhatsApp del consultorio/)
    assert.doesNotMatch(r1.body.error, /clínica/)
    const clinic = await as('rmoncada@demo.clinara')
    const s2 = (await clinic.get('/api/bootstrap')).body.settings
    const r2 = await clinic.put('/api/settings', { ...s2, contacts: twoWa })
    assert.equal(r2.status, 400)
    assert.match(r2.body.error, /WhatsApp de la clínica/)
  })

  test('Vademécum: un medicamento repetido en el consultorio', async () => {
    const office = await as('ipacheco@demo.clinara')
    const a = await office.post('/api/drugs', { name: 'Zetaprueba PE uno', presentation: 'Tableta 10 mg' })
    const b = await office.post('/api/drugs', { name: 'Zetaprueba PE dos', presentation: 'Tableta 10 mg' })
    assert.ok(a.status < 300 && b.status < 300, JSON.stringify([a.body, b.body]))
    const r = await office.patch(`/api/drugs/${b.body.id}`, { name: 'Zetaprueba PE uno' })
    assert.equal(r.status, 409)
    assert.match(r.body.error, /vademécum del consultorio/)
  })
})

describe('Sets de órdenes (pendiente): una infusión guarda y vuelve a poner su velocidad', () => {
  test('de la receta al set y de vuelta (consulta)', () => {
    const it = { drug: 'Norepinefrina', presentation: '4 mg/4 mL', dose: '8 mg en 250 mL SSN', route: 'Intravenosa', frequency: INFUSION_FREQUENCY, duration: '', instructions: '',
      infusionRate: 7.5, infusionUnit: 'ml/h' as const }
    const m = rxToSetMed(it)
    assert.equal(m.infusionRate, 7.5)
    assert.equal(m.infusionUnit, 'ml/h')
    assert.equal(m.everyHours, undefined)
    assert.equal(m.prn, false)
    const back = setMedToRx(m)
    assert.equal(back.frequency, INFUSION_FREQUENCY)
    assert.equal(back.infusionRate, 7.5)
    assert.equal(back.infusionUnit, 'ml/h')
    assert.equal(consultItemIssue(back, { admitting: false }), '')
    // Un medicamento con horario sigue igual
    const q12 = rxToSetMed({ drug: 'Ceftriaxona', presentation: '1 g', dose: '1 g', route: 'Intravenosa', frequency: 'Cada 12 horas', duration: '7 días', instructions: '' })
    assert.equal(q12.everyHours, 12)
    assert.equal(q12.infusionRate, undefined)
    assert.equal(setMedToRx(q12).frequency, 'Cada 12 horas')
  })

  test('el servidor guarda la velocidad en el set y la devuelve', async () => {
    const doc = await as('hnolasco@demo.clinara')
    const r = await doc.post('/api/order-sets', { name: 'Choque séptico PE', items: [
      { text: 'Monitoreo continuo.' },
      { med: { drug: 'Norepinefrina', dose: '8 mg en 250 mL SSN', route: 'Intravenosa', prn: false, infusionRate: 7.5, infusionUnit: 'ml/h' } },
      { med: { drug: 'Ceftriaxona', dose: '1 g', route: 'Intravenosa', everyHours: 12, prn: false } },
    ] })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    const sets = (await doc.get('/api/order-sets')).body as { id: string; items: { med?: { drug: string; infusionRate?: number; infusionUnit?: string; everyHours?: number } }[] }[]
    const set = sets.find((s) => s.id === r.body.id)!
    const nor = set.items.find((x) => x.med?.drug === 'Norepinefrina')!.med!
    assert.equal(nor.infusionRate, 7.5)
    assert.equal(nor.infusionUnit, 'ml/h')
    const cef = set.items.find((x) => x.med?.drug === 'Ceftriaxona')!.med!
    assert.equal(cef.infusionRate, undefined)
    assert.equal(cef.everyHours, 12)
    // Una velocidad no válida se rechaza
    const bad = await doc.post('/api/order-sets', { name: 'Infusión mala PE', items: [{ med: { drug: 'X', dose: '1', route: 'Intravenosa', prn: false, infusionRate: -1, infusionUnit: 'ml/h' } }] })
    assert.equal(bad.status, 400)
  })
})
