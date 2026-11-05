import { randomUUID } from 'node:crypto'
import type { Row, Sql } from './sql.js'
import { SUPPLY_MD } from '../src/lib/supplyMd/generated.js'
import { DEFAULT_SUPPLY_SETTINGS, type SupplyItem, type SupplySettings, type SupplyUnit } from '../src/lib/supplies.js'

/**
 * RU1 (ronda 14): carga del catálogo base de material médico quirúrgico (data/listado_material_medico_quirurgico.md, leído
 * por `npm run ru1:build` → src/lib/supplyMd/generated.ts) en una clínica o consultorio. La usan la migración de la v82 (todas
 * las clínicas), la creación de una clínica o consultorio nuevo y el primer uso del catálogo de exámenes (ensureExamCatalog).
 *
 * Idempotente y sin pisar a la clínica:
 *  - cada línea del .md se reconoce por su clave (material y variante); si no está, se crea con su marca de lista de turno;
 *  - si está y la clínica no la editó ni la archivó, se pone al día con el .md (categoría, unidad, orden);
 *  - lo editado (edited_at) o archivado (archived_at) por la clínica no se toca ni se reactiva;
 *  - lo que la clínica marcó o desmarcó en la lista de turno (list_set_at) no se cambia;
 *  - lo que la clínica agregó (sin md_key) nunca lo toca una carga.
 * También deja el periodo de registro por defecto («Por turno» con los turnos de enfermería) si la clínica no tiene uno.
 */
export interface SupplyLoadReport { created: number; updated: number; kept: number; total: number; skipped: number }

const COLUMNS = ['id', 'clinic_id', 'category', 'material', 'variant', 'unit', 'on_shift_list', 'sort', 'origin', 'md_key', 'md_no', 'created_by', 'created_at'] as const

export async function loadSupplyCatalog(q: Sql, clinicId: string): Promise<SupplyLoadReport> {
  const now = new Date().toISOString()
  await q.run(`INSERT INTO supply_settings (clinic_id, period, shifts, updated_by, updated_at) VALUES (?,?,?,NULL,NULL) ON CONFLICT (clinic_id) DO NOTHING`,
    [clinicId, DEFAULT_SUPPLY_SETTINGS.period, JSON.stringify(DEFAULT_SUPPLY_SETTINGS.shifts)])
  const have = new Map((await q.query('SELECT * FROM supply_items WHERE clinic_id = ? AND md_key IS NOT NULL', [clinicId])).map((r) => [String(r.md_key), r]))
  const report: SupplyLoadReport = { created: 0, updated: 0, kept: 0, total: SUPPLY_MD.rows.length, skipped: SUPPLY_MD.skipped.length }
  const fresh: unknown[][] = []
  for (const row of SUPPLY_MD.rows) {
    const r = have.get(row.key)
    if (!r) {
      fresh.push([randomUUID(), clinicId, row.category, row.material, row.variant, row.unit, row.onList, row.no, 'catalog', row.key, row.no, null, now])
      continue
    }
    if (r.edited_at || r.archived_at) { report.kept++; continue }
    const listOn = r.list_set_at ? Boolean(r.on_shift_list) : row.onList
    const same = String(r.category) === row.category && String(r.material) === row.material && String(r.variant) === row.variant && String(r.unit) === row.unit
      && Number(r.sort) === row.no && Number(r.md_no) === row.no && Boolean(r.on_shift_list) === listOn
    if (same) { report.kept++; continue }
    await q.run('UPDATE supply_items SET category = ?, material = ?, variant = ?, unit = ?, sort = ?, md_no = ?, on_shift_list = ? WHERE id = ?',
      [row.category, row.material, row.variant, row.unit, row.no, row.no, listOn, String(r.id)])
    report.updated++
  }
  // En lote: contra una base lejana, una por una tardaría (73 líneas por clínica)
  const per = Math.floor(1000 / COLUMNS.length)
  for (let i = 0; i < fresh.length; i += per) {
    const chunk = fresh.slice(i, i + per)
    await q.run(`INSERT INTO supply_items (${COLUMNS.join(',')}) VALUES ${chunk.map(() => `(${COLUMNS.map(() => '?').join(',')})`).join(',')} ON CONFLICT (clinic_id, md_key) WHERE md_key IS NOT NULL DO NOTHING`, chunk.flat())
  }
  report.created = fresh.length
  return report
}

export const toSupplyItem = (r: Row): SupplyItem => ({
  id: String(r.id), category: String(r.category), material: String(r.material), variant: String(r.variant ?? ''), unit: String(r.unit) as SupplyUnit,
  onShiftList: Boolean(r.on_shift_list), origin: r.origin === 'catalog' ? 'catalog' : 'clinic', mdNo: r.md_no == null ? undefined : Number(r.md_no),
  editedAt: r.edited_at ? String(r.edited_at) : undefined, listSetAt: r.list_set_at ? String(r.list_set_at) : undefined,
  archivedAt: r.archived_at ? String(r.archived_at) : undefined, archivedBy: r.archived_by ? String(r.archived_by) : undefined,
})

/** El periodo de registro de la clínica (el de por defecto si todavía no tiene). */
export async function supplySettings(q: Sql, clinicId: string): Promise<SupplySettings> {
  const r = await q.one('SELECT * FROM supply_settings WHERE clinic_id = ?', [clinicId])
  if (!r) return DEFAULT_SUPPLY_SETTINGS
  return { period: String(r.period) as SupplySettings['period'], shifts: JSON.parse(String(r.shifts)), updatedAt: r.updated_at ? String(r.updated_at) : undefined, updatedBy: r.updated_by ? String(r.updated_by) : undefined }
}
