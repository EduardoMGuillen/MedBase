import { ClinicLogo } from '../app/Prescriptions'
import { contactLine } from '../lib/format'
import type { ClinicContact } from '../lib/types'

interface Props {
  clinic: { name: string; address: string; phone: string; logo?: string; office?: boolean; contacts?: ClinicContact[]; docsWhatsapp?: boolean }
  doctor: { name: string; specialty?: string; license?: string }
}

/**
 * Encabezado de recetas y constancias. En una clínica va primero la clínica y debajo el médico. En el
 * consultorio de un médico independiente el encabezado es el médico, con el consultorio como dirección.
 */
export function DocHeader({ clinic, doctor }: Props) {
  const logoSettings = { ...clinic, email: '', currency: 'L', rxValidityDays: 30, reminderTemplate: '', recordUsesDni: false }
  const who = [doctor.specialty, doctor.license && `colegiación ${doctor.license}`].filter(Boolean).join(', ')
  // Los documentos emitidos ya guardan la línea del teléfono; la configuración actual la arma con sus contactos (AD1)
  const where = `${clinic.address}${clinic.phone ? `, tel. ${contactLine(clinic)}` : ''}`
  if (clinic.office) {
    return (
      <div className="rx-sheet__doc doc-head--office">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {clinic.logo && <ClinicLogo settings={logoSettings} />}
          <div><h2>{doctor.name}</h2>{who && <p>{who}</p>}</div>
        </div>
        <p><b>{clinic.name}</b>{clinic.address ? ` · ${where}` : ''}</p>
      </div>
    )
  }
  return (
    <div className="rx-sheet__doc">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}><ClinicLogo settings={logoSettings} /><b>{clinic.name}</b></div>
      <h2>{doctor.name}</h2>
      {who && <p>{who}</p>}
      <p>{where}</p>
    </div>
  )
}
