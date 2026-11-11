/**
 * Esquema base de la base de datos (hasta la versión 90).
 *
 * Este texto se ejecuta ENTERO sobre una base nueva y, en una base anterior a la versión base, se vuelve a ejecutar
 * de arriba abajo: por eso todo aquí es idempotente (IF NOT EXISTS, DROP … IF EXISTS antes de crear).
 *
 * NO agregues cambios nuevos aquí. Un cambio de esquema posterior a la versión base va como un paso numerado en
 * `server/migrations.ts`: corre una sola vez por base y no se vuelve a ejecutar.
 */
export const BASELINE_VERSION = '90'

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
ALTER TABLE staff ADD CONSTRAINT staff_role_check CHECK (role IN ('superadmin','admin','doctor','nurse','reception','assistant','lab','imaging'));
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
  ADD COLUMN IF NOT EXISTS obs_order_checklist BOOLEAN NOT NULL DEFAULT TRUE;

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
ALTER TABLE staff ADD CONSTRAINT staff_role_check CHECK (role IN ('superadmin','admin','doctor','nurse','reception','assistant','lab','imaging'));

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

-- v31: caja. El recibo es control interno: la factura fiscal sale del talonario de la clínica (CAI de imprenta) y su
-- número se anota en el cobro. Motivo del descuento y datos de la anulación (motivo, quién y cuándo) en el recibo.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS invoice_no TEXT,
  ADD COLUMN IF NOT EXISTS discount_reason TEXT,
  ADD COLUMN IF NOT EXISTS void_reason TEXT,
  ADD COLUMN IF NOT EXISTS voided_at TEXT,
  ADD COLUMN IF NOT EXISTS voided_by TEXT;

-- v32: ronda 3 (AD2). La vigencia de la receta es de cada médico (staff.prefs.rxValidityDays), no de la clínica, y
-- cada receta guarda la suya. clinics.rx_validity_days se conserva: de ahí sale el valor inicial de cada médico.
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS validity_days INTEGER;

-- v33: ronda 3 (AD5). Varios roles por persona: staff.roles (JSON) guarda todos sus roles y staff.role pasa a ser el rol
-- activo (la vista que eligió, que se recuerda). La bitácora guarda con qué rol se hizo cada acción.
ALTER TABLE staff ADD COLUMN IF NOT EXISTS roles TEXT;
ALTER TABLE audit ADD COLUMN IF NOT EXISTS role TEXT;

-- v34: ronda 3 (MC6). "Mi configuración" del médico: nombre en documentos, sello, PIN para confirmar firmas. Cada firma o
-- sello guardado es una versión en staff_marks; recetas y constancias apuntan a la versión con que se emitieron, así que
-- cambiar la firma no altera los documentos ya emitidos.
ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS doc_name TEXT,
  ADD COLUMN IF NOT EXISTS stamp TEXT,
  ADD COLUMN IF NOT EXISTS signature_id TEXT,
  ADD COLUMN IF NOT EXISTS stamp_id TEXT,
  ADD COLUMN IF NOT EXISTS pin_hash TEXT;
CREATE TABLE IF NOT EXISTS staff_marks (
  id TEXT PRIMARY KEY,
  clinic_id TEXT,
  staff_id TEXT NOT NULL REFERENCES staff(id),
  kind TEXT NOT NULL CHECK (kind IN ('signature','stamp')),
  image TEXT NOT NULL,
  created_at TEXT NOT NULL
);
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS signature_id TEXT, ADD COLUMN IF NOT EXISTS stamp_id TEXT;
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS signature_id TEXT, ADD COLUMN IF NOT EXISTS stamp_id TEXT;

-- v35: ronda 3 (AD1). Varios teléfonos y contactos de WhatsApp de la clínica (JSON). clinics.phone sigue siendo el
-- principal (lo leen todos los documentos); docs_whatsapp pone también el de WhatsApp en los membretes.
ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS contacts TEXT,
  ADD COLUMN IF NOT EXISTS docs_whatsapp BOOLEAN NOT NULL DEFAULT FALSE;

-- v36: ronda 3 (AD3). Las camas ya no tienen especialidad fija: están libres, ocupadas o fuera de servicio (active =
-- FALSE, con su motivo). La especialidad es del ingreso (la del médico que ingresa, editable). La que tenía cada cama
-- se archiva en beds.archived_specialty; no se borra.
ALTER TABLE hospitalizations ADD COLUMN IF NOT EXISTS specialty TEXT;
ALTER TABLE beds
  ADD COLUMN IF NOT EXISTS archived_specialty TEXT,
  ADD COLUMN IF NOT EXISTS out_of_service_note TEXT;
ALTER TABLE beds ALTER COLUMN specialty DROP NOT NULL;

-- v37: ronda 3 (AD4). Vademécum: dosis e indicaciones de uso habituales (opcionales) de lo que agrega la clínica.
ALTER TABLE clinic_drugs
  ADD COLUMN IF NOT EXISTS usual_dose TEXT,
  ADD COLUMN IF NOT EXISTS usual_use TEXT;

-- v38: ronda 3 (AD7). Bitácora: el paciente de cada acción y su tipo, para filtrarla. Las filas anteriores no se tocan
-- (la bitácora no admite cambios): su tipo se deduce del texto al consultarla.
ALTER TABLE audit
  ADD COLUMN IF NOT EXISTS patient_id TEXT,
  ADD COLUMN IF NOT EXISTS kind TEXT;
CREATE INDEX IF NOT EXISTS audit_user ON audit (clinic_id, user_id, id);
CREATE INDEX IF NOT EXISTS audit_patient ON audit (clinic_id, patient_id);

-- v39: ronda 3 (AD9). Cobros: se generan al cobrar (no por cita). Formas de pago que acepta cada clínica, depósito y
-- "otro"; banco de la transferencia o del depósito; lo que se pagó al cobrar (amount_paid) y los abonos posteriores, con
-- el saldo pendiente. Servicios creados desde la caja con su autor y fecha. Los "Por cobrar" de antes no eran registros
-- (se calculaban de las citas atendidas sin pago): no hay nada que archivar.
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS payment_methods TEXT;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE payments ADD CONSTRAINT payments_method_check CHECK (method IN ('cash','card','transfer','insurance','deposit','other'));
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS bank TEXT,
  ADD COLUMN IF NOT EXISTS amount_paid DOUBLE PRECISION;
CREATE TABLE IF NOT EXISTS payment_installments (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  payment_id TEXT NOT NULL REFERENCES payments(id),
  amount DOUBLE PRECISION NOT NULL,
  method TEXT NOT NULL,
  reference TEXT,
  bank TEXT,
  received_by TEXT NOT NULL REFERENCES staff(id),
  paid_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS installments_payment ON payment_installments (payment_id);
CREATE INDEX IF NOT EXISTS installments_clinic ON payment_installments (clinic_id, paid_at);
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS created_by TEXT,
  ADD COLUMN IF NOT EXISTS created_at TEXT;

-- v40: ronda 4 (AN1). Borradores en el servidor (sobreviven a recargar y a cerrar el navegador), una por persona y nota.
CREATE TABLE IF NOT EXISTS note_drafts (
  id TEXT PRIMARY KEY,
  clinic_id TEXT,
  user_id TEXT NOT NULL REFERENCES staff(id),
  scope TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS note_drafts_key ON note_drafts (user_id, scope, ref_id);
-- Adendas (addendum): firmadas e inmutables, debajo de la nota original. Sólo se agregan filas.
CREATE TABLE IF NOT EXISTS addenda (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  target_kind TEXT NOT NULL CHECK (target_kind IN ('consultation','note')),
  target_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('correction','info','result')),
  corrects TEXT,
  text TEXT NOT NULL,
  author_id TEXT NOT NULL REFERENCES staff(id),
  author_role TEXT,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS addenda_target ON addenda (clinic_id, target_id, at);
DROP TRIGGER IF EXISTS addenda_no_change ON addenda;
CREATE TRIGGER addenda_no_change BEFORE UPDATE OR DELETE ON addenda FOR EACH ROW EXECUTE FUNCTION audit_append_only();
-- La consulta y las notas firmadas son inmutables en la base: no se cambia su contenido clínico ni se borran. Las
-- migraciones de datos y el borrado de los pacientes de demostración lo permiten sólo con clinara.note_maintenance = on.
CREATE OR REPLACE FUNCTION consultation_signed_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF current_setting('clinara.note_maintenance', true) = 'on' THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'La consulta está firmada: no se borra.'; END IF;
  IF ROW(NEW.patient_id, NEW.doctor_id, NEW.date, NEW.reason, NEW.history, NEW.exam, NEW.observations, NEW.diagnoses, NEW.orders, NEW.indications, NEW.plan, NEW.meds, NEW.symptoms, NEW.symptom_onset)
     IS DISTINCT FROM ROW(OLD.patient_id, OLD.doctor_id, OLD.date, OLD.reason, OLD.history, OLD.exam, OLD.observations, OLD.diagnoses, OLD.orders, OLD.indications, OLD.plan, OLD.meds, OLD.symptoms, OLD.symptom_onset) THEN
    RAISE EXCEPTION 'La consulta está firmada: no se edita. Escribe una adenda.';
  END IF;
  RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS consultations_signed ON consultations;
CREATE TRIGGER consultations_signed BEFORE UPDATE OR DELETE ON consultations FOR EACH ROW EXECUTE FUNCTION consultation_signed_guard();
CREATE OR REPLACE FUNCTION note_signed_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF current_setting('clinara.note_maintenance', true) = 'on' THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'La nota está firmada: no se borra.'; END IF;
  IF ROW(NEW.hospitalization_id, NEW.kind, NEW.author_id, NEW.at, NEW.subjective, NEW.objective, NEW.assessment, NEW.plan, NEW.text, NEW.data)
     IS DISTINCT FROM ROW(OLD.hospitalization_id, OLD.kind, OLD.author_id, OLD.at, OLD.subjective, OLD.objective, OLD.assessment, OLD.plan, OLD.text, OLD.data) THEN
    RAISE EXCEPTION 'La nota está firmada: no se edita. Escribe una adenda.';
  END IF;
  RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS hosp_notes_signed ON hosp_notes;
CREATE TRIGGER hosp_notes_signed BEFORE UPDATE OR DELETE ON hosp_notes FOR EACH ROW EXECUTE FUNCTION note_signed_guard();
-- Una receta emitida no se edita: se anula con motivo y se emite otra (como las constancias). Una adenda no la cambia.
ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS voided_at TEXT,
  ADD COLUMN IF NOT EXISTS voided_by TEXT,
  ADD COLUMN IF NOT EXISTS void_reason TEXT;

-- v41: ronda 4 (EX1, reemplaza a MC4). Exámenes: Laboratorio e Imagen y gabinete. Cada examen guarda el área que lo
-- realiza (laboratorio, imágenes o, mientras la clínica no tenga esas áreas, enfermería) y cada cambio de estado.
ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS has_lab BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS has_imaging BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS critical_limits TEXT;
CREATE TABLE IF NOT EXISTS exam_catalog (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  grp TEXT NOT NULL CHECK (grp IN ('lab','imaging')),
  name TEXT NOT NULL,
  norm_key TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT NOT NULL REFERENCES staff(id), created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS exam_catalog_key ON exam_catalog (clinic_id, norm_key);
CREATE TABLE IF NOT EXISTS exam_profiles (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  owner_id TEXT REFERENCES staff(id),
  name TEXT NOT NULL,
  items TEXT NOT NULL,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE TABLE IF NOT EXISTS exam_orders (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  patient_id TEXT NOT NULL REFERENCES patients(id),
  consultation_id TEXT,
  hospitalization_id TEXT,
  note_id TEXT,
  batch_id TEXT NOT NULL,
  grp TEXT NOT NULL CHECK (grp IN ('lab','imaging')),
  name TEXT NOT NULL,
  region TEXT, side TEXT, indication TEXT,
  priority TEXT NOT NULL DEFAULT 'routine' CHECK (priority IN ('routine','urgent')),
  place TEXT NOT NULL DEFAULT 'clinic' CHECK (place IN ('clinic','external')),
  area TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ordered' CHECK (status IN ('ordered','sample','done','result','reviewed','cancelled')),
  ordered_by TEXT NOT NULL REFERENCES staff(id), ordered_at TEXT NOT NULL,
  status_at TEXT, status_by TEXT, cancel_reason TEXT,
  result TEXT, critical BOOLEAN NOT NULL DEFAULT FALSE,
  reviewed_by TEXT, reviewed_at TEXT,
  source_attachment_id TEXT
);
CREATE INDEX IF NOT EXISTS exam_orders_patient ON exam_orders (clinic_id, patient_id, ordered_at);
CREATE INDEX IF NOT EXISTS exam_orders_stay ON exam_orders (hospitalization_id);
CREATE INDEX IF NOT EXISTS exam_orders_open ON exam_orders (clinic_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS exam_orders_attachment ON exam_orders (source_attachment_id) WHERE source_attachment_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS exam_events (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  exam_id TEXT NOT NULL REFERENCES exam_orders(id),
  status TEXT NOT NULL,
  by_id TEXT NOT NULL,
  at TEXT NOT NULL,
  note TEXT
);
CREATE INDEX IF NOT EXISTS exam_events_exam ON exam_events (exam_id, at);
DROP TRIGGER IF EXISTS exam_events_no_change ON exam_events;
CREATE TRIGGER exam_events_no_change BEFORE UPDATE OR DELETE ON exam_events FOR EACH ROW EXECUTE FUNCTION audit_append_only();

-- v43 (DM1): indicador explícito de clínica de demostración (sólo en ellas se borran y regeneran pacientes) y
-- respaldo de lo que se borra antes de cada regeneración
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE IF NOT EXISTS demo_backups (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  clinic_ids TEXT NOT NULL,
  data TEXT NOT NULL
);

-- v44 (ronda 5, MC6): una autorización pendiente generada por error se elimina de la lista: queda archivada con
-- quién, cuándo y por qué (archived_at y archived_reason ya existían desde la v26)
ALTER TABLE authorizations ADD COLUMN IF NOT EXISTS archived_by TEXT;

-- v45 (ronda 5, OB1): una dosis también se registra como «Omitida» (con motivo), además de administrada y no aplicada
ALTER TABLE hosp_doses DROP CONSTRAINT IF EXISTS hosp_doses_status_check;
ALTER TABLE hosp_doses ADD CONSTRAINT hosp_doses_status_check CHECK (status IN ('given','skipped','omitted'));

-- v46 (ronda 5, AD3): rol de turnos, qué médico trabaja cada día (informativo; la agenda sigue con los horarios).
-- Quitar a alguien no borra la fila: queda con quién y cuándo la quitó.
CREATE TABLE IF NOT EXISTS duty_roster (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  day TEXT NOT NULL,
  staff_id TEXT NOT NULL REFERENCES staff(id),
  assigned_by TEXT NOT NULL, assigned_at TEXT NOT NULL,
  removed_by TEXT, removed_at TEXT
);
CREATE INDEX IF NOT EXISTS duty_roster_day ON duty_roster (clinic_id, day);
-- (v78, ronda 11: este índice único pasó a ser por departamento y turno: duty_roster_active2, más abajo)

-- v47 (ronda 5, AD1): umbrales críticos de laboratorio por grupo, con analitos propios, unidad y archivados. Los
-- umbrales planos (critical_limits) pasan a los grupos sin cambiar números y se conservan sin editarse.
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS critical_groups TEXT;

-- v48 (ronda 5, AD4): el catálogo de exámenes de cada clínica es la batería completa, editable por administración.
-- La lista fija del código se copia a cada clínica (base_key la enlaza con sus analitos, región y lado); quitar un
-- examen lo archiva. Los exámenes de la lista fija no tienen autor.
ALTER TABLE exam_catalog
  ADD COLUMN IF NOT EXISTS base_key TEXT,
  ADD COLUMN IF NOT EXISTS archived_at TEXT,
  ADD COLUMN IF NOT EXISTS archived_by TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TEXT,
  ADD COLUMN IF NOT EXISTS updated_by TEXT;
ALTER TABLE exam_catalog ALTER COLUMN created_by DROP NOT NULL;

-- v49 (ronda 5, MC2): un solo sistema de sets. Los «sets de exámenes» son sets del médico con sólo exámenes
-- (kind = 'exams'): nunca se comparten. Los perfiles fijos se entregan a cada médico como sets iniciales editables.
ALTER TABLE order_sets ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'orders';

-- v50 (ronda 6, MC2): el PRN guarda su condición («si dolor»). Las órdenes de antes quedan sin ella.
ALTER TABLE hosp_meds ADD COLUMN IF NOT EXISTS prn_condition TEXT;

-- v51 (ronda 6, CF3): subgrupo de cada examen del catálogo (Hematología, Rayos X…). Opcional: vacío se lee como el de la
-- lista fija u «Otros». La lista fija recibe el suyo (A6) y se cargan los exámenes y perfiles de server/data/labCatalog.ts.
ALTER TABLE exam_catalog ADD COLUMN IF NOT EXISTS subgroup TEXT;

-- v52 (ronda 6, MC3): un estudio que no está en el catálogo se pide con su tipo (Laboratorio o Imagen y gabinete) y
-- queda marcado «No catalogado». Las órdenes de antes no se tocan (no se sabe qué eran).
ALTER TABLE exam_orders ADD COLUMN IF NOT EXISTS uncatalogued BOOLEAN NOT NULL DEFAULT FALSE;

-- v53 (ronda 6, MC6): frecuencia de signos vitales por tramos (JSON), la que indica el médico en la nota. Cambiarla agrega un
-- tramo desde la siguiente hora: las tomas pasadas no se recalculan. Sin tramos, la regla de antes (vitals_every_hours).
ALTER TABLE hospitalizations ADD COLUMN IF NOT EXISTS vitals_plan TEXT;

-- v54 (ronda 6, MC8): una toma de signos vitales anotada dentro de una nota del médico guarda de qué nota viene
ALTER TABLE vitals ADD COLUMN IF NOT EXISTS source_note_id TEXT;

-- v55 (ronda 6, CR1): los procedimientos programados pasan a ser recordatorios de tipo Procedimiento. Un recordatorio lleva
-- su tipo (examen, procedimiento u otro). Los procedimientos de antes se copian como recordatorios y quedan marcados como
-- migrados (migrated_to): no se borran.
ALTER TABLE followups
  ADD COLUMN IF NOT EXISTS reminder_type TEXT,
  ADD COLUMN IF NOT EXISTS migrated_to TEXT,
  ADD COLUMN IF NOT EXISTS migrated_at TEXT;

-- v56 (ronda 7, CA1–CA3): el catálogo de laboratorio se carga de verdad (server/catalogLoader.ts, datos en
-- src/lib/labCatalog.ts): 289 exámenes con su «Área › Sección» en exam_catalog.subgroup, 27 perfiles de la clínica y los
-- paquetes que eran casillas (Perfil lipídico, Electrolitos…) archivados y reemplazados en los sets. Un perfil puede llevar
-- una nota («PSA total: solo en pacientes masculinos»).
ALTER TABLE exam_profiles ADD COLUMN IF NOT EXISTS note TEXT;

-- v57 (ronda 8): infusión continua con su velocidad (ml/h o ml/min) y primera dosis distinta (de carga, STAT) en la hoja de
-- medicamentos. La referencia también sale de la hospitalización y de la consulta externa (consultation_id; sin estancia).
-- Al subir la versión se cancelan las citas abiertas de los pacientes internados (closeVisitsOfInpatients).
ALTER TABLE hosp_meds
  ADD COLUMN IF NOT EXISTS infusion_rate DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS infusion_unit TEXT,
  ADD COLUMN IF NOT EXISTS loading_dose TEXT;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS consultation_id TEXT REFERENCES consultations(id);
ALTER TABLE referrals ALTER COLUMN hospitalization_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS referrals_consult ON referrals (consultation_id);

-- v58 (ronda 8, pedido completo). CX2: la cita que cancela el sistema por una estancia activa lleva motivo, autor («system»)
-- y hora; también se guarda quién canceló a mano. Sólo columnas nuevas.
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_by TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TEXT;
-- v59 (ronda 8). ME1: enfermería suspende la infusión en curso. ME2: la dosis inicial es STAT o a una hora elegida; cada dosis registrada
-- guarda la cantidad que le correspondía.
ALTER TABLE hosp_meds
  ADD COLUMN IF NOT EXISTS loading_stat BOOLEAN,
  ADD COLUMN IF NOT EXISTS infusion_stopped_at TEXT,
  ADD COLUMN IF NOT EXISTS infusion_stopped_by TEXT,
  ADD COLUMN IF NOT EXISTS infusion_stop_note TEXT;
ALTER TABLE hosp_doses ADD COLUMN IF NOT EXISTS dose TEXT;
-- v60 (ronda 8). EX2: número de la orden de exámenes, correlativo por clínica y año
ALTER TABLE exam_orders ADD COLUMN IF NOT EXISTS order_no TEXT;
-- v61 (ronda 8). RF1: la referencia también se emite desde una consulta todavía en borrador (por su cita); al firmarla se enlaza
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS appointment_id TEXT;

-- v62 (ronda 8). UM1: las 59 fuentes del .md de valores de referencia y los valores de referencia de cada examen por
-- clínica, con su origen (catalog: «Catálogo Clinara 2026-11-02»; initial: valor inicial de Clinara; clinic: definido por
-- la clínica) y su historial (las filas reemplazadas quedan archivadas, no se borran). Ver server/refLoader.ts.
CREATE TABLE IF NOT EXISTS lab_sources (
  code TEXT PRIMARY KEY,
  citation TEXT NOT NULL,
  urls TEXT NOT NULL DEFAULT '[]',
  version TEXT
);
CREATE TABLE IF NOT EXISTS exam_ref_values (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  exam_key TEXT NOT NULL,
  exam_name TEXT NOT NULL,
  analyte TEXT NOT NULL DEFAULT '',
  sex TEXT NOT NULL DEFAULT 'all' CHECK (sex IN ('all','F','M')),
  unit TEXT NOT NULL DEFAULT '',
  low DOUBLE PRECISION, high DOUBLE PRECISION, high_open BOOLEAN NOT NULL DEFAULT FALSE,
  expected TEXT, note TEXT, warn BOOLEAN NOT NULL DEFAULT FALSE,
  sources TEXT NOT NULL DEFAULT '[]',
  origin TEXT NOT NULL CHECK (origin IN ('catalog','initial','clinic')),
  origin_label TEXT, version TEXT, md_row TEXT, edit_note TEXT,
  created_at TEXT NOT NULL, created_by TEXT,
  archived_at TEXT, archived_by TEXT, archive_reason TEXT
);
CREATE INDEX IF NOT EXISTS exam_ref_clinic ON exam_ref_values (clinic_id, exam_key) WHERE archived_at IS NULL;

-- v63 (ronda 8, RF1): una referencia firmada no se edita: se corrige con adenda (como las notas). La lista de tipos de
-- adenda se fija una sola vez, más abajo (v65+): este esquema se vuelve a ejecutar entero en cada cambio de versión, y
-- volver a poner aquí la lista corta fallaba en cuanto existía una adenda de anestesia, valoración o recuento.

-- v65 (ronda 9). ME4: nebulización con varios medicamentos en una sola orden (componentes y diluyente, en JSON). La dosis
-- registrada guarda la composición aplicada en su columna «dose» (v59).
ALTER TABLE hosp_meds ADD COLUMN IF NOT EXISTS nebulization TEXT;
-- v66 (ronda 9, ME5): el Listado Nacional de Medicamentos Esenciales de Honduras 2023 (AM 5230-2023) entra al vademécum de
-- cada clínica (misma tabla clinic_drugs: así lo ven la búsqueda, Mi vademécum y Configuración › Vademécum sin otra lista).
-- Lo que la clínica ya tenía no se toca: si es el mismo medicamento, sólo gana el número, la etiqueta y el alias del LNME
-- (lnme_match 'exact' o 'synonym'). Lo que no existía se crea (lnme_match 'created', origin 'lnme', sin autor). Si la clínica
-- edita o archiva uno del listado, su origen pasa a 'clinic' («Editado por la clínica») y ninguna carga lo vuelve a pisar ni
-- a reactivar. Nada se borra.
ALTER TABLE clinic_drugs
  ALTER COLUMN created_by DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'clinic',
  ADD COLUMN IF NOT EXISTS origin_label TEXT,
  ADD COLUMN IF NOT EXISTS lnme_no INTEGER,
  ADD COLUMN IF NOT EXISTS lnme_match TEXT,
  ADD COLUMN IF NOT EXISTS lnme_version TEXT,
  ADD COLUMN IF NOT EXISTS lnme_group TEXT,
  ADD COLUMN IF NOT EXISTS lnme_subgroup TEXT,
  ADD COLUMN IF NOT EXISTS lnme_name TEXT,
  ADD COLUMN IF NOT EXISTS form TEXT,
  ADD COLUMN IF NOT EXISTS lnme_routes TEXT,
  ADD COLUMN IF NOT EXISTS package TEXT,
  ADD COLUMN IF NOT EXISTS complementary BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS restriction TEXT,
  ADD COLUMN IF NOT EXISTS lnme_note TEXT,
  ADD COLUMN IF NOT EXISTS certainty TEXT,
  ADD COLUMN IF NOT EXISTS presentation_full TEXT,
  ADD COLUMN IF NOT EXISTS alternatives TEXT,
  ADD COLUMN IF NOT EXISTS aliases TEXT;
CREATE INDEX IF NOT EXISTS clinic_drugs_lnme ON clinic_drugs (clinic_id, lnme_no);
-- v67–v68 (ronda 9). GE4: periodo de gracia con versiones. Cada corrección guarda aquí el contenido completo de la versión
-- anterior (nunca se borra); el registro queda con la última y su número de versión. «recorded_at» es cuándo se registró
-- por primera vez (de ahí cuentan los minutos; los registros de antes no lo tienen y no se corrigen así).
CREATE TABLE IF NOT EXISTS record_versions (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  data TEXT NOT NULL,
  author_id TEXT NOT NULL,
  at TEXT NOT NULL,
  replaced_by TEXT NOT NULL,
  replaced_at TEXT NOT NULL,
  reason TEXT,
  UNIQUE (target_kind, target_id, version)
);
CREATE INDEX IF NOT EXISTS record_versions_target ON record_versions (target_kind, target_id);
-- Lo impreso o descargado (receta): bloquea su corrección
CREATE TABLE IF NOT EXISTS print_log (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  how TEXT NOT NULL,
  by_id TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS print_log_target ON print_log (target_kind, target_id);
ALTER TABLE hosp_notes ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE hosp_doses ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE hosp_doses ADD COLUMN IF NOT EXISTS recorded_at TEXT;
ALTER TABLE vitals ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE vitals ADD COLUMN IF NOT EXISTS recorded_at TEXT;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS recorded_at TEXT;
ALTER TABLE exam_orders ADD COLUMN IF NOT EXISTS result_version INTEGER NOT NULL DEFAULT 1;
-- GE4: la base sigue sin dejar editar lo firmado, salvo una corrección del periodo de gracia: la versión sube en uno, el
-- autor y la hora de la firma no cambian y la versión anterior ya quedó guardada en record_versions.
CREATE OR REPLACE FUNCTION note_signed_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF current_setting('clinara.note_maintenance', true) = 'on' THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'La nota está firmada: no se borra.'; END IF;
  IF NEW.version = OLD.version + 1 AND NEW.author_id = OLD.author_id AND NEW.at = OLD.at AND NEW.kind = OLD.kind AND NEW.hospitalization_id = OLD.hospitalization_id
     AND EXISTS (SELECT 1 FROM record_versions WHERE target_kind = 'note' AND target_id = OLD.id AND version = OLD.version) THEN
    RETURN NEW;
  END IF;
  IF ROW(NEW.hospitalization_id, NEW.kind, NEW.author_id, NEW.at, NEW.subjective, NEW.objective, NEW.assessment, NEW.plan, NEW.text, NEW.data, NEW.version)
     IS DISTINCT FROM ROW(OLD.hospitalization_id, OLD.kind, OLD.author_id, OLD.at, OLD.subjective, OLD.objective, OLD.assessment, OLD.plan, OLD.text, OLD.data, OLD.version) THEN
    RAISE EXCEPTION 'La nota está firmada: no se edita. Escribe una adenda.';
  END IF;
  RETURN NEW;
END
$fn$;
CREATE OR REPLACE FUNCTION consultation_signed_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF current_setting('clinara.note_maintenance', true) = 'on' THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'La consulta está firmada: no se borra.'; END IF;
  IF NEW.version = OLD.version + 1 AND NEW.doctor_id = OLD.doctor_id AND NEW.date = OLD.date AND NEW.patient_id = OLD.patient_id
     AND EXISTS (SELECT 1 FROM record_versions WHERE target_kind = 'consultation' AND target_id = OLD.id AND version = OLD.version) THEN
    RETURN NEW;
  END IF;
  IF ROW(NEW.patient_id, NEW.doctor_id, NEW.date, NEW.reason, NEW.history, NEW.exam, NEW.observations, NEW.diagnoses, NEW.orders, NEW.indications, NEW.plan, NEW.meds, NEW.symptoms, NEW.symptom_onset, NEW.version)
     IS DISTINCT FROM ROW(OLD.patient_id, OLD.doctor_id, OLD.date, OLD.reason, OLD.history, OLD.exam, OLD.observations, OLD.diagnoses, OLD.orders, OLD.indications, OLD.plan, OLD.meds, OLD.symptoms, OLD.symptom_onset, OLD.version) THEN
    RAISE EXCEPTION 'La consulta está firmada: no se edita. Escribe una adenda.';
  END IF;
  RETURN NEW;
END
$fn$;
-- v69 (ronda 9, GE4): el seguimiento sabe de qué consulta salió, para ajustar sus avisos si la nota se corrige a tiempo
ALTER TABLE followups ADD COLUMN IF NOT EXISTS source_id TEXT;
-- v70 (ronda 10): exportación de lo que una limpieza o carga borra o reemplaza (umbrales archivados de UM3, catálogo de imagen
-- de CA5, datos del vademécum de ME6). Nunca se borra.
-- v72 (ronda 10). ME10: medicamento que la clínica no tiene: sigue en la hoja y va a una receta para comprarlo afuera.
-- EX5 y ME10: cada orden de exámenes o receta que se imprime o descarga desde la pestaña Exámenes o la hoja (qué, de qué
-- médico, quién y cuándo). Cuenta para el bloqueo de GE4 (print_log).
ALTER TABLE hosp_meds ADD COLUMN IF NOT EXISTS buy_outside BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE hosp_meds ADD COLUMN IF NOT EXISTS buy_quantity TEXT;
CREATE TABLE IF NOT EXISTS print_jobs (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  patient_id TEXT NOT NULL REFERENCES patients(id),
  hospitalization_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('exams','rx')),
  items TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS print_jobs_patient ON print_jobs (clinic_id, patient_id);
-- v73 (ronda 10). CA5: cada estudio de imagen guarda qué detalles pide al ordenar (proyección, contraste, lado, región), si
-- administración los cambió; y cada orden, lo que se eligió (para armar «Rayos X de tórax PA y lateral»).
ALTER TABLE exam_catalog ADD COLUMN IF NOT EXISTS details TEXT;
ALTER TABLE exam_orders ADD COLUMN IF NOT EXISTS projections TEXT;
ALTER TABLE exam_orders ADD COLUMN IF NOT EXISTS contrast TEXT;
ALTER TABLE exam_orders ADD COLUMN IF NOT EXISTS detailed BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE IF NOT EXISTS config_backups (
  id TEXT PRIMARY KEY,
  clinic_id TEXT,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL,
  data TEXT NOT NULL,
  note TEXT
);
-- v74–v75 (ronda 11). CA7: en el catálogo de exámenes ya no se archiva: «Quitar» borra. Queda la marca de lo quitado (quién,
-- cuándo, por qué) para que ninguna carga lo vuelva a poner. CA6: lo escrito en «¿De qué?» de un estudio genérico.
CREATE TABLE IF NOT EXISTS exam_catalog_removed (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  grp TEXT NOT NULL,
  name TEXT NOT NULL,
  norm_key TEXT NOT NULL,
  base_key TEXT,
  removed_by TEXT NOT NULL,
  removed_at TEXT NOT NULL,
  reason TEXT
);
CREATE INDEX IF NOT EXISTS exam_catalog_removed_clinic ON exam_catalog_removed (clinic_id, norm_key);
ALTER TABLE exam_orders ADD COLUMN IF NOT EXISTS subject TEXT;
-- v76 (ronda 11). ME12: la receta generada por un médico lleva SUS datos (doctor_id) y, por medicamento, los días y la cantidad
-- a comprar solo para esa receta (data, JSON); no cambian la orden ni la hoja.
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS doctor_id TEXT;
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS data TEXT;
-- v77 (ronda 11). EX6: el resultado de exámenes en PDF o impreso es otro trabajo de impresión («results»)
ALTER TABLE print_jobs DROP CONSTRAINT IF EXISTS print_jobs_kind_check;
ALTER TABLE print_jobs ADD CONSTRAINT print_jobs_kind_check CHECK (kind IN ('exams','rx','results'));
-- v78–v79 (ronda 11). DP1: roles Laboratorio e Imágenes con su cargo (Microbiólogo, Técnico de laboratorio, Radiólogo, Técnico en
-- imágenes). DP2/DP3: ubicación de la orden («ambulatory»), quién la solicita, la foto de la orden en papel y «No se realizó».
-- DP6: rol de turnos por departamento (doctors, nursing, lab, imaging) y por turno (Mañana, Tarde, Noche).
ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_role_check;
ALTER TABLE staff ADD CONSTRAINT staff_role_check CHECK (role IN ('superadmin','admin','doctor','nurse','reception','assistant','lab','imaging'));
ALTER TABLE staff ADD COLUMN IF NOT EXISTS position TEXT;
ALTER TABLE exam_orders
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS requested_by_id TEXT,
  ADD COLUMN IF NOT EXISTS requested_by_name TEXT,
  ADD COLUMN IF NOT EXISTS order_file_id TEXT,
  ADD COLUMN IF NOT EXISTS not_done_reason TEXT,
  ADD COLUMN IF NOT EXISTS not_done_at TEXT,
  ADD COLUMN IF NOT EXISTS not_done_by TEXT;
ALTER TABLE duty_roster ADD COLUMN IF NOT EXISTS dept TEXT NOT NULL DEFAULT 'doctors';
ALTER TABLE duty_roster ADD COLUMN IF NOT EXISTS shift TEXT;
DROP INDEX IF EXISTS duty_roster_active;
CREATE UNIQUE INDEX IF NOT EXISTS duty_roster_active2 ON duty_roster (clinic_id, dept, day, staff_id, COALESCE(shift, '')) WHERE removed_at IS NULL;
-- v81 (ronda 13). IM2: «Incluir diagnóstico» se guarda con la receta. Las recetas de antes quedan en NULL: se imprimían con el
-- diagnóstico de la consulta y así se reimprimen (A8); las nuevas empiezan apagadas. La receta de la estancia (print_jobs)
-- siempre salía sin diagnóstico: FALSE. El registro de impresiones guarda si la receta lo llevaba. Idempotente.
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS include_dx BOOLEAN;
ALTER TABLE prescriptions ALTER COLUMN include_dx SET DEFAULT FALSE;
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS include_dx BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE print_log ADD COLUMN IF NOT EXISTS with_dx BOOLEAN;
-- v82 (ronda 14). RU1: catálogo de material médico quirúrgico por clínica (carga del .md en server/supplies.ts: md_key es la
-- clave de la línea del .md; edited_at, archived_at y list_set_at marcan lo que la clínica cambió y ninguna carga vuelve a
-- tocar) y su periodo de registro («Por turno», «Por día», «Por semana») con los turnos editables. Nada se borra: se archiva.
CREATE TABLE IF NOT EXISTS supply_items (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  category TEXT NOT NULL,
  material TEXT NOT NULL,
  variant TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL CHECK (unit IN ('unidad','par','sobre','rollo','frasco','hoja')),
  on_shift_list BOOLEAN NOT NULL DEFAULT FALSE,
  sort INTEGER NOT NULL DEFAULT 0,
  origin TEXT NOT NULL DEFAULT 'clinic' CHECK (origin IN ('catalog','clinic')),
  md_key TEXT,
  md_no INTEGER,
  created_by TEXT,
  created_at TEXT NOT NULL,
  edited_at TEXT,
  edited_by TEXT,
  list_set_at TEXT,
  list_set_by TEXT,
  archived_at TEXT,
  archived_by TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS supply_items_md ON supply_items (clinic_id, md_key) WHERE md_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS supply_items_clinic ON supply_items (clinic_id);
CREATE TABLE IF NOT EXISTS supply_settings (
  clinic_id TEXT PRIMARY KEY REFERENCES clinics(id),
  period TEXT NOT NULL DEFAULT 'shift' CHECK (period IN ('shift','day','week')),
  shifts TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT
);
-- v82 (ronda 14). RU2: aplicaciones de consulta externa (ME13; contrato de la otra rama: misma tabla, se deduplica al unir) y
-- registros de material por paciente o «Uso general del servicio», con su periodo (turno, día o semana), sus materiales
-- (copia de material, variante y unidad al registrar), la corrección en el periodo de gracia (GE4, record_versions) y la
-- anulación con motivo. Nada se borra; un registro anulado no suma.
-- v82 (ronda 14). ME13: un medicamento «Aplicar en la clínica» de la consulta externa sin ingreso ya no crea una observación:
-- queda «Por aplicar» para enfermería (o el médico), que registra «Aplicado» (hora y quién) o «No aplicado» (motivo). Una fila
-- por medicamento de la consulta (consultation_id + item_index). Lo lee el registro de uso (RU2).
CREATE TABLE IF NOT EXISTS consult_applications (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  consultation_id TEXT NOT NULL,
  item_index INTEGER NOT NULL,
  drug TEXT NOT NULL,
  order_text TEXT NOT NULL,
  ordered_by TEXT NOT NULL,
  ordered_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','not_applied')),
  applied_at TEXT,
  reason TEXT,
  recorded_by TEXT,
  recorded_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS consult_applications_item ON consult_applications (consultation_id, item_index);
CREATE TABLE IF NOT EXISTS material_uses (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  patient_id TEXT REFERENCES patients(id),
  general BOOLEAN NOT NULL DEFAULT FALSE,
  area TEXT,
  location TEXT,
  period_kind TEXT NOT NULL CHECK (period_kind IN ('shift','day','week')),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  period_label TEXT NOT NULL,
  shift_key TEXT,
  items TEXT NOT NULL,
  recorded_by TEXT NOT NULL REFERENCES staff(id),
  recorded_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  corrected_at TEXT,
  corrected_by TEXT,
  voided_at TEXT,
  voided_by TEXT,
  void_reason TEXT,
  CHECK ((general AND patient_id IS NULL) OR (NOT general AND patient_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS material_uses_period ON material_uses (clinic_id, period_start);
CREATE INDEX IF NOT EXISTS consult_applications_clinic ON consult_applications (clinic_id, ordered_at);
-- v82 (ronda 14). PQ3: hoja de anestesia ligada a la nota postquirúrgica. Una vigente por nota: subida en papel (un PDF hecho
-- con las fotos o el escaneo, en attachments con categoría 'anesthesia') o llenada y firmada en el sistema por el anestesiólogo
-- de la nota (data en JSON y su firma copiada en signer). Nada se borra: reemplazar una hoja subida la deja anulada (voided_*)
-- con motivo y apunta a la nueva (replaced_by); su archivo también queda anulado y visible. La llenada en el sistema se corrige
-- en el periodo de gracia (GE4, record_versions con target_kind 'anesthesia') o con adenda (addenda.target_kind 'anesthesia').
-- No es obligatoria: no genera avisos ni bloquea el egreso. Idempotente.
CREATE TABLE IF NOT EXISTS anesthesia_sheets (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  hospitalization_id TEXT NOT NULL REFERENCES hospitalizations(id),
  note_id TEXT NOT NULL REFERENCES hosp_notes(id),
  patient_id TEXT NOT NULL REFERENCES patients(id),
  mode TEXT NOT NULL CHECK (mode IN ('upload','system')),
  performed_by_name TEXT NOT NULL,
  performed_by_id TEXT REFERENCES staff(id),
  observation TEXT,
  file_id TEXT,
  data TEXT,
  signer TEXT,
  created_by TEXT NOT NULL REFERENCES staff(id),
  created_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  voided_at TEXT,
  voided_by TEXT REFERENCES staff(id),
  void_reason TEXT,
  replaced_by TEXT
);
CREATE INDEX IF NOT EXISTS anesthesia_sheets_stay ON anesthesia_sheets (clinic_id, hospitalization_id);
CREATE UNIQUE INDEX IF NOT EXISTS anesthesia_sheets_active ON anesthesia_sheets (note_id) WHERE voided_at IS NULL;
CREATE OR REPLACE FUNCTION anesthesia_no_delete() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF current_setting('clinara.note_maintenance', true) = 'on' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'La hoja de anestesia no se borra: se reemplaza con motivo o se corrige con adenda.';
END $fn$;
DROP TRIGGER IF EXISTS anesthesia_sheets_no_delete ON anesthesia_sheets;
CREATE TRIGGER anesthesia_sheets_no_delete BEFORE DELETE ON anesthesia_sheets FOR EACH ROW EXECUTE FUNCTION anesthesia_no_delete();
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS voided_at TEXT;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS void_reason TEXT;
ALTER TABLE addenda DROP CONSTRAINT IF EXISTS addenda_target_kind_check;
ALTER TABLE addenda ADD CONSTRAINT addenda_target_kind_check CHECK (target_kind IN ('consultation','note','referral','anesthesia','preanesthesia','surgical_count'));
-- v83 (ronda 15). RU5: «Registro» de cada línea del catálogo (a quién se le registra: paciente, uso general o ambos). Las
-- líneas que ya existían (y las que crea la clínica) quedan en «Ambos» (A6); la carga del .md v2 (server/supplies.ts) pone al día
-- las del .md que la clínica no editó ni archivó. RU8: sets de material por clínica (nombre único, descripción y líneas con su
-- cantidad; se archivan y se restauran, nada se borra; md_key = set inicial del Anexo del .md, edited_at = la clínica lo
-- cambió y ninguna carga lo vuelve a tocar). El registro de material guarda qué sets se usaron (id y nombre en ese momento).
ALTER TABLE supply_items ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'both' CHECK (scope IN ('patient','general','both'));
CREATE TABLE IF NOT EXISTS supply_sets (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  items TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'clinic' CHECK (origin IN ('catalog','clinic')),
  md_key TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT,
  edited_at TEXT,
  archived_at TEXT,
  archived_by TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS supply_sets_md ON supply_sets (clinic_id, md_key) WHERE md_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS supply_sets_clinic ON supply_sets (clinic_id);
ALTER TABLE material_uses ADD COLUMN IF NOT EXISTS sets TEXT;
-- v86 (ronda 16, PQ4): la valoración preanestésica es un documento aparte, ligado a la ESTANCIA (no a la nota postquirúrgica):
-- se escribe antes de la cirugía. Puede haber varias por estancia (se reprograma la cirugía): la vigente es la última firmada
-- (o subida) sin anular. La escribe y la firma cualquier médico (en signer queda su firma); en papel la sube médico o
-- enfermería. Nada se borra: la subida se reemplaza con motivo (voided_*, replaced_by); la llenada se corrige en el periodo de
-- gracia (record_versions 'preanesthesia') o con adenda (addenda 'preanesthesia'). Las hojas de anestesia de PQ3 conservan su
-- valoración adentro; el registro de anestesia nuevo apunta a la valoración vigente que resumió (pre_eval_id). Idempotente.
CREATE TABLE IF NOT EXISTS preanesthesia_evals (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  hospitalization_id TEXT NOT NULL REFERENCES hospitalizations(id),
  patient_id TEXT NOT NULL REFERENCES patients(id),
  authorization_id TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('upload','system')),
  performed_by_name TEXT NOT NULL,
  performed_by_id TEXT REFERENCES staff(id),
  observation TEXT,
  file_id TEXT,
  data TEXT,
  signer TEXT,
  created_by TEXT NOT NULL REFERENCES staff(id),
  created_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  voided_at TEXT,
  voided_by TEXT REFERENCES staff(id),
  void_reason TEXT,
  replaced_by TEXT
);
CREATE INDEX IF NOT EXISTS preanesthesia_evals_stay ON preanesthesia_evals (clinic_id, hospitalization_id, created_at);
CREATE OR REPLACE FUNCTION surgical_doc_no_delete() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF current_setting('clinara.note_maintenance', true) = 'on' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'El documento quirúrgico no se borra: se reemplaza con motivo o se corrige con adenda.';
END $fn$;
DROP TRIGGER IF EXISTS preanesthesia_evals_no_delete ON preanesthesia_evals;
CREATE TRIGGER preanesthesia_evals_no_delete BEFORE DELETE ON preanesthesia_evals FOR EACH ROW EXECUTE FUNCTION surgical_doc_no_delete();
-- v86 (ronda 16, PQ4): el registro de anestesia guarda qué valoración vigente resumió (las hojas de PQ3 quedan en NULL).
ALTER TABLE anesthesia_sheets ADD COLUMN IF NOT EXISTS pre_eval_id TEXT;
-- v86 (ronda 16, PQ5): recuento quirúrgico de la nota postquirúrgica, mismo patrón que la hoja de anestesia: uno vigente por
-- nota, subido en papel o llenado y firmado en el sistema (médico, enfermería o quien entró a la cirugía con usuario). Nada se
-- borra; corrección en el periodo de gracia (record_versions 'surgical_count') o adenda (addenda 'surgical_count'). Opcional:
-- no genera avisos ni bloquea el egreso. Idempotente.
CREATE TABLE IF NOT EXISTS surgical_counts (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  hospitalization_id TEXT NOT NULL REFERENCES hospitalizations(id),
  note_id TEXT NOT NULL REFERENCES hosp_notes(id),
  patient_id TEXT NOT NULL REFERENCES patients(id),
  mode TEXT NOT NULL CHECK (mode IN ('upload','system')),
  observation TEXT,
  file_id TEXT,
  data TEXT,
  signer TEXT,
  created_by TEXT NOT NULL REFERENCES staff(id),
  created_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  voided_at TEXT,
  voided_by TEXT REFERENCES staff(id),
  void_reason TEXT,
  replaced_by TEXT
);
CREATE INDEX IF NOT EXISTS surgical_counts_stay ON surgical_counts (clinic_id, hospitalization_id);
CREATE UNIQUE INDEX IF NOT EXISTS surgical_counts_active ON surgical_counts (note_id) WHERE voided_at IS NULL;
DROP TRIGGER IF EXISTS surgical_counts_no_delete ON surgical_counts;
CREATE TRIGGER surgical_counts_no_delete BEFORE DELETE ON surgical_counts FOR EACH ROW EXECUTE FUNCTION surgical_doc_no_delete();
-- v87 (ronda 16, ME16): un solo formulario de medicamento; las órdenes de la hoja también guardan la «Cantidad total», como la
-- receta (opcional; las de antes quedan sin dato). La infusión de la consulta con ingreso usa las columnas de infusión de siempre.
ALTER TABLE hosp_meds ADD COLUMN IF NOT EXISTS quantity TEXT;
-- v88 (ronda 16, HO2): médico(s) tratante(s) de la estancia: JSON con los id del personal, el primero es el principal. Lo elige
-- quien ingresa (recepción y administración también ingresan, con el médico tratante obligatorio). Las estancias de antes
-- quedan con quien las ingresó (siempre un médico). Idempotente: solo llena las vacías.
ALTER TABLE hospitalizations ADD COLUMN IF NOT EXISTS attending_ids TEXT;
UPDATE hospitalizations SET attending_ids = json_build_array(admitted_by)::text WHERE attending_ids IS NULL AND admitted_by IS NOT NULL;
-- v88 (ronda 16, IE1): ingestas y excretas. La orden «Cuantificar ingestas y excretas» va por tramos en la estancia (JSON, como
-- vitals_plan: frecuencia de corte o 'off' cuando una nota la suspende). Los ingresos y egresos manuales van en fluid_entries:
-- con autor y hora; se corrigen en el periodo de gracia (record_versions 'fluid_entry') y después se anulan con motivo (no
-- se borran). Los líquidos IV se calculan de la hoja de medicamentos (no se guardan). Idempotente.
ALTER TABLE hospitalizations ADD COLUMN IF NOT EXISTS fluids_plan TEXT;
CREATE TABLE IF NOT EXISTS fluid_entries (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  hospitalization_id TEXT NOT NULL REFERENCES hospitalizations(id),
  patient_id TEXT NOT NULL REFERENCES patients(id),
  kind TEXT NOT NULL CHECK (kind IN ('in','out')),
  item TEXT NOT NULL,
  ml NUMERIC NOT NULL CHECK (ml > 0),
  at TEXT NOT NULL,
  note TEXT,
  created_by TEXT NOT NULL REFERENCES staff(id),
  created_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  corrected_at TEXT,
  corrected_by TEXT REFERENCES staff(id),
  voided_at TEXT,
  voided_by TEXT REFERENCES staff(id),
  void_reason TEXT
);
CREATE INDEX IF NOT EXISTS fluid_entries_stay ON fluid_entries (clinic_id, hospitalization_id, at);
-- v90 (ronda 17, OB1): «Órdenes en observación → Enfermería las revisa como checklist» viene activado en las clínicas nuevas.
-- Solo cambia el valor por omisión; activarlo en las que ya existen lo hace enableObsChecklistOnce (una sola vez).
ALTER TABLE clinics ALTER COLUMN obs_order_checklist SET DEFAULT TRUE;
`
