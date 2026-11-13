import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { comboMatches, foldText } from '../src/lib/combo.js'

// Ronda 18: reglas de la interfaz que se comprueban leyendo el código del cliente
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f)
  return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : []
})
/** El código sin comentarios (para no contar el `<select>` que se nombra en una explicación). */
const code = (p: string) => readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('LD1 (ronda 18): una sola lista desplegable', () => {
  test('no queda ningún <select> nativo ni <datalist> en la app: todas las listas son el componente Combo', () => {
    const bad = files('src').filter((p) => /<select\b|<datalist\b|<optgroup\b|\blist=["{]\s*["'`]/.test(code(p)))
    assert.deepEqual(bad, [], 'Usa <Combo> (src/components/Combo.tsx) en vez de <select> o <datalist>')
  })

  test('filtra sin tildes ni mayúsculas, por cualquier parte, y primero lo que empieza con lo escrito', () => {
    const opts = ['Valoración preanestésica', 'Raquídea', 'Anestesia general', 'Local'].map((x) => ({ value: x, label: x }))
    assert.deepEqual(comboMatches(opts, 'anest').map((o) => o.label), ['Anestesia general', 'Valoración preanestésica'])
    assert.deepEqual(comboMatches(opts, 'RAQ').map((o) => o.label), ['Raquídea'])
    assert.deepEqual(comboMatches(opts, 'raquidea').map((o) => o.label), ['Raquídea'])
    assert.deepEqual(comboMatches(opts, 'xyz'), [])
    assert.equal(comboMatches(opts, '  ').length, 4, 'sin texto, la lista completa')
    assert.equal(foldText('Órdenes Ñ').length, 'Órdenes Ñ'.length, 'los índices coinciden con el texto original (para resaltar)')
  })

  test('el componente declara el patrón combobox de WAI-ARIA', () => {
    const src = readFileSync('src/components/Combo.tsx', 'utf8')
    for (const attr of ['role="combobox"', 'aria-expanded', 'aria-autocomplete="list"', 'aria-activedescendant', 'role="listbox"', 'role="option"']) assert.ok(src.includes(attr), attr)
    assert.ok(src.includes('Elige una opción de la lista') && src.includes('Ninguna opción coincide') && src.includes('Usar «'))
  })
})
