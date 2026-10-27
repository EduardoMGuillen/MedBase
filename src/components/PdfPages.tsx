import { useEffect, useState } from 'react'
import { fetchFile } from '../lib/files'
import { renderPdfPages } from '../lib/pdf'

/**
 * Las páginas de un archivo del expediente (PDF o foto) como imágenes: se ven igual en pantalla, en el celular y al
 * imprimir. Cada página va en su propia hoja al imprimir.
 */
export function PdfPages({ fileId, label, onReady }: { fileId: string; label: string; onReady?: () => void }) {
  const [pages, setPages] = useState<string[] | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let alive = true
    let made: string[] = []
    fetchFile(fileId)
      .then(async (blob) => (blob.type.startsWith('image/') ? [URL.createObjectURL(blob)] : renderPdfPages(blob, 1100)))
      .then((p) => { made = p; if (alive) setPages(p); else p.forEach((u) => URL.revokeObjectURL(u)) })
      .catch(() => { if (alive) setError(true) })
    return () => { alive = false; made.forEach((u) => URL.revokeObjectURL(u)) }
  }, [fileId])
  useEffect(() => { if (pages || error) onReady?.() }, [pages, error, onReady])
  if (error) return <p className="muted">No se pudo abrir {label.toLowerCase()}.</p>
  if (!pages) return <p className="muted">Abriendo {label.toLowerCase()}…</p>
  return <div className="pdf-pages">{pages.map((u, i) => <img key={u} className="pdf-page" src={u} alt={`${label}, página ${i + 1} de ${pages.length}`} />)}</div>
}
