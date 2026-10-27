import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Camera, FileText, Images, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { Modal } from '../components/ui'
import { authTitle } from '../lib/consent'
import { fileSize } from '../lib/format'
import { buildScanPdf, renderPdfPages } from '../lib/pdf'
import { MAX_SCAN_BYTES, uploadLarge } from '../lib/files'
import type { Authorization } from '../lib/types'

type Mode = 'signed' | 'refused' | 'revoked' | 'replace'
const TITLE: Record<Mode, string> = { signed: 'Subir hoja firmada', refused: 'No autoriza: subir la hoja firmada', revoked: 'Revocación: subir la hoja firmada', replace: 'Reemplazar escaneo' }
/** Lo que se acepta elegir: fotos y PDF, hasta 15 MB entre todos antes de comprimir las fotos. */
const PICK_MAX = 60 * 1024 * 1024

/**
 * Hoja firmada en papel (A1, A2): fotos sueltas, la cámara del celular o un PDF de escáner de varias páginas. Todo se
 * une en un solo PDF en el orden de la lista (se puede reordenar), las fotos se comprimen y se ve la vista previa
 * antes de confirmar. Máximo 15 MB. Reemplazar guarda el escaneo anterior en el historial.
 */
export function ScanUpload({ a, mode, onClose, onDone }: { a: Authorization; mode: Mode; onClose: () => void; onDone: () => void }) {
  const { notify } = useStore()
  const [files, setFiles] = useState<File[]>([])
  const [thumbs, setThumbs] = useState<Map<File, string>>(new Map())
  const [preview, setPreview] = useState<{ blob: Blob; pages: string[] } | null>(null)
  const [building, setBuilding] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const camera = useRef<HTMLInputElement>(null)
  const picker = useRef<HTMLInputElement>(null)

  // Miniaturas y páginas de la vista previa: se liberan al cerrar
  const urls = useRef<string[]>([])
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), [])

  const add = (list: FileList | null) => {
    if (!list?.length) return
    const ok: File[] = []
    for (const f of Array.from(list)) {
      if (!(f.type === 'application/pdf' || f.type.startsWith('image/'))) { notify(`"${f.name}" no es una foto ni un PDF.`, 'error'); continue }
      ok.push(f)
    }
    const all = [...files, ...ok]
    if (all.reduce((s, f) => s + f.size, 0) > PICK_MAX) { notify('Son demasiados archivos. Sube la hoja en partes más pequeñas.', 'error'); return }
    const t = new Map(thumbs)
    for (const f of ok) if (f.type.startsWith('image/')) { const u = URL.createObjectURL(f); urls.current.push(u); t.set(f, u) }
    setThumbs(t)
    setFiles(all)
    setPreview(null)
  }
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= files.length) return
    const next = [...files]; [next[i], next[j]] = [next[j], next[i]]
    setFiles(next); setPreview(null)
  }

  const build = async () => {
    setBuilding(true)
    try {
      const blob = await buildScanPdf(files)
      const pages = await renderPdfPages(blob, 420)
      urls.current.push(...pages)
      setPreview({ blob, pages })
    } catch (e) {
      notify((e as Error).message, 'error')
    } finally {
      setBuilding(false)
    }
  }

  const tooBig = !!preview && preview.blob.size > MAX_SCAN_BYTES
  const needsNote = mode === 'replace'
  const confirm = async () => {
    if (!preview) return
    setProgress(0)
    try {
      const att = await uploadLarge(a.patientId, preview.blob, {
        name: `${authTitle(a)} (${mode === 'refused' ? 'no autoriza' : mode === 'revoked' ? 'revocación' : 'firmada'}).pdf`, mime: 'application/pdf', category: 'document',
        title: `${authTitle(a)}: ${mode === 'refused' ? 'no autoriza' : mode === 'revoked' ? 'revocación' : 'hoja firmada'} (papel)`, takenAt: new Date().toISOString(), hospitalizationId: a.hospitalizationId,
      }, setProgress)
      if (mode === 'replace') await api(`/authorizations/${a.id}/replace-scan`, { body: { fileId: att.id, reason: note.trim() } })
      else await api(`/authorizations/${a.id}/status`, { body: { status: mode, fileId: att.id, note: note.trim() || undefined } })
      notify(mode === 'replace' ? 'Escaneo reemplazado; el anterior queda en el historial' : mode === 'signed' ? 'Autorización firmada (papel escaneado)' : mode === 'refused' ? 'Rechazo registrado' : 'Revocación registrada')
      onDone()
    } catch (e) {
      notify((e as Error).message, 'error')
      setProgress(null)
    }
  }

  return (
    <Modal title={TITLE[mode]} wide onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      {!preview
        ? <button className="btn btn--primary" disabled={!files.length || building} onClick={build}>{building ? 'Preparando…' : 'Ver vista previa'}</button>
        : <button className="btn btn--primary" disabled={tooBig || progress !== null || (needsNote && note.trim().length < 3)} onClick={confirm}>
          {progress !== null ? `Subiendo ${Math.round(progress * 100)} %` : 'Confirmar y guardar'}</button>}
    </>}>
      <p className="muted" style={{ fontSize: 14 }}>Toma una foto de cada página, elige varias fotos o el PDF del escáner. Todo se une en un solo documento, en este orden. Máximo 15 MB.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn--soft" onClick={() => camera.current?.click()}><Camera size={16} />Tomar foto</button>
        <button type="button" className="btn btn--soft" onClick={() => picker.current?.click()}><Images size={16} />Elegir fotos o PDF</button>
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { add(e.target.files); e.target.value = '' }} />
        <input ref={picker} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = '' }} />
      </div>
      {files.length > 0 && (
        <ol className="scan-list">
          {files.map((f, i) => (
            <li key={`${f.name}-${f.size}-${i}`}>
              {thumbs.get(f) ? <img src={thumbs.get(f)} alt="" /> : <span className="scan-list__pdf"><FileText size={22} /></span>}
              <span className="scan-list__name"><b>{i + 1}. {f.name}</b><small>{f.type === 'application/pdf' ? 'PDF' : 'Foto'}, {fileSize(f.size)}</small></span>
              <span className="scan-list__tools">
                <button type="button" className="icon-btn" aria-label={`Subir ${f.name}`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={15} /></button>
                <button type="button" className="icon-btn" aria-label={`Bajar ${f.name}`} disabled={i === files.length - 1} onClick={() => move(i, 1)}><ArrowDown size={15} /></button>
                <button type="button" className="icon-btn" aria-label={`Quitar ${f.name}`} onClick={() => { setFiles(files.filter((_, j) => j !== i)); setPreview(null) }}><X size={15} /></button>
              </span>
            </li>
          ))}
        </ol>
      )}
      {preview && (<>
        <p className={tooBig ? 'field__msg field__msg--error' : 'muted'} style={{ fontSize: 14 }}>
          {preview.pages.length} página{preview.pages.length === 1 ? '' : 's'}, {fileSize(preview.blob.size)}.
          {tooBig ? ' Pesa más de 15 MB: quita páginas o toma las fotos con menor resolución.' : ' Revisa que estén todas las páginas, en orden y legibles.'}
        </p>
        <div className="scan-preview">{preview.pages.map((u, i) => <figure key={u}><img src={u} alt={`Página ${i + 1}`} /><figcaption>Página {i + 1}</figcaption></figure>)}</div>
      </>)}
      {mode !== 'signed' && (
        <label className="field"><span>{needsNote ? 'Por qué se reemplaza' : 'Nota (opcional)'}</span>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={needsNote ? 'Ej. Se subió la hoja de otro paciente' : ''} /></label>
      )}
    </Modal>
  )
}
