import { randomUUID } from 'node:crypto'
import { GRACE_MINUTES } from '../src/lib/clinicalConfig.js'
import { GRACE_EXPIRED_TEXT } from '../src/lib/grace.js'
import { fail, type Row } from './http.js'
import type { Sql } from './sql.js'

/**
 * GE4 (ronda 9): periodo de gracia. Quien firmó o registró algo puede corregirlo durante GRACE_MINUTES desde la primera
 * firma (no se reinicia). Cada corrección guarda la versión anterior completa en `record_versions` y nunca se borra.
 * La hora es la del servidor.
 */
export const GRACE_MS = GRACE_MINUTES * 60_000
export type VersionKind = 'note' | 'dose' | 'vitals' | 'consultation' | 'exam_result' | 'material_use' | 'anesthesia'

/** Hasta cuándo se puede corregir (ISO), o undefined si el registro es de antes de GE4. */
export const graceUntil = (firstAt?: unknown) => (firstAt ? new Date(new Date(String(firstAt)).getTime() + GRACE_MS).toISOString() : undefined)

/** El mensaje de cuando vence: lo escrito queda en el borrador y se ofrece la adenda. */
export const GRACE_EXPIRED = GRACE_EXPIRED_TEXT

/** Falla si quien corrige no es el autor o si ya venció el plazo. */
export function assertGrace(userId: string, authorId: unknown, firstAt: unknown, what: string) {
  if (String(authorId) !== userId) fail(403, `Solo quien ${what} puede corregirlo.`)
  const until = graceUntil(firstAt)
  if (!until) fail(409, `Este registro es de antes del periodo de corrección: corrígelo con una adenda.`)
  if (Date.now() > new Date(until!).getTime()) fail(409, GRACE_EXPIRED)
}

/** Guarda la versión actual (antes de corregir) y devuelve el número de la nueva. */
export async function saveVersion(q: Sql, x: { clinicId: string; kind: VersionKind; id: string; version: number; data: unknown; authorId: string; at: string; by: string; reason?: string }) {
  await q.run('INSERT INTO record_versions (id, clinic_id, target_kind, target_id, version, data, author_id, at, replaced_by, replaced_at, reason) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    [randomUUID(), x.clinicId, x.kind, x.id, x.version, JSON.stringify(x.data), x.authorId, x.at, x.by, new Date().toISOString(), x.reason || null])
  return x.version + 1
}

export const toVersion = (r: Row) => ({
  version: Number(r.version), data: JSON.parse(String(r.data)), authorId: String(r.author_id), at: String(r.at),
  replacedBy: String(r.replaced_by), replacedAt: String(r.replaced_at), reason: r.reason ? String(r.reason) : undefined,
})

/** ¿Se imprimió o descargó? (receta) */
export async function printedAt(sql: Sql, kind: string, id: string) {
  const r = await sql.one('SELECT at FROM print_log WHERE target_kind = ? AND target_id = ? ORDER BY at LIMIT 1', [kind, id])
  return r ? String(r.at) : undefined
}
