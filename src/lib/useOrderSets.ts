import { useCallback, useEffect, useState } from 'react'
import { useStore } from './store'
import { api } from './api'
import type { OrderSet } from './types'

/** Sets de órdenes que ve el médico: los suyos (los más usados primero) y los compartidos de la clínica. Con `kind = exams`, sus sets de exámenes (MC2). */
export function useOrderSets(enabled = true, kind: 'orders' | 'exams' = 'orders') {
  const { notify } = useStore()
  const [sets, setSets] = useState<OrderSet[] | null>(null)
  const reload = useCallback(() => {
    if (!enabled) return
    api<OrderSet[]>(kind === 'exams' ? '/order-sets?kind=exams' : '/order-sets').then(setSets).catch((e: Error) => notify(e.message, 'error'))
  }, [enabled, kind, notify])
  useEffect(reload, [reload])
  return { sets, reload }
}
