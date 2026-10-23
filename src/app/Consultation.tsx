import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Activity, ArrowDown, ArrowUp, BedDouble, CalendarClock, ClipboardList, Pencil, Pill, Plus, TriangleAlert, X } from 'lucide-react'
import { useStore, type FollowupInput } from '../lib/store'
import { PatientHeader } from '../components/PatientHeader'
import { date, defaultRoute, medicationOrder, ROUTES, time } from '../lib/format'
import { DRUGS, FREQUENCIES, ICD10, allergyConflict } from '../lib/catalogs'
import { FOLLOWUP_KIND } from '../lib/followups'
import { yearsOld } from '../lib/inpatient'
import { BackgroundView, useChart, VitalsGrid } from './PatientChart'
import { BackgroundForm } from './PatientForms'
import { VitalsModal } from './WaitingRoom'
import { emptyFollowup, FollowupFields } from './Followups'
import type { PrescriptionItem } from '../lib/types'

/** Una orden del manejo. Si trae `rx`, además va a la receta. */
interface Order { text: string; rx?: PrescriptionItem }

interface Draft {
  reason: string; history: string; exam: string; observations: string; dx: { code: string; label: string }[]; orders: Order[]
  followups: FollowupInput[]; admit: boolean
}

const PATHOLOGICAL = ['Personales patológicos', 'Heredofamiliares', 'Gineco-obstétricos']
const NON_PATHOLOGICAL = ['Personales no patológicos']
const draftKey = (id?: string) => `clinara.nota.${id}`
function loadDraft(id?: string): Partial<Draft> {
  try { return JSON.parse(localStorage.getItem(draftKey(id)) ?? '{}') } catch { return {} }
}

const EXAM_GUIDE = ['Aspecto general', 'Piel y mucosas', 'Cabeza y cuello', 'Tórax y pulmones', 'Corazón', 'Abdomen', 'Genitourinario', 'Extremidades', 'Neurológico']
  .map((s) => `${s}: `).join('\n')

const FREQUENT_ORDERS = [
  'Dieta blanda.', 'Dieta hiposódica.', 'Dieta para diabético.', 'Abundantes líquidos orales.', 'Reposo relativo.',
  'Hemograma completo.', 'Examen general de orina.', 'Glucosa en ayunas.', 'Perfil lipídico.', 'Creatinina y nitrógeno ureico.', 'Radiografía de tórax PA.',
  'Control de presión arterial en casa, registro diario.', 'Signos de alarma explicados; acudir a emergencia si empeora.',
  'Cita de control en 1 semana.', 'Cita de control en 1 mes.', 'Cita de control con resultados de laboratorio.',
]

const EMPTY_RX: PrescriptionItem = { drug: '', presentation: '', dose: '1 tableta', route: 'Oral', frequency: 'Cada 8 horas', duration: '5 días', instructions: '' }

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
  const [orders, setOrders] = useState<Order[]>(saved.orders ?? [])
  const [orderText, setOrderText] = useState('')
  const [editingOrder, setEditingOrder] = useState<number | null>(null)
  const [rxOpen, setRxOpen] = useState(false)
  const [draft, setDraft] = useState<PrescriptionItem>(EMPTY_RX)
  const [drugOpen, setDrugOpen] = useState(false)
  const [override, setOverride] = useState(false)
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
    const d: Draft = { reason, history, exam, observations, dx, orders, followups, admit }
    const blank = !history && !exam && !observations && !dx.length && !orders.length && !followups.length
    const t = setTimeout(() => {
      try {
        if (blank) localStorage.removeItem(draftKey(apptId))
        else { localStorage.setItem(draftKey(apptId), JSON.stringify(d)); setSavedAt(time(new Date().toISOString())) }
      } catch { /* sin almacenamiento local */ }
    }, 600)
    return () => clearTimeout(t)
  }, [apptId, reason, history, exam, observations, dx, orders, followups, admit])

  if (!appt || !p || !user) return <div className="page"><div className="empty">No se encontró la cita. Vuelve a la <Link to="/app/agenda">agenda</Link>.</div></div>
  if (appt.status === 'done') return <div className="page"><div className="empty">Esta consulta ya fue firmada. Puedes verla en el <Link to={`/app/pacientes/${p.id}`}>expediente</Link>.</div></div>
  if (!mine) return <div className="page"><div className="empty">Esta cita pertenece a otro médico. Sólo el médico asignado puede firmar la consulta.</div></div>

  const last = chart?.consultations[0]
  const dxMatches = dxQuery.trim()
    ? ICD10.filter((d) => !dx.some((x) => x.code === d.code) && (d.code.toLowerCase().includes(dxQuery.toLowerCase()) || d.label.toLowerCase().includes(dxQuery.toLowerCase()))).slice(0, 6)
    : []
  const drugMatches = draft.drug ? DRUGS.filter((d) => d.name.toLowerCase().includes(draft.drug.toLowerCase())).slice(0, 6) : DRUGS.slice(0, 6)
  const conflict = draft.drug ? allergyConflict(p.allergies, draft.drug) : null
  const rxCount = orders.filter((o) => o.rx).length
  // La receta lleva la identidad del paciente; en adultos es obligatoria
  const needsDni = rxCount > 0 && !p.dni && yearsOld(p.birthDate) >= 18
  const missing = [!reason.trim() && 'el motivo de consulta', !dx.length && 'la impresión diagnóstica', !orders.length && 'al menos una orden en el manejo',
    needsDni && 'el número de identidad para la receta'].filter(Boolean)
  const hospitalized = store.inpatientOf(p.id)

  const addOrder = (text: string) => {
    const t = text.trim()
    if (!t) return
    setOrders([...orders, { text: /[.!?]$/.test(t) ? t : `${t}.` }])
    setOrderText('')
  }
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= orders.length) return
    const next = [...orders]; [next[i], next[j]] = [next[j], next[i]]; setOrders(next)
  }
  const addMedication = (e?: FormEvent) => {
    e?.preventDefault()
    if (!draft.drug.trim() || (conflict && !override)) return
    const rx = { ...draft, drug: draft.drug.trim() }
    setOrders([...orders, { text: medicationOrder(rx), rx }])
    setDraft(EMPTY_RX); setOverride(false); setRxOpen(false)
  }

  const sign = async () => {
    setSigning(true)
    const r = await store.finishConsult({
      appointmentId: appt.id, reason: reason.trim(), symptoms: [], history, exam, observations: observations.trim(), diagnoses: dx, orders: orders.map((o) => o.text),
      plan: '', vitalsId: todayVitals?.id, followups,
    }, orders.flatMap((o) => (o.rx ? [o.rx] : [])))
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
              <VitalsGrid v={todayVitals} />
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
            <div className="panel__head"><div><h2>Plan y manejo</h2><p>Órdenes médicas en el orden en que se indican</p></div></div>
            <div className="panel__body csec__body">
              {orders.length ? (
                <ol className="orders">
                  {orders.map((o, i) => (
                    <li key={i} className={o.rx && allergyConflict(p.allergies, o.rx.drug) ? 'is-warn' : ''}>
                      <span className="orders__n">{i + 1}.</span>
                      {editingOrder === i ? (
                        <input className="input" autoFocus defaultValue={o.text} aria-label={`Editar orden ${i + 1}`}
                          onBlur={(e) => { const t = e.target.value.trim(); setOrders(t ? orders.map((x, j) => (j === i ? { ...x, text: t } : x)) : orders.filter((_, j) => j !== i)); setEditingOrder(null) }}
                          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingOrder(null) }} />
                      ) : (
                        <button className="orders__text" onClick={() => setEditingOrder(i)} title="Toca para editar">
                          {o.rx && <Pill size={13} className="orders__pill" aria-label="Va a la receta" />}{o.text}
                        </button>
                      )}
                      <span className="orders__tools">
                        <button className="icon-btn" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={14} /></button>
                        <button className="icon-btn" aria-label="Bajar" disabled={i === orders.length - 1} onClick={() => move(i, 1)}><ArrowDown size={14} /></button>
                        <button className="icon-btn" aria-label={`Quitar orden ${i + 1}`} onClick={() => setOrders(orders.filter((_, j) => j !== i))}><X size={14} /></button>
                      </span>
                    </li>
                  ))}
                </ol>
              ) : <p className="muted" style={{ fontSize: 14 }}>Agrega las órdenes una por una: dieta, medicamentos, estudios, cuidados y la cita de control.</p>}

              <form className="order-add" onSubmit={(e) => { e.preventDefault(); addOrder(orderText) }}>
                <input ref={orderInput} className="input" value={orderText} onChange={(e) => setOrderText(e.target.value)} placeholder={`${orders.length + 1}. Escribe una orden y presiona Enter`} aria-label="Nueva orden médica" enterKeyHint="done" />
                <button className="btn btn--soft" disabled={!orderText.trim()} aria-label="Agregar orden"><Plus size={16} /></button>
              </form>
              <div className="order-quick">
                <select className="select" value="" aria-label="Órdenes frecuentes" onChange={(e) => { addOrder(e.target.value); orderInput.current?.blur() }}>
                  <option value="">Órdenes frecuentes…</option>
                  {FREQUENT_ORDERS.filter((f) => !orders.some((o) => o.text === f)).map((f) => <option key={f}>{f}</option>)}
                </select>
                <button className={`btn ${rxOpen ? 'btn--ghost' : 'btn--primary'}`} onClick={() => setRxOpen((x) => !x)}><Pill size={15} />{rxOpen ? 'Cerrar' : 'Medicamento'}</button>
              </div>

              {rxOpen && (
                <form className="rx-form" onSubmit={addMedication}>
                  <div className="field suggest">
                    <span>Medicamento</span>
                    <input className="input" autoFocus value={draft.drug} onFocus={() => setDrugOpen(true)} onBlur={() => setTimeout(() => setDrugOpen(false), 150)}
                      onChange={(e) => { setDraft({ ...draft, drug: e.target.value, presentation: '' }); setOverride(false); setDrugOpen(true) }} placeholder="Busca en el vademécum" />
                    {drugOpen && drugMatches.length > 0 && (
                      <div className="suggest__list">
                        {drugMatches.map((d) => <button type="button" key={d.name} onMouseDown={(e) => e.preventDefault()} onClick={() => { setDraft({ ...draft, drug: d.name, presentation: d.presentation, route: defaultRoute(d.presentation) }); setDrugOpen(false) }}>
                          <span>{d.name}</span><span style={{ color: 'var(--muted)', marginLeft: 'auto' }}>{d.presentation}</span>
                        </button>)}
                      </div>
                    )}
                  </div>
                  <div className="form-grid">
                    <label className="field"><span>Presentación</span><input className="input" value={draft.presentation} onChange={(e) => setDraft({ ...draft, presentation: e.target.value })} /></label>
                    <label className="field"><span>Dosis</span><input className="input" value={draft.dose} onChange={(e) => setDraft({ ...draft, dose: e.target.value })} /></label>
                    <label className="field"><span>Vía</span><select className="select" value={draft.route} onChange={(e) => setDraft({ ...draft, route: e.target.value })}>{ROUTES.map((r) => <option key={r}>{r}</option>)}</select></label>
                    <label className="field"><span>Frecuencia</span><select className="select" value={draft.frequency} onChange={(e) => setDraft({ ...draft, frequency: e.target.value })}>{FREQUENCIES.map((f) => <option key={f}>{f}</option>)}</select></label>
                    <label className="field"><span>Duración</span><input className="input" value={draft.duration} onChange={(e) => setDraft({ ...draft, duration: e.target.value })} /></label>
                    <label className="field"><span>Indicaciones</span><input className="input" value={draft.instructions} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} placeholder="Ej. Con los alimentos" /></label>
                  </div>
                  {conflict && (
                    <div className="alert-strip" role="alert" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                      <span style={{ display: 'flex', gap: 8 }}><TriangleAlert size={18} style={{ flex: 'none' }} />{p.firstName} es alérgica/o a {conflict}. {draft.drug} puede provocar una reacción.</span>
                      {!override && <button type="button" className="btn btn--danger btn--sm" style={{ background: '#fff' }} onClick={() => setOverride(true)}>Prescribir de todos modos</button>}
                    </div>
                  )}
                  <button className="btn btn--primary" disabled={!draft.drug.trim() || (!!conflict && !override)}><Plus size={16} />Agregar al manejo</button>
                </form>
              )}
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
                <form className="dni-ask" onSubmit={async (e) => { e.preventDefault(); if (dni.trim().length >= 6) await updatePatient(p.id, { dni: dni.trim() }) }}>
                  <label className="field"><span>La receta lleva el número de identidad del paciente</span>
                    <input className="input" value={dni} onChange={(e) => setDni(e.target.value)} placeholder="0801-1990-00000" inputMode="numeric" /></label>
                  <button className="btn btn--soft" disabled={dni.trim().length < 6}>Guardar identidad</button>
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
