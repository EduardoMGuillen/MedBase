import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { pageNumbers } from '../lib/pagination'

export { paginate, pageNumbers } from '../lib/pagination'

/**
 * GE5: la página actual vive en la dirección (`?pagina=3`), así que «Atrás» del navegador vuelve a la misma página. Cuando
 * cambia `resetKey` (lo buscado, los filtros o el orden) vuelve a la página 1. Al montar no se reinicia: al volver de un
 * elemento se sigue en la página donde se estaba.
 */
export function usePage(resetKey: string | null, param = 'pagina'): [number, (n: number) => void] {
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number.parseInt(params.get(param) ?? '1', 10) || 1)
  const last = useRef(resetKey)
  useEffect(() => {
    // `null`: la pantalla ya reinicia la página al copiar sus filtros a la dirección (Biblioteca de pacientes)
    if (resetKey === null || last.current === resetKey) return
    last.current = resetKey
    setParams((p) => { const n = new URLSearchParams(p); n.delete(param); return n }, { replace: true })
  }, [resetKey, param, setParams])
  const setPage = (n: number) => {
    setParams((p) => { const x = new URLSearchParams(p); if (n > 1) x.set(param, String(n)); else x.delete(param); return x })
    // La lista empieza arriba al cambiar de página
    window.scrollTo?.({ top: 0 })
  }
  return [page, setPage]
}

/**
 * GE5 (ronda 10): la paginación de toda lista larga, como la de las páginas normales: «‹ Anterior», los números (con «…»),
 * «Siguiente ›» y «Mostrando 1–25 de 530». Botones de 44 px en el teléfono. Sin más de una página solo dice cuántos hay.
 */
export function Pagination({ page, pages, total, size, onPage, label = 'Páginas' }: {
  page: number; pages: number; total: number; size: number; onPage: (n: number) => void; label?: string
}) {
  if (!total) return null
  const from = (page - 1) * size + 1
  const to = Math.min(total, page * size)
  return (
    <nav className="pager" aria-label={label}>
      <span className="pager__info" role="status">Mostrando {from}–{to} de {total}</span>
      {pages > 1 && (
        <span className="pager__btns">
          <button type="button" className="pager__btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹ Anterior</button>
          {pageNumbers(page, pages).map((n, i) => n == null
            ? <span key={`gap${i}`} className="pager__gap" aria-hidden="true">…</span>
            : <button key={n} type="button" className={`pager__btn pager__num${n === page ? ' is-on' : ''}`} aria-current={n === page ? 'page' : undefined}
              aria-label={`Página ${n}`} onClick={() => onPage(n)}>{n}</button>)}
          <button type="button" className="pager__btn" disabled={page >= pages} onClick={() => onPage(page + 1)}>Siguiente ›</button>
        </span>
      )}
    </nav>
  )
}
