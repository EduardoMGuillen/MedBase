import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import bcrypt from 'bcryptjs'
import { PATIENTS, STAFF, seedAppointments, seedClinical } from '../src/lib/seed'

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
-- La bitácora es de sólo inserción
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT, 'audit is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT, 'audit is append-only'); END;
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`

export function openDb(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
  db.exec(SCHEMA)
  const seeded = db.prepare(`SELECT value FROM meta WHERE key = 'seeded'`).get()
  if (!seeded) seed(db)
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

/** Carga la clínica de demostración. La agenda queda relativa al día en que se crea la base. */
export function seed(db: DB) {
  const hash = bcrypt.hashSync(DEMO_PASSWORD, 10)
  const { vitals, consultations, prescriptions } = seedClinical()
  tx(db, () => {
    const st = db.prepare(`INSERT INTO staff (id,name,role,specialty,email,license,color,active,password_hash) VALUES (?,?,?,?,?,?,?,?,?)`)
    for (const s of STAFF) st.run(s.id, s.name, s.role, s.specialty ?? null, s.email, s.license ?? null, s.color, s.active ? 1 : 0, hash)

    const pt = db.prepare(`INSERT INTO patients (id,record,first_name,last_name,birth_date,sex,phone,email,blood_type,allergies,conditions,insurance,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    for (const p of PATIENTS) pt.run(p.id, p.record, p.firstName, p.lastName, p.birthDate, p.sex, p.phone, p.email ?? null, p.bloodType ?? null,
      JSON.stringify(p.allergies), JSON.stringify(p.conditions), p.insurance ?? null, p.createdAt)

    const ap = db.prepare(`INSERT INTO appointments (id,patient_id,doctor_id,start,minutes,reason,type,status,arrived_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    for (const a of seedAppointments()) ap.run(a.id, a.patientId, a.doctorId, a.start, a.minutes, a.reason, a.type, a.status,
      a.status === 'arrived' || a.status === 'triaged' ? new Date(Date.now() - 12 * 60000).toISOString() : null)

    const vt = db.prepare(`INSERT INTO vitals (id,patient_id,appointment_id,taken_by,taken_at,systolic,diastolic,heart_rate,temperature,spo2,weight_kg,height_cm,pain_scale,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    for (const v of vitals) vt.run(v.id, v.patientId, v.appointmentId ?? null, v.takenBy, v.takenAt, v.systolic, v.diastolic, v.heartRate,
      v.temperature, v.spo2, v.weightKg, v.heightCm, v.painScale ?? null, v.notes ?? null)

    const cs = db.prepare(`INSERT INTO consultations (id,patient_id,doctor_id,appointment_id,date,reason,symptoms,symptom_onset,history,exam,diagnoses,plan,vitals_id,prescription_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    for (const c of consultations) cs.run(c.id, c.patientId, c.doctorId, c.appointmentId ?? null, c.date, c.reason, JSON.stringify(c.symptoms),
      c.symptomOnset ?? null, c.history, c.exam, JSON.stringify(c.diagnoses), c.plan, c.vitalsId ?? null, c.prescriptionId ?? null)

    const rx = db.prepare(`INSERT INTO prescriptions (id,folio,patient_id,doctor_id,consultation_id,issued_at,items) VALUES (?,?,?,?,?,?,?)`)
    for (const r of prescriptions) rx.run(r.id, r.folio, r.patientId, r.doctorId, r.consultationId, r.issuedAt, JSON.stringify(r.items))

    db.prepare(`INSERT INTO meta (key, value) VALUES ('seeded', ?)`).run(new Date().toISOString())
  })
}

/** Borra todo y vuelve a cargar la demo (sólo en modo demo). */
export function resetDemo(db: DB) {
  db.exec('DROP TRIGGER IF EXISTS audit_no_delete')
  for (const t of ['prescriptions', 'consultations', 'vitals', 'appointments', 'patients', 'audit', 'staff']) db.exec(`DELETE FROM ${t}`)
  db.exec(`DELETE FROM meta WHERE key = 'seeded'`)
  db.exec(SCHEMA)
  seed(db)
}
