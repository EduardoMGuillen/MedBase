import { randomUUID } from 'node:crypto'
import type { Row, Sql } from './sql.js'
import { LNME_BASE, LNME_ITEMS, LNME_META } from '../src/lib/lnme/generated.js'
import type { LnmeItem } from '../src/lib/lnme/build.js'
import { doubtful, sameDrug, type MatchKind } from '../src/lib/lnme/match.js'

/**
 * ME5 (ronda 9): carga del LNME Honduras 2023 (generado por `npm run me5:build` desde el .md) en el vademécum de una clínica
 * o consultorio (tabla clinic_drugs). Idempotente:
 *  - lo que ya está cargado e igual no se toca (correrla dos veces no cambia nada);
 *  - lo que la clínica ya tenía y es el mismo medicamento (nombre + presentación, sin tildes ni mayúsculas, o con un
 *    sinónimo de la tabla) conserva sus datos: sólo gana el número, la etiqueta y el alias del LNME;
 *  - lo editado o archivado por la clínica (origen «clinic») ninguna carga lo pisa ni lo reactiva;
 *  - lo que ya es un medicamento del catálogo base de Clinara no se duplica (se etiqueta en el código, LNME_BASE);
 *  - si hay duda (mismo principio activo y una concentración en común), no se une: se crea aparte y se reporta.
 * Las filas nuevas van en lote (INSERT de varias filas): contra Neon, una por una tardaría demasiado en el primer pedido.
 */
export interface LnmeLoadReport {
  created: number
  kept: number
  updated: number
  base: number
  matched: { no: number; lnme: string; drug: string; kind: MatchKind }[]
  doubts: { no: number; lnme: string; drug: string }[]
}

const COLUMNS = ['id', 'clinic_id', 'name', 'presentation', 'norm_key', 'active', 'created_by', 'created_at', 'origin', 'origin_label', 'lnme_no', 'lnme_match',
  'lnme_version', 'lnme_group', 'lnme_subgroup', 'lnme_name', 'form', 'lnme_routes', 'package', 'complementary', 'restriction', 'lnme_note', 'certainty',
  'presentation_full', 'alternatives', 'aliases'] as const

/** Los campos del LNME que se guardan en la fila (los mismos al crear y al etiquetar lo que ya existía). */
const lnmeFields = (it: LnmeItem) => ({
  lnme_no: it.no, lnme_version: LNME_META.version, lnme_group: it.group, lnme_subgroup: it.subgroup || null, lnme_name: it.name, form: it.form || null,
  lnme_routes: it.routes || null, package: it.package || null, complementary: it.complementary, restriction: it.restriction ?? null, lnme_note: it.note ?? null,
  certainty: it.certainty, presentation_full: it.presentationFull, alternatives: JSON.stringify(it.alternatives),
})
const TAG_FIELDS = Object.keys(lnmeFields(LNME_ITEMS[0])) as (keyof ReturnType<typeof lnmeFields>)[]
const same = (r: Row, f: ReturnType<typeof lnmeFields>) => TAG_FIELDS.every((k) => String(r[k] ?? '') === String(f[k] ?? ''))

const BASE_NOS = new Set(LNME_BASE.map((b) => b.no))
const label = (d: Row) => [d.name, d.presentation, d.concentration].filter(Boolean).join(' ')

async function insertMany(q: Sql, rows: unknown[][]) {
  const per = Math.floor(2000 / COLUMNS.length)
  for (let i = 0; i < rows.length; i += per) {
    const chunk = rows.slice(i, i + per)
    await q.run(`INSERT INTO clinic_drugs (${COLUMNS.join(',')}) VALUES ${chunk.map(() => `(${COLUMNS.map(() => '?').join(',')})`).join(',')} ON CONFLICT (clinic_id, norm_key) DO NOTHING`, chunk.flat())
  }
}

export async function loadLnme(q: Sql, clinicId: string): Promise<LnmeLoadReport> {
  const report: LnmeLoadReport = { created: 0, kept: 0, updated: 0, base: 0, matched: [], doubts: [] }
  const rows = await q.query('SELECT * FROM clinic_drugs WHERE clinic_id = ?', [clinicId])
  const byNo = new Map<number, Row>()
  for (const r of rows) if (r.lnme_no != null && !byNo.has(Number(r.lnme_no))) byNo.set(Number(r.lnme_no), r)
  const keys = new Set(rows.map((r) => String(r.norm_key)))
  // Lo que agregó la clínica y todavía no lleva número del LNME: candidatos a ser el mismo medicamento
  const own = rows.filter((r) => r.lnme_no == null)
  const taken = new Set<string>()
  const now = new Date().toISOString()
  const pending: unknown[][] = []
  const tag = async (r: Row, it: LnmeItem, kind: MatchKind) => {
    const aliases = [...new Set([...JSON.parse(String(r.aliases ?? '[]')) as string[], ...(it.name !== r.name ? [it.name] : []), ...it.aliases])]
    const f = lnmeFields(it)
    await q.run(`UPDATE clinic_drugs SET ${TAG_FIELDS.map((k) => `${k} = ?`).join(', ')}, lnme_match = ?, aliases = ? WHERE id = ?`,
      [...TAG_FIELDS.map((k) => f[k]), kind, JSON.stringify(aliases), String(r.id)])
    taken.add(String(r.id))
    report.matched.push({ no: it.no, lnme: `${it.name} | ${it.presentation}`, drug: label(r), kind })
  }
  for (const it of LNME_ITEMS) {
    const cur = byNo.get(it.no)
    if (cur) {
      // Ya cargado: lo de la clínica (emparejado, editado o archivado) no se toca; lo cargado se pone al día si cambió el archivo
      if (cur.origin === 'lnme' && cur.lnme_match === 'created' && !same(cur, lnmeFields(it))) {
        const f = lnmeFields(it)
        await q.run(`UPDATE clinic_drugs SET ${TAG_FIELDS.map((k) => `${k} = ?`).join(', ')}, aliases = ? WHERE id = ?`, [...TAG_FIELDS.map((k) => f[k]), JSON.stringify(it.aliases), String(cur.id)])
        report.updated++
      } else report.kept++
      continue
    }
    // ¿Lo tiene la clínica? Primero el mismo nombre y presentación, después con sinónimo
    const asDrug = (r: Row) => ({ name: String(r.name), presentation: [r.presentation, r.concentration].filter(Boolean).join(' ') })
    const free = own.filter((r) => !taken.has(String(r.id)))
    const exact = free.find((r) => sameDrug(it, asDrug(r)) === 'exact')
    const syn = exact ? undefined : free.find((r) => sameDrug(it, asDrug(r)) === 'synonym')
    if (exact || syn) { await tag((exact ?? syn)!, it, exact ? 'exact' : 'synonym'); continue }
    if (BASE_NOS.has(it.no)) { report.base++; continue }
    for (const r of own) if (doubtful(it, asDrug(r))) report.doubts.push({ no: it.no, lnme: `${it.name} | ${it.presentation}`, drug: label(r) })
    if (keys.has(it.key)) { report.kept++; continue }
    keys.add(it.key)
    const f = lnmeFields(it)
    const row: Record<(typeof COLUMNS)[number], unknown> = {
      id: randomUUID(), clinic_id: clinicId, name: it.name, presentation: it.presentation, norm_key: it.key, active: true, created_by: null, created_at: now,
      origin: 'lnme', origin_label: LNME_META.origin, lnme_match: 'created', aliases: JSON.stringify(it.aliases), ...f,
    }
    pending.push(COLUMNS.map((c) => row[c]))
    report.created++
  }
  await insertMany(q, pending)
  // Bitácora: la carga la hace la migración (equipo técnico), no una persona. Sin cambios, no se escribe nada.
  if (report.created || report.matched.length || report.updated) {
    await q.run('INSERT INTO audit (at, user_id, action, clinic_id) VALUES (?,?,?,?)', [now, 'sistema',
      `Cargó el ${LNME_META.origin} al vademécum: ${report.created} creado(s), ${report.matched.length} ya existía(n) (etiquetados)${report.updated ? `, ${report.updated} actualizado(s)` : ''}${report.doubts.length ? `; ${report.doubts.length} en duda, sin unir` : ''}`, clinicId])
  }
  return report
}
