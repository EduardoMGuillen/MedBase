import type { Patient } from './types.js'

/** Texto comparable: sin tildes, en minúsculas y con un solo espacio ("Acetaminofén " = "acetaminofen"). */
export const normalize = (s = '') => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

const digits = (s = '') => s.replace(/\D/g, '')

/**
 * Expedientes registrados que podrían ser la misma persona: mismo teléfono, misma identidad o el mismo
 * nombre (todas las palabras escritas aparecen en el nombre completo). Sirve para avisar antes de crear
 * un paciente nuevo.
 */
export function similarPatients(all: Patient[], who: Pick<Patient, 'firstName' | 'lastName' | 'phone'> & { dni?: string }, max = 5): Patient[] {
  const phone = digits(who.phone)
  const dni = digits(who.dni)
  const words = normalize(`${who.firstName} ${who.lastName}`).split(' ').filter((w) => w.length > 1)
  return all
    .filter((p) => !p.pending)
    .map((p) => {
      let score = 0
      if (phone.length >= 7 && digits(p.phone) === phone) score += 3
      if (dni.length >= 8 && digits(p.dni) === dni) score += 4
      const name = normalize(`${p.firstName} ${p.lastName}`).split(' ')
      // Con dos o más palabras que coinciden ya se avisa ("María Castillo" ~ "María José Castillo Reyes")
      const hits = words.filter((w) => name.some((n) => n === w || (w.length >= 4 && n.startsWith(w)))).length
      if (words.length && hits === words.length && hits >= 2) score += 2
      return { p, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((x) => x.p)
}
