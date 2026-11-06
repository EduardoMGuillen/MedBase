import { randomUUID } from 'node:crypto'
import type { Row, Sql } from './sql.js'
import { SUPPLY_MD } from '../src/lib/supplyMd/generated.js'
import { normalize } from '../src/lib/patients.js'
import { DEFAULT_SUPPLY_SETTINGS, supplyKey, type SupplyItem, type SupplyScope, type SupplySet, type SupplySettings, type SupplyUnit } from '../src/lib/supplies.js'

/**
 * RU1 (ronda 14) y RU5 (ronda 15): carga del catálogo de material médico quirúrgico (data/listado_material_medico_quirurgico.md
 * v2, leído por `npm run ru1:build` → src/lib/supplyMd/generated.ts) en una clínica o consultorio, con los sets iniciales del
 * Anexo (RU8). La usan la migración (todas las clínicas), la creación de una clínica o consultorio nuevo y la demo.
 *
 * Idempotente y sin pisar a la clínica (A7):
 *  - cada línea del .md se reconoce por su clave (material y variante); si no está, se crea con su «Registro» y su marca de
 *    lista de turno (las 135 nuevas de la v2);
 *  - si está y la clínica no la editó ni la archivó, se ponen al día su Categoría, su Registro y su orden; nunca se cambia
 *    Material, Variante, Unidad ni la marca de la lista de turno (las 73 de la ronda 14);
 *  - lo editado (edited_at) o archivado (archived_at) por la clínica no se toca ni se reactiva;
 *  - lo que la clínica agregó (sin md_key) nunca lo toca una carga; si ya creó una línea con el mismo material y variante que
 *    una nueva del .md, la nueva no se agrega (no habría dos iguales).
 * Los registros ya hechos no cambian: guardan su copia de material, variante y unidad.
 * También deja el periodo de registro por defecto («Por turno» con los turnos de enfermería) si la clínica no tiene uno.
 */
export interface SupplyLoadReport {
  total: number
  created: number
  updated: number
  unchanged: number
  /** Del .md, pero la clínica la editó o la archivó: no se tocó. */
  protected: number
  /** Nueva del .md que la clínica ya había creado por su cuenta: no se agregó. */
  clinicOwn: number
  skipped: number
  sets: { created: number; updated: number; kept: number }
}

const COLUMNS = ['id', 'clinic_id', 'category', 'material', 'variant', 'unit', 'scope', 'on_shift_list', 'sort', 'origin', 'md_key', 'md_no', 'created_by', 'created_at'] as const

export async function loadSupplyCatalog(q: Sql, clinicId: string): Promise<SupplyLoadReport> {
  const now = new Date().toISOString()
  await q.run(`INSERT INTO supply_settings (clinic_id, period, shifts, updated_by, updated_at) VALUES (?,?,?,NULL,NULL) ON CONFLICT (clinic_id) DO NOTHING`,
    [clinicId, DEFAULT_SUPPLY_SETTINGS.period, JSON.stringify(DEFAULT_SUPPLY_SETTINGS.shifts)])
  const all = await q.query('SELECT * FROM supply_items WHERE clinic_id = ?', [clinicId])
  const have = new Map(all.filter((r) => r.md_key).map((r) => [String(r.md_key), r]))
  const own = new Set(all.filter((r) => !r.md_key).map((r) => supplyKey(String(r.material), String(r.variant ?? ''))))
  const report: SupplyLoadReport = { total: SUPPLY_MD.rows.length, created: 0, updated: 0, unchanged: 0, protected: 0, clinicOwn: 0, skipped: SUPPLY_MD.skipped.length, sets: { created: 0, updated: 0, kept: 0 } }
  const fresh: unknown[][] = []
  for (const row of SUPPLY_MD.rows) {
    const r = have.get(row.key)
    if (!r) {
      if (own.has(row.key)) { report.clinicOwn++; continue }
      fresh.push([randomUUID(), clinicId, row.category, row.material, row.variant, row.unit, row.scope, row.onList, row.no, 'catalog', row.key, row.no, null, now])
      continue
    }
    if (r.edited_at || r.archived_at) { report.protected++; continue }
    const same = String(r.category) === row.category && String(r.scope ?? 'both') === row.scope && Number(r.sort) === row.no && Number(r.md_no) === row.no
    if (same) { report.unchanged++; continue }
    await q.run('UPDATE supply_items SET category = ?, scope = ?, sort = ?, md_no = ? WHERE id = ?', [row.category, row.scope, row.no, row.no, String(r.id)])
    report.updated++
  }
  // En lote: contra una base lejana, una por una tardaría (208 líneas por clínica)
  const per = Math.floor(1000 / COLUMNS.length)
  for (let i = 0; i < fresh.length; i += per) {
    const chunk = fresh.slice(i, i + per)
    await q.run(`INSERT INTO supply_items (${COLUMNS.join(',')}) VALUES ${chunk.map(() => `(${COLUMNS.map(() => '?').join(',')})`).join(',')} ON CONFLICT (clinic_id, md_key) WHERE md_key IS NOT NULL DO NOTHING`, chunk.flat())
  }
  report.created = fresh.length
  report.sets = await loadSupplySets(q, clinicId)
  return report
}

/**
 * RU8 (ronda 15, A14): los 6 sets iniciales del Anexo del .md en la clínica. Idempotente: un set se reconoce por su md_key (el
 * nombre sin tildes); si no está y la clínica no tiene uno con ese nombre, se crea; si está y la clínica no lo editó ni lo
 * archivó, se pone al día con el .md. Cada línea apunta a la línea del catálogo de la clínica con ese material y variante
 * (la del .md o la que creó la clínica); lo archivado o lo que no existe no entra.
 */
async function loadSupplySets(q: Sql, clinicId: string) {
  const out = { created: 0, updated: 0, kept: 0 }
  if (!SUPPLY_MD.sets.length) return out
  const items = await q.query('SELECT id, material, variant, md_key, archived_at FROM supply_items WHERE clinic_id = ?', [clinicId])
  const byKey = new Map<string, string>()
  // La del .md manda; si no, la que creó la clínica (activa)
  for (const r of items) if (!r.archived_at && !r.md_key) byKey.set(supplyKey(String(r.material), String(r.variant ?? '')), String(r.id))
  for (const r of items) if (!r.archived_at && r.md_key) byKey.set(String(r.md_key), String(r.id))
  const sets = await q.query('SELECT * FROM supply_sets WHERE clinic_id = ?', [clinicId])
  const now = new Date().toISOString()
  for (const s of SUPPLY_MD.sets) {
    const lines = s.items.flatMap((i) => (byKey.has(i.key) ? [{ itemId: byKey.get(i.key)!, quantity: i.quantity }] : []))
    const current = sets.find((x) => x.md_key === s.key)
    if (!current) {
      if (sets.some((x) => normalize(String(x.name)) === s.key) || !lines.length) { out.kept++; continue }
      await q.run(`INSERT INTO supply_sets (id, clinic_id, name, description, items, origin, md_key, created_by, created_at) VALUES (?,?,?,?,?,'catalog',?,NULL,?)
        ON CONFLICT (clinic_id, md_key) WHERE md_key IS NOT NULL DO NOTHING`, [randomUUID(), clinicId, s.name, s.description, JSON.stringify(lines), s.key, now])
      out.created++
      continue
    }
    if (current.edited_at || current.archived_at) { out.kept++; continue }
    if (String(current.name) === s.name && String(current.description) === s.description && String(current.items) === JSON.stringify(lines)) { out.kept++; continue }
    await q.run('UPDATE supply_sets SET name = ?, description = ?, items = ? WHERE id = ?', [s.name, s.description, JSON.stringify(lines), String(current.id)])
    out.updated++
  }
  return out
}

export const toSupplyItem = (r: Row): SupplyItem => ({
  id: String(r.id), category: String(r.category), material: String(r.material), variant: String(r.variant ?? ''), unit: String(r.unit) as SupplyUnit,
  scope: String(r.scope ?? 'both') as SupplyScope,
  onShiftList: Boolean(r.on_shift_list), origin: r.origin === 'catalog' ? 'catalog' : 'clinic', mdNo: r.md_no == null ? undefined : Number(r.md_no),
  editedAt: r.edited_at ? String(r.edited_at) : undefined, listSetAt: r.list_set_at ? String(r.list_set_at) : undefined,
  archivedAt: r.archived_at ? String(r.archived_at) : undefined, archivedBy: r.archived_by ? String(r.archived_by) : undefined,
})

export const toSupplySet = (r: Row): SupplySet => ({
  id: String(r.id), name: String(r.name), description: String(r.description ?? ''), items: JSON.parse(String(r.items)), origin: r.origin === 'catalog' ? 'catalog' : 'clinic',
  createdAt: String(r.created_at), createdBy: r.created_by ? String(r.created_by) : undefined, updatedAt: r.updated_at ? String(r.updated_at) : undefined,
  updatedBy: r.updated_by ? String(r.updated_by) : undefined, editedAt: r.edited_at ? String(r.edited_at) : undefined,
  archivedAt: r.archived_at ? String(r.archived_at) : undefined, archivedBy: r.archived_by ? String(r.archived_by) : undefined,
})

/** El periodo de registro de la clínica (el de por defecto si todavía no tiene). */
export async function supplySettings(q: Sql, clinicId: string): Promise<SupplySettings> {
  const r = await q.one('SELECT * FROM supply_settings WHERE clinic_id = ?', [clinicId])
  if (!r) return DEFAULT_SUPPLY_SETTINGS
  return { period: String(r.period) as SupplySettings['period'], shifts: JSON.parse(String(r.shifts)), updatedAt: r.updated_at ? String(r.updated_at) : undefined, updatedBy: r.updated_by ? String(r.updated_by) : undefined }
}
