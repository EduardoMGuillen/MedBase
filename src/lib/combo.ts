/** LD1 (ronda 18): el filtro de la lista desplegable única (components/Combo.tsx), sin React, para que lo usen las pruebas. */
export interface ComboMatchable { label: string; hint?: string }

/** Sin tildes ni mayúsculas, carácter por carácter (los índices coinciden con el texto original para resaltar). */
export const foldText = (t: string) => Array.from(t, (c) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() || c).join('')


/** Las opciones que coinciden con lo escrito: primero las que empiezan con ello; el resto, en su orden. */
export function comboMatches<T extends ComboMatchable>(options: T[], typed: string): T[] {
  const q = foldText(typed.trim())
  if (!q) return options
  const hit = options.map((o) => ({ o, at: foldText(o.label).indexOf(q), hint: !!o.hint && foldText(o.hint).includes(q) })).filter((x) => x.at >= 0 || x.hint)
  return [...hit.filter((x) => x.at === 0), ...hit.filter((x) => x.at !== 0)].map((x) => x.o)
}
