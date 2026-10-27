import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, Printer } from 'lucide-react'
import { useStore } from '../lib/store'
import { Loading } from '../components/ui'
import { date, fullName, recordNumber, shortStaff, time, dxCode } from '../lib/format'
import { currentEpicrisis, medLabel, orderMark, splitOrders, stayPath } from '../lib/inpatient'
import { authStatus, authTitle } from '../lib/consent'
import { PdfPages } from '../components/PdfPages'
import { EpicrisisSheet } from './Epicrisis'
import { ROLE_LABEL } from '../lib/permissions'
import type { Consultation, InpatientFile, InpatientNote, Patient, Vitals } from '../lib/types'
import { ConsultationBody, Identification } from './PatientChart'
import { NoteColumns, NoteText } from '../components/NoteColumns'
import { ReferralSheet } from './Referral'
import { bedLabel } from './Inpatients'
import { ClinicLogo } from './Prescriptions'

const dm = (iso: string) => `${date(iso, { day: '2-digit', month: '2-digit', year: 'numeric' })} ${time(iso)}`

/**
 * Una página (o varias, si el contenido no cabe) del expediente impreso. El encabezado va en el `<thead>`
 * de una tabla para que Chrome lo repita en cada hoja; el número de página lo pone `@page`.
 */
function PrintPage({ id, section, p, record, clinic, children, continuous }: {
  id?: string; section: string; p: Patient; record: string; clinic: string; children: ReactNode; continuous?: boolean
}) {
  return (
    <table className={`fr-page ${continuous ? 'fr-page--cont' : ''}`} id={id}>
      <thead><tr><td>
        <div className="fr-head"><span>{clinic}</span><span><b>{fullName(p)}</b> · Exp. {record}</span><span>{section}</span></div>
      </td></tr></thead>
      <tbody><tr><td>{children}</td></tr></tbody>
    </table>
  )
}

/** Entrada de las notas de evolución en el orden de la estancia. */
type Entry = { at: string; kind: 'consult' | 'note' | 'legacy'; note?: InpatientNote; title: string; legacy?: InpatientFile['procedures'][number] }

/**
 * Expediente completo de la hospitalización u observación, ordenado y dividido para leerlo o imprimirlo:
 * hoja de hospitalización, notas de evolución (una por página, con la de consulta, procedimientos y egreso
 * en su lugar), notas de enfermería de corrido, hoja de medicamentos, laboratorios y autorizaciones.
 */
export default function FullRecord() {
  const { id } = useParams()
  const { fetchInpatient, fetchConsultation, patient, staffById, settings, bed, notify } = useStore()
  const [file, setFile] = useState<InpatientFile | null>(null)
  const [consult, setConsult] = useState<{ consultation: Consultation; vitals: Vitals | null } | null>(null)
  useEffect(() => {
    if (!id) return
    fetchInpatient(id).then((f) => {
      setFile(f)
      if (f.hospitalization.consultationId) fetchConsultation(f.hospitalization.consultationId).then(setConsult).catch(() => null)
    }).catch((e: Error) => notify(e.message, 'error'))
  }, [id, fetchInpatient, fetchConsultation, notify])
  const p = file ? patient(file.hospitalization.patientId) : undefined
  if (!file || !p) return <Loading label="Armando el expediente" />
  const h = file.hospitalization
  const obs = h.kind === 'observation'
  const record = recordNumber(p, settings)
  const who = (sid?: string) => { const s = staffById(sid ?? ''); return s ? `${s.name}, ${ROLE_LABEL[s.role].toLowerCase()}` : '' }

  const entries: Entry[] = [
    ...(consult ? [{ at: consult.consultation.date, kind: 'consult' as const, title: 'Nota de ingreso (consulta externa)' }] : []),
    ...file.notes.filter((n) => n.kind !== 'nursing').map((n) => ({
      at: n.procedure?.performedAt ?? n.at, kind: 'note' as const, note: n,
      title: n.kind === 'admission' ? 'Nota de ingreso' : n.kind === 'evolution' ? 'Nota de evolución' : n.kind === 'procedure' ? 'Nota de procedimiento' : 'Nota de egreso',
    })),
    ...file.procedures.filter((x) => x.kind === 'procedure').map((x) => ({ at: x.createdAt, kind: 'legacy' as const, legacy: x, title: 'Procedimiento (registro anterior)' })),
  ].sort((a, b) => a.at.localeCompare(b.at))
  const nursing = file.notes.filter((n) => n.kind === 'nursing').sort((a, b) => a.at.localeCompare(b.at))
  const auths = file.authorizations
  const legacyAuths = file.procedures.filter((x) => x.kind === 'authorization')
  // La epicrisis vigente va al final; también es un documento aparte
  const epicrisis = currentEpicrisis(file)
  const sections: [string, string][] = [
    ['fr-hoja', obs ? 'Datos generales' : 'Hoja de hospitalización'],
    ['fr-notas', `Notas de evolución (${entries.length})`],
    ...(!obs ? [['fr-enfermeria', `Notas de enfermería (${nursing.length})`] as [string, string]] : []),
    ['fr-medicamentos', 'Hoja de medicamentos'],
    ['fr-laboratorios', `Laboratorios (${file.labs.length})`],
    ['fr-autorizaciones', `Anexos: autorizaciones (${auths.length + legacyAuths.length})`],
    ...(epicrisis ? [['fr-epicrisis', `Epicrisis${epicrisis.status === 'draft' ? ' (borrador sin emitir)' : ''}`] as [string, string]] : []),
  ]
  const page = (sid: string, section: string, children: ReactNode, continuous = false) => (
    <PrintPage key={sid} id={sid} section={section} p={p} record={record} clinic={settings.name} continuous={continuous}>{children}</PrintPage>
  )

  return (
    <div className="page fr">
      <div className="page-head no-print">
        <Link className="btn btn--ghost" to={stayPath(h)}><ChevronLeft size={16} />Volver al expediente</Link>
        <button className="btn btn--primary" onClick={() => window.print()}><Printer size={16} />Imprimir / Descargar PDF</button>
      </div>
      <nav className="panel fr-index no-print" aria-label="Índice del expediente">
        <div className="panel__head"><div><h2>Expediente completo de {fullName(p)}</h2><p>Al imprimir, cada sección y cada nota de evolución empieza en una hoja nueva. Para guardar el PDF, elige «Guardar como PDF» en la impresora.</p></div></div>
        <ol>{sections.map(([sid, label]) => <li key={sid}><a href={`#${sid}`}>{label}</a></li>)}</ol>
      </nav>

      <article className="fr-doc">
        {page('fr-hoja', sections[0][1], <>
          <div className="fr-title"><ClinicLogo settings={settings} size={20} /><div><b>{settings.name}</b><br /><small>{settings.address}{settings.phone ? `, tel. ${settings.phone}` : ''}</small></div></div>
          <h2 className="fr-h">{obs ? 'Observación: datos generales' : 'Hoja de hospitalización'}</h2>
          <dl className="fr-facts">
            <div><dt>Ingreso</dt><dd>{dm(h.admittedAt)}</dd></div>
            {!obs && <div><dt>Cuarto</dt><dd>{bedLabel(bed(h.bedId))}</dd></div>}
            {h.observationAt && <div><dt>En observación desde</dt><dd>{dm(h.observationAt)}</dd></div>}
            <div><dt>{obs ? 'Médico' : 'Ingresado por'}</dt><dd>{staffById(h.admittedBy)?.name}</dd></div>
            <div><dt>Procedencia</dt><dd>{h.consultationId ? 'Consulta externa' : 'Emergencia o ingreso directo'}</dd></div>
            {h.dischargedAt && <div><dt>Egreso</dt><dd>{dm(h.dischargedAt)}{h.dischargedBy ? `, ${staffById(h.dischargedBy)?.name}` : ''}</dd></div>}
            {!obs && <div><dt>Acompañante</dt><dd>{h.companionName ? `${h.companionName}${h.companionRelation ? ` (${h.companionRelation})` : ''}${h.companionPhone ? `, ${h.companionPhone}` : ''}` : 'Sin dato'}</dd></div>}
            <div className="fr-wide"><dt>Motivo del ingreso</dt><dd>{h.reason}</dd></div>
            <div className="fr-wide"><dt>Diagnósticos de ingreso</dt><dd>{h.diagnoses.map((d) => `${d.label} (${dxCode(d)})`).join('; ')}</dd></div>
          </dl>
          <h3 className="fr-h3">Ficha de identificación</h3>
          <Identification p={p} />
          <p className="fr-allergy">Alergias: <b>{p.allergies.length ? p.allergies.join(', ') : 'Sin alergias conocidas'}</b>. Tipo de sangre: {p.bloodType ?? 'sin dato'}.</p>
        </>)}

        {entries.length ? entries.map((e, i) => page(i === 0 ? 'fr-notas' : `fr-nota-${i}`, `Notas de evolución · ${i + 1} de ${entries.length}`, <>
          <div className="fr-note-head"><h2 className="fr-h">{e.title}</h2>
            <span>{e.kind === 'consult' && consult ? `${staffById(consult.consultation.doctorId)?.name} · ${dm(consult.consultation.date)}` : e.note ? `${who(e.note.authorId)} · ${dm(e.note.at)}` : e.legacy ? `${staffById(e.legacy.createdBy)?.name} · ${dm(e.legacy.createdAt)}` : ''}</span></div>
          {e.kind === 'consult' && consult && <ConsultationBody c={consult.consultation} vitals={consult.vitals} />}
          {e.legacy && <div className="note"><p><b>{e.legacy.name}</b></p>{e.legacy.notes && <p>{e.legacy.notes}</p>}</div>}
          {e.note && <NoteBody n={e.note} file={file} />}
        </>)) : page('fr-notas', 'Notas de evolución', <p className="muted">Sin notas de evolución.</p>)}

        {!obs && page('fr-enfermeria', 'Notas de enfermería', <>
          <h2 className="fr-h">Notas de enfermería</h2>
          {nursing.length ? nursing.map((n) => (
            <div key={n.id} className="fr-nursing"><b>{dm(n.at)} · {shortStaff(staffById(n.authorId)?.name)}</b><p>{n.text}</p></div>
          )) : <p className="muted">Sin notas de enfermería.</p>}
        </>, true)}

        {page('fr-medicamentos', 'Hoja de medicamentos', <>
          <h2 className="fr-h">Hoja de medicamentos</h2>
          {file.meds.length ? (
            <table className="fr-meds">
              <thead><tr><th>Medicamento</th><th>Indicó</th><th>Dosis registradas</th></tr></thead>
              <tbody>{file.meds.map((m) => {
                const doses = file.doses.filter((d) => d.medId === m.id).sort((a, b) => a.givenAt.localeCompare(b.givenAt))
                return (
                  <tr key={m.id}>
                    <td><b>{medLabel(m)}</b>{m.presentation ? <><br /><small>{m.presentation}</small></> : null}{m.instructions ? <><br /><small>{m.instructions}</small></> : null}
                      {m.stoppedAt && <><br /><small>Omitido {dm(m.stoppedAt)}</small></>}</td>
                    <td><small>{shortStaff(staffById(m.orderedBy)?.name)}<br />{dm(m.orderedAt)}</small></td>
                    <td>{doses.length ? <ul className="fr-doses">{doses.map((d) => (
                      <li key={d.id}>{d.status === 'given' ? '✓' : '✗'} {dm(d.givenAt)} {who(d.givenBy)}{d.scheduledAt ? '' : ' (PRN)'}{d.note ? `: ${d.note}` : ''}</li>
                    ))}</ul> : <small className="muted">Sin dosis registradas</small>}</td>
                  </tr>
                )
              })}</tbody>
            </table>
          ) : <p className="muted">Sin medicamentos indicados.</p>}
        </>, true)}

        {page('fr-laboratorios', 'Laboratorios', <>
          <h2 className="fr-h">Laboratorios</h2>
          {file.labs.length ? file.labs.map((l) => (
            <div key={l.id} className="fr-lab">
              <b>{l.title || l.name}</b> · tomado {dm(l.takenAt ?? l.uploadedAt)} · subido por {staffById(l.uploadedBy)?.name}
              {l.mime.startsWith('image/') ? <img src={`/api/attachments/${l.id}`} alt={l.title || l.name} /> : <p className="muted">Documento PDF en el expediente electrónico ({l.name}).</p>}
            </div>
          )) : <p className="muted">Sin resultados de laboratorio.</p>}
        </>, true)}

        {page('fr-autorizaciones', 'Autorizaciones (anexos)', <>
          <h2 className="fr-h">Autorizaciones (anexos)</h2>
          {auths.length || legacyAuths.length ? <>
            {auths.map((a) => (
              <div key={a.id} className="fr-lab">
                <b>{authTitle(a)}</b> · {authStatus(a).label}{a.statusAt ? ` ${dm(a.statusAt)}` : ''} · generada {dm(a.createdAt)} por {staffById(a.createdBy)?.name}
                {a.statusNote && <p>{a.statusNote}</p>}
                {a.pdfSha256 && <p className="muted" style={{ fontSize: 11 }}>Huella SHA-256 del PDF firmado: {a.pdfSha256}</p>}
                {/* La versión que corresponde: el PDF firmado en pantalla o el escaneo de la hoja de papel */}
                {a.pdfId || a.fileId ? <PdfPages fileId={(a.pdfId ?? a.fileId)!} label={a.pdfId ? 'La autorización firmada' : 'La hoja firmada escaneada'} />
                  : <p className="muted">{a.status === 'pending' ? 'Pendiente de firma.' : 'Sin hoja firmada.'}</p>}
                {a.revocation && <p>Revocada {a.revocation.method === 'virtual' ? 'en pantalla' : 'en papel'} {dm(a.revocation.at)}.</p>}
                {(a.revocation?.pdfId ?? a.revocation?.fileId) && <PdfPages fileId={(a.revocation!.pdfId ?? a.revocation!.fileId)!} label="La revocación firmada" />}
              </div>
            ))}
            {legacyAuths.map((x) => <div key={x.id} className="fr-lab"><b>{x.name}</b> · registro anterior, {dm(x.createdAt)}{x.notes ? `. ${x.notes}` : ''}</div>)}
          </> : <p className="muted">Sin autorizaciones registradas.</p>}
        </>, true)}

        {file.referrals.map((r, i) => page(`fr-referencia-${i}`, `Anexos: referencia ${r.number}`, <ReferralSheet r={r} />))}

        {epicrisis && page('fr-epicrisis', 'Epicrisis', <EpicrisisSheet e={epicrisis} />)}
      </article>
    </div>
  )
}

/** Contenido de una nota: SOAP y órdenes en dos columnas con las marcas de enfermería, procedimiento o egreso. */
function NoteBody({ n, file }: { n: InpatientNote; file: InpatientFile }) {
  const { staffById } = useStore()
  if (n.kind === 'procedure' && n.procedure) {
    return <div className="note">
      <p><b>{n.procedure.name}</b>. Procedimiento: {dm(n.procedure.performedAt)} · Nota escrita: {dm(n.at)}</p>
      <p style={{ whiteSpace: 'pre-wrap' }}>{n.text}</p>
      {n.procedure.urgent && <p><b>Urgencia, sin autorización previa:</b> {n.procedure.justification}</p>}
      {n.procedure.authorizationId && <p>Autorización firmada vinculada.</p>}
    </div>
  }
  if (n.kind === 'discharge' && n.discharge) {
    const d = n.discharge
    return <div className="note">
      <div className="note__sec"><h4>Resumen</h4><p>{d.summary}</p></div>
      <div className="note__sec"><h4>Diagnóstico de egreso</h4><p>{d.diagnoses.map((x) => `${x.label} (${dxCode(x)})`).join('; ')}</p></div>
      <div className="note__sec"><h4>Condición al egreso</h4><p>{d.condition}</p></div>
      {d.instructions && <div className="note__sec"><h4>Indicaciones</h4><p>{d.instructions}</p></div>}
      {d.followUp && <div className="note__sec"><h4>Seguimiento</h4><p>{d.followUp}</p></div>}
    </div>
  }
  // Como en pantalla: los medicamentos con la nota y las indicaciones a la derecha
  const { meds, indications } = splitOrders(n, file)
  const list = (orders: { text: string; index: number }[], empty: string, dash = false) => orders.length ? <ol className="order-check">{orders.map(({ text, index }, pos) => {
    const mark = n.checklist ? orderMark(file.marks, n.id, index) : undefined
    return <li key={index} className={mark?.action === 'check' ? 'is-checked' : ''}><span className="orders__n">{dash ? '–' : `${pos + 1}.`}</span>
      <span className="order-check__text"><span className="order-check__order">{text}</span>
        {mark?.action === 'check' && <small className="order-check__mark">✓ {shortStaff(staffById(mark.by)?.name)} {dm(mark.at)}</small>}</span></li>
  })}</ol> : <p className="muted">{empty}</p>
  return <NoteColumns left={<NoteText n={n} />} indications={list(indications, 'Sin indicaciones.')} meds={list(meds, 'Sin medicamentos.', true)} />
}
