import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Camera, Eye, ListChecks, PenLine, Printer, Replace } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { dmy, dmyTime } from '../lib/format'
import { Modal } from './ui'
import { Addenda } from './Addenda'
import { GraceButton } from './Grace'
import { SurgicalDocUpload } from './SurgicalDocUpload'
import { useAnesthesiaAccess } from './AnesthesiaSheet'
import { anyIncorrect, type SurgicalCount } from '../lib/surgicalCount'
import type { Addendum, InpatientNote } from '../lib/types'
import './anesthesia.css'

/**
 * PQ5 (ronda 16): «Recuento quirúrgico» de la nota postquirúrgica, con el patrón de la hoja de anestesia: tarjeta «Sin agregar»
 * en la nota, también en Anexos; llenarlo en el sistema o imprimirlo en blanco y subir la foto. Lo llenan o suben el médico,
 * enfermería y quien entró a la cirugía con usuario (el servidor lo comprueba). Opcional: no genera avisos ni bloquea el egreso.
 */
interface NoteCounts { noteId: string; hospitalizationId: string; stayKind: string; patientId: string; counts: SurgicalCount[] }

const countLine = (c: SurgicalCount, who: (id: string) => string | undefined) => c.mode === 'system'
  ? `Firmado por ${c.signer?.name ?? who(c.createdBy) ?? '—'}, ${dmyTime(c.createdAt)}`
  : `Subido por ${who(c.createdBy) ?? '—'}, ${dmyTime(c.createdAt)}`
const resultText = (c: SurgicalCount) => c.data ? (anyIncorrect(c.data) ? `Con un resultado incorrecto${c.data.incorrect.found ? ` · Se encontró: ${c.data.incorrect.found}` : ''}` : 'Resultados correctos') + (c.data.confirmed ? ' · Confirmado en voz alta' : '') : ''

/** En la tarjeta de la nota postquirúrgica, debajo de la hoja de anestesia. */
export function SurgicalCountCard({ note }: { note: InpatientNote }) {
  const access = useAnesthesiaAccess()
  const { staffById, user, notify } = useStore()
  const nav = useNavigate()
  const [info, setInfo] = useState<NoteCounts | null>(null)
  const [addenda, setAddenda] = useState<Addendum[]>([])
  const [choosing, setChoosing] = useState(false)
  const [uploading, setUploading] = useState<null | { replaces?: SurgicalCount }>(null)
  const load = useCallback(() => {
    api<NoteCounts>(`/surgical-count/notes/${note.id}`).then(async (x) => {
      setInfo(x)
      const signed = x.counts.filter((c) => c.mode === 'system' && !c.voidedAt).map((c) => c.id)
      setAddenda(signed.length ? await api<Addendum[]>(`/addenda?ids=${signed.join(',')}`).catch(() => []) : [])
    }).catch(() => setInfo(null))
  }, [note.id])
  useEffect(() => { if (access) load() }, [access, load])
  if (!access || !info) return null
  const who = (id: string) => staffById(id)?.name
  const current = info.counts.find((c) => !c.voidedAt)
  const old = info.counts.filter((c) => c.voidedAt)
  return (
    <div className="anes-card no-print" data-testid="surgical-count-card">
      <div className="anes-card__line">
        <ListChecks size={16} />
        <span><b>Recuento quirúrgico</b> · {current ? countLine(current, who) : <span className="anes-card__none">Sin agregar</span>}</span>
      </div>
      {current && <p className="anes-card__meta">{current.mode === 'upload' ? 'En papel' : `Llenado en el sistema · ${resultText(current)}`}
        {current.observation ? ` · ${current.observation}` : ''}{current.version > 1 ? ` · Corregido (v${current.version})` : ''}</p>}
      <div className="anes-card__acts">
        {!current && <button type="button" className="btn btn--soft btn--sm anes-btn" onClick={() => setChoosing(true)}><ListChecks size={14} />Agregar recuento quirúrgico</button>}
        {current && <>
          <Link className="btn btn--ghost btn--sm anes-btn" to={`/app/recuento/${current.id}`}><Eye size={14} />Ver</Link>
          <Link className="btn btn--ghost btn--sm anes-btn" to={`/app/recuento/${current.id}?accion=imprimir`}><Printer size={14} />Imprimir</Link>
          {current.mode === 'upload' && <button type="button" className="btn btn--ghost btn--sm anes-btn" onClick={() => setUploading({ replaces: current })}><Replace size={14} />Reemplazar</button>}
          {current.mode === 'system' && <GraceButton record={current} authorId={current.createdBy} onCorrect={() => nav(`/app/recuento/nota/${note.id}?corregir=${current.id}`)} />}
        </>}
      </div>
      {current?.mode === 'system' && <Addenda list={addenda} targetKind="surgical_count" targetId={current.id} canAdd={current.createdBy === user?.id} onAdded={load} />}
      {old.length > 0 && <details className="anes-card__old">
        <summary className="muted">Recuentos anteriores, anulados ({old.length})</summary>
        <ul>{old.map((c) => <li key={c.id}><Link to={`/app/recuento/${c.id}`}>{countLine(c, who)}</Link> · anulado {c.voidedAt && dmyTime(c.voidedAt)} por {c.voidedBy ? who(c.voidedBy) : '—'}: {c.voidReason}</li>)}</ul>
      </details>}
      {choosing && (
        <Modal title="Agregar recuento quirúrgico" onClose={() => setChoosing(false)}>
          <div className="choice-grid">
            <button type="button" className="choice" onClick={() => nav(`/app/recuento/nota/${note.id}`)}><PenLine size={22} /><b>Llenar en el sistema</b><small>Compresas, gasas, agujas e instrumental en cada momento del recuento. Lo firmas tú.</small></button>
            <button type="button" className="choice" onClick={() => { setChoosing(false); setUploading({}) }}><Camera size={22} /><b>Subir hoja en papel</b><small>Fotos o el PDF del recuento que se llenó a mano en sala.</small></button>
            <button type="button" className="choice" onClick={() => nav(`/app/recuento/blanco/${info.hospitalizationId}?nota=${note.id}&accion=imprimir`)}><Printer size={22} /><b>Imprimir en blanco</b><small>Una hoja Carta con el paciente y el equipo de esta cirugía.</small></button>
          </div>
        </Modal>
      )}
      {uploading && <SurgicalDocUpload title={uploading.replaces ? 'Reemplazar el recuento quirúrgico' : 'Subir el recuento quirúrgico en papel'} docName="Recuento quirúrgico" patientId={info.patientId} stayId={info.hospitalizationId}
        endpoint={`/surgical-count/notes/${note.id}/upload`} replaces={uploading.replaces ? { id: uploading.replaces.id } : undefined}
        onClose={() => setUploading(null)} onDone={() => { setUploading(null); notify(uploading.replaces ? 'Recuento reemplazado; el anterior queda anulado' : 'Recuento quirúrgico subido'); load() }} />}
    </div>
  )
}

/** Anexos de la estancia: los recuentos (también los anulados) y la hoja en blanco. */
export function SurgicalCountAnnex({ stayId }: { stayId: string }) {
  const access = useAnesthesiaAccess()
  const { staffById } = useStore()
  const [list, setList] = useState<SurgicalCount[] | null>(null)
  useEffect(() => { if (access) api<SurgicalCount[]>(`/inpatient/${stayId}/surgical-counts`).then(setList).catch(() => setList([])) }, [access, stayId])
  if (!access) return null
  const who = (id: string) => staffById(id)?.name
  return (
    <section className="panel" data-testid="surgical-count-annex">
      <div className="panel__head">
        <div><h2>Recuento quirúrgico</h2><p>Se llena o se sube desde la tarjeta de cada nota postquirúrgica.</p></div>
        <Link className="btn btn--ghost btn--sm anes-btn" to={`/app/recuento/blanco/${stayId}?accion=imprimir`}><Printer size={14} />Imprimir recuento en blanco</Link>
      </div>
      {list && list.length > 0 && <div className="rows">{list.map((c) => (
        <div key={c.id} className="row anes-row">
          <div className="row__who"><strong>{c.procedure ?? 'Nota postquirúrgica'}{c.surgeryAt ? ` · ${dmy(c.surgeryAt)}` : ''}{c.voidedAt && <span className="badge badge--red ml-xs">Anulado</span>}</strong>
            <span>{countLine(c, who)}{c.mode === 'system' ? ` · ${resultText(c)}` : ' · En papel'}{c.voidedAt ? ` · Anulado: ${c.voidReason}` : ''}</span></div>
          <span className="anes-card__acts">
            <Link className="btn btn--ghost btn--sm anes-btn" to={`/app/recuento/${c.id}`}><Eye size={14} />Ver</Link>
            {!c.voidedAt && <Link className="btn btn--ghost btn--sm anes-btn" to={`/app/recuento/${c.id}?accion=imprimir`}><Printer size={14} />Imprimir</Link>}
          </span>
        </div>
      ))}</div>}
    </section>
  )
}
