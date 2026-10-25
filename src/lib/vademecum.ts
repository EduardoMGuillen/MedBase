import { useMemo } from 'react'
import { DRUGS, type Drug } from './catalogs'
import { useStore } from './store'

/** Vademécum que ve el médico: el catálogo base más los medicamentos que agregó la clínica (activos). */
export function useVademecum(): Drug[] {
  const { clinicDrugs } = useStore()
  return useMemo(() => [...DRUGS, ...(clinicDrugs ?? []).filter((d) => d.active).map((d) => ({
    name: d.name, presentation: [d.presentation, d.concentration].filter(Boolean).join(' '), group: 'clínica', brand: d.brand, clinicId: d.id,
    usual: d.route ? { dose: '', route: d.route, frequency: 'Cada 8 horas', duration: '' } : undefined,
  }))], [clinicDrugs])
}
