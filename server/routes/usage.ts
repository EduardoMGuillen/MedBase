import type { Express, Request } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { type Ctx, fail, parse, type Row } from '../http.js'
import { can, mainRole, ROLE_LABEL } from '../../src/lib/permissions.js'
import { positionOf, signedName } from '../../src/lib/positions.js'
import { normalize } from '../../src/lib/patients.js'
import { doseText } from '../../src/lib/doseText.js'
import { formatRate, infusionUnitLabel } from '../../src/lib/inpatient.js'
import { GENERAL_USE_LABEL, USAGE_AREAS } from '../../src/lib/clinicalConfig.js'
import { toLocalValue } from '../../src/lib/dateInput.js'
import { localDay, periodOf, supplyLabel, unitText } from '../../src/lib/supplies.js'
import { USAGE_AREA_LIST, type MaterialLine, type MaterialRecord, type MedUse, type UsageArea } from '../../src/lib/usage.js'
import type { Nebulization } from '../../src/lib/medExtras.js'
import type { PrescriptionItem, Role } from '../../src/lib/types.js'
import { assertGrace, graceUntil, saveVersion } from '../grace.js'
import { supplySettings } from '../supplies.js'

const iso = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'La fecha no es válida.')
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha no es válida.')
const MAX_RANGE_DAYS = 93

/** «Cuarto 201», «Cuarto 201-A» (como `bedLabel` de la pantalla de hospitalizados). */
const bedText = (room: unknown, label: unknown) => (room ? `Cuarto ${room}${label ? `-${label}` : ''}` : '')
const locationOf = (area: UsageArea, bed?: string) => (area === 'outpatient' ? USAGE_AREAS.outpatient : `${USAGE_AREAS[area]}${bed ? ` · ${bed}` : ''}`)
const fullName = (r: Row) => `${r.first_name} ${r.last_name}`.trim()

/** «Lic. Carmen Ríos» y su cargo («Enfermería», «Médico · Medicina general», «Microbiólogo(a)»). */
function staffWho(r: Row | undefined) {
  if (!r) return { name: '—', title: undefined as string | undefined }
  const roles = (r.roles ? JSON.parse(String(r.roles)) : [r.role]) as Role[]
  const s = { name: String(r.name), docName: r.doc_name ? String(r.doc_name) : undefined, position: r.position ? String(r.position) : undefined, role: r.role as Role, roles }
  const pos = positionOf(s.position)
  const role = mainRole(s)
  const title = pos?.label ?? [ROLE_LABEL[role], role === 'doctor' && r.specialty ? String(r.specialty) : ''].filter(Boolean).join(' · ')
  return { name: signedName(s), title }
}

/**
 * RU2 (ronda 14): «Registro de uso de medicamentos y material». Administrativo de enfermería: no toca notas, indicaciones, hoja
 * de medicamentos, recetas ni expediente; no es inventario ni se cobra.
 *  - Medicamentos (solo lectura, se llena solo): dosis «Administrado» de la hoja (observación y hospitalización; nebulización:
 *    una línea por componente; infusión: una línea al iniciar) y aplicaciones de consulta externa (ME13, `status = 'applied'`).
 *  - Material: lo registra Enfermería (en el consultorio, la titular) por paciente o «Uso general del servicio», en el periodo
 *    de la clínica (turno, día o semana). El autor lo corrige en el periodo de gracia (GE4); después, «Anular» con motivo (el
 *    autor o Administración). RU3: cada impresión o exportación queda en la bitácora.
 * Ver: Enfermería, Recepción y Administración. Permisos validados aquí.
 */
export function registerUsage(app: Express, { sql, auth, need, userOf, clinicOf, audit }: Ctx) {
  const staffMap = async (cid: string) => new Map((await sql.query('SELECT * FROM staff WHERE clinic_id = ?', [cid])).map((r) => [String(r.id), r]))

  /** Periodo pedido (desde, hasta) y filtros de área y búsqueda. */
  const filters = (req: Request) => {
    const f = parse(z.object({ from: iso, to: iso, area: z.enum(['all', ...USAGE_AREA_LIST] as [string, ...string[]]).default('all'), q: z.string().trim().max(80).default('') }), req.query,
      'Elige el periodo del registro.')
    const from = new Date(f.from)
    const to = new Date(f.to)
    if (to <= from) fail(400, 'La fecha final debe ser después de la inicial.')
    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * 86_400_000) fail(400, `Elige un rango de hasta ${MAX_RANGE_DAYS} días.`)
    return { from: from.toISOString(), to: to.toISOString(), area: f.area as UsageArea | 'all', q: normalize(f.q) }
  }
  const matches = (q: string, ...texts: (string | undefined)[]) => !q || q.split(' ').every((w) => normalize(texts.filter(Boolean).join(' ')).includes(w))

  // ---------- Medicamentos ----------
  async function medUses(cid: string, from: string, to: string): Promise<MedUse[]> {
    const staff = await staffMap(cid)
    const out: MedUse[] = []
    // Dosis «Administrado» de la hoja. Infusión: solo la primera (el inicio).
    const doses = await sql.query(`SELECT d.id, d.given_at, d.given_by, d.dose AS given_dose, d.med_id, m.drug, m.presentation, m.dose, m.route, m.ordered_by, m.infusion_rate, m.infusion_unit,
        m.nebulization, h.kind, h.converted_at, h.patient_id, p.first_name, p.last_name, p.record, b.room, b.label AS bed_label
      FROM hosp_doses d JOIN hosp_meds m ON m.id = d.med_id JOIN hospitalizations h ON h.id = m.hospitalization_id JOIN patients p ON p.id = h.patient_id
      LEFT JOIN beds b ON b.id = h.bed_id
      WHERE d.clinic_id = ? AND d.status = 'given' AND d.given_at >= ? AND d.given_at < ?
        AND (m.infusion_rate IS NULL OR d.id = (SELECT d2.id FROM hosp_doses d2 WHERE d2.med_id = d.med_id AND d2.status = 'given' ORDER BY d2.given_at, d2.id LIMIT 1))
      ORDER BY d.given_at`, [cid, from, to])
    for (const r of doses) {
      const area: UsageArea = r.kind === 'observation' || (r.converted_at && String(r.given_at) < String(r.converted_at)) ? 'observation' : 'hospital'
      const who = staffWho(staff.get(String(r.given_by)))
      const base = {
        source: 'dose' as const, patientId: String(r.patient_id), patientName: fullName(r), record: String(r.record), area, location: locationOf(area, bedText(r.room, r.bed_label)),
        at: String(r.given_at), appliedBy: who.name, appliedByTitle: who.title, orderedBy: staffWho(staff.get(String(r.ordered_by))).name,
      }
      const route = String(r.route ?? '')
      const neb = r.nebulization ? (JSON.parse(String(r.nebulization)) as Nebulization) : undefined
      if (neb?.components?.length) {
        // Nebulización: una línea por componente
        neb.components.filter((c) => c.drug.trim()).forEach((c, i) => out.push({
          ...base, id: `${r.id}:${i}`, drug: c.drug.trim(), dose: c.amount.trim() || undefined, medication: `${c.drug.trim()} ${c.amount.trim()} · nebulización`.replace(/\s+/g, ' '),
        }))
        continue
      }
      const dose = String(r.given_dose ?? r.dose ?? '')
      const pres = r.presentation ? ` (${String(r.presentation).toLowerCase()})` : ''
      const infusion = r.infusion_rate != null ? ` · infusión a ${formatRate(Number(r.infusion_rate))} ${infusionUnitLabel(String(r.infusion_unit ?? ''))}` : ''
      out.push({ ...base, id: String(r.id), drug: String(r.drug), presentation: r.presentation ? String(r.presentation) : undefined, dose: dose || undefined,
        medication: `${r.drug}${pres} ${doseText(dose)}${route ? ` vía ${route.toLowerCase()}` : ''}${infusion}`.replace(/\s+/g, ' ').trim() })
    }
    // Aplicaciones de consulta externa (ME13): solo las «Aplicado»
    const apps = await sql.query(`SELECT a.*, p.first_name, p.last_name, p.record, c.meds FROM consult_applications a JOIN patients p ON p.id = a.patient_id
      LEFT JOIN consultations c ON c.id = a.consultation_id
      WHERE a.clinic_id = ? AND a.status = 'applied' AND a.applied_at >= ? AND a.applied_at < ? ORDER BY a.applied_at`, [cid, from, to])
    for (const r of apps) {
      let item: Partial<PrescriptionItem> = {}
      try { item = (JSON.parse(String(r.meds ?? '[]')) as PrescriptionItem[])[Number(r.item_index)] ?? {} } catch { /* sin datos de la consulta */ }
      const who = staffWho(staff.get(String(r.recorded_by)))
      out.push({
        id: String(r.id), source: 'consult', patientId: String(r.patient_id), patientName: fullName(r), record: String(r.record), area: 'outpatient', location: USAGE_AREAS.outpatient,
        at: String(r.applied_at), medication: String(r.order_text), drug: String(r.drug), presentation: item.presentation || undefined, dose: item.dose || undefined,
        appliedBy: who.name, appliedByTitle: who.title, orderedBy: staffWho(staff.get(String(r.ordered_by))).name,
      })
    }
    return out.sort((a, b) => a.at.localeCompare(b.at))
  }

  app.get('/api/usage/meds', auth, need('usage.view'), async (req, res) => {
    const f = filters(req)
    const rows = (await medUses(clinicOf(req), f.from, f.to))
      .filter((r) => (f.area === 'all' || r.area === f.area) && matches(f.q, r.patientName, r.record, r.medication, r.drug))
    res.json({ rows })
  })

  // ---------- Material ----------
  const toRecord = (r: Row, staff: Map<string, Row>): MaterialRecord => ({
    id: String(r.id), patientId: r.patient_id ? String(r.patient_id) : undefined, general: Boolean(r.general),
    patientName: r.general ? GENERAL_USE_LABEL : fullName(r), record: r.general ? '' : String(r.record ?? ''), area: r.area ? (String(r.area) as UsageArea) : undefined,
    location: r.general ? '' : String(r.location ?? ''), periodKind: String(r.period_kind) as MaterialRecord['periodKind'], periodStart: String(r.period_start), periodEnd: String(r.period_end),
    periodLabel: String(r.period_label), shiftKey: r.shift_key ? String(r.shift_key) : undefined, items: JSON.parse(String(r.items)) as MaterialLine[],
    recordedBy: String(r.recorded_by), recordedByName: staffWho(staff.get(String(r.recorded_by))).name, recordedAt: String(r.recorded_at), version: Number(r.version ?? 1),
    graceUntil: graceUntil(r.recorded_at), correctedAt: r.corrected_at ? String(r.corrected_at) : undefined,
    voidedAt: r.voided_at ? String(r.voided_at) : undefined, voidedBy: r.voided_by ? String(r.voided_by) : undefined,
    voidedByName: r.voided_by ? staffWho(staff.get(String(r.voided_by))).name : undefined, voidReason: r.void_reason ? String(r.void_reason) : undefined,
  })
  const recordRow = async (cid: string, id: string) =>
    (await sql.one('SELECT u.*, p.first_name, p.last_name, p.record FROM material_uses u LEFT JOIN patients p ON p.id = u.patient_id WHERE u.id = ? AND u.clinic_id = ?', [id, cid])) ?? fail(404, 'Ese registro de material no existe.')

  app.get('/api/usage/material', auth, need('usage.view'), async (req, res) => {
    const f = filters(req)
    const cid = clinicOf(req)
    const staff = await staffMap(cid)
    // Un registro pertenece al periodo en que empieza su turno, día o semana
    const rows = await sql.query(`SELECT u.*, p.first_name, p.last_name, p.record FROM material_uses u LEFT JOIN patients p ON p.id = u.patient_id
      WHERE u.clinic_id = ? AND u.period_start >= ? AND u.period_start < ? ORDER BY u.recorded_at`, [cid, f.from, f.to])
    const records = rows.map((r) => toRecord(r, staff))
      // El uso general del servicio no es de un área: sale con «Todas»
      .filter((r) => (f.area === 'all' || r.area === f.area) && (!f.q || matches(f.q, r.patientName, r.record) || r.items.some((i) => matches(f.q, i.material, i.variant, i.category))))
    res.json({ records })
  })

  /** Dónde estaba el paciente en ese periodo: la estancia (observación u hospitalización) que lo cruza, o consulta externa. */
  async function whereWas(cid: string, patientId: string, start: string, end: string) {
    const h = await sql.one(`SELECT h.kind, h.converted_at, b.room, b.label FROM hospitalizations h LEFT JOIN beds b ON b.id = h.bed_id
      WHERE h.clinic_id = ? AND h.patient_id = ? AND h.admitted_at < ? AND (h.discharged_at IS NULL OR h.discharged_at > ?) ORDER BY h.admitted_at DESC LIMIT 1`, [cid, patientId, end, start])
    if (!h) return { area: 'outpatient' as UsageArea, location: USAGE_AREAS.outpatient }
    const area: UsageArea = h.kind === 'observation' ? 'observation' : 'hospital'
    return { area, location: locationOf(area, bedText(h.room, h.label)) }
  }

  const recordBody = z.object({
    patientId: z.string().trim().max(80).optional(),
    general: z.boolean().default(false),
    day,
    shiftKey: z.string().trim().max(40).optional(),
    items: z.array(z.object({ itemId: z.string().min(1).max(80), quantity: z.number().int('La cantidad es un número entero.').min(1, 'La cantidad mínima es 1.').max(999, 'Revisa la cantidad: es demasiado alta.') })).max(120),
  })

  /** Valida el registro y arma lo que se guarda (periodo, ubicación y la copia de cada material). */
  async function prepare(cid: string, b: z.infer<typeof recordBody>, keep?: Set<string>) {
    if (b.general && b.patientId) fail(400, 'Elige un paciente o «Uso general del servicio», no los dos.')
    if (!b.general && !b.patientId) fail(400, 'Elige el paciente o marca «Uso general del servicio».')
    const lines = b.items.filter((i) => i.quantity > 0)
    if (!lines.length) fail(400, 'Escribe la cantidad de al menos un material.')
    if (new Set(lines.map((i) => i.itemId)).size !== lines.length) fail(400, 'Un material está repetido en el registro.')
    if (b.day > localDay(new Date())) fail(400, 'La fecha no puede ser en el futuro.')
    const cfg = await supplySettings(sql, cid)
    if (cfg.period === 'shift' && b.shiftKey && !cfg.shifts.some((s) => s.key === b.shiftKey)) fail(400, 'Ese turno no existe en la configuración de la clínica.')
    const period = periodOf(cfg.period, b.day, cfg.shifts, b.shiftKey)
    let patient: Row | undefined
    if (b.patientId) patient = (await sql.one('SELECT * FROM patients WHERE id = ? AND clinic_id = ?', [b.patientId, cid])) ?? fail(404, 'El paciente no existe.')
    const items = await sql.query(`SELECT * FROM supply_items WHERE clinic_id = ? AND id IN (${lines.map(() => '?').join(',')})`, [cid, ...lines.map((l) => l.itemId)])
    const byId = new Map(items.map((r) => [String(r.id), r]))
    const out: MaterialLine[] = lines.map((l) => {
      const r = byId.get(l.itemId) ?? fail(404, 'Un material del registro ya no existe en el catálogo.')
      // Lo archivado deja de ofrecerse; al corregir, lo que ya estaba en el registro se conserva
      if (r!.archived_at && !keep?.has(l.itemId)) fail(409, `«${supplyLabel({ material: String(r!.material), variant: String(r!.variant) })}» está archivado: ya no se registra.`)
      return { itemId: l.itemId, category: String(r!.category), material: String(r!.material), variant: String(r!.variant ?? ''), unit: String(r!.unit) as MaterialLine['unit'], quantity: l.quantity }
    })
    const where = patient ? await whereWas(cid, String(patient.id), period.start, period.end) : { area: null, location: null }
    return { period, patient, items: out, where }
  }
  const itemsText = (items: MaterialLine[]) => items.map((i) => `${supplyLabel(i)} × ${unitText(i.quantity, i.unit)}`).join(', ')
  const whoText = (patient?: Row) => (patient ? fullName(patient) : GENERAL_USE_LABEL)

  app.post('/api/usage/material', auth, need('usage.record'), async (req, res) => {
    const b = parse(recordBody, req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    const p = await prepare(cid, b)
    const id = randomUUID()
    await sql.run(`INSERT INTO material_uses (id, clinic_id, patient_id, general, area, location, period_kind, period_start, period_end, period_label, shift_key, items, recorded_by, recorded_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [id, cid, p.patient ? String(p.patient.id) : null, !p.patient, p.where.area, p.where.location, p.period.kind, p.period.start, p.period.end,
      p.period.label, p.period.shiftKey ?? null, JSON.stringify(p.items), user.id, new Date().toISOString()])
    await audit(user, `Registro de uso de material: registró para ${whoText(p.patient)} (${p.period.label}): ${itemsText(p.items)}`, sql, p.patient ? String(p.patient.id) : undefined)
    res.status(201).json(toRecord((await recordRow(cid, id))!, await staffMap(cid)))
  })

  // GE4: el autor lo corrige durante el periodo de gracia; la versión anterior queda guardada
  app.patch('/api/usage/material/:id', auth, need('usage.record'), async (req, res) => {
    const b = parse(recordBody, req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    const r = (await recordRow(cid, String(req.params.id)))!
    if (r.voided_at) fail(409, 'Ese registro está anulado: no se corrige.')
    assertGrace(user.id, r.recorded_by, r.recorded_at, 'registró el material')
    const before = JSON.parse(String(r.items)) as MaterialLine[]
    const p = await prepare(cid, b, new Set(before.map((i) => i.itemId)))
    await sql.tx(async (q) => {
      const next = await saveVersion(q, { clinicId: cid, kind: 'material_use', id: String(r.id), version: Number(r.version ?? 1), authorId: String(r.recorded_by), at: String(r.recorded_at), by: user.id,
        data: { patientId: r.patient_id ?? null, general: Boolean(r.general), periodLabel: r.period_label, items: before } })
      await q.run(`UPDATE material_uses SET patient_id = ?, general = ?, area = ?, location = ?, period_kind = ?, period_start = ?, period_end = ?, period_label = ?, shift_key = ?, items = ?,
          version = ?, corrected_at = ?, corrected_by = ? WHERE id = ?`, [p.patient ? String(p.patient.id) : null, !p.patient, p.where.area, p.where.location, p.period.kind, p.period.start,
        p.period.end, p.period.label, p.period.shiftKey ?? null, JSON.stringify(p.items), next, new Date().toISOString(), user.id, String(r.id)])
      await audit(user, `Registro de uso de material: corrigió en el periodo de gracia (versión ${next}) el registro de ${r.general ? GENERAL_USE_LABEL : fullName(r)} (antes: ${itemsText(before)}; ahora: ${whoText(p.patient)}, ${p.period.label}: ${itemsText(p.items)})`, q, p.patient ? String(p.patient.id) : undefined)
    })
    res.json(toRecord((await recordRow(cid, String(r.id)))!, await staffMap(cid)))
  })

  // «Anular» con motivo: el autor o Administración. Se ve tachado y no suma.
  app.post('/api/usage/material/:id/void', auth, need('usage.void', 'usage.record'), async (req, res) => {
    const b = parse(z.object({ reason: z.string().trim().min(5, 'Escribe el motivo de la anulación (al menos 5 letras).').max(300) }), req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    const r = (await recordRow(cid, String(req.params.id)))!
    if (r.voided_at) fail(409, 'Ese registro ya estaba anulado.')
    if (!can(user, 'usage.void') && String(r.recorded_by) !== user.id) fail(403, 'Solo quien hizo el registro o Administración lo pueden anular.')
    await sql.run('UPDATE material_uses SET voided_at = ?, voided_by = ?, void_reason = ? WHERE id = ?', [new Date().toISOString(), user.id, b.reason, String(r.id)])
    await audit(user, `Registro de uso de material: anuló el registro de ${r.general ? GENERAL_USE_LABEL : fullName(r)} (${r.period_label}: ${itemsText(JSON.parse(String(r.items)))}). Motivo: ${b.reason}`,
      sql, r.patient_id ? String(r.patient_id) : undefined)
    res.json(toRecord((await recordRow(cid, String(r.id)))!, await staffMap(cid)))
  })

  /** Pacientes para sugerir primero: atendidos (cita o consulta) o internados en ese periodo. */
  app.get('/api/usage/suggest', auth, need('usage.record'), async (req, res) => {
    const f = parse(z.object({ from: iso, to: iso }), req.query, 'Elige el periodo.')
    const cid = clinicOf(req)
    const from = new Date(f.from).toISOString()
    const to = new Date(f.to).toISOString()
    // Citas y consultas guardan la hora local de Honduras sin zona («2026-11-05T09:00:00»)
    const lf = toLocalValue(new Date(f.from))
    const lt = toLocalValue(new Date(f.to))
    const rows = await sql.query(`SELECT p.id, p.first_name, p.last_name, p.record, MAX(x.kind) AS kind FROM patients p JOIN (
        SELECT patient_id, 'outpatient' AS kind FROM appointments WHERE clinic_id = ? AND start >= ? AND start < ? AND status IN ('arrived','triaged','in_consult','done')
        UNION SELECT patient_id, 'outpatient' FROM consultations WHERE clinic_id = ? AND date >= ? AND date < ?
        UNION SELECT patient_id, kind FROM hospitalizations WHERE clinic_id = ? AND admitted_at < ? AND (discharged_at IS NULL OR discharged_at > ?)
      ) x ON x.patient_id = p.id WHERE p.clinic_id = ? GROUP BY p.id, p.first_name, p.last_name, p.record ORDER BY p.first_name, p.last_name LIMIT 60`,
    [cid, lf, lt, cid, lf, lt, cid, to, from, cid])
    res.json(rows.map((r) => ({ id: String(r.id), name: fullName(r), record: String(r.record), area: (r.kind === 'outpatient' ? 'outpatient' : r.kind === 'observation' ? 'observation' : 'hospital') as UsageArea })))
  })
}
