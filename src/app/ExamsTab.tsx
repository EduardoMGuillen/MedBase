import { Fragment, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Camera, CheckCheck, ChevronRight, ChevronsDownUp, ChevronsUpDown, FileText, FlaskConical, Printer, ScanLine, TriangleAlert, Upload, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { Modal } from '../components/ui'
import { cap, date, dateTime, inputDateTime, shortStaff } from '../lib/format'
import { canReview, examCatalog, examLine, examStatusLabel, findExam, GROUP_LABEL, isPending, NEXT_ACTION, reportOptional, STATUS_LABEL } from '../lib/exams'
import { useExamCatalog } from '../lib/useExamCatalog'
import { openFile, uploadLarge } from '../lib/files'
import type { ExamGroup, ExamOrder } from '../lib/types'

const TONE: Record<string, string> = { ordered: 'amber', sample: 'ink', done: 'ink', result: 'mint', reviewed: 'done', cancelled: '' }

/**
 * EX1: exámenes de un paciente (en una estancia o en su historial) en dos subsecciones, Laboratorio e Imagen y gabinete,
 * cada uno con lo pedido, su estado y su resultado. Quien los procesa marca muestra tomada o realizado y carga el
 * resultado; el médico lo marca como revisado; cualquiera de los dos lo cancela con motivo.
 */
type ExamSort = 'recent' | 'oldest'
const EXAM_SORTS: { key: ExamSort; label: string }[] = [{ key: 'recent', label: 'Más recientes primero' }, { key: 'oldest', label: 'Más antiguos primero' }]
type ExamFilter = 'all' | 'pending' | 'result' | 'critical'
const EXAM_FILTERS: { key: ExamFilter; label: string; test: (e: ExamOrder) => boolean }[] = [
  { key: 'all', label: 'Todos', test: () => true },
  { key: 'pending', label: 'Pendientes', test: (e) => isPending(e) },
  { key: 'result', label: 'Con resultado', test: (e) => e.status === 'result' || e.status === 'reviewed' },
  { key: 'critical', label: 'Críticos', test: (e) => !!e.critical },
]
const fold = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const dayKey = (iso: string) => new Date(iso).toDateString()

/**
 * EX1: exámenes de un paciente (en una estancia o en su historial) en dos subsecciones, Laboratorio e Imagen y gabinete,
 * cada uno con lo pedido, su estado y su resultado. Quien los procesa marca muestra tomada o realizado y carga el
 * resultado; el médico lo marca como revisado; cualquiera de los dos lo cancela con motivo.
 * EX1 (ronda 8): cada examen es una fila desplegable; cerrada muestra nombre, estado, fecha del pedido y «Valor crítico», y
 * sus botones de acción se usan sin abrirla. Sólo un crítico sin revisar empieza abierto. Arriba: «Buscar examen», orden
 * por fecha (con el día como encabezado), filtros con su conteo y «Expandir todo / Contraer todo». Es sólo presentación.
 */
export function ExamList({ exams, patientId, hospitalizationId, reload, open = true }: { exams: ExamOrder[]; patientId: string; hospitalizationId?: string; reload: () => void; open?: boolean }) {
  const { can } = useStore()
  const [uploading, setUploading] = useState<ExamGroup | null>(null)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<ExamSort>('recent')
  const [filter, setFilter] = useState<ExamFilter>('all')
  // Abiertos a mano (true) o cerrados a mano (false); lo que no está aquí sigue la regla
  const [shown, setShown] = useState<Record<string, boolean>>({})
  const groups: ExamGroup[] = ['lab', 'imaging']
  const batches = [...new Set(exams.filter((e) => e.status !== 'cancelled').map((e) => e.batchId))]
  const startsOpen = (e: ExamOrder) => !!e.critical && e.status === 'result'
  const isOpen = (e: ExamOrder) => shown[e.id] ?? startsOpen(e)
  const match = (e: ExamOrder) => !q.trim() || fold(`${examLine(e)} ${e.indication ?? ''}`).includes(fold(q.trim()))
  const passes = (e: ExamOrder) => EXAM_FILTERS.find((f) => f.key === filter)!.test(e)
  const order = (a: ExamOrder, b: ExamOrder) => (sort === 'oldest' ? a.orderedAt.localeCompare(b.orderedAt) : b.orderedAt.localeCompare(a.orderedAt))
  const visible = exams.filter((e) => match(e) && passes(e))
  const setAll = (v: boolean) => setShown((x) => ({ ...x, ...Object.fromEntries(visible.map((e) => [e.id, v])) }))
  return (
    <div className="hc" data-tour="examenes-tab">
      {exams.length > 0 && (
        <div className="exam-tools" role="search">
          <label className="field field--inline exam-tools__q"><span>Buscar examen</span>
            <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar examen" aria-label="Buscar examen" /></label>
          <label className="field field--inline"><span>Orden</span>
            <select className="select" value={sort} onChange={(e) => setSort(e.target.value as ExamSort)}>{EXAM_SORTS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select></label>
          <div className="segmented segmented--sm exam-tools__filters" role="radiogroup" aria-label="Mostrar">
            {EXAM_FILTERS.map((f) => <button key={f.key} type="button" role="radio" aria-checked={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label} <span className="num">{exams.filter((e) => match(e) && f.test(e)).length}</span></button>)}
          </div>
          <span className="fold-tools">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAll(true)}><ChevronsUpDown size={14} />Expandir todo</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAll(false)}><ChevronsDownUp size={14} />Contraer todo</button>
          </span>
        </div>
      )}
      {groups.map((g) => {
        const all = exams.filter((e) => e.group === g)
        const list = all.filter((e) => match(e) && passes(e)).sort(order)
        return (
          <section key={g} className="panel">
            <div className="panel__head"><div><h2>{g === 'lab' ? <FlaskConical size={17} style={{ verticalAlign: '-3px' }} /> : <ScanLine size={17} style={{ verticalAlign: '-3px' }} />} {GROUP_LABEL[g]}</h2>
              <p>{all.filter(isPending).length} pendiente{all.filter(isPending).length === 1 ? '' : 's'} · {all.filter((e) => e.status === 'result' || e.status === 'reviewed').length} con resultado</p></div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {open && can('exams.process') && <button className="btn btn--ghost btn--sm" onClick={() => setUploading(g)}><Upload size={14} />Subir resultado externo</button>}
              </div></div>
            {list.length ? <div className="rows">{list.map((e, i) => (
              <Fragment key={e.id}>
                {(i === 0 || dayKey(list[i - 1].orderedAt) !== dayKey(e.orderedAt)) && <div className="exam-day">{cap(date(e.orderedAt, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</div>}
                <ExamRow e={e} reload={reload} open={open} expanded={isOpen(e)} onToggle={() => setShown((x) => ({ ...x, [e.id]: !isOpen(e) }))} />
              </Fragment>
            ))}</div>
              : <div className="empty">{all.length ? 'Ningún examen coincide' : `Sin exámenes de ${GROUP_LABEL[g].toLowerCase()}.`}</div>}
          </section>
        )
      })}
      {batches.length > 0 && (
        <section className="panel"><div className="panel__body" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Ronda 8: cada orden se imprime (los externos los lleva el paciente, como la receta) */}
          <span className="muted" style={{ fontSize: 14 }}>Órdenes impresas:</span>
          {batches.map((b) => {
            const list = exams.filter((e) => e.batchId === b && e.status !== 'cancelled')
            const f = list[0]
            return <Link key={b} className={`btn ${list.some((e) => e.place === 'external') ? 'btn--soft' : 'btn--ghost'} btn--sm`} to={`/app/examenes/orden/${b}`}>
              <Printer size={14} />{f.orderNo ? `${f.orderNo} · ` : ''}{dateTime(f.orderedAt)}{list.some((e) => e.place === 'external') ? ' · para llevar' : ''}</Link>
          })}
        </div></section>
      )}
      {uploading && <ExternalResult group={uploading} patientId={patientId} hospitalizationId={hospitalizationId} onClose={() => setUploading(null)} onDone={() => { setUploading(null); reload() }} />}
    </div>
  )
}

function ExamRow({ e, reload, open, expanded, onToggle }: { e: ExamOrder; reload: () => void; open: boolean; expanded: boolean; onToggle: () => void }) {
  const { can, staffById, notify, user } = useStore()
  const [result, setResult] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const act = async (path: string, body?: unknown) => {
    try { await api(`/exams/${e.id}/${path}`, { body: body ?? {} }); reload() } catch (x) { notify((x as Error).message, 'error') }
  }
  const next = NEXT_ACTION[e.group][e.status]
  const optional = reportOptional(e)
  // Ronda 8: una radiografía realizada todavía acepta su informe (opcional)
  const canResult = open && can('exams.process') && (isPending(e) || (optional && e.status === 'done'))
  const id = `exam-${e.id}`
  return (
    <div className={`exam-row${e.priority === 'urgent' && isPending(e) ? ' exam-row--urgent' : ''}${e.critical ? ' exam-row--critical' : ''}${expanded ? '' : ' is-folded'}`}>
      <div className="exam-row__main">
        <button type="button" className="exam-row__toggle" aria-expanded={expanded} aria-controls={id} onClick={onToggle}>
          <ChevronRight size={16} className="exam-row__chev" aria-hidden />
          <strong>{examLine(e)}{e.priority === 'urgent' && <span className="badge badge--red" style={{ marginLeft: 6 }}>Urgente</span>}{e.place === 'external' && <span className="badge" style={{ marginLeft: 6 }}>Externo</span>}{e.uncatalogued && <span className="badge badge--neutral" style={{ marginLeft: 6 }}>No catalogado</span>}{!expanded && e.critical && <span className="badge badge--red" style={{ marginLeft: 6 }}>Valor crítico</span>}</strong>
        </button>
        <span className="muted" style={{ fontSize: 13 }}>Pedido {dateTime(e.orderedAt)} por {shortStaff(staffById(e.orderedBy)?.name)}{e.indication ? ` · ${e.indication}` : ''}</span>
        {expanded && <div id={id} className="exam-row__body">
          <span className="exam-row__trail">{(e.events ?? []).filter((x) => x.status !== 'ordered').map((x) => `${STATUS_LABEL[e.group][x.status]} ${dateTime(x.at)} (${shortStaff(staffById(x.by)?.name)})`).join(' · ')}</span>
          {e.status === 'cancelled' && <span className="muted" style={{ fontSize: 13 }}>Cancelado: {e.cancelReason}</span>}
          {optional && e.status === 'done' && <span className="muted" style={{ fontSize: 13 }}>Realizada. El informe (lectura) es opcional en los rayos X.</span>}
          {e.result && <ResultView e={e} />}
        </div>}
      </div>
      <div className="exam-row__side">
        <span className={`badge ${TONE[e.status] ? `badge--${TONE[e.status]}` : ''}`}>{examStatusLabel(e)}</span>
        {/* EX1: las acciones se usan sin abrir la fila */}
        {<>
          {open && can('exams.process') && isPending(e) && e.status === 'ordered' && <button className="btn btn--soft btn--sm" onClick={() => act('status', { status: e.group === 'lab' ? 'sample' : 'done' })}>{next}</button>}
          {canResult && <button className={`btn ${optional ? 'btn--ghost' : 'btn--primary'} btn--sm`} onClick={() => setResult(true)}>{e.group === 'lab' ? 'Cargar resultado' : optional ? 'Agregar informe (opcional)' : 'Cargar informe'}</button>}
          {canReview(e) && can('exams.order') && user?.role === 'doctor' && <button className="btn btn--primary btn--sm" onClick={() => act('review')}><CheckCheck size={14} />Marcar revisado</button>}
          {open && isPending(e) && (can('exams.process') || can('exams.order')) && <button className="btn btn--ghost btn--sm" onClick={() => setCancelling(true)}>Cancelar</button>}
        </>}
      </div>
      {result && <ResultModal e={e} onClose={() => setResult(false)} onDone={() => { setResult(false); reload() }} />}
      {cancelling && <CancelExam e={e} onClose={() => setCancelling(false)} onDone={() => { setCancelling(false); reload() }} />}
    </div>
  )
}

/** Resultado: valores con unidad y rango (alto o bajo marcado), informe y archivos. */
export function ResultView({ e }: { e: ExamOrder }) {
  const { notify } = useStore()
  const r = e.result!
  return (
    <div className="exam-result">
      {e.critical && <p className="exam-result__critical"><TriangleAlert size={14} />Valor crítico</p>}
      {r.values?.length ? (
        <table className="exam-values"><tbody>{r.values.map((v) => (
          <tr key={v.analyte} className={v.flag ? `is-${v.flag}` : undefined}>
            <th>{v.analyte}</th><td className="num"><b>{v.value}</b> {v.unit}</td>
            <td className="muted num">{v.low != null || v.high != null ? `${v.low ?? ''}–${v.high ?? ''}` : ''}</td>
            <td>{v.flag && <span className={`badge ${v.critical ? 'badge--red' : 'badge--amber'}`}>{v.flag === 'high' ? 'Alto' : 'Bajo'}{v.critical ? ' · crítico' : ''}</span>}</td>
          </tr>
        ))}</tbody></table>
      ) : null}
      {r.report && <p className="exam-result__report">{r.report}</p>}
      {r.fileIds?.map((f, i) => <button key={f} type="button" className="btn btn--ghost btn--sm" onClick={() => openFile(f).catch((x: Error) => notify(x.message, 'error'))}><FileText size={14} />Archivo {r.fileIds!.length > 1 ? i + 1 : ''}</button>)}
    </div>
  )
}

function ResultModal({ e, onClose, onDone }: { e: ExamOrder; onClose: () => void; onDone: () => void }) {
  const { notify } = useStore()
  // AD4: también si la clínica renombró el examen, sus valores con rango vienen del de la lista fija
  const { exams: clinicExams } = useExamCatalog()
  const analytes = findExam(e.name, examCatalog(clinicExams))?.analytes ?? []
  const [values, setValues] = useState<Record<string, string>>({})
  const [extra, setExtra] = useState<{ analyte: string; value: string; unit: string }[]>([])
  const [report, setReport] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const filled = [...analytes.filter((a) => values[a.name]?.trim()).map((a) => ({ analyte: a.name, value: values[a.name].trim(), unit: a.unit, low: a.low, high: a.high })),
    ...extra.filter((x) => x.analyte.trim() && x.value.trim()).map((x) => ({ analyte: x.analyte.trim(), value: x.value.trim(), unit: x.unit.trim() || undefined }))]
  const ready = filled.length > 0 || report.trim().length > 0 || !!file
  return (
    <Modal title={`${e.group === 'lab' ? 'Resultado' : 'Informe'}: ${examLine(e)}`} wide onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!ready || busy} onClick={async () => {
        setBusy(true)
        try {
          const fileIds = file ? [(await uploadLarge(e.patientId, file, { name: file.name, mime: file.type || 'application/pdf', category: e.group, title: e.name, hospitalizationId: e.hospitalizationId })).id] : undefined
          await api(`/exams/${e.id}/result`, { body: { values: filled.length ? filled : undefined, report: report.trim() || undefined, fileIds } })
          onDone()
        } catch (x) { notify((x as Error).message, 'error') }
        setBusy(false)
      }}>Guardar {e.group === 'lab' ? 'resultado' : 'informe'}</button>
    </>}>
      {e.group === 'lab' && (<>
        {analytes.length > 0 && <table className="exam-values exam-values--input"><thead><tr><th>Analito</th><th>Valor</th><th>Referencia</th></tr></thead><tbody>
          {analytes.map((a) => (
            <tr key={a.name}><th>{a.name}</th><td><input className="input num" inputMode="decimal" value={values[a.name] ?? ''} onChange={(x) => setValues({ ...values, [a.name]: x.target.value })} aria-label={a.name} /> <span className="muted">{a.unit}</span></td>
              <td className="muted num">{a.low != null || a.high != null ? `${a.low ?? ''}–${a.high ?? ''} ${a.unit}` : ''}</td></tr>
          ))}</tbody></table>}
        {extra.map((x, i) => (
          <div key={i} className="form-grid form-grid--3">
            <input className="input" value={x.analyte} onChange={(ev) => setExtra(extra.map((y, j) => (j === i ? { ...y, analyte: ev.target.value } : y)))} placeholder="Analito" />
            <input className="input num" value={x.value} onChange={(ev) => setExtra(extra.map((y, j) => (j === i ? { ...y, value: ev.target.value } : y)))} placeholder="Valor" />
            <div style={{ display: 'flex', gap: 6 }}><input className="input" value={x.unit} onChange={(ev) => setExtra(extra.map((y, j) => (j === i ? { ...y, unit: ev.target.value } : y)))} placeholder="Unidad" />
              <button className="icon-btn" aria-label="Quitar" onClick={() => setExtra(extra.filter((_, j) => j !== i))}><X size={15} /></button></div>
          </div>
        ))}
        <button type="button" className="btn btn--ghost btn--sm" style={{ justifySelf: 'start' }} onClick={() => setExtra([...extra, { analyte: '', value: '', unit: '' }])}>Agregar otro valor</button>
      </>)}
      <label className="field"><span>{e.group === 'lab' ? 'Comentario o resultado en texto (opcional)' : 'Informe (conclusión)'}</span>
        <textarea className="textarea" rows={4} value={report} onChange={(x) => setReport(x.target.value)} placeholder={e.group === 'lab' ? 'Ej. EGO: leucocitos 10-15 por campo, nitritos positivos.' : 'Ej. Vesícula con litos múltiples, pared de 3 mm; vía biliar sin dilatación.'} /></label>
      <div className="field"><span>Foto o PDF del {e.group === 'lab' ? 'resultado' : 'informe o las imágenes'} (opcional)</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn--soft btn--sm" onClick={() => input.current?.click()}><Camera size={15} />{file ? 'Cambiar archivo' : 'Tomar foto o elegir archivo'}</button>
          {file && <span className="muted">{file.name}</span>}
        </div>
        <input ref={input} type="file" accept="image/*,application/pdf" hidden onChange={(x) => setFile(x.target.files?.[0] ?? null)} />
      </div>
    </Modal>
  )
}

function CancelExam({ e, onClose, onDone }: { e: ExamOrder; onClose: () => void; onDone: () => void }) {
  const { notify } = useStore()
  const [reason, setReason] = useState('')
  return (
    <Modal title={`Cancelar ${examLine(e)}`} onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Volver</button>
      <button className="btn btn--danger" disabled={reason.trim().length < 3} onClick={async () => {
        try { await api(`/exams/${e.id}/cancel`, { body: { reason: reason.trim() } }); onDone() } catch (x) { notify((x as Error).message, 'error') }
      }}>Cancelar examen</button>
    </>}>
      <label className="field"><span>Motivo</span><input className="input" autoFocus value={reason} onChange={(x) => setReason(x.target.value)} placeholder="Ej. El paciente se fue; el médico lo suspendió" /></label>
    </Modal>
  )
}

/** Resultado que llega sin orden en el sistema (laboratorio externo): queda como examen con su archivo. */
function ExternalResult({ group, patientId, hospitalizationId, onClose, onDone }: { group: ExamGroup; patientId: string; hospitalizationId?: string; onClose: () => void; onDone: () => void }) {
  const { notify } = useStore()
  const [name, setName] = useState('')
  const [takenAt, setTakenAt] = useState(() => inputDateTime(new Date()))
  const [file, setFile] = useState<File | null>(null)
  const [report, setReport] = useState('')
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  return (
    <Modal title={`Resultado externo de ${GROUP_LABEL[group].toLowerCase()}`} onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={name.trim().length < 2 || !file || busy} onClick={async () => {
        setBusy(true)
        try {
          const att = await uploadLarge(patientId, file!, { name: file!.name, mime: file!.type || 'application/pdf', category: group, title: name.trim(), takenAt: new Date(takenAt).toISOString(), hospitalizationId })
          await api('/exams/external-result', { body: { patientId, hospitalizationId, group, name: name.trim(), takenAt: new Date(takenAt).toISOString(), fileIds: [att.id], report: report.trim() || undefined } })
          onDone()
        } catch (x) { notify((x as Error).message, 'error') }
        setBusy(false)
      }}>Guardar</button>
    </>}>
      <p className="muted" style={{ fontSize: 14 }}>Para un resultado que el paciente trae o que llegó de otro laboratorio, sin orden en el sistema.</p>
      <label className="field"><span>Qué examen es</span><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={group === 'lab' ? 'Ej. Hemograma' : 'Ej. Ultrasonido abdominal'} /></label>
      <label className="field"><span>Fecha y hora</span><input className="input" type="datetime-local" value={takenAt} onChange={(e) => setTakenAt(e.target.value)} /></label>
      {group === 'imaging' && <label className="field"><span>Informe (opcional)</span><textarea className="textarea textarea--sm" rows={3} value={report} onChange={(e) => setReport(e.target.value)} /></label>}
      <div className="field"><span>Foto o PDF</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn--soft btn--sm" onClick={() => input.current?.click()}><Camera size={15} />{file ? 'Cambiar archivo' : 'Tomar foto o elegir archivo'}</button>
          {file && <span className="muted">{file.name}</span>}
        </div>
        <input ref={input} type="file" accept="image/*,application/pdf" capture="environment" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
    </Modal>
  )
}
