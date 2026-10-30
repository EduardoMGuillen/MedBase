import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Camera, ChevronLeft, FileSignature, FileText, PenLine, Printer } from 'lucide-react'
import { useStore } from '../lib/store'
import { Loading, Modal } from '../components/ui'
import { date, dateTime, formatPhone, shortStaff, time } from '../lib/format'
import { currentDiagnoses, yearsOld } from '../lib/inpatient'
import { authStatus, authTitle, consentStatements, FREQUENT_SURGERIES, HOSPITAL_CONSENT, HOSPITAL_DECLARATION, SURGICAL_GENERIC } from '../lib/consent'
import type { Authorization, AuthorizationData, InpatientFile, Patient } from '../lib/types'
import { openFile } from '../lib/files'
import { ConsentSigning } from './ConsentSigning'
import { ScanUpload } from './ScanUpload'
import { PdfPages } from '../components/PdfPages'
import { DniInput } from '../components/DniInput'
import { ClinicLogo } from './Prescriptions'

/**
 * Nueva autorización, sin pestañas: cada botón abre la suya.
 * - Quirúrgica: sólo el procedimiento (uno o varios, "X o Y") y, si el expediente no tiene diagnóstico, el
 *   diagnóstico. Todo lo demás lo pone el sistema y el texto es genérico. Botón → procedimiento → Generar.
 * - De hospitalización: una por estancia, con el acompañante; si ya hay una vigente se reabre (no se duplica).
 * La generan enfermería o el médico.
 */
export function AuthorizationForm({ file, p, template = 'surgical', initialProcedure, onClose, onCreated }: {
  file: InpatientFile; p: Patient; template?: 'hospital' | 'surgical'; initialProcedure?: string; onClose: () => void; onCreated: (a: Authorization) => void
}) {
  const { createAuthorization } = useStore()
  const h = file.hospitalization
  const minor = p.birthDate ? yearsOld(p.birthDate) < 18 : false
  const current = file.authorizations.find((a) => a.template === 'hospital' && (a.status === 'pending' || a.status === 'signed'))
  // MC2: el diagnóstico actual (el de la última nota que lo registró o, si no, el de ingreso), editable antes de generarla
  const [procedure, setProcedure] = useState(initialProcedure ?? '')
  const [diagnosis, setDiagnosis] = useState(() => currentDiagnoses(file).map((d) => d.label).join('; '))
  const [companion, setCompanion] = useState({ name: h.companionName ?? p.emergencyName ?? '', phone: h.companionPhone ?? p.emergencyPhone ?? '', relation: h.companionRelation ?? p.emergencyRelation ?? '' })
  const [rep, setRep] = useState({ on: minor, name: minor ? p.guardianName ?? p.emergencyName ?? '' : '', dni: minor ? p.guardianDni ?? '' : '', relation: minor ? p.guardianRelation ?? p.emergencyRelation ?? '' : '' })
  const [busy, setBusy] = useState(false)
  const surgical = template === 'surgical'
  // Firmada: sólo se abre. Pendiente: se puede completar el acompañante y se reabre la misma hoja (no se duplica)
  const signed = current?.status === 'signed'
  const ready = surgical
    ? procedure.trim().length >= 3 && diagnosis.trim().length >= 3
    : signed || (companion.name.trim().length >= 3 && companion.phone.replace(/\D/g, '').length >= 7 && (!rep.on || rep.name.trim().length >= 3))
  const generate = async () => {
    if (!ready || busy) return
    setBusy(true)
    const a = surgical
      ? await createAuthorization(h.id, { template, procedure: procedure.trim(), diagnosis: diagnosis.trim() })
      : await createAuthorization(h.id, { template, companion: { name: companion.name.trim(), phone: companion.phone.trim(), relation: companion.relation.trim() || undefined },
        representative: rep.on ? { name: rep.name.trim(), dni: rep.dni.trim() || undefined, relation: rep.relation.trim() || undefined } : undefined })
    setBusy(false)
    if (a) onCreated(a)
  }
  return (
    <Modal title={surgical ? 'Autorización quirúrgica' : 'Autorización de hospitalización'} wide={!surgical} onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      {!surgical && signed
        ? <button className="btn btn--primary" onClick={() => onCreated(current!)}><FileSignature size={16} />Abrir la autorización de esta estancia</button>
        : <button className="btn btn--primary" disabled={!ready || busy} onClick={generate}><FileSignature size={16} />{surgical ? 'Generar' : current ? 'Guardar y abrir la hoja' : 'Generar hoja para firmar'}</button>}
    </>}>
      {surgical ? (
        <form style={{ display: 'grid', gap: 12 }} onSubmit={(e) => { e.preventDefault(); generate() }}>
          <label className="field"><span>Procedimiento quirúrgico</span>
            <input className="input" autoFocus list="frequent-surgeries" value={procedure} onChange={(e) => setProcedure(e.target.value)} placeholder="Ej. Apendicectomía o laparotomía exploradora" />
            <datalist id="frequent-surgeries">{FREQUENT_SURGERIES.map((x) => <option key={x} value={x} />)}</datalist></label>
          <label className="field"><span>Diagnóstico actual</span><input className="input" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} /></label>
          <p className="muted" style={{ fontSize: 13.5 }}>Paciente, médico, fecha y acompañante los pone el sistema.</p>
        </form>
      ) : signed ? (
        <p>Esta estancia ya tiene su autorización de hospitalización firmada ({dateTime(current!.statusAt ?? current!.createdAt)}). No se crea otra.</p>
      ) : (<>
        <p className="muted" style={{ fontSize: 14 }}>{current ? `Ya se generó al ingresar (${dateTime(current.createdAt)}) y está pendiente de firma: no se crea otra. Revisa el acompañante y ábrela para imprimirla.`
          : 'Una sola hoja para todos los pacientes que se hospitalizan: autoriza el ingreso y la atención, los medicamentos y los procedimientos menores. Aquí sólo falta el acompañante.'}</p>
        <div className="form-grid">
          <label className="field"><span>Acompañante: nombre completo</span><input className="input" value={companion.name} onChange={(e) => setCompanion({ ...companion, name: e.target.value })} /></label>
          <label className="field"><span>Teléfono del acompañante</span><input className="input" inputMode="tel" value={companion.phone} onChange={(e) => setCompanion({ ...companion, phone: formatPhone(e.target.value) })} placeholder="0000-0000" /></label>
          <label className="field"><span>Parentesco (opcional)</span><input className="input" value={companion.relation} onChange={(e) => setCompanion({ ...companion, relation: e.target.value })} placeholder="Ej. Esposa" /></label>
        </div>
        <label className="check-line"><input type="checkbox" checked={rep.on} disabled={minor} onChange={(e) => setRep({ ...rep, on: e.target.checked })} />
          <span><b>Firma un representante legal</b><small>{minor ? 'El paciente es menor de edad: firma su padre, madre o representante legal.' : 'Si el paciente no puede decidir por sí mismo.'}</small></span></label>
        {rep.on && (
          <div className="form-grid">
            <label className="field"><span>Nombre del representante</span><input className="input" value={rep.name} onChange={(e) => setRep({ ...rep, name: e.target.value })} /></label>
            <label className="field"><span>Parentesco</span><input className="input" value={rep.relation} onChange={(e) => setRep({ ...rep, relation: e.target.value })} /></label>
            <label className="field"><span>Identidad del representante</span><DniInput value={rep.dni} onChange={(dni) => setRep({ ...rep, dni })} /></label>
          </div>
        )}
      </>)}
    </Modal>
  )
}

/**
 * Autorización en Anexos: estado y acciones. Pendiente: firmar en pantalla, subir la hoja firmada en papel o «No
 * autoriza» (en pantalla o en papel). Firmada: sólo ver e imprimir, revocar y, si fue en papel, reemplazar el escaneo.
 * Nada se edita después de firmar.
 */
export function AuthorizationEntry({ a, file, p, reload }: { a: Authorization; file: InpatientFile; p: Patient; reload: () => void }) {
  const { staffById, can, user, notify } = useStore()
  const [signing, setSigning] = useState<null | { action: 'accept' | 'refuse' | 'revoke'; doctorOnly?: boolean }>(null)
  const [scan, setScan] = useState<null | 'signed' | 'refused' | 'revoked' | 'replace' | 'attach'>(null)
  const [choose, setChoose] = useState<null | 'refuse' | 'revoke'>(null)
  const open = file.hospitalization.status === 'active'
  const manage = open && (can('inpatient.orders') || can('inpatient.care'))
  const st = authStatus(a)
  const waitingDoctor = a.status === 'pending' && a.signing?.action === 'accept' && !a.signing.doctor
  const s = a.signing
  const who = (id?: string) => shortStaff(staffById(id ?? '')?.name)
  const view = (id: string) => openFile(id).catch((e: Error) => notify(e.message, 'error'))
  const done = () => { setSigning(null); setScan(null); setChoose(null); reload() }
  return (
    <article className="panel consult-entry">
      <div className="panel__head">
        <div><h2>{authTitle(a)} <span className={`badge badge--${st.tone}`}>{st.label}{a.status === 'signed' && a.statusAt ? ` ✓ ${dateTime(a.statusAt)}` : ''}</span></h2>
          <p>Generada {dateTime(a.createdAt)} por {staffById(a.createdBy)?.name}{a.statusAt && a.statusBy ? ` · registrada por ${who(a.statusBy)} ${dateTime(a.statusAt)}` : ''}</p></div>
        <div className="auth-actions">
          <Link className="btn btn--ghost btn--sm" to={`/app/autorizaciones/${a.id}`}><Printer size={14} />Ver e imprimir</Link>
          {a.pdfId && <button className="btn btn--ghost btn--sm" onClick={() => view(a.pdfId!)}><FileText size={14} />PDF firmado</button>}
          {a.fileId && <button className="btn btn--ghost btn--sm" onClick={() => view(a.fileId!)}><FileText size={14} />Hoja escaneada</button>}
          {manage && a.status === 'pending' && (waitingDoctor
            ? (can('inpatient.orders') && user?.role === 'doctor'
              ? <button className="btn btn--primary btn--sm" onClick={() => setSigning({ action: 'accept', doctorOnly: true })}><FileSignature size={14} />Firmar como médico</button>
              : null)
            : <>
              <button className="btn btn--primary btn--sm" onClick={() => setSigning({ action: 'accept' })}><PenLine size={14} />Firmar en pantalla</button>
              <button className="btn btn--soft btn--sm" onClick={() => setScan('signed')}><Camera size={14} />Subir hoja firmada</button>
              <button className="btn btn--ghost btn--sm" onClick={() => setChoose('refuse')}>No autoriza</button>
            </>)}
          {manage && a.status === 'signed' && <>
            <button className="btn btn--ghost btn--sm" onClick={() => setChoose('revoke')}>Revocar</button>
            {a.method === 'paper' && a.fileId && <button className="btn btn--ghost btn--sm" onClick={() => setScan('replace')}>Reemplazar escaneo</button>}
            {a.method === 'virtual' && <button className="btn btn--ghost btn--sm" onClick={() => setScan('attach')}><Camera size={14} />{a.fileId ? 'Cambiar hoja en papel' : 'Adjuntar hoja en papel'}</button>}
          </>}
        </div>
      </div>
      {(s || a.statusNote || a.revocation || a.fileHistory?.length || waitingDoctor) && (
        <div className="panel__body auth-facts">
          {waitingDoctor && <p className="alert-strip alert-strip--amber">Firmó {s!.signer === 'representative' ? `el representante ${s!.representative?.name}` : 'el paciente'} el {dateTime(s!.signedAt)}. Falta la firma del médico{user?.role === 'doctor' ? '' : ': la pone un médico desde aquí'}.</p>}
          {s && !waitingDoctor && (
            <p>{s.action === 'refuse' ? 'Rechazo firmado en pantalla' : 'Firmada en pantalla'} por {s.signer === 'representative' ? `${s.representative?.name} (representante, ${s.representative?.relation?.toLowerCase()}, identidad ${s.representative?.dni})` : 'el paciente'}
              {s.unableReason ? `; no pudo firmar (${s.unableReason})` : ''}{s.witness ? `; testigo ${s.witness.name}${s.witness.dni ? `, identidad ${s.witness.dni}` : ''}` : ''}
              {s.doctor ? `; médico ${s.doctor.name}` : ''}. {s.device}, gestionado por {who(s.managedBy)}.</p>
          )}
          {a.pdfSha256 && <p className="muted auth-hash">Huella SHA-256 del PDF: <code>{a.pdfSha256}</code></p>}
          {a.statusNote && <p className="muted">{a.statusNote}</p>}
          {a.revocation && <p>Revocada {a.revocation.method === 'virtual' ? 'en pantalla' : 'en papel'} el {dateTime(a.revocation.at)}, registrada por {who(a.revocation.by)}.
            {a.revocation.pdfId && <> <button className="linklike" onClick={() => view(a.revocation!.pdfId!)}>Ver la revocación firmada</button>.</>}
            {a.revocation.fileId && <> <button className="linklike" onClick={() => view(a.revocation!.fileId!)}>Ver la hoja de revocación</button>.</>}</p>}
          {!!a.fileHistory?.length && (
            <details><summary className="muted">Escaneos anteriores ({a.fileHistory.length})</summary>
              <ul className="note__list">{a.fileHistory.map((x) => <li key={x.fileId}><button className="linklike" onClick={() => view(x.fileId)}>Escaneo reemplazado el {dateTime(x.replacedAt)}</button> por {who(x.replacedBy)}: {x.reason}</li>)}</ul>
            </details>
          )}
        </div>
      )}
      {choose && (
        <Modal title={choose === 'refuse' ? 'El paciente no autoriza' : 'El paciente revoca la autorización'} onClose={() => setChoose(null)}>
          <p>¿Cómo se firma?</p>
          <div className="choice-grid">
            <button className="choice" onClick={() => { setSigning({ action: choose }); setChoose(null) }}><PenLine size={22} /><b>En pantalla</b><small>En la tablet, el celular o esta computadora.</small></button>
            <button className="choice" onClick={() => { setScan(choose === 'refuse' ? 'refused' : 'revoked'); setChoose(null) }}><Camera size={22} /><b>En papel</b><small>Se imprime, se firma y se sube la foto o el PDF.</small></button>
          </div>
        </Modal>
      )}
      {signing && <ConsentSigning a={a} p={p} action={signing.action} doctorOnly={signing.doctorOnly} onClose={() => setSigning(null)} onDone={done} />}
      {scan && <ScanUpload a={a} mode={scan} onClose={() => setScan(null)} onDone={done} />}
    </article>
  )
}

/** Encabezado común de las hojas: clínica, dirección y fecha de la hoja. */
function SheetHead({ a }: { a: Authorization }) {
  const d = a.data
  return (
    <header className="rx-sheet__head">
      <div className="rx-sheet__doc">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}><ClinicLogo settings={{ ...d.clinic, email: '', currency: 'L', rxValidityDays: 30, reminderTemplate: '', recordUsesDni: false }} /><b>{d.clinic.name}</b></div>
        <p>{d.clinic.address}{d.clinic.phone ? `, tel. ${d.clinic.phone}` : ''}</p>
      </div>
      <div className="rx-sheet__folio">Fecha<b>{date(a.createdAt)}</b>{time(a.createdAt)}</div>
    </header>
  )
}

const LINE = '______________________'

/** Datos generales del paciente, como en las dos hojas. */
function PatientBlock({ d, extra }: { d: AuthorizationData; extra?: ReactNode }) {
  return (
    <div className="consent__pt">
      <span>Paciente: <b>{d.patient.name}</b></span><span>Identidad: <b>{d.patient.dni ?? (d.patient.minor ? 'Menor de edad' : LINE)}</b></span>
      <span>Edad: <b>{d.patient.age}</b></span><span>Sexo: <b>{d.patient.sex === 'F' ? 'Femenino' : 'Masculino'}</b></span><span>Expediente: <b>{d.patient.record}</b></span>
      {extra}
    </div>
  )
}

/**
 * Hojas tamaño carta, listas para firmar en papel. La de hospitalización cabe en una página; la quirúrgica
 * en una o dos. Las autorizaciones de antes de la v22 (general y de procedimiento) se siguen imprimiendo igual.
 */
export function AuthorizationSheet({ a }: { a: Authorization }) {
  if (a.template === 'hospital') return <HospitalSheet a={a} />
  if (a.data.generic) return <SurgicalSheet a={a} />
  const d: AuthorizationData = a.data
  const general = a.template === 'general'
  const rows: [string, string | undefined][] = general ? [['Diagnóstico o motivo del ingreso', d.diagnosis]] : [
    ['Procedimiento quirúrgico', d.procedure], ['Diagnóstico o motivo', d.diagnosis], ['En qué consiste', d.description], ['Beneficios esperados', d.benefits],
    ['Riesgos frecuentes y graves', d.risks], ['Alternativas', d.alternatives], ['Riesgo de no operarse', d.notDoing], ['Tipo de anestesia', d.anesthesia],
  ]
  const signer = d.representative ? `${d.representative.name}${d.representative.relation ? `, ${d.representative.relation.toLowerCase()}` : ''}` : d.patient.name
  return (
    <article className="rx-sheet consent">
      <SheetHead a={a} />
      <h1 className="cert__title">{general ? 'Autorización general de ingreso y atención' : 'Autorización quirúrgica (consentimiento informado)'}</h1>
      <PatientBlock d={d} extra={<span>Médico: <b>{d.doctor.name}</b>{d.doctor.license ? `, colegiación ${d.doctor.license}` : ''}</span>} />
      {/* Lo que no se escribió al generarla lleva líneas para completarlo a mano con el paciente */}
      <dl className="consent__info">{rows.filter(([, v]) => v || !general).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v || <span className="consent__blank" />}</dd></div>)}</dl>
      {d.representative && <p className="consent__intro">Representante legal: <b>{d.representative.name}</b>{d.representative.dni ? `, identidad ${d.representative.dni}` : ''}{d.representative.relation ? `, ${d.representative.relation.toLowerCase()}` : ''}.</p>}
      <h3 className="cn__h">Declaración</h3>
      <p className="consent__intro">Yo, {signer}{d.representative ? `, en representación de ${d.patient.name}` : ''}, declaro:</p>
      <ol className="consent__list">{consentStatements(general ? 'general' : 'surgical').map((x) => <li key={x}>{x}</li>)}</ol>
      {d.patient.minor && <p className="consent__intro">Asentimiento del menor (si tiene edad para entender): me explicaron y estoy de acuerdo. Firma: {LINE}</p>}
      <div className="consent__signs">
        <div><span className="consent__line" />Firma del {d.representative ? 'representante' : 'paciente'}<br /><small>{signer}{d.representative?.dni ? `, identidad ${d.representative.dni}` : ''}</small></div>
        <div className="consent__print">Huella digital<br /><small>si no sabe firmar</small></div>
        <div><span className="consent__line" />Testigo<br /><small>{d.witness ? `${d.witness.name}${d.witness.dni ? `, identidad ${d.witness.dni}` : ''}` : `Nombre: ${LINE} Identidad: ${LINE}`}</small></div>
        <div><span className="consent__line" />Firma y sello del médico<br /><small>{d.doctor.name}{d.doctor.license ? `, colegiación ${d.doctor.license}` : ', colegiación ______'}</small></div>
      </div>
      <div className="consent__box"><b>☐ No autorizo.</b> Recibí la misma información y decido no autorizar{general ? ' la atención' : ' el procedimiento'}. Entiendo los riesgos de no hacerlo. Firma: {LINE} Fecha y hora: ______________</div>
      <div className="consent__box"><b>Revocación.</b> Revoco la autorización que di en esta hoja. Fecha: ____________ Hora: ________ Firma: {LINE}</div>
      <footer className="rx-sheet__foot"><span>Texto a validar por la clínica y su asesor legal (Código de Ética del Colegio Médico de Honduras, cap. VIII).</span><span>Emitido con Clinara</span></footer>
    </article>
  )
}

/**
 * Autorización quirúrgica genérica (ronda 3): datos que pone el sistema, procedimiento, diagnóstico y el texto fijo.
 * Lo que se completa a mano (representante, asentimiento, testigo, firmas, rechazo y revocación) son líneas. Una página.
 */
function SurgicalSheet({ a }: { a: Authorization }) {
  const d = a.data
  return (
    <article className="rx-sheet consent consent--short">
      <SheetHead a={a} />
      <h1 className="cert__title">Autorización quirúrgica (consentimiento informado)</h1>
      <PatientBlock d={d} extra={<span>Médico: <b>{d.doctor.name}</b>{d.doctor.license ? `, colegiación ${d.doctor.license}` : ''}</span>} />
      {d.companion && <div className="consent__pt"><span>Acompañante: <b>{d.companion.name}</b></span>{d.companion.phone && <span>Teléfono: <b>{d.companion.phone}</b></span>}</div>}
      <dl className="consent__info">
        <div><dt>Procedimiento</dt><dd>{d.procedure}</dd></div>
        <div><dt>Diagnóstico</dt><dd>{d.diagnosis || <span className="consent__blank" />}</dd></div>
      </dl>
      <p className="consent__intro">Yo, {LINE}{LINE}, {d.patient.minor ? 'representante legal de' : 'paciente o representante legal de'} {d.patient.name}, declaro:</p>
      <ol className="consent__list">{SURGICAL_GENERIC.map((x) => <li key={x}>{x}</li>)}</ol>
      <p className="consent__intro">Representante legal (si el paciente es menor o no puede decidir): nombre {LINE} identidad {LINE} parentesco __________</p>
      {d.patient.minor && <p className="consent__intro">Asentimiento del menor (si tiene edad para entender): me explicaron y estoy de acuerdo. Firma: {LINE}</p>}
      <div className="consent__signs">
        <div><span className="consent__line" />Firma del paciente o representante</div>
        <div className="consent__print">Huella digital<br /><small>si no sabe firmar</small></div>
        <div><span className="consent__line" />Testigo<br /><small>Nombre: {LINE} Identidad: {LINE}</small></div>
        <div><span className="consent__line" />Firma y sello del médico<br /><small>{d.doctor.name}{d.doctor.license ? `, colegiación ${d.doctor.license}` : ', colegiación ______'}</small></div>
      </div>
      <div className="consent__box"><b>☐ No autorizo.</b> Recibí la misma información y decido no autorizar el procedimiento. Entiendo los riesgos de no hacerlo. Firma: {LINE} Fecha y hora: ______________</div>
      <div className="consent__box"><b>Revocación.</b> Revoco la autorización que di en esta hoja. Fecha: ____________ Hora: ________ Firma: {LINE}</div>
      <footer className="rx-sheet__foot"><span>Texto genérico a validar por la clínica y su asesor legal (Código de Ética del Colegio Médico de Honduras, cap. VIII).</span><span>Emitido con Clinara</span></footer>
    </article>
  )
}

/** Autorización de hospitalización: una página con los datos, el acompañante, lo que se autoriza y las firmas. */
function HospitalSheet({ a }: { a: Authorization }) {
  const d = a.data
  const signer = d.representative ? `${d.representative.name}${d.representative.relation ? `, ${d.representative.relation.toLowerCase()}` : ''}` : d.patient.name
  return (
    <article className="rx-sheet consent consent--short">
      <SheetHead a={a} />
      <h1 className="cert__title">Autorización de hospitalización</h1>
      <PatientBlock d={d} extra={<>
        <span>Ingreso: <b>{d.admission ? `${date(d.admission.at)}, ${time(d.admission.at)}` : LINE}</b></span>
        <span className="consent__wide">Diagnóstico de ingreso: <b>{d.admission?.diagnosis ?? d.diagnosis ?? LINE}</b></span>
      </>} />
      <div className="consent__pt">
        <span>Acompañante: <b>{d.companion?.name ?? LINE}</b></span><span>Teléfono: <b>{d.companion?.phone ?? LINE}</b></span>
        <span>Parentesco: <b>{d.companion?.relation ?? '__________'}</b></span>
      </div>
      <p className="consent__intro">Yo, {signer}{d.representative ? `${d.representative.dni ? `, identidad ${d.representative.dni}` : ''}, en representación de ${d.patient.name}` : ''}, autorizo a los médicos y al personal de {d.clinic.name}:</p>
      <ol className="consent__list">{HOSPITAL_CONSENT.map((x) => <li key={x}>{x}</li>)}</ol>
      <p className="consent__intro">{HOSPITAL_DECLARATION}</p>
      <div className="consent__signs">
        <div><span className="consent__line" />Firma del {d.representative ? 'representante' : 'paciente'}<br /><small>{signer}</small></div>
        <div className="consent__print">Huella digital<br /><small>si no sabe firmar</small></div>
        <div><span className="consent__line" />Nombre y firma del médico o responsable<br /><small>{d.doctor.name}{d.doctor.license ? `, colegiación ${d.doctor.license}` : ''}</small></div>
      </div>
      <footer className="rx-sheet__foot"><span>Texto a validar por la clínica y su asesor legal (Código de Ética del Colegio Médico de Honduras, cap. VIII).</span><span>Emitido con Clinara</span></footer>
    </article>
  )
}

/**
 * Página para ver e imprimir la autorización. Pendiente: la hoja en blanco para imprimir y firmar en papel. Firmada en
 * pantalla: las páginas del PDF firmado, que se ven igual que impresas. Firmada en papel: las páginas del escaneo.
 */
export default function AuthorizationPage() {
  const { id } = useParams()
  const { fetchAuthorization, notify } = useStore()
  const [a, setA] = useState<Authorization | null>(null)
  const [params] = useSearchParams()
  useEffect(() => { if (id) fetchAuthorization(id).then(setA).catch((e: Error) => notify(e.message, 'error')) }, [id, fetchAuthorization, notify])
  // MC1/MC2: «Imprimir para firmar en papel» abre esta hoja en otra pestaña y la manda a imprimir
  useEffect(() => { if (a && params.get('imprimir') === '1') { const t = setTimeout(() => window.print(), 400); return () => clearTimeout(t) } }, [a, params])
  if (!a) return <Loading label="Abriendo autorización" />
  const st = authStatus(a)
  const signed = a.pdfId ?? a.fileId
  return (
    <div className="page">
      <div className="page-head no-print">
        <Link className="btn btn--ghost" to={`/app/hospitalizados/${a.hospitalizationId}?tab=anexos`}><ChevronLeft size={16} />Volver a los anexos</Link>
        <div className="page-head__actions">
          <span className={`badge badge--${st.tone}`}>{st.label}</span>
          {a.pdfId && <button className="btn btn--ghost" onClick={() => openFile(a.pdfId!).catch((e: Error) => notify(e.message, 'error'))}><FileText size={16} />Abrir el PDF</button>}
          <button className="btn btn--primary" onClick={() => window.print()}><Printer size={16} />{signed ? 'Imprimir' : 'Imprimir para firmar'}</button>
        </div>
      </div>
      {a.pdfSha256 && <p className="muted no-print auth-hash" style={{ marginBottom: 12 }}>Huella SHA-256 del PDF firmado: <code>{a.pdfSha256}</code></p>}
      {signed ? <div className="signed-doc"><PdfPages fileId={signed} label={a.pdfId ? 'La autorización firmada' : 'La hoja escaneada'} /></div> : <AuthorizationSheet a={a} />}
      {a.revocation?.pdfId && <div className="signed-doc"><PdfPages fileId={a.revocation.pdfId} label="La revocación firmada" /></div>}
      {a.revocation?.fileId && <div className="signed-doc"><PdfPages fileId={a.revocation.fileId} label="La hoja de revocación" /></div>}
    </div>
  )
}
