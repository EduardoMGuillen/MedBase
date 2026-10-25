import type { Express } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { type Ctx, fail, parse } from '../http.js'
import { toCertificate } from '../mappers.js'
import type { Sql } from '../sql.js'
import { yearsOld } from '../../src/lib/inpatient.js'
import { age } from '../../src/lib/format.js'

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha no es válida.')
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, 'La hora no es válida.')

/** Lo que el médico llena; los datos del paciente, del médico y de la clínica los pone el servidor. */
const input = z.object({
  patientId: z.string().min(1),
  consultationId: z.string().optional(),
  kind: z.enum(['attention', 'rest', 'free', 'companion']),
  to: z.string().trim().min(2, 'Escribe a quién va dirigida.').max(120),
  visitDate: ymd,
  fromTime: hhmm.optional(), toTime: hhmm.optional(),
  restDays: z.number().int().min(1, 'Indica los días de reposo.').max(90).optional(),
  restType: z.enum(['relativo', 'absoluto']).optional(),
  restFrom: ymd.optional(),
  includeDx: z.boolean().default(false),
  companion: z.object({ name: z.string().trim().min(3, 'Escribe el nombre del acompañante.').max(120), dni: z.string().trim().max(30).optional(), relation: z.string().trim().max(40).optional() }).optional(),
  text: z.string().trim().max(3000).optional(),
  notes: z.string().trim().max(500).optional(),
}).superRefine((b, ctx) => {
  if (b.kind === 'rest' && !b.restDays) ctx.addIssue({ code: 'custom', message: 'Indica los días de reposo.' })
  if (b.kind === 'free' && !(b.text && b.text.length >= 10)) ctx.addIssue({ code: 'custom', message: 'Escribe el texto de la constancia.' })
  if (b.kind === 'companion' && !b.companion) ctx.addIssue({ code: 'custom', message: 'Escribe los datos del acompañante.' })
  if (b.fromTime && b.toTime && b.fromTime > b.toTime) ctx.addIssue({ code: 'custom', message: 'La hora de salida debe ser después de la de llegada.' })
})

const addDays = (ymdStr: string, n: number) => {
  const d = new Date(`${ymdStr}T12:00:00`); d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function nextNumber(q: Sql, clinicId: string, now: Date) {
  await q.run('SELECT pg_advisory_xact_lock(hashtext(?))', [`cert:${clinicId}`])
  const year = now.getFullYear()
  const last = await q.one(`SELECT number FROM certificates WHERE clinic_id = ? AND number LIKE ? ORDER BY number DESC LIMIT 1`, [clinicId, `CM-${year}-%`])
  return `CM-${year}-${String(last ? Number(String(last.number).split('-')[2]) + 1 : 1).padStart(4, '0')}`
}

/**
 * Constancias médicas. Se guardan en el expediente con número correlativo, autor y fecha; se reimprimen
 * idénticas y no se editan: si hay un error se anulan (con motivo) y se emite otra.
 */
export function registerCertificates(app: Express, { sql, auth, need, userOf, clinicOf, audit, patientRow, settings, staffRow }: Ctx) {
  app.post('/api/certificates', auth, need('consult.write'), async (req, res) => {
    const b = parse(input, req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    const p = (await patientRow(cid, b.patientId)) ?? fail(404, 'El paciente no existe.')
    if (p!.pending) fail(409, 'Completa el registro del paciente antes de emitir la constancia.')
    let diagnoses: string[] = []
    if (b.consultationId) {
      const c = await sql.one('SELECT * FROM consultations WHERE id = ? AND patient_id = ? AND clinic_id = ?', [b.consultationId, b.patientId, cid])
      if (!c) fail(400, 'La consulta no corresponde a este paciente.')
      if (b.includeDx) diagnoses = (JSON.parse(String(c!.diagnoses)) as { label: string }[]).map((d) => d.label)
    }
    const doc = (await staffRow(user.id))!
    if (!doc.license) fail(400, 'Antes de emitir constancias registra tu número de colegiación.')
    const cfg = await settings(cid)
    const birth = String(p!.birth_date ?? '')
    const minor = birth ? yearsOld(birth) < 18 : false
    const data = {
      to: b.to, visitDate: b.visitDate, fromTime: b.fromTime, toTime: b.toTime, notes: b.notes, text: b.text, includeDx: b.includeDx,
      diagnoses: b.includeDx ? diagnoses : undefined, companion: b.kind === 'companion' ? b.companion : undefined,
      ...(b.kind === 'rest' ? { restDays: b.restDays, restType: b.restType ?? 'relativo', restFrom: b.restFrom ?? b.visitDate, restTo: addDays(b.restFrom ?? b.visitDate, b.restDays! - 1) } : {}),
      patient: {
        name: `${p!.first_name} ${p!.last_name}`, dni: p!.dni ? String(p!.dni) : undefined, age: age(birth), sex: (p!.sex ?? 'F') as 'F' | 'M',
        record: cfg.recordUsesDni && p!.dni ? String(p!.dni) : String(p!.record),
        guardian: minor && !p!.dni && p!.guardian_name ? `${p!.guardian_name}${p!.guardian_dni ? `, identidad ${p!.guardian_dni}` : ''}` : undefined,
      },
      doctor: { name: String(doc.name), specialty: doc.specialty ? String(doc.specialty) : undefined, license: String(doc.license) },
      clinic: { name: cfg.name, address: cfg.address, phone: cfg.phone, logo: cfg.logo },
    }
    const id = randomUUID()
    const now = new Date()
    await sql.tx(async (q) => {
      const number = await nextNumber(q, cid, now)
      await q.run(`INSERT INTO certificates (id, clinic_id, number, patient_id, consultation_id, doctor_id, kind, data, issued_at) VALUES (?,?,?,?,?,?,?,?,?)`,
        [id, cid, number, b.patientId, b.consultationId ?? null, user.id, b.kind, JSON.stringify(data), now.toISOString()])
      const kinds = { attention: 'de atención', rest: 'de incapacidad', free: 'libre', companion: 'para el acompañante' }
      await audit(user, `Emitió la constancia ${kinds[b.kind]} ${number} de ${p!.first_name} ${p!.last_name}${b.includeDx ? ' (con diagnóstico)' : ''}`, q)
    })
    res.status(201).json(toCertificate((await sql.one('SELECT * FROM certificates WHERE id = ?', [id]))!))
  })

  app.get('/api/certificates/:id', auth, need('chart.view'), async (req, res) => {
    const row = (await sql.one('SELECT * FROM certificates WHERE id = ? AND clinic_id = ?', [String(req.params.id), clinicOf(req)])) ?? fail(404, 'La constancia no existe.')
    const c = toCertificate(row!)
    await audit(userOf(req), `Abrió la constancia ${c.number} de ${c.data.patient.name}`)
    res.json(c)
  })

  app.get('/api/patients/:id/certificates', auth, need('chart.view'), async (req, res) => {
    const rows = await sql.query('SELECT * FROM certificates WHERE patient_id = ? AND clinic_id = ? ORDER BY issued_at DESC', [String(req.params.id), clinicOf(req)])
    res.json(rows.map(toCertificate))
  })

  app.post('/api/certificates/:id/void', auth, need('consult.write'), async (req, res) => {
    const { reason } = parse(z.object({ reason: z.string().trim().min(5, 'Escribe por qué se anula.').max(300) }), req.body)
    const user = userOf(req)
    const row = (await sql.one('SELECT * FROM certificates WHERE id = ? AND clinic_id = ?', [String(req.params.id), clinicOf(req)])) ?? fail(404, 'La constancia no existe.')
    if (row!.voided_at) fail(409, 'Esta constancia ya está anulada.')
    await sql.run('UPDATE certificates SET voided_at = ?, voided_by = ?, void_reason = ? WHERE id = ?', [new Date().toISOString(), user.id, reason, String(row!.id)])
    await audit(user, `Anuló la constancia ${row!.number}: ${reason}`)
    res.json(toCertificate((await sql.one('SELECT * FROM certificates WHERE id = ?', [String(row!.id)]))!))
  })

  // El médico registra su número de colegiación una sola vez (lo piden constancias y recetas)
  app.patch('/api/me', auth, async (req, res) => {
    const user = userOf(req)
    const { license } = parse(z.object({ license: z.string().trim().min(3, 'Escribe tu número de colegiación.').max(30) }), req.body)
    if (user.role !== 'doctor') fail(403, 'Sólo los médicos registran número de colegiación.')
    await sql.run('UPDATE staff SET license = ? WHERE id = ?', [license, user.id])
    await audit(user, 'Registró su número de colegiación')
    res.json({ ok: true })
  })
}
