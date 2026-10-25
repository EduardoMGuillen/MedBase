import type {
  Appointment, Bed, ClinicSettings, Consultation, Dose, Followup, HospProcedure, Hospitalization, InpatientMed, InpatientNote, Patient, Payment, Prescription,
  PrescriptionItem, Schedule, Service, Staff, Vitals,
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
  // Mañana y tarde, con la hora de almuerzo libre
  's-herrera': { schedule: { days: [1, 2, 3, 4, 5], start: '08:00', end: '17:00', slot: 30, week: Object.fromEntries(['1', '2', '3', '4', '5'].map((d) => [d, [{ start: '08:00', end: '12:00' }, { start: '14:00', end: '17:00' }]])) }, serviceId: 'svc-mi' },
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
      patientPhone: '9812-4471', status: 'active', kind: 'hospital' },
    { id: 'hz2', patientId: 'p12', bedId: 'bed-102', admittedAt: iso(dayAt(-1, 16)), admittedBy: doc, reason: 'Tos productiva, fiebre y dificultad respiratoria de 4 días.',
      diagnoses: [{ code: 'J18.9', label: 'Neumonía, no especificada' }], companionName: 'Rina Mejía', companionRelation: 'Hija', companionPhone: '9933-1204', patientPhone: '2234-8810', status: 'active', kind: 'hospital' },
    { id: 'hz3', patientId: 'p13', bedId: 'bed-104', admittedAt: iso(dayAt(-2, 21)), admittedBy: doc, reason: 'Cefalea intensa y presión arterial de 210/120 mmHg.',
      diagnoses: [{ code: 'I16.9', label: 'Crisis hipertensiva, no especificada' }], companionName: 'Marta Ochoa', companionRelation: 'Esposa', companionPhone: '9540-7712', patientPhone: '9540-3318', status: 'active', kind: 'hospital' },
    { id: 'hz4', patientId: 'p14', bedId: 'bed-207', admittedAt: iso(dayAt(-1, 10)), admittedBy: doc, reason: 'Dolor en hipocondrio derecho, vómitos y fiebre de 2 días.',
      diagnoses: [{ code: 'K81.0', label: 'Colecistitis aguda' }], companionName: 'Javier Bonilla', companionRelation: 'Esposo', companionPhone: '3345-1180', patientPhone: '3345-9902', status: 'active', kind: 'hospital' },
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

// ---------- Casos completos de demostración ----------

/** Pacientes con su historia completa, de la ficha al cobro. */
export const CASE_PATIENT_IDS = ['p15', 'p16', 'p17', 'p18', 'p19', 'p20']
/** Cama del caso que ya egresó. */
export const CASE_BED = 'bed-105'
/** Personal que firma los casos; deben existir en la base para cargarlos. */
export const CASE_STAFF = ['s-herrera', 's-paz', 's-zuniga', 's-rios', 's-mejia']

/** Primer número libre de expediente, folio de receta y recibo; la base los calcula para no chocar con lo que ya existe. */
export interface CaseNumbers { record: number; folio: number; receipt: number }

/**
 * Casos completos: consulta externa, crónicos con varios controles, un diabético que se hospitalizó y ya
 * egresó, control de niño sano y control prenatal. Cada consulta lleva preclínica, receta y cobro.
 */
export function seedCases(next: CaseNumbers, now = new Date()) {
  const iso = (d: Date) => d.toISOString()
  const dayAt = (offset: number, h: number, m = 0) => { const d = new Date(now); d.setDate(d.getDate() + offset); d.setHours(h, m, 0, 0); return d }
  const day = (offset: number) => at(offset, 12).slice(0, 10)
  const nurse = 's-rios'
  const internist = 's-herrera'

  const patients: Patient[] = [
    p('p15', '', 'Iris Marisol', 'Cáceres Amador', '1993-04-18', 'F', '9741-2286', {
      dni: '0801-1993-06620', civilStatus: 'Soltera', occupation: 'Cajera de banco', education: 'Universitaria', religion: 'Evangélica',
      address: 'Tegucigalpa, Col. Alameda, 4a calle', emergencyName: 'Norma Amador', emergencyPhone: '9741-0035', emergencyRelation: 'Madre',
      bloodType: 'A+', createdAt: at(-6, 9, 50),
      background: { pathological: 'Negados.', surgical: 'Negados.', medications: 'Ninguno.', family: 'Madre con HTA.', smoking: 'Negado.', alcohol: 'Negado.',
        menarche: '12 años', gpac: 'G0 P0 A0 C0', contraception: 'Ninguno' },
    }),
    p('p16', '', 'Kevin Josué', 'Zelaya Ortiz', '1985-08-09', 'M', '3302-7719', {
      dni: '0801-1985-08847', civilStatus: 'Casado', occupation: 'Bodeguero', education: 'Secundaria completa', address: 'Comayagüela, Col. Villa Adela',
      emergencyName: 'Lesly Ortiz', emergencyPhone: '3302-1145', emergencyRelation: 'Esposa', bloodType: 'O+', createdAt: at(-3, 14, 50),
      background: { pathological: 'Negados.', surgical: 'Negados.', traumatic: 'Esguince de tobillo izquierdo (2018).', smoking: 'Negado.', alcohol: 'Fines de semana.' },
    }),
    p('p17', '', 'Julio César', 'Maradiaga Flores', '1961-01-22', 'M', '9734-5508', {
      dni: '0801-1961-00219', civilStatus: 'Casado', occupation: 'Taxista', education: 'Secundaria completa', religion: 'Católica',
      address: 'Tegucigalpa, Col. Hato de Enmedio, bloque 12', emergencyName: 'Marlen Flores', emergencyPhone: '9734-2210', emergencyRelation: 'Esposa',
      bloodType: 'B+', insurance: 'Mapfre', conditions: ['Diabetes tipo 2', 'Hipertensión arterial', 'Dislipidemia'], createdAt: at(-175, 8, 45),
      background: {
        pathological: 'DM2 e HTA diagnosticadas en esta clínica hace 6 meses. Dislipidemia.', surgical: 'Negados.', traumatic: 'Herida con clavo en tobillo derecho, complicada con celulitis.',
        hospitalizations: 'Celulitis de pierna derecha, 4 días en medicina interna.', transfusions: 'Negados.',
        medications: 'Metformina 850 mg cada 12 horas. Losartán 50 mg cada 24 horas. Atorvastatina 20 mg cada noche.',
        family: 'Madre con DM2. Hermano con infarto a los 60 años.', smoking: 'Negado.', alcohol: 'Ocasional.', drugs: 'Negado.',
        lifestyle: 'Sedentario, maneja 10 horas al día. Empezó a caminar 30 minutos diarios.', immunizations: 'Influenza 2026. Td 2024.',
      },
    }),
    p('p18', '', 'Dora Alicia', 'Espinoza de Sosa', '1957-06-30', 'F', '2231-6094', {
      dni: '0801-1957-03318', civilStatus: 'Casada', occupation: 'Ama de casa', education: 'Primaria completa', religion: 'Católica', address: 'Tegucigalpa, Col. Las Colinas',
      emergencyName: 'Claudia Sosa', emergencyPhone: '9902-4471', emergencyRelation: 'Hija', bloodType: 'O+', allergies: ['Ácido acetilsalicílico'],
      conditions: ['Hipertensión arterial', 'Hipotiroidismo'], insurance: 'Seguros Atlántida', createdAt: at(-120, 10, 15),
      background: {
        pathological: 'HTA desde 2012. Hipotiroidismo desde 2019.', surgical: 'Histerectomía abdominal por miomatosis (2005).', traumatic: 'Negados.',
        medications: 'Amlodipino 10 mg cada 24 horas. Levotiroxina 50 mcg en ayunas.', family: 'Hermana con cáncer de mama.', smoking: 'Negado.', alcohol: 'Negado.',
        immunizations: 'Influenza 2026. Neumococo 2025.', menarche: '13 años', gpac: 'G4 P4 A0 C0',
      },
    }),
    p('p19', '', 'Sofía Isabel', 'Murillo Bonilla', '2024-04-12', 'F', '9688-3150', {
      address: 'Tegucigalpa, Col. Villa Olímpica', emergencyName: 'Paola Bonilla', emergencyPhone: '9688-3150', emergencyRelation: 'Madre', bloodType: 'O+',
      createdAt: at(-14, 8, 20),
      background: {
        pathological: 'Producto de embarazo a término, parto vaginal, peso al nacer 3.2 kg. Sin enfermedades.', surgical: 'Negados.', family: 'Negados.',
        lifestyle: 'Asiste a guardería. Come con la familia y toma 2 vasos de leche entera al día.', immunizations: 'Esquema nacional al día.',
      },
    }),
    p('p20', '', 'Karla Vanessa', 'Ramos Aguilar', '1998-02-14', 'F', '9871-6643', {
      dni: '0801-1998-02761', civilStatus: 'Unión libre', occupation: 'Estilista', education: 'Secundaria completa', address: 'Tegucigalpa, Col. Cerro Grande, zona 3',
      emergencyName: 'Marvin Cruz', emergencyPhone: '9871-3302', emergencyRelation: 'Pareja', bloodType: 'A+', conditions: ['Embarazo de 28 semanas'], createdAt: at(-32, 8, 40),
      background: {
        pathological: 'Negados.', surgical: 'Negados.', medications: 'Ácido fólico, sulfato ferroso y calcio.', family: 'Madre con DM2.', smoking: 'Negado.', alcohol: 'Negado.',
        immunizations: 'Td 2 dosis y Tdpa en este embarazo.', menarche: '12 años', lmp: day(-198), gpac: 'G2 P1 A0 C0', contraception: 'Ninguno (embarazo actual)',
      },
    }),
  ]

  const appointments: Appointment[] = []
  const vitals: Vitals[] = []
  const consultations: Consultation[] = []
  const prescriptions: Prescription[] = []
  const payments: Payment[] = []
  const labs: { id: string; patientId: string; hospitalizationId?: string; category: 'lab' | 'imaging'; title: string; takenAt: string; lines: string[] }[] = []
  const charge = (...ids: string[]) => ids.map((id) => { const s = SERVICES.find((x) => x.id === id)!; return { serviceId: s.id, name: s.name, price: s.price, qty: 1 } })
  const total = (items: Payment['items']) => items.reduce((s, i) => s + i.price * i.qty, 0)
  const oral = (drug: string, presentation: string, dose: string, frequency: string, duration: string, instructions?: string): PrescriptionItem =>
    ({ drug, presentation, dose, frequency, duration, route: 'Oral', instructions })

  /** Una consulta completa: cita atendida, preclínica, consulta firmada, receta y cobro. */
  const visit = (v: {
    patientId: string; doctorId: string; day: number; h: number; m?: number; reason: string; type?: Appointment['type']
    vitals: Omit<Vitals, 'id' | 'patientId' | 'appointmentId' | 'takenBy' | 'takenAt'>
    history: string; exam: string; observations?: string; diagnoses: { code: string; label: string }[]; orders: string[]
    rx?: PrescriptionItem[]; items: Payment['items']; method: Payment['method']; reference?: string
  }) => {
    const k = consultations.length + 1
    const m = v.m ?? 0
    const ids = { appt: `ca${k}`, vitals: `cv${k}`, cons: `cc${k}`, rx: v.rx ? `crx${k}` : undefined }
    appointments.push({ id: ids.appt, patientId: v.patientId, doctorId: v.doctorId, start: at(v.day, v.h, m), minutes: 30, reason: v.reason, type: v.type ?? 'followup', status: 'done' })
    vitals.push({ id: ids.vitals, patientId: v.patientId, appointmentId: ids.appt, takenBy: nurse, takenAt: at(v.day, v.h, m + 5), ...v.vitals })
    consultations.push({ id: ids.cons, patientId: v.patientId, doctorId: v.doctorId, appointmentId: ids.appt, date: at(v.day, v.h, m + 15), reason: v.reason, symptoms: [],
      history: v.history, exam: v.exam, observations: v.observations, diagnoses: v.diagnoses, orders: v.orders, plan: '', vitalsId: ids.vitals, prescriptionId: ids.rx })
    if (v.rx) prescriptions.push({ id: ids.rx!, folio: '', patientId: v.patientId, doctorId: v.doctorId, consultationId: ids.cons, issuedAt: at(v.day, v.h, m + 35), items: v.rx })
    payments.push({ id: `cp${k}`, receiptNo: '', appointmentId: ids.appt, patientId: v.patientId, items: v.items, discount: 0, total: total(v.items), method: v.method,
      reference: v.reference, receivedBy: 's-mejia', paidAt: at(v.day, v.h, m + 45) })
    return ids.cons
  }

  const DX = {
    cystitis: { code: 'N30.0', label: 'Cistitis aguda' },
    lumbago: { code: 'M54.5', label: 'Lumbago no especificado' },
    dm2: { code: 'E11.9', label: 'Diabetes mellitus tipo 2 sin complicaciones' },
    htn: { code: 'I10', label: 'Hipertensión esencial (primaria)' },
    lipids: { code: 'E78.5', label: 'Hiperlipidemia, no especificada' },
    obesity: { code: 'E66.9', label: 'Obesidad, no especificada' },
    cellulitis: { code: 'L03.1', label: 'Celulitis de otras partes de los miembros' },
    thyroid: { code: 'E03.9', label: 'Hipotiroidismo, no especificado' },
    child: { code: 'Z00.1', label: 'Control de salud de rutina del niño' },
    prenatal: { code: 'Z34.8', label: 'Supervisión de otros embarazos normales' },
  }
  const metformin = oral('Metformina', 'Tableta 850 mg', '1 tableta', 'Cada 12 horas', '90 días', 'Con el desayuno y la cena.')
  const losartan = oral('Losartán', 'Tableta 50 mg', '1 tableta', 'Cada 24 horas', '90 días', 'Por la mañana.')
  const atorvastatin = oral('Atorvastatina', 'Tableta 20 mg', '1 tableta', 'Cada 24 horas', '90 días', 'Por la noche.')

  // Consulta externa: cistitis
  visit({
    patientId: 'p15', doctorId: internist, day: -6, h: 10, reason: 'Ardor al orinar', type: 'first',
    vitals: { systolic: 118, diastolic: 76, heartRate: 88, respRate: 16, temperature: 37.6, spo2: 99, weightKg: 61, heightCm: 158, painScale: 4,
      chiefComplaint: 'Ardor al orinar y ganas de orinar a cada rato desde hace 2 días.' },
    history: 'Femenina de 33 años, sin antecedentes patológicos, con disuria, polaquiuria y urgencia urinaria de 2 días de evolución. Niega fiebre, dolor lumbar, flujo vaginal y sangrado. FUM hace 12 días. Sin infecciones urinarias en el último año.',
    exam: 'Buen estado general, hidratada. Abdomen blando, dolor leve a la palpación suprapúbica, sin masas. Puño percusión renal negativa bilateral.',
    observations: 'Examen general de orina en el laboratorio de la clínica: nitritos positivos, leucocitos de 25 a 30 por campo y bacterias abundantes.',
    diagnoses: [DX.cystitis],
    orders: ['Abundantes líquidos orales, al menos 2 litros al día.', 'Nitrofurantoína 100 mg, 1 cápsula vía oral cada 12 horas por 5 días.',
      'Fenazopiridina 200 mg, 1 tableta vía oral cada 8 horas por 2 días.', 'Urocultivo si los síntomas siguen 48 horas después de terminar el antibiótico.',
      'Regresar antes si presenta fiebre, dolor lumbar o vómitos.'],
    rx: [oral('Nitrofurantoína', 'Cápsula 100 mg', '1 cápsula', 'Cada 12 horas', '5 días', 'Con alimentos.'),
      oral('Fenazopiridina', 'Tableta 200 mg', '1 tableta', 'Cada 8 horas', '2 días', 'Tiñe la orina de color naranja.')],
    items: charge('svc-mi'), method: 'cash',
  })
  labs.push({ id: 'cl1', patientId: 'p15', category: 'lab', title: 'Examen general de orina', takenAt: at(-6, 10, 10),
    lines: ['Aspecto turbio, color amarillo', 'Densidad 1.020, pH 6.0', 'Nitritos positivos', 'Esterasa leucocitaria positiva', 'Leucocitos 25-30 por campo', 'Eritrocitos 3-5 por campo', 'Bacterias abundantes'] })

  // Consulta externa: lumbalgia mecánica, con control agendado
  visit({
    patientId: 'p16', doctorId: internist, day: -3, h: 15, reason: 'Dolor de espalda baja', type: 'first',
    vitals: { systolic: 132, diastolic: 84, heartRate: 80, respRate: 16, temperature: 36.6, spo2: 98, weightKg: 84, heightCm: 172, painScale: 7,
      chiefComplaint: 'Dolor en la espalda baja desde que levantó unas cajas hace 4 días.' },
    history: 'Masculino de 41 años, bodeguero, con dolor lumbar de 4 días que inició al levantar cajas pesadas. Dolor punzante, 7 de 10, que aumenta al agacharse y mejora en reposo. Sin irradiación a miembros inferiores, sin adormecimiento y sin alteraciones para orinar o defecar. Niega fiebre y pérdida de peso.',
    exam: 'Marcha antálgica. Contractura de músculos paravertebrales lumbares bilateral. Lasègue negativo bilateral. Fuerza 5/5, reflejos rotulianos y aquíleos conservados y simétricos. Sensibilidad sin alteraciones.',
    diagnoses: [DX.lumbago],
    orders: ['Reposo relativo por 3 días; no cargar objetos pesados por 2 semanas.', 'Calor local por 20 minutos, 3 veces al día.',
      'Naproxeno 550 mg, 1 tableta vía oral cada 12 horas por 5 días.', 'Ciclobenzaprina 10 mg, 1 tableta vía oral cada noche por 5 días.', 'Incapacidad laboral por 3 días.',
      'Fisioterapia si no mejora en una semana.', 'Consultar de inmediato si aparece debilidad en las piernas o pierde el control para orinar o defecar.'],
    rx: [oral('Naproxeno', 'Tableta 550 mg', '1 tableta', 'Cada 12 horas', '5 días', 'Con alimentos.'),
      oral('Ciclobenzaprina', 'Tableta 10 mg', '1 tableta', 'Cada 24 horas', '5 días', 'Por la noche. Da sueño: no manejar después de tomarla.')],
    items: charge('svc-mi'), method: 'card', reference: 'POS 004512',
  })
  appointments.push({ id: 'ca-next1', patientId: 'p16', doctorId: internist, start: at(8, 14, 30), minutes: 30, reason: 'Control de lumbalgia', type: 'followup', status: 'scheduled' })

  // Crónico: diabetes e hipertensión desde el diagnóstico hasta el control posterior al egreso
  visit({
    patientId: 'p17', doctorId: internist, day: -175, h: 9, reason: 'Chequeo general', type: 'first',
    vitals: { systolic: 152, diastolic: 94, heartRate: 82, respRate: 16, temperature: 36.5, spo2: 97, weightKg: 96, heightCm: 170, glucose: 212,
      chiefComplaint: 'Viene a chequeo; tiene mucha sed y orina seguido.' },
    history: 'Masculino de 65 años, taxista, que acude a chequeo general. Refiere polidipsia y poliuria de 3 meses y visión borrosa ocasional. No se controlaba desde hace 5 años. Madre diabética.',
    exam: 'Obeso, IMC 33.2. Ruidos cardíacos rítmicos, sin soplos. Pulsos periféricos presentes. Pies sin lesiones, sensibilidad conservada con monofilamento.',
    observations: 'Glucometría capilar de 212 mg/dL con síntomas clásicos. HbA1c de 8.9 %. PA elevada en dos tomas.',
    diagnoses: [DX.dm2, DX.htn, DX.obesity],
    orders: ['Dieta para diabético de 1800 kcal, baja en sal.', 'Caminar 30 minutos al día, 5 días a la semana.', 'Metformina 850 mg, 1 tableta vía oral cada 12 horas.',
      'Losartán 50 mg, 1 tableta vía oral cada 24 horas.', 'Perfil lipídico, creatinina y examen general de orina.', 'Valoración por oftalmología (fondo de ojo).',
      'Control en 3 meses con HbA1c.'],
    rx: [metformin, losartan], items: charge('svc-mi', 'svc-ecg'), method: 'insurance', reference: 'Mapfre',
  })
  labs.push({ id: 'cl2', patientId: 'p17', category: 'lab', title: 'Química sanguínea y HbA1c', takenAt: at(-175, 9, 40),
    lines: ['Hemoglobina glicosilada (HbA1c) 8.9 %', 'Glucosa en ayunas 171 mg/dl', 'Creatinina 0.9 mg/dl', 'Colesterol total 238 mg/dl', 'LDL 152 mg/dl', 'HDL 38 mg/dl', 'Trigliceridos 260 mg/dl'] })
  visit({
    patientId: 'p17', doctorId: internist, day: -84, h: 9, m: 30, reason: 'Control de diabetes',
    vitals: { systolic: 138, diastolic: 86, heartRate: 78, respRate: 16, temperature: 36.4, spo2: 98, weightKg: 92.5, heightCm: 170, glucose: 146, chiefComplaint: 'Control de azúcar y presión.' },
    history: 'Masculino de 65 años con DM2 e HTA de 3 meses de diagnóstico. Cumple el tratamiento; ya no tiene sed ni orina en exceso. Bajó 3.5 kg. Glucometrías en ayunas de 130 a 150 mg/dL. Trae laboratorios.',
    exam: 'Buen estado general. IMC 32. Pies sin lesiones, pulsos pedios presentes.',
    observations: 'HbA1c de 7.8 % (antes 8.9 %). LDL de 148 mg/dL. Oftalmología reporta fondo de ojo sin retinopatía.',
    diagnoses: [DX.dm2, DX.htn, DX.lipids],
    orders: ['Continuar dieta y ejercicio; meta de bajar 5 kg más.', 'Metformina 850 mg, 1 tableta vía oral cada 12 horas.', 'Losartán 50 mg, 1 tableta vía oral cada 24 horas.',
      'Atorvastatina 20 mg, 1 tableta vía oral cada noche.', 'Revisarse los pies todos los días y consultar ante cualquier herida.', 'Control en 3 meses con HbA1c y perfil lipídico.'],
    rx: [metformin, losartan, atorvastatin], items: charge('svc-mi'), method: 'insurance', reference: 'Mapfre',
  })
  labs.push({ id: 'cl3', patientId: 'p17', category: 'lab', title: 'Hemoglobina glicosilada y perfil lipídico', takenAt: at(-85, 7, 30),
    lines: ['Hemoglobina glicosilada (HbA1c) 7.8 %', 'Glucosa en ayunas 139 mg/dl', 'Colesterol total 221 mg/dl', 'LDL 148 mg/dl', 'Trigliceridos 214 mg/dl'] })
  const fromConsult = visit({
    patientId: 'p17', doctorId: internist, day: -9, h: 10, reason: 'Pierna derecha roja e hinchada', type: 'urgent',
    vitals: { systolic: 146, diastolic: 90, heartRate: 104, respRate: 20, temperature: 38.6, spo2: 96, weightKg: 91, heightCm: 170, glucose: 286, painScale: 7,
      chiefComplaint: 'Pierna derecha roja, caliente e hinchada desde hace 3 días, con fiebre.' },
    history: 'Masculino de 65 años con DM2 e HTA. Hace 5 días se hirió el tobillo derecho con un clavo; hace 3 días inició enrojecimiento, calor y dolor que sube hacia la pantorrilla, con fiebre de 38.5 °C desde anoche. Se aplicó remedios caseros.',
    exam: 'Febril, taquicárdico. Pierna derecha con eritema, calor y edema desde el tobillo hasta el tercio medio, bordes mal definidos, sin crepitación ni ampollas. Herida puntiforme en maléolo externo con escasa secreción purulenta. Pulsos pedios presentes.',
    observations: 'Glucometría de 286 mg/dL. Se decide ingreso por celulitis extensa con fiebre en paciente diabético.',
    diagnoses: [DX.cellulitis, DX.dm2],
    orders: ['Ingreso a sala de medicina interna.', 'Hemograma, glucosa, creatinina y proteína C reactiva.', 'Ultrasonido Doppler venoso de miembro inferior derecho.', 'Manejo según nota de ingreso.'],
    items: charge('svc-mi'), method: 'insurance', reference: 'Mapfre',
  })

  // La hospitalización de ese paciente: 4 días con antibiótico IV, cambio a vía oral y egreso con receta
  const admitted = dayAt(-9, 11)
  const discharged = dayAt(-5, 11)
  const hospitalizations: Hospitalization[] = [{
    id: 'chz1', patientId: 'p17', bedId: CASE_BED, consultationId: fromConsult, admittedAt: iso(admitted), admittedBy: internist,
    reason: 'Celulitis de pierna derecha con fiebre, de 3 días de evolución, en paciente diabético.', diagnoses: [DX.cellulitis, DX.dm2],
    companionName: 'Marlen Flores', companionRelation: 'Esposa', companionPhone: '9734-2210', patientPhone: '9734-5508',
    kind: 'hospital', status: 'discharged', dischargedAt: iso(discharged), dischargedBy: internist, prescriptionId: 'crx-egreso',
  }]
  const soap = (id: string, kind: 'admission' | 'evolution', when: Date, s: string, o: string, a: string, pl: string, orders: string[]): InpatientNote =>
    ({ id, hospitalizationId: 'chz1', kind, authorId: internist, at: iso(when), subjective: s, objective: o, assessment: a, plan: pl, text: '', orders })
  const nursing = (id: string, when: Date, text: string): InpatientNote =>
    ({ id, hospitalizationId: 'chz1', kind: 'nursing', authorId: nurse, at: iso(when), subjective: '', objective: '', assessment: '', plan: '', text })
  const discharge = {
    diagnoses: [DX.cellulitis, DX.dm2, DX.htn],
    summary: 'Ingresó por celulitis de pierna derecha con fiebre, secundaria a herida con clavo en el tobillo, y glucosa de 286 mg/dL. Recibió clindamicina IV por 3 días con buena respuesta y se pasó a amoxicilina con ácido clavulánico oral. Doppler venoso sin trombosis. La glucosa se controló con insulina NPH y se reinició metformina. Afebril desde el segundo día.',
    condition: 'Mejorado, afebril y deambulando.',
    instructions: 'Completar el antibiótico por 7 días más. Elevar la pierna al estar sentado. Lavar la herida con agua y jabón una vez al día. Revisarse los pies a diario y usar calzado cerrado. Glucometría en ayunas cada día, anotarla y traer el registro. Regresar si vuelve la fiebre, aumenta el enrojecimiento o sale pus.',
    followUp: 'Control en consulta externa con la Dra. Herrera en 4 días.',
  }
  const notes: InpatientNote[] = [
    soap('chn1', 'admission', dayAt(-9, 11, 20),
      'Masculino de 65 años, diabético e hipertenso, con eritema, calor, edema y dolor en pierna derecha de 3 días, tras herida con clavo en el tobillo hace 5 días. Fiebre de 38.5 °C desde anoche.',
      'PA 146/90, FC 104, FR 20, T 38.6 °C, SpO₂ 96 %. Glucometría 286 mg/dL. Eritema y edema del tobillo al tercio medio de la pierna derecha; herida puntiforme con secreción purulenta en maléolo externo. Pulsos pedios presentes.',
      'Celulitis de pierna derecha sin datos de fascitis, en paciente con DM2 descompensada.',
      'Elevar el miembro y marcar los bordes del eritema. Antibiótico IV, analgesia, insulina y tromboprofilaxis según indicaciones. Suspender metformina durante la hospitalización. Hemograma, química y Doppler venoso.',
      ['Dieta para diabético, 1800 kcal.', 'Signos vitales cada 4 horas.', 'Glucometría antes de cada comida y a las 22:00.', 'Elevar miembro inferior derecho.',
        'Marcar bordes del eritema en cada turno.', 'Curación de la herida del tobillo cada 24 horas.', 'Clindamicina 600 mg IV c/8h', 'Acetaminofén 1 g IV c/8h PRN',
        'Insulina NPH 10 UI SC c/12h', 'Enoxaparina 40 mg SC c/24h', 'Losartán 50 mg VO c/24h']),
    soap('chn2', 'evolution', dayAt(-8, 8, 30), 'Durmió bien. Dolor 5 de 10. Sin fiebre desde la madrugada.',
      'PA 138/84, FC 90, T 37.6 °C. Eritema dentro de los bordes marcados, sin progresión. Leucocitos 17 300. Doppler sin trombosis venosa profunda. Glucometrías de 190 a 240 mg/dL.',
      'Celulitis con respuesta inicial al antibiótico. Hiperglucemia aún fuera de metas.', 'Continúa clindamicina. Se aumenta insulina NPH a 14 UI cada 12 horas.',
      ['Dieta para diabético, 1800 kcal.', 'Signos vitales cada 4 horas.', 'Glucometría antes de cada comida y a las 22:00.', 'Elevar miembro inferior derecho.',
        'Clindamicina 600 mg IV c/8h', 'Acetaminofén 1 g IV c/8h PRN', 'Insulina NPH 14 UI SC c/12h', 'Enoxaparina 40 mg SC c/24h', 'Losartán 50 mg VO c/24h']),
    soap('chn3', 'evolution', dayAt(-7, 8, 30), 'Sin fiebre. Dolor 3 de 10. Ya camina al baño.',
      'Afebril 36 horas. El eritema retrocedió unos 4 cm de los bordes marcados. Herida limpia, sin secreción. Glucometría de 68 mg/dL en ayunas, sin síntomas; se omitió la NPH de la mañana. Resto de glucometrías de 130 a 170 mg/dL.',
      'Celulitis en mejoría. Hipoglucemia leve aislada.', 'Continúa el mismo manejo; vigilar glucometrías antes de cada dosis de NPH. Si sigue afebril, mañana pasa a antibiótico oral.',
      ['Glucometría antes de cada dosis de NPH; no aplicarla si es menor de 90 mg/dL y avisar.', 'Clindamicina 600 mg IV c/8h', 'Acetaminofén 1 g IV c/8h PRN',
        'Insulina NPH 14 UI SC c/12h', 'Enoxaparina 40 mg SC c/24h', 'Losartán 50 mg VO c/24h']),
    soap('chn4', 'evolution', dayAt(-6, 8), 'Se siente bien, con apetito.',
      'Afebril 60 horas. Eritema residual leve en el tercio inferior. Leucocitos 9 800. Glucometrías de 110 a 160 mg/dL.',
      'Celulitis en resolución.', 'Se omite clindamicina IV y se inicia amoxicilina con ácido clavulánico oral. Reinicia metformina. Egreso en 24 a 48 horas.',
      ['Amoxicilina con ácido clavulánico 875 mg VO c/12h', 'Metformina 850 mg VO c/12h', 'Acetaminofén 1 g IV c/8h PRN', 'Insulina NPH 14 UI SC c/12h',
        'Enoxaparina 40 mg SC c/24h', 'Losartán 50 mg VO c/24h']),
    { id: 'chn5', hospitalizationId: 'chz1', kind: 'discharge', authorId: internist, at: iso(discharged), subjective: '', objective: '', assessment: '', plan: discharge.instructions, text: '', discharge },
    nursing('chn6', dayAt(-9, 11, 10), 'Ingresa a sala en silla de ruedas, consciente y orientado. Se canaliza vena periférica en antebrazo izquierdo con catéter 20. Se marcan los bordes del eritema y se toman muestras de laboratorio.'),
    nursing('chn7', dayAt(-9, 23), 'Temperatura de 38.4 °C; se aplica acetaminofén según indicación. Glucometría de 241 mg/dL.'),
    nursing('chn8', dayAt(-7, 7, 50), 'Glucometría de 68 mg/dL antes del desayuno, asintomático. Se le da jugo, se avisa al médico y no se aplica la NPH de las 08:00.'),
    nursing('chn9', dayAt(-5, 10, 30), 'Se retira catéter periférico sin complicaciones. Se explican al paciente y a su esposa las indicaciones de egreso y la receta. Egresa caminando.'),
  ]
  const med = (id: string, noteId: string, drug: string, presentation: string, dose: string, route: string, everyHours: number, prn: boolean, firstAt: Date,
    instructions?: string, stoppedAt = discharged): InpatientMed => ({
    id, hospitalizationId: 'chz1', noteId, drug, presentation, dose, route, everyHours, prn, firstAt: iso(firstAt), instructions, orderedBy: internist,
    orderedAt: iso(firstAt), stoppedAt: iso(stoppedAt), stoppedBy: internist,
  })
  const meds: InpatientMed[] = [
    med('chm1', 'chn1', 'Clindamicina', 'Vial 600 mg/4 ml', '600 mg', 'Intravenosa', 8, false, dayAt(-9, 13), undefined, dayAt(-6, 8)),
    med('chm2', 'chn1', 'Acetaminofén', 'Frasco 1 g/100 ml', '1 g', 'Intravenosa', 8, true, dayAt(-9, 13), 'Si la temperatura es mayor de 38 °C o hay dolor.'),
    med('chm3', 'chn1', 'Insulina NPH', 'Frasco 100 UI/ml', '10 UI', 'Subcutánea', 12, false, dayAt(-9, 20), undefined, dayAt(-8, 8, 30)),
    med('chm4', 'chn2', 'Insulina NPH', 'Frasco 100 UI/ml', '14 UI', 'Subcutánea', 12, false, dayAt(-8, 20), 'Glucometría antes de aplicarla.'),
    med('chm5', 'chn1', 'Enoxaparina', 'Jeringa 40 mg/0,4 ml', '40 mg', 'Subcutánea', 24, false, dayAt(-9, 20)),
    med('chm6', 'chn1', 'Losartán', 'Tableta 50 mg', '50 mg', 'Oral', 24, false, dayAt(-8, 8)),
    med('chm7', 'chn4', 'Amoxicilina con ácido clavulánico', 'Tableta 875/125 mg', '875 mg', 'Oral', 12, false, dayAt(-6, 9), 'Con alimentos.'),
    med('chm8', 'chn4', 'Metformina', 'Tableta 850 mg', '850 mg', 'Oral', 12, false, dayAt(-6, 13), 'Con los alimentos.'),
  ]
  // Hoja de enfermería completa hasta el egreso; la NPH del día de la hipoglucemia quedó sin aplicar
  const skipped = iso(dayAt(-7, 8))
  const doses: Dose[] = []
  for (const m of meds) {
    for (const s of doseTimes(m, new Date(m.firstAt), new Date(m.stoppedAt!))) {
      const slot = iso(s.at)
      doses.push(m.id === 'chm4' && slot === skipped
        ? { id: `chd${doses.length + 1}`, medId: m.id, scheduledAt: slot, givenAt: iso(dayAt(-7, 8, 5)), givenBy: nurse, status: 'skipped', note: 'Glucometría de 68 mg/dL. Se avisó al médico.' }
        : { id: `chd${doses.length + 1}`, medId: m.id, scheduledAt: slot, givenAt: iso(new Date(s.at.getTime() + (5 + (doses.length % 3) * 5) * 60_000)), givenBy: nurse, status: 'given' })
    }
  }
  for (const [when, note] of [[dayAt(-9, 13, 30), 'T 38.6 °C.'], [dayAt(-9, 23, 5), 'T 38.4 °C.'], [dayAt(-8, 4, 10), 'Dolor 6/10.']] as const) {
    doses.push({ id: `chd${doses.length + 1}`, medId: 'chm2', givenAt: iso(when), givenBy: nurse, status: 'given', note })
  }
  const procedures: HospProcedure[] = [
    { id: 'chp1', hospitalizationId: 'chz1', kind: 'authorization', name: 'Autorización de Mapfre para hospitalización', status: 'authorized', notes: 'Autorización 55-80213.',
      createdBy: internist, createdAt: iso(dayAt(-9, 11, 40)), updatedBy: internist, updatedAt: iso(dayAt(-9, 13, 15)) },
    { id: 'chp2', hospitalizationId: 'chz1', kind: 'procedure', name: 'Ultrasonido Doppler venoso de miembro inferior derecho', scheduledAt: iso(dayAt(-9, 15)), status: 'done',
      notes: 'Sin trombosis venosa profunda. Edema del tejido celular subcutáneo.', createdBy: internist, createdAt: iso(dayAt(-9, 11, 30)), updatedBy: internist, updatedAt: iso(dayAt(-9, 15, 40)) },
  ]
  labs.push(
    { id: 'cl4', patientId: 'p17', hospitalizationId: 'chz1', category: 'lab', title: 'Hemograma', takenAt: iso(dayAt(-9, 11, 30)),
      lines: ['Leucocitos 17 300 /mm3', 'Neutrofilos 84 %', 'Hemoglobina 13.9 g/dl', 'Plaquetas 286 000 /mm3'] },
    { id: 'cl5', patientId: 'p17', hospitalizationId: 'chz1', category: 'lab', title: 'Química sanguínea', takenAt: iso(dayAt(-9, 11, 30)),
      lines: ['Glucosa 279 mg/dl', 'Creatinina 1.0 mg/dl', 'Nitrogeno ureico 18 mg/dl', 'Proteina C reactiva 96 mg/l'] },
    { id: 'cl6', patientId: 'p17', hospitalizationId: 'chz1', category: 'lab', title: 'Hemograma', takenAt: iso(dayAt(-6, 6)),
      lines: ['Leucocitos 9 800 /mm3', 'Neutrofilos 68 %', 'Hemoglobina 13.5 g/dl', 'Plaquetas 301 000 /mm3', 'Proteina C reactiva 21 mg/l'] },
  )
  prescriptions.push({ id: 'crx-egreso', folio: '', patientId: 'p17', doctorId: internist, consultationId: 'chn5', hospitalizationId: 'chz1', issuedAt: iso(discharged), items: [
    oral('Amoxicilina con ácido clavulánico', 'Tableta 875/125 mg', '1 tableta', 'Cada 12 horas', '7 días', 'Con alimentos. No dejarlo aunque se sienta bien.'),
    oral('Acetaminofén', 'Tableta 500 mg', '2 tabletas', 'Cada 8 horas', '5 días', 'Sólo si hay dolor o fiebre.'),
    { ...metformin, duration: '30 días' }, { ...losartan, duration: '30 días' }, { ...atorvastatin, duration: '30 días' },
  ] })
  const stay = [{ name: 'Hospitalización en sala de medicina interna (por día)', price: 1800, qty: 4 }, { name: 'Medicamentos e insumos', price: 3150, qty: 1 },
    { ...charge('svc-cur')[0], qty: 4 }]
  payments.push({ id: 'cp-hosp', receiptNo: '', patientId: 'p17', items: stay, discount: 0, total: total(stay), method: 'insurance', reference: 'Mapfre, autorización 55-80213',
    receivedBy: 's-mejia', paidAt: iso(dayAt(-5, 11, 40)) })
  visit({
    patientId: 'p17', doctorId: internist, day: -1, h: 9, reason: 'Control después del egreso',
    vitals: { systolic: 134, diastolic: 82, heartRate: 76, respRate: 16, temperature: 36.6, spo2: 98, weightKg: 90.5, heightCm: 170, glucose: 132, painScale: 1,
      chiefComplaint: 'Control de la pierna; ya casi no le duele.' },
    history: 'Masculino de 65 años, egresado hace 4 días por celulitis de pierna derecha. Cumple amoxicilina con ácido clavulánico, va en el día 4 de 7. Sin fiebre. Glucometrías en ayunas de 118 a 140 mg/dL según su registro.',
    exam: 'Pierna derecha sin eritema ni calor, edema leve residual en el tobillo. Herida del maléolo externo cerrada, sin secreción. Pulsos pedios presentes.',
    observations: 'HbA1c de control de 7.2 %. Celulitis resuelta.',
    diagnoses: [DX.dm2, DX.htn, DX.lipids],
    orders: ['Terminar amoxicilina con ácido clavulánico hasta completar los 7 días.', 'Metformina 850 mg, 1 tableta vía oral cada 12 horas.', 'Losartán 50 mg, 1 tableta vía oral cada 24 horas.',
      'Atorvastatina 20 mg, 1 tableta vía oral cada noche.', 'Cuidado de los pies: revisión diaria, calzado cerrado, no caminar descalzo.',
      'Control de crónicos en 3 meses con HbA1c, perfil lipídico y microalbuminuria.'],
    rx: [metformin, losartan, atorvastatin], items: charge('svc-mi'), method: 'insurance', reference: 'Mapfre',
  })
  labs.push({ id: 'cl7', patientId: 'p17', category: 'lab', title: 'Hemoglobina glicosilada', takenAt: at(-2, 7, 15), lines: ['Hemoglobina glicosilada (HbA1c) 7.2 %', 'Glucosa en ayunas 124 mg/dl'] })

  // Crónico: hipertensión e hipotiroidismo, con su control de mañana
  visit({
    patientId: 'p18', doctorId: internist, day: -120, h: 10, m: 30, reason: 'Control de presión arterial',
    vitals: { systolic: 148, diastolic: 92, heartRate: 72, respRate: 16, temperature: 36.4, spo2: 97, weightKg: 72, heightCm: 155, chiefComplaint: 'Control; se le olvidan algunas pastillas.' },
    history: 'Femenina de 69 años con HTA de 14 años e hipotiroidismo. Olvida el amlodipino 2 o 3 veces por semana. Cefalea occipital ocasional. Niega dolor torácico, disnea y edema.',
    exam: 'Buen estado general. Ruidos cardíacos rítmicos, sin soplos. Tiroides no palpable. Extremidades sin edema.',
    observations: 'TSH de 3.1 mUI/L. Electrocardiograma en ritmo sinusal, sin hipertrofia ventricular izquierda.',
    diagnoses: [DX.htn, DX.thyroid],
    orders: ['Dieta hiposódica.', 'Amlodipino 10 mg, 1 tableta vía oral cada 24 horas (se aumenta la dosis).', 'Levotiroxina 50 mcg, 1 tableta en ayunas.',
      'Usar pastillero semanal; su hija le recordará las tomas.', 'Tomarse la presión en casa 3 veces por semana y anotarla.', 'Control en 3 meses con creatinina y perfil lipídico.'],
    rx: [oral('Amlodipino', 'Tableta 10 mg', '1 tableta', 'Cada 24 horas', '90 días', 'Por la mañana.'),
      oral('Levotiroxina', 'Tableta 50 mcg', '1 tableta', 'Cada 24 horas', '90 días', 'En ayunas, 30 minutos antes del desayuno.')],
    items: charge('svc-mi', 'svc-ecg'), method: 'cash',
  })
  visit({
    patientId: 'p18', doctorId: internist, day: -30, h: 10, m: 30, reason: 'Control de presión arterial',
    vitals: { systolic: 132, diastolic: 80, heartRate: 70, respRate: 16, temperature: 36.5, spo2: 98, weightKg: 71, heightCm: 155, chiefComplaint: 'Control de presión; trae su registro.' },
    history: 'Con el pastillero ya no olvida dosis. Presiones en casa de 125 a 135 / 78 a 84 mmHg. Sin cefalea. Trae laboratorios.',
    exam: 'Buen estado general. Sin edema en miembros inferiores. Sin otros hallazgos.',
    observations: 'Creatinina de 0.8 mg/dL. LDL de 118 mg/dL.',
    diagnoses: [DX.htn, DX.thyroid],
    orders: ['Continuar amlodipino 10 mg cada 24 horas.', 'Continuar levotiroxina 50 mcg en ayunas.', 'Mamografía de tamizaje por antecedente familiar.', 'Control en 1 mes con el resultado de la mamografía.'],
    rx: [oral('Amlodipino', 'Tableta 10 mg', '1 tableta', 'Cada 24 horas', '90 días', 'Por la mañana.'),
      oral('Levotiroxina', 'Tableta 50 mcg', '1 tableta', 'Cada 24 horas', '90 días', 'En ayunas, 30 minutos antes del desayuno.')],
    items: charge('svc-mi'), method: 'cash',
  })
  appointments.push({ id: 'ca-next2', patientId: 'p18', doctorId: internist, start: at(1, 10, 30), minutes: 30, reason: 'Control de presión arterial', type: 'followup', status: 'confirmed' })

  // Pediatría: control de niño sano con vacuna
  visit({
    patientId: 'p19', doctorId: 's-paz', day: -14, h: 8, m: 30, reason: 'Control de niño sano',
    vitals: { heartRate: 112, respRate: 26, temperature: 36.7, spo2: 99, weightKg: 12.6, heightCm: 89, chiefComplaint: 'Control de los 2 años y medio y vacunas.' },
    history: 'Femenina de 2 años 6 meses que acude a control de niño sano. Come bien y duerme toda la noche. Dice frases de 3 palabras, corre y sube escaleras. Sin enfermedades desde el último control. La madre refiere que juega con tierra en la guardería.',
    exam: 'Activa, reactiva, bien hidratada. Peso de 12.6 kg y talla de 89 cm, ambos en el percentil 50 para la edad. Otoscopia normal. Ruidos cardíacos rítmicos, sin soplos. Abdomen blando. Genitales normales.',
    observations: 'Desarrollo psicomotor adecuado para la edad. Se aplica la vacuna que corresponde según el esquema nacional.',
    diagnoses: [DX.child],
    orders: ['Alimentación variada con la familia; limitar jugos y golosinas.', 'Albendazol 400 mg, dosis única vía oral (desparasitación).',
      'Sulfato ferroso, 15 mg de hierro elemental al día por 3 meses.', 'Lavado de manos antes de comer y después de jugar.', 'Próximo control de niño sano a los 3 años.'],
    rx: [oral('Albendazol', 'Suspensión 400 mg/10 ml', '10 ml', 'Dosis única', '1 día', 'Por la mañana.'),
      oral('Sulfato ferroso', 'Gotas 25 mg/ml de hierro elemental', '0.6 ml', 'Cada 24 horas', '90 días', 'Entre comidas, con jugo de naranja. Oscurece las heces.')],
    items: charge('svc-ped', 'svc-vac'), method: 'transfer', reference: 'BAC 7781204',
  })

  // Ginecología: control prenatal de un segundo embarazo
  const prenatalRx = [oral('Ácido fólico', 'Tableta 1 mg', '1 tableta', 'Cada 24 horas', '30 días'),
    oral('Sulfato ferroso', 'Tableta 300 mg', '1 tableta', 'Cada 24 horas', '30 días', 'Con jugo de naranja, lejos de la leche.'),
    oral('Carbonato de calcio', 'Tableta 600 mg', '1 tableta', 'Cada 12 horas', '30 días', 'Separado 2 horas del hierro.')]
  visit({
    patientId: 'p20', doctorId: 's-zuniga', day: -32, h: 9, reason: 'Control prenatal',
    vitals: { systolic: 108, diastolic: 68, heartRate: 84, respRate: 18, temperature: 36.6, spo2: 99, weightKg: 63.5, heightCm: 160, chiefComplaint: 'Control del embarazo; se siente bien.' },
    history: 'Femenina de 28 años, G2 P1, con embarazo de 23.5 semanas por FUM confiable. Percibe movimientos fetales. Niega sangrado, salida de líquido, contracciones, cefalea y edema. Las náuseas desaparecieron en el segundo trimestre.',
    exam: 'Altura uterina de 23 cm. Frecuencia cardíaca fetal de 146 lpm. Sin dinámica uterina. Sin edema en miembros inferiores.',
    observations: 'Ultrasonido obstétrico: feto único vivo, cefálico, biometría acorde a 23 semanas 4 días, placenta posterior normoinserta, líquido amniótico normal.',
    diagnoses: [DX.prenatal],
    orders: ['Ácido fólico 1 mg, 1 tableta vía oral al día.', 'Sulfato ferroso 300 mg, 1 tableta vía oral al día.', 'Carbonato de calcio 600 mg, 1 tableta vía oral cada 12 horas.',
      'Curva de tolerancia a la glucosa de 75 g entre las semanas 24 y 28, por antecedente de madre diabética.', 'Hemograma y examen general de orina.',
      'Signos de alarma: sangrado, salida de líquido, dolor de cabeza intenso, visión borrosa o menos movimientos del bebé.', 'Control prenatal en 4 semanas.'],
    rx: prenatalRx, items: charge('svc-gin'), method: 'card', reference: 'POS 004133',
  })
  labs.push({ id: 'cl8', patientId: 'p20', category: 'imaging', title: 'Ultrasonido obstétrico', takenAt: at(-32, 9, 20),
    lines: ['Feto unico vivo, presentacion cefalica', 'DBP, CC, CA y LF acordes a 23 semanas 4 dias', 'Peso fetal estimado 610 g', 'Frecuencia cardiaca fetal 146 lpm',
      'Placenta posterior, normoinserta, grado I', 'Liquido amniotico normal (ILA 14 cm)', 'Sin malformaciones evidentes'] })
  labs.push({ id: 'cl9', patientId: 'p20', category: 'lab', title: 'Curva de tolerancia a la glucosa y hemograma', takenAt: at(-6, 7, 30),
    lines: ['Glucosa en ayunas 84 mg/dl', 'Glucosa 1 hora post carga 152 mg/dl', 'Glucosa 2 horas post carga 128 mg/dl', 'Hemoglobina 11.4 g/dl', 'Plaquetas 245 000 /mm3'] })
  visit({
    patientId: 'p20', doctorId: 's-zuniga', day: -4, h: 9, reason: 'Control prenatal',
    vitals: { systolic: 112, diastolic: 70, heartRate: 86, respRate: 18, temperature: 36.5, spo2: 99, weightKg: 65.2, heightCm: 160, chiefComplaint: 'Control del embarazo; trae resultados.' },
    history: 'Embarazo de 27.5 semanas. Movimientos fetales presentes. Sin síntomas de alarma. Cumple los suplementos. Trae curva de tolerancia a la glucosa y hemograma.',
    exam: 'Altura uterina de 27 cm. Frecuencia cardíaca fetal de 142 lpm. Presentación cefálica. Sin edema.',
    observations: 'Curva de tolerancia a la glucosa normal (84, 152 y 128 mg/dL). Hemoglobina de 11.4 g/dL. Se aplica Tdpa.',
    diagnoses: [DX.prenatal],
    orders: ['Continuar ácido fólico, sulfato ferroso y calcio.', 'Vacuna Tdpa aplicada hoy.', 'Inscribirse en el curso de preparación para el parto.', 'Control prenatal en 2 semanas.'],
    rx: prenatalRx, items: charge('svc-gin', 'svc-vac'), method: 'card', reference: 'POS 004871',
  })
  appointments.push({ id: 'ca-next3', patientId: 'p20', doctorId: 's-zuniga', start: at(10, 9, 0), minutes: 45, reason: 'Control prenatal', type: 'followup', status: 'scheduled' })

  const followups: Followup[] = [
    { id: 'cfu1', patientId: 'p15', kind: 'reminder', title: 'Llamar para confirmar que terminó el antibiótico y ya no tiene molestias', dueDate: day(1), createdBy: internist, createdAt: at(-6, 10, 40), active: true },
    { id: 'cfu2', patientId: 'p17', kind: 'chronic', title: 'Diabetes mellitus tipo 2 e hipertensión arterial', dueDate: day(89), everyDays: 90, notes: 'Traer HbA1c, perfil lipídico y microalbuminuria.',
      createdBy: internist, createdAt: at(-175, 9, 40), active: true },
    { id: 'cfu3', patientId: 'p18', kind: 'chronic', title: 'Hipertensión arterial e hipotiroidismo', dueDate: day(1), everyDays: 90, notes: 'Traer el resultado de la mamografía.',
      createdBy: internist, createdAt: at(-120, 11), active: true },
    { id: 'cfu4', patientId: 'p18', kind: 'procedure', title: 'Mamografía de tamizaje', dueDate: day(-2), notes: 'Por antecedente de hermana con cáncer de mama.', createdBy: internist, createdAt: at(-30, 11), active: true },
    { id: 'cfu5', patientId: 'p19', kind: 'reminder', title: 'Control de niño sano de los 3 años', dueDate: day(166), createdBy: 's-paz', createdAt: at(-14, 9), active: true },
    { id: 'cfu6', patientId: 'p20', kind: 'reminder', title: 'Control prenatal de la semana 30 con ultrasonido', dueDate: day(10), createdBy: 's-zuniga', createdAt: at(-4, 9, 30), active: true },
  ]

  // Expedientes, folios y recibos siguen la numeración de la clínica en orden cronológico
  const time = (s: string) => new Date(s).getTime()
  patients.forEach((x, i) => { x.record = `EXP-${String(next.record + i).padStart(5, '0')}` })
  prescriptions.sort((x, y) => time(x.issuedAt) - time(y.issuedAt)).forEach((x, i) => { x.folio = `RX-${now.getFullYear()}-${String(next.folio + i).padStart(4, '0')}` })
  payments.sort((x, y) => time(x.paidAt) - time(y.paidAt)).forEach((x, i) => { x.receiptNo = `R-${String(next.receipt + i).padStart(6, '0')}` })

  return { patients, appointments, vitals, consultations, prescriptions, payments, hospitalizations, notes, meds, doses, procedures, labs, followups }
}
