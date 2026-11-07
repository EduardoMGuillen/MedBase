import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import React, { createElement, type FC } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { examCatalog, trayCards } from '../src/lib/exams.js'
import { soapBlocks } from '../src/lib/inpatient.js'

// Ronda 17 (rama lab-notas): LB9 (la misma tarjeta en las tres áreas de Laboratorio e Imágenes) y NO4 (diagnósticos en SOAP)
type It = { id: string; group: 'lab' | 'imaging'; name: string; patientId: string; priority: 'routine' | 'urgent'; orderedAt: string; locationText: string; status: string }
const it = (id: string, name: string, locationText: string, extra: Partial<It> = {}): It =>
  ({ id, group: 'lab', name, patientId: 'p1', priority: 'routine', orderedAt: '2026-11-07T10:00:00.000Z', locationText, status: 'ordered', ...extra })
const catalog = examCatalog([])
const can = (e: It) => e.status === 'ordered'

describe('LB9 (ronda 17): una sola regla de botones en las tres áreas', () => {
  test('con una sola categoría también sale el botón de la categoría, en Observación, Hospitalización y Ambulatorio', () => {
    for (const where of ['Observación', 'Hospitalización · Cuarto 105', 'Consulta externa', 'Ambulatorio']) {
      const [card] = trayCards([it('a', 'Examen general de orina (EGO)', where)], catalog, can)
      assert.equal(card.takeable.length, 1, `${where}: botón general`)
      assert.equal(card.cats.length, 1)
      assert.equal(card.cats[0].takeable.length, 1, `${where}: botón de la categoría aunque sea la única`)
    }
  })
  test('varias categorías: un botón por categoría con pendientes; la que no tiene pendientes, ninguno', () => {
    const xs = [it('a', 'Hemograma', 'Observación'), it('b', 'Creatinina', 'Observación'), it('c', 'Urea nitrogenada (BUN)', 'Observación', { status: 'sample' }),
      it('d', 'Examen general de orina (EGO)', 'Observación', { status: 'sample' })]
    const [card] = trayCards(xs, catalog, can)
    assert.equal(card.takeable.length, 2)
    const counts = Object.fromEntries(card.cats.map((c) => [c.title, c.takeable.length]))
    assert.equal(counts['Hematología'], 1)
    assert.equal(counts['Química en sangre'], 1, 'la creatinina por tomar; la urea ya tiene muestra')
    assert.equal(counts['Orina'], 0, 'sin pendientes, sin botón')
  })
  test('una tarjeta por paciente y ubicación, en el orden de la lista; urgente y la espera desde la orden más antigua', () => {
    const xs = [it('a', 'Hemograma', 'Observación', { priority: 'urgent', orderedAt: '2026-11-07T12:00:00.000Z' }), it('b', 'Creatinina', 'Observación', { orderedAt: '2026-11-07T09:00:00.000Z' }),
      it('c', 'Hemograma', 'Hospitalización · Cuarto 202', { patientId: 'p2' })]
    const cards = trayCards(xs, catalog, can)
    assert.deepEqual(cards.map((c) => c.key), ['p1|Observación', 'p2|Hospitalización · Cuarto 202'])
    assert.equal(cards[0].urgent, true)
    assert.equal(cards[0].oldest, '2026-11-07T09:00:00.000Z')
    assert.equal(cards[1].urgent, false)
  })
  test('Imágenes usa la misma tarjeta: por categoría (Rayos X, Ultrasonido) con su botón', () => {
    const xs = [it('a', 'Ultrasonido abdominal', 'Observación', { group: 'imaging' }), it('b', 'Radiografía de tórax', 'Observación', { group: 'imaging' })]
    const [card] = trayCards(xs, catalog, can)
    assert.equal(card.takeable.length, 2)
    assert.equal(card.cats.length, 2, JSON.stringify(card.cats.map((c) => c.title)))
    assert.ok(card.cats.every((c) => c.takeable.length === 1))
  })
})

// NO4 (ronda 17): en la evolución SOAP los diagnósticos van primero; en la nota de ingreso SOAP, debajo de A (NO3)
describe('NO4 (ronda 17): el orden de los diagnósticos en la nota SOAP', () => {
  test('la regla que recorren el editor y el documento: evolución primero, ingreso debajo de A', () => {
    assert.deepEqual(soapBlocks('evolution'), ['dx', 'vitals', 'subjective', 'objective', 'assessment', 'plan'])
    assert.deepEqual(soapBlocks('admission'), ['vitals', 'subjective', 'objective', 'assessment', 'dx', 'plan'])
  })

  // El documento firmado (el mismo componente del expediente completo, que es el que se imprime), dibujado de verdad.
  // El componente es TSX: se carga en tiempo de ejecución (tsx lo compila con el `React` global; el tsc del servidor no usa JSX)
  const note = (kind: 'admission' | 'evolution', format: 'soap' | 'dx' = 'soap') => ({ kind, format, subjective: 'Refiere mejoría.', objective: 'Afebril.', assessment: 'Evoluciona bien.', plan: 'Igual manejo.',
    diagnoses: [{ code: 'DA90.0', label: 'Síndrome diarreico' }], exam: '', observations: '', evolution: 'Mejor.' })
  const draw = async (n: ReturnType<typeof note>) => {
    Object.assign(globalThis, { React })
    const mod = await import(['..', 'src', 'components', 'NoteColumns.tsx'].join('/')) as { NoteText: FC<{ n: unknown }> }
    return renderToStaticMarkup(createElement(mod.NoteText, { n }))
  }
  const at = (html: string, labels: string[]) => labels.map((l) => html.indexOf(l))
  test('el documento firmado sigue el orden del editor en los dos casos', async () => {
    const evo = await draw(note('evolution'))
    const [dx, s, a, p] = at(evo, ['Diagnósticos (CIE-11)', 'S. Subjetivo', 'A. Análisis', 'P. Plan'])
    assert.ok(dx >= 0 && dx < s && s < a && a < p, `evolución: diagnósticos primero (${evo})`)
    const adm = await draw(note('admission'))
    const [dx2, s2, a2, p2] = at(adm, ['Diagnósticos (CIE-11)', 'S. Subjetivo', 'A. Análisis', 'P. Plan'])
    assert.ok(s2 >= 0 && s2 < a2 && a2 < dx2 && dx2 < p2, `ingreso: debajo de A y antes de P (${adm})`)
  })
  test('el estándar de evolución sigue con los diagnósticos primero', async () => {
    const std = await draw(note('evolution', 'dx'))
    const [dx, evo, exam] = at(std, ['Diagnósticos', 'Evolución', 'Examen físico'])
    assert.ok(dx >= 0 && dx < evo && evo < exam, std)
  })
})
