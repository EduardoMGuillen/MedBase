import { useStore } from '../lib/store'
import { bedLabel } from '../app/Inpatients'
import { hasRole } from '../lib/permissions'

/** Especialidades que se sugieren al ingresar (además de las de los médicos de la clínica). */
const COMMON = ['Medicina general', 'Medicina interna', 'Pediatría', 'Ginecología y obstetricia', 'Cirugía general', 'Ortopedia', 'Cardiología', 'Neumología']

/**
 * AD3: cama y especialidad del ingreso. Sólo se ofrecen camas libres (en servicio y sin paciente); la especialidad
 * empieza con la del médico que ingresa y se cambia si ingresa para otro servicio.
 */
export function BedFields({ bedId, specialty, onChange, currentBedId }: {
  bedId: string; specialty: string; onChange: (v: { bedId: string; specialty: string }) => void; currentBedId?: string
}) {
  const { beds, bedStays = [], staff } = useStore()
  const free = beds.filter((b) => b.active && (b.id === currentBedId || !bedStays.some((x) => x.bedId === b.id)))
    .sort((a, b) => a.room.localeCompare(b.room, 'es', { numeric: true }) || a.label.localeCompare(b.label))
  const options = [...new Set([...COMMON, ...staff.filter((s) => hasRole(s, 'doctor') && s.specialty).map((s) => s.specialty!)])].sort((a, b) => a.localeCompare(b, 'es'))
  return (
    <div className="form-grid">
      <label className="field"><span>Cama libre</span>
        <select className="select" value={bedId} onChange={(e) => onChange({ bedId: e.target.value, specialty })}>
          {/* Una hospitalización siempre tiene cama: al editarla sólo se traslada a otra libre */}
          {!currentBedId && <option value="">{free.length ? 'Elige una cama libre' : 'No hay camas libres'}</option>}
          {free.map((b) => <option key={b.id} value={b.id}>{bedLabel(b)}{b.id === currentBedId ? ' (actual)' : ''}</option>)}
        </select></label>
      <label className="field"><span>Especialidad del ingreso</span>
        <input className="input" list="stay-specialties" value={specialty} onChange={(e) => onChange({ bedId, specialty: e.target.value })} />
        <datalist id="stay-specialties">{options.map((s) => <option key={s} value={s} />)}</datalist>
        <small className="muted">La de quien ingresa. Cámbiala si ingresa para otro servicio.</small></label>
    </div>
  )
}
