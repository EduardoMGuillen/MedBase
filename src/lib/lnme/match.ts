/**
 * ME5 (ronda 9): cómo se empareja una fila del LNME con un medicamento que ya está en el vademécum (el catálogo base de
 * Clinara o lo que agregó la clínica). Sin tildes ni mayúsculas, nombre + presentación, con una tabla corta de sinónimos
 * de uso en Honduras. Si hay duda (mismo principio activo y una concentración en común, pero no la misma presentación),
 * no se une: se reporta.
 */

/**
 * Sinónimos seguros (mismo principio activo, distinto nombre). El primero de cada grupo es el nombre con que se compara;
 * los demás se guardan como alias de búsqueda. Sólo nombres de los que no hay duda.
 */
export const SYNONYMS: string[][] = [
  ['Acetaminofén', 'Paracetamol'],
  ['Adrenalina', 'Epinefrina'],
  ['Noradrenalina', 'Norepinefrina'],
  ['Ciprofloxacina', 'Ciprofloxacino'],
  ['Levofloxacina', 'Levofloxacino'],
  ['Moxifloxacina', 'Moxifloxacino'],
  ['Salbutamol', 'Albuterol'],
  ['Amlodipino', 'Amlodipina'],
  ['Ácido acetilsalicílico', 'Aspirina'],
  ['Metamizol', 'Dipirona'],
  ['Meperidina', 'Petidina'],
  ['Succinilcolina', 'Suxametonio'],
  ['Fitomenadiona', 'Vitamina K1'],
  ['Hioscina butilbromuro', 'Butilbromuro de hioscina', 'Butilhioscina'],
  ['TMP/SMX', 'Trimetoprim + sulfametoxazol', 'Trimetoprima + sulfametoxazol', 'Cotrimoxazol'],
  ['Hartmann', 'Ringer lactato', 'Lactato de Ringer', 'Solución de Hartmann'],
  ['Cloruro de sodio', 'Solución salina'],
]

/** Sin tildes ni mayúsculas, con los espacios de más quitados. */
export const plainText = (s = '') => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
const word = (s: string) => new RegExp(`(^|[^a-z0-9])${escape(s)}(?=$|[^a-z0-9])`, 'g')
// De la variante más larga a la más corta, para que «lactato de ringer» gane sobre «ringer»
const SYN_RULES = SYNONYMS.flatMap((g) => g.slice(1).map((v) => ({ from: plainText(v), to: plainText(g[0]) }))).sort((a, b) => b.from.length - a.from.length)

/** Números escritos a la hondureña o a la inglesa: «0,4» = «0.4», «1,000» = «1000»; µg = mcg = ug; «0.9 %» = «0.9%». */
const numbers = (s: string) => s
  .replace(/(\d),(\d{3})(?!\d)/g, '$1$2').replace(/(\d),(\d{3})(?!\d)/g, '$1$2')
  .replace(/(\d),(\d)/g, '$1.$2')
  .replace(/\b(mcg|µg|μg)\b|µg|μg/g, 'ug')
  .replace(/(\d)\s+%/g, '$1%')
  .replace(/(\d)\s*(mg|g|ug|ui|ml|l|meq|mmol)\b/g, '$1 $2')

const noParens = (s: string) => s.replace(/\([^()]*\)/g, ' ').replace(/\s+/g, ' ').trim()

/** Nombre para comparar: sin tildes, «ác.» = «ácido», «/» y «+» iguales, sin lo que va entre paréntesis, con sinónimos. */
export function canonName(name: string): string {
  let s = numbers(plainText(name)).replace(/\bac\.\s*/g, 'acido ').replace(/\s*[/+]\s*/g, ' + ')
  s = noParens(s)
  for (const r of SYN_RULES) s = s.replace(word(r.from), `$1${r.to}`)
  return s.replace(/\s+/g, ' ').trim()
}

// Palabras de forma o vía que el LNME agrega al nombre («Acetaminofén IV», «Loratadina jarabe»)
const QUALIFIERS = /\s+(iv|im|inyectable|suspension|jarabe|gotas|tabletas?|capsulas?|inhalador|solucion para nebulizar|solucion|crema|unguento|pediatrico|pediatrica|ped\.?|lp)$/
/** El principio activo sin las palabras de forma: para detectar dudas, no para unir. */
export function coreName(name: string): string {
  let s = canonName(name).replace(/\s*\d[\d.]*\s*%/g, '')
  for (let i = 0; i < 3; i++) s = s.replace(QUALIFIERS, '')
  return s.trim()
}

/** Presentación para comparar. */
export const presKey = (p: string) => numbers(plainText(p)).replace(/\s*[/]\s*/g, '/').replace(/\s+/g, ' ').trim()

/** Concentraciones que trae el texto («500 mg», «1 g/100 ml» → 1 g, 100 ml). */
export const strengths = (s: string) => new Set([...presKey(s).matchAll(/(\d+(?:\.\d+)?) (mg|g|ug|ui|meq|mmol)\b|(\d+(?:\.\d+)?)%/g)].map((m) => m[0]))

export type MatchKind = 'exact' | 'synonym'

/** ¿Es el mismo medicamento? `exact`: mismo nombre y presentación; `synonym`: lo mismo con otro nombre (tabla de sinónimos). */
export function sameDrug(a: { name: string; presentation: string }, b: { name: string; presentation: string }): MatchKind | null {
  const pa = presKey(a.presentation)
  const pb = presKey(b.presentation)
  const samePres = pa === pb || noParens(pa) === noParens(pb)
  if (!samePres) return null
  if (plainText(a.name) === plainText(b.name)) return 'exact'
  if (canonName(a.name) === canonName(b.name)) return 'synonym'
  // «Omeprazol IV | Vial 40 mg» = «Omeprazol | Vial 40 mg»: mismo principio activo y misma presentación
  if (coreName(a.name) && coreName(a.name) === coreName(b.name)) return 'synonym'
  return null
}

/** Duda: mismo principio activo y alguna concentración en común, pero no la misma presentación. No se une. */
export function doubtful(a: { name: string; presentation: string }, b: { name: string; presentation: string }): boolean {
  if (!coreName(a.name) || coreName(a.name) !== coreName(b.name)) return false
  const sa = strengths(`${a.name} ${a.presentation}`)
  return [...strengths(`${b.name} ${b.presentation}`)].some((x) => sa.has(x))
}

/** Alias de búsqueda: los otros nombres del grupo de sinónimos que no estén ya en el nombre («Acetaminofén IV» → Paracetamol). */
export function aliasesOf(name: string): string[] {
  const c = canonName(name)
  const own = plainText(name)
  const out: string[] = []
  for (const g of SYNONYMS) {
    if (!word(plainText(g[0])).test(c)) continue
    for (const v of g) if (!word(plainText(v)).test(own) && !out.includes(v)) out.push(v)
  }
  return out
}
