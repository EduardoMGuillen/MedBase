import './tz.js'
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { fromLocalValue } from '../src/lib/dateInput.js'
import { fluidBalance, fluidPeriods, fluidSingleColumn, fluidsOrderText, fluidsSentence, fluidTotals, fluidVisibleItems } from '../src/lib/fluids.js'
import type { Dose, FluidEntry, InpatientMed } from '../src/lib/types.js'

// Ronda 17 (rama ronda17-ui): ingestas y excretas (funciones puras de src/lib/fluids.ts)
const L = (v: string) => fromLocalValue(v).getTime()
const day = [L('2026-11-02T07:00'), L('2026-11-03T07:00')] as const
const now = L('2026-11-02T18:00')
const entry = (x: Partial<FluidEntry>): FluidEntry => ({ id: Math.random().toString(36), hospitalizationId: 'h', kind: 'out', item: 'urine', ml: 300, at: new Date(L('2026-11-02T10:00')).toISOString(), createdBy: 's', createdAt: '', ...x })
const med = (x: Partial<InpatientMed>): InpatientMed => ({ id: 'm1', hospitalizationId: 'h', drug: 'Hartmann', dose: '1000 ml', route: 'Intravenosa', prn: false, firstAt: '2026-11-02T14:00:00.000Z',
  orderedBy: 's', orderedAt: new Date(L('2026-11-02T07:30')).toISOString(), ...x } as InpatientMed)
const dose = (medId: string, at: string): Dose => ({ id: `d-${medId}-${at}`, medId, givenAt: new Date(L(at)).toISOString(), givenBy: 's', status: 'given' })

describe('IE2 (ronda 17): solo los rubros que se usaron', () => {
  test('si el paciente sangró y orinó, se ven Sangrado y Diuresis, y no Evacuaciones, Drenajes ni los demás; sin Líquidos IV', () => {
    const t = fluidTotals({ meds: [], doses: [], entries: [entry({}), entry({ item: 'bleeding', ml: 80 })] }, ...day, now)
    const v = fluidVisibleItems(t)
    assert.deepEqual(v.out.map((i) => i.key), ['urine', 'bleeding'])
    assert.deepEqual(v.in, [], 'ningún ingreso registrado')
    assert.equal(v.iv, false, 'sin líquidos IV en la hoja, no aparece la fila calculada')
    assert.equal(v.empty, false)
  })

  test('un registro anulado no cuenta como uso del rubro; sin nada, el día queda vacío', () => {
    const t = fluidTotals({ meds: [], doses: [], entries: [entry({ item: 'vomit', voidedAt: '2026-11-02T17:00:00.000Z' })] }, ...day, now)
    const v = fluidVisibleItems(t)
    assert.deepEqual(v.out, []); assert.equal(v.empty, true)
  })

  test('Líquidos IV aparece solo si ese día hubo líquidos IV en la hoja (con volumen o aplicados sin volumen)', () => {
    const iv = fluidTotals({ meds: [med({ everyHours: 8 })], doses: [dose('m1', '2026-11-02T09:00')], entries: [] }, ...day, now)
    assert.equal(fluidVisibleItems(iv).iv, true)
    assert.equal(fluidVisibleItems(iv).empty, false)
    const sinVolumen = fluidTotals({ meds: [med({ drug: 'Ceftriaxona', dose: '1 g', presentation: 'Vial 1 g', everyHours: 12 })], doses: [dose('m1', '2026-11-02T09:00')], entries: [] }, ...day, now)
    assert.equal(sinVolumen.iv, 0)
    assert.equal(fluidVisibleItems(sinVolumen).iv, true, 'aplicado sin volumen: la fila sale con el aviso «*»')
    const otroDia = fluidTotals({ meds: [med({ everyHours: 8 })], doses: [dose('m1', '2026-11-01T09:00')], entries: [] }, ...day, now)
    assert.equal(fluidVisibleItems(otroDia).iv, false, 'la dosis de otro día no cuenta')
  })

  test('Vía oral entre los ingresos, en el orden de la lista', () => {
    const t = fluidTotals({ meds: [], doses: [], entries: [entry({ kind: 'in', item: 'other_in', ml: 50 }), entry({ kind: 'in', item: 'oral', ml: 200 })] }, ...day, now)
    assert.deepEqual(fluidVisibleItems(t).in.map((i) => i.key), ['oral', 'other_in'])
  })

  test('cada día de la tabla muestra lo suyo', () => {
    const plan = [{ mode: 'h24' as const, from: new Date(L('2026-11-01T08:00')).toISOString(), by: 's' }]
    const entries = [entry({ at: new Date(L('2026-11-01T10:00')).toISOString(), item: 'stool', ml: 100 }), entry({ at: new Date(L('2026-11-02T10:00')).toISOString() })]
    const days = fluidBalance({ plan, meds: [], doses: [], entries, now })
    assert.deepEqual(days.map((d) => [d.day, fluidVisibleItems(d).out.map((i) => i.key)]), [['2026-11-02', ['urine']], ['2026-11-01', ['stool']]])
  })
})

describe('UI3 (ronda 17): la frase y la columna única', () => {
  test('la frase de la tarjeta queda bien puntuada', () => {
    assert.equal(`${fluidsSentence('h24')} Los líquidos IV se calculan de la hoja de medicamentos; toca un número para ver de dónde sale.`,
      'Cuantificar ingestas y excretas cada 24 horas. Los líquidos IV se calculan de la hoja de medicamentos; toca un número para ver de dónde sale.')
    assert.equal(fluidsSentence('h12'), 'Cuantificar ingestas y excretas cada 12 horas.')
    assert.equal(fluidsSentence('shift'), 'Cuantificar ingestas y excretas por turno (07:00, 15:00 y 23:00).')
    assert.equal(fluidsOrderText('h24'), 'Cuantificar ingestas y excretas · Cada 24 horas', 'la orden en las notas no cambia')
  })

  test('con un solo corte de 24 horas, una sola columna; por turno o cada 12 horas, columnas por corte', () => {
    assert.equal(fluidSingleColumn(fluidPeriods('h24', L('2026-11-02T08:00'), L('2026-11-02T20:00'))), true)
    assert.equal(fluidSingleColumn(fluidPeriods('h12', L('2026-11-02T08:00'), L('2026-11-02T10:00'))), false, 'un corte de 12 horas sigue mostrando su columna')
    assert.equal(fluidSingleColumn(fluidPeriods('shift', L('2026-11-02T08:00'), L('2026-11-02T20:00'))), false)
  })
})
