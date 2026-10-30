import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Copy, FileText, MessageCircle, Plus, Printer, UserPlus, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { Loading, Modal, PageHead } from '../components/ui'
import { age, date, formatPhone, fullName, identityLine, localISODate, medicationLine, recordNumber, time, whatsappUrl } from '../lib/format'
import { stayPath, yearsOld } from '../lib/inpatient'
import { useNow } from '../lib/hooks'
import { features } from '../lib/permissions'
import { normalize, similarPatients } from '../lib/patients'
import { MedicationForm, MedicationList } from '../components/Medications'
import { PatientPicker } from './Inpatients'
import { LogoMark } from '../components/Logo'
import type { ClinicSettings, GuestPatient, Patient, Prescription, PrescriptionItem } from '../lib/types'
import { DniInput } from '../components/DniInput'
import { DocHeader } from '../components/DocHeader'
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
  const { prescriptions, patient, staffById, user, can, settings } = useStore()
  const [mine, setMine] = useState(user?.role === 'doctor' && features(settings).multiDoctor)
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  // Cada receta nueva o repetida abre un formulario limpio
  const seq = useRef(0)
  const s = normalize(q)
  const nameOf = (r: Prescription) => { const p = patient(r.patientId); return p ? fullName(p) : r.guest?.name ?? '' }
  const list = prescriptions
    .filter((r) => !mine || r.doctorId === user?.id)
    .filter((r) => { const p = patient(r.patientId); return !s || normalize(`${nameOf(r)} ${p?.record ?? ''} ${r.guest?.phone ?? ''}`).includes(s) })
    .filter((r) => { const d = localISODate(new Date(r.issuedAt)); return (!from || d >= from) && (!to || d <= to) })
    .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
  const write = can('rx.write')
  const repeat = (r: Prescription) => {
    setDraft({ key: ++seq.current, patientId: r.patientId, guest: r.patientId ? undefined : r.guest, items: r.items.map((x) => ({ ...x })), indications: r.indications ?? [] })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  return (
    <div className="page">
      <PageHead title="Recetas" sub={write ? 'Emite una receta sin abrir una consulta, también para alguien que no está registrado, o repite una anterior.' : `${list.length} recetas emitidas`}
        actions={write && !draft && <button className="btn btn--primary" onClick={() => setDraft({ key: ++seq.current, patientId: '', items: [], indications: [] })}><Plus size={17} />Nueva receta</button>} />
      {write && draft && <NewPrescription key={draft.key} initial={draft} onClose={() => setDraft(null)} />}
      <section className="panel">
        <div className="panel__head">
          <div><h2>Historial</h2><p>{list.length} {list.length === 1 ? 'receta' : 'recetas'}</p></div>
          {user?.role === 'doctor' && features(settings).multiDoctor && (
            <div className="segmented" role="radiogroup" aria-label="Qué recetas ver">
              <button role="radio" aria-checked={mine} onClick={() => setMine(true)}>Mías</button>
              <button role="radio" aria-checked={!mine} onClick={() => setMine(false)}>Toda la clínica</button>
            </div>
          )}
        </div>
        <div className="panel__body rx-filters">
          <label className="field"><span>Paciente</span><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre o expediente" /></label>
          <label className="field"><span>Desde</span><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="field"><span>Hasta</span><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        {list.length ? <div className="rows">{list.map((r) => {
          const name = nameOf(r)
          if (!name) return null
          return (
            <div key={r.id} className="row rx-row">
              <Link to={`/app/recetas/${r.id}`} className="num rx-row__when">{date(r.issuedAt)}<br /><span style={{ color: 'var(--muted)' }}>{r.folio}</span></Link>
              <Link to={`/app/recetas/${r.id}`} className="row__who" style={{ textDecoration: 'none' }}>
                <strong>{name}{r.standalone && <span className="badge badge--ink" style={{ marginLeft: 8 }}>Sin consulta</span>}
                  {!r.patientId && <span className="badge badge--amber" style={{ marginLeft: 8 }}>Paciente no registrado</span>}</strong>
                <span>{r.items.map((i) => i.drug).join(', ')}, por {staffById(r.doctorId)?.name}</span>
              </Link>
              {write && <button className="btn btn--ghost btn--sm" onClick={() => repeat(r)}><Copy size={14} />Repetir receta</button>}
            </div>
          )
        })}</div> : <div className="empty">{q || from || to ? 'Ninguna receta coincide con la búsqueda.' : 'Las recetas que emitas aparecerán aquí.'}</div>}
      </section>
    </div>
  )
}

type Draft = { key: number; patientId: string; guest?: GuestPatient; items: PrescriptionItem[]; indications: string[] }
const EMPTY_GUEST: GuestPatient = { name: '', birthDate: '', age: '', dni: '', phone: '' }

/** Datos de la persona no registrada: sólo el nombre es obligatorio. Avisa si se parece a alguien de la biblioteca. */
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
        <label className="field"><span>Fecha de nacimiento (opcional)</span><input className="input" type="date" value={value.birthDate ?? ''} onChange={set('birthDate')} max={localISODate(now)} /></label>
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

export function PrescriptionSheet() {
  const { id } = useParams()
  const { staffById, fetchPrescription, settings, can } = useStore()
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchPrescription>> | null>(null)
  const [missing, setMissing] = useState(false)
  const load = useCallback(() => {
    if (id) fetchPrescription(id).then(setData).catch(() => setMissing(true))
  }, [id, fetchPrescription])
  useEffect(load, [load])
  if (missing) return <div className="page"><div className="empty">Esta receta no existe. Vuelve a <Link to="/app/recetas">Recetas</Link>.</div></div>
  if (!data) return <Loading label="Cargando receta" />
  const { prescription: rx, consultation: c, hospitalization: h, patient } = data
  const doc = staffById(rx.doctorId)!
  // Persona no registrada: se imprime con los datos que se escribieron
  const g = rx.guest
  const p: Pick<Patient, 'firstName' | 'lastName' | 'phone' | 'dni' | 'birthDate' | 'allergies' | 'record'> & Partial<Patient> = patient ?? {
    firstName: g?.name ?? '', lastName: '', phone: g?.phone ?? '', dni: g?.dni, birthDate: g?.birthDate ?? '', allergies: [], record: 'Paciente no registrado',
  }
  const name = `${p.firstName}${p.lastName ? ` ${p.lastName}` : ''}`
  const ageText = g && !patient ? (g.birthDate ? age(g.birthDate) : g.age ?? 'Sin dato') : age(p.birthDate)
  const dx = c?.diagnoses ?? []
  // Indicaciones: las de la receta sin consulta, las que el médico escribió aparte o, en consultas anteriores, las órdenes que no son medicamentos
  const notes = rx.indications ?? c?.indications ?? (c?.orders.length ? c.orders.filter((o) => !rx.items.some((it) => o.startsWith(it.drug))) : c?.plan ? [c.plan] : [])
  // WhatsApp no permite adjuntar el PDF desde un enlace: se envía el texto de la receta
  const rxMessage = [`${settings.name}. Receta ${rx.folio}, ${date(rx.issuedAt)}.`, `${doc.name}, colegiación ${doc.license ?? ''}.`, `Paciente: ${name}.`, '',
    ...rx.items.map((it, i) => `${i + 1}. ${medicationLine(it)}${it.instructions ? `. ${it.instructions}` : ''}`),
    ...(notes.length ? ['', 'Indicaciones:', ...notes.map((n) => `- ${n}`)] : [])].join('\n')

  return (
    <div className="page">
      <div className="page-head no-print">
        {patient ? <Link className="btn btn--ghost" to={h ? stayPath(h) : `/app/pacientes/${patient.id}`}><ChevronLeft size={16} />Expediente de {patient.firstName}</Link>
          : <Link className="btn btn--ghost" to="/app/recetas"><ChevronLeft size={16} />Recetas</Link>}
        <div className="page-head__actions">
          {!patient && g && can('rx.write') && can('patients.manage') && <GuestLink rx={rx} guest={g} onLinked={load} />}
          {p.phone && <a className="btn btn--ghost" href={whatsappUrl(p.phone, rxMessage)} target="_blank" rel="noreferrer"><MessageCircle size={16} />Enviar por WhatsApp</a>}
          <button className="btn btn--primary" onClick={() => window.print()}><Printer size={16} />Imprimir o guardar PDF (media carta)</button>
        </div>
      </div>
      <article className="rx-sheet rx-sheet--half">
        <header className="rx-sheet__head">
          <DocHeader clinic={{ ...settings, office: settings.kind === 'office' }}
            doctor={{ name: doc.name, specialty: doc.specialty ?? settings.specialty, license: doc.license ?? settings.license }} />
          <div className="rx-sheet__folio">Folio<b>{rx.folio}</b>{date(rx.issuedAt)}, {time(rx.issuedAt)}{h && <><br />Receta de egreso</>}{rx.standalone && <><br />Receta sin consulta</>}</div>
        </header>
        <div className="rx-sheet__pt">
          <div style={{ gridColumn: '1 / -1' }}><span>Nombre completo</span>{name}</div>
          <div style={!p.dni && p.guardianName ? { gridColumn: '1 / -1' } : undefined}><span>Identidad</span>{patient ? identityLine(patient, yearsOld(patient.birthDate) < 18) : p.dni || 'Sin registrar'}</div>
          <div><span>Edad</span>{ageText}</div>
          <div><span>Expediente</span>{patient ? recordNumber(patient, settings) : 'Paciente no registrado'}</div>
          {p.allergies.length > 0 && <div><span>Alergias</span>{p.allergies.join(', ')}</div>}
          {dx.length > 0 && <div style={{ gridColumn: '1 / -1' }}><span>Diagnóstico</span>{dx.map((d) => d.label).join('; ')}</div>}
        </div>
        <div className="rx-sheet__rx" aria-hidden="true">Rx</div>
        <ol>
          {rx.items.map((it, i) => (
            <li key={i}>
              <strong>{it.drug}</strong> <span style={{ color: 'var(--muted)' }}>{it.presentation}</span>
              <p>{it.dose}{it.route ? ` vía ${it.route.toLowerCase()}` : ''}, {it.frequency.toLowerCase()}{it.duration ? `, durante ${it.duration}` : ''}.{it.instructions ? ` ${it.instructions}` : ''}{it.quantity ? ` Cantidad: ${it.quantity}.` : ''}</p>
            </li>
          ))}
        </ol>
        {notes.length > 0 && (
          <div style={{ marginTop: 24, fontSize: 14 }}><b>Indicaciones generales</b>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{notes.map((n, i) => <li key={i}>{n}</li>)}</ul></div>
        )}
        <div className="rx-sheet__sign"><div><em>{doc.name.replace(/^Dra?\.\s*/, '')}</em>{doc.name}<br /><span style={{ color: 'var(--muted)' }}>{doc.license}</span></div></div>
        <footer className="rx-sheet__foot"><span>Receta válida por {rx.validityDays ?? settings.rxValidityDays} días a partir de su emisión.</span><span>Emitida con Clinara</span></footer>
      </article>
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
