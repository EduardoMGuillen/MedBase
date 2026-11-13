import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Camera, ClipboardCheck, Eye, PenLine, Printer, Replace } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { dmyTime } from '../lib/format'
import { Modal } from './ui'
import { Addenda } from './Addenda'
import { GraceButton } from './Grace'
import { SurgicalDocUpload } from './SurgicalDocUpload'
import { useAnesthesiaAccess } from './AnesthesiaSheet'
import { labLine, preEvalLine, type PreEval } from '../lib/preanesthesia'
import type { Addendum } from '../lib/types'
import './anesthesia.css'

/**
 * PQ4 (ronda 16): «Valoración preanestésica», ligada a la estancia, antes de la cirugía. Escribir y firmar en el sistema:
 * cualquier médico. Subir en papel e imprimir en blanco: médico y enfermería. El servidor lo vuelve a comprobar.
 */

interface StayEvals { evals: PreEval[]; canWrite: boolean; open: boolean; stayKind: string; patientId: string }
/** La vigente: la última firmada o subida sin anular. */
const currentOf = (list: PreEval[]) => [...list].reverse().find((e) => !e.voidedAt)
const evalLine = (e: PreEval, who: (id: string) => string | undefined) => e.mode === 'system'
  ? `Firmada por ${e.signer?.name ?? e.performedBy.name}, ${dmyTime(e.createdAt)}`
  : `Subida por ${who(e.createdBy) ?? '—'}, ${dmyTime(e.createdAt)} · Valoración de ${e.performedBy.name}`

/**
 * El botón «Valoración preanestésica» (Notas de evolución, tarjeta de la autorización quirúrgica y Anexos): escribirla en el
 * sistema, subirla en papel o imprimirla en blanco.
 */
export function PreEvalButton(props: { stayId: string; patientId: string; authorizationId?: string; small?: boolean; onChanged?: () => void }) {
  const pre = usePreEval(props)
  const { can } = useStore()
  if (!pre.available) return null
  const { small } = props
  return <>
    <button type="button" className={`btn ${small ? 'btn--ghost btn--sm anes-btn' : can('inpatient.orders') ? 'btn--primary' : 'btn--soft'}`} onClick={pre.open} data-testid="preeval-button">
      <ClipboardCheck size={small ? 14 : 16} />Valoración preanestésica</button>
    {pre.ui}
  </>
}

/** R18-OB1 (ronda 18): lo mismo sin el botón, para la fila de acciones (que puede mandarlo a «Más acciones»). */
export function usePreEval({ stayId, patientId, authorizationId, onChanged }: { stayId: string; patientId: string; authorizationId?: string; onChanged?: () => void }) {
  const access = useAnesthesiaAccess()
  const { can, user, notify } = useStore()
  const nav = useNavigate()
  const [choosing, setChoosing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const doctor = can('inpatient.orders')
  const q = authorizationId ? `autorizacion=${authorizationId}` : ''
  const ui = <>
    {choosing && (
      <Modal title="Valoración preanestésica" onClose={() => setChoosing(false)}>
        <p className="c-muted mt-0 fs-base">Se hace antes de la cirugía. Puede haber más de una (si se reprograma); la vigente es la última.</p>
        <div className="choice-grid">
          <button type="button" className="choice" disabled={!doctor} aria-disabled={!doctor} onClick={() => { if (doctor) nav(`/app/valoracion/nueva/${stayId}${q ? `?${q}` : ''}`) }}>
            <PenLine size={22} /><b>Escribir en el sistema</b>
            <small>{doctor ? 'Con los datos que ya hay (autorización, peso, alergias, laboratorios). La firmas tú como anestesiólogo.' : 'La escribe y la firma un médico, con su usuario.'}</small></button>
          <button type="button" className="choice" onClick={() => { setChoosing(false); setUploading(true) }}><Camera size={22} /><b>Subir en papel</b><small>Fotos o el PDF de la valoración firmada en papel.</small></button>
          <button type="button" className="choice" onClick={() => nav(`/app/valoracion/blanco/${stayId}?${q ? `${q}&` : ''}accion=imprimir`)}><Printer size={22} /><b>Imprimir en blanco</b><small>Una hoja Carta para llenarla a mano.</small></button>
        </div>
      </Modal>
    )}
    {uploading && <SurgicalDocUpload title="Subir la valoración preanestésica en papel" docName="Valoración preanestésica" patientId={patientId} stayId={stayId}
      endpoint={`/inpatient/${stayId}/preanesthesia/upload`} extra={authorizationId ? { authorizationId } : undefined}
      performed={{ label: 'Valoración realizada por', start: doctor && user ? { name: user.name, staffId: user.id } : { name: '' } }}
      onClose={() => setUploading(false)} onDone={() => { setUploading(false); notify('Valoración preanestésica subida'); onChanged?.() }} />}
  </>
  return { available: !!access, open: () => setChoosing(true), ui }
}

/** Anexos de la estancia: las valoraciones (la vigente marcada; también las anuladas), con ver, imprimir, corregir o reemplazar. */
export function PreEvalAnnex({ stayId }: { stayId: string }) {
  const access = useAnesthesiaAccess()
  const { staffById, user, notify } = useStore()
  const nav = useNavigate()
  const [x, setX] = useState<StayEvals | null>(null)
  const [addenda, setAddenda] = useState<Addendum[]>([])
  const [replacing, setReplacing] = useState<PreEval | null>(null)
  const load = useCallback(() => {
    api<StayEvals>(`/inpatient/${stayId}/preanesthesia`).then(async (r) => {
      setX(r)
      const signed = r.evals.filter((e) => e.mode === 'system' && !e.voidedAt).map((e) => e.id)
      setAddenda(signed.length ? await api<Addendum[]>(`/addenda?ids=${signed.join(',')}`).catch(() => []) : [])
    }).catch(() => setX(null))
  }, [stayId])
  useEffect(() => { if (access) load() }, [access, load])
  if (!access || !x) return null
  const who = (id: string) => staffById(id)?.name
  const current = currentOf(x.evals)
  return (
    <section className="panel" data-testid="preeval-annex">
      <div className="panel__head">
        <div><h2>Valoración preanestésica</h2><p>Antes de la cirugía. La vigente es la última; el registro de anestesia la trae resumida.</p></div>
        {x.open && <PreEvalButton stayId={stayId} patientId={x.patientId} small onChanged={load} />}
      </div>
      {x.evals.length > 0 ? <div className="rows">{[...x.evals].reverse().map((e) => (
        <div key={e.id} className="row anes-row">
          <div className="row__who"><strong>{e.mode === 'system' ? 'En el sistema' : 'En papel'}
            {e.id === current?.id && <span className="badge badge--mint ml-xs">Vigente</span>}
            {e.voidedAt && <span className="badge badge--red ml-xs">Anulada</span>}
            {e.version > 1 && <span className="badge ml-xs">Corregida (v{e.version})</span>}</strong>
            <span>{evalLine(e, who)}{e.data ? ` · ${[e.data.proposedSurgery, preEvalLine(e.data)].filter(Boolean).join(' · ')}` : ''}{e.observation ? ` · ${e.observation}` : ''}{e.voidedAt ? ` · Anulada: ${e.voidReason}` : ''}</span>
            {e.mode === 'system' && !e.voidedAt && <Addenda list={addenda} targetKind="preanesthesia" targetId={e.id} canAdd={e.createdBy === user?.id} onAdded={load} />}
          </div>
          <span className="anes-card__acts">
            <Link className="btn btn--ghost btn--sm anes-btn" to={`/app/valoracion/${e.id}`}><Eye size={14} />Ver</Link>
            {!e.voidedAt && <Link className="btn btn--ghost btn--sm anes-btn" to={`/app/valoracion/${e.id}?accion=imprimir`}><Printer size={14} />Imprimir</Link>}
            {!e.voidedAt && e.mode === 'upload' && <button type="button" className="btn btn--ghost btn--sm anes-btn" onClick={() => setReplacing(e)}><Replace size={14} />Reemplazar</button>}
            {!e.voidedAt && e.mode === 'system' && <GraceButton record={e} authorId={e.createdBy} onCorrect={() => nav(`/app/valoracion/nueva/${stayId}?corregir=${e.id}`)} />}
          </span>
        </div>
      ))}</div> : <div className="empty">Sin valoración preanestésica.</div>}
      {replacing && <SurgicalDocUpload title="Reemplazar la valoración preanestésica" docName="Valoración preanestésica" patientId={x.patientId} stayId={stayId}
        endpoint={`/inpatient/${stayId}/preanesthesia/upload`} replaces={{ id: replacing.id }} performed={{ label: 'Valoración realizada por', start: replacing.performedBy }}
        onClose={() => setReplacing(null)} onDone={() => { setReplacing(null); notify('Valoración reemplazada; la anterior queda anulada'); load() }} />}
    </section>
  )
}

/** En el registro de anestesia: la valoración vigente de solo lectura (ASA, Mallampati, VAD, ayuno, laboratorios) y «Ver valoración». */
export function PreEvalSummary({ pe }: { pe: PreEval }) {
  return (
    <div className="preeval-sum" data-testid="preeval-summary">
      <p className="m-0"><b>{pe.mode === 'system' ? `Firmada por ${pe.signer?.name ?? pe.performedBy.name}` : `En papel · Valoración de ${pe.performedBy.name}`}</b>, {dmyTime(pe.createdAt)}</p>
      {pe.data ? <>
        <p className="m-0">{preEvalLine(pe.data) || 'Sin ASA ni vía aérea anotados.'}</p>
        {pe.data.allergies && <p className="m-0">Alergias: {pe.data.allergies}</p>}
        {labLine(pe.data.labs) && <p className="m-0">{labLine(pe.data.labs)}</p>}
        {pe.data.techniques.length > 0 && <p className="m-0">Técnica propuesta: {pe.data.techniques.join(', ')}</p>}
      </> : <p className="c-muted m-0">Los datos están en la hoja en papel.</p>}
      <p className="c-muted m-0 fs-md">De solo lectura: si algo cambió, corrige la valoración o escribe una nueva antes de firmar el registro.</p>
      <Link className="btn btn--ghost btn--sm anes-btn self-start" to={`/app/valoracion/${pe.id}`} target="_blank"><Eye size={14} />Ver valoración</Link>
    </div>
  )
}
