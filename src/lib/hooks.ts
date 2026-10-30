import { useEffect, useState } from 'react'
import { useStore } from './store'

/** Hora actual que se actualiza cada minuto, para el "retrasado N min". */
export function useNow(everyMs = 60_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), everyMs)
    return () => clearInterval(t)
  }, [everyMs])
  return now
}

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
