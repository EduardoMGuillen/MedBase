import { Minus, Plus } from 'lucide-react'

/** Cantidad escrita a entero (vacío o 0 = sin cantidad). */
export const qtyOf = (s: string | undefined) => { const n = Number.parseInt(s ?? '', 10); return Number.isFinite(n) && n > 0 ? n : 0 }

/**
 * RU2 (ronda 14) y RU7 (ronda 15): el control de cantidad del material, [−] [cantidad] [+], con botones de 44 px. Vacío muestra
 * «0» en gris (no «—», que se confundía con el botón «−»). Lo usan «Registrar material» y el editor de sets.
 */
export function QtyStepper({ value, onChange, label, min = 0, disabled }: { value: string; onChange: (v: string) => void; label: string; min?: number; disabled?: boolean }) {
  const n = qtyOf(value)
  const set = (v: string) => onChange(v.replace(/\D/g, '').slice(0, 3))
  return (
    <div className="qty-stepper">
      <button type="button" className="mat-step" aria-label={`Menos ${label}`} disabled={disabled || n <= min} onClick={() => set(n - 1 > 0 ? String(n - 1) : '')}><Minus size={18} /></button>
      <input className="input num mat-qty" inputMode="numeric" data-nocap value={value} placeholder="0" disabled={disabled} aria-label={`Cantidad de ${label}`} onChange={(e) => set(e.target.value)}
        onFocus={(e) => e.currentTarget.select()} />
      <button type="button" className="mat-step" aria-label={`Más ${label}`} disabled={disabled || n >= 999} onClick={() => set(String(n + 1))}><Plus size={18} /></button>
    </div>
  )
}
