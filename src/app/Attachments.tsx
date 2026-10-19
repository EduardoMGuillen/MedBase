import { useCallback, useEffect, useRef, useState } from 'react'
import { FileImage, FileText, Trash2, Upload } from 'lucide-react'
import { useStore } from '../lib/store'
import { Loading } from '../components/ui'
import { date, fileSize, time } from '../lib/format'
import type { Attachment } from '../lib/types'

const CATEGORY: Record<Attachment['category'], string> = { lab: 'Laboratorio', imaging: 'Imagen', document: 'Documento', other: 'Otro' }
const MAX = 8 * 1024 * 1024
const TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']

const toBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
  r.onerror = () => reject(new Error('No se pudo leer el archivo.'))
  r.readAsDataURL(file)
})

/** Archivos del expediente: subir arrastrando, abrir en otra pestaña y eliminar. */
export function Attachments({ patientId }: { patientId: string }) {
  const { fetchAttachments, uploadAttachment, deleteAttachment, staffById, user, notify } = useStore()
  const [list, setList] = useState<Attachment[] | null>(null)
  const [category, setCategory] = useState<Attachment['category']>('lab')
  const [drag, setDrag] = useState(false)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const load = useCallback(() => { fetchAttachments(patientId).then(setList).catch((e: Error) => notify(e.message, 'error')) }, [patientId, fetchAttachments, notify])
  useEffect(load, [load])

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    for (const file of Array.from(files)) {
      if (!TYPES.includes(file.type)) { notify(`"${file.name}" no es PDF ni imagen. Sólo se aceptan PDF, PNG, JPG o WEBP.`, 'error'); continue }
      if (file.size > MAX) { notify(`"${file.name}" pesa ${fileSize(file.size)}. El máximo es 8 MB.`, 'error'); continue }
      await uploadAttachment(patientId, { name: file.name, mime: file.type, category, data: await toBase64(file) })
    }
    setBusy(false)
    load()
  }

  const open = async (a: Attachment) => {
    const res = await fetch(`/api/attachments/${a.id}`, { credentials: 'same-origin' })
    if (!res.ok) { notify('No se pudo abrir el archivo.', 'error'); return }
    const url = URL.createObjectURL(await res.blob())
    window.open(url, '_blank', 'noopener')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className={`dropzone ${drag ? 'is-drag' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files) }}>
        <Upload size={22} />
        <div>
          <strong>{busy ? 'Subiendo…' : 'Arrastra aquí resultados o imágenes'}</strong>
          <p>PDF, PNG, JPG o WEBP de hasta 8 MB.</p>
        </div>
        <select className="select" style={{ width: 'auto' }} value={category} onChange={(e) => setCategory(e.target.value as Attachment['category'])} aria-label="Tipo de archivo">
          {Object.entries(CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="btn btn--soft" disabled={busy} onClick={() => input.current?.click()}>Elegir archivo</button>
        <input ref={input} type="file" accept={TYPES.join(',')} multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = '' }} />
      </div>
      <section className="panel">
        {!list ? <Loading /> : list.length ? <div className="rows">{list.map((a) => (
          <div key={a.id} className="row" style={{ gridTemplateColumns: '36px 1fr auto' }}>
            {a.mime === 'application/pdf' ? <FileText size={22} color="var(--ink)" /> : <FileImage size={22} color="var(--ink)" />}
            <button className="row__who linklike" onClick={() => open(a)}>
              <strong>{a.name}</strong>
              <span>{CATEGORY[a.category]}, {fileSize(a.size)}, {date(a.uploadedAt)} {time(a.uploadedAt)}, {staffById(a.uploadedBy)?.name}</span>
            </button>
            {(a.uploadedBy === user?.id || user?.role === 'doctor') && (
              <button className="icon-btn" aria-label={`Eliminar ${a.name}`} onClick={async () => {
                if (confirm(`¿Eliminar "${a.name}" del expediente? Esta acción no se puede deshacer.`) && await deleteAttachment(a.id)) load()
              }}><Trash2 size={16} /></button>
            )}
          </div>
        ))}</div> : <div className="empty">Aún no hay archivos. Sube resultados de laboratorio, radiografías o documentos del paciente.</div>}
      </section>
    </div>
  )
}
