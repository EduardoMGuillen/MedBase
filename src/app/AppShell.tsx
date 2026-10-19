import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { CalendarDays, FileText, House, KeyRound, LogOut, Menu, Armchair, Users, UserCog } from 'lucide-react'
import { Logo } from '../components/Logo'
import { Avatar, Modal } from '../components/ui'
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
  const { user, can, signOut, appointments, refresh } = useStore()
  const nav = useNavigate()
  const loc = useLocation()
  const [open, setOpen] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOpen(false), [loc.pathname])

  // La sala de espera cambia por acciones de otros: se sincroniza cada 30 segundos
  useEffect(() => {
    const t = setInterval(refresh, 30_000)
    return () => clearInterval(t)
  }, [refresh])

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
          <button className="icon-btn" aria-label="Cambiar contraseña" title="Cambiar contraseña" onClick={() => setPwOpen(true)}>
            <KeyRound size={17} />
          </button>
          <button className="icon-btn" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={async () => { await signOut(); nav('/login') }}>
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
      {pwOpen && <ChangePassword onClose={() => setPwOpen(false)} />}
    </div>
  )
}

function ChangePassword({ onClose }: { onClose: () => void }) {
  const { changePassword } = useStore()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const mismatch = repeat.length > 0 && next !== repeat
  const valid = current && next.length >= 8 && next === repeat
  return (
    <Modal title="Cambiar contraseña" onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!valid} onClick={async () => { if (await changePassword(current, next)) onClose() }}>Cambiar contraseña</button>
    </>}>
      <label className="field"><span>Contraseña actual</span><input className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></label>
      <label className="field"><span>Nueva contraseña, mínimo 8 caracteres</span><input className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></label>
      <label className="field"><span>Repite la nueva contraseña</span><input className="input" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} aria-invalid={mismatch} /></label>
      {mismatch && <p style={{ color: 'var(--red-ink)', fontSize: 13.5 }}>Las contraseñas no coinciden.</p>}
    </Modal>
  )
}
