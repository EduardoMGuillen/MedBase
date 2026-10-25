import { Link } from 'react-router-dom'
import { Clock } from 'lucide-react'
import { useStore } from '../lib/store'
import { PageHead } from '../components/ui'
import { age, fullName, time } from '../lib/format'
import { useNow } from '../lib/hooks'
import { elapsed } from '../lib/inpatient'

/**
 * Observación: pacientes que no se hospitalizan pero todavía no se pueden ir (hidratar, nebulizar, vigilar,
 * esperar un laboratorio). Se ingresan desde la nota de consulta externa.
 */
export default function Observation() {
  const { inpatients, patient, staffById, settings } = useStore()
  const now = useNow()
  const limit = settings.obsAlertHours ?? 24
  const list = inpatients.filter((h) => h.kind === 'observation').sort((a, b) => a.admittedAt.localeCompare(b.admittedAt))
  return (
    <div className="page">
      <PageHead title="Observación" sub={list.length ? `${list.length} ${list.length === 1 ? 'paciente' : 'pacientes'} en observación. Se resaltan los que pasan de ${limit} horas.` : 'Nadie en observación ahora.'} />
      {list.length ? (
        <section className="panel">
          <div className="rows">{list.map((h) => {
            const p = patient(h.patientId)
            if (!p) return null
            const minutes = Math.floor((now.getTime() - new Date(h.admittedAt).getTime()) / 60_000)
            const over = minutes >= limit * 60
            return (
              <Link key={h.id} to={`/app/observacion/${h.id}`} className={`row obs-row ${over ? 'obs-row--over' : ''}`}>
                <div className="row__who">
                  <strong>{fullName(p)} <span className="muted" style={{ fontWeight: 500 }}>· {age(p.birthDate)}</span></strong>
                  <span>{h.diagnoses.map((d) => d.label).join('; ') || h.reason}</span>
                  <span>{staffById(h.admittedBy)?.name} · ingresó a las {time(h.admittedAt)}</span>
                </div>
                <span className={`badge ${over ? 'badge--red' : 'badge--ink'}`}><Clock size={12} />{elapsed(minutes)}</span>
              </Link>
            )
          })}</div>
        </section>
      ) : <section className="panel"><div className="empty">Para ingresar a un paciente, marca «Ingreso a observación» al firmar su consulta externa.</div></section>}
    </div>
  )
}
