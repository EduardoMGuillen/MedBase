/** NE5 (ronda 8): conversión entre «aaaa-mm-ddTHH:mm» (valor) y «dd/mm/aaaa HH:mm» (lo que se ve). Ver DateTimeField. */
const pad = (n: number) => String(n).padStart(2, '0')

/** «2026-11-02T12:52» → «02/11/2026 12:52». */
export function toDisplay(value: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value)
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : ''
}

/** «02/11/2026 12:52» → «2026-11-02T12:52»; `null` si la fecha u hora no existe. */
export function fromDisplay(text: string) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/.exec(text.trim())
  if (!m) return null
  const [d, mo, y, h, mi] = m.slice(1).map(Number)
  const date = new Date(y, mo - 1, d, h, mi)
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d || h > 23 || mi > 59) return null
  return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}`
}

