import { randomUUID } from 'node:crypto'
import type { Sql } from './sql.js'
import { BASE_SUBGROUP, examKey } from '../src/lib/exams.js'
import { LAB_CATALOG, LAB_EQUIVALENCES, LAB_PROFILES } from './data/labCatalog.js'

/** CF3 (ronda 6): nombre para comparar: sin mayúsculas, tildes, signos ni espacios de más. */
export const looseKey = (name: string) => examKey(name).replace(/[^a-z0-9]+/g, ' ').trim()

/** v51 (CF3): cada examen de la lista fija recibe su subgrupo (A6). Sólo llena los vacíos: no pisa lo que editó la clínica. */
export async function migrateSubgroups(q: Sql, clinicId: string) {
  for (const [name, subgroup] of Object.entries(BASE_SUBGROUP)) {
    await q.run('UPDATE exam_catalog SET subgroup = ? WHERE clinic_id = ? AND base_key = ? AND subgroup IS NULL', [subgroup, clinicId, examKey(name)])
  }
}

export interface LoadReport { added: string[]; skipped: { name: string; existing: string }[]; profilesAdded: string[]; profileExamsAdded: string[]; unlinked: string[] }

/**
 * CF3 y CF6 (ronda 6): carga idempotente del Anexo A (exámenes) y del Anexo B (perfiles de la clínica) en una clínica.
 * Un examen que ya existe (mismo nombre sin mayúsculas, tildes ni signos, o sinónimo de la tabla de equivalencias) no se
 * agrega; tampoco se tocan los existentes (nombre, rangos, estado). Los nuevos nacen activos, sin rangos ni umbrales.
 * Un perfil se agrega una sola vez por nombre; un componente que no existe se agrega al catálogo («Otros») y se reporta.
 * No toca «Mis sets» de nadie.
 */
export async function loadLabCatalog(q: Sql, clinicId: string, data = { catalog: LAB_CATALOG, equivalences: LAB_EQUIVALENCES, profiles: LAB_PROFILES }): Promise<LoadReport> {
  const report: LoadReport = { added: [], skipped: [], profilesAdded: [], profileExamsAdded: [], unlinked: [] }
  const rows = await q.query('SELECT id, name, grp FROM exam_catalog WHERE clinic_id = ?', [clinicId])
  const byKey = new Map(rows.map((r) => [looseKey(String(r.name)), String(r.name)]))
  const equiv = new Map(Object.entries(data.equivalences).map(([from, to]) => [looseKey(from), to]))
  /** El examen del catálogo que corresponde a un nombre del anexo (directo o por equivalencia). */
  const resolve = (name: string) => byKey.get(looseKey(name)) ?? (equiv.has(looseKey(name)) ? byKey.get(looseKey(equiv.get(looseKey(name))!)) : undefined)
  const now = new Date().toISOString()
  const add = async (name: string, subgroup: string) => {
    await q.run('INSERT INTO exam_catalog (id, clinic_id, grp, name, norm_key, subgroup, active, created_by, created_at) VALUES (?,?,?,?,?,?,TRUE,NULL,?) ON CONFLICT (clinic_id, norm_key) DO NOTHING',
      [randomUUID(), clinicId, 'lab', name, examKey(name), subgroup || 'Otros', now])
    byKey.set(looseKey(name), name)
  }
  for (const e of data.catalog) {
    const existing = resolve(e.name)
    if (existing) { report.skipped.push({ name: e.name, existing }); continue }
    await add(e.name, e.subgroup)
    report.added.push(e.name)
  }
  const have = new Set((await q.query('SELECT name FROM exam_profiles WHERE clinic_id = ? AND owner_id IS NULL', [clinicId])).map((r) => looseKey(String(r.name))))
  for (const p of data.profiles) {
    if (have.has(looseKey(p.name))) continue
    const items: { group: 'lab'; name: string }[] = []
    for (const raw of p.items) {
      let name = resolve(raw)
      if (!name) { await add(raw, 'Otros'); report.profileExamsAdded.push(raw); name = raw }
      if (!items.some((x) => x.name === name)) items.push({ group: 'lab', name })
    }
    await q.run('INSERT INTO exam_profiles (id, clinic_id, owner_id, name, items, created_by, created_at) VALUES (?,?,NULL,?,?,?,?)',
      [randomUUID(), clinicId, p.name, JSON.stringify(items), 'system', now])
    report.profilesAdded.push(p.name)
  }
  return report
}
