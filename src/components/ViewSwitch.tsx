import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronDown, Repeat } from 'lucide-react'
import { useStore } from '../lib/store'
import { ROLE_LABEL, roleWith, VIEW_LABEL, viewsOf, type Permission } from '../lib/permissions'

/**
 * AD5: selector «Administración / Médico» para quien tiene varios roles. Al cambiar, cambian el
 * inicio, el menú y los permisos; la vista elegida queda guardada en su cuenta. Sólo está en Inicio (MC1, ronda 5).
 */
export function ViewSwitch({ onSwitched }: { onSwitched?: () => void }) {
  const { user, switchView } = useStore()
  const nav = useNavigate()
  if (!user) return null
  const roles = viewsOf(user)
  if (roles.length < 2) return null
  return (
    <div className="segmented view-switch" role="radiogroup" aria-label="Vista con la que trabajas" data-tour="vista">
      {roles.map((r) => (
        <button key={r} type="button" role="radio" aria-checked={user.role === r} onClick={async () => {
          if (r === user.role) return
          if (await switchView(r)) { onSwitched?.(); nav('/app') }
        }}>{VIEW_LABEL[r]}</button>
      ))}
    </div>
  )
}

/** Pantalla de otro de sus roles abierta por dirección directa: se ofrece cambiar de vista en lugar de rebotar. */
export function SwitchViewOffer({ perm }: { perm: Permission }) {
  const { user, switchView, settings } = useStore()
  const nav = useNavigate()
  const role = user && roleWith(user, perm, settings.kind)
  if (!user || !role) return null
  return (
    <div className="page">
      <section className="panel switch-offer">
        <div className="panel__body">
          <Repeat size={22} />
          <div>
            <h2>Esta pantalla es del rol {VIEW_LABEL[role]}</h2>
            <p>Ahora trabajas como {VIEW_LABEL[user.role]}. Cambia de rol para abrirla; puedes volver cuando quieras.</p>
          </div>
          <div className="switch-offer__actions">
            <button className="btn btn--primary" onClick={() => switchView(role)}>Cambiar a {VIEW_LABEL[role]}</button>
            <button className="btn btn--ghost" onClick={() => nav('/app')}>Ir al inicio</button>
          </div>
        </div>
      </section>
    </div>
  )
}

/**
 * GE2 (ronda 8): cambio de rol dentro de la tarjeta del usuario (pie del menú). Un control propio, una flecha junto al
 * nombre del rol, que abre la lista de roles; nunca abre Configuración. Con un solo rol no hay control: sólo el nombre.
 */
export function RoleMenu({ onSwitched }: { onSwitched?: () => void }) {
  const { user, switchView } = useStore()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [open])
  if (!user) return null
  const roles = viewsOf(user)
  if (roles.length < 2) return <small>{ROLE_LABEL[user.role]}</small>
  return (
    <div className="role-menu" ref={ref}>
      <button type="button" className="role-menu__btn" aria-haspopup="menu" aria-expanded={open} aria-label={`Rol: ${ROLE_LABEL[user.role]}. Cambiar de rol`}
        onClick={() => setOpen(!open)}>
        <small>{ROLE_LABEL[user.role]}</small><ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="role-menu__pop" role="menu" aria-label="Cambiar de rol">
          {roles.map((r) => (
            <button key={r} type="button" role="menuitemradio" aria-checked={user.role === r} onClick={async () => {
              setOpen(false)
              if (r === user.role) return
              if (await switchView(r)) { onSwitched?.(); nav('/app') }
            }}>{user.role === r && <Check size={14} aria-hidden="true" />}{ROLE_LABEL[r]}</button>
          ))}
        </div>
      )}
    </div>
  )
}
