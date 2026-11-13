import { useState } from 'react'
import { Combo, asChange } from './Combo'
import { useStore } from '../lib/store'
import { Modal } from './ui'
import { ROUTES } from '../lib/format'
import type { ClinicDrug } from '../lib/types'
import { routeWords } from '../lib/lnme/route'

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
    <Modal title={drug ? 'Medicamento del vademécum' : 'Agregar medicamento'} onClose={onClose} footer={<>
      {drug && <button className={`btn ${drug.active ? 'btn--danger' : 'btn--soft'} mr-auto`} disabled={busy} onClick={() => save({ active: !drug.active })}>{drug.active ? (l ? 'Archivar' : 'Desactivar') : 'Reactivar'}</button>}
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={f.name.trim().length < 2 || busy} onClick={() => save()}>{drug ? 'Guardar' : 'Agregar'}</button>
    </>}>
      {/* ME6 (ronda 10): todas las columnas del listado nacional (el .md), sin símbolos ni anotaciones en el nombre */}
      {l && <DrugListing l={l} />}
      <div className="form-grid">
        <label className="field span-2"><span>Nombre genérico (obligatorio)</span><input className="input" autoFocus value={f.name} onChange={set('name')} placeholder="Ej. Ademetionina" /></label>
        <label className="field span-2"><span>Nombre comercial</span><input className="input" value={f.brand} onChange={set('brand')} placeholder="Ej. Heptral" /></label>
        <label className="field"><span>Presentación</span><input className="input" value={f.presentation} onChange={set('presentation')} placeholder="Ej. Tabletas" /></label>
        <label className="field"><span>Concentración</span><input className="input" value={f.concentration} onChange={set('concentration')} placeholder="Ej. 400 mg" /></label>
        <label className="field"><span>Vía</span><Combo value={f.route} onChange={(v) => set('route')(asChange(v))} placeholder="—" options={ROUTES} /></label>
        <label className="field"><span>Dosis habitual (opcional)</span><input className="input" data-nocap value={f.usualDose} onChange={set('usualDose')} placeholder="Ej. 1 tableta cada 12 horas" /></label>
        <label className="field span-2"><span>Indicaciones de uso habitual (opcional)</span><input className="input" value={f.usualUse} onChange={set('usualUse')} placeholder="Ej. Colestasis intrahepática" /></label>
      </div>
    </Modal>
  )
}

const CERTAINTY: Record<string, string> = { confirmed: '✔️ Confirmada', unconfirmed: '⚠️ Por confirmar con farmacia', none: 'Sin marca' }

/** ME6 (ronda 10): el detalle del medicamento según el listado nacional (Honduras 2023, AM 5230-2023). */
export function DrugListing({ l }: { l: NonNullable<ClinicDrug['lnme']> }) {
  const rows: [string, string][] = [
    ['Nombre', l.name],
    ['Presentación habitual', l.presentationFull || '—'],
    ['Forma farmacéutica', l.form || '—'],
    ['Vía', routeWords(l.routes) || '—'],
    ['Envase primario', l.package || '—'],
    ['Grupo terapéutico', l.group || '—'],
    ['Subgrupo', l.subgroup || '—'],
    ['N.º en el listado nacional', `${l.no} (Listado Nacional de Medicamentos Esenciales de Honduras 2023, AM 5230-2023)`],
    ['Lista complementaria', l.complementary ? 'Sí' : 'No'],
    ['Restricción de uso', l.restriction || '—'],
    ['Certeza de la presentación', CERTAINTY[l.certainty] ?? 'Sin marca'],
  ]
  return (
    <dl className="drug-listing">
      {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
    </dl>
  )
}
