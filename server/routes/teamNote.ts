import type { Express } from 'express'
import { z } from 'zod'
import { type Ctx, fail, parse, type Row } from '../http.js'
import type { Sql } from '../sql.js'
import { TEAM_NOTE_MAX } from '../../src/lib/clinicalConfig.js'
import type { TeamNote, TeamNoteVersion } from '../../src/lib/types.js'

const toVersion = (r: Row): TeamNoteVersion => ({ id: String(r.id), text: String(r.text), authorId: String(r.author_id), authorName: String(r.author_name ?? ''), at: String(r.created_at) })

/**
 * NP1 (ronda 18): la nota para el equipo vigente de cada paciente de la clínica (o de uno solo), con cuántas versiones
 * tiene. Una nota quitada llega con el texto vacío: el historial sigue a la vista.
 */
export async function teamNotesOf(q: Sql, clinicId: string, patientId?: string): Promise<Map<string, TeamNote>> {
  const one = patientId ? ' AND patient_id = ?' : ''
  const args = patientId ? [clinicId, patientId] : [clinicId]
  const rows = await q.query(`SELECT n.patient_id, n.text, n.author_id, n.created_at, s.name AS author_name, c.versions
    FROM (SELECT DISTINCT ON (patient_id) * FROM patient_team_notes WHERE clinic_id = ?${one} ORDER BY patient_id, id DESC) n
    JOIN (SELECT patient_id, COUNT(*)::int AS versions FROM patient_team_notes WHERE clinic_id = ?${one} GROUP BY patient_id) c ON c.patient_id = n.patient_id
    LEFT JOIN staff s ON s.id = n.author_id`, [...args, ...args])
  return new Map(rows.map((r) => [String(r.patient_id), { text: String(r.text), authorId: String(r.author_id), authorName: String(r.author_name ?? ''), at: String(r.created_at), versions: Number(r.versions) }]))
}

/**
 * NP1 (ronda 18): nota para el equipo del paciente. Es interna: la ve todo el personal que puede abrir al paciente y la
 * cambian médicos, enfermería y administración. Cada cambio es una versión nueva; nada se edita ni se borra.
 */
export function registerTeamNote(app: Express, ctx: Ctx) {
  const { sql, auth, need, userOf, clinicOf, audit, patientRow } = ctx

  const body = z.object({
    // Una sola línea: los saltos y espacios repetidos se juntan antes de medir
    text: z.string().transform((t) => t.replace(/\s+/g, ' ').trim()).pipe(z.string().max(TEAM_NOTE_MAX, `La nota para el equipo admite hasta ${TEAM_NOTE_MAX} caracteres.`)),
  })

  /** Guarda la nota (texto vacío = «Quitar nota») como versión nueva y devuelve la vigente. */
  app.put('/api/patients/:id/team-note', auth, need('patients.teamnote'), async (req, res) => {
    const user = userOf(req)
    const cid = clinicOf(req)
    const row = (await patientRow(cid, String(req.params.id))) ?? fail(404, 'El paciente no existe.')
    const pid = String(row!.id)
    const { text } = parse(body, req.body)
    const name = `${row!.first_name} ${row!.last_name}`
    const saved = await sql.tx(async (q) => {
      const current = (await teamNotesOf(q, cid, pid)).get(pid)
      if (!text && !current?.text) fail(400, 'Este paciente no tiene nota para el equipo.')
      // Guardar lo mismo que ya está no crea otra versión
      if (current && current.text === text) return current
      await q.run('INSERT INTO patient_team_notes (clinic_id, patient_id, text, author_id, created_at) VALUES (?,?,?,?,?)', [cid, pid, text, user.id, new Date().toISOString()])
      await audit(user, `${!text ? 'Quitó' : current?.text ? 'Cambió' : 'Agregó'} la nota para el equipo de ${name}`, q, pid)
      return (await teamNotesOf(q, cid, pid)).get(pid)!
    })
    res.json(saved)
  })

  /** Todas las versiones, de la más nueva a la más vieja (las quitadas, con el texto vacío). */
  app.get('/api/patients/:id/team-note/history', auth, need('patients.view'), async (req, res) => {
    const cid = clinicOf(req)
    const row = (await patientRow(cid, String(req.params.id))) ?? fail(404, 'El paciente no existe.')
    const rows = await sql.query(`SELECT n.id, n.text, n.author_id, n.created_at, s.name AS author_name FROM patient_team_notes n LEFT JOIN staff s ON s.id = n.author_id
      WHERE n.clinic_id = ? AND n.patient_id = ? ORDER BY n.id DESC`, [cid, String(row!.id)])
    res.json(rows.map(toVersion))
  })
}
