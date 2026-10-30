import express, { type Express } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { type Ctx, fail, parse, type Row } from '../http.js'
import { toAuthorization } from '../mappers.js'
import { checkSecret, docName, saveMark } from './me.js'
import { signedConsentPdf } from '../consentPdf.js'
import { authTitle, deviceLabel } from '../../src/lib/consent.js'
import { normalizeDni } from '../../src/lib/format.js'
import type { Authorization, ConsentRevocation, ConsentSigning } from '../../src/lib/types.js'
import type { Sql } from '../sql.js'

/** Firma dibujada: PNG en data URL. Las firmas pesan pocos KB; el límite evita imágenes que no son firmas. */
const signature = z.string().max(400_000, 'La imagen de la firma es demasiado grande.')
  .refine((s) => /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(s) && s.length > 300, 'Falta la firma.')
const person = z.object({
  name: z.string().trim().min(3, 'Escribe el nombre completo.').max(120),
  dni: z.string().trim().max(30).optional().transform((v) => (v ? normalizeDni(v) : undefined)),
  relation: z.string().trim().max(40).optional(),
})

/**
 * Firma en pantalla de las autorizaciones (A1, A2). Enfermería o el médico la gestionan en la tablet, el celular o
 * la computadora de la clínica; la firma del médico sólo la pone un médico, confirmando con su contraseña.
 * Al completarse se genera el PDF final con las firmas y la constancia, se guarda como archivo del expediente con su
 * huella SHA-256 y la autorización queda bloqueada. Rechazo ("No autoriza") y revocación usan el mismo flujo y
 * no llevan la firma del médico, como en la hoja de papel.
 */
export function registerConsent(app: Express, { sql, auth, need, userOf, clinicOf, audit, staffRow, patientName }: Ctx) {
  const bigJson = express.json({ limit: '1.5mb' })

  const loadAuth = async (cid: string, id: string) => {
    const row = (await sql.one('SELECT * FROM authorizations WHERE id = ? AND clinic_id = ? AND archived_at IS NULL', [id, cid])) ?? fail(404, 'La autorización no existe.')
    const h = (await sql.one('SELECT * FROM hospitalizations WHERE id = ?', [String(row!.hospitalization_id)]))!
    if (h.status !== 'active') fail(409, 'El paciente ya egresó; el expediente está cerrado.')
    return { row: row!, a: rawAuthorization(row!) }
  }

  /** Verifica la contraseña del médico que firma (la sesión ya está abierta: se pide otra vez). */
  async function confirmDoctor(userId: string, secret: { password?: string; pin?: string }) {
    const key = `confirm:${userId}`
    const tries = await sql.one<{ n: number; reset_at: number }>('SELECT n, reset_at FROM rate_limits WHERE key = ?', [key])
    if (tries && Number(tries.reset_at) > Date.now() && Number(tries.n) >= 5) fail(429, 'Demasiados intentos con la contraseña. Espera 5 minutos.')
    const row = (await staffRow(userId))!
    if (!(await checkSecret(sql, userId, secret))) {
      await sql.run(`INSERT INTO rate_limits (key, n, reset_at) VALUES (?, 1, ?) ON CONFLICT (key) DO UPDATE SET n = CASE WHEN rate_limits.reset_at < ? THEN 1 ELSE rate_limits.n + 1 END,
        reset_at = CASE WHEN rate_limits.reset_at < ? THEN excluded.reset_at ELSE rate_limits.reset_at END`, [key, Date.now() + 5 * 60_000, Date.now(), Date.now()])
      fail(401, secret.pin ? 'El PIN no es correcto.' : 'La contraseña no es correcta.')
    }
    await sql.run('DELETE FROM rate_limits WHERE key = ?', [key])
    return row
  }

  /** Guarda el PDF final como archivo del expediente de la estancia. */
  async function storePdf(q: Sql, a: Authorization, cid: string, userId: string, title: string, bytes: Uint8Array) {
    const id = randomUUID()
    await q.run('INSERT INTO attachments (id, patient_id, name, mime, size, category, data, uploaded_by, uploaded_at, clinic_id, title, taken_at, hospitalization_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [id, a.patientId, `${title}.pdf`, 'application/pdf', bytes.length, 'document', bytes, userId, new Date().toISOString(), cid, title, new Date().toISOString(), a.hospitalizationId])
    return id
  }

  app.post('/api/authorizations/:aid/sign', bigJson, auth, need('inpatient.orders', 'inpatient.care'), async (req, res) => {
    const b = parse(z.object({
      action: z.enum(['accept', 'refuse', 'revoke']),
      // Lo que firma el paciente: quién, la casilla de lectura y la firma (o el testigo si no puede firmar)
      patient: z.object({
        signer: z.enum(['patient', 'representative']),
        representative: person.extend({
          dni: z.string().trim().min(1, 'Escribe la identidad del representante.').max(30).transform(normalizeDni),
          relation: z.string().trim().min(2, 'Escribe el parentesco del representante.').max(40),
        }).optional(),
        unableReason: z.string().trim().max(300).optional(),
        witness: person.extend({ signature }).optional(),
        signature: signature.optional(),
        readConfirmed: z.literal(true, 'Marca la casilla «He leído este documento».'),
      }).optional(),
      // La firma del médico: su contraseña otra vez y su firma (la guardada o una nueva)
      // El médico confirma con su contraseña o con su PIN (MC6)
      doctor: z.object({ password: z.string().optional(), pin: z.string().optional(), signature: signature.optional(), save: z.boolean().default(false) })
        .refine((d) => d.password || d.pin, 'Escribe tu contraseña o tu PIN.').optional(),
    }), req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    const { a } = await loadAuth(cid, String(req.params.aid))
    const allowed = b.action === 'revoke' ? ['signed'] : ['pending']
    if (!allowed.includes(a.status)) fail(409, b.action === 'revoke' ? 'Sólo se revoca una autorización firmada.' : 'Esta autorización ya no está pendiente de firma.')
    const device = deviceLabel(String(req.headers['user-agent'] ?? ''))
    const now = new Date().toISOString()

    // Paso del paciente: se valida y se guarda (o se toma el que ya se guardó, si sólo falta el médico)
    let signing: ConsentSigning | undefined = b.action === 'accept' && a.signing?.action === 'accept' && !a.signing.doctor ? a.signing : undefined
    if (b.patient) {
      const p = b.patient
      if (p.signer === 'representative' && !p.representative) fail(400, 'Escribe el nombre, la identidad y el parentesco del representante.')
      if (p.unableReason !== undefined && p.unableReason.length < 3) fail(400, 'Escribe por qué el paciente no puede firmar.')
      if (p.unableReason && !p.witness) fail(400, 'Si el paciente no puede firmar, firma un testigo: escribe su nombre, su identidad y su firma.')
      if (p.unableReason && !p.witness?.dni) fail(400, 'Escribe la identidad del testigo.')
      if (!p.unableReason && !p.signature) fail(400, 'Falta la firma del paciente o del representante.')
      signing = {
        action: b.action, signer: p.signer, representative: p.signer === 'representative' ? p.representative : undefined, unableReason: p.unableReason || undefined,
        witness: p.witness, signature: p.unableReason ? undefined : p.signature, signedAt: now, managedBy: user.id, device,
      }
    }
    if (!signing) fail(400, 'Falta la firma del paciente o del representante.')
    const s = signing!

    // La autorización (no el rechazo ni la revocación) lleva la firma del médico
    let doctorRow: Row | undefined
    if (b.action === 'accept' && b.doctor) {
      if (user.role !== 'doctor') fail(403, 'Sólo un médico firma como médico.')
      doctorRow = await confirmDoctor(user.id, b.doctor)
      const drawn = b.doctor.signature ?? (doctorRow.signature ? String(doctorRow.signature) : undefined)
      if (!drawn) fail(400, 'Dibuja tu firma. Se guardará en tu perfil para las próximas.')
      s.doctor = { id: user.id, name: docName(doctorRow), license: doctorRow.license ? String(doctorRow.license) : undefined, signature: drawn, at: new Date().toISOString() }
    }

    const name = await patientName(a.patientId)
    const what = `${authTitle(a).toLowerCase()} de ${name}`
    // Falta el médico: se guarda la firma del paciente y la autorización sigue pendiente (con su alerta)
    if (b.action === 'accept' && !s.doctor) {
      await sql.run('UPDATE authorizations SET signing = ? WHERE id = ?', [JSON.stringify(s), a.id])
      await audit(user, `Registró en pantalla la firma ${s.signer === 'representative' ? 'del representante' : 'del paciente'} en la ${what}; falta la firma del médico (${device})`)
      return res.json(toAuthorization((await sql.one('SELECT * FROM authorizations WHERE id = ?', [a.id]))!))
    }

    const managed = (await staffRow(s.managedBy))!
    const { bytes, sha256 } = await signedConsentPdf({ a: { ...a, statusAt: a.statusAt }, signing: s, managedByName: String(managed.name) })
    const title = `${b.action === 'revoke' ? 'Revocación' : b.action === 'refuse' ? 'Rechazo' : authTitle(a)} firmado en pantalla`
    await sql.tx(async (q) => {
      const pdfId = await storePdf(q, a, cid, user.id, title, bytes)
      if (doctorRow && b.doctor?.save && b.doctor.signature) await saveMark(q, cid, user.id, 'signature', b.doctor.signature)
      if (b.action === 'revoke') {
        const revocation: ConsentRevocation = { method: 'virtual', at: now, by: user.id, signing: s, pdfId, pdfSha256: sha256 }
        await q.run(`UPDATE authorizations SET status = 'revoked', revocation = ?, status_at = ?, status_by = ? WHERE id = ?`, [JSON.stringify(revocation), now, user.id, a.id])
      } else {
        await q.run(`UPDATE authorizations SET status = ?, method = 'virtual', signing = ?, pdf_id = ?, pdf_sha256 = ?, status_at = ?, status_by = ? WHERE id = ?`,
          [b.action === 'accept' ? 'signed' : 'refused', JSON.stringify(s), pdfId, sha256, now, user.id, a.id])
      }
      const label = { accept: 'Firmó en pantalla', refuse: 'Registró en pantalla el rechazo (no autoriza) de', revoke: 'Registró en pantalla la revocación de' }[b.action]
      await audit(user, `${label} la ${what}. PDF SHA-256 ${sha256} (${device})`, q)
    })
    res.json(toAuthorization((await sql.one('SELECT * FROM authorizations WHERE id = ?', [a.id]))!))
  })

  /**
   * MC1: aunque se haya firmado en pantalla, la clínica puede adjuntar también la foto o el PDF de una hoja firmada en
   * papel. La autorización sigue siendo la firmada en pantalla; la hoja queda como respaldo.
   */
  app.post('/api/authorizations/:aid/attach-paper', auth, need('inpatient.orders', 'inpatient.care'), async (req, res) => {
    const b = parse(z.object({ fileId: z.string().min(1) }), req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    const { a } = await loadAuth(cid, String(req.params.aid))
    if (a.status !== 'signed' || a.method !== 'virtual') fail(409, 'Sólo se adjunta la hoja en papel a una autorización firmada en pantalla.')
    if (!(await sql.one('SELECT 1 FROM attachments WHERE id = ? AND clinic_id = ? AND patient_id = ?', [b.fileId, cid, a.patientId]))) fail(400, 'El archivo no corresponde a este paciente.')
    const history = a.fileId ? [...(a.fileHistory ?? []), { fileId: a.fileId, replacedAt: new Date().toISOString(), replacedBy: user.id, reason: 'Se adjuntó otra hoja en papel' }] : a.fileHistory ?? []
    await sql.run('UPDATE authorizations SET file_id = ?, file_history = ? WHERE id = ?', [b.fileId, history.length ? JSON.stringify(history) : null, a.id])
    await audit(user, `Adjuntó la hoja firmada en papel a la ${authTitle(a).toLowerCase()} de ${await patientName(a.patientId)} (firmada en pantalla)`)
    res.json(toAuthorization((await sql.one('SELECT * FROM authorizations WHERE id = ?', [a.id]))!))
  })

  /** Reemplazar el escaneo de una autorización firmada en papel: el anterior queda en el historial, no se borra. */
  app.post('/api/authorizations/:aid/replace-scan', auth, need('inpatient.orders', 'inpatient.care'), async (req, res) => {
    const b = parse(z.object({ fileId: z.string().min(1), reason: z.string().trim().min(3, 'Escribe por qué se reemplaza el archivo.').max(300) }), req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    const { a } = await loadAuth(cid, String(req.params.aid))
    if (a.method === 'virtual' || !a.fileId) fail(409, 'Sólo se reemplaza el escaneo de una autorización firmada en papel.')
    if (!(await sql.one('SELECT 1 FROM attachments WHERE id = ? AND clinic_id = ? AND patient_id = ?', [b.fileId, cid, a.patientId]))) fail(400, 'El archivo no corresponde a este paciente.')
    const history = [...(a.fileHistory ?? []), { fileId: a.fileId!, replacedAt: new Date().toISOString(), replacedBy: user.id, reason: b.reason }]
    await sql.run(`UPDATE authorizations SET file_id = ?, method = 'paper', file_history = ? WHERE id = ?`, [b.fileId, JSON.stringify(history), a.id])
    await audit(user, `Reemplazó el escaneo de la ${authTitle(a).toLowerCase()} de ${await patientName(a.patientId)}: ${b.reason}`)
    res.json(toAuthorization((await sql.one('SELECT * FROM authorizations WHERE id = ?', [a.id]))!))
  })

  // Firma guardada del médico: se usa al firmar en pantalla (se guarda desde Mi configuración, routes/me.ts)
  app.get('/api/me/signature', auth, need('inpatient.orders'), async (req, res) => {
    const row = (await staffRow(userOf(req).id))!
    res.json({ signature: row.signature ? String(row.signature) : null, pin: !!row.pin_hash })
  })
}

/** La autorización con las imágenes de las firmas (sólo en el servidor). */
function rawAuthorization(r: Row): Authorization {
  const a = toAuthorization(r)
  a.signing = r.signing ? JSON.parse(String(r.signing)) as ConsentSigning : undefined
  return a
}
