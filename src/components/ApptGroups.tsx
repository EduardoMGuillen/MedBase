import { useState, type ReactNode } from 'react'
import { FoldHead } from './ui'
import { time } from '../lib/format'
import type { Appointment, Staff } from '../lib/types'

/**
 * AD1/RE1 (ronda 6) y CX1 (ronda 8): un solo componente para agrupar citas «Por hora | Por médico», con «Expandir todo /
 * Contraer todo». Lo usan «Por llegar hoy» y las tres columnas de Consulta externa. Las filas (o tarjetas) no cambian: las
 * dibuja quien lo usa.
 */
export type ApptGroupView = 'hour' | 'doctor'

export interface ApptGroup { key: string; title: ReactNode; items: Appointment[] }

/**
 * Agrupa las citas (ya ordenadas por hora). Por hora: un grupo por hora de la cita; los que llegaron sin cita van al final
 * en «Sin cita» (si `walkInsApart`). Por médico: un grupo por médico, por nombre, con sus pacientes por hora; sin médico,
 * «Sin médico asignado» al final. Un grupo sin pacientes no existe.
 */
export function groupAppointments(list: Appointment[], view: ApptGroupView, staffById: (id: string) => Staff | undefined, walkInsApart = false): ApptGroup[] {
  const sorted = [...list].sort((a, b) => a.start.localeCompare(b.start))
  if (view === 'hour') {
    const timed = walkInsApart ? sorted.filter((a) => a.source !== 'walkin') : sorted
    const hours = [...new Set(timed.map((a) => time(a.start)))]
    const out: ApptGroup[] = hours.map((h) => ({ key: `h:${h}`, title: <>{h}</>, items: timed.filter((a) => time(a.start) === h) }))
    const walkIns = walkInsApart ? sorted.filter((a) => a.source === 'walkin') : []
    if (walkIns.length) out.push({ key: 'h:sin-cita', title: <>Sin cita</>, items: walkIns })
    return out
  }
  const withDoctor = [...new Set(sorted.map((a) => a.doctorId))].map((d) => ({ d, doctor: staffById(d) }))
  const known = withDoctor.filter((x) => x.doctor).sort((a, b) => a.doctor!.name.localeCompare(b.doctor!.name, 'es'))
  const out: ApptGroup[] = known.map(({ d, doctor }) => ({
    key: `d:${d}`,
    title: <><i className="arrival-group__dot" style={{ background: doctor!.color }} aria-hidden="true" />{doctor!.name}{doctor!.specialty && <small className="fold-head__sub">{doctor!.specialty}</small>}</>,
    items: sorted.filter((a) => a.doctorId === d),
  }))
  const orphan = sorted.filter((a) => !staffById(a.doctorId))
  if (orphan.length) out.push({ key: 'd:sin-medico', title: <>Sin médico asignado</>, items: orphan })
  return out
}

/** Estado de los grupos abiertos/cerrados. Abiertos por defecto; «Expandir/Contraer todo» aplica a todos los grupos dados. */
export function useFold() {
  const [fold, setFold] = useState<Record<string, boolean>>({})
  const isOpen = (k: string) => fold[k] ?? true
  return {
    isOpen,
    toggle: (k: string) => setFold((f) => ({ ...f, [k]: !(f[k] ?? true) })),
    setAll: (keys: string[], open: boolean) => setFold((f) => ({ ...f, ...Object.fromEntries(keys.map((k) => [k, open])) })),
  }
}

/** Selector «Por hora | Por médico» y botones «Expandir todo / Contraer todo». */
export function GroupTools({ view, onView, onExpand, onCollapse }: { view: ApptGroupView; onView: (v: ApptGroupView) => void; onExpand: () => void; onCollapse: () => void }) {
  return (
    <div className="arrivals__tools">
      <div className="segmented segmented--sm" role="radiogroup" aria-label="Agrupar por">
        <button type="button" role="radio" aria-checked={view === 'hour'} onClick={() => onView('hour')}>Por hora</button>
        <button type="button" role="radio" aria-checked={view === 'doctor'} onClick={() => onView('doctor')}>Por médico</button>
      </div>
      <span className="fold-tools">
        <button type="button" className="btn btn--ghost btn--sm" onClick={onExpand}>Expandir todo</button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onCollapse}>Contraer todo</button>
      </span>
    </div>
  )
}

/** Los grupos con su encabezado desplegable (hora o médico, conteo y flecha). */
export function ApptGroupList({ groups, prefix, isOpen, toggle, render, className = 'rows' }: {
  groups: ApptGroup[]; prefix: string; isOpen: (k: string) => boolean; toggle: (k: string) => void; render: (a: Appointment) => ReactNode; className?: string
}) {
  return (
    <div className="arrival-groups">{groups.map((g) => {
      const k = `${prefix}${g.key}`
      return (
        <div key={g.key} className="arrival-group">
          <FoldHead id={`grp-${k}`} open={isOpen(k)} onToggle={() => toggle(k)} title={g.title} count={g.items.length} />
          {isOpen(k) && <div id={`grp-${k}`} className={className}>{g.items.map(render)}</div>}
        </div>
      )
    })}</div>
  )
}
