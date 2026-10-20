import type { Followup } from './types.js'

export const FOLLOWUP_KIND: Record<Followup['kind'], { label: string; plural: string }> = {
  chronic: { label: 'Paciente crónico', plural: 'Pacientes crónicos' },
  reminder: { label: 'Recordatorio', plural: 'Recordatorios' },
  procedure: { label: 'Procedimiento', plural: 'Procedimientos' },
}

/** Padecimientos que suelen requerir control periódico, con su intervalo habitual en días. */
export const CHRONIC_PRESETS: { title: string; everyDays: number }[] = [
  { title: 'Hipertensión arterial', everyDays: 90 },
  { title: 'Diabetes mellitus tipo 2', everyDays: 90 },
  { title: 'Enfermedad renal crónica', everyDays: 90 },
  { title: 'Hipotiroidismo', everyDays: 180 },
  { title: 'Hipertiroidismo', everyDays: 90 },
  { title: 'Dislipidemia', everyDays: 180 },
  { title: 'EPOC', everyDays: 90 },
  { title: 'Asma', everyDays: 180 },
]

/** Mensaje de WhatsApp que recibe el paciente. Por ahora sólo se muestra: el envío es una simulación. */
export function followupMessage(f: Pick<Followup, 'kind' | 'title' | 'dueDate'>, v: { paciente: string; clinica: string; telefono: string }) {
  const when = new Date(`${f.dueDate}T12:00:00`).toLocaleDateString('es-HN', { weekday: 'long', day: 'numeric', month: 'long' })
  if (f.kind === 'chronic') {
    return `Hola ${v.paciente}, le saluda ${v.clinica}. Ya le toca su control de ${f.title.toLowerCase()}: le esperamos a partir del ${when}. `
      + `Recuerde hacerse sus exámenes de control antes de la cita. Para agendar, responda este mensaje o llame al ${v.telefono}.`
  }
  if (f.kind === 'procedure') {
    return `Hola ${v.paciente}, le saluda ${v.clinica}. Su procedimiento (${f.title}) está programado para el ${when}. `
      + `Si tiene dudas sobre la preparación, llámenos al ${v.telefono}.`
  }
  return `Hola ${v.paciente}, le saluda ${v.clinica}. Le recordamos: ${f.title}. Fecha: ${when}. Para agendar su cita, responda este mensaje o llame al ${v.telefono}.`
}

/** Fecha YYYY-MM-DD dentro de `days` días a partir de `from`. */
export function addDays(from: string, days: number) {
  const d = new Date(`${from}T12:00:00`)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
