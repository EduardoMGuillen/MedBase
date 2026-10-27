import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { normalize } from '../lib/patients'
import { legacyTag } from '../lib/format'
import type { Diagnosis } from '../lib/types'

type Hit = Required<Pick<Diagnosis, 'code' | 'label'>> & Pick<Diagnosis, 'uri' | 'system'>

/**
 * Buscador de diagnósticos CIE-11 (OMS, en español). Muestra primero los que la clínica ya usó y después los
 * de la CIE-11 (la API de la OMS si está configurada; si no, el archivo oficial que trae Clinara). Siempre se
 * puede escribir el diagnóstico sin código. Es el mismo en la consulta, el ingreso y el egreso.
 */
export function DiagnosisPicker({ value, onChange, label, placeholder }: { value: Diagnosis[]; onChange: (v: Diagnosis[]) => void; label?: string; placeholder?: string }) {
  const { searchIcd, fetchIcdFrequent } = useStore()
  const [q, setQ] = useState('')
  const [frequent, setFrequent] = useState<Hit[]>([])
  const [results, setResults] = useState<{ q: string; hits: Hit[]; error?: string; release?: string } | null>(null)
  const [loading, setLoading] = useState(false)
  useEffect(() => { fetchIcdFrequent().then(setFrequent).catch(() => null) }, [fetchIcdFrequent])
  const s = q.trim()
  useEffect(() => {
    if (s.length < 2) return
    let alive = true
    const t = setTimeout(() => {
      setLoading(true)
      searchIcd(s).then((r) => { if (alive) setResults({ q: s, hits: r.results.map((x) => ({ ...x, system: 'icd11' as const })), release: r.release }) })
        .catch((e: Error) => { if (alive) setResults({ q: s, hits: [], error: e.message }) })
        .finally(() => { if (alive) setLoading(false) })
    }, 350)
    return () => { alive = false; clearTimeout(t) }
  }, [s, searchIcd])
  const chosen = (h: Diagnosis) => value.some((x) => x.code === h.code && x.label === h.label)
  const add = (h: Diagnosis) => { if (!chosen(h)) onChange([...value, h]); setQ(''); setResults(null) }
  const n = normalize(s)
  const usual = s ? frequent.filter((f) => !chosen(f) && (normalize(f.label).includes(n) || f.code.toLowerCase().startsWith(n))).slice(0, 5) : []
  const live = results && results.q === s ? results.hits.filter((h) => !chosen(h) && !usual.some((u) => u.code === h.code)) : []
  const free = () => add({ code: 'S/C', label: s })
  return (
    <div className="field dx-picker"><span>{label ?? 'Diagnósticos (CIE-11)'}</span>
      {value.length > 0 && <ol className="dx-list">{value.map((d) => (
        <li key={d.code + d.label}><span><b>{d.label}</b> <span className="muted">{d.code === 'S/C' ? 'sin código' : d.code}</span>{legacyTag(d) && <span className="badge" style={{ marginLeft: 6 }}>{legacyTag(d)}</span>}</span>
          <button type="button" className="icon-btn" aria-label={`Quitar ${d.label}`} onClick={() => onChange(value.filter((x) => x !== d))}><X size={15} /></button></li>
      ))}</ol>}
      <div className="suggest">
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar diagnóstico CIE-11" autoComplete="off"
          placeholder={placeholder ?? 'Busca en la CIE-11 por nombre o código, por ejemplo faringitis o CA02'}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || !s) return
            e.preventDefault()
            const first = usual[0] ?? live[0]
            if (first) add(first); else if (!loading) free()
          }} />
        {s.length >= 2 && (
          <div className="suggest__list dx-picker__list">
            {usual.length > 0 && <small className="dx-picker__group">Usados en la clínica</small>}
            {usual.map((d) => <button type="button" key={`u-${d.code}-${d.label}`} onClick={() => add(d)}><code>{d.code}</code>{d.label}</button>)}
            {live.length > 0 && <small className="dx-picker__group">CIE-11 de la OMS{results?.release ? `, edición ${results.release}` : ''}</small>}
            {live.map((d) => <button type="button" key={`w-${d.code}`} onClick={() => add(d)}><code>{d.code}</code>{d.label}</button>)}
            {loading && <small className="dx-picker__group">Buscando en la CIE-11…</small>}
            {!loading && results?.q === s && !results.error && !live.length && !usual.length && <small className="dx-picker__group dx-picker__warn">La CIE-11 no tiene un diagnóstico con esas palabras. Prueba con otra palabra o agrégalo sin código.</small>}
            {!loading && results?.q === s && results.error && <small className="dx-picker__group dx-picker__warn">{results.error}</small>}
            <button type="button" className="suggest__new" onClick={free}><Plus size={15} />Agregar «{s}» sin código</button>
          </div>
        )}
      </div>
    </div>
  )
}
