import type { Express } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { type Ctx, fail, localDate, parse } from '../http.js'
import { createPatient, hit } from '../db.js'
import { toStaff } from '../mappers.js'
import type { Schedule } from '../../src/lib/types.js'

const pad = (n: number) => String(n).padStart(2, '0')
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

/** Reserva en línea para pacientes, sin sesión. Sólo expone nombres de médicos y horarios libres. */
export function registerPublic(app: Express, { sql, settings, staffRow, audit }: Ctx) {
  async function freeSlots(doctorId: string, date: string) {
    const doc = await staffRow(doctorId)
    if (!doc || doc.role !== 'doctor' || !doc.active || !doc.schedule) return []
    const sch = JSON.parse(String(doc.schedule)) as Schedule
    const day = new Date(`${date}T12:00:00`)
    if (!sch.days.includes(day.getDay())) return []
    const taken = (await sql.query(`SELECT start, minutes FROM appointments WHERE doctor_id = ? AND start LIKE ? AND status NOT IN ('cancelled','no_show')`,
      [doctorId, `${date}%`])).map((a) => {
      const s = toMin(String(a.start).slice(11, 16))
      return [s, s + Number(a.minutes)] as const
    })
    const now = new Date()
    const isToday = date === localDate(now)
    const nowMin = now.getHours() * 60 + now.getMinutes() + 60 // al menos una hora de anticipación
    const slots: string[] = []
    for (let m = toMin(sch.start); m + sch.slot <= toMin(sch.end); m += sch.slot) {
      if (isToday && m < nowMin) continue
      if (taken.some(([s, e]) => s < m + sch.slot && m < e)) continue
      slots.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`)
    }
    return slots
  }

  app.get('/api/public/clinic', async (_req, res) => {
    const s = await settings()
    const doctors = (await sql.query(`SELECT * FROM staff WHERE role = 'doctor' AND active ORDER BY name`)).map(toStaff)
      .map((d) => ({ id: d.id, name: d.name, specialty: d.specialty, color: d.color, schedule: d.schedule }))
    res.json({ name: s.name, address: s.address, phone: s.phone, doctors })
  })

  app.get('/api/public/slots', async (req, res) => {
    const q = parse(z.object({ doctorId: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), req.query, 'Elige médico y fecha.')
    if (q.date < localDate(new Date())) return res.json({ slots: [] })
    res.json({ slots: await freeSlots(q.doctorId, q.date) })
  })

  app.post('/api/public/book', async (req, res) => {
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
      reason: z.string().trim().min(3, 'Cuéntanos brevemente el motivo.').max(200),
      website: z.string().max(0).optional(), // campo trampa para bots
    }), req.body)
    if (await hit(sql, `book:${req.ip ?? 'unknown'}`, 60 * 60_000) > 8) fail(429, 'Has hecho demasiadas reservas seguidas. Llama a la clínica para agendar.')
    if (!(await freeSlots(b.doctorId, b.date)).includes(b.time)) fail(409, 'Ese horario acaba de ocuparse. Elige otro, por favor.')
    const doc = (await staffRow(b.doctorId))!
    const sch = JSON.parse(String(doc.schedule)) as Schedule
    const start = `${b.date}T${b.time}:00`
    const id = randomUUID()
    await sql.tx(async (q) => {
      // Serializa reservas del mismo médico para que dos pacientes no tomen la misma hora
      await q.run('SELECT pg_advisory_xact_lock(hashtext(?))', [`book:${b.doctorId}:${b.date}`])
      const clash = await q.one(`SELECT 1 FROM appointments WHERE doctor_id = ? AND start = ? AND status NOT IN ('cancelled','no_show')`, [b.doctorId, start])
      if (clash) fail(409, 'Ese horario acaba de ocuparse. Elige otro, por favor.')
      // Si ya existe un paciente con el mismo teléfono y fecha de nacimiento, se reutiliza su expediente
      const digits = b.phone.replace(/\D/g, '')
      const existing = (await q.query('SELECT id, phone FROM patients WHERE birth_date = ?', [b.birthDate]))
        .find((p) => String(p.phone).replace(/\D/g, '') === digits)
      const patientId = existing ? String(existing.id) : await createPatient(q, b)
      await q.run(`INSERT INTO appointments (id,patient_id,doctor_id,start,minutes,reason,type,status,source) VALUES (?,?,?,?,?,?,?, 'scheduled', 'online')`,
        [id, patientId, b.doctorId, start, sch.slot, b.reason, existing ? 'followup' : 'first'])
      await audit('online', `Reserva en línea: ${b.firstName} ${b.lastName} con ${doc.name} el ${b.date} a las ${b.time}`, q)
    })
    res.status(201).json({ code: id.slice(0, 8).toUpperCase(), doctor: doc.name, start })
  })
}
