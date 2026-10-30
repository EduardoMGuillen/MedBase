import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'

export type DraftScope = 'consulta' | 'evolucion' | 'procedimiento' | 'egreso' | 'enfermeria'

/**
 * AN1: borrador que se guarda solo mientras se escribe. Al instante en este navegador (sobrevive a recargar) y cada
 * pocos segundos en el servidor (sobrevive a cerrar el navegador o cambiar de equipo, y a que se vaya el internet un
 * rato: se reintenta). Al abrir, se recupera el más reciente de los dos con `apply`. `blank` dice si no hay nada escrito
 * (entonces no se guarda y se borra el anterior).
 */
export function useDraftSync<T>(scope: DraftScope, ref: string | undefined, snapshot: T, apply: (d: T) => void, blank: boolean, localKey = `clinara.borrador.${scope}.${ref}`) {
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [restored, setRestored] = useState(false)
  const [offline, setOffline] = useState(false)
  const ready = useRef(false)
  const applyRef = useRef(apply)
  applyRef.current = apply
  const json = JSON.stringify(snapshot)

  // Al abrir: el borrador de este navegador y el del servidor; gana el más reciente
  useEffect(() => {
    if (!ref) return
    let alive = true
    let local: { data: T; savedAt: string } | null = null
    try { const raw = localStorage.getItem(localKey); if (raw) { const v = JSON.parse(raw); local = v && v.savedAt ? v : { data: v, savedAt: '' } } } catch { /* sin almacenamiento */ }
    api<{ data: T; updatedAt: string } | null>(`/drafts/${scope}/${ref}`).catch(() => null).then((server) => {
      if (!alive) return
      const pick = server && (!local || server.updatedAt > local.savedAt) ? { data: server.data, savedAt: server.updatedAt } : local
      if (pick && pick.data && Object.keys(pick.data as object).length) { applyRef.current(pick.data); setRestored(true); setSavedAt(pick.savedAt || null) }
      ready.current = true
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, ref])

  // Mientras se escribe: al navegador casi al instante, al servidor cada 3 segundos de pausa
  useEffect(() => {
    if (!ref || !ready.current) return
    const local = setTimeout(() => {
      try {
        if (blank) localStorage.removeItem(localKey)
        else localStorage.setItem(localKey, JSON.stringify({ data: JSON.parse(json), savedAt: new Date().toISOString() }))
      } catch { /* sin almacenamiento */ }
    }, 400)
    const remote = setTimeout(() => {
      const req = blank ? api(`/drafts/${scope}/${ref}`, { method: 'DELETE' }) : api<{ updatedAt: string }>(`/drafts/${scope}/${ref}`, { method: 'PUT', body: { data: JSON.parse(json) } })
      req.then((r) => { setOffline(false); if (!blank) setSavedAt((r as { updatedAt: string }).updatedAt) }).catch(() => setOffline(true))
    }, 3000)
    return () => { clearTimeout(local); clearTimeout(remote) }
  }, [json, blank, ref, scope, localKey])

  /** Al firmar: el borrador ya no hace falta. */
  const clear = useCallback(() => {
    try { localStorage.removeItem(localKey) } catch { /* noop */ }
    if (ref) api(`/drafts/${scope}/${ref}`, { method: 'DELETE' }).catch(() => null)
  }, [scope, ref, localKey])

  return { savedAt, restored, offline, clear }
}

/** "Guardado hace un momento", "hace 3 min", "a las 10:42". */
export function savedLabel(savedAt: string | null, now = new Date()) {
  if (!savedAt) return null
  const min = Math.floor((now.getTime() - new Date(savedAt).getTime()) / 60_000)
  if (min < 1) return 'Guardado hace un momento'
  if (min < 60) return `Guardado hace ${min} min`
  return `Guardado a las ${new Date(savedAt).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit', hour12: false })}`
}

/** Tipos de adenda (AN1). */
export const ADDENDUM_KIND = { correction: 'Corrección', info: 'Información adicional', result: 'Resultado posterior' } as const
