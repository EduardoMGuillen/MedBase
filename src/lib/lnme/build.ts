import { aliasesOf, doubtful, plainText, sameDrug, type MatchKind } from './match.js'

/**
 * ME5 (ronda 9): lector del Listado Nacional de Medicamentos Esenciales de Honduras 2023
 * (data/presentaciones_medicamentos_lnme.md). Cada fila numerada de tabla es un producto, bajo su grupo (`##`) y
 * subgrupo (`###`). Todo sale de las columnas del archivo: no se completa ni se corrige nada. Las líneas «Ver también»
 * son referencias entre filas y no se cargan. `npm run me5:build` guarda el resultado en src/lib/lnme/generated.ts.
 */
export const LNME_ORIGIN = 'LNME Honduras 2023 (AM 5230-2023)'
export const LNME_VERSION = '2023-AM5230'
export const LNME_EXPECTED_ROWS = 530
export const LNME_COLUMNS = ['#', 'Medicamento', 'Presentación habitual', 'Forma farmacéutica', 'Vía', 'Envase primario']

export type Certainty = 'confirmed' | 'unconfirmed' | 'none'

export interface LnmeItem {
  no: number
  /** Nombre sin anotaciones de formato ni símbolos. */
  name: string
  /** Lo que se precarga: la parte principal si el texto trae «(también …)» con el patrón exacto; si no, el texto completo. */
  presentation: string
  /** La presentación completa del archivo (sin negritas ni ✔️/⚠️). */
  presentationFull: string
  /** Las alternativas de «(también …)», sólo con el patrón exacto. */
  alternatives: string[]
  form: string
  /** La vía como la escribe el LNME («IV, IM»). */
  routes: string
  package: string
  group: string
  subgroup: string
  complementary: boolean
  /** Restricción de uso, tal cual («uso exclusivo oncología»). No bloquea. */
  restriction?: string
  /** Otra anotación del archivo que no es restricción ni va en el nombre. */
  note?: string
  certainty: Certainty
  aliases: string[]
  /** Clave sin mayúsculas, tildes ni espacios (la de clinic_drugs.norm_key). */
  key: string
  line: number
}

/** Un medicamento del catálogo base de Clinara que es el mismo de una fila del LNME (se calcula al generar). */
export interface LnmeBaseLink {
  /** `nombre|presentación` del catálogo base (la clave de drugKey). */
  base: string
  no: number
  kind: MatchKind | 'manual'
  /** Otro medicamento del catálogo base ya es esta misma fila: éste deja de ofrecerse en la búsqueda (no se borra). */
  foldedInto?: string
}

export interface LnmeBuild {
  version: string
  origin: string
  items: LnmeItem[]
  base: LnmeBaseLink[]
  /** Medicamentos del catálogo base parecidos a una fila, que no se unieron (duda). */
  baseDoubts: { base: string; no: number; lnme: string }[]
  problems: string[]
  warnings: string[]
}

const MARKS = /\s*(✔️|✔|⚠️|⚠)\s*/gu
const bold = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*()]+)\*/g, '$1')
const clean = (s: string) => bold(s).replace(MARKS, ' ').replace(/\s+([;,.)])/g, '$1').replace(/\(\s+/g, '(').replace(/\s+/g, ' ').trim()
const splitRow = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())

/** «1. ANESTÉSICOS» → «1. Anestésicos»; «33. RADIOFÁRMACOS (medicina nuclear)» → «33. Radiofármacos (medicina nuclear)». */
const sentence = (s: string) => {
  const t = s.toLocaleLowerCase('es')
  return t.replace(/^(\d[\d.–-]*\s+)?(\p{L})/u, (_m, n: string | undefined, c: string) => `${n ?? ''}${c.toLocaleUpperCase('es')}`)
}

/** Las anotaciones en cursiva «*(…)*» del nombre: lista complementaria, restricción u otra nota. */
function annotations(raw: string) {
  let complementary = false
  const restriction: string[] = []
  const note: string[] = []
  const name = raw.replace(/\*\(([^)]*)\)\*/g, (_m, inner: string) => {
    const parts = inner.split(',').map((x) => x.trim()).filter(Boolean)
    for (const p of parts) {
      if (/^lista (complementaria|compl\.?)$/i.test(p) || /^todas lista complementaria$/i.test(p)) complementary = true
      else if (/^(uso|solo|sólo)\b/i.test(p)) restriction.push(p)
      else note.push(p)
    }
    return ' '
  })
  return { name, complementary, restriction, note }
}

/** «Frasco 120 ml (120 mg/5 ml) (también 60 ml)»: principal «Frasco 120 ml (120 mg/5 ml)», alternativas [«60 ml»]. */
export function splitPresentation(full: string): { main: string; alternatives: string[] } {
  const m = /^(.+?)\s*\(también ([^()]+)\)$/.exec(full)
  if (!m || /también/i.test(m[1])) return { main: full, alternatives: [] }
  return { main: m[1].trim(), alternatives: m[2].split(/\s+y\s+/).map((x) => x.trim()).filter(Boolean) }
}

export const keyOf = (name: string, presentation = '') => `${plainText(name)}|${plainText(presentation)}`

export function parseLnme(md: string): { items: LnmeItem[]; problems: string[]; warnings: string[] } {
  const lines = md.split(/\r?\n/)
  const items: LnmeItem[] = []
  const problems: string[] = []
  const warnings: string[] = []
  let group = ''
  let subgroup = ''
  let groupRestriction = ''
  let subComplementary = false
  let header: string[] | null = null
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    const h = /^(#{2,3})\s+(.+)$/.exec(l)
    if (h) {
      const a = annotations(h[2])
      const title = clean(a.name)
      if (h[1] === '##') { group = sentence(title); subgroup = ''; groupRestriction = ''; subComplementary = false } else { subgroup = title; subComplementary = a.complementary }
      header = null
      continue
    }
    // Nota de todo el grupo justo debajo del título: «*(Todos de uso en 2.º nivel – INST salvo indicación.)*»
    const gn = /^\*\((.+)\)\*\s*$/.exec(l.trim())
    if (gn && !subgroup && group) { groupRestriction = gn[1].trim(); continue }
    if (!l.startsWith('|')) { header = null; continue }
    const cells = splitRow(l)
    if (!header) {
      header = cells.map(clean)
      // «Vacuna» en lugar de «Medicamento» en la tabla de vacunas (19.3): misma columna
      const same = header.length === LNME_COLUMNS.length && header.every((c, j) => c === LNME_COLUMNS[j] || (j === 1 && c === 'Vacuna'))
      if (!same) problems.push(`línea ${i + 1}: encabezado distinto (${header.join(' | ')})`)
      else if (header[1] !== LNME_COLUMNS[1]) warnings.push(`línea ${i + 1}: la columna «Medicamento» se llama «${header[1]}» (se lee igual)`)
      continue
    }
    if (cells.every((c) => /^-+$/.test(c))) continue
    if (cells.length !== LNME_COLUMNS.length) { problems.push(`línea ${i + 1}: ${cells.length} columnas en lugar de ${LNME_COLUMNS.length}`); continue }
    const no = Number(cells[0])
    if (!Number.isInteger(no) || no <= 0) { problems.push(`línea ${i + 1}: número de fila inválido «${cells[0]}»`); continue }
    const a = annotations(cells[1])
    // «Rifampicina (mismo producto que #133; …)»: es una nota del archivo, no parte del nombre
    let name = clean(a.name).replace(/\s*\(([^()]*#\d+[^()]*)\)/g, (_m, inner: string) => { a.note.push(inner.trim()); return '' }).trim()
    name = name.replace(/\s+/g, ' ')
    const presRaw = cells[2]
    const presentationFull = clean(presRaw)
    const certainty: Certainty = /⚠/u.test(presRaw) ? 'unconfirmed' : /✔/u.test(presRaw) ? 'confirmed' : 'none'
    const { main, alternatives } = splitPresentation(presentationFull)
    const form = clean(cells[3])
    const routes = clean(cells[4])
    const pkg = clean(cells[5])
    if (!presentationFull) warnings.push(`#${no} ${name}: presentación vacía`)
    if (!name || name.length < 3 || /[+(/,–-]$/.test(name) || (name.match(/\(/g)?.length ?? 0) !== (name.match(/\)/g)?.length ?? 0)) warnings.push(`#${no} «${name}»: nombre posiblemente cortado`)
    if (/[*✔⚠]/u.test(`${name} ${main}`)) problems.push(`#${no}: quedó una marca de formato en el nombre o la presentación`)
    if (!routes || routes === '—') warnings.push(`#${no} ${name}: sin vía («${routes || 'vacía'}»)`)
    const restriction = [...a.restriction, ...(a.restriction.length || !groupRestriction ? [] : [groupRestriction])].join('; ') || undefined
    items.push({
      no, name, presentation: main, presentationFull, alternatives, form, routes, package: pkg, group, subgroup,
      complementary: a.complementary || subComplementary, restriction, note: a.note.join('; ') || undefined, certainty,
      aliases: aliasesOf(name), key: keyOf(name, main), line: i + 1,
    })
  }
  return { items, problems, warnings }
}

/** Arma el resultado completo: valida el archivo y empareja con el catálogo base (los pares seguros escritos a mano incluidos). */
export function buildLnme(md: string, base: { name: string; presentation: string }[], manual: Record<string, number>): LnmeBuild {
  const { items, problems, warnings } = parseLnme(md)
  const nos = new Map<number, number>()
  for (const it of items) nos.set(it.no, (nos.get(it.no) ?? 0) + 1)
  for (const [no, n] of nos) if (n > 1) problems.push(`#${no} aparece ${n} veces`)
  if (nos.size !== LNME_EXPECTED_ROWS) problems.push(`se esperaban ${LNME_EXPECTED_ROWS} filas únicas y hay ${nos.size}`)
  // Duplicados exactos (todas las columnas iguales salvo el número) y claves repetidas (mismo nombre y presentación)
  const seen = new Map<string, number>()
  for (const it of items) {
    const all = [it.name, it.presentationFull, it.form, it.routes, it.package].map(plainText).join('|')
    if (seen.has(all)) warnings.push(`#${it.no} es un duplicado exacto de #${seen.get(all)}`)
    else seen.set(all, it.no)
  }
  const keys = new Map<string, number>()
  for (const it of items) {
    const prev = keys.get(it.key)
    if (prev !== undefined) { warnings.push(`#${it.no} tiene el mismo nombre y presentación que #${prev}: su clave lleva el número`); it.key = `${it.key}|lnme:${it.no}` }
    keys.set(it.key, it.no)
  }
  // Catálogo base: primero lo exacto, después los sinónimos, después los pares seguros escritos a mano
  const links: LnmeBaseLink[] = []
  const baseDoubts: LnmeBuild['baseDoubts'] = []
  const linkOf = new Map<string, LnmeBaseLink>()
  const primary = new Map<number, string>()
  const bk = (d: { name: string; presentation: string }) => `${d.name}|${d.presentation}`
  for (const pass of ['exact', 'synonym'] as const) {
    for (const d of base) {
      if (linkOf.has(bk(d))) continue
      const it = items.find((x) => sameDrug(x, d) === pass || (pass === 'synonym' && sameDrug(x, d) === 'exact'))
      if (!it) continue
      const link: LnmeBaseLink = { base: bk(d), no: it.no, kind: pass, ...(primary.has(it.no) ? { foldedInto: primary.get(it.no) } : {}) }
      if (!primary.has(it.no)) primary.set(it.no, bk(d))
      linkOf.set(bk(d), link)
      links.push(link)
    }
  }
  for (const [b, no] of Object.entries(manual)) {
    if (linkOf.has(b)) { warnings.push(`par manual ${b} → #${no}: ya se emparejó solo`); continue }
    if (!base.some((d) => bk(d) === b)) { problems.push(`par manual ${b}: no está en el catálogo base`); continue }
    if (!items.some((x) => x.no === no)) { problems.push(`par manual ${b}: no hay fila #${no}`); continue }
    const link: LnmeBaseLink = { base: b, no, kind: 'manual', ...(primary.has(no) ? { foldedInto: primary.get(no) } : {}) }
    if (!primary.has(no)) primary.set(no, b)
    linkOf.set(b, link)
    links.push(link)
  }
  for (const d of base) {
    if (linkOf.has(bk(d))) continue
    for (const it of items) if (!primary.has(it.no) && doubtful(it, d)) baseDoubts.push({ base: bk(d), no: it.no, lnme: `${it.name} | ${it.presentation}` })
  }
  return { version: LNME_VERSION, origin: LNME_ORIGIN, items, base: links, baseDoubts, problems, warnings }
}
