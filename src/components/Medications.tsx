import { useState, type FormEvent, type ReactNode } from 'react'
import { Combo } from './Combo'
import { isNebulization, loadingAllowed, loadingDroppedByRoute, nebulizationBody, nebulizationReady } from '../lib/medExtras'
import { BuyOutsideFields, EMPTY_NEB, LoadingDoseFields, LoadingDropped, NebulizerFields } from './MedExtras'
import { frequencyHours, medLabel } from '../lib/inpatient'
import { useStore } from '../lib/store'
import { Pencil, Pill, Plus, TriangleAlert, X } from 'lucide-react'
import { allergyConflict, type Drug } from '../lib/catalogs'
import { autoQuantity, defaultRoute, dmyTime, inputDateTime, medicationLine, missingDays } from '../lib/format'
import { fromLocalValue } from '../lib/dateInput'
import { INFUSION_UNITS } from '../lib/clinicalConfig'
import { blankDraft, canInfuse, draftFromItem, draftFromStay, frequencyOf, rateIssue, STANDARD_HOURS, stayDays, type MedDraft, type MedPlace, type StayMed } from '../lib/medForm'
import { RouteField } from './RouteField'
import { DateTimeField } from './DateTimeField'
import { normalize } from '../lib/patients'
import { useVademecum } from '../lib/vademecum'
import { lnmeRoute, searchDrugs } from '../lib/drugProvider'
import { DrugPickedHint } from './DrugSuggestion'
import { DrugSearch } from './DrugSearch'
import { AddDrugModal, NotInVademecum } from './AddToVademecum'
import { medHasBlank } from '../lib/orderSets'
import type { InfusionUnit, Patient, PrescriptionItem } from '../lib/types'

/** Medicamentos indicados: cada uno como fila legible, editable y eliminable antes de firmar. */
export function MedicationList({ items, patient, onEdit, onRemove, editing, requireDuration = false, warn }: {
  items: PrescriptionItem[]; patient: Pick<Patient, 'allergies'>; onEdit?: (i: number) => void; onRemove?: (i: number) => void; editing?: number | null
  /** Ambulatorio: marca los que no tienen días (la receta los necesita). */
  requireDuration?: boolean
  /** ME13 (ronda 14): un aviso propio de la fila (p. ej. «Sin ingreso solo se permite dosis STAT…»). */
  warn?: (it: PrescriptionItem) => string | undefined
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
        const own = warn?.(it)
        return (
          <li key={i} className={`${allergy || noDays || blank || own ? 'is-warn' : ''} ${editing === i ? 'is-editing' : ''}`}>
            <span className="orders__n">{i + 1}.</span>
            <div>
              <span className="meds-list__line"><Pill size={13} className="orders__pill" aria-hidden="true" />{medicationLine(it)}</span>
              {(it.instructions || it.quantity || allergy || it.applyInClinic || noDays || blank || outside || own || it.infusionRate) && (
                <small>{[it.applyInClinic && (it.buyOutside ? 'Se aplica en la clínica · Receta (no hay en la clínica)' : 'Se aplica en la clínica'), it.infusionRate && it.firstAt && `Inicio: ${dmyTime(it.firstAt)}`, it.instructions, it.quantity && `Cantidad: ${it.quantity}`, allergy && `Alergia a ${allergy}`,
                  noDays && 'Falta el total de días para la receta', blank && 'Completa los espacios ___', outside && 'No está en el vademécum de la clínica', own].filter(Boolean).join(' · ')}</small>
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

type FormCommon = {
  patient: Pick<Patient, 'firstName' | 'allergies'>
  /** ME16: dónde está el formulario (consulta sin o con ingreso, nota de la estancia o receta). Sin dato: receta. */
  place?: MedPlace
  /** Lo que ya está indicado (para el aviso «ya está en la lista»). */
  current?: { drug: string }[]
  onCancel: () => void
  submitLabel?: string
  /** Receta: los días son obligatorios (el paciente se va a su casa). */
  requireDuration?: boolean
}
type ItemForm = FormCommon & {
  kind?: 'item'; initial?: PrescriptionItem
  onSave: (item: PrescriptionItem) => void; onSaveAnother?: (item: PrescriptionItem) => void
}
type StayForm = FormCommon & {
  kind: 'stay'
  /** `firstAt` como valor del campo de fecha y hora; `loadingGivenAt`: la dosis inicial ya se administró («Cambiar»). */
  initial?: StayMed & { loadingGivenAt?: string }
  onSave: (m: StayMed) => void; onSaveAnother?: (m: StayMed) => void
}

/**
 * ME16 (ronda 16): EL formulario de medicamento, uno solo para la consulta externa (sin y con ingreso), las notas de ingreso,
 * evolución y postquirúrgica de observación y hospitalización, la receta suelta, la de egreso y la corrección de la receta. Lo
 * que cambia por lugar es solo qué se muestra (tabla de ME16 del pedido; `MedPlace` en src/lib/medForm.ts):
 * - Medicamento (DrugSearch, ME8), «Agregar al vademécum» (ME11), presentación y concentración, dosis, vía (ME17), frecuencia,
 *   PRN con su condición, primera dosis diferente (ME2/ME3, solo IV), nebulización (ME4), total de días, cantidad total,
 *   indicaciones, alergias y repetidos: en todos los lugares.
 * - «Infusión continua» (ME1: velocidad, unidad y «Hora de inicio» con «Ahora»): en cualquier paciente (IF1, ronda 17).
 * - «Hora de la dosis» y la hora de la dosis inicial: en la estancia (en la consulta con ingreso la primera dosis es la llegada
 *   a la unidad, como siempre).
 * - «Aplicar en la clínica»: solo en la consulta sin ingreso (ME13: dosis STAT); con ingreso todo pasa a la hoja (NO1).
 * - «No hay en la clínica (va a receta)»: con «Aplicar en la clínica», con ingreso y en la estancia (ME10); no en la receta.
 * `kind="stay"` devuelve una orden de la hoja (`StayMed`); si no, un renglón de la receta (`PrescriptionItem`).
 */
export function MedicationForm(props: ItemForm | StayForm) {
  const { patient, current = [], onCancel, submitLabel, requireDuration = true } = props
  const stayKind = props.kind === 'stay'
  const place: MedPlace = props.place ?? (stayKind ? { where: 'stay' } : { where: 'rx' })
  const loadingGivenAt = stayKind ? props.initial?.loadingGivenAt : undefined
  const drugs = useVademecum()
  const { can } = useStore()
  const canAdd = can('rx.write') || can('drugs.manage')
  const [newDrug, setNewDrug] = useState<string | null>(null)
  const [d, setD] = useState<MedDraft>(() => {
    const x = props.kind === 'stay' ? (props.initial ? draftFromStay(props.initial, place) : blankDraft(place)) : props.initial ? draftFromItem(props.initial, place) : blankDraft(place)
    // En la estancia la hora de la dosis empieza en ahora (sin hora, el formulario pone la actual)
    return place.where === 'stay' && !x.firstAt ? { ...x, firstAt: inputDateTime(new Date()) } : x
  })
  const set = (patch: Partial<MedDraft>) => setD((x) => ({ ...x, ...patch }))
  const [overrideAllergy, setOverrideAllergy] = useState(false)
  const [overrideDup, setOverrideDup] = useState(false)
  const initialDrug = props.initial?.drug

  const consult = place.where === 'consult'
  const admitting = place.where === 'consult' && place.admitting
  const inStay = place.where === 'stay'
  const q = normalize(d.drug)
  const matches = searchDrugs(drugs, d.drug, 8)
  const exact = drugs.some((x) => normalize(x.name) === q || x.aliases?.some((a) => normalize(a) === q))
  const neb = isNebulization(d.route)
  const infusionOk = canInfuse(place) && !neb
  const infusion = d.freq === 'infusion' && infusionOk
  // ME13 (ronda 14): «Aplicar en la clínica» solo sin ingreso, y lo que se aplica es una dosis STAT (nunca se cambia sola una
  // frecuencia que ya estaba: se muestra y el formulario no deja guardarla)
  const applyShown = place.where === 'consult' && !place.admitting && !!place.canApply
  const apply = applyShown && !!d.applyInClinic
  const statOnly = apply
  const frequency = frequencyOf(d)
  const once = /única/i.test(frequency)
  const hours = /^\d+$/.test(d.freq) ? Number(d.freq) : d.freq === 'custom' ? frequencyHours(d.customFreq ?? '') : undefined
  // MC2 (ronda 6): un PRN no se agrega sin su condición
  const prn = d.prn && !infusion
  const conflict = !neb && d.drug.trim() ? allergyConflict(patient.allergies, d.drug) : null
  const duplicate = !neb && q && current.some((x) => normalize(x.drug) === q) && normalize(initialDrug ?? '') !== q ? d.drug.trim() : null
  const nebValue = d.nebulization ?? EMPTY_NEB
  const nebConflict = neb ? nebValue.components.map((c) => (c.drug.trim() ? allergyConflict(patient.allergies, c.drug) : null)).find(Boolean) ?? null : null
  // ME2/ME3 y ME9: primera dosis distinta solo con una frecuencia cada tantas horas y vía intravenosa
  const repeating = loadingAllowed({ everyHours: infusion || once ? undefined : hours, prn, infusion, route: d.route })
  const withLoading = d.loading && repeating && !statOnly
  const dropped = !loadingGivenAt && !statOnly && loadingDroppedByRoute(d.loading, { everyHours: infusion || once ? undefined : hours, prn, infusion, route: d.route })
  // Los días solo son obligatorios cuando el paciente se va a su casa con la receta (sin ingreso y sin aplicar aquí)
  const needsDays = ((place.where === 'rx' && requireDuration) || (consult && !admitting && !apply)) && !once && !infusion
  const days = inStay ? stayDays(d.duration) : undefined
  const daysBad = inStay && days === null
  const rIssue = infusion ? rateIssue(d.rate, d.infusionUnit) : ''
  const unit = INFUSION_UNITS.find((u) => u.value === d.infusionUnit) ?? INFUSION_UNITS[0]
  const statBad = statOnly && !once
  // ME10 (ronda 10): «No hay en la clínica (va a receta)»: donde se aplica en la clínica (con «Aplicar», con ingreso, en la estancia)
  const buyShown = inStay || admitting || apply
  const buy = buyShown && d.buyOutside
  const showTime = inStay && (!prn || infusion) && !withLoading
  const showStart = admitting && infusion
  // Con primera dosis distinta, infusión o nebulización la cantidad no se calcula sola (texto libre)
  const computed = (needsDays || (inStay && !!days)) && !withLoading && !neb && !infusion
    ? autoQuantity({ dose: d.dose, frequency: hours ? `Cada ${hours} horas` : frequency, duration: inStay && days ? `${days} días` : d.duration }) : undefined

  const missing = neb
    ? (!nebulizationReady(nebValue) ? 'al menos un medicamento con su cantidad' : prn && !d.prnCondition.trim() ? 'la condición PRN' : nebConflict && !overrideAllergy ? 'confirmar la alergia' : '')
    : !d.drug.trim() ? 'el medicamento' : !d.dose.trim() ? (withLoading ? 'la dosis siguiente' : 'la dosis') : !d.route.trim() ? 'la vía'
    : prn && !d.prnCondition.trim() ? 'la condición PRN' : infusion && rIssue ? 'la velocidad de infusión' : withLoading && !d.loadingDose.trim() ? 'la dosis inicial'
    : conflict && !overrideAllergy ? 'confirmar la alergia' : duplicate && !overrideDup ? 'confirmar el medicamento repetido' : ''
  const extraMissing = missing ? '' : !frequency ? 'la frecuencia' : needsDays && !d.duration.trim() ? 'el total de días' : daysBad ? 'el total de días en número (1 a 365)'
    : statBad ? 'cambiar a dosis STAT' : (showTime || showStart) && !d.firstAt ? (infusion ? 'la hora de inicio' : 'la hora de la dosis') : ''
  const why = missing || extraMissing
  const ready = !why

  const nebClean = () => ({ components: nebValue.components.filter((c) => c.drug.trim()).map((c) => ({ drug: c.drug.trim(), amount: c.amount.trim() })),
    diluentVolume: nebValue.diluentVolume?.trim() || undefined, diluent: nebValue.diluent?.trim() || undefined })
  const iso = (v: string) => fromLocalValue(v).toISOString()
  const rateNum = infusion ? Number(d.rate.trim().replace(',', '.')) : undefined

  /** Un renglón de la receta (consulta externa y recetas). */
  const toItem = (): PrescriptionItem => {
    const base = props.kind === 'stay' ? {} : props.initial ?? {}
    const common = {
      route: d.route.trim(), duration: d.duration.trim(), instructions: d.instructions.trim() || undefined, prnCondition: prn ? d.prnCondition.trim() : undefined,
      applyInClinic: applyShown ? (apply ? true : undefined) : undefined, buyOutside: buy || undefined,
    }
    if (neb) {
      const clean = nebClean()
      return { ...base, ...common, drug: 'Nebulización', presentation: '', dose: nebulizationBody(clean), nebulization: clean, frequency, loadingDose: undefined, infusionRate: undefined, infusionUnit: undefined, firstAt: undefined,
        quantity: d.quantity.trim() || undefined }
    }
    return { ...base, ...common, drug: d.drug.trim(), presentation: d.presentation.trim(), dose: d.dose.trim(), frequency, nebulization: undefined,
      loadingDose: withLoading ? d.loadingDose.trim() : undefined, quantity: d.quantity.trim() || computed || undefined,
      // ME16: la infusión de la consulta con ingreso llega a la hoja como infusión, con su velocidad, unidad y hora de inicio
      infusionRate: infusion ? rateNum : undefined, infusionUnit: infusion ? unit.value : undefined, firstAt: infusion && d.firstAt ? iso(d.firstAt) : undefined }
  }
  /** Una orden de la hoja de medicamentos (notas de la estancia). */
  const toStay = (): StayMed => {
    const common = {
      route: d.route.trim(), instructions: d.instructions.trim() || undefined, days: days ?? undefined, quantity: d.quantity.trim() || computed || undefined,
      buyOutside: d.buyOutside || undefined, buyQuantity: d.buyOutside ? d.quantity.trim() || undefined : undefined,
      replacesId: props.kind === 'stay' ? props.initial?.replacesId : undefined,
    }
    if (neb) {
      const clean = nebClean()
      return { ...common, drug: 'Nebulización', presentation: '', dose: nebulizationBody(clean), nebulization: clean, everyHours: once ? undefined : hours, prn, prnCondition: prn ? d.prnCondition.trim() : undefined,
        firstAt: prn ? undefined : iso(d.firstAt), infusionRate: undefined, infusionUnit: undefined, loadingDose: undefined, loadingStat: undefined }
    }
    // Con dosis inicial «Ahora (STAT)», la primera hora de la orden es ahora; las siguientes, desde ahí más el intervalo
    const firstAt = withLoading && d.loadingNow ? new Date().toISOString() : prn ? undefined : iso(d.firstAt)
    return { ...common, drug: d.drug.trim(), presentation: d.presentation.trim() || undefined, dose: d.dose.trim(), everyHours: infusion || once ? undefined : hours, prn, prnCondition: prn ? d.prnCondition.trim() : undefined,
      firstAt, infusionRate: infusion ? rateNum : undefined, infusionUnit: infusion ? (unit.value as InfusionUnit) : undefined,
      loadingDose: withLoading ? d.loadingDose.trim() : undefined, loadingStat: withLoading ? d.loadingNow : undefined, nebulization: undefined }
  }
  const save = (another = false) => {
    if (!ready) return
    if (props.kind === 'stay') { const x = toStay(); if (another && props.onSaveAnother) props.onSaveAnother(x); else props.onSave(x) }
    else { const x = toItem(); if (another && props.onSaveAnother) props.onSaveAnother(x); else props.onSave(x) }
  }
  const submit = (e?: FormEvent) => { e?.preventDefault(); save() }
  const pick = (x: Drug) => {
    const usual = draftFromItem({ frequency: x.usual?.frequency }, place)
    setD((m) => ({
      ...m, drug: x.name, presentation: x.presentation,
      route: x.usual?.route ?? lnmeRoute(x, m.route) ?? (/ampolla|vial|frasco|bolsa/i.test(x.presentation) ? 'Intravenosa' : defaultRoute(x.presentation)),
      dose: x.usual?.dose ?? m.dose, duration: x.usual?.duration ?? m.duration,
      ...(x.usual?.frequency && !statOnly && m.freq !== 'infusion' ? { freq: usual.freq, customFreq: usual.customFreq, prn: usual.prn } : {}),
    }))
    setOverrideAllergy(false); setOverrideDup(false)
  }

  // Frecuencias: cada tantas horas (con PRN, «como máximo»), dosis única (con PRN, sin intervalo fijo) e «Infusión» donde se puede
  const hourOptions = [...new Set([...STANDARD_HOURS, ...(hours && d.freq !== 'custom' ? [hours] : [])])].sort((a, b) => a - b)
  const freqOptions: { value: string; label: string }[] = statOnly
    ? [{ value: 'once', label: 'Dosis única (STAT)' }, ...(d.freq !== 'once' ? [{ value: d.freq, label: frequency }] : [])]
    : [...hourOptions.map((h) => ({ value: String(h), label: prn ? `Cada ${h} horas como máximo` : `Cada ${h} horas` })),
      { value: 'once', label: prn ? 'Sin intervalo fijo' : 'Dosis única' },
      ...(d.freq === 'custom' ? [{ value: 'custom', label: d.customFreq ?? '' }] : []),
      ...(infusionOk && !prn ? [{ value: 'infusion', label: 'Infusión continua' }] : [])]
  const preview = ready ? (props.kind === 'stay' ? (() => { const x = toStay(); return `${medLabel(x)}${x.days ? ` por ${x.days} días` : ''}` })() : medicationLine(toItem())) : ''
  const timeField = (label: string): ReactNode => (
    <div className="field"><span>{label}</span>
      <DateTimeField value={d.firstAt} onChange={(v) => set({ firstAt: v })} label={label} /></div>
  )

  return (<>
    <form className="rx-form med-form" onSubmit={submit}>
      {/* ME8 (ronda 10): el buscador compartido; no se abre al tocarlo, sugiere al escribir */}
      {!neb && <DrugSearch value={d.drug} drugs={drugs} autoFocus={!props.initial} clinicTag placeholder="Busca en el vademécum por nombre genérico o comercial, o escríbelo"
        onChange={(t) => { set({ drug: t }); setOverrideAllergy(false); setOverrideDup(false) }} onPick={pick}
        extra={(close) => canAdd && q.length >= 3 && !exact ? (
          <button type="button" className="suggest__new" onMouseDown={(e) => e.preventDefault()} onClick={() => { close(); setNewDrug(d.drug.trim()) }}>
            <Plus size={15} />{matches.length ? 'No está en la lista: ' : ''}agregar «{d.drug.trim()}» como nuevo medicamento</button>) : null}
        below={<NotInVademecum drugs={drugs} name={d.drug} presentation={d.presentation} route={d.route} onLinked={pick} />} />}
      <div className="form-grid">
        {!neb && <label className="field"><span>Presentación y concentración</span><input className="input" value={d.presentation} onChange={(e) => set({ presentation: e.target.value })} placeholder={infusion ? 'Ej. Bolsa 1000 mL' : 'Ej. Tableta 500 mg'} /><DrugPickedHint drugs={drugs} name={d.drug} presentation={d.presentation} /></label>}
        {!neb && <label className="field"><span>{withLoading ? 'Dosis siguientes' : 'Dosis'}</span><input className="input" data-nocap value={d.dose} onChange={(e) => set({ dose: e.target.value })} placeholder={infusion ? 'Ej. 1000 mL, 50 mg en 100 mL' : 'Ej. 1 g, 1 tableta, 5 ml'} /></label>}
        <RouteField value={d.route} onChange={(r) => setD((m) => ({ ...m, route: r, nebulization: isNebulization(r) ? m.nebulization ?? structuredClone(EMPTY_NEB) : m.nebulization, freq: isNebulization(r) && m.freq === 'infusion' ? '6' : m.freq }))} />
        {neb && <NebulizerFields value={nebValue} onChange={(n) => set({ nebulization: n })} allergies={patient.allergies} firstName={patient.firstName} />}
        <label className="field"><span>Frecuencia</span>
          <Combo warn={statBad} value={d.freq} options={freqOptions.map((f) => ({ value: f.value, label: f.label }))} onChange={(v) => {
            // ME1: una infusión no es PRN; si estaba en vía oral, pasa a intravenosa
            setD((m) => ({ ...m, freq: v, ...(v === 'infusion' ? { prn: false, route: m.route === 'Oral' ? 'Intravenosa' : m.route } : {}) }))
          }} />
          {statBad && <small className="field__msg field__msg--warn">Sin ingreso solo se permite dosis STAT. Cámbiala o marca el ingreso.</small>}</label>
        {/* MC2 (ronda 6): PRN con su condición; una infusión o una dosis STAT no son PRN */}
        {!infusion && !statOnly && (
          <label className="field" style={{ alignContent: 'end' }}><span>Según necesidad</span>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 42 }}>
              <input type="checkbox" checked={d.prn} onChange={(e) => set({ prn: e.target.checked })} />Según necesidad (PRN)</label></label>
        )}
        {prn && <label className="field"><span>Condición</span>
          <input className={`input ${!d.prnCondition.trim() && d.drug.trim() ? 'input--warn' : ''}`} value={d.prnCondition} onChange={(e) => set({ prnCondition: e.target.value })} placeholder="Ej. si dolor, si fiebre" aria-required="true" />
          {!d.prnCondition.trim() && <small className="field__msg field__msg--warn">Obligatoria en un PRN: cuándo se da.</small>}</label>}
        {infusion && (
          <div className="field span-2"><span>Velocidad de infusión</span>
            <div className="rate-field">
              <input className={`input num ${d.rate && rIssue ? 'input--error' : ''}`} inputMode="decimal" value={d.rate} onChange={(e) => set({ rate: e.target.value })} placeholder="Ej. 125" aria-label="Velocidad de infusión" aria-required="true" />
              <Combo value={unit.value} onChange={(v) => set({ infusionUnit: v as InfusionUnit })} label="Unidad de la velocidad" options={INFUSION_UNITS.map((u) => ({ value: u.value, label: u.label }))} />
            </div>
            {rIssue && <small className={`field__msg ${d.rate ? 'field__msg--error' : 'field__msg--warn'}`}>{rIssue}</small>}</div>
        )}
        {repeating && !statOnly && <LoadingDoseFields checked={d.loading} onChecked={(v) => set({ loading: v })} value={d.loadingDose} onValue={(v) => set({ loadingDose: v })} warn={!!d.drug.trim()}
          givenAt={loadingGivenAt ? `Dosis inicial ya administrada el ${dmyTime(loadingGivenAt)}.` : undefined}
          extra={inStay ? <div className="field"><span>Hora de la dosis inicial</span>
            <Combo value={d.loadingNow ? 'now' : 'at'} onChange={(v) => set({ loadingNow: v === 'now', ...(v === 'at' ? { firstAt: inputDateTime(new Date()) } : {}) })} label="Hora de la dosis inicial"
              options={[{ value: 'now', label: 'Ahora (STAT)' }, { value: 'at', label: 'Elegir fecha y hora' }]} />
            {!d.loadingNow && <DateTimeField value={d.firstAt} onChange={(v) => set({ firstAt: v })} label="Fecha y hora de la dosis inicial" />}
          </div> : undefined} />}
        <LoadingDropped show={dropped && !neb} />
        {showTime && timeField(infusion ? 'Hora de inicio' : 'Hora de la dosis')}
        {showStart && timeField('Hora de inicio')}
        <label className="field"><span>{needsDays ? 'Total de días' : 'Total de días (opcional)'}</span>
          <input className={`input ${(needsDays && !d.duration.trim() && d.drug.trim() && d.dose.trim()) || daysBad ? 'input--warn' : ''}`} data-nocap inputMode={inStay ? 'numeric' : undefined} value={d.duration} onChange={(e) => set({ duration: e.target.value })}
            placeholder={once ? 'No aplica' : needsDays ? 'Ej. 3 días' : 'Hasta nueva orden'} aria-label="Total de días" />
          {needsDays && !d.duration.trim() && d.drug.trim() && d.dose.trim() && <small className="field__msg field__msg--warn">La receta lleva los días: el paciente se va a su casa.</small>}
          {daysBad && <small className="field__msg field__msg--warn">Escribe los días en número (de 1 a 365).</small>}</label>
        <label className="field"><span>{buy ? 'Cantidad a comprar (opcional)' : 'Cantidad total (opcional)'}</span><input className="input" data-nocap value={d.quantity} onChange={(e) => set({ quantity: e.target.value })} placeholder={computed ? `Se calcula: ${computed}` : infusion ? 'Ej. 2 bolsas' : 'Ej. 20 tabletas'} /></label>
        <label className="field span-2"><span>Indicaciones especiales (opcional)</span><input className="input" value={d.instructions} onChange={(e) => set({ instructions: e.target.value })}
          placeholder={prn ? 'Ej. Si hay dolor intenso' : infusion ? 'Ej. Diluir en 100 mL de SSN' : 'Ej. Con los alimentos'}
          onKeyDown={(e) => { if (e.key === 'Enter' && props.onSaveAnother) { e.preventDefault(); save(true) } }} /></label>
      </div>
      {applyShown && (
        <label className="check-line"><input type="checkbox" checked={!!d.applyInClinic}
          onChange={(e) => set(e.target.checked ? { applyInClinic: true, freq: 'once', prn: false, loading: false } : { applyInClinic: false })} />
          <span><b>Aplicar en la clínica</b><small>Enfermería o el médico lo aplican aquí y el paciente se va a su casa (no queda en observación).</small></span></label>
      )}
      {statOnly && <p className="c-muted fs-md m-0">Sin ingreso se aplica una sola dosis en la clínica. También sale en la receta.</p>}
      {buyShown && <div className="form-grid"><BuyOutsideFields checked={d.buyOutside} onChecked={(v) => set({ buyOutside: v })} /></div>}
      {preview && <p className="muted" style={{ fontSize: 13.5, overflowWrap: 'anywhere' }}>Se verá así: <b>{preview}</b></p>}
      {neb && nebConflict && !overrideAllergy && (
        <div className="alert-strip" role="alert" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
          <span className="hstack hstack--nowrap"><TriangleAlert size={18} style={{ flex: 'none' }} />{patient.firstName} es alérgica/o a {nebConflict}.</span>
          <button type="button" className="btn btn--danger btn--sm" style={{ background: '#fff' }} onClick={() => setOverrideAllergy(true)}>Indicar de todos modos</button>
        </div>
      )}
      {conflict && (
        <div className="alert-strip" role="alert" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
          <span className="hstack hstack--nowrap"><TriangleAlert size={18} style={{ flex: 'none' }} />{patient.firstName} es alérgica/o a {conflict}. {d.drug} puede provocar una reacción.</span>
          {!overrideAllergy && <button type="button" className="btn btn--danger btn--sm" style={{ background: '#fff' }} onClick={() => setOverrideAllergy(true)}>Indicar de todos modos</button>}
        </div>
      )}
      {duplicate && (
        <div className="alert-strip alert-strip--amber" role="alert" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
          <span>{duplicate} ya está en la lista de medicamentos.</span>
          {!overrideDup && <button type="button" className="btn btn--ghost btn--sm" style={{ background: '#fff' }} onClick={() => setOverrideDup(true)}>Agregarlo otra vez</button>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn--primary" disabled={!ready}><Plus size={16} />{submitLabel ?? (props.initial ? 'Guardar cambios' : inStay ? 'Agregar a la nota' : 'Agregar medicamento')}</button>
        {props.onSaveAnother && <button type="button" className="btn btn--soft" disabled={!ready} onClick={() => save(true)}>Guardar y agregar otro</button>}
        <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancelar</button>
        {!ready && why && (d.drug.trim() || neb) && <small className="muted">Falta {why}.</small>}
      </div>
    </form>
    {newDrug !== null && <AddDrugModal name={newDrug} presentation={d.presentation} route={d.route} drugs={drugs} onClose={() => setNewDrug(null)} onDone={(x) => { setNewDrug(null); pick(x) }} />}
    </>
  )
}
