import { randomUUID } from 'node:crypto'
import type { Sql } from './sql.js'
import { examKey } from '../src/lib/exams.js'

/**
 * Catálogo de exámenes: quitar exámenes del catálogo (con su exportación previa) y de los sets y perfiles que los usan.
 * El catálogo no es expediente: sus exámenes sí se borran. Las órdenes guardan el NOMBRE del examen (no una referencia
 * al catálogo), así que las ya emitidas no cambian en ninguna pantalla.
 */

/** Guarda una exportación de lo que se va a borrar o reemplazar (nunca se borra). */
export async function saveConfigBackup(q: Sql, clinicId: string | null, kind: string, data: unknown, note: string) {
  await q.run('INSERT INTO config_backups (id, clinic_id, kind, created_at, data, note) VALUES (?,?,?,?,?,?)',
    [randomUUID(), clinicId, kind, new Date().toISOString(), JSON.stringify(data), note])
}

/** Acción del sistema (sin persona) en la bitácora de una clínica. */
export const systemAudit = (q: Sql, clinicId: string, action: string) =>
  q.run('INSERT INTO audit (at, user_id, action, clinic_id) VALUES (?,?,?,?)', [new Date().toISOString(), 'sistema', action, clinicId])
export interface SetChange { kind: 'set' | 'profile'; name: string; owner: string; removed: string[] }

/**
 * Quita de «Mis sets» (y los sets de la clínica) y de los perfiles los exámenes de la lista (por nombre, sin tildes ni
 * mayúsculas). No se reemplazan. Devuelve qué set o perfil cambió, de quién y qué se le quitó.
 */
export async function removeFromSetsAndProfiles(q: Sql, clinicId: string, names: Set<string>, now = new Date().toISOString()): Promise<SetChange[]> {
  const out: SetChange[] = []
  if (!names.size) return out
  const staffName = async (id: unknown) => (id ? String((await q.one('SELECT name FROM staff WHERE id = ?', [String(id)]))?.name ?? '—') : 'la clínica')
  for (const s of await q.query('SELECT * FROM order_sets WHERE clinic_id = ? AND archived_at IS NULL', [clinicId])) {
    const items = JSON.parse(String(s.items)) as { exam?: { name: string } }[]
    const kept = items.filter((it) => !(it.exam && names.has(examKey(it.exam.name))))
    if (kept.length === items.length) continue
    await q.run('UPDATE order_sets SET items = ?, updated_at = ? WHERE id = ?', [JSON.stringify(kept), now, String(s.id)])
    out.push({ kind: 'set', name: String(s.name), owner: await staffName(s.owner_id), removed: items.filter((it) => !kept.includes(it)).map((it) => it.exam!.name) })
  }
  for (const p of await q.query('SELECT * FROM exam_profiles WHERE clinic_id = ? AND archived_at IS NULL', [clinicId])) {
    const items = JSON.parse(String(p.items)) as { name: string }[]
    const kept = items.filter((it) => !names.has(examKey(it.name)))
    if (kept.length === items.length) continue
    await q.run('UPDATE exam_profiles SET items = ? WHERE id = ?', [JSON.stringify(kept), String(p.id)])
    out.push({ kind: 'profile', name: String(p.name), owner: await staffName(p.owner_id), removed: items.filter((it) => !kept.includes(it)).map((it) => it.name) })
  }
  return out
}

export const setChangesText = (sets: SetChange[]) =>
  sets.map((x) => `${x.kind === 'set' ? 'el set' : 'el perfil'} «${x.name}» (${x.owner}): ${x.removed.join(', ')}`).join('; ')

/**
 * CA7 (ronda 11): borra exámenes del catálogo de una clínica. Antes guarda la exportación (config_backups) y deja la marca en
 * `exam_catalog_removed`, para que ninguna carga futura (la del laboratorio de la ronda 7 completa lo que falta) lo vuelva a
 * poner. Se quitan de los sets y perfiles. Nada clínico depende de la fila del catálogo (las órdenes guardan el nombre).
 */
export async function removeCatalogExams(q: Sql, clinicId: string, rows: Record<string, unknown>[], by: string, kind: string, reason: string) {
  if (!rows.length) return { removed: [] as string[], sets: [] as SetChange[] }
  const now = new Date().toISOString()
  await saveConfigBackup(q, clinicId, kind, rows, `${reason}: ${rows.length} examen(es) borrado(s) del catálogo`)
  for (const r of rows) {
    await q.run('INSERT INTO exam_catalog_removed (id, clinic_id, grp, name, norm_key, base_key, removed_by, removed_at, reason) VALUES (?,?,?,?,?,?,?,?,?)',
      [randomUUID(), clinicId, String(r.grp), String(r.name), String(r.norm_key), r.base_key ? String(r.base_key) : null, by, now, reason])
  }
  await q.run(`DELETE FROM exam_catalog WHERE clinic_id = ? AND id IN (${rows.map(() => '?').join(',')})`, [clinicId, ...rows.map((r) => String(r.id))])
  const sets = await removeFromSetsAndProfiles(q, clinicId, new Set(rows.map((r) => examKey(String(r.name)))), now)
  return { removed: rows.map((r) => String(r.name)), sets }
}
