import { useState } from 'react'
import { FileSignature } from 'lucide-react'
import { useStore } from '../lib/store'
import { AutoTextarea } from '../components/ui'
import { DateTimeField } from '../components/DateTimeField'
import { DiagnosisPicker } from '../components/DiagnosisPicker'
import { DictateButton } from '../components/Dictate'
import { ANESTHESIA_TYPES, SURGICAL_TEAM, type SurgicalRole } from '../lib/clinicalConfig'
export { anesthesiaText, teamLines } from '../lib/postop'
import { fromLocalValue, localValueToIso } from '../lib/dateInput'
import { dmyTime, inputDateTime } from '../lib/format'
import { isSurgical } from '../lib/consent'
import { normalize } from '../lib/patients'
import { useNow } from '../lib/hooks'
import type { Diagnosis, InpatientFile as File, PostopData, TeamMember } from '../lib/types'

/** Quirúrgicas firmadas en las 24 horas antes del procedimiento (también los registros anteriores marcados como autorizados). */
export function surgicalAuths(file: File, performed: Date) {
  const recent = (at: string) => { const t = new Date(at).getTime(); return t <= performed.getTime() + 2 * 60_000 && t >= performed.getTime() - 24 * 3_600_000 }
  return [
    ...file.authorizations.filter((a) => isSurgical(a) && a.status === 'signed' && a.statusAt && recent(a.statusAt))
      .map((a) => ({ id: a.id, name: `Quirúrgica: ${a.data.procedure}${a.method === 'virtual' ? ' (virtual)' : a.method === 'paper' ? ' (papel)' : ''}`, at: a.statusAt!, procedure: a.data.procedure ?? '' })),
    ...file.procedures.filter((x) => x.kind === 'authorization' && x.status === 'authorized' && recent(x.updatedAt ?? x.createdAt))
      .map((x) => ({ id: x.id, name: `${x.name} (registro anterior)`, at: x.updatedAt ?? x.createdAt, procedure: x.name })),
  ]
}

/** Lo que se escribe en la ventana (horas en «aaaa-mm-ddTHH:mm» de Honduras). `authId`: null = la que corresponda, '' = ninguna. */
export interface PostopDraft {
  preDiagnoses: Diagnosis[]; postDiagnoses: Diagnosis[]; startAt: string; endAt: string; anesthesia: string; anesthesiaOther: string
  procedureName: string; description: string; team: Partial<Record<SurgicalRole, TeamMember>>; authId: string | null; urgent: boolean; justification: string
}

export function postopIssues(pq: PostopDraft, file: File, now = new Date()) {
  const start = fromLocalValue(pq.startAt); const end = fromLocalValue(pq.endAt)
  const future = start.getTime() > now.getTime() + 60_000 || end.getTime() > now.getTime() + 60_000
  const backwards = end.getTime() < start.getTime()
  const auths = surgicalAuths(file, start)
  const matching = auths.find((a) => pq.procedureName.trim().length >= 3 && normalize(a.procedure).includes(normalize(pq.procedureName.trim())))
  const chosen = pq.authId === '' ? undefined : auths.find((a) => a.id === pq.authId) ?? matching ?? auths[0]
  const missing: string[] = []
  if (!pq.preDiagnoses.length) missing.push('el diagnóstico preoperatorio')
  if (!pq.postDiagnoses.length) missing.push('el diagnóstico postoperatorio')
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) missing.push('la hora de inicio y la de cierre')
  if (future) missing.push('horas que no sean en el futuro')
  if (backwards) missing.push('una hora de cierre posterior a la de inicio')
  if (!pq.anesthesia || (pq.anesthesia === 'Otra' && !pq.anesthesiaOther.trim())) missing.push('el tipo de anestesia')
  if (pq.procedureName.trim().length < 3) missing.push('el procedimiento realizado')
  if (pq.description.trim().length < 10) missing.push('la descripción del procedimiento')
  if (!pq.team.surgeon?.name.trim()) missing.push('el cirujano principal')
  if (!chosen && !(pq.urgent && pq.justification.trim().length >= 10)) missing.push('la autorización quirúrgica (o la urgencia justificada)')
  return { missing, future, backwards, auths, chosen }
}

export function postopPayload(pq: PostopDraft, check: ReturnType<typeof postopIssues>): PostopData {
  const urgent = !check.chosen && pq.urgent
  const team = Object.fromEntries(Object.entries(pq.team).filter(([, m]) => m?.name.trim()).map(([k, m]) => [k, { staffId: m!.staffId, name: m!.name.trim() }]))
  return {
    preDiagnoses: pq.preDiagnoses, startAt: localValueToIso(pq.startAt), endAt: localValueToIso(pq.endAt),
    anesthesia: pq.anesthesia, anesthesiaOther: pq.anesthesia === 'Otra' ? pq.anesthesiaOther.trim() : undefined,
    procedureName: pq.procedureName.trim(), description: pq.description.trim(), team,
    authorizationId: check.chosen?.id, urgent, justification: urgent ? pq.justification.trim() : undefined,
  }
}

export const blankPostop = (pre: Diagnosis[], user?: { id: string; name: string } | null): PostopDraft => ({
  preDiagnoses: pre, postDiagnoses: [], startAt: inputDateTime(new Date()), endAt: inputDateTime(new Date()), anesthesia: '', anesthesiaOther: '',
  procedureName: '', description: '', team: user ? { surgeon: { staffId: user.id, name: user.name } } : {}, authId: null, urgent: false, justification: '',
})

/** PQ2: un cargo del equipo: se elige del personal de la clínica o se escribe (personal externo). */
function TeamField({ label, value, onChange, required }: { label: string; value?: TeamMember; onChange: (m: TeamMember) => void; required?: boolean }) {
  const { staff: all } = useStore()
  const listId = `team-${label.replace(/\W/g, '')}`
  const staff = all.filter((s) => s.active && s.role !== 'superadmin')
  return (
    <label className="field"><span>{label}{required ? '' : ' (opcional)'}</span>
      <input className="input" list={listId} value={value?.name ?? ''} aria-required={required || undefined} placeholder="Elige o escribe el nombre"
        onChange={(e) => { const name = e.target.value; const s = staff.find((x) => x.name === name); onChange({ name, staffId: s?.id }) }} />
      <datalist id={listId}>{staff.map((s) => <option key={s.id} value={s.name} />)}</datalist></label>
  )
}

/** PQ1 y PQ2: la columna izquierda de la nota postquirúrgica. */
export function PostopFields({ pq, setPq, check, onAuthorize }: { pq: PostopDraft; setPq: (f: (x: PostopDraft) => PostopDraft) => void; file: File; check: ReturnType<typeof postopIssues>; onAuthorize?: (procedure: string) => void }) {
  const now = useNow()
  const [same, setSame] = useState(false)
  const set = (patch: Partial<PostopDraft>) => setPq((x) => ({ ...x, ...patch }))
  const { auths, chosen } = check
  return (<>
    <DiagnosisPicker value={pq.preDiagnoses} onChange={(v) => set({ preDiagnoses: v })} label="Diagnóstico preoperatorio" />
    <div className="field">
      <DiagnosisPicker value={pq.postDiagnoses} onChange={(v) => { setSame(false); set({ postDiagnoses: v }) }} label="Diagnóstico postoperatorio" />
      <button type="button" className="btn btn--ghost btn--sm" style={{ justifySelf: 'start' }} disabled={!pq.preDiagnoses.length || same}
        onClick={() => { setSame(true); set({ postDiagnoses: pq.preDiagnoses }) }}>Igual al preoperatorio</button>
    </div>
    <div className="form-grid">
      <label className="field"><span>Hora de inicio</span>
        <DateTimeField value={pq.startAt} max={inputDateTime(now)} invalid={check.future} onChange={(v) => set({ startAt: v })} label="Hora de inicio" /></label>
      <label className="field"><span>Hora de cierre</span>
        <DateTimeField value={pq.endAt} max={inputDateTime(now)} invalid={check.backwards || check.future} onChange={(v) => set({ endAt: v })} label="Hora de cierre" />
        {check.backwards && <small className="field__msg field__msg--error">El cierre no puede ser antes del inicio.</small>}</label>
      <small className="muted span-2">Si escribes la nota después de la cirugía, corrige las horas. La hora en que escribes la nota se guarda sola.</small>
      <label className="field"><span>Tipo de anestesia</span>
        <select className="select" value={pq.anesthesia} onChange={(e) => set({ anesthesia: e.target.value })} aria-required="true">
          <option value="">Elige…</option>{ANESTHESIA_TYPES.map((a) => <option key={a}>{a}</option>)}</select></label>
      {pq.anesthesia === 'Otra' && <label className="field"><span>¿Cuál?</span><input className="input" value={pq.anesthesiaOther} onChange={(e) => set({ anesthesiaOther: e.target.value })} placeholder="Especifica la anestesia" /></label>}
    </div>
    <label className="field"><span>Procedimiento realizado</span><input className="input" value={pq.procedureName} onChange={(e) => set({ procedureName: e.target.value })} placeholder="Escribe qué se hizo" /></label>
    <label className="field"><span>Descripción del procedimiento</span>
      <AutoTextarea value={pq.description} onChange={(e) => set({ description: e.target.value })} placeholder="Técnica, hallazgos, complicaciones, sangrado, estado del paciente al terminar." />
      <DictateButton label="Descripción del procedimiento" onText={(f) => setPq((x) => ({ ...x, description: f(x.description) }))} /></label>
    <fieldset className="fs">
      <legend>Equipo quirúrgico</legend>
      <div className="form-grid">
        {SURGICAL_TEAM.map((t) => <TeamField key={t.key} label={t.label} required={t.key === 'surgeon'} value={pq.team[t.key]} onChange={(m) => setPq((x) => ({ ...x, team: { ...x.team, [t.key]: m } }))} />)}
      </div>
    </fieldset>
    {auths.length > 0 && (
      <label className="field"><span>Autorización quirúrgica firmada (últimas 24 horas)</span>
        <select className="select" value={chosen?.id ?? ''} onChange={(e) => set({ authId: e.target.value })}>
          {auths.map((a) => <option key={a.id} value={a.id}>{a.name} · firmada {dmyTime(a.at)}</option>)}
          <option value="">Ninguna de estas</option>
        </select></label>
    )}
    {chosen ? <div className="alert-strip alert-strip--calm">Autorización firmada ✓ {chosen.name}</div> : (
      <div className="alert-strip alert-strip--amber" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <span>No hay autorización quirúrgica firmada para este procedimiento.</span>
        {onAuthorize && <button type="button" className="btn btn--soft btn--sm" style={{ alignSelf: 'flex-start' }} onClick={() => onAuthorize(pq.procedureName.trim())}><FileSignature size={14} />Generar la autorización quirúrgica</button>}
        <label className="check-line" style={{ background: '#fff' }}><input type="checkbox" checked={pq.urgent} onChange={(e) => set({ urgent: e.target.checked })} />
          <span><b>Urgencia, sin autorización previa</b><small>Escribe por qué no se pudo obtener antes.</small></span></label>
        {pq.urgent && <textarea className="textarea textarea--sm" rows={2} value={pq.justification} onChange={(e) => set({ justification: e.target.value })} placeholder="Justificación" aria-label="Justificación de la urgencia" />}
      </div>
    )}
  </>)
}
