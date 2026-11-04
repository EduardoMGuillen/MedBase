import { randomUUID } from 'node:crypto'
import type { Row, Sql } from './sql.js'
import { GENERATED } from '../src/lib/labRef/generated.js'
import { LOAD_ORIGIN, type RefValue } from '../src/lib/labRef/build.js'
import { EXAMS, examKey } from '../src/lib/exams.js'
import type { RefRow } from '../src/lib/labReference.js'

/**
 * UM1 (ronda 8): carga de los valores de referencia del .md (generados por `npm run um1:build`) en la base de cada clínica
 * y consultorio (tabla exam_ref_values), con sus fuentes (tabla lab_sources). Idempotente:
 *  - lo que ya está igual no se toca (correrla dos veces no cambia nada);
 *  - un valor distinto del mismo analito y sexo se reemplaza: el anterior queda archivado (historial «antes → ahora»);
 *  - lo que la clínica edite después de esta carga (origen «clinic») ninguna carga futura lo pisa;
 *  - los rangos que traía la app en la lista fija (p. ej. Creatinina 0.6–1.2) entran archivados como «Valor inicial de
 *    Clinara», para que el reemplazo quede a la vista; los que el .md no trae (Gases arteriales) siguen vigentes así.
 */
export interface RefLoadReport { inserted: number; replaced: { exam: string; analyte?: string; sex: string; before: string; after: string }[]; kept: number; initial: number }

const keyOf = (r: { exam_key: string; analyte: string; sex: string; md_row?: string | null }) => `${r.exam_key}|${r.analyte}|${r.sex}|${r.analyte ? '' : r.md_row ?? ''}`
const fmt = (r: { low?: unknown; high?: unknown; high_open?: unknown; expected?: unknown }) =>
  r.expected ? String(r.expected) : [r.low != null ? `${Number(r.low)}` : '', r.high != null ? `${r.high_open ? '<' : ''}${Number(r.high)}` : ''].filter(Boolean).join('–') || '—'
const same = (a: Row, v: RefValue) => (a.low == null ? undefined : Number(a.low)) === v.low && (a.high == null ? undefined : Number(a.high)) === v.high && Boolean(a.high_open) === !!v.highOpen
  && String(a.expected ?? '') === (v.expected ?? '') && String(a.note ?? '') === (v.note ?? '') && String(a.unit ?? '') === v.unit && String(a.sources) === JSON.stringify(v.sources)

export async function loadLabSources(q: Sql) {
  for (const s of GENERATED.sources) {
    await q.run(`INSERT INTO lab_sources (code, citation, urls, version) VALUES (?,?,?,?) ON CONFLICT (code) DO UPDATE SET citation = excluded.citation, urls = excluded.urls, version = excluded.version`,
      [s.code, s.citation, JSON.stringify(s.urls), GENERATED.version])
  }
}

const COLUMNS = ['id', 'clinic_id', 'exam_key', 'exam_name', 'analyte', 'sex', 'unit', 'low', 'high', 'high_open', 'expected', 'note', 'warn', 'sources', 'origin', 'origin_label',
  'version', 'md_row', 'created_at', 'archived_at', 'archive_reason']

/** Una fila lista para insertar (en lote: contra Neon, una por una tardaría demasiado en el primer pedido tras desplegar). */
function rowOf(clinicId: string, v: Omit<RefValue, 'how' | 'row'> & { row?: string }, origin: string, now: string, extra: { archived?: string; reason?: string } = {}): unknown[] {
  return [randomUUID(), clinicId, examKey(v.exam), v.exam, v.analyte ?? '', v.sex, v.unit ?? '', v.low ?? null, v.high ?? null, !!v.highOpen, v.expected ?? null, v.note ?? null, !!v.warn,
    JSON.stringify(v.sources ?? []), origin, origin === 'catalog' ? LOAD_ORIGIN : origin === 'initial' ? 'Valor inicial de Clinara (sin fuente) · VALIDAR: Emil' : 'Editado por la clínica',
    origin === 'catalog' ? GENERATED.version : null, v.row ?? null, now, extra.archived ?? null, extra.reason ?? null]
}

async function insertMany(q: Sql, rows: unknown[][]) {
  const per = Math.floor(1000 / COLUMNS.length)
  for (let i = 0; i < rows.length; i += per) {
    const chunk = rows.slice(i, i + per)
    await q.run(`INSERT INTO exam_ref_values (${COLUMNS.join(',')}) VALUES ${chunk.map(() => `(${COLUMNS.map(() => '?').join(',')})`).join(',')}`, chunk.flat())
  }
}

export async function loadRefValues(q: Sql, clinicId: string): Promise<RefLoadReport> {
  const now = new Date().toISOString()
  const report: RefLoadReport = { inserted: 0, replaced: [], kept: 0, initial: 0 }
  const pending: unknown[][] = []
  const archive: string[] = []
  const active = new Map((await q.query('SELECT * FROM exam_ref_values WHERE clinic_id = ? AND archived_at IS NULL', [clinicId])).map((r) => [keyOf(r as never), r]))
  const fileKeys = new Set((GENERATED.values as RefValue[]).filter((v) => v.analyte).map((v) => `${examKey(v.exam)}|${v.analyte}`))
  // Los rangos que traía la app en la lista fija: los que el .md reemplaza quedan archivados como «antes»; los demás, vigentes
  const hadInitial = new Set((await q.query(`SELECT exam_key, analyte FROM exam_ref_values WHERE clinic_id = ? AND origin = 'initial'`, [clinicId])).map((r) => `${r.exam_key}|${r.analyte}`))
  for (const e of EXAMS) for (const a of e.analytes ?? []) {
    const k = `${examKey(e.name)}|${a.name}`
    if (hadInitial.has(k)) continue
    const replaced = fileKeys.has(k)
    pending.push(rowOf(clinicId, { exam: e.name, analyte: a.name, unit: a.unit, sex: 'all', low: a.low, high: a.high, sources: ['initial'] }, 'initial', now,
      replaced ? { archived: now, reason: `Reemplazado por ${LOAD_ORIGIN}` } : {}))
    report.initial++
    if (replaced) {
      const now2 = (GENERATED.values as RefValue[]).filter((v) => v.exam === e.name && v.analyte === a.name)
      report.replaced.push({ exam: e.name, analyte: a.name, sex: 'all', before: `${fmt({ low: a.low, high: a.high })} ${a.unit}`.trim(),
        after: now2.map((v) => `${v.sex === 'all' ? '' : v.sex === 'F' ? 'Mujeres ' : 'Hombres '}${fmt({ low: v.low, high: v.high, high_open: v.highOpen, expected: v.expected })} ${v.unit}`.trim()).join(' · ') })
    }
  }
  for (const v of GENERATED.values as RefValue[]) {
    const k = keyOf({ exam_key: examKey(v.exam), analyte: v.analyte ?? '', sex: v.sex, md_row: v.row })
    const cur = active.get(k)
    if (cur && cur.origin === 'clinic') { report.kept++; continue }
    if (cur && cur.origin === 'catalog' && same(cur, v)) { report.kept++; continue }
    if (cur) {
      archive.push(String(cur.id))
      report.replaced.push({ exam: v.exam, analyte: v.analyte, sex: v.sex, before: fmt(cur), after: fmt({ low: v.low, high: v.high, high_open: v.highOpen, expected: v.expected }) })
    }
    pending.push(rowOf(clinicId, v, 'catalog', now))
    report.inserted++
  }
  // Ronda 12 (LB2): lo que el .md ya no trae así (el EGO y los líquidos tenían un solo «resultado esperado» sin analito; los
  // rangos iniciales de los gases arteriales) queda archivado. Lo de la clínica no se toca.
  const fileAll = new Set((GENERATED.values as RefValue[]).map((v) => keyOf({ exam_key: examKey(v.exam), analyte: v.analyte ?? '', sex: v.sex, md_row: v.row })))
  for (const [k, cur] of active) {
    if (cur.origin === 'catalog' && !fileAll.has(k)) archive.push(String(cur.id))
    else if (cur.origin === 'initial' && fileKeys.has(`${cur.exam_key}|${cur.analyte}`)) archive.push(String(cur.id))
  }
  for (let i = 0; i < archive.length; i += 500) {
    const ids = archive.slice(i, i + 500)
    await q.run(`UPDATE exam_ref_values SET archived_at = ?, archive_reason = ? WHERE id IN (${ids.map(() => '?').join(',')})`, [now, `Reemplazado por ${LOAD_ORIGIN}`, ...ids])
  }
  await insertMany(q, pending)
  return report
}

/** Filas vigentes de un examen en la clínica (por su nombre o por el de la lista fija si se renombró). */
export async function refRowsFor(q: Sql, clinicId: string, name: string) {
  const linked = await q.one('SELECT base_key FROM exam_catalog WHERE clinic_id = ? AND norm_key = ?', [clinicId, examKey(name)])
  const keys = [examKey(name), ...(linked?.base_key ? [String(linked.base_key)] : [])]
  const rows = await q.query(`SELECT * FROM exam_ref_values WHERE clinic_id = ? AND archived_at IS NULL AND exam_key IN (${keys.map(() => '?').join(',')}) ORDER BY created_at, id`, [clinicId, ...keys])
  // Si hay filas por el nombre propio, mandan sobre las del nombre de la lista fija
  const own = rows.filter((r) => r.exam_key === keys[0])
  return (own.length ? own : rows).map(toRefRow)
}

export const toRefRow = (r: Row): RefRow & { id: string; examKey: string; editedBy?: string; createdAt: string; originLabel?: string; editNote?: string } => ({
  id: String(r.id), examKey: String(r.exam_key), exam: String(r.exam_name), analyte: r.analyte ? String(r.analyte) : undefined, unit: String(r.unit ?? ''), sex: String(r.sex) as RefRow['sex'],
  low: r.low == null ? undefined : Number(r.low), high: r.high == null ? undefined : Number(r.high), highOpen: Boolean(r.high_open) || undefined,
  expected: r.expected ? String(r.expected) : undefined, note: r.note ? String(r.note) : undefined, warn: Boolean(r.warn) || undefined,
  sources: JSON.parse(String(r.sources ?? '[]')), origin: String(r.origin) as RefRow['origin'], editedBy: r.created_by ? String(r.created_by) : undefined,
  createdAt: String(r.created_at), originLabel: r.origin_label ? String(r.origin_label) : undefined, editNote: r.edit_note ? String(r.edit_note) : undefined,
})
