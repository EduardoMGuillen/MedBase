import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Plus, Thermometer, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { Modal } from '../components/ui'
import { VitalsFields } from '../components/VitalsFields'
import { inputDateTime, shortStaff } from '../lib/format'
import { yearsOld } from '../lib/inpatient'
import { clinicalRange, parseDecimal, VITALS, vitalLevel, type VitalKey, type VitalLevel } from '../lib/vitals'
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
  // OB1/OB2 (ronda 5): la misma regla que el panel de alertas (missedTakes); las pendientes son filas de la tabla
  const missed = open ? missedTakes(file, now).filter((s) => s.getTime() >= t0 && s.getTime() <= t1) : []
  const setEvery = async (n: number) => {
    try { await api(`/inpatient/${h.id}/vitals-frequency`, { method: 'PATCH', body: { everyHours: n } }); notify(`Signos vitales cada ${n} h`); reload() } catch (e) { notify((e as Error).message, 'error') }
  }
  const source = h.vitalsEveryHours ? 'indicado en la hoja' : ordered ? 'según la orden médica' : 'por defecto'

  return (
    <div className="hc vs">
      <section className="panel">
        <div className="panel__head vs__head">
          <div><h2>Signos vitales</h2><p>Último registro de cada signo. Cada toma queda con su autor y no se edita: se anula con motivo.</p></div>
        </div>
        {all.length
          ? <LatestStrip vitals={all} ageYears={ageYears} band={band} who={(id) => shortStaff(staffById(id)?.name)} />
          : <div className="empty vs__empty"><Thermometer size={26} /><p>Aún no hay signos vitales registrados.</p></div>}
      </section>

      {all.length > 0 && (<>
        <section className="panel">
          <div className="panel__head vs-trend__head">
            <div><h2>Curva térmica</h2><p>Toca o pasa el cursor sobre un punto para ver el valor. El rango elegido cambia la curva y la tabla.</p></div>
          </div>
          <div className="panel__body vs__bar">
            <label className="vs__every"><span>Toma cada</span>
              {can('inpatient.orders') && open
                ? <select className="select" value={every} onChange={(e) => setEvery(Number(e.target.value))} aria-label="Frecuencia de toma">{VITALS_FREQUENCIES.map((n) => <option key={n} value={n}>{n} h</option>)}</select>
                : <b>{every} h</b>}
              <small className="muted">{source}</small></label>
            <div className="segmented" role="radiogroup" aria-label="Rango de la curva y la tabla">
              {RANGES.map(([k, label]) => <button key={k} role="radio" aria-checked={range === k} onClick={() => setRange(k)}>{label}</button>)}
            </div>
          </div>
          <div className="panel__body vs-trend__body" data-tour="signos-curva">
            <ThermalCurve vitals={inRange} t0={t0} t1={t1} every={every} anchor={vitalsAnchor(file)} stayStart={stayStart} band={band}
              antipyretics={antipyreticDoses(file).filter((x) => { const t = new Date(x.at).getTime(); return t >= t0 && t <= t1 })} who={(id) => staffById(id)?.name ?? ''} />
          </div>
        </section>
        {/* OB2 (ronda 5): todos los signos en un cuadro escrito, una fila por toma, la más reciente arriba */}
        <section className="panel" data-tour="signos-tabla">
          <div className="panel__head"><div><h2>Tomas</h2><p>{inRange.length} toma{inRange.length === 1 ? '' : 's'}{missed.length ? ` y ${missed.length} pendiente${missed.length === 1 ? '' : 's'}` : ''} en el rango elegido. La más reciente arriba. Fuera de rango: ↑ alto, ↓ bajo.</p></div></div>
          <VitalsTable vitals={inRange} pending={missed} ageYears={ageYears} band={band} who={(id) => shortStaff(staffById(id)?.name)} onVoid={record ? setVoiding : undefined}
            onRecord={record ? () => setRecording(true) : undefined} />
        </section>
      </>)}
      {/* Fijo abajo a la derecha: siempre a mano, también en el celular */}
      {record && <button className="btn btn--primary vs-fab" data-tour="signos-registrar" onClick={() => setRecording(true)}><Plus size={18} />Registrar signos</button>}
      {recording && <RecordVitalsModal file={file} p={p} onClose={() => setRecording(false)} onSaved={() => { setRecording(false); reload() }} />}
      {voiding && <VoidVitalsModal v={voiding} onClose={() => setVoiding(null)} onSaved={() => { setVoiding(null); reload() }} />}
    </div>
  )
}

/** Un signo de las tarjetas del último registro (la PA lleva sistólica y diastólica). */
type Series = { key: VitalKey; second?: VitalKey; label: string; unit: string }
const worst = (levels: VitalLevel[]) => levels.reduce((a, b) => (a === 'error' || b === 'error' ? 'error' : a === 'warn' || b === 'warn' ? 'warn' : 'ok'), 'ok' as VitalLevel)

/**
 * EN1: franja con el último registro de cada signo: valor grande, unidad pequeña, hora y quién lo tomó. Sólo lleva
 * color lo que está fuera de rango. En el celular, dos columnas.
 */
function LatestStrip({ vitals, ageYears, band, who }: { vitals: Vitals[]; ageYears?: number; band: TempBand; who: (id: string) => string }) {
  const list = activeVitals(vitals)
  const cards: (Series & { always?: boolean })[] = [
    { key: 'temperature', label: 'Temperatura', unit: '°C', always: true }, { key: 'systolic', second: 'diastolic', label: 'Presión arterial', unit: 'mmHg', always: true },
    { key: 'heartRate', label: 'Frec. cardíaca', unit: 'lpm', always: true }, { key: 'respRate', label: 'Frec. respiratoria', unit: 'rpm' }, { key: 'spo2', label: 'Saturación O₂', unit: '%' },
    { key: 'glucose', label: 'Glucometría', unit: 'mg/dL' }, { key: 'painScale', label: 'Dolor', unit: '/10' }, { key: 'weightKg', label: 'Peso', unit: 'kg' },
  ]
  return (
    <div className="vs-latest" data-tour="signos-ultimo">
      {cards.map((c) => {
        const last = [...list].reverse().find((v) => v[c.key] != null)
        if (!last && !c.always) return null
        const tone = !last ? 'ok' : c.key === 'temperature'
          ? ({ fever: 'error', hypo: 'cold', normal: 'ok' } as const)[tempClass(last.temperature!, band)]
          : worst([c.key, c.second].filter((k): k is VitalKey => !!k && last[k] != null).map((k) => vitalLevel(k, last[k]!, ageYears)))
        return (
          <article key={c.key} className={`vs-last vs-last--${tone}`}>
            <span className="vs-last__label">{c.label}</span>
            {last ? (<>
              <span className="vs-last__value"><b>{fmt(c.key, last[c.key]!)}{c.second && last[c.second] != null ? `/${last[c.second]}` : ''}</b><small>{c.unit}</small></span>
              <span className="vs-last__when">{hm(last.takenAt)} · {dmy(last.takenAt)}{last.source === 'preclinic' ? ' · Preclínica' : ''}<br />{who(last.takenBy)}</span>
            </>) : <span className="vs-last__value"><b className="muted">—</b></span>}
          </article>
        )
      })}
    </div>
  )
}

/**
 * Curva térmica en SVG (nítida al imprimir). OB2 (ronda 5): es la única gráfica. Eje Y en °C (34 a 42), eje X con fecha y
 * hora («26/10 17:00»), banda normal sombreada, días de estancia arriba y la cuadrícula según la frecuencia de toma.
 * Fiebre: triángulo rojo; hipotermia: cuadrado azul; con el valor escrito. Con `print`, en blanco y negro: la banda en
 * gris y la fiebre y la hipotermia con su símbolo y letra. Las tomas pendientes van en la tabla, no en la curva.
 */
export function ThermalCurve({ vitals, t0, t1, every, anchor, stayStart, band, antipyretics = [], print = false, who }: {
  vitals: Vitals[]; t0: number; t1: number; every: number; anchor?: number; stayStart: number; band: TempBand
  antipyretics?: ReturnType<typeof antipyreticDoses>; print?: boolean; who?: (id: string) => string
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
  const PL = print ? 50 : 62
  const PR = print ? 16 : 22
  const PT = print ? 34 : 40
  const PB = 46
  const plotH = print ? 210 : 250
  const W = print ? 700 : Math.max(width, Math.round(hours * minPx) + PL + PR)
  const pxh = (W - PL - PR) / hours
  const H = PT + plotH + PB
  const x = (t: number) => PL + ((t - t0) / HOUR) * pxh
  const y = (temp: number) => PT + ((42 - Math.min(42, Math.max(34, temp))) / 8) * plotH
  const temps = activeVitals(vitals).filter((v) => v.temperature != null)
  const days: number[] = []
  for (let d = dayStart(t0); d < t1; d += DAY) days.push(d)
  const slots = expectedTakes(new Date(t0), new Date(t1), every, anchor).map((d) => d.getTime())
  // Cada etiqueta «26/10 17:00» necesita unos 56 px: se escribe en una de cada `step` tomas
  const step = Math.max(1, Math.ceil(56 / Math.max(1, pxh * every)))
  const dayN = (d: number) => Math.round((d - dayStart(stayStart)) / DAY) + 1
  const c = print
    ? { band: '#e6e6e6', grid: '#d4d4d4', minor: '#ececec', day: '#9a9a9a', line: '#000', fever: '#000', hypo: '#000', text: '#000' }
    : { band: 'var(--vs-band)', grid: 'var(--line-soft)', minor: 'var(--vs-minor)', day: 'var(--line)', line: 'var(--ink)', fever: 'var(--red-ink)', hypo: '#1d5fd1', text: 'var(--muted)' }
  const fs = print ? 11 : 12
  const path = (pts: [number, number][]) => pts.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)},${b.toFixed(1)}`).join(' ')

  return (
    <div className={`vs-curve ${print ? 'vs-curve--print' : ''}`}>
      <div className="vs-curve__scroll" ref={wrap} onClick={(e) => { if (e.target === e.currentTarget) setSel(null) }}>
        <div style={{ position: 'relative', width: W }}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Curva térmica: ${temps.length} tomas de temperatura`} onClick={(e) => { if ((e.target as Element).tagName === 'svg') setSel(null) }}>
            {/* Banda normal */}
            <rect x={PL} y={y(band.high)} width={W - PL - PR} height={y(band.low) - y(band.high)} fill={c.band} />
            {/* En pantalla sólo los grados enteros, suaves; la impresa conserva la cuadrícula cada 0.5 */}
            {Array.from({ length: 17 }, (_, i) => 34 + i * 0.5).filter((t) => print || Number.isInteger(t)).map((t) => (
              <g key={t}>
                <line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} stroke={Number.isInteger(t) ? c.grid : c.minor} strokeWidth={Number.isInteger(t) ? 1 : 0.7} />
                {Number.isInteger(t) && <text x={PL - 8} y={y(t) + 4} textAnchor="end" fontSize={fs} fill={c.text}>{t} °C</text>}
              </g>
            ))}
            {print && [band.low, band.high].map((t) => <line key={t} x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} stroke={c.day} strokeWidth={1} strokeDasharray="4 3" />)}
            {/* Cuadrícula de la frecuencia de toma, con fecha y hora completas */}
            {slots.map((t, i) => (
              <g key={t}>
                <line x1={x(t)} x2={x(t)} y1={PT} y2={PT + plotH} stroke={c.minor} strokeWidth={0.8} />
                {i % step === 0 && <>
                  <text x={x(t)} y={PT + plotH + 16} textAnchor="middle" fontSize={fs - 1} fontWeight={600} fill={c.text}>{hm(t)}</text>
                  <text x={x(t)} y={PT + plotH + 30} textAnchor="middle" fontSize={fs - 2} fill={c.text}>{dmy(t)}</text>
                </>}
              </g>
            ))}
            {/* Días de estancia */}
            {days.map((d) => {
              const a = Math.max(x(d), PL)
              const b = Math.min(x(d + DAY), W - PR)
              const n = dayN(d)
              return (
                <g key={d}>
                  <line x1={x(d)} x2={x(d)} y1={PT - 6} y2={PT + plotH} stroke={c.day} strokeWidth={print ? 1.2 : 1} />
                  {b - a > 40 && <text x={(a + b) / 2} y={PT - 14} textAnchor="middle" fontSize={fs} fontWeight={650} fill={c.text}>{b - a > 110 ? `Día ${n} · ${dmy(d)}` : b - a > 60 ? `Día ${n}` : `D${n}`}</text>}
                </g>
              )
            })}
            <line x1={PL} x2={W - PR} y1={PT + plotH} y2={PT + plotH} stroke={c.day} />
            {/* Antipiréticos aplicados */}
            {antipyretics.map((a) => (
              <g key={`a${a.dose.id}`}><title>{a.med.drug} {a.med.dose} a las {hm(a.at)} del {dmy(a.at)} (antipirético)</title>
                <rect x={x(new Date(a.at).getTime()) - 6} y={PT + plotH - 16} width={12} height={12} rx={3} fill={print ? '#fff' : 'var(--ink-soft)'} stroke={c.line} strokeWidth={0.8} />
                <text x={x(new Date(a.at).getTime())} y={PT + plotH - 6.5} textAnchor="middle" fontSize={9} fontWeight={700} fill={c.line}>A</text>
              </g>
            ))}
            {/* Temperatura: los puntos unidos por una línea, cada uno en su hora real */}
            <path d={path(temps.map((v) => [x(new Date(v.takenAt).getTime()), y(v.temperature!)]))} fill="none" stroke={c.line} strokeWidth={print ? 2 : 2.2} strokeLinejoin="round" strokeLinecap="round" />
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
                    <text x={px + 8} y={k === 'fever' ? py - 7 : py + 15} fontSize={fs} fontWeight={700} fill={k === 'fever' ? c.fever : c.hypo}>
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
        <span><i className="vs-legend__fever" />Fiebre{print ? ` (≥ ${band.high.toFixed(1)}), F` : ''}</span>
        <span><i className="vs-legend__hypo" />Hipotermia{print ? ` (< ${band.low.toFixed(1)}), H` : ''}</span>
        {antipyretics.length > 0 && <span><i className="vs-legend__anti">A</i>Antipirético</span>}
      </div>
    </div>
  )
}

/** Columnas de la tabla de tomas: las cinco de siempre y las demás si alguna toma las tiene. */
const COLUMNS: { key: VitalKey; second?: VitalKey; label: string; unit: string; always?: boolean }[] = [
  { key: 'temperature', label: 'Temperatura', unit: '°C', always: true }, { key: 'systolic', second: 'diastolic', label: 'PA', unit: 'mmHg', always: true },
  { key: 'heartRate', label: 'FC', unit: 'lpm', always: true }, { key: 'respRate', label: 'FR', unit: 'rpm', always: true }, { key: 'spo2', label: 'SatO₂', unit: '%', always: true },
  { key: 'glucose', label: 'Glucometría', unit: 'mg/dL' }, { key: 'painScale', label: 'Dolor', unit: '0–10' }, { key: 'weightKg', label: 'Peso', unit: 'kg' }, { key: 'heightCm', label: 'Talla', unit: 'cm' },
]

/**
 * OB2 (ronda 5): cuadro escrito de los signos, una fila por toma (la más reciente arriba) con quién la tomó y sus notas.
 * Fuera de rango: color y flecha (↑ alto, ↓ bajo), que se leen también impresos en blanco y negro. Las tomas pendientes
 * son filas «Pendiente» con su botón. Encabezado y primera columna fijos; anuladas tachadas con su motivo.
 */
export function VitalsTable({ vitals, pending = [], ageYears, band, who, onVoid, onRecord, print = false }: {
  vitals: Vitals[]; pending?: Date[]; ageYears?: number; band: TempBand; who: (id: string) => string; onVoid?: (v: Vitals) => void; onRecord?: () => void; print?: boolean
}) {
  if (!vitals.length && !pending.length) return <div className="empty">Sin tomas en este rango.</div>
  const cols = COLUMNS.filter((c) => c.always || vitals.some((v) => v[c.key] != null))
  const rows: ({ at: number; v: Vitals } | { at: number; v?: undefined })[] = [
    ...vitals.map((v) => ({ at: new Date(v.takenAt).getTime(), v })), ...pending.map((d) => ({ at: d.getTime() })),
  ].sort((a, b) => b.at - a.at)
  /** Un valor con su color y su flecha, según el rango clínico (y la banda de temperatura de la clínica). */
  const value = (v: Vitals, k: VitalKey) => {
    const n = v[k]
    if (n == null) return <span className="muted">—</span>
    let dir: '↑' | '↓' | '' = ''
    let tone: string = 'ok'
    if (k === 'temperature') {
      const t = tempClass(n, band)
      dir = t === 'fever' ? '↑' : t === 'hypo' ? '↓' : ''
      tone = t === 'normal' ? 'ok' : t
    } else {
      const r = clinicalRange(k, ageYears)
      dir = r && r[1] != null && n > r[1] ? '↑' : r && r[0] != null && n < r[0] ? '↓' : ''
      tone = vitalLevel(k, n, ageYears)
    }
    return <span className={`vs-val vs-val--${tone}`} title={dir ? (dir === '↑' ? 'Alto' : 'Bajo') : undefined}>{fmt(k, n)}{dir && <b className="vs-val__dir">{dir}</b>}</span>
  }
  return (
    <div className={`vs-log__scroll${print ? ' vs-log__scroll--print' : ''}`}>
      <table className={`vs-log${print ? ' vs-log--print' : ''}`}>
        <thead>
          <tr>
            <th scope="col">Fecha y hora</th>
            {cols.map((c) => <th key={c.key} scope="col">{c.label}<small>{c.unit}</small></th>)}
            <th scope="col">Registró</th>
            <th scope="col">Notas</th>
          </tr>
        </thead>
        <tbody>{rows.map((r) => r.v ? (
          <tr key={r.v.id} className={r.v.voidedAt ? 'is-void' : ''}>
            <th scope="row">{dmy(r.at)} <b>{hm(r.at)}</b>
              {onVoid && !r.v.voidedAt && r.v.source !== 'preclinic' && <button className="icon-btn vs-void" aria-label={`Anular la toma de las ${hm(r.at)} del ${dmy(r.at)}`} onClick={() => onVoid(r.v!)}><X size={12} /></button>}</th>
            {cols.map((c) => <td key={c.key}>{value(r.v!, c.key)}{c.second && <>/{value(r.v!, c.second)}</>}</td>)}
            <td className="vs-log__who">{r.v.source === 'preclinic' ? 'Preclínica' : who(r.v.takenBy)}</td>
            <td className="vs-log__notes">{r.v.voidedAt ? <span className="vs-voided">Anulada{r.v.voidReason ? `: ${r.v.voidReason}` : ''}</span> : r.v.notes || <span className="muted">—</span>}</td>
          </tr>
        ) : (
          <tr key={`p${r.at}`} className="vs-log__pending">
            <th scope="row">{dmy(r.at)} <b>{hm(r.at)}</b></th>
            <td colSpan={cols.length + 2}><span className="badge badge--amber">{print ? 'P · ' : ''}Pendiente</span> <span className="muted">Toma esperada sin registrar.</span>
              {onRecord && <button className="btn btn--soft btn--sm vs-log__record" onClick={onRecord}><Plus size={14} />Registrar signos</button>}</td>
          </tr>
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
