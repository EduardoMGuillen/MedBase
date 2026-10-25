import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Camera, ChevronLeft, FileSignature, Printer } from 'lucide-react'
import { useStore } from '../lib/store'
import { Loading, Modal } from '../components/ui'
import { date, dateTime, shortStaff, time } from '../lib/format'
import { yearsOld } from '../lib/inpatient'
import { AUTH_STATUS, authTitle, CONSENT_LIBRARY, consentStatements } from '../lib/consent'
import type { Authorization, AuthorizationData, InpatientFile, Patient } from '../lib/types'
import { toBase64 } from './Attachments'
import { ClinicLogo } from './Prescriptions'

/**
 * Nueva autorización. General (al ingresar) o para un procedimiento: el médico elige de la biblioteca de
 * procedimientos frecuentes, que precarga descripción, riesgos y alternativas, y lo edita. El sistema pone
 * los datos de la clínica, del paciente y del médico.
 */
export function AuthorizationForm({ file, p, initialProcedure, onClose, onCreated }: {
  file: InpatientFile; p: Patient; initialProcedure?: string; onClose: () => void; onCreated: (a: Authorization) => void
}) {
  const { createAuthorization } = useStore()
  const minor = p.birthDate ? yearsOld(p.birthDate) < 18 : false
  const fromLibrary = (name?: string) => CONSENT_LIBRARY.find((x) => x.name.toLowerCase() === (name ?? '').toLowerCase())
  const lib = fromLibrary(initialProcedure)
  const [template, setTemplate] = useState<Authorization['template']>(initialProcedure ? 'procedure' : file.authorizations.some((a) => a.template === 'general') ? 'procedure' : 'general')
  const [f, setF] = useState({
    procedure: lib?.name ?? initialProcedure ?? '', diagnosis: file.hospitalization.diagnoses.map((d) => d.label).join('; '), description: lib?.description ?? '', benefits: lib?.benefits ?? '',
    risks: lib?.risks ?? '', alternatives: lib?.alternatives ?? '', notDoing: lib?.notDoing ?? '', anesthesia: lib?.anesthesia ?? '',
  })
  const [rep, setRep] = useState({ on: minor, name: minor ? p.guardianName ?? p.emergencyName ?? '' : '', dni: minor ? p.guardianDni ?? '' : '', relation: minor ? p.guardianRelation ?? p.emergencyRelation ?? '' : '' })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })
  const pick = (name: string) => {
    const x = fromLibrary(name)
    setF(x ? { ...f, procedure: x.name, description: x.description, benefits: x.benefits, risks: x.risks, alternatives: x.alternatives, notDoing: x.notDoing, anesthesia: x.anesthesia } : { ...f, procedure: name })
  }
  const ready = (template === 'general' || (f.procedure.trim().length >= 3 && f.description.trim() && f.risks.trim())) && (!rep.on || rep.name.trim().length >= 3)
  const area = (k: keyof typeof f, label: string, rows = 2) => (
    <label className="field span-2"><span>{label}</span><textarea className="textarea textarea--sm" rows={rows} value={f[k]} onChange={set(k)} /></label>
  )
  return (
    <Modal title="Autorización" wide onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!ready || busy} onClick={async () => {
        setBusy(true)
        const a = await createAuthorization(file.hospitalization.id, {
          template, ...(template === 'procedure' ? Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim() || undefined])) : { diagnosis: f.diagnosis.trim() || undefined }),
          representative: rep.on ? { name: rep.name.trim(), dni: rep.dni.trim() || undefined, relation: rep.relation.trim() || undefined } : undefined,
        })
        setBusy(false)
        if (a) onCreated(a)
      }}><FileSignature size={16} />Generar hoja para firmar</button>
    </>}>
      <div className="segmented" role="radiogroup" aria-label="Tipo de autorización">
        <button role="radio" aria-checked={template === 'general'} onClick={() => setTemplate('general')}>General de ingreso y atención</button>
        <button role="radio" aria-checked={template === 'procedure'} onClick={() => setTemplate('procedure')}>Para un procedimiento</button>
      </div>
      {template === 'general' ? (
        <p className="muted" style={{ fontSize: 14 }}>El paciente autoriza la atención, los exámenes y tratamientos habituales del servicio y la toma de muestras durante su estancia.</p>
      ) : (
        <div className="form-grid">
          <label className="field span-2"><span>Procedimiento a realizar</span>
            <input className="input" list="consent-library" value={f.procedure} onChange={(e) => pick(e.target.value)} placeholder="Elige de la lista o escríbelo" />
            <datalist id="consent-library">{CONSENT_LIBRARY.map((x) => <option key={x.name} value={x.name} />)}</datalist>
            <small className="muted">Los procedimientos frecuentes precargan la explicación; revísala y ajústala a este paciente.</small></label>
          {area('diagnosis', 'Diagnóstico o motivo')}
          {area('description', 'En qué consiste (palabras sencillas)', 3)}
          {area('benefits', 'Beneficios esperados')}
          {area('risks', 'Riesgos frecuentes y graves', 3)}
          {area('alternatives', 'Alternativas')}
          {area('notDoing', 'Riesgo de no realizarlo')}
          <label className="field"><span>Anestesia (si aplica)</span><input className="input" value={f.anesthesia} onChange={set('anesthesia')} /></label>
        </div>
      )}
      <label className="check-line"><input type="checkbox" checked={rep.on} disabled={minor} onChange={(e) => setRep({ ...rep, on: e.target.checked })} />
        <span><b>Firma un representante</b><small>{minor ? 'El paciente es menor de edad: firma su padre, madre o representante legal; si tiene edad para entender, también da su asentimiento.' : 'Si el paciente no tiene capacidad para decidir.'}</small></span></label>
      {rep.on && (
        <div className="form-grid">
          <label className="field"><span>Nombre del representante</span><input className="input" value={rep.name} onChange={(e) => setRep({ ...rep, name: e.target.value })} /></label>
          <label className="field"><span>Parentesco</span><input className="input" value={rep.relation} onChange={(e) => setRep({ ...rep, relation: e.target.value })} /></label>
          <label className="field"><span>Identidad del representante</span><input className="input" value={rep.dni} onChange={(e) => setRep({ ...rep, dni: e.target.value })} placeholder="0000-0000-00000" /></label>
        </div>
      )}
    </Modal>
  )
}

/** Autorización en la línea de tiempo: estado y acciones (ver e imprimir, subir la hoja firmada, rechazo, revocación). */
export function AuthorizationEntry({ a, file, reload }: { a: Authorization; file: InpatientFile; reload: () => void }) {
  const { staffById, can, uploadAttachment, setAuthorizationStatus, notify } = useStore()
  const [action, setAction] = useState<null | 'signed' | 'refused' | 'revoked'>(null)
  const [note, setNote] = useState('')
  const [picked, setPicked] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const open = file.hospitalization.status === 'active'
  const st = AUTH_STATUS[a.status]
  const save = async () => {
    if (!action) return
    setBusy(true)
    let fileId: string | undefined
    if (picked) {
      if (picked.size > 3 * 1024 * 1024) { notify('El archivo pesa más de 3 MB. Toma la foto con menor resolución.', 'error'); setBusy(false); return }
      const att = await uploadAttachment(a.patientId, { name: picked.name, mime: picked.type, category: 'document', data: await toBase64(picked), title: `Autorización ${a.data.procedure ?? 'general'} (${AUTH_STATUS[action].label.toLowerCase()})`, takenAt: new Date().toISOString(), hospitalizationId: a.hospitalizationId })
      if (!att) { setBusy(false); return }
      fileId = att.id
    }
    const ok = await setAuthorizationStatus(a.id, { status: action, fileId, note: note.trim() || undefined })
    setBusy(false)
    if (ok) { setAction(null); setPicked(null); setNote(''); reload() }
  }
  return (
    <article className="panel consult-entry">
      <div className="panel__head">
        <div><h2>{authTitle(a)} <span className={`badge badge--${st.tone}`}>{st.label}{a.status === 'signed' && a.statusAt ? ` ✓ ${dateTime(a.statusAt)}` : ''}</span></h2>
          <p>Generada {dateTime(a.createdAt)} por {staffById(a.createdBy)?.name}{a.statusAt && a.statusBy ? ` · ${st.label} registrada por ${shortStaff(staffById(a.statusBy)?.name)} ${dateTime(a.statusAt)}` : ''}</p></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn btn--ghost btn--sm" to={`/app/autorizaciones/${a.id}`}><Printer size={14} />Ver e imprimir</Link>
          {a.fileId && <a className="btn btn--ghost btn--sm" href={`/api/attachments/${a.fileId}`} target="_blank" rel="noreferrer">Hoja firmada</a>}
          {open && can('inpatient.view') && a.status === 'pending' && <>
            <button className="btn btn--primary btn--sm" onClick={() => setAction('signed')}><Camera size={14} />Subir hoja firmada</button>
            <button className="btn btn--ghost btn--sm" onClick={() => setAction('refused')}>No autoriza</button>
          </>}
          {open && can('inpatient.view') && a.status === 'signed' && <button className="btn btn--ghost btn--sm" onClick={() => setAction('revoked')}>Revocada</button>}
        </div>
      </div>
      {a.statusNote && <div className="panel__body"><p className="muted">{a.statusNote}</p></div>}
      {action && (
        <Modal title={action === 'signed' ? 'Hoja firmada' : action === 'refused' ? 'El paciente no autoriza' : 'El paciente revoca la autorización'} onClose={() => setAction(null)} footer={<>
          <button className="btn btn--ghost" onClick={() => setAction(null)}>Cancelar</button>
          <button className="btn btn--primary" disabled={busy || (action === 'signed' ? !picked : !picked && note.trim().length < 3)} onClick={save}>Guardar</button>
        </>}>
          <p>{action === 'signed' ? 'Toma una foto de la hoja firmada (o elige el PDF). Queda en el expediente.' : 'Registra la hoja con la casilla correspondiente firmada, o escribe una nota de lo ocurrido.'}</p>
          <button className="btn btn--soft" onClick={() => input.current?.click()}><Camera size={16} />{picked ? 'Cambiar archivo' : 'Tomar foto o elegir archivo'}</button>
          {picked && <span className="muted">{picked.name}</span>}
          <input ref={input} type="file" accept="image/*,application/pdf" capture="environment" hidden onChange={(e) => setPicked(e.target.files?.[0] ?? null)} />
          <label className="field"><span>Nota {action === 'signed' ? '(opcional)' : ''}</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={action === 'refused' ? 'Ej. Paciente decide no realizarse el procedimiento' : ''} /></label>
        </Modal>
      )}
    </article>
  )
}

/** Hoja de la autorización, tamaño carta, lista para firmar en papel. */
export function AuthorizationSheet({ a }: { a: Authorization }) {
  const d: AuthorizationData = a.data
  const general = a.template === 'general'
  const rows: [string, string | undefined][] = general ? [['Diagnóstico o motivo del ingreso', d.diagnosis]] : [
    ['Procedimiento', d.procedure], ['Diagnóstico o motivo', d.diagnosis], ['En qué consiste', d.description], ['Beneficios esperados', d.benefits],
    ['Riesgos frecuentes y graves', d.risks], ['Alternativas', d.alternatives], ['Riesgo de no realizarlo', d.notDoing], ['Anestesia', d.anesthesia],
  ]
  const signer = d.representative ? `${d.representative.name}${d.representative.relation ? `, ${d.representative.relation.toLowerCase()}` : ''}` : d.patient.name
  return (
    <article className="rx-sheet consent">
      <header className="rx-sheet__head">
        <div className="rx-sheet__doc">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}><ClinicLogo settings={{ ...d.clinic, email: '', currency: 'L', rxValidityDays: 30, reminderTemplate: '', recordUsesDni: false }} /><b>{d.clinic.name}</b></div>
          <p>{d.clinic.address}{d.clinic.phone ? `, tel. ${d.clinic.phone}` : ''}</p>
        </div>
        <div className="rx-sheet__folio">Fecha<b>{date(a.createdAt)}</b>{time(a.createdAt)}</div>
      </header>
      <h1 className="cert__title">{general ? 'Autorización general de ingreso y atención' : 'Consentimiento informado para procedimiento'}</h1>
      <div className="consent__pt">
        <span>Paciente: <b>{d.patient.name}</b></span><span>Identidad: <b>{d.patient.dni ?? (d.patient.minor ? 'Menor de edad' : '________________')}</b></span>
        <span>Edad: <b>{d.patient.age}</b></span><span>Sexo: <b>{d.patient.sex === 'F' ? 'Femenino' : 'Masculino'}</b></span><span>Expediente: <b>{d.patient.record}</b></span>
        <span>Médico: <b>{d.doctor.name}</b>{d.doctor.license ? `, colegiación ${d.doctor.license}` : ''}</span>
      </div>
      <dl className="consent__info">{rows.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <h3 className="cn__h">Declaración</h3>
      <p className="consent__intro">Yo, {signer}{d.representative ? `, en representación de ${d.patient.name}` : ''}, declaro:</p>
      <ol className="consent__list">{consentStatements(general).map((x) => <li key={x}>{x}</li>)}</ol>
      {d.patient.minor && <p className="consent__intro">Asentimiento del menor (si tiene edad para entender): me explicaron y estoy de acuerdo. Firma: ______________________</p>}
      <div className="consent__signs">
        <div><span className="consent__line" />Firma del {d.representative ? 'representante' : 'paciente'}<br /><small>{signer}{d.representative?.dni ? `, identidad ${d.representative.dni}` : ''}</small></div>
        <div className="consent__print">Huella digital<br /><small>si no sabe firmar</small></div>
        <div><span className="consent__line" />Testigo<br /><small>Nombre: ____________________ Identidad: ______________</small></div>
        <div><span className="consent__line" />Firma y sello del médico<br /><small>{d.doctor.name}{d.doctor.license ? `, colegiación ${d.doctor.license}` : ''}</small></div>
      </div>
      <div className="consent__box"><b>☐ No autorizo.</b> Recibí la misma información y decido no autorizar{general ? ' la atención' : ' el procedimiento'}. Entiendo los riesgos de no hacerlo. Firma: ______________________ Fecha y hora: ______________</div>
      <div className="consent__box"><b>Revocación.</b> Revoco la autorización que di en esta hoja. Fecha: ____________ Hora: ________ Firma: ______________________</div>
      <footer className="rx-sheet__foot"><span>Texto a validar por la clínica y su asesor legal (Código de Ética del Colegio Médico de Honduras, cap. VIII).</span><span>Emitido con Clinara</span></footer>
    </article>
  )
}

/** Página para ver e imprimir la autorización. */
export default function AuthorizationPage() {
  const { id } = useParams()
  const { fetchAuthorization, notify } = useStore()
  const [a, setA] = useState<Authorization | null>(null)
  useEffect(() => { if (id) fetchAuthorization(id).then(setA).catch((e: Error) => notify(e.message, 'error')) }, [id, fetchAuthorization, notify])
  if (!a) return <Loading label="Abriendo autorización" />
  return (
    <div className="page">
      <div className="page-head no-print">
        <Link className="btn btn--ghost" to={`/app/hospitalizados/${a.hospitalizationId}?tab=notas`}><ChevronLeft size={16} />Volver al expediente</Link>
        <div className="page-head__actions">
          <span className={`badge badge--${AUTH_STATUS[a.status].tone}`}>{AUTH_STATUS[a.status].label}</span>
          <button className="btn btn--primary" onClick={() => window.print()}><Printer size={16} />Imprimir para firmar</button>
        </div>
      </div>
      <AuthorizationSheet a={a} />
    </div>
  )
}

