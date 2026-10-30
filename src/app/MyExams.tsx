import { useMemo, useState } from 'react'
import { Archive, Copy, Pencil, Plus, TriangleAlert } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { ExamSetForm } from '../components/Exams'
import { useOrderSets } from '../lib/useOrderSets'
import { useExamCatalog } from '../lib/useExamCatalog'
import { examCatalog, examKey } from '../lib/exams'
import type { OrderSet } from '../lib/types'

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
