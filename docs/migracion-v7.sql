-- Clinara: migración del esquema 6 al 7 (consulta externa, hospitalización, crónicos y seguimientos).
-- No hace falta correrlo: la app aplica estos cambios sola en la primera petición después del deploy.
-- Si prefieres hacerlo a mano en Neon (SQL Editor), corre este archivo completo. Todas las sentencias se pueden repetir sin daño.
-- No cambia la versión en la tabla meta, para que la app, al arrancar, agregue también las camas y hospitalizados de la demo.

BEGIN;

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

COMMIT;
