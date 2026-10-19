import type { ApptStatus, Background, Patient, PrescriptionItem } from './types'

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

// ---------- Historia clínica ----------

export const CIVIL_STATUS = ['Soltero(a)', 'Casado(a)', 'Unión libre', 'Divorciado(a)', 'Viudo(a)']
export const EDUCATION = ['Ninguna', 'Preescolar', 'Primaria incompleta', 'Primaria completa', 'Secundaria incompleta', 'Secundaria completa', 'Técnico', 'Universitaria', 'Posgrado']

/** Antecedentes en el orden de la historia clínica. `female` marca los gineco-obstétricos. */
export const BACKGROUND_GROUPS: { title: string; female?: boolean; fields: { key: keyof Background; label: string; date?: boolean }[] }[] = [
  { title: 'Personales patológicos', fields: [
    { key: 'pathological', label: 'Enfermedades' },
    { key: 'surgical', label: 'Quirúrgicos' },
    { key: 'traumatic', label: 'Traumáticos' },
    { key: 'hospitalizations', label: 'Hospitalarios' },
    { key: 'transfusions', label: 'Transfusionales' },
    { key: 'medications', label: 'Medicamentos actuales' },
  ] },
  { title: 'Personales no patológicos', fields: [
    { key: 'smoking', label: 'Tabaquismo' },
    { key: 'alcohol', label: 'Alcoholismo' },
    { key: 'drugs', label: 'Otras sustancias' },
    { key: 'lifestyle', label: 'Actividad física y alimentación' },
    { key: 'immunizations', label: 'Inmunizaciones' },
  ] },
  { title: 'Heredofamiliares', fields: [{ key: 'family', label: 'Antecedentes familiares' }] },
  { title: 'Gineco-obstétricos', female: true, fields: [
    { key: 'menarche', label: 'Menarca' },
    { key: 'lmp', label: 'FUM', date: true },
    { key: 'gpac', label: 'G P A C' },
    { key: 'contraception', label: 'Planificación familiar' },
    { key: 'gynecoNotes', label: 'Otros' },
  ] },
]

export const ROUTES = ['Oral', 'Sublingual', 'Intramuscular', 'Intravenosa', 'Subcutánea', 'Inhalada', 'Tópica', 'Oftálmica', 'Ótica', 'Nasal', 'Rectal', 'Vaginal']

export const defaultRoute = (presentation = '') =>
  /inhalador/i.test(presentation) ? 'Inhalada' : /crema|ungüento|gel/i.test(presentation) ? 'Tópica' : /gotas oft/i.test(presentation) ? 'Oftálmica' : 'Oral'

/** Texto de una orden médica de medicamento, p. ej. "Azitromicina 500 mg tableta: 1 tableta vía oral cada 24 horas por 3 días." */
export function medicationOrder(i: PrescriptionItem) {
  const route = i.route ? ` vía ${i.route.toLowerCase()}` : ''
  return `${i.drug}${i.presentation ? ` (${i.presentation.toLowerCase()})` : ''}: ${i.dose}${route} ${i.frequency.toLowerCase()} por ${i.duration}.${i.instructions ? ` ${i.instructions}` : ''}`
}
