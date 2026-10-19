export type Role = 'admin' | 'doctor' | 'nurse' | 'reception'

export interface Staff {
  id: string
  name: string
  role: Role
  specialty?: string
  email: string
  license?: string
  color: string
  active: boolean
}

export interface Patient {
  id: string
  record: string // número de expediente
  firstName: string
  lastName: string
  birthDate: string // ISO date
  sex: 'F' | 'M'
  phone: string
  email?: string
  bloodType?: string
  allergies: string[]
  conditions: string[] // problemas crónicos
  insurance?: string
  createdAt: string
}

/** Flujo de la cita dentro de la clínica (de la reserva al alta). */
export type ApptStatus =
  | 'scheduled' // programada
  | 'confirmed' // confirmada por el paciente
  | 'arrived' // en sala de espera (check-in)
  | 'triaged' // signos vitales tomados, lista para consulta
  | 'in_consult' // en consulta
  | 'done' // atendida
  | 'no_show'
  | 'cancelled'

export interface Appointment {
  id: string
  patientId: string
  doctorId: string
  start: string // ISO datetime
  minutes: number
  reason: string
  type: 'first' | 'followup' | 'urgent'
  status: ApptStatus
  arrivedAt?: string
}

export interface Vitals {
  id: string
  patientId: string
  appointmentId?: string
  takenBy: string
  takenAt: string
  systolic: number
  diastolic: number
  heartRate: number
  temperature: number
  spo2: number
  weightKg: number
  heightCm: number
  painScale?: number
  notes?: string
}

export interface PrescriptionItem {
  drug: string
  presentation: string
  dose: string
  frequency: string
  duration: string
  instructions?: string
}

export interface Prescription {
  id: string
  folio: string
  patientId: string
  doctorId: string
  consultationId: string
  issuedAt: string
  items: PrescriptionItem[]
}

export interface Consultation {
  id: string
  patientId: string
  doctorId: string
  appointmentId?: string
  date: string
  reason: string
  symptoms: string[]
  symptomOnset?: string
  history: string // padecimiento actual (S)
  exam: string // exploración física (O)
  diagnoses: { code: string; label: string }[] // (A)
  plan: string // (P)
  vitalsId?: string
  prescriptionId?: string
}

export interface AuditEntry {
  id: string
  at: string
  userId: string
  action: string
}
