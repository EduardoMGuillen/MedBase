import { useLayoutEffect, useRef, useState, type InputHTMLAttributes, type KeyboardEvent } from 'react'
import { useStore } from '../lib/store'
import { DNI_MASK, dniDigits, dniLength, formatDni } from '../lib/format'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string
  onChange: (value: string) => void
  /** Identidad opcional: avisa si faltan dígitos, pero no bloquea. */
  optional?: boolean
}

/** Posición en el texto con formato justo después del dígito número `n`. */
function caretAfterDigits(text: string, n: number) {
  if (n <= 0) return 0
  let seen = 0
  for (let i = 0; i < text.length; i++) {
    if (/\d/.test(text[i]) && ++seen === n) return i + 1
  }
  return text.length
}

/**
 * Campo de identidad: se escriben sólo los números y los guiones aparecen solos (0000-0000-00000, o la
 * máscara que configure la clínica). Funciona al pegar con o sin guiones y al borrar sin que el cursor
 * salte. Al salir del campo avisa si faltan dígitos.
 */
export function DniInput({ value, onChange, optional = true, className = 'input', onBlur, ...rest }: Props) {
  const mask = useStore().settings.dniMask ?? DNI_MASK
  const ref = useRef<HTMLInputElement>(null)
  // Dónde debe quedar el cursor después de volver a dar formato: cuántos dígitos quedan antes de él
  const caret = useRef<number | null>(null)
  const [touched, setTouched] = useState(false)

  useLayoutEffect(() => {
    if (caret.current === null || !ref.current || document.activeElement !== ref.current) return
    const pos = caretAfterDigits(ref.current.value, caret.current)
    ref.current.setSelectionRange(pos, pos)
    caret.current = null
  }, [value])

  const set = (raw: string, digitsBefore: number) => {
    caret.current = digitsBefore
    onChange(formatDni(raw, mask))
  }

  // Borrar justo después (o antes) de un guion borra el dígito vecino, no el guion
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    rest.onKeyDown?.(e)
    if (!mask || (e.key !== 'Backspace' && e.key !== 'Delete')) return
    const el = e.currentTarget
    const start = el.selectionStart ?? 0
    if (start !== el.selectionEnd) return
    const text = el.value
    const before = dniDigits(text.slice(0, start)).length
    const all = dniDigits(text)
    if (e.key === 'Backspace' && start > 0 && !/\d/.test(text[start - 1]) && before > 0) {
      e.preventDefault()
      set(all.slice(0, before - 1) + all.slice(before), before - 1)
    } else if (e.key === 'Delete' && start < text.length && !/\d/.test(text[start])) {
      e.preventDefault()
      set(all.slice(0, before) + all.slice(before + 1), before)
    }
  }

  const need = dniLength(mask)
  const have = dniDigits(value).length
  const short = mask && touched && have > 0 && have < need
  return (
    <>
      <input
        {...rest}
        ref={ref}
        className={`${className}${short ? ' input--warn' : ''}`}
        value={value}
        inputMode={mask ? 'numeric' : rest.inputMode}
        autoComplete="off"
        placeholder={rest.placeholder ?? (mask || undefined)}
        onKeyDown={onKeyDown}
        onChange={(e) => {
          const el = e.target
          set(el.value, dniDigits(el.value.slice(0, el.selectionStart ?? el.value.length)).length)
          setTouched(false)
        }}
        onBlur={(e) => { setTouched(true); onBlur?.(e) }}
      />
      {short && <small className="field__msg field__msg--warn">Faltan {need - have} {need - have === 1 ? 'dígito' : 'dígitos'}{optional ? '. Puedes completarla después.' : '.'}</small>}
    </>
  )
}
