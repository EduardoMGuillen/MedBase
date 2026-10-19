import type { Appointment, Consultation, Patient, Prescription, Staff, Vitals } from './types'

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
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(h)}:${pad(m)}:00`
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
