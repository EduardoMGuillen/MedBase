import { useState } from 'react'
import { useStore } from '../lib/store'
import { Modal } from './ui'
import { ROUTES } from '../lib/format'
import type { ClinicDrug } from '../lib/types'
import { UNCONFIRMED } from './DrugSuggestion'

/**
 * AD4: medicamento del vademécum de la clínica: agregar (desde la consulta, Mi configuración o Configuración) o editar
 * uno que agregó la clínica (su autor o administración). Nunca se borra: se desactiva.
 */
export function DrugForm({ drug, initialName = '', onClose }: { drug?: ClinicDrug; initialName?: string; onClose: () => void }) {
  const { addClinicDrug, updateClinicDrug } = useStore()
  const [f, setF] = useState({
    name: drug?.name ?? initialName, brand: drug?.brand ?? '', presentation: drug?.presentation ?? '', concentration: drug?.concentration ?? '',
    // ME5: uno del LNME sin vía propia la deja vacía (el listado la trae en texto)
    route: drug?.route ?? (drug?.lnme ? '' : 'Oral'), usualDose: drug?.usualDose ?? '', usualUse: drug?.usualUse ?? '',
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
  // ME5: los del LNME se archivan (se ocultan); nada se borra y ninguna carga los reactiva
  const l = drug?.lnme
  return (
    <Modal title={l?.match === 'created' ? 'Medicamento del LNME' : drug ? 'Medicamento de la clínica' : 'Agregar medicamento'} onClose={onClose} footer={<>
      {drug && <button className={`btn ${drug.active ? 'btn--danger' : 'btn--soft'}`} style={{ marginRight: 'auto' }} disabled={busy} onClick={() => save({ active: !drug.active })}>{drug.active ? (l ? 'Archivar' : 'Desactivar') : 'Reactivar'}</button>}
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={f.name.trim().length < 2 || busy} onClick={() => save()}>{drug ? 'Guardar' : 'Agregar'}</button>
    </>}>
      {l && (
        <p className="muted" style={{ fontSize: 13.5, margin: '0 0 12px' }}>
          <b>LNME Honduras 2023 (AM 5230-2023) · #{l.no}</b>{l.complementary ? ' · Lista complementaria' : ''}<br />
          {[l.group, l.subgroup].filter(Boolean).join(' › ')}<br />
          {[l.presentationFull && `Presentación del listado: ${l.presentationFull}`, l.form, l.routes && `Vía: ${l.routes}`, l.package && `Envase: ${l.package}`].filter(Boolean).join(' · ')}
          {l.certainty === 'unconfirmed' && <><br /><span className="field__msg--warn">{UNCONFIRMED}</span></>}
          {l.restriction && <><br />{l.restriction}</>}
          {drug?.origin === 'clinic' && l.match === 'created' && <><br />Editado por la clínica: las cargas del listado ya no lo cambian.</>}
        </p>
      )}
      <div className="form-grid">
        <label className="field span-2"><span>Nombre genérico (obligatorio)</span><input className="input" autoFocus value={f.name} onChange={set('name')} placeholder="Ej. Ademetionina" /></label>
        <label className="field span-2"><span>Nombre comercial</span><input className="input" value={f.brand} onChange={set('brand')} placeholder="Ej. Heptral" /></label>
        <label className="field"><span>Presentación</span><input className="input" value={f.presentation} onChange={set('presentation')} placeholder="Ej. Tabletas" /></label>
        <label className="field"><span>Concentración</span><input className="input" value={f.concentration} onChange={set('concentration')} placeholder="Ej. 400 mg" /></label>
        <label className="field"><span>Vía</span><select className="select" value={f.route} onChange={set('route')}>{f.route === '' && <option value="">—</option>}{ROUTES.map((r) => <option key={r}>{r}</option>)}</select></label>
        <label className="field"><span>Dosis habitual (opcional)</span><input className="input" value={f.usualDose} onChange={set('usualDose')} placeholder="Ej. 1 tableta cada 12 horas" /></label>
        <label className="field span-2"><span>Indicaciones de uso habitual (opcional)</span><input className="input" value={f.usualUse} onChange={set('usualUse')} placeholder="Ej. Colestasis intrahepática" /></label>
      </div>
    </Modal>
  )
}
