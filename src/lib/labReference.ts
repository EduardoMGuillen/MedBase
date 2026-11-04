import { GENERATED } from './labRef/generated.js'
import type { RefValue, Sex } from './labRef/build.js'

/**
 * UM1 (ronda 8): valores de referencia de los exámenes de laboratorio. Salen de data/valores_referencia_laboratorio.md por
 * un script (`npm run um1:build` → src/lib/labRef/generated.ts): los números no se copian a mano. Cada clínica los tiene en
 * su base (tabla exam_ref_values, origen «Catálogo Clinara 2026-11-02») y los puede editar; aquí se arman los analitos a
 * partir de esas filas (o, mientras no llegan del servidor, de las del archivo). VALIDAR: Emil.
 *
 * Referencia general; el rango oficial es el del laboratorio que emite el resultado.
 */

/** Un límite: [mínimo, máximo]; `undefined` es sin límite de ese lado. */
type Pair = [number | undefined, number | undefined]

export interface RefAnalyte {
  name: string
  unit: string
  low?: number
  high?: number
  /** «<200»: 200 ya queda fuera (alto). Sin esto, el máximo es inclusivo («≤0.8»). */
  highOpen?: boolean
  /** Por sexo, cuando el documento los separa. */
  f?: Pair
  m?: Pair
  /** Resultado esperado o texto de referencia (categorías, por edad o fase): se muestra, no marca Alto/Bajo por sí solo. */
  text?: string
  sources?: string[]
  warn?: boolean
  /** «catalog» (del .md), «initial» (valor inicial de Clinara, sin fuente) o «clinic» (definido por la clínica). */
  origin?: RefOrigin
}

export type RefOrigin = 'catalog' | 'initial' | 'clinic'

export interface LabReference {
  /** Fuentes (códigos) o «‡»; «clinic» si lo definió la clínica; «initial» si es el valor inicial de Clinara. */
  src: string[]
  analytes?: RefAnalyte[]
  /** Resultado esperado del examen (cualitativo, título) o interpretación. */
  text?: string
  /** Notas del archivo (⚠️ y demás). */
  note?: string
  warn?: boolean
}

/** Una fila de valor de referencia (del archivo o de la base de la clínica). */
export interface RefRow {
  exam: string
  analyte?: string
  unit: string
  sex: Sex
  low?: number
  high?: number
  highOpen?: boolean
  expected?: string
  note?: string
  sources: string[]
  warn?: boolean
  origin?: RefOrigin
}

const uniq = <T,>(a: T[]) => [...new Set(a)]

/** Arma el examen (analitos por sexo, resultado esperado, notas y fuentes) a partir de sus filas. */
export function referenceFromRows(rows: RefRow[]): LabReference | undefined {
  if (!rows.length) return undefined
  const analytes: RefAnalyte[] = []
  for (const r of rows.filter((x) => x.analyte)) {
    let a = analytes.find((x) => x.name === r.analyte)
    if (!a) { a = { name: r.analyte!, unit: r.unit, sources: [], origin: r.origin }; analytes.push(a) }
    if (r.sex === 'F') a.f = [r.low, r.high]
    else if (r.sex === 'M') a.m = [r.low, r.high]
    else { a.low = r.low; a.high = r.high }
    if (r.highOpen) a.highOpen = true
    const text = [r.expected, r.note].filter(Boolean).join(' · ')
    if (text && !(a.text ?? '').includes(text)) a.text = [a.text, text].filter(Boolean).join(' · ')
    a.sources = uniq([...(a.sources ?? []), ...r.sources])
    if (r.warn) a.warn = true
    if (r.origin === 'clinic') a.origin = 'clinic'
  }
  // Ronda 12 (LB2): los analitos en el orden del documento (color, aspecto, densidad…); los de la clínica, al final
  const order = (a: RefAnalyte) => FILE_ORDER.get(`${fold(rows[0].exam)}|${a.name}`) ?? Number.MAX_SAFE_INTEGER
  analytes.sort((a, b) => order(a) - order(b))
  const examRows = rows.filter((x) => !x.analyte)
  const notes = uniq(rows.filter((x) => !x.analyte).map((x) => x.note).filter(Boolean) as string[])
  return {
    src: uniq(rows.flatMap((r) => (r.origin === 'clinic' ? ['clinic'] : r.origin === 'initial' ? ['initial'] : r.sources))),
    analytes: analytes.length ? analytes : undefined,
    text: examRows.map((x) => x.expected).filter(Boolean).join(' · ') || undefined,
    note: notes.join(' · ') || undefined,
    warn: rows.some((r) => r.warn) || undefined,
  }
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Filas del archivo por examen (clave sin mayúsculas ni tildes). */
const FILE_ROWS = new Map<string, RefRow[]>()
const FILE_ORDER = new Map<string, number>()
for (const v of GENERATED.values as RefValue[]) {
  const k = fold(v.exam)
  if (v.analyte && !FILE_ORDER.has(`${k}|${v.analyte}`)) FILE_ORDER.set(`${k}|${v.analyte}`, FILE_ORDER.size)
  FILE_ROWS.set(k, [...(FILE_ROWS.get(k) ?? []), { ...v, origin: 'catalog' }])
}
export const fileRowsOf = (exam: string) => FILE_ROWS.get(fold(exam)) ?? []

/** Los valores de referencia de un examen según el archivo (la base de la clínica manda cuando llega del servidor). */
export const referenceOf = (name: string) => referenceFromRows(fileRowsOf(name))

/** El rango de un analito para el sexo del paciente. Sin sexo, el más amplio de los dos (no marca de más). */
export function rangeFor(a: Pick<RefAnalyte, 'low' | 'high' | 'highOpen' | 'f' | 'm'>, sex?: 'F' | 'M'): { low?: number; high?: number; highOpen?: boolean } {
  if (!a.f && !a.m) return { low: a.low, high: a.high, highOpen: a.highOpen }
  const pick = sex === 'F' ? a.f : sex === 'M' ? a.m : undefined
  if (pick) return { low: pick[0], high: pick[1], highOpen: a.highOpen }
  if (sex) return { low: a.low, high: a.high, highOpen: a.highOpen }
  const lows = [a.f?.[0], a.m?.[0]]
  const highs = [a.f?.[1], a.m?.[1]]
  return { low: lows.some((x) => x == null) ? undefined : Math.min(...(lows as number[])), high: highs.some((x) => x == null) ? undefined : Math.max(...(highs as number[])), highOpen: a.highOpen }
}

/** «70–99», «<200», «≤0.8», «≥10», «Mujeres 12–16 · Hombres 14–18». */
export function rangeText(a: { low?: number; high?: number; highOpen?: boolean; f?: Pair; m?: Pair }) {
  const one = (low?: number, high?: number) => low != null && high != null ? (low === high ? `${low}` : `${low}–${high}`) : high != null ? `${a.highOpen ? '<' : '≤'}${high}` : low != null ? `≥${low}` : ''
  if (a.f || a.m) return [a.f && `Mujeres ${one(a.f[0], a.f[1])}`, a.m && `Hombres ${one(a.m[0], a.m[1])}`].filter(Boolean).join(' · ')
  return one(a.low, a.high)
}

/**
 * Ronda 12 (LB1): la parte del examen a la que pertenece un analito según el documento («Examen físico», «Examen químico»,
 * «Serie blanca»…), para agrupar el formulario de resultados. Sin dato (analito de la clínica o tabla sin subsección), nada.
 */
export function analyteSection(exam: string, analyte: string): string | undefined {
  const row = fileRowsOf(exam).find((r) => r.analyte === analyte) as (RefRow & { row?: string }) | undefined
  const parts = row?.row?.split(' › ') ?? []
  const sub = parts.length >= 3 ? parts[parts.length - 2] : undefined
  return sub && sub !== '-' && !/^(General|Otras)/.test(sub) ? sub : undefined
}

/** Ronda 12 (LB2): un analito sin números (Color, Nitritos, Cultivo): se escribe el resultado como texto. */
export const isQualitative = (a: Pick<RefAnalyte, 'low' | 'high' | 'f' | 'm'>) => a.low == null && a.high == null && !a.f && !a.m
