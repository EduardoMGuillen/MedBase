import { useMemo } from 'react'
import type { Drug } from './catalogs'
import { drugProvider } from './drugProvider'
import { useStore } from './store'

/** Clave de un medicamento para los favoritos del médico (el mismo fármaco tiene varias presentaciones). */
export const drugKey = (d: Pick<Drug, 'name' | 'presentation'>) => `${d.name}|${d.presentation}`

/**
 * Vademécum que ve el médico: el catálogo base más los medicamentos que agregó la clínica (activos). Sus favoritos
 * (Mi configuración) van primero, para que salgan arriba al recetar.
 */
export function useVademecum(): Drug[] {
  const { clinicDrugs, user } = useStore()
  const favs = user?.prefs?.favDrugs
  return useMemo(() => {
    // AD4: los medicamentos vienen del proveedor (hoy el local; mañana, si se contrata, una API externa)
    const all: Drug[] = drugProvider.catalog(clinicDrugs ?? [])
    if (!favs?.length) return all
    const set = new Set(favs)
    return [...all.filter((d) => set.has(drugKey(d))), ...all.filter((d) => !set.has(drugKey(d)))]
  }, [clinicDrugs, favs])
}
