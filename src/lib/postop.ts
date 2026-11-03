import { SURGICAL_TEAM } from './clinicalConfig'
import type { PostopData } from './types'

/** PQ1 (ronda 9): el tipo de anestesia, o lo especificado si es «Otra». */
export const anesthesiaText = (x: Pick<PostopData, 'anesthesia' | 'anesthesiaOther'>) => (x.anesthesia === 'Otra' ? x.anesthesiaOther || 'Otra' : x.anesthesia)

/** PQ2 (ronda 9): sólo los cargos llenos, en el orden de SURGICAL_TEAM. */
export const teamLines = (team: PostopData['team']) => SURGICAL_TEAM.filter((t) => team[t.key]?.name.trim()).map((t) => ({ label: t.label, name: team[t.key]!.name.trim() }))
