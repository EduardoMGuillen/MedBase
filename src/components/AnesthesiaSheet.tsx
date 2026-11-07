import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Camera, ClipboardList, Eye, PenLine, Printer, Replace } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { uploadLarge } from '../lib/files'
import { dmy, dmyTime } from '../lib/format'
import { Modal } from './ui'
import { Addenda } from './Addenda'
import { GraceButton } from './Grace'
import { useScanPicker } from '../app/ScanUpload'
import type { AnesthesiaSheet } from '../lib/anesthesia'
import type { Addendum, InpatientNote } from '../lib/types'
import './anesthesia.css'

/**
 * PQ3 (ronda 14): la hoja de anestesia de la nota postquirúrgica. Es un agregado: no es obligatoria, no cuenta en los avisos
 * del paciente ni bloquea el egreso. Ver, imprimir en blanco y subir en papel: médico, enfermería, el radiólogo que escribe
 * notas y, en el consultorio, la titular. Llenar y firmar en el sistema: solo el anestesiólogo de la nota con usuario. El
 * servidor lo vuelve a comprobar (también por URL directa).
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useAnesthesiaAccess() {
  const { can } = useStore()
  return can('chart.view') && (can('inpatient.orders') || can('inpatient.care') || can('inpatient.notes'))
}

const stayPath = (stayKind: string, stayId: string) => `/app/${stayKind === 'observation' ? 'observacion' : 'hospitalizados'}/${stayId}`
/** La nota en la estancia, con su tarjeta de la hoja a la vista. */
// eslint-disable-next-line react-refresh/only-export-components
export const anesthesiaNoteLink = (stayKind: string, stayId: string, noteId: string) => `${stayPath(stayKind, stayId)}?tab=notas&anestesia=${noteId}`

interface NoteInfo { noteId: string; hospitalizationId: string; stayKind: string; patientId: string; anesthesiologist: { name: string; staffId?: string } | null; canFill: boolean; sheets: AnesthesiaSheet[] }

/** «Subida por …» o «Firmada por …». */
function sheetLine(s: AnesthesiaSheet, who: (id: string) => string | undefined) {
  return s.mode === 'system' ? `Firmada por ${s.signer?.name ?? s.performedBy.name}, ${dmyTime(s.createdAt)}` : `Subida por ${who(s.createdBy) ?? '—'}, ${dmyTime(s.createdAt)}`
}

/** «Imprimir hoja de anestesia en blanco» (autorización quirúrgica y Anexos): la hoja del Anexo B con los datos que ya hay. */
export function BlankAnesthesiaButton({ stayId, authorizationId }: { stayId: string; authorizationId?: string }) {
  if (!useAnesthesiaAccess()) return null
  return <Link className="btn btn--ghost btn--sm anes-btn" to={`/app/anestesia/blanco/${stayId}?${authorizationId ? `autorizacion=${authorizationId}&` : ''}accion=imprimir`}>
    <Printer size={14} />Imprimir registro de anestesia en blanco</Link>
}

/** En la tarjeta de la nota postquirúrgica: «Hoja de anestesia · Sin agregar» o quién la subió o la firmó, con «Ver» e «Imprimir». */
export function AnesthesiaCard({ note }: { note: InpatientNote }) {
  const access = useAnesthesiaAccess()
  const { staffById, user, notify } = useStore()
  const nav = useNavigate()
  const [info, setInfo] = useState<NoteInfo | null>(null)
  const [addenda, setAddenda] = useState<Addendum[]>([])
  const [choosing, setChoosing] = useState(false)
  const [uploading, setUploading] = useState<null | { replaces?: AnesthesiaSheet }>(null)
  const [params] = useSearchParams()
  const ref = useRef<HTMLDivElement>(null)
  const focus = params.get('anestesia') === note.id
  const load = useCallback(() => {
    api<NoteInfo>(`/anesthesia/notes/${note.id}`).then(async (x) => {
      setInfo(x)
      const signed = x.sheets.filter((s) => s.mode === 'system').map((s) => s.id)
      setAddenda(signed.length ? await api<Addendum[]>(`/addenda?ids=${signed.join(',')}`).catch(() => []) : [])
    }).catch(() => setInfo(null))
  }, [note.id])
  useEffect(() => { if (access) load() }, [access, load])
  // Desde el pendiente de Inicio: la tarjeta de la hoja a la vista
  useEffect(() => { if (focus && info) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, [focus, info])
  if (!access || !info) return null
  const who = (id: string) => staffById(id)?.name
  const current = info.sheets.find((s) => !s.voidedAt)
  const old = info.sheets.filter((s) => s.voidedAt)
  const fill = () => nav(`/app/anestesia/nota/${note.id}`)
  return (
    <div ref={ref} className={`anes-card no-print${focus ? ' anes-card--focus' : ''}`} data-testid="anesthesia-card">
      <div className="anes-card__line">
        <ClipboardList size={16} />
        <span><b>Registro de anestesia</b> · {current ? sheetLine(current, who) : <span className="anes-card__none">Sin agregar</span>}</span>
      </div>
      {current && <p className="anes-card__meta">
        {current.mode === 'upload' ? `En papel · Anestesia realizada por ${current.performedBy.name}` : 'Llenada en el sistema'}
        {current.observation ? ` · ${current.observation}` : ''}{current.version > 1 ? ` · Corregida (v${current.version})` : ''}</p>}
      <div className="anes-card__acts">
        {!current && <button type="button" className="btn btn--soft btn--sm anes-btn" onClick={() => setChoosing(true)}><ClipboardList size={14} />Agregar registro de anestesia</button>}
        {current && <>
          <Link className="btn btn--ghost btn--sm anes-btn" to={`/app/anestesia/${current.id}`}><Eye size={14} />Ver</Link>
          <Link className="btn btn--ghost btn--sm anes-btn" to={`/app/anestesia/${current.id}?accion=imprimir`}><Printer size={14} />Imprimir</Link>
          {current.mode === 'upload' && <button type="button" className="btn btn--ghost btn--sm anes-btn" onClick={() => setUploading({ replaces: current })}><Replace size={14} />Reemplazar</button>}
          {current.mode === 'system' && <GraceButton record={current} authorId={current.createdBy} onCorrect={() => nav(`/app/anestesia/nota/${note.id}?corregir=${current.id}`)} />}
        </>}
      </div>
      {current?.mode === 'system' && <Addenda list={addenda} targetKind="anesthesia" targetId={current.id} canAdd={current.createdBy === user?.id} onAdded={load} />}
      {old.length > 0 && <details className="anes-card__old">
        <summary className="muted">Registros anteriores, anulados ({old.length})</summary>
        <ul>{old.map((s) => <li key={s.id}><Link to={`/app/anestesia/${s.id}`}>{sheetLine(s, who)}</Link> · anulada {s.voidedAt && dmyTime(s.voidedAt)} por {s.voidedBy ? who(s.voidedBy) : '—'}: {s.voidReason}</li>)}</ul>
      </details>}
      {choosing && (
        <Modal title="Agregar registro de anestesia" onClose={() => setChoosing(false)}>
          <div className="choice-grid">
            <button type="button" className="choice" onClick={() => { setChoosing(false); setUploading({}) }}><Camera size={22} /><b>Subir hoja en papel</b><small>Fotos o el PDF de la hoja que se llenó a mano en sala.</small></button>
            <button type="button" className="choice" disabled={!info.canFill} aria-disabled={!info.canFill} onClick={() => { if (info.canFill) fill() }}><PenLine size={22} /><b>Llenar en el sistema</b>
              <small>{info.canFill ? 'El formulario del registro, con lo que ya tiene la nota y la valoración preanestésica vigente. Lo firmas tú.' : `Solo la llena y la firma quien hizo la anestesia${info.anesthesiologist ? ` (${info.anesthesiologist.name})` : ''}, con su usuario. Si no tiene usuario, sube la hoja en papel.`}</small></button>
          </div>
        </Modal>
      )}
      {uploading && <AnesthesiaUpload info={info} replaces={uploading.replaces} onClose={() => setUploading(null)} onDone={() => { setUploading(null); notify(uploading.replaces ? 'Registro reemplazado; el anterior queda anulado' : 'Registro de anestesia subido'); load() }} />}
    </div>
  )
}

/** «Subir hoja en papel»: la subida de Anexos (fotos o PDF unidos en un PDF), con «Anestesia realizada por» y la observación. */
function AnesthesiaUpload({ info, replaces, onClose, onDone }: { info: NoteInfo; replaces?: AnesthesiaSheet; onClose: () => void; onDone: () => void }) {
  const { notify, staff } = useStore()
  const { files, preview, building, build, tooBig, ui } = useScanPicker()
  const start = replaces?.performedBy ?? info.anesthesiologist ?? { name: '' }
  const [by, setBy] = useState<{ name: string; staffId?: string }>(start)
  const [observation, setObservation] = useState('')
  const [reason, setReason] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const people = staff.filter((s) => s.active && s.role !== 'superadmin')
  const ok = !!preview && !tooBig && by.name.trim().length >= 3 && (!replaces || reason.trim().length >= 5) && progress === null
  const confirm = async () => {
    if (!preview || !ok) return
    setProgress(0)
    try {
      const att = await uploadLarge(info.patientId, preview.blob, { name: 'Hoja de anestesia.pdf', mime: 'application/pdf', category: 'document', title: 'Hoja de anestesia (papel)',
        takenAt: new Date().toISOString(), hospitalizationId: info.hospitalizationId }, setProgress)
      await api(`/anesthesia/notes/${info.noteId}/upload`, { body: { fileId: att.id, performedBy: { name: by.name.trim(), staffId: by.staffId }, observation: observation.trim() || undefined,
        replaces: replaces ? { sheetId: replaces.id, reason: reason.trim() } : undefined } })
      onDone()
    } catch (e) {
      notify((e as Error).message, 'error')
      setProgress(null)
    }
  }
  return (
    <Modal title={replaces ? 'Reemplazar el registro de anestesia' : 'Subir hoja en papel'} wide onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      {!preview
        ? <button className="btn btn--primary" disabled={!files.length || building} onClick={build}>{building ? 'Preparando…' : 'Ver vista previa'}</button>
        : <button className="btn btn--primary" disabled={!ok} onClick={confirm}>{progress !== null ? `Subiendo ${Math.round(progress * 100)} %` : 'Confirmar y guardar'}</button>}
    </>}>
      <p className="muted" style={{ fontSize: 14 }}>Toma una foto de cada página o elige el PDF del escáner. Todo se une en un solo documento, en este orden. Máximo 15 MB.
        {replaces ? ' La hoja anterior queda anulada y visible, con el motivo.' : ''}</p>
      {ui}
      <div className="form-grid">
        <label className="field"><span>Anestesia realizada por</span>
          <input className="input" list="anes-people" value={by.name} aria-required="true" placeholder="Elige o escribe el nombre"
            onChange={(e) => { const name = e.target.value; setBy({ name, staffId: people.find((x) => x.name === name)?.id }) }} />
          <datalist id="anes-people">{people.map((s) => <option key={s.id} value={s.name} />)}</datalist></label>
        <label className="field"><span>Observación (opcional)</span>
          <input className="input" value={observation} maxLength={1000} onChange={(e) => setObservation(e.target.value)} placeholder="Ej. La trajo la circulante" /></label>
        {replaces && <label className="field span-2"><span>Por qué se reemplaza</span>
          <input className="input" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="Ej. Faltaba la segunda página" /></label>}
      </div>
    </Modal>
  )
}

/** Anexos de la estancia: las hojas de anestesia (también las anuladas) y la hoja en blanco. */
export function AnesthesiaAnnex({ stayId }: { stayId: string }) {
  const access = useAnesthesiaAccess()
  const { staffById } = useStore()
  const [list, setList] = useState<AnesthesiaSheet[] | null>(null)
  useEffect(() => { if (access) api<AnesthesiaSheet[]>(`/inpatient/${stayId}/anesthesia`).then(setList).catch(() => setList([])) }, [access, stayId])
  if (!access) return null
  const who = (id: string) => staffById(id)?.name
  return (
    <section className="panel" data-testid="anesthesia-annex">
      <div className="panel__head">
        <div><h2>Registro de anestesia</h2><p>Se sube o se llena desde la tarjeta de cada nota postquirúrgica.</p></div>
        <BlankAnesthesiaButton stayId={stayId} />
      </div>
      {list && list.length > 0 && <div className="rows">{list.map((s) => (
        <div key={s.id} className="row anes-row">
          <div className="row__who"><strong>{s.procedure ?? 'Nota postquirúrgica'}{s.surgeryAt ? ` · ${dmy(s.surgeryAt)}` : ''}{s.voidedAt && <span className="badge badge--red" style={{ marginLeft: 6 }}>Anulada</span>}</strong>
            <span>{sheetLine(s, who)}{s.mode === 'upload' ? ` · Anestesia realizada por ${s.performedBy.name}` : ''}{s.voidedAt ? ` · Anulada: ${s.voidReason}` : ''}</span></div>
          <span className="anes-card__acts">
            <Link className="btn btn--ghost btn--sm anes-btn" to={`/app/anestesia/${s.id}`}><Eye size={14} />Ver</Link>
            {!s.voidedAt && <Link className="btn btn--ghost btn--sm anes-btn" to={`/app/anestesia/${s.id}?accion=imprimir`}><Printer size={14} />Imprimir</Link>}
          </span>
        </div>
      ))}</div>}
    </section>
  )
}

interface Pending { noteId: string; hospitalizationId: string; stayKind: string; patient: string; procedure: string; at: string }

/** Inicio del anestesiólogo con usuario: «Hoja de anestesia pendiente · paciente · cirugía · fecha», con un clic a la nota. */
export function AnesthesiaPending() {
  const [list, setList] = useState<Pending[]>([])
  useEffect(() => { api<Pending[]>('/anesthesia/pending').then(setList).catch(() => setList([])) }, [])
  if (!list.length) return null
  return (
    <section className="panel" data-testid="anesthesia-pending">
      <div className="panel__head"><div><h2>Registros de anestesia pendientes</h2><p>Figuras como anestesiólogo en estas notas postquirúrgicas. Súbelo en papel o llénalo en el sistema.</p></div></div>
      <div className="rows">{list.map((x) => (
        <Link key={x.noteId} className="row anes-row anes-row--link" to={anesthesiaNoteLink(x.stayKind, x.hospitalizationId, x.noteId)}>
          <div className="row__who"><strong>Registro de anestesia pendiente · {x.patient} · {x.procedure} · {dmy(x.at)}</strong><span>Abrir la nota</span></div>
        </Link>
      ))}</div>
    </section>
  )
}
