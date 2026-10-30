import { Fragment, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  BarChart3, BedDouble, BellRing, Building2, CalendarDays, ChevronDown, Eye, FilePen, House, LibraryBig, LogOut, Menu, Receipt, Search, Settings as SettingsIcon, SlidersHorizontal, Stethoscope, UserCog,
} from 'lucide-react'
import { Logo } from '../components/Logo'
import { Avatar } from '../components/ui'
import { SearchPalette } from '../components/Search'
import { Tour } from '../components/Tour'
import { useStore } from '../lib/store'
import { features, ROLE_LABEL, VIEW_LABEL, viewsOf, type Permission } from '../lib/permissions'
import { ViewSwitch } from '../components/ViewSwitch'
import { cap, localISODate, sameDay } from '../lib/format'
import { tourFor } from '../lib/tours'

const NAV: { to: string; label: string; icon: typeof House; perm?: Permission; end?: boolean; group?: string; doctor?: boolean }[] = [
  { to: '/app', label: 'Inicio', icon: House, end: true, perm: undefined },
  { to: '/app/agenda', label: 'Agenda', icon: CalendarDays, perm: 'agenda.view' },
  // MC7: el médico ve Recetas y Cobrar debajo de Agenda. Recetas sin consulta: renovar un tratamiento sin abrir una consulta completa
  { to: '/app/recetas', label: 'Recetas', icon: FilePen, perm: 'rx.write' },
  { to: '/app/caja', label: 'Caja', icon: Receipt, perm: 'billing.manage' },
  // Pacientes se divide en las tres áreas que pidió el médico, más los crónicos
  { to: '/app/consulta-externa', label: 'Consulta externa', icon: Stethoscope, perm: 'agenda.view', group: 'Pacientes' },
  { to: '/app/observacion', label: 'Observación', icon: Eye, perm: 'inpatient.view', group: 'Pacientes' },
  { to: '/app/hospitalizados', label: 'Hospitalizados', icon: BedDouble, perm: 'inpatient.view', group: 'Pacientes' },
  { to: '/app/pacientes', label: 'Biblioteca de pacientes', icon: LibraryBig, perm: 'patients.view', group: 'Pacientes' },
  { to: '/app/seguimientos', label: 'Crónicos y seguimientos', icon: BellRing, perm: 'followups.view', group: 'Pacientes' },
  { to: '/app/reportes', label: 'Reportes', icon: BarChart3, perm: 'reports.view', group: 'Administración' },
  { to: '/app/personal', label: 'Personal y roles', icon: UserCog, perm: 'staff.manage', group: 'Administración' },
  { to: '/app/configuracion', label: 'Configuración', icon: SettingsIcon, perm: 'settings.manage', group: 'Administración' },
  // MC6: la configuración propia del médico (firma, horario, vademécum, sets, preferencias)
  { to: '/app/mi-configuracion', label: 'Configuración', icon: SlidersHorizontal, perm: 'consult.write', doctor: true },
]

export default function AppShell() {
  const { user, can, signOut, appointments, followups, refresh, settings, pendingOrders = [], inpatients, finishTour } = useStore()
  const nav = useNavigate()
  const loc = useLocation()
  const [open, setOpen] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOpen(false), [loc.pathname])
  const [manualTour, setManualTour] = useState(false)
  const [tourClosed, setTourClosed] = useState(false)
  // Mi cuenta ofrece repetir el recorrido
  useEffect(() => {
    const start = () => { setTourClosed(false); setManualTour(true) }
    window.addEventListener('start-tour', start)
    return () => window.removeEventListener('start-tour', start)
  }, [])

  // La sala de espera cambia por acciones de otros: se sincroniza cada 30 segundos
  useEffect(() => {
    const t = setInterval(refresh, 30_000)
    return () => clearInterval(t)
  }, [refresh])

  if (!user) return null
  const today = new Date()
  const waiting = appointments.filter((a) => sameDay(a.start, today) && a.status === 'arrived').length
  const toCharge = appointments.filter((a) => a.status === 'done' && a.paid === false && sameDay(a.start, today)).length
  const due = followups.filter((f) => f.dueDate <= localISODate(today) && !f.notifiedAt).length
  // Enfermería: órdenes médicas nuevas sin revisar
  const newOrders = pendingOrders.reduce((s, x) => s + x.pending, 0)
  const inObservation = inpatients.filter((h) => h.kind === 'observation').length
  const platform = user.role === 'superadmin'
  // Recorrido de primer ingreso; el titular de un consultorio nuevo primero termina la configuración
  const touring = !tourClosed && (manualTour || (!user.prefs?.tourDoneAt && loc.pathname !== '/app/bienvenida'))
  const closeTour = () => { setTourClosed(true); setManualTour(false); if (!user.prefs?.tourDoneAt) finishTour() }
  const f = features(settings)
  // En un consultorio el médico titular también cobra y administra: "Administración" es "Mi consultorio". Enfermería
  // cobra desde un acceso discreto; el médico tiene «Cobrar» debajo de Recetas (MC7)
  const doctor = user.role === 'doctor'
  const quietBilling = !f.office && user.role === 'nurse'
  const items = platform
    ? [{ to: '/app', label: 'Clínicas y consultorios', icon: Building2, end: true }]
    : NAV.filter((n) => {
      if (n.perm && !can(n.perm)) return false
      if (n.to === '/app/hospitalizados' && !f.hospital) return false
      if (n.to === '/app/observacion' && !f.observation) return false
      // Enfermería entra al paciente: no usa la agenda. Médico y enfermería cobran, pero desde un acceso más discreto.
      if (user.role === 'nurse' && n.to === '/app/agenda') return false
      if (quietBilling && n.to === '/app/caja') return false
      if (n.doctor && !doctor) return false
      return true
    }).map((n) => (f.office && n.group === 'Administración'
      ? { ...n, group: 'Mi consultorio', label: n.to === '/app/personal' ? 'Asistentes' : n.to === '/app/configuracion' ? 'Configuración del consultorio' : n.label }
      : doctor && n.to === '/app/caja' ? { ...n, label: 'Cobrar' } : n))
    // MC7: Inicio → Agenda → Recetas → Cobrar → Pacientes → Configuración (y en el consultorio, lo administrativo al final)
    .sort((a, b) => navRank(a) - navRank(b))
  const label = today.toLocaleDateString('es-HN', { weekday: 'long', day: 'numeric', month: 'long' })
  // Contador de cada opción: lo que está esperando ahí (en rojo, lo que es una alerta)
  const badge = (to: string): { n: number; alert?: boolean; label: string } | null => {
    const b = to === '/app/consulta-externa' ? { n: waiting, label: `${waiting} en sala` }
      : to === '/app/seguimientos' ? { n: due, label: `${due} seguimientos vencidos o de hoy` }
        : to === '/app/caja' ? { n: toCharge, label: `${toCharge} por cobrar hoy` }
          : to === '/app/observacion' ? { n: inObservation, label: `${inObservation} en observación` }
            : to === '/app/hospitalizados' ? { n: newOrders, alert: true, label: `${newOrders} órdenes nuevas sin revisar` } : null
    return b && b.n > 0 ? b : null
  }
  // Grupos del menú en el orden en que aparecen; las opciones sin grupo van sueltas
  const blocks: { group?: string; items: typeof items }[] = []
  for (const n of items) {
    const g = 'group' in n ? n.group : undefined
    const last = blocks[blocks.length - 1]
    if (g && last?.group === g) last.items.push(n)
    else blocks.push({ group: g, items: [n] })
  }

  return (
    <div className="shell">
      <aside className={`side ${open || touring ? 'open' : ''}`} aria-label="Navegación principal">
        <div className="side__clinic">
          <Logo size={28} />
          <small>{platform ? 'Plataforma' : f.office ? 'Consultorio' : 'Clínica'}</small>
          <strong>{settings.name}</strong>
        </div>
        <nav>
          {blocks.map((b) => {
            const links = b.items.map((n) => {
              const c = badge(n.to)
              return (
                <NavLink key={n.to} to={n.to} end={'end' in n ? n.end : undefined} className="side__link" data-tour={`nav:${n.to}`}>
                  <n.icon size={18} strokeWidth={1.9} />
                  {n.label}
                  {c && <span className={`count${c.alert ? ' count--alert' : ''}`} aria-label={c.label}>{c.n}</span>}
                </NavLink>
              )
            })
            if (!b.group) return <Fragment key={b.items[0].to}>{links}</Fragment>
            return <NavGroup key={b.group} title={b.group} userId={user.id} paths={b.items.map((n) => n.to)} badges={b.items.map((n) => badge(n.to)).filter((x) => x !== null)} forceOpen={touring}>{links}</NavGroup>
          })}
          {quietBilling && can('billing.manage') && (
            <NavLink to="/app/caja" className="side__link side__link--quiet" data-tour="nav:/app/caja"><Receipt size={16} strokeWidth={1.9} />Cobrar</NavLink>
          )}
        </nav>
        <div className="side__user">
          <Link to="/app/cuenta" className="side__me" title="Mi cuenta" data-tour="me">
            <Avatar name={user.name} color={user.color} />
            <div>
              <strong>{user.name}</strong>
              <small>{viewsOf(user).length > 1 ? VIEW_LABEL[user.role] : ROLE_LABEL[user.role]}</small>
            </div>
          </Link>
          <button className="icon-btn" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={async () => { await signOut(); nav('/login') }}>
            <LogOut size={17} />
          </button>
        </div>
        {viewsOf(user).length > 1 && <div className="side__views"><ViewSwitch compact /></div>}
      </aside>
      {open && <div className="side__scrim" onClick={() => setOpen(false)} aria-hidden="true" />}

      <div className="main">
        <div className="topbar">
          <button className="icon-btn topbar__menu" aria-label="Abrir menú" onClick={() => setOpen((o) => !o)}><Menu size={20} /></button>
          <span className="topbar__date">{cap(label)}</span>
          {!platform && can('patients.view') && (
            <button className="search-btn" data-tour="search" onClick={() => window.dispatchEvent(new Event('open-search'))}>
              <Search size={16} /><span>Buscar paciente</span><kbd>Ctrl K</kbd>
            </button>
          )}
        </div>
        <Outlet />
      </div>
      <SearchPalette />
      {touring && <Tour steps={tourFor(user.role, settings.kind ?? 'clinic', { observationEnabled: settings.observationEnabled })} onClose={closeTour} />}
    </div>
  )
}

/** Orden del menú: lo suelto de arriba, los grupos y al final la configuración del médico y la administración. */
function navRank(n: { to: string; group?: string }) {
  if (n.to === '/app/mi-configuracion') return 30
  if (n.group === 'Pacientes') return 20
  if (n.group) return 40
  return 10
}

/**
 * Grupo desplegable del menú ("Pacientes", "Mi consultorio", "Administración"). Se abre o se cierra al tocar el
 * título; si la página actual está dentro, aparece abierto. Cada usuario deja cada grupo como quiere y se recuerda
 * en este navegador. Cerrado, los contadores de sus opciones se suman junto al título para no perder las alertas.
 */
function NavGroup({ title, userId, paths, badges, forceOpen, children }: {
  title: string; userId: string; paths: string[]; badges: { n: number; alert?: boolean }[]; forceOpen?: boolean; children: React.ReactNode
}) {
  const loc = useLocation()
  const key = `clinara.menu.${userId}.${title}`
  const inside = paths.some((p) => loc.pathname === p || loc.pathname.startsWith(`${p}/`))
  const [open, setOpen] = useState(() => {
    if (inside) return true
    try { const v = localStorage.getItem(key); if (v === '0') return false } catch { /* sin almacenamiento */ }
    return true
  })
  // Si se navega a una página del grupo (por ejemplo, desde el buscador), el grupo se abre
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (inside) setOpen(true) }, [inside])
  const toggle = () => {
    const next = !open
    setOpen(next)
    try { localStorage.setItem(key, next ? '1' : '0') } catch { /* sin almacenamiento */ }
  }
  // Durante el recorrido todos los grupos se ven, para poder señalar sus opciones
  const shown = open || !!forceOpen
  const total = badges.reduce((s, b) => s + b.n, 0)
  const id = `nav-${title.toLowerCase().normalize('NFD').replace(/[^a-z]+/g, '-')}`
  return (
    <div className={`side__grp${shown ? ' is-open' : ''}`}>
      <button type="button" className="side__group side__group--btn" aria-expanded={shown} aria-controls={id} onClick={toggle}>
        <span>{title}</span>
        {!shown && total > 0 && <span className={`count${badges.some((b) => b.alert) ? ' count--alert' : ''}`} aria-label={`${total} pendientes en ${title}`}>{total}</span>}
        <ChevronDown size={15} className="side__chev" aria-hidden="true" />
      </button>
      <div className="side__grp-body" id={id} inert={!shown}>
        <div>{children}</div>
      </div>
    </div>
  )
}
