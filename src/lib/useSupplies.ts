import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import { DEFAULT_SUPPLY_SETTINGS, type SupplyItem, type SupplySettings } from './supplies'

/** RU1 (ronda 14): el catálogo de material de la clínica y su periodo de registro. */
export function useSupplies(archived = false) {
  const [items, setItems] = useState<SupplyItem[] | null>(null)
  const [settings, setSettings] = useState<SupplySettings>(DEFAULT_SUPPLY_SETTINGS)
  const [error, setError] = useState('')
  const reload = useCallback(() => {
    api<{ items: SupplyItem[]; settings: SupplySettings }>(`/supplies${archived ? '?archived=1' : ''}`)
      .then((r) => { setItems(r.items); setSettings(r.settings); setError('') }).catch((e: Error) => setError(e.message))
  }, [archived])
  useEffect(() => { reload() }, [reload])
  return { items, settings, reload, error, setItems }
}

/** «Agregar a la lista de turno» o quitarla (Administración y Enfermería). Devuelve la línea actualizada. */
export const setShiftList = (id: string, on: boolean) => api<SupplyItem>(`/supplies/${id}/shift-list`, { body: { on } })

