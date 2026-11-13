import { useCallback, useEffect, useRef, useState } from 'react'
import { Combo } from '../components/Combo'
import { FileImage, FileText, Trash2, Upload } from 'lucide-react'
import { useStore } from '../lib/store'
import { Loading } from '../components/ui'
import { date, fileSize, time } from '../lib/format'
import type { Attachment } from '../lib/types'
import { MAX_SCAN_BYTES, openFile, uploadLarge } from '../lib/files'

// PQ3 (ronda 14): «Hoja de anestesia» se sube desde la tarjeta de la nota postquirúrgica, no desde aquí
const CATEGORY: Record<Attachment['category'], string> = { lab: 'Laboratorio', imaging: 'Imagen', document: 'Documento', other: 'Otro', anesthesia: 'Hoja de anestesia', preanesthesia: 'Valoración preanestésica', surgical_count: 'Recuento quirúrgico' }
const TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']

/** Archivos del expediente: subir arrastrando, abrir en otra pestaña y eliminar. */
export function Attachments({ patientId }: { patientId: string }) {
  const { fetchAttachments, deleteAttachment, staffById, user, notify } = useStore()
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
      // R2 pendiente (ronda 17): antes el máximo era 3 MB (subida en una sola petición). Ahora va por partes, como los
      // resultados de exámenes (uploadLarge), con el mismo máximo de 15 MB
      if (file.size > MAX_SCAN_BYTES) { notify(`"${file.name}" pesa ${fileSize(file.size)}. El máximo es 15 MB.`, 'error'); continue }
      try {
        await uploadLarge(patientId, file, { name: file.name, mime: file.type, category })
        notify('Archivo adjuntado')
      } catch (e) { notify((e as Error).message, 'error') }
    }
    setBusy(false)
    load()
  }

  // Se baja por partes: un archivo de más de 4,5 MB no cabe en una sola respuesta
  const open = (a: Attachment) => { openFile(a.id).catch(() => notify('No se pudo abrir el archivo.', 'error')) }

  return (
    <div className="stack stack--16">
      <div className={`dropzone ${drag ? 'is-drag' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files) }}>
        <Upload size={22} />
        <div>
          <strong>{busy ? 'Subiendo…' : 'Arrastra aquí resultados o imágenes'}</strong>
          <p>PDF, PNG, JPG o WEBP de hasta 15 MB.</p>
        </div>
        <Combo auto value={category} onChange={(v) => setCategory(v as Attachment['category'])} label="Tipo de archivo"
          options={Object.entries(CATEGORY).filter(([k]) => !['anesthesia', 'preanesthesia', 'surgical_count'].includes(k)).map(([k, v]) => ({ value: k, label: v }))} />
        <button className="btn btn--soft" disabled={busy} onClick={() => input.current?.click()}>Elegir archivo</button>
        <input ref={input} type="file" accept={TYPES.join(',')} multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = '' }} />
      </div>
      <section className="panel">
        {!list ? <Loading /> : list.length ? <div className="rows">{list.map((a) => (
          <div key={a.id} className="row" style={{ gridTemplateColumns: '36px 1fr auto' }}>
            {a.mime === 'application/pdf' ? <FileText size={22} color="var(--ink)" /> : <FileImage size={22} color="var(--ink)" />}
            <button className="row__who linklike" onClick={() => open(a)}>
              <strong>{a.name}</strong>
              <span>{CATEGORY[a.category]}{a.voidedAt ? ` (anulada: ${a.voidReason ?? ''})` : ''}, {fileSize(a.size)}, {date(a.uploadedAt)} {time(a.uploadedAt)}, {staffById(a.uploadedBy)?.name}</span>
            </button>
            {(a.uploadedBy === user?.id || user?.role === 'doctor') && !['anesthesia', 'preanesthesia', 'surgical_count'].includes(a.category) && (
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
