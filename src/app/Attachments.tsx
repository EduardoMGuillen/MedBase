import { useCallback, useEffect, useRef, useState } from 'react'
import { Combo } from '../components/Combo'
import { Activity, BadgeCheck, Camera, File, FileImage, FileSignature, FileText, FlaskConical, Hospital, IdCard, Pill, ScanLine, Send, Trash2, Upload } from 'lucide-react'
import { FILE_CATEGORIES, fileCategoryLabel, SYSTEM_FILE_CATEGORIES, type FileCategory } from '../lib/clinicalConfig'
import { useStore } from '../lib/store'
import { Loading } from '../components/ui'
import { date, fileSize, time } from '../lib/format'
import type { Attachment } from '../lib/types'
import { MAX_SCAN_BYTES, openFile, uploadLarge } from '../lib/files'

// AR1 (ronda 18): las categorías salen de clinicalConfig (FILE_CATEGORIES, VALIDAR: Emil); aquí solo el icono de cada una.
// PQ3 (ronda 14): los documentos quirúrgicos (hoja de anestesia…) se suben desde su tarjeta, no desde aquí.
const ICON: Record<FileCategory, typeof File> = {
  lab: FlaskConical, imaging: ScanLine, ecg: Activity, referral: Send, external_report: Hospital, consent: FileSignature, external_rx: Pill,
  certificate: BadgeCheck, photo: Camera, identification: IdCard, document: FileText, other: File,
}
const TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']

/** Archivos del expediente: subir arrastrando, abrir en otra pestaña y eliminar. */
export function Attachments({ patientId }: { patientId: string }) {
  const { fetchAttachments, deleteAttachment, staffById, user, notify } = useStore()
  const [list, setList] = useState<Attachment[] | null>(null)
  const [category, setCategory] = useState<FileCategory>('lab')
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
        <Combo className="dropzone__cat" value={category} onChange={(v) => setCategory(v as FileCategory)} label="Categoría del archivo"
          options={FILE_CATEGORIES.map((c) => { const I = ICON[c.key]; return { value: c.key, label: c.label, icon: <I size={16} aria-hidden="true" /> } })} />
        <button className="btn btn--soft" disabled={busy} onClick={() => input.current?.click()}>Elegir archivo</button>
        <input ref={input} type="file" accept={TYPES.join(',')} multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = '' }} />
      </div>
      <section className="panel">
        {/* AR1 (ronda 18): agrupados por categoría (solo las que tienen archivos), con su título y su conteo */}
        {!list ? <Loading /> : list.length ? [...FILE_CATEGORIES, ...SYSTEM_FILE_CATEGORIES].map((c) => ({ c, items: list.filter((a) => a.category === c.key) })).filter((g) => g.items.length).map(({ c, items }) => (
          <div key={c.key} className="file-group" role="group" aria-label={c.label}>
            <h3 className="file-group__head">{c.label} <span className="num faint">{items.length}</span></h3>
            <div className="rows">{items.map((a) => (
          <div key={a.id} className="row" style={{ gridTemplateColumns: '36px 1fr auto' }}>
            {a.mime === 'application/pdf' ? <FileText size={22} color="var(--ink)" /> : <FileImage size={22} color="var(--ink)" />}
            <button className="row__who linklike" onClick={() => open(a)}>
              <strong>{a.name}</strong>
              <span>{fileCategoryLabel(a.category)}{a.voidedAt ? ` (anulada: ${a.voidReason ?? ''})` : ''}, {fileSize(a.size)}, {date(a.uploadedAt)} {time(a.uploadedAt)}, {staffById(a.uploadedBy)?.name}</span>
            </button>
            {(a.uploadedBy === user?.id || user?.role === 'doctor') && !['anesthesia', 'preanesthesia', 'surgical_count'].includes(a.category) && (
              <button className="icon-btn" aria-label={`Eliminar ${a.name}`} onClick={async () => {
                if (confirm(`¿Eliminar "${a.name}" del expediente? Esta acción no se puede deshacer.`) && await deleteAttachment(a.id)) load()
              }}><Trash2 size={16} /></button>
            )}
          </div>
            ))}</div>
          </div>
        )) : <div className="empty">Aún no hay archivos. Sube resultados de laboratorio, radiografías o documentos del paciente.</div>}
      </section>
    </div>
  )
}
