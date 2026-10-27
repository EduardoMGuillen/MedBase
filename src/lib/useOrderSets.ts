import { useCallback, useEffect, useState } from 'react'
import { useStore } from './store'
import { api } from './api'
import type { OrderSet } from './types'

/** Sets de órdenes que ve el médico: los suyos (los más usados primero) y los compartidos de la clínica. */
export function useOrderSets(enabled = true) {
  const { notify } = useStore()
  const [sets, setSets] = useState<OrderSet[] | null>(null)
  const reload = useCallback(() => {
    if (!enabled) return
    api<OrderSet[]>('/order-sets').then(setSets).catch((e: Error) => notify(e.message, 'error'))
  }, [enabled, notify])
  useEffect(reload, [reload])
  return { sets, reload }
}
