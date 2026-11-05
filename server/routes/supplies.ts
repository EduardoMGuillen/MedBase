import type { Express } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { type Ctx, fail, parse } from '../http.js'
import { shiftProblems, stripLength, supplyKey, supplyLabel, SUPPLY_UNIT_LIST, type SupplyUnit } from '../../src/lib/supplies.js'
import { SUPPLY_PERIODS } from '../../src/lib/clinicalConfig.js'
import { normalize } from '../../src/lib/patients.js'
import { SUPPLY_MD } from '../../src/lib/supplyMd/generated.js'
import { supplySettings, toSupplyItem } from '../supplies.js'

const TAG = 'Configuración › Material médico quirúrgico'
const itemBody = z.object({
  category: z.string().trim().min(2, 'Escribe la categoría.').max(60),
  material: z.string().trim().min(2, 'Escribe el material.').max(80),
  variant: z.string().trim().max(80).default(''),
  unit: z.enum(SUPPLY_UNIT_LIST as [SupplyUnit, ...SupplyUnit[]], { message: 'Elige la unidad en que se cuenta.' }),
  onShiftList: z.boolean().optional(),
})
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Escribe las horas de los turnos en HH:mm.')

/**
 * RU1 (ronda 14): Configuración › «Material médico quirúrgico». Administración (en el consultorio, la titular) agrega, edita y
 * archiva materiales y elige el periodo de registro; Administración y Enfermería marcan y desmarcan la lista de turno. Nada se
 * borra. Cada cambio queda en la bitácora. Los permisos se validan aquí (no solo ocultando botones).
 */
export function registerSupplies(app: Express, { sql, auth, need, userOf, clinicOf, audit }: Ctx) {
  const itemRow = async (cid: string, id: string) => (await sql.one('SELECT * FROM supply_items WHERE id = ? AND clinic_id = ?', [id, cid])) ?? fail(404, 'Ese material no existe.')
  /** Material y variante ya usados por otra línea activa de la clínica. */
  const assertUnique = async (cid: string, material: string, variant: string, except?: string) => {
    const key = supplyKey(material, variant)
    const rows = await sql.query('SELECT id, material, variant FROM supply_items WHERE clinic_id = ? AND archived_at IS NULL', [cid])
    if (rows.some((r) => String(r.id) !== except && supplyKey(String(r.material), String(r.variant)) === key)) fail(409, `Ya existe «${supplyLabel({ material, variant })}» en el catálogo.`)
  }

  // El catálogo (con los archivados si se piden) y el periodo. Lo usan la configuración y el formulario «Registrar material».
  app.get('/api/supplies', auth, need('supplies.view', 'usage.record'), async (req, res) => {
    const cid = clinicOf(req)
    const rows = await sql.query(`SELECT * FROM supply_items WHERE clinic_id = ? ${req.query.archived === '1' ? '' : 'AND archived_at IS NULL'} ORDER BY sort, category, material, variant`, [cid])
    res.json({ items: rows.map(toSupplyItem), settings: await supplySettings(sql, cid), source: { rows: SUPPLY_MD.rows.length, skipped: SUPPLY_MD.skipped.length } })
  })

  // El periodo de registro (también lo necesita quien solo ve el registro de uso: Recepción)
  app.get('/api/supplies/settings', auth, need('supplies.view', 'usage.view', 'usage.record'), async (req, res) => {
    res.json(await supplySettings(sql, clinicOf(req)))
  })

  app.post('/api/supplies', auth, need('supplies.manage'), async (req, res) => {
    const b = parse(itemBody, req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    const variant = stripLength(b.material, b.variant)
    await assertUnique(cid, b.material, variant)
    const id = randomUUID()
    const now = new Date().toISOString()
    const sort = Number((await sql.one<{ n: number }>('SELECT COALESCE(MAX(sort), 0)::int + 1 AS n FROM supply_items WHERE clinic_id = ?', [cid]))?.n ?? 1)
    await sql.run(`INSERT INTO supply_items (id, clinic_id, category, material, variant, unit, on_shift_list, sort, origin, created_by, created_at, list_set_at, list_set_by)
      VALUES (?,?,?,?,?,?,?,?,'clinic',?,?,?,?)`, [id, cid, b.category, b.material, variant, b.unit, !!b.onShiftList, sort, user.id, now, b.onShiftList ? now : null, b.onShiftList ? user.id : null])
    await audit(user, `${TAG}: agregó «${supplyLabel({ material: b.material, variant })}» (${b.category}, ${b.unit})${b.onShiftList ? ' en la lista de turno' : ''}${variant !== b.variant ? ' (sin la longitud escrita: solo calibre)' : ''}`)
    res.status(201).json(toSupplyItem((await sql.one('SELECT * FROM supply_items WHERE id = ?', [id]))!))
  })

  app.patch('/api/supplies/:id', auth, need('supplies.manage'), async (req, res) => {
    const b = parse(itemBody.omit({ onShiftList: true }), req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    const r = (await itemRow(cid, String(req.params.id)))!
    if (r.archived_at) fail(409, 'Ese material está archivado. Restáuralo para editarlo.')
    const variant = stripLength(b.material, b.variant)
    await assertUnique(cid, b.material, variant, String(r.id))
    const before = `«${supplyLabel({ material: String(r.material), variant: String(r.variant) })}» (${r.category}, ${r.unit})`
    const after = `«${supplyLabel({ material: b.material, variant })}» (${b.category}, ${b.unit})`
    if (before === after) return res.json(toSupplyItem(r))
    await sql.run('UPDATE supply_items SET category = ?, material = ?, variant = ?, unit = ?, edited_at = ?, edited_by = ? WHERE id = ?',
      [b.category, b.material, variant, b.unit, new Date().toISOString(), user.id, String(r.id)])
    await audit(user, `${TAG}: editó ${before} → ${after}`)
    res.json(toSupplyItem((await sql.one('SELECT * FROM supply_items WHERE id = ?', [String(r.id)]))!))
  })

  app.post('/api/supplies/:id/archive', auth, need('supplies.manage'), async (req, res) => {
    const user = userOf(req)
    const r = (await itemRow(clinicOf(req), String(req.params.id)))!
    if (r.archived_at) fail(409, 'Ese material ya estaba archivado.')
    await sql.run('UPDATE supply_items SET archived_at = ?, archived_by = ? WHERE id = ?', [new Date().toISOString(), user.id, String(r.id)])
    await audit(user, `${TAG}: archivó «${supplyLabel({ material: String(r.material), variant: String(r.variant) })}» (deja de ofrecerse al registrar; los registros anteriores lo siguen mostrando)`)
    res.json(toSupplyItem((await sql.one('SELECT * FROM supply_items WHERE id = ?', [String(r.id)]))!))
  })

  app.post('/api/supplies/:id/restore', auth, need('supplies.manage'), async (req, res) => {
    const user = userOf(req)
    const cid = clinicOf(req)
    const r = (await itemRow(cid, String(req.params.id)))!
    if (!r.archived_at) fail(409, 'Ese material no está archivado.')
    await assertUnique(cid, String(r.material), String(r.variant), String(r.id))
    // Restaurar es un cambio de la clínica: ninguna carga lo vuelve a tocar
    await sql.run('UPDATE supply_items SET archived_at = NULL, archived_by = NULL, edited_at = COALESCE(edited_at, ?), edited_by = COALESCE(edited_by, ?) WHERE id = ?', [new Date().toISOString(), user.id, String(r.id)])
    await audit(user, `${TAG}: restauró «${supplyLabel({ material: String(r.material), variant: String(r.variant) })}»`)
    res.json(toSupplyItem((await sql.one('SELECT * FROM supply_items WHERE id = ?', [String(r.id)]))!))
  })

  // Lista de turno: Administración y Enfermería (en el consultorio, la titular)
  app.post('/api/supplies/:id/shift-list', auth, need('supplies.shiftlist'), async (req, res) => {
    const b = parse(z.object({ on: z.boolean() }), req.body)
    const user = userOf(req)
    const r = (await itemRow(clinicOf(req), String(req.params.id)))!
    if (r.archived_at) fail(409, 'Ese material está archivado: no puede ir en la lista de turno.')
    if (Boolean(r.on_shift_list) === b.on) return res.json(toSupplyItem(r))
    await sql.run('UPDATE supply_items SET on_shift_list = ?, list_set_at = ?, list_set_by = ? WHERE id = ?', [b.on, new Date().toISOString(), user.id, String(r.id)])
    await audit(user, `${TAG}: ${b.on ? 'agregó a' : 'quitó de'} la lista de turno «${supplyLabel({ material: String(r.material), variant: String(r.variant) })}»`)
    res.json(toSupplyItem((await sql.one('SELECT * FROM supply_items WHERE id = ?', [String(r.id)]))!))
  })

  app.put('/api/supplies/settings', auth, need('supplies.manage'), async (req, res) => {
    const b = parse(z.object({
      period: z.enum(['shift', 'day', 'week']),
      shifts: z.array(z.object({ key: z.string().trim().max(40).optional(), label: z.string().trim().max(30), from: hhmm, to: hhmm })).max(12),
    }), req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    const problems = shiftProblems(b.shifts.map((s) => ({ key: s.key ?? '', ...s })))
    if (problems.length) fail(400, problems[0])
    const used = new Set<string>()
    const shifts = b.shifts.map((s) => {
      let key = s.key || normalize(s.label).replace(/[^a-z0-9]+/g, '-') || 'turno'
      while (used.has(key)) key = `${key}-2`
      used.add(key)
      return { key, label: s.label.trim(), from: s.from, to: s.to }
    })
    const before = await supplySettings(sql, cid)
    const text = (x: { period: string; shifts: { label: string; from: string; to: string }[] }) =>
      `${SUPPLY_PERIODS[x.period as keyof typeof SUPPLY_PERIODS]}; turnos ${x.shifts.map((s) => `${s.label} ${s.from}–${s.to}`).join(', ')}`
    await sql.run(`INSERT INTO supply_settings (clinic_id, period, shifts, updated_by, updated_at) VALUES (?,?,?,?,?)
      ON CONFLICT (clinic_id) DO UPDATE SET period = excluded.period, shifts = excluded.shifts, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    [cid, b.period, JSON.stringify(shifts), user.id, new Date().toISOString()])
    await audit(user, `${TAG}: cambió el periodo de registro del material (antes: ${text(before)}; ahora: ${text({ period: b.period, shifts })})`)
    res.json(await supplySettings(sql, cid))
  })
}
