import express, { type Express } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { type Ctx, fail, parse } from '../http.js'
import { toAttachment } from '../mappers.js'

/** Vercel acepta peticiones de hasta 4,5 MB; en base64 un archivo de 3 MB ocupa unos 4 MB. */
export const MAX_FILE_BYTES = 3 * 1024 * 1024
const ALLOWED = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
const META = 'id, patient_id, name, mime, size, category, uploaded_by, uploaded_at'

/** Archivos del expediente (laboratorios, imágenes, documentos). Se guardan dentro de la base de datos. */
export function registerFiles(app: Express, { sql, auth, need, userOf, audit, patientRow, patientName }: Ctx) {
  app.get('/api/patients/:id/attachments', auth, need('chart.view'), async (req, res) => {
    const rows = await sql.query(`SELECT ${META} FROM attachments WHERE patient_id = ? ORDER BY uploaded_at DESC`, [String(req.params.id)])
    res.json(rows.map(toAttachment))
  })

  app.post('/api/patients/:id/attachments', express.json({ limit: '4.4mb' }), auth, need('chart.view'), async (req, res) => {
    const patientId = String(req.params.id)
    ;(await patientRow(patientId)) ?? fail(404, 'El paciente no existe.')
    const b = parse(z.object({
      name: z.string().trim().min(1).max(160),
      mime: z.string(),
      category: z.enum(['lab', 'imaging', 'document', 'other']),
      data: z.string().min(1, 'El archivo está vacío.'),
    }), req.body)
    if (!ALLOWED.includes(b.mime)) fail(400, 'Sólo se aceptan PDF e imágenes (PNG, JPG o WEBP).')
    const buf = Buffer.from(b.data, 'base64')
    if (buf.length > MAX_FILE_BYTES) fail(413, 'El archivo es demasiado grande. El máximo es 3 MB.')
    const id = randomUUID()
    const user = userOf(req)
    await sql.run('INSERT INTO attachments (id, patient_id, name, mime, size, category, data, uploaded_by, uploaded_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [id, patientId, b.name, b.mime, buf.length, b.category, new Uint8Array(buf), user.id, new Date().toISOString()])
    await audit(user.id, `Adjuntó "${b.name}" al expediente de ${await patientName(patientId)}`)
    res.status(201).json(toAttachment((await sql.one(`SELECT ${META} FROM attachments WHERE id = ?`, [id]))!))
  })

  app.get('/api/attachments/:id', auth, need('chart.view'), async (req, res) => {
    const row = (await sql.one('SELECT * FROM attachments WHERE id = ?', [String(req.params.id)])) ?? fail(404, 'El archivo no existe.')
    await audit(userOf(req).id, `Abrió el archivo "${row!.name}" de ${await patientName(String(row!.patient_id))}`)
    res.setHeader('Content-Type', String(row!.mime))
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(String(row!.name))}`)
    res.setHeader('Cache-Control', 'private, no-store')
    res.send(Buffer.from(row!.data as Uint8Array))
  })

  app.delete('/api/attachments/:id', auth, need('chart.view'), async (req, res) => {
    const user = userOf(req)
    const row = (await sql.one('SELECT id, name, patient_id, uploaded_by FROM attachments WHERE id = ?', [String(req.params.id)])) ?? fail(404, 'El archivo no existe.')
    if (row!.uploaded_by !== user.id && user.role !== 'doctor') fail(403, 'Sólo quien subió el archivo o un médico puede eliminarlo.')
    await sql.run('DELETE FROM attachments WHERE id = ?', [String(row!.id)])
    await audit(user.id, `Eliminó el archivo "${row!.name}" de ${await patientName(String(row!.patient_id))}`)
    res.json({ ok: true })
  })
}
