import type { Express } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { type Ctx, fail, parse, type Row } from '../http'
import { tx } from '../db'
import { toService } from '../mappers'

export function registerSettings(app: Express, { db, auth, need, userOf, audit, settings }: Ctx) {
  app.put('/api/settings', auth, need('settings.manage'), (req, res) => {
    const s = parse(z.object({
      name: z.string().trim().min(2, 'Escribe el nombre de la clínica.'),
      address: z.string().trim().min(3, 'Escribe la dirección.'),
      phone: z.string().trim().min(7, 'Escribe un teléfono válido.'),
      email: z.string().trim().email('El correo no es válido.').or(z.literal('')),
      currency: z.string().trim().min(1).max(4),
      rxValidityDays: z.number().int().min(1).max(365),
      reminderTemplate: z.string().trim().min(10, 'El mensaje de recordatorio es muy corto.').max(600),
    }), req.body)
    tx(db, () => {
      const st = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      for (const [k, v] of Object.entries(s)) st.run(k, JSON.stringify(v))
    })
    audit(userOf(req).id, 'Actualizó la configuración de la clínica')
    res.json(settings())
  })

  const serviceBody = z.object({
    name: z.string().trim().min(2, 'Escribe el nombre del servicio.'),
    price: z.number({ error: 'Escribe el precio.' }).min(0, 'El precio no puede ser negativo.').max(1_000_000),
    active: z.boolean().default(true),
  })

  app.post('/api/services', auth, need('settings.manage'), (req, res) => {
    const s = parse(serviceBody, req.body)
    const id = randomUUID()
    db.prepare('INSERT INTO services (id, name, price, active) VALUES (?, ?, ?, ?)').run(id, s.name, s.price, s.active ? 1 : 0)
    audit(userOf(req).id, `Creó el servicio ${s.name}`)
    res.status(201).json(toService(db.prepare('SELECT * FROM services WHERE id = ?').get(id) as Row))
  })

  app.patch('/api/services/:id', auth, need('settings.manage'), (req, res) => {
    const id = String(req.params.id)
    const row = db.prepare('SELECT * FROM services WHERE id = ?').get(id) as Row | undefined ?? fail(404, 'El servicio no existe.')
    const s = parse(serviceBody.partial(), req.body)
    db.prepare('UPDATE services SET name = ?, price = ?, active = ? WHERE id = ?')
      .run(s.name ?? String(row!.name), s.price ?? Number(row!.price), s.active === undefined ? Number(row!.active) : s.active ? 1 : 0, id)
    audit(userOf(req).id, `Actualizó el servicio ${s.name ?? row!.name}`)
    res.json(toService(db.prepare('SELECT * FROM services WHERE id = ?').get(id) as Row))
  })
}
