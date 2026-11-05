import { useEffect, useMemo, useState } from 'react'
import { Minus, Plus, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { Modal } from '../components/ui'
import { DateField } from '../components/DateTimeField'
import { DraftBadge } from '../components/Addenda'
import { PatientPicker } from './Inpatients'
import { useDraftSync } from '../lib/drafts'
import { setShiftList, useSupplies } from '../lib/useSupplies'
import { GENERAL_USE_LABEL, USAGE_AREAS } from '../lib/clinicalConfig'
import { byCategory, currentPeriod, localDay, matchesSupply, periodOf, supplyLabel, unitText, type SupplyItem } from '../lib/supplies'
import type { MaterialRecord, UsageArea } from '../lib/usage'

interface Draft { day: string; shiftKey: string; patientId: string; general: boolean; qty: Record<string, string>; extra: string[]; addToList: string[] }
const blankDraft = (day: string, shiftKey: string): Draft => ({ day, shiftKey, patientId: '', general: false, qty: {}, extra: [], addToList: [] })
const toInt = (s: string | undefined) => { const n = Number.parseInt(s ?? '', 10); return Number.isFinite(n) && n > 0 ? n : 0 }

/**
 * RU2 (ronda 14): «Registrar material» (y «Corregir» en el periodo de gracia). Fecha (hoy), periodo (el turno actual, el día o
 * la semana, según la clínica) y paciente (sugiere primero a los atendidos o internados en ese periodo) o «Uso general del
 * servicio». Debajo, la lista de turno por categoría: cantidad vacía = no se usó; − / + de 44 px. «Agregar otro material» busca
 * en el resto del catálogo y deja marcar «Agregar a la lista de turno». Solo se guardan las filas con cantidad. El borrador
 * «Se guarda solo» (como las notas) no pierde lo escrito si se cae el internet.
 */
export function MaterialForm({ editing, onClose, onSaved }: { editing?: MaterialRecord; onClose: () => void; onSaved: (r: MaterialRecord) => void }) {
  const { notify, patient, can } = useStore()
  const { items, settings } = useSupplies()
  const now = currentPeriod(settings)
  const initial = (): Draft => editing
    ? { day: localDay(new Date(editing.periodStart)), shiftKey: editing.shiftKey ?? '', patientId: editing.patientId ?? '', general: editing.general,
      qty: Object.fromEntries(editing.items.map((i) => [i.itemId, String(i.quantity)])), extra: [], addToList: [] }
    : blankDraft(now.day, now.shiftKey ?? '')
  const [d, setD] = useState<Draft>(initial)
  // Al llegar la configuración de la clínica, el turno actual (si el formulario sigue en blanco)
  const [synced, setSynced] = useState(false)
  if (!synced && !editing && items) { setSynced(true); const p = currentPeriod(settings); if (!d.shiftKey && p.shiftKey) setD({ ...d, day: p.day, shiftKey: p.shiftKey }) }
  const [find, setFind] = useState('')
  const [today] = useState(() => localDay(new Date()))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const filled = Object.values(d.qty).some((v) => toInt(v) > 0)
  const blank = !filled && !d.patientId && !d.general && !d.extra.length
  const draft = useDraftSync<Draft>('material', editing ? editing.id : 'nuevo', d, (x) => setD({ ...blankDraft(x.day, x.shiftKey), ...x }), blank)

  const list = useMemo(() => (items ?? []).filter((i) => i.onShiftList), [items])
  const inRecord = new Set(editing?.items.map((i) => i.itemId) ?? [])
  // Lo que no está en la lista de turno pero entra al registro: lo agregado con «Agregar otro material» y, al corregir, lo que ya tenía
  const extras = (items ?? []).filter((i) => !i.onShiftList && (d.extra.includes(i.id) || (inRecord.has(i.id) && !!d.qty[i.id])))
  const archivedInRecord = editing?.items.filter((i) => !(items ?? []).some((x) => x.id === i.itemId)) ?? []
  const found = find.trim().length >= 2 ? (items ?? []).filter((i) => !i.onShiftList && !extras.includes(i) && matchesSupply(i, find)).slice(0, 8) : []

  const period = settings.period === 'shift' ? periodOf('shift', d.day, settings.shifts, d.shiftKey) : periodOf(settings.period, d.day, settings.shifts)
  const [suggest, setSuggest] = useState<{ id: string; name: string; record: string; area: UsageArea }[]>([])
  useEffect(() => {
    let alive = true
    api<typeof suggest>(`/usage/suggest?from=${encodeURIComponent(period.start)}&to=${encodeURIComponent(period.end)}`).then((r) => { if (alive) setSuggest(r) }).catch(() => { if (alive) setSuggest([]) })
    return () => { alive = false }
  }, [period.start, period.end])

  const setQty = (id: string, v: string) => setD({ ...d, qty: { ...d.qty, [id]: v.replace(/\D/g, '').slice(0, 3) } })
  const step = (id: string, by: number) => setQty(id, String(Math.max(0, toInt(d.qty[id]) + by) || ''))

  const save = async () => {
    setError('')
    if (!d.general && !d.patientId) return setError('Elige el paciente o marca «Uso general del servicio».')
    const lines = Object.entries(d.qty).map(([itemId, v]) => ({ itemId, quantity: toInt(v) })).filter((l) => l.quantity > 0)
    if (!lines.length) return setError('Escribe la cantidad de al menos un material.')
    setBusy(true)
    try {
      // «Agregar a la lista de turno» desde el formulario (Enfermería y Administración)
      for (const id of d.addToList) if (d.extra.includes(id) && can('supplies.shiftlist')) await setShiftList(id, true)
      const body = { patientId: d.general ? undefined : d.patientId, general: d.general, day: d.day, shiftKey: settings.period === 'shift' ? d.shiftKey || undefined : undefined, items: lines }
      const r = await api<MaterialRecord>(editing ? `/usage/material/${editing.id}` : '/usage/material', { method: editing ? 'PATCH' : 'POST', body })
      draft.clear()
      notify(editing ? 'Registro corregido' : `Material registrado: ${r.general ? GENERAL_USE_LABEL : r.patientName}`)
      onSaved(r)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const row = (i: SupplyItem, extra = false) => (
    <div key={i.id} className={`mat-row${toInt(d.qty[i.id]) ? ' is-on' : ''}`}>
      <div className="mat-row__name"><b>{i.material}</b>{i.variant && <span> {i.variant}</span>}
        {extra && can('supplies.shiftlist') && !inRecord.has(i.id) && (
          <label className="check-inline mat-row__list"><input type="checkbox" checked={d.addToList.includes(i.id)}
            onChange={(e) => setD({ ...d, addToList: e.target.checked ? [...d.addToList, i.id] : d.addToList.filter((x) => x !== i.id) })} />Agregar a la lista de turno</label>
        )}
      </div>
      <div className="mat-row__qty">
        <button type="button" className="mat-step" aria-label={`Menos ${supplyLabel(i)}`} onClick={() => step(i.id, -1)} disabled={!toInt(d.qty[i.id])}><Minus size={18} /></button>
        <input className="input num mat-qty" inputMode="numeric" value={d.qty[i.id] ?? ''} placeholder="—" aria-label={`Cantidad de ${supplyLabel(i)} (${i.unit})`} onChange={(e) => setQty(i.id, e.target.value)} />
        <button type="button" className="mat-step" aria-label={`Más ${supplyLabel(i)}`} onClick={() => step(i.id, 1)}><Plus size={18} /></button>
        <span className="mat-row__unit">{toInt(d.qty[i.id]) ? unitText(toInt(d.qty[i.id]), i.unit).replace(/^\d+ /, '') : i.unit}</span>
        {extra && !inRecord.has(i.id) && <button type="button" className="icon-btn" aria-label={`Quitar ${supplyLabel(i)}`} onClick={() => {
          const qty = { ...d.qty }; delete qty[i.id]
          setD({ ...d, qty, extra: d.extra.filter((x) => x !== i.id), addToList: d.addToList.filter((x) => x !== i.id) })
        }}><X size={16} /></button>}
      </div>
    </div>
  )
  const chosen = d.patientId ? patient(d.patientId) : undefined
  return (
    <Modal wide steady className="mat-form" title={editing ? 'Corregir registro de material' : 'Registrar material'} onClose={onClose}
      top={<DraftBadge savedAt={draft.savedAt} restored={draft.restored} offline={draft.offline} />}
      footer={<>
        {error && <span className="field__msg field__msg--error mat-form__err" role="alert">{error}</span>}
        <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn--primary" disabled={busy} onClick={() => void save()}>{busy ? 'Guardando…' : 'Guardar'}</button>
      </>}>
      <div className="mat-form__head">
        <label className="field"><span>Fecha</span><DateField value={d.day} max={today} required onChange={(v) => v && setD({ ...d, day: v })} /></label>
        {settings.period === 'shift' ? (
          <label className="field"><span>Turno</span>
            <select className="select" value={d.shiftKey} onChange={(e) => setD({ ...d, shiftKey: e.target.value })}>
              {settings.shifts.map((s) => <option key={s.key} value={s.key}>{s.label} ({s.from}–{s.to})</option>)}
            </select></label>
        ) : <div className="field"><span>Periodo</span><b className="mat-form__period">{period.label}</b></div>}
      </div>
      <div className="mat-form__who">
        {!d.general && <PatientPicker value={d.patientId} autoFocus={false} onChange={(id) => setD({ ...d, patientId: id })} />}
        {!d.general && !chosen && suggest.length > 0 && (
          <div className="mat-suggest"><small className="muted">Atendidos o internados en este periodo</small>
            <div className="mat-suggest__list">{suggest.slice(0, 12).map((s) => (
              <button key={s.id} type="button" className="mat-chip" onClick={() => setD({ ...d, patientId: s.id })}>{s.name} <small>· {USAGE_AREAS[s.area]}</small></button>
            ))}</div>
          </div>
        )}
        <label className="check-inline mat-general"><input type="checkbox" checked={d.general} onChange={(e) => setD({ ...d, general: e.target.checked, patientId: e.target.checked ? '' : d.patientId })} />
          {GENERAL_USE_LABEL} <small className="muted">(lo que no se gasta en un paciente: alcohol, gorros…)</small></label>
      </div>
      {!items ? <p className="muted">Cargando el catálogo…</p> : (<>
        <h3 className="mat-form__title">Lista de turno</h3>
        {!list.length && <p className="muted">La clínica no tiene materiales en su lista de turno. Usa «Agregar otro material».</p>}
        {byCategory(list).map((g) => (
          <section key={g.category} className="mat-cat"><h4>{g.category}</h4>{g.rows.map((i) => row(i))}</section>
        ))}
        {(extras.length > 0 || archivedInRecord.length > 0) && (
          <section className="mat-cat"><h4>Otros materiales</h4>{extras.map((i) => row(i, true))}
            {archivedInRecord.map((i) => <p key={i.itemId} className="muted">{supplyLabel(i)} × {unitText(i.quantity, i.unit)} (archivado)</p>)}
          </section>
        )}
        <div className="field mat-find suggest"><span>Agregar otro material</span>
          <input className="input" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Material o variante (ej. seda 4)" aria-label="Agregar otro material" />
          {found.length > 0 && (
            <div className="suggest__list">{found.map((i) => (
              <button type="button" key={i.id} onClick={() => { setD({ ...d, extra: [...d.extra, i.id], qty: { ...d.qty, [i.id]: d.qty[i.id] || '1' } }); setFind('') }}>
                <span>{supplyLabel(i)}</span><span style={{ color: 'var(--muted)', marginLeft: 'auto' }}>{i.category} · {i.unit}</span></button>
            ))}</div>
          )}
          {find.trim().length >= 2 && !found.length && <small className="muted">Ningún otro material coincide.</small>}
        </div>
      </>)}
    </Modal>
  )
}
