import { Droplets } from 'lucide-react'
import { FLUID_FREQUENCIES } from '../lib/clinicalConfig'
import { FLUIDS_ORDER, fluidsModeLabel } from '../lib/fluids'
import type { FluidsMode } from '../lib/types'

/** IE1 (ronda 16): lo que el editor guarda de la orden de ingestas y excretas. */
export interface FluidsChoice { on: boolean; mode: FluidsMode }

/** Lo que se manda al firmar: la frecuencia si está marcada; 'off' si estaba vigente y se desmarcó; nada si no se toca. */
export const fluidsPayload = (c: FluidsChoice, current?: FluidsMode) => (c.on ? { mode: c.mode } : current ? { mode: 'off' as const } : undefined)
export const fluidsStart = (current?: FluidsMode): FluidsChoice => ({ on: !!current, mode: current ?? 'shift' })

/**
 * IE1 (ronda 16): botón «Ingestas y excretas» del editor de órdenes (debajo de Indicaciones y antes de Exámenes), igual en la
 * consulta externa con ingreso, la nota de ingreso y las de evolución. Marcado agrega la indicación «Cuantificar ingestas y
 * excretas» con su frecuencia de corte y activa el registro en Signos vitales; en una evolución, desmarcarlo la suspende.
 */
export function FluidsOrder({ value, current, onChange }: { value: FluidsChoice; current?: FluidsMode; onChange: (v: FluidsChoice) => void }) {
  const changed = !!current && value.on && value.mode !== current
  return (
    <div className="fluids-order" data-testid="fluids-order">
      <button type="button" className={`btn btn--sm ${value.on ? 'btn--primary' : 'btn--soft'}`} aria-pressed={value.on} onClick={() => onChange({ ...value, on: !value.on })}>
        <Droplets size={15} />Ingestas y excretas
      </button>
      {value.on && (
        <label className="fluids-order__freq"><span className="sr-only">Frecuencia de corte</span>
          <select className="select select--sm" aria-label="Frecuencia de corte de ingestas y excretas" value={value.mode} onChange={(e) => onChange({ ...value, mode: e.target.value as FluidsMode })}>
            {FLUID_FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </label>
      )}
      <small className="muted fluids-order__hint">
        {current && !value.on ? <>Se suspende al firmar: «{FLUIDS_ORDER}» (estaba {fluidsModeLabel(current).toLowerCase()}).</>
          : current && changed ? <>Cambia de {fluidsModeLabel(current).toLowerCase()} a {fluidsModeLabel(value.mode).toLowerCase()}.</>
          : current ? <>Vigente: «{FLUIDS_ORDER}», {fluidsModeLabel(current).toLowerCase()}. Desmárcalo para suspenderla.</>
          : value.on ? <>Se agrega la indicación «{FLUIDS_ORDER}» y enfermería registra en Signos vitales.</>
          : <>Agrega «{FLUIDS_ORDER}» y activa el registro de ingresos y egresos.</>}
      </small>
    </div>
  )
}
