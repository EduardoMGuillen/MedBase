import { useEffect, useState } from 'react'
import { Archive, FlaskConical, Pencil, Plus, RotateCcw, ScanLine, Trash2, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { FoldHead, Modal, SectionHead } from '../components/ui'
import { ExamPicker } from '../components/Exams'
import { useExamCatalog } from '../lib/useExamCatalog'
import { byArea, EXAMS, examKey, GROUP_LABEL, hasDetails, SUBGROUPS, subgroupOf } from '../lib/exams'
import type { ImagingDetails } from '../lib/imagingCatalog'
import { normalize } from '../lib/patients'
import { rangeText, referenceOf, type LabReference } from '../lib/labReference'
import { ReferenceNote } from './ExamsTab'
import { SourceTag } from '../components/SourceTag'
import { dmyTime } from '../lib/format'
import type { ClinicExam, ExamGroup } from '../lib/types'

/**
 * AD4 (ronda 5): catálogo de exámenes de la clínica, la batería que se ofrece al ordenar. Administración agrega, edita y
 * quita (archiva) exámenes de Laboratorio o de Imagen y gabinete; lo ya ordenado en notas anteriores no cambia. Empieza
 * con la lista que tenía la app. Cada cambio queda en la bitácora.
 */
export function ExamCatalogAdmin({ only, readOnly = false }: { only?: ExamGroup; readOnly?: boolean } = {}) {
  const { notify } = useStore()
  const { exams: all, reload } = useExamCatalog()
  // DP5 (ronda 11): en «Configuración de laboratorio / imágenes», solo su tipo; los técnicos solo ven
  const exams = only ? all.filter((e) => e.group === only) : all
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<ClinicExam | 'new' | null>(null)
  // CA7 (ronda 11): ya no se archiva: «Quitar» borra el examen del catálogo, tras confirmar
  const [removing, setRemoving] = useState<ClinicExam | null>(null)
  const n = normalize(q)
  const list = exams.filter((e) => e.active && (!n || normalize(e.name).includes(n))).sort((a, b) => a.name.localeCompare(b.name, 'es'))
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
  const remove = async (e: ClinicExam) => {
    try { await api(`/exams/catalog/${e.id}`, { method: 'DELETE' }); setRemoving(null); reload(); notify(`${e.name} se quitó del catálogo`) } catch (x) { notify((x as Error).message, 'error') }
  }
  return (
    <section className="panel">
      <SectionHead title="Catálogo de exámenes" sub="Los exámenes que los médicos pueden ordenar. Quitar uno lo borra del catálogo: deja de ofrecerse, pero las notas y órdenes que ya lo tienen no cambian."
        action={readOnly ? undefined : <button className="btn btn--primary btn--sm" onClick={() => setEditing('new')}><Plus size={15} />Agregar examen</button>} />
      <div className="panel__body" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', paddingBottom: 0 }}>
        <input className="input" style={{ maxWidth: 360 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar examen" aria-label="Buscar examen" />
      </div>
      <div className="panel__body excat">
        {/* CF4 (ronda 6): Laboratorio e Imagen y gabinete plegables, cerrados al entrar; dentro, sus subgrupos (CF3) */}
        <div className="fold-tools">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setFold(Object.fromEntries(allKeys.map((k) => [k, true])))}>Expandir todo</button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setFold(Object.fromEntries(allKeys.map((k) => [k, false])))}>Contraer todo</button>
        </div>
        {(['lab', 'imaging'] as ExamGroup[]).filter((g) => !only || g === only).map((g) => {
          const areas = trees[g]
          const count = areas.reduce((a, x) => a + x.count, 0)
          if (n && !count) return null
          const open = isOpen(g)
          const rows = (items: ClinicExam[], id: string) => <ul id={id} className="excat__list">
            {items.map((e) => (
              <li key={e.id}>
                <span><b>{e.name}</b>
                  {refOf(e) ? <button type="button" className="linklike" style={{ fontSize: 13 }} aria-expanded={refOpen === e.id} onClick={() => setRefOpen(refOpen === e.id ? null : e.id)}>
                    {refOpen === e.id ? 'Ocultar valores de referencia' : `Valores de referencia${analytes(e) ? ` (${analytes(e)})` : ''}`}</button>
                    : e.group === 'lab' && <small className="muted">{analytes(e) > 0 ? `${analytes(e)} ${analytes(e) === 1 ? 'valor' : 'valores'} con rango de referencia` : 'Sin valores de referencia en la lista de Emil'}</small>}
                  {refOpen === e.id && refOf(e) && <RefDetails r={refOf(e)!} />}
                  {/* CA5 (ronda 10): qué pide al ordenarlo */}
                  {e.group === 'imaging' && hasDetails(detailsOf(e)) && <small className="muted" style={{ display: 'block' }}>Pide al ordenar: {detailsSummary(detailsOf(e)!)}</small>}</span>
                {!readOnly && <span className="excat__acts">
                  <button className="btn btn--ghost btn--sm" aria-label={`Editar ${e.name}`} title="Editar" onClick={() => setEditing(e)}><Pencil size={13} /><span>Editar</span></button>
                  <button className="btn btn--ghost btn--sm" aria-label={`Quitar ${e.name}`} title="Quitar" onClick={() => setRemoving(e)}><Trash2 size={13} /><span>Quitar</span></button>
                </span>}
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
      {editing && <ExamForm only={only} exam={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />}
      {removing && <Modal title={`¿Quitar ${removing.name}?`} onClose={() => setRemoving(null)} footer={<>
        <button className="btn btn--ghost" onClick={() => setRemoving(null)}>Cancelar</button>
        <button className="btn btn--danger" onClick={() => remove(removing)}><Trash2 size={15} />Quitar</button>
      </>}><p>Se quitará del catálogo. Las órdenes que ya lo usan no cambian.</p></Modal>}
    </section>
  )
}

function ExamForm({ exam, onClose, onSaved, only }: { exam?: ClinicExam; onClose: () => void; onSaved: () => void; only?: ExamGroup }) {
  const { notify } = useStore()
  const [name, setName] = useState(exam?.name ?? '')
  const [group, setGroup] = useState<ExamGroup>(exam?.group ?? only ?? 'lab')
  // CF3 (ronda 6): subgrupo (el del examen, el de la lista fija u «Otros»)
  const [subgroup, setSubgroup] = useState(exam ? subgroupOf(exam) : 'Otros')
  // CA5 (ronda 10): proyecciones y si pide contraste, lado o región (los de la lista fija si la clínica no los cambió)
  const initialDetails = exam ? detailsOf(exam) ?? {} : {}
  const [details, setDetails] = useState<ImagingDetails>(initialDetails)
  const [newProj, setNewProj] = useState('')
  const detailsChanged = JSON.stringify(clean(details)) !== JSON.stringify(clean(initialDetails))
  const options = [...new Set([...SUBGROUPS[group], subgroup])]
  const [busy, setBusy] = useState(false)
  // Ronda 12 (LB4): los valores de referencia se guardan con el mismo botón que el examen
  const initialRefs = (exam?.refs ?? []).map(toDraft)
  const [refs, setRefs] = useState<RefDraft[]>(initialRefs)
  const [refNote, setRefNote] = useState('')
  const refsDirty = JSON.stringify(refs) !== JSON.stringify(initialRefs)
  const badRefs = refs.some((r) => [r.low, r.high].some((t) => t.trim() && Number.isNaN(numOf(t)!)))
  const examChanged = !exam || name.trim() !== exam.name || group !== exam.group || subgroup !== subgroupOf(exam) || detailsChanged
  const save = async () => {
    setBusy(true)
    try {
      if (exam && refsDirty) await saveRefs(exam.id, refs, refNote)
      if (exam && !examChanged) { notify('Valores de referencia guardados'); onSaved(); return }
      if (exam) await api(`/exams/catalog/${exam.id}`, { method: 'PATCH', body: { name: name.trim(), group, subgroup, ...(detailsChanged ? { details: hasDetails(clean(details)) ? clean(details) : null } : {}) } })
      // CA6 (ronda 11): un estudio de imagen nuevo también dice qué pide al ordenarlo (p. ej. «¿De qué?»)
      else await api('/exams/catalog', { body: { name: name.trim(), group, subgroup, ...(group === 'imaging' && hasDetails(clean(details)) ? { details: clean(details) } : {}) } })
      notify(exam ? 'Examen actualizado' : 'Examen agregado al catálogo')
      onSaved()
    } catch (e) { notify((e as Error).message, 'error') } finally { setBusy(false) }
  }
  return (
    <Modal title={exam ? `Editar examen: ${exam.name}` : 'Agregar examen'} wide className="excat-modal" onClose={onClose} footer={<>
      {refsDirty && <span className="muted" style={{ marginRight: 'auto', fontSize: 13.5 }}>Hay cambios en los valores de referencia sin guardar.</span>}
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={busy || name.trim().length < 2 || badRefs || (!!exam && !examChanged && !refsDirty)} onClick={save}>{exam ? 'Guardar cambios' : 'Agregar'}</button>
    </>}>
      <div className="excat-form__top">
      <label className="field"><span>Nombre del examen</span><input className="input" autoFocus={!exam} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Dímero D" /></label>
      {!only && <div className="field"><span>Categoría</span>
        <div className="segmented" role="radiogroup" aria-label="Categoría">
          {(['lab', 'imaging'] as ExamGroup[]).filter((g) => !only || g === only).map((g) => <button key={g} type="button" role="radio" aria-checked={group === g} onClick={() => { setGroup(g); if (!SUBGROUPS[g].includes(subgroup)) setSubgroup('Otros') }}>{GROUP_LABEL[g]}</button>)}
        </div>
        <small className="muted">Decide a quién le llega el pendiente: laboratorio, imágenes o enfermería.</small>
      </div>}
      <label className="field"><span>Subgrupo</span>
        <select className="select" value={subgroup} onChange={(e) => setSubgroup(e.target.value)}>{options.map((o) => <option key={o}>{o}</option>)}</select>
        <small className="muted">Así se agrupa al ordenar y en este catálogo.</small></label>
      </div>
      {group === 'imaging' && (
        <fieldset className="fs"><legend>Al ordenarlo pide</legend>
          {/* CA6 (ronda 11): «¿De qué?» (texto libre obligatorio) con su ejemplo gris */}
          <label className="check-inline"><input type="checkbox" checked={!!details.what} onChange={(e) => setDetails({ ...details, what: e.target.checked || undefined })} />Pide escribir «¿De qué?» (ej. tórax, rodilla)</label>
          {details.what && <label className="field"><span>Ejemplo gris de «¿De qué?»</span><input className="input" value={details.whatHint ?? ''} onChange={(e) => setDetails({ ...details, whatHint: e.target.value || undefined })} placeholder="Ej. tórax, rodilla" /></label>}
          <div className="field"><span>Proyecciones (Rayos X)</span>
            <div className="chips">{(details.projections ?? []).map((pr) => <span key={pr} className="chip">{pr}
              <button type="button" className="icon-btn" aria-label={`Quitar ${pr}`} onClick={() => setDetails({ ...details, projections: (details.projections ?? []).filter((x) => x !== pr) })}><X size={12} /></button></span>)}</div>
            <span style={{ display: 'flex', gap: 6 }}><input className="input" value={newProj} onChange={(e) => setNewProj(e.target.value)} placeholder="Ej. Oblicua" aria-label="Nueva proyección"
              onKeyDown={(e) => { if (e.key === 'Enter' && newProj.trim()) { e.preventDefault(); setDetails({ ...details, projections: [...(details.projections ?? []), newProj.trim()] }); setNewProj('') } }} />
              <button type="button" className="btn btn--soft btn--sm" disabled={!newProj.trim()} onClick={() => { setDetails({ ...details, projections: [...(details.projections ?? []), newProj.trim()] }); setNewProj('') }}><Plus size={14} />Agregar</button></span></div>
          <label className="field"><span>Contraste</span>
            <select className="select" value={details.contrast ?? ''} onChange={(e) => setDetails({ ...details, contrast: (e.target.value || undefined) as ImagingDetails['contrast'] })}>
              <option value="">No pide contraste</option>
              <option value="ct2">Tomografía: simple o contrastada</option><option value="mr2">Resonancia: simple o con contraste</option>
              {/* Los de CA5 (ronda 10), si un estudio todavía los usa */}
              {details.contrast === 'ct' && <option value="ct">Tomografía: simple, contrastada, simple y contrastada</option>}
              {details.contrast === 'ct-multi' && <option value="ct-multi">Tomografía, también doble y triple contraste</option>}
              {details.contrast === 'mr' && <option value="mr">Resonancia: simple o con gadolinio</option>}</select></label>
          {(!!details.projections?.length || !!details.contrast) && <label className="check-inline"><input type="checkbox" checked={!!details.free} onChange={(e) => setDetails({ ...details, free: e.target.checked || undefined })} />También se puede escribir otra proyección u otro contraste</label>}
          <label className="field"><span>Lado (derecho, izquierdo o bilateral)</span>
            <select className="select" value={details.side ? (details.sideOptional ? 'optional' : 'required') : ''} onChange={(e) => setDetails({ ...details, side: e.target.value ? true : undefined, sideOptional: e.target.value === 'optional' || undefined })}>
              <option value="">No pide el lado</option><option value="optional">Opcional</option><option value="required">Obligatorio</option></select></label>
          <label className="check-inline"><input type="checkbox" checked={!!details.region} onChange={(e) => setDetails({ ...details, region: e.target.checked || undefined })} />Pide escribir la región</label>
        </fieldset>
      )}
      {exam && exam.group === 'lab' && <RefEditor exam={exam} rows={refs} setRows={setRefs} comment={refNote} setComment={setRefNote} />}
    </Modal>
  )
}

type Ref = NonNullable<ClinicExam['refs']>[number]
type RefDraft = { id?: string; analyte: string; sex: 'all' | 'F' | 'M'; unit: string; low: string; high: string; highOpen: boolean; expected: string; note: string; archive?: boolean }
const toDraft = (r: Ref): RefDraft => ({ id: r.id, analyte: r.analyte ?? '', sex: r.sex, unit: r.unit, low: r.low == null ? '' : String(r.low), high: r.high == null ? '' : String(r.high), highOpen: !!r.highOpen, expected: r.expected ?? '', note: r.note ?? '' })
const SEX_LABEL = { all: 'Todos', F: 'Mujeres', M: 'Hombres' } as const

const numOf = (t: string) => (t.trim() === '' ? undefined : Number(t.replace(',', '.')))
async function saveRefs(examId: string, rows: RefDraft[], comment: string) {
  await api(`/exams/catalog/${examId}/refs`, { method: 'PUT', body: { comment: comment.trim() || undefined, rows: rows.filter((r) => r.id || r.analyte.trim() || r.expected.trim()).map((r) => ({
    id: r.id, analyte: r.analyte.trim() || undefined, sex: r.sex, unit: r.unit.trim(), low: numOf(r.low), high: numOf(r.high), highOpen: r.highOpen || undefined,
    expected: r.expected.trim() || undefined, note: r.note.trim() || undefined, archive: r.archive || undefined })) } })
}

/**
 * UM1 (ronda 8) y LB4 (ronda 12): valores de referencia del examen en una tabla, un renglón por parámetro: nombre (y sexo),
 * mínimo, máximo, unidad, resultado esperado o texto de referencia, fuente y «Quitar». Al editar, la fuente pasa a «Definido
 * por la clínica» y el valor anterior queda en el historial. Se guardan con el botón del examen.
 */
function RefEditor({ exam, rows, setRows, comment, setComment }: { exam: ClinicExam; rows: RefDraft[]; setRows: (r: RefDraft[]) => void; comment: string; setComment: (t: string) => void }) {
  const { staffById } = useStore()
  const [history, setHistory] = useState<(Ref & { archivedAt?: string; archivedBy?: string; archiveReason?: string })[] | null>(null)
  const set = (i: number, patch: Partial<RefDraft>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const refOf = (r: RefDraft) => (exam.refs ?? []).find((x) => x.id === r.id)
  return (
    <section className="refed">
      <div className="refed__title"><h3>Parámetros y valores de referencia</h3>
        <span className="muted">Cada parámetro es una casilla al cargar el resultado. Referencia general; el rango oficial es el del laboratorio que emite el resultado.</span></div>
      {!rows.length ? <p className="muted">Sin parámetros: al cargar el resultado solo se escribe un comentario o se sube el archivo.</p> : (
        <div className="refed__table" role="table" aria-label="Valores de referencia">
          <div className="refed__tr refed__th" role="row"><span>Parámetro</span><span>Mínimo</span><span>Máximo</span><span>Unidad</span><span>Resultado esperado o texto</span><span>Fuente</span><span /></div>
          {rows.map((r, i) => {
            const cur = refOf(r)
            return (
              <div key={r.id ?? `new-${i}`} className={`refed__tr${r.archive ? ' is-archived' : ''}`} role="row">
                <span className="refed__name">
                  {r.id ? <b>{r.analyte || 'Resultado'}</b> : <input className="input" value={r.analyte} onChange={(e) => set(i, { analyte: e.target.value })} placeholder="Parámetro" aria-label="Parámetro" />}
                  {r.id ? r.sex !== 'all' && <span className="badge">{SEX_LABEL[r.sex]}</span> : <select className="select" value={r.sex} onChange={(e) => set(i, { sex: e.target.value as RefDraft['sex'] })} aria-label="Sexo">{(['all', 'F', 'M'] as const).map((x) => <option key={x} value={x}>{SEX_LABEL[x]}</option>)}</select>}
                  {cur?.warn && <span className="badge badge--amber" title="Revisa la unidad que usa tu laboratorio">⚠️</span>}
                </span>
                <input className="input num" inputMode="decimal" value={r.low} onChange={(e) => set(i, { low: e.target.value })} placeholder="—" aria-label={`Mínimo de ${r.analyte || 'resultado'}`} />
                <span className="refed__max"><input className="input num" inputMode="decimal" value={r.high} onChange={(e) => set(i, { high: e.target.value })} placeholder="—" aria-label={`Máximo de ${r.analyte || 'resultado'}`} />
                  {r.high.trim() && <label className="refed__lt" title="«menor que»: el máximo ya es alto"><input type="checkbox" checked={r.highOpen} onChange={(e) => set(i, { highOpen: e.target.checked })} />&lt;</label>}</span>
                <input className="input" value={r.unit} onChange={(e) => set(i, { unit: e.target.value })} placeholder="—" aria-label="Unidad" />
                <span className="refed__text"><input className="input" value={r.expected} onChange={(e) => set(i, { expected: e.target.value })} placeholder={r.low || r.high ? 'Opcional' : 'Ej. Negativo'} aria-label="Resultado esperado o texto" title={r.expected} />
                  {r.note && <small className="muted" title={r.note}>{r.note}</small>}</span>
                <span className="refed__src"><SourceTag codes={cur ? cur.sources : ['clinic']} />{cur?.origin === 'clinic' && <small className="muted">Clínica{cur.editedBy ? ` · ${staffById(cur.editedBy)?.name ?? ''}` : ''}</small>}</span>
                <span className="refed__act">{r.id ? <button type="button" className="link-btn" onClick={() => set(i, { archive: !r.archive })}>{r.archive ? 'Deshacer' : 'Quitar'}</button>
                  : <button type="button" className="icon-btn" aria-label="Quitar" onClick={() => setRows(rows.filter((_, j) => j !== i))}><X size={14} /></button>}</span>
              </div>
            )
          })}
        </div>
      )}
      <div className="refed__foot">
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setRows([...rows, { analyte: '', sex: 'all', unit: '', low: '', high: '', highOpen: false, expected: '', note: '' }])}><Plus size={14} />Agregar parámetro</button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={async () => setHistory(history ? null : await api(`/exams/catalog/${exam.id}/refs/history`))}>{history ? 'Ocultar historial' : 'Ver historial'}</button>
        <input className="input" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Nota del cambio (opcional). Ej. Rango del laboratorio de la clínica" aria-label="Nota del cambio" />
      </div>
      {history && <ul className="refed__hist">{history.filter((h) => h.archivedAt).map((h) => (
        <li key={h.id}><b>{h.analyte || 'Resultado esperado'}</b>{h.sex !== 'all' ? ` (${SEX_LABEL[h.sex]})` : ''}: {h.expected ?? rangeText(h)} {h.unit} · {h.originLabel} · {h.archiveReason} el {dmyTime(h.archivedAt!)}{h.archivedBy ? ` por ${staffById(h.archivedBy)?.name ?? ''}` : ''}</li>
      ))}{!history.some((h) => h.archivedAt) && <li className="muted">Sin cambios anteriores.</li>}</ul>}
    </section>
  )
}

type ClinicProfile = { id: string; name: string; items: { group: ExamGroup; name: string }[]; note?: string; archivedAt?: string }

/**
 * CF6 (ronda 6): perfiles de laboratorio de la clínica (aparecen como «Perfiles (N)» al ordenar exámenes). Administración
 * agrega, edita, archiva y restaura; el médico sólo los usa o los copia a «Mis sets». Un examen archivado en el catálogo
 * sale «no disponible» y no se ordena.
 */
export function LabProfilesAdmin({ readOnly = false }: { readOnly?: boolean } = {}) {
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
        action={readOnly ? undefined : <button className="btn btn--primary btn--sm" onClick={() => setEditing('new')}><Plus size={15} />Agregar perfil</button>} />
      <div className="panel__body excat">
        {nArchived > 0 && <label className="check-inline"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />Ver archivados ({nArchived})</label>}
        {list === null ? <p className="muted">Cargando…</p> : !shown.length ? <p className="muted">La clínica todavía no tiene perfiles de laboratorio.</p> : (
          <ul className="excat__list">{shown.map((p) => (
            <li key={p.id} className={p.archivedAt ? 'is-archived' : ''}>
              <span><b>{p.name}</b>{p.archivedAt && <span className="badge">Archivado</span>}
                <small className="muted">{p.items.map((e) => (active.has(examKey(e.name)) ? e.name : `${e.name} (no disponible)`)).join(', ')}</small>
                {p.note && <small className="exam-picker__note">{p.note}</small>}</span>
              {!readOnly && <span className="excat__acts">
                {!p.archivedAt && <button className="btn btn--ghost btn--sm" aria-label={`Editar ${p.name}`} title="Editar" onClick={() => setEditing(p)}><Pencil size={13} /><span>Editar</span></button>}
                {p.archivedAt ? <button className="btn btn--ghost btn--sm" aria-label={`Restaurar ${p.name}`} title="Restaurar" onClick={() => setArchivedFlag(p, false)}><RotateCcw size={13} /><span>Restaurar</span></button>
                  : <button className="btn btn--ghost btn--sm" aria-label={`Archivar ${p.name}`} title="Archivar" onClick={() => setArchivedFlag(p, true)}><Archive size={13} /><span>Archivar</span></button>}
              </span>}
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

/** CA5 (ronda 10): los detalles que pide un estudio: los guardados por la clínica o los de la lista fija. */
function detailsOf(e: ClinicExam): ImagingDetails | undefined {
  return e.details ?? EXAMS.find((b) => examKey(b.name) === (e.baseKey ?? examKey(e.name)))?.details
}
const clean = (d: ImagingDetails): ImagingDetails => ({ ...(d.what ? { what: true, ...(d.whatHint?.trim() ? { whatHint: d.whatHint.trim() } : {}) } : {}),
  ...(d.projections?.length ? { projections: d.projections } : {}), ...(d.contrast ? { contrast: d.contrast } : {}), ...(d.free && (d.projections?.length || d.contrast) ? { free: true } : {}),
  ...(d.side ? { side: true, ...(d.sideOptional ? { sideOptional: true } : {}) } : {}), ...(d.region ? { region: true } : {}), ...(d.again ? { again: d.again } : {}) })
/** «Pide al ordenar: de qué · proyección · lado». */
function detailsSummary(d: ImagingDetails) {
  return [d.what && 'de qué', d.projections?.length && `proyección (${d.projections.join(', ')}${d.free ? ' o escrita' : ''})`, d.contrast && `contraste${d.free ? ' (botones o escrito)' : ''}`,
    d.side && (d.sideOptional ? 'lado (opcional)' : 'lado'), d.region && 'región'].filter(Boolean).join(' · ')
}
