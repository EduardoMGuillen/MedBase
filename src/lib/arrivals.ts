import { sameDay } from './format'
import type { Appointment } from './types'

/** Citas de hoy que todavía no llegan. La tarjeta "Por llegar" y la lista usan este mismo filtro. */
/**
 * Citas de hoy que todavía no llegan. CX2 (ronda 8): la de un paciente con estancia activa (`interned`) no entra: en la
 * agenda sale como «Hospitalizado: cita en conflicto».
 */
export function pendingArrivals(appointments: Appointment[], now = new Date(), doctorId?: string, interned?: (patientId: string) => boolean) {
  return appointments
    .filter((a) => sameDay(a.start, now) && ['scheduled', 'confirmed'].includes(a.status) && (!doctorId || a.doctorId === doctorId) && !interned?.(a.patientId))
    .sort((a, b) => a.start.localeCompare(b.start))
}

export function lateLabel(minutes: number) {
  if (minutes < 60) return `retrasado ${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `retrasado ${h} h${m ? ` ${m} min` : ''}`
}

/**
 * RE2 (ronda 16): orden de llegada (la hora en que se marcó «Llegó» o se registró sin cita); el que no ha llegado, por la
 * hora de su cita y después de los que ya llegaron.
 */
export function byArrival(a: Appointment, b: Appointment) {
  if (!!a.arrivedAt !== !!b.arrivedAt) return a.arrivedAt ? -1 : 1
  // Se comparan como fechas: la llegada se guarda en UTC («…Z») y la cita en hora local
  const t = (x: Appointment) => new Date(x.arrivedAt ?? x.start).getTime()
  return t(a) - t(b) || a.start.localeCompare(b.start)
}
