import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronRight, ListChecks, PencilLine, Plus, Ban } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { Loading, Modal, PageHead, SectionHead } from '../components/ui'
import { DateField } from '../components/DateTimeField'
import { TabRow } from '../components/TabRow'
import { Pagination, paginate, usePage } from '../components/Pagination'
import { useGrace } from '../components/Grace'
import { dmyTime, time } from '../lib/format'
import { GENERAL_USE_LABEL, SUPPLY_PERIODS, USAGE_AREAS } from '../lib/clinicalConfig'
import { byCategory, currentPeriod, periodOf, rangeOf, unitText, type SupplySettings, type UsagePeriod } from '../lib/supplies'
import { areaText, byPatient, materialSums, materialTotals, medSummary, totalText, USAGE_AREA_LIST, type MaterialRecord, type MaterialSum, type MedUse, type PatientBlock, type UsageArea } from '../lib/usage'
import { MaterialForm } from './MaterialForm'

type Tab = 'meds' | 'material'

/** Filtros del registro: el periodo de la clínica (turno, día o semana) o un rango de fechas, el área y la búsqueda. */
export interface UsageFilter { period: UsagePeriod; area: UsageArea | 'all'; q: string; endDay?: string }

/** Los datos del registro con los filtros de la pantalla (completos: la paginación es solo de la pantalla). */
function useUsage<T>(path: 'meds' | 'material', f: UsageFilter | null, key: number) {
  const [data, setData] = useState<T[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!f) return
    let alive = true
    const qs = new URLSearchParams({ from: f.period.start, to: f.period.end, area: f.area, q: f.q })
    api<{ rows?: T[]; records?: T[] }>(`/usage/${path}?${qs}`).then((r) => { if (alive) { setData((r.rows ?? r.records) as T[]); setError('') } }).catch((e: Error) => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [path, f, key])
  return { data, error }
}

/**
 * RU2 (ronda 14): «Registro de uso de medicamentos y material» (menú «Uso de medicamentos y material»). Enfermería, Recepción y
 * Administración (en el consultorio, la titular). Arriba el periodo, el turno, el área y el buscador; dos pestañas:
 * «Medicamentos» (solo lectura, se llena sola) y «Material» (lo registra Enfermería). Es administrativo: no toca lo clínico.
 */
export default function UsagePage() {
  const { can } = useStore()
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('pestana') === 'material' ? 'material' : 'meds'
  const setTab = (t: Tab) => setParams((p) => { const n = new URLSearchParams(p); n.delete('pagina'); if (t === 'material') n.set('pestana', 'material'); else n.delete('pestana'); return n }, { replace: true })
  const [settings, setSettings] = useState<SupplySettings | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { api<SupplySettings>('/supplies/settings').then(setSettings).catch((e: Error) => setError(e.message)) }, [])
  const [mode, setMode] = useState<'period' | 'range'>('period')
  const [day, setDay] = useState('')
  const [shiftKey, setShiftKey] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [area, setArea] = useState<UsageArea | 'all'>('all')
  const [q, setQ] = useState('')
  const [dq, setDq] = useState('')
  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 300); return () => clearTimeout(t) }, [q])
  // El periodo actual (el turno en curso, hoy o esta semana) al llegar la configuración
  if (settings && !day) { const p = currentPeriod(settings); setDay(p.day); setShiftKey(p.shiftKey ?? ''); setFrom(p.day); setTo(p.day) }
  const filter = useMemo<UsageFilter | null>(() => {
    if (!settings || !day) return null
    const period = mode === 'range' ? rangeOf(from || day, to || from || day) : periodOf(settings.period, day, settings.shifts, shiftKey)
    return { period, area, q: dq, endDay: mode === 'range' ? (to || from) : undefined }
  }, [settings, mode, day, shiftKey, from, to, area, dq])
  const [reload, setReload] = useState(0)

  if (error) return <div className="page"><section className="panel"><div className="empty">{error}</div></section></div>
  if (!settings || !filter) return <Loading label="Abriendo el registro de uso" />
  return (
    <div className="page usage-page">
      <PageHead title="Registro de uso de medicamentos y material"
        sub="Lo que se aplicó y el material que se usó, por paciente. Es un registro administrativo: no cambia la hoja de medicamentos, las notas ni las recetas, y no es inventario ni cobro."
        actions={can('supplies.view') ? <Link className="btn btn--ghost" to="/app/material-medico-quirurgico"><ListChecks size={16} />Catálogo y lista de turno</Link> : undefined} />
      <section className="panel usage-filters no-print">
        <div className="panel__body usage-filters__row">
          <div className="segmented" role="radiogroup" aria-label="Periodo">
            <button type="button" role="radio" aria-checked={mode === 'period'} onClick={() => setMode('period')}>{SUPPLY_PERIODS[settings.period]}</button>
            <button type="button" role="radio" aria-checked={mode === 'range'} onClick={() => setMode('range')}>Rango de fechas</button>
          </div>
          {mode === 'period' ? (<>
            <label className="field field--inline"><span>{settings.period === 'week' ? 'Un día de la semana' : 'Fecha'}</span><DateField value={day} required onChange={(v) => v && setDay(v)} /></label>
            {settings.period === 'shift' && (
              <label className="field field--inline"><span>Turno</span>
                <select className="select" value={shiftKey} onChange={(e) => setShiftKey(e.target.value)}>
                  {settings.shifts.map((s) => <option key={s.key} value={s.key}>{s.label} ({s.from}–{s.to})</option>)}
                </select></label>
            )}
          </>) : (<>
            <label className="field field--inline"><span>Desde</span><DateField value={from} required onChange={(v) => v && setFrom(v)} /></label>
            <label className="field field--inline"><span>Hasta</span><DateField value={to} required min={from} onChange={(v) => v && setTo(v)} /></label>
          </>)}
          <label className="field field--inline"><span>Área</span>
            <select className="select" value={area} onChange={(e) => setArea(e.target.value as UsageArea | 'all')}>
              <option value="all">Todas</option>{USAGE_AREA_LIST.map((a) => <option key={a} value={a}>{USAGE_AREAS[a]}</option>)}
            </select></label>
          <label className="field field--inline usage-filters__q"><span>Buscar</span>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Paciente, medicamento o material" aria-label="Buscar paciente, medicamento o material" /></label>
        </div>
        <p className="usage-filters__period" role="status"><b>{filter.period.label}</b>{area !== 'all' ? ` · ${areaText(area)}` : ''}</p>
      </section>
      <TabRow className="no-print">
        <button className="tab" role="tab" aria-selected={tab === 'meds'} onClick={() => setTab('meds')}>Medicamentos</button>
        <button className="tab" role="tab" aria-selected={tab === 'material'} onClick={() => setTab('material')}>Material</button>
      </TabRow>
      {tab === 'meds' ? <MedsTab filter={filter} reloadKey={reload} /> : <MaterialTab filter={filter} reloadKey={reload} onChanged={() => setReload((n) => n + 1)} />}
    </div>
  )
}

/** Fila de un bloque por paciente: nombre, expediente y ubicación. */
function BlockHead({ b, count }: { b: PatientBlock<unknown>; count: string }) {
  return (
    <div className="usage-block__head">
      <b>{b.name}</b>
      {!b.general && <span className="muted">{b.record}{b.location ? ` · ${b.location}` : ''}</span>}
      <span className="chip">{count}</span>
    </div>
  )
}

/** Pestaña «Medicamentos»: por paciente (hora, medicamento, aplicado por, médico que lo indicó) o el «Resumen» (modo suma). */
function MedsTab({ filter, reloadKey }: { filter: UsageFilter; reloadKey: number }) {
  const { data, error } = useUsage<MedUse>('meds', filter, reloadKey)
  const [view, setView] = useState<'patients' | 'summary'>('patients')
  const blocks = useMemo(() => byPatient(data ?? [], (a, b) => a.at.localeCompare(b.at)), [data])
  const summary = useMemo(() => medSummary(data ?? []), [data])
  const [pageNo, setPage] = usePage(JSON.stringify([filter.period.start, filter.period.end, filter.area, filter.q, view]))
  const pg = paginate(blocks, pageNo)
  const sp = paginate(summary, pageNo)
  if (error) return <section className="panel"><div className="empty">{error}</div></section>
  if (!data) return <Loading label="Buscando lo que se aplicó" />
  return (
    <section className="panel usage-tab">
      <SectionHead title="Medicamentos aplicados" sub={`${data.length} ${data.length === 1 ? 'aplicación' : 'aplicaciones'} de ${blocks.length} ${blocks.length === 1 ? 'paciente' : 'pacientes'}. Se llena solo con las dosis «Administrado» de la hoja de medicamentos y lo aplicado en consulta externa. Las correcciones se hacen donde se registró.`}
        action={<div className="segmented" role="radiogroup" aria-label="Vista">
          <button type="button" role="radio" aria-checked={view === 'patients'} onClick={() => setView('patients')}>Por paciente</button>
          <button type="button" role="radio" aria-checked={view === 'summary'} onClick={() => setView('summary')}>Resumen</button>
        </div>} />
      {!data.length && <div className="empty">No se aplicaron medicamentos en este periodo{filter.area !== 'all' ? ` en ${areaText(filter.area)}` : ''}.</div>}
      {view === 'patients' && pg.rows.map((b) => (
        <div key={b.key} className="usage-block">
          <BlockHead b={b} count={`${b.rows.length} ${b.rows.length === 1 ? 'aplicación' : 'aplicaciones'}`} />
          <table className="table table--cards usage-table">
            <thead><tr><th>Fecha y hora</th><th>Medicamento</th><th>Aplicado por</th><th>Médico que lo indicó</th></tr></thead>
            <tbody>{b.rows.map((r) => (
              <tr key={r.id}>
                <td data-label="Fecha y hora" className="num">{dmyTime(r.at)}</td>
                <td className="tc-full"><b>{r.medication}</b></td>
                <td data-label="Aplicado por">{r.appliedBy}{r.appliedByTitle && <small className="muted usage-sub">{r.appliedByTitle}</small>}</td>
                <td data-label="Médico que lo indicó">{r.orderedBy}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ))}
      {view === 'patients' && <Pagination {...pg} onPage={setPage} label="Páginas de pacientes" />}
      {view === 'summary' && data.length > 0 && (<>
        <table className="table table--cards usage-table">
          <thead><tr><th>Medicamento y presentación</th><th>Aplicaciones</th><th>Total</th></tr></thead>
          <tbody>{sp.rows.map((s) => (
            <tr key={s.key}><td className="tc-full"><b>{s.label}</b></td><td data-label="Aplicaciones" className="num">{s.count}</td><td data-label="Total" className="num">{totalText(s)}</td></tr>
          ))}</tbody>
        </table>
        <Pagination {...sp} onPage={setPage} label="Páginas del resumen" />
        <p className="muted usage-note">El total sale solo cuando todas las dosis del medicamento tienen la misma unidad.</p>
      </>)}
    </section>
  )
}

/** Pestaña «Material»: total del periodo, un bloque por paciente (modo suma) y al final el uso general del servicio. */
function MaterialTab({ filter, reloadKey, onChanged }: { filter: UsageFilter; reloadKey: number; onChanged: () => void }) {
  const { can } = useStore()
  const { data, error } = useUsage<MaterialRecord>('material', filter, reloadKey)
  const [form, setForm] = useState<MaterialRecord | 'new' | null>(null)
  const [voiding, setVoiding] = useState<MaterialRecord | null>(null)
  const [showTotal, setShowTotal] = useState(true)
  const blocks = useMemo(() => byPatient(data ?? [], (a, b) => a.recordedAt.localeCompare(b.recordedAt)), [data])
  const totals = useMemo(() => materialTotals(data ?? []), [data])
  const [pageNo, setPage] = usePage(JSON.stringify([filter.period.start, filter.period.end, filter.area, filter.q, 'material']))
  const pg = paginate(blocks, pageNo)
  if (error) return <section className="panel"><div className="empty">{error}</div></section>
  return (
    <section className="panel usage-tab">
      <SectionHead title="Material médico quirúrgico" sub="Por paciente, en modo suma: lo que se registra varias veces en el periodo se suma. Un registro anulado se ve tachado y no suma."
        action={can('usage.record') ? <button className="btn btn--primary usage-add" onClick={() => setForm('new')}><Plus size={16} />Registrar material</button> : undefined} />
      {!data ? <Loading label="Buscando el material registrado" /> : (<>
        {totals.length > 0 && (
          <div className="usage-total">
            <button type="button" className="usage-total__head" aria-expanded={showTotal} onClick={() => setShowTotal(!showTotal)}>
              {showTotal ? <ChevronDown size={16} /> : <ChevronRight size={16} />}<b>Total del periodo</b><span className="muted">{totals.length} materiales · todos los pacientes y el uso general</span>
            </button>
            {showTotal && byCategory(totals).map((g) => (
              <div key={g.category} className="usage-total__cat"><h4>{g.category}</h4>
                <ul>{g.rows.map((s) => <li key={s.key}><span>{s.label}</span><b className="num">{unitText(s.quantity, s.unit)}</b></li>)}</ul>
              </div>
            ))}
          </div>
        )}
        {!data.length && <div className="empty">No hay material registrado en este periodo{filter.area !== 'all' ? ` en ${areaText(filter.area)}` : ''}.</div>}
        {pg.rows.map((b) => <MaterialBlock key={b.key} b={b} onEdit={setForm} onVoid={setVoiding} />)}
        <Pagination {...pg} onPage={setPage} label="Páginas de pacientes" />
      </>)}
      {form && <MaterialForm editing={form === 'new' ? undefined : form} onClose={() => setForm(null)} onSaved={() => { setForm(null); onChanged() }} />}
      {voiding && <VoidRecord r={voiding} onClose={() => setVoiding(null)} onDone={() => { setVoiding(null); onChanged() }} />}
    </section>
  )
}

const itemsLine = (r: MaterialRecord) => r.items.map((i) => `${i.material}${i.variant ? ` ${i.variant}` : ''} × ${unitText(i.quantity, i.unit)}`).join(', ')

function MaterialBlock({ b, onEdit, onVoid }: { b: PatientBlock<MaterialRecord>; onEdit: (r: MaterialRecord) => void; onVoid: (r: MaterialRecord) => void }) {
  const sums = materialSums(b.rows)
  const [open, setOpen] = useState<string | null>(null)
  const [showRecords, setShowRecords] = useState(false)
  const active = b.rows.filter((r) => !r.voidedAt).length
  return (
    <div className={`usage-block${b.general ? ' usage-block--general' : ''}`}>
      <BlockHead b={b} count={`${active} ${active === 1 ? 'registro' : 'registros'}`} />
      <table className="table usage-table usage-mat">
        <thead><tr><th>Material</th><th>Cantidad</th><th /></tr></thead>
        <tbody>{sums.map((s) => <SumRow key={s.key} s={s} open={open === s.key} onToggle={() => setOpen(open === s.key ? null : s.key)} />)}</tbody>
      </table>
      <button type="button" className="btn btn--ghost btn--sm usage-records-btn" aria-expanded={showRecords} onClick={() => setShowRecords(!showRecords)}>
        {showRecords ? <ChevronDown size={14} /> : <ChevronRight size={14} />}Registros ({b.rows.length})</button>
      {showRecords && <ul className="usage-records">{b.rows.map((r) => <RecordLine key={r.id} r={r} onEdit={onEdit} onVoid={onVoid} />)}</ul>}
    </div>
  )
}

function SumRow({ s, open, onToggle }: { s: MaterialSum; open: boolean; onToggle: () => void }) {
  return (<>
    <tr className={s.quantity ? undefined : 'is-void'}>
      <td><b>{s.material}</b>{s.variant ? ` ${s.variant}` : ''}</td>
      <td className="num usage-qty">{s.quantity ? unitText(s.quantity, s.unit) : '0'}</td>
      <td style={{ textAlign: 'right' }}><button type="button" className="btn btn--ghost btn--sm" aria-expanded={open} onClick={onToggle}>{open ? 'Ocultar' : `Ver (${s.parts.length})`}</button></td>
    </tr>
    {open && <tr className="usage-parts"><td colSpan={3}><ul>{s.parts.map((p, i) => (
      <li key={i} className={p.voided ? 'is-void' : undefined}>{dmyTime(p.at)} · {p.by} · {unitText(p.quantity, s.unit)}{p.voided ? ' (anulado)' : ''}</li>
    ))}</ul></td></tr>}
  </>)
}

/** Un registro: quién, cuándo y qué. «Corregir» (autor, periodo de gracia) y «Anular» (autor o Administración). */
function RecordLine({ r, onEdit, onVoid }: { r: MaterialRecord; onEdit: (r: MaterialRecord) => void; onVoid: (r: MaterialRecord) => void }) {
  const { user, can } = useStore()
  const grace = useGrace(r.graceUntil, r.recordedBy)
  const mayVoid = !r.voidedAt && (can('usage.void') || (can('usage.record') && user?.id === r.recordedBy))
  return (
    <li className={r.voidedAt ? 'is-void' : undefined}>
      <div className="usage-records__text">
        <span className="num">{dmyTime(r.recordedAt)}</span> · {r.recordedByName} · <span className="muted">{r.periodLabel}</span>
        <div className="usage-records__items">{itemsLine(r)}</div>
        {r.version > 1 && <span className="chip version-tag">Corregido · v{r.version}</span>}
        {r.voidedAt && <small className="usage-records__void">Anulado por {r.voidedByName} el {dmyTime(r.voidedAt)}. Motivo: {r.voidReason}</small>}
      </div>
      <div className="usage-records__acts">
        {grace && !r.voidedAt && <button className="btn btn--soft btn--sm" onClick={() => onEdit(r)}><PencilLine size={14} />Corregir <small>hasta {time(r.graceUntil!)}</small></button>}
        {mayVoid && <button className="btn btn--ghost btn--sm" onClick={() => onVoid(r)}><Ban size={14} />Anular</button>}
      </div>
    </li>
  )
}

function VoidRecord({ r, onClose, onDone }: { r: MaterialRecord; onClose: () => void; onDone: () => void }) {
  const { notify } = useStore()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = useCallback(async () => {
    setBusy(true)
    try { await api(`/usage/material/${r.id}/void`, { body: { reason } }); notify('Registro anulado: ya no suma'); onDone() } catch (e) { notify((e as Error).message, 'error') } finally { setBusy(false) }
  }, [r.id, reason, notify, onDone])
  return (
    <Modal title="Anular registro de material" onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={busy || reason.trim().length < 5} onClick={() => void submit()}>Anular</button>
    </>}>
      <p style={{ marginTop: 0 }}><b>{r.general ? GENERAL_USE_LABEL : r.patientName}</b> · {r.periodLabel}<br />{itemsLine(r)}</p>
      <p className="muted">El registro no se borra: queda tachado, con quién lo anuló y por qué, y deja de sumar.</p>
      <label className="field"><span>Motivo de la anulación</span>
        <input className="input" value={reason} maxLength={300} autoFocus onChange={(e) => setReason(e.target.value)} placeholder="Ej. se registró al paciente equivocado" /></label>
    </Modal>
  )
}
