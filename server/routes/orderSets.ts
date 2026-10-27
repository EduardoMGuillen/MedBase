import type { Express } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { type Ctx, fail, parse, type Row } from '../http.js'
import type { OrderSet, OrderSetItem } from '../../src/lib/types.js'

const med = z.object({
  drug: z.string().trim().min(1, 'Escribe el medicamento.').max(120),
  presentation: z.string().trim().max(120).optional(),
  dose: z.string().trim().min(1, 'Escribe la dosis del medicamento.').max(60),
  route: z.string().trim().min(1).max(40),
  everyHours: z.number().int().min(1).max(72).optional(),
  prn: z.boolean().default(false),
  days: z.number().int().min(1).max(365).optional(),
  instructions: z.string().trim().max(300).optional(),
})
const item = z.union([z.object({ text: z.string().trim().min(1).max(500) }), z.object({ med })])
const body = z.object({
  name: z.string().trim().min(3, 'Ponle un nombre al set (al menos 3 letras).').max(100),
  items: z.array(item).min(1, 'El set necesita al menos una orden.').max(40, 'Un set tiene como máximo 40 órdenes.'),
  shared: z.boolean().default(false),
})

const toOrderSet = (r: Row): OrderSet => ({
  id: String(r.id), ownerId: String(r.owner_id), name: String(r.name), items: JSON.parse(String(r.items)) as OrderSetItem[], shared: Boolean(r.shared),
  createdAt: String(r.created_at), updatedAt: r.updated_at ? String(r.updated_at) : undefined, uses: Number(r.uses ?? 0), lastUsedAt: r.last_used ? String(r.last_used) : undefined,
})

/**
 * Sets de órdenes (O1). Cada médico tiene los suyos; en una clínica puede compartir uno y los demás lo aplican o lo
 * duplican como suyo, pero sólo el autor lo edita. Eliminar archiva (no se borra). Aplicar un set queda en la
 * bitácora y suma a "los más usados" de quien lo aplica.
 */
export function registerOrderSets(app: Express, { sql, auth, need, userOf, clinicOf, audit }: Ctx) {
  const office = async (cid: string) => (await sql.one('SELECT kind FROM clinics WHERE id = ?', [cid]))?.kind === 'office'
  const select = `SELECT s.*, (SELECT COUNT(*)::int FROM order_set_uses u WHERE u.set_id = s.id AND u.user_id = ?) AS uses,
    (SELECT MAX(u.at) FROM order_set_uses u WHERE u.set_id = s.id AND u.user_id = ?) AS last_used FROM order_sets s`
  const one = async (cid: string, userId: string, id: string) =>
    (await sql.one(`${select} WHERE s.id = ? AND s.clinic_id = ? AND s.archived_at IS NULL`, [userId, userId, id, cid])) ?? fail(404, 'El set no existe.')
  /** Lo que puede ver: los suyos y los compartidos de la clínica. */
  const visible = (r: Row, userId: string) => String(r.owner_id) === userId || Boolean(r.shared)

  app.get('/api/order-sets', auth, need('consult.write'), async (req, res) => {
    const user = userOf(req)
    const rows = await sql.query(`${select} WHERE s.clinic_id = ? AND s.archived_at IS NULL AND (s.owner_id = ? OR s.shared) ORDER BY s.name`, [user.id, user.id, clinicOf(req), user.id])
    // Primero los más usados por este médico, luego los usados hace menos tiempo, luego por nombre
    res.json(rows.map(toOrderSet).sort((a, b) => b.uses - a.uses || (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? '') || a.name.localeCompare(b.name, 'es')))
  })

  app.post('/api/order-sets', auth, need('consult.write'), async (req, res) => {
    const b = parse(body, req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    if (b.shared && await office(cid)) fail(400, 'En un consultorio los sets son sólo tuyos.')
    if (await sql.one('SELECT 1 FROM order_sets WHERE clinic_id = ? AND owner_id = ? AND lower(name) = lower(?) AND archived_at IS NULL', [cid, user.id, b.name])) {
      fail(409, `Ya tienes un set que se llama "${b.name}". Usa otro nombre.`)
    }
    const id = randomUUID()
    await sql.run('INSERT INTO order_sets (id, clinic_id, owner_id, name, items, shared, created_at) VALUES (?,?,?,?,?,?,?)',
      [id, cid, user.id, b.name, JSON.stringify(b.items), b.shared, new Date().toISOString()])
    await audit(user, `Creó el set de órdenes "${b.name}" (${b.items.length} órdenes${b.shared ? ', compartido con la clínica' : ''})`)
    res.status(201).json(toOrderSet(await one(cid, user.id, id)))
  })

  app.patch('/api/order-sets/:id', auth, need('consult.write'), async (req, res) => {
    const b = parse(body.partial(), req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    const row = await one(cid, user.id, String(req.params.id))
    if (String(row.owner_id) !== user.id) fail(403, 'Sólo quien creó el set lo edita. Puedes duplicarlo como tuyo.')
    if (b.shared && await office(cid)) fail(400, 'En un consultorio los sets son sólo tuyos.')
    if (b.name && b.name.toLowerCase() !== String(row.name).toLowerCase()
      && await sql.one('SELECT 1 FROM order_sets WHERE clinic_id = ? AND owner_id = ? AND lower(name) = lower(?) AND archived_at IS NULL AND id <> ?', [cid, user.id, b.name, String(row.id)])) {
      fail(409, `Ya tienes un set que se llama "${b.name}". Usa otro nombre.`)
    }
    await sql.run('UPDATE order_sets SET name = ?, items = ?, shared = ?, updated_at = ? WHERE id = ?',
      [b.name ?? row.name, b.items ? JSON.stringify(b.items) : row.items, b.shared ?? row.shared, new Date().toISOString(), String(row.id)])
    const what = [b.name && b.name !== row.name && `renombró "${row.name}" a "${b.name}"`, b.items && `${b.items.length} órdenes`,
      b.shared !== undefined && b.shared !== Boolean(row.shared) && (b.shared ? 'lo compartió con la clínica' : 'dejó de compartirlo')].filter(Boolean).join(', ')
    await audit(user, `Editó el set de órdenes "${b.name ?? row.name}"${what ? `: ${what}` : ''}`)
    res.json(toOrderSet(await one(cid, user.id, String(row.id))))
  })

  /** Duplicar: el propio o uno compartido, como un set nuevo del médico. */
  app.post('/api/order-sets/:id/duplicate', auth, need('consult.write'), async (req, res) => {
    const user = userOf(req)
    const cid = clinicOf(req)
    const row = await one(cid, user.id, String(req.params.id))
    if (!visible(row, user.id)) fail(404, 'El set no existe.')
    const mine = new Set((await sql.query('SELECT lower(name) AS n FROM order_sets WHERE clinic_id = ? AND owner_id = ? AND archived_at IS NULL', [cid, user.id])).map((r) => String(r.n)))
    let name = `${row.name} (copia)`
    for (let i = 2; mine.has(name.toLowerCase()); i++) name = `${row.name} (copia ${i})`
    const id = randomUUID()
    await sql.run('INSERT INTO order_sets (id, clinic_id, owner_id, name, items, shared, created_at) VALUES (?,?,?,?,?,FALSE,?)',
      [id, cid, user.id, name.slice(0, 100), String(row.items), new Date().toISOString()])
    await audit(user, `Duplicó el set de órdenes "${row.name}" como "${name}"`)
    res.status(201).json(toOrderSet(await one(cid, user.id, id)))
  })

  app.delete('/api/order-sets/:id', auth, need('consult.write'), async (req, res) => {
    const user = userOf(req)
    const cid = clinicOf(req)
    const row = await one(cid, user.id, String(req.params.id))
    if (String(row.owner_id) !== user.id) fail(403, 'Sólo quien creó el set lo elimina.')
    await sql.run('UPDATE order_sets SET archived_at = ? WHERE id = ?', [new Date().toISOString(), String(row.id)])
    await audit(user, `Eliminó (archivó) el set de órdenes "${row.name}"`)
    res.json({ ok: true })
  })

  /** Se aplicó el set en una nota: suma a los más usados y queda en la bitácora. Aplicar nunca firma. */
  app.post('/api/order-sets/:id/use', auth, need('consult.write'), async (req, res) => {
    const b = parse(z.object({ where: z.enum(['consultation', 'hospital', 'observation']), patientId: z.string().optional() }), req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    const row = await one(cid, user.id, String(req.params.id))
    if (!visible(row, user.id)) fail(404, 'El set no existe.')
    await sql.run('INSERT INTO order_set_uses (id, set_id, user_id, clinic_id, at, place, patient_id) VALUES (?,?,?,?,?,?,?)',
      [randomUUID(), String(row.id), user.id, cid, new Date().toISOString(), b.where, b.patientId ?? null])
    const place = { consultation: 'consulta externa', hospital: 'hospitalización', observation: 'observación' }[b.where]
    const patient = b.patientId ? await sql.one('SELECT first_name, last_name FROM patients WHERE id = ? AND clinic_id = ?', [b.patientId, cid]) : undefined
    await audit(user, `Aplicó el set de órdenes "${row.name}" en ${place}${patient ? ` de ${patient.first_name} ${patient.last_name}` : ''} (sin firmar)`)
    res.status(201).json({ ok: true })
  })
}
