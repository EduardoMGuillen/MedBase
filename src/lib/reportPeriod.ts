/**
 * RP2 (ronda 18): periodos de Reportes. Los móviles («7 días», «30 días», «90 días») y el mes calendario («Mes»).
 * Todo con fechas locales `aaaa-mm-dd` y meses `aaaa-mm`; sin horas, para que no dependa de la zona del navegador.
 */
export const REPORT_PRESETS = [{ days: 7, label: '7 días' }, { days: 30, label: '30 días' }, { days: 90, label: '90 días' }] as const

export type ReportPeriod = { kind: 'days'; days: number } | { kind: 'month'; month: string }

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const pad = (n: number) => String(n).padStart(2, '0')

/** «Noviembre 2026» */
export const monthLabel = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`

/** El mes de antes (−1) o el de después (+1). */
export function shiftMonth(month: string, by: number) {
  const d = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + by, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

/** Del día 1 al último del mes; el mes en curso llega hasta hoy. */
export function monthRange(month: string, today: string) {
  const last = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()
  const to = `${month}-${pad(last)}`
  return { from: `${month}-01`, to: to > today ? today : to }
}

/** Los últimos N días, contando hoy. */
export function daysRange(days: number, today: string) {
  const d = new Date(`${today}T12:00:00`)
  d.setDate(d.getDate() - (days - 1))
  return { from: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, to: today }
}

/**
 * El periodo que dice la dirección: `?periodo=7|90|mes` (sin nada, 30 días) y `&mes=2026-11`. Un mes futuro o mal escrito
 * cae en el mes actual.
 */
export function periodFromParams(params: URLSearchParams, today: string): ReportPeriod {
  const p = params.get('periodo')
  if (p === 'mes') {
    const m = params.get('mes') ?? ''
    const thisMonth = today.slice(0, 7)
    return { kind: 'month', month: /^\d{4}-(0[1-9]|1[0-2])$/.test(m) && m <= thisMonth ? m : thisMonth }
  }
  return { kind: 'days', days: REPORT_PRESETS.find((x) => String(x.days) === p)?.days ?? 30 }
}

export const periodRange = (p: ReportPeriod, today: string) => (p.kind === 'month' ? monthRange(p.month, today) : daysRange(p.days, today))
