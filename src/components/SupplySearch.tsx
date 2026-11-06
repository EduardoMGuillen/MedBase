import { useMemo, useState, type ReactNode } from 'react'
import { Search, X } from 'lucide-react'
import { matchesSupply, type SupplyItem } from '../lib/supplies'

/** Una letra sin tilde ni mayúscula (para resaltar lo buscado sin cambiar el largo del texto). */
const fold = (c: string) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().charAt(0) || c
/** Las palabras de lo buscado. */
export const searchWords = (q: string) => q.split(/\s+/).map((w) => [...w].map(fold).join('')).filter(Boolean)

/** RU4 (ronda 15): resalta en el texto lo que coincide con la búsqueda (sin importar tildes ni mayúsculas). */
export function Highlight({ text, q }: { text: string; q: string }) {
  const words = searchWords(q)
  if (!words.length || !text) return <>{text}</>
  const folded = [...text].map(fold).join('')
  const hit = new Array<boolean>(text.length).fill(false)
  for (const w of words) {
    for (let i = folded.indexOf(w); i >= 0; i = folded.indexOf(w, i + 1)) for (let k = i; k < i + w.length; k++) hit[k] = true
  }
  const out: ReactNode[] = []
  let start = 0
  for (let i = 1; i <= text.length; i++) {
    if (i === text.length || hit[i] !== hit[start]) {
      const part = text.slice(start, i)
      out.push(hit[start] ? <mark key={start}>{part}</mark> : part)
      start = i
    }
  }
  return <>{out}</>
}

/** Las líneas que coinciden con lo buscado («seda 4» → «Seda 4/0, aguja cortante»), en el orden del catálogo. */
export const supplyMatches = (items: SupplyItem[], q: string) => (q.trim().length >= 2 ? items.filter((i) => matchesSupply(i, q)) : [])

/**
 * RU4, RU7 y RU8 (ronda 15): EL buscador de material. Busca mientras se escribe, desde 2 letras, sin importar tildes, por partes
 * del texto (material, variante y categoría). Un solo componente para:
 *  - «Registrar material» y el editor de sets (`results`: cada resultado con su control de cantidad, debajo del campo);
 *  - «Agregar material» (`onPickMaterial`: sugiere los materiales que ya existen, para agregarles una variante).
 */
export function SupplySearch({ items, value, onChange, placeholder = 'Buscar material (ej. seda 4, guante 7.5)', label, results, onPickMaterial, autoFocus, max = 40, empty }: {
  items: SupplyItem[]
  value: string
  onChange: (v: string) => void
  placeholder?: string
  label?: string
  /** Lista de resultados (líneas) debajo del campo. */
  results?: (found: SupplyItem[], q: string) => ReactNode
  /** Modo «material»: sugiere los materiales existentes (uno por nombre, con su categoría). */
  onPickMaterial?: (m: { material: string; category: string }) => void
  autoFocus?: boolean
  max?: number
  empty?: string
}) {
  const [focus, setFocus] = useState(false)
  const found = useMemo(() => supplyMatches(items, value), [items, value])
  const materials = useMemo(() => {
    if (!onPickMaterial) return []
    const seen = new Map<string, { material: string; category: string; variants: number }>()
    for (const i of found) {
      const k = i.material.toLowerCase()
      const m = seen.get(k)
      if (m) m.variants++
      else seen.set(k, { material: i.material, category: i.category, variants: 1 })
    }
    return [...seen.values()].slice(0, 8)
  }, [found, onPickMaterial])
  const typed = value.trim().length >= 2
  return (
    <div className={`supply-search${onPickMaterial ? ' suggest' : ''}`}>
      {label && <span className="supply-search__label">{label}</span>}
      <div className="supply-search__box">
        <Search size={16} className="supply-search__icon" aria-hidden="true" />
        <input className="input" type="search" data-nocap value={value} autoFocus={autoFocus} placeholder={placeholder} aria-label={label ?? placeholder}
          onChange={(e) => onChange(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 150)} />
        {value && <button type="button" className="icon-btn supply-search__clear" aria-label="Borrar la búsqueda" onClick={() => onChange('')}><X size={15} /></button>}
      </div>
      {onPickMaterial && focus && materials.length > 0 && (
        <div className="suggest__list" role="listbox">
          {materials.map((m) => (
            <button type="button" role="option" aria-selected="false" key={m.material} onMouseDown={(e) => e.preventDefault()} onClick={() => { onPickMaterial(m); setFocus(false) }}>
              <span><Highlight text={m.material} q={value} /></span>
              <span className="muted" style={{ marginLeft: 'auto', fontSize: 12.5 }}>{m.category} · {m.variants} {m.variants === 1 ? 'variante' : 'variantes'}</span>
            </button>
          ))}
        </div>
      )}
      {results && typed && (found.length ? results(found.slice(0, max), value) : <p className="muted supply-search__empty">{empty ?? 'Ningún material coincide.'}</p>)}
      {results && typed && found.length > max && <p className="muted supply-search__empty">Hay {found.length - max} más: escribe más letras para acotar.</p>}
    </div>
  )
}
