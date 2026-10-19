import bcrypt from 'bcryptjs'
import { randomBytes, randomUUID } from 'node:crypto'
import { createSql } from './sql.js'
import { ensureDb } from './db.js'

/**
 * Crea (o restablece) una cuenta de Administración de Clinara.
 *   npm run superadmin -- correo@dominio.com "Nombre Apellido"
 * Con .env.neon.local presente, trabaja sobre la base de Neon.
 */
const [email, ...nameParts] = process.argv.slice(2)
if (!email || !/\S+@\S+\.\S+/.test(email)) {
  console.error('Uso: npm run superadmin -- correo@dominio.com "Nombre Apellido"')
  process.exit(1)
}
try { process.loadEnvFile('.env.neon.local') } catch { try { process.loadEnvFile('.env') } catch { /* base local */ } }

const sql = createSql()
await ensureDb(sql)
const password = randomBytes(9).toString('base64url')
const hash = bcrypt.hashSync(password, 10)
const existing = await sql.one('SELECT id, role FROM staff WHERE lower(email) = lower(?)', [email])
if (existing && existing.role !== 'superadmin') {
  console.error('Ese correo ya pertenece a un usuario de una clínica. Usa otro correo.')
  process.exit(1)
}
if (existing) {
  await sql.run('UPDATE staff SET password_hash = ?, active = TRUE, totp_enabled = FALSE, totp_secret = NULL, token_version = token_version + 1 WHERE id = ?', [hash, existing.id])
} else {
  await sql.run(`INSERT INTO staff (id, name, role, email, color, active, password_hash) VALUES (?, ?, 'superadmin', ?, '#0E2233', TRUE, ?)`,
    [randomUUID(), nameParts.join(' ') || 'Administración Clinara', email, hash])
}
await sql.close()
console.log(`${existing ? 'Contraseña restablecida' : 'Cuenta creada'} para ${email} en la base ${sql.kind === 'neon' ? 'de Neon' : 'local'}.`)
console.log(`Contraseña temporal: ${password}`)
console.log('Cámbiala al entrar, desde Mi cuenta.')
