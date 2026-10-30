/** Vigencia de esta receta en particular (AD2). Empieza con la del médico y se puede cambiar sólo para esta. */
export function RxValidityField({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <label className="field field--inline rx-validity">
      <span>Vigencia de esta receta</span>
      <span className="rx-validity__input">
        <input className="input num" type="number" min={1} max={365} value={value} aria-label="Vigencia de esta receta en días"
          onChange={(e) => onChange(Math.min(365, Math.max(1, Math.round(Number(e.target.value)) || 1)))} />
        días
      </span>
    </label>
  )
}
