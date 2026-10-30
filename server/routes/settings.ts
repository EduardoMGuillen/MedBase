import type { Express } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { type Ctx, fail, parse } from '../http.js'
import { toService } from '../mappers.js'
import { createStaffMember } from '../app.js'

/** Configuración y servicios de la clínica de quien hace la petición. */
export function registerSettings(app: Express, { sql, auth, need, userOf, clinicOf, audit, settings }: Ctx) {
  app.put('/api/settings', auth, need('settings.manage'), async (req, res) => {
    const s = parse(z.object({
      name: z.string().trim().min(2, 'Escribe el nombre de la clínica.'),
      address: z.string().trim().min(3, 'Escribe la dirección.'),
      phone: z.string().trim().min(7, 'Escribe un teléfono válido.'),
      email: z.string().trim().email('El correo no es válido.').or(z.literal('')),
      currency: z.string().trim().min(1).max(4),
      // AD2: la vigencia de las recetas ya no se configura por clínica (es de cada médico); se acepta y se ignora
      rxValidityDays: z.number().optional(),
      reminderTemplate: z.string().trim().min(10, 'El mensaje de recordatorio es muy corto.').max(600),
      recordUsesDni: z.boolean().default(false),
      obsAlertHours: z.number().int().min(1, 'Las horas de alerta deben ser al menos 1.').max(240).default(24),
      obsOrderChecklist: z.boolean().default(false),
      // Curva térmica: banda normal (fiebre desde tempHigh, hipotermia por debajo de tempLow)
      tempLow: z.number().min(34, 'La temperatura mínima normal no puede ser menor de 34 °C.').max(38).optional(),
      tempHigh: z.number().min(36).max(41, 'La temperatura de fiebre no puede pasar de 41 °C.').optional(),
      // Cada 0 es un dígito; lo demás (guiones, espacios) se escribe solo. Vacío: el documento se escribe libre.
      // Consultorio: si usa observación y lo que va en el encabezado de sus documentos
      observationEnabled: z.boolean().optional(),
      specialty: z.string().trim().max(60).optional(),
      license: z.string().trim().max(30).optional(),
      dniMask: z.string().trim().max(30).regex(/^[0\- /.]*$/, 'El formato de identidad sólo lleva ceros (dígitos) y guiones, espacios, puntos o barras.').default('0000-0000-00000'),
      // El logo viaja con la configuración en cada carga: se limita a una imagen pequeña
      logo: z.string().max(140_000, 'El logo es muy pesado; usa una imagen más pequeña.').regex(/^data:image\/(png|jpeg|webp);base64,/, 'El logo debe ser una imagen PNG, JPG o WEBP.')
        .optional().or(z.literal('').transform(() => undefined)),
    }), req.body)
    const cid = clinicOf(req)
    if (s.tempLow != null && s.tempHigh != null && s.tempLow >= s.tempHigh) fail(400, 'La temperatura de fiebre debe ser mayor que la mínima normal.')
    await sql.run(`UPDATE clinics SET name = ?, address = ?, phone = ?, email = ?, currency = ?, reminder_template = ?, record_uses_dni = ?, logo = ?,
      obs_alert_hours = ?, obs_order_checklist = ?, dni_mask = ?, observation_enabled = COALESCE(?, observation_enabled), specialty = COALESCE(?, specialty), license = COALESCE(?, license),
      temp_low = COALESCE(?, temp_low), temp_high = COALESCE(?, temp_high) WHERE id = ?`,
      [s.name, s.address, s.phone, s.email, s.currency, s.reminderTemplate, s.recordUsesDni, s.logo ?? null, s.obsAlertHours, s.obsOrderChecklist, s.dniMask,
        s.observationEnabled ?? null, s.specialty ?? null, s.license ?? null, s.tempLow ?? null, s.tempHigh ?? null, cid])
    await audit(userOf(req), 'Actualizó la configuración de la clínica')
    res.json(await settings(cid))
  })

  /** El médico titular terminó (o saltó) el asistente de primer ingreso: no vuelve a aparecer. */
  app.post('/api/settings/setup-done', auth, need('settings.manage'), async (req, res) => {
    const cid = clinicOf(req)
    await sql.run('UPDATE clinics SET setup_done_at = COALESCE(setup_done_at, ?) WHERE id = ?', [new Date().toISOString(), cid])
    await audit(userOf(req), 'Terminó la configuración inicial del consultorio')
    res.json(await settings(cid))
  })

  /**
   * El consultorio crece: se convierte en clínica. No se mueve ni se borra ningún dato; sólo cambia el tipo de
   * cuenta. El médico titular sigue como médico y crea, con otro correo, el usuario de administración. Cada
   * asistente pasa a recepción o a enfermería, como elija el titular.
   */
  app.post('/api/settings/convert-to-clinic', auth, need('settings.manage'), async (req, res) => {
    const b = parse(z.object({
      admin: z.object({ name: z.string().trim().min(3, 'Escribe el nombre de quien administrará la clínica.'), email: z.string().trim().email('El correo de administración no es válido.') }),
      assistants: z.record(z.string(), z.enum(['reception', 'nurse'])).default({}),
    }), req.body)
    const cid = clinicOf(req)
    const user = userOf(req)
    const c = (await sql.one('SELECT kind FROM clinics WHERE id = ?', [cid]))!
    if (c.kind !== 'office') fail(409, 'Esta cuenta ya es una clínica.')
    if (await sql.one('SELECT 1 FROM staff WHERE lower(email) = lower(?)', [b.admin.email])) fail(409, 'Ya existe un usuario con ese correo. Usa otro para la administración de la clínica.')
    const assistants = await sql.query(`SELECT id, name FROM staff WHERE clinic_id = ? AND role = 'assistant'`, [cid])
    await sql.tx(async (q) => {
      await q.run(`UPDATE clinics SET kind = 'clinic' WHERE id = ?`, [cid])
      // Las asistentes cambian de rol y vuelven a entrar. El servidor ya aplica los permisos de clínica a todos desde
      // ahora (lee el tipo de cuenta en cada petición); quien convierte ve la contraseña y luego vuelve a entrar.
      for (const a of assistants) await q.run('UPDATE staff SET role = ?, token_version = token_version + 1 WHERE id = ?', [b.assistants[String(a.id)] ?? 'reception', String(a.id)])
      await audit(user, `Convirtió el consultorio en clínica; ${assistants.map((a) => `${a.name} pasa a ${b.assistants[String(a.id)] === 'nurse' ? 'enfermería' : 'recepción'}`).join(', ') || 'sin asistentes'}`, q)
    })
    const { user: admin, password } = await createStaffMember(sql, cid, { name: b.admin.name, role: 'admin', email: b.admin.email })
    await audit(user, `Creó el usuario de administración ${admin.name}`)
    res.json({ settings: await settings(cid), admin, password })
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
