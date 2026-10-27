import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import {
  BEDS, CASE_BED, CASE_PATIENT_IDS, CASE_STAFF, DEFAULT_SETTINGS, DEMO_CLINICS, DOCTOR_SETUP, INPATIENT_PATIENTS, MAIN_CLINIC, PATIENTS, SECOND_CLINIC, SERVICES, STAFF,
  OFFICE_CLINIC, seedAppointments, seedCases, seedClinical, seedHistory, seedInpatient, seedOffice, seedSecondClinic, seedUpcoming,
} from '../src/lib/seed.js'
import type { Appointment, Patient, Payment, Schedule } from '../src/lib/types.js'
import type { Row, Sql } from './sql.js'
import { backfillMissingOrders, syncStayOrders } from './medOrders.js'
import { SCENARIO_PATIENT_IDS, insertClinicScenarios, insertOfficeScenarios } from './demoScenarios.js'
import { ensureHospitalAuthorization } from './authorizations.js'

export const DEMO_PASSWORD = 'demo1234'

/** Sube este número cuando cambie el esquema; las bases existentes se actualizan solas. */
const SCHEMA_VERSION = '30'

export const SCHEMA = `
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
ALTER TABLE staff ADD CONSTRAINT staff_role_check CHECK (role IN ('superadmin','admin','doctor','nurse','reception','assistant'));
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

-- v17: constancias emitidas. No se editan: se anulan (con motivo) y se emite otra.
CREATE TABLE IF NOT EXISTS certificates (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  number TEXT NOT NULL,
  patient_id TEXT NOT NULL REFERENCES patients(id),
  consultation_id TEXT,
  doctor_id TEXT NOT NULL REFERENCES staff(id),
  kind TEXT NOT NULL CHECK (kind IN ('attention','rest','free','companion')),
  data TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  voided_at TEXT, voided_by TEXT, void_reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS certificates_number ON certificates (clinic_id, number);
CREATE INDEX IF NOT EXISTS certificates_patient ON certificates (patient_id);

-- v18: la nota de procedimiento es una nota de evolución en texto libre (hosp_notes.kind = 'procedure').
-- Los procedimientos registrados antes en hosp_procedures se conservan y se muestran como notas sin estado.
ALTER TABLE hosp_notes DROP CONSTRAINT IF EXISTS hosp_notes_kind_check;
ALTER TABLE hosp_notes ADD CONSTRAINT hosp_notes_kind_check CHECK (kind IN ('admission','evolution','discharge','nursing','procedure'));

-- v19: enfermería marca cada orden médica como revisada (o la desmarca con motivo). Sólo se agregan filas:
-- el estado de una orden es su última marca. Las notas escritas antes no piden revisión (data.checklist).
CREATE TABLE IF NOT EXISTS order_marks (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  hospitalization_id TEXT NOT NULL REFERENCES hospitalizations(id),
  note_id TEXT NOT NULL REFERENCES hosp_notes(id),
  order_index INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('check','uncheck')),
  reason TEXT,
  by_id TEXT NOT NULL REFERENCES staff(id),
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS order_marks_note ON order_marks (note_id, order_index, at);
DROP TRIGGER IF EXISTS order_marks_no_change ON order_marks;
CREATE TRIGGER order_marks_no_change BEFORE UPDATE OR DELETE ON order_marks FOR EACH ROW EXECUTE FUNCTION audit_append_only();

-- v20: autorizaciones (consentimiento informado). Se imprimen, se firman en papel y se sube la foto o el PDF.
CREATE TABLE IF NOT EXISTS authorizations (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  hospitalization_id TEXT NOT NULL REFERENCES hospitalizations(id),
  patient_id TEXT NOT NULL REFERENCES patients(id),
  template TEXT NOT NULL CHECK (template IN ('general','procedure')),
  data TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','signed','refused','revoked')),
  created_by TEXT NOT NULL REFERENCES staff(id), created_at TEXT NOT NULL,
  file_id TEXT, status_at TEXT, status_by TEXT, status_note TEXT
);
CREATE INDEX IF NOT EXISTS authorizations_h ON authorizations (hospitalization_id, created_at);

-- v21: observación. Es una estancia sin cama en la misma tabla: al pasar a hospitalización se le asigna
-- cama y conserva sus notas, medicamentos, laboratorios y autorizaciones, en orden y con su autoría.
ALTER TABLE hospitalizations
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'hospital',
  ADD COLUMN IF NOT EXISTS observation_at TEXT,
  ADD COLUMN IF NOT EXISTS converted_at TEXT,
  ADD COLUMN IF NOT EXISTS converted_by TEXT;
ALTER TABLE hospitalizations DROP CONSTRAINT IF EXISTS hospitalizations_kind_check;
ALTER TABLE hospitalizations ADD CONSTRAINT hospitalizations_kind_check CHECK (kind IN ('hospital','observation'));
ALTER TABLE hospitalizations ALTER COLUMN bed_id DROP NOT NULL;
ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS obs_alert_hours INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS obs_order_checklist BOOLEAN NOT NULL DEFAULT FALSE;

-- v22: segunda ronda de correcciones.
-- Identidad: formato configurable por clínica; las de 13 dígitos guardadas sin guiones pasan a 0000-0000-00000.
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS dni_mask TEXT NOT NULL DEFAULT '0000-0000-00000';
UPDATE patients SET dni = substr(regexp_replace(dni, '[^0-9]', '', 'g'), 1, 4) || '-' || substr(regexp_replace(dni, '[^0-9]', '', 'g'), 5, 4) || '-' || substr(regexp_replace(dni, '[^0-9]', '', 'g'), 9, 5)
  WHERE dni !~ '[A-Za-z]' AND length(regexp_replace(dni, '[^0-9]', '', 'g')) = 13 AND dni !~ '^[0-9]{4}-[0-9]{4}-[0-9]{5}$';
UPDATE patients SET guardian_dni = substr(regexp_replace(guardian_dni, '[^0-9]', '', 'g'), 1, 4) || '-' || substr(regexp_replace(guardian_dni, '[^0-9]', '', 'g'), 5, 4) || '-' || substr(regexp_replace(guardian_dni, '[^0-9]', '', 'g'), 9, 5)
  WHERE guardian_dni !~ '[A-Za-z]' AND length(regexp_replace(guardian_dni, '[^0-9]', '', 'g')) = 13 AND guardian_dni !~ '^[0-9]{4}-[0-9]{4}-[0-9]{5}$';
-- Órdenes de medicamento: hosp_meds es la única fuente de verdad de la hoja. Cada orden sabe de qué nota viene
-- (source, source_id, source_index); el índice único hace que crearla dos veces desde la misma nota no la duplique.
ALTER TABLE hosp_meds
  ADD COLUMN IF NOT EXISTS patient_id TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS source_id TEXT,
  ADD COLUMN IF NOT EXISTS source_index INTEGER,
  ADD COLUMN IF NOT EXISTS days INTEGER,
  ADD COLUMN IF NOT EXISTS stop_reason TEXT,
  ADD COLUMN IF NOT EXISTS replaces_id TEXT;
UPDATE hosp_meds m SET patient_id = h.patient_id FROM hospitalizations h WHERE h.id = m.hospitalization_id AND m.patient_id IS NULL;
UPDATE hosp_meds SET source = 'note', source_id = note_id WHERE source IS NULL AND note_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS hosp_meds_source ON hosp_meds (hospitalization_id, source_id, source_index) WHERE source_id IS NOT NULL AND source_index IS NOT NULL;
-- La consulta guarda si ingresó al paciente y sus medicamentos (con "aplicar en la clínica"), para crear las órdenes
ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS admit_kind TEXT,
  ADD COLUMN IF NOT EXISTS meds TEXT;
-- Corregir una dosis ya registrada: se guarda el registro anterior, quién lo corrigió y por qué
ALTER TABLE hosp_doses
  ADD COLUMN IF NOT EXISTS corrected_at TEXT,
  ADD COLUMN IF NOT EXISTS corrected_by TEXT,
  ADD COLUMN IF NOT EXISTS correction_reason TEXT,
  ADD COLUMN IF NOT EXISTS previous TEXT;
-- Autorizaciones: de hospitalización (una por estancia) y quirúrgica. Las anteriores ('general', 'procedure') se conservan.
ALTER TABLE authorizations DROP CONSTRAINT IF EXISTS authorizations_template_check;
ALTER TABLE authorizations ADD CONSTRAINT authorizations_template_check CHECK (template IN ('general','procedure','hospital','surgical'));
-- Receta para una persona que no está registrada: sus datos escritos a mano; se vincula si luego se registra
ALTER TABLE prescriptions ALTER COLUMN patient_id DROP NOT NULL;
ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS guest TEXT,
  ADD COLUMN IF NOT EXISTS linked_at TEXT,
  ADD COLUMN IF NOT EXISTS linked_by TEXT;

-- v23: consultorio de un médico independiente. Las cuentas existentes son clínicas y no cambian.
ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'clinic',
  ADD COLUMN IF NOT EXISTS observation_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS owner_id TEXT,
  ADD COLUMN IF NOT EXISTS specialty TEXT,
  ADD COLUMN IF NOT EXISTS license TEXT,
  ADD COLUMN IF NOT EXISTS max_assistants INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS setup_done_at TEXT;

-- v24: tercera ronda. Preferencias de cada usuario (p. ej. el último formato de nota que usó).
ALTER TABLE staff ADD COLUMN IF NOT EXISTS prefs TEXT;
-- La observación no lleva autorización de hospitalización: las pendientes que se generaron en observación pasan a
-- "No aplica" (no se borran; las firmadas no se tocan).
ALTER TABLE authorizations DROP CONSTRAINT IF EXISTS authorizations_status_check;
ALTER TABLE authorizations ADD CONSTRAINT authorizations_status_check CHECK (status IN ('pending','signed','refused','revoked','not_applicable'));
UPDATE authorizations a SET status = 'not_applicable', status_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), status_by = 'sistema',
  status_note = 'La observación no lleva autorización de hospitalización.'
  FROM hospitalizations h WHERE h.id = a.hospitalization_id AND a.template = 'hospital' AND a.status = 'pending' AND h.kind = 'observation';
-- Cómo terminó una estancia: egreso o referencia a otro centro (con el destino, si se indicó)
ALTER TABLE hospitalizations
  ADD COLUMN IF NOT EXISTS outcome TEXT,
  ADD COLUMN IF NOT EXISTS outcome_note TEXT;
-- Referencias (consultorio): se emiten, se reimprimen y, si hay un error, se anulan y se emite otra
CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  hospitalization_id TEXT NOT NULL REFERENCES hospitalizations(id),
  patient_id TEXT NOT NULL REFERENCES patients(id),
  number TEXT NOT NULL,
  data TEXT NOT NULL,
  destination TEXT,
  issued_by TEXT NOT NULL REFERENCES staff(id),
  issued_at TEXT NOT NULL,
  voided_at TEXT, voided_by TEXT, void_reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS referrals_number ON referrals (clinic_id, number);
CREATE INDEX IF NOT EXISTS referrals_stay ON referrals (hospitalization_id);
ALTER TABLE clinics DROP CONSTRAINT IF EXISTS clinics_kind_check;
ALTER TABLE clinics ADD CONSTRAINT clinics_kind_check CHECK (kind IN ('clinic','office'));
ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_role_check;
ALTER TABLE staff ADD CONSTRAINT staff_role_check CHECK (role IN ('superadmin','admin','doctor','nurse','reception','assistant'));

-- v26: ronda 2 de Emil (A3). La autorización de hospitalización no existe en observación: las que quedaron como
-- "No aplica" se archivan. No se borran; dejan de mostrarse y de contarse en Anexos.
ALTER TABLE authorizations
  ADD COLUMN IF NOT EXISTS archived_at TEXT,
  ADD COLUMN IF NOT EXISTS archived_reason TEXT;

-- v27: ronda 2 (A1, A2). Firma en pantalla de las autorizaciones, PDF final con su huella SHA-256, revocación
-- registrada y escaneos reemplazados que se conservan. Las firmadas antes en papel quedan como 'paper'.
ALTER TABLE authorizations
  ADD COLUMN IF NOT EXISTS method TEXT,
  ADD COLUMN IF NOT EXISTS signing TEXT,
  ADD COLUMN IF NOT EXISTS pdf_id TEXT,
  ADD COLUMN IF NOT EXISTS pdf_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS revocation TEXT,
  ADD COLUMN IF NOT EXISTS file_history TEXT;
UPDATE authorizations SET method = 'paper' WHERE method IS NULL AND file_id IS NOT NULL;
-- Firma guardada del médico (imagen PNG), para firmar las autorizaciones en pantalla
ALTER TABLE staff ADD COLUMN IF NOT EXISTS signature TEXT;
-- Archivos grandes (escaneos de hasta 15 MB) llegan por partes: Vercel acepta 4,5 MB por petición
CREATE TABLE IF NOT EXISTS upload_parts (
  upload_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  clinic_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  data BYTEA NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (upload_id, idx)
);

-- v28: ronda 2 (O1). Sets de órdenes de cada médico, en lugar de "Órdenes frecuentes" (que era una lista fija en
-- el código, sin datos en la base). Eliminar un set lo archiva. Cada uso queda registrado para ordenar por los más usados.
CREATE TABLE IF NOT EXISTS order_sets (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  owner_id TEXT NOT NULL REFERENCES staff(id),
  name TEXT NOT NULL,
  items TEXT NOT NULL,
  shared BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  archived_at TEXT
);
CREATE INDEX IF NOT EXISTS order_sets_clinic ON order_sets (clinic_id, owner_id);
CREATE TABLE IF NOT EXISTS order_set_uses (
  id TEXT PRIMARY KEY,
  set_id TEXT NOT NULL REFERENCES order_sets(id),
  user_id TEXT NOT NULL REFERENCES staff(id),
  clinic_id TEXT NOT NULL,
  at TEXT NOT NULL,
  place TEXT NOT NULL,
  patient_id TEXT
);
CREATE INDEX IF NOT EXISTS order_set_uses_set ON order_set_uses (set_id, user_id);

-- v29: ronda 2 (P1). Epicrisis: documento de egreso aparte del expediente. Borrador que el médico revisa y emite;
-- emitida no se edita: se anula con motivo y se emite la versión siguiente. Las altas anteriores no tienen
-- epicrisis: se genera con el botón "Generar epicrisis" (no se crean solas para no inventar contenido sin revisión).
CREATE TABLE IF NOT EXISTS epicrises (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  hospitalization_id TEXT NOT NULL REFERENCES hospitalizations(id),
  patient_id TEXT NOT NULL REFERENCES patients(id),
  version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','issued','voided')),
  data TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES staff(id), created_at TEXT NOT NULL,
  updated_by TEXT, updated_at TEXT,
  issued_by TEXT, issued_at TEXT,
  voided_by TEXT, voided_at TEXT, void_reason TEXT,
  replaces_id TEXT
);
CREATE INDEX IF NOT EXISTS epicrises_stay ON epicrises (hospitalization_id, version);
CREATE INDEX IF NOT EXISTS epicrises_patient ON epicrises (patient_id);

-- v30: ronda 2 (S1). Hoja de signos vitales de la estancia: las tomas van en la misma tabla de la preclínica (una sola
-- fuente), con la estancia, la hora en que se anotaron y la anulación con motivo (no se borran). Frecuencia de toma por
-- estancia y banda de temperatura normal por clínica.
ALTER TABLE vitals
  ADD COLUMN IF NOT EXISTS hospitalization_id TEXT,
  ADD COLUMN IF NOT EXISTS recorded_at TEXT,
  ADD COLUMN IF NOT EXISTS voided_at TEXT,
  ADD COLUMN IF NOT EXISTS voided_by TEXT,
  ADD COLUMN IF NOT EXISTS void_reason TEXT;
CREATE INDEX IF NOT EXISTS vitals_stay ON vitals (hospitalization_id, taken_at);
ALTER TABLE hospitalizations ADD COLUMN IF NOT EXISTS vitals_every_hours INTEGER;
ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS temp_low DOUBLE PRECISION NOT NULL DEFAULT 36.0,
  ADD COLUMN IF NOT EXISTS temp_high DOUBLE PRECISION NOT NULL DEFAULT 38.0;
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
        await linkPendingAdmissions(q)
        await addDemoOffice(q)
        await fixOfficeDemoTimes(q)
        await backfillOrders(q)
        await addDemoScenarios(q)
        await migrateObservationAuthorizations(q)
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
      items: [{ serviceId: sv.id, name: sv.name, price: sv.price, qty: 1 }], discount: 0, total: sv.price, method: 'card', reference: 'DEMO', receivedBy: 's-mejia',
      paidAt: new Date(new Date(a.start).getTime() + 40 * 60000).toISOString() })
  }
  await insertMany(q, 'payments', ['id', 'receipt_no', 'appointment_id', 'patient_id', 'items', 'discount', 'total', 'method', 'reference', 'received_by', 'paid_at', 'clinic_id'],
    payments.map((p) => [p.id, p.receiptNo, p.appointmentId ?? null, p.patientId, JSON.stringify(p.items), p.discount, p.total, p.method, p.reference ?? null, p.receivedBy, p.paidAt, A]))

  await insertInpatients(q)
  await insertCases(q)
  await insertOffice(q)
  await insertClinicScenarios(q, MAIN_CLINIC, textPdf)
  await insertOfficeScenarios(q, OFFICE_CLINIC)
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

/** Consultorio de demostración: la Dra. Ana López con su asistente, agenda de hoy, recetas y una paciente en observación. */
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
    VALUES ('v-al-1', ?, ?, 's3-asistente', ?, 112, 72, 96, 38.4, 98, 61, 160, 18, 'Dolor de garganta y fiebre desde ayer', ?)`, [triaged.patientId, triaged.id, new Date(Date.now() - 5 * 60_000).toISOString(), c.id])
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
  if (!(await q.one(`SELECT 1 FROM staff WHERE id = 's-herrera' AND email LIKE '%@demo.clinara'`))) return
  if (await q.one(`SELECT 1 FROM clinics WHERE id = ?`, [OFFICE_CLINIC])) return
  if (await q.one(`SELECT 1 FROM staff WHERE lower(email) IN ('alopez@demo.clinara', 'asistente@demo.clinara')`)) return
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
 * v25: una base de demostración que ya existía recibe los casos para probar cada estado de una estancia
 * (observación, hospitalización, autorizaciones, referencia). Sólo si están el personal de demo y no se cargaron antes.
 */
async function addDemoScenarios(q: Sql) {
  if (await q.one(`SELECT 1 FROM patients WHERE id IN (${SCENARIO_PATIENT_IDS.map(() => '?').join(',')}) LIMIT 1`, SCENARIO_PATIENT_IDS)) return
  const demo = async (clinicId: string, ids: string[]) =>
    (await q.query(`SELECT id FROM staff WHERE clinic_id = ? AND id IN (${ids.map(() => '?').join(',')}) AND email LIKE '%@demo.clinara'`, [clinicId, ...ids])).length === ids.length
  if (await demo(MAIN_CLINIC, ['s-herrera', 's-rios'])) await insertClinicScenarios(q, MAIN_CLINIC, textPdf)
  if (await demo(OFFICE_CLINIC, ['s3-lopez', 's3-asistente'])) await insertOfficeScenarios(q, OFFICE_CLINIC)
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
  // El número se compara como número: como texto, RX-2026-9999 quedaría después de RX-2026-10000
  const last = await q.one<{ n: number | null }>(`SELECT MAX(CAST(split_part(folio, '-', 3) AS INTEGER))::int AS n FROM prescriptions WHERE clinic_id = ? AND folio ~ ?`, [clinicId, `^RX-${year}-[0-9]+$`])
  const seq = last?.n ? Number(last.n) + 1 : 1001
  return `RX-${year}-${String(seq).padStart(4, '0')}`
}

/** Borra todo y vuelve a cargar la demo (sólo en modo demo). TRUNCATE no dispara el bloqueo de la bitácora. */
export async function resetDemo(sql: Sql) {
  await sql.tx(async (q) => {
    await q.exec(`TRUNCATE epicrises, order_set_uses, order_sets, upload_parts, referrals, authorizations, order_marks, certificates, clinic_drugs, hosp_doses, hosp_meds, hosp_notes, hosp_procedures, hospitalizations, beds, followups,
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
