/**
 * RU1 (ronda 14) y RU5 (ronda 15): lee data/listado_material_medico_quirurgico.md (v2: la tabla con «Registro» y «Origen» y el
 * Anexo de los sets iniciales; no las secciones «Cambios respecto…») y genera src/lib/supplyMd/generated.ts, que carga el
 * servidor en cada clínica y consultorio (server/supplies.ts). Correr con `npm run ru1:build` cada vez que cambie el .md.
 * Avisa de las filas que no pudo leer.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { parseSupplyMd } from '../src/lib/supplies.js'

const SOURCE = 'data/listado_material_medico_quirurgico.md'
const out = parseSupplyMd(readFileSync(SOURCE, 'utf8'))
writeFileSync('src/lib/supplyMd/generated.ts', `/* Generado por \`npm run ru1:build\` desde ${SOURCE}. No editar a mano. */\nimport type { SupplyMdResult } from '../supplies.js'\n\nexport const SUPPLY_SOURCE = '${SOURCE}'\nexport const SUPPLY_MD: SupplyMdResult = ${JSON.stringify(out, null, 0).replace(/\},\{/g, '},\n  {')}\n`)
const cats = new Set(out.rows.map((r) => r.category))
const r14 = out.rows.filter((r) => r.origin.startsWith('R14')).length
console.log(`${out.rows.length} líneas en ${cats.size} categorías (${r14} de la ronda 14, ${out.rows.length - r14} nuevas); ${out.rows.filter((r) => r.onList).length} en la lista de turno inicial; `
  + `${out.sets.length} sets (${out.sets.map((s) => `${s.name}: ${s.items.length}`).join(', ')}); ${out.skipped.length} filas no leídas`)
for (const s of out.skipped) console.log(`  línea ${s.line}: ${s.reason} · ${s.text}`)
