import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Bed } from '../lib/types'

export type BoardFilter = 'all' | 'occupied' | 'free'

/** Lo que muestra una fila; lo arma la pantalla según lo que la persona puede ver (HO2: sin expediente, menos datos). */
export type BedRow = {
  occupied: boolean
  /** Con expediente: la fila entera lo abre. */
  to?: string
  who?: ReactNode
  specialty?: string
  dx?: string
  doctor?: string
  day?: number
  since?: string
  flags?: ReactNode
  action?: ReactNode
}

const FILTERS: { key: BoardFilter; label: string; count: (c: Counts) => number }[] = [
  { key: 'all', label: 'Todas', count: (c) => c.all },
  { key: 'occupied', label: 'Ocupadas', count: (c) => c.occupied },
  { key: 'free', label: 'Libres', count: (c) => c.free },
]
type Counts = { all: number; occupied: number; free: number }

/**
 * TB (ronda 17): Hospitalizados como una tabla sobria de camas, agrupada por cuarto (el cuarto ocupa las filas de sus camas),
 * con un filtro segmentado y etiquetas de estado en vez de tarjetas. A 760 px o menos cada cama es un bloque compacto con su
 * cuarto arriba (boards.css).
 */
export function BedBoard({ beds, rowOf, filter, onFilter, counts }: {
  beds: Bed[]; rowOf: (b: Bed) => BedRow; filter: BoardFilter; onFilter: (f: BoardFilter) => void; counts: Counts
}) {
  const nav = useNavigate()
  const rows = beds.map((b) => ({ b, r: rowOf(b) }))
    .filter(({ r }) => filter === 'all' || (filter === 'occupied' ? r.occupied : !r.occupied))
  // Cuántas camas de cada cuarto quedan en la lista (para el rowSpan de la primera)
  const span = new Map<string, number>()
  for (const { b } of rows) span.set(b.room, (span.get(b.room) ?? 0) + 1)
  const anyLabel = rows.some(({ b }) => b.label)

  return (
    <section className="panel board" data-testid="bed-board">
      <div className="board__bar">
        <div className="segmented" role="radiogroup" aria-label="Mostrar camas">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" role="radio" aria-checked={filter === f.key} onClick={() => onFilter(f.key)}>
              {f.label} <span className="num">{f.count(counts)}</span>
            </button>
          ))}
        </div>
      </div>
      {rows.length === 0
        ? <div className="empty">{filter === 'free' ? 'No hay camas libres.' : 'No hay camas ocupadas.'}</div>
        : (
          <table className="table board__table">
            <thead>
              <tr>
                <th>Cuarto</th>
                {anyLabel && <th>Cama</th>}
                <th>Estado</th>
                <th>Paciente</th>
                <th className="board__col-spec">Especialidad</th>
                <th>Diagnóstico</th>
                <th>Médico tratante</th>
                <th className="ta-r">Día</th>
                <th><span className="sr-only">Avisos y acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ b, r }, i) => {
                const first = i === 0 || rows[i - 1].b.room !== b.room
                const where = `Cuarto ${b.room}${b.label ? ` · Cama ${b.label}` : ''}`
                return (
                  <tr key={b.id} className={`${r.occupied ? '' : 'is-free'}${r.to ? ' is-link' : ''}${first ? ' is-first' : ''}`}
                    onClick={r.to ? (e) => { if (!(e.target as HTMLElement).closest('a, button')) nav(r.to!) } : undefined}>
                    {first && <th scope="rowgroup" rowSpan={span.get(b.room)} className="board__room">{b.room}</th>}
                    {anyLabel && <td className="board__bed">{b.label || '—'}</td>}
                    <td className="board__state">
                      <span className="board__where">{where}</span>
                      <span className={`badge ${r.occupied ? 'badge--ink' : 'badge--mint'}`}>{r.occupied ? 'Ocupada' : 'Libre'}</span>
                    </td>
                    <td className="board__who">{r.who ?? <span className="muted">—</span>}{r.specialty && <small className="board__spec">{r.specialty}</small>}</td>
                    <td data-label="Especialidad" className="board__col-spec">{r.specialty}</td>
                    <td data-label="Diagnóstico" className="board__dx">{r.dx}</td>
                    <td data-label="Médico tratante">{r.doctor}</td>
                    <td data-label="Día" className="num ta-r">{r.day}</td>
                    <td className="board__flags">{r.flags}{r.action}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
    </section>
  )
}
