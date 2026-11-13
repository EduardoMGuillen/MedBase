import { useState } from 'react'
import { ChevronDown, CircleAlert, Clock, Info } from 'lucide-react'
import { alertSummary, sinceText, type AlertGo, type AlertLevel, type FileAlert } from '../lib/alerts'
import { ownersText } from '../lib/pendings'

const ICON: Record<AlertLevel, typeof Info> = { critical: CircleAlert, pending: Clock, info: Info }

/** Una alerta: nivel en color, texto agrupado y su acción directa. */
export function AlertLine({ a, onGo }: { a: FileAlert; onGo: (go: AlertGo) => void }) {
  const Icon = ICON[a.level]
  return (
    <li className={`alert-line alert-line--${a.level}`}>
      <Icon size={15} aria-hidden />
      <span>{a.text}</span>
      <span className="alert-line__acts">
        {a.secondary && <button type="button" className="linklike" onClick={() => onGo(a.secondary!.go)}>{a.secondary.label}</button>}
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => onGo(a.action.go)}>{a.action.label}</button>
      </span>
    </li>
  )
}

/** PD1 (ronda 18): lo que lleva demasiado tiempo va primero; después, lo más antiguo. */
const othersOrder = (a: FileAlert, b: FileAlert) => Number(!!b.stale) - Number(!!a.stale) || a.since - b.since

/**
 * EN2: barra compacta arriba del expediente («2 críticas · 3 pendientes»). Lo crítico se ve abierto; lo demás, al
 * tocar la barra. Las alertas no se descartan: desaparecen al resolverse (o, una dosis, al marcarla «No aplicada»).
 *
 * PD1 (ronda 18): el encabezado y los números cuentan SOLO lo de quien mira (`alerts`: lo suyo y lo compartido). Debajo, en gris y
 * más pequeño, «Pendientes de otros» (`others`): lo que les toca a otros roles, cada uno con su responsable («Médico: revisar
 * resultado de Hemograma»). Es informativo: no cuenta, no es rojo y no tiene botones. Sin pendientes propios pero con los de
 * otros, el recuadro queda gris: «Sin pendientes para ti · 2 de otros».
 */
export function AlertBar({ alerts, others = [], now, onGo }: { alerts: FileAlert[]; others?: FileAlert[]; now: Date; onGo: (go: AlertGo) => void }) {
  const [open, setOpen] = useState(false)
  if (!alerts.length && !others.length) return null
  const critical = alerts.filter((a) => a.level === 'critical')
  const rest = alerts.filter((a) => a.level !== 'critical')
  const top: AlertLevel | 'none' = critical.length ? 'critical' : rest.some((a) => a.level === 'pending') ? 'pending' : alerts.length ? 'info' : 'none'
  const ofOthers = others.length ? `${others.length} de otros` : ''
  return (
    <section className={`alert-bar alert-bar--${top}`} aria-label="Pendientes del expediente" data-tour="alertas" data-testid="alert-bar">
      <button type="button" className="alert-bar__head" aria-expanded={open} onClick={() => setOpen(!open)} disabled={!rest.length}>
        <b>{alerts.length ? alertSummary(alerts) : 'Sin pendientes para ti'}</b>
        {ofOthers && <span className="alert-bar__others-n">· {ofOthers}</span>}
        {rest.length > 0 && <span className="alert-bar__more">{open ? 'Ocultar' : 'Ver todo'}<ChevronDown size={15} className={open ? 'is-flipped' : ''} /></span>}
      </button>
      {(critical.length > 0 || open) && (
        <ul className="alert-bar__list">
          {critical.map((a) => <AlertLine key={a.key} a={a} onGo={onGo} />)}
          {open && rest.map((a) => <AlertLine key={a.key} a={a} onGo={onGo} />)}
        </ul>
      )}
      {others.length > 0 && (
        <div className="alert-others" data-testid="alert-others">
          <h3>Pendientes de otros</h3>
          <ul>{[...others].sort(othersOrder).map((a) => (
            <li key={a.key}><b>{ownersText(a)}:</b> {a.other}{a.stale && <> · <strong className="alert-others__late">{sinceText(a.since, now)}</strong></>}</li>
          ))}</ul>
        </div>
      )}
    </section>
  )
}
