import { randomUUID } from 'node:crypto'
import type { Sql } from './sql.js'
import { BASE_SUBGROUP, examKey } from '../src/lib/exams.js'
import { LAB_CATALOG, LAB_EQUIVALENCES, LAB_PROFILES, PACKAGE_REPLACEMENTS, PENDING_PACKAGES, R6_SUBGROUP, type LabCatalogEntry, type LabProfileEntry } from '../src/lib/labCatalog.js'

/** CF3 (ronda 6): nombre para comparar: sin mayúsculas, tildes, signos ni espacios de más. */
export const looseKey = (name: string) => examKey(name).replace(/[^a-z0-9]+/g, ' ').trim()

/** Bitácora de las cargas: no las hace una persona sino la migración (equipo técnico). */
const SYSTEM = 'sistema'
const log = (q: Sql, clinicId: string, action: string) =>
  q.run('INSERT INTO audit (at, user_id, action, clinic_id) VALUES (?,?,?,?)', [new Date().toISOString(), SYSTEM, action, clinicId])

/**
 * v51 (CF3) y v56 (CA1, B3): cada examen de la lista fija recibe su subgrupo. Llena los vacíos y cambia los que todavía
 * tienen el que les puso la ronda 6 (T4 libre y TSH → Hormonas › Tiroides…). Lo que editó la clínica no se pisa.
 */
export async function migrateSubgroups(q: Sql, clinicId: string) {
  for (const [name, subgroup] of Object.entries(BASE_SUBGROUP)) {
    await q.run('UPDATE exam_catalog SET subgroup = ? WHERE clinic_id = ? AND base_key = ? AND subgroup IS NULL', [subgroup, clinicId, examKey(name)])
  }
  for (const [name, old] of Object.entries(R6_SUBGROUP)) {
    await q.run('UPDATE exam_catalog SET subgroup = ? WHERE clinic_id = ? AND base_key = ? AND subgroup = ?', [BASE_SUBGROUP[name], clinicId, examKey(name), old])
  }
}

export interface LoadReport {
  added: string[]
  skipped: { name: string; existing: string }[]
  profilesAdded: string[]
  profilesSkipped: string[]
  /** Componentes de un perfil que no estaban en el catálogo y se agregaron a «Otros» (debe ser 0) */
  profileExamsAdded: string[]
}

type LoadData = { catalog: LabCatalogEntry[]; equivalences: Record<string, string>; profiles: LabProfileEntry[] }

/**
 * CA1 y CA3 (ronda 7): carga idempotente del Anexo A (exámenes) y de los perfiles de la clínica (Anexo B y C) en una
 * clínica. Un examen que ya existe (mismo nombre sin mayúsculas, tildes ni signos, o de la tabla de equivalencias) no se
 * agrega, y los existentes no se tocan (nombre, rangos, estado). Los nuevos nacen activos, sin rangos ni umbrales. Un
 * perfil se agrega una sola vez por nombre normalizado (también si la clínica lo archivó). No toca «Mis sets».
 */
export async function loadLabCatalog(q: Sql, clinicId: string, data: LoadData = { catalog: LAB_CATALOG, equivalences: LAB_EQUIVALENCES, profiles: LAB_PROFILES }): Promise<LoadReport> {
  const report: LoadReport = { added: [], skipped: [], profilesAdded: [], profilesSkipped: [], profileExamsAdded: [] }
  // CA7 (ronda 11): lo que la clínica quitó del catálogo cuenta como existente (no se vuelve a agregar)
  const rows = await q.query('SELECT name FROM exam_catalog WHERE clinic_id = ? UNION SELECT name FROM exam_catalog_removed WHERE clinic_id = ?', [clinicId, clinicId])
  const byKey = new Map(rows.map((r) => [looseKey(String(r.name)), String(r.name)]))
  const equiv = new Map(Object.entries(data.equivalences).map(([from, to]) => [looseKey(from), to]))
  /** El examen del catálogo que corresponde a un nombre (directo o por equivalencia). */
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
    if (have.has(looseKey(p.name))) { report.profilesSkipped.push(p.name); continue }
    const items: { group: 'lab'; name: string }[] = []
    for (const raw of p.items) {
      let name = resolve(raw)
      if (!name) { await add(raw, 'Otros'); report.profileExamsAdded.push(raw); name = raw }
      if (!items.some((x) => x.name === name)) items.push({ group: 'lab', name })
    }
    await q.run('INSERT INTO exam_profiles (id, clinic_id, owner_id, name, items, note, created_by, created_at) VALUES (?,?,NULL,?,?,?,?,?)',
      [randomUUID(), clinicId, p.name, JSON.stringify(items), p.note ?? null, SYSTEM, now])
    have.add(looseKey(p.name))
    report.profilesAdded.push(p.name)
  }
  return report
}

/** Un ítem de un set: texto, medicamento o examen (sólo se mira el examen). */
type SetItem = { exam?: { group: string; name: string; [k: string]: unknown }; [k: string]: unknown }

/**
 * CA2: los exámenes de una lista con cada paquete reemplazado por sus exámenes individuales (sin duplicar). Lo que no es
 * paquete queda igual y en su lugar. Devuelve también qué se reemplazó.
 */
export function expandPackages<T extends SetItem>(items: T[]): { items: T[]; replaced: { pkg: string; by: string[] }[] } {
  const pkgs = new Map(Object.entries(PACKAGE_REPLACEMENTS).map(([k, v]) => [examKey(k), { name: k, by: v }]))
  const out: T[] = []
  const replaced: { pkg: string; by: string[] }[] = []
  const has = (name: string) => out.some((x) => x.exam && examKey(x.exam.name) === examKey(name)) || items.some((x) => x.exam && examKey(x.exam.name) === examKey(name))
  for (const it of items) {
    const p = it.exam && pkgs.get(examKey(it.exam.name))
    if (!p) { out.push(it); continue }
    const added = p.by.filter((n) => !has(n))
    for (const name of added) out.push({ ...it, exam: { ...it.exam!, group: 'lab', name } })
    replaced.push({ pkg: p.name, by: added })
  }
  return { items: out, replaced }
}

export interface ConvertReport { archived: string[]; setsUpdated: { set: string; owner: string; replaced: string[] }[]; setsPending: { set: string; owner: string; pkg: string }[] }

/**
 * CA2 (ronda 7): los paquetes de la lista fija dejan de ser exámenes. Se archivan (no se borran: las órdenes antiguas
 * siguen mostrando su nombre) y en los sets de cada médico se reemplazan por sus exámenes individuales, con una línea de
 * bitácora por set. «Química sanguínea» (B7/B8) no se archiva y sus sets no se tocan: se listan.
 */
export async function convertPackages(q: Sql, clinicId: string): Promise<ConvertReport> {
  const report: ConvertReport = { archived: [], setsUpdated: [], setsPending: [] }
  const now = new Date().toISOString()
  for (const pkg of Object.keys(PACKAGE_REPLACEMENTS)) {
    const row = await q.one('SELECT id, name FROM exam_catalog WHERE clinic_id = ? AND norm_key = ? AND active', [clinicId, examKey(pkg)])
    if (!row) continue
    await q.run('UPDATE exam_catalog SET active = FALSE, archived_at = ?, archived_by = ?, updated_at = ?, updated_by = ? WHERE id = ?', [now, SYSTEM, now, SYSTEM, String(row.id)])
    await log(q, clinicId, `Ronda 7: «${row.name}» deja de ser un examen del catálogo (archivado, no borrado) y pasa a «Perfiles de laboratorio»`)
    report.archived.push(String(row.name))
  }
  const pending = new Set(PENDING_PACKAGES.map(examKey))
  const sets = await q.query(`SELECT s.id, s.name, s.items, st.name AS owner FROM order_sets s LEFT JOIN staff st ON st.id = s.owner_id WHERE s.clinic_id = ? AND s.archived_at IS NULL ORDER BY s.name`, [clinicId])
  for (const s of sets) {
    const items = JSON.parse(String(s.items)) as SetItem[]
    const owner = String(s.owner ?? '')
    for (const it of items) if (it.exam && pending.has(examKey(it.exam.name))) report.setsPending.push({ set: String(s.name), owner, pkg: it.exam.name })
    const { items: next, replaced } = expandPackages(items)
    if (!replaced.length) continue
    await q.run('UPDATE order_sets SET items = ?, updated_at = ? WHERE id = ?', [JSON.stringify(next), now, String(s.id)])
    const what = replaced.map((r) => `«${r.pkg}» → ${r.by.length ? r.by.join(', ') : '(ya tenía sus exámenes)'}`)
    await log(q, clinicId, `Ronda 7: en el set «${s.name}» de ${owner || 'un médico'} se reemplazó ${what.join('; ')}`)
    report.setsUpdated.push({ set: String(s.name), owner, replaced: replaced.map((r) => r.pkg) })
  }
  return report
}

/**
 * v56 (ronda 7): subgrupos, carga del catálogo y de los perfiles, y paquetes a perfiles en una clínica. La carga es
 * idempotente por sí misma; además, una marca por clínica en `meta` hace que la conversión de paquetes y la carga de
 * perfiles corran una sola vez: si Administración restaura un paquete o renombra un perfil, no se deshace.
 */
export async function loadRonda7(q: Sql, clinicId: string) {
  await migrateSubgroups(q, clinicId)
  const mark = `ronda7:catalogo:${clinicId}`
  if (await q.one('SELECT 1 FROM meta WHERE key = ?', [mark])) {
    // Ya corrió: sólo se completan los exámenes que falten (no se repiten perfiles ni conversiones)
    return { load: await loadLabCatalog(q, clinicId, { catalog: LAB_CATALOG, equivalences: LAB_EQUIVALENCES, profiles: [] }), convert: undefined }
  }
  const load = await loadLabCatalog(q, clinicId)
  const convert = await convertPackages(q, clinicId)
  await log(q, clinicId, `Ronda 7: carga del catálogo de laboratorio: ${load.added.length} exámenes agregados, ${load.skipped.length} ya existían; ${load.profilesAdded.length} perfiles de laboratorio agregados; ${convert.archived.length} paquetes archivados; ${convert.setsUpdated.length} sets actualizados`)
  await q.run(`INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO NOTHING`, [mark, new Date().toISOString()])
  return { load, convert }
}
