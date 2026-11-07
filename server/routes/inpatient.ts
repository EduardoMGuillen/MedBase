import { closeOpenVisits } from '../stayVisits.js'
import { nebulizationBody } from '../../src/lib/medExtras.js'
import { ANESTHESIA_TYPES, INFUSION_UNITS, NEB_MAX_COMPONENTS, SURGICAL_TEAM } from '../../src/lib/clinicalConfig.js'
import type { Express } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { type Ctx, diagnosisInput, fail, parse, type Row } from '../http.js'
import { nextFolio } from '../db.js'
import { assertGrace, saveVersion } from '../grace.js'
import { noteMedRows, noteOrderLocks, REMOVED_IN_GRACE } from '../correctionLocks.js'
import { rolesOf, toAttachment, toAuthorization, toBed, toDose, toEpicrisis, toHospitalization, toInpatientMed, toInpatientNote, toOrderMark, toProcedure, toReferral, toVitals } from '../mappers.js'
import { currentVitalsMode, frequencyFromOrders, sameVitalsMode, VITALS_FREQUENCIES, vitalsModeShort } from '../../src/lib/vitalsSheet.js'
import { buildEpicrisis, createEpicrisisDraft, missingForIssue } from '../epicrisis.js'
import { normalizeDni } from '../../src/lib/format.js'
import type { Sql } from '../sql.js'
import { activeIndications, attendingText, chainNote, courseDone, doseAt, indicationLines, isScheduled, LATE_AFTER_MIN, lineOrder, medLabel, twoDecimals } from '../../src/lib/inpatient.js'
import type { InpatientNote, OrderLine, VitalsSegment } from '../../src/lib/types.js'
import { VITALS_OTHER_RANGE } from '../../src/lib/clinicalConfig.js'
import { examLine, isPending } from '../../src/lib/exams.js'
import { hasBlank, medHasBlank } from '../../src/lib/orderSets.js'
import { can } from '../../src/lib/permissions.js'
import { consultRxRows, createMedOrders, findAdmissionConsult, syncStayOrders } from '../medOrders.js'
import { authorizationBase, ensureHospitalAuthorization, refreshPendingHospitalAuthorization } from '../authorizations.js'
import { rxValidityOf, specialtyOf, validityInput } from '../prefs.js'
import { currentMarks, docName } from './me.js'
import { addendaFor } from './notes.js'
import { examInput, examsWhere, insertExams } from './exams.js'

const dx = z.array(diagnosisInput)
const when = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'La fecha u hora no es válida.')
const ATTACH_META = 'id, patient_id, name, mime, size, category, uploaded_by, uploaded_at, title, taken_at, hospitalization_id'

/** MC6 (ronda 6): frecuencia de signos vitales que indica el médico. */
export const vitalsModeInput = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('shift') }),
  z.object({ mode: z.literal('hours'), hours: z.number().int().min(VITALS_OTHER_RANGE.min, 'Revisa las horas de los signos vitales.').max(VITALS_OTHER_RANGE.max, 'Revisa las horas de los signos vitales.') }),
  z.object({ mode: z.literal('none') }),
])

/**
 * MC6 (ronda 6): si la frecuencia cambia, se agrega un tramo desde ahora (las tomas futuras se recalculan desde la siguiente
 * hora aplicable; las pasadas no se tocan). Devuelve la etiqueta para la nota: Continúa, Nueva o Modificada.
 */
export async function applyVitalsPlan(q: Sql, h: Row, mode: z.infer<typeof vitalsModeInput>, by: string, at: string, noteId?: string, ctx: { notes: InpatientNote[]; consultOrders: string[] } = { notes: [], consultOrders: [] }) {
  const plan = (h.vitals_plan ? JSON.parse(String(h.vitals_plan)) : []) as VitalsSegment[]
  const hosp = toHospitalization(h)
  // La vigente: el plan; si la estancia es de antes, lo que ya ve enfermería (lo elegido en la hoja o lo escrito en las órdenes)
  const legacy = !plan.length && (hosp.vitalsEveryHours ?? frequencyFromOrders(ctx))
  const current = plan.length || legacy ? currentVitalsMode({ hospitalization: hosp, ...ctx }) : undefined
  if (current && sameVitalsMode(current, mode)) return 'continue' as const
  await q.run('UPDATE hospitalizations SET vitals_plan = ? WHERE id = ?', [JSON.stringify([...plan, { ...mode, from: at, by, noteId }]), String(h.id)])
  return current ? 'modified' as const : 'new' as const
}

/** Una toma de signos vitales (hoja de la estancia y, MC8 ronda 6, dentro de la nota del médico). */
const int = (max: number, label: string) => z.number({ error: `Revisa ${label}.` }).min(0, `Revisa ${label}.`).max(max, `Revisa ${label}.`).transform(Math.round).optional()
const dec = (max: number, label: string) => z.number({ error: `Revisa ${label}.` }).min(0, `Revisa ${label}.`).max(max, `Revisa ${label}.`).optional()
export const vitalsBody = z.object({
  takenAt: when.optional(),
  systolic: int(400, 'la presión sistólica'), diastolic: int(300, 'la presión diastólica'), heartRate: int(400, 'la frecuencia cardíaca'),
  // La temperatura se guarda con un decimal
  temperature: dec(50, 'la temperatura').transform((x) => (x == null ? x : Math.round(x * 10) / 10)), spo2: int(100, 'la saturación'),
  weightKg: dec(500, 'el peso'), heightCm: dec(300, 'la talla'), painScale: z.number().int().min(0).max(10).optional(),
  respRate: int(150, 'la frecuencia respiratoria'), glucose: dec(3000, 'la glucometría'), notes: z.string().trim().max(1000).optional(),
})

/** PQ1 y PQ2 (ronda 9): los datos propios de la nota postquirúrgica (al firmarla y al corregirla, GE4). */
export const postopInput = z.object({
  preDiagnoses: z.array(diagnosisInput).max(20).default([]),
  startAt: when, endAt: when,
  anesthesia: z.string().trim().min(1, 'Elige el tipo de anestesia.').max(60), anesthesiaOther: z.string().trim().max(120).optional(),
  procedureName: z.string().trim().min(3, 'Escribe el procedimiento realizado.').max(200),
  description: z.string().trim().min(10, 'Escribe la descripción del procedimiento.').max(10000),
  team: z.partialRecord(z.enum(SURGICAL_TEAM.map((t) => t.key) as [string, ...string[]]), z.object({ staffId: z.string().optional(), name: z.string().trim().max(120) })).default({}),
  authorizationId: z.string().optional(), urgent: z.boolean().default(false), justification: z.string().trim().max(1000).optional(),
})

/** Obligatorios de la nota postquirúrgica; el cierre no antes del inicio; ninguna hora en el futuro. */
export function checkPostop(diagnoses: unknown[], x: z.infer<typeof postopInput>) {
  if (!x.preDiagnoses.length) fail(400, 'Agrega el diagnóstico preoperatorio.')
  if (!diagnoses.length) fail(400, 'Agrega el diagnóstico postoperatorio.')
  if (x.anesthesia === 'Otra' && !x.anesthesiaOther) fail(400, 'Especifica el tipo de anestesia.')
  if (!ANESTHESIA_TYPES.includes(x.anesthesia)) fail(400, 'Elige un tipo de anestesia de la lista.')
  if (!x.team.surgeon?.name.trim()) fail(400, 'Escribe o elige al cirujano principal.')
  const start = new Date(x.startAt).getTime(); const end = new Date(x.endAt).getTime()
  if (start > Date.now() + 2 * 60_000 || end > Date.now() + 2 * 60_000) fail(400, 'La hora de inicio y la de cierre no pueden ser en el futuro.')
  if (end < start) fail(400, 'La hora de cierre no puede ser anterior a la de inicio.')
}

export const VITAL_FIELDS = ['systolic', 'diastolic', 'heartRate', 'temperature', 'spo2', 'weightKg', 'heightCm', 'painScale', 'respRate', 'glucose'] as const

/** Guarda una toma en la hoja de la estancia. `noteId`: la nota del médico donde se anotó (MC8). */
export async function insertVitals(q: Sql, h: Row, v: z.infer<typeof vitalsBody>, by: string, takenAt: string, recordedAt: string, id: string, noteId?: string) {
  await q.run(`INSERT INTO vitals (id, patient_id, taken_by, taken_at, systolic, diastolic, heart_rate, temperature, spo2, weight_kg, height_cm, pain_scale, notes, resp_rate, glucose,
      clinic_id, hospitalization_id, recorded_at, source_note_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, String(h.patient_id), by, takenAt, v.systolic ?? null, v.diastolic ?? null, v.heartRate ?? null, v.temperature ?? null, v.spo2 ?? null,
      v.weightKg ?? null, v.heightCm ?? null, v.painScale ?? null, v.notes || null, v.respRate ?? null, v.glucose ?? null, String(h.clinic_id), String(h.id), recordedAt, noteId ?? null])
}

const medInput = z.object({
  drug: z.string().trim().min(1, 'Escribe el medicamento.').max(120),
  presentation: z.string().trim().max(120).optional(),
  dose: z.string().trim().min(1, 'Escribe la dosis.').max(60),
  route: z.string().trim().min(1, 'Elige la vía.').max(40),
  everyHours: z.number().int().min(1).max(72).optional(),
  prn: z.boolean().default(false),
  // MC2 (ronda 6): un PRN lleva su condición
  prnCondition: z.string().trim().max(120).optional(),
  firstAt: when.optional(),
  instructions: z.string().trim().max(300).optional(),
  // Sin días: hasta nueva orden
  days: z.number().int().min(1).max(365).optional(),
  // "Cambiar" en la nota: la orden nueva reemplaza a esta, que queda suspendida
  replacesId: z.string().optional(),
  // ME1 (ronda 8): infusión con su velocidad (mL/h o mL/min; límites en clinicalConfig). ME2: primera dosis diferente
  infusionRate: z.number().positive('La velocidad de infusión debe ser mayor que 0.').optional(),
  infusionUnit: z.enum(['ml/h', 'ml/min']).optional(),
  loadingDose: z.string().trim().max(60).optional(),
  loadingStat: z.boolean().optional(),
  // ME10 (ronda 10): la clínica no lo tiene: sigue en la hoja y va a una receta (con lo que hay que comprar)
  buyOutside: z.boolean().optional(),
  buyQuantity: z.string().trim().max(60).optional(),
  // ME16 (ronda 16): cantidad total, como en la receta
  quantity: z.string().trim().max(80).optional(),
  // ME4 (ronda 9): nebulización (vía «Nebulización») con sus componentes y diluyente
  nebulization: z.object({ components: z.array(z.object({ drug: z.string().trim().min(1, 'Escribe el medicamento de la nebulización.').max(160), amount: z.string().trim().min(1, 'Escribe la cantidad de cada medicamento de la nebulización.').max(40) })).min(1).max(NEB_MAX_COMPONENTS, `Una nebulización lleva hasta ${NEB_MAX_COMPONENTS} medicamentos.`),
    diluentVolume: z.string().trim().max(40).optional(), diluent: z.string().trim().max(80).optional() }).optional(),
}).superRefine((m, ctx) => {
  if (m.nebulization && m.route !== 'Nebulización') ctx.addIssue({ code: 'custom', message: 'La nebulización va con la vía «Nebulización».' })
  if (m.nebulization && (m.infusionRate || m.loadingDose)) ctx.addIssue({ code: 'custom', message: 'Una nebulización no lleva infusión ni primera dosis distinta.' })
  if (m.infusionRate) {
    const unit = INFUSION_UNITS.find((u) => u.value === (m.infusionUnit ?? 'ml/h'))!
    if (!twoDecimals(m.infusionRate)) ctx.addIssue({ code: 'custom', message: `${m.drug}: la velocidad de infusión lleva hasta dos decimales.` })
    if (m.infusionRate > unit.max) ctx.addIssue({ code: 'custom', message: `${m.drug}: la velocidad de infusión no puede pasar de ${unit.max} ${unit.label}. Revísala.` })
  }
  if (m.infusionRate && (m.everyHours || m.prn)) ctx.addIssue({ code: 'custom', message: `${m.drug}: una infusión continua no lleva frecuencia ni PRN.` })
  if (m.loadingDose && (!m.everyHours || m.prn)) ctx.addIssue({ code: 'custom', message: `${m.drug}: la primera dosis distinta va con una frecuencia (cada tantas horas).` })
})

/**
 * HO2 (ronda 16): «Ingreso con órdenes pendientes» en SQL (alias `h` de hospitalizations): ingreso directo a hospitalización,
 * activo, sin consulta de origen ni observación previa y sin nota de ingreso. Es `admissionOrdersPending` (src/lib/inpatient.ts).
 */
export const ORDERS_PENDING_SQL = `(h.status = 'active' AND h.kind <> 'observation' AND h.consultation_id IS NULL AND h.observation_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM hosp_notes hn WHERE hn.hospitalization_id = h.id AND hn.kind = 'admission'))`

/**
 * Notas con órdenes que enfermería todavía no revisa, de los pacientes internados ahora. Alimenta el
 * contador del menú y la lista "Órdenes nuevas" del inicio de enfermería.
 */
export async function pendingOrders(sql: Sql, cid: string) {
  const notes = await sql.query(`SELECT n.id, n.hospitalization_id, n.author_id, n.at, n.data, h.patient_id, h.bed_id FROM hosp_notes n
    JOIN hospitalizations h ON h.id = n.hospitalization_id
    WHERE n.clinic_id = ? AND h.status = 'active' AND n.kind IN ('admission','evolution') AND n.data LIKE '%"checklist":true%'`, [cid])
  if (!notes.length) return []
  const marks = await sql.query(`SELECT note_id, order_index, action FROM order_marks WHERE clinic_id = ? AND note_id IN (${notes.map(() => '?').join(',')}) ORDER BY at, id`,
    [cid, ...notes.map((n) => String(n.id))])
  const state = new Map<string, string>()
  for (const m of marks) state.set(`${m.note_id}:${m.order_index}`, String(m.action))
  return notes.map((n) => {
    const orders = (JSON.parse(String(n.data)) as { orders?: string[] }).orders ?? []
    const pending = orders.filter((_, i) => state.get(`${n.id}:${i}`) !== 'check').length
    return { hospitalizationId: String(n.hospitalization_id), patientId: String(n.patient_id), bedId: n.bed_id ? String(n.bed_id) : undefined,
      noteId: String(n.id), authorId: String(n.author_id), at: String(n.at), pending }
  }).filter((x) => x.pending > 0).sort((a, b) => b.at.localeCompare(a.at))
}

/**
 * Hospitalización: camas por especialidad, ingreso, notas médicas SOAP con indicaciones de
 * medicamentos, hoja de medicamentos que enfermería va marcando, laboratorios, procedimientos y egreso.
 * Cualquier médico o enfermera de la clínica ve a los hospitalizados: de noche los atiende quien esté de turno.
 */
/** OB1 (ronda 5): cómo se registra cada resultado de una dosis en la bitácora. */
const DOSE_VERB = { given: 'Administró', skipped: 'Marcó como no aplicada', omitted: 'Marcó como omitida' } as const
const DOSE_STATE = { given: 'administrada', skipped: 'no aplicada', omitted: 'omitida' } as const


/** NE4 (ronda 8): diagnósticos vigentes de la estancia: los de la última nota que los tenga o, si no, los del ingreso. */
async function currentDxOf(q: Sql, h: Row): Promise<{ code: string; label: string }[]> {
  for (const r of await q.query(`SELECT data FROM hosp_notes WHERE hospitalization_id = ? AND kind IN ('admission','evolution') ORDER BY at DESC`, [String(h.id)])) {
    try { const dx = JSON.parse(String(r.data ?? '{}')).diagnoses; if (Array.isArray(dx) && dx.length) return dx } catch { /* nota sin datos */ }
  }
  try { return JSON.parse(String(h.diagnoses ?? '[]')) } catch { return [] }
}

export function registerInpatient(app: Express, ctx: Ctx) {
  const { sql, auth, need, userOf, clinicOf, audit, patientRow, patientName, assertRxIdentity, staffRow } = ctx

  const hospRow = async (cid: string, id: string) =>
    (await sql.one('SELECT * FROM hospitalizations WHERE id = ? AND clinic_id = ?', [id, cid])) ?? fail(404, 'La hospitalización no existe.')
  const activeHosp = async (cid: string, id: string) => {
    const h = (await hospRow(cid, id))!
    if (h.status !== 'active') fail(409, 'Este paciente ya fue dado de alta; el expediente de hospitalización está cerrado.')
    return h
  }
  const bedName = (b: Row) => `cama ${b.room}${b.label ? `-${b.label}` : ''}`
  /** HO2 (ronda 16): los médicos tratantes: personal activo de la clínica con el rol de médico, en el orden elegido. */
  const attendingRows = async (cid: string, ids: string[]) => {
    const rows = await sql.query(`SELECT * FROM staff WHERE clinic_id = ? AND id IN (${ids.map(() => '?').join(',')})`, [cid, ...ids])
    return ids.map((x) => {
      const r = rows.find((y) => String(y.id) === x)
      if (!r || !r.active || !rolesOf(r).includes('doctor')) fail(400, 'El médico tratante debe ser un médico activo de la clínica.')
      return r!
    })
  }
  /** Un consultorio no tiene camas ni hospitalización (sí observación, si la usa). */
  const assertHospital = async (cid: string) => {
    if ((await sql.one('SELECT kind FROM clinics WHERE id = ?', [cid]))?.kind === 'office') fail(409, 'Un consultorio no tiene hospitalización ni camas.')
  }

  /** Las órdenes de las notas de hospitalización se revisan una por una (en observación, sólo si la clínica lo activa). */
  async function checklistFor(h: Row) {
    if (h.kind !== 'observation') return true
    return Boolean((await sql.one('SELECT obs_order_checklist FROM clinics WHERE id = ?', [String(h.clinic_id)]))?.obs_order_checklist)
  }

  /**
   * Los medicamentos que indica una nota pasan a la hoja por el mismo camino que los de la consulta externa
   * (`createMedOrders`); los que la nota omite o cambia quedan suspendidos con su motivo, sin borrarse.
   */
  async function applyMeds(q: Sql, h: Row, noteId: string, userId: string, at: string, meds: z.infer<typeof medInput>[], stop: string[]) {
    const cid = String(h.clinic_id)
    const hospId = String(h.id)
    for (const id of [...meds.flatMap((m) => (m.replacesId ? [m.replacesId] : [])), ...stop]) {
      const m = await q.one('SELECT * FROM hosp_meds WHERE id = ? AND hospitalization_id = ? AND clinic_id = ?', [id, hospId, cid])
      if (!m) fail(400, 'El medicamento que quieres omitir no pertenece a este paciente.')
      if (m!.stopped_at) continue
      const replaced = meds.find((x) => x.replacesId === id)
      await q.run('UPDATE hosp_meds SET stopped_at = ?, stopped_by = ?, stop_reason = ? WHERE id = ?',
        [at, userId, replaced ? `Cambiado en nota médica por ${medLabel({ ...replaced, everyHours: replaced.everyHours, prn: replaced.prn })}` : 'Omitido en nota médica', id])
    }
    return createMedOrders(q, {
      clinicId: cid, hospitalizationId: hospId, patientId: String(h.patient_id), source: 'note', sourceId: noteId, orderedBy: userId, orderedAt: at,
      items: meds.map((m) => ({ ...m, firstAt: m.firstAt ?? at })),
    })
  }

  // ---------- Camas (las configura administración) ----------
  // AD3: la cama no tiene especialidad: está libre, ocupada (según las estancias) o fuera de servicio (active = false)
  const bedBody = z.object({
    room: z.string().trim().min(1, 'Escribe el número de cuarto.').max(20),
    label: z.string().trim().max(10).default(''),
    active: z.boolean().default(true),
    outOfServiceNote: z.string().trim().max(200).optional(),
  })

  app.post('/api/beds', auth, need('settings.manage'), async (req, res) => {
    const b = parse(bedBody, req.body)
    const cid = clinicOf(req)
    await assertHospital(cid)
    if (await sql.one('SELECT 1 FROM beds WHERE clinic_id = ? AND room = ? AND label = ?', [cid, b.room, b.label])) fail(409, 'Ya existe esa cama en ese cuarto.')
    const id = randomUUID()
    await sql.run('INSERT INTO beds (id, clinic_id, room, label, active) VALUES (?,?,?,?,?)', [id, cid, b.room, b.label, b.active])
    await audit(userOf(req), `Agregó la ${bedName(b)}`)
    res.status(201).json(toBed((await sql.one('SELECT * FROM beds WHERE id = ?', [id]))!))
  })

  app.patch('/api/beds/:id', auth, need('settings.manage'), async (req, res) => {
    const cid = clinicOf(req)
    await assertHospital(cid)
    const row = (await sql.one('SELECT * FROM beds WHERE id = ? AND clinic_id = ?', [String(req.params.id), cid])) ?? fail(404, 'La cama no existe.')
    const b = parse(bedBody.partial(), req.body)
    if (b.active === false && await sql.one(`SELECT 1 FROM hospitalizations WHERE bed_id = ? AND status = 'active'`, [String(row!.id)])) {
      fail(409, 'La cama tiene un paciente hospitalizado. Trasládalo o dale de alta antes de ponerla fuera de servicio.')
    }
    const room = b.room ?? String(row!.room)
    const label = b.label ?? String(row!.label)
    if ((room !== row!.room || label !== row!.label) && await sql.one('SELECT 1 FROM beds WHERE clinic_id = ? AND room = ? AND label = ? AND id <> ?', [cid, room, label, String(row!.id)])) {
      fail(409, 'Ya existe esa cama en ese cuarto.')
    }
    const active = b.active ?? Boolean(row!.active)
    await sql.run('UPDATE beds SET room = ?, label = ?, active = ?, out_of_service_note = ? WHERE id = ?',
      [room, label, active, active ? null : b.outOfServiceNote ?? row!.out_of_service_note ?? null, String(row!.id)])
    const what = b.active === false ? `Puso fuera de servicio la ${bedName(row!)}${b.outOfServiceNote ? ` (${b.outOfServiceNote})` : ''}`
      : b.active === true && !row!.active ? `Volvió a poner en servicio la ${bedName(row!)}`
        : `Renombró la ${bedName(row!)} a ${bedName({ room, label })}`
    await audit(userOf(req), what)
    res.json(toBed((await sql.one('SELECT * FROM beds WHERE id = ?', [String(row!.id)]))!))
  })

  // ---------- Ingreso ----------
  // HO2 (ronda 16): ingresan el médico y también recepción y administración (`inpatient.admit`). Quien no es médico elige
  // obligatoriamente al médico tratante y puede dejar el diagnóstico para la nota de ingreso. El ingreso directo queda «con
  // órdenes pendientes» hasta que se firma la nota de ingreso.
  app.post('/api/inpatient', auth, need('inpatient.admit'), async (req, res) => {
    const doctor = can(userOf(req), 'inpatient.orders')
    const b = parse(z.object({
      patientId: z.string().min(1, 'Elige al paciente.'),
      bedId: z.string().min(1, 'Elige la cama.'),
      admittedAt: when.optional(),
      reason: z.string().trim().min(3, 'Escribe el motivo del ingreso.').max(1000),
      diagnoses: doctor ? dx.min(1, 'Agrega al menos un diagnóstico de ingreso.') : dx.default([]),
      // HO2: médico(s) tratante(s), el primero es el principal. Si ingresa un médico y no elige, es él mismo
      attendingIds: z.array(z.string().min(1)).max(5, 'Hasta 5 médicos tratantes.').default([]),
      consultationId: z.string().optional(),
      companionName: z.string().trim().max(100).optional(),
      companionRelation: z.string().trim().max(40).optional(),
      companionPhone: z.string().trim().max(30).optional(),
      patientPhone: z.string().trim().max(30).optional(),
      // AD3: la especialidad del ingreso; si no llega, la del médico que ingresa
      specialty: z.string().trim().max(60).optional(),
    }), req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    await assertHospital(cid)
    ;(await patientRow(cid, b.patientId)) ?? fail(404, 'El paciente no existe.')
    const attendingIds = [...new Set(b.attendingIds.length ? b.attendingIds : doctor ? [user.id] : [])]
    if (!attendingIds.length) fail(400, 'Elige al médico tratante.')
    const attending = await attendingRows(cid, attendingIds)
    // Sin especialidad elegida: la del médico que ingresa o, si ingresa recepción, la del médico tratante principal
    const specialty = b.specialty || (doctor ? specialtyOf(user) : specialtyOf({ specialty: attending[0].specialty ? String(attending[0].specialty) : undefined }))
    const bed = await sql.one('SELECT * FROM beds WHERE id = ? AND clinic_id = ? AND active', [b.bedId, cid])
    if (!bed) fail(400, 'La cama elegida no existe o está desactivada.')
    if (b.consultationId && !(await sql.one('SELECT 1 FROM consultations WHERE id = ? AND patient_id = ? AND clinic_id = ?', [b.consultationId, b.patientId, cid]))) {
      fail(400, 'La consulta no corresponde a este paciente.')
    }
    const admittedAt = new Date(b.admittedAt ?? Date.now())
    if (admittedAt.getTime() > Date.now() + 5 * 60_000) fail(400, 'La hora de ingreso no puede ser en el futuro.')
    const id = randomUUID()
    // Fuera de la transacción: con una sola conexión, consultar por fuera de ella la bloquearía
    const name = await patientName(b.patientId)
    // Un ingreso hecho a mano (o rehecho porque el primero estaba mal) se vincula a la consulta externa que lo
    // indicó y jala sus órdenes y medicamentos
    const consultationId = b.consultationId ?? await findAdmissionConsult(sql, cid, b.patientId)
    let medOrders = 0
    let authorizationId: string | undefined
    await sql.tx(async (q) => {
      // El candado evita que dos médicos ocupen la misma cama al mismo tiempo
      await q.run('SELECT pg_advisory_xact_lock(hashtext(?))', [`beds:${cid}`])
      if (await q.one(`SELECT 1 FROM hospitalizations WHERE bed_id = ? AND status = 'active'`, [b.bedId])) fail(409, 'Esa cama ya está ocupada. Elige otra.')
      if (await q.one(`SELECT 1 FROM hospitalizations WHERE patient_id = ? AND status = 'active'`, [b.patientId])) fail(409, 'Este paciente ya está hospitalizado.')
      await q.run(`INSERT INTO hospitalizations (id, clinic_id, patient_id, bed_id, consultation_id, admitted_at, admitted_by, reason, diagnoses, companion_name, companion_relation,
          companion_phone, patient_phone, status, specialty, attending_ids) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?)`,
        [id, cid, b.patientId, b.bedId, consultationId ?? null, admittedAt.toISOString(), user.id, b.reason, JSON.stringify(b.diagnoses),
          b.companionName || null, b.companionRelation || null, b.companionPhone || null, b.patientPhone || null, specialty, JSON.stringify(attendingIds)])
      medOrders = await syncStayOrders(q, { clinicId: cid, hospitalizationId: id })
      // Ronda 8: internado, deja la consulta externa (sus citas abiertas de hoy se cancelan)
      await closeOpenVisits(q, cid, b.patientId, admittedAt)
      authorizationId = (await ensureHospitalAuthorization(q, (await q.one('SELECT * FROM hospitalizations WHERE id = ?', [id]))!, user)).authorization.id
      // HO2 (ronda 16): queda quién ingresó (y con qué rol), el médico tratante y si quedó con órdenes pendientes
      const who = attendingText(attendingIds, (x) => attending.find((r) => String(r.id) === x)?.name as string | undefined)
      await audit(user, `Ingresó a ${name} en la ${bedName(bed!)} (${specialty})${consultationId && !b.consultationId ? ', vinculado a su consulta externa' : ''}${medOrders ? ` con ${medOrders} medicamento(s) de la consulta` : ''}`
        + `; médico tratante: ${who}${doctor ? '' : ` (ingreso por ${user.role === 'admin' ? 'administración' : 'recepción'}${b.diagnoses.length ? '' : ', sin diagnóstico'})`}${consultationId ? '' : '; ingreso con órdenes pendientes hasta la nota de ingreso'}`, q)
    })
    res.status(201).json({ ...toHospitalization((await hospRow(cid, id))!), medOrders, authorizationId })
  })

  /**
   * Pasar de observación a hospitalización: la misma estancia recibe cama. Notas, medicamentos, laboratorios
   * y autorizaciones se quedan donde están, en orden y con su autoría; se guarda cuándo estuvo en observación.
   */
  app.post('/api/inpatient/:id/convert', auth, need('inpatient.orders'), async (req, res) => {
    const b = parse(z.object({
      bedId: z.string().min(1, 'Elige la cama.'),
      reason: z.string().trim().max(1000).optional(),
      companionName: z.string().trim().max(100).optional(),
      companionRelation: z.string().trim().max(40).optional(),
      companionPhone: z.string().trim().max(30).optional(),
      patientPhone: z.string().trim().max(30).optional(),
      specialty: z.string().trim().max(60).optional(),
    }), req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    await assertHospital(cid)
    const h = await activeHosp(cid, String(req.params.id))
    if (h.kind !== 'observation') fail(409, 'Este paciente ya está hospitalizado.')
    const specialty = b.specialty || specialtyOf(user)
    const bed = await sql.one('SELECT * FROM beds WHERE id = ? AND clinic_id = ? AND active', [b.bedId, cid])
    if (!bed) fail(400, 'La cama elegida no existe o está desactivada.')
    const name = await patientName(String(h.patient_id))
    const now = new Date().toISOString()
    let medOrders = 0
    await sql.tx(async (q) => {
      await q.run('SELECT pg_advisory_xact_lock(hashtext(?))', [`beds:${cid}`])
      if (await q.one(`SELECT 1 FROM hospitalizations WHERE bed_id = ? AND status = 'active'`, [b.bedId])) fail(409, 'Esa cama ya está ocupada. Elige otra.')
      await q.run(`UPDATE hospitalizations SET kind = 'hospital', bed_id = ?, observation_at = admitted_at, admitted_at = ?, converted_at = ?, converted_by = ?,
          reason = COALESCE(?, reason), companion_name = COALESCE(?, companion_name), companion_relation = COALESCE(?, companion_relation),
          companion_phone = COALESCE(?, companion_phone), patient_phone = COALESCE(?, patient_phone), specialty = ? WHERE id = ?`,
        [b.bedId, now, now, user.id, b.reason || null, b.companionName || null, b.companionRelation || null, b.companionPhone || null, b.patientPhone || null, specialty, String(h.id)])
      // Las órdenes de la observación siguen (misma estancia, mismas dosis). Se completan las que falten de la
      // consulta de origen: ya es una hospitalización, así que pasan todos sus medicamentos.
      medOrders = await syncStayOrders(q, { clinicId: cid, hospitalizationId: String(h.id), firstNotBefore: now })
      // Al hospitalizarlo se genera la autorización de hospitalización (la observación no la lleva)
      await ensureHospitalAuthorization(q, (await q.one('SELECT * FROM hospitalizations WHERE id = ?', [String(h.id)]))!, user)
      await audit(user, `Pasó a ${name} de observación a hospitalización (${specialty}) en la ${bedName(bed!)}${medOrders ? `; ${medOrders} medicamento(s) de la consulta a la hoja` : ''}`, q)
    })
    res.json({ ...toHospitalization((await hospRow(cid, String(h.id)))!), medOrders })
  })

  /**
   * Editar datos generales de la estancia: cama (en hospitalización), acompañante y teléfonos. El ingreso en sí
   * (nota de ingreso, diagnósticos, órdenes, medicamentos, fecha y hora) no se corrige: un error clínico se
   * corrige con una nota u orden nueva, como en papel. Cada cambio queda en la bitácora con el valor anterior y
   * el nuevo. Si hay una autorización de hospitalización pendiente de firma, se actualiza; la firmada no.
   * Los datos del paciente (nombre, identidad, etc.) se editan en su expediente (PATCH /api/patients/:id).
   */
  app.patch('/api/inpatient/:id', auth, need('inpatient.orders', 'inpatient.care'), async (req, res) => {
    const b = parse(z.object({
      bedId: z.string().min(1, 'Elige la cama.').optional(),
      companionName: z.string().trim().max(100).optional(),
      companionRelation: z.string().trim().max(40).optional(),
      companionPhone: z.string().trim().max(30).optional(),
      patientPhone: z.string().trim().max(30).optional(),
      specialty: z.string().trim().min(2).max(60).optional(),
      // HO2 (ronda 16): médico(s) tratante(s); los cambia un médico
      attendingIds: z.array(z.string().min(1)).min(1, 'Elige al médico tratante.').max(5, 'Hasta 5 médicos tratantes.').optional(),
    }).strict(), req.body, 'Sólo se editan los datos generales: cama, especialidad, médico tratante, acompañante y teléfonos.')
    const user = userOf(req)
    const cid = clinicOf(req)
    const h = await activeHosp(cid, String(req.params.id))
    if (b.attendingIds && !can(user, 'inpatient.orders')) fail(403, 'El médico tratante lo cambia un médico.')
    const prevAttending = toHospitalization(h).attendingIds ?? [String(h.admitted_by)]
    const nextAttending = b.attendingIds ? [...new Set(b.attendingIds)] : undefined
    const attendingChanged = !!nextAttending && JSON.stringify(nextAttending) !== JSON.stringify(prevAttending)
    const names = attendingChanged ? await attendingRows(cid, nextAttending!) : []
    const nameOf = async (x: string) => String((await sql.one('SELECT name FROM staff WHERE id = ?', [x]))?.name ?? '')
    if (b.bedId && h.kind === 'observation') fail(409, 'En observación no se asigna cama. Usa «Pasar a hospitalización».')
    const bed = b.bedId ? await sql.one('SELECT * FROM beds WHERE id = ? AND clinic_id = ? AND active', [b.bedId, cid]) : undefined
    if (b.bedId && !bed) fail(400, 'La cama elegida no existe o está desactivada.')
    const name = await patientName(String(h.patient_id))
    const cols = { bedId: 'bed_id', specialty: 'specialty', companionName: 'companion_name', companionRelation: 'companion_relation', companionPhone: 'companion_phone', patientPhone: 'patient_phone' } as const
    const labels = { bedId: 'cama', specialty: 'especialidad del ingreso', companionName: 'acompañante', companionRelation: 'parentesco del acompañante', companionPhone: 'teléfono del acompañante', patientPhone: 'teléfono del paciente' }
    const bedText = async (id: unknown) => { const x = id ? await sql.one('SELECT room, label FROM beds WHERE id = ?', [String(id)]) : undefined; return x ? bedName(x) : 'sin cama' }
    const changes: string[] = []
    for (const k of Object.keys(cols) as (keyof typeof cols)[]) {
      const next = b[k]
      if (next === undefined || (next || null) === (h[cols[k]] ?? null)) continue
      const before = k === 'bedId' ? await bedText(h.bed_id) : h[cols[k]] ? `"${h[cols[k]]}"` : 'vacío'
      const after = k === 'bedId' ? await bedText(next) : next ? `"${next}"` : 'vacío'
      changes.push(`${labels[k]}: ${before} → ${after}`)
    }
    if (attendingChanged) {
      const before: string[] = []
      for (const x of prevAttending) before.push(await nameOf(x))
      changes.push(`médico tratante: ${attendingText(prevAttending, (x) => before[prevAttending.indexOf(x)] || undefined)} → ${attendingText(nextAttending!, (x) => names.find((r) => String(r.id) === x)?.name as string | undefined)}`)
    }
    await sql.tx(async (q) => {
      if (attendingChanged) await q.run('UPDATE hospitalizations SET attending_ids = ? WHERE id = ?', [JSON.stringify(nextAttending), String(h.id)])
      if (b.bedId && b.bedId !== h.bed_id) {
        await q.run('SELECT pg_advisory_xact_lock(hashtext(?))', [`beds:${cid}`])
        if (await q.one(`SELECT 1 FROM hospitalizations WHERE bed_id = ? AND status = 'active' AND id <> ?`, [b.bedId, String(h.id)])) fail(409, 'Esa cama ya está ocupada. Elige otra.')
      }
      // Lo que llega vacío se borra (p. ej. un teléfono equivocado); lo que no llega no se toca
      const v = (k: keyof typeof cols) => (b[k] === undefined ? h[cols[k]] ?? null : b[k] || null)
      await q.run(`UPDATE hospitalizations SET bed_id = ?, specialty = ?, companion_name = ?, companion_relation = ?, companion_phone = ?, patient_phone = ? WHERE id = ?`,
        [v('bedId'), v('specialty'), v('companionName'), v('companionRelation'), v('companionPhone'), v('patientPhone'), String(h.id)])
      await refreshPendingHospitalAuthorization(q, (await q.one('SELECT * FROM hospitalizations WHERE id = ?', [String(h.id)]))!)
      if (changes.length) await audit(user, `Editó los datos generales de la estancia de ${name}: ${changes.join('; ')}`, q)
    })
    res.json(toHospitalization((await hospRow(cid, String(h.id)))!))
  })

  // ---------- Expediente de hospitalización ----------
  /** MC7 (ronda 6): las indicaciones (no medicamentos) de la consulta que ingresó al paciente. */
  async function consultIndications(h: Row): Promise<string[]> {
    if (!h.consultation_id) return []
    const c = await sql.one('SELECT indications, orders FROM consultations WHERE id = ?', [String(h.consultation_id)])
    if (!c) return []
    if (c.indications != null) return JSON.parse(String(c.indications)) as string[]
    // Consultas de antes: las órdenes que no son medicamento de la hoja
    const drugs = (await sql.query('SELECT drug FROM hosp_meds WHERE hospitalization_id = ?', [String(h.id)])).map((r) => String(r.drug).toLowerCase())
    return (JSON.parse(String(c.orders ?? '[]')) as string[]).filter((o) => !drugs.some((d) => o.toLowerCase().startsWith(d)))
  }

  /** MC7: lo que la nota nueva necesita de la estancia para armar la cadena (notas, medicamentos, consulta de ingreso). */
  async function chainOf(h: Row) {
    const [notes, meds] = await Promise.all([
      sql.query('SELECT * FROM hosp_notes WHERE hospitalization_id = ? ORDER BY at, id', [String(h.id)]),
      sql.query('SELECT * FROM hosp_meds WHERE hospitalization_id = ? ORDER BY ordered_at, id', [String(h.id)]),
    ])
    const file = { hospitalization: toHospitalization(h), notes: notes.map(toInpatientNote), meds: meds.map(toInpatientMed), consultIndications: await consultIndications(h) }
    return { file, last: chainNote(file), active: activeIndications(file) }
  }

  /** Expediente completo de una estancia (lo que ve la pantalla). */
  async function fileOf(cid: string, h: Row) {
    const id = String(h.id)
    const [notes, meds, doses, procedures, labs, marks, auths, referrals, epicrises, vitals] = await Promise.all([
      sql.query('SELECT * FROM hosp_notes WHERE hospitalization_id = ? ORDER BY at, id', [id]),
      sql.query('SELECT * FROM hosp_meds WHERE hospitalization_id = ? ORDER BY ordered_at, id', [id]),
      sql.query('SELECT d.* FROM hosp_doses d JOIN hosp_meds m ON m.id = d.med_id WHERE m.hospitalization_id = ? ORDER BY d.given_at', [id]),
      sql.query('SELECT * FROM hosp_procedures WHERE hospitalization_id = ? ORDER BY created_at', [id]),
      sql.query(`SELECT ${ATTACH_META} FROM attachments WHERE clinic_id = ? AND patient_id = ? AND category = 'lab' AND (hospitalization_id = ? OR (taken_at >= ? AND taken_at <= ?))
        ORDER BY COALESCE(taken_at, uploaded_at) DESC`, [cid, String(h.patient_id), id, String(h.admitted_at), String(h.discharged_at ?? '9999')]),
      sql.query('SELECT * FROM order_marks WHERE hospitalization_id = ? ORDER BY at, id', [id]),
      // Las archivadas ("No aplica" de observación, v26) no se muestran ni se cuentan
      sql.query('SELECT a.*, t.mime AS file_mime FROM authorizations a LEFT JOIN attachments t ON t.id = a.file_id WHERE a.hospitalization_id = ? AND a.archived_at IS NULL ORDER BY a.created_at', [id]),
      sql.query('SELECT * FROM referrals WHERE hospitalization_id = ? ORDER BY issued_at', [id]),
      sql.query('SELECT * FROM epicrises WHERE hospitalization_id = ? ORDER BY version', [id]),
      // Hoja de signos vitales: la preclínica de la consulta que lo ingresó es la primera toma; luego las de la estancia
      sql.query(`SELECT v.*, CASE WHEN v.hospitalization_id IS NULL THEN 'preclinic' WHEN v.source_note_id IS NOT NULL THEN 'note' ELSE 'stay' END AS source FROM vitals v
        WHERE v.hospitalization_id = ? OR v.id = (SELECT c.vitals_id FROM consultations c WHERE c.id = ?) ORDER BY v.taken_at, v.id`, [id, String(h.consultation_id ?? '')]),
    ])
    return {
      hospitalization: toHospitalization(h), notes: notes.map(toInpatientNote), meds: meds.map(toInpatientMed), doses: doses.map(toDose),
      procedures: procedures.map(toProcedure), labs: labs.map(toAttachment), marks: marks.map(toOrderMark), authorizations: auths.map(toAuthorization),
      referrals: referrals.map(toReferral), epicrises: epicrises.map(toEpicrisis),
      vitals: vitals.map((v) => ({ ...toVitals(v), source: v.source as 'preclinic' | 'stay' | 'note', sourceNoteId: v.source_note_id ? String(v.source_note_id) : undefined })),
      consultOrders: h.consultation_id ? JSON.parse(String((await sql.one('SELECT orders FROM consultations WHERE id = ?', [String(h.consultation_id)]))?.orders ?? '[]')) as string[] : [],
      // MC7 (ronda 6): las indicaciones de la consulta de ingreso empiezan la cadena
      consultIndications: await consultIndications(h),
      // AN1: adendas de las notas y de la consulta que lo ingresó
      addenda: await addendaFor(sql, cid, [...notes.map((n) => String(n.id)), ...(h.consultation_id ? [String(h.consultation_id)] : [])]),
      // ME14 (ronda 14): lo que la consulta de ingreso indicó para la receta y no está en la hoja («Generar receta», «Receta»)
      consultRxMeds: (await consultRxRows(sql, h)).map(toInpatientMed),
      // EX1: exámenes de la estancia (y los que pidió la consulta que lo ingresó)
      exams: await examsWhere(sql, 'clinic_id = ? AND (hospitalization_id = ? OR (consultation_id IS NOT NULL AND consultation_id = ?))', [cid, id, String(h.consultation_id ?? '')]),
    }
  }

  /**
   * EN2: los expedientes de todos los internados y en observación, para la lista de pendientes por paciente del
   * inicio de enfermería (las alertas se calculan en la pantalla con las mismas reglas del expediente). Va antes
   * de /api/inpatient/:id. No es una consulta de expediente: no queda en la bitácora por paciente.
   */
  app.get('/api/inpatient/alerts', auth, need('inpatient.view'), async (req, res) => {
    const cid = clinicOf(req)
    const stays = await sql.query(`SELECT * FROM hospitalizations WHERE clinic_id = ? AND status = 'active' ORDER BY admitted_at`, [cid])
    const out = []
    for (const h of stays) {
      const f = await fileOf(cid, h)
      // Sólo lo que usan las alertas
      out.push({ hospitalization: f.hospitalization, notes: f.notes, marks: f.marks, meds: f.meds, doses: f.doses, vitals: f.vitals, consultOrders: f.consultOrders, authorizations: f.authorizations, exams: f.exams })
    }
    res.json(out)
  })

  app.get('/api/inpatient/:id', auth, need('inpatient.view'), async (req, res) => {
    const cid = clinicOf(req)
    const h = (await hospRow(cid, String(req.params.id)))!
    const file = await fileOf(cid, h)
    await audit(userOf(req), `Consultó el expediente de hospitalización de ${await patientName(String(h.patient_id))}`)
    res.json(file)
  })

  // Nota de ingreso o de evolución (SOAP). Sus indicaciones de medicamentos van a la hoja de enfermería.
  app.post('/api/inpatient/:id/notes', auth, need('inpatient.orders', 'inpatient.notes'), async (req, res) => {
    const text = z.string().trim().max(6000).default('')
    const b = parse(z.object({
      kind: z.enum(['admission', 'evolution']),
      // Dos formatos: Estándar (diagnóstico, examen físico y observaciones) o SOAP. El de cada médico se elige en Mi configuración
      format: z.enum(['soap', 'dx', 'postop']).default('soap'),
      // PQ1 y PQ2 (ronda 9): nota postquirúrgica
      postop: postopInput.optional(),
      subjective: text, objective: text, assessment: text, plan: text,
      diagnoses: z.array(diagnosisInput).max(20).default([]),
      exam: text, observations: text,
      // Ronda 8: Estándar: el cuadro de evolución, entre los diagnósticos y el examen físico
      evolution: text,
      // NO2 (ronda 16): la nota de ingreso estándar es la de la consulta externa: motivo de consulta e historia de la enfermedad actual
      chiefComplaint: z.string().trim().max(1000).default(''), history: text,
      meds: z.array(medInput).max(20).default([]),
      stopMedIds: z.array(z.string()).max(30).default([]),
      orders: z.array(z.string().trim().min(1).max(500)).max(40).default([]),
      // Las primeras `indicationCount` órdenes son indicaciones (columna derecha); el resto, medicamentos
      indicationCount: z.number().int().min(0).max(40).optional(),
      // EX1: exámenes pedidos en la nota (van a la sección Exámenes, no como texto en las órdenes)
      exams: z.array(examInput).max(40).default([]),
      // MC7 (ronda 6): la cadena. `basedOn` es la última nota firmada que vio el médico al abrir; `decisions`, qué hizo con
      // cada indicación que bajó. Con `chain`, `orders` trae sólo las indicaciones nuevas.
      // MC6 (ronda 6): frecuencia de signos vitales indicada en la nota
      vitals: vitalsModeInput.optional(),
      // MC8 (ronda 6): signos vitales tomados por el médico (opcional): quedan como una toma de la hoja
      vitalsTaken: vitalsBody.optional(),
      chain: z.object({ basedOn: z.string().nullable(), decisions: z.array(z.object({ id: z.string(), action: z.enum(['continue', 'omit', 'change']), text: z.string().trim().max(500).optional() })).max(60) }).optional(),
      // Identificador que genera el formulario al abrirse: si la misma nota llega dos veces (doble clic, reintento),
      // se devuelve la que ya se guardó y no se duplican ni la nota ni sus órdenes de medicamento
      clientId: z.string().uuid().optional(),
    }), req.body)
    // IM2 (ronda 12): quien solo escribe notas (el radiólogo) no ingresa, no indica medicamentos ni cambia las indicaciones
    if (!can(userOf(req), 'inpatient.orders')) {
      if (b.kind !== 'evolution') fail(403, 'La nota de ingreso la escribe el médico tratante.')
      if (b.meds.length || b.stopMedIds.length || b.orders.length || b.exams.length || b.vitals || b.chain?.decisions.length) fail(403, 'Tu nota no lleva indicaciones, medicamentos ni exámenes: los indica el médico tratante.')
      b.chain = undefined
    }
    // SOAP: los cuatro campos, como siempre. Estándar: al menos un campo, una indicación o un medicamento.
    if (b.format === 'soap') {
      const empty = ([['subjective', 'el subjetivo (S)'], ['objective', 'el objetivo (O)'], ['assessment', 'el análisis (A)'], ['plan', 'el plan (P)']] as const).find(([k]) => !b[k])
      if (empty) fail(400, `Escribe ${empty[1]}.`)
    } else if (b.kind === 'admission') {
      // NO2 (ronda 16): por defecto, el formato estándar de la consulta externa; pide lo mismo que la consulta: el motivo y la
      // impresión diagnóstica (antes la nota de ingreso solo se escribía en SOAP)
      if (b.format !== 'dx') fail(400, 'La nota de ingreso se escribe en formato estándar o SOAP.')
      if (!b.chiefComplaint) fail(400, 'Escribe el motivo de consulta.')
      if (!b.diagnoses.length) fail(400, 'Agrega al menos un diagnóstico en la impresión diagnóstica.')
    } else if (b.format === 'postop') {
      // PQ1 (ronda 9): obligatorios; el cierre no antes del inicio; ninguna hora en el futuro
      checkPostop(b.diagnoses, b.postop ?? fail(400, 'Faltan los datos de la nota postquirúrgica.'))
    } else if (!b.diagnoses.length && !b.evolution && !b.exam && !b.observations && !b.orders.length && !b.meds.length && !b.exams.length) {
      fail(400, 'Escribe al menos un diagnóstico, el examen físico, una observación, una indicación o un medicamento.')
    }
    // Un set de órdenes puede traer espacios "___": se llenan antes de guardar la nota
    if (b.orders.some(hasBlank) || b.meds.some(medHasBlank)) fail(400, 'Completa los espacios ___ de las órdenes antes de guardar la nota.')
    const user = userOf(req)
    const cid = clinicOf(req)
    const h = await activeHosp(cid, String(req.params.id))
    // PQ1 (ronda 9): toda nota postquirúrgica es un procedimiento mayor: la misma regla que tenía la casilla de la nota de
    // procedimiento: autorización quirúrgica firmada (la elegida o una de las 24 horas antes del inicio) o urgencia justificada
    let postopAuth: { authorizationId?: string; urgent?: boolean; justification?: string } | undefined
    if (b.format === 'postop') {
      const x = b.postop!
      const start = new Date(x.startAt)
      const hasAuth = x.authorizationId ? await authorizationFor(String(h.id), x.authorizationId) : await signedAuthorization(String(h.id), start)
      if (!hasAuth && !(x.urgent && (x.justification ?? '').length >= 10)) {
        fail(409, 'No hay autorización firmada registrada para este procedimiento. Regístrala o marca "Urgencia, sin autorización previa" con la justificación.')
      }
      postopAuth = { authorizationId: x.authorizationId, urgent: !hasAuth && x.urgent ? true : undefined, justification: !hasAuth && x.urgent ? x.justification : undefined }
    }
    const id = String(h.id)
    if (b.clientId) {
      const same = await sql.one('SELECT * FROM hosp_notes WHERE id = ? AND hospitalization_id = ? AND author_id = ?', [b.clientId, id, user.id])
      if (same) return res.status(200).json(toInpatientNote(same))
    }
    const hasAdmission = await sql.one(`SELECT 1 FROM hosp_notes WHERE hospitalization_id = ? AND kind = 'admission'`, [id])
    // La nota de consulta externa que dio el ingreso ES la nota de ingreso: no se pide otra. En observación
    // (y si vino de ella) tampoco.
    const fromConsult = h.kind === 'observation' || !!h.observation_at || !!h.consultation_id
    if (b.kind === 'admission' && (hasAdmission || fromConsult)) fail(409, h.kind === 'observation' ? 'En observación se escriben notas de evolución.' : fromConsult ? 'La nota de consulta externa ya es la nota de ingreso. Escribe una nota de evolución.' : 'Este paciente ya tiene nota de ingreso. Escribe una nota de evolución.')
    if (b.kind === 'evolution' && !hasAdmission && !fromConsult) fail(409, 'Primero va la nota de ingreso.')
    const noteId = b.clientId ?? randomUUID()
    const at = new Date().toISOString()
    const name = await patientName(String(h.patient_id))
    // Fuera de la transacción: con una sola conexión, consultar por fuera de ella la bloquearía
    const checklist = await checklistFor(h)
    // MC7 (ronda 6): el cuadro completo. Si otra nota se firmó mientras se escribía, se recalcula sobre ella: se avisa
    let lines: OrderLine[] | undefined
    let orders = b.orders
    let indicationCount = b.indicationCount
    if (b.chain) {
      const { file, last, active } = await chainOf(h)
      if ((last?.id ?? null) !== b.chain.basedOn) {
        const who = last ? (await sql.one('SELECT name FROM staff WHERE id = ?', [last.authorId]))?.name : undefined
        fail(409, `Otra nota se firmó mientras escribías${who ? ` (${who})` : ''}. Revisa las indicaciones y los medicamentos activos, que ya se actualizaron, y vuelve a firmar.`)
      }
      const ind = indicationLines(active, b.chain.decisions, b.orders, () => randomUUID())
      const ended = (id: string) => b.stopMedIds.includes(id) || b.meds.some((m) => m.replacesId === id)
      const meds: OrderLine[] = file.meds.filter((m) => !m.stoppedAt && !courseDone(m, new Date(at))).map((m) => ({ id: m.id, kind: 'med' as const, text: medLabel(m), medId: m.id,
        tag: b.meds.some((x) => x.replacesId === m.id) ? 'modified' as const : ended(m.id) ? 'omitted' as const : 'continue' as const }))
      for (const m of b.meds) meds.push({ id: randomUUID(), kind: 'med', text: medLabel(m), tag: 'new', replaces: m.replacesId })
      lines = [...ind, ...meds]
      orders = lines.map(lineOrder)
      indicationCount = ind.length
    }
    let vitalsTag: 'continue' | 'new' | 'modified' | undefined
    let examBatch: string | null = null
    // MC8 (ronda 6): la toma anotada en la nota, con la misma validación que la hoja de signos
    const taken = b.vitalsTaken && VITAL_FIELDS.some((k) => b.vitalsTaken![k] != null) ? b.vitalsTaken : undefined
    const vitalsId = taken ? randomUUID() : undefined
    if (taken) {
      if ((taken.systolic == null) !== (taken.diastolic == null)) fail(400, 'La presión arterial lleva la sistólica y la diastólica.')
      const t = new Date(taken.takenAt ?? at)
      if (t.getTime() > Date.now() + 60_000) fail(400, 'La hora de la toma no puede ser en el futuro.')
      if (t.getTime() < new Date(String(h.observation_at ?? h.admitted_at)).getTime() - 3_600_000) fail(400, 'La hora de la toma es anterior al ingreso. Revísala.')
    }
    // Fuera de la transacción: notas y órdenes de la consulta para saber la frecuencia vigente de una estancia de antes
    const vitalsCtx = b.vitals ? { notes: (await sql.query('SELECT * FROM hosp_notes WHERE hospitalization_id = ?', [id])).map(toInpatientNote),
      consultOrders: h.consultation_id ? JSON.parse(String((await sql.one('SELECT orders FROM consultations WHERE id = ?', [String(h.consultation_id)]))?.orders ?? '[]')) as string[] : [] } : undefined
    // NE4: los diagnósticos vigentes antes de esta nota (para la bitácora)
    const prevDx = b.kind === 'evolution' ? await currentDxOf(sql, h) : []
    await sql.tx(async (q) => {
      if (taken) await insertVitals(q, h, taken, user.id, new Date(taken.takenAt ?? at).toISOString(), at, vitalsId!, noteId)
      if (b.vitals) vitalsTag = await applyVitalsPlan(q, h, b.vitals, user.id, at, noteId, vitalsCtx)
      await q.run(`INSERT INTO hosp_notes (id, clinic_id, hospitalization_id, kind, author_id, at, subjective, objective, assessment, plan, data) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [noteId, cid, id, b.kind, user.id, at, b.format === 'soap' ? b.subjective : '', b.format === 'soap' ? b.objective : '', b.format === 'soap' ? b.assessment : '', b.format === 'soap' ? b.plan : '',
          JSON.stringify({ orders, checklist, indications: indicationCount === undefined ? undefined : Math.min(indicationCount, orders.length), lines, basedOn: b.chain ? b.chain.basedOn ?? undefined : undefined, vitals: b.vitals && vitalsTag ? { ...b.vitals, tag: vitalsTag } : undefined, vitalsId,
            ...(b.format === 'postop' ? { format: 'postop', diagnoses: b.diagnoses, postop: { ...b.postop!, startAt: new Date(b.postop!.startAt).toISOString(), endAt: new Date(b.postop!.endAt).toISOString(), ...postopAuth } }
              : b.format === 'dx' && b.kind === 'admission' ? { format: 'dx', diagnoses: b.diagnoses, chiefComplaint: b.chiefComplaint, history: b.history, exam: b.exam, observations: b.observations }
              : b.format === 'dx' ? { format: 'dx', diagnoses: b.diagnoses, evolution: b.evolution || undefined, exam: b.exam, observations: b.observations }
              // NO3 (ronda 16): toda nota SOAP (también la de ingreso) guarda sus diagnósticos CIE-11
              : b.diagnoses.length ? { diagnoses: b.diagnoses } : {}) })])
      await applyMeds(q, h, noteId, user.id, at, b.meds, b.stopMedIds)
      examBatch = await insertExams(q, { clinicId: cid, patientId: String(h.patient_id), hospitalizationId: id, noteId, by: user.id, at }, b.exams)
      if (vitalsTag && b.vitals && vitalsTag !== 'continue') await audit(user, `Indicó ${vitalsModeShort(b.vitals) === 'sin control programado' ? 'sin control programado de signos vitales' : `signos vitales ${vitalsModeShort(b.vitals)}`} a ${name} en su nota`, q)
      const what = b.kind === 'admission' ? 'nota de ingreso' : b.format === 'postop' ? `nota postquirúrgica («${b.postop!.procedureName}»${postopAuth?.urgent ? ', urgencia sin autorización previa' : ''})` : 'nota de evolución'
      // PQ2 (ronda 9): queda en la bitácora quién participó
      if (b.format === 'postop') {
        const team = SURGICAL_TEAM.filter((t) => b.postop!.team[t.key]?.name.trim()).map((t) => `${t.label}: ${b.postop!.team[t.key]!.name.trim()}`).join('; ')
        await audit(user, `Equipo quirúrgico de «${b.postop!.procedureName}» de ${name}: ${team}`, q)
      }
      const changes = [b.meds.length && `${b.meds.length} medicamento(s) indicado(s)`, b.stopMedIds.length && `${b.stopMedIds.length} omitido(s)`, b.exams.length && `${b.exams.length} examen(es)`, taken && 'signos vitales (origen: nota de evolución)'].filter(Boolean).join(', ')
      await audit(user, `Escribió ${what} de ${name}${changes ? `: ${changes}` : ''}`, q)
      // HO2 (ronda 16): la nota de ingreso resuelve el «Ingreso con órdenes pendientes». Si el ingreso se hizo sin diagnóstico
      // (recepción o administración), toma los de la nota; la autorización pendiente de firma se actualiza con ellos
      if (b.kind === 'admission') {
        const stayDx = JSON.parse(String(h.diagnoses ?? '[]')) as unknown[]
        if (!stayDx.length && b.diagnoses.length) {
          await q.run('UPDATE hospitalizations SET diagnoses = ? WHERE id = ?', [JSON.stringify(b.diagnoses), id])
          await refreshPendingHospitalAuthorization(q, (await q.one('SELECT * FROM hospitalizations WHERE id = ?', [id]))!)
        }
        await audit(user, `Firmó la nota de ingreso de ${name}: el ingreso ya no tiene órdenes pendientes${stayDx.length || !b.diagnoses.length ? '' : '; los diagnósticos de ingreso se tomaron de la nota'}`, q)
      }
      // NE4 (ronda 8): qué diagnóstico se quitó o se agregó respecto de los vigentes (la última nota con diagnósticos o el ingreso)
      if (b.kind === 'evolution') {
        const prev = prevDx
        const key = (d: { code: string; label: string }) => `${d.code}|${d.label.trim().toLowerCase()}`
        const removed = prev.filter((d) => !b.diagnoses.some((x) => key(x) === key(d)))
        const added = b.diagnoses.filter((d) => !prev.some((x) => key(x) === key(d)))
        const txt = (l: { code: string; label: string }[]) => l.map((d) => `${d.label} (${d.code})`).join('; ')
        if (removed.length || added.length) await audit(user, `Diagnósticos de ${name} en su nota de evolución:${added.length ? ` agregó ${txt(added)}` : ''}${added.length && removed.length ? ';' : ''}${removed.length ? ` quitó ${txt(removed)}` : ''}`, q)
      }
    })
    // Ronda 8: con exámenes externos, la orden se imprime al firmar (el paciente la lleva, como la receta)
    res.status(201).json({ ...toInpatientNote((await sql.one('SELECT * FROM hosp_notes WHERE id = ?', [noteId]))!), examBatch: b.exams.some((e) => e.place === 'external') ? examBatch ?? undefined : undefined })
  })

  app.post('/api/inpatient/:id/nursing', auth, need('inpatient.care'), async (req, res) => {
    const { text } = parse(z.object({ text: z.string().trim().min(3, 'Escribe la nota de enfermería.').max(4000) }), req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    const h = await activeHosp(cid, String(req.params.id))
    if (h.kind === 'observation') fail(409, 'En observación no se escriben notas de enfermería.')
    const noteId = randomUUID()
    await sql.run(`INSERT INTO hosp_notes (id, clinic_id, hospitalization_id, kind, author_id, at, text) VALUES (?,?,?,'nursing',?,?,?)`,
      [noteId, cid, String(h.id), user.id, new Date().toISOString(), text])
    await audit(user, `Escribió nota de enfermería de ${await patientName(String(h.patient_id))}`)
    res.status(201).json(toInpatientNote((await sql.one('SELECT * FROM hosp_notes WHERE id = ?', [noteId]))!))
  })

  /**
   * Enfermería marca una orden médica como revisada; desmarcarla pide motivo. Cada marca queda con
   * autor y hora, y no se modifica: el estado es la última marca.
   */
  app.post('/api/inpatient/notes/:noteId/orders/:index/review', auth, need('orders.review'), async (req, res) => {
    const b = parse(z.object({ checked: z.boolean(), reason: z.string().trim().max(300).optional() }), req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    const note = (await sql.one('SELECT * FROM hosp_notes WHERE id = ? AND clinic_id = ?', [String(req.params.noteId), cid])) ?? fail(404, 'La nota no existe.')
    const h = await activeHosp(cid, String(note!.hospitalization_id))
    const n = toInpatientNote(note!)
    const index = Number(req.params.index)
    if (!n.checklist) fail(400, 'Las órdenes de esta nota no se revisan una por una.')
    if (!Number.isInteger(index) || index < 0 || index >= (n.orders?.length ?? 0)) fail(400, 'La orden no existe.')
    if (!b.checked && (b.reason ?? '').length < 5) fail(400, 'Escribe por qué desmarcas la orden.')
    const last = await sql.one('SELECT action FROM order_marks WHERE note_id = ? AND order_index = ? ORDER BY at DESC, id DESC LIMIT 1', [n.id, index])
    const isChecked = last?.action === 'check'
    if (isChecked === b.checked) fail(409, b.checked ? 'Esa orden ya estaba marcada. Actualiza la página.' : 'Esa orden no estaba marcada.')
    const id = randomUUID()
    await sql.run('INSERT INTO order_marks (id, clinic_id, hospitalization_id, note_id, order_index, action, reason, by_id, at) VALUES (?,?,?,?,?,?,?,?,?)',
      [id, cid, String(h.id), n.id, index, b.checked ? 'check' : 'uncheck', b.reason || null, user.id, new Date().toISOString()])
    const order = n.orders![index]
    await audit(user, b.checked ? `Marcó como revisada la orden ${index + 1} ("${order}") de ${await patientName(String(h.patient_id))}`
      : `Desmarcó la orden ${index + 1} ("${order}") de ${await patientName(String(h.patient_id))}: ${b.reason}`)
    res.status(201).json(toOrderMark((await sql.one('SELECT * FROM order_marks WHERE id = ?', [id]))!))
  })

  // Enfermería (o el médico, en guardia u observación) marca la dosis de una hora indicada o una dosis PRN
  app.post('/api/inpatient/meds/:medId/doses', auth, need('inpatient.care', 'inpatient.orders'), async (req, res) => {
    const b = parse(z.object({
      scheduledAt: when.optional(),
      givenAt: when.optional(),
      // OB1 (ronda 5): «Omitida» con motivo, además de administrada y no aplicada
      status: z.enum(['given', 'skipped', 'omitted']).default('given'),
      note: z.string().trim().max(300).optional(),
      // Registrar una dosis de un día que ya pasó pide motivo
      reason: z.string().trim().max(300).optional(),
    }), req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    const m = (await sql.one('SELECT * FROM hosp_meds WHERE id = ? AND clinic_id = ?', [String(req.params.medId), cid])) ?? fail(404, 'El medicamento no existe.')
    const h = await activeHosp(cid, String(m!.hospitalization_id))
    const med = toInpatientMed(m!)
    const givenAt = new Date(b.givenAt ?? Date.now())
    if (givenAt.getTime() > Date.now() + 60_000) fail(400, 'La hora de administración no puede ser en el futuro.')
    let scheduledAt: string | null = null
    if (med.prn) {
      if (b.scheduledAt) fail(400, 'Un medicamento PRN no tiene horario fijo.')
      if (med.stoppedAt && givenAt >= new Date(med.stoppedAt)) fail(409, `${med.drug} fue omitido por el médico; ya no se administra.`)
      if (b.status !== 'given') fail(400, 'Una dosis PRN sólo se registra cuando se aplica.')
    } else {
      if (!b.scheduledAt) fail(400, 'Indica la hora de la dosis que estás marcando.')
      const slot = new Date(b.scheduledAt!)
      if (med.stoppedAt && slot >= new Date(med.stoppedAt)) fail(409, `${med.drug} fue omitido por el médico; esa dosis ya no se aplica.`)
      if (!isScheduled(med, slot)) fail(400, 'Esa hora no corresponde al horario indicado del medicamento.')
      if (b.status !== 'given' && !b.note) fail(400, b.status === 'omitted' ? 'Escribe por qué se omitió la dosis.' : 'Escribe por qué no se aplicó la dosis (ayuno, la rechazó, suspendida…).')
      scheduledAt = slot.toISOString()
    }
    // Una dosis de hace más de 24 horas es un registro de un día pasado: necesita motivo y queda en la bitácora
    const late = new Date(scheduledAt ?? givenAt).getTime() < Date.now() - 24 * 3_600_000
    if (late && (b.reason ?? '').length < 5) fail(400, 'Es una dosis de un día que ya pasó: escribe el motivo del registro tardío.')
    const id = randomUUID()
    try {
      // ME2 (ronda 8): cada registro guarda la cantidad que correspondía a esa dosis (la inicial o las siguientes)
      // ME4 (ronda 9): una sesión de nebulización guarda la composición que se aplicó
      const amount = med.nebulization ? nebulizationBody(med.nebulization) : scheduledAt ? doseAt(med, new Date(scheduledAt)) : med.dose
      await sql.run('INSERT INTO hosp_doses (id, clinic_id, med_id, scheduled_at, given_at, given_by, status, note, corrected_at, corrected_by, correction_reason, dose, recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [id, cid, med.id, scheduledAt, givenAt.toISOString(), user.id, b.status, b.note || null, late ? new Date().toISOString() : null, late ? user.id : null, late ? `Registro tardío: ${b.reason}` : null, amount, new Date().toISOString()])
    } catch (e) {
      if ((e as { code?: string }).code === '23505') fail(409, 'Esa dosis ya fue registrada. Actualiza la página.')
      throw e
    }
    const delayed = b.status === 'given' && scheduledAt && givenAt.getTime() - new Date(scheduledAt).getTime() > LATE_AFTER_MIN * 60_000
    await audit(user, `${med.infusionRate && b.status === 'given' ? 'Inició la infusión de' : DOSE_VERB[b.status]} ${medLabel(med)}${scheduledAt ? ` (${med.infusionRate ? 'inicio indicado' : doseAt(med, new Date(scheduledAt)) !== med.dose ? `dosis inicial de ${doseAt(med, new Date(scheduledAt))}` : 'dosis'} de las ${scheduledAt})` : ''} a ${await patientName(String(h.patient_id))} (${user.role === 'doctor' ? 'médico' : 'enfermería'})${delayed ? ', con retraso' : ''}${b.status !== 'given' ? `, motivo: ${b.note}` : ''}${late ? `, registro tardío: ${b.reason}` : ''}`)
    res.status(201).json(toDose((await sql.one('SELECT * FROM hosp_doses WHERE id = ?', [id]))!))
  })

  /**
   * Corregir una dosis ya registrada (hora real, aplicada o no, observación). Pide motivo; se guarda el
   * registro anterior y quién lo corrigió, y queda en la bitácora.
   */
  app.patch('/api/inpatient/doses/:doseId', auth, need('inpatient.care', 'inpatient.orders'), async (req, res) => {
    const b = parse(z.object({
      status: z.enum(['given', 'skipped', 'omitted']).optional(),
      givenAt: when.optional(),
      note: z.string().trim().max(300).optional(),
      reason: z.string().trim().max(300).optional(),
      // GE4 (ronda 9): corrección de quien la registró, en el periodo de gracia (el motivo es opcional)
      grace: z.boolean().optional(),
    }), req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    const d = (await sql.one('SELECT * FROM hosp_doses WHERE id = ? AND clinic_id = ?', [String(req.params.doseId), cid])) ?? fail(404, 'La dosis no existe.')
    if (b.grace) assertGrace(user.id, d!.given_by, d!.recorded_at, 'registró la dosis')
    else if (!b.reason || b.reason.length < 5) fail(400, 'Escribe el motivo de la corrección.')
    const m = (await sql.one('SELECT * FROM hosp_meds WHERE id = ?', [String(d!.med_id)]))!
    const h = await activeHosp(cid, String(m.hospitalization_id))
    if (b.givenAt && new Date(b.givenAt).getTime() > Date.now() + 60_000) fail(400, 'La hora de administración no puede ser en el futuro.')
    if (b.status && b.status !== 'given' && !(b.note ?? d!.note)) fail(400, 'Escribe por qué no se administró la dosis.')
    if (b.status && b.status !== 'given' && !d!.scheduled_at) fail(400, 'Una dosis PRN sólo se registra cuando se aplica.')
    const previous = { status: d!.status, givenAt: d!.given_at, givenBy: d!.given_by, note: d!.note ?? undefined, correctedAt: d!.corrected_at ?? undefined, reason: d!.correction_reason ?? undefined }
    const reason = b.reason || (b.grace ? 'Corrección en el periodo de gracia' : '')
    const who = await patientName(String(h.patient_id))
    await sql.tx(async (q) => {
      // GE4: cada corrección guarda la versión anterior completa
      const next = await saveVersion(q, { clinicId: cid, kind: 'dose', id: String(d!.id), version: Number(d!.version ?? 1), authorId: String(d!.given_by), at: String(d!.recorded_at ?? d!.given_at), by: user.id, reason: b.reason,
        data: { status: d!.status, givenAt: d!.given_at, note: d!.note ?? undefined, dose: d!.dose ?? undefined } })
      await q.run('UPDATE hosp_doses SET status = ?, given_at = ?, note = ?, corrected_at = ?, corrected_by = ?, correction_reason = ?, previous = ?, version = ? WHERE id = ?',
        [b.status ?? d!.status, b.givenAt ? new Date(b.givenAt).toISOString() : d!.given_at, b.note ?? d!.note ?? null, new Date().toISOString(), user.id, reason, JSON.stringify(previous), next, String(d!.id)])
      await audit(user, `Corrigió la dosis de ${medLabel(toInpatientMed(m))} de ${who}${b.grace ? ` en el periodo de gracia (versión ${next})` : ''} (antes: ${DOSE_STATE[previous.status as keyof typeof DOSE_STATE] ?? previous.status} ${previous.givenAt}): ${reason}`, q)
    })
    res.json(toDose((await sql.one('SELECT * FROM hosp_doses WHERE id = ?', [String(d!.id)]))!))
  })

  /**
   * ME1 (ronda 8): «Suspender infusión». Enfermería (o el médico) registra cuándo se detuvo la infusión en curso, quién y,
   * si quiere, por qué. La orden no se borra; si el médico cambia la velocidad, la orden nueva vuelve a pedir su inicio.
   */
  app.post('/api/inpatient/meds/:medId/infusion-stop', auth, need('inpatient.care', 'inpatient.orders'), async (req, res) => {
    const b = parse(z.object({ at: when.optional(), note: z.string().trim().max(300).optional() }), req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    const m = (await sql.one('SELECT * FROM hosp_meds WHERE id = ? AND clinic_id = ?', [String(req.params.medId), cid])) ?? fail(404, 'El medicamento no existe.')
    const h = await activeHosp(cid, String(m!.hospitalization_id))
    if (m!.infusion_rate == null) fail(400, 'Ese medicamento no es una infusión.')
    if (m!.infusion_stopped_at) fail(409, 'La infusión ya estaba suspendida. Actualiza la página.')
    const start = await sql.one(`SELECT given_at FROM hosp_doses WHERE med_id = ? AND status = 'given' ORDER BY given_at LIMIT 1`, [String(m!.id)])
    if (!start) fail(409, 'La infusión todavía no se inicia: registra primero el inicio.')
    const at = new Date(b.at ?? Date.now())
    if (at.getTime() > Date.now() + 60_000) fail(400, 'La hora no puede ser en el futuro.')
    if (at < new Date(String(start!.given_at))) fail(400, 'La hora de suspensión es anterior al inicio de la infusión.')
    await sql.run('UPDATE hosp_meds SET infusion_stopped_at = ?, infusion_stopped_by = ?, infusion_stop_note = ? WHERE id = ?', [at.toISOString(), user.id, b.note || null, String(m!.id)])
    await audit(user, `Suspendió la infusión de ${medLabel(toInpatientMed(m!))} de ${await patientName(String(h.patient_id))}${b.note ? `: ${b.note}` : ''}`)
    res.json(toInpatientMed((await sql.one('SELECT * FROM hosp_meds WHERE id = ?', [String(m!.id)]))!))
  })

  /** El médico suspende una orden desde la hoja: queda con motivo, autor y hora; no se borra. */
  app.post('/api/inpatient/meds/:medId/stop', auth, need('inpatient.orders'), async (req, res) => {
    const { reason } = parse(z.object({ reason: z.string().trim().min(3, 'Escribe por qué se suspende.').max(300) }), req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    const m = (await sql.one('SELECT * FROM hosp_meds WHERE id = ? AND clinic_id = ?', [String(req.params.medId), cid])) ?? fail(404, 'El medicamento no existe.')
    const h = await activeHosp(cid, String(m!.hospitalization_id))
    if (m!.stopped_at) fail(409, 'Esa orden ya estaba suspendida.')
    await sql.run('UPDATE hosp_meds SET stopped_at = ?, stopped_by = ?, stop_reason = ? WHERE id = ?', [new Date().toISOString(), user.id, reason, String(m!.id)])
    await audit(user, `Suspendió ${medLabel(toInpatientMed(m!))} de ${await patientName(String(h.patient_id))}: ${reason}`)
    res.json(toInpatientMed((await sql.one('SELECT * FROM hosp_meds WHERE id = ?', [String(m!.id)]))!))
  })

  /**
   * ¿Hay una autorización firmada para esta estancia en las 24 horas anteriores al procedimiento? La hora del
   * procedimiento se escribe al minuto, así que se toleran 2 minutos.
   */
  async function signedAuthorization(hospId: string, performedAt: Date) {
    const since = new Date(performedAt.getTime() - 24 * 3_600_000).toISOString()
    return (await sql.one(`SELECT id FROM authorizations WHERE hospitalization_id = ? AND status = 'signed' AND status_at >= ? AND status_at <= ? LIMIT 1`, [hospId, since, new Date(performedAt.getTime() + 2 * 60_000).toISOString()]))
      // Registros anteriores: autorización marcada como "autorizada"
      ?? sql.one(`SELECT id FROM hosp_procedures WHERE hospitalization_id = ? AND kind = 'authorization' AND status = 'authorized' AND COALESCE(updated_at, created_at) >= ? LIMIT 1`, [hospId, since])
  }

  /** La autorización elegida, si es de esta estancia y está firmada. */
  async function authorizationFor(hospId: string, id: string) {
    return (await sql.one(`SELECT id FROM authorizations WHERE id = ? AND hospitalization_id = ? AND status = 'signed'`, [id, hospId]))
      ?? sql.one(`SELECT id FROM hosp_procedures WHERE id = ? AND hospitalization_id = ? AND kind = 'authorization' AND status = 'authorized'`, [id, hospId])
  }

  /**
   * Nota de procedimiento: el procedimiento ya se hizo. Un solo texto (técnica, hallazgos, complicaciones),
   * con la fecha y hora del procedimiento (obligatoria, no futura) y la hora en que se escribe la nota.
   * Sin autorización firmada en las últimas 24 h, sólo se acepta como urgencia con justificación.
   */
  app.post('/api/inpatient/:id/procedure-notes', auth, need('inpatient.orders', 'inpatient.notes'), async (req, res) => {
    const b = parse(z.object({
      name: z.string().trim().min(3, 'Escribe el nombre del procedimiento.').max(200),
      performedAt: when,
      text: z.string().trim().min(10, 'Describe el procedimiento: técnica, hallazgos y complicaciones.').max(8000),
      authorizationId: z.string().optional(),
      urgent: z.boolean().default(false),
      justification: z.string().trim().max(1000).optional(),
      // MC3: sólo un procedimiento mayor pide autorización quirúrgica. Sin el dato (versiones anteriores) se pide, como antes.
      major: z.boolean().optional(),
    }), req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    const h = await activeHosp(cid, String(req.params.id))
    const performedAt = new Date(b.performedAt)
    if (performedAt.getTime() > Date.now() + 2 * 60_000) fail(400, 'La hora del procedimiento no puede ser en el futuro.')
    if (performedAt.getTime() < new Date(String(h.admitted_at)).getTime() - 24 * 3_600_000) fail(400, 'La hora del procedimiento es anterior al ingreso. Revísala.')
    const hasAuth = b.authorizationId ? await authorizationFor(String(h.id), b.authorizationId) : b.major === false ? false : await signedAuthorization(String(h.id), performedAt)
    if (b.major !== false && !hasAuth && !(b.urgent && (b.justification ?? '').length >= 10)) {
      fail(409, 'No hay autorización firmada registrada para este procedimiento. Regístrala o marca "Urgencia, sin autorización previa" con la justificación.')
    }
    const noteId = randomUUID()
    const data = { name: b.name, performedAt: performedAt.toISOString(), major: b.major, authorizationId: b.authorizationId, urgent: !hasAuth && b.urgent ? true : undefined, justification: !hasAuth && b.urgent ? b.justification : undefined }
    await sql.run(`INSERT INTO hosp_notes (id, clinic_id, hospitalization_id, kind, author_id, at, text, data) VALUES (?,?,?,'procedure',?,?,?,?)`,
      [noteId, cid, String(h.id), user.id, new Date().toISOString(), b.text, JSON.stringify(data)])
    await audit(user, `Escribió la nota del procedimiento${b.major ? ' mayor' : b.major === false ? ' menor' : ''} "${b.name}" de ${await patientName(String(h.patient_id))} (realizado ${performedAt.toISOString()})${data.urgent ? ', urgencia sin autorización previa' : ''}`)
    res.status(201).json(toInpatientNote((await sql.one('SELECT * FROM hosp_notes WHERE id = ?', [noteId]))!))
  })

  // ---------- Autorizaciones (consentimiento informado) ----------
  /**
   * Dos documentos, ambos los generan enfermería o el médico. De hospitalización: uno por estancia (se genera al
   * ingresar; si ya hay uno vigente se reabre en vez de duplicarlo). Quirúrgica: uno por cirugía, con el botón
   * de las notas de evolución. Se imprimen, se firman en papel y se sube la foto o el PDF.
   */
  const text = (max: number) => z.string().trim().max(max).optional()
  const person = z.object({ name: z.string().trim().min(3, 'Escribe el nombre completo.').max(120), dni: text(30).transform(normalizeDni), relation: text(40) })
  app.post('/api/inpatient/:id/authorizations', auth, need('inpatient.orders', 'inpatient.care'), async (req, res) => {
    const b = parse(z.object({
      template: z.enum(['hospital', 'surgical']),
      procedure: text(300), diagnosis: text(300), description: text(2000), benefits: text(1500), risks: text(2500), alternatives: text(1500),
      notDoing: text(1500), anesthesia: text(120),
      representative: person.optional(),
      witness: person.optional(),
      companion: z.object({ name: z.string().trim().min(3, 'Escribe el nombre del acompañante.').max(120), phone: z.string().trim().min(7, 'Escribe el teléfono del acompañante.').max(30), relation: text(40) }).optional(),
    }), req.body)
    if (b.template === 'surgical' && (!b.procedure || b.procedure.length < 3)) fail(400, 'Escribe el procedimiento quirúrgico (uno o varios: "X o Y").')
    const user = userOf(req)
    const cid = clinicOf(req)
    const h = await activeHosp(cid, String(req.params.id))
    // El diagnóstico lo pone el sistema (los diagnósticos de la estancia); sólo se escribe si no tiene ninguno
    const known = (JSON.parse(String(h.diagnoses ?? '[]')) as { label: string }[]).map((d) => d.label).join('; ')
    if (b.template === 'surgical' && !b.diagnosis && !known) fail(400, 'Escribe el diagnóstico: el expediente no tiene ninguno.')
    const name = await patientName(String(h.patient_id))
    if (b.template === 'hospital') {
      if (h.kind === 'observation') fail(409, 'La observación no lleva autorización de hospitalización. Se genera si el paciente pasa a hospitalización.')
      // El acompañante también queda en la hoja de hospitalización
      let result: Awaited<ReturnType<typeof ensureHospitalAuthorization>> | undefined
      await sql.tx(async (q) => {
        if (b.companion) {
          await q.run('UPDATE hospitalizations SET companion_name = ?, companion_phone = ?, companion_relation = COALESCE(?, companion_relation) WHERE id = ?',
            [b.companion.name, b.companion.phone, b.companion.relation ?? null, String(h.id)])
          await refreshPendingHospitalAuthorization(q, (await q.one('SELECT * FROM hospitalizations WHERE id = ?', [String(h.id)]))!)
        }
        result = await ensureHospitalAuthorization(q, (await q.one('SELECT * FROM hospitalizations WHERE id = ?', [String(h.id)]))!, user, { companion: b.companion, representative: b.representative })
        if (result.created) await audit(user, `Generó la autorización de hospitalización de ${name}`, q)
      })
      return res.status(result!.created ? 201 : 200).json(result!.authorization)
    }
    // Ronda 3 (P5): sólo procedimiento y diagnóstico; el resto del documento es un texto genérico fijo y lo que se
    // firma a mano (representante, testigo) son líneas en el papel. Las emitidas antes conservan su contenido.
    const base = await authorizationBase(sql, h, user)
    const companion = h.companion_name ? { name: String(h.companion_name), phone: h.companion_phone ? String(h.companion_phone) : undefined, relation: h.companion_relation ? String(h.companion_relation) : undefined } : undefined
    const data = { procedure: b.procedure, diagnosis: b.diagnosis || known, generic: true, companion, ...base, admission: undefined }
    const id = randomUUID()
    await sql.run(`INSERT INTO authorizations (id, clinic_id, hospitalization_id, patient_id, template, data, created_by, created_at) VALUES (?,?,?,?,'surgical',?,?,?)`,
      [id, cid, String(h.id), String(h.patient_id), JSON.stringify(data), user.id, new Date().toISOString()])
    await audit(user, `Generó la autorización quirúrgica para "${b.procedure}" de ${name}`)
    res.status(201).json(toAuthorization((await sql.one('SELECT * FROM authorizations WHERE id = ?', [id]))!))
  })

  // HO2 (ronda 16): recepción y administración (que ingresan) ven e imprimen la autorización de hospitalización, no las quirúrgicas
  app.get('/api/authorizations/:aid', auth, need('inpatient.view', 'inpatient.admit'), async (req, res) => {
    const row = (await sql.one('SELECT * FROM authorizations WHERE id = ? AND clinic_id = ?', [String(req.params.aid), clinicOf(req)])) ?? fail(404, 'La autorización no existe.')
    if (!can(userOf(req), 'inpatient.view') && row!.template !== 'hospital') fail(403, 'Solo puedes ver la autorización de hospitalización.')
    res.json(toAuthorization(row!))
  })

  /**
   * En papel: firmada (con la foto o el PDF de la hoja firmada), rechazada ("No autorizo") o revocada. Lo registran
   * enfermería o el médico; queda quién y cuándo. La firma en pantalla va por /sign (routes/consent.ts).
   */
  app.post('/api/authorizations/:aid/status', auth, need('inpatient.orders', 'inpatient.care'), async (req, res) => {
    const b = parse(z.object({ status: z.enum(['signed', 'refused', 'revoked']), fileId: z.string().optional(), note: z.string().trim().max(500).optional() }), req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    const row = (await sql.one('SELECT * FROM authorizations WHERE id = ? AND clinic_id = ?', [String(req.params.aid), cid])) ?? fail(404, 'La autorización no existe.')
    const a = toAuthorization(row!)
    await activeHosp(cid, a.hospitalizationId)
    const allowed: Record<string, string[]> = { signed: ['pending'], refused: ['pending'], revoked: ['signed'] }
    if (!allowed[b.status].includes(a.status)) fail(409, b.status === 'revoked' ? 'Sólo se revoca una autorización firmada.' : 'Esta autorización ya no está pendiente de firma.')
    if (b.status === 'signed' && !b.fileId) fail(400, 'Sube la foto o el PDF de la hoja firmada.')
    if (b.status !== 'signed' && !(b.note && b.note.length >= 3) && !b.fileId) fail(400, 'Escribe una nota o sube la hoja firmada.')
    if (b.fileId && !(await sql.one('SELECT 1 FROM attachments WHERE id = ? AND clinic_id = ? AND patient_id = ?', [b.fileId, cid, a.patientId]))) fail(400, 'El archivo no corresponde a este paciente.')
    const now = new Date().toISOString()
    if (b.status === 'revoked') {
      // La revocación en papel queda aparte: la hoja firmada (o el PDF virtual) de la autorización se conserva
      const revocation = { method: 'paper', at: now, by: user.id, fileId: b.fileId, note: b.note || undefined }
      await sql.run(`UPDATE authorizations SET status = 'revoked', revocation = ?, status_at = ?, status_by = ?, status_note = ? WHERE id = ?`,
        [JSON.stringify(revocation), now, user.id, b.note || null, a.id])
    } else {
      await sql.run(`UPDATE authorizations SET status = ?, file_id = COALESCE(?, file_id), method = CASE WHEN ?::text IS NULL THEN method ELSE 'paper' END, status_at = ?, status_by = ?, status_note = ? WHERE id = ?`,
        [b.status, b.fileId ?? null, b.fileId ?? null, now, user.id, b.note || null, a.id])
    }
    const label = { signed: 'firmada', refused: 'rechazada (no autorizo)', revoked: 'revocada' }[b.status]
    await audit(user, `Registró como ${label} la autorización ${a.template === 'hospital' ? 'de hospitalización' : a.data.procedure ? `quirúrgica "${a.data.procedure}"` : 'general'} de ${a.data.patient.name}`)
    res.json(toAuthorization((await sql.one('SELECT * FROM authorizations WHERE id = ?', [a.id]))!))
  })

  /**
   * MC6 (ronda 5): eliminar una autorización generada por error. Sólo la pendiente de firma que nadie ha firmado en
   * pantalla ni en papel; la firmada, la revocada, la de «No autoriza» y la que tiene hoja adjunta son registros legales.
   * La de hospitalización no se elimina: se genera sola con el ingreso. No se borra: se archiva y queda en la bitácora.
   */
  app.delete('/api/authorizations/:aid', auth, need('inpatient.orders', 'settings.manage'), async (req, res) => {
    const b = parse(z.object({ reason: z.string().trim().max(300).optional() }), req.body ?? {})
    const user = userOf(req)
    const cid = clinicOf(req)
    const row = (await sql.one('SELECT * FROM authorizations WHERE id = ? AND clinic_id = ? AND archived_at IS NULL', [String(req.params.aid), cid])) ?? fail(404, 'La autorización no existe.')
    const a = toAuthorization(row!)
    if (a.template === 'hospital') fail(409, 'La autorización de hospitalización se genera sola con el ingreso: no se elimina.')
    if (a.status !== 'pending' || a.signing || a.fileId || a.pdfId) fail(409, 'Sólo se elimina una autorización pendiente de firma, sin firma en pantalla ni hoja en papel.')
    const reason = b.reason || 'Generada por error'
    await sql.run('UPDATE authorizations SET archived_at = ?, archived_by = ?, archived_reason = ? WHERE id = ?', [new Date().toISOString(), user.id, reason, a.id])
    const created = new Intl.DateTimeFormat('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: process.env.TZ || 'America/Tegucigalpa' }).format(new Date(a.createdAt))
    const author = (await sql.one('SELECT name FROM staff WHERE id = ?', [a.createdBy]))?.name
    await audit(user, `Eliminó la autorización ${a.data.procedure ? `quirúrgica "${a.data.procedure}"` : 'general'} pendiente de firma de ${a.data.patient.name}, generada el ${created}${author ? ` por ${author}` : ''}. Motivo: ${reason}`)
    res.json({ ok: true })
  })

  // ---------- Procedimientos y autorizaciones (registros anteriores) ----------
  app.post('/api/inpatient/:id/procedures', auth, need('inpatient.view'), async (req, res) => {
    const b = parse(z.object({
      kind: z.enum(['procedure', 'authorization']),
      name: z.string().trim().min(3, 'Escribe el procedimiento o la autorización.').max(200),
      scheduledAt: when.optional(),
      notes: z.string().trim().max(1000).optional(),
    }), req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    const h = await activeHosp(cid, String(req.params.id))
    const id = randomUUID()
    await sql.run(`INSERT INTO hosp_procedures (id, clinic_id, hospitalization_id, kind, name, scheduled_at, status, notes, created_by, created_at) VALUES (?,?,?,?,?,?,'pending',?,?,?)`,
      [id, cid, String(h.id), b.kind, b.name, b.scheduledAt ? new Date(b.scheduledAt).toISOString() : null, b.notes || null, user.id, new Date().toISOString()])
    await audit(user, `Registró ${b.kind === 'procedure' ? 'el procedimiento' : 'la autorización'} "${b.name}" de ${await patientName(String(h.patient_id))}`)
    res.status(201).json(toProcedure((await sql.one('SELECT * FROM hosp_procedures WHERE id = ?', [id]))!))
  })

  app.patch('/api/inpatient/procedures/:pid', auth, need('inpatient.view'), async (req, res) => {
    const b = parse(z.object({ status: z.enum(['pending', 'authorized', 'done', 'denied']), notes: z.string().trim().max(1000).optional() }), req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    const p = (await sql.one('SELECT * FROM hosp_procedures WHERE id = ? AND clinic_id = ?', [String(req.params.pid), cid])) ?? fail(404, 'El registro no existe.')
    const h = await activeHosp(cid, String(p!.hospitalization_id))
    await sql.run('UPDATE hosp_procedures SET status = ?, notes = COALESCE(?, notes), updated_by = ?, updated_at = ? WHERE id = ?',
      [b.status, b.notes || null, user.id, new Date().toISOString(), String(p!.id)])
    await audit(user, `Cambió "${p!.name}" de ${await patientName(String(h.patient_id))} a ${b.status}`)
    res.json(toProcedure((await sql.one('SELECT * FROM hosp_procedures WHERE id = ?', [String(p!.id)]))!))
  })

  // ---------- Hoja de signos vitales (S1) ----------
  /**
   * Enfermería o el médico registran una toma: sólo lo que se tomó, con la hora real de la toma (por defecto ahora,
   * nunca en el futuro) y la hora en que se anota. No se edita: se anula con motivo y se registra otra.
   */
  app.post('/api/inpatient/:id/vitals', auth, need('vitals.record'), async (req, res) => {
    const v = parse(vitalsBody, req.body)
    if (!VITAL_FIELDS.some((k) => v[k] != null)) fail(400, 'Anota al menos un signo vital.')
    if ((v.systolic == null) !== (v.diastolic == null)) fail(400, 'La presión arterial lleva la sistólica y la diastólica.')
    const user = userOf(req)
    const cid = clinicOf(req)
    const h = await activeHosp(cid, String(req.params.id))
    const now = new Date()
    const takenAt = new Date(v.takenAt ?? now)
    if (takenAt.getTime() > now.getTime() + 60_000) fail(400, 'La hora de la toma no puede ser en el futuro.')
    if (takenAt.getTime() < new Date(String(h.observation_at ?? h.admitted_at)).getTime() - 3_600_000) fail(400, 'La hora de la toma es anterior al ingreso. Revísala.')
    const id = randomUUID()
    await insertVitals(sql, h, v, user.id, takenAt.toISOString(), now.toISOString(), id)
    const what = [v.temperature != null && `T ${v.temperature.toFixed(1)} °C`, v.systolic != null && `PA ${v.systolic}/${v.diastolic}`, v.heartRate != null && `FC ${v.heartRate}`,
      v.spo2 != null && `SatO2 ${v.spo2} %`].filter(Boolean).join(', ')
    await audit(user, `Registró signos vitales de ${await patientName(String(h.patient_id))}${what ? ` (${what})` : ''}, tomados ${takenAt.toISOString()}`)
    res.status(201).json({ ...toVitals((await sql.one('SELECT * FROM vitals WHERE id = ?', [id]))!), source: 'stay' })
  })

  /** Anular una toma de la hoja (se ve tachada; no se borra). */
  /**
   * GE4 (ronda 9): «Corregir» una nota en el periodo de gracia. Sólo su autor, en los minutos de GRACE_MINUTES desde la
   * firma (hora del servidor). Se corrige la columna izquierda (lo escrito y los diagnósticos); las órdenes quedan como se
   * firmaron. La versión anterior se guarda completa y la nota queda con la nueva (la cadena MC7/NE4 lee esta).
   */
  /**
   * GE4: las órdenes que se corrigen en el periodo de gracia. Las indicaciones nuevas de la nota (las que no cambian a otra)
   * se editan, se quitan o se agregan; los medicamentos de la nota que nadie registró se cambian en la hoja, se quitan
   * (quedan suspendidos con su motivo, no se borran) o se agregan; los exámenes sin muestra ni orden impresa se cancelan.
   * Lo ya cumplido o impreso queda bloqueado (correctionLocks). Lo continuado u omitido de la nota anterior no se toca.
   */
  const ordersFix = z.object({
    indications: z.array(z.object({ id: z.string().optional(), text: z.string().trim().min(1).max(500) })).max(40),
    meds: z.array(z.object({ id: z.string().optional(), med: medInput })).max(20),
    keepExams: z.array(z.string()).max(40),
    exams: z.array(examInput).max(40),
  })
  const sameMed = (r: Row, m: z.infer<typeof medInput>) => JSON.stringify([r.drug, r.presentation ?? '', r.dose, r.route, r.every_hours ?? null, Boolean(r.prn), r.prn ? r.prn_condition ?? '' : '',
    new Date(String(r.first_at)).getTime(), r.instructions ?? '', r.days ?? null, r.infusion_rate == null ? null : Number(r.infusion_rate), r.infusion_rate ? r.infusion_unit ?? 'ml/h' : null,
    r.loading_dose ?? null, r.nebulization ? JSON.parse(String(r.nebulization)) : null, Boolean(r.buy_outside), r.buy_outside ? r.buy_quantity ?? '' : '', r.quantity ?? '']) === JSON.stringify([m.drug, m.presentation ?? '', m.dose, m.route, m.everyHours ?? null, m.prn, m.prn ? m.prnCondition ?? '' : '',
    new Date(m.firstAt ?? String(r.first_at)).getTime(), m.instructions ?? '', m.days ?? null, m.infusionRate ?? null, m.infusionRate ? m.infusionUnit ?? 'ml/h' : null,
    m.loadingDose && m.everyHours && !m.prn && !m.infusionRate ? m.loadingDose : null, m.nebulization ?? null, !!m.buyOutside, m.buyOutside ? m.buyQuantity ?? '' : '', m.quantity ?? ''])
  const rowLabel = (r: Row) => medLabel(toInpatientMed(r))
  async function correctOrders(q: Sql, h: Row, n: Row, data: Record<string, unknown>, o: z.infer<typeof ordersFix>, userId: string) {
    const locks = await noteOrderLocks(q, n)
    if (locks.all) fail(409, locks.all)
    if (o.indications.some((x) => hasBlank(x.text)) || o.meds.some((x) => medHasBlank(x.med))) fail(400, 'Completa los espacios ___ de las órdenes antes de guardar.')
    const at = new Date().toISOString()
    const noteId = String(n.id)
    const changes: string[] = []
    const lines = data.lines as OrderLine[]
    // Indicaciones: lo que bajó de la nota anterior (Continúa, Omitida, Modificada) queda; la Nueva que reemplaza a otra se
    // corrige pero no se quita; las nuevas sueltas se editan, se quitan o se agregan (van al final, como al firmar)
    const ind = lines.filter((l) => l.kind === 'ind')
    const free = ind.filter((l) => l.tag === 'new' && !l.replaces)
    const dot = (t: string) => (/[.!?]$/.test(t) ? t : `${t}.`)
    const fixed = ind.filter((l) => !free.includes(l)).map((l) => {
      if (l.tag !== 'new') return l
      const x = o.indications.find((y) => y.id === l.id) ?? fail(409, `«${l.text}» reemplaza a otra indicación: corrígela, no se quita aquí.`)
      if (dot(x!.text) !== l.text) changes.push(`cambió la indicación «${l.text}» por «${dot(x!.text)}»`)
      return { ...l, text: dot(x!.text) }
    })
    const fixedIds = new Set(fixed.map((l) => l.id))
    const freeNew: OrderLine[] = o.indications.filter((x) => !x.id || !fixedIds.has(x.id)).map((x) => {
      const old = x.id ? free.find((l) => l.id === x.id) ?? fail(400, 'Esa indicación no es de esta nota.') : undefined
      if (!old) changes.push(`agregó la indicación «${dot(x.text)}»`)
      else if (old.text !== dot(x.text)) changes.push(`cambió la indicación «${old.text}» por «${dot(x.text)}»`)
      return { id: old?.id ?? randomUUID(), kind: 'ind', text: dot(x.text), tag: 'new' }
    })
    for (const l of free) if (!freeNew.some((x) => x.id === l.id)) changes.push(`quitó la indicación «${l.text}»`)
    // Medicamentos de la nota
    const rows = await noteMedRows(q, noteId)
    const ids = o.meds.flatMap((x) => (x.id ? [x.id] : []))
    if (new Set(ids).size !== ids.length || ids.some((id) => !rows.some((r) => r.id === id))) fail(400, 'Ese medicamento no es de esta nota.')
    for (const r of rows) {
      const id = String(r.id)
      const p = o.meds.find((x) => x.id === id)
      if (!p) {
        if (locks.meds[id]) fail(409, `${r.drug}: ${locks.meds[id]}`)
        if (locks.keep.includes(id)) fail(409, `${r.drug} reemplaza a otro medicamento: corrígelo, no se quita aquí.`)
        await q.run('UPDATE hosp_meds SET stopped_at = ?, stopped_by = ?, stop_reason = ? WHERE id = ?', [at, userId, REMOVED_IN_GRACE, id])
        changes.push(`quitó ${rowLabel(r)} (no se había administrado)`)
      } else if (!sameMed(r, p.med)) {
        if (locks.meds[id]) fail(409, `${r.drug}: ${locks.meds[id]}`)
        const m = p.med
        const loading = m.loadingDose && m.everyHours && !m.prn && !m.infusionRate
        await q.run(`UPDATE hosp_meds SET drug = ?, presentation = ?, dose = ?, route = ?, every_hours = ?, prn = ?, prn_condition = ?, first_at = ?, instructions = ?, days = ?,
            infusion_rate = ?, infusion_unit = ?, loading_dose = ?, loading_stat = ?, nebulization = ?, buy_outside = ?, buy_quantity = ?, quantity = ? WHERE id = ?`,
          [m.drug, m.presentation || null, m.dose, m.route, m.everyHours ?? null, m.prn, m.prn ? m.prnCondition || null : null, new Date(m.firstAt ?? String(r.first_at)).toISOString(), m.instructions || null,
            m.days ?? null, m.infusionRate ?? null, m.infusionRate ? m.infusionUnit || 'ml/h' : null, loading ? m.loadingDose : null, loading ? m.loadingStat !== false : null,
            m.nebulization ? JSON.stringify(m.nebulization) : null, !!m.buyOutside, m.buyOutside ? m.buyQuantity || null : null, m.quantity || null, id])
        changes.push(`cambió ${rowLabel(r)} por ${medLabel({ ...m, everyHours: m.everyHours, prn: m.prn })} en la hoja`)
      }
    }
    const added = o.meds.filter((x) => !x.id).map((x) => ({ ...x.med, replacesId: undefined }))
    if (added.length) {
      // El número de renglón de la nota sigue después de los que ya tenía (incluidos los quitados)
      const max = await q.one<{ n: number | null }>(`SELECT MAX(source_index)::int AS n FROM hosp_meds WHERE source = 'note' AND source_id = ?`, [noteId])
      await createMedOrders(q, { clinicId: String(h.clinic_id), hospitalizationId: String(h.id), patientId: String(h.patient_id), source: 'note', sourceId: noteId, orderedBy: userId, orderedAt: at,
        items: [...Array<null>((max?.n ?? -1) + 1).fill(null), ...added.map((m) => ({ ...m, firstAt: m.firstAt ?? at }))] })
      for (const m of added) changes.push(`agregó ${medLabel({ ...m, everyHours: m.everyHours, prn: m.prn })}`)
    }
    // Las líneas de medicamento: las que bajaron quedan; las nuevas se rehacen con lo que quedó en la hoja
    const oldNew = lines.filter((l) => l.kind === 'med' && l.tag === 'new')
    const byPos = oldNew.every((l) => !l.medId)
    const all = await q.query(`SELECT * FROM hosp_meds WHERE source = 'note' AND source_id = ? ORDER BY source_index`, [noteId])
    const medLines: OrderLine[] = all.flatMap((r, k) => (r.stop_reason === REMOVED_IN_GRACE ? [] : [{
      id: oldNew.find((l) => l.medId === r.id)?.id ?? (byPos ? oldNew[k]?.id : undefined) ?? randomUUID(),
      kind: 'med' as const, text: rowLabel(r), tag: 'new' as const, medId: String(r.id), ...(r.replaces_id ? { replaces: String(r.replaces_id) } : {}) }]))
    const next = [...fixed, ...freeNew, ...lines.filter((l) => l.kind === 'med' && l.tag !== 'new'), ...medLines]
    // Exámenes: los quitados se cancelan (si no tienen muestra ni orden impresa); los nuevos van en un lote nuevo
    const exams = await q.query(`SELECT * FROM exam_orders WHERE note_id = ? AND status <> 'cancelled'`, [noteId])
    if (o.keepExams.some((id) => !exams.some((e) => e.id === id))) fail(400, 'Ese examen no es de esta nota.')
    for (const e of exams.filter((x) => !o.keepExams.includes(String(x.id)))) {
      if (locks.exams[String(e.id)]) fail(409, `${e.name}: ${locks.exams[String(e.id)]}`)
      await q.run(`UPDATE exam_orders SET status = 'cancelled', cancel_reason = ?, status_at = ?, status_by = ? WHERE id = ?`, [REMOVED_IN_GRACE, at, userId, String(e.id)])
      await q.run('INSERT INTO exam_events (id, clinic_id, exam_id, status, by_id, at, note) VALUES (?,?,?,?,?,?,?)', [randomUUID(), String(h.clinic_id), String(e.id), 'cancelled', userId, at, REMOVED_IN_GRACE])
      changes.push(`canceló el examen ${e.name}`)
    }
    const examBatch = await insertExams(q, { clinicId: String(h.clinic_id), patientId: String(h.patient_id), hospitalizationId: String(h.id), noteId, by: userId, at }, o.exams)
    for (const e of o.exams) changes.push(`agregó el examen ${e.name}`)
    const indCount = fixed.length + freeNew.length
    return { data: { ...data, lines: next, orders: next.map(lineOrder), indications: indCount }, changes, examBatch: o.exams.some((e) => e.place === 'external') ? examBatch ?? undefined : undefined,
      snapshot: { meds: rows.map((r) => toInpatientMed(r)), exams: exams.map((e) => ({ id: String(e.id), name: String(e.name), status: String(e.status) })) } }
  }

  /** GE4: qué órdenes de la nota se pueden corregir (para la ventana de corrección). */
  app.get('/api/inpatient/notes/:id/correct', auth, need('inpatient.orders', 'inpatient.care'), async (req, res) => {
    const n = (await sql.one('SELECT * FROM hosp_notes WHERE id = ? AND clinic_id = ?', [String(req.params.id), clinicOf(req)])) ?? fail(404, 'La nota no existe.')
    res.json(await noteOrderLocks(sql, n!))
  })

  app.post('/api/inpatient/notes/:id/correct', auth, need('inpatient.orders', 'inpatient.care'), async (req, res) => {
    const text = z.string().trim().max(6000).default('')
    const b = parse(z.object({
      version: z.number().int().min(1),
      reason: z.string().trim().max(300).optional(),
      subjective: text, objective: text, assessment: text, plan: text,
      diagnoses: z.array(diagnosisInput).max(20).default([]),
      exam: text, observations: text, evolution: text,
      // NO2 (ronda 16): nota de ingreso estándar
      chiefComplaint: z.string().trim().max(1000).default(''), history: text,
      postop: postopInput.optional(),
      // Nota de procedimiento y de enfermería
      name: z.string().trim().max(200).optional(), performedAt: when.optional(), text: z.string().trim().max(10000).optional(),
      // Las órdenes de la nota (sólo si cambiaron)
      orders: ordersFix.optional(),
    }), req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    const n = (await sql.one('SELECT * FROM hosp_notes WHERE id = ? AND clinic_id = ?', [String(req.params.id), cid])) ?? fail(404, 'La nota no existe.')
    if (n!.kind === 'discharge') fail(409, 'La nota de egreso se corrige con una adenda.')
    assertGrace(user.id, n!.author_id, n!.at, 'firmó la nota')
    if (Number(n!.version ?? 1) !== b.version) fail(409, 'La nota cambió mientras la corregías. Actualiza la página.')
    const h = await activeHosp(cid, String(n!.hospitalization_id))
    const data = JSON.parse(String(n!.data ?? '{}')) as Record<string, unknown>
    const format = String(data.format ?? 'soap')
    const set = { subjective: String(n!.subjective ?? ''), objective: String(n!.objective ?? ''), assessment: String(n!.assessment ?? ''), plan: String(n!.plan ?? ''), text: String(n!.text ?? ''), data }
    const kind = String(n!.kind)
    let what = 'nota de evolución'
    if (kind === 'nursing') {
      if (!b.text || b.text.length < 3) fail(400, 'Escribe la nota de enfermería.')
      set.text = b.text!; what = 'nota de enfermería'
    } else if (kind === 'procedure') {
      if (!b.name || b.name.length < 3) fail(400, 'Escribe el procedimiento realizado.')
      if (!b.text || b.text.length < 10) fail(400, 'Escribe la nota del procedimiento.')
      const at = new Date(b.performedAt ?? String(data.performedAt))
      if (at.getTime() > Date.now() + 60_000) fail(400, 'La fecha y hora del procedimiento no puede ser en el futuro.')
      set.text = b.text!; set.data = { ...data, name: b.name, performedAt: at.toISOString() }; what = 'nota de procedimiento'
    } else if (format === 'postop') {
      const x = b.postop ?? fail(400, 'Faltan los datos de la nota postquirúrgica.')
      checkPostop(b.diagnoses, x!)
      const old = data.postop as Record<string, unknown>
      // La autorización (o la urgencia) quedó resuelta al firmar: no se corrige aquí
      set.data = { ...data, diagnoses: b.diagnoses, postop: { ...x, startAt: new Date(x!.startAt).toISOString(), endAt: new Date(x!.endAt).toISOString(), authorizationId: old.authorizationId, urgent: old.urgent, justification: old.justification } }
      what = 'nota postquirúrgica'
    } else if (format === 'dx' && kind === 'admission') {
      // NO2 (ronda 16): la nota de ingreso estándar se corrige con lo mismo que pide al firmarse
      if (!b.chiefComplaint) fail(400, 'Escribe el motivo de consulta.')
      if (!b.diagnoses.length) fail(400, 'Agrega al menos un diagnóstico en la impresión diagnóstica.')
      set.data = { ...data, diagnoses: b.diagnoses, chiefComplaint: b.chiefComplaint, history: b.history, exam: b.exam, observations: b.observations }
    } else if (format === 'dx') {
      if (!b.diagnoses.length && !b.evolution && !b.exam && !b.observations) fail(400, 'Escribe al menos un diagnóstico, la evolución, el examen físico o una observación.')
      set.data = { ...data, diagnoses: b.diagnoses, evolution: b.evolution || undefined, exam: b.exam, observations: b.observations }
    } else {
      const empty = ([['subjective', 'el subjetivo (S)'], ['objective', 'el objetivo (O)'], ['assessment', 'el análisis (A)'], ['plan', 'el plan (P)']] as const).find(([k]) => !b[k])
      if (empty) fail(400, `Escribe ${empty[1]}.`)
      Object.assign(set, { subjective: b.subjective, objective: b.objective, assessment: b.assessment, plan: b.plan })
      // NO3 (ronda 16): también la nota de ingreso SOAP corrige sus diagnósticos
      set.data = { ...data, diagnoses: b.diagnoses.length ? b.diagnoses : undefined }
    }
    if (kind === 'admission') what = 'nota de ingreso'
    const version = Number(n!.version ?? 1)
    const who = await patientName(String(h.patient_id))
    if (b.orders && kind !== 'admission' && kind !== 'evolution') fail(400, 'Esta nota no lleva órdenes.')
    let examBatch: string | undefined
    await sql.tx(async (q) => {
      // Las órdenes primero: si algo ya se cumplió, nada se guarda
      const fix = b.orders ? await correctOrders(q, h, n!, set.data, b.orders, user.id) : undefined
      if (fix) { set.data = fix.data; examBatch = fix.examBatch }
      const next = await saveVersion(q, { clinicId: cid, kind: 'note', id: String(n!.id), version, authorId: String(n!.author_id), at: String(n!.at), by: user.id, reason: b.reason,
        data: { subjective: n!.subjective, objective: n!.objective, assessment: n!.assessment, plan: n!.plan, text: n!.text, data, ...(fix ? fix.snapshot : {}) } })
      await q.run('UPDATE hosp_notes SET subjective = ?, objective = ?, assessment = ?, plan = ?, text = ?, data = ?, version = ? WHERE id = ?',
        [set.subjective, set.objective, set.assessment, set.plan, set.text, JSON.stringify(set.data), next, String(n!.id)])
      await audit(user, `Corrigió su ${what} de ${who} en el periodo de gracia (versión ${next})${fix?.changes.length ? `; órdenes: ${fix.changes.join('; ')}` : ''}${b.reason ? `: ${b.reason}` : ''}`, q)
    })
    res.json({ ...toInpatientNote((await sql.one('SELECT * FROM hosp_notes WHERE id = ?', [String(n!.id)]))!), examBatch })
  })

  app.post('/api/vitals/:vid/void', auth, need('vitals.record'), async (req, res) => {
    const { reason } = parse(z.object({ reason: z.string().trim().min(5, 'Escribe por qué se anula la toma.').max(300) }), req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    const r = (await sql.one('SELECT * FROM vitals WHERE id = ? AND clinic_id = ? AND hospitalization_id IS NOT NULL', [String(req.params.vid), cid])) ?? fail(404, 'La toma no existe.')
    if (r!.voided_at) fail(409, 'Esa toma ya estaba anulada.')
    const h = await activeHosp(cid, String(r!.hospitalization_id))
    await sql.run('UPDATE vitals SET voided_at = ?, voided_by = ?, void_reason = ? WHERE id = ?', [new Date().toISOString(), user.id, reason, String(r!.id)])
    await audit(user, `Anuló la toma de signos vitales de las ${String(r!.taken_at)} de ${await patientName(String(h.patient_id))}: ${reason}`)
    res.json({ ...toVitals((await sql.one('SELECT * FROM vitals WHERE id = ?', [String(r!.id)]))!), source: 'stay' })
  })

  /** El médico cambia cada cuántas horas se toman los signos: define la cuadrícula y las tomas esperadas. */
  app.patch('/api/inpatient/:id/vitals-frequency', auth, need('inpatient.orders'), async (req, res) => {
    const { everyHours } = parse(z.object({ everyHours: z.number().int().refine((x) => VITALS_FREQUENCIES.includes(x), 'Elige 1, 2, 4, 6, 8, 12 o 24 horas.') }), req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    const h = await activeHosp(cid, String(req.params.id))
    await sql.run('UPDATE hospitalizations SET vitals_every_hours = ? WHERE id = ?', [everyHours, String(h.id)])
    // MC6 (ronda 6): si la estancia ya tiene plan, el cambio es un tramo nuevo desde ahora (lo pasado no se recalcula)
    if (h.vitals_plan) await applyVitalsPlan(sql, h, { mode: 'hours', hours: everyHours }, user.id, new Date().toISOString())
    await audit(user, `Indicó signos vitales cada ${everyHours} h a ${await patientName(String(h.patient_id))}`)
    res.json(toHospitalization((await hospRow(cid, String(h.id)))!))
  })

  // ---------- Egreso ----------
  /**
   * MC5: la nota de egreso se escribe en la misma hoja que la epicrisis. Esto arma lo automático (datos del ingreso,
   * diagnósticos, HEA precargada, medicamentos administrados, procedimientos) como si el alta fuera ahora, y los exámenes
   * de la estancia que siguen pendientes.
   */
  app.get('/api/inpatient/:id/discharge-preview', auth, need('inpatient.orders'), async (req, res) => {
    const cid = clinicOf(req)
    const h = await activeHosp(cid, String(req.params.id))
    const data = await buildEpicrisis(sql, h)
    const exams = await examsWhere(sql, 'clinic_id = ? AND (hospitalization_id = ? OR (consultation_id IS NOT NULL AND consultation_id = ?))', [cid, String(h.id), String(h.consultation_id ?? '')])
    res.json({ ...data, pendingExams: exams.filter(isPending).map(examLine) })
  })

  app.post('/api/inpatient/:id/discharge', auth, need('inpatient.orders'), async (req, res) => {
    const b = parse(z.object({
      diagnoses: dx.min(1, 'Agrega el diagnóstico de egreso.'),
      summary: z.string().trim().min(10, 'Resume por qué ingresó y qué se le hizo.').max(6000),
      condition: z.string().trim().min(2, 'Indica la condición al egreso.').max(200),
      instructions: z.string().trim().max(3000).default(''),
      followUp: z.string().trim().max(300).optional(),
      items: z.array(z.object({
        drug: z.string().trim().min(1), presentation: z.string().default(''), dose: z.string().trim().min(1, 'Escribe la dosis.'), route: z.string().optional(),
        frequency: z.string().min(1), duration: z.string().trim().min(1, 'Escribe la duración.'), instructions: z.string().optional(), quantity: z.string().max(60).optional(), prnCondition: z.string().trim().max(120).optional(),
        // ME3 y ME4 (ronda 9): también en la receta de salida
        loadingDose: z.string().trim().max(60).optional(), nebulization: z.object({ components: z.array(z.object({ drug: z.string().trim().min(1, 'Escribe el medicamento de la nebulización.').max(160), amount: z.string().trim().min(1, 'Escribe la cantidad de cada medicamento de la nebulización.').max(40) })).min(1).max(NEB_MAX_COMPONENTS, `Una nebulización lleva hasta ${NEB_MAX_COMPONENTS} medicamentos.`),
    diluentVolume: z.string().trim().max(40).optional(), diluent: z.string().trim().max(80).optional() }).optional(),
      })).default([]),
      validityDays: validityInput,
      // MC5: HEA corregida, exámenes que se piden al alta y emitir la epicrisis con el mismo contenido
      hea: z.string().trim().max(6000).optional(),
      exams: z.array(examInput).max(40).default([]),
      issueEpicrisis: z.boolean().default(false),
    }), req.body)
    const user = userOf(req)
    const cid = clinicOf(req)
    const h = await activeHosp(cid, String(req.params.id))
    const id = String(h.id)
    const patientId = String(h.patient_id)
    if (b.items.length) await assertRxIdentity(cid, patientId)
    const now = new Date()
    const noteId = randomUUID()
    const rxId = b.items.length ? randomUUID() : null
    let folio: string | null = null
    let epicrisisId: string | undefined
    const name = await patientName(patientId)
    // Fuera de la transacción (una sola conexión): exámenes de la estancia sin resultado y quién firma la epicrisis
    const stayExams = await examsWhere(sql, 'clinic_id = ? AND (hospitalization_id = ? OR (consultation_id IS NOT NULL AND consultation_id = ?))', [cid, id, String(h.consultation_id ?? '')])
    const pendingExams = [...stayExams.filter(isPending).map(examLine), ...b.exams.map((e) => examLine(e))]
    const me = b.issueEpicrisis ? (await staffRow(user.id))! : undefined
    let examBatch: string | null = null
    let issued = false
    await sql.tx(async (q) => {
      if (rxId) {
        folio = await nextFolio(q, cid, now)
        const marks = await currentMarks(q, user.id)
        await q.run(`INSERT INTO prescriptions (id, folio, patient_id, doctor_id, consultation_id, hospitalization_id, issued_at, items, clinic_id, validity_days, signature_id, stamp_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [rxId, folio, patientId, user.id, noteId, id, now.toISOString(), JSON.stringify(b.items), cid, await rxValidityOf(q, user.id, b.validityDays), marks.signatureId, marks.stampId])
      }
      const data = { diagnoses: b.diagnoses, summary: b.summary, condition: b.condition, instructions: b.instructions, followUp: b.followUp, hea: b.hea || undefined,
        pendingExams: pendingExams.length ? pendingExams : undefined }
      await q.run(`INSERT INTO hosp_notes (id, clinic_id, hospitalization_id, kind, author_id, at, plan, data) VALUES (?,?,?,'discharge',?,?,?,?)`,
        [noteId, cid, id, user.id, now.toISOString(), b.instructions, JSON.stringify(data)])
      // Exámenes al alta: el paciente ya no está internado (externo = sólo la orden impresa; en la clínica, al área)
      examBatch = await insertExams(q, { clinicId: cid, patientId, hospitalizationId: id, noteId, by: user.id, at: now.toISOString(), inStay: false }, b.exams)
      // Al cerrar el expediente, las indicaciones que seguían activas dejan de generar dosis
      await q.run(`UPDATE hosp_meds SET stopped_at = ?, stopped_by = ?, stop_reason = 'Egreso' WHERE hospitalization_id = ? AND stopped_at IS NULL`, [now.toISOString(), user.id, id])
      await q.run(`UPDATE hospitalizations SET status = 'discharged', discharged_at = ?, discharged_by = ?, prescription_id = ? WHERE id = ?`,
        [now.toISOString(), user.id, rxId, id])
      // P1: al dar el alta en hospitalización se genera sola la epicrisis (borrador para revisar y emitir). En
      // observación es opcional: se genera con el botón
      if (h.kind === 'hospital') {
        const epi = await createEpicrisisDraft(q, (await q.one('SELECT * FROM hospitalizations WHERE id = ?', [id]))!, user.id)
        epicrisisId = epi.id
        // MC5: lo que se escribió en la nota de egreso es lo que se emite: si está completa, sale emitida con su firma
        if (me && !missingForIssue(epi.data).length) {
          const signed = { ...epi.data, doctor: { name: docName(me), license: me.license ? String(me.license) : undefined, signature: me.signature ? String(me.signature) : undefined, stamp: me.stamp ? String(me.stamp) : undefined } }
          await q.run(`UPDATE epicrises SET status = 'issued', data = ?, issued_by = ?, issued_at = ? WHERE id = ?`, [JSON.stringify(signed), user.id, now.toISOString(), epi.id])
          issued = true
        }
      }
      await audit(user, `Dio de alta a ${name}${folio ? ` con receta ${folio}` : ''}${b.exams.length ? `, ${b.exams.length} examen(es) pendientes al alta` : ''}${issued ? '; emitió la epicrisis' : epicrisisId ? '; se generó la epicrisis para revisar' : ''}`, q)
    })
    res.status(201).json({ hospitalization: toHospitalization((await hospRow(cid, id))!), prescriptionId: rxId, folio, epicrisisId, epicrisisIssued: issued, examBatch })
  })
}
