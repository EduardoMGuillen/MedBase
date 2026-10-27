import type { OrderSetItem, PrescriptionItem, SetMed } from './types.js'
import { durationDays, frequencyHours, medLabel } from './inpatient.js'
import { normalize } from './patients.js'

/**
 * Sets de órdenes (O1). Un set guarda indicaciones de texto y medicamentos con su estructura; al aplicarlo se
 * insertan al final de las órdenes actuales, editables, y nunca se firma la nota. Sirve en consulta externa,
 * hospitalización y observación (decisión de Emil): en la consulta el medicamento pasa a la receta y, si no tiene
 * días, se marca la falta de duración como un hueco.
 */

/** Espacio para completar: tres o más guiones bajos ("Ayuno de ___ a ___"). */
export const BLANK = /_{3,}/
export const hasBlank = (text?: string) => !!text && BLANK.test(text)
export const medHasBlank = (m: Pick<SetMed, 'drug' | 'dose' | 'instructions' | 'presentation'>) =>
  [m.drug, m.dose, m.instructions, m.presentation].some(hasBlank)

/** Texto de un medicamento del set, como se lee en la nota. */
export const setMedText = (m: SetMed) => `${medLabel(m)}${m.days ? ` por ${m.days} días` : ''}${m.instructions ? `. ${m.instructions}` : ''}`
export const itemText = (it: OrderSetItem) => (it.med ? setMedText(it.med) : it.text)

/** Del set a la receta de la consulta externa. Sin días, la duración queda vacía: la consulta pide completarla. */
export function setMedToRx(m: SetMed): PrescriptionItem {
  return {
    drug: m.drug, presentation: m.presentation ?? '', dose: m.dose, route: m.route,
    frequency: m.prn ? (m.everyHours ? `Cada ${m.everyHours} horas si es necesario` : 'Según necesidad') : m.everyHours ? `Cada ${m.everyHours} horas` : 'Dosis única',
    duration: m.days ? `${m.days} día${m.days === 1 ? '' : 's'}` : '', instructions: m.instructions ?? '',
  }
}

/** De la receta de la consulta externa al set. */
export function rxToSetMed(it: PrescriptionItem): SetMed {
  return {
    drug: it.drug, presentation: it.presentation || undefined, dose: it.dose, route: it.route ?? 'Oral',
    everyHours: frequencyHours(it.frequency), prn: /necesidad|necesario|prn/i.test(it.frequency), days: durationDays(it.duration),
    instructions: it.instructions || undefined,
  }
}

/** Clave para avisar de órdenes repetidas: sin mayúsculas, tildes, espacios de más ni el punto final. */
export const orderKey = (text: string) => normalize(text).replace(/[.\s]+$/, '').replace(/\s+/g, ' ')

/** Las órdenes del set que ya están, igualitas, en la lista actual (para el aviso de duplicado). */
export function duplicatesOf(items: OrderSetItem[], current: string[]) {
  const have = new Set(current.map(orderKey))
  return items.map(itemText).filter((t) => have.has(orderKey(t)))
}
