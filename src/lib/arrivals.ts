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
