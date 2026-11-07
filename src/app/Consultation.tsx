import { useEffect, useRef, useState } from 'react'
import { DictateField } from '../components/Dictate'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Activity, ArrowDown, ArrowUp, BedDouble, CalendarClock, ChevronDown, ChevronUp, ClipboardList, FlaskConical, FolderOpen, Pencil, Pill, Plus, Send, X } from 'lucide-react'
import { useStore, type FollowupInput } from '../lib/store'
import { PatientHeader } from '../components/PatientHeader'
import { date, dxCode, medicationLine, medicationOrder, missingDays, time } from '../lib/format'
import { DiagnosisPicker } from '../components/DiagnosisPicker'
import { normalize } from '../lib/patients'
import { useVademecum } from '../lib/vademecum'
import { MedicationForm, MedicationList } from '../components/Medications'
import { followupLabel } from '../lib/followups'
import { ADMIT_ORDER, yearsOld } from '../lib/inpatient'
import { EXAM_GUIDE } from '../lib/clinicalConfig'
import { features } from '../lib/permissions'
import PatientChart, { BackgroundView, useChart, VitalsGrid } from './PatientChart'
import { BackgroundForm, IdentityPrompt } from './PatientForms'
import { VitalsModal } from './WaitingRoom'
import { ReferralModal } from './Referral'
import { emptyFollowup, FollowupFields } from './Followups'
import type { Diagnosis, ExamInput, PrescriptionItem, VitalsMode } from '../lib/types'
import { VitalsFrequency } from '../components/VitalsFrequency'
import { ExamsBlock } from '../components/Exams'
import { defaultPlace, examCatalog, typedExam } from '../lib/exams'
import { useExamCatalog } from '../lib/useExamCatalog'
import type { OrderSet } from '../lib/types'
import { OrderSetPicker, SaveSetButton } from '../components/OrderSets'
import { RxValidityField } from '../components/RxValidity'
import { isPrnFrequency } from '../lib/catalogs'
import { useDraftSync } from '../lib/drafts'
import { DraftBadge } from '../components/Addenda'
import { GoToNote } from '../components/GoToNote'
import { useRxValidity } from '../lib/hooks'
import { hasBlank, medHasBlank, orderKey, rxToSetMed, setMedToRx } from '../lib/orderSets'
import { FluidsOrder, fluidsStart, type FluidsChoice } from '../components/FluidsOrder'

/**
 * Plan y manejo en dos bloques: indicaciones (dieta, cuidados, estudios, control) y medicamentos, que
 * van a la receta. Los borradores anteriores guardaban todo junto en `orders` y se convierten al abrir.
 */
interface Draft {
  reason: string; history: string; exam: string; observations: string; dx: Diagnosis[]
  indications: string[]; meds: PrescriptionItem[]; exams?: ExamInput[]
  followups: FollowupInput[]; admit: boolean; observe?: boolean
  /** MC6 (ronda 6): frecuencia de signos vitales del ingreso. */
  vitalsPlan?: VitalsMode
  /** IE1 (ronda 16): «Ingestas y excretas» con el ingreso. */
  fluids?: FluidsChoice
  orders?: { text: string; rx?: PrescriptionItem }[]
}

const PATHOLOGICAL = ['Personales patológicos', 'Hospitalarios, traumáticos y quirúrgicos', 'Heredofamiliares', 'Gineco-obstétricos']
const NON_PATHOLOGICAL = ['Personales no patológicos']
const draftKey = (id?: string) => `clinara.nota.${id}`
function loadDraft(id?: string): Partial<Draft> {
  try {
    // AN1: el borrador se guarda con su hora ({ data, savedAt }); los de antes eran el borrador solo
    const raw = JSON.parse(localStorage.getItem(draftKey(id)) ?? '{}') as Partial<Draft> & { data?: Partial<Draft>; savedAt?: string }
    const d = (raw.savedAt !== undefined && raw.data ? raw.data : raw) as Partial<Draft>
    if (d.orders && !d.indications) {
      d.indications = d.orders.filter((o) => !o.rx).map((o) => o.text)
      d.meds = d.orders.flatMap((o) => (o.rx ? [o.rx] : []))
    }
    return d
  } catch { return {} }
}




export default function Consultation() {
  const { apptId } = useParams()
  const store = useStore()
  const { appointments, patient, vitals, user, setStatus, updatePatient } = store
  const nav = useNavigate()
  const appt = appointments.find((a) => a.id === apptId)
  const p = appt && patient(appt.patientId)
  const todayVitals = vitals.find((v) => v.appointmentId === apptId)

  // El borrador se guarda en este navegador mientras se escribe, por si se cierra la pestaña
  const [saved] = useState(() => loadDraft(apptId))
  const [reason, setReason] = useState(saved.reason ?? todayVitals?.chiefComplaint ?? appt?.reason ?? '')
  const [history, setHistory] = useState(saved.history ?? '')
  const [exam, setExam] = useState(saved.exam ?? '')
  const [observations, setObservations] = useState(saved.observations ?? '')
  const [followups, setFollowups] = useState<FollowupInput[]>(saved.followups ?? [])
  const [newFollowup, setNewFollowup] = useState<FollowupInput | null>(null)
  const [admit, setAdmit] = useState(saved.admit ?? false)
  const [observe, setObserve] = useState(saved.observe ?? false)
  // RF1 (ronda 8): hoja de referencia desde la consulta en borrador
  const [referring, setReferring] = useState(false)
  // MC6 (ronda 6): con ingreso, el médico indica cada cuánto se toman los signos (por turno por defecto)
  const [vitalsPlan, setVitalsPlan] = useState<VitalsMode>(saved.vitalsPlan ?? { mode: 'shift' })
  // IE1 (ronda 16): con ingreso, «Ingestas y excretas» (por turno por defecto) activa el registro de la estancia
  const [fluids, setFluids] = useState<FluidsChoice>(saved.fluids ?? fluidsStart())
  const [dx, setDx] = useState<Diagnosis[]>(saved.dx ?? [])
  const [indications, setIndications] = useState<string[]>(saved.indications ?? [])
  const [meds, setMeds] = useState<PrescriptionItem[]>(saved.meds ?? [])
  // EX1: exámenes de laboratorio e imagen y gabinete, al nivel de medicamentos e indicaciones
  const [exams, setExams] = useState<ExamInput[]>(saved.exams ?? [])
  const [orderText, setOrderText] = useState('')
  const [editingOrder, setEditingOrder] = useState<number | null>(null)
  // null: formulario cerrado; -1: medicamento nuevo; n: editando el medicamento n
  const [medForm, setMedForm] = useState<{ index: number; initial?: PrescriptionItem } | null>(null)
  const vademecum = useVademecum()
  const [triage, setTriage] = useState(false)
  const [editBg, setEditBg] = useState(false)
  const [signing, setSigning] = useState(false)
  // CE2 (ronda 12): el expediente completo (consultas anteriores, exámenes, recetas…) se abre aquí mismo, sin dejar la nota
  const [showChart, setShowChart] = useState(false)
  // CX5 (ronda 13): el encabezado de la sección queda fijo debajo del encabezado del paciente; al contraer, la página se queda en él
  const headRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<HTMLElement>(null)
  const [headH, setHeadH] = useState(0)
  useEffect(() => {
    const el = headRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setHeadH(el.getBoundingClientRect().height))
    ro.observe(el)
    return () => ro.disconnect()
  })
  // CX6 (ronda 14): abierto, la barra queda fija en toda la página (no solo mientras se ve la sección). Al contraer desde abajo
  // (ya se está en la nota), el expediente se cierra arriba y la nota no salta: se compensa lo que medía (A16). Desde dentro
  // del expediente, como en CX5: la página queda en el encabezado de la sección.
  const noteRef = useRef<HTMLDivElement>(null)
  // Con la barra fija, el navegador deja el campo que recibe el foco debajo de ella (no lo tapa)
  useEffect(() => {
    if (!showChart) return
    const root = document.documentElement
    root.style.scrollPaddingTop = `${headH + 72}px`
    return () => { root.style.scrollPaddingTop = '' }
  }, [showChart, headH])
  const toggleChart = () => {
    const closing = showChart
    const note = noteRef.current
    const bar = chartRef.current?.querySelector('.chart-in-consult__toggle')
    const below = closing && !!note && note.getBoundingClientRect().top < headH + (bar?.getBoundingClientRect().height ?? 0)
    const before = note?.getBoundingClientRect().top ?? 0
    // El ajuste lo hace la página, no el navegador (su «anclaje» del desplazamiento lo haría dos veces)
    const root = document.documentElement
    if (below) root.style.overflowAnchor = 'none'
    setShowChart(!showChart)
    if (closing) requestAnimationFrame(() => {
      if (below && note) {
        window.scrollBy({ top: note.getBoundingClientRect().top - before, behavior: 'instant' as ScrollBehavior })
        requestAnimationFrame(() => { root.style.overflowAnchor = '' })
        return
      }
      const sec = chartRef.current
      if (sec && sec.getBoundingClientRect().top < headH) sec.scrollIntoView({ block: 'start' })
    })
  }
  const [validity, setValidity] = useRxValidity()
  const orderInput = useRef<HTMLInputElement>(null)
  const mine = !!appt && appt.doctorId === user?.id
  const { chart, reload } = useChart(p?.id, mine)
  // Los hooks van antes de los return tempranos
  const { exams: clinicExams } = useExamCatalog()

  useEffect(() => {
    if (appt && mine && ['arrived', 'triaged', 'confirmed', 'scheduled'].includes(appt.status)) setStatus(appt.id, 'in_consult')
    // Sólo al abrir la consulta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appt?.id])

  // Si el triaje llega después de abrir la consulta, se toma su motivo
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (todayVitals?.chiefComplaint && !saved.reason && reason === appt?.reason) setReason(todayVitals.chiefComplaint)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayVitals?.id])

  // AN1: borrador que se guarda solo, en este navegador y en el servidor; sobrevive a recargar y a cerrar el navegador
  const snapshot: Draft = { reason, history, exam, observations, dx, indications, meds, exams, followups, admit, observe, vitalsPlan, fluids }
  const blankDraft = !history && !exam && !observations && !dx.length && !indications.length && !meds.length && !exams.length && !followups.length
  const draft = useDraftSync<Draft>('consulta', apptId, snapshot, (d) => {
    setReason(d.reason ?? ''); setHistory(d.history ?? ''); setExam(d.exam ?? ''); setObservations(d.observations ?? ''); setDx(d.dx ?? [])
    setIndications(d.indications ?? []); setMeds(d.meds ?? []); setExams(d.exams ?? []); setFollowups(d.followups ?? []); setAdmit(!!d.admit); setObserve(!!d.observe); if (d.vitalsPlan) setVitalsPlan(d.vitalsPlan); if (d.fluids) setFluids(d.fluids)
  }, blankDraft, draftKey(apptId))

  if (!appt || !p || !user) return <div className="page"><div className="empty">No se encontró la cita. Vuelve a la <Link to="/app/agenda">agenda</Link>.</div></div>
  if (appt.status === 'done') return <div className="page"><div className="empty">Esta consulta ya fue firmada. Puedes verla en el <Link to={`/app/pacientes/${p.id}`}>expediente</Link>.</div></div>
  if (!mine) return <div className="page"><div className="empty">Esta cita pertenece a otro médico. Sólo el médico asignado puede firmar la consulta.</div></div>

  const last = chart?.consultations[0]
  const hospitalized = store.inpatientOf(p.id)
  const place = features(store.settings)
  // Con ingreso los medicamentos van a la hoja de medicamentos ("hasta nueva orden" si no tienen días);
  // si se va a su casa van a la receta y necesitan los días, salvo los que se aplican aquí en la clínica
  // Un borrador guardado antes puede traer una casilla que esta cuenta no usa
  const admitting = !hospitalized && ((admit && place.hospital) || (observe && place.observation))
  const ambulatory = !admitting
  // ME13 (ronda 14): sin ingreso, «Aplicar en la clínica» decide: marcado, una sola dosis que aplica enfermería; sin marcar, a la
  // receta. NO1 (ronda 16): con ingreso no hay casilla: todos pasan a la hoja de medicamentos (y a la receta), como el servidor
  const applied = (m: PrescriptionItem) => (admitting ? true : !!m.applyInClinic)
  // NO1 (ronda 16): con ingreso, la primera indicación es el ingreso; va fija en el número 1 (no se mueve ni se borra)
  const admitLine = admitting ? (admit && place.hospital ? ADMIT_ORDER.hospital : ADMIT_ORDER.observation) : null
  const off = admitLine ? 1 : 0
  // ME15 (ronda 15): la receta lleva todos los medicamentos, también los que se aplican en la clínica (si todo se aplica aquí y
  // el adulto no tiene identidad, se firma sin receta, como el servidor)
  const onlyInClinic = !meds.some((m) => !applied(m) || m.buyOutside)
  const rxCount = onlyInClinic && !p.dni && yearsOld(p.birthDate) >= 18 ? 0 : meds.length
  const inClinic = meds.filter(applied)
  const noDays = meds.filter((m) => !applied(m) && missingDays({ ...m, applyInClinic: false }))
  // Sin ingreso, lo que se aplica en la clínica es solo dosis STAT: «Terminar consulta» no deja firmar otra frecuencia
  const statWarn = (m: PrescriptionItem) => (!admitting && m.applyInClinic && (!/única/i.test(m.frequency) || m.loadingDose) ? 'Sin ingreso solo se permite dosis STAT. Cámbiala o marca el ingreso.' : undefined)
  const notStat = meds.filter((m) => statWarn(m))
  // ME16 (ronda 16): la infusión va con ingreso (si se desmarca el ingreso después de indicarla, no se firma así)
  const infusionWarn = (m: PrescriptionItem) => (!admitting && m.infusionRate ? 'La infusión va con ingreso. Marca el ingreso o cambia la frecuencia.' : undefined)
  const noInfusion = meds.filter((m) => infusionWarn(m))
  // Huecos "___" que trajo un set: no se firma hasta llenarlos
  const blanks = [...indications.flatMap((t, i) => (hasBlank(t) ? [`la indicación ${i + 1 + off}`] : [])), ...meds.flatMap((m) => (medHasBlank(m) ? [m.drug] : [])),
    // MC2 (ronda 6): un PRN que vino de un set sin condición
    ...meds.flatMap((m) => (isPrnFrequency(m.frequency) && !m.prnCondition?.trim() ? [`la condición PRN de ${m.drug}`] : []))]
  // La receta lleva la identidad del paciente; en adultos es obligatoria
  // ME15: si todo se aplica en la clínica, sin identidad se firma sin receta (como antes); la receta se genera después
  const needsDni = !onlyInClinic && !p.dni && yearsOld(p.birthDate) >= 18
  const missing = [!reason.trim() && 'el motivo de consulta', !dx.length && 'la impresión diagnóstica', !indications.length && !admitLine && !meds.length && !exams.length && 'al menos una indicación, un medicamento o un examen',
    noDays.length > 0 && `el total de días de ${noDays.map((m) => m.drug).join(', ')} (va a la receta)`,
    needsDni && 'el número de identidad para la receta',
    blanks.length > 0 && `los espacios ___ de ${blanks.join(', ')}`,
    noInfusion.length > 0 && `marcar el ingreso o cambiar la frecuencia de ${noInfusion.map((m) => m.drug).join(', ')} (la infusión va con ingreso)`,
    notStat.length > 0 && `cambiar a dosis STAT ${notStat.map((m) => m.drug).join(', ')} (sin ingreso solo se permite dosis STAT) o marcar el ingreso`].filter(Boolean)

  /** Un set agrega sus indicaciones al bloque Indicaciones y sus medicamentos al bloque Medicamentos, al final. */
  const applySet = (set: OrderSet) => {
    const texts = set.items.flatMap((it) => (it.text ? [it.text] : []))
    const added = set.items.flatMap((it) => (it.med ? [setMedToRx(it.med)] : []))
    // EX1: los exámenes del set van a la sección Exámenes, no como texto
    const fromSet = set.items.flatMap((it) => (it.exam ? [it.exam] : []))
    // EX8 (ronda 14): con el lugar por defecto según dónde está el paciente (lo guardado en el set no manda)
    setExams((x) => [...x, ...fromSet.filter((e) => !x.some((y) => y.name === e.name)).map((e) => ({ ...e, place: defaultPlace(e.group, admitting, store.settings) }))])
    const repeated = [
      ...texts.filter((t) => indications.some((x) => orderKey(x) === orderKey(t))),
      ...added.filter((m) => meds.some((x) => orderKey(medicationOrder(x)) === orderKey(medicationOrder(m)))).map((m) => m.drug),
    ]
    setIndications([...indications, ...texts])
    setMeds([...meds, ...added])
    if (repeated.length) store.notify(`Ojo: ya estaba${repeated.length > 1 ? 'n' : ''} en la lista: ${repeated.map((t) => t.replace(/\.$/, '')).join('; ')}. Quita la que sobre.`, 'error')
    else store.notify(`Se agregaron ${set.items.length} órdenes de "${set.name}". Revísalas antes de firmar.`)
  }
  const addOrder = (text: string) => {
    const t = text.trim()
    if (!t) return
    setIndications([...indications, /[.!?]$/.test(t) ? t : `${t}.`])
    setOrderText('')
  }
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= indications.length) return
    const next = [...indications]; [next[i], next[j]] = [next[j], next[i]]; setIndications(next)
  }
  // Si lo que se escribe en indicaciones empieza con un medicamento del vademécum, se sugiere pasarlo a Medicamentos
  const typedDrug = orderText.trim().length >= 4 ? vademecum.find((d) => normalize(orderText).startsWith(normalize(d.name))) : undefined
  // EX1: si lo que se escribe es un examen («hemograma», o uno que agregó la clínica), se sugiere pasarlo a Exámenes
  const typedExamHit = typedExam(orderText, examCatalog(clinicExams))

  const sign = async () => {
    setSigning(true)
    const r = await store.finishConsult({
      appointmentId: appt.id, reason: reason.trim(), symptoms: [], history, exam, observations: observations.trim(), diagnoses: dx,
      // En el expediente el manejo se lee completo: primero las indicaciones y luego los medicamentos
      // NO1 (ronda 16): con ingreso, «Ingreso a hospitalización» u «Ingreso a observación» es la primera orden
      orders: [...(admitLine ? [admitLine] : []), ...indications, ...meds.map(medicationOrder)], indications: admitLine ? [admitLine, ...indications] : indications,
      plan: '', vitalsId: todayVitals?.id, followups, validityDays: validity, exams, observe: observe && !hospitalized && place.observation, admit: admit && !hospitalized && place.hospital,
      vitalsPlan: admitting ? vitalsPlan : undefined,
      fluids: admitting && fluids.on ? { mode: fluids.mode } : undefined,
    }, admitting ? meds.map((m) => ({ ...m, applyInClinic: true })) : meds)
    setSigning(false)
    if (r) {
      draft.clear()
      // Con ingreso la estancia ya quedó creada al firmar, con esta nota como nota de ingreso y sus medicamentos en la hoja
      const stay = r.hospitalizationId ? (r.stayKind === 'hospital' ? `/app/hospitalizados/${r.hospitalizationId}?completar=1` : `/app/observacion/${r.hospitalizationId}`) : null
      // ME14 (ronda 14): con ingreso y receta, la misma pantalla final (receta y órdenes); después, a la estancia.
      // EX1 y EX10 (ronda 14): las órdenes de exámenes van aparte de la receta; la de los «En la clínica», al final con su botón
      const q = new URLSearchParams()
      if (r.examBatch) q.set('examenes', r.examBatch)
      if (r.clinicBatch) q.set('clinica', r.clinicBatch)
      if (stay) q.set('siguiente', stay)
      const qs = q.toString() ? `?${q}` : ''
      if (r.prescriptionId) nav(`/app/recetas/${r.prescriptionId}${qs}`)
      else if (stay) nav(stay)
      else if (r.examBatch) nav(`/app/examenes/orden/${r.examBatch}${r.clinicBatch ? `?clinica=${r.clinicBatch}` : ''}`)
      else nav(r.clinicBatch ? `/app/examenes/orden/${r.clinicBatch}` : `/app/pacientes/${p.id}`)
    }
  }

  return (
    <div className="page page--consult">
      <div className="sticky-top" ref={headRef}>
        <PatientHeader p={p} clinical link>
          <DraftBadge savedAt={draft.savedAt} restored={draft.restored || Object.keys(saved).length > 0} offline={draft.offline} />
        </PatientHeader>
      </div>

      {/* CX5 (ronda 13): toda la barra contrae o despliega; abierta queda fija debajo del encabezado del paciente y la sección
          crece en la página (sin barra de desplazamiento propia). «Contraer expediente» también al final. */}
      <section ref={chartRef} className={`panel chart-in-consult${showChart ? ' is-open' : ''}`} style={{ ['--consult-head' as string]: `${headH}px` }}>
        <div className="chart-in-consult__toggle" onClick={toggleChart}>
          <FolderOpen size={17} /><span><b>Expediente completo de {p.firstName}</b>
            <small>{chart ? `${chart.consultations.length} consulta${chart.consultations.length === 1 ? '' : 's'} anterior${chart.consultations.length === 1 ? '' : 'es'}${chart.hospitalizations.length ? `, ${chart.hospitalizations.length} hospitalización${chart.hospitalizations.length === 1 ? '' : 'es'}` : ''} · exámenes, recetas, signos y archivos. La nota sigue aquí abajo.` : 'Consultas anteriores, exámenes, recetas, signos y archivos.'}</small></span>
          <button type="button" className="btn btn--soft btn--sm chart-in-consult__btn" aria-expanded={showChart}>
            {showChart ? <><ChevronUp size={16} />Contraer<span className="chart-in-consult__long">expediente</span></> : <><ChevronDown size={16} />Ver expediente</>}</button>
        </div>
        {showChart && <div className="chart-in-consult__body"><PatientChart patientId={p.id} embedded />
          <button type="button" className="btn btn--soft chart-in-consult__end" onClick={toggleChart}><ChevronUp size={16} />Contraer expediente</button></div>}
      </section>
      <GoToNote target=".consult2" />

      <div className="consult2" ref={noteRef}>
        <div className="consult2__left">
          <section className="panel csec">
            <div className="panel__head"><h2>Antecedentes patológicos</h2>
              <button className="btn btn--ghost btn--sm" onClick={() => setEditBg(true)}><Pencil size={14} />Editar</button></div>
            <div className="panel__body">
              <BackgroundView p={p} compact only={PATHOLOGICAL} />
              {last && <p className="csec__last">Última consulta, {date(last.date)}: <b>{last.diagnoses.map((d) => d.label).join('; ')}</b></p>}
            </div>
          </section>

          <section className="panel csec">
            <div className="panel__head"><h2>Antecedentes no patológicos</h2>
              <button className="btn btn--ghost btn--sm" onClick={() => setEditBg(true)}><Pencil size={14} />Editar</button></div>
            <div className="panel__body"><BackgroundView p={p} compact only={NON_PATHOLOGICAL} /></div>
          </section>

          <section className="panel csec">
            <div className="panel__head"><div><h2>Signos vitales</h2>
              <p>{todayVitals ? `Registrados en preclínica a las ${time(todayVitals.takenAt)}` : 'Enfermería aún no abre la preclínica'}</p></div>
              {!todayVitals && <button className="btn btn--soft btn--sm" onClick={() => setTriage(true)}><Activity size={15} />Tomar signos</button>}
            </div>
            {todayVitals && <div className="panel__body csec__body">
              <VitalsGrid v={todayVitals} birthDate={p.birthDate} />
              {todayVitals.notes && <p className="c-muted fs-base">Nota de enfermería: {todayVitals.notes}</p>}
            </div>}
          </section>

          <section className="panel csec" data-tour="consulta-motivo">
            <div className="panel__head"><h2>Motivo de consulta</h2></div>
            <div className="panel__body">
              <textarea className="textarea textarea--sm" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Motivo de consulta" />
            </div>
          </section>

          <section className="panel csec">
            <div className="panel__head"><h2>Historia de la enfermedad actual (HEA)</h2></div>
            <div className="panel__body">
              <DictateField label="Historia de la enfermedad actual" onText={(f) => setHistory(f)}><textarea className="textarea textarea--lg" value={history} onChange={(e) => setHistory(e.target.value)} aria-label="Historia de la enfermedad actual"
                placeholder="Inicio, evolución, características, factores que agravan o alivian, síntomas acompañantes y tratamientos recibidos." /></DictateField>
            </div>
          </section>

          <section className="panel csec">
            <div className="panel__head"><h2>Examen físico</h2>
              {!exam.trim() && <button className="btn btn--ghost btn--sm" onClick={() => setExam(EXAM_GUIDE)}><ClipboardList size={15} />Guía por sistemas</button>}</div>
            <div className="panel__body">
              <DictateField label="Examen físico" onText={(f) => setExam(f)}><textarea className="textarea textarea--lg" value={exam} onChange={(e) => setExam(e.target.value)} aria-label="Examen físico" placeholder="Hallazgos por aparatos y sistemas." /></DictateField>
            </div>
          </section>

          <section className="panel csec">
            <div className="panel__head"><h2>Observaciones</h2></div>
            <div className="panel__body">
              <DictateField label="Observaciones" onText={(f) => setObservations(f)}><textarea className="textarea textarea--sm" rows={3} value={observations} onChange={(e) => setObservations(e.target.value)} aria-label="Observaciones"
                placeholder="Lo que no cabe en otro apartado: quién acompaña, actitud, información dada al paciente." /></DictateField>
            </div>
          </section>

          <section className="panel csec">
            <div className="panel__head"><h2>Impresión diagnóstica <span className="muted" style={{ fontWeight: 500, fontSize: 13 }}>· CIE-11</span></h2></div>
            <div className="panel__body csec__body">
              <DiagnosisPicker value={dx} onChange={setDx} label="" />
            </div>
          </section>
        </div>

        <aside className="consult2__right">
          <section className="panel orders-panel">
            <div className="panel__head"><div><h2>Plan y manejo</h2><p>Indicaciones, exámenes y medicamentos, en ese orden. Los medicamentos van a la receta.</p></div></div>
            <div className="panel__body csec__body">
              <div className="set-bar">
                <OrderSetPicker where="consultation" patientId={p.id} onApply={applySet} />
                <SaveSetButton items={[...indications.map((text) => ({ text })), ...meds.map((m) => ({ med: rxToSetMed(m) })), ...exams.map((e) => ({ exam: e }))]} />
              </div>
              {/* NO1 (ronda 16): el ingreso va arriba de «Indicaciones y plan»: es lo primero que se ordena */}
              {store.can('inpatient.orders') && (
                hospitalized
                  ? <p className="fs-base"><BedDouble size={15} style={{ verticalAlign: '-3px' }} /> {p.firstName} ya está {hospitalized.kind === 'observation' ? 'en observación' : 'hospitalizado'}. <Link to={`/app/${hospitalized.kind === 'observation' ? 'observacion' : 'hospitalizados'}/${hospitalized.id}`}>Abrir su expediente</Link>.</p>
                  : (place.observation || place.hospital) && <div className="admit-choice" role="group" aria-label="Ingreso">
                    {/* Son excluyentes: marcar una desmarca la otra */}
                    {/* Un consultorio no hospitaliza y puede no usar observación */}
                    {place.observation && <label className="check-line"><input type="checkbox" checked={observe} onChange={(e) => { setObserve(e.target.checked); if (e.target.checked) setAdmit(false) }} />
                      <span><b>Ingreso a observación</b><small>Observación corta (hidratar, nebulizar, vigilar). Esta nota es la primera nota; todos los medicamentos pasan a la hoja de medicamentos y a la receta.</small></span></label>}
                    {place.hospital && <label className="check-line"><input type="checkbox" checked={admit} onChange={(e) => { setAdmit(e.target.checked); if (e.target.checked) setObserve(false) }} />
                      <span><b>Ingreso a hospitalización</b><small>Esta nota queda como nota de ingreso; todos los medicamentos pasan a la hoja de medicamentos y a la receta. Al firmar eliges la cama.</small></span></label>}
                  </div>
              )}
              <div className="plan-block" data-tour="indicaciones">
                <h3 className="plan-block__title">Indicaciones y plan</h3>
                {admitting && <VitalsFrequency value={vitalsPlan} onChange={setVitalsPlan} />}
                {indications.length || admitLine ? (
                  <ol className="orders">
                    {admitLine && (
                      <li className="orders__fixed" title="Va fija en el número 1 mientras el ingreso esté marcado">
                        <span className="orders__n">1.</span>
                        <span className="orders__text orders__text--fixed">{admitLine}</span>
                        <span className="orders__tools"><span className="c-muted fs-sm">Fija</span></span>
                      </li>
                    )}
                    {indications.map((o, i) => (
                      <li key={i}>
                        <span className="orders__n">{i + 1 + off}.</span>
                        {editingOrder === i ? (
                          <input className="input" autoFocus defaultValue={o} aria-label={`Editar indicación ${i + 1 + off}`}
                            onBlur={(e) => { const t = e.target.value.trim(); setIndications(t ? indications.map((x, j) => (j === i ? t : x)) : indications.filter((_, j) => j !== i)); setEditingOrder(null) }}
                            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingOrder(null) }} />
                        ) : (
                          <button className={`orders__text${hasBlank(o) ? ' orders__text--blank' : ''}`} onClick={() => setEditingOrder(i)} title={hasBlank(o) ? 'Completa los espacios ___' : 'Toca para editar'}>{o}</button>
                        )}
                        <span className="orders__tools">
                          <button className="icon-btn" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={14} /></button>
                          <button className="icon-btn" aria-label="Bajar" disabled={i === indications.length - 1} onClick={() => move(i, 1)}><ArrowDown size={14} /></button>
                          <button className="icon-btn" aria-label={`Quitar indicación ${i + 1 + off}`} onClick={() => setIndications(indications.filter((_, j) => j !== i))}><X size={14} /></button>
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : <p className="c-muted fs-base">Dieta, cuidados, cita de control, lo que necesite. Una por línea. Los exámenes van en su sección.</p>}
                <form className="order-add" onSubmit={(e) => { e.preventDefault(); addOrder(orderText) }}>
                  <input ref={orderInput} className="input" value={orderText} onChange={(e) => setOrderText(e.target.value)} placeholder={`${indications.length + 1 + off}. Escribe una indicación y presiona Enter, o pega varias líneas`} aria-label="Nueva indicación" enterKeyHint="done"
                    onPaste={(e) => {
                      // NO2 (ronda 16): pegar una lista agrega una indicación por línea, como en las notas de la estancia
                      const text = e.clipboardData.getData('text')
                      if (!text.includes('\n')) return
                      e.preventDefault()
                      const lines = text.split(/\r?\n/).map((t) => t.replace(/^\s*(\d+\s*[.)-]|[-•*])\s*/, '').trim()).filter(Boolean)
                      setIndications([...indications, ...lines.map((t) => (/[.!?]$/.test(t) ? t : `${t}.`))])
                    }} />
                  <button className="btn btn--soft" disabled={!orderText.trim()} aria-label="Agregar indicación"><Plus size={16} /></button>
                </form>
                {typedExamHit && !typedDrug && (
                  <div className="suggest-med" role="status">
                    <FlaskConical size={15} />¿Agregar «{typedExamHit.name}» como examen? Así se imprime en su orden y se le da seguimiento.
                    <button className="btn btn--soft btn--sm" onClick={() => { setExams([...exams, { group: typedExamHit.group, name: typedExamHit.name, priority: 'routine', place: defaultPlace(typedExamHit.group, admitting, store.settings) }]); setOrderText('') }}>Sí, agregarlo</button>
                  </div>
                )}
                {typedDrug && (
                  <div className="suggest-med" role="status">
                    <Pill size={15} />«{typedDrug.name}» es un medicamento. ¿Agregarlo como medicamento para que vaya a la receta?
                    <button className="btn btn--soft btn--sm" onClick={() => { setMedForm({ index: -1, initial: { drug: typedDrug.name, presentation: typedDrug.presentation, route: typedDrug.usual?.route ?? 'Oral', dose: typedDrug.usual?.dose ?? '', frequency: typedDrug.usual?.frequency ?? 'Cada 8 horas', duration: typedDrug.usual?.duration ?? '' } }); setOrderText('') }}>Sí, agregarlo</button>
                  </div>
                )}
              </div>

              {/* NO2 (ronda 16): el lugar del bloque de órdenes extra (IE1: «Ingestas y excretas» con ingreso), debajo de Indicaciones y
                  antes de Exámenes, como en NoteEditor */}
              {admitting && <div className="plan-block"><FluidsOrder value={fluids} onChange={setFluids} /></div>}
              <div className="plan-block">
                <h3 className="plan-block__title">Exámenes <span className="muted" style={{ fontWeight: 500, fontSize: 13 }}>· {admitting ? 'enfermería los recibe en su bandeja' : 'se imprimen aparte de la receta'}</span></h3>
                <ExamsBlock value={exams} onChange={setExams} inStay={admitting} />
              </div>
              <div className="plan-block" data-tour="medicamentos">
                <h3 className="plan-block__title">Medicamentos <span className="muted" style={{ fontWeight: 500, fontSize: 13 }}>· {admitting ? 'Con ingreso, todos pasan a la hoja de medicamentos y a la receta' : 'todos van a la receta'}</span></h3>
                {admitting && <p className="c-muted fs-md">Sin días quedan «hasta nueva orden». La infusión está en «Frecuencia».</p>}
                {/* NO1 (ronda 16): lo que se agregó sin «Aplicar en la clínica» antes de marcar el ingreso también pasa a la hoja */}
                {admitting && meds.some((m) => !m.applyInClinic) && <div className="alert-strip alert-strip--calm" role="status">Con el ingreso, todos los medicamentos pasan a la hoja de medicamentos</div>}
                <MedicationList items={admitting ? meds.map((m) => ({ ...m, applyInClinic: applied(m) })) : meds} patient={p} editing={medForm?.index ?? null} requireDuration warn={(m) => statWarn(m) ?? infusionWarn(m)}
                  onEdit={(i) => setMedForm({ index: i, initial: meds[i] })} onRemove={(i) => { setMeds(meds.filter((_, j) => j !== i)); setMedForm(null) }} />
                {!meds.length && !medForm && <p className="c-muted fs-base">Sin medicamentos indicados.</p>}
                {medForm ? (
                  <MedicationForm key={medForm.index >= 0 ? `e${medForm.index}` : `n${meds.length}`} patient={p} current={meds} initial={medForm.initial}
                    onSaveAnother={medForm.index < 0 ? (item) => { setMeds([...meds, item]); setMedForm({ index: -1 }) } : undefined} place={{ where: 'consult', admitting, canApply: store.can('inpatient.orders') }}
                    submitLabel={medForm.index >= 0 ? 'Guardar cambios' : 'Agregar medicamento'}
                    onSave={(item) => { setMeds(medForm.index >= 0 ? meds.map((x, j) => (j === medForm.index ? item : x)) : [...meds, item]); setMedForm(null) }}
                    onCancel={() => setMedForm(null)} />
                ) : (
                  <button className="btn btn--primary self-start" onClick={() => setMedForm({ index: -1 })}><Plus size={16} />Agregar medicamento</button>
                )}
              </div>

            </div>
          </section>

          {store.can('followups.manage') && (
            <section className="panel">
              <div className="panel__head"><div><h2>Seguimiento</h2><p>Crónicos, recordatorios por WhatsApp y procedimientos</p></div>
                {!newFollowup && <button className="btn btn--ghost btn--sm" onClick={() => setNewFollowup(emptyFollowup(p.conditions.length ? 'chronic' : 'reminder'))}><CalendarClock size={15} />Programar</button>}
              </div>
              <div className="panel__body csec__body">
                {followups.length > 0 && <ul className="note__list">{followups.map((f, i) => (
                  <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className="grow"><b>{followupLabel(f)}:</b> {f.title}, {date(`${f.dueDate}T12:00:00`)}</span>
                    <button className="icon-btn" aria-label="Quitar" onClick={() => setFollowups(followups.filter((_, j) => j !== i))}><X size={14} /></button>
                  </li>
                ))}</ul>}
                {newFollowup ? (<>
                  <FollowupFields value={newFollowup} onChange={setNewFollowup} />
                  <div className="hstack hstack--nowrap">
                    <button className="btn btn--soft btn--sm" disabled={newFollowup.title.trim().length < 3 || !newFollowup.dueDate}
                      onClick={() => { setFollowups([...followups, { ...newFollowup, title: newFollowup.title.trim(), notes: newFollowup.notes?.trim() || undefined }]); setNewFollowup(null) }}><Plus size={14} />Agregar</button>
                    <button className="btn btn--ghost btn--sm" onClick={() => setNewFollowup(null)}>Cancelar</button>
                  </div>
                </>) : !followups.length && <p className="c-muted fs-base">Sin seguimiento programado.</p>}
              </div>
            </section>
          )}

          <section className="panel sign-box">
            <div className="panel__body" style={{ display: 'grid', gap: 10 }}>
              {needsDni && <IdentityPrompt p={p} />}
              {/* RF1 (ronda 8): referir a otro centro con la nota todavía en borrador (también desde la nota firmada) */}
              {store.user?.role === 'doctor' && appt.doctorId === store.user.id && (
                <button type="button" className="btn btn--ghost btn--sm self-start" onClick={() => setReferring(true)}><Send size={15} />Referir a otro centro</button>
              )}
              {rxCount > 0 && <RxValidityField value={validity} onChange={setValidity} />}
              <p className="fs-base c-muted">
                {missing.length ? `Para firmar falta ${missing.join(', ')}.` : `Al firmar se cierra la cita${rxCount ? ` y se emite una receta con ${rxCount} medicamento${rxCount > 1 ? 's' : ''}` : ''}${admit && !hospitalized ? ', se ingresa a hospitalización' : observe && !hospitalized ? ' e ingresa a observación' : ''}${inClinic.length ? `${ambulatory ? '; enfermería aplica en la clínica (sin ingreso): ' : '; pasan a la hoja de medicamentos: '}${inClinic.map((m) => m.drug).join(', ')}` : ''}.`}
              </p>
              <button className="btn btn--primary btn--lg" data-tour="firmar" disabled={missing.length > 0 || signing} onClick={sign}>Firmar consulta{rxCount ? ' y receta' : ''}</button>
            </div>
          </section>
        </aside>
      </div>

      {triage && <VitalsModal appt={appt} onClose={() => setTriage(false)} onSaved={() => setTriage(false)} />}
      {referring && <ReferralModal from={{ kind: 'appointment', id: appt.id }} onClose={() => setReferring(false)} onSigned={(r) => { setReferring(false); store.notify(`Referencia ${r.number} firmada. Queda en el expediente; al firmar la nota se enlaza a esta consulta.`) }}
        prefill={{ history, exam, admissionDiagnosis: dx.map((d) => `${d.label} (${dxCode(d)})`).join('; '),
          treatment: [...meds.map((m) => medicationLine(m)), ...(indications.length ? [`Indicaciones: ${indications.join('; ')}`] : [])].join('\n') }} />}
      {editBg && <BackgroundForm initial={p} onClose={() => setEditBg(false)} onSave={async (data) => { if (await updatePatient(p.id, data)) { setEditBg(false); reload() } }} />}
    </div>
  )
}
