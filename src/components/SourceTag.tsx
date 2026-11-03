import { useEffect, useRef, useState } from 'react'
import { LAB_SOURCES, NO_SOURCE, sourceLabel } from '../lib/labSources'

/**
 * UM1 y UM2 (ronda 8): etiqueta pequeña con la fuente de un valor («ABIM 2026»). Al tocarla abre la cita completa y el
 * enlace. «‡» se ve en gris: «Sin fuente específica verificada».
 */
export function SourceTag({ codes }: { codes?: string[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [open])
  const list = (codes ?? []).filter(Boolean)
  if (!list.length) return <span className="src-tag src-tag--none">Sin fuente</span>
  const gray = list.every((c) => c === NO_SOURCE || c === 'initial')
  return (
    <span className="src-tag-wrap" ref={ref}>
      <button type="button" className={`src-tag${gray ? ' src-tag--none' : ''}`} aria-expanded={open} onClick={() => setOpen(!open)} title="Ver la fuente">
        {sourceLabel(list[0])}{list.length > 1 ? ` +${list.length - 1}` : ''}
      </button>
      {open && (
        <span className="src-pop" role="dialog" aria-label="Fuente">
          {list.map((c) => {
            const s = LAB_SOURCES[c]
            return <span key={c} className="src-pop__item">
              <b>{sourceLabel(c)}</b>
              {s ? <>{s.title}{s.urls.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer">{u}</a>)}</>
                : c === NO_SOURCE ? 'Resultado esperado por definición; el archivo no cita una fuente específica verificada.'
                  : c === 'clinic' ? 'Valor definido por la clínica.' : c === 'initial' ? 'Valor que traía Clinara antes de la ronda 8, sin fuente.' : null}
            </span>
          })}
        </span>
      )}
    </span>
  )
}
