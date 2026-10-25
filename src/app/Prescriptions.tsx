import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Copy, FileText, MessageCircle, Plus, Printer, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { Loading, PageHead } from '../components/ui'
import { age, date, fullName, identityLine, localISODate, medicationLine, recordNumber, time, whatsappUrl } from '../lib/format'
import { stayPath, yearsOld } from '../lib/inpatient'
import { normalize } from '../lib/patients'
import { MedicationForm, MedicationList } from '../components/Medications'
import { PatientPicker } from './Inpatients'
import { IdentityPrompt } from './PatientForms'
import { LogoMark } from '../components/Logo'
import type { ClinicSettings, Prescription, PrescriptionItem } from '../lib/types'

/** Logo de la clínica en recetas y constancias; si no hay uno cargado, el de Clinara. */
export function ClinicLogo({ settings, size = 26 }: { settings: ClinicSettings; size?: number }) {
  return settings.logo ? <img src={settings.logo} alt="" style={{ height: size * 1.6, maxWidth: 160, objectFit: 'contain' }} /> : <LogoMark size={size} />
}

/**
 * Recetas: el médico emite una receta sin abrir una consulta (por ejemplo, renovar el tratamiento de un
 * crónico) y consulta el historial, con "Repetir receta" para copiar una anterior.
 */
export default function Prescriptions() {
  const { prescriptions, patient, staffById, user, can } = useStore()
  const [mine, setMine] = useState(user?.role === 'doctor')
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [draft, setDraft] = useState<{ key: number; patientId: string; items: PrescriptionItem[]; indications: string[] } | null>(null)
  // Cada receta nueva o repetida abre un formulario limpio
  const seq = useRef(0)
  const s = normalize(q)
  const list = prescriptions
    .filter((r) => !mine || r.doctorId === user?.id)
    .filter((r) => { const p = patient(r.patientId); return !s || (p && normalize(`${fullName(p)} ${p.record}`).includes(s)) })
    .filter((r) => { const d = localISODate(new Date(r.issuedAt)); return (!from || d >= from) && (!to || d <= to) })
    .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
  const write = can('rx.write')
  const repeat = (r: Prescription) => {
    setDraft({ key: ++seq.current, patientId: r.patientId, items: r.items.map((x) => ({ ...x })), indications: r.indications ?? [] })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  return (
    <div className="page">
      <PageHead title="Recetas" sub={write ? 'Emite una receta sin abrir una consulta, o repite una anterior.' : `${list.length} recetas emitidas`}
        actions={write && !draft && <button className="btn btn--primary" onClick={() => setDraft({ key: ++seq.current, patientId: '', items: [], indications: [] })}><Plus size={17} />Nueva receta</button>} />
      {write && draft && <NewPrescription key={draft.key} initial={draft} onClose={() => setDraft(null)} />}
      <section className="panel">
        <div className="panel__head">
          <div><h2>Historial</h2><p>{list.length} {list.length === 1 ? 'receta' : 'recetas'}</p></div>
          {user?.role === 'doctor' && (
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
          const p = patient(r.patientId)
          if (!p) return null
          return (
            <div key={r.id} className="row rx-row">
              <Link to={`/app/recetas/${r.id}`} className="num rx-row__when">{date(r.issuedAt)}<br /><span style={{ color: 'var(--muted)' }}>{r.folio}</span></Link>
              <Link to={`/app/recetas/${r.id}`} className="row__who" style={{ textDecoration: 'none' }}>
                <strong>{fullName(p)}{r.standalone && <span className="badge badge--ink" style={{ marginLeft: 8 }}>Sin consulta</span>}</strong>
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

/** Paciente → medicamentos → indicaciones → emitir. Usa el mismo formulario de medicamento de la consulta. */
function NewPrescription({ initial, onClose }: { initial: { patientId: string; items: PrescriptionItem[]; indications: string[] }; onClose: () => void }) {
  const { patient, issuePrescription } = useStore()
  const nav = useNavigate()
  const [patientId, setPatientId] = useState(initial.patientId)
  const [items, setItems] = useState<PrescriptionItem[]>(initial.items)
  const [indications, setIndications] = useState(initial.indications.join('\n'))
  const [medForm, setMedForm] = useState<{ index: number; initial?: PrescriptionItem } | null>(initial.items.length ? null : { index: -1 })
  const [busy, setBusy] = useState(false)
  const p = patientId ? patient(patientId) : undefined
  const needsDni = !!p && !p.dni && !!p.birthDate && yearsOld(p.birthDate) >= 18
  const ready = p && items.length > 0 && !needsDni && !medForm
  return (
    <section className="panel">
      <div className="panel__head"><div><h2>{initial.items.length ? 'Repetir receta' : 'Nueva receta'}</h2><p>Queda en el expediente del paciente como receta sin consulta.</p></div>
        <button className="icon-btn" aria-label="Cerrar" onClick={onClose}><X size={18} /></button></div>
      <div className="panel__body" style={{ display: 'grid', gap: 16 }}>
        <PatientPicker value={patientId} onChange={setPatientId} />
        {p && p.allergies.length > 0 && <div className="alert-strip">Alergias: {p.allergies.join(', ')}</div>}
        {p && needsDni && <IdentityPrompt p={p} />}
        {p && (<>
          <div className="plan-block">
            <h3 className="plan-block__title">Medicamentos</h3>
            <MedicationList items={items} patient={p} editing={medForm?.index ?? null}
              onEdit={(i) => setMedForm({ index: i, initial: items[i] })} onRemove={(i) => { setItems(items.filter((_, j) => j !== i)); setMedForm(null) }} />
            {medForm ? (
              <MedicationForm key={medForm.index} patient={p} current={items} initial={medForm.initial}
                onSave={(it) => { setItems(medForm.index >= 0 ? items.map((x, j) => (j === medForm.index ? it : x)) : [...items, it]); setMedForm(null) }}
                onCancel={() => setMedForm(null)} />
            ) : <button className="btn btn--soft" style={{ justifySelf: 'start' }} onClick={() => setMedForm({ index: -1 })}><Plus size={16} />Agregar medicamento</button>}
          </div>
          <label className="field"><span>Indicaciones (opcional, una por línea)</span>
            <textarea className="textarea textarea--sm" rows={3} value={indications} onChange={(e) => setIndications(e.target.value)} placeholder="Ej. Control de presión arterial en casa. Cita de control en 3 meses." /></label>
        </>)}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn--primary" disabled={!ready || busy} onClick={async () => {
            setBusy(true)
            const r = await issuePrescription({ patientId, items, indications: indications.split('\n').map((x) => x.trim()).filter(Boolean) })
            setBusy(false)
            if (r) nav(`/app/recetas/${r.prescriptionId}`)
          }}><FileText size={16} />Emitir receta</button>
          <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          {p && !items.length && <span className="muted" style={{ fontSize: 13.5 }}>Agrega al menos un medicamento.</span>}
          {medForm && items.length > 0 && <span className="muted" style={{ fontSize: 13.5 }}>Termina o cancela el medicamento que estás editando.</span>}
        </div>
      </div>
    </section>
  )
}

export function PrescriptionSheet() {
  const { id } = useParams()
  const { staffById, fetchPrescription, settings } = useStore()
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchPrescription>> | null>(null)
  const [missing, setMissing] = useState(false)
  useEffect(() => {
    if (id) fetchPrescription(id).then(setData).catch(() => setMissing(true))
  }, [id, fetchPrescription])
  if (missing) return <div className="page"><div className="empty">Esta receta no existe. Vuelve a <Link to="/app/recetas">Recetas</Link>.</div></div>
  if (!data) return <Loading label="Cargando receta" />
  const { prescription: rx, consultation: c, hospitalization: h, patient: p } = data
  const doc = staffById(rx.doctorId)!
  const dx = c?.diagnoses ?? []
  // Indicaciones: las de la receta sin consulta, las que el médico escribió aparte o, en consultas anteriores, las órdenes que no son medicamentos
  const notes = rx.indications ?? c?.indications ?? (c?.orders.length ? c.orders.filter((o) => !rx.items.some((it) => o.startsWith(it.drug))) : c?.plan ? [c.plan] : [])
  // WhatsApp no permite adjuntar el PDF desde un enlace: se envía el texto de la receta
  const rxMessage = [`${settings.name}. Receta ${rx.folio}, ${date(rx.issuedAt)}.`, `${doc.name}, colegiación ${doc.license ?? ''}.`, `Paciente: ${fullName(p)}.`, '',
    ...rx.items.map((it, i) => `${i + 1}. ${medicationLine(it)}${it.instructions ? `. ${it.instructions}` : ''}`),
    ...(notes.length ? ['', 'Indicaciones:', ...notes.map((n) => `- ${n}`)] : [])].join('\n')

  return (
    <div className="page">
      <div className="page-head no-print">
        <Link className="btn btn--ghost" to={h ? stayPath(h) : `/app/pacientes/${p.id}`}><ChevronLeft size={16} />Expediente de {p.firstName}</Link>
        <div className="page-head__actions">
          {p.phone && <a className="btn btn--ghost" href={whatsappUrl(p.phone, rxMessage)} target="_blank" rel="noreferrer"><MessageCircle size={16} />Enviar por WhatsApp</a>}
          <button className="btn btn--primary" onClick={() => window.print()}><Printer size={16} />Imprimir o guardar PDF (media carta)</button>
        </div>
      </div>
      <article className="rx-sheet rx-sheet--half">
        <header className="rx-sheet__head">
          <div className="rx-sheet__doc">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}><ClinicLogo settings={settings} /><b>{settings.name}</b></div>
            <h2>{doc.name}</h2>
            <p>{doc.specialty}, colegiación {doc.license}</p>
            <p>{settings.address}, tel. {settings.phone}</p>
          </div>
          <div className="rx-sheet__folio">Folio<b>{rx.folio}</b>{date(rx.issuedAt)}, {time(rx.issuedAt)}{h && <><br />Receta de egreso</>}{rx.standalone && <><br />Receta sin consulta</>}</div>
        </header>
        <div className="rx-sheet__pt">
          <div style={{ gridColumn: '1 / -1' }}><span>Nombre completo</span>{fullName(p)}</div>
          <div style={!p.dni && p.guardianName ? { gridColumn: '1 / -1' } : undefined}><span>Identidad</span>{identityLine(p, yearsOld(p.birthDate) < 18)}</div>
          <div><span>Edad</span>{age(p.birthDate)}</div>
          <div><span>Expediente</span>{recordNumber(p, settings)}</div>
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
        <footer className="rx-sheet__foot"><span>Receta válida por {settings.rxValidityDays} días a partir de su emisión.</span><span>Emitida con Clinara</span></footer>
      </article>
    </div>
  )
}
