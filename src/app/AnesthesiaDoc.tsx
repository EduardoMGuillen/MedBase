import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { Loading } from '../components/ui'
import { ClinicalDoc, guardianRow, patientOf, placeOf, type DocSigner } from '../components/ClinicalDoc'
import { PdfPages } from '../components/PdfPages'
import { Blank, Box, DocError, F, PrintBar, Sec, useAutoPrint } from '../components/SurgicalPrint'
import { ANESTHESIA_GRID, ANESTHESIA_SHEET, ANESTHESIA_SOURCES } from '../lib/clinicalConfig'
import { aldreteTotal, blankAnesthesia, fluidBalance, gridPoints, hhmm, prefillAnesthesia, signed, type AnesthesiaData, type AnesthesiaPrefill, type AnesthesiaSheet } from '../lib/anesthesia'
import { preEvalIntoSheet, type PreEval } from '../lib/preanesthesia'
import { dateToDisplay } from '../lib/dateInput'
import { dmy, dmyTime } from '../lib/format'
import { anesthesiaNoteLink } from '../components/AnesthesiaSheet'
import type { Addendum } from '../lib/types'
import '../components/anesthesia.css'

/**
 * PQ3 (ronda 14) y PQ4 (ronda 16): el registro de anestesia en el formato de la «Hoja única» del PNG, con la plantilla de IM1
 * (encabezado de la clínica, cuadrícula del paciente, firmas sin raya). Una hoja Carta: el monitoreo se dibuja en la cuadrícula
 * de 0 a 120 minutos; si la anestesia dura más, se agrega una hoja de continuación solo con la cuadrícula y las filas de
 * monitoreo. En blanco (para llenarlo a mano en sala, con los datos que ya hay) o con lo que se llenó en el sistema.
 * La valoración preanestésica: la vigente de la estancia resumida (PQ4) o, en las hojas de PQ3, la que trae adentro.
 */

/** Margen de la hoja única: el formato del PNG aprovecha la hoja Carta (la plantilla general usa 2 cm). */
const ONE_PAGE_MARGIN_CM = 0.9

/** Cuántas cuadrículas de 120 minutos hacen falta para los registros. */
const gridChunks = (d: Pick<AnesthesiaData, 'monitoring' | 'times'>) => Math.max(1, ...gridPoints(d).points.map((p) => Math.floor(p.min / ANESTHESIA_GRID.minutes) + 1))

/** La cuadrícula del PNG con los registros: PAS ∨, PAD ∧, FC •, SpO₂ ○; inicio de anestesia × e inicio de cirugía ⊙. */
function MonitorGrid({ d, chunk }: { d: AnesthesiaData; chunk: number }) {
  const { start, points, marks } = gridPoints(d)
  const W = 1000; const L = 112; const R = 6; const T = 22; const H = 160; const bandH = 12.5
  const cols = ANESTHESIA_GRID.minutes / ANESTHESIA_GRID.step
  const cw = (W - L - R) / cols
  const y = (v: number) => T + H - (Math.max(0, Math.min(ANESTHESIA_GRID.max, v)) / ANESTHESIA_GRID.max) * H
  const bands = ANESTHESIA_SHEET.bands
  const bottom = T + H + 4 + bands.length * bandH
  const from = chunk * ANESTHESIA_GRID.minutes
  const x = (min: number) => L + ((min - from) / ANESTHESIA_GRID.step) * cw
  const here = points.filter((p) => p.min >= from && p.min <= from + ANESTHESIA_GRID.minutes)
  const col = (min: number) => Math.min(cols - 1, Math.floor((min - from) / ANESTHESIA_GRID.step))
  const band = (k: 'spo2' | 'etco2' | 'temp') => here.filter((p) => p[k].trim()).map((p) => ({ i: col(p.min), v: p[k].trim() }))
  const bandVals: Record<string, { i: number; v: string }[]> = { 'SpO₂ %': band('spo2'), 'EtCO₂': band('etco2'), 'Temperatura °C': band('temp') }
  const value = (s: string) => { const v = Number(s.replace(',', '.')); return s.trim() && Number.isFinite(v) ? v : undefined }
  const short = (b: string) => b.replace('Sevoflurano / Isoflurano %', 'Sevo/Iso %').replace('Temperatura °C', 'Temp °C')
  return (
    <svg className="anes-grid" viewBox={`0 0 ${W} ${bottom + 1}`} role="img" aria-label={`Cuadrícula del monitoreo, minutos ${from} a ${from + ANESTHESIA_GRID.minutes}`}>
      {/* Columnas cada 5 minutos; más marcadas cada 15 */}
      {Array.from({ length: cols + 1 }, (_, i) => <line key={`v${i}`} x1={L + i * cw} x2={L + i * cw} y1={i % 3 === 0 ? 4 : T} y2={bottom} stroke={i % 3 === 0 ? '#7d8a97' : '#d3d9df'} strokeWidth={i % 3 === 0 ? 1.2 : 0.6} />)}
      {Array.from({ length: ANESTHESIA_GRID.max / ANESTHESIA_GRID.lines + 1 }, (_, i) => { const v = i * ANESTHESIA_GRID.lines; return <g key={`h${i}`}>
        <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={v % 100 === 0 ? '#9aa5b0' : '#dde2e7'} strokeWidth={v % 100 === 0 ? 0.9 : 0.6} />
        <text x={L - 6} y={y(v) + 4} fontSize="11" textAnchor="end" fill="#333">{v}</text></g> })}
      {Array.from({ length: cols / 3 }, (_, i) => { const m = from + i * 15; return <g key={`t${i}`}>
        <text x={L + i * 3 * cw + 4} y={15} fontSize="12" fill="#222">{m}′</text>
        {start != null && <text x={L + i * 3 * cw + 4 + (m >= 100 ? 34 : 26)} y={15} fontSize="10" fill="#666">{hhmm(start + m)}</text>}</g> })}
      {/* Inicio de anestesia (×) e inicio de cirugía (⊙) */}
      {([['anesthesiaStart', '×'], ['surgeryStart', '⊙']] as const).map(([k, sym]) => { const m = marks[k]; if (m == null || m < from || m > from + ANESTHESIA_GRID.minutes) return null
        return <g key={k}><line x1={x(m)} x2={x(m)} y1={T} y2={T + H} stroke="#1d2b36" strokeDasharray="4 3" strokeWidth={1} /><text x={x(m)} y={T + 13} fontSize="15" fontWeight="700" textAnchor="middle">{sym}</text></g> })}
      {(['sys', 'dia', 'hr', 'spo2'] as const).map((k) => { const pts = here.map((p) => ({ x: x(p.min), v: value(p[k]) })).filter((p) => p.v != null)
        return <g key={k}>
          {pts.length > 1 && <polyline points={pts.map((p) => `${p.x},${y(p.v!)}`).join(' ')} fill="none" stroke={k === 'hr' ? '#555' : '#1d2b36'} strokeWidth={0.8} strokeDasharray={k === 'spo2' ? '2 2' : undefined} />}
          {pts.map((p, i) => k === 'sys' ? <path key={i} d={`M${p.x - 5},${y(p.v!) - 6} L${p.x},${y(p.v!)} L${p.x + 5},${y(p.v!) - 6}`} fill="none" stroke="#000" strokeWidth={1.6} />
            : k === 'dia' ? <path key={i} d={`M${p.x - 5},${y(p.v!) + 6} L${p.x},${y(p.v!)} L${p.x + 5},${y(p.v!) + 6}`} fill="none" stroke="#000" strokeWidth={1.6} />
            : k === 'hr' ? <circle key={i} cx={p.x} cy={y(p.v!)} r={3.4} fill="#000" />
            : <circle key={i} cx={p.x} cy={y(p.v!)} r={3.6} fill="#fff" stroke="#000" strokeWidth={1.2} />)}
        </g> })}
      {/* Filas de monitoreo: SpO₂, EtCO₂ y temperatura salen de la tabla; lo demás se escribe a mano */}
      {bands.map((b, i) => { const by = T + H + 4 + i * bandH; return <g key={b}>
        <line x1={0} x2={W - R} y1={by} y2={by} stroke="#9aa5b0" strokeWidth={0.8} />
        <text x={2} y={by + 10} fontSize="10" fill="#222">{short(b)}</text>
        {(bandVals[b] ?? []).map((v, j) => <text key={j} x={L + v.i * cw + cw / 2} y={by + 10} fontSize={v.v.length > 3 ? 8 : 9.5} textAnchor="middle" fill="#000">{v.v}</text>)}
      </g> })}
      <line x1={0} x2={W - R} y1={bottom} y2={bottom} stroke="#9aa5b0" strokeWidth={0.8} />
      <rect x={L} y={T} width={W - L - R} height={bottom - T} fill="none" stroke="#7d8a97" strokeWidth={1.2} />
    </svg>
  )
}
const LEGEND = <><span>∨ PAS</span><span>∧ PAD</span><span>• FC</span><span>○ SpO₂</span><span>× Anestesia</span><span>⊙ Cirugía</span></>

/** La valoración preanestésica dentro del registro: los datos (de la valoración vigente, o los de la hoja de PQ3) o el enlace a la de papel. */
function PreEvalSection({ d, preEval }: { d: AnesthesiaData; preEval?: PreEval | null }) {
  const paper = preEval?.mode === 'upload'
  const from = preEval ? `${paper ? 'En papel' : 'Valoración'} del ${dmyTime(preEval.createdAt)} · ${preEval.signer?.name ?? preEval.performedBy.name}` : undefined
  return (
    <Sec title="Valoración preanestésica" extra={from}>
      {paper ? <p className="anes-note">La valoración preanestésica está en papel en el expediente (Anexos). {preEval!.observation ?? ''}</p> : <>
        <div className="anes-f"><i>ASA:</i>{ANESTHESIA_SHEET.asa.map((x) => <Box key={x} on={d.asa === x}>{x}</Box>)}<Box on={d.asaE}>E</Box>
          <i className="anes-gap">VAD:</i><Box on={d.difficultAirway === 'Sí'}>Sí</Box><Box on={d.difficultAirway === 'No'}>No</Box></div>
        <div className="anes-f"><i>Mallampati:</i>{ANESTHESIA_SHEET.mallampati.map((x) => <Box key={x} on={d.mallampati === x}>{x}</Box>)}
          <i className="anes-gap">Ayuno sól./líq. (h):</i>{d.fastingSolids || d.fastingLiquids ? <b>{d.fastingSolids || '—'} / {d.fastingLiquids || '—'}</b> : <Blank />}</div>
        <F label="Alergias" value={d.allergies} long />
        <F label="Antecedentes / medicación" value={d.history} long />
        <div className="anes-labs">
          <F label="Hb" value={d.labs.hb} /><F label="Hto" value={d.labs.hto} /><F label="Plaq" value={d.labs.plt} />
          <F label="TP/INR" value={d.labs.inr} /><F label="Gluc" value={d.labs.glucose} /><F label="Tipo Rh" value={d.labs.bloodType} />
        </div>
      </>}
    </Sec>
  )
}

export function AnesthesiaDocument({ prefill, data, sheet, addenda = [], preEval }: { prefill: AnesthesiaPrefill; data?: AnesthesiaData; sheet?: AnesthesiaSheet; addenda?: Addendum[]; preEval?: PreEval | null }) {
  const { settings, staffById } = useStore()
  const blank = !data
  const d: AnesthesiaData = data ?? (() => {
    const x = prefillAnesthesia(prefill)
    const base = { ...blankAnesthesia(), weightKg: x.weightKg, heightCm: x.heightCm, preDiagnosis: x.preDiagnosis, proposedSurgery: x.proposedSurgery, allergies: x.allergies, scheduled: x.scheduled }
    // Con una valoración vigente, la hoja en blanco ya la trae resumida
    return preEval?.data ? { ...base, ...preEvalIntoSheet(preEval.data), weightKg: preEval.data.weightKg || base.weightKg, heightCm: preEval.data.heightCm || base.heightCm } : base
  })()
  const has = (list: readonly string[], v: string) => list.includes(v)
  const bal = fluidBalance(d.fluids)
  const ald = aldreteTotal(d.aldrete)
  const p = prefill.patient
  const signer: DocSigner = sheet?.signer
    ? { label: 'Firma y sello del anestesiólogo', name: sheet.signer.name, title: sheet.signer.title, license: sheet.signer.license, signatureId: sheet.signer.signatureId, stampId: sheet.signer.stampId, small: true }
    : { label: 'Firma y sello del anestesiólogo', name: d.anesthesiologist || 'Nombre: ______________________', title: 'Colegiado: ____________', small: true }
  const minDrugs = ANESTHESIA_SHEET.drugCategories.length
  const drugs = blank || !d.drugs.length ? ANESTHESIA_SHEET.drugCategories.map((c) => ({ id: c, category: c, drug: '', dose: '', route: '', time: '' }))
    : [...d.drugs, ...Array.from({ length: Math.max(0, minDrugs - d.drugs.length) }, (_, i) => ({ id: `e${i}`, category: '', drug: '', dose: '', route: '', time: '' }))]
  const chunks = blank ? 1 : gridChunks(d)
  const docPatient = { ...patientOf({ firstName: p.firstName, lastName: p.lastName, record: p.record, dni: p.dni, birthDate: p.birthDate ?? '', sex: (p.sex ?? '') as 'F' | 'M' }, settings),
    third: { label: 'Fecha', value: d.date ? dateToDisplay(d.date) : '___/___/______' } }
  const folio = sheet ? sheet.id.slice(0, 8).toUpperCase() : undefined
  const stamp = sheet?.voidedAt ? 'ANULADA' : undefined
  const modeLine = sheet ? `${sheet.mode === 'system' ? 'Llenado y firmado en el sistema' : 'Subido'} el ${dmyTime(sheet.createdAt)}${sheet.version > 1 ? ` · versión ${sheet.version}` : ''}` : 'Hoja en blanco para llenar a mano en sala'
  const extra = chunks > 1 || addenda.length > 0
  return (<>
    <ClinicalDoc kind="Registro de anestesia" at={sheet?.createdAt} folio={folio} folioNote={blank ? 'Para llenar a mano en sala' : chunks > 1 ? 'Con hoja de continuación' : undefined}
      place={placeOf(settings)} className="anes-doc anes-one" stamp={stamp} marginCm={ONE_PAGE_MARGIN_CM} patient={docPatient}
      rows={[guardianRow({ dni: p.dni, birthDate: p.birthDate ?? '', guardianName: p.guardianName, guardianDni: p.guardianDni, guardianRelation: p.guardianRelation })]}
      signers={[signer, { label: 'Instrumentista', name: d.scrubNurse || 'Nombre: ________________', small: true }, { label: 'Circulante', name: d.circulatingNurse || 'Nombre: ________________', small: true }]}
      legends={[ANESTHESIA_SOURCES, `${modeLine}. Sin la firma y el sello del anestesiólogo en papel no vale.`]}>
      <Sec title="Paciente y equipo quirúrgico" className="anes-team">
        <F label="Sala" value={d.room} /><F label="Peso" value={d.weightKg} unit="kg" /><F label="Talla" value={d.heightCm} unit="cm" />
        <div className="anes-f">{ANESTHESIA_SHEET.scheduled.map((x) => <Box key={x} on={d.scheduled === x}>{x}</Box>)}</div>
        <F label="Dx preoperatorio" value={d.preDiagnosis} wide2 long /><F label="Cirugía propuesta" value={d.proposedSurgery} wide2 long />
        <F label="Cirujano" value={d.surgeon} /><F label="1.er ayudante" value={d.assistant1} /><F label="2.º ayudante" value={d.assistant2} /><F label="Anestesiólogo" value={d.anesthesiologist} />
      </Sec>
      <div className="anes-cols anes-cols--pre">
        <PreEvalSection d={d} preEval={preEval} />
        <Sec title="Verificación y técnica">
          <div className="anes-f"><i>Lista OMS:</i>{ANESTHESIA_SHEET.who.map((x) => <Box key={x} on={has(d.who, x)}>{x}</Box>)}</div>
          <div className="anes-f">{ANESTHESIA_SHEET.checks.map((x) => <Box key={x} on={has(d.checks, x)}>{x}</Box>)}</div>
          <div className="anes-f"><i>Técnica:</i>{ANESTHESIA_SHEET.techniques.map((x) => <Box key={x} on={has(d.techniques, x)}>{x}</Box>)}</div>
        </Sec>
      </div>
      <section className="anes-sec anes-times">{ANESTHESIA_SHEET.times.map((t) => <F key={t.key} label={t.label} value={d.times[t.key]} />)}</section>
      <Sec title="Monitoreo transanestésico (cada 5 min)" extra={LEGEND} className="anes-monitor"><MonitorGrid d={d} chunk={0} /></Sec>
      <div className="anes-cols anes-cols--drugs">
        <Sec title="Fármacos">
          <table className="anes-tbl"><thead><tr><th>Categoría</th><th>Fármaco</th><th>Dosis</th><th>Vía</th><th>Hora</th></tr></thead>
            <tbody>{drugs.map((x) => <tr key={x.id}><td>{x.category}</td><td>{x.drug}</td><td>{x.dose}</td><td>{x.route}</td><td>{x.time}</td></tr>)}</tbody></table>
          <F label="Mantenimiento (agente / CAM o TIVA, ritmo)" value={d.maintenance} long />
        </Sec>
        <div className="anes-stack">
          <Sec title="Vía aérea y ventilación">
            <div className="anes-f">{ANESTHESIA_SHEET.airway.map((x) => <Box key={x} on={has(d.airway, x)}>{x}</Box>)}<i>N.º:</i>{d.tubeSize ? <b>{d.tubeSize}</b> : <Blank />}</div>
            <div className="anes-f"><i>Cormack:</i>{ANESTHESIA_SHEET.cormack.map((x) => <Box key={x} on={d.cormack === x}>{x}</Box>)}<i>Intentos:</i>{d.attempts ? <b>{d.attempts}</b> : <Blank />} <Box on={d.etco2Confirms}>EtCO₂ confirma</Box></div>
            <div className="anes-f">{ANESTHESIA_SHEET.ventilation.map((x) => <Box key={x} on={d.ventilation === x}>{x}</Box>)}
              <i>VT</i>{d.vt ? <b>{d.vt}</b> : <Blank />} <i>FR</i>{d.rr ? <b>{d.rr}</b> : <Blank />} <i>PEEP</i>{d.peep ? <b>{d.peep}</b> : <Blank />}</div>
          </Sec>
          <Sec title="Regional · monitoreo y accesos">
            <div className="anes-row2"><F label="Nivel / aguja" value={d.regionalLevel} /><F label="Fármaco / vol." value={d.regionalDrug} /></div>
            <div className="anes-f">{ANESTHESIA_SHEET.monitors.map((x) => <Box key={x} on={has(d.monitors, x)}>{x}</Box>)}</div>
            <div className="anes-row2"><F label="Vías IV (G / sitio)" value={d.ivLines} /><F label="Posición" value={d.position} /></div>
          </Sec>
        </div>
      </div>
      <div className="anes-cols anes-cols--end">
        <Sec title="Balance de líquidos (mL)">
          <div className="anes-row2"><b className="anes-sub">Ingresos</b><F label="Cristaloides" value={d.fluids.crystalloids} /></div>
          <F label="Coloides / hemoderivados" value={d.fluids.colloids} />
          <div className="anes-row2"><b className="anes-sub">Egresos</b><F label="Sangrado" value={d.fluids.bleeding} /></div>
          <F label="Diuresis / otros" value={d.fluids.diuresis} />
          <F label="Balance" value={bal.any ? `${bal.inflow} − ${bal.outflow} = ${signed(bal.balance)} mL` : ''} />
        </Sec>
        <Sec title="Operación practicada · incidentes">
          <F label="Operación practicada" value={d.operation} long />
          <F label="Incidentes / eventos" value={d.incidents} area={!d.incidents} lines={2} />
          <div className="anes-f"><Box on={d.extubated}>Extubado en sala</Box><Box on={d.tof09}>TOF ≥ 0.9</Box></div>
          <div className="anes-f"><i>Destino:</i>{ANESTHESIA_SHEET.destinations.map((x) => <Box key={x} on={d.destination === x}>{x}</Box>)}</div>
        </Sec>
        <Sec title="Condición al egreso">
          <div className="anes-exit"><F label="PA" value={d.exit.bp} /><F label="FC" value={d.exit.hr} /><F label="FR" value={d.exit.rr} /><F label="SpO₂" value={d.exit.spo2} unit={d.exit.spo2 ? '%' : undefined} /></div>
          <table className="anes-tbl anes-tbl--aldrete"><thead><tr>{ANESTHESIA_SHEET.aldrete.map((a) => <th key={a.key}>{a.label.slice(0, 5)}.</th>)}<th>Aldrete</th></tr></thead>
            <tbody><tr>{ANESTHESIA_SHEET.aldrete.map((a) => <td key={a.key}>{d.aldrete[a.key]}</td>)}<td><b>{ald.any ? `${ald.total}/10` : ''}</b></td></tr></tbody></table>
        </Sec>
      </div>
    </ClinicalDoc>
    {/* Hoja de continuación: solo la cuadrícula y las filas de monitoreo (y las adendas, si hay) */}
    {extra && <ClinicalDoc kind="Registro de anestesia · continuación" at={sheet?.createdAt} folio={folio} place={placeOf(settings)} className="anes-doc anes-one anes-cont" stamp={stamp}
      marginCm={ONE_PAGE_MARGIN_CM} patient={docPatient} legends={[ANESTHESIA_SOURCES, modeLine]}>
      {Array.from({ length: chunks - 1 }, (_, i) => <Sec key={i} title={`Monitoreo transanestésico (cada 5 min) · continuación, minutos ${(i + 1) * ANESTHESIA_GRID.minutes} a ${(i + 2) * ANESTHESIA_GRID.minutes}`} extra={LEGEND} className="anes-monitor">
        <MonitorGrid d={d} chunk={i + 1} /></Sec>)}
      {addenda.length > 0 && <Sec title="Adendas"><div className="anes-addenda">{addenda.map((a) => <p key={a.id}><b>{dmyTime(a.at)} · {staffById(a.authorId)?.name}:</b> {a.corrects ? `Se corrige: ${a.corrects}. ` : ''}{a.text}</p>)}</div></Sec>}
    </ClinicalDoc>}
  </>)
}

/** «En el expediente» (Expediente completo): los registros de anestesia de la estancia; los anulados, en una línea. */
export function AnesthesiaRecord({ stayId }: { stayId: string }) {
  const { staffById } = useStore()
  const [list, setList] = useState<{ sheet: AnesthesiaSheet; prefill?: AnesthesiaPrefill; preEval?: PreEval | null }[] | null>(null)
  useEffect(() => {
    api<AnesthesiaSheet[]>(`/inpatient/${stayId}/anesthesia`).then(async (all) => setList(await Promise.all(all.map(async (s) => {
      if (s.mode !== 'system' || s.voidedAt) return { sheet: s }
      const r = await api<{ prefill: AnesthesiaPrefill; preEval: PreEval | null }>(`/anesthesia/sheets/${s.id}`).catch(() => null)
      return { sheet: s, prefill: r?.prefill, preEval: r?.preEval }
    })))).catch(() => setList([]))
  }, [stayId])
  if (!list?.length) return null
  return <>
    <h2 className="fr-h">Registros de anestesia</h2>
    {list.map(({ sheet: s, prefill, preEval }) => <div key={s.id} className="fr-lab">
      <b>{s.procedure ?? 'Nota postquirúrgica'}</b> · {s.mode === 'system' ? `firmado por ${s.signer?.name ?? s.performedBy.name}` : `subido por ${staffById(s.createdBy)?.name ?? '—'} (anestesia de ${s.performedBy.name})`} {dmyTime(s.createdAt)}
      {s.voidedAt ? <p className="muted">Anulado {dmyTime(s.voidedAt)}: {s.voidReason}</p>
        : s.mode === 'system' && s.data && prefill ? <AnesthesiaDocument prefill={prefill} data={s.data} sheet={s} preEval={preEval} />
        : s.fileId ? <PdfPages fileId={s.fileId} label="El registro de anestesia" /> : null}
    </div>)}
  </>
}

/** «Imprimir registro de anestesia en blanco»: desde la autorización quirúrgica, la tarjeta de la nota o Anexos. Una hoja. */
export function AnesthesiaBlankPage() {
  const { stayId } = useParams()
  const [params] = useSearchParams()
  const [x, setX] = useState<{ prefill: AnesthesiaPrefill; stayKind: string; preEval?: PreEval | null } | null>(null)
  const [error, setError] = useState('')
  const auth = params.get('autorizacion')
  useEffect(() => { api<{ prefill: AnesthesiaPrefill; stayKind: string; preEval?: PreEval | null }>(`/inpatient/${stayId}/anesthesia/blank${auth ? `?autorizacion=${auth}` : ''}`).then(setX).catch((e: Error) => setError(e.message)) }, [stayId, auth])
  useAutoPrint(!!x)
  if (error) return <DocError title="No se puede abrir la hoja." error={error} />
  if (!x) return <Loading label="Preparando la hoja" />
  return <div className="page"><PrintBar title="Registro de anestesia en blanco" />
    {x.preEval && <p className="muted no-print">Trae resumida la valoración preanestésica vigente ({x.preEval.mode === 'upload' ? 'en papel' : 'del sistema'}, {dmy(x.preEval.createdAt)}).</p>}
    <AnesthesiaDocument prefill={x.prefill} preEval={x.preEval} /></div>
}

/** «Ver» e «Imprimir» de un registro: el llenado en el sistema con la plantilla; el subido, sus páginas (foto o PDF). */
export default function AnesthesiaSheetPage() {
  const { id } = useParams()
  const { staffById } = useStore()
  const [x, setX] = useState<{ sheet: AnesthesiaSheet; stayKind: string; prefill: AnesthesiaPrefill; preEval?: PreEval | null } | null>(null)
  const [addenda, setAddenda] = useState<Addendum[]>([])
  const [error, setError] = useState('')
  const [pagesReady, setPagesReady] = useState(false)
  useEffect(() => {
    api<{ sheet: AnesthesiaSheet; stayKind: string; prefill: AnesthesiaPrefill; preEval?: PreEval | null }>(`/anesthesia/sheets/${id}`).then(async (r) => {
      setX(r)
      if (r.sheet.mode === 'system') setAddenda(await api<Addendum[]>(`/addenda?ids=${r.sheet.id}`).catch(() => []))
    }).catch((e: Error) => setError(e.message))
  }, [id])
  useAutoPrint(!!x && (x.sheet.mode === 'system' || pagesReady))
  if (error) return <DocError title="No se puede abrir el registro." error={error} />
  if (!x) return <Loading label="Abriendo el registro de anestesia" />
  const s = x.sheet
  const back = <div className="page-head__actions">
    {x.preEval && <Link className="btn btn--ghost" to={`/app/valoracion/${x.preEval.id}`}>Ver valoración</Link>}
    <Link className="btn btn--ghost" to={anesthesiaNoteLink(x.stayKind, s.hospitalizationId, s.noteId)}>Ir a la nota</Link></div>
  return (
    <div className="page">
      <PrintBar title={`Registro de anestesia${s.voidedAt ? ' (anulado)' : ''}`}>{back}</PrintBar>
      {s.voidedAt && <p className="alert-strip alert-strip--amber no-print">Anulado el {dmyTime(s.voidedAt)} por {staffById(s.voidedBy ?? '')?.name ?? '—'}: {s.voidReason}</p>}
      {s.mode === 'system' && s.data
        ? <AnesthesiaDocument prefill={x.prefill} data={s.data} sheet={s} addenda={addenda} preEval={x.preEval} />
        : <>
          <p className="muted no-print">Subido por {staffById(s.createdBy)?.name ?? '—'}, {dmyTime(s.createdAt)} · Anestesia realizada por {s.performedBy.name}{s.observation ? ` · ${s.observation}` : ''}</p>
          {s.fileId && <div className="signed-doc"><PdfPages fileId={s.fileId} label="El registro de anestesia" onReady={() => setPagesReady(true)} /></div>}
        </>}
    </div>
  )
}
