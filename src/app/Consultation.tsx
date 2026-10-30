import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Activity, ArrowDown, ArrowUp, BedDouble, CalendarClock, ClipboardList, FlaskConical, Pencil, Pill, Plus, X } from 'lucide-react'
import { useStore, type FollowupInput } from '../lib/store'
import { PatientHeader } from '../components/PatientHeader'
import { date, medicationOrder, missingDays, time } from '../lib/format'
import { DiagnosisPicker } from '../components/DiagnosisPicker'
import { normalize } from '../lib/patients'
import { useVademecum } from '../lib/vademecum'
import { MedicationForm, MedicationList } from '../components/Medications'
import { FOLLOWUP_KIND } from '../lib/followups'
import { yearsOld } from '../lib/inpatient'
import { features } from '../lib/permissions'
import { BackgroundView, useChart, VitalsGrid } from './PatientChart'
import { BackgroundForm, IdentityPrompt } from './PatientForms'
import { VitalsModal } from './WaitingRoom'
import { emptyFollowup, FollowupFields } from './Followups'
import type { Diagnosis, ExamInput, PrescriptionItem } from '../lib/types'
import { ExamsBlock } from '../components/Exams'
import { examCatalog, typedExam } from '../lib/exams'
import { useExamCatalog } from '../lib/useExamCatalog'
import type { OrderSet } from '../lib/types'
import { OrderSetPicker, SaveSetButton } from '../components/OrderSets'
import { RxValidityField } from '../components/RxValidity'
import { useDraftSync } from '../lib/drafts'
import { DraftBadge } from '../components/Addenda'
import { useRxValidity } from '../lib/hooks'
import { hasBlank, medHasBlank, orderKey, rxToSetMed, setMedToRx } from '../lib/orderSets'

/**
 * Plan y manejo en dos bloques: indicaciones (dieta, cuidados, estudios, control) y medicamentos, que
 * van a la receta. Los borradores anteriores guardaban todo junto en `orders` y se convierten al abrir.
 */
interface Draft {
  reason: string; history: string; exam: string; observations: string; dx: Diagnosis[]
  indications: string[]; meds: PrescriptionItem[]; exams?: ExamInput[]
  followups: FollowupInput[]; admit: boolean; observe?: boolean
  orders?: { text: string; rx?: PrescriptionItem }[]
}

const PATHOLOGICAL = ['Personales patológicos', 'Heredofamiliares', 'Gineco-obstétricos']
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

const EXAM_GUIDE = ['Aspecto general', 'Piel y mucosas', 'Cabeza y cuello', 'Tórax y pulmones', 'Corazón', 'Abdomen', 'Genitourinario', 'Extremidades', 'Neurológico']
  .map((s) => `${s}: `).join('\n')



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
  const [validity, setValidity] = useRxValidity()
  const orderInput = useRef<HTMLInputElement>(null)
  const mine = !!appt && appt.doctorId === user?.id
  const { chart, reload } = useChart(p?.id, mine)

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
  const snapshot: Draft = { reason, history, exam, observations, dx, indications, meds, exams, followups, admit, observe }
  const blankDraft = !history && !exam && !observations && !dx.length && !indications.length && !meds.length && !exams.length && !followups.length
  const draft = useDraftSync<Draft>('consulta', apptId, snapshot, (d) => {
    setReason(d.reason ?? ''); setHistory(d.history ?? ''); setExam(d.exam ?? ''); setObservations(d.observations ?? ''); setDx(d.dx ?? [])
    setIndications(d.indications ?? []); setMeds(d.meds ?? []); setExams(d.exams ?? []); setFollowups(d.followups ?? []); setAdmit(!!d.admit); setObserve(!!d.observe)
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
  const rxCount = ambulatory ? meds.filter((m) => !m.applyInClinic).length : 0
  const inClinic = ambulatory ? meds.filter((m) => m.applyInClinic) : admitting ? meds : []
  const noDays = ambulatory ? meds.filter(missingDays) : []
  // Huecos "___" que trajo un set: no se firma hasta llenarlos
  const blanks = [...indications.flatMap((t, i) => (hasBlank(t) ? [`la indicación ${i + 1}`] : [])), ...meds.flatMap((m) => (medHasBlank(m) ? [m.drug] : []))]
  // La receta lleva la identidad del paciente; en adultos es obligatoria
  const needsDni = rxCount > 0 && !p.dni && yearsOld(p.birthDate) >= 18
  const missing = [!reason.trim() && 'el motivo de consulta', !dx.length && 'la impresión diagnóstica', !indications.length && !meds.length && !exams.length && 'al menos una indicación, un medicamento o un examen',
    noDays.length > 0 && `el total de días de ${noDays.map((m) => m.drug).join(', ')} (va a la receta)`,
    needsDni && 'el número de identidad para la receta',
    blanks.length > 0 && `los espacios ___ de ${blanks.join(', ')}`].filter(Boolean)

  /** Un set agrega sus indicaciones al bloque Indicaciones y sus medicamentos al bloque Medicamentos, al final. */
  const applySet = (set: OrderSet) => {
    const texts = set.items.flatMap((it) => (it.text ? [it.text] : []))
    const added = set.items.flatMap((it) => (it.med ? [setMedToRx(it.med)] : []))
    // EX1: los exámenes del set van a la sección Exámenes, no como texto
    const fromSet = set.items.flatMap((it) => (it.exam ? [it.exam] : []))
    setExams((x) => [...x, ...fromSet.filter((e) => !x.some((y) => y.name === e.name))])
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
  const { exams: clinicExams } = useExamCatalog()
  const typedExamHit = typedExam(orderText, examCatalog(clinicExams))

  const sign = async () => {
    setSigning(true)
    const r = await store.finishConsult({
      appointmentId: appt.id, reason: reason.trim(), symptoms: [], history, exam, observations: observations.trim(), diagnoses: dx,
      // En el expediente el manejo se lee completo: primero las indicaciones y luego los medicamentos
      orders: [...indications, ...meds.map(medicationOrder)], indications,
      plan: '', vitalsId: todayVitals?.id, followups, validityDays: validity, exams, observe: observe && !hospitalized && place.observation, admit: admit && !hospitalized && place.hospital,
    }, meds)
    setSigning(false)
    if (r) {
      draft.clear()
      // Con ingreso la estancia ya quedó creada al firmar, con esta nota como nota de ingreso y sus medicamentos en la hoja
      if (r.hospitalizationId && r.stayKind === 'hospital') nav(`/app/hospitalizados/${r.hospitalizationId}?completar=1`)
      else if (r.hospitalizationId) nav(`/app/observacion/${r.hospitalizationId}`)
      // EX1: las órdenes de exámenes se imprimen aparte de la receta
      else if (r.prescriptionId) nav(`/app/recetas/${r.prescriptionId}${r.examBatch ? `?examenes=${r.examBatch}` : ''}`)
      else nav(r.examBatch ? `/app/examenes/orden/${r.examBatch}` : `/app/pacientes/${p.id}`)
    }
  }

  return (
    <div className="page page--consult">
      <div className="sticky-top">
        <PatientHeader p={p} clinical link>
          <DraftBadge savedAt={draft.savedAt} restored={draft.restored || Object.keys(saved).length > 0} offline={draft.offline} />
        </PatientHeader>
      </div>

      <div className="consult2">
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
              {todayVitals.notes && <p className="muted" style={{ fontSize: 14 }}>Nota de enfermería: {todayVitals.notes}</p>}
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
              <textarea className="textarea textarea--lg" value={history} onChange={(e) => setHistory(e.target.value)} aria-label="Historia de la enfermedad actual"
                placeholder="Inicio, evolución, características, factores que agravan o alivian, síntomas acompañantes y tratamientos recibidos." />
            </div>
          </section>

          <section className="panel csec">
            <div className="panel__head"><h2>Examen físico</h2>
              {!exam.trim() && <button className="btn btn--ghost btn--sm" onClick={() => setExam(EXAM_GUIDE)}><ClipboardList size={15} />Guía por sistemas</button>}</div>
            <div className="panel__body">
              <textarea className="textarea textarea--lg" value={exam} onChange={(e) => setExam(e.target.value)} aria-label="Examen físico" placeholder="Hallazgos por aparatos y sistemas." />
            </div>
          </section>

          <section className="panel csec">
            <div className="panel__head"><h2>Observaciones</h2></div>
            <div className="panel__body">
              <textarea className="textarea textarea--sm" rows={3} value={observations} onChange={(e) => setObservations(e.target.value)} aria-label="Observaciones"
                placeholder="Lo que no cabe en otro apartado: quién acompaña, actitud, información dada al paciente." />
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
            <div className="panel__head"><div><h2>Plan y manejo</h2><p>Arriba las indicaciones; abajo los medicamentos, que van a la receta.</p></div></div>
            <div className="panel__body csec__body">
              <div className="set-bar">
                <OrderSetPicker where="consultation" patientId={p.id} onApply={applySet} />
                <SaveSetButton items={[...indications.map((text) => ({ text })), ...meds.map((m) => ({ med: rxToSetMed(m) })), ...exams.map((e) => ({ exam: e }))]} />
              </div>
              <div className="plan-block" data-tour="indicaciones">
                <h3 className="plan-block__title">Indicaciones y plan</h3>
                {indications.length ? (
                  <ol className="orders">
                    {indications.map((o, i) => (
                      <li key={i}>
                        <span className="orders__n">{i + 1}.</span>
                        {editingOrder === i ? (
                          <input className="input" autoFocus defaultValue={o} aria-label={`Editar indicación ${i + 1}`}
                            onBlur={(e) => { const t = e.target.value.trim(); setIndications(t ? indications.map((x, j) => (j === i ? t : x)) : indications.filter((_, j) => j !== i)); setEditingOrder(null) }}
                            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingOrder(null) }} />
                        ) : (
                          <button className={`orders__text${hasBlank(o) ? ' orders__text--blank' : ''}`} onClick={() => setEditingOrder(i)} title={hasBlank(o) ? 'Completa los espacios ___' : 'Toca para editar'}>{o}</button>
                        )}
                        <span className="orders__tools">
                          <button className="icon-btn" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={14} /></button>
                          <button className="icon-btn" aria-label="Bajar" disabled={i === indications.length - 1} onClick={() => move(i, 1)}><ArrowDown size={14} /></button>
                          <button className="icon-btn" aria-label={`Quitar indicación ${i + 1}`} onClick={() => setIndications(indications.filter((_, j) => j !== i))}><X size={14} /></button>
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : <p className="muted" style={{ fontSize: 14 }}>Dieta, cuidados, cita de control, lo que necesite. Una por línea. Los exámenes van en su sección.</p>}
                <form className="order-add" onSubmit={(e) => { e.preventDefault(); addOrder(orderText) }}>
                  <input ref={orderInput} className="input" value={orderText} onChange={(e) => setOrderText(e.target.value)} placeholder={`${indications.length + 1}. Escribe una indicación y presiona Enter`} aria-label="Nueva indicación" enterKeyHint="done" />
                  <button className="btn btn--soft" disabled={!orderText.trim()} aria-label="Agregar indicación"><Plus size={16} /></button>
                </form>
                {typedExamHit && !typedDrug && (
                  <div className="suggest-med" role="status">
                    <FlaskConical size={15} />¿Agregar «{typedExamHit.name}» como examen? Así se imprime en su orden y se le da seguimiento.
                    <button className="btn btn--soft btn--sm" onClick={() => { setExams([...exams, { group: typedExamHit.group, name: typedExamHit.name, priority: 'routine', place: 'clinic' }]); setOrderText('') }}>Sí, agregarlo</button>
                  </div>
                )}
                {typedDrug && (
                  <div className="suggest-med" role="status">
                    <Pill size={15} />«{typedDrug.name}» es un medicamento. ¿Agregarlo como medicamento para que vaya a la receta?
                    <button className="btn btn--soft btn--sm" onClick={() => { setMedForm({ index: -1, initial: { drug: typedDrug.name, presentation: typedDrug.presentation, route: typedDrug.usual?.route ?? 'Oral', dose: typedDrug.usual?.dose ?? '', frequency: typedDrug.usual?.frequency ?? 'Cada 8 horas', duration: typedDrug.usual?.duration ?? '' } }); setOrderText('') }}>Sí, agregarlo</button>
                  </div>
                )}
              </div>

              <div className="plan-block" data-tour="medicamentos">
                <h3 className="plan-block__title">Medicamentos <span className="muted" style={{ fontWeight: 500, fontSize: 13 }}>· {admitting ? 'van a la hoja de medicamentos' : 'van a la receta'}</span></h3>
                {admitting && <p className="muted" style={{ fontSize: 13.5 }}>Con ingreso, los días son opcionales: sin días el medicamento queda «hasta nueva orden».</p>}
                <MedicationList items={meds} patient={p} editing={medForm?.index ?? null} requireDuration={ambulatory}
                  onEdit={(i) => setMedForm({ index: i, initial: meds[i] })} onRemove={(i) => { setMeds(meds.filter((_, j) => j !== i)); setMedForm(null) }} />
                {!meds.length && !medForm && <p className="muted" style={{ fontSize: 14 }}>Sin medicamentos indicados.</p>}
                {medForm ? (
                  <MedicationForm key={medForm.index} patient={p} current={meds} initial={medForm.initial} requireDuration={ambulatory} clinicOption={ambulatory && store.can('inpatient.orders') && place.observation}
                    submitLabel={medForm.index >= 0 ? 'Guardar cambios' : 'Agregar medicamento'}
                    onSave={(item) => { setMeds(medForm.index >= 0 ? meds.map((x, j) => (j === medForm.index ? item : x)) : [...meds, item]); setMedForm(null) }}
                    onCancel={() => setMedForm(null)} />
                ) : (
                  <button className="btn btn--primary" style={{ justifySelf: 'start' }} onClick={() => setMedForm({ index: -1 })}><Plus size={16} />Agregar medicamento</button>
                )}
              </div>

              <div className="plan-block">
                <h3 className="plan-block__title">Exámenes <span className="muted" style={{ fontWeight: 500, fontSize: 13 }}>· {admitting ? 'enfermería los recibe en su bandeja' : 'se imprimen aparte de la receta'}</span></h3>
                <ExamsBlock value={exams} onChange={setExams} inStay={admitting} />
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
                    <span style={{ flex: 1 }}><b>{FOLLOWUP_KIND[f.kind].label}:</b> {f.title}, {date(`${f.dueDate}T12:00:00`)}</span>
                    <button className="icon-btn" aria-label="Quitar" onClick={() => setFollowups(followups.filter((_, j) => j !== i))}><X size={14} /></button>
                  </li>
                ))}</ul>}
                {newFollowup ? (<>
                  <FollowupFields value={newFollowup} onChange={setNewFollowup} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn--soft btn--sm" disabled={newFollowup.title.trim().length < 3 || !newFollowup.dueDate}
                      onClick={() => { setFollowups([...followups, { ...newFollowup, title: newFollowup.title.trim(), notes: newFollowup.notes?.trim() || undefined }]); setNewFollowup(null) }}><Plus size={14} />Agregar</button>
                    <button className="btn btn--ghost btn--sm" onClick={() => setNewFollowup(null)}>Cancelar</button>
                  </div>
                </>) : !followups.length && <p className="muted" style={{ fontSize: 14 }}>Sin seguimiento programado.</p>}
              </div>
            </section>
          )}

          <section className="panel sign-box">
            <div className="panel__body" style={{ display: 'grid', gap: 10 }}>
              {needsDni && <IdentityPrompt p={p} />}
              {store.can('inpatient.orders') && (
                hospitalized
                  ? <p style={{ fontSize: 14 }}><BedDouble size={15} style={{ verticalAlign: '-3px' }} /> {p.firstName} ya está {hospitalized.kind === 'observation' ? 'en observación' : 'hospitalizado'}. <Link to={`/app/${hospitalized.kind === 'observation' ? 'observacion' : 'hospitalizados'}/${hospitalized.id}`}>Abrir su expediente</Link>.</p>
                  : <>
                    {/* Son excluyentes: marcar una desmarca la otra */}
                    {/* Un consultorio no hospitaliza y puede no usar observación */}
                    {place.observation && <label className="check-line"><input type="checkbox" checked={observe} onChange={(e) => { setObserve(e.target.checked); if (e.target.checked) setAdmit(false) }} />
                      <span><b>Ingreso a observación</b><small>Observación corta (hidratar, nebulizar, vigilar). Esta nota es la primera nota y sus medicamentos pasan a la hoja.</small></span></label>}
                    {place.hospital && <label className="check-line"><input type="checkbox" checked={admit} onChange={(e) => { setAdmit(e.target.checked); if (e.target.checked) setObserve(false) }} />
                      <span><b>Ingreso a hospitalización</b><small>Esta nota queda como nota de ingreso y sus medicamentos pasan a la hoja. Al firmar eliges la cama.</small></span></label>}
                  </>
              )}
              {rxCount > 0 && <RxValidityField value={validity} onChange={setValidity} />}
              <p style={{ fontSize: 14, color: 'var(--muted)' }}>
                {missing.length ? `Para firmar falta ${missing.join(', ')}.` : `Al firmar se cierra la cita${rxCount ? ` y se emite una receta con ${rxCount} medicamento${rxCount > 1 ? 's' : ''}` : ''}${admit && !hospitalized ? ', se ingresa a hospitalización' : observe && !hospitalized ? ' e ingresa a observación' : ''}${inClinic.length ? `${ambulatory ? ', queda en observación para aplicarle ' : '; pasan a la hoja de medicamentos: '}${inClinic.map((m) => m.drug).join(', ')}` : ''}.`}
              </p>
              <button className="btn btn--primary btn--lg" data-tour="firmar" disabled={missing.length > 0 || signing} onClick={sign}>Firmar consulta{rxCount ? ' y receta' : ''}</button>
            </div>
          </section>
        </aside>
      </div>

      {triage && <VitalsModal appt={appt} onClose={() => setTriage(false)} onSaved={() => setTriage(false)} />}
      {editBg && <BackgroundForm initial={p} onClose={() => setEditBg(false)} onSave={async (data) => { if (await updatePatient(p.id, data)) { setEditBg(false); reload() } }} />}
    </div>
  )
}
