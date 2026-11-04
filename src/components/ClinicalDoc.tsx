import { useId, type ReactNode } from 'react'
import { MarkImage } from './MarkImage'
import { age as ageText, contactLine, dmyTime } from '../lib/format'
import { yearsOld } from '../lib/inpatient'
import { positionOf, signedName } from '../lib/positions'
import { mainRole, ROLE_LABEL } from '../lib/permissions'
import { DOC_BRAND_LEGEND, OTHER_SIGN_SPACE_CM, PRINT_PAGE, SIGN_SPACE_CM } from '../lib/clinicalConfig'
import type { ClinicContact, ClinicSettings, Patient, Role } from '../lib/types'

/**
 * IM1 (ronda 13): la única plantilla de impresión. Todos los documentos (receta, órdenes de laboratorio e imagen, resultados,
 * constancias, referencias, epicrisis, autorizaciones, nota de consulta y recibo) la usan: cada uno pone su título, sus datos
 * propios y su cuerpo.
 *
 * - Hoja Carta con márgenes de 2 cm (`PRINT_PAGE`); en pantalla, la misma proporción.
 * - Encabezado: logo y nombre de la clínica o del consultorio, dirección y teléfono (nunca el médico). A la derecha el tipo de
 *   documento, «Folio», el número y la fecha y hora `dd/mm/aaaa HH:mm`. Debajo, la raya gruesa.
 * - Datos del paciente en una cuadrícula fija: Paciente · Expediente · Identidad / Edad · Sexo · (dato propio). Debajo, a
 *   todo el ancho, las filas propias del documento (alergias, diagnóstico…). Una raya fina los separa del cuerpo.
 * - Firma abajo a la derecha, sin raya: la firma dibujada o el espacio en blanco para firmar y sellar; nombre con prefijo,
 *   especialidad o cargo y colegiación, en tres renglones centrados.
 * - Pie con las leyendas. Al imprimir: «Página X de Y» y, desde la segunda hoja, un encabezado corto (lugar, folio, paciente).
 */

export interface DocPlace { name: string; address?: string; phone?: string; logo?: string; contacts?: ClinicContact[]; docsWhatsapp?: boolean }
export interface DocPatient { name: string; record: string; dni?: string; age: string; sex?: string; third?: DocRow }
export interface DocRow { label: string; value: ReactNode }
export interface DocSigner {
  /** Rótulo encima del espacio (resultados: «Procesado por», «Microbiólogo responsable»…). */
  label?: string
  name: string
  title?: string
  license?: string
  signatureId?: string
  /** Firma o sello ya guardados como imagen en el documento (epicrisis). */
  signatureSrc?: string
  stampId?: string
  stampSrc?: string
  /** Firmas que no son del médico (paciente, testigo): espacio más bajo. */
  small?: boolean
}

/** Lugar del encabezado a partir de la configuración actual (clínica o consultorio). */
export const placeOf = (s: Pick<ClinicSettings, 'name' | 'address' | 'phone' | 'logo' | 'contacts' | 'docsWhatsapp'>): DocPlace =>
  ({ name: s.name, address: s.address, phone: s.phone, logo: s.logo, contacts: s.contacts, docsWhatsapp: s.docsWhatsapp })

export const sexText = (sex?: string) => (sex === 'F' ? 'Femenino' : sex === 'M' ? 'Masculino' : sex || 'Sin dato')

/** Cuadrícula del paciente desde su ficha. Identidad: la suya o «No tiene»; el responsable del menor va como fila aparte. */
export function patientOf(p: Pick<Patient, 'firstName' | 'lastName' | 'record' | 'dni' | 'birthDate' | 'sex'>, s: { recordUsesDni: boolean }): DocPatient {
  return {
    name: `${p.firstName}${p.lastName ? ` ${p.lastName}` : ''}`,
    record: s.recordUsesDni && p.dni ? p.dni : p.record,
    dni: p.dni || undefined,
    age: p.birthDate ? ageText(p.birthDate) : 'Sin dato',
    sex: p.sex,
  }
}

/** Fila «Responsable» del menor sin identidad (lo que antes iba en la casilla de identidad). */
export function guardianRow(p: Pick<Patient, 'dni' | 'birthDate' | 'guardianName' | 'guardianDni' | 'guardianRelation'>): DocRow | null {
  if (p.dni || !p.guardianName || !p.birthDate || yearsOld(p.birthDate) >= 18) return null
  return { label: 'Responsable del menor', value: `${p.guardianName}${p.guardianRelation ? ` (${p.guardianRelation.toLowerCase()})` : ''}${p.guardianDni ? `, identidad ${p.guardianDni}` : ''}` }
}

/** Firmante desde el personal: nombre con prefijo, especialidad o cargo, colegiación. */
export function signerOfStaff(s: { name: string; docName?: string; position?: string; role?: Role; roles?: Role[]; specialty?: string; license?: string } | undefined, extra: Partial<DocSigner> = {}): DocSigner {
  if (!s) return { name: '—', ...extra }
  const pos = positionOf(s.position)
  const title = pos?.label ?? s.specialty ?? (s.role ? ROLE_LABEL[mainRole({ role: s.role, roles: s.roles })] : undefined)
  return { name: signedName(s), title, license: s.license, ...extra }
}

function Sign({ s }: { s: DocSigner }) {
  const h = `${s.small ? OTHER_SIGN_SPACE_CM : SIGN_SPACE_CM}cm`
  return (
    <div className="cdoc__signer">
      {s.label && <span className="cdoc__signer-label">{s.label}</span>}
      <div className="cdoc__space" style={{ height: h }}>
        {s.stampId && <MarkImage id={s.stampId} alt="Sello" className="cdoc__stamp" />}
        {s.stampSrc && <img src={s.stampSrc} alt="Sello" className="cdoc__stamp" />}
        {s.signatureId && <MarkImage id={s.signatureId} alt={`Firma de ${s.name}`} className="cdoc__signature" />}
        {s.signatureSrc && <img src={s.signatureSrc} alt={`Firma de ${s.name}`} className="cdoc__signature" />}
      </div>
      <b>{s.name}</b>
      {s.title && <span>{s.title}</span>}
      {s.license && <span>{s.license}</span>}
    </div>
  )
}

/** Fila de datos a todo el ancho, con el mismo estilo de la cuadrícula. */
export function DocRows({ rows }: { rows: (DocRow | null | false | undefined | '')[] }) {
  const list = rows.filter(Boolean) as DocRow[]
  if (!list.length) return null
  return <div className="cdoc__rows">{list.map((r) => <div key={r.label}><span>{r.label}</span>{r.value}</div>)}</div>
}

/** Los firmantes, uno al lado del otro (resultados con dos responsables). Se usa también dentro del cuerpo. */
export function DocSigns({ signers }: { signers: DocSigner[] }) {
  if (!signers.length) return null
  return <div className={`cdoc__sign${signers.length > 1 ? ' cdoc__sign--many' : ''}`}>{signers.map((s, i) => <Sign key={`${s.label ?? ''}${s.name}${i}`} s={s} />)}</div>
}

/** Texto de CSS seguro dentro de `content: "…"` del margen de la hoja. */
const cssText = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')

export function ClinicalDoc({ kind, folio, at, folioNote, place, patient, rows, signers = [], legends = [], brand = DOC_BRAND_LEGEND, stamp, className = '', heading, children }: {
  /** Tipo de documento (arriba a la derecha): «Receta», «Orden de laboratorio», «Constancia»… */
  kind: string
  folio?: string
  at?: string
  /** Renglón extra bajo la fecha («Receta de egreso», «Sin emitir»…). */
  folioNote?: ReactNode
  place: DocPlace
  patient?: DocPatient
  rows?: (DocRow | null | false | undefined | '')[]
  signers?: DocSigner[]
  legends?: (string | false | null | undefined)[]
  brand?: string
  /** Sello de agua: «ANULADA», «Borrador sin emitir». */
  stamp?: string
  className?: string
  /** Título grande del cuerpo («Constancia de atención médica», «Hoja de referencia»). */
  heading?: ReactNode
  children?: ReactNode
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const pageName = `cdoc${uid}`
  const short = [place.name, folio && `Folio ${folio}`, patient?.name].filter(Boolean).join(' · ')
  const m = `${PRINT_PAGE.marginCm}cm`
  const pageCss = `@page ${pageName} { size: ${PRINT_PAGE.widthIn}in ${PRINT_PAGE.heightIn}in; margin: ${m};
  @top-left { content: "${cssText(short)}"; font-size: 8.5pt; color: #444; vertical-align: bottom; padding-bottom: 4mm; }
  @bottom-right { content: "Página " counter(page) " de " counter(pages); font-size: 8.5pt; color: #444; vertical-align: top; padding-top: 4mm; } }
@page ${pageName}:first { @top-left { content: none; } }`
  const phone = place.phone ? contactLine({ phone: place.phone, contacts: place.contacts, docsWhatsapp: place.docsWhatsapp }) : ''
  const legendList = legends.filter(Boolean) as string[]
  return (
    <article className={`cdoc ${className}`} style={{ ['page' as string]: pageName, ['--cdoc-margin' as string]: m, ['--cdoc-ratio' as string]: `${PRINT_PAGE.widthIn} / ${PRINT_PAGE.heightIn}` }}>
      <style>{pageCss}</style>
      {stamp && <div className="void-stamp">{stamp}</div>}
      <header className="cdoc__head">
        <div className="cdoc__place">
          <div className="cdoc__brand">{place.logo && <img src={place.logo} alt="" className="cdoc__logo" />}<b>{place.name}</b></div>
          {place.address && <p>{place.address}</p>}
          {phone && <p>Tel. {phone}</p>}
        </div>
        <div className="cdoc__folio">
          <span className="cdoc__kind">{kind}</span>
          {folio && <>Folio<b>{folio}</b></>}
          {at && <span className="num">{dmyTime(at)}</span>}
          {folioNote && <span>{folioNote}</span>}
        </div>
      </header>
      {patient && (
        <div className="cdoc__pt">
          <div className="cdoc__pt-name"><span>Paciente</span>{patient.name}</div>
          <div><span>Expediente</span>{patient.record}</div>
          <div><span>Identidad</span>{patient.dni || 'No tiene'}</div>
          <div><span>Edad</span>{patient.age}</div>
          <div><span>Sexo</span>{sexText(patient.sex)}</div>
          <div>{patient.third && <><span>{patient.third.label}</span>{patient.third.value}</>}</div>
        </div>
      )}
      {rows && <DocRows rows={rows} />}
      <div className="cdoc__body">
        {heading && <h1 className="cdoc__heading">{heading}</h1>}
        {children}
      </div>
      <DocSigns signers={signers} />
      <footer className="cdoc__foot">
        <span>{legendList.map((l) => <span key={l}>{l}</span>)}</span>
        <span>{brand}</span>
      </footer>
    </article>
  )
}

/** IM1 (ronda 13): espacio en blanco para firmar en papel, sin raya (autorizaciones). El del médico cabe un sello. */
export function SignSpace({ doctor = false }: { doctor?: boolean }) {
  return <span className="cdoc__blank" style={{ height: `${doctor ? SIGN_SPACE_CM : OTHER_SIGN_SPACE_CM}cm` }} />
}
