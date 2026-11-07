import { useCallback, useEffect, useState } from 'react'
import { Addenda, SignedBadge } from '../components/Addenda'
import { Link, useParams } from 'react-router-dom'
import { FileBadge, Printer, Send } from 'lucide-react'
import { ReferralModal } from './Referral'
import { useStore } from '../lib/store'
import { Loading, BackButton, PageHead } from '../components/ui'
import { ClinicalDoc, guardianRow, patientOf, placeOf, signerOfStaff } from '../components/ClinicalDoc'
import { date, time } from '../lib/format'
import { BackgroundView, ConsultationBody, Identification } from './PatientChart'
import { ConsultCorrection } from './ConsultCorrection'
import { GraceButton, VersionTag } from '../components/Grace'
import type { Consultation } from '../lib/types'

/** Nota de consulta imprimible con el orden de la historia clínica. */
export default function ConsultNote() {
  const { id } = useParams()
  const { fetchConsultation, staffById, settings, notify, can, user } = useStore()
  const [referring, setReferring] = useState(false)
  const [correcting, setCorrecting] = useState(false)
  const [toAddendum, setToAddendum] = useState<string | undefined>()
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchConsultation>> | null>(null)
  const load = useCallback(() => { if (id) fetchConsultation(id).then(setData).catch((e: Error) => notify(e.message, 'error')) }, [id, fetchConsultation, notify])
  useEffect(load, [load])
  if (!data) return <Loading label="Preparando la nota" />
  const { consultation: c, patient: p, vitals } = data
  const doc = staffById(c.doctorId)!

  return (
    <div className="page">
      <PageHead noPrint back={<BackButton to={`/app/pacientes/${p.id}`}>Expediente de {p.firstName}</BackButton>} actions={<>
          {can('consult.write') && <Link className="btn btn--ghost" data-tour="constancia" to={`/app/constancia/${c.id}`}><FileBadge size={16} />Generar constancia</Link>}
          {/* Ronda 8: referencia a otro centro desde la consulta externa */}
          {can('consult.write') && user?.role === 'doctor' && <button className="btn btn--ghost" onClick={() => setReferring(true)}><Send size={16} />Referir a otro centro</button>}
          {(data.referrals ?? []).map((r) => <Link key={r.id} className="btn btn--soft" to={`/app/referencias/${r.id}`}><Send size={16} />{r.number}{r.voidedAt ? ' (anulada)' : ''}</Link>)}
          <button className="btn btn--primary" onClick={() => window.print()}><Printer size={16} />Imprimir nota</button>
      </>} />
      {/* IM1 (ronda 13): la plantilla única */}
      <div data-tour="nota-consulta">
      <ClinicalDoc kind="Nota de consulta" at={c.date} place={placeOf(settings)} patient={patientOf(p, settings)} rows={[guardianRow(p)]} className="clinical-note"
        signers={[signerOfStaff(doc)]} legends={['Documento del expediente clínico. Confidencial.']} brand="Emitido con Clinara">
        <p className="cn__when">{date(c.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, {time(c.date)}. Atendió {doc.name}, {doc.specialty?.toLowerCase()}, colegiación {doc.license}.</p>

        <h3 className="cn__h">I. Ficha de identificación</h3>
        <Identification p={p} />
        <h3 className="cn__h">II. Alergias</h3>
        <p>{p.allergies.length ? p.allergies.join(', ') : 'Sin alergias conocidas.'} Tipo de sangre: {p.bloodType ?? 'sin dato'}.</p>
        <h3 className="cn__h">III. Antecedentes</h3>
        <BackgroundView p={p} compact />
        <h3 className="cn__h">IV. Consulta</h3>
        <ConsultationBody c={c} vitals={vitals} exams={data.exams ?? []} applications={data.applications} />
        <div className="signed-row">
          <SignedBadge by={doc.name} at={c.date} addenda={(data.addenda ?? []).length} />
          {/* GE4 (ronda 9): periodo de gracia y versiones */}
          <VersionTag version={c.version} kind="consultation" id={c.id} render={(x) => <ConsultationBody c={{ ...c, reason: String(x.reason ?? ''), history: String(x.history ?? ''), exam: String(x.exam ?? ''), observations: x.observations ? String(x.observations) : undefined, diagnoses: (x.diagnoses ?? []) as Consultation['diagnoses'] }} />} />
          <span className="no-print"><GraceButton record={c} authorId={c.doctorId} onCorrect={() => setCorrecting(true)} /></span>
        </div>
        <Addenda list={data.addenda ?? []} targetKind="consultation" targetId={c.id} canAdd={can('consult.write') && user?.role === 'doctor'} prescriptionId={c.prescriptionId} onAdded={load} openWith={toAddendum} />

      </ClinicalDoc>
      </div>
      {correcting && <ConsultCorrection c={c} p={p} onClose={() => setCorrecting(false)} onSaved={() => { setCorrecting(false); load() }} onExpired={(t) => { setCorrecting(false); setToAddendum(t) }} />}
      {referring && <ReferralModal from={{ kind: 'consultation', id: c.id }} onClose={() => setReferring(false)} />}
    </div>
  )
}
