import type { Express } from 'express'
import { type Ctx } from '../http.js'
import { type IcdClient } from '../icd.js'
import { localRelease, searchLocal } from '../icdLocal.js'

/** Diagnósticos CIE-11: búsqueda en la OMS con respaldo local. */
export function registerIcd(app: Express, ctx: Ctx, icd: IcdClient) {
  const { sql, demoMode, auth, need, clinicOf } = ctx
  // ---------- Diagnósticos CIE-11 ----------
  /**
   * Busca en la CIE-11. Con la API de la OMS configurada se consulta en línea; si no lo está, o si la OMS no
   * responde, se busca en el archivo oficial en español que trae Clinara, así que la búsqueda siempre funciona.
   */
  app.get('/api/icd/search', auth, need('chart.view', 'consult.write'), async (req, res) => {
    const q = String(req.query.q ?? '').trim()
    if (q.length < 2) return res.json({ source: 'file', release: '', results: [] })
    if (icd.configured()) {
      try { return res.json({ source: 'api', release: icd.release, results: await icd.search(q) }) } catch { /* se busca en el archivo */ }
    }
    try {
      res.json({ source: 'file', release: await localRelease(), results: await searchLocal(q) })
    } catch (e) {
      // Sin el archivo no se rompe la consulta: se avisa y se puede escribir el diagnóstico sin código
      console.error(e)
      res.json({ source: 'file', release: '', results: [], error: 'No se pudo buscar en la CIE-11 en este momento. Escribe el diagnóstico sin código.',
        // En la demo se muestra la causa, para diagnosticar el despliegue
        ...(demoMode ? { detail: String((e as Error).message).slice(0, 300) } : {}) })
    }
  })

  /** Diagnósticos CIE-11 que la clínica ya usó, los más frecuentes primero: sirven aun sin conexión con la OMS. */
  app.get('/api/icd/frequent', auth, need('chart.view', 'consult.write'), async (req, res) => {
    const cid = clinicOf(req)
    const rows = await sql.query(`SELECT d->>'code' AS code, d->>'label' AS label, MAX(d->>'uri') AS uri, COUNT(*)::int AS n FROM (
        SELECT jsonb_array_elements(diagnoses::jsonb) AS d FROM consultations WHERE clinic_id = ?
        UNION ALL SELECT jsonb_array_elements(diagnoses::jsonb) AS d FROM hospitalizations WHERE clinic_id = ?) x
      WHERE d->>'system' = 'icd11' GROUP BY 1, 2 ORDER BY n DESC, label LIMIT 40`, [cid, cid])
    res.json(rows.map((r) => ({ code: String(r.code), label: String(r.label), uri: r.uri ? String(r.uri) : undefined, system: 'icd11' })))
  })
}
