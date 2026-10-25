import { useState, type FormEvent } from 'react'
import { Pencil, Pill, Plus, TriangleAlert, X } from 'lucide-react'
import { allergyConflict, EMPTY_MED, FREQUENCIES, type Drug } from '../lib/catalogs'
import { defaultRoute, medicationLine, ROUTES } from '../lib/format'
import { normalize } from '../lib/patients'
import { useVademecum } from '../lib/vademecum'
import type { Patient, PrescriptionItem } from '../lib/types'

/** Medicamentos indicados: cada uno como fila legible, editable y eliminable antes de firmar. */
export function MedicationList({ items, patient, onEdit, onRemove, editing }: {
  items: PrescriptionItem[]; patient: Pick<Patient, 'allergies'>; onEdit?: (i: number) => void; onRemove?: (i: number) => void; editing?: number | null
}) {
  if (!items.length) return null
  return (
    <ol className="meds-list">
      {items.map((it, i) => {
        const allergy = allergyConflict(patient.allergies, it.drug)
        return (
          <li key={i} className={`${allergy ? 'is-warn' : ''} ${editing === i ? 'is-editing' : ''}`}>
            <span className="orders__n">{i + 1}.</span>
            <div>
              <span className="meds-list__line"><Pill size={13} className="orders__pill" aria-hidden="true" />{medicationLine(it)}</span>
              {(it.instructions || it.quantity || allergy) && (
                <small>{[it.instructions, it.quantity && `Cantidad: ${it.quantity}`, allergy && `Alergia a ${allergy}`].filter(Boolean).join(' · ')}</small>
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
 * `onNewDrug` ofrece registrar un medicamento que no aparece en el vademécum.
 */
export function MedicationForm({ patient, current, initial, onSave, onCancel, onNewDrug, submitLabel }: {
  patient: Pick<Patient, 'firstName' | 'allergies'>; current: PrescriptionItem[]; initial?: PrescriptionItem
  onSave: (item: PrescriptionItem) => void; onCancel: () => void; onNewDrug?: (name: string, pick: (d: Drug) => void) => void; submitLabel?: string
}) {
  const drugs = useVademecum()
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
  const ready = m.drug.trim() && m.dose.trim() && m.frequency && (m.duration.trim() || /única/i.test(m.frequency)) && (!conflict || overrideAllergy) && (!duplicate || overrideDup)
  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (!ready) return
    onSave({ ...m, drug: m.drug.trim(), presentation: m.presentation.trim(), dose: m.dose.trim(), duration: m.duration.trim(),
      instructions: m.instructions?.trim() || undefined, quantity: m.quantity?.trim() || undefined })
  }
  const freqs = FREQUENCIES.includes(m.frequency) ? FREQUENCIES : [m.frequency, ...FREQUENCIES]
  return (
    <form className="rx-form" onSubmit={submit}>
      <div className="field suggest">
        <span>Medicamento</span>
        <input className="input" autoFocus={!initial} value={m.drug} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} autoComplete="off"
          onChange={(e) => { setM({ ...m, drug: e.target.value }); setOverrideAllergy(false); setOverrideDup(false); setOpen(true) }} placeholder="Busca en el vademécum por nombre genérico o comercial" />
        {open && (matches.length > 0 || (onNewDrug && q.length >= 3 && !exact)) && (
          <div className="suggest__list">
            {matches.map((d) => (
              <button type="button" key={`${d.name}|${d.presentation}`} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(d)}>
                <span>{d.name}{d.brand ? <small className="muted"> ({d.brand})</small> : null}</span>
                <span style={{ color: 'var(--muted)', marginLeft: 'auto' }}>{d.presentation}{d.clinicId ? ' · de la clínica' : ''}</span>
              </button>
            ))}
            {onNewDrug && q.length >= 3 && !exact && (
              <button type="button" className="suggest__new" onMouseDown={(e) => e.preventDefault()} onClick={() => { setOpen(false); onNewDrug(m.drug.trim(), pick) }}>
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
        <label className="field"><span>Duración</span><input className="input" value={m.duration} onChange={(e) => setM({ ...m, duration: e.target.value })} placeholder={/única/i.test(m.frequency) ? 'No aplica' : 'Ej. 3 días'} /></label>
        <label className="field"><span>Cantidad total (opcional)</span><input className="input" value={m.quantity ?? ''} onChange={(e) => setM({ ...m, quantity: e.target.value })} placeholder="Ej. 20 tabletas" /></label>
        <label className="field span-2"><span>Indicaciones especiales (opcional)</span><input className="input" value={m.instructions ?? ''} onChange={(e) => setM({ ...m, instructions: e.target.value })} placeholder="Ej. Con los alimentos" /></label>
      </div>
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
  )
}
