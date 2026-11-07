import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { StoreProvider, useStore } from './lib/store'
import { features, hasRole, roleWith, type Permission } from './lib/permissions'
import { SwitchViewOffer, ViewSwitch } from './components/ViewSwitch'
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
import Consultation from './app/Consultation'
import Prescriptions, { PrescriptionSheet } from './app/Prescriptions'
import Certificate, { CertificateView } from './app/Certificate'
import ConsultNote from './app/ConsultNote'
import Billing, { ReceiptSheet } from './app/Billing'
import Reports from './app/Reports'
import Settings from './app/Settings'
import StaffPage from './app/Staff'
import MyConfig from './app/MyConfig'
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
import EpicrisisPage from './app/Epicrisis'
import ExamOrderPage from './app/ExamOrder'
import PrintJobPage from './app/PrintJob'
import AnesthesiaSheetPage, { AnesthesiaBlankPage } from './app/AnesthesiaDoc'
import AnesthesiaFormPage from './app/AnesthesiaForm'
import PreEvalPage, { PreEvalBlankPage } from './app/PreEvalDoc'
import PreEvalFormPage from './app/PreEvalForm'
import DeptTray, { AREA_SLUG } from './app/DeptTray'
import DeptHome from './app/DeptHome'
import { ChartOrDept, DeptConfig, DeptOnly, DeptRosterPage } from './app/DeptPages'
import SupplyCatalogPage from './app/SupplyCatalog'
import UsagePage from './app/Usage'

/** Entra sólo con sesión, con el permiso y, si se pide, con el módulo activo en la cuenta (un consultorio no tiene hospitalización). */
function Guard({ perm, feature, children }: { perm?: Permission; feature?: 'hospital' | 'observation'; children: ReactNode }) {
  const { user, can, checking, settings } = useStore()
  if (checking) return <Loading label="Abriendo tu sesión" />
  if (!user) return <Navigate to="/login" replace />
  // AD5: la pantalla es de otro de sus roles: se ofrece cambiar de vista
  // DP4 (ronda 11): una dirección a la que el rol no tiene acceso dice «Sin permiso» (el servidor también la bloquea)
  if (perm && !can(perm)) return roleWith(user, perm, settings.kind) ? <SwitchViewOffer perm={perm} /> : <NoPermission />
  if (feature && !features(settings)[feature]) return <Navigate to="/app" replace />
  return children
}

/** El médico titular de un consultorio nuevo empieza por el asistente de primer ingreso. */
function Home() {
  const { settings, can, user } = useStore()
  // MI1: el titular configura su consultorio en la vista de administrador (si está en la de médico, se le ofrece cambiar)
  if (settings.kind === 'office' && (can('settings.manage') || (user && hasRole(user, 'admin'))) && !settings.setupDoneAt) return <Navigate to="/app/bienvenida" replace />
  // LB5 e IM1 (ronda 12): Laboratorio e Imágenes empiezan en su Inicio, con las alarmas de los internados
  if (user?.role === 'lab' || user?.role === 'imaging') return <DeptHome />
  // AD5: quien tiene varios roles elige aquí su vista
  return <><div className="view-bar"><ViewSwitch /></div><Dashboard /></>
}

function NoPermission() {
  return <div className="page"><section className="panel"><div className="empty"><b>Sin permiso.</b> Tu rol no tiene acceso a esta pantalla. <a href="/app">Volver al inicio</a></div></section></div>
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
            {/* DP (ronda 11): departamentos de Laboratorio e Imágenes */}
            <Route path="laboratorio" element={<Guard perm="dept.work"><DeptOnly dept="lab"><DeptTray group="lab" /></DeptOnly></Guard>} />
            <Route path="imagenes" element={<Guard perm="dept.work"><DeptOnly dept="imaging"><DeptTray group="imaging" /></DeptOnly></Guard>} />
            {/* LB5 e IM1 (ronda 12): la bandeja por área */}
            {(['lab', 'imaging'] as const).flatMap((g) => (['outpatient', 'observation', 'hospital'] as const).map((a) => (
              <Route key={`${g}-${a}`} path={`${g === 'lab' ? 'laboratorio' : 'imagenes'}/${AREA_SLUG[a]}`} element={<Guard perm="dept.work"><DeptOnly dept={g}><DeptTray key={a} group={g} area={a} /></DeptOnly></Guard>} />)))}
            <Route path="configuracion-laboratorio" element={<Guard perm="dept.work"><DeptOnly dept="lab"><DeptConfig group="lab" /></DeptOnly></Guard>} />
            <Route path="configuracion-imagenes" element={<Guard perm="dept.work"><DeptOnly dept="imaging"><DeptConfig group="imaging" /></DeptOnly></Guard>} />
            <Route path="rol-de-turnos" element={<Guard perm="dept.work"><DeptRosterPage /></Guard>} />
            <Route path="agenda" element={<Guard perm="agenda.view"><Agenda /></Guard>} />
            <Route path="consulta-externa" element={<Guard perm="agenda.view"><WaitingRoom /></Guard>} />
            <Route path="sala" element={<Navigate to="/app/consulta-externa" replace />} />
            <Route path="observacion" element={<Guard perm="inpatient.view" feature="observation"><Observation /></Guard>} />
            <Route path="observacion/:id" element={<Guard perm="inpatient.view" feature="observation"><InpatientFile key="observacion" /></Guard>} />
            <Route path="observacion/:id/expediente" element={<Guard perm="inpatient.view"><FullRecord /></Guard>} />
            <Route path="hospitalizados" element={<Guard perm="inpatient.view" feature="hospital"><Inpatients /></Guard>} />
            <Route path="hospitalizados/:id/expediente" element={<Guard perm="inpatient.view"><FullRecord /></Guard>} />
            <Route path="hospitalizados/:id" element={<Guard perm="inpatient.view"><InpatientFile key="hospitalizacion" /></Guard>} />
            <Route path="referencias/:id" element={<Guard perm="chart.view"><ReferralPage /></Guard>} />
            <Route path="autorizaciones/:id" element={<Guard perm="inpatient.view"><AuthorizationPage /></Guard>} />
            <Route path="epicrisis/:id" element={<Guard perm="inpatient.view"><EpicrisisPage /></Guard>} />
            <Route path="seguimientos" element={<Guard perm="followups.view"><Followups /></Guard>} />
            <Route path="pacientes" element={<Guard perm="patients.view"><Patients /></Guard>} />
            <Route path="pacientes/:id" element={<Guard perm="patients.view"><ChartOrDept /></Guard>} />
            <Route path="consulta/:apptId" element={<Guard perm="consult.write"><Consultation /></Guard>} />
            <Route path="sets-de-ordenes" element={<Guard perm="consult.write"><OrderSetsPage /></Guard>} />
            <Route path="constancia/:id" element={<Guard perm="consult.write"><Certificate /></Guard>} />
            <Route path="constancias/:id" element={<Guard perm="chart.view"><CertificateView /></Guard>} />
            <Route path="nota/:id" element={<Guard perm="chart.view"><ConsultNote /></Guard>} />
            <Route path="examenes/orden/:batch" element={<Guard perm="chart.view"><ExamOrderPage /></Guard>} />
            {/* EX5 y ME10 (ronda 10): órdenes de los pendientes y recetas de lo que no hay en la clínica */}
            <Route path="impresion/:id" element={<Guard perm="chart.view"><PrintJobPage /></Guard>} />
            {/* PQ3 (ronda 14): hoja de anestesia (en blanco, llenar en el sistema, ver e imprimir); el servidor comprueba el resto */}
            <Route path="anestesia/blanco/:stayId" element={<Guard perm="chart.view"><AnesthesiaBlankPage /></Guard>} />
            <Route path="anestesia/nota/:noteId" element={<Guard perm="chart.view"><AnesthesiaFormPage /></Guard>} />
            <Route path="anestesia/:id" element={<Guard perm="chart.view"><AnesthesiaSheetPage /></Guard>} />
            {/* PQ4 y PQ5 (ronda 16): valoración preanestésica y recuento quirúrgico (el servidor comprueba los permisos) */}
            <Route path="valoracion/blanco/:stayId" element={<Guard perm="chart.view"><PreEvalBlankPage /></Guard>} />
            <Route path="valoracion/nueva/:stayId" element={<Guard perm="chart.view"><PreEvalFormPage /></Guard>} />
            <Route path="valoracion/:id" element={<Guard perm="chart.view"><PreEvalPage /></Guard>} />
            <Route path="recetas" element={<Guard perm="rx.view"><Prescriptions /></Guard>} />
            <Route path="recetas/:id" element={<Guard perm="rx.view"><PrescriptionSheet /></Guard>} />
            <Route path="caja" element={<Guard perm="billing.manage"><Billing /></Guard>} />
            <Route path="recibos/:id" element={<Guard perm="billing.manage"><ReceiptSheet /></Guard>} />
            <Route path="reportes" element={<Guard perm="reports.view"><Reports /></Guard>} />
            <Route path="personal" element={<Guard perm="staff.manage"><StaffPage /></Guard>} />
            <Route path="configuracion" element={<Guard perm="settings.manage"><Settings /></Guard>} />
            {/* RU1 (ronda 14): el catálogo de material y la lista de turno, para quien no entra a Configuración (Enfermería) */}
            <Route path="material-medico-quirurgico" element={<Guard perm="supplies.view"><SupplyCatalogPage /></Guard>} />
            {/* RU2 (ronda 14): registro de uso de medicamentos y material (Enfermería, Recepción y Administración) */}
            <Route path="uso-medicamentos-material" element={<Guard perm="usage.view"><UsagePage /></Guard>} />
            <Route path="cuenta" element={<MyConfig />} />
            <Route path="mi-configuracion" element={<MyConfig />} />
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
