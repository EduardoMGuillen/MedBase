import { randomUUID } from 'node:crypto'
import type { Row, Sql } from './sql.js'
import { clinicSettings, toEpicrisis } from './mappers.js'
import { age as ageText, medicationOrder } from '../src/lib/format.js'
import type { DischargeData, EpicrisisData, PrescriptionItem } from '../src/lib/types.js'

const j = <T>(v: unknown, fallback: T): T => { try { return v ? JSON.parse(String(v)) as T : fallback } catch { return fallback } }
/** Días de estancia contados por fecha de calendario: entrar y salir el mismo día es 1 día. */
const stayDays = (from: string, to: string) => {
  const day = (iso: string) => { const d = new Date(iso); d.setHours(0, 0, 0, 0); return d.getTime() }
  return Math.max(1, Math.round((day(to) - day(from)) / 86_400_000))
}
const freq = (m: Row) => (m.prn ? `según necesidad${m.every_hours ? `, cada ${m.every_hours} h como máximo` : ''}` : m.every_hours ? `cada ${m.every_hours} h` : 'dosis única')

/**
 * Arma la epicrisis con lo que ya está en el expediente. No inventa: lo que falta queda vacío y la vista previa lo
 * señala para que el médico lo escriba antes de emitir.
 */
export async function buildEpicrisis(q: Sql, h: Row): Promise<EpicrisisData> {
  const cid = String(h.clinic_id)
  const id = String(h.id)
  const [p, clinic, bed, attending, notes, meds, doses, legacy, labs, consult] = await Promise.all([
    q.one('SELECT * FROM patients WHERE id = ?', [String(h.patient_id)]),
    q.one('SELECT * FROM clinics WHERE id = ?', [cid]),
    h.bed_id ? q.one('SELECT room, label FROM beds WHERE id = ?', [String(h.bed_id)]) : undefined,
    q.one('SELECT name FROM staff WHERE id = ?', [String(h.admitted_by)]),
    q.query('SELECT * FROM hosp_notes WHERE hospitalization_id = ? ORDER BY at, id', [id]),
    q.query('SELECT * FROM hosp_meds WHERE hospitalization_id = ? ORDER BY first_at, id', [id]),
    q.query(`SELECT d.med_id, MIN(d.given_at) AS first_given, MAX(d.given_at) AS last_given FROM hosp_doses d JOIN hosp_meds m ON m.id = d.med_id
      WHERE m.hospitalization_id = ? AND d.status = 'given' GROUP BY d.med_id`, [id]),
    q.query(`SELECT name, created_at FROM hosp_procedures WHERE hospitalization_id = ? AND kind = 'procedure' ORDER BY created_at`, [id]),
    q.query(`SELECT id, title, name, taken_at, uploaded_at FROM attachments WHERE clinic_id = ? AND patient_id = ? AND category = 'lab'
      AND (hospitalization_id = ? OR (taken_at >= ? AND taken_at <= ?)) ORDER BY COALESCE(taken_at, uploaded_at)`, [cid, String(h.patient_id), id, String(h.admitted_at), String(h.discharged_at ?? '9999')]),
    h.consultation_id ? q.one('SELECT history FROM consultations WHERE id = ?', [String(h.consultation_id)]) : undefined,
  ])
  const cfg = clinicSettings(clinic!)
  const discharge = notes.find((n) => n.kind === 'discharge')
  const d = j<DischargeData | undefined>(discharge?.data, undefined)
  const admission = notes.find((n) => n.kind === 'admission')
  const rx = h.prescription_id ? await q.one('SELECT items FROM prescriptions WHERE id = ?', [String(h.prescription_id)]) : undefined
  const given = new Map(doses.map((x) => [String(x.med_id), x]))
  const dischargedAt = String(h.discharged_at ?? discharge?.at ?? new Date().toISOString())
  // Una orden por medicamento, dosis, vía y frecuencia: desde la primera dosis aplicada hasta la última (o el egreso)
  const grouped = new Map<string, EpicrisisData['meds'][number]>()
  for (const m of meds) {
    const g = given.get(String(m.id))
    if (!g) continue
    const key = [m.drug, m.dose, m.route, freq(m)].join('|').toLowerCase()
    const untilDischarge = String(m.stop_reason ?? '') === 'Egreso'
    const end = untilDischarge ? undefined : String(m.stopped_at ?? g.last_given)
    const prev = grouped.get(key)
    if (!prev) grouped.set(key, { drug: String(m.drug), dose: String(m.dose), route: String(m.route), frequency: freq(m), start: String(g.first_given), end, untilDischarge: untilDischarge || undefined })
    else {
      if (String(g.first_given) < prev.start) prev.start = String(g.first_given)
      if (untilDischarge) { prev.untilDischarge = true; prev.end = undefined } else if (!prev.untilDischarge && end && (!prev.end || end > prev.end)) prev.end = end
    }
  }
  const birth = String(p!.birth_date ?? '')
  return {
    clinic: { name: cfg.name, address: cfg.address, phone: cfg.phone, logo: cfg.logo },
    patient: {
      name: `${p!.first_name} ${p!.last_name}`, dni: p!.dni ? String(p!.dni) : undefined, age: birth ? ageText(birth) : 'Sin dato',
      sex: (p!.sex ?? undefined) as 'F' | 'M' | undefined, record: cfg.recordUsesDni && p!.dni ? String(p!.dni) : String(p!.record),
    },
    admittedAt: String(h.admitted_at), dischargedAt, stayDays: stayDays(String(h.admitted_at), dischargedAt),
    room: bed ? `Cuarto ${bed.room}${bed.label ? `-${bed.label}` : ''}` : undefined, attending: String(attending?.name ?? ''),
    observationAt: h.observation_at ? String(h.observation_at) : undefined,
    admissionDx: j(h.diagnoses, []),
    hea: String(consult?.history ?? '').trim() || String(admission?.subjective ?? '').trim(),
    meds: [...grouped.values()].sort((a, b) => a.start.localeCompare(b.start)),
    procedures: [
      ...notes.filter((n) => n.kind === 'procedure').map((n) => { const x = j<{ name: string; performedAt: string }>(n.data, { name: '', performedAt: String(n.at) }); return { name: x.name, at: x.performedAt } }),
      ...legacy.map((x) => ({ name: String(x.name), at: String(x.created_at) })),
    ].sort((a, b) => a.at.localeCompare(b.at)),
    evolution: d?.summary ?? '',
    dischargeDx: d?.diagnoses ?? [],
    labs: labs.map((l) => ({ id: String(l.id), title: String(l.title ?? l.name), at: String(l.taken_at ?? l.uploaded_at) })),
    labIds: [],
    condition: d?.condition || undefined,
    dischargeRx: j<PrescriptionItem[]>(rx?.items, []).map(medicationOrder),
    instructions: d?.instructions ?? '',
    followUp: d?.followUp || undefined,
    hidden: [],
  }
}

/** Lo obligatorio que falta para emitir (no se inventa: el médico lo escribe en la vista previa). */
export function missingForIssue(d: EpicrisisData) {
  return [
    !d.admissionDx.length && 'el diagnóstico de ingreso',
    !d.hea.trim() && 'la historia de la enfermedad actual',
    !d.evolution.trim() && 'la evolución',
    !d.instructions.trim() && !d.followUp?.trim() && 'las indicaciones al egreso',
  ].filter((x): x is string => !!x)
}

/** Crea el borrador de la epicrisis de una estancia egresada (versión siguiente si hubo otras). */
export async function createEpicrisisDraft(q: Sql, h: Row, userId: string, replacesId?: string, data?: EpicrisisData) {
  const last = await q.one<{ v: number }>('SELECT COALESCE(MAX(version), 0)::int AS v FROM epicrises WHERE hospitalization_id = ?', [String(h.id)])
  const id = randomUUID()
  await q.run(`INSERT INTO epicrises (id, clinic_id, hospitalization_id, patient_id, version, status, data, created_by, created_at, replaces_id) VALUES (?,?,?,?,?, 'draft', ?,?,?,?)`,
    [id, String(h.clinic_id), String(h.id), String(h.patient_id), Number(last?.v ?? 0) + 1, JSON.stringify(data ?? await buildEpicrisis(q, h)), userId, new Date().toISOString(), replacesId ?? null])
  return toEpicrisis((await q.one('SELECT * FROM epicrises WHERE id = ?', [id]))!)
}
