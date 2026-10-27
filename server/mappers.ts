import type {
  Appointment, Attachment, AuditEntry, Authorization, AuthorizationData, Background, Bed, Certificate, CertificateData, Clinic, ClinicDrug, ClinicSettings, Consultation, Dose, Followup, HospProcedure, Hospitalization, InpatientMed, InpatientNote,
  ConsentRevocation, ConsentSigning, Epicrisis, EpicrisisData, GuestPatient, Patient, Payment, Prescription, Referral, ReferralData, Service, Staff, Vitals,
} from '../src/lib/types.js'
import { DEFAULT_SETTINGS } from '../src/lib/seed.js'
import { DNI_MASK } from '../src/lib/format.js'

type Row = Record<string, unknown>
const s = (v: unknown) => (v == null ? undefined : String(v))
const n = (v: unknown) => (v == null || v === '' ? undefined : Number(v))
const j = <T>(v: unknown, fallback: T): T => { try { return v ? JSON.parse(String(v)) as T : fallback } catch { return fallback } }

export const toStaff = (r: Row): Staff => ({
  id: String(r.id), clinicId: s(r.clinic_id), name: String(r.name), role: r.role as Staff['role'], specialty: s(r.specialty), email: String(r.email),
  license: s(r.license), color: String(r.color), active: Boolean(r.active),
  schedule: r.schedule ? j(r.schedule, undefined) : undefined, serviceId: s(r.service_id), twoFactor: Boolean(r.totp_enabled),
  prefs: r.prefs ? j<Staff['prefs']>(r.prefs, {}) : undefined,
  clinicKind: r.clinic_kind == null ? undefined : (String(r.clinic_kind) as Staff['clinicKind']),
  hasSignature: r.signature ? true : undefined,
})

export const toPatient = (r: Row, clinical: boolean): Patient => ({
  id: String(r.id), record: String(r.record), firstName: String(r.first_name), lastName: String(r.last_name),
  birthDate: String(r.birth_date ?? ''), sex: (r.sex ?? 'F') as Patient['sex'], phone: String(r.phone), email: s(r.email), pending: Boolean(r.pending) || undefined,
  insurance: s(r.insurance), createdAt: String(r.created_at),
  dni: s(r.dni), civilStatus: s(r.civil_status), occupation: s(r.occupation), education: s(r.education), religion: s(r.religion),
  address: s(r.address), emergencyName: s(r.emergency_name), emergencyPhone: s(r.emergency_phone), emergencyRelation: s(r.emergency_relation),
  guardianName: s(r.guardian_name), guardianDni: s(r.guardian_dni), guardianRelation: s(r.guardian_relation),
  // Los datos clínicos sólo viajan a quien tiene acceso al expediente
  bloodType: clinical ? s(r.blood_type) : undefined,
  allergies: clinical ? j<string[]>(r.allergies, []) : [],
  conditions: clinical ? j<string[]>(r.conditions, []) : [],
  background: clinical ? j<Background>(r.background, {}) : undefined,
})

export const toAppointment = (r: Row): Appointment => ({
  id: String(r.id), patientId: String(r.patient_id), doctorId: String(r.doctor_id), start: String(r.start),
  minutes: Number(r.minutes), reason: String(r.reason), type: r.type as Appointment['type'],
  status: r.status as Appointment['status'], arrivedAt: s(r.arrived_at),
  source: (r.source as Appointment['source']) ?? 'staff', remindedAt: s(r.reminded_at),
  paid: r.paid == null ? undefined : Boolean(r.paid),
  reassignedFrom: s(r.reassigned_from), reassignedAt: s(r.reassigned_at),
})

export const toVitals = (r: Row): Vitals => ({
  id: String(r.id), patientId: String(r.patient_id), appointmentId: s(r.appointment_id), takenBy: String(r.taken_by),
  takenAt: String(r.taken_at), systolic: n(r.systolic), diastolic: n(r.diastolic), heartRate: n(r.heart_rate),
  temperature: n(r.temperature), spo2: n(r.spo2), weightKg: n(r.weight_kg), heightCm: n(r.height_cm),
  painScale: r.pain_scale == null ? undefined : Number(r.pain_scale), notes: s(r.notes),
  respRate: r.resp_rate == null ? undefined : Number(r.resp_rate), glucose: r.glucose == null ? undefined : Number(r.glucose),
  chiefComplaint: s(r.chief_complaint),
})

export const toConsultation = (r: Row): Consultation => ({
  id: String(r.id), patientId: String(r.patient_id), doctorId: String(r.doctor_id), appointmentId: s(r.appointment_id),
  date: String(r.date), reason: String(r.reason), symptoms: j(r.symptoms, []), symptomOnset: s(r.symptom_onset),
  history: String(r.history ?? ''), exam: String(r.exam ?? ''), observations: s(r.observations) || undefined,
  diagnoses: j(r.diagnoses, []), plan: String(r.plan ?? ''), orders: j(r.orders, []), indications: r.indications == null ? undefined : j<string[]>(r.indications, []),
  vitalsId: s(r.vitals_id), prescriptionId: s(r.prescription_id),
})

export const toPrescription = (r: Row): Prescription => ({
  // Receta para un paciente no registrado: sin expediente (patientId vacío) y con los datos escritos a mano
  id: String(r.id), folio: String(r.folio), patientId: String(r.patient_id ?? ''), doctorId: String(r.doctor_id),
  consultationId: String(r.consultation_id), hospitalizationId: s(r.hospitalization_id), issuedAt: String(r.issued_at), items: j(r.items, []),
  standalone: Boolean(r.standalone) || undefined, indications: r.indications == null ? undefined : j<string[]>(r.indications, []),
  guest: r.guest == null ? undefined : j<GuestPatient>(r.guest, { name: '' }), linkedAt: s(r.linked_at),
})

export const toCertificate = (r: Row): Certificate => ({
  id: String(r.id), number: String(r.number), patientId: String(r.patient_id), consultationId: s(r.consultation_id) || undefined, doctorId: String(r.doctor_id),
  kind: r.kind as Certificate['kind'], data: j<CertificateData>(r.data, {} as CertificateData), issuedAt: String(r.issued_at),
  voidedAt: s(r.voided_at), voidedBy: s(r.voided_by), voidReason: s(r.void_reason),
})

export const toClinicDrug = (r: Row): ClinicDrug => ({
  id: String(r.id), name: String(r.name), brand: s(r.brand), presentation: s(r.presentation), concentration: s(r.concentration), route: s(r.route),
  active: Boolean(r.active), createdBy: String(r.created_by), createdAt: String(r.created_at), updatedBy: s(r.updated_by), updatedAt: s(r.updated_at),
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
  title: s(r.title), takenAt: s(r.taken_at), hospitalizationId: s(r.hospitalization_id),
})

export const toBed = (r: Row): Bed => ({ id: String(r.id), room: String(r.room), label: String(r.label ?? ''), specialty: String(r.specialty), active: Boolean(r.active) })

export const toHospitalization = (r: Row): Hospitalization => ({
  id: String(r.id), kind: (r.kind as Hospitalization['kind']) ?? 'hospital', patientId: String(r.patient_id), bedId: s(r.bed_id), consultationId: s(r.consultation_id), admittedAt: String(r.admitted_at),
  admittedBy: String(r.admitted_by), reason: String(r.reason), diagnoses: j(r.diagnoses, []), companionName: s(r.companion_name),
  companionRelation: s(r.companion_relation), companionPhone: s(r.companion_phone), patientPhone: s(r.patient_phone),
  status: r.status as Hospitalization['status'], dischargedAt: s(r.discharged_at), dischargedBy: s(r.discharged_by), prescriptionId: s(r.prescription_id),
  observationAt: s(r.observation_at), convertedAt: s(r.converted_at), convertedBy: s(r.converted_by),
  authPending: r.auth_pending == null ? undefined : Boolean(r.auth_pending),
  outcome: (s(r.outcome) as Hospitalization['outcome']) ?? undefined, outcomeNote: s(r.outcome_note),
})

export const toInpatientNote = (r: Row): InpatientNote => ({
  id: String(r.id), hospitalizationId: String(r.hospitalization_id), kind: r.kind as InpatientNote['kind'], authorId: String(r.author_id), at: String(r.at),
  subjective: String(r.subjective ?? ''), objective: String(r.objective ?? ''), assessment: String(r.assessment ?? ''), plan: String(r.plan ?? ''), text: String(r.text ?? ''),
  discharge: r.kind === 'discharge' ? j(r.data, undefined) : undefined,
  orders: r.kind === 'admission' || r.kind === 'evolution' ? j<{ orders?: string[] }>(r.data, {}).orders ?? [] : undefined,
  checklist: r.kind === 'admission' || r.kind === 'evolution' ? j<{ checklist?: boolean }>(r.data, {}).checklist || undefined : undefined,
  indicationCount: r.kind === 'admission' || r.kind === 'evolution' ? j<{ indications?: number }>(r.data, {}).indications : undefined,
  // Formato 2 (Diagnóstico · Examen físico · Observaciones); las notas sin formato son SOAP
  ...(r.kind === 'evolution' && j<{ format?: string }>(r.data, {}).format === 'dx'
    ? { format: 'dx' as const, diagnoses: j<{ diagnoses?: InpatientNote['diagnoses'] }>(r.data, {}).diagnoses ?? [], exam: j<{ exam?: string }>(r.data, {}).exam ?? '',
      observations: j<{ observations?: string }>(r.data, {}).observations ?? '' }
    : {}),
  procedure: r.kind === 'procedure' ? j(r.data, undefined) : undefined,
})

export const toInpatientMed = (r: Row): InpatientMed => ({
  id: String(r.id), hospitalizationId: String(r.hospitalization_id), noteId: s(r.note_id), drug: String(r.drug), presentation: s(r.presentation), dose: String(r.dose),
  route: String(r.route), everyHours: r.every_hours == null ? undefined : Number(r.every_hours), prn: Boolean(r.prn), firstAt: String(r.first_at),
  instructions: s(r.instructions), orderedBy: String(r.ordered_by), orderedAt: String(r.ordered_at), stoppedAt: s(r.stopped_at), stoppedBy: s(r.stopped_by),
  stopReason: s(r.stop_reason), days: r.days == null ? undefined : Number(r.days), source: (s(r.source) as InpatientMed['source']) ?? undefined, sourceId: s(r.source_id),
  replacesId: s(r.replaces_id),
})

export const toOrderMark = (r: Row) => ({
  id: String(r.id), noteId: String(r.note_id), index: Number(r.order_index), action: r.action as 'check' | 'uncheck', reason: s(r.reason), by: String(r.by_id), at: String(r.at),
})

export const toAuthorization = (r: Row): Authorization => ({
  id: String(r.id), hospitalizationId: String(r.hospitalization_id), patientId: String(r.patient_id), template: r.template as Authorization['template'],
  data: j<AuthorizationData>(r.data, {} as AuthorizationData), status: r.status as Authorization['status'], createdBy: String(r.created_by), createdAt: String(r.created_at),
  fileId: s(r.file_id), fileMime: s(r.file_mime), statusAt: s(r.status_at), statusBy: s(r.status_by), statusNote: s(r.status_note),
  method: s(r.method) as Authorization['method'], signing: r.signing ? withoutImages(j<ConsentSigning>(r.signing, {} as ConsentSigning)) : undefined,
  pdfId: s(r.pdf_id), pdfSha256: s(r.pdf_sha256),
  revocation: r.revocation ? (({ signing, ...x }) => ({ ...x, signing: signing && withoutImages(signing) }))(j<ConsentRevocation>(r.revocation, {} as ConsentRevocation)) : undefined,
  fileHistory: r.file_history ? j<NonNullable<Authorization['fileHistory']>>(r.file_history, []) : undefined,
})

/** Las imágenes de las firmas se quedan en el servidor y en el PDF; al cliente sólo llega si existen. */
function withoutImages(x: ConsentSigning): ConsentSigning {
  return {
    ...x, signature: x.signature ? 'guardada' : undefined,
    witness: x.witness && { ...x.witness, signature: x.witness.signature ? 'guardada' : undefined },
    doctor: x.doctor && { ...x.doctor, signature: x.doctor.signature ? 'guardada' : undefined },
  }
}

export const toDose = (r: Row): Dose => ({
  id: String(r.id), medId: String(r.med_id), scheduledAt: s(r.scheduled_at), givenAt: String(r.given_at), givenBy: String(r.given_by),
  status: r.status as Dose['status'], note: s(r.note),
  correctedAt: s(r.corrected_at), correctedBy: s(r.corrected_by), correctionReason: s(r.correction_reason),
})

export const toProcedure = (r: Row): HospProcedure => ({
  id: String(r.id), hospitalizationId: String(r.hospitalization_id), kind: r.kind as HospProcedure['kind'], name: String(r.name), scheduledAt: s(r.scheduled_at),
  status: r.status as HospProcedure['status'], notes: s(r.notes), createdBy: String(r.created_by), createdAt: String(r.created_at),
  updatedBy: s(r.updated_by), updatedAt: s(r.updated_at),
})

export const toFollowup = (r: Row): Followup => ({
  id: String(r.id), patientId: String(r.patient_id), kind: r.kind as Followup['kind'], title: String(r.title), dueDate: String(r.due_date),
  everyDays: r.every_days == null ? undefined : Number(r.every_days), notes: s(r.notes), createdBy: String(r.created_by), createdAt: String(r.created_at),
  notifiedAt: s(r.notified_at), doneAt: s(r.done_at), active: Boolean(r.active),
  remindedWeek: s(r.reminded_week), remindedEve: s(r.reminded_eve), remindedDay: s(r.reminded_day),
})

/** Configuración que ve la clínica (encabezado de recetas, recibos y recordatorios). */
export const clinicSettings = (r: Row): ClinicSettings => ({
  name: String(r.name ?? DEFAULT_SETTINGS.name), address: String(r.address ?? ''), phone: String(r.phone ?? ''), email: String(r.email ?? ''),
  currency: String(r.currency ?? DEFAULT_SETTINGS.currency), rxValidityDays: Number(r.rx_validity_days ?? DEFAULT_SETTINGS.rxValidityDays),
  reminderTemplate: String(r.reminder_template || DEFAULT_SETTINGS.reminderTemplate),
  recordUsesDni: Boolean(r.record_uses_dni), logo: s(r.logo), dniMask: r.dni_mask == null ? DNI_MASK : String(r.dni_mask),
  obsAlertHours: r.obs_alert_hours == null ? 24 : Number(r.obs_alert_hours), obsOrderChecklist: Boolean(r.obs_order_checklist),
  kind: (r.kind as ClinicSettings['kind']) ?? 'clinic', observationEnabled: r.observation_enabled == null ? true : Boolean(r.observation_enabled),
  ownerId: s(r.owner_id), specialty: s(r.specialty), license: s(r.license), maxAssistants: r.max_assistants == null ? 2 : Number(r.max_assistants), setupDoneAt: s(r.setup_done_at),
})

export const toClinic = (r: Row): Clinic => ({
  ...clinicSettings(r), id: String(r.id), slug: String(r.slug), active: Boolean(r.active), createdAt: String(r.created_at),
  stats: r.staff_count == null ? undefined : {
    staff: Number(r.staff_count), patients: Number(r.patient_count), appointments30: Number(r.appt30), consultations30: Number(r.cons30),
    lastActivity: s(r.last_activity),
  },
})

export const toReferral = (r: Row): Referral => ({
  id: String(r.id), hospitalizationId: String(r.hospitalization_id), patientId: String(r.patient_id), number: String(r.number), data: j<ReferralData>(r.data, {} as ReferralData),
  destination: s(r.destination), issuedBy: String(r.issued_by), issuedAt: String(r.issued_at), voidedAt: s(r.voided_at), voidedBy: s(r.voided_by), voidReason: s(r.void_reason),
})

export const toEpicrisis = (r: Row): Epicrisis => ({
  id: String(r.id), hospitalizationId: String(r.hospitalization_id), patientId: String(r.patient_id), version: Number(r.version),
  status: r.status as Epicrisis['status'], data: j<EpicrisisData>(r.data, {} as EpicrisisData), createdBy: String(r.created_by), createdAt: String(r.created_at),
  updatedAt: s(r.updated_at), issuedBy: s(r.issued_by), issuedAt: s(r.issued_at), voidedBy: s(r.voided_by), voidedAt: s(r.voided_at), voidReason: s(r.void_reason),
  replacesId: s(r.replaces_id),
})
