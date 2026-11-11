import bcrypt from 'bcryptjs'
import { dmyTime } from '../src/lib/format.js'
import { defaultAnalyte, defaultValues, groupsFromLimits, mergeCriticalGroups, NURSE_DEFAULT_POSITION, type CriticalGroup } from '../src/lib/clinicalConfig.js'
import { EXAMS, examKey } from '../src/lib/exams.js'
import { randomUUID } from 'node:crypto'
import {
  BEDS, CASE_BED, CASE_PATIENT_IDS, CASE_STAFF, DEFAULT_SETTINGS, DEMO_CLINICS, DOCTOR_SETUP, INPATIENT_PATIENTS, MAIN_CLINIC, PATIENTS, SECOND_CLINIC, SERVICES, STAFF,
  OFFICE_CLINIC, seedAppointments, seedCases, seedClinical, seedHistory, seedInpatient, seedOffice, seedSecondClinic, seedUpcoming,
} from '../src/lib/seed.js'
import type { Appointment, Patient, Payment, Schedule } from '../src/lib/types.js'
import type { Row, Sql } from './sql.js'
import { clearCriticalFlags } from './ronda12.js'
import { backfillMissingOrders, syncStayOrders } from './medOrders.js'
import { SCENARIO_PATIENT_IDS, insertClinicScenarios, insertOfficeScenarios } from './demoScenarios.js'
import { ensureHospitalAuthorization } from './authorizations.js'
import { loadRonda7 } from './catalogLoader.js'
import { loadLabSources, loadRefValues } from './refLoader.js'
import { forceLnmeOnce, loadLnme } from './lnmeLoader.js'
import { closeVisitsOfInpatients } from './stayVisits.js'
import { cleanArchivedThresholds, loadImagingCatalog } from './ronda10.js'
import { loadRonda11Catalog } from './ronda11.js'
import { addDeptDemo } from './demoDept.js'
import { loadSupplyCatalog } from './supplies.js'
import { DEMO_TOTP_SECRET, insertExtraDemoUsers } from './demoUsers.js'
import { BASELINE_VERSION, SCHEMA } from './schema.js'
import { checkSteps, STEPS, type Step } from './migrations.js'

export { SCHEMA }

export const DEMO_PASSWORD = 'demo1234'


/** Inserta muchas filas en lotes, para que la carga inicial sea rápida aunque la base esté lejos. */
async function insertMany(q: Sql, table: string, columns: string[], rows: unknown[][]) {
  const per = Math.max(1, Math.floor(1000 / columns.length))
  for (let i = 0; i < rows.length; i += per) {
    const chunk = rows.slice(i, i + per)
    const values = chunk.map(() => `(${columns.map(() => '?').join(',')})`).join(',')
    await q.run(`INSERT INTO ${table} (${columns.join(',')}) VALUES ${values}`, chunk.flat())
  }
}

const initialized = new WeakMap<Sql, Promise<void>>()

/** Versión base y último paso aplicados en esta base (0 y 0 si la base está vacía). */
async function dbVersion(q: Sql) {
  // Se pregunta si la tabla existe en vez de atrapar el error: dentro de una transacción, un error la deja inservible.
  // Un fallo de conexión se propaga (antes cualquier error de lectura se tomaba por «hay que migrar»).
  const exists = await q.one<{ t: string | null }>(`SELECT to_regclass('public.meta')::text AS t`)
  const rows = exists?.t ? await q.query<{ key: string; value: string }>(`SELECT key, value FROM meta WHERE key IN ('schema', 'schema_step')`) : []
  const of = (k: string) => Number(rows.find((r) => r.key === k)?.value ?? 0) || 0
  return { base: of('schema'), step: of('schema_step') }
}

/**
 * Crea o actualiza el esquema y, si la base está vacía, carga la clínica de demo.
 *
 * - Base nueva o anterior a la versión base: ejecuta `SCHEMA` y las cargas de abajo, como siempre.
 * - Después, los pasos de `server/migrations.ts` que falten, cada uno una sola vez.
 * - Si la base ya está al día (o la dejó más adelante un despliegue más nuevo), no ejecuta nada: una consulta.
 *
 * Un candado de Postgres evita que dos instancias lo hagan al mismo tiempo; la versión se vuelve a leer con el candado
 * tomado, para que la segunda instancia no repita lo que acaba de hacer la primera.
 */
export function ensureDb(sql: Sql, steps: Step[] = STEPS) {
  const pending = initialized.get(sql)
  if (pending) return pending
  checkSteps(steps)
  const baseline = Number(BASELINE_VERSION)
  const lastStep = steps.length
  const upToDate = (v: { base: number; step: number }) => v.base > baseline || (v.base === baseline && v.step >= lastStep)
  const p = (async () => {
    if (upToDate(await dbVersion(sql))) return
    await sql.tx(async (q) => {
      await q.run('SELECT pg_advisory_xact_lock(7272741)')
      const now = await dbVersion(q)
      if (upToDate(now)) return
      if (now.base < baseline) await applyBaseline(q)
      for (const s of steps.filter((x) => x.id > (now.base < baseline ? 0 : now.step))) {
        await s.run(q)
        await q.run(`INSERT INTO meta (key, value) VALUES ('schema_step', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`, [String(s.id)])
      }
    })
  })().catch((e) => { initialized.delete(sql); throw e })
  initialized.set(sql, p)
  return p
}

/** El esquema base y sus cargas (todo idempotente): sobre una base nueva o una anterior a la versión base. */
async function applyBaseline(q: Sql) {
  await q.exec(SCHEMA)
  if (!(await q.one(`SELECT 1 FROM meta WHERE key = 'seeded'`))) await seed(q)
  else {
    await adoptSingleClinic(q)
    await addDemoInpatients(q)
    await addDemoCases(q)
    await linkPendingAdmissions(q)
    await addDemoOffice(q)
    await fixOfficeDemoTimes(q)
    await backfillOrders(q)
    await addDemoScenarios(q)
    await migrateObservationAuthorizations(q)
    // v84: usuarios demo para los casos de prueba (varios roles, cuenta desactivada, 2FA, clínica suspendida…)
    await insertExtraDemoUsers(q)
  }
  await migrateRxValidity(q)
  await migrateRoles(q)
  await migrateMarks(q)
  await migrateContacts(q)
  await migrateBedSpecialties(q)
  await migratePayments(q)
  await migrateLabsToExams(q)
  await migrateOfficeOwners(q)
  await migrateCriticalGroups(q)
  await migrateProcedureFollowups(q)
  for (const c of await q.query('SELECT id FROM clinics')) {
    await ensureExamCatalog(q, String(c.id))
    // CA1–CA3 (ronda 7): subgrupos, carga idempotente del catálogo y de los perfiles, y paquetes a perfiles
    await loadRonda7(q, String(c.id))
  }
  await markDemoClinics(q)
  // v62 (ronda 8, UM1 y UM2): fuentes, valores de referencia del .md y umbrales críticos con su fuente, en cada clínica
  await loadLabSources(q)
  for (const c of await q.query('SELECT id FROM clinics')) await loadRefValues(q, String(c.id))
  await migrateCriticalDefaults(q)
  // v70 (ronda 10, UM3): los umbrales archivados se quitan una vez (los predeterminados y los que tienen resultados, no)
  await cleanArchivedThresholds(q)
  // v66 (ronda 9, ME5): el LNME Honduras 2023 en el vademécum de cada clínica y consultorio (idempotente)
  for (const c of await q.query('SELECT id FROM clinics')) await loadLnme(q, String(c.id))
  // v73 (ronda 10, CA5): el catálogo de Imagen y gabinete del Anexo A (los estudios de antes se borran; las órdenes no cambian)
  for (const c of await q.query('SELECT id FROM clinics')) await loadImagingCatalog(q, String(c.id))
  // v74 (ronda 11): CA6, Imagen y gabinete con estudios genéricos; CA7, los archivados del catálogo se borran
  for (const c of await q.query('SELECT id FROM clinics')) await loadRonda11Catalog(q, String(c.id))
  // v78 (ronda 11, DM2): usuarios demo de Laboratorio e Imágenes, turnos y órdenes de ejemplo (solo la clínica demo)
  await addDeptDemo(q)
  // v71 (ronda 10, ME6): las 530 filas del .md, una vez con el .md mandando sobre lo que ya había (clínicas de demostración)
  await forceLnmeOnce(q)
  // v80 (ronda 12, LB3): sin umbrales críticos (los valores de referencia nuevos ya se cargaron arriba con loadRefValues)
  await clearCriticalFlags(q)
  // v57/v58 (ronda 8, CX2): nadie internado sigue a la vez en la consulta externa (idempotente)
  await closeVisitsOfInpatients(q)
  // v82 (ronda 14, RU1) y v83 (ronda 15, RU5 y RU8): el catálogo de material médico quirúrgico (v2), su periodo de registro y
  // los sets iniciales en cada clínica y consultorio
  for (const c of await q.query('SELECT id FROM clinics')) await loadSupplyCatalog(q, String(c.id))
  // v85 (ronda 16, RE2): administración y recepción abren la Consulta externa «Por médico» (una sola vez)
  await resetQueueViewOnce(q)
  // v85 (ronda 16, EN1): el puesto de enfermería (Licenciada o Auxiliar) según el prefijo del nombre
  await migrateNursePositions(q)
  // v89 (ronda 17): la Dra. Gálvez de la demo entra sin código de verificación (una sola vez)
  await disableDemoTotpOnce(q)
  // v90 (ronda 17, OB1): el checklist de órdenes en observación se activa en las clínicas existentes (una sola vez)
  await enableObsChecklistOnce(q)
  await q.run(`INSERT INTO meta (key, value) VALUES ('schema', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`, [BASELINE_VERSION])
  // Una base que se actualiza desde antes de la versión base empieza sin pasos aplicados
  await q.run(`DELETE FROM meta WHERE key = 'schema_step'`)
}

export const slugify = (name: string) =>
  name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'clinica'

const TENANT_TABLES = ['patients', 'appointments', 'vitals', 'consultations', 'prescriptions', 'payments', 'attachments', 'services', 'audit']

/**
 * Bases creadas antes de la v6 tenían una sola clínica: se crea esa clínica con su configuración
 * y se le asignan todos los registros existentes. No se borra nada.
 */
async function adoptSingleClinic(q: Sql) {
  if (await q.one('SELECT 1 FROM clinics LIMIT 1')) return
  if (!(await q.one('SELECT 1 FROM staff LIMIT 1'))) return
  const cfg: Record<string, unknown> = { ...DEFAULT_SETTINGS }
  for (const r of await q.query('SELECT key, value FROM settings')) cfg[String(r.key)] = JSON.parse(String(r.value))
  const id = MAIN_CLINIC
  await q.run(`INSERT INTO clinics (id, slug, name, address, phone, email, currency, rx_validity_days, reminder_template, active, created_at) VALUES (?,?,?,?,?,?,?,?,?,TRUE,?)`,
    [id, slugify(String(cfg.name)), cfg.name, cfg.address, cfg.phone, cfg.email, cfg.currency, Number(cfg.rxValidityDays), cfg.reminderTemplate, new Date().toISOString()])
  await q.run(`UPDATE staff SET clinic_id = ? WHERE clinic_id IS NULL AND role <> 'superadmin'`, [id])
  // La bitácora no admite UPDATE; sólo para asignarle la clínica se suspende el bloqueo dentro de esta transacción
  await q.exec('ALTER TABLE audit DISABLE TRIGGER audit_no_change')
  for (const t of TENANT_TABLES) await q.run(`UPDATE ${t} SET clinic_id = ? WHERE clinic_id IS NULL`, [id])
  await q.exec('ALTER TABLE audit ENABLE TRIGGER audit_no_change')
  // En una base de demostración se agrega también la cuenta de administración de la plataforma
  if (await q.one(`SELECT 1 FROM staff WHERE email LIKE '%@demo.clinara' LIMIT 1`)) {
    const sa = STAFF.find((x) => x.role === 'superadmin')!
    await q.run(`INSERT INTO staff (id, name, role, email, color, active, password_hash) VALUES (?,?,?,?,?,TRUE,?) ON CONFLICT DO NOTHING`,
      [sa.id, sa.name, sa.role, sa.email, sa.color, bcrypt.hashSync(DEMO_PASSWORD, 10)])
  }
}

const PATIENT_COLUMNS = ['id', 'record', 'first_name', 'last_name', 'birth_date', 'sex', 'phone', 'email', 'blood_type', 'allergies', 'conditions', 'insurance', 'created_at',
  'dni', 'civil_status', 'occupation', 'education', 'religion', 'address', 'emergency_name', 'emergency_phone', 'emergency_relation', 'background', 'clinic_id']
const patientRow = (p: Patient, clinic: string) => [p.id, p.record, p.firstName, p.lastName, p.birthDate, p.sex, p.phone, p.email ?? null, p.bloodType ?? null,
  JSON.stringify(p.allergies), JSON.stringify(p.conditions), p.insurance ?? null, p.createdAt,
  p.dni ?? null, p.civilStatus ?? null, p.occupation ?? null, p.education ?? null, p.religion ?? null, p.address ?? null,
  p.emergencyName ?? null, p.emergencyPhone ?? null, p.emergencyRelation ?? null, JSON.stringify(p.background ?? {}), clinic]

/** Carga la clínica de demostración. La agenda queda relativa al día en que se crea la base. */
export async function seed(q: Sql) {
  const hash = bcrypt.hashSync(DEMO_PASSWORD, 10)
  const { vitals, consultations, prescriptions } = seedClinical()
  const history = seedHistory()
  const today = seedAppointments()
  const upcoming = seedUpcoming(history.patients, today)
  const second = seedSecondClinic()
  const setups: Record<string, { schedule: Schedule; serviceId: string }> = { ...DOCTOR_SETUP, ...second.setup }
  const A = MAIN_CLINIC
  const B = SECOND_CLINIC
  const now = new Date().toISOString()

  await insertMany(q, 'clinics', ['id', 'slug', 'name', 'address', 'phone', 'email', 'currency', 'rx_validity_days', 'reminder_template', 'active', 'created_at'],
    DEMO_CLINICS.map((c) => [c.id, c.slug, c.name, c.address, c.phone, c.email, c.currency, c.rxValidityDays, c.reminderTemplate, true, now]))
  await insertMany(q, 'services', ['id', 'name', 'price', 'active', 'clinic_id'],
    [...SERVICES.map((x) => [x.id, x.name, x.price, x.active, A]), ...second.services.map((x) => [x.id, x.name, x.price, x.active, B])])
  await insertMany(q, 'staff', ['id', 'name', 'role', 'specialty', 'email', 'license', 'color', 'active', 'password_hash', 'schedule', 'service_id', 'clinic_id'],
    STAFF.map((x) => {
      const setup = setups[x.id]
      return [x.id, x.name, x.role, x.specialty ?? null, x.email, x.license ?? null, x.color, x.active, hash, setup ? JSON.stringify(setup.schedule) : null, setup?.serviceId ?? null, x.clinicId ?? null]
    }))
  await insertMany(q, 'patients', PATIENT_COLUMNS, [...[...PATIENTS, ...history.patients].map((p) => patientRow(p, A)), ...second.patients.map((p) => patientRow(p, B))])
  const arrived = new Date(Date.now() - 12 * 60000).toISOString()
  const apptRow = (a: Appointment, clinic: string) => [a.id, a.patientId, a.doctorId, a.start, a.minutes, a.reason, a.type, a.status,
    a.status === 'arrived' || a.status === 'triaged' ? arrived : null, ['a7', 'a13'].includes(a.id) ? 'online' : a.source ?? 'staff', clinic]
  await insertMany(q, 'appointments', ['id', 'patient_id', 'doctor_id', 'start', 'minutes', 'reason', 'type', 'status', 'arrived_at', 'source', 'clinic_id'],
    [...[...history.appointments, ...today, ...upcoming].map((a) => apptRow(a, A)), ...second.appointments.map((a) => apptRow(a, B))])
  await insertMany(q, 'vitals', ['id', 'patient_id', 'appointment_id', 'taken_by', 'taken_at', 'systolic', 'diastolic', 'heart_rate', 'temperature', 'spo2', 'weight_kg', 'height_cm', 'pain_scale', 'notes', 'resp_rate', 'glucose', 'chief_complaint', 'clinic_id'],
    vitals.map((v) => [v.id, v.patientId, v.appointmentId ?? null, v.takenBy, v.takenAt, v.systolic, v.diastolic, v.heartRate, v.temperature, v.spo2, v.weightKg, v.heightCm, v.painScale ?? null, v.notes ?? null,
      v.respRate ?? null, v.glucose ?? null, v.chiefComplaint ?? null, A]))
  await insertMany(q, 'consultations', ['id', 'patient_id', 'doctor_id', 'appointment_id', 'date', 'reason', 'symptoms', 'symptom_onset', 'history', 'exam', 'diagnoses', 'plan', 'vitals_id', 'prescription_id', 'orders', 'clinic_id'],
    [...history.consultations, ...consultations].map((c) => [c.id, c.patientId, c.doctorId, c.appointmentId ?? null, c.date, c.reason, JSON.stringify(c.symptoms),
      c.symptomOnset ?? null, c.history, c.exam, JSON.stringify(c.diagnoses), c.plan, c.vitalsId ?? null, c.prescriptionId ?? null, JSON.stringify(c.orders), A]))
  await insertMany(q, 'prescriptions', ['id', 'folio', 'patient_id', 'doctor_id', 'consultation_id', 'issued_at', 'items', 'clinic_id'],
    prescriptions.map((r) => [r.id, r.folio, r.patientId, r.doctorId, r.consultationId, r.issuedAt, JSON.stringify(r.items), A]))

  // Cobros: historial y dos consultas de esta mañana (la de Rosa Elena queda pendiente para probar la caja)
  let n = history.lastReceipt
  const payments: Payment[] = [...history.payments]
  for (const [apptId, svc] of [['a1', 'svc-mi'], ['a8', 'svc-ped']] as const) {
    const a = today.find((x) => x.id === apptId)!
    const sv = SERVICES.find((x) => x.id === svc)!
    payments.push({ id: `tp-${apptId}`, receiptNo: `R-${String(++n).padStart(6, '0')}`, appointmentId: apptId, patientId: a.patientId,
      items: [{ serviceId: sv.id, name: sv.name, price: sv.price, qty: 1 }], discount: 0, total: sv.price, method: 'card', reference: 'DEMO', receivedBy: 's-quiroz',
      paidAt: new Date(new Date(a.start).getTime() + 40 * 60000).toISOString() })
  }
  await insertMany(q, 'payments', ['id', 'receipt_no', 'appointment_id', 'patient_id', 'items', 'discount', 'total', 'method', 'reference', 'received_by', 'paid_at', 'clinic_id'],
    payments.map((p) => [p.id, p.receiptNo, p.appointmentId ?? null, p.patientId, JSON.stringify(p.items), p.discount, p.total, p.method, p.reference ?? null, p.receivedBy, p.paidAt, A]))

  await insertInpatients(q)
  await insertCases(q)
  await insertOffice(q)
  await insertClinicScenarios(q, MAIN_CLINIC, textPdf)
  await insertOfficeScenarios(q, OFFICE_CLINIC)
  await insertExtraDemoUsers(q)
  await q.run(`INSERT INTO meta (key, value) VALUES ('seeded', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`, [now])
}

/** Camas, hospitalizados y seguimientos de la demo. */
async function insertInpatients(q: Sql) {
  const A = MAIN_CLINIC
  const d = seedInpatient()
  // Una base que venía de una sola clínica no tiene la segunda clínica de demostración
  const clinics = new Set((await q.query('SELECT id FROM clinics')).map((r) => String(r.id)))
  await insertMany(q, 'beds', ['id', 'clinic_id', 'room', 'label', 'active'],
    BEDS.filter((b) => clinics.has(b.clinicId)).map((b) => [b.id, b.clinicId, b.room, b.label, b.active]))
  await insertMany(q, 'patients', ['id', 'record', 'first_name', 'last_name', 'birth_date', 'sex', 'phone', 'blood_type', 'allergies', 'conditions', 'insurance', 'created_at',
    'dni', 'civil_status', 'occupation', 'education', 'address', 'emergency_name', 'emergency_phone', 'emergency_relation', 'background', 'clinic_id'],
    INPATIENT_PATIENTS.map((p) => [p.id, p.record, p.firstName, p.lastName, p.birthDate, p.sex, p.phone, p.bloodType ?? null, JSON.stringify(p.allergies), JSON.stringify(p.conditions),
      p.insurance ?? null, p.createdAt, p.dni ?? null, p.civilStatus ?? null, p.occupation ?? null, p.education ?? null, p.address ?? null, p.emergencyName ?? null,
      p.emergencyPhone ?? null, p.emergencyRelation ?? null, JSON.stringify(p.background ?? {}), A]))
  await insertMany(q, 'hospitalizations', ['id', 'clinic_id', 'patient_id', 'bed_id', 'admitted_at', 'admitted_by', 'reason', 'diagnoses', 'companion_name', 'companion_relation',
    'companion_phone', 'patient_phone', 'status'],
    d.hospitalizations.map((h) => [h.id, A, h.patientId, h.bedId, h.admittedAt, h.admittedBy, h.reason, JSON.stringify(h.diagnoses), h.companionName ?? null,
      h.companionRelation ?? null, h.companionPhone ?? null, h.patientPhone ?? null, h.status]))
  await insertMany(q, 'hosp_notes', ['id', 'clinic_id', 'hospitalization_id', 'kind', 'author_id', 'at', 'subjective', 'objective', 'assessment', 'plan', 'text'],
    d.notes.map((n) => [n.id, A, n.hospitalizationId, n.kind, n.authorId, n.at, n.subjective, n.objective, n.assessment, n.plan, n.text]))
  await insertMany(q, 'hosp_meds', ['id', 'clinic_id', 'hospitalization_id', 'note_id', 'drug', 'presentation', 'dose', 'route', 'every_hours', 'prn', 'first_at', 'instructions',
    'ordered_by', 'ordered_at', 'stopped_at', 'stopped_by'],
    d.meds.map((m) => [m.id, A, m.hospitalizationId, m.noteId ?? null, m.drug, m.presentation ?? null, m.dose, m.route, m.everyHours ?? null, m.prn, m.firstAt,
      m.instructions ?? null, m.orderedBy, m.orderedAt, m.stoppedAt ?? null, m.stoppedBy ?? null]))
  await insertMany(q, 'hosp_doses', ['id', 'clinic_id', 'med_id', 'scheduled_at', 'given_at', 'given_by', 'status', 'note'],
    d.doses.map((x) => [x.id, A, x.medId, x.scheduledAt ?? null, x.givenAt, x.givenBy, x.status, x.note ?? null]))
  await insertMany(q, 'hosp_procedures', ['id', 'clinic_id', 'hospitalization_id', 'kind', 'name', 'scheduled_at', 'status', 'notes', 'created_by', 'created_at', 'updated_by', 'updated_at'],
    d.procedures.map((x) => [x.id, A, x.hospitalizationId, x.kind, x.name, x.scheduledAt ?? null, x.status, x.notes ?? null, x.createdBy, x.createdAt, x.updatedBy ?? null, x.updatedAt ?? null]))
  for (const l of d.labs) {
    const pdf = textPdf(`${l.title} - Laboratorio de demostracion`, [`Fecha de toma: ${dmyTime(l.takenAt)}`, '', ...l.lines])
    await q.run('INSERT INTO attachments (id, patient_id, name, mime, size, category, data, uploaded_by, uploaded_at, clinic_id, title, taken_at, hospitalization_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [l.id, l.patientId, `${l.title}.pdf`, 'application/pdf', pdf.length, 'lab', new Uint8Array(pdf), 's-urbina', l.takenAt, A, l.title, l.takenAt, l.hospitalizationId])
  }
  await insertMany(q, 'followups', ['id', 'clinic_id', 'patient_id', 'kind', 'title', 'due_date', 'every_days', 'notes', 'created_by', 'created_at', 'notified_at', 'active'],
    d.followups.map((f) => [f.id, A, f.patientId, f.kind, f.title, f.dueDate, f.everyDays ?? null, f.notes ?? null, f.createdBy, f.createdAt, f.notifiedAt ?? null, f.active]))
}

/**
 * Una base de demostración creada antes de la v7 no tiene camas: se le agregan los hospitalizados
 * de la demo para que el módulo se pueda probar sin reiniciar los datos.
 */
async function addDemoInpatients(q: Sql) {
  if (!(await q.one(`SELECT 1 FROM clinics WHERE id = ?`, [MAIN_CLINIC]))) return
  if (!(await q.one(`SELECT 1 FROM staff WHERE id = 's-solorzano' AND email LIKE '%@demo.clinara'`))) return
  if (await q.one('SELECT 1 FROM beds LIMIT 1')) return
  if (await q.one(`SELECT 1 FROM patients WHERE id IN (${INPATIENT_PATIENTS.map(() => '?').join(',')}) LIMIT 1`, INPATIENT_PATIENTS.map((p) => p.id))) return
  await insertInpatients(q)
}

/**
 * Casos completos de la demo. Expedientes, folios y recibos siguen después de los que ya tenga la
 * clínica, para no chocar con los que el personal haya registrado al probar.
 */
async function insertCases(q: Sql) {
  const A = MAIN_CLINIC
  const year = new Date().getFullYear()
  const rec = await q.one<{ n: number }>(`SELECT COALESCE(MAX(CAST(SUBSTR(record, 5) AS INTEGER)), 400)::int AS n FROM patients WHERE clinic_id = ? AND record ~ '^EXP-[0-9]+$'`, [A])
  const rx = await q.one(`SELECT folio FROM prescriptions WHERE clinic_id = ? AND folio LIKE ? ORDER BY folio DESC LIMIT 1`, [A, `RX-${year}-%`])
  const pay = await q.one(`SELECT receipt_no FROM payments WHERE clinic_id = ? ORDER BY receipt_no DESC LIMIT 1`, [A])
  const d = seedCases({
    record: Number(rec!.n) + 1,
    folio: rx ? Number(String(rx.folio).split('-')[2]) + 1 : 1001,
    receipt: (pay ? Number(String(pay.receipt_no).slice(2)) : 0) + 1,
  })
  await insertMany(q, 'patients', PATIENT_COLUMNS, d.patients.map((p) => patientRow(p, A)))
  await insertMany(q, 'appointments', ['id', 'patient_id', 'doctor_id', 'start', 'minutes', 'reason', 'type', 'status', 'source', 'clinic_id'],
    d.appointments.map((a) => [a.id, a.patientId, a.doctorId, a.start, a.minutes, a.reason, a.type, a.status, 'staff', A]))
  await insertMany(q, 'vitals', ['id', 'patient_id', 'appointment_id', 'taken_by', 'taken_at', 'systolic', 'diastolic', 'heart_rate', 'temperature', 'spo2', 'weight_kg', 'height_cm', 'pain_scale', 'notes', 'resp_rate', 'glucose', 'chief_complaint', 'clinic_id'],
    d.vitals.map((v) => [v.id, v.patientId, v.appointmentId ?? null, v.takenBy, v.takenAt, v.systolic ?? null, v.diastolic ?? null, v.heartRate ?? null, v.temperature ?? null, v.spo2 ?? null,
      v.weightKg ?? null, v.heightCm ?? null, v.painScale ?? null, v.notes ?? null, v.respRate ?? null, v.glucose ?? null, v.chiefComplaint ?? null, A]))
  await insertMany(q, 'consultations', ['id', 'patient_id', 'doctor_id', 'appointment_id', 'date', 'reason', 'symptoms', 'history', 'exam', 'observations', 'diagnoses', 'plan', 'vitals_id', 'prescription_id', 'orders', 'clinic_id'],
    d.consultations.map((c) => [c.id, c.patientId, c.doctorId, c.appointmentId ?? null, c.date, c.reason, JSON.stringify(c.symptoms), c.history, c.exam, c.observations ?? '',
      JSON.stringify(c.diagnoses), c.plan, c.vitalsId ?? null, c.prescriptionId ?? null, JSON.stringify(c.orders), A]))
  await insertMany(q, 'prescriptions', ['id', 'folio', 'patient_id', 'doctor_id', 'consultation_id', 'hospitalization_id', 'issued_at', 'items', 'clinic_id'],
    d.prescriptions.map((r) => [r.id, r.folio, r.patientId, r.doctorId, r.consultationId, r.hospitalizationId ?? null, r.issuedAt, JSON.stringify(r.items), A]))
  await insertMany(q, 'payments', ['id', 'receipt_no', 'appointment_id', 'patient_id', 'items', 'discount', 'total', 'method', 'reference', 'received_by', 'paid_at', 'clinic_id'],
    d.payments.map((p) => [p.id, p.receiptNo, p.appointmentId ?? null, p.patientId, JSON.stringify(p.items), p.discount, p.total, p.method, p.reference ?? null, p.receivedBy, p.paidAt, A]))
  await insertMany(q, 'hospitalizations', ['id', 'clinic_id', 'patient_id', 'bed_id', 'consultation_id', 'admitted_at', 'admitted_by', 'reason', 'diagnoses', 'companion_name',
    'companion_relation', 'companion_phone', 'patient_phone', 'status', 'discharged_at', 'discharged_by', 'prescription_id'],
    d.hospitalizations.map((h) => [h.id, A, h.patientId, h.bedId, h.consultationId ?? null, h.admittedAt, h.admittedBy, h.reason, JSON.stringify(h.diagnoses), h.companionName ?? null,
      h.companionRelation ?? null, h.companionPhone ?? null, h.patientPhone ?? null, h.status, h.dischargedAt ?? null, h.dischargedBy ?? null, h.prescriptionId ?? null]))
  // Igual que la API: las notas médicas guardan sus órdenes y la de egreso sus datos
  await insertMany(q, 'hosp_notes', ['id', 'clinic_id', 'hospitalization_id', 'kind', 'author_id', 'at', 'subjective', 'objective', 'assessment', 'plan', 'text', 'data'],
    d.notes.map((n) => [n.id, A, n.hospitalizationId, n.kind, n.authorId, n.at, n.subjective, n.objective, n.assessment, n.plan, n.text,
      n.discharge ? JSON.stringify(n.discharge) : n.orders ? JSON.stringify({ orders: n.orders }) : null]))
  await insertMany(q, 'hosp_meds', ['id', 'clinic_id', 'hospitalization_id', 'note_id', 'drug', 'presentation', 'dose', 'route', 'every_hours', 'prn', 'first_at', 'instructions',
    'ordered_by', 'ordered_at', 'stopped_at', 'stopped_by'],
    d.meds.map((m) => [m.id, A, m.hospitalizationId, m.noteId ?? null, m.drug, m.presentation ?? null, m.dose, m.route, m.everyHours ?? null, m.prn, m.firstAt,
      m.instructions ?? null, m.orderedBy, m.orderedAt, m.stoppedAt ?? null, m.stoppedBy ?? null]))
  await insertMany(q, 'hosp_doses', ['id', 'clinic_id', 'med_id', 'scheduled_at', 'given_at', 'given_by', 'status', 'note'],
    d.doses.map((x) => [x.id, A, x.medId, x.scheduledAt ?? null, x.givenAt, x.givenBy, x.status, x.note ?? null]))
  await insertMany(q, 'hosp_procedures', ['id', 'clinic_id', 'hospitalization_id', 'kind', 'name', 'scheduled_at', 'status', 'notes', 'created_by', 'created_at', 'updated_by', 'updated_at'],
    d.procedures.map((x) => [x.id, A, x.hospitalizationId, x.kind, x.name, x.scheduledAt ?? null, x.status, x.notes ?? null, x.createdBy, x.createdAt, x.updatedBy ?? null, x.updatedAt ?? null]))
  for (const l of d.labs) {
    const pdf = textPdf(`${l.title} - Estudio de demostracion`, [`Fecha de toma: ${dmyTime(l.takenAt)}`, '', ...l.lines])
    await q.run('INSERT INTO attachments (id, patient_id, name, mime, size, category, data, uploaded_by, uploaded_at, clinic_id, title, taken_at, hospitalization_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [l.id, l.patientId, `${l.title}.pdf`, 'application/pdf', pdf.length, l.category, new Uint8Array(pdf), 's-urbina', l.takenAt, A, l.title, l.takenAt, l.hospitalizationId ?? null])
  }
  await insertMany(q, 'followups', ['id', 'clinic_id', 'patient_id', 'kind', 'title', 'due_date', 'every_days', 'notes', 'created_by', 'created_at', 'notified_at', 'active'],
    d.followups.map((f) => [f.id, A, f.patientId, f.kind, f.title, f.dueDate, f.everyDays ?? null, f.notes ?? null, f.createdBy, f.createdAt, f.notifiedAt ?? null, f.active]))
}

/**
 * Una base de demostración que ya existía recibe los casos completos sin reiniciar sus datos.
 * Si falta algo de lo que usan (personal de demo, la cama) no se cargan, para no romper la actualización.
 */
async function addDemoCases(q: Sql) {
  if (!(await q.one(`SELECT 1 FROM clinics WHERE id = ?`, [MAIN_CLINIC]))) return
  const list = (ids: string[]) => ids.map(() => '?').join(',')
  const staff = await q.query(`SELECT id FROM staff WHERE id IN (${list(CASE_STAFF)}) AND clinic_id = ? AND email LIKE '%@demo.clinara'`, [...CASE_STAFF, MAIN_CLINIC])
  if (staff.length < CASE_STAFF.length) return
  if (!(await q.one(`SELECT 1 FROM beds WHERE id = ? AND clinic_id = ?`, [CASE_BED, MAIN_CLINIC]))) return
  if (await q.one(`SELECT 1 FROM patients WHERE id IN (${list(CASE_PATIENT_IDS)}) LIMIT 1`, CASE_PATIENT_IDS)) return
  await insertCases(q)
}

/** Consultorio de demostración: la Dra. Isabel Pacheco con su asistente, agenda de hoy, recetas y una paciente en observación. */
async function insertOffice(q: Sql) {
  const d = seedOffice()
  const c = d.clinic
  const now = new Date().toISOString()
  await q.run(`INSERT INTO clinics (id, slug, name, address, phone, email, currency, rx_validity_days, reminder_template, active, created_at, kind, owner_id, specialty, license, setup_done_at)
    VALUES (?,?,?,?,?,?,?,?,?,TRUE,?,'office',?,?,?,?)`,
    [c.id, c.slug, c.name, c.address, c.phone, c.email, c.currency, c.rxValidityDays, c.reminderTemplate, now, d.doctorId, c.specialty, c.license, now])
  await insertMany(q, 'services', ['id', 'name', 'price', 'active', 'clinic_id'], d.services.map((x) => [x.id, x.name, x.price, x.active, c.id]))
  const hash = bcrypt.hashSync(DEMO_PASSWORD, 10)
  await insertMany(q, 'staff', ['id', 'name', 'role', 'specialty', 'email', 'license', 'color', 'active', 'password_hash', 'schedule', 'service_id', 'clinic_id'],
    d.staff.map((x) => [x.id, x.name, x.role, x.specialty ?? null, x.email, x.license ?? null, x.color, true, hash, x.role === 'doctor' ? JSON.stringify(d.schedule) : null,
      x.role === 'doctor' ? d.serviceId : null, c.id]))
  await insertMany(q, 'patients', PATIENT_COLUMNS, d.patients.map((p) => patientRow(p, c.id)))
  await q.run(`UPDATE patients SET guardian_name = 'Lourdes Rivera', guardian_dni = '0801-1988-07766', guardian_relation = 'Madre' WHERE id = 'r3'`)
  await insertMany(q, 'appointments', ['id', 'patient_id', 'doctor_id', 'start', 'minutes', 'reason', 'type', 'status', 'arrived_at', 'source', 'clinic_id'],
    d.appointments.map((a) => [a.id, a.patientId, a.doctorId, a.start, a.minutes, a.reason, a.type, a.status,
      ['arrived', 'triaged'].includes(a.status) ? new Date(Date.now() - 10 * 60_000).toISOString() : null, 'staff', c.id]))
  // Signos de la paciente que ya pasó por preclínica
  const triaged = d.appointments.find((a) => a.status === 'triaged')!
  await q.run(`INSERT INTO vitals (id, patient_id, appointment_id, taken_by, taken_at, systolic, diastolic, heart_rate, temperature, spo2, weight_kg, height_cm, resp_rate, chief_complaint, clinic_id)
    VALUES ('v-al-1', ?, ?, 's3-cardona', ?, 112, 72, 96, 38.4, 98, 61, 160, 18, 'Dolor de garganta y fiebre desde ayer', ?)`, [triaged.patientId, triaged.id, new Date(Date.now() - 5 * 60_000).toISOString(), c.id])
  for (const k of d.consultations) {
    const date = new Date(k.appt.start).toISOString()
    const rx = d.prescriptions.find((r) => r.consultationId === k.id)
    if (rx) await q.run(`INSERT INTO prescriptions (id, folio, patient_id, doctor_id, consultation_id, issued_at, items, clinic_id) VALUES (?,?,?,?,?,?,?,?)`,
      [rx.id, rx.folio, rx.patientId, rx.doctorId, rx.consultationId, rx.issuedAt, JSON.stringify(rx.items), c.id])
    await q.run(`INSERT INTO consultations (id, patient_id, doctor_id, appointment_id, date, reason, symptoms, history, exam, diagnoses, plan, prescription_id, orders, clinic_id, indications, admit_kind, meds)
      VALUES (?,?,?,?,?,?,'[]','',?,?,?,?,?,?,?,?,?)`,
      [k.id, k.patientId, d.doctorId, k.appt.id, date, k.reason, k.exam, JSON.stringify(k.dx), k.orders.map((o, i) => `${i + 1}. ${o}`).join('\n'), rx?.id ?? null,
        JSON.stringify(k.orders), c.id, JSON.stringify(k.orders), k.observe ? 'observation' : null, JSON.stringify(k.items)])
    if (!k.observe) continue
    const stay = `h-${k.id}`
    await q.run(`INSERT INTO hospitalizations (id, clinic_id, patient_id, bed_id, consultation_id, admitted_at, admitted_by, reason, diagnoses, patient_phone, status, kind)
      VALUES (?,?,?,NULL,?,?,?,?,?,?,'active','observation')`, [stay, c.id, k.patientId, k.id, date, d.doctorId, k.reason, JSON.stringify(k.dx), '3256-5050'])
    await syncStayOrders(q, { clinicId: c.id, hospitalizationId: stay })
  }
}

/**
 * v24: el consultorio de demostración se cargó en Vercel, que corre en UTC, a las 18:3x de Honduras (00:3x UTC del
 * día siguiente). "Hoy" fue el día siguiente y las horas locales ("08:30") se leyeron como UTC: la observación de
 * Gabriela Matamoros quedó "27 oct, 02:30". Sólo se corrigen las filas que creó la semilla (por su id) y sólo si
 * siguen desfasadas (la hora guardada es la hora local leída como UTC), así que es idempotente. Las horas reales
 * (llegada, preclínica, autorización) no se tocan.
 */
export async function fixOfficeDemoTimes(q: Sql) {
  const k = await q.one(`SELECT c.date, a.start FROM consultations c JOIN appointments a ON a.id = c.appointment_id WHERE c.id = 'k-r5-1' AND c.clinic_id = ?`, [OFFICE_CLINIC])
  if (!k || String(k.date) !== `${String(k.start).slice(0, 19)}.000Z`) return
  const clinic = (await q.one('SELECT created_at FROM clinics WHERE id = ?', [OFFICE_CLINIC]))!
  // Día local (Honduras) en que se cargó la demo: las citas "de hoy" deben caer ese día
  const loadedOn = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Tegucigalpa' }).format(new Date(String(clinic.created_at)))
  const today = await q.one(`SELECT start FROM appointments WHERE id = 'c201' AND clinic_id = ?`, [OFFICE_CLINIC])
  const dayShift = today && String(today.start).slice(0, 10) > loadedOn ? -1 : 0
  const offsetMs = 6 * 3_600_000 + dayShift * 24 * 3_600_000
  // AN1: corrige una hora de la demo, no el contenido clínico; se permite sólo dentro de esta transacción
  await q.run(`SELECT set_config('clinara.note_maintenance', 'on', true)`)
  const iso = (v: unknown) => new Date(new Date(String(v)).getTime() + offsetMs).toISOString()
  const naive = (v: unknown) => { const d = new Date(`${String(v).slice(0, 19)}Z`); d.setUTCDate(d.getUTCDate() + dayShift); return d.toISOString().slice(0, 19) }
  for (const a of await q.query(`SELECT id, start FROM appointments WHERE clinic_id = ? AND id ~ '^c2[0-9]{2}$'`, [OFFICE_CLINIC])) await q.run('UPDATE appointments SET start = ? WHERE id = ?', [naive(a.start), String(a.id)])
  for (const c of await q.query(`SELECT id, date FROM consultations WHERE clinic_id = ? AND id LIKE 'k-r%'`, [OFFICE_CLINIC])) await q.run('UPDATE consultations SET date = ? WHERE id = ?', [iso(c.date), String(c.id)])
  for (const r of await q.query(`SELECT id, issued_at FROM prescriptions WHERE clinic_id = ? AND id LIKE 'rx-k-r%'`, [OFFICE_CLINIC])) await q.run('UPDATE prescriptions SET issued_at = ? WHERE id = ?', [iso(r.issued_at), String(r.id)])
  for (const h of await q.query(`SELECT id, admitted_at FROM hospitalizations WHERE clinic_id = ? AND id LIKE 'h-k-r%'`, [OFFICE_CLINIC])) {
    await q.run('UPDATE hospitalizations SET admitted_at = ? WHERE id = ?', [iso(h.admitted_at), String(h.id)])
    for (const m of await q.query(`SELECT id, ordered_at, first_at FROM hosp_meds WHERE hospitalization_id = ? AND source = 'consultation'`, [String(h.id)])) {
      await q.run('UPDATE hosp_meds SET ordered_at = ?, first_at = ? WHERE id = ?', [iso(m.ordered_at), iso(m.first_at), String(m.id)])
    }
  }
  await q.run('INSERT INTO audit (at, user_id, action, clinic_id) VALUES (?,?,?,?)', [new Date().toISOString(), 'sistema',
    'Actualización: se corrigió la hora de los datos de demostración del consultorio (se habían cargado con la hora UTC)', OFFICE_CLINIC])
}

/**
 * v24: estancias activas a las que les faltan en la hoja los medicamentos de su consulta de origen (las que se
 * crearon antes de la función única, como la observación que luego pasó a hospitalización). Se crean las que
 * faltan, sin tocar las existentes, y cada una queda en la bitácora. Idempotente.
 */
async function backfillOrders(q: Sql) {
  const now = new Date().toISOString()
  for (const l of await backfillMissingOrders(q, { dryRun: false, now })) {
    await q.run('INSERT INTO audit (at, user_id, action, clinic_id) VALUES (?,?,?,?)', [now, 'sistema',
      `Actualización: pasó a la hoja de medicamentos ${l.drug} de ${l.patient}, indicado en su consulta externa y que faltaba`, l.clinicId])
  }
}

/** Una base de demostración que ya existía recibe el consultorio de demostración sin reiniciar sus datos. */
async function addDemoOffice(q: Sql) {
  if (!(await q.one(`SELECT 1 FROM clinics WHERE id = ?`, [MAIN_CLINIC]))) return
  if (!(await q.one(`SELECT 1 FROM staff WHERE id = 's-solorzano' AND email LIKE '%@demo.clinara'`))) return
  if (await q.one(`SELECT 1 FROM clinics WHERE id = ?`, [OFFICE_CLINIC])) return
  if (await q.one(`SELECT 1 FROM staff WHERE lower(email) IN ('ipacheco@demo.clinara', 'lcardona@demo.clinara')`)) return
  await insertOffice(q)
}

/**
 * v26 (A3): las autorizaciones "No aplica (observación)" se archivan (no se borran). Una estancia que pasó de
 * observación a hospitalización sin autorización de hospitalización recibe una pendiente de firma, como un ingreso
 * directo. Sólo las estancias abiertas: en una ya egresada no se puede firmar.
 */
export async function migrateObservationAuthorizations(q: Sql) {
  await q.run(`UPDATE authorizations SET archived_at = ?, archived_reason = 'La observación no lleva autorización de hospitalización (archivada en la v26).'
    WHERE status = 'not_applicable' AND archived_at IS NULL`, [new Date().toISOString()])
  const stays = await q.query(`SELECT h.* FROM hospitalizations h WHERE h.status = 'active' AND h.kind = 'hospital' AND h.observation_at IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM authorizations a WHERE a.hospitalization_id = h.id AND a.template = 'hospital' AND a.archived_at IS NULL)`)
  for (const h of stays) {
    await ensureHospitalAuthorization(q, h, { id: String(h.converted_by ?? h.admitted_by), role: 'doctor' })
    await q.run('INSERT INTO audit (at, user_id, action, clinic_id) VALUES (?, ?, ?, ?)',
      [new Date().toISOString(), 'sistema', 'v26: se generó la autorización de hospitalización pendiente de una estancia que vino de observación', String(h.clinic_id)])
  }
}

/**
 * v41 (EX1): los resultados que se subían como archivos en la pestaña «Laboratorios» (o como imagen) de una estancia pasan
 * a ser exámenes con su resultado: el archivo no se mueve ni se borra; el examen lo referencia. Idempotente.
 */
export async function migrateLabsToExams(q: Sql) {
  const rows = await q.query(`SELECT a.* FROM attachments a WHERE a.category IN ('lab','imaging') AND a.hospitalization_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM exam_orders e WHERE e.source_attachment_id = a.id)
    AND NOT EXISTS (SELECT 1 FROM exam_orders e WHERE e.clinic_id = a.clinic_id AND e.result LIKE '%' || a.id || '%')`)
  for (const a of rows) {
    const at = String(a.taken_at ?? a.uploaded_at)
    const id = randomUUID()
    const grp = a.category === 'imaging' ? 'imaging' : 'lab'
    const result = JSON.stringify({ fileIds: [String(a.id)], at: String(a.uploaded_at), by: String(a.uploaded_by) })
    await q.run(`INSERT INTO exam_orders (id, clinic_id, patient_id, hospitalization_id, batch_id, grp, name, priority, place, area, status, ordered_by, ordered_at, status_at, status_by, result, source_attachment_id)
      VALUES (?,?,?,?,?,?,?,'routine','clinic','nursing','result',?,?,?,?,?,?)`,
      [id, String(a.clinic_id), String(a.patient_id), String(a.hospitalization_id), `migr-${a.id}`, grp, String(a.title ?? a.name), String(a.uploaded_by), at, String(a.uploaded_at), String(a.uploaded_by), result, String(a.id)])
    await q.run('INSERT INTO exam_events (id, clinic_id, exam_id, status, by_id, at, note) VALUES (?,?,?,?,?,?,?)',
      [randomUUID(), String(a.clinic_id), id, 'result', String(a.uploaded_by), String(a.uploaded_at), 'Resultado subido antes de la sección Exámenes (migración v41)'])
  }
}

/**
 * v39 (AD9): los cobros de antes se pagaron completos (amount_paid = total). Cada clínica acepta efectivo y transferencia
 * y, para no quitarle nada, las formas de pago que ya había usado. Idempotente.
 */
export async function migratePayments(q: Sql) {
  await q.run('UPDATE payments SET amount_paid = total WHERE amount_paid IS NULL')
  for (const c of await q.query('SELECT id FROM clinics WHERE payment_methods IS NULL')) {
    const used = (await q.query('SELECT DISTINCT method FROM payments WHERE clinic_id = ?', [String(c.id)])).map((r) => String(r.method))
    const order = ['cash', 'transfer', 'card', 'deposit', 'insurance', 'other']
    await q.run('UPDATE clinics SET payment_methods = ? WHERE id = ?', [JSON.stringify(order.filter((m) => m === 'cash' || m === 'transfer' || used.includes(m))), String(c.id)])
  }
}

/**
 * v36 (AD3): la especialidad fija de cada cama se archiva y cada estancia recibe la especialidad de su ingreso: la del
 * médico que lo ingresó ("Medicina general" si no tiene) o, en las de antes que ingresó alguien sin especialidad, la que
 * tenía la cama. El estado de cada cama sale de las estancias activas. Idempotente.
 */
export async function migrateBedSpecialties(q: Sql) {
  await q.run(`UPDATE beds SET archived_specialty = specialty WHERE archived_specialty IS NULL AND specialty IS NOT NULL`)
  await q.run(`UPDATE hospitalizations h SET specialty = COALESCE(NULLIF(s.specialty, ''), 'Medicina general')
    FROM staff s WHERE s.id = h.admitted_by AND h.specialty IS NULL AND h.bed_id IS NULL`)
  await q.run(`UPDATE hospitalizations h SET specialty = COALESCE(NULLIF(s.specialty, ''), NULLIF(b.archived_specialty, ''), 'Medicina general')
    FROM staff s, beds b WHERE s.id = h.admitted_by AND b.id = h.bed_id AND h.specialty IS NULL`)
}

/** v35 (AD1): el teléfono que tenía cada clínica pasa a ser su contacto principal. Idempotente. */
/**
 * v48 (AD4): la lista fija de exámenes pasa al catálogo de la clínica (sólo lo que falta, sin duplicar lo que la clínica
 * ya había agregado con el mismo nombre). Se llama también al pedir el catálogo, para las clínicas nuevas.
 */
export async function ensureExamCatalog(q: Sql, clinicId: string) {
  if (await q.one('SELECT 1 FROM exam_catalog WHERE clinic_id = ? AND base_key IS NOT NULL LIMIT 1', [clinicId])) return
  const have = new Set((await q.query('SELECT norm_key FROM exam_catalog WHERE clinic_id = ?', [clinicId])).map((r) => String(r.norm_key)))
  const now = new Date().toISOString()
  for (const e of EXAMS) {
    const key = examKey(e.name)
    if (have.has(key)) await q.run('UPDATE exam_catalog SET base_key = ? WHERE clinic_id = ? AND norm_key = ? AND base_key IS NULL', [key, clinicId, key])
    else await q.run('INSERT INTO exam_catalog (id, clinic_id, grp, name, norm_key, base_key, active, created_by, created_at) VALUES (?,?,?,?,?,?,TRUE,NULL,?)', [randomUUID(), clinicId, e.group, e.name, key, key, now])
  }
  // CF3 (ronda 6) y ronda 7: una clínica nueva recibe también los subgrupos, el catálogo completo y los perfiles
  await loadRonda7(q, clinicId)
  // UM1 (ronda 8): y los valores de referencia del .md con sus fuentes
  await loadLabSources(q)
  await loadRefValues(q, clinicId)
  // ME5 (ronda 9): y el LNME Honduras 2023 en su vademécum
  await loadLnme(q, clinicId)
  // CA5 (ronda 10): y el catálogo de Imagen y gabinete completo (marca la clínica como al día)
  await loadImagingCatalog(q, clinicId)
  // CA6 y CA7 (ronda 11)
  await loadRonda11Catalog(q, clinicId)
  // RU1 (ronda 14): y el catálogo de material médico quirúrgico con su lista de turno
  await loadSupplyCatalog(q, clinicId)
}

/**
 * v55 (ronda 6, CR1): cada procedimiento programado se copia como recordatorio de tipo Procedimiento con la misma fecha,
 * paciente, motivo, nota, autor y avisos (semana, víspera, día, WhatsApp). El original no se borra: queda inactivo y
 * marcado como migrado, con el id de su copia. Correrla otra vez no copia nada.
 */
export async function migrateProcedureFollowups(q: Sql) {
  const now = new Date().toISOString()
  for (const f of await q.query(`SELECT * FROM followups WHERE kind = 'procedure' AND migrated_to IS NULL`)) {
    const id = randomUUID()
    await q.run(`INSERT INTO followups (id, clinic_id, patient_id, kind, reminder_type, title, due_date, every_days, notes, created_by, created_at, notified_at, done_at,
        reminded_week, reminded_eve, reminded_day, active) VALUES (?,?,?,'reminder','procedure',?,?,NULL,?,?,?,?,?,?,?,?,?)`,
      [id, f.clinic_id, f.patient_id, f.title, f.due_date, f.notes ?? null, f.created_by, f.created_at, f.notified_at ?? null, f.done_at ?? null,
        f.reminded_week ?? null, f.reminded_eve ?? null, f.reminded_day ?? null, Boolean(f.active)])
    await q.run('UPDATE followups SET migrated_to = ?, migrated_at = ?, active = FALSE WHERE id = ?', [id, now, String(f.id)])
  }
}

/** v47 (AD1): cada clínica recibe sus umbrales en grupos, con los mismos números que tenía. Sólo llena lo que falta. */
/**
 * v62 (ronda 8, UM2): los umbrales del .md pasan a ser los de cada clínica. Lo que la clínica tenía en un analito de la app
 * (aunque lo hubiera cambiado a mano) se reemplaza por el valor predeterminado; el anterior queda en el historial del
 * analito con el motivo, quién («Sistema») y cuándo. Idempotente: corre una vez por clínica (marca um2:<versión>).
 */
export async function migrateCriticalDefaults(q: Sql) {
  const version = 'um2:2026-11-02'
  const now = new Date().toISOString()
  for (const c of await q.query('SELECT id, critical_groups FROM clinics')) {
    const mark = `${version}:${c.id}`
    if (await q.one('SELECT 1 FROM meta WHERE key = ?', [mark])) continue
    const saved = (c.critical_groups ? JSON.parse(String(c.critical_groups)) : []) as CriticalGroup[]
    for (const g of saved) {
      if (g.id === 'g-farmacos') g.name = 'Fármacos (niveles séricos)'
      for (const a of g.analytes) {
        const d = defaultAnalyte(a.id)
        if (!d) continue
        const differs = a.low !== d.low || a.high !== d.high || JSON.stringify(a.f ?? null) !== JSON.stringify(d.f ?? null) || JSON.stringify(a.m ?? null) !== JSON.stringify(d.m ?? null)
        if (differs) a.history = [...(a.history ?? []), { at: now, by: 'system', low: a.low, high: a.high, f: a.f, m: a.m, reason: 'Reemplazado por Catálogo Clinara 2026-11-02' }]
        Object.assign(a, defaultValues(d))
        delete a.editedAt
        delete a.editedBy
      }
    }
    await q.run('UPDATE clinics SET critical_groups = ? WHERE id = ?', [JSON.stringify(mergeCriticalGroups(saved)), String(c.id)])
    await q.run(`INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO NOTHING`, [mark, now])
  }
}

export async function migrateCriticalGroups(q: Sql) {
  for (const c of await q.query('SELECT id, critical_limits FROM clinics WHERE critical_groups IS NULL')) {
    const limits = c.critical_limits ? JSON.parse(String(c.critical_limits)) as Record<string, { low?: number; high?: number }> : undefined
    await q.run('UPDATE clinics SET critical_groups = ? WHERE id = ?', [JSON.stringify(groupsFromLimits(limits)), String(c.id)])
  }
}

export async function migrateContacts(q: Sql) {
  for (const c of await q.query(`SELECT id, phone FROM clinics WHERE contacts IS NULL`)) {
    const list = String(c.phone ?? '').trim() ? [{ id: 'principal', number: String(c.phone).trim(), label: 'Principal', type: 'call', primary: true }] : []
    await q.run('UPDATE clinics SET contacts = ? WHERE id = ?', [JSON.stringify(list), String(c.id)])
  }
}

/** v34 (MC6): la firma que ya tenía guardada cada médico pasa a ser su primera versión. Idempotente. */
export async function migrateMarks(q: Sql) {
  for (const r of await q.query(`SELECT id, clinic_id, signature FROM staff WHERE signature IS NOT NULL AND signature_id IS NULL`)) {
    const id = randomUUID()
    await q.run('INSERT INTO staff_marks (id, clinic_id, staff_id, kind, image, created_at) VALUES (?,?,?,?,?,?)', [id, r.clinic_id ?? null, String(r.id), 'signature', String(r.signature), new Date().toISOString()])
    await q.run('UPDATE staff SET signature_id = ? WHERE id = ?', [id, String(r.id)])
  }
}

/** v33 (AD5): cada persona empieza con su único rol como lista de roles. Idempotente. */
/**
 * v42 (MI1): el médico titular de cada consultorio pasa a tener también el rol de Administración (antes su rol de
 * médico incluía lo administrativo). Una sola vez: si después se le quita, no se vuelve a poner.
 */
/**
 * v43 (DM1): marca como demo la Clínica Santa Brígida y el Consultorio Dra. Isabel Pacheco, sólo si su personal es el de
 * demostración (@demo.clinara). Una clínica real nunca queda marcada.
 */
export async function markDemoClinics(q: Sql) {
  await q.run(`UPDATE clinics c SET is_demo = TRUE WHERE c.id IN ('c-sb', 'c-al') AND NOT c.is_demo
    AND EXISTS (SELECT 1 FROM staff s WHERE s.clinic_id = c.id AND s.email LIKE '%@demo.clinara')
    AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.clinic_id = c.id AND s.email NOT LIKE '%@demo.clinara')`)
}

/**
 * v85 (ronda 16, EN1): el personal de enfermería sin puesto recibe el suyo según el prefijo del nombre: «Lic.» → Licenciado(a)
 * en enfermería; «Aux.» o sin prefijo → Auxiliar. Quien también es de Laboratorio o Imágenes conserva ese cargo. Idempotente:
 * solo toca a quien no tiene puesto (después Administración lo cambia en Personal y roles).
 */
export async function migrateNursePositions(q: Sql) {
  const roles = `COALESCE(NULLIF(roles, ''), json_build_array(role)::text)::jsonb`
  await q.run(`UPDATE staff SET position = CASE WHEN name LIKE 'Lic.%' OR name LIKE 'Lic %' OR name LIKE 'Licda.%' THEN 'nurse_lic' ELSE ? END
    WHERE (position IS NULL OR position = '') AND ${roles} @> '["nurse"]'::jsonb AND NOT ${roles} @> '["lab"]'::jsonb AND NOT ${roles} @> '["imaging"]'::jsonb`, [NURSE_DEFAULT_POSITION])
}

/**
 * v85 (ronda 16, RE2): se borra la vista guardada de la Consulta externa («Por hora | Por médico») de quien tiene el rol de
 * administración o de recepción, para que abran con la nueva vista por defecto («Por médico»). Una sola vez (marca en meta):
 * lo que elijan después se respeta.
 */
export async function resetQueueViewOnce(q: Sql) {
  if (await q.one(`SELECT 1 FROM meta WHERE key = 're2_queue_view'`)) return
  await q.run(`UPDATE staff SET prefs = (COALESCE(NULLIF(prefs, ''), '{}')::jsonb - 'queueView')::text
    WHERE prefs IS NOT NULL AND prefs <> '' AND jsonb_exists(prefs::jsonb, 'queueView')
      AND jsonb_exists_any(COALESCE(NULLIF(roles, ''), json_build_array(role)::text)::jsonb, array['admin', 'reception'])`)
  await q.run(`INSERT INTO meta (key, value) VALUES ('re2_queue_view', ?) ON CONFLICT (key) DO NOTHING`, [new Date().toISOString()])
}

/**
 * v89 (ronda 17): la usuaria demo de Dermatología (Dra. Gálvez) tenía la verificación en dos pasos activa con el secreto fijo
 * de la demo. Se apaga una vez (marca en meta), solo si sigue con ese secreto: si alguien la activó con su propio teléfono, no se toca.
 */
export async function disableDemoTotpOnce(q: Sql) {
  if (await q.one(`SELECT 1 FROM meta WHERE key = 'demo_totp_off'`)) return
  await q.run(`UPDATE staff SET totp_enabled = FALSE, totp_secret = NULL WHERE id = 's-galvez' AND totp_secret = ?`, [DEMO_TOTP_SECRET])
  await q.run(`INSERT INTO meta (key, value) VALUES ('demo_totp_off', ?) ON CONFLICT (key) DO NOTHING`, [new Date().toISOString()])
}

/**
 * v90 (ronda 17, OB1): activa «Enfermería las revisa como checklist» en las clínicas y consultorios que lo tienen apagado
 * (default de Emil: nadie lo apagó a propósito). Corre una sola vez (marca `ob1_obs_checklist` en meta): quien lo apague
 * después lo sigue teniendo apagado aunque el esquema vuelva a correr. Antes guarda en config_backups qué cuentas lo tenían
 * apagado y deja la nota en la bitácora de cada una.
 */
export async function enableObsChecklistOnce(q: Sql) {
  if (await q.one(`SELECT 1 FROM meta WHERE key = 'ob1_obs_checklist'`)) return
  const now = new Date().toISOString()
  const off = await q.query('SELECT id, name FROM clinics WHERE obs_order_checklist = FALSE ORDER BY id')
  for (const c of off) {
    const cid = String(c.id)
    await q.run('INSERT INTO config_backups (id, clinic_id, kind, created_at, data, note) VALUES (?,?,?,?,?,?)',
      [randomUUID(), cid, 'obs_order_checklist', now, JSON.stringify({ obsOrderChecklist: false }), 'OB1 (ronda 17): valor antes de activar el checklist de órdenes en observación'])
    await q.run('UPDATE clinics SET obs_order_checklist = TRUE WHERE id = ?', [cid])
    await q.run('INSERT INTO audit (at, user_id, action, clinic_id) VALUES (?,?,?,?)',
      [now, 'sistema', 'Se activó «Enfermería revisa las órdenes de observación como checklist» (OB1, ronda 17). Se puede apagar en Configuración › Hospitalización y observación.', cid])
  }
  await q.run(`INSERT INTO meta (key, value) VALUES ('ob1_obs_checklist', ?) ON CONFLICT (key) DO NOTHING`, [now])
}

export async function migrateOfficeOwners(q: Sql) {
  if (await q.one(`SELECT 1 FROM meta WHERE key = 'office_owner_admin'`)) return
  await q.run(`UPDATE staff s SET roles = (COALESCE(NULLIF(s.roles, ''), json_build_array(s.role)::text)::jsonb || '["admin"]'::jsonb)::text
    FROM clinics c WHERE c.owner_id = s.id AND c.kind = 'office' AND NOT (COALESCE(NULLIF(s.roles, ''), json_build_array(s.role)::text)::jsonb @> '["admin"]'::jsonb)`)
  await q.run(`INSERT INTO meta (key, value) VALUES ('office_owner_admin', ?) ON CONFLICT (key) DO NOTHING`, [new Date().toISOString()])
}

export async function migrateRoles(q: Sql) {
  await q.run(`UPDATE staff SET roles = json_build_array(role)::text WHERE roles IS NULL OR roles = ''`)
}

/**
 * v32 (AD2): cada médico recibe como vigencia de sus recetas la que tenía su clínica, y las recetas ya emitidas guardan
 * la vigencia con la que se imprimieron (así la reimpresión dice lo mismo). Idempotente: sólo llena lo que falta.
 */
export async function migrateRxValidity(q: Sql) {
  await q.run(`UPDATE prescriptions p SET validity_days = c.rx_validity_days FROM clinics c WHERE c.id = p.clinic_id AND p.validity_days IS NULL`)
  await q.run(`UPDATE staff s SET prefs = jsonb_set(COALESCE(NULLIF(s.prefs, ''), '{}')::jsonb, '{rxValidityDays}', to_jsonb(c.rx_validity_days))::text
    FROM clinics c WHERE c.id = s.clinic_id AND s.role = 'doctor' AND (COALESCE(NULLIF(s.prefs, ''), '{}')::jsonb -> 'rxValidityDays') IS NULL`)
}

/**
 * v25: una base de demostración que ya existía recibe los casos para probar cada estado de una estancia
 * (observación, hospitalización, autorizaciones, referencia). Sólo si están el personal de demo y no se cargaron antes.
 */
async function addDemoScenarios(q: Sql) {
  if (await q.one(`SELECT 1 FROM patients WHERE id IN (${SCENARIO_PATIENT_IDS.map(() => '?').join(',')}) LIMIT 1`, SCENARIO_PATIENT_IDS)) return
  const demo = async (clinicId: string, ids: string[]) =>
    (await q.query(`SELECT id FROM staff WHERE clinic_id = ? AND id IN (${ids.map(() => '?').join(',')}) AND email LIKE '%@demo.clinara'`, [clinicId, ...ids])).length === ids.length
  if (await demo(MAIN_CLINIC, ['s-solorzano', 's-urbina'])) await insertClinicScenarios(q, MAIN_CLINIC, textPdf)
  if (await demo(OFFICE_CLINIC, ['s3-pacheco', 's3-cardona'])) await insertOfficeScenarios(q, OFFICE_CLINIC)
}

/**
 * v22: antes, un ingreso a hospitalización hecho desde la consulta externa pedía otra nota de ingreso y, si se
 * hacía a mano, quedaba sin su consulta. Esos ingresos se vinculan a la consulta externa del mismo paciente
 * en las 24 horas anteriores (que no haya originado ya otra estancia) y, si siguen abiertos, se jalan sus
 * medicamentos a la hoja sin duplicar los que ya estén activos. No se borra nada; queda en la bitácora.
 */
export async function linkPendingAdmissions(q: Sql) {
  const pending = await q.query(`SELECT * FROM hospitalizations h WHERE h.consultation_id IS NULL AND h.kind = 'hospital' AND h.observation_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM hosp_notes n WHERE n.hospitalization_id = h.id AND n.kind = 'admission')`)
  for (const h of pending) {
    const at = new Date(String(h.admitted_at))
    const c = await q.one(`SELECT id FROM consultations WHERE clinic_id = ? AND patient_id = ? AND date >= ? AND date <= ?
      AND id NOT IN (SELECT consultation_id FROM hospitalizations WHERE consultation_id IS NOT NULL) ORDER BY date DESC LIMIT 1`,
      [String(h.clinic_id), String(h.patient_id), new Date(at.getTime() - 24 * 3_600_000).toISOString(), new Date(at.getTime() + 5 * 60_000).toISOString()])
    if (!c) continue
    await q.run('UPDATE hospitalizations SET consultation_id = ? WHERE id = ?', [String(c.id), String(h.id)])
    const pulled = h.status === 'active' ? await syncStayOrders(q, { clinicId: String(h.clinic_id), hospitalizationId: String(h.id) }) : 0
    await q.run('INSERT INTO audit (at, user_id, action, clinic_id) VALUES (?,?,?,?)', [new Date().toISOString(), 'sistema',
      `Actualización: vinculó el ingreso del ${at.toISOString().slice(0, 10)} a su consulta externa, que hace de nota de ingreso${pulled ? `; ${pulled} medicamento(s) a la hoja` : ''}`, String(h.clinic_id)])
  }
}

/** PDF de una página con texto plano, para los laboratorios de demostración. */
export function textPdf(title: string, lines: string[]) {
  const esc = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '').replace(/([\\()])/g, '\\$1')
  const body = [`BT /F1 16 Tf 56 760 Td (${esc(title)}) Tj ET`, ...lines.map((l, i) => `BT /F1 12 Tf 56 ${724 - i * 18} Td (${esc(l)}) Tj ET`)].join('\n')
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${body.length} >>\nstream\n${body}\nendstream`,
  ]
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}

/** Siguiente folio de receta de la clínica. Llamar dentro de una transacción: el candado evita folios repetidos. */
export async function nextFolio(q: Sql, clinicId: string, now: Date) {
  await q.run('SELECT pg_advisory_xact_lock(hashtext(?))', [`rx:${clinicId}`])
  const year = now.getFullYear()
  // El número se compara como número: como texto, RX-2026-9999 quedaría después de RX-2026-10000
  const last = await q.one<{ n: number | null }>(`SELECT MAX(CAST(split_part(folio, '-', 3) AS INTEGER))::int AS n FROM prescriptions WHERE clinic_id = ? AND folio ~ ?`, [clinicId, `^RX-${year}-[0-9]+$`])
  const seq = last?.n ? Number(last.n) + 1 : 1001
  return `RX-${year}-${String(seq).padStart(4, '0')}`
}

/** Borra todo y vuelve a cargar la demo (sólo en modo demo). TRUNCATE no dispara el bloqueo de la bitácora. */
export async function resetDemo(sql: Sql) {
  await sql.tx(async (q) => {
    // Este borrado no distingue clínicas: se niega si en la base hay alguna cuenta de clínica que no sea de la demo
    const real = await q.one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM staff WHERE clinic_id IS NOT NULL AND lower(email) NOT LIKE '%@demo.clinara'`)
    if (Number(real?.n ?? 0) > 0) throw new Error(`Esta base tiene ${real!.n} cuenta(s) de clínicas que no son de la demo: resetDemo borraría sus datos. No se borra nada. Para regenerar solo la demo usa «npm run seed:demo».`)
    await q.exec(`TRUNCATE record_versions, print_log, exam_ref_values, exam_events, exam_orders, exam_profiles, exam_catalog, addenda, note_drafts, payment_installments, staff_marks, epicrises, order_set_uses, order_sets, upload_parts, referrals, authorizations, order_marks, certificates, clinic_drugs, hosp_doses, hosp_meds, hosp_notes, hosp_procedures, hospitalizations, beds, followups,
      attachments, payments, prescriptions, consultations, vitals, appointments, patients, audit, staff, services, settings, clinics, rate_limits RESTART IDENTITY CASCADE`)
    await q.run(`DELETE FROM meta WHERE key = 'seeded'`)
    await seed(q)
    // Lo que las migraciones hacen sobre una base nueva: roles, titular del consultorio como administrador y clínicas demo
    await migrateRoles(q)
    // EN1 (ronda 16): el puesto de enfermería
    await migrateNursePositions(q)
    await q.run(`DELETE FROM meta WHERE key = 'office_owner_admin'`)
    await migrateOfficeOwners(q)
    await markDemoClinics(q)
    // UM1 y UM2 (ronda 8): valores de referencia y umbrales del .md en cada clínica de la demo
    await q.run(`DELETE FROM meta WHERE key LIKE 'um2:%'`)
    await loadLabSources(q)
    for (const c of await q.query('SELECT id FROM clinics')) await loadRefValues(q, String(c.id))
    await migrateCriticalDefaults(q)
    // ME5 (ronda 9): el LNME en el vademécum de cada clínica de la demo
    for (const c of await q.query('SELECT id FROM clinics')) await loadLnme(q, String(c.id))
    // RU1 (ronda 14): el catálogo de material médico quirúrgico
    for (const c of await q.query('SELECT id FROM clinics')) await loadSupplyCatalog(q, String(c.id))
  })
}

/** Siguiente número de expediente de la clínica. Llamar dentro de una transacción: el candado evita números repetidos. */
async function nextRecord(q: Sql, clinicId: string) {
  // Numeración por clínica; el candado evita que dos registros simultáneos tomen el mismo número
  await q.run('SELECT pg_advisory_xact_lock(hashtext(?))', [`record:${clinicId}`])
  // Sólo cuentan los EXP-00000: los pendientes de registro llevan un número provisional
  const max = await q.one<{ n: number }>(`SELECT COALESCE(MAX(CAST(SUBSTR(record, 5) AS INTEGER)), 400)::int AS n FROM patients WHERE clinic_id = ? AND record ~ '^EXP-[0-9]+$'`, [clinicId])
  return `EXP-${String(Number(max!.n) + 1).padStart(5, '0')}`
}

/** Crea un paciente con el siguiente número de expediente libre. */
export async function createPatient(q: Sql, clinicId: string, p: Partial<Patient> & Pick<Patient, 'firstName' | 'lastName' | 'birthDate' | 'sex' | 'phone'>) {
  const id = randomUUID()
  await q.run(`INSERT INTO patients (id,record,first_name,last_name,birth_date,sex,phone,email,blood_type,allergies,conditions,insurance,created_at,
      dni,civil_status,occupation,education,religion,address,emergency_name,emergency_phone,emergency_relation,background,clinic_id,guardian_name,guardian_dni,guardian_relation)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, await nextRecord(q, clinicId), p.firstName, p.lastName, p.birthDate, p.sex, p.phone, p.email || null, p.bloodType || null,
      JSON.stringify(p.allergies ?? []), JSON.stringify(p.conditions ?? []), p.insurance || null, new Date().toISOString(),
      p.dni || null, p.civilStatus || null, p.occupation || null, p.education || null, p.religion || null, p.address || null,
      p.emergencyName || null, p.emergencyPhone || null, p.emergencyRelation || null, JSON.stringify(p.background ?? {}), clinicId,
      p.guardianName || null, p.guardianDni || null, p.guardianRelation || null])
  return id
}

/**
 * Paciente que llama por primera vez: sólo nombre y teléfono (y la identidad si la da). Lleva un número
 * provisional y no aparece en la biblioteca hasta que completa su registro al llegar.
 */
export async function createPendingPatient(q: Sql, clinicId: string, p: { firstName: string; lastName: string; phone: string; dni?: string }) {
  const id = randomUUID()
  await q.run(`INSERT INTO patients (id, record, first_name, last_name, phone, dni, created_at, clinic_id, pending) VALUES (?,?,?,?,?,?,?,?,TRUE)`,
    [id, `PEND-${id.slice(0, 8).toUpperCase()}`, p.firstName, p.lastName, p.phone, p.dni || null, new Date().toISOString(), clinicId])
  return id
}

/** Completa el registro de un paciente pendiente: le asigna su número de expediente definitivo. */
export async function completePendingPatient(q: Sql, clinicId: string, id: string) {
  await q.run('UPDATE patients SET record = ?, pending = FALSE, created_at = ? WHERE id = ? AND clinic_id = ? AND pending',
    [await nextRecord(q, clinicId), new Date().toISOString(), id, clinicId])
}

/**
 * Limitador por clave guardado en la base, compartido por todas las instancias.
 * Devuelve cuántos intentos van en la ventana actual.
 */
export async function hit(q: Sql, key: string, windowMs: number) {
  const now = Date.now()
  const r = await q.one<{ n: number }>(`INSERT INTO rate_limits (key, n, reset_at) VALUES (?, 1, ?)
    ON CONFLICT (key) DO UPDATE SET
      n = CASE WHEN rate_limits.reset_at < ? THEN 1 ELSE rate_limits.n + 1 END,
      reset_at = CASE WHEN rate_limits.reset_at < ? THEN excluded.reset_at ELSE rate_limits.reset_at END
    RETURNING n`, [key, now + windowMs, now, now])
  return Number(r!.n)
}

export async function attempts(q: Sql, key: string) {
  const r = await q.one<Row>(`SELECT n, reset_at FROM rate_limits WHERE key = ?`, [key])
  return r && Number(r.reset_at) > Date.now() ? Number(r.n) : 0
}
