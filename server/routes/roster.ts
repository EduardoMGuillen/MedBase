import type { Express } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { type Ctx, fail, hasRoleSql, parse } from '../http.js'
import { localISODate } from '../../src/lib/format.js'

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha no es válida.')
/** «lunes 03/11/2026», como se lee en la bitácora. */
const dayText = (d: string) => {
  const [y, m, n] = d.split('-').map(Number)
  const date = new Date(y, m - 1, n)
  return `${date.toLocaleDateString('es-HN', { weekday: 'long' })} ${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`
}

/**
 * AD3 (ronda 5): rol de turnos. Administración asigna qué médico trabaja cada día (uno o varios). Es informativo: no
 * cambia la agenda, que se sigue rigiendo por los horarios de cada médico. Quitar a alguien no borra la asignación (queda
 * con quién y cuándo la quitó) y todo queda en la bitácora, también si el día ya pasó. No aplica a los consultorios.
 */
export function registerRoster(app: Express, { sql, auth, need, userOf, clinicOf, audit }: Ctx) {
  const clinicOnly = async (cid: string) => {
    if ((await sql.one('SELECT kind FROM clinics WHERE id = ?', [cid]))?.kind === 'office') fail(400, 'El rol de turnos es para clínicas con varios médicos; un consultorio tiene uno solo.')
  }
  const toRow = (r: Record<string, unknown>) => ({ id: String(r.id), day: String(r.day), staffId: String(r.staff_id), assignedBy: String(r.assigned_by), assignedAt: String(r.assigned_at) })

  app.get('/api/roster', auth, need('settings.manage'), async (req, res) => {
    const q = parse(z.object({ from: day, to: day }), req.query)
    const rows = await sql.query('SELECT * FROM duty_roster WHERE clinic_id = ? AND removed_at IS NULL AND day >= ? AND day <= ? ORDER BY day, assigned_at', [clinicOf(req), q.from, q.to])
    res.json(rows.map(toRow))
  })

  app.post('/api/roster', auth, need('settings.manage'), async (req, res) => {
    const b = parse(z.object({ day, staffId: z.string().min(1) }), req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    await clinicOnly(cid)
    const doc = (await sql.one(`SELECT id, name FROM staff WHERE id = ? AND clinic_id = ? AND active AND ${hasRoleSql('doctor')}`, [b.staffId, cid])) ?? fail(400, 'Elige un médico activo de la clínica.')
    if (await sql.one('SELECT 1 FROM duty_roster WHERE clinic_id = ? AND day = ? AND staff_id = ? AND removed_at IS NULL', [cid, b.day, b.staffId])) fail(409, `${doc!.name} ya está en el turno de ese día.`)
    const id = randomUUID()
    await sql.run('INSERT INTO duty_roster (id, clinic_id, day, staff_id, assigned_by, assigned_at) VALUES (?,?,?,?,?,?)', [id, cid, b.day, b.staffId, user.id, new Date().toISOString()])
    const past = b.day < localISODate(new Date())
    await audit(user, `Rol de turnos: asignó a ${doc!.name} el ${dayText(b.day)}${past ? ' (día que ya pasó)' : ''}`)
    res.status(201).json(toRow((await sql.one('SELECT * FROM duty_roster WHERE id = ?', [id]))!))
  })

  app.delete('/api/roster/:id', auth, need('settings.manage'), async (req, res) => {
    const user = userOf(req)
    const cid = clinicOf(req)
    const r = (await sql.one('SELECT r.*, s.name FROM duty_roster r JOIN staff s ON s.id = r.staff_id WHERE r.id = ? AND r.clinic_id = ? AND r.removed_at IS NULL', [String(req.params.id), cid])) ?? fail(404, 'Esa asignación no existe.')
    await sql.run('UPDATE duty_roster SET removed_at = ?, removed_by = ? WHERE id = ?', [new Date().toISOString(), user.id, String(r!.id)])
    const past = String(r!.day) < localISODate(new Date())
    await audit(user, `Rol de turnos: quitó a ${r!.name} del ${dayText(String(r!.day))}${past ? ' (día que ya pasó)' : ''}`)
    res.json({ ok: true })
  })
}
