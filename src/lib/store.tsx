import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type {
  Appointment, ApptStatus, Attachment, AuditEntry, Authorization, AuthorizationData, Bed, Certificate, CertificateData, Clinic, ClinicDrug, ClinicKind, ClinicRole, ClinicSettings, Consultation, DischargeData, Dose, Followup, GuestPatient, HospProcedure, Hospitalization,
  InpatientFile, InpatientMed, InpatientNote, OrderMark, PatientIndex, PendingOrders, Patient, Payment, PaymentMethod, Prescription, PrescriptionItem, Schedule, Service, Staff, Vitals,
} from './types'
import type { Permission } from './permissions'
import { api, ApiError } from './api'
import { DEFAULT_SETTINGS } from './seed'

interface Data {
  staff: Staff[]
  patients: Patient[]
  appointments: Appointment[]
  prescriptions: Prescription[]
  audit: AuditEntry[]
  vitals: Vitals[] // signos tomados hoy
  services: Service[]
  settings: ClinicSettings
  beds: Bed[]
  inpatients: Hospitalization[] // hospitalizaciones abiertas
  followups: Followup[] // seguimientos activos
  discharges: { patientId: string; at: string }[] // último egreso de cada paciente
  clinicDrugs?: ClinicDrug[] // vademécum propio de la clínica
  pendingOrders?: PendingOrders[] // órdenes médicas sin revisar (enfermería)
  stays?: { patientId: string; kind: Hospitalization['kind'] }[] // quién está hospitalizado o en observación (todos los roles)
}

interface Session { user: Staff; permissions: Permission[]; demo: boolean }

export interface Chart { vitals: Vitals[]; consultations: Consultation[]; prescriptions: Prescription[]; hospitalizations: Hospitalization[] }

/** Medicamento que el médico indica en una nota de hospitalización. */
export type NewMed = Pick<InpatientMed, 'drug' | 'presentation' | 'dose' | 'route' | 'everyHours' | 'prn' | 'instructions' | 'days' | 'replacesId'> & { firstAt?: string }
export type FollowupInput = Pick<Followup, 'kind' | 'title' | 'dueDate' | 'everyDays' | 'notes'>

export interface Report {
  range: { from: string; to: string }
  totals: { appointments: number; done: number; noShow: number; cancelled: number; attendance: number | null; revenue: number; payments: number; avgTicket: number; online: number; newPatients: number }
  days: { date: string; appointments: number; done: number; revenue: number }[]
  byDoctor: { id: string; name: string; appointments: number; done: number; noShow: number; revenue: number }[]
  byMethod: { method: PaymentMethod; count: number; total: number }[]
  topDiagnoses: { code: string; label: string; count: number }[]
}

/** Cita nueva: con un paciente registrado o con nombre y teléfono de uno nuevo. Motivo y tipo son opcionales. */
export interface NewAppointment {
  patientId?: string
  newPatient?: { firstName: string; lastName: string; phone: string; dni?: string }
  doctorId: string
  start: string
  reason?: string
  type?: Appointment['type']
}

export type NewPayment = Pick<Payment, 'patientId' | 'items' | 'discount' | 'method'> & { appointmentId?: string; reference?: string }

const EMPTY: Data = { staff: [], patients: [], appointments: [], prescriptions: [], audit: [], vitals: [], services: [], settings: DEFAULT_SETTINGS, beds: [], inpatients: [], followups: [], discharges: [] }

/** Minutos sin actividad antes de cerrar la sesión automáticamente. */
const IDLE_MINUTES = 30

function useStoreValue() {
  const [session, setSession] = useState<Session | null>(null)
  const [checking, setChecking] = useState(true)
  const [data, setData] = useState<Data>(EMPTY)
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'error' } | null>(null)

  const notify = useCallback((msg: string, tone: 'ok' | 'error' = 'ok') => setToast({ msg, tone }), [])

  const refresh = useCallback(async () => {
    try {
      setData(await api<Data>('/bootstrap'))
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setSession(null)
      else notify((e as Error).message, 'error')
    }
  }, [notify])

  useEffect(() => {
    api<{ user: Staff | null; permissions?: Permission[]; demo: boolean }>('/auth/me')
      .then(async (r) => {
        if (r.user) { setSession({ user: r.user, permissions: r.permissions ?? [], demo: r.demo }); await refresh() }
      })
      .catch(() => { /* sin servidor: el login mostrará el error */ })
      .finally(() => setChecking(false))
  }, [refresh])

  const signOut = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => null)
    setSession(null)
    setData(EMPTY)
  }, [])

  // Cierre por inactividad: protege la información si alguien deja la computadora abierta
  const loggedIn = !!session
  useEffect(() => {
    if (!loggedIn) return
    let timer: ReturnType<typeof setTimeout>
    const reset = () => {
      clearTimeout(timer)
      timer = setTimeout(async () => {
        await signOut()
        notify(`Cerramos tu sesión tras ${IDLE_MINUTES} minutos sin actividad.`)
      }, IDLE_MINUTES * 60_000)
    }
    const events = ['pointerdown', 'keydown', 'scroll'] as const
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }))
    reset()
    return () => { clearTimeout(timer); events.forEach((e) => window.removeEventListener(e, reset)) }
  }, [loggedIn, signOut, notify])

  /** Ejecuta una mutación, recarga los datos y avisa el resultado. Devuelve null si falló. */
  const run = useCallback(async <T,>(fn: () => Promise<T>, success?: string): Promise<T | null> => {
    try {
      const r = await fn()
      await refresh()
      if (success) notify(success)
      return r
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setSession(null)
      notify((e as Error).message, 'error')
      return null
    }
  }, [refresh, notify])

  /** Devuelve `true` si la cuenta pide el código de verificación en dos pasos. */
  const signIn = async (email: string, password: string, code?: string) => {
    const r = await api<Session | { twoFactor: true }>('/auth/login', { body: { email, password, code } })
    if ('twoFactor' in r) return true
    setSession(r)
    await refresh()
    return false
  }

  const user = session?.user ?? null

  // Estables entre renders para poder usarlos como dependencias de efectos
  const fetchChart = useCallback((patientId: string) => api<Chart>(`/patients/${patientId}/chart`), [])
  const fetchPrescription = useCallback((id: string) =>
    api<{ prescription: Prescription; consultation: Consultation | null; hospitalization: Hospitalization | null; patient: Patient | null }>(`/prescriptions/${id}`), [])
  const fetchInpatient = useCallback((id: string) => api<InpatientFile>(`/inpatient/${id}`), [])
  const fetchConsultation = useCallback((id: string, purpose: 'note' | 'certificate' = 'note') =>
    api<{ consultation: Consultation; patient: Patient; vitals: Vitals | null }>(`/consultations/${id}?purpose=${purpose}`), [])
  const fetchAppointments = useCallback((from: string, to: string) => api<Appointment[]>(`/appointments?from=${from}&to=${to}`), [])
  const fetchPayments = useCallback((from: string, to: string) => api<Payment[]>(`/payments?from=${from}&to=${to}`), [])
  const fetchPayment = useCallback((id: string) => api<{ payment: Payment; patient: Patient }>(`/payments/${id}`), [])
  const fetchReport = useCallback((from: string, to: string) => api<Report>(`/reports?from=${from}&to=${to}`), [])
  const fetchAuthorization = useCallback((id: string) => api<Authorization>(`/authorizations/${id}`), [])
  const fetchCertificate = useCallback((id: string) => api<Certificate>(`/certificates/${id}`), [])
  const fetchCertificates = useCallback((patientId: string) => api<Certificate[]>(`/patients/${patientId}/certificates`), [])
  const fetchPatientIndex = useCallback(() => api<PatientIndex[]>('/patients/index'), [])
  const fetchAttachments = useCallback((patientId: string) => api<Attachment[]>(`/patients/${patientId}/attachments`), [])
  // Administración de la plataforma
  const fetchClinics = useCallback(() => api<Clinic[]>('/platform/clinics'), [])
  const fetchClinicStaff = useCallback((clinicId: string) => api<Staff[]>(`/platform/clinics/${clinicId}/staff`), [])
  const fetchPlatformActivity = useCallback(() => api<(AuditEntry & { clinicName?: string })[]>('/platform/activity'), [])

  return {
    ...data, user, checking, demo: session?.demo ?? false, toast, notify, clearToast: () => setToast(null), refresh,
    can: (perm: Permission) => !!session?.permissions.includes(perm),
    signIn, signOut,
    patient: (id: string) => data.patients.find((p) => p.id === id),
    staffById: (id: string) => data.staff.find((s) => s.id === id),
    fetchAuthorization, fetchCertificate, fetchCertificates, fetchPatientIndex, fetchChart, fetchPrescription, fetchConsultation, fetchAppointments, fetchPayments, fetchPayment, fetchReport, fetchAttachments,
    fetchClinics, fetchClinicStaff, fetchPlatformActivity, fetchInpatient,
    bed: (id?: string) => (id ? data.beds.find((b) => b.id === id) : undefined),
    /** Hospitalización abierta del paciente, si la tiene. */
    inpatientOf: (patientId: string) => data.inpatients.find((h) => h.patientId === patientId),
    /** Hospitalizado o en observación ahora mismo; lo ven también recepción y caja. */
    stayOf: (patientId: string) => data.stays?.find((x) => x.patientId === patientId)?.kind,

    walkIn: (b: { patientId: string; doctorId: string; reason: string }) =>
      run(() => api<Appointment>('/appointments/walk-in', { body: b }), 'Paciente agregado a la consulta externa de hoy'),

    // Hospitalización
    admit: async (b: Pick<Hospitalization, 'patientId' | 'bedId' | 'reason' | 'diagnoses' | 'consultationId' | 'companionName' | 'companionRelation' | 'companionPhone' | 'patientPhone'> & { admittedAt?: string }) => {
      const h = await run(() => api<Hospitalization & { medOrders: number }>('/inpatient', { body: b }))
      if (h) notify(`Paciente ingresado${h.consultationId ? ', vinculado a su consulta externa' : ''}${h.medOrders ? `; ${h.medOrders} medicamento${h.medOrders > 1 ? 's' : ''} pasaron a la hoja` : ''}.`)
      return h
    },
    /** Corregir el ingreso (o asignarle la cama al que entró desde la consulta) sin rehacerlo. */
    updateAdmission: (id: string, b: Partial<Pick<Hospitalization, 'bedId' | 'admittedAt' | 'reason' | 'diagnoses' | 'companionName' | 'companionRelation' | 'companionPhone' | 'patientPhone'>>) =>
      run(() => api<Hospitalization>(`/inpatient/${id}`, { method: 'PATCH', body: b }), 'Ingreso actualizado'),
    addInpatientNote: (id: string, b: Pick<InpatientNote, 'subjective' | 'objective' | 'assessment' | 'plan'> & { kind: 'admission' | 'evolution'; meds: NewMed[]; stopMedIds: string[]; orders?: string[]; indicationCount?: number }) =>
      run(() => api<InpatientNote>(`/inpatient/${id}/notes`, { body: b }), b.kind === 'admission' ? 'Nota de ingreso guardada' : 'Nota de evolución guardada'),
    stopMed: (medId: string, reason: string) => run(() => api<InpatientMed>(`/inpatient/meds/${medId}/stop`, { body: { reason } }), 'Orden suspendida'),
    addNursingNote: (id: string, text: string) => run(() => api<InpatientNote>(`/inpatient/${id}/nursing`, { body: { text } }), 'Nota de enfermería guardada'),
    correctDose: (doseId: string, b: { status?: Dose['status']; givenAt?: string; note?: string; reason: string }) =>
      run(() => api<Dose>(`/inpatient/doses/${doseId}`, { method: 'PATCH', body: b }), 'Dosis corregida'),
    recordDose: (medId: string, b: { scheduledAt?: string; givenAt?: string; status: Dose['status']; note?: string; reason?: string }) =>
      run(() => api<Dose>(`/inpatient/meds/${medId}/doses`, { body: b }), b.status === 'given' ? 'Dosis registrada' : 'Dosis marcada como no administrada'),
    reviewOrder: (noteId: string, index: number, checked: boolean, reason?: string) =>
      run(() => api<OrderMark>(`/inpatient/notes/${noteId}/orders/${index}/review`, { body: { checked, reason } }), checked ? 'Orden marcada como revisada' : 'Orden desmarcada'),
    createAuthorization: (id: string, b: Omit<AuthorizationData, 'patient' | 'doctor' | 'clinic'> & { template: Authorization['template'] }) =>
      run(() => api<Authorization>(`/inpatient/${id}/authorizations`, { body: b }), 'Autorización lista para imprimir y firmar'),
    setAuthorizationStatus: (id: string, b: { status: 'signed' | 'refused' | 'revoked'; fileId?: string; note?: string }) =>
      run(() => api<Authorization>(`/authorizations/${id}/status`, { body: b }), b.status === 'signed' ? 'Autorización firmada' : b.status === 'refused' ? 'Rechazo registrado' : 'Revocación registrada'),
    addProcedureNote: (id: string, b: { name: string; performedAt: string; text: string; authorizationId?: string; urgent?: boolean; justification?: string }) =>
      run(() => api<InpatientNote>(`/inpatient/${id}/procedure-notes`, { body: b }), 'Nota de procedimiento guardada'),
    addProcedure: (id: string, b: Pick<HospProcedure, 'kind' | 'name' | 'scheduledAt' | 'notes'>) =>
      run(() => api<HospProcedure>(`/inpatient/${id}/procedures`, { body: b }), 'Registrado'),
    updateProcedure: (pid: string, b: Pick<HospProcedure, 'status' | 'notes'>) =>
      run(() => api<HospProcedure>(`/inpatient/procedures/${pid}`, { method: 'PATCH', body: b }), 'Estado actualizado'),
    discharge: (id: string, b: DischargeData & { items: PrescriptionItem[] }) =>
      run(() => api<{ hospitalization: Hospitalization; prescriptionId: string | null; folio: string | null }>(`/inpatient/${id}/discharge`, { body: b }), 'Paciente dado de alta'),
    // Vademécum de la clínica
    addClinicDrug: (b: Pick<ClinicDrug, 'name' | 'brand' | 'presentation' | 'concentration' | 'route'>) =>
      run(() => api<ClinicDrug>('/drugs', { body: b }), 'Medicamento agregado al vademécum de la clínica'),
    updateClinicDrug: (id: string, b: Partial<Pick<ClinicDrug, 'name' | 'brand' | 'presentation' | 'concentration' | 'route' | 'active'>>) =>
      run(() => api<ClinicDrug>(`/drugs/${id}`, { method: 'PATCH', body: b }), 'Vademécum actualizado'),
    /** Observación → hospitalización: la misma estancia recibe cama y conserva su expediente. */
    convertToHospital: (id: string, b: { bedId: string; companionName?: string; companionRelation?: string; companionPhone?: string; patientPhone?: string }) =>
      run(() => api<Hospitalization>(`/inpatient/${id}/convert`, { body: b }), 'Paciente pasado a hospitalización'),
    createBed: (b: Omit<Bed, 'id'>) => run(() => api<Bed>('/beds', { body: b }), 'Cama agregada'),
    updateBed: (id: string, b: Partial<Omit<Bed, 'id'>>) => run(() => api<Bed>(`/beds/${id}`, { method: 'PATCH', body: b }), 'Cama actualizada'),

    // Crónicos y seguimientos (el envío por WhatsApp es simulado)
    createFollowup: (b: FollowupInput & { patientId: string }) => run(() => api<Followup>('/followups', { body: b }), 'Seguimiento programado'),
    notifyFollowup: (id: string) => run(() => api<Followup>(`/followups/${id}/notify`, { method: 'POST' }), 'Envío simulado registrado'),
    completeFollowup: (id: string) => run(() => api<Followup>(`/followups/${id}/done`, { method: 'POST' }), 'Seguimiento actualizado'),
    removeFollowup: (id: string) => run(() => api<Followup>(`/followups/${id}`, { method: 'PATCH', body: { active: false } }), 'Seguimiento quitado'),

    setStatus: (id: string, status: Exclude<ApptStatus, 'scheduled' | 'triaged' | 'done'>, success?: string) =>
      run(() => api<Appointment>(`/appointments/${id}/status`, { body: { status } }), success),
    addAppointment: (a: NewAppointment) =>
      run(() => api<Appointment>('/appointments', { body: a }), a.newPatient ? 'Cita agendada. El paciente completa su registro al llegar.' : 'Cita agendada'),
    /** Completa el registro de un paciente agendado por teléfono, o lo une a un expediente que ya existía. */
    completeRegistration: (id: string, b: { mergeInto: string } | Omit<Patient, 'id' | 'record' | 'createdAt'>) =>
      run(() => api<{ id: string; record: string }>(`/patients/${id}/complete`, { body: b }), 'mergeInto' in b ? 'Cita unida al expediente existente' : 'Registro completado'),
    updateSchedule: (id: string, schedule: Schedule) => run(() => api<Staff>(`/staff/${id}/schedule`, { method: 'PATCH', body: schedule }), 'Horario guardado'),
    reschedule: (id: string, a: Partial<Pick<Appointment, 'doctorId' | 'start' | 'reason'>>) =>
      run(() => api<Appointment>(`/appointments/${id}`, { method: 'PATCH', body: a }), 'Cita reprogramada'),
    /** Atender al paciente listo para consulta de otro médico. */
    takeAppointment: (id: string, fromDoctorId: string) => run(() => api<Appointment>(`/appointments/${id}/take`, { body: { fromDoctorId } })),
    markReminded: (id: string) => run(() => api<Appointment>(`/appointments/${id}/reminded`, { method: 'POST' })),
    addPatient: (p: Omit<Patient, 'id' | 'record' | 'createdAt'>) =>
      run(() => api<{ id: string; record: string }>('/patients', { body: p }), 'Paciente registrado'),
    updatePatient: (id: string, p: Partial<Patient>) =>
      run(() => api<Patient>(`/patients/${id}`, { method: 'PATCH', body: p }), 'Ficha actualizada'),
    addVitals: (v: Omit<Vitals, 'id' | 'takenAt' | 'takenBy'>) =>
      run(() => api<Vitals>('/vitals', { body: v }), 'Preclínica guardada'),
    finishConsult: async (c: Omit<Consultation, 'id' | 'prescriptionId' | 'patientId' | 'doctorId' | 'date'> & { appointmentId: string; followups?: FollowupInput[]; observe?: boolean; admit?: boolean }, items: PrescriptionItem[]) => {
      const r = await run(() => api<{ consultationId: string; prescriptionId: string | null; folio: string | null; observationId: string | null
        hospitalizationId: string | null; stayKind: Hospitalization['kind'] | null; medOrders: number }>('/consultations', { body: { ...c, items } }))
      // Se dice en voz alta qué pasó con los medicamentos: a la receta, a la hoja de medicamentos o a las dos
      if (r) notify([r.folio ? `Consulta y receta ${r.folio} firmadas` : 'Consulta firmada',
        r.hospitalizationId && (r.stayKind === 'hospital' ? 'ingresado a hospitalización con esta nota como nota de ingreso' : 'ingresado a observación'),
        r.medOrders ? `${r.medOrders} medicamento${r.medOrders > 1 ? 's' : ''} en la hoja de medicamentos` : ''].filter(Boolean).join('; ') + '.')
      return r
    },

    issuePrescription: (b: { patientId?: string; guest?: GuestPatient; items: PrescriptionItem[]; indications: string[] }) =>
      run(() => api<{ prescriptionId: string; folio: string }>('/prescriptions', { body: b }), 'Receta emitida'),
    /** Pasa la receta de una persona no registrada al expediente que se le creó (o que ya tenía). */
    linkPrescription: (id: string, patientId: string, success = 'Receta vinculada al expediente') =>
      run(() => api<Prescription>(`/prescriptions/${id}/link`, { body: { patientId } }), success),
    // Constancias: se emiten, se reimprimen y, si hay un error, se anulan
    createCertificate: (b: Omit<CertificateData, 'patient' | 'doctor' | 'clinic' | 'restTo' | 'diagnoses'> & { patientId: string; consultationId?: string; kind: Certificate['kind'] }) =>
      run(() => api<Certificate>('/certificates', { body: b }), 'Constancia emitida'),
    voidCertificate: (id: string, reason: string) => run(() => api<Certificate>(`/certificates/${id}/void`, { body: { reason } }), 'Constancia anulada'),
    saveMyLicense: (license: string) => run(async () => {
      await api('/me', { method: 'PATCH', body: { license } })
      setSession(await api<Session>('/auth/me'))
    }, 'Número de colegiación guardado'),
    pay: (p: NewPayment) => run(() => api<Payment>('/payments', { body: p }), 'Cobro registrado'),
    voidPayment: (id: string, reason: string) => run(() => api<Payment>(`/payments/${id}/void`, { body: { reason } }), 'Recibo anulado'),

    uploadAttachment: (patientId: string, a: { name: string; mime: string; category: Attachment['category']; data: string; title?: string; takenAt?: string; hospitalizationId?: string }) =>
      run(() => api<Attachment>(`/patients/${patientId}/attachments`, { body: a }), 'Archivo adjuntado'),
    deleteAttachment: (id: string) => run(() => api(`/attachments/${id}`, { method: 'DELETE' }), 'Archivo eliminado'),

    /** El médico titular terminó o saltó el asistente de primer ingreso. */
    finishSetup: () => run(() => api<ClinicSettings>('/settings/setup-done', { method: 'POST' }), 'Listo. Tu consultorio está configurado.'),
    convertToClinic: (b: { admin: { name: string; email: string }; assistants: Record<string, 'reception' | 'nurse'> }) =>
      run(() => api<{ settings: ClinicSettings; admin: Staff; password: string }>('/settings/convert-to-clinic', { body: b })),
    saveSettings: (s: ClinicSettings) => run(() => api<ClinicSettings>('/settings', { method: 'PUT', body: s }), 'Configuración guardada'),
    createService: (s: Omit<Service, 'id'>) => run(() => api<Service>('/services', { body: s }), 'Servicio creado'),
    updateService: (id: string, s: Partial<Service>) => run(() => api<Service>(`/services/${id}`, { method: 'PATCH', body: s }), 'Servicio actualizado'),

    createStaff: (s: Pick<Staff, 'name' | 'role' | 'email' | 'specialty' | 'license'>) =>
      run(() => api<{ user: Staff; password: string }>('/staff', { body: s }), 'Usuario creado'),
    updateStaff: (id: string, b: Partial<Pick<Staff, 'active' | 'role' | 'specialty' | 'license' | 'serviceId' | 'schedule'>> & { twoFactor?: false }, success = 'Usuario actualizado') =>
      run(() => api<Staff>(`/staff/${id}`, { method: 'PATCH', body: b }), success),
    resetStaffPassword: (id: string) => run(() => api<{ password: string }>(`/staff/${id}/reset-password`, { method: 'POST' })),
    changePassword: (current: string, next: string) =>
      run(() => api('/auth/password', { body: { current, next } }), 'Contraseña actualizada'),
    setupTwoFactor: () => run(() => api<{ secret: string; qr: string }>('/auth/2fa/setup', { method: 'POST' })),
    enableTwoFactor: (code: string) => run(async () => {
      await api('/auth/2fa/enable', { body: { code } })
      const me = await api<Session>('/auth/me')
      setSession(me)
    }, 'Verificación en dos pasos activada'),
    disableTwoFactor: (password: string) => run(async () => {
      await api('/auth/2fa/disable', { body: { password } })
      const me = await api<Session>('/auth/me')
      setSession(me)
    }, 'Verificación en dos pasos desactivada'),
    resetDemo: () => run(() => api('/admin/reset-demo', { method: 'POST' }), 'Datos de demo restablecidos'),
    createClinic: (c: Pick<Clinic, 'name' | 'address' | 'phone' | 'email'> & { slug?: string; kind?: ClinicKind; admin?: { name: string; email: string }
      owner?: { name: string; email: string; license: string; specialty?: string } }) =>
      run(() => api<{ clinic: Clinic; admin: Staff; password: string }>('/platform/clinics', { body: c }), c.kind === 'office' ? 'Consultorio creado' : 'Clínica creada'),
    updateClinic: (id: string, c: Partial<Pick<Clinic, 'name' | 'slug' | 'address' | 'phone' | 'email' | 'currency' | 'active'>>, success = 'Clínica actualizada') =>
      run(() => api<Clinic>(`/platform/clinics/${id}`, { method: 'PATCH', body: c }), success),
    createClinicStaff: (clinicId: string, s: { name: string; role: ClinicRole; email: string; specialty?: string; license?: string }) =>
      run(() => api<{ user: Staff; password: string }>(`/platform/clinics/${clinicId}/staff`, { body: s }), 'Usuario creado'),
    updatePlatformStaff: (id: string, b: { active?: boolean; role?: ClinicRole; twoFactor?: false }) =>
      run(() => api<Staff>(`/platform/staff/${id}`, { method: 'PATCH', body: b }), 'Usuario actualizado'),
    resetPlatformStaffPassword: (id: string) => run(() => api<{ password: string }>(`/platform/staff/${id}/reset-password`, { method: 'POST' })),
  }
}

type Store = ReturnType<typeof useStoreValue>
const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={useStoreValue()}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore fuera de StoreProvider')
  return s
}
