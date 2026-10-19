import type { Express } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { type Ctx, fail, parse } from '../http.js'
import { toService } from '../mappers.js'

/** Configuración y servicios de la clínica de quien hace la petición. */
export function registerSettings(app: Express, { sql, auth, need, userOf, clinicOf, audit, settings }: Ctx) {
  app.put('/api/settings', auth, need('settings.manage'), async (req, res) => {
    const s = parse(z.object({
      name: z.string().trim().min(2, 'Escribe el nombre de la clínica.'),
      address: z.string().trim().min(3, 'Escribe la dirección.'),
      phone: z.string().trim().min(7, 'Escribe un teléfono válido.'),
      email: z.string().trim().email('El correo no es válido.').or(z.literal('')),
      currency: z.string().trim().min(1).max(4),
      rxValidityDays: z.number().int().min(1).max(365),
      reminderTemplate: z.string().trim().min(10, 'El mensaje de recordatorio es muy corto.').max(600),
    }), req.body)
    const cid = clinicOf(req)
    await sql.run(`UPDATE clinics SET name = ?, address = ?, phone = ?, email = ?, currency = ?, rx_validity_days = ?, reminder_template = ? WHERE id = ?`,
      [s.name, s.address, s.phone, s.email, s.currency, s.rxValidityDays, s.reminderTemplate, cid])
    await audit(userOf(req), 'Actualizó la configuración de la clínica')
    res.json(await settings(cid))
  })

  const serviceBody = z.object({
    name: z.string().trim().min(2, 'Escribe el nombre del servicio.'),
    price: z.number({ error: 'Escribe el precio.' }).min(0, 'El precio no puede ser negativo.').max(1_000_000),
    active: z.boolean().default(true),
  })

  app.post('/api/services', auth, need('settings.manage'), async (req, res) => {
    const s = parse(serviceBody, req.body)
    const id = randomUUID()
    await sql.run('INSERT INTO services (id, name, price, active, clinic_id) VALUES (?, ?, ?, ?, ?)', [id, s.name, s.price, s.active, clinicOf(req)])
    await audit(userOf(req), `Creó el servicio ${s.name}`)
    res.status(201).json(toService((await sql.one('SELECT * FROM services WHERE id = ?', [id]))!))
  })

  app.patch('/api/services/:id', auth, need('settings.manage'), async (req, res) => {
    const id = String(req.params.id)
    const cid = clinicOf(req)
    const row = (await sql.one('SELECT * FROM services WHERE id = ? AND clinic_id = ?', [id, cid])) ?? fail(404, 'El servicio no existe.')
    const s = parse(serviceBody.partial(), req.body)
    await sql.run('UPDATE services SET name = ?, price = ?, active = ? WHERE id = ? AND clinic_id = ?',
      [s.name ?? String(row!.name), s.price ?? Number(row!.price), 'active' in req.body ? Boolean(s.active) : Boolean(row!.active), id, cid])
    await audit(userOf(req), `Actualizó el servicio ${s.name ?? row!.name}`)
    res.json(toService((await sql.one('SELECT * FROM services WHERE id = ?', [id]))!))
  })
}
