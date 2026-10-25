import type { Schedule, TimeRange } from './types.js'

/**
 * Horario de atención de un médico: por día de la semana, una o más franjas (lunes 08:00–12:00 y
 * 14:00–17:00). Lo usan la agenda interna, la reserva en línea y el servidor para validar citas.
 *
 * Formato guardado: `week` (día → franjas) más `days/start/end/slot`, que se conservan para las
 * bases y versiones anteriores, que sólo conocían una franja igual para todos los días.
 */

export const DAY_NAMES_PLURAL = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados']
export const SLOT_OPTIONS = [15, 20, 30, 45, 60]
export const DEFAULT_SLOT = 30

export type Week = Record<number, TimeRange[]>

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
const pad = (n: number) => String(n).padStart(2, '0')
const toHHMM = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`

/** Franjas por día, leyendo tanto el formato nuevo como el anterior. */
export function weekOf(s?: Schedule | null): Week {
  const week: Week = {}
  if (!s) return week
  if (s.week) {
    for (const [d, ranges] of Object.entries(s.week)) if (ranges?.length) week[Number(d)] = [...ranges].sort((a, b) => a.start.localeCompare(b.start))
    return week
  }
  for (const d of s.days ?? []) week[d] = [{ start: s.start, end: s.end }]
  return week
}

/** Guarda las franjas junto con los campos anteriores (días, primera entrada y última salida). */
export function scheduleFromWeek(week: Week, slot: number): Schedule {
  const days = Object.keys(week).map(Number).filter((d) => week[d]?.length).sort()
  const all = days.flatMap((d) => week[d])
  return {
    days, slot,
    start: all.length ? all.map((r) => r.start).sort()[0] : '08:00',
    end: all.length ? all.map((r) => r.end).sort().at(-1)! : '17:00',
    week: Object.fromEntries(days.map((d) => [String(d), week[d]])),
  }
}

/** Día de la semana de una fecha `YYYY-MM-DD`, sin depender de la zona horaria. */
export const weekday = (date: string) => new Date(`${date.slice(0, 10)}T12:00:00`).getDay()

export function rangesOn(s: Schedule | undefined | null, date: string): TimeRange[] {
  return weekOf(s)[weekday(date)] ?? []
}

/** Horas que se ofrecen ese día: cada `slot` minutos dentro de cada franja. */
export function slotsOn(s: Schedule | undefined | null, date: string, step = s?.slot || DEFAULT_SLOT): string[] {
  const out: string[] = []
  for (const r of rangesOn(s, date)) {
    for (let m = toMin(r.start); m + step <= toMin(r.end); m += step) out.push(toHHMM(m))
  }
  return out
}

/** ¿Cae la hora dentro de alguna franja del día? */
export function withinSchedule(s: Schedule | undefined | null, date: string, hhmm: string) {
  const m = toMin(hhmm)
  return rangesOn(s, date).some((r) => m >= toMin(r.start) && m < toMin(r.end))
}

/** Problemas de un horario antes de guardarlo; vacío si está bien. */
export function scheduleProblems(week: Week): string[] {
  const out: string[] = []
  const names = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
  if (!Object.values(week).some((r) => r?.length)) out.push('Elige al menos un día de atención.')
  for (const [d, ranges] of Object.entries(week)) {
    const sorted = [...(ranges ?? [])].sort((a, b) => a.start.localeCompare(b.start))
    sorted.forEach((r, i) => {
      if (!/^\d{2}:\d{2}$/.test(r.start) || !/^\d{2}:\d{2}$/.test(r.end)) out.push(`${names[Number(d)]}: escribe la hora de entrada y de salida.`)
      else if (r.start >= r.end) out.push(`${names[Number(d)]}: la salida (${r.end}) debe ser después de la entrada (${r.start}).`)
      if (i > 0 && r.start < sorted[i - 1].end) out.push(`${names[Number(d)]}: las franjas ${sorted[i - 1].start}–${sorted[i - 1].end} y ${r.start}–${r.end} se cruzan.`)
    })
  }
  return out
}

/** Texto corto del horario: "Lun a vie 08:00–12:00 y 14:00–17:00; sáb 08:00–12:00". */
export function describeSchedule(s?: Schedule | null) {
  const week = weekOf(s)
  const short = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
  const groups: { days: number[]; text: string }[] = []
  for (const d of [1, 2, 3, 4, 5, 6, 0]) {
    const r = week[d]
    if (!r?.length) continue
    const text = r.map((x) => `${x.start}–${x.end}`).join(' y ')
    const last = groups.at(-1)
    const prev = last?.days.at(-1)
    const consecutive = prev != null && (prev === 6 ? d === 0 : d === prev + 1)
    if (last && last.text === text && consecutive) last.days.push(d)
    else groups.push({ days: [d], text })
  }
  return groups.map((g) => {
    const name = g.days.length > 2 ? `${short[g.days[0]]} a ${short[g.days.at(-1)!]}` : g.days.map((d) => short[d]).join(', ')
    return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${g.text}`
  }).join('; ')
}
