import type { Express } from 'express'
import express from 'express'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { type Ctx, fail, parse } from '../http.js'
import type { Sql } from '../sql.js'

const image = (max: number, what: string) => z.string().max(max, `La imagen ${what} es demasiado grande.`).regex(/^data:image\/(png|jpeg|webp);base64,/, `La imagen ${what} debe ser PNG, JPG o WEBP.`)

/**
 * Guarda una firma o un sello nuevo del médico. Cada versión queda en `staff_marks` y los documentos emitidos apuntan a
 * la versión con la que se firmaron: cambiar la firma no altera lo que ya se emitió.
 */
export async function saveMark(q: Sql, clinicId: string | null, staffId: string, kind: 'signature' | 'stamp', img: string | null) {
  if (!img) {
    await q.run(`UPDATE staff SET ${kind === 'signature' ? 'signature = NULL, signature_id = NULL' : 'stamp = NULL, stamp_id = NULL'} WHERE id = ?`, [staffId])
    return null
  }
  const id = randomUUID()
  await q.run('INSERT INTO staff_marks (id, clinic_id, staff_id, kind, image, created_at) VALUES (?,?,?,?,?,?)', [id, clinicId, staffId, kind, img, new Date().toISOString()])
  await q.run(`UPDATE staff SET ${kind === 'signature' ? 'signature = ?, signature_id = ?' : 'stamp = ?, stamp_id = ?'} WHERE id = ?`, [img, id, staffId])
  return id
}

/** Firma y sello vigentes del médico, para guardarlos en un documento que se emite. */
export async function currentMarks(q: Sql, staffId: string) {
  const r = await q.one('SELECT signature_id, stamp_id FROM staff WHERE id = ?', [staffId])
  return { signatureId: r?.signature_id ? String(r.signature_id) : null, stampId: r?.stamp_id ? String(r.stamp_id) : null }
}

/** Nombre del médico como aparece en sus documentos (MC6); si no lo eligió, su nombre. */
export const docName = (r: { name?: unknown; doc_name?: unknown }) => String(r.doc_name || r.name)

/** MC6: "Mi configuración". Cada apartado guarda por separado y deja su registro en la bitácora. */
export function registerMe(app: Express, { sql, auth, userOf, audit }: Ctx) {
  const bigJson = express.json({ limit: '1mb' })
  const doctorOnly = (role: string) => { if (role !== 'doctor') fail(403, 'Este apartado es de la vista de médico.') }
  const setPref = (key: string, value: unknown, id: string) =>
    sql.run(`UPDATE staff SET prefs = jsonb_set(COALESCE(NULLIF(prefs, ''), '{}')::jsonb, ?::text[], ?::jsonb)::text WHERE id = ?`, [`{${key}}`, JSON.stringify(value), id])

  // Datos profesionales y preferencias (la vigencia de las recetas, AD2, y el formato de nota)
  app.patch('/api/me', bigJson, auth, async (req, res) => {
    const user = userOf(req)
    const b = parse(z.object({
      license: z.string().trim().min(3, 'Escribe tu número de colegiación.').max(30).optional(),
      docName: z.string().trim().max(120).optional(),
      specialty: z.string().trim().max(80).optional(),
      stamp: image(300_000, 'del sello').or(z.literal('')).optional(),
      rxValidityDays: z.number().int().min(1, 'La vigencia debe ser de al menos 1 día.').max(365, 'La vigencia no puede pasar de 365 días.').optional(),
      noteFormat: z.enum(['dx', 'soap']).optional(),
      favDrugs: z.array(z.string().trim().min(1).max(160)).max(200).optional(),
      favExams: z.array(z.string().trim().min(1).max(160)).max(200).optional(),
      // RE1 (ronda 5): preferencia de cualquier rol
      agendaView: z.enum(['day', 'week', 'month']).optional(),
    }), req.body)
    // RE1: el nombre en documentos y las preferencias son del médico y de recepción (sus apartados de Mi configuración); lo
    // profesional (colegiación, sello, recetas, notas) sólo del médico
    const clinical = [b.license, b.specialty, b.stamp, b.rxValidityDays, b.noteFormat, b.favDrugs, b.favExams].some((x) => x !== undefined)
    if (clinical && user.role !== 'doctor') fail(403, 'Sólo los médicos registran número de colegiación, sello y vigencia de recetas.')
    if (user.role !== 'doctor' && user.role !== 'reception') fail(403, 'Tu vista no tiene datos personales ni preferencias que guardar.')
    const done: string[] = []
    if (b.license) { await sql.run('UPDATE staff SET license = ? WHERE id = ?', [b.license, user.id]); done.push('su número de colegiación') }
    if (b.docName !== undefined) { await sql.run('UPDATE staff SET doc_name = ? WHERE id = ?', [b.docName || null, user.id]); done.push('su nombre en documentos') }
    if (b.specialty !== undefined) { await sql.run('UPDATE staff SET specialty = ? WHERE id = ?', [b.specialty || null, user.id]); done.push('su especialidad') }
    if (b.stamp !== undefined) { await saveMark(sql, user.clinicId ?? null, user.id, 'stamp', b.stamp || null); done.push(b.stamp ? 'su sello' : 'quitó su sello') }
    if (b.rxValidityDays) { await setPref('rxValidityDays', b.rxValidityDays, user.id); done.push(`la vigencia de sus recetas a ${b.rxValidityDays} días`) }
    if (b.noteFormat) { await setPref('noteFormat', b.noteFormat, user.id); done.push(`su formato de nota por defecto (${b.noteFormat === 'soap' ? 'SOAP' : 'Estándar'})`) }
    if (b.favDrugs) { await setPref('favDrugs', b.favDrugs, user.id); done.push('sus medicamentos favoritos') }
    if (b.favExams) { await setPref('favExams', b.favExams, user.id); done.push('sus exámenes frecuentes') }
    if (b.agendaView) { await setPref('agendaView', b.agendaView, user.id); done.push(`la vista de la agenda al abrirla (${{ day: 'Día', week: 'Semana', month: 'Mes' }[b.agendaView]})`) }
    if (done.length) await audit(user, b.license && done.length === 1 ? 'Registró su número de colegiación' : `Mi configuración: actualizó ${done.join(', ')}`)
    res.json({ ok: true })
  })

  // Firma del médico: dibujada o subida. Pide la contraseña, como al firmar.
  app.put('/api/me/signature', bigJson, auth, async (req, res) => {
    const user = userOf(req)
    doctorOnly(user.role)
    const b = parse(z.object({ signature: z.string().max(400_000, 'La imagen de la firma es demasiado grande.').regex(/^data:image\/(png|jpeg|webp);base64,/, 'La firma debe ser una imagen.'), password: z.string().min(1, 'Escribe tu contraseña.') }), req.body)
    const row = (await sql.one('SELECT password_hash FROM staff WHERE id = ?', [user.id]))!
    if (!bcrypt.compareSync(b.password, String(row.password_hash))) fail(400, 'La contraseña no es correcta.')
    await saveMark(sql, user.clinicId ?? null, user.id, 'signature', b.signature)
    await audit(user, 'Guardó su firma electrónica')
    res.json({ ok: true })
  })

  app.get('/api/me/marks', auth, async (req, res) => {
    const r = (await sql.one('SELECT signature, stamp FROM staff WHERE id = ?', [userOf(req).id]))!
    res.json({ signature: r.signature ? String(r.signature) : null, stamp: r.stamp ? String(r.stamp) : null })
  })

  // Firma o sello con que se emitió un documento (lo ve quien puede ver el documento de esa clínica)
  app.get('/api/marks/:id', auth, async (req, res) => {
    const user = userOf(req)
    const r = await sql.one('SELECT image FROM staff_marks WHERE id = ? AND clinic_id = ?', [String(req.params.id), user.clinicId ?? ''])
    if (!r) fail(404, 'La firma no existe.')
    res.setHeader('Cache-Control', 'private, max-age=86400')
    res.json({ image: String(r!.image) })
  })

  // PIN para confirmar firmas (en lugar de la contraseña). Para ponerlo o quitarlo se pide la contraseña.
  app.put('/api/me/pin', auth, async (req, res) => {
    const user = userOf(req)
    doctorOnly(user.role)
    const b = parse(z.object({ password: z.string().min(1, 'Escribe tu contraseña.'), pin: z.string().regex(/^\d{4,6}$/, 'El PIN es de 4 a 6 números.').or(z.literal('')) }), req.body)
    const row = (await sql.one('SELECT password_hash FROM staff WHERE id = ?', [user.id]))!
    if (!bcrypt.compareSync(b.password, String(row.password_hash))) fail(400, 'La contraseña no es correcta.')
    await sql.run('UPDATE staff SET pin_hash = ? WHERE id = ?', [b.pin ? bcrypt.hashSync(b.pin, 10) : null, user.id])
    await audit(user, b.pin ? 'Configuró su PIN para confirmar firmas' : 'Quitó su PIN para confirmar firmas')
    res.json({ ok: true })
  })
}

/** ¿La contraseña o el PIN del médico son correctos? (para confirmar una firma). */
export async function checkSecret(q: Sql, staffId: string, secret: { password?: string; pin?: string }) {
  const r = (await q.one('SELECT password_hash, pin_hash FROM staff WHERE id = ?', [staffId]))!
  if (secret.pin) return !!r.pin_hash && bcrypt.compareSync(secret.pin, String(r.pin_hash))
  return !!secret.password && bcrypt.compareSync(secret.password, String(r.password_hash))
}
