import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Activity, ArrowDown, ArrowUp, BedDouble, CalendarClock, ClipboardList, Pencil, Pill, Plus, X } from 'lucide-react'
import { useStore, type FollowupInput } from '../lib/store'
import { PatientHeader } from '../components/PatientHeader'
import { date, formatDni, medicationOrder, time } from '../lib/format'
import { ICD10 } from '../lib/catalogs'
import { normalize } from '../lib/patients'
import { useVademecum } from '../lib/vademecum'
import { MedicationForm, MedicationList } from '../components/Medications'
import { FOLLOWUP_KIND } from '../lib/followups'
import { yearsOld } from '../lib/inpatient'
import { BackgroundView, useChart, VitalsGrid } from './PatientChart'
import { BackgroundForm } from './PatientForms'
import { VitalsModal } from './WaitingRoom'
import { emptyFollowup, FollowupFields } from './Followups'
import type { PrescriptionItem } from '../lib/types'

/**
 * Plan y manejo en dos bloques: indicaciones (dieta, cuidados, estudios, control) y medicamentos, que
 * van a la receta. Los borradores anteriores guardaban todo junto en `orders` y se convierten al abrir.
 */
interface Draft {
  reason: string; history: string; exam: string; observations: string; dx: { code: string; label: string }[]
  indications: string[]; meds: PrescriptionItem[]
  followups: FollowupInput[]; admit: boolean
  orders?: { text: string; rx?: PrescriptionItem }[]
}

const PATHOLOGICAL = ['Personales patológicos', 'Heredofamiliares', 'Gineco-obstétricos']
const NON_PATHOLOGICAL = ['Personales no patológicos']
const draftKey = (id?: string) => `clinara.nota.${id}`
function loadDraft(id?: string): Partial<Draft> {
  try {
    const d = JSON.parse(localStorage.getItem(draftKey(id)) ?? '{}') as Partial<Draft>
    if (d.orders && !d.indications) {
      d.indications = d.orders.filter((o) => !o.rx).map((o) => o.text)
      d.meds = d.orders.flatMap((o) => (o.rx ? [o.rx] : []))
    }
    return d
  } catch { return {} }
}

const EXAM_GUIDE = ['Aspecto general', 'Piel y mucosas', 'Cabeza y cuello', 'Tórax y pulmones', 'Corazón', 'Abdomen', 'Genitourinario', 'Extremidades', 'Neurológico']
  .map((s) => `${s}: `).join('\n')

const FREQUENT_ORDERS = [
  'Dieta blanda.', 'Dieta hiposódica.', 'Dieta para diabético.', 'Abundantes líquidos orales.', 'Reposo relativo.',
  'Hemograma completo.', 'Examen general de orina.', 'Glucosa en ayunas.', 'Perfil lipídico.', 'Creatinina y nitrógeno ureico.', 'Radiografía de tórax PA.',
  'Control de presión arterial en casa, registro diario.', 'Signos de alarma explicados; acudir a emergencia si empeora.',
  'Cita de control en 1 semana.', 'Cita de control en 1 mes.', 'Cita de control con resultados de laboratorio.',
]

/** 13 dígitos de la identidad hondureña o un pasaporte (letras y números). */
const validDni = (v: string) => v.replace(/\D/g, '').length === 13 || (/[A-Z]/.test(v) && v.trim().length >= 6)


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
  const [dni, setDni] = useState('')
  const [dx, setDx] = useState<{ code: string; label: string }[]>(saved.dx ?? [])
  const [dxQuery, setDxQuery] = useState('')
  const [indications, setIndications] = useState<string[]>(saved.indications ?? [])
  const [meds, setMeds] = useState<PrescriptionItem[]>(saved.meds ?? [])
  const [orderText, setOrderText] = useState('')
  const [editingOrder, setEditingOrder] = useState<number | null>(null)
  // null: formulario cerrado; -1: medicamento nuevo; n: editando el medicamento n
  const [medForm, setMedForm] = useState<{ index: number; initial?: PrescriptionItem } | null>(null)
  const vademecum = useVademecum()
  const [triage, setTriage] = useState(false)
  const [editBg, setEditBg] = useState(false)
  const [signing, setSigning] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(Object.keys(saved).length ? 'recuperado' : null)
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

  useEffect(() => {
    const d: Draft = { reason, history, exam, observations, dx, indications, meds, followups, admit }
    const blank = !history && !exam && !observations && !dx.length && !indications.length && !meds.length && !followups.length
    const t = setTimeout(() => {
      try {
        if (blank) localStorage.removeItem(draftKey(apptId))
        else { localStorage.setItem(draftKey(apptId), JSON.stringify(d)); setSavedAt(time(new Date().toISOString())) }
      } catch { /* sin almacenamiento local */ }
    }, 600)
    return () => clearTimeout(t)
  }, [apptId, reason, history, exam, observations, dx, indications, meds, followups, admit])

  if (!appt || !p || !user) return <div className="page"><div className="empty">No se encontró la cita. Vuelve a la <Link to="/app/agenda">agenda</Link>.</div></div>
  if (appt.status === 'done') return <div className="page"><div className="empty">Esta consulta ya fue firmada. Puedes verla en el <Link to={`/app/pacientes/${p.id}`}>expediente</Link>.</div></div>
  if (!mine) return <div className="page"><div className="empty">Esta cita pertenece a otro médico. Sólo el médico asignado puede firmar la consulta.</div></div>

  const last = chart?.consultations[0]
  const dxMatches = dxQuery.trim()
    ? ICD10.filter((d) => !dx.some((x) => x.code === d.code) && (d.code.toLowerCase().includes(dxQuery.toLowerCase()) || d.label.toLowerCase().includes(dxQuery.toLowerCase()))).slice(0, 6)
    : []
  const rxCount = meds.length
  // La receta lleva la identidad del paciente; en adultos es obligatoria
  const needsDni = rxCount > 0 && !p.dni && yearsOld(p.birthDate) >= 18
  const missing = [!reason.trim() && 'el motivo de consulta', !dx.length && 'la impresión diagnóstica', !indications.length && !meds.length && 'al menos una indicación o un medicamento',
    needsDni && 'el número de identidad para la receta'].filter(Boolean)
  const hospitalized = store.inpatientOf(p.id)

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

  const sign = async () => {
    setSigning(true)
    const r = await store.finishConsult({
      appointmentId: appt.id, reason: reason.trim(), symptoms: [], history, exam, observations: observations.trim(), diagnoses: dx,
      // En el expediente el manejo se lee completo: primero las indicaciones y luego los medicamentos
      orders: [...indications, ...meds.map(medicationOrder)], indications,
      plan: '', vitalsId: todayVitals?.id, followups,
    }, meds)
    setSigning(false)
    if (r) {
      try { localStorage.removeItem(draftKey(apptId)) } catch { /* noop */ }
      // Ingreso a hospitalización: se abre la hoja de ingreso con los diagnósticos de esta consulta
      if (admit && !hospitalized) nav(`/app/hospitalizados?paciente=${p.id}&consulta=${r.consultationId}`)
      else nav(r.prescriptionId ? `/app/recetas/${r.prescriptionId}` : `/app/pacientes/${p.id}`)
    }
  }

  return (
    <div className="page page--consult">
      <div className="sticky-top">
        <PatientHeader p={p} clinical link>
          <span className="ph__draft">{savedAt === 'recuperado' ? 'Borrador recuperado' : savedAt ? `Borrador guardado ${savedAt}` : 'Consulta en curso'}</span>
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

          <section className="panel csec">
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
            <div className="panel__head"><h2>Impresión diagnóstica</h2></div>
            <div className="panel__body csec__body">
              {dx.length > 0 && <ol className="dx-list">{dx.map((d) => (
                <li key={d.code}><span><b>{d.label}</b> <span className="muted">{d.code}</span></span>
                  <button className="icon-btn" aria-label={`Quitar ${d.label}`} onClick={() => setDx(dx.filter((x) => x.code !== d.code))}><X size={15} /></button></li>
              ))}</ol>}
              <div className="suggest">
                <input className="input" value={dxQuery} onChange={(e) => setDxQuery(e.target.value)} placeholder="Busca por nombre o código CIE-10, por ejemplo faringitis o J02" aria-label="Buscar diagnóstico" />
                {dxMatches.length > 0 && (
                  <div className="suggest__list">
                    {dxMatches.map((d) => <button key={d.code} onClick={() => { setDx([...dx, d]); setDxQuery('') }}><code>{d.code}</code>{d.label}</button>)}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        <aside className="consult2__right">
          <section className="panel orders-panel">
            <div className="panel__head"><div><h2>Plan y manejo</h2><p>Arriba las indicaciones; abajo los medicamentos, que van a la receta.</p></div></div>
            <div className="panel__body csec__body">
              <div className="plan-block">
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
                          <button className="orders__text" onClick={() => setEditingOrder(i)} title="Toca para editar">{o}</button>
                        )}
                        <span className="orders__tools">
                          <button className="icon-btn" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={14} /></button>
                          <button className="icon-btn" aria-label="Bajar" disabled={i === indications.length - 1} onClick={() => move(i, 1)}><ArrowDown size={14} /></button>
                          <button className="icon-btn" aria-label={`Quitar indicación ${i + 1}`} onClick={() => setIndications(indications.filter((_, j) => j !== i))}><X size={14} /></button>
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : <p className="muted" style={{ fontSize: 14 }}>Dieta, cuidados, estudios a realizar, cita de control, lo que necesite. Una por línea.</p>}
                <form className="order-add" onSubmit={(e) => { e.preventDefault(); addOrder(orderText) }}>
                  <input ref={orderInput} className="input" value={orderText} onChange={(e) => setOrderText(e.target.value)} placeholder={`${indications.length + 1}. Escribe una indicación y presiona Enter`} aria-label="Nueva indicación" enterKeyHint="done" />
                  <button className="btn btn--soft" disabled={!orderText.trim()} aria-label="Agregar indicación"><Plus size={16} /></button>
                </form>
                {typedDrug && (
                  <div className="suggest-med" role="status">
                    <Pill size={15} />«{typedDrug.name}» es un medicamento. ¿Agregarlo como medicamento para que vaya a la receta?
                    <button className="btn btn--soft btn--sm" onClick={() => { setMedForm({ index: -1, initial: { drug: typedDrug.name, presentation: typedDrug.presentation, route: typedDrug.usual?.route ?? 'Oral', dose: typedDrug.usual?.dose ?? '', frequency: typedDrug.usual?.frequency ?? 'Cada 8 horas', duration: typedDrug.usual?.duration ?? '' } }); setOrderText('') }}>Sí, agregarlo</button>
                  </div>
                )}
                <select className="select" value="" aria-label="Órdenes frecuentes" onChange={(e) => { addOrder(e.target.value); orderInput.current?.blur() }}>
                  <option value="">Órdenes frecuentes…</option>
                  {FREQUENT_ORDERS.filter((f) => !indications.includes(f)).map((f) => <option key={f}>{f}</option>)}
                </select>
              </div>

              <div className="plan-block">
                <h3 className="plan-block__title">Medicamentos <span className="muted" style={{ fontWeight: 500, fontSize: 13 }}>· van a la receta</span></h3>
                <MedicationList items={meds} patient={p} editing={medForm?.index ?? null}
                  onEdit={(i) => setMedForm({ index: i, initial: meds[i] })} onRemove={(i) => { setMeds(meds.filter((_, j) => j !== i)); setMedForm(null) }} />
                {!meds.length && !medForm && <p className="muted" style={{ fontSize: 14 }}>Sin medicamentos indicados.</p>}
                {medForm ? (
                  <MedicationForm key={medForm.index} patient={p} current={meds} initial={medForm.initial}
                    submitLabel={medForm.index >= 0 ? 'Guardar cambios' : 'Agregar medicamento'}
                    onSave={(item) => { setMeds(medForm.index >= 0 ? meds.map((x, j) => (j === medForm.index ? item : x)) : [...meds, item]); setMedForm(null) }}
                    onCancel={() => setMedForm(null)} />
                ) : (
                  <button className="btn btn--primary" style={{ justifySelf: 'start' }} onClick={() => setMedForm({ index: -1 })}><Plus size={16} />Agregar medicamento</button>
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
              {needsDni && (
                <form className="dni-ask" onSubmit={async (e) => { e.preventDefault(); if (validDni(dni)) await updatePatient(p.id, { dni }) }}>
                  <label className="field"><span>{p.firstName} no tiene número de identidad en su expediente y la receta lo lleva. Se guarda en el expediente y no se vuelve a pedir.</span>
                    <input className="input" value={dni} onChange={(e) => setDni(formatDni(e.target.value))} placeholder="0000-0000-00000" inputMode="numeric" /></label>
                  <button className="btn btn--soft" disabled={!validDni(dni)}>Guardar identidad</button>
                </form>
              )}
              {store.can('inpatient.orders') && (
                hospitalized
                  ? <p style={{ fontSize: 14 }}><BedDouble size={15} style={{ verticalAlign: '-3px' }} /> {p.firstName} ya está hospitalizado. <Link to={`/app/hospitalizados/${hospitalized.id}`}>Abrir su expediente</Link>.</p>
                  : <label className="check-line"><input type="checkbox" checked={admit} onChange={(e) => setAdmit(e.target.checked)} />
                    <span><b>Ingreso a hospitalización</b><small>Al firmar se abre la hoja de ingreso con los diagnósticos de esta consulta.</small></span></label>
              )}
              <p style={{ fontSize: 14, color: 'var(--muted)' }}>
                {missing.length ? `Para firmar falta ${missing.join(', ')}.` : `Al firmar se cierra la cita${rxCount ? ` y se emite una receta con ${rxCount} medicamento${rxCount > 1 ? 's' : ''}` : ''}${admit && !hospitalized ? ' y pasas al ingreso hospitalario' : ''}.`}
              </p>
              <button className="btn btn--primary btn--lg" disabled={missing.length > 0 || signing} onClick={sign}>Firmar consulta{rxCount ? ' y receta' : ''}</button>
            </div>
          </section>
        </aside>
      </div>

      {triage && <VitalsModal appt={appt} onClose={() => setTriage(false)} onSaved={() => setTriage(false)} />}
      {editBg && <BackgroundForm initial={p} onClose={() => setEditBg(false)} onSave={async (data) => { if (await updatePatient(p.id, data)) { setEditBg(false); reload() } }} />}
    </div>
  )
}
