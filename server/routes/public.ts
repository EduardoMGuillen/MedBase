import type { Express } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { type Ctx, fail, localDate, parse, type Row } from '../http.js'
import { createPatient, hit } from '../db.js'
import { clinicSettings, toStaff } from '../mappers.js'
import type { Schedule } from '../../src/lib/types.js'
import { DEFAULT_SLOT, slotsOn } from '../../src/lib/schedule.js'

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

/**
 * Reserva en línea para pacientes, sin sesión. Cada clínica tiene su dirección: /reservar/<slug>.
 * Sólo expone nombres de médicos y horarios libres.
 */
export function registerPublic(app: Express, { sql, audit }: Ctx) {
  const clinicBySlug = async (slug: string) =>
    (await sql.one('SELECT * FROM clinics WHERE slug = ? AND active', [slug])) ?? fail(404, 'Esta clínica no existe o no recibe reservas en línea.')

  async function freeSlots(clinicId: string, doctorId: string, date: string) {
    const doc = await sql.one('SELECT * FROM staff WHERE id = ? AND clinic_id = ?', [doctorId, clinicId])
    if (!doc || doc.role !== 'doctor' || !doc.active || !doc.schedule) return []
    const sch = JSON.parse(String(doc.schedule)) as Schedule
    const step = sch.slot || DEFAULT_SLOT
    const offered = slotsOn(sch, date, step)
    if (!offered.length) return []
    const taken = (await sql.query(`SELECT start, minutes FROM appointments WHERE doctor_id = ? AND start LIKE ? AND status NOT IN ('cancelled','no_show')`,
      [doctorId, `${date}%`])).map((a) => {
      const s = toMin(String(a.start).slice(11, 16))
      return [s, s + Number(a.minutes)] as const
    })
    const now = new Date()
    const isToday = date === localDate(now)
    const nowMin = now.getHours() * 60 + now.getMinutes() + 60 // al menos una hora de anticipación
    // En línea no se ofrece una hora que ya tiene cita: el paciente no ve la agenda
    return offered.filter((hhmm) => {
      const m = toMin(hhmm)
      if (isToday && m < nowMin) return false
      return !taken.some(([s, e]) => s < m + step && m < e)
    })
  }

  app.get('/api/public/clinics', async (_req, res) => {
    const rows = await sql.query(`SELECT c.slug, c.name, c.address FROM clinics c
      WHERE c.active AND EXISTS (SELECT 1 FROM staff s WHERE s.clinic_id = c.id AND s.role = 'doctor' AND s.active) ORDER BY c.name`)
    res.json(rows.map((r: Row) => ({ slug: String(r.slug), name: String(r.name), address: String(r.address) })))
  })

  app.get('/api/public/:slug/clinic', async (req, res) => {
    const c = await clinicBySlug(String(req.params.slug))
    const s = clinicSettings(c!)
    const doctors = (await sql.query(`SELECT * FROM staff WHERE clinic_id = ? AND role = 'doctor' AND active ORDER BY name`, [c!.id])).map(toStaff)
      .map((d) => ({ id: d.id, name: d.name, specialty: d.specialty, color: d.color, schedule: d.schedule }))
    res.json({ name: s.name, address: s.address, phone: s.phone, doctors })
  })

  app.get('/api/public/:slug/slots', async (req, res) => {
    const c = await clinicBySlug(String(req.params.slug))
    const q = parse(z.object({ doctorId: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), req.query, 'Elige médico y fecha.')
    if (q.date < localDate(new Date())) return res.json({ slots: [] })
    res.json({ slots: await freeSlots(String(c!.id), q.doctorId, q.date) })
  })

  app.post('/api/public/:slug/book', async (req, res) => {
    const c = await clinicBySlug(String(req.params.slug))
    const clinicId = String(c!.id)
    const b = parse(z.object({
      doctorId: z.string().min(1, 'Elige un médico.'),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elige una fecha.'),
      time: z.string().regex(/^\d{2}:\d{2}$/, 'Elige una hora.'),
      firstName: z.string().trim().min(2, 'Escribe tus nombres.').max(60),
      lastName: z.string().trim().min(2, 'Escribe tus apellidos.').max(60),
      birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Escribe tu fecha de nacimiento.'),
      sex: z.enum(['F', 'M'], { error: 'Indica el sexo.' }),
      phone: z.string().trim().regex(/^[\d\s+()-]{7,20}$/, 'Escribe un teléfono válido.'),
      email: z.string().trim().email('El correo no es válido.').optional().or(z.literal('').transform(() => undefined)),
      dni: z.string().trim().max(30).optional().or(z.literal('').transform(() => undefined)),
      reason: z.string().trim().min(3, 'Cuéntanos brevemente el motivo.').max(200),
      website: z.string().max(0).optional(), // campo trampa para bots
    }), req.body)
    if (await hit(sql, `book:${req.ip ?? 'unknown'}`, 60 * 60_000) > 8) fail(429, 'Has hecho demasiadas reservas seguidas. Llama a la clínica para agendar.')
    if (!(await freeSlots(clinicId, b.doctorId, b.date)).includes(b.time)) fail(409, 'Ese horario acaba de ocuparse. Elige otro, por favor.')
    const doc = (await sql.one('SELECT * FROM staff WHERE id = ? AND clinic_id = ?', [b.doctorId, clinicId]))!
    const sch = JSON.parse(String(doc.schedule)) as Schedule
    const start = `${b.date}T${b.time}:00`
    const id = randomUUID()
    await sql.tx(async (q) => {
      // Serializa reservas del mismo médico para que dos pacientes no tomen la misma hora
      await q.run('SELECT pg_advisory_xact_lock(hashtext(?))', [`book:${b.doctorId}:${b.date}`])
      const clash = await q.one(`SELECT 1 FROM appointments WHERE doctor_id = ? AND start = ? AND status NOT IN ('cancelled','no_show')`, [b.doctorId, start])
      if (clash) fail(409, 'Ese horario acaba de ocuparse. Elige otro, por favor.')
      // Si ya existe un paciente de esta clínica con el mismo teléfono y fecha de nacimiento, se reutiliza su expediente
      const digits = b.phone.replace(/\D/g, '')
      const existing = (await q.query('SELECT id, phone, dni FROM patients WHERE clinic_id = ? AND birth_date = ?', [clinicId, b.birthDate]))
        .find((p) => String(p.phone).replace(/\D/g, '') === digits || (b.dni && p.dni === b.dni))
      const patientId = existing ? String(existing.id) : await createPatient(q, clinicId, b)
      // Si el expediente existía sin identidad, se completa con la que escribió el paciente
      if (existing && b.dni && !existing.dni) await q.run('UPDATE patients SET dni = ? WHERE id = ?', [b.dni, patientId])
      await q.run(`INSERT INTO appointments (id,patient_id,doctor_id,start,minutes,reason,type,status,source,clinic_id) VALUES (?,?,?,?,?,?,?, 'scheduled', 'online', ?)`,
        [id, patientId, b.doctorId, start, sch.slot || DEFAULT_SLOT, b.reason, existing ? 'followup' : 'first', clinicId])
      await audit({ id: 'online', clinicId }, `Reserva en línea: ${b.firstName} ${b.lastName} con ${doc.name} el ${b.date} a las ${b.time}`, q)
    })
    res.status(201).json({ code: id.slice(0, 8).toUpperCase(), doctor: doc.name, start, clinic: c!.name })
  })
}
