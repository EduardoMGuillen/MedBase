/**
 * GE3 (ronda 9): fechas y horas de la app en dd/mm/aaaa y HH:mm (24 horas), siempre en la hora de Honduras
 * (America/Tegucigalpa, UTC−6, sin horario de verano), sin depender del idioma ni de la zona del navegador.
 * Los valores de los formularios siguen siendo los mismos: «aaaa-mm-dd», «HH:mm» y «aaaa-mm-ddTHH:mm» en hora de Honduras.
 */
export const CLINIC_TZ = 'America/Tegucigalpa'
/** UTC−6 todo el año: Honduras no tiene horario de verano. */
const OFFSET_MIN = -6 * 60

const pad = (n: number) => String(n).padStart(2, '0')

/** Las partes de una fecha en la hora de Honduras. */
export function clinicParts(d: Date) {
  const t = new Date(d.getTime() + OFFSET_MIN * 60_000)
  return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes(), wd: t.getUTCDay() }
}

/** «aaaa-mm-ddTHH:mm» de un instante, en la hora de Honduras. */
export function toLocalValue(d: Date) {
  const p = clinicParts(d)
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`
}

/** «aaaa-mm-dd» de un instante, en la hora de Honduras. */
export const toLocalDate = (d: Date) => toLocalValue(d).slice(0, 10)

/** El instante de un «aaaa-mm-ddTHH:mm» (o «aaaa-mm-dd») escrito en hora de Honduras. */
export function fromLocalValue(v: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(v)
  if (!m) return new Date(NaN)
  const [y, mo, d, h, mi] = [m[1], m[2], m[3], m[4] ?? '00', m[5] ?? '00'].map(Number)
  return new Date(Date.UTC(y, mo - 1, d, h, mi) - OFFSET_MIN * 60_000)
}

/** ISO (UTC) de un «aaaa-mm-ddTHH:mm» en hora de Honduras: lo que se manda al servidor. */
export const localValueToIso = (v: string) => fromLocalValue(v).toISOString()

/** ¿Existe esa fecha? (31/02 no). */
function validYmd(y: number, mo: number, d: number) {
  const t = new Date(Date.UTC(y, mo - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d
}

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
  if (!validYmd(y, mo, d) || h > 23 || mi > 59) return null
  return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}`
}

/** «2026-11-02» → «02/11/2026». */
export const dateToDisplay = (value: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value); return m ? `${m[3]}/${m[2]}/${m[1]}` : '' }

/** «02/11/2026» → «2026-11-02»; `null` si no existe. */
export function dateFromDisplay(text: string) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim())
  if (!m) return null
  const [d, mo, y] = m.slice(1).map(Number)
  return validYmd(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null
}

/** «20:14» → «20:14»; `null` si no es una hora de 00:00 a 23:59. */
export function timeFromDisplay(text: string) {
  const m = /^(\d{2}):(\d{2})$/.exec(text.trim())
  if (!m) return null
  const [h, mi] = [Number(m[1]), Number(m[2])]
  return h <= 23 && mi <= 59 ? `${pad(h)}:${pad(mi)}` : null
}

/** Máscaras: ponen las barras, el espacio y los dos puntos mientras se escriben los números. */
export function maskDateTime(raw: string) {
  const g = raw.replace(/\D/g, '').slice(0, 12)
  let out = g.slice(0, 2)
  if (g.length > 2) out += `/${g.slice(2, 4)}`
  if (g.length > 4) out += `/${g.slice(4, 8)}`
  if (g.length > 8) out += ` ${g.slice(8, 10)}`
  if (g.length > 10) out += `:${g.slice(10, 12)}`
  return out
}
export function maskDate(raw: string) {
  const g = raw.replace(/\D/g, '').slice(0, 8)
  let out = g.slice(0, 2)
  if (g.length > 2) out += `/${g.slice(2, 4)}`
  if (g.length > 4) out += `/${g.slice(4, 8)}`
  return out
}
export function maskTime(raw: string) {
  const g = raw.replace(/\D/g, '').slice(0, 4)
  return g.length > 2 ? `${g.slice(0, 2)}:${g.slice(2)}` : g
}

export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export const WEEKDAYS_SHORT = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
