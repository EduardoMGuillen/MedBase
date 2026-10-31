import { useState } from 'react'
import { Archive, FlaskConical, Pencil, Plus, RotateCcw, ScanLine } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { FoldHead, Modal } from '../components/ui'
import { useExamCatalog } from '../lib/useExamCatalog'
import { bySubgroup, EXAMS, examKey, GROUP_LABEL, SUBGROUPS, subgroupOf } from '../lib/exams'
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
  // CF4 (ronda 6): qué grupos están abiertos. Sin tocarlos, cerrados; al buscar se abren los que coinciden
  const [fold, setFold] = useState<Record<string, boolean>>({})
  const isOpen = (k: string) => fold[k] ?? !!n
  const flip = (k: string) => setFold({ ...fold, [k]: !isOpen(k) })
  const allKeys = (['lab', 'imaging'] as ExamGroup[]).flatMap((g) => [g, ...bySubgroup(list, g).map((x) => `${g}:${x.subgroup}`)])
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
        {/* CF4 (ronda 6): Laboratorio e Imagen y gabinete plegables, cerrados al entrar; dentro, sus subgrupos (CF3) */}
        <div className="fold-tools">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setFold(Object.fromEntries(allKeys.map((k) => [k, true])))}>Expandir todo</button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setFold(Object.fromEntries(allKeys.map((k) => [k, false])))}>Contraer todo</button>
        </div>
        {(['lab', 'imaging'] as ExamGroup[]).map((g) => {
          const subs = bySubgroup(list, g)
          const count = subs.reduce((a, x) => a + x.items.length, 0)
          if (n && !count) return null
          const open = isOpen(g)
          return (
            <div key={g} className="exam-fold">
              <FoldHead id={`cat-${g}`} open={open} onToggle={() => flip(g)} title={<>{g === 'lab' ? <FlaskConical size={16} /> : <ScanLine size={16} />}{GROUP_LABEL[g]}</>} count={count} />
              {open && <div id={`cat-${g}`} className="exam-fold__body">
                {!subs.length && <p className="muted">Sin exámenes.</p>}
                {subs.map(({ subgroup, items }) => {
                  const k = `${g}:${subgroup}`
                  const o = isOpen(k)
                  return (
                    <div key={k}>
                      <FoldHead id={`cat-${k}`} level={2} open={o} onToggle={() => flip(k)} title={subgroup} count={items.length} />
                      {o && <ul id={`cat-${k}`} className="excat__list">
                        {items.map((e) => (
                          <li key={e.id} className={e.active ? '' : 'is-archived'}>
                            <span><b>{e.name}</b>{!e.active && <span className="badge">Archivado</span>}
                              {analytes(e) > 0 && <small className="muted">{analytes(e)} {analytes(e) === 1 ? 'valor' : 'valores'} con rango de referencia</small>}</span>
                            <span className="excat__acts">
                              {e.active && <button className="btn btn--ghost btn--sm" onClick={() => setEditing(e)}><Pencil size={13} />Editar</button>}
                              {e.active
                                ? <button className="btn btn--ghost btn--sm" onClick={() => setActive(e, false)}><Archive size={13} />Archivar</button>
                                : <button className="btn btn--ghost btn--sm" onClick={() => setActive(e, true)}><RotateCcw size={13} />Restaurar</button>}
                            </span>
                          </li>
                        ))}
                      </ul>}
                    </div>
                  )
                })}
              </div>}
            </div>
          )
        })}
        {n && !list.length && <p className="muted">Ningún examen coincide.</p>}
      </div>
      {editing && <ExamForm exam={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />}
    </section>
  )
}

function ExamForm({ exam, onClose, onSaved }: { exam?: ClinicExam; onClose: () => void; onSaved: () => void }) {
  const { notify } = useStore()
  const [name, setName] = useState(exam?.name ?? '')
  const [group, setGroup] = useState<ExamGroup>(exam?.group ?? 'lab')
  // CF3 (ronda 6): subgrupo (el del examen, el de la lista fija u «Otros»)
  const [subgroup, setSubgroup] = useState(exam ? subgroupOf(exam) : 'Otros')
  const options = [...new Set([...SUBGROUPS[group], subgroup])]
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      if (exam) await api(`/exams/catalog/${exam.id}`, { method: 'PATCH', body: { name: name.trim(), group, subgroup } })
      else await api('/exams/catalog', { body: { name: name.trim(), group, subgroup } })
      notify(exam ? 'Examen actualizado' : 'Examen agregado al catálogo')
      onSaved()
    } catch (e) { notify((e as Error).message, 'error') } finally { setBusy(false) }
  }
  return (
    <Modal title={exam ? 'Editar examen' : 'Agregar examen'} onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={busy || name.trim().length < 2 || (!!exam && name.trim() === exam.name && group === exam.group && subgroup === subgroupOf(exam))} onClick={save}>{exam ? 'Guardar' : 'Agregar'}</button>
    </>}>
      <label className="field"><span>Nombre del examen</span><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Dímero D" /></label>
      <div className="field"><span>Categoría</span>
        <div className="segmented" role="radiogroup" aria-label="Categoría">
          {(['lab', 'imaging'] as ExamGroup[]).map((g) => <button key={g} type="button" role="radio" aria-checked={group === g} onClick={() => { setGroup(g); if (!SUBGROUPS[g].includes(subgroup)) setSubgroup('Otros') }}>{GROUP_LABEL[g]}</button>)}
        </div>
        <small className="muted">La categoría decide a quién le llega el pendiente: al laboratorio o a imágenes propios, o a enfermería (Áreas de servicio).</small>
      </div>
      <label className="field"><span>Subgrupo</span>
        <select className="select" value={subgroup} onChange={(e) => setSubgroup(e.target.value)}>{options.map((o) => <option key={o}>{o}</option>)}</select>
        <small className="muted">Así se agrupa al ordenar exámenes y en este catálogo.</small></label>
    </Modal>
  )
}
