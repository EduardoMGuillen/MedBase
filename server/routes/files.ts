import express, { type Express } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { type Ctx, fail, parse } from '../http.js'
import { toAttachment } from '../mappers.js'

/** Vercel acepta peticiones de hasta 4,5 MB; en base64 un archivo de 3 MB ocupa unos 4 MB. */
export const MAX_FILE_BYTES = 3 * 1024 * 1024
/** Un escaneo (PDF de varias páginas o varias fotos unidas) llega por partes y puede pesar hasta 15 MB. */
export const MAX_SCAN_BYTES = 15 * 1024 * 1024
/** Cada parte, y cada trozo que se devuelve al leer un archivo grande, cabe en una petición de Vercel. */
export const PART_BYTES = 3 * 1024 * 1024
const ALLOWED = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
const META = 'id, patient_id, name, mime, size, category, uploaded_by, uploaded_at, title, taken_at, hospitalization_id'

/** Archivos del expediente (laboratorios, imágenes, documentos). Se guardan dentro de la base de datos. */
export function registerFiles(app: Express, { sql, auth, need, userOf, clinicOf, audit, patientRow, patientName }: Ctx) {
  app.get('/api/patients/:id/attachments', auth, need('chart.view'), async (req, res) => {
    const rows = await sql.query(`SELECT ${META} FROM attachments WHERE patient_id = ? AND clinic_id = ? ORDER BY uploaded_at DESC`, [String(req.params.id), clinicOf(req)])
    res.json(rows.map(toAttachment))
  })

  app.post('/api/patients/:id/attachments', express.json({ limit: '4.4mb' }), auth, need('chart.view'), async (req, res) => {
    const patientId = String(req.params.id)
    const cid = clinicOf(req)
    ;(await patientRow(cid, patientId)) ?? fail(404, 'El paciente no existe.')
    const b = parse(z.object({
      name: z.string().trim().min(1).max(160),
      mime: z.string(),
      category: z.enum(['lab', 'imaging', 'document', 'other']),
      data: z.string().min(1, 'El archivo está vacío.'),
      // Laboratorio subido a mano: qué examen es y cuándo se tomó
      title: z.string().trim().max(120).optional(),
      takenAt: z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'La fecha del examen no es válida.').optional(),
      hospitalizationId: z.string().optional(),
    }), req.body)
    if (!ALLOWED.includes(b.mime)) fail(400, 'Sólo se aceptan PDF e imágenes (PNG, JPG o WEBP).')
    if (b.hospitalizationId) {
      if (!(await sql.one('SELECT 1 FROM hospitalizations WHERE id = ? AND patient_id = ? AND clinic_id = ?', [b.hospitalizationId, patientId, cid]))) {
        fail(400, 'La hospitalización no corresponde a este paciente.')
      }
      if (!b.title || !b.takenAt) fail(400, 'Indica qué examen es y la fecha y hora en que se tomó.')
    }
    const buf = Buffer.from(b.data, 'base64')
    if (buf.length > MAX_FILE_BYTES) fail(413, 'El archivo es demasiado grande. El máximo es 3 MB.')
    const id = randomUUID()
    const user = userOf(req)
    await sql.run('INSERT INTO attachments (id, patient_id, name, mime, size, category, data, uploaded_by, uploaded_at, clinic_id, title, taken_at, hospitalization_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [id, patientId, b.name, b.mime, buf.length, b.category, new Uint8Array(buf), user.id, new Date().toISOString(), cid,
        b.title || null, b.takenAt ? new Date(b.takenAt).toISOString() : null, b.hospitalizationId ?? null])
    await audit(user, `Adjuntó "${b.title || b.name}" al expediente de ${await patientName(patientId)}`)
    res.status(201).json(toAttachment((await sql.one(`SELECT ${META} FROM attachments WHERE id = ?`, [id]))!))
  })

  /**
   * Un archivo grande se lee por partes: el cliente pide rangos (`Range: bytes=a-b`) de hasta 3 MB, porque Vercel no
   * devuelve más de 4,5 MB por respuesta. Sin rango se devuelve completo (archivos chicos, como siempre).
   */
  // Nombre y tipo de un archivo (sin bajarlo), para decidir cómo mostrarlo
  app.get('/api/attachments/:id/meta', auth, need('chart.view'), async (req, res) => {
    const row = (await sql.one('SELECT name, mime, size FROM attachments WHERE id = ? AND clinic_id = ?', [String(req.params.id), clinicOf(req)])) ?? fail(404, 'El archivo no existe.')
    res.json({ name: String(row!.name), mime: String(row!.mime), size: Number(row!.size) })
  })

  app.get('/api/attachments/:id', auth, need('chart.view'), async (req, res) => {
    const row = (await sql.one('SELECT * FROM attachments WHERE id = ? AND clinic_id = ?', [String(req.params.id), clinicOf(req)])) ?? fail(404, 'El archivo no existe.')
    const data = Buffer.from(row!.data as Uint8Array)
    const range = /^bytes=(\d+)-(\d*)$/.exec(String(req.headers.range ?? ''))
    // Se registra una vez por apertura: la primera parte o el archivo completo
    if (!range || range[1] === '0') await audit(userOf(req), `Abrió el archivo "${row!.name}" de ${await patientName(String(row!.patient_id))}`)
    res.setHeader('Content-Type', String(row!.mime))
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(String(row!.name))}`)
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('Accept-Ranges', 'bytes')
    if (!range) return res.send(data)
    const start = Number(range[1])
    const end = Math.min(range[2] ? Number(range[2]) : start + PART_BYTES - 1, start + PART_BYTES - 1, data.length - 1)
    if (start >= data.length || end < start) { res.setHeader('Content-Range', `bytes */${data.length}`); return res.status(416).end() }
    res.status(206).setHeader('Content-Range', `bytes ${start}-${end}/${data.length}`)
    res.send(data.subarray(start, end + 1))
  })

  // ---------- Archivos grandes por partes ----------
  /** Una parte (base64) de un archivo que se sube en varias peticiones. Las partes abandonadas se limpian al día. */
  app.post('/api/uploads/:uploadId/parts', express.json({ limit: '4.4mb' }), auth, need('chart.view'), async (req, res) => {
    // Seis partes de 3 MB alcanzan para 15 MB; lo que pase de 15 MB se rechaza al unirlas
    const b = parse(z.object({ index: z.number().int().min(0).max(5), data: z.string().min(1) }), req.body)
    const user = userOf(req)
    const uploadId = String(req.params.uploadId)
    if (!/^[0-9a-f-]{36}$/.test(uploadId)) fail(400, 'Identificador de subida no válido.')
    const buf = Buffer.from(b.data, 'base64')
    if (buf.length > PART_BYTES) fail(413, 'La parte es demasiado grande.')
    await sql.run('DELETE FROM upload_parts WHERE created_at < ?', [new Date(Date.now() - 24 * 3_600_000).toISOString()])
    await sql.run(`INSERT INTO upload_parts (upload_id, idx, clinic_id, user_id, data, created_at) VALUES (?,?,?,?,?,?)
      ON CONFLICT (upload_id, idx) DO UPDATE SET data = excluded.data`, [uploadId, b.index, clinicOf(req), user.id, new Uint8Array(buf), new Date().toISOString()])
    res.status(201).json({ ok: true })
  })

  /** Une las partes en un archivo del expediente, como un adjunto normal. */
  app.post('/api/patients/:id/attachments/assemble', auth, need('chart.view'), async (req, res) => {
    const patientId = String(req.params.id)
    const cid = clinicOf(req)
    const user = userOf(req)
    if (!(await patientRow(cid, patientId))) fail(404, 'El paciente no existe.')
    const b = parse(z.object({
      uploadId: z.string().regex(/^[0-9a-f-]{36}$/), parts: z.number().int().min(1).max(6),
      name: z.string().trim().min(1).max(160), mime: z.string(), category: z.enum(['lab', 'imaging', 'document', 'other']),
      title: z.string().trim().max(120).optional(), takenAt: z.string().refine((x) => !Number.isNaN(Date.parse(x))).optional(), hospitalizationId: z.string().optional(),
    }), req.body)
    if (!ALLOWED.includes(b.mime)) fail(400, 'Sólo se aceptan PDF e imágenes (PNG, JPG o WEBP).')
    if (b.hospitalizationId && !(await sql.one('SELECT 1 FROM hospitalizations WHERE id = ? AND patient_id = ? AND clinic_id = ?', [b.hospitalizationId, patientId, cid]))) {
      fail(400, 'La hospitalización no corresponde a este paciente.')
    }
    const parts = await sql.query('SELECT idx, data FROM upload_parts WHERE upload_id = ? AND clinic_id = ? AND user_id = ? ORDER BY idx', [b.uploadId, cid, user.id])
    if (parts.length !== b.parts || parts.some((p, i) => Number(p.idx) !== i)) fail(400, 'No llegaron todas las partes del archivo. Vuelve a subirlo.')
    const buf = Buffer.concat(parts.map((p) => Buffer.from(p.data as Uint8Array)))
    if (buf.length > MAX_SCAN_BYTES) fail(413, 'El archivo pesa más de 15 MB. Toma las fotos con menor resolución o escanea en blanco y negro.')
    const id = randomUUID()
    // Fuera de la transacción: con una sola conexión, consultar por fuera de ella la bloquearía
    const who = await patientName(patientId)
    await sql.tx(async (q) => {
      await q.run('INSERT INTO attachments (id, patient_id, name, mime, size, category, data, uploaded_by, uploaded_at, clinic_id, title, taken_at, hospitalization_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [id, patientId, b.name, b.mime, buf.length, b.category, new Uint8Array(buf), user.id, new Date().toISOString(), cid, b.title || null, b.takenAt ? new Date(b.takenAt).toISOString() : null, b.hospitalizationId ?? null])
      await q.run('DELETE FROM upload_parts WHERE upload_id = ?', [b.uploadId])
      await audit(user, `Adjuntó "${b.title || b.name}" al expediente de ${who}`, q)
    })
    res.status(201).json(toAttachment((await sql.one(`SELECT ${META} FROM attachments WHERE id = ?`, [id]))!))
  })

  app.delete('/api/attachments/:id', auth, need('chart.view'), async (req, res) => {
    const user = userOf(req)
    const row = (await sql.one('SELECT id, name, patient_id, uploaded_by FROM attachments WHERE id = ? AND clinic_id = ?', [String(req.params.id), clinicOf(req)])) ?? fail(404, 'El archivo no existe.')
    if (row!.uploaded_by !== user.id && user.role !== 'doctor') fail(403, 'Sólo quien subió el archivo o un médico puede eliminarlo.')
    await sql.run('DELETE FROM attachments WHERE id = ?', [String(row!.id)])
    await audit(user, `Eliminó el archivo "${row!.name}" de ${await patientName(String(row!.patient_id))}`)
    res.json({ ok: true })
  })
}
