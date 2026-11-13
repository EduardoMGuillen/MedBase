import { useEffect, useMemo, useState } from 'react'
import type { PendingViewer } from './pendings'
import { useStore } from './store'
import { fileAlerts } from './alerts'
import { splitPendings } from './pendings'
import { bandOf } from './vitalsSheet'
import { shortStaff } from './format'
import type { InpatientFile } from './types'

/** Hora actual que se actualiza cada minuto, para el "retrasado N min". */
export function useNow(everyMs = 60_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), everyMs)
    return () => clearInterval(t)
  }, [everyMs])
  return now
}

/** Verdadero mientras se cumple la media query (se actualiza al girar la tableta o cambiar el ancho). */
export function useMedia(q: string) {
  const [m, setM] = useState(() => window.matchMedia(q).matches)
  useEffect(() => {
    const mq = window.matchMedia(q)
    const on = () => setM(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [q])
  return m
}

/** TB (ronda 17): modo tablet, de 768 a 1180 px: la barra lateral es una franja de íconos (responsive.css). */
export const RAIL_QUERY = '(min-width: 768px) and (max-width: 1180px)'

/** Verdadero en pantallas de teléfono (hasta 720 px), para elegir entre panel y hoja inferior. */
export function useIsPhone() {
  const q = '(max-width: 720px)'
  const [m, setM] = useState(() => window.matchMedia(q).matches)
  useEffect(() => {
    const mq = window.matchMedia(q)
    const on = () => setM(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return m
}

/** Vigencia de la receta del médico que la emite (AD2): la de su configuración, 30 días si nunca la cambió. */
export function useRxValidity() {
  const { user } = useStore()
  return useState(user?.prefs?.rxValidityDays ?? 30)
}

/**
 * PD1 (ronda 18): quién mira, para saber qué pendientes son suyos: la persona con el rol que tiene activo (GE1). En un
 * consultorio, la titular cuenta lo de enfermería como suyo mientras no tenga una enfermera o asistente activa (A11).
 */
export function useViewer(): PendingViewer | null {
  const { user, settings, staff } = useStore()
  const office = settings.kind === 'office'
  const hasNurse = office && staff.some((s) => s.active && s.id !== user?.id && (s.roles ?? [s.role]).some((r) => r === 'nurse' || r === 'assistant'))
  const id = user?.id, role = user?.role, position = user?.position
  return useMemo(() => (id && role ? { id, role, position, office, hasNurse } : null), [id, role, position, office, hasNurse])
}

/** EN2: alertas agrupadas de un expediente de hospitalización u observación. */
export function useFileAlerts(file: InpatientFile | null) {
  const { settings, staffById, user } = useStore()
  const now = useNow()
  // Ronda 12 (IM2): Laboratorio e Imágenes solo ven los avisos de los estudios de su departamento
  const groups = user?.role === 'lab' ? ['lab' as const] : user?.role === 'imaging' ? ['imaging' as const] : undefined
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (file ? fileAlerts(file, bandOf(settings), now, { nameOf: (id) => shortStaff(staffById(id)?.name), groups }) : []), [file, settings, now, user?.role])
}

/** PD1 (ronda 18): las alertas del expediente repartidas: las de quien mira (cuentan) y las de otros (informativas). */
export function useStayAlerts(file: InpatientFile | null) {
  const all = useFileAlerts(file)
  const viewer = useViewer()
  const now = useNow()
  return useMemo(() => ({ ...(viewer ? splitPendings(all, viewer) : { mine: [], others: [] }), now }), [all, viewer, now])
}
