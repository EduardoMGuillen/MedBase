/**
 * CA1 (ronda 7): compara una lista de exámenes (el texto del formulario, un examen por línea o separados por «;») con el
 * catálogo que se carga (src/lib/labCatalog.ts): cada línea debe estar en el Anexo A o en la tabla de equivalencias.
 * Uso: npx tsx scripts/compare-lab-catalog.ts docs/ronda7/anexo-a.txt   (sale con 1 si hay faltantes o duplicados)
 */
import { readFileSync } from 'node:fs'
import { looseKey } from '../server/catalogLoader.js'
import { LAB_CATALOG, LAB_EQUIVALENCES } from '../src/lib/labCatalog.js'

const file = process.argv[2]
if (!file) { console.error('Uso: npx tsx scripts/compare-lab-catalog.ts <archivo.txt>'); process.exit(2) }
// Un «;» dentro de paréntesis no separa («Otros líquidos (especificar; incluye solo citoquímica)»)
const split = (line: string) => {
  const out: string[] = []
  let depth = 0, cur = ''
  for (const ch of line) {
    if (ch === '(') depth++
    if (ch === ')') depth = Math.max(0, depth - 1)
    if (ch === ';' && !depth) { out.push(cur); cur = '' } else cur += ch
  }
  return [...out, cur]
}
// El punto final de cada grupo no es parte del nombre, salvo en abreviaturas que lo llevan («R.P.R.», «ANA 18 max.»)
const KEEP_DOT = /(\b[A-Z]\.){2,}$|max\.$|a\.m\.$|p\.m\.$|Ag\.$/
const names = readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'))
  .flatMap(split).map((s) => s.trim()).filter(Boolean).map((s) => (s.endsWith('.') && !KEEP_DOT.test(s) ? s.slice(0, -1).trim() : s))
const known = new Set([...LAB_CATALOG.map((e) => looseKey(e.name)), ...Object.keys(LAB_EQUIVALENCES).map(looseKey)])
const missing = names.filter((n) => !known.has(looseKey(n)))
const catalogKeys = LAB_CATALOG.map((e) => looseKey(e.name))
const dups = catalogKeys.filter((k, i) => catalogKeys.indexOf(k) !== i)
const listed = new Set(names.map(looseKey))
const extra = LAB_CATALOG.filter((e) => !listed.has(looseKey(e.name))).map((e) => e.name)
console.log(`Líneas leídas: ${names.length}. Exámenes nuevos en el catálogo: ${LAB_CATALOG.length}. Equivalencias: ${Object.keys(LAB_EQUIVALENCES).length}.`)
console.log(`Sin cubrir: ${missing.length}${missing.length ? `\n  - ${missing.join('\n  - ')}` : ''}`)
console.log(`Nombres duplicados en el catálogo: ${dups.length}${dups.length ? `\n  - ${dups.join('\n  - ')}` : ''}`)
console.log(`En el catálogo pero no en la lista: ${extra.length}${extra.length ? `\n  - ${extra.join('\n  - ')}` : ''}`)
process.exit(missing.length || dups.length ? 1 : 0)
