import { HELP, type TourStep } from './types.js'

const stay = (tab?: string) => (c: { stay?: string }) => (c.stay ? `${c.stay}${tab ? `?tab=${tab}` : ''}` : undefined)

/** Recorrido del médico de clínica: de la sala de espera al egreso, con un paciente de la demo. */
export const medico: TourStep[] = [
  { route: '/app', title: 'Te damos la bienvenida', body: 'Atiendes tu agenda, escribes consultas y recetas, ingresas y evolucionas pacientes y das seguimiento a tus crónicos.' },
  { route: '/app/consulta-externa', target: 'alcance', feature: 'multiDoctor', title: 'Mis pacientes o toda la clínica', body: 'Ves tus pacientes; con «Toda la clínica» puedes atender al de otro médico si hace falta.' },
  { route: '/app/consulta-externa', target: 'sala-espera', title: 'Atender', body: 'Cuando el paciente ya tiene preclínica, toca «Atender»: historia, examen, diagnóstico CIE-11, indicaciones, medicamentos y exámenes.' },
  { route: (c) => c.consultNote, target: 'nota-consulta', perm: 'chart.view', title: 'La nota de consulta', body: 'Así queda una nota firmada: indicaciones, medicamentos (van a la receta) y exámenes (se imprimen en su propia orden).' },
  { route: (c) => c.consultNote, target: 'constancia', perm: 'consult.write', title: 'Constancia', body: 'Incapacidad, constancia médica o de asistencia, con tu firma y sello guardados.' },
  { route: (c) => c.consultNote, target: 'adenda', perm: 'consult.write', title: 'Firmada no se edita: se agrega una adenda', body: 'Para corregir o agregar algo después de firmar, usa «Agregar adenda»: queda debajo, con tu nombre y la fecha.' },
  { route: '/app/hospitalizados', target: 'ingresar', perm: 'inpatient.orders', feature: 'hospital', title: 'Ingresar a un paciente', body: 'Desde la consulta marcas observación u hospitalización. Eliges la cama y el paciente firma la autorización en pantalla en ese momento.' },
  { route: stay('notas'), target: 'nueva-evolucion', perm: 'inpatient.orders', title: 'Notas de evolución', body: 'En formato Estándar o SOAP. Las órdenes y medicamentos pasan a enfermería y a la hoja de medicamentos.' },
  { route: stay('notas'), target: 'egreso', perm: 'inpatient.orders', title: 'Egreso y epicrisis', body: 'La nota de egreso se escribe en el orden de la epicrisis, empezando por la HEA. Al guardarla se libera la cama, sale la receta y la epicrisis.' },
  { route: '/app/mi-configuracion', target: 'mi-config', perm: 'consult.write', title: 'Mi configuración', body: 'Tu firma y sello, tu horario, tus medicamentos y exámenes frecuentes, tus sets de órdenes y el formato de tus notas.' },
  { target: 'nav:/app/seguimientos', perm: 'followups.view', title: 'Crónicos y seguimientos', body: 'Programa cuándo debe volver cada paciente; el número avisa a quién toca.' },
  HELP,
]
