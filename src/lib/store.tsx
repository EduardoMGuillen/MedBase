import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type {
  Appointment, ApptStatus, Attachment, AuditEntry, ClinicSettings, Consultation, Patient, Payment, PaymentMethod,
  Prescription, PrescriptionItem, Service, Staff, Vitals,
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
}

interface Session { user: Staff; permissions: Permission[]; demo: boolean }

export interface Chart { vitals: Vitals[]; consultations: Consultation[]; prescriptions: Prescription[] }

export interface Report {
  range: { from: string; to: string }
  totals: { appointments: number; done: number; noShow: number; cancelled: number; attendance: number | null; revenue: number; payments: number; avgTicket: number; online: number; newPatients: number }
  days: { date: string; appointments: number; done: number; revenue: number }[]
  byDoctor: { id: string; name: string; appointments: number; done: number; noShow: number; revenue: number }[]
  byMethod: { method: PaymentMethod; count: number; total: number }[]
  topDiagnoses: { code: string; label: string; count: number }[]
}

export type NewPayment = Pick<Payment, 'patientId' | 'items' | 'discount' | 'method'> & { appointmentId?: string; reference?: string }

const EMPTY: Data = { staff: [], patients: [], appointments: [], prescriptions: [], audit: [], vitals: [], services: [], settings: DEFAULT_SETTINGS }

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
    api<{ prescription: Prescription; consultation: Consultation | null; patient: Patient }>(`/prescriptions/${id}`), [])
  const fetchConsultation = useCallback((id: string) => api<{ consultation: Consultation; patient: Patient }>(`/consultations/${id}`), [])
  const fetchPayments = useCallback((from: string, to: string) => api<Payment[]>(`/payments?from=${from}&to=${to}`), [])
  const fetchPayment = useCallback((id: string) => api<{ payment: Payment; patient: Patient }>(`/payments/${id}`), [])
  const fetchReport = useCallback((from: string, to: string) => api<Report>(`/reports?from=${from}&to=${to}`), [])
  const fetchAttachments = useCallback((patientId: string) => api<Attachment[]>(`/patients/${patientId}/attachments`), [])

  return {
    ...data, user, checking, demo: session?.demo ?? false, toast, notify, clearToast: () => setToast(null), refresh,
    can: (perm: Permission) => !!session?.permissions.includes(perm),
    signIn, signOut,
    patient: (id: string) => data.patients.find((p) => p.id === id),
    staffById: (id: string) => data.staff.find((s) => s.id === id),
    fetchChart, fetchPrescription, fetchConsultation, fetchPayments, fetchPayment, fetchReport, fetchAttachments,

    setStatus: (id: string, status: Exclude<ApptStatus, 'scheduled' | 'triaged' | 'done'>, success?: string) =>
      run(() => api<Appointment>(`/appointments/${id}/status`, { body: { status } }), success),
    addAppointment: (a: Omit<Appointment, 'id' | 'status' | 'arrivedAt'>) =>
      run(() => api<Appointment>('/appointments', { body: a }), 'Cita agendada'),
    reschedule: (id: string, a: Partial<Pick<Appointment, 'doctorId' | 'start' | 'minutes' | 'reason'>>) =>
      run(() => api<Appointment>(`/appointments/${id}`, { method: 'PATCH', body: a }), 'Cita reprogramada'),
    markReminded: (id: string) => run(() => api<Appointment>(`/appointments/${id}/reminded`, { method: 'POST' })),
    addPatient: (p: Omit<Patient, 'id' | 'record' | 'createdAt'>) =>
      run(() => api<{ id: string; record: string }>('/patients', { body: p }), 'Paciente registrado'),
    updatePatient: (id: string, p: Partial<Patient>) =>
      run(() => api<Patient>(`/patients/${id}`, { method: 'PATCH', body: p }), 'Ficha actualizada'),
    addVitals: (v: Omit<Vitals, 'id' | 'takenAt' | 'takenBy'>) =>
      run(() => api<Vitals>('/vitals', { body: v }), 'Signos vitales guardados'),
    finishConsult: (c: Omit<Consultation, 'id' | 'prescriptionId' | 'patientId' | 'doctorId' | 'date'> & { appointmentId: string }, items: PrescriptionItem[]) =>
      run(() => api<{ consultationId: string; prescriptionId: string | null; folio: string | null }>('/consultations', { body: { ...c, items } }),
        items.length ? 'Consulta y receta firmadas' : 'Consulta firmada'),

    pay: (p: NewPayment) => run(() => api<Payment>('/payments', { body: p }), 'Cobro registrado'),
    voidPayment: (id: string, reason: string) => run(() => api<Payment>(`/payments/${id}/void`, { body: { reason } }), 'Recibo anulado'),

    uploadAttachment: (patientId: string, a: { name: string; mime: string; category: Attachment['category']; data: string }) =>
      run(() => api<Attachment>(`/patients/${patientId}/attachments`, { body: a }), 'Archivo adjuntado'),
    deleteAttachment: (id: string) => run(() => api(`/attachments/${id}`, { method: 'DELETE' }), 'Archivo eliminado'),

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
