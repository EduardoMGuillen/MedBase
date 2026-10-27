import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ListChecks, Save, Search, Users } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { features } from '../lib/permissions'
import { normalize } from '../lib/patients'
import { Modal } from './ui'
import type { OrderSet, OrderSetItem } from '../lib/types'
import { useOrderSets } from '../lib/useOrderSets'

/**
 * Botón «Set de órdenes»: busca por nombre y, al elegir uno, inserta sus órdenes al final de la lista actual. Nunca
 * firma: las órdenes quedan editables. `onApply` recibe el set; aquí sólo se registra el uso.
 */
export function OrderSetPicker({ where, patientId, onApply }: { where: 'consultation' | 'hospital' | 'observation'; patientId?: string; onApply: (set: OrderSet) => void }) {
  const { user, staffById } = useStore()
  const [open, setOpen] = useState(false)
  const { sets, reload } = useOrderSets(open)
  const [q, setQ] = useState('')
  const n = normalize(q.trim())
  const match = (s: OrderSet) => !n || normalize(s.name).includes(n)
  const mine = (sets ?? []).filter((s) => s.ownerId === user?.id && match(s))
  const shared = (sets ?? []).filter((s) => s.ownerId !== user?.id && match(s))
  const choose = (s: OrderSet) => {
    onApply(s)
    setOpen(false)
    setQ('')
    void api(`/order-sets/${s.id}/use`, { body: { where, patientId } }).catch(() => null)
  }
  const row = (s: OrderSet) => (
    <button key={s.id} type="button" className="set-row" onClick={() => choose(s)}>
      <b>{s.name}</b>
      <small>{s.items.length} órdenes{s.uses ? ` · lo usaste ${s.uses} ${s.uses === 1 ? 'vez' : 'veces'}` : ''}{s.ownerId !== user?.id ? ` · de ${staffById(s.ownerId)?.name ?? 'otro médico'}` : ''}</small>
    </button>
  )
  return (
    <>
      <button type="button" className="btn btn--soft btn--sm" onClick={() => { setOpen(true); reload() }}><ListChecks size={15} />Set de órdenes</button>
      {open && (
        <Modal title="Set de órdenes" onClose={() => setOpen(false)} footer={<Link className="btn btn--ghost" to="/app/sets-de-ordenes">Administrar mis sets</Link>}>
          <p className="muted" style={{ fontSize: 13.5 }}>Sus órdenes se agregan al final de la lista. Puedes editarlas o quitarlas antes de firmar.</p>
          <label className="input-icon"><Search size={16} /><input className="input" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre" aria-label="Buscar set por nombre" /></label>
          {!sets ? <p className="muted">Cargando…</p> : !mine.length && !shared.length ? (
            <p className="muted">{q ? 'Ningún set con ese nombre.' : 'Todavía no tienes sets. Escribe tus órdenes y usa «Guardar estas órdenes como set».'}</p>
          ) : (<>
            {mine.length > 0 && <div className="set-list"><span className="set-list__h">Mis sets</span>{mine.map(row)}</div>}
            {shared.length > 0 && <div className="set-list"><span className="set-list__h"><Users size={13} /> Compartidos por la clínica</span>{shared.map(row)}</div>}
          </>)}
        </Modal>
      )}
    </>
  )
}

/** «Guardar estas órdenes como set»: pide un nombre libre y, en una clínica, si se comparte. */
export function SaveSetButton({ items }: { items: OrderSetItem[] }) {
  const { settings, notify } = useStore()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [shared, setShared] = useState(false)
  const [busy, setBusy] = useState(false)
  const office = features(settings).office
  const save = async () => {
    setBusy(true)
    try {
      await api('/order-sets', { body: { name: name.trim(), items, shared: !office && shared } })
      notify(`Set "${name.trim()}" guardado con ${items.length} órdenes`)
      setOpen(false); setName(''); setShared(false)
    } catch (e) {
      notify((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <button type="button" className="btn btn--ghost btn--sm" disabled={!items.length} onClick={() => setOpen(true)} title={items.length ? undefined : 'Escribe al menos una orden'}>
        <Save size={14} />Guardar estas órdenes como set</button>
      {open && (
        <Modal title="Guardar como set de órdenes" onClose={() => setOpen(false)} footer={<>
          <button className="btn btn--ghost" onClick={() => setOpen(false)}>Cancelar</button>
          <button className="btn btn--primary" disabled={name.trim().length < 3 || busy} onClick={save}>Guardar set</button>
        </>}>
          <label className="field"><span>Nombre del set</span>
            <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Post-op colecistectomía no complicada"
              onKeyDown={(e) => { if (e.key === 'Enter' && name.trim().length >= 3 && !busy) void save() }} /></label>
          <p className="muted" style={{ fontSize: 13.5 }}>Se guardan {items.length} órdenes. Para dejar un espacio para completar al aplicarlo, escribe tres guiones bajos: «Ayuno de ___ a ___».</p>
          {!office && (
            <label className="check-line"><input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
              <span><b>Compartir con la clínica</b><small>Los demás médicos lo pueden aplicar o duplicar como suyo; sólo tú lo editas.</small></span></label>
          )}
        </Modal>
      )}
    </>
  )
}
