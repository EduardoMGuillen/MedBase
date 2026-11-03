// La función de Vercel corre el servidor archivo por archivo (ESM de Node, sin empaquetar): todo import relativo que
// alcance el servidor, también en src/, debe llevar la extensión «.js». Si falta, la API no carga en producción.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'

const seen = new Set()
const bad = []
const re = /(?:^|\n)\s*(?:import|export)\s+(type\s+)?[^'"]*?from\s+['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]/g
const resolve = (from, spec) => {
  const p = normalize(join(dirname(from), spec)).replace(/\.js$/, '')
  for (const c of [`${p}.ts`, `${p}.tsx`, join(p, 'index.ts')]) if (existsSync(c)) return c
}
const walk = (f) => {
  if (seen.has(f)) return
  seen.add(f)
  for (const m of readFileSync(f, 'utf8').matchAll(re)) {
    if (m[1]) continue
    const spec = m[2] ?? m[3]
    if (!spec.endsWith('.js')) bad.push(`${f}: '${spec}'`)
    const r = resolve(f, spec)
    if (r) walk(r)
  }
}
walk('api/index.ts')
if (bad.length) {
  console.error(`Imports sin «.js» alcanzables desde el servidor (la API no cargaría en Vercel):\n  ${bad.join('\n  ')}`)
  process.exit(1)
}
console.log(`check-esm: ${seen.size} archivos del servidor, imports con .js`)
