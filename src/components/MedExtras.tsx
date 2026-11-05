import type { ReactNode } from 'react'
import { Plus, TriangleAlert, X } from 'lucide-react'
import { useVademecum } from '../lib/vademecum'
import { normalize } from '../lib/patients'
import { DrugSearch } from './DrugSearch'
import { NotInVademecum } from './AddToVademecum'
import { allergyConflict } from '../lib/catalogs'
import { NEB_MAX_COMPONENTS } from '../lib/clinicalConfig'
import { DILUENT_OPTIONS, type NebComponent, type Nebulization } from '../lib/medExtras'

/**
 * ME3 (ronda 9): la casilla «Primera dosis diferente (STAT)» y su «Dosis inicial», la misma en todos los formularios de
 * medicamento. `extra` es lo que cada formulario agrega debajo (en las notas, la «Hora de la dosis inicial»; en la receta, nada:
 * no hay hoja ni hora programada).
 * ME9 (ronda 10): una casilla de una sola línea, sin recuadro, con la letra de las demás etiquetas; el ejemplo sale como ayuda
 * pequeña solo cuando está marcada. Solo se muestra con vía intravenosa (`loadingAllowed`).
 */
export function LoadingDoseFields({ checked, onChecked, value, onValue, givenAt, extra, warn }: {
  checked: boolean; onChecked: (v: boolean) => void; value: string; onValue: (v: string) => void; givenAt?: string; extra?: ReactNode; warn?: boolean
}) {
  if (givenAt) return <p className="field span-2 muted" style={{ margin: 0, fontSize: 13.5 }}>{givenAt}</p>
  return (<>
    <div className="field span-2 stat-line">
      <label className="check-inline"><input type="checkbox" checked={checked} onChange={(e) => onChecked(e.target.checked)} />Primera dosis diferente (STAT)</label>
      {checked && <small className="muted">Una sola orden: por ejemplo, 2 g STAT y luego 1 g cada 12 horas.</small>}
    </div>
    {checked && <label className="field"><span>Dosis inicial</span>
      <input className={`input ${warn && !value.trim() ? 'input--warn' : ''}`} value={value} onChange={(e) => onValue(e.target.value)} placeholder="Ej. 2 g" aria-required="true" /></label>}
    {checked && extra}
  </>)
}

/**
 * ME10 (ronda 10): «No hay en la clínica (va a receta)», apagada por defecto, en una línea. Marcada, pide «Cantidad a comprar»
 * (opcional). Solo la marca el médico: enfermería imprime la receta pero no cambia la marca. `quantity === undefined`: el
 * formulario ya tiene su propio campo de cantidad (consulta externa: «Cantidad total», que pasa a llamarse así).
 */
export function BuyOutsideFields({ checked, onChecked, quantity, onQuantity }: { checked: boolean; onChecked: (v: boolean) => void; quantity?: string; onQuantity?: (v: string) => void }) {
  return (<>
    <div className="field span-2 stat-line">
      <label className="check-inline"><input type="checkbox" checked={checked} onChange={(e) => onChecked(e.target.checked)} />No hay en la clínica (va a receta)</label>
      {checked && <small className="muted">Sigue en la hoja de medicamentos; se imprime una receta para que la familia lo compre.</small>}
    </div>
    {checked && quantity !== undefined && onQuantity && <label className="field"><span>Cantidad a comprar</span>
      <input className="input" data-nocap value={quantity} onChange={(e) => onQuantity(e.target.value)} placeholder="Ej. 10 viales" /></label>}
  </>)
}

/** ME9 (ronda 10): aviso cuando se marcó la primera dosis distinta y la vía dejó de ser intravenosa. */
export function LoadingDropped({ show }: { show: boolean }) {
  if (!show) return null
  return <small className="field span-2 field__msg field__msg--warn" role="status">Se quitó la primera dosis diferente porque la vía ya no es intravenosa.</small>
}

/**
 * ME4 (ronda 9): «Nebulizar con:»: componentes (medicamento del vademécum o escrito, con su cantidad), «+ Agregar otro
 * medicamento» (hasta NEB_MAX_COMPONENTS) y, opcional, «Diluir en» (volumen y diluyente). La alerta de alergia y el aviso
 * «No está en el vademécum» se aplican a cada componente.
 */
export function NebulizerFields({ value, onChange, allergies, firstName }: { value: Nebulization; onChange: (n: Nebulization) => void; allergies: string[]; firstName: string }) {
  const vademecum = useVademecum()
  const set = (i: number, patch: Partial<NebComponent>) => onChange({ ...value, components: value.components.map((c, j) => (j === i ? { ...c, ...patch } : c)) })
  const other = !!value.diluent && !DILUENT_OPTIONS.slice(0, -1).includes(value.diluent)
  return (
    <fieldset className="fs neb span-2">
      <legend>Nebulizar con:</legend>
      {value.components.map((c, i) => {
        const q = normalize(c.drug)
        const known = !c.drug.trim() || vademecum.some((d) => normalize(d.name) === q || d.aliases?.some((a) => normalize(a) === q))
        const conflict = c.drug.trim() ? allergyConflict(allergies, c.drug) : null
        return (
          <div key={i} className="neb__row">
            {/* ME8 (ronda 10): el mismo buscador que el resto de los formularios */}
            <DrugSearch value={c.drug} drugs={vademecum} autoFocus={i > 0 && !c.drug} placeholder="Busca en el vademécum o escríbelo" ariaLabel={`Medicamento ${i + 1} de la nebulización`}
              onChange={(t) => set(i, { drug: t })} onPick={(d) => set(i, { drug: d.name })} />
            <label className="field neb__amount"><span>Cantidad</span><input className="input" value={c.amount} onChange={(e) => set(i, { amount: e.target.value })} placeholder="Ej. 3 mL" aria-label={`Cantidad del medicamento ${i + 1}`} /></label>
            <button type="button" className="icon-btn neb__x" aria-label={`Quitar ${c.drug || `el medicamento ${i + 1}`}`} disabled={value.components.length === 1}
              onClick={() => onChange({ ...value, components: value.components.filter((_, j) => j !== i) })}><X size={15} /></button>
            {/* ME11 (ronda 11): la misma franja con «Agregar al vademécum» (vía: la del .md o vacía) */}
            {!known && <NotInVademecum className="neb__note" drugs={vademecum} name={c.drug} onLinked={(d) => set(i, { drug: d.name })} />}
            {conflict && <span className="alert-strip neb__note" role="alert"><TriangleAlert size={15} />{firstName} es alérgica/o a {conflict}.</span>}
          </div>
        )
      })}
      {value.components.length < NEB_MAX_COMPONENTS && (
        <button type="button" className="btn btn--ghost btn--sm" style={{ justifySelf: 'start' }} onClick={() => onChange({ ...value, components: [...value.components, { drug: '', amount: '' }] })}>
          <Plus size={14} />Agregar otro medicamento</button>
      )}
      <div className="neb__dil">
        <label className="field"><span>Diluir en (opcional)</span><input className="input" value={value.diluentVolume ?? ''} onChange={(e) => onChange({ ...value, diluentVolume: e.target.value })} placeholder="Ej. 3 mL" /></label>
        <label className="field"><span>Diluyente</span>
          <select className="select" value={other ? 'Otro' : value.diluent ?? ''} onChange={(e) => onChange({ ...value, diluent: e.target.value === 'Otro' ? ' ' : e.target.value || undefined })}>
            <option value="">Sin diluyente</option>{DILUENT_OPTIONS.map((d) => <option key={d}>{d}</option>)}
          </select></label>
        {other && <label className="field"><span>¿Cuál?</span><input className="input" value={value.diluent?.trim() ?? ''} onChange={(e) => onChange({ ...value, diluent: e.target.value || ' ' })} placeholder="Escribe el diluyente" /></label>}
      </div>
    </fieldset>
  )
}

export const EMPTY_NEB: Nebulization = { components: [{ drug: '', amount: '' }] }
