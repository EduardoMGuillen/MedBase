import { HELP, type TourStep } from './types.js'

const stay = (tab?: string) => (c: { stay?: string }) => (c.stay ? `${c.stay}${tab ? `?tab=${tab}` : ''}` : undefined)

/** Recorrido de enfermería: inicio y pendientes, preclínica y el expediente de un hospitalizado de la demo. */
export const enfermeria: TourStep[] = [
  { route: '/app', title: 'Te damos la bienvenida', body: 'Recibes al paciente, tomas la preclínica y, en hospitalización y observación, aplicas medicamentos, tomas signos y escribes notas.' },
  { route: '/app', target: 'pendientes', perm: 'inpatient.care', title: 'Pendientes por paciente', body: 'Dosis atrasadas, signos por tomar, órdenes nuevas y exámenes de cada internado, por prioridad. Toca la acción para ir directo.' },
  { route: '/app', target: 'bandeja-examenes', perm: 'exams.process', title: 'Exámenes pendientes', body: 'Los urgentes arriba. Marca la muestra tomada o el estudio realizado y carga el resultado; al médico le llega como resultado nuevo.' },
  { route: '/app/consulta-externa', target: 'sala-espera', title: 'Preclínica', body: 'Los pacientes que llegan aparecen en sala. Toca «Preclínica» para tomar el motivo y los signos antes de que pasen con el médico.' },
  { route: stay(), target: 'alertas', perm: 'inpatient.view', title: 'Alertas del expediente', body: 'Una barra corta: lo crítico en rojo, lo pendiente en ámbar. Se resuelve con su botón; no se borra.' },
  { route: stay('notas'), target: 'checklist', perm: 'orders.review', title: 'Órdenes del médico', body: 'Revisa y marca cada orden nueva. Mientras falte alguna, el inicio y el menú la siguen avisando.' },
  { route: stay('medicamentos'), target: 'hoja-medicamentos', perm: 'inpatient.care', title: 'Hoja de medicamentos', body: 'Toca una hora para registrar la dosis. Si no se aplicó (ayuno, la rechazó), márcala «No aplicada» con el motivo y deja de alertar.' },
  { route: stay('signos'), target: 'signos-registrar', perm: 'vitals.record', title: 'Signos vitales', body: 'Registra la toma con este botón; la curva térmica y la tabla de tomas se actualizan solas. Las tomas que faltan salen en las alertas y en la tabla.' },
  { route: stay('enfermeria'), target: 'nota-enfermeria', perm: 'inpatient.care', feature: 'hospital', title: 'Notas de enfermería', body: 'Escribe lo que pasó en tu turno. Se guarda como borrador mientras escribes y, firmada, sólo se le agregan adendas.' },
  HELP,
]
