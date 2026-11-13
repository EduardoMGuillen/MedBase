import { useState } from 'react'
import { Combo } from '../../components/Combo'
import { useStore } from '../../lib/store'
import { Avatar, Modal } from '../../components/ui'
import { normalize } from '../../lib/patients'
import type { Staff } from '../../lib/types'
import { ScheduleEditor } from '../ScheduleEditor'
import { features, hasRole } from '../../lib/permissions'
import { useSectionBlock } from './section'

// Configuración: horarios de los médicos.
export const LAST_DOCTOR = 'clinara.horarios.medico'

/**
 * AD2 (ronda 5): un médico a la vez. Se elige en la lista (con buscador) y se ve sólo su horario, con el mismo
 * formulario. Si hay cambios sin guardar, se pregunta antes de cambiar. Se recuerda el último consultado. En un
 * consultorio (un solo médico) no hay lista.
 */
export function Schedules() {
  const { staff, settings } = useStore()
  const office = features(settings).office
  const doctors = staff.filter((s) => hasRole(s, 'doctor')).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'es'))
  const [q, setQ] = useState('')
  const [id, setId] = useState<string>(() => { try { return localStorage.getItem(LAST_DOCTOR) ?? '' } catch { return '' } })
  const [unsaved, setUnsaved] = useState<(() => Promise<boolean>) | null>(null)
  const [asking, setAsking] = useState<string | null>(null)
  // CF1 (ronda 17): el horario sin guardar cuenta como cambio de la sección; «Descartar» vuelve a montar el formulario
  const [resetKey, setResetKey] = useState(0)
  useSectionBlock('horario', { dirty: !!unsaved, save: async () => (unsaved ? unsaved() : true), reset: () => { setUnsaved(null); setResetKey((k) => k + 1) } })
  const current = doctors.find((d) => d.id === id) ?? doctors[0]
  const n = normalize(q)
  const list = doctors.filter((d) => !n || normalize(`${d.name} ${d.specialty ?? ''}`).includes(n))
  const select = (next: string) => {
    setId(next)
    setUnsaved(null)
    try { localStorage.setItem(LAST_DOCTOR, next) } catch { /* sin almacenamiento */ }
  }
  const choose = (next: string) => { if (next !== current?.id) { if (unsaved) setAsking(next); else select(next) } }
  if (!current) return <div className="empty">No hay médicos en {office ? 'el consultorio' : 'la clínica'}.</div>
  return (
    <div className="stack stack--16" data-tour="tab:horarios">
      <p className="c-muted">Cada día puede tener una o más franjas (por ejemplo, de 08:00 AM a 12:00 PM y de 02:00 PM a 05:00 PM). La agenda y la reserva en línea solo ofrecen horas dentro del horario. Cada médico también puede cambiar el suyo en su <i>Configuración</i>.</p>
      <div className={office || doctors.length < 2 ? '' : 'sched-pick'}>
        {!office && doctors.length > 1 && (
          <nav className="panel sched-pick__list" aria-label="Médicos">
            <div className="panel__body" style={{ paddingBottom: 8 }}>
              <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar médico por nombre" aria-label="Buscar médico por nombre" />
            </div>
            <ul role="listbox" aria-label="Elige un médico">
              {list.map((d) => (
                <li key={d.id}>
                  <button type="button" role="option" aria-selected={d.id === current.id} className={`sched-pick__item${d.id === current.id ? ' is-on' : ''}`} onClick={() => choose(d.id)}>
                    <Avatar name={d.name} color={d.color} /><span><b>{d.name}</b><small>{[d.specialty, d.active ? '' : 'desactivado'].filter(Boolean).join(' · ')}</small></span>
                  </button>
                </li>
              ))}
              {!list.length && <li className="muted" style={{ padding: '8px 16px' }}>Ningún médico coincide.</li>}
            </ul>
          </nav>
        )}
        <ScheduleCard key={`${current.id}-${resetKey}`} d={current} onDirty={(save) => setUnsaved(() => save)} />
      </div>
      {asking && (
        <Modal title="Hay cambios sin guardar" onClose={() => setAsking(null)} footer={<>
          <button className="btn btn--ghost" onClick={() => setAsking(null)}>Cancelar</button>
          <button className="btn btn--soft" onClick={() => { select(asking); setAsking(null) }}>Descartar</button>
          <button className="btn btn--primary" onClick={async () => { if (unsaved && await unsaved()) { select(asking); setAsking(null) } }}>Guardar</button>
        </>}>
          <p>Hay cambios sin guardar en el horario de {current.name}. ¿Guardar antes de cambiar?</p>
        </Modal>
      )}
    </div>
  )
}

export function ScheduleCard({ d, onDirty }: { d: Staff; onDirty?: (save: (() => Promise<boolean>) | null) => void }) {
  const { services, updateStaff } = useStore()
  return (
    <section className="panel">
      <div className="panel__head">
        <div className="cell-person"><Avatar name={d.name} color={d.color} /><div><h2 style={{ fontSize: 16 }}>{d.name}</h2><p>{d.specialty}{d.active ? '' : ', desactivado'}</p></div></div>
      </div>
      <div className="panel__body">
        <ScheduleEditor d={d} onDirty={onDirty} extra={
          <label className="field"><span>Se cobra por defecto</span>
            <Combo value={d.serviceId ?? ''} onChange={(v) => updateStaff(d.id, { serviceId: v }, 'Servicio por defecto guardado')}
              options={[{ value: '', label: 'Ninguno' }, ...services.filter((x) => x.active).map((x) => ({ value: x.id, label: x.name }))]} />
          </label>
        } />
      </div>
    </section>
  )
}
