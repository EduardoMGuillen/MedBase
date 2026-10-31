import type { Dose, InpatientFile, InpatientMed, InpatientNote, OrderLine, OrderLineTag, OrderMark } from './types.js'
import { normalize } from './patients.js'

/**
 * Horario de medicamentos en hospitalización. Lo usan el servidor (para validar que la dosis que
 * marca enfermería corresponde a una hora indicada) y la hoja de medicamentos (para dibujarla).
 */

export const HOUR = 3_600_000

/** Frecuencias que el médico puede indicar. `null` es dosis única. */
export const INPATIENT_FREQUENCIES: { label: string; hours: number | null }[] = [
  { label: 'Cada 4 horas', hours: 4 }, { label: 'Cada 6 horas', hours: 6 }, { label: 'Cada 8 horas', hours: 8 },
  { label: 'Cada 12 horas', hours: 12 }, { label: 'Cada 24 horas', hours: 24 }, { label: 'Dosis única', hours: null },
]

export const ROUTE_ABBR: Record<string, string> = {
  Intravenosa: 'IV', Intramuscular: 'IM', Subcutánea: 'SC', Oral: 'VO', Sublingual: 'SL', Inhalada: 'inhalada', Tópica: 'tópica', Rectal: 'rectal',
}

type Schedulable = Pick<InpatientMed, 'firstAt' | 'everyHours' | 'prn' | 'stoppedAt'> & { days?: number }

/** Cuándo termina una orden con días ("por 3 días"): vence sola. Sin días, hasta nueva orden (Infinity). */
export const courseEnd = (m: Pick<Schedulable, 'firstAt' | 'days'>) => (m.days ? new Date(m.firstAt).getTime() + m.days * 24 * HOUR : Infinity)

/** ¿Ya terminó sus días? */
export const courseDone = (m: Pick<Schedulable, 'firstAt' | 'days'>, now = new Date()) => courseEnd(m) <= now.getTime()

/** Cómo se escribe en la nota: "Ondansetrón 8 mg IV c/8h", "Tramadol 50 mg SC c/12h PRN". */
export function medLabel(m: Pick<InpatientMed, 'drug' | 'dose' | 'route' | 'everyHours' | 'prn'> & { prnCondition?: string }) {
  const freq = m.everyHours ? `c/${m.everyHours}h` : m.prn ? '' : 'dosis única'
  // MC2 (ronda 6): «PRN · si dolor»
  const prn = m.prn ? (m.prnCondition?.trim() ? `PRN · ${m.prnCondition.trim()}` : 'PRN') : ''
  return [m.drug, m.dose, ROUTE_ABBR[m.route] ?? m.route.toLowerCase(), freq, prn].filter(Boolean).join(' ')
}

/**
 * Horas indicadas entre `from` (incluida) y `to` (excluida). Las que caen después de que se omitió
 * el medicamento se devuelven marcadas, para que la hoja muestre que ya no se aplican.
 */
export function doseTimes(m: Schedulable, from: Date, to: Date): { at: Date; omitted: boolean }[] {
  if (m.prn) return []
  const first = new Date(m.firstAt).getTime()
  const stop = m.stoppedAt ? new Date(m.stoppedAt).getTime() : Infinity
  // Con días, después del último día ya no hay dosis (la orden venció, no se omitió)
  const until = Math.min(to.getTime(), courseEnd(m))
  const out: { at: Date; omitted: boolean }[] = []
  if (!m.everyHours) {
    if (first >= from.getTime() && first < until) out.push({ at: new Date(first), omitted: first >= stop })
    return out
  }
  const step = m.everyHours * HOUR
  let t = first < from.getTime() ? first + Math.ceil((from.getTime() - first) / step) * step : first
  for (; t < until; t += step) out.push({ at: new Date(t), omitted: t >= stop })
  return out
}

/** ¿Es `at` una de las horas indicadas y todavía vigente? */
export function isScheduled(m: Schedulable, at: Date) {
  if (m.prn) return false
  const t = at.getTime()
  const first = new Date(m.firstAt).getTime()
  if (t < first || t >= courseEnd(m) || (m.stoppedAt && t >= new Date(m.stoppedAt).getTime())) return false
  return m.everyHours ? (t - first) % (m.everyHours * HOUR) === 0 : t === first
}

/** Minutos de tolerancia antes de considerar atrasada una dosis. */
export const LATE_AFTER_MIN = 60

export type SlotState = 'given' | 'skipped' | 'omitted' | 'late' | 'due' | 'upcoming'

export function slotState(at: Date, omitted: boolean, dose: Dose | undefined, now = new Date()): SlotState {
  if (dose) return dose.status
  if (omitted) return 'omitted'
  const diff = (now.getTime() - at.getTime()) / 60_000
  if (diff > LATE_AFTER_MIN) return 'late'
  if (diff >= -30) return 'due'
  return 'upcoming'
}

/** Ruta del expediente de una estancia: observación u hospitalización. */
export const stayPath = (h: { id: string; kind?: string }) => `/app/${h.kind === 'observation' ? 'observacion' : 'hospitalizados'}/${h.id}`

/** Tiempo transcurrido legible: "4 h 20 min", "35 min", "1 d 3 h". */
export function elapsed(minutes: number) {
  const m = Math.max(0, minutes)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} h${m % 60 ? ` ${m % 60} min` : ''}`
  return `${Math.floor(h / 24)} d${h % 24 ? ` ${h % 24} h` : ''}`
}

/** Horas entre dosis de una frecuencia de la receta ("Cada 8 horas" → 8). Dosis única y PRN sin intervalo: undefined. */
export function frequencyHours(frequency: string) {
  const m = frequency.match(/cada\s+(\d+)\s*h/i)
  return m ? Number(m[1]) : undefined
}

/** Días de un tratamiento escrito como "5 días", "1 semana" o "10". Sin número (o "hasta nueva orden"): undefined. */
export function durationDays(duration?: string) {
  const t = (duration ?? '').trim().toLowerCase()
  const m = t.match(/(\d+)\s*(d[ií]as?|semanas?|meses?|mes)?/)
  if (!m) return undefined
  const n = Number(m[1])
  if (!n) return undefined
  return /semana/.test(m[2] ?? '') ? n * 7 : /mes/.test(m[2] ?? '') ? n * 30 : n
}

/** Un medicamento sin días queda "hasta nueva orden"; con días, se cuenta "Día N de M". */
export function treatmentDay(m: Pick<InpatientMed, 'firstAt' | 'days'>, now = new Date()) {
  if (courseDone(m, now)) return `Completó ${m.days} ${m.days === 1 ? 'día' : 'días'}`
  const n = Math.max(1, stayDay(m.firstAt, now))
  return m.days ? `Día ${n} de ${m.days}` : `Día ${n} · Hasta nueva orden`
}

/** Día de estancia: el día del ingreso es el día 1. */
export function stayDay(admittedAt: string, now = new Date()) {
  const a = new Date(admittedAt); a.setHours(0, 0, 0, 0)
  const b = new Date(now); b.setHours(0, 0, 0, 0)
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1
}

/** Edad cumplida en años, para reglas como la identidad obligatoria en recetas de adultos. */
export function yearsOld(birthDate: string, now = new Date()) {
  const b = new Date(`${birthDate.slice(0, 10)}T12:00:00`)
  let y = now.getFullYear() - b.getFullYear()
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) y--
  return y
}

/** Última marca de una orden: si es 'check', la orden está revisada. */
export function orderMark(marks: OrderMark[], noteId: string, index: number): OrderMark | undefined {
  let last: OrderMark | undefined
  for (const m of marks) if (m.noteId === noteId && m.index === index && (!last || m.at >= last.at)) last = m
  return last
}

/** Órdenes de notas con checklist que enfermería todavía no revisa, de la más antigua a la más reciente. */
export function pendingOrdersOf(file: Pick<InpatientFile, 'notes' | 'marks'>) {
  const out: { note: InpatientNote; index: number; text: string }[] = []
  for (const n of [...file.notes].sort((a, b) => a.at.localeCompare(b.at))) {
    if (!n.checklist) continue
    n.orders?.forEach((text, index) => { if (orderMark(file.marks, n.id, index)?.action !== 'check') out.push({ note: n, index, text }) })
  }
  return out
}

/** Órdenes que deben leerse en la nota: las guardadas, o si no hay, los medicamentos vigentes en ese momento. */
export function noteOrders(n: InpatientNote, file: Pick<InpatientFile, 'meds'>): string[] {
  if (n.kind !== 'admission' && n.kind !== 'evolution') return []
  if (n.orders && n.orders.length) return n.orders
  const lines: string[] = []
  for (const m of file.meds) {
    if (m.orderedAt > n.at) continue
    if (m.stoppedAt && m.stoppedAt < n.at) continue
    if (m.stoppedAt === n.at) lines.push(`OMITIR ${m.drug}`)
    else lines.push(medLabel(m))
  }
  return lines
}

/**
 * Órdenes de una nota como en papel: los medicamentos van con la nota (columna izquierda) y las indicaciones
 * que no son medicamento, numeradas, a la derecha. Cada orden conserva su posición en la nota, que es la que
 * usa el checklist de enfermería. Las notas nuevas guardan cuántas indicaciones van primero; en las
 * anteriores se reconoce el medicamento por su nombre.
 */
export function splitOrders(n: InpatientNote, file: Pick<InpatientFile, 'meds'>): { meds: { text: string; index: number; tag?: OrderLineTag }[]; indications: { text: string; index: number; tag?: OrderLineTag }[] } {
  // MC7 (ronda 6): con el cuadro completo, cada línea lleva su etiqueta (Continúa, Nueva, Modificada u Omitida)
  if (n.lines?.length) {
    const all = n.lines.map((l, index) => ({ text: l.text, index, tag: l.tag, kind: l.kind }))
    return { indications: all.filter((l) => l.kind === 'ind'), meds: all.filter((l) => l.kind === 'med') }
  }
  const all = noteOrders(n, file).map((text, index) => ({ text, index }))
  if (n.indicationCount != null) return { meds: all.slice(n.indicationCount), indications: all.slice(0, n.indicationCount) }
  const drugs = file.meds.map((m) => normalize(m.drug))
  const isMed = (t: string) => t.startsWith('OMITIR ') || drugs.some((d) => normalize(t).startsWith(d))
  return { meds: all.filter((o) => isMed(o.text)), indications: all.filter((o) => !isMed(o.text)) }
}

/** La epicrisis vigente de la estancia (borrador o emitida), si hay. */
export const currentEpicrisis = (file: Pick<InpatientFile, 'epicrises'>) => [...(file.epicrises ?? [])].reverse().find((e) => e.status !== 'voided')

/** Diagnóstico actual de la estancia: el de la última nota que registró diagnósticos o, si ninguna, el de ingreso. */
export function currentDiagnoses(file: Pick<InpatientFile, 'notes' | 'hospitalization'>) {
  const last = file.notes.filter((n) => n.diagnoses?.length).sort((a, b) => b.at.localeCompare(a.at))[0]
  return last?.diagnoses ?? file.hospitalization.diagnoses
}

/** AD3: especialidad que se propone para un ingreso: la del médico que ingresa; si no tiene, "Medicina general". */
export const defaultSpecialty = (u?: { specialty?: string } | null) => u?.specialty?.trim() || 'Medicina general'

// ---------- MC7 (ronda 6): la cadena de indicaciones y medicamentos de nota en nota ----------

export const LINE_TAG: Record<OrderLineTag, string> = { continue: 'Continúa', new: 'Nueva', modified: 'Modificada', omitted: 'Omitida' }

/** La última nota de la cadena: ingreso o evolución. Las de procedimiento no llevan órdenes y no la cortan. */
export function chainNote(file: Pick<InpatientFile, 'notes'>) {
  return [...file.notes].filter((n) => n.kind === 'admission' || n.kind === 'evolution').sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)).at(-1)
}

/**
 * Indicaciones vigentes (las que no son medicamento) que bajan a la nota siguiente, cada una con su identificador estable:
 * las de la última nota de la cadena que no se omitieron ni se cerraron al cambiarlas; si todavía no hay notas, las de la
 * consulta externa que ingresó al paciente. Las notas de antes de esta ronda se leen por su texto. El egreso cierra la estancia.
 */
export function activeIndications(file: Pick<InpatientFile, 'notes' | 'meds' | 'hospitalization'> & Partial<Pick<InpatientFile, 'consultIndications'>>): { id: string; text: string }[] {
  if (file.hospitalization.status !== 'active') return []
  const last = chainNote(file)
  if (!last) return (file.consultIndications ?? []).map((text, i) => ({ id: `${file.hospitalization.consultationId ?? 'consulta'}:${i}`, text }))
  if (last.lines) return last.lines.filter((l) => l.kind === 'ind' && (l.tag === 'continue' || l.tag === 'new')).map((l) => ({ id: l.id, text: l.text }))
  return splitOrders(last, file).indications.filter((o) => !o.text.startsWith('OMITIR ')).map((o) => ({ id: `${last.id}:${o.index}`, text: o.text }))
}

/** Decisión del médico sobre una indicación que bajó: sigue, se omite o se cambia por otro texto. */
export type IndicationDecision = { id: string; action: 'continue' | 'omit' | 'change'; text?: string }

/**
 * Las líneas de indicaciones de una nota nueva: todas las vigentes (Continúa, Omitida o Modificada + la Nueva que la
 * reemplaza) y, al final, las nuevas. `newId` da el identificador de cada línea nueva.
 */
export function indicationLines(active: { id: string; text: string }[], decisions: IndicationDecision[], added: string[], newId: () => string): OrderLine[] {
  const out: OrderLine[] = []
  for (const a of active) {
    const d = decisions.find((x) => x.id === a.id)
    if (d?.action === 'omit') out.push({ id: a.id, kind: 'ind', text: a.text, tag: 'omitted' })
    else if (d?.action === 'change' && d.text?.trim() && d.text.trim() !== a.text) {
      out.push({ id: a.id, kind: 'ind', text: a.text, tag: 'modified' })
      out.push({ id: newId(), kind: 'ind', text: d.text.trim(), tag: 'new', replaces: a.id })
    } else out.push({ id: a.id, kind: 'ind', text: a.text, tag: 'continue' })
  }
  for (const t of added) out.push({ id: newId(), kind: 'ind', text: t, tag: 'new' })
  return out
}

/** Texto de una línea como orden del checklist: la omitida se lee «OMITIR …», como los medicamentos de antes. */
export const lineOrder = (l: OrderLine) => (l.tag === 'omitted' ? `OMITIR ${l.text}` : l.text)
