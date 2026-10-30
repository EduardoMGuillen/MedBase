import { MessageCircle } from 'lucide-react'
import { useStore } from '../lib/store'
import { clinicWhatsapp, fillTemplate, time, whatsappUrl } from '../lib/format'
import type { Appointment } from '../lib/types'

/** Abre WhatsApp con el recordatorio listo para enviar y lo marca como enviado. */
export function ReminderButton({ appt, compact = false }: { appt: Appointment; compact?: boolean }) {
  const { patient, staffById, settings, markReminded } = useStore()
  const p = patient(appt.patientId)
  if (!p) return null
  const text = fillTemplate(settings.reminderTemplate, {
    paciente: p.firstName.split(' ')[0],
    clinica: settings.name,
    medico: staffById(appt.doctorId)?.name ?? 'su médico',
    fecha: new Date(appt.start).toLocaleDateString('es-HN', { weekday: 'long', day: 'numeric', month: 'long' }),
    hora: time(appt.start),
    telefono: clinicWhatsapp(settings),
  })
  return (
    <a className={`btn ${appt.remindedAt ? 'btn--ghost' : 'btn--soft'} btn--sm`} href={whatsappUrl(p.phone, text)} target="_blank" rel="noreferrer"
      onClick={() => markReminded(appt.id)} title={appt.remindedAt ? 'Recordatorio ya enviado; puedes reenviarlo' : 'Enviar recordatorio por WhatsApp'}>
      <MessageCircle size={15} />{compact ? '' : appt.remindedAt ? 'Reenviar' : 'Recordar por WhatsApp'}
    </a>
  )
}
