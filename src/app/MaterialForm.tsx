import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Layers, Users, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { Modal } from '../components/ui'
import { DateField } from '../components/DateTimeField'
import { DraftBadge } from '../components/Addenda'
import { QtyStepper, qtyOf } from '../components/QtyStepper'
import { Highlight, SupplySearch } from '../components/SupplySearch'
import { bedLabel, PatientPicker } from './Inpatients'
import { SetPicker } from './SupplySets'
import { useDraftSync } from '../lib/drafts'
import { setShiftList, useSupplies } from '../lib/useSupplies'
import { fullName } from '../lib/format'
import { GENERAL_USE_LABEL, USAGE_AREAS } from '../lib/clinicalConfig'
import { applySet, byCategory, currentPeriod, localDay, periodOf, scopeFits, scopeHint, supplyLabel, undoSet, unitText, type SupplyItem, type SupplySetView } from '../lib/supplies'
import { USAGE_AREA_LIST, type MaterialRecord, type UsageArea, type UsageSuggestion } from '../lib/usage'

/**
 * El borrador («Se guarda solo»). `extra` queda por los borradores de la ronda 14 (ya no se usa: lo que tiene cantidad entra).
 * `sets` (RU8): los sets usados, con su nombre en ese momento.
 */
interface Draft { day: string; shiftKey: string; patientId: string; general: boolean; qty: Record<string, string>; extra?: string[]; addToList: string[]; sets?: { id: string; name: string }[] }
const blankDraft = (day: string, shiftKey: string): Draft => ({ day, shiftKey, patientId: '', general: false, qty: {}, addToList: [], sets: [] })
/** El aviso de «Usar set», con lo que sumó (para «Deshacer») y lo que no entró. */
interface SetNotice { id: string; name: string; added: Record<string, number>; skipped: { label: string; why: 'archived' | 'scope' }[] }
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * RU2 (ronda 14) y RU7 (ronda 15): «Registrar material» (y «Corregir» en el periodo de gracia). Ventana ancha en dos columnas
 * desde ~1100 px: a la izquierda «¿Para quién?» («Uso general del servicio» primero; luego el buscador de pacientes de la app y,
 * con el buscador vacío, los atendidos o internados en el periodo por Consulta externa, Observación y Hospitalización); a la
 * derecha «Material» (el buscador de material, que busca en la lista de turno y en todo el catálogo, y la lista de turno por
 * categoría, solo con lo que corresponde al destino: RU5). Abajo, una barra fija con «Seleccionados: n materiales», «Cancelar»
 * y «Guardar». El borrador «Se guarda solo» no pierde lo escrito si se cae el internet.
 */
export function MaterialForm({ editing, onClose, onSaved }: { editing?: MaterialRecord; onClose: () => void; onSaved: (r: MaterialRecord) => void }) {
  const { notify, patient, can, inpatientOf, bed } = useStore()
  const { items, settings } = useSupplies()
  const now = currentPeriod(settings)
  const initial = (): Draft => editing
    ? { day: localDay(new Date(editing.periodStart)), shiftKey: editing.shiftKey ?? '', patientId: editing.patientId ?? '', general: editing.general,
      qty: Object.fromEntries(editing.items.map((i) => [i.itemId, String(i.quantity)])), addToList: [], sets: editing.sets ?? [] }
    : blankDraft(now.day, now.shiftKey ?? '')
  const [d, setD] = useState<Draft>(initial)
  // Al llegar la configuración de la clínica, el turno actual (si el formulario sigue en blanco)
  const [synced, setSynced] = useState(false)
  if (!synced && !editing && items) { setSynced(true); const p = currentPeriod(settings); if (!d.shiftKey && p.shiftKey) setD({ ...d, day: p.day, shiftKey: p.shiftKey }) }
  const [find, setFind] = useState('')
  const [who, setWho] = useState('')
  const [today] = useState(() => localDay(new Date()))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showChosen, setShowChosen] = useState(false)
  const [closedAreas, setClosedAreas] = useState<Set<UsageArea>>(new Set())
  const [closedCats, setClosedCats] = useState<Set<string>>(new Set())
  const [setNotice, setSetNotice] = useState<SetNotice | null>(null)
  const [asSet, setAsSet] = useState(false)
  const filled = Object.values(d.qty).some((v) => qtyOf(v) > 0)
  const blank = !filled && !d.patientId && !d.general
  const draft = useDraftSync<Draft>('material', editing ? editing.id : 'nuevo', d, (x) => setD({ ...blankDraft(x.day, x.shiftKey), ...x }), blank)

  const active = useMemo(() => items ?? [], [items])
  const byId = useMemo(() => new Map(active.map((i) => [i.id, i])), [active])
  const inRecord = new Set(editing?.items.map((i) => i.itemId) ?? [])
  const archivedInRecord = editing?.items.filter((i) => !byId.has(i.itemId)) ?? []
  const hasDest = d.general || !!d.patientId
  // RU5: con destino, solo lo que se le registra (al corregir, lo que ya tenía el registro se conserva)
  const fits = (i: SupplyItem) => !hasDest || scopeFits(i.scope, d.general) || inRecord.has(i.id)
  const list = active.filter((i) => i.onShiftList && fits(i))
  const others = active.filter((i) => !i.onShiftList && qtyOf(d.qty[i.id]) > 0)
  const chosenLines = active.filter((i) => qtyOf(d.qty[i.id]) > 0)
  const chosenCount = chosenLines.length

  const period = settings.period === 'shift' ? periodOf('shift', d.day, settings.shifts, d.shiftKey) : periodOf(settings.period, d.day, settings.shifts)
  const [suggest, setSuggest] = useState<{ patients: UsageSuggestion[]; general: number }>({ patients: [], general: 0 })
  useEffect(() => {
    let alive = true
    api<{ patients: UsageSuggestion[]; general: number }>(`/usage/suggest?from=${encodeURIComponent(period.start)}&to=${encodeURIComponent(period.end)}`)
      .then((r) => { if (alive) setSuggest(r) }).catch(() => { if (alive) setSuggest({ patients: [], general: 0 }) })
    return () => { alive = false }
  }, [period.start, period.end])
  const suggestOf = useMemo(() => new Map(suggest.patients.map((s) => [s.id, s])), [suggest])
  /** Dónde está el paciente: lo del periodo o, si está internado, su cama. */
  const whereIs = (id: string) => {
    const s = suggestOf.get(id)
    if (s) return s.location
    const h = inpatientOf(id)
    if (!h) return ''
    const b = h.bedId ? bed(h.bedId) : undefined
    return `${h.kind === 'observation' ? USAGE_AREAS.observation : USAGE_AREAS.hospital}${b ? ` · ${bedLabel(b)}` : ''}`
  }

  const setQty = (id: string, v: string) => setD((x) => ({ ...x, qty: { ...x.qty, [id]: v } }))
  /** Elige el destino. Lo que ya tenía cantidad y no se le registra a ese destino sale del formulario (con aviso). */
  const choose = (next: { general: boolean; patientId: string }) => {
    const general = next.general
    const out = next.general || next.patientId ? chosenLines.filter((i) => !scopeFits(i.scope, general) && !inRecord.has(i.id)) : []
    const qty = { ...d.qty }
    for (const i of out) delete qty[i.id]
    setD({ ...d, ...next, qty })
    setWho('')
    setSetNotice(null)
    if (out.length) notify(`${plural(out.length, 'material no se registra', 'materiales no se registran')} ${general ? `en ${GENERAL_USE_LABEL}` : 'a un paciente'} y se quitó: ${out.map(supplyLabel).join(', ')}.`, 'error')
  }

  const save = async () => {
    setError('')
    const lines = Object.entries(d.qty).map(([itemId, v]) => ({ itemId, quantity: qtyOf(v) })).filter((l) => l.quantity > 0)
    if (!hasDest || !lines.length) return
    setBusy(true)
    try {
      // «Agregar a la lista de turno» desde el formulario (Enfermería y Administración)
      for (const id of d.addToList) if (qtyOf(d.qty[id]) > 0 && can('supplies.shiftlist') && !byId.get(id)?.onShiftList) await setShiftList(id, true)
      const body = { patientId: d.general ? undefined : d.patientId, general: d.general, day: d.day, shiftKey: settings.period === 'shift' ? d.shiftKey || undefined : undefined, items: lines,
        sets: [...new Set((d.sets ?? []).map((x) => x.id))] }
      const r = await api<MaterialRecord>(editing ? `/usage/material/${editing.id}` : '/usage/material', { method: editing ? 'PATCH' : 'POST', body })
      draft.clear()
      notify(editing ? 'Registro corregido' : `Material registrado: ${r.general ? GENERAL_USE_LABEL : r.patientName}`)
      onSaved(r)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  /** RU8: «Usar set»: suma sus cantidades (A12); lo archivado o lo que no corresponde al destino no entra (lo dice el aviso). */
  const pickSet = (s: SupplySetView) => {
    const r = applySet(d.qty, s, { dest: d.general ? 'general' : d.patientId ? 'patient' : undefined, active: new Set(byId.keys()) })
    const used = d.sets ?? []
    setD({ ...d, qty: r.qty, sets: Object.keys(r.added).length && !used.some((x) => x.id === s.id) ? [...used, { id: s.id, name: s.name }] : used })
    setSetNotice({ id: s.id, name: s.name, added: r.added, skipped: r.skipped })
    setFind('')
  }
  /** «Deshacer»: quita lo que sumó el set y deja lo que la persona había puesto. */
  const undo = () => {
    if (!setNotice) return
    setD({ ...d, qty: undoSet(d.qty, setNotice.added), sets: (d.sets ?? []).filter((x) => x.id !== setNotice.id) })
    setSetNotice(null)
  }
  const skippedWhy = (why: 'archived' | 'scope') => (why === 'archived' ? 'archivado' : d.general ? 'se registra por paciente' : `se registra en ${GENERAL_USE_LABEL}`)

  /** Fila de material (~44 px): nombre, variante y unidad pegada; a la derecha [−] [cantidad] [+]. */
  const row = (i: SupplyItem, q = '', inOthers = false) => {
    const ok = fits(i)
    const n = qtyOf(d.qty[i.id])
    return (
      <div key={i.id} className={`mat-row${n ? ' is-on' : ''}${ok ? '' : ' is-off'}`}>
        <div className="mat-row__name">
          <span><b><Highlight text={i.material} q={q} /></b>{i.variant && <> <Highlight text={i.variant} q={q} /></>} <small className="mat-row__unit">{i.unit}</small></span>
          {!ok && <small className="mat-row__why">{scopeHint(i.scope)}</small>}
          {ok && !i.onShiftList && (
            <span className="mat-row__off">{!inOthers && <small className="muted">Fuera de la lista de turno</small>}
              {can('supplies.shiftlist') && !inRecord.has(i.id) && (
                <label className="check-inline mat-row__list"><input type="checkbox" checked={d.addToList.includes(i.id)}
                  onChange={(e) => setD({ ...d, addToList: e.target.checked ? [...d.addToList, i.id] : d.addToList.filter((x) => x !== i.id) })} />Agregar a la lista de turno</label>
              )}
            </span>
          )}
        </div>
        <QtyStepper value={d.qty[i.id] ?? ''} onChange={(v) => setQty(i.id, v)} label={`${supplyLabel(i)} (${i.unit})`} disabled={!ok} />
      </div>
    )
  }
  const toggle = <T,>(set: Set<T>, v: T) => { const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); return n }

  const chosen = d.patientId ? patient(d.patientId) : undefined
  const groups = USAGE_AREA_LIST.map((a) => ({ area: a, rows: suggest.patients.filter((s) => s.area === a) }))
  const whoText = d.general ? GENERAL_USE_LABEL : chosen ? [fullName(chosen), chosen.record, whereIs(chosen.id)].filter(Boolean).join(' · ') : ''
  const missing = !hasDest ? `Elige un paciente o ${GENERAL_USE_LABEL}` : !filled ? 'Escribe la cantidad de al menos un material' : ''

  return (
    <Modal wide steady className="mat-form" title={editing ? 'Corregir registro de material' : 'Registrar material'} onClose={onClose}
      top={<DraftBadge savedAt={draft.savedAt} restored={draft.restored} offline={draft.offline} />}
      footer={
        <div className="mat-foot">
          {showChosen && chosenCount > 0 && (
            <div className="mat-foot__list" role="region" aria-label="Materiales seleccionados">
              {chosenLines.map((i) => (
                <div key={i.id} className="mat-foot__row">
                  <span className="mat-foot__name"><b>{i.material}</b>{i.variant && ` ${i.variant}`} <small className="muted">{unitText(qtyOf(d.qty[i.id]), i.unit)}</small></span>
                  <QtyStepper value={d.qty[i.id] ?? ''} onChange={(v) => setQty(i.id, v)} label={supplyLabel(i)} />
                  <button type="button" className="icon-btn" aria-label={`Quitar ${supplyLabel(i)}`} onClick={() => setQty(i.id, '')}><X size={16} /></button>
                </div>
              ))}
            </div>
          )}
          <div className="mat-foot__bar">
            <button type="button" className="btn btn--ghost mat-foot__sum" aria-expanded={showChosen} disabled={!chosenCount} onClick={() => setShowChosen(!showChosen)}>
              Seleccionados: {plural(chosenCount, 'material', 'materiales')}{chosenCount > 0 && (showChosen ? <ChevronDown size={16} /> : <ChevronUp size={16} />)}
            </button>
            {(error || missing) && <span className={`mat-foot__msg${error ? ' field__msg field__msg--error' : ' muted'}`} role={error ? 'alert' : 'status'}>{error || missing}</span>}
            <span className="mat-foot__acts">
              {can('sets.manage') && !editing && <button type="button" className="btn btn--ghost" disabled={!chosenCount} onClick={() => setAsSet(true)}><Layers size={15} />Guardar como set</button>}
              <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
              <button className="btn btn--primary" disabled={busy || !!missing} onClick={() => void save()}>{busy ? 'Guardando…' : 'Guardar'}</button>
            </span>
          </div>
        </div>
      }>
      <div className="mat-form__head">
        <label className="field"><span>Fecha</span><DateField className="dtf--inset" value={d.day} max={today} required onChange={(v) => v && setD({ ...d, day: v })} /></label>
        {settings.period === 'shift' ? (
          <label className="field"><span>Turno</span>
            <select className="select" value={d.shiftKey} onChange={(e) => setD({ ...d, shiftKey: e.target.value })}>
              {settings.shifts.map((s) => <option key={s.key} value={s.key}>{s.label} ({s.from}–{s.to})</option>)}
            </select></label>
        ) : <div className="field"><span>Periodo</span><b className="mat-form__period">{period.label}</b></div>}
      </div>
      <div className="mat-form__cols">
        <section className="mat-col mat-col--who" aria-label="¿Para quién?">
          <h3 className="mat-col__title">¿Para quién?</h3>
          {hasDest ? (
            <div className="mat-for" role="status">
              <span>Para: <b>{whoText}</b></span>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => choose({ general: false, patientId: '' })}>Cambiar</button>
            </div>
          ) : (<>
            <button type="button" className="mat-general" onClick={() => choose({ general: true, patientId: '' })}>
              <Users size={20} aria-hidden="true" />
              <span><b>{GENERAL_USE_LABEL}</b><small className="muted">Lo que no se gasta en un paciente: alcohol, rollos, gorros…</small></span>
              {suggest.general > 0 && <span className="tag">Ya tiene registro ({suggest.general})</span>}
            </button>
            <PatientPicker value="" autoFocus={false} label="o un paciente" placeholder="Buscar paciente: nombre, expediente o identidad" onQuery={setWho}
              detail={(p) => whereIs(p.id)} onChange={(id) => choose({ general: false, patientId: id })} />
            {who.trim().length < 2 && (
              <div className="mat-period">
                <small className="mat-period__title">Atendidos o internados en este periodo</small>
                {!suggest.patients.length && <p className="muted mat-period__empty">Nadie atendido ni internado en este periodo. Búscalo arriba.</p>}
                {groups.filter((g) => g.rows.length).map((g) => {
                  const open = !closedAreas.has(g.area)
                  return (
                    <div key={g.area} className="mat-period__group">
                      <button type="button" className="mat-period__head" aria-expanded={open} onClick={() => setClosedAreas(toggle(closedAreas, g.area))}>
                        <ChevronDown size={16} className="mat-chev" aria-hidden="true" />{USAGE_AREAS[g.area]} ({g.rows.length})
                      </button>
                      {open && g.rows.map((s) => (
                        <button key={s.id} type="button" className="mat-pt" onClick={() => choose({ general: false, patientId: s.id })}>
                          <b>{s.name}</b><span className="muted">{s.record}{s.bed ? ` · ${s.bed}` : ''}</span>
                          {s.records > 0 && <span className="tag">Ya tiene registro ({s.records})</span>}
                        </button>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </>)}
        </section>
        <section className="mat-col mat-col--mat" aria-label="Material">
          <h3 className="mat-col__title">Material</h3>
          {!items ? <p className="muted">Cargando el catálogo…</p> : (<>
            <div className="mat-tools">
              <SupplySearch items={active} value={find} onChange={setFind} label="Buscar material" max={30}
                results={(found, q) => <div className="mat-results">{found.map((i) => row(i, q))}</div>} />
              <SetPicker onPick={pickSet} />
            </div>
            {setNotice && (
              <div className="set-notice" role="status">
                <span>
                  {Object.keys(setNotice.added).length
                    ? <>Se agregó el set «{setNotice.name}» ({plural(Object.keys(setNotice.added).length, 'material', 'materiales')}). Puedes cambiar las cantidades o agregar más.</>
                    : <>El set «{setNotice.name}» no agregó nada.</>}
                  {setNotice.skipped.length > 0 && <> {plural(setNotice.skipped.length, 'material no se agregó', 'materiales no se agregaron')}: {setNotice.skipped.map((x) => `${x.label} (${skippedWhy(x.why)})`).join(', ')}.</>}
                </span>
                {Object.keys(setNotice.added).length > 0 && <button type="button" className="btn btn--ghost btn--sm" onClick={undo}>Deshacer</button>}
                <button type="button" className="icon-btn" aria-label="Cerrar el aviso" onClick={() => setSetNotice(null)}><X size={15} /></button>
              </div>
            )}
            {(d.sets ?? []).length > 0 && <p className="muted mat-sets">Sets usados: {(d.sets ?? []).map((x) => `«${x.name}»`).join(', ')}</p>}
            {find.trim().length < 2 && (<>
              {others.length > 0 && (
                <section className="mat-cat"><h4 className="mat-cat__plain">Fuera de la lista de turno</h4>{others.map((i) => row(i, '', true))}</section>
              )}
              {archivedInRecord.length > 0 && (
                <section className="mat-cat"><h4 className="mat-cat__plain">Archivados</h4>
                  {archivedInRecord.map((i) => <p key={i.itemId} className="muted">{supplyLabel(i)} × {unitText(i.quantity, i.unit)} (archivado)</p>)}</section>
              )}
              <h4 className="mat-form__title">Lista de turno</h4>
              {!list.length && <p className="muted">{hasDest ? 'Nada de la lista de turno se registra a este destino.' : 'La clínica no tiene materiales en su lista de turno.'} Usa el buscador.</p>}
              {byCategory(list).map((g) => {
                const open = !closedCats.has(g.category)
                return (
                  <section key={g.category} className="mat-cat">
                    <button type="button" className="mat-cat__head" aria-expanded={open} onClick={() => setClosedCats(toggle(closedCats, g.category))}>
                      <ChevronDown size={15} className="mat-chev" aria-hidden="true" />{g.category} <span className="muted">· {g.rows.length}</span>
                    </button>
                    {open && g.rows.map((i) => row(i))}
                  </section>
                )
              })}
            </>)}
          </>)}
        </section>
      </div>
      {asSet && <SaveAsSet lines={chosenLines.map((i) => ({ itemId: i.id, quantity: qtyOf(d.qty[i.id]) }))} onClose={() => setAsSet(false)} />}
    </Modal>
  )
}

/** RU8: «Guardar como set»: lo seleccionado como un set nuevo; pide el nombre. Para cambiar un set existente, «Editar» en «Sets». */
function SaveAsSet({ lines, onClose }: { lines: { itemId: string; quantity: number }[]; onClose: () => void }) {
  const { notify } = useStore()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async () => {
    setBusy(true)
    setError('')
    try {
      const r = await api<SupplySetView>('/supply-sets', { body: { name: name.trim(), description: '', items: lines } })
      notify(`El set «${r.name}» se guardó (${plural(r.lines.length, 'material', 'materiales')})`)
      onClose()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <Modal title="Guardar como set" onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={busy || name.trim().length < 2} onClick={() => void save()}>{busy ? 'Guardando…' : 'Guardar set'}</button>
    </>}>
      <p style={{ marginTop: 0 }}>Se guarda lo seleccionado ({plural(lines.length, 'material', 'materiales')}) con sus cantidades. El registro no cambia.</p>
      <label className="field"><span>Nombre del set</span>
        <input className="input" value={name} maxLength={60} autoFocus placeholder="Ej. Cesárea" onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && name.trim().length >= 2) void save() }} /></label>
      {error && <p className="field__msg field__msg--error" role="alert">{error}</p>}
    </Modal>
  )
}

