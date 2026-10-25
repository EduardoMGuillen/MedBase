import { useEffect, useState } from 'react'

/** Hora actual que se actualiza cada minuto, para el "retrasado N min". */
export function useNow(everyMs = 60_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), everyMs)
    return () => clearInterval(t)
  }, [everyMs])
  return now
}
