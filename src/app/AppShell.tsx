import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { CalendarDays, FileText, House, LogOut, Menu, Armchair, Users, UserCog } from 'lucide-react'
import { Logo } from '../components/Logo'
import { Avatar } from '../components/ui'
import { useStore } from '../lib/store'
import { ROLE_LABEL, type Permission } from '../lib/permissions'
import { CLINIC } from '../lib/seed'
import { cap, sameDay } from '../lib/format'

const NAV: { to: string; label: string; icon: typeof House; perm?: Permission; end?: boolean }[] = [
  { to: '/app', label: 'Inicio', icon: House, end: true },
  { to: '/app/agenda', label: 'Agenda', icon: CalendarDays, perm: 'agenda.view' },
  { to: '/app/sala', label: 'Sala de espera', icon: Armchair, perm: 'checkin.manage' },
  { to: '/app/pacientes', label: 'Pacientes', icon: Users, perm: 'patients.view' },
  { to: '/app/recetas', label: 'Recetas', icon: FileText, perm: 'rx.view' },
  { to: '/app/personal', label: 'Personal y roles', icon: UserCog, perm: 'staff.manage' },
]

export default function AppShell() {
  const { user, can, signOut, appointments } = useStore()
  const nav = useNavigate()
  const loc = useLocation()
  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(false), [loc.pathname])

  if (!user) return null
  const waiting = appointments.filter((a) => sameDay(a.start, new Date()) && a.status === 'arrived').length
  const today = new Date().toLocaleDateString('es-HN', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="shell">
      <aside className={`side ${open ? 'open' : ''}`} aria-label="Navegación principal">
        <div className="side__clinic">
          <Logo size={28} />
          <small>Clínica</small>
          <strong>{CLINIC.name}</strong>
        </div>
        <nav>
          {NAV.filter((n) => !n.perm || can(n.perm)).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className="side__link">
              <n.icon size={18} strokeWidth={1.9} />
              {n.label}
              {n.to === '/app/sala' && waiting > 0 && <span className="count" aria-label={`${waiting} en sala`}>{waiting}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="side__user">
          <Avatar name={user.name} color={user.color} />
          <div>
            <strong>{user.name}</strong>
            <small>{ROLE_LABEL[user.role]}</small>
          </div>
          <button className="icon-btn" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={() => { signOut(); nav('/login') }}>
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <button className="icon-btn topbar__menu" aria-label="Abrir menú" onClick={() => setOpen((o) => !o)}><Menu size={20} /></button>
          <span style={{ color: 'var(--muted)', fontSize: 14 }}>{cap(today)}</span>
        </div>
        <Outlet />
      </div>
    </div>
  )
}
