import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CircleAlert, Clock } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { useNow } from '../lib/hooks'
import { alertQuery, fileAlerts, LEVEL_RANK, type FileAlert } from '../lib/alerts'
import { bandOf } from '../lib/vitalsSheet'
import { stayPath } from '../lib/inpatient'
import { fullName, shortStaff } from '../lib/format'
import { bedLabel } from './Inpatients'
import type { InpatientFile } from '../lib/types'

/** Lo que manda el servidor de cada estancia: sólo lo que usan las alertas. */
type AlertFile = Pick<InpatientFile, 'hospitalization' | 'notes' | 'marks' | 'meds' | 'doses' | 'vitals' | 'consultOrders' | 'authorizations' | 'exams'>
/** Líneas por paciente antes de «y N más». */
const MAX_LINES = 4

/**
 * EN2: pendientes de enfermería por paciente (internados y en observación), con las mismas reglas del expediente.
 * Los pacientes van por prioridad (crítico, pendiente) y, dentro de ella, por lo más antiguo; los avisos no salen aquí.
 */
export function WardAlerts() {
  const { patient, bed, settings, staffById } = useStore()
  const now = useNow()
  const [files, setFiles] = useState<AlertFile[] | null>(null)
  useEffect(() => {
    const load = () => api<AlertFile[]>('/inpatient/alerts').then(setFiles).catch(() => null)
    load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [])
  if (!files?.length) return null
  const band = bandOf(settings)
  const rows = files.map((f) => ({ f, alerts: fileAlerts(f, band, now, { nameOf: (id) => shortStaff(staffById(id)?.name) }).filter((a) => a.level !== 'info') }))
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
