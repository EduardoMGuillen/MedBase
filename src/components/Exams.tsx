import { useMemo, useState } from 'react'
import { FlaskConical, ListChecks, Plus, ScanLine, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { useExamCatalog } from '../lib/useExamCatalog'
import { FoldHead, Modal } from './ui'
import { byArea, contrastOptions, examCatalog, examKey, examLine, examMatches, findExam, GROUP_LABEL, hasDetails, missingDetail, type CatalogExam } from '../lib/exams'
import { IMAGING_SIDES } from '../lib/clinicalConfig'
import type { ImagingDetails } from '../lib/imagingCatalog'
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
              // MC3 (ronda 6): lo que no está en el catálogo va con su tipo y la etiqueta «No catalogado»; se hace aquí o fuera
              const outside = !catalog.some((c) => examKey(c.name) === examKey(e.name))
              const needsRegion = !e.detailed && (cat?.region || (g === 'imaging' && !cat))
              return (
                <li key={i} className={`exam-item${e.priority === 'urgent' ? ' exam-item--urgent' : ''}`}>
                  <div className="exam-item__head">
                    <b>{examLine(e)}</b>{e.place === 'external' && <span className="badge badge--amber">Externo</span>}{outside && <span className="badge badge--neutral">No catalogado</span>}
                    <button type="button" className="icon-btn" aria-label={`Quitar ${e.name}`} onClick={() => onChange(value.filter((_, j) => j !== i))}><X size={15} /></button>
                  </div>
                  <div className="exam-item__fields">
                    {needsRegion && <input className="input" value={e.region ?? ''} onChange={(x) => set(i, { region: x.target.value || undefined })} placeholder="Región (ej. rodilla)" aria-label={`Región de ${e.name}`} />}
                    {!e.detailed && (cat?.side || needsRegion) && (
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
                    {(
                      <div className="segmented segmented--sm" role="radiogroup" aria-label={`Dónde se realiza ${e.name}`}>
                        <button type="button" role="radio" aria-checked={e.place === 'clinic'} onClick={() => set(i, { place: 'clinic' })}>En la clínica</button>
                        <button type="button" role="radio" aria-checked={e.place === 'external'} onClick={() => set(i, { place: 'external' })}>Externo</button>
                      </div>
                    )}
                  </div>
                  {/* CA5 (ronda 10): proyección, contraste, lado y región, los mismos botones de «Ordenar exámenes» */}
                  {e.detailed && hasDetails(cat?.details) && <ExamDetailChips exam={e} details={cat!.details!} onChange={(patch) => set(i, patch)} />}
                  {g === 'imaging' && !e.indication?.trim() && <small className="muted">Sugerido: escribe la indicación clínica para quien realiza el estudio.</small>}
                </li>
              )
            })}</ol>
          </div>
        )
      })}
      {!value.length && <p className="muted" style={{ fontSize: 14 }}>Sin exámenes. {inStay ? 'Enfermería recibe los pendientes en su bandeja (los externos no).' : 'Se imprimen aparte de la receta: una orden de laboratorio y otra de imagen y gabinete.'}</p>}
      <button type="button" className="btn btn--soft" style={{ justifySelf: 'start' }} onClick={() => setPicking(true)}><Plus size={16} />Ordenar exámenes</button>
      {picking && <ExamPicker current={value} onClose={() => setPicking(false)} onAdd={(list) => { onChange([...value, ...list]); setPicking(false) }} />}
    </div>
  )
}

/** MC4 (ronda 6): lo marcado y no agregado todavía sobrevive a cerrar la pestaña o a un apagón (se borra al agregar o cancelar). */
const PICKED_KEY = 'clinara.ordenar-examenes'
const readPicked = (): ExamInput[] => { try { return JSON.parse(localStorage.getItem(PICKED_KEY) ?? '[]') as ExamInput[] } catch { return [] } }
const writePicked = (list: ExamInput[]) => { try { if (list.length) localStorage.setItem(PICKED_KEY, JSON.stringify(list)); else localStorage.removeItem(PICKED_KEY) } catch { /* sin almacenamiento */ } }

/**
 * MC4 (ronda 6): «Ordenar exámenes». Buscador (con el foco) y Todos / Laboratorio / Imagen y gabinete; «Mis sets (N)» y
 * «Perfiles (N)» como dos botones que despliegan su lista; los exámenes en grupos plegables por tipo y subgrupo, cada uno
 * con su conteo y cuántos van marcados, y cada examen como fila con casilla. Los grupos empiezan cerrados y se abren solos
 * al buscar (sólo quedan los que coinciden) o si tienen algo marcado. Abajo, la barra «Seleccionados (N)» y «Agregar (N)».
 * Lo que no está en el catálogo se agrega como «No catalogado» eligiendo su tipo (MC3). `catalogOnly`: sólo el catálogo
 * (al armar un set).
 */
export function ExamPicker({ current, onClose, onAdd, title = 'Ordenar exámenes', catalogOnly = false }: {
  current: ExamInput[]; onClose: () => void; onAdd: (list: ExamInput[]) => void; title?: string; catalogOnly?: boolean
}) {
  const { notify, can } = useStore()
  const { exams: clinicExams, profiles: allProfiles } = useExamCatalog()
  const { sets, reload: reloadSets } = useOrderSets(!catalogOnly && can('exams.order'), 'exams')
  const [savingSet, setSavingSet] = useState(false)
  const [q, setQ] = useState('')
  const [group, setGroup] = useState<'' | ExamGroup>('')
  const [picked, setPickedState] = useState<ExamInput[]>(() => (catalogOnly ? [] : readPicked().filter((e) => !current.some((c) => examKey(c.name) === examKey(e.name)))))
  const setPicked = (list: ExamInput[]) => { setPickedState(list); if (!catalogOnly) writePicked(list) }
  // MC3 (ronda 6): el tipo de lo no catalogado se elige siempre; no hay valor por defecto
  const [newGroup, setNewGroup] = useState<ExamGroup | null>(null)
  const [askType, setAskType] = useState(false)
  const [menu, setMenu] = useState<'sets' | 'profiles' | null>(null)
  const [fold, setFold] = useState<Record<string, boolean>>({})
  const [showAll, setShowAll] = useState(false)
  const catalog = useMemo(() => examCatalog(clinicExams), [clinicExams])
  // CF6 (ronda 6): perfiles de la clínica (los de administración, sin dueño)
  const profiles = (allProfiles ?? []).filter((p) => !p.ownerId)
  const n = normalize(q.trim())
  const keyOf = (name: string) => examKey(name)
  const have = new Set([...current, ...picked].map((e) => keyOf(e.name)))
  const pickedKeys = new Set(picked.map((e) => keyOf(e.name)))
  // CA5 (ronda 10): palabra por palabra y con sinónimos («rx torax», «tac abdomen», «usg tiroides», «doppler»)
  const hits = catalog.filter((e) => (!group || e.group === group) && (!n || examMatches(e.name, q)))
  const detailsOf = (name: string) => catalog.find((c) => keyOf(c.name) === keyOf(name))?.details
  // Lo que falta elegir de cada estudio marcado (al armar un set no se pide: se elige al ordenar)
  const missingOf = (e: ExamInput) => (catalogOnly ? undefined : missingDetail(e, detailsOf(e.name)))
  const firstMissing = picked.map((e) => ({ e, m: missingOf(e) })).find((x) => x.m)
  const setPickedItem = (name: string, patch: Partial<ExamInput>) => setPicked(picked.map((x) => (keyOf(x.name) === keyOf(name) ? { ...x, ...patch } : x)))
  const exact = catalog.some((e) => keyOf(e.name) === keyOf(q.trim()))
  const inCatalog = (name: string) => catalog.some((c) => keyOf(c.name) === keyOf(name))
  const toggle = (g: ExamGroup, name: string) => {
    if (current.some((c) => keyOf(c.name) === keyOf(name))) return
    setPicked(pickedKeys.has(keyOf(name)) ? picked.filter((p) => keyOf(p.name) !== keyOf(name)) : [...picked, withDetailFlag(newExam(g, name))])
  }
  // Un set o un perfil marca todos sus exámenes; los que la clínica archivó se omiten con aviso
  const applyList = (label: string, list: { group: ExamGroup; name: string }[]) => {
    const known = list.filter((e) => inCatalog(e.name))
    const gone = list.filter((e) => !inCatalog(e.name))
    const add = known.filter((x) => !have.has(keyOf(x.name))).map((x) => withDetailFlag(newExam(x.group, catalog.find((c) => keyOf(c.name) === keyOf(x.name))!.name)))
    setPicked([...picked, ...add])
    setMenu(null)
    if (gone.length) notify(`${gone.map((e) => e.name).join(', ')} ya no ${gone.length === 1 ? 'está' : 'están'} en el catálogo de la clínica: no se ${gone.length === 1 ? 'marcó' : 'marcaron'}.`, 'error')
    else notify(`«${label}»: ${add.length} examen${add.length === 1 ? '' : 'es'} marcado${add.length === 1 ? '' : 's'}.`)
  }
  const copyToMine = async (p: { name: string; items: { group: ExamGroup; name: string }[] }) => {
    try {
      await api<OrderSet>('/order-sets', { body: { name: p.name, items: p.items.filter((e) => inCatalog(e.name)).map((e) => ({ exam: newExam(e.group, e.name) })), kind: 'exams' } })
      notify(`«${p.name}» copiado a Mis sets: ahí lo puedes cambiar.`)
      reloadSets()
    } catch (e) { notify((e as Error).message, 'error') }
  }
  // MC3 (ronda 6): lo que no está en el catálogo se pide con su tipo y la etiqueta «No catalogado»; no entra al catálogo
  const addUncatalogued = () => {
    if (!newGroup || !q.trim()) return
    setPicked([...picked, { ...newExam(newGroup, q.trim()), uncatalogued: true }])
    setQ(''); setNewGroup(null); setAskType(false)
  }
  const groups = (['lab', 'imaging'] as ExamGroup[]).filter((g) => !group || g === group)
  const isOpen = (key: string, marked: number) => fold[key] ?? (!!n || marked > 0)
  const flip = (key: string, marked: number) => setFold({ ...fold, [key]: !isOpen(key, marked) })
  // CA4 (ronda 7): Laboratorio › área › sección (las áreas con secciones llevan un nivel más)
  const trees = Object.fromEntries(groups.map((g) => [g, byArea(hits, g)])) as Record<ExamGroup, ReturnType<typeof byArea<CatalogExam>>>
  const allKeys = groups.flatMap((g) => [g, ...trees[g].flatMap((a) => [`${g}:${a.key}`, ...a.sections.map((x) => `${g}:${x.key}`)])])
  const close = () => { if (!catalogOnly) writePicked([]); onClose() }
  // CA5: un estudio con detalles se ordena «armado» (Rayos X de tórax PA y lateral…)
  function withDetailFlag(e: ExamInput): ExamInput { return !catalogOnly && hasDetails(detailsOf(e.name)) ? { ...e, detailed: true } : e }
  const shown = showAll ? picked : picked.slice(0, 6)
  return (
    <Modal title={title} wide className="exam-picker-modal" onClose={close} footer={<>
      {picked.length > 0 && (
        <div className="exam-picker__picked" aria-live="polite">
          <b>Seleccionados ({picked.length})</b>
          <div className="chips">
            {shown.map((e) => <span key={e.name} className={`chip${missingOf(e) ? ' chip--amber' : ''}`}>{examLine(e)}{e.uncatalogued && <small className="muted"> · no catalogado</small>}
              <button type="button" className="icon-btn" aria-label={`Quitar ${e.name}`} onClick={() => setPicked(picked.filter((x) => x !== e))}><X size={12} /></button></span>)}
            {picked.length > 6 && <button type="button" className="linklike" onClick={() => setShowAll(!showAll)}>{showAll ? 'Ver menos' : `y ${picked.length - 6} más`}</button>}
          </div>
        </div>
      )}
      {!catalogOnly && can('exams.order') && picked.some((e) => inCatalog(e.name)) && (
        <button className="btn btn--ghost" style={{ marginRight: 'auto' }} onClick={() => setSavingSet(true)}><ListChecks size={15} />Guardar selección como set</button>)}
      <button className="btn btn--ghost" onClick={close}>Cancelar</button>
      {firstMissing && <small className="field__msg field__msg--warn exam-picker__missing" role="status">Falta elegir {firstMissing.m} de {firstMissing.e.name}.</small>}
      <button className="btn btn--primary" disabled={!picked.length || !!firstMissing} onClick={() => { if (!catalogOnly) writePicked([]); onAdd(picked) }}>Agregar ({picked.length})</button>
    </>}>
      <div className="exam-picker__bar">
        <input className="input" autoFocus value={q} onChange={(e) => { setQ(e.target.value); setAskType(false); setNewGroup(null) }} placeholder="Buscar: hemograma, ultrasonido, EKG…" aria-label="Buscar examen"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (hits.length === 1) { toggle(hits[0].group, hits[0].name); setQ('') } else if (n && !exact && !catalogOnly) setAskType(true) } }} />
        <div className="segmented" role="radiogroup" aria-label="Grupo">
          <button type="button" role="radio" aria-checked={group === ''} onClick={() => setGroup('')}>Todos</button>
          <button type="button" role="radio" aria-checked={group === 'lab'} onClick={() => setGroup('lab')}>Laboratorio</button>
          <button type="button" role="radio" aria-checked={group === 'imaging'} onClick={() => setGroup('imaging')}>Imagen y gabinete</button>
        </div>
      </div>
      {!catalogOnly && (
        <div className="exam-picker__menus">
          <button type="button" className="btn btn--soft btn--sm" aria-expanded={menu === 'sets'} onClick={() => setMenu(menu === 'sets' ? null : 'sets')}><ListChecks size={15} />Mis sets ({sets?.length ?? 0})</button>
          <button type="button" className="btn btn--soft btn--sm" aria-expanded={menu === 'profiles'} onClick={() => setMenu(menu === 'profiles' ? null : 'profiles')}><FlaskConical size={15} />Perfiles ({profiles.length})</button>
          <span className="fold-tools" style={{ marginLeft: 'auto' }}>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setFold(Object.fromEntries(allKeys.map((k) => [k, true])))}>Expandir todo</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setFold(Object.fromEntries(allKeys.map((k) => [k, false])))}>Contraer todo</button>
          </span>
        </div>
      )}
      {menu === 'sets' && (
        <div className="exam-picker__menu" role="list" aria-label="Mis sets">
          {sets?.length ? sets.map((st) => { const items = st.items.flatMap((it) => (it.exam ? [it.exam] : []))
            return <div key={st.id} role="listitem" className="exam-picker__menu-row">
              <button type="button" className="exam-picker__menu-pick" onClick={() => applyList(st.name, items)}><b>{st.name}</b><small className="muted">{items.map((e) => e.name).join(', ')}</small></button>
            </div> }) : <p className="muted">Todavía no tienes sets de exámenes. Marca exámenes y usa «Guardar selección como set».</p>}
        </div>
      )}
      {menu === 'profiles' && (
        <div className="exam-picker__menu" role="list" aria-label="Perfiles de laboratorio">
          {profiles.length ? profiles.map((pr) => {
            const off = pr.items.filter((e) => !inCatalog(e.name))
            return <div key={pr.id} role="listitem" className="exam-picker__menu-row">
              <button type="button" className="exam-picker__menu-pick" onClick={() => applyList(pr.name, pr.items)}><b>{pr.name}</b>
                <small className="muted">{pr.items.map((e) => (off.includes(e) ? `${e.name} (no disponible)` : e.name)).join(', ')}</small>
                {pr.note && <small className="exam-picker__note">{pr.note}</small>}</button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => copyToMine(pr)}>Copiar a Mis sets</button>
            </div> }) : <p className="muted">La clínica todavía no tiene perfiles de laboratorio (Configuración › Catálogo de exámenes).</p>}
        </div>
      )}
      <div className="exam-picker__results">
        {groups.map((g) => {
          const areas = trees[g]
          if (!areas.length) return null
          const markedIn = (list: CatalogExam[]) => list.filter((e) => pickedKeys.has(keyOf(e.name))).length
          const count = areas.reduce((a, x) => a + x.count, 0)
          const marked = areas.reduce((a, x) => a + markedIn(x.items) + x.sections.reduce((b, y) => b + markedIn(y.items), 0), 0)
          const open = isOpen(g, marked)
          const rows = (items: CatalogExam[], id: string) => <div id={id} className="exam-rows">{items.map((e) => {
            const on = have.has(keyOf(e.name))
            const already = current.some((c) => keyOf(c.name) === keyOf(e.name))
            const mine = picked.find((x) => keyOf(x.name) === keyOf(e.name))
            const missing = mine && missingOf(mine)
            return <div key={e.name} className={`exam-pick-cell${mine && !catalogOnly && hasDetails(e.details) ? ' has-details' : ''}`}>
              <label className={`exam-row-pick${on ? ' is-on' : ''}${already ? ' is-already' : ''}`}>
                <input type="checkbox" checked={on} disabled={already} onChange={() => toggle(e.group, e.name)} />
                <span>{e.name}{already && <small className="muted"> · ya está en la nota</small>}
                  {missing && <small className="exam-pick__missing">Falta elegir {missing}</small>}</span>
              </label>
              {/* CA5 (ronda 10): debajo del estudio marcado, sus botones (proyección, contraste, lado) y la región */}
              {mine && !catalogOnly && hasDetails(e.details) && <ExamDetailChips exam={mine} details={e.details!} onChange={(patch) => setPickedItem(e.name, patch)} />}
            </div>
          })}</div>
          return (
            <section key={g} className="exam-fold">
              <FoldHead id={`fold-${g}`} open={open} onToggle={() => flip(g, marked)} title={<>{g === 'lab' ? <FlaskConical size={15} /> : <ScanLine size={15} />}{GROUP_LABEL[g]}</>} count={count} marked={marked} />
              {open && <div id={`fold-${g}`} className="exam-fold__body">{areas.map((a) => {
                const k = `${g}:${a.key}`
                const m = markedIn(a.items) + a.sections.reduce((b, y) => b + markedIn(y.items), 0)
                const o = isOpen(k, m)
                return (
                  <div key={k} className="exam-fold__sub">
                    <FoldHead id={`fold-${k}`} level={2} open={o} onToggle={() => flip(k, m)} title={a.title} count={a.count} marked={m} />
                    {o && <>
                      {a.items.length > 0 && rows(a.items, `fold-${k}`)}
                      {a.sections.length > 0 && <div id={a.items.length ? undefined : `fold-${k}`} className="exam-fold__secs">{a.sections.map((x) => {
                        const sk = `${g}:${x.key}`
                        const sm = markedIn(x.items)
                        const so = isOpen(sk, sm)
                        return <div key={sk} className="exam-fold__sec">
                          <FoldHead id={`fold-${sk}`} level={3} open={so} onToggle={() => flip(sk, sm)} title={x.title} count={x.items.length} marked={sm} />
                          {so && rows(x.items, `fold-${sk}`)}
                        </div>
                      })}</div>}
                    </>}
                  </div>
                )
              })}</div>}
            </section>
          )
        })}
        {/* GE6 (ronda 10): sin resultados, el mismo espacio con el aviso (la ventana no se encoge) */}
        {n && !hits.length && <p className="muted exam-picker__empty">Ningún examen coincide</p>}
        {q.trim().length >= 2 && !exact && !catalogOnly && (
          <div className="exam-picker__new">
            {!askType ? (
              <button type="button" className="exam-picker__new-row" onClick={() => setAskType(true)}><Plus size={15} />Agregar «{q.trim()}» como estudio no catalogado</button>
            ) : (<>
              <span><b>«{q.trim()}»</b> no está en el catálogo. ¿Qué tipo de estudio es?</span>
              <div className="segmented" role="radiogroup" aria-label="Tipo del estudio no catalogado">
                <button type="button" role="radio" aria-checked={newGroup === 'lab'} onClick={() => setNewGroup('lab')}>Laboratorio</button>
                <button type="button" role="radio" aria-checked={newGroup === 'imaging'} onClick={() => setNewGroup('imaging')}>Imagen y gabinete</button>
              </div>
              <button type="button" className="btn btn--primary btn--sm" disabled={!newGroup} onClick={addUncatalogued}><Plus size={14} />Agregar como no catalogado</button>
              <small className="muted">Va a su sección y a la bandeja que le corresponde, con la etiqueta «No catalogado».</small>
            </>)}
          </div>
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

/**
 * CA5 (ronda 10): lo que falta para que la orden de imagen se pueda cumplir, con botones pequeños: proyecciones (varias),
 * contraste (uno), lado (uno) y la región escrita. La orden se arma sola («Rayos X de rodilla AP y lateral · Lado derecho»).
 */
export function ExamDetailChips({ exam, details, onChange }: { exam: ExamInput; details: ImagingDetails; onChange: (patch: Partial<ExamInput>) => void }) {
  const projections = exam.projections ?? []
  const contrasts = contrastOptions(details)
  return (
    <div className="exam-details" role="group" aria-label={`Detalles de ${exam.name}`}>
      {!!details.projections?.length && <div className="exam-details__row"><span className="exam-details__lbl">Proyección</span>
        {details.projections.map((p) => <button key={p} type="button" className="chip chip--toggle" aria-pressed={projections.includes(p)}
          onClick={() => onChange({ projections: projections.includes(p) ? projections.filter((x) => x !== p) : details.projections!.filter((x) => x === p || projections.includes(x)) })}>{p}</button>)}</div>}
      {contrasts.length > 0 && <div className="exam-details__row"><span className="exam-details__lbl">Contraste</span>
        {contrasts.map((c) => <button key={c} type="button" className="chip chip--toggle" aria-pressed={exam.contrast === c} onClick={() => onChange({ contrast: exam.contrast === c ? undefined : c })}>{c}</button>)}</div>}
      {details.side && <div className="exam-details__row"><span className="exam-details__lbl">Lado</span>
        {IMAGING_SIDES.map((x) => <button key={x.value} type="button" className="chip chip--toggle" aria-pressed={exam.side === x.value} onClick={() => onChange({ side: exam.side === x.value ? undefined : x.value })}>{x.label}</button>)}</div>}
      {details.region && <label className="exam-details__row"><span className="exam-details__lbl">Región</span>
        <input className="input input--sm" value={exam.region ?? ''} onChange={(e) => onChange({ region: e.target.value || undefined })} placeholder="Ej. cara anterior del muslo derecho" aria-label={`Región de ${exam.name}`} /></label>}
    </div>
  )
}
