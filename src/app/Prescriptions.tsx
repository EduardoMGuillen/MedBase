import { useCallback, useEffect, useRef, useState } from 'react'
import { DateField } from '../components/DateTimeField'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Ban, Copy, FileText, MessageCircle, Plus, Printer, UserPlus, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { Loading, Modal, PageHead, BackButton } from '../components/ui'
import { Pagination, usePage } from '../components/Pagination'
import { PAGE_SIZE } from '../lib/clinicalConfig'
import { age, date, formatPhone, fullName, localISODate, medicationLine, frequencyText, time, whatsappUrl } from '../lib/format'
import { stayPath, yearsOld } from '../lib/inpatient'
import { useNow } from '../lib/hooks'
import { features } from '../lib/permissions'
import { normalize, similarPatients } from '../lib/patients'
import { MedicationForm, MedicationList } from '../components/Medications'
import { PatientPicker } from './Inpatients'
import { LogoMark } from '../components/Logo'
import type { ClinicSettings, ExamGroup, GuestPatient, Patient, Prescription, PrescriptionItem } from '../lib/types'
import { ClinicOrderBlock, ExamBatchSheets, markBatchPrinted } from './ExamOrder'
import { DniInput } from '../components/DniInput'
import { ClinicalDoc, guardianRow, patientOf, placeOf, signerOfStaff, type DocPatient } from '../components/ClinicalDoc'
import { doseText } from '../lib/doseText'
import { SimilarPatients } from './NewPatient'
import { RxValidityField } from '../components/RxValidity'
import { useRxValidity } from '../lib/hooks'
import { IdentificationForm, IdentityPrompt } from './PatientForms'

/** Logo de la clínica en recetas y constancias; si no hay uno cargado, el de Clinara. */
export function ClinicLogo({ settings, size = 26 }: { settings: ClinicSettings; size?: number }) {
  return settings.logo ? <img src={settings.logo} alt="" style={{ height: size * 1.6, maxWidth: 160, objectFit: 'contain' }} /> : <LogoMark size={size} />
}

/**
 * Recetas: el médico emite una receta sin abrir una consulta (por ejemplo, renovar el tratamiento de un
 * crónico) y consulta el historial, con "Repetir receta" para copiar una anterior. También para una persona
 * que no está en la biblioteca: se escriben sus datos a mano y no se le crea expediente.
 */
export default function Prescriptions() {
  const { prescriptions, patient, staffById, user, can, settings, notify } = useStore()
  const [mine, setMine] = useState(user?.role === 'doctor' && features(settings).multiDoctor)
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  // AN1: «Emitir una nueva» desde una receta anulada llega con ?repetir=<id>: se abre copiada para corregirla
  const [params, setParams] = useSearchParams()
  const [draft, setDraft] = useState<Draft | null>(() => {
    const r = prescriptions.find((x) => x.id === params.get('repetir'))
    return r ? { key: 0, patientId: r.patientId, guest: r.patientId ? undefined : r.guest, items: r.items.map((x) => ({ ...x })), indications: r.indications ?? [] } : null
  })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (params.get('repetir')) setParams({}, { replace: true }) }, [])
  // Cada receta nueva o repetida abre un formulario limpio
  const seq = useRef(0)
  const nameOf = (r: Prescription) => { const p = patient(r.patientId); return p ? fullName(p) : r.guest?.name ?? '' }
  // GE5 (ronda 10): el historial completo, por páginas, buscado y filtrado en el servidor (no solo lo que trajo la carga inicial)
  const [page, setPage] = usePage(JSON.stringify([q, from, to, mine]))
  const [data, setData] = useState<{ rows: Prescription[]; total: number; page: number; size: number } | null>(null)
  useEffect(() => {
    let alive = true
    const params = new URLSearchParams(Object.entries({ q: q.trim(), from, to, mine: mine ? '1' : '', page: String(page), size: String(PAGE_SIZE) }).filter(([, v]) => v))
    const t = setTimeout(() => {
      api<{ rows: Prescription[]; total: number; page: number; size: number }>(`/prescriptions?${params}`).then((r) => { if (alive) setData(r) }).catch((e: Error) => notify(e.message, 'error'))
    }, q ? 250 : 0)
    return () => { alive = false; clearTimeout(t) }
  }, [q, from, to, mine, page, prescriptions.length, notify])
  const list = data?.rows ?? []
  const total = data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const write = can('rx.write')
  const repeat = (r: Prescription) => {
    setDraft({ key: ++seq.current, patientId: r.patientId, guest: r.patientId ? undefined : r.guest, items: r.items.map((x) => ({ ...x })), indications: r.indications ?? [] })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  return (
    <div className="page">
      <PageHead title="Recetas" sub={write ? 'Emite una receta sin abrir una consulta, también para alguien que no está registrado, o repite una anterior.' : `${total} recetas emitidas`}
        actions={write && !draft && <button className="btn btn--primary" onClick={() => setDraft({ key: ++seq.current, patientId: '', items: [], indications: [] })}><Plus size={17} />Nueva receta</button>} />
      {write && draft && <NewPrescription key={draft.key} initial={draft} onClose={() => setDraft(null)} />}
      <section className="panel">
        <div className="panel__head">
          <div><h2>Historial</h2><p>{total} {total === 1 ? 'receta' : 'recetas'}</p></div>
          {user?.role === 'doctor' && features(settings).multiDoctor && (
            <div className="segmented" role="radiogroup" aria-label="Qué recetas ver">
              <button role="radio" aria-checked={mine} onClick={() => setMine(true)}>Mías</button>
              <button role="radio" aria-checked={!mine} onClick={() => setMine(false)}>Toda la clínica</button>
            </div>
          )}
        </div>
        <div className="panel__body rx-filters">
          <label className="field"><span>Paciente</span><input className="input" data-nocap value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre o expediente" /></label>
          <div className="field"><span>Desde</span><DateField value={from} onChange={setFrom} label="Desde" /></div>
          <div className="field"><span>Hasta</span><DateField value={to} onChange={setTo} label="Hasta" /></div>
        </div>
        {list.length ? <div className="rows">{list.map((r) => {
          const name = nameOf(r)
          if (!name) return null
          return (
            <div key={r.id} className="row rx-row">
              <Link to={`/app/recetas/${r.id}`} className="num rx-row__when">{date(r.issuedAt)}<br /><span style={{ color: 'var(--muted)' }}>{r.folio}</span>{r.voidedAt && <><br /><span className="badge badge--red">Anulada</span></>}</Link>
              <Link to={`/app/recetas/${r.id}`} className="row__who" style={{ textDecoration: 'none' }}>
                <strong>{name}{r.standalone && <span className="badge badge--ink" style={{ marginLeft: 8 }}>Sin consulta</span>}
                  {!r.patientId && <span className="badge badge--amber" style={{ marginLeft: 8 }}>Paciente no registrado</span>}</strong>
                <span>{r.items.map((i) => i.drug).join(', ')}, por {staffById(r.doctorId)?.name}</span>
              </Link>
              {write && <button className="btn btn--ghost btn--sm" onClick={() => repeat(r)}><Copy size={14} />Repetir receta</button>}
            </div>
          )
        })}</div> : !data ? <Loading /> : <div className="empty">{q || from || to ? 'Ninguna receta coincide con la búsqueda.' : 'Las recetas que emitas aparecerán aquí.'}</div>}
        <Pagination page={Math.min(page, pages)} pages={pages} total={total} size={PAGE_SIZE} onPage={setPage} label="Páginas del historial de recetas" />
      </section>
    </div>
  )
}

type Draft = { key: number; patientId: string; guest?: GuestPatient; items: PrescriptionItem[]; indications: string[] }
const EMPTY_GUEST: GuestPatient = { name: '', birthDate: '', age: '', dni: '', phone: '' }

/** Datos de la persona no registrada: sólo el nombre es obligatorio. Avisa si se parece a alguien de la biblioteca. */
/** Anular una receta emitida con motivo; después se emite otra (Repetir receta). */
function VoidRx({ id, folio, onClose, onDone }: { id: string; folio: string; onClose: () => void; onDone: () => void }) {
  const { voidPrescription } = useStore()
  const [reason, setReason] = useState('')
  return (
    <Modal title={`Anular la receta ${folio}`} onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--danger" disabled={reason.trim().length < 5} onClick={async () => { if (await voidPrescription(id, reason.trim())) onDone() }}>Anular receta</button>
    </>}>
      <p>La receta queda en el expediente marcada como anulada; no se borra. Después puedes emitir una nueva con los datos corregidos.</p>
      <label className="field"><span>Motivo</span><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. Dosis de amoxicilina mal escrita" autoFocus /></label>
    </Modal>
  )
}

function GuestFields({ value, onChange, onPick, onCancel }: { value: GuestPatient; onChange: (g: GuestPatient) => void; onPick: (patientId: string) => void; onCancel: () => void }) {
  const { patients } = useStore()
  const now = useNow()
  const [first, ...rest] = value.name.trim().split(/\s+/)
  const similar = value.name.trim().length >= 3 || (value.phone ?? '').replace(/\D/g, '').length >= 7
    ? similarPatients(patients, { firstName: first ?? '', lastName: rest.join(' '), phone: value.phone ?? '', dni: value.dni }) : []
  const set = (k: keyof GuestPatient) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...value, [k]: k === 'phone' ? formatPhone(e.target.value) : e.target.value })
  return (
    <fieldset className="fs"><legend>Receta para paciente no registrado</legend>
      <p className="muted" style={{ fontSize: 13.5 }}>No se le crea expediente. La receta queda en tu historial marcada como «Paciente no registrado»; si después se registra, la vinculas.</p>
      <div className="form-grid">
        <label className="field span-2"><span>Nombre completo</span><input className="input" autoFocus value={value.name} onChange={set('name')} autoComplete="off" /></label>
        <div className="field"><span>Fecha de nacimiento (opcional)</span><DateField value={value.birthDate ?? ''} onChange={(v) => onChange({ ...value, birthDate: v })} max={localISODate(now)} label="Fecha de nacimiento" /></div>
        <label className="field"><span>O la edad (opcional)</span><input className="input" value={value.age ?? ''} onChange={set('age')} placeholder="Ej. 34 años" disabled={!!value.birthDate} /></label>
        <label className="field"><span>Sexo (opcional)</span><select className="select" value={value.sex ?? ''} onChange={set('sex')}><option value="">Sin dato</option><option value="F">Femenino</option><option value="M">Masculino</option></select></label>
        <label className="field"><span>Identidad (opcional)</span><DniInput value={value.dni ?? ''} onChange={(dni) => onChange({ ...value, dni })} /></label>
        <label className="field"><span>Teléfono (opcional)</span><input className="input" inputMode="tel" value={value.phone ?? ''} onChange={set('phone')} placeholder="0000-0000" /></label>
      </div>
      <SimilarPatients list={similar} pickLabel="Sí, usar su expediente" onPick={(p) => onPick(p.id)} />
      <button type="button" className="btn btn--ghost btn--sm" style={{ justifySelf: 'start' }} onClick={onCancel}>Buscar en la biblioteca</button>
    </fieldset>
  )
}

/** Paciente (o persona no registrada) → medicamentos → indicaciones → emitir. Usa el mismo formulario de medicamento de la consulta. */
function NewPrescription({ initial, onClose }: { initial: Omit<Draft, 'key'>; onClose: () => void }) {
  const { patient, issuePrescription } = useStore()
  const nav = useNavigate()
  const [patientId, setPatientId] = useState(initial.patientId)
  const [guest, setGuest] = useState<GuestPatient | null>(initial.guest ? { ...EMPTY_GUEST, ...initial.guest } : null)
  const [items, setItems] = useState<PrescriptionItem[]>(initial.items)
  const [indications, setIndications] = useState(initial.indications.join('\n'))
  const [medForm, setMedForm] = useState<{ index: number; initial?: PrescriptionItem } | null>(initial.items.length ? null : { index: -1 })
  const [busy, setBusy] = useState(false)
  const [validity, setValidity] = useRxValidity()
  const p = patientId ? patient(patientId) : undefined
  // Para el formulario de medicamento: de la persona no registrada no se conocen alergias
  const who = p ?? (guest ? { firstName: guest.name.split(' ')[0] || 'El paciente', allergies: [] as string[] } : undefined)
  const needsDni = !!p && !p.dni && !!p.birthDate && yearsOld(p.birthDate) >= 18
  const ready = (p || (guest && guest.name.trim().length >= 3)) && items.length > 0 && !needsDni && !medForm
  const usePatient = (id: string) => { setGuest(null); setPatientId(id) }
  return (
    <section className="panel">
      <div className="panel__head"><div><h2>{initial.items.length ? 'Repetir receta' : 'Nueva receta'}</h2><p>{guest ? 'Para una persona que no está en la biblioteca.' : 'Queda en el expediente del paciente como receta sin consulta.'}</p></div>
        <button className="icon-btn" aria-label="Cerrar" onClick={onClose}><X size={18} /></button></div>
      <div className="panel__body" style={{ display: 'grid', gap: 16 }}>
        {guest ? <GuestFields value={guest} onChange={setGuest} onPick={usePatient} onCancel={() => setGuest(null)} />
          : <PatientPicker value={patientId} onChange={setPatientId} notFoundLabel="receta para paciente no registrado"
            onNotFound={(q) => setGuest({ ...EMPTY_GUEST, name: q.replace(/\b\p{L}/gu, (c) => c.toUpperCase()) })} />}
        {!guest && !p && <button type="button" className="linklike" style={{ justifySelf: 'start' }} onClick={() => setGuest({ ...EMPTY_GUEST })}>Receta para paciente no registrado</button>}
        {p && p.allergies.length > 0 && <div className="alert-strip">Alergias: {p.allergies.join(', ')}</div>}
        {p && needsDni && <IdentityPrompt p={p} />}
        {who && (<>
          <div className="plan-block">
            <h3 className="plan-block__title">Medicamentos</h3>
            <MedicationList items={items} patient={who} editing={medForm?.index ?? null} requireDuration
              onEdit={(i) => setMedForm({ index: i, initial: items[i] })} onRemove={(i) => { setItems(items.filter((_, j) => j !== i)); setMedForm(null) }} />
            {medForm ? (
              <MedicationForm key={medForm.index} patient={who} current={items} initial={medForm.initial}
                onSave={(it) => { setItems(medForm.index >= 0 ? items.map((x, j) => (j === medForm.index ? it : x)) : [...items, it]); setMedForm(null) }}
                onCancel={() => setMedForm(null)} />
            ) : <button className="btn btn--soft" style={{ justifySelf: 'start' }} onClick={() => setMedForm({ index: -1 })}><Plus size={16} />Agregar medicamento</button>}
          </div>
          <label className="field"><span>Indicaciones (opcional, una por línea)</span>
            <textarea className="textarea textarea--sm" rows={3} value={indications} onChange={(e) => setIndications(e.target.value)} placeholder="Ej. Control de presión arterial en casa. Cita de control en 3 meses." /></label>
          <RxValidityField value={validity} onChange={setValidity} />
        </>)}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn--primary" disabled={!ready || busy} onClick={async () => {
            setBusy(true)
            const g = guest && Object.fromEntries(Object.entries({ ...guest, name: guest.name.trim(), age: guest.birthDate ? undefined : guest.age?.trim() }).filter(([, v]) => v)) as unknown as GuestPatient
            const r = await issuePrescription({ ...(g ? { guest: g } : { patientId }), items, indications: indications.split('\n').map((x) => x.trim()).filter(Boolean), validityDays: validity })
            setBusy(false)
            if (r) nav(`/app/recetas/${r.prescriptionId}`)
          }}><FileText size={16} />Emitir receta</button>
          <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          {who && !items.length && <span className="muted" style={{ fontSize: 13.5 }}>Agrega al menos un medicamento.</span>}
          {medForm && items.length > 0 && <span className="muted" style={{ fontSize: 13.5 }}>Termina o cancela el medicamento que estás editando.</span>}
        </div>
      </div>
    </section>
  )
}

/**
 * ME15 (ronda 15): la receta de una consulta de antes no traía los medicamentos «Aplicar en la clínica». El médico genera la
 * receta completa de esa consulta (una receta nueva, con su folio); la emitida no cambia.
 */
export function useFullRx(consultationId: string) {
  const { notify } = useStore()
  const nav = useNavigate()
  const [busy, setBusy] = useState(false)
  const generate = async () => {
    setBusy(true)
    try {
      const r = await api<{ prescriptionId: string; folio: string }>(`/consultations/${consultationId}/full-rx`, { method: 'POST' })
      notify(`Receta completa ${r.folio} emitida`)
      nav(`/app/recetas/${r.prescriptionId}`)
    } catch (e) { notify((e as Error).message, 'error'); setBusy(false) }
  }
  return { busy, generate }
}

function FullRxStrip({ consultationId, missing }: { consultationId: string; missing: PrescriptionItem[] }) {
  const { can } = useStore()
  const { busy, generate } = useFullRx(consultationId)
  return (
    <div className="alert-strip alert-strip--amber no-print" style={{ flexWrap: 'wrap', justifyContent: 'space-between' }}>
      <span>Esta receta no trae {missing.length === 1 ? 'un medicamento' : `${missing.length} medicamentos`} de la consulta ({missing.map((m) => m.drug).join(', ')}): se emitió cuando lo que se aplicaba en la clínica no iba a la receta.{can('rx.write') ? ' Puedes generar la receta completa; esta no cambia.' : ''}</span>
      {can('rx.write') && <button className="btn btn--primary btn--sm" disabled={busy} onClick={() => void generate()}><FileText size={15} />{busy ? 'Generando…' : 'Generar receta completa'}</button>}
    </div>
  )
}

export function PrescriptionSheet() {
  const { id } = useParams()
  const { staffById, fetchPrescription, settings, can, notify } = useStore()
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchPrescription>> | null>(null)
  const [missing, setMissing] = useState(false)
  const [voiding, setVoiding] = useState(false)
  const search = new URLSearchParams(useLocation().search)
  const examBatch = search.get('examenes')
  // EX10 (ronda 14): la orden de los exámenes «En la clínica», aparte; ME14: con ingreso, después se sigue a la estancia
  const clinicBatch = search.get('clinica')
  const next = search.get('siguiente')
  // CE1 (ronda 12): las órdenes de exámenes de la misma consulta salen debajo de la receta y se imprimen juntas
  const [examGroups, setExamGroups] = useState<ExamGroup[]>([])
  const [rxOnly, setRxOnly] = useState(false)
  const [savingDx, setSavingDx] = useState(false)
  const load = useCallback(() => {
    if (id) fetchPrescription(id).then(setData).catch(() => setMissing(true))
  }, [id, fetchPrescription])
  useEffect(load, [load])
  if (missing) return <div className="page"><div className="empty">Esta receta no existe. Vuelve a <Link to="/app/recetas">Recetas</Link>.</div></div>
  if (!data) return <Loading label="Cargando receta" />
  const { prescription: rx, consultation: c, hospitalization: h, patient, missingFromConsult = [], completeRx } = data
  const doc = staffById(rx.doctorId)!
  // Persona no registrada: se imprime con los datos que se escribieron
  const g = rx.guest
  const p: Pick<Patient, 'firstName' | 'lastName' | 'phone' | 'dni' | 'birthDate' | 'allergies' | 'record'> & Partial<Patient> = patient ?? {
    firstName: g?.name ?? '', lastName: '', phone: g?.phone ?? '', dni: g?.dni, birthDate: g?.birthDate ?? '', allergies: [], record: 'Paciente no registrado',
  }
  const name = `${p.firstName}${p.lastName ? ` ${p.lastName}` : ''}`
  // IM1 (ronda 13): la cuadrícula fija del paciente; la persona no registrada, con lo que se escribió
  const grid: DocPatient = patient ? patientOf(patient, settings)
    : { name, record: 'Paciente no registrado', dni: g?.dni, age: g?.birthDate ? age(g.birthDate) : g?.age || 'Sin dato', sex: g?.sex }
  const dx = c?.diagnoses ?? []
  // IM2 (ronda 13): el diagnóstico solo si el médico lo marcó (apagado por defecto); las recetas de antes lo traían y lo conservan
  const withDx = rx.includeDx ?? true
  const setIncludeDx = async (v: boolean) => {
    setSavingDx(true)
    try { const r = await api<Prescription>(`/prescriptions/${rx.id}/include-dx`, { body: { includeDx: v } }); setData({ ...data, prescription: { ...rx, includeDx: r.includeDx } }) } catch (e) { notify((e as Error).message, 'error') }
    setSavingDx(false)
  }
  // Indicaciones: las de la receta sin consulta, las que el médico escribió aparte o, en consultas anteriores, las órdenes que no son medicamentos
  const notes = rx.indications ?? c?.indications ?? (c?.orders.length ? c.orders.filter((o) => !rx.items.some((it) => o.startsWith(it.drug))) : c?.plan ? [c.plan] : [])
  // WhatsApp no permite adjuntar el PDF desde un enlace: se envía el texto de la receta
  const rxMessage = [`${settings.name}. Receta ${rx.folio}, ${date(rx.issuedAt)}.`, `${doc.name}, colegiación ${doc.license ?? ''}.`, `Paciente: ${name}.`, '',
    ...rx.items.map((it, i) => `${i + 1}. ${medicationLine(it)}${it.instructions ? `. ${it.instructions}` : ''}${it.legend ? ` (${it.legend})` : ''}`),
    ...(notes.length ? ['', 'Indicaciones:', ...notes.map((n) => `- ${n}`)] : [])].join('\n')

  return (
    <div className="page">
      <PageHead noPrint back={patient ? <BackButton to={h ? stayPath(h) : `/app/pacientes/${patient.id}`}>Expediente de {patient.firstName}</BackButton>
          : <BackButton to="/app/recetas">Recetas</BackButton>} actions={<>
          {!patient && g && can('rx.write') && can('patients.manage') && <GuestLink rx={rx} guest={g} onLinked={load} />}
          {can('rx.write') && !rx.voidedAt && <button className="btn btn--danger" onClick={() => setVoiding(true)}><Ban size={16} />Anular</button>}
          {can('rx.write') && rx.voidedAt && <Link className="btn btn--soft" to={`/app/recetas?repetir=${rx.id}`}><Copy size={16} />Emitir una nueva</Link>}
          {p.phone && !rx.voidedAt && <a className="btn btn--ghost" href={whatsappUrl(p.phone, rxMessage)} target="_blank" rel="noreferrer" onClick={() => { api(`/prescriptions/${rx.id}/printed`, { body: { how: 'whatsapp' } }).catch(() => null) }}><MessageCircle size={16} />Enviar por WhatsApp</a>}
          {examBatch && examGroups.length > 0 && <button className="btn btn--soft" onClick={() => {
            api(`/prescriptions/${rx.id}/printed`, { body: { how: 'print' } }).catch(() => null)
            setRxOnly(true); setTimeout(() => { window.print(); setRxOnly(false) }, 120)
          }}><Printer size={16} />Solo la receta</button>}
          <button className="btn btn--primary" onClick={() => {
            // GE4 (ronda 9): impresa (o descargada), la receta ya no se corrige en el periodo de gracia
            api(`/prescriptions/${rx.id}/printed`, { body: { how: 'print' } }).catch(() => null)
            if (examBatch && examGroups.length) void markBatchPrinted(examBatch, examGroups)
            window.print()
          }}><Printer size={16} />{examBatch && examGroups.length ? `Imprimir receta y ${examGroups.length > 1 ? 'órdenes' : 'orden'} de exámenes` : 'Imprimir o guardar PDF'}</button>
      </>} />
      {next && next.startsWith('/app/') && <div className="alert-strip alert-strip--calm no-print" style={{ flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <span>El paciente quedó {next.includes('/observacion/') ? 'en observación' : 'hospitalizado'}. Imprime la receta y las órdenes y sigue a su expediente.</span>
        <Link className="btn btn--primary btn--sm" to={next}>{next.includes('/observacion/') ? 'Ir a observación' : 'Ir a hospitalización'}</Link></div>}
      {((examBatch && examGroups.length > 0) || clinicBatch) && <div className="alert-strip alert-strip--calm no-print" style={{ flexWrap: 'wrap' }}>
        {`También se ordenaron exámenes: ${[examBatch && examGroups.length > 0 && 'sus órdenes van debajo de la receta, cada una en su hoja, y se imprimen con el mismo botón', clinicBatch && 'la orden de los que se hacen en la clínica va aparte, al final, con su propio botón'].filter(Boolean).join('; ')}.`}
        <Link className="btn btn--ghost btn--sm" to={`/app/examenes/orden/${examBatch ?? clinicBatch}${examBatch && clinicBatch ? `?clinica=${clinicBatch}` : ''}`}>Abrir solo las órdenes</Link></div>}
      {/* ME15 (ronda 15): una receta de antes no traía los «Aplicar en la clínica»: el médico genera la completa (esta no cambia) */}
      {!rx.voidedAt && missingFromConsult.length > 0 && <FullRxStrip consultationId={rx.consultationId} missing={missingFromConsult} />}
      {!rx.voidedAt && completeRx && <div className="alert-strip alert-strip--calm no-print" style={{ flexWrap: 'wrap' }}>
        <span>Esta receta no traía todos los medicamentos de la consulta. Ya se generó la receta completa {completeRx.folio}.</span>
        <Link className="btn btn--ghost btn--sm" to={`/app/recetas/${completeRx.id}`}>Ver la receta completa</Link></div>}
      {rx.voidedAt && <div className="alert-strip no-print">Receta anulada el {date(rx.voidedAt)}, {time(rx.voidedAt)}{rx.voidedBy ? ` por ${staffById(rx.voidedBy)?.name ?? '—'}` : ''}. Motivo: {rx.voidReason}</div>}
      {voiding && <VoidRx id={rx.id} folio={rx.folio} onClose={() => setVoiding(false)} onDone={() => { setVoiding(false); load() }} />}
      {/* IM2 (ronda 13): solo el médico ve la casilla; enfermería reimprime la receta como la dejó el médico */}
      {can('rx.write') && dx.length > 0 && !rx.voidedAt && <label className="check-line no-print rx-dx-toggle">
        <input type="checkbox" checked={withDx} disabled={savingDx} onChange={(e) => void setIncludeDx(e.target.checked)} />
        <span><b>Incluir diagnóstico</b><small>Por privacidad la receta sale sin diagnóstico, salvo que lo decidas. Se guarda con la receta: al reimprimirla sale igual.</small></span></label>}
      <ClinicalDoc kind="Receta" folio={rx.folio} at={rx.issuedAt} folioNote={h ? 'Receta de egreso' : rx.standalone ? 'Receta sin consulta' : undefined}
        place={placeOf(settings)} patient={grid} stamp={rx.voidedAt ? 'ANULADA' : undefined}
        rows={[
          { label: 'Alergias', value: patient ? (p.allergies.length ? p.allergies.join(', ') : 'Ninguna conocida') : 'Sin dato' },
          withDx && dx.length > 0 && { label: 'Diagnóstico', value: dx.map((d) => d.label).join('; ') },
          patient && guardianRow(patient),
        ]}
        signers={[signerOfStaff(doc, { title: doc.specialty ?? settings.specialty, license: doc.license ?? settings.license, signatureId: rx.signatureId, stampId: rx.stampId })]}
        legends={[`Receta válida por ${rx.validityDays ?? settings.rxValidityDays} días a partir de su emisión.`]}>
        <div className="rx-sheet__rx" aria-hidden="true">Rx</div>
        <ol className="rx-items">
          {rx.items.map((it, i) => (
            <li key={i}>
              {/* ME3 y ME4 (ronda 9): una sola línea con el mismo texto de la nota */}
              {it.nebulization?.components?.length || it.loadingDose ? <>
                <strong>{medicationLine(it)}</strong>
                <p>{it.instructions ? `${it.instructions}.` : ''}{it.quantity ? ` Cantidad: ${it.quantity}.` : ''}</p>
              </> : <>
              <strong>{it.drug}</strong> <span style={{ color: 'var(--muted)' }}>{it.presentation}</span>
              <p>{doseText(it.dose)}{it.route ? ` vía ${it.route.toLowerCase()}` : ''}, {it.prnCondition ? frequencyText(it) : it.frequency.toLowerCase()}{it.duration ? `, durante ${it.duration}` : ''}.{it.instructions ? ` ${it.instructions}` : ''}{it.quantity ? ` Cantidad: ${it.quantity}.` : ''}</p>
              </>}
              {/* ME15 (ronda 15): «Se aplica en la clínica.» o «Comprar y traer a la clínica para su aplicación.» */}
              {it.legend && <p className="rx-legend"><em>{it.legend}</em></p>}
            </li>
          ))}
        </ol>
        {notes.length > 0 && (
          <div className="cdoc__sub"><b>Indicaciones generales</b>
            <ul>{notes.map((n, i) => <li key={i}>{n}</li>)}</ul></div>
        )}
      </ClinicalDoc>
      {examBatch && <div className={rxOnly ? 'print-hide' : undefined}><ExamBatchSheets batch={examBatch} onGroups={setExamGroups} /></div>}
      {clinicBatch && <ClinicOrderBlock batch={clinicBatch} />}
    </div>
  )
}

/**
 * Receta de una persona no registrada: "Registrar paciente" abre el registro precargado con sus datos y le
 * pasa la receta (y, si se confirma, las demás recetas con el mismo nombre); "Vincular a un expediente" la
 * pasa a un paciente que ya existía.
 */
function GuestLink({ rx, guest, onLinked }: { rx: Prescription; guest: GuestPatient; onLinked: () => void }) {
  const { addPatient, linkPrescription, prescriptions, notify } = useStore()
  const [mode, setMode] = useState<null | 'register' | 'pick'>(null)
  const [patientId, setPatientId] = useState('')
  const [first, ...rest] = guest.name.trim().split(/\s+/)
  // Otras recetas de la misma persona sin expediente
  const same = prescriptions.filter((x) => x.id !== rx.id && !x.patientId && x.guest && normalize(x.guest.name) === normalize(guest.name))
  const link = async (pid: string) => {
    if (!(await linkPrescription(rx.id, pid))) return
    if (same.length && window.confirm(`Hay ${same.length} receta${same.length > 1 ? 's' : ''} más a nombre de ${guest.name} sin expediente. ¿Vincularlas también?`)) {
      for (const x of same) await linkPrescription(x.id, pid, '')
      notify(`${same.length + 1} recetas vinculadas al expediente`)
    }
    setMode(null)
    onLinked()
  }
  return (<>
    <button className="btn btn--soft" onClick={() => setMode('register')}><UserPlus size={16} />Registrar paciente</button>
    <button className="btn btn--ghost" onClick={() => setMode('pick')}>Vincular a un expediente</button>
    {mode === 'register' && (
      <IdentificationForm title={`Registrar a ${guest.name}`} submitLabel="Registrar y vincular la receta" withAllergies
        initial={{ firstName: first ?? '', lastName: rest.join(' '), birthDate: guest.birthDate ?? '', sex: guest.sex, dni: guest.dni, phone: guest.phone ?? '' }}
        onClose={() => setMode(null)} onSave={async (data) => {
          const r = await addPatient(data as Omit<Patient, 'id' | 'record' | 'createdAt'>)
          if (r) await link(r.id)
        }} />
    )}
    {mode === 'pick' && (
      <Modal title="Vincular la receta a un expediente" onClose={() => setMode(null)} footer={<>
        <button className="btn btn--ghost" onClick={() => setMode(null)}>Cancelar</button>
        <button className="btn btn--primary" disabled={!patientId} onClick={() => link(patientId)}>Vincular</button>
      </>}>
        <p className="muted" style={{ fontSize: 14 }}>La receta {rx.folio} pasa al expediente que elijas y queda en la bitácora.</p>
        <PatientPicker value={patientId} onChange={setPatientId} />
      </Modal>
    )}
  </>)
}
