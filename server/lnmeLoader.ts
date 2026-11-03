import { randomUUID } from 'node:crypto'
import type { Row, Sql } from './sql.js'
import { LNME_BASE, LNME_ITEMS, LNME_META } from '../src/lib/lnme/generated.js'
import type { LnmeItem } from '../src/lib/lnme/build.js'
import { doubtful, sameDrug, type MatchKind } from '../src/lib/lnme/match.js'
import { formRoute } from '../src/lib/lnme/route.js'

/**
 * ME5 (ronda 9) y ME6 (ronda 10): carga del LNME Honduras 2023 (generado por `npm run me5:build` desde el .md) en el
 * vademécum de una clínica o consultorio (tabla clinic_drugs). La clave de cada fila es su NÚMERO del listado.
 *
 * ME6: las 530 filas del .md quedan en la base, cada una con todas sus columnas, también las que son el mismo medicamento
 * que uno del catálogo base de Clinara (la ronda 9 no creaba esas 21: por eso el vademécum decía 509). El nombre del
 * catálogo base queda como alias de búsqueda («Paracetamol», «Ciprofloxacino», «Lactato de Ringer»…).
 *
 * Carga normal (idempotente; la usan las clínicas nuevas y cada migración):
 *  - lo que ya está cargado e igual no se toca (correrla dos veces no cambia nada); lo cargado se pone al día si cambió el .md;
 *  - lo editado o archivado por la clínica (origen «clinic») ninguna carga lo pisa ni lo reactiva (regla de ME5 para el futuro);
 *  - lo que la clínica agregó y es el mismo medicamento (nombre y presentación, o sinónimo) gana el número y el alias;
 *  - si hay duda (mismo principio activo y una concentración en común), no se une: se crea aparte y se reporta.
 *
 * Carga forzada (`force`, ME6, una sola vez por base desde `forceLnmeOnce`): el .md manda. Las clínicas que existen hoy son de
 * demostración, así que sus ediciones no se respetan: todo medicamento que empareja con una fila toma los datos del archivo
 * (nombre, presentación, forma, vía, envase, grupo y demás), vuelve a estar activo y su nombre anterior queda como alias.
 * Antes se guarda una exportación del vademécum de la clínica en config_backups.
 *
 * Las filas nuevas van en lote (INSERT de varias filas): contra Neon, una por una tardaría demasiado en el primer pedido.
 */
export interface LnmeLoadReport {
  created: number
  kept: number
  updated: number
  /** ME6: filas existentes cuyos datos reemplazó el .md (carga forzada). */
  replaced: number
  base: number
  matched: { no: number; lnme: string; drug: string; kind: MatchKind }[]
  doubts: { no: number; lnme: string; drug: string }[]
  /** Filas que no se pudieron poner con su clave (otra fila ya la tiene): quedan con la suya y se reportan. */
  conflicts: string[]
}

const COLUMNS = ['id', 'clinic_id', 'name', 'presentation', 'route', 'norm_key', 'active', 'created_by', 'created_at', 'origin', 'origin_label', 'lnme_no', 'lnme_match',
  'lnme_version', 'lnme_group', 'lnme_subgroup', 'lnme_name', 'form', 'lnme_routes', 'package', 'complementary', 'restriction', 'lnme_note', 'certainty',
  'presentation_full', 'alternatives', 'aliases'] as const

/** Los campos del LNME que se guardan en la fila (los mismos al crear y al etiquetar lo que ya existía). */
const lnmeFields = (it: LnmeItem) => ({
  lnme_no: it.no, lnme_version: LNME_META.version, lnme_group: it.group, lnme_subgroup: it.subgroup || null, lnme_name: it.name, form: it.form || null,
  lnme_routes: it.routes || null, package: it.package || null, complementary: it.complementary, restriction: it.restriction ?? null, lnme_note: it.note ?? null,
  certainty: it.certainty, presentation_full: it.presentationFull, alternatives: JSON.stringify(it.alternatives),
})
const TAG_FIELDS = Object.keys(lnmeFields(LNME_ITEMS[0])) as (keyof ReturnType<typeof lnmeFields>)[]
/** ME6: todo lo que manda el .md en una fila: sus columnas, más nombre, presentación y vía del formulario. */
const mdData = (it: LnmeItem) => ({ ...lnmeFields(it), name: it.name, presentation: it.presentation, route: formRoute(it.routes, it.name, it.form) ?? null })
const MD_FIELDS = Object.keys(mdData(LNME_ITEMS[0])) as (keyof ReturnType<typeof mdData>)[]
const sameMd = (r: Row, f: ReturnType<typeof mdData>) => MD_FIELDS.every((k) => String(r[k] ?? '') === String(f[k] ?? '')) && r.concentration == null

/** ME6: alias de búsqueda de una fila: los del .md y el nombre del medicamento del catálogo base que es esa misma fila. */
const BASE_NAMES = new Map<number, string[]>()
for (const b of LNME_BASE) BASE_NAMES.set(b.no, [...(BASE_NAMES.get(b.no) ?? []), b.base.split('|')[0]])
/** `own`: el nombre que conserva la fila (en la carga normal, el de la clínica; si no, el del .md), que no va como alias. */
const aliasesOf = (it: LnmeItem, extra: string[] = [], own = it.name) => {
  const key = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  const out: string[] = []
  for (const a of [it.name, ...it.aliases, ...(BASE_NAMES.get(it.no) ?? []), ...extra]) if (a && key(a) !== key(own) && !out.some((x) => key(x) === key(a))) out.push(a)
  return out
}

const label = (d: Row) => [d.name, d.presentation, d.concentration].filter(Boolean).join(' ')

async function insertMany(q: Sql, rows: unknown[][]) {
  const per = Math.floor(2000 / COLUMNS.length)
  for (let i = 0; i < rows.length; i += per) {
    const chunk = rows.slice(i, i + per)
    await q.run(`INSERT INTO clinic_drugs (${COLUMNS.join(',')}) VALUES ${chunk.map(() => `(${COLUMNS.map(() => '?').join(',')})`).join(',')} ON CONFLICT (clinic_id, norm_key) DO NOTHING`, chunk.flat())
  }
}

export async function loadLnme(q: Sql, clinicId: string, opts: { force?: boolean } = {}): Promise<LnmeLoadReport> {
  const report: LnmeLoadReport = { created: 0, kept: 0, updated: 0, replaced: 0, base: 0, matched: [], doubts: [], conflicts: [] }
  const rows = await q.query('SELECT * FROM clinic_drugs WHERE clinic_id = ?', [clinicId])
  if (opts.force && rows.length) {
    await q.run('INSERT INTO config_backups (id, clinic_id, kind, created_at, data, note) VALUES (?,?,?,?,?,?)',
      [randomUUID(), clinicId, 'me6-vademecum-before', new Date().toISOString(), JSON.stringify(rows), `ME6 (ronda 10): vademécum de la clínica antes de la carga completa del .md (${rows.length} filas)`])
  }
  const byNo = new Map<number, Row>()
  for (const r of rows) if (r.lnme_no != null && !byNo.has(Number(r.lnme_no))) byNo.set(Number(r.lnme_no), r)
  const keys = new Set(rows.map((r) => String(r.norm_key)))
  // Lo que agregó la clínica y todavía no lleva número del LNME: candidatos a ser el mismo medicamento
  const own = rows.filter((r) => r.lnme_no == null)
  const taken = new Set<string>()
  const now = new Date().toISOString()
  const pending: unknown[][] = []
  // ME5: etiqueta lo que ya tenía la clínica (conserva sus datos; solo gana número, columnas del listado y alias)
  const tag = async (r: Row, it: LnmeItem, kind: MatchKind) => {
    const aliases = aliasesOf(it, JSON.parse(String(r.aliases ?? '[]')) as string[], String(r.name))
    const f = lnmeFields(it)
    await q.run(`UPDATE clinic_drugs SET ${TAG_FIELDS.map((k) => `${k} = ?`).join(', ')}, lnme_match = ?, aliases = ? WHERE id = ?`,
      [...TAG_FIELDS.map((k) => f[k]), kind, JSON.stringify(aliases), String(r.id)])
    taken.add(String(r.id))
    report.matched.push({ no: it.no, lnme: `${it.name} | ${it.presentation}`, drug: label(r), kind })
  }
  // ME6: el .md manda: datos del archivo, activo, origen del listado; el nombre anterior queda como alias
  const replace = async (r: Row, it: LnmeItem, match: string) => {
    const f = mdData(it)
    const aliases = aliasesOf(it, [...JSON.parse(String(r.aliases ?? '[]')) as string[], String(r.name)])
    const clash = it.key !== String(r.norm_key) && (keys.has(it.key) || await q.one('SELECT 1 FROM clinic_drugs WHERE clinic_id = ? AND norm_key = ? AND id <> ?', [clinicId, it.key, String(r.id)]))
    if (clash) report.conflicts.push(`#${it.no} ${it.name}: otra fila del vademécum ya tiene ese nombre y presentación; se quedó con «${label(r)}»`)
    const unchanged = sameMd(r, f) && r.origin === 'lnme' && Boolean(r.active) && JSON.stringify(aliases) === String(r.aliases ?? '[]') && (clash || String(r.norm_key) === it.key)
    taken.add(String(r.id))
    if (unchanged) { report.kept++; return }
    await q.run(`UPDATE clinic_drugs SET ${MD_FIELDS.map((k) => `${k} = ?`).join(', ')}, concentration = NULL, norm_key = ?, active = TRUE, origin = 'lnme', origin_label = ?, lnme_match = ?, aliases = ? WHERE id = ?`,
      [...MD_FIELDS.map((k) => f[k]), clash ? String(r.norm_key) : it.key, LNME_META.origin, match, JSON.stringify(aliases), String(r.id)])
    if (!clash) { keys.delete(String(r.norm_key)); keys.add(it.key) }
    report.replaced++
  }
  for (const it of LNME_ITEMS) {
    const cur = byNo.get(it.no)
    if (cur) {
      if (opts.force) { await replace(cur, it, String(cur.lnme_match ?? 'created')); continue }
      // Ya cargado: lo de la clínica (emparejado, editado o archivado) no se toca; lo cargado se pone al día si cambió el archivo
      if (cur.origin === 'lnme' && cur.lnme_match === 'created' && !sameMd(cur, mdData(it))) { await replace(cur, it, 'created'); report.replaced--; report.updated++ }
      else report.kept++
      continue
    }
    // ¿Lo tiene la clínica? Primero el mismo nombre y presentación, después con sinónimo
    const asDrug = (r: Row) => ({ name: String(r.name), presentation: [r.presentation, r.concentration].filter(Boolean).join(' ') })
    const free = own.filter((r) => !taken.has(String(r.id)))
    const exact = free.find((r) => sameDrug(it, asDrug(r)) === 'exact')
    const syn = exact ? undefined : free.find((r) => sameDrug(it, asDrug(r)) === 'synonym')
    if (exact || syn) {
      const r = (exact ?? syn)!
      if (opts.force) { report.matched.push({ no: it.no, lnme: `${it.name} | ${it.presentation}`, drug: label(r), kind: exact ? 'exact' : 'synonym' }); await replace(r, it, exact ? 'exact' : 'synonym') }
      else await tag(r, it, exact ? 'exact' : 'synonym')
      continue
    }
    if (BASE_NAMES.has(it.no)) report.base++
    for (const r of own) if (doubtful(it, asDrug(r))) report.doubts.push({ no: it.no, lnme: `${it.name} | ${it.presentation}`, drug: label(r) })
    if (keys.has(it.key)) { report.conflicts.push(`#${it.no} ${it.name}: ya hay otra fila con ese nombre y presentación`); continue }
    keys.add(it.key)
    const f = mdData(it)
    const row: Record<(typeof COLUMNS)[number], unknown> = {
      id: randomUUID(), clinic_id: clinicId, norm_key: it.key, active: true, created_by: null, created_at: now,
      origin: 'lnme', origin_label: LNME_META.origin, lnme_match: 'created', aliases: JSON.stringify(aliasesOf(it)), ...f,
    }
    pending.push(COLUMNS.map((c) => row[c]))
    report.created++
  }
  await insertMany(q, pending)
  // Bitácora: la carga la hace la migración (equipo técnico), no una persona. Sin cambios, no se escribe nada.
  if (report.created || report.updated || report.replaced || (!opts.force && report.matched.length)) {
    await q.run('INSERT INTO audit (at, user_id, action, clinic_id) VALUES (?,?,?,?)', [now, 'sistema',
      `Cargó el ${LNME_META.origin} al vademécum${opts.force ? ' (carga completa del .md, ME6: el archivo manda)' : ''}: ${report.created} creado(s)`
      + `${report.replaced ? `, ${report.replaced} reemplazado(s) con los datos del archivo` : ''}${!opts.force && report.matched.length ? `, ${report.matched.length} ya existía(n) (etiquetados)` : ''}`
      + `${report.updated ? `, ${report.updated} actualizado(s)` : ''}${report.doubts.length ? `; ${report.doubts.length} en duda, sin unir` : ''}${report.conflicts.length ? `; ${report.conflicts.length} con conflicto de clave` : ''}`, clinicId])
  }
  return report
}

/**
 * ME6 (ronda 10): la carga completa y forzada del .md, UNA sola vez por base (marca `me6:done`), en todas las clínicas y
 * consultorios que existen en ese momento. Una clínica creada después nunca se fuerza: sus ediciones se respetan (ME5).
 */
export async function forceLnmeOnce(q: Sql): Promise<Record<string, LnmeLoadReport>> {
  const out: Record<string, LnmeLoadReport> = {}
  if (await q.one(`SELECT 1 FROM meta WHERE key = 'me6:done'`)) return out
  for (const c of await q.query('SELECT id FROM clinics')) out[String(c.id)] = await loadLnme(q, String(c.id), { force: true })
  await q.run(`INSERT INTO meta (key, value) VALUES ('me6:done', ?) ON CONFLICT (key) DO NOTHING`, [new Date().toISOString()])
  return out
}

/** ME6 (ronda 10): números del .md que no están en el vademécum de cada clínica (activos o archivados). 0 = completo. */
export async function compareLnme(q: Sql): Promise<{ clinicId: string; name: string; rows: number; missing: number[] }[]> {
  const out = []
  for (const c of await q.query('SELECT id, name FROM clinics ORDER BY name')) {
    const have = new Set((await q.query('SELECT DISTINCT lnme_no FROM clinic_drugs WHERE clinic_id = ? AND lnme_no IS NOT NULL', [String(c.id)])).map((r) => Number(r.lnme_no)))
    out.push({ clinicId: String(c.id), name: String(c.name), rows: have.size, missing: LNME_ITEMS.map((i) => i.no).filter((n) => !have.has(n)) })
  }
  return out
}
