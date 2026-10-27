import type { IcdHit } from './icd.js'

/**
 * Búsqueda en el archivo oficial de la CIE-11 en español (OMS, MMS), sin internet ni credenciales. El archivo
 * (server/data/icd11-mms-es.js) se genera con scripts/build-icd11.ts y trae los códigos y títulos tal cual
 * los publica la OMS (licencia CC BY-ND 3.0 IGO).
 */

interface Entry { code: string; title: string; uri: string; chapter: string; leaf: boolean; words: string[]; norm: string }

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

let index: { release: string; entries: Entry[] } | null = null

async function load() {
  if (index) return index
  // Se importa como módulo (y sólo la primera vez que se busca): así Vercel lo incluye con la función
  const data = (await import('./data/icd11-mms-es.js')).default
  index = {
    release: data.release,
    entries: data.rows.map(([code, title, uri, chapter, leaf]) => {
      const norm = fold(title)
      return { code, title, uri: `http://id.who.int/icd/${uri}`, chapter, leaf: leaf === 1, norm, words: norm.split(/[^a-z0-9ñ]+/).filter(Boolean) }
    }),
  }
  return index
}

export const localRelease = async () => (await load()).release

/**
 * Busca por código ("CA02", "ca02.z") o por palabras ("faringitis aguda", "hiperten"). Cada palabra escrita tiene
 * que estar al inicio de alguna palabra del título. Primero lo que empieza igual, después los títulos más cortos.
 */
export async function searchLocal(q: string, limit = 15): Promise<IcdHit[]> {
  const { entries } = await load()
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
