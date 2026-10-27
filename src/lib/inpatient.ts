import type { Dose, InpatientFile, InpatientMed, InpatientNote, OrderMark } from './types.js'
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
export function medLabel(m: Pick<InpatientMed, 'drug' | 'dose' | 'route' | 'everyHours' | 'prn'>) {
  const freq = m.everyHours ? `c/${m.everyHours}h` : m.prn ? '' : 'dosis única'
  return [m.drug, m.dose, ROUTE_ABBR[m.route] ?? m.route.toLowerCase(), freq, m.prn ? 'PRN' : ''].filter(Boolean).join(' ')
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

export interface MedAlert { level: 'bad' | 'warn'; text: string }

/** Dosis no administradas y atrasadas, para el expediente de médicos y enfermería. */
export function collectMedAlerts(file: InpatientFile, now = new Date()): MedAlert[] {
  const out: MedAlert[] = []
  for (const d of file.doses) {
    if (d.status !== 'skipped') continue
    const m = file.meds.find((x) => x.id === d.medId)
    const when = new Date(d.givenAt).toLocaleString('es-HN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
    out.push({ level: 'bad', text: `No se administró ${m ? medLabel(m) : 'un medicamento'} (${when})${d.note ? `. ${d.note}` : ''}` })
  }
  if (file.hospitalization.status === 'active') {
    const start = new Date(now); start.setHours(0, 0, 0, 0)
    const end = new Date(start); end.setDate(end.getDate() + 1)
    for (const m of file.meds.filter((x) => !x.stoppedAt && !x.prn)) {
      for (const s of doseTimes(m, start, end)) {
        const dose = file.doses.find((d) => d.medId === m.id && d.scheduledAt && new Date(d.scheduledAt).getTime() === s.at.getTime())
        if (slotState(s.at, s.omitted, dose, now) === 'late') {
          const hh = s.at.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit', hour12: false })
          out.push({ level: 'warn', text: `Atrasada: ${medLabel(m)} de las ${hh}` })
        }
      }
    }
  }
  return out
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
export function splitOrders(n: InpatientNote, file: Pick<InpatientFile, 'meds'>) {
  const all = noteOrders(n, file).map((text, index) => ({ text, index }))
  if (n.indicationCount != null) return { meds: all.slice(n.indicationCount), indications: all.slice(0, n.indicationCount) }
  const drugs = file.meds.map((m) => normalize(m.drug))
  const isMed = (t: string) => t.startsWith('OMITIR ') || drugs.some((d) => normalize(t).startsWith(d))
  return { meds: all.filter((o) => isMed(o.text)), indications: all.filter((o) => !isMed(o.text)) }
}

/** La epicrisis vigente de la estancia (borrador o emitida), si hay. */
export const currentEpicrisis = (file: Pick<InpatientFile, 'epicrises'>) => [...(file.epicrises ?? [])].reverse().find((e) => e.status !== 'voided')
