import { z } from 'zod'
import type { Sql } from './sql.js'

/** Vigencia de una receta en días: la que el médico eligió para esa receta (1 a 365). */
export const validityInput = z.number().int().min(1, 'La vigencia debe ser de al menos 1 día.').max(365, 'La vigencia no puede pasar de 365 días.').optional()

/** AD3: especialidad de un ingreso: la del médico que ingresa; si es médico general o no tiene, "Medicina general". */
export const specialtyOf = (u: { specialty?: string }) => u.specialty?.trim() || 'Medicina general'

/** Vigencia de la receta: la elegida para esa receta o, si no, la del médico (30 días si nunca la cambió). */
export async function rxValidityOf(q: Sql, staffId: string, asked?: number) {
  if (asked) return asked
  const r = await q.one('SELECT prefs FROM staff WHERE id = ?', [staffId])
  try { return Number(JSON.parse(String(r?.prefs || '{}')).rxValidityDays) || 30 } catch { return 30 }
}
