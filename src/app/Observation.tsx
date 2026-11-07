import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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

/** TB (ronda 17): filtro del tablero: todos o solo los que pasan del límite de horas */
function ObsFilter({ over, total, limit, value, onChange }: { over: number; total: number; limit: number; value: 'all' | 'over'; onChange: (v: 'all' | 'over') => void }) {
  return (
    <div className="board__bar">
      <div className="segmented" role="radiogroup" aria-label="Mostrar pacientes">
        <button type="button" role="radio" aria-checked={value === 'all'} onClick={() => onChange('all')}>Todos <span className="num">{total}</span></button>
        <button type="button" role="radio" aria-checked={value === 'over'} onClick={() => onChange('over')}>Más de {limit} h <span className="num">{over}</span></button>
      </div>
    </div>
  )
}

const timeBadge = (minutes: number, over: boolean) =>
  <span className={`badge obs-time ${over ? 'badge--red' : 'badge--ink'}`}><Clock size={12} />{elapsed(minutes)}</span>

/**
 * TB (ronda 17): Observación como tabla, igual que Hospitalizados: paciente, diagnóstico o motivo, médico, ingreso y el tiempo
 * (en rojo pasado el límite). Toda la fila abre el expediente. A 760 px o menos cada paciente es un bloque (boards.css).
 */
function ObservationList() {
  const { inpatients, patient, staffById, settings } = useStore()
  const now = useNow()
  const nav = useNavigate()
  const [show, setShow] = useState<'all' | 'over'>('all')
  const limit = settings.obsAlertHours ?? 24
  const list = inpatients.filter((h) => h.kind === 'observation').sort((a, b) => a.admittedAt.localeCompare(b.admittedAt))
    .map((h) => { const minutes = Math.floor((now.getTime() - new Date(h.admittedAt).getTime()) / 60_000); return { h, minutes, over: minutes >= limit * 60 } })
  const rows = list.filter((x) => show === 'all' || x.over)
  return (
    <div className="page">
      <PageHead title="Observación" sub={list.length ? `${list.length} ${list.length === 1 ? 'paciente' : 'pacientes'} en observación. Se resaltan los que pasan de ${limit} horas.` : 'Nadie en observación ahora.'} />
      {list.length ? (
        <section className="panel board" data-testid="observation-list">
          <ObsFilter over={list.filter((x) => x.over).length} total={list.length} limit={limit} value={show} onChange={setShow} />
          {rows.length ? (
            <table className="table board__table">
              <thead><tr><th>Paciente</th><th>Diagnóstico o motivo</th><th>Ingresó</th><th>Tiempo</th><th><span className="sr-only">Avisos</span></th></tr></thead>
              <tbody>{rows.map(({ h, minutes, over }) => {
                const p = patient(h.patientId)
                if (!p) return null
                const to = `/app/observacion/${h.id}`
                return (
                  <tr key={h.id} className={`is-link${over ? ' is-over' : ''}`} onClick={(e) => { if (!(e.target as HTMLElement).closest('a, button')) nav(to) }}>
                    <td className="board__state board__who"><span><Link to={to}>{fullName(p)}</Link><small>{age(p.birthDate)}</small></span><span className="board__where-time">{timeBadge(minutes, over)}</span></td>
                    <td data-label="Diagnóstico" className="board__dx">{h.diagnoses.map((d) => d.label).join('; ') || h.reason}</td>
                    <td data-label="Ingresó">{staffById(h.admittedBy)?.name} · {time(h.admittedAt)}</td>
                    <td className="board__time">{timeBadge(minutes, over)}</td>
                    <td className="board__flags">{h.authPending && <span className="badge badge--amber">Autorización pendiente de firma</span>}</td>
                  </tr>
                )
              })}</tbody>
            </table>
          ) : <div className="empty">Nadie pasa de {limit} horas.</div>}
        </section>
      ) : <section className="panel"><div className="empty">Para ingresar a un paciente, marca «Ingreso a observación» al firmar su consulta externa.</div></section>}
    </div>
  )
}

/** AD1 (ronda 17): quién está, dónde, desde cuándo y con qué médico. Sin diagnósticos, motivo ni enlace al expediente. */
function ObservationBoard() {
  const { patient, staffById, settings } = useStore()
  const now = useNow()
  const [show, setShow] = useState<'all' | 'over'>('all')
  const limit = settings.obsAlertHours ?? 24
  const [list, setList] = useState<BoardRow[] | null>(null)
  useEffect(() => {
    const load = () => api<BoardRow[]>('/observation/board').then(setList).catch(() => setList((x) => x ?? []))
    load()
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [])
  const all = (list ?? []).map((h) => { const minutes = Math.floor((now.getTime() - new Date(h.since).getTime()) / 60_000); return { h, minutes, over: minutes >= limit * 60 } })
  const rows = all.filter((x) => show === 'all' || x.over)
  return (
    <div className="page">
      <PageHead title="Observación" sub={list === null ? 'Cargando…' : all.length ? `${all.length} ${all.length === 1 ? 'paciente' : 'pacientes'} en observación. Solo lectura: el expediente lo abren el médico y enfermería.` : 'Nadie en observación ahora.'} />
      {all.length > 0 && (
        <section className="panel board" data-testid="observation-board">
          <ObsFilter over={all.filter((x) => x.over).length} total={all.length} limit={limit} value={show} onChange={setShow} />
          {rows.length ? (
            <table className="table board__table">
              <thead><tr><th>Paciente</th><th>Cama</th><th>Especialidad</th><th>Médico tratante</th><th>Desde</th><th>Tiempo</th></tr></thead>
              <tbody>{rows.map(({ h, minutes, over }) => {
                const p = patient(h.patientId)
                return (
                  <tr key={h.id} className={over ? 'is-over' : ''}>
                    <td className="board__state board__who"><span><strong>{p ? fullName(p) : 'Paciente'}</strong>{p && <small>{age(p.birthDate)}</small>}</span><span className="board__where-time">{timeBadge(minutes, over)}</span></td>
                    <td data-label="Cama">{h.room ? `Cama ${h.room}` : 'Sin cama asignada'}</td>
                    <td data-label="Especialidad">{h.specialty}</td>
                    <td data-label="Médico tratante">{attendingText(h.doctorIds, (id) => staffById(id)?.name)}</td>
                    <td data-label="Desde">{time(h.since)}</td>
                    <td className="board__time">{timeBadge(minutes, over)}</td>
                  </tr>
                )
              })}</tbody>
            </table>
          ) : <div className="empty">Nadie pasa de {limit} horas.</div>}
        </section>
      )}
    </div>
  )
}
