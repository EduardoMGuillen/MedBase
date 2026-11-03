import { PAGE_SIZE } from './clinicalConfig.js'

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

