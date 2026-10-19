import express, { type Express } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { type Ctx, fail, parse, type Row } from '../http'
import { toAttachment } from '../mappers'

const MAX_BYTES = 8 * 1024 * 1024
const ALLOWED = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']

/** Archivos del expediente (laboratorios, imágenes, documentos). Se guardan dentro de la base de datos. */
export function registerFiles(app: Express, { db, auth, need, userOf, audit, patientRow, patientName }: Ctx) {
  app.get('/api/patients/:id/attachments', auth, need('chart.view'), (req, res) => {
    const rows = db.prepare('SELECT id, patient_id, name, mime, size, category, uploaded_by, uploaded_at FROM attachments WHERE patient_id = ? ORDER BY uploaded_at DESC')
      .all(String(req.params.id)) as Row[]
    res.json(rows.map(toAttachment))
  })

  app.post('/api/patients/:id/attachments', express.json({ limit: '12mb' }), auth, need('chart.view'), (req, res) => {
    const patientId = String(req.params.id)
    patientRow(patientId) ?? fail(404, 'El paciente no existe.')
    const b = parse(z.object({
      name: z.string().trim().min(1).max(160),
      mime: z.string(),
      category: z.enum(['lab', 'imaging', 'document', 'other']),
      data: z.string().min(1, 'El archivo está vacío.'),
    }), req.body)
    if (!ALLOWED.includes(b.mime)) fail(400, 'Sólo se aceptan PDF e imágenes (PNG, JPG o WEBP).')
    const buf = Buffer.from(b.data, 'base64')
    if (buf.length > MAX_BYTES) fail(413, 'El archivo es demasiado grande. El máximo es 8 MB.')
    const id = randomUUID()
    const user = userOf(req)
    db.prepare('INSERT INTO attachments (id, patient_id, name, mime, size, category, data, uploaded_by, uploaded_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(id, patientId, b.name, b.mime, buf.length, b.category, buf, user.id, new Date().toISOString())
    audit(user.id, `Adjuntó "${b.name}" al expediente de ${patientName(patientId)}`)
    res.status(201).json(toAttachment(db.prepare('SELECT id, patient_id, name, mime, size, category, uploaded_by, uploaded_at FROM attachments WHERE id = ?').get(id) as Row))
  })

  app.get('/api/attachments/:id', auth, need('chart.view'), (req, res) => {
    const row = db.prepare('SELECT * FROM attachments WHERE id = ?').get(String(req.params.id)) as Row | undefined ?? fail(404, 'El archivo no existe.')
    audit(userOf(req).id, `Abrió el archivo "${row!.name}" de ${patientName(String(row!.patient_id))}`)
    res.setHeader('Content-Type', String(row!.mime))
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(String(row!.name))}`)
    res.setHeader('Cache-Control', 'private, no-store')
    res.send(Buffer.from(row!.data as Uint8Array))
  })

  app.delete('/api/attachments/:id', auth, need('chart.view'), (req, res) => {
    const user = userOf(req)
    const row = db.prepare('SELECT id, name, patient_id, uploaded_by FROM attachments WHERE id = ?').get(String(req.params.id)) as Row | undefined ?? fail(404, 'El archivo no existe.')
    if (row!.uploaded_by !== user.id && user.role !== 'doctor') fail(403, 'Sólo quien subió el archivo o un médico puede eliminarlo.')
    db.prepare('DELETE FROM attachments WHERE id = ?').run(String(row!.id))
    audit(user.id, `Eliminó el archivo "${row!.name}" de ${patientName(String(row!.patient_id))}`)
    res.json({ ok: true })
  })
}
