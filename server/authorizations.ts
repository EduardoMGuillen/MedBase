import { randomUUID } from 'node:crypto'
import type { Row, Sql } from './sql.js'
import { clinicSettings, toAuthorization } from './mappers.js'
import { age as ageText } from '../src/lib/format.js'
import { yearsOld } from '../src/lib/inpatient.js'
import type { AuthorizationData } from '../src/lib/types.js'

/**
 * Datos que se imprimen en una autorización, congelados al generarla: clínica, paciente, médico responsable
 * y, en la de hospitalización, el ingreso y el acompañante. Si la genera enfermería, el médico que firma es
 * el que ingresó al paciente.
 */
export async function authorizationBase(q: Sql, h: Row, generatedBy: { id: string; role: string }) {
  const cid = String(h.clinic_id)
  const p = (await q.one('SELECT * FROM patients WHERE id = ? AND clinic_id = ?', [String(h.patient_id), cid]))!
  const doc = (await q.one('SELECT name, license FROM staff WHERE id = ?', [generatedBy.role === 'doctor' ? generatedBy.id : String(h.admitted_by)]))!
  const cfg = clinicSettings((await q.one('SELECT * FROM clinics WHERE id = ?', [cid]))!)
  const birth = String(p.birth_date ?? '')
  return {
    patient: {
      name: `${p.first_name} ${p.last_name}`, dni: p.dni ? String(p.dni) : undefined, age: ageText(birth), sex: (p.sex ?? 'F') as 'F' | 'M',
      record: cfg.recordUsesDni && p.dni ? String(p.dni) : String(p.record), minor: birth ? yearsOld(birth) < 18 : false,
    },
    doctor: { name: String(doc.name), license: doc.license ? String(doc.license) : undefined },
    clinic: { name: cfg.name, address: cfg.address, phone: cfg.phone, logo: cfg.logo },
    admission: { at: String(h.admitted_at), diagnosis: (JSON.parse(String(h.diagnoses ?? '[]')) as { label: string }[]).map((d) => d.label).join('; ') || undefined },
  } satisfies Partial<AuthorizationData>
}

/** La autorización de hospitalización vigente (pendiente o firmada) de la estancia, si existe. */
export const currentHospitalAuthorization = (q: Sql, hospId: string) =>
  q.one(`SELECT * FROM authorizations WHERE hospitalization_id = ? AND template = 'hospital' AND status IN ('pending','signed') ORDER BY created_at DESC LIMIT 1`, [hospId])

/**
 * Una sola autorización de hospitalización por estancia: se genera al ingresar (pendiente de firma) y, si ya
 * hay una vigente, se reutiliza. Al pasar de observación a hospitalización es la misma estancia, así que
 * también se reutiliza. Devuelve la autorización y si se creó ahora.
 */
export async function ensureHospitalAuthorization(q: Sql, h: Row, by: { id: string; role: string }, extra: Pick<AuthorizationData, 'companion' | 'representative'> = {}) {
  const existing = await currentHospitalAuthorization(q, String(h.id))
  if (existing) return { authorization: toAuthorization(existing), created: false }
  const companion = extra.companion ?? (h.companion_name ? { name: String(h.companion_name), phone: h.companion_phone ? String(h.companion_phone) : undefined, relation: h.companion_relation ? String(h.companion_relation) : undefined } : undefined)
  const data: AuthorizationData = { ...(await authorizationBase(q, h, by)), companion, representative: extra.representative }
  const id = randomUUID()
  await q.run(`INSERT INTO authorizations (id, clinic_id, hospitalization_id, patient_id, template, data, created_by, created_at) VALUES (?,?,?,?,'hospital',?,?,?)`,
    [id, String(h.clinic_id), String(h.id), String(h.patient_id), JSON.stringify(data), by.id, new Date().toISOString()])
  return { authorization: toAuthorization((await q.one('SELECT * FROM authorizations WHERE id = ?', [id]))!), created: true }
}

/** Si cambian el acompañante o el ingreso, la hoja de hospitalización que todavía no se firma se actualiza. */
export async function refreshPendingHospitalAuthorization(q: Sql, h: Row) {
  const a = await q.one(`SELECT * FROM authorizations WHERE hospitalization_id = ? AND template = 'hospital' AND status = 'pending'`, [String(h.id)])
  if (!a) return
  const data = JSON.parse(String(a.data)) as AuthorizationData
  data.admission = { at: String(h.admitted_at), diagnosis: (JSON.parse(String(h.diagnoses ?? '[]')) as { label: string }[]).map((d) => d.label).join('; ') || undefined }
  if (h.companion_name) data.companion = { name: String(h.companion_name), phone: h.companion_phone ? String(h.companion_phone) : undefined, relation: h.companion_relation ? String(h.companion_relation) : undefined }
  await q.run('UPDATE authorizations SET data = ? WHERE id = ?', [JSON.stringify(data), String(a.id)])
}
