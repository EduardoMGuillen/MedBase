/**
 * RP1 (ronda 18): la variación de un cuadro de Reportes contra el periodo anterior, como texto: «▲ 12.5 % vs. mes anterior»,
 * «▼ 3.0 % vs. 7 días anteriores», «= 0 % vs. …» o «Sin datos del periodo anterior». La flecha va siempre, para que se
 * entienda sin el color. Nunca muestra el número bruto del periodo anterior.
 */
export interface Delta { dir: 'up' | 'down' | 'same' | 'none'; text: string }

export const NO_PREVIOUS = 'Sin datos del periodo anterior'

/**
 * (actual − anterior) ÷ anterior × 100, con un decimal. `vs` es contra qué se compara («mes anterior», «1–12 oct»).
 * Anterior en 0 (o sin dato) y actual no: sin datos. Los dos en 0: sin cambio. Si el periodo actual no tiene dato
 * (asistencia sin citas atendidas ni perdidas) y el anterior sí, no hay nada que comparar: `null`.
 */
export function formatDelta(current: number | null, previous: number | null, vs: string): Delta | null {
  const prev = previous ?? 0
  if (current === null && prev !== 0) return null
  const cur = current ?? 0
  const same: Delta = { dir: 'same', text: `= 0 % vs. ${vs}` }
  if (prev === 0) return cur === 0 ? same : { dir: 'none', text: NO_PREVIOUS }
  const pct = Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10
  if (pct === 0) return same
  return pct > 0 ? { dir: 'up', text: `▲ ${pct.toFixed(1)} % vs. ${vs}` } : { dir: 'down', text: `▼ ${Math.abs(pct).toFixed(1)} % vs. ${vs}` }
}

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/**
 * Contra qué se compara, según el periodo anterior que calculó el servidor: «7 días anteriores»; con «Mes», «mes anterior»
 * si es el mes completo o «1–12 oct» si son los mismos días del mes en curso (A2).
 */
export function vsLabel(month: boolean, previous: { from: string; to: string }) {
  if (!month) {
    const days = Math.round((new Date(`${previous.to}T12:00:00`).getTime() - new Date(`${previous.from}T12:00:00`).getTime()) / 86_400_000) + 1
    return `${days} días anteriores`
  }
  const [y, m, d] = previous.to.split('-').map(Number)
  return d === new Date(y, m, 0).getDate() ? 'mes anterior' : `1–${d} ${MONTHS_SHORT[m - 1]}`
}
