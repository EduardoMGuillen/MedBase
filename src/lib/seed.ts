import type { Appointment, ClinicSettings, Consultation, Patient, Payment, Prescription, Schedule, Service, Staff, Vitals } from './types.js'
import { ICD10 } from './catalogs.js'

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
    phone: '+504 2550-1188', email: 'citas@sanlucas.hn', currency: 'L', rxValidityDays: 30, reminderTemplate: DEFAULT_SETTINGS.reminderTemplate,
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
