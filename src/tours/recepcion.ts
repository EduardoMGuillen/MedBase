import { HELP, SEARCH, type TourStep } from './types.js'

/** Recorrido de recepción: lo que hace todos los días, de la llegada al cobro. */
export const recepcion: TourStep[] = [
  { route: '/app', title: 'Te damos la bienvenida', body: 'En recepción agendas citas, recibes a los pacientes y cobras. Este recorrido te lleva por cada pantalla; toma un par de minutos.' },
  { route: '/app', target: 'por-llegar', title: 'Por llegar hoy', body: 'Los pacientes con cita que todavía no llegan. Cuando entra uno, márcalo como llegado y pasa a la sala de espera.' },
  { route: '/app/agenda', target: 'nueva-cita', perm: 'agenda.manage', title: 'Agendar una cita', body: 'Elige médico, fecha y hora libre. Si el paciente es nuevo, escribe sólo su nombre y teléfono: completa su registro cuando llegue.' },
  { route: '/app/consulta-externa', target: 'sala-espera', title: 'Sala de espera', body: 'Cada paciente avanza de izquierda a derecha: en sala, listo para consulta (con preclínica) y atendido. Aquí ves cuánto lleva esperando.' },
  { route: '/app/consulta-externa', target: 'sin-cita', perm: 'checkin.manage', title: 'Paciente sin cita', body: 'Quien llega sin cita entra directo a la sala con el médico que lo atenderá.' },
  { route: '/app/pacientes', target: 'nuevo-paciente', perm: 'patients.manage', title: 'Registrar un paciente', body: 'Datos personales, identidad y contacto de emergencia. El número de expediente se asigna solo.' },
  { route: '/app/pacientes', target: 'filtros', title: 'Buscar y filtrar', body: 'Busca por nombre, expediente o teléfono y filtra por edad, sexo, última consulta o médico.' },
  { route: '/app/caja', target: 'nuevo-cobro', perm: 'billing.manage', title: 'Cobrar', body: 'Elige los servicios (o crea uno nuevo), la forma de pago y cuánto paga ahora. El recibo sale para imprimir o enviar por WhatsApp.' },
  { route: '/app/seguimientos', target: 'recordatorios', perm: 'followups.view', title: 'Recordatorios', body: 'Los avisos de control salen solos una semana antes, un día antes y el mismo día. Los de hoy aparecen en tu inicio para llamar al paciente.' },
  SEARCH,
  HELP,
]
