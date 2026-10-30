import { useState } from 'react'
import { useStore } from '../lib/store'
import { Modal } from './ui'
import { ROUTES } from '../lib/format'
import type { ClinicDrug } from '../lib/types'

/**
 * AD4: medicamento del vademécum de la clínica: agregar (desde la consulta, Mi configuración o Configuración) o editar
 * uno que agregó la clínica (su autor o administración). Nunca se borra: se desactiva.
 */
export function DrugForm({ drug, initialName = '', onClose }: { drug?: ClinicDrug; initialName?: string; onClose: () => void }) {
  const { addClinicDrug, updateClinicDrug } = useStore()
  const [f, setF] = useState({
    name: drug?.name ?? initialName, brand: drug?.brand ?? '', presentation: drug?.presentation ?? '', concentration: drug?.concentration ?? '',
    route: drug?.route ?? 'Oral', usualDose: drug?.usualDose ?? '', usualUse: drug?.usualUse ?? '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  const body = { name: f.name.trim(), brand: f.brand.trim(), presentation: f.presentation.trim(), concentration: f.concentration.trim(), route: f.route, usualDose: f.usualDose.trim(), usualUse: f.usualUse.trim() }
  const save = async (extra: Partial<ClinicDrug> = {}) => {
    setBusy(true)
    const r = drug ? await updateClinicDrug(drug.id, { ...body, ...extra }) : await addClinicDrug(Object.fromEntries(Object.entries(body).filter(([, v]) => v)) as typeof body)
    setBusy(false)
    if (r) onClose()
  }
  return (
    <Modal title={drug ? 'Medicamento de la clínica' : 'Agregar medicamento'} onClose={onClose} footer={<>
      {drug && <button className={`btn ${drug.active ? 'btn--danger' : 'btn--soft'}`} style={{ marginRight: 'auto' }} disabled={busy} onClick={() => save({ active: !drug.active })}>{drug.active ? 'Desactivar' : 'Reactivar'}</button>}
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={f.name.trim().length < 2 || busy} onClick={() => save()}>{drug ? 'Guardar' : 'Agregar'}</button>
    </>}>
      <div className="form-grid">
        <label className="field span-2"><span>Nombre genérico (obligatorio)</span><input className="input" autoFocus value={f.name} onChange={set('name')} placeholder="Ej. Ademetionina" /></label>
        <label className="field span-2"><span>Nombre comercial</span><input className="input" value={f.brand} onChange={set('brand')} placeholder="Ej. Heptral" /></label>
        <label className="field"><span>Presentación</span><input className="input" value={f.presentation} onChange={set('presentation')} placeholder="Ej. Tabletas" /></label>
        <label className="field"><span>Concentración</span><input className="input" value={f.concentration} onChange={set('concentration')} placeholder="Ej. 400 mg" /></label>
        <label className="field"><span>Vía</span><select className="select" value={f.route} onChange={set('route')}>{ROUTES.map((r) => <option key={r}>{r}</option>)}</select></label>
        <label className="field"><span>Dosis habitual (opcional)</span><input className="input" value={f.usualDose} onChange={set('usualDose')} placeholder="Ej. 1 tableta cada 12 horas" /></label>
        <label className="field span-2"><span>Indicaciones de uso habitual (opcional)</span><input className="input" value={f.usualUse} onChange={set('usualUse')} placeholder="Ej. Colestasis intrahepática" /></label>
      </div>
    </Modal>
  )
}
