import { useState } from 'react'
import { Activity, LogIn } from 'lucide-react'
import { useStore } from '../lib/store'
import { Modal, PageHead, StatusBadge, Toast } from '../components/ui'
import { age, fullName, sameDay, time } from '../lib/format'
import type { Appointment } from '../lib/types'

const minutesSince = (iso?: string) => (iso ? Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)) : null)

export default function WaitingRoom() {
  const { appointments, patient, staffById, can, setStatus } = useStore()
  const [triage, setTriage] = useState<Appointment | null>(null)
  const [toast, setToast] = useState('')
  const today = appointments.filter((a) => sameDay(a.start, new Date())).sort((a, b) => a.start.localeCompare(b.start))
  const lanes = [
    { title: 'Por llegar', hint: 'Registra la llegada cuando el paciente se presente.', list: today.filter((a) => ['scheduled', 'confirmed'].includes(a.status)) },
    { title: 'En sala', hint: 'Esperan triaje de enfermería.', list: today.filter((a) => a.status === 'arrived') },
    { title: 'Listos para consulta', hint: 'Con signos vitales; el médico los llamará.', list: today.filter((a) => ['triaged', 'in_consult'].includes(a.status)) },
  ]

  return (
    <div className="page">
      <PageHead title="Sala de espera" sub="El paciente avanza de izquierda a derecha durante su visita." />
      <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        {lanes.map((lane) => (
          <section key={lane.title} className="panel">
            <div className="panel__head"><div><h2>{lane.title} <span className="num" style={{ color: 'var(--faint)' }}>{lane.list.length}</span></h2><p>{lane.hint}</p></div></div>
            {lane.list.length ? lane.list.map((a) => {
              const p = patient(a.patientId)!
              const wait = a.status === 'arrived' ? minutesSince(a.arrivedAt) : null
              return (
                <div key={a.id} className="queue-card" style={{ gridTemplateColumns: '1fr auto' }}>
                  <div className="row__who">
                    <strong>{time(a.start)} {fullName(p)}</strong>
                    <span>{age(p.birthDate)}, con {staffById(a.doctorId)?.name}</span>
                    <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <StatusBadge status={a.status} />
                      {a.type === 'urgent' && <span className="badge badge--red">Urgente</span>}
                      {wait !== null && <span className="wait">{wait} min esperando</span>}
                    </div>
                  </div>
                  {['scheduled', 'confirmed'].includes(a.status) && can('checkin.manage') &&
                    <button className="btn btn--soft btn--sm" onClick={() => { setStatus(a.id, 'arrived'); setToast(`Llegada de ${p.firstName} registrada`) }}><LogIn size={15} />Registrar llegada</button>}
                  {a.status === 'arrived' && can('vitals.record') &&
                    <button className="btn btn--primary btn--sm" onClick={() => setTriage(a)}><Activity size={15} />Tomar signos</button>}
                </div>
              )
            }) : <div className="empty">Nadie en esta etapa.</div>}
          </section>
        ))}
      </div>
      {triage && <VitalsModal appt={triage} onClose={() => setTriage(null)} onSaved={(name) => { setTriage(null); setToast(`Signos de ${name} registrados`) }} />}
      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </div>
  )
}

const RANGES = {
  systolic: [90, 139], diastolic: [60, 89], heartRate: [60, 100], temperature: [36, 37.5], spo2: [94, 100],
} as const

export function VitalsModal({ appt, onClose, onSaved }: { appt: Appointment; onClose: () => void; onSaved: (name: string) => void }) {
  const { patient, addVitals } = useStore()
  const p = patient(appt.patientId)!
  const [v, setV] = useState({ systolic: '', diastolic: '', heartRate: '', temperature: '', spo2: '', weightKg: '', heightCm: '', painScale: '0', notes: '' })
  const num = (k: keyof typeof v) => Number(v[k])
  const out = (k: keyof typeof RANGES) => v[k] !== '' && (num(k) < RANGES[k][0] || num(k) > RANGES[k][1])
  const ready = ['systolic', 'diastolic', 'heartRate', 'temperature', 'spo2'].every((k) => v[k as keyof typeof v] !== '')
  const F = (k: keyof typeof v, label: string, unit: string, step = '1') => (
    <label className="field">
      <span>{label} <small style={{ fontWeight: 400 }}>({unit})</small></span>
      <input className="input num" inputMode="decimal" type="number" step={step} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })}
        style={k in RANGES && out(k as keyof typeof RANGES) ? { borderColor: 'var(--red-ink)', background: 'var(--red)' } : undefined}
        aria-invalid={k in RANGES && out(k as keyof typeof RANGES)} />
    </label>
  )
  const flags = (Object.keys(RANGES) as (keyof typeof RANGES)[]).filter(out)

  return (
    <Modal title={`Triaje de ${fullName(p)}`} onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!ready} onClick={() => {
        addVitals({
          patientId: p.id, appointmentId: appt.id, systolic: num('systolic'), diastolic: num('diastolic'), heartRate: num('heartRate'),
          temperature: num('temperature'), spo2: num('spo2'), weightKg: num('weightKg'), heightCm: num('heightCm'), painScale: num('painScale'), notes: v.notes || undefined,
        })
        onSaved(p.firstName)
      }}>Guardar signos vitales</button>
    </>}>
      {p.allergies.length > 0 && <div className="alert-strip">Alergias: {p.allergies.join(', ')}</div>}
      <div className="form-grid">
        {F('systolic', 'Presión sistólica', 'mmHg')}
        {F('diastolic', 'Presión diastólica', 'mmHg')}
        {F('heartRate', 'Frecuencia cardíaca', 'lpm')}
        {F('temperature', 'Temperatura', '°C', '0.1')}
        {F('spo2', 'Saturación O₂', '%')}
        {F('painScale', 'Dolor', '0 a 10')}
        {F('weightKg', 'Peso', 'kg', '0.1')}
        {F('heightCm', 'Talla', 'cm')}
      </div>
      {flags.length > 0 && <div className="alert-strip" role="status">Fuera de rango: {flags.map((f) => ({ systolic: 'sistólica', diastolic: 'diastólica', heartRate: 'frecuencia cardíaca', temperature: 'temperatura', spo2: 'saturación' })[f]).join(', ')}. El médico verá la alerta.</div>}
      <label className="field"><span>Observaciones</span><textarea className="textarea" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} placeholder="Lo que el paciente refiere al llegar" /></label>
    </Modal>
  )
}
