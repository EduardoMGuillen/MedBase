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
