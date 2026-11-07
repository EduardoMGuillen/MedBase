import { CLINIC_TZ, clinicParts, toLocalValue } from './dateInput.js'
import { loadingLine, nebulizationLine } from './medExtras.js'
import { isPrnFrequency } from './catalogs.js'
import { doseText } from './doseText.js'
import { ROUTE_ABBR } from './inpatient.js'
import { ROUTE_OPTIONS, RX_LEGEND_BUY_AND_BRING, RX_LEGEND_IN_CLINIC } from './clinicalConfig.js'
import { normalize } from './patients.js'
import type { ApptStatus, Background, ClinicContact, Diagnosis, Patient, PrescriptionItem } from './types'

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

/** GE3 (ronda 9): HH:mm de 24 horas en la hora de Honduras, sin depender del navegador (nunca AM/PM ni «24:05»). */
export const time = (iso: string) => {
  const p = clinicParts(new Date(iso))
  return `${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}`
}

export const date = (iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00-06:00` : iso).toLocaleDateString('es-HN', { timeZone: CLINIC_TZ, ...opts })

export const sameDay = (iso: string, d: Date) => {
  const x = new Date(iso)
  return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth() && x.getDate() === d.getDate()
}

/**
 * «Dra. Valeria Solórzano» → «Dra. Solórzano», «Dr. Joaquín Membreño Sierra» → «Dr. Membreño»: el título y el primer apellido
 * (en Honduras se usa el primero). Sin título, el primer nombre y el primer apellido si hay dos nombres y dos apellidos.
 */
export function shortStaff(name = '') {
  const m = name.trim().match(/^((?:Dra?|Lic)\.)\s+(.*)$/)
  if (m) {
    const rest = m[2].split(/\s+/)
    return `${m[1]} ${rest.length >= 3 ? rest[rest.length - 2] : rest.at(-1)}`
  }
  const parts = name.trim().split(/\s+/)
  if (parts.length < 3) return name
  return `${parts[0]} ${parts.length >= 4 ? parts[parts.length - 2] : parts.at(-1)}`
}

export const initials = (name: string) =>
  name.replace(/^(Dra?\.|Lic\.)\s*/, '').split(' ').slice(0, 2).map((w) => w[0]).join('')

export const STATUS: Record<ApptStatus, { label: string; tone: string }> = {
  scheduled: { label: 'Programada', tone: 'neutral' },
  confirmed: { label: 'Confirmada', tone: 'ink' },
  arrived: { label: 'En sala', tone: 'amber' },
  triaged: { label: 'Lista para consulta', tone: 'mint' },
  in_consult: { label: 'En consulta', tone: 'ink-solid' },
  // CE1 (ronda 6): forma neutra (no «Atendida» en pacientes hombres)
  done: { label: 'Consulta atendida', tone: 'done' },
  no_show: { label: 'No asistió', tone: 'red' },
  cancelled: { label: 'Cancelada', tone: 'red' },
}

export const bmi = (kg: number, cm: number) => (kg / (cm / 100) ** 2).toFixed(1)

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export const money = (n: number, currency = 'L') =>
  `${currency} ${n.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const METHOD_LABEL = { cash: 'Efectivo', card: 'Tarjeta (POS)', transfer: 'Transferencia', insurance: 'Aseguradora', deposit: 'Depósito', other: 'Otro' } as const

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
/** AD1: número de WhatsApp de la clínica (el marcado; si no, el principal si acepta WhatsApp; si no, el principal). */
export function clinicWhatsapp(s: { phone: string; contacts?: ClinicContact[] }) {
  return s.contacts?.find((c) => c.whatsapp)?.number ?? s.contacts?.find((c) => c.primary && c.type !== 'call')?.number ?? s.phone
}

/** AD1: lo que dicen los membretes: "2232-7710" o, si la clínica lo pidió, "2232-7710 · WhatsApp 9876-5432". */
export function contactLine(s: { phone: string; contacts?: ClinicContact[]; docsWhatsapp?: boolean }) {
  const wa = s.contacts?.find((c) => c.whatsapp)?.number
  const phone = docPhone(s.phone)
  return s.docsWhatsapp && wa && docPhone(wa) !== phone ? `${phone} · WhatsApp ${docPhone(wa)}` : phone
}

/**
 * R13 IM1 pendiente (ronda 17): en los documentos impresos el teléfono va sin el «+504» (formato local, «2232-7710»).
 * Se quita al imprimir: no se cambian los datos guardados de las clínicas.
 */
export const docPhone = (phone: string) => phone.replace(/^\s*\+\s*504[\s-]*/, '').trim()

/** Enlace para llamar desde el teléfono. */
export const telUrl = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`

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

/**
 * Antecedentes en el orden de la historia clínica. `female` marca los gineco-obstétricos.
 * AN2 (ronda 12): los hospitalarios, traumáticos y quirúrgicos van en su propio apartado; tabaquismo, alcoholismo y otras
 * sustancias son un solo campo, «Toxicomanías»; «Actividad física y alimentación» ya no se pide (lo escrito se conserva).
 */
export const BACKGROUND_GROUPS: { title: string; female?: boolean; fields: { key: keyof Background; label: string; date?: boolean; hint?: string }[] }[] = [
  { title: 'Personales patológicos', fields: [
    { key: 'pathological', label: 'Enfermedades' },
    { key: 'medications', label: 'Medicamentos actuales' },
  ] },
  { title: 'Hospitalarios, traumáticos y quirúrgicos', fields: [
    { key: 'hospitalizations', label: 'Hospitalarios' },
    { key: 'traumatic', label: 'Traumáticos' },
    { key: 'surgical', label: 'Quirúrgicos' },
  ] },
  { title: 'Personales no patológicos', fields: [
    { key: 'toxic', label: 'Toxicomanías', hint: 'Tabaco, alcohol y otras sustancias: qué, cuánto y desde cuándo.' },
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

/**
 * AP4 (ronda 13): campos que ya no se piden. Lo escrito no se borra: si un paciente tiene texto, se ve en solo lectura al
 * final de su apartado con «(campo retirado)»; si no tiene, no aparece el rótulo.
 */
export const RETIRED_BACKGROUND: { group: string; key: keyof Background; label: string }[] = [
  { group: 'Personales patológicos', key: 'transfusions', label: 'Transfusionales (campo retirado)' },
  { group: 'Personales no patológicos', key: 'lifestyle', label: 'Actividad física y alimentación (campo retirado)' },
]

/** ME4 (ronda 9): «Nebulización» es una vía aparte; «Inhalada» (inhaladores) no cambia. */
/** AN2 (ronda 12): «Toxicomanías»; si todavía no se escribió, lo que había en tabaquismo, alcoholismo y otras sustancias. */
export function toxicOf(b: Background): string {
  if (b.toxic?.trim()) return b.toxic
  return ([['Tabaquismo', b.smoking], ['Alcoholismo', b.alcohol], ['Otras sustancias', b.drugs]] as [string, string | undefined][])
    .filter(([, v]) => v?.trim()).map(([k, v]) => `${k}: ${v!.trim().replace(/\.$/, '')}.`).join(' ')
}

/** El valor de un campo de antecedentes como se muestra (Toxicomanías se arma con los campos de antes). */
export const backgroundValue = (b: Background, key: keyof Background) => (key === 'toxic' ? toxicOf(b) || undefined : b[key])

/** Las vías de la lista (ME17, ronda 16: con su abreviatura en ROUTE_OPTIONS de clinicalConfig). */
export const ROUTES = ROUTE_OPTIONS.map((r) => r.name)

/** ME17 (ronda 16): ¿la vía es de la lista? (una escrita a mano no lo es). */
export const isKnownRoute = (route = '') => ROUTES.includes(route)

/** ME17: «Intravenosa (IV)»; una vía escrita a mano, tal cual. */
export function routeLabel(route = '') {
  const r = ROUTE_OPTIONS.find((x) => x.name === route)
  return r ? `${r.name} (${r.abbr})` : route
}

/**
 * ME17: lo escrito en «Vía» como se guarda: el nombre de la lista si coincide con el nombre, la abreviatura o «Nombre (ABR)»
 * (sin mayúsculas ni tildes: «iv», «vo», «subcutanea»); si no, el texto libre tal cual (sin espacios de más).
 */
export function canonicalRoute(text = '') {
  const q = normalize(text)
  if (!q) return ''
  const hit = ROUTE_OPTIONS.find((r) => normalize(r.name) === q || normalize(r.abbr) === q || normalize(`${r.name} (${r.abbr})`) === q)
  return hit ? hit.name : text.trim().replace(/\s+/g, ' ')
}

/** ME17: las vías que coinciden con lo escrito, por nombre o abreviatura (primero la abreviatura exacta y lo que empieza igual). */
export function routeMatches(text = '') {
  const q = normalize(text).replace(/[()]/g, '').trim()
  if (!q) return [...ROUTE_OPTIONS]
  const rank = (r: { name: string; abbr: string }) => {
    const n = normalize(r.name); const a = normalize(r.abbr)
    return a === q ? 0 : n.startsWith(q) ? 1 : a.startsWith(q) ? 2 : n.includes(q) || normalize(`${r.name} ${r.abbr}`).includes(q) ? 3 : 9
  }
  return ROUTE_OPTIONS.map((r) => ({ r, k: rank(r) })).filter((x) => x.k < 9).sort((a, b) => a.k - b.k).map((x) => x.r)
}

export const defaultRoute = (presentation = '') =>
  /inhalador/i.test(presentation) ? 'Inhalada' : /crema|ungüento|gel/i.test(presentation) ? 'Tópica' : /gotas oft/i.test(presentation) ? 'Oftálmica' : 'Oral'

/** Texto de una orden médica de medicamento, p. ej. "Azitromicina 500 mg tableta: 1 tableta vía oral cada 24 horas por 3 días." */
/** MC2 (ronda 6): la frecuencia como se lee: «PRN: si dolor» para un PRN con condición; si no, la frecuencia escrita. */
export function frequencyText(i: Pick<PrescriptionItem, 'frequency' | 'prnCondition'>) {
  // ME16 (ronda 16): un PRN con intervalo mínimo («Cada 8 horas si es necesario») lo conserva: «PRN: si dolor, máximo cada 8 h»
  const hours = /cada\s+(\d+)\s*h/i.exec(i.frequency)?.[1]
  return i.prnCondition?.trim() && /necesidad|necesario|\bprn\b/i.test(i.frequency) ? `PRN: ${i.prnCondition.trim()}${hours ? `, máximo cada ${hours} h` : ''}` : i.frequency
}

/** ME16 (ronda 16): «IV en infusión a 125 mL/h», la parte de la infusión en la receta y en la nota de la consulta. */
const infusionText = (i: PrescriptionItem, route: string) => `${route ? `${route} ` : ''}en infusión a ${String(Math.round(i.infusionRate! * 100) / 100)} ${i.infusionUnit === 'ml/min' ? 'mL/min' : 'mL/h'}`

export function medicationOrder(i: PrescriptionItem) {
  if (i.infusionRate) return `${medicationLine(i)}.${i.instructions ? ` ${i.instructions}` : ''}`
  // ME3 y ME4 (ronda 9): primera dosis distinta y nebulización, con el mismo texto de la receta
  if (i.nebulization?.components?.length || i.loadingDose?.trim()) return `${medicationLine(i)}.${i.instructions ? ` ${i.instructions}` : ''}`
  const route = i.route ? ` vía ${isKnownRoute(i.route) ? i.route.toLowerCase() : i.route}` : ''
  const how = /única/i.test(i.frequency) ? '' : i.duration ? ` por ${i.duration}` : ', hasta nueva orden'
  return `${i.drug}${i.presentation ? ` (${i.presentation.toLowerCase()})` : ''}: ${doseText(i.dose)}${route} ${i.prnCondition ? frequencyText(i) : i.frequency.toLowerCase()}${how}.${i.instructions ? ` ${i.instructions}` : ''}`
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

/** Cantidad con su unidad base: «1 g» → 1000 mg, «500 mg», «5 mL», «1 000 000 UI». Una concentración («50 mg/mL») no es cantidad. */
const BASE_UNIT: Record<string, [string, number]> = { g: ['mg', 1000], gr: ['mg', 1000], grs: ['mg', 1000], gramo: ['mg', 1000], gramos: ['mg', 1000], mg: ['mg', 1], mcg: ['mg', 0.001],
  µg: ['mg', 0.001], ug: ['mg', 0.001], ml: ['mL', 1], cc: ['mL', 1], ui: ['UI', 1], u: ['UI', 1] }
function amountOf(text: string) {
  const m = /(\d+(?:[.,]\d+)?)\s*(gramos?|grs?|g|mg|mcg|µg|ug|ml|cc|ui|u)\b(\s*\/\s*(\d+(?:[.,]\d+)?)?\s*(?:ml|cc)\b)?/i.exec(text)
  if (!m) return undefined
  // «50 mg/mL» es concentración (no se sabe cuánto trae); «75 mg/3 mL», lo que trae la ampolla
  if (m[3] && (!m[4] || Number(m[4].replace(',', '.')) === 1)) return undefined
  const [unit, factor] = BASE_UNIT[m[2].toLowerCase()]
  return { value: Number(m[1].replace(',', '.')) * factor, unit }
}

/**
 * ME15 (ronda 15, A2): cantidad de una dosis única (STAT) en unidades de la presentación: «1 g» con «Vial 1 g» → «1 vial»;
 * «2 g» con «Vial 1 g» → «2 viales»; «1 ampolla» → «1 ampolla». Si no se puede saber (concentración sin volumen, unidades
 * distintas, nebulización), undefined: la línea sale sin cantidad.
 */
export function statQuantity(i: Pick<PrescriptionItem, 'dose' | 'presentation' | 'nebulization' | 'loadingDose'>) {
  if (i.nebulization?.components?.length || i.loadingDose?.trim()) return undefined
  const units = (n: number, u: [RegExp, string, string]) => `${n} ${n === 1 ? u[1] : u[2]}`
  const counted = i.dose.trim().match(/^(\d+(?:[.,]\d+)?|1\/2|½)\s+(\S+)/)
  const byDose = counted && COUNTABLE.find(([re]) => re.test(counted[2]))
  if (counted && byDose) {
    const n = Math.ceil(counted[1] === '1/2' || counted[1] === '½' ? 0.5 : Number(counted[1].replace(',', '.')))
    return n > 0 ? units(n, byDose) : undefined
  }
  const form = COUNTABLE.find(([re]) => re.test(i.presentation.trim()))
  const per = amountOf(i.presentation)
  const dose = amountOf(i.dose)
  if (!form || !per || !dose || per.unit !== dose.unit || per.value <= 0) return undefined
  const n = Math.ceil(dose.value / per.value - 1e-9)
  return n > 0 && n <= 50 ? units(n, form) : undefined
}

/**
 * ME15 (ronda 15): la receta de una consulta externa lleva TODOS sus medicamentos, con o sin ingreso. Los «Aplicar en la
 * clínica» van con su leyenda (A1) y, si no la tienen escrita, con su cantidad: la «Cantidad a comprar» manda; en una dosis
 * STAT, las unidades de una dosis; si no, la del total de días; si no se puede calcular, sin cantidad (A2).
 */
export function consultRxItems(items: PrescriptionItem[]): PrescriptionItem[] {
  return items.map((it) => {
    if (!it.applyInClinic) return it
    const quantity = it.quantity?.trim() || (/única/i.test(it.frequency) ? statQuantity(it) : autoQuantity(it)) || undefined
    return { ...it, quantity, legend: it.buyOutside ? RX_LEGEND_BUY_AND_BRING : RX_LEGEND_IN_CLINIC }
  })
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
  const freq = i.prnCondition?.trim() ? frequencyText(i) : i.frequency.replace(/^Cada (\d+) horas?$/i, 'cada $1 h').replace(/^Dosis única$/i, 'dosis única').replace(/^Según necesidad$/i, 'según necesidad')
  const once = /dosis única/i.test(i.frequency)
  // ME17 (ronda 16): una vía escrita a mano sale tal cual («Intraósea»)
  const route = i.route ? ROUTE_SHORT[i.route] ?? (isKnownRoute(i.route) ? i.route.toLowerCase() : i.route) : ''
  const days = !once ? (i.duration ? ` por ${i.duration}` : ' hasta nueva orden') : ''
  // ME16 (ronda 16): «Solución salina 0.9 % 1000 mL bolsa — 1000 mL IV en infusión a 125 mL/h hasta nueva orden»
  if (i.infusionRate) return `${i.drug}${i.presentation ? ` ${presentationShort(i.presentation)}` : ''} — ${[doseText(i.dose), infusionText(i, route), i.duration ? `por ${i.duration}` : 'hasta nueva orden'].filter(Boolean).join(' ')}`
  // ME4 (ronda 9): una sola línea para la nebulización, con el mismo generador que las notas
  if (i.nebulization?.components?.length) return `${nebulizationLine(i.nebulization, freq)}${days}`
  // ME3 (ronda 9): primera dosis distinta, el mismo texto de ME2 («Ceftriaxona IM · 2 g STAT y luego 1 g c/12h»)
  const hours = /cada\s+(\d+)\s*h/i.exec(i.frequency)?.[1]
  if (i.loadingDose?.trim() && hours && !isPrnFrequency(i.frequency)) return `${loadingLine(i.drug, ROUTE_ABBR[i.route ?? ''] ?? route, i.loadingDose, i.dose, `c/${hours}h`)}${days}`
  const how = [doseText(i.dose), route, freq, !once ? (i.duration ? `por ${i.duration}` : 'hasta nueva orden') : ''].filter(Boolean).join(' ')
  return `${i.drug}${i.presentation ? ` ${presentationShort(i.presentation)}` : ''} — ${how}`
}

/** Número que identifica el expediente en documentos: la identidad si la clínica así lo configuró. */
export const recordNumber = (p: Pick<Patient, 'record' | 'dni'>, s: { recordUsesDni: boolean }) => (s.recordUsesDni && p.dni ? p.dni : p.record)

/** Valor de un campo de fecha y hora (DateTimeField): «aaaa-mm-ddTHH:mm» en la hora de Honduras. */
export const inputDateTime = (d: Date) => toLocalValue(d)

export const dateTime = (iso: string) => `${date(iso, { day: 'numeric', month: 'short' })}, ${time(iso)}`

/** "CIE-10" en los diagnósticos registrados antes de la CIE-11; nada en los nuevos ni en los sin código. */
export const legacyTag = (d: Diagnosis) => (!d.system && d.code !== 'S/C' ? 'CIE-10' : '')

/** Código como se imprime: "CA02", "sin código" o "J02 (CIE-10)". */
export const dxCode = (d: Diagnosis) => (d.code === 'S/C' ? 'sin código' : legacyTag(d) ? `${d.code}, CIE-10` : d.code)

/**
 * Examen físico sin las etiquetas vacías de la guía por sistemas ("Abdomen:" sin nada después). Si no queda
 * nada escrito, devuelve "".
 */
export const examText = (exam = '') => exam.split(/\r?\n/).filter((l) => !/^\s*[^:\n]{2,40}:\s*$/.test(l)).join('\n').trim()

/** dd/mm/aaaa de una fecha ISO, en la hora local (ronda 8: formato de Honduras, sin depender del idioma del navegador). */
export const dmy = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (m) return `${m[3]}/${m[2]}/${m[1]}`
  const p = clinicParts(new Date(iso))
  const z = (n: number) => String(n).padStart(2, '0')
  return `${z(p.d)}/${z(p.mo)}/${p.y}`
}
/** dd/mm/aaaa HH:mm (24 horas). */
export const dmyTime = (iso: string) => `${dmy(iso)} ${time(iso)}`
