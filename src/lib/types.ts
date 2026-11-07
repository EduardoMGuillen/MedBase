import type { CriticalGroup } from './clinicalConfig.js'
/** DP1 (ronda 11): «lab» (Laboratorio) e «imaging» (Imágenes), solo en clínicas, con cargo (Staff.position). */
export type Role = 'superadmin' | 'admin' | 'doctor' | 'nurse' | 'reception' | 'assistant' | 'lab' | 'imaging'

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
  prefs?: { noteFormat?: 'soap' | 'dx'; tourDoneAt?: string; rxValidityDays?: number; favDrugs?: string[]; favExams?: string[]; agendaView?: 'day' | 'week' | 'month'; arrivalsView?: 'hour' | 'doctor'; queueView?: 'hour' | 'doctor'
    /** RG1: estado de cada recorrido guiado (por rol activo o tipo de cuenta). */
    tours?: Record<string, { state: 'done' | 'skipped' | 'paused'; step: number; at: string }> }
  /** El médico tiene su firma guardada (la imagen no viaja con la lista del personal). */
  hasSignature?: boolean
  /** MC6: tiene sello guardado y PIN para confirmar firmas; nombre como aparece en sus documentos. */
  hasStamp?: boolean
  hasPin?: boolean
  docName?: string
  /** DP1 (ronda 11): cargo dentro del rol (Microbiólogo, Técnico de laboratorio, Radiólogo, Técnico en imágenes). */
  position?: string
}

/** Una clínica dentro de la plataforma. */
export interface Clinic extends ClinicSettings {
  id: string
  slug: string // dirección de la reserva en línea: /reservar/<slug>
  active: boolean
  createdAt: string
  stats?: { staff: number; patients: number; appointments30: number; consultations30: number; lastActivity?: string }
}

/** AD1: un teléfono de la clínica, con su etiqueta libre y si es para llamadas, WhatsApp o ambos. */
export interface ClinicContact {
  id: string
  number: string
  label: string
  type: 'call' | 'whatsapp' | 'both'
  /** El principal sale en recetas, constancias, recibos y membretes (es `phone`). */
  primary?: boolean
  /** El número de WhatsApp de la clínica: el de la variable {telefono} del recordatorio. */
  whatsapp?: boolean
}

export interface ClinicSettings {
  name: string
  address: string
  /** Teléfono principal (el contacto marcado como principal). */
  phone: string
  /** AD1: todos los contactos de la clínica. */
  contacts?: ClinicContact[]
  /** AD1: los membretes muestran también el número de WhatsApp. */
  docsWhatsapp?: boolean
  /** EX1: áreas de servicio propias. Sin ellas, los exámenes los atiende enfermería. */
  hasLab?: boolean
  hasImaging?: boolean
  /** EX1: umbrales críticos de laboratorio (analito → bajo/alto). */
  criticalLimits?: Record<string, { low?: number; high?: number }>
  /** AD1 (ronda 5): umbrales críticos por grupo (mandan sobre `criticalLimits`, que se conserva sin editarse). */
  criticalGroups?: CriticalGroup[]
  /** AD9: formas de pago que acepta la clínica (en caja sólo aparecen éstas). */
  paymentMethods?: PaymentMethod[]
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
  /** AD9: creado desde la caja ("+ Servicio nuevo"), con su autor y fecha. */
  createdBy?: string
  createdAt?: string
}

/** AD9: depósito y "otro" se agregan; cada clínica elige cuáles acepta. */
export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'insurance' | 'deposit' | 'other'

/** AD9: abono posterior a un cobro con saldo pendiente. */
export interface Installment {
  id: string
  amount: number
  method: PaymentMethod
  reference?: string
  bank?: string
  receivedBy: string
  paidAt: string
}

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
  /** AD9: banco de la transferencia o del depósito. */
  bank?: string
  /** AD9: lo que se pagó al cobrar; si es menos que el total, queda saldo. */
  amountPaid?: number
  installments?: Installment[]
  /** Total − lo pagado − los abonos. */
  balance?: number
}

export interface Attachment {
  id: string
  patientId: string
  name: string
  mime: string
  size: number
  /** PQ3 (ronda 14): 'anesthesia', la hoja de anestesia en papel (se sube desde la tarjeta de la nota postquirúrgica). */
  category: 'lab' | 'imaging' | 'document' | 'other' | 'anesthesia' | 'preanesthesia' | 'surgical_count'
  uploadedBy: string
  uploadedAt: string
  title?: string // qué examen es, p. ej. "Hemograma"
  takenAt?: string // fecha y hora del examen
  hospitalizationId?: string
  /** PQ3 (ronda 14): hoja de anestesia reemplazada: queda anulada, visible y sin borrarse. */
  voidedAt?: string
  voidReason?: string
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
  /** AN2 (ronda 12): toxicomanías (tabaquismo, alcoholismo y otras sustancias en un solo campo). Manda sobre los tres de arriba. */
  toxic?: string
  lifestyle?: string // actividad física y alimentación (ronda 12: ya no se pide ni se muestra; lo escrito se conserva)
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
  /** CX2 (ronda 8): por qué se canceló; `cancelledBy` es el id de quien la canceló o 'system' (estancia activa). */
  cancelReason?: string
  cancelledBy?: string
  cancelledAt?: string
}

/** GE4 (ronda 9): lo que su autor puede corregir durante el periodo de gracia. */
export interface Correctable {
  /** Sólo si se corrigió: la versión que se ve (2, 3…). */
  version?: number
  /** Hasta cuándo puede corregirlo su autor (hora del servidor). */
  graceUntil?: string
}

export interface Vitals extends Correctable {
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
  source?: 'preclinic' | 'stay' | 'note'
  /** MC8 (ronda 6): anotada en una nota de evolución (origen «Nota de evolución»). */
  sourceNoteId?: string
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
  /** ME10 (ronda 10): con «Aplicar en la clínica», la clínica no lo tiene: va a una receta (cantidad a comprar: `quantity`). */
  buyOutside?: boolean
  /** MC2 (ronda 6): PRN («si es necesario»): cuándo se da ("si dolor", "si fiebre"). */
  prnCondition?: string
  /** ME3 (ronda 9): primera dosis distinta (STAT) y luego `dose` con su frecuencia. */
  loadingDose?: string
  /** ME4 (ronda 9): vía «Nebulización» con varios medicamentos en una sola orden. */
  nebulization?: import('./medExtras').Nebulization
  /**
   * ME15 (ronda 15): leyenda corta en cursiva debajo del medicamento en la receta («Se aplica en la clínica.»). Se guarda con
   * la receta al emitirla (lo emitido no cambia aunque cambie el texto en la configuración).
   */
  legend?: string
  /**
   * ME16 (ronda 16): infusión continua indicada en la consulta con ingreso (frecuencia «Infusión»): velocidad, unidad y hora de
   * inicio (ISO). Llega a la hoja de la estancia como infusión (server/medOrders.ts).
   */
  infusionRate?: number
  infusionUnit?: InfusionUnit
  firstAt?: string
}

export interface Prescription {
  /** GE4 (ronda 9): primera vez que se imprimió, descargó o envió (entonces ya no se corrige). */
  printedAt?: string
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
  /** Anulada con motivo (no se borra). */
  voidedAt?: string
  voidedBy?: string
  voidReason?: string
  /** IM2 (ronda 13): la receta lleva la fila «Diagnóstico». Sin dato: receta de antes, que se imprimía con él. */
  includeDx?: boolean
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

export interface Consultation extends Correctable {
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
  followups: { kind: Followup['kind']; title: string; reminderType?: Followup['reminderType'] }[]
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
  /** Vacío en los que cargó el LNME (no los agregó una persona). */
  createdBy: string
  createdAt: string
  updatedBy?: string
  updatedAt?: string
  /** ME5 (ronda 9): 'lnme' = cargado del listado y sin tocar; 'clinic' = agregado o editado por la clínica. */
  origin?: 'lnme' | 'clinic'
  originLabel?: string
  lnme?: ClinicDrugLnme
}

/** ME5 (ronda 9): lo que trae del Listado Nacional de Medicamentos Esenciales (LNME Honduras 2023). */
export interface ClinicDrugLnme {
  no: number
  /** created: lo creó la carga; exact / synonym: ya lo tenía la clínica y sólo ganó la etiqueta. */
  match: 'created' | 'exact' | 'synonym'
  name: string
  group: string
  subgroup?: string
  form?: string
  /** La vía como la escribe el listado («IV, IM»). */
  routes?: string
  package?: string
  complementary: boolean
  restriction?: string
  note?: string
  certainty: 'confirmed' | 'unconfirmed' | 'none'
  presentationFull?: string
  alternatives: string[]
  aliases: string[]
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
  /** AD3: activa = en servicio (libre u ocupada según las estancias); inactiva = fuera de servicio, con su motivo. */
  active: boolean
  outOfServiceNote?: string
}

/** CX2 (ronda 8): estancia activa (observación u hospitalización sin egreso), sin datos clínicos: la ven todos los roles. */
export interface ActiveStay { id: string; patientId: string; kind: 'hospital' | 'observation'; since: string; room?: string }

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
  /** MC6 (ronda 6): frecuencia de signos vitales que indica el médico en sus notas, por tramos (lo pasado no se recalcula). */
  vitalsPlan?: VitalsSegment[]
  /** AD3: especialidad del ingreso (la del médico que ingresa, editable). La cama no tiene especialidad. */
  specialty?: string
  /** Cómo terminó: 'referred' si se refirió a otro centro (con el destino en outcomeNote). */
  outcome?: 'referred' | 'discharged'
  outcomeNote?: string
  /** HO2 (ronda 16): médico(s) tratante(s); el primero es el principal. Las estancias de antes: quien las ingresó. */
  attendingIds?: string[]
  /** IE1 (ronda 16): la orden de ingestas y excretas, por tramos (el último manda; 'off' es suspendida). */
  fluidsPlan?: FluidsSegment[]
  /** HO2 (ronda 16): en la lista de hospitalizados: ingreso directo sin nota de ingreso firmada (órdenes pendientes). */
  ordersPending?: boolean
}

export interface DischargeData {
  diagnoses: { code: string; label: string }[]
  summary: string // por qué entró y qué se le hizo
  condition: string // condición al egreso
  instructions: string
  followUp?: string
  /** MC5: historia de la enfermedad actual, precargada y corregida en la nota de egreso (va igual a la epicrisis). */
  hea?: string
  /** MC5: exámenes pendientes al alta (los de la estancia sin resultado y los que se piden al egresar). */
  pendingExams?: string[]
}

/** Nota de procedimiento: un solo texto, con la hora del procedimiento aparte de la hora en que se escribió. */
/** PQ1 (ronda 9): una persona del equipo quirúrgico: del personal (staffId) o escrita a mano. */
export interface TeamMember { staffId?: string; name: string }

/** PQ1 y PQ2 (ronda 9): lo propio de la nota postquirúrgica. Los diagnósticos postoperatorios van en `diagnoses` (bajan a la siguiente nota). */
export interface PostopData {
  preDiagnoses: Diagnosis[]
  startAt: string
  endAt: string
  anesthesia: string
  anesthesiaOther?: string
  procedureName: string
  description: string
  team: Partial<Record<import('./clinicalConfig').SurgicalRole, TeamMember>>
  authorizationId?: string
  urgent?: boolean
  justification?: string
}

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
export interface InpatientNote extends Correctable {
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
  /** 'dx': formato Estándar (diagnóstico, examen físico y observaciones). Sin dato: SOAP. 'postop': nota postquirúrgica (PQ1, ronda 9). */
  format?: 'soap' | 'dx' | 'postop'
  /** PQ1 (ronda 9): datos de la nota postquirúrgica (los diagnósticos postoperatorios van en `diagnoses`). */
  postop?: PostopData
  diagnoses?: Diagnosis[]
  /** Ronda 8: Estándar: evolución (cómo sigue desde la nota anterior, lo que refiere). Va entre diagnósticos y examen físico. */
  evolution?: string
  exam?: string
  observations?: string
  /** NO2 (ronda 16): nota de ingreso en formato estándar (el de la consulta externa): motivo de consulta e historia de la enfermedad actual. */
  chiefComplaint?: string
  history?: string
  procedure?: ProcedureData
  /**
   * MC7 (ronda 6): el cuadro completo al firmar: cada indicación y cada medicamento vigentes, con su etiqueta. Cada línea es
   * también una orden del checklist (misma posición en `orders`). Las notas de antes no lo tienen.
   */
  lines?: OrderLine[]
  /** MC6 (ronda 6): la frecuencia de signos vitales vigente al firmar, con su etiqueta. */
  vitals?: VitalsMode & { tag: OrderLineTag }
  /** MC8 (ronda 6): la toma de signos vitales anotada en esta nota (opcional). */
  vitalsId?: string
  /** IE1 (ronda 16): la orden «Cuantificar ingestas y excretas» de esta nota (nueva, modificada, continúa u omitida). */
  fluids?: { mode: FluidsMode | 'off'; tag: OrderLineTag }
  /** MC7: la nota firmada sobre la que se armó (para avisar si otra se firmó mientras se escribía). */
  basedOn?: string
}

/** MC6 (ronda 6): cada cuánto se toman los signos vitales: por turno, cada N horas o sin control programado. */
export type VitalsMode = { mode: 'shift'; hours?: undefined } | { mode: 'hours'; hours: number } | { mode: 'none'; hours?: undefined }
/** Un tramo del plan: desde cuándo rige esa frecuencia, quién la indicó y en qué nota. */
export type VitalsSegment = VitalsMode & { from: string; by?: string; noteId?: string }

/** MC7 (ronda 6): Continúa, Nueva, Modificada (la anterior, cerrada) u Omitida. */
export type OrderLineTag = 'continue' | 'new' | 'modified' | 'omitted'
/** Una indicación o un medicamento de la nota, con un identificador estable para seguirlo de nota en nota. */
export interface OrderLine { id: string; kind: 'ind' | 'med'; text: string; tag: OrderLineTag; medId?: string; replaces?: string }

// ---------- Exámenes (EX1) ----------

/** Laboratorio o Imagen y gabinete: los hace gente distinta, en lugares distintos, con órdenes distintas. */
export type ExamGroup = 'lab' | 'imaging'
/** Laboratorio: ordered → sample → result → reviewed. Imagen y gabinete: ordered → done → result → reviewed. */
export type ExamStatus = 'ordered' | 'sample' | 'done' | 'result' | 'reviewed' | 'cancelled'

/** Lo que el médico pide al ordenar un examen. */
export interface ExamInput {
  group: ExamGroup
  name: string
  /** Imagen: región y lado (radiografía de rodilla derecha). */
  region?: string
  side?: 'right' | 'left' | 'both'
  indication?: string
  priority: 'routine' | 'urgent'
  /** Dónde se realiza: en la clínica o externo. */
  place: 'clinic' | 'external'
  /** MC3 (ronda 6): no estaba en el catálogo de la clínica (escrito a mano, con su tipo elegido). */
  uncatalogued?: boolean
  /** CA5 (ronda 10): proyecciones (Rayos X) y contraste (Tomografía, Resonancia) elegidos al ordenar. */
  projections?: string[]
  contrast?: string
  /** CA5: la orden se arma con los detalles del estudio («Rayos X de tórax PA y lateral · …»). */
  detailed?: boolean
  /** CA6 (ronda 11): «¿De qué?» de un estudio genérico («tórax» → «Rayos X de tórax PA y lateral»). */
  subject?: string
  /** CA6: clave solo de pantalla, para pedir el mismo estudio varias veces en una orden (no se guarda). */
  key?: string
}

export interface ExamResultValue { analyte: string; value: string; unit?: string; low?: number; high?: number; flag?: 'high' | 'low'; critical?: boolean
  /** UM1 (ronda 8): «<X» (el máximo queda fuera) y el texto de referencia del documento. */
  highOpen?: boolean; reference?: string }

export interface ExamOrder extends ExamInput {
  id: string
  /** DP3 (ronda 11): paciente que vino solo a hacerse exámenes. */
  location?: 'ambulatory'
  /** DP3: «Solicitado por» (persona del sistema o nombre escrito) y la foto o archivo de la orden en papel. */
  requestedById?: string
  requestedByName?: string
  orderFileId?: string
  /** DP2 (ronda 11): «No se realizó» con su motivo (sigue pendiente; el médico decide si lo cancela). */
  notDone?: { reason: string; at: string; by: string }
  /** GE4 (ronda 9): versión del resultado (sólo si se corrigió) y hasta cuándo lo puede corregir quien lo cargó. */
  resultVersion?: number
  resultGraceUntil?: string
  patientId: string
  /** EX2 (ronda 8): número de la orden (OE-2026-0001), el mismo para los exámenes pedidos juntos. Los de antes no lo tienen. */
  orderNo?: string
  consultationId?: string
  hospitalizationId?: string
  noteId?: string
  /** Los exámenes pedidos juntos (en una consulta o una nota): se imprimen en una orden por grupo. */
  batchId: string
  /** Área que lo realiza y recibe la alerta (hoy, sin laboratorio ni imágenes propios, enfermería). */
  area: 'lab' | 'imaging' | 'nursing' | 'none'
  status: ExamStatus
  orderedBy: string
  orderedAt: string
  statusAt?: string
  statusBy?: string
  cancelReason?: string
  /** EX6 (ronda 11): `responsibleId`, el microbiólogo responsable (el de turno o el elegido al cargar). */
  result?: { values?: ExamResultValue[]; report?: string; fileIds?: string[]; at: string; by: string; responsibleId?: string }
  /** Algún valor fuera del umbral crítico de la clínica. */
  critical?: boolean
  reviewedBy?: string
  reviewedAt?: string
  /** Cada cambio de estado con quién y cuándo. */
  events?: { status: ExamStatus; by: string; at: string; note?: string }[]
}

/** Perfil o paquete de exámenes (de la clínica o de un médico). */
export interface ExamProfile { id: string; name: string; ownerId?: string; items: { group: ExamGroup; name: string }[]; note?: string }

/** Examen agregado al catálogo por la clínica. */
/** AD4 (ronda 5): examen del catálogo de la clínica (la lista fija se copió a cada clínica; `baseKey` la enlaza). */
export interface ClinicExam { id: string; group: ExamGroup; name: string; active: boolean; baseKey?: string; createdBy?: string; createdAt: string; archivedAt?: string
  /** CA5 (ronda 10): detalles que pide al ordenar (si administración los cambió; si no, los de la lista fija). */
  details?: import('./imagingCatalog').ImagingDetails
  /** CF3 (ronda 6): subgrupo (Hematología, Rayos X…). Vacío: el de la lista fija u «Otros». */
  subgroup?: string
  /** UM1 (ronda 8): valores de referencia vigentes de la clínica para este examen. */
  refs?: (import('./labReference').RefRow & { id: string; editedBy?: string; originLabel?: string; createdAt?: string; editNote?: string })[] }

/** AN1: adenda (addendum) de una nota firmada: corrección, información adicional o resultado posterior. Inmutable. */
export interface Addendum {
  id: string
  /** 'anesthesia' (PQ3, ronda 14): la hoja de anestesia llenada en el sistema. */
  targetKind: 'consultation' | 'note' | 'referral' | 'anesthesia' | 'preanesthesia' | 'surgical_count'
  targetId: string
  kind: 'correction' | 'info' | 'result'
  /** Si es corrección: qué se corrige ("Dosis de amoxicilina mal escrita"). */
  corrects?: string
  text: string
  authorId: string
  authorRole?: string
  at: string
}

/** Medicamento dentro de un set de órdenes, con la estructura de la nota (sirve para la hoja y para la receta). */
export interface SetMed {
  drug: string
  presentation?: string
  dose: string
  route: string
  everyHours?: number
  prn: boolean
  /** MC2 (ronda 6): condición del PRN. */
  prnCondition?: string
  days?: number
  instructions?: string
  /** Pendiente (ronda 17): una infusión continua guarda su velocidad en el set (antes se perdía al guardarlo). */
  infusionRate?: number
  infusionUnit?: InfusionUnit
}

/** Una orden de un set: texto (indicación), medicamento estructurado o examen (EX1). */
export type OrderSetItem = { text: string; med?: undefined; exam?: undefined } | { med: SetMed; text?: undefined; exam?: undefined } | { exam: ExamInput; text?: undefined; med?: undefined }

/** Set de órdenes de un médico ("Post-op colecistectomía no complicada"). Personal; puede compartirse con la clínica. */
export interface OrderSet {
  id: string
  ownerId: string
  name: string
  items: OrderSetItem[]
  shared: boolean
  /** MC2 (ronda 5): set de órdenes (indicaciones, medicamentos y exámenes) o set de exámenes (sólo exámenes, del médico). */
  kind?: 'orders' | 'exams'
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
  /** Tipo de la estancia ('hospital' u 'observation'); lo manda GET /authorizations/:id. */
  stayKind?: string
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
  /** RF1 (ronda 8): también las alergias del paciente. */
  patient: { name: string; dni?: string; age: string; sex?: 'F' | 'M'; record: string; allergies?: string[] }
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
  /**
   * Ronda 8: la referencia también sale de una hospitalización y de la consulta externa, con los datos del Sistema Nacional
   * de Referencia y Respuesta. Las referencias de antes no los tienen (se imprimen como entonces).
   */
  source?: ReferralSource
  /** Servicio o especialidad que recibe. */
  service?: string
  urgency?: 'emergency' | 'urgent' | 'scheduled'
  admissionDiagnosis?: string
  /** Diagnóstico de egreso: el vigente al referir. */
  dischargeDiagnosis?: string
  /** Tratamiento recibido: medicamentos (con lo aplicado) e indicaciones. */
  treatment?: string
  vitals?: string
  /** Con quién se coordinó en el establecimiento que recibe (nombre, hora, medio). */
  contact?: string
  companion?: string
  transport?: string
  /** Se informó al paciente o a su responsable del motivo y el destino. */
  informed?: boolean
  /** RF1 (ronda 8): prioridad «Rutina | Urgente» (la misma de las órdenes de examen). Las de antes usan `urgency`. */
  priority?: 'routine' | 'urgent'
  /**
   * RF1: casilla obligatoria «El paciente (o su representante) fue informado de la referencia y está de acuerdo en que su
   * información clínica se comparta con el centro receptor», con la fecha y hora en que se marcó.
   */
  consentAt?: string
}

export type ReferralSource = 'observation' | 'hospital' | 'consultation'

export interface Referral {
  id: string
  /** RF1 (ronda 8): adendas de la referencia firmada. */
  addenda?: Addendum[]
  hospitalizationId?: string
  consultationId?: string
  /** RF1 (ronda 8): emitida desde una consulta en borrador (se enlaza a la consulta al firmarla). */
  appointmentId?: string
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
  /** MC2 (ronda 6): cuándo se da el PRN ("si dolor"). Las órdenes de antes no lo tienen. */
  prnCondition?: string
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
  /** Ronda 8: infusión continua (sin horario de dosis): velocidad del goteo. */
  infusionRate?: number
  infusionUnit?: InfusionUnit
  /** ME2 (ronda 8): primera dosis diferente y luego `dose` con su frecuencia: «Ceftriaxona IM · 2 gr STAT y luego 1 gr c/12h». */
  loadingDose?: string
  /** ME2: la dosis inicial es «Ahora (STAT)» (por omisión) o a una hora elegida (`firstAt`): «2 gr el 02/11/2026 14:00». */
  loadingStat?: boolean
  /** ME4 (ronda 9): nebulización con sus componentes y diluyente (la vía es «Nebulización»). */
  nebulization?: import('./medExtras').Nebulization
  /** ME10 (ronda 10): la clínica no lo tiene: sigue en la hoja y va a una receta («Cantidad a comprar», opcional). */
  buyOutside?: boolean
  buyQuantity?: string
  /** ME16 (ronda 16): cantidad total, como en la receta (opcional). */
  quantity?: string
  /** ME1 (ronda 8): enfermería suspendió la infusión en curso (hora, quién y motivo opcional). */
  infusionStoppedAt?: string
  infusionStoppedBy?: string
  infusionStopNote?: string
}

export type InfusionUnit = 'ml/h' | 'ml/min'

export interface Dose extends Correctable {
  id: string
  medId: string
  scheduledAt?: string // vacío en medicamentos PRN
  givenAt: string
  givenBy: string
  /** OB1 (ronda 5): «Omitida» con motivo, además de administrada y no aplicada. */
  status: 'given' | 'skipped' | 'omitted'
  note?: string
  /** ME2 (ronda 8): la cantidad que correspondía a esa dosis (la inicial o las siguientes). Las de antes no la tienen. */
  dose?: string
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
  /** MC5: exámenes pendientes al alta. */
  pendingExams?: string[]
  instructions: string
  followUp?: string
  /** Secciones "agregadas" que el médico quitó. */
  hidden: ('procedures' | 'dischargeDx' | 'labs' | 'condition')[]
  /** AN1: adendas de la nota de egreso al momento de emitirla. */
  dischargeAddenda?: { kind: 'correction' | 'info' | 'result'; corrects?: string; text: string; author: string; at: string }[]
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
  /** MC7 (ronda 6): las indicaciones (no medicamentos) de esa consulta: empiezan la cadena de indicaciones. */
  consultIndications?: string[]
  /** AN1: adendas de las notas de la estancia y de la consulta de ingreso. */
  addenda?: Addendum[]
  /** ME14 (ronda 14): medicamentos que la consulta de ingreso indicó para la receta y no están en la hoja (id «c:…»). */
  consultRxMeds?: InpatientMed[]
  /** EX1: exámenes de la estancia (y de la consulta que lo ingresó). */
  exams?: ExamOrder[]
  /** IE1 (ronda 16): registros manuales de ingestas y excretas (también los anulados, tachados). */
  fluids?: FluidEntry[]
}

/** IE1 (ronda 16): frecuencia de corte de «Cuantificar ingestas y excretas». */
export type FluidsMode = 'shift' | 'h12' | 'h24'
/** IE1 (ronda 16): un tramo de la orden: desde cuándo rige y quién la dio ('off': suspendida). */
export interface FluidsSegment { mode: FluidsMode | 'off'; from: string; by: string; noteId?: string }
/** IE1 (ronda 16): un ingreso o egreso registrado a mano, en mL. */
export interface FluidEntry {
  id: string
  hospitalizationId: string
  kind: 'in' | 'out'
  /** Rubro (FLUID_IN_ITEMS o FLUID_OUT_ITEMS). */
  item: string
  ml: number
  at: string
  note?: string
  createdBy: string
  createdAt: string
  version?: number
  graceUntil?: string
  correctedAt?: string
  voidedAt?: string
  voidedBy?: string
  voidReason?: string
}

// ---------- Crónicos y seguimientos ----------

export interface Followup {
  id: string
  patientId: string
  /** 'procedure' es de antes de la ronda 6 (CR1): ahora un procedimiento es un recordatorio de tipo Procedimiento. */
  kind: 'chronic' | 'reminder' | 'procedure'
  /** CR1 (ronda 6): tipo del recordatorio, visible junto al motivo. Los de antes no lo tienen («Recordatorio»). */
  reminderType?: 'exam' | 'procedure' | 'other'
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

/** ME13 (ronda 14): un medicamento «Aplicar en la clínica» de una consulta externa sin ingreso: por aplicar, aplicado o no aplicado. */
export interface ConsultApplication {
  id: string
  consultationId: string
  appointmentId?: string
  patientId: string
  itemIndex: number
  drug: string
  /** Texto completo de la orden (nombre, presentación, dosis, vía). */
  orderText: string
  orderedBy: string
  orderedAt: string
  status: 'pending' | 'applied' | 'not_applied'
  appliedAt?: string
  reason?: string
  recordedBy?: string
  recordedAt?: string
}
