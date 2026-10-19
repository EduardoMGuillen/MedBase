import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Appointment, ApptStatus, AuditEntry, Consultation, Patient, Prescription, PrescriptionItem, Staff, Vitals } from './types'
import type { Permission } from './permissions'
import { api, ApiError } from './api'

interface Data {
  staff: Staff[]
  patients: Patient[]
  appointments: Appointment[]
  prescriptions: Prescription[]
  audit: AuditEntry[]
  vitals: Vitals[] // signos tomados hoy
}

interface Session { user: Staff; permissions: Permission[]; demo: boolean }

export interface Chart { vitals: Vitals[]; consultations: Consultation[]; prescriptions: Prescription[] }

const EMPTY: Data = { staff: [], patients: [], appointments: [], prescriptions: [], audit: [], vitals: [] }

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

  const signIn = async (email: string, password: string) => {
    const r = await api<Session>('/auth/login', { body: { email, password } })
    setSession(r)
    await refresh()
  }
  const signOut = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => null)
    setSession(null)
    setData(EMPTY)
  }

  const user = session?.user ?? null

  // Estables entre renders para poder usarlos como dependencias de efectos
  const fetchChart = useCallback((patientId: string) => api<Chart>(`/patients/${patientId}/chart`), [])
  const fetchPrescription = useCallback((id: string) =>
    api<{ prescription: Prescription; consultation: Consultation | null; patient: Patient }>(`/prescriptions/${id}`), [])

  return {
    ...data, user, checking, demo: session?.demo ?? false, toast, notify, clearToast: () => setToast(null), refresh,
    can: (perm: Permission) => !!session?.permissions.includes(perm),
    signIn, signOut,
    patient: (id: string) => data.patients.find((p) => p.id === id),
    staffById: (id: string) => data.staff.find((s) => s.id === id),

    setStatus: (id: string, status: Exclude<ApptStatus, 'scheduled' | 'triaged' | 'done'>, success?: string) =>
      run(() => api<Appointment>(`/appointments/${id}/status`, { body: { status } }), success),
    addAppointment: (a: Omit<Appointment, 'id' | 'status' | 'arrivedAt'>) =>
      run(() => api<Appointment>('/appointments', { body: a }), 'Cita agendada'),
    reschedule: (id: string, a: Partial<Pick<Appointment, 'doctorId' | 'start' | 'minutes' | 'reason'>>) =>
      run(() => api<Appointment>(`/appointments/${id}`, { method: 'PATCH', body: a }), 'Cita reprogramada'),
    addPatient: (p: Omit<Patient, 'id' | 'record' | 'createdAt'>) =>
      run(() => api<{ id: string; record: string }>('/patients', { body: p }), 'Paciente registrado'),
    updatePatient: (id: string, p: Partial<Patient>) =>
      run(() => api<Patient>(`/patients/${id}`, { method: 'PATCH', body: p }), 'Ficha actualizada'),
    addVitals: (v: Omit<Vitals, 'id' | 'takenAt' | 'takenBy'>) =>
      run(() => api<Vitals>('/vitals', { body: v }), 'Signos vitales guardados'),
    finishConsult: (c: Omit<Consultation, 'id' | 'prescriptionId' | 'patientId' | 'doctorId' | 'date'> & { appointmentId: string }, items: PrescriptionItem[]) =>
      run(() => api<{ consultationId: string; prescriptionId: string | null; folio: string | null }>('/consultations', { body: { ...c, items } }),
        items.length ? 'Consulta y receta firmadas' : 'Consulta firmada'),
    fetchChart, fetchPrescription,

    createStaff: (s: Pick<Staff, 'name' | 'role' | 'email' | 'specialty' | 'license'>) =>
      run(() => api<{ user: Staff; password: string }>('/staff', { body: s }), 'Usuario creado'),
    updateStaff: (id: string, b: { active?: boolean; role?: Staff['role'] }) =>
      run(() => api<Staff>(`/staff/${id}`, { method: 'PATCH', body: b }), 'Usuario actualizado'),
    resetStaffPassword: (id: string) => run(() => api<{ password: string }>(`/staff/${id}/reset-password`, { method: 'POST' })),
    changePassword: (current: string, next: string) =>
      run(() => api('/auth/password', { body: { current, next } }), 'Contraseña actualizada'),
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
