import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search as SearchIcon } from 'lucide-react'
import { useStore } from '../lib/store'
import { Avatar } from './ui'
import { age, fullName } from '../lib/format'
import { patientColor } from '../app/Patients'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Buscador de pacientes que se abre con Ctrl+K (o ⌘K) desde cualquier pantalla. */
export function SearchPalette() {
  const { patients, can } = useStore()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o) }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('open-search', onOpen)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('open-search', onOpen) }
  }, [])
  useEffect(() => { if (open) { setQ(''); setI(0); setTimeout(() => inputRef.current?.focus(), 0) } }, [open])

  const results = useMemo(() => {
    const s = norm(q.trim())
    if (!s) return []
    const digits = s.replace(/\D/g, '')
    return patients.filter((p) => !p.pending && (norm(fullName(p)).includes(s) || p.record.toLowerCase().includes(s) || (digits.length >= 3 && p.phone.replace(/\D/g, '').includes(digits)))).slice(0, 8)
  }, [q, patients])

  if (!open || !can('patients.view')) return null
  const go = (id: string) => { setOpen(false); nav(`/app/pacientes/${id}`) }

  return (
    <div className="modal-bg" style={{ placeItems: 'start center', paddingTop: '12vh' }} onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="modal palette" role="dialog" aria-modal="true" aria-label="Buscar paciente">
        <div className="palette__input">
          <SearchIcon size={18} />
          <input ref={inputRef} value={q} placeholder="Nombre, expediente o teléfono" aria-label="Buscar paciente"
            onChange={(e) => { setQ(e.target.value); setI(0) }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false)
              if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(x + 1, results.length - 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(x - 1, 0)) }
              if (e.key === 'Enter' && results[i]) go(results[i].id)
            }} />
          <kbd>Esc</kbd>
        </div>
        {q.trim() && (
          <div className="palette__list" role="listbox">
            {results.length ? results.map((p, k) => (
              <button key={p.id} role="option" aria-selected={k === i} className="palette__item" onMouseEnter={() => setI(k)} onClick={() => go(p.id)}>
                <Avatar name={fullName(p)} color={patientColor(p.id)} />
                <span><strong>{fullName(p)}</strong><small>{p.record}, {age(p.birthDate)}, tel. {p.phone}</small></span>
              </button>
            )) : <div className="empty">Ningún paciente coincide con “{q}”.</div>}
          </div>
        )}
      </div>
    </div>
  )
}
