/**
 * Zona horaria del servidor: la de la clínica (Honduras, UTC−6 sin horario de verano), o la de CLINIC_TZ.
 * Se importa primero en la entrada del servidor y de la función de Vercel, que corre en UTC: así "hoy", la
 * agenda, los reportes y los datos de demostración usan la misma hora que ve la clínica. Las fechas se siguen
 * guardando en UTC (ISO); esto sólo cambia cómo se interpreta la hora local.
 */
process.env.TZ = process.env.CLINIC_TZ || 'America/Tegucigalpa'

export const CLINIC_TZ = process.env.TZ
