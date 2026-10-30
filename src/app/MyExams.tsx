import { useMemo, useState } from 'react'
import { Archive, Copy, FlaskConical, Pencil, Plus, ScanLine, TriangleAlert, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { Modal } from '../components/ui'
import { ExamPicker } from '../components/Exams'
import { useOrderSets } from '../lib/useOrderSets'
import { useExamCatalog } from '../lib/useExamCatalog'
import { examCatalog, examKey, GROUP_LABEL } from '../lib/exams'
import type { ExamInput, OrderSet } from '../lib/types'

/** Exámenes de un set de exámenes. */
const examsOf = (s: OrderSet) => s.items.flatMap((it) => (it.exam ? [it.exam] : []))

/**
 * MC2 (ronda 5): «Mis sets de exámenes» reemplaza a «Mis exámenes frecuentes». Cada médico arma los suyos con exámenes
 * del catálogo de la clínica (nadie más los ve) y al ordenar los elige de un toque. Crear, editar, duplicar y archivar;
 * empiezan con los cinco perfiles que antes eran fijos. Las estrellas de antes quedan guardadas sin mostrarse.
 */
export function MyExams() {
  const { notify } = useStore()
  const { sets, reload } = useOrderSets(true, 'exams')
  const { exams: clinicExams } = useExamCatalog()
  const active = useMemo(() => new Set(examCatalog(clinicExams).map((e) => examKey(e.name))), [clinicExams])
  const [editing, setEditing] = useState<OrderSet | 'new' | null>(null)
  const act = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); notify(ok); reload() } catch (e) { notify((e as Error).message, 'error') } }
  return (
    <section className="panel">
      <div className="panel__head" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div><h2>Mis sets de exámenes</h2><p>Varios exámenes con un nombre, para pedirlos de un toque al ordenar. Sólo tú los ves.</p></div>
        <button className="btn btn--primary btn--sm" onClick={() => setEditing('new')}><Plus size={15} />Crear set</button>
      </div>
      <div className="panel__body">
        {!sets ? <p className="muted">Cargando…</p> : !sets.length ? <div className="empty">Todavía no tienes sets de exámenes.</div> : (
          <ul className="exsets">
            {sets.map((s) => {
              const list = examsOf(s)
              const gone = list.filter((e) => !active.has(examKey(e.name)))
              return (
                <li key={s.id}>
                  <div className="exsets__head">
                    <b>{s.name}</b><small className="muted">{list.length} examen{list.length === 1 ? '' : 'es'}</small>
                    <span className="exsets__acts">
                      <button className="btn btn--ghost btn--sm" onClick={() => setEditing(s)}><Pencil size={13} />Editar</button>
                      <button className="btn btn--ghost btn--sm" onClick={() => act(() => api(`/order-sets/${s.id}/duplicate`, { method: 'POST' }), `Se duplicó «${s.name}»`)}><Copy size={13} />Duplicar</button>
                      <button className="btn btn--ghost btn--sm" onClick={() => { if (confirm(`¿Archivar el set «${s.name}»? Deja de aparecer al ordenar.`)) void act(() => api(`/order-sets/${s.id}`, { method: 'DELETE' }), 'Set archivado') }}><Archive size={13} />Archivar</button>
                    </span>
                  </div>
                  <p className="exsets__items">{list.map((e) => e.name).join(' · ')}</p>
                  {gone.length > 0 && <p className="exsets__warn"><TriangleAlert size={14} />{gone.map((e) => e.name).join(', ')} ya no {gone.length === 1 ? 'está' : 'están'} en el catálogo de la clínica: al ordenar se {gone.length === 1 ? 'omite' : 'omiten'}.</p>}
                </li>
              )
            })}
          </ul>
        )}
      </div>
      {editing && <ExamSetForm set={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />}
    </section>
  )
}

/** Crear o editar un set de exámenes: nombre y exámenes del catálogo (con el buscador de ordenar exámenes). */
export function ExamSetForm({ set, initial = [], onClose, onSaved }: { set?: OrderSet; initial?: ExamInput[]; onClose: () => void; onSaved: (s: OrderSet) => void }) {
  const { notify } = useStore()
  const [name, setName] = useState(set?.name ?? '')
  const [exams, setExams] = useState<ExamInput[]>(() => (set ? examsOf(set) : initial).map((e) => ({ group: e.group, name: e.name, priority: 'routine', place: 'clinic' })))
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      const items = exams.map((e) => ({ exam: e }))
      const s = set
        ? await api<OrderSet>(`/order-sets/${set.id}`, { method: 'PATCH', body: { name: name.trim(), items } })
        : await api<OrderSet>('/order-sets', { body: { name: name.trim(), items, kind: 'exams' } })
      notify(set ? 'Set guardado' : `Set «${name.trim()}» creado`)
      onSaved(s)
    } catch (e) { notify((e as Error).message, 'error') } finally { setBusy(false) }
  }
  return (
    <Modal title={set ? 'Editar set de exámenes' : 'Crear set de exámenes'} onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={busy || name.trim().length < 3 || !exams.length} onClick={save}>Guardar set</button>
    </>}>
      <label className="field"><span>Nombre del set</span><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Mi control prenatal" /></label>
      {(['lab', 'imaging'] as const).map((g) => {
        const list = exams.filter((e) => e.group === g)
        if (!list.length) return null
        return (
          <div key={g} className="field"><span>{g === 'lab' ? <FlaskConical size={14} /> : <ScanLine size={14} />} {GROUP_LABEL[g]}</span>
            <div className="chips">{list.map((e) => (
              <span key={e.name} className="chip">{e.name}<button type="button" className="icon-btn" aria-label={`Quitar ${e.name}`} onClick={() => setExams(exams.filter((x) => x !== e))}><X size={12} /></button></span>
            ))}</div>
          </div>
        )
      })}
      {!exams.length && <p className="muted">Sin exámenes todavía.</p>}
      <button type="button" className="btn btn--soft" style={{ justifySelf: 'start' }} onClick={() => setPicking(true)}><Plus size={15} />Agregar exámenes</button>
      {picking && <ExamPicker current={exams} catalogOnly title="Agregar exámenes al set" onClose={() => setPicking(false)} onAdd={(list) => { setExams([...exams, ...list]); setPicking(false) }} />}
    </Modal>
  )
}
