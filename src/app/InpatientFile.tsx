import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { BedDouble, Camera, ChevronLeft, ChevronRight, FileSignature, FileText, LogOut, NotebookPen, Pill, Plus, TriangleAlert, X } from 'lucide-react'
import { useStore, type NewMed } from '../lib/store'
import { Loading, Modal } from '../components/ui'
import { PatientHeader } from '../components/PatientHeader'
import { date, dateTime, defaultRoute, fullName, inputDateTime, ROUTES, shortStaff, time } from '../lib/format'
import { ROLE_LABEL } from '../lib/permissions'
import { allergyConflict, DRUGS, FREQUENCIES } from '../lib/catalogs'
import { doseTimes, elapsed, stayPath, INPATIENT_FREQUENCIES, medLabel, orderMark, pendingOrdersOf, slotState, splitOrders, stayDay, treatmentDay, type SlotState } from '../lib/inpatient'
import { MedAlertBanner } from './MedAlerts'
import { AuthorizationEntry, AuthorizationForm } from './Authorization'
import { useNow } from '../lib/hooks'
import type { Authorization, Dose, HospProcedure, InpatientFile as File, InpatientMed, InpatientNote, Patient, PrescriptionItem } from '../lib/types'
import { AdmitModal, bedLabel, DxPicker } from './Inpatients'
import { ConsultationBody, Identification, VitalsGrid } from './PatientChart'
import { toBase64 } from './Attachments'

type Tab = 'sheet' | 'notes' | 'meds' | 'nursing' | 'labs'

export default function InpatientFile() {
  const { id } = useParams()
  const { fetchInpatient, notify, patient, bed, staffById, can } = useStore()
  const [file, setFile] = useState<File | null>(null)
  // Desde la alerta de órdenes nuevas se entra directo a las notas; al firmar una consulta con ingreso, a completar la cama
  const [params, setParams] = useSearchParams()
  const [editing, setEditing] = useState(params.get('completar') === '1')
  const [tab, setTab] = useState<Tab>(params.get('tab') === 'notas' ? 'notes' : 'sheet')
  const [missing, setMissing] = useState(false)
  const now = useNow()
  const load = useCallback(() => {
    if (!id) return
    fetchInpatient(id).then(setFile).catch((e: Error) => { setMissing(true); notify(e.message, 'error') })
  }, [id, fetchInpatient, notify])
  useEffect(load, [load])

  if (missing) return <div className="page"><div className="empty">No se encontró este expediente. Vuelve a <Link to="/app/hospitalizados">Hospitalizados</Link>.</div></div>
  if (!file) return <Loading label="Abriendo expediente" />
  const h = file.hospitalization
  const p = patient(h.patientId)
  if (!p) return <Loading />
  const b = bed(h.bedId)
  const open = h.status === 'active'
  // Observación: sin cama, sin notas ni órdenes de enfermería
  const obs = h.kind === 'observation'
  const medical = file.notes.filter((n) => n.kind === 'admission' || n.kind === 'evolution' || n.kind === 'procedure')
  const nursing = file.notes.filter((n) => n.kind === 'nursing')
  const tabs: [Tab, string][] = obs ? [
    ['sheet', 'Datos generales'],
    ['notes', `Notas de evolución (${medical.length + (h.consultationId ? 1 : 0)})`],
    ['meds', 'Hoja de medicamentos'],
    ['labs', `Laboratorio (${file.labs.length})`],
  ] : [
    ['sheet', 'Hoja de hospitalización'],
    ['notes', `Notas de evolución (${medical.length + (h.consultationId ? 1 : 0)})`],
    ['meds', 'Medicamentos'],
    ['nursing', `Notas de enfermería (${nursing.length})`],
    ['labs', `Laboratorios (${file.labs.length})`],
  ]
  const base = `/app/${obs ? 'observacion' : 'hospitalizados'}/${h.id}`
  const noBed = open && !obs && !h.bedId

  return (
    <div className="page page--chart">
      <div className="sticky-top">
        <PatientHeader p={p} clinical link>
          <Link className="btn btn--primary btn--sm" to={`${base}/expediente`}><FileText size={15} />Expediente completo</Link>
        </PatientHeader>
        <div className="hosp-bar">
          <span><b>{obs ? 'Observación' : bedLabel(b)}</b></span>
          <span>{obs ? 'Entró a observación' : 'Ingresó'} {dateTime(h.admittedAt)}</span>
          {open ? (obs
            ? <span className="badge badge--ink">{elapsed(Math.floor((now.getTime() - new Date(h.admittedAt).getTime()) / 60_000))} en observación</span>
            : <span className="badge badge--mint">Día {stayDay(h.admittedAt)} de estancia</span>)
            : <span className="badge badge--done">Egresó {h.dischargedAt && dateTime(h.dischargedAt)}</span>}
          {h.observationAt && <span className="badge badge--amber">Vino de observación ({dateTime(h.observationAt)})</span>}
          <span className="muted">{h.diagnoses.map((d) => d.label).join('; ')}</span>
        </div>
        <div className="tabs tabs--scroll" role="tablist">
          {tabs.map(([k, label]) => <button key={k} className="tab" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{label}</button>)}
        </div>
      </div>
      <MedAlertBanner file={file} />
      {noBed && (
        <div className="alert-strip alert-strip--amber" style={{ flexWrap: 'wrap' }}><BedDouble size={16} />Falta asignar la cama{h.companionName ? '' : ' y anotar al acompañante'}.
          {can('inpatient.orders') && <button className="btn btn--soft btn--sm" onClick={() => setEditing(true)}>Completar ingreso</button>}</div>
      )}
      {editing && <AdmitModal edit={h} onClose={() => { setEditing(false); if (params.get('completar')) setParams({}) }} onDone={() => { setEditing(false); if (params.get('completar')) setParams({}); load() }} />}

      {tab === 'sheet' && (
        <div className="hc">
          <section className="panel hc__sec">
            <div className="panel__head"><h2>{obs ? 'Ingreso a observación' : 'Hoja de hospitalización'}</h2>
              {open && can('inpatient.orders') && <button className="btn btn--ghost btn--sm" onClick={() => setEditing(true)}>Corregir ingreso</button>}</div>
            <div className="panel__body">
              <dl className="facts">
                <div><dt>Fecha y hora del ingreso</dt><dd>{date(h.admittedAt, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, {time(h.admittedAt)}</dd></div>
                {!obs && <div><dt>Cuarto</dt><dd>{bedLabel(b)}</dd></div>}
                {h.observationAt && <div><dt>En observación desde</dt><dd>{dateTime(h.observationAt)}</dd></div>}
                <div><dt>{obs ? 'Médico' : 'Ingresado por'}</dt><dd>{staffById(h.admittedBy)?.name}</dd></div>
                <div><dt>Procedencia</dt><dd>{h.consultationId ? <Link to={`/app/nota/${h.consultationId}`}>Consulta externa</Link> : 'Emergencia o ingreso directo'}</dd></div>
                {!obs && <div><dt>Quién lo acompaña</dt><dd>{h.companionName ? `${h.companionName}${h.companionRelation ? ` (${h.companionRelation})` : ''}` : <span className="muted">Sin dato</span>}</dd></div>}
                {!obs && <div><dt>Teléfono del acompañante</dt><dd>{h.companionPhone || <span className="muted">Sin dato</span>}</dd></div>}
                <div><dt>Teléfono del paciente</dt><dd>{h.patientPhone || p.phone}</dd></div>
                <div><dt>Motivo del ingreso</dt><dd>{h.reason}</dd></div>
              </dl>
              <h4 style={{ marginTop: 16 }}>Diagnósticos de ingreso</h4>
              <ol className="note__list">{h.diagnoses.map((d) => <li key={d.code + d.label}>{d.label} <span className="muted">({d.code})</span></li>)}</ol>
              {obs && h.consultationId && <ConsultVitals consultationId={h.consultationId} />}
            </div>
          </section>
          <section className="panel hc__sec">
            <div className="panel__head"><h2>Datos del paciente</h2></div>
            <div className="panel__body"><Identification p={p} /></div>
          </section>
        </div>
      )}

      {tab === 'meds' && <MedSheet file={file} p={p} reload={load} onWriteNote={() => setTab('notes')} />}
      {tab === 'notes' && <MedicalNotes file={file} p={p} reload={load} />}
      {tab === 'nursing' && !obs && <NursingNotes file={file} reload={load} />}
      {tab === 'labs' && <Labs file={file} reload={load} />}
    </div>
  )
}

/** Signos de la preclínica de la consulta que ingresó a observación: no se vuelven a escribir. */
function ConsultVitals({ consultationId }: { consultationId: string }) {
  const { fetchConsultation } = useStore()
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchConsultation>> | null>(null)
  useEffect(() => { fetchConsultation(consultationId).then(setData).catch(() => null) }, [consultationId, fetchConsultation])
  if (!data?.vitals) return null
  return <><h4 style={{ marginTop: 16 }}>Signos de la preclínica ({time(data.vitals.takenAt)})</h4><VitalsGrid v={data.vitals} birthDate={data.patient.birthDate} /></>
}

/** La nota de consulta externa que originó la estancia es la primera nota de evolución. */
function ConsultEntry({ consultationId }: { consultationId: string }) {
  const { fetchConsultation, staffById } = useStore()
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchConsultation>> | null>(null)
  useEffect(() => { fetchConsultation(consultationId).then(setData).catch(() => null) }, [consultationId, fetchConsultation])
  if (!data) return <section className="panel"><div className="empty">Cargando la nota de consulta…</div></section>
  const c = data.consultation
  const author = staffById(c.doctorId)
  return (
    <article className="panel consult-entry">
      <div className="panel__head">
        <div><h2>Nota de ingreso <span className="badge badge--ink">Consulta externa</span></h2>
          <p>{author?.name}{author ? `, ${ROLE_LABEL[author.role].toLowerCase()}` : ''} · {date(c.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, {time(c.date)}</p></div>
        <Link className="btn btn--ghost btn--sm" to={`/app/nota/${c.id}`}>Ver nota completa</Link>
      </div>
      <div className="panel__body"><ConsultationBody c={c} vitals={data.vitals} /></div>
    </article>
  )
}

// ---------- Hoja de medicamentos ----------

const STATE_LABEL: Record<SlotState, string> = {
  given: 'Administrado', skipped: 'No administrado', omitted: 'Omitido', late: 'Atrasado', due: 'Toca ahora', upcoming: 'Programado',
}

/** Horario del día: cada indicación con sus horas; enfermería toca una hora para marcarla. */
function MedSheet({ file, p, reload, onWriteNote }: { file: File; p: Patient; reload: () => void; onWriteNote: () => void }) {
  const { can, staffById } = useStore()
  const [day, setDay] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d })
  const [marking, setMarking] = useState<{ med: InpatientMed; at?: Date } | null>(null)
  const [stopping, setStopping] = useState<InpatientMed | null>(null)
  const end = new Date(day); end.setDate(end.getDate() + 1)
  const open = file.hospitalization.status === 'active'
  const admitted = new Date(file.hospitalization.admittedAt); admitted.setHours(0, 0, 0, 0)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const shift = (n: number) => { const d = new Date(day); d.setDate(d.getDate() + n); setDay(d) }
  const dosesOf = (m: InpatientMed) => file.doses.filter((d) => d.medId === m.id)
  const meds = [...file.meds].sort((a, b) => Number(!!a.stoppedAt) - Number(!!b.stoppedAt) || a.orderedAt.localeCompare(b.orderedAt))
    .filter((m) => new Date(m.firstAt) < end && (!m.stoppedAt || new Date(m.stoppedAt) >= day || dosesOf(m).some((d) => new Date(d.givenAt) >= day)))
  // Enfermería registra las dosis; el médico también puede hacerlo cuando él la aplica
  const care = (can('inpatient.care') || can('inpatient.orders')) && open
  const by = (id: string) => { const s = staffById(id); return s ? `${shortStaff(s.name)}, ${ROLE_LABEL[s.role].toLowerCase()}` : '' }

  return (
    <section className="panel">
      <div className="panel__head">
        <div><h2>Hoja de medicamentos</h2><p>Se llena sola con lo que el médico indica en sus notas. {care ? 'Toca una hora para registrar la dosis aplicada; queda con tu nombre y tu rol.' : 'Enfermería registra cada dosis.'}</p></div>
        <div className="day-nav">
          <button className="icon-btn" aria-label="Día anterior" disabled={day <= admitted} onClick={() => shift(-1)}><ChevronLeft size={18} /></button>
          <b>{day.getTime() === today.getTime() ? 'Hoy' : date(day.toISOString(), { weekday: 'short', day: 'numeric', month: 'short' })}</b>
          <button className="icon-btn" aria-label="Día siguiente" disabled={day >= today} onClick={() => shift(1)}><ChevronRight size={18} /></button>
        </div>
      </div>
      {!meds.length ? (
        <div className="empty">
          No hay medicamentos indicados para este día.
          {can('inpatient.orders') && open && <> <button className="linklike" onClick={onWriteNote}>Escribe una nota con indicaciones</button>.</>}
        </div>
      ) : (
        <div className="medsheet">
          {meds.map((m) => {
            const slots = doseTimes(m, day, end)
            const doses = dosesOf(m)
            const prnToday = doses.filter((d) => !d.scheduledAt && new Date(d.givenAt) >= day && new Date(d.givenAt) < end)
            const conflict = allergyConflict(p.allergies, m.drug)
            return (
              <div key={m.id} className={`med ${m.stoppedAt ? 'med--stopped' : ''}`}>
                <div className="med__head">
                  <div>
                    <strong>{medLabel(m)}</strong>
                    <span className="muted">{m.presentation ? `${m.presentation}. ` : ''}{m.instructions ? `${m.instructions} ` : ''}{medOrigin(m, file, staffById(m.orderedBy)?.name)}</span>
                    {m.stoppedAt
                      ? <span className="muted">{m.stopReason === 'Egreso' ? 'Terminó con el egreso' : `Suspendido por ${shortStaff(staffById(m.stoppedBy ?? '')?.name)} ${dm(m.stoppedAt)}${m.stopReason ? `: ${m.stopReason}` : ''}`}</span>
                      : <span className="muted"><b>{treatmentDay(m, day)}</b></span>}
                    {conflict && <span className="chip chip--red"><TriangleAlert size={12} />Alergia a {conflict}</span>}
                  </div>
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {m.stoppedAt ? <span className="badge badge--red">{m.stopReason?.startsWith('Cambiado') ? 'Modificado' : 'Suspendido'} {dateTime(m.stoppedAt)}</span> : <span className="badge badge--mint">Activo</span>}
                    {!m.stoppedAt && open && can('inpatient.orders') && <button className="btn btn--ghost btn--sm" onClick={() => setStopping(m)}>Suspender</button>}
                  </span>
                </div>
                <div className="slots">
                  {slots.map((s) => {
                    const dose = doses.find((d) => d.scheduledAt && new Date(d.scheduledAt).getTime() === s.at.getTime())
                    const st = slotState(s.at, s.omitted, dose)
                    const clickable = care && !dose && !s.omitted
                    return (
                      <button key={s.at.toISOString()} className={`slot2 slot2--${st}`} disabled={!clickable} onClick={() => setMarking({ med: m, at: s.at })}
                        title={dose ? `${dose.status === 'given' ? 'Aplicado' : 'No administrado'} por ${by(dose.givenBy)}, ${time(dose.givenAt)}${dose.note ? `: ${dose.note}` : ''}` : STATE_LABEL[st]}>
                        <b>{time(s.at.toISOString())}</b>
                        <small>{dose ? `${dose.status === 'given' ? '✓' : '✗'} ${time(dose.givenAt)} ${by(dose.givenBy)}` : STATE_LABEL[st]}</small>
                      </button>
                    )
                  })}
                  {m.prn && (<>
                    {prnToday.map((d) => (
                      <span key={d.id} className="slot2 slot2--given" title={`Aplicado por ${by(d.givenBy)}, ${time(d.givenAt)}${d.note ? `: ${d.note}` : ''}`}><b>{time(d.givenAt)}</b><small>✓ {by(d.givenBy)}</small></span>
                    ))}
                    {care && !m.stoppedAt && day.getTime() === today.getTime() && (
                      <button className="slot2 slot2--prn" onClick={() => setMarking({ med: m })}><b><Plus size={13} /> PRN</b><small>Registrar dosis</small></button>
                    )}
                    {!prnToday.length && !(care && !m.stoppedAt) && <span className="muted" style={{ fontSize: 13 }}>Según necesidad. Sin dosis este día.</span>}
                  </>)}
                  {!m.prn && !slots.length && <span className="muted" style={{ fontSize: 13 }}>Sin dosis este día.</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}
      <div className="legend">
        {(['given', 'due', 'late', 'upcoming', 'skipped', 'omitted'] as SlotState[]).map((s) => <span key={s}><i className={`slot2--${s}`} />{STATE_LABEL[s]}</span>)}
      </div>
      {marking && <DoseModal med={marking.med} at={marking.at} doses={dosesOf(marking.med)} onClose={() => setMarking(null)} onSaved={() => { setMarking(null); reload() }} />}
      {stopping && <StopModal med={stopping} onClose={() => setStopping(null)} onSaved={() => { setStopping(null); reload() }} />}
    </section>
  )
}

/** "Indicado en nota de consulta externa, Dra. Herrera, 22/10 17:40". */
function medOrigin(m: InpatientMed, file: File, who?: string) {
  const note = m.noteId ? file.notes.find((n) => n.id === m.noteId) : undefined
  const where = m.source === 'consultation' ? 'nota de consulta externa'
    : note ? (note.kind === 'admission' ? 'nota de ingreso' : file.hospitalization.kind === 'observation' ? 'nota de observación' : 'nota de evolución') : 'indicación médica'
  return `Indicado en ${where}, ${who ?? 'médico'}, ${dm(m.orderedAt)}.`
}

/** El médico suspende una orden desde la hoja: pide el motivo; la orden queda en la hoja como suspendida. */
function StopModal({ med, onClose, onSaved }: { med: InpatientMed; onClose: () => void; onSaved: () => void }) {
  const { stopMed } = useStore()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Modal title={`Suspender ${med.drug}`} onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--danger" disabled={reason.trim().length < 3 || busy} onClick={async () => {
        setBusy(true)
        const ok = await stopMed(med.id, reason.trim())
        setBusy(false)
        if (ok) onSaved()
      }}>Suspender</button>
    </>}>
      <p>{medLabel(med)}. Desde ahora las dosis que siguen salen como suspendidas; lo ya aplicado se conserva.</p>
      <label className="field"><span>Motivo (queda con tu nombre y la hora)</span><input className="input" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. Ya no presenta vómitos" /></label>
    </Modal>
  )
}

function DoseModal({ med, at, doses, onClose, onSaved }: { med: InpatientMed; at?: Date; doses: Dose[]; onClose: () => void; onSaved: () => void }) {
  const { recordDose } = useStore()
  const [given, setGiven] = useState(true)
  const [when, setWhen] = useState(inputDateTime(new Date()))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  // Un PRN con intervalo mínimo avisa si la última dosis fue hace muy poco
  const last = med.prn ? doses.filter((d) => d.status === 'given').sort((a, b) => b.givenAt.localeCompare(a.givenAt))[0] : undefined
  const tooSoon = last && med.everyHours && Date.now() - new Date(last.givenAt).getTime() < med.everyHours * 3_600_000
  return (
    <Modal title={medLabel(med)} onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className={`btn ${given ? 'btn--primary' : 'btn--danger'}`} disabled={busy || (!given && !note.trim())} onClick={async () => {
        setBusy(true)
        const ok = await recordDose(med.id, { scheduledAt: at?.toISOString(), givenAt: new Date(when).toISOString(), status: given ? 'given' : 'skipped', note: note.trim() || undefined })
        setBusy(false)
        if (ok) onSaved()
      }}>{given ? 'Registrar administración' : 'Registrar como no administrado'}</button>
    </>}>
      <p>{at ? <>Dosis de las <b>{time(at.toISOString())}</b>{at.toDateString() !== new Date().toDateString() ? ` del ${date(at.toISOString())}` : ''}.</> : 'Dosis según necesidad (PRN).'}</p>
      {tooSoon && <div className="alert-strip"><TriangleAlert size={16} />La última dosis fue a las {time(last!.givenAt)}; la indicación es cada {med.everyHours} horas.</div>}
      {at && (
        <div className="segmented" role="radiogroup" aria-label="Resultado">
          <button role="radio" aria-checked={given} onClick={() => setGiven(true)}>Administrado</button>
          <button role="radio" aria-checked={!given} onClick={() => setGiven(false)}>No administrado</button>
        </div>
      )}
      <label className="field"><span>Hora real</span><input className="input" type="datetime-local" value={when} max={inputDateTime(new Date())} onChange={(e) => setWhen(e.target.value)} /></label>
      <label className="field"><span>{given ? 'Observación (opcional)' : 'Motivo por el que no se administró'}</span>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={given ? 'Ej. Dolor 7/10' : 'Ej. Paciente en ayuno para cirugía'} /></label>
    </Modal>
  )
}

// ---------- Notas médicas ----------

const SOAP: { key: 'subjective' | 'objective' | 'assessment' | 'plan'; letter: string; label: string; hint: string }[] = [
  { key: 'subjective', letter: 'S', label: 'Subjetivo', hint: 'Lo que refiere el paciente.' },
  { key: 'objective', letter: 'O', label: 'Objetivo', hint: 'Signos vitales, examen físico y resultados.' },
  { key: 'assessment', letter: 'A', label: 'Análisis', hint: 'Impresión diagnóstica y evolución.' },
  { key: 'plan', letter: 'P', label: 'Plan', hint: 'Los medicamentos se agregan aquí abajo; las indicaciones, a la derecha.' },
]

/** "22/10 18:10": la fecha corta con la hora, como se escribe en la nota en papel. */
const dm = (iso: string) => `${date(iso, { day: '2-digit', month: '2-digit' })} ${time(iso)}`

/** Una entrada de la línea de tiempo: nota médica (SOAP, procedimiento o egreso) o registro anterior de procedimiento. */
type TimelineItem = { at: string; key: string; note?: InpatientNote; legacy?: HospProcedure; auth?: Authorization }

function MedicalNotes({ file, p, reload }: { file: File; p: Patient; reload: () => void }) {
  const { staffById, can } = useStore()
  const notes = file.notes.filter((n) => n.kind === 'admission' || n.kind === 'evolution' || n.kind === 'discharge' || n.kind === 'procedure')
  const h = file.hospitalization
  const obs = h.kind === 'observation'
  // La nota de consulta externa que dio el ingreso es la nota de ingreso (también en observación): no se pide otra
  const hasAdmission = notes.some((n) => n.kind === 'admission') || obs || !!h.observationAt || !!h.consultationId
  const [converting, setConverting] = useState(false)
  const discharged = notes.some((n) => n.kind === 'discharge')
  const [writing, setWriting] = useState<null | 'note' | 'procedure' | 'discharge' | 'authorization'>(null)
  const [authFor, setAuthFor] = useState<string | undefined>()
  const nav = useNavigate()
  const open = file.hospitalization.status === 'active'
  // Los procedimientos y autorizaciones registrados antes de las notas de procedimiento se conservan, sin estado
  const timeline: TimelineItem[] = [
    ...notes.map((n) => ({ at: n.at, key: n.id, note: n })),
    ...file.procedures.map((x) => ({ at: x.createdAt, key: x.id, legacy: x })),
    ...file.authorizations.map((a) => ({ at: a.createdAt, key: a.id, auth: a })),
  ].sort((a, b) => a.at.localeCompare(b.at) || a.key.localeCompare(b.key))
  return (
    <div className="hc">
      {open && can('inpatient.orders') && (
        <section className="panel">
          <div className="panel__body" style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <p className="muted">{hasAdmission ? 'Las notas quedan en orden, de la más antigua a la más reciente. Procedimientos y egreso también son notas de evolución.' : 'Lo primero es la nota de ingreso, con las indicaciones de medicamentos.'}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn--primary" onClick={() => setWriting('note')}><NotebookPen size={16} />{hasAdmission ? 'Nueva nota de evolución' : 'Escribir nota de ingreso'}</button>
              {hasAdmission && <button className="btn btn--primary" onClick={() => setWriting('procedure')}>Procedimiento</button>}
              <button className="btn btn--primary" onClick={() => { setAuthFor(undefined); setWriting('authorization') }}><FileSignature size={16} />Autorización</button>
              {hasAdmission && !discharged && <button className="btn btn--primary" onClick={() => setWriting('discharge')}><LogOut size={16} />Egreso</button>}
              {obs && <button className="btn btn--soft" onClick={() => setConverting(true)}><BedDouble size={16} />Pasar a hospitalización</button>}
            </div>
          </div>
        </section>
      )}
      {can('orders.review') && <PendingOrdersPanel file={file} reload={reload} />}
      {writing === 'procedure' && <ProcedureNoteForm file={file} onClose={() => setWriting(null)} onSaved={() => { setWriting(null); reload() }}
        onAuthorize={(name) => { setAuthFor(name); setWriting('authorization') }} />}
      {writing === 'authorization' && <AuthorizationForm file={file} p={p} initialProcedure={authFor} onClose={() => setWriting(null)}
        onCreated={(a) => { setWriting(null); nav(`/app/autorizaciones/${a.id}`) }} />}
      {writing === 'discharge' && <Discharge file={file} p={p} reload={() => { setWriting(null); reload() }} />}
      {converting && <ConvertModal file={file} p={p} onClose={() => setConverting(false)} onDone={() => nav(`/app/hospitalizados/${h.id}?tab=notas`)} />}
      {h.consultationId && <ConsultEntry consultationId={h.consultationId} />}
      {timeline.length ? timeline.map((item) => {
        if (item.auth) return <AuthorizationEntry key={item.key} a={item.auth} file={file} reload={reload} />
        if (item.legacy) {
          const x = item.legacy
          return (
            <article key={x.id} className="panel consult-entry">
              <div className="panel__head">
                <div><h2>{x.kind === 'procedure' ? 'Procedimiento' : 'Autorización'} <span className="badge">Registro anterior</span></h2>
                  <p>{date(x.createdAt, { weekday: 'long', day: 'numeric', month: 'long' })}, {time(x.createdAt)}, {staffById(x.createdBy)?.name}</p></div>
              </div>
              <div className="panel__body">
                <p><b>{x.name}</b></p>
                {x.scheduledAt && <p className="muted">Fecha anotada: {dateTime(x.scheduledAt)}</p>}
                {x.notes && <p>{x.notes}</p>}
              </div>
            </article>
          )
        }
        const n = item.note!
        if (n.kind === 'discharge') return <Discharge key={n.id} file={file} p={p} reload={reload} />
        if (n.kind === 'procedure') return <ProcedureNote key={n.id} n={n} file={file} />
        return <SoapNote key={n.id} n={n} file={file} reload={reload} />
      }) : !h.consultationId && <section className="panel"><div className="empty">Todavía no hay notas de evolución.</div></section>}
      {writing === 'note' && <NoteEditor file={file} p={p} kind={hasAdmission ? 'evolution' : 'admission'} onClose={() => setWriting(null)} onSaved={() => { setWriting(null); reload() }} />}
    </div>
  )
}

/** Observación → hospitalización: se elige la cama y se completan los datos del acompañante. Todo lo demás se conserva. */
function ConvertModal({ file, p, onClose, onDone }: { file: File; p: Patient; onClose: () => void; onDone: () => void }) {
  const { beds, inpatients, convertToHospital } = useStore()
  const free = beds.filter((b) => b.active && !inpatients.some((x) => x.bedId === b.id))
    .sort((a, b) => a.room.localeCompare(b.room, 'es', { numeric: true }) || a.label.localeCompare(b.label))
  const [f, setF] = useState({ bedId: '', companionName: p.emergencyName ?? '', companionRelation: p.emergencyRelation ?? '', companionPhone: p.emergencyPhone ?? '', patientPhone: file.hospitalization.patientPhone ?? p.phone })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  return (
    <Modal title="Pasar a hospitalización" onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!f.bedId || busy} onClick={async () => {
        setBusy(true)
        const r = await convertToHospital(file.hospitalization.id, { bedId: f.bedId, companionName: f.companionName.trim() || undefined, companionRelation: f.companionRelation.trim() || undefined,
          companionPhone: f.companionPhone.trim() || undefined, patientPhone: f.patientPhone.trim() || undefined })
        setBusy(false)
        if (r) onDone()
      }}><BedDouble size={16} />Hospitalizar</button>
    </>}>
      <p className="muted" style={{ fontSize: 14 }}>Las notas, los medicamentos, los laboratorios y las autorizaciones de la observación pasan al expediente de hospitalización, en orden y con su autoría.</p>
      <label className="field"><span>Cama</span>
        <select className="select" value={f.bedId} onChange={set('bedId')}>
          <option value="">Elige un cuarto libre</option>
          {free.map((b) => <option key={b.id} value={b.id}>{bedLabel(b)} · {b.specialty}</option>)}
        </select></label>
      <div className="form-grid">
        <label className="field"><span>Quién lo acompaña</span><input className="input" value={f.companionName} onChange={set('companionName')} /></label>
        <label className="field"><span>Parentesco</span><input className="input" value={f.companionRelation} onChange={set('companionRelation')} /></label>
        <label className="field"><span>Teléfono del acompañante</span><input className="input" inputMode="tel" value={f.companionPhone} onChange={set('companionPhone')} /></label>
        <label className="field"><span>Teléfono del paciente</span><input className="input" inputMode="tel" value={f.patientPhone} onChange={set('patientPhone')} /></label>
      </div>
    </Modal>
  )
}

/**
 * Nota de ingreso o de evolución como en papel: arriba quién escribe, con su rol, la fecha y la hora; a la
 * izquierda el SOAP con los medicamentos que indica y a la derecha las indicaciones numeradas. En las notas
 * con checklist, enfermería marca cada orden y queda su nombre y la hora junto a ella. En celular se apilan.
 */
function SoapNote({ n, file, reload }: { n: InpatientNote; file: File; reload: () => void }) {
  const { staffById } = useStore()
  const { meds, indications } = splitOrders(n, file)
  const author = staffById(n.authorId)
  return (
    <article className="panel consult-entry">
      <div className="panel__head">
        <div><h2>{n.kind === 'admission' ? 'Nota de ingreso' : 'Nota de evolución'}</h2>
          <p>{author?.name}{author ? `, ${ROLE_LABEL[author.role].toLowerCase()}` : ''} · {date(n.at, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, {time(n.at)}</p></div>
      </div>
      <div className="panel__body note-2col">
        <div className="note">
          {SOAP.map((s) => <div key={s.key} className="note__sec"><h4>{s.letter}. {s.label}</h4><p>{n[s.key]}</p></div>)}
          <div className="note__sec note__meds"><h4>Medicamentos</h4>
            {meds.length ? <OrderChecklist n={n} orders={meds} file={file} reload={reload} pill /> : <p className="muted">Sin medicamentos indicados.</p>}</div>
        </div>
        <aside className="note-orders" aria-label="Indicaciones">
          <h4>Indicaciones</h4>
          {indications.length ? <OrderChecklist n={n} orders={indications} file={file} reload={reload} /> : <p className="muted">Sin indicaciones.</p>}
        </aside>
      </div>
    </article>
  )
}

/**
 * Órdenes numeradas; en las notas con checklist, cada una con su casilla y la marca de enfermería. `index` es
 * la posición de la orden en la nota (la que guarda la marca); el número que se ve es el de su columna.
 */
function OrderChecklist({ n, orders, file, reload, pill = false }: { n: InpatientNote; orders: { text: string; index: number }[]; file: File; reload: () => void; pill?: boolean }) {
  const { can, staffById, reviewOrder } = useStore()
  const [undo, setUndo] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  // Mientras el servidor responde, la casilla ya se ve marcada
  const [saving, setSaving] = useState<number | null>(null)
  const canMark = can('orders.review') && n.checklist && file.hospitalization.status === 'active'
  return (
    <>
      <ol className="order-check">
        {orders.map(({ text: o, index: i }, pos) => {
          const mark = n.checklist ? orderMark(file.marks, n.id, i) : undefined
          const checked = mark?.action === 'check'
          const who = mark && staffById(mark.by)
          return (
            <li key={i} className={checked ? 'is-checked' : n.checklist ? 'is-pending' : ''}>
              <span className="orders__n">{pos + 1}.</span>
              <span className="order-check__text"><span className="order-check__order">{pill && <Pill size={13} className="orders__pill" aria-hidden="true" />}{o}</span>
                {checked && <small className="order-check__mark">✓ {shortStaff(who?.name)} {time(mark.at)}</small>}
                {mark?.action === 'uncheck' && <small className="order-check__mark order-check__mark--undo">Desmarcada por {shortStaff(who?.name)} {time(mark.at)}: {mark.reason}</small>}
              </span>
              {canMark && (
                <input type="checkbox" className="order-check__box" checked={checked || saving === i} disabled={saving !== null} aria-label={`${pill ? 'Medicamento' : 'Indicación'} ${pos + 1} revisada`}
                  onChange={async (e) => {
                    if (!e.target.checked) { setUndo(i); setReason(''); return }
                    setSaving(i)
                    if (await reviewOrder(n.id, i, true)) reload()
                    setSaving(null)
                  }} />
              )}
            </li>
          )
        })}
      </ol>
      {undo !== null && (
        <Modal title="Desmarcar la orden" onClose={() => setUndo(null)} footer={<>
          <button className="btn btn--ghost" onClick={() => setUndo(null)}>Cancelar</button>
          <button className="btn btn--danger" disabled={reason.trim().length < 5} onClick={async () => { if (await reviewOrder(n.id, undo, false, reason.trim())) { setUndo(null); reload() } }}>Desmarcar</button>
        </>}>
          <p>«{orders.find((o) => o.index === undo)?.text}»</p>
          <label className="field"><span>¿Por qué la desmarcas? Queda en la bitácora.</span><input className="input" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. La marqué por error" /></label>
        </Modal>
      )}
    </>
  )
}

/** Para enfermería: todas las órdenes sin revisar de todas las notas, en orden de hora. */
function PendingOrdersPanel({ file, reload }: { file: File; reload: () => void }) {
  const { staffById, reviewOrder } = useStore()
  const [saving, setSaving] = useState(false)
  const pending = pendingOrdersOf(file)
  if (file.hospitalization.status !== 'active') return null
  return (
    <section className={`panel ${pending.length ? 'pending-orders' : ''}`}>
      <div className="panel__head"><div><h2>Órdenes por revisar <span className="num" style={{ color: 'var(--faint)' }}>{pending.length}</span></h2>
        <p>{pending.length ? 'Marca cada orden cuando la hayas revisado; queda tu nombre y la hora.' : 'Todas las órdenes médicas están revisadas.'}</p></div></div>
      {pending.length > 0 && (
        <div className="rows">{pending.map(({ note, index, text }) => (
          <label key={`${note.id}:${index}`} className="row pending-orders__row">
            <input type="checkbox" disabled={saving} onChange={async (e) => {
              if (!e.target.checked) return
              setSaving(true)
              if (await reviewOrder(note.id, index, true)) reload()
              setSaving(false)
            }} aria-label={`Marcar como revisada: ${text}`} />
            <span className="row__who"><strong>{index + 1}. {text}</strong><span>{shortStaff(staffById(note.authorId)?.name)}, {dateTime(note.at)}</span></span>
          </label>
        ))}</div>
      )}
    </section>
  )
}

/** Nota de procedimiento en la línea de tiempo: las dos horas, el texto y la autorización. */
function ProcedureNote({ n, file }: { n: InpatientNote; file: File }) {
  const { staffById } = useStore()
  const x = n.procedure!
  const auth = x.authorizationId ? file.authorizations.find((a) => a.id === x.authorizationId) : undefined
  const legacy = x.authorizationId && !auth ? file.procedures.find((a) => a.id === x.authorizationId) : undefined
  const signedAt = auth?.statusAt ?? legacy?.updatedAt ?? legacy?.createdAt
  return (
    <article className="panel consult-entry">
      <div className="panel__head">
        <div><h2>Nota de procedimiento <span className="badge badge--ink">Procedimiento</span></h2>
          <p>Procedimiento: <b>{dm(x.performedAt)}</b> · Nota escrita: {dm(n.at)} · {staffById(n.authorId)?.name}</p></div>
      </div>
      <div className="panel__body note">
        <div className="note__sec"><h4>{x.name}</h4><p>{n.text}</p></div>
        {x.urgent && <p className="badge badge--amber" style={{ whiteSpace: 'normal' }}>Urgencia, sin autorización previa: {x.justification}</p>}
        {signedAt && <p className="badge badge--mint" style={{ whiteSpace: 'normal' }}>Autorización firmada ✓ ({dm(signedAt)})</p>}
      </div>
    </article>
  )
}

/**
 * Nota de procedimiento: nombre, fecha y hora (por defecto ahora; se corrige si se escribe después) y un
 * solo cuadro de texto. Si no hay autorización firmada en las últimas 24 horas se avisa antes de guardar.
 */
function ProcedureNoteForm({ file, onClose, onSaved, onAuthorize }: { file: File; onClose: () => void; onSaved: () => void; onAuthorize: (procedure: string) => void }) {
  const { addProcedureNote } = useStore()
  const now = useNow()
  const [f, setF] = useState(() => ({ name: '', performedAt: inputDateTime(new Date()), text: '', urgent: false, justification: '' }))
  const [busy, setBusy] = useState(false)
  const performed = new Date(f.performedAt)
  const future = performed.getTime() > now.getTime() + 60_000
  // Autorizaciones firmadas en las 24 horas anteriores al procedimiento (y registros anteriores marcados como autorizados)
  const since = performed.getTime() - 24 * 3_600_000
  const auths = [
    ...file.authorizations.filter((a) => a.status === 'signed' && a.statusAt && new Date(a.statusAt).getTime() >= since && new Date(a.statusAt).getTime() <= performed.getTime() + 2 * 60_000)
      .map((a) => ({ id: a.id, name: a.data.procedure ?? 'Autorización general', at: a.statusAt! })),
    ...file.procedures.filter((x) => x.kind === 'authorization' && x.status === 'authorized' && new Date(x.updatedAt ?? x.createdAt).getTime() >= since)
      .map((x) => ({ id: x.id, name: x.name, at: x.updatedAt ?? x.createdAt })),
  ]
  const [authId, setAuthId] = useState<string | null>(null)
  const chosen = auths.find((a) => a.id === authId) ?? auths[0]
  const covered = auths.length > 0
  const ready = f.name.trim().length >= 3 && f.performedAt && !future && f.text.trim().length >= 10 && (covered || (f.urgent && f.justification.trim().length >= 10))
  return (
    <Modal title="Nota de procedimiento" wide onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!ready || busy} onClick={async () => {
        setBusy(true)
        const ok = await addProcedureNote(file.hospitalization.id, {
          name: f.name.trim(), performedAt: performed.toISOString(), text: f.text.trim(), authorizationId: covered ? chosen.id : undefined,
          urgent: !covered && f.urgent, justification: !covered && f.urgent ? f.justification.trim() : undefined,
        })
        setBusy(false)
        if (ok) onSaved()
      }}>Guardar nota</button>
    </>}>
      <div className="form-grid">
        <label className="field"><span>Procedimiento</span><input className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ej. Colocación de sonda vesical" /></label>
        <label className="field"><span>Fecha y hora del procedimiento</span>
          <input className={`input ${future ? 'input--error' : ''}`} type="datetime-local" value={f.performedAt} max={inputDateTime(now)} onChange={(e) => setF({ ...f, performedAt: e.target.value })} />
          {future && <small className="field__msg field__msg--error">No puede ser en el futuro.</small>}
          <small className="muted">Si escribes la nota después del procedimiento, corrige la hora. La hora en que escribes la nota se guarda sola.</small></label>
      </div>
      <label className="field"><span>Nota</span>
        <textarea className="textarea textarea--lg" value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} placeholder="Indicación, técnica, hallazgos, complicaciones, estado del paciente al terminar." /></label>
      {covered ? (
        <div className="alert-strip alert-strip--calm" style={{ flexWrap: 'wrap' }}>Autorización firmada ✓ ({dm(chosen.at)}):
          {auths.length > 1
            ? <select className="select" style={{ width: 'auto' }} value={chosen.id} onChange={(e) => setAuthId(e.target.value)}>{auths.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            : <b>{chosen.name}</b>}</div>
      ) : (
        <div className="alert-strip alert-strip--amber" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <span>No hay autorización firmada registrada para este procedimiento en las últimas 24 horas.</span>
          <button type="button" className="btn btn--soft btn--sm" style={{ alignSelf: 'flex-start' }} onClick={() => onAuthorize(f.name.trim())}><FileSignature size={14} />Crear la autorización</button>
          <label className="check-line" style={{ background: '#fff' }}><input type="checkbox" checked={f.urgent} onChange={(e) => setF({ ...f, urgent: e.target.checked })} />
            <span><b>Urgencia, sin autorización previa</b><small>Escribe por qué no se pudo obtener antes.</small></span></label>
          {f.urgent && <textarea className="textarea textarea--sm" rows={2} value={f.justification} onChange={(e) => setF({ ...f, justification: e.target.value })} placeholder="Justificación" aria-label="Justificación de la urgencia" />}
        </div>
      )}
    </Modal>
  )
}

const EMPTY_MED: NewMed = { drug: '', presentation: '', dose: '', route: 'Intravenosa', everyHours: 8, prn: false, instructions: '' }

function NoteEditor({ file, p, kind, onClose, onSaved }: { file: File; p: Patient; kind: 'admission' | 'evolution'; onClose: () => void; onSaved: () => void }) {
  const { addInpatientNote } = useStore()
  const [n, setN] = useState({ subjective: '', objective: '', assessment: kind === 'admission' ? file.hospitalization.diagnoses.map((d) => d.label).join('. ') : '', plan: '' })
  const [meds, setMeds] = useState<NewMed[]>([])
  const [stop, setStop] = useState<string[]>([])
  const [adding, setAdding] = useState(kind === 'admission')
  const [replacing, setReplacing] = useState<string | null>(null)
  const [extra, setExtra] = useState<string[]>(() => carriedOrders(file))
  const [extraText, setExtraText] = useState('')
  const [busy, setBusy] = useState(false)
  const active = file.meds.filter((m) => !m.stoppedAt)
  const ready = SOAP.every((s) => n[s.key].trim())
  // Cada línea es una orden; se quita la numeración o viñeta con que venga pegada
  const clean = (line: string) => line.replace(/^\s*(\d+\s*[.)-]|[-•*])\s*/, '').trim()
  const addLines = (text: string) => {
    const lines = text.split(/\r?\n/).map(clean).filter(Boolean)
    if (!lines.length) return
    setExtra((x) => [...x, ...lines.map((t) => (/[.!?]$/.test(t) ? t : `${t}.`))])
    setExtraText('')
  }
  const addExtra = () => addLines(extraText)
  return (
    <Modal title={kind === 'admission' ? 'Nota de ingreso' : 'Nota de evolución'} wide onClose={onClose} footer={<>
      <span className="muted" style={{ marginRight: 'auto', fontSize: 13.5 }}>{meds.length ? `${meds.length} medicamento(s) nuevo(s)` : ''}{stop.length ? `${meds.length ? ', ' : ''}${stop.length} omitido(s)` : ''}</span>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!ready || busy} onClick={async () => {
        setBusy(true)
        const ended = (id: string) => stop.includes(id) || meds.some((x) => x.replacesId === id)
        const kept = active.filter((m) => !ended(m.id)).map((m) => medLabel(m))
        const added = meds.map((m) => medLabel(m))
        const omitted = active.filter((m) => ended(m.id)).map((m) => `OMITIR ${m.drug}`)
        const ok = await addInpatientNote(file.hospitalization.id, { kind, ...n, meds, stopMedIds: stop, orders: [...extra, ...kept, ...added, ...omitted], indicationCount: extra.length })
        setBusy(false)
        if (ok) onSaved()
      }}>Guardar nota</button>
    </>}>
      {p.allergies.length > 0 && <div className="alert-strip"><TriangleAlert size={16} />Alergias: {p.allergies.join(', ')}</div>}
      <div className="note-editor">
      <div className="soap-stack">
        {SOAP.map((s) => (
          <label key={s.key} className="field"><span>{s.letter}. {s.label} <small style={{ fontWeight: 400 }}>{s.hint}</small></span>
            <textarea className="textarea" rows={4} value={n[s.key]} onChange={(e) => setN({ ...n, [s.key]: e.target.value })} /></label>
        ))}
      {active.length > 0 && (
        <fieldset className="fs"><legend>Medicamentos activos</legend>
          <p className="muted" style={{ fontSize: 13.5 }}>Marca OMITIR para suspender un medicamento; desde ahora la hoja de enfermería lo mostrará omitido.</p>
          <div className="rows">
            {active.map((m) => (
              <div key={m.id} className="omit-row">
                <span className={stop.includes(m.id) || meds.some((x) => x.replacesId === m.id) ? 'struck' : ''}>{medLabel(m)}</span>
                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button type="button" className="btn btn--ghost btn--sm" disabled={stop.includes(m.id) || meds.some((x) => x.replacesId === m.id)} onClick={() => { setReplacing(m.id); setAdding(false) }}>Cambiar</button>
                  <label><input type="checkbox" checked={stop.includes(m.id)} onChange={(e) => { setStop(e.target.checked ? [...stop, m.id] : stop.filter((x) => x !== m.id)); if (e.target.checked) setReplacing(null) }} /> OMITIR</label>
                </span>
              </div>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset className="fs note-editor__meds"><legend>Medicamentos de esta nota</legend>
        <p className="muted" style={{ fontSize: 13.5 }}>Van en la nota y pasan solos a la hoja de medicamentos.</p>
        {meds.length > 0 && <ol className="orders">{meds.map((m, i) => (
          <li key={i}><span className="orders__n">{i + 1}.</span><span className="orders__text"><Pill size={13} className="orders__pill" />{medLabel(m)}{m.instructions ? `. ${m.instructions}` : ''}</span>
            <span className="orders__tools"><button className="icon-btn" aria-label="Quitar" onClick={() => setMeds(meds.filter((_, j) => j !== i))}><X size={14} /></button></span></li>
        ))}</ol>}
        {replacing && <p className="muted" style={{ fontSize: 13.5 }}>La indicación nueva reemplaza a {active.find((m) => m.id === replacing)?.drug}. La nota conservará el resto de órdenes.</p>}
        {replacing ? <MedForm p={p} initial={medToNew(active.find((m) => m.id === replacing)!)} onAdd={(m) => { setMeds([...meds, { ...m, replacesId: replacing }]); setReplacing(null) }} onCancel={() => setReplacing(null)} />
          : adding ? <MedForm p={p} onAdd={(m) => { setMeds([...meds, m]); setAdding(false) }} onCancel={() => setAdding(false)} />
          : <button className="btn btn--soft" onClick={() => setAdding(true)}><Plus size={15} />Agregar medicamento</button>}
      </fieldset>
      </div>
      <div className="note-editor__orders">
      <fieldset className="fs"><legend>Indicaciones</legend>
        <p className="muted" style={{ fontSize: 13.5 }}>Lo que no es medicamento, una por línea: dieta, cuidados, signos vitales, estudios. Puedes pegar una lista completa.</p>
        {extra.length > 0 && <ol className="orders">{extra.map((o, i) => (
          <li key={i}><span className="orders__n">{i + 1}.</span>
            <input className="input" value={o} aria-label={`Indicación ${i + 1}`} onChange={(e) => setExtra(extra.map((x, j) => j === i ? e.target.value : x))} />
            <span className="orders__tools"><button type="button" className="icon-btn" aria-label="Quitar indicación" onClick={() => setExtra(extra.filter((_, j) => j !== i))}><X size={14} /></button></span></li>
        ))}</ol>}
        <div className="order-add">
          <textarea className="textarea textarea--sm" rows={2} value={extraText} aria-label="Nueva indicación"
            placeholder={`${extra.length + 1}. Escribe una indicación y presiona Enter, o pega varias líneas`}
            onChange={(e) => setExtraText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addExtra() } }}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text')
              if (!text.includes('\n')) return
              e.preventDefault()
              addLines(text)
            }} />
          <button className="btn btn--soft" disabled={!extraText.trim()} type="button" onClick={addExtra} aria-label="Agregar indicación"><Plus size={16} /></button>
        </div>
      </fieldset>
      </div>
      </div>
    </Modal>
  )
}

function carriedOrders(file: File) {
  const last = [...file.notes].reverse().find((n) => (n.kind === 'admission' || n.kind === 'evolution') && n.orders?.length)
  if (!last?.orders?.length) return []
  const drugs = file.meds.map((m) => m.drug)
  return last.orders.filter((o) => !o.startsWith('OMITIR ') && !drugs.some((d) => o.startsWith(d)))
}

function medToNew(m: InpatientMed): NewMed {
  return { drug: m.drug, presentation: m.presentation ?? '', dose: m.dose, route: m.route, everyHours: m.everyHours, prn: m.prn, instructions: m.instructions ?? '', firstAt: inputDateTime(new Date()), days: m.days }
}

function MedForm({ p, initial, onAdd, onCancel }: { p: Patient; initial?: NewMed; onAdd: (m: NewMed) => void; onCancel: () => void }) {
  const [m, setM] = useState<NewMed>({ ...EMPTY_MED, firstAt: inputDateTime(new Date()), ...initial })
  const [freq, setFreq] = useState(initial?.everyHours ? String(initial.everyHours) : 'once')
  const [open, setOpen] = useState(false)
  const [override, setOverride] = useState(false)
  const conflict = m.drug ? allergyConflict(p.allergies, m.drug) : null
  const matches = DRUGS.filter((d) => d.name.toLowerCase().includes(m.drug.toLowerCase())).slice(0, 6)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!m.drug.trim() || !m.dose.trim() || (conflict && !override)) return
    const everyHours = freq === 'once' ? undefined : Number(freq)
    onAdd({ ...m, drug: m.drug.trim(), dose: m.dose.trim(), everyHours, instructions: m.instructions?.trim() || undefined,
      firstAt: m.prn ? undefined : new Date(m.firstAt!).toISOString() })
  }
  return (
    <form className="rx-form" onSubmit={submit}>
      <div className="field suggest"><span>Medicamento</span>
        <input className="input" autoFocus value={m.drug} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => { setM({ ...m, drug: e.target.value }); setOverride(false); setOpen(true) }} placeholder="Busca en el vademécum o escríbelo" />
        {open && matches.length > 0 && (
          <div className="suggest__list">
            {matches.map((d) => <button type="button" key={d.name} onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setM({ ...m, drug: d.name, presentation: d.presentation, route: /ampolla|vial|frasco|bolsa/i.test(d.presentation) ? 'Intravenosa' : defaultRoute(d.presentation) }); setOpen(false) }}>
              <span>{d.name}</span><span style={{ color: 'var(--muted)', marginLeft: 'auto' }}>{d.presentation}</span></button>)}
          </div>
        )}
      </div>
      <div className="form-grid">
        <label className="field"><span>Dosis</span><input className="input" value={m.dose} onChange={(e) => setM({ ...m, dose: e.target.value })} placeholder="Ej. 8 mg" /></label>
        <label className="field"><span>Vía</span><select className="select" value={m.route} onChange={(e) => setM({ ...m, route: e.target.value })}>{ROUTES.map((r) => <option key={r}>{r}</option>)}</select></label>
        <label className="field"><span>Frecuencia</span>
          <select className="select" value={freq} onChange={(e) => setFreq(e.target.value)}>
            {INPATIENT_FREQUENCIES.filter((f) => !m.prn || f.hours).map((f) => <option key={f.label} value={f.hours ?? 'once'}>{m.prn ? `${f.label} como máximo` : f.label}</option>)}
          </select></label>
        <label className="field" style={{ alignContent: 'end' }}><span>Según necesidad</span>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', height: 42 }}>
            <input type="checkbox" checked={m.prn} onChange={(e) => { setM({ ...m, prn: e.target.checked }); if (e.target.checked && freq === 'once') setFreq('8') }} />PRN, sin horario fijo</label></label>
        {!m.prn && <label className="field"><span>{freq === 'once' ? 'Hora de la dosis' : 'Primera dosis'}</span><input className="input" type="datetime-local" value={m.firstAt} onChange={(e) => setM({ ...m, firstAt: e.target.value })} /></label>}
        <label className="field"><span>Total de días (opcional)</span>
          <input className="input num" type="number" min={1} max={365} inputMode="numeric" value={m.days ?? ''} placeholder="Hasta nueva orden"
            onChange={(e) => setM({ ...m, days: e.target.value ? Math.max(1, Math.min(365, Math.round(Number(e.target.value)))) : undefined })} /></label>
        <label className="field"><span>Indicaciones</span><input className="input" value={m.instructions} onChange={(e) => setM({ ...m, instructions: e.target.value })} placeholder={m.prn ? 'Ej. Si hay dolor intenso' : 'Ej. Diluir en 100 ml'} /></label>
      </div>
      {conflict && (
        <div className="alert-strip" role="alert" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
          <span style={{ display: 'flex', gap: 8 }}><TriangleAlert size={18} style={{ flex: 'none' }} />{p.firstName} es alérgica/o a {conflict}. {m.drug} puede provocar una reacción.</span>
          {!override && <button type="button" className="btn btn--danger btn--sm" style={{ background: '#fff' }} onClick={() => setOverride(true)}>Indicar de todos modos</button>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn--primary" disabled={!m.drug.trim() || !m.dose.trim() || (!!conflict && !override)}><Plus size={16} />Agregar a la nota</button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  )
}

// ---------- Enfermería ----------

function NursingNotes({ file, reload }: { file: File; reload: () => void }) {
  const { can, staffById, addNursingNote } = useStore()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const notes = file.notes.filter((n) => n.kind === 'nursing').sort((a, b) => b.at.localeCompare(a.at))
  const write = can('inpatient.care') && file.hospitalization.status === 'active'
  return (
    <div className="hc">
      {write && (
        <section className="panel">
          <div className="panel__head"><h2>Nueva nota de enfermería</h2><p>Se guarda con la fecha, la hora y tu nombre.</p></div>
          <div className="panel__body" style={{ display: 'grid', gap: 10 }}>
            <textarea className="textarea" rows={3} value={text} onChange={(e) => setText(e.target.value)} aria-label="Nota de enfermería" placeholder="Estado del paciente, cuidados realizados, novedades del turno." />
            <button className="btn btn--primary" style={{ justifySelf: 'start' }} disabled={text.trim().length < 3 || busy} onClick={async () => {
              setBusy(true)
              if (await addNursingNote(file.hospitalization.id, text.trim())) { setText(''); reload() }
              setBusy(false)
            }}>Guardar nota</button>
          </div>
        </section>
      )}
      <section className="panel">
        {notes.length ? <div className="rows">{notes.map((n) => <NursingRow key={n.id} n={n} who={staffById(n.authorId)?.name} />)}</div>
          : <div className="empty">Sin notas de enfermería.</div>}
      </section>
    </div>
  )
}

function NursingRow({ n, who }: { n: InpatientNote; who?: string }) {
  return (
    <div className="nnote">
      <div className="nnote__when"><b>{date(n.at, { day: 'numeric', month: 'short' })}</b><span>{time(n.at)}</span></div>
      <div><p>{n.text}</p><small className="muted">{who}</small></div>
    </div>
  )
}

// ---------- Laboratorios ----------

const LAB_TESTS = ['Hemograma', 'Química sanguínea', 'Glucosa', 'Creatinina y nitrógeno ureico', 'Electrolitos', 'Examen general de orina', 'Pruebas de función hepática',
  'Tiempos de coagulación', 'Gases arteriales', 'Hemocultivo', 'Radiografía', 'Ultrasonido', 'Tomografía']

function Labs({ file, reload }: { file: File; reload: () => void }) {
  const { can, staffById, uploadAttachment, notify } = useStore()
  const [title, setTitle] = useState('')
  const [takenAt, setTakenAt] = useState(inputDateTime(new Date()))
  const [picked, setPicked] = useState<globalThis.File | null>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const open = file.hospitalization.status === 'active'
  const byTest = new Map<string, typeof file.labs>()
  for (const l of file.labs) byTest.set(l.title ?? 'Sin nombre', [...(byTest.get(l.title ?? 'Sin nombre') ?? []), l])

  return (
    <div className="hc">
      {open && can('chart.view') && (
        <section className="panel">
          <div className="panel__head"><div><h2>Subir resultado</h2><p>Mientras el laboratorio no esté conectado al sistema, toma una foto del examen o sube el PDF.</p></div></div>
          <div className="panel__body form-grid">
            <label className="field"><span>Qué examen es</span>
              <input className="input" list="lab-tests" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Hemograma" />
              <datalist id="lab-tests">{LAB_TESTS.map((t) => <option key={t} value={t} />)}</datalist></label>
            <label className="field"><span>Fecha y hora de la toma</span><input className="input" type="datetime-local" value={takenAt} max={inputDateTime(new Date())} onChange={(e) => setTakenAt(e.target.value)} /></label>
            <div className="field span-2"><span>Foto o PDF</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="btn btn--soft" onClick={() => input.current?.click()}><Camera size={16} />{picked ? 'Cambiar archivo' : 'Tomar foto o elegir archivo'}</button>
                {picked && <span className="muted">{picked.name}</span>}
              </div>
              <input ref={input} type="file" accept="image/*,application/pdf" capture="environment" hidden onChange={(e) => setPicked(e.target.files?.[0] ?? null)} />
            </div>
            <button className="btn btn--primary" style={{ justifySelf: 'start' }} disabled={!title.trim() || !takenAt || !picked || busy} onClick={async () => {
              if (!picked) return
              if (picked.size > 3 * 1024 * 1024) { notify('El archivo pesa más de 3 MB. Toma la foto con menor resolución.', 'error'); return }
              setBusy(true)
              const ok = await uploadAttachment(file.hospitalization.patientId, {
                name: picked.name, mime: picked.type, category: 'lab', data: await toBase64(picked), title: title.trim(),
                takenAt: new Date(takenAt).toISOString(), hospitalizationId: file.hospitalization.id,
              })
              setBusy(false)
              if (ok) { setTitle(''); setPicked(null); reload() }
            }}>Guardar resultado</button>
          </div>
        </section>
      )}
      {file.labs.length ? [...byTest.entries()].map(([test, list]) => (
        <section key={test} className="panel">
          <div className="panel__head"><h2>{test}</h2><p>{list.length} resultado{list.length > 1 ? 's' : ''}</p></div>
          <div className="rows">
            {list.map((l) => (
              <a key={l.id} className="row" style={{ gridTemplateColumns: '150px 1fr auto' }} href={`/api/attachments/${l.id}`} target="_blank" rel="noreferrer">
                <span className="num" style={{ fontSize: 13.5 }}>{l.takenAt ? dateTime(l.takenAt) : dateTime(l.uploadedAt)}</span>
                <div className="row__who"><strong>{l.name}</strong><span>Subido por {staffById(l.uploadedBy)?.name}</span></div>
                <FileText size={18} color="var(--faint)" />
              </a>
            ))}
          </div>
        </section>
      )) : <section className="panel"><div className="empty">Sin resultados de laboratorio en esta hospitalización.</div></section>}
    </div>
  )
}

// ---------- Egreso ----------

const CONDITIONS = ['Mejorado', 'Curado', 'Estable', 'Alta voluntaria', 'Trasladado a otro centro']
const EMPTY_RX: PrescriptionItem = { drug: '', presentation: '', dose: '1 tableta', route: 'Oral', frequency: 'Cada 8 horas', duration: '5 días', instructions: '' }

function Discharge({ file, p, reload }: { file: File; p: Patient; reload: () => void }) {
  const { can, discharge, staffById } = useStore()
  const h = file.hospitalization
  const note = file.notes.find((n) => n.kind === 'discharge')
  const [dx, setDx] = useState(h.diagnoses)
  const [f, setF] = useState({ summary: '', condition: 'Mejorado', instructions: '', followUp: 'Cita de control en consulta externa en 1 semana.' })
  const [items, setItems] = useState<PrescriptionItem[]>([])
  const [rx, setRx] = useState<PrescriptionItem>(EMPTY_RX)
  const [busy, setBusy] = useState(false)

  if (note?.discharge) {
    const d = note.discharge
    return (
      <article className="panel consult-entry">
        <div className="panel__head">
          <div><h2>Nota de egreso</h2><p>{dateTime(note.at)}, {staffById(note.authorId)?.name}</p></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link className="btn btn--primary btn--sm" to={`${stayPath(h)}/expediente`}><FileText size={15} />Expediente completo</Link>
            {h.prescriptionId && <Link className="btn btn--ghost btn--sm" to={`/app/recetas/${h.prescriptionId}`}>Receta de egreso</Link>}
          </div>
        </div>
        <div className="panel__body"><div className="note">
          <div className="note__sec"><h4>Resumen</h4><p>{d.summary}</p></div>
          <div className="note__sec"><h4>Diagnóstico de egreso</h4><ol className="note__list">{d.diagnoses.map((x) => <li key={x.code + x.label}>{x.label} <span className="muted">({x.code})</span></li>)}</ol></div>
          <div className="note__sec"><h4>Condición al egreso</h4><p>{d.condition}</p></div>
          {d.instructions && <div className="note__sec"><h4>Indicaciones</h4><p>{d.instructions}</p></div>}
          {d.followUp && <div className="note__sec"><h4>Seguimiento</h4><p>{d.followUp}</p></div>}
        </div></div>
      </article>
    )
  }
  if (!can('inpatient.orders')) return <section className="panel"><div className="empty">El médico escribe la nota de egreso cuando da de alta al paciente.</div></section>

  const ready = dx.length > 0 && f.summary.trim().length >= 10 && f.condition
  // Órdenes abiertas ("hasta nueva orden" o con días): si continúan en casa, la receta necesita los días
  const open = file.meds.filter((m) => !m.stoppedAt && !items.some((it) => it.drug === m.drug))
  const toRx = (m: InpatientMed): PrescriptionItem => ({
    drug: m.drug, presentation: m.presentation ?? '', dose: m.dose, route: m.route,
    frequency: m.prn ? 'Según necesidad' : m.everyHours ? `Cada ${m.everyHours} horas` : 'Dosis única', duration: '', instructions: m.instructions ?? '',
  })
  return (
    <section className="panel">
      <div className="panel__head"><div><h2>Nota de egreso</h2><p>{h.kind === 'observation' ? 'Al guardarla se cierra la observación y el paciente sale de la lista' : 'Al guardarla se cierra el expediente de hospitalización, se libera la cama'} y, si agregas medicamentos, se emite la receta de salida.</p></div></div>
      <div className="panel__body" style={{ display: 'grid', gap: 14 }}>
        <label className="field"><span>Resumen: por qué ingresó, qué se le hizo y cómo evolucionó</span>
          <textarea className="textarea" rows={4} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })}
            placeholder={`Paciente ingresó por ${h.reason.toLowerCase()} Se le realizó... Evolucionó...`} /></label>
        <DxPicker label="Diagnóstico de egreso" value={dx} onChange={setDx} />
        <div className="form-grid">
          <label className="field"><span>Condición al egreso</span><select className="select" value={f.condition} onChange={(e) => setF({ ...f, condition: e.target.value })}>{CONDITIONS.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label className="field"><span>Seguimiento</span><input className="input" value={f.followUp} onChange={(e) => setF({ ...f, followUp: e.target.value })} /></label>
          <label className="field span-2"><span>Indicaciones al alta</span><textarea className="textarea textarea--sm" rows={2} value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} placeholder="Dieta, cuidados de la herida, signos de alarma." /></label>
        </div>
        <fieldset className="fs"><legend>Medicamentos para la casa (receta de egreso)</legend>
          {open.length > 0 && <>
            <p className="muted" style={{ fontSize: 13.5 }}>Órdenes que siguen abiertas. Si alguna continúa en casa, pásala a la receta y escribe cuántos días.</p>
            <div className="rows">{open.map((m) => (
              <div key={m.id} className="omit-row"><span>{medLabel(m)}{m.days ? '' : ' · hasta nueva orden'}</span>
                <button type="button" className="btn btn--soft btn--sm" onClick={() => setRx(toRx(m))}><Plus size={14} />Continúa en casa</button></div>
            ))}</div>
          </>}
          {items.length > 0 && <ol className="orders">{items.map((it, i) => (
            <li key={i}><span className="orders__n">{i + 1}.</span><span className="orders__text"><Pill size={13} className="orders__pill" />{it.drug} {it.presentation}: {it.dose} {it.frequency.toLowerCase()} por {it.duration}</span>
              <span className="orders__tools"><button className="icon-btn" aria-label="Quitar" onClick={() => setItems(items.filter((_, j) => j !== i))}><X size={14} /></button></span></li>
          ))}</ol>}
          <form className="form-grid" onSubmit={(e) => { e.preventDefault(); if (rx.drug.trim() && rx.duration.trim()) { setItems([...items, { ...rx, drug: rx.drug.trim() }]); setRx(EMPTY_RX) } }}>
            <label className="field"><span>Medicamento</span><input className="input" list="dc-drugs" value={rx.drug}
              onChange={(e) => { const d = DRUGS.find((x) => x.name === e.target.value); setRx({ ...rx, drug: e.target.value, presentation: d?.presentation ?? rx.presentation }) }} />
              <datalist id="dc-drugs">{DRUGS.map((d) => <option key={d.name} value={d.name} />)}</datalist></label>
            <label className="field"><span>Presentación</span><input className="input" value={rx.presentation} onChange={(e) => setRx({ ...rx, presentation: e.target.value })} /></label>
            <label className="field"><span>Dosis</span><input className="input" value={rx.dose} onChange={(e) => setRx({ ...rx, dose: e.target.value })} /></label>
            <label className="field"><span>Frecuencia</span><select className="select" value={rx.frequency} onChange={(e) => setRx({ ...rx, frequency: e.target.value })}>{FREQUENCIES.map((x) => <option key={x}>{x}</option>)}</select></label>
            <label className="field"><span>Total de días</span><input className={`input ${rx.drug.trim() && !rx.duration.trim() ? 'input--warn' : ''}`} value={rx.duration} onChange={(e) => setRx({ ...rx, duration: e.target.value })} placeholder="Ej. 5 días" />
              {rx.drug.trim() && !rx.duration.trim() && <small className="field__msg field__msg--warn">La receta de egreso lleva los días.</small>}</label>
            <button className="btn btn--soft" style={{ alignSelf: 'end' }} disabled={!rx.drug.trim() || !rx.duration.trim()}><Plus size={15} />Agregar</button>
          </form>
          {allergyConflict(p.allergies, rx.drug) && <div className="alert-strip"><TriangleAlert size={16} />{p.firstName} es alérgica/o a {allergyConflict(p.allergies, rx.drug)}.</div>}
        </fieldset>
        <button className="btn btn--primary btn--lg" style={{ justifySelf: 'start' }} disabled={!ready || busy} onClick={async () => {
          setBusy(true)
          const r = await discharge(h.id, { diagnoses: dx, summary: f.summary.trim(), condition: f.condition, instructions: f.instructions.trim(), followUp: f.followUp.trim() || undefined, items })
          setBusy(false)
          if (r) reload()
        }}><LogOut size={17} />Dar de alta a {fullName(p).split(' ')[0]}</button>
      </div>
    </section>
  )
}
