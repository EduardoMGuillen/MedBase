import type { Express } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { createPendingPatient } from '../db.js'
import { activeStayOf, stayConflictMessage } from '../stayVisits.js'
import { type Ctx, fail, localDate, parse, type Row } from '../http.js'
import { rolesOf, toAppointment, toStaff } from '../mappers.js'
import { can, type Permission } from '../../src/lib/permissions.js'
import { normalizeDni } from '../../src/lib/format.js'
import { DAY_NAMES_PLURAL, rangesOn, weekday, withinSchedule } from '../../src/lib/schedule.js'
import type { ApptStatus } from '../../src/lib/types.js'

/** Citas: agenda, estados y cobro al cerrar. */
export function registerAppointments(app: Express, ctx: Ctx) {
  const { sql, auth, need, userOf, clinicOf, audit, patientName, staffRow, clinicStaffRow, patientRow, apptRow } = ctx
  // ---------- Citas ----------
  // La duración ya no se fija: una consulta dura de 30 minutos a 2 horas. Se guarda 30 sólo para dibujarla.
  const VISUAL_MINUTES = 30
  const apptBody = z.object({
    patientId: z.string().optional(),
    // Paciente que llama por primera vez: basta nombre y teléfono; completa su registro al llegar
    newPatient: z.object({
      firstName: z.string().trim().min(2, 'Escribe el nombre del paciente nuevo.').max(60),
      lastName: z.string().trim().max(60).default(''),
      phone: z.string().trim().regex(/^[\d\s+()-]{7,20}$/, 'Escribe el teléfono del paciente nuevo.'),
      dni: z.string().trim().max(30).optional().transform(normalizeDni),
    }).optional(),
    doctorId: z.string().min(1, 'Elige un médico.'),
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/, 'La fecha u hora no es válida.'),
    minutes: z.number().int().min(10).max(240).optional(),
    reason: z.string().trim().max(300).default(''),
    type: z.enum(['first', 'followup', 'urgent']).optional(),
  })

  /** La hora debe caer dentro del horario de atención del médico ese día. */
  const assertInSchedule = (doc: Row, start: string) => {
    const staff = toStaff(doc)
    const date = start.slice(0, 10)
    if (!rangesOn(staff.schedule, date).length) fail(409, `${staff.name} no atiende los ${DAY_NAMES_PLURAL[weekday(date)]}. Elige otro día.`)
    if (!withinSchedule(staff.schedule, date, start.slice(11, 16))) fail(409, `${start.slice(11, 16)} está fuera del horario de ${staff.name}. Elige una hora de su horario.`)
  }

  app.get('/api/appointments', auth, need('agenda.view'), async (req, res) => {
    const q = parse(z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), req.query, 'Elige un rango de fechas.')
    const user = userOf(req)
    const rows = await sql.query(`SELECT a.*, EXISTS(SELECT 1 FROM payments p WHERE p.appointment_id = a.id AND NOT p.voided) AS paid
      FROM appointments a WHERE a.clinic_id = ? AND a.start >= ? AND a.start < ? ORDER BY a.start`, [clinicOf(req), q.from, `${q.to}T99`])
    const billing = can(user, 'billing.manage')
    res.json(rows.map((r) => ({ ...toAppointment(r), paid: billing ? Boolean(r.paid) : undefined })))
  })

  app.post('/api/appointments', auth, need('agenda.manage'), async (req, res) => {
    const a = parse(apptBody, req.body)
    if (!a.patientId && !a.newPatient) fail(400, 'Elige un paciente o escribe los datos del paciente nuevo.')
    const start = a.start.length === 16 ? `${a.start}:00` : a.start
    const cid = clinicOf(req)
    if (a.patientId) (await patientRow(cid, a.patientId)) ?? fail(400, 'El paciente no existe.')
    // CX2 (ronda 8): con una estancia activa no se agenda para hoy; a futuro sí (la agenda avisa)
    if (a.patientId && start.slice(0, 10) <= localDate(new Date())) {
      const stay = await activeStayOf(sql, cid, a.patientId)
      if (stay) fail(409, stayConflictMessage(stay))
    }
    const doc = await clinicStaffRow(cid, a.doctorId)
    if (!doc || !rolesOf(doc).includes('doctor') || !doc.active) fail(400, 'El médico elegido no está disponible.')
    assertInSchedule(doc!, start)
    // Se permiten dos citas a la misma hora con el mismo médico (pasa en la vida real); la agenda avisa antes
    const id = randomUUID()
    const seen = a.patientId ? await sql.one('SELECT 1 FROM consultations WHERE patient_id = ? AND clinic_id = ? LIMIT 1', [a.patientId, cid]) : undefined
    const type = a.type ?? (seen ? 'followup' : 'first')
    let patientId = a.patientId ?? ''
    await sql.tx(async (q) => {
      if (a.newPatient) patientId = await createPendingPatient(q, cid, a.newPatient)
      await q.run(`INSERT INTO appointments (id,patient_id,doctor_id,start,minutes,reason,type,status,source,clinic_id) VALUES (?,?,?,?,?,?,?, 'scheduled', 'staff', ?)`,
        [id, patientId, a.doctorId, start, a.minutes ?? VISUAL_MINUTES, a.reason, type, cid])
    })
    const who = a.newPatient ? `${a.newPatient.firstName} ${a.newPatient.lastName}`.trim() + ' (paciente nuevo, pendiente de registro)' : await patientName(patientId)
    await audit(userOf(req), `Agendó cita de ${who} con ${doc!.name} el ${start.slice(0, 10)} a las ${start.slice(11, 16)}`)
    res.status(201).json(toAppointment((await apptRow(cid, id))!))
  })

  app.patch('/api/appointments/:id', auth, need('agenda.manage'), async (req, res) => {
    const cid = clinicOf(req)
    const row = (await apptRow(cid, String(req.params.id))) ?? fail(404, 'La cita no existe.')
    // CX2 (ronda 8): la que canceló el sistema por una estancia activa también se reprograma
    const bySystem = row!.status === 'cancelled' && row!.cancelled_by === 'system'
    if (!['scheduled', 'confirmed'].includes(String(row!.status)) && !bySystem) fail(409, 'Sólo se pueden reprogramar citas que aún no empiezan.')
    const b = parse(apptBody.pick({ doctorId: true, start: true, minutes: true, reason: true }).partial(), req.body)
    const next = {
      doctorId: b.doctorId ?? String(row!.doctor_id),
      start: b.start ? (b.start.length === 16 ? `${b.start}:00` : b.start) : String(row!.start),
      minutes: b.minutes ?? Number(row!.minutes),
      reason: 'reason' in req.body ? b.reason ?? '' : String(row!.reason),
    }
    const doc = await clinicStaffRow(cid, next.doctorId)
    if (!doc || !rolesOf(doc).includes('doctor') || !doc.active) fail(400, 'El médico elegido no está disponible.')
    if (next.doctorId !== row!.doctor_id || next.start !== row!.start) assertInSchedule(doc!, next.start)
    if (next.start.slice(0, 10) <= localDate(new Date())) {
      const stay = await activeStayOf(sql, cid, String(row!.patient_id))
      if (stay) fail(409, stayConflictMessage(stay))
    }
    await sql.run('UPDATE appointments SET doctor_id = ?, start = ?, minutes = ?, reason = ?, status = ?, reminded_at = NULL, cancel_reason = NULL, cancelled_by = NULL, cancelled_at = NULL WHERE id = ?',
      [next.doctorId, next.start, next.minutes, next.reason, 'scheduled', String(row!.id)])
    await audit(userOf(req), `Reprogramó la cita de ${await patientName(String(row!.patient_id))} al ${next.start.slice(0, 10)} ${next.start.slice(11, 16)}`)
    res.json(toAppointment((await apptRow(cid, String(row!.id)))!))
  })

  /** Transiciones permitidas: estado destino → estados de origen y permiso necesario. */
  const TRANSITIONS: Partial<Record<ApptStatus, { from: ApptStatus[]; perm: Permission; label: string }>> = {
    confirmed: { from: ['scheduled'], perm: 'agenda.manage', label: 'Confirmó' },
    cancelled: { from: ['scheduled', 'confirmed'], perm: 'agenda.manage', label: 'Canceló' },
    arrived: { from: ['scheduled', 'confirmed'], perm: 'checkin.manage', label: 'Registró la llegada de' },
    no_show: { from: ['scheduled', 'confirmed'], perm: 'checkin.manage', label: 'Marcó inasistencia de' },
    in_consult: { from: ['scheduled', 'confirmed', 'arrived', 'triaged'], perm: 'consult.write', label: 'Inició la consulta de' },
  }

  app.post('/api/appointments/:id/status', auth, async (req, res) => {
    const user = userOf(req)
    const { status } = parse(z.object({ status: z.enum(['confirmed', 'cancelled', 'arrived', 'no_show', 'in_consult']) }), req.body)
    const cid = clinicOf(req)
    const row = (await apptRow(cid, String(req.params.id))) ?? fail(404, 'La cita no existe.')
    const t = TRANSITIONS[status]!
    if (!can(user, t.perm)) fail(403, 'Tu rol no tiene permiso para esta acción.')
    if (row!.status === status) return res.json(toAppointment(row!))
    if (!t.from.includes(row!.status as ApptStatus)) fail(409, 'La cita ya avanzó a otra etapa. Actualiza la página.')
    if (status === 'in_consult' && row!.doctor_id !== user.id) fail(403, 'Sólo el médico asignado puede atender esta cita.')
    if (status === 'arrived' && (await patientRow(cid, String(row!.patient_id)))?.pending) fail(409, 'Completa el registro del paciente nuevo antes de marcar su llegada.')
    // Ronda 8: un paciente internado no pasa a la consulta externa
    if (status === 'arrived' || status === 'in_consult') {
      const stay = await activeStayOf(sql, cid, String(row!.patient_id))
      if (stay) fail(409, stayConflictMessage(stay))
    }
    const at = new Date().toISOString()
    await sql.run(`UPDATE appointments SET status = ?, arrived_at = COALESCE(?, arrived_at), cancelled_by = COALESCE(?, cancelled_by), cancelled_at = COALESCE(?, cancelled_at) WHERE id = ?`,
      [status, status === 'arrived' ? at : null, status === 'cancelled' ? user.id : null, status === 'cancelled' ? at : null, String(row!.id)])
    await audit(user, `${t.label} la cita de ${await patientName(String(row!.patient_id))}`)
    res.json(toAppointment((await apptRow(cid, String(row!.id)))!))
  })

  /**
   * Un médico atiende al paciente listo para consulta de otro médico. Sólo uno lo obtiene: la
   * actualización exige que la cita siga asignada al médico que se vio en pantalla y lista para consulta.
   */
  app.post('/api/appointments/:id/take', auth, need('consult.write'), async (req, res) => {
    const user = userOf(req)
    if (user.role !== 'doctor') fail(403, 'Sólo un médico puede atender al paciente.')
    const { fromDoctorId } = parse(z.object({ fromDoctorId: z.string().min(1) }), req.body, 'Falta el médico asignado.')
    const cid = clinicOf(req)
    const row = (await apptRow(cid, String(req.params.id))) ?? fail(404, 'La cita no existe.')
    if (row!.doctor_id === user.id) fail(409, 'Este paciente ya está asignado a ti.')
    const now = new Date().toISOString()
    const taken = await sql.one(`UPDATE appointments SET doctor_id = ?, status = 'in_consult', reassigned_from = doctor_id, reassigned_by = ?, reassigned_at = ?
      WHERE id = ? AND clinic_id = ? AND doctor_id = ? AND status = 'triaged' RETURNING id`, [user.id, user.id, now, String(row!.id), cid, fromDoctorId])
    if (!taken) {
      const fresh = (await apptRow(cid, String(row!.id)))!
      const who = (await staffRow(String(fresh.doctor_id)))?.name ?? 'otro médico'
      fail(409, fresh.doctor_id !== fromDoctorId ? `${who} ya está atendiendo a este paciente.` : 'Este paciente ya no está listo para consulta. Actualiza la página.')
    }
    const from = (await staffRow(fromDoctorId))?.name ?? fromDoctorId
    await audit(user, `Tomó a ${await patientName(String(row!.patient_id))} para atenderlo; estaba asignado a ${from}`)
    res.json(toAppointment((await apptRow(cid, String(row!.id)))!))
  })

  // Paciente que llega sin cita: entra directo a la consulta externa del día, ya en sala
  app.post('/api/appointments/walk-in', auth, need('checkin.manage'), async (req, res) => {
    const b = parse(z.object({
      patientId: z.string().min(1, 'Elige un paciente.'),
      doctorId: z.string().min(1, 'Elige un médico.'),
      reason: z.string().trim().min(1, 'Escribe el motivo de consulta.').max(300),
      // EN1 (ronda 6): «Urgente», apagado por defecto: la etiqueta «Urgente» sale sólo si se marca
      urgent: z.boolean().default(false),
    }), req.body)
    const cid = clinicOf(req)
    ;(await patientRow(cid, b.patientId)) ?? fail(400, 'El paciente no existe.')
    const stay = await activeStayOf(sql, cid, b.patientId)
    if (stay) fail(409, stayConflictMessage(stay))
    const doc = await clinicStaffRow(cid, b.doctorId)
    if (!doc || !rolesOf(doc).includes('doctor') || !doc.active) fail(400, 'El médico elegido no está disponible.')
    const now = new Date()
    const id = randomUUID()
    const start = `${localDate(now)}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`
    const seen = await sql.one('SELECT 1 FROM consultations WHERE patient_id = ? AND clinic_id = ? LIMIT 1', [b.patientId, cid])
    await sql.run(`INSERT INTO appointments (id,patient_id,doctor_id,start,minutes,reason,type,status,arrived_at,source,clinic_id) VALUES (?,?,?,?,30,?,?,'arrived',?,'walkin',?)`,
      [id, b.patientId, b.doctorId, start, b.reason, b.urgent ? 'urgent' : seen ? 'followup' : 'first', now.toISOString(), cid])
    await audit(userOf(req), `Registró a ${await patientName(b.patientId)} sin cita para consulta externa con ${doc!.name}${b.urgent ? ', marcado como urgente' : ''}`)
    res.status(201).json(toAppointment((await apptRow(cid, id))!))
  })

  app.post('/api/appointments/:id/reminded', auth, need('agenda.manage', 'checkin.manage'), async (req, res) => {
    const cid = clinicOf(req)
    const row = (await apptRow(cid, String(req.params.id))) ?? fail(404, 'La cita no existe.')
    await sql.run('UPDATE appointments SET reminded_at = ? WHERE id = ?', [new Date().toISOString(), String(row!.id)])
    await audit(userOf(req), `Envió recordatorio por WhatsApp a ${await patientName(String(row!.patient_id))}`)
    res.json(toAppointment((await apptRow(cid, String(row!.id)))!))
  })
}
