import { DEPT_POSITIONS, NAME_PREFIXES } from './clinicalConfig.js'
import { mainRole, ROLE_LABEL } from './permissions.js'
import type { Role } from './types.js'

export type DeptKey = keyof typeof DEPT_POSITIONS
export type PositionKey = (typeof DEPT_POSITIONS)[DeptKey][number]['key']

/** DP1 (ronda 11): el cargo de una persona (Microbiólogo, Técnico de laboratorio, Radiólogo, Técnico en imágenes). */
export function positionOf(key?: string) {
  for (const [dept, list] of Object.entries(DEPT_POSITIONS)) {
    const p = list.find((x) => x.key === key)
    if (p) return { ...p, dept: dept as DeptKey }
  }
  return undefined
}

/** ¿Es jefe de su departamento de Laboratorio o Imágenes (Microbiólogo o Radiólogo: configura y edita turnos)? */
export const isDeptLead = (s?: { position?: string }) => { const p = positionOf(s?.position); return !!p?.lead && p.dept !== 'nursing' }

/** EN1 (ronda 16): el departamento del cargo o puesto de cada rol (Laboratorio, Imágenes, Enfermería). */
export const POSITION_DEPT: Partial<Record<Role, DeptKey>> = { lab: 'lab', imaging: 'imaging', nurse: 'nursing', anesthesia: 'anesthesia' }

/** EN1 (ronda 16): el cargo o puesto de la persona en el departamento de ese rol (o undefined si no tiene). */
export function positionFor(s: { position?: string }, role: Role) {
  const p = positionOf(s.position)
  return p && p.dept === POSITION_DEPT[role] ? p : undefined
}

/** Nombre con el prefijo del cargo («Lic. Paula Suazo», «Téc. Bryan Erazo»), sin repetirlo si ya lo trae. */
export function signedName(s: { name: string; docName?: string; position?: string }) {
  const name = s.docName || s.name
  const pos = positionOf(s.position)
  if (!pos || NAME_PREFIXES.some((p) => name.startsWith(`${p} `))) return name
  return `${pos.prefix} ${name}`
}

/** Para firmar un documento: el nombre con prefijo y la línea de cargo y colegiación («Microbiólogo(a) · N.º de colegiación DEMO-0001»). */
export function signerOf(s?: { name: string; docName?: string; position?: string; role: Role; roles?: Role[]; specialty?: string; license?: string }) {
  if (!s) return { name: '—', title: '' }
  const pos = positionOf(s.position)
  const cargo = pos?.label ?? [ROLE_LABEL[mainRole(s)], s.specialty].filter(Boolean).join(', ')
  return { name: signedName(s), title: [cargo, s.license && `N.º de colegiación ${s.license}`].filter(Boolean).join(' · ') }
}

/**
 * AN1 (ronda 18): quién hace una valoración preanestésica o una anestesia: los médicos con especialidad de Anestesiología y el
 * personal con el cargo «Técnico(a) en anestesia». Es lo que ofrecen «Valoración realizada por» y «Anestesia realizada por»
 * (además se puede escribir el nombre de alguien de afuera).
 */
export function isAnesthesiaStaff(s: { role: Role; roles?: Role[]; position?: string; specialty?: string }) {
  if (s.position === 'anesthesia_tech') return true
  return (s.roles ?? [s.role]).includes('doctor') && /anestesi/i.test((s.specialty ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
}

/** LD1 (ronda 18): lo que dice de cada persona una lista de personal, a la derecha del nombre: su cargo, su especialidad o su rol. */
export function staffHint(s: { position?: string; specialty?: string; role: Role; roles?: Role[] }) {
  return positionOf(s.position)?.label ?? s.specialty ?? ROLE_LABEL[mainRole(s)]
}
