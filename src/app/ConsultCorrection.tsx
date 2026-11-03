import { useEffect, useState } from 'react'
import { Pencil, X } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useStore } from '../lib/store'
import { AutoTextarea, Modal } from '../components/ui'
import { DiagnosisPicker } from '../components/DiagnosisPicker'
import { MedicationForm } from '../components/Medications'
import { CorrectionReason } from '../components/Grace'
import { useDraftSync } from '../lib/drafts'
import { GRACE_EXPIRED_TEXT } from '../lib/grace'
import { medicationLine } from '../lib/format'
import type { Consultation, Diagnosis, Patient, Prescription, PrescriptionItem } from '../lib/types'

/**
 * GE4 (ronda 9): «Corregir» la nota de consulta externa en el periodo de gracia: lo escrito y los diagnósticos, ya
 * llenados, con «Guardar corrección». Los medicamentos de la receta se corrigen sólo si la receta no se imprimió, descargó
 * ni envió; si ya salió, quedan bloqueados con su explicación y el resto de la nota sí se corrige.
 */
type Form = { reason: string; history: string; exam: string; observations: string; diagnoses: Diagnosis[]; items?: PrescriptionItem[] }

export function ConsultCorrection({ c, p, onClose, onSaved, onExpired }: { c: Consultation; p: Patient; onClose: () => void; onSaved: () => void; onExpired: (text: string) => void }) {
  const { notify } = useStore()
  const [f, setF] = useState<Form>({ reason: c.reason, history: c.history, exam: c.exam, observations: c.observations ?? '', diagnoses: c.diagnoses })
  const [rx, setRx] = useState<Prescription | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const [expired, setExpired] = useState(false)
  const draft = useDraftSync<Form>('consulta', `correct:${c.id}`, f, setF, false)
  useEffect(() => {
    if (c.prescriptionId) api<{ prescription: Prescription }>(`/prescriptions/${c.prescriptionId}`).then((r) => setRx(r.prescription)).catch(() => null)
  }, [c.prescriptionId])
  const rxOpen = !!rx && !rx.voidedAt && !rx.printedAt
  const items = f.items ?? rx?.items ?? []
  const ok = f.reason.trim() && f.diagnoses.length > 0 && (!f.items || f.items.length > 0)
  const text = () => [f.reason, f.history, f.exam, f.observations].filter((x) => x.trim()).join('\n')
  return (
    <Modal title="Corregir: Nota de consulta" wide className="note-modal" onClose={onClose} footer={<>
      {expired ? <span className="field__msg field__msg--error" style={{ marginRight: 'auto' }} role="alert">{GRACE_EXPIRED_TEXT}
        <button type="button" className="btn btn--soft btn--sm" style={{ marginLeft: 8 }} onClick={() => { draft.clear(); onExpired(text()) }}>Pasar a una adenda</button></span>
        : <span style={{ marginRight: 'auto' }}><CorrectionReason value={why} onChange={setWhy} /></span>}
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!ok || busy || expired || editing !== null} onClick={async () => {
        setBusy(true)
        try {
          await api(`/consultations/${c.id}/correct`, { body: { version: c.version ?? 1, why: why.trim() || undefined, reason: f.reason.trim(), history: f.history, exam: f.exam, observations: f.observations, diagnoses: f.diagnoses,
            items: rxOpen && f.items ? f.items : undefined } })
          draft.clear(); notify('Corrección guardada'); onSaved()
        } catch (e) {
          if (e instanceof ApiError && e.status === 409 && /minutos/.test(e.message)) setExpired(true)
          else notify(e instanceof Error ? e.message : 'No se pudo guardar la corrección.', 'error')
        } finally { setBusy(false) }
      }}>Guardar corrección</button>
    </>}>
      <div className="soap-stack">
        <label className="field"><span>Motivo de consulta</span><input className="input" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></label>
        <label className="field"><span>Historia de la enfermedad actual</span><AutoTextarea value={f.history} onChange={(e) => setF({ ...f, history: e.target.value })} /></label>
        <label className="field"><span>Examen físico</span><AutoTextarea value={f.exam} onChange={(e) => setF({ ...f, exam: e.target.value })} /></label>
        <DiagnosisPicker value={f.diagnoses} onChange={(v) => setF({ ...f, diagnoses: v })} label="Diagnósticos (CIE-11)" />
        <label className="field"><span>Observaciones</span><AutoTextarea value={f.observations} onChange={(e) => setF({ ...f, observations: e.target.value })} /></label>
        {rx && (
          <fieldset className="fs"><legend>Medicamentos de la receta {rx.folio}</legend>
            {!rxOpen && <div className="alert-strip alert-strip--amber">{rx.voidedAt ? 'La receta está anulada.' : 'Ya se imprimió la receta. Corrígelo con una adenda.'}</div>}
            <ul className="note__list">{items.map((it, i) => (
              <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ flex: 1 }}>{medicationLine(it)}</span>
                {rxOpen && editing === null && <>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(i)}><Pencil size={13} />Cambiar</button>
                  <button type="button" className="icon-btn" aria-label={`Quitar ${it.drug}`} disabled={items.length === 1} onClick={() => setF({ ...f, items: items.filter((_, j) => j !== i) })}><X size={15} /></button>
                </>}
              </li>
            ))}</ul>
            {editing !== null && <MedicationForm patient={p} current={items.filter((_, j) => j !== editing)} initial={items[editing]} submitLabel="Guardar cambio"
              onSave={(it) => { setF({ ...f, items: items.map((x, j) => (j === editing ? it : x)) }); setEditing(null) }} onCancel={() => setEditing(null)} />}
          </fieldset>
        )}
      </div>
    </Modal>
  )
}
