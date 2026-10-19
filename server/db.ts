import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { DEFAULT_SETTINGS, DOCTOR_SETUP, PATIENTS, SERVICES, STAFF, seedAppointments, seedClinical, seedHistory } from '../src/lib/seed'
import type { Payment } from '../src/lib/types'

export type DB = DatabaseSync

export const DEMO_PASSWORD = 'demo1234'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS staff (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','doctor','nurse','reception')),
  specialty TEXT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  license TEXT,
  color TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  password_hash TEXT NOT NULL,
  token_version INTEGER NOT NULL DEFAULT 0
);
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
  arrived_at TEXT
);
CREATE INDEX IF NOT EXISTS appt_start ON appointments(start);
CREATE TABLE IF NOT EXISTS vitals (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id),
  appointment_id TEXT REFERENCES appointments(id),
  taken_by TEXT NOT NULL REFERENCES staff(id),
  taken_at TEXT NOT NULL,
  systolic INTEGER NOT NULL, diastolic INTEGER NOT NULL, heart_rate INTEGER NOT NULL,
  temperature REAL NOT NULL, spo2 INTEGER NOT NULL, weight_kg REAL NOT NULL, height_cm REAL NOT NULL,
  pain_scale INTEGER, notes TEXT
);
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
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT, 'audit is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT, 'audit is append-only'); END;
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  receipt_no TEXT NOT NULL UNIQUE,
  appointment_id TEXT REFERENCES appointments(id),
  patient_id TEXT NOT NULL REFERENCES patients(id),
  items TEXT NOT NULL,
  discount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('cash','card','transfer','insurance')),
  reference TEXT,
  received_by TEXT NOT NULL REFERENCES staff(id),
  paid_at TEXT NOT NULL,
  voided INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS pay_date ON payments(paid_at);
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id),
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  category TEXT NOT NULL,
  data BLOB NOT NULL,
  uploaded_by TEXT NOT NULL REFERENCES staff(id),
  uploaded_at TEXT NOT NULL
);
`

/** Columnas añadidas después de la primera versión; se agregan si faltan. */
const COLUMNS: [table: string, column: string, ddl: string][] = [
  ['staff', 'schedule', `TEXT`],
  ['staff', 'service_id', `TEXT`],
  ['staff', 'totp_secret', `TEXT`],
  ['staff', 'totp_enabled', `INTEGER NOT NULL DEFAULT 0`],
  ['appointments', 'source', `TEXT NOT NULL DEFAULT 'staff'`],
  ['appointments', 'reminded_at', `TEXT`],
]

function migrate(db: DB) {
  db.exec(SCHEMA)
  for (const [table, column, ddl] of COLUMNS) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
    if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`)
  }
  // Bases creadas con la primera versión: completa configuración y servicios
  if (!db.prepare(`SELECT 1 FROM settings LIMIT 1`).get()) {
    const st = db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)`)
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) st.run(k, JSON.stringify(v))
  }
  if (!db.prepare(`SELECT 1 FROM services LIMIT 1`).get()) {
    const sv = db.prepare(`INSERT INTO services (id, name, price, active) VALUES (?, ?, ?, ?)`)
    for (const s of SERVICES) sv.run(s.id, s.name, s.price, s.active ? 1 : 0)
  }
  for (const [id, setup] of Object.entries(DOCTOR_SETUP)) {
    db.prepare(`UPDATE staff SET schedule = COALESCE(schedule, ?), service_id = COALESCE(service_id, ?) WHERE id = ?`)
      .run(JSON.stringify(setup.schedule), setup.serviceId, id)
  }
}

export function openDb(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
  db.exec(SCHEMA)
  const seeded = db.prepare(`SELECT value FROM meta WHERE key = 'seeded'`).get()
  if (!seeded) {
    migrate(db)
    seed(db)
  }
  migrate(db)
  return db
}

export function tx<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN')
  try {
    const r = fn()
    db.exec('COMMIT')
    return r
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

function insertPayment(db: DB, p: Payment) {
  db.prepare(`INSERT INTO payments (id,receipt_no,appointment_id,patient_id,items,discount,total,method,reference,received_by,paid_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(p.id, p.receiptNo, p.appointmentId ?? null, p.patientId, JSON.stringify(p.items), p.discount, p.total, p.method, p.reference ?? null, p.receivedBy, p.paidAt)
}

/** Carga la clínica de demostración. La agenda queda relativa al día en que se crea la base. */
export function seed(db: DB) {
  const hash = bcrypt.hashSync(DEMO_PASSWORD, 10)
  const { vitals, consultations, prescriptions } = seedClinical()
  const history = seedHistory()
  tx(db, () => {
    const st = db.prepare(`INSERT INTO staff (id,name,role,specialty,email,license,color,active,password_hash,schedule,service_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    for (const s of STAFF) {
      const setup = DOCTOR_SETUP[s.id]
      st.run(s.id, s.name, s.role, s.specialty ?? null, s.email, s.license ?? null, s.color, s.active ? 1 : 0, hash,
        setup ? JSON.stringify(setup.schedule) : null, setup?.serviceId ?? null)
    }

    const pt = db.prepare(`INSERT INTO patients (id,record,first_name,last_name,birth_date,sex,phone,email,blood_type,allergies,conditions,insurance,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    for (const p of [...PATIENTS, ...history.patients]) pt.run(p.id, p.record, p.firstName, p.lastName, p.birthDate, p.sex, p.phone, p.email ?? null, p.bloodType ?? null,
      JSON.stringify(p.allergies), JSON.stringify(p.conditions), p.insurance ?? null, p.createdAt)

    const ap = db.prepare(`INSERT INTO appointments (id,patient_id,doctor_id,start,minutes,reason,type,status,arrived_at,source) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    for (const a of [...history.appointments, ...seedAppointments()]) ap.run(a.id, a.patientId, a.doctorId, a.start, a.minutes, a.reason, a.type, a.status,
      a.status === 'arrived' || a.status === 'triaged' ? new Date(Date.now() - 12 * 60000).toISOString() : null, a.source ?? 'staff')
    // Una cita de hoy llegó por la reserva en línea
    db.prepare(`UPDATE appointments SET source = 'online' WHERE id IN ('a7', 'a13')`).run()

    const vt = db.prepare(`INSERT INTO vitals (id,patient_id,appointment_id,taken_by,taken_at,systolic,diastolic,heart_rate,temperature,spo2,weight_kg,height_cm,pain_scale,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    for (const v of vitals) vt.run(v.id, v.patientId, v.appointmentId ?? null, v.takenBy, v.takenAt, v.systolic, v.diastolic, v.heartRate,
      v.temperature, v.spo2, v.weightKg, v.heightCm, v.painScale ?? null, v.notes ?? null)

    const cs = db.prepare(`INSERT INTO consultations (id,patient_id,doctor_id,appointment_id,date,reason,symptoms,symptom_onset,history,exam,diagnoses,plan,vitals_id,prescription_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    for (const c of [...history.consultations, ...consultations]) cs.run(c.id, c.patientId, c.doctorId, c.appointmentId ?? null, c.date, c.reason, JSON.stringify(c.symptoms),
      c.symptomOnset ?? null, c.history, c.exam, JSON.stringify(c.diagnoses), c.plan, c.vitalsId ?? null, c.prescriptionId ?? null)

    const rx = db.prepare(`INSERT INTO prescriptions (id,folio,patient_id,doctor_id,consultation_id,issued_at,items) VALUES (?,?,?,?,?,?,?)`)
    for (const r of prescriptions) rx.run(r.id, r.folio, r.patientId, r.doctorId, r.consultationId, r.issuedAt, JSON.stringify(r.items))

    for (const p of history.payments) insertPayment(db, p)
    // Cobros de las consultas de esta mañana (la de Rosa Elena queda pendiente para probar la caja)
    let n = history.lastReceipt
    const today = seedAppointments()
    for (const [apptId, svc] of [['a1', 'svc-mi'], ['a8', 'svc-ped']] as const) {
      const a = today.find((x) => x.id === apptId)!
      const s = SERVICES.find((x) => x.id === svc)!
      insertPayment(db, { id: `tp-${apptId}`, receiptNo: `R-${String(++n).padStart(6, '0')}`, appointmentId: apptId, patientId: a.patientId,
        items: [{ serviceId: s.id, name: s.name, price: s.price, qty: 1 }], discount: 0, total: s.price, method: 'card', receivedBy: 's-mejia',
        paidAt: new Date(new Date(a.start).getTime() + 40 * 60000).toISOString() })
    }

    db.prepare(`INSERT INTO meta (key, value) VALUES ('seeded', ?)`).run(new Date().toISOString())
  })
}

/** Borra todo y vuelve a cargar la demo (sólo en modo demo). */
export function resetDemo(db: DB) {
  db.exec('DROP TRIGGER IF EXISTS audit_no_delete')
  for (const t of ['attachments', 'payments', 'prescriptions', 'consultations', 'vitals', 'appointments', 'patients', 'audit', 'staff', 'services', 'settings']) db.exec(`DELETE FROM ${t}`)
  db.exec(`DELETE FROM meta WHERE key = 'seeded'`)
  db.exec(SCHEMA)
  migrate(db)
  seed(db)
}

/** Crea un paciente con el siguiente número de expediente libre. */
export function createPatient(db: DB, p: { firstName: string; lastName: string; birthDate: string; sex: 'F' | 'M'; phone: string; email?: string; bloodType?: string; insurance?: string; allergies?: string[]; conditions?: string[] }) {
  const id = randomUUID()
  const n = Number((db.prepare(`SELECT COALESCE(MAX(CAST(SUBSTR(record, 5) AS INTEGER)), 400) AS n FROM patients`).get() as { n: number }).n) + 1
  db.prepare(`INSERT INTO patients (id,record,first_name,last_name,birth_date,sex,phone,email,blood_type,allergies,conditions,insurance,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, `EXP-${String(n).padStart(5, '0')}`, p.firstName, p.lastName, p.birthDate, p.sex, p.phone, p.email ?? null, p.bloodType || null,
      JSON.stringify(p.allergies ?? []), JSON.stringify(p.conditions ?? []), p.insurance || null, new Date().toISOString())
  return id
}

