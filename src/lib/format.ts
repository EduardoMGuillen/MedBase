import type { ApptStatus, Patient } from './types'

export const fullName = (p: Patient) => `${p.firstName} ${p.lastName}`

export function age(birthDate: string) {
  const b = new Date(birthDate)
  const now = new Date()
  let years = now.getFullYear() - b.getFullYear()
  if (now < new Date(now.getFullYear(), b.getMonth(), b.getDate())) years--
  if (years < 2) {
    const months = (now.getFullYear() - b.getFullYear()) * 12 + now.getMonth() - b.getMonth()
    return `${months} meses`
  }
  return `${years} años`
}

export const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit', hour12: false })

export const date = (iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  new Date(iso).toLocaleDateString('es-HN', opts)

export const sameDay = (iso: string, d: Date) => {
  const x = new Date(iso)
  return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth() && x.getDate() === d.getDate()
}

export const initials = (name: string) =>
  name.replace(/^(Dra?\.|Lic\.)\s*/, '').split(' ').slice(0, 2).map((w) => w[0]).join('')

export const STATUS: Record<ApptStatus, { label: string; tone: string }> = {
  scheduled: { label: 'Programada', tone: 'neutral' },
  confirmed: { label: 'Confirmada', tone: 'ink' },
  arrived: { label: 'En sala', tone: 'amber' },
  triaged: { label: 'Lista para consulta', tone: 'mint' },
  in_consult: { label: 'En consulta', tone: 'ink-solid' },
  done: { label: 'Atendida', tone: 'done' },
  no_show: { label: 'No asistió', tone: 'red' },
  cancelled: { label: 'Cancelada', tone: 'red' },
}

export const bmi = (kg: number, cm: number) => (kg / (cm / 100) ** 2).toFixed(1)

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export const money = (n: number, currency = 'L') =>
  `${currency} ${n.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const METHOD_LABEL = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', insurance: 'Aseguradora' } as const

export const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

export const localISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Rellena la plantilla de recordatorio con los datos de la cita. */
export function fillTemplate(tpl: string, v: Record<string, string>) {
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m)
}

/** Enlace de WhatsApp. Números de 8 dígitos se asumen de Honduras (+504). */
export function whatsappUrl(phone: string, text: string) {
  let digits = phone.replace(/\D/g, '')
  if (digits.length === 8) digits = `504${digits}`
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

export const fileSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
