import type { Certificate, CertificateData } from './types'

/** Un párrafo de la constancia: trozos de texto, algunos en negrita. */
export type Para = { text: string; b?: boolean }[]

export const CERT_KIND: Record<Certificate['kind'], { label: string; title: string }> = {
  attention: { label: 'Atención', title: 'Constancia médica de atención' },
  rest: { label: 'Incapacidad', title: 'Constancia médica de incapacidad' },
  companion: { label: 'Para el acompañante', title: 'Constancia de acompañamiento' },
  free: { label: 'Libre', title: 'Constancia médica' },
}

const long = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString('es-HN', { day: 'numeric', month: 'long', year: 'numeric' })
const hours = (d: CertificateData) => (d.fromTime && d.toTime ? `, de las ${d.fromTime} a las ${d.toTime} horas` : d.fromTime ? `, a las ${d.fromTime} horas` : '')

/**
 * Texto de la constancia. Lo usan la vista previa, la hoja impresa y el mensaje de WhatsApp, para que
 * los tres digan exactamente lo mismo. El diagnóstico sólo aparece si el médico lo marcó.
 */
export function certificateText(kind: Certificate['kind'], d: CertificateData, issuedAt: string): Para[] {
  const female = /^dra\b/i.test(d.doctor.name)
  const she = d.patient.sex === 'F'
  const who = she ? 'la paciente' : 'el paciente'
  const id: Para = d.patient.dni ? [{ text: `, con identidad ${d.patient.dni}` }] : d.patient.guardian ? [{ text: `, menor de edad (responsable: ${d.patient.guardian})` }] : []
  const patient: Para = [{ text: `${who} ` }, { text: d.patient.name, b: true }, { text: `, de ${d.patient.age}` }, ...id, { text: `, expediente ${d.patient.record},` }]
  const dx: Para = d.includeDx && d.diagnoses?.length ? [{ text: ', con diagnóstico de ' }, { text: d.diagnoses.map((x) => x.toLowerCase()).join(' y '), b: true }] : []
  const intro: Para = [{ text: `${female ? 'La suscrita' : 'El suscrito'}, ${d.doctor.name}${d.doctor.specialty ? `, ${d.doctor.specialty.toLowerCase()}` : ''}, con número de colegiación ${d.doctor.license ?? ''} del Colegio Médico de Honduras, hace constar que ` }]
  const out: Para[] = []
  if (kind === 'attention') {
    out.push([...intro, ...patient, { text: ` fue atendid${she ? 'a' : 'o'} en consulta externa en ${d.clinic.name} el día ${long(d.visitDate)}${hours(d)}` }, ...dx, { text: '.' }])
  } else if (kind === 'rest') {
    out.push([...intro, ...patient, { text: ` acudió a consulta externa en esta clínica el día ${long(d.visitDate)}, donde presentó un padecimiento que requiere reposo ${d.restType ?? 'relativo'}` }, ...dx, { text: '.' }])
    const days = `${d.restDays} ${d.restDays === 1 ? 'día' : 'días'}`
    out.push([{ text: `Incapacidad temporal: se indica reposo ${d.restType ?? 'relativo'} por ` }, { text: days, b: true },
      { text: d.restFrom && d.restTo && d.restDays! > 1 ? `, del ${long(d.restFrom)} al ${long(d.restTo)}.` : d.restFrom ? `, el ${long(d.restFrom)}.` : '.' }])
  } else if (kind === 'companion') {
    const c = d.companion!
    const ofWho = she ? 'de la paciente' : 'del paciente'
    const toWho = she ? 'a la paciente' : 'al paciente'
    out.push([...intro, { text: c.name, b: true }, { text: `${c.dni ? `, con identidad ${c.dni}` : ''}${c.relation ? `, ${c.relation.toLowerCase()} ${ofWho}` : ''}, acompañó ${toWho} ` },
      { text: d.patient.name, b: true }, { text: ` a su atención en consulta externa en ${d.clinic.name} el día ${long(d.visitDate)}${hours(d)}.` }])
  } else {
    for (const p of (d.text ?? '').split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean)) out.push([{ text: p }])
  }
  if (d.notes) out.push([{ text: /[.!?]$/.test(d.notes) ? d.notes : `${d.notes}.` }])
  const requester = kind === 'companion' ? 'de la persona interesada' : she ? 'de la interesada' : 'del interesado'
  if (kind !== 'free') out.push([{ text: `Se extiende la presente a solicitud ${requester} para los fines que estime convenientes.` }])
  out.push([{ text: `${d.clinic.address ? `${d.clinic.address}, ` : ''}${new Date(issuedAt).toLocaleDateString('es-HN', { day: 'numeric', month: 'long', year: 'numeric' })}.` }])
  return out
}

export const plainText = (paras: Para[]) => paras.map((p) => p.map((x) => x.text).join('')).join('\n\n')
