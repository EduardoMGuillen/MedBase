import { useEffect, useState } from 'react'
import { Archive, FlaskConical, Pencil, Plus, RotateCcw, ScanLine, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { FoldHead, Modal, SectionHead } from '../components/ui'
import { ExamPicker } from '../components/Exams'
import { useExamCatalog } from '../lib/useExamCatalog'
import { byArea, EXAMS, examKey, GROUP_LABEL, SUBGROUPS, subgroupOf } from '../lib/exams'
import { normalize } from '../lib/patients'
import { rangeText, referenceOf, type LabReference } from '../lib/labReference'
import { ReferenceNote } from './ExamsTab'
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
  // CA4 (ronda 7): Laboratorio › área › sección, en el orden del formulario
  const trees = { lab: byArea(list, 'lab'), imaging: byArea(list, 'imaging') }
  const allKeys = (['lab', 'imaging'] as ExamGroup[]).flatMap((g) => [g, ...trees[g].flatMap((a) => [`${g}:${a.key}`, ...a.sections.map((x) => `${g}:${x.key}`)])])
  // UM1 (ronda 8): los valores de referencia del documento de Emil (por nombre o por el de la lista fija si se renombró)
  const refOf = (e: ClinicExam) => e.group === 'lab' ? referenceOf(e.name) ?? (e.baseKey ? referenceOf(EXAMS.find((b) => examKey(b.name) === e.baseKey)?.name ?? '') : undefined) : undefined
  const analytes = (e: ClinicExam) => refOf(e)?.analytes?.length ?? (e.baseKey ? EXAMS.find((b) => examKey(b.name) === e.baseKey)?.analytes?.length ?? 0 : 0)
  const [refOpen, setRefOpen] = useState<string | null>(null)
  const setActive = async (e: ClinicExam, active: boolean) => {
    try { await api(`/exams/catalog/${e.id}`, { method: 'PATCH', body: { active } }); reload(); notify(active ? `${e.name} vuelve al catálogo` : `${e.name} archivado: ya no se ofrece al ordenar`) } catch (x) { notify((x as Error).message, 'error') }
  }
  return (
    <section className="panel">
      <SectionHead title="Catálogo de exámenes" sub="Los exámenes que los médicos pueden ordenar. Quitar uno lo archiva: deja de ofrecerse, pero las notas que ya lo tienen no cambian."
        action={<button className="btn btn--primary btn--sm" onClick={() => setEditing('new')}><Plus size={15} />Agregar examen</button>} />
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
          const areas = trees[g]
          const count = areas.reduce((a, x) => a + x.count, 0)
          if (n && !count) return null
          const open = isOpen(g)
          const rows = (items: ClinicExam[], id: string) => <ul id={id} className="excat__list">
            {items.map((e) => (
              <li key={e.id} className={e.active ? '' : 'is-archived'}>
                <span><b>{e.name}</b>{!e.active && <span className="badge">Archivado</span>}
                  {refOf(e) ? <button type="button" className="linklike" style={{ fontSize: 13 }} aria-expanded={refOpen === e.id} onClick={() => setRefOpen(refOpen === e.id ? null : e.id)}>
                    {refOpen === e.id ? 'Ocultar valores de referencia' : `Valores de referencia${analytes(e) ? ` (${analytes(e)})` : ''}`}</button>
                    : e.group === 'lab' && <small className="muted">{analytes(e) > 0 ? `${analytes(e)} ${analytes(e) === 1 ? 'valor' : 'valores'} con rango de referencia` : 'Sin valores de referencia en la lista de Emil'}</small>}
                  {refOpen === e.id && refOf(e) && <RefDetails r={refOf(e)!} />}</span>
                <span className="excat__acts">
                  {e.active && <button className="btn btn--ghost btn--sm" aria-label={`Editar ${e.name}`} title="Editar" onClick={() => setEditing(e)}><Pencil size={13} /><span>Editar</span></button>}
                  {e.active
                    ? <button className="btn btn--ghost btn--sm" aria-label={`Archivar ${e.name}`} title="Archivar" onClick={() => setActive(e, false)}><Archive size={13} /><span>Archivar</span></button>
                    : <button className="btn btn--ghost btn--sm" aria-label={`Restaurar ${e.name}`} title="Restaurar" onClick={() => setActive(e, true)}><RotateCcw size={13} /><span>Restaurar</span></button>}
                </span>
              </li>
            ))}
          </ul>
          return (
            <div key={g} className="exam-fold">
              <FoldHead id={`cat-${g}`} open={open} onToggle={() => flip(g)} title={<>{g === 'lab' ? <FlaskConical size={16} /> : <ScanLine size={16} />}{GROUP_LABEL[g]}</>} count={count} />
              {open && <div id={`cat-${g}`} className="exam-fold__body">
                {!areas.length && <p className="muted">Sin exámenes.</p>}
                {areas.map((a) => {
                  const k = `${g}:${a.key}`
                  const o = isOpen(k)
                  return (
                    <div key={k}>
                      <FoldHead id={`cat-${k}`} level={2} open={o} onToggle={() => flip(k)} title={a.title} count={a.count} />
                      {o && <>
                        {a.items.length > 0 && rows(a.items, `cat-${k}`)}
                        {a.sections.length > 0 && <div className="exam-fold__secs">{a.sections.map((x) => {
                          const sk = `${g}:${x.key}`
                          const so = isOpen(sk)
                          return <div key={sk}>
                            <FoldHead id={`cat-${sk}`} level={3} open={so} onToggle={() => flip(sk)} title={x.title} count={x.items.length} />
                            {so && rows(x.items, `cat-${sk}`)}
                          </div>
                        })}</div>}
                      </>}
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

type ClinicProfile = { id: string; name: string; items: { group: ExamGroup; name: string }[]; note?: string; archivedAt?: string }

/**
 * CF6 (ronda 6): perfiles de laboratorio de la clínica (aparecen como «Perfiles (N)» al ordenar exámenes). Administración
 * agrega, edita, archiva y restaura; el médico sólo los usa o los copia a «Mis sets». Un examen archivado en el catálogo
 * sale «no disponible» y no se ordena.
 */
export function LabProfilesAdmin() {
  const { notify } = useStore()
  const { exams, reload: reloadCatalog } = useExamCatalog()
  const [list, setList] = useState<ClinicProfile[] | null>(null)
  const [archived, setArchived] = useState(false)
  const [editing, setEditing] = useState<ClinicProfile | 'new' | null>(null)
  const load = () => api<ClinicProfile[]>('/exams/profiles/clinic').then(setList).catch((e: Error) => notify(e.message, 'error'))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [])
  const active = new Set(exams.filter((e) => e.active).map((e) => examKey(e.name)))
  const shown = (list ?? []).filter((p) => archived || !p.archivedAt)
  const nArchived = (list ?? []).filter((p) => p.archivedAt).length
  const setArchivedFlag = async (p: ClinicProfile, value: boolean) => {
    try { await api(`/exams/profiles/${p.id}`, { method: 'PATCH', body: { archived: value } }); notify(value ? `«${p.name}» archivado` : `«${p.name}» restaurado`); void load(); reloadCatalog() } catch (e) { notify((e as Error).message, 'error') }
  }
  return (
    <section className="panel">
      <SectionHead title="Perfiles de laboratorio" sub="Paquetes de exámenes de la clínica. Los médicos los eligen en «Ordenar exámenes» y pueden copiarlos a Mis sets para cambiarlos."
        action={<button className="btn btn--primary btn--sm" onClick={() => setEditing('new')}><Plus size={15} />Agregar perfil</button>} />
      <div className="panel__body excat">
        {nArchived > 0 && <label className="check-inline"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />Ver archivados ({nArchived})</label>}
        {list === null ? <p className="muted">Cargando…</p> : !shown.length ? <p className="muted">La clínica todavía no tiene perfiles de laboratorio.</p> : (
          <ul className="excat__list">{shown.map((p) => (
            <li key={p.id} className={p.archivedAt ? 'is-archived' : ''}>
              <span><b>{p.name}</b>{p.archivedAt && <span className="badge">Archivado</span>}
                <small className="muted">{p.items.map((e) => (active.has(examKey(e.name)) ? e.name : `${e.name} (no disponible)`)).join(', ')}</small>
                {p.note && <small className="exam-picker__note">{p.note}</small>}</span>
              <span className="excat__acts">
                {!p.archivedAt && <button className="btn btn--ghost btn--sm" aria-label={`Editar ${p.name}`} title="Editar" onClick={() => setEditing(p)}><Pencil size={13} /><span>Editar</span></button>}
                {p.archivedAt ? <button className="btn btn--ghost btn--sm" aria-label={`Restaurar ${p.name}`} title="Restaurar" onClick={() => setArchivedFlag(p, false)}><RotateCcw size={13} /><span>Restaurar</span></button>
                  : <button className="btn btn--ghost btn--sm" aria-label={`Archivar ${p.name}`} title="Archivar" onClick={() => setArchivedFlag(p, true)}><Archive size={13} /><span>Archivar</span></button>}
              </span>
            </li>
          ))}</ul>
        )}
      </div>
      {editing && <ProfileForm profile={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); reloadCatalog() }} />}
    </section>
  )
}

function ProfileForm({ profile, onClose, onSaved }: { profile?: ClinicProfile; onClose: () => void; onSaved: () => void }) {
  const { notify } = useStore()
  const [name, setName] = useState(profile?.name ?? '')
  const [items, setItems] = useState<{ group: ExamGroup; name: string }[]>(profile?.items ?? [])
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      if (profile) await api(`/exams/profiles/${profile.id}`, { method: 'PATCH', body: { name: name.trim(), items } })
      else await api('/exams/profiles', { body: { name: name.trim(), items, clinic: true } })
      notify(profile ? 'Perfil guardado' : `Perfil «${name.trim()}» agregado`)
      onSaved()
    } catch (e) { notify((e as Error).message, 'error') } finally { setBusy(false) }
  }
  return (
    <Modal title={profile ? 'Editar perfil' : 'Agregar perfil'} onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={busy || name.trim().length < 3 || items.length < 2} onClick={save}>Guardar perfil</button>
    </>}>
      <label className="field"><span>Nombre del perfil</span><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Febril" /></label>
      <div className="field"><span>Exámenes ({items.length})</span>
        <div className="chips">{items.map((e) => (
          <span key={e.name} className="chip">{e.name}<button type="button" className="icon-btn" aria-label={`Quitar ${e.name}`} onClick={() => setItems(items.filter((x) => x !== e))}><X size={12} /></button></span>
        ))}</div>
        {items.length < 2 && <small className="muted">Un perfil lleva al menos dos exámenes.</small>}</div>
      <button type="button" className="btn btn--soft" style={{ justifySelf: 'start' }} onClick={() => setPicking(true)}><Plus size={15} />Agregar exámenes</button>
      {picking && <ExamPicker current={items.map((e) => ({ ...e, priority: 'routine', place: 'clinic' }))} catalogOnly title="Exámenes del perfil" onClose={() => setPicking(false)}
        onAdd={(list) => { setItems([...items, ...list.map((e) => ({ group: e.group, name: e.name }))]); setPicking(false) }} />}
    </Modal>
  )
}

/** UM1 (ronda 8): tabla de valores de referencia de un examen (con su unidad y su texto) y sus fuentes. */
function RefDetails({ r }: { r: LabReference }) {
  return (
    <span style={{ display: 'grid', gap: 6, marginTop: 6 }}>
      {!!r.analytes?.length && <table className="ref-table"><tbody>{r.analytes.map((a) => (
        <tr key={a.name}><th>{a.name}</th><td>{[rangeText(a), a.unit].filter(Boolean).join(' ')}{a.text ? `${rangeText(a) ? ' · ' : ''}${a.text}` : ''}</td></tr>
      ))}</tbody></table>}
      <ReferenceNote r={r} />
    </span>
  )
}
