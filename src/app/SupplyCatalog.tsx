import { useMemo, useState } from 'react'
import { setShiftList, useSupplies } from '../lib/useSupplies'
import { Archive, ChevronDown, ChevronsDownUp, ChevronsUpDown, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useStore } from '../lib/store'
import { api, ApiError } from '../lib/api'
import { Modal, PageHead, SectionHead } from '../components/ui'
import { TimeField } from '../components/DateTimeField'
import { TabRow } from '../components/TabRow'
import { Highlight, SupplySearch, supplyMatches } from '../components/SupplySearch'
import { SupplySetsTab } from './SupplySets'
import { RowMenu } from '../components/RowMenu'
import { dmyTime } from '../lib/format'
import { SUPPLY_GAUGE_HINT, SUPPLY_MAX_SHIFTS, SUPPLY_PERIODS, SUPPLY_SCOPES } from '../lib/clinicalConfig'
import {
  byCategory, gaugeOnly, shiftProblems, stripLength, supplyKey, supplyLabel, SUPPLY_SCOPE_LIST, SUPPLY_UNIT_LIST, type SupplyItem, type SupplyPeriod, type SupplyScope,
  type SupplySettings, type SupplyShift, type SupplyUnit,
} from '../lib/supplies'

type CatalogTab = 'materials' | 'sets' | 'period'

/**
 * RU1 (ronda 14) y RU4 (ronda 15): Configuración › «Material médico quirúrgico» (y «Catálogo de material y lista de turno» para
 * enfermería). Pestañas «Materiales», «Sets» (RU8) y «Periodo de registro».
 */
export function SupplyCatalog() {
  const [tab, setTab] = useState<CatalogTab>('materials')
  const { items, settings, reload, error, setItems, archived, setArchived } = useCatalog()
  return (<>
    <TabRow className="supply-tabs" label="Catálogo de material">
      <button className="tab" role="tab" aria-selected={tab === 'materials'} onClick={() => setTab('materials')}>Materiales</button>
      <button className="tab" role="tab" aria-selected={tab === 'sets'} onClick={() => setTab('sets')}>Sets</button>
      <button className="tab" role="tab" aria-selected={tab === 'period'} onClick={() => setTab('period')}>Periodo de registro</button>
    </TabRow>
    {tab === 'materials' && <SupplyMaterials items={items} error={error} reload={reload} setItems={setItems} archived={archived} setArchived={setArchived} />}
    {tab === 'sets' && <SupplySetsTab />}
    {tab === 'period' && <SupplyPeriodSettings settings={settings} onSaved={reload} />}
  </>)
}

function useCatalog() {
  const [archived, setArchived] = useState(false)
  const s = useSupplies(archived)
  return { ...s, archived, setArchived }
}

/** Estado de las categorías abiertas, por usuario, en este navegador. */
function useOpenCategories(userId: string) {
  const key = `clinara.catalogo-material.${userId}`
  const [open, setOpen] = useState<Set<string>>(() => {
    try { const v = localStorage.getItem(key); return new Set(v ? (JSON.parse(v) as string[]) : []) } catch { return new Set() }
  })
  const save = (next: Set<string>) => {
    setOpen(next)
    try { localStorage.setItem(key, JSON.stringify([...next])) } catch { /* sin almacenamiento */ }
  }
  return [open, save] as const
}

/**
 * RU4 (ronda 15): «Materiales». Una fila de encabezado por categoría, desplegable («Suturas · 26 · 1 en la lista de turno»),
 * cerradas al entrar (el estado se recuerda por usuario); con «Solo mi lista de turno» se abren las que tienen líneas marcadas y
 * al buscar, las que tienen resultados (con lo que coincide resaltado). Dentro, el material una vez y debajo sus variantes, en
 * filas compactas: Material, Variante, Unidad, Registro, Lista de turno (solo la casilla) y «⋯» (Editar, Agregar variante,
 * Archivar según permisos). Sin la paginación de GE5 (A5). «Agregar material»: Administración y Enfermería (A4).
 */
function SupplyMaterials({ items, error, reload, setItems, archived, setArchived }: {
  items: SupplyItem[] | null; error: string; reload: () => void; setItems: ReturnType<typeof useSupplies>['setItems']; archived: boolean; setArchived: (v: boolean) => void
}) {
  const { can, notify, user } = useStore()
  const manage = can('supplies.manage')
  const add = can('supplies.add')
  const toggleList = can('supplies.shiftlist')
  const [q, setQ] = useState('')
  const [onlyList, setOnlyList] = useState(false)
  const [open, saveOpen] = useOpenCategories(user?.id ?? '')
  // Durante una búsqueda, las categorías con resultados se abren solas; las que la persona cierra quedan cerradas
  const [searchClosed, setSearchClosed] = useState<{ q: string; cats: Set<string> }>({ q: '', cats: new Set() })
  const [editing, setEditing] = useState<{ item?: SupplyItem; preset?: { category: string; material: string } } | null>(null)
  const [archiving, setArchiving] = useState<SupplyItem | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const all = useMemo(() => items ?? [], [items])
  const active = all.filter((i) => !i.archivedAt)
  const listed = active.filter((i) => i.onShiftList)
  const pool = archived ? all.filter((i) => i.archivedAt) : active
  const searching = q.trim().length >= 2
  const shown = (searching ? supplyMatches(pool, q) : pool).filter((i) => !onlyList || i.onShiftList)
  // El orden del catálogo: categoría (en el orden en que aparece) y dentro, el de cada línea
  const groups = byCategory(shown)
  const counts = new Map(byCategory(pool).map((g) => [g.category, { n: g.rows.length, list: g.rows.filter((i) => i.onShiftList).length }]))
  const categories = [...new Set(all.map((i) => i.category))]
  const isOpen = (c: string) => (searching ? !(searchClosed.q === q && searchClosed.cats.has(c)) : open.has(c))
  const toggle = (c: string) => {
    if (searching) {
      const cats = new Set(searchClosed.q === q ? searchClosed.cats : [])
      if (cats.has(c)) cats.delete(c); else cats.add(c)
      setSearchClosed({ q, cats })
      return
    }
    const next = new Set(open)
    if (next.has(c)) next.delete(c); else next.add(c)
    saveOpen(next)
  }
  const setAll = (on: boolean) => {
    if (searching) setSearchClosed({ q, cats: on ? new Set() : new Set(groups.map((g) => g.category)) })
    else saveOpen(on ? new Set(groups.map((g) => g.category)) : new Set())
  }
  const onlyMine = (v: boolean) => {
    setOnlyList(v)
    if (v) saveOpen(new Set(byCategory(listed).map((g) => g.category)))
  }

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
  const cats = new Set(active.map((i) => i.category)).size
  return (
    <section className="panel supply-cat">
      <SectionHead title="Material médico quirúrgico"
        sub="El material que enfermería registra al usarlo. Solo es registro: no es inventario ni se cobra. Lo archivado deja de ofrecerse; los registros anteriores lo siguen mostrando."
        action={<>
          {manage && <button className="btn btn--ghost btn--sm" onClick={() => setArchived(!archived)}>{archived ? 'Ver activos' : 'Ver archivados'}</button>}
          {add && !archived && <button className="btn btn--primary btn--sm supply-add" onClick={() => setEditing({})}><Plus size={15} />Agregar material</button>}
        </>} />
      <div className="panel__body supply-tools">
        <SupplySearch items={pool} value={q} onChange={setQ} placeholder="Buscar material o variante (ej. seda 4)" label="Buscar en el catálogo" />
        {!archived && <label className="check-inline supply-tools__mine"><input type="checkbox" checked={onlyList} onChange={(e) => onlyMine(e.target.checked)} />Solo mi lista de turno ({listed.length})</label>}
        <span className="muted supply-tools__count" role="status">
          {archived ? `${pool.length} archivado(s)` : `${active.length} líneas · ${cats} categorías · ${listed.length} en la lista de turno`}
        </span>
        <span className="supply-tools__all">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAll(true)}><ChevronsUpDown size={15} />Abrir todo</button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAll(false)}><ChevronsDownUp size={15} />Cerrar todo</button>
        </span>
      </div>
      {error && <div className="empty">{error}</div>}
      {items && groups.length > 0 && (
        <div className="supply-grid" role="table" aria-label="Catálogo de material">
          <div className="supply-grid__head" role="row">
            <span role="columnheader">Material</span><span role="columnheader">Variante</span><span role="columnheader">Unidad</span>
            <span role="columnheader">Registro</span><span role="columnheader" className="supply-grid__c">Lista de turno</span><span role="columnheader"><span className="sr-only">Acciones</span></span>
          </div>
          {groups.map((g) => {
            const on = isOpen(g.category)
            const c = counts.get(g.category) ?? { n: g.rows.length, list: 0 }
            return (
              <div key={g.category} role="rowgroup" className={`supply-grid__group${on ? ' is-open' : ''}`}>
                <button type="button" className="supply-grid__cat" aria-expanded={on} onClick={() => toggle(g.category)}>
                  <ChevronDown size={16} className="supply-grid__chev" aria-hidden="true" />
                  <b>{g.category}</b>
                  <span className="muted">· {searching || onlyList ? `${g.rows.length} de ${c.n}` : c.n}{c.list ? ` · ${c.list} en la lista de turno` : ''}</span>
                </button>
                {on && g.rows.map((i, n) => {
                  const first = n === 0 || g.rows[n - 1].material !== i.material
                  return (
                    <div key={i.id} role="row" className={`supply-grid__row${first ? ' is-first' : ''}${i.archivedAt ? ' is-archived' : ''}`}>
                      <span role="cell" className="supply-grid__mat"><b className={first ? undefined : 'is-repeat'}><Highlight text={i.material} q={searching ? q : ''} /></b>
                        {i.origin === 'clinic' && <small className="muted supply-origin">Agregado por la clínica</small>}
                        {i.origin === 'catalog' && i.editedAt && <small className="muted supply-origin">Editado por la clínica</small>}
                        {i.archivedAt && <small className="muted supply-origin">Archivado el {dmyTime(i.archivedAt)}</small>}
                      </span>
                      <span role="cell" className="supply-grid__var">{i.variant ? <Highlight text={i.variant} q={searching ? q : ''} /> : <span className="muted">—</span>}</span>
                      <span role="cell"><span className="tag">{i.unit}</span></span>
                      <span role="cell"><span className={`tag tag--${i.scope}`}>{SUPPLY_SCOPES[i.scope]}</span></span>
                      <span role="cell" className="supply-grid__c">
                        <input type="checkbox" className="supply-grid__check" checked={i.onShiftList} disabled={!toggleList || !!i.archivedAt || busy === i.id} onChange={() => void flip(i)}
                          aria-label={`${supplyLabel(i)} en la lista de turno`} />
                      </span>
                      <span role="cell" className="supply-grid__acts">
                        {i.archivedAt
                          ? manage && <button className="btn btn--ghost btn--sm" onClick={() => void restore(i)}><RotateCcw size={14} />Restaurar</button>
                          : (manage || add) && <RowMenu label={supplyLabel(i)} actions={[
                            manage && { label: 'Editar', icon: <Pencil size={14} />, run: () => setEditing({ item: i }) },
                            add && { label: 'Agregar variante', icon: <Plus size={14} />, run: () => setEditing({ preset: { category: i.category, material: i.material } }) },
                            manage && { label: 'Archivar', icon: <Archive size={14} />, run: () => setArchiving(i) },
                          ]} />}
                      </span>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
      {items && !groups.length && <div className="empty">{archived ? 'No hay materiales archivados.' : 'Ningún material coincide.'}</div>}
      {editing && <SupplyForm item={editing.item} preset={editing.preset} items={all} categories={categories} canRestore={manage}
        onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />}
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
  )
}

const NEW_CATEGORY = '__nueva__'

/**
 * RU4 (ronda 15): «Agregar material», «Agregar variante» y «Editar». Categoría (las que hay o «Nueva categoría…»), Material (el
 * buscador sugiere los que ya existen), Variante, Unidad, Registro («Ambos» por defecto) y «En la lista de turno». Si Material +
 * Variante ya existe: «Ya existe en el catálogo» y no deja guardar (si está archivado, «Restaurar»). Agujas, jeringas, catéteres
 * y mariposas: solo el calibre.
 */
function SupplyForm({ item, preset, items, categories, canRestore, onClose, onSaved }: {
  item?: SupplyItem; preset?: { category: string; material: string }; items: SupplyItem[]; categories: string[]; canRestore: boolean; onClose: () => void; onSaved: () => void
}) {
  const { notify, can } = useStore()
  const [f, setF] = useState({
    category: item?.category ?? preset?.category ?? '', newCategory: '', material: item?.material ?? preset?.material ?? '', variant: item?.variant ?? '',
    unit: (item?.unit ?? 'unidad') as SupplyUnit, scope: (item?.scope ?? 'both') as SupplyScope, onShiftList: false,
  })
  const [busy, setBusy] = useState(false)
  const category = f.category === NEW_CATEGORY ? f.newCategory.trim() : f.category
  const gauge = gaugeOnly(f.material)
  const cleaned = stripLength(f.material, f.variant)
  const key = supplyKey(f.material.trim(), cleaned)
  const same = f.material.trim() ? items.find((i) => i.id !== item?.id && supplyKey(i.material, i.variant) === key) : undefined
  const save = async () => {
    setBusy(true)
    try {
      const body = { category, material: f.material.trim(), variant: f.variant, unit: f.unit, scope: f.scope, ...(item ? {} : { onShiftList: f.onShiftList }) }
      const r = await api<SupplyItem>(item ? `/supplies/${item.id}` : '/supplies', { method: item ? 'PATCH' : 'POST', body })
      notify(item ? `${supplyLabel(r)} se guardó` : `${supplyLabel(r)} se agregó al catálogo`)
      onSaved()
    } catch (e) { notify((e as Error).message, 'error') } finally { setBusy(false) }
  }
  const restore = async (i: SupplyItem) => {
    try { await api(`/supplies/${i.id}/restore`, { method: 'POST' }); notify(`${supplyLabel(i)} se restauró`); onSaved() } catch (e) { notify(e instanceof ApiError ? e.message : (e as Error).message, 'error') }
  }
  const title = item ? 'Editar material' : preset ? 'Agregar variante' : 'Agregar material'
  return (
    <Modal title={title} onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={busy || !category || f.material.trim().length < 2 || !!same} onClick={() => void save()}>{busy ? 'Guardando…' : 'Guardar'}</button>
    </>}>
      <div className="form-grid supply-form">
        <label className="field"><span>Categoría</span>
          <select className="select" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            <option value="">Elige la categoría</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            <option value={NEW_CATEGORY}>Nueva categoría…</option>
          </select></label>
        {f.category === NEW_CATEGORY && <label className="field"><span>Nombre de la categoría nueva</span>
          <input className="input" value={f.newCategory} maxLength={60} autoFocus onChange={(e) => setF({ ...f, newCategory: e.target.value })} placeholder="Ej. Material de ortopedia" /></label>}
        <div className="field span-2"><span>Material</span>
          <SupplySearch items={items.filter((i) => !i.archivedAt)} value={f.material} placeholder="Ej. Nylon" label="Material"
            onChange={(v) => setF({ ...f, material: v })} onPickMaterial={(m) => setF({ ...f, material: m.material, category: f.category || m.category })} />
          <small className="muted">Si ya existe, elígelo para agregarle una variante.</small>
        </div>
        <label className="field span-2"><span>Variante (calibre, tipo de aguja, talla o tamaño)</span>
          <input className="input" value={f.variant} maxLength={80} onChange={(e) => setF({ ...f, variant: e.target.value })} placeholder={gauge ? 'Ej. 21 G' : 'Ej. 7/0, aguja cortante'} />
          {gauge && <small className="muted">{SUPPLY_GAUGE_HINT}{cleaned !== f.variant.trim() ? ` Se guardará como «${cleaned || 'sin variante'}».` : ''}</small>}
        </label>
        <label className="field"><span>Unidad</span>
          <select className="select" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value as SupplyUnit })}>
            {SUPPLY_UNIT_LIST.map((u) => <option key={u} value={u}>{u}</option>)}
          </select></label>
        <label className="field"><span>Registro</span>
          <select className="select" value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value as SupplyScope })}>
            {SUPPLY_SCOPE_LIST.map((s) => <option key={s} value={s}>{SUPPLY_SCOPES[s]}</option>)}
          </select></label>
        {!item && can('supplies.shiftlist') && <label className="check-inline span-2"><input type="checkbox" checked={f.onShiftList} onChange={(e) => setF({ ...f, onShiftList: e.target.checked })} />En la lista de turno</label>}
        {same && (
          <div className="alert-strip alert-strip--amber span-2" role="alert" style={{ flexWrap: 'wrap' }}>
            <span>Ya existe en el catálogo: <b>{supplyLabel(same)}</b>{same.archivedAt ? ' (archivado)' : ''}.</span>
            {same.archivedAt && canRestore && <button type="button" className="btn btn--ghost btn--sm" onClick={() => void restore(same)}><RotateCcw size={14} />Restaurar</button>}
            {same.archivedAt && !canRestore && <small>Administración lo puede restaurar.</small>}
          </div>
        )}
      </div>
    </Modal>
  )
}

/**
 * RU1 punto 7: «Periodo de registro del material»: «Por turno», «Por día» o «Por semana». Por turno, con turnos editables
 * (nombre, inicio y fin); empiezan con los de enfermería (Mañana, Tarde, Noche). Solo Administración lo cambia.
 */
function SupplyPeriodSettings({ settings, onSaved }: { settings: SupplySettings; onSaved: () => void }) {
  const { notify, staffById, can } = useStore()
  const editable = can('supplies.manage')
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

/** RU1: la pantalla del catálogo para quien no entra a Configuración (Enfermería: ve el catálogo, agrega y arma su lista de turno). */
export default function SupplyCatalogPage() {
  return (
    <div className="page">
      <PageHead title="Catálogo de material y lista de turno" sub="Marca lo que tu servicio usa en cada turno: es la lista corta que sale al registrar material. El resto se encuentra con el buscador del formulario." />
      <SupplyCatalog />
    </div>
  )
}
