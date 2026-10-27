import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Ban, ChevronLeft, Printer, Send } from 'lucide-react'
import { useStore } from '../lib/store'
import { Loading, Modal } from '../components/ui'
import { date, time } from '../lib/format'
import type { Referral, ReferralData } from '../lib/types'
import { DocHeader } from '../components/DocHeader'

type Editable = Pick<ReferralData, 'reason' | 'history' | 'exam' | 'diagnosis' | 'indications' | 'medications' | 'evolution' | 'labs' | 'condition' | 'destination'>

const SECTIONS: [keyof Editable, string, number][] = [
  ['reason', 'Motivo de la referencia', 2], ['history', 'Historia de la enfermedad actual', 4], ['exam', 'Examen físico', 4], ['diagnosis', 'Impresión diagnóstica', 2],
  ['indications', 'Manejo: indicaciones', 3], ['medications', 'Manejo: medicamentos aplicados (dosis y hora)', 3], ['evolution', 'Evolución en observación', 3], ['labs', 'Laboratorios', 2],
]

/**
 * Referencia (consultorio de un médico independiente): vista previa ya llenada con el expediente, que el médico
 * revisa y completa antes de emitir. Al emitir queda en Anexos y la observación se cierra como "Referido".
 */
export function ReferralModal({ stayId, onClose }: { stayId: string; onClose: () => void }) {
  const { fetchReferralDraft, emitReferral } = useStore()
  const nav = useNavigate()
  const [f, setF] = useState<Editable | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { fetchReferralDraft(stayId).then((d) => setF(d)).catch(() => onClose()) }, [stayId, fetchReferralDraft, onClose])
  const set = (k: keyof Editable) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => x && { ...x, [k]: e.target.value })
  return (
    <Modal title="Referencia" wide onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!f || busy} onClick={async () => {
        if (!f) return
        setBusy(true)
        const r = await emitReferral(stayId, f)
        setBusy(false)
        if (r) nav(`/app/referencias/${r.id}`)
      }}><Send size={16} />Emitir e imprimir</button>
    </>}>
      {!f ? <Loading label="Armando la referencia" /> : (<>
        <p className="muted" style={{ fontSize: 13.5 }}>Se llenó con el expediente. Revísala y completa lo que haga falta; lo que quede vacío sale con líneas para llenarlo a mano. Al emitirla, la observación se cierra como «Referido» y ya no se edita (si hay un error, se anula y se emite otra).</p>
        <div className="form-grid">
          <label className="field"><span>A dónde se refiere (opcional)</span><input className="input" value={f.destination} onChange={set('destination')} placeholder="Ej. Hospital Escuela, emergencia de medicina interna" /></label>
          <label className="field"><span>Condición del paciente al referir</span><input className="input" value={f.condition} onChange={set('condition')} placeholder="Ej. Estable, consciente, hidratado" /></label>
          {SECTIONS.map(([k, label, rows]) => (
            <label key={k} className="field span-2"><span>{label}</span><textarea className="textarea textarea--sm" rows={rows} value={f[k]} onChange={set(k)} /></label>
          ))}
        </div>
      </>)}
    </Modal>
  )
}

const blank = (s?: string) => (s?.trim() ? <p style={{ whiteSpace: 'pre-wrap' }}>{s}</p> : <span className="consent__blank" />)

/** Hoja de referencia, tamaño carta, con espacio para firma y sello. */
export function ReferralSheet({ r }: { r: Referral }) {
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
  const [r, setR] = useState<Referral | null>(null)
  const [voiding, setVoiding] = useState(false)
  const [reason, setReason] = useState('')
  useEffect(() => { if (id) fetchReferral(id).then(setR).catch(() => null) }, [id, fetchReferral])
  if (!r) return <Loading label="Abriendo referencia" />
  return (
    <div className="page">
      <div className="page-head no-print">
        <Link className="btn btn--ghost" to={`/app/observacion/${r.hospitalizationId}?tab=anexos`}><ChevronLeft size={16} />Volver al expediente</Link>
        <div className="page-head__actions">
          {!r.voidedAt && can('inpatient.orders') && <button className="btn btn--ghost" onClick={() => setVoiding(true)}><Ban size={16} />Anular</button>}
          <button className="btn btn--primary" onClick={() => window.print()}><Printer size={16} />Imprimir o guardar PDF</button>
        </div>
      </div>
      <ReferralSheet r={r} />
      {voiding && (
        <Modal title={`Anular ${r.number}`} onClose={() => setVoiding(false)} footer={<>
          <button className="btn btn--ghost" onClick={() => setVoiding(false)}>Cancelar</button>
          <button className="btn btn--danger" disabled={reason.trim().length < 5} onClick={async () => { const x = await voidReferral(r.id, reason.trim()); if (x) { setR(x); setVoiding(false) } }}>Anular</button>
        </>}>
          <p>La referencia queda en el expediente marcada como anulada. Después puedes emitir otra desde el expediente.</p>
          <label className="field"><span>Motivo</span><input className="input" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        </Modal>
      )}
    </div>
  )
}
