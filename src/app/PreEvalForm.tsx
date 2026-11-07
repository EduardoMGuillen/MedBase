import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronLeft, FileSignature } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { Loading } from '../components/ui'
import { DraftBadge } from '../components/Addenda'
import { CorrectionReason } from '../components/Grace'
import { DateField } from '../components/DateTimeField'
import { DocError } from '../components/SurgicalPrint'
import { useDraftSync } from '../lib/drafts'
import { ANESTHESIA_SHEET, PREANESTHESIA_LABS } from '../lib/clinicalConfig'
import { blankPreEval, prefillPreEval, samePre, type PreEval, type PreEvalData, type PreEvalPrefill } from '../lib/preanesthesia'
import { Box, Checks, Radio, Section, Txt } from './AnesthesiaForm'
import '../components/anesthesia.css'

/**
 * PQ4 (ronda 16): «Valoración preanestésica» escrita en el sistema, antes de la cirugía, desde el expediente del paciente
 * ingresado. Cualquier médico; queda como anestesiólogo quien firma. Trae lo que ya existe (autorización quirúrgica, peso y talla,
 * alergias y el último resultado de los laboratorios). Borrador «Se guarda solo». Con `?corregir=`, la corrección en el periodo
 * de gracia (GE4).
 */
const stayPath = (kind: string, id: string) => `/app/${kind === 'observation' ? 'observacion' : 'hospitalizados'}/${id}`

export default function PreEvalFormPage() {
  const { stayId } = useParams()
  const [params] = useSearchParams()
  const correcting = params.get('corregir')
  const authId = params.get('autorizacion') ?? undefined
  const nav = useNavigate()
  const { notify, user } = useStore()
  const [ctx, setCtx] = useState<{ prefill: PreEvalPrefill & { authorizationId?: string }; stayKind: string; eval?: PreEval } | null>(null)
  const [error, setError] = useState('')
  const [d, setD] = useState<PreEvalData>(blankPreEval)
  const [initial, setInitial] = useState<PreEvalData | null>(null)
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    type Ctx = { prefill: PreEvalPrefill & { authorizationId?: string }; stayKind: string; eval?: PreEval }
    const load: Promise<Ctx> = correcting
      ? api<{ eval: PreEval; stayKind: string; prefill: PreEvalPrefill }>(`/preanesthesia/${correcting}`).then((r) => ({ prefill: r.prefill, stayKind: r.stayKind, eval: r.eval }))
      : api<{ prefill: PreEvalPrefill & { authorizationId?: string }; stayKind: string }>(`/inpatient/${stayId}/preanesthesia/prefill${authId ? `?autorizacion=${authId}` : ''}`)
    load.then((r) => {
      const start = r.eval?.data ?? prefillPreEval(r.prefill)
      setInitial(start)
      setD((cur) => (samePre(cur, blankPreEval()) ? start : cur))
      setCtx(r)
    }).catch((e: Error) => setError(e.message))
  }, [stayId, correcting, authId])
  const draft = useDraftSync('valoracion', ctx ? (correcting ? `${stayId}:corregir:${correcting}` : stayId) : undefined, { d }, (x) => { if (x.d) setD({ ...blankPreEval(), ...x.d }) }, !initial || samePre(d, initial))
  if (error) return <DocError title="No puedes escribir la valoración." error={error} />
  if (!ctx || !user) return <Loading label="Abriendo la valoración preanestésica" />
  const set = (patch: Partial<PreEvalData>) => setD((x) => ({ ...x, ...patch }))
  const p = ctx.prefill.patient
  const back = `${stayPath(ctx.stayKind, stayId ?? '')}?tab=notas`
  const ready = !!d.asa && !busy
  const submit = async () => {
    if (!ready) return
    setBusy(true)
    try {
      if (correcting && ctx.eval) await api(`/preanesthesia/${correcting}/correct`, { body: { data: d, version: ctx.eval.version, why: why.trim() || undefined } })
      else await api(`/inpatient/${stayId}/preanesthesia/sign`, { body: { data: d, authorizationId: ctx.prefill.authorizationId } })
      draft.clear()
      notify(correcting ? 'Valoración preanestésica corregida' : 'Valoración preanestésica firmada')
      nav(`${stayPath(ctx.stayKind, stayId ?? '')}?tab=anexos`)
    } catch (e) {
      notify((e as Error).message, 'error')
      setBusy(false)
    }
  }
  return (
    <div className="page">
      <div className="page-head">
        <div><Link className="btn btn--ghost btn--sm anes-btn" to={back}><ChevronLeft size={15} />Volver al expediente</Link>
          <h1 style={{ marginTop: 8 }}>{correcting ? 'Corregir la valoración preanestésica' : 'Valoración preanestésica'}</h1>
          <p>{`${p.firstName} ${p.lastName}`.trim()} · Expediente {p.record}{d.proposedSurgery ? ` · ${d.proposedSurgery}` : ''}</p></div>
      </div>
      <div className="anes-form">
        <p className="muted" style={{ margin: 0 }}>Se guarda sola mientras escribes. Solo la clasificación ASA es obligatoria. Al firmar quedas como anestesiólogo, con tu nombre, especialidad y colegiado.</p>
        <Section title="Paciente y cirugía propuesta">
          <div className="form-grid form-grid--3">
            <label className="field"><span>Fecha</span><DateField value={d.date} onChange={(v) => set({ date: v })} label="Fecha" /></label>
            <Txt label="Peso (kg)" value={d.weightKg} onChange={(v) => set({ weightKg: v })} num />
            <Txt label="Talla (cm)" value={d.heightCm} onChange={(v) => set({ heightCm: v })} num />
          </div>
          <div className="form-grid">
            <Txt label="Cirugía propuesta" value={d.proposedSurgery} onChange={(v) => set({ proposedSurgery: v })} />
            <Txt label="Diagnóstico preoperatorio" value={d.preDiagnosis} onChange={(v) => set({ preDiagnosis: v })} />
          </div>
          <Radio label="Programada / Urgencia" options={ANESTHESIA_SHEET.scheduled} value={d.scheduled} onChange={(v) => set({ scheduled: v })} />
        </Section>
        <Section title="Valoración">
          <div className="anes-group"><span>ASA (obligatoria)</span><div className="anes-opts">
            {ANESTHESIA_SHEET.asa.map((o) => <label key={o} className="anes-opt"><input type="radio" name="asa" checked={d.asa === o} onChange={() => set({ asa: o })} />{o}</label>)}
            <Box label="E (urgencia)" checked={d.asaE} onChange={(v) => set({ asaE: v })} /></div></div>
          {!d.asa && <small className="field__msg field__msg--warn">Marca la clasificación ASA.</small>}
          <Radio label="Mallampati" options={ANESTHESIA_SHEET.mallampati} value={d.mallampati} onChange={(v) => set({ mallampati: v })} />
          <Radio label="Vía aérea difícil (VAD)" options={['Sí', 'No']} value={d.difficultAirway} onChange={(v) => set({ difficultAirway: v })} />
          <div className="form-grid form-grid--3">
            <Txt label="Alergias" value={d.allergies} onChange={(v) => set({ allergies: v })} />
            <Txt label="Ayuno sólidos (h)" value={d.fastingSolids} onChange={(v) => set({ fastingSolids: v })} num />
            <Txt label="Ayuno líquidos (h)" value={d.fastingLiquids} onChange={(v) => set({ fastingLiquids: v })} num />
          </div>
          <Txt label="Antecedentes y medicación" value={d.history} onChange={(v) => set({ history: v })} area />
        </Section>
        <Section title="Laboratorios">
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>Traen el último resultado del paciente, si existe. Puedes cambiarlos.</p>
          <div className="form-grid form-grid--3">
            {PREANESTHESIA_LABS.map((l) => <Txt key={l.key} label={l.label} value={d.labs[l.key]} onChange={(v) => set({ labs: { ...d.labs, [l.key]: v } })} />)}
          </div>
        </Section>
        <Section title="Técnica propuesta, plan y recomendaciones">
          <Checks label="Técnica propuesta" options={ANESTHESIA_SHEET.techniques} value={d.techniques} onChange={(v) => set({ techniques: v })} />
          <Txt label="Plan y recomendaciones" value={d.plan} onChange={(v) => set({ plan: v })} area placeholder="Ej. Ayuno de 8 h, suspender anticoagulante, reservar 2 unidades" />
        </Section>
        <Section title="Firma">
          <p style={{ margin: 0 }}>Anestesiólogo: <b>{user.name}</b>{user.specialty ? ` · ${user.specialty}` : ''}{user.license ? ` · ${user.license}` : ''}. En el impreso queda el espacio para la firma y el sello en papel.</p>
          {correcting && <CorrectionReason value={why} onChange={setWhy} />}
        </Section>
        <div className="anes-foot">
          <DraftBadge savedAt={draft.savedAt} restored={draft.restored} offline={draft.offline} />
          <Link className="btn btn--ghost anes-btn" to={back}>Salir (se guarda)</Link>
          <button type="button" className="btn btn--primary anes-btn" disabled={!ready} onClick={submit}><FileSignature size={16} />{correcting ? 'Guardar la corrección' : 'Firmar valoración'}</button>
        </div>
      </div>
    </div>
  )
}
