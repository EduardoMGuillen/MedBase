import type { Express } from 'express'
import { DEMO_PASSWORD } from '../db.js'
import { toStaff } from '../mappers.js'
import { seedDemo } from '../demoData.js'
import { type Ctx, fail } from '../http.js'

/** Mantenimiento de la demo: regenerar los pacientes demo (a mano o por la tarea diaria) y la lista de cuentas demo. */
export function registerDemo(app: Express, ctx: Ctx) {
  const { sql, demoMode, auth, need, userOf } = ctx
  // Cuentas de la demo para la pantalla de ingreso (solo en modo demo)
  app.get('/api/demo-accounts', async (_req, res) => {
    if (!demoMode) return res.json({ accounts: [], password: null })
    const rows = await sql.query(`SELECT s.*, c.name AS clinic_name FROM staff s LEFT JOIN clinics c ON c.id = s.clinic_id
      WHERE s.active AND s.email LIKE '%@demo.clinara' AND (c.active IS NULL OR c.active)
        -- DM1: sólo las clínicas demo, que se regeneran cada día (San Lucas queda para probar el aislamiento entre clínicas)
        AND (c.id IS NULL OR c.is_demo)
      ORDER BY c.created_at NULLS FIRST, CASE s.role WHEN 'doctor' THEN 0 WHEN 'nurse' THEN 1 WHEN 'reception' THEN 2 WHEN 'admin' THEN 3 ELSE 4 END, s.name`)
    res.json({ accounts: rows.map((r) => ({ ...toStaff(r), clinicName: r.clinic_name ?? undefined })), password: DEMO_PASSWORD })
  })

  // DM1 (ronda 5): ya no se vacía toda la base desde aquí (borraba también las clínicas reales); sólo se regeneran los
  // pacientes de las clínicas demo, con respaldo, como en seed:demo
  app.post('/api/admin/reset-demo', auth, need('platform.manage'), async (req, res) => {
    if (!demoMode) fail(403, 'Esta acción sólo está disponible en modo demo.')
    res.json(await seedDemo(sql, { by: userOf(req).id }))
  })

  /**
   * DM1: regenera los pacientes de las clínicas demo para hoy (respaldo, borrado sólo en clínicas con is_demo y datos
   * nuevos de 30 días atrás a 60 adelante). La tarea diaria de Vercel (vercel.json, 11:00 UTC = 05:00 en Honduras)
   * llama con `Authorization: Bearer CRON_SECRET`; la plataforma lo puede correr a mano.
   */
  app.get('/api/cron/demo', async (req, res) => {
    if (!demoMode) fail(403, 'Esta acción sólo está disponible en modo demo.')
    const secret = process.env.CRON_SECRET
    if (!secret || req.headers.authorization !== `Bearer ${secret}`) fail(401, 'No autorizado.')
    res.json(await seedDemo(sql))
  })
  app.post('/api/admin/seed-demo', auth, need('platform.manage'), async (req, res) => {
    if (!demoMode) fail(403, 'Esta acción sólo está disponible en modo demo.')
    res.json(await seedDemo(sql, { by: userOf(req).id }))
  })
}
