import { useState } from 'react'
import { fromDisplay, toDisplay } from '../lib/dateInput'

/**
 * NE5 (ronda 8): fecha y hora en dd/mm/aaaa HH:mm (24 horas) sin depender del idioma del navegador. El campo
 * `datetime-local` del navegador muestra 11/02/2026 12:52 PM en un navegador en inglés: no se sabe si es 2 de noviembre o
 * 11 de febrero. Aquí se escribe con números (las barras, el espacio y los dos puntos se ponen solos) y el valor es el
 * mismo de antes: «aaaa-mm-ddTHH:mm» en la hora local.
 */
/** Pone las barras, el espacio y los dos puntos mientras se escriben los números. */
function mask(raw: string) {
  const digits = raw.replace(/\D/g, '').slice(0, 12)
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8), digits.slice(8, 10), digits.slice(10, 12)]
  let out = parts[0]
  if (digits.length > 2) out += `/${parts[1]}`
  if (digits.length > 4) out += `/${parts[2]}`
  if (digits.length > 8) out += ` ${parts[3]}`
  if (digits.length > 10) out += `:${parts[4]}`
  return out
}

export function DateTimeField({ value, onChange, max, invalid, id, label = 'Fecha y hora' }: {
  value: string; onChange: (v: string) => void; max?: string; invalid?: boolean; id?: string; label?: string
}) {
  const [text, setText] = useState(() => toDisplay(value))
  const [seen, setSeen] = useState(value)
  // Si el valor cambia desde fuera (p. ej. «Ahora»), se muestra el nuevo
  if (value !== seen) { setSeen(value); setText(toDisplay(value)) }
  const parsed = fromDisplay(text)
  const late = !!parsed && !!max && parsed > max
  const bad = (text.length === 16 && !parsed) || late || invalid
  return (
    <input id={id} className={`input num${bad ? ' input--error' : ''}`} inputMode="numeric" autoComplete="off" placeholder="dd/mm/aaaa HH:mm" aria-label={label}
      aria-invalid={bad || undefined} value={text}
      onChange={(e) => {
        const t = mask(e.target.value)
        setText(t)
        const v = fromDisplay(t)
        if (v && (!max || v <= max)) { setSeen(v); onChange(v) }
      }}
      onBlur={() => { if (!fromDisplay(text)) setText(toDisplay(value)) }} />
  )
}
