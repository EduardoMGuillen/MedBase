import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock } from 'lucide-react'
import { useStore } from '../lib/store'
import { PageHead } from '../components/ui'
import { age, fullName, time } from '../lib/format'
import { useNow } from '../lib/hooks'
import { api } from '../lib/api'
import { attendingText, elapsed } from '../lib/inpatient'

/** AD1 (ronda 17): una fila de la lista de Observación para quien no ve el expediente (administración). */
type BoardRow = { id: string; patientId: string; since: string; specialty?: string; room?: string; doctorIds: string[] }

/**
 * Observación: pacientes que no se hospitalizan pero todavía no se pueden ir (hidratar, nebulizar, vigilar,
 * esperar un laboratorio). Se ingresan desde la nota de consulta externa.
 */
export default function Observation() {
  const { can } = useStore()
  // AD1 (ronda 17): administración ve la lista en solo lectura, como el tablero de camas de HO2 (sin abrir el expediente)
  return can('inpatient.view') ? <ObservationList /> : <ObservationBoard />
}

function ObservationList() {
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
                  <span>{staffById(h.admittedBy)?.name} · ingresó a las {time(h.admittedAt)}{h.authPending ? ' · autorización pendiente de firma' : ''}</span>
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

/** AD1 (ronda 17): quién está, dónde, desde cuándo y con qué médico. Sin diagnósticos, motivo ni enlace al expediente. */
function ObservationBoard() {
  const { patient, staffById, settings } = useStore()
  const now = useNow()
  const limit = settings.obsAlertHours ?? 24
  const [list, setList] = useState<BoardRow[] | null>(null)
  useEffect(() => {
    const load = () => api<BoardRow[]>('/observation/board').then(setList).catch(() => setList((x) => x ?? []))
    load()
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [])
  const rows = list ?? []
  return (
    <div className="page">
      <PageHead title="Observación" sub={list === null ? 'Cargando…' : rows.length ? `${rows.length} ${rows.length === 1 ? 'paciente' : 'pacientes'} en observación. Solo lectura: el expediente lo abren el médico y enfermería.` : 'Nadie en observación ahora.'} />
      {rows.length > 0 && (
        <section className="panel" data-testid="observation-board">
          <div className="rows">{rows.map((h) => {
            const p = patient(h.patientId)
            const minutes = Math.floor((now.getTime() - new Date(h.since).getTime()) / 60_000)
            const over = minutes >= limit * 60
            return (
              <div key={h.id} className={`row row--plain obs-row ${over ? 'obs-row--over' : ''}`}>
                <div className="row__who">
                  <strong>{p ? fullName(p) : 'Paciente'}{p && <span className="muted" style={{ fontWeight: 500 }}> · {age(p.birthDate)}</span>}</strong>
                  <span>{[h.room ? `Cama ${h.room}` : 'Sin cama asignada', h.specialty].filter(Boolean).join(' · ')}</span>
                  <span>Médico tratante: {attendingText(h.doctorIds, (id) => staffById(id)?.name)} · desde las {time(h.since)}</span>
                </div>
                <span className={`badge ${over ? 'badge--red' : 'badge--ink'}`}><Clock size={12} />{elapsed(minutes)}</span>
              </div>
            )
          })}</div>
        </section>
      )}
    </div>
  )
}
