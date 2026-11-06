import type { Express } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { type Ctx, fail, parse, type Row } from '../http.js'
import { normalize } from '../../src/lib/patients.js'
import { can } from '../../src/lib/permissions.js'
import { supplyLabel, unitText, type SupplyScope, type SupplySetView, type SupplyUnit } from '../../src/lib/supplies.js'
import { toSupplySet } from '../supplies.js'

const TAG = 'Configuración › Material médico quirúrgico › Sets'
const setBody = z.object({
  name: z.string().trim().min(2, 'Escribe el nombre del set.').max(60, 'El nombre del set es muy largo.'),
  description: z.string().trim().max(200).default(''),
  items: z.array(z.object({
    itemId: z.string().min(1).max(80),
    quantity: z.number().int('La cantidad es un número entero.').min(1, 'La cantidad mínima es 1.').max(999, 'Revisa la cantidad: es demasiado alta.'),
  })).min(1, 'Agrega al menos un material al set.').max(120),
})

/**
 * RU8 (ronda 15): sets de material. Un nombre único en la clínica, una descripción opcional y una lista de líneas del catálogo
 * con su cantidad (entero, mínimo 1). Se archivan y se restauran; nada se borra. Crear, editar, duplicar y archivar:
 * Enfermería y Administración (A13; en el consultorio, la titular), con el permiso sets.manage. Ver la lista para «Usar set»:
 * también quien registra material. Cada cambio queda en la bitácora. Lo que la clínica cambia no lo vuelve a tocar ninguna
 * carga (edited_at). Cambiar o archivar un set no cambia los registros hechos (guardan el nombre del set en ese momento).
 */
export function registerSupplySets(app: Express, { sql, auth, need, userOf, clinicOf, audit }: Ctx) {
  const view = (r: Row, items: Map<string, Row>): SupplySetView => {
    const s = toSupplySet(r)
    return {
      ...s, lines: s.items.map((l) => {
        const it = items.get(l.itemId)
        return { itemId: l.itemId, quantity: l.quantity, material: String(it?.material ?? 'Material que ya no existe'), variant: String(it?.variant ?? ''), unit: String(it?.unit ?? 'unidad') as SupplyUnit,
          scope: String(it?.scope ?? 'both') as SupplyScope, category: String(it?.category ?? ''), archived: !it || !!it.archived_at }
      }),
    }
  }
  const catalog = async (cid: string) => new Map((await sql.query('SELECT * FROM supply_items WHERE clinic_id = ?', [cid])).map((r) => [String(r.id), r]))
  const setRow = async (cid: string, id: string) => (await sql.one('SELECT * FROM supply_sets WHERE id = ? AND clinic_id = ?', [id, cid])) ?? fail(404, 'Ese set no existe.')
  /** El nombre es único en la clínica (activos y archivados, sin importar tildes ni mayúsculas). */
  const assertName = async (cid: string, name: string, except?: string) => {
    const rows = await sql.query('SELECT id, name, archived_at FROM supply_sets WHERE clinic_id = ?', [cid])
    const twin = rows.find((r) => String(r.id) !== except && normalize(String(r.name)) === normalize(name))
    if (twin) fail(409, `Ya hay un set llamado «${twin.name}»${twin.archived_at ? ' (archivado: restáuralo desde «Ver archivados»)' : ''}.`)
  }
  /** Las líneas: del catálogo de la clínica, activas y sin repetir. */
  const checkLines = (items: Map<string, Row>, lines: z.infer<typeof setBody>['items'], keep = new Set<string>()) => {
    if (new Set(lines.map((l) => l.itemId)).size !== lines.length) fail(400, 'Un material está repetido en el set.')
    for (const l of lines) {
      const it = items.get(l.itemId) ?? fail(404, 'Un material del set no existe en el catálogo.')
      if (it!.archived_at && !keep.has(l.itemId)) fail(409, `«${supplyLabel({ material: String(it!.material), variant: String(it!.variant) })}» está archivado: no entra al set.`)
    }
    return lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity }))
  }
  const linesText = (items: Map<string, Row>, lines: { itemId: string; quantity: number }[]) => lines.map((l) => {
    const it = items.get(l.itemId)
    return it ? `${supplyLabel({ material: String(it.material), variant: String(it.variant) })} × ${unitText(l.quantity, String(it.unit))}` : `(${l.quantity})`
  }).join(', ')
  const fetchOne = async (cid: string, id: string) => view((await setRow(cid, id))!, await catalog(cid))

  // La lista (con los archivados si se piden: solo quien administra)
  app.get('/api/supply-sets', auth, need('sets.manage', 'usage.record', 'supplies.view'), async (req, res) => {
    const cid = clinicOf(req)
    const user = userOf(req)
    const archived = req.query.archived === '1' && can(user, 'sets.manage')
    const rows = await sql.query(`SELECT * FROM supply_sets WHERE clinic_id = ? AND ${archived ? 'archived_at IS NOT NULL' : 'archived_at IS NULL'} ORDER BY name`, [cid])
    const items = await catalog(cid)
    res.json({ sets: rows.map((r) => view(r, items)).sort((a, b) => a.name.localeCompare(b.name, 'es')) })
  })

  app.post('/api/supply-sets', auth, need('sets.manage'), async (req, res) => {
    const b = parse(setBody, req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    await assertName(cid, b.name)
    const items = await catalog(cid)
    const lines = checkLines(items, b.items)
    const id = randomUUID()
    const now = new Date().toISOString()
    await sql.run(`INSERT INTO supply_sets (id, clinic_id, name, description, items, origin, created_by, created_at, updated_by, updated_at, edited_at) VALUES (?,?,?,?,?,'clinic',?,?,?,?,?)`,
      [id, cid, b.name, b.description, JSON.stringify(lines), user.id, now, user.id, now, now])
    await audit(user, `${TAG}: creó el set «${b.name}» (${lines.length} materiales: ${linesText(items, lines)})`)
    res.status(201).json(await fetchOne(cid, id))
  })

  app.patch('/api/supply-sets/:id', auth, need('sets.manage'), async (req, res) => {
    const b = parse(setBody, req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    const r = (await setRow(cid, String(req.params.id)))!
    if (r.archived_at) fail(409, 'Ese set está archivado. Restáuralo para editarlo.')
    await assertName(cid, b.name, String(r.id))
    const items = await catalog(cid)
    const before = JSON.parse(String(r.items)) as { itemId: string; quantity: number }[]
    // Lo que ya estaba en el set y luego se archivó en el catálogo puede quedarse
    const lines = checkLines(items, b.items, new Set(before.map((l) => l.itemId)))
    if (String(r.name) === b.name && String(r.description ?? '') === b.description && JSON.stringify(before) === JSON.stringify(lines)) return res.json(await fetchOne(cid, String(r.id)))
    const now = new Date().toISOString()
    await sql.run('UPDATE supply_sets SET name = ?, description = ?, items = ?, updated_by = ?, updated_at = ?, edited_at = ? WHERE id = ?', [b.name, b.description, JSON.stringify(lines), user.id, now, now, String(r.id)])
    await audit(user, `${TAG}: editó el set «${r.name}»${String(r.name) !== b.name ? ` (ahora «${b.name}»)` : ''} (antes: ${linesText(items, before)}; ahora: ${linesText(items, lines)})`)
    res.json(await fetchOne(cid, String(r.id)))
  })

  app.post('/api/supply-sets/:id/archive', auth, need('sets.manage'), async (req, res) => {
    const user = userOf(req)
    const cid = clinicOf(req)
    const r = (await setRow(cid, String(req.params.id)))!
    if (r.archived_at) fail(409, 'Ese set ya estaba archivado.')
    const now = new Date().toISOString()
    await sql.run('UPDATE supply_sets SET archived_at = ?, archived_by = ?, edited_at = COALESCE(edited_at, ?) WHERE id = ?', [now, user.id, now, String(r.id)])
    await audit(user, `${TAG}: archivó el set «${r.name}» (deja de ofrecerse en «Usar set»; los registros hechos no cambian)`)
    res.json(await fetchOne(cid, String(r.id)))
  })

  app.post('/api/supply-sets/:id/restore', auth, need('sets.manage'), async (req, res) => {
    const user = userOf(req)
    const cid = clinicOf(req)
    const r = (await setRow(cid, String(req.params.id)))!
    if (!r.archived_at) fail(409, 'Ese set no está archivado.')
    await sql.run('UPDATE supply_sets SET archived_at = NULL, archived_by = NULL, updated_by = ?, updated_at = ? WHERE id = ?', [user.id, new Date().toISOString(), String(r.id)])
    await audit(user, `${TAG}: restauró el set «${r.name}»`)
    res.json(await fetchOne(cid, String(r.id)))
  })
}
