import { ANESTHESIA_SHEET, ANESTHESIA_TECHNIQUE_OF, SURGICAL_TEAM } from './clinicalConfig.js'
import type { Diagnosis, PostopData } from './types.js'

/**
 * PQ3 (ronda 14): hoja de anestesia ligada a la nota postquirúrgica. Se sube en papel (fotos o PDF) o la llena y firma en el
 * sistema quien hizo la anestesia. Contenido: Anexo B del pedido.
 */

/** Un registro del monitoreo transanestésico (hora «HH:mm» y signos). Al imprimir se dibuja en la cuadrícula. */
export interface MonitorRow { id: string; time: string; sys: string; dia: string; hr: string; spo2: string; etco2: string; temp: string }
export interface DrugRow { id: string; category: string; drug: string; dose: string; route: string; time: string }
export type AldreteKey = (typeof ANESTHESIA_SHEET.aldrete)[number]['key']
export type TimeKey = (typeof ANESTHESIA_SHEET.times)[number]['key']

/** Lo que se escribe en «Llenar en el sistema». Todo es texto (lo que se escribió), salvo las marcas. */
export interface AnesthesiaData {
  date: string
  room: string
  weightKg: string
  heightCm: string
  scheduled: string
  preDiagnosis: string
  proposedSurgery: string
  surgeon: string
  assistant1: string
  assistant2: string
  anesthesiologist: string
  asa: string
  asaE: boolean
  mallampati: string
  difficultAirway: string
  allergies: string
  fastingSolids: string
  fastingLiquids: string
  history: string
  labs: { hb: string; hto: string; plt: string; inr: string; glucose: string; bloodType: string }
  who: string[]
  checks: string[]
  techniques: string[]
  times: Record<TimeKey, string>
  monitoring: MonitorRow[]
  drugs: DrugRow[]
  maintenance: string
  airway: string[]
  tubeSize: string
  cormack: string
  attempts: string
  etco2Confirms: boolean
  ventilation: string
  vt: string
  rr: string
  peep: string
  regionalLevel: string
  regionalDrug: string
  monitors: string[]
  ivLines: string
  position: string
  fluids: { crystalloids: string; colloids: string; bleeding: string; diuresis: string }
  operation: string
  incidents: string
  extubated: boolean
  tof09: boolean
  destination: string
  exit: { bp: string; hr: string; rr: string; spo2: string }
  aldrete: Record<AldreteKey, string>
  scrubNurse: string
  circulatingNurse: string
}

/** Quien firmó la hoja llenada en el sistema (copiado al firmar: lo impreso no cambia si después cambia su perfil). */
export interface AnesthesiaSigner { name: string; title?: string; license?: string; signatureId?: string; stampId?: string }

export interface AnesthesiaSheet {
  id: string
  noteId: string
  hospitalizationId: string
  patientId: string
  mode: 'upload' | 'system'
  performedBy: { name: string; staffId?: string }
  observation?: string
  fileId?: string
  data?: AnesthesiaData
  signer?: AnesthesiaSigner
  createdBy: string
  createdAt: string
  version: number
  /** GE4: hasta cuándo quien la firmó puede corregirla (solo la llenada en el sistema). */
  graceUntil?: string
  voidedAt?: string
  voidedBy?: string
  voidReason?: string
  replacedBy?: string
  /** La nota postquirúrgica: procedimiento y fecha (para la lista de Anexos y los pendientes). */
  procedure?: string
  surgeryAt?: string
}

/** Datos del paciente y de la cirugía que la hoja trae llenos (hoja en blanco y formulario). */
export interface AnesthesiaPrefill {
  patient: { id: string; firstName: string; lastName: string; record: string; dni?: string; birthDate?: string; sex?: string; allergies: string[]
    guardianName?: string; guardianDni?: string; guardianRelation?: string }
  weightKg?: number
  heightCm?: number
  diagnosis?: string
  procedure?: string
  postop?: PostopData
  postDiagnoses?: Diagnosis[]
  surgeryProposed?: string
}

export const blankAnesthesia = (): AnesthesiaData => ({
  date: '', room: '', weightKg: '', heightCm: '', scheduled: '', preDiagnosis: '', proposedSurgery: '', surgeon: '', assistant1: '', assistant2: '', anesthesiologist: '',
  asa: '', asaE: false, mallampati: '', difficultAirway: '', allergies: '', fastingSolids: '', fastingLiquids: '', history: '',
  labs: { hb: '', hto: '', plt: '', inr: '', glucose: '', bloodType: '' },
  who: [], checks: [], techniques: [],
  times: { roomIn: '', anesthesiaStart: '', surgeryStart: '', surgeryEnd: '', anesthesiaEnd: '', roomOut: '' },
  monitoring: [], drugs: [], maintenance: '',
  airway: [], tubeSize: '', cormack: '', attempts: '', etco2Confirms: false, ventilation: '', vt: '', rr: '', peep: '',
  regionalLevel: '', regionalDrug: '', monitors: [], ivLines: '', position: '',
  fluids: { crystalloids: '', colloids: '', bleeding: '', diuresis: '' },
  operation: '', incidents: '', extubated: false, tof09: false, destination: '',
  exit: { bp: '', hr: '', rr: '', spo2: '' },
  aldrete: { activity: '', respiration: '', circulation: '', consciousness: '', saturation: '' },
  scrubNurse: '', circulatingNurse: '',
})

const pad = (n: number) => String(n).padStart(2, '0')
/** «HH:mm» y «aaaa-mm-dd» de un instante en la hora de Honduras (UTC−6). */
const local = (iso: string) => { const t = new Date(new Date(iso).getTime() - 6 * 3_600_000); return { date: `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`, time: `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}` } }
const num = (x?: number) => (x == null ? '' : String(x))

/**
 * Lo que la hoja trae lleno: paciente, alergias, peso y talla, diagnóstico, cirugía propuesta y practicada, equipo quirúrgico,
 * horas de la cirugía y la técnica que corresponde al tipo de anestesia de la nota (PQ1). Todo se puede cambiar.
 */
export function prefillAnesthesia(x: AnesthesiaPrefill): AnesthesiaData {
  const d = blankAnesthesia()
  const pq = x.postop
  const team = (k: (typeof SURGICAL_TEAM)[number]['key']) => pq?.team[k]?.name.trim() ?? ''
  const tech = pq ? ANESTHESIA_TECHNIQUE_OF[pq.anesthesia] : undefined
  return {
    ...d,
    date: pq ? local(pq.startAt).date : '',
    weightKg: num(x.weightKg), heightCm: num(x.heightCm),
    scheduled: pq ? (pq.urgent ? 'Urgencia' : 'Programada') : '',
    preDiagnosis: pq ? pq.preDiagnoses.map((dx) => dx.label).join('; ') : x.diagnosis ?? '',
    proposedSurgery: x.surgeryProposed ?? pq?.procedureName ?? x.procedure ?? '',
    surgeon: team('surgeon'), assistant1: team('assistant1'), assistant2: team('assistant2'), anesthesiologist: team('anesthesiologist'),
    allergies: x.patient.allergies.join(', '),
    techniques: tech ? [tech] : [],
    times: { ...d.times, surgeryStart: pq ? local(pq.startAt).time : '', surgeryEnd: pq ? local(pq.endAt).time : '' },
    operation: pq?.procedureName ?? '',
    scrubNurse: team('scrub'), circulatingNurse: team('circulating'),
  }
}

const n = (s: string) => { const v = Number(String(s).replace(',', '.')); return s.trim() && Number.isFinite(v) ? v : 0 }
/** Balance de líquidos: ingresos (cristaloides + coloides o hemoderivados) − egresos (sangrado + diuresis u otros). */
export function fluidBalance(f: AnesthesiaData['fluids']) {
  const any = Object.values(f).some((v) => v.trim())
  const inflow = n(f.crystalloids) + n(f.colloids)
  const outflow = n(f.bleeding) + n(f.diuresis)
  return { any, inflow, outflow, balance: inflow - outflow }
}
/** Aldrete: suma de lo marcado (0 a 10); `complete` si están los cinco. */
export function aldreteTotal(a: AnesthesiaData['aldrete']) {
  const vals = Object.values(a).filter((v) => v !== '')
  return { total: vals.reduce((s, v) => s + Number(v), 0), complete: vals.length === ANESTHESIA_SHEET.aldrete.length, any: vals.length > 0 }
}
export const signed = (x: number) => (x > 0 ? `+${x}` : String(x))

/** Minutos de «HH:mm». */
export const minutesOf = (hhmm: string) => { const m = /^(\d{2}):(\d{2})$/.exec(hhmm); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN }
/**
 * Minuto de la cuadrícula de cada registro: desde el inicio de la anestesia (o la entrada a sala, o el primer registro). Si
 * la hora es menor que la anterior, pasó la medianoche.
 */
export function gridPoints(d: Pick<AnesthesiaData, 'monitoring' | 'times'>) {
  const rows = d.monitoring.filter((r) => !Number.isNaN(minutesOf(r.time)))
  const start = [d.times.anesthesiaStart, d.times.roomIn, rows[0]?.time].map(minutesOf).find((x) => !Number.isNaN(x))
  if (start == null) return { start: undefined, points: [] as (MonitorRow & { min: number })[], marks: {} as Partial<Record<TimeKey, number>> }
  const rel = (m: number) => { let x = m - start; while (x < -60) x += 1440; return x }
  let prev = -Infinity
  const points = rows.map((r) => { let x = rel(minutesOf(r.time)); while (x < prev - 60) x += 1440; prev = x; return { ...r, min: x } }).filter((p) => p.min >= 0)
  const marks: Partial<Record<TimeKey, number>> = {}
  for (const t of ANESTHESIA_SHEET.times) { const m = minutesOf(d.times[t.key]); if (!Number.isNaN(m)) marks[t.key] = rel(m) }
  return { start, points, marks }
}

/** «HH:mm» a partir de un minuto del día (para las etiquetas de la cuadrícula). */
export const hhmm = (m: number) => `${pad(Math.floor((((m % 1440) + 1440) % 1440) / 60))}:${pad(((m % 60) + 60) % 60)}`

/** ¿Tiene algo escrito más allá de lo que trae lleno? (para no guardar un borrador vacío). */
export const sameAs = (a: AnesthesiaData, b: AnesthesiaData) => JSON.stringify(a) === JSON.stringify(b)
