import type { Appointment, ClinicSettings, Consultation, Patient, Payment, Prescription, Schedule, Service, Staff, Vitals } from './types'
import { ICD10 } from './catalogs'

export const CLINIC = {
  name: 'Clínica Santa Brígida',
  address: 'Col. Palmira, Av. República de Chile #412',
  phone: '+504 2232-7710',
}

export const STAFF: Staff[] = [
  { id: 's-admin', name: 'Roberto Aguilar', role: 'admin', email: 'admin@demo.clinara', color: '#5B6472', active: true },
  { id: 's-herrera', name: 'Dra. Lucía Herrera', role: 'doctor', specialty: 'Medicina interna', email: 'lherrera@demo.clinara', license: 'CMH-08812', color: '#2335C9', active: true },
  { id: 's-paz', name: 'Dr. Andrés Paz', role: 'doctor', specialty: 'Pediatría', email: 'apaz@demo.clinara', license: 'CMH-11420', color: '#0F8A6E', active: true },
  { id: 's-zuniga', name: 'Dra. Mariela Zúniga', role: 'doctor', specialty: 'Ginecología y obstetricia', email: 'mzuniga@demo.clinara', license: 'CMH-09931', color: '#B4407A', active: true },
  { id: 's-rios', name: 'Lic. Carmen Ríos', role: 'nurse', email: 'crios@demo.clinara', color: '#C27A12', active: true },
  { id: 's-mejia', name: 'Sofía Mejía', role: 'reception', email: 'smejia@demo.clinara', color: '#6A4BC4', active: true },
]

const p = (
  id: string, record: string, firstName: string, lastName: string, birthDate: string, sex: 'F' | 'M',
  phone: string, extra: Partial<Patient> = {},
): Patient => ({
  id, record, firstName, lastName, birthDate, sex, phone, allergies: [], conditions: [],
  createdAt: '2025-02-10T09:00:00', ...extra,
})

export const PATIENTS: Patient[] = [
  p('p1', 'EXP-00412', 'María José', 'Castillo Reyes', '1984-03-12', 'F', '9876-1123', { bloodType: 'O+', allergies: ['Penicilina'], conditions: ['Hipertensión arterial'], insurance: 'Seguros Atlántida' }),
  p('p2', 'EXP-00413', 'Carlos Eduardo', 'Banegas', '1967-11-02', 'M', '9455-2201', { bloodType: 'A+', conditions: ['Diabetes tipo 2', 'Dislipidemia'] }),
  p('p3', 'EXP-00420', 'Valentina', 'Ordóñez Pineda', '2019-06-25', 'F', '3311-8890', { bloodType: 'B+', allergies: ['AINEs'] }),
  p('p4', 'EXP-00431', 'Jorge Luis', 'Matute', '1991-01-30', 'M', '9988-0145', { bloodType: 'O-', insurance: 'Mapfre' }),
  p('p5', 'EXP-00438', 'Ana Gabriela', 'Fiallos', '1996-09-14', 'F', '8812-4433', { bloodType: 'A-', conditions: ['Embarazo 24 semanas'] }),
  p('p6', 'EXP-00447', 'Héctor', 'Mondragón Sierra', '1958-04-08', 'M', '9701-6620', { bloodType: 'AB+', allergies: ['Sulfas'], conditions: ['EPOC'] }),
  p('p7', 'EXP-00452', 'Daniela', 'Rivera Cáceres', '2002-12-19', 'F', '3190-7765', {}),
  p('p8', 'EXP-00460', 'Mateo', 'Galeano', '2015-02-03', 'M', '9620-1180', { allergies: ['Metamizol'], conditions: ['Asma'] }),
  p('p9', 'EXP-00466', 'Rosa Elena', 'Turcios', '1973-07-21', 'F', '9433-5532', { bloodType: 'O+', conditions: ['Hipotiroidismo'], insurance: 'Seguros Atlántida' }),
  p('p10', 'EXP-00471', 'Fernando', 'Alvarado Lanza', '1988-10-10', 'M', '8890-2314', {}),
]

/** Fecha ISO local de hoy a una hora dada, para que la demo siempre tenga agenda viva. */
function at(dayOffset: number, h: number, m = 0) {
  const d = new Date()
  d.setDate(d.getDate() + dayOffset)
  d.setHours(h, m, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
}

let n = 0
const a = (
  patientId: string, doctorId: string, day: number, h: number, m: number, minutes: number,
  reason: string, status: Appointment['status'], type: Appointment['type'] = 'followup',
): Appointment => ({ id: `a${++n}`, patientId, doctorId, start: at(day, h, m), minutes, reason, status, type })

export function seedAppointments(): Appointment[] {
  n = 0
  return [
    a('p2', 's-herrera', 0, 8, 0, 30, 'Control de glucosa', 'done'),
    a('p9', 's-herrera', 0, 8, 30, 30, 'Revisión de laboratorios', 'done'),
    a('p1', 's-herrera', 0, 9, 30, 30, 'Dolor de garganta y fiebre', 'triaged', 'first'),
    a('p6', 's-herrera', 0, 10, 0, 45, 'Disnea de esfuerzo', 'arrived'),
    a('p10', 's-herrera', 0, 11, 0, 30, 'Chequeo general', 'confirmed', 'first'),
    a('p4', 's-herrera', 0, 14, 0, 30, 'Lumbalgia', 'scheduled'),
    a('p7', 's-herrera', 0, 15, 30, 30, 'Cefalea recurrente', 'scheduled', 'first'),
    a('p3', 's-paz', 0, 8, 30, 30, 'Control niño sano', 'done'),
    a('p8', 's-paz', 0, 9, 0, 30, 'Crisis asmática leve', 'arrived', 'urgent'),
    a('p3', 's-paz', 0, 13, 0, 30, 'Vacunación', 'confirmed'),
    a('p5', 's-zuniga', 0, 9, 0, 45, 'Control prenatal', 'in_consult'),
    a('p9', 's-zuniga', 0, 11, 30, 30, 'Papanicolaou', 'confirmed'),
    a('p7', 's-zuniga', 0, 16, 0, 30, 'Consulta anticonceptivos', 'scheduled', 'first'),
    a('p1', 's-herrera', 1, 9, 0, 30, 'Seguimiento presión arterial', 'scheduled'),
    a('p2', 's-herrera', 2, 10, 0, 30, 'Control de glucosa', 'scheduled'),
    a('p5', 's-zuniga', 3, 9, 0, 45, 'Ultrasonido obstétrico', 'scheduled'),
    a('p4', 's-paz', -1, 10, 0, 30, 'Consulta', 'no_show'),
  ]
}

export function seedClinical() {
  const vitals: Vitals[] = [
    { id: 'v1', patientId: 'p1', appointmentId: 'a3', takenBy: 's-rios', takenAt: at(0, 9, 22), systolic: 128, diastolic: 84, heartRate: 96, temperature: 38.4, spo2: 97, weightKg: 68, heightCm: 162, painScale: 5, notes: 'Refiere odinofagia desde hace 3 días.' },
    { id: 'v0', patientId: 'p1', takenBy: 's-rios', takenAt: at(-62, 10, 5), systolic: 142, diastolic: 92, heartRate: 78, temperature: 36.7, spo2: 98, weightKg: 69.5, heightCm: 162 },
    { id: 'v2', patientId: 'p2', takenBy: 's-rios', takenAt: at(0, 7, 55), systolic: 134, diastolic: 82, heartRate: 74, temperature: 36.5, spo2: 98, weightKg: 91, heightCm: 174 },
  ]
  const consultations: Consultation[] = [
    {
      id: 'c1', patientId: 'p1', doctorId: 's-herrera', date: at(-62, 10, 15), reason: 'Control de presión arterial',
      symptoms: ['Cefalea', 'Mareo'], history: 'Paciente con HTA diagnosticada hace 2 años, refiere cefalea occipital matutina.',
      exam: 'TA 142/92. Ruidos cardíacos rítmicos, sin soplos. Sin edema.', diagnoses: [{ code: 'I10', label: 'Hipertensión esencial (primaria)' }],
      plan: 'Ajuste de antihipertensivo. Dieta hiposódica. Control en 2 meses con perfil lipídico.', vitalsId: 'v0', prescriptionId: 'rx1',
    },
    {
      id: 'c2', patientId: 'p2', doctorId: 's-herrera', appointmentId: 'a1', date: at(0, 8, 5), reason: 'Control de glucosa',
      symptoms: ['Fatiga'], history: 'DM2 en tratamiento con metformina. Glucosa en ayunas 148 mg/dL.',
      exam: 'Pies sin lesiones, pulsos pedios presentes.', diagnoses: [{ code: 'E11.9', label: 'Diabetes mellitus tipo 2 sin complicaciones' }],
      plan: 'Continuar metformina. HbA1c en 3 meses.', vitalsId: 'v2', prescriptionId: 'rx2',
    },
  ]
  const prescriptions: Prescription[] = [
    { id: 'rx1', folio: 'RX-2026-0912', patientId: 'p1', doctorId: 's-herrera', consultationId: 'c1', issuedAt: at(-62, 10, 30), items: [
      { drug: 'Losartán', presentation: 'Tableta 50 mg', dose: '1 tableta', frequency: 'Cada 24 horas', duration: '60 días', instructions: 'Tomar por la mañana.' },
    ] },
    { id: 'rx2', folio: 'RX-2026-1044', patientId: 'p2', doctorId: 's-herrera', consultationId: 'c2', issuedAt: at(0, 8, 25), items: [
      { drug: 'Metformina', presentation: 'Tableta 850 mg', dose: '1 tableta', frequency: 'Cada 12 horas', duration: '90 días', instructions: 'Con los alimentos.' },
      { drug: 'Atorvastatina', presentation: 'Tableta 20 mg', dose: '1 tableta', frequency: 'Cada 24 horas', duration: '90 días', instructions: 'Por la noche.' },
    ] },
  ]
  return { vitals, consultations, prescriptions }
}

// ---------- Configuración, servicios y horarios ----------

export const DEFAULT_SETTINGS: ClinicSettings = {
  name: CLINIC.name,
  address: CLINIC.address,
  phone: CLINIC.phone,
  email: 'citas@santabrigida.hn',
  currency: 'L',
  rxValidityDays: 30,
  reminderTemplate: 'Hola {paciente}, le recordamos su cita en {clinica} con {medico} el {fecha} a las {hora}. Responda SÍ para confirmar o llámenos al {telefono} si necesita cambiarla.',
}

export const SERVICES: Service[] = [
  { id: 'svc-gen', name: 'Consulta general', price: 500, active: true },
  { id: 'svc-mi', name: 'Consulta de medicina interna', price: 800, active: true },
  { id: 'svc-ped', name: 'Consulta pediátrica', price: 700, active: true },
  { id: 'svc-gin', name: 'Consulta ginecológica', price: 900, active: true },
  { id: 'svc-vac', name: 'Aplicación de vacuna', price: 350, active: true },
  { id: 'svc-neb', name: 'Nebulización', price: 250, active: true },
  { id: 'svc-ecg', name: 'Electrocardiograma', price: 600, active: true },
  { id: 'svc-pap', name: 'Papanicolaou', price: 650, active: true },
  { id: 'svc-cur', name: 'Curación', price: 300, active: true },
]

export const DOCTOR_SETUP: Record<string, { schedule: Schedule; serviceId: string }> = {
  's-herrera': { schedule: { days: [1, 2, 3, 4, 5], start: '08:00', end: '17:00', slot: 30 }, serviceId: 'svc-mi' },
  's-paz': { schedule: { days: [1, 2, 3, 4, 5, 6], start: '08:00', end: '14:00', slot: 30 }, serviceId: 'svc-ped' },
  's-zuniga': { schedule: { days: [1, 3, 5], start: '09:00', end: '17:00', slot: 30 }, serviceId: 'svc-gin' },
}

// ---------- Historial sintético para que los reportes tengan datos ----------
const FIRST_F = ['Karla', 'Lourdes', 'Gabriela', 'Patricia', 'Andrea', 'Claudia', 'Fátima', 'Iris', 'Sandra', 'Yolanda', 'Paola', 'Melissa', 'Cinthia', 'Marta', 'Elena']
const FIRST_M = ['José', 'Luis', 'Kevin', 'Óscar', 'Mario', 'Javier', 'Ricardo', 'Edwin', 'Marvin', 'Nelson', 'Wilmer', 'César', 'Raúl', 'Hugo', 'Bryan']
const LAST = ['Martínez', 'López', 'Hernández', 'Flores', 'Zelaya', 'Aguilar', 'Rodríguez', 'Mejía', 'Cruz', 'Ramos', 'Ortiz', 'Murillo', 'Espinoza', 'Valladares', 'Canales', 'Bonilla', 'Sosa', 'Maradiaga']
const REASONS: Record<string, [string, string][]> = {
  's-herrera': [['Control de presión arterial', 'I10'], ['Dolor de garganta', 'J02.9'], ['Control de glucosa', 'E11.9'], ['Gastritis', 'K29.7'], ['Dolor lumbar', 'M54.5'], ['Chequeo general', 'Z00.0'], ['Cefalea', 'G43.9'], ['Ardor al orinar', 'N39.0']],
  's-paz': [['Fiebre y tos', 'J20.9'], ['Diarrea', 'A09'], ['Control niño sano', 'Z00.0'], ['Dolor de oído', 'H66.9'], ['Resfriado', 'J00'], ['Crisis asmática', 'J45.9']],
  's-zuniga': [['Control prenatal', 'O26.9'], ['Papanicolaou', 'Z00.0'], ['Infección urinaria', 'N39.0'], ['Consulta anticonceptivos', 'Z00.0']],
}

function rng(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
}

export function seedHistory(days = 60) {
  const rand = rng(20261019)
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)]
  const patients: Patient[] = []
  for (let i = 0; i < 48; i++) {
    const f = rand() < 0.55
    const year = 1950 + Math.floor(rand() * 70)
    patients.push(p(`h${i}`, `EXP-${String(300 + i).padStart(5, '0')}`, pick(f ? FIRST_F : FIRST_M), `${pick(LAST)} ${pick(LAST)}`,
      `${year}-${String(1 + Math.floor(rand() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rand() * 28)).padStart(2, '0')}`,
      f ? 'F' : 'M', `9${Math.floor(100 + rand() * 900)}-${Math.floor(1000 + rand() * 9000)}`, { createdAt: at(-days - 30, 9) }))
  }
  const appointments: Appointment[] = []
  const consultations: Consultation[] = []
  const payments: Payment[] = []
  let receipt = 0
  for (let d = days; d >= 1; d--) {
    const date = new Date(); date.setDate(date.getDate() - d)
    for (const [doc, setup] of Object.entries(DOCTOR_SETUP)) {
      if (!setup.schedule.days.includes(date.getDay())) continue
      const n = 2 + Math.floor(rand() * 4)
      const used = new Set<number>()
      for (let k = 0; k < n; k++) {
        let slot = Math.floor(rand() * 10)
        while (used.has(slot)) slot = (slot + 1) % 10
        used.add(slot)
        const startH = Number(setup.schedule.start.slice(0, 2))
        const h = startH + Math.floor(slot / 2)
        const m = (slot % 2) * 30
        const [reason, code] = pick(REASONS[doc])
        const r = rand()
        const status = r < 0.82 ? 'done' : r < 0.93 ? 'no_show' : 'cancelled'
        const pt = pick(patients)
        const id = `ha${appointments.length}`
        appointments.push({ id, patientId: pt.id, doctorId: doc, start: at(-d, h, m), minutes: 30, reason, type: rand() < 0.3 ? 'first' : 'followup', status, source: rand() < 0.35 ? 'online' : 'staff' })
        if (status !== 'done') continue
        const dx = ICD10.find((x) => x.code === code)!
        consultations.push({ id: `hc${consultations.length}`, patientId: pt.id, doctorId: doc, appointmentId: id, date: at(-d, h, m + 20), reason, symptoms: [], history: '', exam: '', diagnoses: [dx], plan: '' })
        const svc = SERVICES.find((s) => s.id === setup.serviceId)!
        const extra = rand() < 0.2 ? pick(SERVICES.filter((s) => !s.name.startsWith('Consulta'))) : null
        const items = [{ serviceId: svc.id, name: svc.name, price: svc.price, qty: 1 }, ...(extra ? [{ serviceId: extra.id, name: extra.name, price: extra.price, qty: 1 }] : [])]
        const total = items.reduce((s, i) => s + i.price * i.qty, 0)
        const method = (['cash', 'cash', 'card', 'card', 'transfer', 'insurance'] as const)[Math.floor(rand() * 6)]
        payments.push({ id: `hp${payments.length}`, receiptNo: `R-${String(++receipt).padStart(6, '0')}`, appointmentId: id, patientId: pt.id, items, discount: 0, total, method, receivedBy: 's-mejia', paidAt: at(-d, h, m + 35) })
      }
    }
  }
  return { patients, appointments, consultations, payments, lastReceipt: receipt }
}
