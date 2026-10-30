import { useState } from 'react'
import { Archive, FlaskConical, Pencil, Plus, RotateCcw, ScanLine } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { Modal } from '../components/ui'
import { useExamCatalog } from '../lib/useExamCatalog'
import { EXAMS, examKey, GROUP_LABEL } from '../lib/exams'
import { normalize } from '../lib/patients'
import type { ClinicExam, ExamGroup } from '../lib/types'

/**
 * AD4 (ronda 5): catálogo de exámenes de la clínica, la batería que se ofrece al ordenar. Administración agrega, edita y
 * quita (archiva) exámenes de Laboratorio o de Imagen y gabinete; lo ya ordenado en notas anteriores no cambia. Empieza
 * con la lista que tenía la app. Cada cambio queda en la bitácora.
 */
export function ExamCatalogAdmin() {
  const { notify } = useStore()
  const { exams, reload } = useExamCatalog()
  const [q, setQ] = useState('')
  const [archived, setArchived] = useState(false)
  const [editing, setEditing] = useState<ClinicExam | 'new' | null>(null)
  const n = normalize(q)
  const list = exams.filter((e) => (archived || e.active) && (!n || normalize(e.name).includes(n))).sort((a, b) => a.name.localeCompare(b.name, 'es'))
  const nArchived = exams.filter((e) => !e.active).length
  const analytes = (e: ClinicExam) => (e.baseKey ? EXAMS.find((b) => examKey(b.name) === e.baseKey)?.analytes?.length ?? 0 : 0)
  const setActive = async (e: ClinicExam, active: boolean) => {
    try { await api(`/exams/catalog/${e.id}`, { method: 'PATCH', body: { active } }); reload(); notify(active ? `${e.name} vuelve al catálogo` : `${e.name} archivado: ya no se ofrece al ordenar`) } catch (x) { notify((x as Error).message, 'error') }
  }
  return (
    <section className="panel">
      <div className="panel__head" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div><h2>Catálogo de exámenes</h2><p>Los exámenes que los médicos pueden ordenar. Quitar uno lo archiva: deja de ofrecerse, pero las notas que ya lo tienen no cambian.</p></div>
        <button className="btn btn--primary btn--sm" onClick={() => setEditing('new')}><Plus size={15} />Agregar examen</button>
      </div>
      <div className="panel__body" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', paddingBottom: 0 }}>
        <input className="input" style={{ maxWidth: 360 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar examen" aria-label="Buscar examen" />
        {nArchived > 0 && <label className="check-inline"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />Ver archivados ({nArchived})</label>}
      </div>
      <div className="panel__body excat">
        {(['lab', 'imaging'] as ExamGroup[]).map((g) => {
          const rows = list.filter((e) => e.group === g)
          return (
            <div key={g}>
              <h3 className="excat__h">{g === 'lab' ? <FlaskConical size={16} /> : <ScanLine size={16} />}{GROUP_LABEL[g]} <span className="muted">({rows.length})</span></h3>
              {!rows.length ? <p className="muted">{q ? 'Ningún examen coincide.' : 'Sin exámenes.'}</p> : (
                <ul className="excat__list">
                  {rows.map((e) => (
                    <li key={e.id} className={e.active ? '' : 'is-archived'}>
                      <span><b>{e.name}</b>{!e.active && <span className="badge">Archivado</span>}
                        {analytes(e) > 0 && <small className="muted">{analytes(e)} valores con rango de referencia</small>}</span>
                      <span className="excat__acts">
                        {e.active && <button className="btn btn--ghost btn--sm" onClick={() => setEditing(e)}><Pencil size={13} />Editar</button>}
                        {e.active
                          ? <button className="btn btn--ghost btn--sm" onClick={() => setActive(e, false)}><Archive size={13} />Archivar</button>
                          : <button className="btn btn--ghost btn--sm" onClick={() => setActive(e, true)}><RotateCcw size={13} />Restaurar</button>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
      {editing && <ExamForm exam={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />}
    </section>
  )
}

function ExamForm({ exam, onClose, onSaved }: { exam?: ClinicExam; onClose: () => void; onSaved: () => void }) {
  const { notify } = useStore()
  const [name, setName] = useState(exam?.name ?? '')
  const [group, setGroup] = useState<ExamGroup>(exam?.group ?? 'lab')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      if (exam) await api(`/exams/catalog/${exam.id}`, { method: 'PATCH', body: { name: name.trim(), group } })
      else await api('/exams/catalog', { body: { name: name.trim(), group } })
      notify(exam ? 'Examen actualizado' : 'Examen agregado al catálogo')
      onSaved()
    } catch (e) { notify((e as Error).message, 'error') } finally { setBusy(false) }
  }
  return (
    <Modal title={exam ? 'Editar examen' : 'Agregar examen'} onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={busy || name.trim().length < 2 || (!!exam && name.trim() === exam.name && group === exam.group)} onClick={save}>{exam ? 'Guardar' : 'Agregar'}</button>
    </>}>
      <label className="field"><span>Nombre del examen</span><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Dímero D" /></label>
      <div className="field"><span>Categoría</span>
        <div className="segmented" role="radiogroup" aria-label="Categoría">
          {(['lab', 'imaging'] as ExamGroup[]).map((g) => <button key={g} type="button" role="radio" aria-checked={group === g} onClick={() => setGroup(g)}>{GROUP_LABEL[g]}</button>)}
        </div>
        <small className="muted">La categoría decide a quién le llega el pendiente: al laboratorio o a imágenes propios, o a enfermería (Áreas de servicio).</small>
      </div>
    </Modal>
  )
}
