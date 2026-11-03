/**
 * UM1 (ronda 8): lector de «Valores de referencia de laboratorio — Catálogo completo» (data/valores_referencia_laboratorio.md).
 * Convierte cada fila de tabla en un registro con su sección, subsección, columnas por encabezado, fuentes citadas y las
 * marcas ‡ y ⚠️. No interpreta números: eso lo hace build.ts con las reglas de emparejamiento (mapping.ts).
 */
export interface MdRow {
  /** Clave estable: «Sección › Subsección › Nombre». */
  key: string
  section: string
  sub: string
  name: string
  /** Columnas por su encabezado (sin la de la prueba). */
  cells: Record<string, string>
  sources: string[]
  /** ‡: resultado esperado por definición, sin fuente específica verificada. */
  noSource: boolean
  /** ⚠️: revisar unidad o dato llamativo (ver Notas). */
  warn: boolean
  line: number
}

export interface MdSource { code: string; citation: string; urls: string[] }

/** Quita el formato de markdown (*cursiva*, **negrita**) y espacios de más. */
export const plain = (s: string) => s.replace(/\*\*?([^*]+)\*\*?/g, '$1').replace(/\s+/g, ' ').trim()

const splitRow = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())

export function parseMd(md: string): { rows: MdRow[]; sources: MdSource[]; notes: string } {
  const lines = md.split(/\r?\n/)
  const rows: MdRow[] = []
  let section = ''
  let sub = ''
  let header: string[] | null = null
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    const h = /^(#{2,4})\s+(.+)$/.exec(l)
    if (h) {
      const title = plain(h[2]).replace(/\s*‡$/, '')
      if (h[1] === '##') { section = title.replace(/^\d+\.\s*/, ''); sub = '' } else sub = title
      header = null
      continue
    }
    if (!l.startsWith('|')) { header = null; continue }
    const cells = splitRow(l)
    if (!header) { header = cells.map(plain); continue }
    if (cells.every((c) => /^-+$/.test(c))) continue
    if (/^Fuentes consultadas/.test(section) || /^Notas/.test(section)) continue
    const raw = cells[0]
    const name = plain(raw).replace(/\s*[‡⚠️]+\s*/gu, ' ').replace(/\s+/g, ' ').trim()
    const byHeader: Record<string, string> = {}
    header.slice(1).forEach((hd, j) => { byHeader[hd] = plain(cells[j + 1] ?? '') })
    const all = cells.join(' ')
    const sources = [...new Set([...all.matchAll(/\[([A-Za-zÁÉÍÓÚáéíóúñÑ0-9-]+)\]/g)].map((m) => m[1]))]
    rows.push({ key: `${section} › ${sub || '-'} › ${name}`, section, sub: sub || '-', name, cells: byHeader, sources,
      noSource: /‡/.test(all), warn: /⚠️/u.test(raw), line: i + 1 })
  }
  // Fuentes: «N. **[CÓDIGO]** cita … https://…»
  const sources: MdSource[] = []
  const at = lines.findIndex((l) => /^## Fuentes consultadas/.test(l))
  for (const l of at >= 0 ? lines.slice(at) : []) {
    const m = /^\d+\.\s+\*\*\[([^\]]+)\]\*\*\s+(.+)$/.exec(l)
    if (!m) continue
    const urls = m[2].match(/https?:\/\/\S+/g) ?? []
    sources.push({ code: m[1], citation: plain(m[2].replace(/\s*·?\s*https?:\/\/\S+/g, '')).replace(/[.:]\s*$/, '').trim(), urls })
  }
  const ni = lines.findIndex((l) => /^## Notas/.test(l))
  const fi = lines.findIndex((l) => /^## Fuentes consultadas/.test(l))
  return { rows, sources, notes: ni >= 0 ? lines.slice(ni, fi >= 0 ? fi : undefined).join('\n') : '' }
}
