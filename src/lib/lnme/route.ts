import { ROUTES } from '../format.js'
import { plainText } from './match.js'

/**
 * ME5 (ronda 9): la vía del LNME («IV», «IM», «Oral»…) en la vía del formulario de medicamento. Sólo con una vía y un
 * equivalente claro; con varias («IV, IM») o sin equivalente («Epidural, infiltración») no se precarga nada. Las
 * soluciones para nebulizar (vía «Inhalación oral») van a «Nebulización» (ME4) y los inhaladores a «Inhalada».
 */
const MAP: Record<string, string> = {
  iv: 'Intravenosa', intravenosa: 'Intravenosa', im: 'Intramuscular', intramuscular: 'Intramuscular', sc: 'Subcutánea', subcutanea: 'Subcutánea',
  oral: 'Oral', sl: 'Sublingual', sublingual: 'Sublingual', topica: 'Tópica', oftalmica: 'Oftálmica', otica: 'Ótica', nasal: 'Nasal', rectal: 'Rectal', vaginal: 'Vaginal',
}

export const NEBULIZATION = 'Nebulización'

/** La vía del formulario para una fila del LNME, o `undefined` si no hay una sola equivalente. */
export function formRoute(routes: string, name = '', form = ''): string | undefined {
  const r = plainText(routes)
  const text = plainText(`${name} ${form}`)
  let out: string | undefined
  if (r === 'inhalacion oral') out = /nebuliz/.test(text) ? NEBULIZATION : /inhalador|aerosol/.test(text) ? 'Inhalada' : undefined
  else out = MAP[r]
  // «Nebulización» la agrega ME4 a la lista de vías; mientras no esté, no se precarga (el selector no la mostraría)
  return out && (ROUTES as readonly string[]).includes(out) ? out : undefined
}

/**
 * ME6 (ronda 10): la vía del .md como se muestra en el vademécum, con palabras completas según la leyenda del archivo
 * (IV → Intravenosa, IM → Intramuscular, SC → Subcutánea, IT → Intratecal, SL → Sublingual); las demás tal cual. Varias
 * vías van separadas por coma («Intravenosa, intramuscular»). «—» (sin vía) queda vacío.
 */
const WORDS: Record<string, string> = { IV: 'intravenosa', IM: 'intramuscular', SC: 'subcutánea', IT: 'intratecal', SL: 'sublingual' }
export function routeWords(routes?: string): string {
  const t = (routes ?? '').trim()
  if (!t || t === '—' || t === '-') return ''
  const parts = t.split(',').map((x) => x.trim()).filter(Boolean).map((x) => x.replace(/\b(IV|IM|SC|IT|SL)\b/g, (c) => WORDS[c]))
  return parts.map((w, i) => (i ? w.charAt(0).toLocaleLowerCase('es') + w.slice(1) : w.charAt(0).toLocaleUpperCase('es') + w.slice(1))).join(', ')
}
