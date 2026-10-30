import { HELP, type TourStep } from './types.js'

/**
 * Recorrido del médico independiente (consultorio). Es uno solo para sus dos vistas: en la de médico ve los pasos
 * clínicos y en la de administrador los administrativos; en las dos, cómo cambiar de vista.
 */
export const consultorio: TourStep[] = [
  { route: '/app', title: 'Tu consultorio está listo', body: 'Te mostramos dónde está cada cosa para atender, cobrar y administrar tu consultorio.' },
  { route: '/app', target: 'vista', title: 'Vista de médico y vista de administrador', body: 'Eres médico y administrador. En la vista de médico ves lo clínico; en la de administrador, configuración, personal y reportes. Cambia aquí cuando quieras.' },
  { route: '/app/consulta-externa', target: 'sala-espera', perm: 'consult.write', title: 'Atender', body: 'Tu sala de espera. Toca «Atender» para abrir la consulta: historia, examen, diagnóstico CIE-11, indicaciones, medicamentos y exámenes.' },
  { route: (c) => c.consultNote, target: 'nota-consulta', perm: 'consult.write', title: 'La nota de consulta', body: 'Firmada no se edita: para corregir algo se agrega una adenda. La receta y la orden de exámenes salen aparte.' },
  { route: '/app/caja', target: 'nuevo-cobro', perm: 'billing.manage', title: 'Cobrar', body: 'Cobras tú o tu asistente: servicios, forma de pago y abonos. El recibo se imprime o se envía por WhatsApp.' },
  { target: 'nav:/app/observacion', perm: 'inpatient.view', feature: 'observation', title: 'Observación', body: 'Pacientes en observación corta: medicamentos, signos y notas. Si no la usas, la apagas en la configuración del consultorio.' },
  { route: '/app/mi-configuracion', target: 'mi-config', perm: 'consult.write', title: 'Mi configuración', body: 'Tu firma y sello, tu horario, tus medicamentos y exámenes frecuentes y tus sets de órdenes.' },
  { route: '/app/configuracion', target: 'contactos', perm: 'settings.manage', title: 'Datos del consultorio', body: 'Dirección, logo y los contactos que salen en recetas y recibos.' },
  { route: '/app/configuracion', target: 'tab:pagos', perm: 'settings.manage', title: 'Precios y formas de pago', body: 'Tus servicios con su precio y las formas de pago que aceptas.' },
  { route: '/app/personal', target: 'tab:personal', perm: 'staff.manage', title: 'Tu personal', body: 'Agrega asistentes y enfermería. Cada quien ve sólo lo que necesita.' },
  { route: '/app/reportes', target: 'reportes', perm: 'reports.view', title: 'Reportes', body: 'Citas, asistencia e ingresos del periodo que elijas.' },
  HELP,
]

/** Asistente del consultorio. */
export const asistente: TourStep[] = [
  { route: '/app', title: 'Te damos la bienvenida', body: 'Agendas citas, recibes al paciente, tomas la preclínica, cobras y aplicas lo que el médico indica en observación.' },
  { route: '/app/agenda', target: 'nueva-cita', perm: 'agenda.manage', title: 'Agendar', body: 'Crea, reprograma y cancela citas. Las que los pacientes reservan en línea también llegan aquí.' },
  { route: '/app/consulta-externa', target: 'sala-espera', title: 'Sala de espera y preclínica', body: 'Registra la llegada y toca «Preclínica» para tomar los signos antes de que pase con el médico.' },
  { route: '/app/pacientes', target: 'nuevo-paciente', perm: 'patients.manage', title: 'Registrar un paciente', body: 'Datos personales, identidad y contacto de emergencia.' },
  { route: '/app/caja', target: 'nuevo-cobro', perm: 'billing.manage', title: 'Cobrar', body: 'Las consultas terminadas aparecen para cobrarlas; al final del día haces el arqueo.' },
  { target: 'nav:/app/observacion', feature: 'observation', title: 'Observación', body: 'Aquí registras las dosis que el médico indica a los pacientes en observación.' },
  HELP,
]

/** Administración de la plataforma. */
export const plataforma: TourStep[] = [
  { route: '/app', title: 'Te damos la bienvenida', body: 'Administras la plataforma: creas clínicas y consultorios y sus usuarios. No ves expedientes de pacientes.' },
  { target: 'nav:/app', title: 'Clínicas y consultorios', body: 'Crea una cuenta nueva y entra a su detalle para agregar usuarios o desactivarla.' },
  { target: 'me', title: 'Tu cuenta', body: 'Tu contraseña y la verificación en dos pasos.' },
]
