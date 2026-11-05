/**
 * GE10 (ronda 14): la primera letra que se escribe en un campo de texto sale en mayúscula («paños con agua» → «Paños con
 * agua», «ácido fólico» → «Ácido fólico»), también al pegar. Se hace una sola vez para toda la app (no hay un componente
 * compartido de campos: son `<input>` y `<textarea>` sueltos), escuchando la escritura en el documento.
 *
 * Solo actúa cuando el campo estaba vacío y se escribe o se pega su primera letra: si la persona la vuelve a minúscula a
 * propósito («pH», «mL») se respeta, porque el campo ya no estaba vacío. Lo guardado no cambia (no se toca al cargar).
 * Cada indicación de «Indicaciones y plan» es su propio campo: cada una empieza en mayúscula.
 *
 * No actúa (A15) en: buscadores (CIE-11, vademécum, exámenes, pacientes, material), correo, usuario y contraseña, identidad,
 * teléfono, números, fechas, horas y direcciones web (por su `type`, `inputMode` o `autocomplete`), ni en los campos marcados
 * con `data-nocap` (dosis, cantidades, unidades, códigos) o dentro de un contenedor con `data-nocap`.
 * A los demás les pone `autocapitalize="sentences"` para que el teclado del celular arranque en mayúscula.
 */

type Field = HTMLInputElement | HTMLTextAreaElement

const TEXT_TYPES = new Set(['', 'text'])
const SEARCH_HINT = /^\s*busca/i

export function capEligible(el: EventTarget | null): el is Field {
  if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return false
  if (el instanceof HTMLInputElement && !TEXT_TYPES.has((el.getAttribute('type') ?? '').toLowerCase())) return false
  if (el.readOnly || el.disabled || el.closest('[data-nocap]')) return false
  const mode = (el.getAttribute('inputmode') ?? '').toLowerCase()
  if (mode && mode !== 'text') return false
  const auto = (el.getAttribute('autocomplete') ?? '').toLowerCase()
  // Los buscadores con sugerencias apagan el autocompletado del navegador; usuario, correo, teléfono, códigos
  if (auto === 'off' || /user|email|tel|url|code|password|postal|cc-/.test(auto)) return false
  if (el.getAttribute('role') === 'combobox' || el.hasAttribute('aria-autocomplete')) return false
  if (SEARCH_HINT.test(el.getAttribute('aria-label') ?? '') || SEARCH_HINT.test(el.getAttribute('placeholder') ?? '')) return false
  return true
}

/** La primera letra del texto, en mayúscula (á → Á, ñ → Ñ). Devuelve el mismo texto si no hay nada que cambiar. */
export function capFirst(text: string) {
  const i = text.search(/\S/)
  if (i < 0) return text
  const ch = text.charAt(i)
  if (!/\p{Ll}/u.test(ch)) return text
  return text.slice(0, i) + ch.toLocaleUpperCase('es') + text.slice(i + 1)
}

/** Cambia el valor sin pasar por el rastreador de React, para que React vea el cambio y lo mande a su `onChange`. */
function setNative(el: Field, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value)
}

let installed = false

export function installAutoCapitalize(doc: Document = document) {
  if (installed) return
  installed = true
  // Lo que tenía cada campo antes de esta escritura: la regla solo aplica si estaba vacío
  const before = new WeakMap<Field, string>()
  const apply = (el: Field, notify: boolean) => {
    const prev = before.get(el) ?? ''
    const value = el.value
    if (!prev.trim() && value.trim()) {
      const next = capFirst(value)
      if (next !== value) {
        const { selectionStart: s, selectionEnd: e } = el
        setNative(el, next)
        try { if (s !== null && e !== null) el.setSelectionRange(s, e) } catch { /* algunos tipos no admiten selección */ }
        if (notify) el.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }
    before.set(el, el.value)
  }
  doc.addEventListener('focusin', (ev) => {
    const el = ev.target
    if (!capEligible(el)) return
    if (!el.hasAttribute('autocapitalize')) el.setAttribute('autocapitalize', 'sentences')
    before.set(el, el.value)
  }, true)
  // En la fase de captura, antes que React: su onChange ya recibe el texto con la mayúscula
  doc.addEventListener('input', (ev) => {
    const el = ev.target
    if (!capEligible(el)) return
    // Mientras el teclado arma una palabra (celular, acentos) no se toca: se revisa al terminar
    if ((ev as InputEvent).isComposing) return
    apply(el, false)
  }, true)
  doc.addEventListener('compositionend', (ev) => {
    const el = ev.target
    if (capEligible(el)) apply(el, true)
  }, true)
}
