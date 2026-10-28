import type { ClinicKind, Role } from './types.js'
import { features, permissionsFor, type Permission } from './permissions.js'

/**
 * Recorrido de primer ingreso. Cada paso señala algo real de la pantalla (`target` es el `data-tour` del elemento:
 * "nav:<ruta>" para el menú, "search" para el buscador y "me" para la cuenta); sin `target` es una tarjeta al centro.
 */
export interface TourStep { title: string; body: string; target?: string }

interface Step extends TourStep { perm?: Permission; feature?: 'hospital' | 'observation' }

const SEARCH: Step = { target: 'search', perm: 'patients.view', title: 'Buscador de pacientes',
  body: 'Desde cualquier pantalla, con Ctrl K, encuentras a un paciente por nombre, expediente, teléfono o identidad.' }
const ME: Step = { target: 'me', title: 'Tu cuenta',
  body: 'Aquí cambias tu contraseña y activas la verificación en dos pasos. Si quieres repetir este recorrido, también está aquí.' }

const STEPS: Record<Exclude<Role, 'doctor'> | 'doctor-clinic' | 'doctor-office', Step[]> = {
  reception: [
    { title: 'Te damos la bienvenida', body: 'En recepción agendas citas, recibes a los pacientes y cobras. Te mostramos dónde está cada cosa; toma un minuto.' },
    { target: 'nav:/app/agenda', title: 'Agenda', body: 'Aquí creas, reprogramas y cancelas las citas de cada médico. Las que los pacientes reservan en línea también llegan aquí.' },
    { target: 'nav:/app/consulta-externa', title: 'Consulta externa', body: 'Cuando el paciente llega, regístralo aquí: así enfermería y el médico saben que está en sala. El número dice cuántos esperan.' },
    { target: 'nav:/app/pacientes', title: 'Biblioteca de pacientes', body: 'Registra a los pacientes nuevos y busca su ficha. Si alguien llega sin expediente, créalo antes de que pase a consulta.' },
    { target: 'nav:/app/caja', title: 'Caja', body: 'Las consultas que el médico termina aparecen aquí para cobrarlas. Al final del día, en «Cierre de hoy», haces el arqueo.' },
    { target: 'nav:/app/seguimientos', perm: 'followups.view', title: 'Crónicos y seguimientos', body: 'Pacientes que deben volver. El número avisa cuáles toca llamar hoy.' },
    SEARCH, ME,
  ],
  nurse: [
    { title: 'Te damos la bienvenida', body: 'En enfermería recibes al paciente, tomas la preclínica y, en hospitalización, administras medicamentos y escribes notas.' },
    { target: 'nav:/app/consulta-externa', title: 'Consulta externa', body: 'Los pacientes que llegan aparecen aquí. Toca «Preclínica» para tomar signos vitales y el motivo de consulta antes de que pasen con el médico.' },
    { target: 'nav:/app/hospitalizados', feature: 'hospital', title: 'Hospitalizados', body: 'El número rojo son órdenes médicas nuevas sin revisar. Entra al paciente para revisarlas, registrar dosis, llenar la hoja de signos vitales y escribir notas.' },
    { target: 'nav:/app/observacion', feature: 'observation', title: 'Observación', body: 'Pacientes en observación corta. Se atienden igual que un hospitalizado: medicamentos, signos vitales y notas.' },
    { target: 'nav:/app/pacientes', title: 'Biblioteca de pacientes', body: 'Busca la ficha del paciente o regístralo si llega sin expediente.' },
    { target: 'nav:/app/caja', title: 'Cobrar', body: 'Si hace falta, también puedes cobrar una consulta desde aquí.' },
    SEARCH, ME,
  ],
  'doctor-clinic': [
    { title: 'Te damos la bienvenida', body: 'Atiendes tu agenda, escribes consultas y recetas, y das seguimiento a tus pacientes hospitalizados y crónicos.' },
    { target: 'nav:/app/consulta-externa', title: 'Consulta externa', body: 'Tu sala de espera. Cuando el paciente ya tiene preclínica, toca «Atender» para abrir la consulta: historia, examen, diagnóstico CIE-11, órdenes y receta.' },
    { target: 'nav:/app/agenda', title: 'Agenda', body: 'Tus citas del día y de la semana.' },
    { target: 'nav:/app/hospitalizados', feature: 'hospital', title: 'Hospitalizados', body: 'Tus pacientes ingresados: escribe la evolución, cambia las indicaciones y da el alta. La epicrisis se prepara al egreso.' },
    { target: 'nav:/app/observacion', feature: 'observation', title: 'Observación', body: 'Pacientes en observación corta. Desde aquí los pasas a hospitalización o les das el alta.' },
    { target: 'nav:/app/seguimientos', title: 'Crónicos y seguimientos', body: 'Programa cuándo debe volver cada paciente; el número avisa cuándo toca.' },
    { target: 'nav:/app/recetas', title: 'Recetas', body: 'Renueva el tratamiento de un crónico sin abrir una consulta completa.' },
    SEARCH,
    { ...ME, body: 'Tu contraseña, la verificación en dos pasos, tus sets de órdenes y tu horario de atención. Si quieres repetir este recorrido, también está aquí.' },
  ],
  'doctor-office': [
    { title: 'Tu consultorio está listo', body: 'Te mostramos dónde está cada cosa: atender, cobrar y administrar tu consultorio.' },
    { target: 'nav:/app/consulta-externa', title: 'Consulta externa', body: 'Tu sala de espera. Toca «Atender» para abrir la consulta: historia, examen, diagnóstico CIE-11, órdenes y receta.' },
    { target: 'nav:/app/agenda', title: 'Agenda', body: 'Tus citas. Los pacientes también pueden reservar en línea dentro de tu horario.' },
    { target: 'nav:/app/caja', title: 'Caja', body: 'Aquí cobras tú o tu asistente. Al final del día, en «Cierre de hoy», haces el arqueo.' },
    { target: 'nav:/app/observacion', feature: 'observation', title: 'Observación', body: 'Pacientes en observación corta: medicamentos, signos vitales y notas. Si no la usas, la apagas en Configuración.' },
    { target: 'nav:/app/seguimientos', title: 'Crónicos y seguimientos', body: 'Programa cuándo debe volver cada paciente; el número avisa cuándo toca.' },
    { target: 'nav:/app/configuracion', title: 'Configuración', body: 'Datos del consultorio, logo, horario, servicios y precios.' },
    { target: 'nav:/app/personal', title: 'Asistentes', body: 'Agrega a tu asistente para que agende, reciba pacientes y cobre.' },
    { target: 'nav:/app/reportes', title: 'Reportes', body: 'Citas, asistencia e ingresos del periodo que elijas.' },
    SEARCH,
    { ...ME, body: 'Tu contraseña, la verificación en dos pasos, tus sets de órdenes y tu horario de atención. Si quieres repetir este recorrido, también está aquí.' },
  ],
  assistant: [
    { title: 'Te damos la bienvenida', body: 'En el consultorio agendas citas, recibes al paciente, tomas la preclínica, cobras y aplicas los medicamentos que indica el médico en observación.' },
    { target: 'nav:/app/agenda', title: 'Agenda', body: 'Aquí creas, reprogramas y cancelas citas. Las que los pacientes reservan en línea también llegan aquí.' },
    { target: 'nav:/app/consulta-externa', title: 'Consulta externa', body: 'Registra la llegada del paciente y toca «Preclínica» para tomar sus signos vitales antes de que pase con el médico.' },
    { target: 'nav:/app/pacientes', title: 'Biblioteca de pacientes', body: 'Registra a los pacientes nuevos y busca su ficha.' },
    { target: 'nav:/app/caja', title: 'Caja', body: 'Las consultas terminadas aparecen aquí para cobrarlas. Al final del día, en «Cierre de hoy», haces el arqueo.' },
    { target: 'nav:/app/observacion', feature: 'observation', title: 'Observación', body: 'Aquí registras las dosis que el médico indica a los pacientes en observación.' },
    SEARCH, ME,
  ],
  admin: [
    { title: 'Te damos la bienvenida', body: 'Configuras la clínica, el personal y los precios, y revisas los indicadores. Por privacidad, no ves notas clínicas.' },
    { target: 'nav:/app/configuracion', title: 'Configuración', body: 'Datos de la clínica, logo, servicios y precios, camas y el mensaje de recordatorio de citas.' },
    { target: 'nav:/app/personal', title: 'Personal y roles', body: 'Agrega usuarios y asigna su rol: médico, enfermería, recepción o administración. Cada rol ve sólo lo que necesita.' },
    { target: 'nav:/app/reportes', title: 'Reportes', body: 'Citas, asistencia e ingresos por médico y por forma de pago. Se exportan a CSV.' },
    { target: 'nav:/app/agenda', title: 'Agenda', body: 'Las citas de todos los médicos.' },
    { target: 'nav:/app/caja', title: 'Caja', body: 'Cobros del día, historial y anulación de recibos.' },
    SEARCH, ME,
  ],
  superadmin: [
    { title: 'Te damos la bienvenida', body: 'Administras la plataforma: creas clínicas y consultorios y sus usuarios. No ves expedientes de pacientes.' },
    { target: 'nav:/app', title: 'Clínicas y consultorios', body: 'Crea una cuenta nueva y entra a su detalle para agregar usuarios o desactivarla.' },
    { ...ME, body: 'Aquí cambias tu contraseña y activas la verificación en dos pasos. Si quieres repetir este recorrido, también está aquí.' },
  ],
}

/** Pasos del recorrido para un rol y tipo de cuenta, sin los de pantallas que esa cuenta no tiene. */
export function tourFor(role: Role, kind: ClinicKind = 'clinic', opts: { observationEnabled?: boolean } = {}): TourStep[] {
  const perms = permissionsFor(role, kind)
  const f = features({ kind, observationEnabled: opts.observationEnabled })
  const key = role === 'doctor' ? (kind === 'office' ? 'doctor-office' : 'doctor-clinic') : role
  return STEPS[key]
    .filter((s) => (!s.perm || perms.includes(s.perm)) && (!s.feature || f[s.feature]))
    .map(({ title, body, target }) => ({ title, body, target }))
}
