import { useState, type FormEvent } from 'react'
import { useStore } from '../lib/store'
import { Modal } from './ui'
import { Pencil, Pill, Plus, TriangleAlert, X } from 'lucide-react'
import { allergyConflict, EMPTY_MED, FREQUENCIES, type Drug } from '../lib/catalogs'
import { autoQuantity, defaultRoute, medicationLine, missingDays, ROUTES } from '../lib/format'
import { normalize } from '../lib/patients'
import { useVademecum } from '../lib/vademecum'
import type { Patient, PrescriptionItem } from '../lib/types'

/** Medicamentos indicados: cada uno como fila legible, editable y eliminable antes de firmar. */
export function MedicationList({ items, patient, onEdit, onRemove, editing, requireDuration = false }: {
  items: PrescriptionItem[]; patient: Pick<Patient, 'allergies'>; onEdit?: (i: number) => void; onRemove?: (i: number) => void; editing?: number | null
  /** Ambulatorio: marca los que no tienen días (la receta los necesita). */
  requireDuration?: boolean
}) {
  if (!items.length) return null
  return (
    <ol className="meds-list">
      {items.map((it, i) => {
        const allergy = allergyConflict(patient.allergies, it.drug)
        const noDays = requireDuration && missingDays(it)
        return (
          <li key={i} className={`${allergy || noDays ? 'is-warn' : ''} ${editing === i ? 'is-editing' : ''}`}>
            <span className="orders__n">{i + 1}.</span>
            <div>
              <span className="meds-list__line"><Pill size={13} className="orders__pill" aria-hidden="true" />{medicationLine(it)}</span>
              {(it.instructions || it.quantity || allergy || it.applyInClinic || noDays) && (
                <small>{[it.applyInClinic && 'Se aplica en la clínica', it.instructions, it.quantity && `Cantidad: ${it.quantity}`, allergy && `Alergia a ${allergy}`,
                  noDays && 'Falta el total de días para la receta'].filter(Boolean).join(' · ')}</small>
              )}
            </div>
            <span className="orders__tools">
              {onEdit && <button type="button" className="icon-btn" aria-label={`Editar ${it.drug}`} onClick={() => onEdit(i)}><Pencil size={14} /></button>}
              {onRemove && <button type="button" className="icon-btn" aria-label={`Quitar ${it.drug}`} onClick={() => onRemove(i)}><X size={14} /></button>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * Formulario de un medicamento: buscador en el vademécum (catálogo base y medicamentos agregados por la
 * clínica), presentación, dosis, vía, frecuencia, duración, cantidad e indicaciones. Al elegir del
 * vademécum se precargan los valores habituales. Avisa si el paciente es alérgico o si ya está en la lista.
 * Si un medicamento no aparece, el médico lo registra y queda en el vademécum de la clínica.
 *
 * Los días sólo son obligatorios cuando el paciente se va a su casa (la receta los necesita). Si se ingresa a
 * hospitalización u observación (`requireDuration` falso), sin días el medicamento queda "hasta nueva orden".
 * `clinicOption` muestra "Aplicar en la clínica" para la consulta ambulatoria.
 */
export function MedicationForm({ patient, current, initial, onSave, onCancel, submitLabel, requireDuration = true, clinicOption = false }: {
  patient: Pick<Patient, 'firstName' | 'allergies'>; current: PrescriptionItem[]; initial?: PrescriptionItem
  onSave: (item: PrescriptionItem) => void; onCancel: () => void; submitLabel?: string; requireDuration?: boolean; clinicOption?: boolean
}) {
  const drugs = useVademecum()
  const { can } = useStore()
  const canAdd = can('rx.write') || can('drugs.manage')
  const [newDrug, setNewDrug] = useState<string | null>(null)
  const [m, setM] = useState<PrescriptionItem>({ ...EMPTY_MED, ...initial })
  const [open, setOpen] = useState(!initial)
  const [overrideAllergy, setOverrideAllergy] = useState(false)
  const [overrideDup, setOverrideDup] = useState(false)
  const q = normalize(m.drug)
  const matches = q ? drugs.filter((d) => normalize(`${d.name} ${d.brand ?? ''}`).includes(q)).slice(0, 8) : drugs.slice(0, 8)
  const exact = drugs.some((d) => normalize(d.name) === q)
  const conflict = m.drug.trim() ? allergyConflict(patient.allergies, m.drug) : null
  const duplicate = q && current.some((x) => normalize(x.drug) === q && x !== initial) ? m.drug.trim() : null
  const pick = (d: Drug) => {
    setM((x) => ({
      ...x, drug: d.name, presentation: d.presentation,
      route: d.usual?.route ?? (/ampolla|vial|frasco|bolsa/i.test(d.presentation) ? 'Intravenosa' : defaultRoute(d.presentation)),
      dose: d.usual?.dose ?? x.dose, frequency: d.usual?.frequency ?? x.frequency, duration: d.usual?.duration ?? x.duration,
    }))
    setOpen(false); setOverrideAllergy(false); setOverrideDup(false)
  }
  // Ambulatorio: la receta necesita los días (salvo dosis única o si se aplica aquí en la clínica)
  const needsDays = requireDuration && !m.applyInClinic && !/única/i.test(m.frequency)
  const ready = m.drug.trim() && m.dose.trim() && m.frequency && (m.duration.trim() || !needsDays) && (!conflict || overrideAllergy) && (!duplicate || overrideDup)
  const computed = needsDays ? autoQuantity(m) : undefined
  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (!ready) return
    onSave({ ...m, drug: m.drug.trim(), presentation: m.presentation.trim(), dose: m.dose.trim(), duration: m.duration.trim(),
      instructions: m.instructions?.trim() || undefined, quantity: m.quantity?.trim() || computed || undefined,
      applyInClinic: clinicOption && m.applyInClinic ? true : undefined })
  }
  const freqs = FREQUENCIES.includes(m.frequency) ? FREQUENCIES : [m.frequency, ...FREQUENCIES]
  return (<>
    <form className="rx-form" onSubmit={submit}>
      <div className="field suggest">
        <span>Medicamento</span>
        <input className="input" autoFocus={!initial} value={m.drug} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} autoComplete="off"
          onChange={(e) => { setM({ ...m, drug: e.target.value }); setOverrideAllergy(false); setOverrideDup(false); setOpen(true) }} placeholder="Busca en el vademécum por nombre genérico o comercial" />
        {open && (matches.length > 0 || (canAdd && q.length >= 3 && !exact)) && (
          <div className="suggest__list">
            {matches.map((d) => (
              <button type="button" key={`${d.name}|${d.presentation}`} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(d)}>
                <span>{d.name}{d.brand ? <small className="muted"> ({d.brand})</small> : null}</span>
                <span style={{ color: 'var(--muted)', marginLeft: 'auto' }}>{d.presentation}{d.clinicId ? ' · de la clínica' : ''}</span>
              </button>
            ))}
            {canAdd && q.length >= 3 && !exact && (
              <button type="button" className="suggest__new" onMouseDown={(e) => e.preventDefault()} onClick={() => { setOpen(false); setNewDrug(m.drug.trim()) }}>
                <Plus size={15} />{matches.length ? 'No está en la lista: ' : ''}agregar «{m.drug.trim()}» como nuevo medicamento</button>
            )}
          </div>
        )}
      </div>
      <div className="form-grid">
        <label className="field"><span>Presentación y concentración</span><input className="input" value={m.presentation} onChange={(e) => setM({ ...m, presentation: e.target.value })} placeholder="Ej. Tableta 500 mg" /></label>
        <label className="field"><span>Dosis</span><input className="input" value={m.dose} onChange={(e) => setM({ ...m, dose: e.target.value })} placeholder="Ej. 1 g, 1 tableta, 5 ml" /></label>
        <label className="field"><span>Vía</span><select className="select" value={m.route} onChange={(e) => setM({ ...m, route: e.target.value })}>{ROUTES.map((r) => <option key={r}>{r}</option>)}</select></label>
        <label className="field"><span>Frecuencia</span><select className="select" value={m.frequency} onChange={(e) => setM({ ...m, frequency: e.target.value })}>{freqs.map((f) => <option key={f}>{f}</option>)}</select></label>
        <label className="field"><span>{needsDays ? 'Total de días' : 'Total de días (opcional)'}</span>
          <input className={`input ${needsDays && !m.duration.trim() && m.drug.trim() && m.dose.trim() ? 'input--warn' : ''}`} value={m.duration} onChange={(e) => setM({ ...m, duration: e.target.value })}
            placeholder={/única/i.test(m.frequency) ? 'No aplica' : needsDays ? 'Ej. 3 días' : 'Hasta nueva orden'} />
          {needsDays && !m.duration.trim() && m.drug.trim() && m.dose.trim() && <small className="field__msg field__msg--warn">La receta lleva los días: el paciente se va a su casa.</small>}</label>
        <label className="field"><span>Cantidad total (opcional)</span><input className="input" value={m.quantity ?? ''} onChange={(e) => setM({ ...m, quantity: e.target.value })} placeholder={computed ? `Se calcula: ${computed}` : 'Ej. 20 tabletas'} /></label>
        <label className="field span-2"><span>Indicaciones especiales (opcional)</span><input className="input" value={m.instructions ?? ''} onChange={(e) => setM({ ...m, instructions: e.target.value })} placeholder="Ej. Con los alimentos" /></label>
      </div>
      {clinicOption && (
        <label className="check-line"><input type="checkbox" checked={!!m.applyInClinic} onChange={(e) => setM({ ...m, applyInClinic: e.target.checked })} />
          <span><b>Aplicar en la clínica</b><small>No va a la receta: pasa a la hoja de medicamentos para que enfermería o el médico lo apliquen. El paciente queda en observación mientras se aplica.</small></span></label>
      )}
      {m.drug.trim() && m.dose.trim() && <p className="muted" style={{ fontSize: 13.5 }}>Se verá así: <b>{medicationLine(m)}</b></p>}
      {conflict && (
        <div className="alert-strip" role="alert" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
          <span style={{ display: 'flex', gap: 8 }}><TriangleAlert size={18} style={{ flex: 'none' }} />{patient.firstName} es alérgica/o a {conflict}. {m.drug} puede provocar una reacción.</span>
          {!overrideAllergy && <button type="button" className="btn btn--danger btn--sm" style={{ background: '#fff' }} onClick={() => setOverrideAllergy(true)}>Indicar de todos modos</button>}
        </div>
      )}
      {duplicate && (
        <div className="alert-strip alert-strip--amber" role="alert" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
          <span>{duplicate} ya está en la lista de medicamentos.</span>
          {!overrideDup && <button type="button" className="btn btn--ghost btn--sm" style={{ background: '#fff' }} onClick={() => setOverrideDup(true)}>Agregarlo otra vez</button>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn--primary" disabled={!ready}><Plus size={16} />{submitLabel ?? (initial ? 'Guardar cambios' : 'Agregar medicamento')}</button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
    {newDrug !== null && <NewDrugModal name={newDrug} onClose={() => setNewDrug(null)} onCreated={(d) => { setNewDrug(null); pick(d) }} />}
    </>
  )
}

const FORMS = ['Tableta', 'Cápsula', 'Jarabe', 'Suspensión', 'Gotas', 'Ampolla', 'Vial', 'Crema', 'Ungüento', 'Gel', 'Inhalador', 'Supositorio', 'Óvulo', 'Parche', 'Solución']

/** Registra un medicamento que no está en el vademécum: queda disponible para todos los médicos de la clínica. */
export function NewDrugModal({ name, onClose, onCreated }: { name: string; onClose: () => void; onCreated: (d: Drug) => void }) {
  const { addClinicDrug } = useStore()
  const [f, setF] = useState({ name, brand: '', presentation: 'Tableta', concentration: '', route: 'Oral' })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  return (
    <Modal title="Nuevo medicamento" onClose={onClose} footer={<>
      <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button type="button" className="btn btn--primary" disabled={f.name.trim().length < 2 || busy} onClick={async () => {
        setBusy(true)
        const d = await addClinicDrug({ name: f.name.trim(), brand: f.brand.trim() || undefined, presentation: f.presentation || undefined, concentration: f.concentration.trim() || undefined, route: f.route })
        setBusy(false)
        if (d) onCreated({ name: d.name, brand: d.brand, presentation: [d.presentation, d.concentration].filter(Boolean).join(' '), group: 'clínica', clinicId: d.id,
          usual: { dose: '', route: d.route ?? 'Oral', frequency: 'Cada 8 horas', duration: '' } })
      }}><Plus size={16} />Agregar al vademécum</button>
    </>}>
      <p className="muted" style={{ fontSize: 13.5 }}>No está en el vademécum. Al guardarlo queda disponible para todos los médicos de la clínica, marcado como agregado por la clínica.</p>
      <div className="form-grid">
        <label className="field span-2"><span>Nombre genérico</span><input className="input" autoFocus value={f.name} onChange={set('name')} /></label>
        <label className="field span-2"><span>Nombre comercial (opcional)</span><input className="input" value={f.brand} onChange={set('brand')} placeholder="Ej. Tylenol" /></label>
        <label className="field"><span>Presentación</span><select className="select" value={f.presentation} onChange={set('presentation')}>{FORMS.map((x) => <option key={x}>{x}</option>)}</select></label>
        <label className="field"><span>Concentración</span><input className="input" value={f.concentration} onChange={set('concentration')} placeholder="Ej. 500 mg, 250 mg/5 ml" /></label>
        <label className="field span-2"><span>Vía habitual</span><select className="select" value={f.route} onChange={set('route')}>{ROUTES.map((r) => <option key={r}>{r}</option>)}</select></label>
      </div>
    </Modal>
  )
}
