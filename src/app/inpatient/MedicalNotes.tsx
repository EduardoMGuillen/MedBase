import { useEffect, useState } from 'react'
import { Combo } from '../../components/Combo'
import { fromLocalValue } from '../../lib/dateInput'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BedDouble, FileSignature, LogOut, NotebookPen, Pill, Send, Syringe } from 'lucide-react'
import { useStore } from '../../lib/store'
import { Modal } from '../../components/ui'
import { date, dateTime, inputDateTime, shortStaff, time } from '../../lib/format'
import { DateTimeField } from '../../components/DateTimeField'
import { mainRole, ROLE_LABEL } from '../../lib/permissions'
import { LINE_TAG, defaultSpecialty, orderMark, pendingOrdersOf, splitOrders } from '../../lib/inpatient'
import { NoteColumns, NoteExams, NoteText } from '../../components/NoteColumns'
import { DictateField } from '../../components/Dictate'
import { AuthorizationForm } from '../Authorization'
import { surgicalAuths, type PostopDraft } from '../PostopNote'
import { normalize } from '../../lib/patients'
import { useNow } from '../../lib/hooks'
import type { OrderLineTag, HospProcedure, InpatientFile as File, InpatientNote, Patient } from '../../lib/types'
import { ConsentChoice } from '../ConsentFlow'
import { DischargeView, DischargeWriter } from '../DischargeNote'
import { Addenda, DraftBadge, SignedBadge } from '../../components/Addenda'
import { useDraftSync } from '../../lib/drafts'
import { api, ApiError } from '../../lib/api'
import { GRACE_EXPIRED_TEXT } from '../../lib/grace'
import { CorrectionReason, GraceButton, VersionTag } from '../../components/Grace'
import { BedFields } from '../../components/BedFields'
import { ReferralModal } from '../Referral'
import { features } from '../../lib/permissions'
import { vitalsModeText } from '../../lib/vitalsSheet'
import { AnesthesiaCard } from '../../components/AnesthesiaSheet'
import { usePreEval } from '../../components/PreEval'
import { ActionRow, type RowAction } from '../../components/ActionRow'
import { ClipboardCheck } from 'lucide-react'
import { SurgicalCountCard } from '../../components/SurgicalCount'
import { fluidsOrderText } from '../../lib/fluids'
import { ConsultEntry } from './ConsultEntry'
import { ExamOrdersOffer } from './NoteEditor'
import { NoteEditor } from './NoteEditor'
import { RxFromNote } from './Annexes'

// Expediente de la estancia: notas médicas (ingreso, evolución, procedimiento), órdenes pendientes y su corrección.
export const SOAP: { key: 'subjective' | 'objective' | 'assessment' | 'plan'; letter: string; label: string; hint: string }[] = [
  { key: 'subjective', letter: 'S', label: 'Subjetivo', hint: 'Lo que refiere el paciente.' },
  { key: 'objective', letter: 'O', label: 'Objetivo', hint: 'Signos vitales, examen físico y resultados.' },
  // NO3 (ronda 16): la A es el análisis (la evolución), no el diagnóstico: los diagnósticos van aparte, codificados (CIE-11)
  { key: 'assessment', letter: 'A', label: 'Análisis', hint: 'Evolución y razonamiento clínico: cómo va el paciente y por qué.' },
  { key: 'plan', letter: 'P', label: 'Plan', hint: 'Lo que piensas hacer, en texto. Las órdenes van a la derecha.' },
]

/** "22/10 18:10": la fecha corta con la hora, como se escribe en la nota en papel. */
export const dm = (iso: string) => `${date(iso, { day: '2-digit', month: '2-digit' })} ${time(iso)}`

/** Una entrada de la línea de tiempo: nota médica (SOAP, procedimiento o egreso) o registro anterior de procedimiento. */
export type TimelineItem = { at: string; key: string; note?: InpatientNote; legacy?: HospProcedure }

/**
 * HO1 (ronda 12): las notas de evolución, de procedimiento y postquirúrgicas se escriben abajo, dentro del expediente (no en una
 * ventana). La nota sigue abierta al cambiar de pestaña (signos, curva térmica, medicamentos, exámenes, anexos): con `show`
 * en falso solo se dibuja el editor, debajo de la pestaña que se esté viendo.
 */
export function MedicalNotes({ file, p, reload, show = true, onWriting }: { file: File; p: Patient; reload: () => void; show?: boolean; onWriting?: (title: string | null) => void }) {
  const { staffById, can } = useStore()
  const notes = file.notes.filter((n) => n.kind === 'admission' || n.kind === 'evolution' || n.kind === 'discharge' || n.kind === 'procedure')
  const h = file.hospitalization
  const obs = h.kind === 'observation'
  // La nota de consulta externa que dio el ingreso es la nota de ingreso (también en observación): no se pide otra
  const hasAdmission = notes.some((n) => n.kind === 'admission') || obs || !!h.observationAt || !!h.consultationId
  const [converting, setConverting] = useState(false)
  const [referring, setReferring] = useState(false)
  const { settings } = useStore()
  const discharged = notes.some((n) => n.kind === 'discharge')
  // RF1 (ronda 8): «¿Registrar el egreso?» después de firmar una referencia abre el egreso con «Trasladado a otro centro»
  const [notesParams, setNotesParams] = useSearchParams()
  const transfer = notesParams.get('egreso') === 'traslado'
  const [writing, setWriting] = useState<null | 'note' | 'procedure' | 'postop' | 'discharge' | 'authorization'>(null)
  // Al generar la quirúrgica desde una nota, se vuelve a esa nota (su borrador sigue igual)
  const [back, setBack] = useState<null | 'procedure' | 'postop'>(null)
  const [postopSeed, setPostopSeed] = useState<Partial<PostopDraft> | undefined>()
  // EX2 (ronda 8): lote de exámenes con externos de la nota recién firmada
  const [ordersFor, setOrdersFor] = useState<{ batch?: string; rxNote?: string } | null>(null)
  const [authFor, setAuthFor] = useState<string | undefined>()
  // MC2: la quirúrgica recién generada (con sus tres salidas) y la nota de procedimiento que la pidió, para volver a ella
  const [surgicalFor, setSurgicalFor] = useState<string | null>(null)
  const [procDraft, setProcDraft] = useState<ProcDraft | undefined>()
  const nav = useNavigate()
  const open = file.hospitalization.status === 'active'
  // Los procedimientos registrados antes de las notas de procedimiento se conservan, sin estado. Las
  // autorizaciones (y las anteriores) están en Anexos.
  const timeline: TimelineItem[] = [
    // El procedimiento va en el orden de la hora en que se hizo, no de cuando se escribió la nota
    ...notes.map((n) => ({ at: n.procedure?.performedAt ?? n.at, key: n.id, note: n })),
    ...file.procedures.filter((x) => x.kind === 'procedure').map((x) => ({ at: x.createdAt, key: x.id, legacy: x })),
  ].sort((a, b) => a.at.localeCompare(b.at) || a.key.localeCompare(b.key))
  const doctor = can('inpatient.orders')
  // IM2 (ronda 12): el radiólogo (intervencionista) escribe notas de evolución, de procedimiento menor y postquirúrgicas (mayor)
  const writer = doctor || can('inpatient.notes')
  const inlineTitle = writing === 'note' ? (hasAdmission ? 'Nota de evolución' : 'Nota de ingreso') : writing === 'procedure' ? 'Nota de procedimiento' : writing === 'postop' ? 'Nota postquirúrgica' : null
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onWriting?.(inlineTitle) }, [inlineTitle])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (transfer && doctor && hasAdmission && !discharged && h.status === 'active') setWriting('discharge')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transfer])
  // NO2 (ronda 16): «?nota=ingreso» abre la nota de ingreso (formato estándar) de una estancia que no la tiene. Es la entrada para
  // HO2 (ingreso directo: al terminar el ingreso y la autorización se abre sola); el borrador se guarda como siempre
  const openAdmission = notesParams.get('nota') === 'ingreso'
  useEffect(() => {
    if (!openAdmission) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (doctor && !hasAdmission && h.status === 'active') setWriting('note')
    const q = new URLSearchParams(notesParams); q.delete('nota'); setNotesParams(q, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openAdmission])
  // R18-OB1 (ronda 18): la fila de acciones. En Observación no hay cirugía (autorización quirúrgica, valoración preanestésica,
  // nota postquirúrgica): si el paciente va a cirugía, primero pasa a hospitalización. Hospitalización las conserva todas.
  const pre = usePreEval({ stayId: h.id, patientId: p.id })
  const surgery = !obs
  const actions = ([
    (doctor || (writer && hasAdmission)) && { key: 'note', label: hasAdmission ? 'Nueva nota de evolución' : 'Escribir nota de ingreso', icon: <NotebookPen size={16} />, run: () => setWriting('note'), tour: 'nueva-evolucion' },
    writer && { key: 'procedure', label: doctor ? 'Procedimiento' : 'Procedimiento menor', icon: <Syringe size={16} />, run: () => setWriting('procedure') },
    surgery && (doctor || can('inpatient.care')) && { key: 'auth', label: 'Autorización quirúrgica', icon: <FileSignature size={16} />, run: () => { setAuthFor(undefined); setWriting('authorization') } },
    // PQ4 (ronda 16): la valoración preanestésica, antes de la cirugía
    surgery && pre.available && { key: 'preeval', label: 'Valoración preanestésica', icon: <ClipboardCheck size={16} />, run: pre.open, testid: 'preeval-button' },
    surgery && writer && hasAdmission && { key: 'postop', label: doctor ? 'Nota postquirúrgica' : 'Procedimiento mayor (nota postquirúrgica)', icon: <NotebookPen size={16} />, run: () => setWriting('postop') },
    doctor && hasAdmission && !discharged && { key: 'discharge', label: 'Egreso', icon: <LogOut size={16} />, run: () => setWriting('discharge'), tour: 'egreso' },
    doctor && obs && features(settings).hospital && { key: 'convert', label: 'Pasar a hospitalización', icon: <BedDouble size={16} />, run: () => setConverting(true) },
    // Ronda 8: referencia a otro centro desde la observación y la hospitalización
    doctor && { key: 'referral', label: 'Referencia', icon: <Send size={16} />, run: () => setReferring(true) },
  ] as (RowAction | false | undefined)[]).filter((a): a is RowAction => !!a)
  const editors = <>
      {writing === 'procedure' && <ProcedureNoteForm inline obs={obs} file={file} initial={procDraft} onClose={() => { setWriting(null); setProcDraft(undefined) }} onSaved={() => { setWriting(null); setProcDraft(undefined); reload() }}
        onAuthorize={(draft) => { setProcDraft(draft); setBack('procedure'); setAuthFor(draft.name); setWriting('authorization') }}
        onConvert={(draft) => { setProcDraft(undefined); setPostopSeed({ procedureName: draft.name, description: draft.text, startAt: draft.performedAt, endAt: draft.performedAt, urgent: draft.urgent, justification: draft.justification }); setWriting('postop') }} />}
      {writing === 'postop' && <NoteEditor inline notesOnly={!doctor} file={file} p={p} kind="evolution" variant="postop" seed={postopSeed} onClose={() => { setWriting(null); setPostopSeed(undefined) }} onSaved={(b, rx) => { setWriting(null); setPostopSeed(undefined); reload(); if (b || rx) setOrdersFor({ batch: b, rxNote: rx }) }} onStale={reload}
        onAuthorize={(name) => { setBack('postop'); setAuthFor(name || undefined); setWriting('authorization') }} />}
      {writing === 'note' && <NoteEditor inline notesOnly={!doctor} file={file} p={p} kind={hasAdmission ? 'evolution' : 'admission'} onClose={() => setWriting(null)} onSaved={(b, rx) => { setWriting(null); reload(); if (b || rx) setOrdersFor({ batch: b, rxNote: rx }) }} onStale={reload} />}
  </>
  const modals = <>
      {writing === 'authorization' && <AuthorizationForm file={file} p={p} template="surgical" initialProcedure={authFor} onClose={() => { setWriting(back); setBack(null) }}
        onCreated={(a) => { setWriting(null); setSurgicalFor(a.id) }} />}
      {surgicalFor && <ConsentChoice authorizationId={surgicalFor} p={p} onDone={() => { setSurgicalFor(null); reload(); if (back) { setWriting(back); setBack(null) } }} />}
      {ordersFor && <ExamOrdersOffer batch={ordersFor.batch} rxNote={ordersFor.rxNote} meds={file.meds} onClose={() => setOrdersFor(null)} />}
  </>
  // En otra pestaña: solo la nota que se está escribiendo, debajo de lo que se ve
  if (!show) return (<>
    {inlineTitle && <div className="hc note-dock">{editors}</div>}
    {modals}
  </>)
  return (
    <div className="hc">
      {open && (writer || can('inpatient.care')) && (
        <section className="panel">
          <div className="panel__body stack">
            <p className="muted m-0">{!hasAdmission ? 'Lo primero es la nota de ingreso, con las indicaciones de medicamentos.'
              : `Las notas quedan en orden, de la más antigua a la más reciente. ${obs ? 'Procedimientos y egreso' : 'Procedimientos, notas postquirúrgicas y egreso'} también son notas de evolución.`}</p>
            <ActionRow actions={actions} label="Acciones del expediente" />
          </div>
        </section>
      )}
      {pre.ui}
      {can('orders.review') && <PendingOrdersPanel file={file} reload={reload} />}
      {/* MC5: la nota de egreso se escribe en la misma hoja que la epicrisis */}
      {writing === 'discharge' && <DischargeWriter file={file} p={p} initialCondition={transfer ? 'Trasladado a otro centro' : undefined} onDone={() => { setWriting(null); reload(); if (transfer) { const q = new URLSearchParams(notesParams); q.delete('egreso'); setNotesParams(q, { replace: true }) } }} />}
      {referring && <ReferralModal from={{ kind: 'stay', id: h.id }} stayKind={h.kind === 'observation' ? 'observation' : 'hospital'} onClose={() => { setReferring(false); reload() }} />}
      {converting && <ConvertModal file={file} p={p} onClose={() => setConverting(false)} onDone={() => nav(`/app/hospitalizados/${h.id}?firmar=1`)} />}
      {h.consultationId && <ConsultEntry consultationId={h.consultationId} file={file} />}
      {timeline.length ? timeline.map((item) => {
        if (item.legacy) {
          const x = item.legacy
          return (
            <article key={x.id} className="panel consult-entry">
              <div className="panel__head">
                <div><h2>Procedimiento <span className="badge">Registro anterior</span></h2>
                  <p>{date(x.createdAt, { weekday: 'long', day: 'numeric', month: 'long' })}, {time(x.createdAt)}, {staffById(x.createdBy)?.name}</p></div>
              </div>
              <div className="panel__body">
                <p><b>{x.name}</b></p>
                {x.scheduledAt && <p className="muted">Fecha anotada: {dateTime(x.scheduledAt)}</p>}
                {x.notes && <p>{x.notes}</p>}
              </div>
            </article>
          )
        }
        const n = item.note!
        if (n.kind === 'discharge') return n.discharge ? <DischargeView key={n.id} note={n} file={file} reload={reload} /> : null
        if (n.kind === 'procedure') return <ProcedureNote key={n.id} n={n} file={file} reload={reload} />
        return <SoapNote key={n.id} n={n} file={file} reload={reload} />
      }) : !h.consultationId && <section className="panel"><div className="empty">Todavía no hay notas de evolución.</div></section>}
      {editors}
      {modals}
    </div>
  )
}

/** Observación → hospitalización: se elige la cama y se completan los datos del acompañante. Todo lo demás se conserva. */
export function ConvertModal({ file, p, onClose, onDone }: { file: File; p: Patient; onClose: () => void; onDone: () => void }) {
  const { convertToHospital, user } = useStore()
  const [f, setF] = useState({ bedId: '', specialty: defaultSpecialty(user), companionName: p.emergencyName ?? '', companionRelation: p.emergencyRelation ?? '', companionPhone: p.emergencyPhone ?? '', patientPhone: file.hospitalization.patientPhone ?? p.phone })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  return (
    <Modal title="Pasar a hospitalización" onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!f.bedId || busy} onClick={async () => {
        setBusy(true)
        const r = await convertToHospital(file.hospitalization.id, { bedId: f.bedId, specialty: f.specialty.trim() || undefined, companionName: f.companionName.trim() || undefined, companionRelation: f.companionRelation.trim() || undefined,
          companionPhone: f.companionPhone.trim() || undefined, patientPhone: f.patientPhone.trim() || undefined })
        setBusy(false)
        if (r) onDone()
      }}><BedDouble size={16} />Hospitalizar</button>
    </>}>
      <p className="c-muted fs-base">Las notas, los medicamentos, los laboratorios y las autorizaciones de la observación pasan al expediente de hospitalización, en orden y con su autoría.</p>
      <BedFields bedId={f.bedId} specialty={f.specialty} onChange={(v) => setF({ ...f, ...v })} />
      <div className="form-grid">
        <label className="field"><span>Quién lo acompaña</span><input className="input" value={f.companionName} onChange={set('companionName')} /></label>
        <label className="field"><span>Parentesco</span><input className="input" value={f.companionRelation} onChange={set('companionRelation')} /></label>
        <label className="field"><span>Teléfono del acompañante</span><input className="input" inputMode="tel" value={f.companionPhone} onChange={set('companionPhone')} /></label>
        <label className="field"><span>Teléfono del paciente</span><input className="input" inputMode="tel" value={f.patientPhone} onChange={set('patientPhone')} /></label>
      </div>
    </Modal>
  )
}

/**
 * Nota de ingreso o de evolución como en papel: arriba quién escribe, con su rol, la fecha y la hora; a la
 * izquierda el texto clínico y a la derecha las indicaciones numeradas y, debajo, los medicamentos. En las notas
 * con checklist, enfermería marca cada orden y queda su nombre y la hora junto a ella. En celular se apilan.
 */
export function SoapNote({ n, file, reload }: { n: InpatientNote; file: File; reload: () => void }) {
  const { staffById, can, user, patient } = useStore()
  const { meds, indications } = splitOrders(n, file)
  const author = staffById(n.authorId)
  // GE4 (ronda 9): corregir en el periodo de gracia; si vence con la ventana abierta, lo escrito pasa a una adenda
  const [correcting, setCorrecting] = useState(false)
  const [toAddendum, setToAddendum] = useState<string | undefined>()
  const [ordersFor, setOrdersFor] = useState<{ batch?: string; rxNote?: string } | null>(null)
  const p = patient(file.hospitalization.patientId)
  return (
    <article className="panel consult-entry">
      <div className="panel__head">
        <div><h2>{n.kind === 'admission' ? 'Nota de ingreso' : n.format === 'postop' ? 'Nota postquirúrgica' : 'Nota de evolución'}</h2>
          <p>{author?.name}{author ? `, ${ROLE_LABEL[mainRole(author)].toLowerCase()}` : ''} · {date(n.at, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, {time(n.at)}</p></div>
      </div>
      <div className="panel__body">
        <NoteColumns left={<NoteText n={n} vitals={n.vitalsId ? file.vitals.find((v) => v.id === n.vitalsId) : undefined} />}
          indications={<>{n.vitals && <p className="note-vitals-line">{vitalsModeText(n.vitals)}<LineTag tag={n.vitals.tag} /></p>}
            {/* IE1 (ronda 16) */}
            {n.fluids && <p className="note-vitals-line"><span className={n.fluids.tag === 'omitted' ? 'struck' : ''}>{fluidsOrderText(n.fluids.mode)}</span><LineTag tag={n.fluids.tag} /></p>}
            {indications.length ? <OrderChecklist n={n} orders={indications} file={file} reload={reload} /> : !n.vitals && <p className="muted">Sin indicaciones.</p>}</>}
          exams={<NoteExams list={(file.exams ?? []).filter((e) => e.noteId === n.id)} />}
          meds={meds.length ? <>{<OrderChecklist n={n} orders={meds} file={file} reload={reload} pill />}<RxFromNote meds={file.meds.filter((m) => m.noteId === n.id)} /></> : <p className="muted">Sin medicamentos.</p>} />
        <div className="signed-row">
          <SignedBadge by={author?.name} at={n.at} addenda={(file.addenda ?? []).filter((a) => a.targetId === n.id).length} />
          <VersionTag version={n.version} kind="note" id={n.id} render={(x) => <VersionNote n={n} x={x} />} />
          <GraceButton record={n} authorId={n.authorId} onCorrect={() => setCorrecting(true)} />
        </div>
        <Addenda list={file.addenda ?? []} targetKind="note" targetId={n.id} canAdd={can('inpatient.orders') && user?.role === 'doctor'} onAdded={reload} openWith={toAddendum} />
        {/* PQ3 (ronda 14): hoja de anestesia de la nota postquirúrgica */}
        {n.format === 'postop' && <AnesthesiaCard note={n} />}
        {/* PQ5 (ronda 16): recuento quirúrgico */}
        {n.format === 'postop' && <SurgicalCountCard note={n} />}
      </div>
      {correcting && p && <NoteEditor file={file} p={p} kind={n.kind === 'admission' ? 'admission' : 'evolution'} variant={n.format === 'postop' ? 'postop' : undefined} correct={n}
        onClose={() => setCorrecting(false)} onSaved={(b, rx) => { setCorrecting(false); reload(); if (b || rx) setOrdersFor({ batch: b, rxNote: rx }) }} onExpired={(t) => { setCorrecting(false); setToAddendum(t) }} />}
      {ordersFor && <ExamOrdersOffer batch={ordersFor.batch} rxNote={ordersFor.rxNote} meds={file.meds} onClose={() => setOrdersFor(null)} />}
    </article>
  )
}

/** GE4: una versión anterior guardada ({subjective, …, data}) vuelta a la forma de la nota, para mostrarla igual. */
/** GE4: una versión anterior de la nota, con sus órdenes y exámenes como estaban. */
export function VersionNote({ n, x }: { n: InpatientNote; x: Record<string, unknown> }) {
  const data = (typeof x.data === 'string' ? JSON.parse(x.data) : x.data ?? {}) as { orders?: string[] }
  const exams = (x.exams as { id: string; name: string; status: string }[] | undefined)?.filter((e) => e.status !== 'cancelled')
  return <>
    <NoteText n={{ ...n, ...noteFromVersion(n, x) }} />
    {!!data.orders?.length && <><h4>Órdenes</h4><ol className="note__list">{data.orders.map((o, i) => <li key={i}>{o}</li>)}</ol></>}
    {!!exams?.length && <><h4>Exámenes</h4><ul className="note__list">{exams.map((e) => <li key={e.id}>{e.name}</li>)}</ul></>}
  </>
}

export function noteFromVersion(n: InpatientNote, x: Record<string, unknown>): Partial<InpatientNote> {
  const data = (typeof x.data === 'string' ? JSON.parse(x.data) : x.data ?? {}) as Record<string, unknown>
  return { subjective: String(x.subjective ?? ''), objective: String(x.objective ?? ''), assessment: String(x.assessment ?? ''), plan: String(x.plan ?? ''), text: String(x.text ?? ''),
    diagnoses: data.diagnoses as InpatientNote['diagnoses'], exam: data.exam as string | undefined, observations: data.observations as string | undefined, evolution: data.evolution as string | undefined,
    chiefComplaint: data.chiefComplaint as string | undefined, history: data.history as string | undefined,
    postop: n.format === 'postop' ? data.postop as InpatientNote['postop'] : undefined, procedure: n.kind === 'procedure' ? data as unknown as InpatientNote['procedure'] : undefined }
}

/**
 * Órdenes numeradas; en las notas con checklist, cada una con su casilla y la marca de enfermería. `index` es
 * la posición de la orden en la nota (la que guarda la marca); el número que se ve es el de su columna.
 */
export function OrderChecklist({ n, orders, file, reload, pill = false }: { n: InpatientNote; orders: { text: string; index: number; tag?: OrderLineTag }[]; file: File; reload: () => void; pill?: boolean }) {
  const { can, staffById, reviewOrder } = useStore()
  const [undo, setUndo] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  // Mientras el servidor responde, la casilla ya se ve marcada
  const [saving, setSaving] = useState<number | null>(null)
  const canMark = can('orders.review') && n.checklist && file.hospitalization.status === 'active'
  return (
    <>
      <ol className="order-check">
        {orders.map(({ text: o, index: i, tag }, pos) => {
          const mark = n.checklist ? orderMark(file.marks, n.id, i) : undefined
          const checked = mark?.action === 'check'
          const who = mark && staffById(mark.by)
          return (
            <li key={i} className={`${checked ? 'is-checked' : n.checklist ? 'is-pending' : ''}${tag === 'omitted' || tag === 'modified' ? ' is-closed' : ''}`}>
              <span className="orders__n">{pill ? '–' : `${pos + 1}.`}</span>
              <span className="order-check__text"><span className="order-check__order">{pill && <Pill size={12} className="orders__pill" aria-hidden="true" />}<span className="order-check__txt">{o}</span>{tag && <LineTag tag={tag} />}</span>
                {checked && <small className="order-check__mark">✓ {shortStaff(who?.name)} {time(mark.at)}</small>}
                {mark?.action === 'uncheck' && <small className="order-check__mark order-check__mark--undo">Desmarcada por {shortStaff(who?.name)} {time(mark.at)}: {mark.reason}</small>}
              </span>
              {canMark && (
                <input type="checkbox" className="order-check__box" checked={checked || saving === i} disabled={saving !== null} aria-label={`${pill ? 'Medicamento' : 'Indicación'} ${pos + 1} revisada`}
                  onChange={async (e) => {
                    if (!e.target.checked) { setUndo(i); setReason(''); return }
                    setSaving(i)
                    if (await reviewOrder(n.id, i, true)) reload()
                    setSaving(null)
                  }} />
              )}
            </li>
          )
        })}
      </ol>
      {undo !== null && (
        <Modal title="Desmarcar la orden" onClose={() => setUndo(null)} footer={<>
          <button className="btn btn--ghost" onClick={() => setUndo(null)}>Cancelar</button>
          <button className="btn btn--danger" disabled={reason.trim().length < 5} onClick={async () => { if (await reviewOrder(n.id, undo, false, reason.trim())) { setUndo(null); reload() } }}>Desmarcar</button>
        </>}>
          <p>«{orders.find((o) => o.index === undo)?.text}»</p>
          <label className="field"><span>¿Por qué la desmarcas? Queda en la bitácora.</span><input className="input" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. La marqué por error" /></label>
        </Modal>
      )}
    </>
  )
}

/** MC7 (ronda 6): etiqueta discreta de una línea de la nota. */
export function LineTag({ tag }: { tag: OrderLineTag }) {
  return <span className={`line-tag line-tag--${tag}`}>{LINE_TAG[tag]}</span>
}

/** Para enfermería: todas las órdenes sin revisar de todas las notas, en orden de hora. */
export function PendingOrdersPanel({ file, reload }: { file: File; reload: () => void }) {
  const { staffById, reviewOrder } = useStore()
  const [saving, setSaving] = useState(false)
  const pending = pendingOrdersOf(file)
  if (file.hospitalization.status !== 'active') return null
  return (
    <section className={`panel ${pending.length ? 'pending-orders' : ''}`} data-tour="checklist">
      <div className="panel__head"><div><h2>Órdenes por revisar · <span className="num faint">{pending.length}</span></h2>
        <p>{pending.length ? 'Marca cada orden cuando la hayas revisado; queda tu nombre y la hora.' : 'Todas las órdenes médicas están revisadas.'}</p></div></div>
      {pending.length > 0 && (
        <div className="rows">{pending.map(({ note, index, text }) => (
          <label key={`${note.id}:${index}`} className="row pending-orders__row">
            <input type="checkbox" disabled={saving} onChange={async (e) => {
              if (!e.target.checked) return
              setSaving(true)
              if (await reviewOrder(note.id, index, true)) reload()
              setSaving(false)
            }} aria-label={`Marcar como revisada: ${text}`} />
            <span className="row__who"><strong>{index + 1}. {text}</strong><span>{shortStaff(staffById(note.authorId)?.name)}, {dateTime(note.at)}</span></span>
          </label>
        ))}</div>
      )}
    </section>
  )
}

/** Nota de procedimiento en la línea de tiempo: las dos horas, el texto y la autorización. */
export function ProcedureNote({ n, file, reload }: { n: InpatientNote; file: File; reload: () => void }) {
  const { staffById, can, user } = useStore()
  const [correcting, setCorrecting] = useState(false)
  const [toAddendum, setToAddendum] = useState<string | undefined>()
  const x = n.procedure!
  const auth = x.authorizationId ? file.authorizations.find((a) => a.id === x.authorizationId) : undefined
  const legacy = x.authorizationId && !auth ? file.procedures.find((a) => a.id === x.authorizationId) : undefined
  const signedAt = auth?.status === 'signed' || legacy ? auth?.statusAt ?? legacy?.updatedAt ?? legacy?.createdAt : undefined
  // Cómo se firmó: en pantalla o en papel (las de antes, con hoja subida, son en papel)
  const how = auth ? (auth.method === 'virtual' ? ' (virtual)' : ' (papel)') : ''
  return (
    <article className="panel consult-entry">
      <div className="panel__head">
        <div><h2>Nota de procedimiento <span className="badge badge--ink">{x.major ? 'Procedimiento mayor' : x.major === false ? 'Procedimiento menor' : 'Procedimiento'}</span></h2>
          <p>Procedimiento: <b>{dm(x.performedAt)}</b> · Nota escrita: {dm(n.at)} · {staffById(n.authorId)?.name}</p></div>
      </div>
      <div className="panel__body note">
        <div className="note__sec"><h4>{x.name}</h4><p>{n.text}</p></div>
        {x.urgent && <p className="badge badge--amber" style={{ whiteSpace: 'normal' }}>Urgencia, sin autorización previa: {x.justification}</p>}
        {signedAt && <p className="badge badge--mint" style={{ whiteSpace: 'normal' }}>Autorización firmada ✓{how} {dm(signedAt)}</p>}
        {auth && auth.status !== 'signed' && <p className="badge badge--red" style={{ whiteSpace: 'normal' }}>Autorización {auth.status === 'revoked' ? 'revocada' : auth.status === 'refused' ? 'rechazada' : 'pendiente'}{auth.statusAt ? ` ${dm(auth.statusAt)}` : ''}</p>}
        <div className="signed-row">
          <SignedBadge by={staffById(n.authorId)?.name} at={n.at} addenda={(file.addenda ?? []).filter((a) => a.targetId === n.id).length} />
          <VersionTag version={n.version} kind="note" id={n.id} render={(v) => { const d = (v.data ?? {}) as { name?: string; performedAt?: string }; return <div className="note__sec"><h4>{d.name}</h4><p className="muted">{d.performedAt ? dm(d.performedAt) : ''}</p><p>{String(v.text ?? '')}</p></div> }} />
          <GraceButton record={n} authorId={n.authorId} onCorrect={() => setCorrecting(true)} />
        </div>
        <Addenda list={file.addenda ?? []} targetKind="note" targetId={n.id} canAdd={can('inpatient.orders') && user?.role === 'doctor'} onAdded={reload} openWith={toAddendum} />
      </div>
      {correcting && <TextCorrection n={n} procedure onClose={() => setCorrecting(false)} onSaved={() => { setCorrecting(false); reload() }} onExpired={(t) => { setCorrecting(false); setToAddendum(t) }} />}
    </article>
  )
}

/**
 * GE4 (ronda 9): corregir una nota de procedimiento o de enfermería en el periodo de gracia: el mismo formulario, ya
 * llenado, con «Guardar corrección». Si vence con la ventana abierta, lo escrito no se pierde y se ofrece la adenda.
 */
export function TextCorrection({ n, procedure, onClose, onSaved, onExpired }: { n: InpatientNote; procedure?: boolean; onClose: () => void; onSaved: () => void; onExpired: (text: string) => void }) {
  const { notify } = useStore()
  const now = useNow()
  const [f, setF] = useState(() => ({ name: n.procedure?.name ?? '', performedAt: n.procedure ? inputDateTime(new Date(n.procedure.performedAt)) : '', text: n.text ?? '' }))
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const [expired, setExpired] = useState(false)
  const draft = useDraftSync(procedure ? 'procedimiento' : 'enfermeria', `correct:${n.id}`, f, setF, false)
  const ok = procedure ? f.name.trim().length >= 3 && f.text.trim().length >= 10 : f.text.trim().length >= 3
  return (
    <Modal title={`Corregir: ${procedure ? 'Nota de procedimiento' : 'Nota de enfermería'}`} wide className="note-modal" onClose={onClose} footer={<>
      {expired ? <span className="field__msg field__msg--error mr-auto" role="alert">{GRACE_EXPIRED_TEXT}
        <button type="button" className="btn btn--soft btn--sm ml-sm" onClick={() => { draft.clear(); onExpired(f.text.trim()) }}>Pasar a una adenda</button></span>
        : <span className="mr-auto"><CorrectionReason value={why} onChange={setWhy} /></span>}
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!ok || busy || expired} onClick={async () => {
        setBusy(true)
        try {
          await api(`/inpatient/notes/${n.id}/correct`, { body: { version: n.version ?? 1, reason: why.trim() || undefined, text: f.text.trim(),
            ...(procedure ? { name: f.name.trim(), performedAt: fromLocalValue(f.performedAt).toISOString() } : {}) } })
          draft.clear(); notify('Corrección guardada'); onSaved()
        } catch (e) {
          if (e instanceof ApiError && e.status === 409 && /minutos/.test(e.message)) setExpired(true)
          else notify(e instanceof Error ? e.message : 'No se pudo guardar la corrección.', 'error')
        } finally { setBusy(false) }
      }}>Guardar corrección</button>
    </>}>
      {procedure && <div className="form-grid">
        <label className="field"><span>Procedimiento realizado</span><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="field"><span>Fecha y hora del procedimiento</span>
          <DateTimeField value={f.performedAt} max={inputDateTime(now)} onChange={(v) => setF({ ...f, performedAt: v })} label="Fecha y hora del procedimiento" /></label>
      </div>}
      <label className="field"><span>{procedure ? 'Nota' : 'Nota de enfermería'}</span>
        <DictateField label="Nota" onText={(g) => setF((x) => ({ ...x, text: g(x.text) }))}><textarea className="textarea textarea--lg" value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} /></DictateField></label>
    </Modal>
  )
}

/**
 * Nota de procedimiento (MC3): cada médico escribe qué se hizo, con la fecha y hora del procedimiento (por defecto
 * ahora; se corrige si se escribe después) y un solo cuadro de texto. Es para los procedimientos menores (infiltración,
 * sutura, lavado): no piden autorización. PQ1 (ronda 9): la casilla «Procedimiento mayor» se quitó; una cirugía se escribe
 * en la «Nota postquirúrgica», que pide la autorización quirúrgica. Un borrador de antes con la casilla marcada sigue
 * pudiéndose firmar como estaba, o pasarse a la nota postquirúrgica.
 */
export type ProcDraft = { name: string; performedAt: string; text: string; major: boolean; urgent: boolean; justification: string }

export function ProcedureNoteForm({ file, initial, onClose, onSaved, onAuthorize, onConvert, inline = false, obs = false }: { file: File; initial?: ProcDraft; onClose: () => void; onSaved: () => void; onAuthorize: (draft: ProcDraft) => void; onConvert: (draft: ProcDraft) => void; inline?: boolean
  /** R18-OB1 (ronda 18): en observación no hay nota postquirúrgica */
  obs?: boolean }) {
  const { addProcedureNote } = useStore()
  const now = useNow()
  // Si se fue a generar la autorización quirúrgica, al volver la nota sigue como estaba
  const [f, setF] = useState<ProcDraft>(() => initial ?? { name: '', performedAt: inputDateTime(new Date()), text: '', major: false, urgent: false, justification: '' })
  const [busy, setBusy] = useState(false)
  // AN1: borrador que se guarda solo
  const draft = useDraftSync<ProcDraft>('procedimiento', file.hospitalization.id, f, (x) => { if (!initial) setF(x) }, !f.name.trim() && !f.text.trim())
  const performed = fromLocalValue(f.performedAt)
  const future = performed.getTime() > now.getTime() + 60_000
  const auths = surgicalAuths(file, performed)
  const matching = auths.find((a) => f.name.trim().length >= 3 && normalize(a.procedure).includes(normalize(f.name.trim())))
  const [authId, setAuthId] = useState<string | null>(null)
  // Sin elegir: la quirúrgica de este procedimiento o la más reciente. '' es "ninguna"
  const chosen = !f.major || authId === '' ? undefined : auths.find((a) => a.id === authId) ?? matching ?? auths[0]
  const covered = !!chosen
  const basics = f.name.trim().length >= 3 && f.performedAt && !future && f.text.trim().length >= 10
  const ready = basics && (!f.major || covered || (f.urgent && f.justification.trim().length >= 10))
  return (
    <Modal title="Nota de procedimiento" wide inline={inline} className="note-modal" onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!ready || busy} onClick={async () => {
        setBusy(true)
        const urgent = f.major && !covered && f.urgent
        const ok = await addProcedureNote(file.hospitalization.id, {
          name: f.name.trim(), performedAt: performed.toISOString(), text: f.text.trim(), major: f.major, authorizationId: chosen?.id,
          urgent, justification: urgent ? f.justification.trim() : undefined,
        })
        setBusy(false)
        if (ok) { draft.clear(); onSaved() }
      }}>Firmar nota</button>
    </>}>
      {(f.name.trim() || f.text.trim()) && <DraftBadge savedAt={draft.savedAt} restored={draft.restored} offline={draft.offline} />}
      <div className="form-grid">
        <label className="field"><span>Procedimiento realizado</span><input className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Escribe qué se hizo" /></label>
        <label className="field"><span>Fecha y hora del procedimiento</span>
          <DateTimeField value={f.performedAt} max={inputDateTime(now)} invalid={future} onChange={(v) => setF({ ...f, performedAt: v })} label="Fecha y hora del procedimiento" />
          {future && <small className="field__msg field__msg--error">No puede ser en el futuro.</small>}
          <small className="muted">Si escribes la nota después del procedimiento, corrige la hora. La hora en que escribes la nota se guarda sola.</small></label>
      </div>
      <label className="field"><span>Nota</span>
        <DictateField label="Nota del procedimiento" onText={(f) => setF((x) => ({ ...x, text: f(x.text) }))}><textarea className="textarea textarea--lg" value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} placeholder="Indicación, técnica, hallazgos, complicaciones, estado del paciente al terminar." /></DictateField></label>
      {f.major ? (
        <div className="alert-strip alert-strip--calm" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <span>Este borrador se empezó como procedimiento mayor. Las cirugías ahora se escriben en la nota postquirúrgica (diagnósticos, horas, anestesia y equipo quirúrgico).</span>
          <button type="button" className="btn btn--soft btn--sm self-start" onClick={() => { draft.clear(); onConvert(f) }}>Continuar como nota postquirúrgica</button>
        </div>
      ) : <small className="muted">Para procedimientos menores: no piden autorización. {obs ? 'Para una cirugía, pasa al paciente a hospitalización.' : 'Una cirugía se escribe en «Nota postquirúrgica».'}</small>}
      {f.major && auths.length > 0 && (
        <label className="field"><span>Autorización quirúrgica firmada (últimas 24 horas)</span>
          <Combo value={chosen?.id ?? ''} onChange={setAuthId} options={[...auths.map((a) => ({ value: a.id, label: `${a.name} · firmada ${dm(a.at)}` })), { value: '', label: 'Ninguna de estas' }]} /></label>
      )}
      {f.major && covered && <div className="alert-strip alert-strip--calm">Autorización firmada ✓ {chosen!.name}</div>}
      {f.major && !covered && (
        <div className="alert-strip alert-strip--amber" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <span>No hay autorización quirúrgica firmada para este procedimiento.</span>
          <button type="button" className="btn btn--soft btn--sm self-start" onClick={() => onAuthorize({ ...f, name: f.name.trim() })}><FileSignature size={14} />Generar la autorización quirúrgica</button>
          <label className="check-line" style={{ background: '#fff' }}><input type="checkbox" checked={f.urgent} onChange={(e) => setF({ ...f, urgent: e.target.checked })} />
            <span><b>Urgencia, sin autorización previa</b><small>Escribe por qué no se pudo obtener antes.</small></span></label>
          {f.urgent && <textarea className="textarea textarea--sm" rows={2} value={f.justification} onChange={(e) => setF({ ...f, justification: e.target.value })} placeholder="Justificación" aria-label="Justificación de la urgencia" />}
        </div>
      )}
    </Modal>
  )
}
