import { useCallback, useEffect, useState } from 'react'
import { Syringe } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { Modal } from './ui'
import { DateTimeField } from './DateTimeField'
import { fromLocalValue } from '../lib/dateInput'
import { dmyTime, inputDateTime, shortStaff } from '../lib/format'
import { NOT_APPLIED_REASONS } from '../lib/clinicalConfig'
import type { ConsultApplication } from '../lib/types'

/** ME13 (ronda 14): ¿puede registrar la aplicación? Enfermería o el médico (en Consultorio, la titular o su asistente). */
export const canApply = (can: (p: 'inpatient.care' | 'inpatient.orders') => boolean) => can('inpatient.care') || can('inpatient.orders')

/** La etiqueta de la tarjeta: «Medicamento por aplicar (1)», «Medicamento aplicado» o «No aplicado». */
export function applyBadge(list: ConsultApplication[]) {
  const pending = list.filter((a) => a.status === 'pending').length
  if (pending) return { text: `Medicamento por aplicar (${pending})`, tone: 'amber' as const }
  if (!list.length) return null
  if (list.every((a) => a.status === 'not_applied')) return { text: list.length > 1 ? 'Medicamentos no aplicados' : 'Medicamento no aplicado', tone: 'red' as const }
  return { text: list.length > 1 ? 'Medicamentos aplicados' : 'Medicamento aplicado', tone: 'mint' as const }
}

/** Debajo del medicamento, en la tarjeta de la consulta: «Aplicado 05/11/2026 08:40 por Lic. Ríos» o «No aplicado: motivo». */
export function applicationText(a: ConsultApplication, name: (id: string) => string | undefined) {
  if (a.status === 'applied') return `Aplicado ${dmyTime(a.appliedAt!)} por ${shortStaff(name(a.recordedBy!))}`
  if (a.status === 'not_applied') return `No aplicado: ${a.reason} (${shortStaff(name(a.recordedBy!))}, ${dmyTime(a.recordedAt!)})`
  return 'Por aplicar en la clínica'
}

type Choice = { status: 'applied'; at: string } | { status: 'not_applied'; pick: string; other: string } | null

/**
 * ME13 (ronda 14): «Aplicar». Una ventana pequeña con cada medicamento por aplicar (texto completo de la orden) y dos opciones:
 * «Aplicado» (hora, por defecto ahora; quién: el usuario) o «No aplicado» (motivo obligatorio de la lista, u «Otro» escrito).
 */
export function ApplyModal({ list, onClose, onSaved }: { list: ConsultApplication[]; onClose: () => void; onSaved: () => void }) {
  const { notify } = useStore()
  const pending = list.filter((a) => a.status === 'pending')
  const [choice, setChoice] = useState<Record<string, Choice>>(() => Object.fromEntries(pending.map((a) => [a.id, null])))
  const [busy, setBusy] = useState(false)
  const set = (id: string, c: Choice) => setChoice({ ...choice, [id]: c })
  const reasonOf = (c: Choice) => (c?.status === 'not_applied' ? (c.pick === 'Otro' ? c.other.trim() : c.pick) : '')
  const chosen = pending.filter((a) => choice[a.id])
  const incomplete = chosen.some((a) => { const c = choice[a.id]; return c?.status === 'not_applied' ? reasonOf(c).length < 3 : !c?.at })
  const save = async () => {
    setBusy(true)
    try {
      for (const a of chosen) {
        const c = choice[a.id]!
        await api(`/applications/${a.id}`, { body: c.status === 'applied' ? { status: 'applied', appliedAt: fromLocalValue(c.at) } : { status: 'not_applied', reason: reasonOf(c) } })
      }
      notify(chosen.length > 1 ? 'Aplicaciones registradas.' : 'Aplicación registrada.')
      onSaved()
    } catch (x) { notify((x as Error).message, 'error'); setBusy(false) }
  }
  return (
    <Modal title="Aplicar en la clínica" onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!chosen.length || incomplete || busy} onClick={save}>Guardar</button>
    </>}>
      {!pending.length && <p className="muted">No hay medicamentos por aplicar.</p>}
      {pending.map((a) => {
        const c = choice[a.id]
        return (
          <fieldset key={a.id} className="fs apply-med">
            <legend><Syringe size={15} /> {a.orderText}</legend>
            <div className="segmented" role="radiogroup" aria-label={`Resultado de ${a.drug}`}>
              <button type="button" role="radio" aria-checked={c?.status === 'applied'} onClick={() => set(a.id, { status: 'applied', at: inputDateTime(new Date()) })}>Aplicado</button>
              <button type="button" role="radio" aria-checked={c?.status === 'not_applied'} onClick={() => set(a.id, { status: 'not_applied', pick: '', other: '' })}>No aplicado</button>
            </div>
            {c?.status === 'applied' && <div className="field"><span>Hora de aplicación</span>
              <DateTimeField value={c.at} max={inputDateTime(new Date())} onChange={(v) => set(a.id, { ...c, at: v })} label={`Hora de aplicación de ${a.drug}`} /></div>}
            {c?.status === 'not_applied' && <div className="apply-med__reasons">
              {[...NOT_APPLIED_REASONS, 'Otro'].map((r) => <label key={r} className="check-line"><input type="radio" name={`na-${a.id}`} checked={c.pick === r} onChange={() => set(a.id, { ...c, pick: r })} /><span><b>{r}</b></span></label>)}
              {c.pick === 'Otro' && <label className="field"><span>Motivo</span><input className="input" autoFocus value={c.other} onChange={(x) => set(a.id, { ...c, other: x.target.value })} /></label>}
              {!reasonOf(c) && <small className="field__msg field__msg--warn">El motivo es obligatorio.</small>}
            </div>}
          </fieldset>
        )
      })}
      <small className="muted">Queda en el expediente con tu nombre, y en el registro de uso de medicamentos.</small>
    </Modal>
  )
}

/**
 * ME13 (ronda 14): en el Inicio de enfermería, los medicamentos de hoy por aplicar en la clínica (consulta externa sin ingreso),
 * agrupados por paciente, con «Aplicar». No se muestra si no hay ninguno.
 */
export function PendingApplications() {
  const { can, patient } = useStore()
  const [list, setList] = useState<ConsultApplication[]>([])
  const [applying, setApplying] = useState<ConsultApplication[] | null>(null)
  const allowed = canApply(can)
  const load = useCallback(() => {
    const from = new Date(); from.setHours(0, 0, 0, 0)
    const to = new Date(from); to.setDate(to.getDate() + 1)
    api<ConsultApplication[]>(`/applications?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`).then(setList).catch(() => null)
  }, [])
  useEffect(() => {
    if (!allowed) return
    load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [allowed, load])
  const pending = list.filter((a) => a.status === 'pending')
  if (!allowed || !pending.length) return null
  const byConsult = [...new Set(pending.map((a) => a.consultationId))]
  return (
    <section className="panel">
      <div className="panel__head"><div><h2>Medicamentos por aplicar</h2><p>Consulta externa, sin ingreso: una dosis en la clínica.</p></div></div>
      {byConsult.map((cId) => {
        const mine = pending.filter((a) => a.consultationId === cId)
        const p = patient(mine[0].patientId)
        return (
          <div key={cId} className="queue-card" style={{ gridTemplateColumns: '1fr auto' }}>
            <div className="row__who"><strong>{p ? `${p.firstName} ${p.lastName}` : 'Paciente'}</strong><span>{mine.map((a) => a.orderText).join(' · ')}</span></div>
            <button className="btn btn--primary btn--sm" onClick={() => setApplying(list.filter((a) => a.consultationId === cId))}><Syringe size={15} />Aplicar</button>
          </div>
        )
      })}
      {applying && <ApplyModal list={applying} onClose={() => setApplying(null)} onSaved={() => { setApplying(null); load() }} />}
    </section>
  )
}
