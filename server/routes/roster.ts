import type { Express } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { type Ctx, fail, hasRoleSql, parse } from '../http.js'
import { can } from '../../src/lib/permissions.js'
import type { Staff } from '../../src/lib/types.js'
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
type Dept = 'doctors' | 'nursing' | 'lab' | 'imaging'
const DEPT_ROLE: Record<Dept, string> = { doctors: 'doctor', nursing: 'nurse', lab: 'lab', imaging: 'imaging' }
const DEPT_LABEL: Record<Dept, string> = { doctors: 'Médicos', nursing: 'Enfermería', lab: 'Laboratorio', imaging: 'Imágenes' }
/** En la bitácora: «Rol de turnos:» para Médicos (como siempre) y «Rol de turnos (Laboratorio):» para los demás. */
const tag = (d: Dept) => (d === 'doctors' ? 'Rol de turnos' : `Rol de turnos (${DEPT_LABEL[d]})`)
const SHIFT_LABEL: Record<string, string> = { morning: 'Mañana', afternoon: 'Tarde', night: 'Noche' }

/**
 * AD3 (ronda 5): rol de turnos. Administración asigna qué médico trabaja cada día (uno o varios). Es informativo: no
 * cambia la agenda, que se sigue rigiendo por los horarios de cada médico. Quitar a alguien no borra la asignación (queda
 * con quién y cuándo la quitó) y todo queda en la bitácora, también si el día ya pasó. No aplica a los consultorios.
 * DP6 (ronda 11): por departamento («Médicos | Enfermería | Laboratorio | Imágenes»); fuera de Médicos, por turno (Mañana,
 * Tarde, Noche; horas en clinicalConfig, VALIDAR: Emil). Solo se asigna personal con el rol del departamento. Editan
 * Administración (todo) y, en su departamento y de hoy en adelante, el Microbiólogo (Laboratorio) y el Radiólogo (Imágenes);
 * los técnicos ven el de su departamento. EN1 (ronda 16): Enfermería ve el suyo y la Licenciada en enfermería lo edita de hoy en
 * adelante (como el jefe de Laboratorio con el suyo); las auxiliares solo lo ven. Nadie de enfermería toca los otros.
 */
export function registerRoster(app: Express, { sql, auth, userOf, clinicOf, audit }: Ctx) {
  const clinicOnly = async (cid: string) => {
    if ((await sql.one('SELECT kind FROM clinics WHERE id = ?', [cid]))?.kind === 'office') fail(400, 'El rol de turnos es para clínicas con varios médicos; un consultorio tiene uno solo.')
  }
  const toRow = (r: Record<string, unknown>) => ({ id: String(r.id), day: String(r.day), staffId: String(r.staff_id), assignedBy: String(r.assigned_by), assignedAt: String(r.assigned_at),
    dept: String(r.dept ?? 'doctors') as Dept, shift: r.shift ? String(r.shift) : undefined })
  // EN1 (ronda 16): enfermería (con roster.view) ve el de enfermería; la licenciada (roster.edit) lo edita de hoy en adelante
  const ownDept = (u: Staff): Dept | undefined => (u.role === 'lab' ? 'lab' : u.role === 'imaging' ? 'imaging' : u.role === 'nurse' && can(u, 'roster.view') ? 'nursing' : undefined)
  const canView = (u: Staff, d: Dept) => can(u, 'settings.manage') || ownDept(u) === d
  const canEdit = (u: Staff, d: Dept, day: string) => can(u, 'settings.manage')
    || (ownDept(u) === d && (d === 'nursing' ? can(u, 'roster.edit') : can(u, 'dept.config')) && day >= localISODate(new Date()))
  const deptQ = z.enum(['doctors', 'nursing', 'lab', 'imaging']).default('doctors')
  const assign = async (cid: string, user: Staff, b: { day: string; staffId: string; dept: Dept; shift?: string }) => {
    if (!canEdit(user, b.dept, b.day)) fail(403, b.day < localISODate(new Date()) && !can(user, 'settings.manage') ? 'Solo se editan los turnos de hoy en adelante.' : 'No puedes editar este rol de turnos.')
    if (b.dept !== 'doctors' && !SHIFT_LABEL[b.shift ?? '']) fail(400, 'Elige el turno: Mañana, Tarde o Noche.')
    const shift = b.dept === 'doctors' ? null : b.shift!
    const person = (await sql.one(`SELECT id, name FROM staff WHERE id = ? AND clinic_id = ? AND active AND ${hasRoleSql(DEPT_ROLE[b.dept])}`, [b.staffId, cid]))
      ?? fail(400, b.dept === 'doctors' ? 'Elige un médico activo de la clínica.' : `Solo se asigna personal con el rol ${DEPT_LABEL[b.dept]}.`)
    if (await sql.one(`SELECT 1 FROM duty_roster WHERE clinic_id = ? AND dept = ? AND day = ? AND staff_id = ? AND COALESCE(shift, '') = ? AND removed_at IS NULL`, [cid, b.dept, b.day, b.staffId, shift ?? ''])) return null
    const id = randomUUID()
    await sql.run('INSERT INTO duty_roster (id, clinic_id, day, staff_id, assigned_by, assigned_at, dept, shift) VALUES (?,?,?,?,?,?,?,?)', [id, cid, b.day, b.staffId, user.id, new Date().toISOString(), b.dept, shift])
    return { id, name: String(person!.name) }
  }

  app.get('/api/roster', auth, async (req, res) => {
    const q = parse(z.object({ from: day, to: day, dept: deptQ }), req.query)
    if (!canView(userOf(req), q.dept)) fail(403, 'No tienes acceso a este rol de turnos.')
    const rows = await sql.query('SELECT * FROM duty_roster WHERE clinic_id = ? AND dept = ? AND removed_at IS NULL AND day >= ? AND day <= ? ORDER BY day, assigned_at', [clinicOf(req), q.dept, q.from, q.to])
    res.json(rows.map(toRow))
  })

  app.post('/api/roster', auth, async (req, res) => {
    const b = parse(z.object({ day, staffId: z.string().min(1), dept: deptQ, shift: z.string().optional() }), req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    await clinicOnly(cid)
    const r = await assign(cid, user, b)
    if (!r) fail(409, 'Esa persona ya está en ese turno.')
    const past = b.day < localISODate(new Date())
    await audit(user, `${tag(b.dept)}: asignó a ${r!.name} el ${dayText(b.day)}${b.shift && b.dept !== 'doctors' ? `, turno ${SHIFT_LABEL[b.shift]}` : ''}${past ? ' (día que ya pasó)' : ''}`)
    res.status(201).json(toRow((await sql.one('SELECT * FROM duty_roster WHERE id = ?', [r!.id]))!))
  })

  /** DP6: «Repetir»: una persona, un turno, los días de la semana elegidos, de una fecha a otra (una operación). */
  app.post('/api/roster/bulk', auth, async (req, res) => {
    const b = parse(z.object({ staffId: z.string().min(1), dept: deptQ, shift: z.string().optional(), from: day, to: day, weekdays: z.array(z.number().int().min(0).max(6)).min(1, 'Elige al menos un día de la semana.') }), req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    await clinicOnly(cid)
    if (b.to < b.from) fail(400, 'La fecha final es antes de la inicial.')
    const days: string[] = []
    for (const d = new Date(`${b.from}T12:00:00`); localISODate(d) <= b.to && days.length < 93; d.setDate(d.getDate() + 1)) if (b.weekdays.includes(d.getDay())) days.push(localISODate(d))
    let added = 0
    let name = ''
    for (const d of days) {
      if (!canEdit(user, b.dept, d)) continue
      const r = await assign(cid, user, { day: d, staffId: b.staffId, dept: b.dept, shift: b.shift })
      if (r) { added++; name = r.name }
    }
    if (added) await audit(user, `${tag(b.dept)}: asignó a ${name} ${added} día(s) del ${dayText(b.from)} al ${dayText(b.to)}${b.shift && b.dept !== 'doctors' ? `, turno ${SHIFT_LABEL[b.shift]}` : ''}`)
    res.json({ added })
  })

  app.delete('/api/roster/:id', auth, async (req, res) => {
    const user = userOf(req)
    const cid = clinicOf(req)
    const r = (await sql.one('SELECT r.*, s.name FROM duty_roster r JOIN staff s ON s.id = r.staff_id WHERE r.id = ? AND r.clinic_id = ? AND r.removed_at IS NULL', [String(req.params.id), cid])) ?? fail(404, 'Esa asignación no existe.')
    const dept = String(r!.dept ?? 'doctors') as Dept
    if (!canEdit(user, dept, String(r!.day))) fail(403, 'No puedes editar este rol de turnos.')
    await sql.run('UPDATE duty_roster SET removed_at = ?, removed_by = ? WHERE id = ?', [new Date().toISOString(), user.id, String(r!.id)])
    const past = String(r!.day) < localISODate(new Date())
    await audit(user, `${tag(dept)}: quitó a ${r!.name} del ${dayText(String(r!.day))}${r!.shift ? `, turno ${SHIFT_LABEL[String(r!.shift)]}` : ''}${past ? ' (día que ya pasó)' : ''}`)
    res.json({ ok: true })
  })
}
