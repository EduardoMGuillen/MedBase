import { parseMd, type MdRow, type MdSource } from './parseMd.js'
import { RULES, type Rule, type Target } from './mapping.js'

/**
 * UM1 y UM2 (ronda 8): arma los valores de referencia y los umbrales críticos a partir del texto del .md (parseMd) y de las
 * reglas de emparejamiento (mapping.ts). Los números salen del archivo, no se escriben a mano. El script
 * `npm run um1:build` guarda el resultado en src/lib/labRef/generated.json y una prueba comprueba que siga igual al .md.
 */
export const LOAD_ORIGIN = 'Catálogo Clinara 2026-11-02'
export const NO_SOURCE = '‡'

export type Sex = 'all' | 'F' | 'M'

export interface RefValue {
  exam: string
  /** Vacío: el valor es del examen (resultado esperado). */
  analyte?: string
  unit: string
  sex: Sex
  low?: number
  high?: number
  /** «<x»: el máximo queda fuera. */
  highOpen?: boolean
  /** Resultado esperado (cualitativo, título) o texto de referencia (por edad o fase): sin Alto/Bajo. */
  expected?: string
  /** Categorías y demás notas del archivo. */
  note?: string
  sources: string[]
  /** ⚠️ del archivo (aldolasa, colinesterasa, digoxina). */
  warn?: boolean
  /** Fila del .md. */
  row: string
  how: Rule['how']
}

/** Umbral crítico de la app (UM2) para un analito. */
export interface RefThreshold {
  analyte: string
  unit: string
  /** Grupo de la pantalla (la sección del .md; los fármacos, «Fármacos (niveles séricos)»). */
  group: string
  sex: Sex
  low?: number
  high?: number
  /** Operador original de la fuente cuando no es el de la pantalla («≥100»). */
  op?: string
  sources: string[]
  row: string
}

export interface BuildResult {
  version: string
  sources: MdSource[]
  values: RefValue[]
  thresholds: RefThreshold[]
  /** Filas que no se cargan, con su motivo. */
  skipped: { row: string; why: string }[]
  /** Filas sin regla (debe quedar vacío). */
  unmatched: string[]
  /** Reglas que no encontraron su fila (debe quedar vacío). */
  orphanRules: string[]
}

const num = (s: string) => Number(s.replace(/,/g, ''))
const round = (n: number) => Math.round(n * 1e6) / 1e6
const NUM = '(-?\\d[\\d,]*(?:\\.\\d+)?)'

/** «a–b», «<x», «≤x», «≥x», «x»: el primer valor numérico del texto. */
export function parseLimit(text: string): { low?: number; high?: number; highOpen?: boolean; rest: string } | null {
  const t = text.trim()
  let m = new RegExp(`^${NUM}\\s*[–-]\\s*${NUM}`).exec(t)
  if (m) return { low: num(m[1]), high: num(m[2]), rest: t.slice(m[0].length).trim() }
  m = new RegExp(`^(<|≤|≥|>)\\s*${NUM}`).exec(t)
  if (m) {
    const v = num(m[2])
    const rest = t.slice(m[0].length).trim()
    if (m[1] === '<') return { high: v, highOpen: true, rest }
    if (m[1] === '≤') return { high: v, rest }
    return { low: v, rest }
  }
  m = new RegExp(`^${NUM}(?![\\d:])`).exec(t)
  if (m && !/^\d+:\d/.test(t)) return { low: num(m[1]), high: num(m[1]), rest: t.slice(m[0].length).trim() }
  return null
}

/** «Mujeres 0.50–1.10 · Hombres 0.70–1.30» (en cualquier orden; «Mujeres no embarazadas …»). */
export function parseSexes(text: string): { F?: string; M?: string } | null {
  const out: { F?: string; M?: string } = {}
  for (const part of text.split(' · ')) {
    const m = /^(Mujeres|Hombres)(?:\s+no embarazadas)?\s+(.+)$/i.exec(part.trim())
    if (m) out[/^m/i.test(m[1]) ? 'F' : 'M'] = m[2]
  }
  return out.F || out.M ? out : null
}

const VALUE_COLS = ['Valor de referencia', 'Valor de referencia / resultado esperado', 'Valor de referencia / punto de corte', 'Valor de referencia (negativo)',
  'Resultado esperado', 'Resultado esperado / punto de corte', 'Punto de corte (negativo si está por debajo)', 'Categorías', 'Puntos de corte (diabetes gestacional)',
  'Valor normal', 'Punto de corte', 'Punto de corte de exudado', 'Límite inferior', 'Rango terapéutico', 'TFG (mL/min/1.73 m²)']

function valueOf(r: MdRow) {
  for (const c of VALUE_COLS) if (r.cells[c] != null && r.cells[c] !== '') return r.cells[c]
  return Object.entries(r.cells).find(([k]) => k !== 'Unidades' && k !== 'Fuente')?.[1] ?? ''
}

const unitOf = (r: MdRow, rule: Rule) => {
  if (rule.toUnit) return rule.toUnit
  if (rule.unit) return rule.unit
  const u = r.cells['Unidades'] ?? ''
  return u === '—' || u === 'Descriptivo' ? '' : u
}

const sourcesOf = (r: MdRow) => {
  const s = [...r.sources]
  if (r.noSource) s.push(NO_SOURCE)
  return s.length ? s : []
}

/** Notas del archivo que van con su examen (sección «Notas»). */
const NOTE_FOR: [RegExp, string[]][] = [
  [/^\*\*Aldolasa:\*\*/, ['Aldolasa']],
  [/^\*\*Colinesterasa:\*\*/, ['Colinesterasa']],
  [/^\*\*Digoxina:\*\*/, ['Digoxina']],
  [/^\*\*Malaria:\*\*/, ['Hematozoario (Plasmodium spp.)', 'Gota gruesa']],
  [/^\*\*Drepanocitos:\*\*/, ['Células falciformes (drepanocitos)']],
  [/^\*\*HbA1c:\*\*/, ['Hemoglobina glicosilada (HbA1c)']],
  [/^\*\*Diabetes:\*\*/, ['Glucosa en ayunas', 'Tolerancia oral a la glucosa 2 horas', 'Curva de tolerancia de glucosa 2 horas']],
  [/^\*\*Tuberculina:\*\*/, ['Prueba de tuberculina']],
  [/^\*\*HE4 y ROMA:\*\*/, ['HE4 (proteína epididimal humana 4, ovario)', 'Algoritmo ROMA (ovario)']],
  [/^\*\*Widal:\*\*/, ['Antígenos febriles']],
]

export function buildReference(md: string): BuildResult {
  const { rows, sources, notes } = parseMd(md)
  const byRow = new Map(rows.map((r) => [`${r.sub} › ${r.name}`, r]))
  const values: RefValue[] = []
  const thresholds: RefThreshold[] = []
  const skipped: { row: string; why: string }[] = []
  const used = new Set<string>()
  const orphanRules: string[] = []
  const appends: { into: Target; text: string; sources: string[] }[] = []

  const push = (r: MdRow, rule: Rule, t: Target, v: Partial<RefValue>) => values.push({
    exam: t[0], analyte: t[1], unit: unitOf(r, rule), sex: 'all', sources: sourcesOf(r), warn: r.warn || undefined, row: r.key, how: rule.how, ...v,
  })
  const scale = (n: number | undefined, rule: Rule) => (n == null || !rule.scale ? n : round(n * rule.scale))
  const numeric = (r: MdRow, rule: Rule, t: Target, text: string, sex: Sex, extraNote?: string) => {
    const p = parseLimit(text)
    if (!p) return false
    const rest = p.rest.replace(rule.unit ?? '\u0000', '').replace(/^[(]|[)]$/g, '').trim()
    push(r, rule, t, { sex, low: scale(p.low, rule), high: scale(p.high, rule), highOpen: p.highOpen, note: [rest, extraNote].filter(Boolean).join('. ') || undefined })
    return true
  }

  for (const rule of RULES) {
    const rowKey = rule.row.split('#')[0]
    const r = byRow.get(rowKey)
    if (!r) { orphanRules.push(rule.row); continue }
    used.add(rowKey)
    if (rule.how === 'skip') { skipped.push({ row: r.key, why: rule.why ?? '' }); continue }
    let text = valueOf(r)
    if (rule.part != null) text = text.split(rule.sep ?? ' · ')[rule.part]?.trim() ?? ''
    for (const t of rule.to ?? []) {
      switch (rule.how) {
        case 'sexcols': {
          const f = r.cells['Mujeres'] ?? ''
          const m = r.cells['Hombres'] ?? ''
          const fp = parseLimit(f)
          const mp = parseLimit(m)
          if (fp && mp && fp.low === mp.low && fp.high === mp.high) numeric(r, rule, t, f, 'all')
          else { numeric(r, rule, t, f, 'F'); numeric(r, rule, t, m, 'M') }
          break
        }
        case 'range': case 'min': {
          const sx = parseSexes(text)
          if (sx) { if (sx.F) numeric(r, rule, t, sx.F, 'F'); if (sx.M) numeric(r, rule, t, sx.M, 'M') }
          else if (rule.how === 'min') { const p = parseLimit(text); if (p) push(r, rule, t, { low: p.low }) }
          else if (!numeric(r, rule, t, text, 'all')) push(r, rule, t, { expected: text })
          break
        }
        case 'rel': case 'abs': {
          const rel = r.cells['Relativo (%)'] ?? ''
          const abs = r.cells['Absoluto (/µL)'] ?? ''
          if (rule.how === 'rel' && parseLimit(rel)) push(r, { ...rule }, t, { unit: '%', ...pick(parseLimit(rel)!) })
          const absTarget: Target = rule.how === 'rel' ? [t[0], `${t[1]} (absoluto)`] : t
          if (parseLimit(abs)) push(r, rule, absTarget, { unit: rule.toUnit ?? '/µL', ...pick(parseLimit(abs)!, rule.scale) })
          break
        }
        case 'cat': case 'cut': case 'low-sex': {
          const full = r.cells['Descripción'] ? `${r.name} ${text} ${r.cells['Descripción']}` : text
          if (rule.how === 'cat') {
            const parts = text.split(' · ')
            const first = parts.find((p) => /^(Normal|Deseable|Óptimo|Bajo)\b/i.test(p.trim()) || /\bnormal\b/i.test(p)) ?? parts[0]
            const p = parseLimit(first.replace(/^(Normal|Deseable|Óptimo|Bajo)\s*/i, ''))
            if (p) push(r, rule, t, { low: p.low, high: p.high, highOpen: p.highOpen, note: full })
          } else if (rule.how === 'low-sex') {
            const m = /mujeres\s*<\s*([\d.]+)\s*·\s*hombres\s*<\s*([\d.]+)/i.exec(text)
            if (m) { push(r, rule, t, { sex: 'F', low: num(m[1]), note: text }); push(r, rule, t, { sex: 'M', low: num(m[2]), note: text }) }
          } else {
            for (const part of text.replace(/\s*\([^)]*\)\s*$/, '').split(' · ')) {
              const hit = rule.cuts!.find(([re]) => re.test(part.trim()))
              const m = /≥\s*([\d.]+)/.exec(part)
              if (hit && m) push(r, rule, [t[0], hit[1]], { high: num(m[1]), highOpen: true, note: text })
            }
          }
          break
        }
        case 'drug': {
          const p = parseLimit(text)
          if (p) push(r, rule, t, { low: p.low, high: p.high, note: [p.rest.replace(/^[(]|[)]$/g, ''), r.cells['Valor crítico'] && `Valor crítico ${r.cells['Valor crítico']}`].filter(Boolean).join('. ') || undefined })
          break
        }
        case 'cutoff': {
          const p = parseLimit(text)
          if (p) push(r, rule, t, { high: p.high ?? p.low, highOpen: true, note: r.sub === '-' ? undefined : `Punto de corte del tamizaje inicial en orina: negativo si está por debajo.` })
          break
        }
        case 'expected': {
          push(r, rule, t, { expected: text })
          break
        }
        case 'note': {
          push(r, rule, t, { expected: text })
          break
        }
        case 'append': break
      }
    }
    const line = r.cells['Descripción'] ? `${r.name} ${text} ${r.cells['Descripción']}` : `${r.name}: ${text}`
    if (rule.how === 'append' && rule.into) appends.push({ into: rule.into, text: line, sources: sourcesOf(r) })
    if (rule.how === 'append') for (const t of rule.to ?? []) appends.push({ into: t, text: line, sources: sourcesOf(r) })

    // UM2: los valores críticos de los fármacos (y el «valor de pánico» del litio)
    if (rule.how === 'drug') {
      const crit = r.cells['Valor crítico'] ?? /pánico\s*([><≥≤]\s*[\d.]+)/.exec(text)?.[1] ?? ''
      const m = /^(≥|>)\s*([\d.]+)/.exec(crit.trim())
      if (m) thresholds.push({ analyte: rule.to![0][1]!, unit: unitOf(r, rule), group: 'Fármacos (niveles séricos)', sex: 'all', high: num(m[2]), op: `${m[1]}${m[2]}`, sources: sourcesOf(r), row: r.key })
    }
  }
  // Notas de las filas «append» (categorías KDIGO G2–G5, INR con warfarina, NT-proBNP con TFG <60)
  for (const a of appends) {
    for (const v of values.filter((x) => x.exam === a.into[0] && x.analyte === a.into[1])) {
      v.note = [v.note, a.text].filter(Boolean).join(' · ')
      for (const s of a.sources) if (!v.sources.includes(s)) v.sources.push(s)
    }
  }
  // Notas del archivo (⚠️ y demás) con su examen
  for (const line of notes.split('\n').map((l) => l.replace(/^- /, '').trim())) {
    const hit = NOTE_FOR.find(([re]) => re.test(line))
    if (!hit) continue
    const text = line.replace(/\*\*/g, '')
    for (const exam of hit[1]) for (const v of values.filter((x) => x.exam === exam)) v.note = [v.note, text].filter(Boolean).join(' · ')
  }

  // Un examen con varias filas de resultado esperado (EGO, líquidos): cada una lleva el nombre de su fila («Color: …»)
  const examLevel = new Map<string, RefValue[]>()
  for (const v of values) if (!v.analyte && v.expected) examLevel.set(v.exam, [...(examLevel.get(v.exam) ?? []), v])
  for (const list of examLevel.values()) if (list.length > 1) for (const v of list) {
    const name = v.row.split(' › ').at(-1)!
    if (!v.expected!.startsWith(name)) v.expected = `${name}: ${v.expected}`
  }

  // UM2: el rango normal de cada analito numérico es su umbral crítico (A9). No: categorías, cualitativos, por edad o fase,
  // puntos de corte diagnósticos (UM2 punto 9) ni los de tamizaje de drogas. Un nombre de analito, un umbral.
  const NOT_THRESHOLD = /^Drogas de abuso/
  const seen = new Set<string>()
  for (const v of values) {
    if (!v.analyte || v.expected || !['range', 'sexcols', 'rel', 'abs', 'min'].includes(v.how)) continue
    if (v.low == null && v.high == null) continue
    const r = rows.find((x) => x.key === v.row)!
    if (NOT_THRESHOLD.test(r.sub) || /^Etanol/.test(r.name)) continue
    const k = `${v.analyte}|${v.sex}`
    if (seen.has(k)) continue
    seen.add(k)
    thresholds.push({ analyte: v.analyte, unit: v.unit, group: groupOf(r), sex: v.sex, low: v.low, high: v.high,
      op: v.highOpen ? `<${v.high}` : undefined, sources: v.sources, row: v.row })
  }

  const unmatched = rows.map((r) => `${r.sub} › ${r.name}`).filter((k) => !used.has(k))
  return { version: '2026-11-02', sources, values, thresholds, skipped, unmatched, orphanRules }
}

function pick(p: { low?: number; high?: number; highOpen?: boolean }, scale?: number) {
  const s = (n?: number) => (n == null || !scale ? n : round(n * scale))
  return { low: s(p.low), high: s(p.high), highOpen: p.highOpen }
}

/** Grupo de la pantalla de umbrales: la sección del .md, con las mayúsculas normales. */
function groupOf(r: MdRow) {
  const s = r.section.charAt(0) + r.section.slice(1).toLowerCase()
  return s.replace('química', 'Química').replace(/Microbiología \/ bacteriología/i, 'Microbiología / Bacteriología')
}
