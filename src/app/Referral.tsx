import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Ban, ChevronLeft, Download, Printer, Send } from 'lucide-react'
import { useStore, type ReferralFrom } from '../lib/store'
import { Loading, Modal } from '../components/ui'
import { date, dmy, dmyTime, time } from '../lib/format'
import { REFERRAL_CONSENT, REFERRAL_FOOTER } from '../lib/clinicalConfig'
import { stayPath } from '../lib/inpatient'
import { useDraftSync } from '../lib/drafts'
import { Addenda, DraftBadge } from '../components/Addenda'
import type { Referral, ReferralData } from '../lib/types'
import { DocHeader } from '../components/DocHeader'

type Editable = { reason: string; history: string; exam: string; evolution: string; labs: string; condition: string; destination: string; service: string
  priority: 'routine' | 'urgent'; admissionDiagnosis: string; dischargeDiagnosis: string; treatment: string; vitals: string; consent: boolean }

const URGENCY: Record<NonNullable<ReferralData['urgency']>, string> = { emergency: 'Emergencia', urgent: 'Urgente', scheduled: 'Programada (consulta externa o apoyo diagnóstico)' }
const SOURCE_LABEL: Record<NonNullable<ReferralData['source']>, string> = { observation: 'En observación desde', hospital: 'Hospitalizado desde', consultation: 'Consulta externa del' }

/** Lo que el formulario ya trae de un borrador de consulta (la nota todavía no se firmó). */
export type ReferralPrefill = Partial<Pick<Editable, 'history' | 'exam' | 'admissionDiagnosis' | 'dischargeDiagnosis' | 'treatment'>>

/**
 * RF1 (ronda 8): referencia a otro centro desde la observación, la hospitalización o la consulta externa. La misma idea
 * de la epicrisis (diagnóstico de ingreso y de egreso o actual, HEA, tratamiento recibido, examen, condición y resultados)
 * más el motivo de referencia y el destino («Centro o establecimiento al que se refiere», «Servicio o especialidad» y
 * prioridad «Rutina | Urgente»). Se llena con el expediente; todo se edita antes de firmar y se guarda solo como borrador.
 * No se firma sin motivo, sin destino ni sin la casilla de consentimiento (queda con su fecha y hora).
 */
export function ReferralModal({ from, stayKind, prefill, onClose, onSigned }: {
  from: ReferralFrom; stayKind?: 'observation' | 'hospital'; prefill?: ReferralPrefill; onClose: () => void; onSigned?: (r: Referral) => void
}) {
  const { fetchReferralDraft, emitReferral } = useStore()
  const nav = useNavigate()
  const [f, setF] = useState<Editable | null>(null)
  const [busy, setBusy] = useState(false)
  // Borrador con autoguardado (el mismo mecanismo de las notas): reabrir trae lo escrito
  const draft = useDraftSync<{ f: Editable | null }>('referencia', `${from.kind}:${from.id}`, { f }, (d) => { if (d.f) setF(d.f) }, !f)
  // Se carga una sola vez: si se volviera a cargar al redibujar el expediente, borraría lo que el médico escribió
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose })
  useEffect(() => {
    fetchReferralDraft(from).then((d) => setF((x) => x ?? {
      reason: d.reason, history: prefill?.history ?? d.history, exam: prefill?.exam ?? d.exam, evolution: d.evolution, labs: d.labs, condition: d.condition, destination: d.destination,
      service: d.service ?? '', priority: d.priority ?? 'routine', admissionDiagnosis: prefill?.admissionDiagnosis ?? d.admissionDiagnosis ?? d.diagnosis,
      dischargeDiagnosis: prefill?.dischargeDiagnosis ?? d.dischargeDiagnosis ?? d.diagnosis, treatment: prefill?.treatment ?? d.treatment ?? [d.indications, d.medications].filter(Boolean).join('\n'),
      vitals: d.vitals ?? '', consent: false,
    })).catch(() => close.current())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, fetchReferralDraft])
  // El valor se lee en el momento: dentro de la actualización diferida el campo ya volvió a su valor anterior
  const set = (k: keyof Editable) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { const v = e.target.value; setF((x) => x && { ...x, [k]: v }) }
  const stay = from.kind === 'stay'
  const area = (k: keyof Editable, label: string, rows: number, hint?: string) => f && (
    <label key={k} className="field span-2"><span>{label}{hint && <small style={{ fontWeight: 400 }}> {hint}</small>}</span>
      <textarea className="textarea textarea--sm" rows={rows} value={String(f[k] ?? '')} onChange={set(k)} /></label>
  )
  const missing = !f ? [] : [!f.reason.trim() && 'el motivo de referencia', !f.destination.trim() && 'el centro de destino', !f.consent && 'la casilla de consentimiento'].filter(Boolean)
  return (
    <Modal title="Hoja de referencia" wide onClose={onClose}
      top={f && <DraftBadge savedAt={draft.savedAt} restored={draft.restored} offline={draft.offline} />}
      footer={<>
      {f && missing.length > 0 && <span className="field__msg field__msg--warn" style={{ marginRight: 'auto' }}>Para firmar falta {missing.join(', ')}.</span>}
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!f || missing.length > 0 || busy} onClick={async () => {
        if (!f) return
        setBusy(true)
        const r = await emitReferral(from, { ...f, consent: f.consent })
        setBusy(false)
        if (!r) return
        draft.clear()
        if (onSigned) onSigned(r)
        else nav(`/app/referencias/${r.id}${stay ? '?egreso=1' : ''}`)
      }}><Send size={16} />Firmar referencia</button>
    </>}>
      {!f ? <Loading label="Armando la referencia" /> : (<>
        <p className="muted" style={{ fontSize: 13.5 }}>Se llenó con el expediente. Revísala y completa lo que haga falta; se guarda sola como borrador. Firmada ya no se edita: si hay un error, se anula y se emite otra.</p>
        <div className="form-grid">
          <label className="field"><span>Centro o establecimiento al que se refiere</span><input className={`input${!f.destination.trim() ? ' input--warn' : ''}`} value={f.destination} onChange={set('destination')} placeholder="Ej. Hospital Escuela" aria-required="true" /></label>
          <label className="field"><span>Servicio o especialidad</span><input className="input" value={f.service} onChange={set('service')} placeholder="Ej. Cardiología" /></label>
          <div className="field"><span>Prioridad</span>
            <div className="segmented segmented--sm" role="radiogroup" aria-label="Prioridad">
              <button type="button" role="radio" aria-checked={f.priority === 'routine'} onClick={() => setF({ ...f, priority: 'routine' })}>Rutina</button>
              <button type="button" role="radio" aria-checked={f.priority === 'urgent'} onClick={() => setF({ ...f, priority: 'urgent' })}>Urgente</button>
            </div></div>
          <label className="field"><span>Condición del paciente</span><input className="input" value={f.condition} onChange={set('condition')} placeholder="Ej. Estable, consciente, hidratado" /></label>
          {area('reason', 'Motivo de referencia', 2, '(obligatorio)')}
          {area('admissionDiagnosis', stay ? 'Diagnóstico de ingreso' : 'Diagnósticos de la consulta', 2)}
          {stay && area('dischargeDiagnosis', 'Diagnóstico de egreso o actual', 2)}
          {area('history', 'Historia de la enfermedad actual (HEA)', 4)}
          {area('exam', 'Examen físico', 3)}
          <label className="field span-2"><span>Signos vitales</span><input className="input" value={f.vitals} onChange={set('vitals')} placeholder="Ej. PA 120/80 mmHg, FC 88 lpm, FR 18 rpm, T 37 °C, SpO₂ 97%" /></label>
          {stay && area('evolution', stayKind === 'observation' ? 'Evolución en observación' : 'Evolución', 3)}
          {area('treatment', 'Tratamiento recibido', 4, 'Medicamentos (con lo aplicado), procedimientos e indicaciones.')}
          {area('labs', 'Resultados relevantes', 3)}
        </div>
        <label className="check-line"><input type="checkbox" checked={f.consent} onChange={(e) => { const v = e.target.checked; setF((x) => x && { ...x, consent: v }) }} aria-required="true" />
          <span><b>{REFERRAL_CONSENT}</b><small>Obligatoria para firmar. Queda guardada con la fecha y la hora.</small></span></label>
      </>)}
    </Modal>
  )
}

/** RF1 (ronda 8): «Ver», «Imprimir» y «Descargar PDF» de una referencia (lista del expediente y Anexos). */
export function ReferralActions({ r }: { r: Pick<Referral, 'id'> }) {
  return (
    <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <Link className="btn btn--ghost btn--sm" to={`/app/referencias/${r.id}`}>Ver</Link>
      <Link className="btn btn--ghost btn--sm" to={`/app/referencias/${r.id}?accion=imprimir`}><Printer size={14} />Imprimir</Link>
      <Link className="btn btn--ghost btn--sm" to={`/app/referencias/${r.id}?accion=pdf`}><Download size={14} />Descargar PDF</Link>
    </span>
  )
}

const blank = (s?: string) => (s?.trim() ? <p style={{ whiteSpace: 'pre-wrap' }}>{s}</p> : <span className="consent__blank" />)

/**
 * RF1 (ronda 8): hoja de referencia, tamaño carta: membrete, número y fecha, paciente (con alergias), destino y prioridad,
 * motivo, diagnósticos, HEA, examen, tratamiento y resultados, la constancia del consentimiento, firma y sello del médico,
 * y el pie fijo de confidencialidad. Sin contrarreferencia en esta ronda.
 */
export function ReferralSheet({ r }: { r: Referral }) {
  const d = r.data
  // Referencias de antes de la ronda 8 (consultorio, observación): se imprimen como entonces
  if (!d.source) return <LegacySheet r={r} />
  const priority = d.priority ? (d.priority === 'urgent' ? 'Urgente' : 'Rutina') : d.urgency ? URGENCY[d.urgency] : ''
  return (
    <article className="rx-sheet consent referral" style={{ position: 'relative' }}>
      {r.voidedAt && <div className="void-stamp">ANULADA</div>}
      <header className="rx-sheet__head">
        <DocHeader clinic={d.place} doctor={d.doctor} />
        <div className="rx-sheet__folio">Hoja de referencia<b>{r.number}</b>{dmyTime(r.issuedAt)}</div>
      </header>
      <h1 className="cert__title">Hoja de referencia</h1>
      <div className="consent__pt">
        <span>Paciente: <b>{d.patient.name}</b></span><span>Identidad: <b>{d.patient.dni ?? '________________'}</b></span>
        <span>Edad: <b>{d.patient.age}</b></span>{d.patient.sex && <span>Sexo: <b>{d.patient.sex === 'F' ? 'Femenino' : 'Masculino'}</b></span>}<span>Expediente: <b>{d.patient.record}</b></span>
        <span>Alergias: <b>{d.patient.allergies?.length ? d.patient.allergies.join(', ') : d.patient.allergies ? 'Ninguna conocida' : '________________'}</b></span>
        <span>{SOURCE_LABEL[d.source]}: <b>{d.source !== 'consultation' ? dmyTime(d.admittedAt) : dmy(d.admittedAt)}</b></span>
      </div>
      <dl className="consent__info">
        <div><dt>Centro o establecimiento al que se refiere</dt><dd>{blank(d.destination)}</dd></div>
        <div><dt>Servicio o especialidad</dt><dd>{blank(d.service)}</dd></div>
        <div><dt>Prioridad</dt><dd><p>{priority}</p></dd></div>
        <div><dt>Motivo de referencia</dt><dd>{blank(d.reason)}</dd></div>
        <div><dt>{d.source === 'consultation' ? 'Diagnósticos de la consulta' : 'Diagnóstico de ingreso'}</dt><dd>{blank(d.admissionDiagnosis)}</dd></div>
        {d.source !== 'consultation' && <div><dt>Diagnóstico de egreso o actual</dt><dd>{blank(d.dischargeDiagnosis)}</dd></div>}
        <div><dt>Historia de la enfermedad actual (HEA)</dt><dd>{blank(d.history)}</dd></div>
        <div><dt>Examen físico</dt><dd>{blank(d.exam)}</dd></div>
        {d.vitals?.trim() && <div><dt>Signos vitales</dt><dd>{blank(d.vitals)}</dd></div>}
        {d.source !== 'consultation' && d.evolution?.trim() && <div><dt>Evolución</dt><dd>{blank(d.evolution)}</dd></div>}
        <div><dt>Tratamiento recibido</dt><dd>{blank(d.treatment)}</dd></div>
        {d.labs?.trim() && <div><dt>Resultados relevantes</dt><dd>{blank(d.labs)}</dd></div>}
        <div><dt>Condición del paciente</dt><dd>{blank(d.condition)}</dd></div>
      </dl>
      <p className="consent__intro">{d.consentAt || d.informed ? '☒' : '☐'} {REFERRAL_CONSENT}{d.consentAt ? ` (${dmyTime(d.consentAt)})` : ''}</p>
      <div className="consent__signs" style={{ gridTemplateColumns: '1fr' }}>
        <div><span className="consent__line" />Firma y sello del médico<br /><small>{d.doctor.name}{d.doctor.specialty ? `, ${d.doctor.specialty}` : ''}{d.doctor.license ? `. Colegiación ${d.doctor.license}` : ''}</small></div>
      </div>
      {r.voidedAt && <p className="muted">Anulada el {dmyTime(r.voidedAt)}: {r.voidReason}</p>}
      <footer className="rx-sheet__foot referral__legal"><span>{REFERRAL_FOOTER}</span><span>Emitida con Clinara</span></footer>
    </article>
  )
}

function LegacySheet({ r }: { r: Referral }) {
  const d = r.data
  return (
    <article className="rx-sheet consent referral" style={{ position: 'relative' }}>
      {r.voidedAt && <div className="void-stamp">ANULADA</div>}
      <header className="rx-sheet__head">
        <DocHeader clinic={d.place} doctor={d.doctor} />
        <div className="rx-sheet__folio">Referencia<b>{r.number}</b>{date(r.issuedAt)}, {time(r.issuedAt)}</div>
      </header>
      <h1 className="cert__title">Hoja de referencia</h1>
      <div className="consent__pt">
        <span>Paciente: <b>{d.patient.name}</b></span><span>Identidad: <b>{d.patient.dni ?? '________________'}</b></span>
        <span>Edad: <b>{d.patient.age}</b></span>{d.patient.sex && <span>Sexo: <b>{d.patient.sex === 'F' ? 'Femenino' : 'Masculino'}</b></span>}<span>Expediente: <b>{d.patient.record}</b></span>
        <span>En observación desde: <b>{date(d.admittedAt)}, {time(d.admittedAt)}</b></span>
      </div>
      <dl className="consent__info">
        <div><dt>Se refiere a</dt><dd>{blank(d.destination)}</dd></div>
        <div><dt>Motivo de la referencia</dt><dd>{blank(d.reason)}</dd></div>
        <div><dt>Historia de la enfermedad actual</dt><dd>{blank(d.history)}</dd></div>
        <div><dt>Examen físico</dt><dd>{blank(d.exam)}</dd></div>
        <div><dt>Impresión diagnóstica</dt><dd>{blank(d.diagnosis)}</dd></div>
        <div><dt>Indicaciones</dt><dd>{blank(d.indications)}</dd></div>
        <div><dt>Medicamentos aplicados</dt><dd>{blank(d.medications)}</dd></div>
        <div><dt>Evolución</dt><dd>{blank(d.evolution)}</dd></div>
        <div><dt>Laboratorios</dt><dd>{blank(d.labs)}</dd></div>
        <div><dt>Condición al referir</dt><dd>{blank(d.condition)}</dd></div>
      </dl>
      <div className="consent__signs" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div><span className="consent__line" />Firma y sello del médico<br /><small>{d.doctor.name}{d.doctor.license ? `, colegiación ${d.doctor.license}` : ''}</small></div>
        <div><span className="consent__line" />Recibido por (nombre, firma, fecha y hora)</div>
      </div>
      {r.voidedAt && <p className="muted">Anulada: {r.voidReason}</p>}
      <footer className="rx-sheet__foot"><span>{d.place.address}{d.place.phone ? `, tel. ${d.place.phone}` : ''}</span><span>Emitida con Clinara</span></footer>
    </article>
  )
}

/**
 * Página para ver, imprimir, descargar en PDF o anular una referencia. RF1: cada impresión o descarga queda en la
 * bitácora. Recién firmada desde una estancia activa, ofrece «¿Registrar el egreso?» (no lo hace sola).
 */
export default function ReferralPage() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const { fetchReferral, voidReferral, logReferralPrint, notify, user, inpatients } = useStore()
  const nav = useNavigate()
  const [r, setR] = useState<Referral | null>(null)
  const [voiding, setVoiding] = useState(false)
  const [reason, setReason] = useState('')
  const [askDischarge, setAskDischarge] = useState(params.get('egreso') === '1')
  useEffect(() => { if (id) fetchReferral(id).then(setR).catch(() => null) }, [id, fetchReferral])
  const print = (how: 'print' | 'pdf') => {
    if (!r) return
    void logReferralPrint(r.id, how)
    if (how === 'pdf') notify('En la ventana de impresión elige «Guardar como PDF».')
    setTimeout(() => window.print(), 150)
  }
  // Al llegar con ?accion=imprimir|pdf (desde la lista del expediente), una sola vez
  useEffect(() => {
    const a = params.get('accion')
    if (!r || (a !== 'imprimir' && a !== 'pdf')) return
    const q = new URLSearchParams(params); q.delete('accion'); setParams(q, { replace: true })
    print(a === 'pdf' ? 'pdf' : 'print')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r])
  if (!r) return <Loading label="Abriendo referencia" />
  const stay = r.hospitalizationId ? inpatients.find((h) => h.id === r.hospitalizationId && h.status === 'active') : undefined
  const doctor = user?.role === 'doctor'
  return (
    <div className="page">
      <div className="page-head no-print">
        <button className="btn btn--ghost" onClick={() => (r.consultationId ? nav(`/app/nota/${r.consultationId}`) : window.history.length > 1 ? nav(-1) : nav(`/app/pacientes/${r.patientId}`))}><ChevronLeft size={16} />Volver</button>
        <div className="page-head__actions">
          {!r.voidedAt && doctor && <button className="btn btn--ghost" onClick={() => setVoiding(true)}><Ban size={16} />Anular</button>}
          <button className="btn btn--soft" onClick={() => print('pdf')}><Download size={16} />Descargar PDF</button>
          <button className="btn btn--primary" onClick={() => print('print')}><Printer size={16} />Imprimir</button>
        </div>
      </div>
      <p className="muted no-print" style={{ fontSize: 13.5 }}>No se envía por WhatsApp ni por ningún canal automático: se imprime o se descarga y se entrega al paciente o a su familia.</p>
      <ReferralSheet r={r} />
      {/* RF1: firmada no se edita; se corrige con adenda (también sale en la impresión) */}
      <div className="referral-addenda">
        <Addenda list={r.addenda ?? []} targetKind="referral" targetId={r.id} canAdd={doctor && !r.voidedAt} kinds={['correction', 'info']}
          onAdded={() => { if (id) fetchReferral(id).then(setR).catch(() => null) }} />
      </div>
      {voiding && (
        <Modal title={`Anular ${r.number}`} onClose={() => setVoiding(false)} footer={<>
          <button className="btn btn--ghost" onClick={() => setVoiding(false)}>Cancelar</button>
          <button className="btn btn--danger" disabled={reason.trim().length < 5} onClick={async () => { const x = await voidReferral(r.id, reason.trim()); if (x) { setR(x); setVoiding(false) } }}>Anular</button>
        </>}>
          <p>La referencia queda en el expediente marcada como anulada y conserva su número. Después puedes emitir otra.</p>
          <label className="field"><span>Motivo</span><input className="input" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        </Modal>
      )}
      {askDischarge && stay && doctor && (
        <Modal title="¿Registrar el egreso?" onClose={() => setAskDischarge(false)} footer={<>
          <button className="btn btn--ghost" onClick={() => setAskDischarge(false)}>Ahora no</button>
          <button className="btn btn--primary" onClick={() => nav(`${stayPath(stay)}?tab=notas&egreso=traslado`)}>Registrar el egreso</button>
        </>}>
          <p>La referencia no da de alta al paciente: {stay.kind === 'observation' ? 'la observación' : 'la hospitalización'} sigue abierta. Si el paciente sale de la clínica, registra el egreso; se propone la condición «Trasladado a otro centro».</p>
        </Modal>
      )}
    </div>
  )
}
