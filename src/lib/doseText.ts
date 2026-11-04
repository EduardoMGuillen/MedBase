/**
 * IM2 (ronda 13). VALIDAR: Emil. Formas farmacéuticas que se cuentan, con su singular y su plural. La cantidad por toma
 * concuerda con la forma: «1 tableta», «2 tabletas», «1/2 tableta», «2 cápsulas». Las unidades (mg, g, mL, UI…) no cambian.
 */
export const DOSE_FORMS: [RegExp, string, string][] = [
  [/^tabletas?$/i, 'tableta', 'tabletas'], [/^c[aá]psulas?$/i, 'cápsula', 'cápsulas'], [/^sobres?$/i, 'sobre', 'sobres'],
  [/^ampollas?$/i, 'ampolla', 'ampollas'], [/^vial(es)?$/i, 'vial', 'viales'], [/^gotas?$/i, 'gota', 'gotas'],
  [/^supositorios?$/i, 'supositorio', 'supositorios'], [/^puffs?$/i, 'puff', 'puffs'], [/^[oó]vulos?$/i, 'óvulo', 'óvulos'],
  [/^parches?$/i, 'parche', 'parches'], [/^grageas?$/i, 'gragea', 'grageas'],
]

/** Una sola función para la receta, la nota y la hoja de medicamentos: «2 cápsula vía oral» → «2 cápsulas vía oral». */
export function doseText(dose = '') {
  const m = dose.match(/^(\s*)(\d+(?:[.,]\d+)?|\d+\/\d+|½|¼)(\s+)([A-Za-zÁÉÍÓÚáéíóúñÑ]+)(.*)$/s)
  if (!m) return dose
  const form = DOSE_FORMS.find(([re]) => re.test(m[4]))
  if (!form) return dose
  const q = m[2]
  const n = q === '½' ? 0.5 : q === '¼' ? 0.25 : q.includes('/') ? Number(q.split('/')[0]) / Number(q.split('/')[1]) : Number(q.replace(',', '.'))
  const word = n > 0 && n <= 1 ? form[1] : form[2]
  // Respeta la mayúscula inicial si la traía
  const out = /^[A-ZÁÉÍÓÚ]/.test(m[4]) ? word[0].toUpperCase() + word.slice(1) : word
  return `${m[1]}${q}${m[3]}${out}${m[5]}`
}
