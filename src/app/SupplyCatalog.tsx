import { useMemo, useState } from 'react'
import { setShiftList, useSupplies } from '../lib/useSupplies'
import { Archive, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { Modal, PageHead, SectionHead } from '../components/ui'
import { TimeField } from '../components/DateTimeField'
import { Pagination, paginate, usePage } from '../components/Pagination'
import { dmyTime } from '../lib/format'
import { SUPPLY_MAX_SHIFTS, SUPPLY_PERIODS } from '../lib/clinicalConfig'
import {
  byCategory, gaugeOnly, matchesSupply, shiftProblems, stripLength, supplyLabel, SUPPLY_UNIT_LIST, type SupplyItem, type SupplyPeriod, type SupplySettings, type SupplyShift, type SupplyUnit,
} from '../lib/supplies'

/**
 * RU1 (ronda 14): Configuración › «Material médico quirúrgico». Lista agrupada por categoría, con buscador, «Solo mi lista de
 * turno» y la paginación de GE5. Administración agrega, edita y archiva (y restaura desde «Ver archivados»); Administración y
 * Enfermería marcan la lista de turno. Debajo, el «Periodo de registro del material».
 */
export function SupplyCatalog() {
  const { can, notify } = useStore()
  const manage = can('supplies.manage')
  const toggleList = can('supplies.shiftlist')
  const [archived, setArchived] = useState(false)
  const { items, settings, reload, error, setItems } = useSupplies(archived)
  const [q, setQ] = useState('')
  const [onlyList, setOnlyList] = useState(false)
  const [editing, setEditing] = useState<SupplyItem | 'new' | null>(null)
  const [archiving, setArchiving] = useState<SupplyItem | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const all = useMemo(() => items ?? [], [items])
  const active = all.filter((i) => !i.archivedAt)
  const listed = active.filter((i) => i.onShiftList)
  const shown = (archived ? all.filter((i) => i.archivedAt) : active).filter((i) => (!onlyList || i.onShiftList) && (!q.trim() || matchesSupply(i, q)))
  // El orden del catálogo: categoría (en el orden en que aparece) y luego el de cada línea
  const catOrder = new Map<string, number>()
  all.forEach((i, n) => { if (!catOrder.has(i.category)) catOrder.set(i.category, n) })
  const sorted = [...shown].sort((a, b) => (catOrder.get(a.category)! - catOrder.get(b.category)!) || 0)
  const [pageNo, setPage] = usePage(JSON.stringify([q, onlyList, archived]))
  const pg = paginate(sorted, pageNo)
  const cats = new Set(active.map((i) => i.category)).size

  const flip = async (i: SupplyItem) => {
    setBusy(i.id)
    try {
      const r = await setShiftList(i.id, !i.onShiftList)
      setItems((list) => list?.map((x) => (x.id === r.id ? r : x)) ?? null)
      notify(r.onShiftList ? `${supplyLabel(r)} quedó en la lista de turno` : `${supplyLabel(r)} salió de la lista de turno`)
    } catch (e) { notify((e as Error).message, 'error') } finally { setBusy(null) }
  }
  const restore = async (i: SupplyItem) => {
    try { await api(`/supplies/${i.id}/restore`, { method: 'POST' }); notify(`${supplyLabel(i)} se restauró`); reload() } catch (e) { notify((e as Error).message, 'error') }
  }
  return (<>
    <section className="panel table-wrap supply-cat">
      <SectionHead title="Material médico quirúrgico"
        sub="El material que enfermería registra al usarlo. Solo es registro: no es inventario ni se cobra. Lo archivado deja de ofrecerse; los registros anteriores lo siguen mostrando."
        action={<>
          {manage && <button className="btn btn--ghost btn--sm" onClick={() => setArchived(!archived)}>{archived ? 'Ver activos' : 'Ver archivados'}</button>}
          {manage && !archived && <button className="btn btn--primary btn--sm" onClick={() => setEditing('new')}><Plus size={15} />Agregar material</button>}
        </>} />
      <div className="panel__body supply-tools">
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar material o variante (ej. seda 4)" aria-label="Buscar material" />
        {!archived && <label className="check-inline"><input type="checkbox" checked={onlyList} onChange={(e) => setOnlyList(e.target.checked)} />Solo mi lista de turno ({listed.length})</label>}
        <span className="muted supply-tools__count" role="status">
          {archived ? `${shown.length} archivado(s)` : `${active.length} líneas · ${cats} categorías · ${listed.length} en la lista de turno`}
        </span>
      </div>
      {error && <div className="empty">{error}</div>}
      {items && (
        <table className="table table--cards supply-table">
          <thead><tr><th>Material</th><th>Variante</th><th>Unidad</th><th>En la lista de turno</th><th /></tr></thead>
          {byCategory(pg.rows).map((g) => (
            <tbody key={g.category}>
              <tr className="supply-table__cat"><th colSpan={5}>{g.category} <small className="muted">({shown.filter((i) => i.category === g.category).length})</small></th></tr>
              {g.rows.map((i) => (
                <tr key={i.id} className={i.archivedAt ? 'is-archived' : undefined}>
                  <td className="tc-full"><b>{i.material}</b>
                    {i.origin === 'clinic' ? <small className="muted supply-origin">Agregado por la clínica</small> : i.editedAt ? <small className="muted supply-origin">Editado por la clínica</small> : null}
                    {i.archivedAt && <small className="muted supply-origin">Archivado el {dmyTime(i.archivedAt)}</small>}
                  </td>
                  <td data-label="Variante">{i.variant || '—'}</td>
                  <td data-label="Unidad">{i.unit}</td>
                  <td data-label="En la lista de turno">
                    <label className="check-inline supply-check">
                      <input type="checkbox" checked={i.onShiftList} disabled={!toggleList || !!i.archivedAt || busy === i.id} onChange={() => void flip(i)}
                        aria-label={`${supplyLabel(i)} en la lista de turno`} />
                      <span>{i.onShiftList ? 'Sí' : 'No'}</span>
                    </label>
                  </td>
                  <td className="tc-actions" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {manage && !i.archivedAt && <>
                      <button className="btn btn--ghost btn--sm" onClick={() => setEditing(i)}><Pencil size={14} />Editar</button>
                      <button className="btn btn--ghost btn--sm" onClick={() => setArchiving(i)}><Archive size={14} />Archivar</button>
                    </>}
                    {manage && i.archivedAt && <button className="btn btn--ghost btn--sm" onClick={() => void restore(i)}><RotateCcw size={14} />Restaurar</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      )}
      <Pagination {...pg} onPage={setPage} label="Páginas del catálogo de material" />
      {items && !shown.length && <div className="empty">{archived ? 'No hay materiales archivados.' : 'Ningún material coincide.'}</div>}
      {editing && <SupplyForm item={editing === 'new' ? undefined : editing} categories={[...catOrder.keys()]} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />}
      {archiving && (
        <Modal title="Archivar material" onClose={() => setArchiving(null)} footer={<>
          <button className="btn btn--ghost" onClick={() => setArchiving(null)}>Cancelar</button>
          <button className="btn btn--primary" onClick={async () => {
            try { await api(`/supplies/${archiving.id}/archive`, { method: 'POST' }); notify(`${supplyLabel(archiving)} se archivó`); setArchiving(null); reload() } catch (e) { notify((e as Error).message, 'error') }
          }}><Archive size={15} />Archivar</button>
        </>}>
          <p style={{ marginTop: 0 }}><b>{supplyLabel(archiving)}</b> deja de aparecer al registrar material y sale de la lista de turno. Los registros anteriores lo siguen mostrando. Se puede restaurar desde «Ver archivados».</p>
        </Modal>
      )}
    </section>
    <SupplyPeriodSettings settings={settings} editable={manage} onSaved={reload} />
  </>)
}

/** «Agregar material» y «Editar»: categoría, material, variante y unidad. Agujas y similares: solo calibre. */
function SupplyForm({ item, categories, onClose, onSaved }: { item?: SupplyItem; categories: string[]; onClose: () => void; onSaved: () => void }) {
  const { notify } = useStore()
  const [f, setF] = useState({ category: item?.category ?? '', material: item?.material ?? '', variant: item?.variant ?? '', unit: (item?.unit ?? 'unidad') as SupplyUnit, onShiftList: false })
  const [busy, setBusy] = useState(false)
  const gauge = gaugeOnly(f.material)
  const cleaned = stripLength(f.material, f.variant)
  const save = async () => {
    setBusy(true)
    try {
      const body = { category: f.category, material: f.material, variant: f.variant, unit: f.unit, ...(item ? {} : { onShiftList: f.onShiftList }) }
      const r = await api<SupplyItem>(item ? `/supplies/${item.id}` : '/supplies', { method: item ? 'PATCH' : 'POST', body })
      notify(item ? `${supplyLabel(r)} se guardó` : `${supplyLabel(r)} se agregó al catálogo`)
      onSaved()
    } catch (e) { notify((e as Error).message, 'error') } finally { setBusy(false) }
  }
  return (
    <Modal title={item ? 'Editar material' : 'Agregar material'} onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={busy || !f.category.trim() || !f.material.trim()} onClick={() => void save()}>{busy ? 'Guardando…' : 'Guardar'}</button>
    </>}>
      <div className="form-grid supply-form">
        <label className="field"><span>Categoría</span>
          <input className="input" list="supply-categories" value={f.category} maxLength={60} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="Ej. Suturas" />
          <datalist id="supply-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </label>
        <label className="field"><span>Material</span>
          <input className="input" value={f.material} maxLength={80} onChange={(e) => setF({ ...f, material: e.target.value })} placeholder="Ej. Nylon" /></label>
        <label className="field"><span>Variante (calibre, tipo de aguja, talla o tamaño)</span>
          <input className="input" value={f.variant} maxLength={80} onChange={(e) => setF({ ...f, variant: e.target.value })} placeholder={gauge ? 'Ej. 21 G' : 'Ej. 4/0, aguja cortante'} />
          {gauge && <small className="muted">Agujas, jeringas, catéteres y mariposas se distinguen solo por calibre (G), sin longitud.{cleaned !== f.variant.trim() ? ` Se guardará como «${cleaned || 'sin variante'}».` : ''}</small>}
        </label>
        <label className="field"><span>Unidad</span>
          <select className="select" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value as SupplyUnit })}>
            {SUPPLY_UNIT_LIST.map((u) => <option key={u} value={u}>{u}</option>)}
          </select></label>
        {!item && <label className="check-inline"><input type="checkbox" checked={f.onShiftList} onChange={(e) => setF({ ...f, onShiftList: e.target.checked })} />En la lista de turno</label>}
      </div>
    </Modal>
  )
}

/**
 * RU1 punto 7: «Periodo de registro del material»: «Por turno», «Por día» o «Por semana». Por turno, con turnos editables
 * (nombre, inicio y fin); empiezan con los de enfermería (Mañana, Tarde, Noche). Solo Administración lo cambia.
 */
function SupplyPeriodSettings({ settings, editable, onSaved }: { settings: SupplySettings; editable: boolean; onSaved: () => void }) {
  const { notify, staffById } = useStore()
  const [period, setPeriod] = useState<SupplyPeriod>(settings.period)
  const [shifts, setShifts] = useState<SupplyShift[]>(settings.shifts)
  const [seen, setSeen] = useState(settings)
  if (seen !== settings) { setSeen(settings); setPeriod(settings.period); setShifts(settings.shifts) }
  const [busy, setBusy] = useState(false)
  const problems = period === 'shift' || shifts.length ? shiftProblems(shifts) : []
  const dirty = period !== settings.period || JSON.stringify(shifts) !== JSON.stringify(settings.shifts)
  const set = (n: number, patch: Partial<SupplyShift>) => setShifts(shifts.map((s, i) => (i === n ? { ...s, ...patch } : s)))
  const save = async () => {
    setBusy(true)
    try { await api('/supplies/settings', { method: 'PUT', body: { period, shifts } }); notify('Periodo de registro guardado'); onSaved() } catch (e) { notify((e as Error).message, 'error') } finally { setBusy(false) }
  }
  return (
    <section className="panel supply-period">
      <SectionHead title="Periodo de registro del material" sub="Cómo se agrupa el material que registra enfermería. Dentro del periodo, se divide por paciente." />
      <div className="panel__body">
        <div className="segmented" role="radiogroup" aria-label="Periodo de registro del material">
          {(Object.keys(SUPPLY_PERIODS) as SupplyPeriod[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={period === k} disabled={!editable} onClick={() => setPeriod(k)}>{SUPPLY_PERIODS[k]}</button>
          ))}
        </div>
        <p className="muted supply-period__hint">{period === 'shift' ? 'Cada registro va al turno en que se hizo.' : period === 'day' ? 'Cada registro va al día en que se hizo; no se pide turno.' : 'Cada registro va a su semana, de lunes a domingo; no se pide turno.'}</p>
        {period === 'shift' && (
          <div className="supply-shifts">
            <div className="supply-shifts__head" aria-hidden="true"><span>Turno</span><span>Inicio</span><span>Fin</span><span /></div>
            {shifts.map((s, n) => (
              <div key={n} className="supply-shifts__row">
                <input className="input" value={s.label} maxLength={30} disabled={!editable} aria-label={`Nombre del turno ${n + 1}`} onChange={(e) => set(n, { label: e.target.value })} />
                {editable ? <TimeField value={s.from} label={`Inicio de ${s.label || 'el turno'}`} onChange={(v) => set(n, { from: v })} /> : <span className="num">{s.from}</span>}
                {editable ? <TimeField value={s.to} label={`Fin de ${s.label || 'el turno'}`} onChange={(v) => set(n, { to: v })} /> : <span className="num">{s.to}</span>}
                {editable && <button type="button" className="icon-btn" aria-label={`Quitar el turno ${s.label}`} disabled={shifts.length <= 1} onClick={() => setShifts(shifts.filter((_, i) => i !== n))}><Trash2 size={16} /></button>}
              </div>
            ))}
            {editable && shifts.length < SUPPLY_MAX_SHIFTS && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShifts([...shifts, { key: '', label: '', from: '07:00', to: '15:00' }])}><Plus size={14} />Agregar turno</button>
            )}
          </div>
        )}
        {editable && problems.length > 0 && <p className="field__msg field__msg--error">{problems[0]}</p>}
        {settings.updatedAt && <p className="muted supply-period__hint">Último cambio: {staffById(settings.updatedBy ?? '')?.name ?? ''} el {dmyTime(settings.updatedAt)}</p>}
        {editable && (
          <div className="supply-period__acts">
            <button className="btn btn--ghost btn--sm" disabled={!dirty} onClick={() => { setPeriod(settings.period); setShifts(settings.shifts) }}>Descartar cambios</button>
            <button className="btn btn--primary btn--sm" disabled={!dirty || busy || problems.length > 0} onClick={() => void save()}>{busy ? 'Guardando…' : 'Guardar periodo'}</button>
          </div>
        )}
      </div>
    </section>
  )
}

/** RU1: la pantalla del catálogo para quien no entra a Configuración (Enfermería: ve el catálogo y arma su lista de turno). */
export default function SupplyCatalogPage() {
  return (
    <div className="page">
      <PageHead title="Catálogo de material y lista de turno" sub="Marca lo que tu servicio usa en cada turno: es la lista corta que sale al registrar material. El resto sigue disponible con «Agregar otro material»." />
      <SupplyCatalog />
    </div>
  )
}
