import type { Express } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { type Ctx, fail, parse } from '../http.js'
import { toVitals } from '../mappers.js'

/** Triaje: signos vitales de la consulta externa. */
export function registerTriage(app: Express, ctx: Ctx) {
  const { sql, auth, need, userOf, clinicOf, audit, patientName, patientRow, apptRow } = ctx
  // ---------- Triaje ----------
  app.post('/api/vitals', auth, need('vitals.record'), async (req, res) => {
    const user = userOf(req)
    // Los límites son sólo de cordura: un valor improbable que enfermería confirmó se guarda (la preclínica avisa antes)
    const int = (max: number, label: string) => z.number({ error: `Revisa ${label}.` }).min(0, `Revisa ${label}.`).max(max, `Revisa ${label}.`).transform(Math.round).optional()
    const dec = (max: number, label: string) => z.number({ error: `Revisa ${label}.` }).min(0, `Revisa ${label}.`).max(max, `Revisa ${label}.`).optional()
    const v = parse(z.object({
      patientId: z.string(), appointmentId: z.string().optional(),
      systolic: int(400, 'la presión sistólica'), diastolic: int(300, 'la presión diastólica'),
      heartRate: int(400, 'la frecuencia cardíaca'), temperature: dec(50, 'la temperatura'), spo2: int(100, 'la saturación'),
      weightKg: dec(500, 'el peso'), heightCm: dec(300, 'la talla'),
      painScale: z.number().int().min(0).max(10).optional(), notes: z.string().max(2000).optional(),
      respRate: int(150, 'la frecuencia respiratoria'),
      glucose: dec(3000, 'la glucometría'),
      chiefComplaint: z.string().trim().max(500).optional(),
    }), req.body)
    const cid = clinicOf(req)
    ;(await patientRow(cid, v.patientId)) ?? fail(404, 'El paciente no existe.')
    if (v.appointmentId) {
      const a = await apptRow(cid, v.appointmentId)
      if (!a || a.patient_id !== v.patientId) fail(400, 'La cita no corresponde a este paciente.')
    }
    const id = randomUUID()
    const name = await patientName(v.patientId)
    await sql.tx(async (q) => {
      await q.run(`INSERT INTO vitals (id,patient_id,appointment_id,taken_by,taken_at,systolic,diastolic,heart_rate,temperature,spo2,weight_kg,height_cm,pain_scale,notes,resp_rate,glucose,chief_complaint,clinic_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, v.patientId, v.appointmentId ?? null, user.id, new Date().toISOString(), v.systolic ?? null, v.diastolic ?? null, v.heartRate ?? null, v.temperature ?? null, v.spo2 ?? null,
          v.weightKg ?? null, v.heightCm ?? null, v.painScale ?? null, v.notes || null, v.respRate ?? null, v.glucose ?? null, v.chiefComplaint || null, cid])
      if (v.appointmentId) await q.run(`UPDATE appointments SET status = 'triaged' WHERE id = ? AND status = 'arrived'`, [v.appointmentId])
      await audit(user, `Registró signos vitales de ${name}`, q)
    })
    res.status(201).json(toVitals((await sql.one('SELECT * FROM vitals WHERE id = ?', [id]))!))
  })
}
