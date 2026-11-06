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

/** ¿Es jefe de su departamento (Microbiólogo o Radiólogo: configura y edita turnos)? */
export const isDeptLead = (s?: { position?: string }) => !!positionOf(s?.position)?.lead

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
