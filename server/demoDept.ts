import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import type { Sql } from './sql.js'
import { DEMO_PASSWORD } from './db.js'
import { insertExams } from './routes/exams.js'
import { localISODate } from '../src/lib/format.js'
import type { ExamInput } from '../src/lib/types.js'

const MAIN = 'c-sb'

/** DM2 (ronda 11): un usuario demo por cargo nuevo, en la Clínica Santa Brígida (nombres de Emil, A22). Colegiación de prueba. */
export const DEPT_DEMO = [
  { id: 's-suazo', name: 'Lic. Paula Suazo', email: 'psuazo@demo.clinara', role: 'lab', position: 'microbiologist', license: 'DEMO-0001', color: '#6D4C9F' },
  { id: 's-erazo', name: 'Téc. Bryan Erazo', email: 'berazo@demo.clinara', role: 'lab', position: 'lab_tech', license: null, color: '#2F7D6D' },
  { id: 's-zepeda', name: 'Dr. Rafael Zepeda', email: 'rzepeda@demo.clinara', role: 'imaging', position: 'radiologist', license: 'DEMO-0002', color: '#8A5300' },
  { id: 's-chinchilla', name: 'Téc. Elena Chinchilla', email: 'echinchilla@demo.clinara', role: 'imaging', position: 'imaging_tech', license: null, color: '#B23A48' },
] as const

/**
 * DM2: en la clínica demo principal (solo si es demo y existe la Dra. Solórzano): los cuatro usuarios de Laboratorio e Imágenes,
 * «Laboratorio propio» e «Imágenes propias» activados, los turnos de ejemplo de la semana actual y unas pocas órdenes
 * pendientes «En la clínica» sobre pacientes demo que ya existen (hospitalización, observación y consulta externa), creadas
 * con el flujo normal por la Dra. Solórzano. No toca ningún otro perfil ni paciente. Idempotente; corre también al regenerar
 * la demo (los pacientes cambian y las órdenes se vuelven a crear).
 */
export async function addDeptDemo(q: Sql, now = new Date()) {
  const clinic = await q.one('SELECT id, is_demo FROM clinics WHERE id = ?', [MAIN])
  if (!clinic?.is_demo || !(await q.one(`SELECT 1 FROM staff WHERE id = 's-solorzano' AND email LIKE '%@demo.clinara'`))) return
  for (const s of DEPT_DEMO) {
    if (await q.one('SELECT 1 FROM staff WHERE id = ? OR lower(email) = ?', [s.id, s.email])) continue
    await q.run(`INSERT INTO staff (id, name, role, roles, email, license, color, active, password_hash, clinic_id, position) VALUES (?,?,?,?,?,?,?,TRUE,?,?,?)`,
      [s.id, s.name, s.role, JSON.stringify([s.role]), s.email, s.license, s.color, bcrypt.hashSync(DEMO_PASSWORD, 10), MAIN, s.position])
  }
  await q.run('UPDATE clinics SET has_lab = TRUE, has_imaging = TRUE WHERE id = ?', [MAIN])
  // Turnos de ejemplo, de lunes a viernes de la semana actual (DP6)
  const by = String((await q.one(`SELECT id FROM staff WHERE clinic_id = ? AND roles LIKE '%admin%' AND email LIKE '%@demo.clinara' ORDER BY id LIMIT 1`, [MAIN]))?.id ?? 's-solorzano')
  const monday = new Date(now); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  const plan: [string, 'lab' | 'imaging', string][] = [['s-suazo', 'lab', 'morning'], ['s-erazo', 'lab', 'morning'], ['s-erazo', 'lab', 'afternoon'], ['s-zepeda', 'imaging', 'morning'], ['s-chinchilla', 'imaging', 'morning'], ['s-chinchilla', 'imaging', 'afternoon']]
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday); d.setDate(monday.getDate() + i)
    const day = localISODate(d)
    for (const [staffId, dept, shift] of plan) {
      if (await q.one('SELECT 1 FROM duty_roster WHERE clinic_id = ? AND dept = ? AND day = ? AND staff_id = ? AND shift = ? AND removed_at IS NULL', [MAIN, dept, day, staffId, shift])) continue
      await q.run('INSERT INTO duty_roster (id, clinic_id, day, staff_id, assigned_by, assigned_at, dept, shift) VALUES (?,?,?,?,?,?,?,?)', [randomUUID(), MAIN, day, staffId, by, now.toISOString(), dept, shift])
    }
  }
  // Órdenes pendientes de ejemplo (una vez por juego de pacientes demo)
  const hosp = await q.one(`SELECT id, patient_id FROM hospitalizations WHERE clinic_id = ? AND status = 'active' AND kind = 'hospital' ORDER BY admitted_at LIMIT 1`, [MAIN])
  const obs = await q.one(`SELECT id, patient_id FROM hospitalizations WHERE clinic_id = ? AND status = 'active' AND kind = 'observation' ORDER BY admitted_at LIMIT 1`, [MAIN])
  const cons = await q.one(`SELECT c.id, c.patient_id FROM consultations c WHERE c.clinic_id = ? AND c.doctor_id = 's-solorzano' AND NOT EXISTS (SELECT 1 FROM hospitalizations h WHERE h.patient_id = c.patient_id AND h.status = 'active') ORDER BY c.date DESC LIMIT 1`, [MAIN])
  const marker = [hosp?.id, obs?.id, cons?.id].map((x) => x ?? '-').join('|')
  if ((await q.one(`SELECT value FROM meta WHERE key = 'dm2:orders'`))?.value === marker) return
  const at = new Date(now.getTime() - 40 * 60_000).toISOString()
  const e = (group: 'lab' | 'imaging', name: string, indication: string, extra: Partial<ExamInput> = {}): ExamInput => ({ group, name, indication, priority: 'routine', place: 'clinic', ...extra })
  if (hosp) await insertExams(q, { clinicId: MAIN, patientId: String(hosp.patient_id), hospitalizationId: String(hosp.id), by: 's-solorzano', at }, [
    e('lab', 'Hemograma', 'Control de leucocitos', { priority: 'urgent' }),
    e('imaging', 'Rayos X', 'Descartar neumonía', { subject: 'tórax', projections: ['PA', 'Lateral'], detailed: true }),
  ])
  if (obs) await insertExams(q, { clinicId: MAIN, patientId: String(obs.patient_id), hospitalizationId: String(obs.id), by: 's-solorzano', at }, [
    e('lab', 'Examen general de orina (EGO)', 'Disuria'),
    e('imaging', 'Ultrasonido', 'Dolor en hipocondrio derecho, descartar colelitiasis', { subject: 'hígado y vías biliares', detailed: true, priority: 'urgent' }),
  ])
  if (cons) await insertExams(q, { clinicId: MAIN, patientId: String(cons.patient_id), consultationId: String(cons.id), by: 's-solorzano', at }, [e('lab', 'Glucosa en ayunas', 'Control de diabetes')])
  await q.run(`INSERT INTO meta (key, value) VALUES ('dm2:orders', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`, [marker])
}
