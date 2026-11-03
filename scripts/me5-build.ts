/**
 * ME5 (ronda 9): lee data/presentaciones_medicamentos_lnme.md (LNME Honduras 2023) y genera src/lib/lnme/generated.ts.
 * Correr con `npm run me5:build` cada vez que cambie el .md. Falla si no encuentra exactamente 530 números únicos, si
 * alguna fila no tiene 6 columnas o si queda una marca de formato en un nombre o presentación. Reporta las presentaciones
 * vacías, los nombres que parecen cortados, los duplicados exactos y cómo se emparejó con el catálogo base de Clinara.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { buildLnme } from '../src/lib/lnme/build.js'
import { DRUGS } from '../src/lib/catalogs.js'

/**
 * Pares seguros del catálogo base que el emparejamiento automático no ve porque el texto de la presentación cambia
 * (mismo principio activo, misma concentración y mismo envase). Lo que no esté aquí y no empareje solo, no se une.
 */
export const MANUAL_BASE: Record<string, number> = {
  'Acetaminofén|Frasco 1 g/100 ml': 27, // «Acetaminofén IV | Frasco/vial 1 g/100 ml»
  'Insulina cristalina|Vial 100 UI/ml': 433, // «Insulina cristalina (regular) | Vial 10 ml (100 UI/ml = 1,000 UI)»
  'Salbutamol|Inhalador 100 mcg/dosis': 524, // «Salbutamol inhalador | Inhalador 200 dosis (100 µg/dosis)»
  'Enoxaparina|Jeringa 40 mg/0,4 ml': 302, // «Enoxaparina | Jeringa precargada 40 mg/0.4 ml»
  'Nitrofurantoína|Cápsula 100 mg': 125, // «Nitrofurantoína | Cápsula/tableta 100 mg»
  // ME6 (ronda 10): Emil los da como el mismo medicamento (VALIDAR: Emil)
  'Ondansetrón|Ampolla 8 mg/4 ml': 403, // «Ondansetrón | Ampolla 4 mg/2 ml y 8 mg/4 ml» (el listado junta las dos)
  'Tramadol|Ampolla 50 mg/ml': 32, // «Tramadol | Ampolla 100 mg/2 ml» (misma concentración: 50 mg/ml)
}

const md = readFileSync('data/presentaciones_medicamentos_lnme.md', 'utf8')
const out = buildLnme(md, DRUGS, MANUAL_BASE)
if (out.problems.length) { console.error(`El archivo no pasa la revisión:\n- ${out.problems.join('\n- ')}`); process.exit(1) }
const byNo = new Map(out.items.map((i) => [i.no, i]))
const baseItems = out.base.map((l) => ({ ...l, item: byNo.get(l.no)! }))
writeFileSync('src/lib/lnme/generated.ts', `/* Generado por \`npm run me5:build\` desde data/presentaciones_medicamentos_lnme.md. No editar a mano. */
import type { LnmeBaseLink, LnmeItem } from './build.js'

export const LNME_META = ${JSON.stringify({ version: out.version, origin: out.origin, rows: out.items.length })}

/** Medicamentos del catálogo base de Clinara que son una fila del LNME (lo único que necesita el navegador). */
export const LNME_BASE: (LnmeBaseLink & { item: LnmeItem })[] = ${JSON.stringify(baseItems)}

/** Las ${out.items.length} filas del LNME (las carga el servidor en la base de cada clínica). */
export const LNME_ITEMS: LnmeItem[] = ${JSON.stringify(out.items)}

/** Parecidos del catálogo base que no se unieron (duda). */
export const LNME_BASE_DOUBTS = ${JSON.stringify(out.baseDoubts)}
`)
const count = (f: (i: (typeof out.items)[number]) => boolean) => out.items.filter(f).length
console.log(`${out.items.length} filas únicas (${new Set(out.items.map((i) => i.group)).size} grupos); lista complementaria ${count((i) => i.complementary)}; ⚠️ ${count((i) => i.certainty === 'unconfirmed')}; ✔️ ${count((i) => i.certainty === 'confirmed')}; con «también» dividido ${count((i) => i.alternatives.length > 0)}; con restricción ${count((i) => !!i.restriction)}; con nota ${count((i) => !!i.note)}`)
console.log(`Avisos (${out.warnings.length}):${out.warnings.map((w) => `\n- ${w}`).join('')}`)
console.log(`Catálogo base emparejado (${out.base.length}):${out.base.map((l) => `\n- ${l.base} → #${l.no} ${byNo.get(l.no)!.name} | ${byNo.get(l.no)!.presentation} (${l.kind}${l.foldedInto ? `; se ofrece como ${l.foldedInto}` : ''})`).join('')}`)
console.log(`Catálogo base en duda, no unido (${out.baseDoubts.length}):${out.baseDoubts.map((d) => `\n- ${d.base} ≈ #${d.no} ${d.lnme}`).join('')}`)
