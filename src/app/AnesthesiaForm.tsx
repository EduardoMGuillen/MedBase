import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { FileSignature, Plus, Trash2 } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { BackButton, Loading, PageHead } from '../components/ui'
import { DraftBadge } from '../components/Addenda'
import { CorrectionReason } from '../components/Grace'
import { DateField, TimeField } from '../components/DateTimeField'
import { useDraftSync } from '../lib/drafts'
import { ANESTHESIA_SHEET } from '../lib/clinicalConfig'
import { aldreteTotal, blankAnesthesia, fluidBalance, prefillAnesthesia, sameAs, signed, type AnesthesiaData, type AnesthesiaPrefill, type AnesthesiaSheet, type DrugRow, type MonitorRow } from '../lib/anesthesia'
import { anesthesiaNoteLink } from '../components/AnesthesiaSheet'
import { PreEvalSummary } from '../components/PreEval'
import { preEvalIntoSheet, type PreEval } from '../lib/preanesthesia'
import { DrugSearch } from '../components/DrugSearch'
import { useVademecum } from '../lib/vademecum'
import '../components/anesthesia.css'

/**
 * PQ3 (ronda 14): «Llenar en el sistema». El formulario del Anexo B con lo que ya existe precargado (paciente, alergias,
 * diagnóstico, cirugía, equipo quirúrgico y horas de la nota postquirúrgica). Borrador «Se guarda solo» (sobrevive a salir y
 * volver). Solo lo firma el anestesiólogo de la nota (el servidor lo comprueba, también por URL directa). Con `?corregir=`,
 * la corrección en el periodo de gracia (GE4).
 */
const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`)

export function Radio({ label, options, value, onChange }: { label: string; options: readonly string[]; value: string; onChange: (v: string) => void }) {
  return <div className="anes-group" role="radiogroup" aria-label={label}><span>{label}</span><div className="anes-opts">
    {options.map((o) => <label key={o} className="anes-opt"><input type="radio" checked={value === o} onChange={() => onChange(o)} onClick={() => { if (value === o) onChange('') }} />{o}</label>)}</div></div>
}
export function Checks({ label, options, value, onChange }: { label: string; options: readonly string[]; value: string[]; onChange: (v: string[]) => void }) {
  return <div className="anes-group" role="group" aria-label={label}><span>{label}</span><div className="anes-opts">
    {options.map((o) => <label key={o} className="anes-opt"><input type="checkbox" checked={value.includes(o)} onChange={(e) => onChange(e.target.checked ? [...value, o] : value.filter((x) => x !== o))} />{o}</label>)}</div></div>
}
export function Txt({ label, value, onChange, num, wide, area, placeholder }: { label: string; value: string; onChange: (v: string) => void; num?: boolean; wide?: boolean; area?: boolean; placeholder?: string }) {
  return <label className={`field${wide ? ' span-2' : ''}`}><span>{label}</span>
    {area ? <textarea className="textarea textarea--sm" rows={2} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      : <input className={`input${num ? ' num' : ''}`} inputMode={num ? 'decimal' : undefined} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />}</label>
}
export const Box = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) =>
  <label className="anes-opt"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />{label}</label>
export const Section = ({ title, children }: { title: string; children: ReactNode }) =>
  <section className="panel"><div className="panel__head"><h2>{title}</h2></div><div className="panel__body">{children}</div></section>

export default function AnesthesiaFormPage() {
  const { noteId } = useParams()
  const [params] = useSearchParams()
  const correcting = params.get('corregir')
  const nav = useNavigate()
  const { notify, user } = useStore()
  const [ctx, setCtx] = useState<{ prefill: AnesthesiaPrefill; hospitalizationId: string; stayKind: string; sheet?: AnesthesiaSheet; preEval?: PreEval | null } | null>(null)
  const [error, setError] = useState('')
  const [d, setD] = useState<AnesthesiaData>(blankAnesthesia)
  const [initial, setInitial] = useState<AnesthesiaData | null>(null)
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const vademecum = useVademecum()
  useEffect(() => {
    type Ctx = { prefill: AnesthesiaPrefill; hospitalizationId: string; stayKind: string; sheet?: AnesthesiaSheet; preEval?: PreEval | null }
    const load: Promise<Ctx> = correcting
      ? api<{ sheet: AnesthesiaSheet; stayKind: string; prefill: AnesthesiaPrefill; preEval?: PreEval | null }>(`/anesthesia/sheets/${correcting}`).then((r) => ({ prefill: r.prefill, hospitalizationId: r.sheet.hospitalizationId, stayKind: r.stayKind, sheet: r.sheet, preEval: r.preEval }))
      : api<{ prefill: AnesthesiaPrefill; hospitalizationId: string; stayKind: string; preEval?: PreEval | null }>(`/anesthesia/notes/${noteId}/prefill`)
    load.then((r) => {
      // PQ4 (ronda 16): con una valoración preanestésica vigente, su resumen va de solo lectura (sus datos se copian al firmar)
      const base = r.sheet?.data ?? prefillAnesthesia(r.prefill)
      const start = r.preEval?.data ? { ...base, ...preEvalIntoSheet(r.preEval.data), weightKg: base.weightKg || r.preEval.data.weightKg, heightCm: base.heightCm || r.preEval.data.heightCm } : base
      setInitial(start)
      setD((cur) => (sameAs(cur, blankAnesthesia()) ? start : cur))
      setCtx(r)
    }).catch((e: Error) => setError(e.message))
  }, [noteId, correcting])
  const draft = useDraftSync('anestesia', ctx ? (correcting ? `${noteId}:corregir:${correcting}` : noteId) : undefined, { d }, (x) => { if (x.d) setD({ ...blankAnesthesia(), ...x.d }) }, !initial || sameAs(d, initial))
  if (error) return <div className="page"><section className="panel"><div className="empty"><b>No puedes llenar este registro.</b> {error} <Link to="/app">Volver al inicio</Link></div></section></div>
  if (!ctx || !user) return <Loading label="Abriendo el registro de anestesia" />
  const set = (patch: Partial<AnesthesiaData>) => setD((x) => ({ ...x, ...patch }))
  const setIn = <K extends 'labs' | 'times' | 'fluids' | 'exit' | 'aldrete'>(k: K, patch: Partial<AnesthesiaData[K]>) => setD((x) => ({ ...x, [k]: { ...x[k], ...patch } }))
  const setRow = (i: number, patch: Partial<MonitorRow>) => setD((x) => ({ ...x, monitoring: x.monitoring.map((r, j) => (j === i ? { ...r, ...patch } : r)) }))
  const setDrug = (i: number, patch: Partial<DrugRow>) => setD((x) => ({ ...x, drugs: x.drugs.map((r, j) => (j === i ? { ...r, ...patch } : r)) }))
  const bal = fluidBalance(d.fluids)
  const ald = aldreteTotal(d.aldrete)
  const p = ctx.prefill.patient
  const back = anesthesiaNoteLink(ctx.stayKind, ctx.hospitalizationId, noteId ?? '')
  const ready = d.techniques.length > 0 && !busy
  const submit = async () => {
    if (!ready) return
    setBusy(true)
    try {
      if (correcting && ctx.sheet) await api(`/anesthesia/sheets/${correcting}/correct`, { body: { data: d, version: ctx.sheet.version, why: why.trim() || undefined } })
      else await api(`/anesthesia/notes/${noteId}/sign`, { body: { data: d, preEvalId: ctx.preEval?.id } })
      draft.clear()
      notify(correcting ? 'Registro de anestesia corregido' : 'Registro de anestesia firmado')
      nav(back)
    } catch (e) {
      notify((e as Error).message, 'error')
      setBusy(false)
    }
  }
  const lastTime = d.monitoring.at(-1)?.time
  const nextTime = (() => { const m = /^(\d{2}):(\d{2})$/.exec(lastTime ?? ''); if (!m) return d.times.anesthesiaStart || ''; const t = (Number(m[1]) * 60 + Number(m[2]) + 5) % 1440; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}` })()
  return (
    <div className="page">
      <PageHead back={<BackButton to={back}>Volver a la nota</BackButton>}
        title={correcting ? 'Corregir el registro de anestesia' : 'Registro de anestesia'}
        sub={`${`${p.firstName} ${p.lastName}`.trim()} · Expediente ${p.record} · ${d.operation || d.proposedSurgery}`} />
      <div className="anes-form">
        <p className="muted" style={{ margin: 0 }}>Se guarda solo mientras escribes. Ningún campo es obligatorio salvo la técnica; «Anestesia realizada por» eres tú, con tu nombre, especialidad y colegiado al firmar.</p>
        <Section title="Encabezado, paciente y equipo quirúrgico">
          <div className="form-grid form-grid--4">
            <label className="field"><span>Fecha</span><DateField value={d.date} onChange={(v) => set({ date: v })} label="Fecha" /></label>
            <Txt label="Sala" value={d.room} onChange={(v) => set({ room: v })} />
            <Txt label="Peso (kg)" value={d.weightKg} onChange={(v) => set({ weightKg: v })} num />
            <Txt label="Talla (cm)" value={d.heightCm} onChange={(v) => set({ heightCm: v })} num />
          </div>
          <Radio label="Programada / Urgencia" options={ANESTHESIA_SHEET.scheduled} value={d.scheduled} onChange={(v) => set({ scheduled: v })} />
          <div className="form-grid">
            <Txt label="Diagnóstico preoperatorio" value={d.preDiagnosis} onChange={(v) => set({ preDiagnosis: v })} />
            <Txt label="Cirugía propuesta" value={d.proposedSurgery} onChange={(v) => set({ proposedSurgery: v })} />
            <Txt label="Cirujano" value={d.surgeon} onChange={(v) => set({ surgeon: v })} />
            <Txt label="1.er ayudante" value={d.assistant1} onChange={(v) => set({ assistant1: v })} />
            <Txt label="2.º ayudante" value={d.assistant2} onChange={(v) => set({ assistant2: v })} />
            <Txt label="Anestesiólogo" value={d.anesthesiologist} onChange={(v) => set({ anesthesiologist: v })} />
          </div>
        </Section>
        {ctx.preEval ? <Section title="Valoración preanestésica">
          <PreEvalSummary pe={ctx.preEval} />
        </Section> : <Section title="Valoración preanestésica">
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>Esta estancia no tiene valoración preanestésica: llénala aquí.</p>
          <div className="anes-group"><span>ASA</span><div className="anes-opts">
            {ANESTHESIA_SHEET.asa.map((o) => <label key={o} className="anes-opt"><input type="radio" name="asa" checked={d.asa === o} onChange={() => set({ asa: o })} />{o}</label>)}
            <Box label="E (urgencia)" checked={d.asaE} onChange={(v) => set({ asaE: v })} /></div></div>
          <Radio label="Mallampati" options={ANESTHESIA_SHEET.mallampati} value={d.mallampati} onChange={(v) => set({ mallampati: v })} />
          <Radio label="Vía aérea difícil" options={['Sí', 'No']} value={d.difficultAirway} onChange={(v) => set({ difficultAirway: v })} />
          <div className="form-grid form-grid--3">
            <Txt label="Alergias" value={d.allergies} onChange={(v) => set({ allergies: v })} />
            <Txt label="Ayuno sólidos (h)" value={d.fastingSolids} onChange={(v) => set({ fastingSolids: v })} num />
            <Txt label="Ayuno líquidos (h)" value={d.fastingLiquids} onChange={(v) => set({ fastingLiquids: v })} num />
          </div>
          <Txt label="Antecedentes y medicación" value={d.history} onChange={(v) => set({ history: v })} area />
          <div className="form-grid form-grid--3">
            <Txt label="Hb" value={d.labs.hb} onChange={(v) => setIn('labs', { hb: v })} num />
            <Txt label="Hto" value={d.labs.hto} onChange={(v) => setIn('labs', { hto: v })} num />
            <Txt label="Plaquetas" value={d.labs.plt} onChange={(v) => setIn('labs', { plt: v })} num />
            <Txt label="TP/INR" value={d.labs.inr} onChange={(v) => setIn('labs', { inr: v })} />
            <Txt label="Glucosa" value={d.labs.glucose} onChange={(v) => setIn('labs', { glucose: v })} num />
            <Txt label="Tipo y Rh" value={d.labs.bloodType} onChange={(v) => setIn('labs', { bloodType: v })} />
          </div>
        </Section>}
        <Section title="Verificación y técnica">
          <Checks label="Lista OMS" options={ANESTHESIA_SHEET.who} value={d.who} onChange={(v) => set({ who: v })} />
          <Checks label="Verificación" options={ANESTHESIA_SHEET.checks} value={d.checks} onChange={(v) => set({ checks: v })} />
          <Checks label="Técnica (obligatoria)" options={ANESTHESIA_SHEET.techniques} value={d.techniques} onChange={(v) => set({ techniques: v })} />
          {!d.techniques.length && <small className="field__msg field__msg--warn">Marca la técnica anestésica.</small>}
        </Section>
        <Section title="Tiempos">
          <div className="form-grid form-grid--3">
            {ANESTHESIA_SHEET.times.map((t) => <label key={t.key} className="field"><span>{t.label}</span><TimeField value={d.times[t.key]} onChange={(v) => setIn('times', { [t.key]: v })} label={t.label} /></label>)}
          </div>
        </Section>
        <Section title="Monitoreo transanestésico (cada 5 min)">
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>Un registro por toma. Al imprimir se dibujan en la cuadrícula de 0 a 120 minutos desde el inicio de la anestesia; si dura más, sale una hoja de continuación.</p>
          {d.monitoring.length > 0 && <table className="anes-table">
            <thead><tr><th>Hora</th><th>PAS</th><th>PAD</th><th>FC</th><th>SpO₂</th><th>EtCO₂</th><th>Temp. °C</th><th /></tr></thead>
            <tbody>{d.monitoring.map((r, i) => <tr key={r.id}>
              <td data-label="Hora" className="anes-table__wide"><TimeField value={r.time} onChange={(v) => setRow(i, { time: v })} label={`Hora del registro ${i + 1}`} /></td>
              {(['sys', 'dia', 'hr', 'spo2', 'etco2', 'temp'] as const).map((k) => <td key={k} data-label={{ sys: 'PAS', dia: 'PAD', hr: 'FC', spo2: 'SpO₂', etco2: 'EtCO₂', temp: 'Temp. °C' }[k]}>
                <input className="input num" inputMode="decimal" value={r[k]} onChange={(e) => setRow(i, { [k]: e.target.value })} aria-label={`${k.toUpperCase()} del registro ${i + 1}`} /></td>)}
              <td className="anes-table__x"><button type="button" className="btn btn--ghost btn--sm anes-btn" aria-label={`Quitar el registro ${i + 1}`} onClick={() => set({ monitoring: d.monitoring.filter((_, j) => j !== i) })}><Trash2 size={14} /></button></td>
            </tr>)}</tbody></table>}
          <button type="button" className="btn btn--soft btn--sm anes-btn" style={{ justifySelf: 'start' }} onClick={() => set({ monitoring: [...d.monitoring, { id: newId(), time: nextTime, sys: '', dia: '', hr: '', spo2: '', etco2: '', temp: '' }] })}><Plus size={14} />Agregar registro</button>
        </Section>
        <Section title="Fármacos">
          {d.drugs.length > 0 && <table className="anes-table">
            <thead><tr><th>Categoría</th><th>Fármaco</th><th>Dosis</th><th>Vía</th><th>Hora</th><th /></tr></thead>
            <tbody>{d.drugs.map((r, i) => <tr key={r.id}>
              <td data-label="Categoría" className="anes-table__wide"><select className="select" value={r.category} onChange={(e) => setDrug(i, { category: e.target.value })} aria-label={`Categoría del fármaco ${i + 1}`}>
                <option value="">Elige…</option>{ANESTHESIA_SHEET.drugCategories.map((c) => <option key={c}>{c}</option>)}</select></td>
              {/* Pendiente ME8 (ronda 17): antes un campo de texto simple; ahora el buscador del vademécum (sigue aceptando texto libre) */}
              <td data-label="Fármaco" className="anes-table__wide"><DrugSearch value={r.drug} drugs={vademecum} label={null} placeholder="Busca en el vademécum o escríbelo" ariaLabel={`Fármaco ${i + 1}`}
                onChange={(t) => setDrug(i, { drug: t })} onPick={(x) => setDrug(i, { drug: x.name })} /></td>
              <td data-label="Dosis"><input className="input" value={r.dose} onChange={(e) => setDrug(i, { dose: e.target.value })} aria-label={`Dosis del fármaco ${i + 1}`} /></td>
              <td data-label="Vía"><input className="input" value={r.route} onChange={(e) => setDrug(i, { route: e.target.value })} aria-label={`Vía del fármaco ${i + 1}`} /></td>
              <td data-label="Hora" className="anes-table__wide"><TimeField value={r.time} onChange={(v) => setDrug(i, { time: v })} label={`Hora del fármaco ${i + 1}`} /></td>
              <td className="anes-table__x"><button type="button" className="btn btn--ghost btn--sm anes-btn" aria-label={`Quitar el fármaco ${i + 1}`} onClick={() => set({ drugs: d.drugs.filter((_, j) => j !== i) })}><Trash2 size={14} /></button></td>
            </tr>)}</tbody></table>}
          <button type="button" className="btn btn--soft btn--sm anes-btn" style={{ justifySelf: 'start' }} onClick={() => set({ drugs: [...d.drugs, { id: newId(), category: '', drug: '', dose: '', route: '', time: '' }] })}><Plus size={14} />Agregar fármaco</button>
          <Txt label="Mantenimiento (agente, CAM o TIVA con su ritmo)" value={d.maintenance} onChange={(v) => set({ maintenance: v })} />
        </Section>
        <Section title="Vía aérea y ventilación">
          <Checks label="Dispositivo" options={ANESTHESIA_SHEET.airway} value={d.airway} onChange={(v) => set({ airway: v })} />
          <Radio label="Cormack" options={ANESTHESIA_SHEET.cormack} value={d.cormack} onChange={(v) => set({ cormack: v })} />
          <div className="form-grid form-grid--3">
            <Txt label="N.º (tubo)" value={d.tubeSize} onChange={(v) => set({ tubeSize: v })} num />
            <Txt label="Intentos" value={d.attempts} onChange={(v) => set({ attempts: v })} num />
            <div className="anes-group"><span>&nbsp;</span><Box label="EtCO₂ confirma" checked={d.etco2Confirms} onChange={(v) => set({ etco2Confirms: v })} /></div>
          </div>
          <Radio label="Ventilación" options={ANESTHESIA_SHEET.ventilation} value={d.ventilation} onChange={(v) => set({ ventilation: v })} />
          <div className="form-grid form-grid--3">
            <Txt label="VT" value={d.vt} onChange={(v) => set({ vt: v })} num /><Txt label="FR" value={d.rr} onChange={(v) => set({ rr: v })} num /><Txt label="PEEP" value={d.peep} onChange={(v) => set({ peep: v })} num />
          </div>
        </Section>
        <Section title="Regional, monitoreo y accesos">
          <div className="form-grid">
            <Txt label="Nivel / aguja" value={d.regionalLevel} onChange={(v) => set({ regionalLevel: v })} />
            <Txt label="Fármaco / volumen" value={d.regionalDrug} onChange={(v) => set({ regionalDrug: v })} />
          </div>
          <Checks label="Monitoreo" options={ANESTHESIA_SHEET.monitors} value={d.monitors} onChange={(v) => set({ monitors: v })} />
          <div className="form-grid">
            <Txt label="Vías IV (calibre y sitio)" value={d.ivLines} onChange={(v) => set({ ivLines: v })} />
            <Txt label="Posición" value={d.position} onChange={(v) => set({ position: v })} />
          </div>
        </Section>
        <Section title="Balance de líquidos (mL)">
          <div className="form-grid form-grid--4">
            <Txt label="Cristaloides" value={d.fluids.crystalloids} onChange={(v) => setIn('fluids', { crystalloids: v })} num />
            <Txt label="Coloides / hemoderivados" value={d.fluids.colloids} onChange={(v) => setIn('fluids', { colloids: v })} num />
            <Txt label="Sangrado" value={d.fluids.bleeding} onChange={(v) => setIn('fluids', { bleeding: v })} num />
            <Txt label="Diuresis / otros" value={d.fluids.diuresis} onChange={(v) => setIn('fluids', { diuresis: v })} num />
          </div>
          <p className="anes-calc" role="status">Balance (ingresos − egresos): <b>{bal.any ? `${bal.inflow} − ${bal.outflow} = ${signed(bal.balance)} mL` : '—'}</b></p>
        </Section>
        <Section title="Operación practicada e incidentes">
          <Txt label="Operación practicada" value={d.operation} onChange={(v) => set({ operation: v })} />
          <Txt label="Incidentes / eventos" value={d.incidents} onChange={(v) => set({ incidents: v })} area />
          <div className="anes-opts"><Box label="Extubado en sala" checked={d.extubated} onChange={(v) => set({ extubated: v })} /><Box label="TOF ≥ 0.9" checked={d.tof09} onChange={(v) => set({ tof09: v })} /></div>
          <Radio label="Destino" options={ANESTHESIA_SHEET.destinations} value={d.destination} onChange={(v) => set({ destination: v })} />
        </Section>
        <Section title="Condición al egreso de sala">
          <div className="form-grid form-grid--4">
            <Txt label="PA" value={d.exit.bp} onChange={(v) => setIn('exit', { bp: v })} placeholder="120/80" />
            <Txt label="FC" value={d.exit.hr} onChange={(v) => setIn('exit', { hr: v })} num />
            <Txt label="FR" value={d.exit.rr} onChange={(v) => setIn('exit', { rr: v })} num />
            <Txt label="SpO₂ (%)" value={d.exit.spo2} onChange={(v) => setIn('exit', { spo2: v })} num />
          </div>
          <div className="form-grid">
            {ANESTHESIA_SHEET.aldrete.map((a) => <label key={a.key} className="field"><span>Aldrete: {a.label}</span>
              <select className="select" value={d.aldrete[a.key]} onChange={(e) => setIn('aldrete', { [a.key]: e.target.value })}>
                <option value="">Elige…</option>{a.options.map((o, i) => <option key={o} value={String(i)}>{i} · {o}</option>)}</select></label>)}
          </div>
          <p className="anes-calc" role="status">Aldrete total: <b>{ald.any ? `${ald.total}/10${ald.complete ? '' : ' (faltan parámetros)'}` : '—'}</b></p>
        </Section>
        <Section title="Firmas">
          <p style={{ margin: 0 }}>Anestesiólogo: <b>{user.name}</b>{user.specialty ? ` · ${user.specialty}` : ''}{user.license ? ` · ${user.license}` : ''}. Instrumentista y circulante firman en papel.</p>
          <div className="form-grid">
            <Txt label="Instrumentista" value={d.scrubNurse} onChange={(v) => set({ scrubNurse: v })} />
            <Txt label="Circulante" value={d.circulatingNurse} onChange={(v) => set({ circulatingNurse: v })} />
          </div>
          {correcting && <CorrectionReason value={why} onChange={setWhy} />}
        </Section>
        <div className="anes-foot">
          <DraftBadge savedAt={draft.savedAt} restored={draft.restored} offline={draft.offline} />
          <Link className="btn btn--ghost anes-btn" to={back}>Salir (se guarda)</Link>
          <button type="button" className="btn btn--primary anes-btn" disabled={!ready} onClick={submit}><FileSignature size={16} />{correcting ? 'Guardar la corrección' : 'Firmar registro de anestesia'}</button>
        </div>
      </div>
    </div>
  )
}
