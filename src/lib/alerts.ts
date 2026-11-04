import { doseTimes, medLabel, pendingOrdersOf, slotState } from './inpatient'
import { time } from './format.js'
import { activeVitals, currentVitalsMode, missedTakes, tempClass, vitalsModeShort, type TempBand } from './vitalsSheet'
import { examLine, GROUP_LABEL, isPending } from './exams'
import type { ExamGroup, InpatientFile } from './types'

/**
 * EN2: alertas del expediente agrupadas (una línea por tipo y elemento, con conteo) y con tres niveles:
 * crítico (rojo), pendiente (ámbar) e informativo (gris azulado). Cada una lleva su acción directa.
 */
export type AlertLevel = 'critical' | 'pending' | 'info'
export type AlertTab = 'sheet' | 'vitals' | 'notes' | 'meds' | 'nursing' | 'labs' | 'annexes'
/** A dónde lleva la acción: una pestaña (con lo que hay que abrir en ella) o algo del propio expediente. */
export type AlertGo =
  | { tab: AlertTab; dose?: { medId: string; at: string }; record?: boolean; recordPast?: boolean }
  | { action: 'sign' | 'bed' }
export interface FileAlert {
  key: string
  level: AlertLevel
  /** Pestaña a la que pertenece (para su contador). */
  tab: AlertTab
  text: string
  count: number
  /** Desde cuándo está pendiente (ms): ordena dentro del mismo nivel, lo más viejo primero. */
  since: number
  action: { label: string; go: AlertGo }
  /** EN2 (ronda 6): una segunda acción, como «Registrar tomas anteriores». */
  secondary?: { label: string; go: AlertGo }
}

/** Órdenes nuevas sin revisar por más de este tiempo pasan a críticas. */
export const ORDERS_CRITICAL_MIN = 30
export const LEVEL_RANK: Record<AlertLevel, number> = { critical: 0, pending: 1, info: 2 }
export const LEVEL_LABEL: Record<AlertLevel, [string, string]> = { critical: ['crítica', 'críticas'], pending: ['pendiente', 'pendientes'], info: ['aviso', 'avisos'] }

const HOUR = 3_600_000
const hm = (t: number | string | Date) => time(new Date(t).toISOString())
/** Hora, y la fecha si no es de hoy. */
/** «31/10», siempre con dos cifras. */
const ddmm = (t: number | Date) => { const d = new Date(t); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` }
const when = (t: number, now: Date) => new Date(t).toDateString() === now.toDateString() ? hm(t) : `${hm(t)} del ${new Date(t).toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit' })}`
const list = (xs: string[], max = 4) => xs.length > max ? `${xs.slice(0, max).join(', ')} y ${xs.length - max} más` : xs.join(', ')
/** «a, b y c» (con «y 3 más» si son muchas). */
const listAnd = (xs: string[], max = 4) => xs.length > max + 1 ? `${xs.slice(0, max).join(', ')} y ${xs.length - max} más` : xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}` : xs.join('')
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

type AlertFile = Pick<InpatientFile, 'hospitalization' | 'notes' | 'marks' | 'meds' | 'doses' | 'vitals' | 'consultOrders' | 'authorizations'> & Partial<Pick<InpatientFile, 'exams'>>

export function fileAlerts(file: AlertFile, band: TempBand, now: Date, opts: { nameOf?: (id: string) => string | undefined
  /** Ronda 12 (IM2): el radiólogo solo ve los avisos de sus estudios (nada de signos, medicamentos ni órdenes). */
  groups?: ExamGroup[] } = {}): FileAlert[] {
  const h = file.hospitalization
  if (h.status !== 'active') return []
  const out: FileAlert[] = []
  const t = now.getTime()
  const day = t - 24 * HOUR

  // Temperatura: si la última toma tiene fiebre o hipotermia es crítica; si ya se normalizó, queda como aviso
  const temps = activeVitals(file.vitals ?? []).filter((v) => v.temperature != null && new Date(v.takenAt).getTime() >= day)
  const lastTemp = temps.at(-1)
  const bad = [...temps].reverse().find((v) => tempClass(v.temperature!, band) !== 'normal')
  if (bad) {
    const kind = tempClass(bad.temperature!, band) === 'fever' ? 'Fiebre' : 'Hipotermia'
    const at = new Date(bad.takenAt).getTime()
    if (bad === lastTemp) {
      out.push({ key: 'temp', level: 'critical', tab: 'vitals', text: `${kind}: ${bad.temperature!.toFixed(1)} °C a las ${when(at, now)}`, count: 1, since: at, action: { label: 'Registrar signos', go: { tab: 'vitals', record: true } } })
    } else {
      out.push({ key: 'temp', level: 'info', tab: 'vitals', text: `${kind} de ${bad.temperature!.toFixed(1)} °C a las ${when(at, now)}; la última toma (${lastTemp!.temperature!.toFixed(1)} °C, ${hm(lastTemp!.takenAt)}) es normal`, count: 1, since: at, action: { label: 'Ver curva', go: { tab: 'vitals' } } })
    }
  }

  // Tomas de signos esperadas sin registrar, desde el ingreso: no caducan, se resuelven registrando la toma (con su hora)
  const missed = missedTakes(file, now)
  if (missed.length) {
    // EN2 (ronda 6): cada hora con su fecha («23:00 del 30/10 y 07:00 del 31/10»)
    out.push({ key: 'vitals-missed', level: 'pending', tab: 'vitals', text: `Signos vitales: ${plural(missed.length, 'toma pendiente', 'tomas pendientes')} (${listAnd(missed.map((s) => `${hm(s)} del ${ddmm(s)}`))}) · ${vitalsModeShort(currentVitalsMode(file))}`, count: missed.length, since: missed[0].getTime(),
      action: { label: 'Registrar signos', go: { tab: 'vitals', record: true } }, secondary: { label: 'Registrar tomas anteriores', go: { tab: 'vitals', recordPast: true } } })
  }

  // Dosis atrasadas desde que empezó la orden, agrupadas por medicamento: no caducan; se registran o se marcan «No aplicada»
  for (const m of file.meds.filter((x) => !x.prn)) {
    const late = doseTimes(m, new Date(m.firstAt), new Date(t + HOUR)).filter((s) => {
      const dose = file.doses.find((d) => d.medId === m.id && d.scheduledAt && new Date(d.scheduledAt).getTime() === s.at.getTime())
      return slotState(s.at, s.omitted, dose, now, m.everyHours) === 'late'
    })
    if (!late.length) continue
    out.push({ key: `late-${m.id}`, level: 'pending', tab: 'meds', text: `${medLabel(m)}: ${plural(late.length, 'dosis atrasada', 'dosis atrasadas')} (${list(late.map((s) => when(s.at.getTime(), now)))})`,
      count: late.length, since: late[0].at.getTime(), action: { label: 'Registrar dosis', go: { tab: 'meds', dose: { medId: m.id, at: late[0].at.toISOString() } } } })
  }

  // EN3 (ronda 6): una dosis en estado final (No aplicada u Omitida, con su motivo) no genera aviso: queda sólo en la hoja,
  // con su color y su motivo, y en la bitácora. Tampoco la atrasada que se cerró sola al llegar la siguiente dosis.

  // Órdenes médicas sin revisar por enfermería, por nota: críticas si llevan más de ORDERS_CRITICAL_MIN
  const byNote = new Map<string, { at: string; author: string; n: number }>()
  for (const o of pendingOrdersOf(file)) {
    const x = byNote.get(o.note.id) ?? { at: o.note.at, author: o.note.authorId, n: 0 }
    x.n++
    byNote.set(o.note.id, x)
  }
  for (const [noteId, x] of byNote) {
    const at = new Date(x.at).getTime()
    const old = t - at > ORDERS_CRITICAL_MIN * 60_000
    const who = opts.nameOf?.(x.author)
    out.push({ key: `orders-${noteId}`, level: old ? 'critical' : 'pending', tab: 'notes', text: `${plural(x.n, 'orden nueva sin revisar', 'órdenes nuevas sin revisar')}${who ? ` de ${who}` : ''} (${when(at, now)})${old ? `, hace más de ${ORDERS_CRITICAL_MIN} min` : ''}`,
      count: x.n, since: at, action: { label: 'Ver orden', go: { tab: 'notes' } } })
  }

  // Exámenes: pendientes por grupo (pendiente) y resultados por revisar (aviso). Ronda 12 (LB3): sin umbrales críticos.
  const exams = (file.exams ?? []).filter((e) => e.status !== 'cancelled' && (!opts.groups || opts.groups.includes(e.group)))
  // DP2 (ronda 11): el departamento marcó «No se realizó»: sigue pendiente; el médico decide si lo cancela
  for (const e of exams.filter((x) => x.notDone && isPending(x))) {
    out.push({ key: `notdone-${e.id}`, level: 'pending', tab: 'labs', text: `No se realizó ${examLine(e)}: ${e.notDone!.reason}`, count: 1,
      since: new Date(e.notDone!.at).getTime(), action: { label: 'Ver exámenes', go: { tab: 'labs' } } })
  }
  for (const g of ['lab', 'imaging'] as ExamGroup[]) {
    // MC5 (ronda 5): lo externo no es un pendiente de la clínica
    const pend = exams.filter((e) => e.group === g && isPending(e) && e.area !== 'none').sort((a, b) => Number(b.priority === 'urgent') - Number(a.priority === 'urgent') || a.orderedAt.localeCompare(b.orderedAt))
    if (!pend.length) continue
    const urgent = pend.filter((e) => e.priority === 'urgent').length
    out.push({ key: `exams-${g}`, level: 'pending', tab: 'labs', text: `${GROUP_LABEL[g]}: ${plural(pend.length, 'examen pendiente', 'exámenes pendientes')}${urgent ? ` (${urgent} urgente${urgent > 1 ? 's' : ''})` : ''}: ${list(pend.map(examLine), 3)}`,
      count: pend.length, since: new Date(pend[0].orderedAt).getTime(), action: { label: 'Ver exámenes', go: { tab: 'labs' } } })
  }
  const toReview = exams.filter((e) => e.status === 'result')
  if (toReview.length) {
    out.push({ key: 'exams-review', level: 'info', tab: 'labs', text: `${plural(toReview.length, 'resultado listo', 'resultados listos')} por revisar: ${list(toReview.map(examLine), 3)}`,
      count: toReview.length, since: new Date(toReview[0].result?.at ?? toReview[0].orderedAt).getTime(), action: { label: 'Ver resultados', go: { tab: 'labs' } } })
  }

  // Autorizaciones pendientes de firma y cama sin asignar
  for (const a of file.authorizations.filter((x) => x.status === 'pending')) {
    const hosp = a.template === 'hospital'
    const doctorOnly = a.signing?.action === 'accept'
    out.push({ key: `auth-${a.id}`, level: 'pending', tab: 'annexes', text: hosp ? (doctorOnly ? 'Autorización de hospitalización: ya firmó el paciente, falta la firma del médico' : 'Autorización de hospitalización pendiente de firma')
      : `Autorización quirúrgica pendiente de firma${a.data.procedure ? `: ${a.data.procedure}` : ''}`, count: 1, since: new Date(a.createdAt).getTime(),
      action: hosp && !doctorOnly ? { label: 'Firmar ahora', go: { action: 'sign' } } : { label: 'Ir a Anexos', go: { tab: 'annexes' } } })
  }
  if (h.kind !== 'observation' && !h.bedId) {
    out.push({ key: 'bed', level: 'pending', tab: 'sheet', text: `Falta asignar la cama${h.companionName ? '' : ' y anotar al acompañante'}`, count: 1, since: new Date(h.admittedAt).getTime(), action: { label: 'Asignar cama', go: { action: 'bed' } } })
  }

  return (opts.groups ? out.filter((a) => a.tab === 'labs') : out).sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || a.since - b.since)
}

/** "2 críticas · 3 pendientes · 1 aviso". */
export function alertSummary(alerts: FileAlert[]) {
  return (['critical', 'pending', 'info'] as AlertLevel[]).map((l) => {
    const n = alerts.filter((a) => a.level === l).length
    return n ? `${n} ${LEVEL_LABEL[l][n === 1 ? 0 : 1]}` : ''
  }).filter(Boolean).join(' · ')
}

/** Contador de cada pestaña: suma lo crítico y lo pendiente (los avisos no cuentan), con el nivel más alto. */
export function tabCounts(alerts: FileAlert[]) {
  const out: Partial<Record<AlertTab, { n: number; level: AlertLevel }>> = {}
  for (const a of alerts) {
    if (a.level === 'info') continue
    const c = out[a.tab] ?? { n: 0, level: a.level }
    c.n += a.count
    if (LEVEL_RANK[a.level] < LEVEL_RANK[c.level]) c.level = a.level
    out[a.tab] = c
  }
  return out
}

/** Parámetros de la URL del expediente para que una acción abra el lugar exacto (desde otra pantalla). */
export const TAB_PARAM: Record<AlertTab, string> = { sheet: 'hoja', vitals: 'signos', notes: 'notas', meds: 'medicamentos', nursing: 'enfermeria', labs: 'examenes', annexes: 'anexos' }
export function alertQuery(go: AlertGo) {
  const q = new URLSearchParams()
  if ('action' in go) {
    if (go.action === 'sign') q.set('firmar', '1'); else q.set('completar', '1')
    return q.toString()
  }
  q.set('tab', TAB_PARAM[go.tab])
  if (go.dose) { q.set('dosis', go.dose.medId); q.set('hora', go.dose.at) }
  if (go.record) q.set('registrar', '1')
  if (go.recordPast) q.set('registrar', 'anteriores')
  return q.toString()
}
