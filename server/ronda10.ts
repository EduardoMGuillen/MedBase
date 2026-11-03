import { randomUUID } from 'node:crypto'
import type { Sql } from './sql.js'
import { DEFAULT_CRITICAL_GROUPS, defaultAnalyte, type CriticalAnalyte, type CriticalGroup } from '../src/lib/clinicalConfig.js'

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
