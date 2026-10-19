import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Armchair, BarChart3, CalendarDays, FileText, House, LogOut, Menu, Receipt, Search, Settings as SettingsIcon, UserCog, Users,
} from 'lucide-react'
import { Logo } from '../components/Logo'
import { Avatar } from '../components/ui'
import { SearchPalette } from '../components/Search'
import { useStore } from '../lib/store'
import { ROLE_LABEL, type Permission } from '../lib/permissions'
import { cap, sameDay } from '../lib/format'

const NAV: { to: string; label: string; icon: typeof House; perm?: Permission; end?: boolean; group?: string }[] = [
  { to: '/app', label: 'Inicio', icon: House, end: true },
  { to: '/app/agenda', label: 'Agenda', icon: CalendarDays, perm: 'agenda.view' },
  { to: '/app/sala', label: 'Sala de espera', icon: Armchair, perm: 'checkin.manage' },
  { to: '/app/pacientes', label: 'Pacientes', icon: Users, perm: 'patients.view' },
  { to: '/app/recetas', label: 'Recetas', icon: FileText, perm: 'rx.view' },
  { to: '/app/caja', label: 'Caja', icon: Receipt, perm: 'billing.manage' },
  { to: '/app/reportes', label: 'Reportes', icon: BarChart3, perm: 'reports.view', group: 'Administración' },
  { to: '/app/personal', label: 'Personal y roles', icon: UserCog, perm: 'staff.manage', group: 'Administración' },
  { to: '/app/configuracion', label: 'Configuración', icon: SettingsIcon, perm: 'settings.manage', group: 'Administración' },
]

export default function AppShell() {
  const { user, can, signOut, appointments, refresh, settings } = useStore()
  const nav = useNavigate()
  const loc = useLocation()
  const [open, setOpen] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOpen(false), [loc.pathname])

  // La sala de espera cambia por acciones de otros: se sincroniza cada 30 segundos
  useEffect(() => {
    const t = setInterval(refresh, 30_000)
    return () => clearInterval(t)
  }, [refresh])

  if (!user) return null
  const today = new Date()
  const waiting = appointments.filter((a) => sameDay(a.start, today) && a.status === 'arrived').length
  const toCharge = appointments.filter((a) => a.status === 'done' && a.paid === false && sameDay(a.start, today)).length
  const items = NAV.filter((n) => !n.perm || can(n.perm))
  const label = today.toLocaleDateString('es-HN', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="shell">
      <aside className={`side ${open ? 'open' : ''}`} aria-label="Navegación principal">
        <div className="side__clinic">
          <Logo size={28} />
          <small>Clínica</small>
          <strong>{settings.name}</strong>
        </div>
        <nav>
          {items.map((n, i) => (
            <div key={n.to} style={{ display: 'contents' }}>
              {n.group && items[i - 1]?.group !== n.group && <span className="side__group">{n.group}</span>}
              <NavLink to={n.to} end={n.end} className="side__link">
                <n.icon size={18} strokeWidth={1.9} />
                {n.label}
                {n.to === '/app/sala' && waiting > 0 && <span className="count" aria-label={`${waiting} en sala`}>{waiting}</span>}
                {n.to === '/app/caja' && toCharge > 0 && <span className="count" aria-label={`${toCharge} por cobrar hoy`}>{toCharge}</span>}
              </NavLink>
            </div>
          ))}
        </nav>
        <div className="side__user">
          <Link to="/app/cuenta" className="side__me" title="Mi cuenta">
            <Avatar name={user.name} color={user.color} />
            <div>
              <strong>{user.name}</strong>
              <small>{ROLE_LABEL[user.role]}</small>
            </div>
          </Link>
          <button className="icon-btn" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={async () => { await signOut(); nav('/login') }}>
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      {open && <div className="side__scrim" onClick={() => setOpen(false)} aria-hidden="true" />}

      <div className="main">
        <div className="topbar">
          <button className="icon-btn topbar__menu" aria-label="Abrir menú" onClick={() => setOpen((o) => !o)}><Menu size={20} /></button>
          <span className="topbar__date">{cap(label)}</span>
          {can('patients.view') && (
            <button className="search-btn" onClick={() => window.dispatchEvent(new Event('open-search'))}>
              <Search size={16} /><span>Buscar paciente</span><kbd>Ctrl K</kbd>
            </button>
          )}
        </div>
        <Outlet />
      </div>
      <SearchPalette />
    </div>
  )
}
