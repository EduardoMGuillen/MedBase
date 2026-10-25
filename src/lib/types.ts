export type Role = 'superadmin' | 'admin' | 'doctor' | 'nurse' | 'reception'

/** Roles que pertenecen a una clínica (el superadministrador no tiene clínica). */
export type ClinicRole = Exclude<Role, 'superadmin'>

/** Horario de atención de un médico. `days` usa 0 = domingo … 6 = sábado. */
export interface Schedule {
  days: number[]
  start: string // HH:MM
  end: string // HH:MM
  slot: number // minutos por cita
}

export interface Staff {
  id: string
  clinicId?: string // vacío sólo para la administración de la plataforma
  name: string
  role: Role
  specialty?: string
  email: string
  license?: string
  color: string
  active: boolean
  schedule?: Schedule
  serviceId?: string // servicio que se cobra por defecto en sus consultas
  twoFactor?: boolean
}

/** Una clínica dentro de la plataforma. */
export interface Clinic extends ClinicSettings {
  id: string
  slug: string // dirección de la reserva en línea: /reservar/<slug>
  active: boolean
  createdAt: string
  stats?: { staff: number; patients: number; appointments30: number; consultations30: number; lastActivity?: string }
}

export interface ClinicSettings {
  name: string
  address: string
  phone: string
  email: string
  currency: string // símbolo, p. ej. "L"
  rxValidityDays: number
  reminderTemplate: string
  /** Si es verdadero, el número de identidad hace de número de expediente en recetas y documentos. */
  recordUsesDni: boolean
  logo?: string // imagen en data URL, para recetas y constancias
}

export interface Service {
  id: string
  name: string
  price: number
  active: boolean
}

export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'insurance'

export interface Payment {
  id: string
  receiptNo: string
  appointmentId?: string
  patientId: string
  items: { serviceId?: string; name: string; price: number; qty: number }[]
  discount: number
  total: number
  method: PaymentMethod
  reference?: string
  receivedBy: string
  paidAt: string
  voided?: boolean
}

export interface Attachment {
  id: string
  patientId: string
  name: string
  mime: string
  size: number
  category: 'lab' | 'imaging' | 'document' | 'other'
  uploadedBy: string
  uploadedAt: string
  title?: string // qué examen es, p. ej. "Hemograma"
  takenAt?: string // fecha y hora del examen
  hospitalizationId?: string
}

/** Antecedentes en el orden de la historia clínica. Todos son texto libre opcional. */
export interface Background {
  pathological?: string // personales patológicos (además de `conditions`)
  surgical?: string // quirúrgicos
  traumatic?: string // traumáticos
  hospitalizations?: string // hospitalarios
  transfusions?: string // transfusionales
  medications?: string // medicamentos de uso actual
  family?: string // heredofamiliares
  smoking?: string // tabaquismo
  alcohol?: string // alcoholismo
  drugs?: string // otras sustancias
  lifestyle?: string // actividad física y alimentación
  immunizations?: string // inmunizaciones
  // Gineco-obstétricos
  menarche?: string
  lmp?: string // fecha de última menstruación (FUM)
  gpac?: string // gestas, partos, abortos, cesáreas
  contraception?: string
  gynecoNotes?: string
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
  // Ficha de identificación
  dni?: string // número de identidad
  civilStatus?: string
  occupation?: string
  education?: string // escolaridad
  religion?: string
  address?: string // procedencia y dirección
  emergencyName?: string
  emergencyPhone?: string
  emergencyRelation?: string
  insurance?: string
  // Menor sin identidad: la receta y las constancias llevan los datos del responsable
  guardianName?: string
  guardianDni?: string
  guardianRelation?: string
  // Datos clínicos (sólo para personal con acceso al expediente)
  bloodType?: string
  allergies: string[]
  conditions: string[] // enfermedades crónicas
  background?: Background
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
  source?: 'staff' | 'online' | 'walkin'
  remindedAt?: string
  paid?: boolean
}

export interface Vitals {
  id: string
  patientId: string
  appointmentId?: string
  takenBy: string
  takenAt: string
  systolic?: number
  diastolic?: number
  heartRate?: number
  temperature?: number
  spo2?: number
  weightKg?: number
  heightCm?: number
  respRate?: number // frecuencia respiratoria
  glucose?: number // glucometría capilar (mg/dL)
  painScale?: number
  chiefComplaint?: string // motivo de consulta registrado en el triaje
  notes?: string
}

export interface PrescriptionItem {
  drug: string
  presentation: string
  dose: string
  frequency: string
  duration: string
  route?: string // vía de administración
  instructions?: string
}

export interface Prescription {
  id: string
  folio: string
  patientId: string
  doctorId: string
  consultationId: string
  hospitalizationId?: string // receta de egreso
  issuedAt: string
  items: PrescriptionItem[]
}

export interface Consultation {
  id: string
  patientId: string
  doctorId: string
  appointmentId?: string
  date: string
  reason: string // motivo de consulta
  symptoms: string[] // (sin uso desde la v0.5; se conserva por compatibilidad)
  symptomOnset?: string
  history: string // historia de la enfermedad actual (HEA)
  exam: string // examen físico
  observations?: string
  diagnoses: { code: string; label: string }[] // impresión diagnóstica
  orders: string[] // manejo: órdenes médicas numeradas
  plan: string // manejo en texto (consultas anteriores a la v0.5)
  vitalsId?: string
  prescriptionId?: string
}

export interface AuditEntry {
  id: string
  at: string
  userId: string
  action: string
}

// ---------- Hospitalización ----------

export interface Bed {
  id: string
  room: string // número de cuarto
  label: string // cama dentro del cuarto, p. ej. "A"
  specialty: string // las camas se asignan por especialidad, no por médico
  active: boolean
}

export interface Hospitalization {
  id: string
  patientId: string
  bedId: string
  consultationId?: string // consulta externa de la que salió el ingreso
  admittedAt: string
  admittedBy: string
  reason: string
  diagnoses: { code: string; label: string }[]
  companionName?: string
  companionRelation?: string
  companionPhone?: string
  patientPhone?: string
  status: 'active' | 'discharged'
  dischargedAt?: string
  dischargedBy?: string
  prescriptionId?: string // receta de egreso
}

export interface DischargeData {
  diagnoses: { code: string; label: string }[]
  summary: string // por qué entró y qué se le hizo
  condition: string // condición al egreso
  instructions: string
  followUp?: string
}

/** Nota médica (ingreso y evolución en formato SOAP), de egreso o de enfermería. */
export interface InpatientNote {
  id: string
  hospitalizationId: string
  kind: 'admission' | 'evolution' | 'discharge' | 'nursing'
  authorId: string
  at: string
  subjective: string
  objective: string
  assessment: string
  plan: string
  text: string // notas de enfermería
  discharge?: DischargeData
  /** Órdenes y manejo vigentes al firmar la nota: medicamentos y el resto. */
  orders?: string[]
}

/** Medicamento indicado en una nota médica. Su horario se calcula a partir de la primera dosis. */
export interface InpatientMed {
  id: string
  hospitalizationId: string
  noteId?: string
  drug: string
  presentation?: string
  dose: string
  route: string
  everyHours?: number // vacío: dosis única (o PRN sin intervalo mínimo)
  prn: boolean // según necesidad: sin horario fijo
  firstAt: string
  instructions?: string
  orderedBy: string
  orderedAt: string
  stoppedAt?: string // a partir de aquí las dosis quedan omitidas
  stoppedBy?: string
}

export interface Dose {
  id: string
  medId: string
  scheduledAt?: string // vacío en medicamentos PRN
  givenAt: string
  givenBy: string
  status: 'given' | 'skipped'
  note?: string
}

export interface HospProcedure {
  id: string
  hospitalizationId: string
  kind: 'procedure' | 'authorization'
  name: string
  scheduledAt?: string
  status: 'pending' | 'authorized' | 'done' | 'denied'
  notes?: string
  createdBy: string
  createdAt: string
  updatedBy?: string
  updatedAt?: string
}

export interface InpatientFile {
  hospitalization: Hospitalization
  notes: InpatientNote[]
  meds: InpatientMed[]
  doses: Dose[]
  procedures: HospProcedure[]
  labs: Attachment[]
}

// ---------- Crónicos y seguimientos ----------

export interface Followup {
  id: string
  patientId: string
  kind: 'chronic' | 'reminder' | 'procedure'
  title: string // padecimiento crónico, motivo del recordatorio o procedimiento
  dueDate: string // YYYY-MM-DD: próximo control, recordatorio o procedimiento
  everyDays?: number // crónicos: cada cuánto se repite el control
  notes?: string
  createdBy: string
  createdAt: string
  notifiedAt?: string
  doneAt?: string
  remindedWeek?: string
  remindedEve?: string
  remindedDay?: string
  active: boolean
}
