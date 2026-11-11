import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { fromLocalValue } from '../../lib/dateInput'
import { useNavigate } from 'react-router-dom'
import { ArrowDown, ArrowUp, ClipboardList, FileText, FlaskConical, Pencil, Pill, Plus, Printer, TriangleAlert, X } from 'lucide-react'
import { useStore, type NewMed } from '../../lib/store'
import { EXAM_GUIDE } from '../../lib/clinicalConfig'
import { AutoTextarea, Loading, Modal } from '../../components/ui'
import { inputDateTime } from '../../lib/format'
import { MedicationForm } from '../../components/Medications'
import { DateTimeField } from '../../components/DateTimeField'
import { activeIndications, chainNote, frequencyHours, currentDiagnoses, yearsOld, courseDone, medLabel, soapBlocks } from '../../lib/inpatient'
import { DiagnosisPicker } from '../../components/DiagnosisPicker'
import { DictateButton } from '../../components/Dictate'
import { blankPostop, postopDraftOf, postopIssues, postopPayload, PostopFields, type PostopDraft } from '../PostopNote'
import { normalize } from '../../lib/patients'
import type { Diagnosis, Dose, ExamInput, VitalsMode, InpatientFile as File, InpatientMed, InpatientNote, Patient } from '../../lib/types'
import { ExamsBlock } from '../../components/Exams'
import { defaultPlace, examCatalog, examKey, typedExam } from '../../lib/exams'
import { useExamCatalog } from '../../lib/useExamCatalog'
import { DraftBadge } from '../../components/Addenda'
import { useDraftSync } from '../../lib/drafts'
import { api, ApiError } from '../../lib/api'
import { GRACE_EXPIRED_TEXT, REMOVED_IN_GRACE } from '../../lib/grace'
import { CorrectionReason } from '../../components/Grace'
import { VitalsFrequency } from '../../components/VitalsFrequency'
import { VitalsFields } from '../../components/VitalsFields'
import { EMPTY_VITALS, FIELDS, fieldIssue, vitalNumber, type VitalsForm } from '../../lib/vitalsForm'
import { VITALS, type VitalKey } from '../../lib/vitals'
import { currentVitalsMode } from '../../lib/vitalsSheet'
import { OrderSetPicker, SaveSetButton } from '../../components/OrderSets'
import { hasBlank, medHasBlank, orderKey } from '../../lib/orderSets'
import { useVademecum } from '../../lib/vademecum'
import { GenerateRxModal } from '../../components/GenerateRx'
import type { OrderSet } from '../../lib/types'
import { FluidsOrder, fluidsPayload, fluidsStart, type FluidsChoice } from '../../components/FluidsOrder'
import { currentFluidsMode } from '../../lib/fluids'
import { LineTag } from './MedicalNotes'
import { SOAP } from './MedicalNotes'

// Expediente de la estancia: el editor de notas (ingreso, evolución, postquirúrgica y corrección en el periodo de gracia).
/** GE4 (ronda 9): las órdenes de la nota tal como se corrigen (lo que va al servidor si cambió). */
export type OrdersFix = { indications: { id?: string; text: string; replaces?: string }[]; meds: { id?: string; med: NewMed }[]; keepExams: string[]; exams: ExamInput[] }
export type OrderLocks = { all?: string; meds: Record<string, string>; keep: string[]; exams: Record<string, string> }

/** Cómo estaban las órdenes al firmar (o en la última versión): el punto de partida de la corrección. */
export function ordersOf(n: InpatientNote, file: File): OrdersFix {
  return {
    indications: (n.lines ?? []).filter((l) => l.kind === 'ind' && l.tag === 'new').map((l) => ({ id: l.id, text: l.text, replaces: l.replaces })),
    meds: file.meds.filter((m) => m.noteId === n.id && m.stopReason !== REMOVED_IN_GRACE).map((m) => ({ id: m.id, med: { ...medToNew(m), firstAt: m.prn ? undefined : m.firstAt, loadingGivenAt: undefined } as NewMed })),
    keepExams: (file.exams ?? []).filter((e) => e.noteId === n.id && e.status !== 'cancelled').map((e) => e.id),
    exams: [],
  }
}

/**
 * GE4 (ronda 9): al corregir una nota, la columna de órdenes se corrige con lo que nadie ha cumplido: las indicaciones nuevas
 * (se cambian, se quitan o se agregan), los medicamentos que nadie registró (la hoja se actualiza) y los exámenes sin muestra
 * ni orden impresa (se cancelan). Lo cumplido o impreso sale bloqueado con su explicación; lo que bajó de la nota anterior
 * (Continúa, Omitida) queda como se firmó. Si enfermería ya revisó órdenes o ya hay otra nota, la columna no se toca.
 */
export function CorrectionOrders({ n, file, p, value, onChange, locks }: { n: InpatientNote; file: File; p: Patient; value: OrdersFix; onChange: (v: OrdersFix) => void; locks?: OrderLocks }) {
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const kept = (n.lines ?? []).filter((l) => l.kind === 'ind' && l.tag !== 'new')
  const exams = (file.exams ?? []).filter((e) => e.noteId === n.id && e.status !== 'cancelled')
  const carried = (n.lines ?? []).filter((l) => l.kind === 'med' && l.tag !== 'new')
  if (!locks) return <div className="note-editor__orders"><Loading /></div>
  if (locks.all) {
    const meds = file.meds.filter((m) => m.noteId === n.id && m.stopReason !== REMOVED_IN_GRACE)
    return (
      <div className="note-editor__orders">
        <div className="alert-strip alert-strip--amber">{locks.all}</div>
        {!!n.orders?.length && <fieldset className="fs"><legend>Indicaciones</legend><ol className="note__list">{(n.orders ?? []).slice(0, n.indicationCount ?? n.orders?.length).map((o, i) => <li key={i}>{o}</li>)}</ol></fieldset>}
        {exams.length > 0 && <fieldset className="fs"><legend>Exámenes</legend><ul className="note__list">{exams.map((e) => <li key={e.id}>{e.name}</li>)}</ul></fieldset>}
        {meds.length > 0 && <fieldset className="fs"><legend>Medicamentos</legend><ul className="note__list">{meds.map((m) => <li key={m.id}>{medLabel(m)}</li>)}</ul></fieldset>}
      </div>
    )
  }
  const set = (x: Partial<OrdersFix>) => onChange({ ...value, ...x })
  const add = () => {
    const lines = text.split(/\r?\n/).map((t) => t.replace(/^\s*(\d+\s*[.)-]|[-•*])\s*/, '').trim()).filter(Boolean)
    if (lines.length) set({ indications: [...value.indications, ...lines.map((t) => ({ text: /[.!?]$/.test(t) ? t : `${t}.` }))] })
    setText('')
  }
  return (
    <div className="note-editor__orders">
      <div className="alert-strip alert-strip--calm">Lo que nadie ha cumplido se corrige aquí: la hoja de medicamentos y los exámenes se actualizan al guardar. Lo ya cumplido o impreso queda como se firmó.</div>
      <fieldset className="fs"><legend>Indicaciones</legend>
        {kept.length > 0 && <ol className="note__list">{kept.map((l) => <li key={l.id}><span className={l.tag === 'omitted' ? 'struck' : ''}>{l.text}</span><LineTag tag={l.tag} /></li>)}</ol>}
        {value.indications.length > 0 && <ol className="orders">{value.indications.map((o, i) => (
          <li key={o.id ?? `new-${i}`}><span className="orders__n">{kept.length + i + 1}.</span>
            <input className={`input${hasBlank(o.text) ? ' input--blank' : ''}`} value={o.text} aria-label={`Indicación ${kept.length + i + 1}`}
              onChange={(e) => set({ indications: value.indications.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
            <span className="orders__tools">{!o.replaces && <button type="button" className="icon-btn" aria-label="Quitar indicación" onClick={() => set({ indications: value.indications.filter((_, j) => j !== i) })}><X size={14} /></button>}</span></li>
        ))}</ol>}
        <div className="order-add">
          <textarea className="textarea textarea--sm" rows={2} value={text} aria-label="Nueva indicación" placeholder="Escribe una indicación y presiona Enter"
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); add() } }} />
          <button className="btn btn--soft" disabled={!text.trim()} type="button" onClick={add} aria-label="Agregar indicación"><Plus size={16} /></button>
        </div>
      </fieldset>
      <fieldset className="fs"><legend>Exámenes</legend>
        {exams.length > 0 && <ul className="note__list">{exams.map((e) => {
          const on = value.keepExams.includes(e.id)
          return <li key={e.id}>
            <span className={on ? '' : 'struck'}>{e.name}</span>
            {locks.exams[e.id] ? <div className="locked-line">{locks.exams[e.id]}</div>
              : <button type="button" className="btn btn--ghost btn--sm ml-sm" onClick={() => set({ keepExams: on ? value.keepExams.filter((x) => x !== e.id) : [...value.keepExams, e.id] })}>{on ? 'Quitar' : 'Deshacer'}</button>}
          </li>
        })}</ul>}
        <ExamsBlock value={value.exams} onChange={(v) => set({ exams: v })} inStay />
      </fieldset>
      <fieldset className="fs note-editor__meds"><legend>Medicamentos</legend>
        {carried.length > 0 && <ul className="note__list">{carried.map((l) => <li key={l.id}><span className={l.tag === 'continue' ? '' : 'struck'}>{l.text}</span><LineTag tag={l.tag} /></li>)}</ul>}
        {value.meds.length > 0 && <ol className="orders">{value.meds.map((x, i) => {
          const lock = x.id ? locks.meds[x.id] : undefined
          return <li key={x.id ?? `new-${i}`}><span className="orders__n">–</span>
            <span className="orders__text"><Pill size={13} className="orders__pill" />{medLabel(x.med)}{x.med.days ? ` por ${x.med.days} días` : ''}{x.med.instructions ? `. ${x.med.instructions}` : ''}
              {lock && <div className="locked-line">{lock}</div>}</span>
            {!lock && <span className="orders__tools">
              <button type="button" className="icon-btn" aria-label={`Editar ${x.med.drug}`} onClick={() => { setEditing(i); setAdding(false) }}><Pencil size={14} /></button>
              {!(x.id && locks.keep.includes(x.id)) && <button type="button" className="icon-btn" aria-label={`Quitar ${x.med.drug}`} onClick={() => { set({ meds: value.meds.filter((_, j) => j !== i) }); setEditing(null) }}><X size={14} /></button>}
            </span>}</li>
        })}</ol>}
        {editing !== null && value.meds[editing] ? <MedicationForm kind="stay" key={`fix-${editing}`} patient={p} current={value.meds.filter((_, j) => j !== editing).map((x) => x.med)} initial={editInitial(value.meds[editing].med)}
            onSave={(m) => { set({ meds: value.meds.map((x, j) => (j === editing ? { ...x, med: { ...m, replacesId: x.med.replacesId } } : x)) }); setEditing(null) }} onCancel={() => setEditing(null)} />
          : adding ? <MedicationForm kind="stay" patient={p} current={value.meds.map((x) => x.med)} onSave={(m) => { set({ meds: [...value.meds, { med: m }] }); setAdding(false) }} onCancel={() => setAdding(false)} />
          : <button className="btn btn--soft" onClick={() => setAdding(true)}><Plus size={15} />Agregar medicamento</button>}
      </fieldset>
    </div>
  )
}

export function NoteEditor({ file, p, kind, onClose, onSaved, onStale, variant, onAuthorize, seed, correct, onExpired, inline = false, notesOnly = false, afterIndications }: { file: File; p: Patient; kind: 'admission' | 'evolution'; onClose: () => void; onSaved: (examBatch?: string, rxNoteId?: string) => void; onStale?: () => void
  /**
   * NO2 (ronda 16): lugar para un bloque de órdenes más, debajo de «Indicaciones» y antes de «Exámenes», en la nota de ingreso y
   * en las de evolución (IE1, «Ingestas y excretas», rama ronda16-ingreso). La consulta externa tiene el mismo lugar marcado.
   */
  afterIndications?: ReactNode
  /** HO1 (ronda 12): dentro del expediente, debajo de las notas (no en ventana), para seguir viendo las otras pestañas. */
  inline?: boolean
  /** IM2 (ronda 12): el radiólogo escribe la nota (evolución o postquirúrgica) sin indicaciones ni medicamentos. */
  notesOnly?: boolean
  /** PQ1 (ronda 9): «Nota postquirúrgica»: la misma ventana (órdenes, borrador, pie), con su columna izquierda propia. */
  variant?: 'postop'; onAuthorize?: (procedure: string) => void; seed?: Partial<PostopDraft>
  /** GE4 (ronda 9): «Corregir»: la misma ventana, ya llenada, con «Guardar corrección». `onExpired` pasa lo escrito a una adenda. */
  correct?: InpatientNote; onExpired?: (text: string) => void }) {
  const { addInpatientNote, staffById, settings } = useStore()
  const postop = variant === 'postop'
  // Una nota, un identificador: si se guarda dos veces no se duplica (ni sus medicamentos en la hoja)
  const [clientId] = useState(() => crypto.randomUUID())
  const [n, setN] = useState(() => correct ? { subjective: correct.subjective, objective: correct.objective, assessment: correct.assessment, plan: correct.plan }
    // NO3 (ronda 16): la A ya no se precarga con los diagnósticos del ingreso: van en «Diagnósticos (CIE-11)»
    : { subjective: '', objective: '', assessment: '', plan: '' })
  // Dos formatos (MC4): Estándar ('dx': diagnóstico, examen físico y observaciones) y SOAP. Empieza en el que el médico
  // eligió en Mi configuración (Estándar si no eligió); cada formato guarda su borrador mientras el modal está abierto
  const { user } = useStore()
  // NO2 (ronda 16): la nota de ingreso empieza SIEMPRE en el formato estándar de la consulta externa (la preferencia del médico
  // vale para las evoluciones); se puede cambiar a SOAP y volver sin perder lo escrito
  const [format, setFormat] = useState<'soap' | 'dx'>(() => (correct ? (correct.format === 'dx' ? 'dx' : 'soap') : kind === 'admission' ? 'dx' : user?.prefs?.noteFormat ?? 'dx'))
  const admissionStd = kind === 'admission' && format === 'dx' && !postop
  // NE4 (ronda 8): los diagnósticos vigentes bajan de la última nota firmada de la estancia (o de la impresión diagnóstica
  // del ingreso), como las órdenes; se quitan o se agregan. Estándar y SOAP usan el mismo campo. El borrador manda.
  // NO3 (ronda 16): la nota de ingreso empieza con los diagnósticos del ingreso
  const [carried, setCarried] = useState<Diagnosis[]>(() => (kind === 'evolution' ? currentDiagnoses(file) : file.hospitalization.diagnoses ?? []))
  // NO2 (ronda 16): la nota de ingreso estándar lleva además el motivo de consulta y la historia de la enfermedad actual
  const [d, setD] = useState<{ diagnoses: Diagnosis[]; evolution: string; exam: string; observations: string; chiefComplaint: string; history: string }>(() => (correct
    ? { diagnoses: correct.diagnoses ?? [], evolution: correct.evolution ?? '', exam: correct.exam ?? '', observations: correct.observations ?? '', chiefComplaint: correct.chiefComplaint ?? '', history: correct.history ?? '' }
    : { diagnoses: carried, evolution: '', exam: '', observations: '', chiefComplaint: kind === 'admission' ? file.hospitalization.reason ?? '' : '', history: '' }))
  const [why, setWhy] = useState('')
  const [expired, setExpired] = useState(false)
  // GE4: las órdenes de la nota que se corrige y qué está bloqueado (lo dice el servidor)
  const [fixStart] = useState(() => (correct ? ordersOf(correct, file) : undefined))
  const [fix, setFix] = useState(fixStart)
  const [locks, setLocks] = useState<OrderLocks | undefined>()
  useEffect(() => {
    if (!correct) return
    api<OrderLocks>(`/inpatient/notes/${correct.id}/correct`).then(setLocks).catch(() => setLocks({ all: 'No se pudo revisar qué órdenes ya se cumplieron. Corrígelas con una adenda.', meds: {}, keep: [], exams: {} }))
  }, [correct])
  const fixChanged = !!fix && !locks?.all && JSON.stringify(fix) !== JSON.stringify(fixStart)
  // GE4: si venció el plazo, lo escrito pasa a una adenda (texto plano, como se leería en la nota)
  const correctionText = () => postop ? [pq.procedureName, pq.description].filter(Boolean).join('. ')
    : format === 'soap' ? SOAP.map((x) => `${x.letter}. ${n[x.key]}`).join('\n') : [d.chiefComplaint, d.history, d.evolution, d.exam, d.observations].filter((x) => x.trim()).join('\n')
  void staffById
  const dxChanged = JSON.stringify(d.diagnoses) !== JSON.stringify(carried)
  // PQ1 y PQ2 (ronda 9): nota postquirúrgica (`postop`, arriba)
  const [pq, setPq] = useState<PostopDraft>(() => (correct?.postop ? postopDraftOf(correct) : { ...blankPostop(carried, user), ...seed }))
  const [meds, setMeds] = useState<NewMed[]>([])
  const [stop, setStop] = useState<string[]>([])
  const [adding, setAdding] = useState(kind === 'admission')
  // NO2 (ronda 16): un medicamento escrito como indicación se ofrece pasarlo a Medicamentos, como en la consulta externa
  const [addSeed, setAddSeed] = useState<NewMed | undefined>()
  const [replacing, setReplacing] = useState<string | null>(null)
  // MC7 (ronda 6): las indicaciones nuevas de esta nota; las vigentes bajan solas en «Indicaciones activas»
  const [extra, setExtra] = useState<string[]>([])
  const activeInd = activeIndications(file)
  // Qué hace el médico con cada indicación que bajó (por su identificador): sigue, se omite o se cambia
  const [decisions, setDecisions] = useState<Record<string, { action: 'omit' | 'change'; text?: string }>>({})
  const [changingInd, setChangingInd] = useState<string | null>(null)
  // La última nota firmada al abrir: si otra se firma mientras se escribe, se avisa y se recalcula sobre ella
  const lastId = chainNote(file)?.id ?? null
  const [basedOn, setBasedOn] = useState<string | null>(lastId)
  const stale = basedOn !== lastId
  // MC6 (ronda 6): frecuencia de signos vitales: la vigente (no empieza vacía); un ingreso nuevo, por turno
  const [vitalsMode, setVitalsMode] = useState<VitalsMode>(() => currentVitalsMode(file))
  // IE1 (ronda 16): «Ingestas y excretas»: la vigente baja marcada; desmarcarla la suspende
  const fluidsNow = currentFluidsMode(file.hospitalization.fluidsPlan)
  const [fluids, setFluids] = useState<FluidsChoice>(() => fluidsStart(fluidsNow))
  const fluidsDirty = fluids.on !== !!fluidsNow || (fluids.on && fluids.mode !== fluidsNow)
  // MC8 (ronda 6): signos vitales opcionales tomados por el médico (null: no se agregaron)
  const [nv, setNv] = useState<VitalsForm | null>(null)
  const [nvAt, setNvAt] = useState(() => inputDateTime(new Date()))
  const [nvChecked, setNvChecked] = useState<Set<VitalKey>>(new Set())
  const ageYears = p.birthDate ? yearsOld(p.birthDate) : undefined
  const nvFilled = !!nv && FIELDS.some((k) => nv[k].trim())
  const nvErrors = nv ? FIELDS.filter((k) => fieldIssue(k, nv, ageYears)?.level === 'error') : []
  const nvFuture = !!nv && fromLocalValue(nvAt).getTime() > Date.now() + 60_000
  // EX1: exámenes pedidos en la nota
  const [exams, setExams] = useState<ExamInput[]>([])
  const [extraText, setExtraText] = useState('')
  const [busy, setBusy] = useState(false)
  const [editingMed, setEditingMed] = useState<number | null>(null)
  const { notify } = useStore()
  const vademecum = useVademecum()
  const active = file.meds.filter((m) => !m.stoppedAt && !courseDone(m))
  // AN1: la nota se guarda sola como borrador (aquí y en el servidor) mientras se escribe
  const noteBlank = (!postop || (!pq.procedureName.trim() && !pq.description.trim() && !pq.postDiagnoses.length && !pq.anesthesia)) && !Object.values(n).some((v) => v.trim()) && !dxChanged && !d.evolution.trim() && !d.exam.trim() && !d.observations.trim() && !d.history.trim() && (kind !== 'admission' || d.chiefComplaint.trim() === (file.hospitalization.reason ?? '').trim()) && !meds.length && !stop.length && !exams.length && !extra.length && !Object.keys(decisions).length && !nvFilled && !fluidsDirty
  const draft = useDraftSync('evolucion', correct ? `${file.hospitalization.id}:correct:${correct.id}` : `${file.hospitalization.id}:${postop ? 'postop' : kind}`, { n, format, d, meds, stop, extra, exams, decisions, vitalsMode, nv, nvAt, pq, fluids }, (x) => {
    if (seed) return // viene de un borrador de procedimiento mayor: manda lo que se traía
    if (x.pq) setPq(x.pq)
    if (x.n) setN(x.n); if (x.format) setFormat(x.format); if (x.d) setD({ ...x.d, evolution: x.d.evolution ?? '', chiefComplaint: x.d.chiefComplaint ?? '', history: x.d.history ?? '' }); if (x.meds) setMeds(x.meds); if (x.stop) setStop(x.stop); if (x.extra) setExtra(x.extra); if (x.exams) setExams(x.exams); if (x.decisions) setDecisions(x.decisions); if (x.vitalsMode) setVitalsMode(x.vitalsMode); if (x.fluids) setFluids(x.fluids); if (x.nv) { setNv(x.nv); if (x.nvAt) setNvAt(x.nvAt) }
  }, noteBlank)
  const inVademecum = (drug: string) => vademecum.some((x) => normalize(x.name) === normalize(drug))
  // Huecos "___" de un set aplicado: la nota no se firma hasta llenarlos
  const blanks = [...extra.flatMap((t, i) => (hasBlank(t) ? [`la indicación ${i + 1}`] : [])), ...meds.flatMap((m) => (medHasBlank(m) ? [m.drug] : [])),
    // MC2 (ronda 6): un PRN que vino de un set sin condición
    ...meds.flatMap((m) => (m.prn && !m.prnCondition?.trim() ? [`la condición PRN de ${m.drug}`] : []))]
  // SOAP: los cuatro campos, como siempre. Estándar: algo escrito, una indicación o un medicamento.
  // MC8: un valor imposible (temperatura 90) no se acepta, como en el formulario de enfermería
  const pqAll = postopIssues(pq, file)
  // GE4: al corregir, la autorización ya quedó resuelta al firmar
  const pqCheck = correct ? { ...pqAll, missing: pqAll.missing.filter((m) => !m.startsWith('la autorización')) } : pqAll
  const fixBlank = !!fix && (fix.indications.some((x) => hasBlank(x.text)) || fix.meds.some((x) => medHasBlank(x.med)))
  // NO2 (ronda 16): la nota de ingreso estándar pide lo mismo que la consulta externa: el motivo y la impresión diagnóstica
  const admissionMissing = admissionStd ? [!d.chiefComplaint.trim() && 'el motivo de consulta', !d.diagnoses.length && 'la impresión diagnóstica'].filter((x): x is string => !!x) : []
  const ready = !blanks.length && !fixBlank && !admissionMissing.length && (postop ? !pqCheck.missing.length : !nvErrors.length && !nvFuture && (format === 'soap' ? SOAP.every((s) => n[s.key].trim())
    : (dxChanged && d.diagnoses.length > 0) || !!d.evolution.trim() || !!d.exam.trim() || !!d.observations.trim() || extra.length > 0 || meds.length > 0 || stop.length > 0 || exams.length > 0 || Object.keys(decisions).length > 0 || fluidsDirty))
  /** Un set se agrega al final: indicaciones y medicamentos (que pasan a la hoja al guardar), todo editable. */
  const applySet = (set: OrderSet) => {
    const texts = set.items.flatMap((it) => (it.text ? [it.text] : []))
    const added: NewMed[] = set.items.flatMap((it) => (it.med ? [{ ...it.med, instructions: it.med.instructions ?? '', firstAt: it.med.prn ? undefined : new Date().toISOString() }] : []))
    // EX1: los exámenes del set van a la sección Exámenes, no como texto en la columna de órdenes
    const fromSet = set.items.flatMap((it) => (it.exam ? [it.exam] : []))
    // EX8 (ronda 14): con el lugar por defecto de una estancia (lo guardado en el set no manda)
    setExams((x) => [...x, ...fromSet.filter((e) => !x.some((y) => y.name === e.name)).map((e) => ({ ...e, place: defaultPlace(e.group, true, settings) }))])
    const repeated = [
      ...texts.filter((t) => extra.some((x) => orderKey(x) === orderKey(t))),
      ...added.filter((m) => [...meds, ...active].some((x) => orderKey(medLabel(x)) === orderKey(medLabel(m)))).map((m) => medLabel(m)),
    ]
    setExtra((x) => [...x, ...texts])
    setMeds((x) => [...x, ...added])
    if (repeated.length) notify(`Ojo: ya estaba${repeated.length > 1 ? 'n' : ''} en la lista: ${repeated.map((t) => t.replace(/\.$/, '')).join('; ')}. Quita la que sobre.`, 'error')
    else notify(`Se agregaron ${set.items.length} órdenes de "${set.name}". Revísalas antes de guardar.`)
  }
  // Cada línea es una orden; se quita la numeración o viñeta con que venga pegada
  const clean = (line: string) => line.replace(/^\s*(\d+\s*[.)-]|[-•*])\s*/, '').trim()
  const addLines = (text: string) => {
    const lines = text.split(/\r?\n/).map(clean).filter(Boolean)
    if (!lines.length) return
    setExtra((x) => [...x, ...lines.map((t) => (/[.!?]$/.test(t) ? t : `${t}.`))])
    setExtraText('')
  }
  const addExtra = () => addLines(extraText)
  // MC4/EX1: un examen escrito como indicación («hemograma») se sugiere pasarlo a Exámenes, como en la consulta
  const { exams: clinicExams } = useExamCatalog()
  const examList = useMemo(() => examCatalog(clinicExams), [clinicExams])
  const typedExamHit = typedExam(extraText, examList)
  const typedDrug = extraText.trim().length >= 4 ? vademecum.find((x) => normalize(extraText).startsWith(normalize(x.name))) : undefined
  const toExam = (hit: { group: ExamInput['group']; name: string }) =>
    setExams((x) => (x.some((y) => examKey(y.name) === examKey(hit.name)) ? x : [...x, { group: hit.group, name: hit.name, priority: 'routine', place: defaultPlace(hit.group, true, settings) }]))
  const dxField = (<>
    {/* NO2 (ronda 16): en la nota de ingreso estándar se llama como en la consulta externa */}
    <DiagnosisPicker value={d.diagnoses} onChange={(v) => setD({ ...d, diagnoses: v })} label={admissionStd ? 'Impresión diagnóstica · CIE-11' : 'Diagnósticos (CIE-11)'} />
    {carried.length > 0 && !correct && <small className="muted" style={{ marginTop: -6 }}>{kind === 'admission'
      ? (dxChanged ? 'Cambiaste los diagnósticos del ingreso.' : 'Vienen del ingreso. Agrega, quita o cambia lo que haga falta.')
      : dxChanged ? 'Cambiaste los diagnósticos de la nota anterior.' : 'Vienen de la nota anterior. Agrega, quita o cambia lo que haga falta.'}</small>}
  </>)
  const vitalsBlock = correct ? null : (
            <fieldset className="fs note-vitals" key="nv"><legend>Signos vitales (opcional)</legend>
              {!nv ? <button type="button" className="btn btn--soft btn--sm self-start" onClick={() => { setNv({ ...EMPTY_VITALS }); setNvAt(inputDateTime(new Date())) }}><Plus size={15} />Agregar signos vitales</button> : (<>
                <VitalsFields v={nv} setV={setNv} checked={nvChecked} setChecked={setNvChecked} ageYears={ageYears} />
                <div className="form-grid">
                  <div className="field"><span>Hora de la toma</span>
                    <DateTimeField value={nvAt} invalid={nvFuture} onChange={setNvAt} label="Hora de la toma" />
                    {nvFuture && <small className="field__msg field__msg--error">No puede ser en el futuro.</small>}</div>
                  <span style={{ alignSelf: 'end' }}><button type="button" className="btn btn--ghost btn--sm" onClick={() => { setNv(null); setNvChecked(new Set()) }}>Quitar signos vitales</button></span>
                </div>
                {nvErrors.length > 0 && <small className="field__msg field__msg--error">Revisa {nvErrors.map((k) => VITALS[k].label.toLowerCase()).join(', ')}: el valor no es posible.</small>}
                <small className="muted">Quedan en la pestaña Signos vitales y en la curva térmica con tu nombre y origen «Nota de evolución», y cuentan como toma para enfermería.</small>
              </>)}
            </fieldset>
  )
  // Examen físico (con la «Guía por sistemas» de la consulta externa, NO2) y Observaciones: los mismos en la nota de ingreso y la evolución
  const examField = (
    <div className="field dictate-field"><span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>Examen físico
      {!d.exam.trim() && <button type="button" className="btn btn--ghost btn--sm" onClick={() => setD((x) => ({ ...x, exam: EXAM_GUIDE }))}><ClipboardList size={15} />Guía por sistemas</button>}</span>
      <AutoTextarea value={d.exam} onChange={(e) => setD({ ...d, exam: e.target.value })} aria-label="Examen físico" />
      <DictateButton label="Examen físico" onText={(f) => setD((x) => ({ ...x, exam: f(x.exam) }))} /></div>
  )
  const observationsField = (
    <label className="field dictate-field"><span>Observaciones</span>
      <AutoTextarea value={d.observations} onChange={(e) => setD({ ...d, observations: e.target.value })} />
      <DictateButton label="Observaciones" onText={(f) => setD((x) => ({ ...x, observations: f(x.observations) }))} /></label>
  )
  return (
    <Modal title={`${correct ? 'Corregir: ' : ''}${postop ? 'Nota postquirúrgica' : kind === 'admission' ? 'Nota de ingreso' : 'Nota de evolución'}`} wide inline={inline && !correct} className="note-modal" onClose={onClose}
      top={(!noteBlank || p.allergies.length > 0) && <>
        {!noteBlank && <DraftBadge savedAt={draft.savedAt} restored={draft.restored} offline={draft.offline} />}
        {p.allergies.length > 0 && <div className="alert-strip"><TriangleAlert size={16} />Alergias: {p.allergies.join(', ')}</div>}
      </>} footer={correct ? <>
      {expired ? <span className="field__msg field__msg--error mr-auto" role="alert">{GRACE_EXPIRED_TEXT}
        {onExpired && <button type="button" className="btn btn--soft btn--sm ml-sm" onClick={() => onExpired(correctionText())}>Pasar a una adenda</button>}</span>
        : <span className="mr-auto"><CorrectionReason value={why} onChange={setWhy} /></span>}
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!ready || busy || expired} onClick={async () => {
        setBusy(true)
        try {
          const body = postop ? { diagnoses: pq.postDiagnoses, postop: postopPayload(pq, pqCheck) } : format === 'soap' ? { ...n, diagnoses: d.diagnoses }
            : kind === 'admission' ? { ...d, evolution: '' } : { ...d, chiefComplaint: undefined, history: undefined }
          const orders = fixChanged && fix ? { indications: fix.indications.map(({ id, text }) => ({ id, text: text.trim() })).filter((x) => x.text), meds: fix.meds, keepExams: fix.keepExams, exams: fix.exams } : undefined
          const r = await api<{ examBatch?: string }>(`/inpatient/notes/${correct.id}/correct`, { body: { version: correct.version ?? 1, reason: why.trim() || undefined, ...body, orders } })
          draft.clear(); notify('Corrección guardada'); onSaved(r.examBatch, fixChanged && fix?.meds.some((x) => x.med.buyOutside) ? correct.id : undefined)
        } catch (e) {
          // Vencido: lo escrito queda en el borrador y se ofrece la adenda
          if (e instanceof ApiError && e.status === 409 && /minutos/.test(e.message)) setExpired(true)
          else notify(e instanceof Error ? e.message : 'No se pudo guardar la corrección.', 'error')
        } finally { setBusy(false) }
      }}>Guardar corrección</button>
    </> : <>
      {postop && pqCheck.missing.length && !blanks.length ? <span className="field__msg field__msg--warn mr-auto" role="status">Para firmar falta {pqCheck.missing.join(', ')}.</span>
        : admissionMissing.length && !blanks.length ? <span className="field__msg field__msg--warn mr-auto" role="status">Para firmar falta {admissionMissing.join(' y ')}.</span>
        : blanks.length ? <span className="field__msg field__msg--error mr-auto" role="status">Completa los espacios ___ de {blanks.join(', ')}.</span>
        : <span className="c-muted mr-auto fs-md">{meds.length ? `${meds.length} medicamento(s) nuevo(s)` : ''}{stop.length ? `${meds.length ? ', ' : ''}${stop.length} omitido(s)` : ''}</span>}
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!ready || busy || stale} onClick={async () => {
        setBusy(true)
        // MC7 (ronda 6): el servidor arma el cuadro completo (Continúa, Nueva, Modificada, Omitida) sobre la última nota firmada
        const chain = { basedOn, decisions: Object.entries(decisions).filter(([id]) => activeInd.some((a) => a.id === id)).map(([id, x]) => ({ id, ...x })) }
        const ok = await addInpatientNote(file.hospitalization.id, { kind, format: postop ? 'postop' : format, exams, ...(postop ? { subjective: '', objective: '', assessment: '', plan: '', diagnoses: pq.postDiagnoses, postop: postopPayload(pq, pqCheck) } : format === 'soap' ? { ...n, diagnoses: d.diagnoses } : { subjective: '', objective: '', assessment: '', plan: '', diagnoses: d.diagnoses, exam: d.exam.trim(), observations: d.observations.trim(),
            ...(kind === 'admission' ? { chiefComplaint: d.chiefComplaint.trim(), history: d.history.trim() } : { evolution: d.evolution.trim() }) }), meds, stopMedIds: stop, orders: extra, chain, vitals: vitalsMode, clientId, fluids: postop && !fluidsDirty ? undefined : fluidsPayload(fluids, fluidsNow),
          vitalsTaken: !postop && nvFilled ? { takenAt: fromLocalValue(nvAt).toISOString(), ...Object.fromEntries(FIELDS.map((k) => [k, vitalNumber(nv!, k)]).filter(([, x]) => x !== undefined)) } : undefined })
        setBusy(false)
        // EX2 (ronda 8): con estudios externos se ofrece el cuadro «Órdenes de exámenes: Imprimir / Descargar PDF»
        // ME10 (ronda 10): y con medicamentos «No hay en la clínica (va a receta)», también la receta
        if (ok) { draft.clear(); onSaved(ok.examBatch ?? undefined, meds.some((m) => m.buyOutside) ? ok.id : undefined) } else onStale?.()
      }}>Firmar nota</button>
    </>}>
      {/* NO2 (ronda 16): el mismo selector en la nota de ingreso y en las de evolución */}
      {!postop && !correct && (
        <div className="segmented" role="radiogroup" aria-label="Formato de la nota">
          <button type="button" role="radio" aria-checked={format === 'dx'} onClick={() => setFormat('dx')} title={kind === 'admission' ? 'El de la consulta externa: motivo, historia, examen físico, observaciones e impresión diagnóstica' : 'Diagnóstico, evolución, examen físico y observaciones'}>Estándar</button>
          <button type="button" role="radio" aria-checked={format === 'soap'} onClick={() => setFormat('soap')} title="Subjetivo, objetivo, análisis y plan">SOAP</button>
        </div>
      )}
      <div className={`note-editor${notesOnly && !correct ? ' note-editor--single' : ''}`}>
      <div className="soap-stack">
        {/* MC8 (ronda 6): opcional; si no se toca, no se guarda nada. Va antes del examen físico (en SOAP, arriba de la S: NE6) */}
        {postop && <PostopFields pq={pq} setPq={setPq} file={file} check={pqCheck} onAuthorize={onAuthorize} noAuth={!!correct} />}
        {!postop && <>
        {/* NE6 (ronda 9): en SOAP, los signos vitales van arriba, antes de «S. Subjetivo». NO3 (ronda 16): «Diagnósticos (CIE-11)»
            aparte; en la nota de ingreso, debajo de A y antes de P. NO4 (ronda 17): en la evolución, el primer bloque */}
        {format === 'soap' ? soapBlocks(kind).map((b) => {
          if (b === 'dx') return <Fragment key={b}>{dxField}</Fragment>
          if (b === 'vitals') return <Fragment key={b}>{vitalsBlock}</Fragment>
          const s = SOAP.find((x) => x.key === b)!
          return <label key={b} className="field dictate-field"><span>{s.letter}. {s.label} <small className="fw-normal">{s.hint}</small></span>
            <AutoTextarea value={n[s.key]} onChange={(e) => setN({ ...n, [s.key]: e.target.value })} />
            <DictateButton label={s.label} onText={(f) => setN((x) => ({ ...x, [s.key]: f(x[s.key]) }))} /></label>
        }) : admissionStd ? (<>
          {/* NO2 (ronda 16): la nota de ingreso con el formato estándar de la consulta externa (es una historia clínica) */}
          <label className="field"><span>Motivo de consulta</span>
            <textarea className="textarea textarea--sm" rows={2} value={d.chiefComplaint} onChange={(e) => setD({ ...d, chiefComplaint: e.target.value })} aria-label="Motivo de consulta" /></label>
          <label className="field dictate-field"><span>Historia de la enfermedad actual</span>
            <AutoTextarea value={d.history} onChange={(e) => setD({ ...d, history: e.target.value })} aria-label="Historia de la enfermedad actual"
              placeholder="Inicio, evolución, características, factores que agravan o alivian, síntomas acompañantes y tratamientos recibidos." />
            <DictateButton label="Historia de la enfermedad actual" onText={(f) => setD((x) => ({ ...x, history: f(x.history) }))} /></label>
          {vitalsBlock}
          {examField}
          {observationsField}
          {dxField}
        </>) : (<>
          {dxField}
          {/* Ronda 8: el cuadro entre el diagnóstico y el examen físico */}
          <label className="field dictate-field"><span>Evolución <small className="fw-normal">Cómo ha seguido desde la nota anterior y lo que refiere el paciente.</small></span>
            <AutoTextarea value={d.evolution} onChange={(e) => setD({ ...d, evolution: e.target.value })} />
            <DictateButton label="Evolución" onText={(f) => setD((x) => ({ ...x, evolution: f(x.evolution) }))} /></label>
          {vitalsBlock}
          {examField}
          {observationsField}
        </>)}
        </>}
      </div>
      {correct && fix ? <CorrectionOrders n={correct} file={file} p={p} value={fix} onChange={setFix} locks={locks} /> : notesOnly ? null : <div className="note-editor__orders">
      <div className="set-bar">
        <OrderSetPicker where={file.hospitalization.kind === 'observation' ? 'observation' : 'hospital'} patientId={p.id} onApply={applySet} />
        <SaveSetButton items={[...extra.map((text) => ({ text })), ...meds.map(({ drug, presentation, dose, route, everyHours, prn, prnCondition, days, instructions, infusionRate, infusionUnit }) => ({ med: { drug, presentation, dose, route, everyHours, prn, prnCondition, days, instructions: instructions || undefined, infusionRate, infusionUnit } })), ...exams.map((e) => ({ exam: e }))]} />
      </div>
      <fieldset className="fs"><legend>Indicaciones</legend>
        <VitalsFrequency value={vitalsMode} onChange={setVitalsMode} />
        {stale && <div className="alert-strip alert-strip--amber wrap" role="alert">
          <span>Otra nota se firmó mientras escribías. Las indicaciones y los medicamentos activos ya se actualizaron con ella: revísalos antes de firmar.</span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => {
            // NE4: si no tocaste los diagnósticos, se recalculan sobre la nota que se acaba de firmar
            const fresh = currentDiagnoses(file)
            if (!dxChanged) setD((x) => ({ ...x, diagnoses: fresh }))
            setCarried(fresh)
            setBasedOn(lastId)
          }}>Entendido</button></div>}
        {activeInd.length > 0 && (
          <div className="note-editor__active">
            <h4>Indicaciones activas</h4>
            <p className="c-muted fs-md">Vienen de la nota anterior y siguen vigentes. Marca OMITIR para suspender una; Cambiar la cierra y deja la nueva.</p>
            <div className="rows">
              {activeInd.map((a) => {
                const dec = decisions[a.id]
                const set = (x?: { action: 'omit' | 'change'; text?: string }) => { const next = { ...decisions }; if (x) next[a.id] = x; else delete next[a.id]; setDecisions(next) }
                return (
                  <div key={a.id} className="omit-row">
                    <span>
                      <span className={dec ? 'struck' : ''}>{a.text}</span>
                      {dec?.action === 'change' && changingInd !== a.id && <span className="omit-row__new">→ {dec.text}</span>}
                      {changingInd === a.id && <input className="input" autoFocus defaultValue={dec?.text ?? a.text} aria-label={`Cambiar «${a.text}»`}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur() } if (e.key === 'Escape') setChangingInd(null) }}
                        onBlur={(e) => { const t = e.target.value.trim(); set(t && t !== a.text ? { action: 'change', text: /[.!?]$/.test(t) ? t : `${t}.` } : undefined); setChangingInd(null) }} />}
                    </span>
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {dec?.action === 'change' ? <button type="button" className="btn btn--ghost btn--sm" onClick={() => set(undefined)}>Deshacer</button>
                        : <button type="button" className="btn btn--ghost btn--sm" disabled={dec?.action === 'omit'} onClick={() => setChangingInd(a.id)}>Cambiar</button>}
                      <label><input type="checkbox" checked={dec?.action === 'omit'} onChange={(e) => set(e.target.checked ? { action: 'omit' } : undefined)} /> OMITIR</label>
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        <p className="c-muted fs-md">{activeInd.length ? 'Indicaciones nuevas' : 'Lo que no es medicamento ni examen'}, una por línea: dieta, cuidados, signos vitales. Puedes pegar una lista completa.</p>
        {extra.length > 0 && <ol className="orders">{extra.map((o, i) => (
          <li key={i}><span className="orders__n">{i + 1}.</span>
            <input className={`input${hasBlank(o) ? ' input--blank' : ''}`} value={o} aria-label={`Indicación ${i + 1}`} aria-invalid={hasBlank(o)} onChange={(e) => setExtra(extra.map((x, j) => j === i ? e.target.value : x))} />
            <span className="orders__tools">
              {(() => { const hit = typedExam(o, examList); return hit && (
                <button type="button" className="icon-btn" aria-label={`Pasar «${hit.name}» a Exámenes`} title={`Pasar «${hit.name}» a Exámenes`}
                  onClick={() => { toExam(hit); setExtra(extra.filter((_, j) => j !== i)) }}><FlaskConical size={14} /></button>) })()}
              {/* NO2 (ronda 16): subir y bajar, como en la consulta externa */}
              <button type="button" className="icon-btn" aria-label="Subir" disabled={i === 0} onClick={() => setExtra(moveItem(extra, i, -1))}><ArrowUp size={14} /></button>
              <button type="button" className="icon-btn" aria-label="Bajar" disabled={i === extra.length - 1} onClick={() => setExtra(moveItem(extra, i, 1))}><ArrowDown size={14} /></button>
              <button type="button" className="icon-btn" aria-label="Quitar indicación" onClick={() => setExtra(extra.filter((_, j) => j !== i))}><X size={14} /></button></span></li>
        ))}</ol>}
        <div className="order-add">
          <textarea className="textarea textarea--sm" rows={2} value={extraText} aria-label="Nueva indicación"
            placeholder={`${extra.length + 1}. Escribe una indicación y presiona Enter, o pega varias líneas`}
            onChange={(e) => setExtraText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addExtra() } }}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text')
              if (!text.includes('\n')) return
              e.preventDefault()
              addLines(text)
            }} />
          <button className="btn btn--soft" disabled={!extraText.trim()} type="button" onClick={addExtra} aria-label="Agregar indicación"><Plus size={16} /></button>
        </div>
        {typedDrug && !extraText.includes('\n') && (
          <div className="suggest-med" role="status">
            <Pill size={15} />«{typedDrug.name}» es un medicamento. ¿Agregarlo como medicamento para que pase a la hoja de medicamentos?
            <button type="button" className="btn btn--soft btn--sm" onClick={() => {
              setAddSeed({ drug: typedDrug.name, presentation: typedDrug.presentation, dose: typedDrug.usual?.dose ?? '', route: typedDrug.usual?.route ?? (/ampolla|vial|frasco|bolsa/i.test(typedDrug.presentation) ? 'Intravenosa' : 'Oral'),
                everyHours: frequencyHours(typedDrug.usual?.frequency ?? '') ?? 8, prn: false })
              setAdding(true); setEditingMed(null); setReplacing(null); setExtraText('')
            }}>Sí, agregarlo</button>
          </div>
        )}
        {typedExamHit && !typedDrug && !extraText.includes('\n') && (
          <div className="suggest-med" role="status">
            <FlaskConical size={15} />¿Agregar «{typedExamHit.name}» como examen? Así se imprime en su orden y enfermería le da seguimiento.
            <button type="button" className="btn btn--soft btn--sm" onClick={() => { toExam(typedExamHit); setExtraText('') }}>Sí, agregarlo</button>
          </div>
        )}
      </fieldset>
      {/* NO2 (ronda 16): aquí va el bloque de órdenes extra (IE1: «Ingestas y excretas»), debajo de Indicaciones y antes de Exámenes */}
      <FluidsOrder value={fluids} current={fluidsNow} onChange={setFluids} />
      {afterIndications}
      {/* MC3 (ronda 5): Indicaciones → Exámenes → Medicamentos (con los activos dentro, antes de «Agregar medicamento») */}
      <fieldset className="fs"><legend>Exámenes</legend>
        <ExamsBlock value={exams} onChange={setExams} inStay />
      </fieldset>
      <fieldset className="fs note-editor__meds"><legend>Medicamentos</legend>
        <p className="c-muted fs-md">Pasan solos a la hoja de medicamentos.</p>
        {active.length > 0 && (
          <div className="note-editor__active">
            <h4>Medicamentos activos</h4>
            <p className="c-muted fs-md">Marca OMITIR para suspender un medicamento; desde ahora la hoja de enfermería lo mostrará omitido.</p>
            <div className="rows">
              {active.map((m) => (
                <div key={m.id} className="omit-row">
                  <span className={stop.includes(m.id) || meds.some((x) => x.replacesId === m.id) ? 'struck' : ''}>{medLabel(m)}{m.buyOutside && <span className="badge badge--amber rx-tag">Receta</span>}</span>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button type="button" className="btn btn--ghost btn--sm" disabled={stop.includes(m.id) || meds.some((x) => x.replacesId === m.id)} onClick={() => { setReplacing(m.id); setAdding(false) }}>Cambiar</button>
                    <label><input type="checkbox" checked={stop.includes(m.id)} onChange={(e) => { setStop(e.target.checked ? [...stop, m.id] : stop.filter((x) => x !== m.id)); if (e.target.checked) setReplacing(null) }} /> OMITIR</label>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {meds.length > 0 && <ol className="orders">{meds.map((m, i) => (
          <li key={i} className={medHasBlank(m) ? 'orders__blank' : undefined}><span className="orders__n">–</span>
            <span className="orders__text"><Pill size={13} className="orders__pill" />{medLabel(m)}{m.days ? ` por ${m.days} días` : ''}{m.instructions ? `. ${m.instructions}` : ''}{m.quantity && !m.buyOutside ? ` · Cantidad: ${m.quantity}` : ''}
              {m.buyOutside && <span className="badge badge--amber rx-tag">Receta{m.buyQuantity ? ` · comprar ${m.buyQuantity}` : ''}</span>}
              {!inVademecum(m.drug) && <span className="badge badge--amber ml-xs">No está en el vademécum de la clínica</span>}</span>
            <span className="orders__tools">
              <button type="button" className="icon-btn" aria-label={`Editar ${m.drug}`} onClick={() => { setEditingMed(i); setAdding(false); setReplacing(null) }}><Pencil size={14} /></button>
              <button type="button" className="icon-btn" aria-label={`Quitar ${m.drug}`} onClick={() => { setMeds(meds.filter((_, j) => j !== i)); setEditingMed(null) }}><X size={14} /></button></span></li>
        ))}</ol>}
        {replacing && <p className="c-muted fs-md">La indicación nueva reemplaza a {active.find((m) => m.id === replacing)?.drug}. La nota conservará el resto de órdenes.</p>}
        {editingMed !== null && meds[editingMed] ? <MedicationForm kind="stay" key={`edit-${editingMed}`} patient={p} current={[...meds.filter((_, j) => j !== editingMed), ...active]} initial={editInitial(meds[editingMed])}
            onSave={(m) => { setMeds(meds.map((x, j) => (j === editingMed ? { ...m, replacesId: x.replacesId } : x))); setEditingMed(null) }} onCancel={() => setEditingMed(null)} />
          : replacing ? <MedicationForm kind="stay" patient={p} current={meds} initial={medToNew(active.find((m) => m.id === replacing)!, file.doses)} onSave={(m) => { setMeds([...meds, { ...m, replacesId: replacing }]); setReplacing(null) }} onCancel={() => setReplacing(null)} />
          : adding ? <MedicationForm kind="stay" key={`${meds.length}-${addSeed?.drug ?? ''}`} patient={p} current={[...meds, ...active]} initial={addSeed} onSave={(m) => { setMeds([...meds, m]); setAdding(false); setAddSeed(undefined) }} onSaveAnother={(m) => { setMeds([...meds, m]); setAddSeed(undefined) }} onCancel={() => { setAdding(false); setAddSeed(undefined) }} />
          : <button className="btn btn--soft" onClick={() => setAdding(true)}><Plus size={15} />Agregar medicamento</button>}
      </fieldset>
      </div>}
      </div>
    </Modal>
  )
}

/** NO2 (ronda 16): mueve una indicación una posición (subir o bajar). */
export const moveItem = <T,>(list: T[], i: number, d: -1 | 1) => {
  const j = i + d
  if (j < 0 || j >= list.length) return list
  const next = [...list]; [next[i], next[j]] = [next[j], next[i]]
  return next
}

/** Un medicamento de la nota (p. ej. de un set) para editarlo en el formulario; sin hora, el formulario pone la actual. */
export function editInitial(m: NewMed): NewMed {
  const { firstAt, ...rest } = m
  return { ...rest, instructions: m.instructions ?? '', ...(firstAt ? { firstAt: inputDateTime(new Date(firstAt)) } : {}) }
}

export function medToNew(m: InpatientMed, doses: Dose[] = []): NewMed & { loadingGivenAt?: string } {
  // ME2 (ronda 8): si la dosis inicial ya se administró, «Cambiar» no la repite (sigue la de las siguientes); si no, se
  // puede editar. ME1: una infusión conserva su velocidad para cambiarla.
  const loadingGiven = m.loadingDose ? doses.find((d) => d.medId === m.id && d.status === 'given' && d.scheduledAt && new Date(d.scheduledAt).getTime() === new Date(m.firstAt).getTime()) : undefined
  const keepLoading = !!m.loadingDose && !loadingGiven
  const firstAt = keepLoading && new Date(m.firstAt) > new Date() ? new Date(m.firstAt) : new Date()
  return { drug: m.drug, presentation: m.presentation ?? '', dose: m.dose, route: m.route, everyHours: m.everyHours, prn: m.prn, prnCondition: m.prnCondition, instructions: m.instructions ?? '', firstAt: inputDateTime(firstAt), days: m.days,
    infusionRate: m.infusionRate, infusionUnit: m.infusionUnit, loadingDose: keepLoading ? m.loadingDose : undefined, loadingStat: keepLoading ? m.loadingStat : undefined,
    nebulization: m.nebulization ? structuredClone(m.nebulization) : undefined, buyOutside: m.buyOutside, buyQuantity: m.buyQuantity, quantity: m.quantity,
    loadingGivenAt: loadingGiven?.givenAt }
}

/** EX2 (ronda 8): al firmar una nota con estudios externos: «Órdenes de exámenes: Imprimir / Descargar PDF». */
export function ExamOrdersOffer({ batch, rxNote, meds = [], onClose }: { batch?: string; rxNote?: string; meds?: InpatientMed[]; onClose: () => void }) {
  const nav = useNavigate()
  const { notify, can } = useStore()
  // ME12 (ronda 11): «Elegir medicamentos» abre «Generar receta» (médico)
  const [choosing, setChoosing] = useState(false)
  // ME10 (ronda 10): la receta de lo que no hay en la clínica (de esta nota), con los datos del médico que la firmó
  const rx = async (how: 'imprimir' | 'pdf') => {
    try { const { id } = await api<{ id: string }>('/print-jobs', { body: { kind: 'rx', noteId: rxNote } }); nav(`/app/impresion/${id}?accion=${how}`) } catch (x) { notify((x as Error).message, 'error') }
  }
  return (
    <Modal title={batch && rxNote ? 'Órdenes de exámenes y receta' : batch ? 'Órdenes de exámenes' : 'Receta'} onClose={onClose} footer={<button className="btn btn--ghost" onClick={onClose}>Ahora no</button>}>
      {batch && <div className="offer-row">
        <p><b>Órdenes de exámenes.</b> La nota pidió estudios externos: el paciente lleva la orden en la mano (o en el teléfono). También queda en la tarjeta de la nota y en la pestaña Exámenes, en «Órdenes impresas».</p>
        <span className="offer-row__btns">
          <button className="btn btn--primary btn--sm" onClick={() => nav(`/app/examenes/orden/${batch}?accion=imprimir`)}><Printer size={15} />Imprimir</button>
          <button className="btn btn--soft btn--sm" onClick={() => nav(`/app/examenes/orden/${batch}?accion=pdf`)}><FileText size={15} />Descargar PDF</button>
        </span>
      </div>}
      {rxNote && <div className="offer-row">
        <p><b>Receta.</b> Hay medicamentos que la clínica no tiene: siguen en la hoja y la familia los compra con esta receta. Válida solo con firma y sello del médico.</p>
        <span className="offer-row__btns">
          <button className="btn btn--primary btn--sm" onClick={() => rx('imprimir')}><Printer size={15} />Imprimir</button>
          <button className="btn btn--soft btn--sm" onClick={() => rx('pdf')}><FileText size={15} />Descargar PDF</button>
          {can('inpatient.orders') && <button className="btn btn--ghost btn--sm" onClick={() => setChoosing(true)}><Pill size={15} />Elegir medicamentos</button>}
        </span>
      </div>}
      {choosing && <GenerateRxModal meds={meds} onClose={() => setChoosing(false)} />}
    </Modal>
  )
}

// ---------- Enfermería ----------
