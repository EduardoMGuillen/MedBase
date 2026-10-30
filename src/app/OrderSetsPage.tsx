import { useState } from 'react'
import { ArrowDown, ArrowUp, Copy, GripVertical, ListChecks, Pencil, Pill, Plus, Trash2, Users, X, FlaskConical } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { Loading, Modal, PageHead } from '../components/ui'
import { useOrderSets } from '../lib/useOrderSets'
import { features } from '../lib/permissions'
import { ROUTES } from '../lib/format'
import { INPATIENT_FREQUENCIES } from '../lib/inpatient'
import { hasBlank, itemText, medHasBlank } from '../lib/orderSets'
import { ExamPicker } from '../components/Exams'
import { GROUP_LABEL } from '../lib/exams'
import { useVademecum } from '../lib/vademecum'
import { normalize } from '../lib/patients'
import type { OrderSet, OrderSetItem, SetMed } from '../lib/types'

/**
 * Mis sets de órdenes (O1): crear, renombrar, editar (agregar, quitar y reordenar las órdenes arrastrando o con las
 * flechas), duplicar y eliminar. Los compartidos por otros médicos de la clínica se pueden duplicar como propios.
 */
export default function OrderSetsPage() {
  const { user, staffById, settings, notify } = useStore()
  const { sets, reload } = useOrderSets()
  const [editing, setEditing] = useState<OrderSet | 'new' | null>(null)
  if (!sets || !user) return <Loading label="Abriendo tus sets" />
  const mine = sets.filter((s) => s.ownerId === user.id).sort((a, b) => a.name.localeCompare(b.name, 'es'))
  const others = sets.filter((s) => s.ownerId !== user.id)
  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); notify(msg); reload() } catch (e) { notify((e as Error).message, 'error') }
  }
  const card = (s: OrderSet, own: boolean) => (
    <article key={s.id} className="panel set-card">
      <div className="panel__head">
        <div><h2>{s.name} {s.shared && own && <span className="badge badge--ink"><Users size={12} /> Compartido</span>}</h2>
          <p>{s.items.length} órdenes{s.uses ? ` · lo usaste ${s.uses} ${s.uses === 1 ? 'vez' : 'veces'}` : ''}{!own ? ` · de ${staffById(s.ownerId)?.name ?? 'otro médico'}` : ''}</p></div>
        <div className="auth-actions">
          {own && <button className="btn btn--soft btn--sm" onClick={() => setEditing(s)}><Pencil size={14} />Editar</button>}
          <button className="btn btn--ghost btn--sm" onClick={() => act(() => api(`/order-sets/${s.id}/duplicate`, { method: 'POST' }), `Se duplicó "${s.name}"`)}><Copy size={14} />Duplicar{own ? '' : ' como mío'}</button>
          {own && <button className="btn btn--ghost btn--sm" onClick={() => { if (confirm(`¿Eliminar el set "${s.name}"? Deja de aparecer en la lista.`)) void act(() => api(`/order-sets/${s.id}`, { method: 'DELETE' }), 'Set eliminado') }}><Trash2 size={14} />Eliminar</button>}
        </div>
      </div>
      <div className="panel__body">
        <ol className="set-preview">{s.items.map((it, i) => <li key={i} className={it.med ? 'is-med' : ''}>{it.med && <Pill size={12} className="orders__pill" />}{it.exam && <FlaskConical size={12} className="orders__pill" />}{itemText(it)}</li>)}</ol>
      </div>
    </article>
  )
  return (
    <div className="page">
      <PageHead title="Mis sets de órdenes" sub="Órdenes que usas siempre igual, con un nombre. Se aplican en consulta externa, hospitalización y observación; nunca firman la nota."
        actions={<button className="btn btn--primary" onClick={() => setEditing('new')}><Plus size={16} />Nuevo set</button>} />
      {mine.length ? mine.map((s) => card(s, true)) : (
        <section className="panel"><div className="empty"><ListChecks size={22} /><p>Todavía no tienes sets. Crea uno aquí o, al escribir órdenes en una nota, usa «Guardar estas órdenes como set».</p></div></section>
      )}
      {others.length > 0 && (<>
        <h2 className="section-title"><Users size={16} /> Compartidos por la clínica</h2>
        {others.map((s) => card(s, false))}
      </>)}
      {editing && <SetEditor set={editing === 'new' ? undefined : editing} office={features(settings).office} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />}
    </div>
  )
}

const EMPTY_SET_MED: SetMed = { drug: '', dose: '', route: 'Intravenosa', everyHours: 8, prn: false }

/** Editor de un set: nombre, compartir y la lista de órdenes (texto o medicamento), reordenable. */
function SetEditor({ set, office, onClose, onSaved }: { set?: OrderSet; office: boolean; onClose: () => void; onSaved: () => void }) {
  const { notify } = useStore()
  const [name, setName] = useState(set?.name ?? '')
  const [shared, setShared] = useState(set?.shared ?? false)
  const [items, setItems] = useState<OrderSetItem[]>(set?.items ?? [])
  const [pickingExams, setPickingExams] = useState(false)
  const [text, setText] = useState('')
  const [med, setMed] = useState<{ index: number; value: SetMed } | null>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return
    const next = [...items]
    const [x] = next.splice(from, 1)
    next.splice(to, 0, x)
    setItems(next)
  }
  const addText = () => {
    const lines = text.split(/\r?\n/).map((l) => l.replace(/^\s*(\d+\s*[.)-]|[-•*])\s*/, '').trim()).filter(Boolean)
    if (!lines.length) return
    setItems([...items, ...lines.map((t) => ({ text: /[.!?]$/.test(t) || hasBlank(t.slice(-3)) ? t : `${t}.` }))])
    setText('')
  }
  const save = async () => {
    setBusy(true)
    try {
      const body = { name: name.trim(), items, shared: !office && shared }
      if (set) await api(`/order-sets/${set.id}`, { method: 'PATCH', body })
      else await api('/order-sets', { body })
      notify(set ? 'Set guardado' : `Set "${name.trim()}" creado`)
      onSaved()
    } catch (e) {
      notify((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title={set ? 'Editar set de órdenes' : 'Nuevo set de órdenes'} wide onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={name.trim().length < 3 || !items.length || busy || !!med} onClick={save}>Guardar set</button>
    </>}>
      <label className="field"><span>Nombre</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Fractura cerrada sin complicaciones" /></label>
      {!office && (
        <label className="check-line"><input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
          <span><b>Compartir con la clínica</b><small>Los demás médicos lo pueden aplicar o duplicar; sólo tú lo editas.</small></span></label>
      )}
      <p className="muted" style={{ fontSize: 13.5 }}>Arrastra para cambiar el orden. Escribe <b>___</b> (tres guiones bajos) donde haya que completar algo al aplicarlo, por ejemplo «Ayuno de ___ a ___».</p>
      {items.length > 0 && (
        <ol className="orders set-items">
          {items.map((it, i) => (
            <li key={i} draggable onDragStart={() => setDrag(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag !== null) move(drag, i); setDrag(null) }}
              className={`${drag === i ? 'is-dragging' : ''}${(it.text && hasBlank(it.text)) || (it.med && medHasBlank(it.med)) ? ' has-blank' : ''}`}>
              <span className="set-items__grip" aria-hidden="true"><GripVertical size={14} /></span>
              <span className="orders__n">{i + 1}.</span>
              {it.exam
                ? <span className="orders__text"><FlaskConical size={13} className="orders__pill" />{itemText(it)} <small className="muted">· {GROUP_LABEL[it.exam.group]}</small></span>
                : it.med
                ? <button type="button" className="orders__text" onClick={() => setMed({ index: i, value: it.med! })}><Pill size={13} className="orders__pill" />{itemText(it)}</button>
                : <input className={`input${hasBlank(it.text) ? ' input--blank' : ''}`} value={it.text} aria-label={`Orden ${i + 1}`} onChange={(e) => setItems(items.map((x, j) => (j === i ? { text: e.target.value } : x)))} />}
              <span className="orders__tools">
                <button type="button" className="icon-btn" aria-label="Subir" disabled={i === 0} onClick={() => move(i, i - 1)}><ArrowUp size={14} /></button>
                <button type="button" className="icon-btn" aria-label="Bajar" disabled={i === items.length - 1} onClick={() => move(i, i + 1)}><ArrowDown size={14} /></button>
                <button type="button" className="icon-btn" aria-label={`Quitar orden ${i + 1}`} onClick={() => setItems(items.filter((_, j) => j !== i))}><X size={14} /></button>
              </span>
            </li>
          ))}
        </ol>
      )}
      {med ? <SetMedForm initial={med.value} onCancel={() => setMed(null)} onSave={(m) => { setItems(med.index >= 0 ? items.map((x, j) => (j === med.index ? { med: m } : x)) : [...items, { med: m }]); setMed(null) }} /> : (<>
        <div className="order-add">
          <textarea className="textarea textarea--sm" rows={2} value={text} onChange={(e) => setText(e.target.value)} aria-label="Nueva orden"
            placeholder={`${items.length + 1}. Escribe una orden y presiona Enter, o pega varias líneas`}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addText() } }} />
          <button type="button" className="btn btn--soft" disabled={!text.trim()} onClick={addText} aria-label="Agregar orden"><Plus size={16} /></button>
        </div>
        <button type="button" className="btn btn--soft" style={{ justifySelf: 'start' }} onClick={() => setMed({ index: -1, value: EMPTY_SET_MED })}><Pill size={15} />Agregar medicamento</button>
        {/* EX1: un set puede incluir exámenes de los dos grupos */}
        <button type="button" className="btn btn--soft" style={{ justifySelf: 'start' }} onClick={() => setPickingExams(true)}><FlaskConical size={15} />Agregar exámenes</button>
        {pickingExams && <ExamPicker current={items.flatMap((x) => (x.exam ? [x.exam] : []))} title="Exámenes del set" onClose={() => setPickingExams(false)}
          onAdd={(l) => { setItems([...items, ...l.map((exam) => ({ exam }))]); setPickingExams(false) }} />}
      </>)}
    </Modal>
  )
}

/** Medicamento del set: del vademécum o escrito, con dosis, vía, frecuencia y días (opcionales). */
function SetMedForm({ initial, onSave, onCancel }: { initial: SetMed; onSave: (m: SetMed) => void; onCancel: () => void }) {
  const vademecum = useVademecum()
  const [m, setM] = useState<SetMed>(initial)
  const [freq, setFreq] = useState(initial.everyHours ? String(initial.everyHours) : initial.drug ? 'once' : '8')
  const known = vademecum.some((d) => normalize(d.name) === normalize(m.drug))
  const ok = m.drug.trim() && m.dose.trim()
  return (
    <div className="rx-form">
      <label className="field"><span>Medicamento</span>
        <input className="input" list="set-drugs" value={m.drug} autoFocus placeholder="Busca en el vademécum o escríbelo"
          onChange={(e) => { const d = vademecum.find((x) => x.name === e.target.value); setM({ ...m, drug: e.target.value, presentation: d?.presentation ?? m.presentation }) }} />
        <datalist id="set-drugs">{vademecum.map((d) => <option key={`${d.name}-${d.presentation}`} value={d.name}>{d.presentation}</option>)}</datalist>
        {m.drug.trim() && !known && <small className="field__msg field__msg--warn">No está en el vademécum de la clínica. Se puede guardar igual.</small>}</label>
      <div className="form-grid">
        <label className="field"><span>Dosis</span><input className="input" value={m.dose} onChange={(e) => setM({ ...m, dose: e.target.value })} placeholder="Ej. 1 g o ___ mg" /></label>
        <label className="field"><span>Vía</span><select className="select" value={m.route} onChange={(e) => setM({ ...m, route: e.target.value })}>{ROUTES.map((r) => <option key={r}>{r}</option>)}</select></label>
        <label className="field"><span>Frecuencia</span>
          <select className="select" value={freq} onChange={(e) => setFreq(e.target.value)}>
            {INPATIENT_FREQUENCIES.filter((f) => !m.prn || f.hours).map((f) => <option key={f.label} value={f.hours ?? 'once'}>{m.prn ? `${f.label} como máximo` : f.label}</option>)}
          </select></label>
        <label className="field"><span>Total de días (opcional)</span>
          <input className="input num" type="number" min={1} max={365} inputMode="numeric" value={m.days ?? ''} placeholder="Hasta nueva orden"
            onChange={(e) => setM({ ...m, days: e.target.value ? Math.max(1, Math.min(365, Math.round(Number(e.target.value)))) : undefined })} /></label>
        <label className="field" style={{ alignContent: 'end' }}><span>Según necesidad</span>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', height: 42 }}>
            <input type="checkbox" checked={m.prn} onChange={(e) => { setM({ ...m, prn: e.target.checked }); if (e.target.checked && freq === 'once') setFreq('8') }} />PRN</label></label>
        <label className="field"><span>Indicaciones</span><input className="input" value={m.instructions ?? ''} onChange={(e) => setM({ ...m, instructions: e.target.value })} placeholder="Ej. Diluir en 100 ml" /></label>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn btn--primary" disabled={!ok} onClick={() => onSave({ ...m, drug: m.drug.trim(), dose: m.dose.trim(), everyHours: freq === 'once' ? undefined : Number(freq), instructions: m.instructions?.trim() || undefined, presentation: m.presentation || undefined })}>
          <Plus size={16} />{initial.drug ? 'Guardar medicamento' : 'Agregar al set'}</button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  )
}
