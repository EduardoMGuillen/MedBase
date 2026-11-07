import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { FileSignature, Plus, Trash2 } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { BackButton, Loading, PageHead } from '../components/ui'
import { DraftBadge } from '../components/Addenda'
import { CorrectionReason } from '../components/Grace'
import { DateField, TimeField } from '../components/DateTimeField'
import { DocError } from '../components/SurgicalPrint'
import { anesthesiaNoteLink } from '../components/AnesthesiaSheet'
import { useDraftSync } from '../lib/drafts'
import { SURGICAL_COUNT } from '../lib/clinicalConfig'
import type { AnesthesiaPrefill } from '../lib/anesthesia'
import { anyIncorrect, blankCount, blankCountRow, countMissing, instrumentCounts, isOther, prefillCount, sameCount, type CountRow, type SurgicalCount, type SurgicalCountData } from '../lib/surgicalCount'
import { Box, Radio, Section, Txt } from './AnesthesiaForm'
import '../components/anesthesia.css'

/**
 * PQ5 (ronda 16): «Recuento quirúrgico» llenado en el sistema. Encabezado lleno desde la nota postquirúrgica; la tabla con los
 * momentos de recuento de AORN; cambio de personal; si algún resultado es «Incorrecto», las casillas de búsqueda y la nota
 * obligatoria; la confirmación final. Borrador «Se guarda solo». Con `?corregir=`, la corrección en el periodo de gracia.
 */
const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`)

export default function SurgicalCountFormPage() {
  const { noteId } = useParams()
  const [params] = useSearchParams()
  const correcting = params.get('corregir')
  const nav = useNavigate()
  const { notify, user } = useStore()
  const [ctx, setCtx] = useState<{ prefill: AnesthesiaPrefill; hospitalizationId: string; stayKind: string; count?: SurgicalCount } | null>(null)
  const [error, setError] = useState('')
  const [d, setD] = useState<SurgicalCountData>(blankCount)
  const [initial, setInitial] = useState<SurgicalCountData | null>(null)
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    type Ctx = { prefill: AnesthesiaPrefill; hospitalizationId: string; stayKind: string; count?: SurgicalCount }
    const load: Promise<Ctx> = correcting
      ? api<{ count: SurgicalCount; stayKind: string; prefill: AnesthesiaPrefill }>(`/surgical-counts/${correcting}`).then((r) => ({ prefill: r.prefill, hospitalizationId: r.count.hospitalizationId, stayKind: r.stayKind, count: r.count }))
      : api<Ctx>(`/surgical-count/notes/${noteId}/prefill`)
    load.then((r) => {
      const start = r.count?.data ?? prefillCount(r.prefill)
      setInitial(start)
      setD((cur) => (sameCount(cur, blankCount()) ? start : cur))
      setCtx(r)
    }).catch((e: Error) => setError(e.message))
  }, [noteId, correcting])
  const draft = useDraftSync('recuento', ctx ? (correcting ? `${noteId}:corregir:${correcting}` : noteId) : undefined, { d }, (x) => { if (x.d) setD({ ...blankCount(), ...x.d }) }, !initial || sameCount(d, initial))
  if (error) return <DocError title="No puedes llenar este recuento." error={error} />
  if (!ctx || !user) return <Loading label="Abriendo el recuento quirúrgico" />
  const set = (patch: Partial<SurgicalCountData>) => setD((x) => ({ ...x, ...patch }))
  const setRow = (i: number, patch: Partial<CountRow>) => setD((x) => ({ ...x, rows: x.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) }))
  const setHandoff = (i: number, patch: Partial<SurgicalCountData['handoffs'][number]>) => setD((x) => ({ ...x, handoffs: x.handoffs.map((h, j) => (j === i ? { ...h, ...patch } : h)) }))
  const p = ctx.prefill.patient
  const back = anesthesiaNoteLink(ctx.stayKind, ctx.hospitalizationId, noteId ?? '')
  const missing = countMissing(d)
  const wrong = anyIncorrect(d)
  const others = d.rows.filter(isOther).length
  const ready = !missing.length && !busy
  const submit = async () => {
    if (!ready) return
    setBusy(true)
    try {
      if (correcting && ctx.count) await api(`/surgical-counts/${correcting}/correct`, { body: { data: d, version: ctx.count.version, why: why.trim() || undefined } })
      else await api(`/surgical-count/notes/${noteId}/sign`, { body: { data: d } })
      draft.clear()
      notify(correcting ? 'Recuento quirúrgico corregido' : 'Recuento quirúrgico firmado')
      nav(back)
    } catch (e) {
      notify((e as Error).message, 'error')
      setBusy(false)
    }
  }
  return (
    <div className="page">
      <PageHead back={<BackButton to={back}>Volver a la nota</BackButton>}
        title={correcting ? 'Corregir el recuento quirúrgico' : 'Recuento quirúrgico'}
        sub={`${`${p.firstName} ${p.lastName}`.trim()} · Expediente ${p.record}${d.procedure ? ` · ${d.procedure}` : ''}`} />
      <div className="anes-form">
        <p className="muted" style={{ margin: 0 }}>Se guarda solo mientras escribes. Escribe lo contado en cada momento. El instrumental se cuenta al inicio, antes de cerrar herida y en el cambio de personal; sus demás casillas pueden quedar en blanco.</p>
        <Section title="Encabezado">
          <div className="form-grid form-grid--3">
            <label className="field"><span>Fecha</span><DateField value={d.date} onChange={(v) => set({ date: v })} label="Fecha" /></label>
            <Txt label="Procedimiento" value={d.procedure} onChange={(v) => set({ procedure: v })} wide />
            <Txt label="Cirujano" value={d.surgeon} onChange={(v) => set({ surgeon: v })} />
            <Txt label="Instrumentista" value={d.scrubNurse} onChange={(v) => set({ scrubNurse: v })} />
            <Txt label="Circulante" value={d.circulatingNurse} onChange={(v) => set({ circulatingNurse: v })} />
          </div>
        </Section>
        <Section title="Recuento">
          <table className="anes-table count-table">
            <thead><tr><th>Material</th>{SURGICAL_COUNT.columns.map((c) => <th key={c.key}>{c.label}</th>)}<th>Resultado</th><th /></tr></thead>
            <tbody>{d.rows.map((r, i) => <tr key={r.key}>
              <td data-label="Material" className="anes-table__wide">{isOther(r)
                ? <input className="input" value={r.label} maxLength={80} placeholder="Otros: ¿qué?" onChange={(e) => setRow(i, { label: e.target.value })} aria-label={`Nombre de la fila ${i + 1}`} />
                : <b>{r.label}</b>}</td>
              {SURGICAL_COUNT.columns.map((c) => {
                const optional = r.key === 'instruments' && !instrumentCounts(c.key)
                return <td key={c.key} data-label={c.label} className={optional ? 'count-table__opt' : undefined}>
                  <input className="input num" inputMode="numeric" value={r.cells[c.key]} maxLength={20} placeholder={optional ? '—' : undefined}
                    onChange={(e) => setRow(i, { cells: { ...r.cells, [c.key]: e.target.value } })} aria-label={`${r.label || 'Otros'}: ${c.label}`} /></td>
              })}
              <td data-label="Resultado" className="anes-table__wide"><select className={`select${r.result === 'Incorrecto' ? ' count-table__bad' : ''}`} value={r.result} onChange={(e) => setRow(i, { result: e.target.value })} aria-label={`Resultado de ${r.label || 'Otros'}`}>
                <option value="">Elige…</option>{SURGICAL_COUNT.results.map((x) => <option key={x}>{x}</option>)}</select></td>
              <td className="anes-table__x">{isOther(r) && <button type="button" className="btn btn--ghost btn--sm anes-btn" aria-label={`Quitar la fila ${i + 1}`} onClick={() => set({ rows: d.rows.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>}</td>
            </tr>)}</tbody>
          </table>
          {others < SURGICAL_COUNT.maxOther && <button type="button" className="btn btn--soft btn--sm anes-btn" style={{ justifySelf: 'start' }} onClick={() => set({ rows: [...d.rows, blankCountRow(`other:${newId()}`, '')] })}><Plus size={14} />Agregar fila «{SURGICAL_COUNT.otherLabel}»</button>}
        </Section>
        <Section title="Cambio de personal">
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>Un recuento cada vez que se releva la instrumentista o la circulante.</p>
          {d.handoffs.length > 0 && <table className="anes-table">
            <thead><tr><th>Hora</th><th>Quién se releva</th><th>Entrega</th><th>Recibe</th><th>Recuento</th><th /></tr></thead>
            <tbody>{d.handoffs.map((h, i) => <tr key={h.id}>
              <td data-label="Hora" className="anes-table__wide"><TimeField value={h.time} onChange={(v) => setHandoff(i, { time: v })} label={`Hora del cambio ${i + 1}`} /></td>
              <td data-label="Quién se releva"><select className="select" value={h.role} onChange={(e) => setHandoff(i, { role: e.target.value })} aria-label={`Quién se releva en el cambio ${i + 1}`}>
                <option value="">Elige…</option>{SURGICAL_COUNT.handoffRoles.map((x) => <option key={x}>{x}</option>)}</select></td>
              <td data-label="Entrega"><input className="input" value={h.from} maxLength={120} onChange={(e) => setHandoff(i, { from: e.target.value })} aria-label={`Quién entrega en el cambio ${i + 1}`} /></td>
              <td data-label="Recibe"><input className="input" value={h.to} maxLength={120} onChange={(e) => setHandoff(i, { to: e.target.value })} aria-label={`Quién recibe en el cambio ${i + 1}`} /></td>
              <td data-label="Recuento" className="anes-table__wide"><input className="input" value={h.count} maxLength={200} placeholder="Ej. Completo: 20 compresas, 30 gasas…" onChange={(e) => setHandoff(i, { count: e.target.value })} aria-label={`Recuento del cambio ${i + 1}`} /></td>
              <td className="anes-table__x"><button type="button" className="btn btn--ghost btn--sm anes-btn" aria-label={`Quitar el cambio ${i + 1}`} onClick={() => set({ handoffs: d.handoffs.filter((_, j) => j !== i) })}><Trash2 size={14} /></button></td>
            </tr>)}</tbody></table>}
          {d.handoffs.length < SURGICAL_COUNT.maxHandoffs && <button type="button" className="btn btn--soft btn--sm anes-btn" style={{ justifySelf: 'start' }}
            onClick={() => set({ handoffs: [...d.handoffs, { id: newId(), time: '', role: '', from: '', to: '', count: '' }] })}><Plus size={14} />Agregar cambio de personal</button>}
        </Section>
        {wrong && <Section title="Resultado incorrecto">
          <p className="field__msg field__msg--warn" style={{ margin: 0 }}>Hay un resultado «Incorrecto»: responde cada casilla y escribe la nota.</p>
          {SURGICAL_COUNT.searches.map((x) => <Radio key={x.key} label={x.label} options={['Sí', 'No']} value={d.incorrect[x.key]} onChange={(v) => set({ incorrect: { ...d.incorrect, [x.key]: v } })} />)}
          <Txt label="Nota (obligatoria)" value={d.incorrect.note} onChange={(v) => set({ incorrect: { ...d.incorrect, note: v } })} area placeholder="Qué faltaba, qué se hizo y qué se encontró" />
        </Section>}
        <Section title="Confirmación y firmas">
          <div className="anes-opts"><Box label={SURGICAL_COUNT.confirmation} checked={d.confirmed} onChange={(v) => set({ confirmed: v })} /></div>
          <p style={{ margin: 0 }}>Lo firmas tú: <b>{user.name}</b>, con la fecha y la hora. Instrumentista, circulante y cirujano firman en papel en el impreso.</p>
          {correcting && <CorrectionReason value={why} onChange={setWhy} />}
          {missing.length > 0 && <small className="field__msg field__msg--warn">Para firmar, {missing.join('; ')}.</small>}
        </Section>
        <div className="anes-foot">
          <DraftBadge savedAt={draft.savedAt} restored={draft.restored} offline={draft.offline} />
          <Link className="btn btn--ghost anes-btn" to={back}>Salir (se guarda)</Link>
          <button type="button" className="btn btn--primary anes-btn" disabled={!ready} onClick={submit}><FileSignature size={16} />{correcting ? 'Guardar la corrección' : 'Firmar recuento'}</button>
        </div>
      </div>
    </div>
  )
}
