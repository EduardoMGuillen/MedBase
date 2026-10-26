import type { ApptStatus, Background, Patient, PrescriptionItem } from './types'

export const fullName = (p: Patient) => `${p.firstName} ${p.lastName}`

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Edad legible: años desde los 2, meses antes y días en el primer mes ("1 mes", "12 días"). */
export function age(birthDate: string, now = new Date()) {
  if (!birthDate) return ''
  const b = new Date(`${birthDate.slice(0, 10)}T12:00:00`)
  let years = now.getFullYear() - b.getFullYear()
  if (now < new Date(now.getFullYear(), b.getMonth(), b.getDate())) years--
  if (years >= 2) return plural(years, 'año', 'años')
  let months = (now.getFullYear() - b.getFullYear()) * 12 + now.getMonth() - b.getMonth()
  if (now.getDate() < b.getDate()) months--
  if (months >= 1) return plural(months, 'mes', 'meses')
  const today = new Date(now); today.setHours(12, 0, 0, 0)
  const days = Math.max(0, Math.round((today.getTime() - b.getTime()) / 86_400_000))
  return plural(days, 'día', 'días')
}

export const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit', hour12: false })

export const date = (iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  new Date(iso).toLocaleDateString('es-HN', opts)

export const sameDay = (iso: string, d: Date) => {
  const x = new Date(iso)
  return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth() && x.getDate() === d.getDate()
}

/** "Dra. Lucía Herrera" → "Dra. Herrera"; sin título, el primer nombre y el último apellido. */
export function shortStaff(name = '') {
  const parts = name.trim().split(/\s+/)
  return parts.length < 3 ? name : `${parts[0]} ${parts.at(-1)}`
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

/** Formato de la identidad hondureña. Cada 0 es un dígito; lo demás se escribe solo. La clínica puede cambiarlo. */
export const DNI_MASK = '0000-0000-00000'

/** Sólo los dígitos de una identidad, para buscar con o sin guiones. */
export const dniDigits = (s = '') => s.replace(/\D/g, '')

/**
 * Identidad mientras se escribe: sólo cuentan los dígitos y los guiones se ponen solos al escribir el
 * dígito que sigue (0801199012345 → 0801-1990-12345). Una máscara vacía deja el texto como viene.
 */
export function formatDni(raw: string, mask = DNI_MASK) {
  if (!mask) return raw.slice(0, 30)
  const d = dniDigits(raw).slice(0, mask.split('0').length - 1)
  let out = ''
  let i = 0
  for (const ch of mask) {
    if (i >= d.length) break
    out += ch === '0' ? d[i++] : ch
  }
  return out
}

/** Cuántos dígitos lleva una identidad completa con esa máscara. */
export const dniLength = (mask = DNI_MASK) => mask.split('0').length - 1

/**
 * Cómo se guarda una identidad: la de 13 dígitos siempre como 0000-0000-00000, venga como venga. Lo que
 * tiene letras (un pasaporte registrado antes) o use otra máscara se deja como está.
 */
export function normalizeDni(raw?: string | null) {
  const v = (raw ?? '').trim()
  if (!v) return undefined
  if (/[a-z]/i.test(v)) return v.toUpperCase()
  return dniDigits(v).length === 13 ? formatDni(v) : v
}

/** Teléfono de 8 dígitos mientras se escribe: 98761123 → 9876-1123. Con código de país se deja como viene. */
export function formatPhone(raw: string) {
  if (/^\s*\+/.test(raw)) return raw
  const d = raw.replace(/\D/g, '')
  if (d.length > 8) return raw
  return d.length > 4 ? `${d.slice(0, 4)}-${d.slice(4)}` : d
}

/** Cómo se identifica al paciente en recetas y constancias: su identidad o, si es menor sin identidad, la del responsable. */
export function identityLine(p: Pick<Patient, 'dni' | 'birthDate' | 'guardianName' | 'guardianDni' | 'guardianRelation'>, isMinor: boolean) {
  if (p.dni) return p.dni
  if (!isMinor) return 'Sin registrar'
  const who = p.guardianName ? `${p.guardianName}${p.guardianRelation ? ` (${p.guardianRelation.toLowerCase()})` : ''}` : ''
  return `Menor sin identidad${who ? `. Responsable: ${who}` : ''}${p.guardianDni ? `, ID ${p.guardianDni}` : ''}`
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
  const how = /única/i.test(i.frequency) ? '' : i.duration ? ` por ${i.duration}` : ', hasta nueva orden'
  return `${i.drug}${i.presentation ? ` (${i.presentation.toLowerCase()})` : ''}: ${i.dose}${route} ${i.frequency.toLowerCase()}${how}.${i.instructions ? ` ${i.instructions}` : ''}`
}

/** Medicamento de la receta (se va a casa) sin el total de días. */
export const missingDays = (it: PrescriptionItem) => !it.applyInClinic && !it.duration.trim() && !/única/i.test(it.frequency)

const COUNTABLE: [RegExp, string, string][] = [
  [/^tab/i, 'tableta', 'tabletas'], [/^c[aá]ps/i, 'cápsula', 'cápsulas'], [/^sobre/i, 'sobre', 'sobres'], [/^ampoll/i, 'ampolla', 'ampollas'],
  [/^vial/i, 'vial', 'viales'], [/^supositorio/i, 'supositorio', 'supositorios'], [/^[oó]vulo/i, 'óvulo', 'óvulos'], [/^parche/i, 'parche', 'parches'],
  [/^gragea/i, 'gragea', 'grageas'],
]

/**
 * Cantidad total para la receta a partir de la dosis, la frecuencia y los días: "1 tableta cada 8 horas por
 * 3 días" → "9 tabletas". Sólo con dosis en unidades que se cuentan; si no se puede calcular, undefined.
 */
export function autoQuantity(i: Pick<PrescriptionItem, 'dose' | 'frequency' | 'duration'>) {
  const m = i.dose.trim().match(/^(\d+(?:[.,]\d+)?|1\/2|½)\s+(\S+)/)
  const hours = i.frequency.match(/cada\s+(\d+)\s*h/i)
  const days = i.duration.trim().match(/^(\d+)\s*(d[ií]as?|semanas?)?$/i)
  if (!m || !hours || !days) return undefined
  const unit = COUNTABLE.find(([re]) => re.test(m[2]))
  if (!unit) return undefined
  const per = m[1] === '1/2' || m[1] === '½' ? 0.5 : Number(m[1].replace(',', '.'))
  const n = Math.ceil(per * (24 / Number(hours[1])) * Number(days[1]) * (/semana/i.test(days[2] ?? '') ? 7 : 1))
  return n > 0 ? `${n} ${n === 1 ? unit[1] : unit[2]}` : undefined
}

/** "Tableta 500 mg" → "500 mg tableta", como se escribe en la receta. */
export function presentationShort(presentation = '') {
  const m = presentation.match(/^([A-Za-zÁÉÍÓÚáéíóúñÑ]+)\s+(.+)$/)
  return m ? `${m[2]} ${m[1].toLowerCase()}` : presentation
}

const ROUTE_SHORT: Record<string, string> = {
  Oral: 'VO', Intravenosa: 'IV', Intramuscular: 'IM', Subcutánea: 'SC', Sublingual: 'SL', Inhalada: 'inhalada', Tópica: 'tópica', Oftálmica: 'oftálmica',
  Ótica: 'ótica', Nasal: 'nasal', Rectal: 'rectal', Vaginal: 'vaginal',
}

/** Forma legible de un medicamento: "Acetaminofén 500 mg tableta — 1 g VO cada 8 h por 3 días". */
export function medicationLine(i: PrescriptionItem) {
  const freq = i.frequency.replace(/^Cada (\d+) horas?$/i, 'cada $1 h').replace(/^Dosis única$/i, 'dosis única').replace(/^Según necesidad$/i, 'según necesidad')
  const once = /dosis única/i.test(i.frequency)
  const route = i.route ? ROUTE_SHORT[i.route] ?? i.route.toLowerCase() : ''
  const how = [i.dose, route, freq, !once ? (i.duration ? `por ${i.duration}` : 'hasta nueva orden') : ''].filter(Boolean).join(' ')
  return `${i.drug}${i.presentation ? ` ${presentationShort(i.presentation)}` : ''} — ${how}`
}

/** Número que identifica el expediente en documentos: la identidad si la clínica así lo configuró. */
export const recordNumber = (p: Pick<Patient, 'record' | 'dni'>, s: { recordUsesDni: boolean }) => (s.recordUsesDni && p.dni ? p.dni : p.record)

/** Valor para un `<input type="datetime-local">` en hora local. */
export const inputDateTime = (d: Date) => `${localISODate(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

export const dateTime = (iso: string) => `${date(iso, { day: 'numeric', month: 'short' })}, ${time(iso)}`
