import { useEffect, useRef, useState } from 'react'
import { Download, FileText, Image as ImageIcon, Printer } from 'lucide-react'
import { useStore } from '../lib/store'
import { fetchFile } from '../lib/files'
import { Loading, Modal } from './ui'

type Meta = { name: string; mime: string; size: number }

/** Nombre y tipo de un archivo del expediente (sin bajarlo). */
function useFileMeta(id: string) {
  const { fetchAttachmentMeta } = useStore()
  const [meta, setMeta] = useState<Meta | null>(null)
  useEffect(() => { let alive = true; fetchAttachmentMeta(id).then((m) => { if (alive) setMeta(m) }).catch(() => null); return () => { alive = false } }, [id, fetchAttachmentMeta])
  return meta
}

/** El archivo bajado (por partes, como siempre) como dirección local del navegador; se libera al cerrar. */
function useBlobUrl(id: string | null) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!id) return
    let alive = true
    let made = ''
    fetchFile(id).then((b) => { made = URL.createObjectURL(b); if (alive) setUrl(made) }).catch((e: Error) => { if (alive) setError(e.message) })
    return () => { alive = false; if (made) URL.revokeObjectURL(made) }
  }, [id])
  return { url, error }
}

const isImage = (m?: Meta | null) => !!m?.mime.startsWith('image/')
const isPdf = (m?: Meta | null) => m?.mime === 'application/pdf'
const kind = (m?: Meta | null) => (isPdf(m) ? 'PDF' : isImage(m) ? 'Imagen' : 'Archivo')

/**
 * EX4 (ronda 10): un archivo de un resultado: botón con su icono (PDF o imagen) y su nombre, «Ver archivo». Abre la vista
 * previa dentro de la app, con «Descargar» e «Imprimir».
 */
export function FileChip({ id }: { id: string }) {
  const meta = useFileMeta(id)
  const [open, setOpen] = useState(false)
  return (<>
    <button type="button" className="file-chip" onClick={() => setOpen(true)} aria-label={`Ver archivo ${meta?.name ?? ''}`}>
      {isImage(meta) ? <ImageIcon size={16} aria-hidden /> : <FileText size={16} aria-hidden />}
      <span className="file-chip__name">{meta?.name ?? 'Archivo'}</span>
      <span className="file-chip__kind">{kind(meta)}</span>
      <span className="file-chip__go">Ver archivo</span>
    </button>
    {open && <FileViewer id={id} meta={meta} onClose={() => setOpen(false)} />}
  </>)
}

/** EX6 (ronda 11): el nombre de un archivo, para «Archivo adjunto: [nombre]». */
export function FileName({ id }: { id: string }) {
  const meta = useFileMeta(id)
  return <>{meta?.name ?? 'archivo'}</>
}

/** EX4: miniatura de un resultado que solo trae archivo (la foto, o la primera página del PDF). */
export function FileThumb({ id }: { id: string }) {
  const meta = useFileMeta(id)
  const { url } = useBlobUrl(meta && (isImage(meta) || isPdf(meta)) ? id : null)
  if (!meta || !url) return null
  return (
    <div className="file-thumb" aria-hidden="true">
      {isImage(meta) ? <img src={url} alt="" /> : <iframe src={`${url}#page=1&toolbar=0&navpanes=0&view=FitH`} title={`Vista previa de ${meta.name}`} tabIndex={-1} />}
    </div>
  )
}

/** EX4: la vista previa completa, dentro de la app. */
export function FileViewer({ id, meta: given, onClose, autoPrint = false }: { id: string; meta?: Meta | null; onClose: () => void; autoPrint?: boolean }) {
  const { url, error } = useBlobUrl(id)
  const own = useFileMeta(id)
  const meta = given ?? own
  const frame = useRef<HTMLIFrameElement>(null)
  // EX6 (ronda 11): «Imprimir» de un resultado que solo es archivo abre el diálogo de impresión directamente
  const printedOnce = useRef(false)
  const print = () => {
    if (!url) return
    if (isPdf(meta) && frame.current?.contentWindow) { frame.current.contentWindow.focus(); frame.current.contentWindow.print(); return }
    // Una imagen se imprime sola, en una hoja
    const f = document.createElement('iframe')
    f.style.position = 'fixed'; f.style.width = '0'; f.style.height = '0'; f.style.border = '0'
    document.body.appendChild(f)
    const doc = f.contentDocument!
    doc.open(); doc.write(`<!doctype html><title>${(meta?.name ?? 'Archivo').replace(/</g, '')}</title><style>@page{margin:12mm}body{margin:0}img{max-width:100%;max-height:100vh;display:block;margin:auto}</style><img src="${url}">`); doc.close()
    const img = doc.querySelector('img')!
    const go = () => { f.contentWindow?.print(); setTimeout(() => f.remove(), 1000) }
    if (img.complete) go(); else img.onload = go
  }
  useEffect(() => {
    if (!autoPrint || !url || printedOnce.current) return
    printedOnce.current = true
    const t = setTimeout(print, isPdf(meta) ? 600 : 50)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPrint, url])
  return (
    <Modal title={meta?.name ?? 'Archivo'} wide className="file-viewer" onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cerrar</button>
      {url && <a className="btn btn--soft" href={url} download={meta?.name ?? 'archivo'}><Download size={16} />Descargar</a>}
      <button className="btn btn--primary" disabled={!url} onClick={print}><Printer size={16} />Imprimir</button>
    </>}>
      {error ? <p className="field__msg field__msg--error">{error}</p> : !url ? <Loading label="Abriendo el archivo" />
        : isImage(meta) ? <img className="file-viewer__img" src={url} alt={meta?.name ?? 'Archivo'} />
          : isPdf(meta) ? <iframe ref={frame} className="file-viewer__pdf" src={url} title={meta?.name ?? 'Archivo'} />
            : <p>Este tipo de archivo no se puede mostrar aquí. Usa «Descargar».</p>}
    </Modal>
  )
}
