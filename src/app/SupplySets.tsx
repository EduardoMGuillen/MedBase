import { useCallback, useEffect, useMemo, useState } from 'react'
import { Archive, Copy, Layers, Pencil, Plus, RotateCcw, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { Modal, SectionHead } from '../components/ui'
import { DraftBadge } from '../components/Addenda'
import { QtyStepper, qtyOf } from '../components/QtyStepper'
import { Highlight, SupplySearch } from '../components/SupplySearch'
import { useDraftSync } from '../lib/drafts'
import { useSupplies } from '../lib/useSupplies'
import { dmyTime } from '../lib/format'
import { byCategory, supplyLabel, unitText, type SupplyItem, type SupplySetView } from '../lib/supplies'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
export const setSize = (s: Pick<SupplySetView, 'lines'>) => plural(s.lines.length, 'material', 'materiales')

/** RU8 (ronda 15): los sets de la clínica (activos, o los archivados). */
export function useSupplySets(archived = false) {
  const [sets, setSets] = useState<SupplySetView[] | null>(null)
  const [error, setError] = useState('')
  const reload = useCallback(() => {
    api<{ sets: SupplySetView[] }>(`/supply-sets${archived ? '?archived=1' : ''}`).then((r) => { setSets(r.sets); setError('') }).catch((e: Error) => setError(e.message))
  }, [archived])
  useEffect(() => { reload() }, [reload])
  return { sets, error, reload }
}

/**
 * RU8 (ronda 15): pestaña «Sets» de Configuración › Material médico quirúrgico (y del catálogo de enfermería). Lista con nombre,
 * número de materiales y quién lo cambió por última vez; «Nuevo set», «Editar», «Duplicar» y «Archivar»; «Ver archivados» con
 * «Restaurar». Crear, editar, duplicar y archivar: Enfermería y Administración (sets.manage, A13; el servidor lo vuelve a revisar).
 */
export function SupplySetsTab() {
  const { can, notify, staffById } = useStore()
  const manage = can('sets.manage')
  const [archived, setArchived] = useState(false)
  const { sets, error, reload } = useSupplySets(archived)
  const [editing, setEditing] = useState<{ set?: SupplySetView; copy?: SupplySetView } | null>(null)
  const [archiving, setArchiving] = useState<SupplySetView | null>(null)
  const who = (s: SupplySetView) => {
    if (!s.updatedBy) return s.origin === 'catalog' ? 'Set inicial' : ''
    return `${staffById(s.updatedBy)?.name ?? 'Personal'}${s.updatedAt ? ` · ${dmyTime(s.updatedAt)}` : ''}`
  }
  const restore = async (s: SupplySetView) => {
    try { await api(`/supply-sets/${s.id}/restore`, { method: 'POST' }); notify(`El set «${s.name}» se restauró`); reload() } catch (e) { notify((e as Error).message, 'error') }
  }
  return (
    <section className="panel supply-sets">
      <SectionHead title={archived ? 'Sets archivados' : 'Sets de material'}
        sub="Lo que se gasta junto en un procedimiento (un parto, una canalización). Al registrar material, «Usar set» suma sus cantidades; después se pueden cambiar."
        action={<>
          {manage && <button className="btn btn--ghost btn--sm" onClick={() => setArchived(!archived)}>{archived ? 'Ver activos' : 'Ver archivados'}</button>}
          {manage && !archived && <button className="btn btn--primary btn--sm" onClick={() => setEditing({})}><Plus size={15} />Nuevo set</button>}
        </>} />
      {error && <div className="empty">{error}</div>}
      {sets && !sets.length && <div className="empty">{archived ? 'No hay sets archivados.' : 'Todavía no hay sets.'}</div>}
      {sets && sets.length > 0 && (
        <ul className="set-list">
          {sets.map((s) => (
            <li key={s.id} className="set-list__row">
              <span className="set-list__name">
                <b>{s.name}</b>
                {s.description && <small className="muted">{s.description}</small>}
              </span>
              <span className="tag">{setSize(s)}</span>
              <small className="muted set-list__who">{s.archivedAt ? `Archivado el ${dmyTime(s.archivedAt)}` : who(s)}</small>
              {manage && (
                <span className="set-list__acts">
                  {s.archivedAt
                    ? <button className="btn btn--ghost btn--sm" onClick={() => void restore(s)}><RotateCcw size={14} />Restaurar</button>
                    : <>
                      <button className="btn btn--ghost btn--sm" onClick={() => setEditing({ set: s })}><Pencil size={14} />Editar</button>
                      <button className="btn btn--ghost btn--sm" onClick={() => setEditing({ copy: s })}><Copy size={14} />Duplicar</button>
                      <button className="btn btn--ghost btn--sm" onClick={() => setArchiving(s)}><Archive size={14} />Archivar</button>
                    </>}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && <SetEditor set={editing.set} copy={editing.copy} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />}
      {archiving && (
        <Modal title="Archivar set" onClose={() => setArchiving(null)} footer={<>
          <button className="btn btn--ghost" onClick={() => setArchiving(null)}>Cancelar</button>
          <button className="btn btn--primary" onClick={async () => {
            try { await api(`/supply-sets/${archiving.id}/archive`, { method: 'POST' }); notify(`El set «${archiving.name}» se archivó`); setArchiving(null); reload() } catch (e) { notify((e as Error).message, 'error') }
          }}><Archive size={15} />Archivar</button>
        </>}>
          <p className="mt-0">El set <b>{archiving.name}</b> deja de ofrecerse en «Usar set». Los registros que ya lo usaron no cambian. Se puede restaurar desde «Ver archivados».</p>
        </Modal>
      )}
    </section>
  )
}

interface SetDraft { name: string; description: string; qty: Record<string, string> }

/**
 * RU8: el editor de un set («Nuevo set», «Editar» y «Duplicar»). Nombre, descripción
 * opcional y los materiales con su cantidad, con el mismo buscador de material y el mismo control de cantidad de «Registrar
 * material» (RU7). Borrador «Se guarda solo».
 */
export function SetEditor({ set, copy, onClose, onSaved }: { set?: SupplySetView; copy?: SupplySetView; onClose: () => void; onSaved: (s: SupplySetView) => void }) {
  const { notify } = useStore()
  const { items } = useSupplies()
  const base = set ?? copy
  const start = (): SetDraft => ({
    name: set ? set.name : copy ? `${copy.name} (copia)` : '',
    description: base?.description ?? '',
    qty: Object.fromEntries((base?.lines ?? []).map((l) => [l.itemId, String(l.quantity)])),
  })
  const [d, setD] = useState<SetDraft>(start)
  const [find, setFind] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ref = set ? set.id : copy ? `copia-${copy.id}` : 'nuevo'
  const blank = !d.name.trim() && !Object.values(d.qty).some((v) => qtyOf(v) > 0)
  // Al editar o duplicar, el borrador solo cuenta si cambió algo
  const pristine = JSON.stringify(d) === JSON.stringify(start())
  const draft = useDraftSync<SetDraft>('set', ref, d, (x) => setD({ ...start(), ...x }), blank || pristine)

  const active = useMemo(() => (items ?? []), [items])
  const byId = useMemo(() => new Map(active.map((i) => [i.id, i])), [active])
  const setQty = (id: string, v: string) => setD((x) => ({ ...x, qty: { ...x.qty, [id]: v } }))
  // Lo del set que ya está archivado en el catálogo puede quedarse al editar (el servidor lo permite)
  const archivedLines = (set?.lines ?? []).filter((l) => !byId.has(l.itemId) && qtyOf(d.qty[l.itemId]) > 0)
  const chosen = active.filter((i) => qtyOf(d.qty[i.id]) > 0)
  const count = chosen.length + archivedLines.length
  const missing = d.name.trim().length < 2 ? 'Escribe el nombre del set' : !count ? 'Agrega al menos un material' : ''

  const save = async () => {
    setError('')
    setBusy(true)
    try {
      const lines = Object.entries(d.qty).map(([itemId, v]) => ({ itemId, quantity: qtyOf(v) })).filter((l) => l.quantity > 0)
      const body = { name: d.name.trim(), description: d.description.trim(), items: lines }
      const r = await api<SupplySetView>(set ? `/supply-sets/${set.id}` : '/supply-sets', { method: set ? 'PATCH' : 'POST', body })
      draft.clear()
      notify(set ? `El set «${r.name}» se guardó` : `El set «${r.name}» se creó`)
      onSaved(r)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const row = (i: SupplyItem, q = '') => (
    <div key={i.id} className={`mat-row${qtyOf(d.qty[i.id]) ? ' is-on' : ''}`}>
      <div className="mat-row__name"><span><b><Highlight text={i.material} q={q} /></b>{i.variant && <> <Highlight text={i.variant} q={q} /></>} <small className="mat-row__unit">{i.unit}</small></span></div>
      <QtyStepper value={d.qty[i.id] ?? ''} onChange={(v) => setQty(i.id, v)} label={`${supplyLabel(i)} (${i.unit})`} />
    </div>
  )
  const title = set ? 'Editar set' : 'Nuevo set'
  return (
    <Modal wide steady className="set-editor" title={title} onClose={onClose}
      top={<DraftBadge savedAt={draft.savedAt} restored={draft.restored} offline={draft.offline} />}
      footer={<>
        {(error || missing) && <span className={`set-editor__msg${error ? ' field__msg field__msg--error' : ' muted'}`} role={error ? 'alert' : 'status'}>{error || missing}</span>}
        <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn--primary" disabled={busy || !!missing} onClick={() => void save()}>{busy ? 'Guardando…' : 'Guardar set'}</button>
      </>}>
      <div className="form-grid">
        <label className="field"><span>Nombre del set</span>
          <input className="input" value={d.name} maxLength={60} autoFocus onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Ej. Parto vaginal" /></label>
        <label className="field"><span>Descripción (opcional)</span>
          <input className="input" value={d.description} maxLength={200} onChange={(e) => setD({ ...d, description: e.target.value })} placeholder="Para qué se usa" /></label>
      </div>
      <div className="mat-form__cols set-editor__cols">
        <section className="mat-col" aria-label="Agregar material">
          <h3 className="mat-col__title">Agregar material</h3>
          {!items ? <p className="muted">Cargando el catálogo…</p> : (
            <SupplySearch items={active} value={find} onChange={setFind} label="Buscar material" max={30}
              results={(found, q) => <div className="mat-results">{found.map((i) => row(i, q))}</div>} />
          )}
          {find.trim().length < 2 && <p className="c-muted m-0">Escribe al menos 2 letras (ej. «guante 7.5», «gasa»).</p>}
        </section>
        <section className="mat-col" aria-label="Materiales del set">
          <h3 className="mat-col__title">En el set: {plural(count, 'material', 'materiales')}</h3>
          {!count && <p className="c-muted m-0">Todavía no tiene materiales.</p>}
          {byCategory(chosen).map((g) => (
            <section key={g.category} className="mat-cat">
              <h4 className="mat-cat__plain">{g.category}</h4>
              {g.rows.map((i) => (
                <div key={i.id} className="mat-row is-on">
                  <div className="mat-row__name"><span><b>{i.material}</b>{i.variant && ` ${i.variant}`} <small className="mat-row__unit">{unitText(qtyOf(d.qty[i.id]), i.unit)}</small></span></div>
                  <QtyStepper value={d.qty[i.id] ?? ''} onChange={(v) => setQty(i.id, v)} label={supplyLabel(i)} />
                  <button type="button" className="icon-btn" aria-label={`Quitar ${supplyLabel(i)}`} onClick={() => setQty(i.id, '')}><X size={16} /></button>
                </div>
              ))}
            </section>
          ))}
          {archivedLines.length > 0 && (
            <section className="mat-cat"><h4 className="mat-cat__plain">Archivados en el catálogo</h4>
              {archivedLines.map((l) => (
                <div key={l.itemId} className="mat-row is-off">
                  <div className="mat-row__name"><span>{supplyLabel(l)} <small className="mat-row__unit">{unitText(qtyOf(d.qty[l.itemId]), l.unit)}</small></span>
                    <small className="mat-row__why">Archivado: no se agrega al usar el set.</small></div>
                  <button type="button" className="icon-btn" aria-label={`Quitar ${supplyLabel(l)}`} onClick={() => setQty(l.itemId, '')}><X size={16} /></button>
                </div>
              ))}
            </section>
          )}
        </section>
      </div>
    </Modal>
  )
}

/** RU8: «Usar set»: la lista de los sets activos (nombre y número de materiales). */
export function SetPicker({ onPick }: { onPick: (s: SupplySetView) => void }) {
  const { sets, error } = useSupplySets()
  const [open, setOpen] = useState(false)
  return (
    <div className="set-picker">
      <button type="button" className="btn btn--ghost set-picker__btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}><Layers size={16} />Usar set</button>
      {open && (
        <div className="set-picker__pop" role="listbox" aria-label="Sets de material">
          {error && <p className="muted">{error}</p>}
          {!sets && !error && <p className="muted">Cargando…</p>}
          {sets && !sets.length && <p className="muted">La clínica no tiene sets.</p>}
          {sets?.map((s) => (
            <button key={s.id} type="button" role="option" aria-selected="false" onClick={() => { setOpen(false); onPick(s) }}>
              <b>{s.name}</b><small className="muted">{setSize(s)}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
