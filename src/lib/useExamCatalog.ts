import { useEffect, useState } from 'react'
import { api } from './api'
import type { ClinicExam, ExamProfile } from './types'

let cache: Promise<{ exams: ClinicExam[]; profiles: ExamProfile[] }> | null = null
/** Catálogo de exámenes de la clínica y perfiles (los base vienen en el código). */
export function useExamCatalog() {
  const [data, setData] = useState<{ exams: ClinicExam[]; profiles: ExamProfile[] }>({ exams: [], profiles: [] })
  const load = (fresh = false) => {
    if (fresh || !cache) cache = api<{ exams: ClinicExam[]; profiles: ExamProfile[] }>('/exams/catalog').catch(() => ({ exams: [], profiles: [] }))
    cache.then(setData)
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => load(), [])
  return { ...data, reload: () => load(true) }
}

