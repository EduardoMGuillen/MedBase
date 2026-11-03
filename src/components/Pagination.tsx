import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PAGE_SIZE } from '../lib/clinicalConfig'

/**
 * GE5 (ronda 10): números de página que se muestran: 1 … 4 5 6 … 21 (siempre la primera, la última y las vecinas de la
 * actual; `null` es «…»).
 */
export function pageNumbers(page: number, pages: number): (number | null)[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
  const set = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages))
  if (page <= 3) [2, 3, 4].forEach((n) => set.add(n))
  if (page >= pages - 2) [pages - 3, pages - 2, pages - 1].forEach((n) => set.add(n))
  const list = [...set].sort((a, b) => a - b)
  const out: (number | null)[] = []
  list.forEach((n, i) => { if (i && n - list[i - 1] > 1) out.push(null); out.push(n) })
  return out
}

/** La página de una lista completa (ya buscada, filtrada y ordenada): sus filas y la página válida. */
export function paginate<T>(list: T[], page: number, size = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(list.length / size))
  const current = Math.min(Math.max(1, page), pages)
  return { rows: list.slice((current - 1) * size, current * size), page: current, pages, total: list.length, size }
}

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
