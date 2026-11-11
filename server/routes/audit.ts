import type { Express } from 'express'
import express from 'express'
import { z } from 'zod'
import { type Ctx, parse } from '../http.js'
import { toAudit } from '../mappers.js'
import { PAGE_SIZE } from '../../src/lib/clinicalConfig.js'
import { AUDIT_KINDS, auditKind, type AuditKind } from '../../src/lib/audit.js'

/** Bitácora de la clínica (AD7): consulta con filtros y exportación. */
export function registerAudit(app: Express, ctx: Ctx) {
  const { sql, auth, need, userOf, clinicOf } = ctx
  // ---------- Bitácora (AD7) ----------
  /**
   * Cada persona ve su propia actividad; administración ve la de todos, con filtros por persona, rol, tipo de acción,
   * paciente y fechas. Nadie la edita ni la borra (la tabla no lo permite).
   */
  const auditFilters = z.object({
    userId: z.string().optional(), role: z.string().optional(), kind: z.string().optional(), patientId: z.string().optional(),
    q: z.string().trim().max(80).optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  async function auditRows(cid: string, f: z.infer<typeof auditFilters>) {
    const where = ['a.clinic_id = ?']
    const args: unknown[] = [cid]
    if (f.userId) { where.push('a.user_id = ?'); args.push(f.userId) }
    if (f.role) { where.push('a.role = ?'); args.push(f.role) }
    if (f.patientId) {
      // Las filas de antes de la v38 no tienen paciente: se buscan también por su nombre en el texto
      const p = await sql.one('SELECT first_name, last_name FROM patients WHERE id = ? AND clinic_id = ?', [f.patientId, cid])
      where.push('(a.patient_id = ? OR (a.patient_id IS NULL AND a.action ILIKE ?))'); args.push(f.patientId, p ? `%${p.first_name} ${p.last_name}%` : '-')
    }
    if (f.q) { where.push('a.action ILIKE ?'); args.push(`%${f.q.replace(/[%_]/g, '')}%`) }
    // Las fechas se comparan en hora de Honduras (UTC-6)
    if (f.from) { where.push('a.at >= ?'); args.push(new Date(`${f.from}T00:00:00-06:00`).toISOString()) }
    if (f.to) { where.push('a.at < ?'); const d = new Date(`${f.to}T00:00:00-06:00`); d.setUTCDate(d.getUTCDate() + 1); args.push(d.toISOString()) }
    const rows = await sql.query(`SELECT a.*, p.first_name, p.last_name FROM audit a LEFT JOIN patients p ON p.id = a.patient_id
      WHERE ${where.join(' AND ')} ORDER BY a.id DESC LIMIT 50000`, args)
    const list = rows.map((r) => ({ ...toAudit(r), role: r.role ? String(r.role) : undefined, kind: (r.kind ? String(r.kind) : auditKind(String(r.action))) as AuditKind,
      patientId: r.patient_id ? String(r.patient_id) : undefined, patientName: r.first_name ? `${r.first_name} ${r.last_name}` : undefined }))
    return f.kind && f.kind in AUDIT_KINDS ? list.filter((x) => x.kind === f.kind) : list
  }
  /** GE5 (ronda 10): con `page`, una página de la lista completa ({ rows, total }); sin ella, todo (exportar a Excel). */
  const auditPage = z.object({ page: z.coerce.number().int().min(1).max(100000).optional(), size: z.coerce.number().int().min(5).max(200).default(PAGE_SIZE) })
  const sendAudit = (res: express.Response, list: Awaited<ReturnType<typeof auditRows>>, q: unknown) => {
    const { page, size } = parse(auditPage, q)
    res.json(page ? { rows: list.slice((page - 1) * size, page * size), total: list.length, page, size } : list)
  }

  app.get('/api/audit/mine', auth, async (req, res) => {
    const user = userOf(req)
    sendAudit(res, await auditRows(clinicOf(req), { ...parse(auditFilters, req.query), userId: user.id }), req.query)
  })

  app.get('/api/audit', auth, need('audit.view'), async (req, res) => {
    sendAudit(res, await auditRows(clinicOf(req), parse(auditFilters, req.query)), req.query)
  })
}
