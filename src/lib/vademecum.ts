import { useMemo } from 'react'
import { DRUGS, type Drug } from './catalogs'
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
    const all: Drug[] = [...DRUGS, ...(clinicDrugs ?? []).filter((d) => d.active).map((d) => ({
      name: d.name, presentation: [d.presentation, d.concentration].filter(Boolean).join(' '), group: 'clínica', brand: d.brand, clinicId: d.id,
      usual: d.route ? { dose: d.usualDose ?? '', route: d.route, frequency: 'Cada 8 horas', duration: '' } : undefined,
    }))]
    if (!favs?.length) return all
    const set = new Set(favs)
    return [...all.filter((d) => set.has(drugKey(d))), ...all.filter((d) => !set.has(drugKey(d)))]
  }, [clinicDrugs, favs])
}
