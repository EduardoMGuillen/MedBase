import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Camera, CheckCheck, FileText, FlaskConical, Printer, ScanLine, TriangleAlert, Upload, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { Modal } from '../components/ui'
import { dateTime, inputDateTime, shortStaff } from '../lib/format'
import { examLine, findExam, GROUP_LABEL, isPending, NEXT_ACTION, STATUS_LABEL } from '../lib/exams'
import { openFile, uploadLarge } from '../lib/files'
import type { ExamGroup, ExamOrder } from '../lib/types'

const TONE: Record<string, string> = { ordered: 'amber', sample: 'ink', done: 'ink', result: 'mint', reviewed: 'done', cancelled: '' }

/**
 * EX1: exámenes de un paciente (en una estancia o en su historial) en dos subsecciones, Laboratorio e Imagen y gabinete,
 * cada uno con lo pedido, su estado y su resultado. Quien los procesa marca muestra tomada o realizado y carga el
 * resultado; el médico lo marca como revisado; cualquiera de los dos lo cancela con motivo.
 */
export function ExamList({ exams, patientId, hospitalizationId, reload, open = true }: { exams: ExamOrder[]; patientId: string; hospitalizationId?: string; reload: () => void; open?: boolean }) {
  const { can } = useStore()
  const [uploading, setUploading] = useState<ExamGroup | null>(null)
  const groups: ExamGroup[] = ['lab', 'imaging']
  const batches = [...new Set(exams.filter((e) => e.area !== 'none' || e.consultationId).map((e) => e.batchId))]
  return (
    <div className="hc" data-tour="examenes-tab">
      {groups.map((g) => {
        const list = exams.filter((e) => e.group === g)
          .sort((a, b) => Number(isPending(b)) - Number(isPending(a)) || (a.priority === 'urgent' ? -1 : 0) - (b.priority === 'urgent' ? -1 : 0) || b.orderedAt.localeCompare(a.orderedAt))
        return (
          <section key={g} className="panel">
            <div className="panel__head"><div><h2>{g === 'lab' ? <FlaskConical size={17} style={{ verticalAlign: '-3px' }} /> : <ScanLine size={17} style={{ verticalAlign: '-3px' }} />} {GROUP_LABEL[g]}</h2>
              <p>{list.filter(isPending).length} pendiente{list.filter(isPending).length === 1 ? '' : 's'} · {list.filter((e) => e.status === 'result' || e.status === 'reviewed').length} con resultado</p></div>
              {open && can('exams.process') && <button className="btn btn--ghost btn--sm" onClick={() => setUploading(g)}><Upload size={14} />Subir resultado externo</button>}</div>
            {list.length ? <div className="rows">{list.map((e) => <ExamRow key={e.id} e={e} reload={reload} open={open} />)}</div>
              : <div className="empty">Sin exámenes de {GROUP_LABEL[g].toLowerCase()}.</div>}
          </section>
        )
      })}
      {batches.length > 0 && (
        <section className="panel"><div className="panel__body" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 14 }}>Órdenes impresas:</span>
          {batches.map((b) => { const f = exams.find((e) => e.batchId === b)!; return <Link key={b} className="btn btn--ghost btn--sm" to={`/app/examenes/orden/${b}`}><Printer size={14} />{dateTime(f.orderedAt)}</Link> })}
        </div></section>
      )}
      {uploading && <ExternalResult group={uploading} patientId={patientId} hospitalizationId={hospitalizationId} onClose={() => setUploading(null)} onDone={() => { setUploading(null); reload() }} />}
    </div>
  )
}

function ExamRow({ e, reload, open }: { e: ExamOrder; reload: () => void; open: boolean }) {
  const { can, staffById, notify, user } = useStore()
  const [result, setResult] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const act = async (path: string, body?: unknown) => {
    try { await api(`/exams/${e.id}/${path}`, { body: body ?? {} }); reload() } catch (x) { notify((x as Error).message, 'error') }
  }
  const next = NEXT_ACTION[e.group][e.status]
  const process = open && can('exams.process') && isPending(e)
  return (
    <div className={`exam-row${e.priority === 'urgent' && isPending(e) ? ' exam-row--urgent' : ''}${e.critical ? ' exam-row--critical' : ''}`}>
      <div className="exam-row__main">
        <strong>{examLine(e)}{e.priority === 'urgent' && <span className="badge badge--red" style={{ marginLeft: 6 }}>Urgente</span>}{e.place === 'external' && <span className="badge" style={{ marginLeft: 6 }}>Externo</span>}</strong>
        <span className="muted" style={{ fontSize: 13 }}>Pedido {dateTime(e.orderedAt)} por {shortStaff(staffById(e.orderedBy)?.name)}{e.indication ? ` · ${e.indication}` : ''}</span>
        <span className="exam-row__trail">{(e.events ?? []).filter((x) => x.status !== 'ordered').map((x) => `${STATUS_LABEL[e.group][x.status]} ${dateTime(x.at)} (${shortStaff(staffById(x.by)?.name)})`).join(' · ')}</span>
        {e.status === 'cancelled' && <span className="muted" style={{ fontSize: 13 }}>Cancelado: {e.cancelReason}</span>}
        {e.result && <ResultView e={e} />}
      </div>
      <div className="exam-row__side">
        <span className={`badge ${TONE[e.status] ? `badge--${TONE[e.status]}` : ''}`}>{STATUS_LABEL[e.group][e.status]}</span>
        {process && e.status === 'ordered' && <button className="btn btn--soft btn--sm" onClick={() => act('status', { status: e.group === 'lab' ? 'sample' : 'done' })}>{next}</button>}
        {process && <button className="btn btn--primary btn--sm" onClick={() => setResult(true)}>{e.group === 'lab' ? 'Cargar resultado' : 'Cargar informe'}</button>}
        {e.status === 'result' && can('exams.order') && user?.role === 'doctor' && <button className="btn btn--primary btn--sm" onClick={() => act('review')}><CheckCheck size={14} />Marcar revisado</button>}
        {open && isPending(e) && (can('exams.process') || can('exams.order')) && <button className="btn btn--ghost btn--sm" onClick={() => setCancelling(true)}>Cancelar</button>}
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
  const analytes = findExam(e.name)?.analytes ?? []
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
