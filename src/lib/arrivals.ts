import { sameDay } from './format'
import type { Appointment } from './types'

/** Citas de hoy que todavía no llegan. La tarjeta "Por llegar" y la lista usan este mismo filtro. */
export function pendingArrivals(appointments: Appointment[], now = new Date(), doctorId?: string) {
  return appointments
    .filter((a) => sameDay(a.start, now) && ['scheduled', 'confirmed'].includes(a.status) && (!doctorId || a.doctorId === doctorId))
    .sort((a, b) => a.start.localeCompare(b.start))
}

export function lateLabel(minutes: number) {
  if (minutes < 60) return `retrasado ${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `retrasado ${h} h${m ? ` ${m} min` : ''}`
}
