export type Role = 'superadmin' | 'admin' | 'doctor' | 'nurse' | 'reception'

/** Roles que pertenecen a una clínica (el superadministrador no tiene clínica). */
export type ClinicRole = Exclude<Role, 'superadmin'>

export interface TimeRange { start: string; end: string } // HH:MM

/**
 * Horario de atención de un médico. `week` (día → franjas, 0 = domingo … 6 = sábado) es el formato
 * actual; `days/start/end` se conservan para lo guardado antes (ver `src/lib/schedule.ts`).
 */
export interface Schedule {
  days: number[]
  start: string // HH:MM
  end: string // HH:MM
  slot: number // cada cuántos minutos se ofrece una hora en la agenda
  week?: Record<string, TimeRange[]>
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
  /** Formato del documento de identidad: cada 0 es un dígito. Vacío: texto libre. */
  dniMask?: string
  logo?: string // imagen en data URL, para recetas y constancias
  /** Horas en observación tras las que el paciente se resalta en la lista. */
  obsAlertHours?: number
  /** Si es verdadero, las órdenes de las notas de observación también se revisan como checklist. */
  obsOrderChecklist?: boolean
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
  /** Agendado por teléfono con nombre y teléfono; completa su registro al llegar. No aparece en la biblioteca. */
  pending?: boolean
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
  /** Médico al que estaba asignada antes de que otro la tomara desde 'Toda la clínica'. */
  reassignedFrom?: string
  reassignedAt?: string
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
  quantity?: string // cantidad total a dispensar (opcional), p. ej. "20 tabletas"
  /** Ambulatorio: se aplica en la clínica (va a la hoja de medicamentos, no a la receta). */
  applyInClinic?: boolean
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
  /** Receta emitida desde "Recetas", sin consulta. */
  standalone?: boolean
  indications?: string[]
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
  orders: string[] // manejo: órdenes médicas numeradas (indicaciones y luego medicamentos)
  /** Indicaciones no farmacológicas (desde las correcciones de Emil); los medicamentos van en la receta. */
  indications?: string[]
  plan: string // manejo en texto (consultas anteriores a la v0.5)
  vitalsId?: string
  prescriptionId?: string
}

/** Datos de la biblioteca de pacientes que se calculan en el servidor (filtros). */
export interface PatientIndex {
  patientId: string
  lastConsultAt?: string
  lastDoctorId?: string
  nextApptAt?: string
  nextDoctorId?: string
  followups: { kind: Followup['kind']; title: string }[]
  status: 'active' | 'hospital' | 'observation'
}

/**
 * Constancia médica emitida. `data` guarda lo que se imprimió (paciente, médico, clínica, fechas, texto)
 * tal como estaba al emitirla: así la reimpresión es idéntica aunque después cambien los datos.
 */
export interface Certificate {
  id: string
  number: string // CM-2026-0001, correlativo por clínica
  patientId: string
  consultationId?: string
  doctorId: string
  kind: 'attention' | 'rest' | 'free' | 'companion'
  data: CertificateData
  issuedAt: string
  voidedAt?: string
  voidedBy?: string
  voidReason?: string
}

export interface CertificateData {
  to: string // dirigida a
  visitDate: string // YYYY-MM-DD de la atención
  fromTime?: string // HH:MM
  toTime?: string // HH:MM
  restDays?: number
  restType?: 'relativo' | 'absoluto'
  restFrom?: string // YYYY-MM-DD
  restTo?: string // YYYY-MM-DD
  includeDx?: boolean
  diagnoses?: string[]
  companion?: { name: string; dni?: string; relation?: string }
  text?: string // constancia libre
  notes?: string
  // Lo que se imprime, congelado al emitir
  patient: { name: string; dni?: string; age: string; sex: 'F' | 'M'; record: string; guardian?: string }
  doctor: { name: string; specialty?: string; license?: string }
  clinic: { name: string; address: string; phone: string; logo?: string }
}

/** Medicamento agregado al vademécum por la clínica (no está en el catálogo base). */
export interface ClinicDrug {
  id: string
  name: string // nombre genérico
  brand?: string // nombre comercial
  presentation?: string
  concentration?: string
  route?: string
  active: boolean
  createdBy: string
  createdAt: string
  updatedBy?: string
  updatedAt?: string
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
  /** 'observation': observación corta, sin cama. Al pasar a hospitalización conserva su expediente. */
  kind: 'hospital' | 'observation'
  patientId: string
  bedId?: string
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
  observationAt?: string // si vino de observación: cuándo entró a observación
  convertedAt?: string // cuándo pasó de observación a hospitalización
  convertedBy?: string
}

export interface DischargeData {
  diagnoses: { code: string; label: string }[]
  summary: string // por qué entró y qué se le hizo
  condition: string // condición al egreso
  instructions: string
  followUp?: string
}

/** Nota de procedimiento: un solo texto, con la hora del procedimiento aparte de la hora en que se escribió. */
export interface ProcedureData {
  name: string
  performedAt: string // fecha y hora del procedimiento (la nota se escribe después: `at`)
  authorizationId?: string
  urgent?: boolean // urgencia, sin autorización previa
  justification?: string
}

/** Nota médica (ingreso y evolución en formato SOAP), de egreso, de procedimiento o de enfermería. */
export interface InpatientNote {
  id: string
  hospitalizationId: string
  kind: 'admission' | 'evolution' | 'discharge' | 'nursing' | 'procedure'
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
  /** Las órdenes de esta nota se revisan una por una (enfermería las marca). */
  checklist?: boolean
  /** Cuántas de las órdenes son indicaciones (van primero); el resto son medicamentos. Notas anteriores: sin dato. */
  indicationCount?: number
  procedure?: ProcedureData
}

/** Autorización (consentimiento informado) de la estancia. */
export interface Authorization {
  id: string
  hospitalizationId: string
  patientId: string
  template: 'general' | 'procedure'
  data: AuthorizationData
  status: 'pending' | 'signed' | 'refused' | 'revoked'
  createdBy: string
  createdAt: string
  fileId?: string // foto o PDF de la hoja firmada
  fileMime?: string
  statusAt?: string
  statusBy?: string
  statusNote?: string
}

export interface AuthorizationData {
  procedure?: string
  diagnosis?: string
  description?: string
  benefits?: string
  risks?: string
  alternatives?: string
  notDoing?: string
  anesthesia?: string
  representative?: { name: string; dni?: string; relation?: string }
  // Lo que se imprime, congelado al crearla
  patient: { name: string; dni?: string; age: string; sex: 'F' | 'M'; record: string; minor: boolean }
  doctor: { name: string; license?: string }
  clinic: { name: string; address: string; phone: string; logo?: string }
}

/** Marca de enfermería sobre una orden médica. El estado de la orden es su última marca. */
export interface OrderMark {
  id: string
  noteId: string
  index: number
  action: 'check' | 'uncheck'
  reason?: string
  by: string
  at: string
}

/** Nota con órdenes nuevas sin revisar, para las alertas de enfermería. */
export interface PendingOrders {
  hospitalizationId: string
  patientId: string
  bedId?: string
  noteId: string
  authorId: string
  at: string
  pending: number
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
  stopReason?: string
  /** Días indicados; vacío: hasta nueva orden. */
  days?: number
  /** De dónde viene la orden: la nota de consulta externa que ingresó al paciente o una nota de la estancia. */
  source?: 'consultation' | 'note'
  sourceId?: string
  /** La orden que esta reemplaza ("Cambiar" en la nota). */
  replacesId?: string
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
  marks: OrderMark[]
  authorizations: Authorization[]
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
