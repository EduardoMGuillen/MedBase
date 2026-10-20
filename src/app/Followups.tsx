import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCheck, MessageCircle, Plus, Smartphone, Trash2 } from 'lucide-react'
import { useStore, type FollowupInput } from '../lib/store'
import { Modal, PageHead } from '../components/ui'
import { date, dateTime, fullName, localISODate } from '../lib/format'
import { addDays, CHRONIC_PRESETS, FOLLOWUP_KIND, followupMessage } from '../lib/followups'
import type { Followup } from '../lib/types'
import { PatientPicker } from './Inpatients'

type Kind = Followup['kind']

/**
 * Crónicos y seguimientos: pacientes que hay que volver a captar. El mensaje de WhatsApp se
 * muestra como lo recibiría el paciente, pero el envío es una simulación hasta conectar la API oficial.
 */
export default function Followups() {
  const { followups, patient, can } = useStore()
  const [kind, setKind] = useState<Kind>('chronic')
  const [sending, setSending] = useState<Followup | null>(null)
  const [adding, setAdding] = useState(false)
  const today = localISODate(new Date())
  const list = followups.filter((f) => f.kind === kind).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const count = (k: Kind) => followups.filter((f) => f.kind === k).length

  return (
    <div className="page">
      <PageHead title="Crónicos y seguimientos" sub="Pacientes que deben volver: controles de crónicos, recordatorios de exámenes y procedimientos programados."
        actions={can('followups.manage') && <button className="btn btn--primary" onClick={() => setAdding(true)}><Plus size={17} />Programar seguimiento</button>} />
      <div className="alert-strip alert-strip--calm" style={{ marginBottom: 16 }}>
        <Smartphone size={18} style={{ flex: 'none' }} />
        Simulación: los mensajes de WhatsApp todavía no se envían. Puedes ver cómo le llegaría al paciente y registrar el envío; al contratar WhatsApp Business se enviarán solos.
      </div>
      <div className="tabs" role="tablist">
        {(['chronic', 'reminder', 'procedure'] as Kind[]).map((k) => (
          <button key={k} className="tab" role="tab" aria-selected={kind === k} onClick={() => setKind(k)}>{FOLLOWUP_KIND[k].plural} ({count(k)})</button>
        ))}
      </div>
      <section className="panel table-wrap">
        <table className="table">
          <thead><tr>
            <th>Paciente</th><th>{kind === 'chronic' ? 'Padecimiento' : kind === 'procedure' ? 'Procedimiento' : 'Motivo'}</th>
            <th>{kind === 'chronic' ? 'Próximo control' : 'Fecha'}</th>{kind === 'chronic' && <th>Cada</th>}<th>Último aviso</th><th />
          </tr></thead>
          <tbody>
            {list.map((f) => {
              const p = patient(f.patientId)
              if (!p) return null
              const overdue = f.dueDate < today
              const soon = !overdue && f.dueDate <= addDays(today, 7)
              return (
                <tr key={f.id}>
                  <td><Link to={`/app/pacientes/${p.id}`}>{fullName(p)}</Link><small style={{ display: 'block', color: 'var(--muted)' }}>{p.phone}</small></td>
                  <td>{f.title}{f.notes && <small style={{ display: 'block', color: 'var(--muted)' }}>{f.notes}</small>}</td>
                  <td className="num" style={{ whiteSpace: 'nowrap' }}>
                    {date(`${f.dueDate}T12:00:00`)}
                    {overdue && <span className="badge badge--red" style={{ marginLeft: 6 }}>Vencido</span>}
                    {soon && <span className="badge badge--amber" style={{ marginLeft: 6 }}>Esta semana</span>}
                  </td>
                  {kind === 'chronic' && <td className="num">{f.everyDays && f.everyDays % 30 === 0 ? `${f.everyDays / 30} ${f.everyDays === 30 ? 'mes' : 'meses'}` : `${f.everyDays} días`}</td>}
                  <td>{f.notifiedAt ? dateTime(f.notifiedAt) : <span style={{ color: 'var(--faint)' }}>Sin aviso</span>}</td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <button className={`btn ${f.notifiedAt ? 'btn--ghost' : 'btn--soft'} btn--sm`} onClick={() => setSending(f)}><MessageCircle size={15} />WhatsApp</button>{' '}
                    <CompleteButton f={f} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!list.length && <div className="empty">No hay {FOLLOWUP_KIND[kind].plural.toLowerCase()}. El médico los programa al firmar una consulta o desde aquí.</div>}
      </section>
      {sending && <WhatsAppMock f={sending} onClose={() => setSending(null)} />}
      {adding && <FollowupModal onClose={() => setAdding(false)} />}
    </div>
  )
}

function CompleteButton({ f }: { f: Followup }) {
  const { completeFollowup, removeFollowup, can } = useStore()
  return (<>
    <button className="btn btn--ghost btn--sm" title={f.kind === 'chronic' ? 'El paciente vino a su control: se programa el siguiente' : 'Marcar como completado'}
      onClick={() => completeFollowup(f.id)}><CheckCheck size={15} />{f.kind === 'chronic' ? 'Vino' : 'Listo'}</button>
    {can('followups.manage') && <button className="icon-btn" aria-label="Quitar seguimiento" title="Quitar" onClick={() => { if (confirm('¿Quitar este seguimiento?')) removeFollowup(f.id) }}><Trash2 size={15} /></button>}
  </>)
}

/** Vista previa del mensaje como en el teléfono del paciente; el botón sólo registra el envío simulado. */
function WhatsAppMock({ f, onClose }: { f: Followup; onClose: () => void }) {
  const { patient, settings, notifyFollowup } = useStore()
  const p = patient(f.patientId)!
  const [text, setText] = useState(followupMessage(f, { paciente: p.firstName.split(' ')[0], clinica: settings.name, telefono: settings.phone }))
  const [sent, setSent] = useState(false)
  return (
    <Modal title={`WhatsApp a ${fullName(p)}`} onClose={onClose} footer={sent ? <button className="btn btn--primary" onClick={onClose}>Cerrar</button> : <>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" onClick={async () => { if (await notifyFollowup(f.id)) setSent(true) }}><MessageCircle size={16} />Simular envío</button>
    </>}>
      <div className="phone">
        <div className="phone__bar"><b>{settings.name}</b><span>{p.phone}</span></div>
        <div className="phone__chat">
          <div className="phone__bubble">{text}<small>{new Date().toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit', hour12: false })}{sent ? ' ✓✓' : ''}</small></div>
        </div>
      </div>
      {!sent ? (
        <label className="field"><span>Mensaje</span><textarea className="textarea" rows={4} value={text} onChange={(e) => setText(e.target.value)} /></label>
      ) : (
        <div className="alert-strip alert-strip--calm">Envío simulado registrado. El mensaje no salió del sistema; cuando se conecte WhatsApp Business, este paso lo enviará de verdad.</div>
      )}
    </Modal>
  )
}

/** Programar un seguimiento: al firmar la consulta o desde esta pantalla. */
export function FollowupFields({ value, onChange }: { value: FollowupInput; onChange: (v: FollowupInput) => void }) {
  const set = <K extends keyof FollowupInput>(k: K, v: FollowupInput[K]) => onChange({ ...value, [k]: v })
  return (
    <div className="form-grid">
      <div className="field span-2"><span>Tipo</span>
        <div className="segmented" role="radiogroup">
          {(['chronic', 'reminder', 'procedure'] as Kind[]).map((k) => (
            <button type="button" key={k} role="radio" aria-checked={value.kind === k}
              onClick={() => onChange({ ...value, kind: k, everyDays: k === 'chronic' ? value.everyDays ?? 90 : undefined })}>{FOLLOWUP_KIND[k].label}</button>
          ))}
        </div></div>
      <label className="field span-2"><span>{value.kind === 'chronic' ? 'Padecimiento crónico' : value.kind === 'procedure' ? 'Procedimiento' : 'Qué debe hacer el paciente'}</span>
        <input className="input" list={value.kind === 'chronic' ? 'chronic-presets' : undefined} value={value.title}
          onChange={(e) => { const preset = CHRONIC_PRESETS.find((c) => c.title === e.target.value); onChange({ ...value, title: e.target.value, everyDays: preset?.everyDays ?? value.everyDays }) }}
          placeholder={value.kind === 'chronic' ? 'Ej. Hipertensión arterial' : value.kind === 'procedure' ? 'Ej. Hernioplastia inguinal' : 'Ej. Hacerse química sanguínea y volver con resultados'} />
        <datalist id="chronic-presets">{CHRONIC_PRESETS.map((c) => <option key={c.title} value={c.title} />)}</datalist></label>
      <label className="field"><span>{value.kind === 'chronic' ? 'Próximo control' : 'Fecha'}</span>
        <input className="input" type="date" value={value.dueDate} min={localISODate(new Date())} onChange={(e) => set('dueDate', e.target.value)} /></label>
      {value.kind === 'chronic' && (
        <label className="field"><span>Control cada</span>
          <select className="select" value={value.everyDays ?? 90} onChange={(e) => set('everyDays', Number(e.target.value))}>
            {[30, 60, 90, 120, 180, 365].map((d) => <option key={d} value={d}>{d === 365 ? '1 año' : `${d / 30} ${d === 30 ? 'mes' : 'meses'}`}</option>)}
          </select></label>
      )}
      <label className={`field ${value.kind === 'chronic' ? 'span-2' : ''}`}><span>Nota (opcional)</span>
        <input className="input" value={value.notes ?? ''} onChange={(e) => set('notes', e.target.value)} placeholder="Ej. Traer glucometrías de la semana" /></label>
    </div>
  )
}

export const emptyFollowup = (kind: Kind = 'chronic'): FollowupInput => ({
  kind, title: '', dueDate: addDays(localISODate(new Date()), kind === 'chronic' ? 90 : 7), everyDays: kind === 'chronic' ? 90 : undefined, notes: '',
})

function FollowupModal({ onClose }: { onClose: () => void }) {
  const { createFollowup } = useStore()
  const [patientId, setPatientId] = useState('')
  const [f, setF] = useState<FollowupInput>(emptyFollowup())
  const [busy, setBusy] = useState(false)
  return (
    <Modal title="Programar seguimiento" onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!patientId || f.title.trim().length < 3 || !f.dueDate || busy} onClick={async () => {
        setBusy(true)
        const ok = await createFollowup({ ...f, title: f.title.trim(), notes: f.notes?.trim() || undefined, patientId })
        setBusy(false)
        if (ok) onClose()
      }}>Programar</button>
    </>}>
      <PatientPicker value={patientId} onChange={setPatientId} />
      <FollowupFields value={f} onChange={setF} />
    </Modal>
  )
}
