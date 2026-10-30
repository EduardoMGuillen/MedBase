import { HELP, type TourStep } from './types.js'

/** Recorrido de administración: configuración, personal, bitácora y reportes. Sin pantallas clínicas. */
export const administracion: TourStep[] = [
  { route: '/app', title: 'Te damos la bienvenida', body: 'Configuras la clínica, el personal y los precios, y revisas los indicadores. Por privacidad, no ves notas clínicas.' },
  { route: '/app/configuracion', target: 'contactos', perm: 'settings.manage', title: 'Datos y contactos', body: 'Nombre, dirección, logo y los teléfonos o WhatsApp que salen en recetas, recibos y recordatorios.' },
  { route: '/app/configuracion', target: 'tab:servicios', perm: 'settings.manage', title: 'Servicios y precios', body: 'Lo que se cobra. Los servicios nuevos creados al cobrar también aparecen aquí.' },
  { route: '/app/configuracion', target: 'tab:pagos', perm: 'settings.manage', title: 'Formas de pago', body: 'Elige las que acepta la clínica: efectivo, transferencia, tarjeta, seguro, depósito u otra.' },
  { route: '/app/configuracion', target: 'tab:horarios', perm: 'settings.manage', title: 'Horarios', body: 'El horario de atención de cada médico; la agenda y la reserva en línea sólo ofrecen esas horas.' },
  { route: '/app/configuracion', target: 'tab:camas', perm: 'settings.manage', feature: 'hospital', title: 'Camas', body: 'Agrega camas, márcalas fuera de servicio y mira cuáles están ocupadas.' },
  { route: '/app/configuracion', target: 'tab:areas', perm: 'settings.manage', title: 'Áreas de servicio', body: 'Si la clínica tiene laboratorio o imágenes propios, los exámenes les llegan a ellos; si no, a enfermería.' },
  { route: '/app/personal', target: 'tab:personal', perm: 'staff.manage', title: 'Personal y roles', body: 'Agrega usuarios y dales uno o varios roles. Con varios, cada persona cambia entre sus vistas.' },
  { route: '/app/personal', target: 'tab:bitacora', perm: 'audit.view', title: 'Bitácora', body: 'Quién hizo qué y cuándo, con filtros por persona, rol, paciente y fechas. Nadie la puede editar.' },
  { route: '/app/reportes', target: 'reportes', perm: 'reports.view', title: 'Reportes', body: 'Citas, asistencia e ingresos por médico, por servicio y por forma de pago. Se exportan a CSV.' },
  HELP,
]
