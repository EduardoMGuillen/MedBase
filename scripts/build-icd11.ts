/**
 * Genera server/data/icd11-mms-es.json a partir del archivo oficial de la OMS "SimpleTabulation-ICD-11-MMS-es"
 * (https://icdcdn.who.int/static/releasefiles/<edición>/SimpleTabulation-ICD-11-MMS-es.zip).
 *
 * Sólo se toman las categorías (las que tienen código) con su código, su título en español, su URI (de la Fundación o, en
 * las residuales, de la linealización) y su capítulo.
 * Los códigos y los títulos se copian tal cual (licencia CC BY-ND 3.0 IGO: no se adaptan); únicamente se quitan
 * los guiones del inicio, que en el archivo indican el nivel de la jerarquía.
 *
 * Uso: npx tsx scripts/build-icd11.ts <ruta del .txt> <edición, p. ej. 2026-01>
 */
import { readFileSync, writeFileSync } from 'node:fs'

const [file, release] = process.argv.slice(2)
if (!file || !release) { console.error('Uso: npx tsx scripts/build-icd11.ts <SimpleTabulation-ICD-11-MMS-es.txt> <edición>'); process.exit(1) }
const lines = readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/)
const head = lines[0].split('\t')
const col = (name: string) => { const i = head.indexOf(name); if (i < 0) throw new Error(`Falta la columna ${name}`); return i }
const [cUri, cLin, cCode, cTitle, cKind, cChapter, cLeaf] = ['Foundation URI', 'Linearization URI', 'Code', 'Title', 'ClassKind', 'ChapterNo', 'isLeaf'].map(col)
const unquote = (s = '') => (s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1).replace(/""/g, '"') : s)
const rows: [string, string, string, string, number][] = []
for (const line of lines.slice(1)) {
  if (!line.trim()) continue
  const f = line.split('\t')
  if (f[cKind] !== 'category' || !f[cCode]) continue
  rows.push([f[cCode], unquote(f[cTitle]).replace(/^(-\s*)+/, '').trim(), (f[cUri] || f[cLin]).replace('http://id.who.int/icd/', ''), f[cChapter], f[cLeaf] === 'True' ? 1 : 0])
}
writeFileSync('server/data/icd11-mms-es.json', JSON.stringify({
  source: `OMS, CIE-11 para estadísticas de mortalidad y morbilidad (MMS), edición ${release}, en español. Licencia CC BY-ND 3.0 IGO. https://icd.who.int`,
  release, fields: ['code', 'title', 'uri (sin http://id.who.int/icd/)', 'chapter', 'isLeaf'], rows,
}))
console.log(`${rows.length} categorías de la edición ${release}`)
