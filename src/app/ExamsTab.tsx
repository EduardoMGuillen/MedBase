import { Fragment, useEffect, useRef, useState } from 'react'
import { fromLocalValue } from '../lib/dateInput'
import { DateTimeField } from '../components/DateTimeField'
import { Link, useNavigate } from 'react-router-dom'
import { Camera, CheckCheck, ChevronRight, ChevronsDownUp, ChevronsUpDown, Download, FileText, FlaskConical, Printer, ScanLine, TriangleAlert, Upload, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { DateField } from '../components/DateTimeField'
import { CorrectionReason, GraceButton, VersionTag } from '../components/Grace'
import { api } from '../lib/api'
import { Modal } from '../components/ui'
import { cap, date, dateTime, inputDateTime, shortStaff } from '../lib/format'
import { canReview, examCatalog, examLine, examStatusLabel, findExam, GROUP_LABEL, isPending, NEXT_ACTION, reportOptional, STATUS_LABEL } from '../lib/exams'
import { useExamCatalog } from '../lib/useExamCatalog'
import { rangeFor, rangeText, type LabReference } from '../lib/labReference'
import { SourceTag } from '../components/SourceTag'
import { uploadLarge } from '../lib/files'
import { FileChip, FileThumb, FileViewer } from '../components/FilePreview'
import { deptAllows } from '../lib/permissions'
import { NOT_DONE_REASONS } from '../lib/clinicalConfig'
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
export function ExamList({ exams, patientId, hospitalizationId, reload, open = true, only }: { exams: ExamOrder[]; patientId: string; hospitalizationId?: string; reload: () => void; open?: boolean
  /** DP4 (ronda 11): solo el tipo del departamento. */
  only?: ExamGroup }) {
  const { can, staffById, user } = useStore()
  const [uploading, setUploading] = useState<ExamGroup | null>(null)
  const [printing, setPrinting] = useState<ExamGroup | null>(null)
  // EX6 (ronda 11): «Imprimir resultados» de un grupo (varios en un solo PDF)
  const [results, setResults] = useState<ExamGroup | null>(null)
  const canResults = (g: ExamGroup) => (can('exams.order') || can('exams.process')) && !!user && deptAllows(user, g)
  const canPrint = can('chart.view') && (can('exams.order') || can('exams.process'))
  // EX5: impresiones hechas desde aquí (con quién y cuándo), para «Órdenes impresas»
  const jobs = usePrintJobs(canPrint ? patientId : undefined, exams.map((e) => e.id))
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<ExamSort>('recent')
  const [filter, setFilter] = useState<ExamFilter>('all')
  // Abiertos a mano (true) o cerrados a mano (false); lo que no está aquí sigue la regla
  const [shown, setShown] = useState<Record<string, boolean>>({})
  const groups: ExamGroup[] = only ? [only] : ['lab', 'imaging']
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
                {/* EX5 (ronda 10): la orden de los pendientes, para imprimir o descargar (médico y enfermería) */}
                {canPrint && all.some(printable) && <button className="btn btn--ghost btn--sm" onClick={() => setPrinting(g)}><Printer size={14} />Imprimir orden</button>}
                {canResults(g) && all.some((e) => e.result) && <button className="btn btn--ghost btn--sm" onClick={() => setResults(g)}><Printer size={14} />Imprimir resultados</button>}
                {open && can('exams.process') && (!user || deptAllows(user, g)) && <button className="btn btn--ghost btn--sm" onClick={() => setUploading(g)}><Upload size={14} />Subir resultado externo</button>}
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
      {(batches.length > 0 || jobs.length > 0) && (
        <section className="panel"><div className="panel__body" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Ronda 8: cada orden se imprime (los externos los lleva el paciente, como la receta) */}
          <span className="muted" style={{ fontSize: 14 }}>Órdenes impresas:</span>
          {batches.map((b) => {
            const list = exams.filter((e) => e.batchId === b && e.status !== 'cancelled')
            const f = list[0]
            return <Link key={b} className={`btn ${list.some((e) => e.place === 'external') ? 'btn--soft' : 'btn--ghost'} btn--sm`} to={`/app/examenes/orden/${b}`}>
              <Printer size={14} />{f.orderNo ? `${f.orderNo} · ` : ''}{dateTime(f.orderedAt)}{list.some((e) => e.place === 'external') ? ' · para llevar' : ''}</Link>
          })}
          {jobs.map((j) => <Link key={j.id} className="btn btn--ghost btn--sm" to={`/app/impresion/${j.id}`}><Printer size={14} />{dateTime(j.printedAt)} · {shortStaff(staffById(j.printedBy)?.name)}</Link>)}
        </div></section>
      )}
      {results && <PrintResults group={results} exams={exams.filter((e) => e.group === results && e.result)} onClose={() => setResults(null)} />}
      {printing && <PrintPending group={printing} exams={exams.filter((e) => e.group === printing && printable(e))} onClose={() => setPrinting(null)} />}
      {uploading && <ExternalResult group={uploading} patientId={patientId} hospitalizationId={hospitalizationId} onClose={() => setUploading(null)} onDone={() => { setUploading(null); reload() }} />}
    </div>
  )
}

export function ExamRow({ e, reload, open, expanded, onToggle }: { e: ExamOrder; reload: () => void; open: boolean; expanded: boolean; onToggle: () => void }) {
  const { can, staffById, notify, user } = useStore()
  const [result, setResult] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  // DP2 (ronda 11): el departamento no cancela: «No se realizó» (con motivo) y «Reintentar»
  const [notDone, setNotDone] = useState(false)
  const dept = user?.role === 'lab' || user?.role === 'imaging'
  const imagingTech = user?.role === 'imaging' && user.position !== 'radiologist'
  // DP4: Laboratorio e Imágenes solo trabajan los de su tipo (el radiólogo ve el laboratorio, pero sin acciones)
  const mine = !user || deptAllows(user, e.group)
  const act = async (path: string, body?: unknown) => {
    try { await api(`/exams/${e.id}/${path}`, { body: body ?? {} }); reload() } catch (x) { notify((x as Error).message, 'error') }
  }
  const next = NEXT_ACTION[e.group][e.status]
  const optional = reportOptional(e)
  // Ronda 8: una radiografía realizada todavía acepta su informe (opcional)
  const canResult = open && mine && can('exams.process') && (isPending(e) || (optional && e.status === 'done')) && !(imagingTech && e.status === 'ordered')
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
          {e.requestedById || e.requestedByName ? <span className="muted" style={{ fontSize: 13 }}>Solicitado por: {e.requestedById ? staffById(e.requestedById)?.name : e.requestedByName}{e.location === 'ambulatory' ? ' · Ambulatorio' : ''}</span> : null}
          {e.orderFileId && <span style={{ fontSize: 13 }}>Orden en papel: <FileChip id={e.orderFileId} /></span>}
          {optional && e.status === 'done' && <span className="muted" style={{ fontSize: 13 }}>Realizada. El informe (lectura) es opcional en los rayos X.</span>}
          {e.result && <ResultView e={e} />}
        </div>}
      </div>
      <div className="exam-row__side">
        <span className={`badge ${TONE[e.status] ? `badge--${TONE[e.status]}` : ''}`}>{examStatusLabel(e)}</span>
        {e.notDone && e.status !== 'cancelled' && <span className="badge badge--red" title={`${shortStaff(staffById(e.notDone.by)?.name)}, ${dateTime(e.notDone.at)}`}>No se realizó: {e.notDone.reason}</span>}
        {/* EX1: las acciones se usan sin abrir la fila. EX5 (ronda 10): en una fila horizontal, no apiladas */}
        {<span className="exam-row__acts">
          {open && mine && can('exams.process') && isPending(e) && e.status === 'ordered' && <button className="btn btn--soft btn--sm" onClick={() => act('status', { status: e.group === 'lab' ? 'sample' : 'done' })}>{next}</button>}
          {canResult && <button className={`btn ${optional ? 'btn--ghost' : 'btn--primary'} btn--sm`} onClick={() => setResult(true)}>{e.group === 'lab' ? 'Cargar resultado' : imagingTech ? 'Subir imágenes' : optional ? 'Agregar informe (opcional)' : 'Cargar informe'}</button>}
          {/* GE4 (ronda 9): quien cargó el resultado lo corrige unos minutos, mientras no se revise */}
          {e.status === 'result' && e.result && <GraceButton record={{ graceUntil: e.resultGraceUntil }} authorId={e.result.by} onCorrect={() => setResult(true)} />}
          <VersionTag version={e.resultVersion} kind="exam_result" id={e.id} render={(x) => <ResultView e={{ ...e, result: x as unknown as NonNullable<ExamOrder['result']> }} />} />
          {/* EX6 (ronda 11): el resultado en PDF (vista previa con Descargar e Imprimir) o directo a imprimir */}
          {e.result && <ResultPrintButtons e={e} />}
          {canReview(e) && can('exams.order') && user?.role === 'doctor' && <button className="btn btn--primary btn--sm" onClick={() => act('review')}><CheckCheck size={14} />Marcar revisado</button>}
          {open && isPending(e) && !dept && (can('exams.process') || can('exams.order')) && <button className="btn btn--ghost btn--sm" onClick={() => setCancelling(true)}>Cancelar</button>}
          {dept && mine && isPending(e) && can('dept.work') && (e.notDone
            ? <button className="btn btn--soft btn--sm" onClick={() => act('retry')}>Reintentar</button>
            : <button className="btn btn--ghost btn--sm" onClick={() => setNotDone(true)}>No se realizó</button>)}
        </span>}
      </div>
      {result && <ResultModal e={e} onClose={() => setResult(false)} onDone={() => { setResult(false); reload() }} />}
      {cancelling && <CancelExam e={e} onClose={() => setCancelling(false)} onDone={() => { setCancelling(false); reload() }} />}
      {notDone && <NotDoneModal e={e} onClose={() => setNotDone(false)} onDone={() => { setNotDone(false); reload() }} />}
    </div>
  )
}

/**
 * UM1 (ronda 8): lo que dice el documento de valores de referencia sobre el examen (resultado esperado, notas ⚠️) y sus
 * fuentes. Recuerda que el rango oficial es el del laboratorio que emite el resultado.
 */
export function ReferenceNote({ r }: { r: LabReference }) {
  return (
    <div className="ref-note">
      {r.text && <p><b>Resultado esperado:</b> {r.text}</p>}
      {r.note && <p>{r.warn && <span aria-label="Advertencia">⚠️ </span>}{r.note}</p>}
      <p className="ref-note__src">Fuente: {r.src.length ? r.src.map((c) => <SourceTag key={c} codes={[c]} />) : <span className="src-tag src-tag--none">Sin fuente</span>}</p>
      <p className="muted">Referencia general; el rango oficial es el del laboratorio que emite el resultado.</p>
    </div>
  )
}

/**
 * Resultado: valores con unidad y rango (alto o bajo marcado), informe y archivos.
 * EX4 (ronda 10): «Resultado» en pantalla, como antes (tabla o informe), y además cada archivo con su nombre y tipo y «Ver
 * archivo» (vista previa dentro de la app, con Descargar e Imprimir). Si el resultado solo trae archivo, se ve su miniatura.
 */
export function ResultView({ e, withFiles = true }: { e: ExamOrder; withFiles?: boolean }) {
  const r = e.result!
  const files = withFiles ? r.fileIds ?? [] : []
  const onlyFile = files.length > 0 && !r.values?.length && !r.report
  return (
    <div className="exam-result">
      {e.critical && <p className="exam-result__critical"><TriangleAlert size={14} />Valor crítico</p>}
      {r.values?.length ? (
        <table className="exam-values"><tbody>{r.values.map((v) => (
          <tr key={v.analyte} className={v.flag ? `is-${v.flag}` : undefined}>
            <th>{v.analyte}</th><td className="num"><b>{v.value}</b> {v.unit}</td>
            <td className="muted">{[rangeText(v), v.reference].filter(Boolean).join(' · ')}</td>
            <td>{v.flag && <span className={`badge ${v.critical ? 'badge--red' : 'badge--amber'}`}>{v.flag === 'high' ? 'Alto' : 'Bajo'}{v.critical ? ' · crítico' : ''}</span>}</td>
          </tr>
        ))}</tbody></table>
      ) : null}
      {r.report && <p className="exam-result__report">{r.report}</p>}
      {onlyFile && <FileThumb id={files[0]} />}
      {files.length > 0 && <div className="exam-result__files">{files.map((f) => <FileChip key={f} id={f} />)}</div>}
    </div>
  )
}

export function ResultModal({ e, onClose, onDone }: { e: ExamOrder; onClose: () => void; onDone: () => void }) {
  const { notify, patient, user, staffById } = useStore()
  // DP2 (A25): el técnico en imágenes solo sube las imágenes del estudio realizado; el informe es del radiólogo o del médico
  const imagesOnly = e.group === 'imaging' && user?.role === 'imaging' && user.position !== 'radiologist'
  // EX6 (A24): el microbiólogo responsable (el de turno, o se elige si no hay uno solo)
  const [resp, setResp] = useState<{ microbiologists: { id: string; name: string }[]; needsChoice: boolean; auto?: string } | null>(null)
  const [responsibleId, setResponsibleId] = useState('')
  useEffect(() => { if (e.group === 'lab' && !(e.status === 'result' && e.result)) api<NonNullable<typeof resp>>('/dept/responsible').then(setResp).catch(() => setResp(null)) }, [e.group, e.status, e.result])
  // AD4: también si la clínica renombró el examen, sus valores con rango vienen del de la lista fija
  const { exams: clinicExams } = useExamCatalog()
  const found = findExam(e.name, examCatalog(clinicExams))
  const analytes = found?.analytes ?? []
  // UM1 (ronda 8): el rango que corresponde al sexo del paciente; el servidor marca Alto/Bajo con el mismo
  const sex = patient(e.patientId)?.sex
  const ref = (a: (typeof analytes)[number]) => { const r = rangeFor(a, sex); return [rangeText(r), a.text].filter(Boolean).join(' · ') }
  // GE4: al corregir, el formulario viene ya llenado con el resultado cargado
  const correcting = e.status === 'result' && !!e.result
  const prev = correcting ? e.result!.values ?? [] : []
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(prev.filter((v) => analytes.some((a) => a.name === v.analyte)).map((v) => [v.analyte, v.value])))
  const [extra, setExtra] = useState<{ analyte: string; value: string; unit: string }[]>(() => prev.filter((v) => !analytes.some((a) => a.name === v.analyte)).map((v) => ({ analyte: v.analyte, value: v.value, unit: v.unit ?? '' })))
  const [report, setReport] = useState(correcting ? e.result!.report ?? '' : '')
  const [why, setWhy] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const filled = [...analytes.filter((a) => values[a.name]?.trim()).map((a) => ({ analyte: a.name, value: values[a.name].trim(), unit: a.unit || undefined })),
    ...extra.filter((x) => x.analyte.trim() && x.value.trim()).map((x) => ({ analyte: x.analyte.trim(), value: x.value.trim(), unit: x.unit.trim() || undefined }))]
  const ready = (imagesOnly ? !!file : filled.length > 0 || report.trim().length > 0 || !!file || (correcting && !!e.result!.fileIds?.length)) && (!resp?.needsChoice || !!responsibleId)
  return (
    <Modal title={`${correcting ? 'Corregir: ' : ''}${e.group === 'lab' ? 'Resultado' : 'Informe'}: ${examLine(e)}`} wide onClose={onClose} footer={<>
      {correcting && <span style={{ marginRight: 'auto' }}><CorrectionReason value={why} onChange={setWhy} /></span>}
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!ready || busy} onClick={async () => {
        setBusy(true)
        try {
          const fileIds = file ? [(await uploadLarge(e.patientId, file, { name: file.name, mime: file.type || 'application/pdf', category: e.group, title: e.name, hospitalizationId: e.hospitalizationId })).id] : undefined
          const saved = await api<ExamOrder>(`/exams/${e.id}/result`, { body: imagesOnly ? { fileIds, imagesOnly: true } : { values: filled.length ? filled : undefined, report: report.trim() || undefined, fileIds: fileIds ?? (correcting ? e.result!.fileIds : undefined),
            ...(responsibleId ? { responsibleId } : {}), ...(correcting ? { correct: true, version: e.resultVersion ?? 1, why: why.trim() || undefined } : {}) } })
          // DP2 (ronda 11): el mismo aviso de siempre; quien carga ve a quién se le avisó
          if (saved.critical) notify(`Valor crítico: se avisó a ${staffById(e.orderedBy)?.name ?? 'el médico que lo pidió'}.`, 'error')
          onDone()
        } catch (x) { notify((x as Error).message, 'error') }
        setBusy(false)
      }}>{correcting ? 'Guardar corrección' : imagesOnly ? 'Subir imágenes' : `Guardar ${e.group === 'lab' ? 'resultado' : 'informe'}`}</button>
    </>}>
      {resp && resp.microbiologists.length > 0 && (resp.needsChoice
        ? <label className="field"><span>Microbiólogo responsable</span>
          <select className="select" value={responsibleId} onChange={(x) => setResponsibleId(x.target.value)} aria-required="true">
            <option value="">Elige el microbiólogo responsable</option>{resp.microbiologists.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
          <small className="muted">No hay un solo microbiólogo de turno: elige quién responde por este resultado (va en el PDF).</small></label>
        : resp.auto && <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>Microbiólogo responsable: {resp.microbiologists.find((m) => m.id === resp.auto)?.name} (de turno).</p>)}
      {imagesOnly && <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>Sube las imágenes del estudio. El informe lo escribe el radiólogo o un médico.</p>}
      {e.group === 'lab' && (<>
        {analytes.length > 0 && <table className="exam-values exam-values--input"><thead><tr><th>Analito</th><th>Valor</th><th>Referencia</th></tr></thead><tbody>
          {analytes.map((a) => (
            <tr key={a.name}><th>{a.name}</th><td><input className="input num" inputMode="decimal" value={values[a.name] ?? ''} onChange={(x) => setValues({ ...values, [a.name]: x.target.value })} aria-label={a.name} /> <span className="muted">{a.unit}</span></td>
              <td className="muted">{ref(a)}</td></tr>
          ))}</tbody></table>}
        {found?.reference && <ReferenceNote r={found.reference} />}
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
      {!imagesOnly && <label className="field"><span>{e.group === 'lab' ? 'Comentario o resultado en texto (opcional)' : 'Informe (conclusión)'}</span>
        <textarea className="textarea" rows={4} value={report} onChange={(x) => setReport(x.target.value)} placeholder={e.group === 'lab' ? 'Ej. EGO: leucocitos 10-15 por campo, nitritos positivos.' : 'Ej. Vesícula con litos múltiples, pared de 3 mm; vía biliar sin dilatación.'} /></label>}
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
          const att = await uploadLarge(patientId, file!, { name: file!.name, mime: file!.type || 'application/pdf', category: group, title: name.trim(), takenAt: fromLocalValue(takenAt).toISOString(), hospitalizationId })
          await api('/exams/external-result', { body: { patientId, hospitalizationId, group, name: name.trim(), takenAt: fromLocalValue(takenAt).toISOString(), fileIds: [att.id], report: report.trim() || undefined } })
          onDone()
        } catch (x) { notify((x as Error).message, 'error') }
        setBusy(false)
      }}>Guardar</button>
    </>}>
      <p className="muted" style={{ fontSize: 14 }}>Para un resultado que el paciente trae o que llegó de otro laboratorio, sin orden en el sistema.</p>
      <label className="field"><span>Qué examen es</span><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={group === 'lab' ? 'Ej. Hemograma' : 'Ej. Ultrasonido abdominal'} /></label>
      <div className="field"><span>Fecha y hora</span><DateTimeField value={takenAt} max={inputDateTime(new Date())} onChange={setTakenAt} label="Fecha y hora" /></div>
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

/** EX5 (ronda 10): pendiente para la orden: sin resultado ni cancelado. */
const printable = (e: ExamOrder) => e.status !== 'cancelled' && isPending(e)

/** EX5 y ME10: las impresiones de un paciente hechas desde la pestaña Exámenes o la hoja (las que incluyen estos renglones). */
export function usePrintJobs(patientId: string | undefined, ids: string[], kind: 'exams' | 'rx' = 'exams') {
  const [jobs, setJobs] = useState<{ id: string; kind: string; items: string[]; printedAt: string; printedBy: string }[]>([])
  const key = ids.join(',')
  useEffect(() => {
    if (!patientId) return
    let alive = true
    api<{ id: string; kind: string; items: string[]; printedAt: string; printedBy: string }[]>(`/patients/${patientId}/print-jobs`).then((r) => { if (alive) setJobs(r) }).catch(() => null)
    return () => { alive = false }
  }, [patientId, key])
  const set = new Set(ids)
  return jobs.filter((j) => j.kind === kind && j.items.some((x) => set.has(x)))
}

/**
 * EX5 (ronda 10): «Imprimir orden» de una sección: los exámenes pendientes con casillas (los «Externo» marcados y los de la
 * clínica sin marcar). Sale la misma orden de EX2, una por médico que los pidió, con la leyenda de firma y sello.
 */
function PrintPending({ group, exams, onClose }: { group: ExamGroup; exams: ExamOrder[]; onClose: () => void }) {
  const { notify, staffById } = useStore()
  const nav = useNavigate()
  const [picked, setPicked] = useState<string[]>(() => exams.filter((e) => e.place === 'external').map((e) => e.id))
  const [busy, setBusy] = useState(false)
  const go = async (how: 'imprimir' | 'pdf') => {
    setBusy(true)
    try {
      const { id } = await api<{ id: string }>('/print-jobs', { body: { kind: 'exams', examIds: picked } })
      nav(`/app/impresion/${id}?accion=${how}`)
    } catch (x) { notify((x as Error).message, 'error'); setBusy(false) }
  }
  const doctors = new Set(exams.filter((e) => picked.includes(e.id)).map((e) => e.orderedBy)).size
  return (
    <Modal title={`Imprimir orden de ${GROUP_LABEL[group].toLowerCase()}`} onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--soft" disabled={!picked.length || busy} onClick={() => go('pdf')}><Download size={15} />Descargar PDF</button>
      <button className="btn btn--primary" disabled={!picked.length || busy} onClick={() => go('imprimir')}><Printer size={15} />Imprimir</button>
    </>}>
      <p className="muted" style={{ fontSize: 14, margin: 0 }}>Los exámenes pendientes; los externos ya van marcados. Sale con los datos del médico que los pidió y sin su firma y sello en papel no vale.</p>
      <div className="print-pick">
        {exams.map((e) => (
          <label key={e.id} className={`exam-row-pick${picked.includes(e.id) ? ' is-on' : ''}`}>
            <input type="checkbox" checked={picked.includes(e.id)} onChange={() => setPicked(picked.includes(e.id) ? picked.filter((x) => x !== e.id) : [...picked, e.id])} />
            <span><b>{examLine(e)}</b>{e.place === 'external' && <span className="badge" style={{ marginLeft: 6 }}>Externo</span>}{e.priority === 'urgent' && <span className="badge badge--red" style={{ marginLeft: 6 }}>Urgente</span>}
              <small className="muted" style={{ display: 'block' }}>Pedido {dateTime(e.orderedAt)} por {shortStaff(staffById(e.orderedBy)?.name)}</small></span>
          </label>
        ))}
      </div>
      {doctors > 1 && <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>Los pidieron {doctors} médicos: sale una orden por cada uno.</p>}
    </Modal>
  )
}

/**
 * EX6 (ronda 11): «Ver PDF» e «Imprimir» de un resultado. El documento es un trabajo de impresión (queda registrado: quién y
 * cuándo, y bloquea la corrección según GE4). Si el resultado es solo un archivo, se abre (o se imprime) ese archivo (EX4).
 */
export function ResultPrintButtons({ e }: { e: ExamOrder }) {
  const { can, notify, user } = useStore()
  const nav = useNavigate()
  const [file, setFile] = useState<{ id: string; print: boolean } | null>(null)
  if (!(can('exams.order') || can('exams.process')) || !user || !deptAllows(user, e.group)) return null
  const onlyFile = !!e.result?.fileIds?.length && !e.result.values?.length && !e.result.report
  const go = async (how: 'view' | 'print') => {
    try {
      const { id } = await api<{ id: string }>('/print-jobs', { body: { kind: 'results', examIds: [e.id] } })
      if (onlyFile) {
        await api(`/print-jobs/${id}/printed`, { body: { how } })
        setFile({ id: e.result!.fileIds![0], print: how === 'print' })
      } else nav(`/app/impresion/${id}${how === 'print' ? '?accion=imprimir' : ''}`)
    } catch (x) { notify((x as Error).message, 'error') }
  }
  return (<>
    <button className="btn btn--ghost btn--sm" onClick={() => go('view')}><FileText size={14} />Ver PDF</button>
    <button className="btn btn--ghost btn--sm" onClick={() => go('print')}><Printer size={14} />Imprimir</button>
    {file && <FileViewer id={file.id} autoPrint={file.print} onClose={() => setFile(null)} />}
  </>)
}

/** EX6: «Imprimir resultados»: los exámenes con resultado (ninguno marcado), con buscador y filtro por fecha; un solo PDF. */
function PrintResults({ group, exams, onClose }: { group: ExamGroup; exams: ExamOrder[]; onClose: () => void }) {
  const { notify } = useStore()
  const nav = useNavigate()
  const [picked, setPicked] = useState<string[]>([])
  const [q, setQ] = useState('')
  const [day, setDay] = useState('')
  const [busy, setBusy] = useState(false)
  const shown = exams.filter((e) => (!q.trim() || fold(examLine(e)).includes(fold(q.trim()))) && (!day || (e.result?.at ?? e.orderedAt).slice(0, 10) === day))
    .sort((a, b) => (b.result?.at ?? '').localeCompare(a.result?.at ?? ''))
  const go = async (how: 'pdf' | 'imprimir') => {
    setBusy(true)
    try { const { id } = await api<{ id: string }>('/print-jobs', { body: { kind: 'results', examIds: picked } }); nav(`/app/impresion/${id}?accion=${how}`) } catch (x) { notify((x as Error).message, 'error'); setBusy(false) }
  }
  return (
    <Modal title={`Imprimir resultados de ${GROUP_LABEL[group].toLowerCase()}`} onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--soft" disabled={!picked.length || busy} onClick={() => go('pdf')}><Download size={15} />Descargar PDF</button>
      <button className="btn btn--primary" disabled={!picked.length || busy} onClick={() => go('imprimir')}><Printer size={15} />Imprimir ({picked.length})</button>
    </>}>
      <div className="exam-tools" style={{ padding: 0 }}>
        <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar examen" aria-label="Buscar examen con resultado" />
        <DateField value={day} onChange={setDay} label="Fecha del resultado" />
      </div>
      <div className="print-pick">
        {shown.map((e) => (
          <label key={e.id} className={`exam-row-pick${picked.includes(e.id) ? ' is-on' : ''}`}>
            <input type="checkbox" checked={picked.includes(e.id)} onChange={() => setPicked(picked.includes(e.id) ? picked.filter((x) => x !== e.id) : [...picked, e.id])} />
            <span><b>{examLine(e)}</b><small className="muted" style={{ display: 'block' }}>Resultado {e.result?.at ? dateTime(e.result.at) : ''}{e.critical ? ' · Valor crítico' : ''}</small></span>
          </label>
        ))}
        {!shown.length && <p className="muted">Ningún examen coincide.</p>}
      </div>
      <small className="muted">Sale un solo documento, con cada examen en su bloque.</small>
    </Modal>
  )
}

/** DP2 (ronda 11, A21): «No se realizó», con motivo obligatorio (lista de configuración y «Otro» escrito). Se avisa al médico. */
function NotDoneModal({ e, onClose, onDone }: { e: ExamOrder; onClose: () => void; onDone: () => void }) {
  const { notify } = useStore()
  const [pick, setPick] = useState('')
  const [other, setOther] = useState('')
  const [busy, setBusy] = useState(false)
  const reason = pick === 'Otro' ? other.trim() : pick
  return (
    <Modal title={`No se realizó: ${examLine(e)}`} onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={reason.length < 3 || busy} onClick={async () => {
        setBusy(true)
        try { await api(`/exams/${e.id}/not-done`, { body: { reason } }); notify('Se avisó al médico que lo pidió. Sigue pendiente.'); onDone() } catch (x) { notify((x as Error).message, 'error'); setBusy(false) }
      }}>Guardar</button>
    </>}>
      <p className="muted" style={{ fontSize: 14, margin: 0 }}>La orden sigue pendiente: el médico decide si la cancela. Con «Reintentar» vuelve a la bandeja.</p>
      <div style={{ display: 'grid', gap: 6 }}>
        {[...NOT_DONE_REASONS, 'Otro'].map((r) => <label key={r} className="check-line"><input type="radio" name="nd" checked={pick === r} onChange={() => setPick(r)} /><span><b>{r}</b></span></label>)}
      </div>
      {pick === 'Otro' && <label className="field"><span>Motivo</span><input className="input" autoFocus value={other} onChange={(x) => setOther(x.target.value)} /></label>}
    </Modal>
  )
}
