import { reportOptional } from './exams.js'
import type { ExamGroup, ExamStatus } from './types.js'

/**
 * AD1 (ronda 17): etapa de un estudio ambulatorio para administración y recepción, sin resultados: ordenado, muestra tomada
 * (laboratorio), en proceso (realizado, falta el informe), resultado listo, o no se realizó. Una radiografía realizada ya está
 * lista (el informe es opcional, EX3).
 */
export type AmbulatoryStage = 'ordered' | 'sample' | 'process' | 'ready' | 'not_done'
export const STAGE_LABEL: Record<AmbulatoryStage, string> = {
  ordered: 'Ordenado', sample: 'Muestra tomada', process: 'En proceso', ready: 'Resultado listo', not_done: 'No se realizó',
}

export function ambulatoryStage(e: { group: ExamGroup; name: string; status: ExamStatus; notDone?: boolean }): AmbulatoryStage {
  if (e.status === 'result' || e.status === 'reviewed') return 'ready'
  if (e.notDone) return 'not_done'
  if (e.status === 'ordered') return 'ordered'
  if (e.group === 'lab') return e.status === 'sample' ? 'sample' : 'process'
  // Imágenes: realizado; listo si el informe es opcional (Rayos X), si no, en proceso hasta el informe
  return reportOptional({ group: e.group, name: e.name }) ? 'ready' : 'process'
}

export interface AmbulatoryExam { id: string; group: ExamGroup; name: string; priority: string; orderedAt: string; stage: AmbulatoryStage; requestedBy?: string; requestedById?: string }
export interface AmbulatoryPatient { patient: { id: string; name: string; record: string; phone: string }; firstAt: string; exams: AmbulatoryExam[] }
