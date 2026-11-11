import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../../lib/store'
import { date, time } from '../../lib/format'
import { mainRole, ROLE_LABEL } from '../../lib/permissions'
import type { InpatientFile as File } from '../../lib/types'
import { Addenda, SignedBadge } from '../../components/Addenda'
import { ConsultationBody } from '../PatientChart'
import { vitalsModeText } from '../../lib/vitalsSheet'
import { fluidsOrderText } from '../../lib/fluids'
import { RxFromNote } from './Annexes'

// Expediente de la estancia: la consulta externa que originó el ingreso.
/** La nota de consulta externa que originó la estancia es la primera nota de evolución. */
export function ConsultEntry({ consultationId, file }: { consultationId: string; file: File }) {
  const { fetchConsultation, staffById, can, user } = useStore()
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchConsultation>> | null>(null)
  const load = useCallback(() => { fetchConsultation(consultationId).then(setData).catch(() => null) }, [consultationId, fetchConsultation])
  useEffect(load, [load])
  if (!data) return <section className="panel"><div className="empty">Cargando la nota de consulta…</div></section>
  const c = data.consultation
  const author = staffById(c.doctorId)
  return (
    <article className="panel consult-entry">
      <div className="panel__head">
        <div><h2>Nota de ingreso <span className="badge badge--ink">Consulta externa</span></h2>
          <p>{author?.name}{author ? `, ${ROLE_LABEL[mainRole(author)].toLowerCase()}` : ''} · {date(c.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, {time(c.date)}</p></div>
        <Link className="btn btn--ghost btn--sm" to={`/app/nota/${c.id}`}>Ver nota completa</Link>
      </div>
      <div className="panel__body"><ConsultationBody c={c} vitals={data.vitals} exams={data.exams ?? []} vitalsLine={(() => { const s = file.hospitalization.vitalsPlan?.find((x) => x.noteId === c.id); return s ? vitalsModeText(s) : undefined })()}
        fluidsLine={(() => { const s = file.hospitalization.fluidsPlan?.find((x) => x.noteId === c.id); return s ? fluidsOrderText(s.mode) : undefined })()}
        medsExtra={<RxFromNote all meds={[...file.meds.filter((m) => m.source === 'consultation' && m.sourceId === c.id), ...(file.consultRxMeds ?? [])]} />} />
        <SignedBadge by={author?.name} at={c.date} addenda={(data.addenda ?? []).length} />
        <Addenda list={data.addenda ?? []} targetKind="consultation" targetId={c.id} canAdd={can('consult.write') && user?.role === 'doctor'} prescriptionId={c.prescriptionId} onAdded={load} /></div>
    </article>
  )
}

// ---------- Hoja de medicamentos ----------
