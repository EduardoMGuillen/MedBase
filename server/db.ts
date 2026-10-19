import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { DEFAULT_SETTINGS, DEMO_CLINICS, DOCTOR_SETUP, MAIN_CLINIC, PATIENTS, SECOND_CLINIC, SERVICES, STAFF, seedAppointments, seedClinical, seedHistory, seedSecondClinic } from '../src/lib/seed.js'
import type { Appointment, Patient, Payment, Schedule } from '../src/lib/types.js'
import type { Row, Sql } from './sql.js'

export const DEMO_PASSWORD = 'demo1234'

/** Sube este número cuando cambie el esquema; las bases existentes se actualizan solas. */
const SCHEMA_VERSION = '6'

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
      else await adoptSingleClinic(q)
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
  for (const t of TENANT_TABLES) await q.run(`UPDATE ${t} SET clinic_id = ? WHERE clinic_id IS NULL`, [id])
  // En una base de demostración se agrega también la cuenta de administración de la plataforma
  if (await q.one(`SELECT 1 FROM staff WHERE email LIKE '%@demo.clinara' LIMIT 1`)) {
    const sa = STAFF.find((x) => x.role === 'superadmin')!
    await q.run(`INSERT INTO staff (id, name, role, email, color, active, password_hash) VALUES (?,?,?,?,?,TRUE,?) ON CONFLICT DO NOTHING`,
      [sa.id, sa.name, sa.role, sa.email, sa.color, bcrypt.hashSync(DEMO_PASSWORD, 10)])
  }
}

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
  const patientRow = (p: Patient, clinic: string) => [p.id, p.record, p.firstName, p.lastName, p.birthDate, p.sex, p.phone, p.email ?? null, p.bloodType ?? null,
    JSON.stringify(p.allergies), JSON.stringify(p.conditions), p.insurance ?? null, p.createdAt,
    p.dni ?? null, p.civilStatus ?? null, p.occupation ?? null, p.education ?? null, p.religion ?? null, p.address ?? null,
    p.emergencyName ?? null, p.emergencyPhone ?? null, p.emergencyRelation ?? null, JSON.stringify(p.background ?? {}), clinic]
  await insertMany(q, 'patients', ['id', 'record', 'first_name', 'last_name', 'birth_date', 'sex', 'phone', 'email', 'blood_type', 'allergies', 'conditions', 'insurance', 'created_at',
    'dni', 'civil_status', 'occupation', 'education', 'religion', 'address', 'emergency_name', 'emergency_phone', 'emergency_relation', 'background', 'clinic_id'],
    [...[...PATIENTS, ...history.patients].map((p) => patientRow(p, A)), ...second.patients.map((p) => patientRow(p, B))])
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

  await q.run(`INSERT INTO meta (key, value) VALUES ('seeded', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`, [now])
}

/** Borra todo y vuelve a cargar la demo (sólo en modo demo). TRUNCATE no dispara el bloqueo de la bitácora. */
export async function resetDemo(sql: Sql) {
  await sql.tx(async (q) => {
    await q.exec(`TRUNCATE attachments, payments, prescriptions, consultations, vitals, appointments, patients, audit, staff, services, settings, clinics, rate_limits RESTART IDENTITY CASCADE`)
    await q.run(`DELETE FROM meta WHERE key = 'seeded'`)
    await seed(q)
  })
}

/** Crea un paciente con el siguiente número de expediente libre. */
export async function createPatient(q: Sql, clinicId: string, p: Partial<Patient> & Pick<Patient, 'firstName' | 'lastName' | 'birthDate' | 'sex' | 'phone'>) {
  const id = randomUUID()
  // Numeración por clínica; el candado evita que dos registros simultáneos tomen el mismo número
  await q.run('SELECT pg_advisory_xact_lock(hashtext(?))', [`record:${clinicId}`])
  const max = await q.one<{ n: number }>(`SELECT COALESCE(MAX(CAST(SUBSTR(record, 5) AS INTEGER)), 400)::int AS n FROM patients WHERE clinic_id = ?`, [clinicId])
  await q.run(`INSERT INTO patients (id,record,first_name,last_name,birth_date,sex,phone,email,blood_type,allergies,conditions,insurance,created_at,
      dni,civil_status,occupation,education,religion,address,emergency_name,emergency_phone,emergency_relation,background,clinic_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, `EXP-${String(Number(max!.n) + 1).padStart(5, '0')}`, p.firstName, p.lastName, p.birthDate, p.sex, p.phone, p.email || null, p.bloodType || null,
      JSON.stringify(p.allergies ?? []), JSON.stringify(p.conditions ?? []), p.insurance || null, new Date().toISOString(),
      p.dni || null, p.civilStatus || null, p.occupation || null, p.education || null, p.religion || null, p.address || null,
      p.emergencyName || null, p.emergencyPhone || null, p.emergencyRelation || null, JSON.stringify(p.background ?? {}), clinicId])
  return id
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
