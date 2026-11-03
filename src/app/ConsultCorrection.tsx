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
import { DateField } from '../components/DateTimeField'
import { localISODate } from '../lib/format'
import type { Consultation, Diagnosis, ExamOrder, Followup, Patient, Prescription, PrescriptionItem } from '../lib/types'

/**
 * GE4 (ronda 9): «Corregir» la nota de consulta externa en el periodo de gracia: lo escrito y los diagnósticos, ya
 * llenados, con «Guardar corrección». Los medicamentos de la receta se corrigen sólo si la receta no se imprimió, descargó
 * ni envió; si ya salió, quedan bloqueados con su explicación y el resto de la nota sí se corrige.
 */
type Form = { reason: string; history: string; exam: string; observations: string; diagnoses: Diagnosis[]; items?: PrescriptionItem[]
  /** Exámenes que quedan y seguimientos como quedan (sólo si se tocaron). */
  keepExams?: string[]; followups?: { id: string; title: string; dueDate: string; notes?: string }[] }
/** Lo que dice el servidor: qué está bloqueado (receta impresa o ya en la hoja, muestra tomada, aviso enviado). */
type Locks = { rxLock?: string; exams: (ExamOrder & { lock?: string })[]; followups: (Followup & { lock?: string })[] }

export function ConsultCorrection({ c, p, onClose, onSaved, onExpired }: { c: Consultation; p: Patient; onClose: () => void; onSaved: () => void; onExpired: (text: string) => void }) {
  const { notify } = useStore()
  const [f, setF] = useState<Form>({ reason: c.reason, history: c.history, exam: c.exam, observations: c.observations ?? '', diagnoses: c.diagnoses })
  const [rx, setRx] = useState<Prescription | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const [expired, setExpired] = useState(false)
  const draft = useDraftSync<Form>('consulta', `correct:${c.id}`, f, setF, false)
  const [locks, setLocks] = useState<Locks | null>(null)
  useEffect(() => {
    if (c.prescriptionId) api<{ prescription: Prescription }>(`/prescriptions/${c.prescriptionId}`).then((r) => setRx(r.prescription)).catch(() => null)
    api<Locks>(`/consultations/${c.id}/correct`).then(setLocks).catch(() => null)
  }, [c.prescriptionId, c.id])
  const rxOpen = !!rx && !!locks && !locks.rxLock
  const keep = f.keepExams ?? locks?.exams.map((e) => e.id) ?? []
  const fus = f.followups ?? locks?.followups.map((x) => ({ id: x.id, title: x.title, dueDate: x.dueDate, notes: x.notes })) ?? []
  const setFu = (id: string, x: Partial<{ title: string; dueDate: string }>) => setF({ ...f, followups: fus.map((y) => (y.id === id ? { ...y, ...x } : y)) })
  const items = f.items ?? rx?.items ?? []
  const ok = f.reason.trim() && f.diagnoses.length > 0 && (!f.items || f.items.length > 0) && fus.every((x) => x.title.trim().length >= 3 && x.dueDate)
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
            items: rxOpen && f.items ? f.items : undefined, keepExams: f.keepExams, followups: f.followups?.map((x) => ({ ...x, title: x.title.trim() })) } })
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
            {locks?.rxLock && <div className="alert-strip alert-strip--amber">{locks.rxLock}</div>}
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
        {!!locks?.exams.length && (
          <fieldset className="fs"><legend>Exámenes</legend>
            <ul className="note__list">{locks.exams.map((e) => {
              const on = keep.includes(e.id)
              return <li key={e.id}><span className={on ? '' : 'struck'}>{e.name}</span>
                {e.lock ? <div className="locked-line">{e.lock}</div>
                  : <button type="button" className="btn btn--ghost btn--sm" style={{ marginLeft: 8 }} onClick={() => setF({ ...f, keepExams: on ? keep.filter((x) => x !== e.id) : [...keep, e.id] })}>{on ? 'Quitar' : 'Deshacer'}</button>}</li>
            })}</ul>
          </fieldset>
        )}
        {!!locks?.followups.length && (
          <fieldset className="fs"><legend>Seguimientos</legend>
            {locks.followups.map((x) => {
              const v = fus.find((y) => y.id === x.id)
              if (x.lock) return <div key={x.id}><strong>{x.title}</strong> · {x.dueDate.split('-').reverse().join('/')}<div className="locked-line">{x.lock}</div></div>
              if (!v) return <div key={x.id}><span className="struck">{x.title}</span>
                <button type="button" className="btn btn--ghost btn--sm" style={{ marginLeft: 8 }} onClick={() => setF({ ...f, followups: [...fus, { id: x.id, title: x.title, dueDate: x.dueDate, notes: x.notes }] })}>Deshacer</button></div>
              return <div key={x.id} className="form-grid">
                <label className="field"><span>Motivo</span><input className="input" value={v.title} onChange={(e) => setFu(x.id, { title: e.target.value })} /></label>
                <div className="field"><span>Fecha</span><DateField value={v.dueDate} min={localISODate(new Date())} onChange={(d) => setFu(x.id, { dueDate: d })} label="Fecha del seguimiento" /></div>
                <span style={{ alignSelf: 'end' }}><button type="button" className="btn btn--ghost btn--sm" onClick={() => setF({ ...f, followups: fus.filter((y) => y.id !== x.id) })}>Quitar</button></span>
              </div>
            })}
          </fieldset>
        )}
      </div>
    </Modal>
  )
}
