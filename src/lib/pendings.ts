import type { Role } from './types.js'

/**
 * PD1 (ronda 18). VALIDAR: Emil. Cada tipo de pendiente del expediente de una estancia (observación u hospitalización) tiene un
 * responsable, y cada quien ve y cuenta solo lo suyo. Lo de los demás sale aparte, en gris, como «Pendientes de otros».
 *
 * Este archivo es la tabla: qué tipos hay y a quién le toca cada uno. Cuándo nace y cuándo se cierra un pendiente no cambia
 * (sigue en `alerts.ts`); un pendiente compartido cuenta para todos sus responsables y, cuando uno lo resuelve, se cierra
 * para todos (sale del estado del expediente, no de una marca por persona).
 */
export type PendingOwner =
  /** Enfermería (licenciada, auxiliar; en el consultorio, también la asistente). */
  | 'nursing'
  /** El médico tratante de la estancia (la persona, no el rol) y, en exámenes, también quien lo pidió. */
  | 'doctor'
  /** Laboratorio (microbiólogo y técnico). */
  | 'lab'
  /** Técnico en imágenes. */
  | 'imaging'
  /** Médico radiólogo. */
  | 'radiologist'

export type PendingType =
  | 'vitals-alert' | 'vitals-due' | 'dose-late' | 'orders-review' | 'result-review' | 'exam-notdone' | 'sample-pending'
  | 'imaging-pending' | 'imaging-report' | 'sign-doctor' | 'sign-patient' | 'admission-orders' | 'bed'

export const PENDING_TYPES: Record<PendingType, {
  /** Nombre del tipo en la tabla del reporte. */
  label: string
  owners: PendingOwner[]
  /** Color de la etiqueta en la columna «Pendientes» de las listas (PD2). */
  tone: 'red' | 'amber' | 'ink'
  /** La etiqueta cuando hay varios del mismo tipo en un paciente («3 dosis atrasadas»). */
  many: (n: number) => string
}> = {
  'vitals-alert': { label: 'Alerta de signos (fiebre o hipotermia)', owners: ['nursing'], tone: 'red', many: () => 'Alerta de signos' },
  'vitals-due': { label: 'Signos vitales que tocan o atrasados', owners: ['nursing'], tone: 'amber', many: (n) => `${n} signos atrasados` },
  'dose-late': { label: 'Dosis atrasada', owners: ['nursing'], tone: 'amber', many: (n) => `${n} dosis atrasadas` },
  'orders-review': { label: 'Orden nueva sin revisar', owners: ['nursing'], tone: 'red', many: (n) => `${n} órdenes por revisar` },
  'result-review': { label: 'Resultado listo por revisar', owners: ['doctor'], tone: 'ink', many: (n) => `${n} resultados por revisar` },
  'exam-notdone': { label: 'Examen que no se realizó (decidir si se cancela)', owners: ['doctor'], tone: 'amber', many: (n) => `${n} exámenes no realizados` },
  // DP2 (ronda 11): las muestras las toman laboratorio y enfermería; sin laboratorio en la clínica (EX8), solo enfermería
  'sample-pending': { label: 'Toma de muestra pendiente', owners: ['lab', 'nursing'], tone: 'amber', many: (n) => `${n} muestras pendientes` },
  'imaging-pending': { label: 'Estudio de imagen por realizar', owners: ['imaging'], tone: 'amber', many: (n) => `${n} estudios por realizar` },
  'imaging-report': { label: 'Informe de imagen pendiente', owners: ['radiologist'], tone: 'amber', many: (n) => `${n} informes pendientes` },
  'sign-doctor': { label: 'Firma del médico pendiente', owners: ['doctor'], tone: 'amber', many: () => 'Firma del médico' },
  // Cualquiera de los dos la puede recoger; el documento sigue necesitando la firma del médico (un pendiente aparte, del médico)
  'sign-patient': { label: 'Firma del paciente, familiar o testigo pendiente', owners: ['nursing', 'doctor'], tone: 'amber', many: () => 'Firma del paciente' },
  'admission-orders': { label: 'Ingreso con órdenes pendientes (falta la nota de ingreso)', owners: ['doctor'], tone: 'red', many: () => 'Sin nota de ingreso' },
  bed: { label: 'Falta asignar la cama', owners: ['nursing', 'doctor'], tone: 'amber', many: () => 'Asignar cama' },
}

/** Cómo se nombra a cada responsable en «Pendientes de otros» («Médico: revisar resultado de Hemograma»). */
export const OWNER_LABEL: Record<PendingOwner, string> = { nursing: 'Enfermería', doctor: 'Médico', lab: 'Laboratorio', imaging: 'Imágenes', radiologist: 'Radiólogo' }

/** Quién mira: la persona, el rol que tiene activo (GE1) y la cuenta. */
export interface PendingViewer {
  id: string
  role: Role
  position?: string
  /** Consultorio: la titular hace de médico y, mientras no tenga enfermera activa, también de enfermería (A11). */
  office?: boolean
  /** Consultorio con una enfermera (o asistente) activa: lo de enfermería es de ella. */
  hasNurse?: boolean
}

/** Lo mínimo de un pendiente para saber de quién es. */
export interface OwnedPending { owners: PendingOwner[]; doctorIds?: string[] }

/** ¿Este pendiente le toca a quien mira? */
export function isMine(p: OwnedPending, v: PendingViewer): boolean {
  return p.owners.some((o) => {
    if (o === 'nursing') return v.role === 'nurse' || v.role === 'assistant' || (!!v.office && v.role === 'doctor' && !v.hasNurse)
    // «Médico» es la persona: el tratante o quien pidió el examen. En el consultorio solo hay una médica: todo es suyo
    if (o === 'doctor') return v.role === 'doctor' && (!!v.office || !p.doctorIds || p.doctorIds.includes(v.id))
    if (o === 'lab') return v.role === 'lab'
    if (o === 'imaging') return v.role === 'imaging' && v.position !== 'radiologist'
    return v.role === 'imaging' && v.position === 'radiologist'
  })
}

/** DP11: Laboratorio e Imágenes ven solo lo suyo, sin «Pendientes de otros». */
export const seesOthers = (v: PendingViewer) => v.role !== 'lab' && v.role !== 'imaging'

/** «Médico», «Enfermería y médico»: a quién le toca un pendiente que no es de quien mira. */
export function ownersText(p: OwnedPending) {
  const names = p.owners.map((o) => OWNER_LABEL[o])
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names.at(-1)!.toLowerCase()}` : names[0] ?? ''
}

/** Lo propio (lo que cuenta) y lo de otros (informativo). */
export function splitPendings<T extends OwnedPending>(list: T[], v: PendingViewer): { mine: T[]; others: T[] } {
  const mine = list.filter((p) => isMine(p, v))
  return { mine, others: seesOthers(v) ? list.filter((p) => !isMine(p, v)) : [] }
}
