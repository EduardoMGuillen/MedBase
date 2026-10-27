import { TriangleAlert } from 'lucide-react'
import { collectMedAlerts } from '../lib/inpatient'
import { bandOf, vitalAlerts } from '../lib/vitalsSheet'
import { useStore } from '../lib/store'
import { useNow } from '../lib/hooks'
import type { InpatientFile } from '../lib/types'

/**
 * Alertas del expediente: dosis que no se cumplieron o van atrasadas, fiebre o hipotermia de las últimas 24 horas y
 * tomas de signos vitales esperadas sin registrar. Las ven médico y enfermería.
 */
export function MedAlertBanner({ file }: { file: InpatientFile }) {
  const { settings } = useStore()
  const now = useNow()
  const alerts = [...vitalAlerts(file, bandOf(settings), now).map((text) => ({ text })), ...collectMedAlerts(file)]
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
