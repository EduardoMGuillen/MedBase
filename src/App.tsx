import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { StoreProvider, useStore } from './lib/store'
import type { Permission } from './lib/permissions'
import { Loading, Toaster } from './components/ui'
import Landing from './pages/Landing'
import Login from './pages/Login'
import AppShell from './app/AppShell'
import Dashboard from './app/Dashboard'
import Agenda from './app/Agenda'
import WaitingRoom from './app/WaitingRoom'
import Patients from './app/Patients'
import PatientChart from './app/PatientChart'
import Consultation from './app/Consultation'
import Prescriptions, { PrescriptionSheet } from './app/Prescriptions'
import StaffPage from './app/Staff'

function Guard({ perm, children }: { perm?: Permission; children: ReactNode }) {
  const { user, can, checking } = useStore()
  if (checking) return <Loading label="Abriendo tu sesión" />
  if (!user) return <Navigate to="/login" replace />
  if (perm && !can(perm)) return <Navigate to="/app" replace />
  return children
}

export default function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/app" element={<Guard><AppShell /></Guard>}>
            <Route index element={<Dashboard />} />
            <Route path="agenda" element={<Guard perm="agenda.view"><Agenda /></Guard>} />
            <Route path="sala" element={<Guard perm="checkin.manage"><WaitingRoom /></Guard>} />
            <Route path="pacientes" element={<Guard perm="patients.view"><Patients /></Guard>} />
            <Route path="pacientes/:id" element={<Guard perm="patients.view"><PatientChart /></Guard>} />
            <Route path="consulta/:apptId" element={<Guard perm="consult.write"><Consultation /></Guard>} />
            <Route path="recetas" element={<Guard perm="rx.view"><Prescriptions /></Guard>} />
            <Route path="recetas/:id" element={<Guard perm="rx.view"><PrescriptionSheet /></Guard>} />
            <Route path="personal" element={<Guard perm="staff.manage"><StaffPage /></Guard>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster />
      </BrowserRouter>
    </StoreProvider>
  )
}
