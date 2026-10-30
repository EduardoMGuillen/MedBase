import { useMemo, useState } from 'react'
import { FlaskConical, ListChecks, Plus, ScanLine, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { useExamCatalog } from '../lib/useExamCatalog'
import { Modal } from './ui'
import { examCatalog, examKey, examLine, findExam, GROUP_LABEL } from '../lib/exams'
import { useOrderSets } from '../lib/useOrderSets'
import { normalize } from '../lib/patients'
import type { ExamGroup, ExamInput, OrderSet } from '../lib/types'

const newExam = (group: ExamGroup, name: string): ExamInput => ({ group, name, priority: 'routine', place: 'clinic' })

/**
 * EX1: sección «Exámenes» (al nivel de Medicamentos e Indicaciones), con dos grupos separados: Laboratorio e Imagen y
 * gabinete. Cada examen lleva indicación (sugerida en imagen), prioridad, región o lado si aplica, y dónde se realiza.
 */
export function ExamsBlock({ value, onChange, inStay = false }: { value: ExamInput[]; onChange: (v: ExamInput[]) => void; inStay?: boolean }) {
  const [picking, setPicking] = useState(false)
  const { exams: clinicExams } = useExamCatalog()
  const catalog = useMemo(() => examCatalog(clinicExams), [clinicExams])
  const set = (i: number, patch: Partial<ExamInput>) => onChange(value.map((e, j) => (j === i ? { ...e, ...patch } : e)))
  const groups: ExamGroup[] = ['lab', 'imaging']
  return (
    <div className="exams-block" data-tour="examenes">
      {groups.map((g) => {
        const list = value.map((e, i) => ({ e, i })).filter(({ e }) => e.group === g)
        if (!list.length) return null
        return (
          <div key={g} className="exams-group">
            <h4>{g === 'lab' ? <FlaskConical size={15} /> : <ScanLine size={15} />}{GROUP_LABEL[g]} <span className="muted">({list.length})</span></h4>
            <ol className="exam-items">{list.map(({ e, i }) => {
              const cat = findExam(e.name, catalog)
              // MC5 (ronda 5): lo que no está en el catálogo de la clínica sólo puede ser externo
              const outside = !catalog.some((c) => examKey(c.name) === examKey(e.name))
              const needsRegion = cat?.region || (g === 'imaging' && !cat)
              return (
                <li key={i} className={`exam-item${e.priority === 'urgent' ? ' exam-item--urgent' : ''}`}>
                  <div className="exam-item__head">
                    <b>{examLine(e)}</b>{e.place === 'external' && <span className="badge badge--amber">Externo</span>}
                    <button type="button" className="icon-btn" aria-label={`Quitar ${e.name}`} onClick={() => onChange(value.filter((_, j) => j !== i))}><X size={15} /></button>
                  </div>
                  <div className="exam-item__fields">
                    {needsRegion && <input className="input" value={e.region ?? ''} onChange={(x) => set(i, { region: x.target.value || undefined })} placeholder="Región (ej. rodilla)" aria-label={`Región de ${e.name}`} />}
                    {(cat?.side || needsRegion) && (
                      <select className="select" value={e.side ?? ''} onChange={(x) => set(i, { side: (x.target.value || undefined) as ExamInput['side'] })} aria-label={`Lado de ${e.name}`}>
                        <option value="">Sin lado</option><option value="right">Derecha</option><option value="left">Izquierda</option><option value="both">Bilateral</option>
                      </select>
                    )}
                    <input className="input exam-item__ind" value={e.indication ?? ''} onChange={(x) => set(i, { indication: x.target.value || undefined })}
                      placeholder={g === 'imaging' ? 'Indicación clínica (ej. dolor en hipocondrio derecho, descartar colelitiasis)' : 'Indicación clínica (opcional)'} aria-label={`Indicación de ${e.name}`} />
                    <div className="segmented segmented--sm" role="radiogroup" aria-label={`Prioridad de ${e.name}`}>
                      <button type="button" role="radio" aria-checked={e.priority === 'routine'} onClick={() => set(i, { priority: 'routine' })}>Rutina</button>
                      <button type="button" role="radio" aria-checked={e.priority === 'urgent'} onClick={() => set(i, { priority: 'urgent' })}>Urgente</button>
                    </div>
                    {outside ? <small className="muted">No está en el catálogo de la clínica: se hace fuera y sólo va en la orden impresa.</small> : (
                      <div className="segmented segmented--sm" role="radiogroup" aria-label={`Dónde se realiza ${e.name}`}>
                        <button type="button" role="radio" aria-checked={e.place === 'clinic'} onClick={() => set(i, { place: 'clinic' })}>En la clínica</button>
                        <button type="button" role="radio" aria-checked={e.place === 'external'} onClick={() => set(i, { place: 'external' })}>Externo</button>
                      </div>
                    )}
                  </div>
                  {g === 'imaging' && !e.indication?.trim() && <small className="muted">Sugerido: escribe la indicación clínica para quien realiza el estudio.</small>}
                </li>
              )
            })}</ol>
          </div>
        )
      })}
      {!value.length && <p className="muted" style={{ fontSize: 14 }}>Sin exámenes. {inStay ? 'Enfermería recibe los pendientes en su bandeja (los externos no).' : 'Se imprimen aparte de la receta: una orden de laboratorio y otra de imagen y gabinete.'}</p>}
      <button type="button" className="btn btn--soft" style={{ justifySelf: 'start' }} onClick={() => setPicking(true)}><Plus size={16} />Ordenar examen</button>
      {picking && <ExamPicker current={value} onClose={() => setPicking(false)} onAdd={(list) => { onChange([...value, ...list]); setPicking(false) }} />}
    </div>
  )
}

/**
 * Buscador único de exámenes: resultados agrupados en Laboratorio e Imagen y gabinete (con filtro por grupo) y, MC2
 * (ronda 5), los sets de exámenes del médico de un toque. Lo que no está se escribe y se puede guardar en el catálogo,
 * eligiendo su grupo. `catalogOnly`: sólo exámenes del catálogo (al armar un set).
 */
export function ExamPicker({ current, onClose, onAdd, title = 'Ordenar exámenes', catalogOnly = false }: {
  current: ExamInput[]; onClose: () => void; onAdd: (list: ExamInput[]) => void; title?: string; catalogOnly?: boolean
}) {
  const { notify, can } = useStore()
  const { exams: clinicExams } = useExamCatalog()
  const { sets, reload: reloadSets } = useOrderSets(!catalogOnly && can('exams.order'), 'exams')
  const [savingSet, setSavingSet] = useState(false)
  const [q, setQ] = useState('')
  const [group, setGroup] = useState<'' | ExamGroup>('')
  const [picked, setPicked] = useState<ExamInput[]>([])
  const [newGroup, setNewGroup] = useState<ExamGroup>('lab')
  const catalog = useMemo(() => examCatalog(clinicExams), [clinicExams])
  const n = normalize(q)
  const have = new Set([...current, ...picked].map((e) => examKey(e.name)))
  const hits = catalog.filter((e) => (!group || e.group === group) && (!n || normalize(e.name).includes(n)))
  const exact = catalog.some((e) => examKey(e.name) === examKey(q))
  const toggle = (g: ExamGroup, name: string) => setPicked(have.has(examKey(name)) ? picked.filter((p) => examKey(p.name) !== examKey(name)) : [...picked, newExam(g, name)])
  // Un set elige todos sus exámenes; los que la clínica archivó se omiten con aviso
  const applySet = (s: { name: string; items: { exam?: ExamInput }[] }) => {
    const list = s.items.flatMap((it) => (it.exam ? [it.exam] : []))
    const known = list.filter((e) => catalog.some((c) => examKey(c.name) === examKey(e.name)))
    const gone = list.filter((e) => !known.includes(e))
    setPicked([...picked, ...known.filter((x) => !have.has(examKey(x.name))).map((x) => newExam(x.group, catalog.find((c) => examKey(c.name) === examKey(x.name))!.name))])
    if (gone.length) notify(`${gone.map((e) => e.name).join(', ')} ya no ${gone.length === 1 ? 'está' : 'están'} en el catálogo de la clínica: no se ${gone.length === 1 ? 'agregó' : 'agregaron'}.`, 'error')
  }
  // MC5 (ronda 5): lo que no está en el catálogo se pide como externo (texto libre); no entra al catálogo de la clínica
  const addExternal = () => {
    setPicked([...picked, { ...newExam(newGroup, q.trim()), place: 'external' }])
    setQ('')
  }
  const inCatalog = (name: string) => catalog.some((c) => examKey(c.name) === examKey(name))
  return (
    <Modal title={title} wide onClose={onClose} footer={<>
      <span className="muted" style={{ marginRight: 'auto', fontSize: 13.5 }}>{picked.length ? `${picked.length} elegido${picked.length > 1 ? 's' : ''}` : 'Toca los exámenes para elegirlos'}</span>
      {!catalogOnly && can('exams.order') && picked.some((e) => inCatalog(e.name)) && (
        <button className="btn btn--ghost" onClick={() => setSavingSet(true)}><ListChecks size={15} />Guardar selección como set</button>)}
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!picked.length} onClick={() => onAdd(picked)}>Agregar {picked.length || ''}</button>
    </>}>
      <div className="exam-picker__bar">
        <input className="input" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar: hemograma, ultrasonido, EKG…" aria-label="Buscar examen" />
        <div className="segmented" role="radiogroup" aria-label="Grupo">
          <button type="button" role="radio" aria-checked={group === ''} onClick={() => setGroup('')}>Todos</button>
          <button type="button" role="radio" aria-checked={group === 'lab'} onClick={() => setGroup('lab')}>Laboratorio</button>
          <button type="button" role="radio" aria-checked={group === 'imaging'} onClick={() => setGroup('imaging')}>Imagen y gabinete</button>
        </div>
      </div>
      {!q && !catalogOnly && !!sets?.length && (
        <div className="exam-picker__profiles">
          <small className="muted"><ListChecks size={13} /> Mis sets</small>
          <div className="chips">{sets.map((s) => (
            <button key={s.id} type="button" className="chip chip--toggle" title={s.items.flatMap((it) => (it.exam ? [it.exam.name] : [])).join(', ')} onClick={() => applySet(s)}>{s.name}</button>
          ))}</div>
        </div>
      )}
      <div className="exam-picker__results">
        {(['lab', 'imaging'] as ExamGroup[]).filter((g) => !group || g === group).map((g) => {
          const list = hits.filter((e) => e.group === g)
          if (!list.length) return null
          return (
            <div key={g}>
              <h4>{GROUP_LABEL[g]}</h4>
              <div className="exam-picker__list">{list.slice(0, q ? 40 : 60).map((e) => (
                <button key={e.name} type="button" className={`exam-pick${have.has(examKey(e.name)) ? ' is-on' : ''}`} aria-pressed={have.has(examKey(e.name))} onClick={() => toggle(e.group, e.name)}>
                  {e.name}
                </button>
              ))}</div>
            </div>
          )
        })}
        {q.trim().length >= 3 && !exact && !catalogOnly && (
          <div className="exam-picker__new">
            <span>No está en el catálogo de la clínica.</span>
            <div className="segmented segmented--sm" role="radiogroup" aria-label="Grupo del examen externo">
              <button type="button" role="radio" aria-checked={newGroup === 'lab'} onClick={() => setNewGroup('lab')}>Laboratorio</button>
              <button type="button" role="radio" aria-checked={newGroup === 'imaging'} onClick={() => setNewGroup('imaging')}>Imagen y gabinete</button>
            </div>
            <button type="button" className="btn btn--soft btn--sm" onClick={addExternal}><Plus size={14} />Agregar «{q.trim()}» como examen externo</button>
            <small className="muted">Se hace fuera de la clínica: va en la orden impresa con la etiqueta «Externo» y no llega a ninguna bandeja.</small>
          </div>
        )}
        {picked.some((e) => e.place === 'external' && !inCatalog(e.name)) && (
          <p className="muted" style={{ fontSize: 13.5 }}>Externos: {picked.filter((e) => e.place === 'external' && !inCatalog(e.name)).map((e) => e.name).join(', ')}.</p>
        )}
      </div>
      {savingSet && <ExamSetForm initial={picked.filter((e) => inCatalog(e.name))} onClose={() => setSavingSet(false)} onSaved={() => { setSavingSet(false); reloadSets() }} />}
    </Modal>
  )
}

/** Exámenes de un set de exámenes. */
const examsOf = (s: OrderSet) => s.items.flatMap((it) => (it.exam ? [it.exam] : []))

/** MC2 (ronda 5). Crear o editar un set de exámenes: nombre y exámenes del catálogo (con el buscador de ordenar exámenes). */
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
