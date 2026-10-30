import { useMemo, useState } from 'react'
import { Archive, ChevronDown, Pencil, Plus, RotateCcw } from 'lucide-react'
import { useStore } from '../lib/store'
import { DEFAULT_CRITICAL_GROUPS, type CriticalAnalyte, type CriticalGroup } from '../lib/clinicalConfig'
import { examCatalog, EXAMS } from '../lib/exams'
import { useExamCatalog } from '../lib/useExamCatalog'
import { parseDecimal } from '../lib/vitals'

const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
const num = (x?: number) => (x == null ? '' : String(x))
/** Sin la marca de archivado (al restaurar). */
function restored<T extends { archivedAt?: string }>(x: T): T {
  const copy = { ...x }
  delete copy.archivedAt
  return copy
}

/**
 * AD1 (ronda 5): umbrales críticos de laboratorio por grupo. Cada grupo es una sección plegable con sus analitos
 * (nombre, unidad, crítico si es menor de, crítico si es mayor de). Se agregan grupos y analitos; se renombran, se
 * editan y se archivan (nada se borra). Un límite vacío es «No aplica». Los números por omisión están en
 * src/lib/clinicalConfig.ts; lo que se guarda aquí manda sobre ellos.
 */
export function CriticalThresholds() {
  const { settings, saveCriticalGroups } = useStore()
  const saved = settings.criticalGroups?.length ? settings.criticalGroups : DEFAULT_CRITICAL_GROUPS
  const [groups, setGroups] = useState<CriticalGroup[]>(() => structuredClone(saved))
  const [text, setText] = useState<Record<string, string>>({})
  const [showArchived, setShowArchived] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { exams: clinicExams } = useExamCatalog()
  // Sugerencias del catálogo de exámenes: sus analitos y los exámenes (no es obligatorio que el nombre exista ahí)
  const suggestions = useMemo(() => [...new Set([...EXAMS.flatMap((e) => e.analytes?.map((a) => a.name) ?? []), ...examCatalog(clinicExams).map((e) => e.name)])].sort((a, b) => a.localeCompare(b, 'es')), [clinicExams])
  const units = useMemo(() => Object.fromEntries(EXAMS.flatMap((e) => e.analytes ?? []).filter((a) => a.unit).map((a) => [a.name, a.unit])), [])
  const dirty = JSON.stringify(groups) !== JSON.stringify(saved)
  const archived = groups.filter((g) => g.archivedAt).length + groups.reduce((n, g) => n + g.analytes.filter((a) => a.archivedAt).length, 0)

  const setGroup = (id: string, f: (g: CriticalGroup) => CriticalGroup) => setGroups((gs) => gs.map((g) => (g.id === id ? f(g) : g)))
  const setAnalyte = (gid: string, aid: string, f: (a: CriticalAnalyte) => CriticalAnalyte) => setGroup(gid, (g) => ({ ...g, analytes: g.analytes.map((a) => (a.id === aid ? f(a) : a)) }))
  const setLimit = (gid: string, a: CriticalAnalyte, side: 'low' | 'high', raw: string) => {
    setText({ ...text, [`${a.id}-${side}`]: raw })
    const v = parseDecimal(raw)
    if (v === undefined || !Number.isNaN(v)) setAnalyte(gid, a.id, (x) => ({ ...x, [side]: v }))
  }
  const field = (a: CriticalAnalyte, side: 'low' | 'high') => text[`${a.id}-${side}`] ?? num(a[side])
  const bad = (a: CriticalAnalyte, side: 'low' | 'high') => { const t = text[`${a.id}-${side}`]; return t != null && Number.isNaN(parseDecimal(t)) }
  // Un analito tiene un solo umbral: no se repite entre los activos
  const key = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  const activeNames = groups.filter((g) => !g.archivedAt).flatMap((g) => g.analytes.filter((a) => !a.archivedAt).map((a) => key(a.name)))
  const repeated = (a: CriticalAnalyte) => !a.archivedAt && !!a.name.trim() && activeNames.filter((n) => n === key(a.name)).length > 1
  const invalid = groups.some((g) => !g.name.trim() || g.analytes.some((a) => !a.name.trim() || bad(a, 'low') || bad(a, 'high') || repeated(a) || (a.low != null && a.high != null && a.low >= a.high)))
  const now = () => new Date().toISOString()

  const save = async () => {
    setBusy(true)
    const clean = groups.map((g) => ({ ...g, name: g.name.trim(), analytes: g.analytes.map((a) => ({ ...a, name: a.name.trim(), unit: a.unit?.trim() || undefined })) }))
    if (await saveCriticalGroups(clean)) { setText({}); setRenaming(null) }
    setBusy(false)
  }
  const addGroup = () => {
    const id = uid('g')
    setGroups([...groups, { id, name: '', analytes: [] }])
    setRenaming(id)
  }

  return (
    <section className="panel crit">
      <div className="panel__head" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div><h2>Umbrales críticos de laboratorio</h2><p>Un resultado fuera de estos valores avisa al médico como crítico. Organizados por grupo, como vienen del laboratorio.</p></div>
        <button className="btn btn--soft btn--sm" onClick={addGroup}><Plus size={15} />Agregar grupo</button>
      </div>
      <datalist id="crit-analytes">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
      <div className="panel__body crit__groups">
        {groups.filter((g) => showArchived || !g.archivedAt).map((g) => {
          const list = g.analytes.filter((a) => showArchived || !a.archivedAt)
          return (
            <details key={g.id} className={`crit__group${g.archivedAt ? ' is-archived' : ''}`} open>
              <summary>
                <ChevronDown size={16} className="crit__chev" aria-hidden />
                {renaming === g.id
                  ? <input className="input" autoFocus value={g.name} placeholder="Nombre del grupo (ej. Hemograma)" aria-label="Nombre del grupo" onClick={(e) => e.preventDefault()}
                    onKeyDown={(e) => { if (e.key === ' ') e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); setRenaming(null) } }}
                    onChange={(e) => setGroup(g.id, (x) => ({ ...x, name: e.target.value }))} />
                  : <b>{g.name}</b>}
                <small className="muted">{g.archivedAt ? 'Archivado' : `${g.analytes.filter((a) => !a.archivedAt).length} analito${g.analytes.filter((a) => !a.archivedAt).length === 1 ? '' : 's'}`}</small>
                <span className="crit__acts" onClick={(e) => e.preventDefault()}>
                  {!g.archivedAt && renaming !== g.id && <button type="button" className="btn btn--ghost btn--sm" onClick={() => setRenaming(g.id)}><Pencil size={13} />Renombrar</button>}
                  {g.archivedAt
                    ? <button type="button" className="btn btn--ghost btn--sm" onClick={() => setGroup(g.id, restored)}><RotateCcw size={13} />Restaurar</button>
                    : <button type="button" className="btn btn--ghost btn--sm" onClick={() => setGroup(g.id, (x) => ({ ...x, archivedAt: now() }))}><Archive size={13} />Archivar</button>}
                </span>
              </summary>
              <div className="crit__rows" role="table" aria-label={`Umbrales de ${g.name}`}>
                <div className="crit__row crit__row--head" role="row">
                  <span role="columnheader">Analito</span><span role="columnheader">Unidad</span>
                  <span role="columnheader">Crítico si es menor de</span><span role="columnheader">Crítico si es mayor de</span><span />
                </div>
                {list.map((a) => (
                  <div key={a.id} className={`crit__row${a.archivedAt ? ' is-archived' : ''}`} role="row">
                    <input className="input crit__name" list="crit-analytes" value={a.name} placeholder="Ej. Hematocrito" aria-label="Analito" disabled={!!a.archivedAt}
                      onChange={(e) => setAnalyte(g.id, a.id, (x) => ({ ...x, name: e.target.value, unit: x.unit || units[e.target.value] }))} />
                    <input className="input crit__unit" value={a.unit ?? ''} placeholder="Sin unidad" aria-label={`${a.name}: unidad`} disabled={!!a.archivedAt}
                      onChange={(e) => setAnalyte(g.id, a.id, (x) => ({ ...x, unit: e.target.value }))} />
                    {(['low', 'high'] as const).map((side) => (
                      <label key={side} className={`crit__lim crit__${side}`}><span className="crit__lbl">{side === 'low' ? 'Menor de' : 'Mayor de'}</span>
                        <input className={`input num${bad(a, side) ? ' input--blank' : ''}`} inputMode="decimal" value={field(a, side)} placeholder="No aplica" disabled={!!a.archivedAt}
                          aria-label={`${a.name}: crítico si es ${side === 'low' ? 'menor' : 'mayor'} de`} aria-invalid={bad(a, side)} onChange={(e) => setLimit(g.id, a, side, e.target.value)} /></label>
                    ))}
                    {a.archivedAt
                      ? <button type="button" className="icon-btn crit__btn" title="Restaurar" aria-label={`Restaurar ${a.name}`} onClick={() => setAnalyte(g.id, a.id, restored)}><RotateCcw size={15} /></button>
                      : <button type="button" className="icon-btn crit__btn" title="Archivar" aria-label={`Archivar ${a.name}`} onClick={() => setAnalyte(g.id, a.id, (x) => ({ ...x, archivedAt: now() }))}><Archive size={15} /></button>}
                    {a.low != null && a.high != null && a.low >= a.high && <small className="crit__err">El límite inferior debe ser menor que el superior.</small>}
                    {repeated(a) && <small className="crit__err">{a.name} ya está en la lista: un analito tiene un solo umbral.</small>}
                  </div>
                ))}
                {!list.length && <p className="muted" style={{ margin: '6px 0' }}>Sin analitos en este grupo.</p>}
              </div>
              {!g.archivedAt && <button type="button" className="btn btn--ghost btn--sm" style={{ justifySelf: 'start' }}
                onClick={() => setGroup(g.id, (x) => ({ ...x, analytes: [...x.analytes, { id: uid('a'), name: '' }] }))}><Plus size={14} />Agregar analito</button>}
            </details>
          )
        })}
        {archived > 0 && <label className="check-inline"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />Ver archivados ({archived})</label>}
      </div>
      <div className="panel__body" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid var(--line-soft)' }}>
        <button className="btn btn--primary" disabled={!dirty || invalid || busy} onClick={save}>Guardar umbrales</button>
        {dirty && <button className="btn btn--ghost" onClick={() => { setGroups(structuredClone(saved)); setText({}); setRenaming(null) }}>Descartar cambios</button>}
        {invalid && <small className="crit__err">Revisa los nombres y los números marcados.</small>}
      </div>
    </section>
  )
}
