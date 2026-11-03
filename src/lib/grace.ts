import { GRACE_MINUTES } from './clinicalConfig.js'

/** GE4 (ronda 9): el mensaje de cuando vence el periodo de gracia (lo dice el servidor y lo repite la ventana). */
export const GRACE_EXPIRED_TEXT = `Pasaron los ${GRACE_MINUTES} minutos para corregir. Lo que escribiste quedó guardado: agrégalo como adenda.`
