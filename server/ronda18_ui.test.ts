import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { comboMatches, foldText } from '../src/lib/combo.js'
import { sidebarFor } from '../src/lib/nav.js'

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

describe('MN1 (ronda 18): menú lateral agrupado', () => {
  const groups = (who: Parameters<typeof sidebarFor>[0]) => {
    const out: Record<string, string[]> = {}
    for (const i of sidebarFor(who)) (out[i.group ?? ''] ??= []).push(i.label)
    return out
  }
  test('Inicio va suelto; todo lo demás está en un grupo', () => {
    for (const role of ['admin', 'doctor', 'nurse', 'reception', 'lab', 'imaging'] as const) {
      assert.deepEqual(groups({ role, kind: 'clinic', position: role === 'lab' ? 'microbiologist' : role === 'imaging' ? 'radiologist' : undefined })[''], ['Inicio'], role)
    }
  })
  test('médico de clínica: «Agenda y cobros» con Agenda y Cobrar; Recetas dentro de «Pacientes»; sin «Registros» (RU6)', () => {
    const g = groups({ role: 'doctor', kind: 'clinic' })
    assert.deepEqual(g['Agenda y cobros'], ['Agenda', 'Cobrar'])
    assert.deepEqual(g.Pacientes, ['Consulta externa', 'Observación', 'Hospitalizados', 'Biblioteca de pacientes', 'Crónicos y seguimientos', 'Recetas'])
    assert.equal(g.Registros, undefined)
  })
  test('consultorio, titular médica y administradora: la vista Médico tiene «Agenda» (sin cobro, CO1); la de Administración, «Agenda y cobros» y «Mi consultorio»', () => {
    const doc = groups({ role: 'doctor', kind: 'office', roles: ['doctor', 'admin'] })
    assert.deepEqual(doc.Agenda, ['Agenda'])
    assert.equal(doc['Agenda y cobros'], undefined)
    assert.ok(!Object.values(doc).flat().includes('Cobrar'))
    const adm = groups({ role: 'admin', kind: 'office', roles: ['doctor', 'admin'] })
    assert.deepEqual(adm['Agenda y cobros'], ['Agenda', 'Caja'])
    assert.ok(adm['Mi consultorio']?.includes('Reportes'))
    // A7: quien solo es médico conserva «Cobrar»
    assert.deepEqual(groups({ role: 'doctor', kind: 'office', roles: ['doctor'] })['Agenda y cobros'], ['Agenda', 'Cobrar'])
  })
  test('enfermería no tiene agenda ni cobro: sin ese grupo; «Registros» es un grupo como los demás', () => {
    const g = groups({ role: 'nurse', kind: 'clinic', position: 'nurse_lic' })
    assert.equal(g['Agenda y cobros'], undefined); assert.equal(g.Agenda, undefined)
    assert.deepEqual(g.Registros, ['Uso de medicamentos y material', 'Rol de turnos'])
    assert.ok(!readFileSync('src/app/AppShell.tsx', 'utf8').includes('STATIC_GROUPS'), 'ya no hay grupos fijos: todos se pliegan')
  })
})
