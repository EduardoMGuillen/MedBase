import { PREANESTHESIA_LABS } from './clinicalConfig.js'
import type { AnesthesiaData, AnesthesiaPrefill, AnesthesiaSigner } from './anesthesia.js'

/**
 * PQ4 (ronda 16): «Valoración preanestésica», documento aparte ligado a la estancia (no a la nota postquirúrgica). Se escribe
 * ANTES de la cirugía; la escribe y la firma cualquier médico (queda como anestesiólogo quien firma). Puede haber varias por
 * estancia: la vigente es la última firmada o subida sin anular. Contenido: la sección «Valoración preanestésica» del PNG de la
 * «Hoja única», más la técnica propuesta y el plan.
 */

export type PreLabKey = (typeof PREANESTHESIA_LABS)[number]['key']

export interface PreEvalData {
  date: string
  weightKg: string
  heightCm: string
  scheduled: string
  preDiagnosis: string
  proposedSurgery: string
  asa: string
  asaE: boolean
  mallampati: string
  difficultAirway: string
  allergies: string
  fastingSolids: string
  fastingLiquids: string
  history: string
  labs: Record<PreLabKey, string>
  /** «Técnica propuesta»: las mismas opciones de técnica del registro de anestesia. */
  techniques: string[]
  plan: string
}

export interface PreEval {
  id: string
  hospitalizationId: string
  patientId: string
  authorizationId?: string
  mode: 'upload' | 'system'
  /** Quien la firmó en el sistema, o quien hizo la valoración (en papel). */
  performedBy: { name: string; staffId?: string }
  observation?: string
  fileId?: string
  data?: PreEvalData
  signer?: AnesthesiaSigner
  createdBy: string
  createdAt: string
  version: number
  graceUntil?: string
  voidedAt?: string
  voidedBy?: string
  voidReason?: string
  replacedBy?: string
}

/** Lo que trae lleno: lo de la hoja de anestesia (paciente, alergias, peso, talla, diagnóstico y cirugía) y los laboratorios. */
export type PreEvalPrefill = AnesthesiaPrefill & { labs?: Partial<Record<PreLabKey, string>>; urgent?: boolean }

export const blankPreEval = (): PreEvalData => ({
  date: '', weightKg: '', heightCm: '', scheduled: '', preDiagnosis: '', proposedSurgery: '',
  asa: '', asaE: false, mallampati: '', difficultAirway: '', allergies: '', fastingSolids: '', fastingLiquids: '', history: '',
  labs: { hb: '', hto: '', plt: '', inr: '', glucose: '', bloodType: '' }, techniques: [], plan: '',
})

const num = (x?: number) => (x == null ? '' : String(x))
const today = () => { const t = new Date(Date.now() - 6 * 3_600_000); return t.toISOString().slice(0, 10) }

/** El formulario con lo que ya existe: peso y talla, alergias, diagnóstico y cirugía (de la autorización) y los laboratorios. */
export function prefillPreEval(x: PreEvalPrefill): PreEvalData {
  const d = blankPreEval()
  return {
    ...d, date: today(), weightKg: num(x.weightKg), heightCm: num(x.heightCm),
    scheduled: x.urgent == null ? '' : x.urgent ? 'Urgencia' : 'Programada',
    preDiagnosis: x.diagnosis ?? '', proposedSurgery: x.surgeryProposed ?? x.procedure ?? '',
    allergies: x.patient.allergies.join(', '),
    labs: { ...d.labs, ...Object.fromEntries(Object.entries(x.labs ?? {}).filter(([, v]) => v)) },
  }
}

/** La valoración resumida en el registro de anestesia: los campos de la sección «Valoración preanestésica» de la hoja. */
export function preEvalIntoSheet(p: PreEvalData): Pick<AnesthesiaData, 'asa' | 'asaE' | 'mallampati' | 'difficultAirway' | 'allergies' | 'fastingSolids' | 'fastingLiquids' | 'history' | 'labs'> {
  return { asa: p.asa, asaE: p.asaE, mallampati: p.mallampati, difficultAirway: p.difficultAirway, allergies: p.allergies, fastingSolids: p.fastingSolids,
    fastingLiquids: p.fastingLiquids, history: p.history, labs: { ...p.labs } }
}

/** «ASA II E · Mallampati I · VAD No · Ayuno 8/6 h»: una línea para la tarjeta y el resumen. */
export function preEvalLine(p: PreEvalData) {
  return [p.asa && `ASA ${p.asa}${p.asaE ? ' E' : ''}`, p.mallampati && `Mallampati ${p.mallampati}`, p.difficultAirway && `VAD ${p.difficultAirway}`,
    (p.fastingSolids || p.fastingLiquids) && `Ayuno ${p.fastingSolids || '—'}/${p.fastingLiquids || '—'} h`].filter(Boolean).join(' · ')
}

/** Laboratorios con valor, en el orden de la hoja: «Hb 12.5 g/dL · Hto 38 %». */
export const labLine = (labs: Partial<Record<PreLabKey, string>>) => PREANESTHESIA_LABS.filter((l) => labs[l.key]?.trim()).map((l) => `${l.label} ${labs[l.key]!.trim()}`).join(' · ')

/** Busca el último valor de cada laboratorio entre los resultados (más reciente primero). */
export function latestLabs(results: { at: string; values: { analyte: string; value: string; unit?: string }[] }[]): Partial<Record<PreLabKey, string>> {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  const out: Partial<Record<PreLabKey, string>> = {}
  for (const r of [...results].sort((a, b) => b.at.localeCompare(a.at))) {
    for (const v of r.values) {
      if (!v.value?.trim()) continue
      const lab = PREANESTHESIA_LABS.find((l) => l.match.test(norm(v.analyte)))
      if (lab && !out[lab.key]) out[lab.key] = `${v.value.trim()}${v.unit ? ` ${v.unit}` : ''}`.slice(0, 20)
    }
  }
  return out
}

export const samePre = (a: PreEvalData, b: PreEvalData) => JSON.stringify(a) === JSON.stringify(b)
