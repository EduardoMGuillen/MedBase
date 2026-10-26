import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Ban, ChevronLeft, FileBadge, MessageCircle, Printer } from 'lucide-react'
import { useStore } from '../lib/store'
import { Loading, Modal } from '../components/ui'
import { age, date, localISODate, recordNumber, time, whatsappUrl } from '../lib/format'
import { yearsOld } from '../lib/inpatient'
import { CERT_KIND, certificateText, plainText } from '../lib/certificates'
import type { Certificate as Cert, CertificateData } from '../lib/types'
import { ClinicLogo } from './Prescriptions'
import { DniInput } from '../components/DniInput'

type Kind = Cert['kind']

/** Hoja de la constancia, tamaño carta, con espacio para firma y sello. */
function CertificateSheet({ kind, data, issuedAt, number, voided }: { kind: Kind; data: CertificateData; issuedAt: string; number?: string; voided?: boolean }) {
  const paras = certificateText(kind, data, issuedAt)
  return (
    <article className="rx-sheet cert" style={{ position: 'relative' }}>
      {voided && <div className="void-stamp">ANULADA</div>}
      <header className="rx-sheet__head">
        <div className="rx-sheet__doc">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}><ClinicLogo settings={{ ...data.clinic, email: '', currency: 'L', rxValidityDays: 30, reminderTemplate: '', recordUsesDni: false }} /><b>{data.clinic.name}</b></div>
          <h2>{data.doctor.name}</h2>
          <p>{data.doctor.specialty ? `${data.doctor.specialty}, ` : ''}colegiación {data.doctor.license}</p>
          <p>{data.clinic.address}{data.clinic.phone ? `, tel. ${data.clinic.phone}` : ''}</p>
        </div>
        <div className="rx-sheet__folio">{number ? <>Constancia<b>{number}</b></> : <>Vista previa<b>Sin emitir</b></>}{date(issuedAt)}</div>
      </header>
      <h1 className="cert__title">{CERT_KIND[kind].title}</h1>
      <p className="cert__to">{data.to}:</p>
      {paras.map((p, i) => <p key={i} className="cert__body">{p.map((x, j) => (x.b ? <b key={j}>{x.text}</b> : <span key={j}>{x.text}</span>))}</p>)}
      <div className="cert__sign">
        <div className="cert__stamp">Sello</div>
        <div className="rx-sheet__sign" style={{ marginTop: 0 }}><div><em>&nbsp;</em>{data.doctor.name}<br /><span style={{ color: 'var(--muted)' }}>Colegiación {data.doctor.license}</span></div></div>
      </div>
      <footer className="rx-sheet__foot"><span>{data.clinic.name}</span><span>Emitida con Clinara</span></footer>
    </article>
  )
}

/** El médico registra su número de colegiación una sola vez; lo llevan constancias y recetas. */
function LicensePrompt({ onDone }: { onDone: () => void }) {
  const { saveMyLicense } = useStore()
  const nav = useNavigate()
  const [v, setV] = useState('')
  return (
    <Modal title="Tu número de colegiación" onClose={() => nav(-1)} footer={<>
      <button className="btn btn--ghost" onClick={() => nav(-1)}>Ahora no</button>
      <button className="btn btn--primary" disabled={v.trim().length < 3} onClick={async () => { if (await saveMyLicense(v.trim())) onDone() }}>Guardar</button>
    </>}>
      <p>Las constancias llevan tu número de colegiación del Colegio Médico de Honduras. Escríbelo una vez y queda guardado en tu perfil.</p>
      <label className="field"><span>Número de colegiación</span><input className="input" autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder="Ej. CMH-08812" /></label>
    </Modal>
  )
}

/**
 * Generar constancia desde la nota de consulta: atención (con horas), incapacidad (días de reposo con
 * desde y hasta), para el acompañante o libre. El diagnóstico no va salvo que el médico lo marque.
 * Al emitirla se guarda con número correlativo y ya no se edita.
 */
export default function Certificate() {
  const { id } = useParams()
  const { fetchConsultation, staffById, settings, notify, user, appointments, createCertificate } = useStore()
  const nav = useNavigate()
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchConsultation>> | null>(null)
  const [kind, setKind] = useState<Kind>('rest')
  const [f, setF] = useState({ to: 'A quien corresponda', visitDate: '', fromTime: '', toTime: '', restDays: 3, restType: 'relativo' as 'relativo' | 'absoluto', restFrom: '', includeDx: false,
    companionName: '', companionDni: '', companionRelation: '', text: '', notes: '' })
  const [busy, setBusy] = useState(false)
  const [licenseOk, setLicenseOk] = useState(false)

  useEffect(() => { if (id) fetchConsultation(id).then(setData).catch((e: Error) => notify(e.message, 'error')) }, [id, fetchConsultation, notify])
  // Fecha y horas de la atención: de la llegada a la firma de la consulta
  useEffect(() => {
    if (!data) return
    const c = data.consultation
    const appt = appointments.find((a) => a.id === c.appointmentId)
    const end = new Date(c.date)
    const start = appt?.arrivedAt ? new Date(appt.arrivedAt) : new Date(end.getTime() - 30 * 60_000)
    const p = data.patient
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setF((x) => ({ ...x, visitDate: localISODate(end), restFrom: localISODate(end), fromTime: time(start.toISOString()), toTime: time(end.toISOString()),
      companionName: p.emergencyName ?? '', companionRelation: p.emergencyRelation ?? '' }))
  }, [data, appointments])

  if (!data || !user) return <Loading label="Preparando constancia" />
  const { consultation: c, patient: p } = data
  const doc = staffById(user.id) ?? user
  if (!doc.license && !licenseOk) return <LicensePrompt onDone={() => setLicenseOk(true)} />
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  const minor = p.birthDate ? yearsOld(p.birthDate) < 18 : false
  const draft: CertificateData = {
    to: f.to, visitDate: f.visitDate || localISODate(new Date(c.date)), fromTime: kind === 'rest' ? undefined : f.fromTime || undefined, toTime: kind === 'rest' ? undefined : f.toTime || undefined,
    includeDx: f.includeDx, diagnoses: c.diagnoses.map((d) => d.label), notes: f.notes.trim() || undefined, text: f.text,
    restDays: f.restDays, restType: f.restType, restFrom: f.restFrom,
    restTo: (() => { const d = new Date(`${f.restFrom || localISODate(new Date(c.date))}T12:00:00`); d.setDate(d.getDate() + Math.max(0, f.restDays - 1)); return localISODate(d) })(),
    companion: kind === 'companion' ? { name: f.companionName, dni: f.companionDni || undefined, relation: f.companionRelation || undefined } : undefined,
    patient: { name: `${p.firstName} ${p.lastName}`, dni: p.dni, age: age(p.birthDate), sex: p.sex, record: recordNumber(p, settings),
      guardian: minor && !p.dni && p.guardianName ? `${p.guardianName}${p.guardianDni ? `, identidad ${p.guardianDni}` : ''}` : undefined },
    doctor: { name: doc.name, specialty: doc.specialty, license: doc.license ?? '(pendiente)' },
    clinic: { name: settings.name, address: settings.address, phone: settings.phone, logo: settings.logo },
  }
  const ready = f.to.trim().length >= 2 && (kind !== 'free' || f.text.trim().length >= 10) && (kind !== 'companion' || f.companionName.trim().length >= 3) && (kind !== 'rest' || f.restDays >= 1)

  return (
    <div className="page">
      <div className="page-head no-print">
        <Link className="btn btn--ghost" to={`/app/pacientes/${p.id}`}><ChevronLeft size={16} />Expediente de {p.firstName}</Link>
      </div>
      <section className="panel no-print">
        <div className="panel__head"><div><h2>Generar constancia</h2><p>Consulta del {date(c.date)}. Revisa la vista previa; una vez emitida queda en el expediente y no se edita.</p></div></div>
        <div className="panel__body form-grid form-grid--4">
          <div className="field span-all"><span>Tipo de constancia</span>
            <div className="segmented" role="radiogroup">
              {(Object.keys(CERT_KIND) as Kind[]).map((k) => <button key={k} role="radio" aria-checked={kind === k} onClick={() => setKind(k)}>{CERT_KIND[k].label}</button>)}
            </div></div>
          <label className="field span-2"><span>Dirigida a</span><input className="input" value={f.to} onChange={(e) => set('to', e.target.value)} /></label>
          <label className="field"><span>Fecha de la atención</span><input className="input" type="date" value={f.visitDate} onChange={(e) => set('visitDate', e.target.value)} /></label>
          {kind !== 'rest' && kind !== 'free' && (<>
            <label className="field"><span>Hora de llegada</span><input className="input" type="time" value={f.fromTime} onChange={(e) => set('fromTime', e.target.value)} /></label>
            <label className="field"><span>Hora de salida</span><input className="input" type="time" value={f.toTime} onChange={(e) => set('toTime', e.target.value)} /></label>
          </>)}
          {kind === 'rest' && (<>
            <label className="field"><span>Días de reposo</span><input className="input num" type="number" min={1} max={90} value={f.restDays} onChange={(e) => set('restDays', Math.max(1, Math.min(90, Number(e.target.value) || 1)))} /></label>
            <label className="field"><span>Reposo</span><select className="select" value={f.restType} onChange={(e) => set('restType', e.target.value as 'relativo' | 'absoluto')}>
              <option value="relativo">Relativo</option><option value="absoluto">Absoluto (total)</option></select></label>
            <label className="field"><span>Desde</span><input className="input" type="date" value={f.restFrom} onChange={(e) => set('restFrom', e.target.value)} /></label>
            <div className="field"><span>Hasta (se calcula)</span><div className="picked"><b>{date(`${draft.restTo}T12:00:00`)}</b></div></div>
          </>)}
          {kind === 'companion' && (<>
            <label className="field span-2"><span>Nombre del acompañante</span><input className="input" value={f.companionName} onChange={(e) => set('companionName', e.target.value)} /></label>
            <label className="field"><span>Identidad del acompañante</span><DniInput value={f.companionDni} onChange={(v) => setF((x) => ({ ...x, companionDni: v }))} /></label>
            <label className="field"><span>Parentesco</span><input className="input" value={f.companionRelation} onChange={(e) => set('companionRelation', e.target.value)} placeholder="Ej. Madre" /></label>
          </>)}
          {kind === 'free' && <label className="field span-all"><span>Texto de la constancia</span>
            <textarea className="textarea" rows={6} value={f.text} onChange={(e) => set('text', e.target.value)} placeholder="Escribe la constancia. Deja una línea en blanco para separar párrafos." /></label>}
          {kind !== 'free' && c.diagnoses.length > 0 && (
            <label className="field span-all check-line"><input type="checkbox" checked={f.includeDx} onChange={(e) => set('includeDx', e.target.checked)} />
              <span><b>Incluir diagnóstico</b><small>Sólo si el paciente lo autoriza. Por defecto la constancia no lo lleva.</small></span></label>
          )}
          {kind !== 'free' && <label className="field span-all"><span>Indicaciones adicionales (opcional)</span><input className="input" value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Ej. Puede reincorporarse a sus labores con restricción de esfuerzo físico" /></label>}
          <div className="span-all" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn--primary" disabled={!ready || busy} onClick={async () => {
              setBusy(true)
              const r = await createCertificate({
                patientId: p.id, consultationId: c.id, kind, to: f.to.trim(), visitDate: draft.visitDate, fromTime: draft.fromTime, toTime: draft.toTime,
                restDays: kind === 'rest' ? f.restDays : undefined, restType: kind === 'rest' ? f.restType : undefined, restFrom: kind === 'rest' ? f.restFrom || undefined : undefined,
                includeDx: kind !== 'free' && f.includeDx, companion: draft.companion, text: kind === 'free' ? f.text.trim() : undefined, notes: draft.notes,
              })
              setBusy(false)
              if (r) nav(`/app/constancias/${r.id}`)
            }}><FileBadge size={16} />Emitir constancia</button>
          </div>
        </div>
      </section>
      <CertificateSheet kind={kind} data={draft} issuedAt={new Date().toISOString()} />
    </div>
  )
}

/** Constancia emitida: se reimprime igual, se envía por WhatsApp o se anula para emitir otra. */
export function CertificateView() {
  const { id } = useParams()
  const { fetchCertificate, notify, can, voidCertificate, staffById } = useStore()
  const [cert, setCert] = useState<Cert | null>(null)
  const [voiding, setVoiding] = useState(false)
  const [reason, setReason] = useState('')
  const { patient } = useStore()
  useEffect(() => { if (id) fetchCertificate(id).then(setCert).catch((e: Error) => notify(e.message, 'error')) }, [id, fetchCertificate, notify])
  if (!cert) return <Loading label="Abriendo constancia" />
  const p = patient(cert.patientId)
  const text = `${CERT_KIND[cert.kind].title} ${cert.number}\n${cert.data.to}:\n\n${plainText(certificateText(cert.kind, cert.data, cert.issuedAt))}\n\n${cert.data.doctor.name}, colegiación ${cert.data.doctor.license}`
  return (
    <div className="page">
      <div className="page-head no-print">
        <Link className="btn btn--ghost" to={`/app/pacientes/${cert.patientId}`}><ChevronLeft size={16} />Expediente de {cert.data.patient.name.split(' ')[0]}</Link>
        <div className="page-head__actions">
          {can('consult.write') && !cert.voidedAt && <button className="btn btn--ghost" onClick={() => setVoiding(true)}><Ban size={16} />Anular</button>}
          {p?.phone && !cert.voidedAt && <a className="btn btn--ghost" href={whatsappUrl(p.phone, text)} target="_blank" rel="noreferrer"><MessageCircle size={16} />Enviar por WhatsApp</a>}
          <button className="btn btn--primary" onClick={() => window.print()}><Printer size={16} />Imprimir o guardar PDF</button>
        </div>
      </div>
      {cert.voidedAt && (
        <div className="alert-strip no-print">Anulada el {date(cert.voidedAt)} a las {time(cert.voidedAt)} por {staffById(cert.voidedBy ?? '')?.name}: {cert.voidReason}.
          {cert.consultationId && can('consult.write') && <> <Link to={`/app/constancia/${cert.consultationId}`}>Emitir otra</Link></>}</div>
      )}
      <CertificateSheet kind={cert.kind} data={cert.data} issuedAt={cert.issuedAt} number={cert.number} voided={!!cert.voidedAt} />
      {voiding && (
        <Modal title={`Anular constancia ${cert.number}`} onClose={() => setVoiding(false)} footer={<>
          <button className="btn btn--ghost" onClick={() => setVoiding(false)}>Cancelar</button>
          <button className="btn btn--danger" disabled={reason.trim().length < 5} onClick={async () => {
            const r = await voidCertificate(cert.id, reason.trim())
            if (r) { setCert(r); setVoiding(false) }
          }}>Anular constancia</button>
        </>}>
          <p>Una constancia emitida no se edita. Si tiene un error, anúlala y emite otra. Queda en el expediente marcada como anulada.</p>
          <label className="field"><span>Motivo</span><input className="input" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. Días de reposo equivocados" /></label>
        </Modal>
      )}
    </div>
  )
}
