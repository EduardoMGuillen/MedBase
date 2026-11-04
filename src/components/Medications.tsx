import { useState, type FormEvent } from 'react'
import { isNebulization, loadingAllowed, loadingDroppedByRoute, nebulizationBody, nebulizationReady } from '../lib/medExtras'
import { BuyOutsideFields, EMPTY_NEB, LoadingDoseFields, LoadingDropped, NebulizerFields } from './MedExtras'
import { frequencyHours } from '../lib/inpatient'
import { useStore } from '../lib/store'
import { Pencil, Pill, Plus, TriangleAlert, X } from 'lucide-react'
import { allergyConflict, EMPTY_MED, FREQUENCIES, isPrnFrequency, type Drug } from '../lib/catalogs'
import { autoQuantity, defaultRoute, medicationLine, missingDays, ROUTES } from '../lib/format'
import { normalize } from '../lib/patients'
import { useVademecum } from '../lib/vademecum'
import { lnmeRoute, searchDrugs } from '../lib/drugProvider'
import { DrugPickedHint } from './DrugSuggestion'
import { DrugSearch } from './DrugSearch'
import { AddDrugModal, NotInVademecum } from './AddToVademecum'
import { medHasBlank } from '../lib/orderSets'
import type { Patient, PrescriptionItem } from '../lib/types'

/** Medicamentos indicados: cada uno como fila legible, editable y eliminable antes de firmar. */
export function MedicationList({ items, patient, onEdit, onRemove, editing, requireDuration = false }: {
  items: PrescriptionItem[]; patient: Pick<Patient, 'allergies'>; onEdit?: (i: number) => void; onRemove?: (i: number) => void; editing?: number | null
  /** Ambulatorio: marca los que no tienen días (la receta los necesita). */
  requireDuration?: boolean
}) {
  const vademecum = useVademecum()
  if (!items.length) return null
  return (
    <ol className="meds-list">
      {items.map((it, i) => {
        const allergy = allergyConflict(patient.allergies, it.drug)
        const noDays = requireDuration && missingDays(it)
        // De un set: huecos "___" por llenar y medicamentos que ya no están en el vademécum de la clínica
        const blank = medHasBlank(it)
        const outside = !vademecum.some((d) => normalize(d.name) === normalize(it.drug) || d.aliases?.some((a) => normalize(a) === normalize(it.drug)))
        return (
          <li key={i} className={`${allergy || noDays || blank ? 'is-warn' : ''} ${editing === i ? 'is-editing' : ''}`}>
            <span className="orders__n">{i + 1}.</span>
            <div>
              <span className="meds-list__line"><Pill size={13} className="orders__pill" aria-hidden="true" />{medicationLine(it)}</span>
              {(it.instructions || it.quantity || allergy || it.applyInClinic || noDays || blank || outside) && (
                <small>{[it.applyInClinic && (it.buyOutside ? 'Se aplica en la clínica · Receta (no hay en la clínica)' : 'Se aplica en la clínica'), it.instructions, it.quantity && `Cantidad: ${it.quantity}`, allergy && `Alergia a ${allergy}`,
                  noDays && 'Falta el total de días para la receta', blank && 'Completa los espacios ___', outside && 'No está en el vademécum de la clínica'].filter(Boolean).join(' · ')}</small>
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
  const [overrideAllergy, setOverrideAllergy] = useState(false)
  const [overrideDup, setOverrideDup] = useState(false)
  const q = normalize(m.drug)
  const matches = searchDrugs(drugs, m.drug, 8)
  const exact = drugs.some((d) => normalize(d.name) === q || d.aliases?.some((a) => normalize(a) === q))
  const conflict = m.drug.trim() ? allergyConflict(patient.allergies, m.drug) : null
  const duplicate = q && current.some((x) => normalize(x.drug) === q && x !== initial) ? m.drug.trim() : null
  const pick = (d: Drug) => {
    setM((x) => ({
      ...x, drug: d.name, presentation: d.presentation,
      route: d.usual?.route ?? lnmeRoute(d, x.route) ?? (/ampolla|vial|frasco|bolsa/i.test(d.presentation) ? 'Intravenosa' : defaultRoute(d.presentation)),
      dose: d.usual?.dose ?? x.dose, frequency: d.usual?.frequency ?? x.frequency, duration: d.usual?.duration ?? x.duration,
    }))
    setOverrideAllergy(false); setOverrideDup(false)
  }
  // Ambulatorio: la receta necesita los días (salvo dosis única o si se aplica aquí en la clínica)
  const needsDays = requireDuration && !m.applyInClinic && !/única/i.test(m.frequency)
  // MC2 (ronda 6): un PRN no se agrega sin su condición
  const prn = isPrnFrequency(m.frequency)
  // ME3 y ME4 (ronda 9): la misma lógica que la nota (src/lib/medExtras.ts y components/MedExtras.tsx)
  const neb = isNebulization(m.route)
  const nebValue = m.nebulization ?? EMPTY_NEB
  const nebConflict = neb ? nebValue.components.map((c) => (c.drug.trim() ? allergyConflict(patient.allergies, c.drug) : null)).find(Boolean) ?? null : null
  const repeating = loadingAllowed({ everyHours: frequencyHours(m.frequency), prn, route: m.route })
  const [loading, setLoading] = useState(!!initial?.loadingDose)
  const withLoading = loading && repeating
  // ME9 (ronda 10): marcada y la vía ya no es intravenosa: no se guarda y se avisa (lo escrito vuelve si se regresa a IV)
  const dropped = loadingDroppedByRoute(loading, { everyHours: frequencyHours(m.frequency), prn, route: m.route })
  const ready = (neb ? nebulizationReady(nebValue) && (!nebConflict || overrideAllergy) : m.drug.trim() && m.dose.trim() && (!conflict || overrideAllergy) && (!duplicate || overrideDup))
    && m.frequency && (!prn || m.prnCondition?.trim()) && (m.duration.trim() || !needsDays) && (!withLoading || m.loadingDose?.trim())
  // Con primera dosis distinta o nebulización la cantidad no se calcula sola (texto libre)
  const computed = needsDays && !withLoading && !neb ? autoQuantity(m) : undefined
  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (!ready) return
    if (neb) {
      const clean = { components: nebValue.components.filter((c) => c.drug.trim()).map((c) => ({ drug: c.drug.trim(), amount: c.amount.trim() })),
        diluentVolume: nebValue.diluentVolume?.trim() || undefined, diluent: nebValue.diluent?.trim() || undefined }
      return onSave({ ...m, drug: 'Nebulización', presentation: '', dose: nebulizationBody(clean), nebulization: clean, loadingDose: undefined, duration: m.duration.trim(),
        instructions: m.instructions?.trim() || undefined, quantity: m.quantity?.trim() || undefined, applyInClinic: clinicOption && m.applyInClinic ? true : undefined, buyOutside: buy || undefined, prnCondition: prn ? m.prnCondition?.trim() : undefined })
    }
    onSave({ ...m, drug: m.drug.trim(), presentation: m.presentation.trim(), dose: m.dose.trim(), duration: m.duration.trim(), nebulization: undefined, loadingDose: withLoading ? m.loadingDose!.trim() : undefined,
      instructions: m.instructions?.trim() || undefined, quantity: m.quantity?.trim() || computed || undefined,
      applyInClinic: clinicOption && m.applyInClinic ? true : undefined, buyOutside: buy || undefined, prnCondition: prn ? m.prnCondition?.trim() : undefined })
  }
  const freqs = FREQUENCIES.includes(m.frequency) ? FREQUENCIES : [m.frequency, ...FREQUENCIES]
  // ME10 (ronda 10): con «Aplicar en la clínica», «No hay en la clínica (va a receta)»; la cantidad es la que se compra
  const buy = clinicOption && !!m.applyInClinic && !!m.buyOutside
  return (<>
    <form className="rx-form" onSubmit={submit}>
      {/* ME8 (ronda 10): el buscador compartido; no se abre al tocarlo, sugiere al escribir */}
      {!neb && <DrugSearch value={m.drug} drugs={drugs} autoFocus={!initial} clinicTag placeholder="Busca en el vademécum por nombre genérico o comercial"
        onChange={(t) => { setM({ ...m, drug: t }); setOverrideAllergy(false); setOverrideDup(false) }} onPick={pick}
        extra={(close) => canAdd && q.length >= 3 && !exact ? (
          <button type="button" className="suggest__new" onMouseDown={(e) => e.preventDefault()} onClick={() => { close(); setNewDrug(m.drug.trim()) }}>
            <Plus size={15} />{matches.length ? 'No está en la lista: ' : ''}agregar «{m.drug.trim()}» como nuevo medicamento</button>) : null} />}
      {/* ME11 (ronda 11): la franja con «Agregar al vademécum» */}
      {!neb && <NotInVademecum drugs={drugs} name={m.drug} presentation={m.presentation} route={m.route} onLinked={pick} />}
      <div className="form-grid">
        {!neb && <label className="field"><span>Presentación y concentración</span><input className="input" value={m.presentation} onChange={(e) => setM({ ...m, presentation: e.target.value })} placeholder="Ej. Tableta 500 mg" /><DrugPickedHint drugs={drugs} name={m.drug} presentation={m.presentation} /></label>}
        {!neb && <label className="field"><span>{withLoading ? 'Dosis siguientes' : 'Dosis'}</span><input className="input" value={m.dose} onChange={(e) => setM({ ...m, dose: e.target.value })} placeholder="Ej. 1 g, 1 tableta, 5 ml" /></label>}
        <label className="field"><span>Vía</span><select className="select" value={m.route} onChange={(e) => { const r = e.target.value; setM({ ...m, route: r, nebulization: isNebulization(r) ? m.nebulization ?? structuredClone(EMPTY_NEB) : m.nebulization }) }}>{ROUTES.map((r) => <option key={r}>{r}</option>)}</select></label>
        {neb && <NebulizerFields value={nebValue} onChange={(n) => setM({ ...m, nebulization: n })} allergies={patient.allergies} firstName={patient.firstName} />}
        <label className="field"><span>Frecuencia</span><select className="select" value={m.frequency} onChange={(e) => setM({ ...m, frequency: e.target.value })}>{freqs.map((f) => <option key={f}>{f}</option>)}</select></label>
        {repeating && <LoadingDoseFields checked={loading} onChecked={setLoading} value={m.loadingDose ?? ''} onValue={(v) => setM({ ...m, loadingDose: v })} warn={!!m.drug.trim()} />}
        <LoadingDropped show={dropped && !neb} />
        {prn && <label className="field"><span>Condición</span>
          <input className={`input ${!m.prnCondition?.trim() && m.drug.trim() ? 'input--warn' : ''}`} value={m.prnCondition ?? ''} onChange={(e) => setM({ ...m, prnCondition: e.target.value })} placeholder="Ej. si dolor, si fiebre" aria-required="true" />
          {!m.prnCondition?.trim() && <small className="field__msg field__msg--warn">Obligatoria en un PRN: cuándo se da.</small>}</label>}
        <label className="field"><span>{needsDays ? 'Total de días' : 'Total de días (opcional)'}</span>
          <input className={`input ${needsDays && !m.duration.trim() && m.drug.trim() && m.dose.trim() ? 'input--warn' : ''}`} value={m.duration} onChange={(e) => setM({ ...m, duration: e.target.value })}
            placeholder={/única/i.test(m.frequency) ? 'No aplica' : needsDays ? 'Ej. 3 días' : 'Hasta nueva orden'} />
          {needsDays && !m.duration.trim() && m.drug.trim() && m.dose.trim() && <small className="field__msg field__msg--warn">La receta lleva los días: el paciente se va a su casa.</small>}</label>
        <label className="field"><span>{buy ? 'Cantidad a comprar (opcional)' : 'Cantidad total (opcional)'}</span><input className="input" value={m.quantity ?? ''} onChange={(e) => setM({ ...m, quantity: e.target.value })} placeholder={computed ? `Se calcula: ${computed}` : 'Ej. 20 tabletas'} /></label>
        <label className="field span-2"><span>Indicaciones especiales (opcional)</span><input className="input" value={m.instructions ?? ''} onChange={(e) => setM({ ...m, instructions: e.target.value })} placeholder="Ej. Con los alimentos" /></label>
      </div>
      {clinicOption && (
        <label className="check-line"><input type="checkbox" checked={!!m.applyInClinic} onChange={(e) => setM({ ...m, applyInClinic: e.target.checked })} />
          <span><b>Aplicar en la clínica</b><small>No va a la receta: pasa a la hoja de medicamentos para que enfermería o el médico lo apliquen. El paciente queda en observación mientras se aplica.</small></span></label>
      )}
      {clinicOption && m.applyInClinic && <div className="form-grid"><BuyOutsideFields checked={!!m.buyOutside} onChecked={(v) => setM({ ...m, buyOutside: v })} /></div>}
      {(neb ? nebulizationReady(nebValue) : m.drug.trim() && m.dose.trim()) && <p className="muted" style={{ fontSize: 13.5, overflowWrap: 'anywhere' }}>Se verá así: <b>{medicationLine(neb
        ? { ...m, drug: 'Nebulización', nebulization: nebValue } : { ...m, loadingDose: withLoading ? m.loadingDose : undefined })}</b></p>}
      {neb && nebConflict && !overrideAllergy && (
        <div className="alert-strip" role="alert" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
          <span style={{ display: 'flex', gap: 8 }}><TriangleAlert size={18} style={{ flex: 'none' }} />{patient.firstName} es alérgica/o a {nebConflict}.</span>
          <button type="button" className="btn btn--danger btn--sm" style={{ background: '#fff' }} onClick={() => setOverrideAllergy(true)}>Indicar de todos modos</button>
        </div>
      )}
      {!neb && conflict && (
        <div className="alert-strip" role="alert" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
          <span style={{ display: 'flex', gap: 8 }}><TriangleAlert size={18} style={{ flex: 'none' }} />{patient.firstName} es alérgica/o a {conflict}. {m.drug} puede provocar una reacción.</span>
          {!overrideAllergy && <button type="button" className="btn btn--danger btn--sm" style={{ background: '#fff' }} onClick={() => setOverrideAllergy(true)}>Indicar de todos modos</button>}
        </div>
      )}
      {!neb && duplicate && (
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
    {newDrug !== null && <AddDrugModal name={newDrug} presentation={m.presentation} route={m.route} drugs={drugs} onClose={() => setNewDrug(null)} onDone={(d) => { setNewDrug(null); pick(d) }} />}
    </>
  )
}

