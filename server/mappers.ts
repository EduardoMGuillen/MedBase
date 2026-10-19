import type { Appointment, AuditEntry, Consultation, Patient, Prescription, Staff, Vitals } from '../src/lib/types'

type Row = Record<string, unknown>
const s = (v: unknown) => (v == null ? undefined : String(v))
const j = <T>(v: unknown, fallback: T): T => { try { return v ? JSON.parse(String(v)) as T : fallback } catch { return fallback } }

export const toStaff = (r: Row): Staff => ({
  id: String(r.id), name: String(r.name), role: r.role as Staff['role'], specialty: s(r.specialty), email: String(r.email),
  license: s(r.license), color: String(r.color), active: Boolean(r.active),
})

export const toPatient = (r: Row, clinical: boolean): Patient => ({
  id: String(r.id), record: String(r.record), firstName: String(r.first_name), lastName: String(r.last_name),
  birthDate: String(r.birth_date), sex: r.sex as Patient['sex'], phone: String(r.phone), email: s(r.email),
  insurance: s(r.insurance), createdAt: String(r.created_at),
  // Los datos clínicos sólo viajan a quien tiene acceso al expediente
  bloodType: clinical ? s(r.blood_type) : undefined,
  allergies: clinical ? j<string[]>(r.allergies, []) : [],
  conditions: clinical ? j<string[]>(r.conditions, []) : [],
})

export const toAppointment = (r: Row): Appointment => ({
  id: String(r.id), patientId: String(r.patient_id), doctorId: String(r.doctor_id), start: String(r.start),
  minutes: Number(r.minutes), reason: String(r.reason), type: r.type as Appointment['type'],
  status: r.status as Appointment['status'], arrivedAt: s(r.arrived_at),
})

export const toVitals = (r: Row): Vitals => ({
  id: String(r.id), patientId: String(r.patient_id), appointmentId: s(r.appointment_id), takenBy: String(r.taken_by),
  takenAt: String(r.taken_at), systolic: Number(r.systolic), diastolic: Number(r.diastolic), heartRate: Number(r.heart_rate),
  temperature: Number(r.temperature), spo2: Number(r.spo2), weightKg: Number(r.weight_kg), heightCm: Number(r.height_cm),
  painScale: r.pain_scale == null ? undefined : Number(r.pain_scale), notes: s(r.notes),
})

export const toConsultation = (r: Row): Consultation => ({
  id: String(r.id), patientId: String(r.patient_id), doctorId: String(r.doctor_id), appointmentId: s(r.appointment_id),
  date: String(r.date), reason: String(r.reason), symptoms: j(r.symptoms, []), symptomOnset: s(r.symptom_onset),
  history: String(r.history ?? ''), exam: String(r.exam ?? ''), diagnoses: j(r.diagnoses, []), plan: String(r.plan ?? ''),
  vitalsId: s(r.vitals_id), prescriptionId: s(r.prescription_id),
})

export const toPrescription = (r: Row): Prescription => ({
  id: String(r.id), folio: String(r.folio), patientId: String(r.patient_id), doctorId: String(r.doctor_id),
  consultationId: String(r.consultation_id), issuedAt: String(r.issued_at), items: j(r.items, []),
})

export const toAudit = (r: Row): AuditEntry => ({ id: String(r.id), at: String(r.at), userId: String(r.user_id), action: String(r.action) })
