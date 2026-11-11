import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useStore } from '../../lib/store'
import { SectionHead } from '../../components/ui'
import { fullName } from '../../lib/format'
import type { Bed } from '../../lib/types'

// Configuración: camas y cuartos.
/**
 * Camas (AD3): sin especialidad fija. El estado sale solo de los pacientes hospitalizados (Libre u Ocupada, con el
 * paciente y la especialidad de su ingreso); "Fuera de servicio" es lo único que se marca a mano (mantenimiento).
 */
export function Beds() {
  const { beds, bedStays = [], patient, createBed, updateBed } = useStore()
  const [room, setRoom] = useState('')
  const [label, setLabel] = useState('')
  // CF5 (ronda 6): «Agregar cama» arriba, en el encabezado; abre la misma fila de alta, al principio
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const sorted = [...beds].sort((a, b) => a.room.localeCompare(b.room, 'es', { numeric: true }) || a.label.localeCompare(b.label))
  const stayIn = (id: string) => bedStays.find((h) => h.bedId === id)
  const counts = { free: sorted.filter((b) => b.active && !stayIn(b.id)).length, busy: sorted.filter((b) => stayIn(b.id)).length, off: sorted.filter((b) => !b.active).length }
  return (
    <section className="panel table-wrap" data-tour="tab:camas">
      <SectionHead title="Camas" sub={`${counts.free} libres · ${counts.busy} ocupadas${counts.off ? ` · ${counts.off} fuera de servicio` : ''}. Se ocupan al ingresar a un paciente y se liberan al darle de alta o trasladarlo.`}
        action={<button className="btn btn--primary btn--sm" onClick={() => setAdding(true)}><Plus size={15} />Agregar cama</button>} />
      <table className="table table--sticky table--cards">
        <thead><tr><th>Cuarto</th><th>Cama</th><th>Estado</th><th /></tr></thead>
        <tbody>
          {adding && (
            <tr className="row-new">
              <td data-label="Cuarto"><input className="input" autoFocus placeholder="Ej. 106" value={room} onChange={(e) => setRoom(e.target.value)} aria-label="Cuarto" /></td>
              <td data-label="Cama"><input className="input" placeholder="Opcional, ej. A" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Cama" /></td>
              <td />
              <td className="tc-actions ta-r nowrap"><button className="btn btn--primary btn--sm" disabled={!room.trim()} onClick={async () => {
                if (await createBed({ room: room.trim(), label: label.trim(), active: true })) { setRoom(''); setLabel(''); setAdding(false) }
              }}><Plus size={14} />Agregar cama</button>{' '}
                <button className="btn btn--ghost btn--sm" onClick={() => { setAdding(false); setRoom(''); setLabel('') }}>Cancelar</button></td>
            </tr>
          )}
          {sorted.map((b) => {
            const h = stayIn(b.id)
            const p = h && patient(h.patientId)
            return (
              <tr key={b.id} style={b.active ? undefined : { opacity: 0.7 }}>
                {editing === b.id ? <BedRename b={b} onDone={() => setEditing(null)} /> : <><td data-label="Cuarto" className="num">{b.room}</td><td data-label="Cama">{b.label || '—'}</td></>}
                <td data-label="Estado" className="tc-full">{!b.active ? <><span className="badge badge--amber">Fuera de servicio</span>{b.outOfServiceNote && <small className="c-muted block">{b.outOfServiceNote}</small>}</>
                  : h ? <><span className="badge badge--ink">Ocupada</span> <span className="fs-base">{p ? fullName(p) : 'Paciente'}{h.specialty ? ` · ${h.specialty}` : ''}</span></>
                    : <span className="badge badge--mint">Libre</span>}</td>
                <td className="tc-actions ta-r nowrap">
                  {editing !== b.id && <button className="btn btn--ghost btn--sm" onClick={() => setEditing(b.id)}>Renombrar</button>}{' '}
                  {b.active
                    ? <button className="btn btn--ghost btn--sm" disabled={!!h} title={h ? 'Tiene un paciente: dale de alta o trasládalo primero' : undefined} onClick={() => {
                      const note = prompt('Motivo (por ejemplo, mantenimiento):', 'Mantenimiento')
                      if (note !== null) updateBed(b.id, { active: false, outOfServiceNote: note.trim() || undefined }, 'Cama fuera de servicio')
                    }}>Fuera de servicio</button>
                    : <button className="btn btn--soft btn--sm" onClick={() => updateBed(b.id, { active: true }, 'Cama en servicio')}>Volver a servicio</button>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {!beds.length && !adding && <div className="empty">Agrega las camas de la clínica con su número de cuarto: «Agregar cama», arriba.</div>}
    </section>
  )
}

export function BedRename({ b, onDone }: { b: Bed; onDone: () => void }) {
  const { updateBed } = useStore()
  const [room, setRoom] = useState(b.room)
  const [label, setLabel] = useState(b.label)
  const save = async () => { if (room.trim() && (room !== b.room || label !== b.label)) { if (!(await updateBed(b.id, { room: room.trim(), label: label.trim() }, 'Cama renombrada'))) return } onDone() }
  return (<>
    <td data-label="Cuarto"><input className="input" value={room} autoFocus onChange={(e) => setRoom(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onDone() }} aria-label="Cuarto" /></td>
    <td data-label="Cama"><div style={{ display: 'flex', gap: 6 }}><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onDone() }} aria-label="Cama" />
      <button className="btn btn--primary btn--sm" onClick={save}>Guardar</button></div></td>
  </>)
}
