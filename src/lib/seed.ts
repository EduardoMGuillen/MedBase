import type {
  Appointment, Bed, ClinicSettings, Consultation, Dose, Followup, HospProcedure, Hospitalization, InpatientMed, InpatientNote, Patient, Payment, Prescription,
  Schedule, Service, Staff, Vitals,
} from './types.js'
import { ICD10 } from './catalogs.js'
import { doseTimes, HOUR, LATE_AFTER_MIN } from './inpatient.js'

export const CLINIC = {
  name: 'Clínica Santa Brígida',
  address: 'Col. Palmira, Av. República de Chile #412',
  phone: '+504 2232-7710',
}

export const MAIN_CLINIC = 'c-sb'
export const SECOND_CLINIC = 'c-sl'

export const STAFF: Staff[] = [
  { id: 's-super', name: 'Soporte Clinara', role: 'superadmin', email: 'superadmin@demo.clinara', color: '#0E2233', active: true },
  { id: 's-admin', clinicId: 'c-sb', name: 'Roberto Aguilar', role: 'admin', email: 'admin@demo.clinara', color: '#5B6472', active: true },
  { id: 's-herrera', clinicId: 'c-sb', name: 'Dra. Lucía Herrera', role: 'doctor', specialty: 'Medicina interna', email: 'lherrera@demo.clinara', license: 'CMH-08812', color: '#2335C9', active: true },
  { id: 's-paz', clinicId: 'c-sb', name: 'Dr. Andrés Paz', role: 'doctor', specialty: 'Pediatría', email: 'apaz@demo.clinara', license: 'CMH-11420', color: '#0F8A6E', active: true },
  { id: 's-zuniga', clinicId: 'c-sb', name: 'Dra. Mariela Zúniga', role: 'doctor', specialty: 'Ginecología y obstetricia', email: 'mzuniga@demo.clinara', license: 'CMH-09931', color: '#B4407A', active: true },
  { id: 's-rios', clinicId: 'c-sb', name: 'Lic. Carmen Ríos', role: 'nurse', email: 'crios@demo.clinara', color: '#C27A12', active: true },
  { id: 's-mejia', clinicId: 'c-sb', name: 'Sofía Mejía', role: 'reception', email: 'smejia@demo.clinara', color: '#6A4BC4', active: true },
  // Segunda clínica de demostración, para comprobar que los datos no se mezclan
  { id: 's2-admin', clinicId: 'c-sl', name: 'Gloria Paredes', role: 'admin', email: 'admin.sanlucas@demo.clinara', color: '#5B6472', active: true },
  { id: 's2-rosales', clinicId: 'c-sl', name: 'Dr. Esteban Rosales', role: 'doctor', specialty: 'Medicina general', email: 'erosales@demo.clinara', license: 'CMH-13002', color: '#2C7DA0', active: true },
  { id: 's2-enamorado', clinicId: 'c-sl', name: 'Lic. Patricia Enamorado', role: 'nurse', email: 'penamorado@demo.clinara', color: '#C27A12', active: true },
  { id: 's2-calix', clinicId: 'c-sl', name: 'Iris Cálix', role: 'reception', email: 'icalix@demo.clinara', color: '#6A4BC4', active: true },
]

const p = (
  id: string, record: string, firstName: string, lastName: string, birthDate: string, sex: 'F' | 'M',
  phone: string, extra: Partial<Patient> = {},
): Patient => ({
  id, record, firstName, lastName, birthDate, sex, phone, allergies: [], conditions: [],
  createdAt: '2025-02-10T09:00:00', ...extra,
})

export const PATIENTS: Patient[] = [
  p('p1', 'EXP-00412', 'María José', 'Castillo Reyes', '1984-03-12', 'F', '9876-1123', {
    dni: '0801-1984-04512', civilStatus: 'Casada', occupation: 'Contadora', education: 'Universitaria', religion: 'Católica',
    address: 'Tegucigalpa, Col. Lomas del Guijarro, calle 3', emergencyName: 'Ricardo Castillo', emergencyPhone: '9876-4410', emergencyRelation: 'Esposo',
    bloodType: 'O+', allergies: ['Penicilina'], conditions: ['Hipertensión arterial'], insurance: 'Seguros Atlántida',
    background: {
      pathological: 'HTA diagnosticada en 2024, en tratamiento con losartán.', surgical: 'Colecistectomía laparoscópica (2019).', traumatic: 'Negados.',
      hospitalizations: 'Por la colecistectomía (2019).', transfusions: 'Negados.', medications: 'Losartán 50 mg cada 24 horas.',
      family: 'Madre con HTA y DM2. Padre con cardiopatía isquémica.', smoking: 'Negado.', alcohol: 'Social, ocasional.', drugs: 'Negado.',
      lifestyle: 'Camina 3 veces por semana. Dieta hiposódica irregular.', immunizations: 'Esquema completo. Influenza 2025.',
      menarche: '12 años', lmp: '2026-10-02', gpac: 'G2 P2 A0 C0', contraception: 'DIU de cobre',
    },
  }),
  p('p2', 'EXP-00413', 'Carlos Eduardo', 'Banegas', '1967-11-02', 'M', '9455-2201', {
    dni: '0801-1967-11873', civilStatus: 'Casado', occupation: 'Comerciante', education: 'Secundaria completa', address: 'Comayagüela, Barrio El Bosque',
    emergencyName: 'Lilian Banegas', emergencyPhone: '9455-7781', emergencyRelation: 'Esposa',
    bloodType: 'A+', conditions: ['Diabetes tipo 2', 'Dislipidemia'],
    background: { pathological: 'DM2 desde 2015. Dislipidemia.', surgical: 'Negados.', medications: 'Metformina 850 mg cada 12 horas. Atorvastatina 20 mg.', family: 'Padre con DM2.', smoking: 'Exfumador, 10 paquetes/año, suspendido en 2010.', alcohol: 'Negado.' },
  }),
  p('p3', 'EXP-00420', 'Valentina', 'Ordóñez Pineda', '2019-06-25', 'F', '3311-8890', {
    address: 'Tegucigalpa, Res. Plaza', emergencyName: 'Karla Pineda', emergencyPhone: '3311-8890', emergencyRelation: 'Madre', education: 'Preescolar',
    bloodType: 'B+', allergies: ['AINEs'], background: { pathological: 'Negados.', immunizations: 'Esquema de vacunación completo para la edad.' },
  }),
  p('p4', 'EXP-00431', 'Jorge Luis', 'Matute', '1991-01-30', 'M', '9988-0145', {
    dni: '0801-1991-02233', civilStatus: 'Soltero', occupation: 'Albañil', education: 'Primaria completa', address: 'Tegucigalpa, Col. Kennedy',
    bloodType: 'O-', insurance: 'Mapfre', background: { traumatic: 'Fractura de radio derecho (2012).', alcohol: 'Fines de semana.' },
  }),
  p('p5', 'EXP-00438', 'Ana Gabriela', 'Fiallos', '1996-09-14', 'F', '8812-4433', {
    dni: '0801-1996-09214', civilStatus: 'Unión libre', occupation: 'Maestra', education: 'Universitaria', address: 'Tegucigalpa, Col. Miraflores',
    emergencyName: 'José Fiallos', emergencyPhone: '8812-0091', emergencyRelation: 'Padre',
    bloodType: 'A-', conditions: ['Embarazo de 24 semanas'],
    background: { menarche: '13 años', lmp: '2026-05-04', gpac: 'G1 P0 A0 C0', medications: 'Ácido fólico y sulfato ferroso.' },
  }),
  p('p6', 'EXP-00447', 'Héctor', 'Mondragón Sierra', '1958-04-08', 'M', '9701-6620', {
    dni: '0801-1958-00412', civilStatus: 'Viudo', occupation: 'Jubilado', address: 'Tegucigalpa, Col. Palmira',
    emergencyName: 'Sandra Mondragón', emergencyPhone: '9701-1123', emergencyRelation: 'Hija',
    bloodType: 'AB+', allergies: ['Sulfas'], conditions: ['EPOC'],
    background: { pathological: 'EPOC diagnosticado en 2018.', smoking: 'Fumador activo, 40 paquetes/año.', medications: 'Salbutamol inhalado a demanda.', hospitalizations: 'Exacerbación de EPOC (2023).' },
  }),
  p('p7', 'EXP-00452', 'Daniela', 'Rivera Cáceres', '2002-12-19', 'F', '3190-7765', { civilStatus: 'Soltera', occupation: 'Estudiante', education: 'Universitaria en curso', address: 'Tegucigalpa, Col. Tepeyac' }),
  p('p8', 'EXP-00460', 'Mateo', 'Galeano', '2015-02-03', 'M', '9620-1180', {
    education: 'Primaria en curso', address: 'Tegucigalpa, Col. Las Minitas', emergencyName: 'Marta Galeano', emergencyPhone: '9620-1180', emergencyRelation: 'Madre',
    allergies: ['Metamizol'], conditions: ['Asma'], background: { pathological: 'Asma desde los 4 años.', medications: 'Salbutamol inhalado a demanda.' },
  }),
  p('p9', 'EXP-00466', 'Rosa Elena', 'Turcios', '1973-07-21', 'F', '9433-5532', {
    dni: '0801-1973-07781', civilStatus: 'Divorciada', occupation: 'Secretaria', address: 'Tegucigalpa, Col. Florencia Norte',
    bloodType: 'O+', conditions: ['Hipotiroidismo'], insurance: 'Seguros Atlántida',
    background: { pathological: 'Hipotiroidismo desde 2020.', medications: 'Levotiroxina 75 mcg en ayunas.', gpac: 'G3 P2 A1 C0', menarche: '11 años' },
  }),
  p('p10', 'EXP-00471', 'Fernando', 'Alvarado Lanza', '1988-10-10', 'M', '8890-2314', { dni: '0801-1988-10331', civilStatus: 'Casado', occupation: 'Ingeniero civil', education: 'Universitaria', address: 'Tegucigalpa, Res. El Trapiche' }),
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
    { id: 'v1', patientId: 'p1', appointmentId: 'a3', takenBy: 's-rios', takenAt: at(0, 9, 22), systolic: 128, diastolic: 84, heartRate: 96, respRate: 18, temperature: 38.4, spo2: 97, weightKg: 68, heightCm: 162, painScale: 5,
      chiefComplaint: 'Dolor de garganta y fiebre desde hace 3 días.', notes: 'Refiere dificultad para tragar.' },
    { id: 'v0', patientId: 'p1', takenBy: 's-rios', takenAt: at(-62, 10, 5), systolic: 142, diastolic: 92, heartRate: 78, respRate: 16, temperature: 36.7, spo2: 98, weightKg: 69.5, heightCm: 162, chiefComplaint: 'Control de presión arterial.' },
    { id: 'v2', patientId: 'p2', takenBy: 's-rios', takenAt: at(0, 7, 55), systolic: 134, diastolic: 82, heartRate: 74, respRate: 16, temperature: 36.5, spo2: 98, weightKg: 91, heightCm: 174, glucose: 148, chiefComplaint: 'Control de glucosa.' },
  ]
  const consultations: Consultation[] = [
    {
      id: 'c1', patientId: 'p1', doctorId: 's-herrera', date: at(-62, 10, 15), reason: 'Control de presión arterial',
      symptoms: [], history: 'Paciente femenina de 42 años con HTA diagnosticada hace 2 años, en tratamiento irregular. Refiere cefalea occipital matutina de 2 semanas de evolución, sin alteraciones visuales ni dolor torácico.',
      exam: 'Consciente, orientada, hidratada. Cuello sin ingurgitación yugular. Tórax: ruidos cardíacos rítmicos, sin soplos; murmullo vesicular presente sin agregados. Abdomen blando, depresible. Extremidades sin edema.',
      diagnoses: [{ code: 'I10', label: 'Hipertensión esencial (primaria)' }],
      orders: ['Dieta hiposódica (menos de 2 g de sal al día).', 'Losartán 50 mg, 1 tableta vía oral cada 24 horas por 60 días.', 'Perfil lipídico, creatinina y examen general de orina.', 'Control de presión arterial en casa, registro diario.', 'Cita de control en 2 meses con resultados.'],
      plan: '', vitalsId: 'v0', prescriptionId: 'rx1',
    },
    {
      id: 'c2', patientId: 'p2', doctorId: 's-herrera', appointmentId: 'a1', date: at(0, 8, 5), reason: 'Control de glucosa',
      symptoms: [], history: 'Paciente masculino de 58 años con DM2 de 10 años de evolución en tratamiento con metformina. Refiere fatiga leve. Glucosa en ayunas en casa de 140 a 150 mg/dL.',
      exam: 'Buen estado general. Pies sin lesiones, pulsos pedios presentes, sensibilidad conservada con monofilamento.',
      diagnoses: [{ code: 'E11.9', label: 'Diabetes mellitus tipo 2 sin complicaciones' }],
      orders: ['Dieta para diabético, 1800 kcal.', 'Metformina 850 mg, 1 tableta vía oral cada 12 horas por 90 días.', 'Atorvastatina 20 mg, 1 tableta vía oral cada noche por 90 días.', 'Hemoglobina glicosilada (HbA1c) en 3 meses.', 'Cita de control en 3 meses.'],
      plan: '', vitalsId: 'v2', prescriptionId: 'rx2',
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
  recordUsesDni: false,
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
        consultations.push({ id: `hc${consultations.length}`, patientId: pt.id, doctorId: doc, appointmentId: id, date: at(-d, h, m + 20), reason, symptoms: [], history: '', exam: '', diagnoses: [dx], orders: ['Tratamiento según diagnóstico.', 'Cita de control según evolución.'], plan: '' })
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


// ---------- Clínicas de demostración ----------
export const DEMO_CLINICS: (ClinicSettings & { id: string; slug: string })[] = [
  { id: MAIN_CLINIC, slug: 'santa-brigida', ...DEFAULT_SETTINGS },
  {
    id: SECOND_CLINIC, slug: 'san-lucas', name: 'Centro Médico San Lucas', address: 'San Pedro Sula, Barrio Río de Piedras, 7 calle',
    phone: '+504 2550-1188', email: 'citas@sanlucas.hn', currency: 'L', rxValidityDays: 30, reminderTemplate: DEFAULT_SETTINGS.reminderTemplate, recordUsesDni: true,
  },
]

/** Datos mínimos de la segunda clínica: algunos pacientes y la agenda de hoy. */
export function seedSecondClinic() {
  const patients: Patient[] = [
    p('q1', 'EXP-00401', 'Óscar Daniel', 'Paz Reyes', '1979-08-15', 'M', '9512-3344', { dni: '0501-1979-04411', civilStatus: 'Casado', occupation: 'Mecánico', address: 'San Pedro Sula, Col. Trejo', allergies: ['Ibuprofeno'], conditions: ['Gota'] }),
    p('q2', 'EXP-00402', 'Wendy Carolina', 'Mejía Lara', '1992-02-27', 'F', '3388-1020', { dni: '0501-1992-00982', civilStatus: 'Soltera', occupation: 'Enfermera', address: 'San Pedro Sula, Res. Los Álamos' }),
    p('q3', 'EXP-00403', 'Roberto', 'Bú Hándal', '1955-12-03', 'M', '9901-7766', { dni: '0501-1955-02210', civilStatus: 'Casado', occupation: 'Comerciante', address: 'San Pedro Sula, Barrio Guamilito', conditions: ['Hipertensión arterial', 'Diabetes tipo 2'] }),
  ]
  n = 100
  const appointments: Appointment[] = [
    a('q3', 's2-rosales', 0, 8, 30, 30, 'Control de presión arterial', 'done'),
    a('q1', 's2-rosales', 0, 10, 0, 30, 'Dolor en el dedo gordo del pie', 'arrived'),
    a('q2', 's2-rosales', 0, 15, 0, 30, 'Chequeo general', 'confirmed', 'first'),
    a('q3', 's2-rosales', 7, 9, 0, 30, 'Control de glucosa', 'scheduled'),
  ].map((x) => ({ ...x, id: x.id.replace('a', 'b') }))
  const services: Service[] = SERVICES.filter((x) => ['svc-gen', 'svc-ecg', 'svc-cur', 'svc-vac'].includes(x.id)).map((x) => ({ ...x, id: `sl-${x.id}` }))
  const setup: Record<string, { schedule: Schedule; serviceId: string }> = {
    's2-rosales': { schedule: { days: [1, 2, 3, 4, 5], start: '07:00', end: '15:00', slot: 30 }, serviceId: 'sl-svc-gen' },
  }
  return { patients, appointments, services, setup }
}

// ---------- Hospitalización y seguimientos de demostración ----------

/** Pacientes que están hospitalizados en la demo; no tienen citas en la agenda de hoy. */
export const INPATIENT_PATIENTS: Patient[] = [
  p('p11', 'EXP-00480', 'Marcos Antonio', 'Velásquez Ruiz', '1979-05-17', 'M', '9812-4471', {
    dni: '0801-1979-05521', civilStatus: 'Casado', occupation: 'Motorista', education: 'Secundaria completa', address: 'Tegucigalpa, Col. San Ángel',
    emergencyName: 'Iris Velásquez', emergencyPhone: '9812-0090', emergencyRelation: 'Esposa', bloodType: 'O+', insurance: 'Seguros Atlántida',
    background: { pathological: 'Negados.', surgical: 'Negados.', smoking: 'Negado.', alcohol: 'Ocasional.' },
  }),
  p('p12', 'EXP-00481', 'Gloria Estela', 'Funes de Mejía', '1950-09-03', 'F', '2234-8810', {
    dni: '0801-1950-01277', civilStatus: 'Viuda', occupation: 'Ama de casa', address: 'Tegucigalpa, Barrio La Hoya',
    emergencyName: 'Rina Mejía', emergencyPhone: '9933-1204', emergencyRelation: 'Hija', bloodType: 'A+', conditions: ['Hipertensión arterial'],
    background: { pathological: 'HTA desde 2010.', medications: 'Enalapril 10 mg cada 12 horas.', immunizations: 'Sin vacuna de influenza este año.' },
  }),
  p('p13', 'EXP-00482', 'Santos Rubén', 'Hernández Ochoa', '1962-02-11', 'M', '9540-3318', {
    dni: '0801-1962-00841', civilStatus: 'Casado', occupation: 'Agricultor', address: 'Valle de Ángeles',
    emergencyName: 'Marta Ochoa', emergencyPhone: '9540-7712', emergencyRelation: 'Esposa', conditions: ['Hipertensión arterial'],
    background: { pathological: 'HTA de 8 años, abandonó el tratamiento hace 6 meses.', smoking: 'Fumador, 15 paquetes/año.' },
  }),
  p('p14', 'EXP-00483', 'Ana Lucía', 'Bonilla Cruz', '1988-11-25', 'F', '3345-9902', {
    dni: '0801-1988-12034', civilStatus: 'Casada', occupation: 'Cajera', education: 'Secundaria completa', address: 'Tegucigalpa, Col. Kennedy',
    emergencyName: 'Javier Bonilla', emergencyPhone: '3345-1180', emergencyRelation: 'Esposo', bloodType: 'B+', allergies: ['Sulfas'],
    background: { gpac: 'G2 P2 A0 C0', surgical: 'Negados.' },
  }),
]

/** Camas por especialidad: 5 de medicina interna y 10 de cirugía, como en el ejemplo del médico. */
export const BEDS: (Bed & { clinicId: string })[] = [
  ...[101, 102, 103, 104, 105].map((r) => ({ id: `bed-${r}`, clinicId: MAIN_CLINIC, room: String(r), label: '', specialty: 'Medicina interna', active: true })),
  ...[201, 202, 203, 204, 205, 206, 207, 208, 209, 210].map((r) => ({ id: `bed-${r}`, clinicId: MAIN_CLINIC, room: String(r), label: '', specialty: 'Cirugía', active: true })),
  ...[1, 2, 3, 4].map((r) => ({ id: `sl-bed-${r}`, clinicId: SECOND_CLINIC, room: String(r), label: '', specialty: 'Medicina general', active: true })),
]

/** Hospitalizados de la clínica principal, con horarios relativos a `now` para que la hoja siempre esté viva. */
export function seedInpatient(now = new Date()) {
  const iso = (d: Date) => d.toISOString()
  const plus = (d: Date, h: number) => new Date(d.getTime() + h * HOUR)
  const dayAt = (offset: number, h: number, m = 0) => { const d = new Date(now); d.setDate(d.getDate() + offset); d.setHours(h, m, 0, 0); return d }
  // El caso que describió el médico: ingresó hace unas 6 horas con ondansetrón y acetaminofén
  const t0 = new Date(now); t0.setMinutes(0, 0, 0); t0.setHours(t0.getHours() - 6)
  const nurse = 's-rios'
  const doc = 's-herrera'

  const hospitalizations: Hospitalization[] = [
    { id: 'hz1', patientId: 'p11', bedId: 'bed-203', admittedAt: iso(t0), admittedBy: doc, reason: 'Dolor abdominal en fosa ilíaca derecha de 18 horas, con náuseas y fiebre.',
      diagnoses: [{ code: 'K35.8', label: 'Apendicitis aguda, otra y la no especificada' }], companionName: 'Iris Velásquez', companionRelation: 'Esposa', companionPhone: '9812-0090',
      patientPhone: '9812-4471', status: 'active' },
    { id: 'hz2', patientId: 'p12', bedId: 'bed-102', admittedAt: iso(dayAt(-1, 16)), admittedBy: doc, reason: 'Tos productiva, fiebre y dificultad respiratoria de 4 días.',
      diagnoses: [{ code: 'J18.9', label: 'Neumonía, no especificada' }], companionName: 'Rina Mejía', companionRelation: 'Hija', companionPhone: '9933-1204', patientPhone: '2234-8810', status: 'active' },
    { id: 'hz3', patientId: 'p13', bedId: 'bed-104', admittedAt: iso(dayAt(-2, 21)), admittedBy: doc, reason: 'Cefalea intensa y presión arterial de 210/120 mmHg.',
      diagnoses: [{ code: 'I16.9', label: 'Crisis hipertensiva, no especificada' }], companionName: 'Marta Ochoa', companionRelation: 'Esposa', companionPhone: '9540-7712', patientPhone: '9540-3318', status: 'active' },
    { id: 'hz4', patientId: 'p14', bedId: 'bed-207', admittedAt: iso(dayAt(-1, 10)), admittedBy: doc, reason: 'Dolor en hipocondrio derecho, vómitos y fiebre de 2 días.',
      diagnoses: [{ code: 'K81.0', label: 'Colecistitis aguda' }], companionName: 'Javier Bonilla', companionRelation: 'Esposo', companionPhone: '3345-1180', patientPhone: '3345-9902', status: 'active' },
  ]

  const note = (id: string, hospitalizationId: string, kind: InpatientNote['kind'], at: Date, s: string, o: string, a: string, pl: string): InpatientNote =>
    ({ id, hospitalizationId, kind, authorId: doc, at: iso(at), subjective: s, objective: o, assessment: a, plan: pl, text: '' })
  const nursing = (id: string, hospitalizationId: string, at: Date, text: string): InpatientNote =>
    ({ id, hospitalizationId, kind: 'nursing', authorId: nurse, at: iso(at), subjective: '', objective: '', assessment: '', plan: '', text })

  const notes: InpatientNote[] = [
    note('hn1', 'hz1', 'admission', plus(t0, 0.25), 'Masculino de 47 años con dolor abdominal que inició en epigastrio y migró a fosa ilíaca derecha hace 18 horas, con náuseas, 2 vómitos y fiebre no cuantificada.',
      'PA 128/82, FC 104, FR 20, T 38.3 °C. Abdomen con dolor a la palpación en fosa ilíaca derecha, McBurney y Blumberg positivos.',
      'Apendicitis aguda.', 'Nada por boca. Canalizar vena periférica. Hemograma y examen general de orina. Valoración por cirugía para apendicectomía. Medicamentos según indicaciones.'),
    note('hn2', 'hz1', 'evolution', plus(t0, 2.85), 'Refiere dolor intenso, 8 de 10, que no cede con acetaminofén.', 'PA 132/84, FC 98, T 37.9 °C. Abdomen con defensa en fosa ilíaca derecha.',
      'Apendicitis aguda con dolor no controlado.', 'Se agrega tramadol para el dolor intenso. Continúa en espera de cirugía.'),
    note('hn3', 'hz1', 'evolution', plus(t0, 3), 'Paciente con náuseas tras la dosis de tramadol.', 'Signos vitales estables.', 'Intolerancia al tramadol.',
      'OMITIR tramadol. Continúa ondansetrón y acetaminofén PRN.'),
    note('hn4', 'hz2', 'admission', dayAt(-1, 16, 20), 'Femenina de 76 años con tos productiva amarillenta, fiebre de 38.8 °C y disnea de medianos esfuerzos de 4 días de evolución.',
      'PA 138/86, FC 102, FR 24, T 38.6 °C, SpO₂ 90 % al aire. Crépitos en base pulmonar derecha.', 'Neumonía adquirida en la comunidad, CURB-65 de 2.',
      'Oxígeno por cánula nasal a 2 l/min para SpO₂ mayor de 92 %. Hemograma, radiografía de tórax. Antibiótico según indicaciones.'),
    note('hn5', 'hz2', 'evolution', dayAt(0, 7, 30), 'Refiere menos tos y que durmió mejor.', 'PA 130/80, FC 92, FR 20, T 37.4 °C, SpO₂ 94 % con 2 l/min. Crépitos persisten en base derecha.',
      'Neumonía en mejoría clínica, leucocitos en descenso.', 'Continúa antibiótico. Destetar oxígeno según saturación. Control de hemograma mañana.'),
    note('hn6', 'hz3', 'admission', dayAt(-2, 21, 15), 'Masculino de 64 años con cefalea occipital intensa y visión borrosa. Abandonó el tratamiento antihipertensivo.',
      'PA 210/120, FC 88. Fondo de ojo sin papiledema. Sin déficit neurológico.', 'Crisis hipertensiva sin daño a órgano blanco evidente.',
      'Reposo, dieta hiposódica, control de PA cada 4 horas. Antihipertensivos según indicaciones.'),
    note('hn7', 'hz3', 'evolution', dayAt(0, 8), 'Sin cefalea.', 'PA 142/88, FC 76.', 'Crisis hipertensiva controlada.', 'Continúa tratamiento oral. Probable egreso mañana con control en consulta externa.'),
    note('hn8', 'hz4', 'admission', dayAt(-1, 10, 20), 'Femenina de 37 años con dolor en hipocondrio derecho, vómitos y fiebre de 2 días.',
      'T 38.4 °C, Murphy positivo. Ultrasonido con vesícula de pared engrosada y litos.', 'Colecistitis aguda litiásica.', 'Nada por boca, líquidos IV, antibiótico y analgesia. Colecistectomía laparoscópica hoy.'),
    note('hn9', 'hz4', 'evolution', dayAt(0, 7), 'Dolor leve en heridas quirúrgicas. Tolera líquidos claros.', 'Afebril, heridas limpias, abdomen blando.',
      'Postoperatorio día 1 de colecistectomía laparoscópica, evolución satisfactoria.', 'Dieta blanda. Deambulación. Continuar analgesia.'),
    nursing('hn10', 'hz1', plus(t0, 0.15), 'Paciente ingresa a sala en camilla, consciente y orientado. Se canaliza vena periférica en antebrazo izquierdo con catéter 18. Se toman muestras de laboratorio.'),
    nursing('hn11', 'hz1', plus(t0, 3.1), 'Paciente refiere náuseas después del tramadol. Se informa al médico de turno.'),
    nursing('hn12', 'hz2', dayAt(0, 6), 'Paciente pasó la noche tranquila, afebril. Saturación de 93 % con oxígeno a 2 l/min. Se toma muestra para hemograma de control.'),
    nursing('hn13', 'hz4', dayAt(-1, 17), 'Paciente regresa de sala de operaciones consciente, con heridas limpias y secas. Signos vitales estables.'),
  ]

  const med = (id: string, hospitalizationId: string, noteId: string, drug: string, presentation: string, dose: string, route: string, everyHours: number | undefined,
    prn: boolean, firstAt: Date, instructions?: string, stoppedAt?: Date): InpatientMed => ({
    id, hospitalizationId, noteId, drug, presentation, dose, route, everyHours, prn, firstAt: iso(firstAt), instructions, orderedBy: doc,
    orderedAt: iso(firstAt), stoppedAt: stoppedAt ? iso(stoppedAt) : undefined, stoppedBy: stoppedAt ? doc : undefined,
  })
  const meds: InpatientMed[] = [
    med('hm1', 'hz1', 'hn1', 'Ondansetrón', 'Ampolla 8 mg/4 ml', '8 mg', 'Intravenosa', 8, false, t0),
    med('hm2', 'hz1', 'hn1', 'Acetaminofén', 'Frasco 1 g/100 ml', '1 g', 'Intravenosa', 6, true, t0, 'Si hay dolor o fiebre mayor de 38 °C.'),
    med('hm3', 'hz1', 'hn2', 'Tramadol', 'Ampolla 50 mg/ml', '50 mg', 'Subcutánea', 12, true, plus(t0, 2.85), 'Dolor intenso.', plus(t0, 3)),
    med('hm4', 'hz2', 'hn4', 'Ceftriaxona', 'Vial 1 g', '1 g', 'Intravenosa', 24, false, dayAt(-1, 17)),
    med('hm5', 'hz2', 'hn4', 'Azitromicina', 'Tableta 500 mg', '500 mg', 'Oral', 24, false, dayAt(-1, 17)),
    med('hm6', 'hz2', 'hn4', 'Acetaminofén', 'Frasco 1 g/100 ml', '1 g', 'Intravenosa', 8, true, dayAt(-1, 17), 'Si la temperatura es mayor de 38 °C.'),
    med('hm7', 'hz2', 'hn4', 'Enoxaparina', 'Jeringa 40 mg/0,4 ml', '40 mg', 'Subcutánea', 24, false, dayAt(-1, 20)),
    med('hm8', 'hz3', 'hn6', 'Losartán', 'Tableta 50 mg', '50 mg', 'Oral', 12, false, dayAt(-2, 22)),
    med('hm9', 'hz3', 'hn6', 'Amlodipino', 'Tableta 5 mg', '5 mg', 'Oral', 24, false, dayAt(-2, 22)),
    med('hm10', 'hz4', 'hn8', 'Cefazolina', 'Vial 1 g', '1 g', 'Intravenosa', 8, false, dayAt(-1, 11)),
    med('hm11', 'hz4', 'hn8', 'Ketorolaco', 'Ampolla 30 mg/ml', '30 mg', 'Intravenosa', 8, false, dayAt(-1, 11)),
    med('hm12', 'hz4', 'hn8', 'Omeprazol IV', 'Vial 40 mg', '40 mg', 'Intravenosa', 24, false, dayAt(-1, 11)),
  ]

  // Enfermería aplicó las dosis indicadas hasta hace una hora; las más recientes quedan por aplicar
  const doses: Dose[] = []
  for (const m of meds) {
    for (const s of doseTimes(m, new Date(m.firstAt), new Date(now.getTime() - LATE_AFTER_MIN * 60_000))) {
      if (s.omitted) continue
      doses.push({ id: `hd${doses.length + 1}`, medId: m.id, scheduledAt: iso(s.at), givenAt: iso(new Date(s.at.getTime() + (5 + (doses.length % 4) * 4) * 60_000)), givenBy: nurse, status: 'given' })
    }
  }
  doses.push({ id: `hd${doses.length + 1}`, medId: 'hm2', givenAt: iso(plus(t0, 1.5)), givenBy: nurse, status: 'given', note: 'Dolor 7/10.' })
  doses.push({ id: `hd${doses.length + 1}`, medId: 'hm3', givenAt: iso(plus(t0, 2.92)), givenBy: nurse, status: 'given' })
  doses.push({ id: `hd${doses.length + 1}`, medId: 'hm6', givenAt: iso(dayAt(-1, 23, 10)), givenBy: nurse, status: 'given', note: 'T 38.5 °C.' })

  const procedures: HospProcedure[] = [
    { id: 'hp1', hospitalizationId: 'hz1', kind: 'authorization', name: 'Autorización de Seguros Atlántida para apendicectomía', status: 'pending', createdBy: doc, createdAt: iso(plus(t0, 0.5)) },
    { id: 'hp2', hospitalizationId: 'hz1', kind: 'procedure', name: 'Apendicectomía laparoscópica', scheduledAt: iso(plus(t0, 9)), status: 'pending', createdBy: doc, createdAt: iso(plus(t0, 0.5)) },
    { id: 'hp3', hospitalizationId: 'hz4', kind: 'procedure', name: 'Colecistectomía laparoscópica', scheduledAt: iso(dayAt(-1, 14)), status: 'done', notes: 'Sin complicaciones. Sangrado mínimo.',
      createdBy: doc, createdAt: iso(dayAt(-1, 10, 30)), updatedBy: doc, updatedAt: iso(dayAt(-1, 15, 30)) },
  ]

  // Laboratorios subidos a mano: el hemograma del ingreso y el de control salen juntos
  const labs = [
    { id: 'hl1', patientId: 'p12', hospitalizationId: 'hz2', title: 'Hemograma', takenAt: iso(dayAt(-1, 17)), lines: ['Leucocitos 16 800 /mm3', 'Neutrofilos 86 %', 'Hemoglobina 12.1 g/dl', 'Plaquetas 310 000 /mm3'] },
    { id: 'hl2', patientId: 'p12', hospitalizationId: 'hz2', title: 'Hemograma', takenAt: iso(dayAt(0, 6)), lines: ['Leucocitos 11 200 /mm3', 'Neutrofilos 74 %', 'Hemoglobina 11.8 g/dl', 'Plaquetas 298 000 /mm3'] },
    { id: 'hl3', patientId: 'p11', hospitalizationId: 'hz1', title: 'Hemograma', takenAt: iso(plus(t0, 0.3)), lines: ['Leucocitos 15 400 /mm3', 'Neutrofilos 88 %', 'Hemoglobina 14.6 g/dl', 'Plaquetas 254 000 /mm3'] },
  ]

  const day = (offset: number) => at(offset, 12).slice(0, 10)
  const followups: Followup[] = [
    { id: 'fu1', patientId: 'p1', kind: 'chronic', title: 'Hipertensión arterial', dueDate: day(5), everyDays: 90, createdBy: doc, createdAt: at(-62, 10, 30), active: true },
    { id: 'fu2', patientId: 'p2', kind: 'chronic', title: 'Diabetes mellitus tipo 2', dueDate: day(-3), everyDays: 90, createdBy: doc, createdAt: at(-90, 9), active: true },
    { id: 'fu3', patientId: 'p9', kind: 'chronic', title: 'Hipotiroidismo', dueDate: day(40), everyDays: 180, createdBy: doc, createdAt: at(-140, 9), active: true },
    { id: 'fu4', patientId: 'p6', kind: 'chronic', title: 'EPOC', dueDate: day(12), everyDays: 90, notes: 'Espirometría antes del control.', createdBy: doc, createdAt: at(-78, 9),
      notifiedAt: iso(dayAt(-2, 10)), active: true },
    { id: 'fu5', patientId: 'p12', kind: 'chronic', title: 'Hipertensión arterial', dueDate: day(20), everyDays: 90, createdBy: doc, createdAt: at(-30, 9), active: true },
    { id: 'fu6', patientId: 'p7', kind: 'reminder', title: 'Traer resultados de hemograma y perfil tiroideo a su cita de control', dueDate: day(3), createdBy: doc, createdAt: at(-4, 15, 50), active: true },
    { id: 'fu7', patientId: 'p4', kind: 'procedure', title: 'Hernioplastia inguinal derecha', dueDate: day(10), notes: 'Ayuno de 8 horas. Traer exámenes prequirúrgicos.', createdBy: doc, createdAt: at(-1, 10, 30), active: true },
  ]

  return { hospitalizations, notes, meds, doses, procedures, labs, followups }
}
