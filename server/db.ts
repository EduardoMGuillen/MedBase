import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import {
  BEDS, CASE_BED, CASE_PATIENT_IDS, CASE_STAFF, DEFAULT_SETTINGS, DEMO_CLINICS, DOCTOR_SETUP, INPATIENT_PATIENTS, MAIN_CLINIC, PATIENTS, SECOND_CLINIC, SERVICES, STAFF,
  seedAppointments, seedCases, seedClinical, seedHistory, seedInpatient, seedSecondClinic,
} from '../src/lib/seed.js'
import type { Appointment, Patient, Payment, Schedule } from '../src/lib/types.js'
import type { Row, Sql } from './sql.js'

export const DEMO_PASSWORD = 'demo1234'

/** Sube este número cuando cambie el esquema; las bases existentes se actualizan solas. */
const SCHEMA_VERSION = '16'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS staff (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','doctor','nurse','reception')),
  specialty TEXT,
  email TEXT NOT NULL,
  license TEXT,
  color TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  password_hash TEXT NOT NULL,
  token_version INTEGER NOT NULL DEFAULT 0,
  schedule TEXT,
  service_id TEXT,
  totp_secret TEXT,
  totp_enabled BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE UNIQUE INDEX IF NOT EXISTS staff_email ON staff (lower(email));
CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  record TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  birth_date TEXT NOT NULL,
  sex TEXT NOT NULL CHECK (sex IN ('F','M')),
  phone TEXT NOT NULL,
  email TEXT,
  blood_type TEXT,
  allergies TEXT NOT NULL DEFAULT '[]',
  conditions TEXT NOT NULL DEFAULT '[]',
  insurance TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id),
  doctor_id TEXT NOT NULL REFERENCES staff(id),
  start TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  reason TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  arrived_at TEXT,
  source TEXT NOT NULL DEFAULT 'staff',
  reminded_at TEXT
);
CREATE INDEX IF NOT EXISTS appt_start ON appointments(start);
CREATE INDEX IF NOT EXISTS appt_doctor ON appointments(doctor_id, start);
CREATE TABLE IF NOT EXISTS vitals (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id),
  appointment_id TEXT REFERENCES appointments(id),
  taken_by TEXT NOT NULL REFERENCES staff(id),
  taken_at TEXT NOT NULL,
  systolic INTEGER NOT NULL, diastolic INTEGER NOT NULL, heart_rate INTEGER NOT NULL,
  temperature DOUBLE PRECISION NOT NULL, spo2 INTEGER NOT NULL,
  weight_kg DOUBLE PRECISION NOT NULL, height_cm DOUBLE PRECISION NOT NULL,
  pain_scale INTEGER, notes TEXT
);
CREATE INDEX IF NOT EXISTS vitals_patient ON vitals(patient_id);
CREATE TABLE IF NOT EXISTS consultations (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id),
  doctor_id TEXT NOT NULL REFERENCES staff(id),
  appointment_id TEXT REFERENCES appointments(id),
  date TEXT NOT NULL,
  reason TEXT NOT NULL,
  symptoms TEXT NOT NULL DEFAULT '[]',
  symptom_onset TEXT,
  history TEXT NOT NULL DEFAULT '',
  exam TEXT NOT NULL DEFAULT '',
  diagnoses TEXT NOT NULL DEFAULT '[]',
  plan TEXT NOT NULL DEFAULT '',
  vitals_id TEXT,
  prescription_id TEXT
);
CREATE INDEX IF NOT EXISTS cons_patient ON consultations(patient_id);
CREATE TABLE IF NOT EXISTS prescriptions (
  id TEXT PRIMARY KEY,
  folio TEXT NOT NULL,
  patient_id TEXT NOT NULL REFERENCES patients(id),
  doctor_id TEXT NOT NULL REFERENCES staff(id),
  consultation_id TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  items TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
  id BIGSERIAL PRIMARY KEY,
  at TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL
);
CREATE OR REPLACE FUNCTION audit_append_only() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN RAISE EXCEPTION 'audit is append-only'; END
$fn$;
DROP TRIGGER IF EXISTS audit_no_change ON audit;
CREATE TRIGGER audit_no_change BEFORE UPDATE OR DELETE ON audit FOR EACH ROW EXECUTE FUNCTION audit_append_only();
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price DOUBLE PRECISION NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  receipt_no TEXT NOT NULL,
  appointment_id TEXT REFERENCES appointments(id),
  patient_id TEXT NOT NULL REFERENCES patients(id),
  items TEXT NOT NULL,
  discount DOUBLE PRECISION NOT NULL DEFAULT 0,
  total DOUBLE PRECISION NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('cash','card','transfer','insurance')),
  reference TEXT,
  received_by TEXT NOT NULL REFERENCES staff(id),
  paid_at TEXT NOT NULL,
  voided BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS pay_date ON payments(paid_at);
CREATE INDEX IF NOT EXISTS pay_appt ON payments(appointment_id);
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id),
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  category TEXT NOT NULL,
  data BYTEA NOT NULL,
  uploaded_by TEXT NOT NULL REFERENCES staff(id),
  uploaded_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, n INTEGER NOT NULL, reset_at BIGINT NOT NULL);

-- v5: ficha de identificación y antecedentes (formato de historia clínica), triaje y órdenes médicas
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS dni TEXT,
  ADD COLUMN IF NOT EXISTS civil_status TEXT,
  ADD COLUMN IF NOT EXISTS occupation TEXT,
  ADD COLUMN IF NOT EXISTS education TEXT,
  ADD COLUMN IF NOT EXISTS religion TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS emergency_name TEXT,
  ADD COLUMN IF NOT EXISTS emergency_phone TEXT,
  ADD COLUMN IF NOT EXISTS emergency_relation TEXT,
  ADD COLUMN IF NOT EXISTS background TEXT NOT NULL DEFAULT '{}';
ALTER TABLE vitals
  ADD COLUMN IF NOT EXISTS resp_rate INTEGER,
  ADD COLUMN IF NOT EXISTS glucose INTEGER,
  ADD COLUMN IF NOT EXISTS chief_complaint TEXT;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS orders TEXT NOT NULL DEFAULT '[]';

-- v6: varias clínicas en la misma plataforma; cada registro pertenece a una clínica
CREATE TABLE IF NOT EXISTS clinics (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'L',
  rx_validity_days INTEGER NOT NULL DEFAULT 30,
  reminder_template TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TEXT NOT NULL
);
ALTER TABLE staff ADD COLUMN IF NOT EXISTS clinic_id TEXT REFERENCES clinics(id);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS clinic_id TEXT REFERENCES clinics(id);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS clinic_id TEXT REFERENCES clinics(id);
ALTER TABLE vitals ADD COLUMN IF NOT EXISTS clinic_id TEXT REFERENCES clinics(id);
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS clinic_id TEXT REFERENCES clinics(id);
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS clinic_id TEXT REFERENCES clinics(id);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS clinic_id TEXT REFERENCES clinics(id);
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS clinic_id TEXT REFERENCES clinics(id);
ALTER TABLE services ADD COLUMN IF NOT EXISTS clinic_id TEXT REFERENCES clinics(id);
ALTER TABLE audit ADD COLUMN IF NOT EXISTS clinic_id TEXT;
ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_role_check;
ALTER TABLE staff ADD CONSTRAINT staff_role_check CHECK (role IN ('superadmin','admin','doctor','nurse','reception'));
-- Expedientes, folios y recibos se numeran por clínica
ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_record_key;
ALTER TABLE prescriptions DROP CONSTRAINT IF EXISTS prescriptions_folio_key;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_receipt_no_key;
CREATE UNIQUE INDEX IF NOT EXISTS patients_clinic_record ON patients (clinic_id, record);
CREATE UNIQUE INDEX IF NOT EXISTS rx_clinic_folio ON prescriptions (clinic_id, folio);
CREATE UNIQUE INDEX IF NOT EXISTS pay_clinic_receipt ON payments (clinic_id, receipt_no);
CREATE INDEX IF NOT EXISTS staff_clinic ON staff (clinic_id);
CREATE INDEX IF NOT EXISTS patients_clinic ON patients (clinic_id);
CREATE INDEX IF NOT EXISTS appt_clinic ON appointments (clinic_id, start);
CREATE INDEX IF NOT EXISTS audit_clinic ON audit (clinic_id, id);

-- v7: consulta externa, hospitalización, crónicos y seguimientos
ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS record_uses_dni BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS logo TEXT;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS observations TEXT NOT NULL DEFAULT '';
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS hospitalization_id TEXT;
ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS taken_at TEXT,
  ADD COLUMN IF NOT EXISTS hospitalization_id TEXT;
CREATE TABLE IF NOT EXISTS beds (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  room TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  specialty TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE UNIQUE INDEX IF NOT EXISTS beds_clinic_room ON beds (clinic_id, room, label);
CREATE TABLE IF NOT EXISTS hospitalizations (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  patient_id TEXT NOT NULL REFERENCES patients(id),
  bed_id TEXT NOT NULL REFERENCES beds(id),
  consultation_id TEXT,
  admitted_at TEXT NOT NULL,
  admitted_by TEXT NOT NULL REFERENCES staff(id),
  reason TEXT NOT NULL,
  diagnoses TEXT NOT NULL DEFAULT '[]',
  companion_name TEXT, companion_relation TEXT, companion_phone TEXT, patient_phone TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','discharged')),
  discharged_at TEXT, discharged_by TEXT, prescription_id TEXT
);
-- Una cama sólo puede tener un paciente, y un paciente sólo una hospitalización abierta
CREATE UNIQUE INDEX IF NOT EXISTS hosp_bed_active ON hospitalizations (bed_id) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS hosp_patient_active ON hospitalizations (patient_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS hosp_clinic ON hospitalizations (clinic_id, status);
CREATE TABLE IF NOT EXISTS hosp_notes (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  hospitalization_id TEXT NOT NULL REFERENCES hospitalizations(id),
  kind TEXT NOT NULL CHECK (kind IN ('admission','evolution','discharge','nursing')),
  author_id TEXT NOT NULL REFERENCES staff(id),
  at TEXT NOT NULL,
  subjective TEXT NOT NULL DEFAULT '', objective TEXT NOT NULL DEFAULT '', assessment TEXT NOT NULL DEFAULT '', plan TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '',
  data TEXT
);
CREATE INDEX IF NOT EXISTS hosp_notes_h ON hosp_notes (hospitalization_id, at);
CREATE TABLE IF NOT EXISTS hosp_meds (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  hospitalization_id TEXT NOT NULL REFERENCES hospitalizations(id),
  note_id TEXT,
  drug TEXT NOT NULL, presentation TEXT, dose TEXT NOT NULL, route TEXT NOT NULL,
  every_hours INTEGER, prn BOOLEAN NOT NULL DEFAULT FALSE,
  first_at TEXT NOT NULL, instructions TEXT,
  ordered_by TEXT NOT NULL REFERENCES staff(id), ordered_at TEXT NOT NULL,
  stopped_at TEXT, stopped_by TEXT
);
CREATE INDEX IF NOT EXISTS hosp_meds_h ON hosp_meds (hospitalization_id);
CREATE TABLE IF NOT EXISTS hosp_doses (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  med_id TEXT NOT NULL REFERENCES hosp_meds(id),
  scheduled_at TEXT,
  given_at TEXT NOT NULL,
  given_by TEXT NOT NULL REFERENCES staff(id),
  status TEXT NOT NULL CHECK (status IN ('given','skipped')),
  note TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS hosp_doses_slot ON hosp_doses (med_id, scheduled_at) WHERE scheduled_at IS NOT NULL;
CREATE TABLE IF NOT EXISTS hosp_procedures (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  hospitalization_id TEXT NOT NULL REFERENCES hospitalizations(id),
  kind TEXT NOT NULL CHECK (kind IN ('procedure','authorization')),
  name TEXT NOT NULL,
  scheduled_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending','authorized','done','denied')),
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES staff(id), created_at TEXT NOT NULL,
  updated_by TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS followups (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  patient_id TEXT NOT NULL REFERENCES patients(id),
  kind TEXT NOT NULL CHECK (kind IN ('chronic','reminder','procedure')),
  title TEXT NOT NULL,
  due_date TEXT NOT NULL,
  every_days INTEGER,
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES staff(id), created_at TEXT NOT NULL,
  notified_at TEXT, done_at TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS followups_clinic ON followups (clinic_id, active, due_date);
ALTER TABLE followups
  ADD COLUMN IF NOT EXISTS reminded_week TEXT,
  ADD COLUMN IF NOT EXISTS reminded_eve TEXT,
  ADD COLUMN IF NOT EXISTS reminded_day TEXT;
ALTER TABLE vitals ALTER COLUMN systolic DROP NOT NULL;
ALTER TABLE vitals ALTER COLUMN diastolic DROP NOT NULL;
ALTER TABLE vitals ALTER COLUMN heart_rate DROP NOT NULL;
ALTER TABLE vitals ALTER COLUMN temperature DROP NOT NULL;
ALTER TABLE vitals ALTER COLUMN spo2 DROP NOT NULL;
ALTER TABLE vitals ALTER COLUMN weight_kg DROP NOT NULL;
ALTER TABLE vitals ALTER COLUMN height_cm DROP NOT NULL;

-- v10: la glucometría acepta decimales (ampliar el tipo no pierde datos)
ALTER TABLE vitals ALTER COLUMN glucose TYPE DOUBLE PRECISION;

-- v11: menor sin identidad: la receta y las constancias llevan los datos del responsable
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS guardian_name TEXT,
  ADD COLUMN IF NOT EXISTS guardian_dni TEXT,
  ADD COLUMN IF NOT EXISTS guardian_relation TEXT;

-- v12: paciente agendado por teléfono con nombre y teléfono, pendiente de registro.
-- No tiene fecha de nacimiento ni sexo hasta que llega; si resulta que ya existía, la cita pasa a ese
-- expediente y el pendiente queda marcado con merged_into (no se borra).
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS pending BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS merged_into TEXT;
ALTER TABLE patients ALTER COLUMN birth_date DROP NOT NULL;
ALTER TABLE patients ALTER COLUMN sex DROP NOT NULL;

-- v13: un médico atiende al paciente de otro: se guarda a quién estaba asignado, quién lo tomó y cuándo
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS reassigned_from TEXT,
  ADD COLUMN IF NOT EXISTS reassigned_by TEXT,
  ADD COLUMN IF NOT EXISTS reassigned_at TEXT;

-- v14: el manejo se divide en indicaciones (aquí) y medicamentos (receta)
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS indications TEXT;

-- v15: vademécum de la clínica (medicamentos que no están en el catálogo base). Nunca se borran: se desactivan.
CREATE TABLE IF NOT EXISTS clinic_drugs (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  name TEXT NOT NULL,
  brand TEXT, presentation TEXT, concentration TEXT, route TEXT,
  norm_key TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT NOT NULL REFERENCES staff(id), created_at TEXT NOT NULL,
  updated_by TEXT, updated_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS clinic_drugs_key ON clinic_drugs (clinic_id, norm_key);

-- v16: receta sin consulta (renovar el tratamiento de un crónico) con sus indicaciones
ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS standalone BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS indications TEXT;
`

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

/**
 * Crea o actualiza el esquema y, si la base está vacía, carga la clínica de demo.
 * Un candado de Postgres evita que dos instancias lo hagan al mismo tiempo.
 */
export function ensureDb(sql: Sql) {
  const pending = initialized.get(sql)
  if (pending) return pending
  const p = (async () => {
    const current = await sql.one<{ value: string }>(`SELECT value FROM meta WHERE key = 'schema'`).catch(() => undefined)
    if (current?.value === SCHEMA_VERSION) return
    await sql.tx(async (q) => {
      await q.run('SELECT pg_advisory_xact_lock(7272741)')
      await q.exec(SCHEMA)
      if (!(await q.one(`SELECT 1 FROM meta WHERE key = 'seeded'`))) await seed(q)
      else {
        await adoptSingleClinic(q)
        await addDemoInpatients(q)
        await addDemoCases(q)
      }
      await q.run(`INSERT INTO meta (key, value) VALUES ('schema', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`, [SCHEMA_VERSION])
    })
  })().catch((e) => { initialized.delete(sql); throw e })
  initialized.set(sql, p)
  return p
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
    [...[...history.appointments, ...today].map((a) => apptRow(a, A)), ...second.appointments.map((a) => apptRow(a, B))])
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
      items: [{ serviceId: sv.id, name: sv.name, price: sv.price, qty: 1 }], discount: 0, total: sv.price, method: 'card', reference: 'DEMO', receivedBy: 's-mejia',
      paidAt: new Date(new Date(a.start).getTime() + 40 * 60000).toISOString() })
  }
  await insertMany(q, 'payments', ['id', 'receipt_no', 'appointment_id', 'patient_id', 'items', 'discount', 'total', 'method', 'reference', 'received_by', 'paid_at', 'clinic_id'],
    payments.map((p) => [p.id, p.receiptNo, p.appointmentId ?? null, p.patientId, JSON.stringify(p.items), p.discount, p.total, p.method, p.reference ?? null, p.receivedBy, p.paidAt, A]))

  await insertInpatients(q)
  await insertCases(q)
  await q.run(`INSERT INTO meta (key, value) VALUES ('seeded', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`, [now])
}

/** Camas, hospitalizados y seguimientos de la demo. */
async function insertInpatients(q: Sql) {
  const A = MAIN_CLINIC
  const d = seedInpatient()
  // Una base que venía de una sola clínica no tiene la segunda clínica de demostración
  const clinics = new Set((await q.query('SELECT id FROM clinics')).map((r) => String(r.id)))
  await insertMany(q, 'beds', ['id', 'clinic_id', 'room', 'label', 'specialty', 'active'],
    BEDS.filter((b) => clinics.has(b.clinicId)).map((b) => [b.id, b.clinicId, b.room, b.label, b.specialty, b.active]))
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
    const pdf = textPdf(`${l.title} - Laboratorio de demostracion`, [`Fecha de toma: ${new Date(l.takenAt).toLocaleString('es-HN')}`, '', ...l.lines])
    await q.run('INSERT INTO attachments (id, patient_id, name, mime, size, category, data, uploaded_by, uploaded_at, clinic_id, title, taken_at, hospitalization_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [l.id, l.patientId, `${l.title}.pdf`, 'application/pdf', pdf.length, 'lab', new Uint8Array(pdf), 's-rios', l.takenAt, A, l.title, l.takenAt, l.hospitalizationId])
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
  if (!(await q.one(`SELECT 1 FROM staff WHERE id = 's-herrera' AND email LIKE '%@demo.clinara'`))) return
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
    const pdf = textPdf(`${l.title} - Estudio de demostracion`, [`Fecha de toma: ${new Date(l.takenAt).toLocaleString('es-HN')}`, '', ...l.lines])
    await q.run('INSERT INTO attachments (id, patient_id, name, mime, size, category, data, uploaded_by, uploaded_at, clinic_id, title, taken_at, hospitalization_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [l.id, l.patientId, `${l.title}.pdf`, 'application/pdf', pdf.length, l.category, new Uint8Array(pdf), 's-rios', l.takenAt, A, l.title, l.takenAt, l.hospitalizationId ?? null])
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

/** PDF de una página con texto plano, para los laboratorios de demostración. */
function textPdf(title: string, lines: string[]) {
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
  const last = await q.one(`SELECT folio FROM prescriptions WHERE clinic_id = ? AND folio LIKE ? ORDER BY folio DESC LIMIT 1`, [clinicId, `RX-${year}-%`])
  const seq = last ? Number(String(last.folio).split('-')[2]) + 1 : 1001
  return `RX-${year}-${String(seq).padStart(4, '0')}`
}

/** Borra todo y vuelve a cargar la demo (sólo en modo demo). TRUNCATE no dispara el bloqueo de la bitácora. */
export async function resetDemo(sql: Sql) {
  await sql.tx(async (q) => {
    await q.exec(`TRUNCATE clinic_drugs, hosp_doses, hosp_meds, hosp_notes, hosp_procedures, hospitalizations, beds, followups,
      attachments, payments, prescriptions, consultations, vitals, appointments, patients, audit, staff, services, settings, clinics, rate_limits RESTART IDENTITY CASCADE`)
    await q.run(`DELETE FROM meta WHERE key = 'seeded'`)
    await seed(q)
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
