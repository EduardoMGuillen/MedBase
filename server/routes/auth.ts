import type { Express } from 'express'
import { SESSION_COOKIE, type SessionTools } from '../http.js'
import bcrypt from 'bcryptjs'
import QRCode from 'qrcode'
import { z } from 'zod'
import { attempts, hit } from '../db.js'
import { type Ctx, fail, parse, placeOf, type Row } from '../http.js'
import { toStaff } from '../mappers.js'
import { newSecret, otpauthUrl, verifyTotp } from '../totp.js'
import { CLINIC_ROLES as ROLES } from '../staff.js'
import { permissionsFor, VIEW_LABEL } from '../../src/lib/permissions.js'

/** Sesión: ingreso, verificación en dos pasos, contraseña, cambio de vista y recorrido. */
export function registerAuth(app: Express, ctx: Ctx, tools: SessionTools) {
  const { issue, authenticate } = tools
  const { sql, demoMode, auth, userOf, audit, staffRow, settings } = ctx
  const session = (row: Row) => {
    const user = toStaff(row)
    return { user, permissions: permissionsFor(user.role, user.clinicKind, user.position, user.roles), demo: demoMode }
  }

  app.post('/api/auth/login', async (req, res) => {
    const body = parse(z.object({ email: z.string().trim().min(1), password: z.string().min(1), code: z.string().optional() }), req.body,
      'Escribe tu correo y tu contraseña.')
    const key = `login:${body.email.toLowerCase()}`
    if (await attempts(sql, key) >= 5) fail(429, 'Demasiados intentos. Espera 5 minutos e inténtalo de nuevo.')
    const row = await sql.one('SELECT s.*, c.kind AS clinic_kind FROM staff s LEFT JOIN clinics c ON c.id = s.clinic_id WHERE lower(s.email) = lower(?)', [body.email])
    if (!row || !bcrypt.compareSync(body.password, String(row.password_hash))) {
      await hit(sql, key, 5 * 60_000)
      fail(401, 'El correo o la contraseña no coinciden.')
    }
    if (!row!.active) fail(403, 'Esta cuenta está desactivada. Pide a administración que la reactive.')
    if (row!.clinic_id) {
      // Consultorio pendiente (ronda 17): «Tu consultorio» en una cuenta de consultorio
      const c = await sql.one('SELECT active, kind FROM clinics WHERE id = ?', [row!.clinic_id])
      if (!c?.active) fail(403, `Tu ${placeOf(String(c?.kind ?? '')).word} está desactivad${c?.kind === 'office' ? 'o' : 'a'} en Clinara. Comunícate con administración.`)
    }
    if (row!.totp_enabled) {
      if (!body.code) return res.json({ twoFactor: true })
      if (!verifyTotp(String(row!.totp_secret), body.code)) {
        await hit(sql, key, 5 * 60_000)
        fail(401, 'El código no es válido o ya expiró. Usa el que muestra tu app ahora.')
      }
    }
    await sql.run('DELETE FROM rate_limits WHERE key = ?', [key])
    issue(res, row!)
    await audit({ id: String(row!.id), clinicId: row!.clinic_id as string | null, role: String(row!.role) }, 'Inició sesión')
    res.json(session(row!))
  })

  app.post('/api/auth/logout', async (req, res) => {
    const user = await authenticate(req)
    if (user) await audit(user, 'Cerró sesión')
    res.clearCookie(SESSION_COOKIE, { path: '/' })
    res.json({ ok: true })
  })

  app.get('/api/auth/me', async (req, res) => {
    const user = await authenticate(req)
    // Con el tipo de cuenta: de él dependen los permisos (un consultorio da al médico permisos de administración)
    res.json(user ? session((await sql.one('SELECT s.*, c.kind AS clinic_kind FROM staff s LEFT JOIN clinics c ON c.id = s.clinic_id WHERE s.id = ?', [user.id]))!) : { user: null, demo: demoMode })
  })

  app.post('/api/auth/password', auth, async (req, res) => {
    const body = parse(z.object({ current: z.string(), next: z.string().min(8, 'La nueva contraseña debe tener al menos 8 caracteres.') }), req.body)
    const user = userOf(req)
    const row = (await staffRow(user.id))!
    if (!bcrypt.compareSync(body.current, String(row.password_hash))) fail(400, 'La contraseña actual no es correcta.')
    await sql.run('UPDATE staff SET password_hash = ?, token_version = token_version + 1 WHERE id = ?', [bcrypt.hashSync(body.next, 10), user.id])
    issue(res, (await staffRow(user.id))!)
    await audit(user, 'Cambió su contraseña')
    res.json({ ok: true })
  })

  /**
   * AD5: quien tiene varios roles elige con cuál trabaja ("Vista de administrador", "Vista de médico"). El rol activo se
   * guarda en la base: se recuerda en todos sus equipos y de él salen sus permisos (también en el servidor).
   */
  app.post('/api/me/view', auth, async (req, res) => {
    const { role } = parse(z.object({ role: z.enum(ROLES) }), req.body, 'Elige una vista.')
    const user = userOf(req)
    if (!(user.roles ?? [user.role]).includes(role)) fail(403, 'No tienes ese rol.')
    if (role !== user.role) {
      await sql.run('UPDATE staff SET role = ? WHERE id = ?', [role, user.id])
      await audit({ ...user, role }, `Cambió de rol a ${VIEW_LABEL[role]} (antes: ${VIEW_LABEL[user.role]})`)
    }
    res.json(session((await sql.one('SELECT s.*, c.kind AS clinic_kind FROM staff s LEFT JOIN clinics c ON c.id = s.clinic_id WHERE s.id = ?', [user.id]))!))
  })

  // MC6: cerrar la sesión en los demás equipos (esta sigue abierta con un pase nuevo)
  app.post('/api/me/sessions/close', auth, async (req, res) => {
    const user = userOf(req)
    await sql.run('UPDATE staff SET token_version = token_version + 1 WHERE id = ?', [user.id])
    issue(res, (await staffRow(user.id))!)
    await audit(user, 'Cerró su sesión en los demás equipos')
    res.json({ ok: true })
  })

  // Recorrido de primer ingreso: terminado o saltado, no vuelve a aparecer en ningún equipo
  /**
   * RG1: estado de cada recorrido del usuario (por rol activo o tipo de cuenta): terminado, saltado o pausado en un
   * paso, para no volver a iniciarlo solo y ofrecer «¿Continuar donde lo dejaste?». Sin datos, marca el de antes.
   */
  app.post('/api/me/tour', auth, async (req, res) => {
    const b = parse(z.object({ key: z.string().regex(/^[a-z-]{2,30}$/), state: z.enum(['done', 'skipped', 'paused']), step: z.number().int().min(0).max(60).default(0) }).partial(), req.body ?? {})
    const at = new Date().toISOString()
    if (!b.key || !b.state) {
      await sql.run(`UPDATE staff SET prefs = jsonb_set(COALESCE(NULLIF(prefs, ''), '{}')::jsonb, '{tourDoneAt}', to_jsonb(?::text))::text WHERE id = ?`, [at, userOf(req).id])
      return res.json({ ok: true })
    }
    const entry = JSON.stringify({ state: b.state, step: b.state === 'paused' ? b.step ?? 0 : 0, at })
    await sql.run(`UPDATE staff SET prefs = jsonb_set(jsonb_set(COALESCE(NULLIF(prefs, ''), '{}')::jsonb, '{tours}', COALESCE(NULLIF(prefs, '')::jsonb -> 'tours', '{}'::jsonb)),
      ARRAY['tours', ?::text], ?::jsonb)::text WHERE id = ?`, [b.key, entry, userOf(req).id])
    res.json({ ok: true })
  })

  // Doble factor: configurar genera un secreto pendiente; se activa al confirmar un código válido
  app.post('/api/auth/2fa/setup', auth, async (req, res) => {
    const user = userOf(req)
    const s = newSecret()
    await sql.run('UPDATE staff SET totp_secret = ? WHERE id = ? AND NOT totp_enabled', [s, user.id])
    const url = otpauthUrl(s, user.email, user.clinicId ? (await settings(user.clinicId)).name : 'Clinara')
    res.json({ secret: s, qr: await QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#0e2233', light: '#ffffff' } }) })
  })

  app.post('/api/auth/2fa/enable', auth, async (req, res) => {
    const { code } = parse(z.object({ code: z.string() }), req.body, 'Escribe el código de 6 dígitos.')
    const user = userOf(req)
    const row = (await staffRow(user.id))!
    if (!row.totp_secret) fail(400, 'Primero genera el código QR.')
    if (!verifyTotp(String(row.totp_secret), code)) fail(400, 'El código no coincide. Revisa que la hora de tu teléfono sea correcta e inténtalo con el código actual.')
    await sql.run('UPDATE staff SET totp_enabled = TRUE WHERE id = ?', [user.id])
    await audit(user, 'Activó la verificación en dos pasos')
    res.json({ ok: true })
  })

  app.post('/api/auth/2fa/disable', auth, async (req, res) => {
    const { password } = parse(z.object({ password: z.string().min(1) }), req.body, 'Escribe tu contraseña.')
    const user = userOf(req)
    if (!bcrypt.compareSync(password, String((await staffRow(user.id))!.password_hash))) fail(400, 'La contraseña no es correcta.')
    await sql.run('UPDATE staff SET totp_enabled = FALSE, totp_secret = NULL WHERE id = ?', [user.id])
    await audit(user, 'Desactivó la verificación en dos pasos')
    res.json({ ok: true })
  })
}
