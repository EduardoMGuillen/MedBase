import { useState } from 'react'
import { Combo } from '../components/Combo'
import { DateField } from '../components/DateTimeField'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCheck, MessageCircle, Plus, Smartphone, Trash2 } from 'lucide-react'
import { useStore, type FollowupInput } from '../lib/store'
import { Modal, PageHead } from '../components/ui'
import { Pagination, paginate, usePage } from '../components/Pagination'
import { clinicWhatsapp, date, dateTime, fullName, localISODate, time } from '../lib/format'
import { addDays, CHRONIC_PRESETS, clinicToday, daysLabel, daysUntil, FOLLOWUP_KIND, followupMessage, REMINDER_TYPE } from '../lib/followups'
import type { Followup } from '../lib/types'
import { PatientPicker } from './Inpatients'
import { TabRow } from '../components/TabRow'

type Kind = Followup['kind']

/**
 * Crónicos y seguimientos: pacientes que hay que volver a captar. El mensaje de WhatsApp se
 * muestra como lo recibiría el paciente, pero el envío es una simulación hasta conectar la API oficial.
 */
export default function Followups() {
  const { followups, patient, can } = useStore()
  // CR1 (ronda 6): dos pestañas. La dirección de la pestaña queda en la URL; la de «procedimientos» (vieja) abre Recordatorios
  const [params, setParams] = useSearchParams()
  const kind: Kind = ['recordatorios', 'procedimientos'].includes(params.get('tab') ?? '') ? 'reminder' : 'chronic'
  const setKind = (k: Kind) => setParams(k === 'reminder' ? { tab: 'recordatorios' } : {}, { replace: true })
  const [sending, setSending] = useState<Followup | null>(null)
  const [adding, setAdding] = useState(false)
  // CR2 (ronda 6): «hoy» es el de la clínica (Tegucigalpa), no el del navegador
  const today = clinicToday()
  // Los procedimientos de antes (si alguno no se migró) también son recordatorios
  const list = followups.filter((f) => (kind === 'reminder' ? f.kind !== 'chronic' : f.kind === kind)).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  // GE5 (ronda 10): por páginas; cambiar de pestaña vuelve a la página 1
  const [pageNo, setPage] = usePage(kind)
  const pg = paginate(list, pageNo)
  const count = (k: Kind) => followups.filter((f) => (k === 'reminder' ? f.kind !== 'chronic' : f.kind === k)).length

  return (
    <div className="page">
      <PageHead title="Crónicos y seguimientos" sub="Pacientes que deben volver: controles de crónicos y recordatorios de exámenes y procedimientos."
        actions={can('followups.manage') && <button className="btn btn--primary" data-tour="programar-seguimiento" onClick={() => setAdding(true)}><Plus size={17} />Programar seguimiento</button>} />
      <div className="alert-strip alert-strip--calm" style={{ marginBottom: 16 }} data-tour="recordatorios">
        <Smartphone size={18} style={{ flex: 'none' }} />
        Los avisos se registran solos: una semana antes, un día antes y el día del control. Ese día recepción lo ve en su inicio para llamar al paciente. El WhatsApp sigue en simulación hasta conectar la línea de la clínica.
      </div>
      <TabRow>
        {(['chronic', 'reminder'] as Kind[]).map((k) => (
          <button key={k} className="tab" role="tab" aria-selected={kind === k} onClick={() => setKind(k)}>{FOLLOWUP_KIND[k].plural} ({count(k)})</button>
        ))}
      </TabRow>
      <section className="panel table-wrap">
        <table className="table">
          <thead><tr>
            <th>Paciente</th><th>{kind === 'chronic' ? 'Padecimiento' : 'Motivo'}</th>
            <th>{kind === 'chronic' ? 'Próximo control' : 'Fecha'}</th>{kind === 'chronic' && <th>Cada</th>}<th>Último aviso</th><th />
          </tr></thead>
          <tbody>
            {pg.rows.map((f) => {
              const p = patient(f.patientId)
              if (!p) return null
              const overdue = f.dueDate < today
              const soon = !overdue && f.dueDate <= addDays(today, 7)
              return (
                <tr key={f.id}>
                  <td><Link to={`/app/pacientes/${p.id}`}>{fullName(p)}</Link><small className="block c-muted">{p.phone}</small></td>
                  <td>{f.kind !== 'chronic' && <span className="badge badge--neutral fu-type">{f.reminderType ? REMINDER_TYPE[f.reminderType] : f.kind === 'procedure' ? 'Procedimiento' : 'Recordatorio'}</span>}{f.title}{f.notes && <small className="block c-muted">{f.notes}</small>}</td>
                  <td className="num nowrap">
                    {/* CR2 (ronda 6): primero cuántos días faltan y al lado la fecha; en Recordatorios la columna Fecha no cambia */}
                    {kind === 'chronic' ? <><b>{daysLabel(daysUntil(f.dueDate, today))}</b> · {date(`${f.dueDate}T12:00:00`)}</> : date(`${f.dueDate}T12:00:00`)}
                    {overdue && <span className="badge badge--red ml-xs">Vencido</span>}
                    {soon && <span className="badge badge--amber ml-xs">Esta semana</span>}
                  </td>
                  {kind === 'chronic' && <td className="num nowrap">{f.everyDays && f.everyDays % 30 === 0 ? `${f.everyDays / 30} ${f.everyDays === 30 ? 'mes' : 'meses'}` : `${f.everyDays} días`}</td>}
                  <td className="fu-notice">
                    {/* CR2 (ronda 6): los avisos programados en una línea y el WhatsApp enviado aparte */}
                    {(f.remindedWeek || f.remindedEve || f.remindedDay) && <div className="fu-notice__auto">Avisos: {[f.remindedWeek && '1 semana antes', f.remindedEve && 'un día antes', f.remindedDay && 'el día del control'].filter(Boolean).join(' · ')}</div>}
                    {f.notifiedAt && <div className="fu-notice__sent">Enviado: {dateTime(f.notifiedAt)}</div>}
                    {!f.remindedWeek && !f.remindedEve && !f.remindedDay && !f.notifiedAt && <span className="faint">Aún no toca</span>}
                  </td>
                  <td className="nowrap ta-r">
                    <button className={`btn ${f.notifiedAt ? 'btn--ghost' : 'btn--soft'} btn--sm`} onClick={() => setSending(f)}><MessageCircle size={15} />WhatsApp</button>{' '}
                    <CompleteButton f={f} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <Pagination {...pg} onPage={setPage} label="Páginas de seguimientos" />
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
  const [text, setText] = useState(followupMessage(f, { paciente: p.firstName.split(' ')[0], clinica: settings.name, telefono: clinicWhatsapp(settings) }))
  const [sent, setSent] = useState(false)
  return (
    <Modal title={`WhatsApp a ${fullName(p)}`} onClose={onClose} footer={sent ? <button className="btn btn--primary" onClick={onClose}>Cerrar</button> : <>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" onClick={async () => { if (await notifyFollowup(f.id)) setSent(true) }}><MessageCircle size={16} />Simular envío</button>
    </>}>
      <div className="phone">
        <div className="phone__bar"><b>{settings.name}</b><span>{p.phone}</span></div>
        <div className="phone__chat">
          <div className="phone__bubble">{text}<small>{time(new Date().toISOString())}{sent ? ' ✓✓' : ''}</small></div>
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
/** SG1 (ronda 12): la fecha del próximo control a partir de hoy, en meses de calendario (6 meses: 4 nov → 4 may). */
export function nextControl(everyDays: number, from = new Date()) {
  const months = everyDays >= 365 ? Math.round(everyDays / 365) * 12 : Math.round(everyDays / 30)
  const d = new Date(from.getFullYear(), from.getMonth() + months, from.getDate())
  // 31 de enero + 1 mes: último día de febrero, no 3 de marzo
  if (d.getDate() !== from.getDate()) d.setDate(0)
  return localISODate(d)
}

export function FollowupFields({ value, onChange }: { value: FollowupInput; onChange: (v: FollowupInput) => void }) {
  const set = <K extends keyof FollowupInput>(k: K, v: FollowupInput[K]) => onChange({ ...value, [k]: v })
  // SG1 (ronda 12): al elegir «Control cada», el próximo control se mueve solo (y se puede cambiar a mano después)
  const every = (days: number) => onChange({ ...value, everyDays: days, dueDate: nextControl(days) })
  return (
    <div className="form-grid">
      <div className="field span-2"><span>Tipo</span>
        <div className="segmented" role="radiogroup">
          {(['chronic', 'reminder'] as Kind[]).map((k) => (
            <button type="button" key={k} role="radio" aria-checked={value.kind === k || (k === 'reminder' && value.kind === 'procedure')}
              onClick={() => onChange({ ...value, kind: k, everyDays: k === 'chronic' ? value.everyDays ?? 90 : undefined, ...(k === 'chronic' && value.kind !== 'chronic' ? { dueDate: nextControl(value.everyDays ?? 90) } : {}), reminderType: k === 'reminder' ? value.reminderType ?? 'exam' : undefined })}>{FOLLOWUP_KIND[k].label}</button>
          ))}
        </div></div>
      {value.kind !== 'chronic' && (
        <div className="field span-2"><span>Tipo de recordatorio</span>
          <div className="segmented" role="radiogroup" aria-label="Tipo de recordatorio">
            {(['exam', 'procedure', 'other'] as const).map((t) => (
              <button type="button" key={t} role="radio" aria-checked={(value.reminderType ?? (value.kind === 'procedure' ? 'procedure' : 'exam')) === t}
                onClick={() => onChange({ ...value, kind: 'reminder', reminderType: t })}>{REMINDER_TYPE[t]}</button>
            ))}
          </div></div>
      )}
      <label className="field span-2"><span>{value.kind === 'chronic' ? 'Padecimiento crónico' : value.reminderType === 'procedure' || value.kind === 'procedure' ? 'Procedimiento' : 'Qué debe hacer el paciente'}</span>
        {value.kind === 'chronic'
          // LD1 (ronda 18): los padecimientos frecuentes, o el que se escriba
          ? <Combo free value={value.title} placeholder="Ej. Hipertensión arterial" options={CHRONIC_PRESETS.map((c) => c.title)}
            onChange={(title) => { const preset = CHRONIC_PRESETS.find((c) => c.title === title); onChange({ ...value, title, everyDays: preset?.everyDays ?? value.everyDays, ...(preset?.everyDays ? { dueDate: nextControl(preset.everyDays) } : {}) }) }} />
          : <input className="input" value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })}
            placeholder={value.reminderType === 'procedure' || value.kind === 'procedure' ? 'Ej. Hernioplastia inguinal' : 'Ej. Hacerse química sanguínea y volver con resultados'} />}</label>
      <label className="field"><span>{value.kind === 'chronic' ? 'Próximo control' : 'Fecha'}</span>
        <DateField value={value.dueDate} min={localISODate(new Date())} onChange={(v) => set('dueDate', v)} label="Fecha" /></label>
      {value.kind === 'chronic' && (
        <label className="field"><span>Control cada</span>
          <Combo value={String(value.everyDays ?? 90)} onChange={(v) => every(Number(v))}
            options={[30, 60, 90, 120, 180, 365].map((d) => ({ value: String(d), label: d === 365 ? '1 año' : `${d / 30} ${d === 30 ? 'mes' : 'meses'}` }))} /></label>
      )}
      <label className={`field ${value.kind === 'chronic' ? 'span-2' : ''}`}><span>Nota (opcional)</span>
        <input className="input" value={value.notes ?? ''} onChange={(e) => set('notes', e.target.value)} placeholder="Ej. Traer glucometrías de la semana" /></label>
    </div>
  )
}

export const emptyFollowup = (kind: Kind = 'chronic'): FollowupInput => ({
  kind, title: '', dueDate: kind === 'chronic' ? nextControl(90) : addDays(localISODate(new Date()), 7), everyDays: kind === 'chronic' ? 90 : undefined, notes: '', reminderType: kind === 'chronic' ? undefined : 'exam',
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
