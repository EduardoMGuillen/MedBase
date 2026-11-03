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
