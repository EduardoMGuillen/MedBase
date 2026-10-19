import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Activity, Plus, TriangleAlert, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { PageHead } from '../components/ui'
import { age, date, fullName } from '../lib/format'
import { DRUGS, FREQUENCIES, ICD10, SYMPTOMS, allergyConflict } from '../lib/catalogs'
import { VitalsGrid } from './PatientChart'
import { VitalsModal } from './WaitingRoom'
import type { PrescriptionItem } from '../lib/types'

const EMPTY_ITEM: PrescriptionItem = { drug: '', presentation: '', dose: '1 tableta', frequency: 'Cada 8 horas', duration: '5 días', instructions: '' }

export default function Consultation() {
  const { apptId } = useParams()
  const store = useStore()
  const { appointments, patient, vitals, consultations, user, setStatus } = store
  const nav = useNavigate()
  const appt = appointments.find((a) => a.id === apptId)
  const p = appt && patient(appt.patientId)

  const [reason, setReason] = useState(appt?.reason ?? '')
  const [symptoms, setSymptoms] = useState<string[]>([])
  const [onset, setOnset] = useState('1 a 3 días')
  const [history, setHistory] = useState('')
  const [exam, setExam] = useState('')
  const [dxQuery, setDxQuery] = useState('')
  const [dx, setDx] = useState<{ code: string; label: string }[]>([])
  const [plan, setPlan] = useState('')
  const [items, setItems] = useState<PrescriptionItem[]>([])
  const [draft, setDraft] = useState<PrescriptionItem>(EMPTY_ITEM)
  const [drugOpen, setDrugOpen] = useState(false)
  const [override, setOverride] = useState(false)
  const [triage, setTriage] = useState(false)

  useEffect(() => {
    if (appt && ['arrived', 'triaged', 'confirmed', 'scheduled'].includes(appt.status)) setStatus(appt.id, 'in_consult')
    // Sólo al abrir la consulta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appt?.id])

  if (!appt || !p || !user) return <div className="page"><div className="empty">No se encontró la cita. Vuelve a la <Link to="/app/agenda">agenda</Link>.</div></div>
  if (appt.doctorId !== user.id) return <div className="page"><div className="empty">Esta cita pertenece a otro médico. Sólo el médico asignado puede firmar la consulta.</div></div>

  const todayVitals = vitals.find((v) => v.appointmentId === appt.id)
  const last = consultations.filter((c) => c.patientId === p.id).sort((a, b) => b.date.localeCompare(a.date))[0]
  const dxMatches = dxQuery.trim().length > 0
    ? ICD10.filter((d) => !dx.some((x) => x.code === d.code) && (d.code.toLowerCase().includes(dxQuery.toLowerCase()) || d.label.toLowerCase().includes(dxQuery.toLowerCase()))).slice(0, 6)
    : []
  const drugMatches = draft.drug ? DRUGS.filter((d) => d.name.toLowerCase().includes(draft.drug.toLowerCase())).slice(0, 6) : DRUGS.slice(0, 6)
  const conflict = draft.drug ? allergyConflict(p.allergies, draft.drug) : null
  const canSign = reason.trim() && dx.length > 0

  const addItem = () => {
    if (!draft.drug.trim()) return
    setItems([...items, { ...draft, drug: draft.drug.trim() }])
    setDraft(EMPTY_ITEM)
    setOverride(false)
  }

  const sign = () => {
    const { rxId } = store.finishConsult({
      patientId: p.id, doctorId: user.id, appointmentId: appt.id, date: new Date().toISOString(), reason: reason.trim(),
      symptoms, symptomOnset: onset, history, exam, diagnoses: dx, plan, vitalsId: todayVitals?.id,
    }, items)
    nav(rxId ? `/app/recetas/${rxId}` : `/app/pacientes/${p.id}`)
  }

  return (
    <div className="page">
      <PageHead title={`Consulta de ${fullName(p)}`} sub={`${age(p.birthDate)}, expediente ${p.record}`}
        actions={<>
          <Link className="btn btn--ghost" to={`/app/pacientes/${p.id}`}>Ver expediente</Link>
          <button className="btn btn--primary" disabled={!canSign} onClick={sign}>Firmar consulta{items.length ? ' y receta' : ''}</button>
        </>} />

      <div className="consult">
        <section className="panel soap">
          <div className="soap__sec">
            <div className="soap__title"><span className="soap__letter">S</span><h3>Lo que refiere el paciente</h3></div>
            <label className="field"><span>Motivo de consulta</span><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
            <div className="field">
              <span>Síntomas</span>
              <div className="chips">
                {SYMPTOMS.map((s) => (
                  <button key={s} type="button" className="chip" aria-pressed={symptoms.includes(s)}
                    onClick={() => setSymptoms(symptoms.includes(s) ? symptoms.filter((x) => x !== s) : [...symptoms, s])}>{s}</button>
                ))}
              </div>
            </div>
            <div className="form-grid">
              <label className="field"><span>Desde hace</span>
                <select className="select" value={onset} onChange={(e) => setOnset(e.target.value)}>
                  {['Hoy', '1 a 3 días', '4 a 7 días', '1 a 4 semanas', 'Más de un mes'].map((o) => <option key={o}>{o}</option>)}
                </select>
              </label>
            </div>
            <label className="field"><span>Padecimiento actual</span><textarea className="textarea" value={history} onChange={(e) => setHistory(e.target.value)} placeholder="Evolución, factores que agravan o alivian, tratamientos previos" /></label>
          </div>

          <div className="soap__sec">
            <div className="soap__title"><span className="soap__letter">O</span><h3>Lo que encuentras</h3>
              {!todayVitals && <button className="btn btn--soft btn--sm" style={{ marginLeft: 'auto' }} onClick={() => setTriage(true)}><Activity size={15} />Tomar signos</button>}
            </div>
            {todayVitals ? <VitalsGrid v={todayVitals} /> : <p style={{ color: 'var(--muted)', fontSize: 14 }}>Enfermería aún no registra signos vitales para esta cita.</p>}
            {todayVitals?.notes && <p style={{ fontSize: 14, color: 'var(--muted)' }}>Nota de triaje: {todayVitals.notes}</p>}
            <label className="field"><span>Exploración física</span><textarea className="textarea" value={exam} onChange={(e) => setExam(e.target.value)} placeholder="Hallazgos por aparatos y sistemas" /></label>
          </div>

          <div className="soap__sec">
            <div className="soap__title"><span className="soap__letter">A</span><h3>Diagnóstico</h3><p>Al menos uno para firmar</p></div>
            {dx.length > 0 && <div className="tl__dx" style={{ marginTop: 0 }}>{dx.map((d) => (
              <span key={d.code} className="dx" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><code>{d.code}</code>{d.label}
                <button className="icon-btn" style={{ width: 20, height: 20 }} aria-label={`Quitar ${d.label}`} onClick={() => setDx(dx.filter((x) => x.code !== d.code))}><X size={13} /></button>
              </span>
            ))}</div>}
            <div className="suggest">
              <input className="input" value={dxQuery} onChange={(e) => setDxQuery(e.target.value)} placeholder="Busca por nombre o código CIE-10, por ejemplo faringitis o J02" aria-label="Buscar diagnóstico" />
              {dxMatches.length > 0 && (
                <div className="suggest__list">
                  {dxMatches.map((d) => <button key={d.code} onClick={() => { setDx([...dx, d]); setDxQuery('') }}><code>{d.code}</code>{d.label}</button>)}
                </div>
              )}
            </div>
          </div>

          <div className="soap__sec">
            <div className="soap__title"><span className="soap__letter">P</span><h3>Plan y receta</h3></div>
            <label className="field"><span>Plan e indicaciones</span><textarea className="textarea" value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="Estudios, medidas generales, cuándo volver" /></label>

            {items.map((it, i) => (
              <div key={i} className={`rx-item ${allergyConflict(p.allergies, it.drug) ? 'rx-item--warn' : ''}`}>
                <div><strong>{it.drug}</strong> <span style={{ color: 'var(--muted)', fontSize: 13 }}>{it.presentation}</span>
                  <p>{it.dose}, {it.frequency.toLowerCase()}, durante {it.duration}.{it.instructions ? ` ${it.instructions}` : ''}</p></div>
                <button className="icon-btn" aria-label={`Quitar ${it.drug}`} onClick={() => setItems(items.filter((_, j) => j !== i))}><X size={16} /></button>
              </div>
            ))}

            <div className="form-grid form-grid--4" style={{ alignItems: 'end' }}>
              <div className="field span-2 suggest">
                <span>Medicamento</span>
                <input className="input" value={draft.drug} onFocus={() => setDrugOpen(true)} onBlur={() => setTimeout(() => setDrugOpen(false), 150)}
                  onChange={(e) => { setDraft({ ...draft, drug: e.target.value, presentation: '' }); setOverride(false) }} placeholder="Busca en el vademécum" />
                {drugOpen && drugMatches.length > 0 && (
                  <div className="suggest__list">
                    {drugMatches.map((d) => <button key={d.name} onMouseDown={(e) => e.preventDefault()} onClick={() => { setDraft({ ...draft, drug: d.name, presentation: d.presentation }); setDrugOpen(false) }}>
                      <span>{d.name}</span><span style={{ color: 'var(--muted)', marginLeft: 'auto' }}>{d.presentation}</span>
                    </button>)}
                  </div>
                )}
              </div>
              <label className="field"><span>Dosis</span><input className="input" value={draft.dose} onChange={(e) => setDraft({ ...draft, dose: e.target.value })} /></label>
              <label className="field"><span>Duración</span><input className="input" value={draft.duration} onChange={(e) => setDraft({ ...draft, duration: e.target.value })} /></label>
              <label className="field span-2"><span>Frecuencia</span>
                <select className="select" value={draft.frequency} onChange={(e) => setDraft({ ...draft, frequency: e.target.value })}>{FREQUENCIES.map((f) => <option key={f}>{f}</option>)}</select>
              </label>
              <label className="field span-2"><span>Indicaciones</span><input className="input" value={draft.instructions} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} placeholder="Ej. Tomar con alimentos" /></label>
            </div>
            {conflict && (
              <div className="alert-strip" role="alert" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}><TriangleAlert size={18} />{p.firstName} es alérgica/o a {conflict}. {draft.drug} puede provocar una reacción.</span>
                {!override && <button className="btn btn--danger btn--sm" style={{ background: '#fff' }} onClick={() => setOverride(true)}>Prescribir de todos modos</button>}
              </div>
            )}
            <button className="btn btn--soft" style={{ justifySelf: 'start' }} disabled={!draft.drug.trim() || (!!conflict && !override)} onClick={addItem}><Plus size={16} />Agregar a la receta</button>
          </div>
        </section>

        <aside className="consult__aside">
          <section className="panel">
            <div className="panel__head"><h2>Paciente</h2></div>
            <div className="panel__body" style={{ display: 'grid', gap: 14 }}>
              {p.allergies.length ? <div className="alert-strip"><TriangleAlert size={18} />Alergias: {p.allergies.join(', ')}</div> : <div className="alert-strip alert-strip--calm">Sin alergias conocidas</div>}
              <div>
                <h3 style={{ fontSize: 14, marginBottom: 6 }}>Problemas activos</h3>
                {p.conditions.length ? <div className="chips">{p.conditions.map((c) => <span key={c} className="chip">{c}</span>)}</div> : <p style={{ fontSize: 14, color: 'var(--muted)' }}>Ninguno registrado</p>}
              </div>
              {last && (
                <div>
                  <h3 style={{ fontSize: 14, marginBottom: 6 }}>Consulta anterior, {date(last.date)}</h3>
                  <p style={{ fontSize: 14 }}>{last.reason}</p>
                  <div className="tl__dx">{last.diagnoses.map((d) => <span key={d.code} className="dx"><code>{d.code}</code>{d.label}</span>)}</div>
                  <p style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 8 }}>{last.plan}</p>
                </div>
              )}
            </div>
          </section>
          <section className="panel">
            <div className="panel__body" style={{ display: 'grid', gap: 10 }}>
              <p style={{ fontSize: 14, color: 'var(--muted)' }}>
                {canSign ? `Al firmar se cierra la cita${items.length ? ` y se emite una receta con ${items.length} medicamento${items.length > 1 ? 's' : ''}` : ''}.` : 'Para firmar escribe el motivo y agrega al menos un diagnóstico.'}
              </p>
              <button className="btn btn--primary" disabled={!canSign} onClick={sign}>Firmar consulta{items.length ? ' y receta' : ''}</button>
            </div>
          </section>
        </aside>
      </div>
      {triage && <VitalsModal appt={appt} onClose={() => setTriage(false)} onSaved={() => setTriage(false)} />}
    </div>
  )
}
