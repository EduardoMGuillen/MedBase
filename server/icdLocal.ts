import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IcdHit } from './icd.js'

/**
 * Búsqueda en el archivo oficial de la CIE-11 en español (OMS, MMS), sin internet ni credenciales. El archivo
 * (server/data/icd11-mms-es.json) se genera con scripts/build-icd11.ts y trae los códigos y títulos tal cual
 * los publica la OMS (licencia CC BY-ND 3.0 IGO).
 */

interface Entry { code: string; title: string; uri: string; chapter: string; leaf: boolean; words: string[]; norm: string }

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

let index: { release: string; entries: Entry[] } | null = null

function load() {
  if (index) return index
  // En Vercel el archivo va con la función (vercel.json, includeFiles) bajo el directorio de trabajo; en local,
  // también está junto a este módulo. Empaquetado, import.meta.url puede no servir: se intenta sin fallar.
  const paths = [resolve(process.cwd(), 'server/data/icd11-mms-es.json')]
  try { paths.push(resolve(dirname(fileURLToPath(import.meta.url)), 'data/icd11-mms-es.json')) } catch { /* empaquetado */ }
  let raw = ''
  for (const p of paths) { try { raw = readFileSync(p, 'utf8'); break } catch { /* siguiente */ } }
  if (!raw) throw new Error(`No se encontró el archivo de la CIE-11 (${paths.join(', ')}).`)
  const data = JSON.parse(raw) as { release: string; rows: [string, string, string, string, number][] }
  index = {
    release: data.release,
    entries: data.rows.map(([code, title, uri, chapter, leaf]) => {
      const norm = fold(title)
      return { code, title, uri: `http://id.who.int/icd/${uri}`, chapter, leaf: leaf === 1, norm, words: norm.split(/[^a-z0-9ñ]+/).filter(Boolean) }
    }),
  }
  return index
}

export const localRelease = () => load().release

/**
 * Busca por código ("CA02", "ca02.z") o por palabras ("faringitis aguda", "hiperten"). Cada palabra escrita tiene
 * que estar al inicio de alguna palabra del título. Primero lo que empieza igual, después los títulos más cortos.
 */
export function searchLocal(q: string, limit = 15): IcdHit[] {
  const { entries } = load()
  const s = fold(q.trim())
  if (s.length < 2) return []
  const codeLike = /^[0-9a-z]{2}[0-9a-z]{0,2}(\.[0-9a-z]{0,2})?$/.test(s) && /\d/.test(s)
  const terms = s.split(/[^a-z0-9ñ.]+/).filter(Boolean)
  const scored: { e: Entry; score: number }[] = []
  for (const e of entries) {
    let score = -1
    if (codeLike && e.code.toLowerCase().startsWith(s)) score = 1000 - e.code.length
    else if (terms.every((t) => e.words.some((w) => w.startsWith(t)))) {
      score = 500 - Math.min(e.norm.length, 400)
      if (e.norm.startsWith(s)) score += 200
      else if (e.norm.includes(s)) score += 100
    }
    if (score >= 0) scored.push({ e, score })
  }
  return scored.sort((a, b) => b.score - a.score || a.e.code.localeCompare(b.e.code)).slice(0, limit)
    .map(({ e }) => ({ code: e.code, label: e.title, uri: e.uri, chapter: e.chapter }))
}
