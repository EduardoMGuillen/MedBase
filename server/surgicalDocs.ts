import { z } from 'zod'
import { fail, type Row } from './http.js'
import type { Sql } from './sql.js'
import { currentMarks } from './routes/me.js'
import { specialtyOf } from './prefs.js'
import { positionOf, signedName } from '../src/lib/positions.js'
import { mainRole, ROLE_LABEL } from '../src/lib/permissions.js'
import { latestLabs, type PreLabKey } from '../src/lib/preanesthesia.js'
import type { AnesthesiaSigner } from '../src/lib/anesthesia.js'
import type { Role } from '../src/lib/types.js'

/**
 * PQ4 y PQ5 (ronda 16): lo común de los documentos quirúrgicos (valoración preanestésica, registro de anestesia, recuento):
 * quién firma (copiado al firmar), la hoja en papel ya subida como archivo del expediente y los laboratorios de la valoración.
 */

export const j = <T>(v: unknown, d: T): T => { try { return v ? JSON.parse(String(v)) as T : d } catch { return d } }

/** Quien firma: nombre con prefijo, cargo o especialidad (o su rol, si no es médico), colegiado, firma y sello vigentes. */
export async function signerOf(q: Sql, staffId: string): Promise<AnesthesiaSigner> {
  const me = (await q.one('SELECT * FROM staff WHERE id = ?', [staffId]))!
  const m = await currentMarks(q, staffId)
  const pos = me.position ? String(me.position) : undefined
  const roles = j<Role[]>(me.roles, [String(me.role) as Role])
  const doctor = String(me.role) === 'doctor' || roles.includes('doctor')
  return {
    name: signedName({ name: String(me.name), docName: me.doc_name ? String(me.doc_name) : undefined, position: pos }),
    title: positionOf(pos)?.label ?? (doctor ? specialtyOf({ specialty: me.specialty ? String(me.specialty) : undefined }) : ROLE_LABEL[mainRole({ role: String(me.role) as Role, roles })]),
    license: me.license ? String(me.license) : undefined, signatureId: m.signatureId ?? undefined, stampId: m.stampId ?? undefined,
  }
}

/** «Subir en papel»: el cuerpo común (archivo ya unido, quién lo hizo, observación y, si reemplaza, cuál y por qué). */
export const paperBody = (who: string) => z.object({
  fileId: z.string().min(1),
  performedBy: z.object({ name: z.string().trim().min(3, `Escribe quién ${who}.`).max(120), staffId: z.string().optional() }).optional(),
  observation: z.string().trim().max(1000).optional(),
  replaces: z.object({ sheetId: z.string(), reason: z.string().trim().min(5, 'Escribe por qué se reemplaza.').max(500) }).optional(),
})

/** El archivo subido es de este paciente, lo subió quien llama y aún no es otro documento quirúrgico. */
export async function assertPaperFile(sql: Sql, cid: string, fileId: string, patientId: string, userId: string) {
  const file = (await sql.one('SELECT id, patient_id, uploaded_by, category FROM attachments WHERE id = ? AND clinic_id = ?', [fileId, cid])) ?? fail(404, 'El archivo no existe.')
  if (String(file!.patient_id) !== patientId || String(file!.uploaded_by) !== userId || String(file!.category) !== 'document') fail(400, 'El archivo no corresponde a este documento.')
  for (const t of ['anesthesia_sheets', 'preanesthesia_evals', 'surgical_counts']) {
    if (await sql.one(`SELECT 1 FROM ${t} WHERE file_id = ?`, [fileId])) fail(409, 'Ese archivo ya es un documento quirúrgico.')
  }
}

/** Una persona del personal de esta clínica; si no, solo queda el nombre escrito. */
export async function staffIdIn(sql: Sql, cid: string, id?: string) {
  return id && (await sql.one('SELECT 1 FROM staff WHERE id = ? AND clinic_id = ?', [id, cid])) ? id : undefined
}

/** El último resultado de Hb, Hto, plaquetas, TP/INR, glucosa y tipo y Rh del paciente (de los exámenes con valores). */
export async function patientLabs(sql: Sql, patientId: string): Promise<Partial<Record<PreLabKey, string>>> {
  const rows = await sql.query(`SELECT result FROM exam_orders WHERE patient_id = ? AND grp = 'lab' AND result IS NOT NULL AND status IN ('result','reviewed') ORDER BY status_at DESC NULLS LAST LIMIT 60`, [patientId])
  return latestLabs(rows.map((r: Row) => j<{ at?: string; values?: { analyte: string; value: string; unit?: string }[] }>(r.result, {}))
    .filter((r) => r.values?.length).map((r) => ({ at: r.at ?? '', values: r.values! })))
}
