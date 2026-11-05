import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Download, Printer } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { Loading } from '../components/ui'
import { ClinicalDoc, guardianRow, patientOf, placeOf, type DocSigner } from '../components/ClinicalDoc'
import { PdfPages } from '../components/PdfPages'
import { ANESTHESIA_GRID, ANESTHESIA_SHEET } from '../lib/clinicalConfig'
import { aldreteTotal, blankAnesthesia, fluidBalance, gridPoints, hhmm, prefillAnesthesia, signed, type AnesthesiaData, type AnesthesiaPrefill, type AnesthesiaSheet } from '../lib/anesthesia'
import { dateToDisplay } from '../lib/dateInput'
import { dmyTime } from '../lib/format'
import { anesthesiaNoteLink } from '../components/AnesthesiaSheet'
import type { Addendum } from '../lib/types'
import '../components/anesthesia.css'

/**
 * PQ3 (ronda 14): la hoja de anestesia del Anexo B con la plantilla de IM1 (encabezado de la clínica, cuadrícula del paciente,
 * firma sin raya con nombre, especialidad y colegiado). En blanco (para llenarla a mano en sala, con los datos que ya hay) o con
 * lo que se llenó en el sistema; el monitoreo se dibuja en la cuadrícula de 0 a 240 minutos. Instrumentista y circulante firman
 * en espacios en blanco. Carta, dos hojas.
 */

const Blank = ({ long }: { long?: boolean }) => <span className={`anes-blank${long ? ' anes-blank--long' : ''}`} />
/** Un dato: lo escrito o, en la hoja en blanco, la línea para llenarlo. */
function F({ label, value, unit, wide, long, area }: { label: string; value?: string; unit?: string; wide?: boolean; long?: boolean; area?: boolean }) {
  return <div className={`anes-f${wide ? ' anes-f--wide' : ''}`}><i>{label}:</i>{value ? <span className="anes-v">{value}{unit ? ` ${unit}` : ''}</span> : area ? <span className="anes-blank--area" /> : <><Blank long={long} />{unit ? ` ${unit}` : ''}</>}</div>
}
/** Casilla marcada o vacía. */
const Box = ({ on, children }: { on?: boolean; children: ReactNode }) => <span className={`anes-box${on ? ' anes-box--on' : ''}`}><b>{on ? '☒' : '☐'}</b>{children}</span>
const Sec = ({ title, cols, children }: { title: string; cols?: 2 | 3 | 4 | 6; children: ReactNode }) =>
  <section className="anes-sec"><h3>{title}</h3><div className={`anes-sec__body${cols ? ` anes-sec__body--${cols}` : ''}`}>{children}</div></section>

/** A22: la tabla de monitoreo dibujada en la cuadrícula (PAS ∨, PAD ∧, FC •, SpO₂ ○; inicio de anestesia X e inicio de cirugía ⊙). */
function MonitorGrid({ d }: { d: AnesthesiaData }) {
  const { start, points, marks } = gridPoints(d)
  const W = 1000; const L = 46; const R = 18; const T = 32; const H = 250; const bandH = 15
  const cols = ANESTHESIA_GRID.minutes / ANESTHESIA_GRID.step
  const cw = (W - L - R) / cols
  const chunks = Math.max(1, ...points.map((p) => Math.floor(p.min / ANESTHESIA_GRID.minutes) + 1))
  const y = (v: number) => T + H - (Math.max(0, Math.min(ANESTHESIA_GRID.max, v)) / ANESTHESIA_GRID.max) * H
  const bands = ANESTHESIA_SHEET.bands
  const total = T + H + 8 + bands.length * bandH + 4
  const value = (s: string) => { const v = Number(s.replace(',', '.')); return s.trim() && Number.isFinite(v) ? v : undefined }
  return <>{Array.from({ length: chunks }, (_, c) => {
    const from = c * ANESTHESIA_GRID.minutes
    const x = (min: number) => L + ((min - from) / ANESTHESIA_GRID.step) * cw
    const here = points.filter((p) => p.min >= from && p.min <= from + ANESTHESIA_GRID.minutes)
    const col = (min: number) => Math.min(cols - 1, Math.floor((min - from) / ANESTHESIA_GRID.step))
    const band = (k: 'spo2' | 'etco2' | 'temp') => here.filter((p) => p[k].trim()).map((p) => ({ i: col(p.min), v: p[k].trim() }))
    const bandVals: Record<string, { i: number; v: string }[]> = { 'SpO₂ %': band('spo2'), 'EtCO₂': band('etco2'), 'Temperatura °C': band('temp') }
    return (
      <svg key={c} className="anes-grid" viewBox={`0 0 ${W} ${total}`} role="img" aria-label={`Cuadrícula del monitoreo, minutos ${from} a ${from + ANESTHESIA_GRID.minutes}`}>
        {/* Columnas cada 5 minutos; más marcadas cada 15 */}
        {Array.from({ length: cols + 1 }, (_, i) => <line key={`v${i}`} x1={L + i * cw} x2={L + i * cw} y1={T} y2={T + H + 8 + bands.length * bandH} stroke={i % 3 === 0 ? '#8d99a5' : '#d3d9df'} strokeWidth={i % 3 === 0 ? 1 : 0.6} />)}
        {Array.from({ length: ANESTHESIA_GRID.max / ANESTHESIA_GRID.lines + 1 }, (_, i) => { const v = i * ANESTHESIA_GRID.lines; return <g key={`h${i}`}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={v % 100 === 0 ? '#8d99a5' : '#d3d9df'} strokeWidth={v % 100 === 0 ? 1 : 0.6} />
          <text x={L - 5} y={y(v) + 4} fontSize="11" textAnchor="end" fill="#333">{v}</text></g> })}
        {Array.from({ length: cols / 3 + 1 }, (_, i) => { const m = from + i * 15; return <g key={`t${i}`}>
          <text x={L + i * 3 * cw} y={start != null ? 12 : 22} fontSize="11" textAnchor="middle" fill="#222">{m}</text>
          {start != null && <text x={L + i * 3 * cw} y={25} fontSize="10" textAnchor="middle" fill="#555">{hhmm(start + m)}</text>}</g> })}
        <text x={2} y={12} fontSize="10" fill="#555">min</text>
        {start != null && <text x={2} y={25} fontSize="10" fill="#555">hora</text>}
        {/* Inicio de anestesia (X) e inicio de cirugía (⊙) */}
        {([['anesthesiaStart', 'X'], ['surgeryStart', '⊙']] as const).map(([k, sym]) => { const m = marks[k]; if (m == null || m < from || m > from + ANESTHESIA_GRID.minutes) return null
          return <g key={k}><line x1={x(m)} x2={x(m)} y1={T} y2={T + H} stroke="#1d2b36" strokeDasharray="4 3" strokeWidth={1} /><text x={x(m)} y={T + 12} fontSize="13" fontWeight="700" textAnchor="middle">{sym}</text></g> })}
        {/* Los registros */}
        {(['sys', 'dia', 'hr', 'spo2'] as const).map((k) => { const pts = here.map((p) => ({ x: x(p.min), v: value(p[k]) })).filter((p) => p.v != null)
          return <g key={k}>
            {pts.length > 1 && <polyline points={pts.map((p) => `${p.x},${y(p.v!)}`).join(' ')} fill="none" stroke={k === 'hr' ? '#555' : '#1d2b36'} strokeWidth={0.8} strokeDasharray={k === 'spo2' ? '2 2' : undefined} />}
            {pts.map((p, i) => k === 'sys' ? <path key={i} d={`M${p.x - 5},${y(p.v!) - 6} L${p.x},${y(p.v!)} L${p.x + 5},${y(p.v!) - 6}`} fill="none" stroke="#000" strokeWidth={1.6} />
              : k === 'dia' ? <path key={i} d={`M${p.x - 5},${y(p.v!) + 6} L${p.x},${y(p.v!)} L${p.x + 5},${y(p.v!) + 6}`} fill="none" stroke="#000" strokeWidth={1.6} />
              : k === 'hr' ? <circle key={i} cx={p.x} cy={y(p.v!)} r={3.4} fill="#000" />
              : <circle key={i} cx={p.x} cy={y(p.v!)} r={3.6} fill="#fff" stroke="#000" strokeWidth={1.2} />)}
          </g> })}
        {/* Franjas: SpO₂, EtCO₂ y temperatura salen de la tabla; lo demás se escribe a mano */}
        {bands.map((b, i) => { const by = T + H + 8 + i * bandH; return <g key={b}>
          <line x1={0} x2={W - R} y1={by} y2={by} stroke="#8d99a5" strokeWidth={0.8} />
          <text x={2} y={by + 11} fontSize="9.5" fill="#222">{b.length > 9 ? b.replace(' / Isoflurano', '/Iso').replace('Temperatura', 'Temp.') : b}</text>
          {(bandVals[b] ?? []).map((v, j) => <text key={j} x={L + v.i * cw + cw / 2} y={by + 11} fontSize={v.v.length > 3 ? 7.5 : 9.5} textAnchor="middle" fill="#000">{v.v}</text>)}
        </g> })}
        <line x1={0} x2={W - R} y1={T + H + 8 + bands.length * bandH} y2={T + H + 8 + bands.length * bandH} stroke="#8d99a5" strokeWidth={0.8} />
      </svg>
    )
  })}
  <div className="anes-legend"><span>∨ PAS</span><span>∧ PAD</span><span>• FC</span><span>○ SpO₂</span><span>X Inicio de anestesia</span><span>⊙ Inicio de cirugía</span><span>Una columna cada 5 minutos</span></div></>
}

export function AnesthesiaDocument({ prefill, data, sheet, addenda = [] }: { prefill: AnesthesiaPrefill; data?: AnesthesiaData; sheet?: AnesthesiaSheet; addenda?: Addendum[] }) {
  const { settings, staffById } = useStore()
  const blank = !data
  const d = data ?? (() => { const x = prefillAnesthesia(prefill); return { ...blankAnesthesia(), date: '', weightKg: x.weightKg, heightCm: x.heightCm, preDiagnosis: x.preDiagnosis, proposedSurgery: x.proposedSurgery, allergies: x.allergies } })()
  const has = (list: readonly string[], v: string) => list.includes(v)
  const bal = fluidBalance(d.fluids)
  const ald = aldreteTotal(d.aldrete)
  const p = prefill.patient
  const signer: DocSigner = sheet?.signer
    ? { label: 'Anestesiólogo (firma y sello)', name: sheet.signer.name, title: sheet.signer.title, license: sheet.signer.license, signatureId: sheet.signer.signatureId, stampId: sheet.signer.stampId }
    : { label: 'Anestesiólogo (firma y sello)', name: d.anesthesiologist || 'Nombre: ______________________', title: 'Especialidad: ________________', license: 'Colegiado: ____________' }
  const drugs = blank || !d.drugs.length ? ANESTHESIA_SHEET.drugCategories.map((c) => ({ id: c, category: c, drug: '', dose: '', route: '', time: '' })) : d.drugs
  return (
    <ClinicalDoc kind="Hoja de anestesia" at={sheet?.createdAt} folio={sheet ? sheet.id.slice(0, 8).toUpperCase() : undefined} folioNote={blank ? 'Para llenar a mano en sala' : undefined}
      place={placeOf(settings)} className="anes-doc" stamp={sheet?.voidedAt ? 'ANULADA' : undefined}
      patient={{ ...patientOf({ firstName: p.firstName, lastName: p.lastName, record: p.record, dni: p.dni, birthDate: p.birthDate ?? '', sex: (p.sex ?? '') as 'F' | 'M' }, settings),
        third: { label: 'Fecha', value: d.date ? dateToDisplay(d.date) : '___/___/______' } }}
      rows={[guardianRow({ dni: p.dni, birthDate: p.birthDate ?? '', guardianName: p.guardianName, guardianDni: p.guardianDni, guardianRelation: p.guardianRelation })]}
      heading="Hoja de registro de anestesia"
      signers={[signer, { label: 'Instrumentista', name: d.scrubNurse || 'Nombre: ________________', small: true }, { label: 'Circulante', name: d.circulatingNurse || 'Nombre: ________________', small: true }]}
      legends={['Sin la firma y el sello del anestesiólogo en papel no vale.', sheet ? `${sheet.mode === 'system' ? 'Llenada y firmada en el sistema' : 'Subida'} el ${dmyTime(sheet.createdAt)}${sheet.version > 1 ? ` · versión ${sheet.version}` : ''}` : 'Hoja en blanco']}>
      <Sec title="Paciente y equipo quirúrgico" cols={4}>
        <F label="Sala" value={d.room} />
        <F label="Peso" value={d.weightKg} unit="kg" />
        <F label="Talla" value={d.heightCm} unit="cm" />
        <div className="anes-f">{ANESTHESIA_SHEET.scheduled.map((x) => <Box key={x} on={d.scheduled === x}>{x}</Box>)}</div>
        <F label="Diagnóstico preoperatorio" value={d.preDiagnosis} wide long />
        <F label="Cirugía propuesta" value={d.proposedSurgery} wide long />
        <F label="Cirujano" value={d.surgeon} /><F label="1.er ayudante" value={d.assistant1} /><F label="2.º ayudante" value={d.assistant2} /><F label="Anestesiólogo" value={d.anesthesiologist} />
      </Sec>
      <div className="anes-cols">
        <Sec title="Valoración preanestésica">
          <div className="anes-f"><i>ASA:</i>{ANESTHESIA_SHEET.asa.map((x) => <Box key={x} on={d.asa === x}>{x}</Box>)}<Box on={d.asaE}>E</Box></div>
          <div className="anes-f"><i>Mallampati:</i>{ANESTHESIA_SHEET.mallampati.map((x) => <Box key={x} on={d.mallampati === x}>{x}</Box>)}
            <i style={{ marginLeft: 6 }}>Vía aérea difícil:</i><Box on={d.difficultAirway === 'Sí'}>Sí</Box><Box on={d.difficultAirway === 'No'}>No</Box></div>
          <F label="Alergias" value={d.allergies} long />
          <div className="anes-f"><i>Ayuno:</i> sólidos {d.fastingSolids ? <b>{d.fastingSolids}</b> : <Blank />} h · líquidos {d.fastingLiquids ? <b>{d.fastingLiquids}</b> : <Blank />} h</div>
          <F label="Antecedentes y medicación" value={d.history} area />
          <div className="anes-sec__body--3" style={{ display: 'grid', gap: '2px 8px' }}>
            <F label="Hb" value={d.labs.hb} /><F label="Hto" value={d.labs.hto} /><F label="Plaquetas" value={d.labs.plt} />
            <F label="TP/INR" value={d.labs.inr} /><F label="Glucosa" value={d.labs.glucose} /><F label="Tipo y Rh" value={d.labs.bloodType} />
          </div>
        </Sec>
        <Sec title="Verificación y técnica">
          <div className="anes-f"><i>Lista OMS:</i>{ANESTHESIA_SHEET.who.map((x) => <Box key={x} on={has(d.who, x)}>{x}</Box>)}</div>
          <div className="anes-f">{ANESTHESIA_SHEET.checks.map((x) => <Box key={x} on={has(d.checks, x)}>{x}</Box>)}</div>
          <div className="anes-f"><i>Técnica:</i>{ANESTHESIA_SHEET.techniques.map((x) => <Box key={x} on={has(d.techniques, x)}>{x}</Box>)}</div>
          <F label="Mantenimiento (agente, CAM o TIVA y su ritmo)" value={d.maintenance} long />
        </Sec>
      </div>
      <Sec title="Tiempos" cols={6}>{ANESTHESIA_SHEET.times.map((t) => <F key={t.key} label={t.label} value={d.times[t.key]} />)}</Sec>
      <section className="anes-sec"><h3>Monitoreo transanestésico (cada 5 min)</h3><div className="anes-scroll"><MonitorGrid d={d} /></div></section>
      <div className="anes-page-break" />
      <Sec title="Fármacos">
        <table className="anes-tbl"><thead><tr><th>Categoría</th><th>Fármaco</th><th>Dosis</th><th>Vía</th><th>Hora</th></tr></thead>
          <tbody>{drugs.map((x) => <tr key={x.id}><td>{x.category}</td><td>{x.drug}</td><td>{x.dose}</td><td>{x.route}</td><td>{x.time}</td></tr>)}</tbody></table>
      </Sec>
      <div className="anes-cols">
        <Sec title="Vía aérea y ventilación">
          <div className="anes-f">{ANESTHESIA_SHEET.airway.map((x) => <Box key={x} on={has(d.airway, x)}>{x}</Box>)}</div>
          <div className="anes-f"><i>N.º:</i>{d.tubeSize ? <b>{d.tubeSize}</b> : <Blank />} <i style={{ marginLeft: 6 }}>Cormack:</i>{ANESTHESIA_SHEET.cormack.map((x) => <Box key={x} on={d.cormack === x}>{x}</Box>)}</div>
          <div className="anes-f"><i>Intentos:</i>{d.attempts ? <b>{d.attempts}</b> : <Blank />} <Box on={d.etco2Confirms}>EtCO₂ confirma</Box></div>
          <div className="anes-f">{ANESTHESIA_SHEET.ventilation.map((x) => <Box key={x} on={d.ventilation === x}>{x}</Box>)}
            VT {d.vt ? <b>{d.vt}</b> : <Blank />} FR {d.rr ? <b>{d.rr}</b> : <Blank />} PEEP {d.peep ? <b>{d.peep}</b> : <Blank />}</div>
        </Sec>
        <Sec title="Regional, monitoreo y accesos">
          <F label="Nivel / aguja" value={d.regionalLevel} long /><F label="Fármaco / volumen" value={d.regionalDrug} long />
          <div className="anes-f">{ANESTHESIA_SHEET.monitors.map((x) => <Box key={x} on={has(d.monitors, x)}>{x}</Box>)}</div>
          <F label="Vías IV (calibre y sitio)" value={d.ivLines} long /><F label="Posición" value={d.position} long />
        </Sec>
      </div>
      <Sec title="Balance de líquidos (mL)" cols={6}>
        <F label="Cristaloides" value={d.fluids.crystalloids} /><F label="Coloides / hemoderivados" value={d.fluids.colloids} />
        <F label="Sangrado" value={d.fluids.bleeding} /><F label="Diuresis / otros" value={d.fluids.diuresis} />
        <F label="Ingresos − egresos" value={bal.any ? `${bal.inflow} − ${bal.outflow}` : ''} /><F label="Balance" value={bal.any ? `${signed(bal.balance)} mL` : ''} />
      </Sec>
      <Sec title="Operación practicada e incidentes">
        <F label="Operación practicada" value={d.operation} long />
        <F label="Incidentes / eventos" value={d.incidents} area />
        <div className="anes-f"><Box on={d.extubated}>Extubado en sala</Box><Box on={d.tof09}>TOF ≥ 0.9</Box><i style={{ marginLeft: 6 }}>Destino:</i>{ANESTHESIA_SHEET.destinations.map((x) => <Box key={x} on={d.destination === x}>{x}</Box>)}</div>
      </Sec>
      <Sec title="Condición al egreso de sala">
        <div className="anes-sec__body--4" style={{ display: 'grid', gap: '2px 8px' }}><F label="PA" value={d.exit.bp} /><F label="FC" value={d.exit.hr} /><F label="FR" value={d.exit.rr} /><F label="SpO₂" value={d.exit.spo2} unit={d.exit.spo2 ? '%' : undefined} /></div>
        <table className="anes-tbl"><thead><tr><th>Aldrete</th>{ANESTHESIA_SHEET.aldrete.map((a) => <th key={a.key}>{a.label}</th>)}<th>Total</th></tr></thead>
          <tbody><tr><td>0–2</td>{ANESTHESIA_SHEET.aldrete.map((a) => <td key={a.key}>{d.aldrete[a.key]}</td>)}<td><b>{ald.any ? `${ald.total}/10` : ''}</b></td></tr></tbody></table>
      </Sec>
      {addenda.length > 0 && <Sec title="Adendas"><div className="anes-addenda">{addenda.map((a) => <p key={a.id}><b>{dmyTime(a.at)} · {staffById(a.authorId)?.name}:</b> {a.corrects ? `Se corrige: ${a.corrects}. ` : ''}{a.text}</p>)}</div></Sec>}
    </ClinicalDoc>
  )
}

/** «En el expediente» (Expediente completo): las hojas de anestesia de la estancia; las anuladas, en una línea. */
export function AnesthesiaRecord({ stayId }: { stayId: string }) {
  const { staffById } = useStore()
  const [list, setList] = useState<{ sheet: AnesthesiaSheet; prefill?: AnesthesiaPrefill }[] | null>(null)
  useEffect(() => {
    api<AnesthesiaSheet[]>(`/inpatient/${stayId}/anesthesia`).then(async (all) => setList(await Promise.all(all.map(async (s) =>
      s.mode === 'system' && !s.voidedAt ? { sheet: s, prefill: (await api<{ prefill: AnesthesiaPrefill }>(`/anesthesia/sheets/${s.id}`).catch(() => null))?.prefill } : { sheet: s })))).catch(() => setList([]))
  }, [stayId])
  if (!list?.length) return null
  return <>
    <h2 className="fr-h">Hojas de anestesia</h2>
    {list.map(({ sheet: s, prefill }) => <div key={s.id} className="fr-lab">
      <b>{s.procedure ?? 'Nota postquirúrgica'}</b> · {s.mode === 'system' ? `firmada por ${s.signer?.name ?? s.performedBy.name}` : `subida por ${staffById(s.createdBy)?.name ?? '—'} (anestesia de ${s.performedBy.name})`} {dmyTime(s.createdAt)}
      {s.voidedAt ? <p className="muted">Anulada {dmyTime(s.voidedAt)}: {s.voidReason}</p>
        : s.mode === 'system' && s.data && prefill ? <AnesthesiaDocument prefill={prefill} data={s.data} sheet={s} />
        : s.fileId ? <PdfPages fileId={s.fileId} label="La hoja de anestesia" /> : null}
    </div>)}
  </>
}

/** Imprimir o descargar en PDF; «?accion=imprimir» abre la ventana de impresión al cargar. */
function useAutoPrint(ready: boolean) {
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    if (!ready || params.get('accion') !== 'imprimir') return
    const q = new URLSearchParams(params); q.delete('accion'); setParams(q, { replace: true })
    const t = setTimeout(() => window.print(), 600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])
}
function PrintBar({ title, children }: { title: string; children?: ReactNode }) {
  const { notify } = useStore()
  const nav = useNavigate()
  return (<>
    <div className="page-head no-print"><button className="btn btn--ghost" onClick={() => nav(-1)}><ChevronLeft size={16} />Volver</button>{children}</div>
    <div className="exam-order__bar no-print"><div className="exam-order__acts">
      <b>{title}</b>
      <button className="btn btn--primary btn--sm anes-btn" onClick={() => window.print()}><Printer size={15} />Imprimir</button>
      <button className="btn btn--soft btn--sm anes-btn" onClick={() => { notify('En la ventana de impresión elige «Guardar como PDF».'); setTimeout(() => window.print(), 150) }}><Download size={15} />Descargar PDF</button>
    </div><small className="muted">Hoja Carta. Sin la firma y el sello del anestesiólogo en papel no vale.</small></div>
  </>)
}

/** «Imprimir hoja de anestesia en blanco»: desde la autorización quirúrgica o desde Anexos. */
export function AnesthesiaBlankPage() {
  const { stayId } = useParams()
  const [params] = useSearchParams()
  const [x, setX] = useState<{ prefill: AnesthesiaPrefill; stayKind: string } | null>(null)
  const [error, setError] = useState('')
  const auth = params.get('autorizacion')
  useEffect(() => { api<{ prefill: AnesthesiaPrefill; stayKind: string }>(`/inpatient/${stayId}/anesthesia/blank${auth ? `?autorizacion=${auth}` : ''}`).then(setX).catch((e: Error) => setError(e.message)) }, [stayId, auth])
  useAutoPrint(!!x)
  if (error) return <div className="page"><section className="panel"><div className="empty"><b>No se puede abrir la hoja.</b> {error} <Link to="/app">Volver al inicio</Link></div></section></div>
  if (!x) return <Loading label="Preparando la hoja" />
  return <div className="page"><PrintBar title="Hoja de anestesia en blanco" /><AnesthesiaDocument prefill={x.prefill} /></div>
}

/** «Ver» e «Imprimir» de una hoja: la llenada en el sistema con la plantilla; la subida, sus páginas (foto o PDF). */
export default function AnesthesiaSheetPage() {
  const { id } = useParams()
  const { staffById } = useStore()
  const [x, setX] = useState<{ sheet: AnesthesiaSheet; stayKind: string; prefill: AnesthesiaPrefill } | null>(null)
  const [addenda, setAddenda] = useState<Addendum[]>([])
  const [error, setError] = useState('')
  const [pagesReady, setPagesReady] = useState(false)
  useEffect(() => {
    api<{ sheet: AnesthesiaSheet; stayKind: string; prefill: AnesthesiaPrefill }>(`/anesthesia/sheets/${id}`).then(async (r) => {
      setX(r)
      if (r.sheet.mode === 'system') setAddenda(await api<Addendum[]>(`/addenda?ids=${r.sheet.id}`).catch(() => []))
    }).catch((e: Error) => setError(e.message))
  }, [id])
  useAutoPrint(!!x && (x.sheet.mode === 'system' || pagesReady))
  if (error) return <div className="page"><section className="panel"><div className="empty"><b>No se puede abrir la hoja.</b> {error} <Link to="/app">Volver al inicio</Link></div></section></div>
  if (!x) return <Loading label="Abriendo la hoja de anestesia" />
  const s = x.sheet
  const back = <div className="page-head__actions"><Link className="btn btn--ghost" to={anesthesiaNoteLink(x.stayKind, s.hospitalizationId, s.noteId)}>Ir a la nota</Link></div>
  return (
    <div className="page">
      <PrintBar title={`Hoja de anestesia${s.voidedAt ? ' (anulada)' : ''}`}>{back}</PrintBar>
      {s.voidedAt && <p className="alert-strip alert-strip--amber no-print">Anulada el {dmyTime(s.voidedAt)} por {staffById(s.voidedBy ?? '')?.name ?? '—'}: {s.voidReason}</p>}
      {s.mode === 'system' && s.data
        ? <AnesthesiaDocument prefill={x.prefill} data={s.data} sheet={s} addenda={addenda} />
        : <>
          <p className="muted no-print">Subida por {staffById(s.createdBy)?.name ?? '—'}, {dmyTime(s.createdAt)} · Anestesia realizada por {s.performedBy.name}{s.observation ? ` · ${s.observation}` : ''}</p>
          {s.fileId && <div className="signed-doc"><PdfPages fileId={s.fileId} label="La hoja de anestesia" onReady={() => setPagesReady(true)} /></div>}
        </>}
    </div>
  )
}
