import { TriangleAlert } from 'lucide-react'
import { collectMedAlerts } from '../lib/inpatient'
import type { InpatientFile } from '../lib/types'

/** Aviso en el expediente cuando una dosis no se cumplió o va atrasada. Lo ven médico y enfermería. */
export function MedAlertBanner({ file }: { file: InpatientFile }) {
  const alerts = collectMedAlerts(file)
  if (!alerts.length) return null
  return (
    <div className="alert-strip" role="status" style={{ alignItems: 'flex-start' }}>
      <TriangleAlert size={18} style={{ flex: 'none', marginTop: 2 }} />
      <div>
        <b>Alertas del expediente</b>
        <ul className="note__list" style={{ margin: '6px 0 0' }}>
          {alerts.slice(0, 8).map((a) => <li key={a.text}>{a.text}</li>)}
        </ul>
        {alerts.length > 8 && <p className="muted" style={{ marginTop: 4 }}>Y {alerts.length - 8} más en la hoja de medicamentos.</p>}
      </div>
    </div>
  )
}
