import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { fromLocalValue } from '../lib/dateInput'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, BedDouble, ChevronLeft, ChevronRight, ClipboardList, FileSignature, FileText, FlaskConical, LogOut, NotebookPen, Pencil, Pill, Plus, Printer, Send, Syringe, TriangleAlert, X } from 'lucide-react'
import { useStore, type NewMed } from '../lib/store'
import { EXAM_GUIDE } from '../lib/clinicalConfig'
import { AutoTextarea, Loading, Modal } from '../components/ui'
import { PatientHeader } from '../components/PatientHeader'
import { date, dateTime, dmyTime, inputDateTime, localISODate, shortStaff, time, dxCode } from '../lib/format'
import { MedicationForm } from '../components/Medications'
import { DateTimeField } from '../components/DateTimeField'
import { mainRole, ROLE_LABEL } from '../lib/permissions'
import { allergyConflict } from '../lib/catalogs'
import { activeIndications, admissionOrdersPending, attendingText, chainNote, frequencyHours, doseAt, formatRate, infusionUnitLabel, isLoadingSlot, currentDiagnoses, LINE_TAG, yearsOld, defaultSpecialty, courseDone, courseEnd, doseTimes, elapsed, LATE_AFTER_MIN, medLabel, orderMark, pendingOrdersOf, slotState, soapBlocks, splitOrders, stayDay, treatmentDay, type SlotState } from '../lib/inpatient'
import { AlertBar } from './MedAlerts'
import { TAB_PARAM, tabCounts, type AlertGo } from '../lib/alerts'
import { NoteColumns, NoteExams, NoteText } from '../components/NoteColumns'
import { DiagnosisPicker } from '../components/DiagnosisPicker'
import { DictateButton, DictateField } from '../components/Dictate'
import { AuthorizationEntry, AuthorizationForm } from './Authorization'
import { blankPostop, postopDraftOf, postopIssues, postopPayload, PostopFields, surgicalAuths, type PostopDraft } from './PostopNote'
import { normalize } from '../lib/patients'
import { useFileAlerts, useNow } from '../lib/hooks'
import type { Addendum, Diagnosis, Dose, ExamInput, OrderLineTag, VitalsMode, HospProcedure, InpatientFile as File, InpatientMed, InpatientNote, Patient } from '../lib/types'
import { bedLabel } from './Inpatients'
import { GeneralDataModal } from './GeneralData'
import { AdmitBedStep, ConsentChoice } from './ConsentFlow'
import { ExamList } from './ExamsTab'
import { DischargeView, DischargeWriter } from './DischargeNote'
import { ExamsBlock } from '../components/Exams'
import { defaultPlace, examCatalog, examKey, typedExam } from '../lib/exams'
import { useExamCatalog } from '../lib/useExamCatalog'
import { Addenda, DraftBadge, SignedBadge } from '../components/Addenda'
import { useDraftSync } from '../lib/drafts'
import { api, ApiError, serverNow } from '../lib/api'
import { GRACE_EXPIRED_TEXT, REMOVED_IN_GRACE } from '../lib/grace'
import { CorrectionReason, GraceButton, VersionTag } from '../components/Grace'
import { BedFields } from '../components/BedFields'
import { GoToNote } from '../components/GoToNote'
import { ReferralActions, ReferralModal } from './Referral'
import { features } from '../lib/permissions'
import { ConsultationBody, Identification } from './PatientChart'
import { DischargeDocuments } from './Epicrisis'
import { VitalsSheet } from './VitalsSheet'
import { VitalsFrequency } from '../components/VitalsFrequency'
import { VitalsFields } from '../components/VitalsFields'
import { EMPTY_VITALS, FIELDS, fieldIssue, vitalNumber, type VitalsForm } from '../lib/vitalsForm'
import { VITALS, type VitalKey } from '../lib/vitals'
import { currentVitalsMode, vitalsModeText } from '../lib/vitalsSheet'
import { OrderSetPicker, SaveSetButton } from '../components/OrderSets'
import { hasBlank, medHasBlank, orderKey } from '../lib/orderSets'
import { useVademecum } from '../lib/vademecum'
import { GenerateRxModal, RxAnnex } from '../components/GenerateRx'
import { AnesthesiaAnnex, AnesthesiaCard } from '../components/AnesthesiaSheet'
import { PreEvalAnnex, PreEvalButton } from '../components/PreEval'
import { SurgicalCountAnnex, SurgicalCountCard } from '../components/SurgicalCount'
import type { OrderSet } from '../lib/types'
import { TabRow } from '../components/TabRow'
import { FluidsOrder, fluidsPayload, fluidsStart, type FluidsChoice } from '../components/FluidsOrder'
import { currentFluidsMode, fluidsOrderText } from '../lib/fluids'

type Tab = 'sheet' | 'notes' | 'vitals' | 'meds' | 'nursing' | 'labs' | 'annexes'

export default function InpatientFile() {
  const { id } = useParams()
  const { fetchInpatient, notify, patient, bed, staffById, can, user } = useStore()
  const [file, setFile] = useState<File | null>(null)
  // Desde la alerta de órdenes nuevas se entra directo a las notas; al firmar una consulta con ingreso, a completar la cama
  const [params, setParams] = useSearchParams()
  const [editing, setEditing] = useState(false)
  // MC1: al firmar una consulta con ingreso se elige la cama y se abre de inmediato la autorización de hospitalización
  const [admitting, setAdmitting] = useState(params.get('completar') === '1')
  const [consentFor, setConsentFor] = useState<string | null>(null)
  const wantsConsent = params.get('firmar')
  const tabParam = ({ hoja: 'sheet', notas: 'notes', signos: 'vitals', medicamentos: 'meds', enfermeria: 'nursing', anexos: 'annexes', examenes: 'labs' } as Record<string, Tab>)[params.get('tab') ?? '']
  // IM2 (ronda 12): el radiólogo entra directo a los exámenes (sus estudios)
  const [tab, setTab] = useState<Tab>(tabParam ?? (user?.role === 'imaging' ? 'labs' : 'sheet'))
  // RG1: el recorrido cambia de pestaña con ?tab= sin salir del expediente
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (tabParam) setTab(tabParam) }, [tabParam])
  // EN2: una alerta abre el lugar exacto: la dosis atrasada o el registro de signos
  const [focus, setFocus] = useState<{ dose?: { medId: string; at: string }; record?: boolean; recordPast?: boolean }>(() => ({
    dose: params.get('dosis') && params.get('hora') ? { medId: params.get('dosis')!, at: params.get('hora')! } : undefined, record: params.get('registrar') === '1', recordPast: params.get('registrar') === 'anteriores' }))
  const [missing, setMissing] = useState(false)
  // HO1 (ronda 12): la nota que se está escribiendo (abajo), para avisarlo en las otras pestañas
  const [writingNote, setWritingNote] = useState<string | null>(null)
  const now = useNow()
  const alerts = useFileAlerts(file)
  const load = useCallback(() => {
    if (!id) return
    fetchInpatient(id).then(setFile).catch((e: Error) => { setMissing(true); notify(e.message, 'error') })
  }, [id, fetchInpatient, notify])
  useEffect(load, [load])
  // Lo que pidió la alerta ya está en `focus`: se quita de la URL para que recargar no lo vuelva a abrir
  useEffect(() => {
    if (!['dosis', 'hora', 'registrar'].some((k) => params.has(k))) return
    const q = new URLSearchParams(params)
    for (const k of ['dosis', 'hora', 'registrar']) q.delete(k)
    setParams(q, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // MC1: «Pasar a hospitalización» o el ingreso directo llegan con ?firmar=1: se abre la autorización pendiente
  useEffect(() => {
    if (!file || !wantsConsent || consentFor || admitting) return
    const pend = file.authorizations.find((a) => a.template === 'hospital' && a.status === 'pending')
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (pend) setConsentFor(pend.id)
    setParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, wantsConsent])

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
  const annexes = file.authorizations.length + file.procedures.filter((x) => x.kind === 'authorization').length + file.referrals.length
    + file.epicrises.filter((e) => e.status !== 'voided').length
  const pendingAuth = open && file.authorizations.find((a) => a.template === 'hospital' && a.status === 'pending')
  // HO2 (ronda 16): ingreso directo sin nota de ingreso firmada (la franja de arriba y, para el médico, «Escribir nota de ingreso»)
  const ordersPending = admissionOrdersPending(h, file.notes)
  const writeAdmission = () => { setTab('notes'); setParams({ tab: TAB_PARAM.notes, nota: 'ingreso' }, { replace: true }) }
  const counts = tabCounts(alerts)
  // La pestaña queda en la URL: recargar, volver o el recorrido guiado regresan a ella
  const selectTab = (k: Tab) => {
    setTab(k)
    const q = new URLSearchParams(params)
    q.set('tab', TAB_PARAM[k])
    setParams(q, { replace: true })
  }
  const showNotes = () => { selectTab('notes'); window.scrollTo({ top: 0 }) }
  const canCare = can('inpatient.orders') || can('inpatient.care')
  const go = (g: AlertGo) => {
    if ('action' in g) {
      if (g.action === 'sign' && pendingAuth && canCare) setConsentFor(pendingAuth.id)
      else if (g.action === 'bed' && canCare) setAdmitting(true)
      else setTab(g.action === 'sign' ? 'annexes' : 'sheet')
      return
    }
    setFocus({ dose: g.dose, record: g.record, recordPast: g.recordPast })
    selectTab(g.tab)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  // EX1: la pestaña «Laboratorios» pasa a «Exámenes» (Laboratorio e Imagen y gabinete)
  const exams = file.exams ?? []
  const examTab = `Exámenes (${exams.filter((e) => e.status !== 'cancelled').length})`
  const tabs: [Tab, string][] = obs ? [
    ['sheet', 'Datos generales'],
    // EN1: Signos vitales va antes de las notas de evolución
    ['vitals', 'Signos vitales'],
    ['notes', `Notas de evolución (${medical.length + (h.consultationId ? 1 : 0)})`],
    ['meds', 'Hoja de medicamentos'],
    ['labs', examTab],
    ['annexes', `Anexos (${annexes})`],
  ] : [
    ['sheet', 'Hoja de hospitalización'],
    ['vitals', 'Signos vitales'],
    ['notes', `Notas de evolución (${medical.length + (h.consultationId ? 1 : 0)})`],
    ['meds', 'Medicamentos'],
    ['nursing', `Notas de enfermería (${nursing.length})`],
    ['labs', examTab],
    ['annexes', `Anexos (${annexes})`],
  ]
  const base = `/app/${obs ? 'observacion' : 'hospitalizados'}/${h.id}`

  return (
    <div className="page page--chart">
      <div className="sticky-top">
        <PatientHeader p={p} clinical link>
          <Link className="btn btn--primary btn--sm" data-tour="expediente-completo" to={`${base}/expediente`}><FileText size={15} />Expediente completo</Link>
        </PatientHeader>
        <div className="hosp-bar">
          <span><b>{obs ? 'Observación' : bedLabel(b)}</b></span>
          {!obs && h.specialty && <span className="badge badge--ink">{h.specialty}</span>}
          <span>{obs ? 'Entró a observación' : 'Ingresó'} {dateTime(h.admittedAt)}</span>
          {open ? (obs
            ? <span className="badge badge--ink">{elapsed(Math.floor((now.getTime() - new Date(h.admittedAt).getTime()) / 60_000))} en observación</span>
            : <span className="badge badge--mint">Día {stayDay(h.admittedAt)} de estancia</span>)
            : <span className="badge badge--done">{h.outcome === 'referred' ? `Referido${h.outcomeNote ? ` a ${h.outcomeNote}` : ''}` : 'Egresó'} {h.dischargedAt && dateTime(h.dischargedAt)}</span>}
          {h.observationAt && <span className="badge badge--amber">Vino de observación ({dateTime(h.observationAt)})</span>}
          <span className="muted">{h.diagnoses.map((d) => d.label).join('; ')}</span>
        </div>
        <TabRow data-tour="expediente-tabs">
          {tabs.map(([k, label]) => {
            const c = counts[k]
            return <button key={k} className="tab" role="tab" aria-selected={tab === k} onClick={() => selectTab(k)}>{label}
              {c && <span className={`tab-alert tab-alert--${c.level}`} aria-label={`${c.n} ${c.level === 'critical' ? 'críticas' : 'pendientes'}`}>{c.n}</span>}</button>
          })}
        </TabRow>
      </div>
      {/* EN2: barra compacta; la autorización pendiente y la cama sin asignar van en ella como pendientes */}
      <AlertBar alerts={alerts} onGo={go} />
      {ordersPending && (
        <div className="alert-strip admission-pending" role="alert" data-testid="admission-pending">
          <span><TriangleAlert size={16} style={{ verticalAlign: '-3px' }} /> Ingreso sin nota de ingreso: el médico tratante debe escribir las órdenes</span>
          {can('inpatient.orders') && <button type="button" className="btn btn--primary btn--sm" onClick={writeAdmission}><NotebookPen size={15} />Escribir nota de ingreso</button>}
        </div>
      )}
      {/* NE8 (ronda 13): los dos avisos de la nota abierta van juntos, arriba del contenido de la pestaña */}
      {writingNote && tab !== 'notes' && <div className="note-dock__hints" role="status">
        <p className="note-dock__hint"><NotebookPen size={15} />{writingNote} abierta: la encuentras al final de esta pestaña.
          <button type="button" className="linklike" onClick={() => document.querySelector('.note-dock')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Ir a la nota</button></p>
        <p className="note-dock__hint"><NotebookPen size={15} />Sigues escribiendo la {writingNote.toLowerCase()}: está aquí abajo.
          <button type="button" className="linklike" onClick={showNotes}>Ver las notas</button></p>
      </div>}
      {writingNote && tab !== 'notes' && <GoToNote target=".note-dock" />}
      {editing && <GeneralDataModal h={h} p={p} onClose={() => setEditing(false)} onDone={() => { setEditing(false); load() }} />}
      {admitting && <AdmitBedStep h={h} p={p} onClose={() => { setAdmitting(false); setParams({}, { replace: true }) }}
        onDone={async () => { setAdmitting(false); const f = await fetchInpatient(h.id); setFile(f); const a = f.authorizations.find((x) => x.template === 'hospital' && x.status === 'pending'); if (a) setConsentFor(a.id); setParams({}, { replace: true }) }} />}
      {consentFor && <ConsentChoice authorizationId={consentFor} p={p} onDone={() => {
        setConsentFor(null)
        // HO2 (ronda 16): ingreso directo de un médico: al terminar la autorización se abre sola la nota de ingreso
        if (ordersPending && can('inpatient.orders')) writeAdmission(); else setParams({}, { replace: true })
        load()
      }} />}

      {tab === 'sheet' && (
        <div className="hc">
          {/* OB3 (ronda 5): primero los datos del paciente y después el ingreso; los signos vitales están en su pestaña */}
          <section className="panel hc__sec">
            <div className="panel__head"><h2>Datos del paciente</h2></div>
            <div className="panel__body"><Identification p={p} /></div>
          </section>
          <section className="panel hc__sec">
            <div className="panel__head"><h2>{obs ? 'Ingreso a observación' : 'Hoja de hospitalización'}</h2>
              {open && (can('inpatient.orders') || can('inpatient.care')) && <button className="btn btn--ghost btn--sm" onClick={() => setEditing(true)}>Editar datos generales</button>}</div>
            <div className="panel__body">
              <dl className="facts">
                <div><dt>Fecha y hora del ingreso</dt><dd>{date(h.admittedAt, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, {time(h.admittedAt)}</dd></div>
                {!obs && <div><dt>Cuarto</dt><dd>{bedLabel(b)}</dd></div>}
                {!obs && <div><dt>Especialidad del ingreso</dt><dd>{h.specialty ?? '—'}</dd></div>}
                {h.observationAt && <div><dt>En observación desde</dt><dd>{dateTime(h.observationAt)}</dd></div>}
                <div><dt>{obs ? 'Médico' : 'Ingresado por'}</dt><dd>{staffById(h.admittedBy)?.name}</dd></div>
                {/* HO2 (ronda 16): médico(s) tratante(s), el primero es el principal */}
                {!obs && <div><dt>Médico tratante</dt><dd>{attendingText(h.attendingIds ?? [h.admittedBy], (x) => staffById(x)?.name) || '—'}</dd></div>}
                <div><dt>Procedencia</dt><dd>{h.consultationId ? <Link to={`/app/nota/${h.consultationId}`}>Consulta externa</Link> : 'Emergencia o ingreso directo'}</dd></div>
                {!obs && <div><dt>Quién lo acompaña</dt><dd>{h.companionName ? `${h.companionName}${h.companionRelation ? ` (${h.companionRelation})` : ''}` : <span className="muted">Sin dato</span>}</dd></div>}
                {!obs && <div><dt>Teléfono del acompañante</dt><dd>{h.companionPhone || <span className="muted">Sin dato</span>}</dd></div>}
                <div><dt>Teléfono del paciente</dt><dd>{h.patientPhone || p.phone}</dd></div>
                <div><dt>Motivo del ingreso</dt><dd>{h.reason}</dd></div>
              </dl>
              <h4 style={{ marginTop: 16 }}>Diagnósticos de ingreso</h4>
              <ol className="note__list">{h.diagnoses.map((d) => <li key={d.code + d.label}>{d.label} <span className="muted">({dxCode(d)})</span></li>)}</ol>
            </div>
          </section>
        </div>
      )}

      {tab === 'meds' && <MedSheet file={file} p={p} reload={load} onWriteNote={() => setTab('notes')} focusDose={focus.dose} onFocused={() => setFocus({})} />}
      {tab === 'vitals' && <VitalsSheet file={file} p={p} reload={load} autoRecord={focus.record} autoRecordPast={focus.recordPast} onFocused={() => setFocus({})} />}
      {tab === 'nursing' && !obs && <NursingNotes file={file} reload={load} />}
      {tab === 'labs' && <ExamList exams={exams} patientId={h.patientId} hospitalizationId={h.id} reload={load} open={open} />}
      {tab === 'annexes' && <Annexes file={file} p={p} reload={load} />}
      {/* HO1 (ronda 12): siempre montada: la nota que se escribe sigue abierta al cambiar de pestaña.
          NE8 (ronda 13): va después del contenido de cualquier pestaña: lo de la pestaña arriba, la nota abajo */}
      <MedicalNotes file={file} p={p} reload={load} show={tab === 'notes'} onWriting={setWritingNote} />
    </div>
  )
}

/** La nota de consulta externa que originó la estancia es la primera nota de evolución. */
function ConsultEntry({ consultationId, file }: { consultationId: string; file: File }) {
  const { fetchConsultation, staffById, can, user } = useStore()
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchConsultation>> | null>(null)
  const load = useCallback(() => { fetchConsultation(consultationId).then(setData).catch(() => null) }, [consultationId, fetchConsultation])
  useEffect(load, [load])
  if (!data) return <section className="panel"><div className="empty">Cargando la nota de consulta…</div></section>
  const c = data.consultation
  const author = staffById(c.doctorId)
  return (
    <article className="panel consult-entry">
      <div className="panel__head">
        <div><h2>Nota de ingreso <span className="badge badge--ink">Consulta externa</span></h2>
          <p>{author?.name}{author ? `, ${ROLE_LABEL[mainRole(author)].toLowerCase()}` : ''} · {date(c.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, {time(c.date)}</p></div>
        <Link className="btn btn--ghost btn--sm" to={`/app/nota/${c.id}`}>Ver nota completa</Link>
      </div>
      <div className="panel__body"><ConsultationBody c={c} vitals={data.vitals} exams={data.exams ?? []} vitalsLine={(() => { const s = file.hospitalization.vitalsPlan?.find((x) => x.noteId === c.id); return s ? vitalsModeText(s) : undefined })()}
        fluidsLine={(() => { const s = file.hospitalization.fluidsPlan?.find((x) => x.noteId === c.id); return s ? fluidsOrderText(s.mode) : undefined })()}
        medsExtra={<RxFromNote all meds={[...file.meds.filter((m) => m.source === 'consultation' && m.sourceId === c.id), ...(file.consultRxMeds ?? [])]} />} />
        <SignedBadge by={author?.name} at={c.date} addenda={(data.addenda ?? []).length} />
        <Addenda list={data.addenda ?? []} targetKind="consultation" targetId={c.id} canAdd={can('consult.write') && user?.role === 'doctor'} prescriptionId={c.prescriptionId} onAdded={load} /></div>
    </article>
  )
}

// ---------- Hoja de medicamentos ----------

const STATE_LABEL: Record<SlotState, string> = {
  given: 'Administrado', skipped: 'No aplicada', omitted: 'Omitido', late: 'Atrasado', due: 'Toca ahora', upcoming: 'Programado',
  autoskip: 'No aplicada (sin registro)',
}
/** OB1 (ronda 5): resultado de una dosis registrada. */
const DOSE_LABEL: Record<Dose['status'], string> = { given: 'Administrada', skipped: 'No aplicada', omitted: 'Omitida' }
/** Administrada más de una hora después de la indicada: «con retraso». */
const givenLate = (d: Dose) => d.status === 'given' && !!d.scheduledAt && new Date(d.givenAt).getTime() - new Date(d.scheduledAt).getTime() > LATE_AFTER_MIN * 60_000
/** Un registro de hace más de 24 horas pide motivo (la misma regla que el servidor). */
const oldSlot = (now: number, at?: Date) => !!at && at.getTime() < now - 24 * 3_600_000

/** Inicio del día (00:00) de una fecha. */
const dayStart = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
/** La semana va de lunes a domingo. */
const weekStart = (d: Date) => addDays(dayStart(d), -((d.getDay() + 6) % 7))
/** Hasta cuántos días adelante se puede ver lo programado. */
const AHEAD_DAYS = 7

/**
 * Hoja de medicamentos: vista Día (cada indicación con sus horas; se toca una hora para registrarla) y vista
 * Semana (los 7 días con lo programado y lo aplicado, quién y a qué hora). "Hoy" vuelve al día actual desde
 * cualquier fecha y las flechas recorren los días; no se va antes del ingreso. Un día que ya pasó se ve en
 * modo lectura: registrar o corregir algo ahí pide motivo y queda en la bitácora. Es la misma para
 * hospitalización y observación.
 */
function MedSheet({ file, p, reload, onWriteNote, focusDose, onFocused }: { file: File; p: Patient; reload: () => void; onWriteNote: () => void; focusDose?: { medId: string; at: string }; onFocused?: () => void }) {
  const { can, staffById } = useStore()
  const [params, setParams] = useSearchParams()
  const now = useNow()
  const today = dayStart(now)
  const isToday = (d: Date) => d.getTime() === today.getTime()
  // Vista y fecha de referencia en la URL: cambiar de Día a Semana conserva la fecha y sobrevive a recargar
  const view: 'day' | 'week' = params.get('vista') === 'semana' ? 'week' : 'day'
  const fromUrl = params.get('fecha')
  const ref = fromUrl && !Number.isNaN(Date.parse(`${fromUrl}T00:00:00`)) ? dayStart(new Date(`${fromUrl}T00:00:00`)) : today
  const go = (next: { view?: 'day' | 'week'; ref?: Date }) => {
    const q = new URLSearchParams(params)
    q.set('tab', 'medicamentos')
    const v = next.view ?? view
    if (v === 'week') q.set('vista', 'semana'); else q.delete('vista')
    const r = next.ref ?? ref
    if (r.getTime() === today.getTime()) q.delete('fecha'); else q.set('fecha', localISODate(r))
    setParams(q, { replace: true })
  }
  const [marking, setMarking] = useState<{ med: InpatientMed; at?: Date; late?: boolean } | null>(null)
  const [correcting, setCorrecting] = useState<{ med: InpatientMed; dose: Dose } | null>(null)
  const [stopping, setStopping] = useState<InpatientMed | null>(null)
  const [stoppingInfusion, setStoppingInfusion] = useState<InpatientMed | null>(null)
  const [fixing, setFixing] = useState(false)
  // GE4 (ronda 9): quien registró una dosis la corrige directo en los primeros minutos (hora del servidor); se vuelve a mirar cada 5 s
  const { user: me } = useStore()
  useNow(5_000)
  const inGrace = (d?: Dose) => !!d?.graceUntil && d.givenBy === me?.id && new Date(d.graceUntil).getTime() > serverNow().getTime()
  const open = file.hospitalization.status === 'active'
  // EN2: «Registrar dosis» desde una alerta abre esa dosis (si es de un día anterior, como registro tardío)
  useEffect(() => {
    if (!focusDose) return
    const med = file.meds.find((m) => m.id === focusDose.medId)
    const at = new Date(focusDose.at)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (med && open && (can('inpatient.care') || can('inpatient.orders'))) setMarking({ med, at, late: at < dayStart(new Date()) })
    onFocused?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusDose])
  const admitted = dayStart(new Date(file.hospitalization.admittedAt))
  const last = addDays(today, AHEAD_DAYS)
  const start = view === 'week' ? weekStart(ref) : ref
  const end = addDays(start, view === 'week' ? 7 : 1)
  const shift = (n: number) => go({ ref: addDays(ref, n * (view === 'week' ? 7 : 1)) })
  const past = view === 'day' && ref < today
  const dosesOf = (m: InpatientMed) => file.doses.filter((d) => d.medId === m.id)
  const meds = [...file.meds].sort((a, b) => Number(!!a.stoppedAt) - Number(!!b.stoppedAt) || a.orderedAt.localeCompare(b.orderedAt))
    // Se ve mientras está vigente en el rango (ni suspendida ni vencida antes) o si tuvo dosis en él
    .filter((m) => new Date(m.firstAt) < end && ((!m.stoppedAt || new Date(m.stoppedAt) >= start) && courseEnd(m) > start.getTime()
      || dosesOf(m).some((d) => new Date(d.givenAt) >= start && new Date(d.givenAt) < end)))
  // Enfermería registra las dosis; el médico también puede hacerlo cuando él la aplica
  const care = (can('inpatient.care') || can('inpatient.orders')) && open
  // ME10 (ronda 10): medicamentos activos marcados «No hay en la clínica (va a receta)»
  const canRx = can('chart.view') && (can('inpatient.care') || can('inpatient.orders'))
  const buyMeds = file.meds.filter((m) => m.buyOutside && !m.stoppedAt)
  const [printingRx, setPrintingRx] = useState(false)
  const by = (id: string) => { const s = staffById(id); return s ? `${shortStaff(s.name)}, ${ROLE_LABEL[mainRole(s)].toLowerCase()}` : '' }
  const doseTitle = (dose: Dose) => `${DOSE_LABEL[dose.status]}${givenLate(dose) ? ' con retraso' : ''} por ${by(dose.givenBy)}, ${dm(dose.givenAt)}${dose.note ? `: ${dose.note}` : ''}${dose.correctionReason ? `. ${dose.correctionReason.startsWith('Registro tardío') ? '' : 'Corregido: '}${dose.correctionReason} (${shortStaff(staffById(dose.correctedBy ?? '')?.name)})` : ''}`
  const label = view === 'week'
    ? `${date(start.toISOString(), { day: 'numeric', month: 'short' })} – ${date(addDays(end, -1).toISOString(), { day: 'numeric', month: 'short' })}`
    : ref.getTime() === today.getTime() ? `Hoy, ${date(ref.toISOString(), { weekday: 'short', day: 'numeric', month: 'short' })}` : date(ref.toISOString(), { weekday: 'long', day: 'numeric', month: 'short' })

  return (
    <section className="panel" data-tour="hoja-medicamentos">
      <div className="panel__head medsheet__head">
        <div><h2>Hoja de medicamentos</h2><p>Se llena sola con lo que el médico indica en sus notas. {care ? 'Toca una hora para registrar la dosis; queda con tu nombre y tu rol.' : 'Enfermería registra cada dosis.'}</p>
          {/* ME10 (ronda 10): la receta de lo que no hay en la clínica (médico y enfermería; la marca solo la pone el médico) */}
          {/* ME12 (ronda 11): el médico genera la receta con cualquier medicamento activo; enfermería imprime los marcados */}
          {canRx && (can('inpatient.orders') ? file.meds.some((m) => !m.stoppedAt) : buyMeds.length > 0) && <button className="btn btn--soft btn--sm" style={{ marginTop: 8 }} onClick={() => setPrintingRx(true)}><Printer size={15} />{can('inpatient.orders') ? 'Generar receta' : 'Imprimir receta'}</button>}</div>
        <div className="medsheet__nav">
          <div className="segmented" role="radiogroup" aria-label="Vista">
            <button role="radio" aria-checked={view === 'day'} onClick={() => go({ view: 'day' })}>Día</button>
            <button role="radio" aria-checked={view === 'week'} onClick={() => go({ view: 'week' })}>Semana</button>
          </div>
          <div className="day-nav">
            <button className="icon-btn" aria-label={view === 'week' ? 'Semana anterior' : 'Día anterior'} disabled={start <= admitted} onClick={() => shift(-1)}><ChevronLeft size={18} /></button>
            <b className={ref.getTime() === today.getTime() || (view === 'week' && today >= start && today < end) ? 'is-today' : ''}>{label}</b>
            <button className="icon-btn" aria-label={view === 'week' ? 'Semana siguiente' : 'Día siguiente'} disabled={addDays(start, view === 'week' ? 7 : 1) > last} onClick={() => shift(1)}><ChevronRight size={18} /></button>
          </div>
          <button className="btn btn--soft btn--sm" disabled={ref.getTime() === today.getTime()} onClick={() => go({ ref: today })}>Hoy</button>
        </div>
      </div>
      {past && (
        <div className="alert-strip alert-strip--calm medsheet__past wrap">
          <span>Día pasado: se muestra lo que se registró, en modo lectura.{fixing ? ' Toca una hora para registrarla tarde o una dosis para corregirla; pide motivo y queda en la bitácora.' : ''}</span>
          {care && <button className="btn btn--ghost btn--sm" onClick={() => setFixing(!fixing)}>{fixing ? 'Terminar' : 'Corregir registros'}</button>}
        </div>
      )}
      {!meds.length ? (
        <div className="empty">
          No hay medicamentos indicados para {view === 'week' ? 'esta semana' : 'este día'}.
          {can('inpatient.orders') && open && <> <button className="linklike" onClick={onWriteNote}>Escribe una nota con indicaciones</button>.</>}
        </div>
      ) : view === 'week' ? (
        <WeekGrid meds={meds} start={start} today={today} admitted={admitted} dosesOf={dosesOf} by={by} doseTitle={doseTitle} onDay={(d) => go({ view: 'day', ref: d })} />
      ) : (
        <div className="medsheet">
          {meds.map((m) => {
            const slots = doseTimes(m, start, end)
            const doses = dosesOf(m)
            const prnToday = doses.filter((d) => !d.scheduledAt && new Date(d.givenAt) >= start && new Date(d.givenAt) < end)
            const conflict = allergyConflict(p.allergies, m.drug)
            // ME1 (ronda 8): una infusión tiene un solo evento, su inicio; ya iniciada, la fila dice desde cuándo y a qué velocidad
            const started = m.infusionRate ? doses.filter((d) => d.status === 'given').sort((x, y) => x.givenAt.localeCompare(y.givenAt))[0] : undefined
            const running = !!started && new Date(started.givenAt) < end
            return (
              <div key={m.id} className={`med ${m.stoppedAt ? 'med--stopped' : ''}`}>
                <div className="med__head">
                  <div>
                    <strong>{medLabel(m)}{m.buyOutside && <span className="badge badge--amber rx-tag" title={`No hay en la clínica: va a receta${m.buyQuantity ? ` (comprar ${m.buyQuantity})` : ''}`}>Receta</span>}</strong>
                    <span className="muted">{m.presentation ? `${m.presentation}. ` : ''}{m.instructions ? `${m.instructions} ` : ''}{medOrigin(m, file, staffById(m.orderedBy)?.name)}</span>
                    {m.stoppedAt
                      ? <span className="muted">{m.stopReason === 'Egreso' ? 'Terminó con el egreso' : `Suspendido por ${shortStaff(staffById(m.stoppedBy ?? '')?.name)} ${dm(m.stoppedAt)}${m.stopReason ? `: ${m.stopReason}` : ''}`}</span>
                      : <span className="muted"><b>{treatmentDay(m, start)}</b></span>}
                    {conflict && <span className="badge badge--red"><TriangleAlert size={12} />Alergia a {conflict}</span>}
                  </div>
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {m.stoppedAt ? <span className="badge badge--red">{m.stopReason?.startsWith('Cambiado') ? 'Modificado' : 'Suspendido'} {dateTime(m.stoppedAt)}</span>
                      : courseDone(m, now) ? <span className="badge">Completado</span> : <span className="badge badge--mint">Activo</span>}
                    {!m.stoppedAt && !courseDone(m, now) && open && can('inpatient.orders') && <button className="btn btn--ghost btn--sm" onClick={() => setStopping(m)}>Suspender</button>}
                  </span>
                </div>
                <div className="slots">
                  {/* OB1 (ronda 5): las dosis atrasadas de días anteriores se ven (y se registran) desde el día de hoy */}
                  {isToday(ref) && doseTimes(m, new Date(m.firstAt), start)
                    .filter((s) => slotState(s.at, s.omitted, doses.find((d) => d.scheduledAt && new Date(d.scheduledAt).getTime() === s.at.getTime()), undefined, m.everyHours) === 'late')
                    .map((s) => (
                      <button key={s.at.toISOString()} className="slot2 slot2--late slot2--prev" disabled={!care} onClick={() => setMarking({ med: m, at: s.at, late: true })}
                        title={`Dosis atrasada del ${date(s.at.toISOString())} a las ${time(s.at.toISOString())}`}>
                        <b>{time(s.at.toISOString())}</b>
                        <small>{date(s.at.toISOString(), { day: '2-digit', month: '2-digit' })} · Atrasado</small>
                      </button>
                    ))}
                  {running && (
                    <span className="infusion-run">
                      {m.infusionStoppedAt
                        ? <>Infusión suspendida el {dmyTime(m.infusionStoppedAt)} por {by(m.infusionStoppedBy ?? '')}{m.infusionStopNote ? `: ${m.infusionStopNote}` : ''}. Estuvo desde {dmyTime(started!.givenAt)} · {formatRate(m.infusionRate!)} {infusionUnitLabel(m.infusionUnit)}.</>
                        : <><b>En infusión desde {time(started!.givenAt)} · {formatRate(m.infusionRate!)} {infusionUnitLabel(m.infusionUnit)}</b>{new Date(started!.givenAt) < start ? ` (desde el ${dmyTime(started!.givenAt)})` : ''} · inició {by(started!.givenBy)}</>}
                      {care && !m.infusionStoppedAt && !m.stoppedAt && isToday(ref) && <button className="btn btn--ghost btn--sm" onClick={() => setStoppingInfusion(m)}>Suspender infusión</button>}
                    </span>
                  )}
                  {!running && slots.map((s) => {
                    const dose = doses.find((d) => d.scheduledAt && new Date(d.scheduledAt).getTime() === s.at.getTime())
                    const st = slotState(s.at, s.omitted, dose, undefined, m.everyHours)
                    // Hoy se registra directo; en un día pasado sólo en "Corregir registros"; lo futuro no se toca
                    const clickable = care && !s.omitted && s.at.getTime() <= Date.now() + 30 * 60_000 && (dose ? fixing || inGrace(dose) : !past || fixing)
                    return (
                      <button key={s.at.toISOString()} className={`slot2 slot2--${st}${dose?.correctionReason ? ' slot2--fixed' : ''}`} disabled={!clickable}
                        onClick={() => (dose ? setCorrecting({ med: m, dose }) : setMarking({ med: m, at: s.at, late: past }))}
                        title={dose ? doseTitle(dose) : st === 'autoskip' ? 'No aplicada (sin registro). Cerrada automáticamente por el sistema al llegar la siguiente dosis. Todavía se puede registrar.' : STATE_LABEL[st]}>
                        <b>{time(s.at.toISOString())}</b>
                        {/* ME2 (ronda 8): la dosis inicial lleva su etiqueta y su cantidad. ME1: el evento de una infusión es su inicio */}
                        {isLoadingSlot(m, s.at) && <em className="slot2__tag">Dosis inicial · {m.loadingDose}</em>}
                        {m.infusionRate && !dose && <em className="slot2__tag">Inicio de la infusión</em>}
                        <small>{dose ? `${dose.status === 'given' ? '✓' : '✗'} ${time(dose.givenAt)}${givenLate(dose) ? ' con retraso' : ''} ${by(dose.givenBy)}` : STATE_LABEL[st]}</small>
                        {inGrace(dose) && <small className="slot2__grace">Corregir · hasta {time(dose!.graceUntil!)}</small>}
                        {dose?.version && <small className="slot2__grace">Corregida · v{dose.version}</small>}
                      </button>
                    )
                  })}
                  {m.prn && (<>
                    {/* MC2 (ronda 6): fila PRN, sin horas programadas: nunca pendiente ni atrasada. Muestra la última vez que se dio */}
                    {(() => { const lastGiven = doses.filter((d) => d.status === 'given').sort((x, y) => y.givenAt.localeCompare(x.givenAt))[0]
                      return <span className="prn-last">{lastGiven ? <>Última dosis: <b>{dm(lastGiven.givenAt)}</b> · {by(lastGiven.givenBy)}</> : 'Todavía sin dosis.'}</span> })()}
                    {prnToday.map((d) => (
                      <button key={d.id} className={`slot2 slot2--given${d.correctionReason ? ' slot2--fixed' : ''}`} disabled={!(care && (fixing || inGrace(d)))} onClick={() => setCorrecting({ med: m, dose: d })}
                        title={doseTitle(d)}><b>{time(d.givenAt)}</b><small>✓ {by(d.givenBy)}</small>
                        {inGrace(d) && <small className="slot2__grace">Corregir · hasta {time(d.graceUntil!)}</small>}</button>
                    ))}
                    {care && !m.stoppedAt && (ref.getTime() === today.getTime() || fixing) && (
                      <button className="slot2 slot2--prn" onClick={() => setMarking({ med: m, late: past })}><b><Plus size={13} /> PRN</b><small>Registrar dosis</small></button>
                    )}
                    {!prnToday.length && !(care && !m.stoppedAt && ref.getTime() === today.getTime()) && <span className="c-muted fs-md">Según necesidad. Sin dosis este día.</span>}
                  </>)}
                  {!m.prn && !slots.length && !running && <span className="c-muted fs-md">Sin dosis este día.</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}
      <div className="legend">
        {(['given', 'due', 'late', 'upcoming', 'skipped', 'omitted', 'autoskip'] as SlotState[]).map((s) => <span key={s}><i className={`slot2--${s}`} />{STATE_LABEL[s]}{s === 'autoskip' ? ': cerrada automáticamente por el sistema al llegar la siguiente dosis' : ''}</span>)}
      </div>
      {printingRx && <GenerateRxModal meds={file.meds} onClose={() => setPrintingRx(false)} />}
      {marking && <DoseModal med={marking.med} at={marking.at} late={marking.late} doses={dosesOf(marking.med)} onClose={() => setMarking(null)} onSaved={() => { setMarking(null); reload() }} />}
      {correcting && <CorrectDoseModal med={correcting.med} dose={correcting.dose} onClose={() => setCorrecting(null)} onSaved={() => { setCorrecting(null); reload() }} />}
      {stopping && <StopModal med={stopping} onClose={() => setStopping(null)} onSaved={() => { setStopping(null); reload() }} />}
      {stoppingInfusion && <StopInfusionModal med={stoppingInfusion} onClose={() => setStoppingInfusion(null)} onSaved={() => { setStoppingInfusion(null); reload() }} />}
    </section>
  )
}

/**
 * Semana: una fila por medicamento y una columna por día con lo programado y lo aplicado (quién y a qué
 * hora). En el celular se desliza de lado sin romper la página. Tocar un día abre su vista Día.
 */
function WeekGrid({ meds, start, today, admitted, dosesOf, by, doseTitle, onDay }: {
  meds: InpatientMed[]; start: Date; today: Date; admitted: Date; dosesOf: (m: InpatientMed) => Dose[]; by: (id: string) => string; doseTitle: (d: Dose) => string; onDay: (d: Date) => void
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  return (
    <div className="medweek" role="region" aria-label="Hoja de la semana" tabIndex={0}>
      <table>
        <thead><tr><th scope="col">Medicamento</th>{days.map((d) => (
          <th key={d.toISOString()} scope="col" className={`${d.getTime() === today.getTime() ? 'is-today' : ''} ${d < admitted ? 'is-before' : ''}`}>
            <button className="linklike" disabled={d < admitted} onClick={() => onDay(d)}>{date(d.toISOString(), { weekday: 'short', day: 'numeric' })}</button></th>
        ))}</tr></thead>
        <tbody>{meds.map((m) => (
          <tr key={m.id} className={m.stoppedAt ? 'is-stopped' : ''}>
            <th scope="row">{medLabel(m)}{m.stoppedAt && <small>Suspendido {dm(m.stoppedAt)}</small>}</th>
            {days.map((d) => {
              const next = addDays(d, 1)
              const doses = dosesOf(m)
              const slots = doseTimes(m, d, next)
              const prn = doses.filter((x) => !x.scheduledAt && new Date(x.givenAt) >= d && new Date(x.givenAt) < next)
              return (
                <td key={d.toISOString()} className={d.getTime() === today.getTime() ? 'is-today' : ''}>
                  {slots.map((s) => {
                    const dose = doses.find((x) => x.scheduledAt && new Date(x.scheduledAt).getTime() === s.at.getTime())
                    const st = slotState(s.at, s.omitted, dose, undefined, m.everyHours)
                    return <span key={s.at.toISOString()} className={`wk wk--${st}`} title={dose ? doseTitle(dose) : STATE_LABEL[st]}>
                      <b>{time(s.at.toISOString())}</b>{dose ? ` ${dose.status === 'given' ? '✓' : '✗'} ${time(dose.givenAt)} ${by(dose.givenBy)}` : ''}</span>
                  })}
                  {prn.map((x) => <span key={x.id} className="wk wk--given" title={doseTitle(x)}><b>PRN</b> ✓ {time(x.givenAt)} {by(x.givenBy)}</span>)}
                  {!slots.length && !prn.length && <span className="muted">—</span>}
                </td>
              )
            })}
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

/** "Indicado en nota de consulta externa, Dra. Solórzano, 22/10 17:40". */
function medOrigin(m: InpatientMed, file: File, who?: string) {
  const note = m.noteId ? file.notes.find((n) => n.id === m.noteId) : undefined
  const where = m.source === 'consultation' ? 'nota de consulta externa'
    : note ? (note.kind === 'admission' ? 'nota de ingreso' : file.hospitalization.kind === 'observation' ? 'nota de observación' : 'nota de evolución') : 'indicación médica'
  return `Indicado en ${where}, ${who ?? 'médico'}, ${dm(m.orderedAt)}.`
}

/** ME1 (ronda 8): «Suspender infusión»: la hora (ahora, por omisión), quién (queda solo) y un motivo opcional. */
function StopInfusionModal({ med, onClose, onSaved }: { med: InpatientMed; onClose: () => void; onSaved: () => void }) {
  const { stopInfusion } = useStore()
  const [when, setWhen] = useState(() => inputDateTime(new Date()))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Modal title="Suspender infusión" className="dose-modal" onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--danger" disabled={busy} onClick={async () => {
        setBusy(true)
        const ok = await stopInfusion(med.id, { at: fromLocalValue(when).toISOString(), note: note.trim() || undefined })
        setBusy(false)
        if (ok) onSaved()
      }}>Suspender infusión</button>
    </>}>
      <p>{medLabel(med)}. Queda con tu nombre, tu rol y la hora.</p>
      <div className="field"><span>Hora</span><DateTimeField value={when} max={inputDateTime(new Date())} onChange={setWhen} label="Hora en que se suspendió" /></div>
      <label className="field"><span>Motivo (opcional)</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. Se terminó la mezcla; el médico lo indicó" /></label>
    </Modal>
  )
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

function DoseModal({ med, at, late = false, doses, onClose, onSaved }: { med: InpatientMed; at?: Date; late?: boolean; doses: Dose[]; onClose: () => void; onSaved: () => void }) {
  const { recordDose } = useStore()
  // OB1 (ronda 5): Administrada (aunque sea tarde), No aplicada u Omitida; las dos últimas con motivo
  const [status, setStatus] = useState<Dose['status']>('given')
  const given = status === 'given'
  // La hora en que se abrió el diálogo: si la dosis ya iba atrasada y si es de hace más de 24 horas
  const [opened] = useState(() => Date.now())
  const old = oldSlot(opened, at)
  // En un día pasado la hora real empieza en la hora indicada
  const [when, setWhen] = useState(() => inputDateTime(late && at ? at : new Date()))
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  // Un PRN con intervalo mínimo avisa si la última dosis fue hace muy poco
  const last = med.prn ? doses.filter((d) => d.status === 'given').sort((a, b) => b.givenAt.localeCompare(a.givenAt))[0] : undefined
  const tooSoon = last && med.everyHours && Date.now() - new Date(last.givenAt).getTime() < med.everyHours * 3_600_000
  return (
    <Modal title={med.nebulization ? 'Nebulización' : medLabel(med)} className="dose-modal" steady onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className={`btn ${given ? 'btn--primary' : 'btn--danger'}`} disabled={busy || (!given && !note.trim()) || (old && reason.trim().length < 5)} onClick={async () => {
        setBusy(true)
        const ok = await recordDose(med.id, { scheduledAt: at?.toISOString(), givenAt: fromLocalValue(when).toISOString(), status, note: note.trim() || undefined, reason: old ? reason.trim() : undefined })
        setBusy(false)
        if (ok) onSaved()
      }}>{given ? (med.infusionRate ? 'Registrar inicio' : 'Registrar administración') : status === 'omitted' ? 'Registrar como omitida' : 'Registrar como no aplicada'}</button>
    </>}>
      <p>{at ? <>Dosis de las <b>{time(at.toISOString())}</b>{at.toDateString() !== new Date().toDateString() ? ` del ${date(at.toISOString())}` : ''}.
        {at.getTime() < opened - LATE_AFTER_MIN * 60_000 && <> <span className="badge badge--amber">Atrasada</span></>}</> : <>Dosis según necesidad (PRN){med.prnCondition ? `: ${med.prnCondition}` : ''}. Queda con tu nombre, tu rol y la hora real.</>}</p>
      {/* ME4 (ronda 9): una sesión de nebulización es una sola administración de todos sus componentes */}
      {med.nebulization && <div className="alert-strip alert-strip--calm" style={{ margin: 0, flexDirection: 'column', alignItems: 'flex-start' }}>
        <b>Nebulizar con:</b>
        <ul style={{ margin: 0, paddingLeft: 18 }}>{med.nebulization.components.map((c, i) => <li key={i}>{c.drug} {c.amount}</li>)}</ul>
        {med.nebulization.diluent?.trim() && <span>Diluido en {med.nebulization.diluentVolume ? `${med.nebulization.diluentVolume} de ` : ''}{med.nebulization.diluent}</span>}
      </div>}
      {/* ME2 (ronda 8): la cantidad propuesta es la de esta dosis (la inicial o las siguientes) y queda guardada en el registro */}
      {med.loadingDose && at && <p className="alert-strip alert-strip--amber m-0">{isLoadingSlot(med, at) ? 'Dosis inicial' : 'Dosis siguiente'}: <b>{doseAt(med, at)}</b></p>}
      {/* ME1: el evento de una infusión es su inicio; después la fila queda «En infusión desde…» */}
      {med.infusionRate && <p className="c-muted m-0">Registra el inicio de la infusión a {formatRate(med.infusionRate)} {infusionUnitLabel(med.infusionUnit)}.</p>}
      {tooSoon && <div className="alert-strip"><TriangleAlert size={16} />La última dosis fue a las {time(last!.givenAt)}; la indicación es cada {med.everyHours} horas.</div>}
      {at && (
        <DoseStatus value={status} onChange={(s) => { setStatus(s); setNote('') }} />
      )}
      {!given && <p className="c-muted fs-md">Con el motivo, la dosis deja de alertar y queda en la hoja como {status === 'omitted' ? 'omitida' : 'no aplicada'}.</p>}
      <div className="field"><span>{med.infusionRate && given ? 'Hora de inicio real' : 'Hora real'}</span><DateTimeField value={when} max={inputDateTime(new Date())} onChange={setWhen} label="Hora real" /></div>
      {given && at && fromLocalValue(when).getTime() - at.getTime() > LATE_AFTER_MIN * 60_000 && (
        <p className="c-muted fs-md">Queda como administrada con retraso: {elapsed(Math.round((fromLocalValue(when).getTime() - at.getTime()) / 60_000))} después de la hora indicada.</p>)}
      {!given && <SkipReasons value={note} onChange={setNote} reasons={status === 'omitted' ? OMIT_REASONS : SKIP_REASONS} />}
      <label className="field"><span>{given ? 'Observación (opcional)' : status === 'omitted' ? 'Motivo por el que se omitió' : 'Motivo por el que no se aplicó'}</span>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={given ? 'Ej. Dolor 7/10' : status === 'omitted' ? 'Ej. Suspendida por el médico' : 'Ej. Paciente en ayuno para cirugía'} /></label>
      {old && <label className="field"><span>Motivo del registro tardío (queda en la bitácora)</span>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. Se aplicó en el turno de noche y no se registró" /></label>}
    </Modal>
  )
}

/** EN2: motivos frecuentes de una dosis no aplicada, de un toque; el texto se puede completar. */
const SKIP_REASONS = ['Paciente en ayuno', 'El paciente la rechazó', 'Paciente fuera del servicio (estudio o quirófano)', 'No hay el medicamento']
/** OB1 (ronda 5): una dosis omitida es la que se decidió no dar. */
const OMIT_REASONS = ['Suspendida por el médico', 'Cambio de indicación', 'Ya no corresponde (egreso o traslado)']
function SkipReasons({ value, onChange, reasons = SKIP_REASONS }: { value: string; onChange: (v: string) => void; reasons?: string[] }) {
  return (
    <div className="chips" role="group" aria-label="Motivos frecuentes">
      {reasons.map((r) => <button key={r} type="button" className="chip chip--toggle" aria-pressed={value === r} onClick={() => onChange(r)}>{r}</button>)}
    </div>
  )
}

/** OB1 (ronda 5): Administrada, No aplicada u Omitida. */
/** EN4 (ronda 10): las tres pestañas como control segmentado a todo el ancho, iguales, de 44 px o más, con la elegida marcada. */
function DoseStatus({ value, onChange }: { value: Dose['status']; onChange: (s: Dose['status']) => void }) {
  return (
    <div className="segmented dose-tabs" role="radiogroup" aria-label="Resultado">
      {(['given', 'skipped', 'omitted'] as const).map((s) => <button key={s} type="button" role="radio" aria-checked={value === s} onClick={() => onChange(s)}>{DOSE_LABEL[s]}</button>)}
    </div>
  )
}

/** Corregir una dosis ya registrada: pide motivo; el registro anterior se guarda y queda en la bitácora. */
function CorrectDoseModal({ med, dose, onClose, onSaved }: { med: InpatientMed; dose: Dose; onClose: () => void; onSaved: () => void }) {
  const { correctDose, user } = useStore()
  // GE4 (ronda 9): en el periodo de gracia, quien la registró la corrige sin motivo obligatorio (queda como versión nueva)
  const grace = !!dose.graceUntil && dose.givenBy === user?.id && new Date(dose.graceUntil).getTime() > serverNow().getTime()
  const [status, setStatus] = useState<Dose['status']>(dose.status)
  const given = status === 'given'
  const [when, setWhen] = useState(inputDateTime(new Date(dose.givenAt)))
  const [note, setNote] = useState(dose.note ?? '')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Modal title={`Corregir: ${medLabel(med)}`} className="dose-modal" steady onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={busy || (!grace && reason.trim().length < 5) || (!given && !note.trim())} onClick={async () => {
        setBusy(true)
        const ok = await correctDose(dose.id, { status, givenAt: fromLocalValue(when).toISOString(), note: note.trim() || undefined, reason: reason.trim() || undefined, grace: grace || undefined })
        setBusy(false)
        if (ok) onSaved()
      }}>Guardar corrección</button>
    </>}>
      <p className="c-muted fs-base">Registrada como {DOSE_LABEL[dose.status].toLowerCase()} a las {time(dose.givenAt)} del {date(dose.givenAt)}. El registro anterior se conserva.{grace ? ` Corregible hasta ${time(dose.graceUntil!)}.` : ''}</p>
      <p className="m-0"><VersionTag version={dose.version} kind="dose" id={dose.id} render={(x) => <span>{DOSE_LABEL[x.status as Dose['status']] ?? String(x.status)} a las {dmyTime(String(x.givenAt))}{x.note ? `: ${String(x.note)}` : ''}</span>} /></p>
      {dose.scheduledAt && <DoseStatus value={status} onChange={setStatus} />}
      <div className="field"><span>Hora real</span><DateTimeField value={when} max={inputDateTime(new Date())} onChange={setWhen} label="Hora real" /></div>
      {!given && <SkipReasons value={note} onChange={setNote} reasons={status === 'omitted' ? OMIT_REASONS : SKIP_REASONS} />}
      <label className="field"><span>{given ? 'Observación (opcional)' : status === 'omitted' ? 'Motivo por el que se omitió' : 'Motivo por el que no se aplicó'}</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></label>
      {grace ? <CorrectionReason value={reason} onChange={setReason} />
        : <label className="field"><span>Motivo de la corrección (queda en la bitácora)</span><input className="input" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. Se anotó una hora equivocada" /></label>}
    </Modal>
  )
}

// ---------- Notas médicas ----------

const SOAP: { key: 'subjective' | 'objective' | 'assessment' | 'plan'; letter: string; label: string; hint: string }[] = [
  { key: 'subjective', letter: 'S', label: 'Subjetivo', hint: 'Lo que refiere el paciente.' },
  { key: 'objective', letter: 'O', label: 'Objetivo', hint: 'Signos vitales, examen físico y resultados.' },
  // NO3 (ronda 16): la A es el análisis (la evolución), no el diagnóstico: los diagnósticos van aparte, codificados (CIE-11)
  { key: 'assessment', letter: 'A', label: 'Análisis', hint: 'Evolución y razonamiento clínico: cómo va el paciente y por qué.' },
  { key: 'plan', letter: 'P', label: 'Plan', hint: 'Lo que piensas hacer, en texto. Las órdenes van a la derecha.' },
]

/** "22/10 18:10": la fecha corta con la hora, como se escribe en la nota en papel. */
const dm = (iso: string) => `${date(iso, { day: '2-digit', month: '2-digit' })} ${time(iso)}`

/** Una entrada de la línea de tiempo: nota médica (SOAP, procedimiento o egreso) o registro anterior de procedimiento. */
type TimelineItem = { at: string; key: string; note?: InpatientNote; legacy?: HospProcedure }

/**
 * HO1 (ronda 12): las notas de evolución, de procedimiento y postquirúrgicas se escriben abajo, dentro del expediente (no en una
 * ventana). La nota sigue abierta al cambiar de pestaña (signos, curva térmica, medicamentos, exámenes, anexos): con `show`
 * en falso solo se dibuja el editor, debajo de la pestaña que se esté viendo.
 */
function MedicalNotes({ file, p, reload, show = true, onWriting }: { file: File; p: Patient; reload: () => void; show?: boolean; onWriting?: (title: string | null) => void }) {
  const { staffById, can } = useStore()
  const notes = file.notes.filter((n) => n.kind === 'admission' || n.kind === 'evolution' || n.kind === 'discharge' || n.kind === 'procedure')
  const h = file.hospitalization
  const obs = h.kind === 'observation'
  // La nota de consulta externa que dio el ingreso es la nota de ingreso (también en observación): no se pide otra
  const hasAdmission = notes.some((n) => n.kind === 'admission') || obs || !!h.observationAt || !!h.consultationId
  const [converting, setConverting] = useState(false)
  const [referring, setReferring] = useState(false)
  const { settings } = useStore()
  const discharged = notes.some((n) => n.kind === 'discharge')
  // RF1 (ronda 8): «¿Registrar el egreso?» después de firmar una referencia abre el egreso con «Trasladado a otro centro»
  const [notesParams, setNotesParams] = useSearchParams()
  const transfer = notesParams.get('egreso') === 'traslado'
  const [writing, setWriting] = useState<null | 'note' | 'procedure' | 'postop' | 'discharge' | 'authorization'>(null)
  // Al generar la quirúrgica desde una nota, se vuelve a esa nota (su borrador sigue igual)
  const [back, setBack] = useState<null | 'procedure' | 'postop'>(null)
  const [postopSeed, setPostopSeed] = useState<Partial<PostopDraft> | undefined>()
  // EX2 (ronda 8): lote de exámenes con externos de la nota recién firmada
  const [ordersFor, setOrdersFor] = useState<{ batch?: string; rxNote?: string } | null>(null)
  const [authFor, setAuthFor] = useState<string | undefined>()
  // MC2: la quirúrgica recién generada (con sus tres salidas) y la nota de procedimiento que la pidió, para volver a ella
  const [surgicalFor, setSurgicalFor] = useState<string | null>(null)
  const [procDraft, setProcDraft] = useState<ProcDraft | undefined>()
  const nav = useNavigate()
  const open = file.hospitalization.status === 'active'
  // Los procedimientos registrados antes de las notas de procedimiento se conservan, sin estado. Las
  // autorizaciones (y las anteriores) están en Anexos.
  const timeline: TimelineItem[] = [
    // El procedimiento va en el orden de la hora en que se hizo, no de cuando se escribió la nota
    ...notes.map((n) => ({ at: n.procedure?.performedAt ?? n.at, key: n.id, note: n })),
    ...file.procedures.filter((x) => x.kind === 'procedure').map((x) => ({ at: x.createdAt, key: x.id, legacy: x })),
  ].sort((a, b) => a.at.localeCompare(b.at) || a.key.localeCompare(b.key))
  const doctor = can('inpatient.orders')
  // IM2 (ronda 12): el radiólogo (intervencionista) escribe notas de evolución, de procedimiento menor y postquirúrgicas (mayor)
  const writer = doctor || can('inpatient.notes')
  const inlineTitle = writing === 'note' ? (hasAdmission ? 'Nota de evolución' : 'Nota de ingreso') : writing === 'procedure' ? 'Nota de procedimiento' : writing === 'postop' ? 'Nota postquirúrgica' : null
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onWriting?.(inlineTitle) }, [inlineTitle])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (transfer && doctor && hasAdmission && !discharged && h.status === 'active') setWriting('discharge')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transfer])
  // NO2 (ronda 16): «?nota=ingreso» abre la nota de ingreso (formato estándar) de una estancia que no la tiene. Es la entrada para
  // HO2 (ingreso directo: al terminar el ingreso y la autorización se abre sola); el borrador se guarda como siempre
  const openAdmission = notesParams.get('nota') === 'ingreso'
  useEffect(() => {
    if (!openAdmission) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (doctor && !hasAdmission && h.status === 'active') setWriting('note')
    const q = new URLSearchParams(notesParams); q.delete('nota'); setNotesParams(q, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openAdmission])
  const editors = <>
      {writing === 'procedure' && <ProcedureNoteForm inline file={file} initial={procDraft} onClose={() => { setWriting(null); setProcDraft(undefined) }} onSaved={() => { setWriting(null); setProcDraft(undefined); reload() }}
        onAuthorize={(draft) => { setProcDraft(draft); setBack('procedure'); setAuthFor(draft.name); setWriting('authorization') }}
        onConvert={(draft) => { setProcDraft(undefined); setPostopSeed({ procedureName: draft.name, description: draft.text, startAt: draft.performedAt, endAt: draft.performedAt, urgent: draft.urgent, justification: draft.justification }); setWriting('postop') }} />}
      {writing === 'postop' && <NoteEditor inline notesOnly={!doctor} file={file} p={p} kind="evolution" variant="postop" seed={postopSeed} onClose={() => { setWriting(null); setPostopSeed(undefined) }} onSaved={(b, rx) => { setWriting(null); setPostopSeed(undefined); reload(); if (b || rx) setOrdersFor({ batch: b, rxNote: rx }) }} onStale={reload}
        onAuthorize={(name) => { setBack('postop'); setAuthFor(name || undefined); setWriting('authorization') }} />}
      {writing === 'note' && <NoteEditor inline notesOnly={!doctor} file={file} p={p} kind={hasAdmission ? 'evolution' : 'admission'} onClose={() => setWriting(null)} onSaved={(b, rx) => { setWriting(null); reload(); if (b || rx) setOrdersFor({ batch: b, rxNote: rx }) }} onStale={reload} />}
  </>
  const modals = <>
      {writing === 'authorization' && <AuthorizationForm file={file} p={p} template="surgical" initialProcedure={authFor} onClose={() => { setWriting(back); setBack(null) }}
        onCreated={(a) => { setWriting(null); setSurgicalFor(a.id) }} />}
      {surgicalFor && <ConsentChoice authorizationId={surgicalFor} p={p} onDone={() => { setSurgicalFor(null); reload(); if (back) { setWriting(back); setBack(null) } }} />}
      {ordersFor && <ExamOrdersOffer batch={ordersFor.batch} rxNote={ordersFor.rxNote} meds={file.meds} onClose={() => setOrdersFor(null)} />}
  </>
  // En otra pestaña: solo la nota que se está escribiendo, debajo de lo que se ve
  if (!show) return (<>
    {inlineTitle && <div className="hc note-dock">{editors}</div>}
    {modals}
  </>)
  return (
    <div className="hc">
      {open && (writer || can('inpatient.care')) && (
        <section className="panel">
          <div className="panel__body" style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <p className="muted">{hasAdmission ? 'Las notas quedan en orden, de la más antigua a la más reciente. Procedimientos, notas postquirúrgicas y egreso también son notas de evolución.' : 'Lo primero es la nota de ingreso, con las indicaciones de medicamentos.'}</p>
            <div className="hstack">
              {(doctor || (writer && hasAdmission)) && <button className="btn btn--primary" data-tour="nueva-evolucion" onClick={() => setWriting('note')}><NotebookPen size={16} />{hasAdmission ? 'Nueva nota de evolución' : 'Escribir nota de ingreso'}</button>}
              {writer && <button className="btn btn--primary" onClick={() => setWriting('procedure')}><Syringe size={16} />{doctor ? 'Procedimiento' : 'Procedimiento menor'}</button>}
              {(doctor || can('inpatient.care')) && <button className={`btn ${doctor ? 'btn--primary' : 'btn--soft'}`} onClick={() => { setAuthFor(undefined); setWriting('authorization') }}><FileSignature size={16} />Autorización quirúrgica</button>}
              {/* PQ4 (ronda 16): la valoración preanestésica, antes de la cirugía */}
              <PreEvalButton stayId={file.hospitalization.id} patientId={p.id} />
              {writer && hasAdmission && <button className="btn btn--primary" onClick={() => setWriting('postop')}><NotebookPen size={16} />{doctor ? 'Nota postquirúrgica' : 'Procedimiento mayor (nota postquirúrgica)'}</button>}
              {doctor && hasAdmission && !discharged && <button className="btn btn--primary" data-tour="egreso" onClick={() => setWriting('discharge')}><LogOut size={16} />Egreso</button>}
              {doctor && obs && features(settings).hospital && <button className="btn btn--soft" onClick={() => setConverting(true)}><BedDouble size={16} />Pasar a hospitalización</button>}
              {/* Ronda 8: referencia a otro centro desde la observación y la hospitalización (antes, sólo el consultorio) */}
              {doctor && <button className="btn btn--soft" onClick={() => setReferring(true)}><Send size={16} />Referencia</button>}
            </div>
          </div>
        </section>
      )}
      {can('orders.review') && <PendingOrdersPanel file={file} reload={reload} />}
      {/* MC5: la nota de egreso se escribe en la misma hoja que la epicrisis */}
      {writing === 'discharge' && <DischargeWriter file={file} p={p} initialCondition={transfer ? 'Trasladado a otro centro' : undefined} onDone={() => { setWriting(null); reload(); if (transfer) { const q = new URLSearchParams(notesParams); q.delete('egreso'); setNotesParams(q, { replace: true }) } }} />}
      {referring && <ReferralModal from={{ kind: 'stay', id: h.id }} stayKind={h.kind === 'observation' ? 'observation' : 'hospital'} onClose={() => { setReferring(false); reload() }} />}
      {converting && <ConvertModal file={file} p={p} onClose={() => setConverting(false)} onDone={() => nav(`/app/hospitalizados/${h.id}?firmar=1`)} />}
      {h.consultationId && <ConsultEntry consultationId={h.consultationId} file={file} />}
      {timeline.length ? timeline.map((item) => {
        if (item.legacy) {
          const x = item.legacy
          return (
            <article key={x.id} className="panel consult-entry">
              <div className="panel__head">
                <div><h2>Procedimiento <span className="badge">Registro anterior</span></h2>
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
        if (n.kind === 'discharge') return n.discharge ? <DischargeView key={n.id} note={n} file={file} reload={reload} /> : null
        if (n.kind === 'procedure') return <ProcedureNote key={n.id} n={n} file={file} reload={reload} />
        return <SoapNote key={n.id} n={n} file={file} reload={reload} />
      }) : !h.consultationId && <section className="panel"><div className="empty">Todavía no hay notas de evolución.</div></section>}
      {editors}
      {modals}
    </div>
  )
}

/** Observación → hospitalización: se elige la cama y se completan los datos del acompañante. Todo lo demás se conserva. */
function ConvertModal({ file, p, onClose, onDone }: { file: File; p: Patient; onClose: () => void; onDone: () => void }) {
  const { convertToHospital, user } = useStore()
  const [f, setF] = useState({ bedId: '', specialty: defaultSpecialty(user), companionName: p.emergencyName ?? '', companionRelation: p.emergencyRelation ?? '', companionPhone: p.emergencyPhone ?? '', patientPhone: file.hospitalization.patientPhone ?? p.phone })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  return (
    <Modal title="Pasar a hospitalización" onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!f.bedId || busy} onClick={async () => {
        setBusy(true)
        const r = await convertToHospital(file.hospitalization.id, { bedId: f.bedId, specialty: f.specialty.trim() || undefined, companionName: f.companionName.trim() || undefined, companionRelation: f.companionRelation.trim() || undefined,
          companionPhone: f.companionPhone.trim() || undefined, patientPhone: f.patientPhone.trim() || undefined })
        setBusy(false)
        if (r) onDone()
      }}><BedDouble size={16} />Hospitalizar</button>
    </>}>
      <p className="c-muted fs-base">Las notas, los medicamentos, los laboratorios y las autorizaciones de la observación pasan al expediente de hospitalización, en orden y con su autoría.</p>
      <BedFields bedId={f.bedId} specialty={f.specialty} onChange={(v) => setF({ ...f, ...v })} />
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
 * izquierda el texto clínico y a la derecha las indicaciones numeradas y, debajo, los medicamentos. En las notas
 * con checklist, enfermería marca cada orden y queda su nombre y la hora junto a ella. En celular se apilan.
 */
function SoapNote({ n, file, reload }: { n: InpatientNote; file: File; reload: () => void }) {
  const { staffById, can, user, patient } = useStore()
  const { meds, indications } = splitOrders(n, file)
  const author = staffById(n.authorId)
  // GE4 (ronda 9): corregir en el periodo de gracia; si vence con la ventana abierta, lo escrito pasa a una adenda
  const [correcting, setCorrecting] = useState(false)
  const [toAddendum, setToAddendum] = useState<string | undefined>()
  const [ordersFor, setOrdersFor] = useState<{ batch?: string; rxNote?: string } | null>(null)
  const p = patient(file.hospitalization.patientId)
  return (
    <article className="panel consult-entry">
      <div className="panel__head">
        <div><h2>{n.kind === 'admission' ? 'Nota de ingreso' : n.format === 'postop' ? 'Nota postquirúrgica' : 'Nota de evolución'}</h2>
          <p>{author?.name}{author ? `, ${ROLE_LABEL[mainRole(author)].toLowerCase()}` : ''} · {date(n.at, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, {time(n.at)}</p></div>
      </div>
      <div className="panel__body">
        <NoteColumns left={<NoteText n={n} vitals={n.vitalsId ? file.vitals.find((v) => v.id === n.vitalsId) : undefined} />}
          indications={<>{n.vitals && <p className="note-vitals-line">{vitalsModeText(n.vitals)}<LineTag tag={n.vitals.tag} /></p>}
            {/* IE1 (ronda 16) */}
            {n.fluids && <p className="note-vitals-line"><span className={n.fluids.tag === 'omitted' ? 'struck' : ''}>{fluidsOrderText(n.fluids.mode)}</span><LineTag tag={n.fluids.tag} /></p>}
            {indications.length ? <OrderChecklist n={n} orders={indications} file={file} reload={reload} /> : !n.vitals && <p className="muted">Sin indicaciones.</p>}</>}
          exams={<NoteExams list={(file.exams ?? []).filter((e) => e.noteId === n.id)} />}
          meds={meds.length ? <>{<OrderChecklist n={n} orders={meds} file={file} reload={reload} pill />}<RxFromNote meds={file.meds.filter((m) => m.noteId === n.id)} /></> : <p className="muted">Sin medicamentos.</p>} />
        <div className="signed-row">
          <SignedBadge by={author?.name} at={n.at} addenda={(file.addenda ?? []).filter((a) => a.targetId === n.id).length} />
          <VersionTag version={n.version} kind="note" id={n.id} render={(x) => <VersionNote n={n} x={x} />} />
          <GraceButton record={n} authorId={n.authorId} onCorrect={() => setCorrecting(true)} />
        </div>
        <Addenda list={file.addenda ?? []} targetKind="note" targetId={n.id} canAdd={can('inpatient.orders') && user?.role === 'doctor'} onAdded={reload} openWith={toAddendum} />
        {/* PQ3 (ronda 14): hoja de anestesia de la nota postquirúrgica */}
        {n.format === 'postop' && <AnesthesiaCard note={n} />}
        {/* PQ5 (ronda 16): recuento quirúrgico */}
        {n.format === 'postop' && <SurgicalCountCard note={n} />}
      </div>
      {correcting && p && <NoteEditor file={file} p={p} kind={n.kind === 'admission' ? 'admission' : 'evolution'} variant={n.format === 'postop' ? 'postop' : undefined} correct={n}
        onClose={() => setCorrecting(false)} onSaved={(b, rx) => { setCorrecting(false); reload(); if (b || rx) setOrdersFor({ batch: b, rxNote: rx }) }} onExpired={(t) => { setCorrecting(false); setToAddendum(t) }} />}
      {ordersFor && <ExamOrdersOffer batch={ordersFor.batch} rxNote={ordersFor.rxNote} meds={file.meds} onClose={() => setOrdersFor(null)} />}
    </article>
  )
}

/** GE4: una versión anterior guardada ({subjective, …, data}) vuelta a la forma de la nota, para mostrarla igual. */
/** GE4: una versión anterior de la nota, con sus órdenes y exámenes como estaban. */
function VersionNote({ n, x }: { n: InpatientNote; x: Record<string, unknown> }) {
  const data = (typeof x.data === 'string' ? JSON.parse(x.data) : x.data ?? {}) as { orders?: string[] }
  const exams = (x.exams as { id: string; name: string; status: string }[] | undefined)?.filter((e) => e.status !== 'cancelled')
  return <>
    <NoteText n={{ ...n, ...noteFromVersion(n, x) }} />
    {!!data.orders?.length && <><h4>Órdenes</h4><ol className="note__list">{data.orders.map((o, i) => <li key={i}>{o}</li>)}</ol></>}
    {!!exams?.length && <><h4>Exámenes</h4><ul className="note__list">{exams.map((e) => <li key={e.id}>{e.name}</li>)}</ul></>}
  </>
}

function noteFromVersion(n: InpatientNote, x: Record<string, unknown>): Partial<InpatientNote> {
  const data = (typeof x.data === 'string' ? JSON.parse(x.data) : x.data ?? {}) as Record<string, unknown>
  return { subjective: String(x.subjective ?? ''), objective: String(x.objective ?? ''), assessment: String(x.assessment ?? ''), plan: String(x.plan ?? ''), text: String(x.text ?? ''),
    diagnoses: data.diagnoses as InpatientNote['diagnoses'], exam: data.exam as string | undefined, observations: data.observations as string | undefined, evolution: data.evolution as string | undefined,
    chiefComplaint: data.chiefComplaint as string | undefined, history: data.history as string | undefined,
    postop: n.format === 'postop' ? data.postop as InpatientNote['postop'] : undefined, procedure: n.kind === 'procedure' ? data as unknown as InpatientNote['procedure'] : undefined }
}

/**
 * Órdenes numeradas; en las notas con checklist, cada una con su casilla y la marca de enfermería. `index` es
 * la posición de la orden en la nota (la que guarda la marca); el número que se ve es el de su columna.
 */
function OrderChecklist({ n, orders, file, reload, pill = false }: { n: InpatientNote; orders: { text: string; index: number; tag?: OrderLineTag }[]; file: File; reload: () => void; pill?: boolean }) {
  const { can, staffById, reviewOrder } = useStore()
  const [undo, setUndo] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  // Mientras el servidor responde, la casilla ya se ve marcada
  const [saving, setSaving] = useState<number | null>(null)
  const canMark = can('orders.review') && n.checklist && file.hospitalization.status === 'active'
  return (
    <>
      <ol className="order-check">
        {orders.map(({ text: o, index: i, tag }, pos) => {
          const mark = n.checklist ? orderMark(file.marks, n.id, i) : undefined
          const checked = mark?.action === 'check'
          const who = mark && staffById(mark.by)
          return (
            <li key={i} className={`${checked ? 'is-checked' : n.checklist ? 'is-pending' : ''}${tag === 'omitted' || tag === 'modified' ? ' is-closed' : ''}`}>
              <span className="orders__n">{pill ? '–' : `${pos + 1}.`}</span>
              <span className="order-check__text"><span className="order-check__order">{pill && <Pill size={12} className="orders__pill" aria-hidden="true" />}<span className="order-check__txt">{o}</span>{tag && <LineTag tag={tag} />}</span>
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

/** MC7 (ronda 6): etiqueta discreta de una línea de la nota. */
export function LineTag({ tag }: { tag: OrderLineTag }) {
  return <span className={`line-tag line-tag--${tag}`}>{LINE_TAG[tag]}</span>
}

/** Para enfermería: todas las órdenes sin revisar de todas las notas, en orden de hora. */
function PendingOrdersPanel({ file, reload }: { file: File; reload: () => void }) {
  const { staffById, reviewOrder } = useStore()
  const [saving, setSaving] = useState(false)
  const pending = pendingOrdersOf(file)
  if (file.hospitalization.status !== 'active') return null
  return (
    <section className={`panel ${pending.length ? 'pending-orders' : ''}`} data-tour="checklist">
      <div className="panel__head"><div><h2>Órdenes por revisar <span className="num faint">{pending.length}</span></h2>
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
function ProcedureNote({ n, file, reload }: { n: InpatientNote; file: File; reload: () => void }) {
  const { staffById, can, user } = useStore()
  const [correcting, setCorrecting] = useState(false)
  const [toAddendum, setToAddendum] = useState<string | undefined>()
  const x = n.procedure!
  const auth = x.authorizationId ? file.authorizations.find((a) => a.id === x.authorizationId) : undefined
  const legacy = x.authorizationId && !auth ? file.procedures.find((a) => a.id === x.authorizationId) : undefined
  const signedAt = auth?.status === 'signed' || legacy ? auth?.statusAt ?? legacy?.updatedAt ?? legacy?.createdAt : undefined
  // Cómo se firmó: en pantalla o en papel (las de antes, con hoja subida, son en papel)
  const how = auth ? (auth.method === 'virtual' ? ' (virtual)' : ' (papel)') : ''
  return (
    <article className="panel consult-entry">
      <div className="panel__head">
        <div><h2>Nota de procedimiento <span className="badge badge--ink">{x.major ? 'Procedimiento mayor' : x.major === false ? 'Procedimiento menor' : 'Procedimiento'}</span></h2>
          <p>Procedimiento: <b>{dm(x.performedAt)}</b> · Nota escrita: {dm(n.at)} · {staffById(n.authorId)?.name}</p></div>
      </div>
      <div className="panel__body note">
        <div className="note__sec"><h4>{x.name}</h4><p>{n.text}</p></div>
        {x.urgent && <p className="badge badge--amber" style={{ whiteSpace: 'normal' }}>Urgencia, sin autorización previa: {x.justification}</p>}
        {signedAt && <p className="badge badge--mint" style={{ whiteSpace: 'normal' }}>Autorización firmada ✓{how} {dm(signedAt)}</p>}
        {auth && auth.status !== 'signed' && <p className="badge badge--red" style={{ whiteSpace: 'normal' }}>Autorización {auth.status === 'revoked' ? 'revocada' : auth.status === 'refused' ? 'rechazada' : 'pendiente'}{auth.statusAt ? ` ${dm(auth.statusAt)}` : ''}</p>}
        <div className="signed-row">
          <SignedBadge by={staffById(n.authorId)?.name} at={n.at} addenda={(file.addenda ?? []).filter((a) => a.targetId === n.id).length} />
          <VersionTag version={n.version} kind="note" id={n.id} render={(v) => { const d = (v.data ?? {}) as { name?: string; performedAt?: string }; return <div className="note__sec"><h4>{d.name}</h4><p className="muted">{d.performedAt ? dm(d.performedAt) : ''}</p><p>{String(v.text ?? '')}</p></div> }} />
          <GraceButton record={n} authorId={n.authorId} onCorrect={() => setCorrecting(true)} />
        </div>
        <Addenda list={file.addenda ?? []} targetKind="note" targetId={n.id} canAdd={can('inpatient.orders') && user?.role === 'doctor'} onAdded={reload} openWith={toAddendum} />
      </div>
      {correcting && <TextCorrection n={n} procedure onClose={() => setCorrecting(false)} onSaved={() => { setCorrecting(false); reload() }} onExpired={(t) => { setCorrecting(false); setToAddendum(t) }} />}
    </article>
  )
}

/**
 * GE4 (ronda 9): corregir una nota de procedimiento o de enfermería en el periodo de gracia: el mismo formulario, ya
 * llenado, con «Guardar corrección». Si vence con la ventana abierta, lo escrito no se pierde y se ofrece la adenda.
 */
function TextCorrection({ n, procedure, onClose, onSaved, onExpired }: { n: InpatientNote; procedure?: boolean; onClose: () => void; onSaved: () => void; onExpired: (text: string) => void }) {
  const { notify } = useStore()
  const now = useNow()
  const [f, setF] = useState(() => ({ name: n.procedure?.name ?? '', performedAt: n.procedure ? inputDateTime(new Date(n.procedure.performedAt)) : '', text: n.text ?? '' }))
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const [expired, setExpired] = useState(false)
  const draft = useDraftSync(procedure ? 'procedimiento' : 'enfermeria', `correct:${n.id}`, f, setF, false)
  const ok = procedure ? f.name.trim().length >= 3 && f.text.trim().length >= 10 : f.text.trim().length >= 3
  return (
    <Modal title={`Corregir: ${procedure ? 'Nota de procedimiento' : 'Nota de enfermería'}`} wide className="note-modal" onClose={onClose} footer={<>
      {expired ? <span className="field__msg field__msg--error mr-auto" role="alert">{GRACE_EXPIRED_TEXT}
        <button type="button" className="btn btn--soft btn--sm ml-sm" onClick={() => { draft.clear(); onExpired(f.text.trim()) }}>Pasar a una adenda</button></span>
        : <span className="mr-auto"><CorrectionReason value={why} onChange={setWhy} /></span>}
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!ok || busy || expired} onClick={async () => {
        setBusy(true)
        try {
          await api(`/inpatient/notes/${n.id}/correct`, { body: { version: n.version ?? 1, reason: why.trim() || undefined, text: f.text.trim(),
            ...(procedure ? { name: f.name.trim(), performedAt: fromLocalValue(f.performedAt).toISOString() } : {}) } })
          draft.clear(); notify('Corrección guardada'); onSaved()
        } catch (e) {
          if (e instanceof ApiError && e.status === 409 && /minutos/.test(e.message)) setExpired(true)
          else notify(e instanceof Error ? e.message : 'No se pudo guardar la corrección.', 'error')
        } finally { setBusy(false) }
      }}>Guardar corrección</button>
    </>}>
      {procedure && <div className="form-grid">
        <label className="field"><span>Procedimiento realizado</span><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="field"><span>Fecha y hora del procedimiento</span>
          <DateTimeField value={f.performedAt} max={inputDateTime(now)} onChange={(v) => setF({ ...f, performedAt: v })} label="Fecha y hora del procedimiento" /></label>
      </div>}
      <label className="field"><span>{procedure ? 'Nota' : 'Nota de enfermería'}</span>
        <DictateField label="Nota" onText={(g) => setF((x) => ({ ...x, text: g(x.text) }))}><textarea className="textarea textarea--lg" value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} /></DictateField></label>
    </Modal>
  )
}

/**
 * Nota de procedimiento (MC3): cada médico escribe qué se hizo, con la fecha y hora del procedimiento (por defecto
 * ahora; se corrige si se escribe después) y un solo cuadro de texto. Es para los procedimientos menores (infiltración,
 * sutura, lavado): no piden autorización. PQ1 (ronda 9): la casilla «Procedimiento mayor» se quitó; una cirugía se escribe
 * en la «Nota postquirúrgica», que pide la autorización quirúrgica. Un borrador de antes con la casilla marcada sigue
 * pudiéndose firmar como estaba, o pasarse a la nota postquirúrgica.
 */
type ProcDraft = { name: string; performedAt: string; text: string; major: boolean; urgent: boolean; justification: string }

function ProcedureNoteForm({ file, initial, onClose, onSaved, onAuthorize, onConvert, inline = false }: { file: File; initial?: ProcDraft; onClose: () => void; onSaved: () => void; onAuthorize: (draft: ProcDraft) => void; onConvert: (draft: ProcDraft) => void; inline?: boolean }) {
  const { addProcedureNote } = useStore()
  const now = useNow()
  // Si se fue a generar la autorización quirúrgica, al volver la nota sigue como estaba
  const [f, setF] = useState<ProcDraft>(() => initial ?? { name: '', performedAt: inputDateTime(new Date()), text: '', major: false, urgent: false, justification: '' })
  const [busy, setBusy] = useState(false)
  // AN1: borrador que se guarda solo
  const draft = useDraftSync<ProcDraft>('procedimiento', file.hospitalization.id, f, (x) => { if (!initial) setF(x) }, !f.name.trim() && !f.text.trim())
  const performed = fromLocalValue(f.performedAt)
  const future = performed.getTime() > now.getTime() + 60_000
  const auths = surgicalAuths(file, performed)
  const matching = auths.find((a) => f.name.trim().length >= 3 && normalize(a.procedure).includes(normalize(f.name.trim())))
  const [authId, setAuthId] = useState<string | null>(null)
  // Sin elegir: la quirúrgica de este procedimiento o la más reciente. '' es "ninguna"
  const chosen = !f.major || authId === '' ? undefined : auths.find((a) => a.id === authId) ?? matching ?? auths[0]
  const covered = !!chosen
  const basics = f.name.trim().length >= 3 && f.performedAt && !future && f.text.trim().length >= 10
  const ready = basics && (!f.major || covered || (f.urgent && f.justification.trim().length >= 10))
  return (
    <Modal title="Nota de procedimiento" wide inline={inline} className="note-modal" onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!ready || busy} onClick={async () => {
        setBusy(true)
        const urgent = f.major && !covered && f.urgent
        const ok = await addProcedureNote(file.hospitalization.id, {
          name: f.name.trim(), performedAt: performed.toISOString(), text: f.text.trim(), major: f.major, authorizationId: chosen?.id,
          urgent, justification: urgent ? f.justification.trim() : undefined,
        })
        setBusy(false)
        if (ok) { draft.clear(); onSaved() }
      }}>Firmar nota</button>
    </>}>
      {(f.name.trim() || f.text.trim()) && <DraftBadge savedAt={draft.savedAt} restored={draft.restored} offline={draft.offline} />}
      <div className="form-grid">
        <label className="field"><span>Procedimiento realizado</span><input className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Escribe qué se hizo" /></label>
        <label className="field"><span>Fecha y hora del procedimiento</span>
          <DateTimeField value={f.performedAt} max={inputDateTime(now)} invalid={future} onChange={(v) => setF({ ...f, performedAt: v })} label="Fecha y hora del procedimiento" />
          {future && <small className="field__msg field__msg--error">No puede ser en el futuro.</small>}
          <small className="muted">Si escribes la nota después del procedimiento, corrige la hora. La hora en que escribes la nota se guarda sola.</small></label>
      </div>
      <label className="field"><span>Nota</span>
        <DictateField label="Nota del procedimiento" onText={(f) => setF((x) => ({ ...x, text: f(x.text) }))}><textarea className="textarea textarea--lg" value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} placeholder="Indicación, técnica, hallazgos, complicaciones, estado del paciente al terminar." /></DictateField></label>
      {f.major ? (
        <div className="alert-strip alert-strip--calm" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <span>Este borrador se empezó como procedimiento mayor. Las cirugías ahora se escriben en la nota postquirúrgica (diagnósticos, horas, anestesia y equipo quirúrgico).</span>
          <button type="button" className="btn btn--soft btn--sm self-start" onClick={() => { draft.clear(); onConvert(f) }}>Continuar como nota postquirúrgica</button>
        </div>
      ) : <small className="muted">Para procedimientos menores: no piden autorización. Una cirugía se escribe en «Nota postquirúrgica».</small>}
      {f.major && auths.length > 0 && (
        <label className="field"><span>Autorización quirúrgica firmada (últimas 24 horas)</span>
          <select className="select" value={chosen?.id ?? ''} onChange={(e) => setAuthId(e.target.value)}>
            {auths.map((a) => <option key={a.id} value={a.id}>{a.name} · firmada {dm(a.at)}</option>)}
            <option value="">Ninguna de estas</option>
          </select></label>
      )}
      {f.major && covered && <div className="alert-strip alert-strip--calm">Autorización firmada ✓ {chosen!.name}</div>}
      {f.major && !covered && (
        <div className="alert-strip alert-strip--amber" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <span>No hay autorización quirúrgica firmada para este procedimiento.</span>
          <button type="button" className="btn btn--soft btn--sm self-start" onClick={() => onAuthorize({ ...f, name: f.name.trim() })}><FileSignature size={14} />Generar la autorización quirúrgica</button>
          <label className="check-line" style={{ background: '#fff' }}><input type="checkbox" checked={f.urgent} onChange={(e) => setF({ ...f, urgent: e.target.checked })} />
            <span><b>Urgencia, sin autorización previa</b><small>Escribe por qué no se pudo obtener antes.</small></span></label>
          {f.urgent && <textarea className="textarea textarea--sm" rows={2} value={f.justification} onChange={(e) => setF({ ...f, justification: e.target.value })} placeholder="Justificación" aria-label="Justificación de la urgencia" />}
        </div>
      )}
    </Modal>
  )
}

/** GE4 (ronda 9): las órdenes de la nota tal como se corrigen (lo que va al servidor si cambió). */
type OrdersFix = { indications: { id?: string; text: string; replaces?: string }[]; meds: { id?: string; med: NewMed }[]; keepExams: string[]; exams: ExamInput[] }
type OrderLocks = { all?: string; meds: Record<string, string>; keep: string[]; exams: Record<string, string> }

/** Cómo estaban las órdenes al firmar (o en la última versión): el punto de partida de la corrección. */
function ordersOf(n: InpatientNote, file: File): OrdersFix {
  return {
    indications: (n.lines ?? []).filter((l) => l.kind === 'ind' && l.tag === 'new').map((l) => ({ id: l.id, text: l.text, replaces: l.replaces })),
    meds: file.meds.filter((m) => m.noteId === n.id && m.stopReason !== REMOVED_IN_GRACE).map((m) => ({ id: m.id, med: { ...medToNew(m), firstAt: m.prn ? undefined : m.firstAt, loadingGivenAt: undefined } as NewMed })),
    keepExams: (file.exams ?? []).filter((e) => e.noteId === n.id && e.status !== 'cancelled').map((e) => e.id),
    exams: [],
  }
}

/**
 * GE4 (ronda 9): al corregir una nota, la columna de órdenes se corrige con lo que nadie ha cumplido: las indicaciones nuevas
 * (se cambian, se quitan o se agregan), los medicamentos que nadie registró (la hoja se actualiza) y los exámenes sin muestra
 * ni orden impresa (se cancelan). Lo cumplido o impreso sale bloqueado con su explicación; lo que bajó de la nota anterior
 * (Continúa, Omitida) queda como se firmó. Si enfermería ya revisó órdenes o ya hay otra nota, la columna no se toca.
 */
function CorrectionOrders({ n, file, p, value, onChange, locks }: { n: InpatientNote; file: File; p: Patient; value: OrdersFix; onChange: (v: OrdersFix) => void; locks?: OrderLocks }) {
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const kept = (n.lines ?? []).filter((l) => l.kind === 'ind' && l.tag !== 'new')
  const exams = (file.exams ?? []).filter((e) => e.noteId === n.id && e.status !== 'cancelled')
  const carried = (n.lines ?? []).filter((l) => l.kind === 'med' && l.tag !== 'new')
  if (!locks) return <div className="note-editor__orders"><Loading /></div>
  if (locks.all) {
    const meds = file.meds.filter((m) => m.noteId === n.id && m.stopReason !== REMOVED_IN_GRACE)
    return (
      <div className="note-editor__orders">
        <div className="alert-strip alert-strip--amber">{locks.all}</div>
        {!!n.orders?.length && <fieldset className="fs"><legend>Indicaciones</legend><ol className="note__list">{(n.orders ?? []).slice(0, n.indicationCount ?? n.orders?.length).map((o, i) => <li key={i}>{o}</li>)}</ol></fieldset>}
        {exams.length > 0 && <fieldset className="fs"><legend>Exámenes</legend><ul className="note__list">{exams.map((e) => <li key={e.id}>{e.name}</li>)}</ul></fieldset>}
        {meds.length > 0 && <fieldset className="fs"><legend>Medicamentos</legend><ul className="note__list">{meds.map((m) => <li key={m.id}>{medLabel(m)}</li>)}</ul></fieldset>}
      </div>
    )
  }
  const set = (x: Partial<OrdersFix>) => onChange({ ...value, ...x })
  const add = () => {
    const lines = text.split(/\r?\n/).map((t) => t.replace(/^\s*(\d+\s*[.)-]|[-•*])\s*/, '').trim()).filter(Boolean)
    if (lines.length) set({ indications: [...value.indications, ...lines.map((t) => ({ text: /[.!?]$/.test(t) ? t : `${t}.` }))] })
    setText('')
  }
  return (
    <div className="note-editor__orders">
      <div className="alert-strip alert-strip--calm">Lo que nadie ha cumplido se corrige aquí: la hoja de medicamentos y los exámenes se actualizan al guardar. Lo ya cumplido o impreso queda como se firmó.</div>
      <fieldset className="fs"><legend>Indicaciones</legend>
        {kept.length > 0 && <ol className="note__list">{kept.map((l) => <li key={l.id}><span className={l.tag === 'omitted' ? 'struck' : ''}>{l.text}</span><LineTag tag={l.tag} /></li>)}</ol>}
        {value.indications.length > 0 && <ol className="orders">{value.indications.map((o, i) => (
          <li key={o.id ?? `new-${i}`}><span className="orders__n">{kept.length + i + 1}.</span>
            <input className={`input${hasBlank(o.text) ? ' input--blank' : ''}`} value={o.text} aria-label={`Indicación ${kept.length + i + 1}`}
              onChange={(e) => set({ indications: value.indications.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
            <span className="orders__tools">{!o.replaces && <button type="button" className="icon-btn" aria-label="Quitar indicación" onClick={() => set({ indications: value.indications.filter((_, j) => j !== i) })}><X size={14} /></button>}</span></li>
        ))}</ol>}
        <div className="order-add">
          <textarea className="textarea textarea--sm" rows={2} value={text} aria-label="Nueva indicación" placeholder="Escribe una indicación y presiona Enter"
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); add() } }} />
          <button className="btn btn--soft" disabled={!text.trim()} type="button" onClick={add} aria-label="Agregar indicación"><Plus size={16} /></button>
        </div>
      </fieldset>
      <fieldset className="fs"><legend>Exámenes</legend>
        {exams.length > 0 && <ul className="note__list">{exams.map((e) => {
          const on = value.keepExams.includes(e.id)
          return <li key={e.id}>
            <span className={on ? '' : 'struck'}>{e.name}</span>
            {locks.exams[e.id] ? <div className="locked-line">{locks.exams[e.id]}</div>
              : <button type="button" className="btn btn--ghost btn--sm ml-sm" onClick={() => set({ keepExams: on ? value.keepExams.filter((x) => x !== e.id) : [...value.keepExams, e.id] })}>{on ? 'Quitar' : 'Deshacer'}</button>}
          </li>
        })}</ul>}
        <ExamsBlock value={value.exams} onChange={(v) => set({ exams: v })} inStay />
      </fieldset>
      <fieldset className="fs note-editor__meds"><legend>Medicamentos</legend>
        {carried.length > 0 && <ul className="note__list">{carried.map((l) => <li key={l.id}><span className={l.tag === 'continue' ? '' : 'struck'}>{l.text}</span><LineTag tag={l.tag} /></li>)}</ul>}
        {value.meds.length > 0 && <ol className="orders">{value.meds.map((x, i) => {
          const lock = x.id ? locks.meds[x.id] : undefined
          return <li key={x.id ?? `new-${i}`}><span className="orders__n">–</span>
            <span className="orders__text"><Pill size={13} className="orders__pill" />{medLabel(x.med)}{x.med.days ? ` por ${x.med.days} días` : ''}{x.med.instructions ? `. ${x.med.instructions}` : ''}
              {lock && <div className="locked-line">{lock}</div>}</span>
            {!lock && <span className="orders__tools">
              <button type="button" className="icon-btn" aria-label={`Editar ${x.med.drug}`} onClick={() => { setEditing(i); setAdding(false) }}><Pencil size={14} /></button>
              {!(x.id && locks.keep.includes(x.id)) && <button type="button" className="icon-btn" aria-label={`Quitar ${x.med.drug}`} onClick={() => { set({ meds: value.meds.filter((_, j) => j !== i) }); setEditing(null) }}><X size={14} /></button>}
            </span>}</li>
        })}</ol>}
        {editing !== null && value.meds[editing] ? <MedicationForm kind="stay" key={`fix-${editing}`} patient={p} current={value.meds.filter((_, j) => j !== editing).map((x) => x.med)} initial={editInitial(value.meds[editing].med)}
            onSave={(m) => { set({ meds: value.meds.map((x, j) => (j === editing ? { ...x, med: { ...m, replacesId: x.med.replacesId } } : x)) }); setEditing(null) }} onCancel={() => setEditing(null)} />
          : adding ? <MedicationForm kind="stay" patient={p} current={value.meds.map((x) => x.med)} onSave={(m) => { set({ meds: [...value.meds, { med: m }] }); setAdding(false) }} onCancel={() => setAdding(false)} />
          : <button className="btn btn--soft" onClick={() => setAdding(true)}><Plus size={15} />Agregar medicamento</button>}
      </fieldset>
    </div>
  )
}

function NoteEditor({ file, p, kind, onClose, onSaved, onStale, variant, onAuthorize, seed, correct, onExpired, inline = false, notesOnly = false, afterIndications }: { file: File; p: Patient; kind: 'admission' | 'evolution'; onClose: () => void; onSaved: (examBatch?: string, rxNoteId?: string) => void; onStale?: () => void
  /**
   * NO2 (ronda 16): lugar para un bloque de órdenes más, debajo de «Indicaciones» y antes de «Exámenes», en la nota de ingreso y
   * en las de evolución (IE1, «Ingestas y excretas», rama ronda16-ingreso). La consulta externa tiene el mismo lugar marcado.
   */
  afterIndications?: ReactNode
  /** HO1 (ronda 12): dentro del expediente, debajo de las notas (no en ventana), para seguir viendo las otras pestañas. */
  inline?: boolean
  /** IM2 (ronda 12): el radiólogo escribe la nota (evolución o postquirúrgica) sin indicaciones ni medicamentos. */
  notesOnly?: boolean
  /** PQ1 (ronda 9): «Nota postquirúrgica»: la misma ventana (órdenes, borrador, pie), con su columna izquierda propia. */
  variant?: 'postop'; onAuthorize?: (procedure: string) => void; seed?: Partial<PostopDraft>
  /** GE4 (ronda 9): «Corregir»: la misma ventana, ya llenada, con «Guardar corrección». `onExpired` pasa lo escrito a una adenda. */
  correct?: InpatientNote; onExpired?: (text: string) => void }) {
  const { addInpatientNote, staffById, settings } = useStore()
  const postop = variant === 'postop'
  // Una nota, un identificador: si se guarda dos veces no se duplica (ni sus medicamentos en la hoja)
  const [clientId] = useState(() => crypto.randomUUID())
  const [n, setN] = useState(() => correct ? { subjective: correct.subjective, objective: correct.objective, assessment: correct.assessment, plan: correct.plan }
    // NO3 (ronda 16): la A ya no se precarga con los diagnósticos del ingreso: van en «Diagnósticos (CIE-11)»
    : { subjective: '', objective: '', assessment: '', plan: '' })
  // Dos formatos (MC4): Estándar ('dx': diagnóstico, examen físico y observaciones) y SOAP. Empieza en el que el médico
  // eligió en Mi configuración (Estándar si no eligió); cada formato guarda su borrador mientras el modal está abierto
  const { user } = useStore()
  // NO2 (ronda 16): la nota de ingreso empieza SIEMPRE en el formato estándar de la consulta externa (la preferencia del médico
  // vale para las evoluciones); se puede cambiar a SOAP y volver sin perder lo escrito
  const [format, setFormat] = useState<'soap' | 'dx'>(() => (correct ? (correct.format === 'dx' ? 'dx' : 'soap') : kind === 'admission' ? 'dx' : user?.prefs?.noteFormat ?? 'dx'))
  const admissionStd = kind === 'admission' && format === 'dx' && !postop
  // NE4 (ronda 8): los diagnósticos vigentes bajan de la última nota firmada de la estancia (o de la impresión diagnóstica
  // del ingreso), como las órdenes; se quitan o se agregan. Estándar y SOAP usan el mismo campo. El borrador manda.
  // NO3 (ronda 16): la nota de ingreso empieza con los diagnósticos del ingreso
  const [carried, setCarried] = useState<Diagnosis[]>(() => (kind === 'evolution' ? currentDiagnoses(file) : file.hospitalization.diagnoses ?? []))
  // NO2 (ronda 16): la nota de ingreso estándar lleva además el motivo de consulta y la historia de la enfermedad actual
  const [d, setD] = useState<{ diagnoses: Diagnosis[]; evolution: string; exam: string; observations: string; chiefComplaint: string; history: string }>(() => (correct
    ? { diagnoses: correct.diagnoses ?? [], evolution: correct.evolution ?? '', exam: correct.exam ?? '', observations: correct.observations ?? '', chiefComplaint: correct.chiefComplaint ?? '', history: correct.history ?? '' }
    : { diagnoses: carried, evolution: '', exam: '', observations: '', chiefComplaint: kind === 'admission' ? file.hospitalization.reason ?? '' : '', history: '' }))
  const [why, setWhy] = useState('')
  const [expired, setExpired] = useState(false)
  // GE4: las órdenes de la nota que se corrige y qué está bloqueado (lo dice el servidor)
  const [fixStart] = useState(() => (correct ? ordersOf(correct, file) : undefined))
  const [fix, setFix] = useState(fixStart)
  const [locks, setLocks] = useState<OrderLocks | undefined>()
  useEffect(() => {
    if (!correct) return
    api<OrderLocks>(`/inpatient/notes/${correct.id}/correct`).then(setLocks).catch(() => setLocks({ all: 'No se pudo revisar qué órdenes ya se cumplieron. Corrígelas con una adenda.', meds: {}, keep: [], exams: {} }))
  }, [correct])
  const fixChanged = !!fix && !locks?.all && JSON.stringify(fix) !== JSON.stringify(fixStart)
  // GE4: si venció el plazo, lo escrito pasa a una adenda (texto plano, como se leería en la nota)
  const correctionText = () => postop ? [pq.procedureName, pq.description].filter(Boolean).join('. ')
    : format === 'soap' ? SOAP.map((x) => `${x.letter}. ${n[x.key]}`).join('\n') : [d.chiefComplaint, d.history, d.evolution, d.exam, d.observations].filter((x) => x.trim()).join('\n')
  void staffById
  const dxChanged = JSON.stringify(d.diagnoses) !== JSON.stringify(carried)
  // PQ1 y PQ2 (ronda 9): nota postquirúrgica (`postop`, arriba)
  const [pq, setPq] = useState<PostopDraft>(() => (correct?.postop ? postopDraftOf(correct) : { ...blankPostop(carried, user), ...seed }))
  const [meds, setMeds] = useState<NewMed[]>([])
  const [stop, setStop] = useState<string[]>([])
  const [adding, setAdding] = useState(kind === 'admission')
  // NO2 (ronda 16): un medicamento escrito como indicación se ofrece pasarlo a Medicamentos, como en la consulta externa
  const [addSeed, setAddSeed] = useState<NewMed | undefined>()
  const [replacing, setReplacing] = useState<string | null>(null)
  // MC7 (ronda 6): las indicaciones nuevas de esta nota; las vigentes bajan solas en «Indicaciones activas»
  const [extra, setExtra] = useState<string[]>([])
  const activeInd = activeIndications(file)
  // Qué hace el médico con cada indicación que bajó (por su identificador): sigue, se omite o se cambia
  const [decisions, setDecisions] = useState<Record<string, { action: 'omit' | 'change'; text?: string }>>({})
  const [changingInd, setChangingInd] = useState<string | null>(null)
  // La última nota firmada al abrir: si otra se firma mientras se escribe, se avisa y se recalcula sobre ella
  const lastId = chainNote(file)?.id ?? null
  const [basedOn, setBasedOn] = useState<string | null>(lastId)
  const stale = basedOn !== lastId
  // MC6 (ronda 6): frecuencia de signos vitales: la vigente (no empieza vacía); un ingreso nuevo, por turno
  const [vitalsMode, setVitalsMode] = useState<VitalsMode>(() => currentVitalsMode(file))
  // IE1 (ronda 16): «Ingestas y excretas»: la vigente baja marcada; desmarcarla la suspende
  const fluidsNow = currentFluidsMode(file.hospitalization.fluidsPlan)
  const [fluids, setFluids] = useState<FluidsChoice>(() => fluidsStart(fluidsNow))
  const fluidsDirty = fluids.on !== !!fluidsNow || (fluids.on && fluids.mode !== fluidsNow)
  // MC8 (ronda 6): signos vitales opcionales tomados por el médico (null: no se agregaron)
  const [nv, setNv] = useState<VitalsForm | null>(null)
  const [nvAt, setNvAt] = useState(() => inputDateTime(new Date()))
  const [nvChecked, setNvChecked] = useState<Set<VitalKey>>(new Set())
  const ageYears = p.birthDate ? yearsOld(p.birthDate) : undefined
  const nvFilled = !!nv && FIELDS.some((k) => nv[k].trim())
  const nvErrors = nv ? FIELDS.filter((k) => fieldIssue(k, nv, ageYears)?.level === 'error') : []
  const nvFuture = !!nv && fromLocalValue(nvAt).getTime() > Date.now() + 60_000
  // EX1: exámenes pedidos en la nota
  const [exams, setExams] = useState<ExamInput[]>([])
  const [extraText, setExtraText] = useState('')
  const [busy, setBusy] = useState(false)
  const [editingMed, setEditingMed] = useState<number | null>(null)
  const { notify } = useStore()
  const vademecum = useVademecum()
  const active = file.meds.filter((m) => !m.stoppedAt && !courseDone(m))
  // AN1: la nota se guarda sola como borrador (aquí y en el servidor) mientras se escribe
  const noteBlank = (!postop || (!pq.procedureName.trim() && !pq.description.trim() && !pq.postDiagnoses.length && !pq.anesthesia)) && !Object.values(n).some((v) => v.trim()) && !dxChanged && !d.evolution.trim() && !d.exam.trim() && !d.observations.trim() && !d.history.trim() && (kind !== 'admission' || d.chiefComplaint.trim() === (file.hospitalization.reason ?? '').trim()) && !meds.length && !stop.length && !exams.length && !extra.length && !Object.keys(decisions).length && !nvFilled && !fluidsDirty
  const draft = useDraftSync('evolucion', correct ? `${file.hospitalization.id}:correct:${correct.id}` : `${file.hospitalization.id}:${postop ? 'postop' : kind}`, { n, format, d, meds, stop, extra, exams, decisions, vitalsMode, nv, nvAt, pq, fluids }, (x) => {
    if (seed) return // viene de un borrador de procedimiento mayor: manda lo que se traía
    if (x.pq) setPq(x.pq)
    if (x.n) setN(x.n); if (x.format) setFormat(x.format); if (x.d) setD({ ...x.d, evolution: x.d.evolution ?? '', chiefComplaint: x.d.chiefComplaint ?? '', history: x.d.history ?? '' }); if (x.meds) setMeds(x.meds); if (x.stop) setStop(x.stop); if (x.extra) setExtra(x.extra); if (x.exams) setExams(x.exams); if (x.decisions) setDecisions(x.decisions); if (x.vitalsMode) setVitalsMode(x.vitalsMode); if (x.fluids) setFluids(x.fluids); if (x.nv) { setNv(x.nv); if (x.nvAt) setNvAt(x.nvAt) }
  }, noteBlank)
  const inVademecum = (drug: string) => vademecum.some((x) => normalize(x.name) === normalize(drug))
  // Huecos "___" de un set aplicado: la nota no se firma hasta llenarlos
  const blanks = [...extra.flatMap((t, i) => (hasBlank(t) ? [`la indicación ${i + 1}`] : [])), ...meds.flatMap((m) => (medHasBlank(m) ? [m.drug] : [])),
    // MC2 (ronda 6): un PRN que vino de un set sin condición
    ...meds.flatMap((m) => (m.prn && !m.prnCondition?.trim() ? [`la condición PRN de ${m.drug}`] : []))]
  // SOAP: los cuatro campos, como siempre. Estándar: algo escrito, una indicación o un medicamento.
  // MC8: un valor imposible (temperatura 90) no se acepta, como en el formulario de enfermería
  const pqAll = postopIssues(pq, file)
  // GE4: al corregir, la autorización ya quedó resuelta al firmar
  const pqCheck = correct ? { ...pqAll, missing: pqAll.missing.filter((m) => !m.startsWith('la autorización')) } : pqAll
  const fixBlank = !!fix && (fix.indications.some((x) => hasBlank(x.text)) || fix.meds.some((x) => medHasBlank(x.med)))
  // NO2 (ronda 16): la nota de ingreso estándar pide lo mismo que la consulta externa: el motivo y la impresión diagnóstica
  const admissionMissing = admissionStd ? [!d.chiefComplaint.trim() && 'el motivo de consulta', !d.diagnoses.length && 'la impresión diagnóstica'].filter((x): x is string => !!x) : []
  const ready = !blanks.length && !fixBlank && !admissionMissing.length && (postop ? !pqCheck.missing.length : !nvErrors.length && !nvFuture && (format === 'soap' ? SOAP.every((s) => n[s.key].trim())
    : (dxChanged && d.diagnoses.length > 0) || !!d.evolution.trim() || !!d.exam.trim() || !!d.observations.trim() || extra.length > 0 || meds.length > 0 || stop.length > 0 || exams.length > 0 || Object.keys(decisions).length > 0 || fluidsDirty))
  /** Un set se agrega al final: indicaciones y medicamentos (que pasan a la hoja al guardar), todo editable. */
  const applySet = (set: OrderSet) => {
    const texts = set.items.flatMap((it) => (it.text ? [it.text] : []))
    const added: NewMed[] = set.items.flatMap((it) => (it.med ? [{ ...it.med, instructions: it.med.instructions ?? '', firstAt: it.med.prn ? undefined : new Date().toISOString() }] : []))
    // EX1: los exámenes del set van a la sección Exámenes, no como texto en la columna de órdenes
    const fromSet = set.items.flatMap((it) => (it.exam ? [it.exam] : []))
    // EX8 (ronda 14): con el lugar por defecto de una estancia (lo guardado en el set no manda)
    setExams((x) => [...x, ...fromSet.filter((e) => !x.some((y) => y.name === e.name)).map((e) => ({ ...e, place: defaultPlace(e.group, true, settings) }))])
    const repeated = [
      ...texts.filter((t) => extra.some((x) => orderKey(x) === orderKey(t))),
      ...added.filter((m) => [...meds, ...active].some((x) => orderKey(medLabel(x)) === orderKey(medLabel(m)))).map((m) => medLabel(m)),
    ]
    setExtra((x) => [...x, ...texts])
    setMeds((x) => [...x, ...added])
    if (repeated.length) notify(`Ojo: ya estaba${repeated.length > 1 ? 'n' : ''} en la lista: ${repeated.map((t) => t.replace(/\.$/, '')).join('; ')}. Quita la que sobre.`, 'error')
    else notify(`Se agregaron ${set.items.length} órdenes de "${set.name}". Revísalas antes de guardar.`)
  }
  // Cada línea es una orden; se quita la numeración o viñeta con que venga pegada
  const clean = (line: string) => line.replace(/^\s*(\d+\s*[.)-]|[-•*])\s*/, '').trim()
  const addLines = (text: string) => {
    const lines = text.split(/\r?\n/).map(clean).filter(Boolean)
    if (!lines.length) return
    setExtra((x) => [...x, ...lines.map((t) => (/[.!?]$/.test(t) ? t : `${t}.`))])
    setExtraText('')
  }
  const addExtra = () => addLines(extraText)
  // MC4/EX1: un examen escrito como indicación («hemograma») se sugiere pasarlo a Exámenes, como en la consulta
  const { exams: clinicExams } = useExamCatalog()
  const examList = useMemo(() => examCatalog(clinicExams), [clinicExams])
  const typedExamHit = typedExam(extraText, examList)
  const typedDrug = extraText.trim().length >= 4 ? vademecum.find((x) => normalize(extraText).startsWith(normalize(x.name))) : undefined
  const toExam = (hit: { group: ExamInput['group']; name: string }) =>
    setExams((x) => (x.some((y) => examKey(y.name) === examKey(hit.name)) ? x : [...x, { group: hit.group, name: hit.name, priority: 'routine', place: defaultPlace(hit.group, true, settings) }]))
  const dxField = (<>
    {/* NO2 (ronda 16): en la nota de ingreso estándar se llama como en la consulta externa */}
    <DiagnosisPicker value={d.diagnoses} onChange={(v) => setD({ ...d, diagnoses: v })} label={admissionStd ? 'Impresión diagnóstica · CIE-11' : 'Diagnósticos (CIE-11)'} />
    {carried.length > 0 && !correct && <small className="muted" style={{ marginTop: -6 }}>{kind === 'admission'
      ? (dxChanged ? 'Cambiaste los diagnósticos del ingreso.' : 'Vienen del ingreso. Agrega, quita o cambia lo que haga falta.')
      : dxChanged ? 'Cambiaste los diagnósticos de la nota anterior.' : 'Vienen de la nota anterior. Agrega, quita o cambia lo que haga falta.'}</small>}
  </>)
  const vitalsBlock = correct ? null : (
            <fieldset className="fs note-vitals" key="nv"><legend>Signos vitales (opcional)</legend>
              {!nv ? <button type="button" className="btn btn--soft btn--sm self-start" onClick={() => { setNv({ ...EMPTY_VITALS }); setNvAt(inputDateTime(new Date())) }}><Plus size={15} />Agregar signos vitales</button> : (<>
                <VitalsFields v={nv} setV={setNv} checked={nvChecked} setChecked={setNvChecked} ageYears={ageYears} />
                <div className="form-grid">
                  <div className="field"><span>Hora de la toma</span>
                    <DateTimeField value={nvAt} invalid={nvFuture} onChange={setNvAt} label="Hora de la toma" />
                    {nvFuture && <small className="field__msg field__msg--error">No puede ser en el futuro.</small>}</div>
                  <span style={{ alignSelf: 'end' }}><button type="button" className="btn btn--ghost btn--sm" onClick={() => { setNv(null); setNvChecked(new Set()) }}>Quitar signos vitales</button></span>
                </div>
                {nvErrors.length > 0 && <small className="field__msg field__msg--error">Revisa {nvErrors.map((k) => VITALS[k].label.toLowerCase()).join(', ')}: el valor no es posible.</small>}
                <small className="muted">Quedan en la pestaña Signos vitales y en la curva térmica con tu nombre y origen «Nota de evolución», y cuentan como toma para enfermería.</small>
              </>)}
            </fieldset>
  )
  // Examen físico (con la «Guía por sistemas» de la consulta externa, NO2) y Observaciones: los mismos en la nota de ingreso y la evolución
  const examField = (
    <div className="field dictate-field"><span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>Examen físico
      {!d.exam.trim() && <button type="button" className="btn btn--ghost btn--sm" onClick={() => setD((x) => ({ ...x, exam: EXAM_GUIDE }))}><ClipboardList size={15} />Guía por sistemas</button>}</span>
      <AutoTextarea value={d.exam} onChange={(e) => setD({ ...d, exam: e.target.value })} aria-label="Examen físico" />
      <DictateButton label="Examen físico" onText={(f) => setD((x) => ({ ...x, exam: f(x.exam) }))} /></div>
  )
  const observationsField = (
    <label className="field dictate-field"><span>Observaciones</span>
      <AutoTextarea value={d.observations} onChange={(e) => setD({ ...d, observations: e.target.value })} />
      <DictateButton label="Observaciones" onText={(f) => setD((x) => ({ ...x, observations: f(x.observations) }))} /></label>
  )
  return (
    <Modal title={`${correct ? 'Corregir: ' : ''}${postop ? 'Nota postquirúrgica' : kind === 'admission' ? 'Nota de ingreso' : 'Nota de evolución'}`} wide inline={inline && !correct} className="note-modal" onClose={onClose}
      top={(!noteBlank || p.allergies.length > 0) && <>
        {!noteBlank && <DraftBadge savedAt={draft.savedAt} restored={draft.restored} offline={draft.offline} />}
        {p.allergies.length > 0 && <div className="alert-strip"><TriangleAlert size={16} />Alergias: {p.allergies.join(', ')}</div>}
      </>} footer={correct ? <>
      {expired ? <span className="field__msg field__msg--error mr-auto" role="alert">{GRACE_EXPIRED_TEXT}
        {onExpired && <button type="button" className="btn btn--soft btn--sm ml-sm" onClick={() => onExpired(correctionText())}>Pasar a una adenda</button>}</span>
        : <span className="mr-auto"><CorrectionReason value={why} onChange={setWhy} /></span>}
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!ready || busy || expired} onClick={async () => {
        setBusy(true)
        try {
          const body = postop ? { diagnoses: pq.postDiagnoses, postop: postopPayload(pq, pqCheck) } : format === 'soap' ? { ...n, diagnoses: d.diagnoses }
            : kind === 'admission' ? { ...d, evolution: '' } : { ...d, chiefComplaint: undefined, history: undefined }
          const orders = fixChanged && fix ? { indications: fix.indications.map(({ id, text }) => ({ id, text: text.trim() })).filter((x) => x.text), meds: fix.meds, keepExams: fix.keepExams, exams: fix.exams } : undefined
          const r = await api<{ examBatch?: string }>(`/inpatient/notes/${correct.id}/correct`, { body: { version: correct.version ?? 1, reason: why.trim() || undefined, ...body, orders } })
          draft.clear(); notify('Corrección guardada'); onSaved(r.examBatch, fixChanged && fix?.meds.some((x) => x.med.buyOutside) ? correct.id : undefined)
        } catch (e) {
          // Vencido: lo escrito queda en el borrador y se ofrece la adenda
          if (e instanceof ApiError && e.status === 409 && /minutos/.test(e.message)) setExpired(true)
          else notify(e instanceof Error ? e.message : 'No se pudo guardar la corrección.', 'error')
        } finally { setBusy(false) }
      }}>Guardar corrección</button>
    </> : <>
      {postop && pqCheck.missing.length && !blanks.length ? <span className="field__msg field__msg--warn mr-auto" role="status">Para firmar falta {pqCheck.missing.join(', ')}.</span>
        : admissionMissing.length && !blanks.length ? <span className="field__msg field__msg--warn mr-auto" role="status">Para firmar falta {admissionMissing.join(' y ')}.</span>
        : blanks.length ? <span className="field__msg field__msg--error mr-auto" role="status">Completa los espacios ___ de {blanks.join(', ')}.</span>
        : <span className="c-muted mr-auto fs-md">{meds.length ? `${meds.length} medicamento(s) nuevo(s)` : ''}{stop.length ? `${meds.length ? ', ' : ''}${stop.length} omitido(s)` : ''}</span>}
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!ready || busy || stale} onClick={async () => {
        setBusy(true)
        // MC7 (ronda 6): el servidor arma el cuadro completo (Continúa, Nueva, Modificada, Omitida) sobre la última nota firmada
        const chain = { basedOn, decisions: Object.entries(decisions).filter(([id]) => activeInd.some((a) => a.id === id)).map(([id, x]) => ({ id, ...x })) }
        const ok = await addInpatientNote(file.hospitalization.id, { kind, format: postop ? 'postop' : format, exams, ...(postop ? { subjective: '', objective: '', assessment: '', plan: '', diagnoses: pq.postDiagnoses, postop: postopPayload(pq, pqCheck) } : format === 'soap' ? { ...n, diagnoses: d.diagnoses } : { subjective: '', objective: '', assessment: '', plan: '', diagnoses: d.diagnoses, exam: d.exam.trim(), observations: d.observations.trim(),
            ...(kind === 'admission' ? { chiefComplaint: d.chiefComplaint.trim(), history: d.history.trim() } : { evolution: d.evolution.trim() }) }), meds, stopMedIds: stop, orders: extra, chain, vitals: vitalsMode, clientId, fluids: postop && !fluidsDirty ? undefined : fluidsPayload(fluids, fluidsNow),
          vitalsTaken: !postop && nvFilled ? { takenAt: fromLocalValue(nvAt).toISOString(), ...Object.fromEntries(FIELDS.map((k) => [k, vitalNumber(nv!, k)]).filter(([, x]) => x !== undefined)) } : undefined })
        setBusy(false)
        // EX2 (ronda 8): con estudios externos se ofrece el cuadro «Órdenes de exámenes: Imprimir / Descargar PDF»
        // ME10 (ronda 10): y con medicamentos «No hay en la clínica (va a receta)», también la receta
        if (ok) { draft.clear(); onSaved(ok.examBatch ?? undefined, meds.some((m) => m.buyOutside) ? ok.id : undefined) } else onStale?.()
      }}>Firmar nota</button>
    </>}>
      {/* NO2 (ronda 16): el mismo selector en la nota de ingreso y en las de evolución */}
      {!postop && !correct && (
        <div className="segmented" role="radiogroup" aria-label="Formato de la nota">
          <button type="button" role="radio" aria-checked={format === 'dx'} onClick={() => setFormat('dx')} title={kind === 'admission' ? 'El de la consulta externa: motivo, historia, examen físico, observaciones e impresión diagnóstica' : 'Diagnóstico, evolución, examen físico y observaciones'}>Estándar</button>
          <button type="button" role="radio" aria-checked={format === 'soap'} onClick={() => setFormat('soap')} title="Subjetivo, objetivo, análisis y plan">SOAP</button>
        </div>
      )}
      <div className={`note-editor${notesOnly && !correct ? ' note-editor--single' : ''}`}>
      <div className="soap-stack">
        {/* MC8 (ronda 6): opcional; si no se toca, no se guarda nada. Va antes del examen físico (en SOAP, arriba de la S: NE6) */}
        {postop && <PostopFields pq={pq} setPq={setPq} file={file} check={pqCheck} onAuthorize={onAuthorize} noAuth={!!correct} />}
        {!postop && <>
        {/* NE6 (ronda 9): en SOAP, los signos vitales van arriba, antes de «S. Subjetivo». NO3 (ronda 16): «Diagnósticos (CIE-11)»
            aparte; en la nota de ingreso, debajo de A y antes de P. NO4 (ronda 17): en la evolución, el primer bloque */}
        {format === 'soap' ? soapBlocks(kind).map((b) => {
          if (b === 'dx') return <Fragment key={b}>{dxField}</Fragment>
          if (b === 'vitals') return <Fragment key={b}>{vitalsBlock}</Fragment>
          const s = SOAP.find((x) => x.key === b)!
          return <label key={b} className="field dictate-field"><span>{s.letter}. {s.label} <small className="fw-normal">{s.hint}</small></span>
            <AutoTextarea value={n[s.key]} onChange={(e) => setN({ ...n, [s.key]: e.target.value })} />
            <DictateButton label={s.label} onText={(f) => setN((x) => ({ ...x, [s.key]: f(x[s.key]) }))} /></label>
        }) : admissionStd ? (<>
          {/* NO2 (ronda 16): la nota de ingreso con el formato estándar de la consulta externa (es una historia clínica) */}
          <label className="field"><span>Motivo de consulta</span>
            <textarea className="textarea textarea--sm" rows={2} value={d.chiefComplaint} onChange={(e) => setD({ ...d, chiefComplaint: e.target.value })} aria-label="Motivo de consulta" /></label>
          <label className="field dictate-field"><span>Historia de la enfermedad actual</span>
            <AutoTextarea value={d.history} onChange={(e) => setD({ ...d, history: e.target.value })} aria-label="Historia de la enfermedad actual"
              placeholder="Inicio, evolución, características, factores que agravan o alivian, síntomas acompañantes y tratamientos recibidos." />
            <DictateButton label="Historia de la enfermedad actual" onText={(f) => setD((x) => ({ ...x, history: f(x.history) }))} /></label>
          {vitalsBlock}
          {examField}
          {observationsField}
          {dxField}
        </>) : (<>
          {dxField}
          {/* Ronda 8: el cuadro entre el diagnóstico y el examen físico */}
          <label className="field dictate-field"><span>Evolución <small className="fw-normal">Cómo ha seguido desde la nota anterior y lo que refiere el paciente.</small></span>
            <AutoTextarea value={d.evolution} onChange={(e) => setD({ ...d, evolution: e.target.value })} />
            <DictateButton label="Evolución" onText={(f) => setD((x) => ({ ...x, evolution: f(x.evolution) }))} /></label>
          {vitalsBlock}
          {examField}
          {observationsField}
        </>)}
        </>}
      </div>
      {correct && fix ? <CorrectionOrders n={correct} file={file} p={p} value={fix} onChange={setFix} locks={locks} /> : notesOnly ? null : <div className="note-editor__orders">
      <div className="set-bar">
        <OrderSetPicker where={file.hospitalization.kind === 'observation' ? 'observation' : 'hospital'} patientId={p.id} onApply={applySet} />
        <SaveSetButton items={[...extra.map((text) => ({ text })), ...meds.map(({ drug, presentation, dose, route, everyHours, prn, prnCondition, days, instructions, infusionRate, infusionUnit }) => ({ med: { drug, presentation, dose, route, everyHours, prn, prnCondition, days, instructions: instructions || undefined, infusionRate, infusionUnit } })), ...exams.map((e) => ({ exam: e }))]} />
      </div>
      <fieldset className="fs"><legend>Indicaciones</legend>
        <VitalsFrequency value={vitalsMode} onChange={setVitalsMode} />
        {stale && <div className="alert-strip alert-strip--amber wrap" role="alert">
          <span>Otra nota se firmó mientras escribías. Las indicaciones y los medicamentos activos ya se actualizaron con ella: revísalos antes de firmar.</span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => {
            // NE4: si no tocaste los diagnósticos, se recalculan sobre la nota que se acaba de firmar
            const fresh = currentDiagnoses(file)
            if (!dxChanged) setD((x) => ({ ...x, diagnoses: fresh }))
            setCarried(fresh)
            setBasedOn(lastId)
          }}>Entendido</button></div>}
        {activeInd.length > 0 && (
          <div className="note-editor__active">
            <h4>Indicaciones activas</h4>
            <p className="c-muted fs-md">Vienen de la nota anterior y siguen vigentes. Marca OMITIR para suspender una; Cambiar la cierra y deja la nueva.</p>
            <div className="rows">
              {activeInd.map((a) => {
                const dec = decisions[a.id]
                const set = (x?: { action: 'omit' | 'change'; text?: string }) => { const next = { ...decisions }; if (x) next[a.id] = x; else delete next[a.id]; setDecisions(next) }
                return (
                  <div key={a.id} className="omit-row">
                    <span>
                      <span className={dec ? 'struck' : ''}>{a.text}</span>
                      {dec?.action === 'change' && changingInd !== a.id && <span className="omit-row__new">→ {dec.text}</span>}
                      {changingInd === a.id && <input className="input" autoFocus defaultValue={dec?.text ?? a.text} aria-label={`Cambiar «${a.text}»`}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur() } if (e.key === 'Escape') setChangingInd(null) }}
                        onBlur={(e) => { const t = e.target.value.trim(); set(t && t !== a.text ? { action: 'change', text: /[.!?]$/.test(t) ? t : `${t}.` } : undefined); setChangingInd(null) }} />}
                    </span>
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {dec?.action === 'change' ? <button type="button" className="btn btn--ghost btn--sm" onClick={() => set(undefined)}>Deshacer</button>
                        : <button type="button" className="btn btn--ghost btn--sm" disabled={dec?.action === 'omit'} onClick={() => setChangingInd(a.id)}>Cambiar</button>}
                      <label><input type="checkbox" checked={dec?.action === 'omit'} onChange={(e) => set(e.target.checked ? { action: 'omit' } : undefined)} /> OMITIR</label>
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        <p className="c-muted fs-md">{activeInd.length ? 'Indicaciones nuevas' : 'Lo que no es medicamento ni examen'}, una por línea: dieta, cuidados, signos vitales. Puedes pegar una lista completa.</p>
        {extra.length > 0 && <ol className="orders">{extra.map((o, i) => (
          <li key={i}><span className="orders__n">{i + 1}.</span>
            <input className={`input${hasBlank(o) ? ' input--blank' : ''}`} value={o} aria-label={`Indicación ${i + 1}`} aria-invalid={hasBlank(o)} onChange={(e) => setExtra(extra.map((x, j) => j === i ? e.target.value : x))} />
            <span className="orders__tools">
              {(() => { const hit = typedExam(o, examList); return hit && (
                <button type="button" className="icon-btn" aria-label={`Pasar «${hit.name}» a Exámenes`} title={`Pasar «${hit.name}» a Exámenes`}
                  onClick={() => { toExam(hit); setExtra(extra.filter((_, j) => j !== i)) }}><FlaskConical size={14} /></button>) })()}
              {/* NO2 (ronda 16): subir y bajar, como en la consulta externa */}
              <button type="button" className="icon-btn" aria-label="Subir" disabled={i === 0} onClick={() => setExtra(moveItem(extra, i, -1))}><ArrowUp size={14} /></button>
              <button type="button" className="icon-btn" aria-label="Bajar" disabled={i === extra.length - 1} onClick={() => setExtra(moveItem(extra, i, 1))}><ArrowDown size={14} /></button>
              <button type="button" className="icon-btn" aria-label="Quitar indicación" onClick={() => setExtra(extra.filter((_, j) => j !== i))}><X size={14} /></button></span></li>
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
        {typedDrug && !extraText.includes('\n') && (
          <div className="suggest-med" role="status">
            <Pill size={15} />«{typedDrug.name}» es un medicamento. ¿Agregarlo como medicamento para que pase a la hoja de medicamentos?
            <button type="button" className="btn btn--soft btn--sm" onClick={() => {
              setAddSeed({ drug: typedDrug.name, presentation: typedDrug.presentation, dose: typedDrug.usual?.dose ?? '', route: typedDrug.usual?.route ?? (/ampolla|vial|frasco|bolsa/i.test(typedDrug.presentation) ? 'Intravenosa' : 'Oral'),
                everyHours: frequencyHours(typedDrug.usual?.frequency ?? '') ?? 8, prn: false })
              setAdding(true); setEditingMed(null); setReplacing(null); setExtraText('')
            }}>Sí, agregarlo</button>
          </div>
        )}
        {typedExamHit && !typedDrug && !extraText.includes('\n') && (
          <div className="suggest-med" role="status">
            <FlaskConical size={15} />¿Agregar «{typedExamHit.name}» como examen? Así se imprime en su orden y enfermería le da seguimiento.
            <button type="button" className="btn btn--soft btn--sm" onClick={() => { toExam(typedExamHit); setExtraText('') }}>Sí, agregarlo</button>
          </div>
        )}
      </fieldset>
      {/* NO2 (ronda 16): aquí va el bloque de órdenes extra (IE1: «Ingestas y excretas»), debajo de Indicaciones y antes de Exámenes */}
      <FluidsOrder value={fluids} current={fluidsNow} onChange={setFluids} />
      {afterIndications}
      {/* MC3 (ronda 5): Indicaciones → Exámenes → Medicamentos (con los activos dentro, antes de «Agregar medicamento») */}
      <fieldset className="fs"><legend>Exámenes</legend>
        <ExamsBlock value={exams} onChange={setExams} inStay />
      </fieldset>
      <fieldset className="fs note-editor__meds"><legend>Medicamentos</legend>
        <p className="c-muted fs-md">Pasan solos a la hoja de medicamentos.</p>
        {active.length > 0 && (
          <div className="note-editor__active">
            <h4>Medicamentos activos</h4>
            <p className="c-muted fs-md">Marca OMITIR para suspender un medicamento; desde ahora la hoja de enfermería lo mostrará omitido.</p>
            <div className="rows">
              {active.map((m) => (
                <div key={m.id} className="omit-row">
                  <span className={stop.includes(m.id) || meds.some((x) => x.replacesId === m.id) ? 'struck' : ''}>{medLabel(m)}{m.buyOutside && <span className="badge badge--amber rx-tag">Receta</span>}</span>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button type="button" className="btn btn--ghost btn--sm" disabled={stop.includes(m.id) || meds.some((x) => x.replacesId === m.id)} onClick={() => { setReplacing(m.id); setAdding(false) }}>Cambiar</button>
                    <label><input type="checkbox" checked={stop.includes(m.id)} onChange={(e) => { setStop(e.target.checked ? [...stop, m.id] : stop.filter((x) => x !== m.id)); if (e.target.checked) setReplacing(null) }} /> OMITIR</label>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {meds.length > 0 && <ol className="orders">{meds.map((m, i) => (
          <li key={i} className={medHasBlank(m) ? 'orders__blank' : undefined}><span className="orders__n">–</span>
            <span className="orders__text"><Pill size={13} className="orders__pill" />{medLabel(m)}{m.days ? ` por ${m.days} días` : ''}{m.instructions ? `. ${m.instructions}` : ''}{m.quantity && !m.buyOutside ? ` · Cantidad: ${m.quantity}` : ''}
              {m.buyOutside && <span className="badge badge--amber rx-tag">Receta{m.buyQuantity ? ` · comprar ${m.buyQuantity}` : ''}</span>}
              {!inVademecum(m.drug) && <span className="badge badge--amber ml-xs">No está en el vademécum de la clínica</span>}</span>
            <span className="orders__tools">
              <button type="button" className="icon-btn" aria-label={`Editar ${m.drug}`} onClick={() => { setEditingMed(i); setAdding(false); setReplacing(null) }}><Pencil size={14} /></button>
              <button type="button" className="icon-btn" aria-label={`Quitar ${m.drug}`} onClick={() => { setMeds(meds.filter((_, j) => j !== i)); setEditingMed(null) }}><X size={14} /></button></span></li>
        ))}</ol>}
        {replacing && <p className="c-muted fs-md">La indicación nueva reemplaza a {active.find((m) => m.id === replacing)?.drug}. La nota conservará el resto de órdenes.</p>}
        {editingMed !== null && meds[editingMed] ? <MedicationForm kind="stay" key={`edit-${editingMed}`} patient={p} current={[...meds.filter((_, j) => j !== editingMed), ...active]} initial={editInitial(meds[editingMed])}
            onSave={(m) => { setMeds(meds.map((x, j) => (j === editingMed ? { ...m, replacesId: x.replacesId } : x))); setEditingMed(null) }} onCancel={() => setEditingMed(null)} />
          : replacing ? <MedicationForm kind="stay" patient={p} current={meds} initial={medToNew(active.find((m) => m.id === replacing)!, file.doses)} onSave={(m) => { setMeds([...meds, { ...m, replacesId: replacing }]); setReplacing(null) }} onCancel={() => setReplacing(null)} />
          : adding ? <MedicationForm kind="stay" key={`${meds.length}-${addSeed?.drug ?? ''}`} patient={p} current={[...meds, ...active]} initial={addSeed} onSave={(m) => { setMeds([...meds, m]); setAdding(false); setAddSeed(undefined) }} onSaveAnother={(m) => { setMeds([...meds, m]); setAddSeed(undefined) }} onCancel={() => { setAdding(false); setAddSeed(undefined) }} />
          : <button className="btn btn--soft" onClick={() => setAdding(true)}><Plus size={15} />Agregar medicamento</button>}
      </fieldset>
      </div>}
      </div>
    </Modal>
  )
}

/** NO2 (ronda 16): mueve una indicación una posición (subir o bajar). */
const moveItem = <T,>(list: T[], i: number, d: -1 | 1) => {
  const j = i + d
  if (j < 0 || j >= list.length) return list
  const next = [...list]; [next[i], next[j]] = [next[j], next[i]]
  return next
}

/** Un medicamento de la nota (p. ej. de un set) para editarlo en el formulario; sin hora, el formulario pone la actual. */
function editInitial(m: NewMed): NewMed {
  const { firstAt, ...rest } = m
  return { ...rest, instructions: m.instructions ?? '', ...(firstAt ? { firstAt: inputDateTime(new Date(firstAt)) } : {}) }
}

function medToNew(m: InpatientMed, doses: Dose[] = []): NewMed & { loadingGivenAt?: string } {
  // ME2 (ronda 8): si la dosis inicial ya se administró, «Cambiar» no la repite (sigue la de las siguientes); si no, se
  // puede editar. ME1: una infusión conserva su velocidad para cambiarla.
  const loadingGiven = m.loadingDose ? doses.find((d) => d.medId === m.id && d.status === 'given' && d.scheduledAt && new Date(d.scheduledAt).getTime() === new Date(m.firstAt).getTime()) : undefined
  const keepLoading = !!m.loadingDose && !loadingGiven
  const firstAt = keepLoading && new Date(m.firstAt) > new Date() ? new Date(m.firstAt) : new Date()
  return { drug: m.drug, presentation: m.presentation ?? '', dose: m.dose, route: m.route, everyHours: m.everyHours, prn: m.prn, prnCondition: m.prnCondition, instructions: m.instructions ?? '', firstAt: inputDateTime(firstAt), days: m.days,
    infusionRate: m.infusionRate, infusionUnit: m.infusionUnit, loadingDose: keepLoading ? m.loadingDose : undefined, loadingStat: keepLoading ? m.loadingStat : undefined,
    nebulization: m.nebulization ? structuredClone(m.nebulization) : undefined, buyOutside: m.buyOutside, buyQuantity: m.buyQuantity, quantity: m.quantity,
    loadingGivenAt: loadingGiven?.givenAt }
}

/** EX2 (ronda 8): al firmar una nota con estudios externos: «Órdenes de exámenes: Imprimir / Descargar PDF». */
function ExamOrdersOffer({ batch, rxNote, meds = [], onClose }: { batch?: string; rxNote?: string; meds?: InpatientMed[]; onClose: () => void }) {
  const nav = useNavigate()
  const { notify, can } = useStore()
  // ME12 (ronda 11): «Elegir medicamentos» abre «Generar receta» (médico)
  const [choosing, setChoosing] = useState(false)
  // ME10 (ronda 10): la receta de lo que no hay en la clínica (de esta nota), con los datos del médico que la firmó
  const rx = async (how: 'imprimir' | 'pdf') => {
    try { const { id } = await api<{ id: string }>('/print-jobs', { body: { kind: 'rx', noteId: rxNote } }); nav(`/app/impresion/${id}?accion=${how}`) } catch (x) { notify((x as Error).message, 'error') }
  }
  return (
    <Modal title={batch && rxNote ? 'Órdenes de exámenes y receta' : batch ? 'Órdenes de exámenes' : 'Receta'} onClose={onClose} footer={<button className="btn btn--ghost" onClick={onClose}>Ahora no</button>}>
      {batch && <div className="offer-row">
        <p><b>Órdenes de exámenes.</b> La nota pidió estudios externos: el paciente lleva la orden en la mano (o en el teléfono). También queda en la tarjeta de la nota y en la pestaña Exámenes, en «Órdenes impresas».</p>
        <span className="offer-row__btns">
          <button className="btn btn--primary btn--sm" onClick={() => nav(`/app/examenes/orden/${batch}?accion=imprimir`)}><Printer size={15} />Imprimir</button>
          <button className="btn btn--soft btn--sm" onClick={() => nav(`/app/examenes/orden/${batch}?accion=pdf`)}><FileText size={15} />Descargar PDF</button>
        </span>
      </div>}
      {rxNote && <div className="offer-row">
        <p><b>Receta.</b> Hay medicamentos que la clínica no tiene: siguen en la hoja y la familia los compra con esta receta. Válida solo con firma y sello del médico.</p>
        <span className="offer-row__btns">
          <button className="btn btn--primary btn--sm" onClick={() => rx('imprimir')}><Printer size={15} />Imprimir</button>
          <button className="btn btn--soft btn--sm" onClick={() => rx('pdf')}><FileText size={15} />Descargar PDF</button>
          {can('inpatient.orders') && <button className="btn btn--ghost btn--sm" onClick={() => setChoosing(true)}><Pill size={15} />Elegir medicamentos</button>}
        </span>
      </div>}
      {choosing && <GenerateRxModal meds={meds} onClose={() => setChoosing(false)} />}
    </Modal>
  )
}

// ---------- Enfermería ----------

function NursingNotes({ file, reload }: { file: File; reload: () => void }) {
  const { can, staffById, addNursingNote, user } = useStore()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  // AN1: la nota de enfermería también se guarda sola como borrador mientras se escribe
  const draft = useDraftSync<{ text: string }>('enfermeria', file.hospitalization.id, { text }, (d) => setText(d.text ?? ''), !text.trim())
  const nurse = can('inpatient.care') && user?.role !== 'doctor'
  const notes = file.notes.filter((n) => n.kind === 'nursing').sort((a, b) => b.at.localeCompare(a.at))
  const write = can('inpatient.care') && file.hospitalization.status === 'active'
  return (
    <div className="hc">
      {write && (
        <section className="panel" data-tour="nota-enfermeria">
          <div className="panel__head"><div><h2>Nueva nota de enfermería</h2><p>Se guarda con la fecha, la hora y tu nombre.</p></div>{text.trim() && <DraftBadge savedAt={draft.savedAt} restored={draft.restored} offline={draft.offline} />}</div>
          <div className="panel__body" style={{ display: 'grid', gap: 10 }}>
            <DictateField label="Nota de enfermería" onText={(f) => setText(f)}><textarea className="textarea" rows={3} value={text} onChange={(e) => setText(e.target.value)} aria-label="Nota de enfermería" placeholder="Estado del paciente, cuidados realizados, novedades del turno." /></DictateField>
            <button className="btn btn--primary self-start" disabled={text.trim().length < 3 || busy} onClick={async () => {
              setBusy(true)
              if (await addNursingNote(file.hospitalization.id, text.trim())) { setText(''); draft.clear(); reload() }
              setBusy(false)
            }}>Guardar nota</button>
          </div>
        </section>
      )}
      <section className="panel">
        {notes.length ? <div className="rows">{notes.map((n) => <NursingRow key={n.id} n={n} who={staffById(n.authorId)?.name} file={file} reload={reload}
          canAdd={file.hospitalization.status === 'active' && (nurse || (can('inpatient.orders') && user?.role === 'doctor'))} kinds={nurse ? undefined : ['info']} />)}</div>
          : <div className="empty">Sin notas de enfermería.</div>}
      </section>
    </div>
  )
}

function NursingRow({ n, who, file, reload, canAdd, kinds }: { n: InpatientNote; who?: string; file: File; reload: () => void; canAdd: boolean; kinds?: Addendum['kind'][] }) {
  const count = (file.addenda ?? []).filter((a) => a.targetId === n.id).length
  // GE4 (ronda 9)
  const [correcting, setCorrecting] = useState(false)
  const [toAddendum, setToAddendum] = useState<string | undefined>()
  return (
    <div className="nnote">
      <div className="nnote__when"><b>{date(n.at, { day: 'numeric', month: 'short' })}</b><span>{time(n.at)}</span></div>
      <div><p>{n.text}</p><small className="muted">{who}{count > 0 && <span className="badge badge--amber ml-xs">Con adenda</span>}</small>
        <div className="signed-row">
          <VersionTag version={n.version} kind="note" id={n.id} render={(v) => <p>{String(v.text ?? '')}</p>} />
          <GraceButton record={n} authorId={n.authorId} onCorrect={() => setCorrecting(true)} />
        </div>
        <Addenda list={file.addenda ?? []} targetKind="note" targetId={n.id} canAdd={canAdd} kinds={kinds} onAdded={reload} openWith={toAddendum} /></div>
      {correcting && <TextCorrection n={n} onClose={() => setCorrecting(false)} onSaved={() => { setCorrecting(false); reload() }} onExpired={(t) => { setCorrecting(false); setToAddendum(t) }} />}
    </div>
  )
}

// ---------- Anexos ----------

/**
 * Anexos del expediente: la autorización de hospitalización de la estancia y las quirúrgicas, con su estado
 * (pendiente de firma, firmada, rechazada o revocada) y la hoja firmada. Las generan enfermería o el médico.
 */
function Annexes({ file, p, reload }: { file: File; p: Patient; reload: () => void }) {
  const { can, staffById } = useStore()
  const [making, setMaking] = useState<null | 'hospital' | 'surgical'>(null)
  const [choiceFor, setChoiceFor] = useState<string | null>(null)
  const open = file.hospitalization.status === 'active'
  const write = open && (can('inpatient.orders') || can('inpatient.care'))
  const hospital = file.authorizations.find((a) => a.template === 'hospital' && (a.status === 'pending' || a.status === 'signed'))
  const legacy = file.procedures.filter((x) => x.kind === 'authorization')
  const list = [...file.authorizations].sort((a, b) => Number(b.template === 'hospital') - Number(a.template === 'hospital') || a.createdAt.localeCompare(b.createdAt))
  return (
    <div className="hc">
      {/* ME12 (ronda 11): «Generar receta» y «Recetas emitidas» */}
      {/* ME14 (ronda 14): también lo que la consulta de ingreso mandó a la receta (no está en la hoja), sin repetidos */}
      <RxAnnex patientId={p.id} stayId={file.hospitalization.id} meds={[...file.meds, ...(file.consultRxMeds ?? [])]} />
      {write && (
        <section className="panel">
          <div className="panel__body" style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <p className="muted">Se firman en pantalla (tablet, celular o computadora) o se imprimen, se firman en papel y se sube la foto o el PDF de la hoja firmada.</p>
            <div className="hstack">
              {file.hospitalization.kind === 'hospital' && <button className="btn btn--soft" onClick={() => setMaking('hospital')}><FileSignature size={16} />Autorización de hospitalización{hospital?.status === 'pending' ? ' (pendiente)' : ''}</button>}
              <button className="btn btn--primary" onClick={() => setMaking('surgical')}><FileSignature size={16} />Autorización quirúrgica</button>
            </div>
          </div>
        </section>
      )}
      {making && <AuthorizationForm file={file} p={p} template={making} onClose={() => setMaking(null)} onCreated={(a) => { setMaking(null); setChoiceFor(a.id) }} />}
      {choiceFor && <ConsentChoice authorizationId={choiceFor} p={p} onDone={() => { setChoiceFor(null); reload() }} />}
      <DischargeDocuments file={file} />
      {/* PQ3 (ronda 14): hojas de anestesia de la estancia e «Imprimir hoja de anestesia en blanco» */}
      {/* PQ4 y PQ5 (ronda 16): valoración preanestésica (de la estancia) y recuento quirúrgico */}
      <PreEvalAnnex stayId={file.hospitalization.id} />
      <AnesthesiaAnnex stayId={file.hospitalization.id} />
      <SurgicalCountAnnex stayId={file.hospitalization.id} />
      {file.referrals.map((r) => (
        <article key={r.id} className="panel consult-entry">
          <div className="panel__head"><div><h2>Referencia {r.number} {r.voidedAt ? <span className="badge badge--red">Anulada</span> : <span className="badge badge--mint">Firmada</span>}</h2>
            <p>{dateTime(r.issuedAt)}, {staffById(r.issuedBy)?.name}{r.destination ? ` · a ${r.destination}` : ''}</p></div>
            <ReferralActions r={r} /></div>
        </article>
      ))}
      {list.map((a) => <AuthorizationEntry key={a.id} a={a} file={file} p={p} reload={reload} />)}
      {legacy.map((x) => (
        <article key={x.id} className="panel consult-entry">
          <div className="panel__head"><div><h2>Autorización <span className="badge">Registro anterior</span></h2>
            <p>{dateTime(x.createdAt)}, {staffById(x.createdBy)?.name}</p></div></div>
          <div className="panel__body"><p><b>{x.name}</b></p>{x.notes && <p>{x.notes}</p>}</div>
        </article>
      ))}
      {!list.length && !legacy.length && !file.referrals.length && !file.epicrises.length && <section className="panel"><div className="empty">Sin autorizaciones todavía.</div></section>}
    </div>
  )
}

// ---------- Laboratorios ----------

// ---------- Egreso ----------


/**
 * ME10 (ronda 10), ME12 (ronda 11) y ME14 (ronda 14): «Receta» en la tarjeta de cada nota con medicamentos (consulta de
 * ingreso, evolución, procedimiento, postquirúrgica). Abre «Generar receta» (ME12) con los medicamentos DE ESA NOTA: vienen
 * marcados los que van a receta (los de la consulta que no se aplican en la clínica) y los «No hay en la clínica». Enfermería,
 * como en ME12: solo los «No hay en la clínica», con los datos del médico que los indicó.
 * ME15 (ronda 15, A3): en la nota de consulta (`all`) vienen marcados TODOS sus medicamentos; las demás notas, como ME14.
 */
function RxFromNote({ meds, all = false }: { meds: InpatientMed[]; all?: boolean }) {
  const { can } = useStore()
  const [open, setOpen] = useState(false)
  if (!(can('chart.view') && (can('inpatient.care') || can('inpatient.orders')))) return null
  const live = meds.filter((m) => !m.stoppedAt)
  const doctor = can('inpatient.orders')
  if (!live.length || (!doctor && !live.some((m) => m.buyOutside))) return null
  const forRx = live.filter((m) => (all && doctor) || m.id.startsWith('c:') || m.buyOutside).map((m) => m.id)
  return (
    <span className="note-actions no-print">
      <button type="button" className={`btn ${forRx.length ? 'btn--soft' : 'btn--ghost'} btn--sm`} onClick={() => setOpen(true)}><Pill size={14} />Receta</button>
      {open && <GenerateRxModal meds={live} only={forRx} onClose={() => setOpen(false)} />}
    </span>
  )
}

