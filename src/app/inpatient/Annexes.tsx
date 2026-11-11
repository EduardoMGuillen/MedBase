import { useState } from 'react'
import { FileSignature, Pill } from 'lucide-react'
import { useStore } from '../../lib/store'
import { dateTime } from '../../lib/format'
import { AuthorizationEntry, AuthorizationForm } from '../Authorization'
import type { InpatientFile as File, InpatientMed, Patient } from '../../lib/types'
import { ConsentChoice } from '../ConsentFlow'
import { ReferralActions } from '../Referral'
import { DischargeDocuments } from '../Epicrisis'
import { GenerateRxModal, RxAnnex } from '../../components/GenerateRx'
import { AnesthesiaAnnex } from '../../components/AnesthesiaSheet'
import { PreEvalAnnex } from '../../components/PreEval'
import { SurgicalCountAnnex } from '../../components/SurgicalCount'

// Expediente de la estancia: anexos (autorizaciones, recetas, documentos quirúrgicos y archivos).
/**
 * Anexos del expediente: la autorización de hospitalización de la estancia y las quirúrgicas, con su estado
 * (pendiente de firma, firmada, rechazada o revocada) y la hoja firmada. Las generan enfermería o el médico.
 */
export function Annexes({ file, p, reload }: { file: File; p: Patient; reload: () => void }) {
  const { can, staffById } = useStore()
  const [making, setMaking] = useState<null | 'hospital' | 'surgical'>(null)
  const [choiceFor, setChoiceFor] = useState<string | null>(null)
  const open = file.hospitalization.status === 'active'
  const write = open && (can('inpatient.orders') || can('inpatient.care'))
  const hospital = file.authorizations.find((a) => a.template === 'hospital' && (a.status === 'pending' || a.status === 'signed'))
  const legacy = file.procedures.filter((x) => x.kind === 'authorization')
  const list = [...file.authorizations].sort((a, b) => Number(b.template === 'hospital') - Number(a.template === 'hospital') || a.createdAt.localeCompare(b.createdAt))
  return (
    <div className="hc">
      {/* ME12 (ronda 11): «Generar receta» y «Recetas emitidas» */}
      {/* ME14 (ronda 14): también lo que la consulta de ingreso mandó a la receta (no está en la hoja), sin repetidos */}
      <RxAnnex patientId={p.id} stayId={file.hospitalization.id} meds={[...file.meds, ...(file.consultRxMeds ?? [])]} />
      {write && (
        <section className="panel">
          <div className="panel__body" style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <p className="muted">Se firman en pantalla (tablet, celular o computadora) o se imprimen, se firman en papel y se sube la foto o el PDF de la hoja firmada.</p>
            <div className="hstack">
              {file.hospitalization.kind === 'hospital' && <button className="btn btn--soft" onClick={() => setMaking('hospital')}><FileSignature size={16} />Autorización de hospitalización{hospital?.status === 'pending' ? ' (pendiente)' : ''}</button>}
              <button className="btn btn--primary" onClick={() => setMaking('surgical')}><FileSignature size={16} />Autorización quirúrgica</button>
            </div>
          </div>
        </section>
      )}
      {making && <AuthorizationForm file={file} p={p} template={making} onClose={() => setMaking(null)} onCreated={(a) => { setMaking(null); setChoiceFor(a.id) }} />}
      {choiceFor && <ConsentChoice authorizationId={choiceFor} p={p} onDone={() => { setChoiceFor(null); reload() }} />}
      <DischargeDocuments file={file} />
      {/* PQ3 (ronda 14): hojas de anestesia de la estancia e «Imprimir hoja de anestesia en blanco» */}
      {/* PQ4 y PQ5 (ronda 16): valoración preanestésica (de la estancia) y recuento quirúrgico */}
      <PreEvalAnnex stayId={file.hospitalization.id} />
      <AnesthesiaAnnex stayId={file.hospitalization.id} />
      <SurgicalCountAnnex stayId={file.hospitalization.id} />
      {file.referrals.map((r) => (
        <article key={r.id} className="panel consult-entry">
          <div className="panel__head"><div><h2>Referencia {r.number} {r.voidedAt ? <span className="badge badge--red">Anulada</span> : <span className="badge badge--mint">Firmada</span>}</h2>
            <p>{dateTime(r.issuedAt)}, {staffById(r.issuedBy)?.name}{r.destination ? ` · a ${r.destination}` : ''}</p></div>
            <ReferralActions r={r} /></div>
        </article>
      ))}
      {list.map((a) => <AuthorizationEntry key={a.id} a={a} file={file} p={p} reload={reload} />)}
      {legacy.map((x) => (
        <article key={x.id} className="panel consult-entry">
          <div className="panel__head"><div><h2>Autorización <span className="badge">Registro anterior</span></h2>
            <p>{dateTime(x.createdAt)}, {staffById(x.createdBy)?.name}</p></div></div>
          <div className="panel__body"><p><b>{x.name}</b></p>{x.notes && <p>{x.notes}</p>}</div>
        </article>
      ))}
      {!list.length && !legacy.length && !file.referrals.length && !file.epicrises.length && <section className="panel"><div className="empty">Sin autorizaciones todavía.</div></section>}
    </div>
  )
}

// ---------- Laboratorios ----------

// ---------- Egreso ----------


/**
 * ME10 (ronda 10), ME12 (ronda 11) y ME14 (ronda 14): «Receta» en la tarjeta de cada nota con medicamentos (consulta de
 * ingreso, evolución, procedimiento, postquirúrgica). Abre «Generar receta» (ME12) con los medicamentos DE ESA NOTA: vienen
 * marcados los que van a receta (los de la consulta que no se aplican en la clínica) y los «No hay en la clínica». Enfermería,
 * como en ME12: solo los «No hay en la clínica», con los datos del médico que los indicó.
 * ME15 (ronda 15, A3): en la nota de consulta (`all`) vienen marcados TODOS sus medicamentos; las demás notas, como ME14.
 */
export function RxFromNote({ meds, all = false }: { meds: InpatientMed[]; all?: boolean }) {
  const { can } = useStore()
  const [open, setOpen] = useState(false)
  if (!(can('chart.view') && (can('inpatient.care') || can('inpatient.orders')))) return null
  const live = meds.filter((m) => !m.stoppedAt)
  const doctor = can('inpatient.orders')
  if (!live.length || (!doctor && !live.some((m) => m.buyOutside))) return null
  const forRx = live.filter((m) => (all && doctor) || m.id.startsWith('c:') || m.buyOutside).map((m) => m.id)
  return (
    <span className="note-actions no-print">
      <button type="button" className={`btn ${forRx.length ? 'btn--soft' : 'btn--ghost'} btn--sm`} onClick={() => setOpen(true)}><Pill size={14} />Receta</button>
      {open && <GenerateRxModal meds={live} only={forRx} onClose={() => setOpen(false)} />}
    </span>
  )
}
