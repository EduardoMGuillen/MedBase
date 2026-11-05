import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Pill, Printer } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { Modal } from './ui'
import { medLabel } from '../lib/inpatient'
import { dmyTime, shortStaff } from '../lib/format'
import type { InpatientMed } from '../lib/types'

/**
 * ME12 (ronda 11, amplía ME10): «Generar receta». Una sola ventana desde Anexos, la hoja de medicamentos, la tarjeta de la nota
 * y el cuadro al firmar.
 *  - Médico: todos los medicamentos activos del paciente (estén o no en el vademécum; también PRN, infusiones, STAT y
 *    nebulizaciones). Vienen marcados los «No hay en la clínica (va a receta)». Por cada marcado, «Días» y «Cantidad a comprar»
 *    solo para esta receta (no cambian la orden ni la hoja). La receta lleva sus datos y su colegiado.
 *  - Enfermería: solo los marcados «No hay en la clínica», con los datos del médico que los indicó; no elige otros ni pone días.
 */
export function GenerateRxModal({ meds, onClose, only }: { meds: InpatientMed[]; onClose: () => void; only?: string[] }) {
  const { can, notify, staffById } = useStore()
  const nav = useNavigate()
  const doctor = can('inpatient.orders')
  const active = meds.filter((m) => !m.stoppedAt && (doctor || m.buyOutside))
  const [picked, setPicked] = useState<string[]>(() => active.filter((m) => (only ? only.includes(m.id) : m.buyOutside)).map((m) => m.id))
  const [extras, setExtras] = useState<Record<string, { days: string; quantity: string }>>(() =>
    Object.fromEntries(active.map((m) => [m.id, { days: '', quantity: m.buyQuantity ?? '' }])))
  const [busy, setBusy] = useState(false)
  const set = (id: string, patch: Partial<{ days: string; quantity: string }>) => setExtras({ ...extras, [id]: { ...extras[id], ...patch } })
  const badDays = doctor && picked.some((id) => extras[id]?.days.trim() && !(Number(extras[id].days) >= 1 && Number.isInteger(Number(extras[id].days))))
  const go = async (how: 'imprimir' | 'pdf') => {
    setBusy(true)
    try {
      const body = doctor
        ? { kind: 'rx', chosen: true, medIds: picked, extras: Object.fromEntries(picked.map((id) => [id, { days: extras[id]?.days.trim() ? Number(extras[id].days) : undefined, quantity: extras[id]?.quantity.trim() || undefined }])) }
        : { kind: 'rx', medIds: picked }
      const { id } = await api<{ id: string }>('/print-jobs', { body })
      nav(`/app/impresion/${id}?accion=${how}`)
    } catch (x) { notify((x as Error).message, 'error'); setBusy(false) }
  }
  const doctors = new Set(active.filter((m) => picked.includes(m.id)).map((m) => m.orderedBy)).size
  return (
    <Modal title={doctor ? 'Generar receta' : 'Imprimir receta'} className="rxgen" onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--soft" disabled={!picked.length || busy || badDays} onClick={() => go('pdf')}><FileText size={15} />Descargar PDF</button>
      <button className="btn btn--primary" disabled={!picked.length || busy || badDays} onClick={() => go('imprimir')}><Printer size={15} />Imprimir</button>
    </>}>
      <p className="muted" style={{ fontSize: 14, margin: 0 }}>{doctor
        ? 'Marca los medicamentos que van en la receta. Los días y la cantidad a comprar son solo para esta receta: no cambian la orden ni la hoja. Sale con tus datos y sin tu firma y sello en papel no vale.'
        : 'Medicamentos activos marcados «No hay en la clínica». La receta sale con los datos del médico que los indicó y sin su firma y sello en papel no vale.'}</p>
      {!active.length && <p className="muted">{doctor ? 'El paciente no tiene medicamentos activos.' : 'No hay medicamentos marcados «No hay en la clínica».'}</p>}
      <div className="print-pick">
        {active.map((m) => {
          const on = picked.includes(m.id)
          return (
            <div key={m.id} className={`rxgen__row${on ? ' is-on' : ''}`}>
              <label className={`exam-row-pick${on ? ' is-on' : ''}`}>
                <input type="checkbox" checked={on} onChange={() => setPicked(on ? picked.filter((x) => x !== m.id) : [...picked, m.id])} />
                <span><b>{medLabel(m)}</b>{(m.buyOutside || m.id.startsWith('c:')) && <span className="badge badge--amber rx-tag">Receta</span>}
                  <small className="muted" style={{ display: 'block' }}>Indicado por {shortStaff(staffById(m.orderedBy)?.name)}</small></span>
              </label>
              {doctor && on && (
                <div className="rxgen__fields">
                  <label className="field"><span>Días</span><input className="input num" inputMode="numeric" value={extras[m.id]?.days ?? ''} onChange={(e) => set(m.id, { days: e.target.value.replace(/[^0-9]/g, '') })} placeholder="Ej. 3" aria-label={`Días de ${m.drug} en la receta`} /></label>
                  <label className="field"><span>Cantidad a comprar</span><input className="input" value={extras[m.id]?.quantity ?? ''} onChange={(e) => set(m.id, { quantity: e.target.value })} placeholder="Ej. 9 tabletas" data-nocap aria-label={`Cantidad a comprar de ${m.drug}`} /></label>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {!doctor && doctors > 1 && <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>Los indicaron {doctors} médicos: sale una receta por cada uno.</p>}
    </Modal>
  )
}

interface IssuedRx { id: string; kind: string; hospitalizationId?: string; printedAt: string; createdAt: string; doctorIds?: string[]; meds?: { id: string; label: string; days?: number }[] }

/** ME12: «Generar receta» arriba de Anexos y «Recetas emitidas», cada una con fecha y hora, médico, medicamentos, «Ver PDF» e «Imprimir». */
export function RxAnnex({ patientId, stayId, meds }: { patientId: string; stayId: string; meds: InpatientMed[] }) {
  const { can, staffById, notify } = useStore()
  const nav = useNavigate()
  const [making, setMaking] = useState(false)
  const [list, setList] = useState<IssuedRx[] | null>(null)
  const allowed = can('chart.view') && (can('inpatient.orders') || can('inpatient.care'))
  useEffect(() => {
    if (!allowed) return
    api<IssuedRx[]>(`/patients/${patientId}/print-jobs`).then((l) => setList(l.filter((x) => x.kind === 'rx' && x.hospitalizationId === stayId))).catch((e: Error) => notify(e.message, 'error'))
  }, [allowed, patientId, stayId, notify])
  if (!allowed) return null
  const doctor = can('inpatient.orders')
  const marked = meds.some((m) => m.buyOutside && !m.stoppedAt)
  return (
    <section className="panel">
      <div className="panel__head"><div><h2>Recetas</h2><p>{doctor ? 'Receta con los medicamentos activos que elijas, con días y cantidad a comprar.' : 'Receta de lo marcado «No hay en la clínica» y las recetas ya emitidas.'}</p></div>
        {(doctor || marked) && <button className="btn btn--primary btn--sm" onClick={() => setMaking(true)}><Pill size={15} />{doctor ? 'Generar receta' : 'Imprimir receta'}</button>}</div>
      <div className="panel__body">
        <h3 className="rxgen__h">Recetas emitidas</h3>
        {list === null ? <p className="muted">Cargando…</p> : !list.length ? <p className="muted">Todavía no se ha emitido ninguna receta en esta estancia.</p> : (
          <ul className="rxgen__issued">{list.map((r) => (
            <li key={r.id}>
              <span><b>{dmyTime(r.createdAt)}</b> · {(r.doctorIds ?? []).map((d) => staffById(d)?.name ?? '—').join(', ')}
                <small className="muted" style={{ display: 'block' }}>{(r.meds ?? []).map((m) => `${m.label}${m.days ? ` por ${m.days} ${m.days === 1 ? 'día' : 'días'}` : ''}`).join(' · ')}</small></span>
              <span className="rxgen__acts">
                <button className="btn btn--ghost btn--sm" onClick={() => nav(`/app/impresion/${r.id}`)}><FileText size={14} />Ver PDF</button>
                <button className="btn btn--soft btn--sm" onClick={() => nav(`/app/impresion/${r.id}?accion=imprimir`)}><Printer size={14} />Imprimir</button>
              </span>
            </li>
          ))}</ul>
        )}
      </div>
      {making && <GenerateRxModal meds={meds} onClose={() => setMaking(false)} />}
    </section>
  )
}
