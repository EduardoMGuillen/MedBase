import { useState } from 'react'
import { ChevronDown, CircleAlert, Clock, Info } from 'lucide-react'
import { alertSummary, type AlertGo, type AlertLevel, type FileAlert } from '../lib/alerts'

const ICON: Record<AlertLevel, typeof Info> = { critical: CircleAlert, pending: Clock, info: Info }

/** Una alerta: nivel en color, texto agrupado y su acción directa. */
export function AlertLine({ a, onGo }: { a: FileAlert; onGo: (go: AlertGo) => void }) {
  const Icon = ICON[a.level]
  return (
    <li className={`alert-line alert-line--${a.level}`}>
      <Icon size={15} aria-hidden />
      <span>{a.text}</span>
      <button type="button" className="btn btn--ghost btn--sm" onClick={() => onGo(a.action.go)}>{a.action.label}</button>
    </li>
  )
}

/**
 * EN2: barra compacta arriba del expediente («2 críticas · 3 pendientes»). Lo crítico se ve abierto; lo demás, al
 * tocar la barra. Las alertas no se descartan: desaparecen al resolverse (o, una dosis, al marcarla «No aplicada»).
 */
export function AlertBar({ alerts, onGo }: { alerts: FileAlert[]; onGo: (go: AlertGo) => void }) {
  const [open, setOpen] = useState(false)
  if (!alerts.length) return null
  const critical = alerts.filter((a) => a.level === 'critical')
  const rest = alerts.filter((a) => a.level !== 'critical')
  const top: AlertLevel = critical.length ? 'critical' : rest.some((a) => a.level === 'pending') ? 'pending' : 'info'
  return (
    <section className={`alert-bar alert-bar--${top}`} aria-label="Alertas del expediente" data-tour="alertas">
      <button type="button" className="alert-bar__head" aria-expanded={open} onClick={() => setOpen(!open)} disabled={!rest.length}>
        <b>{alertSummary(alerts)}</b>
        {rest.length > 0 && <span className="alert-bar__more">{open ? 'Ocultar' : 'Ver todo'}<ChevronDown size={15} className={open ? 'is-flipped' : ''} /></span>}
      </button>
      {(critical.length > 0 || open) && (
        <ul className="alert-bar__list">
          {critical.map((a) => <AlertLine key={a.key} a={a} onGo={onGo} />)}
          {open && rest.map((a) => <AlertLine key={a.key} a={a} onGo={onGo} />)}
        </ul>
      )}
    </section>
  )
}
