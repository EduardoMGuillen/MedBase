import { useEffect, useState } from 'react'
import { NotebookPen } from 'lucide-react'

/**
 * CX4 y NE7 (ronda 12), CX5 y NE8 (ronda 13): botón flotante «Ir a la nota». Aparece solo cuando la nota que se está escribiendo
 * (el elemento de `target`) queda fuera de la vista y baja hasta ella. No toca la nota: el borrador sigue igual.
 */
export function GoToNote({ target }: { target: string }) {
  const [away, setAway] = useState(false)
  useEffect(() => {
    let obs: IntersectionObserver | undefined
    let retry: ReturnType<typeof setTimeout> | undefined
    const attach = () => {
      const el = document.querySelector(target)
      if (!el) { retry = setTimeout(attach, 400); return }
      obs = new IntersectionObserver(([e]) => setAway(!e.isIntersecting))
      obs.observe(el)
    }
    attach()
    return () => { obs?.disconnect(); clearTimeout(retry) }
  }, [target])
  if (!away) return null
  return (
    <button type="button" className="btn btn--primary go-note no-print"
      onClick={() => document.querySelector(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
      <NotebookPen size={16} />Ir a la nota
    </button>
  )
}
