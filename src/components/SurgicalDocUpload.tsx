import { useState } from 'react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { uploadLarge } from '../lib/files'
import { Modal } from './ui'
import { useScanPicker } from '../app/ScanUpload'

/**
 * PQ4 y PQ5 (ronda 16): «Subir en papel» de la valoración preanestésica y del recuento quirúrgico. Igual que la hoja de
 * anestesia de PQ3: fotos de cada página o el PDF del escáner, unidos en un PDF, como archivo del expediente; luego queda como
 * el documento. Reemplazar pide el motivo y deja el anterior anulado y visible.
 */
export function SurgicalDocUpload({ title, docName, patientId, stayId, endpoint, performed, replaces, extra, onClose, onDone }: {
  title: string
  /** Nombre del documento («Valoración preanestésica»): título del archivo. */
  docName: string
  patientId: string
  stayId: string
  endpoint: string
  /** «Valoración realizada por»: con quién empieza el campo (si el documento lo pide). */
  performed?: { label: string; start: { name: string; staffId?: string } }
  replaces?: { id: string }
  extra?: Record<string, unknown>
  onClose: () => void
  onDone: () => void
}) {
  const { notify, staff } = useStore()
  const { files, preview, building, build, tooBig, ui } = useScanPicker()
  const [by, setBy] = useState<{ name: string; staffId?: string }>(performed?.start ?? { name: '' })
  const [observation, setObservation] = useState('')
  const [reason, setReason] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const people = staff.filter((s) => s.active && s.role !== 'superadmin')
  const ok = !!preview && !tooBig && (!performed || by.name.trim().length >= 3) && (!replaces || reason.trim().length >= 5) && progress === null
  const confirm = async () => {
    if (!preview || !ok) return
    setProgress(0)
    try {
      const att = await uploadLarge(patientId, preview.blob, { name: `${docName}.pdf`, mime: 'application/pdf', category: 'document', title: `${docName} (papel)`,
        takenAt: new Date().toISOString(), hospitalizationId: stayId }, setProgress)
      await api(endpoint, { body: { ...extra, fileId: att.id, performedBy: performed ? { name: by.name.trim(), staffId: by.staffId } : undefined, observation: observation.trim() || undefined,
        replaces: replaces ? { sheetId: replaces.id, reason: reason.trim() } : undefined } })
      onDone()
    } catch (e) {
      notify((e as Error).message, 'error')
      setProgress(null)
    }
  }
  return (
    <Modal title={title} wide onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      {!preview
        ? <button className="btn btn--primary" disabled={!files.length || building} onClick={build}>{building ? 'Preparando…' : 'Ver vista previa'}</button>
        : <button className="btn btn--primary" disabled={!ok} onClick={confirm}>{progress !== null ? `Subiendo ${Math.round(progress * 100)} %` : 'Confirmar y guardar'}</button>}
    </>}>
      <p className="muted" style={{ fontSize: 14 }}>Toma una foto de cada página o elige el PDF del escáner. Todo se une en un solo documento, en este orden. Máximo 15 MB.
        {replaces ? ' El documento anterior queda anulado y visible, con el motivo.' : ''}</p>
      {ui}
      <div className="form-grid">
        {performed && <label className="field"><span>{performed.label}</span>
          <input className="input" list="surgical-doc-people" value={by.name} aria-required="true" placeholder="Elige o escribe el nombre"
            onChange={(e) => { const name = e.target.value; setBy({ name, staffId: people.find((x) => x.name === name)?.id }) }} />
          <datalist id="surgical-doc-people">{people.map((s) => <option key={s.id} value={s.name} />)}</datalist></label>}
        <label className="field"><span>Observación (opcional)</span>
          <input className="input" value={observation} maxLength={1000} onChange={(e) => setObservation(e.target.value)} placeholder="Ej. La trajo la circulante" /></label>
        {replaces && <label className="field span-2"><span>Por qué se reemplaza</span>
          <input className="input" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="Ej. Faltaba la segunda página" /></label>}
      </div>
    </Modal>
  )
}
