import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Ban, ChevronLeft, FilePlus2, FileText, MessageCircle, Printer, Send } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { Loading, Modal } from '../components/ui'
import { date, dxCode, time, whatsappUrl } from '../lib/format'
import { shortDate } from '../lib/consent'
import { currentEpicrisis } from '../lib/inpatient'
import type { Epicrisis, EpicrisisData, Hospitalization, InpatientFile } from '../lib/types'
import { ClinicLogo } from './Prescriptions'

const STATUS: Record<Epicrisis['status'], { label: string; tone: string }> = {
  draft: { label: 'Borrador sin emitir', tone: 'amber' }, issued: { label: 'Emitida', tone: 'mint' }, voided: { label: 'Anulada', tone: 'red' },
}
const dm = (iso: string) => `${shortDate(iso)} ${time(iso)}`
type Hideable = EpicrisisData['hidden'][number]


/**
 * Acceso a la epicrisis desde la nota de egreso y desde Anexos: abre la vigente o, si la estancia ya egresó y no
 * tiene (altas anteriores u observación), la genera.
 */
export function EpicrisisButton({ file, primary = false }: { file: InpatientFile; primary?: boolean }) {
  const { can, notify } = useStore()
  const nav = useNavigate()
  const [busy, setBusy] = useState(false)
  const current = currentEpicrisis(file)
  if (current) {
    return <Link className={`btn ${primary ? 'btn--primary' : 'btn--ghost'} btn--sm`} to={`/app/epicrisis/${current.id}`}><FileText size={14} />Epicrisis{current.status === 'draft' ? ' (borrador)' : ''}</Link>
  }
  // Una estancia que terminó en referencia lleva su hoja de referencia, no epicrisis
  if (file.hospitalization.status !== 'discharged' || file.hospitalization.outcome === 'referred' || !can('inpatient.orders')) return null
  return (
    <button className={`btn ${primary ? 'btn--primary' : 'btn--soft'} btn--sm`} disabled={busy} onClick={async () => {
      setBusy(true)
      try {
        const e = await api<Epicrisis>(`/inpatient/${file.hospitalization.id}/epicrisis`, { method: 'POST' })
        nav(`/app/epicrisis/${e.id}`)
      } catch (err) {
        notify((err as Error).message, 'error')
        setBusy(false)
      }
    }}><FilePlus2 size={14} />Generar epicrisis</button>
  )
}

/** Documentos de egreso en Anexos: las epicrisis de la estancia (con sus versiones anuladas). */
export function DischargeDocuments({ file }: { file: InpatientFile }) {
  const { staffById } = useStore()
  const list = [...(file.epicrises ?? [])].sort((a, b) => b.version - a.version)
  if (!list.length && (file.hospitalization.status !== 'discharged' || file.hospitalization.outcome === 'referred')) return null
  return (
    <section className="panel">
      <div className="panel__head"><div><h2>Documentos de egreso</h2><p>La epicrisis es un documento aparte del expediente, para revisar, imprimir y entregar al paciente.</p></div>
        {!currentEpicrisis(file) && <EpicrisisButton file={file} primary />}</div>
      {list.length > 0 ? (
        <div className="rows">{list.map((e) => (
          <Link key={e.id} className="row" to={`/app/epicrisis/${e.id}`} style={{ gridTemplateColumns: '1fr auto' }}>
            <span className="row__who"><strong>Epicrisis{e.version > 1 ? ` (versión ${e.version})` : ''}</strong>
              <span>{e.issuedAt ? `Emitida ${dm(e.issuedAt)} por ${staffById(e.issuedBy ?? '')?.name}` : `Generada ${dm(e.createdAt)}`}{e.voidedAt ? ` · anulada ${dm(e.voidedAt)}: ${e.voidReason}` : ''}</span></span>
            <span className={`badge badge--${STATUS[e.status].tone}`}>{STATUS[e.status].label}</span>
          </Link>
        ))}</div>
      ) : <div className="empty">Esta estancia egresó sin epicrisis.</div>}
    </section>
  )
}

/**
 * Epicrisis: vista previa editable (borrador) y documento emitido. En el borrador el médico corrige el texto, quita
 * secciones agregadas y elige laboratorios; lo obligatorio que falta se señala y no se emite hasta escribirlo.
 */
export default function EpicrisisPage() {
  const { id } = useParams()
  const { can, notify, patient, staffById } = useStore()
  const nav = useNavigate()
  const [e, setE] = useState<Epicrisis | null>(null)
  const [draft, setDraft] = useState<EpicrisisData | null>(null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [voiding, setVoiding] = useState(false)
  const [reason, setReason] = useState('')
  useEffect(() => {
    if (!id) return
    api<Epicrisis>(`/epicrisis/${id}`).then((x) => { setE(x); setDraft(x.data); setDirty(false) }).catch((err: Error) => notify(err.message, 'error'))
  }, [id, notify])
  if (!e || !draft) return <Loading label="Abriendo la epicrisis" />
  const d = draft
  const editable = e.status === 'draft' && can('inpatient.orders')
  const set = (patch: Partial<EpicrisisData>) => { setDraft({ ...d, ...patch }); setDirty(true) }
  const toggle = (k: Hideable) => set({ hidden: d.hidden.includes(k) ? d.hidden.filter((x) => x !== k) : [...d.hidden, k] })
  const missing = [
    !d.admissionDx.length && 'diagnóstico de ingreso', !d.hea.trim() && 'historia de la enfermedad actual', !d.evolution.trim() && 'evolución',
    !d.instructions.trim() && !d.followUp?.trim() && 'indicaciones al egreso',
  ].filter(Boolean) as string[]
  const save = async () => {
    const body = { hea: d.hea, evolution: d.evolution, instructions: d.instructions, followUp: d.followUp ?? '', condition: d.condition ?? '', hidden: d.hidden, labIds: d.labIds }
    const x = await api<Epicrisis>(`/epicrisis/${e.id}`, { method: 'PATCH', body })
    setE(x); setDraft(x.data); setDirty(false)
    return x
  }
  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try { await fn() } catch (err) { notify((err as Error).message, 'error') } finally { setBusy(false) }
  }
  const p = patient(e.patientId)
  const text = `Epicrisis de ${d.patient.name}\n${d.clinic.name}\nIngreso: ${dm(d.admittedAt)} · Egreso: ${dm(d.dischargedAt)} (${d.stayDays} día${d.stayDays === 1 ? '' : 's'})\n\n` +
    `Diagnóstico de egreso: ${(d.dischargeDx.length ? d.dischargeDx : d.admissionDx).map((x) => x.label).join('; ')}\n\n` +
    `Medicamentos al alta:\n${d.dischargeRx.length ? d.dischargeRx.map((x) => `- ${x}`).join('\n') : 'Sin receta de salida.'}\n\n` +
    `Indicaciones: ${d.instructions}${d.followUp ? `\nControl: ${d.followUp}` : ''}\n\n${d.doctor?.name ?? ''}${d.doctor?.license ? `, colegiación ${d.doctor.license}` : ''}`
  return (
    <div className="page">
      <div className="page-head no-print">
        <Link className="btn btn--ghost" to={`/app/hospitalizados/${e.hospitalizationId}?tab=anexos`}><ChevronLeft size={16} />Volver al expediente</Link>
        <div className="page-head__actions">
          <span className={`badge badge--${STATUS[e.status].tone}`}>{STATUS[e.status].label}{e.version > 1 ? ` · versión ${e.version}` : ''}</span>
          {e.status === 'issued' && can('inpatient.orders') && <button className="btn btn--ghost" onClick={() => setVoiding(true)}><Ban size={16} />Anular</button>}
          {e.status === 'issued' && p?.phone && <a className="btn btn--ghost" href={whatsappUrl(p.phone, text)} target="_blank" rel="noreferrer"><MessageCircle size={16} />Enviar por WhatsApp</a>}
          {editable && dirty && <button className="btn btn--ghost" disabled={busy} onClick={() => run(async () => { await save(); notify('Cambios guardados') })}>Guardar cambios</button>}
          {editable && <button className="btn btn--primary" disabled={busy || missing.length > 0} onClick={() => run(async () => {
            if (dirty) await save()
            const x = await api<Epicrisis>(`/epicrisis/${e.id}/issue`, { method: 'POST' })
            setE(x); setDraft(x.data); setDirty(false); notify('Epicrisis emitida')
          })}><Send size={16} />Emitir</button>}
          <button className={`btn ${e.status === 'issued' ? 'btn--primary' : 'btn--soft'}`} onClick={() => window.print()}><Printer size={16} />Imprimir o guardar PDF</button>
        </div>
      </div>
      {e.status === 'voided' && <div className="alert-strip no-print">Anulada el {dm(e.voidedAt!)} por {staffById(e.voidedBy ?? '')?.name}: {e.voidReason}.</div>}
      {editable && (
        <section className="panel no-print epi-edit">
          <div className="panel__head"><div><h2>Revisa y corrige antes de emitir</h2><p>Se armó con los datos del expediente. Una vez emitida no se edita: para corregirla se anula y se emite otra versión.</p></div></div>
          <div className="panel__body">
            {missing.length > 0 && <div className="alert-strip alert-strip--amber" role="status">Falta: {missing.join(', ')}. Escríbelo aquí; no se emite sin eso.</div>}
            <label className="field"><span>Historia de la enfermedad actual</span>
              <textarea className={`textarea${!d.hea.trim() ? ' input--blank' : ''}`} rows={4} value={d.hea} onChange={(x) => set({ hea: x.target.value })} /></label>
            <label className="field"><span>Evolución (de la nota de egreso)</span>
              <textarea className={`textarea${!d.evolution.trim() ? ' input--blank' : ''}`} rows={5} value={d.evolution} onChange={(x) => set({ evolution: x.target.value })} /></label>
            <div className="form-grid">
              <label className="field"><span>Condición al egreso</span><input className="input" value={d.condition ?? ''} onChange={(x) => set({ condition: x.target.value })} /></label>
              <label className="field"><span>Cita de control</span><input className="input" value={d.followUp ?? ''} onChange={(x) => set({ followUp: x.target.value })} /></label>
            </div>
            <label className="field"><span>Indicaciones adicionales: dieta, cuidados, signos de alarma para regresar</span>
              <textarea className={`textarea${!d.instructions.trim() && !d.followUp?.trim() ? ' input--blank' : ''}`} rows={4} value={d.instructions} onChange={(x) => set({ instructions: x.target.value })} /></label>
            <fieldset className="fs"><legend>Secciones agregadas</legend>
              <div className="epi-toggles">
                {([['procedures', `Procedimientos realizados (${d.procedures.length})`, d.procedures.length], ['dischargeDx', `Diagnósticos de egreso (${d.dischargeDx.length})`, d.dischargeDx.length],
                  ['condition', 'Condición al egreso', d.condition ? 1 : 0], ['labs', 'Estudios relevantes', d.labIds.length]] as [Hideable, string, number][]).filter(([, , n]) => n > 0).map(([k, label]) => (
                  <label key={k} className="check-inline"><input type="checkbox" checked={!d.hidden.includes(k)} onChange={() => toggle(k)} />{label}</label>
                ))}
              </div>
            </fieldset>
            {d.labs.length > 0 && (
              <fieldset className="fs"><legend>Estudios relevantes: marca los que se incluyen</legend>
                <div className="epi-toggles">{d.labs.map((l) => (
                  <label key={l.id} className="check-inline"><input type="checkbox" checked={d.labIds.includes(l.id)}
                    onChange={() => set({ labIds: d.labIds.includes(l.id) ? d.labIds.filter((x) => x !== l.id) : [...d.labIds, l.id] })} />{l.title} · {dm(l.at)}</label>
                ))}</div>
              </fieldset>
            )}
          </div>
        </section>
      )}
      <EpicrisisSheet e={{ ...e, data: d }} />
      {voiding && (
        <Modal title="Anular la epicrisis" onClose={() => setVoiding(false)} footer={<>
          <button className="btn btn--ghost" onClick={() => setVoiding(false)}>Cancelar</button>
          <button className="btn btn--danger" disabled={reason.trim().length < 5 || busy} onClick={() => run(async () => {
            const next = await api<Epicrisis>(`/epicrisis/${e.id}/void`, { body: { reason: reason.trim() } })
            setVoiding(false); notify('Epicrisis anulada. Corrige la versión nueva y emítela.')
            nav(`/app/epicrisis/${next.id}`)
          })}>Anular y corregir</button>
        </>}>
          <p>La epicrisis emitida queda anulada (no se borra) y se abre una versión nueva con el mismo contenido para corregirla.</p>
          <label className="field"><span>Motivo</span><input className="input" autoFocus value={reason} onChange={(x) => setReason(x.target.value)} placeholder="Ej. Faltaba un medicamento al alta" /></label>
        </Modal>
      )}
    </div>
  )
}

/** La epicrisis en hoja carta, en el orden que pidió Emil. Se usa sola y al final del expediente completo. */
export function EpicrisisSheet({ e }: { e: Pick<Epicrisis, 'status' | 'version' | 'issuedAt' | 'data'> }) {
  const d = e.data
  const show = (k: Hideable) => !d.hidden.includes(k)
  const labs = d.labs.filter((l) => d.labIds.includes(l.id))
  const dx = (list: EpicrisisData['admissionDx']) => <ol className="note__list">{list.map((x) => <li key={x.code + x.label}>{x.label} <span className="muted">({dxCode(x)})</span></li>)}</ol>
  const blank = (v: string) => (v.trim() ? <p className="epi-text">{v}</p> : <p className="epi-missing">Falta escribirlo.</p>)
  return (
    <article className={`rx-sheet epi ${e.status !== 'issued' ? 'epi--draft' : ''}`}>
      {e.status !== 'issued' && <div className="epi__stamp">{e.status === 'voided' ? 'Anulada' : 'Borrador sin emitir'}</div>}
      <header className="rx-sheet__head">
        <div className="rx-sheet__doc">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}><ClinicLogo settings={{ ...d.clinic, email: '', currency: 'L', rxValidityDays: 30, reminderTemplate: '', recordUsesDni: false }} /><b>{d.clinic.name}</b></div>
          <p>{d.clinic.address}{d.clinic.phone ? `, tel. ${d.clinic.phone}` : ''}</p>
        </div>
        <div className="rx-sheet__folio">Epicrisis{e.version > 1 ? ` v${e.version}` : ''}<b>{e.issuedAt ? shortDate(e.issuedAt) : 'Sin emitir'}</b>{e.issuedAt ? time(e.issuedAt) : ''}</div>
      </header>
      <h1 className="cert__title">Epicrisis</h1>
      <section className="epi__sec">
        <dl className="epi__facts">
          <div><dt>Paciente</dt><dd>{d.patient.name}</dd></div>
          <div><dt>Identidad</dt><dd>{d.patient.dni ?? 'Sin dato'}</dd></div>
          <div><dt>Edad</dt><dd>{d.patient.age}</dd></div>
          <div><dt>Sexo</dt><dd>{d.patient.sex === 'F' ? 'Femenino' : d.patient.sex === 'M' ? 'Masculino' : 'Sin dato'}</dd></div>
          <div><dt>Expediente</dt><dd>{d.patient.record}</dd></div>
          <div><dt>Ingreso</dt><dd>{dm(d.admittedAt)}</dd></div>
          <div><dt>Egreso</dt><dd>{dm(d.dischargedAt)}</dd></div>
          <div><dt>Días de estancia</dt><dd>{d.stayDays}</dd></div>
          {d.room && <div><dt>Cuarto</dt><dd>{d.room}</dd></div>}
          <div><dt>Médico tratante</dt><dd>{d.attending}</dd></div>
          {d.observationAt && <div className="epi__wide"><dt>Procedencia</dt><dd>Vino de observación (desde el {dm(d.observationAt)})</dd></div>}
        </dl>
      </section>
      <section className="epi__sec"><h3>Diagnóstico de ingreso</h3>{d.admissionDx.length ? dx(d.admissionDx) : <p className="epi-missing">Falta el diagnóstico de ingreso.</p>}</section>
      <section className="epi__sec"><h3>Historia de la enfermedad actual</h3>{blank(d.hea)}</section>
      <section className="epi__sec"><h3>Medicamentos administrados durante la estancia</h3>
        {d.meds.length ? (
          <table className="epi__table"><thead><tr><th>Medicamento</th><th>Dosis</th><th>Vía</th><th>Frecuencia</th><th>Inicio</th><th>Fin</th></tr></thead>
            <tbody>{d.meds.map((m, i) => <tr key={i}><td>{m.drug}</td><td>{m.dose}</td><td>{m.route}</td><td>{m.frequency}</td><td>{shortDate(m.start)}</td><td>{m.untilDischarge || !m.end ? 'Hasta el egreso' : shortDate(m.end)}</td></tr>)}</tbody></table>
        ) : <p className="muted">No hay dosis administradas registradas en la hoja de medicamentos.</p>}
      </section>
      {show('procedures') && d.procedures.length > 0 && <section className="epi__sec"><h3>Procedimientos realizados</h3><ul className="note__list">{d.procedures.map((x, i) => <li key={i}>{x.name} · {dm(x.at)}</li>)}</ul></section>}
      <section className="epi__sec"><h3>Evolución</h3>{blank(d.evolution)}</section>
      {show('dischargeDx') && d.dischargeDx.length > 0 && <section className="epi__sec"><h3>Diagnóstico de egreso</h3>{dx(d.dischargeDx)}</section>}
      {show('labs') && labs.length > 0 && <section className="epi__sec"><h3>Estudios relevantes</h3><ul className="note__list">{labs.map((l) => <li key={l.id}>{l.title} · {dm(l.at)}</li>)}</ul></section>}
      {show('condition') && d.condition && <section className="epi__sec"><h3>Condición al egreso</h3><p className="epi-text">{d.condition}</p></section>}
      <section className="epi__sec"><h3>Medicamentos al alta</h3>{d.dischargeRx.length ? <ol className="note__list">{d.dischargeRx.map((x, i) => <li key={i}>{x}</li>)}</ol> : <p className="muted">Sin receta de salida.</p>}</section>
      {d.pendingExams && d.pendingExams.length > 0 && <section className="epi__sec"><h3>Exámenes pendientes al alta</h3><ul className="note__list">{d.pendingExams.map((x, i) => <li key={i}>{x}</li>)}</ul></section>}
      <section className="epi__sec"><h3>Indicaciones al egreso</h3>
        {d.instructions.trim() || d.followUp?.trim() ? <>{d.instructions.trim() && <p className="epi-text">{d.instructions}</p>}{d.followUp && <p className="epi-text"><b>Cita de control:</b> {d.followUp}</p>}</> : <p className="epi-missing">Faltan las indicaciones.</p>}
      </section>
      {d.dischargeAddenda && d.dischargeAddenda.length > 0 && <section className="epi__sec"><h3>Adendas de la nota de egreso</h3>
        {d.dischargeAddenda.map((a, i) => <p key={i} className="epi-text"><b>Adenda {i + 1} ({a.kind === 'correction' ? 'corrección' : a.kind === 'info' ? 'información adicional' : 'resultado posterior'}, {a.author}, {date(a.at)}):</b>{a.corrects ? ` Se corrige: ${a.corrects}.` : ''} {a.text}</p>)}</section>}
      <div className="epi__sign">
        {d.doctor?.stamp && <img src={d.doctor.stamp} alt="Sello del médico" className="doc-stamp epi__stamp" />}
        {d.doctor?.signature && <img src={d.doctor.signature} alt="" />}
        <span className="consent__line" />
        <b>{d.doctor?.name ?? 'Firma y sello del médico'}</b>
        <small>{d.doctor ? (d.doctor.license ? `Colegiación ${d.doctor.license}` : 'Colegiación ______') : 'Se completa al emitir'}</small>
        <small>Firma y sello</small>
      </div>
      <footer className="rx-sheet__foot"><span>Epicrisis {e.issuedAt ? `emitida el ${date(e.issuedAt, { day: '2-digit', month: '2-digit', year: 'numeric' })}` : 'sin emitir'}.</span><span>Emitido con Clinara</span></footer>
    </article>
  )
}

/**
 * En la Biblioteca de pacientes (historial de hospitalizaciones): las epicrisis de todas sus estancias, visibles aun
 * después del egreso, y "Generar epicrisis" para las altas que no la tienen.
 */
export function PatientEpicrises({ patientId, stays }: { patientId: string; stays: Hospitalization[] }) {
  const { can, notify } = useStore()
  const nav = useNavigate()
  const [list, setList] = useState<Epicrisis[] | null>(null)
  const allowed = can('inpatient.view')
  useEffect(() => {
    if (!allowed) return
    api<Epicrisis[]>(`/patients/${patientId}/epicrises`).then(setList).catch(() => setList([]))
  }, [patientId, allowed])
  if (!allowed || !list) return null
  const current = list.filter((e) => e.status !== 'voided')
  const without = stays.filter((h) => h.status === 'discharged' && h.outcome !== 'referred' && !current.some((e) => e.hospitalizationId === h.id))
  if (!current.length && !without.length) return null
  return (
    <div className="panel__body epi-history">
      <h3>Documentos de egreso</h3>
      <div className="rows">
        {current.map((e) => (
          <Link key={e.id} className="row" to={`/app/epicrisis/${e.id}`} style={{ gridTemplateColumns: '1fr auto' }}>
            <span className="row__who"><strong>Epicrisis{e.version > 1 ? ` (versión ${e.version})` : ''}</strong>
              <span>Estancia del {shortDate(e.data.admittedAt)} al {shortDate(e.data.dischargedAt)} · {(e.data.dischargeDx.length ? e.data.dischargeDx : e.data.admissionDx).map((x) => x.label).join('; ')}</span></span>
            <span className={`badge badge--${STATUS[e.status].tone}`}>{STATUS[e.status].label}</span>
          </Link>
        ))}
        {can('inpatient.orders') && without.map((h) => (
          <div key={h.id} className="row" style={{ gridTemplateColumns: '1fr auto' }}>
            <span className="row__who"><strong>Sin epicrisis</strong><span>Egresó el {shortDate(h.dischargedAt!)} · {h.diagnoses.map((x) => x.label).join('; ')}</span></span>
            <button className="btn btn--soft btn--sm" onClick={async () => {
              try { nav(`/app/epicrisis/${(await api<Epicrisis>(`/inpatient/${h.id}/epicrisis`, { method: 'POST' })).id}`) } catch (err) { notify((err as Error).message, 'error') }
            }}><FilePlus2 size={14} />Generar epicrisis</button>
          </div>
        ))}
      </div>
    </div>
  )
}
