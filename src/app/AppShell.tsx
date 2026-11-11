import { Fragment, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  BarChart3, BedDouble, BellRing, Building2, CalendarClock, CalendarDays, ChevronDown, ClipboardList, CircleHelp, Compass, Eye, FilePen, FlaskConical, ScanLine, TestTubes, House, LibraryBig, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Receipt, Search, Settings as SettingsIcon, SlidersHorizontal, Stethoscope, UserCog,
} from 'lucide-react'
import { Logo } from '../components/Logo'
import { Avatar } from '../components/ui'
import { SearchPalette } from '../components/Search'
import { Tour, TourResume, type TourEnd } from '../components/Tour'
import { useStore } from '../lib/store'
import { features, PERMISSIONS, type Permission } from '../lib/permissions'
import { sidebarFor } from '../lib/nav'
import { RoleMenu } from '../components/ViewSwitch'
import { cap, localISODate, sameDay } from '../lib/format'
import { miniTourFor, tourFor, tourKey, type TourCtx, type TourStep } from '../lib/tours'
import { stayPath } from '../lib/inpatient'
import { ADMISSION_PENDING_TEXT, myPendingAdmissions } from '../lib/alerts'
import { api } from '../lib/api'
import { RAIL_QUERY, useMedia } from '../lib/hooks'

/**
 * PF2 (ronda 17): la barra lateral (entradas, grupos, orden y quién ve qué) vive en lib/nav.ts, la misma regla que usan las pruebas;
 * aquí solo el ícono de cada ruta.
 */
const ICONS: Record<string, typeof House> = {
  '/app': House, '/app/agenda': CalendarDays, '/app/recetas': FilePen, '/app/caja': Receipt,
  '/app/consulta-externa': Stethoscope, '/app/observacion': Eye, '/app/hospitalizados': BedDouble, '/app/pacientes': LibraryBig, '/app/seguimientos': BellRing,
  '/app/pacientes-ambulatorios': FlaskConical, '/app/laboratorio': TestTubes, '/app/imagenes': ScanLine,
  '/app/laboratorio/ambulatorio': Stethoscope, '/app/laboratorio/observacion': Eye, '/app/laboratorio/hospitalizacion': BedDouble,
  '/app/imagenes/ambulatorio': Stethoscope, '/app/imagenes/observacion': Eye, '/app/imagenes/hospitalizacion': BedDouble,
  '/app/configuracion-laboratorio': SlidersHorizontal, '/app/configuracion-imagenes': SlidersHorizontal,
  '/app/uso-medicamentos-material': ClipboardList, '/app/rol-de-turnos-enfermeria': CalendarClock, '/app/rol-de-turnos': CalendarClock,
  '/app/reportes': BarChart3, '/app/personal': UserCog, '/app/configuracion': SettingsIcon,
}

export default function AppShell() {
  const { user, can, signOut, appointments, followups, refresh, settings, pendingOrders = [], inpatients, stays: activeStays, saveTour } = useStore()
  const nav = useNavigate()
  const loc = useLocation()
  const [open, setOpen] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOpen(false), [loc.pathname])
  // RG1: recorrido del rol activo (o mini-recorrido de la pantalla), «¿continuar?», menú del teléfono y el «?»
  const [tour, setTour] = useState<{ steps: TourStep[]; start: number; mini?: string } | null>(null)
  const [resume, setResume] = useState<number | null>(null)
  const [tourMenu, setTourMenu] = useState(false)
  const [help, setHelp] = useState(false)
  const key = user ? tourKey(user.role, settings.kind ?? 'clinic') : ''
  const steps = user ? tourFor(user.role, settings.kind ?? 'clinic', { observationEnabled: settings.observationEnabled }) : []
  const saved = user?.prefs?.tours?.[key]
  const startMain = (manual: boolean) => {
    setHelp(false)
    if (saved?.state === 'paused' && saved.step > 0) setResume(saved.step)
    else if (manual || !saved) setTour({ steps, start: 0 })
  }
  // Sola la primera vez con este rol (o, si lo dejó a la mitad, la pregunta de continuar), una vez por sesión
  useEffect(() => {
    if (!user || !key || loc.pathname === '/app/bienvenida' || (!saved && user.prefs?.tourDoneAt)) return
    if (saved && saved.state !== 'paused') return
    const flag = `clinara.recorrido.${user.id}.${key}`
    try { if (sessionStorage.getItem(flag)) return; sessionStorage.setItem(flag, '1') } catch { /* sin almacenamiento */ }
    startMain(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, key])
  // Mi configuración también ofrece «Ver el recorrido»
  useEffect(() => {
    const start = () => startMain(true)
    window.addEventListener('start-tour', start)
    return () => window.removeEventListener('start-tour', start)
  })
  const endTour = (end: TourEnd, step: number) => {
    if (!tour?.mini) saveTour(key, end, step)
    setTour(null)
    setTourMenu(false)
  }
  const mini = miniTourFor(loc.pathname, (t) => !!document.querySelector(`[data-tour="${t}"]`))
  // Pacientes de la demo para los pasos que los necesitan: un hospitalizado (o en observación) y la nota que lo ingresó
  // (de preferencia uno con órdenes sin revisar: así enfermería ve sus alertas y el checklist)
  const flagged = new Set(pendingOrders.map((x) => x.hospitalizationId))
  const stays = [...inpatients].sort((a, b) => Number(flagged.has(b.id)) - Number(flagged.has(a.id)) || Number(b.kind === 'hospital') - Number(a.kind === 'hospital'))
  const withNote = stays.find((h) => h.consultationId)
  const ctx: TourCtx = { stay: stays[0] ? stayPath(stays[0]) : undefined, consultNote: withNote ? `/app/nota/${withNote.consultationId}` : undefined }

  // DP2 (ronda 11): el conteo de la bandeja del departamento, sin recargar. Ronda 12: por área, con los urgentes en rojo
  type AreaCount = { n: number; urgent: number }
  const [deptCount, setDeptCount] = useState<Record<string, AreaCount>>({})
  useEffect(() => {
    if (user?.role !== 'lab' && user?.role !== 'imaging') return
    const get = () => api<{ n: number; areas?: Record<string, AreaCount> }>('/dept/count').then((r) => setDeptCount(r.areas ?? {})).catch(() => {})
    void get()
    const t = setInterval(get, 20_000)
    return () => clearInterval(t)
  }, [user?.role])
  // La sala de espera cambia por acciones de otros: se sincroniza cada 30 segundos
  useEffect(() => {
    const t = setInterval(refresh, 30_000)
    return () => clearInterval(t)
  }, [refresh])

  // TB (ronda 17): en tablet la barra es una franja de íconos; abierta (open) se despliega encima del contenido
  const rail = useMedia(RAIL_QUERY)

  if (!user) return null
  const today = new Date()
  const waiting = appointments.filter((a) => sameDay(a.start, today) && a.status === 'arrived').length
  const due = followups.filter((f) => f.dueDate <= localISODate(today) && !f.notifiedAt).length
  // Enfermería: órdenes médicas nuevas sin revisar
  const newOrders = pendingOrders.reduce((s, x) => s + x.pending, 0)
  // AD1 (ronda 17): con `stays` (todos los roles), así administración también ve el contador sin el expediente
  const inObservation = (activeStays ?? inpatients).filter((h) => h.kind === 'observation').length
  // HO2 (ronda 16): al médico tratante, sus ingresos con órdenes pendientes (en rojo, en Hospitalizados)
  const myAdmissions = myPendingAdmissions(inpatients, user.id).length
  const platform = user.role === 'superadmin'
  const touring = !!tour
  const f = features(settings)
  // En un consultorio el médico titular también cobra y administra: "Administración" es "Mi consultorio". El médico tiene
  // «Cobrar» debajo de Recetas (MC7). Enfermería ya no cobra (AD9).
  const doctor = user.role === 'doctor'
  // PF2 (ronda 17): Inicio, Agenda, Recetas y Caja; Pacientes; Laboratorio e imágenes; Registros; Administración (o Mi consultorio)
  const items = (platform ? [{ to: '/app', label: 'Clínicas y consultorios', end: true }]
    : sidebarFor({ role: user.role, kind: settings.kind ?? 'clinic', observationEnabled: settings.observationEnabled, permissions: (Object.keys(PERMISSIONS) as Permission[]).filter((p) => can(p)) })
  ).map((n) => ({ ...n, icon: platform ? Building2 : ICONS[n.to] ?? House }))
  const label = today.toLocaleDateString('es-HN', { weekday: 'long', day: 'numeric', month: 'long' })
  // Contador de cada opción: lo que está esperando ahí (en rojo, lo que es una alerta)
  const badge = (to: string): { n: number; alert?: boolean; label: string } | null => {
    const b = to === '/app/consulta-externa' ? { n: waiting, label: `${waiting} en sala` }
      : to === '/app/seguimientos' ? { n: due, label: `${due} seguimientos vencidos o de hoy` }
          : to === '/app/observacion' ? { n: inObservation, label: `${inObservation} en observación` }
            : to === '/app/hospitalizados' ? (doctor && myAdmissions ? { n: myAdmissions, alert: true, label: `${myAdmissions} ${ADMISSION_PENDING_TEXT.toLowerCase()}` } : { n: newOrders, alert: true, label: `${newOrders} órdenes nuevas sin revisar` })
              : /^\/app\/(laboratorio|imagenes)\//.test(to) ? deptBadge(deptCount[to.endsWith('ambulatorio') ? 'outpatient' : to.endsWith('observacion') ? 'observation' : 'hospital']) : null
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
      <aside className={`side ${open || tourMenu ? 'open' : ''}`} aria-label="Navegación principal">
        <button type="button" className="icon-btn side__toggle" aria-label={open ? 'Cerrar el menú' : 'Abrir el menú'} aria-expanded={open} title={open ? 'Cerrar el menú' : 'Abrir el menú'}
          onClick={() => setOpen((o) => !o)}>{open ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}</button>
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
                <NavLink key={n.to} to={n.to} end={'end' in n ? n.end : undefined} className="side__link" data-tour={`nav:${n.to}`} title={rail && !open ? n.label : undefined}>
                  <n.icon size={18} strokeWidth={1.9} />
                  <span className="side__label">{n.label}</span>
                  {c && <span className={`count${c.alert ? ' count--alert' : ''}`} aria-label={c.label}>{c.n}</span>}
                </NavLink>
              )
            })
            if (!b.group) return <Fragment key={b.items[0].to}>{links}</Fragment>
            // RU6 (ronda 15): «Registros» es un encabezado fijo (no se contrae); si el rol no tiene ninguna entrada, no aparece
            if (STATIC_GROUPS.has(b.group)) return <div key={b.group} className="side__grp side__grp--static" role="group" aria-label={b.group}><div className="side__group">{b.group}</div><div className="side__grp-list">{links}</div></div>
            return <NavGroup key={b.group} title={b.group} userId={user.id} paths={b.items.map((n) => n.to)} badges={b.items.map((n) => badge(n.to)).filter((x) => x !== null)} forceOpen={touring || (rail && !open)}>{links}</NavGroup>
          })}
        </nav>
        {/* Ronda 8: la configuración de cada persona (firma, horario, preferencias, seguridad), con su tuerca, justo encima del
            perfil. El perfil ya no es un botón: sólo dice quién entró y con qué vista. */}
        <NavLink to="/app/mi-configuracion" className="side__link side__config" data-tour="nav:/app/mi-configuracion" title={rail && !open ? 'Configuración' : undefined}>
          <SettingsIcon size={18} strokeWidth={1.9} /><span className="side__label">Configuración</span>
        </NavLink>
        <div className="side__user">
          <div className="side__me" data-tour="me">
            <Avatar name={user.name} color={user.color} />
            <div>
              <strong>{user.name}</strong>
              {/* GE2 (ronda 8): sólo el nombre del rol; con varios roles, una flecha propia abre la lista para cambiar */}
              <RoleMenu onSwitched={() => setOpen(false)} />
            </div>
          </div>
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
          {!platform && can('patients.view') && (
            <button className="search-btn" data-tour="search" onClick={() => window.dispatchEvent(new Event('open-search'))}>
              <Search size={16} /><span>Buscar paciente</span><kbd>Ctrl K</kbd>
            </button>
          )}
          <div className="help-menu">
            <button className="icon-btn" data-tour="help" aria-label="Ayuda: ver el recorrido" title="Ver el recorrido" aria-expanded={help}
              onClick={() => (mini ? setHelp(!help) : startMain(true))}><CircleHelp size={20} /></button>
            {help && mini && (
              <div className="help-menu__pop" role="menu">
                <button role="menuitem" onClick={() => { setHelp(false); setTour({ steps: mini.steps, start: 0, mini: mini.title }) }}><CircleHelp size={15} />{mini.title}</button>
                <button role="menuitem" onClick={() => startMain(true)}><Compass size={15} />Ver el recorrido completo</button>
              </div>
            )}
          </div>
        </div>
        <Outlet />
      </div>
      <SearchPalette />
      {tour && <Tour key={`${tour.mini ?? key}-${tour.start}`} steps={tour.steps} start={tour.start} title={tour.mini} ctx={ctx} onClose={endTour} onMenu={(o) => setTourMenu(o && window.innerWidth < 900)} />}
      {resume != null && <TourResume step={resume} total={steps.length} onLater={() => setResume(null)}
        onContinue={() => { setTour({ steps, start: Math.min(resume, steps.length - 1) }); setResume(null) }} onRestart={() => { setTour({ steps, start: 0 }); setResume(null) }} />}
    </div>
  )
}

/** Orden del menú: lo suelto de arriba, los grupos y al final la configuración del médico y la administración. */
/** Ronda 12: pendientes de un área de la bandeja; en rojo si hay urgentes. */
const deptBadge = (c?: { n: number; urgent: number }) => (c ? { n: c.n, alert: c.urgent > 0, label: `${c.n} pendientes${c.urgent ? `, ${c.urgent} urgentes` : ''}` } : null)

/** RU6 (ronda 15): grupos que son solo un encabezado (siempre abiertos). */
const STATIC_GROUPS = new Set(['Registros'])


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
