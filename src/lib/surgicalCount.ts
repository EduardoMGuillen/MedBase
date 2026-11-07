import { SURGICAL_COUNT, type SurgicalRole } from './clinicalConfig.js'
import type { AnesthesiaPrefill, AnesthesiaSigner } from './anesthesia.js'

/**
 * PQ5 (ronda 16): «Recuento quirúrgico» de la nota postquirúrgica (momentos de recuento de AORN; fase «Salida» de la Lista OMS).
 * Mismo patrón que el registro de anestesia: se sube en papel o se llena y firma en el sistema (médico, enfermería o quien entró
 * a la cirugía con usuario). Filas y columnas en `SURGICAL_COUNT` (clinicalConfig, VALIDAR: Emil). Opcional.
 */

export type CountColumn = (typeof SURGICAL_COUNT.columns)[number]['key']
export type CountSearch = (typeof SURGICAL_COUNT.searches)[number]['key']

/** Una fila del recuento: lo contado en cada momento (texto, como se escribe) y el resultado. «Otros» lleva su nombre. */
export interface CountRow { key: string; label: string; cells: Record<CountColumn, string>; result: string }
/** «Cambio de personal»: recuento al relevarse la instrumentista o la circulante. */
export interface CountHandoff { id: string; time: string; role: string; from: string; to: string; count: string }

export interface SurgicalCountData {
  date: string
  procedure: string
  surgeon: string
  scrubNurse: string
  circulatingNurse: string
  rows: CountRow[]
  handoffs: CountHandoff[]
  /** Si algún resultado es «Incorrecto»: Sí / No de cada casilla y la nota (obligatoria). */
  incorrect: Record<CountSearch, string> & { note: string }
  confirmed: boolean
}

export interface SurgicalCount {
  id: string
  noteId: string
  hospitalizationId: string
  patientId: string
  mode: 'upload' | 'system'
  observation?: string
  fileId?: string
  data?: SurgicalCountData
  signer?: AnesthesiaSigner
  createdBy: string
  createdAt: string
  version: number
  graceUntil?: string
  voidedAt?: string
  voidedBy?: string
  voidReason?: string
  replacedBy?: string
  procedure?: string
  surgeryAt?: string
}

const cells = (): Record<CountColumn, string> => Object.fromEntries(SURGICAL_COUNT.columns.map((c) => [c.key, ''])) as Record<CountColumn, string>
export const blankCountRow = (key: string, label: string): CountRow => ({ key, label, cells: cells(), result: '' })

export const blankCount = (): SurgicalCountData => ({
  date: '', procedure: '', surgeon: '', scrubNurse: '', circulatingNurse: '',
  rows: SURGICAL_COUNT.rows.map((r) => blankCountRow(r.key, r.label)),
  handoffs: [],
  incorrect: { surgeonInformed: '', searched: '', xray: '', found: '', note: '' },
  confirmed: false,
})

const pad = (n: number) => String(n).padStart(2, '0')
const localDate = (iso: string) => { const t = new Date(new Date(iso).getTime() - 6 * 3_600_000); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}` }

/** El encabezado lleno desde la nota postquirúrgica: fecha, procedimiento, cirujano, instrumentista y circulante. */
export function prefillCount(x: Pick<AnesthesiaPrefill, 'postop'>): SurgicalCountData {
  const pq = x.postop
  const team = (k: SurgicalRole) => pq?.team[k]?.name.trim() ?? ''
  return { ...blankCount(), date: pq ? localDate(pq.startAt) : '', procedure: pq?.procedureName ?? '', surgeon: team('surgeon'), scrubNurse: team('scrub'), circulatingNurse: team('circulating') }
}

/** ¿El instrumental se cuenta en esta columna? (las demás se pueden dejar en blanco) */
export const instrumentCounts = (col: CountColumn) => (SURGICAL_COUNT.instrumentColumns as readonly string[]).includes(col)
export const isOther = (r: Pick<CountRow, 'key'>) => r.key.startsWith('other:')
export const anyIncorrect = (d: Pick<SurgicalCountData, 'rows'>) => d.rows.some((r) => r.result === 'Incorrecto')
/** Lo que falta para firmar (vacío: se puede firmar). */
export function countMissing(d: SurgicalCountData) {
  const out: string[] = []
  if (!d.rows.some((r) => r.result)) out.push('marca el resultado de al menos una fila')
  if (d.rows.some((r) => isOther(r) && !r.label.trim() && (r.result || Object.values(r.cells).some((v) => v.trim())))) out.push('escribe qué es cada fila de «Otros»')
  if (anyIncorrect(d)) {
    const empty = SURGICAL_COUNT.searches.filter((s) => !d.incorrect[s.key])
    if (empty.length) out.push(`con un resultado «Incorrecto», responde ${empty.map((s) => `«${s.label}»`).join(', ')}`)
    if (d.incorrect.note.trim().length < 5) out.push('con un resultado «Incorrecto», escribe la nota')
  }
  return out
}
export const sameCount = (a: SurgicalCountData, b: SurgicalCountData) => JSON.stringify(a) === JSON.stringify(b)
