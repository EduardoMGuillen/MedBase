import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Download, FileText, Plus, Printer, Receipt, Search, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { Loading, Modal, PageHead } from '../components/ui'
import { LogoMark } from '../components/Logo'
import { contactLine, date, fullName, localISODate, METHOD_LABEL, money, time } from '../lib/format'
import { normalize } from '../lib/patients'
import { cashSuggestions, daysWaiting, discountAmount, matchesPayment } from '../lib/billing'
import type { Appointment, Payment, PaymentMethod } from '../lib/types'

type Tab = 'pending' | 'today' | 'history'
const METHODS: PaymentMethod[] = ['cash', 'card', 'transfer', 'insurance']

export default function Billing() {
  const { appointments, patient, staffById, services, settings, fetchPayments, notify, stayOf } = useStore()
  const nav = useNavigate()
  const [tab, setTab] = useState<Tab>('pending')
  const [charging, setCharging] = useState<{ appt?: Appointment } | null>(null)
  const [payments, setPayments] = useState<Payment[] | null>(null)
  const [q, setQ] = useState('')
  const todayKey = localISODate(new Date())
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 7); return localISODate(d) })
  const [to, setTo] = useState(todayKey)
  const cur = settings.currency

  const range = tab === 'today' ? [todayKey, todayKey] : [from, to]
  const load = useCallback(() => {
    fetchPayments(range[0], range[1])
      .then((ps) => setPayments(ps.filter((p) => { const d = localISODate(new Date(p.paidAt)); return d >= range[0] && d <= range[1] })))
      .catch((e: Error) => notify(e.message, 'error'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchPayments, notify, range[0], range[1]])
  useEffect(() => { if (tab !== 'pending') load() }, [tab, load])

  // Toda la ventana de la agenda (90 días): una consulta sin cobrar no desaparece de la lista
  const pending = appointments
    .filter((a) => a.status === 'done' && a.paid === false)
    .sort((a, b) => b.start.localeCompare(a.start))
  const priceOf = (a: Appointment) => services.find((s) => s.id === staffById(a.doctorId)?.serviceId)?.price ?? 0
  const pendingTotal = pending.reduce((s, a) => s + priceOf(a), 0)
  const overdue = pending.filter((a) => daysWaiting(a.start) >= 7).length
  const nq = normalize(q)
  const shownPending = nq ? pending.filter((a) => { const p = patient(a.patientId); return p && normalize(`${fullName(p)} ${p.record} ${a.reason ?? ''}`).includes(nq) }) : pending

  const shown = (payments ?? []).filter((p) => { const pt = patient(p.patientId); return matchesPayment(p, pt ? fullName(pt) : '', q) })
  const valid = (payments ?? []).filter((p) => !p.voided)
  const total = valid.reduce((s, p) => s + p.total, 0)
  const byMethod = (m: PaymentMethod) => valid.filter((p) => p.method === m).reduce((s, p) => s + p.total, 0)
  const noInvoice = valid.filter((p) => !p.invoiceNo).length

  const exportCsv = () => {
    const cell = (v: string) => `"${v.replace(/"/g, '""')}"`
    const lines = [
      ['Recibo', 'Factura', 'Fecha', 'Hora', 'Paciente', 'Expediente', 'Forma de pago', 'Referencia', 'Cobró', 'Descuento', 'Total', 'Estado'].join(','),
      ...(payments ?? []).map((p) => {
        const pt = patient(p.patientId)
        return [p.receiptNo, p.invoiceNo ?? '', localISODate(new Date(p.paidAt)), time(p.paidAt), pt ? fullName(pt) : '', pt?.record ?? '', METHOD_LABEL[p.method], p.reference ?? '',
          staffById(p.receivedBy)?.name ?? '', p.discount.toFixed(2), p.total.toFixed(2), p.voided ? 'Anulado' : 'Válido'].map((v) => cell(String(v))).join(',')
      }),
    ]
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `cobros-${range[0]}-a-${range[1]}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const switchTab = (t: Tab) => { if (t !== 'pending') setPayments(null); setTab(t) }

  return (
    <div className="page">
      <PageHead title="Caja" sub={pending.length ? `${pending.length} ${pending.length === 1 ? 'consulta atendida espera' : 'consultas atendidas esperan'} cobro.` : 'No hay consultas pendientes de cobro.'}
        actions={<button className="btn btn--ghost" onClick={() => setCharging({})}><Plus size={16} />Cobro sin cita</button>} />

      <div className="tabs tabs--sticky" role="tablist">
        <button className="tab" role="tab" aria-selected={tab === 'pending'} onClick={() => switchTab('pending')}>Por cobrar ({pending.length})</button>
        <button className="tab" role="tab" aria-selected={tab === 'today'} onClick={() => switchTab('today')}>Cierre de hoy</button>
        <button className="tab" role="tab" aria-selected={tab === 'history'} onClick={() => switchTab('history')}>Historial</button>
      </div>

      <div className="cal-toolbar">
        <label className="caja-search">
          <Search size={16} />
          <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar en caja"
            placeholder={tab === 'pending' ? 'Buscar paciente, expediente o motivo' : 'Buscar paciente, recibo, factura o referencia'} />
        </label>
        {tab === 'history' && (<>
          <label className="field" style={{ gridTemplateColumns: 'auto 1fr', alignItems: 'center' }}><span>Desde</span><input className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="field" style={{ gridTemplateColumns: 'auto 1fr', alignItems: 'center' }}><span>Hasta</span><input className="input" type="date" value={to} min={from} max={todayKey} onChange={(e) => setTo(e.target.value)} /></label>
        </>)}
        {tab !== 'pending' && payments && payments.length > 0 && <button className="btn btn--ghost no-print" style={{ marginLeft: 'auto' }} onClick={exportCsv}><Download size={16} />Exportar CSV</button>}
      </div>

      {tab === 'pending' && (<>
        {pending.length > 0 && (
          <div className="stats stats--3">
            <div className="stat"><b className="num">{pending.length}</b><span>Consultas por cobrar</span></div>
            <div className="stat"><b className="num">{money(pendingTotal, cur)}</b><span>Estimado por cobrar</span><small style={{ color: 'var(--muted)', fontWeight: 400 }}>Según la tarifa de consulta de cada médico</small></div>
            <div className="stat"><b className="num" style={overdue ? { color: 'var(--red-ink)' } : undefined}>{overdue}</b><span>Con una semana o más</span></div>
          </div>
        )}
        <section className="panel">
          {shownPending.length ? <div className="rows">{shownPending.map((a) => {
            const p = patient(a.patientId)!
            const days = daysWaiting(a.start)
            return (
              <div key={a.id} className="row caja-row">
                <span className="num" style={{ fontSize: 13.5 }}>{date(a.start, { day: 'numeric', month: 'short' })} {time(a.start)}</span>
                <div className="row__who">
                  <strong>{fullName(p)}
                    {stayOf(p.id) && <span className="badge badge--ink" style={{ marginLeft: 8 }}>{stayOf(p.id) === 'observation' ? 'En observación' : 'Hospitalizado'}</span>}
                    {days >= 2 && <span className={`badge ${days >= 7 ? 'badge--red' : 'badge--amber'}`} style={{ marginLeft: 8 }}>Hace {days} días</span>}
                  </strong>
                  <span>{[a.reason, `con ${staffById(a.doctorId)?.name}`].filter(Boolean).join(', ')}</span>
                </div>
                <button className="btn btn--primary btn--sm" onClick={() => setCharging({ appt: a })}><Receipt size={15} />Cobrar</button>
              </div>
            )
          })}</div> : <div className="empty">{pending.length ? 'Ninguna consulta pendiente coincide con la búsqueda.' : 'Todo al día. Cuando un médico firme una consulta, aparecerá aquí para cobrarla.'}</div>}
        </section>
      </>)}

      {tab !== 'pending' && (!payments ? <Loading /> : (<>
        <div className="stats stats--5">
          <div className="stat"><b className="num">{money(total, cur)}</b><span>Total cobrado</span><small>{valid.length} {valid.length === 1 ? 'recibo' : 'recibos'}</small></div>
          {METHODS.map((m) => <div key={m} className="stat"><b className="num">{money(byMethod(m), cur)}</b><span>{METHOD_LABEL[m]}</span></div>)}
        </div>
        {noInvoice > 0 && <div className="alert-strip alert-strip--amber no-print"><FileText size={16} />{noInvoice} {noInvoice === 1 ? 'cobro no tiene' : 'cobros no tienen'} anotado el número de factura del talonario. Ábrelos para anotarlo.</div>}
        {tab === 'today' && <CashCount expected={byMethod('cash')} currency={cur} />}
        <section className="panel table-wrap">
          <table className="table table--sticky">
            <thead><tr><th>Recibo</th><th>Factura</th><th>Fecha</th><th>Paciente</th><th>Forma de pago</th><th>Cobró</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
            <tbody>{shown.map((p) => {
              const pt = patient(p.patientId)
              return (
                <tr key={p.id} style={p.voided ? { opacity: 0.5 } : undefined} onClick={() => nav(`/app/recibos/${p.id}`)} className="clickable">
                  <td className="num"><Link to={`/app/recibos/${p.id}`}>{p.receiptNo}</Link>{p.voided && <span className="badge badge--red" style={{ marginLeft: 8 }}>Anulado</span>}</td>
                  <td className="num">{p.invoiceNo ?? (p.voided ? '—' : <span style={{ color: 'var(--faint)' }}>Sin anotar</span>)}</td>
                  <td className="num">{date(p.paidAt, { day: 'numeric', month: 'short' })} {time(p.paidAt)}</td>
                  <td>{pt ? fullName(pt) : '—'}</td>
                  <td>{METHOD_LABEL[p.method]}{p.reference ? `, ${p.reference}` : ''}</td>
                  <td>{staffById(p.receivedBy)?.name ?? '—'}</td>
                  <td className="num" style={{ textAlign: 'right', fontWeight: 600, textDecoration: p.voided ? 'line-through' : undefined }}>{money(p.total, cur)}</td>
                </tr>
              )
            })}</tbody>
          </table>
          {!shown.length && <div className="empty">{payments.length ? 'Ningún cobro coincide con la búsqueda.' : 'No hay cobros en este periodo.'}</div>}
        </section>
        {tab === 'today' && valid.length > 0 && <button className="btn btn--ghost no-print" style={{ justifySelf: 'start' }} onClick={() => window.print()}><Printer size={16} />Imprimir cierre de caja</button>}
      </>))}

      {charging && <ChargeModal appt={charging.appt} onClose={() => setCharging(null)} onPaid={(p) => { setCharging(null); nav(`/app/recibos/${p.id}`) }} />}
    </div>
  )
}

/** Arqueo del cierre: efectivo que debería haber (fondo + cobros en efectivo) contra el contado. */
function CashCount({ expected, currency }: { expected: number; currency: string }) {
  const [float, setFloat] = useState('')
  const [counted, setCounted] = useState('')
  const should = expected + (Number(float) || 0)
  const diff = Math.round(((Number(counted) || 0) - should) * 100) / 100
  return (
    <section className="panel arqueo">
      <h3>Arqueo de efectivo</h3>
      <div className="form-grid form-grid--4">
        <label className="field"><span>Fondo inicial</span><input className="input num" type="number" min={0} step="0.01" value={float} onChange={(e) => setFloat(e.target.value)} placeholder="0.00" /></label>
        <div className="field"><span>Debe haber en caja</span><div className="total-box num">{money(should, currency)}</div></div>
        <label className="field"><span>Efectivo contado</span><input className="input num" type="number" min={0} step="0.01" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="0.00" /></label>
        <div className="field"><span>Diferencia</span>
          <div className={`total-box num ${counted === '' ? '' : diff === 0 ? 'total-box--ok' : diff > 0 ? 'total-box--warn' : 'total-box--bad'}`}>
            {counted === '' ? '—' : diff === 0 ? 'Cuadra' : `${diff > 0 ? 'Sobran' : 'Faltan'} ${money(Math.abs(diff), currency)}`}
          </div>
        </div>
      </div>
    </section>
  )
}

interface Line { serviceId?: string; name: string; price: number; qty: number }

function ChargeModal({ appt, onClose, onPaid }: { appt?: Appointment; onClose: () => void; onPaid: (p: Payment) => void }) {
  const { services, patients, staffById, settings, pay } = useStore()
  const cur = settings.currency
  const active = services.filter((s) => s.active)
  const defaultSvc = appt ? services.find((s) => s.id === staffById(appt.doctorId)?.serviceId) : undefined
  const [patientId, setPatientId] = useState(appt?.patientId ?? '')
  const [lines, setLines] = useState<Line[]>(defaultSvc ? [{ serviceId: defaultSvc.id, name: defaultSvc.name, price: defaultSvc.price, qty: 1 }] : [])
  const [svcQ, setSvcQ] = useState('')
  const [svcOpen, setSvcOpen] = useState(false)
  const [discount, setDiscount] = useState('')
  const [discMode, setDiscMode] = useState<'amount' | 'percent'>('amount')
  const [discReason, setDiscReason] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [reference, setReference] = useState('')
  const [received, setReceived] = useState('')
  const [invoiceNo, setInvoiceNo] = useState('')
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const priceRefs = useRef<(HTMLInputElement | null)[]>([])
  const focusPrice = useRef(-1)

  useEffect(() => { if (focusPrice.current >= 0) { priceRefs.current[focusPrice.current]?.select(); focusPrice.current = -1 } }, [lines])

  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0)
  const disc = discountAmount(subtotal, discount, discMode)
  const total = Math.max(0, Math.round((subtotal - disc) * 100) / 100)
  const got = Number(received) || 0
  const short = method === 'cash' && received !== '' && got < total
  const change = method === 'cash' && got > total ? got - total : 0
  const needsRef = method === 'card' || method === 'transfer'
  const valid = patientId && lines.length && disc <= subtotal && (!needsRef || reference.trim()) && (disc === 0 || discReason.trim()) && !short
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s.length < 2 ? [] : patients.filter((p) => !p.pending && (fullName(p).toLowerCase().includes(s) || p.record.toLowerCase().includes(s))).slice(0, 6)
  }, [q, patients])
  const chosen = patients.find((p) => p.id === patientId)
  const svcMatches = active.filter((s) => normalize(s.name).includes(normalize(svcQ))).slice(0, 8)

  const addLine = (l: Line) => {
    setLines([...lines, l])
    setSvcQ(''); setSvcOpen(false)
    // Un concepto libre llega sin precio: el cursor pasa directo a escribirlo
    if (!l.serviceId) focusPrice.current = lines.length
  }

  return (
    <Modal title={appt ? 'Cobrar consulta' : 'Cobro sin cita'} onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!valid || busy} onClick={async () => {
        setBusy(true)
        const r = await pay({ appointmentId: appt?.id, patientId, items: lines, discount: disc, discountReason: disc > 0 ? discReason.trim() : undefined, method,
          reference: reference.trim() || undefined, invoiceNo: invoiceNo.trim() || undefined })
        setBusy(false)
        if (r) onPaid(r)
      }}>Cobrar {money(total, cur)}</button>
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
            <input ref={(el) => { priceRefs.current[i] = el }} className="input num" type="number" min={0} step="0.01" value={l.price} aria-label={`Precio de ${l.name}`}
              onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, price: Math.max(0, Number(e.target.value) || 0) } : x))} />
            <b className="num">{money(l.price * l.qty, cur)}</b>
            <button className="icon-btn" aria-label={`Quitar ${l.name}`} onClick={() => setLines(lines.filter((_, j) => j !== i))}><X size={16} /></button>
          </div>
        ))}
        <div className="suggest">
          <input className="input" value={svcQ} aria-label="Agregar servicio o concepto" placeholder="Agregar servicio o escribir un concepto…"
            onFocus={() => setSvcOpen(true)} onBlur={() => setTimeout(() => setSvcOpen(false), 150)}
            onChange={(e) => { setSvcQ(e.target.value); setSvcOpen(true) }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              if (svcMatches.length === 1 || (svcMatches.length && !svcQ.trim())) { const s = svcMatches[0]; addLine({ serviceId: s.id, name: s.name, price: s.price, qty: 1 }) }
              else if (svcQ.trim() && !svcMatches.length) addLine({ name: svcQ.trim(), price: 0, qty: 1 })
            }} />
          {svcOpen && (svcMatches.length > 0 || svcQ.trim()) && <div className="suggest__list">
            {svcMatches.map((s) => (
              <button key={s.id} onMouseDown={(e) => e.preventDefault()} onClick={() => addLine({ serviceId: s.id, name: s.name, price: s.price, qty: 1 })}>
                <span style={{ flex: 1 }}>{s.name}</span><span className="num" style={{ color: 'var(--muted)' }}>{money(s.price, cur)}</span>
              </button>
            ))}
            {svcQ.trim() && <button onMouseDown={(e) => e.preventDefault()} onClick={() => addLine({ name: svcQ.trim(), price: 0, qty: 1 })}>
              <Plus size={15} />Agregar «{svcQ.trim()}» como concepto libre
            </button>}
          </div>}
        </div>
      </div>

      <div className="form-grid">
        <div className="field"><span>Descuento</span>
          <div className="caja-discount">
            <input className="input num" type="number" min={0} step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder={discMode === 'percent' ? '0' : '0.00'} aria-label="Descuento" />
            <div className="segmented" role="radiogroup" aria-label="Tipo de descuento">
              <button role="radio" aria-checked={discMode === 'amount'} onClick={() => setDiscMode('amount')}>{cur}</button>
              <button role="radio" aria-checked={discMode === 'percent'} onClick={() => setDiscMode('percent')}>%</button>
            </div>
          </div>
          {discMode === 'percent' && disc > 0 && <small className="num" style={{ color: 'var(--muted)' }}>= {money(disc, cur)}</small>}
        </div>
        <div className="field"><span>Total a cobrar</span><div className="total-box num">{money(total, cur)}</div></div>
      </div>
      {disc > subtotal && <p style={{ color: 'var(--red-ink)', fontSize: 13.5 }}>El descuento no puede ser mayor que el subtotal.</p>}
      {disc > 0 && disc <= subtotal && (
        <label className="field"><span>Motivo del descuento</span><input className="input" value={discReason} onChange={(e) => setDiscReason(e.target.value)} maxLength={120} placeholder="Ej. Tercera edad, cortesía del médico" /></label>
      )}

      <div className="field">
        <span>Forma de pago</span>
        <div className="segmented" role="radiogroup" aria-label="Forma de pago">
          {METHODS.map((m) => <button key={m} role="radio" aria-checked={method === m} onClick={() => setMethod(m)}>{METHOD_LABEL[m]}</button>)}
        </div>
      </div>
      {method === 'cash' && (<>
        <div className="form-grid">
          <label className="field"><span>Recibido</span><input className="input num" type="number" min={0} step="0.01" value={received} onChange={(e) => setReceived(e.target.value)} placeholder={total.toFixed(2)} /></label>
          <div className="field"><span>{short ? 'Falta' : 'Cambio'}</span><div className={`total-box num ${short ? 'total-box--bad' : ''}`}>{money(short ? total - got : change, cur)}</div></div>
        </div>
        {cashSuggestions(total).length > 0 && <div className="quick-cash" aria-label="Montos rápidos">
          {cashSuggestions(total).map((v, i) => <button key={v} className="chip" onClick={() => setReceived(String(v))}>{i === 0 ? 'Exacto' : money(v, cur)}</button>)}
        </div>}
      </>)}
      {method !== 'cash' && (
        <label className="field"><span>{method === 'insurance' ? 'Número de póliza o autorización (opcional)' : 'Referencia o autorización'}</span>
          <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} /></label>
      )}
      <label className="field"><span>Factura del talonario (opcional)</span>
        <input className="input num" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} maxLength={40} placeholder="000-001-01-00000000" />
        <small style={{ color: 'var(--muted)' }}>Si todavía no la llenas, puedes anotarla después en el recibo.</small>
      </label>
    </Modal>
  )
}

export function ReceiptSheet() {
  const { id } = useParams()
  const { fetchPayment, staffById, settings, can, voidPayment, setInvoiceNo, notify } = useStore()
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchPayment>> | null>(null)
  const [voiding, setVoiding] = useState(false)
  const [reason, setReason] = useState('')
  const [editingInvoice, setEditingInvoice] = useState(false)
  const [invoice, setInvoice] = useState('')
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
          {!p.voided && <button className="btn btn--ghost" onClick={() => { setInvoice(p.invoiceNo ?? ''); setEditingInvoice(true) }}><FileText size={16} />{p.invoiceNo ? 'Cambiar factura' : 'Anotar factura'}</button>}
          <button className="btn btn--primary" onClick={() => window.print()}><Printer size={16} />Imprimir recibo</button>
        </div>
      </div>
      <article className="rx-sheet receipt">
        {p.voided && <div className="void-stamp" aria-label="Recibo anulado">Anulado</div>}
        <header className="rx-sheet__head">
          <div className="rx-sheet__doc">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}><LogoMark size={26} /><b style={{ fontSize: 18 }}>{settings.name}</b></div>
            <p>{settings.address}</p><p>Tel. {contactLine(settings)}{settings.email ? `, ${settings.email}` : ''}</p>
          </div>
          <div className="rx-sheet__folio">Recibo<b>{p.receiptNo}</b>{date(p.paidAt)}, {time(p.paidAt)}</div>
        </header>
        <div className="rx-sheet__pt" style={{ gridTemplateColumns: `repeat(${p.invoiceNo ? 4 : 3}, auto)` }}>
          <div><span>Paciente</span>{fullName(patient)}</div>
          <div><span>Expediente</span>{patient.record}</div>
          <div><span>Forma de pago</span>{METHOD_LABEL[p.method]}{p.reference ? `, ${p.reference}` : ''}</div>
          {p.invoiceNo && <div><span>Factura</span>{p.invoiceNo}</div>}
        </div>
        <table className="table receipt__items">
          <thead><tr><th>Concepto</th><th style={{ textAlign: 'center' }}>Cant.</th><th style={{ textAlign: 'right' }}>Precio</th><th style={{ textAlign: 'right' }}>Importe</th></tr></thead>
          <tbody>{p.items.map((i, k) => (
            <tr key={k}><td>{i.name}</td><td className="num" style={{ textAlign: 'center' }}>{i.qty}</td><td className="num" style={{ textAlign: 'right' }}>{money(i.price, settings.currency)}</td><td className="num" style={{ textAlign: 'right' }}>{money(i.price * i.qty, settings.currency)}</td></tr>
          ))}</tbody>
        </table>
        <div className="receipt__totals num">
          <span>Subtotal</span><span>{money(subtotal, settings.currency)}</span>
          {p.discount > 0 && <><span>Descuento{p.discountReason ? ` (${p.discountReason})` : ''}</span><span>− {money(p.discount, settings.currency)}</span></>}
          <b>Total</b><b>{money(p.total, settings.currency)}</b>
        </div>
        {p.voided && <p className="receipt__void">Anulado{p.voidedAt ? ` el ${date(p.voidedAt)}, ${time(p.voidedAt)}` : ''}{p.voidedBy ? ` por ${staffById(p.voidedBy)?.name ?? '—'}` : ''}{p.voidReason ? `. Motivo: ${p.voidReason}` : ''}</p>}
        <footer className="rx-sheet__foot"><span>Atendió: {staffById(p.receivedBy)?.name}</span><span>Gracias por su preferencia</span></footer>
        <p className="receipt__note">Comprobante interno de pago. No sustituye la factura.</p>
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
      {editingInvoice && (
        <Modal title={p.invoiceNo ? 'Cambiar factura' : 'Anotar factura'} onClose={() => setEditingInvoice(false)} footer={<>
          <button className="btn btn--ghost" onClick={() => setEditingInvoice(false)}>Cancelar</button>
          <button className="btn btn--primary" disabled={!invoice.trim() || invoice.trim() === p.invoiceNo} onClick={async () => { if (await setInvoiceNo(p.id, invoice.trim())) { setEditingInvoice(false); load() } }}>Guardar</button>
        </>}>
          <p>Número de la factura del talonario que se entregó por este cobro. El cambio queda en la bitácora.</p>
          <label className="field"><span>Número de factura</span><input className="input num" value={invoice} onChange={(e) => setInvoice(e.target.value)} maxLength={40} placeholder="000-001-01-00000000" autoFocus /></label>
        </Modal>
      )}
    </div>
  )
}
