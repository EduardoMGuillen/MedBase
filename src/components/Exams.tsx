import { useMemo, useState } from 'react'
import { FlaskConical, Plus, ScanLine, Star, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { useExamCatalog } from '../lib/useExamCatalog'
import { Modal } from './ui'
import { BASE_PROFILES, examCatalog, examKey, examLine, findExam, GROUP_LABEL } from '../lib/exams'
import { normalize } from '../lib/patients'
import type { ExamGroup, ExamInput } from '../lib/types'

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
              const needsRegion = cat?.region || (g === 'imaging' && !cat)
              return (
                <li key={i} className={`exam-item${e.priority === 'urgent' ? ' exam-item--urgent' : ''}`}>
                  <div className="exam-item__head">
                    <b>{examLine(e)}</b>
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
                    <div className="segmented segmented--sm" role="radiogroup" aria-label={`Dónde se realiza ${e.name}`}>
                      <button type="button" role="radio" aria-checked={e.place === 'clinic'} onClick={() => set(i, { place: 'clinic' })}>En la clínica</button>
                      <button type="button" role="radio" aria-checked={e.place === 'external'} onClick={() => set(i, { place: 'external' })}>Externo</button>
                    </div>
                  </div>
                  {g === 'imaging' && !e.indication?.trim() && <small className="muted">Sugerido: escribe la indicación clínica para quien realiza el estudio.</small>}
                </li>
              )
            })}</ol>
          </div>
        )
      })}
      {!value.length && <p className="muted" style={{ fontSize: 14 }}>Sin exámenes. {inStay ? 'Enfermería recibe los pendientes en su bandeja.' : 'Se imprimen aparte de la receta: una orden de laboratorio y otra de imagen y gabinete.'}</p>}
      <button type="button" className="btn btn--soft" style={{ justifySelf: 'start' }} onClick={() => setPicking(true)}><Plus size={16} />Ordenar examen</button>
      {picking && <ExamPicker current={value} onClose={() => setPicking(false)} onAdd={(list) => { onChange([...value, ...list]); setPicking(false) }} />}
    </div>
  )
}

/**
 * Buscador único de exámenes: resultados agrupados en Laboratorio e Imagen y gabinete (con filtro por grupo), favoritos
 * del médico arriba y perfiles de un toque. Lo que no está se escribe y se puede guardar en el catálogo, eligiendo su grupo.
 */
export function ExamPicker({ current, onClose, onAdd, title = 'Ordenar exámenes' }: { current: ExamInput[]; onClose: () => void; onAdd: (list: ExamInput[]) => void; title?: string }) {
  const { user, notify, can } = useStore()
  const { exams: clinicExams, profiles, reload } = useExamCatalog()
  const [q, setQ] = useState('')
  const [group, setGroup] = useState<'' | ExamGroup>('')
  const [picked, setPicked] = useState<ExamInput[]>([])
  const [newGroup, setNewGroup] = useState<ExamGroup>('lab')
  // AD4: sólo administración agrega al catálogo de la clínica
  const [save, setSave] = useState(can('settings.manage'))
  const favs = useMemo(() => user?.prefs?.favExams ?? [], [user?.prefs?.favExams])
  const catalog = useMemo(() => examCatalog(clinicExams, favs), [clinicExams, favs])
  const n = normalize(q)
  const have = new Set([...current, ...picked].map((e) => examKey(e.name)))
  const hits = catalog.filter((e) => (!group || e.group === group) && (!n || normalize(e.name).includes(n)))
  const exact = catalog.some((e) => examKey(e.name) === examKey(q))
  const toggle = (g: ExamGroup, name: string) => setPicked(have.has(examKey(name)) ? picked.filter((p) => examKey(p.name) !== examKey(name)) : [...picked, newExam(g, name)])
  const allProfiles = [...BASE_PROFILES.map((p) => ({ ...p, ownerId: undefined })), ...profiles]
  const addNew = async () => {
    const name = q.trim()
    if (save) {
      try { await api('/exams/catalog', { body: { group: newGroup, name } }); reload() } catch (e) { notify((e as Error).message, 'error') }
    }
    setPicked([...picked, newExam(newGroup, name)]); setQ('')
  }
  return (
    <Modal title={title} wide onClose={onClose} footer={<>
      <span className="muted" style={{ marginRight: 'auto', fontSize: 13.5 }}>{picked.length ? `${picked.length} elegido${picked.length > 1 ? 's' : ''}` : 'Toca los exámenes para elegirlos'}</span>
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
      {!q && (
        <div className="exam-picker__profiles">
          <small className="muted">Perfiles</small>
          <div className="chips">{allProfiles.map((p) => (
            <button key={p.id} type="button" className="chip chip--toggle" title={p.items.map((x) => x.name).join(', ')}
              onClick={() => setPicked([...picked, ...p.items.filter((x) => !have.has(examKey(x.name))).map((x) => newExam(x.group, x.name))])}>{p.name}{p.ownerId ? ' (mío)' : ''}</button>
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
                  {favs.some((f) => examKey(f) === examKey(e.name)) && <Star size={13} fill="currentColor" className="exam-pick__fav" />}{e.name}{e.clinicId && <small className="muted"> · de la clínica</small>}
                </button>
              ))}</div>
            </div>
          )
        })}
        {q.trim().length >= 3 && !exact && (
          <div className="exam-picker__new">
            <span>¿No está? Agregar «{q.trim()}» como</span>
            <div className="segmented segmented--sm" role="radiogroup" aria-label="Grupo del examen nuevo">
              <button type="button" role="radio" aria-checked={newGroup === 'lab'} onClick={() => setNewGroup('lab')}>Laboratorio</button>
              <button type="button" role="radio" aria-checked={newGroup === 'imaging'} onClick={() => setNewGroup('imaging')}>Imagen y gabinete</button>
            </div>
            {can('settings.manage') && <label className="check-inline"><input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} />Guardar en el catálogo</label>}
            <button type="button" className="btn btn--soft btn--sm" onClick={addNew}><Plus size={14} />Agregar</button>
          </div>
        )}
      </div>
    </Modal>
  )
}
