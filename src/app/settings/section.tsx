import { createContext, useContext, useEffect, useState } from 'react'
import { useStore } from '../../lib/store'
import type { ClinicSettings } from '../../lib/types'

// Configuración: cada apartado declara si tiene cambios sin guardar y cómo guardarlos (la pantalla los junta).
/** Un bloque de la sección con algo por guardar: campos de la configuración (`patch`) o su propio guardado (`save`). */
export interface Block { dirty: boolean; patch?: Partial<ClinicSettings>; save?: () => Promise<boolean>; reset: () => void }
export const SectionCtx = createContext<((id: string, b: Block | null) => void) | null>(null)

/** Registra un bloque en la sección (en cada render, para que la sección tenga siempre sus valores al guardar). */
export function useSectionBlock(id: string, b: Block) {
  const register = useContext(SectionCtx)
  useEffect(() => { register?.(id, b) })
  useEffect(() => () => register?.(id, null), [id, register])
}

/**
 * Campos de la configuración de la clínica que se editan en un bloque. Lo cambiado queda como borrador encima de lo
 * guardado; «Guardar cambios» manda los borradores de la sección juntos (un solo PUT con la configuración completa) y
 * luego los limpia.
 */
export function useSettingsDraft(id: string) {
  const { settings } = useStore()
  const [draft, setDraft] = useState<Partial<ClinicSettings>>({})
  const v: ClinicSettings = { ...settings, ...draft }
  const patch = Object.fromEntries(Object.entries(draft).filter(([k, x]) => JSON.stringify(x) !== JSON.stringify(settings[k as keyof ClinicSettings]))) as Partial<ClinicSettings>
  const dirty = Object.keys(patch).length > 0
  useSectionBlock(id, { dirty, patch, reset: () => setDraft({}) })
  const set = <K extends keyof ClinicSettings>(k: K, x: ClinicSettings[K]) => setDraft((d) => ({ ...d, [k]: x }))
  const setMany = (p: Partial<ClinicSettings>) => setDraft((d) => ({ ...d, ...p }))
  return { v, set, setMany }
}
