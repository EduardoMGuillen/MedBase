import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { StoreProvider, useStore } from './lib/store'
import { features, type Permission } from './lib/permissions'
import { Loading, Toaster } from './components/ui'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Booking from './pages/Booking'
import NotFound from './pages/NotFound'
import AppShell from './app/AppShell'
import Dashboard from './app/Dashboard'
import Agenda from './app/Agenda'
import WaitingRoom from './app/WaitingRoom'
import Patients from './app/Patients'
import PatientChart from './app/PatientChart'
import Consultation from './app/Consultation'
import Prescriptions, { PrescriptionSheet } from './app/Prescriptions'
import Certificate, { CertificateView } from './app/Certificate'
import ConsultNote from './app/ConsultNote'
import Billing, { ReceiptSheet } from './app/Billing'
import Reports from './app/Reports'
import Settings from './app/Settings'
import StaffPage from './app/Staff'
import Account from './app/Account'
import Platform, { ClinicDetail } from './app/Platform'
import Inpatients from './app/Inpatients'
import InpatientFile from './app/InpatientFile'
import FullRecord from './app/FullRecord'
import AuthorizationPage from './app/Authorization'
import Observation from './app/Observation'
import Followups from './app/Followups'
import Onboarding from './app/Onboarding'
import ReferralPage from './app/Referral'
import OrderSetsPage from './app/OrderSetsPage'

/** Entra sólo con sesión, con el permiso y, si se pide, con el módulo activo en la cuenta (un consultorio no tiene hospitalización). */
function Guard({ perm, feature, children }: { perm?: Permission; feature?: 'hospital' | 'observation'; children: ReactNode }) {
  const { user, can, checking, settings } = useStore()
  if (checking) return <Loading label="Abriendo tu sesión" />
  if (!user) return <Navigate to="/login" replace />
  if (perm && !can(perm)) return <Navigate to="/app" replace />
  if (feature && !features(settings)[feature]) return <Navigate to="/app" replace />
  return children
}

/** El médico titular de un consultorio nuevo empieza por el asistente de primer ingreso. */
function Home() {
  const { settings, can } = useStore()
  if (settings.kind === 'office' && can('settings.manage') && !settings.setupDoneAt) return <Navigate to="/app/bienvenida" replace />
  return <Dashboard />
}

export default function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/reservar" element={<Booking />} />
          <Route path="/reservar/:slug" element={<Booking />} />
          <Route path="/app" element={<Guard><AppShell /></Guard>}>
            <Route index element={<Home />} />
            <Route path="bienvenida" element={<Guard perm="settings.manage"><Onboarding /></Guard>} />
            <Route path="agenda" element={<Guard perm="agenda.view"><Agenda /></Guard>} />
            <Route path="consulta-externa" element={<Guard perm="agenda.view"><WaitingRoom /></Guard>} />
            <Route path="sala" element={<Navigate to="/app/consulta-externa" replace />} />
            <Route path="observacion" element={<Guard perm="inpatient.view" feature="observation"><Observation /></Guard>} />
            <Route path="observacion/:id" element={<Guard perm="inpatient.view" feature="observation"><InpatientFile key="observacion" /></Guard>} />
            <Route path="observacion/:id/expediente" element={<Guard perm="inpatient.view"><FullRecord /></Guard>} />
            <Route path="hospitalizados" element={<Guard perm="inpatient.view" feature="hospital"><Inpatients /></Guard>} />
            <Route path="hospitalizados/:id/expediente" element={<Guard perm="inpatient.view"><FullRecord /></Guard>} />
            <Route path="hospitalizados/:id" element={<Guard perm="inpatient.view"><InpatientFile key="hospitalizacion" /></Guard>} />
            <Route path="referencias/:id" element={<Guard perm="inpatient.view"><ReferralPage /></Guard>} />
            <Route path="autorizaciones/:id" element={<Guard perm="inpatient.view"><AuthorizationPage /></Guard>} />
            <Route path="seguimientos" element={<Guard perm="followups.view"><Followups /></Guard>} />
            <Route path="pacientes" element={<Guard perm="patients.view"><Patients /></Guard>} />
            <Route path="pacientes/:id" element={<Guard perm="patients.view"><PatientChart /></Guard>} />
            <Route path="consulta/:apptId" element={<Guard perm="consult.write"><Consultation /></Guard>} />
            <Route path="sets-de-ordenes" element={<Guard perm="consult.write"><OrderSetsPage /></Guard>} />
            <Route path="constancia/:id" element={<Guard perm="consult.write"><Certificate /></Guard>} />
            <Route path="constancias/:id" element={<Guard perm="chart.view"><CertificateView /></Guard>} />
            <Route path="nota/:id" element={<Guard perm="chart.view"><ConsultNote /></Guard>} />
            <Route path="recetas" element={<Guard perm="rx.view"><Prescriptions /></Guard>} />
            <Route path="recetas/:id" element={<Guard perm="rx.view"><PrescriptionSheet /></Guard>} />
            <Route path="caja" element={<Guard perm="billing.manage"><Billing /></Guard>} />
            <Route path="recibos/:id" element={<Guard perm="billing.manage"><ReceiptSheet /></Guard>} />
            <Route path="reportes" element={<Guard perm="reports.view"><Reports /></Guard>} />
            <Route path="personal" element={<Guard perm="staff.manage"><StaffPage /></Guard>} />
            <Route path="configuracion" element={<Guard perm="settings.manage"><Settings /></Guard>} />
            <Route path="cuenta" element={<Account />} />
            <Route path="plataforma" element={<Guard perm="platform.manage"><Platform /></Guard>} />
            <Route path="clinicas/:id" element={<Guard perm="platform.manage"><ClinicDetail /></Guard>} />
            <Route path="*" element={<NotFound inApp />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
        <Toaster />
      </BrowserRouter>
    </StoreProvider>
  )
}
