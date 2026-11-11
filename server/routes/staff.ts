import type { Express } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { type Ctx, fail, parse } from '../http.js'
import { rolesOf, toStaff } from '../mappers.js'
import { checkPosition, cleanSchedule, CLINIC_ROLES as ROLES, createStaffMember, giveDoctorDefaults, nursePosition, scheduleInput, tempPassword, assertRoleFits, assertNotLastAdmin } from '../staff.js'
import { can, ROLE_LABEL } from '../../src/lib/permissions.js'
import { positionOf } from '../../src/lib/positions.js'

/** Personal de la clínica: alta, roles, horarios y contraseñas. */
export function registerStaff(app: Express, ctx: Ctx) {
  const { sql, auth, need, userOf, clinicOf, audit, staffRow, clinicStaffRow } = ctx
  // ---------- Personal ----------

  app.post('/api/staff', auth, need('staff.manage'), async (req, res) => {
    const s = parse(z.object({
      name: z.string().trim().min(3, 'Escribe el nombre completo.'),
      role: z.enum(ROLES),
      email: z.string().trim().email('El correo no es válido.'),
      specialty: z.string().trim().optional(),
      license: z.string().trim().optional(),
      // DP1 (ronda 11): cargo dentro de Laboratorio o Imágenes
      position: z.string().trim().max(40).optional(),
    }), req.body)
    await assertRoleFits(sql, clinicOf(req), s.role)
    checkPosition([s.role], s.position, s.license, s.name)
    // EN1 (ronda 16): enfermería con su puesto (Licenciada o Auxiliar); si no se elige, auxiliar
    if (s.role === 'nurse') s.position = nursePosition(s.position, s.name)
    const { user: created, password } = await createStaffMember(sql, clinicOf(req), s)
    await audit(userOf(req), `Creó el usuario ${s.name} (${ROLE_LABEL[s.role]}${s.position ? `, ${positionOf(s.position)?.label}` : ''})`)
    res.status(201).json({ user: created, password })
  })

  app.patch('/api/staff/:id', auth, need('staff.manage'), async (req, res) => {
    const me = userOf(req)
    const row = (await clinicStaffRow(clinicOf(req), String(req.params.id))) ?? fail(404, 'El usuario no existe.')
    const b = parse(z.object({
      active: z.boolean().optional(),
      role: z.enum(ROLES).optional(),
      // AD5: uno o varios roles
      roles: z.array(z.enum(ROLES)).min(1, 'Asigna al menos un rol.').max(ROLES.length).optional(),
      twoFactor: z.literal(false).optional(),
      specialty: z.string().trim().optional(),
      license: z.string().trim().optional(),
      serviceId: z.string().optional(),
      schedule: scheduleInput.optional(),
      position: z.string().trim().max(40).nullable().optional(),
    }), req.body)
    const id = String(row!.id)
    const cid = clinicOf(req)
    const prev = rolesOf(row!)
    const nextRoles = b.roles ? [...new Set(b.roles)] : b.role ? [b.role] : undefined
    if (id === me.id && b.active === false) fail(400, 'No puedes desactivar tu propia cuenta.')
    if (id === me.id && nextRoles && prev.includes('admin') && !nextRoles.includes('admin')) fail(400, 'No puedes quitarte a ti mismo el rol de Administración.')
    // Cada rol nuevo (o reactivar a alguien) tiene que caber en el tipo de cuenta
    if (nextRoles) for (const r of nextRoles.filter((x) => !prev.includes(x))) await assertRoleFits(sql, cid, r, id)
    if (b.active === true && !row!.active) for (const r of prev) await assertRoleFits(sql, cid, r, id)
    // Siempre queda al menos una persona activa con Administración en la clínica
    if ((nextRoles && prev.includes('admin') && !nextRoles.includes('admin')) || (b.active === false && prev.includes('admin'))) await assertNotLastAdmin(sql, cid, id)
    // DP1 (ronda 11): con Laboratorio o Imágenes, el cargo es obligatorio y, para Microbiólogo o Radiólogo, la colegiación
    const roles = nextRoles ?? prev
    const position = b.position === undefined ? (row!.position ? String(row!.position) : undefined) : b.position ?? undefined
    if (roles.some((r) => r === 'lab' || r === 'imaging') || b.position !== undefined) checkPosition(roles, position, b.license ?? (row!.license ? String(row!.license) : undefined), String(row!.name))
    // EN1 (ronda 16): solo con Enfermería (sin Laboratorio ni Imágenes), el puesto es el de enfermería (auxiliar si no tenía)
    const nurseOnly = roles.includes('nurse') && !roles.some((r) => r === 'lab' || r === 'imaging')
    const keptPosition = roles.some((r) => r === 'lab' || r === 'imaging') ? position
      : nurseOnly ? nursePosition(b.position ?? (positionOf(position)?.dept === 'nursing' ? position : undefined), String(row!.name)) : undefined
    const addsDoctor = nextRoles?.includes('doctor') && !prev.includes('doctor')
    if (addsDoctor && !row!.license && !b.license) fail(400, `Para darle el rol de médico a ${row!.name} escribe su número de colegiación.`)
    const changes: string[] = []
    await sql.tx(async (q) => {
      if (b.active !== undefined) { await q.run('UPDATE staff SET active = ?, token_version = token_version + 1 WHERE id = ?', [b.active, id]); changes.push(b.active ? 'Reactivó a' : 'Desactivó a') }
      if (nextRoles && nextRoles.join() !== prev.join()) {
        // El rol activo se conserva si lo sigue teniendo; si no, pasa al primero de los nuevos
        const active = nextRoles.includes(row!.role as (typeof ROLES)[number]) ? String(row!.role) : nextRoles[0]
        await q.run('UPDATE staff SET roles = ?, role = ? WHERE id = ?', [JSON.stringify(nextRoles), active, id])
        if (addsDoctor) await giveDoctorDefaults(q, cid, id)
        changes.push(`Cambió los roles (${nextRoles.map((r) => ROLE_LABEL[r]).join(', ')}) de`)
      }
      if (b.twoFactor === false) { await q.run('UPDATE staff SET totp_enabled = FALSE, totp_secret = NULL WHERE id = ?', [id]); changes.push('Quitó la verificación en dos pasos de') }
      if (b.specialty !== undefined) await q.run('UPDATE staff SET specialty = ? WHERE id = ?', [b.specialty || null, id])
      if (b.license !== undefined) await q.run('UPDATE staff SET license = ? WHERE id = ?', [b.license || null, id])
      if (b.serviceId !== undefined) await q.run('UPDATE staff SET service_id = ? WHERE id = ?', [b.serviceId || null, id])
      if (b.schedule) { await q.run('UPDATE staff SET schedule = ? WHERE id = ?', [JSON.stringify(cleanSchedule(b.schedule)), id]); changes.push('Actualizó el horario de') }
      if ((keptPosition ?? null) !== (row!.position ?? null)) {
        await q.run('UPDATE staff SET position = ? WHERE id = ?', [keptPosition ?? null, id])
        changes.push(`Cambió el cargo (${positionOf(row!.position ? String(row!.position) : undefined)?.label ?? 'sin cargo'} → ${positionOf(keptPosition)?.label ?? 'sin cargo'}) de`)
      }
    })
    // DP1: el cambio de cargo queda en la bitácora aunque cambie otra cosa a la vez
    if (changes.length > 1) for (const c of changes.slice(1)) await audit(me, `${c} ${row!.name}`)
    await audit(me, `${changes[0] ?? 'Actualizó los datos de'} ${row!.name}`)
    res.json(toStaff((await staffRow(id))!))
  })

  /** Horario de atención: administración edita el de cualquier médico y cada médico el suyo. */
  app.patch('/api/staff/:id/schedule', auth, async (req, res) => {
    const me = userOf(req)
    const row = (await clinicStaffRow(clinicOf(req), String(req.params.id))) ?? fail(404, 'El usuario no existe.')
    if (!rolesOf(row!).includes('doctor')) fail(400, 'Sólo los médicos tienen horario de atención.')
    if (!can(me, 'schedule.manage') && me.id !== row!.id) fail(403, 'Sólo puedes cambiar tu propio horario.')
    const schedule = cleanSchedule(parse(scheduleInput, req.body))
    await sql.run('UPDATE staff SET schedule = ? WHERE id = ?', [JSON.stringify(schedule), String(row!.id)])
    await audit(me, me.id === row!.id ? 'Actualizó su horario de atención' : `Actualizó el horario de ${row!.name}`)
    res.json(toStaff((await staffRow(String(row!.id)))!))
  })

  app.post('/api/staff/:id/reset-password', auth, need('staff.manage'), async (req, res) => {
    const row = (await clinicStaffRow(clinicOf(req), String(req.params.id))) ?? fail(404, 'El usuario no existe.')
    const password = tempPassword()
    await sql.run('UPDATE staff SET password_hash = ?, token_version = token_version + 1 WHERE id = ?', [bcrypt.hashSync(password, 10), String(row!.id)])
    await audit(userOf(req), `Restableció la contraseña de ${row!.name}`)
    res.json({ password })
  })
}
