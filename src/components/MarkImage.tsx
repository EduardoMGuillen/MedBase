import { useEffect, useState } from 'react'
import { api } from '../lib/api'

const cache = new Map<string, Promise<string | null>>()

/**
 * Firma o sello con que se emitió un documento (MC6). Cada documento guarda la versión con que se firmó, así que la
 * imagen no cambia aunque el médico cambie su firma después.
 */
export function MarkImage({ id, alt, className }: { id?: string; alt: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    if (!id) return
    let alive = true
    if (!cache.has(id)) cache.set(id, api<{ image: string }>(`/marks/${id}`).then((r) => r.image).catch(() => null))
    cache.get(id)!.then((img) => { if (alive) setSrc(img) })
    return () => { alive = false }
  }, [id])
  if (!id || !src) return null
  return <img src={src} alt={alt} className={className} />
}
