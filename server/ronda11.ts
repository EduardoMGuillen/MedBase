import { randomUUID } from 'node:crypto'
import type { Sql } from './sql.js'
import { examKey } from '../src/lib/exams.js'
import { saveConfigBackup } from './ronda10.js'

/**
 * Ronda 11: migraciones y cargas del catálogo de exámenes. Todas son idempotentes, corren en `ensureDb` para cada clínica y
 * consultorio (también los nuevos, desde `ensureExamCatalog`) y, antes de borrar algo, guardan una exportación en
 * `config_backups`. El catálogo no es expediente: sus exámenes sí se borran (decisión de Emil, rondas 10 y 11). Las órdenes
 * guardan el NOMBRE del examen (no una referencia al catálogo), así que las ya emitidas no cambian en ninguna pantalla.
 */

const sysAudit = (q: Sql, clinicId: string, action: string) =>
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

/**
 * CA7 (ronda 11): los exámenes archivados del catálogo se borran (ya no se archiva nada en el catálogo de exámenes). Correrla
 * otra vez no cambia nada: ya no quedan archivados.
 */
export async function cleanArchivedCatalog(q: Sql, clinicId: string) {
  const rows = await q.query('SELECT * FROM exam_catalog WHERE clinic_id = ? AND active = FALSE ORDER BY grp, name', [clinicId])
  if (!rows.length) return null
  const out = await removeCatalogExams(q, clinicId, rows, 'sistema', 'ca7-archived-removed', 'CA7 (ronda 11): archivados del catálogo')
  await sysAudit(q, clinicId, `Catálogo de exámenes (CA7, ronda 11): se borraron ${out.removed.length} examen(es) archivado(s): ${out.removed.join(', ')}`
    + `${out.sets.length ? `; se quitaron de ${setChangesText(out.sets)}` : ''}. Las órdenes que ya los usan no cambian. Copia previa en config_backups.`)
  return out
}

/** Ronda 11: el catálogo de cada clínica al día (CA6 y CA7). Idempotente. */
export async function loadRonda11Catalog(q: Sql, clinicId: string) {
  await cleanArchivedCatalog(q, clinicId)
}
