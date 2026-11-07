import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Ellipsis } from 'lucide-react'

export type RowAction = { label: string; icon?: ReactNode; run: () => void } | false
/** Menú «⋯» de una fila (RU4, ronda 15; también en los renglones de exámenes, EX12 y LB8 de la ronda 16). */
export function RowMenu({ label, actions }: { label: string; actions: RowAction[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [open])
  const list = actions.filter((a): a is Exclude<RowAction, false> => !!a)
  if (!list.length) return null
  return (
    <div className="row-menu" ref={ref}>
      <button type="button" className="icon-btn row-menu__btn" aria-label={`Acciones de ${label}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}><Ellipsis size={18} /></button>
      {open && (
        <div className="row-menu__pop" role="menu">
          {list.map((a) => <button key={a.label} type="button" role="menuitem" onClick={() => { setOpen(false); a.run() }}>{a.icon}{a.label}</button>)}
        </div>
      )}
    </div>
  )
}
