import type { Appointment, Attachment, AuditEntry, Consultation, Patient, Payment, Prescription, Service, Staff, Vitals } from '../src/lib/types.js'

type Row = Record<string, unknown>
const s = (v: unknown) => (v == null ? undefined : String(v))
const j = <T>(v: unknown, fallback: T): T => { try { return v ? JSON.parse(String(v)) as T : fallback } catch { return fallback } }

export const toStaff = (r: Row): Staff => ({
  id: String(r.id), name: String(r.name), role: r.role as Staff['role'], specialty: s(r.specialty), email: String(r.email),
  license: s(r.license), color: String(r.color), active: Boolean(r.active),
  schedule: r.schedule ? j(r.schedule, undefined) : undefined, serviceId: s(r.service_id), twoFactor: Boolean(r.totp_enabled),
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
  source: (r.source as Appointment['source']) ?? 'staff', remindedAt: s(r.reminded_at),
  paid: r.paid == null ? undefined : Boolean(r.paid),
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

export const toService = (r: Row): Service => ({ id: String(r.id), name: String(r.name), price: Number(r.price), active: Boolean(r.active) })

export const toPayment = (r: Row): Payment => ({
  id: String(r.id), receiptNo: String(r.receipt_no), appointmentId: s(r.appointment_id), patientId: String(r.patient_id),
  items: j(r.items, []), discount: Number(r.discount), total: Number(r.total), method: r.method as Payment['method'],
  reference: s(r.reference), receivedBy: String(r.received_by), paidAt: String(r.paid_at), voided: Boolean(r.voided),
})

export const toAttachment = (r: Row): Attachment => ({
  id: String(r.id), patientId: String(r.patient_id), name: String(r.name), mime: String(r.mime), size: Number(r.size),
  category: r.category as Attachment['category'], uploadedBy: String(r.uploaded_by), uploadedAt: String(r.uploaded_at),
})
