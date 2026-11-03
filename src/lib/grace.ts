import { GRACE_MINUTES } from './clinicalConfig.js'

/** GE4 (ronda 9): el mensaje de cuando vence el periodo de gracia (lo dice el servidor y lo repite la ventana). */
export const GRACE_EXPIRED_TEXT = `Pasaron los ${GRACE_MINUTES} minutos para corregir. Lo que escribiste quedó guardado: agrégalo como adenda.`

/** GE4: el motivo con que queda suspendido un medicamento (o cancelado un examen) que se quitó al corregir la nota. */
export const REMOVED_IN_GRACE = 'Quitado al corregir la nota (periodo de gracia)'
