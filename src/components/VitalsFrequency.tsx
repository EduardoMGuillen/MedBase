import { useState } from 'react'
import { VITALS_EVERY_OPTIONS, VITALS_OTHER_RANGE, VITALS_SHIFT_TIMES } from '../lib/clinicalConfig'
import type { VitalsMode } from '../lib/types'

/**
 * MC6 (ronda 6): «Signos vitales» dentro de Indicaciones: por turno, cada N horas, otra frecuencia (pide las horas) o sin
 * control programado. Siempre muestra el valor vigente. No es una casilla para enfermería: se cumple registrando signos.
 */
export function VitalsFrequency({ value, onChange }: { value: VitalsMode; onChange: (v: VitalsMode) => void }) {
  const preset = value.mode !== 'hours' ? value.mode : VITALS_EVERY_OPTIONS.includes(value.hours) ? String(value.hours) : 'other'
  const [other, setOther] = useState(preset === 'other')
  const sel = other ? 'other' : preset
  return (
    <div className="vitals-freq">
      <label className="field"><span>Signos vitales</span>
        <select className="select" value={sel} aria-label="Frecuencia de signos vitales" onChange={(e) => {
          const v = e.target.value
          setOther(v === 'other')
          if (v === 'shift' || v === 'none') onChange({ mode: v })
          else if (v !== 'other') onChange({ mode: 'hours', hours: Number(v) })
        }}>
          <option value="shift">Por turno ({VITALS_SHIFT_TIMES.join(', ')})</option>
          {VITALS_EVERY_OPTIONS.map((h) => <option key={h} value={h}>Cada {h} {h === 1 ? 'hora' : 'horas'}</option>)}
          <option value="other">Otra frecuencia…</option>
          <option value="none">Sin control programado</option>
        </select></label>
      {sel === 'other' && (
        <label className="field"><span>Cada cuántas horas</span>
          <input className="input num" type="number" inputMode="numeric" min={VITALS_OTHER_RANGE.min} max={VITALS_OTHER_RANGE.max} autoFocus
            value={value.mode === 'hours' ? value.hours : ''} placeholder="Ej. 3"
            onChange={(e) => { const n = Math.round(Number(e.target.value)); if (n >= VITALS_OTHER_RANGE.min && n <= VITALS_OTHER_RANGE.max) onChange({ mode: 'hours', hours: n }) }} /></label>
      )}
    </div>
  )
}
