/**
 * UM1 (ronda 8): lee data/valores_referencia_laboratorio.md y genera src/lib/labRef/generated.ts (valores de referencia,
 * umbrales y fuentes). Correr con `npm run um1:build` cada vez que cambie el .md. Falla si alguna fila queda sin regla o
 * si una regla apunta a un examen que no está en el catálogo.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { buildReference } from '../src/lib/labRef/build.js'
import { LAB_CATALOG } from '../src/lib/labCatalog.js'
import { EXAMS } from '../src/lib/exams.js'

const md = readFileSync('data/valores_referencia_laboratorio.md', 'utf8')
const out = buildReference(md)
const catalog = new Set([...LAB_CATALOG.map((e) => e.name), ...EXAMS.filter((e) => e.group === 'lab').map((e) => e.name)])
const missingExams = [...new Set(out.values.map((v) => v.exam))].filter((e) => !catalog.has(e))
const problems = [...out.unmatched.map((r) => `fila sin regla: ${r}`), ...out.orphanRules.map((r) => `regla sin fila: ${r}`), ...missingExams.map((e) => `examen que no está en el catálogo: ${e}`)]
if (problems.length) { console.error(problems.join('\n')); process.exit(1) }
writeFileSync('src/lib/labRef/generated.ts', `/* Generado por \`npm run um1:build\` desde data/valores_referencia_laboratorio.md. No editar a mano. */\nimport type { BuildResult } from './build.js'\n\nexport const GENERATED: BuildResult = ${JSON.stringify(out)}\n`)
const exams = new Set(out.values.map((v) => v.exam))
console.log(`${out.values.length} valores en ${exams.size} exámenes; ${out.thresholds.length} umbrales; ${out.sources.length} fuentes; ${out.skipped.length} filas no cargadas`)
console.log('Exámenes del catálogo sin valor:', [...catalog].filter((e) => !exams.has(e)).join(' | '))
