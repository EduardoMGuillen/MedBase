import { useNavigate } from 'react-router-dom'
import { Repeat } from 'lucide-react'
import { useStore } from '../lib/store'
import { roleWith, VIEW_LABEL, viewsOf, type Permission } from '../lib/permissions'

/**
 * AD5: selector "Vista de administrador / Vista de médico" para quien tiene varios roles. Al cambiar, cambian el
 * inicio, el menú y los permisos; la vista elegida queda guardada en su cuenta.
 */
export function ViewSwitch({ compact = false, onSwitched }: { compact?: boolean; onSwitched?: () => void }) {
  const { user, switchView } = useStore()
  const nav = useNavigate()
  if (!user) return null
  const roles = viewsOf(user)
  if (roles.length < 2) return null
  return (
    <div className={`segmented view-switch${compact ? ' view-switch--compact' : ''}`} role="radiogroup" aria-label="Vista con la que trabajas" data-tour="vista">
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
            <h2>Esta pantalla es de la {VIEW_LABEL[role].toLowerCase()}</h2>
            <p>Ahora estás en la {VIEW_LABEL[user.role].toLowerCase()}. Cambia de vista para abrirla; puedes volver cuando quieras.</p>
          </div>
          <div className="switch-offer__actions">
            <button className="btn btn--primary" onClick={() => switchView(role)}>Cambiar a la {VIEW_LABEL[role].toLowerCase()}</button>
            <button className="btn btn--ghost" onClick={() => nav('/app')}>Ir al inicio</button>
          </div>
        </div>
      </section>
    </div>
  )
}
