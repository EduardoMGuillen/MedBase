import { randomUUID } from 'node:crypto'
import type { Sql } from './sql.js'
import { createMedOrders, syncStayOrders, type OrderInput } from './medOrders.js'
import { authorizationBase, ensureHospitalAuthorization } from './authorizations.js'
import { referralDraft } from './routes/referrals.js'
import { doseTimes, medLabel } from '../src/lib/inpatient.js'
import { medicationOrder } from '../src/lib/format.js'
import type { Diagnosis, Patient, PrescriptionItem, ReferralData } from '../src/lib/types.js'

/**
 * Casos de demostración para probar cada estado de una estancia, con los mismos pasos y funciones que usa la
 * aplicación (órdenes con `syncStayOrders`/`createMedOrders`, autorizaciones con `ensureHospitalAuthorization`,
 * referencia con su borrador). Los pacientes son ficticios y los diagnósticos usan códigos de la CIE-11 MMS.
 *
 * Clínica Santa Brígida (Dr. Herrera):
 * - Rosa Funes: en observación desde hace 3 horas, suero hasta nueva orden, ondansetrón por 1 día y acetaminofén
 *   PRN; nota en formato Diagnóstico · Examen · Observaciones. Lista para "Pasar a hospitalización".
 * - Mario Velásquez: observación que pasó a hospitalización hace 2 días. Autorización de hospitalización pendiente,
 *   nota SOAP con indicaciones y un medicamento nuevo, nota en el segundo formato, un tratamiento de 1 día ya
 *   completado, dosis aplicadas y un laboratorio.
 * - Karen Cruz: ingreso directo desde la consulta externa, autorización de hospitalización firmada, autorización
 *   quirúrgica genérica pendiente y colecistectomía programada para mañana.
 *
 * Consultorio Dra. Ana López:
 * - Luis Amaya: en observación por crisis hipertensiva, con la dosis aplicada y su nota; listo para "Referencia".
 * - Sofía Mejía: observación de ayer cerrada con una referencia emitida al hospital (queda en Anexos).
 */

export const SCENARIO_PATIENT_IDS = ['pe1', 'pe2', 'pe3', 're1', 're2']

const HOUR = 3_600_000
const DOCTOR = 's-herrera'
const NURSE = 's-rios'
const OFFICE_DOCTOR = 's3-lopez'
const OFFICE_ASSISTANT = 's3-asistente'

/** Hora del día `dayOffset` (0 = hoy) en la hora local del servidor (Honduras). */
const dayAt = (dayOffset: number, h: number, m = 0) => { const d = new Date(); d.setDate(d.getDate() + dayOffset); d.setHours(h, m, 0, 0); return d }
const ago = (hours: number) => { const d = new Date(Date.now() - hours * HOUR); d.setSeconds(0, 0); d.setMinutes(Math.floor(d.getMinutes() / 5) * 5); return d }
/** Hora local sin zona, como se guarda el inicio de una cita. */
export const naive = (d: Date) => { const pad = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00` }
export const plusMin = (d: Date, min: number) => new Date(d.getTime() + min * 60_000)

const person = (id: string, firstName: string, lastName: string, birthDate: string, sex: 'F' | 'M', phone: string, extra: Partial<Patient>): Patient => ({
  id, record: '', firstName, lastName, birthDate, sex, phone, allergies: [], conditions: [], createdAt: new Date().toISOString(), ...extra,
})

const CLINIC_PATIENTS: Patient[] = [
  person('pe1', 'Rosa Amalia', 'Funes Calderón', '1979-07-08', 'F', '9741-2206', { dni: '0801-1979-11834', civilStatus: 'Casada', occupation: 'Comerciante',
    address: 'Tegucigalpa, Col. Kennedy, bloque 12', emergencyName: 'Héctor Funes', emergencyPhone: '9741-5530', emergencyRelation: 'Esposo' }),
  person('pe2', 'Mario Ernesto', 'Velásquez Sierra', '1956-02-19', 'M', '9512-6630', { dni: '0801-1956-02277', civilStatus: 'Casado', occupation: 'Jubilado',
    address: 'Tegucigalpa, Col. Miraflores, casa 22', conditions: ['Diabetes mellitus tipo 2'], emergencyName: 'Lidia Sierra', emergencyPhone: '9512-7741', emergencyRelation: 'Esposa' }),
  person('pe3', 'Karen Yolibeth', 'Cruz Padilla', '1991-11-03', 'F', '3318-4520', { dni: '0801-1991-20145', civilStatus: 'Soltera', occupation: 'Maestra',
    address: 'Comayagüela, Col. Torocagua', allergies: ['Sulfas'], emergencyName: 'Dora Padilla', emergencyPhone: '3318-9064', emergencyRelation: 'Madre' }),
]

const OFFICE_PATIENTS: Patient[] = [
  person('re1', 'Luis Fernando', 'Amaya Rosales', '1962-05-14', 'M', '9630-1188', { dni: '0801-1962-05530', civilStatus: 'Casado', occupation: 'Agricultor',
    address: 'Santa Lucía, Francisco Morazán', conditions: ['Hipertensión arterial'], emergencyName: 'Carmen Rosales', emergencyPhone: '9630-4471', emergencyRelation: 'Esposa' }),
  person('re2', 'Sofía Alejandra', 'Mejía Turcios', '1998-08-21', 'F', '8820-4413', { dni: '0801-1998-14420', civilStatus: 'Soltera', occupation: 'Estudiante',
    address: 'Tegucigalpa, Col. Las Colinas', emergencyName: 'Ana Turcios', emergencyPhone: '8820-1902', emergencyRelation: 'Madre' }),
]

const DX = {
  gastroenteritis: { code: '1A40.Z', label: 'Gastroenteritis o colitis infecciosa sin especificación del agente infeccioso', system: 'icd11' },
  dehydration: { code: '5C70.0', label: 'Deshidratación', system: 'icd11' },
  pneumonia: { code: 'CA40.0', label: 'Neumonía bacteriana', system: 'icd11' },
  diabetes: { code: '5A11', label: 'Diabetes mellitus tipo 2', system: 'icd11' },
  gallstones: { code: 'DC11', label: 'Colelitiasis', system: 'icd11' },
  hypertensiveCrisis: { code: 'BA03', label: 'Crisis hipertensiva', system: 'icd11' },
  hypertension: { code: 'BA00', label: 'Hipertensión esencial', system: 'icd11' },
  appendicitis: { code: 'DB10.0', label: 'Apendicitis aguda', system: 'icd11' },
} satisfies Record<string, Diagnosis>

const PATIENT_COLUMNS = ['id', 'record', 'first_name', 'last_name', 'birth_date', 'sex', 'phone', 'allergies', 'conditions', 'created_at', 'dni', 'civil_status', 'occupation',
  'address', 'emergency_name', 'emergency_phone', 'emergency_relation', 'background', 'clinic_id']

async function insertPatients(q: Sql, clinicId: string, patients: Patient[]) {
  // El expediente sigue la numeración de la clínica, para no chocar con los que ya existen
  const rec = await q.one<{ n: number }>(`SELECT COALESCE(MAX(CAST(SUBSTR(record, 5) AS INTEGER)), 0)::int AS n FROM patients WHERE clinic_id = ? AND record ~ '^EXP-[0-9]+$'`, [clinicId])
  let n = Number(rec!.n)
  for (const p of patients) {
    await q.run(`INSERT INTO patients (${PATIENT_COLUMNS.join(',')}) VALUES (${PATIENT_COLUMNS.map(() => '?').join(',')})`,
      [p.id, `EXP-${String(++n).padStart(5, '0')}`, p.firstName, p.lastName, p.birthDate, p.sex, p.phone, JSON.stringify(p.allergies), JSON.stringify(p.conditions), p.createdAt,
        p.dni ?? null, p.civilStatus ?? null, p.occupation ?? null, p.address ?? null, p.emergencyName ?? null, p.emergencyPhone ?? null, p.emergencyRelation ?? null, '{}', clinicId])
  }
}

export interface Visit {
  id: string; clinicId: string; patientId: string; doctorId: string; at: Date; reason: string; history: string; exam: string; observations?: string
  diagnoses: Diagnosis[]; indications: string[]; items: PrescriptionItem[]; stayKind: 'observation' | 'hospital'
  vitals: { by: string; systolic: number; diastolic: number; heartRate: number; respRate: number; temperature: number; spo2: number; weightKg?: number; glucose?: number; complaint: string }
}

/** Cita atendida, preclínica y consulta firmada con ingreso, igual que al firmar en la consulta externa (todos los medicamentos se aplican en la clínica). */
export async function signVisit(q: Sql, v: Visit) {
  const appt = `ap-${v.id}`
  const vit = `vt-${v.id}`
  const arrived = plusMin(v.at, -25)
  await q.run(`INSERT INTO appointments (id, patient_id, doctor_id, start, minutes, reason, type, status, arrived_at, source, clinic_id) VALUES (?,?,?,?,30,?,'urgent','done',?,'staff',?)`,
    [appt, v.patientId, v.doctorId, naive(arrived), v.reason, arrived.toISOString(), v.clinicId])
  const s = v.vitals
  await q.run(`INSERT INTO vitals (id, patient_id, appointment_id, taken_by, taken_at, systolic, diastolic, heart_rate, temperature, spo2, weight_kg, resp_rate, glucose, chief_complaint, clinic_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [vit, v.patientId, appt, s.by, plusMin(v.at, -15).toISOString(), s.systolic, s.diastolic, s.heartRate, s.temperature, s.spo2, s.weightKg ?? null, s.respRate, s.glucose ?? null, s.complaint, v.clinicId])
  const items = v.items.map((it) => ({ ...it, applyInClinic: true }))
  // Como el formulario: las órdenes son las indicaciones y después los medicamentos
  const orders = [...v.indications, ...items.map(medicationOrder)]
  await q.run(`INSERT INTO consultations (id, patient_id, doctor_id, appointment_id, date, reason, symptoms, history, exam, diagnoses, plan, vitals_id, prescription_id, orders, observations,
      clinic_id, indications, admit_kind, meds) VALUES (?,?,?,?,?,?,'[]',?,?,?,?,?,NULL,?,?,?,?,?,?)`,
    [v.id, v.patientId, v.doctorId, appt, v.at.toISOString(), v.reason, v.history, v.exam, JSON.stringify(v.diagnoses), orders.map((o, i) => `${i + 1}. ${o}`).join('\n'),
      vit, JSON.stringify(orders), v.observations ?? '', v.clinicId, JSON.stringify(v.indications), v.stayKind, JSON.stringify(items)])
  return vit
}

export async function openStay(q: Sql, v: Visit, stayId: string, phone: string, extra: { bedId?: string; companion?: [string, string, string] } = {}) {
  const [name, relation, cphone] = extra.companion ?? [null, null, null]
  await q.run(`INSERT INTO hospitalizations (id, clinic_id, patient_id, bed_id, consultation_id, admitted_at, admitted_by, reason, diagnoses, companion_name, companion_relation,
      companion_phone, patient_phone, status, kind) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?)`,
    [stayId, v.clinicId, v.patientId, extra.bedId ?? null, v.id, v.at.toISOString(), v.doctorId, v.reason, JSON.stringify(v.diagnoses), name, relation, cphone, phone, v.stayKind])
  await syncStayOrders(q, { clinicId: v.clinicId, hospitalizationId: stayId })
}

/** Nota de evolución como la guarda la API: indicaciones primero, luego los medicamentos nuevos (que van a la hoja). */
async function evolutionNote(q: Sql, o: {
  clinicId: string; stayId: string; patientId: string; authorId: string; at: Date; indications: string[]; meds?: OrderInput[]
  soap?: { s: string; o: string; a: string; p: string }; dx?: { diagnoses: Diagnosis[]; exam: string; observations: string }
}) {
  const id = randomUUID()
  const meds = o.meds ?? []
  const orders = [...o.indications, ...meds.map((m) => medLabel(m))]
  await q.run(`INSERT INTO hosp_notes (id, clinic_id, hospitalization_id, kind, author_id, at, subjective, objective, assessment, plan, data) VALUES (?,?,?,'evolution',?,?,?,?,?,?,?)`,
    [id, o.clinicId, o.stayId, o.authorId, o.at.toISOString(), o.soap?.s ?? '', o.soap?.o ?? '', o.soap?.a ?? '', o.soap?.p ?? '',
      JSON.stringify({ orders, checklist: false, indications: o.indications.length, ...(o.dx ? { format: 'dx', ...o.dx } : {}) })])
  if (meds.length) {
    await createMedOrders(q, { clinicId: o.clinicId, hospitalizationId: o.stayId, patientId: o.patientId, source: 'note', sourceId: id, orderedBy: o.authorId,
      orderedAt: o.at.toISOString(), items: meds })
  }
  return id
}

/**
 * Dosis aplicadas: todas las horas indicadas hasta `until` (las más recientes quedan por aplicar) y, de los PRN,
 * las que se indiquen. Quien aplica y la demora (5 a 15 min) imitan la hoja real.
 */
export async function giveDoses(q: Sql, clinicId: string, stayId: string, by: string, until: Date, prn: { drug: string; at: Date; note?: string }[] = []) {
  const meds = await q.query('SELECT * FROM hosp_meds WHERE hospitalization_id = ?', [stayId])
  let i = 0
  for (const m of meds) {
    const sched = { firstAt: String(m.first_at), everyHours: m.every_hours == null ? undefined : Number(m.every_hours), prn: !!m.prn, days: m.days == null ? undefined : Number(m.days),
      stoppedAt: m.stopped_at ? String(m.stopped_at) : undefined }
    for (const s of doseTimes(sched, new Date(sched.firstAt), until)) {
      if (s.omitted) continue
      await q.run(`INSERT INTO hosp_doses (id, clinic_id, med_id, scheduled_at, given_at, given_by, status) VALUES (?,?,?,?,?,?,'given')`,
        [randomUUID(), clinicId, String(m.id), s.at.toISOString(), plusMin(s.at, 5 + (i++ % 3) * 5).toISOString(), by])
    }
  }
  for (const d of prn) {
    const m = meds.find((x) => x.prn && x.drug === d.drug)
    if (m) await q.run(`INSERT INTO hosp_doses (id, clinic_id, med_id, given_at, given_by, status, note) VALUES (?,?,?,?,?,'given',?)`, [randomUUID(), clinicId, String(m.id), d.at.toISOString(), by, d.note ?? null])
  }
}

/** Cama libre (AD3: las camas no tienen especialidad; `specialty` queda como la del ingreso). */
async function freeBed(q: Sql, clinicId: string, _specialty: string, prefer: string) {
  const beds = await q.query(`SELECT b.id FROM beds b WHERE b.clinic_id = ? AND b.active
    AND NOT EXISTS (SELECT 1 FROM hospitalizations h WHERE h.bed_id = b.id AND h.status = 'active') ORDER BY b.id`, [clinicId])
  return beds.some((b) => b.id === prefer) ? prefer : beds[0] ? String(beds[0].id) : undefined
}

/** Hoja firmada de demostración (un PDF de texto) que se sube como respaldo de una autorización firmada. */
export async function signedSheet(q: Sql, clinicId: string, patientId: string, stayId: string, title: string, at: Date, by: string, pdf: (title: string, lines: string[]) => Uint8Array) {
  const id = randomUUID()
  const file = pdf(`${title} - firmada (demostracion)`, ['Copia de demostracion: en la clinica se sube la foto o el PDF de la hoja firmada.'])
  await q.run(`INSERT INTO attachments (id, patient_id, name, mime, size, category, data, uploaded_by, uploaded_at, clinic_id, title, taken_at, hospitalization_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, patientId, `${title}.pdf`, 'application/pdf', file.length, 'document', new Uint8Array(file), by, at.toISOString(), clinicId, title, at.toISOString(), stayId])
  return id
}

/** Los tres casos de la clínica. Sin camas libres de la especialidad, el caso que la necesita no se carga. */
export async function insertClinicScenarios(q: Sql, clinicId: string, pdf: (title: string, lines: string[]) => Uint8Array) {
  await insertPatients(q, clinicId, CLINIC_PATIENTS)

  // 1. Observación activa, lista para pasar a hospitalización
  const obsAt = ago(3)
  const obs: Visit = {
    id: 'ke-pe1', clinicId, patientId: 'pe1', doctorId: DOCTOR, at: obsAt, stayKind: 'observation', reason: 'Vómitos y diarrea líquida desde ayer',
    history: 'Paciente femenina de 47 años con 8 evacuaciones líquidas sin moco ni sangre y 5 vómitos de contenido alimentario desde hace 20 horas. No tolera la vía oral. Niega fiebre.',
    exam: 'General: Decaída, mucosas orales secas, llenado capilar de 3 segundos.\nAbdomen: Blando, depresible, ruidos intestinales aumentados, dolor difuso leve a la palpación, sin signos de irritación peritoneal.',
    diagnoses: [DX.gastroenteritis, DX.dehydration],
    indications: ['Nada por vía oral por 2 horas; luego líquidos claros a tolerancia.', 'Signos vitales cada 2 horas.', 'Control de ingesta y excreta.'],
    items: [
      { drug: 'Solución Hartmann', presentation: 'Bolsa 1000 mL', dose: '1000 mL', route: 'Intravenosa', frequency: 'Cada 8 horas', duration: '' },
      { drug: 'Ondansetrón', presentation: 'Ampolla 8 mg/4 mL', dose: '8 mg', route: 'Intravenosa', frequency: 'Cada 8 horas', duration: '1 día' },
      { drug: 'Acetaminofén', presentation: 'Tableta 500 mg', dose: '1 g', route: 'Oral', frequency: 'Por razón necesaria (PRN)', duration: '', instructions: 'Si dolor o temperatura de 38 °C o más.' },
    ],
    vitals: { by: NURSE, systolic: 98, diastolic: 62, heartRate: 108, respRate: 20, temperature: 37.2, spo2: 98, weightKg: 64, complaint: 'Vómitos y diarrea desde ayer, no tolera líquidos.' },
  }
  await signVisit(q, obs)
  await openStay(q, obs, 'he-pe1', '9741-2206')
  await giveDoses(q, clinicId, 'he-pe1', DOCTOR, ago(1))
  await evolutionNote(q, { clinicId, stayId: 'he-pe1', patientId: 'pe1', authorId: DOCTOR, at: ago(1), indications: ['Iniciar líquidos claros a tolerancia.'],
    dx: { diagnoses: [DX.gastroenteritis, DX.dehydration], exam: 'General: Mucosas semihúmedas, FC 92 lpm.\nAbdomen: Blando, sin dolor a la palpación.',
      observations: 'Sin vómitos desde que inició el suero. Dos evacuaciones líquidas en la última hora.' } })

  // 2. Observación que pasó a hospitalización hace 2 días: autorización de hospitalización pendiente de firma
  const bed2 = await freeBed(q, clinicId, 'Medicina interna', 'bed-101')
  if (bed2) {
    const at2 = ago(52)
    const pn: Visit = {
      id: 'ke-pe2', clinicId, patientId: 'pe2', doctorId: DOCTOR, at: at2, stayKind: 'observation', reason: 'Fiebre, tos con flema y dificultad para respirar',
      history: 'Paciente masculino de 70 años, diabético, con 4 días de fiebre no cuantificada, tos productiva amarillenta y disnea de medianos esfuerzos que hoy es de reposo.',
      exam: 'General: Taquipneico, hidratado.\nTórax: Estertores crepitantes en base pulmonar derecha, matidez a la percusión en la misma zona.',
      diagnoses: [DX.pneumonia, DX.diabetes],
      indications: ['Oxígeno por cánula nasal a 2 L/min para SpO₂ mayor de 92 %.', 'Glucometría antes de cada comida y a las 22:00.', 'Cabecera a 30 grados.'],
      items: [
        { drug: 'Ceftriaxona', presentation: 'Vial 1 g', dose: '1 g', route: 'Intravenosa', frequency: 'Cada 12 horas', duration: '7 días' },
        { drug: 'Salbutamol', presentation: 'Solución para nebulizar 5 mg/mL', dose: '0.5 mL', route: 'Inhalada', frequency: 'Cada 6 horas', duration: '1 día', instructions: 'Nebulizado en 3 mL de solución salina.' },
        { drug: 'Acetaminofén', presentation: 'Tableta 500 mg', dose: '1 g', route: 'Oral', frequency: 'Por razón necesaria (PRN)', duration: '', instructions: 'Si temperatura de 38 °C o más.' },
      ],
      vitals: { by: NURSE, systolic: 136, diastolic: 82, heartRate: 104, respRate: 26, temperature: 38.6, spo2: 89, weightKg: 78, glucose: 212, complaint: 'Fiebre, tos y falta de aire desde hace 4 días.' },
    }
    await signVisit(q, pn)
    await openStay(q, pn, 'he-pe2', '9512-6630')
    // Seis horas después pasó de observación a hospitalización (la misma estancia, con cama)
    const converted = ago(46)
    await q.run(`UPDATE hospitalizations SET kind = 'hospital', bed_id = ?, observation_at = admitted_at, admitted_at = ?, converted_at = ?, converted_by = ?,
        companion_name = 'Lidia Sierra', companion_relation = 'Esposa', companion_phone = '9512-7741' WHERE id = 'he-pe2'`, [bed2, converted.toISOString(), converted.toISOString(), DOCTOR])
    await syncStayOrders(q, { clinicId, hospitalizationId: 'he-pe2', firstNotBefore: converted.toISOString() })
    await ensureHospitalAuthorization(q, (await q.one(`SELECT * FROM hospitalizations WHERE id = 'he-pe2'`))!, { id: DOCTOR, role: 'doctor' })
    await q.run(`UPDATE authorizations SET created_at = ? WHERE hospitalization_id = 'he-pe2'`, [converted.toISOString()])
    await evolutionNote(q, { clinicId, stayId: 'he-pe2', patientId: 'pe2', authorId: DOCTOR, at: ago(26),
      soap: {
        s: 'Refiere menos dificultad para respirar. Tos productiva persistente. Durmió bien.',
        o: 'PA 128/78, FC 92, FR 22, T 37.6 °C, SpO₂ 93 % con oxígeno a 2 L/min. Estertores crepitantes en base derecha. Glucometrías de 168 a 190 mg/dL.',
        a: 'Neumonía bacteriana en mejoría clínica. Diabetes con hiperglucemia leve por la infección.',
        p: 'Continuar antibiótico. Profilaxis de trombosis. Insulina según glucometría.',
      },
      indications: ['Fisioterapia respiratoria cada 8 horas.', 'Dieta para diabético de 1800 kcal.', 'Deambulación asistida.'],
      meds: [
        { drug: 'Enoxaparina', presentation: 'Jeringa prellenada 40 mg', dose: '40 mg', route: 'Subcutánea', everyHours: 24, prn: false, firstAt: ago(24).toISOString() },
        { drug: 'Insulina rápida', dose: 'Según escala', route: 'Subcutánea', prn: true, firstAt: ago(25).toISOString(), instructions: 'Glucometría 180-250: 4 UI; 251-300: 6 UI; más de 300: 8 UI y avisar.' },
      ] })
    await evolutionNote(q, { clinicId, stayId: 'he-pe2', patientId: 'pe2', authorId: DOCTOR, at: ago(3),
      dx: { diagnoses: [DX.pneumonia, DX.diabetes],
        exam: 'Tórax: Estertores crepitantes basales derechos, menos que ayer.\nSignos: SpO₂ 95 % con oxígeno a 2 L/min, T 36.9 °C.',
        observations: 'Afebril desde hace 24 horas. Tolera la dieta. Se mantiene el antibiótico; el salbutamol terminó sus días.' },
      indications: ['Retirar el oxígeno si la SpO₂ es mayor de 93 % al aire ambiente.'] })
    await q.run(`INSERT INTO hosp_notes (id, clinic_id, hospitalization_id, kind, author_id, at, text) VALUES (?,?,'he-pe2','nursing',?,?,?)`,
      [randomUUID(), clinicId, NURSE, ago(30).toISOString(), 'Paciente pasó la noche tranquilo. Tos productiva con esputo amarillento. Glucometría de la noche: 196 mg/dL, se aplicaron 4 UI de insulina rápida.'])
    await giveDoses(q, clinicId, 'he-pe2', NURSE, ago(1), [
      { drug: 'Acetaminofén', at: ago(51), note: 'T 38.7 °C.' },
      { drug: 'Insulina rápida', at: ago(14), note: 'Glucometría 196 mg/dL: 4 UI.' },
    ])
    const lab = pdf('Hemograma - Laboratorio de demostracion', ['Leucocitos 17 300 /mm3', 'Neutrofilos 84 %', 'Hemoglobina 13.2 g/dl', 'Plaquetas 286 000 /mm3'])
    await q.run(`INSERT INTO attachments (id, patient_id, name, mime, size, category, data, uploaded_by, uploaded_at, clinic_id, title, taken_at, hospitalization_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [randomUUID(), 'pe2', 'Hemograma.pdf', 'application/pdf', lab.length, 'lab', new Uint8Array(lab), NURSE, ago(51).toISOString(), clinicId, 'Hemograma', ago(51.5).toISOString(), 'he-pe2'])
  }

  // 3. Ingreso directo desde la consulta externa, con cirugía programada
  const bed3 = await freeBed(q, clinicId, 'Cirugía', 'bed-202')
  if (bed3) {
    const at3 = ago(16)
    const gb: Visit = {
      id: 'ke-pe3', clinicId, patientId: 'pe3', doctorId: DOCTOR, at: at3, stayKind: 'hospital', reason: 'Dolor en hipocondrio derecho después de comer',
      history: 'Paciente femenina de 34 años con tres episodios de dolor cólico en hipocondrio derecho en una semana, después de comidas grasas, con náuseas. Ultrasonido externo con múltiples litos en vesícula.',
      exam: 'Abdomen: Blando, dolor a la palpación en hipocondrio derecho, Murphy negativo, sin masas.',
      diagnoses: [DX.gallstones],
      indications: ['Nada por vía oral desde las 22:00.', 'Signos vitales cada 4 horas.', 'Exámenes prequirúrgicos: hemograma, tiempos de coagulación, glucosa y creatinina.'],
      items: [
        { drug: 'Omeprazol', presentation: 'Vial 40 mg', dose: '40 mg', route: 'Intravenosa', frequency: 'Cada 24 horas', duration: '' },
        { drug: 'Ketorolaco', presentation: 'Ampolla 30 mg/mL', dose: '30 mg', route: 'Intravenosa', frequency: 'Cada 8 horas', duration: '2 días' },
        { drug: 'Tramadol', presentation: 'Ampolla 50 mg/mL', dose: '50 mg', route: 'Intravenosa', frequency: 'Por razón necesaria (PRN)', duration: '', instructions: 'Si dolor de 7/10 o más.' },
      ],
      vitals: { by: NURSE, systolic: 118, diastolic: 74, heartRate: 88, respRate: 18, temperature: 36.8, spo2: 99, weightKg: 70, complaint: 'Dolor en el lado derecho del abdomen después de comer.' },
    }
    await signVisit(q, gb)
    await openStay(q, gb, 'he-pe3', '3318-4520', { bedId: bed3, companion: ['Dora Padilla', 'Madre', '3318-9064'] })
    const stay3 = (await q.one(`SELECT * FROM hospitalizations WHERE id = 'he-pe3'`))!
    const { authorization } = await ensureHospitalAuthorization(q, stay3, { id: DOCTOR, role: 'doctor' })
    const signedAt = plusMin(at3, 40)
    const file = await signedSheet(q, clinicId, 'pe3', 'he-pe3', 'Autorizacion de hospitalizacion', signedAt, NURSE, pdf)
    await q.run(`UPDATE authorizations SET status = 'signed', file_id = ?, status_at = ?, status_by = ?, created_at = ? WHERE id = ?`,
      [file, signedAt.toISOString(), NURSE, plusMin(at3, 5).toISOString(), authorization.id])
    // Autorización quirúrgica con el texto genérico: sólo procedimiento y diagnóstico (el de la estancia)
    const base = await authorizationBase(q, stay3, { id: DOCTOR, role: 'doctor' })
    const surgical = { procedure: 'Colecistectomía laparoscópica o abierta', diagnosis: DX.gallstones.label, generic: true,
      companion: { name: 'Dora Padilla', phone: '3318-9064', relation: 'Madre' }, ...base, admission: undefined }
    await q.run(`INSERT INTO authorizations (id, clinic_id, hospitalization_id, patient_id, template, data, created_by, created_at) VALUES (?,?,'he-pe3','pe3','surgical',?,?,?)`,
      [randomUUID(), clinicId, JSON.stringify(surgical), DOCTOR, ago(2).toISOString()])
    await q.run(`INSERT INTO hosp_procedures (id, clinic_id, hospitalization_id, kind, name, scheduled_at, status, created_by, created_at) VALUES (?,?,'he-pe3','procedure',?,?,'pending',?,?)`,
      [randomUUID(), clinicId, 'Colecistectomía laparoscópica', dayAt(1, 7).toISOString(), DOCTOR, ago(2).toISOString()])
    await evolutionNote(q, { clinicId, stayId: 'he-pe3', patientId: 'pe3', authorId: DOCTOR, at: ago(2.5),
      soap: {
        s: 'Dolor de 3/10, sin náuseas. Durmió bien.',
        o: 'PA 114/70, FC 76, T 36.6 °C. Abdomen blando, dolor leve en hipocondrio derecho. Exámenes prequirúrgicos normales.',
        a: 'Colelitiasis sintomática. Apta para cirugía.',
        p: 'Colecistectomía laparoscópica mañana a las 07:00. Firmar la autorización quirúrgica.',
      },
      indications: ['Dieta líquida hasta las 22:00; luego nada por vía oral.', 'Retirar esmalte de uñas y prendas.'] })
    await giveDoses(q, clinicId, 'he-pe3', NURSE, ago(1), [{ drug: 'Tramadol', at: plusMin(at3, 90), note: 'Dolor 7/10.' }])
  }
}

/** Los dos casos del consultorio: una observación lista para referir y una ya referida. */
export async function insertOfficeScenarios(q: Sql, clinicId: string) {
  await insertPatients(q, clinicId, OFFICE_PATIENTS)

  // 4. Observación lista para "Referencia"
  const htnAt = ago(2)
  const htn: Visit = {
    id: 'ke-re1', clinicId, patientId: 're1', doctorId: OFFICE_DOCTOR, at: htnAt, stayKind: 'observation', reason: 'Dolor de cabeza intenso y presión alta',
    history: 'Paciente masculino de 64 años, hipertenso, sin tomar su losartán desde hace una semana. Cefalea occipital intensa desde la mañana, visión borrosa y náuseas. Niega dolor torácico y debilidad en extremidades.',
    exam: 'General: Ansioso, orientado.\nNeurológico: Sin déficit motor ni sensitivo, pupilas isocóricas, sin rigidez de nuca.',
    diagnoses: [DX.hypertensiveCrisis, DX.hypertension],
    indications: ['Reposo en camilla con cabecera a 30 grados.', 'Presión arterial cada 15 minutos.'],
    items: [
      { drug: 'Captopril', presentation: 'Tableta 25 mg', dose: '25 mg', route: 'Sublingual', frequency: 'Dosis única', duration: '' },
      { drug: 'Acetaminofén', presentation: 'Tableta 500 mg', dose: '1 g', route: 'Oral', frequency: 'Por razón necesaria (PRN)', duration: '', instructions: 'Si cefalea.' },
    ],
    vitals: { by: OFFICE_ASSISTANT, systolic: 196, diastolic: 118, heartRate: 88, respRate: 18, temperature: 36.7, spo2: 97, weightKg: 82, complaint: 'Dolor de cabeza fuerte y visión borrosa desde la mañana.' },
  }
  await signVisit(q, htn)
  await openStay(q, htn, 'he-re1', '9630-1188')
  await giveDoses(q, clinicId, 'he-re1', OFFICE_DOCTOR, new Date(), [{ drug: 'Acetaminofén', at: plusMin(htnAt, 10), note: 'Cefalea 8/10.' }])
  await evolutionNote(q, { clinicId, stayId: 'he-re1', patientId: 're1', authorId: OFFICE_DOCTOR, at: plusMin(htnAt, 70),
    dx: { diagnoses: [DX.hypertensiveCrisis, DX.hypertension], exam: 'Signos: PA 182/112 mmHg a los 60 minutos del captopril.\nNeurológico: Sin déficit focal.',
      observations: 'Persisten la cefalea y la visión borrosa. No baja la presión: se refiere al hospital para estudio de daño a órgano blanco.' },
    indications: ['Preparar la referencia al hospital.'] })

  // 5. Observación de ayer cerrada con una referencia emitida
  const appAt = ago(26)
  const ap: Visit = {
    id: 'ke-re2', clinicId, patientId: 're2', doctorId: OFFICE_DOCTOR, at: appAt, stayKind: 'observation', reason: 'Dolor abdominal que empezó en el ombligo',
    history: 'Paciente femenina de 28 años con dolor abdominal de 14 horas que inició periumbilical y migró a fosa ilíaca derecha, con náuseas, un vómito e hiporexia. Fecha de última menstruación hace 2 semanas.',
    exam: 'Abdomen: Dolor en fosa ilíaca derecha, McBurney positivo, rebote positivo, Rovsing positivo.',
    diagnoses: [DX.appendicitis],
    indications: ['Nada por vía oral.', 'Canalizar vena periférica.'],
    items: [
      { drug: 'Solución salina 0.9 %', presentation: 'Bolsa 1000 mL', dose: '1000 mL', route: 'Intravenosa', frequency: 'Cada 8 horas', duration: '' },
      { drug: 'Ondansetrón', presentation: 'Ampolla 4 mg/2 mL', dose: '4 mg', route: 'Intravenosa', frequency: 'Dosis única', duration: '' },
    ],
    vitals: { by: OFFICE_ASSISTANT, systolic: 112, diastolic: 70, heartRate: 102, respRate: 20, temperature: 38.1, spo2: 98, weightKg: 58, complaint: 'Dolor de estómago desde anoche, ahora en el lado derecho.' },
  }
  await signVisit(q, ap)
  await openStay(q, ap, 'he-re2', '8820-4413')
  const issued = plusMin(appAt, 50)
  await giveDoses(q, clinicId, 'he-re2', OFFICE_DOCTOR, issued)
  const stay = (await q.one(`SELECT * FROM hospitalizations WHERE id = 'he-re2'`))!
  const destination = 'Hospital Escuela, emergencia de cirugía'
  const data: ReferralData = { ...(await referralDraft(q, clinicId, stay, OFFICE_DOCTOR)), condition: 'Estable, consciente, con vía periférica permeable', destination }
  const year = issued.getFullYear()
  const last = await q.one<{ n: number | null }>(`SELECT MAX(CAST(split_part(number, '-', 3) AS INTEGER))::int AS n FROM referrals WHERE clinic_id = ? AND number LIKE ?`, [clinicId, `REF-${year}-%`])
  await q.run(`INSERT INTO referrals (id, clinic_id, hospitalization_id, patient_id, number, data, destination, issued_by, issued_at) VALUES (?,?,'he-re2','re2',?,?,?,?,?)`,
    [randomUUID(), clinicId, `REF-${year}-${String((last?.n ?? 0) + 1).padStart(4, '0')}`, JSON.stringify(data), destination, OFFICE_DOCTOR, issued.toISOString()])
  await q.run(`UPDATE hospitalizations SET status = 'discharged', discharged_at = ?, discharged_by = ?, outcome = 'referred', outcome_note = ? WHERE id = 'he-re2'`,
    [issued.toISOString(), OFFICE_DOCTOR, destination])
  await q.run(`UPDATE hosp_meds SET stopped_at = ?, stopped_by = ?, stop_reason = 'Referido' WHERE hospitalization_id = 'he-re2' AND stopped_at IS NULL`, [issued.toISOString(), OFFICE_DOCTOR])
}
