import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Download, FileText, MessageCircle, Plus, Printer, Search, Wallet, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { Loading, Modal, PageHead } from '../components/ui'
import { LogoMark } from '../components/Logo'
import { contactLine, date, fullName, localISODate, METHOD_LABEL, money, time, whatsappUrl } from '../lib/format'
import { normalize } from '../lib/patients'
import { BANKS, cashSuggestions, discountAmount, matchesPayment, receivedIn } from '../lib/billing'
import type { Appointment, Payment, PaymentMethod } from '../lib/types'

type Tab = 'today' | 'balances' | 'history'

/**
 * Caja (AD9). Los cobros se generan aquí, en el momento de cobrar (antes o después de la atención, como se haga en la
 * clínica): ya no aparecen solos por cita. Se ve lo cobrado hoy y, si hay abonos, los saldos pendientes.
 */
export default function Billing() {
  const { patient, staffById, settings, fetchPayments, fetchBalances, notify, appointments } = useStore()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>('today')
  // Desde la agenda o la sala se puede abrir el cobro ya con la visita del día
  const fromAppt = appointments.find((a) => a.id === params.get('cobrar'))
  const [charging, setCharging] = useState<{ appt?: Appointment } | null>(() => (params.get('cobrar') ? { appt: fromAppt } : null))
  const [payments, setPayments] = useState<Payment[] | null>(null)
  const [balances, setBalances] = useState<Payment[] | null>(null)
  const [q, setQ] = useState('')
  const todayKey = localISODate(new Date())
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 7); return localISODate(d) })
  const [to, setTo] = useState(todayKey)
  const cur = settings.currency
  const methods = settings.paymentMethods ?? ['cash', 'transfer']

  const range = tab === 'today' ? [todayKey, todayKey] : [from, to]
  const load = useCallback(() => {
    fetchPayments(range[0], range[1]).then(setPayments).catch((e: Error) => notify(e.message, 'error'))
    fetchBalances().then(setBalances).catch(() => null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchPayments, fetchBalances, notify, range[0], range[1]])
  useEffect(() => { load() }, [tab, load])

  // Lo recibido en el periodo: lo pagado al cobrar y los abonos, en su día y con su forma de pago
  const received = receivedIn(payments ?? [], range[0], range[1])
  const total = received.reduce((s, r) => s + r.amount, 0)
  const byMethod = (m: PaymentMethod) => received.filter((r) => r.method === m).reduce((s, r) => s + r.amount, 0)
  const shownMethods = [...new Set([...methods, ...received.map((r) => r.method)])]
  const charged = (payments ?? []).filter((p) => { const d = localISODate(new Date(p.paidAt)); return d >= range[0] && d <= range[1] })
  const shown = charged.filter((p) => { const pt = patient(p.patientId); return matchesPayment(p, pt ? fullName(pt) : '', q) })
  const noInvoice = charged.filter((p) => !p.voided && !p.invoiceNo).length
  const owed = (balances ?? []).reduce((s, p) => s + (p.balance ?? 0), 0)

  const exportCsv = () => {
    const cell = (v: string) => `"${v.replace(/"/g, '""')}"`
    const lines = [
      ['Recibo', 'Factura', 'Fecha', 'Hora', 'Paciente', 'Expediente', 'Servicios', 'Forma de pago', 'Banco', 'Referencia', 'Cobró', 'Descuento', 'Total', 'Pagado', 'Saldo', 'Estado'].join(','),
      ...charged.map((p) => {
        const pt = patient(p.patientId)
        return [p.receiptNo, p.invoiceNo ?? '', localISODate(new Date(p.paidAt)), time(p.paidAt), pt ? fullName(pt) : '', pt?.record ?? '', p.items.map((i) => `${i.qty} × ${i.name}`).join('; '),
          METHOD_LABEL[p.method], p.bank ?? '', p.reference ?? '', staffById(p.receivedBy)?.name ?? '', p.discount.toFixed(2), p.total.toFixed(2),
          (p.amountPaid ?? p.total).toFixed(2), (p.balance ?? 0).toFixed(2), p.voided ? 'Anulado' : 'Válido'].map((v) => cell(String(v))).join(',')
      }),
    ]
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `cobros-${range[0]}-a-${range[1]}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const switchTab = (t: Tab) => { if (t !== tab) setPayments(null); setTab(t) }
  const closeCharge = () => { setCharging(null); if (params.get('cobrar')) setParams({}, { replace: true }) }

  return (
    <div className="page">
      <PageHead title="Caja" sub="Cobra en el momento, antes o después de la atención. Aquí ves lo cobrado y los saldos pendientes."
        actions={<button className="btn btn--primary" data-tour="nuevo-cobro" onClick={() => setCharging({})}><Plus size={16} />Nuevo cobro</button>} />

      <div className="tabs tabs--sticky" role="tablist" data-tour="caja-tabs">
        <button className="tab" role="tab" aria-selected={tab === 'today'} onClick={() => switchTab('today')}>Cobrado hoy</button>
        {(balances?.length ?? 0) > 0 && <button className="tab" role="tab" aria-selected={tab === 'balances'} onClick={() => switchTab('balances')}>Saldos pendientes ({balances!.length})</button>}
        <button className="tab" role="tab" aria-selected={tab === 'history'} onClick={() => switchTab('history')}>Historial</button>
      </div>

      {tab !== 'balances' && <div className="cal-toolbar">
        <label className="caja-search">
          <Search size={16} />
          <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar en caja" placeholder="Buscar paciente, recibo, factura o referencia" />
        </label>
        {tab === 'history' && (<>
          <label className="field" style={{ gridTemplateColumns: 'auto 1fr', alignItems: 'center' }}><span>Desde</span><input className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="field" style={{ gridTemplateColumns: 'auto 1fr', alignItems: 'center' }}><span>Hasta</span><input className="input" type="date" value={to} min={from} max={todayKey} onChange={(e) => setTo(e.target.value)} /></label>
        </>)}
        {charged.length > 0 && <button className="btn btn--ghost no-print" style={{ marginLeft: 'auto' }} onClick={exportCsv}><Download size={16} />Exportar a Excel</button>}
      </div>}

      {tab === 'balances' && (
        <section className="panel">
          <div className="panel__head"><div><h2>Saldos pendientes</h2><p>{balances?.length ?? 0} cobros con saldo, {money(owed, cur)} en total. Ábrelos para registrar un abono.</p></div></div>
          {!balances ? <Loading /> : <div className="rows">{balances.map((p) => {
            const pt = patient(p.patientId)
            return (
              <Link key={p.id} to={`/app/recibos/${p.id}`} className="row caja-row">
                <span className="num" style={{ fontSize: 13.5 }}>{date(p.paidAt, { day: 'numeric', month: 'short' })}</span>
                <div className="row__who"><strong>{pt ? fullName(pt) : '—'}</strong><span>{p.receiptNo} · {p.items.map((i) => i.name).join(', ')}</span></div>
                <span className="badge badge--amber num">Debe {money(p.balance ?? 0, cur)}</span>
              </Link>
            )
          })}</div>}
        </section>
      )}

      {tab !== 'balances' && (!payments ? <Loading /> : (<>
        <div className={`stats stats--${Math.min(5, shownMethods.length + 1)}`}>
          <div className="stat"><b className="num">{money(total, cur)}</b><span>{tab === 'today' ? 'Cobrado hoy' : 'Cobrado en el periodo'}</span><small>{charged.filter((p) => !p.voided).length} {charged.length === 1 ? 'recibo' : 'recibos'}{received.some((r) => r.installment) ? ' y abonos' : ''}</small></div>
          {shownMethods.map((m) => <div key={m} className="stat"><b className="num">{money(byMethod(m), cur)}</b><span>{METHOD_LABEL[m]}</span></div>)}
        </div>
        {owed > 0 && <button className="alert-strip alert-strip--amber no-print" style={{ border: 0, cursor: 'pointer', textAlign: 'left' }} onClick={() => switchTab('balances')}><Wallet size={16} />Saldos pendientes: {money(owed, cur)} en {balances!.length} {balances!.length === 1 ? 'cobro' : 'cobros'}. Ver</button>}
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
                  <td>{METHOD_LABEL[p.method]}{p.bank ? `, ${p.bank}` : ''}{p.reference ? `, ${p.reference}` : ''}</td>
                  <td>{staffById(p.receivedBy)?.name ?? '—'}</td>
                  <td className="num" style={{ textAlign: 'right', fontWeight: 600, textDecoration: p.voided ? 'line-through' : undefined }}>{money(p.total, cur)}
                    {!p.voided && (p.balance ?? 0) > 0 && <small style={{ display: 'block', color: 'var(--amber-ink)', fontWeight: 600 }}>Saldo {money(p.balance ?? 0, cur)}</small>}</td>
                </tr>
              )
            })}</tbody>
          </table>
          {!shown.length && <div className="empty">{charged.length ? 'Ningún cobro coincide con la búsqueda.' : tab === 'today' ? 'Todavía no hay cobros hoy. Toca «Nuevo cobro» para cobrar.' : 'No hay cobros en este periodo.'}</div>}
        </section>
        {tab === 'today' && charged.length > 0 && <button className="btn btn--ghost no-print" style={{ justifySelf: 'start' }} onClick={() => window.print()}><Printer size={16} />Imprimir cierre de caja</button>}
      </>))}

      {charging && <ChargeModal appt={charging.appt} onClose={closeCharge} onPaid={(p) => { closeCharge(); nav(`/app/recibos/${p.id}`) }} />}
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

interface Line { serviceId?: string; name: string; price: number; qty: number; save?: boolean }

/** Banco y referencia de una transferencia o un depósito (la referencia es opcional). */
function BankFields({ bank, reference, onBank, onReference }: { bank: string; reference: string; onBank: (v: string) => void; onReference: (v: string) => void }) {
  return (
    <div className="form-grid">
      <label className="field"><span>Banco</span>
        <input className="input" list="hn-banks" value={bank} onChange={(e) => onBank(e.target.value)} placeholder="Elige o escribe el banco" />
        <datalist id="hn-banks">{BANKS.map((b) => <option key={b} value={b} />)}</datalist></label>
      <label className="field"><span>Número de referencia (opcional)</span><input className="input num" value={reference} onChange={(e) => onReference(e.target.value)} /></label>
    </div>
  )
}

/**
 * Cobro (AD9): paciente → uno o varios servicios del catálogo o "+ Servicio nuevo" (con "Guardar en la lista de
 * servicios", marcado) → descuento con motivo → forma de pago (sólo las que acepta la clínica) → cuánto paga ahora
 * (si es menos, queda saldo) → recibo. Se puede vincular a la visita del día, sin que sea obligatorio.
 */
function ChargeModal({ appt, onClose, onPaid }: { appt?: Appointment; onClose: () => void; onPaid: (p: Payment) => void }) {
  const { services, patients, staffById, settings, pay, appointments } = useStore()
  const cur = settings.currency
  const methods = settings.paymentMethods ?? ['cash', 'transfer']
  const active = services.filter((s) => s.active)
  const defaultSvc = appt ? services.find((s) => s.id === staffById(appt.doctorId)?.serviceId && s.active) : undefined
  const [patientId, setPatientId] = useState(appt?.patientId ?? '')
  const [visitId, setVisitId] = useState(appt?.id ?? '')
  const [lines, setLines] = useState<Line[]>(defaultSvc ? [{ serviceId: defaultSvc.id, name: defaultSvc.name, price: defaultSvc.price, qty: 1 }] : [])
  const [svcQ, setSvcQ] = useState('')
  const [svcOpen, setSvcOpen] = useState(false)
  const [newSvc, setNewSvc] = useState<{ name: string; price: string; save: boolean } | null>(null)
  const [discount, setDiscount] = useState('')
  const [discMode, setDiscMode] = useState<'amount' | 'percent'>('amount')
  const [discReason, setDiscReason] = useState('')
  const [method, setMethod] = useState<PaymentMethod>(methods[0] ?? 'cash')
  const [reference, setReference] = useState('')
  const [bank, setBank] = useState('')
  const [received, setReceived] = useState('')
  const [partial, setPartial] = useState(false)
  const [paidNow, setPaidNow] = useState('')
  const [invoiceNo, setInvoiceNo] = useState('')
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [todayKey] = useState(() => localISODate(new Date()))
  const newPrice = useRef<HTMLInputElement>(null)

  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0)
  const disc = discountAmount(subtotal, discount, discMode)
  const total = Math.max(0, Math.round((subtotal - disc) * 100) / 100)
  const now = partial ? Math.min(total, Math.max(0, Number(paidNow) || 0)) : total
  const balance = Math.round((total - now) * 100) / 100
  const got = Number(received) || 0
  const short = method === 'cash' && received !== '' && got < now
  const change = method === 'cash' && got > now ? got - now : 0
  const valid = patientId && lines.length && disc <= subtotal && (method !== 'card' || reference.trim()) && (disc === 0 || discReason.trim()) && !short && (!partial || now > 0) && !newSvc
  const matches = useMemo(() => {
    const s = normalize(q.trim())
    return s.length < 2 ? [] : patients.filter((p) => !p.pending && (normalize(fullName(p)).includes(s) || p.record.toLowerCase().includes(s))).slice(0, 6)
  }, [q, patients])
  const chosen = patients.find((p) => p.id === patientId)
  const todayVisits = appointments.filter((a) => a.patientId === patientId && a.start.startsWith(todayKey) && !['cancelled', 'no_show'].includes(a.status))
  const svcMatches = active.filter((s) => normalize(s.name).includes(normalize(svcQ))).slice(0, 8)

  const addLine = (l: Line) => { setLines([...lines, l]); setSvcQ(''); setSvcOpen(false) }
  const startNew = (name: string) => { setNewSvc({ name, price: '', save: true }); setSvcQ(''); setSvcOpen(false); setTimeout(() => newPrice.current?.focus(), 30) }

  return (
    <Modal title="Nuevo cobro" wide onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!valid || busy} onClick={async () => {
        setBusy(true)
        const r = await pay({ appointmentId: visitId || undefined, patientId, items: lines, discount: disc, discountReason: disc > 0 ? discReason.trim() : undefined, method,
          reference: reference.trim() || undefined, bank: (method === 'transfer' || method === 'deposit') && bank.trim() ? bank.trim() : undefined,
          invoiceNo: invoiceNo.trim() || undefined, amountPaid: partial ? now : undefined })
        setBusy(false)
        if (r) onPaid(r)
      }}>{partial && balance > 0 ? `Cobrar ${money(now, cur)} (queda ${money(balance, cur)})` : `Cobrar ${money(total, cur)}`}</button>
    </>}>
      {chosen ? (
        <div className="chart-meta" style={{ marginTop: 0, alignItems: 'center' }}>
          <span>Paciente <b>{fullName(chosen)}</b> <span className="muted">{chosen.record}</span></span>
          {!appt && <button className="btn btn--ghost btn--sm" onClick={() => { setPatientId(''); setVisitId('') }}>Cambiar</button>}
        </div>
      ) : (
        <div className="field suggest">
          <span>Paciente</span>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre o número de expediente" autoFocus />
          {matches.length > 0 && <div className="suggest__list">{matches.map((p) => (
            <button key={p.id} onClick={() => { setPatientId(p.id); setQ(''); const v = appointments.find((a) => a.patientId === p.id && a.start.startsWith(todayKey) && !['cancelled', 'no_show'].includes(a.status)); setVisitId(v?.id ?? '') }}>
              <code>{p.record.slice(4)}</code>{fullName(p)}</button>
          ))}</div>}
        </div>
      )}
      {chosen && todayVisits.length > 0 && (
        <label className="field"><span>Visita de hoy (opcional)</span>
          <select className="select" value={visitId} onChange={(e) => setVisitId(e.target.value)}>
            <option value="">Sin vincular a una visita</option>
            {todayVisits.map((a) => <option key={a.id} value={a.id}>{time(a.start)} con {staffById(a.doctorId)?.name}{a.reason ? `, ${a.reason}` : ''}</option>)}
          </select></label>
      )}

      <div className="lines">
        {lines.map((l, i) => (
          <div key={i} className="line">
            <span>{l.name}{!l.serviceId && <small className="muted" style={{ display: 'block' }}>{l.save ? 'Servicio nuevo: se guardará en la lista' : 'Sólo para este cobro'}</small>}</span>
            <input className="input num" type="number" min={1} max={99} value={l.qty} aria-label={`Cantidad de ${l.name}`}
              onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, qty: Math.max(1, Number(e.target.value) || 1) } : x))} />
            <input className="input num" type="number" min={0} step="0.01" value={l.price} aria-label={`Precio de ${l.name}`}
              onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, price: Math.max(0, Number(e.target.value) || 0) } : x))} />
            <b className="num">{money(l.price * l.qty, cur)}</b>
            <button className="icon-btn" aria-label={`Quitar ${l.name}`} onClick={() => setLines(lines.filter((_, j) => j !== i))}><X size={16} /></button>
          </div>
        ))}
        {newSvc ? (
          <div className="new-svc">
            <label className="field"><span>Servicio nuevo</span><input className="input" value={newSvc.name} onChange={(e) => setNewSvc({ ...newSvc, name: e.target.value })} placeholder="Ej. Sutura" autoFocus={!newSvc.name} /></label>
            <label className="field"><span>Precio ({cur})</span><input ref={newPrice} className="input num" type="number" min={0} step="0.01" value={newSvc.price} onChange={(e) => setNewSvc({ ...newSvc, price: e.target.value })} placeholder="0.00" /></label>
            <label className="check-inline new-svc__save"><input type="checkbox" checked={newSvc.save} onChange={(e) => setNewSvc({ ...newSvc, save: e.target.checked })} />Guardar en la lista de servicios</label>
            <div className="new-svc__actions">
              <button className="btn btn--soft btn--sm" disabled={newSvc.name.trim().length < 2 || newSvc.price === ''} onClick={() => { addLine({ name: newSvc.name.trim(), price: Number(newSvc.price), qty: 1, save: newSvc.save }); setNewSvc(null) }}><Plus size={14} />Agregar</button>
              <button className="btn btn--ghost btn--sm" onClick={() => setNewSvc(null)}>Cancelar</button>
            </div>
          </div>
        ) : (
          <div className="suggest">
            <input className="input" value={svcQ} aria-label="Agregar servicio" placeholder="Agregar servicio: busca en la lista…"
              onFocus={() => setSvcOpen(true)} onBlur={() => setTimeout(() => setSvcOpen(false), 150)}
              onChange={(e) => { setSvcQ(e.target.value); setSvcOpen(true) }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                if (svcMatches.length === 1 || (svcMatches.length && !svcQ.trim())) { const s = svcMatches[0]; addLine({ serviceId: s.id, name: s.name, price: s.price, qty: 1 }) }
                else if (svcQ.trim() && !svcMatches.length) startNew(svcQ.trim())
              }} />
            {svcOpen && <div className="suggest__list">
              {svcMatches.map((s) => (
                <button key={s.id} onMouseDown={(e) => e.preventDefault()} onClick={() => addLine({ serviceId: s.id, name: s.name, price: s.price, qty: 1 })}>
                  <span style={{ flex: 1 }}>{s.name}</span><span className="num" style={{ color: 'var(--muted)' }}>{money(s.price, cur)}</span>
                </button>
              ))}
              <button className="suggest__new" onMouseDown={(e) => e.preventDefault()} onClick={() => startNew(svcQ.trim())}>
                <Plus size={15} />Servicio nuevo{svcQ.trim() ? `: «${svcQ.trim()}»` : ''}
              </button>
            </div>}
          </div>
        )}
        {!newSvc && <button type="button" className="btn btn--ghost btn--sm" style={{ justifySelf: 'start' }} onClick={() => startNew('')}><Plus size={14} />Servicio nuevo</button>}
      </div>

      <div className="form-grid">
        <div className="field"><span>Descuento (opcional)</span>
          <div className="caja-discount">
            <input className="input num" type="number" min={0} step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder={discMode === 'percent' ? '0' : '0.00'} aria-label="Descuento" />
            <div className="segmented" role="radiogroup" aria-label="Tipo de descuento">
              <button role="radio" aria-checked={discMode === 'amount'} onClick={() => setDiscMode('amount')}>{cur}</button>
              <button role="radio" aria-checked={discMode === 'percent'} onClick={() => setDiscMode('percent')}>%</button>
            </div>
          </div>
          {discMode === 'percent' && disc > 0 && <small className="num" style={{ color: 'var(--muted)' }}>= {money(disc, cur)}</small>}
        </div>
        <div className="field"><span>Total</span><div className="total-box num">{money(total, cur)}</div></div>
      </div>
      {disc > subtotal && <p style={{ color: 'var(--red-ink)', fontSize: 13.5 }}>El descuento no puede ser mayor que el subtotal.</p>}
      {disc > 0 && disc <= subtotal && (
        <label className="field"><span>Motivo del descuento</span><input className="input" value={discReason} onChange={(e) => setDiscReason(e.target.value)} maxLength={120} placeholder="Ej. Tercera edad, cortesía del médico" /></label>
      )}

      <div className="field">
        <span>Forma de pago</span>
        <div className="segmented" role="radiogroup" aria-label="Forma de pago">
          {methods.map((m) => <button key={m} role="radio" aria-checked={method === m} onClick={() => setMethod(m)}>{METHOD_LABEL[m]}</button>)}
        </div>
      </div>
      <label className="check-line"><input type="checkbox" checked={partial} onChange={(e) => { setPartial(e.target.checked); setPaidNow('') }} />
        <span><b>Paga una parte ahora (abono)</b><small>El resto queda como saldo pendiente en el paciente.</small></span></label>
      {partial && (
        <div className="form-grid">
          <label className="field"><span>Paga ahora</span><input className="input num" type="number" min={0} max={total} step="0.01" value={paidNow} onChange={(e) => setPaidNow(e.target.value)} placeholder="0.00" autoFocus /></label>
          <div className="field"><span>Saldo pendiente</span><div className={`total-box num ${balance > 0 ? 'total-box--warn' : ''}`}>{money(balance, cur)}</div></div>
        </div>
      )}
      {method === 'cash' && (<>
        <div className="form-grid">
          <label className="field"><span>Recibido</span><input className="input num" type="number" min={0} step="0.01" value={received} onChange={(e) => setReceived(e.target.value)} placeholder={now.toFixed(2)} /></label>
          <div className="field"><span>{short ? 'Falta' : 'Cambio'}</span><div className={`total-box num ${short ? 'total-box--bad' : ''}`}>{money(short ? now - got : change, cur)}</div></div>
        </div>
        {cashSuggestions(now).length > 0 && <div className="quick-cash" aria-label="Montos rápidos">
          {cashSuggestions(now).map((v, i) => <button key={v} className="chip" onClick={() => setReceived(String(v))}>{i === 0 ? 'Exacto' : money(v, cur)}</button>)}
        </div>}
      </>)}
      {(method === 'transfer' || method === 'deposit') && <BankFields bank={bank} reference={reference} onBank={setBank} onReference={setReference} />}
      {(method === 'card' || method === 'insurance' || method === 'other') && (
        <label className="field"><span>{method === 'card' ? 'Número de autorización del POS' : method === 'insurance' ? 'Número de póliza o autorización (opcional)' : 'Cómo pagó (opcional)'}</span>
          <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} /></label>
      )}
      <label className="field"><span>Factura del talonario (opcional)</span>
        <input className="input num" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} maxLength={40} placeholder="000-001-01-00000000" />
        <small style={{ color: 'var(--muted)' }}>Si todavía no la llenas, puedes anotarla después en el recibo.</small>
      </label>
    </Modal>
  )
}

/** Abono a un cobro con saldo pendiente. */
function InstallmentModal({ p, onClose, onDone }: { p: Payment; onClose: () => void; onDone: () => void }) {
  const { settings, addInstallment } = useStore()
  const methods = settings.paymentMethods ?? ['cash', 'transfer']
  const [amount, setAmount] = useState(String(p.balance ?? ''))
  const [method, setMethod] = useState<PaymentMethod>(methods[0] ?? 'cash')
  const [reference, setReference] = useState('')
  const [bank, setBank] = useState('')
  const [busy, setBusy] = useState(false)
  const n = Number(amount) || 0
  const valid = n > 0 && n <= (p.balance ?? 0) && (method !== 'card' || reference.trim())
  return (
    <Modal title={`Abono al recibo ${p.receiptNo}`} onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!valid || busy} onClick={async () => {
        setBusy(true)
        const r = await addInstallment(p.id, { amount: n, method, reference: reference.trim() || undefined, bank: bank.trim() || undefined })
        setBusy(false)
        if (r) onDone()
      }}>Registrar abono</button>
    </>}>
      <p>Saldo pendiente: <b className="num">{money(p.balance ?? 0, settings.currency)}</b></p>
      <label className="field"><span>Abono</span><input className="input num" type="number" min={0} max={p.balance} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></label>
      <div className="field"><span>Forma de pago</span>
        <div className="segmented" role="radiogroup" aria-label="Forma de pago">{methods.map((m) => <button key={m} role="radio" aria-checked={method === m} onClick={() => setMethod(m)}>{METHOD_LABEL[m]}</button>)}</div></div>
      {(method === 'transfer' || method === 'deposit') && <BankFields bank={bank} reference={reference} onBank={setBank} onReference={setReference} />}
      {method === 'card' && <label className="field"><span>Número de autorización del POS</span><input className="input" value={reference} onChange={(e) => setReference(e.target.value)} /></label>}
    </Modal>
  )
}

export function ReceiptSheet() {
  const { id } = useParams()
  const { fetchPayment, staffById, settings, can, voidPayment, setInvoiceNo, notify } = useStore()
  const [abono, setAbono] = useState(false)
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
          {!p.voided && (p.balance ?? 0) > 0 && <button className="btn btn--soft" onClick={() => setAbono(true)}><Wallet size={16} />Registrar abono</button>}
          {!p.voided && <button className="btn btn--ghost" onClick={() => { setInvoice(p.invoiceNo ?? ''); setEditingInvoice(true) }}><FileText size={16} />{p.invoiceNo ? 'Cambiar factura' : 'Anotar factura'}</button>}
          {!p.voided && patient.phone && <a className="btn btn--ghost" target="_blank" rel="noreferrer" href={whatsappUrl(patient.phone, receiptText(p, settings.name, settings.currency))}><MessageCircle size={16} />Enviar por WhatsApp</a>}
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
          <div><span>Forma de pago</span>{METHOD_LABEL[p.method]}{p.bank ? `, ${p.bank}` : ''}{p.reference ? `, ${p.reference}` : ''}</div>
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
          {((p.amountPaid ?? p.total) < p.total || (p.installments?.length ?? 0) > 0) && <>
            <span>Pagado {date(p.paidAt)}</span><span>{money(p.amountPaid ?? p.total, settings.currency)}</span>
            {p.installments?.map((i) => <Fragment key={i.id}><span>Abono {date(i.paidAt)}, {METHOD_LABEL[i.method].toLowerCase()}</span><span>{money(i.amount, settings.currency)}</span></Fragment>)}
            <b>Saldo pendiente</b><b>{money(p.balance ?? 0, settings.currency)}</b>
          </>}
        </div>
        {p.voided && <p className="receipt__void">Anulado{p.voidedAt ? ` el ${date(p.voidedAt)}, ${time(p.voidedAt)}` : ''}{p.voidedBy ? ` por ${staffById(p.voidedBy)?.name ?? '—'}` : ''}{p.voidReason ? `. Motivo: ${p.voidReason}` : ''}</p>}
        <footer className="rx-sheet__foot"><span>Atendió: {staffById(p.receivedBy)?.name}</span><span>Gracias por su preferencia</span></footer>
        <p className="receipt__note">Comprobante interno de pago. No sustituye la factura.</p>
      </article>
      {abono && <InstallmentModal p={p} onClose={() => setAbono(false)} onDone={() => { setAbono(false); load() }} />}
      {voiding && (
        <Modal title={`Anular ${p.receiptNo}`} onClose={() => setVoiding(false)} footer={<>
          <button className="btn btn--ghost" onClick={() => setVoiding(false)}>Cancelar</button>
          <button className="btn btn--danger" disabled={reason.trim().length < 5} onClick={async () => { if (await voidPayment(p.id, reason.trim())) { setVoiding(false); load() } }}>Anular recibo</button>
        </>}>
          <p>El recibo queda en el historial marcado como anulado. Si hay que cobrar de nuevo, se hace un cobro nuevo.</p>
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

/** Texto del recibo para enviarlo por WhatsApp. */
function receiptText(p: Payment, clinic: string, cur: string) {
  const lines = p.items.map((i) => `• ${i.qty > 1 ? `${i.qty} × ` : ''}${i.name}: ${money(i.price * i.qty, cur)}`)
  return [`${clinic}: recibo ${p.receiptNo} del ${date(p.paidAt)}.`, ...lines, p.discount > 0 ? `Descuento: ${money(p.discount, cur)}` : '', `Total: ${money(p.total, cur)}`,
    (p.balance ?? 0) > 0 ? `Pagado: ${money(p.total - (p.balance ?? 0), cur)}. Saldo pendiente: ${money(p.balance ?? 0, cur)}.` : 'Pagado. Gracias por su preferencia.'].filter(Boolean).join('\n')
}
