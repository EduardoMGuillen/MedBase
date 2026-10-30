import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowRight, ArrowUp, Plus, Thermometer, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { Modal } from '../components/ui'
import { VitalsFields } from '../components/VitalsFields'
import { inputDateTime, shortStaff } from '../lib/format'
import { yearsOld } from '../lib/inpatient'
import { parseDecimal, VITALS, vitalLevel, type VitalKey } from '../lib/vitals'
import { EMPTY_VITALS, FIELDS, fieldIssue, vitalNumber, type VitalsForm } from '../lib/vitalsForm'
import { activeVitals, antipyreticDoses, bandOf, expectedTakes, frequencyFromOrders, missedTakes, tempClass, VITALS_FREQUENCIES, vitalsAnchor, vitalsEvery, type TempBand } from '../lib/vitalsSheet'
import { useNow } from '../lib/hooks'
import type { InpatientFile, Patient, Vitals } from '../lib/types'

const HOUR = 3_600_000
const DAY = 24 * HOUR
type Range = '24h' | '3d' | '7d' | 'all'
const RANGES: [Range, string][] = [['24h', 'Últimas 24 h'], ['3d', '3 días'], ['7d', '7 días'], ['all', 'Toda la estancia']]
const dayStart = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }
const hm = (t: number | string) => new Date(t).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit', hour12: false })
const dmy = (t: number | string) => new Date(t).toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit' })
const fmt = (k: VitalKey, x: number) => (k === 'temperature' ? x.toFixed(1) : VITALS[k].decimals ? String(Math.round(x * 10) / 10) : String(x))

/** Desde cuándo y hasta cuándo se dibuja: días completos (o las últimas 24 horas). */
function rangeOf(range: Range, stayStart: number, end: number, every: number): [number, number] {
  if (range === '24h') {
    const step = every * HOUR
    return [Math.max(dayStart(stayStart), Math.floor((end - DAY) / step) * step), Math.ceil(end / step) * step + step]
  }
  const days = range === '3d' ? 3 : range === '7d' ? 7 : Infinity
  return [dayStart(Math.max(stayStart, end - (days - 1) * DAY)), dayStart(end) + DAY]
}

/**
 * Hoja de signos vitales (S1), en hospitalización y observación: arriba la curva térmica y abajo los demás signos
 * (tarjetas y la tabla clásica). Enfermería y el médico registran tomas; el médico cambia la frecuencia de toma.
 */
export function VitalsSheet({ file, p, reload, autoRecord, onFocused }: { file: InpatientFile; p: Patient; reload: () => void; autoRecord?: boolean; onFocused?: () => void }) {
  const { can, settings, staffById, notify } = useStore()
  const now = useNow()
  const [range, setRange] = useState<Range>(() => (activeVitals(file.vitals).length > 9 ? '7d' : 'all'))
  const [pulse, setPulse] = useState(false)
  const [recording, setRecording] = useState(false)
  const [voiding, setVoiding] = useState<Vitals | null>(null)
  const h = file.hospitalization
  const open = h.status === 'active'
  const record = open && can('vitals.record')
  // EN2: «Registrar signos» desde una alerta abre el registro
  useEffect(() => {
    if (!autoRecord) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (record) setRecording(true)
    onFocused?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRecord])
  const band = bandOf(settings)
  const every = vitalsEvery(file)
  const ordered = frequencyFromOrders(file)
  const ageYears = p.birthDate ? yearsOld(p.birthDate) : undefined
  const stayStart = new Date(h.observationAt ?? h.admittedAt).getTime()
  const end = h.dischargedAt ? new Date(h.dischargedAt).getTime() : now.getTime()
  const [t0, t1] = rangeOf(range, stayStart, end, every)
  const all = [...file.vitals].sort((a, b) => a.takenAt.localeCompare(b.takenAt))
  const inRange = all.filter((v) => { const t = new Date(v.takenAt).getTime(); return t >= t0 && t <= t1 })
  const missed = open ? missedTakes(file, now).filter((s) => s.getTime() >= t0) : []
  const setEvery = async (n: number) => {
    try { await api(`/inpatient/${h.id}/vitals-frequency`, { method: 'PATCH', body: { everyHours: n } }); notify(`Signos vitales cada ${n} h`); reload() } catch (e) { notify((e as Error).message, 'error') }
  }
  const source = h.vitalsEveryHours ? 'indicado en la hoja' : ordered ? 'según la orden médica' : 'por defecto'

  return (
    <div className="hc vs">
      <section className="panel">
        <div className="panel__head vs__head">
          <div><h2>Signos vitales</h2><p>Curva térmica arriba; los demás signos abajo. Cada toma queda con su autor y no se edita: se anula con motivo.</p></div>
          {record && <button className="btn btn--primary" onClick={() => setRecording(true)}><Plus size={16} />Registrar signos vitales</button>}
        </div>
        <div className="panel__body vs__bar">
          <label className="vs__every"><span>Toma cada</span>
            {can('inpatient.orders') && open
              ? <select className="select" value={every} onChange={(e) => setEvery(Number(e.target.value))} aria-label="Frecuencia de toma">{VITALS_FREQUENCIES.map((n) => <option key={n} value={n}>{n} h</option>)}</select>
              : <b>{every} h</b>}
            <small className="muted">{source}</small></label>
          <div className="segmented" role="radiogroup" aria-label="Rango de la curva">
            {RANGES.map(([k, label]) => <button key={k} role="radio" aria-checked={range === k} onClick={() => setRange(k)}>{label}</button>)}
          </div>
          <label className="check-inline"><input type="checkbox" checked={pulse} onChange={(e) => setPulse(e.target.checked)} />Mostrar pulso (FC)</label>
        </div>
      </section>

      {!all.length ? (
        <section className="panel"><div className="empty vs__empty"><Thermometer size={26} /><p>Aún no hay signos vitales registrados.</p>
          {record && <button className="btn btn--primary" onClick={() => setRecording(true)}><Plus size={16} />Registrar signos vitales</button>}</div></section>
      ) : (<>
        <section className="panel">
          <div className="panel__head"><div><h2>Curva térmica</h2><p>Banda normal {band.low.toFixed(1)} a {band.high.toFixed(1)} °C. Toca un punto para ver el detalle.</p></div></div>
          <div className="panel__body">
            <ThermalCurve vitals={inRange} t0={t0} t1={t1} every={every} anchor={vitalsAnchor(file)} stayStart={stayStart} band={band} missed={missed} pulse={pulse}
              antipyretics={antipyreticDoses(file).filter((x) => { const t = new Date(x.at).getTime(); return t >= t0 && t <= t1 })} who={(id) => staffById(id)?.name ?? ''} />
          </div>
        </section>
        <VitalsCards vitals={inRange.length ? inRange : all} ageYears={ageYears} />
        <section className="panel">
          <div className="panel__head"><div><h2>Hoja de signos vitales</h2><p>Las tomas más recientes a la derecha. Valores fuera de rango en color; las anuladas, tachadas.</p></div></div>
          <VitalsTable vitals={inRange} ageYears={ageYears} band={band} who={(id) => shortStaff(staffById(id)?.name)} onVoid={record ? setVoiding : undefined} />
        </section>
      </>)}
      {recording && <RecordVitalsModal file={file} p={p} onClose={() => setRecording(false)} onSaved={() => { setRecording(false); reload() }} />}
      {voiding && <VoidVitalsModal v={voiding} onClose={() => setVoiding(null)} onSaved={() => { setVoiding(null); reload() }} />}
    </div>
  )
}

/**
 * Curva térmica en SVG (nítida al imprimir). Eje de 34 a 42 °C con líneas cada 0.5, banda normal sombreada, días de
 * estancia arriba y la cuadrícula según la frecuencia de toma. Fiebre: triángulo rojo; hipotermia: cuadrado azul; con
 * el valor escrito. Con `print`, en blanco y negro: la banda en gris y la fiebre y la hipotermia con su símbolo y letra.
 */
export function ThermalCurve({ vitals, t0, t1, every, anchor, stayStart, band, missed = [], antipyretics = [], pulse = false, print = false, who }: {
  vitals: Vitals[]; t0: number; t1: number; every: number; anchor?: number; stayStart: number; band: TempBand; missed?: Date[]
  antipyretics?: ReturnType<typeof antipyreticDoses>; pulse?: boolean; print?: boolean; who?: (id: string) => string
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(900)
  const [sel, setSel] = useState<{ v: Vitals; x: number; y: number } | null>(null)
  useLayoutEffect(() => {
    if (print || !wrap.current) return
    const el = wrap.current
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [print])
  // En pantalla se ve el final (lo más reciente); en celular la curva se desplaza a lo ancho
  useEffect(() => { if (!print && wrap.current) wrap.current.scrollLeft = wrap.current.scrollWidth }, [print, t0, t1])

  const hours = (t1 - t0) / HOUR
  const minPx = hours <= 30 ? 26 : hours <= 80 ? 11 : hours <= 180 ? 5.5 : 4
  const PL = 46
  const PR = pulse ? 46 : 16
  const PT = 34
  const PB = 40
  const plotH = print ? 210 : 260
  const W = print ? 700 : Math.max(width, Math.round(hours * minPx) + PL + PR)
  const pxh = (W - PL - PR) / hours
  const H = PT + plotH + PB
  const x = (t: number) => PL + ((t - t0) / HOUR) * pxh
  const y = (temp: number) => PT + ((42 - Math.min(42, Math.max(34, temp))) / 8) * plotH
  const y2 = (hr: number) => PT + ((180 - Math.min(180, Math.max(40, hr))) / 140) * plotH
  const temps = activeVitals(vitals).filter((v) => v.temperature != null)
  const pulses = activeVitals(vitals).filter((v) => v.heartRate != null)
  const days: number[] = []
  for (let d = dayStart(t0); d < t1; d += DAY) days.push(d)
  const slots = expectedTakes(new Date(t0), new Date(t1), every, anchor).map((d) => d.getTime())
  const dayN = (d: number) => Math.round((d - dayStart(stayStart)) / DAY) + 1
  const c = print
    ? { band: '#e6e6e6', grid: '#d4d4d4', minor: '#ececec', day: '#9a9a9a', line: '#000', fever: '#000', hypo: '#000', text: '#000', pulse: '#555', amber: '#000' }
    : { band: 'var(--vs-band)', grid: 'var(--line)', minor: 'var(--line-soft)', day: 'var(--faint)', line: 'var(--ink)', fever: 'var(--red-ink)', hypo: '#1d5fd1', text: 'var(--muted)', pulse: '#0f8a6e', amber: 'var(--amber-ink)' }
  const path = (pts: [number, number][]) => pts.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)},${b.toFixed(1)}`).join(' ')

  return (
    <div className={`vs-curve ${print ? 'vs-curve--print' : ''}`}>
      <div className="vs-curve__scroll" ref={wrap} onClick={(e) => { if (e.target === e.currentTarget) setSel(null) }}>
        <div style={{ position: 'relative', width: W }}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Curva térmica: ${temps.length} tomas de temperatura`} onClick={(e) => { if ((e.target as Element).tagName === 'svg') setSel(null) }}>
            {/* Banda normal */}
            <rect x={PL} y={y(band.high)} width={W - PL - PR} height={y(band.low) - y(band.high)} fill={c.band} />
            {/* Líneas cada 0.5 °C, con número en cada grado */}
            {Array.from({ length: 17 }, (_, i) => 34 + i * 0.5).map((t) => (
              <g key={t}>
                <line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} stroke={Number.isInteger(t) ? c.grid : c.minor} strokeWidth={Number.isInteger(t) ? 1 : 0.7} />
                {Number.isInteger(t) && <text x={PL - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill={c.text}>{t}°</text>}
              </g>
            ))}
            {[band.low, band.high].map((t) => <line key={t} x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} stroke={c.day} strokeWidth={1} strokeDasharray="4 3" />)}
            {/* Cuadrícula de la frecuencia de toma y horas */}
            {slots.map((t) => (
              <g key={t}>
                <line x1={x(t)} x2={x(t)} y1={PT} y2={PT + plotH} stroke={c.minor} strokeWidth={0.8} />
                {pxh * every >= 24 && <text x={x(t)} y={PT + plotH + 14} textAnchor="middle" fontSize={10} fill={c.text}>{hm(t).slice(0, 2)}</text>}
              </g>
            ))}
            {/* Días de estancia */}
            {days.map((d) => {
              const a = Math.max(x(d), PL)
              const b = Math.min(x(d + DAY), W - PR)
              const n = dayN(d)
              return (
                <g key={d}>
                  <line x1={x(d)} x2={x(d)} y1={PT - 6} y2={PT + plotH} stroke={c.day} strokeWidth={1.2} />
                  {b - a > 40 && <text x={(a + b) / 2} y={PT - 12} textAnchor="middle" fontSize={11.5} fontWeight={650} fill={c.text}>{b - a > 110 ? `Día ${n} · ${dmy(d)}` : b - a > 60 ? `Día ${n}` : `D${n}`}</text>}
                </g>
              )
            })}
            <line x1={PL} x2={W - PR} y1={PT + plotH} y2={PT + plotH} stroke={c.day} />
            {/* Pulso en un eje secundario */}
            {pulse && <>
              {[40, 60, 80, 100, 120, 140, 160, 180].map((hr) => <text key={hr} x={W - PR + 6} y={y2(hr) + 4} fontSize={10} fill={c.pulse}>{hr}</text>)}
              <text x={W - 4} y={PT - 12} textAnchor="end" fontSize={10.5} fill={c.pulse}>lpm</text>
              <path d={path(pulses.map((v) => [x(new Date(v.takenAt).getTime()), y2(v.heartRate!)]))} fill="none" stroke={c.pulse} strokeWidth={1.5} strokeDasharray="5 3" />
              {pulses.map((v) => { const px = x(new Date(v.takenAt).getTime()); const py = y2(v.heartRate!); return <path key={`p${v.id}`} d={`M${px - 3},${py - 3}L${px + 3},${py + 3}M${px - 3},${py + 3}L${px + 3},${py - 3}`} stroke={c.pulse} strokeWidth={1.5} /> })}
            </>}
            {/* Tomas esperadas sin registrar */}
            {missed.filter((s) => s.getTime() >= t0 && s.getTime() <= t1).map((s) => (
              <g key={`m${s.getTime()}`} className="vs-missed"><title>Toma esperada sin registrar: {hm(s.getTime())} del {dmy(s.getTime())}</title>
                <line x1={x(s.getTime())} x2={x(s.getTime())} y1={PT} y2={PT + plotH} stroke={c.amber} strokeWidth={1} strokeDasharray="2 3" />
                <text x={x(s.getTime())} y={PT + plotH + 28} textAnchor="middle" fontSize={10} fontWeight={700} fill={c.amber}>{print ? 'P' : 'pend.'}</text>
              </g>
            ))}
            {/* Antipiréticos aplicados */}
            {antipyretics.map((a) => (
              <g key={`a${a.dose.id}`}><title>{a.med.drug} {a.med.dose} a las {hm(a.at)} del {dmy(a.at)} (antipirético)</title>
                <rect x={x(new Date(a.at).getTime()) - 6} y={PT + plotH - 16} width={12} height={12} rx={3} fill={print ? '#fff' : 'var(--ink-soft)'} stroke={c.line} strokeWidth={0.8} />
                <text x={x(new Date(a.at).getTime())} y={PT + plotH - 6.5} textAnchor="middle" fontSize={9} fontWeight={700} fill={c.line}>A</text>
              </g>
            ))}
            {/* Temperatura: la línea y cada punto en su hora real */}
            <path d={path(temps.map((v) => [x(new Date(v.takenAt).getTime()), y(v.temperature!)]))} fill="none" stroke={c.line} strokeWidth={2} strokeLinejoin="round" />
            {temps.map((v) => {
              const px = x(new Date(v.takenAt).getTime())
              const py = y(v.temperature!)
              const k = tempClass(v.temperature!, band)
              const label = `${v.temperature!.toFixed(1)} °C, ${dmy(v.takenAt)} ${hm(v.takenAt)}${who ? `, ${who(v.takenBy)}` : ''}${k === 'fever' ? ', fiebre' : k === 'hypo' ? ', hipotermia' : ''}`
              return (
                <g key={v.id} className="vs-pt" tabIndex={print ? undefined : 0} role={print ? undefined : 'button'} aria-label={print ? undefined : label}
                  onClick={() => setSel({ v, x: px, y: py })} onFocus={() => setSel({ v, x: px, y: py })} onMouseEnter={() => setSel({ v, x: px, y: py })}>
                  {!print && <circle cx={px} cy={py} r={12} fill="transparent" />}
                  {k === 'fever' ? <path d={`M${px},${py - 6} L${px + 6},${py + 5} L${px - 6},${py + 5} Z`} fill={c.fever} />
                    : k === 'hypo' ? <rect x={px - 5} y={py - 5} width={10} height={10} fill={print ? '#fff' : c.hypo} stroke={c.hypo} strokeWidth={print ? 1.6 : 0} />
                      : <circle cx={px} cy={py} r={4} fill={print ? '#fff' : 'var(--paper)'} stroke={c.line} strokeWidth={2} />}
                  {k !== 'normal' && (
                    <text x={px + 8} y={k === 'fever' ? py - 6 : py + 14} fontSize={11.5} fontWeight={700} fill={k === 'fever' ? c.fever : c.hypo}>
                      {print ? `${k === 'fever' ? 'F' : 'H'} ` : ''}{v.temperature!.toFixed(1)}</text>
                  )}
                </g>
              )
            })}
          </svg>
          {sel && !print && (
            <div className="vs-tip" style={{ left: Math.min(Math.max(sel.x, 90), W - 90), top: Math.max(sel.y - 64, 2) }} role="status">
              <b>{sel.v.temperature!.toFixed(1)} °C</b>
              <span>{dmy(sel.v.takenAt)} a las {hm(sel.v.takenAt)}</span>
              {who && <span>{sel.v.source === 'preclinic' ? 'Preclínica, ' : ''}{who(sel.v.takenBy)}</span>}
            </div>
          )}
        </div>
      </div>
      <div className="vs-legend" aria-hidden="true">
        <span><i className="vs-legend__band" />Normal {band.low.toFixed(1)}–{band.high.toFixed(1)} °C</span>
        <span><i className="vs-legend__fever" />Fiebre (≥ {band.high.toFixed(1)}){print ? ', F' : ''}</span>
        <span><i className="vs-legend__hypo" />Hipotermia (&lt; {band.low.toFixed(1)}){print ? ', H' : ''}</span>
        {missed.length > 0 && <span><i className="vs-legend__missed" />Toma pendiente{print ? ' (P)' : ''}</span>}
        {antipyretics.length > 0 && <span><i className="vs-legend__anti">A</i>Antipirético</span>}
        {pulse && <span><i className="vs-legend__pulse" />Pulso (lpm, eje derecho)</span>}
      </div>
    </div>
  )
}

/** Últimos valores de cada parámetro, con tendencia y una minigráfica. */
function VitalsCards({ vitals, ageYears }: { vitals: Vitals[]; ageYears?: number }) {
  const list = activeVitals(vitals)
  const cards: { key: VitalKey; label: string; unit: string; second?: VitalKey }[] = [
    { key: 'systolic', second: 'diastolic', label: 'Presión arterial', unit: 'mmHg' }, { key: 'heartRate', label: 'Frecuencia cardíaca', unit: 'lpm' },
    { key: 'respRate', label: 'Frecuencia respiratoria', unit: 'rpm' }, { key: 'spo2', label: 'Saturación O₂', unit: '%' },
    { key: 'glucose', label: 'Glucometría', unit: 'mg/dL' }, { key: 'painScale', label: 'Dolor', unit: '/10' },
    ...(list.some((v) => v.weightKg != null) ? [{ key: 'weightKg' as VitalKey, label: 'Peso', unit: 'kg' }] : []),
  ]
  return (
    <div className="vs-cards">
      {cards.map((card) => {
        const pts = list.filter((v) => v[card.key] != null)
        const last = pts[pts.length - 1]
        const prev = pts[pts.length - 2]
        const level = last ? [card.key, card.second].filter((k): k is VitalKey => !!k).map((k) => (last[k] != null ? vitalLevel(k, last[k]!, ageYears) : 'ok'))
          .reduce((a, b) => (a === 'error' || b === 'error' ? 'error' : a === 'warn' || b === 'warn' ? 'warn' : 'ok'), 'ok' as 'ok' | 'warn' | 'error') : 'ok'
        const delta = last && prev ? last[card.key]! - prev[card.key]! : 0
        const Trend = !prev || Math.abs(delta) < 1e-9 ? ArrowRight : delta > 0 ? ArrowUp : ArrowDown
        return (
          <article key={card.key} className={`vs-card vs-card--${level}`}>
            <span className="vs-card__label">{card.label}</span>
            {last ? (<>
              <span className="vs-card__value"><b>{fmt(card.key, last[card.key]!)}{card.second && last[card.second] != null ? `/${last[card.second]}` : ''}</b><small>{card.unit}</small>
                <Trend size={16} className="vs-card__trend" aria-label={!prev ? 'Sin toma anterior' : delta > 0 ? 'Subió' : delta < 0 ? 'Bajó' : 'Igual'} /></span>
              <span className="vs-card__when">{dmy(last.takenAt)} {hm(last.takenAt)}</span>
              <Sparkline pts={pts.slice(-14).map((v) => [new Date(v.takenAt).getTime(), v[card.key]!, card.second ? v[card.second] : undefined])} />
            </>) : <span className="muted vs-card__none">Sin tomas</span>}
          </article>
        )
      })}
    </div>
  )
}

function Sparkline({ pts }: { pts: [number, number, number | undefined][] }) {
  if (pts.length < 2) return <svg className="vs-spark" viewBox="0 0 120 34" aria-hidden="true" />
  const ts = pts.map((p) => p[0])
  const vs = pts.flatMap((p) => (p[2] != null ? [p[1], p[2]] : [p[1]]))
  const [a, b] = [Math.min(...ts), Math.max(...ts)]
  const [lo, hi] = [Math.min(...vs), Math.max(...vs)]
  const x = (t: number) => 3 + ((t - a) / Math.max(1, b - a)) * 114
  const y = (v: number) => 30 - ((v - lo) / Math.max(1e-6, hi - lo)) * 26
  const line = (i: 1 | 2) => pts.filter((p) => p[i] != null).map((p, j) => `${j ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[i]!).toFixed(1)}`).join(' ')
  return (
    <svg className="vs-spark" viewBox="0 0 120 34" preserveAspectRatio="none" aria-hidden="true">
      <path d={line(1)} fill="none" stroke="currentColor" strokeWidth={1.6} />
      {pts.some((p) => p[2] != null) && <path d={line(2)} fill="none" stroke="currentColor" strokeWidth={1.2} strokeDasharray="3 2" />}
    </svg>
  )
}

/**
 * Tabla clásica de la hoja: filas = parámetros, columnas = tomas en orden (las más recientes a la derecha, con la
 * primera columna fija). Valores fuera de rango en color; tomas anuladas tachadas con su motivo.
 */
export function VitalsTable({ vitals, ageYears, band, who, onVoid, print = false }: {
  vitals: Vitals[]; ageYears?: number; band: TempBand; who: (id: string) => string; onVoid?: (v: Vitals) => void; print?: boolean
}) {
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => { if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth }, [vitals.length])
  const ROWS: { label: string; keys: VitalKey[] }[] = [
    { label: 'PA (mmHg)', keys: ['systolic', 'diastolic'] }, { label: 'FC (lpm)', keys: ['heartRate'] }, { label: 'FR (rpm)', keys: ['respRate'] },
    { label: 'Temperatura (°C)', keys: ['temperature'] }, { label: 'SatO₂ (%)', keys: ['spo2'] }, { label: 'Glucometría (mg/dL)', keys: ['glucose'] },
    { label: 'Dolor (0–10)', keys: ['painScale'] }, { label: 'Peso (kg)', keys: ['weightKg'] }, { label: 'Talla (cm)', keys: ['heightCm'] },
  ]
  const rows = ROWS.filter((r) => r.keys.some((k) => vitals.some((v) => v[k] != null)) || ['PA (mmHg)', 'FC (lpm)', 'Temperatura (°C)'].includes(r.label))
  if (!vitals.length) return <div className="empty">Sin tomas en este rango.</div>
  const cell = (v: Vitals, keys: VitalKey[]) => {
    if (keys.every((k) => v[k] == null)) return <span className="muted">—</span>
    const level = keys.map((k) => (v[k] != null ? vitalLevel(k, v[k]!, ageYears) : 'ok')).reduce((a, b) => (a === 'error' || b === 'error' ? 'error' : a === 'warn' || b === 'warn' ? 'warn' : 'ok'), 'ok' as string)
    const t = keys[0] === 'temperature' && v.temperature != null ? tempClass(v.temperature, band) : 'normal'
    const text = keys.length === 2 ? `${v[keys[0]] ?? '—'}/${v[keys[1]] ?? '—'}` : fmt(keys[0], v[keys[0]]!)
    return <span className={`vs-val vs-val--${t !== 'normal' ? t : level}`}>{print && t !== 'normal' ? `${t === 'fever' ? 'F' : 'H'} ` : ''}{text}</span>
  }
  return (
    <div className="vs-table__scroll" ref={scroller}>
      <table className={`vs-table ${print ? 'vs-table--print' : ''}`}>
        <thead>
          <tr><th scope="col">Toma</th>{vitals.map((v) => (
            <th key={v.id} scope="col" className={v.voidedAt ? 'is-void' : ''} title={v.voidedAt ? `Anulada: ${v.voidReason}` : undefined}>
              <span>{dmy(v.takenAt)}</span><b>{hm(v.takenAt)}</b><small>{v.source === 'preclinic' ? 'Preclínica' : who(v.takenBy)}</small>
              {onVoid && !v.voidedAt && v.source !== 'preclinic' && <button className="icon-btn vs-void" aria-label={`Anular la toma de las ${hm(v.takenAt)} del ${dmy(v.takenAt)}`} onClick={() => onVoid(v)}><X size={12} /></button>}
              {v.voidedAt && <small className="vs-voided">Anulada</small>}
            </th>
          ))}</tr>
        </thead>
        <tbody>{rows.map((r) => (
          <tr key={r.label}><th scope="row">{r.label}</th>{vitals.map((v) => <td key={v.id} className={v.voidedAt ? 'is-void' : ''}>{cell(v, r.keys)}</td>)}</tr>
        ))}</tbody>
      </table>
    </div>
  )
}

/** Registrar una toma: sólo lo que se tomó, con la hora real de la toma (por defecto ahora, nunca en el futuro). */
function RecordVitalsModal({ file, p, onClose, onSaved }: { file: InpatientFile; p: Patient; onClose: () => void; onSaved: () => void }) {
  const { notify } = useStore()
  const ageYears = p.birthDate ? yearsOld(p.birthDate) : undefined
  const [v, setV] = useState<VitalsForm>(EMPTY_VITALS)
  const [checked, setChecked] = useState<Set<VitalKey>>(new Set())
  const [takenAt, setTakenAt] = useState(() => inputDateTime(new Date()))
  const [maxAt] = useState(() => inputDateTime(new Date(Date.now() + 60_000)))
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const errors = FIELDS.filter((k) => fieldIssue(k, v, ageYears)?.level === 'error')
  const any = FIELDS.some((k) => vitalNumber(v, k) != null)
  const now = useNow()
  const future = !!takenAt && new Date(takenAt).getTime() > now.getTime() + 60_000
  const save = async () => {
    setBusy(true)
    try {
      const body: Record<string, unknown> = { takenAt: new Date(takenAt).toISOString(), notes: v.notes.trim() || undefined }
      for (const k of FIELDS) body[k] = vitalNumber(v, k)
      await api(`/inpatient/${file.hospitalization.id}/vitals`, { body })
      notify('Signos vitales registrados')
      onSaved()
    } catch (e) {
      notify((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }
  const trySave = () => {
    setChecked(new Set(FIELDS.filter((k) => v[k] !== '')))
    if (FIELDS.some((k) => Number.isNaN(parseDecimal(v[k])))) return
    if (errors.length) { setConfirming(true); return }
    void save()
  }
  return (
    <Modal title="Registrar signos vitales" onClose={onClose} footer={confirming ? <>
      <span className="field__msg field__msg--error" style={{ marginRight: 'auto' }}>Revise: {errors.map((k) => `${VITALS[k].label.toLowerCase()} ${v[k]}`).join(', ')}.</span>
      <button className="btn btn--ghost" onClick={() => setConfirming(false)}>Corregir</button>
      <button className="btn btn--danger" disabled={busy} onClick={save}>Guardar de todos modos</button>
    </> : <>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!any || future || busy} onClick={trySave}>Guardar</button>
    </>}>
      <p className="muted" style={{ fontSize: 13.5 }}>Anota sólo lo que tomaste (por ejemplo, sólo la temperatura). Puedes usar punto o coma para los decimales.</p>
      <label className="field"><span>Fecha y hora de la toma</span>
        <input className={`input ${future ? 'input--error' : ''}`} type="datetime-local" value={takenAt} max={maxAt} onChange={(e) => setTakenAt(e.target.value)} />
        {future ? <small className="field__msg field__msg--error">No puede ser en el futuro.</small> : <small className="muted">Si la anotas después de tomarla, corrige la hora. La hora en que la anotas se guarda sola.</small>}</label>
      <VitalsFields v={v} setV={setV} checked={checked} setChecked={setChecked} ageYears={ageYears} onEdit={() => setConfirming(false)} />
      <label className="field"><span>Observaciones (opcional)</span><textarea className="textarea textarea--sm" rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></label>
    </Modal>
  )
}

function VoidVitalsModal({ v, onClose, onSaved }: { v: Vitals; onClose: () => void; onSaved: () => void }) {
  const { notify } = useStore()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Modal title="Anular la toma" onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--danger" disabled={reason.trim().length < 5 || busy} onClick={async () => {
        setBusy(true)
        try { await api(`/vitals/${v.id}/void`, { body: { reason: reason.trim() } }); notify('Toma anulada. Registra la correcta.'); onSaved() } catch (e) { notify((e as Error).message, 'error'); setBusy(false) }
      }}>Anular toma</button>
    </>}>
      <p>Toma de las {hm(v.takenAt)} del {dmy(v.takenAt)}. Queda tachada en la hoja, con tu nombre y el motivo; no se borra.</p>
      <label className="field"><span>Motivo</span><input className="input" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. Se anotó en el paciente equivocado" /></label>
    </Modal>
  )
}
