import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Appointment, ApptStatus, AuditEntry, Consultation, Patient, Prescription, Staff, Vitals } from './types'
import { PATIENTS, STAFF, seedAppointments, seedClinical } from './seed'
import { can, type Permission } from './permissions'

interface Data {
  staff: Staff[]
  patients: Patient[]
  appointments: Appointment[]
  vitals: Vitals[]
  consultations: Consultation[]
  prescriptions: Prescription[]
  audit: AuditEntry[]
}

const KEY = 'clinara.demo.v1'
const SESSION = 'clinara.session'

function fresh(): Data {
  return { staff: STAFF, patients: PATIENTS, appointments: seedAppointments(), ...seedClinical(), audit: [] }
}

function load(): Data {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const d = JSON.parse(raw) as Data & { seededOn?: string }
      // La agenda de demo se regenera cada día para que "hoy" siempre tenga citas.
      if (d.seededOn === new Date().toDateString()) return d
    }
  } catch { /* almacenamiento no disponible */ }
  return fresh()
}

const uid = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

function useStoreValue() {
  const [data, setData] = useState<Data>(load)
  const [userId, setUserId] = useState<string | null>(() => {
    try { return sessionStorage.getItem(SESSION) } catch { return null }
  })

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ ...data, seededOn: new Date().toDateString() })) } catch { /* noop */ }
  }, [data])

  const user = data.staff.find((s) => s.id === userId) ?? null

  const log = useCallback((d: Data, action: string): Data => (
    userId ? { ...d, audit: [{ id: uid('l'), at: new Date().toISOString(), userId, action }, ...d.audit].slice(0, 200) } : d
  ), [userId])

  const signIn = (id: string) => {
    setUserId(id)
    try { sessionStorage.setItem(SESSION, id) } catch { /* noop */ }
    setData((d) => ({ ...d, audit: [{ id: uid('l'), at: new Date().toISOString(), userId: id, action: 'Inició sesión' }, ...d.audit] }))
  }
  const signOut = () => {
    setUserId(null)
    try { sessionStorage.removeItem(SESSION) } catch { /* noop */ }
  }

  const setStatus = (apptId: string, status: ApptStatus) => setData((d) => log({
    ...d,
    appointments: d.appointments.map((a) => a.id === apptId
      ? { ...a, status, arrivedAt: status === 'arrived' ? new Date().toISOString() : a.arrivedAt } : a),
  }, `Cita ${apptId} → ${status}`))

  const addAppointment = (a: Omit<Appointment, 'id'>) => setData((d) => log({
    ...d, appointments: [...d.appointments, { ...a, id: uid('a') }],
  }, 'Agendó una cita'))

  const addPatient = (p: Omit<Patient, 'id' | 'record' | 'createdAt'>) => {
    const id = uid('p')
    setData((d) => log({
      ...d,
      patients: [...d.patients, { ...p, id, record: `EXP-${String(400 + d.patients.length + 80).padStart(5, '0')}`, createdAt: new Date().toISOString() }],
    }, `Registró paciente ${p.firstName} ${p.lastName}`))
    return id
  }

  const addVitals = (v: Omit<Vitals, 'id' | 'takenAt' | 'takenBy'>) => setData((d) => {
    const next = { ...d, vitals: [{ ...v, id: uid('v'), takenAt: new Date().toISOString(), takenBy: userId! }, ...d.vitals] }
    if (v.appointmentId) {
      next.appointments = d.appointments.map((a) => a.id === v.appointmentId && a.status === 'arrived' ? { ...a, status: 'triaged' as const } : a)
    }
    return log(next, 'Registró signos vitales')
  })

  const finishConsult = (c: Omit<Consultation, 'id' | 'prescriptionId'>, rxItems: Prescription['items']) => {
    const cid = uid('c')
    const rxId = rxItems.length ? uid('rx') : undefined
    setData((d) => {
      const prescriptions = rxId ? [{
        id: rxId, folio: `RX-${new Date().getFullYear()}-${String(1100 + d.prescriptions.length).padStart(4, '0')}`,
        patientId: c.patientId, doctorId: c.doctorId, consultationId: cid, issuedAt: new Date().toISOString(), items: rxItems,
      }, ...d.prescriptions] : d.prescriptions
      return log({
        ...d,
        prescriptions,
        consultations: [{ ...c, id: cid, prescriptionId: rxId }, ...d.consultations],
        appointments: d.appointments.map((a) => a.id === c.appointmentId ? { ...a, status: 'done' as const } : a),
      }, rxId ? 'Firmó consulta y emitió receta' : 'Firmó consulta')
    })
    return { cid, rxId }
  }

  const toggleStaff = (id: string) => setData((d) => log({
    ...d, staff: d.staff.map((s) => s.id === id ? { ...s, active: !s.active } : s),
  }, 'Cambió estado de un usuario'))

  const reset = () => setData(fresh())

  return {
    ...data, user,
    can: (perm: Permission) => !!user && can(user.role, perm),
    signIn, signOut, setStatus, addAppointment, addPatient, addVitals, finishConsult, toggleStaff, reset,
    patient: (id: string) => data.patients.find((p) => p.id === id),
    staffById: (id: string) => data.staff.find((s) => s.id === id),
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
