import { VITALS, type VitalKey } from '../lib/vitals'
import { FIELDS, fieldIssue, PAIR, type VitalsForm } from '../lib/vitalsForm'

/**
 * Los campos de signos vitales con la validación de la preclínica: se revisa al salir del campo, rojo para valores
 * imposibles y ámbar para fuera de rango. El estado (valores y campos revisados) lo lleva quien lo usa.
 */
export function VitalsFields({ v, setV, checked, setChecked, ageYears, onEdit }: {
  v: VitalsForm; setV: (v: VitalsForm) => void; checked: Set<VitalKey>; setChecked: (f: (c: Set<VitalKey>) => Set<VitalKey>) => void; ageYears?: number; onEdit?: () => void
}) {
  const issue = (k: VitalKey) => (checked.has(k) ? fieldIssue(k, v, ageYears) : null)
  const check = (...keys: VitalKey[]) => setChecked((c) => new Set([...c, ...keys]))
  return (
    <div className="form-grid form-grid--top">
      {FIELDS.map((k) => {
        const i = issue(k)
        return (
          <label className="field" key={k}>
            <span>{VITALS[k].label} <small style={{ fontWeight: 400 }}>({VITALS[k].unit})</small></span>
            <input className={`input num ${i ? `input--${i.level}` : ''}`} inputMode="decimal" type="text" autoComplete="off" value={v[k]}
              onChange={(e) => { setV({ ...v, [k]: e.target.value }); onEdit?.(); setChecked((c) => { const n = new Set(c); for (const x of PAIR.includes(k) ? PAIR : [k]) n.delete(x); return n }) }}
              onBlur={() => check(...(PAIR.includes(k) ? PAIR : [k]).filter((x) => v[x] !== ''))}
              aria-invalid={i?.level === 'error'} aria-describedby={i ? `vital-${k}` : undefined} />
            {i && <small id={`vital-${k}`} className={`field__msg field__msg--${i.level}`}>{i.text}</small>}
          </label>
        )
      })}
    </div>
  )
}
