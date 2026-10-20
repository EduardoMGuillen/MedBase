import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Camera, ChevronLeft, ChevronRight, FileText, LogOut, NotebookPen, Pill, Plus, TriangleAlert, X } from 'lucide-react'
import { useStore, type NewMed } from '../lib/store'
import { Loading, Modal } from '../components/ui'
import { PatientHeader } from '../components/PatientHeader'
import { date, dateTime, defaultRoute, fullName, inputDateTime, ROUTES, time } from '../lib/format'
import { allergyConflict, DRUGS, FREQUENCIES } from '../lib/catalogs'
import { doseTimes, INPATIENT_FREQUENCIES, medLabel, slotState, stayDay, type SlotState } from '../lib/inpatient'
import type { Dose, HospProcedure, InpatientFile as File, InpatientMed, InpatientNote, Patient, PrescriptionItem } from '../lib/types'
import { bedLabel, DxPicker } from './Inpatients'
import { Identification } from './PatientChart'
import { toBase64 } from './Attachments'

type Tab = 'sheet' | 'meds' | 'notes' | 'nursing' | 'labs' | 'procedures' | 'discharge'

export default function InpatientFile() {
  const { id } = useParams()
  const { fetchInpatient, notify, patient, bed, staffById, can } = useStore()
  const [file, setFile] = useState<File | null>(null)
  const [tab, setTab] = useState<Tab>('meds')
  const [missing, setMissing] = useState(false)
  const load = useCallback(() => {
    if (!id) return
    fetchInpatient(id).then(setFile).catch((e: Error) => { setMissing(true); notify(e.message, 'error') })
  }, [id, fetchInpatient, notify])
  useEffect(load, [load])

  if (missing) return <div className="page"><div className="empty">No se encontró esta hospitalización. Vuelve a <Link to="/app/hospitalizados">Hospitalizados</Link>.</div></div>
  if (!file) return <Loading label="Abriendo expediente de hospitalización" />
  const h = file.hospitalization
  const p = patient(h.patientId)
  if (!p) return <Loading />
  const b = bed(h.bedId)
  const open = h.status === 'active'
  const medical = file.notes.filter((n) => n.kind === 'admission' || n.kind === 'evolution')
  const nursing = file.notes.filter((n) => n.kind === 'nursing')
  const tabs: [Tab, string][] = [
    ['sheet', 'Hoja de hospitalización'], ['meds', 'Medicamentos'], ['notes', `Notas médicas (${medical.length})`], ['nursing', `Enfermería (${nursing.length})`],
    ['labs', `Laboratorios (${file.labs.length})`], ['procedures', `Procedimientos (${file.procedures.length})`], ['discharge', open ? 'Egreso' : 'Nota de egreso'],
  ]

  return (
    <div className="page page--chart">
      <div className="sticky-top">
        <PatientHeader p={p} clinical link>
          {open && can('inpatient.orders') && <button className="btn btn--ghost btn--sm" onClick={() => setTab('discharge')}><LogOut size={15} />Nota de egreso</button>}
        </PatientHeader>
        <div className="hosp-bar">
          <span><b>{bedLabel(b)}</b>, {b?.specialty}</span>
          <span>Ingresó {dateTime(h.admittedAt)}</span>
          {open ? <span className="badge badge--mint">Día {stayDay(h.admittedAt)} de estancia</span>
            : <span className="badge badge--done">Egresó {h.dischargedAt && dateTime(h.dischargedAt)}</span>}
          <span className="muted">{h.diagnoses.map((d) => d.label).join('; ')}</span>
        </div>
        <div className="tabs tabs--scroll" role="tablist">
          {tabs.map(([k, label]) => <button key={k} className="tab" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{label}</button>)}
        </div>
      </div>

      {tab === 'sheet' && (
        <div className="hc">
          <section className="panel hc__sec">
            <div className="panel__head"><h2>Hoja de hospitalización</h2></div>
            <div className="panel__body">
              <dl className="facts">
                <div><dt>Fecha y hora del ingreso</dt><dd>{date(h.admittedAt, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, {time(h.admittedAt)}</dd></div>
                <div><dt>Cama</dt><dd>{bedLabel(b)}, {b?.specialty}</dd></div>
                <div><dt>Ingresado por</dt><dd>{staffById(h.admittedBy)?.name}</dd></div>
                <div><dt>Procedencia</dt><dd>{h.consultationId ? <Link to={`/app/nota/${h.consultationId}`}>Consulta externa</Link> : 'Emergencia o ingreso directo'}</dd></div>
                <div><dt>Quién lo acompaña</dt><dd>{h.companionName ? `${h.companionName}${h.companionRelation ? ` (${h.companionRelation})` : ''}` : <span className="muted">Sin dato</span>}</dd></div>
                <div><dt>Teléfono del acompañante</dt><dd>{h.companionPhone || <span className="muted">Sin dato</span>}</dd></div>
                <div><dt>Teléfono del paciente</dt><dd>{h.patientPhone || p.phone}</dd></div>
                <div><dt>Motivo del ingreso</dt><dd>{h.reason}</dd></div>
              </dl>
              <h4 style={{ marginTop: 16 }}>Diagnósticos de ingreso</h4>
              <ol className="note__list">{h.diagnoses.map((d) => <li key={d.code + d.label}>{d.label} <span className="muted">({d.code})</span></li>)}</ol>
            </div>
          </section>
          <section className="panel hc__sec">
            <div className="panel__head"><h2>Datos generales</h2></div>
            <div className="panel__body"><Identification p={p} /></div>
          </section>
        </div>
      )}

      {tab === 'meds' && <MedSheet file={file} p={p} reload={load} onWriteNote={() => setTab('notes')} />}
      {tab === 'notes' && <MedicalNotes file={file} p={p} reload={load} />}
      {tab === 'nursing' && <NursingNotes file={file} reload={load} />}
      {tab === 'labs' && <Labs file={file} reload={load} />}
      {tab === 'procedures' && <Procedures file={file} reload={load} />}
      {tab === 'discharge' && <Discharge file={file} p={p} reload={load} />}
    </div>
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
  const end = new Date(day); end.setDate(end.getDate() + 1)
  const open = file.hospitalization.status === 'active'
  const admitted = new Date(file.hospitalization.admittedAt); admitted.setHours(0, 0, 0, 0)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const shift = (n: number) => { const d = new Date(day); d.setDate(d.getDate() + n); setDay(d) }
  const dosesOf = (m: InpatientMed) => file.doses.filter((d) => d.medId === m.id)
  const meds = [...file.meds].sort((a, b) => Number(!!a.stoppedAt) - Number(!!b.stoppedAt) || a.orderedAt.localeCompare(b.orderedAt))
    .filter((m) => new Date(m.firstAt) < end && (!m.stoppedAt || new Date(m.stoppedAt) >= day || dosesOf(m).some((d) => new Date(d.givenAt) >= day)))
  const care = can('inpatient.care') && open

  return (
    <section className="panel">
      <div className="panel__head">
        <div><h2>Hoja de medicamentos</h2><p>Se llena sola con lo que el médico indica en sus notas. {care ? 'Toca una hora para registrar la dosis.' : 'Enfermería registra cada dosis.'}</p></div>
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
                    <span className="muted">{m.presentation ? `${m.presentation}. ` : ''}{m.instructions ? `${m.instructions} ` : ''}Indicó {staffById(m.orderedBy)?.name}, {dateTime(m.orderedAt)}</span>
                    {conflict && <span className="chip chip--red"><TriangleAlert size={12} />Alergia a {conflict}</span>}
                  </div>
                  {m.stoppedAt ? <span className="badge badge--red">Omitido {dateTime(m.stoppedAt)}</span> : <span className="badge badge--mint">Activo</span>}
                </div>
                <div className="slots">
                  {slots.map((s) => {
                    const dose = doses.find((d) => d.scheduledAt && new Date(d.scheduledAt).getTime() === s.at.getTime())
                    const st = slotState(s.at, s.omitted, dose)
                    const clickable = care && !dose && !s.omitted
                    return (
                      <button key={s.at.toISOString()} className={`slot2 slot2--${st}`} disabled={!clickable} onClick={() => setMarking({ med: m, at: s.at })}
                        title={dose ? `${STATE_LABEL[st]} a las ${time(dose.givenAt)} por ${staffById(dose.givenBy)?.name}${dose.note ? `: ${dose.note}` : ''}` : STATE_LABEL[st]}>
                        <b>{time(s.at.toISOString())}</b>
                        <small>{dose ? `${dose.status === 'given' ? '✓' : '✗'} ${time(dose.givenAt)} ${staffById(dose.givenBy)?.name.replace(/^Lic\.\s*/, '').split(' ')[0] ?? ''}` : STATE_LABEL[st]}</small>
                      </button>
                    )
                  })}
                  {m.prn && (<>
                    {prnToday.map((d) => (
                      <span key={d.id} className="slot2 slot2--given" title={d.note}><b>{time(d.givenAt)}</b><small>✓ {staffById(d.givenBy)?.name.replace(/^Lic\.\s*/, '').split(' ')[0]}</small></span>
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
    </section>
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
  { key: 'plan', letter: 'P', label: 'Plan', hint: 'Dieta, cuidados, estudios. Los medicamentos van abajo.' },
]

function MedicalNotes({ file, p, reload }: { file: File; p: Patient; reload: () => void }) {
  const { staffById, can } = useStore()
  const notes = file.notes.filter((n) => n.kind === 'admission' || n.kind === 'evolution')
  const hasAdmission = notes.some((n) => n.kind === 'admission')
  const [writing, setWriting] = useState(false)
  const open = file.hospitalization.status === 'active'
  return (
    <div className="hc">
      {open && can('inpatient.orders') && (
        <section className="panel">
          <div className="panel__body" style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <p className="muted">{hasAdmission ? 'Cada nota de evolución lleva subjetivo, objetivo, análisis y plan. Los medicamentos que indiques pasan a la hoja de enfermería.' : 'Lo primero es la nota de ingreso, con las indicaciones de medicamentos.'}</p>
            <button className="btn btn--primary" onClick={() => setWriting(true)}><NotebookPen size={16} />{hasAdmission ? 'Nueva nota de evolución' : 'Escribir nota de ingreso'}</button>
          </div>
        </section>
      )}
      {notes.length ? notes.map((n) => {
        const added = file.meds.filter((m) => m.noteId === n.id)
        const stopped = file.meds.filter((m) => m.stoppedAt === n.at && m.stoppedBy === n.authorId)
        return (
          <article key={n.id} className="panel consult-entry">
            <div className="panel__head">
              <div><h2>{n.kind === 'admission' ? 'Nota de ingreso' : 'Nota de evolución'}</h2><p>{date(n.at, { weekday: 'long', day: 'numeric', month: 'long' })}, {time(n.at)}, {staffById(n.authorId)?.name}</p></div>
            </div>
            <div className="panel__body">
              <div className="note">
                {SOAP.map((s) => <div key={s.key} className="note__sec"><h4>{s.letter}. {s.label}</h4><p>{n[s.key]}</p></div>)}
                {(added.length > 0 || stopped.length > 0) && (
                  <div className="note__sec"><h4>Indicaciones de medicamentos</h4>
                    <ul className="note__list">
                      {added.map((m) => <li key={m.id}>{medLabel(m)}{m.instructions ? `. ${m.instructions}` : ''}</li>)}
                      {stopped.map((m) => <li key={m.id}><b>OMITIR</b> {m.drug}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </article>
        )
      }) : <section className="panel"><div className="empty">Todavía no hay notas médicas.</div></section>}
      {writing && <NoteEditor file={file} p={p} kind={hasAdmission ? 'evolution' : 'admission'} onClose={() => setWriting(false)} onSaved={() => { setWriting(false); reload() }} />}
    </div>
  )
}

const EMPTY_MED: NewMed = { drug: '', presentation: '', dose: '', route: 'Intravenosa', everyHours: 8, prn: false, instructions: '' }

function NoteEditor({ file, p, kind, onClose, onSaved }: { file: File; p: Patient; kind: 'admission' | 'evolution'; onClose: () => void; onSaved: () => void }) {
  const { addInpatientNote } = useStore()
  const [n, setN] = useState({ subjective: '', objective: '', assessment: kind === 'admission' ? file.hospitalization.diagnoses.map((d) => d.label).join('. ') : '', plan: '' })
  const [meds, setMeds] = useState<NewMed[]>([])
  const [stop, setStop] = useState<string[]>([])
  const [adding, setAdding] = useState(kind === 'admission')
  const [busy, setBusy] = useState(false)
  const active = file.meds.filter((m) => !m.stoppedAt)
  const ready = SOAP.every((s) => n[s.key].trim())
  return (
    <Modal title={kind === 'admission' ? 'Nota de ingreso' : 'Nota de evolución'} wide onClose={onClose} footer={<>
      <span className="muted" style={{ marginRight: 'auto', fontSize: 13.5 }}>{meds.length ? `${meds.length} medicamento(s) nuevo(s)` : ''}{stop.length ? `${meds.length ? ', ' : ''}${stop.length} omitido(s)` : ''}</span>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!ready || busy} onClick={async () => {
        setBusy(true)
        const ok = await addInpatientNote(file.hospitalization.id, { kind, ...n, meds, stopMedIds: stop })
        setBusy(false)
        if (ok) onSaved()
      }}>Guardar nota</button>
    </>}>
      {p.allergies.length > 0 && <div className="alert-strip"><TriangleAlert size={16} />Alergias: {p.allergies.join(', ')}</div>}
      <div className="form-grid">
        {SOAP.map((s) => (
          <label key={s.key} className="field"><span>{s.letter}. {s.label} <small style={{ fontWeight: 400 }}>{s.hint}</small></span>
            <textarea className="textarea" rows={3} value={n[s.key]} onChange={(e) => setN({ ...n, [s.key]: e.target.value })} /></label>
        ))}
      </div>
      {active.length > 0 && (
        <fieldset className="fs"><legend>Medicamentos activos</legend>
          <p className="muted" style={{ fontSize: 13.5 }}>Marca OMITIR para suspender un medicamento; desde ahora la hoja de enfermería lo mostrará omitido.</p>
          <div className="rows">
            {active.map((m) => (
              <label key={m.id} className="omit-row">
                <span className={stop.includes(m.id) ? 'struck' : ''}>{medLabel(m)}</span>
                <span><input type="checkbox" checked={stop.includes(m.id)} onChange={(e) => setStop(e.target.checked ? [...stop, m.id] : stop.filter((x) => x !== m.id))} /> OMITIR</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset className="fs"><legend>Indicar medicamentos</legend>
        {meds.length > 0 && <ol className="orders">{meds.map((m, i) => (
          <li key={i}><span className="orders__n">{i + 1}.</span><span className="orders__text"><Pill size={13} className="orders__pill" />{medLabel(m)}{m.instructions ? `. ${m.instructions}` : ''}</span>
            <span className="orders__tools"><button className="icon-btn" aria-label="Quitar" onClick={() => setMeds(meds.filter((_, j) => j !== i))}><X size={14} /></button></span></li>
        ))}</ol>}
        {adding ? <MedForm p={p} onAdd={(m) => { setMeds([...meds, m]); setAdding(false) }} onCancel={() => setAdding(false)} />
          : <button className="btn btn--soft" onClick={() => setAdding(true)}><Plus size={15} />Agregar medicamento</button>}
      </fieldset>
    </Modal>
  )
}

function MedForm({ p, onAdd, onCancel }: { p: Patient; onAdd: (m: NewMed) => void; onCancel: () => void }) {
  const [m, setM] = useState<NewMed>({ ...EMPTY_MED, firstAt: inputDateTime(new Date()) })
  const [freq, setFreq] = useState('8')
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

// ---------- Procedimientos y autorizaciones ----------

const PROC_STATUS: Record<HospProcedure['status'], { label: string; tone: string }> = {
  pending: { label: 'Pendiente', tone: 'amber' }, authorized: { label: 'Autorizado', tone: 'ink' }, done: { label: 'Realizado', tone: 'mint' }, denied: { label: 'Denegado', tone: 'red' },
}

function Procedures({ file, reload }: { file: File; reload: () => void }) {
  const { addProcedure, updateProcedure, staffById } = useStore()
  const [kind, setKind] = useState<HospProcedure['kind']>('procedure')
  const [name, setName] = useState('')
  const [when, setWhen] = useState('')
  const [notes, setNotes] = useState('')
  const open = file.hospitalization.status === 'active'
  return (
    <div className="hc">
      {open && (
        <section className="panel">
          <div className="panel__head"><h2>Registrar</h2></div>
          <div className="panel__body form-grid">
            <div className="field span-2"><span>Tipo</span>
              <div className="segmented" role="radiogroup">
                <button role="radio" aria-checked={kind === 'procedure'} onClick={() => setKind('procedure')}>Procedimiento</button>
                <button role="radio" aria-checked={kind === 'authorization'} onClick={() => setKind('authorization')}>Autorización</button>
              </div></div>
            <label className="field"><span>{kind === 'procedure' ? 'Procedimiento' : 'Qué se solicita y a quién'}</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'procedure' ? 'Ej. Apendicectomía laparoscópica' : 'Ej. Autorización de la aseguradora para cirugía'} /></label>
            <label className="field"><span>Fecha y hora programada (opcional)</span><input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></label>
            <label className="field span-2"><span>Notas (opcional)</span><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
            <button className="btn btn--primary" style={{ justifySelf: 'start' }} disabled={name.trim().length < 3} onClick={async () => {
              if (await addProcedure(file.hospitalization.id, { kind, name: name.trim(), scheduledAt: when ? new Date(when).toISOString() : undefined, notes: notes.trim() || undefined })) {
                setName(''); setWhen(''); setNotes(''); reload()
              }
            }}><Plus size={15} />Registrar</button>
          </div>
        </section>
      )}
      <section className="panel">
        {file.procedures.length ? <div className="rows">{file.procedures.map((x) => (
          <div key={x.id} className="row" style={{ gridTemplateColumns: '1fr auto' }}>
            <div className="row__who">
              <strong>{x.name}</strong>
              <span>{x.kind === 'procedure' ? 'Procedimiento' : 'Autorización'}{x.scheduledAt ? `, programado ${dateTime(x.scheduledAt)}` : ''}. Registró {staffById(x.createdBy)?.name}.
                {x.updatedBy ? ` Último cambio: ${staffById(x.updatedBy)?.name}, ${dateTime(x.updatedAt!)}.` : ''}</span>
              {x.notes && <span>{x.notes}</span>}
            </div>
            {open ? (
              <select className="select" value={x.status} aria-label={`Estado de ${x.name}`} onChange={async (e) => { if (await updateProcedure(x.id, { status: e.target.value as HospProcedure['status'] })) reload() }}>
                {Object.entries(PROC_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            ) : <span className={`badge badge--${PROC_STATUS[x.status].tone}`}>{PROC_STATUS[x.status].label}</span>}
          </div>
        ))}</div> : <div className="empty">Sin procedimientos ni autorizaciones.</div>}
      </section>
    </div>
  )
}

// ---------- Egreso ----------

const CONDITIONS = ['Mejorado', 'Curado', 'Estable', 'Alta voluntaria', 'Trasladado a otro centro']
const EMPTY_RX: PrescriptionItem = { drug: '', presentation: '', dose: '1 tableta', route: 'Oral', frequency: 'Cada 8 horas', duration: '5 días', instructions: '' }

function Discharge({ file, p, reload }: { file: File; p: Patient; reload: () => void }) {
  const { can, discharge, staffById } = useStore()
  const nav = useNavigate()
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
          {h.prescriptionId && <Link className="btn btn--ghost btn--sm" to={`/app/recetas/${h.prescriptionId}`}><FileText size={15} />Receta de egreso</Link>}
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
  return (
    <section className="panel">
      <div className="panel__head"><div><h2>Nota de egreso</h2><p>Al guardarla se cierra el expediente de hospitalización, se libera la cama y, si agregas medicamentos, se emite la receta.</p></div></div>
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
          {items.length > 0 && <ol className="orders">{items.map((it, i) => (
            <li key={i}><span className="orders__n">{i + 1}.</span><span className="orders__text"><Pill size={13} className="orders__pill" />{it.drug} {it.presentation}: {it.dose} {it.frequency.toLowerCase()} por {it.duration}</span>
              <span className="orders__tools"><button className="icon-btn" aria-label="Quitar" onClick={() => setItems(items.filter((_, j) => j !== i))}><X size={14} /></button></span></li>
          ))}</ol>}
          <form className="form-grid" onSubmit={(e) => { e.preventDefault(); if (rx.drug.trim()) { setItems([...items, { ...rx, drug: rx.drug.trim() }]); setRx(EMPTY_RX) } }}>
            <label className="field"><span>Medicamento</span><input className="input" list="dc-drugs" value={rx.drug}
              onChange={(e) => { const d = DRUGS.find((x) => x.name === e.target.value); setRx({ ...rx, drug: e.target.value, presentation: d?.presentation ?? rx.presentation }) }} />
              <datalist id="dc-drugs">{DRUGS.map((d) => <option key={d.name} value={d.name} />)}</datalist></label>
            <label className="field"><span>Presentación</span><input className="input" value={rx.presentation} onChange={(e) => setRx({ ...rx, presentation: e.target.value })} /></label>
            <label className="field"><span>Dosis</span><input className="input" value={rx.dose} onChange={(e) => setRx({ ...rx, dose: e.target.value })} /></label>
            <label className="field"><span>Frecuencia</span><select className="select" value={rx.frequency} onChange={(e) => setRx({ ...rx, frequency: e.target.value })}>{FREQUENCIES.map((x) => <option key={x}>{x}</option>)}</select></label>
            <label className="field"><span>Duración</span><input className="input" value={rx.duration} onChange={(e) => setRx({ ...rx, duration: e.target.value })} /></label>
            <button className="btn btn--soft" style={{ alignSelf: 'end' }} disabled={!rx.drug.trim()}><Plus size={15} />Agregar</button>
          </form>
          {allergyConflict(p.allergies, rx.drug) && <div className="alert-strip"><TriangleAlert size={16} />{p.firstName} es alérgica/o a {allergyConflict(p.allergies, rx.drug)}.</div>}
        </fieldset>
        <button className="btn btn--primary btn--lg" style={{ justifySelf: 'start' }} disabled={!ready || busy} onClick={async () => {
          setBusy(true)
          const r = await discharge(h.id, { diagnoses: dx, summary: f.summary.trim(), condition: f.condition, instructions: f.instructions.trim(), followUp: f.followUp.trim() || undefined, items })
          setBusy(false)
          if (r) { if (r.prescriptionId) nav(`/app/recetas/${r.prescriptionId}`); else reload() }
        }}><LogOut size={17} />Dar de alta a {fullName(p).split(' ')[0]}</button>
      </div>
    </section>
  )
}
