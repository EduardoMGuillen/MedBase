import { localISODate } from './format'

/**
 * AD8: filtros de la biblioteca de pacientes. Viven en la URL (se conservan al recargar o compartir el enlace).
 * `periodo` es el atajo de fechas de la última consulta; con "personalizado" valen `desde` y `hasta`.
 */
export const FILTER_KEYS = ['sexo', 'edadMin', 'edadMax', 'periodo', 'fecha', 'desde', 'hasta', 'medico', 'seguimiento', 'cita', 'estado'] as const
export type FilterKey = (typeof FILTER_KEYS)[number]
export type Filters = Record<FilterKey | 'q', string>

export const PERIODS = { hoy: 'Hoy', semana: 'Esta semana', mes: 'Este mes', '3meses': 'Últimos 3 meses', anio: 'Este año', personalizado: 'Personalizado' } as const
export type Period = keyof typeof PERIODS

/** Dónde está ahora el paciente. "En sala": llegó hoy y espera o está en consulta. */
export const WHERE = { sala: 'En sala', observacion: 'En observación', hospitalizado: 'Hospitalizado', casa: 'En casa' } as const

/** Atajos de un toque: los filtros que más se usan. */
export const SHORTCUTS: { label: string; set: Partial<Filters> }[] = [
  { label: 'Mujeres', set: { sexo: 'F' } },
  { label: 'Hombres', set: { sexo: 'M' } },
  { label: 'Niños (< 18)', set: { edadMin: '', edadMax: '17' } },
  { label: 'Adultos mayores (≥ 60)', set: { edadMin: '60', edadMax: '' } },
  { label: 'Crónicos', set: { seguimiento: 'cronico' } },
  { label: 'Sin cita de control', set: { cita: 'sin' } },
  { label: 'Atendidos este mes', set: { periodo: 'mes', desde: '', hasta: '' } },
]

/** ¿Está puesto el atajo? (todos sus valores coinciden) */
export const shortcutOn = (f: Filters, s: { set: Partial<Filters> }) => Object.entries(s.set).every(([k, v]) => f[k as FilterKey] === v)

/** Rango de fechas [desde, hasta] (AAAA-MM-DD) de un atajo, contado desde hoy. Lunes es el primer día de la semana. */
export function periodRange(p: string, desde = '', hasta = '', now = new Date()): [string, string] | null {
  const today = localISODate(now)
  const d = new Date(now)
  if (p === 'hoy') return [today, today]
  if (p === 'semana') { d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return [localISODate(d), today] }
  if (p === 'mes') return [`${today.slice(0, 7)}-01`, today]
  if (p === '3meses') { d.setMonth(d.getMonth() - 3); return [localISODate(d), today] }
  if (p === 'anio') return [`${today.slice(0, 4)}-01-01`, today]
  if (desde || hasta) return [desde || '0000-01-01', hasta || '9999-12-31']
  return null
}

const dmy = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y}` }

/**
 * Frase que dice en palabras lo filtrado: "Mostrando 12 mujeres de 18 a 40 años atendidas este mes".
 * `doctorName` y `chronic` vienen ya resueltos (nombre del médico, padecimiento).
 */
export function filterSummary(n: number, f: Filters, opts: { doctorName?: string; total: number }) {
  const fem = f.sexo === 'F'
  const one = n === 1
  const child = f.edadMax !== '' && Number(f.edadMax) < 18 && !f.edadMin
  const noun = f.sexo === 'F' ? (child ? (one ? 'niña' : 'niñas') : one ? 'mujer' : 'mujeres')
    : f.sexo === 'M' ? (child ? (one ? 'niño' : 'niños') : one ? 'hombre' : 'hombres')
      : child ? (one ? 'niño o niña' : 'niños y niñas') : one ? 'paciente' : 'pacientes'
  const a = (m: string, w: string) => (fem ? w : m)
  const parts: string[] = []
  if (f.edadMin && f.edadMax) parts.push(`de ${f.edadMin} a ${f.edadMax} años`)
  else if (f.edadMin) parts.push(`de ${f.edadMin} años o más`)
  else if (f.edadMax && !child) parts.push(`de hasta ${f.edadMax} años`)
  else if (child) parts.push('menores de 18 años')
  if (f.seguimiento === 'cronico') parts.push(`con algún padecimiento crónico`)
  else if (f.seguimiento.startsWith('cronico:')) parts.push(`con ${f.seguimiento.slice(8).toLowerCase()}`)
  else if (f.seguimiento === 'recordatorio') parts.push('con recordatorio')
  else if (f.seguimiento === 'procedimiento') parts.push('con procedimiento programado')
  else if (f.seguimiento === 'cualquiera') parts.push('con seguimiento activo')
  const field = f.fecha === 'registro' ? (one ? a('registrado', 'registrada') : a('registrados', 'registradas')) : (one ? a('atendido', 'atendida') : a('atendidos', 'atendidas'))
  const p = f.periodo || (f.desde || f.hasta ? 'personalizado' : '')
  if (p === 'hoy') parts.push(`${field} hoy`)
  else if (p === 'semana') parts.push(`${field} esta semana`)
  else if (p === 'mes') parts.push(`${field} este mes`)
  else if (p === '3meses') parts.push(`${field} en los últimos 3 meses`)
  else if (p === 'anio') parts.push(`${field} este año`)
  else if (p === 'personalizado' && (f.desde || f.hasta)) parts.push(`${field}${f.desde ? ` desde el ${dmy(f.desde)}` : ''}${f.hasta ? ` hasta el ${dmy(f.hasta)}` : ''}`)
  if (opts.doctorName) parts.push(`por ${opts.doctorName}`)
  if (f.cita === 'con') parts.push('con próxima cita')
  if (f.cita === 'sin') parts.push('sin cita de control')
  if (f.estado === 'sala') parts.push('en sala de espera')
  if (f.estado === 'observacion') parts.push('en observación')
  if (f.estado === 'hospitalizado') parts.push(one ? a('hospitalizado', 'hospitalizada') : a('hospitalizados', 'hospitalizadas'))
  if (f.estado === 'casa') parts.push('en casa')
  if (f.q.trim()) parts.push(`que coinciden con «${f.q.trim()}»`)
  if (!parts.length && !f.sexo) return `${opts.total} ${opts.total === 1 ? 'expediente' : 'expedientes'} en la biblioteca`
  return `Mostrando ${n} ${noun}${parts.length ? ` ${parts.join(' ')}` : ''}`
}
