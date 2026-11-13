import { Link } from 'react-router-dom'
import { CircleAlert, Clock } from 'lucide-react'
import { useStore } from '../lib/store'
import { alertQuery, LEVEL_RANK, type FileAlert } from '../lib/alerts'
import { useStayPendings, useWardFiles } from '../lib/ward'
import { stayPath } from '../lib/inpatient'
import { fullName } from '../lib/format'
import { bedLabel } from './Inpatients'

/** Líneas por paciente antes de «y N más». */
const MAX_LINES = 4

/**
 * EN2: pendientes de enfermería por paciente (internados y en observación), con las mismas reglas del expediente.
 * Los pacientes van por prioridad (crítico, pendiente) y, dentro de ella, por lo más antiguo; los avisos no salen aquí.
 */
export function WardAlerts() {
  const { patient, bed } = useStore()
  // PD1 (ronda 18): solo los pendientes de quien mira (los suyos y los compartidos), de la misma fuente que las listas y el menú
  const files = useWardFiles()
  const pendings = useStayPendings()
  if (!files?.length || !pendings) return null
  const rows = files.map((f) => ({ f, alerts: (pendings.get(f.hospitalization.id)?.mine ?? []).filter((a) => a.level !== 'info') }))
    .filter((r) => r.alerts.length)
    .sort((a, b) => LEVEL_RANK[a.alerts[0].level] - LEVEL_RANK[b.alerts[0].level] || a.alerts[0].since - b.alerts[0].since)
  return (
    <section className="panel ward-alerts" data-tour="pendientes">
      <div className="panel__head"><div><h2>Pendientes por paciente</h2><p>Internados y en observación, por prioridad y hora. Toca la acción para ir al lugar exacto.</p></div></div>
      {rows.length ? <div className="ward-alerts__list">{rows.map(({ f, alerts }) => {
        const h = f.hospitalization
        const p = patient(h.patientId)
        const where = h.kind === 'observation' ? 'Observación' : h.bedId ? bedLabel(bed(h.bedId)) : 'Sin cama'
        const crit = alerts.filter((a) => a.level === 'critical').length
        return (
          <article key={h.id} className={`ward-alert ward-alert--${alerts[0].level}`}>
            <header>
              <Link to={stayPath(h)}><b>{p ? fullName(p) : 'Paciente'}</b></Link>
              <span className="muted">{where}</span>
              <span className={`badge ${crit ? 'badge--red' : 'badge--amber'}`}>{crit ? `${crit} crítica${crit > 1 ? 's' : ''}` : `${alerts.length} pendiente${alerts.length > 1 ? 's' : ''}`}</span>
            </header>
            <ul>{alerts.slice(0, MAX_LINES).map((a) => <Line key={a.key} a={a} to={`${stayPath(h)}?${alertQuery(a.action.go)}`} />)}</ul>
            {alerts.length > MAX_LINES && <Link className="linklike" to={stayPath(h)}>Y {alerts.length - MAX_LINES} más en el expediente</Link>}
          </article>
        )
      })}</div> : <div className="empty">Sin pendientes: dosis, signos, órdenes y exámenes al día.</div>}
    </section>
  )
}

function Line({ a, to }: { a: FileAlert; to: string }) {
  const Icon = a.level === 'critical' ? CircleAlert : Clock
  return (
    <li className={`alert-line alert-line--${a.level}`}>
      <Icon size={15} aria-hidden /><span>{a.text}</span>
      <Link className="btn btn--ghost btn--sm" to={to}>{a.action.label}</Link>
    </li>
  )
}
