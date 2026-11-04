import type { Sql } from './sql.js'

/**
 * v80 (ronda 12, LB3): sin umbrales críticos. Las órdenes que quedaron marcadas «Valor crítico» dejan de estarlo (los valores
 * conservan su Alto o Bajo frente al valor de referencia). Los umbrales guardados en la clínica no se borran: ya no se usan.
 * Idempotente.
 */
export async function clearCriticalFlags(q: Sql) {
  await q.run('UPDATE exam_orders SET critical = FALSE WHERE critical = TRUE')
}
