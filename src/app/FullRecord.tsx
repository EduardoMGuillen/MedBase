import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, Printer } from 'lucide-react'
import { useStore } from '../lib/store'
import { Loading } from '../components/ui'
import { LogoMark } from '../components/Logo'
import { date, dateTime, fullName, time } from '../lib/format'
import { medLabel, noteOrders } from '../lib/inpatient'
import type { InpatientFile } from '../lib/types'
import { BackgroundView, ConsultationBody, Identification, useChart } from './PatientChart'
import { bedLabel } from './Inpatients'

const SOAP = [
  ['subjective', 'S. Subjetivo'],
  ['objective', 'O. Objetivo'],
  ['assessment', 'A. Análisis'],
  ['plan', 'P. Plan'],
] as const

/** Expediente de la hospitalización, de corrido, para leerlo o imprimirlo al egreso. */
export default function FullRecord() {
  const { id } = useParams()
  const { fetchInpatient, patient, staffById, settings, bed, notify } = useStore()
  const [file, setFile] = useState<InpatientFile | null>(null)
  useEffect(() => {
    if (!id) return
    fetchInpatient(id).then(setFile).catch((e: Error) => notify(e.message, 'error'))
  }, [id, fetchInpatient, notify])
  const p = file ? patient(file.hospitalization.patientId) : undefined
  const { chart } = useChart(p?.id, !!p)
  if (!file || !p) return <Loading label="Armando el expediente" />
  const h = file.hospitalization
  const b = bed(h.bedId)
  const notes = [...file.notes].sort((a, c) => a.at.localeCompare(c.at))
  const procedures = [...file.procedures].sort((a, c) => a.createdAt.localeCompare(c.createdAt))

  return (
    <div className="page">
      <div className="page-head no-print">
        <Link className="btn btn--ghost" to={`/app/hospitalizados/${h.id}`}><ChevronLeft size={16} />Volver a la hospitalización</Link>
        <button className="btn btn--primary" onClick={() => window.print()}><Printer size={16} />Imprimir expediente</button>
      </div>
      <article className="rx-sheet clinical-note">
        <header className="rx-sheet__head">
          <div className="rx-sheet__doc">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}><LogoMark size={24} /><b>{settings.name}</b></div>
            <p>{settings.address}{settings.phone ? `, tel. ${settings.phone}` : ''}</p>
          </div>
          <div className="rx-sheet__folio">Expediente clínico<b>{fullName(p)}</b>Exp. {p.record}</div>
        </header>

        <h3 className="cn__h">I. Ficha de identificación</h3>
        <Identification p={p} />
        <h3 className="cn__h">II. Alergias y antecedentes</h3>
        <p>{p.allergies.length ? p.allergies.join(', ') : 'Sin alergias conocidas.'} Tipo de sangre: {p.bloodType ?? 'sin dato'}.</p>
        <BackgroundView p={p} compact />

        {chart && chart.consultations.length > 0 && (<>
          <h3 className="cn__h">III. Consultas externas</h3>
          {[...chart.consultations].sort((a, b) => a.date.localeCompare(b.date)).map((c) => (
            <section key={c.id}>
              <p className="cn__when">{date(c.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, {time(c.date)}. {staffById(c.doctorId)?.name}.</p>
              <ConsultationBody c={c} vitals={chart.vitals.find((v) => v.id === c.vitalsId)} />
            </section>
          ))}
        </>)}

        <h3 className="cn__h">{chart?.consultations.length ? 'IV' : 'III'}. Hospitalización</h3>
        <p className="cn__when">Ingresó {dateTime(h.admittedAt)}, {bedLabel(b)}. {staffById(h.admittedBy)?.name}. Motivo: {h.reason}</p>
        <p>Diagnósticos: {h.diagnoses.map((d) => `${d.label} (${d.code})`).join('; ')}.</p>
        {h.dischargedAt && <p>Egresó {dateTime(h.dischargedAt)}{h.dischargedBy ? `, ${staffById(h.dischargedBy)?.name}` : ''}.</p>}

        {notes.map((n) => (
          <section key={n.id}>
            <p className="cn__when">
              {n.kind === 'admission' ? 'Nota de ingreso' : n.kind === 'evolution' ? 'Nota de evolución' : n.kind === 'nursing' ? 'Nota de enfermería' : n.kind === 'procedure' ? `Nota de procedimiento: ${n.procedure?.name}` : 'Nota de egreso'}
              {' · '}{dateTime(n.at)} · {staffById(n.authorId)?.name}
            </p>
            {n.kind === 'nursing' ? <p>{n.text}</p> : n.kind === 'procedure' ? <p>Procedimiento: {n.procedure && dateTime(n.procedure.performedAt)}. {n.text}</p> : n.kind === 'discharge' && n.discharge ? (
              <div className="note">
                <div className="note__sec"><h4>Resumen</h4><p>{n.discharge.summary}</p></div>
                <div className="note__sec"><h4>Diagnóstico de egreso</h4><p>{n.discharge.diagnoses.map((d) => d.label).join('; ')}</p></div>
                <div className="note__sec"><h4>Condición</h4><p>{n.discharge.condition}</p></div>
                {n.discharge.instructions && <div className="note__sec"><h4>Indicaciones</h4><p>{n.discharge.instructions}</p></div>}
                {n.discharge.followUp && <div className="note__sec"><h4>Seguimiento</h4><p>{n.discharge.followUp}</p></div>}
              </div>
            ) : (
              <div className="note">
                {SOAP.map(([k, label]) => n[k] ? <div key={k} className="note__sec"><h4>{label}</h4><p>{n[k]}</p></div> : null)}
                {noteOrders(n, file).length > 0 && (
                  <div className="note__sec"><h4>Órdenes y manejo</h4>
                    <ol className="note__list">{noteOrders(n, file).map((o, i) => <li key={i}>{o}</li>)}</ol>
                  </div>
                )}
              </div>
            )}
          </section>
        ))}

        {procedures.length > 0 && (<>
          <h3 className="cn__h">Procedimientos</h3>
          <ul className="note__list">{procedures.map((x) => (
            <li key={x.id}>{dateTime(x.createdAt)}. {x.name}{x.notes ? `. ${x.notes}` : ''}</li>
          ))}</ul>
        </>)}

        {file.meds.length > 0 && (<>
          <h3 className="cn__h">Medicamentos y cumplimiento</h3>
          <ul className="note__list">{file.meds.map((m) => {
            const doses = file.doses.filter((d) => d.medId === m.id)
            const given = doses.filter((d) => d.status === 'given').length
            const skipped = doses.filter((d) => d.status === 'skipped').length
            return <li key={m.id}>{medLabel(m)}{m.stoppedAt ? ' (omitido)' : ''}. Administradas: {given}. No administradas: {skipped}.</li>
          })}</ul>
        </>)}

        {file.labs.length > 0 && (<>
          <h3 className="cn__h">Laboratorios</h3>
          <ul className="note__list">{file.labs.map((l) => <li key={l.id}>{l.takenAt ? dateTime(l.takenAt) : dateTime(l.uploadedAt)}. {l.title || l.name}</li>)}</ul>
        </>)}

        <footer className="rx-sheet__foot"><span>Documento del expediente clínico. Confidencial.</span><span>Emitido con Clinara</span></footer>
      </article>
    </div>
  )
}
