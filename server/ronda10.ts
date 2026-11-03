import { randomUUID } from 'node:crypto'
import type { Sql } from './sql.js'
import { DEFAULT_CRITICAL_GROUPS, defaultAnalyte, type CriticalAnalyte, type CriticalGroup } from '../src/lib/clinicalConfig.js'
import { EXAMS, examKey } from '../src/lib/exams.js'
import { IMAGING_REMOVED } from '../src/lib/imagingCatalog.js'

/**
 * Ronda 10: migraciones y cargas de datos. Todas son idempotentes, corren en `ensureDb` para cada clínica y consultorio
 * (también los nuevos) y, antes de borrar algo, guardan una exportación en `config_backups`.
 */

/** Guarda una exportación de lo que se va a borrar o reemplazar (nunca se borra). */
export async function saveConfigBackup(q: Sql, clinicId: string | null, kind: string, data: unknown, note: string) {
  await q.run('INSERT INTO config_backups (id, clinic_id, kind, created_at, data, note) VALUES (?,?,?,?,?,?)',
    [randomUUID(), clinicId, kind, new Date().toISOString(), JSON.stringify(data), note])
}

const sysAudit = (q: Sql, clinicId: string, action: string) =>
  q.run('INSERT INTO audit (at, user_id, action, clinic_id) VALUES (?,?,?,?)', [new Date().toISOString(), 'sistema', action, clinicId])

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const DEFAULT_GROUP_IDS = new Set(DEFAULT_CRITICAL_GROUPS.map((g) => g.id))

export interface ThresholdCleanup {
  deleted: string[]
  retired: string[]
  /** Predeterminados de UM2 archivados: no se tocan (se reportan). */
  defaults: string[]
}

/**
 * UM3 (ronda 10): quita los umbrales críticos ARCHIVADOS de cada clínica, una sola vez (marca `um3:<clínica>` en meta; si
 * después alguien archiva otro, «Ver archivados» vuelve a aparecer y esto no lo toca).
 * - Un umbral activo nunca se toca.
 * - Un predeterminado de la app (UM2, los del .md de la ronda 8) archivado NO se borra: queda como está y se reporta.
 * - Un archivado del que depende un resultado (un valor que se marcó crítico con él mientras estaba activo) no se borra: queda
 *   «retirado» (en la base, invisible en toda pantalla).
 * - El resto se borra de verdad. Antes se guarda la exportación de todo lo archivado en `config_backups`, y queda en la bitácora.
 */
export async function cleanArchivedThresholds(q: Sql): Promise<Record<string, ThresholdCleanup>> {
  const out: Record<string, ThresholdCleanup> = {}
  // Una sola vez por base: lo que se archive después (también en una clínica nueva) se queda archivado
  if (await q.one(`SELECT 1 FROM meta WHERE key = 'um3:done'`)) return out
  for (const c of await q.query('SELECT id, critical_groups FROM clinics')) {
    const cid = String(c.id)
    const mark = `um3:${cid}`
    if (await q.one('SELECT 1 FROM meta WHERE key = ?', [mark])) continue
    const groups = (c.critical_groups ? JSON.parse(String(c.critical_groups)) : []) as CriticalGroup[]
    const report: ThresholdCleanup = { deleted: [], retired: [], defaults: [] }
    // Resultados con algún valor crítico: de cuáles analitos y cuándo (para saber si un umbral archivado se usó)
    const usedAt = new Map<string, string[]>()
    for (const r of await q.query(`SELECT result FROM exam_orders WHERE clinic_id = ? AND critical = TRUE AND result IS NOT NULL`, [cid])) {
      const res = JSON.parse(String(r.result)) as { at?: string; values?: { analyte: string; critical?: boolean }[] }
      for (const v of res.values ?? []) if (v.critical && res.at) usedAt.set(norm(v.analyte), [...(usedAt.get(norm(v.analyte)) ?? []), res.at])
    }
    // ¿Algún resultado se marcó crítico con este analito antes de que se archivara?
    const depends = (a: CriticalAnalyte, archivedAt?: string) => (usedAt.get(norm(a.name)) ?? []).some((at) => !archivedAt || at < archivedAt)
    const archivedItems = groups.flatMap((g) => [...(g.archivedAt && !g.retiredAt ? [{ kind: 'group', group: g.name, id: g.id }] : []),
      ...g.analytes.filter((a) => a.archivedAt && !a.retiredAt).map((a) => ({ kind: 'analyte', group: g.name, id: a.id, name: a.name }))])
    if (archivedItems.length) {
      await saveConfigBackup(q, cid, 'um3-archived-thresholds', { groups: structuredClone(groups) }, `UM3 (ronda 10): ${archivedItems.length} umbral(es) archivado(s) antes de la limpieza`)
    }
    const now = new Date().toISOString()
    const kept: CriticalGroup[] = []
    for (const g of groups) {
      const gArchived = !!g.archivedAt && !g.retiredAt
      const isDefaultGroup = DEFAULT_GROUP_IDS.has(g.id)
      if (gArchived) {
        if (isDefaultGroup) { report.defaults.push(`grupo «${g.name}»`); kept.push(g); continue }
        // El grupo propio archivado: sus analitos con resultados que dependen quedan retirados; si no hay, se borra entero
        const deps = g.analytes.filter((a) => depends(a, a.archivedAt ?? g.archivedAt))
        const defaultsInside = g.analytes.filter((a) => defaultAnalyte(a.id))
        if (!deps.length && !defaultsInside.length) { report.deleted.push(`grupo «${g.name}» (${g.analytes.length} analito${g.analytes.length === 1 ? '' : 's'})`); continue }
        kept.push({ ...g, retiredAt: now, analytes: g.analytes.map((a) => ({ ...a, archivedAt: a.archivedAt ?? g.archivedAt, retiredAt: now })) })
        report.retired.push(`grupo «${g.name}»: ${deps.length ? `resultados críticos de ${deps.map((a) => a.name).join(', ')}` : 'tiene umbrales predeterminados'}`)
        continue
      }
      const analytes: CriticalAnalyte[] = []
      for (const a of g.analytes) {
        if (!a.archivedAt || a.retiredAt) { analytes.push(a); continue }
        if (defaultAnalyte(a.id)) { report.defaults.push(`${a.name} («${g.name}»)`); analytes.push(a); continue }
        if (depends(a, a.archivedAt)) { analytes.push({ ...a, retiredAt: now }); report.retired.push(`${a.name} («${g.name}»): hay resultados críticos con él`); continue }
        report.deleted.push(`${a.name} («${g.name}»)`)
      }
      kept.push({ ...g, analytes })
    }
    if (report.deleted.length || report.retired.length) await q.run('UPDATE clinics SET critical_groups = ? WHERE id = ?', [JSON.stringify(kept), cid])
    if (archivedItems.length) {
      await sysAudit(q, cid, `Limpieza de umbrales críticos archivados (UM3, ronda 10): ${report.deleted.length} borrado(s)${report.deleted.length ? ` (${report.deleted.join('; ')})` : ''}`
        + `${report.retired.length ? `; ${report.retired.length} retirado(s), invisibles (${report.retired.join('; ')})` : ''}`
        + `${report.defaults.length ? `; ${report.defaults.length} predeterminado(s) de la app archivado(s), sin tocar (${report.defaults.join('; ')})` : ''}. Copia previa en config_backups.`)
    }
    await q.run('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO NOTHING', [mark, now])
    out[cid] = report
  }
  await q.run(`INSERT INTO meta (key, value) VALUES ('um3:done', ?) ON CONFLICT (key) DO NOTHING`, [new Date().toISOString()])
  return out
}

// ───────────────────────────── CA5: catálogo de Imagen y gabinete ─────────────────────────────

export interface ImagingLoadReport {
  deleted: string[]
  created: string[]
  updated: string[]
  /** Sets o perfiles de los que se quitó un estudio borrado: nombre, de quién y qué se quitó. */
  sets: { kind: 'set' | 'profile'; name: string; owner: string; removed: string[] }[]
}

/**
 * CA5 (ronda 10): deja el catálogo de Imagen y gabinete con el Anexo A, en cada clínica y consultorio. Una vez por clínica
 * (marca `ca5:<clínica>`; las nuevas nacen al día):
 *  - BORRA (decisión de Emil, A1 y A2: es catálogo, no expediente) los estudios de antes de la lista fija (`base_key`) que no
 *    siguen en el Anexo A: Radiografía, Radiografía de abdomen y de tórax, los ultrasonidos de antes, «Ultrasonido Doppler»,
 *    «Tomografía (TAC)», «Resonancia magnética» y la «Mamografía» genérica. Lo que la clínica agregó a mano no se toca. Antes
 *    se guarda la exportación en config_backups. Las órdenes guardan el NOMBRE del estudio (no una referencia al catálogo),
 *    así que las antiguas siguen diciendo «Radiografía de tórax» en todas partes.
 *  - Los del Anexo A que tienen el mismo nombre que uno de antes (Ultrasonido obstétrico, de tiroides, de partes blandas)
 *    quedan con su subgrupo y sus detalles nuevos; los que faltan se crean activos, sin precio.
 *  - Cardiología, Endoscopia y Otros conservan los suyos; los sinónimos no se duplican (IMAGING_SAME).
 *  - A los «Mis sets» y perfiles se les quita el estudio borrado (no se reemplaza: no se sabe qué proyección querían).
 */
export async function loadImagingCatalog(q: Sql, clinicId: string): Promise<ImagingLoadReport | null> {
  const mark = `ca5:${clinicId}`
  if (await q.one('SELECT 1 FROM meta WHERE key = ?', [mark])) return null
  const report: ImagingLoadReport = { deleted: [], created: [], updated: [], sets: [] }
  const keep = new Set(EXAMS.filter((e) => e.group === 'imaging').map((e) => examKey(e.name)))
  const removedKeys = new Set(IMAGING_REMOVED.map(examKey))
  const rows = await q.query(`SELECT * FROM exam_catalog WHERE clinic_id = ? AND grp = 'imaging'`, [clinicId])
  const gone = rows.filter((r) => r.base_key && removedKeys.has(String(r.base_key)) && !keep.has(String(r.norm_key)))
  const now = new Date().toISOString()
  if (gone.length) {
    await saveConfigBackup(q, clinicId, 'ca5-imaging-removed', gone, `CA5 (ronda 10): ${gone.length} estudio(s) de imagen borrados del catálogo`)
    await q.run(`DELETE FROM exam_catalog WHERE id IN (${gone.map(() => '?').join(',')})`, gone.map((r) => String(r.id)))
    report.deleted = gone.map((r) => String(r.name))
  }
  const left = rows.filter((r) => !gone.includes(r))
  for (const e of EXAMS.filter((x) => x.group === 'imaging')) {
    const key = examKey(e.name)
    const cur = left.find((r) => String(r.norm_key) === key)
    if (!cur) {
      await q.run('INSERT INTO exam_catalog (id, clinic_id, grp, name, norm_key, base_key, subgroup, active, created_by, created_at) VALUES (?,?,?,?,?,?,?,TRUE,NULL,?)',
        [randomUUID(), clinicId, 'imaging', e.name, key, key, e.subgroup ?? null, now])
      report.created.push(e.name)
    } else if (!cur.base_key || (removedKeys.has(key) && (cur.subgroup ?? null) !== (e.subgroup ?? null))) {
      // El mismo nombre que uno de antes: queda como el del Anexo A (subgrupo y detalles de la lista fija)
      await q.run('UPDATE exam_catalog SET base_key = COALESCE(base_key, ?), subgroup = ?, details = NULL WHERE id = ?', [key, e.subgroup ?? cur.subgroup ?? null, String(cur.id)])
      report.updated.push(e.name)
    }
  }
  // Mis sets (y los sets de la clínica) y perfiles: se quita el estudio borrado
  const removedNames = new Set(report.deleted.map(examKey))
  if (removedNames.size) {
    const staffName = async (id: unknown) => (id ? String((await q.one('SELECT name FROM staff WHERE id = ?', [String(id)]))?.name ?? '—') : 'la clínica')
    for (const s of await q.query('SELECT * FROM order_sets WHERE clinic_id = ? AND archived_at IS NULL', [clinicId])) {
      const items = JSON.parse(String(s.items)) as { exam?: { name: string } }[]
      const out = items.filter((it) => !(it.exam && removedNames.has(examKey(it.exam.name))))
      if (out.length === items.length) continue
      await q.run('UPDATE order_sets SET items = ?, updated_at = ? WHERE id = ?', [JSON.stringify(out), now, String(s.id)])
      report.sets.push({ kind: 'set', name: String(s.name), owner: await staffName(s.owner_id), removed: items.filter((it) => !out.includes(it)).map((it) => it.exam!.name) })
    }
    for (const p of await q.query('SELECT * FROM exam_profiles WHERE clinic_id = ? AND archived_at IS NULL', [clinicId])) {
      const items = JSON.parse(String(p.items)) as { name: string }[]
      const out = items.filter((it) => !removedNames.has(examKey(it.name)))
      if (out.length === items.length) continue
      await q.run('UPDATE exam_profiles SET items = ? WHERE id = ?', [JSON.stringify(out), String(p.id)])
      report.sets.push({ kind: 'profile', name: String(p.name), owner: await staffName(p.owner_id), removed: items.filter((it) => !out.includes(it)).map((it) => it.name) })
    }
  }
  if (report.deleted.length || report.created.length || report.updated.length) {
    await sysAudit(q, clinicId, `Catálogo de Imagen y gabinete (CA5, ronda 10): ${report.deleted.length} estudio(s) borrado(s)${report.deleted.length ? ` (${report.deleted.join(', ')})` : ''}, `
      + `${report.created.length} creado(s), ${report.updated.length} actualizado(s)${report.sets.length ? `; se quitaron estudios borrados de ${report.sets.map((x) => `${x.kind === 'set' ? 'el set' : 'el perfil'} «${x.name}» (${x.owner})`).join(', ')}` : ''}. Copia previa en config_backups.`)
  }
  await q.run('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO NOTHING', [mark, now])
  return report
}
