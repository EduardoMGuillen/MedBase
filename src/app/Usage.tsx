import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Ban, ChevronDown, ChevronsDownUp, ChevronsUpDown, FileSpreadsheet, ListChecks, PencilLine, Plus, Printer } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { Loading, Modal, PageHead, SectionHead } from '../components/ui'
import { DateField } from '../components/DateTimeField'
import { TabRow } from '../components/TabRow'
import { Pagination, paginate, usePage } from '../components/Pagination'
import { useGrace } from '../components/Grace'
import { dmyTime, time } from '../lib/format'
import { GENERAL_USE_LABEL, SUPPLY_PERIODS, USAGE_AREAS } from '../lib/clinicalConfig'
import { byCategory, currentPeriod, periodOf, rangeOf, unitText, usageFileName, type SupplySettings, type UsagePeriod } from '../lib/supplies'
import { download } from '../lib/csv'
import { UsagePrint } from './UsagePrint'
import {
  areaText, byArea, byPatient, materialRows, materialSums, materialTotalRows, medSummary, totalsHeadline, totalText, totalWho, USAGE_AREA_LIST, type MaterialRecord, type MedUse, type PatientBlock,
  type UsageArea,
} from '../lib/usage'
import { MaterialForm } from './MaterialForm'

type Tab = 'meds' | 'material'

/** Filtros del registro: el periodo de la clínica (turno, día o semana) o un rango de fechas, el área y la búsqueda. */
export interface UsageFilter { period: UsagePeriod; area: UsageArea | 'all'; q: string; endDay?: string }

/** Los datos del registro con los filtros de la pantalla (completos: la paginación es solo de la pantalla). */
function useUsage<T>(path: 'meds' | 'material', f: UsageFilter | null, key: number) {
  const [data, setData] = useState<T[] | null>(null)
  const [order, setOrder] = useState<string[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    if (!f) return
    let alive = true
    const qs = new URLSearchParams({ from: f.period.start, to: f.period.end, area: f.area, q: f.q })
    api<{ rows?: T[]; records?: T[]; order?: string[] }>(`/usage/${path}?${qs}`)
      .then((r) => { if (alive) { setData((r.rows ?? r.records) as T[]); setOrder(r.order ?? []); setError('') } }).catch((e: Error) => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [path, f, key])
  return { data, order, error }
}

/**
 * RU2 (ronda 14) y RU9 (ronda 15): «Registro de uso de medicamentos y material» (menú «Uso de medicamentos y material»). Enfermería, Recepción y
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

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** RU9: qué bloques están cerrados (abiertos al entrar, A16), con «Abrir todo» y «Cerrar todo». */
function useClosed() {
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const toggle = (k: string) => setClosed((c) => { const n = new Set(c); if (n.has(k)) n.delete(k); else n.add(k); return n })
  return { closed, toggle, setClosed }
}

/**
 * RU9 (ronda 15): los bloques por paciente, en grupos: primero «Uso general del servicio» (A11) y luego Consulta externa,
 * Observación y Hospitalización, cada grupo con su título y cuántos pacientes. Lo usan «Material» y «Medicamentos» (A15).
 */
function BlockGroups<T>({ blocks, all, closed, toggle, head, body }: {
  blocks: PatientBlock<T>[]; all: PatientBlock<T>[]; closed: Set<string>; toggle: (k: string) => void
  head: (b: PatientBlock<T>) => string; body: (b: PatientBlock<T>) => ReactNode
}) {
  const totals = new Map(byArea(all).map((g) => [g.key, g.blocks.length]))
  return (<>
    {byArea(blocks).map((g) => (
      <section key={g.key} className={`ub-group${g.key === 'general' ? ' ub-group--general' : ''}`} aria-label={g.title}>
        {g.key !== 'general' && <h3 className="ub-group__title">{g.title} <span className="muted">· {plural(totals.get(g.key) ?? g.blocks.length, 'paciente', 'pacientes')}</span></h3>}
        {g.blocks.map((b) => {
          const open = !closed.has(b.key)
          return (
            <div key={b.key} className={`ub${b.general ? ' ub--general' : ''}${open ? ' is-open' : ''}`}>
              <button type="button" className="ub__head" aria-expanded={open} onClick={() => toggle(b.key)}>
                <ChevronDown size={16} className="ub__chev" aria-hidden="true" />
                <b className="ub__name">{b.name}</b>
                {!b.general && <span className="muted ub__where">{[b.record, b.location].filter(Boolean).join(' · ')}</span>}
                <span className="ub__count">{head(b)}</span>
              </button>
              {open && <div className="ub__body">{body(b)}</div>}
            </div>
          )
        })}
      </section>
    ))}
  </>)
}

function OpenAll({ onAll }: { onAll: (open: boolean) => void }) {
  return (
    <span className="ub-all">
      <button type="button" className="btn btn--ghost btn--sm" onClick={() => onAll(true)}><ChevronsUpDown size={15} />Abrir todo</button>
      <button type="button" className="btn btn--ghost btn--sm" onClick={() => onAll(false)}><ChevronsDownUp size={15} />Cerrar todo</button>
    </span>
  )
}

/** Pestaña «Medicamentos»: «Por paciente» (los mismos bloques y el mismo orden que «Material», A15) o el «Resumen» (modo suma). */
function MedsTab({ filter, reloadKey }: { filter: UsageFilter; reloadKey: number }) {
  const { data, error } = useUsage<MedUse>('meds', filter, reloadKey)
  const [view, setView] = useState<'patients' | 'summary'>('patients')
  const blocks = useMemo(() => byPatient(data ?? [], (a, b) => a.at.localeCompare(b.at)), [data])
  const summary = useMemo(() => medSummary(data ?? []), [data])
  const [pageNo, setPage] = usePage(JSON.stringify([filter.period.start, filter.period.end, filter.area, filter.q, view]))
  const { closed, toggle, setClosed } = useClosed()
  const pg = paginate(blocks, pageNo)
  const sp = paginate(summary, pageNo)
  if (error) return <section className="panel"><div className="empty">{error}</div></section>
  if (!data) return <Loading label="Buscando lo que se aplicó" />
  return (
    <section className="panel usage-tab">
      <SectionHead title="Medicamentos aplicados" sub={`${plural(data.length, 'aplicación', 'aplicaciones')} de ${plural(blocks.length, 'paciente', 'pacientes')}. Se llena solo con las dosis «Administrado» de la hoja de medicamentos y lo aplicado en consulta externa. Las correcciones se hacen donde se registró.`}
        action={<OutputButtons tab="meds" filter={filter} meds={data} />} />
      <div className="ub-tools">
        <div className="segmented" role="radiogroup" aria-label="Vista">
          <button type="button" role="radio" aria-checked={view === 'patients'} onClick={() => setView('patients')}>Por paciente</button>
          <button type="button" role="radio" aria-checked={view === 'summary'} onClick={() => setView('summary')}>Resumen</button>
        </div>
        {view === 'patients' && blocks.length > 0 && <OpenAll onAll={(on) => setClosed(on ? new Set() : new Set(blocks.map((b) => b.key)))} />}
      </div>
      {!data.length && <div className="empty">No se aplicaron medicamentos en este periodo{filter.area !== 'all' ? ` en ${areaText(filter.area)}` : ''}.</div>}
      {view === 'patients' && (<>
        <BlockGroups blocks={pg.rows} all={blocks} closed={closed} toggle={toggle} head={(b) => plural(b.rows.length, 'aplicación', 'aplicaciones')}
          body={(b) => b.rows.map((r) => (
            <div key={r.id} className="ub-row ub-row--med">
              <span className="ub-row__main"><span className="num muted ub-row__at">{dmyTime(r.at)}</span> <b>{r.medication}</b></span>
              <small className="muted ub-row__side">Aplicó {r.appliedBy}{r.appliedByTitle ? ` (${r.appliedByTitle})` : ''} · Indicó {r.orderedBy}</small>
            </div>
          ))} />
        <Pagination {...pg} onPage={setPage} label="Páginas de pacientes" />
      </>)}
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

/**
 * Pestaña «Material» (RU9, ronda 15): dos vistas que no se muestran a la vez. «Por paciente» (por defecto): el uso general
 * primero y luego los pacientes por área, en bloques compactos (una línea de encabezado y una fila por material) con un solo
 * «Ver registros (n)». «Total del periodo»: una tabla por categoría con Material, Variante, Cantidad y Pacientes.
 */
function MaterialTab({ filter, reloadKey, onChanged }: { filter: UsageFilter; reloadKey: number; onChanged: () => void }) {
  const { can } = useStore()
  const { data, order, error } = useUsage<MaterialRecord>('material', filter, reloadKey)
  const [form, setForm] = useState<MaterialRecord | 'new' | null>(null)
  const [voiding, setVoiding] = useState<MaterialRecord | null>(null)
  const [view, setView] = useState<'patients' | 'total'>('patients')
  const blocks = useMemo(() => byPatient(data ?? [], (a, b) => a.recordedAt.localeCompare(b.recordedAt)), [data])
  const totals = useMemo(() => materialTotalRows(data ?? [], order), [data, order])
  const [pageNo, setPage] = usePage(JSON.stringify([filter.period.start, filter.period.end, filter.area, filter.q, 'material']))
  const { closed, toggle, setClosed } = useClosed()
  const pg = paginate(blocks, pageNo)
  if (error) return <section className="panel"><div className="empty">{error}</div></section>
  return (
    <section className="panel usage-tab">
      <SectionHead title="Material médico quirúrgico" sub="Por paciente, en modo suma: lo que se registra varias veces en el periodo se suma. Un registro anulado se ve tachado y no suma."
        action={<>
          {data && <OutputButtons tab="material" filter={filter} records={data} />}
          {can('usage.record') && <button className="btn btn--primary usage-add" onClick={() => setForm('new')}><Plus size={16} />Registrar material</button>}
        </>} />
      {!data ? <Loading label="Buscando el material registrado" /> : (<>
        <div className="ub-tools">
          <div className="segmented" role="radiogroup" aria-label="Vista">
            <button type="button" role="radio" aria-checked={view === 'patients'} onClick={() => setView('patients')}>Por paciente</button>
            <button type="button" role="radio" aria-checked={view === 'total'} onClick={() => setView('total')}>Total del periodo</button>
          </div>
          {view === 'patients' && blocks.length > 0 && <OpenAll onAll={(on) => setClosed(on ? new Set() : new Set(blocks.map((b) => b.key)))} />}
        </div>
        {!data.length && <div className="empty">No hay material registrado en este periodo{filter.area !== 'all' ? ` en ${areaText(filter.area)}` : ''}.</div>}
        {view === 'patients' && (<>
          <BlockGroups blocks={pg.rows} all={blocks} closed={closed} toggle={toggle}
            head={(b) => { const n = materialSums(b.rows).filter((s) => s.quantity > 0).length; const r = b.rows.filter((x) => !x.voidedAt).length; return `${plural(n, 'material', 'materiales')} · ${plural(r, 'registro', 'registros')}` }}
            body={(b) => <MaterialBlockBody b={b} onEdit={setForm} onVoid={setVoiding} />} />
          <Pagination {...pg} onPage={setPage} label="Páginas de pacientes" />
        </>)}
        {view === 'total' && totals.length > 0 && (
          <div className="ub-total">
            <p className="ub-total__line" role="status"><b>{totalsHeadline(data, totals)}</b></p>
            <table className="table ub-total__table">
              <thead><tr><th>Material</th><th>Variante</th><th className="num">Cantidad</th><th>Pacientes</th></tr></thead>
              {byCategory(totals).map((g) => (
                <tbody key={g.category}>
                  <tr className="ub-total__cat"><th colSpan={4}>{g.category}</th></tr>
                  {g.rows.map((s) => (
                    <tr key={s.key}>
                      <td data-label="Material"><b>{s.material}</b></td>
                      <td data-label="Variante">{s.variant || <span className="muted">—</span>}</td>
                      <td data-label="Cantidad" className="num ub-total__qty">{unitText(s.quantity, s.unit)}</td>
                      <td data-label="Pacientes" className="muted">{totalWho(s)}</td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        )}
        {view === 'total' && data.length > 0 && !totals.length && <div className="empty">Todos los registros de este periodo están anulados.</div>}
      </>)}
      {form && <MaterialForm editing={form === 'new' ? undefined : form} onClose={() => setForm(null)} onSaved={() => { setForm(null); onChanged() }} />}
      {voiding && <VoidRecord r={voiding} onClose={() => setVoiding(null)} onDone={() => { setVoiding(null); onChanged() }} />}
    </section>
  )
}

const itemsLine = (r: MaterialRecord) => r.items.map((i) => `${i.material}${i.variant ? ` ${i.variant}` : ''} × ${unitText(i.quantity, i.unit)}`).join(', ')

/** RU9: un bloque abierto: una fila por material (~32 px), la cantidad a la derecha; un solo «Ver registros (n)». */
function MaterialBlockBody({ b, onEdit, onVoid }: { b: PatientBlock<MaterialRecord>; onEdit: (r: MaterialRecord) => void; onVoid: (r: MaterialRecord) => void }) {
  const sums = materialSums(b.rows)
  const [showRecords, setShowRecords] = useState(false)
  return (<>
    {sums.map((s) => (
      <div key={s.key} className={`ub-row${s.quantity ? '' : ' is-void'}`}>
        <span className="ub-row__main"><b>{s.material}</b>{s.variant ? ` ${s.variant}` : ''}</span>
        <span className="num ub-row__qty">{s.quantity ? unitText(s.quantity, s.unit) : '0'}</span>
      </div>
    ))}
    <button type="button" className="btn btn--ghost btn--sm ub__records" aria-expanded={showRecords} onClick={() => setShowRecords(!showRecords)}>
      {showRecords ? 'Ocultar registros' : `Ver registros (${b.rows.length})`}</button>
    {showRecords && <ul className="usage-records">{b.rows.map((r) => <RecordLine key={r.id} r={r} onEdit={onEdit} onVoid={onVoid} />)}</ul>}
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
        {r.sets && r.sets.length > 0 && <div className="usage-records__set">{r.sets.length === 1 ? 'Set' : 'Sets'}: {r.sets.map((x) => x.name).join(', ')}</div>}
        <div className="usage-records__items">{itemsLine(r)}</div>
        {r.version > 1 && <span className="badge version-tag">Corregido · v{r.version}</span>}
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
      <p className="mt-0"><b>{r.general ? GENERAL_USE_LABEL : r.patientName}</b> · {r.periodLabel}<br />{itemsLine(r)}</p>
      <p className="muted">El registro no se borra: queda tachado, con quién lo anuló y por qué, y deja de sumar.</p>
      <label className="field"><span>Motivo de la anulación</span>
        <input className="input" value={reason} maxLength={300} autoFocus onChange={(e) => setReason(e.target.value)} placeholder="Ej. se registró al paciente equivocado" /></label>
    </Modal>
  )
}

/**
 * RU3 (ronda 14): «Imprimir» y «Exportar a Excel» lo filtrado en pantalla, completo (no solo la página de GE5). El Excel se arma
 * en el navegador con ExcelJS, que se carga recién al pulsar el botón. Cada impresión y exportación queda en la bitácora.
 */
function OutputButtons({ tab, filter, meds = [], records = [] }: { tab: Tab; filter: UsageFilter; meds?: MedUse[]; records?: MaterialRecord[] }) {
  const { can, notify, user, settings } = useStore()
  const [printAt, setPrintAt] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const rows = tab === 'meds' ? meds.length : materialRows(records).length
  const log = useCallback((how: 'print' | 'excel', file?: string) =>
    api('/usage/log', { body: { tab, how, period: filter.period.label, area: areaText(filter.area), q: filter.q, rows, file } }).catch(() => null), [tab, filter, rows])
  useEffect(() => {
    if (!printAt) return
    document.body.classList.add('usage-printing')
    const done = () => { document.body.classList.remove('usage-printing'); setPrintAt(null) }
    window.addEventListener('afterprint', done, { once: true })
    const t = setTimeout(() => window.print(), 200)
    return () => { clearTimeout(t); window.removeEventListener('afterprint', done); document.body.classList.remove('usage-printing') }
  }, [printAt])
  if (!can('usage.export')) return null
  const print = () => { void log('print'); setPrintAt(new Date().toISOString()) }
  const exportExcel = async () => {
    setBusy(true)
    try {
      const [mod, x] = await Promise.all([import('exceljs'), import('../lib/usageExcel')])
      const ExcelJS = ((mod as unknown as { default?: unknown }).default ?? mod) as Parameters<typeof x.buildMedsWorkbook>[0]
      const info = { title: tab === 'meds' ? 'Registro de uso de medicamentos' : 'Registro de uso de material', periodLabel: filter.period.label, areaLabel: areaText(filter.area),
        q: filter.q, by: user?.name ?? '', at: new Date(), clinic: settings.name }
      const wb = tab === 'meds' ? x.buildMedsWorkbook(ExcelJS, info, meds) : x.buildMaterialWorkbook(ExcelJS, info, records)
      const file = usageFileName(tab, filter.period, filter.endDay)
      const buf = await wb.xlsx.writeBuffer()
      await log('excel', file)
      download(file, buf as ArrayBuffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    } catch (e) { notify(`No se pudo generar el Excel: ${(e as Error).message}`, 'error') } finally { setBusy(false) }
  }
  return (<>
    <button type="button" className="btn btn--ghost usage-out" onClick={print}><Printer size={16} />Imprimir</button>
    <button type="button" className="btn btn--ghost usage-out" disabled={busy} onClick={() => void exportExcel()}><FileSpreadsheet size={16} />{busy ? 'Generando…' : 'Exportar a Excel'}</button>
    {printAt && <UsagePrint tab={tab} meds={meds} records={records} periodLabel={filter.period.label} areaLabel={areaText(filter.area)} q={filter.q} at={printAt} />}
  </>)
}
