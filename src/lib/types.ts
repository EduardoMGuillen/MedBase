export type Role = 'superadmin' | 'admin' | 'doctor' | 'nurse' | 'reception' | 'assistant'

/** Tipo de cuenta: clínica (varios médicos, hospitalización) o consultorio de un médico independiente. */
export type ClinicKind = 'clinic' | 'office'

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
  /** Rol activo: la vista con la que trabaja ahora (AD5). Sus permisos son los de este rol. */
  role: Role
  /** Todos sus roles (AD5). Una persona puede ser, por ejemplo, médico y administración. */
  roles?: Role[]
  specialty?: string
  email: string
  license?: string
  color: string
  active: boolean
  schedule?: Schedule
  serviceId?: string // servicio que se cobra por defecto en sus consultas
  twoFactor?: boolean
  /** Tipo de cuenta de su clínica: decide sus permisos y qué módulos ve. */
  clinicKind?: ClinicKind
  /** Preferencias del usuario: el último formato de nota que usó. */
  prefs?: { noteFormat?: 'soap' | 'dx'; tourDoneAt?: string; rxValidityDays?: number; favDrugs?: string[]; favExams?: string[] }
  /** El médico tiene su firma guardada (la imagen no viaja con la lista del personal). */
  hasSignature?: boolean
  /** MC6: tiene sello guardado y PIN para confirmar firmas; nombre como aparece en sus documentos. */
  hasStamp?: boolean
  hasPin?: boolean
  docName?: string
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
  /** Curva térmica: banda normal. Desde `tempHigh` es fiebre y por debajo de `tempLow`, hipotermia (36.0 y 38.0 por defecto). */
  tempLow?: number
  tempHigh?: number
  /** Clínica o consultorio de un médico independiente. */
  kind?: ClinicKind
  /** Consultorio: usa observación (aplicar medicamentos, hidratar). */
  observationEnabled?: boolean
  /** Consultorio: el médico titular y lo que va en el encabezado de sus documentos. */
  ownerId?: string
  specialty?: string
  license?: string
  maxAssistants?: number
  /** Consultorio: cuándo terminó (o saltó) el asistente de primer ingreso. */
  setupDoneAt?: string
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
  /** Número de la factura del talonario de la clínica (el recibo es control interno). */
  invoiceNo?: string
  discountReason?: string
  voidReason?: string
  voidedAt?: string
  voidedBy?: string
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
  /** Toma de la hoja de signos vitales de una estancia (hospitalización u observación). */
  hospitalizationId?: string
  /** Cuándo se anotó (la toma pudo ser antes: `takenAt`). */
  recordedAt?: string
  /** Anulada con motivo: se ve tachada, no se borra. */
  voidedAt?: string
  voidedBy?: string
  voidReason?: string
  /** En la hoja de la estancia: 'preclinic' es la preclínica de la consulta que lo ingresó (primera toma). */
  source?: 'preclinic' | 'stay'
}

/** Diagnóstico: CIE-11 de la OMS (system 'icd11', con su URI) o escrito sin código ("S/C"). Sin system: CIE-10, de antes. */
export interface Diagnosis {
  code: string
  label: string
  system?: 'icd11'
  uri?: string
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
  /** Persona que no está en la biblioteca: sus datos escritos a mano (patientId vacío hasta que se vincule). */
  guest?: GuestPatient
  linkedAt?: string
  /** Días de vigencia con que se emitió (los elige el médico; 30 por defecto). */
  validityDays?: number
  /** Versión de la firma y del sello con que se emitió (MC6). */
  signatureId?: string
  stampId?: string
}

/** Datos de una persona no registrada, tal como se escribieron en su receta. */
export interface GuestPatient {
  name: string
  birthDate?: string
  age?: string // si no se sabe la fecha de nacimiento, p. ej. "34 años"
  sex?: 'F' | 'M'
  dni?: string
  phone?: string
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
  signatureId?: string
  stampId?: string
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
  clinic: { name: string; address: string; phone: string; logo?: string; office?: boolean }
}

/** Medicamento agregado al vademécum por la clínica (no está en el catálogo base). */
export interface ClinicDrug {
  id: string
  name: string // nombre genérico
  brand?: string // nombre comercial
  presentation?: string
  concentration?: string
  route?: string
  /** AD4: dosis e indicaciones de uso habituales (opcionales). */
  usualDose?: string
  usualUse?: string
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
  /** En la lista de hospitalizados: la autorización de hospitalización sigue pendiente de firma. */
  authPending?: boolean
  /** Hoja de signos vitales: cada cuántas horas se toman (lo cambia el médico). Vacío: lo que diga la orden, o 8. */
  vitalsEveryHours?: number
  /** Cómo terminó: 'referred' si se refirió a otro centro (con el destino en outcomeNote). */
  outcome?: 'referred' | 'discharged'
  outcomeNote?: string
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
  /** Procedimiento mayor: requiere autorización quirúrgica (MC3). Las notas de antes no lo tienen. */
  major?: boolean
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
  /** 'dx': Diagnóstico · Examen físico · Observaciones. Sin dato: SOAP. */
  format?: 'soap' | 'dx'
  diagnoses?: Diagnosis[]
  exam?: string
  observations?: string
  procedure?: ProcedureData
}

/** Medicamento dentro de un set de órdenes, con la estructura de la nota (sirve para la hoja y para la receta). */
export interface SetMed {
  drug: string
  presentation?: string
  dose: string
  route: string
  everyHours?: number
  prn: boolean
  days?: number
  instructions?: string
}

/** Una orden de un set: texto (indicación) o medicamento estructurado. */
export type OrderSetItem = { text: string; med?: undefined } | { med: SetMed; text?: undefined }

/** Set de órdenes de un médico ("Post-op colecistectomía no complicada"). Personal; puede compartirse con la clínica. */
export interface OrderSet {
  id: string
  ownerId: string
  name: string
  items: OrderSetItem[]
  shared: boolean
  createdAt: string
  updatedAt?: string
  /** Cuántas veces lo aplicó quien consulta la lista, y la última vez. */
  uses: number
  lastUsedAt?: string
}

/** Autorización (consentimiento informado) de la estancia. */
export interface Authorization {
  id: string
  hospitalizationId: string
  patientId: string
  /** 'hospital' (una por estancia) y 'surgical'. 'general' y 'procedure' son de antes de la v22 y se conservan. */
  template: 'hospital' | 'surgical' | 'general' | 'procedure'
  data: AuthorizationData
  status: 'pending' | 'signed' | 'refused' | 'revoked' | 'not_applicable'
  createdBy: string
  createdAt: string
  fileId?: string // foto o PDF de la hoja firmada
  fileMime?: string
  statusAt?: string
  statusBy?: string
  statusNote?: string
  /** Cómo se firmó: en pantalla ('virtual') o en papel con el escaneo subido ('paper'). */
  method?: 'virtual' | 'paper'
  /** Firma en pantalla de la autorización o del rechazo. Mientras falta el médico, la autorización sigue pendiente. */
  signing?: ConsentSigning
  /** PDF final generado al firmar en pantalla, con su huella SHA-256. */
  pdfId?: string
  pdfSha256?: string
  /** Revocación (en pantalla o en papel). */
  revocation?: ConsentRevocation
  /** Escaneos reemplazados: no se borran. */
  fileHistory?: { fileId: string; replacedAt: string; replacedBy: string; reason: string }[]
}

/** Quien firma por el paciente, el testigo o el representante legal. */
export interface ConsentPerson { name: string; dni?: string; relation?: string }

/**
 * Lo que queda de una firma en pantalla. Las imágenes de las firmas sólo están en el servidor (y en el PDF);
 * al cliente llega si cada una existe.
 */
export interface ConsentSigning {
  action: 'accept' | 'refuse' | 'revoke'
  signer: 'patient' | 'representative'
  representative?: ConsentPerson
  /** El paciente no puede firmar (no sabe escribir o está impedido): firma un testigo y queda el motivo. */
  unableReason?: string
  witness?: ConsentPerson & { signature?: string }
  /** Firma del paciente o del representante (PNG en data URL). */
  signature?: string
  signedAt: string
  managedBy: string
  device: string
  doctor?: { id: string; name: string; license?: string; signature?: string; at: string }
}

export interface ConsentRevocation {
  method: 'virtual' | 'paper'
  at: string
  by: string
  note?: string
  fileId?: string
  signing?: ConsentSigning
  pdfId?: string
  pdfSha256?: string
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
  /** Hospitalización: quien acompaña al paciente. */
  companion?: { name: string; phone?: string; relation?: string }
  /** Quirúrgica: testigo (si se conoce al generarla; si no, se escribe a mano). */
  witness?: { name: string; dni?: string }
  /** Hospitalización: fecha y hora del ingreso y diagnóstico de ingreso. */
  admission?: { at: string; diagnosis?: string }
  /** Quirúrgica con el texto genérico (ronda 3): sólo procedimiento y diagnóstico. Las anteriores no lo tienen. */
  generic?: boolean
  // Lo que se imprime, congelado al crearla
  patient: { name: string; dni?: string; age: string; sex: 'F' | 'M'; record: string; minor: boolean }
  doctor: { name: string; license?: string }
  clinic: { name: string; address: string; phone: string; logo?: string; office?: boolean }
}

/** Referencia a otro centro (consultorio): lo que se imprime, como se emitió. */
export interface ReferralData {
  patient: { name: string; dni?: string; age: string; sex?: 'F' | 'M'; record: string }
  doctor: { name: string; license?: string; specialty?: string }
  place: { name: string; address: string; phone: string; logo?: string; office?: boolean }
  admittedAt: string
  reason: string
  history: string
  exam: string
  diagnosis: string
  indications: string
  medications: string
  evolution: string
  labs: string
  condition: string
  destination: string
}

export interface Referral {
  id: string
  hospitalizationId: string
  patientId: string
  number: string
  data: ReferralData
  destination?: string
  issuedBy: string
  issuedAt: string
  voidedAt?: string
  voidedBy?: string
  voidReason?: string
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
  /** Registro tardío o corrección: quién, cuándo y por qué (el registro anterior queda guardado). */
  correctedAt?: string
  correctedBy?: string
  correctionReason?: string
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

/**
 * Epicrisis (P1): resumen de egreso, documento aparte del expediente. Se arma sola con los datos de la estancia; el
 * médico la revisa, corrige el texto y la emite. Emitida no se edita: se anula con motivo y se emite otra versión.
 */
export interface EpicrisisData {
  clinic: { name: string; address: string; phone: string; logo?: string }
  patient: { name: string; dni?: string; age: string; sex?: 'F' | 'M'; record: string }
  admittedAt: string
  dischargedAt: string
  stayDays: number
  room?: string
  attending: string
  /** Si vino de observación: cuándo entró a observación. */
  observationAt?: string
  admissionDx: { code: string; label: string; system?: 'icd11' }[]
  /** Historia de la enfermedad actual: de la consulta que lo ingresó o de la nota de ingreso. */
  hea: string
  /** Medicamentos administrados, agrupados por orden (no dosis por dosis). */
  meds: { drug: string; dose: string; route: string; frequency: string; start: string; end?: string; untilDischarge?: boolean }[]
  procedures: { name: string; at: string }[]
  evolution: string
  dischargeDx: { code: string; label: string; system?: 'icd11' }[]
  /** Laboratorios de la estancia; el médico elige cuáles incluir (ninguno por defecto). */
  labs: { id: string; title: string; at: string }[]
  labIds: string[]
  condition?: string
  /** Receta de salida, una línea por medicamento. */
  dischargeRx: string[]
  instructions: string
  followUp?: string
  /** Secciones "agregadas" que el médico quitó. */
  hidden: ('procedures' | 'dischargeDx' | 'labs' | 'condition')[]
  /** Quien la emite: nombre, colegiación y su firma guardada, si tiene. */
  doctor?: { name: string; license?: string; signature?: string; stamp?: string }
}

export interface Epicrisis {
  id: string
  hospitalizationId: string
  patientId: string
  version: number
  status: 'draft' | 'issued' | 'voided'
  data: EpicrisisData
  createdBy: string
  createdAt: string
  updatedAt?: string
  issuedBy?: string
  issuedAt?: string
  voidedBy?: string
  voidedAt?: string
  voidReason?: string
  replacesId?: string
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
  referrals: Referral[]
  /** Epicrisis de la estancia (todas sus versiones). */
  epicrises: Epicrisis[]
  /** Hoja de signos vitales: la preclínica de la consulta de ingreso y las tomas de la estancia (también las anuladas). */
  vitals: Vitals[]
  /** Órdenes de la consulta externa que ingresó al paciente (p. ej. "Signos vitales cada 4 horas"). */
  consultOrders?: string[]
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
