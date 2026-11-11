import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { FileText, NotebookPen, TriangleAlert } from 'lucide-react'
import { useStore } from '../lib/store'
import { Loading } from '../components/ui'
import { PatientHeader } from '../components/PatientHeader'
import { date, dateTime, time, dxCode } from '../lib/format'
import { admissionOrdersPending, attendingText, elapsed, stayDay } from '../lib/inpatient'
import { AlertBar } from './MedAlerts'
import { TAB_PARAM, tabCounts, type AlertGo } from '../lib/alerts'
import { useFileAlerts, useNow } from '../lib/hooks'
import type { InpatientFile as File } from '../lib/types'
import { bedLabel } from './Inpatients'
import { GeneralDataModal } from './GeneralData'
import { AdmitBedStep, ConsentChoice } from './ConsentFlow'
import { ExamList } from './ExamsTab'
import { GoToNote } from '../components/GoToNote'
import { Identification } from './PatientChart'
import { VitalsSheet } from './VitalsSheet'
import { TabRow } from '../components/TabRow'
import { Annexes } from './inpatient/Annexes'
import { MedSheet } from './inpatient/MedSheet'
import { MedicalNotes } from './inpatient/MedicalNotes'
import { NursingNotes } from './inpatient/NursingNotes'

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
