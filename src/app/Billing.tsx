import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Plus, Printer, Receipt, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { Loading, Modal, PageHead } from '../components/ui'
import { LogoMark } from '../components/Logo'
import { date, fullName, localISODate, METHOD_LABEL, money, time } from '../lib/format'
import type { Appointment, Payment, PaymentMethod } from '../lib/types'

type Tab = 'pending' | 'today' | 'history'
const METHODS: PaymentMethod[] = ['cash', 'card', 'transfer', 'insurance']

export default function Billing() {
  const { appointments, patient, staffById, settings, fetchPayments, notify, stayOf } = useStore()
  const nav = useNavigate()
  const [tab, setTab] = useState<Tab>('pending')
  const [charging, setCharging] = useState<{ appt?: Appointment } | null>(null)
  const [payments, setPayments] = useState<Payment[] | null>(null)
  const todayKey = localISODate(new Date())
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 7); return localISODate(d) })
  const [to, setTo] = useState(todayKey)

  const range = tab === 'today' ? [todayKey, todayKey] : [from, to]
  const load = useCallback(() => {
    fetchPayments(range[0], range[1])
      .then((ps) => setPayments(ps.filter((p) => { const d = localISODate(new Date(p.paidAt)); return d >= range[0] && d <= range[1] })))
      .catch((e: Error) => notify(e.message, 'error'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchPayments, notify, range[0], range[1]])
  useEffect(() => { if (tab !== 'pending') load() }, [tab, load])

  const since = new Date(); since.setDate(since.getDate() - 14)
  const pending = appointments
    .filter((a) => a.status === 'done' && a.paid === false && new Date(a.start) >= since)
    .sort((a, b) => b.start.localeCompare(a.start))

  const valid = (payments ?? []).filter((p) => !p.voided)
  const total = valid.reduce((s, p) => s + p.total, 0)

  return (
    <div className="page">
      <PageHead title="Caja" sub={pending.length ? `${pending.length} consultas atendidas esperan cobro.` : 'No hay consultas pendientes de cobro.'}
        actions={<button className="btn btn--ghost" onClick={() => setCharging({})}><Plus size={16} />Cobro sin cita</button>} />

      <div className="tabs" role="tablist">
        <button className="tab" role="tab" aria-selected={tab === 'pending'} onClick={() => setTab('pending')}>Por cobrar ({pending.length})</button>
        <button className="tab" role="tab" aria-selected={tab === 'today'} onClick={() => { setPayments(null); setTab('today') }}>Cierre de hoy</button>
        <button className="tab" role="tab" aria-selected={tab === 'history'} onClick={() => { setPayments(null); setTab('history') }}>Historial</button>
      </div>

      {tab === 'pending' && (
        <section className="panel">
          {pending.length ? <div className="rows">{pending.map((a) => {
            const p = patient(a.patientId)!
            return (
              <div key={a.id} className="row" style={{ gridTemplateColumns: '110px 1fr auto' }}>
                <span className="num" style={{ fontSize: 13.5 }}>{date(a.start, { day: 'numeric', month: 'short' })} {time(a.start)}</span>
                <div className="row__who"><strong>{fullName(p)}{stayOf(p.id) && <span className="badge badge--ink" style={{ marginLeft: 8 }}>{stayOf(p.id) === 'observation' ? 'En observación' : 'Hospitalizado'}</span>}</strong><span>{[a.reason, `con ${staffById(a.doctorId)?.name}`].filter(Boolean).join(', ')}</span></div>
                <button className="btn btn--primary btn--sm" onClick={() => setCharging({ appt: a })}><Receipt size={15} />Cobrar</button>
              </div>
            )
          })}</div> : <div className="empty">Todo al día. Cuando un médico firme una consulta, aparecerá aquí para cobrarla.</div>}
        </section>
      )}

      {tab !== 'pending' && (<>
        {tab === 'history' && (
          <div className="cal-toolbar">
            <label className="field" style={{ gridTemplateColumns: 'auto 1fr', alignItems: 'center' }}><span>Desde</span><input className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="field" style={{ gridTemplateColumns: 'auto 1fr', alignItems: 'center' }}><span>Hasta</span><input className="input" type="date" value={to} min={from} max={todayKey} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
        )}
        {!payments ? <Loading /> : (<>
          <div className="stats">
            <div className="stat"><b className="num">{money(total, settings.currency)}</b><span>Total cobrado</span><small>{valid.length} recibos</small></div>
            {(['cash', 'card', 'transfer'] as const).map((m) => (
              <div key={m} className="stat"><b className="num">{money(valid.filter((p) => p.method === m).reduce((s, p) => s + p.total, 0), settings.currency)}</b><span>{METHOD_LABEL[m]}</span></div>
            ))}
          </div>
          <section className="panel table-wrap">
            <table className="table">
              <thead><tr><th>Recibo</th><th>Fecha</th><th>Paciente</th><th>Forma de pago</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
              <tbody>{payments.map((p) => {
                const pt = patient(p.patientId)
                return (
                  <tr key={p.id} style={p.voided ? { opacity: 0.5 } : undefined} onClick={() => nav(`/app/recibos/${p.id}`)} className="clickable">
                    <td className="num"><Link to={`/app/recibos/${p.id}`}>{p.receiptNo}</Link>{p.voided && <span className="badge badge--red" style={{ marginLeft: 8 }}>Anulado</span>}</td>
                    <td className="num">{date(p.paidAt, { day: 'numeric', month: 'short' })} {time(p.paidAt)}</td>
                    <td>{pt ? fullName(pt) : '—'}</td>
                    <td>{METHOD_LABEL[p.method]}{p.reference ? `, ${p.reference}` : ''}</td>
                    <td className="num" style={{ textAlign: 'right', fontWeight: 600, textDecoration: p.voided ? 'line-through' : undefined }}>{money(p.total, settings.currency)}</td>
                  </tr>
                )
              })}</tbody>
            </table>
            {!payments.length && <div className="empty">No hay cobros en este periodo.</div>}
          </section>
          {tab === 'today' && valid.length > 0 && <button className="btn btn--ghost no-print" style={{ justifySelf: 'start' }} onClick={() => window.print()}><Printer size={16} />Imprimir cierre de caja</button>}
        </>)}
      </>)}

      {charging && <ChargeModal appt={charging.appt} onClose={() => setCharging(null)} onPaid={(p) => { setCharging(null); nav(`/app/recibos/${p.id}`) }} />}
    </div>
  )
}

interface Line { serviceId?: string; name: string; price: number; qty: number }

function ChargeModal({ appt, onClose, onPaid }: { appt?: Appointment; onClose: () => void; onPaid: (p: Payment) => void }) {
  const { services, patients, staffById, settings, pay } = useStore()
  const active = services.filter((s) => s.active)
  const defaultSvc = appt ? services.find((s) => s.id === staffById(appt.doctorId)?.serviceId) : undefined
  const [patientId, setPatientId] = useState(appt?.patientId ?? '')
  const [lines, setLines] = useState<Line[]>(defaultSvc ? [{ serviceId: defaultSvc.id, name: defaultSvc.name, price: defaultSvc.price, qty: 1 }] : [])
  const [adding, setAdding] = useState('')
  const [discount, setDiscount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [reference, setReference] = useState('')
  const [received, setReceived] = useState('')
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')

  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0)
  const disc = Number(discount) || 0
  const total = Math.max(0, subtotal - disc)
  const change = method === 'cash' && Number(received) > total ? Number(received) - total : 0
  const needsRef = method === 'card' || method === 'transfer'
  const valid = patientId && lines.length && disc <= subtotal && (!needsRef || reference.trim())
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s.length < 2 ? [] : patients.filter((p) => !p.pending && (fullName(p).toLowerCase().includes(s) || p.record.toLowerCase().includes(s))).slice(0, 6)
  }, [q, patients])
  const chosen = patients.find((p) => p.id === patientId)

  return (
    <Modal title={appt ? 'Cobrar consulta' : 'Cobro sin cita'} onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!valid || busy} onClick={async () => {
        setBusy(true)
        const r = await pay({ appointmentId: appt?.id, patientId, items: lines, discount: disc, method, reference: reference.trim() || undefined })
        setBusy(false)
        if (r) onPaid(r)
      }}>Cobrar {money(total, settings.currency)}</button>
    </>}>
      {appt || chosen ? (
        <div className="chart-meta" style={{ marginTop: 0 }}>
          <span>Paciente <b>{chosen ? fullName(chosen) : ''}</b></span>
          {appt && <span>Médico <b>{staffById(appt.doctorId)?.name}</b></span>}
          {!appt && <button className="btn btn--ghost btn--sm" onClick={() => setPatientId('')}>Cambiar</button>}
        </div>
      ) : (
        <div className="field suggest">
          <span>Paciente</span>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre o número de expediente" autoFocus />
          {matches.length > 0 && <div className="suggest__list">{matches.map((p) => (
            <button key={p.id} onClick={() => { setPatientId(p.id); setQ('') }}><code>{p.record.slice(4)}</code>{fullName(p)}</button>
          ))}</div>}
        </div>
      )}

      <div className="lines">
        {lines.map((l, i) => (
          <div key={i} className="line">
            <span>{l.name}</span>
            <input className="input num" type="number" min={1} max={99} value={l.qty} aria-label={`Cantidad de ${l.name}`}
              onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, qty: Math.max(1, Number(e.target.value) || 1) } : x))} />
            <input className="input num" type="number" min={0} step="0.01" value={l.price} aria-label={`Precio de ${l.name}`}
              onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, price: Math.max(0, Number(e.target.value) || 0) } : x))} />
            <b className="num">{money(l.price * l.qty, settings.currency)}</b>
            <button className="icon-btn" aria-label={`Quitar ${l.name}`} onClick={() => setLines(lines.filter((_, j) => j !== i))}><X size={16} /></button>
          </div>
        ))}
        <select className="select" value={adding} aria-label="Agregar servicio" onChange={(e) => {
          const s = active.find((x) => x.id === e.target.value)
          if (s) setLines([...lines, { serviceId: s.id, name: s.name, price: s.price, qty: 1 }])
          setAdding('')
        }}>
          <option value="">Agregar servicio…</option>
          {active.map((s) => <option key={s.id} value={s.id}>{s.name}, {money(s.price, settings.currency)}</option>)}
        </select>
      </div>

      <div className="form-grid">
        <label className="field"><span>Descuento</span><input className="input num" type="number" min={0} step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0.00" /></label>
        <div className="field"><span>Total a cobrar</span><div className="total-box num">{money(total, settings.currency)}</div></div>
      </div>
      {disc > subtotal && <p style={{ color: 'var(--red-ink)', fontSize: 13.5 }}>El descuento no puede ser mayor que el subtotal.</p>}

      <div className="field">
        <span>Forma de pago</span>
        <div className="segmented" role="radiogroup" aria-label="Forma de pago">
          {METHODS.map((m) => <button key={m} role="radio" aria-checked={method === m} onClick={() => setMethod(m)}>{METHOD_LABEL[m]}</button>)}
        </div>
      </div>
      {method === 'cash' && (
        <div className="form-grid">
          <label className="field"><span>Recibido</span><input className="input num" type="number" min={0} step="0.01" value={received} onChange={(e) => setReceived(e.target.value)} placeholder={total.toFixed(2)} /></label>
          <div className="field"><span>Cambio</span><div className="total-box num">{money(change, settings.currency)}</div></div>
        </div>
      )}
      {method !== 'cash' && (
        <label className="field"><span>{method === 'insurance' ? 'Número de póliza o autorización (opcional)' : 'Referencia o autorización'}</span>
          <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} /></label>
      )}
    </Modal>
  )
}

export function ReceiptSheet() {
  const { id } = useParams()
  const { fetchPayment, staffById, settings, can, voidPayment, notify } = useStore()
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchPayment>> | null>(null)
  const [voiding, setVoiding] = useState(false)
  const [reason, setReason] = useState('')
  const load = useCallback(() => { if (id) fetchPayment(id).then(setData).catch((e: Error) => notify(e.message, 'error')) }, [id, fetchPayment, notify])
  useEffect(load, [load])
  if (!data) return <Loading label="Cargando recibo" />
  const { payment: p, patient } = data
  const subtotal = p.items.reduce((s, i) => s + i.price * i.qty, 0)
  return (
    <div className="page">
      <div className="page-head no-print">
        <Link className="btn btn--ghost" to="/app/caja"><ChevronLeft size={16} />Volver a caja</Link>
        <div className="page-head__actions">
          {can('settings.manage') && !p.voided && <button className="btn btn--danger" onClick={() => setVoiding(true)}>Anular recibo</button>}
          <button className="btn btn--primary" onClick={() => window.print()}><Printer size={16} />Imprimir recibo</button>
        </div>
      </div>
      <article className="rx-sheet receipt">
        {p.voided && <div className="void-stamp" aria-label="Recibo anulado">Anulado</div>}
        <header className="rx-sheet__head">
          <div className="rx-sheet__doc">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}><LogoMark size={26} /><b style={{ fontSize: 18 }}>{settings.name}</b></div>
            <p>{settings.address}</p><p>Tel. {settings.phone}{settings.email ? `, ${settings.email}` : ''}</p>
          </div>
          <div className="rx-sheet__folio">Recibo<b>{p.receiptNo}</b>{date(p.paidAt)}, {time(p.paidAt)}</div>
        </header>
        <div className="rx-sheet__pt" style={{ gridTemplateColumns: 'repeat(3, auto)' }}>
          <div><span>Paciente</span>{fullName(patient)}</div>
          <div><span>Expediente</span>{patient.record}</div>
          <div><span>Forma de pago</span>{METHOD_LABEL[p.method]}{p.reference ? `, ${p.reference}` : ''}</div>
        </div>
        <table className="table receipt__items">
          <thead><tr><th>Concepto</th><th style={{ textAlign: 'center' }}>Cant.</th><th style={{ textAlign: 'right' }}>Precio</th><th style={{ textAlign: 'right' }}>Importe</th></tr></thead>
          <tbody>{p.items.map((i, k) => (
            <tr key={k}><td>{i.name}</td><td className="num" style={{ textAlign: 'center' }}>{i.qty}</td><td className="num" style={{ textAlign: 'right' }}>{money(i.price, settings.currency)}</td><td className="num" style={{ textAlign: 'right' }}>{money(i.price * i.qty, settings.currency)}</td></tr>
          ))}</tbody>
        </table>
        <div className="receipt__totals num">
          <span>Subtotal</span><span>{money(subtotal, settings.currency)}</span>
          {p.discount > 0 && <><span>Descuento</span><span>− {money(p.discount, settings.currency)}</span></>}
          <b>Total</b><b>{money(p.total, settings.currency)}</b>
        </div>
        <footer className="rx-sheet__foot"><span>Atendió: {staffById(p.receivedBy)?.name}</span><span>Gracias por su preferencia</span></footer>
      </article>
      {voiding && (
        <Modal title={`Anular ${p.receiptNo}`} onClose={() => setVoiding(false)} footer={<>
          <button className="btn btn--ghost" onClick={() => setVoiding(false)}>Cancelar</button>
          <button className="btn btn--danger" disabled={reason.trim().length < 5} onClick={async () => { if (await voidPayment(p.id, reason.trim())) { setVoiding(false); load() } }}>Anular recibo</button>
        </>}>
          <p>El recibo queda en el historial marcado como anulado y la consulta vuelve a la lista de pendientes de cobro.</p>
          <label className="field"><span>Motivo</span><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. Cobro duplicado" autoFocus /></label>
        </Modal>
      )}
    </div>
  )
}
