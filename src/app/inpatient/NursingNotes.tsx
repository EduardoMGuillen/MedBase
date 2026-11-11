import { useState } from 'react'
import { useStore } from '../../lib/store'
import { date, time } from '../../lib/format'
import { DictateField } from '../../components/Dictate'
import type { Addendum, InpatientFile as File, InpatientNote } from '../../lib/types'
import { Addenda, DraftBadge } from '../../components/Addenda'
import { useDraftSync } from '../../lib/drafts'
import { GraceButton, VersionTag } from '../../components/Grace'
import { TextCorrection } from './MedicalNotes'

// Expediente de la estancia: notas de enfermería.
export function NursingNotes({ file, reload }: { file: File; reload: () => void }) {
  const { can, staffById, addNursingNote, user } = useStore()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  // AN1: la nota de enfermería también se guarda sola como borrador mientras se escribe
  const draft = useDraftSync<{ text: string }>('enfermeria', file.hospitalization.id, { text }, (d) => setText(d.text ?? ''), !text.trim())
  const nurse = can('inpatient.care') && user?.role !== 'doctor'
  const notes = file.notes.filter((n) => n.kind === 'nursing').sort((a, b) => b.at.localeCompare(a.at))
  const write = can('inpatient.care') && file.hospitalization.status === 'active'
  return (
    <div className="hc">
      {write && (
        <section className="panel" data-tour="nota-enfermeria">
          <div className="panel__head"><div><h2>Nueva nota de enfermería</h2><p>Se guarda con la fecha, la hora y tu nombre.</p></div>{text.trim() && <DraftBadge savedAt={draft.savedAt} restored={draft.restored} offline={draft.offline} />}</div>
          <div className="panel__body" style={{ display: 'grid', gap: 10 }}>
            <DictateField label="Nota de enfermería" onText={(f) => setText(f)}><textarea className="textarea" rows={3} value={text} onChange={(e) => setText(e.target.value)} aria-label="Nota de enfermería" placeholder="Estado del paciente, cuidados realizados, novedades del turno." /></DictateField>
            <button className="btn btn--primary self-start" disabled={text.trim().length < 3 || busy} onClick={async () => {
              setBusy(true)
              if (await addNursingNote(file.hospitalization.id, text.trim())) { setText(''); draft.clear(); reload() }
              setBusy(false)
            }}>Guardar nota</button>
          </div>
        </section>
      )}
      <section className="panel">
        {notes.length ? <div className="rows">{notes.map((n) => <NursingRow key={n.id} n={n} who={staffById(n.authorId)?.name} file={file} reload={reload}
          canAdd={file.hospitalization.status === 'active' && (nurse || (can('inpatient.orders') && user?.role === 'doctor'))} kinds={nurse ? undefined : ['info']} />)}</div>
          : <div className="empty">Sin notas de enfermería.</div>}
      </section>
    </div>
  )
}

export function NursingRow({ n, who, file, reload, canAdd, kinds }: { n: InpatientNote; who?: string; file: File; reload: () => void; canAdd: boolean; kinds?: Addendum['kind'][] }) {
  const count = (file.addenda ?? []).filter((a) => a.targetId === n.id).length
  // GE4 (ronda 9)
  const [correcting, setCorrecting] = useState(false)
  const [toAddendum, setToAddendum] = useState<string | undefined>()
  return (
    <div className="nnote">
      <div className="nnote__when"><b>{date(n.at, { day: 'numeric', month: 'short' })}</b><span>{time(n.at)}</span></div>
      <div><p>{n.text}</p><small className="muted">{who}{count > 0 && <span className="badge badge--amber ml-xs">Con adenda</span>}</small>
        <div className="signed-row">
          <VersionTag version={n.version} kind="note" id={n.id} render={(v) => <p>{String(v.text ?? '')}</p>} />
          <GraceButton record={n} authorId={n.authorId} onCorrect={() => setCorrecting(true)} />
        </div>
        <Addenda list={file.addenda ?? []} targetKind="note" targetId={n.id} canAdd={canAdd} kinds={kinds} onAdded={reload} openWith={toAddendum} /></div>
      {correcting && <TextCorrection n={n} onClose={() => setCorrecting(false)} onSaved={() => { setCorrecting(false); reload() }} onExpired={(t) => { setCorrecting(false); setToAddendum(t) }} />}
    </div>
  )
}

// ---------- Anexos ----------
