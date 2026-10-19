import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { DEFAULT_SETTINGS, DOCTOR_SETUP, PATIENTS, SERVICES, STAFF, seedAppointments, seedClinical, seedHistory } from '../src/lib/seed.js'
import type { Patient, Payment } from '../src/lib/types.js'
import type { Row, Sql } from './sql.js'

export const DEMO_PASSWORD = 'demo1234'

/** Sube este número cuando cambie el esquema; las bases existentes se actualizan solas. */
const SCHEMA_VERSION = '5'

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
  record TEXT NOT NULL UNIQUE,
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
  folio TEXT NOT NULL UNIQUE,
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
  receipt_no TEXT NOT NULL UNIQUE,
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
      await q.run(`INSERT INTO meta (key, value) VALUES ('schema', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`, [SCHEMA_VERSION])
    })
  })().catch((e) => { initialized.delete(sql); throw e })
  initialized.set(sql, p)
  return p
}

/** Carga la clínica de demostración. La agenda queda relativa al día en que se crea la base. */
export async function seed(q: Sql) {
  const hash = bcrypt.hashSync(DEMO_PASSWORD, 10)
  const { vitals, consultations, prescriptions } = seedClinical()
  const history = seedHistory()
  const today = seedAppointments()

  await insertMany(q, 'settings', ['key', 'value'], Object.entries(DEFAULT_SETTINGS).map(([k, v]) => [k, JSON.stringify(v)]))
  await insertMany(q, 'services', ['id', 'name', 'price', 'active'], SERVICES.map((s) => [s.id, s.name, s.price, s.active]))
  await insertMany(q, 'staff', ['id', 'name', 'role', 'specialty', 'email', 'license', 'color', 'active', 'password_hash', 'schedule', 'service_id'],
    STAFF.map((s) => {
      const setup = DOCTOR_SETUP[s.id]
      return [s.id, s.name, s.role, s.specialty ?? null, s.email, s.license ?? null, s.color, s.active, hash, setup ? JSON.stringify(setup.schedule) : null, setup?.serviceId ?? null]
    }))
  await insertMany(q, 'patients', ['id', 'record', 'first_name', 'last_name', 'birth_date', 'sex', 'phone', 'email', 'blood_type', 'allergies', 'conditions', 'insurance', 'created_at',
    'dni', 'civil_status', 'occupation', 'education', 'religion', 'address', 'emergency_name', 'emergency_phone', 'emergency_relation', 'background'],
    [...PATIENTS, ...history.patients].map((p) => [p.id, p.record, p.firstName, p.lastName, p.birthDate, p.sex, p.phone, p.email ?? null, p.bloodType ?? null,
      JSON.stringify(p.allergies), JSON.stringify(p.conditions), p.insurance ?? null, p.createdAt,
      p.dni ?? null, p.civilStatus ?? null, p.occupation ?? null, p.education ?? null, p.religion ?? null, p.address ?? null,
      p.emergencyName ?? null, p.emergencyPhone ?? null, p.emergencyRelation ?? null, JSON.stringify(p.background ?? {})]))
  const arrived = new Date(Date.now() - 12 * 60000).toISOString()
  await insertMany(q, 'appointments', ['id', 'patient_id', 'doctor_id', 'start', 'minutes', 'reason', 'type', 'status', 'arrived_at', 'source'],
    [...history.appointments, ...today].map((a) => [a.id, a.patientId, a.doctorId, a.start, a.minutes, a.reason, a.type, a.status,
      a.status === 'arrived' || a.status === 'triaged' ? arrived : null, ['a7', 'a13'].includes(a.id) ? 'online' : a.source ?? 'staff']))
  await insertMany(q, 'vitals', ['id', 'patient_id', 'appointment_id', 'taken_by', 'taken_at', 'systolic', 'diastolic', 'heart_rate', 'temperature', 'spo2', 'weight_kg', 'height_cm', 'pain_scale', 'notes', 'resp_rate', 'glucose', 'chief_complaint'],
    vitals.map((v) => [v.id, v.patientId, v.appointmentId ?? null, v.takenBy, v.takenAt, v.systolic, v.diastolic, v.heartRate, v.temperature, v.spo2, v.weightKg, v.heightCm, v.painScale ?? null, v.notes ?? null,
      v.respRate ?? null, v.glucose ?? null, v.chiefComplaint ?? null]))
  await insertMany(q, 'consultations', ['id', 'patient_id', 'doctor_id', 'appointment_id', 'date', 'reason', 'symptoms', 'symptom_onset', 'history', 'exam', 'diagnoses', 'plan', 'vitals_id', 'prescription_id', 'orders'],
    [...history.consultations, ...consultations].map((c) => [c.id, c.patientId, c.doctorId, c.appointmentId ?? null, c.date, c.reason, JSON.stringify(c.symptoms),
      c.symptomOnset ?? null, c.history, c.exam, JSON.stringify(c.diagnoses), c.plan, c.vitalsId ?? null, c.prescriptionId ?? null, JSON.stringify(c.orders)]))
  await insertMany(q, 'prescriptions', ['id', 'folio', 'patient_id', 'doctor_id', 'consultation_id', 'issued_at', 'items'],
    prescriptions.map((r) => [r.id, r.folio, r.patientId, r.doctorId, r.consultationId, r.issuedAt, JSON.stringify(r.items)]))

  // Cobros: historial y dos consultas de esta mañana (la de Rosa Elena queda pendiente para probar la caja)
  let n = history.lastReceipt
  const payments: Payment[] = [...history.payments]
  for (const [apptId, svc] of [['a1', 'svc-mi'], ['a8', 'svc-ped']] as const) {
    const a = today.find((x) => x.id === apptId)!
    const s = SERVICES.find((x) => x.id === svc)!
    payments.push({ id: `tp-${apptId}`, receiptNo: `R-${String(++n).padStart(6, '0')}`, appointmentId: apptId, patientId: a.patientId,
      items: [{ serviceId: s.id, name: s.name, price: s.price, qty: 1 }], discount: 0, total: s.price, method: 'card', reference: 'DEMO', receivedBy: 's-mejia',
      paidAt: new Date(new Date(a.start).getTime() + 40 * 60000).toISOString() })
  }
  await insertMany(q, 'payments', ['id', 'receipt_no', 'appointment_id', 'patient_id', 'items', 'discount', 'total', 'method', 'reference', 'received_by', 'paid_at'],
    payments.map((p) => [p.id, p.receiptNo, p.appointmentId ?? null, p.patientId, JSON.stringify(p.items), p.discount, p.total, p.method, p.reference ?? null, p.receivedBy, p.paidAt]))

  await q.run(`INSERT INTO meta (key, value) VALUES ('seeded', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`, [new Date().toISOString()])
}

/** Borra todo y vuelve a cargar la demo (sólo en modo demo). TRUNCATE no dispara el bloqueo de la bitácora. */
export async function resetDemo(sql: Sql) {
  await sql.tx(async (q) => {
    await q.exec(`TRUNCATE attachments, payments, prescriptions, consultations, vitals, appointments, patients, audit, staff, services, settings, rate_limits RESTART IDENTITY CASCADE`)
    await q.run(`DELETE FROM meta WHERE key = 'seeded'`)
    await seed(q)
  })
}

/** Crea un paciente con el siguiente número de expediente libre. */
export async function createPatient(q: Sql, p: Partial<Patient> & Pick<Patient, 'firstName' | 'lastName' | 'birthDate' | 'sex' | 'phone'>) {
  const id = randomUUID()
  const max = await q.one<{ n: number }>(`SELECT COALESCE(MAX(CAST(SUBSTR(record, 5) AS INTEGER)), 400)::int AS n FROM patients`)
  await q.run(`INSERT INTO patients (id,record,first_name,last_name,birth_date,sex,phone,email,blood_type,allergies,conditions,insurance,created_at,
      dni,civil_status,occupation,education,religion,address,emergency_name,emergency_phone,emergency_relation,background)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, `EXP-${String(Number(max!.n) + 1).padStart(5, '0')}`, p.firstName, p.lastName, p.birthDate, p.sex, p.phone, p.email || null, p.bloodType || null,
      JSON.stringify(p.allergies ?? []), JSON.stringify(p.conditions ?? []), p.insurance || null, new Date().toISOString(),
      p.dni || null, p.civilStatus || null, p.occupation || null, p.education || null, p.religion || null, p.address || null,
      p.emergencyName || null, p.emergencyPhone || null, p.emergencyRelation || null, JSON.stringify(p.background ?? {})])
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
