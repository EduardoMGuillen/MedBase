import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Ban, ChevronLeft, Printer, Send } from 'lucide-react'
import { useStore, type ReferralFrom } from '../lib/store'
import { Loading, Modal } from '../components/ui'
import { date, time } from '../lib/format'
import type { Referral, ReferralData } from '../lib/types'
import { DocHeader } from '../components/DocHeader'

type Editable = Pick<ReferralData, 'reason' | 'history' | 'exam' | 'evolution' | 'labs' | 'condition' | 'destination'>
  & Required<Pick<ReferralData, 'service' | 'urgency' | 'admissionDiagnosis' | 'dischargeDiagnosis' | 'treatment' | 'vitals' | 'contact' | 'companion' | 'transport' | 'informed'>>

const URGENCY: Record<NonNullable<ReferralData['urgency']>, string> = { emergency: 'Emergencia', urgent: 'Urgente', scheduled: 'Programada (consulta externa o apoyo diagnóstico)' }
const SOURCE_LABEL: Record<NonNullable<ReferralData['source']>, string> = { observation: 'En observación desde', hospital: 'Hospitalizado desde', consultation: 'Consulta externa del' }

/**
 * Referencia a otro centro. Ronda 8: sale de la observación, de la hospitalización y de la consulta externa, como una
 * epicrisis (diagnóstico de ingreso y de egreso, HEA, tratamiento recibido) más el motivo de la referencia y los datos del
 * Sistema Nacional de Referencia y Respuesta (SESAL): a dónde y a qué servicio, tipo, signos y condición al referir,
 * acompañante, transporte, con quién se coordinó y la constancia de que se informó al paciente. Vista previa ya llenada con
 * el expediente, que el médico revisa y completa antes de emitir.
 */
export function ReferralModal({ from, stayKind, onClose }: { from: ReferralFrom; stayKind?: 'observation' | 'hospital'; onClose: () => void }) {
  const { fetchReferralDraft, emitReferral } = useStore()
  const nav = useNavigate()
  const [f, setF] = useState<Editable | null>(null)
  const [closeStay, setCloseStay] = useState(true)
  const [busy, setBusy] = useState(false)
  // Se carga una sola vez: si se volviera a cargar al redibujar el expediente, borraría lo que el médico escribió
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose })
  useEffect(() => {
    fetchReferralDraft(from).then((d) => setF((x) => x ?? {
      reason: d.reason, history: d.history, exam: d.exam, evolution: d.evolution, labs: d.labs, condition: d.condition, destination: d.destination,
      service: d.service ?? '', urgency: d.urgency ?? 'urgent', admissionDiagnosis: d.admissionDiagnosis ?? d.diagnosis, dischargeDiagnosis: d.dischargeDiagnosis ?? d.diagnosis,
      treatment: d.treatment ?? [d.indications, d.medications].filter(Boolean).join('\n'), vitals: d.vitals ?? '', contact: d.contact ?? '', companion: d.companion ?? '',
      transport: d.transport ?? '', informed: !!d.informed,
    })).catch(() => close.current())
  }, [from, fetchReferralDraft])
  // El valor se lee en el momento: dentro de la actualización diferida el campo ya volvió a su valor anterior
  const set = (k: keyof Editable) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { const v = e.target.value; setF((x) => x && { ...x, [k]: v }) }
  const stay = from.kind === 'stay'
  const area = (k: keyof Editable, label: string, rows: number, hint?: string) => f && (
    <label key={k} className="field span-2"><span>{label}{hint && <small style={{ fontWeight: 400 }}> {hint}</small>}</span>
      <textarea className="textarea textarea--sm" rows={rows} value={String(f[k] ?? '')} onChange={set(k)} /></label>
  )
  const ready = !!f && f.reason.trim().length >= 3
  return (
    <Modal title="Referencia a otro centro" wide onClose={onClose} footer={<>
      {f && !ready && <span className="field__msg field__msg--warn" style={{ marginRight: 'auto' }}>Escribe el motivo de la referencia.</span>}
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!ready || busy} onClick={async () => {
        if (!f) return
        setBusy(true)
        const r = await emitReferral(from, { ...f, closeStay: stay ? closeStay : undefined })
        setBusy(false)
        if (r) nav(`/app/referencias/${r.id}`)
      }}><Send size={16} />Emitir e imprimir</button>
    </>}>
      {!f ? <Loading label="Armando la referencia" /> : (<>
        <p className="muted" style={{ fontSize: 13.5 }}>Se llenó con el expediente. Revísala y completa lo que haga falta; lo que quede vacío sale con líneas para llenarlo a mano. Emitida ya no se edita: si hay un error, se anula y se emite otra.</p>
        <div className="form-grid">
          <label className="field"><span>Establecimiento al que se refiere</span><input className="input" value={f.destination} onChange={set('destination')} placeholder="Ej. Hospital Escuela" /></label>
          <label className="field"><span>Servicio o especialidad</span><input className="input" value={f.service} onChange={set('service')} placeholder="Ej. Emergencia de medicina interna" /></label>
          <label className="field"><span>Tipo de referencia</span>
            <select className="select" value={f.urgency} onChange={set('urgency')}>{Object.entries(URGENCY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="field"><span>Condición del paciente al referir</span><input className="input" value={f.condition} onChange={set('condition')} placeholder="Ej. Estable, consciente, hidratado" /></label>
          {area('reason', 'Motivo de la referencia', 2, 'Por qué se refiere (obligatorio).')}
          {area('admissionDiagnosis', 'Diagnóstico de ingreso', 2)}
          {area('dischargeDiagnosis', stay ? 'Diagnóstico de egreso (al referir)' : 'Diagnóstico al referir', 2)}
          {area('history', 'Historia de la enfermedad actual', 4)}
          {area('exam', 'Examen físico', 3)}
          <label className="field span-2"><span>Signos vitales al referir</span><input className="input" value={f.vitals} onChange={set('vitals')} placeholder="Ej. PA 120/80 mmHg, FC 88 lpm, FR 18 rpm, T 37 °C, SpO₂ 97%" /></label>
          {stay && area('evolution', stayKind === 'observation' ? 'Evolución en observación' : 'Evolución', 3)}
          {area('treatment', 'Tratamiento recibido', 4, 'Medicamentos (con lo aplicado) e indicaciones.')}
          {area('labs', 'Exámenes y resultados', 3)}
          <label className="field"><span>Acompañante</span><input className="input" value={f.companion} onChange={set('companion')} placeholder="Nombre y parentesco" /></label>
          <label className="field"><span>Medio de transporte</span><input className="input" value={f.transport} onChange={set('transport')} placeholder="Ej. Ambulancia de la clínica, vehículo particular" /></label>
          <label className="field span-2"><span>Coordinado con (opcional)</span><input className="input" value={f.contact} onChange={set('contact')} placeholder="Quién aceptó en el establecimiento que recibe, hora y medio. Ej. Dr. Pérez, 14:20, por teléfono" /></label>
        </div>
        <label className="check-line"><input type="checkbox" checked={f.informed} onChange={(e) => { const v = e.target.checked; setF((x) => x && { ...x, informed: v }) }} />
          <span><b>Se informó al paciente o a su responsable</b><small>Del motivo y del destino de la referencia (Código de Ética del Colegio Médico de Honduras, art. 31). La hoja lleva su firma.</small></span></label>
        {stay && (
          <label className="check-line"><input type="checkbox" checked={closeStay} onChange={(e) => setCloseStay(e.target.checked)} />
            <span><b>El paciente sale de la clínica con esta referencia</b><small>{stayKind === 'observation' ? 'La observación' : 'La hospitalización'} se cierra como «Referido»: se libera la cama y las órdenes dejan de generar dosis. Desmárcalo si sólo lo refieres a un estudio o una interconsulta y sigue internado.</small></span></label>
        )}
      </>)}
    </Modal>
  )
}

const blank = (s?: string) => (s?.trim() ? <p style={{ whiteSpace: 'pre-wrap' }}>{s}</p> : <span className="consent__blank" />)
const LINE = '______________________'

/** Hoja de referencia, tamaño carta, con espacio para firmas, sello y la respuesta del establecimiento que recibe. */
export function ReferralSheet({ r }: { r: Referral }) {
  const d = r.data
  // Referencias de antes de la ronda 8 (consultorio, observación): se imprimen como entonces
  if (!d.source) return <LegacySheet r={r} />
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
        <span>{SOURCE_LABEL[d.source]}: <b>{date(d.admittedAt)}{d.source !== 'consultation' ? `, ${time(d.admittedAt)}` : ''}</b></span>
      </div>
      <dl className="consent__info">
        <div><dt>Establecimiento que refiere</dt><dd><p>{d.place.name}{d.place.address ? `, ${d.place.address}` : ''}{d.place.phone ? `. Tel. ${d.place.phone}` : ''}</p></dd></div>
        <div><dt>Se refiere a</dt><dd>{blank([d.destination, d.service].filter((x) => x?.trim()).join(', servicio de '))}</dd></div>
        <div><dt>Tipo de referencia</dt><dd><p>{d.urgency ? URGENCY[d.urgency] : ''}</p></dd></div>
        <div><dt>Motivo de la referencia</dt><dd>{blank(d.reason)}</dd></div>
        <div><dt>Diagnóstico de ingreso</dt><dd>{blank(d.admissionDiagnosis)}</dd></div>
        <div><dt>{d.source === 'consultation' ? 'Diagnóstico al referir' : 'Diagnóstico de egreso'}</dt><dd>{blank(d.dischargeDiagnosis)}</dd></div>
        <div><dt>Historia de la enfermedad actual</dt><dd>{blank(d.history)}</dd></div>
        <div><dt>Examen físico</dt><dd>{blank(d.exam)}</dd></div>
        <div><dt>Signos vitales al referir</dt><dd>{blank(d.vitals)}</dd></div>
        {d.source !== 'consultation' && <div><dt>Evolución</dt><dd>{blank(d.evolution)}</dd></div>}
        <div><dt>Tratamiento recibido</dt><dd>{blank(d.treatment)}</dd></div>
        <div><dt>Exámenes y resultados</dt><dd>{blank(d.labs)}</dd></div>
        <div><dt>Condición al referir</dt><dd>{blank(d.condition)}</dd></div>
        <div><dt>Traslado</dt><dd><p>Acompañante: {d.companion?.trim() || LINE}. Transporte: {d.transport?.trim() || LINE}.</p></dd></div>
        <div><dt>Coordinado con</dt><dd>{blank(d.contact)}</dd></div>
      </dl>
      <p className="consent__intro">{d.informed ? '☒' : '☐'} Se informó al paciente o a su responsable del motivo y del destino de esta referencia, y qué hacer al llegar.</p>
      <div className="consent__signs" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <div><span className="consent__line" />Firma y sello del médico<br /><small>{d.doctor.name}{d.doctor.license ? `, colegiación ${d.doctor.license}` : ''}</small></div>
        <div><span className="consent__line" />Paciente o responsable<br /><small>Nombre, identidad y parentesco</small></div>
        <div><span className="consent__line" />Recibido por<br /><small>Nombre, firma, fecha y hora</small></div>
      </div>
      {/* Respuesta (contrarreferencia): la llena el establecimiento que recibe y el paciente la trae de vuelta */}
      <section className="referral__reply">
        <h2>Respuesta (contrarreferencia)</h2>
        <p>Establecimiento que responde: {LINE}{LINE} Fecha: ____________</p>
        <p>Diagnóstico: {LINE}{LINE}{LINE}</p>
        <p>Tratamiento dado: {LINE}{LINE}{LINE}</p>
        <p>Recomendaciones y seguimiento: {LINE}{LINE}{LINE}</p>
        <p>Nombre, firma y sello de quien responde: {LINE}{LINE}</p>
      </section>
      {r.voidedAt && <p className="muted">Anulada: {r.voidReason}</p>}
      <footer className="rx-sheet__foot referral__legal">
        <span>Documento clínico confidencial, protegido por el secreto médico (Código de Ética del Colegio Médico de Honduras, arts. 14 al 18). Se emite conforme al Sistema Nacional de Referencia y Respuesta de la Secretaría de Salud, obligatorio para prestadores públicos y no públicos.</span>
        <span>Emitida con Clinara</span>
      </footer>
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

/** Página para ver, imprimir o anular una referencia. */
export default function ReferralPage() {
  const { id } = useParams()
  const { fetchReferral, voidReferral, can } = useStore()
  const nav = useNavigate()
  const [r, setR] = useState<Referral | null>(null)
  const [voiding, setVoiding] = useState(false)
  const [reason, setReason] = useState('')
  useEffect(() => { if (id) fetchReferral(id).then(setR).catch(() => null) }, [id, fetchReferral])
  if (!r) return <Loading label="Abriendo referencia" />
  return (
    <div className="page">
      <div className="page-head no-print">
        <button className="btn btn--ghost" onClick={() => (r.consultationId ? nav(`/app/nota/${r.consultationId}`) : window.history.length > 1 ? nav(-1) : nav(`/app/pacientes/${r.patientId}`))}><ChevronLeft size={16} />Volver</button>
        <div className="page-head__actions">
          {!r.voidedAt && (can('inpatient.orders') || can('consult.write')) && <button className="btn btn--ghost" onClick={() => setVoiding(true)}><Ban size={16} />Anular</button>}
          <button className="btn btn--primary" onClick={() => window.print()}><Printer size={16} />Imprimir o guardar PDF</button>
        </div>
      </div>
      <ReferralSheet r={r} />
      {voiding && (
        <Modal title={`Anular ${r.number}`} onClose={() => setVoiding(false)} footer={<>
          <button className="btn btn--ghost" onClick={() => setVoiding(false)}>Cancelar</button>
          <button className="btn btn--danger" disabled={reason.trim().length < 5} onClick={async () => { const x = await voidReferral(r.id, reason.trim()); if (x) { setR(x); setVoiding(false) } }}>Anular</button>
        </>}>
          <p>La referencia queda en el expediente marcada como anulada. Después puedes emitir otra.</p>
          <label className="field"><span>Motivo</span><input className="input" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        </Modal>
      )}
    </div>
  )
}
