import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FilePlus2, PenLine } from 'lucide-react'
import { useStore } from '../lib/store'
import { Modal } from './ui'
import { useNow } from '../lib/hooks'
import { dateTime, shortStaff } from '../lib/format'
import { ADDENDUM_KIND, savedLabel } from '../lib/drafts'
import type { Addendum } from '../lib/types'

/** AN1: etiqueta del estado de una nota mientras se escribe: «Borrador · Guardado hace un momento». */
export function DraftBadge({ savedAt, restored, offline }: { savedAt: string | null; restored?: boolean; offline?: boolean }) {
  const now = useNow(15_000)
  return (
    <span className="draft-badge" role="status">
      <b>Borrador</b>{offline ? ' · Sin conexión: se guarda en este equipo' : savedAt ? ` · ${savedLabel(savedAt, now)}` : restored ? ' · Recuperado' : ' · Se guarda solo'}
    </span>
  )
}

/** AN1: «Firmada por la Dra. Herrera el 30/10/2026 14:20», y «Con adenda» si tiene. */
export function SignedBadge({ by, at, addenda = 0 }: { by?: string; at: string; addenda?: number }) {
  return (
    <span className="signed-badge"><PenLine size={13} />Firmada{by ? ` por ${shortStaff(by)}` : ''} el {dateTime(at)}{addenda > 0 && <span className="badge badge--amber" style={{ marginLeft: 6 }}>Con adenda</span>}</span>
  )
}

/**
 * Adendas de una nota firmada, debajo de ella y en orden. El texto original nunca cambia; cada adenda lleva su tipo,
 * quién la escribió y cuándo. `kinds` limita los tipos (un médico sólo agrega «Información adicional» a una nota de
 * enfermería). Si se corrige un medicamento y hubo receta, se sugiere anularla y emitir otra.
 */
export function Addenda({ list, targetKind, targetId, canAdd, kinds = ['correction', 'info', 'result'], prescriptionId, onAdded }: {
  list: Addendum[]; targetKind: Addendum['targetKind']; targetId: string; canAdd: boolean; kinds?: Addendum['kind'][]; prescriptionId?: string; onAdded: () => void
}) {
  const { staffById } = useStore()
  const [adding, setAdding] = useState(false)
  const mine = list.filter((a) => a.targetId === targetId)
  if (!mine.length && !canAdd) return null
  return (
    <div className="addenda">
      {mine.map((a, i) => (
        <section key={a.id} className={`addendum addendum--${a.kind}`}>
          <h5>Adenda {i + 1} · {ADDENDUM_KIND[a.kind]} · {staffById(a.authorId)?.name ?? '—'} · {dateTime(a.at)}</h5>
          {a.corrects && <p className="addendum__corrects">Se corrige: {a.corrects}</p>}
          <p className="addendum__text">{a.text}</p>
        </section>
      ))}
      {canAdd && <button type="button" className="btn btn--ghost btn--sm no-print" data-tour="adenda" onClick={() => setAdding(true)}><FilePlus2 size={14} />Agregar adenda</button>}
      {adding && <AddAddendum targetKind={targetKind} targetId={targetId} kinds={kinds} prescriptionId={prescriptionId} onClose={() => setAdding(false)} onDone={() => { setAdding(false); onAdded() }} />}
    </div>
  )
}

function AddAddendum({ targetKind, targetId, kinds, prescriptionId, onClose, onDone }: {
  targetKind: Addendum['targetKind']; targetId: string; kinds: Addendum['kind'][]; prescriptionId?: string; onClose: () => void; onDone: () => void
}) {
  const { addAddendum } = useStore()
  const [kind, setKind] = useState<Addendum['kind']>(kinds[0])
  const [corrects, setCorrects] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const valid = text.trim().length >= 3 && (kind !== 'correction' || corrects.trim().length >= 3)
  const aboutRx = kind === 'correction' && !!prescriptionId && /dosis|medicament|receta|mg|tableta|c[aá]psula|jarabe|frecuencia|cada \d/i.test(`${corrects} ${text}`)
  return (
    <Modal title="Agregar adenda" onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!valid || busy} onClick={async () => {
        setBusy(true)
        const r = await addAddendum({ targetKind, targetId, kind, corrects: kind === 'correction' ? corrects.trim() : undefined, text: text.trim() })
        setBusy(false)
        if (r) onDone()
      }}>Firmar adenda</button>
    </>}>
      <p className="muted" style={{ fontSize: 14 }}>La nota firmada no cambia. La adenda queda debajo, con tu nombre, la fecha y la hora, y tampoco se puede editar después.</p>
      {kinds.length > 1 && <div className="segmented" role="radiogroup" aria-label="Tipo de adenda">
        {kinds.map((k) => <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}>{ADDENDUM_KIND[k]}</button>)}
      </div>}
      {kind === 'correction' && <label className="field"><span>Qué se corrige</span><input className="input" value={corrects} onChange={(e) => setCorrects(e.target.value)} maxLength={200} placeholder="Ej. Dosis de amoxicilina mal escrita" /></label>}
      <label className="field"><span>Texto de la adenda</span><textarea className="textarea" rows={5} value={text} onChange={(e) => setText(e.target.value)} autoFocus /></label>
      {aboutRx && <div className="alert-strip alert-strip--amber" style={{ flexWrap: 'wrap' }}>La adenda no cambia la receta ya emitida. Si el error está en la receta, anúlala y emite una nueva.
        <Link className="btn btn--soft btn--sm" to={`/app/recetas/${prescriptionId}`}>Abrir la receta</Link></div>}
    </Modal>
  )
}
