import { useMemo, useSyncExternalStore } from 'react'
import { api } from './api'
import { fileAlerts, type FileAlert } from './alerts'
import { bandOf } from './vitalsSheet'
import { useNow, useViewer } from './hooks'
import { useStore } from './store'
import { shortStaff } from './format'
import { splitPendings } from './pendings'
import type { InpatientFile } from './types'

/** Lo que manda el servidor de cada estancia activa: sólo lo que usan las alertas (GET /inpatient/alerts). */
export type WardFile = Pick<InpatientFile, 'hospitalization' | 'notes' | 'marks' | 'meds' | 'doses' | 'vitals' | 'consultOrders' | 'authorizations' | 'exams'>

/**
 * PD2 (ronda 18): los expedientes de los internados y en observación se piden UNA vez y se comparten entre el menú (insignias),
 * las listas de Hospitalizados y Observación (columna «Pendientes») y el Inicio de enfermería. Se refrescan cada minuto mientras
 * alguna pantalla los use, y al volver a la pestaña.
 */
let files: WardFile[] | null = null
let users = 0
let timer: ReturnType<typeof setInterval> | undefined
const listeners = new Set<() => void>()
const load = () => api<WardFile[]>('/inpatient/alerts').then((f) => { files = f; listeners.forEach((l) => l()) }).catch(() => null)
const onShow = () => { if (!document.hidden) void load() }
function subscribe(l: () => void) {
  listeners.add(l)
  if (++users === 1) { void load(); timer = setInterval(() => { if (!document.hidden) void load() }, 60_000); document.addEventListener('visibilitychange', onShow) }
  return () => {
    listeners.delete(l)
    if (--users === 0) { clearInterval(timer); document.removeEventListener('visibilitychange', onShow); files = null }
  }
}
const none = () => () => {}
/** Vuelve a pedirlos ya (después de registrar algo que cierra un pendiente). */
export const reloadWard = () => { if (users) void load() }

/** Los expedientes de las estancias activas; null mientras llegan o si la persona no ve el expediente. */
export function useWardFiles(enabled = true): WardFile[] | null {
  return useSyncExternalStore(enabled ? subscribe : none, () => (enabled ? files : null))
}

export interface StayPendings { mine: FileAlert[]; others: FileAlert[] }

/**
 * PD1 y PD2: por estancia, los pendientes de quien mira (cuentan) y los de otros (informativos), con las mismas reglas del
 * expediente. Solo para quien abre el expediente (inpatient.view).
 */
export function useStayPendings(): Map<string, StayPendings> | null {
  const { can, settings, staffById } = useStore()
  const viewer = useViewer()
  const list = useWardFiles(can('inpatient.view'))
  const now = useNow()
  return useMemo(() => {
    if (!list || !viewer) return null
    const band = bandOf(settings)
    const groups = viewer.role === 'lab' ? ['lab' as const] : viewer.role === 'imaging' ? ['imaging' as const] : undefined
    return new Map(list.map((f) => [f.hospitalization.id, splitPendings(fileAlerts(f, band, now, { nameOf: (id) => shortStaff(staffById(id)?.name), groups }), viewer)]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, viewer, now, settings])
}

/** PD2: la insignia del menú: pacientes con al menos un pendiente de quien mira; en rojo si alguno es crítico. */
export function pendingBadge(map: Map<string, StayPendings> | null, stayIds: string[]) {
  if (!map) return null
  const mine = stayIds.map((id) => map.get(id)?.mine ?? []).filter((m) => m.length)
  return { n: mine.length, alert: mine.some((m) => m.some((a) => a.level === 'critical')) }
}
