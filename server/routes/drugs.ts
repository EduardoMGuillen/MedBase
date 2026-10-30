import express, { type Express } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { type Ctx, fail, parse } from '../http.js'
import { toClinicDrug } from '../mappers.js'
import { DRUGS } from '../../src/lib/catalogs.js'
import { normalize } from '../../src/lib/patients.js'
import { can } from '../../src/lib/permissions.js'

/** Clave sin mayúsculas, tildes ni espacios de más: "Acetaminofen" = "acetaminofén". */
const keyOf = (name: string, presentation?: string, concentration?: string) =>
  `${normalize(name)}|${normalize([presentation, concentration].filter(Boolean).join(' '))}`

const body = z.object({
  name: z.string().trim().min(2, 'Escribe el nombre genérico.').max(120),
  brand: z.string().trim().max(120).optional(),
  presentation: z.string().trim().max(60).optional(),
  concentration: z.string().trim().max(60).optional(),
  route: z.string().trim().max(40).optional(),
  usualDose: z.string().trim().max(120).optional(),
  usualUse: z.string().trim().max(200).optional(),
})

/** Lo que impide agregar un medicamento: ya está en el catálogo base o en el de la clínica. */
const baseMatch = (b: { name: string; presentation?: string; concentration?: string }, key: string) =>
  DRUGS.find((d) => keyOf(d.name, d.presentation) === key || (normalize(d.name) === normalize(b.name) && !b.presentation && !b.concentration))

/**
 * Vademécum de la clínica: los médicos agregan lo que no está en el catálogo base y queda disponible para
 * todos los médicos de esa clínica. Administración lo edita o lo desactiva; nunca se borra.
 */
export function registerDrugs(app: Express, { sql, auth, need, userOf, clinicOf, audit }: Ctx) {
  const insert = async (cid: string, by: string, b: z.infer<typeof body>, key: string) => {
    const id = randomUUID()
    await sql.run(`INSERT INTO clinic_drugs (id, clinic_id, name, brand, presentation, concentration, route, norm_key, created_by, created_at, usual_dose, usual_use) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, cid, b.name, b.brand || null, b.presentation || null, b.concentration || null, b.route || null, key, by, new Date().toISOString(), b.usualDose || null, b.usualUse || null])
    return id
  }

  app.get('/api/drugs', auth, need('rx.write', 'drugs.manage'), async (req, res) => {
    const rows = await sql.query('SELECT * FROM clinic_drugs WHERE clinic_id = ? ORDER BY name', [clinicOf(req)])
    res.json(rows.map(toClinicDrug))
  })

  app.post('/api/drugs', auth, need('rx.write', 'drugs.manage'), async (req, res) => {
    const b = parse(body, req.body)
    const cid = clinicOf(req)
    const key = keyOf(b.name, b.presentation, b.concentration)
    const base = baseMatch(b, key)
    if (base) fail(409, `${base.name} ${base.presentation} ya está en el vademécum. Búscalo en la lista.`)
    const existing = await sql.one('SELECT * FROM clinic_drugs WHERE clinic_id = ? AND norm_key = ?', [cid, key])
    if (existing) {
      // Si alguien lo había desactivado, se reactiva en lugar de duplicarlo
      if (!existing.active) await sql.run('UPDATE clinic_drugs SET active = TRUE, updated_by = ?, updated_at = ? WHERE id = ?', [userOf(req).id, new Date().toISOString(), String(existing.id)])
      return res.json(toClinicDrug((await sql.one('SELECT * FROM clinic_drugs WHERE id = ?', [String(existing.id)]))!))
    }
    const id = await insert(cid, userOf(req).id, b, key)
    await audit(userOf(req), `Agregó al vademécum de la clínica: ${[b.name, b.presentation, b.concentration].filter(Boolean).join(' ')}`)
    res.status(201).json(toClinicDrug((await sql.one('SELECT * FROM clinic_drugs WHERE id = ?', [id]))!))
  })

  /**
   * AD4: importar una lista (Listado Nacional de Medicamentos, inventario de la farmacia). Se salta lo que ya está en el
   * catálogo base, en el de la clínica o repetido en el mismo archivo (nombre sin mayúsculas, tildes ni espacios de más).
   */
  app.post('/api/drugs/import', express.json({ limit: '2mb' }), auth, need('rx.write', 'drugs.manage'), async (req, res) => {
    const { rows } = parse(z.object({ rows: z.array(z.record(z.string(), z.unknown())).min(1, 'El archivo no tiene filas.').max(3000, 'Importa como máximo 3000 medicamentos a la vez.') }), req.body)
    const cid = clinicOf(req)
    const user = userOf(req)
    const known = new Set((await sql.query('SELECT norm_key FROM clinic_drugs WHERE clinic_id = ?', [cid])).map((r) => String(r.norm_key)))
    const skipped: { row: number; name: string; reason: string }[] = []
    let added = 0
    for (const [i, raw] of rows.entries()) {
      const r = body.safeParse(raw)
      const name = String(raw.name ?? '').trim()
      if (!r.success) { skipped.push({ row: i + 2, name, reason: r.error.issues[0]?.message ?? 'Datos incompletos' }); continue }
      const key = keyOf(r.data.name, r.data.presentation, r.data.concentration)
      const base = baseMatch(r.data, key)
      if (base) { skipped.push({ row: i + 2, name, reason: 'Ya está en el catálogo base' }); continue }
      if (known.has(key)) { skipped.push({ row: i + 2, name, reason: 'Ya está en el vademécum de la clínica o repetido en el archivo' }); continue }
      known.add(key)
      await insert(cid, user.id, r.data, key)
      added++
    }
    await audit(user, `Importó ${added} medicamento(s) al vademécum de la clínica${skipped.length ? `; ${skipped.length} fila(s) no se importaron` : ''}`)
    res.json({ added, skipped })
  })

  // Lo editan quien lo agregó y administración (o el médico titular de un consultorio)
  app.patch('/api/drugs/:id', auth, need('rx.write', 'drugs.manage'), async (req, res) => {
    const cid = clinicOf(req)
    const row = (await sql.one('SELECT * FROM clinic_drugs WHERE id = ? AND clinic_id = ?', [String(req.params.id), cid])) ?? fail(404, 'El medicamento no existe.')
    if (!can(userOf(req), 'drugs.manage') && row!.created_by !== userOf(req).id) fail(403, 'Sólo quien lo agregó o administración puede editarlo.')
    const b = parse(body.partial().extend({ active: z.boolean().optional() }), req.body)
    const next = {
      name: b.name ?? String(row!.name), brand: b.brand ?? row!.brand, presentation: b.presentation ?? row!.presentation,
      concentration: b.concentration ?? row!.concentration, route: b.route ?? row!.route, active: b.active ?? Boolean(row!.active),
      usualDose: b.usualDose ?? row!.usual_dose, usualUse: b.usualUse ?? row!.usual_use,
    }
    const key = keyOf(next.name, next.presentation as string | undefined, next.concentration as string | undefined)
    const clash = await sql.one('SELECT 1 FROM clinic_drugs WHERE clinic_id = ? AND norm_key = ? AND id <> ?', [cid, key, String(row!.id)])
    if (clash) fail(409, 'Ya hay otro medicamento igual en el vademécum de la clínica.')
    await sql.run('UPDATE clinic_drugs SET name = ?, brand = ?, presentation = ?, concentration = ?, route = ?, active = ?, norm_key = ?, updated_by = ?, updated_at = ?, usual_dose = ?, usual_use = ? WHERE id = ?',
      [next.name, next.brand || null, next.presentation || null, next.concentration || null, next.route || null, next.active, key, userOf(req).id, new Date().toISOString(),
        next.usualDose || null, next.usualUse || null, String(row!.id)])
    const what = b.active === false ? 'Desactivó' : b.active === true && !row!.active ? 'Reactivó' : 'Editó'
    await audit(userOf(req), `${what} en el vademécum de la clínica: ${next.name}`)
    res.json(toClinicDrug((await sql.one('SELECT * FROM clinic_drugs WHERE id = ?', [String(row!.id)]))!))
  })
}
